import { generateStructured } from "../lib/ai.js";

export interface SuggestedLineItem {
  name: string;
  description?: string;
  vendor?: string;
  qty: number;
  unitPrice: number;
  unit: string;
  category?: string;
}

export async function suggestBOM(
  requirement: string,
  catalogHint: Array<{ name: string; vendor: string; listPrice: number; unit: string }>,
  userId: string,
): Promise<SuggestedLineItem[]> {
  const system = `Bạn là Pre-sales engineer tại HPT Vietnam. Từ yêu cầu của khách, đề xuất BOM (Bill of Materials) — danh sách line items cho quotation.

Quy tắc:
- Dùng giá tham khảo thị trường VN (VND). Format số không có dấu — VD 50000000 cho 50 triệu.
- Ưu tiên vendors HPT phân phối: HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft.
- Mỗi line có: name, description (ngắn 1 dòng), vendor, qty, unitPrice (VND), unit ("unit"/"license"/"month"/"year"), category ("server"/"storage"/"networking"/"security"/"cloud"/"software"/"service").
- Luôn kèm 1 line "Professional Services - Deployment & Config" với giá ~15-20% tổng hardware.
- Tối đa 12 items.

Trả JSON array các object như trên. KHÔNG markdown, KHÔNG wrap.`;

  const catalogBlock = catalogHint.length
    ? `\n\nSẢN PHẨM CÓ SẴN TRONG CATALOG (ưu tiên dùng):\n${catalogHint
        .map((p) => `- ${p.name} (${p.vendor}) — ${p.listPrice.toLocaleString("vi-VN")} ₫/${p.unit}`)
        .join("\n")}`
    : "";

  const user = `YÊU CẦU CỦA KHÁCH:
${requirement}${catalogBlock}

Hãy đề xuất BOM phù hợp.`;

  const raw = await generateStructured<SuggestedLineItem[]>(system, user, {
    userId,
    module: "quotation.suggest_bom",
    maxTokens: 2500,
    temperature: 0.3,
  });

  return (Array.isArray(raw) ? raw : []).map((r) => ({
    name: r.name ?? "Line item",
    description: r.description,
    vendor: r.vendor,
    qty: typeof r.qty === "number" && r.qty > 0 ? r.qty : 1,
    unitPrice: typeof r.unitPrice === "number" ? r.unitPrice : 0,
    unit: r.unit ?? "unit",
    category: r.category,
  }));
}
