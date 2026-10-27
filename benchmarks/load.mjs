import http from "node:http";
import { performance } from "node:perf_hooks";
import { payload, path } from "./fixture.mjs";

// Closed-loop HTTP/1.1 keep-alive, one outstanding request per connection.
// Separate client/server processes; report client CPU to expose generator limits.
// Includes full response consumption, but correctness is checked before timing.
export async function load(port, scenario, concurrency, durationMs) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency, maxFreeSockets: concurrency });
  const body = scenario === "get" ? undefined : JSON.stringify(payload);
  const options = {
    host: "127.0.0.1",
    port,
    agent,
    method: body ? "POST" : "GET",
    path: body ? path : "/ping",
    headers: body
      ? {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        }
      : {},
  };
  // 1us histogram resolution through 2s; last bucket counts longer responses.
  const histogram = new Uint32Array(2_000_001);
  let count = 0,
    errors = 0,
    totalLatency = 0,
    maxLatency = 0;
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  const deadline = start + durationMs;
  await Promise.all(
    Array.from(
      { length: concurrency },
      () =>
        new Promise((resolve) => {
          function next() {
            if (performance.now() >= deadline) return resolve();
            const requestStart = performance.now();
            let finished = false;
            function complete(failed) {
              if (finished) return;
              finished = true;
              const latency = performance.now() - requestStart;
              count++;
              if (failed) errors++;
              totalLatency += latency;
              maxLatency = Math.max(maxLatency, latency);
              histogram[Math.min(2_000_000, Math.floor(latency * 1000))]++;
              next();
            }
            const req = http.request(options, (res) => {
              res.resume();
              res.once("end", () => complete(res.statusCode !== 200));
              res.once("error", () => complete(true));
            });
            req.setTimeout(5000, () => req.destroy(new Error("request timeout")));
            req.once("error", () => complete(true));
            req.end(body);
          }
          next();
        })
    )
  );
  const elapsedMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  agent.destroy();
  function percentile(p) {
    const target = Math.ceil(count * p);
    let n = 0;
    for (let i = 0; i < histogram.length; i++) {
      n += histogram[i];
      if (n >= target) return i / 1000;
    }
    return null;
  }
  return {
    requests: count,
    errors,
    elapsedMs,
    rps: (count * 1000) / elapsedMs,
    latencyMs: {
      mean: totalLatency / count,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: maxLatency,
    },
    clientCpuPercent: (cpu.user + cpu.system) / (elapsedMs * 10),
  };
}
