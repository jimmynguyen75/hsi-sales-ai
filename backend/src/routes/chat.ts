import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import {
  streamChatReply,
  generateSessionTitle,
  type ChatMessage,
} from "../services/chat-ai.js";
import { isEmbeddingReady, isEmbeddingDisabled } from "../services/embeddings.js";

export const chatRouter = Router();

// GET /api/chat/rag-status — tells the UI whether semantic search is active.
// Loaded lazily: `ready:false, disabled:false` means "not yet warmed — first
// query will trigger load". `disabled:true` means load failed; keyword fallback.
chatRouter.get("/rag-status", async (_req, res) => {
  ok(res, {
    mode: isEmbeddingDisabled() ? "keyword" : isEmbeddingReady() ? "semantic" : "warming",
    ready: isEmbeddingReady(),
    disabled: isEmbeddingDisabled(),
  });
});

// GET /api/chat/sessions
chatRouter.get("/sessions", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const list = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    ok(res, list);
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/sessions/:id
chatRouter.get("/sessions/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const s = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!s || s.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    ok(res, s);
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/sessions — create new empty session
chatRouter.post("/sessions", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const created = await prisma.chatSession.create({
      data: { userId, title: "Hội thoại mới", messages: [] },
    });
    ok(res, created);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/chat/sessions/:id
chatRouter.delete("/sessions/:id", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const s = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!s || s.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });
    await prisma.chatSession.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/sessions/:id/stream — stream AI reply, persist both sides on completion
// Streams raw text deltas; frontend parses. On complete, sends a final JSON line prefixed with "\n[[DONE]]" and citations.
const streamSchema = z.object({ message: z.string().min(1) });

chatRouter.post("/sessions/:id/stream", async (req, res, next) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const session = await prisma.chatSession.findUnique({ where: { id: req.params.id } });
    if (!session || session.userId !== userId)
      return res.status(404).json({ success: false, error: "Not found" });

    const { message } = streamSchema.parse(req.body);

    const history = (session.messages as unknown as ChatMessage[]) ?? [];
    const now = new Date().toISOString();

    // SSE-ish plain-text streaming: application/x-ndjson with {"delta": "..."} lines, final {"done": true, citations: [...]}
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    try {
      const { fullText, citations } = await streamChatReply(
        history,
        message,
        userId,
        (delta) => {
          // write each delta as a JSON line
          res.write(JSON.stringify({ delta }) + "\n");
        },
      );

      // Persist updated messages
      const updatedMessages: ChatMessage[] = [
        ...history,
        { role: "user", content: message, createdAt: now },
        {
          role: "assistant",
          content: fullText,
          createdAt: new Date().toISOString(),
          citations,
        },
      ];

      let title = session.title;
      if (title === "Hội thoại mới" || !title) {
        try {
          title = await generateSessionTitle(message, userId);
        } catch {
          title = message.slice(0, 40);
        }
      }

      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          messages: updatedMessages as unknown as Prisma.InputJsonValue,
          title,
        },
      });

      res.write(JSON.stringify({ done: true, citations, title }) + "\n");
      res.end();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.write(JSON.stringify({ error: msg }) + "\n");
      res.end();
    }
  } catch (e) {
    next(e);
  }
});
