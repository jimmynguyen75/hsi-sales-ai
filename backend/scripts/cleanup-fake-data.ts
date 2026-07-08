/**
 * One-off cleanup: remove all fake seed data owned by jimmy@hpt.vn while
 * preserving the real pipeline data owned by thunm@hpt.vn. Delete order
 * matches FK dependencies so Prisma cascades or explicit deletes don't
 * trip on constraint errors.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const jimmy = await prisma.user.findUnique({ where: { email: "jimmy@hpt.vn" } });
  if (!jimmy) {
    console.log("jimmy@hpt.vn not found — nothing to clean.");
    return;
  }
  const uid = jimmy.id;
  console.log(`Cleaning fake data owned by jimmy@hpt.vn (${uid})...`);

  // Delete everything that references the user, ordered so nothing violates
  // FKs. Activities/deals/quotations/etc. first, then accounts, then user
  // metadata (audit / briefings / etc).
  const results = await prisma.$transaction([
    // Activity is scoped by ownerId (its own owner).
    prisma.activity.deleteMany({ where: { ownerId: uid } }),

    // Quotations owned by user (contains items JSON so no cascade concerns).
    prisma.quotation.deleteMany({ where: { ownerId: uid } }),

    // Proposals + Deals + Emails owned by user.
    prisma.proposal.deleteMany({ where: { ownerId: uid } }),
    prisma.deal.deleteMany({ where: { ownerId: uid } }),
    prisma.emailDraft.deleteMany({ where: { ownerId: uid } }),
    prisma.meeting.deleteMany({ where: { ownerId: uid } }),

    // Competitor intel + market sizing + reports authored by user.
    prisma.competitorIntel.deleteMany({ where: { userId: uid } }),
    prisma.competitor.deleteMany({ where: { ownerId: uid } }),
    prisma.marketSizing.deleteMany({ where: { userId: uid } }),
    prisma.salesReport.deleteMany({ where: { userId: uid } }),
    prisma.winLossReport.deleteMany({ where: { userId: uid } }),
    prisma.rFPResponse.deleteMany({ where: { userId: uid } }),
    prisma.chatSession.deleteMany({ where: { userId: uid } }),
    prisma.dailyBriefing.deleteMany({ where: { userId: uid } }),
    prisma.auditLog.deleteMany({ where: { userId: uid } }),
    prisma.aILog.deleteMany({ where: { userId: uid } }),

    // Accounts last — cascades remove contacts, activities scoped by account,
    // insights, health snapshots.
    prisma.account.deleteMany({ where: { ownerId: uid } }),
  ]);

  const [
    activities, quotations, proposals, deals, emailDrafts, meetings,
    competitorIntels, competitors, marketSizings, salesReports,
    winLossReports, rfps, chatSessions, briefings, auditLogs, aiLogs,
    accounts,
  ] = results.map((r) => r.count);

  console.log(`  Activity:         ${activities}`);
  console.log(`  Quotation:        ${quotations}`);
  console.log(`  Proposal:         ${proposals}`);
  console.log(`  Deal:             ${deals}`);
  console.log(`  EmailDraft:       ${emailDrafts}`);
  console.log(`  Meeting:          ${meetings}`);
  console.log(`  CompetitorIntel:  ${competitorIntels}`);
  console.log(`  Competitor:       ${competitors}`);
  console.log(`  MarketSizing:     ${marketSizings}`);
  console.log(`  SalesReport:      ${salesReports}`);
  console.log(`  WinLossReport:    ${winLossReports}`);
  console.log(`  RFPResponse:      ${rfps}`);
  console.log(`  ChatSession:      ${chatSessions}`);
  console.log(`  DailyBriefing:    ${briefings}`);
  console.log(`  AuditLog:         ${auditLogs}`);
  console.log(`  AILog:            ${aiLogs}`);
  console.log(`  Account:          ${accounts}`);
  console.log(`\nDone. jimmy@hpt.vn user record kept (login still works).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
