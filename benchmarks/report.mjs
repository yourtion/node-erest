// node benchmarks/report.mjs benchmarks/results/2026-10-27.json
// Produces self-contained HTML plus summary JSON and CSV beside the raw samples.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import assert from "node:assert/strict";

const input = resolve(process.argv[2] || "benchmarks/results/latest.json");
const data = JSON.parse(readFileSync(input, "utf8"));
assert(data.finishedAt, "The benchmark is still running; do not publish a partial report.");
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
const grouped = new Map();
for (const sample of data.samples) {
  const key = [sample.framework, sample.scenario, sample.concurrency, sample.mode].join("/");
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(sample);
}
const fields = {
  rps: (s) => s.rps,
  meanMs: (s) => s.latencyMs.mean,
  p50Ms: (s) => s.latencyMs.p50,
  p95Ms: (s) => s.latencyMs.p95,
  p99Ms: (s) => s.latencyMs.p99,
  serverCpuPercent: (s) => s.serverCpuPercent,
  clientCpuPercent: (s) => s.clientCpuPercent,
  cpuUsPerRequest: (s) => s.serverCpuUsPerRequest,
  rssMiB: (s) => s.serverRssMiB,
  retainedHeapMiB: (s) => s.serverRetainedHeapMiB,
  idleRssMiB: (s) => s.idleRssMiB,
};
const groups = [...grouped.values()].map((samples) => ({
  framework: samples[0].framework,
  scenario: samples[0].scenario,
  concurrency: samples[0].concurrency,
  mode: samples[0].mode,
  rounds: samples.length,
  requests: samples.reduce((sum, s) => sum + s.requests, 0),
  errors: samples.reduce((sum, s) => sum + s.errors, 0),
  ...Object.fromEntries(Object.entries(fields).map(([name, getter]) => [name, median(samples.map(getter))])),
  rpsMin: Math.min(...samples.map((s) => s.rps)),
  rpsMax: Math.max(...samples.map((s) => s.rps)),
  rpsByRound: samples.map((s) => ({ round: s.round, rps: s.rps })),
}));
const comparisons = [];
for (const erest of groups.filter((g) => g.mode === "erest")) {
  for (const baseline of groups.filter(
    (g) =>
      g.mode !== "erest" &&
      g.framework === erest.framework &&
      g.scenario === erest.scenario &&
      g.concurrency === erest.concurrency
  )) {
    const paired = erest.rpsByRound
      .map((entry) => {
        const base = baseline.rpsByRound.find((r) => r.round === entry.round);
        return base ? (entry.rps / base.rps - 1) * 100 : null;
      })
      .filter((v) => v !== null);
    comparisons.push({
      framework: erest.framework,
      scenario: erest.scenario,
      concurrency: erest.concurrency,
      baseline: baseline.mode,
      throughputChangePercent: (erest.rps / baseline.rps - 1) * 100,
      pairedChangePercent: {
        median: median(paired),
        min: Math.min(...paired),
        max: Math.max(...paired),
        values: paired,
      },
      meanLatencyDeltaMs: erest.meanMs - baseline.meanMs,
      p95DeltaMs: erest.p95Ms - baseline.p95Ms,
      cpuDeltaUsPerRequest: erest.cpuUsPerRequest - baseline.cpuUsPerRequest,
      retainedHeapDeltaMiB: erest.retainedHeapMiB - baseline.retainedHeapMiB,
      rssDeltaMiB: erest.rssMiB - baseline.rssMiB,
    });
  }
}
const summary = { input: basename(input), commit: data.commit, config: data.config, groups, comparisons };
const prefix = input.replace(/\.json$/, "");
writeFileSync(`${prefix}-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
const csvFields = Object.keys(groups[0]);
writeFileSync(
  `${prefix}-summary.csv`,
  [
    csvFields.join(","),
    ...groups.map((g) =>
      csvFields
        .map((key) => (typeof g[key] === "object" ? `"${JSON.stringify(g[key]).replaceAll('"', '""')}"` : g[key]))
        .join(",")
    ),
  ].join("\n") + "\n"
);

const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const n = (value, digits = 2) =>
  Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 2) => `${value >= 0 ? "+" : ""}${n(value, digits)}`;
const label = {
  get: "GET · 无 schema",
  post: "POST · params + query + 嵌套 body",
  io5: "POST · 同等校验 + 5ms 异步等待",
};
const modes = { native: "原生 · 无校验", "native-zod": "原生 + Zod", erest: "erest" };
const total = data.samples.reduce((sum, s) => sum + s.requests, 0);
const errors = data.samples.reduce((sum, s) => sum + s.errors, 0);
const table = (heads, rows) =>
  `<div class="scroll"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const row = (g, cells) =>
  `<tr data-framework="${g.framework}" data-scenario="${g.scenario}" data-concurrency="${g.concurrency}">${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const comparisonTable = table(
  [
    "框架",
    "场景",
    "并发",
    "比较基线",
    "吞吐变化",
    "配对轮次变化范围",
    "平均延迟变化 ms",
    "P95 变化 ms",
    "CPU 增量 μs/请求",
    "GC 后堆增量 MiB",
  ],
  comparisons.map((c) =>
    row(c, [
      c.framework,
      label[c.scenario],
      c.concurrency,
      modes[c.baseline],
      `<strong>${signed(c.throughputChangePercent)}%</strong>`,
      `${signed(c.pairedChangePercent.min)}% ～ ${signed(c.pairedChangePercent.max)}%`,
      signed(c.meanLatencyDeltaMs, 3),
      signed(c.p95DeltaMs, 3),
      signed(c.cpuDeltaUsPerRequest),
      signed(c.retainedHeapDeltaMiB),
    ])
  )
);
const detailTable = table(
  [
    "框架",
    "场景",
    "并发",
    "实现",
    "req/s 中位数",
    "req/s 范围",
    "平均 ms",
    "P50 ms",
    "P95 ms",
    "P99 ms",
    "CPU μs/请求",
    "服务端 CPU %",
    "客户端 CPU %",
    "RSS MiB",
    "GC 后堆 MiB",
    "错误",
  ],
  groups.map((g) =>
    row(g, [
      g.framework,
      label[g.scenario],
      g.concurrency,
      modes[g.mode],
      n(g.rps, 0),
      `${n(g.rpsMin, 0)} ～ ${n(g.rpsMax, 0)}`,
      n(g.meanMs, 3),
      n(g.p50Ms, 3),
      n(g.p95Ms, 3),
      n(g.p99Ms, 3),
      n(g.cpuUsPerRequest),
      n(g.serverCpuPercent, 1),
      n(g.clientCpuPercent, 1),
      n(g.rssMiB),
      n(g.retainedHeapMiB),
      g.errors,
    ])
  )
);
const charts = data.config.frameworks
  .map((framework) => {
    const selected = groups.filter((g) => g.framework === framework && g.concurrency === 50 && g.scenario === "post");
    const max = Math.max(...selected.map((g) => g.rps));
    return `<article><h3>${framework} · POST · 50 并发</h3>${selected.map((g) => `<div class="barrow"><span>${modes[g.mode]}</span><div class="track"><div class="bar ${g.mode}" style="width:${(g.rps / max) * 100}%"></div></div><b>${n(g.rps, 0)}</b></div>`).join("")}<p class="muted">单位 req/s；${data.config.rounds} 轮中位数，越高越好。</p></article>`;
  })
  .join("");

const findings = comparisons
  .filter((c) => c.scenario === "post" && c.concurrency === 50 && c.baseline === "native-zod")
  .map(
    (c) =>
      `<li><strong>${c.framework}</strong>：同等请求校验下，erest 吞吐变化 ${signed(c.throughputChangePercent)}%，` +
      `每请求服务端 CPU 时间变化 ${signed(c.cpuDeltaUsPerRequest)} μs；平均延迟变化 ${signed(c.meanLatencyDeltaMs, 3)} ms。` +
      (c.pairedChangePercent.min <= 0 && c.pairedChangePercent.max >= 0
        ? "配对轮次差异跨过零，尚不能确定稳定的吞吐变化方向。"
        : `本次各配对轮次方向一致，但 ${data.config.rounds} 轮不足以给出统计显著性结论。`) +
      "</li>"
  )
  .join("");
const ioFindings = comparisons
  .filter((c) => c.scenario === "io5" && c.concurrency === 50)
  .map((c) => `${c.framework} ${signed(c.throughputChangePercent)}%`)
  .join("，");

const shellQuote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";
const settings = [
  ["BENCH_FRAMEWORKS", data.config.frameworks.join(",")],
  ["BENCH_SCENARIOS", data.config.scenarios.join(",")],
  ["BENCH_CONCURRENCY", data.config.concurrency.join(",")],
  ["BENCH_ROUNDS", data.config.rounds],
  ["BENCH_MS", data.config.durationMs],
  ["BENCH_WARMUP_MS", data.config.warmupMs],
  ["BENCH_OUT", `benchmarks/results/${basename(input)}`],
]
  .map(([name, value]) => `${name}=${shellQuote(value)}`)
  .join(" ");
const command = `npm run build
npm run build --prefix packages/erest-express
npm run build --prefix packages/erest-koa
npm run build --prefix packages/erest-leizmweb

# macOS / Linux：用本报告的场景、时长和轮数复测
${settings} node benchmarks/run.mjs
node benchmarks/report.mjs ${shellQuote(`benchmarks/results/${basename(input)}`)}

# Linux 可选 CPU 绑定；核心编号按本机允许列表调整
BENCH_SERVER_CPU=${shellQuote(data.config.serverCpu ?? "0")} ${settings} taskset -c ${shellQuote(data.environment.clientAffinity ?? "1")} node benchmarks/run.mjs

# 快速试跑（仅检查脚本，不用于性能结论）
BENCH_ROUNDS=1 BENCH_MS=100 BENCH_WARMUP_MS=100 BENCH_OUT=/tmp/erest-smoke.json node benchmarks/run.mjs`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>erest ${escape(data.environment.versions.erest)} 性能实测</title>
<style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#172d41;background:#f2f5f8;line-height:1.6}body{max-width:1480px;margin:32px auto;padding:0 24px}h1{font-size:32px;line-height:1.3}h2{font-size:22px;margin-top:36px}h3{margin-top:0;font-size:17px}p{max-width:1080px}.muted{color:#5b6c7a;font-size:13px}.stats,.charts{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card,article{background:white;border:1px solid #d9e1e9;border-radius:12px;padding:20px}.card b{display:block;font-size:28px}.scroll{overflow:auto;background:white;border:1px solid #d9e1e9;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th,td{padding:12px 14px;text-align:right;border-bottom:1px solid #e6ebef}th{background:#e9eff4}th:nth-child(-n+4),td:nth-child(-n+4){text-align:left}tr:hover{background:#f5f8fa}select{font:inherit;padding:6px 12px;border:1px solid #aabcca;border-radius:6px;margin:0 20px 10px 6px}code,pre{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;background:#132b40;color:#d8e9f5;padding:22px;border-radius:10px;font-size:13px;overflow:auto}.barrow{display:grid;grid-template-columns:110px 1fr 58px;align-items:center;gap:8px;margin:16px 0;font-size:13px}.track{background:#eef2f5;height:22px}.bar{height:22px;background:#7a8fa3}.bar.native-zod{background:#3684b8}.bar.erest{background:#008879}.barrow b{text-align:right}li{max-width:1100px;margin:8px 0}.callout{padding:16px 20px;border-left:4px solid #008879;background:#e5f2ef}a{color:#126993}@media(max-width:900px){.stats,.charts{grid-template-columns:1fr}body{padding:0 14px}}
</style>
<h1>erest 接入前后性能实测</h1>
<p class="muted">完成时间 ${escape(data.finishedAt)} · erest ${escape(data.environment.versions.erest)} · commit ${escape(data.commit)}</p>
<div class="stats"><div class="card"><b>${data.samples.length}</b>独立进程采样 · ${data.config.rounds} 轮重复</div><div class="card"><b>${n(total, 0)}</b>计时区间 HTTP 请求</div><div class="card"><b>${errors}</b>计时区间 HTTP / 网络错误</div></div>
<p class="callout">重点看“原生 + Zod → erest”：这衡量已有同等校验时的接入成本。“原生无校验 → erest”还包含新增参数校验的成本。具体差异见下表；接近轮间波动的差异不能当成稳定提升或回退。</p>
<h2>典型 POST 的吞吐量</h2><div class="charts">${charts}</div>
<h2>本次观察</h2><ul>${findings}</ul>
<p>加入 5ms 异步等待后，同等校验基线下的吞吐变化为：${ioFindings || "本次未测"}。这只是固定等待模型；线上数据库、连接池和下游服务的瓶颈会改变结果。</p>
<p>从实现看，bind 阶段预组装校验函数和中间件链，但每个请求仍会创建 Context、Reply、分层校验结果、扁平参数和 registerTyped 的请求对象，并执行 Promise 调度。因此“预编译”不等于整个接入层零分配或零开销。后续优化可优先检查这些路径；本次没有做分配剖析或逐项优化实验，不能把实测差异拆分归因到某一项。</p>
<h2>接入影响与原始指标</h2>
<p>吞吐变化 = erest 吞吐中位数 ÷ 基线吞吐中位数 − 1；负值表示下降。配对范围按同轮次计算，不是置信区间。延迟是客户端从发起请求到读完响应的时间；50 并发时包含排队与调度，不能把延迟差当作纯 erest 执行时间。表内延迟分位数为各轮分位数的中位数，不是合并所有请求后的分位数。</p>
<label>框架<select id="framework"><option value="all">全部</option>${data.config.frameworks.map((f) => `<option>${f}</option>`).join("")}</select></label>
<label>场景<select id="scenario"><option value="all">全部</option>${data.config.scenarios.map((s) => `<option value="${s}">${label[s]}</option>`).join("")}</select></label>
<label>并发<select id="concurrency"><option value="all">全部</option>${data.config.concurrency.map((c) => `<option>${c}</option>`).join("")}</select></label>
${comparisonTable}<h3 style="margin-top:24px">各组完整指标</h3>${detailTable}
<h2>方法与边界</h2><ul>
<li>测量编译后的 ESM 产物，服务端 NODE_ENV=production、DEBUG 关闭；每次采样独立启动一个服务进程，客户端与服务端使用 HTTP/1.1 keep-alive，关闭流水线，每连接最多一个在途请求。客户端用 Node 原生 http 模块，不引入压测依赖。</li>
<li>每组预热 ${data.config.warmupMs / 1000} 秒，采样 ${data.config.durationMs / 1000} 秒，重复 ${data.config.rounds} 轮。每轮轮换框架顺序和实现顺序；逐次执行，避免多组压测争抢资源。每个计时区间结束时排空在途请求，RPS 使用实际耗时。</li>
<li>GET 返回固定 JSON，无 schema；POST 校验路径 id、query 的数字转换/默认值、body 的字符串/整数/email/数组/嵌套对象。原生 + Zod 使用相同 schema.safeParse；erest POST 使用 registerTyped。模拟 I/O 的场景在同一 POST 逻辑中额外等待 setTimeout(5)，不是实际数据库或远程服务。</li>
<li>原生基线使用框架路由和 JSON body parser，erest 组使用同一套中间件；响应 JSON 内容通过预检核对，非法 age 在校验组必须被拒绝。Koa 基线显式按适配器行为进行 JSON.stringify 和 Content-Type 设置。计时区间仅发送合法请求；不包含错误路径性能评测。</li>
<li>未开启 hooks、response schema、信封包装、文档生成、日志、数据库或鉴权。文档生成不进入本次请求热路径；本报告不能说明这些可选功能的性能。每个应用仅注册一个路由，不测大量路由匹配、不同 body 大小或启动时间。</li>
<li>CPU μs/请求来自服务进程 user+system CPU 时间，包含框架、GC 和 JIT 的成本，独立于客户端 CPU。CPU 100% 为一个逻辑核。客户端 CPU 接近 100% 时，吞吐可能受发压能力限制，不能视为服务端容量上限。</li>
<li>RSS 是压测结束时快照，GC 后堆是在结束计时后强制 GC 得到的存活堆；服务进程开始测量前也会 GC，计时期间不主动 GC。RSS 包含 V8、JIT、原生内存，不等于逐请求分配量；短测不能证明是否存在内存泄漏。所有组的 fixture 都加载 Zod，因此无校验基线不是最小依赖部署的总内存。</li>
<li>本次是单机本地回环对照，使用 ${data.config.rounds} 轮，展示范围以便判断噪声。不能外推线上绝对 QPS，也未建立统计显著性或长期容量结论。I/O 等待固定为 5ms，结果也会受到定时器与排队影响。</li>
</ul>
<h2>环境与复现</h2><p>${escape(data.environment.cpu)} · ${escape(data.environment.node)} · ${escape(data.environment.os)}<br>
cgroup CPU 配额 ${escape(data.environment.cpuMax ?? "未提供")}；内存限额 ${escape(data.environment.memoryMax ?? "未提供")} 字节；服务端 CPU ${escape(data.config.serverCpu ?? "未固定")}；客户端 CPU ${escape(data.environment.clientAffinity ?? "由操作系统调度")}。</p>
<pre>${escape(JSON.stringify(data.environment.versions, null, 2))}</pre><pre>${escape(command)}</pre>
<p>可通过 BENCH_FRAMEWORKS、BENCH_SCENARIOS、BENCH_CONCURRENCY 筛选；BENCH_ROUNDS、BENCH_MS、BENCH_WARMUP_MS 调整重复次数和时长；BENCH_OUT 指定输出路径。默认完整运行约需 9 分钟（取决于机器）。CPU 绑定仅用于 Linux，需按机器允许的核心编号调整。</p>
<p>原始数据：<a href="${escape(basename(input))}">${escape(basename(input))}</a> · <a href="${escape(basename(prefix))}-summary.csv">汇总 CSV</a> · <a href="${escape(basename(prefix))}-summary.json">汇总 JSON</a>。原始数据记录了采样脚本 SHA-256，便于核对复现版本。</p>
<script>function filter(){for(const row of document.querySelectorAll('tr[data-framework]')){row.hidden=['framework','scenario','concurrency'].some(key=>{const value=document.getElementById(key).value;return value!=='all'&&row.dataset[key]!==value})}}for(const select of document.querySelectorAll('select'))select.addEventListener('change',filter);</script>
</html>`;
writeFileSync(`${prefix}.html`, html);
console.log(`Report: ${prefix}.html`);
console.log(
  JSON.stringify(
    comparisons.filter((c) => c.concurrency === 50),
    null,
    2
  )
);
