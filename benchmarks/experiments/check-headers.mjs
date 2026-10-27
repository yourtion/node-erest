// Real HTTP differential checks, including mutations before erest snapshots headers.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { H3 } from "h3";

const manifest = JSON.parse(readFileSync("benchmarks/results/experiments/manifest.json", "utf8"));
const roots = { erest: ".", control: manifest.variants.control.runtimeRoot, foreach: manifest.variants.foreach.runtimeRoot, "node-headers": manifest.variants["node-headers"].runtimeRoot };
const cases = [];
for (const [variant, root] of Object.entries(roots)) {
  const core = await import(pathToFileURL(resolve(root, "dist/lib/index.js")).href);
  const { H3Adapter } = await import(pathToFileURL(resolve(root, "packages/erest-h3/dist/index.js")).href);
  const { toNodeHandler } = await import("h3/node");
  const app = new H3({ silent: true, onRequest(event) {
    event.req.headers.set("x-app", "updated-before-dispatch");
    // Set through Web Headers too: the Node bridge can discard this incoming key.
    event.req.headers.set("__proto__", "special");
  } });
  const service = new core.ERest({ info: { basePath: "" }, groups: { test: "Test" }, docs: { markdown: false } });
  service.api.get("/headers").group("test").register((ctx) => {
    // Changes after the snapshot must not change ctx.headers.
    ctx.reply.raw.req.headers.set("x-after", "not-in-snapshot");
    const first = ctx.headers;
    const sameObject = first === ctx.headers;
    ctx.reply.json({ headers: first, keys: Object.keys(first), sameObject, prototype: Object.getPrototypeOf(first) === Object.prototype });
  });
  service.bind({ adapter: new H3Adapter(), router: app });
  const server = createServer(toNodeHandler(app));
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  try {
    const headers = new Headers([["__proto__", "special"], ["x-duplicate", "a"], ["x-duplicate", "b"], ["set-cookie", "a=1"], ["set-cookie", "b=2"], ["cookie", "a=1"], ["cookie", "b=2"]]);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/headers`, { headers });
    assert.equal(response.status, 200);
    const result = await response.json();
    // Fetch supplies connection/host details, so compare only deterministic requested/application headers.
    for (const name of Object.keys(result.headers)) if (["host", "connection", "accept", "accept-language", "sec-fetch-mode", "user-agent", "accept-encoding"].includes(name)) delete result.headers[name];
    result.keys = result.keys.filter((name) => Object.hasOwn(result.headers, name));
    if (variant === "erest") cases.push({ variant, result });
    else if (variant === "node-headers") {
      assert.equal(result.headers["x-app"], undefined, "Diagnostic must expose its known Web Headers mutation incompatibility");
      cases.push({ variant, expectedIncompatibility: "Misses mutation to Web Headers before dispatch", result });
    } else {
      assert.deepEqual(result, cases[0].result);
      cases.push({ variant, matchesBaseline: true, result });
    }
    assert.equal(result.sameObject, true);
    assert.equal(result.prototype, true);
    assert.equal(result.headers["x-after"], undefined);
    if (variant !== "node-headers") assert.equal(result.headers.__proto__, "special");
  } finally {
    server.closeAllConnections();
    await new Promise((accept) => server.close(accept));
  }
}
const output = "benchmarks/results/experiments/headers-check.json";
writeFileSync(output, `${JSON.stringify({ cases }, null, 2)}\n`);
console.log(`Header checks passed; known Node-only mutation incompatibility reproduced. ${output}`);
