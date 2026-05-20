/**
 * Quotation XLSX import — parses a quotation Excel file and returns a
 * structured payload the route handler can persist as a new Quotation.
 *
 * Designed to be tolerant: the team uses several template variations
 * (HPT-branded, partner-supplied) so the parser scans for header keywords
 * rather than locking to fixed cell addresses. Both Vietnamese and English
 * header labels are recognised.
 *
 * Returned shape:
 *   {
 *     title, customerName, validUntil,
 *     items: [{ name, partNumber, description, qty, unitPrice, vatPct }],
 *     warnings: string[],
 *   }
 *
 * The route handler is responsible for account matching, persistence, and
 * audit logging. This service only parses.
 */
import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { generateStructured } from "../lib/ai.js";

export interface ParsedLineItem {
  name: string;
  description?: string;
  vendor?: string;
  qty: number;
  unitPrice: number;
  vatPct?: number;
  partNumber?: string;
}

export interface ParsedQuotation {
  title: string | null;
  customerName: string | null;
  validUntil: Date | null;
  items: ParsedLineItem[];
  warnings: string[];
}

/** Case-insensitive substring search over a cell value, normalised to
 *  string. Returns lowercase trimmed string or "". */
function lc(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText
      .map((r) => (typeof r === "object" && "text" in r ? r.text : ""))
      .join("")
      .toLowerCase()
      .trim();
  }
  return String(v).toLowerCase().trim();
}

function strVal(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText
      .map((r) => (typeof r === "object" && "text" in r ? r.text : ""))
      .join("");
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in v) {
    return String((v as { result?: unknown }).result ?? "");
  }
  return String(v);
}

function numVal(v: ExcelJS.CellValue): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" ? r : Number(r) || 0;
  }
  const s = String(v).replace(/[^\d.-]/g, "");
  return Number(s) || 0;
}

/** Strip a leading label like "To:" / "Kính gửi:" from a cell value and
 *  return what's left, trimmed. Returns null if nothing meaningful. */
function afterColon(raw: string): string | null {
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  const rest = raw.slice(idx + 1).trim();
  return rest || null;
}

/** Header-row detector. A row counts as the header row when at least 3 of
 *  these signals are present somewhere in it. */
const HEADER_KEYWORDS = [
  /\b(stt|no\.?)\b/i,
  /(mô\s*tả|description|product)/i,
  /(qty|sl|số\s*lượng)/i,
  /(unit\s*price|đơn\s*giá)/i,
  /(vat|thuế)/i,
  /(total|thành\s*tiền|tổng)/i,
  /(mã\s*hàng|part\s*number|sku)/i,
];

function scoreHeaderRow(values: string[]): number {
  let score = 0;
  for (const kw of HEADER_KEYWORDS) {
    if (values.some((v) => kw.test(v))) score++;
  }
  return score;
}

/** Find the column indices we care about by inspecting the header row. */
interface ColumnMap {
  stt: number | null;
  partNumber: number | null;
  description: number | null;
  qty: number | null;
  unitPrice: number | null;
  vat: number | null;
  total: number | null;
}

function mapColumns(headerCells: string[]): ColumnMap {
  const out: ColumnMap = {
    stt: null,
    partNumber: null,
    description: null,
    qty: null,
    unitPrice: null,
    vat: null,
    total: null,
  };
  headerCells.forEach((cell, idx) => {
    const v = cell.toLowerCase();
    if (out.stt == null && /\b(stt|no\.?)\b/.test(v)) out.stt = idx;
    else if (out.partNumber == null && /(mã\s*hàng|part\s*number|sku|p\/n)/.test(v))
      out.partNumber = idx;
    else if (out.description == null && /(mô\s*tả|description|product)/.test(v))
      out.description = idx;
    else if (out.qty == null && /(qty|sl\b|số\s*lượng)/.test(v)) out.qty = idx;
    else if (
      out.unitPrice == null &&
      /(unit\s*price|đơn\s*giá)/.test(v) &&
      !/total|tổng|thành/.test(v)
    )
      out.unitPrice = idx;
    else if (out.vat == null && /(vat|thuế).*(%|rate)/.test(v)) out.vat = idx;
    else if (out.total == null && /(total|thành\s*tiền|tổng)/.test(v) && !/vat/.test(v))
      out.total = idx;
  });
  return out;
}

/** Try to extract title / customer / valid-until from cells above the
 *  table. We scan the first 15 rows for labelled cells. */
function extractMetadata(ws: ExcelJS.Worksheet, headerRow: number): {
  title: string | null;
  customerName: string | null;
  validUntil: Date | null;
} {
  let title: string | null = null;
  let customerName: string | null = null;
  let validUntil: Date | null = null;

  for (let r = 1; r < headerRow; r++) {
    for (let col = 1; col <= ws.actualColumnCount; col++) {
      const raw = strVal(ws.getCell(r, col).value);
      if (!raw) continue;
      const low = raw.toLowerCase();
      // "To: <name>" / "Kính gửi: <name>"
      if (
        customerName == null &&
        /^(\s*)(to|kính\s*gửi|customer|khách\s*hàng)\s*:/i.test(raw)
      ) {
        customerName = afterColon(raw);
      }
      // "RFP: <title>" / "Đề mục: <title>" / "Subject: <title>"
      if (
        title == null &&
        /^(\s*)(rfp|đề\s*mục|đề\s*tài|subject|title|nội\s*dung)\s*:/i.test(raw)
      ) {
        title = afterColon(raw);
      }
      // "Valid until: <date>" / "Có hiệu lực đến: <date>"
      if (validUntil == null && /(valid\s*until|có\s*hiệu\s*lực)/i.test(low)) {
        // Date might be in the same cell after a colon, or in the next cell.
        const tail = afterColon(raw);
        const candidate = tail ?? strVal(ws.getCell(r, col + 1).value);
        const parsed = parseDate(candidate);
        if (parsed) validUntil = parsed;
      }
    }
  }

  return { title, customerName, validUntil };
}

/** Parse a date string in vi-VN ("19/5/2026"), ISO, or various others.
 *  Returns null when nothing usable. */
function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  // D/M/YYYY or DD/MM/YYYY
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(trimmed);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(+dt) ? null : dt;
  }
  // ISO
  const iso = new Date(trimmed);
  return isNaN(+iso) ? null : iso;
}

/** Main entrypoint. */
export async function parseQuotationXLSX(buf: Buffer): Promise<ParsedQuotation> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const warnings: string[] = [];

  // Pick the first sheet that has line-item-like content.
  let bestWs: ExcelJS.Worksheet | null = null;
  let bestHeader = -1;
  let bestScore = 0;
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.actualRowCount, 50); r++) {
      const cells: string[] = [];
      for (let col = 1; col <= Math.max(ws.actualColumnCount, 10); col++) {
        cells.push(lc(ws.getCell(r, col).value));
      }
      const s = scoreHeaderRow(cells);
      if (s > bestScore) {
        bestScore = s;
        bestHeader = r;
        bestWs = ws;
      }
    }
  }

  if (!bestWs || bestScore < 3 || bestHeader < 1) {
    return {
      title: null,
      customerName: null,
      validUntil: null,
      items: [],
      warnings: [
        "Không nhận diện được bảng line-item trong file. Kiểm tra header phải có các cột STT / Mô tả / SL / Đơn giá.",
      ],
    };
  }
  const ws = bestWs;
  const headerRow = bestHeader;

  // Header cells as strings.
  const colCount = Math.max(ws.actualColumnCount, 10);
  const headerCells: string[] = [];
  for (let col = 1; col <= colCount; col++) {
    headerCells.push(strVal(ws.getCell(headerRow, col).value));
  }
  const map = mapColumns(headerCells);

  if (map.description == null) warnings.push("Không tìm được cột 'Mô tả sản phẩm'.");
  if (map.qty == null) warnings.push("Không tìm được cột 'SL / Qty'.");
  if (map.unitPrice == null) warnings.push("Không tìm được cột 'Đơn giá / Unit Price'.");

  // Header info (To, RFP, Valid until) from rows above the table.
  const meta = extractMetadata(ws, headerRow);

  // Walk rows after the header until we hit a "Total" / "Subtotal" label
  // or 3 consecutive blank rows.
  //
  // Two row patterns supported:
  //   - Single-row: every item is one row containing qty + unit price.
  //     name comes from the first line of the description cell.
  //   - Two-row (HPT template): each item is a "group header" row with the
  //     product name in column B and NO qty/price, followed by a "detail"
  //     row with qty + price + (multi-line) description. We detect this by
  //     looking at the row right before the detail row.
  const items: ParsedLineItem[] = [];
  let blankStreak = 0;
  const lastRow = Math.min(ws.actualRowCount, headerRow + 200);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const rowCells: string[] = [];
    for (let col = 1; col <= colCount; col++) {
      rowCells.push(strVal(ws.getCell(r, col).value));
    }
    const joined = rowCells.join(" ").toLowerCase();
    if (
      /\b(total\s+before\s+vat|total\s+after\s+vat|tổng\s+cộng|in\s+words|bằng\s+chữ)\b/.test(
        joined,
      )
    ) {
      break;
    }
    const isBlank = rowCells.every((c) => !c.trim());
    if (isBlank) {
      blankStreak++;
      if (blankStreak >= 3) break;
      continue;
    }
    blankStreak = 0;

    // Detail row predicate: qty > 0 OR unit price > 0.
    const qty = map.qty != null ? numVal(ws.getCell(r, map.qty + 1).value) : 0;
    const unitPrice =
      map.unitPrice != null
        ? numVal(ws.getCell(r, map.unitPrice + 1).value)
        : 0;
    if (qty <= 0 && unitPrice <= 0) continue;

    // Two-row group header detection: previous row has neither qty nor
    // unit price, but has an STT number AND a name in column B (the
    // partNumber-or-description column). If so, treat that as the
    // product name and the current row's description as detail text.
    const descIdx = map.description ?? map.partNumber ?? 1;
    let groupName: string | null = null;
    if (r > headerRow + 1) {
      const prevQty =
        map.qty != null ? numVal(ws.getCell(r - 1, map.qty + 1).value) : 0;
      const prevUnit =
        map.unitPrice != null
          ? numVal(ws.getCell(r - 1, map.unitPrice + 1).value)
          : 0;
      if (prevQty <= 0 && prevUnit <= 0) {
        // Candidate name lives in the partNumber column on this template
        // (B in our exports), so look there first; fall back to the
        // description column.
        const candidateB =
          map.partNumber != null
            ? strVal(ws.getCell(r - 1, map.partNumber + 1).value).trim()
            : "";
        const candidateC = strVal(
          ws.getCell(r - 1, descIdx + 1).value,
        ).trim();
        const cand = candidateB || candidateC;
        if (cand && !/^(stt|no\.?|nội\s*dung|giá\s*trị|sản\s*phẩm)/i.test(cand)) {
          groupName = cand;
        }
      }
    }

    const rawDesc = strVal(ws.getCell(r, descIdx + 1).value).trim();
    let name: string;
    let description: string | undefined;
    let vendor: string | undefined;
    if (groupName) {
      // 2-row format: name = group header B; current B = vendor; current
      // C = description.
      name = groupName;
      vendor =
        map.partNumber != null
          ? strVal(ws.getCell(r, map.partNumber + 1).value).trim() || undefined
          : undefined;
      description = rawDesc || undefined;
    } else {
      // 1-row format: split the description cell by newline.
      if (!rawDesc) continue;
      const [firstLine, ...rest] = rawDesc.split(/\r?\n/);
      name = firstLine.trim();
      description = rest.length ? rest.join("\n").trim() : undefined;
      vendor =
        map.partNumber != null
          ? strVal(ws.getCell(r, map.partNumber + 1).value).trim() || undefined
          : undefined;
    }

    const partNumber =
      map.partNumber != null
        ? strVal(ws.getCell(r, map.partNumber + 1).value).trim() || undefined
        : undefined;
    const vatPctRaw =
      map.vat != null ? numVal(ws.getCell(r, map.vat + 1).value) : NaN;
    const vatPct =
      Number.isFinite(vatPctRaw) && vatPctRaw > 0 && vatPctRaw <= 100
        ? vatPctRaw
        : undefined;

    items.push({
      name,
      description,
      vendor,
      qty: qty || 1,
      unitPrice,
      vatPct,
      partNumber,
    });
  }

  if (items.length === 0) {
    warnings.push(
      "Đọc được header nhưng không tìm thấy line item nào. Kiểm tra lại dữ liệu.",
    );
  }

  return {
    title: meta.title,
    customerName: meta.customerName,
    validUntil: meta.validUntil,
    items,
    warnings,
  };
}

// =========================================================================
// Multi-format extractor + AI-based parser
// =========================================================================
// The XLSX fast-path above is preferred for known templates because it's
// deterministic and free. For other formats (PDF, DOCX, TXT) — and for
// XLSX files whose structure doesn't match our heuristics — we extract
// plain text and ask the LLM to pull the same fields out.

/** Truncate the AI input so we stay well below Groq's context limit
 *  without losing the table region. Quotations almost never exceed
 *  20K chars of usable text; cap at 25K to leave room for the prompt. */
const AI_TEXT_MAX_CHARS = 25_000;

/** Pull readable text out of a quotation file regardless of format.
 *  Returns plain text suitable for an LLM prompt. */
export async function extractQuotationText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return cleanText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    // Flatten every sheet to TSV-ish lines so the LLM sees the table
    // structure preserved (tabs between cells, newlines between rows).
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sections: string[] = [];
    for (const ws of wb.worksheets) {
      const lines: string[] = [`# Sheet: ${ws.name}`];
      const cols = Math.max(ws.actualColumnCount, 8);
      for (let r = 1; r <= ws.actualRowCount; r++) {
        const cells: string[] = [];
        for (let c = 1; c <= cols; c++) {
          cells.push(strVal(ws.getCell(r, c).value));
        }
        // Skip rows that are entirely empty.
        if (cells.every((s) => !s.trim())) continue;
        lines.push(cells.join("\t"));
      }
      sections.push(lines.join("\n"));
    }
    return cleanText(sections.join("\n\n"));
  }

  if (lower.endsWith(".txt") || lower.endsWith(".csv")) {
    return cleanText(buffer.toString("utf8"));
  }

  throw new Error(`Định dạng file không hỗ trợ: ${filename}`);
}

function cleanText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Shape the model is asked to return. Matches ParsedQuotation but with
 *  string dates so it round-trips through JSON cleanly. */
interface AIExtractedQuotation {
  title: string | null;
  customerName: string | null;
  /** YYYY-MM-DD format or null. */
  validUntil: string | null;
  items: Array<{
    name: string;
    description?: string;
    vendor?: string;
    partNumber?: string;
    qty: number;
    unitPrice: number;
    vatPct?: number;
  }>;
}

const AI_SYSTEM_PROMPT = `Bạn là parser báo giá B2B của HPT Vietnam. Người dùng dán nội dung file báo giá (PDF / DOCX / Excel / text), bạn trích xuất ra dữ liệu có cấu trúc.

Trích xuất chính xác các trường sau dưới dạng JSON:

{
  "title": "Tiêu đề báo giá (RFP, Đề mục, Subject) hoặc null",
  "customerName": "Tên công ty khách hàng (sau 'To:' / 'Kính gửi:' / 'Customer:') hoặc null",
  "validUntil": "Ngày hết hạn dạng YYYY-MM-DD (sau 'Valid until' / 'Có hiệu lực đến') hoặc null",
  "items": [
    {
      "name": "Tên sản phẩm — DÒNG ĐẦU/dòng nổi bật nhất, KHÔNG kèm mô tả chi tiết",
      "description": "Mô tả chi tiết (tùy chọn, có thể đa dòng)",
      "vendor": "Hãng (HPE/Dell/IBM/Fortinet/Cisco/...) nếu nhận diện được",
      "partNumber": "SKU / Mã hàng nếu có (vd FG-80F-BDL-950-60)",
      "qty": Số lượng (số nguyên dương, mặc định 1 nếu không thấy),
      "unitPrice": Đơn giá CHƯA VAT (số nguyên VNĐ, đã trừ thousand separators),
      "vatPct": VAT % của dòng (số 0–100), mặc định 10 nếu không thấy
    }
  ]
}

Quy tắc:
- CHỈ trả về JSON, không markdown, không giải thích.
- unitPrice và qty là số (không phải chuỗi), KHÔNG kèm dấu phẩy/chấm thousand-separator.
- unitPrice = GIỮ NGUYÊN con số trong file. KHÔNG tự tính pre-VAT từ post-VAT, KHÔNG tự cộng/trừ VAT. Trừ khi file ghi rõ "Đơn giá đã bao gồm VAT" / "Price including VAT", còn lại coi như con số trong file đã là pre-VAT.
- Bỏ qua các dòng "Total Before VAT", "Tổng cộng", "Bằng chữ" — đó không phải line item.
- Nếu cùng 1 item trải qua nhiều dòng (header + detail), gộp lại thành 1 entry.
- vatPct: lấy theo chỉ định trong file. Nếu file ghi "Software 0%" / "Hardware 10%" thì áp dụng tương ứng cho từng item. Mặc định 10 nếu không rõ.
- Nếu không có items nào, trả "items": [].`;

/** Ask the LLM to extract a quotation from arbitrary text. */
export async function aiParseQuotationText(
  text: string,
  userId: string,
): Promise<ParsedQuotation> {
  const trimmed = text.slice(0, AI_TEXT_MAX_CHARS);
  const warnings: string[] = [];
  if (text.length > AI_TEXT_MAX_CHARS) {
    warnings.push(
      `File dài ${text.length} ký tự; AI chỉ đọc ${AI_TEXT_MAX_CHARS} ký tự đầu. Các item ở cuối file có thể bị bỏ.`,
    );
  }

  let extracted: AIExtractedQuotation;
  try {
    extracted = await generateStructured<AIExtractedQuotation>(
      AI_SYSTEM_PROMPT,
      `Nội dung file báo giá:\n\n${trimmed}\n\n--- HẾT FILE ---\n\nTrích xuất theo schema yêu cầu.`,
      { userId, module: "quotation-import" },
    );
  } catch (e) {
    throw new Error(
      `AI không parse được file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Normalise + light validation. The model is usually well-behaved but
  // guard against missing fields and weird types.
  const items: ParsedLineItem[] = (extracted.items ?? [])
    .map((it) => {
      const qty = Math.max(1, Math.round(Number(it.qty) || 1));
      const unitPrice = Math.max(0, Math.round(Number(it.unitPrice) || 0));
      const vatPct =
        it.vatPct != null
          ? Math.max(0, Math.min(100, Number(it.vatPct)))
          : undefined;
      return {
        name: (it.name || "").trim(),
        description: it.description?.trim() || undefined,
        vendor: it.vendor?.trim() || undefined,
        partNumber: it.partNumber?.trim() || undefined,
        qty,
        unitPrice,
        vatPct,
      };
    })
    .filter((it) => it.name && (it.qty > 0 || it.unitPrice > 0));

  if (items.length === 0) {
    warnings.push("AI không trích xuất được line item nào từ file.");
  }

  return {
    title: (extracted.title || "").trim() || null,
    customerName: (extracted.customerName || "").trim() || null,
    validUntil: extracted.validUntil ? new Date(extracted.validUntil) : null,
    items,
    warnings,
  };
}

/** Top-level entrypoint: detect file type and pick the best parser. For
 *  XLSX we try the deterministic fast-path first and only fall back to the
 *  LLM if it returns nothing — saves an API call when our own export
 *  template is being imported. */
export async function parseQuotationFile(
  buffer: Buffer,
  filename: string,
  userId: string,
): Promise<ParsedQuotation> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const fast = await parseQuotationXLSX(buffer);
    if (fast.items.length > 0) return fast;
    // Fast-path missed — extract as text and let the AI handle it.
    const text = await extractQuotationText(buffer, filename);
    const ai = await aiParseQuotationText(text, userId);
    // Carry over both layers' warnings so the rep sees the whole story.
    ai.warnings = [
      "Không nhận diện được template Excel — đã dùng AI để parse.",
      ...fast.warnings,
      ...ai.warnings,
    ];
    return ai;
  }

  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".csv")
  ) {
    const text = await extractQuotationText(buffer, filename);
    return aiParseQuotationText(text, userId);
  }

  throw new Error(
    `Định dạng file không hỗ trợ: ${filename}. Hỗ trợ: .pdf, .docx, .xlsx, .xls, .txt, .csv`,
  );
}
