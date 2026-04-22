import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";

export const actionsRouter = Router();

// Cross-meeting actions list for Kanban board
actionsRouter.get("/", async (req, res, next) => {
  try {
    const { status, assignee } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (assignee) where.assignee = assignee;
    const items = await prisma.actionItem.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      include: { meeting: { select: { id: true, title: true, date: true } } },
      take: 300,
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});
