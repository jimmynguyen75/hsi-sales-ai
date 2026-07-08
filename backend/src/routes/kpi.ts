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
  fyStart: z.string().optional().nullable(), // ISO date
  fyEnd: z.string().optional().nullable(),
  revenueTarget: z.number().nonnegative().optional().nullable(),
  grossProfitTarget: z.number().nonnegative().optional().nullable(),
  newAccountsTarget: z.number().int().nonnegative().optional().nullable(),
});

// Resolve the FY window from stored dates, falling back to Jan 1 – Dec 31.
function fyWindow(fy: number, target: { fyStart: Date | null; fyEnd: Date | null } | null) {
  const fyStart = target?.fyStart ?? new Date(fy, 0, 1);
  const fyEnd = target?.fyEnd ?? new Date(fy + 1, 0, 1);
  return { fyStart, fyEnd };
}

// GET /api/kpi — the caller's target for a fiscal year (default: current).
kpiRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const fy = Number(req.query.fiscalYear) || currentFY();
    const target = await prisma.kpiTarget.findUnique({
      where: { userId_fiscalYear: { userId, fiscalYear: fy } },
    });
    ok(
      res,
      target ?? {
        fiscalYear: fy,
        fyStart: null,
        fyEnd: null,
        revenueTarget: null,
        grossProfitTarget: null,
        newAccountsTarget: null,
      },
    );
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
      fyStart: input.fyStart ? new Date(input.fyStart) : null,
      fyEnd: input.fyEnd ? new Date(input.fyEnd) : null,
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

    // Load the target first so we know the FY window before counting.
    const target = await prisma.kpiTarget.findUnique({
      where: { userId_fiscalYear: { userId, fiscalYear: fy } },
    });
    const { fyStart, fyEnd } = fyWindow(fy, target);

    const [wonDeals, newAccounts] = await Promise.all([
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
      fyStart: fyStart.toISOString(),
      fyEnd: fyEnd.toISOString(),
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

    const users = await prisma.user.findMany({
      where: { role: "sales" },
      select: { id: true, name: true, email: true },
    });
    const rows = await Promise.all(
      users.map(async (u) => {
        // Load each rep's target first so newAccounts uses their FY window.
        const target = await prisma.kpiTarget.findUnique({
          where: { userId_fiscalYear: { userId: u.id, fiscalYear: fy } },
        });
        const { fyStart, fyEnd } = fyWindow(fy, target);
        const [won, newAccounts] = await Promise.all([
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
