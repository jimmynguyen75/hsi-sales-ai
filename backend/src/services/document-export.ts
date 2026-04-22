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
