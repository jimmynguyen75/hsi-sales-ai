/**
 * Role-Based Access Control middleware.
 *
 * Usage:
 *   router.delete("/:id", requireRole("admin"), handler);
 *   router.get("/all", requireRole("manager", "admin"), handler);
 *
 * Hierarchy is flat — if a route needs "admin OR manager", list both.
 * We deliberately don't do a level system (admin > manager > sales) because
 * some actions should be admin-only even though admin sits "above" manager.
 * Explicit lists are clearer and let us narrow scope later without refactor.
 *
 * Also exports `canViewAll(role)` for routes that branch between "own only"
 * and "everyone" based on role — e.g. accounts list for sales vs manager.
 */
import type { RequestHandler } from "express";
import { fail } from "../lib/response.js";

export type Role = "sales" | "manager" | "admin";

const ALL_ROLES: Role[] = ["sales", "manager", "admin"];

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
 * True for roles that should see data across all owners (manager, admin).
 * Sales users only see their own-owned rows. Routes use this to decide
 * whether to apply a `where: { ownerId: req.userId }` filter.
 */
export function canViewAll(role: string | undefined): boolean {
  return role === "manager" || role === "admin";
}
