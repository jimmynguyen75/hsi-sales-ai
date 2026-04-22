import { generateStructured } from "../lib/ai.js";

export interface ProposalInputs {
  clientName: string;
  industry?: string;
  requirements: string;
  valueProps?: string;
  timeline?: string;
  budget?: string;
  vendors?: string[]; // HPE | Dell | IBM | Palo Alto | CrowdStrike | Microsoft
  language?: "vi" | "en";
}

export interface ProposalSection {
  id: string;
  heading: string;
  body: string; // markdown
  order: number;
}

function sid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function generateProposalSections(
  inputs: ProposalInputs,
  userId: string,
): Promise<ProposalSection[]> {
  const lang = inputs.language ?? "vi";

  const system = `Bạn là Senior Pre-sales Consultant tại HPT Vietnam (HSI division), phân phối HPE/Dell/IBM/Palo Alto/CrowdStrike/Microsoft tại thị trường Việt Nam. Bạn viết proposal/đề xuất dự án IT infrastructure cho khách hàng doanh nghiệp.

Trả về JSON array các section — MỖI section là object:
{ "heading": "string", "body": "markdown string", "order": number }

Các section BẮT BUỘC có (theo thứ tự):
1. "Executive Summary" — 1 đoạn ngắn gọn, nêu rõ giá trị cốt lõi cho khách hàng
2. "Understanding of Requirements" — liệt kê hiểu biết về yêu cầu/pain points của khách
3. "Proposed Solution" — mô tả giải pháp (vendors, kiến trúc cao cấp, key components)
4. "Why HPT" — tại sao chọn HPT (partnership levels, certified engineers, delivery track record)
5. "Implementation Approach" — phases, timeline tóm tắt, deliverables
6. "Investment & Commercial" — ước lượng chi phí (dùng giá thị trường VN, VND), commercial terms
7. "Next Steps" — 3-4 bullet actions

Ngôn ngữ: ${lang === "vi" ? "tiếng Việt, giọng sales-professional" : "English, sales-professional tone"}.
Body viết markdown giàu thông tin (bullet, bold, inline code cho tên sản phẩm). Đừng chung chung — hãy refer tới cụ thể vendor products nếu liệt kê (VD: HPE ProLiant DL380, Palo Alto PA-5220, Microsoft M365 E5).
Giá tiền format kiểu "2,5 tỷ ₫" hoặc "500 triệu ₫".
Chỉ trả JSON array, KHÔNG wrap trong object, KHÔNG markdown fence.`;

  const user = `KHÁCH HÀNG: ${inputs.clientName}
${inputs.industry ? `Ngành: ${inputs.industry}\n` : ""}YÊU CẦU / PAIN POINTS:
${inputs.requirements}

${inputs.valueProps ? `VALUE PROPS GỢI Ý:\n${inputs.valueProps}\n\n` : ""}${inputs.timeline ? `TIMELINE MONG MUỐN: ${inputs.timeline}\n` : ""}${inputs.budget ? `NGÂN SÁCH THAM KHẢO: ${inputs.budget}\n` : ""}${inputs.vendors?.length ? `VENDORS ƯU TIÊN: ${inputs.vendors.join(", ")}\n` : ""}
Hãy tạo proposal đầy đủ 7 section như hướng dẫn.`;

  const raw = await generateStructured<Array<{ heading: string; body: string; order?: number }>>(
    system,
    user,
    {
      userId,
      module: "proposal.generate",
      maxTokens: 4000,
      temperature: 0.5,
    },
  );

  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((s, i) => ({
    id: sid(),
    heading: s.heading ?? `Section ${i + 1}`,
    body: s.body ?? "",
    order: typeof s.order === "number" ? s.order : i + 1,
  }));
}

export async function refineSection(
  heading: string,
  currentBody: string,
  instruction: string,
  userId: string,
): Promise<string> {
  const system = `Bạn là chuyên gia biên tập proposal IT infrastructure tiếng Việt. Đọc section hiện tại + yêu cầu chỉnh sửa, trả về markdown body mới (KHÔNG bao gồm heading). Giữ giọng sales-professional.`;

  const user = `SECTION: ${heading}

HIỆN TẠI:
${currentBody}

YÊU CẦU CHỈNH:
${instruction}

Trả về body đã chỉnh (markdown thuần, không fence).`;

  const { generateResponse } = await import("../lib/ai.js");
  const result = await generateResponse(system, user, {
    userId,
    module: "proposal.refine",
    maxTokens: 2000,
    temperature: 0.5,
  });
  return result.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
