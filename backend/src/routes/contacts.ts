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
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  accountId: z.string(),
  isPrimary: z.boolean().optional(),
});

contactsRouter.post("/", async (req, res, next) => {
  try {
    const input = contactSchema.parse(req.body);
    const contact = await prisma.contact.create({
      data: { ...input, email: input.email || null },
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
      data: input,
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
