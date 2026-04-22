import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { suggestBOM } from "../services/quotation-ai.js";
import { renderQuotationPDF, renderQuotationDOCX } from "../services/document-export.js";
import { logAudit, diffSummary } from "../services/audit.js";
import type { Prisma } from "@prisma/client";

export const quotationsRouter = Router();

// GET /api/quotations/:id/export.pdf
quotationsRouter.get("/:id/export.pdf", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!quotation || quotation.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const account = quotation.accountId
      ? await prisma.account.findUnique({ where: { id: quotation.accountId } })
      : null;

    const buf = await renderQuotationPDF(quotation, account);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quotation.number}.pdf"`,
    );
    res.setHeader("Content-Length", buf.length.toString());
    await logAudit(req, {
      action: "export",
      entity: "quotation",
      entityId: quotation.id,
      summary: `Xuất PDF quotation ${quotation.number}`,
    });
    res.end(buf);
  } catch (e) {
    next(e);
  }
});

// GET /api/quotations/:id/export.docx
quotationsRouter.get("/:id/export.docx", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!quotation || quotation.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const account = quotation.accountId
      ? await prisma.account.findUnique({ where: { id: quotation.accountId } })
      : null;

    const buf = await renderQuotationDOCX(quotation, account);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quotation.number}.docx"`,
    );
    res.setHeader("Content-Length", buf.length.toString());
    res.end(buf);
  } catch (e) {
    next(e);
  }
});

interface LineItem {
  id: string;
  productId?: string | null;
  name: string;
  description?: string;
  vendor?: string;
  qty: number;
  unitPrice: number;
  discount: number; // per-line %
  unit?: string;
  lineTotal: number;
}

function lid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function recompute(
  items: LineItem[],
  overallDiscount: number,
  tax: number,
): { items: LineItem[]; subtotal: number; total: number } {
  const recalced = items.map((it) => {
    const base = it.qty * it.unitPrice;
    const afterLineDisc = base * (1 - (it.discount || 0) / 100);
    return { ...it, lineTotal: Math.round(afterLineDisc) };
  });
  const subtotal = recalced.reduce((s, it) => s + it.lineTotal, 0);
  const afterDiscount = subtotal * (1 - (overallDiscount || 0) / 100);
  const total = Math.round(afterDiscount * (1 + (tax || 0) / 100));
  return { items: recalced, subtotal: Math.round(subtotal), total };
}

async function nextNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const count = await prisma.quotation.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

quotationsRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { accountId, dealId, status } = req.query as Record<string, string | undefined>;
    const where: Prisma.QuotationWhereInput = { ownerId: userId };
    if (accountId) where.accountId = accountId;
    if (dealId) where.dealId = dealId;
    if (status) where.status = status;
    const items = await prisma.quotation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

quotationsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const q = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!q || q.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, q);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  title: z.string().min(1),
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  currency: z.string().optional(),
  validUntil: z.string().optional().nullable(),
});

quotationsRouter.post("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = createSchema.parse(req.body);
    const number = await nextNumber();
    const created = await prisma.quotation.create({
      data: {
        number,
        title: input.title,
        accountId: input.accountId || null,
        dealId: input.dealId || null,
        currency: input.currency ?? "VND",
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        items: [] as Prisma.InputJsonValue,
        ownerId: userId,
      },
    });
    await logAudit(req, {
      action: "create",
      entity: "quotation",
      entityId: created.id,
      summary: `Tạo quotation ${created.number}: ${created.title}`,
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

const lineItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional().nullable(),
  name: z.string(),
  description: z.string().optional(),
  vendor: z.string().optional(),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().min(0).max(100).optional(),
  unit: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
  currency: z.string().optional(),
  items: z.array(lineItemSchema).optional(),
  discount: z.number().min(0).max(100).optional(),
  tax: z.number().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
});

quotationsRouter.put("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const input = updateSchema.parse(req.body);
    const data: Prisma.QuotationUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.status !== undefined) data.status = input.status;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    }

    const disc = input.discount ?? existing.discount;
    const tax = input.tax ?? existing.tax;

    if (input.items !== undefined || input.discount !== undefined || input.tax !== undefined) {
      const rawItems = (input.items ?? (existing.items as unknown as LineItem[])).map((it) => ({
        id: it.id ?? lid(),
        productId: it.productId ?? null,
        name: it.name,
        description: it.description,
        vendor: it.vendor,
        qty: it.qty,
        unitPrice: it.unitPrice,
        discount: it.discount ?? 0,
        unit: it.unit,
        lineTotal: 0,
      }));
      const { items, subtotal, total } = recompute(rawItems, disc, tax);
      data.items = items as unknown as Prisma.InputJsonValue;
      data.subtotal = subtotal;
      data.total = total;
      if (input.discount !== undefined) data.discount = disc;
      if (input.tax !== undefined) data.tax = tax;
    }

    const updated = await prisma.quotation.update({ where: { id: req.params.id }, data });
    // Audit: use status_change when status shifted, otherwise a generic update.
    const changed = diffSummary(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["title", "status", "total", "discount", "tax", "validUntil"],
    );
    const isStatus = input.status && input.status !== existing.status;
    await logAudit(req, {
      action: isStatus ? "status_change" : "update",
      entity: "quotation",
      entityId: updated.id,
      summary: `${updated.number}: ${changed}`,
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

quotationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.quotation.delete({ where: { id: req.params.id } });
    await logAudit(req, {
      action: "delete",
      entity: "quotation",
      entityId: existing.id,
      summary: `Xoá quotation ${existing.number} (tổng ${existing.total})`,
    });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

const suggestSchema = z.object({
  requirement: z.string().min(1),
});

quotationsRouter.post("/:id/ai/suggest", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const input = suggestSchema.parse(req.body);
    const catalog = await prisma.product.findMany({
      where: { active: true },
      take: 40,
      orderBy: { createdAt: "desc" },
      select: { name: true, vendor: true, listPrice: true, unit: true },
    });

    const suggestions = await suggestBOM(input.requirement, catalog, userId);
    const newItems: LineItem[] = suggestions.map((s) => ({
      id: lid(),
      name: s.name,
      description: s.description,
      vendor: s.vendor,
      qty: s.qty,
      unitPrice: s.unitPrice,
      discount: 0,
      unit: s.unit,
      lineTotal: 0,
    }));

    // Merge (append) rather than replace
    const prev = (existing.items as unknown as LineItem[]) ?? [];
    const merged = [...prev, ...newItems];
    const { items, subtotal, total } = recompute(merged, existing.discount, existing.tax);

    const updated = await prisma.quotation.update({
      where: { id: req.params.id },
      data: {
        items: items as unknown as Prisma.InputJsonValue,
        subtotal,
        total,
      },
    });
    ok(res, { quotation: updated, added: newItems.length });
  } catch (e) {
    next(e);
  }
});
