import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({ where: { email: "thunm@hpt.vn" } });
  if (!u) return console.log("thunm not found");
  const uid = u.id;
  const r = await prisma.$transaction([
    prisma.activity.deleteMany({ where: { ownerId: uid } }),
    prisma.deal.deleteMany({ where: { ownerId: uid } }),
    prisma.quotation.deleteMany({ where: { ownerId: uid } }),
    prisma.account.deleteMany({ where: { ownerId: uid } }),
  ]);
  console.log(`Wiped thunm: activities=${r[0].count}, deals=${r[1].count}, quotations=${r[2].count}, accounts=${r[3].count}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
