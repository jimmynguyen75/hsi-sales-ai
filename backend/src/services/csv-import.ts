/**
 * Minimal RFC 4180 CSV parser + account/product importers.
 *
 * Why not a CSV lib: our needs are narrow (UTF-8 comma/semicolon, quoted
 * fields, CRLF or LF) and the entire impl fits in ~40 lines. Saves a dep.
 *
 * The importers return a `BulkReport` with row-level results so the UI can
 * show "23 OK, 2 skipped (duplicate), 1 error" instead of just a boolean.
 */
import { prisma } from "../lib/prisma.js";

export interface CsvRow {
  [col: string]: string;
}

export interface BulkReport {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
  preview?: CsvRow[]; // first N rows for dry-run
}

/**
 * Parse CSV text into a list of row objects. First line must be the header.
 * Auto-detects comma vs semicolon by whichever appears more in the header.
 */
export function parseCsv(text: string): CsvRow[] {
  // Strip BOM that Excel sometimes writes
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return [];

  // Detect delimiter from the header line
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows = tokenize(text, delim);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: CsvRow = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = (cells[i] ?? "").trim();
    }
    return obj;
  });
}

/**
 * Tokenize CSV text into rows of cell strings. Handles quoted fields, embedded
 * quotes (doubled), CR/LF line endings. Skips fully empty trailing rows.
 */
function tokenize(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      cur.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(cell);
      if (!(cur.length === 1 && cur[0] === "")) rows.push(cur);
      cur = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Trailing cell/row (no final newline)
  if (cell || cur.length > 0) {
    cur.push(cell);
    if (!(cur.length === 1 && cur[0] === "")) rows.push(cur);
  }
  return rows;
}

// =============== Account import ===============

export async function importAccounts(
  rows: CsvRow[],
  ownerId: string,
  dryRun: boolean,
): Promise<BulkReport> {
  const report: BulkReport = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    preview: dryRun ? rows.slice(0, 10) : undefined,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = row.companyName ?? row.company_name ?? row.name ?? "";
    if (!companyName) {
      report.errors.push({ row: i + 2, reason: "Thiếu companyName" });
      continue;
    }

    if (dryRun) continue;

    try {
      // Dedupe by exact companyName match for the same owner. Re-importing
      // the same sheet a second time should update, not create duplicates.
      const existing = await prisma.account.findFirst({
        where: { companyName, ownerId },
      });
      const data = {
        companyName,
        industry: row.industry || null,
        size: row.size || null,
        website: row.website || null,
        address: row.address || null,
        notes: row.notes || null,
      };
      if (existing) {
        await prisma.account.update({ where: { id: existing.id }, data });
        report.updated++;
      } else {
        await prisma.account.create({ data: { ...data, ownerId } });
        report.created++;
      }
    } catch (err) {
      report.errors.push({
        row: i + 2,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return report;
}

// =============== Product import ===============

export async function importProducts(rows: CsvRow[], dryRun: boolean): Promise<BulkReport> {
  const report: BulkReport = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    preview: dryRun ? rows.slice(0, 10) : undefined,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const vendor = row.vendor ?? "";
    const name = row.name ?? "";
    if (!vendor || !name) {
      report.errors.push({ row: i + 2, reason: "Thiếu vendor hoặc name" });
      continue;
    }
    const listPrice = Number(row.listPrice ?? row.list_price ?? 0);
    if (!Number.isFinite(listPrice) || listPrice < 0) {
      report.errors.push({ row: i + 2, reason: `listPrice không hợp lệ: ${row.listPrice}` });
      continue;
    }

    if (dryRun) continue;

    try {
      // Dedupe by (vendor, sku) when sku is present; else by (vendor, name).
      const sku = row.sku || null;
      const existing = sku
        ? await prisma.product.findFirst({ where: { vendor, sku } })
        : await prisma.product.findFirst({ where: { vendor, name } });
      const data = {
        vendor,
        sku,
        name,
        description: row.description || null,
        category: row.category || null,
        unit: row.unit || "unit",
        listPrice,
        partnerCost: row.partnerCost ? Number(row.partnerCost) : null,
        currency: row.currency || "VND",
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        report.updated++;
      } else {
        await prisma.product.create({ data });
        report.created++;
      }
    } catch (err) {
      report.errors.push({
        row: i + 2,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return report;
}
