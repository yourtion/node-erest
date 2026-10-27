// Bundle exploratory raw measurements and paired comparisons into one JSON + HTML.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const inputs = process.argv.slice(2);
assert(inputs.length, "Pass screening and/or confirmation JSON paths");
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
const metrics = {
  rps: (s) => s.rps,
  cpuUs: (s) => s.serverCpuUsPerRequest,
  meanMs: (s) => s.latencyMs.mean,
  p95Ms: (s) => s.latencyMs.p95,
  rssMiB: (s) => s.serverRssMiB,
  heapMiB: (s) => s.serverRetainedHeapMiB,
  clientCpu: (s) => s.clientCpuPercent,
};
const stages = inputs.map((input) => {
  const raw = JSON.parse(readFileSync(resolve(input), "utf8"));
  assert(raw.finishedAt, `Incomplete run: ${input}`);
  assert(raw.samples.every((s) => s.errors === 0), `Errors in ${input}`);
  const groups = [];
  const comparisons = [];
  const grouped = Map.groupBy(raw.samples, (s) => `${s.framework}/${s.scenario}/${s.concurrency}/${s.mode}`);
  for (const samples of grouped.values()) {
    assert.equal(samples.length, raw.config.rounds, "Missing rounds");
    assert.equal(new Set(samples.map((s) => s.round)).size, raw.config.rounds, "Duplicate rounds");
    const first = samples[0];
    groups.push({ framework: first.framework, scenario: first.scenario, concurrency: first.concurrency, mode: first.mode,
      rounds: samples.length, errors: 0,
      ...Object.fromEntries(Object.entries(metrics).map(([name, getter]) => [name, median(samples.map(getter))])),
    });
  }
  for (const group of groups.filter((g) => !["erest", "native-zod"].includes(g.mode))) {
    const candidates = grouped.get(`${group.framework}/${group.scenario}/${group.concurrency}/${group.mode}`);
    const baseline = grouped.get(`${group.framework}/${group.scenario}/${group.concurrency}/erest`);
    assert(baseline, "No erest control");
    const pairs = candidates.map((candidate) => {
      const control = baseline.find((b) => b.round === candidate.round);
      assert(control, "Unpaired sample");
      return { round: candidate.round, throughputPercent: (candidate.rps / control.rps - 1) * 100,
        cpuUsDelta: candidate.serverCpuUsPerRequest - control.serverCpuUsPerRequest,
        p95MsDelta: candidate.latencyMs.p95 - control.latencyMs.p95,
        rssMiBDelta: candidate.serverRssMiB - control.serverRssMiB,
        heapMiBDelta: candidate.serverRetainedHeapMiB - control.serverRetainedHeapMiB };
    });
    comparisons.push({ framework: group.framework, scenario: group.scenario, concurrency: group.concurrency, mode: group.mode,
      medianGainPercent: median(pairs.map((p) => p.throughputPercent)),
      minGainPercent: Math.min(...pairs.map((p) => p.throughputPercent)),
      maxGainPercent: Math.max(...pairs.map((p) => p.throughputPercent)),
      medianCpuUsDelta: median(pairs.map((p) => p.cpuUsDelta)),
      medianRssMiBDelta: median(pairs.map((p) => p.rssMiBDelta)),
      medianHeapMiBDelta: median(pairs.map((p) => p.heapMiBDelta)),
      allRoundsPositive: pairs.every((p) => p.throughputPercent > 0), pairs,
    });
  }
  return { input, raw, groups, comparisons };
});
const profilePath = resolve("benchmarks/results/experiments/profiles-summary.json");
const checksPath = resolve("benchmarks/results/experiments/headers-check.json");
const findingsPath = resolve("benchmarks/results/experiments/findings.json");
const output = resolve(process.env.EXPERIMENT_OUT || "benchmarks/results/mac-optimization");
const bundle = { generatedAt: new Date().toISOString(),
  method: "Compare candidate to erest control within the same round, framework, scenario and concurrency. Profile runs are excluded from performance comparisons. Paired ranges are not confidence intervals.",
  profiles: existsSync(profilePath) ? JSON.parse(readFileSync(profilePath, "utf8")) : null,
  headerChecks: existsSync(checksPath) ? JSON.parse(readFileSync(checksPath, "utf8")) : null,
  findings: existsSync(findingsPath) ? JSON.parse(readFileSync(findingsPath, "utf8")) : null,
  stages };
writeFileSync(`${output}.json`, `${JSON.stringify(bundle, null, 2)}\n`);
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const number = (value, digits = 2) => Number(value).toFixed(digits);
const signed = (value, digits = 2) => `${value >= 0 ? "+" : ""}${number(value, digits)}`;
const findingsHtml = bundle.findings ? `<section><h2>结论与下一步</h2><ul>${bundle.findings.items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>` : "";
const sections = stages.map((stage) => `<section><h2>${escape(stage.input)}</h2>
<p>${stage.raw.samples.length} 次采样 · ${stage.raw.config.rounds} 轮 · 预热 ${stage.raw.config.warmupMs / 1000}s / 测量 ${stage.raw.config.durationMs / 1000}s · ${escape(stage.raw.environment.node)} · ${escape(stage.raw.environment.cpu)}</p>
<p>提交 ${escape(stage.raw.commit)}；全部 ${stage.raw.samples.reduce((sum, s) => sum + s.requests, 0).toLocaleString("en-US")} 次计时区间请求错误为 0。</p>
<div class="scroll"><table><thead><tr><th>框架</th><th>变体</th><th>吞吐配对中位变化</th><th>轮间范围</th><th>CPU μs/请求变化</th><th>RSS MiB 变化</th><th>GC 后堆 MiB 变化</th></tr></thead><tbody>
${stage.comparisons.map((c) => `<tr><td>${escape(c.framework)}</td><td>${escape(c.mode)}</td><td>${signed(c.medianGainPercent)}%</td><td>${signed(c.minGainPercent)}% ～ ${signed(c.maxGainPercent)}%</td><td>${signed(c.medianCpuUsDelta, 3)}</td><td>${signed(c.medianRssMiBDelta)}</td><td>${signed(c.medianHeapMiBDelta, 3)}</td></tr>`).join("")}
</tbody></table></div><h3>各组指标中位数</h3><div class="scroll"><table><thead><tr><th>框架</th><th>变体</th><th>req/s</th><th>CPU μs/请求</th><th>P95 ms</th><th>客户端 CPU %</th><th>RSS MiB</th><th>GC 后堆 MiB</th></tr></thead><tbody>
${stage.groups.map((g) => `<tr><td>${escape(g.framework)}</td><td>${escape(g.mode)}</td><td>${number(g.rps, 0)}</td><td>${number(g.cpuUs, 3)}</td><td>${number(g.p95Ms, 3)}</td><td>${number(g.clientCpu, 1)}</td><td>${number(g.rssMiB)}</td><td>${number(g.heapMiB)}</td></tr>`).join("")}
</tbody></table></div><details><summary>实验实现和兼容性限制</summary><pre>${escape(JSON.stringify(stage.raw.experiments?.variants ?? {}, null, 2))}</pre></details></section>`).join("");
writeFileSync(`${output}.html`, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>erest 优化探索</title><style>body{font:15px/1.65 system-ui,sans-serif;max-width:1400px;margin:36px auto;padding:0 24px;color:#193047;background:#f5f7f9}section{margin:28px 0;padding:24px;background:#fff;border:1px solid #dae1e8;border-radius:10px}h1{font-size:30px}h2{font-size:21px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap;font-size:13px}td,th{padding:9px 12px;text-align:right;border-bottom:1px solid #e1e7ec}th{background:#edf2f6}td:first-child,td:nth-child(2),th:first-child,th:nth-child(2){text-align:left}pre{overflow:auto;font-size:12px}details{margin-top:20px}</style><h1>erest HTTP 优化探索</h1><p>每个候选与同轮 erest 对照比较；正吞吐变化表示更快，负 CPU 变化表示每请求更省 CPU。范围反映轮间波动，并非置信区间。诊断变体可能改变语义，兼容性限制见每轮实验清单。CPU profile 仅用于定位，没有混入收益比较。</p><p>客户端接近一个逻辑核时可能限制吞吐；RSS 为 V8 运行时快照，不能单凭该值推断内存泄漏。结果仅适用于此请求模型。</p>${findingsHtml}${sections}</html>`);
console.log(JSON.stringify(stages.map((stage) => ({ input: stage.input, comparisons: stage.comparisons.map(({pairs, ...rest}) => rest) })), null, 2));
console.log(`Saved ${output}.json and ${output}.html`);
