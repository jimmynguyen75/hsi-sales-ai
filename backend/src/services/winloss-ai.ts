import { prisma } from "../lib/prisma.js";
import { generateResponse } from "../lib/ai.js";

export interface WinLossFilters {
  from?: string; // ISO date
  to?: string;
  vendor?: string;
  productLine?: string;
}

export interface WinLossMetrics {
  totalClosed: number;
  won: number;
  lost: number;
  winRate: number; // 0-1
  avgWonValue: number;
  avgLostValue: number;
  wonValue: number;
  lostValue: number;
  byVendor: Record<string, { won: number; lost: number; winRate: number; wonValue: number }>;
  byProductLine: Record<string, { won: number; lost: number; winRate: number }>;
  topWinReasons: Array<{ reason: string; count: number }>;
  topLossReasons: Array<{ reason: string; count: number }>;
  avgCycleDays: number | null; // avg createdAt -> updatedAt when closed
  sampleWon: Array<{ id: string; title: string; account: string; value: number | null; reason: string | null }>;
  sampleLost: Array<{ id: string; title: string; account: string; value: number | null; reason: string | null }>;
}

function countReasons(
  reasons: Array<string | null | undefined>,
): Array<{ reason: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of reasons) {
    if (!r || !r.trim()) continue;
    const key = r.trim();
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function computeWinLossMetrics(
  userId: string,
  filters: WinLossFilters,
): Promise<WinLossMetrics> {
  const where: import("@prisma/client").Prisma.DealWhereInput = {
    ownerId: userId,
    stage: { in: ["closed_won", "closed_lost"] },
  };
  if (filters.vendor) where.vendor = filters.vendor;
  if (filters.productLine) where.productLine = filters.productLine;
  if (filters.from || filters.to) {
    where.updatedAt = {};
    if (filters.from) (where.updatedAt as { gte?: Date }).gte = new Date(filters.from);
    if (filters.to) (where.updatedAt as { lte?: Date }).lte = new Date(filters.to);
  }

  const deals = await prisma.deal.findMany({
    where,
    include: { account: { select: { companyName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const won = deals.filter((d) => d.stage === "closed_won");
  const lost = deals.filter((d) => d.stage === "closed_lost");
  const wonValue = won.reduce((s, d) => s + (d.value ?? 0), 0);
  const lostValue = lost.reduce((s, d) => s + (d.value ?? 0), 0);

  const byVendor: WinLossMetrics["byVendor"] = {};
  const byProductLine: WinLossMetrics["byProductLine"] = {};
  for (const d of deals) {
    const v = d.vendor ?? "unknown";
    byVendor[v] ??= { won: 0, lost: 0, winRate: 0, wonValue: 0 };
    if (d.stage === "closed_won") {
      byVendor[v].won += 1;
      byVendor[v].wonValue += d.value ?? 0;
    } else {
      byVendor[v].lost += 1;
    }
    const pl = d.productLine ?? "unknown";
    byProductLine[pl] ??= { won: 0, lost: 0, winRate: 0 };
    if (d.stage === "closed_won") byProductLine[pl].won += 1;
    else byProductLine[pl].lost += 1;
  }
  for (const v of Object.values(byVendor)) {
    const tot = v.won + v.lost;
    v.winRate = tot ? v.won / tot : 0;
  }
  for (const v of Object.values(byProductLine)) {
    const tot = v.won + v.lost;
    v.winRate = tot ? v.won / tot : 0;
  }

  const cycles = deals
    .map((d) => (d.updatedAt.getTime() - d.createdAt.getTime()) / 86400000)
    .filter((n) => n > 0);
  const avgCycleDays = cycles.length ? Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length) : null;

  const sampleWon = won.slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title,
    account: d.account?.companyName ?? "?",
    value: d.value,
    reason: d.winReason,
  }));
  const sampleLost = lost.slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title,
    account: d.account?.companyName ?? "?",
    value: d.value,
    reason: d.lossReason,
  }));

  return {
    totalClosed: deals.length,
    won: won.length,
    lost: lost.length,
    winRate: deals.length ? won.length / deals.length : 0,
    avgWonValue: won.length ? Math.round(wonValue / won.length) : 0,
    avgLostValue: lost.length ? Math.round(lostValue / lost.length) : 0,
    wonValue,
    lostValue,
    byVendor,
    byProductLine,
    topWinReasons: countReasons(won.map((d) => d.winReason)),
    topLossReasons: countReasons(lost.map((d) => d.lossReason)),
    avgCycleDays,
    sampleWon,
    sampleLost,
  };
}

export async function generateWinLossInsights(
  metrics: WinLossMetrics,
  userId: string,
): Promise<string> {
  const system = `Bạn là Sales Enablement Analyst tại HPT Vietnam. Phân tích Win/Loss data và đưa ra insights + recommendations cho team sales HSI.

Format markdown tiếng Việt:

## Tóm tắt
(win rate, giá trị tổng, chu kỳ — 2-3 câu)

## Pattern WIN (vì sao thắng)
(dựa trên winReasons + deals mẫu — 3-4 bullet)

## Pattern LOSS (vì sao thua)
(dựa trên lossReasons — 3-4 bullet)

## Vendor / Product Line insights
(vendor nào win rate cao nhất/thấp nhất, product line nào cần chú ý)

## Khuyến nghị hành động
(4-5 bullet actionable, cụ thể cho team HSI — VD: "Tăng đào tạo pre-sales cho PA firewalls", "Review deal >X ngày ở stage negotiation")

Dưới 400 từ. Số tiền format "2,5 tỷ ₫".`;

  const user = `DATA:\n${JSON.stringify(metrics, null, 2)}`;

  return generateResponse(system, user, {
    userId,
    module: "winloss.insights",
    maxTokens: 1800,
    temperature: 0.4,
  });
}
