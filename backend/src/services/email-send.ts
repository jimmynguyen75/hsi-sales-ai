/**
 * SMTP email sending with graceful dev-mode fallback.
 *
 * In production, configure SMTP via env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 * When SMTP_HOST is not set, we fall back to nodemailer's built-in JSON
 * transport — the email is "sent" to a log file and the UI shows a preview
 * instead of hitting a real server. This keeps the demo working offline.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type SendParams = {
  to: string;
  subject: string;
  body: string; // plain text; we auto-generate HTML by wrapping paragraphs
  cc?: string[];
  bcc?: string[];
  from?: string;
  replyTo?: string;
};

type SendResult = {
  messageId: string;
  accepted: string[];
  previewUrl?: string; // set when using Ethereal/preview transport
  previewMessage?: string; // raw RFC822 — shown in dev-mode UI
  mode: "smtp" | "preview";
};

let transporter: Transporter | null = null;
let mode: "smtp" | "preview" = "preview";
let defaultFrom = "noreply@hsi.local";

function init(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (host) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    defaultFrom = process.env.SMTP_FROM ?? user ?? defaultFrom;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    mode = "smtp";
    console.log(`[email] SMTP transport configured: ${host}:${port} secure=${secure}`);
  } else {
    // Dev mode — nodemailer's stream transport keeps the RFC822 message in
    // memory so the UI can preview it. No network calls.
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
    mode = "preview";
    defaultFrom = process.env.SMTP_FROM ?? defaultFrom;
    console.log(`[email] SMTP not configured — using preview transport (dev mode)`);
  }
  return transporter;
}

/**
 * Convert plain text to a simple HTML body: escape, wrap paragraphs, preserve
 * line breaks. Good enough for business emails — no rich formatting needed.
 */
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; font-size: 14px;">${paragraphs}</div>`;
}

export async function sendEmail(params: SendParams): Promise<SendResult> {
  const t = init();

  const info = await t.sendMail({
    from: params.from ?? defaultFrom,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.body,
    html: toHtml(params.body),
  });

  if (mode === "preview") {
    // streamTransport buffers the raw message at info.message (Buffer)
    const raw = info.message instanceof Buffer ? info.message.toString("utf8") : String(info.message ?? "");
    return {
      messageId: info.messageId ?? "",
      accepted: Array.isArray(info.accepted) ? info.accepted.map((a: unknown) => String(a)) : [params.to],
      previewMessage: raw,
      mode: "preview",
    };
  }

  return {
    messageId: info.messageId ?? "",
    accepted: Array.isArray(info.accepted) ? info.accepted.map((a: unknown) => String(a)) : [params.to],
    mode: "smtp",
  };
}

export function getEmailMode(): "smtp" | "preview" {
  init();
  return mode;
}
