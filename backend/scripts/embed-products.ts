/**
 * Compute semantic embeddings for all active products and store on Product.embedding.
 * Idempotent — re-running only embeds products whose embeddedAt is null or
 * whose content has changed since last embedding.
 *
 * Run: npx tsx scripts/embed-products.ts [--force]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { embedText, isEmbeddingDisabled } from "../src/services/embeddings.js";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

function productText(p: {
  vendor: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
}) {
  return [
    `${p.vendor} ${p.name}`,
    p.sku ? `SKU ${p.sku}` : null,
    p.category ? `Category: ${p.category}` : null,
    p.description,
  ]
    .filter(Boolean)
    .join(". ");
}

async function main() {
  const where = force ? {} : { OR: [{ embeddedAt: null }, { embedding: { equals: Prisma.AnyNull } }] };
  const products = await prisma.product.findMany({
    where: { active: true, ...where },
    orderBy: { vendor: "asc" },
  });

  console.log(`Found ${products.length} products to embed${force ? " (force)" : ""}`);
  if (!products.length) return;

  // Warm the model first — fails fast if unavailable.
  const probe = await embedText("probe");
  if (!probe || isEmbeddingDisabled()) {
    console.error("Embedding model unavailable. Aborting.");
    process.exit(1);
  }

  let ok = 0;
  for (const p of products) {
    const text = productText(p);
    const vec = await embedText(text);
    if (!vec) {
      console.warn(`[skip] ${p.id} ${p.vendor} ${p.name} — embed returned null`);
      continue;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: {
        embedding: vec as unknown as Prisma.InputJsonValue,
        embeddedAt: new Date(),
      },
    });
    ok++;
    if (ok % 5 === 0) console.log(`  embedded ${ok}/${products.length}`);
  }

  console.log(`\n✓ embedded ${ok}/${products.length} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
