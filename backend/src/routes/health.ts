import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { assessHealth } from "../services/crm-ai.js";

export const healthRouter = Router();

// GET /api/health-dashboard — summary of all user's accounts with current health
healthRouter.get("/dashboard", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const accounts = await prisma.account.findMany({
      where: { ownerId: userId },
      orderBy: [{ healthScore: "asc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { deals: true, activities: true } },
        healthSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const buckets = {
      healthy: 0,
      watch: 0,
      at_risk: 0,
      critical: 0,
      unassessed: 0,
    };
    for (const a of accounts) {
      const latest = a.healthSnapshots[0];
      if (!latest) {
        buckets.unassessed += 1;
        continue;
      }
      const lv = latest.riskLevel as keyof typeof buckets;
      if (lv in buckets) buckets[lv] += 1;
      else buckets.unassessed += 1;
    }

    const rows = accounts.map((a) => {
      const latest = a.healthSnapshots[0];
      return {
        id: a.id,
        companyName: a.companyName,
        industry: a.industry,
        size: a.size,
        healthScore: a.healthScore,
        riskLevel: (latest?.riskLevel as string | undefined) ?? null,
        explanation: latest?.explanation ?? null,
        factors: latest?.factors ?? null,
        lastAssessedAt: latest?.createdAt ?? null,
        dealsCount: a._count.deals,
        activitiesCount: a._count.activities,
      };
    });

    ok(res, { buckets, rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/health-dashboard/:accountId/history — timeline of snapshots
healthRouter.get("/:accountId/history", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!account || account.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const snaps = await prisma.healthSnapshot.findMany({
      where: { accountId: req.params.accountId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    ok(res, snaps);
  } catch (e) {
    next(e);
  }
});

// POST /api/health-dashboard/bulk-refresh — refresh all accounts' health (rate-limited by AI layer)
healthRouter.post("/bulk-refresh", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { limit } = req.query as { limit?: string };
    const max = Math.min(Number(limit ?? "5") || 5, 10);

    const accounts = await prisma.account.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      take: max,
      select: { id: true, companyName: true },
    });

    const results: Array<{ id: string; companyName: string; score?: number; error?: string }> = [];
    for (const a of accounts) {
      try {
        const r = await assessHealth(a.id, userId);
        results.push({ id: a.id, companyName: a.companyName, score: r.score });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ id: a.id, companyName: a.companyName, error: msg });
        // If rate limit hit, stop early
        if (/RATE_LIMIT/.test(msg)) break;
      }
    }

    ok(res, { processed: results.length, results });
  } catch (e) {
    next(e);
  }
});
