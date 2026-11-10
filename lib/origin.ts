import "server-only";
import { headers } from "next/headers";
import { appUrl } from "./mail";

/** The site's public origin for the current request (falls back to APP_URL). */
export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    /* outside a request */
  }
  return appUrl();
}
