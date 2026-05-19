import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";

export const contactsRouter = Router();

contactsRouter.get("/", async (req, res, next) => {
  try {
    const { accountId } = req.query as { accountId?: string };
    const contacts = await prisma.contact.findMany({
      where: accountId ? { accountId } : undefined,
      orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
    });
    ok(res, contacts);
  } catch (e) {
    next(e);
  }
});

const contactSchema = z.object({
  fullName: z.string().min(1),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  // ISO date string, e.g. "1985-04-22T00:00:00.000Z" or "1985-04-22".
  birthday: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  accountId: z.string(),
  isPrimary: z.boolean().optional(),
});

// Normalise the birthday string into a Date (or null) so Prisma stays happy.
function normalizeBirthday(b: string | null | undefined): Date | null | undefined {
  if (b === undefined) return undefined;
  if (b === null || b === "") return null;
  return new Date(b);
}

contactsRouter.post("/", async (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const contact = await prisma.contact.create({
      data: {
        ...input,
        email: input.email || null,
        birthday: normalizeBirthday(input.birthday),
      },
    });
    ok(res, contact);
  } catch (e) {
    next(e);
  }
});

contactsRouter.put("/:id", async (req, res, next) => {
  try {
    const input = contactSchema.partial().parse(req.body);
    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: { ...input, birthday: normalizeBirthday(input.birthday) },
    });
    ok(res, contact);
  } catch (e) {
    next(e);
  }
});

contactsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
