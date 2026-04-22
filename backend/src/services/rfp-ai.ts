import { prisma } from "../lib/prisma.js";
import { generateStructured, generateResponse } from "../lib/ai.js";

export interface RFPRequirement {
  id: string;
  category: string; // functional | technical | security | commercial | timeline | support | compliance | other
  priority: "must" | "should" | "nice";
  text: string;
  response?: string;
  status?: "pending" | "drafted" | "approved";
  confidence?: "high" | "medium" | "low";
}

/**
 * Extract structured requirements from raw RFP content.
 */
export async function extractRequirements(
  rawContent: string,
  userId: string,
): Promise<RFPRequirement[]> {
  const system = `Bạn là RFP Analyst tại HPT Vietnam (HSI division). Đọc RFP và extract yêu cầu thành list có cấu trúc.

Return JSON array (không wrap object, chỉ array):
[
  {
    "category": "functional" | "technical" | "security" | "commercial" | "timeline" | "support" | "compliance" | "other",
    "priority": "must" | "should" | "nice",
    "text": "mô tả yêu cầu đầy đủ, rõ ràng, tiếng Việt (giữ thuật ngữ tiếng Anh nếu RFP gốc dùng)"
  },
  ...
]

NGUYÊN TẮC:
- Extract tất cả yêu cầu đáng kể (10-40 items tuỳ RFP)
- "must" = bắt buộc, "should" = nên có, "nice" = tuỳ chọn
- Không bịa, không tự tạo yêu cầu không có trong RFP
- Nếu RFP chỉ dùng mô tả chung, vẫn chia thành items cụ thể (VD: "Hệ thống cần high availability" = 1 item)
- Category chọn gần nhất, không hiểu rõ thì "other"`;

  type RawItem = { category: string; priority: string; text: string };
  const items = await generateStructured<RawItem[]>(system, rawContent.slice(0, 18000), {
    userId,
    module: "rfp.extract",
    maxTokens: 3500,
    temperature: 0.2,
  });

  if (!Array.isArray(items)) throw new Error("AI did not return array of requirements");

  return items.map((it, idx) => ({
    id: `req_${Date.now()}_${idx}`,
    category: normalizeCategory(it.category),
    priority: normalizePriority(it.priority),
    text: (it.text ?? "").trim(),
    status: "pending" as const,
  })).filter((it) => it.text.length > 0);
}

function normalizeCategory(c: string): string {
  const v = (c ?? "").toLowerCase().trim();
  const allowed = [
    "functional",
    "technical",
    "security",
    "commercial",
    "timeline",
    "support",
    "compliance",
    "other",
  ];
  return allowed.includes(v) ? v : "other";
}

function normalizePriority(p: string): "must" | "should" | "nice" {
  const v = (p ?? "").toLowerCase().trim();
  if (v === "must" || v === "should" || v === "nice") return v;
  if (v.includes("must") || v.includes("bắt buộc") || v.includes("required")) return "must";
  if (v.includes("nice") || v.includes("optional")) return "nice";
  return "should";
}

/**
 * Generate a response for a single requirement, grounded in HSI's vendor portfolio.
 */
export async function draftRequirementResponse(
  rfpId: string,
  requirementId: string,
  userId: string,
): Promise<{ response: string; confidence: "high" | "medium" | "low" }> {
  const rfp = await prisma.rFPResponse.findUnique({ where: { id: rfpId } });
  if (!rfp) throw new Error("RFP not found");
  const reqs = (rfp.requirements as unknown as RFPRequirement[]) ?? [];
  const req = reqs.find((r) => r.id === requirementId);
  if (!req) throw new Error("Requirement not found");

  const system = `Bạn là Solution Architect tại HPT Vietnam (HSI division), chuyên phân phối HPE, Dell, IBM, Palo Alto Networks, CrowdStrike, Microsoft. Viết câu trả lời cho 1 yêu cầu RFP.

Output JSON:
{
  "response": "câu trả lời 3-6 câu tiếng Việt chuyên nghiệp. Nêu rõ: HSI đáp ứng được bằng giải pháp nào (cụ thể vendor + product line), kinh nghiệm liên quan, và (nếu phù hợp) lợi ích so với đối thủ.",
  "confidence": "high" | "medium" | "low"    // high nếu HSI có portfolio rõ ràng đáp ứng, medium nếu một phần, low nếu không chắc
}

NGUYÊN TẮC:
- Không bịa thông số/case study nếu không biết
- Ưu tiên vendor HSI đang phân phối: HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft
- Dùng ngôn ngữ formal phù hợp proposal`;

  const user = `RFP: ${rfp.title}
Client: ${rfp.clientName ?? "?"}

YÊU CẦU (${req.category} · ${req.priority}):
${req.text}

Các yêu cầu khác trong cùng RFP (để có context):
${reqs
  .filter((r) => r.id !== requirementId)
  .slice(0, 8)
  .map((r) => `- [${r.category}/${r.priority}] ${r.text}`)
  .join("\n")}`;

  const result = await generateStructured<{
    response: string;
    confidence: "high" | "medium" | "low";
  }>(system, user, {
    userId,
    module: "rfp.respond",
    maxTokens: 800,
    temperature: 0.4,
  });

  return {
    response: result.response?.trim() ?? "",
    confidence:
      result.confidence === "high" || result.confidence === "low" ? result.confidence : "medium",
  };
}

/**
 * Generate responses for all pending requirements, respecting per-call rate limit.
 */
export async function draftAllResponses(
  rfpId: string,
  userId: string,
  limit = 8,
): Promise<{ drafted: number; skipped: number; errors: number }> {
  const rfp = await prisma.rFPResponse.findUnique({ where: { id: rfpId } });
  if (!rfp) throw new Error("RFP not found");

  const reqs = [...((rfp.requirements as unknown as RFPRequirement[]) ?? [])];
  let drafted = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of reqs) {
    if (drafted >= limit) {
      skipped += 1;
      continue;
    }
    if (r.response && r.status !== "pending") {
      skipped += 1;
      continue;
    }
    try {
      const out = await draftRequirementResponse(rfpId, r.id, userId);
      r.response = out.response;
      r.confidence = out.confidence;
      r.status = "drafted";
      drafted += 1;
    } catch (e) {
      errors += 1;
      if (e instanceof Error && /RATE_LIMIT/.test(e.message)) break;
    }
  }

  await prisma.rFPResponse.update({
    where: { id: rfpId },
    data: { requirements: reqs as unknown as import("@prisma/client").Prisma.InputJsonValue },
  });

  return { drafted, skipped, errors };
}
