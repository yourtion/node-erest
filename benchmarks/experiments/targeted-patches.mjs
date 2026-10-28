// Candidate patches only touch ignored runtime/dependency copies.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync, existsSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";

const hash = value => createHash("sha256").update(value).digest("hex");

export function targetedChanges({ frameworks, adapterFile, replace, root }) {
  function contextPatch(file, source, reserve) {
    if (!frameworks.map(adapterFile).includes(file)) return source;
    const match = /const (ctx|stdCtx) = \{([\s\S]*?)\n\s*\};/.exec(source);
    assert(match, `Context literal not found: ${file}`);
    const fields = match[2].split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("//"));
    const args = fields.map(line => {
      if (line === "reply,") return "reply";
      const field = /^(method|path|headers|params|query|body|state): (.*),$/.exec(line);
      assert(field, `Unexpected context field: ${line}`);
      return field[2];
    });
    assert.equal(args.length, 8);
    const constructor = `function RequestContext(method, path, headers, params, query, body, state, reply, reserve) {
      this.method = method; this.path = path; this.headers = headers; this.params = params;
      this.query = query; this.body = body; this.state = state; this.reply = reply;
      ${reserve ? `if (reserve) {
        this.$validated = undefined; this.$params = undefined; this.$pathParams = undefined;
        this.$query = undefined; this.$body = undefined; this.$headers = undefined;
        this.__returned = undefined; this.__returnValue = undefined;
      }` : ""}
    }
    RequestContext.prototype = Object.prototype;
    for (let i = 0; i < 8; i++) new RequestContext("", "", {}, {}, {}, {}, {}, null, ${reserve});
`;
    return constructor + source.replace(match[0], `const ${match[1]} = new RequestContext(${args.join(", ")});`);
  }

  function sharedTyped(file, source) {
    if (file !== "dist/lib/api.js") return source;
    const start = source.indexOf("        const wrappedHandler = async (ctx) => {");
    const end = source.indexOf("        this.options.handler = wrappedHandler;", start);
    assert(start >= 0 && end > start);
    const original = source.slice(start, end);
    const requestStart = original.indexOf("            const validated =");
    const callEnd = original.indexOf("            // 统一 await");
    assert(requestStart >= 0 && callEnd > requestStart);
    const request = original.slice(requestStart, callEnd);
    const finishStart = original.indexOf("            // 若定义了 response schema");
    const finishEnd = original.lastIndexOf("        };");
    assert(finishStart > callEnd && finishEnd > finishStart);
    const finish = original.slice(finishStart, finishEnd);
    const next = `        const finish = (ctx, resolved) => {
${finish}        };
        const resume = async (ctx, result) => { finish(ctx, await result); };
        const wrappedHandler = (ctx) => {
          try {
${request}            if (result instanceof Promise) return resume(ctx, result);
            finish(ctx, result);
            return Promise.resolve();
          } catch (error) { return Promise.reject(error); }
        };
`;
    return source.slice(0, start) + next + source.slice(end);
  }

  function prepareH3(dir, patched, lean = false) {
    const h3 = realpathSync(resolve(root, "node_modules/h3"));
    const srvx = realpathSync(resolve(h3, "../srvx"));
    const modules = resolve(dir, "node_modules");
    mkdirSync(modules, { recursive: true });
    cpSync(h3, resolve(modules, "h3"), { recursive: true });
    cpSync(srvx, resolve(modules, "srvx"), { recursive: true });
    const rou3 = resolve(modules, "rou3");
    if (!existsSync(rou3)) symlinkSync(realpathSync(resolve(h3, "../rou3")), rou3, "dir");
    const file = resolve(modules, "srvx/dist/adapters/node.mjs");
    const baseline = readFileSync(file, "utf8");
    let candidate = baseline;
    if (patched) {
      const start = candidate.indexOf("const NodeRequestHeaders =");
      const end = candidate.indexOf("const kNativeRequest =", start);
      assert(start >= 0 && end > start);
      let headers = candidate.slice(start, end);
      headers = replace(headers, "\t\t#headers;", "\t\t#headers;\n\t\t#snapshot;");
      headers = replace(headers, "\t\t\tif (!this.#headers) {", "\t\t\tif (!this.#headers && this.#snapshot) this.#headers = new NativeHeaders(this.#snapshot);\n\t\t\tif (!this.#headers) {");
      for (const method of ["get", "has"]) {
        const before = `\t\t${method}(name) {\n\t\t\tif (this.#headers) return this.#headers.${method}(name);`;
        const result = method === "get" ? 'Object.hasOwn(this.#snapshot, lower) ? this.#snapshot[lower] : null' : 'Object.hasOwn(this.#snapshot, lower)';
        const after = before + `
          if (this.#snapshot) {
            if (typeof name !== "string" || !_validHeaderNameRE.test(name)) return this._headers.${method}(name);
            const lower = name.toLowerCase();
            return ${result};
          }`;
        headers = replace(headers, before, after);
      }
      headers = replace(headers, 'const value = this.#req.headers["set-cookie"];', 'const value = (this.#snapshot || this.#req.headers)["set-cookie"];');
      headers = replace(headers, "\t\tentries() {", `
        toObjectSnapshot() {
          if (this.#headers) return Object.fromEntries(this.#headers);
          if (this.#snapshot) {
            ${lean ? `const output = {};
            for (const key of Object.keys(this.#snapshot).sort()) {
              if (key in output) return Object.fromEntries(this._headers);
              output[key] = this.#snapshot[key];
            }
            return output;` : `return { ...this.#snapshot };`}
          }
          const raw = this.#req.rawHeaders;
          const values = {};
          for (let i = 0; i < raw.length; i += 2) {
            const name = raw[i], value = raw[i + 1];
            if (typeof name !== "string" || !_validHeaderNameRE.test(name) || typeof value !== "string"
              || value !== value.trim() || /[\\0\\r\\n\\u0100-\\uFFFF]/.test(value)) return Object.fromEntries(this._headers);
            const key = name.toLowerCase();
            if (key in values) return Object.fromEntries(this._headers);
            values[key] = value;
          }
          const snapshot = {};
          for (const key of Object.keys(values).sort()) snapshot[key] = values[key];
          this.#snapshot = ${lean ? "values" : "snapshot"};
          return ${lean ? "snapshot" : "{ ...snapshot }"};
        }
\t\tentries() {`);
      candidate = candidate.slice(0, start) + headers + candidate.slice(end);
      writeFileSync(file, candidate);
    }
    return {
      setup: { h3Entry: relative(root, resolve(modules, "h3/dist/_entries/node.mjs")) },
      dependencies: { h3: JSON.parse(readFileSync(resolve(h3, "package.json"))).version, srvx: JSON.parse(readFileSync(resolve(srvx, "package.json"))).version,
        srvxNode: { baseline: hash(baseline), candidate: hash(candidate) },
        h3Node: hash(readFileSync(resolve(modules, "h3/dist/_entries/node.mjs"))) },
    };
  }

  return {
    "context-ctor": { frameworks, description: "Construct a plain-object Context through a shared constructor, retaining key order and Object.prototype.", caveat: "Must check property descriptors, optional-key visibility, retained contexts and concurrent request isolation.", patch: (file, source) => contextPatch(file, source, false) },
    "context-slack": { frameworks, description: "Warm a Context constructor with all later fields, reserving V8 in-object slack without exposing optional keys early.", caveat: "Engine-dependent allocation experiment; larger initial objects can offset transition savings. No object reuse across requests.", patch: (file, source) => contextPatch(file, source, true) },
    "typed-shared": { frameworks, description: "Move typed-handler finish closure to registration time; allocate async continuation only for Promise results and preserve Promise rejection semantics.", caveat: "Verify sync throw, async reject, response checks, onion ordering, bookkeeping and independent typed request objects.", patch: sharedTyped },
    "typed-direct": { frameworks, setup: { directHandler: true }, description: "Attribution control using existing schema builders plus register(ctx), reading $validated and manually writing Reply; skips typed wrapper entirely.", caveat: "Only equivalent for this manual-reply fixture. Does not retain registerTyped return/envelope bookkeeping, response validation or typed request inference.", patch: (_file, source) => source },
    "h3-snapshot-control": { frameworks: ["h3"], description: "Unmodified H3/srvx copies to control dependency relocation effects.", caveat: "Control only.", patch: (_file, source) => source, prepareRuntime: dir => prepareH3(dir, false) },
    "h3-snapshot": { frameworks: ["h3"], description: "Prototype an owning-library snapshot API in srvx; simple headers bypass Web Headers materialization while public operations retain a frozen input snapshot.", caveat: "Requires an upstream API or maintained dependency patch; duplicate/special/modified headers fall back to native Headers. Not a released library feature.",
      patch(file, source) { return file === adapterFile("h3") ? replace(source, "headers: Object.fromEntries(event.req.headers),", 'headers: typeof event.req.headers.toObjectSnapshot === "function" ? event.req.headers.toObjectSnapshot() : Object.fromEntries(event.req.headers),') : source; },
      prepareRuntime: dir => prepareH3(dir, true) },
    "h3-snapshot-lean": { frameworks: ["h3"], description: "Snapshot API with separate internal lookup object and ordered public object; remove the initial third object copy.", caveat: "Same upstream API requirement and fallback rules; repeat snapshots must sort cached keys again.",
      patch(file, source) { return file === adapterFile("h3") ? replace(source, "headers: Object.fromEntries(event.req.headers),", 'headers: typeof event.req.headers.toObjectSnapshot === "function" ? event.req.headers.toObjectSnapshot() : Object.fromEntries(event.req.headers),') : source; },
      prepareRuntime: dir => prepareH3(dir, true, true) },
  };
}
