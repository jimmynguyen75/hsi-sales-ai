import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { generateCompetitorSWOT } from "../services/competitor-ai.js";

export const competitorsRouter = Router();

const competitorSchema = z.object({
  name: z.string().min(1),
  vendor: z.string().optional(),
  website: z.string().optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  pricing: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/competitors
competitorsRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.competitor.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { intel: true } } },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// GET /api/competitors/:id
competitorsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const c = await prisma.competitor.findUnique({
      where: { id: req.params.id },
      include: {
        intel: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!c || c.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    // Include deals competing against this competitor
    const deals = await prisma.deal.findMany({
      where: { competitorId: c.id, ownerId: userId },
      include: { account: { select: { id: true, companyName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    ok(res, { ...c, competingDeals: deals });
  } catch (e) {
    next(e);
  }
});

// POST /api/competitors
competitorsRouter.post("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = competitorSchema.parse(req.body);
    const created = await prisma.competitor.create({
      data: { ...input, ownerId: userId },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

// PUT /api/competitors/:id
competitorsRouter.put("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = competitorSchema.partial().parse(req.body);
    const existing = await prisma.competitor.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const updated = await prisma.competitor.update({
      where: { id: req.params.id },
      data: input,
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/competitors/:id
competitorsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.competitor.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.competitor.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// --- Intel entries ---

const intelSchema = z.object({
  type: z.enum(["news", "pricing", "win_against", "loss_to", "rumor", "feature"]),
  content: z.string().min(1),
  source: z.string().optional(),
  impact: z.enum(["high", "medium", "low"]).optional(),
});

// POST /api/competitors/:id/intel
competitorsRouter.post("/:id/intel", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const c = await prisma.competitor.findUnique({ where: { id: req.params.id } });
    if (!c || c.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const input = intelSchema.parse(req.body);
    const created = await prisma.competitorIntel.create({
      data: { ...input, competitorId: c.id, userId },
    });
    // bump updatedAt on parent
    await prisma.competitor.update({
      where: { id: c.id },
      data: { updatedAt: new Date() },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/competitors/:id/intel/:intelId
competitorsRouter.delete("/:id/intel/:intelId", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const c = await prisma.competitor.findUnique({ where: { id: req.params.id } });
    if (!c || c.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.competitorIntel.delete({ where: { id: req.params.intelId } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/competitors/:id/analyze — AI SWOT
competitorsRouter.post("/:id/analyze", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const c = await prisma.competitor.findUnique({ where: { id: req.params.id } });
    if (!c || c.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const swot = await generateCompetitorSWOT(c.id, userId);
    const updated = await prisma.competitor.update({
      where: { id: c.id },
      data: { swotAnalysis: swot, swotAt: new Date() },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});
