// Compare native V8 JSON with an existing dependency's schema-compiled serializer.
import assert from "node:assert/strict";
import Ajv from "ajv/dist/jtd.js";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expectedPost } from "../fixture.mjs";

const schema={properties:{id:{type:"string"},limit:{type:"float64"},name:{type:"string"},age:{type:"float64"},email:{type:"string"},tags:{elements:{type:"string"}},address:{properties:{city:{type:"string"},zip:{type:"string"}}}}};
const ajv=new Ajv();
const single=ajv.compileSerializer(schema);
const array=ajv.compileSerializer({elements:schema});
const samples=[];
let sink=0;
for(const size of [1,100,1000]) {
  const item={...expectedPost,name:'Tom "quoted" \\ newline\n 中文 😀'};
  const input=size===1?item:Array.from({length:size},(_,i)=>({...item,id:`u${i}`}));
  const compiled=size===1?single:array;
  assert.deepEqual(JSON.parse(compiled(input)),JSON.parse(JSON.stringify(input)));
  const entries=[["native",JSON.stringify],["ajv-jtd",compiled]];
  for(let round=1;round<=7;round++) for(const [name,fn] of round%2?entries:entries.toReversed()) {
    const measure=(ms)=>{let count=0;const start=performance.now();do{for(let i=0;i<10;i++){sink^=fn(input).length;}count+=10;}while(performance.now()-start<ms);return {count,nsPerOp:(performance.now()-start)*1e6/count};};
    measure(40);samples.push({size,name,round,...measure(150)});
  }
}
const counterexamples=[];
for(const [label,input] of [["extra-property",{...expectedPost,extra:"visible"}],["custom-toJSON",{...expectedPost,toJSON(){return {custom:true};}}]]) {
  const native=JSON.stringify(input),compiled=single(input);assert.notEqual(native,compiled);counterexamples.push({label,native,compiled});
}
const median=xs=>xs.toSorted((a,b)=>a-b)[Math.floor(xs.length/2)];
const groups=[...Map.groupBy(samples,s=>`${s.size}/${s.name}`)].map(([name,ss])=>({name,nsPerOp:median(ss.map(s=>s.nsPerOp))}));
const result={node:process.version,scriptSha256:createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),schema,samples,groups,counterexamples,sink};
writeFileSync("benchmarks/results/experiments/serialization.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(groups,null,2));
