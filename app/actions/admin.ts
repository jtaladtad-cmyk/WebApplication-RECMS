"use server";

import { requireUser } from "@/lib/auth";
import { all, get, run, tx } from "@/lib/db";
import { hashPassword, passwordProblem } from "@/lib/password";
import { getProposal } from "@/lib/recms";
import { ROLES } from "@/lib/schema";
import { fmtDate, meetingDate } from "@/lib/format";
import { flash, int, str } from "./util";

/* ───────── Accounts (admin) ───────── */

export async function createUser(form: FormData) {
  await requireUser("ADMIN");
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
  await run(
    "INSERT INTO users (full_name, email, password_hash, role, college) VALUES (?, ?, ?, ?, ?)",
    v.full_name, v.email, hashPassword(v.password), v.role, v.college || null,
  );
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
  flash("/admin/users", { msg: "Account updated." });
}

export async function resetPassword(form: FormData) {
  await requireUser("ADMIN");
  const id = int(form, "user_id");
  const pw = str(form, "password");
  const problem = passwordProblem(pw);
  if (problem) flash("/admin/users", { error: problem });
  await run("UPDATE users SET password_hash = ? WHERE user_id = ?", hashPassword(pw), id);
  await run("DELETE FROM sessions WHERE user_id = ?", id);
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

  await tx(async () => {
    const { lastId } = await run(
      "INSERT INTO meetings (title, scheduled_at, venue, agenda, created_by) VALUES (?, ?, ?, ?, ?)",
      title, when, venue, agenda || null, user.user_id,
    );
    const whenText = fmtDate(meetingDate(when).toISOString());
    const notified = new Set<number>();
    for (const pid of proposalIds) {
      const p = await getProposal(pid);
      if (!p) continue;
      await run("INSERT OR IGNORE INTO meeting_proposals (meeting_id, proposal_id) VALUES (?, ?)", lastId, pid);
      const reviewers = await all<{ reviewer_id: number }>(
        "SELECT DISTINCT reviewer_id FROM review_assignments WHERE proposal_id = ?",
        pid,
      );
      for (const r of reviewers) {
        if (notified.has(r.reviewer_id)) continue;
        notified.add(r.reviewer_id);
        await run(
          "INSERT INTO notifications (user_id, proposal_id, message) VALUES (?, ?, ?)",
          r.reviewer_id, pid, `Review meeting "${title}" scheduled on ${whenText} at ${venue}.`,
        );
      }
      await run(
        "INSERT INTO notifications (user_id, proposal_id, message) VALUES (?, ?, ?)",
        p.researcher_id, pid, `${p.reference_no} is on the agenda of "${title}" (${whenText}).`,
      );
    }
  });
  flash("/meetings", { msg: "Meeting scheduled and participants notified." });
}

export async function deleteMeeting(form: FormData) {
  await requireUser("SECRETARIAT", "ADMIN");
  await run("DELETE FROM meetings WHERE meeting_id = ?", int(form, "meeting_id"));
  flash("/meetings", { msg: "Meeting removed." });
}

/* ───────── Notifications (everyone) ───────── */

export async function markAllRead() {
  const user = await requireUser();
  await run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", user.user_id);
  flash("/notifications", { msg: "All notifications marked as read." });
}
