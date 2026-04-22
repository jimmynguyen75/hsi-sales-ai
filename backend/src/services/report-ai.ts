import { prisma } from "../lib/prisma.js";
import { generateResponse } from "../lib/ai.js";

export interface ReportSections {
  period: { start: string; end: string; label: string };
  pipeline: {
    openCount: number;
    openValue: number;
    byStage: Record<string, { count: number; value: number }>;
    byVendor: Record<string, { count: number; value: number }>;
  };
  closed: {
    won: { count: number; value: number };
    lost: { count: number; value: number };
    winRate: number; // 0-1
  };
  topDeals: Array<{
    id: string;
    title: string;
    account: string;
    stage: string;
    value: number | null;
  }>;
  topAccounts: Array<{ id: string; name: string; dealCount: number; totalValue: number }>;
  activity: {
    total: number;
    byType: Record<string, number>;
  };
  newAccounts: Array<{ id: string; name: string; industry: string | null }>;
  meetings: number;
}

export function periodRange(period: "week" | "month" | "quarter"): {
  start: Date;
  end: Date;
  label: string;
} {
  const end = new Date();
  const start = new Date(end);
  if (period === "week") start.setDate(start.getDate() - 7);
  else if (period === "month") start.setMonth(start.getMonth() - 1);
  else start.setMonth(start.getMonth() - 3);
  const label =
    period === "week" ? "7 ngày qua" : period === "month" ? "30 ngày qua" : "3 tháng qua";
  return { start, end, label };
}

export async function buildReportData(
  userId: string,
  start: Date,
  end: Date,
  label: string,
): Promise<ReportSections> {
  const [openDeals, closedDeals, recentActivities, newAccounts, meetingsCount] = await Promise.all([
    prisma.deal.findMany({
      where: { ownerId: userId, stage: { notIn: ["closed_won", "closed_lost"] } },
      include: { account: { select: { companyName: true } } },
    }),
    prisma.deal.findMany({
      where: {
        ownerId: userId,
        stage: { in: ["closed_won", "closed_lost"] },
        updatedAt: { gte: start, lte: end },
      },
      include: { account: { select: { companyName: true } } },
    }),
    prisma.activity.findMany({
      where: { ownerId: userId, createdAt: { gte: start, lte: end } },
      select: { id: true, type: true, accountId: true },
    }),
    prisma.account.findMany({
      where: { ownerId: userId, createdAt: { gte: start, lte: end } },
      select: { id: true, companyName: true, industry: true },
      take: 20,
    }),
    prisma.meeting.count({
      where: { ownerId: userId, date: { gte: start, lte: end } },
    }),
  ]);

  const byStage: Record<string, { count: number; value: number }> = {};
  const byVendor: Record<string, { count: number; value: number }> = {};
  let openValue = 0;
  for (const d of openDeals) {
    byStage[d.stage] ??= { count: 0, value: 0 };
    byStage[d.stage].count += 1;
    byStage[d.stage].value += d.value ?? 0;
    const v = d.vendor ?? "unknown";
    byVendor[v] ??= { count: 0, value: 0 };
    byVendor[v].count += 1;
    byVendor[v].value += d.value ?? 0;
    openValue += d.value ?? 0;
  }

  const won = closedDeals.filter((d) => d.stage === "closed_won");
  const lost = closedDeals.filter((d) => d.stage === "closed_lost");
  const winSum = won.reduce((s, d) => s + (d.value ?? 0), 0);
  const lossSum = lost.reduce((s, d) => s + (d.value ?? 0), 0);
  const winRate = closedDeals.length ? won.length / closedDeals.length : 0;

  const topDeals = [...openDeals]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      title: d.title,
      account: d.account?.companyName ?? "?",
      stage: d.stage,
      value: d.value,
    }));

  // Top accounts by activity count + deal value
  const acctAgg = new Map<string, { name: string; dealCount: number; totalValue: number }>();
  for (const d of openDeals) {
    const key = d.accountId;
    const cur = acctAgg.get(key) ?? { name: d.account?.companyName ?? "?", dealCount: 0, totalValue: 0 };
    cur.dealCount += 1;
    cur.totalValue += d.value ?? 0;
    acctAgg.set(key, cur);
  }
  const topAccounts = Array.from(acctAgg.entries())
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .slice(0, 5)
    .map(([id, v]) => ({ id, ...v }));

  const byType: Record<string, number> = {};
  for (const a of recentActivities) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }

  return {
    period: { start: start.toISOString(), end: end.toISOString(), label },
    pipeline: { openCount: openDeals.length, openValue, byStage, byVendor },
    closed: {
      won: { count: won.length, value: winSum },
      lost: { count: lost.length, value: lossSum },
      winRate,
    },
    topDeals,
    topAccounts,
    activity: { total: recentActivities.length, byType },
    newAccounts: newAccounts.map((a) => ({ id: a.id, name: a.companyName, industry: a.industry })),
    meetings: meetingsCount,
  };
}

export async function generateReportNarrative(
  userName: string,
  sections: ReportSections,
  userId: string,
): Promise<string> {
  const system = `Bạn là Sales Manager viết báo cáo sales định kỳ cho rep HPT Vietnam (HSI). Viết bằng tiếng Việt, markdown, giọng analytical-professional.

Format:
## Tóm tắt điều hành
(2-3 câu tổng quan về kỳ, điểm nổi bật — dựa trên data, KHÔNG bịa)

## Pipeline hiện tại
(tổng giá trị, phân bổ theo stage + vendor, nhận xét)

## Kết quả kỳ (${sections.period.label})
(deal won/lost, win rate, giá trị, vs kỳ trước nếu đoán được)

## Top deals & accounts
(nêu 3-5 deal/account đáng chú ý)

## Hoạt động
(meetings, activities theo loại)

## Đề xuất hành động (3-4 bullet)
(cụ thể, actionable, dựa trên data — VD: "X deal ở stage negotiation >60 ngày — cần follow-up")

Số tiền format "2,5 tỷ ₫" / "500 triệu ₫". Giữ dưới 500 từ.`;

  const user = `Sales rep: ${userName}
Kỳ: ${sections.period.label} (${sections.period.start.slice(0, 10)} → ${sections.period.end.slice(0, 10)})

DATA:
${JSON.stringify(sections, null, 2)}`;

  return generateResponse(system, user, {
    userId,
    module: "report.generate",
    maxTokens: 2200,
    temperature: 0.4,
  });
}
