import { generateStructured } from "../lib/ai.js";

export interface MeetingProcessResult {
  summary: string;
  actionItems: { content: string; assignee?: string | null; dueDate?: string | null }[];
  decisions: string[];
}

const SYSTEM = `Bạn là assistant chuyên xử lý meeting notes cho team kinh doanh HPT Vietnam (IT infrastructure).
Từ nội dung cuộc họp, hãy:
1. Viết tóm tắt cuộc họp (3-5 câu, tiếng Việt)
2. Trích xuất TẤT CẢ action items, mỗi item gồm: nội dung, người phụ trách (nếu nhắc), deadline (nếu nhắc, format ISO yyyy-mm-dd)
3. Ghi nhận key decisions

Output JSON schema:
{
  "summary": string,
  "actionItems": [{ "content": string, "assignee": string|null, "dueDate": string|null }],
  "decisions": string[]
}`;

export async function processMeetingNotes(
  rawNotes: string,
  context: { title?: string; attendees?: string; accountName?: string } | undefined,
  userId: string,
): Promise<MeetingProcessResult> {
  const ctxBlock = context
    ? `Meeting: ${context.title ?? "—"}\nAttendees: ${context.attendees ?? "—"}\nAccount: ${context.accountName ?? "—"}\n\n`
    : "";
  return generateStructured<MeetingProcessResult>(
    SYSTEM,
    ctxBlock + "=== RAW NOTES ===\n" + rawNotes,
    { userId, module: "meeting.process", maxTokens: 2000 },
  );
}
