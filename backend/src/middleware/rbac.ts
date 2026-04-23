/**
 * Role-Based Access Control middleware.
 *
 * Usage:
 *   router.delete("/:id", requireRole("admin"), handler);
 *
 * Only two roles exist in the system: "sales" and "admin". Sales users see
 * their own rows only; admins see and manage everything. Any route that
 * requires elevated access lists "admin" explicitly — we don't do a level
 * system because it obscures what's actually gated.
 *
 * Also exports `canViewAll(role)` for routes that branch between "own only"
 * and "everyone" — e.g. accounts list for sales vs admin.
 */
import type { RequestHandler } from "express";
import { fail } from "../lib/response.js";

export type Role = "sales" | "admin";

const ALL_ROLES: Role[] = ["sales", "admin"];

/**
 * Typed as `RequestHandler` so Express keeps the usual Request shape
 * (params typed as `{[k: string]: string}`) when this sits between the
 * route path and the handler. Without the explicit type, TS picks an
 * overload that widens `req.params.id` to `string | string[]`.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, res, next) => {
    const role = req.userRole as Role | undefined;
    if (!role || !ALL_ROLES.includes(role)) {
      fail(res, 401, "Unauthenticated");
      return;
    }
    if (!allowed.includes(role)) {
      fail(res, 403, `Yêu cầu quyền: ${allowed.join(" hoặc ")}. Tài khoản hiện tại là ${role}.`);
      return;
    }
    next();
  };
}

/**
 * True for roles that should see data across all owners. Only admin has
 * cross-user visibility; sales users are scoped to their own rows via a
 * `where: { ownerId: req.userId }` filter.
 */
export function canViewAll(role: string | undefined): boolean {
  return role === "admin";
}
