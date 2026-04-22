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

authRouter.get("/me", async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) return fail(res, 401, "Missing token");
    const token = header.slice(7);
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET ?? "dev-secret") as {
      sub: string;
    };
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return fail(res, 404, "User not found");
    ok(res, { id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (e) {
    next(e);
  }
});
