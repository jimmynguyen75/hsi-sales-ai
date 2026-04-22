/**
 * System health check.
 *
 * Unlike /api/health-dashboard (which is CRM account health), this reports
 * whether the backend itself is healthy: DB reachable, AI key configured,
 * embedding model loaded, process uptime.
 *
 * Unauthenticated — uptime checks need to hit this without a token. Careful
 * not to leak secrets in the response; we return presence flags only.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { isEmbeddingReady, isEmbeddingDisabled } from "../services/embeddings.js";

export const sysHealthRouter = Router();

sysHealthRouter.get("/", async (_req, res) => {
  const started = Date.now();

  // DB check: a trivial query that verifies the pool is connected.
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const aiConfigured = !!process.env.GROQ_API_KEY;
  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

  const embedding = isEmbeddingDisabled()
    ? "disabled"
    : isEmbeddingReady()
      ? "ready"
      : "lazy"; // will load on first use

  const overall = dbOk ? "ok" : "degraded";

  res.status(dbOk ? 200 : 503).json({
    success: true,
    data: {
      status: overall,
      checks: {
        db: { ok: dbOk, latencyMs: dbLatencyMs },
        ai: { configured: aiConfigured, provider: "groq" },
        smtp: { configured: smtpConfigured },
        embedding: { state: embedding },
      },
      uptime: {
        seconds: Math.round(process.uptime()),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      },
      env: process.env.NODE_ENV ?? "development",
      version: process.env.APP_VERSION ?? "dev",
      checkDurationMs: Date.now() - started,
    },
  });
});
