/**
 * User management routes — admin only.
 *
 * Everything here is gated by `requireRole("admin")`. Non-admin users hit 403.
 * Login/register live in auth.ts and aren't touched by this router.
 */
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireRole } from "../middleware/rbac.js";

export const usersRouter = Router();

usersRouter.use(requireRole("admin"));

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { accounts: true, deals: true } },
      },
    });
    ok(res, users);
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["sales", "manager", "admin"]).default("sales"),
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return fail(res, 400, "Email đã tồn tại");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    ok(res, user);
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["sales", "manager", "admin"]).optional(),
  password: z.string().min(6).optional(),
});

usersRouter.put("/:id", async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.role) data.role = input.role;
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    ok(res, user);
  } catch (e) {
    next(e);
  }
});

usersRouter.delete("/:id", async (req, res, next) => {
  try {
    // Guard against admin deleting themselves (would lock us out).
    if (req.params.id === req.userId) {
      return fail(res, 400, "Không thể tự xoá tài khoản đang đăng nhập.");
    }
    // Reassigning owned rows is out of scope here — refuse to delete users
    // who still own accounts/deals and make the admin resolve manually.
    const owned = await prisma.account.count({ where: { ownerId: req.params.id } });
    if (owned > 0) {
      return fail(
        res,
        400,
        `User đang sở hữu ${owned} account. Chuyển owner trước khi xoá.`,
      );
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    ok(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});
