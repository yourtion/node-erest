import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { z } from "zod";
import { schemas, payload } from "../fixture.mjs";
import { makeAjvBodyParser, manualBody } from "./validation-candidates.mjs";

const parsers = {
  "zod-safe": input => { const r = schemas.body.safeParse(input); if (!r.success) throw r.error; return r.data; },
  "zod-parse": input => schemas.body.parse(input),
  "zod-jitless": input => schemas.body.parse(input, { jitless: true }),
  "ajv-clone": makeAjvBodyParser(schemas.body, input => schemas.body.parse(input)),
  manual: manualBody,
};
const verdict = (fn, input) => { try { return { ok: true, data: fn(input) }; } catch (e) { return { ok: false, issues: e.issues?.map(({code, path, message}) => ({code, path, message})), message: e.issues ? undefined : e.message }; } };
const inputs = [payload, null, {}, [], { ...payload, extra: 1, address: { ...payload.address, ignored: true } },
  { ...payload, name: "😀".repeat(51) }, { ...payload, name: "a".repeat(100) }, { ...payload, tags: new Array(1) }];
for (const key of Object.keys(payload)) for (const value of [undefined, null, "", "bad", 0, 151, -1, 2.5, [], {}, true]) inputs.push({ ...payload, [key]: value });
for (let i = 0; i < 100; i++) inputs.push({ ...payload, name: `user-${i}`, age: i % 151, tags: [String(i)], address: { city: "x", zip: "00", extra: i } });
const differences = [];
for (let i = 0; i < inputs.length; i++) {
  const expected = verdict(parsers["zod-safe"], inputs[i]);
  for (const [name, parse] of Object.entries(parsers)) {
    const actual = verdict(parse, inputs[i]);
    try { assert.deepEqual(actual, expected); } catch { differences.push({ parser: name, case: i, input: inputs[i], expected, actual }); }
  }
}
// The actual compileValidate patch must preserve ordinary errors and transforms.
const manifest = JSON.parse(readFileSync("benchmarks/results/experiments/manifest.json"));
const loadCompile = async root => (await import(pathToFileURL(resolve(root, "dist/lib/params.js")))).compileValidate;
const baseline = await loadCompile(".");
const candidate = await loadCompile(manifest.variants["zod-parse"].runtimeRoot);
const errorFactory = { missingParameter: s => new Error(`missing:${s}`), invalidParameter: s => new Error(`invalid:${s}`) };
for (const input of inputs) assert.deepEqual(verdict(baseline(errorFactory, {bodySchema: schemas.body}).validate, {body: input}), verdict(candidate(errorFactory, {bodySchema: schemas.body}).validate, {body: input}));
const transformed = z.object({ value: z.string().transform(x => x.trim()).default("default") });
for (const input of [{}, {value:" hi "}, {value:1}]) assert.deepEqual(verdict(baseline(errorFactory, {bodySchema: transformed}).validate, {body:input}), verdict(candidate(errorFactory, {bodySchema: transformed}).validate, {body:input}));
const thrownSchema = z.object({ value: z.string().transform(() => { throw new z.ZodError([{code:"custom", path:["inner"], message:"user-thrown"}]); }) });
const transformCounterexample = { baseline: verdict(baseline(errorFactory, {bodySchema: thrownSchema}).validate, {body:{value:"x"}}), candidate: verdict(candidate(errorFactory, {bodySchema: thrownSchema}).validate, {body:{value:"x"}}) };
assert.notDeepEqual(transformCounterexample.baseline, transformCounterexample.candidate);
assert(differences.some(x => x.parser === "ajv-clone" && x.case === 5), "Expected Unicode length incompatibility");
assert(differences.every(x => x.parser === "ajv-clone"), "Unexpected validator differential");

// Single-process microbench is a component cost estimate, never an HTTP gain prediction.
const durationMs = Number(process.env.MICRO_MS || 200), rounds = 7;
const samples = [];
let sink = 0;
for (const invalidPercent of [0, 10, 100]) {
  const corpus = Array.from({length:100}, (_,i) => i < invalidPercent ? {...payload, age:"bad"} : payload);
  const measure = (parse, ms) => {
    let count = 0, errors = 0; const start = performance.now();
    do { for (let i=0;i<100;i++) { try { sink += parse(corpus[i]).tags.length; } catch { errors++; } } count += 100; } while (performance.now()-start < ms);
    return { count, errors, nsPerOp:(performance.now()-start)*1e6/count };
  };
  for (let round=1; round<=rounds; round++) {
    const entries=Object.entries(parsers); const offset=round%entries.length;
    for (const [parser, parse] of [...entries.slice(offset), ...entries.slice(0,offset)]) {
      measure(parse, 50);
      samples.push({parser, round, invalidPercent, ...measure(parse, durationMs)});
    }
  }
}
const median = xs => xs.toSorted((a,b)=>a-b)[Math.floor(xs.length/2)];
const groups=[...Map.groupBy(samples,s=>`${s.parser}/${s.invalidPercent}`)].map(([name,ss])=>({name,nsPerOp:median(ss.map(s=>s.nsPerOp))}));
const result={node:process.version, schemaSha256:createHash("sha256").update(JSON.stringify(z.toJSONSchema(schemas.body))).digest("hex"), scriptSha256:createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"), cases:inputs.length,differences,transformCounterexample,rounds,durationMs,samples,groups,sink};
writeFileSync("benchmarks/results/experiments/validation.json", JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({cases:inputs.length,differences: differences.map(({parser,case:c})=>({parser,case:c})), transformCounterexample,groups},null,2));
