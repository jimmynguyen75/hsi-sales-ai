/**
 * Audit log helper.
 *
 * Call `logAudit(req, { action, entity, entityId, summary, meta? })` after a
 * successful mutation. Fire-and-forget style (swallows errors) because audit
 * is observability, not a business-critical path — if the DB hiccups we
 * don't want the user's action to fail because the log didn't write.
 *
 * We denormalize user email + role at write time so the log stays readable
 * even after a user is deleted/demoted.
 */
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "reassign"
  | "send"
  | "export";

export type AuditEntity =
  | "deal"
  | "quotation"
  | "proposal"
  | "account"
  | "contact"
  | "user"
  | "product"
  | "email_draft";

export interface AuditInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonValue;
}

/**
 * Resolve actor identity from the request and persist the log row.
 * If userId/role aren't populated (e.g. an unauthenticated route slipped
 * through), we silently drop the entry rather than throw.
 */
export async function logAudit(req: Request, input: AuditInput): Promise<void> {
  const userId = req.userId;
  if (!userId) return;
  try {
    // Look up email once — cache by userId would be overkill for an internal
    // tool with a few dozen users. Hot path is already DB-bound anyway.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    await prisma.auditLog.create({
      data: {
        userId,
        userEmail: user?.email ?? "unknown",
        userRole: user?.role ?? req.userRole ?? "unknown",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        meta: input.meta,
      },
    });
  } catch (err) {
    console.warn("[audit] failed to log:", err);
  }
}

/**
 * Compute a short diff summary between two objects. Returns a string like
 * "stage: qualification → proposal; value: 1000000 → 1500000" for the
 * fields whose values changed. Useful for update actions where the full
 * summary would be verbose.
 */
export function diffSummary(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): string {
  const parts: string[] = [];
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    if (b !== a && !(b == null && a == null)) {
      const bs = formatVal(b);
      const as = formatVal(a);
      parts.push(`${f}: ${bs} → ${as}`);
    }
  }
  return parts.length ? parts.join("; ") : "(no changes)";
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
