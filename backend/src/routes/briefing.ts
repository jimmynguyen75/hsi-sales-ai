import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { buildBriefingData, generateBriefingNarrative } from "../services/briefing-ai.js";

export const briefingRouter = Router();

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function upsertBriefing(userId: string, date: Date, force: boolean) {
  const dayStart = startOfDay(date);

  const existing = await prisma.dailyBriefing.findUnique({
    where: { userId_date: { userId, date: dayStart } },
  });
  if (existing && !force) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const sections = await buildBriefingData(userId, dayStart);
  const content = await generateBriefingNarrative(user?.name ?? "Sales", dayStart, sections, userId);

  if (existing) {
    return prisma.dailyBriefing.update({
      where: { id: existing.id },
      data: { content, sections: sections as unknown as object },
    });
  }
  return prisma.dailyBriefing.create({
    data: { userId, date: dayStart, content, sections: sections as unknown as object },
  });
}

briefingRouter.get("/today", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const briefing = await upsertBriefing(userId, new Date(), false);
    ok(res, briefing);
  } catch (e) {
    next(e);
  }
});

briefingRouter.post("/generate", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const briefing = await upsertBriefing(userId, new Date(), true);
    ok(res, briefing);
  } catch (e) {
    next(e);
  }
});

briefingRouter.get("/history", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.dailyBriefing.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 30,
      select: { id: true, date: true, isRead: true, createdAt: true },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

briefingRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const b = await prisma.dailyBriefing.findUnique({ where: { id: req.params.id } });
    if (!b || b.userId !== userId) return res.status(404).json({ success: false, error: "Not found" });
    if (!b.isRead) {
      await prisma.dailyBriefing.update({ where: { id: b.id }, data: { isRead: true } });
    }
    ok(res, b);
  } catch (e) {
    next(e);
  }
});
