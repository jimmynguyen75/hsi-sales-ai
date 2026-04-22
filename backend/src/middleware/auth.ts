import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { fail } from "../lib/response.js";
import { attachUser } from "./request-context.js";

// Legacy alias. New code should just use `Request` — userId/userRole are
// declared on Express.Request via src/types/express.d.ts module augmentation.
export type AuthedRequest = Request;

const SECRET = process.env.JWT_SECRET ?? "dev-secret";

export function signToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    fail(res, 401, "Missing Bearer token");
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, SECRET) as { sub: string; role: string };
    req.userId = decoded.sub;
    req.userRole = decoded.role;
    attachUser(req, decoded.sub);
    next();
  } catch {
    fail(res, 401, "Invalid or expired token");
  }
}
