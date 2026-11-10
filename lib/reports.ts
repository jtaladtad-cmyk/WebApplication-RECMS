import "server-only";
import { all, get } from "./db";

export type ReportFilter = { from?: string; to?: string };

function range(f: ReportFilter, col: string) {
  const w: string[] = [];
  const p: string[] = [];
  if (f.from) { w.push(`date(${col}) >= date(?)`); p.push(f.from); }
  if (f.to) { w.push(`date(${col}) <= date(?)`); p.push(f.to); }
  return { sql: w.length ? " AND " + w.join(" AND ") : "", params: p };
}

export async function buildReport(f: ReportFilter) {
  const r = range(f, "p.submitted_at");
  const byStatus = await all<{ status: string; n: number }>(
    `SELECT p.status, COUNT(*) AS n FROM proposals p WHERE 1=1 ${r.sql} GROUP BY p.status ORDER BY n DESC`, ...r.params);
  const total = byStatus.reduce((s, x) => s + Number(x.n), 0);
  const n = (s: string) => byStatus.find((x) => x.status === s)?.n ?? 0;

  const byCollege = await all<{ college: string; submitted: number; approved: number }>(
    `SELECT p.college, COUNT(*) AS submitted, SUM(p.status = 'APPROVED') AS approved
       FROM proposals p WHERE 1=1 ${r.sql} GROUP BY p.college ORDER BY submitted DESC`, ...r.params);

  const byType = await all<{ review_type: string | null; n: number }>(
    `SELECT p.review_type, COUNT(*) AS n FROM proposals p WHERE 1=1 ${r.sql} GROUP BY p.review_type ORDER BY n DESC`, ...r.params);

  const workload = await all<{ full_name: string; assigned: number; pending: number; completed: number; overdue: number; avg_days: number | null }>(
    `SELECT u.full_name,
            COUNT(a.assignment_id) AS assigned,
            COALESCE(SUM(a.status = 'PENDING'), 0) AS pending,
            COALESCE(SUM(a.status = 'SUBMITTED'), 0) AS completed,
            COALESCE(SUM(a.status = 'PENDING' AND a.due_date < date('now')), 0) AS overdue,
            ROUND(AVG(CASE WHEN a.submitted_at IS NOT NULL THEN julianday(a.submitted_at) - julianday(a.assigned_at) END), 1) AS avg_days
       FROM users u LEFT JOIN review_assignments a ON a.reviewer_id = u.user_id
      WHERE u.role = 'REVIEWER' GROUP BY u.user_id ORDER BY pending DESC, assigned DESC`);

  // Average processing time = first submission → final decision (approved/disapproved).
  const rd = range(f, "p.submitted_at");
  const avg = await get<{ days: number | null; n: number }>(
    `SELECT ROUND(AVG(julianday(d.decided_at) - julianday(p.submitted_at)), 1) AS days, COUNT(*) AS n
       FROM proposals p JOIN decisions d ON d.proposal_id = p.proposal_id
      WHERE d.decision IN ('APPROVED','DISAPPROVED') ${rd.sql}`, ...rd.params);

  const monthly = await all<{ month: string; submitted: number; approved: number }>(
    `SELECT strftime('%Y-%m', p.submitted_at) AS month, COUNT(*) AS submitted, SUM(p.status = 'APPROVED') AS approved
       FROM proposals p WHERE 1=1 ${r.sql} GROUP BY month ORDER BY month`, ...r.params);

  const rr = range(f, "r.submitted_at");
  const postApproval = await all<{ report_type: string; n: number; open: number }>(
    `SELECT r.report_type, COUNT(*) AS n, SUM(r.status = 'SUBMITTED') AS open
       FROM post_approval_reports r WHERE 1=1 ${rr.sql} GROUP BY r.report_type ORDER BY n DESC`, ...rr.params);
  const declined = await get<{ n: number; coi: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(coi_declared), 0) AS coi FROM review_assignments WHERE status = 'DECLINED'`);

  return {
    postApproval,
    declinedAssignments: Number(declined?.n) || 0,
    conflictsDeclared: Number(declined?.coi) || 0,
    total,
    approved: n("APPROVED"),
    underReview: n("UNDER_REVIEW") + n("FOR_REVIEW"),
    toCheck: n("SUBMITTED"),
    pendingRevisions: n("REVISION_REQUIRED") + n("INCOMPLETE"),
    disapproved: n("DISAPPROVED"),
    avgProcessingDays: avg?.days ?? null,
    decidedCount: avg?.n ?? 0,
    byStatus, byCollege, byType, workload, monthly,
  };
}
