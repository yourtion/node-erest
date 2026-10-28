import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { z } from "zod";

const manifest = JSON.parse(readFileSync("benchmarks/results/experiments/manifest.json"));
const moduleAt = (root, path) => import(pathToFileURL(resolve(root, path)).href);
const record = { node: process.version, manifest, headerCases: 0, typedCases: [], httpCases: [] };
const baselineSrvx = createRequire(import.meta.resolve("h3")).resolve("srvx/node");
const { NodeRequest: OriginalRequest } = await import(pathToFileURL(baselineSrvx));
const candidateRequests = await Promise.all(["h3-snapshot", "h3-snapshot-lean"].map(async name => [name, (await moduleAt(manifest.variants[name].runtimeRoot, "node_modules/srvx/dist/adapters/node.mjs")).NodeRequest]));

function headerInput(Ctor, raw) {
  const req = { rawHeaders: raw.slice(), headers: Object.fromEntries(Array.from({length:raw.length / 2}, (_, i) => [String(raw[i * 2]).toLowerCase(), raw[i * 2 + 1]])) };
  return { req, headers: new Ctor({req}).headers };
}
function result(fn) {
  try { return { ok: true, value: fn() }; }
  catch (error) { return { ok: false, name: error.name, message: error.message }; }
}
const rawCases = [
  [], ["X-Test", "a", "Host", "localhost", "content-type", "application/json"],
  ["x-a", "1", "X-A", "2"], ["cookie", "a=1", "cookie", "b=2"],
  ["set-cookie", "a=1", "set-cookie", "b=2"], ["__proto__", "own", "constructor", "value"],
  ["set-cookie", ""],
  ["x-space", " \tvalue\t "], ["x-latin", "café"], ["x-wide", "😀"],
  [":method", "POST", "host", "localhost"], ["bad name", "a"], ["x-null", "\0"],
  ["2", "two", "10", "ten", "1", "one"], ["x-empty", ""],
];
let seed = 0x24c0ffee;
for (let byte = 0; byte < 256; byte++) {
  const value = String.fromCharCode(byte);
  rawCases.push(["x-byte", value + "v"], ["x-byte", "v" + value + "v"], ["x-byte", "v" + value]);
}
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
for (let i = 0; i < 400; i++) {
  const raw = [];
  for (let j = 0, count = random(15); j < count; j++) {
    const key = ["host", "x-A", "X-b", "cookie", "set-cookie", "x-Z", "constructor"][random(7)];
    raw.push(key, ["a", "b=2", "café", "", " value "][random(5)]);
  }
  rawCases.push(raw);
}
for (const [name, CandidateRequest] of candidateRequests) {
for (const raw of rawCases) {
  const old = headerInput(OriginalRequest, raw), next = headerInput(CandidateRequest, raw);
  const expected = result(() => Object.fromEntries(old.headers));
  const actual = result(() => next.headers.toObjectSnapshot());
  assert.deepEqual(actual, expected, `${name} header snapshot mismatch: ${JSON.stringify(raw)}`);
  record.headerCases++;
  if (!actual.ok) continue;
  assert.equal(Object.getPrototypeOf(actual.value), Object.prototype);
  assert.deepEqual(next.headers.getSetCookie(), old.headers.getSetCookie());
  assert.deepEqual(Object.keys(actual.value), Object.keys(expected.value));
  assert.deepEqual(Object.getOwnPropertyDescriptors(actual.value), Object.getOwnPropertyDescriptors(expected.value));
  const second = next.headers.toObjectSnapshot();
  assert.notEqual(second, actual.value);
  assert.deepEqual(Object.keys(second), Object.keys(expected.value));
  assert.deepEqual(Object.getOwnPropertyDescriptors(second), Object.getOwnPropertyDescriptors(expected.value));
  actual.value["x-local"] = "does-not-change-source";
  // Materializing the old snapshot freezes the input view, including later Node-side changes.
  for (const input of [old, next]) {
    input.req.rawHeaders.push("x-late-node", "hidden"); input.req.headers["x-late-node"] = "hidden";
  }
  for (const key of ["HOST", "x-a", "x-empty", "missing", "__proto__", "constructor", "x-late-node", 1, undefined, Symbol("x"), "bad name"]) {
    assert.deepEqual(result(() => next.headers.get(key)), result(() => old.headers.get(key)));
    assert.deepEqual(result(() => next.headers.has(key)), result(() => old.headers.has(key)));
  }
  assert.deepEqual(result(() => next.headers.get()), result(() => old.headers.get()));
  assert.deepEqual(next.headers.getSetCookie(), old.headers.getSetCookie());
  for (const headers of [old.headers, next.headers]) {
    headers.append("x-new", "1"); headers.append("x-new", "2");
    headers.set("x-replaced", "replacement"); headers.delete("x-b");
  }
  assert.deepEqual(Object.fromEntries(next.headers), Object.fromEntries(old.headers));
  assert.deepEqual(next.headers.getSetCookie(), old.headers.getSetCookie());
  assert.deepEqual(next.headers.toObjectSnapshot(), Object.fromEntries(old.headers));
}
// Exercise each fast read without a previous invalid-name operation forcing fallback.
for (const operation of [h => h.get("HOST"), h => h.has("HOST"), h => h.getSetCookie(), h => h.get(), h => h.has(), h => h.get(1)]) {
  const old = headerInput(OriginalRequest, ["host", "a", "set-cookie", "a=1"]);
  const next = headerInput(CandidateRequest, ["host", "a", "set-cookie", "a=1"]);
  Object.fromEntries(old.headers); next.headers.toObjectSnapshot();
  assert.deepEqual(result(() => operation(next.headers)), result(() => operation(old.headers)));
  record.headerCases++;
}
for (const late of [false, true]) for (const kind of ["setter", "readonly"]) {
  const key = "x-prototype";
  const old = headerInput(OriginalRequest, [key, "own-value"]);
  const next = headerInput(CandidateRequest, [key, "own-value"]);
  if (late) { Object.fromEntries(old.headers); next.headers.toObjectSnapshot(); }
  const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
  let writes = 0;
  Object.defineProperty(Object.prototype, key, kind === "setter"
    ? { configurable: true, set() { writes++; }, get() { return "inherited"; } }
    : { configurable: true, writable: false, value: "inherited" });
  try {
    assert.deepEqual(result(() => next.headers.toObjectSnapshot()), result(() => Object.fromEntries(old.headers)), `${name}: ${kind} property ${late ? "after" : "before"} first snapshot`);
    assert.equal(writes, 0, "Snapshot must create own data properties without invoking inherited setters");
    record.headerCases++;
  } finally {
    if (original) Object.defineProperty(Object.prototype, key, original);
    else delete Object.prototype[key];
  }
}
}

async function typedOutcome(root, name) {
  const { ERest, compose } = await moduleAt(root, "dist/lib/index.js");
  const service = new ERest({info:{basePath:""},groups:{test:"Test"},docs:{markdown:false}});
  const events = [];
  const schemas = {body:z.object({value:z.string()}), ...(name.startsWith("response") ? {response:z.object({ok:z.boolean()})} : {})};
  const api = service.api.post("/typed").group("test").registerTyped(schemas, (req, ctx) => {
    events.push("handler"); assert.notEqual(req, ctx.$validated);
    if (name === "sync-throw") throw new Error("sync failure");
    if (name === "async-reject") return Promise.reject(new Error("async failure"));
    if (name === "mutate") req.body = {value:"replacement"};
    if (name === "response-invalid") return {ok:"bad"};
    if (name === "undefined") return undefined;
    if (name === "async") return Promise.resolve({ok:true});
    if (name === "own-then") { const p = Promise.resolve({ok:true}); p.then = () => {throw new Error("own then must not be used by native await");}; return p; }
    if (name === "thenable") return {then(){throw new Error("must not assimilate a non-Promise return");}};
    return {ok:true};
  });
  const layered = {params:{},query:{},body:{value:"original"},headers:{}};
  const ctx = {$validated:layered, state:{},reply:{__sent:false}};
  let outcome;
  try {
    await compose([async (_ctx,next) => {events.push("before");await next();events.push("after");}, api.options.handler])(ctx);
    outcome = {ok:true, returned:ctx.__returned, value:name === "thenable" ? "thenable" : ctx.__returnValue, originalBody:layered.body};
  } catch (error) {outcome = {ok:false, name:error.name, message:error.message, issues:error.issues, returned:ctx.__returned};}
  return {events,outcome};
}
for (const name of ["sync","async","sync-throw","async-reject","response-valid","response-invalid","mutate","undefined","own-then","thenable"]) {
  const original = await typedOutcome(manifest.variants.control.runtimeRoot, name);
  assert.deepEqual(await typedOutcome(manifest.variants["typed-shared"].runtimeRoot, name), original, name);
  record.typedCases.push(name);
}

async function appFor(framework, root, setup) {
  const core = await moduleAt(root,"dist/lib/index.js");
  const {ERest} = core;
  const mod = await moduleAt(root,`packages/erest-${framework}/dist/index.js`);
  let app, router, server, adapter, h3;
  if (framework === "express") {
    const {default:express} = await import("express"); app=express();app.use(express.json());router=app;server=createServer(app);adapter=new mod.ExpressAdapter();
  } else if (framework === "koa") {
    const [{default:Koa},{default:Router},{default:bodyParser}] = await Promise.all([import("koa"),import("koa-router"),import("koa-bodyparser")]);
    app=new Koa();app.silent=true;router=new Router();app.use(bodyParser());app.use(router.routes());server=createServer(app.callback());adapter=new mod.KoaAdapter();
  } else if (framework === "leizmweb") {
    const {Application,Router,component}=await import("@leizm/web");app=new Application();router=new Router();app.use("/",component.bodyParser.json());app.use("/",router);server=app.server;adapter=new mod.LeizmWebAdapter();
  } else {
    h3=await import(setup.h3Entry ? pathToFileURL(resolve(setup.h3Entry)).href : "h3/node");
    app=new h3.H3({silent:true,onRequest(event){if(event.req.headers.get("x-mutate"))event.req.headers.set("x-before","web-modified");}});router=app;server=createServer(h3.toNodeHandler(app));adapter=new mod.H3Adapter();
  }
  const retained = [];
  const service = new ERest({info:{basePath:""},groups:{test:"Test"},docs:{markdown:false},hooks:{
    onRequest(ctx){
      assert.equal(Object.getPrototypeOf(ctx),Object.prototype);
      assert.deepEqual(Object.keys(ctx),["method","path","headers","params","query","body","state","reply"]);
      assert.equal(Object.hasOwn(ctx,"$validated"),false);assert.equal(Object.hasOwn(ctx,"__returned"),false);
      for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(ctx)))assert(descriptor.writable&&descriptor.enumerable&&descriptor.configurable);
      ctx.state.events=["request"];retained.push(ctx);
    },
    onValidate(ctx){ctx.state.events.push("validate");},
    onResponse(ctx){ctx.state.events.push("response");},
  }});
  service.setResponseEnvelopers({success:data=>({result:data}),error:error=>({status:400,body:{error:error.message}})});
  service.api.post("/target/:id").group("test")
    .before(async(ctx,next)=>{ctx.state.events.push("before");await next();ctx.state.events.push("before-after");})
    .middlewares((ctx,next)=>{ctx.state.events.push("middleware");return next().then(()=>{ctx.state.events.push("middleware-after");});})
    .registerTyped({params:z.object({id:z.string()}),query:z.object({n:z.coerce.number().default(1)}),body:z.object({token:z.string(),wait:z.number().default(0)})},async(req,ctx)=>{
      assert.notEqual(req,ctx.$validated);ctx.state.events.push("handler");
      const original=req.body;req.body={...req.body};assert.equal(ctx.$validated.body,original);
      await delay(req.body.wait);
      if(req.body.token==="reject")throw new Error("async rejected");
      const header=ctx.headers["x-before"]||ctx.headers["x-test"];
      if(framework==="h3"){ctx.reply.raw.req.headers.set("x-after","hidden");assert.equal(ctx.headers["x-after"],undefined);}
      return {id:req.params.id,n:req.query.n,token:req.body.token,header,events:ctx.state.events.slice()};
    });
  service.bind({adapter,router});
  await new Promise((ok,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",ok);});
  return {server,retained,url:`http://127.0.0.1:${server.address().port}`};
}
for(const framework of ["express","koa","leizmweb","h3"]) {
  const names=["control","context-ctor","context-slack","typed-shared",...(framework==="h3"?["h3-snapshot-control","h3-snapshot","h3-snapshot-lean"]:[])];
  let expected;
  for(const name of names) {
    const variant=manifest.variants[name];const app=await appFor(framework,variant.runtimeRoot,variant.setup);
    try {
      const requests=Array.from({length:24},(_,i)=>({token:`request-${i}`,wait:i%3}));
      const responses=await Promise.all(requests.map(async(body,i)=>{
        const r=await fetch(`${app.url}/target/${i}?n=2`,{method:"POST",headers:{"content-type":"application/json","x-test":"original",...(i%2?{"x-mutate":"yes"}:{})},body:JSON.stringify(body)});
        assert.equal(r.status,200);return r.json();
      }));
      const rejected=await fetch(`${app.url}/target/0`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:"reject"})});assert.equal(rejected.status,400);
      const rejection=await rejected.json();
      const invalid=await fetch(`${app.url}/target/0`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:1})});assert.equal(invalid.status,400);const invalidBody=await invalid.json();
      const actual={responses,rejection,invalidBody};if(name==="control")expected=actual;else assert.deepEqual(actual,expected,`${framework}/${name}`);
      assert.equal(new Set(app.retained).size,app.retained.length);assert.equal(new Set(app.retained.map(ctx=>ctx.state)).size,app.retained.length);
      for(let i=0;i<24;i++){const ctx=app.retained[i];assert.equal(ctx.$validated.body.token,requests[i].token);assert.deepEqual(ctx.state.events,["request","before","validate","middleware","handler","middleware-after","before-after","response"]);}
      record.httpCases.push({framework,name,concurrentRequests:24,rejection:true,invalid:true});
    } finally {app.server.closeAllConnections();await new Promise(ok=>app.server.close(ok));}
  }
}
record.scriptSha256=createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");
writeFileSync("benchmarks/results/experiments/targeted-checks.json",JSON.stringify(record,null,2)+"\n");
console.log(`Passed ${record.headerCases} header cases, ${record.typedCases.length} typed-handler cases and ${record.httpCases.length} HTTP variants with concurrent isolation checks.`);
