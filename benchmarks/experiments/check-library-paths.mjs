import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { H3 } from "h3";
import { toNodeHandler } from "h3/node";
import express from "express";
import { z } from "zod";

const manifest = JSON.parse(readFileSync("benchmarks/results/experiments/manifest.json"));
const cases = [];
for (const name of ["control", "h3-json-body", "h3-native-json"]) {
  const root = manifest.variants[name].runtimeRoot;
  const { ERest } = await import(pathToFileURL(resolve(root, "dist/lib/index.js")));
  const { H3Adapter } = await import(pathToFileURL(resolve(root, "packages/erest-h3/dist/index.js")));
  const app = new H3({silent:true});
  const service = new ERest({info:{basePath:""},groups:{test:"Test"},docs:{markdown:false}});
  service.api.post("/body").group("test").registerTyped({body:z.unknown()}, (req,ctx)=>ctx.reply.json(req.body));
  service.api.get("/string").group("test").register(ctx=>ctx.reply.json("hello"));
  service.api.get("/mutation").group("test").register(ctx=>{const data={value:1};ctx.reply.json(data);data.value=2;});
  service.bind({adapter:new H3Adapter(),router:app});
  const server=createServer(toNodeHandler(app));
  await new Promise((ok,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",ok);});
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    for (const [label,path,options] of [
      ["json","/body",{method:"POST",headers:{"content-type":"application/json"},body:'{"value":1}'}],
      ["empty","/body",{method:"POST"}],
      ["form","/body",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"value=1"}],
      ["invalid-json","/body",{method:"POST",headers:{"content-type":"application/json"},body:"{"}],
      ["string","/string",{}], ["mutation","/mutation",{}],
    ]) {
      const r=await fetch(base+path,options);
      cases.push({name,label,status:r.status,contentType:r.headers.get("content-type"),body:await r.text()});
    }
  } finally {server.closeAllConnections();await new Promise(ok=>server.close(ok));}
}
const find=(name,label)=>cases.find(c=>c.name===name&&c.label===label);
assert.equal(find("control","empty").status,200);
assert.equal(find("h3-json-body","empty").status,400);
assert.equal(find("control","form").status,200);
assert.equal(find("h3-json-body","form").status,400);
assert.equal(find("control","string").body,'"hello"');
assert.equal(find("h3-native-json","string").body,'hello');
assert.equal(find("control","mutation").body,'{"value":1}');
assert.equal(find("h3-native-json","mutation").body,'{"value":2}');
for (const enabled of [true,false]) {
  const app=express(); if(!enabled)app.disable("etag");app.get("/",(_req,res)=>res.json({value:1}));
  const server=createServer(app);await new Promise((ok,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",ok);});
  try { const url=`http://127.0.0.1:${server.address().port}`;const r=await fetch(url);const etag=r.headers.get("etag");await r.text();
    const conditional=await new Promise((ok,no)=>{const req=request(url,{headers:{"if-none-match":etag||cases.find(c=>c.name==="express").etag}},res=>{res.resume();res.on("end",()=>ok({status:res.statusCode}));});req.on("error",no);req.end();});
    cases.push({name:"express",enabled,etag,conditionalStatus:conditional.status});
    assert.equal(Boolean(etag),enabled);assert.equal(conditional.status,enabled?304:200);
  } finally {server.closeAllConnections();await new Promise(ok=>server.close(ok));}
}
const {compose}=await import("../../dist/lib/adapters/utils.js");
const source=readFileSync("dist/lib/adapters/utils.js","utf8");
assert(source.includes("Promise.resolve(fn(ctx, () => execute(i + 1)))"));
const direct=(await import(`data:text/javascript;base64,${Buffer.from(source.replace("Promise.resolve(fn(ctx, () => execute(i + 1)))","fn(ctx, () => execute(i + 1))")).toString("base64")}`)).compose;
const middleware=[(ctx,next)=>next().then(()=>{ctx.done=true;}),()=>{}];
const ctx={};await compose(middleware)(ctx);assert.equal(ctx.done,true);
await assert.rejects(direct(middleware)({}),TypeError);
cases.push({name:"compose-direct",incompatibility:"next().then() after a synchronous downstream middleware fails without Promise normalization"});
writeFileSync("benchmarks/results/experiments/library-checks.json",JSON.stringify({cases},null,2)+"\n");
console.log("Library-path checks passed; known body, response, caching and compose counterexamples reproduced.");
