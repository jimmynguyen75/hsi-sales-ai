/**
 * Delete thunm@hpt.vn's deals that are NOT part of the OPP snapshot — i.e.
 * the leftovers from the old Pipeline FY2026.xlsx import, identified by a
 * null caseCode.
 *
 * Every deal is written to a JSON backup first (restorable by re-creating
 * the rows), and accounts are left alone: some will simply have no deals
 * afterwards, which is a decision for the rep, not this script.
 *
 * Linked activities survive — Activity.dealId is onDelete: SetNull.
 *
 * Run `npx tsx scripts/delete-deals-not-in-opp.ts` to preview,
 * add `--apply` to actually delete.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma.js";

const OWNER_EMAIL = "thunm@hpt.vn";
const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = process.env.BACKUP_DIR ?? ".";

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) throw new Error(`No user ${OWNER_EMAIL}`);

  const doomed = await prisma.deal.findMany({
    where: { ownerId: owner.id, caseCode: null },
    include: { account: { select: { id: true, companyName: true } } },
    orderBy: { value: "desc" },
  });

  const activityCount = await prisma.activity.count({
    where: { dealId: { in: doomed.map((d) => d.id) } },
  });

  console.log(`\n=== ${APPLY ? "XOÁ THẬT" : "XEM TRƯỚC"} ===`);
  console.log(`\nDeal sẽ xoá (${doomed.length}) — deal không có Mã vụ việc:`);
  let sum = 0;
  for (const d of doomed) {
    sum += d.value ?? 0;
    console.log(
      `  - ${d.stage.padEnd(6)} ${(d.value ?? 0).toLocaleString("vi-VN").padStart(15)} ₫  ${d.title.slice(0, 40).padEnd(40)} @ ${d.account?.companyName}`,
    );
  }
  console.log(`  Tổng giá trị xoá: ${sum.toLocaleString("vi-VN")} ₫`);
  console.log(`  Hoạt động (activity) liên quan: ${activityCount} — giữ lại, chỉ bỏ liên kết deal.`);

  // Accounts that end up with no deals at all. Reported, never deleted.
  const affected = [...new Map(doomed.map((d) => [d.account!.id, d.account!])).values()];
  const orphans: string[] = [];
  for (const a of affected) {
    const remaining = await prisma.deal.count({
      where: { accountId: a.id, id: { notIn: doomed.map((d) => d.id) } },
    });
    if (remaining === 0) orphans.push(a.companyName);
  }
  console.log(`\nKhách hàng sẽ không còn deal nào (${orphans.length}) — KHÔNG xoá:`);
  orphans.forEach((n) => console.log("  ·", n));

  if (!APPLY) {
    console.log("\n(Chưa xoá gì. Thêm --apply để thực hiện.)");
    await prisma.$disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/deleted-deals-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(doomed, null, 2), "utf8");
  console.log(`\nĐã sao lưu ${doomed.length} deal → ${backupPath}`);

  const result = await prisma.deal.deleteMany({
    where: { id: { in: doomed.map((d) => d.id) } },
  });
  console.log(`Đã xoá ${result.count} deal.`);

  const left = await prisma.deal.findMany({ where: { ownerId: owner.id } });
  const agg: Record<string, { n: number; v: number }> = {};
  for (const d of left) {
    agg[d.stage] ??= { n: 0, v: 0 };
    agg[d.stage].n++;
    agg[d.stage].v += d.value ?? 0;
  }
  const label: Record<string, string> = {
    red: "Đỏ", yellow: "Vàng", green: "Xanh", pink: "Hồng", gray: "Xám",
  };
  console.log(`\n=== CÒN LẠI: ${left.length} deal ===`);
  let total = 0;
  for (const s of ["red", "yellow", "green", "pink", "gray"]) {
    const a = agg[s] ?? { n: 0, v: 0 };
    total += a.v;
    console.log(`  ${label[s].padEnd(5)} ${String(a.n).padStart(3)} deal  ${a.v.toLocaleString("vi-VN").padStart(17)} ₫`);
  }
  console.log(`  TỔNG            ${total.toLocaleString("vi-VN")} ₫`);
  console.log(`  Forecast (Vàng+Xanh): ${((agg.yellow?.v ?? 0) + (agg.green?.v ?? 0)).toLocaleString("vi-VN")} ₫`);

  await prisma.$disconnect();
}

main();
