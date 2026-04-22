import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const SUPPORTED_UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

/**
 * Extract plain text from a PDF or DOCX buffer. Returns the text plus a best-effort
 * page count (PDFs) — DOCX has no page concept at the XML level so pageCount is 0.
 *
 * Text is normalized: collapse runs of blank lines (>2) and trim trailing whitespace
 * per line, so the AI requirement-extraction prompt doesn't get noisy input.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; pageCount: number }> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // pdf-parse v2.x: construct PDFParse with the buffer as Uint8Array, then getText().
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return { text: cleanText(result.text), pageCount: result.total };
    } finally {
      await parser.destroy();
    }
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: cleanText(result.value), pageCount: 0 };
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
