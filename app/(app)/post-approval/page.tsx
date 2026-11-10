import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { REPORT_META } from "@/lib/postApproval";
import { REPORT_STATUSES, REPORT_TYPES } from "@/lib/schema";
import { fmtDate, label } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Post-approval reports" };

export default async function PostApprovalList({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("SECRETARIAT", "ADMIN");
  const sp = await searchParams;
  const type = typeof sp.type === "string" && (REPORT_TYPES as readonly string[]).includes(sp.type) ? sp.type : "";
  const status = typeof sp.status === "string" && (REPORT_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const where: string[] = [];
  const params: string[] = [];
  if (type) { where.push("r.report_type = ?"); params.push(type); }
  if (status) { where.push("r.status = ?"); params.push(status); }
  const rows = await all<{ report_id: number; report_type: string; status: string; summary: string; submitted_at: string; reference_no: string; title: string; researcher: string; proposal_id: number }>(
    `SELECT r.report_id, r.report_type, r.status, r.summary, r.submitted_at, p.reference_no, p.title, p.proposal_id, u.full_name AS researcher
       FROM post_approval_reports r JOIN proposals p ON p.proposal_id = r.proposal_id JOIN users u ON u.user_id = r.submitted_by
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY r.status <> 'SUBMITTED', r.report_type <> 'SAE', r.submitted_at DESC`,
    ...params,
  );
  return (
    <>
      <PageHeader title="Post-approval reports" subtitle="Amendments, progress reports, deviations, serious adverse events, final reports and early terminations. Reports needing action are listed first." />
      <Flash searchParams={searchParams} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="type" defaultValue={type} className="input max-w-[240px]" aria-label="Report type">
          <option value="">All types</option>
          {REPORT_TYPES.map((t) => <option key={t} value={t}>{REPORT_META[t].label}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input max-w-[200px]" aria-label="Status">
          <option value="">All statuses</option>
          {REPORT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
        {(type || status) && <Link href="/post-approval" className="btn-secondary">Clear</Link>}
      </form>
      {rows.length === 0 ? <Empty>No post-approval reports.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Report</th><th>Proposal</th><th>Researcher</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.report_id}>
                  <td className="whitespace-nowrap">
                    <Link className="link" href={`/post-approval/${r.report_id}`}>{REPORT_META[r.report_type as keyof typeof REPORT_META].label}</Link>
                    {r.report_type === "SAE" && r.status === "SUBMITTED" && <span className="ml-2"><Badge value="SAE" /></span>}
                  </td>
                  <td><Link className="link font-mono text-xs" href={`/proposals/${r.proposal_id}`}>{r.reference_no}</Link><div className="max-w-xs truncate text-xs text-slate-500">{r.title}</div></td>
                  <td>{r.researcher}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(r.submitted_at)}</td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
