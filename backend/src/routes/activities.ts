import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const activitiesRouter = Router();

activitiesRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, dealId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (accountId) where.accountId = accountId;
    if (dealId) where.dealId = dealId;
    const items = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

const activitySchema = z.object({
  type: z.enum(["email", "call", "meeting", "note", "follow_up"]),
  subject: z.string().min(1),
  content: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  completed: z.boolean().optional(),
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
});

activitiesRouter.post("/", async (req, res, next) => {
  try {
    const input = activitySchema.parse(req.body);
    const userId = (req as AuthedRequest).userId;
    const activity = await prisma.activity.create({
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        ownerId: userId,
      },
    });
    ok(res, activity);
  } catch (e) {
    next(e);
  }
});

activitiesRouter.put("/:id", async (req, res, next) => {
  try {
    const input = activitySchema.partial().parse(req.body);
    const activity = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });
    ok(res, activity);
  } catch (e) {
    next(e);
  }
});

activitiesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.activity.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
