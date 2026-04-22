/**
 * Audit log viewer — admin only.
 *
 * Supports filtering by actor (userId), entity (kind + id), action kind,
 * and a date range. Default returns the last 200 entries ordered by newest.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import { requireRole } from "../middleware/rbac.js";

export const auditRouter = Router();

auditRouter.use(requireRole("admin"));

auditRouter.get("/", async (req, res, next) => {
  try {
    const { userId, entity, entityId, action, from, to, take } = req.query as Record<
      string,
      string | undefined
    >;
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    const limit = Math.min(Number(take ?? 200), 1000);
    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    ok(res, entries);
  } catch (e) {
    next(e);
  }
});

// Aggregate stats for the dashboard: counts by entity + by action, last 30 days.
auditRouter.get("/stats", async (_req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byEntity, byAction, total] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ["entity"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      prisma.auditLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);
    ok(res, {
      total,
      byEntity: Object.fromEntries(byEntity.map((r) => [r.entity, r._count._all])),
      byAction: Object.fromEntries(byAction.map((r) => [r.action, r._count._all])),
    });
  } catch (e) {
    next(e);
  }
});
