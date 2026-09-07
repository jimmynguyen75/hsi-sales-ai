/**
 * Fill in website + logoUrl for the accounts whose company we could identify.
 *
 * Logo URLs were each checked to return a real image (not a placeholder);
 * accounts without one keep the initials avatar, and the rep can paste any
 * image URL in the account form later. Existing non-empty values are never
 * overwritten — this only fills blanks.
 *
 * Names are compared NFC-normalised: rows imported earlier store Vietnamese
 * diacritics decomposed, so a raw === on the name silently misses.
 *
 * Run `npx tsx scripts/set-account-logos.ts` to preview, `--apply` to write.
 */
import { prisma } from "../src/lib/prisma.js";

const APPLY = process.argv.includes("--apply");
const nfc = (s: string) => s.normalize("NFC");

interface Rule {
  /** Exact company name, or a substring when `match: "contains"`. */
  name: string;
  match?: "exact" | "contains";
  website: string;
  logoUrl?: string;
  note: string;
}

const RULES: Rule[] = [
  {
    name: "ÁI NGHĨA",
    match: "contains",
    website: "https://ainghia.vn",
    logoUrl: "https://icons.duckduckgo.com/ip3/ainghia.vn.ico",
    note: "Hệ thống Y khoa Ái Nghĩa — dùng chung cho mọi chi nhánh",
  },
  {
    name: "CÔNG TY CỔ PHẦN BÌNH ĐIỀN - MEKONG",
    website: "https://binhdienmekong.vn",
    logoUrl: "https://binhdienmekong.vn/favicon.ico",
    note: "Phân bón Bình Điền - Mekong",
  },
  {
    name: "CÔNG TY CỔ PHẦN CHẾ BIẾN THỦY HẢI SẢN LIÊN THÀNH",
    website: "https://lienthanh1906.vn",
    logoUrl: "https://lienthanh1906.vn/favicon.ico",
    note: "Nước mắm Liên Thành (1906)",
  },
  {
    name: "TRƯỜNG CAO ĐẲNG KINH TẾ THÀNH PHỐ HỒ CHÍ MINH",
    website: "https://www.kthcm.edu.vn",
    logoUrl: "https://www.kthcm.edu.vn/favicon.ico",
    note: "CĐ Kinh tế TP.HCM",
  },
  {
    name: "CENTRAL RETAIL VIETNAM",
    website: "https://centralretail.com.vn",
    logoUrl: "https://icons.duckduckgo.com/ip3/centralretail.com.vn.ico",
    note: "Central Retail Việt Nam",
  },
  {
    // "Dịch vụ EB" is the entity operating GO!/Big C, a Central Retail member.
    name: "CÔNG TY TNHH DỊCH VỤ EB",
    website: "https://centralretail.com.vn",
    logoUrl: "https://icons.duckduckgo.com/ip3/centralretail.com.vn.ico",
    note: "Dịch vụ EB — vận hành GO!/Big C, thuộc Central Retail",
  },
  {
    // No logo source returned a real image for these two — website only.
    name: "Ngân hàng TMCP Sài Gòn Công Thương",
    website: "https://www.saigonbank.com.vn",
    note: "Saigonbank — chưa lấy được logo tự động",
  },
  {
    name: "CÔNG TY TNHH JAPFA COMFEED VIỆT NAM",
    website: "https://www.japfavietnam.com",
    note: "JAPFA Comfeed Việt Nam — chưa lấy được logo tự động",
  },
];

async function main() {
  const accounts = await prisma.account.findMany({
    select: { id: true, companyName: true, website: true, logoUrl: true },
  });

  const touched: string[] = [];
  const skipped: string[] = [];

  for (const rule of RULES) {
    const needle = nfc(rule.name).toUpperCase();
    const targets = accounts.filter((a) => {
      const n = nfc(a.companyName).toUpperCase();
      return rule.match === "contains" ? n.includes(needle) : n === needle;
    });

    if (targets.length === 0) {
      skipped.push(`KHÔNG khớp account nào: "${rule.name}"`);
      continue;
    }

    for (const a of targets) {
      const data: { website?: string; logoUrl?: string } = {};
      if (!a.website) data.website = rule.website;
      if (!a.logoUrl && rule.logoUrl) data.logoUrl = rule.logoUrl;
      if (Object.keys(data).length === 0) {
        skipped.push(`đã có sẵn, bỏ qua: ${a.companyName}`);
        continue;
      }
      touched.push(
        `${rule.logoUrl ? "🖼 " : "🔗 "}${a.companyName}\n       ${rule.note}`,
      );
      if (APPLY) await prisma.account.update({ where: { id: a.id }, data });
    }
  }

  console.log(`\n=== ${APPLY ? "ĐÃ GHI" : "XEM TRƯỚC"} ===`);
  console.log(`\nCập nhật (${touched.length}):`);
  touched.forEach((t) => console.log("  ", t));
  if (skipped.length) {
    console.log(`\nBỏ qua (${skipped.length}):`);
    skipped.forEach((s) => console.log("   ·", s));
  }

  const withLogo = await prisma.account.count({ where: { logoUrl: { not: null } } });
  const total = await prisma.account.count();
  console.log(`\nCó logo: ${withLogo}/${total} khách hàng (còn lại dùng chữ viết tắt).`);
  if (!APPLY) console.log("(Chưa ghi gì. Thêm --apply để thực hiện.)");
  await prisma.$disconnect();
}

main();
