/**
 * Smoke test: verify semantic RAG returns sensibly ranked products.
 * Run: npx tsx scripts/smoke-rag.ts
 */
import { retrieveProductContext } from "../src/services/chat-ai.js";
import { isEmbeddingReady, isEmbeddingDisabled } from "../src/services/embeddings.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const QUERIES = [
  "firewall hiệu năng cao cho ngân hàng 10Gbps",
  "storage all-flash cho VMware environment",
  "endpoint protection đối phó ransomware",
  "email productivity cho doanh nghiệp 500 user",
  "máy chủ blade server cho data center",
];

async function main() {
  for (const q of QUERIES) {
    const hits = await retrieveProductContext(q);
    console.log(`\n"${q}"`);
    console.log(`  semantic-ready=${isEmbeddingReady()} disabled=${isEmbeddingDisabled()}`);
    console.log(`  → ${hits.length} hits`);
    hits.slice(0, 5).forEach((h, i) => console.log(`    ${i + 1}. ${h.label}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
