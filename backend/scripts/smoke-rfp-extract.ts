/**
 * Smoke test: extract text from a real PDF on disk.
 * Run: npx tsx scripts/smoke-rfp-extract.ts [path-to-pdf]
 * Default path: /tmp/hsi-smoke.pdf (generate with `cupsfilter hello.txt > /tmp/hsi-smoke.pdf`).
 */
import { readFileSync } from "fs";
import { extractTextFromFile } from "../src/services/rfp-extract.js";

const pdfPath = process.argv[2] ?? "/tmp/hsi-smoke.pdf";

async function main() {
  const buf = readFileSync(pdfPath);
  console.log(`PDF: ${pdfPath} (${buf.length} bytes)`);

  const pdf = await extractTextFromFile(buf, "smoke.pdf");
  console.log("--- PDF extract ---");
  console.log(`pageCount: ${pdf.pageCount}`);
  console.log(`text length: ${pdf.text.length}`);
  console.log(`first 300 chars: ${pdf.text.slice(0, 300).replace(/\n/g, "↵")}`);

  if (pdf.text.length < 5) {
    console.error("FAIL: extracted text too short");
    process.exit(1);
  }

  // Error path: unsupported format
  try {
    await extractTextFromFile(Buffer.from("not a real file"), "smoke.xls");
    console.error("FAIL: expected unsupported-format error");
    process.exit(1);
  } catch (e) {
    console.log(`Unsupported-format path OK: ${(e as Error).message}`);
  }

  console.log("\n✓ rfp-extract smoke test passed");
}

main().catch((e) => {
  console.error("✗ smoke test failed:", e);
  process.exit(1);
});
