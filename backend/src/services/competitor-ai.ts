import { prisma } from "../lib/prisma.js";
import { generateResponse } from "../lib/ai.js";

export async function generateCompetitorSWOT(
  competitorId: string,
  userId: string,
): Promise<string> {
  const c = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: {
      intel: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!c) throw new Error("Competitor not found");

  // Get recent deals where this competitor was involved
  const competingDeals = await prisma.deal.findMany({
    where: { competitorId, ownerId: userId },
    select: {
      title: true,
      value: true,
      stage: true,
      vendor: true,
      productLine: true,
      winReason: true,
      lossReason: true,
      account: { select: { companyName: true } },
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });

  const wonVs = competingDeals.filter((d) => d.stage === "closed_won");
  const lostTo = competingDeals.filter((d) => d.stage === "closed_lost");

  const system = `Bạn là Competitive Intelligence Analyst tại HPT Vietnam (HSI division). Phân tích đối thủ dựa trên data và viết SWOT cụ thể.

Output markdown tiếng Việt:

## Tóm tắt
(1-2 câu vị thế đối thủ này với HSI trên thị trường VN)

## Strengths (điểm mạnh của đối thủ)
- 3-5 bullet, cụ thể

## Weaknesses (điểm yếu có thể khai thác)
- 3-5 bullet, actionable cho sales HSI

## Opportunities (cơ hội cho HSI)
- 3-4 bullet — khi nào HSI thắng, product line nào mạnh hơn

## Threats (nguy cơ)
- 3-4 bullet — đối thủ đang tấn công ở đâu

## Chiến thuật đối phó
- 4-5 bullet hành động cụ thể cho team sales (VD: "Nhấn mạnh support local", "So sánh TCO 3 năm", "Đưa case study khách cùng ngành")

Dưới 500 từ. Số tiền format "2,5 tỷ ₫". Dựa TRÊN DATA thực, không bịa.`;

  const intelSummary = c.intel.map((i) => ({
    type: i.type,
    impact: i.impact,
    content: i.content,
    source: i.source,
    date: i.createdAt.toISOString().slice(0, 10),
  }));

  const user = `COMPETITOR: ${c.name}
Vendor: ${c.vendor ?? "?"}
Website: ${c.website ?? "?"}

THÔNG TIN CƠ BẢN:
Strengths đã note: ${c.strengths ?? "—"}
Weaknesses đã note: ${c.weaknesses ?? "—"}
Pricing: ${c.pricing ?? "—"}
Notes: ${c.notes ?? "—"}

INTEL GẦN ĐÂY (${c.intel.length}):
${JSON.stringify(intelSummary, null, 2)}

DEALS ĐỐI ĐẦU:
- HSI thắng: ${wonVs.length} deals, tổng ${wonVs.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString("vi-VN")} ₫
- HSI thua: ${lostTo.length} deals, tổng ${lostTo.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString("vi-VN")} ₫

Mẫu deals HSI thắng: ${JSON.stringify(wonVs.slice(0, 5), null, 2)}
Mẫu deals HSI thua: ${JSON.stringify(lostTo.slice(0, 5), null, 2)}`;

  return generateResponse(system, user, {
    userId,
    module: "competitor.swot",
    maxTokens: 2000,
    temperature: 0.4,
  });
}
