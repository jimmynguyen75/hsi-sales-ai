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
  discount: number;
  unit?: string;
  lineTotal: number;
}

export async function renderQuotationPDF(
  quotation: Quotation,
  account: Account | null,
): Promise<Buffer> {
  const items = (quotation.items ?? []) as unknown as QuotationItem[];

  const tableBody: unknown[][] = [
    [
      { text: "STT", style: "th" },
      { text: "Sản phẩm / Dịch vụ", style: "th" },
      { text: "SL", style: "th", alignment: "right" },
      { text: "Đơn giá", style: "th", alignment: "right" },
      { text: "Giảm %", style: "th", alignment: "right" },
      { text: "Thành tiền", style: "th", alignment: "right" },
    ],
  ];
  items.forEach((it, i) => {
    tableBody.push([
      { text: String(i + 1), alignment: "center" },
      {
        stack: [
          { text: it.name, bold: true },
          it.vendor ? { text: it.vendor, fontSize: 8, color: "#64748b" } : null,
          it.description ? { text: it.description, fontSize: 9, color: "#475569" } : null,
        ].filter(Boolean),
      },
      { text: `${it.qty}${it.unit ? ` ${it.unit}` : ""}`, alignment: "right" },
      { text: vndMoney(it.unitPrice, quotation.currency), alignment: "right" },
      { text: `${it.discount ?? 0}%`, alignment: "right" },
      { text: vndMoney(it.lineTotal, quotation.currency), alignment: "right", bold: true },
    ]);
  });

  const content: unknown[] = [
    {
      columns: [
        {
          stack: [
            { text: "BÁO GIÁ", style: "docTitle" },
            { text: `Số: ${quotation.number}`, style: "subtitle" },
          ],
        },
        {
          stack: [
            { text: "Ngày lập", style: "label", alignment: "right" },
            { text: vndDate(quotation.createdAt), style: "value", alignment: "right" },
            quotation.validUntil
              ? { text: `Hiệu lực đến ${vndDate(quotation.validUntil)}`, style: "muted", alignment: "right", margin: [0, 4, 0, 0] }
              : null,
          ].filter(Boolean),
          width: "auto",
        },
      ],
      margin: [0, 0, 0, 10],
    },
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "KHÁCH HÀNG", style: "label" },
            { text: account?.companyName ?? "—", style: "value", bold: true },
            account?.industry ? { text: account.industry, style: "muted" } : null,
            account?.address ? { text: account.address, style: "muted" } : null,
          ].filter(Boolean),
        },
        {
          width: "*",
          stack: [
            { text: "TIÊU ĐỀ BÁO GIÁ", style: "label" },
            { text: quotation.title, style: "value" },
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    },
    {
      table: {
        widths: [25, "*", 40, 70, 40, 80],
        headerRows: 1,
        body: tableBody,
      },
      layout: {
        fillColor: (row: number) => (row === 0 ? "#f1f5f9" : row % 2 === 0 ? "#fafafa" : null),
        hLineColor: () => "#e2e8f0",
        vLineColor: () => "#e2e8f0",
      },
    },
    // Totals table on the right
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 220,
          margin: [0, 10, 0, 0],
          table: {
            widths: ["*", 90],
            body: [
              [
                { text: "Subtotal", style: "totalLabel" },
                { text: vndMoney(quotation.subtotal, quotation.currency), style: "totalValue", alignment: "right" },
              ],
              [
                { text: `Giảm chung (${quotation.discount}%)`, style: "totalLabel" },
                {
                  text: vndMoney(Math.round(-quotation.subtotal * (quotation.discount / 100)), quotation.currency),
                  style: "totalValue",
                  alignment: "right",
                },
              ],
              [
                { text: `VAT (${quotation.tax}%)`, style: "totalLabel" },
                {
                  text: vndMoney(
                    Math.round(
                      quotation.subtotal * (1 - quotation.discount / 100) * (quotation.tax / 100),
                    ),
                    quotation.currency,
                  ),
                  style: "totalValue",
                  alignment: "right",
                },
              ],
              [
                { text: "TỔNG CỘNG", style: "totalLabelBig" },
                { text: vndMoney(quotation.total, quotation.currency), style: "totalValueBig", alignment: "right" },
              ],
            ],
          },
          layout: {
            hLineColor: () => "#cbd5e1",
            vLineColor: () => "#cbd5e1",
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
              i === 0 || i === node.table.body.length ? 0 : 0.5,
            vLineWidth: () => 0,
          },
        },
      ],
    },
  ];

  if (quotation.notes) {
    content.push({
      text: "Ghi chú",
      style: "h2",
      margin: [0, 20, 0, 4],
    });
    content.push({ text: quotation.notes, style: "body" });
  }

  const doc: DocDefinition = {
    pageSize: "A4",
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.3 },
    content,
    styles: {
      docTitle: { fontSize: 24, bold: true, color: "#0f172a" },
      subtitle: { fontSize: 11, color: "#64748b", margin: [0, 2, 0, 0] },
      h2: { fontSize: 12, bold: true, color: "#0f172a" },
      th: { bold: true, fillColor: "#f1f5f9", fontSize: 9, color: "#0f172a" },
      label: { fontSize: 8, color: "#64748b", bold: true },
      value: { fontSize: 10, color: "#0f172a" },
      muted: { fontSize: 9, color: "#94a3b8" },
      body: { fontSize: 10, color: "#1e293b" },
      totalLabel: { fontSize: 9, color: "#475569" },
      totalValue: { fontSize: 10, color: "#0f172a" },
      totalLabelBig: { fontSize: 11, bold: true, color: "#0f172a" },
      totalValueBig: { fontSize: 13, bold: true, color: "#0f172a" },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `HSI – HPT Vietnam   ·   ${quotation.number}   ·   Trang ${currentPage}/${pageCount}`,
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

export async function renderQuotationXLSX(
  quotation: Quotation,
  account: Account | null,
): Promise<Buffer> {
  const items = (quotation.items ?? []) as unknown as QuotationItem[];
  const taxPct = quotation.tax ?? 0;
  const overallDiscount = quotation.discount ?? 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "HSI Sales AI";
  wb.created = new Date();
  const ws = wb.addWorksheet("HPT");

  // Column widths — copied from the sample.
  const widths = [6.6, 59.7, 5.4, 18, 18.3, 13.7, 16.4];
  ws.columns = widths.map((w) => ({ width: w }));

  const arial = (size: number, opts: Partial<ExcelJS.Font> = {}) => ({
    name: "Arial",
    size,
    ...opts,
  });
  const thinAll = {
    top: { style: "thin" as const },
    bottom: { style: "thin" as const },
    left: { style: "thin" as const },
    right: { style: "thin" as const },
  };
  const headerBorder = (sidePos: "first" | "middle" | "last"): Partial<ExcelJS.Borders> => ({
    top: { style: "medium" },
    bottom: { style: "thin" },
    left: { style: sidePos === "first" ? "medium" : "thin" },
    right: { style: sidePos === "last" ? "medium" : "thin" },
  });

  // Row 1: HPT company info (right column block).
  ws.mergeCells("B1:G1");
  const b1 = ws.getCell("B1");
  b1.value =
    "HPT VIETNAM CORPORATION\n" +
    "HPT SYSTEM INTEGRATION\n" +
    "Office: Lot E2a-3, D1 St., Saigon High Tech Park, Tang Nhon Phu Ward, HCMC, Vietnam\n" +
    "Tel: + (84 28) 54 123 400 • Fax: + (84 28) 54 108 801 • Website: www.hpt.vn";
  b1.font = arial(9, { bold: true });
  b1.alignment = { horizontal: "right", vertical: "top", wrapText: true };
  ws.getRow(1).height = 48;

  // Row 2: "QUOTATION" title, navy.
  ws.mergeCells("A2:G2");
  const a2 = ws.getCell("A2");
  a2.value = "QUOTATION";
  a2.font = arial(20, { bold: true, color: { argb: NAVY } });
  a2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 38;

  // Row 3: To / Date
  ws.getCell("B3").value = `To: ${account?.companyName ?? "—"}`;
  ws.getCell("B3").font = arial(10, { bold: true });
  ws.getCell("F3").value = "Date:";
  ws.getCell("F3").font = arial(10, { bold: true });
  ws.getCell("F3").alignment = { horizontal: "right" };
  ws.getCell("G3").value = vndDate(quotation.createdAt);
  ws.getCell("G3").font = arial(10);

  // Row 4: RFP / Valid until
  ws.getCell("B4").value = `RFP: ${quotation.title}`;
  ws.getCell("B4").font = arial(10, { bold: true });
  ws.getCell("F4").value = "Valid until: ";
  ws.getCell("F4").font = arial(10, { bold: true });
  ws.getCell("F4").alignment = { horizontal: "right" };
  ws.getCell("G4").value = quotation.validUntil ? vndDate(quotation.validUntil) : "—";
  ws.getCell("G4").font = arial(10);

  // Row 5: intro
  ws.mergeCells("A5:G5");
  const a5 = ws.getCell("A5");
  a5.value = "We would like to offer the required products with our prices and specifications as follows:";
  a5.font = arial(10);

  // Row 7: table header (green).
  const headerRow = 7;
  ws.getRow(headerRow).height = 26.45;
  const headers = [
    "No",
    "Product Description",
    "Qty",
    "Unit Price Before\nVAT (VNĐ)",
    "Tolal Before VAT (VNĐ)",
    "VAT (VNĐ)",
    "Total After\nVAT (VNĐ)",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = arial(10, { bold: true });
    cell.alignment = { horizontal: "center", vertical: "top", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } };
    cell.border = headerBorder(
      i === 0 ? "first" : i === headers.length - 1 ? "last" : "middle",
    );
  });

  // Item rows.
  let row = headerRow + 1;
  const firstItemRow = row;
  items.forEach((it, idx) => {
    // Compose product description: name (bold-ish) + vendor + description.
    const descLines: string[] = [it.name];
    if (it.vendor) descLines.push(it.vendor);
    if (it.description) descLines.push(it.description);
    const desc = descLines.join("\n");

    const lineBeforeVAT = it.lineTotal; // after line discount
    const lineVAT = Math.round(lineBeforeVAT * (taxPct / 100));
    const lineTotal = lineBeforeVAT + lineVAT;

    const cells = [
      idx + 1,
      desc,
      it.qty,
      it.unitPrice,
      lineBeforeVAT,
      lineVAT,
      lineTotal,
    ];
    cells.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      cell.font = arial(10);
      cell.border = thinAll;
      if (i === 1) {
        cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      } else if (i === 0 || i === 2) {
        cell.alignment = { horizontal: "center", vertical: "top" };
      } else {
        cell.alignment = { horizontal: "right", vertical: "top" };
        cell.numFmt = MONEY_FMT;
      }
    });
    // Make tall enough for multi-line description.
    const lineCount = desc.split("\n").length;
    ws.getRow(row).height = Math.max(20, 15 * lineCount);
    row++;
  });
  if (items.length === 0) {
    // Empty placeholder row so the table still renders sensibly.
    for (let i = 1; i <= 7; i++) ws.getCell(row, i).border = thinAll;
    row++;
  }
  const lastItemRow = row - 1;

  // Totals block — 3 rows, merged A:D as label, right column shows value.
  const totalsBeforeVAT = items.reduce((s, it) => s + it.lineTotal, 0);
  const subtotalAfterOverall = Math.round(totalsBeforeVAT * (1 - overallDiscount / 100));
  const totalVAT = Math.round(subtotalAfterOverall * (taxPct / 100));
  const grandTotal = subtotalAfterOverall + totalVAT;

  const totalRows: Array<{ label: string; col: "E" | "F" | "G"; value: number }> = [
    { label: "Total Before VAT (VNĐ):", col: "E", value: subtotalAfterOverall },
    { label: "VAT (VNĐ):", col: "F", value: totalVAT },
    { label: "Total After VAT (VNĐ):", col: "G", value: grandTotal },
  ];
  const totalsStart = row;
  totalRows.forEach((t) => {
    ws.mergeCells(`A${row}:D${row}`);
    const labelCell = ws.getCell(`A${row}`);
    labelCell.value = t.label;
    labelCell.font = arial(10, { bold: true, color: { argb: BLUE_TOTAL } });
    labelCell.alignment = { horizontal: "right", vertical: "top", wrapText: true };
    labelCell.border = thinAll;

    // Apply borders to the merged-over cells too so the outline stays clean.
    for (const c of ["B", "C", "D"] as const) ws.getCell(`${c}${row}`).border = thinAll;

    // Empty cells in untouched currency columns (still border them).
    (["E", "F", "G"] as const).forEach((col) => {
      const cell = ws.getCell(`${col}${row}`);
      cell.font = arial(10, { bold: true, color: { argb: BLUE_TOTAL } });
      cell.alignment = { horizontal: "right", vertical: "top" };
      cell.border = thinAll;
      cell.numFmt = MONEY_FMT;
      if (col === t.col) cell.value = t.value;
    });
    row++;
  });
  // Outer medium border on the totals + header block.
  for (let r = headerRow; r < totalsStart + totalRows.length; r++) {
    const left = ws.getCell(r, 1);
    const right = ws.getCell(r, 7);
    left.border = { ...left.border, left: { style: "medium" } };
    right.border = { ...right.border, right: { style: "medium" } };
  }

  // "In Words" line, merged A:G.
  ws.mergeCells(`A${row}:G${row}`);
  const inWords = ws.getCell(`A${row}`);
  inWords.value = `(In Words: ${vndInWords(grandTotal)})`;
  inWords.font = arial(10, { italic: true });
  inWords.alignment = { horizontal: "left", vertical: "top", wrapText: true };
  row++;

  // Spacer
  row++;

  // Terms & conditions
  ws.getCell(`A${row}`).value = "TERMS & CONDITIONS:";
  ws.getCell(`A${row}`).font = arial(10, { bold: true });
  row++;
  const terms = [
    "1. At present, software is not subject to VAT.",
    "    In case, the Government change VAT rate at the time of issue tax invoice, VAT is subject to the new VAT rate.",
    "2. Payment: T/T or cash.",
    "    2.1.  Payment term: 100% within 30 days after the completion of software delivery and receipt of payment document.",
    "    2.2.  Account number of HPT Vietnam as follows:",
    "    HPT VietNam Corp.",
    "    Account No.: 3150763149 VND",
    "    Bank: Joint Stock Commercial Bank for Investment and Development of Vietnam (BIDV) – Phu Nhuan Branch",
    "3. Delivery time: 02 to 03 weeks",
  ];
  terms.forEach((t) => {
    ws.getCell(`B${row}`).value = t;
    ws.getCell(`B${row}`).font = arial(10);
    ws.getCell(`B${row}`).alignment = { vertical: "top", wrapText: true };
    row++;
  });

  // Notes from the quotation (optional).
  if (quotation.notes) {
    row++;
    ws.getCell(`A${row}`).value = "NOTES:";
    ws.getCell(`A${row}`).font = arial(10, { bold: true });
    row++;
    ws.mergeCells(`A${row}:G${row}`);
    const notesCell = ws.getCell(`A${row}`);
    notesCell.value = quotation.notes;
    notesCell.font = arial(10);
    notesCell.alignment = { vertical: "top", wrapText: true };
    row++;
  }

  // Spacer + closing
  row++;
  ws.getCell(`A${row}`).value =
    "Thank you for your attention. Please feel free to contact us for any further information.";
  ws.getCell(`A${row}`).font = arial(10);
  row++;
  ws.getCell(`A${row}`).value = "Yours Sincerely,";
  ws.getCell(`A${row}`).font = arial(10);
  row += 3;

  // Signature block: HPT side (B) + Customer side (F)
  ws.getCell(`B${row}`).value = "On behalf of HPT";
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = { horizontal: "center" };
  ws.getCell(`F${row}`).value = "Customer's confirmation";
  ws.getCell(`F${row}`).font = arial(10, { bold: true });
  ws.getCell(`F${row}`).alignment = { horizontal: "center" };
  row++;
  ws.getCell(`B${row}`).value = "DEPUTY CEO";
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = { horizontal: "center" };
  row += 6;
  ws.getCell(`B${row}`).value = "NGUYEN QUYEN";
  ws.getCell(`B${row}`).font = arial(10, { bold: true });
  ws.getCell(`B${row}`).alignment = { horizontal: "center" };

  // Page setup so print preview matches the look-and-feel.
  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  // Quiet unused-warning belt-and-suspenders for first/last item references.
  void firstItemRow;
  void lastItemRow;

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}
