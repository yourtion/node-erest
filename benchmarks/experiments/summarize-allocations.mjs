// Sampling estimates allocation pressure, including collected objects; it does not establish a leak.
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {resolve,relative,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const directory=resolve(process.argv[2]);
const runBytes=readFileSync(resolve(process.argv[3]));
const run=JSON.parse(runBytes);
if(!run.finishedAt || !run.instrumentation?.allocationProfile || run.samples.some(s=>s.errors)) throw new Error("Expected a completed, error-free allocation run");
const profiles=[];
for(const file of readdirSync(directory).filter(x=>x.endsWith(".heap.json"))) {
  const bytes=readFileSync(resolve(directory,file));const profile=JSON.parse(bytes);
  const groups=new Map();
  function walk(node) {
    const f=node.callFrame;
    const source=f.url.startsWith("file:")?relative(process.cwd(),fileURLToPath(f.url)):isAbsolute(f.url)?relative(process.cwd(),f.url):f.url;
    const key=JSON.stringify({function:f.functionName||"(anonymous)",source,line:f.lineNumber+1});
    groups.set(key,(groups.get(key)||0)+node.selfSize);
    for(const child of node.children||[])walk(child);
  }
  walk(profile.head);
  const sample=run.samples.find(s=>`${s.framework}-${s.scenario}-c${s.concurrency}-${s.mode}-r${s.round}.heap.json`===file);
  if(!sample)throw new Error(`Missing measurement for ${file}`);
  const totalBytes=[...groups.values()].reduce((a,b)=>a+b,0);
  profiles.push({file,sha256:createHash("sha256").update(bytes).digest("hex"),framework:sample.framework,mode:sample.mode,requests:sample.requests,totalBytes,estimatedBytesPerRequest:totalBytes/sample.requests,
    frames:[...groups].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([key,selfSize])=>({...JSON.parse(key),selfSize,bytesPerRequest:selfSize/sample.requests,percent:selfSize/totalBytes*100}))});
}
if(profiles.length!==run.samples.length) throw new Error("Missing or extra allocation profiles");
const result={environment:run.environment,commit:run.commit,harnessSha256:run.harnessSha256,
  runSha256:createHash("sha256").update(runBytes).digest("hex"),summarizerSha256:createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),config:run.config,instrumentation:run.instrumentation,
  method:"V8 sampling interval 32768 bytes, include objects collected by minor/major GC. Profile starts after pre-measurement GC and stops before post-measurement GC. Approximate allocation estimates include stop/IPC overhead; timings excluded from HTTP comparisons. Allocation is not retained memory or proof of a leak.",profiles};
const output=resolve(directory,"../allocations-summary.json");writeFileSync(output,JSON.stringify(result,null,2)+"\n");console.log(output);
console.log(JSON.stringify(profiles.map(({framework,mode,estimatedBytesPerRequest,frames})=>({framework,mode,estimatedBytesPerRequest,frames:frames.slice(0,8)})),null,2));
