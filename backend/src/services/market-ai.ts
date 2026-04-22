import { generateStructured, generateResponse } from "../lib/ai.js";

export interface MarketSizingInputs {
  segment: string;
  region: string;
  vertical?: string;
  productCategory?: string; // server | storage | networking | security | cloud | software
  timeframe?: string; // e.g., "2025-2026"
  notes?: string;
}

export interface MarketSizingEstimate {
  tam: number; // VND
  sam: number;
  som: number;
  assumptions: string[];
  drivers: string[];
  competitorLandscape: string;
  reasoning: string; // short
}

/**
 * Ask AI to produce structured TAM/SAM/SOM estimates for the Vietnam market.
 * The AI uses its pretraining for rough figures; user refines.
 */
export async function estimateMarket(
  inputs: MarketSizingInputs,
  userId: string,
): Promise<MarketSizingEstimate> {
  const system = `Bạn là Market Research Analyst tại HPT Vietnam (HSI division), chuyên thị trường IT infrastructure & security cho Việt Nam. Ước lượng TAM/SAM/SOM dựa trên kiến thức thị trường VN.

Trả về JSON với keys:
{
  "tam": <number, VND>,      // Total Addressable Market — toàn thị trường segment này tại region/vertical
  "sam": <number, VND>,      // Serviceable Addressable — phần HSI có thể phục vụ (phù hợp vendor portfolio HSI: HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft)
  "som": <number, VND>,      // Serviceable Obtainable — realistic HSI có thể chiếm 1-3 năm tới
  "assumptions": [string],   // 3-5 giả định chính dùng để tính
  "drivers": [string],       // 3-5 yếu tố thúc đẩy/kìm hãm thị trường
  "competitorLandscape": string,  // 2-3 câu về đối thủ chính ở segment/region này
  "reasoning": string        // 2-3 câu giải thích cách tính
}

LƯU Ý:
- Dùng VND, không USD. 1 USD ≈ 25,000 VND.
- Số realistic cho VN (TAM thường 500 tỷ - 50 nghìn tỷ tuỳ segment).
- SAM thường 20-60% của TAM. SOM thường 3-10% của SAM.
- Không bịa — nếu không chắc, chọn conservative và ghi rõ assumption.`;

  const user = `INPUTS:
Segment: ${inputs.segment}
Region: ${inputs.region}
Vertical: ${inputs.vertical ?? "(tất cả)"}
Product category: ${inputs.productCategory ?? "(tất cả)"}
Timeframe: ${inputs.timeframe ?? "2025-2026"}
Notes: ${inputs.notes ?? "—"}`;

  return generateStructured<MarketSizingEstimate>(system, user, {
    userId,
    module: "market.estimate",
    maxTokens: 1500,
    temperature: 0.3,
  });
}

export async function generateMarketNarrative(
  inputs: MarketSizingInputs,
  estimate: MarketSizingEstimate,
  userId: string,
): Promise<string> {
  const system = `Bạn là Market Research Analyst tại HPT Vietnam. Viết analysis markdown tiếng Việt dựa trên estimate để sales HSI hiểu market & action plan.

Output markdown:

## Tóm tắt thị trường
(2-3 câu: quy mô, tốc độ, positioning của HSI)

## TAM / SAM / SOM
(bullet giải thích con số, tại sao)

## Drivers & Constraints
(thị trường đang tăng hay giảm, vì sao)

## Cạnh tranh
(landscape ngắn gọn)

## Khuyến nghị cho HSI
- 4-5 bullet cụ thể: vertical/customer segments nào ưu tiên, vendor HSI nào phù hợp, chiến thuật GTM

Dưới 400 từ. Số tiền format "2,5 tỷ ₫" hoặc "25 nghìn tỷ ₫" tuỳ mức.`;

  const user = `INPUTS: ${JSON.stringify(inputs, null, 2)}

ESTIMATE: ${JSON.stringify(estimate, null, 2)}`;

  return generateResponse(system, user, {
    userId,
    module: "market.narrative",
    maxTokens: 1500,
    temperature: 0.4,
  });
}
