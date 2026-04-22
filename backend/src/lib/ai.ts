import Groq from "groq-sdk";
import { prisma } from "./prisma.js";

const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export const aiClient = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});

// --- Simple in-memory rate limiter: 10 req/min per user ---
type Bucket = { windowStart: number; count: number };
const buckets = new Map<string, Bucket>();

function checkRateLimit(userId: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

export interface AIOptions {
  userId: string;
  module: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

async function callAI(
  systemPrompt: string,
  userMessage: string,
  opts: AIOptions,
): Promise<{ text: string; tokenIn: number; tokenOut: number; latencyMs: number }> {
  if (!checkRateLimit(opts.userId)) {
    throw new Error("RATE_LIMIT: too many AI requests, try again in a minute");
  }

  const start = Date.now();
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.4;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await aiClient.chat.completions.create(
        {
          model: MODEL,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      const text = (resp.choices?.[0]?.message?.content ?? "").trim();
      const latencyMs = Date.now() - start;
      const tokenIn = resp.usage?.prompt_tokens ?? 0;
      const tokenOut = resp.usage?.completion_tokens ?? 0;

      prisma.aILog
        .create({
          data: {
            module: opts.module,
            prompt: `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userMessage}`.slice(0, 20000),
            response: text.slice(0, 20000),
            tokenIn,
            tokenOut,
            latencyMs,
            userId: opts.userId,
          },
        })
        .catch((e) => console.error("AI log write failed:", e));

      return { text, tokenIn, tokenOut, latencyMs };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|403|invalid_api_key/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Groq API call failed");
}

export async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  opts: AIOptions,
): Promise<string> {
  const r = await callAI(systemPrompt, userMessage, opts);
  return r.text;
}

export async function generateWithRAG(
  systemPrompt: string,
  userMessage: string,
  contextDocs: { title: string; content: string }[],
  opts: AIOptions,
): Promise<string> {
  const contextBlock = contextDocs.length
    ? "\n\n=== CONTEXT DOCUMENTS ===\n" +
      contextDocs
        .map((d, i) => `[Doc ${i + 1}: ${d.title}]\n${d.content}`)
        .join("\n\n---\n\n")
    : "";
  const augmentedSystem = systemPrompt + contextBlock;
  const r = await callAI(augmentedSystem, userMessage, opts);
  return r.text;
}

/**
 * Ask the model for JSON, parse + validate. Strips ```json fences if present.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userMessage: string,
  opts: AIOptions,
): Promise<T> {
  const hardened =
    systemPrompt +
    "\n\nIMPORTANT: Respond with ONLY valid JSON. No prose, no markdown fences, no commentary.";
  const raw = await generateResponse(hardened, userMessage, {
    ...opts,
    temperature: opts.temperature ?? 0.2,
  });
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/[{\[][\s\S]*[}\]]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Model did not return valid JSON: " + cleaned.slice(0, 200));
  }
}

/**
 * SSE-style streaming. onChunk receives each text delta as it arrives.
 * Returns the full concatenated text once done.
 */
export async function streamResponse(
  systemPrompt: string,
  userMessage: string,
  opts: AIOptions,
  onChunk: (delta: string) => void,
): Promise<string> {
  if (!checkRateLimit(opts.userId)) {
    throw new Error("RATE_LIMIT: too many AI requests, try again in a minute");
  }

  const start = Date.now();
  let full = "";
  let tokenIn = 0;
  let tokenOut = 0;

  const stream = await aiClient.chat.completions.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.4,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      onChunk(delta);
    }
    // Final chunk includes usage when available
    const usage = (chunk as { x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } })
      .x_groq?.usage;
    if (usage) {
      tokenIn = usage.prompt_tokens ?? tokenIn;
      tokenOut = usage.completion_tokens ?? tokenOut;
    }
  }

  const latencyMs = Date.now() - start;
  prisma.aILog
    .create({
      data: {
        module: opts.module,
        prompt: `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userMessage}`.slice(0, 20000),
        response: full.slice(0, 20000),
        tokenIn,
        tokenOut,
        latencyMs,
        userId: opts.userId,
      },
    })
    .catch((e) => console.error("AI log write failed:", e));

  return full;
}
