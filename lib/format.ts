export const label = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

/** SQLite datetime('now') is UTC without a zone; ISO strings already carry one. */
function toDate(s: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00").toLocaleDateString("en-PH", { dateStyle: "medium" });
  return toDate(s).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: "bg-sky-100 text-sky-800",
  INCOMPLETE: "bg-orange-100 text-orange-800",
  FOR_REVIEW: "bg-indigo-100 text-indigo-800",
  UNDER_REVIEW: "bg-violet-100 text-violet-800",
  REVISION_REQUIRED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  DISAPPROVED: "bg-rose-100 text-rose-800",
  PENDING: "bg-slate-100 text-slate-700",
};

export const STATUS_HELP: Record<string, string> = {
  SUBMITTED: "Waiting for the ERC secretariat to check document completeness.",
  INCOMPLETE: "Requirements are missing. Upload the missing documents and resubmit.",
  FOR_REVIEW: "Documents are complete. Waiting for reviewer assignment.",
  UNDER_REVIEW: "Assigned reviewers are evaluating the proposal.",
  REVISION_REQUIRED: "The ERC requires revisions. Read the comments and submit a revised version.",
  APPROVED: "Approved. Your ethics clearance is ready to download.",
  DISAPPROVED: "The ERC did not approve this proposal.",
};

/** Meeting times come from <input type="datetime-local"> and are Philippine time (UTC+8, no DST). */
export const meetingDate = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+08:00` : s);

/** Current Manila wall-clock time in datetime-local format. */
export const manilaNowLocal = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16);

/** YYYY-MM-DD for today + n days. */
export const isoDateIn = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
