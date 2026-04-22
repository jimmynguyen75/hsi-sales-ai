import type { ErrorRequestHandler } from "express";
import { AppError } from "../lib/response.js";
import { ZodError } from "zod";
import { log } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      requestId: req.requestId,
    });
    return;
  }
  if (err instanceof AppError) {
    // Domain-level failures (401/403/404/...) are expected — log at warn, not error.
    log.warn("app.error", {
      status: err.status,
      message: err.message,
      path: req.originalUrl.split("?")[0],
    });
    res.status(err.status).json({ success: false, error: err.message, requestId: req.requestId });
    return;
  }
  log.error("unhandled.error", err, { path: req.originalUrl.split("?")[0], method: req.method });
  const msg = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ success: false, error: msg, requestId: req.requestId });
};
