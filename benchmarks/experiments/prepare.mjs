// Isolated, reproducible compiled-runtime experiments. Never edits src/ or package dist/.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = resolve(root, "benchmarks/results/experiments/runtimes");
const frameworks = ["express", "koa", "leizmweb", "h3"];
const adapterFile = (framework) => `packages/erest-${framework}/dist/index.js`;
const hash = (source) => createHash("sha256").update(source).digest("hex");
const baseline = Object.fromEntries(
  ["dist/lib/api.js", "dist/lib/adapters/utils.js", "dist/lib/params.js", ...frameworks.map(adapterFile)]
    .map((name) => [name, hash(readFileSync(resolve(root, name)))])
);
const variants = {};

function replace(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `Patch must match exactly once: ${before}`);
  return source.replace(before, after);
}

const changes = {
  "node-headers": {
    frameworks: ["h3"],
    description: "Node-only diagnostic: copy IncomingMessage headers instead of converting Web Headers.",
    caveat: "Not portable; raw array/duplicate-header normalization and mutations to Web Headers can differ. This is an attribution experiment, not a shippable replacement.",
    patch(file, source) {
      if (file !== adapterFile("h3")) return source;
      return replace(source, "headers: Object.fromEntries(event.req.headers),", "headers: event.runtime?.node?.req ? { ...event.runtime.node.req.headers } : Object.fromEntries(event.req.headers),");
    },
  },
  reply: {
    frameworks,
    description: "Use per-request Reply instances with shared prototype methods instead of four per-request method closures.",
    caveat: "Prototype/enumerability and detached method calls differ. Requires a compatibility decision and broad Reply tests before shipping.",
    patch(file, source) {
      const framework = frameworks.find((name) => adapterFile(name) === file);
      if (!framework) return source;
      const definitions = {
        express: { factory: "createExpressReply", args: "req, res", raw: "{ req, res }", target: "res",
          status: "this.#target.status?.(code);",
          json: "this.__sent = true; this.#target.json?.(body);",
          send: "this.__sent = true; this.#target.end?.(body);" },
        koa: { factory: "createKoaReply", args: "ctx", raw: "ctx", target: "ctx",
          status: "this.#target.status = code;",
          json: 'this.__sent = true; this.#target.type = "application/json"; this.#target.body = JSON.stringify(body);',
          send: "this.__sent = true; this.#target.body = body;" },
        leizmweb: { factory: "createLeiReply", args: "ctx", raw: "ctx", target: "ctx.response ?? {}",
          status: "this.#target.status?.(code);",
          json: "this.__sent = true; this.#target.json?.(body);",
          send: 'this.__sent = true; this.#target.setHeader?.("Content-Type", "text/plain; charset=utf-8"); this.#target.end?.(body);' },
        h3: { factory: "createH3Reply", args: "event", raw: "event", target: "event",
          status: "this.#target.res.status = code;",
          json: 'this.body = JSON.stringify(body) ?? ""; this.#target.res.headers.set("content-type", "application/json; charset=utf-8"); this.__sent = true;',
          send: 'this.body = body; this.#target.res.headers.set("content-type", "text/plain; charset=utf-8"); this.__sent = true;' },
      };
      const d = definitions[framework];
      const start = source.indexOf(`function ${d.factory}(`);
      const end = source.indexOf("\nexport const ", start);
      assert(start >= 0 && end > start, "Reply factory boundaries not found");
      const implementation = `class SharedReply {
        #target;
        __sent = false;
        constructor(raw, target) { this.raw = raw; this.#target = target; }
        status(code) { ${d.status} return this; }
        json(body) { ${d.json} }
        send(body) { ${d.send} }
        markSent() { this.__sent = true; }
      }
      function ${d.factory}(${d.args}) { return new SharedReply(${d.raw}, ${d.target}); }
`;
      return source.slice(0, start) + implementation + source.slice(end);
    },
  },
  hoist: {
    frameworks: frameworks.slice(0, 3),
    description: "Capture compiled schemas, requiredOneOf and onValidate at bind time; validate ctx directly.",
    caveat: "Must retain existing hook binding semantics and all layered/requiredOneOf behavior.",
    patch(file, source) {
      if (!frameworks.slice(0, 3).map(adapterFile).includes(file)) return source;
      source = replace(source,
        "const checker = (ctx, next) => {\n            const compiled = api.options.compiled;",
        "const compiled = api.options.compiled;\n        const requiredOneOf = api.options.requiredOneOf;\n        const onValidate = erest.getHooks()?.onValidate;\n        const checker = (ctx, next) => {");
      source = replace(source,
        "compiled.validate({\n                params: ctx.params,\n                query: ctx.query,\n                body: ctx.body,\n                headers: ctx.headers,\n            })",
        "compiled.validate(ctx)");
      source = replace(source, "            const requiredOneOf = api.options.requiredOneOf;\n", "");
      return replace(source, "            const onValidate = erest.getHooks()?.onValidate;\n", "");
    },
  },
  assign: {
    frameworks,
    description: "Replace four object spreads for flat params with Object.assign.",
    caveat: "Diagnostic only: Object.assign treats an own __proto__ key differently; not safe to ship unchanged.",
    patch(file, source) {
      if (!frameworks.map(adapterFile).includes(file)) return source;
      const before = "{ ...layered.params, ...layered.query, ...layered.body, ...layered.headers }";
      assert.ok(source.includes(before));
      return source.replaceAll(before, "Object.assign({}, layered.params, layered.query, layered.body, layered.headers)");
    },
  },
  sync: {
    frameworks,
    description: "Avoid unconditional async typed-handler wrapper; resolve async results via a shared finish callback.",
    caveat: "Check rejection, response schemas, envelope return bookkeeping and async onion middleware before shipping.",
    patch(file, source) {
      if (file !== "dist/lib/api.js") return source;
      source = replace(source, "const wrappedHandler = async (ctx) => {", "const wrappedHandler = (ctx) => {");
      source = replace(source, "const resolved = result instanceof Promise ? await result : result;", "const finish = (resolved) => {");
      return replace(source,
        "ctxExt.__returnValue = resolved;\n        };",
        "ctxExt.__returnValue = resolved;\n            };\n            if (result instanceof Promise) return result.then(finish);\n            finish(result);\n        };");
    },
  },
  headers: {
    frameworks: ["h3"],
    description: "Lazily materialize H3 ctx.headers on first access, cache the object and keep a setter.",
    caveat: "Header snapshot timing/property descriptors differ; reject as a drop-in optimization without an API decision.",
    patch(file, source) {
      if (file !== adapterFile("h3")) return source;
      return replace(source, "headers: Object.fromEntries(event.req.headers),", `get headers() {
                    const value = Object.fromEntries(event.req.headers);
                    Object.defineProperty(this, "headers", { value, writable: true, enumerable: true, configurable: true });
                    return value;
                },
                set headers(value) {
                    Object.defineProperty(this, "headers", { value, writable: true, enumerable: true, configurable: true });
                },`);
    },
  },
};

// A combined variant is generated only when explicitly requested after screening.
const definitions = { ...Object.fromEntries(Object.entries(changes).map(([name, change]) => [name, [name]])) };
if (process.env.BENCH_COMBINE) definitions.combined = process.env.BENCH_COMBINE.split(",");

for (const [name, patches] of Object.entries(definitions)) {
  assert(patches.every((patch) => changes[patch]), "Unknown BENCH_COMBINE patch");
  const dir = resolve(destination, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "package.json"), '{"type":"module"}\n');
  cpSync(resolve(root, "dist/lib"), resolve(dir, "dist/lib"), { recursive: true });
  for (const framework of frameworks) cpSync(resolve(root, `packages/erest-${framework}/dist`), resolve(dir, `packages/erest-${framework}/dist`), { recursive: true });
  const files = {};
  for (const file of Object.keys(baseline)) {
    const original = readFileSync(resolve(root, file), "utf8");
    let source = patches.reduce((value, patch) => changes[patch].patch(file, value), original);
    // Adapter package imports must use this runtime's core, rather than the root's self-reference.
    if (frameworks.map(adapterFile).includes(file)) source = replace(source, 'from "erest"', 'from "../../../dist/lib/index.js"');
    writeFileSync(resolve(dir, file), source);
    files[file] = { baseline: baseline[file], candidate: hash(source) };
  }
  variants[name] = {
    runtimeRoot: relative(root, dir),
    frameworks: patches.length === 1 ? changes[patches[0]].frameworks : frameworks,
    patches,
    descriptions: patches.map((patch) => changes[patch].description),
    caveats: patches.map((patch) => changes[patch].caveat),
    files,
  };
}
const manifest = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  prepareSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  baseline,
  variants,
};
const output = resolve(destination, "../manifest.json");
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(output);
