"use server";

import { requireUser } from "@/lib/auth";
import { all, get, run, tx } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/password";
import { getProposal, notify } from "@/lib/recms";
import { audit } from "@/lib/audit";
import { conflictedMembers, quorum } from "@/lib/meetings";
import { ROLES, VOTES, type Vote } from "@/lib/schema";
import { fmtDate, meetingDate } from "@/lib/format";
import { flash, int, str } from "./util";

/* ───────── Accounts (admin) ───────── */

export async function createUser(form: FormData) {
  const admin = await requireUser("ADMIN");
  const v = {
    full_name: str(form, "full_name"),
    email: str(form, "email").toLowerCase(),
    role: str(form, "role"),
    college: str(form, "college"),
    password: str(form, "password"),
  };
  if (!v.full_name || !v.email) flash("/admin/users", { error: "Name and email are required." });
  if (!(ROLES as readonly string[]).includes(v.role)) flash("/admin/users", { error: "Choose a role." });
  const problem = passwordProblem(v.password);
  if (problem) flash("/admin/users", { error: problem });
  if (await get("SELECT 1 FROM users WHERE email = ?", v.email)) flash("/admin/users", { error: "That email is already registered." });
  const { lastId } = await run(
    "INSERT INTO users (full_name, email, password_hash, role, college) VALUES (?, ?, ?, ?, ?)",
    v.full_name, v.email, hashPassword(v.password), v.role, v.college || null,
  );
  await audit("USER_CREATE", { userId: admin.user_id, entity: "user", entityId: lastId, details: `${v.email} as ${v.role}` });
  flash("/admin/users", { msg: `Account created for ${v.email}.` });
}

export async function updateUser(form: FormData) {
  const admin = await requireUser("ADMIN");
  const id = int(form, "user_id");
  const role = str(form, "role");
  const active = str(form, "is_active") === "1" ? 1 : 0;
  if (!(ROLES as readonly string[]).includes(role)) flash("/admin/users", { error: "Invalid role." });
  if (id === admin.user_id && (role !== "ADMIN" || !active))
    flash("/admin/users", { error: "You cannot demote or deactivate your own account." });
  await run("UPDATE users SET role = ?, is_active = ? WHERE user_id = ?", role, active, id);
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", id);
  await audit("USER_UPDATE", { userId: admin.user_id, entity: "user", entityId: id, details: `role=${role}, active=${active ? "yes" : "no"}` });
  flash("/admin/users", { msg: "Account updated." });
}

export async function resetPassword(form: FormData) {
  const admin = await requireUser("ADMIN");
  const id = int(form, "user_id");
  const pw = str(form, "password");
  const problem = passwordProblem(pw);
  if (problem) flash("/admin/users", { error: problem });
  await run("UPDATE users SET password_hash = ? WHERE user_id = ?", hashPassword(pw), id);
  await run("DELETE FROM sessions WHERE user_id = ?", id);
  await audit("USER_PASSWORD_RESET", { userId: admin.user_id, entity: "user", entityId: id });
  flash("/admin/users", { msg: "Password reset. The user must sign in again." });
}

/* ───────── Meetings (secretariat) ───────── */

export async function createMeeting(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const title = str(form, "title");
  const when = str(form, "scheduled_at");
  const venue = str(form, "venue");
  const agenda = str(form, "agenda");
  const proposalIds = form.getAll("proposal_id").map(Number).filter(Number.isInteger);
  if (!title || !when || !venue) flash("/meetings", { error: "Title, schedule and venue are required." });
  if (Number.isNaN(meetingDate(when).getTime())) flash("/meetings", { error: "Invalid date and time." });

  const meetingId = await tx(async () => {
    const { lastId } = await run(
      "INSERT INTO meetings (title, scheduled_at, venue, agenda, created_by) VALUES (?, ?, ?, ?, ?)",
      title, when, venue, agenda || null, user.user_id,
    );
    const whenText = fmtDate(meetingDate(when).toISOString());
    const refs: string[] = [];
    for (const pid of proposalIds) {
      const p = await getProposal(pid);
      if (!p) continue;
      await run("INSERT OR IGNORE INTO meeting_proposals (meeting_id, proposal_id) VALUES (?, ?)", lastId, pid);
      await notify(p.researcher_id, `${p.reference_no} is on the agenda of "${title}" (${whenText}).`, pid);
      refs.push(p.reference_no);
    }
    // All ERC members (voting reviewers) are invited.
    const members = await all<{ user_id: number }>("SELECT user_id FROM users WHERE role = 'REVIEWER' AND is_active = 1");
    for (const m of members) {
      await notify(m.user_id, `ERC meeting "${title}" is scheduled on ${whenText} at ${venue}.${refs.length ? ` Agenda: ${refs.join(", ")}.` : ""}`);
    }
    await audit("MEETING_CREATE", { userId: user.user_id, entity: "meeting", entityId: lastId, details: `${title} (${when})${refs.length ? `: ${refs.join(", ")}` : ""}` });
    return lastId;
  });
  flash(`/meetings/${meetingId}`, { msg: "Meeting scheduled and members notified." });
}

export async function deleteMeeting(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "meeting_id");
  await run("DELETE FROM meetings WHERE meeting_id = ?", id);
  await audit("MEETING_DELETE", { userId: user.user_id, entity: "meeting", entityId: id });
  flash("/meetings", { msg: "Meeting removed." });
}

async function loadMeeting(id: number) {
  return get<{ meeting_id: number; title: string; held: number }>("SELECT meeting_id, title, held FROM meetings WHERE meeting_id = ?", id);
}

/** Records which ERC members were present. */
export async function saveAttendance(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "meeting_id");
  const m = await loadMeeting(id);
  if (!m) flash("/meetings", { error: "Meeting not found." });
  const present = new Set(form.getAll("present").map(Number).filter(Number.isInteger));
  const members = await all<{ user_id: number }>("SELECT user_id FROM users WHERE role = 'REVIEWER' AND is_active = 1");
  await tx(async () => {
    await run("DELETE FROM meeting_attendance WHERE meeting_id = ?", id);
    for (const mem of members) {
      if (present.has(Number(mem.user_id))) await run("INSERT INTO meeting_attendance (meeting_id, user_id) VALUES (?, ?)", id, mem.user_id);
    }
    await audit("MEETING_ATTENDANCE", { userId: user.user_id, entity: "meeting", entityId: id, details: `${present.size} present` });
  });
  const q = await quorum(id);
  flash(`/meetings/${id}`, { msg: `Attendance saved: ${q.present} of ${q.members.length} members present. ${q.met ? "Quorum met." : `No quorum (needs ${q.required}).`}` });
}

/** Saves the minutes and whether the meeting has been held. */
export async function saveMinutes(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "meeting_id");
  const m = await loadMeeting(id);
  if (!m) flash("/meetings", { error: "Meeting not found." });
  const held = str(form, "held") === "1" ? 1 : 0;
  await run("UPDATE meetings SET minutes = ?, held = ? WHERE meeting_id = ?", str(form, "minutes") || null, held, id);
  await audit("MEETING_MINUTES", { userId: user.user_id, entity: "meeting", entityId: id, details: held ? "marked as held" : null });
  flash(`/meetings/${id}`, { msg: "Minutes saved." });
}

/** Records each present member's vote on one agenda item. Needs a quorum; conflicted members are excluded. */
export async function recordVotes(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "meeting_id");
  const pid = int(form, "proposal_id");
  const back = `/meetings/${id}`;
  const m = await loadMeeting(id);
  if (!m) flash("/meetings", { error: "Meeting not found." });
  if (!(await get("SELECT 1 FROM meeting_proposals WHERE meeting_id = ? AND proposal_id = ?", id, pid)))
    flash(back, { error: "That proposal is not on this meeting's agenda." });
  const q = await quorum(id);
  if (!q.met) flash(back, { error: `Votes can only be recorded with a quorum (${q.required} members present).` });
  const conflicted = await conflictedMembers(pid);
  const votes: { userId: number; vote: Vote }[] = [];
  for (const mem of q.members.filter((x) => Number(x.present) && !conflicted.has(Number(x.user_id)))) {
    const v = str(form, `vote_${mem.user_id}`) as Vote;
    if (!v) continue;
    if (!(VOTES as readonly string[]).includes(v)) flash(back, { error: "Invalid vote." });
    votes.push({ userId: Number(mem.user_id), vote: v });
  }
  if (!votes.length) flash(back, { error: "Record at least one vote." });
  const p = (await getProposal(pid))!;
  await tx(async () => {
    await run("DELETE FROM meeting_votes WHERE meeting_id = ? AND proposal_id = ?", id, pid);
    for (const v of votes) {
      await run("INSERT INTO meeting_votes (meeting_id, proposal_id, user_id, vote) VALUES (?, ?, ?, ?)", id, pid, v.userId, v.vote);
    }
    await audit("MEETING_VOTES", { userId: user.user_id, entity: "meeting", entityId: id, details: `${p.reference_no}: ${votes.length} vote(s)` });
  });
  flash(back, { msg: `Votes recorded for ${p.reference_no}.` });
}

/* ───────── Notifications (everyone) ───────── */

export async function markAllRead() {
  const user = await requireUser();
  await run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", user.user_id);
  flash("/notifications", { msg: "All notifications marked as read." });
}
