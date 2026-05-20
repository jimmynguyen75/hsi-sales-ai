/**
 * Proposal + Quotation document export (PDF via pdfmake, DOCX via docx lib).
 *
 * Why pdfmake (not puppeteer): pdfmake is pure JS (~500KB), bundles Roboto which
 * handles Vietnamese diacritics correctly, no Chromium install. For our needs
 * (text-heavy business docs with tables) it's ideal. Rich HTML layout tricks
 * aren't needed here.
 *
 * Both renderers return a Promise<Buffer> that a route handler can stream back.
 */
import { createRequire } from "module";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
} from "docx";
import type { Proposal, Quotation, Account } from "@prisma/client";

// pdfmake v0.3.x: the package root export is browser-only (virtualfs/urlAccessPolicy).
// For Node the real API lives in inner CJS modules, and the v0.3 constructor takes
// THREE args — fonts, virtualfs, urlResolver — instead of the old single-arg form.
// `createPdfKitDocument` is now async and returns a Promise<PDFDocument>.
const require_ = createRequire(import.meta.url);

type DocDefinition = Record<string, unknown>;
interface PdfKitDoc extends NodeJS.ReadableStream {
  end(): void;
}
interface PdfPrinterCtor {
  new (
    fonts: Record<string, Record<string, string>>,
    virtualfs: unknown,
    urlResolver: unknown,
  ): {
    createPdfKitDocument(def: DocDefinition): Promise<PdfKitDoc>;
  };
}
const PdfPrinter = (require_("pdfmake/js/Printer") as { default: PdfPrinterCtor }).default;
// Note: virtual-fs exports a pre-instantiated singleton, URLResolver exports the class.
const virtualFs = (require_("pdfmake/js/virtual-fs") as { default: unknown }).default;
const URLResolver = (require_("pdfmake/js/URLResolver") as {
  default: new (fs: unknown) => unknown;
}).default;

// Roboto ships with pdfmake and supports Vietnamese diacritics. Path resolved via
// require so bundlers + node-modules layout both work.
const robotoPath = require_.resolve("pdfmake/fonts/Roboto.js").replace(/Roboto\.js$/, "Roboto/");
const FONTS = {
  Roboto: {
    normal: robotoPath + "Roboto-Regular.ttf",
    bold: robotoPath + "Roboto-Medium.ttf",
    italics: robotoPath + "Roboto-Italic.ttf",
    bolditalics: robotoPath + "Roboto-MediumItalic.ttf",
  },
};
const urlResolver = new URLResolver(virtualFs);
const printer = new PdfPrinter(FONTS, virtualFs, urlResolver);

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(c as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function vndDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("vi-VN");
}
function vndMoney(n: number, currency = "VND"): string {
  return `${n.toLocaleString("vi-VN")} ${currency}`;
}

// ============================================================================
// PROPOSAL PDF
// ============================================================================

interface ProposalSection {
  id: string;
  heading: string;
  body: string;
  order: number;
}

export async function renderProposalPDF(
  proposal: Proposal,
  account: Account | null,
): Promise<Buffer> {
  const sections = ((proposal.sections ?? []) as unknown as ProposalSection[])
    .slice()
    .sort((a, b) => a.order - b.order);
  const inputs = (proposal.inputs ?? {}) as Record<string, unknown>;
  const clientName =
    (inputs.clientName as string | undefined) || account?.companyName || "—";

  const content: unknown[] = [
    {
      text: "PROPOSAL",
      style: "docTitle",
      alignment: "center",
    },
    {
      text: proposal.title,
      style: "subtitle",
      alignment: "center",
      margin: [0, 4, 0, 12],
    },
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "Khách hàng", style: "label" },
            { text: clientName, style: "value" },
          ],
        },
        {
          width: "*",
          stack: [
            { text: "Ngày lập", style: "label" },
            { text: vndDate(proposal.createdAt), style: "value" },
          ],
        },
        {
          width: "*",
          stack: [
            { text: "Phiên bản", style: "label" },
            { text: `v${proposal.version}`, style: "value" },
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#cbd5e1" }] },
  ];

  if (sections.length === 0) {
    content.push({
      text: "(Proposal chưa có nội dung — hãy generate sections trước khi export.)",
      style: "muted",
      margin: [0, 16, 0, 0],
    });
  } else {
    for (const s of sections) {
      content.push({ text: s.heading, style: "h2", margin: [0, 16, 0, 6] });
      // Body is plain text with newlines. Split on blank lines → separate paragraphs.
      const paragraphs = s.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      for (const p of paragraphs) {
        content.push({ text: p, style: "body", margin: [0, 0, 0, 6] });
      }
    }
  }

  const doc: DocDefinition = {
    pageSize: "A4",
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.4 },
    content,
    styles: {
      docTitle: { fontSize: 24, bold: true, color: "#0f172a" },
      subtitle: { fontSize: 14, color: "#475569" },
      h2: { fontSize: 13, bold: true, color: "#0f172a" },
      label: { fontSize: 8, color: "#64748b", bold: true },
      value: { fontSize: 10, color: "#0f172a" },
      body: { fontSize: 10, color: "#1e293b" },
      muted: { fontSize: 10, color: "#94a3b8", italics: true },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `HSI – HPT Vietnam   ·   Trang ${currentPage}/${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: "#94a3b8",
      margin: [0, 20, 0, 0],
    }),
  };

  const pdf = await printer.createPdfKitDocument(doc);
  const bufPromise = streamToBuffer(pdf);
  pdf.end();
  return bufPromise;
}

// ============================================================================
// QUOTATION PDF
// ============================================================================

interface QuotationItem {
  id: string;
  productId?: string | null;
  name: string;
  description?: string;
  vendor?: string;
  qty: number;
  unitPrice: number;
  /** Markup % on top of unitPrice — column E in the XLSX uses this. */
  margin?: number | null;
  /** Per-row VAT %. Column F uses this directly per line. */
  vatPct?: number | null;
  discount: number;
  unit?: string;
  lineTotal: number;
  lineVAT?: number;
}

/**
 * Quotation PDF export.
 *
 * mode:
 *   "full"     — internal/full version with prices, VAT, totals, signature.
 *                What HPT sends to the customer after pricing is final.
 *   "customer" — customer-review version. Hides every price column and the
 *                totals block; only shows item descriptions + qty so the
 *                customer signs off on what they're buying before HPT
 *                quotes a final price ("chốt số lượng").
 *
 * Both modes share the branded header (HPT logo + company info), the
 * customer-info row, the T&C block, and the signature footer.
 */
export type QuotationPDFMode = "full" | "customer";

export async function renderQuotationPDF(
  quotation: Quotation,
  account: Account | null,
  mode: QuotationPDFMode = "full",
): Promise<Buffer> {
  const items = (quotation.items ?? []) as unknown as QuotationItem[];
  const isFull = mode === "full";

  // Pick a representative VAT rate for the T&C wording. Same logic as the
  // XLSX renderer — single rate when all rows agree, mixed otherwise.
  const vatRates = items.map((it) => it.vatPct ?? quotation.tax ?? 10);
  const uniqueVat = Array.from(new Set(vatRates));
  const headlineVat = uniqueVat.length === 1 ? uniqueVat[0] : (quotation.tax ?? 10);
  const mixedVat = uniqueVat.length > 1;

  // HPT logo as a data URI — pdfmake handles base64 images via this form.
  const logoDataURI =
    HPT_LOGO_BUFFER.length > 0
      ? `data:image/jpeg;base64,${HPT_LOGO_BUFFER.toString("base64")}`
      : null;

  // -----------------------------------------------------------------------
  // Header band: logo on the left, HPT contact info on the right.
  // -----------------------------------------------------------------------
  const headerBand = {
    columns: [
      logoDataURI
        ? { image: logoDataURI, width: 110, margin: [0, 0, 0, 0] }
        : { text: "HPT", style: "logoFallback", width: 110 },
      {
        stack: [
          { text: "HPT VIETNAM CORPORATION", style: "brandName" },
          { text: "HPT SYSTEM INTEGRATION", style: "brandSubname" },
          {
            text: "Office: Lot E2a-3, D1 St., Saigon High Tech Park, Tang Nhon Phu Ward, HCMC, Vietnam",
            style: "brandAddress",
            margin: [0, 2, 0, 0],
          },
          {
            text: "Tel: + (84 28) 54 123 400  •  Fax: + (84 28) 54 108 801  •  Website: www.hpt.vn",
            style: "brandAddress",
          },
        ],
        alignment: "right",
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 6],
  };

  // Thin navy divider under the header band.
  const navyDivider = {
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: "#1E3A8A" }],
    margin: [0, 0, 0, 12],
  };

  // -----------------------------------------------------------------------
  // Title block — centered "BÁO GIÁ" + número + (if customer mode) sub
  // tag making the doc role obvious.
  // -----------------------------------------------------------------------
  const titleBlock = {
    stack: [
      {
        text: isFull ? "BÁO GIÁ" : "BÁO GIÁ — XÁC NHẬN SỐ LƯỢNG",
        alignment: "center",
        style: "docTitle",
      },
      {
        text: `Số: ${quotation.number}`,
        alignment: "center",
        style: "subtitle",
      },
    ],
    margin: [0, 0, 0, 14],
  };

  // -----------------------------------------------------------------------
  // Customer info row — 2 columns. Left: KHÁCH HÀNG. Right: dates.
  // -----------------------------------------------------------------------
  const customerInfo = {
    columns: [
      {
        width: "*",
        stack: [
          { text: "KHÁCH HÀNG", style: "label" },
          { text: account?.companyName ?? "—", style: "value", bold: true, margin: [0, 2, 0, 0] },
          account?.address ? { text: account.address, style: "muted" } : null,
          account?.industry ? { text: account.industry, style: "muted" } : null,
        ].filter(Boolean),
      },
      {
        width: 180,
        stack: [
          { text: "NGÀY LẬP", style: "label", alignment: "right" },
          { text: vndDate(quotation.createdAt), style: "value", alignment: "right", margin: [0, 2, 0, 6] },
          quotation.validUntil
            ? { text: "HIỆU LỰC ĐẾN", style: "label", alignment: "right" }
            : null,
          quotation.validUntil
            ? { text: vndDate(quotation.validUntil), style: "value", alignment: "right", margin: [0, 2, 0, 0] }
            : null,
        ].filter(Boolean),
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const titleRow = {
    columns: [
      {
        width: "*",
        stack: [
          { text: "NỘI DUNG BÁO GIÁ", style: "label" },
          { text: quotation.title, style: "value", bold: true, margin: [0, 2, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 12],
  };

  // -----------------------------------------------------------------------
  // Item table — column set depends on mode.
  //   full:     STT / Sản phẩm / ĐVT / SL / Đơn giá / VAT% / Thành tiền
  //   customer: STT / Sản phẩm / ĐVT / SL
  // -----------------------------------------------------------------------
  const tableBody: unknown[][] = [];
  if (isFull) {
    tableBody.push([
      { text: "STT", style: "th", alignment: "center" },
      { text: "Sản phẩm / Mô tả", style: "th" },
      { text: "ĐVT", style: "th", alignment: "center" },
      { text: "SL", style: "th", alignment: "center" },
      { text: "Đơn giá (VNĐ)", style: "th", alignment: "right" },
      { text: "VAT %", style: "th", alignment: "right" },
      { text: "Thành tiền (VNĐ)", style: "th", alignment: "right" },
    ]);
  } else {
    tableBody.push([
      { text: "STT", style: "th", alignment: "center" },
      { text: "Sản phẩm / Mô tả", style: "th" },
      { text: "ĐVT", style: "th", alignment: "center" },
      { text: "SL", style: "th", alignment: "center" },
    ]);
  }

  items.forEach((it, i) => {
    const productCell = {
      stack: [
        { text: it.name, bold: true, fontSize: 10 },
        it.vendor ? { text: it.vendor, fontSize: 8, color: "#64748b" } : null,
        it.description
          ? { text: it.description, fontSize: 9, color: "#475569", margin: [0, 2, 0, 0] }
          : null,
      ].filter(Boolean),
    };
    if (isFull) {
      tableBody.push([
        { text: String(i + 1), alignment: "center" },
        productCell,
        { text: it.unit ?? "unit", alignment: "center", fontSize: 9 },
        { text: String(it.qty), alignment: "center", bold: true },
        { text: vndMoney(it.unitPrice, quotation.currency), alignment: "right" },
        { text: `${it.vatPct ?? 10}%`, alignment: "right", fontSize: 9 },
        { text: vndMoney(it.lineTotal, quotation.currency), alignment: "right", bold: true },
      ]);
    } else {
      tableBody.push([
        { text: String(i + 1), alignment: "center" },
        productCell,
        { text: it.unit ?? "unit", alignment: "center", fontSize: 9 },
        { text: String(it.qty), alignment: "center", bold: true, fontSize: 12 },
      ]);
    }
  });

  const itemTable = {
    table: {
      widths: isFull ? [22, "*", 36, 28, 70, 36, 80] : [30, "*", 60, 60],
      headerRows: 1,
      body: tableBody,
    },
    layout: {
      fillColor: (row: number) =>
        row === 0 ? "#1E3A8A" : row % 2 === 0 ? "#F8FAFC" : null,
      hLineColor: () => "#CBD5E1",
      vLineColor: () => "#CBD5E1",
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 1.2 : 0.5,
      vLineWidth: () => 0.5,
    },
  };

  // -----------------------------------------------------------------------
  // Totals block — full only.
  // -----------------------------------------------------------------------
  const subtotal = quotation.subtotal;
  const totalVAT = Math.max(0, quotation.total - quotation.subtotal);
  const grandTotal = quotation.total;
  const totalsBlock = isFull
    ? {
        columns: [
          { width: "*", text: "" },
          {
            width: 260,
            margin: [0, 14, 0, 0],
            table: {
              widths: ["*", 110],
              body: [
                [
                  { text: "Tổng chưa VAT (VNĐ)", style: "totalLabel" },
                  {
                    text: vndMoney(subtotal, quotation.currency),
                    style: "totalValue",
                    alignment: "right",
                  },
                ],
                [
                  { text: "VAT (VNĐ)", style: "totalLabel" },
                  {
                    text: vndMoney(totalVAT, quotation.currency),
                    style: "totalValue",
                    alignment: "right",
                  },
                ],
                [
                  { text: "TỔNG CỘNG (VNĐ)", style: "totalLabelBig" },
                  {
                    text: vndMoney(grandTotal, quotation.currency),
                    style: "totalValueBig",
                    alignment: "right",
                  },
                ],
              ],
            },
            layout: {
              hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
                i === node.table.body.length - 1 ? "#1E3A8A" : "#CBD5E1",
              vLineColor: () => "#CBD5E1",
              hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
                i === 0 ? 0 : i === node.table.body.length ? 1.5 : 0.5,
              vLineWidth: () => 0,
            },
          },
        ],
      }
    : null;

  // -----------------------------------------------------------------------
  // In-words line — full only.
  // -----------------------------------------------------------------------
  const inWords = isFull
    ? {
        text: `(Bằng chữ: ${vndInWords(grandTotal)})`,
        italics: true,
        fontSize: 10,
        color: "#1E3A8A",
        margin: [0, 8, 0, 0],
      }
    : null;

  // -----------------------------------------------------------------------
  // T&C section. Same wording the XLSX uses. Notes column-wise.
  // -----------------------------------------------------------------------
  const tcLine1 = mixedVat
    ? "1. VAT áp dụng theo từng mục như bảng trên."
    : headlineVat === 0
      ? "1. Hiện tại, phần mềm không chịu VAT."
      : `1. Hiện tại, VAT cho phần cứng là ${headlineVat}%.`;

  const tcLines: Array<{ text: string; bold?: boolean }> = [
    { text: tcLine1 },
    {
      text:
        "    Trường hợp Chính phủ thay đổi mức VAT tại thời điểm xuất hóa đơn, VAT áp dụng theo mức mới.",
    },
    { text: "2. Thanh toán: T/T hoặc tiền mặt." },
    {
      text:
        "    2.1. Điều khoản: 100% trong vòng 30 ngày sau khi hoàn tất giao hàng và nhận đủ chứng từ thanh toán.",
    },
    { text: "    2.2. Số tài khoản HPT Việt Nam:" },
    { text: "       Công ty CP Dịch vụ Công nghệ Tin học HPT", bold: true },
    { text: "       Số TK: 3150763149 VND", bold: true },
    {
      text:
        "       Ngân hàng: Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) – Chi nhánh Phú Nhuận",
      bold: true,
    },
    { text: "3. Thời gian giao hàng: 02 đến 03 tuần." },
  ];

  const tcBlock = {
    stack: [
      { text: "ĐIỀU KHOẢN & ĐIỀU KIỆN", style: "sectionTitle", margin: [0, 18, 0, 6] },
      ...tcLines.map((l) => ({
        text: l.text,
        fontSize: 9,
        color: "#1e293b",
        bold: !!l.bold,
        margin: [0, 1, 0, 1],
      })),
    ],
  };

  // -----------------------------------------------------------------------
  // Optional account notes section.
  // -----------------------------------------------------------------------
  const notesBlock = quotation.notes
    ? {
        stack: [
          { text: "GHI CHÚ", style: "sectionTitle", margin: [0, 14, 0, 6] },
          { text: quotation.notes, fontSize: 10, color: "#1e293b" },
        ],
      }
    : null;

  // -----------------------------------------------------------------------
  // Signature block — both modes. Customer mode emphasises "xác nhận
  // số lượng" since the price is intentionally absent.
  // -----------------------------------------------------------------------
  const signatureBlock = {
    columns: [
      {
        width: "*",
        stack: [
          { text: "Đại diện HPT", bold: true, alignment: "center", fontSize: 10 },
          { text: "GIÁM ĐỐC KINH DOANH", alignment: "center", fontSize: 9, color: "#64748b" },
          { text: " ", margin: [0, 36, 0, 0] },
          { text: "ĐẶNG VŨ THÙY LINH", bold: true, alignment: "center", fontSize: 10 },
        ],
      },
      {
        width: "*",
        stack: [
          {
            text: isFull ? "Xác nhận của khách hàng" : "Xác nhận số lượng",
            bold: true,
            alignment: "center",
            fontSize: 10,
          },
          {
            text: isFull
              ? "(Ký, ghi rõ họ tên)"
              : "(Đại diện khách hàng ký xác nhận số lượng các hạng mục)",
            alignment: "center",
            fontSize: 9,
            color: "#64748b",
          },
          { text: " ", margin: [0, 36, 0, 0] },
          { text: " ", margin: [0, 6, 0, 0] },
        ],
      },
    ],
    margin: [0, 18, 0, 0],
  };

  const content: unknown[] = [
    headerBand,
    navyDivider,
    titleBlock,
    customerInfo,
    titleRow,
    itemTable,
  ];
  if (totalsBlock) content.push(totalsBlock);
  if (inWords) content.push(inWords);
  content.push(tcBlock);
  if (notesBlock) content.push(notesBlock);
  content.push(signatureBlock);

  const doc: DocDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 70],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.3, color: "#0f172a" },
    content,
    styles: {
      logoFallback: { fontSize: 24, bold: true, color: "#1E3A8A" },
      brandName: { fontSize: 12, bold: true, color: "#1E3A8A" },
      brandSubname: { fontSize: 9, bold: true, color: "#1E3A8A" },
      brandAddress: { fontSize: 8, color: "#64748b" },
      docTitle: { fontSize: 24, bold: true, color: "#1E3A8A" },
      subtitle: { fontSize: 11, color: "#64748b", margin: [0, 2, 0, 0] },
      sectionTitle: { fontSize: 11, bold: true, color: "#1E3A8A" },
      th: { bold: true, fontSize: 10, color: "#ffffff" },
      label: { fontSize: 8, color: "#64748b", bold: true },
      value: { fontSize: 10, color: "#0f172a" },
      muted: { fontSize: 9, color: "#94a3b8", margin: [0, 1, 0, 0] },
      body: { fontSize: 10, color: "#1e293b" },
      totalLabel: { fontSize: 10, color: "#475569" },
      totalValue: { fontSize: 10, color: "#0f172a" },
      totalLabelBig: { fontSize: 11, bold: true, color: "#1E3A8A" },
      totalValueBig: { fontSize: 13, bold: true, color: "#1E3A8A" },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          width: "*",
          text: "HPT Vietnam Corp.  •  www.hpt.vn  •  HSI Sales AI Platform",
          fontSize: 8,
          color: "#94a3b8",
          alignment: "left",
          margin: [40, 20, 0, 0],
        },
        {
          width: "auto",
          text: `${quotation.number}  •  Trang ${currentPage}/${pageCount}`,
          fontSize: 8,
          color: "#94a3b8",
          alignment: "right",
          margin: [0, 20, 40, 0],
        },
      ],
    }),
  };

  const pdf = await printer.createPdfKitDocument(doc);
  const bufPromise = streamToBuffer(pdf);
  pdf.end();
  return bufPromise;
}

// ============================================================================
// QUOTATION DOCX
// ============================================================================

export async function renderQuotationDOCX(
  quotation: Quotation,
  account: Account | null,
): Promise<Buffer> {
  const items = (quotation.items ?? []) as unknown as QuotationItem[];

  const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
  const headerCellStyle = {
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
    },
    shading: { fill: "F1F5F9" },
  };
  const bodyCellStyle = {
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
    },
  };

  const itemRows = items.map(
    (it, i) =>
      new TableRow({
        children: [
          new TableCell({
            ...bodyCellStyle,
            children: [new Paragraph({ text: String(i + 1), alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            ...bodyCellStyle,
            children: [
              new Paragraph({
                children: [new TextRun({ text: it.name, bold: true })],
              }),
              ...(it.vendor ? [new Paragraph({ text: it.vendor })] : []),
              ...(it.description ? [new Paragraph({ text: it.description })] : []),
            ],
          }),
          new TableCell({
            ...bodyCellStyle,
            children: [
              new Paragraph({
                text: `${it.qty}${it.unit ? ` ${it.unit}` : ""}`,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
          new TableCell({
            ...bodyCellStyle,
            children: [new Paragraph({ text: vndMoney(it.unitPrice, quotation.currency), alignment: AlignmentType.RIGHT })],
          }),
          new TableCell({
            ...bodyCellStyle,
            children: [new Paragraph({ text: `${it.discount ?? 0}%`, alignment: AlignmentType.RIGHT })],
          }),
          new TableCell({
            ...bodyCellStyle,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: vndMoney(it.lineTotal, quotation.currency), bold: true }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      }),
  );

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["STT", "Sản phẩm / Dịch vụ", "SL", "Đơn giá", "Giảm %", "Thành tiền"].map(
          (t, i) =>
            new TableCell({
              ...headerCellStyle,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: t, bold: true })],
                  alignment: i === 0 ? AlignmentType.CENTER : i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                }),
              ],
            }),
        ),
      }),
      ...itemRows,
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "BÁO GIÁ", bold: true, size: 44 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Số: ${quotation.number}`, color: "64748B" })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Khách hàng: ", bold: true }),
              new TextRun({ text: account?.companyName ?? "—" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Tiêu đề: ", bold: true }),
              new TextRun({ text: quotation.title }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Ngày lập: ", bold: true }),
              new TextRun({ text: vndDate(quotation.createdAt) }),
              ...(quotation.validUntil
                ? [
                    new TextRun({ text: "    " }),
                    new TextRun({ text: "Hiệu lực đến: ", bold: true }),
                    new TextRun({ text: vndDate(quotation.validUntil) }),
                  ]
                : []),
            ],
          }),
          new Paragraph({ text: "" }),
          itemsTable,
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "Subtotal: ", bold: true }),
              new TextRun({ text: vndMoney(quotation.subtotal, quotation.currency) }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Giảm chung (${quotation.discount}%): `, bold: true }),
              new TextRun({
                text: vndMoney(
                  Math.round(-quotation.subtotal * (quotation.discount / 100)),
                  quotation.currency,
                ),
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `VAT (${quotation.tax}%): `, bold: true }),
              new TextRun({
                text: vndMoney(
                  Math.round(
                    quotation.subtotal * (1 - quotation.discount / 100) * (quotation.tax / 100),
                  ),
                  quotation.currency,
                ),
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: "TỔNG CỘNG: ", bold: true, size: 26 }),
              new TextRun({
                text: vndMoney(quotation.total, quotation.currency),
                bold: true,
                size: 26,
              }),
            ],
          }),
          ...(quotation.notes
            ? [
                new Paragraph({ text: "" }),
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  children: [new TextRun({ text: "Ghi chú", bold: true })],
                }),
                new Paragraph({ text: quotation.notes }),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// =========================================================================
// XLSX renderer — matches the HPT-CRV Fortinet Renewal sample layout.
// =========================================================================
//
// Design choices:
// - Single sheet "HPT", 7 columns A:G — same column widths as the sample.
// - Flat item list (no "Option Renew X Years" groups). The schema only
//   carries a flat array of line items, so trying to fake groups would just
//   be heuristics. One table + one set of totals matches what's in the data.
// - Currency format "#,##0" with "-" for zero — matches the sample's accounting
//   style. VAT per line = lineTotal × (tax%). If quotation.tax = 0 (software
//   case), every VAT cell renders as "-".
// - Vietnamese number-to-words for the "(In Words: ...)" line.
// - HPT signatory block + bank info hardcoded — internal tool, single org.

import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";

const __filenameXlsx = fileURLToPath(import.meta.url);
const __dirnameXlsx = path.dirname(__filenameXlsx);

// HPT logo lives next to the compiled sources. Read once at module load —
// it's only 5KB and never changes.
const HPT_LOGO_BUFFER: Buffer = (() => {
  const p = path.join(__dirnameXlsx, "..", "assets", "hpt-logo.jpeg");
  try {
    return fs.readFileSync(p);
  } catch {
    // Don't crash the whole service if the asset is missing in some
    // deployment — the XLSX renderer is the only consumer, and it can
    // render without the logo just fine.
    return Buffer.alloc(0);
  }
})();

const GREEN_FILL = "FF92D050";
const NAVY = "FF002060";
const BLUE_TOTAL = "FF0070C0";
const MONEY_FMT = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)';

/** Convert a positive integer (VND) into Vietnamese words. Returns capitalized
 *  phrase ending with "đồng" — matches local quotation conventions. */
function vndInWords(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Không đồng";
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const readGroup = (g: number, isLeading: boolean): string => {
    const hundreds = Math.floor(g / 100);
    const tens = Math.floor((g % 100) / 10);
    const ones = g % 10;
    const parts: string[] = [];
    if (hundreds > 0 || !isLeading) parts.push(`${digits[hundreds]} trăm`);
    if (tens > 1) {
      parts.push(`${digits[tens]} mươi`);
      if (ones === 1) parts.push("mốt");
      else if (ones === 5) parts.push("lăm");
      else if (ones > 0) parts.push(digits[ones]);
    } else if (tens === 1) {
      parts.push("mười");
      if (ones === 5) parts.push("lăm");
      else if (ones > 0) parts.push(digits[ones]);
    } else if (tens === 0 && ones > 0) {
      if (!isLeading || hundreds > 0) parts.push("lẻ");
      parts.push(digits[ones]);
    }
    return parts.join(" ").trim();
  };
  const scales = ["", "nghìn", "triệu", "tỷ"];
  const groups: number[] = [];
  let rest = Math.floor(n);
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  // groups[0] is the lowest-order group; iterate from highest to lowest.
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const isLeading = i === groups.length - 1;
    out.push(readGroup(g, isLeading));
    if (scales[i]) out.push(scales[i]);
  }
  const phrase = out.join(" ").trim();
  // Capitalize first letter, append " đồng./."
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + " đồng./.";
}

/** Convert a positive integer (VND) into English words.
 *  Returns capitalized phrase ending with "VND only./." */
function vndInWordsEN(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Zero VND only./.";
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const teens = [
    "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const scales = ["", "thousand", "million", "billion", "trillion"];

  const readUnder1000 = (g: number): string => {
    const hundreds = Math.floor(g / 100);
    const rest = g % 100;
    const parts: string[] = [];
    if (hundreds > 0) parts.push(`${ones[hundreds]} hundred`);
    if (rest > 0) {
      if (rest < 10) parts.push(ones[rest]);
      else if (rest < 20) parts.push(teens[rest - 10]);
      else {
        const t = Math.floor(rest / 10);
        const o = rest % 10;
        if (o === 0) parts.push(tens[t]);
        else parts.push(`${tens[t]}-${ones[o]}`);
      }
    }
    return parts.join(" ");
  };

  const groups: number[] = [];
  let rest = Math.floor(n);
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    out.push(readUnder1000(groups[i]));
    if (scales[i]) out.push(scales[i]);
  }
  const phrase = out.join(" ").trim();
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + " VND only./.";
}

// =========================================================================
// Locale strings for VI / EN modes. Two languages = two complete label sets;
// Vietnamese mode uses the Vietnamese number converter, English uses the
// English one. Product names + customer-typed fields are passthroughs.
// =========================================================================

type Lang = "vi" | "en";

interface LocaleStrings {
  title: string;
  to: string;
  rfp: string;
  date: string;
  validUntil: string;
  intro: string;
  headers: string[]; // 7 cells, matches the 7 table columns
  totalBeforeVAT: string;
  vat: string;
  totalAfterVAT: string;
  termsTitle: string;
  /** First "1. ..." line varies by whether all rows are VAT-exempt. */
  firstTermLine(vatPct: number, mixed: boolean): string;
  /** Rest of the T&C — uniform across quotations. */
  termsRest: { text: string; bold?: boolean }[];
  notesTitle: string;
  closingLine: string;
  yoursSincerely: string;
  onBehalfHPT: string;
  customerConfirmation: string;
  signatoryTitle: string;
  signatoryName: string;
  inWords(n: number): string;
}

const LOCALE: Record<Lang, LocaleStrings> = {
  vi: {
    title: "BÁO GIÁ",
    to: "Kính gửi",
    rfp: "Đề mục",
    date: "Ngày",
    validUntil: "Có hiệu lực đến",
    intro:
      "Chúng tôi xin gửi báo giá các sản phẩm theo yêu cầu với giá và quy cách như sau:",
    headers: [
      "STT",
      "Mã hàng",
      "Mô tả sản phẩm",
      "SL",
      "Đơn giá chưa VAT\n(VNĐ)",
      "Tổng chưa VAT (VNĐ)",
      "VAT (VNĐ)",
      "Tổng có VAT\n(VNĐ)",
    ],
    totalBeforeVAT: "Tổng cộng chưa VAT (VNĐ):",
    vat: "VAT (VNĐ):",
    totalAfterVAT: "Tổng cộng có VAT (VNĐ):",
    termsTitle: "ĐIỀU KHOẢN & ĐIỀU KIỆN:",
    firstTermLine: (vatPct, mixed) =>
      mixed
        ? "1. VAT áp dụng theo từng mục như bảng trên."
        : vatPct === 0
          ? "1. Hiện tại, phần mềm không chịu VAT."
          : `1. Hiện tại, VAT cho phần cứng là ${vatPct}%.`,
    termsRest: [
      {
        text:
          "    Trường hợp Chính phủ thay đổi mức VAT tại thời điểm xuất hóa đơn, VAT sẽ áp dụng theo mức mới.",
      },
      { text: "2. Thanh toán: T/T hoặc tiền mặt." },
      {
        text:
          "    2.1. Điều khoản thanh toán: 100% trong vòng 30 ngày sau khi hoàn tất giao hàng và nhận đủ chứng từ thanh toán.",
      },
      { text: "    2.2. Số tài khoản của HPT Việt Nam:" },
      { text: "    Công ty CP Dịch vụ Công nghệ Tin học HPT", bold: true },
      { text: "    Số TK: 3150763149 VND", bold: true },
      {
        text:
          "    Ngân hàng: Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV) – Chi nhánh Phú Nhuận",
        bold: true,
      },
      { text: "3. Thời gian giao hàng: 02 đến 03 tuần" },
    ],
    notesTitle: "GHI CHÚ:",
    closingLine:
      "Cám ơn sự quan tâm của Quý khách. Xin liên hệ chúng tôi nếu có thêm thông tin cần trao đổi.",
    yoursSincerely: "Trân trọng,",
    onBehalfHPT: "Đại diện HPT",
    customerConfirmation: "Xác nhận của khách hàng",
    signatoryTitle: "GIÁM ĐỐC KINH DOANH",
    signatoryName: "ĐẶNG VŨ THÙY LINH",
    inWords: (n) => `(Bằng chữ: ${vndInWords(n)})`,
  },
  en: {
    title: "QUOTATION",
    to: "To",
    rfp: "RFP",
    date: "Date",
    validUntil: "Valid until",
    intro:
      "We would like to offer the required products with our prices and specifications as follows:",
    headers: [
      "No",
      "Part Number",
      "Product Description",
      "Qty",
      "Unit Price Before\nVAT (VNĐ)",
      "Total Before VAT (VNĐ)",
      "VAT (VNĐ)",
      "Total After\nVAT (VNĐ)",
    ],
    totalBeforeVAT: "Total Before VAT (VNĐ):",
    vat: "VAT (VNĐ):",
    totalAfterVAT: "Total After VAT (VNĐ):",
    termsTitle: "TERMS & CONDITIONS:",
    firstTermLine: (vatPct, mixed) =>
      mixed
        ? "1. VAT applies per item as listed in the table above."
        : vatPct === 0
          ? "1. At present, software is not subject to VAT."
          : `1. At present, the VAT on hardware is ${vatPct}%.`,
    termsRest: [
      {
        text:
          "    In case the Government changes the VAT rate at the time of issuing the tax invoice, the new VAT rate will apply.",
      },
      { text: "2. Payment: T/T or cash." },
      {
        text:
          "    2.1. Payment term: 100% within 30 days after the completion of delivery and receipt of payment documents.",
      },
      { text: "    2.2. Account number of HPT Vietnam as follows:" },
      { text: "    HPT Vietnam Corp.", bold: true },
      { text: "    Account No.: 3150763149 VND", bold: true },
      {
        text:
          "    Bank: Joint Stock Commercial Bank for Investment and Development of Vietnam (BIDV) – Phu Nhuan Branch",
        bold: true,
      },
      { text: "3. Delivery time: 02 to 03 weeks" },
    ],
    notesTitle: "NOTES:",
    closingLine:
      "Thank you for your attention. Please feel free to contact us for any further information.",
    yoursSincerely: "Yours Sincerely,",
    onBehalfHPT: "On behalf of HPT",
    customerConfirmation: "Customer's confirmation",
    signatoryTitle: "SALES DIRECTOR",
    signatoryName: "DANG VU THUY LINH",
    inWords: (n) => `(In Words: ${vndInWordsEN(n)})`,
  },
};

// Style helpers for the totals block. Layout is 8 columns A:H, with the
// label merged across A:E and the value sitting in one of F/G/H.
function styleTotalsLabel(cell: ExcelJS.Cell): void {
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: BLUE_TOTAL } };
  cell.alignment = { horizontal: "right", vertical: "top", wrapText: true };
  cell.border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
}

function styleTotalsValueRow(ws: ExcelJS.Worksheet, row: number): void {
  // Label is merged A:E. The merged-over cells (B/C/D) only need top + bottom
  // borders — left/right would create phantom inner lines that read as extra
  // dividers inside the merged label region. E (last cell of merge) gets a
  // right border so it cleanly meets F.
  for (const col of ["B", "C", "D"] as const) {
    ws.getCell(`${col}${row}`).border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
    };
  }
  ws.getCell(`E${row}`).border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  for (const col of ["F", "G", "H"] as const) {
    const cell = ws.getCell(`${col}${row}`);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: BLUE_TOTAL } };
    cell.alignment = { horizontal: "right", vertical: "top" };
    cell.numFmt = '_(* #,##0_);_(* "-"_);_(@_)';
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  }
}

export async function renderQuotationXLSX(
  quotation: Quotation,
  account: Account | null,
  lang: Lang = "vi",
): Promise<Buffer> {
  const items = (quotation.items ?? []) as unknown as QuotationItem[];
  const taxPct = quotation.tax ?? 0;
  const overallDiscount = quotation.discount ?? 0;
  const L = LOCALE[lang];

  // For the T&C "1." wording, find a representative VAT rate. If all rows
  // share the same vatPct, use that; if mixed, signal mixed-mode so the
  // first term line reads "VAT applies per item as listed".
  const vatRates = items.map((it) => it.vatPct ?? taxPct);
  const uniqueVatRates = Array.from(new Set(vatRates));
  const headlineVat = uniqueVatRates.length === 1 ? uniqueVatRates[0] : taxPct;
  const mixedVat = uniqueVatRates.length > 1;

  // Resolve part numbers (SKU) for items that came from the product catalog.
  const productIds = items
    .map((it) => it.productId)
    .filter((x): x is string => !!x);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sku: true },
        })
      : [];
  const skuById = new Map(products.map((p) => [p.id, p.sku ?? ""]));
  const partNumberOf = (it: QuotationItem): string =>
    (it.productId && skuById.get(it.productId)) || it.vendor || "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "HSI Sales AI";
  wb.created = new Date();
  const ws = wb.addWorksheet("HPT");

  // Column widths — copied from the new template (8 columns A:H).
  const widths = [6.5, 19.0, 32.16, 5.5, 18.0, 18.33, 13.66, 16.5];
  ws.columns = widths.map((w) => ({ width: w }));

  const arial = (size: number, opts: Partial<ExcelJS.Font> = {}) => ({
    name: "Arial",
    size,
    ...opts,
  });
  const thinAll: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
  const headerBorder = (
    sidePos: "first" | "middle" | "last",
  ): Partial<ExcelJS.Borders> => ({
    top: { style: "medium" },
    bottom: { style: "thin" },
    left: { style: sidePos === "first" ? "medium" : "thin" },
    right: { style: sidePos === "last" ? "medium" : "thin" },
  });

  // -----------------------------------------------------------------------
  // Row 1: HPT logo (in A1) + company info merged C1:H1 (right-aligned).
  // -----------------------------------------------------------------------
  if (HPT_LOGO_BUFFER.length > 0) {
    const logoId = wb.addImage({
      buffer: HPT_LOGO_BUFFER as unknown as ExcelJS.Buffer,
      extension: "jpeg",
    });
    ws.addImage(logoId, {
      tl: { col: 0.05, row: 0.05 },
      ext: { width: 110, height: 56 },
      editAs: "oneCell",
    });
  }
  ws.mergeCells("C1:H1");
  const c1 = ws.getCell("C1");
  c1.value =
    "HPT VIETNAM CORPORATION\n" +
    "HPT SYSTEM INTEGRATION\n" +
    "Office: Lot E2a-3, D1 St., Saigon High Tech Park, Tang Nhon Phu Ward, HCMC, Vietnam\n" +
    "Tel: + (84 28) 54 123 400 • Fax: + (84 28) 54 108 801 • Website: www.hpt.vn";
  c1.font = arial(9, { bold: true });
  c1.alignment = { horizontal: "right", vertical: "top", wrapText: true };
  ws.getRow(1).height = 48;

  // -----------------------------------------------------------------------
  // Row 2: title (font 20 bold navy, centered) — "QUOTATION" or "BÁO GIÁ".
  // -----------------------------------------------------------------------
  ws.mergeCells("A2:H2");
  const a2 = ws.getCell("A2");
  a2.value = L.title;
  a2.font = arial(20, { bold: true, color: { argb: NAVY } });
  a2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 37.5;

  // -----------------------------------------------------------------------
  // Row 3: To: <customer> (bold) on the left, Date in H3 (italic right).
  // -----------------------------------------------------------------------
  ws.getCell("B3").value = `    ${L.to}: ${account?.companyName ?? "—"}`;
  ws.getCell("B3").font = arial(10, { bold: true });
  ws.getCell("B3").alignment = { horizontal: "left", vertical: "top" };
  ws.getCell("H3").value = `${L.date}: ${vndDate(quotation.createdAt)}`;
  ws.getCell("H3").font = arial(10, { italic: true });
  ws.getCell("H3").alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(3).height = 15;

  // -----------------------------------------------------------------------
  // Row 4: RFP / Valid until.
  // -----------------------------------------------------------------------
  ws.getCell("B4").value = `    ${L.rfp}: ${quotation.title}`;
  ws.getCell("B4").font = arial(10, { bold: true });
  ws.getCell("B4").alignment = { horizontal: "left", vertical: "top" };
  ws.getCell("H4").value = `${L.validUntil}: ${
    quotation.validUntil ? vndDate(quotation.validUntil) : "—"
  }`;
  ws.getCell("H4").font = arial(10, { italic: true });
  ws.getCell("H4").alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(4).height = 15;

  // -----------------------------------------------------------------------
  // Row 5: intro line, merged across the full width.
  // -----------------------------------------------------------------------
  ws.mergeCells("A5:H5");
  const a5 = ws.getCell("A5");
  a5.value = L.intro;
  a5.font = arial(10);
  ws.getRow(5).height = 13.5;

  // Row 6 (gap) + row 7 (gap) — empty, but height matters for spacing.
  ws.getRow(6).height = 6.75;
  ws.getRow(7).height = 13;

  // -----------------------------------------------------------------------
  // Row 8: Table header (green #92D050).
  // -----------------------------------------------------------------------
  const headerRow = 8;
  ws.getRow(headerRow).height = 27.75;
  const headers = L.headers;
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = arial(10, { bold: true });
    cell.alignment = { horizontal: "center", vertical: "top", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GREEN_FILL },
    };
    cell.border = headerBorder(
      i === 0 ? "first" : i === headers.length - 1 ? "last" : "middle",
    );
  });

  // -----------------------------------------------------------------------
  // Item rows — 2 rows per item to match the template:
  //   Row N   = "group header": A=index (bold), B=display name (bold)
  //   Row N+1 = "detail":       A=blank, B=part number, C=description,
  //                             D=qty, E=unit price, F/G/H = formulas
  //
  // Excel formulas:
  //   F = E*D   (line total before VAT)
  //   G = F * tax%   (per-line VAT — uses the quotation's tax rate)
  //   H = F + G (line total after VAT)
  // -----------------------------------------------------------------------
  const MONEY_FMT_X = '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)';
  let row = headerRow + 1;
  const detailRows: number[] = []; // for SUM ranges

  items.forEach((it, idx) => {
    // -- Group header row --
    const ghRow = row;
    ws.getRow(ghRow).height = 12.75;

    const ghA = ws.getCell(ghRow, 1);
    ghA.value = idx + 1;
    ghA.font = arial(10, { bold: true });
    ghA.alignment = { horizontal: "center", vertical: "top", wrapText: true };
    ghA.border = thinAll;

    const ghB = ws.getCell(ghRow, 2);
    ghB.value = it.name; // display name, e.g. "FortiGate 80F device"
    ghB.font = arial(10, { bold: true, color: { argb: "FF000000" } });
    ghB.alignment = { horizontal: "left", vertical: "top" };
    ghB.border = thinAll;

    // Border the remaining cells so the table outline stays continuous.
    for (let col = 3; col <= 8; col++) {
      ws.getCell(ghRow, col).border = thinAll;
    }
    row++;

    // -- Detail row --
    const dRow = row;
    detailRows.push(dRow);

    // unitPrice already reflects the sell price after margin — see
    // recompute() in routes/quotations.ts. Column E in the XLSX matches
    // what the editor's Đơn giá column shows. Legacy "% CK" discount still
    // folded in for older quotations not yet migrated.
    //
    // VAT is per-row (vatPct), falling back to the legacy quotation-level
    // taxPct only for items predating the per-row migration.
    const lineVatPct = it.vatPct ?? taxPct;
    const effectiveUnitPrice = Math.round(
      it.unitPrice * (1 - (it.discount ?? 0) / 100),
    );
    const lineBeforeVAT = effectiveUnitPrice * it.qty;
    const lineVAT = Math.round(lineBeforeVAT * (lineVatPct / 100));

    const dA = ws.getCell(dRow, 1);
    dA.value = null;
    dA.font = arial(10);
    dA.alignment = { horizontal: "center", vertical: "top", wrapText: true };
    dA.border = thinAll;

    const dB = ws.getCell(dRow, 2);
    dB.value = partNumberOf(it);
    dB.font = arial(10, { color: { argb: "FF000000" } });
    dB.alignment = { horizontal: "left", vertical: "top" };
    dB.border = thinAll;

    const dC = ws.getCell(dRow, 3);
    dC.value = it.description ?? "";
    dC.font = arial(10, { color: { argb: "FF000000" } });
    dC.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    dC.border = thinAll;

    const dD = ws.getCell(dRow, 4);
    dD.value = it.qty;
    dD.font = arial(10);
    dD.alignment = { horizontal: "center", vertical: "top" };
    dD.border = thinAll;

    const dE = ws.getCell(dRow, 5);
    dE.value = effectiveUnitPrice;
    dE.font = arial(10);
    dE.alignment = { horizontal: "right", vertical: "top" };
    dE.numFmt = MONEY_FMT_X;
    dE.border = thinAll;

    // F = E * D (formula)
    const dF = ws.getCell(dRow, 6);
    dF.value = { formula: `E${dRow}*D${dRow}`, result: lineBeforeVAT };
    dF.font = arial(10);
    dF.alignment = { horizontal: "right", vertical: "top" };
    dF.numFmt = MONEY_FMT_X;
    dF.border = thinAll;

    // G = F * vatPct%  (per-row VAT, matches template's =F10*8% style)
    const dG = ws.getCell(dRow, 7);
    dG.value = lineVatPct > 0
      ? { formula: `F${dRow}*${lineVatPct}%`, result: lineVAT }
      : 0;
    dG.font = arial(10);
    dG.alignment = { horizontal: "right", vertical: "top" };
    dG.numFmt = MONEY_FMT_X;
    dG.border = thinAll;

    // H = F + G  (formula)
    const dH = ws.getCell(dRow, 8);
    dH.value = {
      formula: `F${dRow}+G${dRow}`,
      result: lineBeforeVAT + lineVAT,
    };
    dH.font = arial(10);
    dH.alignment = { horizontal: "right", vertical: "top" };
    dH.numFmt = MONEY_FMT_X;
    dH.border = thinAll;

    // Make the detail row tall enough for the description to wrap. The
    // sample uses 90 for a longish description; we scale by character count
    // so short descriptions don't waste vertical space.
    const desc = it.description ?? "";
    const wrapWidthChars = 60; // ≈ chars/line at column C width 32.16
    const wrappedLines = Math.max(
      desc.split("\n").length,
      Math.ceil(desc.length / wrapWidthChars),
    );
    ws.getRow(dRow).height = Math.max(20, 15 * wrappedLines);
    row++;
  });
  if (items.length === 0) {
    for (let i = 1; i <= 8; i++) ws.getCell(row, i).border = thinAll;
    row++;
  }

  // -----------------------------------------------------------------------
  // Totals block — 3 rows. Label merged A:E, value in F/G/H respectively.
  // SUM formulas reference each item's DETAIL row (not group-header row).
  // -----------------------------------------------------------------------
  // Helper: post-discount unit price (margin already baked into unitPrice
  // upstream).
  const sellUnitOf = (it: QuotationItem): number =>
    Math.round(it.unitPrice * (1 - (it.discount ?? 0) / 100));
  // Per-item pre-VAT subtotal — same formula as each row's F column.
  const sumE_perItem = items.reduce(
    (s, it) => s + sellUnitOf(it) * it.qty,
    0,
  );
  const sumF_afterDiscount = Math.round(sumE_perItem * (1 - overallDiscount / 100));
  // Aggregate VAT sums each row's individual VAT amount (per-row vatPct).
  const sumG = items.reduce((s, it) => {
    const lineBeforeVAT = sellUnitOf(it) * it.qty;
    const linePct = it.vatPct ?? taxPct;
    return s + Math.round(lineBeforeVAT * (linePct / 100));
  }, 0);
  const grandTotal = sumF_afterDiscount + sumG;

  // Build a comma-separated SUM argument so we hit only detail rows (skip
  // group-header rows). For 5 items this becomes "F9,F11,F13,F15,F17".
  const fRefs = detailRows.map((r) => `F${r}`).join(",");
  const gRefs = detailRows.map((r) => `G${r}`).join(",");

  const totalsStart = row;
  // Row N: Total Before VAT
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = L.totalBeforeVAT;
  styleTotalsLabel(ws.getCell(`A${row}`));
  styleTotalsValueRow(ws, row);
  ws.getCell(`F${row}`).value =
    detailRows.length === 0
      ? 0
      : overallDiscount > 0
        ? {
            formula: `SUM(${fRefs})*${(1 - overallDiscount / 100).toFixed(4)}`,
            result: sumF_afterDiscount,
          }
        : { formula: `SUM(${fRefs})`, result: sumF_afterDiscount };
  ws.getRow(row).height = 12.75;
  row++;

  // Row N+1: VAT
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = L.vat;
  styleTotalsLabel(ws.getCell(`A${row}`));
  styleTotalsValueRow(ws, row);
  ws.getCell(`G${row}`).value =
    detailRows.length === 0
      ? 0
      : { formula: `SUM(${gRefs})`, result: sumG };
  ws.getRow(row).height = 12.75;
  row++;

  // Row N+2: Total After VAT
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = L.totalAfterVAT;
  styleTotalsLabel(ws.getCell(`A${row}`));
  styleTotalsValueRow(ws, row);
  ws.getCell(`H${row}`).value =
    detailRows.length === 0
      ? 0
      : {
          formula: `F${totalsStart}+G${totalsStart + 1}`,
          result: grandTotal,
        };
  ws.getRow(row).height = 12.75;
  row++;

  // -----------------------------------------------------------------------
  // "In Words" line — merged A:H, italic + bold + blue, centered.
  // Lives INSIDE the table block (same medium outer border), matching the
  // source template where A14 has L:medium and H14 has R:medium.
  // -----------------------------------------------------------------------
  const inWordsRow = row;
  ws.mergeCells(`A${inWordsRow}:H${inWordsRow}`);
  const inWords = ws.getCell(`A${inWordsRow}`);
  inWords.value = L.inWords(grandTotal);
  inWords.font = arial(10, {
    italic: true,
    bold: true,
    color: { argb: BLUE_TOTAL },
  });
  inWords.alignment = { horizontal: "center", vertical: "top", wrapText: true };
  ws.getRow(inWordsRow).height = 12.75;
  // Top + bottom thin border on A14 (left edge of merge); merged-over cells
  // only need top + bottom. Right edge of merge (H) gets a thin border.
  inWords.border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
  };
  for (let col = 2; col <= 7; col++) {
    ws.getCell(inWordsRow, col).border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
    };
  }
  ws.getCell(inWordsRow, 8).border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
  };
  row++;

  // -----------------------------------------------------------------------
  // Apply medium outer border on the entire table block — including the
  // In Words row. Matches the source template (A8..H14 wrapped in medium).
  // -----------------------------------------------------------------------
  const tableLastRow = inWordsRow;
  for (let r = headerRow; r <= tableLastRow; r++) {
    const left = ws.getCell(r, 1);
    const right = ws.getCell(r, 8);
    left.border = { ...left.border, left: { style: "medium" } };
    right.border = { ...right.border, right: { style: "medium" } };
  }
  for (let col = 1; col <= 8; col++) {
    const c = ws.getCell(tableLastRow, col);
    c.border = { ...c.border, bottom: { style: "medium" } };
  }

  // Spacer
  ws.getRow(row).height = 12.75;
  row++;

  // -----------------------------------------------------------------------
  // TERMS & CONDITIONS — pulled from the language locale. First "1. ..." line
  // varies by the dominant VAT % (or mixed-mode signal); rest is uniform.
  // -----------------------------------------------------------------------
  ws.getCell(`A${row}`).value = L.termsTitle;
  ws.getCell(`A${row}`).font = arial(10, { bold: true });
  row++;

  const terms: Array<{ text: string; bold?: boolean }> = [
    { text: L.firstTermLine(headlineVat, mixedVat) },
    ...L.termsRest,
  ];
  terms.forEach((t) => {
    const cell = ws.getCell(`B${row}`);
    cell.value = t.text;
    cell.font = arial(10, { bold: !!t.bold });
    // No wrap — original template lets long lines overflow naturally to the
    // right so each clause stays on one row. Wrap-text would compress them
    // into multi-line cells.
    cell.alignment = { vertical: "top", wrapText: false };
    ws.getRow(row).height = 12.75;
    row++;
  });

  // Optional notes from the quotation itself.
  if (quotation.notes) {
    row++;
    ws.getCell(`A${row}`).value = L.notesTitle;
    ws.getCell(`A${row}`).font = arial(10, { bold: true });
    row++;
    ws.mergeCells(`A${row}:H${row}`);
    const notesCell = ws.getCell(`A${row}`);
    notesCell.value = quotation.notes;
    notesCell.font = arial(10);
    notesCell.alignment = { vertical: "top", wrapText: true };
    row++;
  }

  // -----------------------------------------------------------------------
  // Closing + signature.
  // -----------------------------------------------------------------------
  row++;
  ws.getCell(`A${row}`).value = L.closingLine;
  ws.getCell(`A${row}`).font = arial(10);
  row++;
  ws.getCell(`A${row}`).value = L.yoursSincerely;
  ws.getCell(`A${row}`).font = arial(10);
  row += 2;

  // Signature headers: HPT side in B, customer side in G (matches template).
  ws.getCell(`B${row}`).value = L.onBehalfHPT;
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  ws.getCell(`G${row}`).value = L.customerConfirmation;
  ws.getCell(`G${row}`).font = arial(10, { bold: true });
  ws.getCell(`G${row}`).alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  ws.getRow(row).height = 13.5;
  row++;

  ws.getCell(`B${row}`).value = L.signatoryTitle;
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = { horizontal: "center", vertical: "middle" };
  row += 6;

  ws.getCell(`B${row}`).value = L.signatoryName;
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = { horizontal: "center", vertical: "top" };

  // -----------------------------------------------------------------------
  // Page setup so print preview matches the template.
  // -----------------------------------------------------------------------
  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}

// =========================================================================
// Account info export — mirrors the team's "Thông tin khách hàng" Excel
// template (2 sections: Account + Contact), but prettier: HPT logo,
// branded title bar, section headers with green fill matching the
// quotation template, thin borders + alternating row tint, bigger row
// heights for readability.
//
// Field map (template row → app schema):
//   1/ Account:
//     1. Tên                       → account.companyName
//     2. Thành viên của (nếu có)   → account.parentCompany (not in schema, blank)
//     3. MST                       → account.taxCode (not in schema, blank)
//     4. Mảng khách hàng           → account.industry
//     5. Website                   → account.website
//     6. Địa chỉ                   → account.address
//     7. AM (Người phụ trách)      → owner.name
//   2/ Contact (primary):
//     1. Họ và tên                 → contact.fullName
//     2. Số điện thoại             → contact.phone
//     3. Chức vụ                   → contact.title
//     4. Phòng ban                 → contact.department (not in schema)
//     5. Sinh nhật                 → contact.birthday (not in schema)
//     6. Email                     → contact.email
//     7. Mô tả                     → contact.description (not in schema)
//     8. Chăm sóc khách hàng       → boilerplate checklist
//
// Missing schema fields render with the placeholder "—" so the layout
// stays consistent.
// =========================================================================

interface AccountInfoContact {
  fullName: string;
  title?: string | null;
  department?: string | null;
  birthday?: Date | string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
}

interface AccountInfoOwner {
  name: string;
  email: string;
}

export async function renderAccountInfoXLSX(
  account: Account,
  primaryContact: AccountInfoContact | null,
  owner: AccountInfoOwner | null,
): Promise<Buffer> {
  // Polished "Thông tin khách hàng" export. Keeps the team's template
  // structure (Account section + Contact section + care checklist) but
  // adds branding + visual hierarchy so the file looks at-a-glance like
  // a real B2B customer fact sheet:
  //
  //   ┌────────────────────────────────────────────────────┐
  //   │  [HPT logo]   THÔNG TIN KHÁCH HÀNG                 │  ← title band
  //   │               Xuất ngày 19/05/2026 • AM: ...        │
  //   ├────────────────────────────────────────────────────┤
  //   │ 1/ THÔNG TIN ACCOUNT                                │  ← navy banner
  //   │ STT │ Nội dung                  │ Giá trị            │  ← header strip
  //   │  1  │ Tên                       │ HPT Vietnam        │
  //   │  …  │                           │                    │
  //   ├────────────────────────────────────────────────────┤
  //   │ 2/ THÔNG TIN CONTACT                                │
  //   │ STT │ Nội dung                  │ Giá trị            │
  //   │  …  │ Chăm sóc khách hàng       │ + bullet 1         │
  //   │     │ (merged 6 rows)           │ + bullet 2         │
  //   │     │                           │ + …                │
  //   └────────────────────────────────────────────────────┘

  const wb = new ExcelJS.Workbook();
  wb.creator = "HSI Sales AI";
  wb.created = new Date();
  const ws = wb.addWorksheet("RV");

  // Wider columns for breathing room. A stays narrow for STT.
  ws.columns = [
    { width: 7 }, // A: STT
    { width: 38 }, // B: Nội dung
    { width: 70 }, // C: Giá trị
  ];

  // ----- Style palette -----
  const NAVY = "FF1E3A8A";
  const SLATE_HEADER = "FFE2E8F0"; // slate-200 for table column header
  const ALT_ROW = "FFF8FAFC"; // slate-50 for alt-row tint
  const BORDER_GRAY = "FFCBD5E1"; // slate-300 for cell borders
  const TEXT_DARK = "FF0F172A";
  const TEXT_MUTED = "FF64748B";

  const font = (opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
    name: "Calibri",
    size: 11,
    color: { argb: TEXT_DARK },
    ...opts,
  });
  const thinBorder = (): Partial<ExcelJS.Border> => ({
    style: "thin",
    color: { argb: BORDER_GRAY },
  });
  const thinAll = (): Partial<ExcelJS.Borders> => ({
    top: thinBorder(),
    bottom: thinBorder(),
    left: thinBorder(),
    right: thinBorder(),
  });

  // -----------------------------------------------------------------------
  // Row 1: HPT logo (A1) + title band (B1:C1)
  // -----------------------------------------------------------------------
  if (HPT_LOGO_BUFFER.length > 0) {
    const logoId = wb.addImage({
      buffer: HPT_LOGO_BUFFER as unknown as ExcelJS.Buffer,
      extension: "jpeg",
    });
    ws.addImage(logoId, {
      tl: { col: 0.1, row: 0.15 },
      ext: { width: 90, height: 50 },
      editAs: "oneCell",
    });
  }
  ws.mergeCells("B1:C1");
  const titleCell = ws.getCell("B1");
  titleCell.value = "THÔNG TIN KHÁCH HÀNG";
  titleCell.font = font({ size: 20, bold: true, color: { argb: NAVY } });
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(1).height = 38;

  // Subtitle — "Xuất ngày … • AM: …"
  ws.mergeCells("A2:C2");
  const subtitle = ws.getCell("A2");
  const subtitleParts: string[] = [`Xuất ngày: ${vndDate(new Date())}`];
  if (owner?.name) subtitleParts.push(`AM: ${owner.name}`);
  subtitle.value = subtitleParts.join("   •   ");
  subtitle.font = font({ size: 10, italic: true, color: { argb: TEXT_MUTED } });
  subtitle.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(2).height = 18;
  // Thin navy divider under the title band.
  for (let col = 1; col <= 3; col++) {
    ws.getCell(2, col).border = {
      bottom: { style: "medium", color: { argb: NAVY } },
    };
  }

  // Track the running row pointer for the body.
  let row = 4; // leave a small gap after the title band

  // -----------------------------------------------------------------------
  // Helper: section banner — full-width navy bar with white text.
  // -----------------------------------------------------------------------
  const writeSectionBanner = (label: string) => {
    ws.mergeCells(`A${row}:C${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = label;
    c.font = font({ size: 12, bold: true, color: { argb: "FFFFFFFF" } });
    c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ws.getRow(row).height = 26;
    row++;
  };

  // -----------------------------------------------------------------------
  // Helper: table column header (STT / Nội dung / Giá trị).
  // -----------------------------------------------------------------------
  const writeTableHeader = () => {
    const headers = ["STT", "Nội dung", "Giá trị"];
    headers.forEach((h, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = h;
      c.font = font({ size: 11, bold: true });
      c.alignment = {
        horizontal: i === 0 ? "center" : "left",
        vertical: "middle",
        indent: i === 0 ? 0 : 1,
      };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: SLATE_HEADER },
      };
      c.border = thinAll();
    });
    ws.getRow(row).height = 22;
    row++;
  };

  // -----------------------------------------------------------------------
  // Helper: data row with STT, label, value. Alternating tint.
  // -----------------------------------------------------------------------
  const writeRow = (
    stt: number,
    label: string,
    value: string | null | undefined,
    opts: { height?: number } = {},
  ) => {
    const tint: ExcelJS.Fill | undefined =
      stt % 2 === 0
        ? { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW } }
        : undefined;

    const a = ws.getCell(row, 1);
    a.value = stt;
    a.font = font({ color: { argb: TEXT_MUTED } });
    a.alignment = { horizontal: "center", vertical: "middle" };
    a.border = thinAll();
    if (tint) a.fill = tint;

    const b = ws.getCell(row, 2);
    b.value = label;
    b.font = font({ bold: true });
    b.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
    b.border = thinAll();
    if (tint) b.fill = tint;

    const c = ws.getCell(row, 3);
    const v = value && String(value).trim() ? String(value) : "";
    c.value = v;
    c.font = font({ color: v ? { argb: TEXT_DARK } : { argb: "FFCBD5E1" } });
    c.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
    c.border = thinAll();
    if (tint) c.fill = tint;

    const wrapNeeded = (v?.length ?? 0) > 60;
    ws.getRow(row).height = opts.height ?? (wrapNeeded ? 32 : 22);
    row++;
  };

  // -----------------------------------------------------------------------
  // SECTION 1: Account info
  // -----------------------------------------------------------------------
  writeSectionBanner("1/ THÔNG TIN ACCOUNT");
  writeTableHeader();
  writeRow(1, "Tên", account.companyName, { height: 32 });
  writeRow(2, "Thành viên của (nếu có)", account.parentCompany);
  writeRow(3, "MST", account.taxCode);
  writeRow(4, "Mảng khách hàng", account.industry);
  writeRow(5, "Website", account.website);
  writeRow(6, "Địa chỉ", account.address);
  writeRow(7, "AM (Người phụ trách)", owner?.name ?? null);

  row++; // spacer between sections

  // -----------------------------------------------------------------------
  // SECTION 2: Contact info — first 7 rows like Account, then "Chăm sóc
  // khách hàng" as a merged STT + label block spanning the 6 bullet rows.
  // -----------------------------------------------------------------------
  writeSectionBanner("2/ THÔNG TIN CONTACT");
  writeTableHeader();
  writeRow(1, "Họ và tên", primaryContact?.fullName);
  writeRow(2, "Số điện thoại", primaryContact?.phone);
  writeRow(3, "Chức vụ", primaryContact?.title);
  writeRow(4, "Phòng ban", primaryContact?.department);
  writeRow(
    5,
    "Sinh nhật (nếu có)",
    primaryContact?.birthday ? vndDate(primaryContact.birthday) : null,
  );
  writeRow(6, "Email", primaryContact?.email);
  writeRow(7, "Mô tả: Thông tin sở thích,…", primaryContact?.description, { height: 36 });

  // Care block — STT 8, label "Chăm sóc khách hàng", merged across 6 rows.
  const careTop = row;
  const careStt = 8;
  const careItems = [
    "+ Gửi tin nhắn chúc mừng sinh nhật cá nhân",
    "+ Gửi tin nhắn chúc mừng sinh nhật ngành (Quân đội, báo chí, y tế,…)",
    "+ Gửi tin nhắn 8/3, 20/10",
    "+ Gửi tin nhắn dịp lễ (30/4, 1/5, 2/9)",
    "+ Danh sách khách hàng tặng quà tết",
    "+ Nghỉ hưu",
  ];
  const careBottom = careTop + careItems.length - 1;
  const careTint: ExcelJS.Fill | undefined =
    careStt % 2 === 0
      ? { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW } }
      : undefined;

  // Merge STT cell vertically across all 6 care rows.
  ws.mergeCells(`A${careTop}:A${careBottom}`);
  const sttCell = ws.getCell(`A${careTop}`);
  sttCell.value = careStt;
  sttCell.font = font({ color: { argb: TEXT_MUTED } });
  sttCell.alignment = { horizontal: "center", vertical: "middle" };
  sttCell.border = thinAll();
  if (careTint) sttCell.fill = careTint;

  // Merge label cell vertically across all 6 care rows.
  ws.mergeCells(`B${careTop}:B${careBottom}`);
  const labelCell = ws.getCell(`B${careTop}`);
  labelCell.value = "Chăm sóc khách hàng";
  labelCell.font = font({ bold: true });
  labelCell.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
  labelCell.border = thinAll();
  if (careTint) labelCell.fill = careTint;

  // One bullet per row in column C.
  careItems.forEach((text, i) => {
    const r = careTop + i;
    const c = ws.getCell(r, 3);
    c.value = text;
    c.font = font();
    c.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
    c.border = thinAll();
    if (careTint) c.fill = careTint;
    ws.getRow(r).height = 22;
  });
  row = careBottom + 1;

  // -----------------------------------------------------------------------
  // Optional notes from the account itself (free-text "Ghi chú" field).
  // -----------------------------------------------------------------------
  if (account.notes && account.notes.trim()) {
    row++; // spacer
    writeSectionBanner("3/ GHI CHÚ");
    ws.mergeCells(`A${row}:C${row}`);
    const notesCell = ws.getCell(`A${row}`);
    notesCell.value = account.notes;
    notesCell.font = font();
    notesCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
    notesCell.border = thinAll();
    const lineCount = Math.max(2, Math.ceil(account.notes.length / 80));
    ws.getRow(row).height = Math.min(140, lineCount * 18);
    row++;
  }

  // -----------------------------------------------------------------------
  // Footer line — small print mentioning the system.
  // -----------------------------------------------------------------------
  row++;
  ws.mergeCells(`A${row}:C${row}`);
  const footer = ws.getCell(`A${row}`);
  footer.value = "HSI Sales AI Platform • HPT Vietnam";
  footer.font = font({ size: 9, italic: true, color: { argb: TEXT_MUTED } });
  footer.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 18;

  // Page setup so print preview matches the look-and-feel.
  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}
