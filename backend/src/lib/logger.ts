/**
 * Minimal structured logger.
 *
 * Output is one JSON object per line (NDJSON). Easy to grep locally and easy
 * to ship to any aggregator later (Loki, Datadog, CloudWatch) without changing
 * callsites. No dependency — pino/winston would be overkill for our volume.
 *
 * Usage:
 *   log.info("account.created", { accountId, userId });
 *   log.warn("ai.rate_limit", { provider: "groq", retryAfter });
 *   log.error("db.query_failed", err, { query: "accounts.findMany" });
 *
 * The `requestId` field is attached automatically when called from inside a
 * request — see `withRequestContext()` in middleware/request-context.ts.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Lowest level emitted. Set via env; defaults to "info" (drops debug in prod).
const MIN_LEVEL: number =
  LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

// Per-request AsyncLocalStorage lookup for correlating log lines with a request.
// Importing lazily to avoid a circular dep with request-context.
let getRequestContext: (() => { requestId?: string; userId?: string } | undefined) | null = null;

export function registerRequestContextLookup(
  fn: () => { requestId?: string; userId?: string } | undefined,
): void {
  getRequestContext = fn;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < MIN_LEVEL) return;
  const ctx = getRequestContext?.() ?? {};
  const entry: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(meta ?? {}),
  };
  // stderr for warn/error so ops tooling can split streams; stdout otherwise.
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
}

export const log = {
  debug(msg: string, meta?: Record<string, unknown>): void {
    emit("debug", msg, meta);
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    emit("info", msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    emit("warn", msg, meta);
  },
  /**
   * Error logging accepts an optional Error whose name/message/stack get
   * flattened into the log line. Keeps stacks searchable without blowing
   * up the JSON schema.
   */
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errFields: Record<string, unknown> = {};
    if (err instanceof Error) {
      errFields.errorName = err.name;
      errFields.errorMessage = err.message;
      if (err.stack) errFields.errorStack = err.stack.split("\n").slice(0, 8).join("\n");
    } else if (err !== undefined) {
      errFields.error = String(err);
    }
    emit("error", msg, { ...errFields, ...(meta ?? {}) });
  },
};
