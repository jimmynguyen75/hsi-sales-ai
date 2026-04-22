import { prisma } from "../lib/prisma.js";
import { generateResponse, generateStructured } from "../lib/ai.js";

const SYSTEM_BASE = `Bạn là AI assistant chuyên hỗ trợ team kinh doanh HPT Vietnam (HSI — Hybrid Solutions & Infrastructure).
Chuyên bán giải pháp hạ tầng IT từ HPE, Dell, IBM, Palo Alto Networks, CrowdStrike, Microsoft.
Trả lời ngắn gọn, chuyên nghiệp, tiếng Việt (trừ khi được yêu cầu khác).`;

async function loadAccountContext(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      contacts: true,
      deals: { orderBy: { updatedAt: "desc" }, take: 20 },
      activities: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!account) throw new Error("Account not found");
  return account;
}

function formatAccountContext(a: Awaited<ReturnType<typeof loadAccountContext>>): string {
  const deals = a.deals
    .map(
      (d) =>
        `- ${d.title} | stage=${d.stage} | value=${d.value ?? "?"} | vendor=${d.vendor ?? "?"} | prob=${d.probability ?? "?"}%`,
    )
    .join("\n") || "  (chưa có deal)";
  const acts = a.activities
    .slice(0, 15)
    .map(
      (act) =>
        `- [${act.createdAt.toISOString().slice(0, 10)}] ${act.type}: ${act.subject}${act.content ? " — " + act.content.slice(0, 150) : ""}`,
    )
    .join("\n") || "  (chưa có activity)";
  const contacts = a.contacts
    .map((c) => `- ${c.fullName}${c.title ? ` (${c.title})` : ""}${c.isPrimary ? " [primary]" : ""}`)
    .join("\n") || "  (chưa có contact)";

  return `=== ACCOUNT ===
Tên: ${a.companyName}
Industry: ${a.industry ?? "?"}
Size: ${a.size ?? "?"}
Website: ${a.website ?? "?"}
Notes: ${a.notes ?? "?"}

=== CONTACTS ===
${contacts}

=== DEALS (mới nhất) ===
${deals}

=== ACTIVITIES (mới nhất) ===
${acts}`;
}

export async function summarizeAccount(accountId: string, userId: string): Promise<string> {
  const account = await loadAccountContext(accountId);
  const ctx = formatAccountContext(account);
  return generateResponse(
    SYSTEM_BASE +
      "\n\nBạn đang tóm tắt 1 account cho sales rep. Tóm tắt thành 3-5 bullet points ngắn gọn bao gồm: trạng thái quan hệ, deal đang mở, mức độ engagement, rủi ro/cơ hội nổi bật.",
    ctx,
    { userId, module: "crm.summarize", maxTokens: 600 },
  );
}

export async function suggestNextAction(accountId: string, userId: string): Promise<string> {
  const account = await loadAccountContext(accountId);
  const ctx = formatAccountContext(account);
  return generateResponse(
    SYSTEM_BASE +
      "\n\nDựa trên context, hãy gợi ý 3 next actions cụ thể, actionable, theo thứ tự ưu tiên. Mỗi action: tiêu đề ngắn + 1 câu giải thích lý do + kênh thực hiện (email/call/meeting).",
    ctx,
    { userId, module: "crm.next_action", maxTokens: 600 },
  );
}

interface HealthResult {
  score: number;
  riskLevel: "healthy" | "watch" | "at_risk" | "critical";
  factors: {
    engagement_recency: number;
    deal_velocity: number;
    revenue_trend: number;
    response_rate: number;
    support_issues: number;
  };
  explanation: string;
}

export async function assessHealth(accountId: string, userId: string): Promise<HealthResult> {
  const account = await loadAccountContext(accountId);
  const ctx = formatAccountContext(account);

  const result = await generateStructured<HealthResult>(
    SYSTEM_BASE +
      `\n\nBạn đánh giá "sức khỏe account" (0-100). Trả về JSON đúng schema:
{
  "score": number (0-100),
  "riskLevel": "healthy" | "watch" | "at_risk" | "critical",
  "factors": {
    "engagement_recency": number (0-100),
    "deal_velocity": number (0-100),
    "revenue_trend": number (0-100),
    "response_rate": number (0-100),
    "support_issues": number (0-100)
  },
  "explanation": string (2-3 câu giải thích)
}
Weights: engagement_recency 30%, deal_velocity 25%, revenue_trend 20%, response_rate 15%, support_issues 10%.
Risk level: healthy >=75, watch 55-74, at_risk 35-54, critical <35.`,
    ctx,
    { userId, module: "crm.health", maxTokens: 800 },
  );

  // Persist current healthScore + historical snapshot
  await Promise.all([
    prisma.account.update({
      where: { id: accountId },
      data: { healthScore: result.score },
    }),
    prisma.healthSnapshot.create({
      data: {
        accountId,
        score: result.score,
        riskLevel: result.riskLevel,
        factors: result.factors as unknown as object,
        explanation: result.explanation,
      },
    }),
  ]);

  return result;
}

export async function chatWithAccount(
  accountId: string,
  message: string,
  userId: string,
): Promise<string> {
  const account = await loadAccountContext(accountId);
  const ctx = formatAccountContext(account);
  return generateResponse(
    SYSTEM_BASE +
      `\n\nBạn đang chat với sales rep về account cụ thể dưới đây. Trả lời dựa trên context được cung cấp, nếu thiếu thông tin hãy nói rõ.`,
    `${ctx}\n\n=== CÂU HỎI ===\n${message}`,
    { userId, module: "crm.chat", maxTokens: 1200 },
  );
}
