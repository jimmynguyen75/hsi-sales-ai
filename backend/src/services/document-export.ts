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
