/**
 * Sync thunm@hpt.vn's pipeline from the OPP system snapshot (29 rows).
 *
 * Each row is keyed by "Mã vụ việc" (Deal.caseCode). Rows that already exist
 * in our DB — carried over from the earlier Pipeline FY2026.xlsx import — are
 * matched by account + a title prefix and UPDATED in place (so we don't end
 * up with two copies of the same opportunity); everything else is created.
 * Existing deals not present in the snapshot are left untouched.
 *
 * Run `npx tsx scripts/sync-opp-deals.ts` for a dry run, add `--apply` to write.
 */
import { prisma } from "../src/lib/prisma.js";

const OWNER_EMAIL = "thunm@hpt.vn";
const APPLY = process.argv.includes("--apply");

type Color = "Xanh" | "Vàng" | "Đỏ" | "Hồng" | "Xám";

const STAGE_OF: Record<Color, string> = {
  Xanh: "green",
  Vàng: "yellow",
  Đỏ: "red",
  Hồng: "pink",
  Xám: "gray",
};
// Same color -> probability convention the existing rows already use.
const PROBABILITY_OF: Record<string, number> = {
  green: 60,
  yellow: 35,
  red: 15,
  pink: 100,
  gray: 0,
};

interface Row {
  caseCode: string;
  title: string;
  customer: string;
  value: number;
  close: string; // DD/MM/YYYY
  color: Color;
  vendor?: string;
  /** Title prefix of the existing deal this row replaces (within `customer`). */
  matchPrefix?: string;
}

// Account names as they appear in OPP -> the account already in our CRM.
const ACCOUNT_ALIAS: Record<string, string> = {
  "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN SÀI GÒN CÔNG THƯƠNG":
    "Ngân hàng TMCP Sài Gòn Công Thương",
  "CÔNG TY TRÁCH NHIỆM HỮU HẠN JAPFA COMFEED VIỆT NAM":
    "CÔNG TY TNHH JAPFA COMFEED VIỆT NAM",
  "BỆNH VIỆN II LÂM ĐỒNG": "Bệnh Viện II Lâm Đồng",
};

const ROWS: Row[] = [
  // ---- screenshot 1 ----
  {
    caseCode: "HPT_14876",
    title: "HPE Warranty Renewal Service - 3 Year (29 units)",
    customer: "CÔNG TY TNHH DỊCH VỤ EB",
    value: 5_500_000_000,
    close: "15/10/2026",
    color: "Xanh",
    vendor: "HPE",
  },
  {
    caseCode: "HPT_14765",
    title: "Bản quyền phần mềm Microsoft - Triển khai",
    customer: "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN SÀI GÒN CÔNG THƯƠNG",
    value: 5_353_035_640,
    close: "30/07/2026",
    color: "Hồng",
    matchPrefix: "Bản quyền phần mềm Microsoft",
  },
  {
    caseCode: "HPT_14734",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN HỆ THỐNG Y KHOA ÁI NGHĨA",
    value: 223_999_000,
    close: "30/07/2026",
    color: "Hồng",
    matchPrefix: "Bản quyền phần mềm Microsoft (lic",
  },
  {
    caseCode: "HPT_14568",
    title: "Bản quyền phần mềm Microsoft - Adobe",
    customer: "CÔNG TY CỔ PHẦN CHẾ BIẾN THỦY HẢI SẢN LIÊN THÀNH",
    value: 543_569_000,
    close: "15/10/2026",
    color: "Vàng",
    matchPrefix: "Bản quyền phần mềm Microsoft - Adobe",
  },
  // ---- screenshot 2 ----
  {
    caseCode: "HPT_14914",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "CHI NHÁNH CÔNG TY TNHH ĐẦU TƯ VÀ PHÁT TRIỂN THIÊN PHÚC",
    value: 220_500_000,
    close: "16/10/2026",
    color: "Vàng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_14911",
    title: "Cung cấp bản quyền phần mềm Adobe",
    customer: "CÔNG TY TRÁCH NHIỆM HỮU HẠN BUILD-UP VIỆT NAM - CHI NHÁNH 2",
    value: 95_883_000,
    close: "30/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Adobe",
  },
  {
    caseCode: "HPT_14912",
    title: "Cung cấp bản quyền phần mềm Adobe",
    customer: "CÔNG TY TRÁCH NHIỆM HỮU HẠN JAPFA COMFEED VIỆT NAM",
    value: 45_600_000,
    close: "17/08/2026",
    color: "Hồng",
  },
  {
    caseCode: "HPT_14910",
    title: "Cung cấp phần mềm MS Exchange Online",
    customer: "CÔNG TY TRÁCH NHIỆM HỮU HẠN JAPFA COMFEED VIỆT NAM",
    value: 3_585_000,
    close: "17/08/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_14903",
    title: "Bản quyền phần mềm FortiManager và FortiAnalyzer",
    customer: "CÔNG TY TRÁCH NHIỆM HỮU HẠN JAPFA COMFEED VIỆT NAM",
    value: 291_098_000,
    close: "30/11/2026",
    color: "Vàng",
  },
  // ---- screenshot 3 ----
  {
    caseCode: "HPT_14917",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "TRƯỜNG TIỂU HỌC BÌNH TRỊ 2",
    value: 370_000_000,
    close: "15/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Microsoft",
  },
  {
    caseCode: "HPT_14918",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ",
    value: 349_600_000,
    close: "01/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Microsoft",
  },
  {
    caseCode: "HPT_14915",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "TRƯỜNG CAO ĐẲNG KINH TẾ THÀNH PHỐ HỒ CHÍ MINH",
    value: 445_800_000,
    close: "15/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Microsoft",
  },
  {
    caseCode: "HPT_14916",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN BÌNH ĐIỀN - MEKONG",
    value: 359_500_000,
    close: "15/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Microsoft - Copilot",
  },
  {
    caseCode: "HPT_14913",
    title: "Cung cấp bản quyền phần mềm Microsoft",
    customer: "BỆNH VIỆN II LÂM ĐỒNG",
    value: 5_039_000_000,
    close: "15/10/2026",
    color: "Đỏ",
    matchPrefix: "Bản quyền phần mềm Microsoft",
  },
  // ---- screenshot 4 ----
  {
    caseCode: "HPT_15075",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN HỆ THỐNG Y KHOA ÁI NGHĨA",
    value: 82_800_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15072",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY TNHH PHÒNG KHÁM ĐA KHOA ÁI NGHĨA LONG THÀNH 2",
    value: 27_600_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15046",
    title: "Bản quyền phần mềm Microsoft",
    customer:
      "PKĐK ÁI NGHĨA NGÃ TƯ VŨNG TÀU - CHI NHÁNH CÔNG TY CỔ PHẦN HỆ THỐNG Y KHOA ÁI NGHĨA",
    value: 64_550_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15040",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN PHÒNG KHÁM ĐA KHOA ÁI NGHĨA BIÊN HÒA",
    value: 64_550_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15039",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ GIÁO DỤC NAM LONG",
    value: 23_400_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  // ---- screenshot 5 ----
  {
    caseCode: "HPT_15118",
    title: "CBS Firewall",
    customer: "CÔNG TY TNHH DỊCH VỤ EB",
    value: 4_167_350_000,
    close: "01/09/2026",
    color: "Xám",
  },
  {
    caseCode: "HPT_15077",
    title: "Bản quyền phần mềm Microsoft",
    customer:
      "CHI NHÁNH 2 - CÔNG TY CỔ PHẦN PHÒNG KHÁM ĐA KHOA ÁI NGHĨA LONG KHÁNH - PKĐK ÁI NGHĨA XUÂN LỘC",
    value: 101_500_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15076",
    title: "Bản quyền phần mềm Microsoft",
    customer:
      "PHÒNG KHÁM ĐA KHOA ÁI NGHĨA THẠNH PHÚ - CHI NHÁNH 1 CÔNG TY CỔ PHẦN HỆ THỐNG Y KHOA ÁI NGHĨA",
    value: 64_550_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15074",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN PHÒNG KHÁM ĐA KHOA ÁI NGHĨA TAM PHƯỚC",
    value: 64_550_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15073",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY CỔ PHẦN PHÒNG KHÁM ĐA KHOA ÁI NGHĨA LONG KHÁNH",
    value: 101_500_000,
    close: "16/09/2026",
    color: "Hồng",
    vendor: "Microsoft",
  },
  // ---- screenshot 6 ----
  {
    caseCode: "HPT_15207",
    title: "Bản quyền phần mềm Microsoft",
    customer: "CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ GIÁO DỤC NAM LONG",
    value: 39_000_000,
    close: "16/10/2026",
    color: "Xanh",
    vendor: "Microsoft",
  },
  {
    caseCode: "HPT_15152",
    title: "Dịch vụ bảo hành - SIEM SPLUNK",
    customer: "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN SÀI GÒN CÔNG THƯƠNG",
    value: 192_000_000,
    close: "30/09/2026",
    color: "Xanh",
  },
  {
    caseCode: "HPT_15117",
    title: "Food Retail Hardware Frefreshment_2",
    customer: "CÔNG TY TNHH DỊCH VỤ EB",
    value: 3_056_030_000,
    close: "20/08/2026",
    color: "Xám",
  },
  {
    caseCode: "HPT_15116",
    title: "Food Retail Hardware Frefreshment_1",
    customer: "CÔNG TY TNHH DỊCH VỤ EB",
    value: 2_811_600_000,
    close: "20/08/2026",
    color: "Xám",
  },
  {
    caseCode: "HPT_15119",
    title: "CPOS Penetration Testing",
    customer: "CÔNG TY TNHH DỊCH VỤ EB",
    value: 270_000_000,
    close: "20/08/2026",
    color: "Xám",
  },
];

function parseDate(ddmmyyyy: string): Date {
  const [d, m, y] = ddmmyyyy.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const vnd = (n: number) => n.toLocaleString("vi-VN");

// Existing rows store Vietnamese diacritics decomposed (NFD) while the
// strings in this file are composed (NFC), so raw === and SQL startsWith
// both miss. Compare on NFC everywhere.
const nfc = (s: string) => s.normalize("NFC");

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) throw new Error(`No user ${OWNER_EMAIL}`);

  const accounts = await prisma.account.findMany({ where: { ownerId: owner.id } });
  const accountByName = new Map(accounts.map((a) => [nfc(a.companyName), a]));

  const created: string[] = [];
  const updated: string[] = [];
  const newAccounts: string[] = [];
  const problems: string[] = [];

  for (const row of ROWS) {
    const accountName = nfc(ACCOUNT_ALIAS[row.customer] ?? row.customer);
    let account = accountByName.get(accountName);

    if (!account) {
      if (!newAccounts.includes(accountName)) newAccounts.push(accountName);
      if (APPLY) {
        account = await prisma.account.create({
          data: {
            companyName: accountName,
            notes: "Auto-imported từ OPP (Mã vụ việc)",
            ownerId: owner.id,
          },
        });
        accountByName.set(accountName, account);
      }
    }

    const stage = STAGE_OF[row.color];
    const data = {
      caseCode: row.caseCode,
      title: row.title,
      value: row.value,
      stage,
      probability: PROBABILITY_OF[stage],
      expectedClose: parseDate(row.close),
      ...(row.vendor ? { vendor: row.vendor } : {}),
    };

    // Already synced once — the case code is the identity from here on.
    const byCode = await prisma.deal.findUnique({ where: { caseCode: row.caseCode } });
    if (byCode) {
      updated.push(`${row.caseCode}  ${row.title}  (theo caseCode)`);
      if (APPLY) await prisma.deal.update({ where: { id: byCode.id }, data });
      continue;
    }

    // First sync: adopt the deal carried over from the Excel import, if the
    // row names one. Must resolve to exactly one deal or we stop and ask.
    if (row.matchPrefix && account) {
      const accountDeals = await prisma.deal.findMany({
        where: { ownerId: owner.id, accountId: account.id, caseCode: null },
      });
      const prefix = nfc(row.matchPrefix);
      const candidates = accountDeals.filter((d) => nfc(d.title).startsWith(prefix));
      if (candidates.length !== 1) {
        problems.push(
          `${row.caseCode}: khớp ${candidates.length} deal với tiền tố "${row.matchPrefix}" @ ${accountName}`,
        );
        continue;
      }
      const old = candidates[0];
      const changes: string[] = [];
      if (old.title !== row.title) changes.push(`tên: "${old.title}" → "${row.title}"`);
      if (old.value !== row.value) changes.push(`giá trị: ${vnd(old.value ?? 0)} → ${vnd(row.value)}`);
      if (old.stage !== stage) changes.push(`màu: ${old.stage} → ${stage}`);
      updated.push(
        `${row.caseCode}  ${accountName}\n      ${changes.join("\n      ") || "(không đổi)"}`,
      );
      if (APPLY) await prisma.deal.update({ where: { id: old.id }, data });
      continue;
    }

    created.push(`${row.caseCode}  ${vnd(row.value).padStart(15)}  ${row.color.padEnd(5)}  ${row.title}  @ ${accountName}`);
    if (APPLY && account) {
      await prisma.deal.create({ data: { ...data, accountId: account.id, ownerId: owner.id } });
    }
  }

  console.log(`\n=== ${APPLY ? "ĐÃ GHI" : "DRY RUN"} ===`);
  console.log(`\n--- Khách hàng tạo mới (${newAccounts.length}) ---`);
  newAccounts.forEach((n) => console.log("  +", n));
  console.log(`\n--- Deal cập nhật (${updated.length}) ---`);
  updated.forEach((u) => console.log("  ~", u));
  console.log(`\n--- Deal tạo mới (${created.length}) ---`);
  created.forEach((c) => console.log("  +", c));
  if (problems.length) {
    console.log(`\n!!! CẦN XEM LẠI (${problems.length}) !!!`);
    problems.forEach((p) => console.log("  ?", p));
  }
  console.log(
    `\nTổng: ${ROWS.length} dòng OPP → ${updated.length} update, ${created.length} create, ${problems.length} vướng.`,
  );
  await prisma.$disconnect();
}

main();
