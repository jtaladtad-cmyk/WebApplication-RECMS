import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { buildReport } from "@/lib/reports";
import { label } from "@/lib/format";
import { Badge, PageHeader, Section, Stat, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("SECRETARIAT", "ADMIN");
  const sp = await searchParams;
  const from = isDate(sp.from) ? sp.from : undefined;
  const to = isDate(sp.to) ? sp.to : undefined;
  const r = await buildReport({ from, to });
  const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
  const maxMonth = Math.max(1, ...r.monthly.map((m) => m.submitted));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={from || to ? `Proposals submitted ${from ? `from ${from}` : ""} ${to ? `to ${to}` : ""}` : "All time"}
        action={<a href={`/api/reports/csv${qs ? `?${qs}` : ""}`} className="btn-secondary">Export CSV</a>}
      />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-secondary">Apply</button>
        {(from || to) && <Link href="/reports" className="btn-secondary">Clear</Link>}
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submitted proposals" value={r.total} />
        <Stat label="Approved" value={r.approved} />
        <Stat label="Under review" value={r.underReview} />
        <Stat label="Pending revisions" value={r.pendingRevisions} />
        <Stat label="Disapproved" value={r.disapproved} />
        <Stat label="Avg. processing time" value={r.avgProcessingDays === null ? "—" : `${r.avgProcessingDays} d`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Reviewer workload">
          <table className="table">
            <thead><tr><th>Reviewer</th><th>Assigned</th><th>Pending</th><th>Done</th><th>Overdue</th><th>Avg. days</th></tr></thead>
            <tbody>
              {r.workload.map((w) => (
                <tr key={w.full_name}>
                  <td>{w.full_name}</td><td>{w.assigned}</td><td>{w.pending}</td><td>{w.completed}</td>
                  <td className={w.overdue ? "font-semibold text-rose-700" : ""}>{w.overdue}</td>
                  <td>{w.avg_days ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="By status">
          <table className="table">
            <thead><tr><th>Status</th><th className="text-right">Proposals</th></tr></thead>
            <tbody>
              {r.byStatus.map((s) => <tr key={s.status}><td><Badge value={s.status} /></td><td className="text-right">{s.n}</td></tr>)}
              {r.byStatus.length === 0 && <tr><td colSpan={2} className="text-slate-500">No data.</td></tr>}
            </tbody>
          </table>
        </Section>
        <Section title="By college">
          <table className="table">
            <thead><tr><th>College</th><th className="text-right">Submitted</th><th className="text-right">Approved</th></tr></thead>
            <tbody>
              {r.byCollege.map((c) => <tr key={c.college}><td>{c.college}</td><td className="text-right">{c.submitted}</td><td className="text-right">{c.approved}</td></tr>)}
              {r.byCollege.length === 0 && <tr><td colSpan={3} className="text-slate-500">No data.</td></tr>}
            </tbody>
          </table>
        </Section>
        <Section title="Submissions per month">
          {r.monthly.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : (
            <ul className="space-y-2 text-sm">
              {r.monthly.map((m) => (
                <li key={m.month} className="grid grid-cols-[70px_1fr_80px] items-center gap-3">
                  <span className="font-mono text-xs text-slate-600">{m.month}</span>
                  <span className="h-3 rounded bg-slate-100">
                    <span className="block h-3 rounded bg-brand-600" style={{ width: `${(m.submitted / maxMonth) * 100}%` }} />
                  </span>
                  <span className="text-right text-xs text-slate-600">{m.submitted} sub · {m.approved} appr</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-xs text-slate-500">
            Review types: {r.byType.map((t) => `${label(t.review_type ?? "UNASSIGNED")} ${t.n}`).join(" · ") || "—"}
          </div>
        </Section>
      </div>
    </>
  );
}
