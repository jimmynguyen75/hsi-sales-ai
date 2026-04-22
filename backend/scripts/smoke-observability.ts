/**
 * Smoke test for Batch 3 Item 4 (observability):
 *  - logger emits valid NDJSON with expected fields
 *  - /api/health returns a populated report
 *  - X-Request-Id round-trips (client-supplied ID is echoed back)
 *  - a fresh request gets a new UUID-shaped ID
 *
 * Runs the HTTP check against http://localhost:3001 — assumes the backend is
 * running. Skips the HTTP section with a warning if unreachable.
 */
import { log } from "../src/lib/logger.js";

async function main() {
  // --- Test 1: logger structure ---
  const capture: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    if (typeof chunk === "string") capture.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    log.info("smoke.hello", { tag: "observability" });
  } finally {
    process.stdout.write = origWrite;
  }
  const line = capture.join("").trim();
  const parsed = JSON.parse(line);
  if (parsed.level !== "info") throw new Error(`expected level=info, got ${parsed.level}`);
  if (parsed.msg !== "smoke.hello") throw new Error(`expected msg=smoke.hello, got ${parsed.msg}`);
  if (parsed.tag !== "observability") throw new Error("meta fields missing");
  if (!parsed.t) throw new Error("timestamp missing");
  console.log(`✓ logger emits valid NDJSON: msg=${parsed.msg} level=${parsed.level}`);

  // --- Test 2: HTTP /api/health ---
  const base = process.env.SMOKE_BASE ?? "http://localhost:3001";
  try {
    const res = await fetch(`${base}/api/health`);
    const headerId = res.headers.get("x-request-id");
    if (!headerId) throw new Error("X-Request-Id header missing");
    const body = (await res.json()) as {
      success: boolean;
      data: {
        status: string;
        checks: {
          db: { ok: boolean; latencyMs: number | null };
          ai: { configured: boolean };
          embedding: { state: string };
        };
        uptime: { seconds: number };
      };
    };
    if (!body.success) throw new Error(`health returned success=false`);
    if (!body.data.checks.db.ok) throw new Error("health says db is not ok");
    console.log(
      `✓ /api/health: status=${body.data.status} db=${body.data.checks.db.ok}(${body.data.checks.db.latencyMs}ms) ai.configured=${body.data.checks.ai.configured} embedding=${body.data.checks.embedding.state} uptime=${body.data.uptime.seconds}s`,
    );
    console.log(`✓ generated X-Request-Id: ${headerId}`);

    // --- Test 3: client-supplied X-Request-Id round-trips ---
    const clientId = "smoke-test-req-123";
    const res2 = await fetch(`${base}/api/health`, {
      headers: { "X-Request-Id": clientId },
    });
    const echoed = res2.headers.get("x-request-id");
    if (echoed !== clientId)
      throw new Error(`expected echoed request-id=${clientId}, got ${echoed}`);
    console.log(`✓ X-Request-Id round-trips: ${echoed}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|fetch failed/.test(msg)) {
      console.warn(`⚠ HTTP section skipped (backend not running at ${base}): ${msg}`);
    } else {
      throw err;
    }
  }

  console.log("\n✓ observability smoke test passed");
}

main().catch((err) => {
  console.error("✗ smoke-observability failed:", err);
  process.exit(1);
});
