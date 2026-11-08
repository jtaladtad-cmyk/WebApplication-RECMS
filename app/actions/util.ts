import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export const int = (form: FormData, key: string) => {
  const n = Number(form.get(key));
  return Number.isInteger(n) ? n : NaN;
};

/** Redirect back to a page with a one-shot success or error banner. */
export function flash(path: string, m: { msg?: string; error?: string }): never {
  // Mutations can change data shown in the shared layout (e.g. the unread
  // notification badge), so re-render the whole tree, not just the target page.
  revalidatePath("/", "layout");
  const qs = new URLSearchParams(m as Record<string, string>).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${qs}`);
}
