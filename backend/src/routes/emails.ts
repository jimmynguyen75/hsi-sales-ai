import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { composeEmail } from "../services/email-ai.js";
import { sendEmail, getEmailMode } from "../services/email-send.js";
import { logAudit } from "../services/audit.js";

export const emailsRouter = Router();

// GET /api/emails/status — returns whether SMTP is configured (for UI hint)
emailsRouter.get("/status", (_req, res) => {
  ok(res, { mode: getEmailMode() });
});

const composeSchema = z.object({
  type: z.enum([
    "cold_outreach",
    "follow_up",
    "thank_you",
    "introduction",
    "proposal_send",
    "meeting_request",
    "check_in",
  ]),
  language: z.enum(["vi", "en"]).default("vi"),
  tone: z.enum(["professional", "friendly", "formal", "urgent"]).default("professional"),
  keyPoints: z.string().min(1),
  accountId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  saveDraft: z.boolean().optional(),
});

emailsRouter.post("/compose", async (req, res, next) => {
  try {
    const input = composeSchema.parse(req.body);
    const userId = (req as AuthedRequest).userId;

    // Build context from linked entities
    let context: Parameters<typeof composeEmail>[0]["context"] = {};
    if (input.contactId) {
      const c = await prisma.contact.findUnique({ where: { id: input.contactId } });
      if (c) {
        context.contactName = c.fullName;
        context.contactTitle = c.title ?? undefined;
      }
    }
    if (input.accountId) {
      const a = await prisma.account.findUnique({ where: { id: input.accountId } });
      if (a) {
        context.accountName = a.companyName;
        context.industry = a.industry ?? undefined;
      }
    }
    if (input.dealId) {
      const d = await prisma.deal.findUnique({ where: { id: input.dealId } });
      if (d) {
        context.dealTitle = d.title;
        context.dealStage = d.stage;
      }
    }

    const result = await composeEmail(
      {
        type: input.type,
        language: input.language,
        tone: input.tone,
        keyPoints: input.keyPoints,
        context,
      },
      userId,
    );

    let draftId: string | null = null;
    if (input.saveDraft) {
      const draft = await prisma.emailDraft.create({
        data: {
          type: input.type,
          language: input.language,
          tone: input.tone,
          subject: result.subject,
          body: result.body,
          accountId: input.accountId || null,
          dealId: input.dealId || null,
          contactId: input.contactId || null,
          ownerId: userId,
        },
      });
      draftId = draft.id;
    }

    ok(res, { ...result, draftId });
  } catch (e) {
    next(e);
  }
});

emailsRouter.get("/drafts", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const drafts = await prisma.emailDraft.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    ok(res, drafts);
  } catch (e) {
    next(e);
  }
});

emailsRouter.get("/drafts/:id", async (req, res, next) => {
  try {
    const draft = await prisma.emailDraft.findUnique({ where: { id: req.params.id } });
    if (!draft) return res.status(404).json({ success: false, error: "Not found" });
    ok(res, draft);
  } catch (e) {
    next(e);
  }
});

emailsRouter.delete("/drafts/:id", async (req, res, next) => {
  try {
    await prisma.emailDraft.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// PUT /api/emails/drafts/:id — manual edit
const draftEditSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  status: z.enum(["draft", "sent", "failed"]).optional(),
});
emailsRouter.put("/drafts/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.emailDraft.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.ownerId !== userId)
      return fail(res, 404, "Not found");
    const input = draftEditSchema.parse(req.body);
    const updated = await prisma.emailDraft.update({
      where: { id: req.params.id },
      data: input,
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

// POST /api/emails/drafts/:id/send — send via SMTP, persist status.
const sendSchema = z.object({
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  replyTo: z.string().email().optional(),
  // Allow subject/body overrides at send time (user may have edited without saving).
  subject: z.string().optional(),
  body: z.string().optional(),
});
emailsRouter.post("/drafts/:id/send", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const draft = await prisma.emailDraft.findUnique({ where: { id: req.params.id } });
    if (!draft || draft.ownerId !== userId) return fail(res, 404, "Not found");

    const input = sendSchema.parse(req.body);
    const subject = input.subject ?? draft.subject;
    const body = input.body ?? draft.body;

    try {
      const result = await sendEmail({
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.replyTo,
        subject,
        body,
      });

      const updated = await prisma.emailDraft.update({
        where: { id: draft.id },
        data: {
          subject,
          body,
          status: "sent",
          sentAt: new Date(),
          sentTo: input.to,
          sendError: null,
        },
      });

      await logAudit(req, {
        action: "send",
        entity: "email_draft",
        entityId: updated.id,
        summary: `Gửi email "${subject}" đến ${input.to} (${result.mode})`,
        meta: { mode: result.mode, messageId: result.messageId },
      });

      ok(res, {
        draft: updated,
        mode: result.mode,
        messageId: result.messageId,
        accepted: result.accepted,
        preview: result.previewMessage ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { status: "failed", sendError: msg },
      });
      return fail(res, 500, `Gửi email thất bại: ${msg}`);
    }
  } catch (e) {
    next(e);
  }
});

emailsRouter.get("/templates", async (_req, res, next) => {
  try {
    const ts = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
    ok(res, ts);
  } catch (e) {
    next(e);
  }
});

const tplSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  language: z.string(),
  subject: z.string(),
  body: z.string(),
});

emailsRouter.post("/templates", async (req, res, next) => {
  try {
    const input = tplSchema.parse(req.body);
    const t = await prisma.emailTemplate.create({ data: input });
    ok(res, t);
  } catch (e) {
    next(e);
  }
});

emailsRouter.delete("/templates/:id", async (req, res, next) => {
  try {
    await prisma.emailTemplate.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
