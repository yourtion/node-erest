import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const directory = resolve(process.argv[2] || "benchmarks/results/experiments/profiles");
const runPath = resolve(process.argv[3] || "benchmarks/results/experiments/profile-run.json");
const source = readFileSync(runPath);
const run = JSON.parse(source);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const profiles = readdirSync(directory).filter((name) => name.endsWith(".cpuprofile")).map((file) => {
  const source = readFileSync(resolve(directory, file));
  const profile = JSON.parse(source);
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const cutoff = Math.max(0, profile.timeDeltas.reduce((sum, delta) => sum + delta, 0) - run.config.durationMs * 1000);
  const counts = new Map();
  let elapsed = 0, total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const delta = profile.timeDeltas[i];
    elapsed += delta;
    if (elapsed < cutoff) continue;
    total += delta;
    const frame = nodes.get(profile.samples[i]);
    const location = frame.url.startsWith("file:") ? relative(process.cwd(), fileURLToPath(frame.url)) : frame.url;
    const key = JSON.stringify({ function: frame.functionName || "(anonymous)", source: location, line: frame.lineNumber + 1 });
    counts.set(key, (counts.get(key) || 0) + delta);
  }
  return { file, sha256: sha256(source), frames: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, duration]) => ({ ...JSON.parse(key), percent: duration / total * 100 })) };
});
const summary = { commit: run.commit, environment: run.environment, config: run.config, profileRunSha256: sha256(source), summarizerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  window: `Last ${run.config.durationMs}ms of each profile, including stop/forced GC/exit. Sampled self time is approximate and cannot isolate allocations or prove causality. Profile timings are excluded from optimization comparisons.`, profiles };
const output = resolve(directory, "../profiles-summary.json");
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(output);
