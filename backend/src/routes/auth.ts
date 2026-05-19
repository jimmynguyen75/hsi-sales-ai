import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return fail(res, 401, "Invalid credentials");
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return fail(res, 401, "Invalid credentials");
    const token = signToken({ sub: user.id, role: user.role });
    ok(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return fail(res, 400, "Email already registered");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    const token = signToken({ sub: user.id, role: user.role });
    ok(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

/** Resolve the bearer token to a user id, or null if absent/invalid. */
async function userIdFromAuth(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.slice(7);
  try {
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET ?? "dev-secret") as {
      sub: string;
    };
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

authRouter.get("/me", async (req, res, next) => {
  try {
    const userId = await userIdFromAuth(req.headers.authorization);
    if (!userId) return fail(res, 401, "Missing or invalid token");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(res, 404, "User not found");
    ok(res, { id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (e) {
    next(e);
  }
});

// PUT /api/auth/me — user updates their own profile.
// - name: any non-empty string
// - email: must be unique across users (case-sensitive match the DB stores)
// - newPassword + currentPassword: optional pair; both required together to
//   change password, and currentPassword must verify against the stored hash.
// Role is NOT editable here — that path lives in the admin /users routes.
const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

authRouter.put("/me", async (req, res, next) => {
  try {
    const userId = await userIdFromAuth(req.headers.authorization);
    if (!userId) return fail(res, 401, "Missing or invalid token");
    const input = updateMeSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(res, 404, "User not found");

    const data: { name?: string; email?: string; passwordHash?: string } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined && input.email !== user.email) {
      const dup = await prisma.user.findUnique({ where: { email: input.email } });
      if (dup) return fail(res, 400, "Email đã được dùng bởi tài khoản khác.");
      data.email = input.email;
    }
    if (input.newPassword) {
      if (!input.currentPassword) {
        return fail(res, 400, "Cần nhập mật khẩu hiện tại để đổi mật khẩu.");
      }
      const ok2 = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!ok2) return fail(res, 400, "Mật khẩu hiện tại không đúng.");
      data.passwordHash = await bcrypt.hash(input.newPassword, 10);
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    ok(res, {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    });
  } catch (e) {
    next(e);
  }
});
