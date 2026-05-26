import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { suggestBOM } from "../services/quotation-ai.js";
import {
  renderQuotationPDF,
  renderQuotationDOCX,
  renderQuotationXLSX,
} from "../services/document-export.js";
import { parseQuotationFile } from "../services/quotation-import.js";
import { logAudit, diffSummary } from "../services/audit.js";
import type { Prisma } from "@prisma/client";

export const quotationsRouter = Router();

// 10 MB ceiling — quotation files are tiny but template XLSX with images
// can push past the CSV 5 MB ceiling we use elsewhere.
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// GET /api/quotations/:id/export.pdf
// GET /api/quotations/:id/export.pdf?mode=full|customer
//   full     — full quote with prices, VAT, totals, signature (default).
//   customer — qty-only customer-review version. No prices, no totals.
//              Customer signs off on what they're getting before HPT
//              commits to a price.
quotationsRouter.get("/:id/export.pdf", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!quotation || quotation.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const account = quotation.accountId
      ? await prisma.account.findUnique({ where: { id: quotation.accountId } })
      : null;

    const mode = req.query.mode === "customer" ? "customer" : "full";
    const buf = await renderQuotationPDF(quotation, account, mode);
    const filename =
      mode === "customer"
        ? `${quotation.number}-customer-review.pdf`
        : `${quotation.number}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buf.length.toString());
    await logAudit(req, {
      action: "export",
      entity: "quotation",
      entityId: quotation.id,
      summary: `Xuất PDF (${mode}) quotation ${quotation.number}`,
    });
    res.end(buf);
  } catch (e) {
    next(e);
  }
});

// GET /api/quotations/:id/export.xlsx?lang=vi|en — HPT-template Excel.
// `lang` defaults to "vi" if absent/unrecognized.
quotationsRouter.get("/:id/export.xlsx", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!quotation || quotation.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const account = quotation.accountId
      ? await prisma.account.findUnique({ where: { id: quotation.accountId } })
      : null;

    const lang = req.query.lang === "en" ? "en" : "vi";
    const buf = await renderQuotationXLSX(quotation, account, lang);
    const filename = `${quotation.number}-${lang.toUpperCase()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buf.length.toString());
    await logAudit(req, {
      action: "export",
      entity: "quotation",
      entityId: quotation.id,
      summary: `Xuất XLSX (${lang.toUpperCase()}) quotation ${quotation.number}`,
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
  // Đơn giá = sell price per unit. Margin is already baked in. lineTotal is
  // a clean qty × unitPrice multiplication that matches what the rep sees in
  // the table. When the rep types margin, the frontend re-derives unitPrice
  // from the implicit cost (currentUnit × (1 - oldMargin/100)) so the
  // displayed price always reflects the current margin.
  unitPrice: number;
  // Gross margin % the unit price was set at. Standard accounting form:
  //   margin% = (sell - cost) / sell × 100
  // Stored alongside unitPrice for traceability — when the rep edits margin,
  // the frontend uses this old value to back-out the implicit cost.
  margin?: number | null;
  // Per-row VAT %. Different line items may have different VAT rates
  // (software often 0/exempt, hardware 8/10). Defaults to 10.
  vatPct?: number | null;
  // Kept for back-compat — older quotations stored partner cost here. New
  // ones don't write to it.
  partnerCost?: number | null;
  // Legacy "% CK" field — pre-margin model. Folded into unitPrice on save.
  discount: number;
  unit?: string;
  // Pre-VAT total = qty × unitPrice × (1 + margin/100).
  lineTotal: number;
  // VAT amount for this line = lineTotal × (vatPct / 100). Computed by
  // recompute(); read-only on the client.
  lineVAT?: number;
}

function lid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function recompute(
  items: LineItem[],
  _overallDiscount: number,
  legacyTax: number,
): { items: LineItem[]; subtotal: number; total: number } {
  // Pricing model:
  //   unitPrice already reflects the desired margin (sell price per unit).
  //   lineTotal (pre-VAT) = qty × unitPrice          ← clean visible math
  //   lineVAT             = lineTotal × (vatPct / 100)
  //   subtotal            = Σ lineTotal
  //   total (post-VAT)    = Σ lineTotal + Σ lineVAT
  //
  // Margin is informational here — the frontend updates unitPrice when the
  // rep changes margin (see QuotationDetail.tsx). Backend just multiplies.
  //
  // Legacy migration on save:
  // - Line "% CK" discount folds into unitPrice and resets discount to 0.
  // - Quotation-level tax migrates to per-row vatPct on first save.
  const defaultVat = legacyTax || 10;
  const recalced = items.map((it) => {
    const lineDiscount = it.discount ?? 0;
    const baseUnit =
      lineDiscount > 0
        ? Math.round(it.unitPrice * (1 - lineDiscount / 100))
        : it.unitPrice;
    const margin = it.margin ?? 0;
    const lineTotal = baseUnit * it.qty;
    const vatPct = it.vatPct ?? defaultVat;
    const lineVAT = Math.round(lineTotal * (vatPct / 100));
    return {
      ...it,
      unitPrice: baseUnit,
      margin,
      vatPct,
      discount: 0,
      lineTotal,
      lineVAT,
    };
  });
  const subtotal = recalced.reduce((s, it) => s + it.lineTotal, 0);
  const totalVAT = recalced.reduce((s, it) => s + (it.lineVAT ?? 0), 0);
  const total = subtotal + totalVAT;
  return { items: recalced, subtotal: Math.round(subtotal), total };
}

async function nextNumber(): Promise<string> {
  // Take the highest existing suffix + 1 rather than count+1, so deleting
  // a quotation in the middle of the sequence doesn't make us reissue a
  // number that's already been used (and freed).
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const rows = await prisma.quotation.findMany({
    where: { number: { startsWith: prefix } },
    select: { number: true },
  });
  let maxSuffix = 0;
  for (const { number } of rows) {
    const n = Number(number.slice(prefix.length));
    if (Number.isFinite(n) && n > maxSuffix) maxSuffix = n;
  }
  return `${prefix}${String(maxSuffix + 1).padStart(4, "0")}`;
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

    // Quotation has no Prisma relation declared for the account — just the
    // raw accountId scalar. Fetch the company name for each linked account
    // in one extra query so the list page can show it without N+1s.
    const accountIds = Array.from(
      new Set(items.map((i) => i.accountId).filter((x): x is string => !!x)),
    );
    const accounts = accountIds.length
      ? await prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, companyName: true },
        })
      : [];
    const nameById = new Map(accounts.map((a) => [a.id, a.companyName]));
    const enriched = items.map((it) => ({
      ...it,
      accountName: it.accountId ? nameById.get(it.accountId) ?? null : null,
    }));
    ok(res, enriched);
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

// POST /api/quotations/import — upload a quotation file (XLSX, PDF, DOCX,
// or TXT) and auto-create a quotation from its contents. For XLSX we
// first try a deterministic header-based parser; for other formats — or
// when the XLSX heuristics miss — we extract plain text and use the LLM
// to pull out title, customer, valid-until, and line items.
//
// Optional form fields:
//   accountId: link to an existing account directly (skips name matching)
//   dealId:    attach to an existing deal
quotationsRouter.post("/import", xlsxUpload.single("file"), async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const file = (req as Express.Request & { file?: Express.Multer.File }).file;
    if (!file) return fail(res, 400, "Thiếu file upload (field 'file').");

    const parsed = await parseQuotationFile(file.buffer, file.originalname, userId);
    if (parsed.items.length === 0) {
      return fail(
        res,
        422,
        parsed.warnings.join(" ") ||
          "Không trích xuất được line item nào từ file Excel.",
      );
    }

    const bodyAccountId =
      typeof req.body?.accountId === "string" && req.body.accountId
        ? String(req.body.accountId)
        : null;
    const bodyDealId =
      typeof req.body?.dealId === "string" && req.body.dealId
        ? String(req.body.dealId)
        : null;

    // Resolve the target account: explicit accountId wins; otherwise try to
    // match the customer name parsed from the file (case-insensitive, against
    // accounts this user can see).
    let accountId: string | null = bodyAccountId;
    if (!accountId && parsed.customerName) {
      const candidates = await prisma.account.findMany({
        where: {
          ownerId: userId, // sales sees own; admin can pass accountId explicitly
          companyName: { contains: parsed.customerName, mode: "insensitive" },
        },
        take: 2,
      });
      if (candidates.length === 1) accountId = candidates[0].id;
      else if (candidates.length > 1) {
        parsed.warnings.push(
          `Nhiều account khớp "${parsed.customerName}". Hãy chọn account rồi import lại.`,
        );
      } else {
        parsed.warnings.push(
          `Không tìm thấy account "${parsed.customerName}". Quotation sẽ tạo không gắn account.`,
        );
      }
    }

    // Map parsed items into the canonical LineItem shape, calling recompute
    // so subtotal/total/lineTotal are computed by the same code path the
    // editor uses.
    const rawItems: LineItem[] = parsed.items.map((it) => ({
      id: lid(),
      productId: null,
      name: it.name,
      description: it.description,
      vendor: it.vendor,
      qty: it.qty,
      unitPrice: Math.round(it.unitPrice),
      margin: 0,
      vatPct: it.vatPct ?? 10,
      discount: 0,
      unit: "unit",
      lineTotal: 0,
    }));
    const { items, subtotal, total } = recompute(rawItems, 0, 0);

    const number = await nextNumber();
    const created = await prisma.quotation.create({
      data: {
        number,
        title: parsed.title || file.originalname.replace(/\.[^.]+$/, ""),
        accountId,
        dealId: bodyDealId,
        currency: "VND",
        validUntil: parsed.validUntil,
        items: items as unknown as Prisma.InputJsonValue,
        subtotal,
        total,
        ownerId: userId,
      },
    });
    await logAudit(req, {
      action: "create",
      entity: "quotation",
      entityId: created.id,
      summary: `Import quotation ${created.number} từ "${file.originalname}": ${items.length} items, tổng ${total.toLocaleString("vi-VN")}`,
    });

    ok(res, { quotation: created, warnings: parsed.warnings });
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
  // Gross margin %. Must be strictly < 100 (at 100 the formula divides
  // by zero, giving infinite price). Lower bound > -1000 allows loss
  // pricing for promos.
  margin: z.number().gt(-1000).lt(100).optional().nullable(),
  // Per-row VAT %. 0–100.
  vatPct: z.number().min(0).max(100).optional().nullable(),
  // Kept optional for back-compat (older payloads).
  partnerCost: z.number().nonnegative().optional().nullable(),
  discount: z.number().min(0).max(100).optional(),
  unit: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
  currency: z.string().optional(),
  // Exchange rate to VND. Required when currency != VND, otherwise ignored.
  exchangeRate: z.number().positive().optional().nullable(),
  items: z.array(lineItemSchema).optional(),
  discount: z.number().min(0).max(100).optional(),
  tax: z.number().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  // Link / unlink the quotation to an account. Empty string is treated
  // as "clear the link".
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
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
    if (input.exchangeRate !== undefined) data.exchangeRate = input.exchangeRate;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
    }
    // Account / deal FKs are nullable scalar columns (no Prisma relation
    // declared on Quotation), so write them directly. Empty string = unlink.
    if (input.accountId !== undefined) {
      data.accountId = input.accountId || null;
    }
    if (input.dealId !== undefined) {
      data.dealId = input.dealId || null;
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
        margin: it.margin ?? 0,
        vatPct: it.vatPct,
        partnerCost: it.partnerCost ?? null,
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
