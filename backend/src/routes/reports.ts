import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import {
  buildReportData,
  generateReportNarrative,
  periodRange,
} from "../services/report-ai.js";

export const reportsRouter = Router();

reportsRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.salesReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        period: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

reportsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const r = await prisma.salesReport.findUnique({ where: { id: req.params.id } });
    if (!r || r.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, r);
  } catch (e) {
    next(e);
  }
});

const genSchema = z.object({
  period: z.enum(["week", "month", "quarter"]),
  title: z.string().optional(),
});

reportsRouter.post("/generate", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = genSchema.parse(req.body);

    const { start, end, label } = periodRange(input.period);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const sections = await buildReportData(userId, start, end, label);
    const content = await generateReportNarrative(user?.name ?? "Sales", sections, userId);

    const title =
      input.title ??
      `Sales Report — ${label} (${end.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      })})`;

    const created = await prisma.salesReport.create({
      data: {
        userId,
        title,
        period: input.period,
        startDate: start,
        endDate: end,
        content,
        sections: sections as unknown as Prisma.InputJsonValue,
      },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

reportsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.salesReport.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.salesReport.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
