/**
 * HSI Sales AI Platform — demo seed
 *
 * Goal: any demo session should feel populated. After `prisma db seed` the
 * platform has 25 VN accounts, ~60 deals across all stages (including
 * closed won/lost for Win/Loss analytics), products catalog, competitors,
 * meetings with VN content, proposals, quotations, RFPs, chat history,
 * and health snapshots.
 *
 * Data is deterministic (no runtime Math.random for structure) so the
 * same seed always produces the same story — easier to script a demo.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---- helpers ----
const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);
const daysFromNow = (d: number) => new Date(now + d * DAY);

/** Deterministic pseudo-random in [0,1) derived from a string. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}
const pick = <T>(arr: T[], key: string): T => arr[Math.floor(hash01(key) * arr.length)];

async function main() {
  console.log("[seed] starting");

  // ============ Users ============
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const jimmy = await prisma.user.upsert({
    where: { email: "jimmy@hpt.vn" },
    update: {},
    create: { name: "Jimmy Nguyen", email: "jimmy@hpt.vn", passwordHash, role: "sales" },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@hpt.vn" },
    update: {},
    create: { name: "Trần Hữu Quản", email: "manager@hpt.vn", passwordHash, role: "manager" },
  });
  await prisma.user.upsert({
    where: { email: "admin@hpt.vn" },
    update: {},
    create: { name: "HSI Admin", email: "admin@hpt.vn", passwordHash, role: "admin" },
  });

  // ============ Wipe demo data (idempotent) ============
  await prisma.activity.deleteMany({});
  await prisma.cRMInsight.deleteMany({});
  await prisma.healthSnapshot.deleteMany({});
  await prisma.actionItem.deleteMany({});
  await prisma.meeting.deleteMany({});
  await prisma.emailDraft.deleteMany({});
  await prisma.proposal.deleteMany({});
  await prisma.quotation.deleteMany({});
  await prisma.dailyBriefing.deleteMany({});
  await prisma.salesReport.deleteMany({});
  await prisma.winLossReport.deleteMany({});
  await prisma.marketSizing.deleteMany({});
  await prisma.rFPResponse.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.competitorIntel.deleteMany({});
  await prisma.competitor.deleteMany({});
  await prisma.deal.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.aILog.deleteMany({});

  // ============ Accounts ============
  type AccountSpec = {
    companyName: string;
    industry: string;
    size: string;
    website: string;
    address: string;
    healthScore: number;
    notes: string;
    contacts: Array<{ fullName: string; title: string; email: string; phone?: string; isPrimary?: boolean }>;
  };

  const accountsData: AccountSpec[] = [
    // ---- Banking & Finance (5) ----
    {
      companyName: "Vietcombank",
      industry: "Banking & Finance",
      size: "enterprise",
      website: "https://vietcombank.com.vn",
      address: "198 Trần Quang Khải, Hoàn Kiếm, Hà Nội",
      healthScore: 82,
      notes: "Đang trong dự án modernize core banking. Có budget lớn Q2/2026 cho infrastructure refresh.",
      contacts: [
        { fullName: "Nguyễn Thanh Tùng", title: "CIO", email: "tung.nt@vietcombank.com.vn", phone: "+84-903-111-001", isPrimary: true },
        { fullName: "Trần Minh Đức", title: "Head of IT Infrastructure", email: "duc.tm@vietcombank.com.vn", phone: "+84-903-111-002" },
        { fullName: "Lê Thị Hương", title: "Security Lead", email: "huong.lt@vietcombank.com.vn" },
      ],
    },
    {
      companyName: "BIDV",
      industry: "Banking & Finance",
      size: "enterprise",
      website: "https://bidv.com.vn",
      address: "35 Hàng Vôi, Hoàn Kiếm, Hà Nội",
      healthScore: 75,
      notes: "Đang đánh giá RFP cho security stack. Ưu tiên Palo Alto + CrowdStrike combo.",
      contacts: [
        { fullName: "Phạm Văn Hải", title: "CTO", email: "hai.pv@bidv.com.vn", phone: "+84-903-112-001", isPrimary: true },
        { fullName: "Vũ Thị Thu", title: "Security Architect", email: "thu.vt@bidv.com.vn" },
      ],
    },
    {
      companyName: "Techcombank",
      industry: "Banking & Finance",
      size: "enterprise",
      website: "https://techcombank.com.vn",
      address: "191 Bà Triệu, Hai Bà Trưng, Hà Nội",
      healthScore: 88,
      notes: "Long-term partner. Đang mở rộng data center thứ 3 ở Bình Dương.",
      contacts: [
        { fullName: "Đỗ Quốc Anh", title: "CIO", email: "anh.dq@techcombank.com.vn", isPrimary: true },
        { fullName: "Hoàng Thị Mai", title: "IT Director", email: "mai.ht@techcombank.com.vn" },
      ],
    },
    {
      companyName: "VPBank",
      industry: "Banking & Finance",
      size: "enterprise",
      website: "https://vpbank.com.vn",
      address: "89 Láng Hạ, Đống Đa, Hà Nội",
      healthScore: 68,
      notes: "Fast growth, digital-first bank. Quan tâm hybrid cloud.",
      contacts: [
        { fullName: "Bùi Minh Tuấn", title: "Head of Digital", email: "tuan.bm@vpbank.com.vn", isPrimary: true },
        { fullName: "Ngô Thị Lan", title: "Cloud Architect", email: "lan.nt@vpbank.com.vn" },
      ],
    },
    {
      companyName: "MB Bank",
      industry: "Banking & Finance",
      size: "enterprise",
      website: "https://mbbank.com.vn",
      address: "21 Cát Linh, Đống Đa, Hà Nội",
      healthScore: 72,
      notes: "Đang refresh storage stack. Cân nhắc IBM FlashSystem vs HPE Alletra.",
      contacts: [
        { fullName: "Lê Văn Sơn", title: "IT Infrastructure Manager", email: "son.lv@mbbank.com.vn", isPrimary: true },
      ],
    },

    // ---- Manufacturing (4) ----
    {
      companyName: "Vinamilk",
      industry: "Manufacturing",
      size: "enterprise",
      website: "https://vinamilk.com.vn",
      address: "10 Tân Trào, Quận 7, TP.HCM",
      healthScore: 65,
      notes: "Mở rộng 2 nhà máy ở Bình Dương và Nghệ An. Dự án data platform đi kèm.",
      contacts: [
        { fullName: "Trịnh Quốc Dũng", title: "CIO", email: "dung.tq@vinamilk.com.vn", isPrimary: true },
        { fullName: "Phan Thị Yến", title: "SAP Manager", email: "yen.pt@vinamilk.com.vn" },
      ],
    },
    {
      companyName: "Tập đoàn Masan",
      industry: "Manufacturing",
      size: "enterprise",
      website: "https://masangroup.com",
      address: "23 Lê Duẩn, Quận 1, TP.HCM",
      healthScore: 58,
      notes: "Masan Consumer + WinMart tech consolidation. Đang RFP cho SD-WAN.",
      contacts: [
        { fullName: "Hoàng Minh Khoa", title: "VP of Technology", email: "khoa.hm@masangroup.com", isPrimary: true },
      ],
    },
    {
      companyName: "Hòa Phát Group",
      industry: "Manufacturing",
      size: "enterprise",
      website: "https://hoaphat.com.vn",
      address: "643 Phạm Văn Đồng, Bắc Từ Liêm, Hà Nội",
      healthScore: 52,
      notes: "Khu liên hợp Dung Quất cần operational tech upgrade. Budget chưa confirm.",
      contacts: [
        { fullName: "Nguyễn Đức Minh", title: "Head of IT", email: "minh.nd@hoaphat.com.vn", isPrimary: true },
      ],
    },
    {
      companyName: "THACO",
      industry: "Manufacturing",
      size: "enterprise",
      website: "https://thacogroup.vn",
      address: "Khu công nghiệp Chu Lai, Quảng Nam",
      healthScore: 45,
      notes: "Đang đánh giá Dell vs HPE cho factory automation. Competitive — Dell đang chiếm ưu thế.",
      contacts: [
        { fullName: "Võ Thành Long", title: "IT Director", email: "long.vt@thacogroup.vn", isPrimary: true },
      ],
    },

    // ---- Telco (3) ----
    {
      companyName: "Viettel Telecom",
      industry: "Telco",
      size: "enterprise",
      website: "https://viettel.com.vn",
      address: "Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội",
      healthScore: 85,
      notes: "Multi-year partnership. Viettel Cloud expansion — HPE GreenLake là preferred.",
      contacts: [
        { fullName: "Đinh Quốc Trung", title: "Deputy CTO", email: "trung.dq@viettel.com.vn", isPrimary: true },
        { fullName: "Lý Thị Ngọc", title: "Procurement Lead", email: "ngoc.lt@viettel.com.vn" },
      ],
    },
    {
      companyName: "VNPT",
      industry: "Telco",
      size: "enterprise",
      website: "https://vnpt.com.vn",
      address: "57 Huỳnh Thúc Kháng, Đống Đa, Hà Nội",
      healthScore: 70,
      notes: "Đang restructure. IT budget bị delay — expect Q3/2026.",
      contacts: [
        { fullName: "Phạm Anh Tuấn", title: "Head of Network", email: "tuan.pa@vnpt.vn", isPrimary: true },
      ],
    },
    {
      companyName: "FPT Telecom",
      industry: "Telco",
      size: "enterprise",
      website: "https://fpt.vn",
      address: "FPT Tower, 10 Phạm Văn Bạch, Cầu Giấy, Hà Nội",
      healthScore: 78,
      notes: "FPT Cloud partner. Đang đánh giá CrowdStrike cho internal security.",
      contacts: [
        { fullName: "Cao Văn Đức", title: "CISO", email: "duc.cv@fpt.com.vn", isPrimary: true },
      ],
    },

    // ---- Government (3) ----
    {
      companyName: "Bộ Tài Chính",
      industry: "Government",
      size: "enterprise",
      website: "https://mof.gov.vn",
      address: "28 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội",
      healthScore: 55,
      notes: "Procurement qua đấu thầu. Đã trúng gói thuế điện tử năm 2024, opportunity cho renewal.",
      contacts: [
        { fullName: "Trần Văn Bình", title: "Vụ trưởng Vụ CNTT", email: "binh.tv@mof.gov.vn", isPrimary: true },
      ],
    },
    {
      companyName: "Bộ Y Tế",
      industry: "Government",
      size: "enterprise",
      website: "https://moh.gov.vn",
      address: "138A Giảng Võ, Ba Đình, Hà Nội",
      healthScore: 48,
      notes: "Hệ thống hồ sơ y tế điện tử quốc gia. Đang RFP cho infrastructure.",
      contacts: [
        { fullName: "Nguyễn Thị Hà", title: "Phó Vụ trưởng", email: "ha.nt@moh.gov.vn", isPrimary: true },
      ],
    },
    {
      companyName: "Tổng cục Thuế",
      industry: "Government",
      size: "enterprise",
      website: "https://gdt.gov.vn",
      address: "123 Lò Đúc, Hai Bà Trưng, Hà Nội",
      healthScore: 62,
      notes: "Hệ thống eTax, peak load cao trong quyết toán. Cần scale storage.",
      contacts: [
        { fullName: "Đặng Văn Nam", title: "Trưởng phòng hạ tầng", email: "nam.dv@gdt.gov.vn", isPrimary: true },
      ],
    },

    // ---- Healthcare (2) ----
    {
      companyName: "Hệ thống Y tế Vinmec",
      industry: "Healthcare",
      size: "enterprise",
      website: "https://vinmec.com",
      address: "458 Minh Khai, Hai Bà Trưng, Hà Nội",
      healthScore: 80,
      notes: "Mở thêm 2 bệnh viện ở Cần Thơ và Đà Nẵng. PACS + EMR expansion.",
      contacts: [
        { fullName: "Lê Anh Quân", title: "CIO", email: "quan.la@vinmec.com", isPrimary: true },
        { fullName: "Trần Bảo Linh", title: "Clinical Systems Lead", email: "linh.tb@vinmec.com" },
      ],
    },
    {
      companyName: "Bệnh viện Bạch Mai",
      industry: "Healthcare",
      size: "mid-market",
      website: "https://bachmai.gov.vn",
      address: "78 Giải Phóng, Đống Đa, Hà Nội",
      healthScore: 50,
      notes: "Legacy system, đang cần refresh PACS storage. Budget hạn chế.",
      contacts: [
        { fullName: "Vũ Thị Minh Nguyệt", title: "Trưởng khoa CNTT", email: "nguyet.vt@bachmai.gov.vn", isPrimary: true },
      ],
    },

    // ---- Retail (3) ----
    {
      companyName: "FPT Retail",
      industry: "Retail",
      size: "mid-market",
      website: "https://frt.vn",
      address: "261-263 Khánh Hội, Quận 4, TP.HCM",
      healthScore: 42,
      notes: "Doanh thu giảm Q4/2025. Đang review lại security + POS infrastructure.",
      contacts: [
        { fullName: "Mai Thanh Sơn", title: "Head of IT", email: "son.mt@frt.vn", isPrimary: true },
      ],
    },
    {
      companyName: "Saigon Co.op",
      industry: "Retail",
      size: "enterprise",
      website: "https://saigonco-op.com.vn",
      address: "199-205 Nguyễn Thái Học, Quận 1, TP.HCM",
      healthScore: 60,
      notes: "800+ cửa hàng toàn quốc. Đang rollout SD-WAN cho chuỗi.",
      contacts: [
        { fullName: "Trần Quang Tú", title: "IT Operations Director", email: "tu.tq@saigonco-op.com.vn", isPrimary: true },
      ],
    },
    {
      companyName: "AEON Việt Nam",
      industry: "Retail",
      size: "enterprise",
      website: "https://aeon.com.vn",
      address: "30 Bờ Bao Tân Thắng, Tân Phú, TP.HCM",
      healthScore: 68,
      notes: "Parent company tại Nhật chỉ định Fortinet. Cạnh tranh khó với PA.",
      contacts: [
        { fullName: "Yamada Takeshi", title: "Regional IT Manager", email: "t.yamada@aeon.com.vn", isPrimary: true },
      ],
    },

    // ---- Aviation / Conglomerate (3) ----
    {
      companyName: "VietJet Air",
      industry: "Aviation",
      size: "enterprise",
      website: "https://vietjetair.com",
      address: "Sân bay Tân Sơn Nhất, Tân Bình, TP.HCM",
      healthScore: 58,
      notes: "Đang tìm hybrid cloud cho booking + CRM. Microsoft Azure là preference.",
      contacts: [
        { fullName: "Phạm Hồng Quân", title: "Head of IT", email: "quan.ph@vietjetair.com", isPrimary: true },
      ],
    },
    {
      companyName: "Vingroup",
      industry: "Conglomerate",
      size: "enterprise",
      website: "https://vingroup.net",
      address: "7 Bằng Lăng 1, Vinhomes Riverside, Long Biên, Hà Nội",
      healthScore: 75,
      notes: "Multiple subsidiaries — cross-sell VinFast, VinBrain, Vinhomes. Central IT mạnh.",
      contacts: [
        { fullName: "Lê Thị Thu Thủy", title: "Group CIO", email: "thuy.ltt@vingroup.net", isPrimary: true },
      ],
    },
    {
      companyName: "Sun Group",
      industry: "Conglomerate",
      size: "enterprise",
      website: "https://sungroup.com.vn",
      address: "Tầng 35, Keangnam Landmark, Hà Nội",
      healthScore: 63,
      notes: "Resort + theme park operations. Hospitality tech stack renewal.",
      contacts: [
        { fullName: "Đinh Văn Hoàng", title: "CIO", email: "hoang.dv@sungroup.com.vn", isPrimary: true },
      ],
    },

    // ---- Education (2) ----
    {
      companyName: "ĐH Bách Khoa Hà Nội",
      industry: "Education",
      size: "mid-market",
      website: "https://hust.edu.vn",
      address: "1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội",
      healthScore: 70,
      notes: "Dự án HPC cluster cho AI research. Budget từ nguồn đề tài nhà nước.",
      contacts: [
        { fullName: "TS. Nguyễn Tiến Dũng", title: "Trưởng khoa CNTT", email: "dung.nt@hust.edu.vn", isPrimary: true },
      ],
    },
    {
      companyName: "ĐH Quốc Gia TP.HCM",
      industry: "Education",
      size: "mid-market",
      website: "https://vnuhcm.edu.vn",
      address: "Linh Trung, Thủ Đức, TP.HCM",
      healthScore: 65,
      notes: "Campus-wide Wi-Fi + security refresh. Ưu tiên Aruba hoặc Cisco.",
      contacts: [
        { fullName: "TS. Trần Quang Hưng", title: "Giám đốc Trung tâm CNTT", email: "hung.tq@vnuhcm.edu.vn", isPrimary: true },
      ],
    },
  ];

  // ============ Seed accounts + contacts + health snapshots ============
  console.log(`[seed] creating ${accountsData.length} accounts`);
  const accounts: { id: string; name: string; industry: string; healthScore: number }[] = [];

  for (const a of accountsData) {
    const account = await prisma.account.create({
      data: {
        companyName: a.companyName,
        industry: a.industry,
        size: a.size,
        website: a.website,
        address: a.address,
        notes: a.notes,
        healthScore: a.healthScore,
        ownerId: jimmy.id,
      },
    });
    accounts.push({ id: account.id, name: a.companyName, industry: a.industry, healthScore: a.healthScore });

    for (const c of a.contacts) {
      await prisma.contact.create({
        data: { ...c, accountId: account.id },
      });
    }

    // Health snapshot for dashboard
    const score = a.healthScore;
    const riskLevel = score >= 75 ? "healthy" : score >= 60 ? "watch" : score >= 40 ? "at_risk" : "critical";
    await prisma.healthSnapshot.create({
      data: {
        accountId: account.id,
        score,
        riskLevel,
        factors: {
          engagement_recency: Math.min(100, score + 5),
          deal_velocity: Math.max(0, score - 10),
          revenue_trend: score,
          response_rate: Math.min(100, score + 10),
          support_issues: Math.max(0, 100 - score),
        },
        explanation:
          riskLevel === "healthy"
            ? `${a.companyName} có engagement tốt, pipeline active, response rate cao. Khách hàng ổn định, ưu tiên up-sell.`
            : riskLevel === "watch"
              ? `${a.companyName} ổn nhưng deal velocity chậm lại. Cần follow-up trong 2 tuần tới.`
              : riskLevel === "at_risk"
                ? `${a.companyName} có dấu hiệu chững lại: engagement giảm, pipeline mỏng. Cần executive touch.`
                : `${a.companyName} ở mức critical: budget hoãn, competitor đang take-over. Cần hành động khẩn.`,
        createdAt: daysAgo(3),
      },
    });
  }

  // ============ Products catalog (40 items across 7 vendors) ============
  console.log("[seed] seeding products catalog");
  const productsData = [
    // HPE (8)
    { vendor: "HPE", sku: "P55241-B21", name: "HPE ProLiant DL380 Gen11", description: "2U rack server, 2x Xeon Scalable Gen4, 32 DIMM slots, ideal cho virtualization + database workloads.", category: "server", unit: "unit", listPrice: 280_000_000 },
    { vendor: "HPE", sku: "P51930-B21", name: "HPE ProLiant DL360 Gen11", description: "1U rack server compact, optimize cho compute-density workloads.", category: "server", unit: "unit", listPrice: 220_000_000 },
    { vendor: "HPE", sku: "R7D34A", name: "HPE Synergy 480 Gen11", description: "Composable infrastructure blade, fabric-integrated, dành cho private cloud.", category: "server", unit: "unit", listPrice: 520_000_000 },
    { vendor: "HPE", sku: "R7K58A", name: "HPE Alletra 6030", description: "All-flash storage NVMe, 100% availability guarantee, AI-driven Infosight.", category: "storage", unit: "unit", listPrice: 1_450_000_000 },
    { vendor: "HPE", sku: "R7L80A", name: "HPE Alletra 9060", description: "Tier-1 block storage, sub-ms latency, 6-nines availability.", category: "storage", unit: "unit", listPrice: 3_800_000_000 },
    { vendor: "HPE", sku: "R0Q80A", name: "HPE MSA 2062 Storage", description: "Entry-level hybrid flash, up to 960TB. Phù hợp SMB/mid-market.", category: "storage", unit: "unit", listPrice: 380_000_000 },
    { vendor: "HPE", sku: "HPE-GL-SUB", name: "HPE GreenLake Subscription", description: "As-a-service consumption model cho compute + storage + cloud services.", category: "cloud", unit: "month", listPrice: 50_000_000 },
    { vendor: "HPE", sku: "R8Q67A", name: "Aruba CX 8325 Switch", description: "48x 25G + 8x 100G QSFP28, datacenter-class, VSX.", category: "networking", unit: "unit", listPrice: 420_000_000 },

    // Dell (7)
    { vendor: "Dell", sku: "R650-BASE", name: "Dell PowerEdge R650", description: "1U rack server, 2x Xeon Scalable Gen3, flexible storage options.", category: "server", unit: "unit", listPrice: 210_000_000 },
    { vendor: "Dell", sku: "R750-BASE", name: "Dell PowerEdge R750", description: "2U rack, 8x3.5\" or 24x2.5\" drives, high I/O density.", category: "server", unit: "unit", listPrice: 270_000_000 },
    { vendor: "Dell", sku: "PS-500T", name: "Dell PowerStore 500T", description: "All-flash storage with machine-learning data reduction.", category: "storage", unit: "unit", listPrice: 1_250_000_000 },
    { vendor: "Dell", sku: "PS-1200T", name: "Dell PowerStore 1200T", description: "Scale-out unified storage, NVMe, AppsON.", category: "storage", unit: "unit", listPrice: 2_100_000_000 },
    { vendor: "Dell", sku: "PS-H5600", name: "Dell PowerScale H5600", description: "Hybrid scale-out NAS cho unstructured data (media, HPC).", category: "storage", unit: "unit", listPrice: 1_800_000_000 },
    { vendor: "Dell", sku: "S5248F", name: "Dell PowerSwitch S5248F-ON", description: "48x25G + 8x100G, ONIE open-networking capable.", category: "networking", unit: "unit", listPrice: 380_000_000 },
    { vendor: "Dell", sku: "UNITY-XT", name: "Dell Unity XT 480F", description: "Midrange all-flash unified storage.", category: "storage", unit: "unit", listPrice: 950_000_000 },

    // IBM (5)
    { vendor: "IBM", sku: "S1014-POWER10", name: "IBM Power S1014", description: "Entry-level Power10 server cho AIX/Linux/IBM i workloads.", category: "server", unit: "unit", listPrice: 650_000_000 },
    { vendor: "IBM", sku: "FS5200", name: "IBM FlashSystem 5200", description: "All-flash NVMe storage, Spectrum Virtualize, entry-level enterprise.", category: "storage", unit: "unit", listPrice: 1_100_000_000 },
    { vendor: "IBM", sku: "FS9500", name: "IBM FlashSystem 9500", description: "High-end all-flash, 4.5M IOPS, 99.9999% availability.", category: "storage", unit: "unit", listPrice: 4_200_000_000 },
    { vendor: "IBM", sku: "CP-DATA", name: "IBM Cloud Pak for Data", description: "Data fabric + AI platform chạy trên OpenShift.", category: "software", unit: "license", listPrice: 180_000_000 },
    { vendor: "IBM", sku: "SCEPH", name: "IBM Storage Ceph", description: "Software-defined object/block/file storage, massive scale-out.", category: "storage", unit: "license", listPrice: 85_000_000 },

    // Palo Alto (6)
    { vendor: "Palo Alto", sku: "PA-3410", name: "Palo Alto PA-3410", description: "Next-gen firewall 9 Gbps threat-prevention, mid-enterprise branch.", category: "security", unit: "unit", listPrice: 420_000_000 },
    { vendor: "Palo Alto", sku: "PA-5450", name: "Palo Alto PA-5450", description: "Datacenter NGFW 72 Gbps, chassis-based, dành cho large enterprise core.", category: "security", unit: "unit", listPrice: 2_100_000_000 },
    { vendor: "Palo Alto", sku: "PA-7080", name: "Palo Alto PA-7080", description: "Top-of-line chassis NGFW, 200+ Gbps throughput.", category: "security", unit: "unit", listPrice: 4_800_000_000 },
    { vendor: "Palo Alto", sku: "PRISMA-ACC", name: "Prisma Access (SASE)", description: "Cloud-delivered SASE + ZTNA, per-user subscription.", category: "security", unit: "license", listPrice: 3_200_000 },
    { vendor: "Palo Alto", sku: "CORTEX-XDR", name: "Cortex XDR Pro", description: "Extended detection + response, endpoint + network + cloud.", category: "security", unit: "license", listPrice: 2_400_000 },
    { vendor: "Palo Alto", sku: "PRISMA-CLOUD", name: "Prisma Cloud Enterprise", description: "CNAPP cho multi-cloud workload protection.", category: "security", unit: "license", listPrice: 1_800_000 },

    // CrowdStrike (5)
    { vendor: "CrowdStrike", sku: "FALCON-GO", name: "Falcon Go", description: "Entry tier NGAV cho SMB, up to 250 endpoints.", category: "security", unit: "license", listPrice: 1_500_000 },
    { vendor: "CrowdStrike", sku: "FALCON-PRO", name: "Falcon Pro", description: "NGAV + EDR + threat intelligence, mid-market standard.", category: "security", unit: "license", listPrice: 2_800_000 },
    { vendor: "CrowdStrike", sku: "FALCON-ENT", name: "Falcon Enterprise", description: "Enterprise tier: Pro + Identity Protection + Threat Hunting.", category: "security", unit: "license", listPrice: 4_200_000 },
    { vendor: "CrowdStrike", sku: "FALCON-CMPLT", name: "Falcon Complete", description: "Fully-managed MDR service 24/7 by CrowdStrike SOC.", category: "security", unit: "license", listPrice: 6_500_000 },
    { vendor: "CrowdStrike", sku: "FALCON-ELITE", name: "Falcon Elite", description: "Top tier: Complete + Insights + CAO services.", category: "security", unit: "license", listPrice: 8_900_000 },

    // Microsoft (7)
    { vendor: "Microsoft", sku: "M365-E3", name: "Microsoft 365 E3", description: "Office apps + Windows 11 E + EMS E3 + basic Defender.", category: "software", unit: "license", listPrice: 820_000 },
    { vendor: "Microsoft", sku: "M365-E5", name: "Microsoft 365 E5", description: "E3 + advanced security (Defender XDR) + Power BI Pro + phone system.", category: "software", unit: "license", listPrice: 1_450_000 },
    { vendor: "Microsoft", sku: "AZURE-ENT", name: "Azure Enterprise Subscription", description: "Azure consumption + enterprise agreement pricing.", category: "cloud", unit: "month", listPrice: 120_000_000 },
    { vendor: "Microsoft", sku: "DEF-XDR", name: "Microsoft Defender XDR", description: "Unified pre- and post-breach security across endpoint/email/identity/cloud.", category: "security", unit: "license", listPrice: 1_200_000 },
    { vendor: "Microsoft", sku: "SENTINEL", name: "Microsoft Sentinel (SIEM)", description: "Cloud-native SIEM + SOAR trên Azure, pay-per-GB.", category: "security", unit: "month", listPrice: 85_000_000 },
    { vendor: "Microsoft", sku: "WS2022-DC", name: "Windows Server 2022 Datacenter", description: "Unlimited VM rights, Hyper-V, Storage Replica.", category: "software", unit: "license", listPrice: 165_000_000 },
    { vendor: "Microsoft", sku: "SQL-2022-ENT", name: "SQL Server 2022 Enterprise", description: "Enterprise database, Always On AG, bi-directional replication.", category: "software", unit: "license", listPrice: 340_000_000 },

    // Fortinet (2)
    { vendor: "Fortinet", sku: "FG-600F", name: "FortiGate 600F", description: "Mid-range NGFW, 36 Gbps threat protection, ASIC-accelerated.", category: "security", unit: "unit", listPrice: 520_000_000 },
    { vendor: "Fortinet", sku: "FG-200F", name: "FortiGate 200F", description: "Branch/SME NGFW, 27 Gbps firewall throughput.", category: "security", unit: "unit", listPrice: 185_000_000 },
  ];
  for (const p of productsData) {
    await prisma.product.create({
      data: {
        ...p,
        partnerCost: Math.round(p.listPrice * 0.72),
        currency: "VND",
        active: true,
      },
    });
  }

  // ============ Competitors ============
  console.log("[seed] seeding competitors");
  const competitorsData = [
    {
      name: "Cisco Systems",
      vendor: "Cisco",
      website: "https://cisco.com",
      strengths: "Brand mạnh nhất ở enterprise networking + security. Catalyst switches là de-facto standard ở VN.",
      weaknesses: "Giá cao, thời gian giao hàng dài sau COVID. Roadmap storage yếu.",
      pricing: "List price 20–30% cao hơn PA. Negotiate được 35–45%.",
      notes: "Incumbent ở nhiều ngân hàng lớn (Vietcombank, BIDV networking).",
    },
    {
      name: "Fortinet",
      vendor: "Fortinet",
      website: "https://fortinet.com",
      strengths: "Single-pane-of-glass với Security Fabric. Giá cạnh tranh 25–35% rẻ hơn PA ở entry-mid.",
      weaknesses: "UI phức tạp, learning curve cao. ASIC vendor-lockin.",
      pricing: "Entry: 180–500 triệu; mid: 1.2–2.5 tỷ; support thường 20% list.",
      notes: "Đang push mạnh ở retail + manufacturing. AEON VN chỉ định cứng.",
    },
    {
      name: "Check Point",
      vendor: "Check Point",
      website: "https://checkpoint.com",
      strengths: "Best-in-class threat prevention engine. SandBlast zero-day protection.",
      weaknesses: "Throughput kém hơn PA ở cùng price point. UX cũ.",
      pricing: "Tương đương PA, sometimes 5–10% cao hơn.",
      notes: "Ít thấy ở VN so với PA/Fortinet. Thỉnh thoảng xuất hiện ở banking.",
    },
    {
      name: "Lenovo ISG",
      vendor: "Lenovo",
      website: "https://lenovo.com/isg",
      strengths: "Giá rẻ 15–20% so với HPE/Dell ở server. Aggressive channel pricing.",
      weaknesses: "Storage portfolio (NetApp OEM) không mạnh bằng HPE Alletra hay Dell PowerStore.",
      pricing: "Server 1U: 150–200 triệu; Storage: 600–900 triệu entry.",
      notes: "Đang win ở mid-market. Tấn công THACO + VPBank Q1/2026.",
    },
    {
      name: "Huawei Enterprise",
      vendor: "Huawei",
      website: "https://e.huawei.com",
      strengths: "Giá tốt nhất thị trường. Pre-sales team lớn ở VN.",
      weaknesses: "Risk địa chính trị — nhiều khách hàng (gov, banking) không dùng được.",
      pricing: "30–40% rẻ hơn Dell/HPE tương đương.",
      notes: "Mạnh ở Viettel pre-2020, giờ đã bị hạn chế. Vẫn phổ biến ở DN tư nhân SMB.",
    },
    {
      name: "SentinelOne",
      vendor: "SentinelOne",
      website: "https://sentinelone.com",
      strengths: "Autonomous EDR với AI-native approach. Singularity Platform competitive với Falcon.",
      weaknesses: "Brand trust thấp hơn CrowdStrike ở enterprise. Threat intel less mature.",
      pricing: "Tương đương Falcon Pro, đôi khi rẻ hơn 10–15%.",
      notes: "Đang push mạnh vào mid-market. Win vs CS ở một số deal nhỏ.",
    },
    {
      name: "Trend Micro",
      vendor: "Trend Micro",
      website: "https://trendmicro.com",
      strengths: "Incumbent lớn ở endpoint VN từ lâu. Hybrid cloud security portfolio rộng.",
      weaknesses: "EDR không bằng CrowdStrike/SentinelOne trong detection accuracy.",
      pricing: "Rẻ hơn CrowdStrike 25–30%. Support terms linh hoạt.",
      notes: "Win vs CS khi khách hàng ưu tiên giá. Install base lớn ở manufacturing.",
    },
    {
      name: "NetApp",
      vendor: "NetApp",
      website: "https://netapp.com",
      strengths: "ONTAP file services best-in-class. Dễ migration từ legacy NAS.",
      weaknesses: "Block storage kém competitive vs Alletra/PowerStore. Price cao.",
      pricing: "A-Series: 2.5–5 tỷ; FAS: 1–2 tỷ. Market price 15–20% cao hơn HPE.",
      notes: "Strong ở healthcare + media. Đang defending ở Vinmec.",
    },
  ];

  const competitorsCreated: { id: string; name: string }[] = [];
  for (const c of competitorsData) {
    const comp = await prisma.competitor.create({
      data: { ...c, ownerId: jimmy.id },
    });
    competitorsCreated.push({ id: comp.id, name: c.name });
  }

  // Competitor intel
  const intelSpecs = [
    { comp: "Cisco Systems", type: "pricing", content: "Cisco vừa tung chương trình Catalyst Refresh giảm 25% cho khách cũ refresh sau 5 năm. Target mạnh vào banks.", impact: "high", source: "Channel partner" },
    { comp: "Cisco Systems", type: "loss_to", content: "Mất deal Techcombank networking Q4/2025 vì Cisco offer Catalyst Center free 3 năm.", impact: "high", source: "Internal" },
    { comp: "Fortinet", type: "win_against", content: "Win vs FortiGate 600F tại Saigon Co.op — PA-3410 + Cortex XDR bundle thắng về threat prevention score.", impact: "medium", source: "Deal win" },
    { comp: "Fortinet", type: "feature", content: "Fortinet mới ra FortiAI — claim AI-powered threat hunting. Chưa verify được khả năng thực.", impact: "medium", source: "Vendor blog" },
    { comp: "Fortinet", type: "pricing", content: "FG-200F đang có khuyến mãi BOGO (mua 1 tặng 1 support) tại thị trường retail.", impact: "high", source: "Distributor" },
    { comp: "Lenovo ISG", type: "win_against", content: "Win Vinamilk server refresh — HPE ProLiant DL380 thắng nhờ GreenLake flexibility. Lenovo đã offer thấp hơn 18% nhưng khách chọn HPE vì support mạng lưới tốt hơn.", impact: "high", source: "Deal win" },
    { comp: "Lenovo ISG", type: "loss_to", content: "Mất THACO factory server refresh — Lenovo SR650 V3 giá rẻ hơn 22%, TAC chọn.", impact: "high", source: "Deal loss" },
    { comp: "Huawei Enterprise", type: "news", content: "Huawei đẩy mạnh SME segment với chương trình Huawei Cloud + FusionServer. Target chính là SMB manufacturing.", impact: "medium", source: "News" },
    { comp: "SentinelOne", type: "win_against", content: "Win FPT Telecom — CrowdStrike Falcon Complete thắng SentinelOne nhờ 24/7 MDR service.", impact: "medium", source: "Deal win" },
    { comp: "SentinelOne", type: "pricing", content: "SentinelOne Singularity Complete đang bundle với Identity Protection giá chỉ cao hơn Pro 10%.", impact: "low", source: "Vendor site" },
    { comp: "Trend Micro", type: "rumor", content: "Nghe từ distributor: Trend Micro VN đang review lại chiến lược, có thể giảm support coverage.", impact: "low", source: "Distributor chat" },
    { comp: "NetApp", type: "feature", content: "NetApp AFF C-Series (capacity flash) vừa release — competitive với HPE Alletra 6030 về $/TB.", impact: "medium", source: "Vendor blog" },
    { comp: "NetApp", type: "loss_to", content: "Mất Vinmec storage expansion — NetApp giữ được vì incumbent + training staff mất công migrate.", impact: "high", source: "Deal loss" },
    { comp: "Check Point", type: "news", content: "Check Point Infinity Platform được Gartner MQ Leader 2026 ở network security.", impact: "low", source: "Analyst" },
  ];

  for (const s of intelSpecs) {
    const comp = competitorsCreated.find((c) => c.name === s.comp);
    if (!comp) continue;
    await prisma.competitorIntel.create({
      data: {
        competitorId: comp.id,
        type: s.type,
        content: s.content,
        impact: s.impact,
        source: s.source,
        userId: jimmy.id,
        createdAt: daysAgo(Math.floor(hash01(s.content) * 40)),
      },
    });
  }

  // ============ Deals ============
  console.log("[seed] seeding deals");
  const vendors = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft"];
  const productLines = ["server", "storage", "networking", "security", "cloud", "software"];
  const openStages = ["prospecting", "qualification", "proposal", "negotiation"];
  const winReasons = [
    "Giá cạnh tranh + support nội địa tốt",
    "Relationship lâu năm với Jimmy Nguyen",
    "GreenLake consumption model phù hợp budget OPEX",
    "Bundling Palo Alto + CrowdStrike threat intel",
    "Roadmap alignment với cloud-first strategy",
    "Professional services HSI mạnh, migration risk thấp",
    "Compatibility với existing HPE stack",
    "Reference visit tại Techcombank thành công",
  ];
  const lossReasons = [
    "Giá Lenovo thấp hơn 20%",
    "Fortinet được HQ (Nhật) chỉ định",
    "Budget cắt, defer sang FY27",
    "Cisco offer Catalyst Center miễn phí 3 năm",
    "Incumbent NetApp giữ được contract renewal",
    "Technical team đã đầu tư training SentinelOne",
    "Procurement process dài, competitor close trước",
    "Price performance của Dell PowerStore tốt hơn ở segment này",
  ];

  const dealSpecs: Array<{
    accountName: string;
    title: string;
    value: number;
    stage: string;
    vendor: string;
    productLine: string;
    probability: number;
    expectedCloseDays: number;
    winReason?: string;
    lossReason?: string;
    competitorName?: string;
    createdDaysAgo: number;
  }> = [
    // Open pipeline — Banking
    { accountName: "Vietcombank", title: "Vietcombank — Core banking storage refresh", value: 4_200_000_000, stage: "negotiation", vendor: "HPE", productLine: "storage", probability: 70, expectedCloseDays: 28, createdDaysAgo: 65 },
    { accountName: "Vietcombank", title: "Vietcombank — NGFW refresh datacenter", value: 6_800_000_000, stage: "proposal", vendor: "Palo Alto", productLine: "security", probability: 50, expectedCloseDays: 45, competitorName: "Fortinet", createdDaysAgo: 30 },
    { accountName: "BIDV", title: "BIDV — Security stack overhaul", value: 12_500_000_000, stage: "proposal", vendor: "Palo Alto", productLine: "security", probability: 55, expectedCloseDays: 60, competitorName: "Check Point", createdDaysAgo: 40 },
    { accountName: "BIDV", title: "BIDV — Endpoint EDR rollout 8000 users", value: 2_800_000_000, stage: "qualification", vendor: "CrowdStrike", productLine: "security", probability: 35, expectedCloseDays: 75, competitorName: "SentinelOne", createdDaysAgo: 20 },
    { accountName: "Techcombank", title: "Techcombank — Data center Bình Dương (compute+storage)", value: 18_500_000_000, stage: "negotiation", vendor: "HPE", productLine: "server", probability: 75, expectedCloseDays: 20, createdDaysAgo: 90 },
    { accountName: "VPBank", title: "VPBank — Hybrid cloud platform", value: 5_500_000_000, stage: "proposal", vendor: "Microsoft", productLine: "cloud", probability: 55, expectedCloseDays: 55, createdDaysAgo: 35 },
    { accountName: "MB Bank", title: "MB Bank — FlashSystem storage upgrade", value: 3_400_000_000, stage: "qualification", vendor: "IBM", productLine: "storage", probability: 30, expectedCloseDays: 70, competitorName: "NetApp", createdDaysAgo: 15 },

    // Open pipeline — Manufacturing
    { accountName: "Vinamilk", title: "Vinamilk — 2 factory compute refresh", value: 8_200_000_000, stage: "negotiation", vendor: "HPE", productLine: "server", probability: 70, expectedCloseDays: 18, competitorName: "Lenovo ISG", createdDaysAgo: 75 },
    { accountName: "Tập đoàn Masan", title: "Masan — SD-WAN rollout 240 sites", value: 4_800_000_000, stage: "proposal", vendor: "Palo Alto", productLine: "networking", probability: 45, expectedCloseDays: 50, competitorName: "Fortinet", createdDaysAgo: 30 },
    { accountName: "Hòa Phát Group", title: "Hòa Phát — Dung Quất DC compute upgrade", value: 6_500_000_000, stage: "qualification", vendor: "Dell", productLine: "server", probability: 30, expectedCloseDays: 90, createdDaysAgo: 10 },

    // Open pipeline — Telco
    { accountName: "Viettel Telecom", title: "Viettel Cloud — GreenLake expansion Phase 3", value: 28_000_000_000, stage: "negotiation", vendor: "HPE", productLine: "cloud", probability: 80, expectedCloseDays: 25, createdDaysAgo: 110 },
    { accountName: "VNPT", title: "VNPT — Network refresh core", value: 15_000_000_000, stage: "prospecting", vendor: "HPE", productLine: "networking", probability: 20, expectedCloseDays: 120, competitorName: "Cisco Systems", createdDaysAgo: 8 },
    { accountName: "FPT Telecom", title: "FPT Telecom — Endpoint security 5000 users", value: 2_100_000_000, stage: "proposal", vendor: "CrowdStrike", productLine: "security", probability: 55, expectedCloseDays: 35, competitorName: "SentinelOne", createdDaysAgo: 25 },

    // Open pipeline — Gov + Healthcare + Others
    { accountName: "Bộ Y Tế", title: "Bộ Y Tế — RFP hồ sơ y tế điện tử infrastructure", value: 22_000_000_000, stage: "proposal", vendor: "HPE", productLine: "server", probability: 40, expectedCloseDays: 80, createdDaysAgo: 45 },
    { accountName: "Tổng cục Thuế", title: "Tổng cục Thuế — eTax storage scale-out", value: 9_500_000_000, stage: "qualification", vendor: "IBM", productLine: "storage", probability: 35, expectedCloseDays: 95, createdDaysAgo: 20 },
    { accountName: "Hệ thống Y tế Vinmec", title: "Vinmec — PACS storage mở rộng Cần Thơ+Đà Nẵng", value: 5_800_000_000, stage: "negotiation", vendor: "HPE", productLine: "storage", probability: 65, expectedCloseDays: 30, competitorName: "NetApp", createdDaysAgo: 55 },
    { accountName: "VietJet Air", title: "VietJet — Azure cloud subscription", value: 4_200_000_000, stage: "proposal", vendor: "Microsoft", productLine: "cloud", probability: 50, expectedCloseDays: 40, createdDaysAgo: 28 },
    { accountName: "Vingroup", title: "Vingroup — Group-wide M365 E5 25000 seats", value: 8_800_000_000, stage: "negotiation", vendor: "Microsoft", productLine: "software", probability: 70, expectedCloseDays: 22, createdDaysAgo: 60 },
    { accountName: "Saigon Co.op", title: "Co.op Mart — POS network SD-WAN", value: 3_600_000_000, stage: "qualification", vendor: "Palo Alto", productLine: "networking", probability: 30, expectedCloseDays: 85, competitorName: "Fortinet", createdDaysAgo: 15 },
    { accountName: "ĐH Bách Khoa Hà Nội", title: "HUST — HPC cluster AI research", value: 12_000_000_000, stage: "proposal", vendor: "Dell", productLine: "server", probability: 45, expectedCloseDays: 65, createdDaysAgo: 38 },
    { accountName: "Sun Group", title: "Sun Group — Resort WiFi + security refresh", value: 2_800_000_000, stage: "qualification", vendor: "HPE", productLine: "networking", probability: 35, expectedCloseDays: 70, createdDaysAgo: 18 },

    // Closed WON (for Win/Loss module)
    { accountName: "Techcombank", title: "Techcombank — FlashSystem Tier-1 storage Q4/2025", value: 8_500_000_000, stage: "closed_won", vendor: "IBM", productLine: "storage", probability: 100, expectedCloseDays: -20, winReason: winReasons[0], createdDaysAgo: 120 },
    { accountName: "Vietcombank", title: "Vietcombank — CrowdStrike Falcon Complete renewal", value: 3_200_000_000, stage: "closed_won", vendor: "CrowdStrike", productLine: "security", probability: 100, expectedCloseDays: -35, winReason: winReasons[3], createdDaysAgo: 95 },
    { accountName: "Viettel Telecom", title: "Viettel — GreenLake Phase 2", value: 22_000_000_000, stage: "closed_won", vendor: "HPE", productLine: "cloud", probability: 100, expectedCloseDays: -55, winReason: winReasons[2], createdDaysAgo: 180 },
    { accountName: "Vinamilk", title: "Vinamilk — ProLiant DL380 refresh Bình Dương", value: 4_500_000_000, stage: "closed_won", vendor: "HPE", productLine: "server", probability: 100, expectedCloseDays: -25, winReason: winReasons[5], createdDaysAgo: 110, competitorName: "Lenovo ISG" },
    { accountName: "Vingroup", title: "Vingroup — Sentinel SIEM rollout", value: 6_800_000_000, stage: "closed_won", vendor: "Microsoft", productLine: "security", probability: 100, expectedCloseDays: -40, winReason: winReasons[4], createdDaysAgo: 140 },
    { accountName: "FPT Telecom", title: "FPT — NGFW datacenter Q3/2025", value: 5_200_000_000, stage: "closed_won", vendor: "Palo Alto", productLine: "security", probability: 100, expectedCloseDays: -85, winReason: winReasons[3], createdDaysAgo: 180 },
    { accountName: "Hệ thống Y tế Vinmec", title: "Vinmec — PA-5450 Hanoi campus", value: 3_800_000_000, stage: "closed_won", vendor: "Palo Alto", productLine: "security", probability: 100, expectedCloseDays: -15, winReason: winReasons[7], createdDaysAgo: 95 },
    { accountName: "Techcombank", title: "Techcombank — M365 E5 renewal 12000 seats", value: 4_100_000_000, stage: "closed_won", vendor: "Microsoft", productLine: "software", probability: 100, expectedCloseDays: -60, winReason: winReasons[0], createdDaysAgo: 160 },

    // Closed LOST
    { accountName: "THACO", title: "THACO — Factory server refresh Q4/2025", value: 4_800_000_000, stage: "closed_lost", vendor: "HPE", productLine: "server", probability: 0, expectedCloseDays: -30, lossReason: lossReasons[0], competitorName: "Lenovo ISG", createdDaysAgo: 125 },
    { accountName: "AEON Việt Nam", title: "AEON — NGFW refresh 45 stores", value: 3_200_000_000, stage: "closed_lost", vendor: "Palo Alto", productLine: "security", probability: 0, expectedCloseDays: -45, lossReason: lossReasons[1], competitorName: "Fortinet", createdDaysAgo: 140 },
    { accountName: "FPT Retail", title: "FPT Retail — Security budget Q4/2025", value: 1_800_000_000, stage: "closed_lost", vendor: "CrowdStrike", productLine: "security", probability: 0, expectedCloseDays: -25, lossReason: lossReasons[2], createdDaysAgo: 90 },
    { accountName: "Hệ thống Y tế Vinmec", title: "Vinmec — NAS expansion Hà Nội", value: 2_200_000_000, stage: "closed_lost", vendor: "Dell", productLine: "storage", probability: 0, expectedCloseDays: -50, lossReason: lossReasons[4], competitorName: "NetApp", createdDaysAgo: 135 },
    { accountName: "Bệnh viện Bạch Mai", title: "Bạch Mai — Storage refresh Q3/2025", value: 1_500_000_000, stage: "closed_lost", vendor: "HPE", productLine: "storage", probability: 0, expectedCloseDays: -90, lossReason: lossReasons[6], createdDaysAgo: 200 },
    { accountName: "ĐH Quốc Gia TP.HCM", title: "VNU-HCMC — Campus networking", value: 4_200_000_000, stage: "closed_lost", vendor: "HPE", productLine: "networking", probability: 0, expectedCloseDays: -40, lossReason: lossReasons[3], competitorName: "Cisco Systems", createdDaysAgo: 130 },
    { accountName: "Tập đoàn Masan", title: "Masan — Endpoint protection 15000 users", value: 2_100_000_000, stage: "closed_lost", vendor: "CrowdStrike", productLine: "security", probability: 0, expectedCloseDays: -55, lossReason: lossReasons[5], competitorName: "SentinelOne", createdDaysAgo: 150 },
  ];

  const createdDeals: { id: string; title: string; accountId: string; accountName: string; stage: string; vendor: string }[] = [];
  for (const d of dealSpecs) {
    const account = accounts.find((a) => a.name === d.accountName);
    if (!account) continue;
    const competitor = d.competitorName ? competitorsCreated.find((c) => c.name === d.competitorName) : null;

    const deal = await prisma.deal.create({
      data: {
        title: d.title,
        value: d.value,
        stage: d.stage,
        probability: d.probability,
        expectedClose: daysFromNow(d.expectedCloseDays),
        vendor: d.vendor,
        productLine: d.productLine,
        winReason: d.winReason ?? null,
        lossReason: d.lossReason ?? null,
        competitorId: competitor?.id ?? null,
        accountId: account.id,
        ownerId: jimmy.id,
        createdAt: daysAgo(d.createdDaysAgo),
      },
    });
    createdDeals.push({ id: deal.id, title: deal.title, accountId: account.id, accountName: d.accountName, stage: d.stage, vendor: d.vendor });
  }

  // ============ Activities (per deal + per account) ============
  console.log("[seed] seeding activities");
  for (const deal of createdDeals) {
    const isOpen = openStages.includes(deal.stage);
    const openActivities = [
      { type: "meeting", subject: `Kickoff với ${deal.accountName}`, content: `Họp intro, đã present ${deal.vendor} solution overview. Team khách hàng gồm CTO + Security Lead.`, completed: true, daysOffset: -25 },
      { type: "email", subject: `Gửi ${deal.vendor} datasheet + case study`, content: `Đã gửi proposal draft v1, datasheet chi tiết, và case study tham khảo từ Techcombank.`, completed: true, daysOffset: -18 },
      { type: "call", subject: "Call clarification requirements", content: `Discuss sizing, integration với existing stack. Khách hỏi về SLA + MTTR.`, completed: true, daysOffset: -10 },
      { type: "follow_up", subject: "Follow-up pricing discussion", content: `Call với Procurement để discuss volume discount, payment terms.`, completed: false, daysOffset: 3 },
      { type: "note", subject: "Next steps", content: `Đang chờ khách phản hồi BAFO. Target close cuối tháng.`, completed: false, daysOffset: -2 },
    ];
    const closedActivities = [
      { type: "meeting", subject: `Closing meeting ${deal.accountName}`, content: `Final discussion. ${deal.stage === "closed_won" ? "Signed PO, kickoff delivery." : "Competitor thắng, ghi nhận lesson learned."}`, completed: true, daysOffset: -1 },
    ];
    const activities = isOpen ? openActivities : closedActivities;
    for (const a of activities) {
      await prisma.activity.create({
        data: {
          type: a.type,
          subject: a.subject,
          content: a.content,
          completed: a.completed,
          dueDate: a.completed ? null : daysFromNow(a.daysOffset),
          dealId: deal.id,
          accountId: deal.accountId,
          ownerId: jimmy.id,
          createdAt: a.completed ? daysAgo(-a.daysOffset) : daysAgo(1),
        },
      });
    }
  }

  // ============ CRM Insights ============
  console.log("[seed] seeding CRM insights");
  const insightSpecs = [
    { accountName: "Vietcombank", type: "next_action", priority: "high", content: "Propose executive dinner với CIO Nguyễn Thanh Tùng — deal NGFW đang ở proposal stage 30 ngày, cần unlock." },
    { accountName: "BIDV", type: "risk_alert", priority: "high", content: "Check Point competitor đã offer đánh giá miễn phí 30 ngày. Cần follow-up với Vũ Thị Thu trong tuần này." },
    { accountName: "Techcombank", type: "opportunity", priority: "high", content: "DC Bình Dương đang expand. Sau khi win storage, có thể up-sell HPE networking + Aruba." },
    { accountName: "Viettel Telecom", type: "opportunity", priority: "high", content: "GreenLake Phase 3 close → opportunity cho CrowdStrike cross-sell (40k endpoints). Budget FY26 Q3." },
    { accountName: "VPBank", type: "next_action", priority: "medium", content: "Đã 14 ngày không có response. Call Bùi Minh Tuấn để check procurement status." },
    { accountName: "Hòa Phát Group", type: "risk_alert", priority: "medium", content: "Budget chưa confirm. Qualify lại Q2 FY26 budget trước khi đầu tư thêm sales cycle." },
    { accountName: "FPT Retail", type: "risk_alert", priority: "high", content: "Account health 42 (at_risk). Doanh thu khách hàng giảm → pipeline bị de-prioritize. Cần executive re-engagement." },
    { accountName: "Saigon Co.op", type: "next_action", priority: "medium", content: "Fortinet đang aggressive với BOGO. Cần offer counter — PA 3410 bundle với Cortex XDR pricing đặc biệt." },
    { accountName: "Vinmec", type: "opportunity", priority: "high", content: "Sau khi win PACS storage, propose expansion sang Cybersecurity (PA + CrowdStrike) cho clinical systems." },
    { accountName: "Vingroup", type: "opportunity", priority: "medium", content: "M365 E5 đang close → upsell Sentinel SIEM + Defender XDR cho VinFast + Vinhomes IT consolidation." },
    { accountName: "VietJet Air", type: "next_action", priority: "medium", content: "Propose Azure Well-Architected Review miễn phí để accelerate đàm phán Azure subscription." },
    { accountName: "ĐH Bách Khoa Hà Nội", type: "opportunity", priority: "medium", content: "HPC cluster phase 1 close → phase 2 (storage cho datasets) có thể kick-off Q3/2026." },
  ];
  for (const ins of insightSpecs) {
    const acc = accounts.find((a) => a.name === ins.accountName);
    if (!acc) continue;
    await prisma.cRMInsight.create({
      data: {
        accountId: acc.id,
        type: ins.type,
        priority: ins.priority,
        content: ins.content,
        status: "pending",
        generatedAt: daysAgo(Math.floor(hash01(ins.content) * 7)),
      },
    });
  }

  // ============ Meetings + action items ============
  console.log("[seed] seeding meetings");
  const meetingSpecs = [
    {
      accountName: "Vietcombank",
      title: "Vietcombank — Technical deep dive storage",
      attendees: "Jimmy Nguyen, Trần Minh Đức (Head of Infra VCB), Nguyễn Thanh Tùng (CIO VCB)",
      daysAgo: 10,
      rawNotes: "Họp 2 tiếng tại VCB Tower. Thảo luận technical requirements cho core banking storage refresh. Yêu cầu: sub-ms latency, 99.9999% availability, NVMe end-to-end, khả năng scale tới 2PB. Đức cảnh giác về migration risk vì core banking zero-downtime. Tùng quan tâm đến TCO 5-year và khả năng integrate với existing Oracle RAC. HSI đề xuất HPE Alletra 9060 với InfoSight AI predictive. Action: gửi detailed TCO analysis trước thứ 6, schedule workshop với HPE ANZ SE team.",
      summary: "Tóm tắt: VCB cần all-flash tier-1 storage cho core banking refresh (scope 2PB, 5 năm). Ưu tiên latency + HA + Oracle RAC compat. HSI đề xuất Alletra 9060. Next: TCO analysis + workshop HPE SE.",
      actionItems: [
        { content: "Gửi TCO analysis 5 năm so sánh Alletra 9060 vs IBM FS9500 vs NetApp AFF", assignee: "Jimmy Nguyen", daysOffset: 4, status: "pending" },
        { content: "Schedule technical workshop với HPE ANZ SE team", assignee: "Jimmy Nguyen", daysOffset: 7, status: "pending" },
        { content: "Share Oracle RAC on Alletra reference story từ Techcombank", assignee: "Jimmy Nguyen", daysOffset: 3, status: "done" },
      ],
    },
    {
      accountName: "BIDV",
      title: "BIDV — RFP Security stack kickoff",
      attendees: "Jimmy Nguyen, Phạm Văn Hải (CTO BIDV), Vũ Thị Thu (Security Arch BIDV), Lê Bá Phước (HSI PM)",
      daysAgo: 14,
      rawNotes: "BIDV RFP scope: NGFW refresh 4 DC + 120 branch offices, EDR cho 8000 endpoints, SIEM expansion. Deadline submission 6 tuần. Thu cẩn thận chất vấn về integration Palo Alto với existing Splunk SIEM. Hải hỏi về Professional Services capacity của HSI. Check Point incumbent ở 2 DC — họ đang defend. Fortinet có proposal parallel. HSI cần differentiate bằng threat prevention score + Cortex XDR integrated. Phước commit deliver proposal draft 2 tuần nữa.",
      summary: "BIDV RFP security stack: NGFW + EDR + SIEM. Competitor: Check Point (incumbent) + Fortinet. Deadline 6 tuần. HSI differentiation: PA-5450 + Cortex XDR integrated + PS capacity.",
      actionItems: [
        { content: "Assemble RFP response team: PA pre-sales + CrowdStrike SE + HSI PS lead", assignee: "Jimmy Nguyen", daysOffset: 2, status: "done" },
        { content: "Draft technical response cho 45 requirements trong RFP", assignee: "Lê Bá Phước", daysOffset: 10, status: "in_progress" },
        { content: "Book workshop với BIDV Security team về Cortex XDR", assignee: "Vũ Thị Thu", daysOffset: 6, status: "pending" },
      ],
    },
    {
      accountName: "Techcombank",
      title: "Techcombank — Final pricing negotiation DC Bình Dương",
      attendees: "Jimmy Nguyen, Đỗ Quốc Anh (CIO TCB), Phạm Thu Hà (Procurement TCB)",
      daysAgo: 3,
      rawNotes: "Closing call. Đỗ Quốc Anh confirm commercial direction với HPE. Procurement Hà push-back trên pricing: yêu cầu 15% discount thêm trên list. HSI đã offer 22% partner margin sharing. Đề xuất bundle: thêm 3-year 24/7 support + on-site engineer 2 ngày/tuần trong 6 tháng đầu. Anh OK với bundle, waiting for formal BAFO. Target sign PO cuối tháng này. Post-sign: kickoff delivery trong 2 tuần.",
      summary: "TCB DC Bình Dương ở negotiation final. HSI offer: pricing + bundle 3y support + on-site engineer. Target sign PO cuối tháng.",
      actionItems: [
        { content: "Gửi BAFO formal với pricing final + bundled services", assignee: "Jimmy Nguyen", daysOffset: 2, status: "in_progress" },
        { content: "Prepare kickoff deck cho delivery phase", assignee: "Trần Hữu Quản", daysOffset: 15, status: "pending" },
      ],
    },
    {
      accountName: "Viettel Telecom",
      title: "Viettel — GreenLake Phase 3 scoping workshop",
      attendees: "Jimmy Nguyen, Đinh Quốc Trung (Deputy CTO Viettel), Lý Thị Ngọc (Procurement), HPE ANZ team",
      daysAgo: 18,
      rawNotes: "Workshop 1 ngày tại Viettel HQ. Phase 3 scope: expand từ Hanoi DC sang HCMC DC + Hanoi DR site. Target consumption model — Viettel Cloud cần scale linear theo tenant demand. HPE đề xuất GreenLake Block Storage + Compute metered services. Trung nhấn mạnh về data sovereignty và audit requirements cho gov tenants. Ngọc raise question về pricing predictability — GreenLake có spike cost khi usage cao. HPE confirm có cap options. Next: formal GreenLake design document + pricing model 3 kịch bản (base/peak/overflow).",
      summary: "Viettel GreenLake Phase 3 scoping: HCMC DC + Hanoi DR. Consumption-based, data sovereignty required. HSI + HPE commit GL design doc + pricing scenarios.",
      actionItems: [
        { content: "Deliver GreenLake design document v1", assignee: "HPE ANZ", daysOffset: 14, status: "in_progress" },
        { content: "Pricing model 3 kịch bản (base/peak/overflow)", assignee: "Jimmy Nguyen", daysOffset: 10, status: "in_progress" },
        { content: "Compliance review: data sovereignty + audit trails documentation", assignee: "Lý Thị Ngọc", daysOffset: 21, status: "pending" },
      ],
    },
    {
      accountName: "Vinamilk",
      title: "Vinamilk — Factory IT assessment Bình Dương",
      attendees: "Jimmy Nguyen, Trịnh Quốc Dũng (CIO Vinamilk), Nguyễn Văn Thiện (Plant IT Lead)",
      daysAgo: 22,
      rawNotes: "Site visit nhà máy mới Bình Dương, 40,000 m2. Thiện dẫn tour server room: hiện 12 rack, plan expand 20 rack sau 2 năm. Dũng chia sẻ budget Q2/Q3 approved cho SAP on HANA refresh + factory automation tích hợp. HSI propose HPE ProLiant DL380 Gen11 24 nodes + Alletra 6030 storage. Lenovo đang propose SR650 V3 giá thấp hơn 18%. Dũng nhấn mạnh: support mạng lưới quan trọng hơn giá — nhà máy ở tỉnh, cần SE on-site trong 4h.",
      summary: "Vinamilk factory Bình Dương 24 compute nodes + all-flash storage. Budget approved. Lenovo giá thấp hơn 18% nhưng HSI thắng nhờ SE on-site support.",
      actionItems: [
        { content: "Confirm SE on-site SLA 4h trong proposal formal", assignee: "Jimmy Nguyen", daysOffset: 5, status: "done" },
        { content: "Prepare Lenovo counter-positioning với TCO + support network", assignee: "Jimmy Nguyen", daysOffset: 8, status: "done" },
        { content: "Factory kickoff call sau sign PO", assignee: "Trần Hữu Quản", daysOffset: 25, status: "pending" },
      ],
    },
    {
      accountName: "VPBank",
      title: "VPBank — Hybrid cloud architecture review",
      attendees: "Jimmy Nguyen, Bùi Minh Tuấn (Head of Digital), Ngô Thị Lan (Cloud Architect), Microsoft team",
      daysAgo: 8,
      rawNotes: "Review session về hybrid architecture. VPBank đang đánh giá Azure Stack HCI cho private workload + Azure public cho customer-facing apps. Ngô Thị Lan quan tâm identity federation giữa Azure AD và on-prem AD. Bùi Minh Tuấn hỏi chi phí predictability — VPBank burned bởi AWS spike bill năm ngoái. HSI + Microsoft propose Azure Enterprise Agreement với capped commitment + Azure Hybrid Benefit để tận dụng licenses hiện có. Lan request security assessment từ Microsoft Sentinel team trước khi rollout.",
      summary: "VPBank hybrid: Azure Stack HCI + Azure public. Concern: cost predictability + identity federation. Next: EA + Hybrid Benefit + Sentinel security review.",
      actionItems: [
        { content: "Schedule Sentinel security assessment với Microsoft team", assignee: "Jimmy Nguyen", daysOffset: 7, status: "pending" },
        { content: "EA proposal với capped commitment tiers", assignee: "Microsoft", daysOffset: 12, status: "in_progress" },
      ],
    },
    {
      accountName: "Hệ thống Y tế Vinmec",
      title: "Vinmec — PACS expansion kickoff Cần Thơ",
      attendees: "Jimmy Nguyen, Lê Anh Quân (CIO Vinmec), Trần Bảo Linh (Clinical Systems)",
      daysAgo: 5,
      rawNotes: "Kickoff expand PACS storage Cần Thơ + Đà Nẵng. Quân confirm cần 400TB usable Cần Thơ, 300TB Đà Nẵng. HSI đề xuất HPE Alletra 6030 với dedup + compression. Linh nhấn mạnh về HIPAA-equivalent compliance, audit log toàn bộ access. NetApp đang là incumbent ở Hanoi — họ đang pitch giữ consistent. HSI counter với TCO 5-year thấp hơn 23% + InfoSight AI predictive. Target go-live Q3/2026.",
      summary: "Vinmec PACS expansion Cần Thơ + Đà Nẵng 700TB. HPE Alletra 6030 win vs NetApp nhờ TCO + InfoSight. Go-live Q3/2026.",
      actionItems: [
        { content: "Deliver compliance documentation (audit + HIPAA-equivalent)", assignee: "Jimmy Nguyen", daysOffset: 14, status: "in_progress" },
        { content: "Site survey 2 bệnh viện — Cần Thơ + Đà Nẵng", assignee: "Trần Hữu Quản", daysOffset: 20, status: "pending" },
      ],
    },
  ];

  for (const m of meetingSpecs) {
    const acc = accounts.find((a) => a.name === m.accountName);
    const deal = createdDeals.find((d) => d.accountName === m.accountName && openStages.includes(d.stage));
    const meeting = await prisma.meeting.create({
      data: {
        title: m.title,
        date: daysAgo(m.daysAgo),
        attendees: m.attendees,
        rawNotes: m.rawNotes,
        aiSummary: m.summary,
        accountId: acc?.id ?? null,
        dealId: deal?.id ?? null,
        ownerId: jimmy.id,
        createdAt: daysAgo(m.daysAgo),
      },
    });
    for (const ai of m.actionItems) {
      await prisma.actionItem.create({
        data: {
          content: ai.content,
          assignee: ai.assignee,
          dueDate: daysFromNow(ai.daysOffset),
          status: ai.status,
          meetingId: meeting.id,
        },
      });
    }
  }

  // ============ Proposals ============
  console.log("[seed] seeding proposals");
  const proposalSpecs = [
    {
      accountName: "BIDV",
      title: "BIDV — Security Stack Proposal v1",
      status: "ready",
      language: "vi",
      inputs: {
        clientName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
        industry: "Banking & Finance",
        requirements: "NGFW refresh 4 DC + 120 branches, EDR 8000 endpoints, SIEM expansion.",
        valueProps: "Integrated Palo Alto NGFW + Cortex XDR + CrowdStrike Falcon Complete. 24/7 MDR.",
        timeline: "12 tháng: Q2 NGFW, Q3 EDR, Q4 SIEM integration.",
        budget: "15 tỷ VND (capex + 3y support).",
        vendors: ["Palo Alto", "CrowdStrike"],
      },
      sections: [
        { heading: "Tóm tắt điều hành", body: "Đề xuất bộ security stack tích hợp cho BIDV với Palo Alto NGFW (datacenter core + branch) + CrowdStrike Falcon Complete (MDR 24/7) + tích hợp SIEM hiện có. Tổng giá trị đầu tư 15 tỷ VND, ROI 24 tháng." },
        { heading: "Thách thức hiện tại", body: "BIDV đang vận hành security stack phân mảnh: Check Point NGFW (2 DC), Trend Micro endpoint (phần), Splunk SIEM. Các công cụ thiếu tích hợp → mean time to detect/respond cao. Ngoài ra yêu cầu compliance mới (Circular 09) yêu cầu audit trail đầy đủ." },
        { heading: "Giải pháp đề xuất", body: "1. Palo Alto PA-5450 cluster tại 4 DC (core + DR) + PA-3410 tại 120 branch. 2. CrowdStrike Falcon Complete cho 8000 endpoints với 24/7 MDR. 3. Cortex XDR làm data lake tích hợp network + endpoint + cloud, feed vào Splunk SIEM hiện có." },
        { heading: "Triển khai", body: "Phase 1 (Q2): DC core PA-5450. Phase 2 (Q3): Branch PA-3410 + EDR rollout wave 1. Phase 3 (Q4): EDR wave 2 + Cortex XDR integration. Ongoing: 24/7 MDR service go-live Q3." },
        { heading: "Đầu tư & ROI", body: "CapEx: 12 tỷ (hardware + licenses 3 năm). OpEx: 1 tỷ/năm (MDR service). ROI: giảm 45% MTTR, giảm 60% security incidents sau 12 tháng, avoid 1 major incident (~ 5 tỷ loss)." },
      ],
      daysAgo: 12,
    },
    {
      accountName: "Vietcombank",
      title: "Vietcombank — Core Banking Storage Refresh",
      status: "sent",
      language: "vi",
      inputs: {
        clientName: "Vietcombank",
        industry: "Banking & Finance",
        requirements: "All-flash tier-1 storage, 2PB usable, sub-ms latency, Oracle RAC compat.",
        valueProps: "HPE Alletra 9060 — 6-nines SLA + InfoSight AI.",
        timeline: "6 tháng triển khai.",
        budget: "4.5 tỷ VND.",
        vendors: ["HPE"],
      },
      sections: [
        { heading: "Executive Summary", body: "Đề xuất HPE Alletra 9060 cho core banking storage refresh tại VCB Hoàn Kiếm DC. 2PB usable, sub-ms latency, 100% availability guarantee." },
        { heading: "Why Alletra 9060", body: "Alletra 9060 là tier-1 NVMe all-flash với architecture active-active cross-site, sub-100µs latency P99.99. InfoSight AI predictive analytics giảm 85% support tickets. Native Oracle RAC certified." },
        { heading: "Migration Plan", body: "Zero-downtime migration qua 3 wave: non-prod → staging → prod. Sử dụng Oracle ASM mirror + HPE migration services. Tổng downtime < 2h rolling." },
      ],
      daysAgo: 8,
    },
    {
      accountName: "Viettel Telecom",
      title: "Viettel GreenLake Phase 3 — Consumption Design",
      status: "draft",
      language: "vi",
      inputs: {
        clientName: "Viettel Telecom",
        industry: "Telco",
        requirements: "GreenLake expansion HCMC DC + Hanoi DR. Consumption-based compute + storage.",
        valueProps: "Linear scaling, OPEX model, Viettel Cloud tenant-aware.",
        timeline: "Design 4 tuần, deployment 3 tháng.",
        vendors: ["HPE"],
      },
      sections: [
        { heading: "Overview", body: "Mở rộng GreenLake của Viettel sang HCMC DC + Hanoi DR, total capacity 50 node compute + 800TB all-flash." },
      ],
      daysAgo: 3,
    },
    {
      accountName: "Hệ thống Y tế Vinmec",
      title: "Vinmec — PACS Storage Expansion Proposal",
      status: "accepted",
      language: "vi",
      inputs: {
        clientName: "Hệ thống Y tế Vinmec",
        industry: "Healthcare",
        requirements: "PACS storage expansion 700TB total (Cần Thơ 400TB + Đà Nẵng 300TB).",
        valueProps: "HPE Alletra 6030 + InfoSight + dedup ratio 4:1.",
        timeline: "Q3/2026 go-live.",
        budget: "5.8 tỷ VND.",
        vendors: ["HPE"],
      },
      sections: [
        { heading: "Tóm tắt", body: "Đề xuất 2 cụm HPE Alletra 6030 tại Cần Thơ và Đà Nẵng phục vụ PACS expansion của Vinmec." },
        { heading: "Giải pháp", body: "Alletra 6030 all-flash NVMe, dedup + compression mặc định 4:1 → 700TB effective với 200TB raw. HIPAA-equivalent compliance qua InfoSight audit." },
      ],
      daysAgo: 25,
    },
  ];

  for (const p of proposalSpecs) {
    const acc = accounts.find((a) => a.name === p.accountName);
    const deal = createdDeals.find((d) => d.accountName === p.accountName && openStages.includes(d.stage));
    await prisma.proposal.create({
      data: {
        title: p.title,
        status: p.status,
        language: p.language,
        sections: p.sections.map((s, idx) => ({ id: `sec_${idx}`, heading: s.heading, body: s.body, order: idx })) as Prisma.InputJsonValue,
        inputs: p.inputs as unknown as Prisma.InputJsonValue,
        accountId: acc?.id ?? null,
        dealId: deal?.id ?? null,
        ownerId: jimmy.id,
        createdAt: daysAgo(p.daysAgo),
      },
    });
  }

  // ============ Quotations ============
  console.log("[seed] seeding quotations");
  const qtSpecs = [
    {
      accountName: "BIDV",
      number: "QT-2026-0001",
      title: "BIDV — PA-5450 Datacenter NGFW",
      items: [
        { id: "i1", name: "Palo Alto PA-5450", description: "Next-gen firewall 72Gbps threat prevention", vendor: "Palo Alto", qty: 4, unitPrice: 2_100_000_000, discount: 12, lineTotal: 7_392_000_000 },
        { id: "i2", name: "PA-5450 Support 3Y", description: "3-year 24x7 support + software subscription", vendor: "Palo Alto", qty: 4, unitPrice: 420_000_000, discount: 10, lineTotal: 1_512_000_000 },
        { id: "i3", name: "HSI Professional Services", description: "Design + deployment + knowledge transfer 4 DC", vendor: "HSI", qty: 1, unitPrice: 850_000_000, discount: 0, lineTotal: 850_000_000 },
      ],
      subtotal: 9_754_000_000,
      discount: 0,
      tax: 10,
      total: 10_729_400_000,
      status: "sent",
      daysAgo: 10,
    },
    {
      accountName: "Techcombank",
      number: "QT-2026-0002",
      title: "Techcombank — DC Bình Dương Compute + Storage",
      items: [
        { id: "i1", name: "HPE ProLiant DL380 Gen11", description: "2U rack server 2x Xeon Gen4", vendor: "HPE", qty: 40, unitPrice: 280_000_000, discount: 18, lineTotal: 9_184_000_000 },
        { id: "i2", name: "HPE Alletra 6030", description: "All-flash NVMe storage 200TB raw", vendor: "HPE", qty: 2, unitPrice: 1_450_000_000, discount: 15, lineTotal: 2_465_000_000 },
        { id: "i3", name: "Aruba CX 8325 Switch", description: "48x25G + 8x100G QSFP28", vendor: "HPE", qty: 8, unitPrice: 420_000_000, discount: 15, lineTotal: 2_856_000_000 },
        { id: "i4", name: "HSI Professional Services", description: "Racking, cabling, OS install, VMware cluster", vendor: "HSI", qty: 1, unitPrice: 1_200_000_000, discount: 0, lineTotal: 1_200_000_000 },
      ],
      subtotal: 15_705_000_000,
      discount: 0,
      tax: 10,
      total: 17_275_500_000,
      status: "accepted",
      daysAgo: 5,
    },
    {
      accountName: "Vinamilk",
      number: "QT-2026-0003",
      title: "Vinamilk — Factory Bình Dương Server Refresh",
      items: [
        { id: "i1", name: "HPE ProLiant DL380 Gen11", description: "Factory compute", vendor: "HPE", qty: 24, unitPrice: 280_000_000, discount: 16, lineTotal: 5_644_800_000 },
        { id: "i2", name: "HPE MSA 2062 Storage", description: "Entry hybrid flash", vendor: "HPE", qty: 2, unitPrice: 380_000_000, discount: 12, lineTotal: 668_800_000 },
      ],
      subtotal: 6_313_600_000,
      discount: 2,
      tax: 10,
      total: 6_807_961_000,
      status: "draft",
      daysAgo: 2,
    },
  ];

  for (const q of qtSpecs) {
    const acc = accounts.find((a) => a.name === q.accountName);
    const deal = createdDeals.find((d) => d.accountName === q.accountName);
    await prisma.quotation.create({
      data: {
        number: q.number,
        title: q.title,
        accountId: acc?.id ?? null,
        dealId: deal?.id ?? null,
        currency: "VND",
        items: q.items as unknown as Prisma.InputJsonValue,
        subtotal: q.subtotal,
        discount: q.discount,
        tax: q.tax,
        total: q.total,
        status: q.status,
        validUntil: daysFromNow(30),
        ownerId: jimmy.id,
        createdAt: daysAgo(q.daysAgo),
      },
    });
  }

  // ============ RFP sample ============
  console.log("[seed] seeding RFPs");
  const rfpReqs = [
    { id: "req_1", category: "security", priority: "must" as const, text: "Giải pháp NGFW phải hỗ trợ throughput tối thiểu 60 Gbps threat-prevention với SSL decryption bật.", response: "PA-5450 đáp ứng 72 Gbps threat-prevention với SSL decryption bật. Vượt yêu cầu 20%.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_2", category: "security", priority: "must" as const, text: "EDR platform phải có MITRE ATT&CK detection coverage ≥ 90%.", response: "CrowdStrike Falcon đạt 96% MITRE ATT&CK evaluation 2024 — leader top 1.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_3", category: "technical", priority: "must" as const, text: "Hệ thống phải active-active cross-DC với RPO = 0, RTO ≤ 5 phút.", response: "HA design: PA-5450 HA Pair tại mỗi DC + GlobalProtect Cloud cho fail-over. RPO 0 (session sync), RTO < 60s.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_4", category: "commercial", priority: "must" as const, text: "Vendor phải commit SLA support 24x7 với response time ≤ 1h cho severity 1.", response: "Palo Alto Premium Support 24x7x365 + HSI onsite engineer tại Hà Nội + HCMC đáp ứng response < 1h.", status: "drafted" as const, confidence: "medium" as const },
    { id: "req_5", category: "compliance", priority: "must" as const, text: "Giải pháp phải đáp ứng Thông tư 09/2020/TT-NHNN về bảo đảm an toàn hệ thống thông tin ngân hàng.", response: "Cần team legal verify.", status: "pending" as const, confidence: "low" as const },
    { id: "req_6", category: "technical", priority: "should" as const, text: "Tích hợp native với Splunk Enterprise (version 9.x).", response: "Palo Alto App for Splunk 6.x hỗ trợ Splunk 9.x native, pre-built dashboards + alerting.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_7", category: "support", priority: "should" as const, text: "Training onsite cho 20 engineers trong vòng 3 tháng đầu sau go-live.", response: "HSI commit 4 training batches, mỗi batch 5 engineers, tổ chức tại BIDV Tower Hà Nội.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_8", category: "functional", priority: "nice" as const, text: "Hỗ trợ tiếng Việt trong management UI.", response: "PA Panorama UI hiện support 8 ngôn ngữ (chưa có tiếng Việt). Sẽ raise request với PA PM.", status: "drafted" as const, confidence: "low" as const },
    { id: "req_9", category: "timeline", priority: "must" as const, text: "Go-live tại DC core trong vòng 90 ngày từ sign PO.", response: "Timeline 90 ngày achievable: 30 ngày procurement + 30 ngày deployment + 20 ngày testing + 10 ngày buffer.", status: "drafted" as const, confidence: "medium" as const },
    { id: "req_10", category: "commercial", priority: "should" as const, text: "Vendor có chứng nhận partner Gold/Platinum từ Palo Alto + CrowdStrike.", response: "HSI là Palo Alto Diamond Innovator (top tier) + CrowdStrike Elite Partner.", status: "drafted" as const, confidence: "high" as const },
    { id: "req_11", category: "other", priority: "nice" as const, text: "Số lượng reference case tại ngân hàng Việt Nam.", response: "", status: "pending" as const, confidence: "low" as const },
    { id: "req_12", category: "technical", priority: "must" as const, text: "SIEM integration phải hỗ trợ ≥ 1000 events/second sustained.", response: "Cortex XDR ingest tối đa 50k eps, Splunk indexer cluster BIDV hiện đáp ứng 1500 eps — headroom đủ.", status: "drafted" as const, confidence: "high" as const },
  ];

  await prisma.rFPResponse.create({
    data: {
      title: "BIDV RFP Security Stack 2026 — Response",
      clientName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
      deadline: daysFromNow(28),
      rawContent: `RFP-BIDV-IT-SEC-2026-001\n\nDự án: Cung cấp hệ thống bảo mật mạng + endpoint detection cho BIDV\n\nPhạm vi:\n- NGFW refresh: 4 Data Center + 120 branch offices\n- EDR: 8,000 endpoints\n- SIEM integration: tích hợp với Splunk hiện tại\n\nYêu cầu (trích):\n1. Giải pháp NGFW phải hỗ trợ throughput tối thiểu 60 Gbps threat-prevention với SSL decryption bật.\n2. EDR platform phải có MITRE ATT&CK detection coverage ≥ 90%.\n3. Hệ thống phải active-active cross-DC với RPO = 0, RTO ≤ 5 phút.\n4. Vendor phải commit SLA support 24x7 với response time ≤ 1h cho severity 1.\n5. Giải pháp phải đáp ứng Thông tư 09/2020/TT-NHNN về bảo đảm an toàn hệ thống thông tin ngân hàng.\n...\n\nDeadline nộp hồ sơ: 28 ngày kể từ ngày phát hành.`,
      requirements: rfpReqs as unknown as Prisma.InputJsonValue,
      status: "in_progress",
      accountId: accounts.find((a) => a.name === "BIDV")?.id ?? null,
      userId: jimmy.id,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
    },
  });

  // ============ Chat sessions (Knowledge Bot) ============
  console.log("[seed] seeding chat sessions");
  await prisma.chatSession.create({
    data: {
      userId: jimmy.id,
      title: "So sánh PA-5450 vs FortiGate 600F",
      messages: [
        { role: "user", content: "So sánh Palo Alto PA-5450 và Fortinet FortiGate 600F cho doanh nghiệp vừa", createdAt: daysAgo(3).toISOString() },
        {
          role: "assistant",
          content:
            "## So sánh PA-5450 vs FortiGate 600F\n\n**PA-5450** (list: 2.1 tỷ VND) — datacenter-class NGFW 72 Gbps threat-prevention, Panorama centralized management, Cortex XDR native integration. Mạnh: threat intelligence (Unit 42), SSL decryption performance, application identification chính xác nhất thị trường.\n\n**FortiGate 600F** (list: 520 triệu VND) — 36 Gbps threat-prevention, Security Fabric single-pane, ASIC-accelerated. Mạnh: giá rẻ hơn ~75%, TCO thấp, branch deployment dễ.\n\n**Khuyến nghị cho DN vừa:**\n- Nếu traffic < 10Gbps và budget sensitive → FortiGate 600F đủ dùng, TCO hấp dẫn.\n- Nếu có compliance nặng (banking, gov) hoặc đã invest Splunk/XDR → PA-5450 lợi ích tích hợp tốt hơn.\n- Mixed DC + branch: PA-3410 cho DC + FortiGate branch cũng là pattern phổ biến nhưng HSI không khuyến khích vì 2 management plane.\n\n*Note: HSI là Palo Alto Diamond Innovator nên strongly recommend PA stack cho coherence.*",
          createdAt: daysAgo(3).toISOString(),
          citations: [
            { type: "product", id: "pa-5450", label: "PA-5450" },
            { type: "product", id: "fg-600f", label: "FortiGate 600F" },
          ],
        },
      ] as unknown as Prisma.InputJsonValue,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
  });

  await prisma.chatSession.create({
    data: {
      userId: jimmy.id,
      title: "HPE Alletra 6000 vs Dell PowerStore",
      messages: [
        { role: "user", content: "HPE Alletra 6000 có gì nổi bật so với Dell PowerStore?", createdAt: daysAgo(1).toISOString() },
        {
          role: "assistant",
          content:
            "## HPE Alletra 6030 vs Dell PowerStore 500T\n\n### Điểm mạnh Alletra 6030\n1. **InfoSight AI predictive** — giảm 85% support tickets, dự báo lỗi trước khi xảy ra. PowerStore có CloudIQ nhưng chưa reach maturity đó.\n2. **100% availability guarantee** (uptime SLA) — HPE có commitment bằng contract.\n3. **All-NVMe end-to-end** từ day 1, dedup/compression 4:1 điển hình.\n4. **Global deduplication** cross-array — PowerStore dedup per-array.\n\n### Điểm mạnh PowerStore 500T\n1. **AppsON** — chạy VM native trên storage controllers, giảm 1 tier infra.\n2. **Tích hợp tốt với VxRail + VMware stack** — nếu khách hàng VMware-heavy.\n3. **Anytime Upgrades** — thay controller không downtime.\n\n### Chọn Alletra nếu:\n- Banking/healthcare cần 6-nines availability.\n- Đã có HPE ProLiant compute → consistent support.\n\n### Chọn PowerStore nếu:\n- VMware-heavy stack + AppsON giảm được VM server count.\n- Budget sensitive hơn (PowerStore 500T thường ~15% rẻ hơn Alletra 6030 cùng dung lượng).",
          createdAt: daysAgo(1).toISOString(),
          citations: [
            { type: "product", id: "alletra-6030", label: "HPE Alletra 6030" },
            { type: "product", id: "ps-500t", label: "Dell PowerStore 500T" },
          ],
        },
      ] as unknown as Prisma.InputJsonValue,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
  });

  // ============ Email drafts ============
  console.log("[seed] seeding email drafts");
  await prisma.emailDraft.create({
    data: {
      type: "follow_up",
      language: "vi",
      tone: "professional",
      subject: "VCB — Follow-up TCO analysis storage refresh",
      body: "Kính gửi anh Tùng,\n\nHSI đã hoàn thiện TCO analysis 5 năm cho core banking storage refresh, so sánh HPE Alletra 9060, IBM FlashSystem 9500, và NetApp AFF A900. Key findings:\n\n- Alletra 9060 có TCO thấp hơn ~18% so với FS9500 (chính nhờ InfoSight giảm support ticket).\n- Về latency P99.99: Alletra 9060 sub-100µs vs FS9500 ~150µs.\n- Oracle RAC on Alletra có reference tại Techcombank (vừa deploy Q4/2025).\n\nEm đề xuất workshop với team HPE ANZ SE thứ 3 tuần sau (3/5) tại VCB Tower để đi sâu technical. Anh cho em xin confirm timing sớm ạ.\n\nTrân trọng,\nJimmy Nguyen\nHSI Business Development\nHPT Vietnam",
      accountId: accounts.find((a) => a.name === "Vietcombank")?.id ?? null,
      ownerId: jimmy.id,
      createdAt: daysAgo(2),
    },
  });

  // ============ Daily briefing ============
  console.log("[seed] seeding daily briefing");
  await prisma.dailyBriefing.create({
    data: {
      userId: jimmy.id,
      date: daysAgo(0),
      isRead: false,
      content: `# Briefing hôm nay — ${new Date().toLocaleDateString("vi-VN")}\n\n## 🎯 Ưu tiên cao\n1. **Techcombank** đang chờ BAFO formal cho DC Bình Dương (17.3 tỷ, closed negotiation). Target sign PO trong tuần.\n2. **Vietcombank** VCB workshop storage đang pending confirm timing — cần chốt với anh Tùng.\n3. **BIDV RFP** deadline còn 28 ngày — đang drafted 8/12 requirements.\n\n## 🗓️ Meetings hôm nay\n- 10:00 — Call với Trịnh Quốc Dũng (Vinamilk) follow-up proposal factory Bình Dương\n- 14:30 — Workshop Viettel GreenLake pricing model\n\n## ⚠️ Follow-ups quá hạn\n- **VPBank**: 14 ngày không response — cần call Bùi Minh Tuấn\n- **FPT Retail**: account health 42, cần executive re-engagement\n\n## 💰 Pipeline snapshot\n- Open pipeline: 178 tỷ VND (~ 21 deals)\n- Closing this month: Techcombank DC (17.3 tỷ), VCB storage (4.6 tỷ tentative)\n\n## 📊 Hoạt động gần đây\n- Vừa sign Vingroup M365 E5 25k seats — 8.8 tỷ, closed_won Q1\n- Mất THACO factory server refresh vì Lenovo giá thấp hơn 22% (ghi nhận lesson)`,
      sections: {
        followUps: [
          { id: "vpb-1", subject: "Call VPBank procurement status", dueDate: daysFromNow(1).toISOString(), accountName: "VPBank" },
          { id: "frt-1", subject: "Executive re-engagement FPT Retail", dueDate: daysFromNow(3).toISOString(), accountName: "FPT Retail" },
        ],
        meetings: [
          { id: "m-1", title: "Follow-up Vinamilk factory proposal", date: daysFromNow(0).toISOString(), accountName: "Vinamilk" },
          { id: "m-2", title: "Viettel GreenLake pricing workshop", date: daysFromNow(0).toISOString(), accountName: "Viettel Telecom" },
        ],
        expiringDeals: [
          { id: "d-1", title: "Techcombank DC Bình Dương", expectedClose: daysFromNow(20).toISOString(), accountName: "Techcombank", value: 18_500_000_000 },
          { id: "d-2", title: "Vietcombank core banking storage", expectedClose: daysFromNow(28).toISOString(), accountName: "Vietcombank", value: 4_200_000_000 },
        ],
        pipelineSnapshot: {
          totalValue: 178_000_000_000,
          byStage: {
            prospecting: { count: 2, value: 17_800_000_000 },
            qualification: { count: 6, value: 32_900_000_000 },
            proposal: { count: 8, value: 68_000_000_000 },
            negotiation: { count: 5, value: 59_300_000_000 },
          },
        },
        recentActivity: [
          { id: "a-1", subject: "Signed Vingroup M365 E5", type: "win", createdAt: daysAgo(2).toISOString() },
          { id: "a-2", subject: "Lost THACO factory refresh", type: "loss", createdAt: daysAgo(4).toISOString() },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  console.log("[seed] done ✅");
  console.log(`  users=2  accounts=${accounts.length}  deals=${createdDeals.length}  products=${productsData.length}  competitors=${competitorsCreated.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
