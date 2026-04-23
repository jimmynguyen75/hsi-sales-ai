import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireRole, canViewAll } from "../middleware/rbac.js";
import {
  summarizeAccount,
  suggestNextAction,
  assessHealth,
  chatWithAccount,
} from "../services/crm-ai.js";

export const accountsRouter = Router();

// GET /api/accounts — list with filters
// RBAC: sales sees own accounts only; admin sees all.
accountsRouter.get("/", async (req, res, next) => {
  try {
    const { q, industry, minHealth, maxHealth, size } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (!canViewAll(req.userRole)) {
      where.ownerId = req.userId;
    }
    if (q) {
      where.OR = [
        { companyName: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }
    if (industry) where.industry = industry;
    if (size) where.size = size;
    if (minHealth || maxHealth) {
      where.healthScore = {
        ...(minHealth ? { gte: Number(minHealth) } : {}),
        ...(maxHealth ? { lte: Number(maxHealth) } : {}),
      };
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { deals: true, contacts: true, activities: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 1 },
        insights: {
          where: { status: "pending", type: "next_action" },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
        // Admins view the whole team's book — bundle the owner so we can
        // show the Owner column without N+1 fetches.
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    ok(res, accounts);
  } catch (e) {
    next(e);
  }
});

// GET /api/accounts/:id
// RBAC: sales may only view own accounts.
accountsRouter.get("/:id", async (req, res, next) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: true,
        deals: { orderBy: { updatedAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        insights: { orderBy: { generatedAt: "desc" } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!account) return res.status(404).json({ success: false, error: "Not found" });
    if (!canViewAll(req.userRole) && account.ownerId !== req.userId) {
      return fail(res, 403, "Bạn không có quyền xem account này.");
    }
    ok(res, account);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

accountsRouter.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const userId = (req as AuthedRequest).userId;
    const account = await prisma.account.create({
      data: { ...input, ownerId: userId },
    });
    ok(res, account);
  } catch (e) {
    next(e);
  }
});

const updateSchema = createSchema.partial();

// RBAC: sales may only update own accounts.
accountsRouter.put("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 404, "Not found");
    if (!canViewAll(req.userRole) && existing.ownerId !== req.userId) {
      return fail(res, 403, "Bạn không có quyền sửa account này.");
    }
    const input = updateSchema.parse(req.body);
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: input,
    });
    ok(res, account);
  } catch (e) {
    next(e);
  }
});

// Delete: admin only (cascades to contacts/deals/activities — dangerous)
accountsRouter.delete<{ id: string }>("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await prisma.account.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/accounts/:id/timeline
accountsRouter.get("/:id/timeline", async (req, res, next) => {
  try {
    const items = await prisma.activity.findMany({
      where: { accountId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

// === AI endpoints ===

accountsRouter.post("/:id/ai/summary", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const summary = await summarizeAccount(req.params.id, userId);
    ok(res, { summary });
  } catch (e) {
    next(e);
  }
});

accountsRouter.post("/:id/ai/next-action", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const suggestions = await suggestNextAction(req.params.id, userId);

    // Save as a CRMInsight for later reference
    await prisma.cRMInsight.create({
      data: {
        accountId: req.params.id,
        type: "next_action",
        content: suggestions,
        priority: "medium",
      },
    });

    ok(res, { suggestions });
  } catch (e) {
    next(e);
  }
});

accountsRouter.post("/:id/ai/health", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const result = await assessHealth(req.params.id, userId);
    ok(res, result);
  } catch (e) {
    next(e);
  }
});

const chatSchema = z.object({ message: z.string().min(1) });

accountsRouter.post("/:id/ai/chat", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { message } = chatSchema.parse(req.body);
    const reply = await chatWithAccount(req.params.id, message, userId);
    ok(res, { reply });
  } catch (e) {
    next(e);
  }
});
