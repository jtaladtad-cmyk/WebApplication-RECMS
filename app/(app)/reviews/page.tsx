import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "My reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("REVIEWER");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await all<{ assignment_id: number; reference_no: string; title: string; review_type: string | null; version_no: number; due_date: string; status: string; recommendation: string | null; assigned_at: string }>(
    `SELECT a.assignment_id, p.reference_no, p.title, p.review_type, a.version_no, a.due_date, a.status, a.recommendation, a.assigned_at
       FROM review_assignments a JOIN proposals p ON p.proposal_id = a.proposal_id
      WHERE a.reviewer_id = ? ORDER BY a.status = 'SUBMITTED', a.due_date`,
    user.user_id,
  );
  return (
    <>
      <PageHeader title="My review assignments" subtitle="Proposals assigned to you, sorted by deadline." />
      <Flash searchParams={searchParams} />
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Reference</th><th>Title</th><th>Ver.</th><th>Assigned</th><th>Due</th><th>Status</th><th>Recommendation</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assignment_id}>
                  <td className="whitespace-nowrap font-mono text-xs">{r.reference_no}</td>
                  <td className="max-w-sm">{r.title}</td>
                  <td>v{r.version_no}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(r.assigned_at)}</td>
                  <td className={`whitespace-nowrap ${r.status === "PENDING" && r.due_date < today ? "font-semibold text-rose-700" : ""}`}>{fmtDate(r.due_date)}</td>
                  <td><Badge value={r.status} /></td>
                  <td><Badge value={r.recommendation} /></td>
                  <td><Link className="link whitespace-nowrap" href={`/reviews/${r.assignment_id}`}>{r.status === "PENDING" ? "Review →" : "View"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No proposals have been assigned to you yet.</Empty>
      )}
    </>
  );
}
