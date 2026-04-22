import { prisma } from "../lib/prisma.js";
import { streamResponse, generateResponse } from "../lib/ai.js";
import { Prisma } from "@prisma/client";
import { embedText, cosineSim, isEmbeddingDisabled } from "./embeddings.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: Array<{ type: "product"; id: string; label: string }>;
}

const VENDOR_KEYWORDS = [
  "hpe",
  "dell",
  "ibm",
  "palo alto",
  "paloalto",
  "pa-",
  "crowdstrike",
  "microsoft",
  "cisco",
  "fortinet",
  "lenovo",
  "vmware",
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  server: ["server", "máy chủ", "proliant", "poweredge", "blade"],
  storage: ["storage", "lưu trữ", "alletra", "powerstore", "san", "nas"],
  networking: ["network", "mạng", "switch", "router", "aruba"],
  security: ["security", "bảo mật", "firewall", "edr", "xdr", "endpoint", "waf", "siem", "falcon", "palo alto"],
  cloud: ["cloud", "azure", "aws", "o365", "m365", "office"],
  software: ["license", "subscription", "software"],
};

type ProductRow = {
  id: string;
  vendor: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  listPrice: number;
  currency: string;
  unit: string;
};

function renderProduct(p: ProductRow) {
  return {
    id: p.id,
    label: `${p.vendor} ${p.name}`,
    body: [
      `[${p.id}] ${p.vendor} — ${p.name}${p.sku ? ` (SKU ${p.sku})` : ""}`,
      p.category ? `Category: ${p.category}` : null,
      p.description ? `Mô tả: ${p.description}` : null,
      p.listPrice ? `Giá list: ${p.listPrice.toLocaleString("vi-VN")} ${p.currency}/${p.unit}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Semantic RAG over product catalog. Falls back to keyword match when embeddings
 * are unavailable OR no product has an embedding yet.
 */
async function semanticRetrieve(question: string, take: number): Promise<ProductRow[] | null> {
  if (isEmbeddingDisabled()) return null;
  const qvec = await embedText(question);
  if (!qvec) return null;

  // Load all products with embeddings. With ~40 items this is negligible; scale with
  // pgvector or a vector DB when the catalog crosses ~1k items.
  const products = await prisma.product.findMany({
    where: { active: true, NOT: { embedding: { equals: Prisma.AnyNull } } },
    select: {
      id: true,
      vendor: true,
      name: true,
      sku: true,
      category: true,
      description: true,
      listPrice: true,
      currency: true,
      unit: true,
      embedding: true,
    },
  });
  if (products.length === 0) return null;

  const scored = products
    .map((p) => {
      const vec = p.embedding as unknown as number[] | null;
      if (!Array.isArray(vec)) return null;
      return { p, score: cosineSim(qvec, vec) };
    })
    .filter((x): x is { p: typeof products[number]; score: number } => x !== null);

  // Threshold = 0.15. MiniLM was trained primarily on English; mixed VN/EN queries
  // score lower than pure-English. Below ~0.15 results are noise; we trust the
  // downstream LLM to ignore weakly-related entries.
  const relevant = scored.filter((x) => x.score > 0.15);
  if (relevant.length === 0) return [];

  return relevant
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map(({ p }) => ({
      id: p.id,
      vendor: p.vendor,
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description,
      listPrice: p.listPrice,
      currency: p.currency,
      unit: p.unit,
    }));
}

/**
 * Keyword-based retrieval — vendor names, category kw, fallback to name-contains.
 * Used as fallback when semantic retrieval is unavailable.
 */
async function keywordRetrieve(question: string): Promise<ProductRow[]> {
  const q = question.toLowerCase();

  const vendors = VENDOR_KEYWORDS.filter((v) => q.includes(v));
  const categories = Object.keys(CATEGORY_KEYWORDS).filter((cat) =>
    CATEGORY_KEYWORDS[cat].some((kw) => q.includes(kw)),
  );

  const where: Prisma.ProductWhereInput = { active: true };
  if (vendors.length) {
    where.OR = vendors.map((v) => ({
      vendor: { contains: v === "pa-" ? "Palo" : v, mode: "insensitive" as const },
    }));
  }
  if (categories.length) {
    where.category = { in: categories };
  }

  const select = {
    id: true,
    vendor: true,
    name: true,
    sku: true,
    category: true,
    description: true,
    listPrice: true,
    currency: true,
    unit: true,
  } as const;

  if (!vendors.length && !categories.length) {
    const tokens = q.split(/\s+/).filter((t) => t.length >= 4).slice(0, 4);
    if (tokens.length === 0) return [];
    return prisma.product.findMany({
      where: {
        active: true,
        OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
      },
      take: 8,
      orderBy: { listPrice: "desc" },
      select,
    });
  }

  return prisma.product.findMany({ where, take: 10, orderBy: { listPrice: "desc" }, select });
}

/**
 * Pull a handful of relevant products from DB based on the user's question.
 * Tries semantic RAG first; falls back to keyword match when embeddings are
 * unavailable. Keeps context small — we give the model at most 8 products.
 */
export async function retrieveProductContext(question: string): Promise<
  Array<{ id: string; label: string; body: string }>
> {
  const semantic = await semanticRetrieve(question, 8);
  const rows = semantic ?? (await keywordRetrieve(question));
  return rows.map(renderProduct);
}

const CHAT_SYSTEM_PROMPT = `Bạn là Product Specialist tại HPT Vietnam (HSI division), hỗ trợ team sales hỏi đáp nhanh về portfolio HPE, Dell, IBM, Palo Alto Networks, CrowdStrike, Microsoft.

QUY TẮC:
- Trả lời bằng tiếng Việt, ngắn gọn, chính xác, formal phù hợp sales
- NẾU CÓ context products bên dưới: dựa vào đó trả lời. Có thể trích dẫn [product_id] khi nhắc tên sản phẩm cụ thể trong catalog.
- NẾU KHÔNG có context product match: dùng kiến thức chung (pretraining) để trả lời, nhưng ghi rõ "thông tin chung, vui lòng kiểm chứng với vendor"
- Không bịa thông số kỹ thuật. Nếu không biết chắc, nói "cần tra cứu datasheet".
- So sánh vendor: cân bằng, không thiên vị, nhưng ưu tiên gợi ý HSI portfolio.
- Format markdown: bullet, bold khi cần. Không dùng heading lớn cho câu trả lời ngắn.`;

/**
 * Stream a chat response given history + the user's new message.
 * Returns the full text and citation IDs once the stream completes.
 */
export async function streamChatReply(
  history: ChatMessage[],
  newUserContent: string,
  userId: string,
  onChunk: (delta: string) => void,
): Promise<{ fullText: string; citations: Array<{ type: "product"; id: string; label: string }> }> {
  const products = await retrieveProductContext(newUserContent);

  // Build history string (keep last 6 turns max to control context)
  const recentHistory = history.slice(-6);
  const historyText = recentHistory
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");

  const contextBlock = products.length
    ? "\n\n=== PRODUCT CATALOG MATCHES ===\n" + products.map((p) => p.body).join("\n\n---\n\n")
    : "\n\n(Không có sản phẩm matching trong catalog; dùng kiến thức chung.)";

  const system = CHAT_SYSTEM_PROMPT + contextBlock;

  const userPayload = historyText
    ? `LỊCH SỬ TRÒ CHUYỆN:\n${historyText}\n\n---\nCÂU HỎI MỚI:\n${newUserContent}`
    : newUserContent;

  const fullText = await streamResponse(
    system,
    userPayload,
    {
      userId,
      module: "chat.knowledge",
      maxTokens: 1200,
      temperature: 0.3,
    },
    onChunk,
  );

  // Citations: only include products that AI actually referenced by [id] or whose label appears in reply.
  const citations = products
    .filter((p) => fullText.includes(`[${p.id}]`) || fullText.toLowerCase().includes(p.label.toLowerCase()))
    .map((p) => ({ type: "product" as const, id: p.id, label: p.label }));

  return { fullText, citations };
}

/**
 * Generate a short (<=6 words) title from the first user message.
 */
export async function generateSessionTitle(
  firstMessage: string,
  userId: string,
): Promise<string> {
  const system = `Tạo tiêu đề ngắn (tối đa 6 từ, không dấu chấm cuối) tóm tắt câu hỏi của user. Trả về chỉ tiêu đề, không giải thích.`;
  try {
    const t = await generateResponse(system, firstMessage.slice(0, 500), {
      userId,
      module: "chat.title",
      maxTokens: 50,
      temperature: 0.3,
    });
    return t.replace(/["'.\n]/g, "").trim().slice(0, 60) || "Hội thoại mới";
  } catch {
    return firstMessage.slice(0, 40) || "Hội thoại mới";
  }
}
