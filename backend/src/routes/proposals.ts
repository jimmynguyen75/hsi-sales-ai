import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { generateProposalSections, refineSection } from "../services/proposal-ai.js";
import { renderProposalPDF } from "../services/document-export.js";
import { logAudit, diffSummary } from "../services/audit.js";
import type { Prisma } from "@prisma/client";

export const proposalsRouter = Router();

// GET /api/proposals/:id/export.pdf — streams a PDF download of the proposal.
proposalsRouter.get("/:id/export.pdf", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const proposal = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!proposal || proposal.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const account = proposal.accountId
      ? await prisma.account.findUnique({ where: { id: proposal.accountId } })
      : null;

    const buf = await renderProposalPDF(proposal, account);
    const safeTitle = proposal.title.replace(/[^\w\-]+/g, "_").slice(0, 60) || "proposal";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}_v${proposal.version}.pdf"`,
    );
    res.setHeader("Content-Length", buf.length.toString());
    await logAudit(req, {
      action: "export",
      entity: "proposal",
      entityId: proposal.id,
      summary: `Xuất PDF proposal "${proposal.title}" v${proposal.version}`,
    });
    res.end(buf);
  } catch (e) {
    next(e);
  }
});

proposalsRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { accountId, dealId } = req.query as Record<string, string | undefined>;
    const where: Prisma.ProposalWhereInput = { ownerId: userId };
    if (accountId) where.accountId = accountId;
    if (dealId) where.dealId = dealId;
    const items = await prisma.proposal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    ok(res, items);
  } catch (e) {
    next(e);
  }
});

proposalsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const p = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!p || p.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, p);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  title: z.string().min(1),
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  language: z.enum(["vi", "en"]).optional(),
  inputs: z
    .object({
      clientName: z.string().optional(),
      industry: z.string().optional(),
      requirements: z.string().optional(),
      valueProps: z.string().optional(),
      timeline: z.string().optional(),
      budget: z.string().optional(),
      vendors: z.array(z.string()).optional(),
    })
    .optional(),
});

proposalsRouter.post("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = createSchema.parse(req.body);
    const created = await prisma.proposal.create({
      data: {
        title: input.title,
        accountId: input.accountId || null,
        dealId: input.dealId || null,
        language: input.language ?? "vi",
        inputs: (input.inputs ?? {}) as Prisma.InputJsonValue,
        sections: [] as Prisma.InputJsonValue,
        ownerId: userId,
      },
    });
    await logAudit(req, {
      action: "create",
      entity: "proposal",
      entityId: created.id,
      summary: `Tạo proposal "${created.title}" (${created.language})`,
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "ready", "sent", "accepted", "rejected"]).optional(),
  language: z.enum(["vi", "en"]).optional(),
  inputs: z.record(z.unknown()).optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        heading: z.string(),
        body: z.string(),
        order: z.number(),
      }),
    )
    .optional(),
});

proposalsRouter.put("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const input = updateSchema.parse(req.body);
    const data: Prisma.ProposalUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.status !== undefined) data.status = input.status;
    if (input.language !== undefined) data.language = input.language;
    if (input.inputs !== undefined) data.inputs = input.inputs as Prisma.InputJsonValue;
    if (input.sections !== undefined) data.sections = input.sections as Prisma.InputJsonValue;
    const updated = await prisma.proposal.update({ where: { id: req.params.id }, data });
    const changed = diffSummary(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["title", "status", "language"],
    );
    const isStatus = input.status && input.status !== existing.status;
    await logAudit(req, {
      action: isStatus ? "status_change" : "update",
      entity: "proposal",
      entityId: updated.id,
      summary: `"${updated.title}": ${changed}`,
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

proposalsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.proposal.delete({ where: { id: req.params.id } });
    await logAudit(req, {
      action: "delete",
      entity: "proposal",
      entityId: existing.id,
      summary: `Xoá proposal "${existing.title}"`,
    });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

proposalsRouter.post("/:id/generate", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const inputs = (existing.inputs ?? {}) as Record<string, unknown>;
    const accountIdVal = existing.accountId;

    // Enrich clientName from linked account if missing
    let clientName = (inputs.clientName as string | undefined) ?? "";
    let industry = inputs.industry as string | undefined;
    if (accountIdVal) {
      const a = await prisma.account.findUnique({ where: { id: accountIdVal } });
      if (a) {
        if (!clientName) clientName = a.companyName;
        if (!industry) industry = a.industry ?? undefined;
      }
    }
    if (!clientName) clientName = existing.title;

    const sections = await generateProposalSections(
      {
        clientName,
        industry,
        requirements: (inputs.requirements as string) ?? "",
        valueProps: inputs.valueProps as string | undefined,
        timeline: inputs.timeline as string | undefined,
        budget: inputs.budget as string | undefined,
        vendors: inputs.vendors as string[] | undefined,
        language: existing.language as "vi" | "en",
      },
      userId,
    );

    const updated = await prisma.proposal.update({
      where: { id: req.params.id },
      data: {
        sections: sections as unknown as Prisma.InputJsonValue,
        version: existing.version + 1,
      },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

const refineSchema = z.object({
  sectionId: z.string(),
  instruction: z.string().min(1),
});

proposalsRouter.post("/:id/refine-section", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.proposal.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const input = refineSchema.parse(req.body);
    const sections = (existing.sections ?? []) as Array<{
      id: string;
      heading: string;
      body: string;
      order: number;
    }>;
    const target = sections.find((s) => s.id === input.sectionId);
    if (!target) return res.status(404).json({ success: false, error: "Section not found" });

    const newBody = await refineSection(target.heading, target.body, input.instruction, userId);
    target.body = newBody;

    const updated = await prisma.proposal.update({
      where: { id: req.params.id },
      data: { sections: sections as unknown as Prisma.InputJsonValue },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});
