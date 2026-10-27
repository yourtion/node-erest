// Build first: pnpm run build && pnpm run build:packages
// Full run: node benchmarks/run.mjs
// Smoke: BENCH_ROUNDS=1 BENCH_MS=100 BENCH_WARMUP_MS=100 node benchmarks/run.mjs
// Filter: BENCH_FRAMEWORKS=express BENCH_SCENARIOS=post BENCH_CONCURRENCY=50 ...
import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { expectedGet, expectedPost, payload, path } from "./fixture.mjs";
import { load } from "./load.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const list = (name, fallback) => (process.env[name] || fallback).split(",");
const config = {
  frameworks: list("BENCH_FRAMEWORKS", "express,koa,leizmweb,h3"),
  scenarios: list("BENCH_SCENARIOS", "get,post,io5"),
  concurrency: list("BENCH_CONCURRENCY", "1,50").map(Number),
  rounds: Number(process.env.BENCH_ROUNDS || 3),
  durationMs: Number(process.env.BENCH_MS || 3000),
  warmupMs: Number(process.env.BENCH_WARMUP_MS || 1500),
  serverCpu: process.env.BENCH_SERVER_CPU || null,
};
assert(Number.isInteger(config.rounds) && config.rounds > 0, "BENCH_ROUNDS must be a positive integer");
assert(Number.isFinite(config.durationMs) && config.durationMs > 0, "BENCH_MS must be positive and finite");
assert(Number.isFinite(config.warmupMs) && config.warmupMs > 0, "BENCH_WARMUP_MS must be positive and finite");
assert(config.concurrency.every((c) => Number.isInteger(c) && c > 0));
assert(
  config.frameworks.every((f) => ["express", "koa", "leizmweb", "h3"].includes(f)),
  "Unknown BENCH_FRAMEWORKS value"
);
assert(
  config.scenarios.every((s) => ["get", "post", "io5"].includes(s)),
  "Unknown BENCH_SCENARIOS value"
);
assert(!config.serverCpu || process.platform === "linux", "BENCH_SERVER_CPU uses Linux taskset; omit it on macOS");
const destination = resolve(root, process.env.BENCH_OUT || "benchmarks/results/latest.json");
mkdirSync(dirname(destination), { recursive: true });
const experiments = process.env.BENCH_VARIANTS_FILE
  ? JSON.parse(readFileSync(resolve(process.env.BENCH_VARIANTS_FILE), "utf8"))
  : null;
const selectedVariants = experiments
  ? list("BENCH_VARIANTS", Object.keys(experiments.variants).join(","))
  : [];
assert(selectedVariants.every((name) => experiments.variants[name]), "Unknown BENCH_VARIANTS value");
if (process.env.BENCH_PROFILE_DIR) mkdirSync(resolve(process.env.BENCH_PROFILE_DIR), { recursive: true });
function read(filePath) {
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}
function version(filePath) {
  return JSON.parse(read(resolve(root, filePath))).version;
}
const result = {
  startedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  harnessSha256: Object.fromEntries(
    ["fixture.mjs", "load.mjs", "server.mjs", "run.mjs"].map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(resolve(root, "benchmarks", name)))
        .digest("hex"),
    ])
  ),
  environment: {
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    platform: os.platform(),
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    availableParallelism: os.availableParallelism(),
    systemMemoryBytes: os.totalmem(),
    cpuMax: read("/sys/fs/cgroup/cpu.max"),
    memoryMax: read("/sys/fs/cgroup/memory.max"),
    clientAffinity: read("/proc/self/status")?.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1],
    versions: Object.fromEntries(
      [
        "",
        "packages/erest-express/",
        "packages/erest-koa/",
        "packages/erest-leizmweb/",
        "node_modules/express/",
        "node_modules/koa/",
        "node_modules/koa-router/",
        "node_modules/koa-bodyparser/",
        "node_modules/@leizm/web/",
        "node_modules/zod/",
        ...(config.frameworks.includes("h3") ? ["packages/erest-h3/", "node_modules/h3/"] : []),
      ].map((p) => [p || "erest", version(`${p}package.json`)])
    ),
  },
  config,
  ...(experiments ? { experiments, selectedVariants } : {}),
  samples: [],
};
function save() {
  writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
}
function message(child, type, send) {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => done(new Error(`IPC timeout: ${type}`)), 15000);
    function done(error, value) {
      clearTimeout(timer);
      child.off("message", received);
      child.off("exit", exited);
      child.off("error", done);
      if (error) reject(error);
      else accept(value);
    }
    function received(value) {
      if (value.type === type) done(null, value);
    }
    function exited(code) {
      done(new Error(`Server exited before ${type}: ${code}`));
    }
    child.on("message", received);
    child.once("exit", exited);
    child.once("error", done);
    if (send) child.send({ type: send });
  });
}
async function sample(framework, scenario, concurrency, mode, round) {
  const variant = experiments?.variants[mode];
  const profileArgs = process.env.BENCH_PROFILE_DIR
    ? ["--cpu-prof", `--cpu-prof-dir=${resolve(process.env.BENCH_PROFILE_DIR)}`, `--cpu-prof-name=${framework}-${scenario}-c${concurrency}-${mode}-r${round}.cpuprofile`]
    : [];
  assert(!config.serverCpu || !profileArgs.length, "Use profiling separately from CPU affinity runs");
  const child = fork(resolve(root, "benchmarks/server.mjs"), [framework, variant ? "erest" : mode, scenario], {
    cwd: root,
    ...(config.serverCpu
      ? { execPath: "/usr/bin/taskset", execArgv: ["-c", config.serverCpu, process.execPath, "--expose-gc"] }
      : { execArgv: ["--expose-gc", ...profileArgs] }),
    env: { ...process.env, BENCH_RUNTIME_ROOT: variant ? resolve(root, variant.runtimeRoot) : "", NODE_ENV: "production", DEBUG: "" },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  try {
    const ready = await message(child, "ready");
    const url = `http://127.0.0.1:${ready.port}`;
    const options =
      scenario === "get"
        ? {}
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
    const response = await fetch(url + (scenario === "get" ? "/ping" : path), options);
    assert.equal(response.status, 200, "Unexpected preflight status");
    assert.deepEqual(await response.json(), scenario === "get" ? expectedGet : expectedPost);
    // Verify that both validated paths actually reject bad input.
    if (scenario !== "get" && mode !== "native") {
      const invalid = await fetch(url + path, { ...options, body: JSON.stringify({ ...payload, age: "bad" }) });
      assert(invalid.status >= 400, "Validation did not reject invalid input");
      await invalid.arrayBuffer();
    }
    await load(ready.port, scenario, concurrency, config.warmupMs);
    await message(child, "started", "start");
    const client = await load(ready.port, scenario, concurrency, config.durationMs);
    const server = await message(child, "stats", "stop");
    assert.equal(client.errors, 0, "Load generated HTTP/network errors");
    const measurement = {
      framework,
      scenario,
      concurrency,
      mode,
      round,
      ...client,
      serverCpuPercent: (server.cpu.user + server.cpu.system) / (server.elapsedMs * 10),
      serverCpuUsPerRequest: (server.cpu.user + server.cpu.system) / client.requests,
      serverRssMiB: server.memory.rss / 2 ** 20,
      serverRetainedHeapMiB: server.retainedMemory.heapUsed / 2 ** 20,
      idleRssMiB: ready.idleMemory.rss / 2 ** 20,
      server,
      idleMemory: ready.idleMemory,
    };
    result.samples.push(measurement);
    save();
    console.log(
      `${result.samples.length}: ${framework} ${scenario} c${concurrency} ${mode} r${round}: ` +
        `${client.rps.toFixed(0)} req/s, p95 ${client.latencyMs.p95.toFixed(3)}ms, ` +
        `server ${measurement.serverCpuPercent.toFixed(0)}% client ${client.clientCpuPercent.toFixed(0)}%`
    );
  } finally {
    if (child.exitCode === null && child.connected) {
      const exited = once(child, "exit");
      child.send({ type: "close" });
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(timer);
    }
  }
}

const start = performance.now();
save();
// Rotate mode order each round, and framework order, to reduce temporal bias.
for (let round = 1; round <= config.rounds; round++) {
  const offset = (round - 1) % config.frameworks.length;
  for (const framework of [...config.frameworks.slice(offset), ...config.frameworks.slice(0, offset)]) {
    for (const scenario of config.scenarios) {
      const modes = experiments
        ? ["native-zod", "erest", ...selectedVariants.filter((name) => experiments.variants[name].frameworks.includes(framework))]
        : scenario === "get"
          ? ["native", "erest"]
          : scenario === "io5"
            ? ["native-zod", "erest"]
            : ["native", "native-zod", "erest"];
      for (const concurrency of config.concurrency) {
        if (scenario === "io5" && concurrency === 1) continue;
        const shift = (round - 1) % modes.length;
        for (const mode of [...modes.slice(shift), ...modes.slice(0, shift)]) {
          await sample(framework, scenario, concurrency, mode, round);
        }
      }
    }
  }
}
result.finishedAt = new Date().toISOString();
result.elapsedSeconds = (performance.now() - start) / 1000;
save();
console.log(`Saved ${result.samples.length} samples to ${destination}`);
