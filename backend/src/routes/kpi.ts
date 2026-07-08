/**
 * KPI targets + progress.
 *
 * Each sales rep sets one KpiTarget per fiscal year (revenue / gross profit /
 * new accounts). The dashboard reads GET /kpi/progress to compare targets
 * against achieved values:
 *   - revenue      = Σ value of pink (đã ký) deals in the FY
 *   - grossProfit  = Σ grossProfit of pink deals in the FY
 *   - newAccounts  = count of accounts created in the FY
 *
 * "Achieved" is scoped to the caller (their own deals/accounts). Admin can
 * read team-wide targets via GET /kpi/all.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

export const kpiRouter = Router();

const currentFY = () => new Date().getFullYear();

// Pink = signed contract. Legacy closed_won treated the same.
const WON_STAGES = ["pink", "closed_won"];

const upsertSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100).optional(),
  revenueTarget: z.number().nonnegative().optional().nullable(),
  grossProfitTarget: z.number().nonnegative().optional().nullable(),
  newAccountsTarget: z.number().int().nonnegative().optional().nullable(),
});

// GET /api/kpi — the caller's target for a fiscal year (default: current).
kpiRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const fy = Number(req.query.fiscalYear) || currentFY();
    const target = await prisma.kpiTarget.findUnique({
      where: { userId_fiscalYear: { userId, fiscalYear: fy } },
    });
    ok(res, target ?? { fiscalYear: fy, revenueTarget: null, grossProfitTarget: null, newAccountsTarget: null });
  } catch (e) {
    next(e);
  }
});

// PUT /api/kpi — upsert the caller's target for a fiscal year.
kpiRouter.put("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = upsertSchema.parse(req.body);
    const fy = input.fiscalYear ?? currentFY();
    const data = {
      revenueTarget: input.revenueTarget ?? null,
      grossProfitTarget: input.grossProfitTarget ?? null,
      newAccountsTarget: input.newAccountsTarget ?? null,
    };
    const target = await prisma.kpiTarget.upsert({
      where: { userId_fiscalYear: { userId, fiscalYear: fy } },
      update: data,
      create: { userId, fiscalYear: fy, ...data },
    });
    ok(res, target);
  } catch (e) {
    next(e);
  }
});

// GET /api/kpi/progress — target + achieved + gap for the caller.
kpiRouter.get("/progress", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const fy = Number(req.query.fiscalYear) || currentFY();
    const fyStart = new Date(fy, 0, 1);
    const fyEnd = new Date(fy + 1, 0, 1);

    const [target, wonDeals, newAccounts] = await Promise.all([
      prisma.kpiTarget.findUnique({
        where: { userId_fiscalYear: { userId, fiscalYear: fy } },
      }),
      prisma.deal.findMany({
        where: { ownerId: userId, stage: { in: WON_STAGES } },
        select: { value: true, grossProfit: true },
      }),
      prisma.account.count({
        where: { ownerId: userId, createdAt: { gte: fyStart, lt: fyEnd } },
      }),
    ]);

    // Open pipeline for the forecast line (weighted by probability).
    const openDeals = await prisma.deal.findMany({
      where: { ownerId: userId, stage: { in: ["red", "yellow", "green"] } },
      select: { value: true, probability: true },
    });
    const openValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0);
    const weightedForecast = openDeals.reduce(
      (s, d) => s + ((d.value ?? 0) * (d.probability ?? 0)) / 100,
      0,
    );

    const revenueAchieved = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0);
    const grossProfitAchieved = wonDeals.reduce((s, d) => s + (d.grossProfit ?? 0), 0);

    // Year-progress ratio for the pacing indicator.
    const now = new Date();
    const yearElapsed =
      now >= fyEnd ? 1 : now < fyStart ? 0 : (now.getTime() - fyStart.getTime()) / (fyEnd.getTime() - fyStart.getTime());

    ok(res, {
      fiscalYear: fy,
      yearElapsed, // 0..1
      daysLeft: Math.max(0, Math.ceil((fyEnd.getTime() - now.getTime()) / 86_400_000)),
      target: {
        revenue: target?.revenueTarget ?? null,
        grossProfit: target?.grossProfitTarget ?? null,
        newAccounts: target?.newAccountsTarget ?? null,
      },
      achieved: {
        revenue: revenueAchieved,
        grossProfit: grossProfitAchieved,
        newAccounts,
        wonCount: wonDeals.length,
      },
      pipeline: {
        openValue,
        weightedForecast,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/kpi/all — admin-only: every user's target + achieved for the FY.
kpiRouter.get("/all", requireRole("admin"), async (req, res, next) => {
  try {
    const fy = Number(req.query.fiscalYear) || currentFY();
    const fyStart = new Date(fy, 0, 1);
    const fyEnd = new Date(fy + 1, 0, 1);

    const users = await prisma.user.findMany({
      where: { role: "sales" },
      select: { id: true, name: true, email: true },
    });
    const rows = await Promise.all(
      users.map(async (u) => {
        const [target, won, newAccounts] = await Promise.all([
          prisma.kpiTarget.findUnique({
            where: { userId_fiscalYear: { userId: u.id, fiscalYear: fy } },
          }),
          prisma.deal.findMany({
            where: { ownerId: u.id, stage: { in: WON_STAGES } },
            select: { value: true, grossProfit: true },
          }),
          prisma.account.count({
            where: { ownerId: u.id, createdAt: { gte: fyStart, lt: fyEnd } },
          }),
        ]);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          target: {
            revenue: target?.revenueTarget ?? null,
            grossProfit: target?.grossProfitTarget ?? null,
            newAccounts: target?.newAccountsTarget ?? null,
          },
          achieved: {
            revenue: won.reduce((s, d) => s + (d.value ?? 0), 0),
            grossProfit: won.reduce((s, d) => s + (d.grossProfit ?? 0), 0),
            newAccounts,
          },
        };
      }),
    );
    ok(res, rows);
  } catch (e) {
    next(e);
  }
});
