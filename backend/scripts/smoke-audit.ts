/**
 * Smoke test: create an audit log entry, filter it, and exercise the stats
 * aggregation. Runs against the seeded admin user.
 */
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("no admin user — run `npx prisma db seed` first");

  // Clear out any audit rows from previous smoke runs (keep sale logs intact).
  const smokeTag = "[smoke-audit]";
  await prisma.auditLog.deleteMany({ where: { summary: { contains: smokeTag } } });

  const actions = ["create", "update", "status_change", "export", "delete"] as const;
  for (const a of actions) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        userEmail: admin.email,
        userRole: admin.role,
        action: a,
        entity: "quotation",
        entityId: "test-qt-123",
        summary: `${smokeTag} ${a} action on quotation`,
      },
    });
  }

  const all = await prisma.auditLog.findMany({
    where: { summary: { contains: smokeTag } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`✓ inserted ${all.length} audit rows`);
  for (const r of all) {
    console.log(`  ${r.action.padEnd(15)} ${r.entity.padEnd(12)} ${r.summary}`);
  }

  // Aggregate by action
  const grouped = await prisma.auditLog.groupBy({
    by: ["action"],
    where: { summary: { contains: smokeTag } },
    _count: { _all: true },
  });
  console.log("\n✓ groupBy(action):");
  for (const g of grouped) console.log(`  ${g.action}: ${g._count._all}`);

  // Cleanup
  await prisma.auditLog.deleteMany({ where: { summary: { contains: smokeTag } } });
  console.log("\n✓ cleanup OK");
  console.log("\n✓ audit smoke test passed");
}

main()
  .catch((err) => {
    console.error("✗ smoke-audit failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
