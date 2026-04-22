import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import { computeWinLossMetrics, generateWinLossInsights } from "../services/winloss-ai.js";

export const winlossRouter = Router();

const filtersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  vendor: z.string().optional(),
  productLine: z.string().optional(),
});

// GET /api/win-loss/metrics — on-demand aggregation (no AI)
winlossRouter.get("/metrics", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const filters = filtersSchema.parse(req.query);
    const metrics = await computeWinLossMetrics(userId, filters);
    ok(res, metrics);
  } catch (e) {
    next(e);
  }
});

// POST /api/win-loss/analyze — compute + AI insights + persist
const analyzeSchema = z.object({
  title: z.string().optional(),
  filters: filtersSchema.optional(),
});

winlossRouter.post("/analyze", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = analyzeSchema.parse(req.body);
    const filters = input.filters ?? {};
    const metrics = await computeWinLossMetrics(userId, filters);
    const aiInsights = await generateWinLossInsights(metrics, userId);

    const title =
      input.title ??
      `Win/Loss — ${new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

    const created = await prisma.winLossReport.create({
      data: {
        userId,
        title,
        filters: filters as unknown as Prisma.InputJsonValue,
        metrics: metrics as unknown as Prisma.InputJsonValue,
        aiInsights,
      },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

winlossRouter.get("/reports", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.winLossReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, createdAt: true, filters: true },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

winlossRouter.get("/reports/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const r = await prisma.winLossReport.findUnique({ where: { id: req.params.id } });
    if (!r || r.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, r);
  } catch (e) {
    next(e);
  }
});

winlossRouter.delete("/reports/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.winLossReport.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.winLossReport.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
