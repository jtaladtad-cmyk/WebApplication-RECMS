import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { conflictedMembers, quorum } from "@/lib/meetings";
import { VOTES } from "@/lib/schema";
import { fmtDate, label, meetingDate } from "@/lib/format";
import { recordVotes, saveAttendance, saveMinutes } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireUser("SECRETARIAT", "ADMIN");
  const id = Number((await params).id);
  const m = await get<{ meeting_id: number; title: string; scheduled_at: string; venue: string; agenda: string | null; minutes: string | null; held: number }>(
    "SELECT meeting_id, title, scheduled_at, venue, agenda, minutes, held FROM meetings WHERE meeting_id = ?",
    id,
  );
  if (!m) notFound();
  const q = await quorum(id);
  const present = q.members.filter((x) => Number(x.present));
  const items = await all<{ proposal_id: number; reference_no: string; title: string; status: string }>(
    `SELECT p.proposal_id, p.reference_no, p.title, p.status FROM meeting_proposals mp
       JOIN proposals p ON p.proposal_id = mp.proposal_id WHERE mp.meeting_id = ? ORDER BY p.reference_no`,
    id,
  );
  const votes = await all<{ proposal_id: number; user_id: number; vote: string }>(
    "SELECT proposal_id, user_id, vote FROM meeting_votes WHERE meeting_id = ?",
    id,
  );
  const conflicts = new Map<number, Set<number>>();
  for (const it of items) conflicts.set(it.proposal_id, await conflictedMembers(it.proposal_id));

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/meetings" className="link">← Meetings</Link></div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{m.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{fmtDate(meetingDate(m.scheduled_at).toISOString())} · {m.venue}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${Number(m.held) ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>
          {Number(m.held) ? "Held" : "Scheduled"}
        </span>
      </div>
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Agenda and votes">
            {m.agenda && <p className="mb-4 whitespace-pre-wrap text-sm text-slate-700">{m.agenda}</p>}
            {items.length === 0 ? <p className="text-sm text-slate-500">No proposals on the agenda.</p> : (
              <div className="space-y-4">
                {items.map((it) => {
                  const conflicted = conflicts.get(it.proposal_id)!;
                  const itemVotes = votes.filter((v) => v.proposal_id === it.proposal_id);
                  const tally = VOTES.map((v) => [v, itemVotes.filter((x) => x.vote === v).length] as const).filter(([, n]) => n > 0);
                  return (
                    <div key={it.proposal_id} className="rounded-md border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Link className="link font-mono text-xs" href={`/proposals/${it.proposal_id}`}>{it.reference_no}</Link>
                          <div className="text-sm font-medium">{it.title}</div>
                        </div>
                        <Badge value={it.status} />
                      </div>
                      {tally.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600" data-testid={`tally-${it.proposal_id}`}>
                          Recorded: {tally.map(([v, n]) => `${label(v)} ${n}`).join(" · ")}
                        </div>
                      )}
                      {!q.met ? (
                        <p className="mt-3 text-sm text-amber-700">Record attendance with a quorum before recording votes.</p>
                      ) : (
                        <form action={recordVotes} className="mt-3 space-y-2">
                          <input type="hidden" name="meeting_id" value={id} />
                          <input type="hidden" name="proposal_id" value={it.proposal_id} />
                          {present.map((mem) => {
                            const excused = conflicted.has(Number(mem.user_id));
                            const current = itemVotes.find((v) => Number(v.user_id) === Number(mem.user_id))?.vote ?? "";
                            return (
                              <div key={mem.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span>{mem.full_name}</span>
                                {excused ? (
                                  <span className="text-xs text-slate-500">Excused — conflict of interest</span>
                                ) : (
                                  <div className="w-48">
                                    <select name={`vote_${mem.user_id}`} defaultValue={current} className="input py-1" aria-label={`Vote of ${mem.full_name} on ${it.reference_no}`}>
                                      <option value="">— no vote —</option>
                                      {VOTES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div className="flex justify-end"><SubmitButton className="btn-secondary py-1">Save votes</SubmitButton></div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Votes are a record of the deliberation. Record the ERC&apos;s formal decision on each proposal&apos;s page.
            </p>
          </Section>
          <Section title="Minutes">
            <form action={saveMinutes} className="space-y-3">
              <input type="hidden" name="meeting_id" value={id} />
              <label className="sr-only" htmlFor="minutes">Minutes</label>
              <textarea id="minutes" name="minutes" rows={10} defaultValue={m.minutes ?? ""} className="input" placeholder="Call to order, attendance and quorum, conflicts declared, discussion and actions on each protocol, adjournment…" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="held" value="1" defaultChecked={!!Number(m.held)} /> This meeting has been held
              </label>
              <div className="flex justify-end"><SubmitButton>Save minutes</SubmitButton></div>
            </form>
          </Section>
        </div>
        <aside className="space-y-6">
          <Section title="Attendance and quorum">
            <div className={`mb-3 rounded-md p-3 text-sm ${q.met ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`} data-testid="quorum">
              {q.present} of {q.members.length} members present. {q.met ? "Quorum met." : `No quorum (needs ${q.required}).`}
            </div>
            <form action={saveAttendance} className="space-y-2">
              <input type="hidden" name="meeting_id" value={id} />
              {q.members.length === 0 && <p className="text-sm text-slate-500">No active ERC members (reviewers).</p>}
              {q.members.map((mem) => (
                <label key={mem.user_id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="present" value={mem.user_id} defaultChecked={!!Number(mem.present)} /> {mem.full_name}
                </label>
              ))}
              <div className="flex justify-end pt-2"><SubmitButton className="btn-secondary">Save attendance</SubmitButton></div>
            </form>
          </Section>
        </aside>
      </div>
    </>
  );
}
