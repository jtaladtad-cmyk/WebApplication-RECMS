import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email delivery. Configure an SMTP server with:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM
 * Optional: SMTP_SECURE=1 for port 465. APP_URL for links in emails
 * (on Vercel the production URL is used automatically).
 * RECMS_MAIL_LOG=1 prints emails to the server log instead (for testing).
 * With neither set, email is off and only in-app notifications are used.
 */
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else if (process.env.RECMS_MAIL_LOG === "1") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = null;
  }
  return transporter;
}

export const mailEnabled = () => getTransporter() !== null;

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const t = getTransporter();
  if (!t) return;
  const info = await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "RECMS <no-reply@recms.local>",
    to,
    subject,
    text,
  });
  if (process.env.RECMS_MAIL_LOG === "1" && !process.env.SMTP_HOST) {
    const msg = JSON.parse(String((info as { message?: unknown }).message ?? "{}"));
    console.log(`[recms mail] to=${to} subject=${JSON.stringify(msg.subject ?? subject)}`);
  }
}
