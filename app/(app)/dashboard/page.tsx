import Link from "next/link";
import type { Metadata } from "next";
import { requireUser, type User } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { PROPOSAL_SELECT, sendDeadlineReminders, type Proposal } from "@/lib/recms";
import { fmtDate, isoDateIn, label, STATUS_HELP } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Section, Stat, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

const count = async (sql: string, ...p: (string | number)[]) => Number((await get<{ n: number }>(sql, ...p))?.n) || 0;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  await sendDeadlineReminders();
  return (
    <>
      <PageHeader title={`Welcome, ${user.full_name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-PH", { dateStyle: "full", timeZone: "Asia/Manila" })} />
      <Flash searchParams={searchParams} />
      {user.role === "RESEARCHER" && <ResearcherDash user={user} />}
      {user.role === "REVIEWER" && <ReviewerDash user={user} />}
      {(user.role === "SECRETARIAT" || user.role === "ADMIN") && <StaffDash />}
    </>
  );
}

function ProposalTable({ rows, showResearcher = false }: { rows: Proposal[]; showResearcher?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Title</th>
            {showResearcher && <th>Researcher</th>}
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.proposal_id}>
              <td className="whitespace-nowrap"><Link className="link" href={`/proposals/${p.proposal_id}`}>{p.reference_no}</Link></td>
              <td className="max-w-md">{p.title}</td>
              {showResearcher && <td>{p.researcher_name}</td>}
              <td><Badge value={p.status} /></td>
              <td className="whitespace-nowrap text-slate-500">{fmtDate(p.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ResearcherDash({ user }: { user: User }) {
  const rows = await all<Proposal>(`${PROPOSAL_SELECT} WHERE p.researcher_id = ? ORDER BY p.updated_at DESC`, user.user_id);
  const by = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
  const action = rows.filter((r) => r.status === "INCOMPLETE" || r.status === "REVISION_REQUIRED");
  const clearances = await all<{ proposal_id: number; reference_no: string; clearance_no: string; valid_until: string }>(
    `SELECT p.proposal_id, p.reference_no, c.clearance_no, c.valid_until FROM ethics_clearances c
       JOIN proposals p ON p.proposal_id = c.proposal_id
      WHERE p.researcher_id = ? AND p.study_status = 'ACTIVE' AND c.valid_until <= ? ORDER BY c.valid_until`,
    user.user_id, isoDateIn(30),
  );
  const reportsBack = await all<{ report_id: number; reference_no: string; report_type: string }>(
    `SELECT r.report_id, p.reference_no, r.report_type FROM post_approval_reports r JOIN proposals p ON p.proposal_id = r.proposal_id
      WHERE r.submitted_by = ? AND r.status = 'REVISION_REQUIRED'
        AND NOT EXISTS (SELECT 1 FROM post_approval_reports n WHERE n.proposal_id = r.proposal_id AND n.report_type = r.report_type AND n.report_id > r.report_id)`,
    user.user_id,
  );
  const activeStudies = rows.filter((r) => r.status === "APPROVED" && r.study_status === "ACTIVE").length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total submissions" value={rows.length} href="/proposals" />
        <Stat label="In progress" value={by(["SUBMITTED", "FOR_REVIEW", "UNDER_REVIEW"])} href="/proposals" />
        <Stat label="Needs your action" value={action.length + clearances.length + reportsBack.length} href="/proposals" />
        <Stat label="Active approved studies" value={activeStudies} href="/proposals?status=APPROVED" />
      </div>
      {clearances.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">Ethics clearance renewal</div>
          <ul className="mt-1 list-disc pl-5">
            {clearances.map((c) => (
              <li key={c.proposal_id}>
                <Link className="underline" href={`/proposals/${c.proposal_id}`}>{c.reference_no}</Link> — clearance {c.clearance_no}{" "}
                {c.valid_until < isoDateIn(0) ? "expired" : "expires"} on {fmtDate(c.valid_until)}. Submit a progress report to renew it.
              </li>
            ))}
          </ul>
        </div>
      )}
      {reportsBack.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">The ERC asked for changes to a report</div>
          <ul className="mt-1 list-disc pl-5">
            {reportsBack.map((r) => (
              <li key={r.report_id}><Link className="underline" href={`/post-approval/${r.report_id}`}>{r.reference_no}</Link> — {label(r.report_type)}</li>
            ))}
          </ul>
        </div>
      )}
      {action.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Action required</div>
          <ul className="mt-1 list-disc pl-5">
            {action.map((p) => (
              <li key={p.proposal_id}>
                <Link className="underline" href={`/proposals/${p.proposal_id}`}>{p.reference_no}</Link> — {STATUS_HELP[p.status]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Section title="My proposals" right={<Link href="/proposals/new" className="btn">+ New submission</Link>}>
        {rows.length ? <ProposalTable rows={rows.slice(0, 8)} /> : <Empty>You have not submitted any proposals yet.</Empty>}
      </Section>
    </div>
  );
}

async function ReviewerDash({ user }: { user: User }) {
  const today = new Date().toISOString().slice(0, 10);
  const pending = await all<{ assignment_id: number; reference_no: string; title: string; due_date: string; version_no: number; accepted_at: string | null }>(
    `SELECT a.assignment_id, p.reference_no, p.title, a.due_date, a.version_no, a.accepted_at
       FROM review_assignments a JOIN proposals p ON p.proposal_id = a.proposal_id
      WHERE a.reviewer_id = ? AND a.status = 'PENDING' ORDER BY a.due_date`,
    user.user_id,
  );
  const done = await count("SELECT COUNT(*) AS n FROM review_assignments WHERE reviewer_id = ? AND status = 'SUBMITTED'", user.user_id);
  const overdue = pending.filter((a) => a.due_date < today).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Awaiting your response" value={pending.filter((a) => !a.accepted_at).length} href="/reviews" />
        <Stat label="Pending reviews" value={pending.length} href="/reviews" />
        <Stat label="Overdue" value={overdue} href="/reviews" />
        <Stat label="Completed reviews" value={done} href="/reviews" />
      </div>
      <Section title="Upcoming deadlines">
        {pending.length ? (
          <table className="table">
            <thead><tr><th>Reference</th><th>Title</th><th>Version</th><th>Due</th></tr></thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.assignment_id}>
                  <td>
                    <Link className="link" href={`/reviews/${a.assignment_id}`}>{a.reference_no}</Link>
                    {!a.accepted_at && <span className="ml-2"><Badge value="AWAITING_RESPONSE" /></span>}
                  </td>
                  <td>{a.title}</td>
                  <td>v{a.version_no}</td>
                  <td className={a.due_date < today ? "font-semibold text-rose-700" : ""}>
                    {fmtDate(a.due_date)} {a.due_date < today && "(overdue)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No pending reviews. 🎉</Empty>
        )}
      </Section>
    </div>
  );
}

async function StaffDash() {
  const s = (status: string) => count("SELECT COUNT(*) AS n FROM proposals WHERE status = ?", status);
  const ready = await all<Proposal>(
    `${PROPOSAL_SELECT}
      WHERE p.status = 'UNDER_REVIEW'
        AND NOT EXISTS (SELECT 1 FROM review_assignments a WHERE a.proposal_id = p.proposal_id
                          AND a.version_no = p.current_version AND a.status = 'PENDING')
        AND EXISTS (SELECT 1 FROM review_assignments a WHERE a.proposal_id = p.proposal_id
                      AND a.version_no = p.current_version AND a.status = 'SUBMITTED')
      ORDER BY p.updated_at`,
  );
  const reportsToAct = await count("SELECT COUNT(*) AS n FROM post_approval_reports WHERE status = 'SUBMITTED'");
  const saes = await all<{ report_id: number; reference_no: string; submitted_at: string }>(
    `SELECT r.report_id, p.reference_no, r.submitted_at FROM post_approval_reports r JOIN proposals p ON p.proposal_id = r.proposal_id
      WHERE r.report_type = 'SAE' AND r.status = 'SUBMITTED' ORDER BY r.submitted_at`,
  );
  const needReviewer = await all<Proposal>(
    `${PROPOSAL_SELECT}
      WHERE p.status = 'UNDER_REVIEW'
        AND NOT EXISTS (SELECT 1 FROM review_assignments a WHERE a.proposal_id = p.proposal_id
                          AND a.version_no = p.current_version AND a.status <> 'DECLINED')
      ORDER BY p.updated_at`,
  );
  const queue = await all<Proposal>(`${PROPOSAL_SELECT} WHERE p.status IN ('SUBMITTED','FOR_REVIEW') ORDER BY p.updated_at`);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Stat label="To check" value={await s("SUBMITTED")} href="/proposals?status=SUBMITTED" />
        <Stat label="To assign" value={await s("FOR_REVIEW")} href="/proposals?status=FOR_REVIEW" />
        <Stat label="Under review" value={await s("UNDER_REVIEW")} href="/proposals?status=UNDER_REVIEW" />
        <Stat label="Pending revisions" value={(await s("REVISION_REQUIRED")) + (await s("INCOMPLETE"))} href="/proposals?status=REVISION_REQUIRED" />
        <Stat label="Approved" value={await s("APPROVED")} href="/proposals?status=APPROVED" />
        <Stat label="Overdue reviews" value={await count("SELECT COUNT(*) AS n FROM review_assignments WHERE status='PENDING' AND due_date < ?", new Date().toISOString().slice(0, 10))} />
        <Stat label="Post-approval to act on" value={reportsToAct} href="/post-approval?status=SUBMITTED" />
      </div>
      {saes.length > 0 && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">Serious adverse event report(s) waiting</div>
          <ul className="mt-1 list-disc pl-5">
            {saes.map((r) => (
              <li key={r.report_id}><Link className="underline" href={`/post-approval/${r.report_id}`}>{r.reference_no}</Link> — submitted {fmtDate(r.submitted_at)}</li>
            ))}
          </ul>
        </div>
      )}
      {needReviewer.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Reviewer declined — assign another reviewer</div>
          <ul className="mt-1 list-disc pl-5">
            {needReviewer.map((p) => <li key={p.proposal_id}><Link className="underline" href={`/proposals/${p.proposal_id}`}>{p.reference_no}</Link> — {p.title}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Work queue (check / assign)">
          {queue.length ? <ProposalTable rows={queue} showResearcher /> : <Empty>Nothing waiting.</Empty>}
        </Section>
        <Section title="Ready for decision">
          {ready.length ? <ProposalTable rows={ready} showResearcher /> : <Empty>No proposals with all reviews submitted.</Empty>}
        </Section>
      </div>
    </div>
  );
}
