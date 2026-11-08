import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { PROPOSAL_SELECT, type Proposal } from "@/lib/recms";
import { PROPOSAL_STATUSES } from "@/lib/schema";
import { fmtDate, label } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role === "REVIEWER") redirect("/reviews");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (user.role === "RESEARCHER") {
    where.push("p.researcher_id = ?");
    params.push(user.user_id);
  }
  if (status) {
    where.push("p.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(p.reference_no LIKE ? OR p.title LIKE ? OR u.full_name LIKE ? OR p.college LIKE ?)");
    params.push(...Array(4).fill(`%${q}%`));
  }
  const rows = await all<Proposal>(
    `${PROPOSAL_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.updated_at DESC`,
    ...params,
  );
  const staff = user.role !== "RESEARCHER";

  return (
    <>
      <PageHeader
        title={staff ? "Research records" : "My proposals"}
        subtitle={staff ? "All ethics review submissions. Search by reference, title, researcher or college." : "Track the status of every proposal you submitted."}
        action={!staff && <Link href="/proposals/new" className="btn">+ New submission</Link>}
      />
      <Flash searchParams={searchParams} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search…" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input max-w-[200px]">
          <option value="">All statuses</option>
          {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
        {(q || status) && <Link href="/proposals" className="btn-secondary">Clear</Link>}
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                {staff && <th>Researcher</th>}
                <th>College</th>
                <th>Review type</th>
                <th>Ver.</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.proposal_id}>
                  <td className="whitespace-nowrap"><Link className="link" href={`/proposals/${p.proposal_id}`}>{p.reference_no}</Link></td>
                  <td className="max-w-sm">{p.title}</td>
                  {staff && <td>{p.researcher_name}</td>}
                  <td className="text-slate-600">{p.college}</td>
                  <td>{label(p.review_type)}</td>
                  <td>v{p.current_version}</td>
                  <td><Badge value={p.status} /></td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(p.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No proposals found.</Empty>
      )}
    </>
  );
}
