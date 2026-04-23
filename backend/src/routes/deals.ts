import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireRole, canViewAll } from "../middleware/rbac.js";
import { logAudit, diffSummary } from "../services/audit.js";

export const dealsRouter = Router();

// RBAC: sales sees own deals only; admin sees all.
dealsRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, stage, vendor } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (!canViewAll(req.userRole)) {
      where.ownerId = req.userId;
    }
    if (accountId) where.accountId = accountId;
    if (stage) where.stage = stage;
    if (vendor) where.vendor = vendor;
    const deals = await prisma.deal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        account: { select: { id: true, companyName: true, industry: true } },
        // Admins see deals across the whole team — include the owner so the UI
        // can show "whose deal is this" without a second roundtrip per row.
        // Sales also receive this but they only see their own rows anyway.
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    ok(res, deals);
  } catch (e) {
    next(e);
  }
});

const dealSchema = z.object({
  title: z.string().min(1),
  value: z.number().optional().nullable(),
  stage: z.enum([
    "prospecting",
    "qualification",
    "proposal",
    "negotiation",
    "closed_won",
    "closed_lost",
  ]),
  probability: z.number().int().min(0).max(100).optional().nullable(),
  expectedClose: z.string().datetime().optional().nullable(),
  vendor: z.string().optional().nullable(),
  productLine: z.string().optional().nullable(),
  accountId: z.string(),
  // Optional on both create + update. Reassignment via PUT is admin-only —
  // guarded in the handler, not here, so the 403 message stays specific.
  ownerId: z.string().optional(),
});

dealsRouter.post("/", async (req, res, next) => {
  try {
    const input = dealSchema.parse(req.body);
    const userId = (req as AuthedRequest).userId;
    const deal = await prisma.deal.create({
      data: {
        ...input,
        expectedClose: input.expectedClose ? new Date(input.expectedClose) : null,
        ownerId: userId,
      },
    });
    await logAudit(req, {
      action: "create",
      entity: "deal",
      entityId: deal.id,
      summary: `Tạo deal "${deal.title}" — stage ${deal.stage}${deal.value ? `, trị giá ${deal.value}` : ""}`,
    });
    ok(res, deal);
  } catch (e) {
    next(e);
  }
});

dealsRouter.put("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 404, "Not found");
    if (!canViewAll(req.userRole) && existing.ownerId !== req.userId) {
      return fail(res, 403, "Bạn không có quyền sửa deal này.");
    }
    const input = dealSchema.partial().parse(req.body);

    // Reassignment guard: only admin can change ownerId. A sales rep
    // transferring their own deal away from themselves would break the
    // ownership invariant the /deals list relies on.
    const isReassign = input.ownerId && input.ownerId !== existing.ownerId;
    if (isReassign) {
      if (!canViewAll(req.userRole)) {
        return fail(res, 403, "Chỉ admin mới có quyền chuyển owner deal.");
      }
      const target = await prisma.user.findUnique({ where: { id: input.ownerId! } });
      if (!target) return fail(res, 400, "User không tồn tại.");
    }

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: {
        ...input,
        expectedClose: input.expectedClose ? new Date(input.expectedClose) : undefined,
      },
    });
    const changed = diffSummary(
      existing as unknown as Record<string, unknown>,
      deal as unknown as Record<string, unknown>,
      ["title", "stage", "value", "probability", "vendor", "expectedClose"],
    );
    const isStatus = input.stage && input.stage !== existing.stage;
    // Reassign gets its own audit action so it's easy to spot in the log.
    const action = isReassign ? "reassign" : isStatus ? "status_change" : "update";
    const summary = isReassign
      ? `Reassign "${deal.title}": ${existing.ownerId} → ${deal.ownerId}`
      : `"${deal.title}": ${changed}`;
    await logAudit(req, { action, entity: "deal", entityId: deal.id, summary });
    ok(res, deal);
  } catch (e) {
    next(e);
  }
});

// Delete: admin only (deals track revenue — sales shouldn't nuke own pipeline).
dealsRouter.delete<{ id: string }>("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    await prisma.deal.delete({ where: { id: req.params.id } });
    if (existing) {
      await logAudit(req, {
        action: "delete",
        entity: "deal",
        entityId: existing.id,
        summary: `Xoá deal "${existing.title}" (stage ${existing.stage}, value ${existing.value ?? 0})`,
      });
    }
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
