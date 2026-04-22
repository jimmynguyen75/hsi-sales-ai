import { generateStructured } from "../lib/ai.js";

export interface EmailResult {
  subject: string;
  body: string;
}

export interface ComposeInput {
  type: string;
  language: "vi" | "en";
  tone: string;
  keyPoints: string;
  context?: {
    contactName?: string;
    contactTitle?: string;
    accountName?: string;
    industry?: string;
    dealTitle?: string;
    dealStage?: string;
  };
}

const TYPE_DESCRIPTION: Record<string, string> = {
  cold_outreach: "Email tiếp cận mới (cold outreach)",
  follow_up: "Email follow-up sau buổi gặp/cuộc gọi",
  thank_you: "Email cảm ơn",
  introduction: "Email giới thiệu",
  proposal_send: "Email gửi kèm proposal",
  meeting_request: "Email đề nghị meeting",
  check_in: "Email check-in định kỳ",
};

export async function composeEmail(input: ComposeInput, userId: string): Promise<EmailResult> {
  const { type, language, tone, keyPoints, context } = input;

  const isVi = language === "vi";

  const system = `Bạn là sales email copywriter chuyên nghiệp cho công ty HPT Vietnam (IT infrastructure — HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft).

Viết email: ${TYPE_DESCRIPTION[type] ?? type}
Ngôn ngữ: ${isVi ? "tiếng Việt" : "tiếng Anh"}
Giọng: ${tone}

Yêu cầu:
- Subject line hấp dẫn, cụ thể, không click-baity
- Body NGẮN GỌN (max 150 từ), đi thẳng vào vấn đề
- Có CTA (call-to-action) rõ ràng ở cuối
- ${isVi ? "Tiếng Việt tự nhiên, không robotic. Xưng hô phù hợp business context (Anh/Chị, Quý công ty)." : "English: professional, concise, no buzzwords."}
- KHÔNG chào dài dòng, KHÔNG nói "I hope this email finds you well" kiểu rập khuôn

Output JSON: { "subject": string, "body": string }`;

  const ctxLines: string[] = [];
  if (context?.contactName) ctxLines.push(`Người nhận: ${context.contactName}${context.contactTitle ? ` (${context.contactTitle})` : ""}`);
  if (context?.accountName) ctxLines.push(`Công ty: ${context.accountName}${context.industry ? ` — ${context.industry}` : ""}`);
  if (context?.dealTitle) ctxLines.push(`Deal: ${context.dealTitle}${context.dealStage ? ` (stage: ${context.dealStage})` : ""}`);

  const user = (ctxLines.length ? ctxLines.join("\n") + "\n\n" : "") + `Nội dung chính cần truyền tải:\n${keyPoints}`;

  return generateStructured<EmailResult>(system, user, {
    userId,
    module: "email.compose",
    maxTokens: 1200,
  });
}
