import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import { Prisma } from "@prisma/client";
import { embedText, isEmbeddingDisabled } from "../services/embeddings.js";
import { requireRole } from "../middleware/rbac.js";

export const productsRouter = Router();

/**
 * Compute and persist a semantic embedding for a product in the background.
 * Called after create/update — if the model is unavailable we silently skip
 * (chat-ai falls back to keyword search).
 */
async function embedProductAsync(productId: string) {
  if (isEmbeddingDisabled()) return;
  try {
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p) return;
    const text = [
      `${p.vendor} ${p.name}`,
      p.sku ? `SKU ${p.sku}` : null,
      p.category ? `Category: ${p.category}` : null,
      p.description,
    ]
      .filter(Boolean)
      .join(". ");
    const vec = await embedText(text);
    if (!vec) return;
    await prisma.product.update({
      where: { id: productId },
      data: { embedding: vec as unknown as Prisma.InputJsonValue, embeddedAt: new Date() },
    });
  } catch (err) {
    console.warn(`[products] embed failed for ${productId}:`, err);
  }
}

productsRouter.get("/", async (req, res, next) => {
  try {
    const { vendor, category, q } = req.query as Record<string, string | undefined>;
    const where: Prisma.ProductWhereInput = { active: true };
    if (vendor) where.vendor = vendor;
    if (category) where.category = category;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }
    const items = await prisma.product.findMany({ where, orderBy: [{ vendor: "asc" }, { name: "asc" }] });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

const productSchema = z.object({
  vendor: z.string().min(1),
  sku: z.string().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unit: z.string().optional(),
  listPrice: z.number().nonnegative(),
  partnerCost: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional(),
});

// Catalog CRUD is manager+ — sales see pricing but shouldn't edit the SKU list.
productsRouter.post("/", requireRole("manager", "admin"), async (req, res, next) => {
  try {
    const input = productSchema.parse(req.body);
    const created = await prisma.product.create({ data: input });
    // Fire-and-forget — don't block the response on the model.
    void embedProductAsync(created.id);
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

productsRouter.put<{ id: string }>("/:id", requireRole("manager", "admin"), async (req, res, next) => {
  try {
    const input = productSchema.partial().parse(req.body);
    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: input,
    });
    // Any field change could affect semantic meaning — re-embed in background.
    void embedProductAsync(updated.id);
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

productsRouter.delete<{ id: string }>("/:id", requireRole("manager", "admin"), async (req, res, next) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
