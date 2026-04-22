import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import {
  extractRequirements,
  draftRequirementResponse,
  draftAllResponses,
  type RFPRequirement,
} from "../services/rfp-ai.js";
import { extractTextFromFile, SUPPORTED_UPLOAD_TYPES } from "../services/rfp-extract.js";

export const rfpRouter = Router();

// In-memory upload — 10MB cap covers almost any RFP doc. Storage on disk isn't
// necessary: we extract to text and discard the binary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const upsertSchema = z.object({
  title: z.string().min(1),
  clientName: z.string().optional(),
  deadline: z.string().optional(),
  rawContent: z.string().default(""),
  status: z.enum(["draft", "in_progress", "submitted"]).optional(),
  accountId: z.string().optional(),
  dealId: z.string().optional(),
});

// POST /api/rfp/upload — extract text from PDF/DOCX, returns plain text.
// Client calls this before creating an RFP, then drops text into rawContent.
rfpRouter.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return fail(res, 400, "Thiếu file upload (field 'file')");
    if (!SUPPORTED_UPLOAD_TYPES.includes(file.mimetype) && !/\.(pdf|docx)$/i.test(file.originalname)) {
      return fail(
        res,
        415,
        `Định dạng không hỗ trợ (${file.mimetype}). Chỉ nhận PDF hoặc DOCX.`,
      );
    }
    const { text, pageCount } = await extractTextFromFile(
      file.buffer,
      file.originalname,
    );
    ok(res, {
      text,
      filename: file.originalname,
      bytes: file.size,
      pageCount,
      characters: text.length,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/rfp
rfpRouter.get("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.rFPResponse.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        clientName: true,
        deadline: true,
        status: true,
        requirements: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // Derive stats per RFP
    const withStats = list.map((r) => {
      const reqs = (r.requirements as unknown as RFPRequirement[]) ?? [];
      const drafted = reqs.filter((x) => x.response && x.status !== "pending").length;
      return {
        id: r.id,
        title: r.title,
        clientName: r.clientName,
        deadline: r.deadline,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        totalRequirements: reqs.length,
        draftedResponses: drafted,
      };
    });
    ok(res, withStats);
  } catch (e) {
    next(e);
  }
});

// GET /api/rfp/:id
rfpRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const r = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!r || r.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, r);
  } catch (e) {
    next(e);
  }
});

// POST /api/rfp
rfpRouter.post("/", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = upsertSchema.parse(req.body);
    const created = await prisma.rFPResponse.create({
      data: {
        userId,
        title: input.title,
        clientName: input.clientName ?? null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        rawContent: input.rawContent,
        accountId: input.accountId ?? null,
        dealId: input.dealId ?? null,
      },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

// PUT /api/rfp/:id
rfpRouter.put("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const input = upsertSchema.partial().parse(req.body);
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const updated = await prisma.rFPResponse.update({
      where: { id: req.params.id },
      data: {
        ...input,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
      },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/rfp/:id
rfpRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.rFPResponse.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/rfp/:id/extract — AI extract requirements from rawContent
rfpRouter.post("/:id/extract", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    if (!existing.rawContent?.trim()) {
      return res.status(400).json({ success: false, error: "rawContent is empty" });
    }

    const reqs = await extractRequirements(existing.rawContent, userId);
    const updated = await prisma.rFPResponse.update({
      where: { id: req.params.id },
      data: {
        requirements: reqs as unknown as Prisma.InputJsonValue,
        status: "in_progress",
      },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

// POST /api/rfp/:id/respond/:reqId — AI draft response for one requirement
rfpRouter.post("/:id/respond/:reqId", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const out = await draftRequirementResponse(req.params.id, req.params.reqId, userId);
    const reqs = [...((existing.requirements as unknown as RFPRequirement[]) ?? [])];
    const idx = reqs.findIndex((r) => r.id === req.params.reqId);
    if (idx < 0) return res.status(404).json({ success: false, error: "Requirement not found" });
    reqs[idx] = {
      ...reqs[idx],
      response: out.response,
      confidence: out.confidence,
      status: "drafted",
    };
    const updated = await prisma.rFPResponse.update({
      where: { id: req.params.id },
      data: { requirements: reqs as unknown as Prisma.InputJsonValue },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});

// POST /api/rfp/:id/respond-all?limit=8 — batch draft up to N
rfpRouter.post("/:id/respond-all", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const { limit } = req.query as { limit?: string };
    const max = Math.min(Number(limit ?? "8") || 8, 10);

    const result = await draftAllResponses(req.params.id, userId, max);
    const updated = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    ok(res, { ...result, rfp: updated });
  } catch (e) {
    next(e);
  }
});

// PUT /api/rfp/:id/requirement/:reqId — manual edit a requirement/response
const editReqSchema = z.object({
  text: z.string().optional(),
  response: z.string().optional(),
  status: z.enum(["pending", "drafted", "approved"]).optional(),
  priority: z.enum(["must", "should", "nice"]).optional(),
  category: z.string().optional(),
});
rfpRouter.put("/:id/requirement/:reqId", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const existing = await prisma.rFPResponse.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    const patch = editReqSchema.parse(req.body);
    const reqs = [...((existing.requirements as unknown as RFPRequirement[]) ?? [])];
    const idx = reqs.findIndex((r) => r.id === req.params.reqId);
    if (idx < 0) return res.status(404).json({ success: false, error: "Requirement not found" });
    reqs[idx] = { ...reqs[idx], ...patch };
    const updated = await prisma.rFPResponse.update({
      where: { id: req.params.id },
      data: { requirements: reqs as unknown as Prisma.InputJsonValue },
    });
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});
