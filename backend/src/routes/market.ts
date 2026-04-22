import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import {
  estimateMarket,
  generateMarketNarrative,
  type MarketSizingInputs,
} from "../services/market-ai.js";

export const marketRouter = Router();

// GET /api/market
marketRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.marketSizing.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        segment: true,
        region: true,
        vertical: true,
        tam: true,
        sam: true,
        som: true,
        createdAt: true,
      },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// GET /api/market/:id
marketRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const m = await prisma.marketSizing.findUnique({ where: { id: req.params.id } });
    if (!m || m.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, m);
  } catch (e) {
    next(e);
  }
});

const analyzeSchema = z.object({
  title: z.string().optional(),
  segment: z.string().min(1),
  region: z.string().min(1),
  vertical: z.string().optional(),
  productCategory: z.string().optional(),
  timeframe: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/market/analyze — compute + AI narrative + persist
marketRouter.post("/analyze", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = analyzeSchema.parse(req.body);
    const inputs: MarketSizingInputs = {
      segment: input.segment,
      region: input.region,
      vertical: input.vertical,
      productCategory: input.productCategory,
      timeframe: input.timeframe,
      notes: input.notes,
    };

    const estimate = await estimateMarket(inputs, userId);
    const analysis = await generateMarketNarrative(inputs, estimate, userId);

    const title =
      input.title ??
      `${input.segment} — ${input.region}${input.vertical ? " / " + input.vertical : ""}`;

    const created = await prisma.marketSizing.create({
      data: {
        userId,
        title,
        segment: input.segment,
        region: input.region,
        vertical: input.vertical ?? null,
        inputs: {
          ...inputs,
          assumptions: estimate.assumptions,
          drivers: estimate.drivers,
          competitorLandscape: estimate.competitorLandscape,
          reasoning: estimate.reasoning,
        } as unknown as Prisma.InputJsonValue,
        tam: estimate.tam,
        sam: estimate.sam,
        som: estimate.som,
        analysis,
      },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/market/:id
marketRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.marketSizing.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.marketSizing.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
