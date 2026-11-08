import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate, manilaNowLocal, meetingDate } from "@/lib/format";
import { createMeeting, deleteMeeting } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Empty, Flash, PageHeader, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Review meetings" };

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser("SECRETARIAT", "ADMIN");
  const meetings = await all<{ meeting_id: number; title: string; scheduled_at: string; venue: string; agenda: string | null; creator: string }>(
    `SELECT m.*, u.full_name AS creator FROM meetings m JOIN users u ON u.user_id = m.created_by ORDER BY m.scheduled_at DESC`,
  );
  const items = await all<{ meeting_id: number; proposal_id: number; reference_no: string; title: string; status: string }>(
    `SELECT mp.meeting_id, p.proposal_id, p.reference_no, p.title, p.status
       FROM meeting_proposals mp JOIN proposals p ON p.proposal_id = mp.proposal_id`,
  );
  const candidates = await all<{ proposal_id: number; reference_no: string; title: string; status: string }>(
    `SELECT proposal_id, reference_no, title, status FROM proposals
      WHERE status IN ('FOR_REVIEW','UNDER_REVIEW') ORDER BY updated_at`,
  );
  const now = manilaNowLocal();

  return (
    <>
      <PageHeader title="Review meetings" subtitle="Schedule full-board meetings and put proposals on the agenda. Researchers and assigned reviewers are notified." />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <Section title="Schedule a meeting">
            <form action={createMeeting} className="space-y-3">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="input" placeholder="ERC Full Board Meeting" /></div>
              <div><label className="label" htmlFor="scheduled_at">Date &amp; time</label><input id="scheduled_at" name="scheduled_at" type="datetime-local" min={now} required className="input" /></div>
              <div><label className="label" htmlFor="venue">Venue / link</label><input id="venue" name="venue" required className="input" placeholder="RPC Conference Room or meeting link" /></div>
              <div><label className="label" htmlFor="agenda">Agenda</label><textarea id="agenda" name="agenda" rows={3} className="input" /></div>
              <div>
                <div className="label">Proposals for deliberation</div>
                {candidates.length ? (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                    {candidates.map((c) => (
                      <label key={c.proposal_id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="proposal_id" value={c.proposal_id} className="mt-1" />
                        <span><span className="font-mono text-xs">{c.reference_no}</span> {c.title}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No proposals currently for review.</p>}
              </div>
              <div className="flex justify-end"><SubmitButton>Schedule</SubmitButton></div>
            </form>
          </Section>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-3">
          {meetings.length === 0 && <Empty>No meetings scheduled.</Empty>}
          {meetings.map((m) => {
            const upcoming = meetingDate(m.scheduled_at) >= new Date();
            const agendaItems = items.filter((i) => i.meeting_id === m.meeting_id);
            return (
              <div key={m.meeting_id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{m.title}</div>
                    <div className="text-sm text-slate-600">{fmtDate(meetingDate(m.scheduled_at).toISOString())} · {m.venue}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${upcoming ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{upcoming ? "Upcoming" : "Past"}</span>
                    <form action={deleteMeeting}>
                      <input type="hidden" name="meeting_id" value={m.meeting_id} />
                      <SubmitButton className="text-xs text-rose-700 hover:underline" confirm="Remove this meeting?">Remove</SubmitButton>
                    </form>
                  </div>
                </div>
                {m.agenda && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{m.agenda}</p>}
                {agendaItems.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {agendaItems.map((i) => (
                      <li key={i.proposal_id} className="flex min-w-0 items-center gap-2">
                        <Link href={`/proposals/${i.proposal_id}`} className="link font-mono text-xs">{i.reference_no}</Link>
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <Badge value={i.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
