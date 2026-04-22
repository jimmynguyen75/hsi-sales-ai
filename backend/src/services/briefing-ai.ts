import { prisma } from "../lib/prisma.js";
import { generateResponse } from "../lib/ai.js";

export interface BriefingSections {
  followUps: Array<{ id: string; subject: string; dueDate: string | null; accountName?: string }>;
  meetings: Array<{ id: string; title: string; date: string; accountName?: string }>;
  expiringDeals: Array<{ id: string; title: string; expectedClose: string | null; accountName?: string; value: number | null }>;
  pipelineSnapshot: {
    totalValue: number;
    byStage: Record<string, { count: number; value: number }>;
  };
  recentActivity: Array<{ id: string; subject: string; type: string; createdAt: string }>;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function buildBriefingData(userId: string, date: Date): Promise<BriefingSections> {
  const todayStart = startOfDay(date);
  const todayEnd = endOfDay(date);
  const in30Days = new Date(todayStart.getTime() + 30 * 86400000);

  // Follow-ups: activities of type follow_up, not completed, due today or overdue
  const followUpActivities = await prisma.activity.findMany({
    where: {
      ownerId: userId,
      type: "follow_up",
      completed: false,
      OR: [{ dueDate: { lte: todayEnd } }, { dueDate: null }],
    },
    orderBy: { dueDate: "asc" },
    include: { account: { select: { companyName: true } } },
    take: 20,
  });

  // Meetings today
  const meetingsToday = await prisma.meeting.findMany({
    where: { ownerId: userId, date: { gte: todayStart, lte: todayEnd } },
    orderBy: { date: "asc" },
  });
  const meetingAccountIds = meetingsToday
    .map((m) => m.accountId)
    .filter((x): x is string => !!x);
  const meetingAccounts = meetingAccountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: meetingAccountIds } },
        select: { id: true, companyName: true },
      })
    : [];
  const accountById = new Map(meetingAccounts.map((a) => [a.id, a.companyName]));

  // Deals expiring in 30 days (not yet closed)
  const expiringDeals = await prisma.deal.findMany({
    where: {
      ownerId: userId,
      expectedClose: { gte: todayStart, lte: in30Days },
      stage: { notIn: ["closed_won", "closed_lost"] },
    },
    orderBy: { expectedClose: "asc" },
    include: { account: { select: { companyName: true } } },
    take: 20,
  });

  // Pipeline snapshot
  const allOpenDeals = await prisma.deal.findMany({
    where: { ownerId: userId, stage: { notIn: ["closed_won", "closed_lost"] } },
    select: { stage: true, value: true },
  });
  const byStage: Record<string, { count: number; value: number }> = {};
  let totalValue = 0;
  for (const d of allOpenDeals) {
    byStage[d.stage] ??= { count: 0, value: 0 };
    byStage[d.stage].count += 1;
    byStage[d.stage].value += d.value ?? 0;
    totalValue += d.value ?? 0;
  }

  // Recent activity (last 24h)
  const yesterday = new Date(todayStart.getTime() - 86400000);
  const recentActivity = await prisma.activity.findMany({
    where: { ownerId: userId, createdAt: { gte: yesterday } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    followUps: followUpActivities.map((a) => ({
      id: a.id,
      subject: a.subject,
      dueDate: a.dueDate?.toISOString() ?? null,
      accountName: a.account?.companyName,
    })),
    meetings: meetingsToday.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date.toISOString(),
      accountName: m.accountId ? accountById.get(m.accountId) : undefined,
    })),
    expiringDeals: expiringDeals.map((d) => ({
      id: d.id,
      title: d.title,
      expectedClose: d.expectedClose?.toISOString() ?? null,
      accountName: d.account?.companyName,
      value: d.value,
    })),
    pipelineSnapshot: { totalValue, byStage },
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      subject: a.subject,
      type: a.type,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export async function generateBriefingNarrative(
  userName: string,
  date: Date,
  sections: BriefingSections,
  userId: string,
): Promise<string> {
  const dateStr = date.toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const system = `Bạn là AI sales assistant tại HPT Vietnam (HSI). Viết Daily Briefing cho sales rep vào buổi sáng.

Format markdown, giọng thân thiện-professional, tiếng Việt. Mở đầu bằng lời chào cá nhân + tóm tắt 1-2 câu về ngày hôm nay (dựa trên data). Sau đó là các sections:

## ⚡ Cần action hôm nay
## 📅 Meetings hôm nay
## ⏰ Deals sắp đến hạn
## 📈 Pipeline snapshot
## 💡 Priority của ngày (AI recommendation — 2-3 bullet ngắn, dựa trên data)

Nếu section không có data, ghi "Không có" thay vì bỏ qua. Số tiền format kiểu "2,5 tỷ ₫" hoặc "500 triệu ₫".
Giữ toàn bộ briefing DƯỚI 400 từ.`;

  const user = `Tên: ${userName}
Ngày: ${dateStr}

DATA:
${JSON.stringify(sections, null, 2)}`;

  return generateResponse(system, user, {
    userId,
    module: "briefing.generate",
    maxTokens: 1800,
    temperature: 0.5,
  });
}
