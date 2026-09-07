/**
 * Set grossProfit to a percentage of a deal's value, for every deal whose
 * account name matches a keyword.
 *
 *   npx tsx scripts/set-gross-profit-rate.ts "ÁI NGHĨA" 5          # preview
 *   npx tsx scripts/set-gross-profit-rate.ts "ÁI NGHĨA" 5 --apply  # write
 *
 * Account names are compared NFC-normalised: the Excel import stored
 * Vietnamese diacritics decomposed, so a raw match silently finds nothing.
 */
import { prisma } from "../src/lib/prisma.js";

const APPLY = process.argv.includes("--apply");
const args = process.argv.slice(2).filter((a) => a !== "--apply");
const KEYWORD = args[0];
const PERCENT = Number(args[1]);

const nfc = (s: string) => s.normalize("NFC").toUpperCase();
const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  if (!KEYWORD || !Number.isFinite(PERCENT) || PERCENT <= 0 || PERCENT > 100) {
    console.error('Cách dùng: npx tsx scripts/set-gross-profit-rate.ts "<từ khoá>" <phần trăm> [--apply]');
    process.exit(1);
  }

  const needle = nfc(KEYWORD);
  const deals = await prisma.deal.findMany({
    include: { account: { select: { companyName: true } } },
    orderBy: { value: "desc" },
  });
  const matched = deals.filter((d) => nfc(d.account?.companyName ?? "").includes(needle));

  console.log(`\n=== ${APPLY ? "ĐÃ GHI" : "XEM TRƯỚC"} — lãi gộp = ${PERCENT}% giá trị ===`);
  console.log(`Từ khoá khách hàng: "${KEYWORD}" → khớp ${matched.length} deal\n`);

  let sumOld = 0;
  let sumNew = 0;
  for (const d of matched) {
    const value = d.value ?? 0;
    const next = Math.round((value * PERCENT) / 100);
    sumOld += d.grossProfit ?? 0;
    sumNew += next;
    const before = d.grossProfit == null ? "chưa có" : vnd(d.grossProfit);
    console.log(
      `  ${(d.caseCode ?? "—").padEnd(10)} ${vnd(value).padStart(15)} ₫  LG: ${before.padStart(12)} → ${vnd(next).padStart(12)} ₫  | ${d.account?.companyName.slice(0, 46)}`,
    );
    if (APPLY) await prisma.deal.update({ where: { id: d.id }, data: { grossProfit: next } });
  }

  console.log(`\n  Tổng lãi gộp: ${vnd(sumOld)} ₫ → ${vnd(sumNew)} ₫`);
  if (!APPLY) console.log("\n(Chưa ghi gì. Thêm --apply để thực hiện.)");
  await prisma.$disconnect();
}

main();
