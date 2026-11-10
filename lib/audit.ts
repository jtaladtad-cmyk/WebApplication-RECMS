import "server-only";
import { headers } from "next/headers";
import { run } from "./db";

/** Records one entry in the activity log. Never throws: logging must not break the action. */
export async function audit(
  action: string,
  opts: { userId?: number | null; entity?: string; entityId?: number | null; details?: string | null } = {},
) {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  } catch {
    /* outside a request */
  }
  try {
    await run(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      opts.userId ?? null,
      action,
      opts.entity ?? null,
      opts.entityId ?? null,
      opts.details ? opts.details.slice(0, 1000) : null,
      ip,
    );
  } catch (e) {
    console.error("[recms] audit log failed:", e);
  }
}
