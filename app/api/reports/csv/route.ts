import { getCurrentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { buildReport } from "@/lib/reports";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SECRETARIAT" && user.role !== "ADMIN")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const from = isDate(url.searchParams.get("from"));
  const to = isDate(url.searchParams.get("to"));
  const r = await buildReport({ from, to });

  const where: string[] = [];
  const params: string[] = [];
  if (from) { where.push("date(p.submitted_at) >= date(?)"); params.push(from); }
  if (to) { where.push("date(p.submitted_at) <= date(?)"); params.push(to); }
  const rows = await all<Record<string, string | number | null>>(
    `SELECT p.reference_no, p.title, u.full_name AS researcher, p.college, p.research_type, p.review_type,
            p.status, p.current_version, p.submitted_at, p.updated_at, c.clearance_no
       FROM proposals p JOIN users u ON u.user_id = p.researcher_id
       LEFT JOIN ethics_clearances c ON c.proposal_id = p.proposal_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.submitted_at`,
    ...params,
  );

  const lines: string[] = [];
  lines.push("RECMS Report", `Period,${from ?? "beginning"},${to ?? "today"}`, "");
  lines.push("Summary");
  lines.push(`Submitted proposals,${r.total}`, `Approved,${r.approved}`, `Under review,${r.underReview}`,
    `Pending revisions,${r.pendingRevisions}`, `Disapproved,${r.disapproved}`,
    `Average processing time (days),${r.avgProcessingDays ?? ""}`, "");
  lines.push("Reviewer workload", "Reviewer,Assigned,Pending,Completed,Overdue,Avg days");
  for (const w of r.workload) lines.push([w.full_name, w.assigned, w.pending, w.completed, w.overdue, w.avg_days].map(esc).join(","));
  lines.push("", "Proposals");
  const cols = ["reference_no", "title", "researcher", "college", "research_type", "review_type", "status", "current_version", "submitted_at", "updated_at", "clearance_no"];
  lines.push(cols.join(","));
  for (const row of rows) lines.push(cols.map((c) => esc(row[c])).join(","));

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recms-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
