import type { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, error: message });
}

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
