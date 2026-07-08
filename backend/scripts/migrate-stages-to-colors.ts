/**
 * One-off: map every deal's stage from the legacy B2B labels to HPT's
 * OPP-color convention (5 buckets). Idempotent — running twice on
 * already-migrated deals is a no-op.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const MAP: Record<string, string> = {
  prospecting: "red",
  qualification: "yellow",
  proposal: "green",
  negotiation: "green", // negotiation folds into green — no separate column
  closed_won: "pink",
  closed_lost: "gray",
};

async function main() {
  const deals = await prisma.deal.findMany({ select: { id: true, stage: true } });
  const toUpdate = deals.filter((d) => MAP[d.stage]);
  console.log(`Deals total: ${deals.length}, needing migration: ${toUpdate.length}`);
  const before = new Map<string, number>();
  for (const d of deals) before.set(d.stage, (before.get(d.stage) ?? 0) + 1);
  console.log("Before:", Object.fromEntries(before));

  for (const d of toUpdate) {
    await prisma.deal.update({ where: { id: d.id }, data: { stage: MAP[d.stage] } });
  }

  const after = await prisma.deal.findMany({ select: { stage: true } });
  const afterCount = new Map<string, number>();
  for (const d of after) afterCount.set(d.stage, (afterCount.get(d.stage) ?? 0) + 1);
  console.log("After: ", Object.fromEntries(afterCount));
  console.log("Done.");
}
main().catch(console.error).finally(() => prisma.$disconnect());
