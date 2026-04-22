/**
 * Request context middleware.
 *
 * - Assigns a request ID (from X-Request-Id header if present, else fresh UUID).
 * - Echoes the ID back as a response header so clients/logs can correlate.
 * - Stashes {requestId, userId} in AsyncLocalStorage so `log.info(...)` anywhere
 *   inside the request tree auto-includes them without passing req around.
 * - Logs one `http.request` line on response finish with method/path/status/duration.
 */
import type { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { log, registerRequestContextLookup } from "../lib/logger.js";

export interface ReqCtx {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<ReqCtx>();

// Wire the logger to read from our ALS so it doesn't depend on Express.
registerRequestContextLookup(() => storage.getStore());

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  // Trust an upstream-supplied X-Request-Id if it looks reasonable; otherwise mint one.
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Capture originalUrl up-front — Express mutates req.url/req.path as routers
  // match, so by res.finish the path no longer reflects the real route. Strip
  // the query string so logs don't accidentally surface tokens / search terms.
  const pathAtStart = req.originalUrl.split("?")[0];
  const started = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - started;
    // Skip noisy GET /api/health pings — those run every few seconds from
    // uptime checks and would drown out the rest of the log.
    if (pathAtStart === "/api/health" && req.method === "GET") return;
    log.info("http.request", {
      method: req.method,
      path: pathAtStart,
      status: res.statusCode,
      durationMs: duration,
      // userId is populated by authMiddleware which runs AFTER this one on
      // protected routes — pull from req at finish-time, not capture-time.
      userId: req.userId,
    });
  });

  storage.run({ requestId, userId: undefined }, () => {
    // We can't mutate the stored value after .run — instead, patch it when
    // authMiddleware fills in req.userId by grabbing a fresh closure.
    // Callers of log.* read the ALS store each time, so mutating the object
    // in-place works (same object reference kept for the request lifetime).
    Object.defineProperty(req, "_withUser", {
      value: (userId: string) => {
        const store = storage.getStore();
        if (store) store.userId = userId;
      },
      writable: false,
      enumerable: false,
    });
    next();
  });
}

/**
 * Helper for authMiddleware to propagate userId into the ALS store once
 * the JWT is decoded. Called as `attachUser(req, req.userId)`.
 */
export function attachUser(req: Request, userId: string): void {
  const fn = (req as unknown as { _withUser?: (id: string) => void })._withUser;
  if (fn) fn(userId);
}
