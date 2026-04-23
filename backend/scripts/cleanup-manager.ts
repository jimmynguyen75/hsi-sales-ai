/**
 * One-off: remove the legacy manager@hpt.vn seed user after collapsing the
 * role system down to sales + admin. Clears every row that references the
 * user (FKs block a plain User.delete) then drops the user row.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const u = await prisma.user.findUnique({ where: { email: "manager@hpt.vn" } });
  if (!u) {
    console.log("No manager user found — nothing to do.");
    return;
  }
  const userId = u.id;
  console.log("Found manager user:", userId);

  // Delete everything that FKs onto this user.
  // Order doesn't matter since none of these depend on each other.
  const results = await prisma.$transaction([
    prisma.aILog.deleteMany({ where: { userId } }),
    prisma.dailyBriefing.deleteMany({ where: { userId } }),
    prisma.salesReport.deleteMany({ where: { userId } }),
    prisma.winLossReport.deleteMany({ where: { userId } }),
    prisma.rFPResponse.deleteMany({ where: { userId } }),
    prisma.chatSession.deleteMany({ where: { userId } }),
    prisma.competitorIntel.deleteMany({ where: { userId } }),
    prisma.marketSizing.deleteMany({ where: { userId } }),
    prisma.auditLog.deleteMany({ where: { userId } }),
    // ownerId relations — sales data
    prisma.account.deleteMany({ where: { ownerId: userId } }),
    prisma.deal.deleteMany({ where: { ownerId: userId } }),
    prisma.activity.deleteMany({ where: { ownerId: userId } }),
    prisma.meeting.deleteMany({ where: { ownerId: userId } }),
    prisma.emailDraft.deleteMany({ where: { ownerId: userId } }),
    prisma.proposal.deleteMany({ where: { ownerId: userId } }),
    prisma.competitor.deleteMany({ where: { ownerId: userId } }),
    prisma.quotation.deleteMany({ where: { ownerId: userId } }),
  ]);
  console.log("Rows deleted per table:", results.map((r) => r.count));

  await prisma.user.delete({ where: { id: userId } });
  console.log("Deleted user manager@hpt.vn");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
