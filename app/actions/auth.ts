"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession, getCurrentUser, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { get, run } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { flash, str } from "./util";

export type FormState = { error?: string; values?: Record<string, string> } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  if (!email || !password) return { error: "Enter your email and password.", values: { email } };

  const user = await get<{ user_id: number; password_hash: string; is_active: number }>(
    "SELECT user_id, password_hash, is_active FROM users WHERE email = ?",
    email,
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    await audit("LOGIN_FAILED", { userId: user?.user_id ?? null, details: email });
    return { error: "Incorrect email or password.", values: { email } };
  }
  if (!user.is_active) {
    await audit("LOGIN_FAILED", { userId: user.user_id, details: `${email} (deactivated)` });
    return { error: "This account is deactivated. Contact the ERC secretariat.", values: { email } };
  }

  await createSession(user.user_id);
  await audit("LOGIN", { userId: user.user_id });
  redirect("/dashboard");
}

/** Self-registration is for researchers only; staff/reviewer accounts are created by an admin. */
export async function register(_: FormState, form: FormData): Promise<FormState> {
  const values = {
    full_name: str(form, "full_name"),
    email: str(form, "email").toLowerCase(),
    college: str(form, "college"),
    contact_no: str(form, "contact_no"),
  };
  const password = str(form, "password");
  const confirm = str(form, "confirm");

  if (!values.full_name || !values.email || !values.college)
    return { error: "Full name, email and college are required.", values };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: "Enter a valid email address.", values };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, values };
  if (password !== confirm) return { error: "Passwords do not match.", values };
  if (str(form, "privacy_consent") !== "1")
    return { error: "You must agree to the Privacy Notice to create an account.", values };
  if (await get("SELECT 1 FROM users WHERE email = ?", values.email))
    return { error: "An account with that email already exists.", values };

  const { lastId } = await run(
    "INSERT INTO users (full_name, email, password_hash, role, college, contact_no, privacy_consent_at) VALUES (?, ?, ?, 'RESEARCHER', ?, ?, datetime('now'))",
    values.full_name,
    values.email,
    hashPassword(password),
    values.college,
    values.contact_no || null,
  );
  await audit("REGISTER", { userId: lastId, entity: "user", entityId: lastId, details: `${values.email}; privacy notice accepted` });
  await createSession(lastId);
  redirect("/dashboard?msg=Welcome+to+RECMS!+Your+researcher+account+is+ready.");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit("LOGOUT", { userId: user.user_id });
  await deleteSession();
  redirect("/login");
}

export async function updateProfile(form: FormData) {
  const user = await requireUser();
  const full_name = str(form, "full_name");
  if (!full_name) flash("/profile", { error: "Full name is required." });
  await run(
    "UPDATE users SET full_name = ?, college = ?, contact_no = ? WHERE user_id = ?",
    full_name,
    str(form, "college") || null,
    str(form, "contact_no") || null,
    user.user_id,
  );
  await audit("PROFILE_UPDATE", { userId: user.user_id, entity: "user", entityId: user.user_id });
  flash("/profile", { msg: "Profile updated." });
}

export async function changePassword(form: FormData) {
  const user = await requireUser();
  const row = (await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE user_id = ?", user.user_id))!;
  const next = str(form, "new_password");
  if (!verifyPassword(str(form, "current_password"), row.password_hash))
    flash("/profile", { error: "Current password is incorrect." });
  const problem = passwordProblem(next);
  if (problem) flash("/profile", { error: problem });
  if (next !== str(form, "confirm")) flash("/profile", { error: "New passwords do not match." });
  await run("UPDATE users SET password_hash = ? WHERE user_id = ?", hashPassword(next), user.user_id);
  await audit("PASSWORD_CHANGE", { userId: user.user_id, entity: "user", entityId: user.user_id });
  flash("/profile", { msg: "Password changed." });
}
