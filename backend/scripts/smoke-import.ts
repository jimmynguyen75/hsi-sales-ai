/**
 * Smoke test: parse CSV + dry-run import + real import, verify row counts.
 * Uses a unique vendor prefix so the rows can be cleaned up after.
 */
import { parseCsv, importAccounts, importProducts } from "../src/services/csv-import.js";
import { prisma } from "../src/lib/prisma.js";

const SMOKE_VENDOR = "SmokeCo";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("no admin — seed first");

  // --- Test 1: parser edge cases ---
  const csv = `companyName,industry,notes
"Acme, Inc.",Technology,"Note with
newline and ""quotes"""
Beta,Finance,Simple
,,Missing name should be an error`;
  const rows = parseCsv(csv);
  console.log(`✓ parsed ${rows.length} rows`);
  console.log(`  row 1 notes: ${JSON.stringify(rows[0].notes)}`);
  if (rows[0].companyName !== "Acme, Inc.") throw new Error("quoted field parse failed");
  if (!rows[0].notes.includes("newline")) throw new Error("multiline field parse failed");
  if (!rows[0].notes.includes('"quotes"')) throw new Error("escaped quotes parse failed");

  // --- Test 2: semicolon delimiter auto-detect ---
  const semi = `vendor;name;listPrice\nDell;PowerEdge R750;100000000\n`;
  const srows = parseCsv(semi);
  if (srows.length !== 1 || srows[0].vendor !== "Dell") throw new Error("semicolon delim failed");
  console.log(`✓ semicolon delimiter auto-detected`);

  // --- Test 3: accounts dry-run ---
  const dryRunReport = await importAccounts(rows, admin.id, true);
  console.log(
    `✓ accounts dry-run: ${dryRunReport.totalRows} rows, ${dryRunReport.errors.length} errors`,
  );
  if (dryRunReport.created !== 0) throw new Error("dry-run should not create");

  // --- Test 4: products real import ---
  const pCsv = `vendor,sku,name,category,unit,listPrice
${SMOKE_VENDOR},SM-001,${SMOKE_VENDOR} Widget A,server,unit,5000000
${SMOKE_VENDOR},SM-002,${SMOKE_VENDOR} Widget B,security,license,8000000
${SMOKE_VENDOR},,${SMOKE_VENDOR} No SKU,software,unit,1000000`;
  const pRows = parseCsv(pCsv);
  const pReport = await importProducts(pRows, false);
  console.log(
    `✓ products: created=${pReport.created} updated=${pReport.updated} errors=${pReport.errors.length}`,
  );
  if (pReport.created !== 3) throw new Error(`expected 3 created, got ${pReport.created}`);

  // Re-import same CSV — should update (not duplicate).
  const pReport2 = await importProducts(pRows, false);
  console.log(
    `✓ re-import products: created=${pReport2.created} updated=${pReport2.updated} (dedupe by sku)`,
  );
  if (pReport2.updated !== 3)
    throw new Error(`expected 3 updated on re-import, got ${pReport2.updated}`);

  // --- Cleanup ---
  await prisma.product.deleteMany({ where: { vendor: SMOKE_VENDOR } });
  console.log("\n✓ cleanup OK");
  console.log("\n✓ import smoke test passed");
}

main()
  .catch((err) => {
    console.error("✗ smoke-import failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
