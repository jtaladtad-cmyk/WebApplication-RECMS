import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, label } from "@/lib/format";
import { Empty, PageHeader, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Activity log" };

const PAGE = 50;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const ENTITY_LINK: Record<string, (id: number) => string> = {
  proposal: (id) => `/proposals/${id}`,
  report: (id) => `/post-approval/${id}`,
  meeting: (id) => `/meetings/${id}`,
};

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("ADMIN");
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const from = isDate(sp.from) ? sp.from : "";
  const to = isDate(sp.to) ? sp.to : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (action) { where.push("l.action = ?"); params.push(action); }
  if (q) { where.push("(u.full_name LIKE ? OR u.email LIKE ? OR l.details LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (from) { where.push("date(l.created_at) >= date(?)"); params.push(from); }
  if (to) { where.push("date(l.created_at) <= date(?)"); params.push(to); }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log l LEFT JOIN users u ON u.user_id = l.user_id ${w}`, ...params))?.n) || 0;
  const rows = await all<{ log_id: number; created_at: string; action: string; entity_type: string | null; entity_id: number | null; details: string | null; ip_address: string | null; full_name: string | null; email: string | null }>(
    `SELECT l.*, u.full_name, u.email FROM audit_log l LEFT JOIN users u ON u.user_id = l.user_id ${w}
      ORDER BY l.created_at DESC, l.log_id DESC LIMIT ? OFFSET ?`,
    ...params, PAGE, (page - 1) * PAGE,
  );
  const actions = (await all<{ action: string }>("SELECT DISTINCT action FROM audit_log ORDER BY action")).map((r) => r.action);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => new URLSearchParams({ ...(action && { action }), ...(q && { q }), ...(from && { from }), ...(to && { to }), page: String(p) }).toString();

  return (
    <>
      <PageHeader title="Activity log" subtitle={`Every sign-in, submission, review, decision, download and account change. ${total} entr${total === 1 ? "y" : "ies"}.`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} placeholder="Name, email or details" className="input" /></div>
        <div>
          <label className="label" htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={action} className="input">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-secondary">Filter</button>
        {(action || q || from || to) && <Link href="/admin/audit" className="btn-secondary">Clear</Link>}
      </form>
      {rows.length === 0 ? <Empty>No activity found.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th><th>IP address</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const link = r.entity_type && r.entity_id && ENTITY_LINK[r.entity_type]?.(r.entity_id);
                return (
                  <tr key={r.log_id}>
                    <td className="whitespace-nowrap text-slate-500">{fmtDate(r.created_at)}</td>
                    <td>{r.full_name ?? <span className="text-slate-400">—</span>}{r.email && <div className="text-xs text-slate-500">{r.email}</div>}</td>
                    <td className="whitespace-nowrap font-medium">{label(r.action)}</td>
                    <td className="max-w-md text-slate-700">
                      {r.details}
                      {link && <> <Link className="link text-xs" href={link}>open</Link></>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-slate-500">{r.ip_address ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="btn-secondary" href={`/admin/audit?${qs(page - 1)}`}>← Newer</Link> : <span />}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages ? <Link className="btn-secondary" href={`/admin/audit?${qs(page + 1)}`}>Older →</Link> : <span />}
        </div>
      )}
    </>
  );
}
