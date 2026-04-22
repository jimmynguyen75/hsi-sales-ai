import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { processMeetingNotes } from "../services/meeting-ai.js";

export const meetingsRouter = Router();

meetingsRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, dealId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (accountId) where.accountId = accountId;
    if (dealId) where.dealId = dealId;
    const items = await prisma.meeting.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        actionItems: { orderBy: { dueDate: "asc" } },
      },
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

meetingsRouter.get("/:id", async (req, res, next) => {
  try {
    const m = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: { actionItems: { orderBy: { dueDate: "asc" } } },
    });
    if (!m) return res.status(404).json({ success: false, error: "Not found" });
    ok(res, m);
  } catch (e) {
    next(e);
  }
});

const meetingSchema = z.object({
  title: z.string().min(1),
  date: z.string().datetime(),
  attendees: z.string().default(""),
  rawNotes: z.string().default(""),
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
});

meetingsRouter.post("/", async (req, res, next) => {
  try {
    const input = meetingSchema.parse(req.body);
    const userId = (req as AuthedRequest).userId;
    const m = await prisma.meeting.create({
      data: {
        ...input,
        date: new Date(input.date),
        ownerId: userId,
      },
    });
    ok(res, m);
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  title: z.string().optional(),
  date: z.string().datetime().optional(),
  attendees: z.string().optional(),
  rawNotes: z.string().optional(),
  aiSummary: z.string().optional(),
});

meetingsRouter.put("/:id", async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const m = await prisma.meeting.update({
      where: { id: req.params.id },
      data: { ...input, date: input.date ? new Date(input.date) : undefined },
    });
    ok(res, m);
  } catch (e) {
    next(e);
  }
});

meetingsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.meeting.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// AI: process raw notes -> summary, actions, decisions
meetingsRouter.post("/:id/ai/process", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const m = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: { actionItems: true },
    });
    if (!m) return res.status(404).json({ success: false, error: "Meeting not found" });

    let accountName: string | undefined;
    if (m.accountId) {
      const a = await prisma.account.findUnique({ where: { id: m.accountId } });
      accountName = a?.companyName;
    }

    const result = await processMeetingNotes(
      m.rawNotes,
      { title: m.title, attendees: m.attendees, accountName },
      userId,
    );

    // Update meeting summary
    await prisma.meeting.update({
      where: { id: m.id },
      data: { aiSummary: result.summary },
    });

    // Replace existing action items with new ones (only if empty, to preserve manual edits)
    if (m.actionItems.length === 0 && result.actionItems.length > 0) {
      await prisma.actionItem.createMany({
        data: result.actionItems.map((ai) => ({
          meetingId: m.id,
          content: ai.content,
          assignee: ai.assignee || null,
          dueDate: ai.dueDate ? new Date(ai.dueDate) : null,
        })),
      });
    }

    const updated = await prisma.meeting.findUnique({
      where: { id: m.id },
      include: { actionItems: { orderBy: { dueDate: "asc" } } },
    });

    ok(res, { ...result, meeting: updated });
  } catch (e) {
    next(e);
  }
});

// Action items CRUD
const actionSchema = z.object({
  content: z.string().optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
});

meetingsRouter.patch("/:id/actions/:actionId", async (req, res, next) => {
  try {
    const input = actionSchema.parse(req.body);
    const a = await prisma.actionItem.update({
      where: { id: req.params.actionId },
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : input.dueDate === null ? null : undefined,
      },
    });
    ok(res, a);
  } catch (e) {
    next(e);
  }
});

meetingsRouter.post("/:id/actions", async (req, res, next) => {
  try {
    const input = z
      .object({
        content: z.string().min(1),
        assignee: z.string().optional().nullable(),
        dueDate: z.string().datetime().optional().nullable(),
      })
      .parse(req.body);
    const a = await prisma.actionItem.create({
      data: {
        meetingId: req.params.id,
        content: input.content,
        assignee: input.assignee || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    ok(res, a);
  } catch (e) {
    next(e);
  }
});

meetingsRouter.delete("/:id/actions/:actionId", async (req, res, next) => {
  try {
    await prisma.actionItem.delete({ where: { id: req.params.actionId } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
