/**
 * Smoke test: render a sample Proposal PDF, Quotation PDF, and Quotation DOCX
 * from existing seed data. Writes files to /tmp/ so you can open them.
 * Run: npx tsx scripts/smoke-export.ts
 */
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import {
  renderProposalPDF,
  renderQuotationPDF,
  renderQuotationDOCX,
} from "../src/services/document-export.js";

const prisma = new PrismaClient();

async function main() {
  // Grab any proposal that has sections
  const proposals = await prisma.proposal.findMany({ take: 5, orderBy: { createdAt: "desc" } });
  const proposal =
    proposals.find((p) => {
      const arr = p.sections as unknown as unknown[];
      return Array.isArray(arr) && arr.length > 0;
    }) ?? proposals[0];

  if (proposal) {
    const account = proposal.accountId
      ? await prisma.account.findUnique({ where: { id: proposal.accountId } })
      : null;
    const pdf = await renderProposalPDF(proposal, account);
    writeFileSync("/tmp/hsi-proposal.pdf", pdf);
    console.log(`✓ proposal PDF: ${pdf.length} bytes → /tmp/hsi-proposal.pdf`);
  } else {
    console.log("✗ no proposals in DB, skipping proposal PDF");
  }

  // Any quotation with items
  const quotations = await prisma.quotation.findMany({ take: 5, orderBy: { createdAt: "desc" } });
  const quotation =
    quotations.find((q) => {
      const arr = q.items as unknown as unknown[];
      return Array.isArray(arr) && arr.length > 0;
    }) ?? quotations[0];

  if (quotation) {
    const account = quotation.accountId
      ? await prisma.account.findUnique({ where: { id: quotation.accountId } })
      : null;
    const pdf = await renderQuotationPDF(quotation, account);
    writeFileSync("/tmp/hsi-quotation.pdf", pdf);
    console.log(`✓ quotation PDF: ${pdf.length} bytes → /tmp/hsi-quotation.pdf`);

    const docx = await renderQuotationDOCX(quotation, account);
    writeFileSync("/tmp/hsi-quotation.docx", docx);
    console.log(`✓ quotation DOCX: ${docx.length} bytes → /tmp/hsi-quotation.docx`);
  } else {
    console.log("✗ no quotations in DB, skipping quotation exports");
  }

  console.log("\n✓ export smoke test passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
