import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { get, run } from "./db";
import type { Role } from "./schema";

export const SESSION_COOKIE = "recms_session";
const SESSION_DAYS = 7;

export type User = {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  college: string | null;
  contact_no: string | null;
  is_active: number;
  created_at: string;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run(
    "INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)",
    sha256(token),
    userId,
    expires.toISOString(),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.RECMS_INSECURE_COOKIE !== "1",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function deleteSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE session_id = ?", sha256(token));
  store.delete(SESSION_COOKIE);
}

/** The signed-in, active user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = get<User>(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.college, u.contact_no, u.is_active, u.created_at
       FROM sessions s JOIN users u ON u.user_id = s.user_id
      WHERE s.session_id = ? AND s.expires_at > ? AND u.is_active = 1`,
    sha256(token),
    new Date().toISOString(),
  );
  return user ?? null;
});

/** Require a signed-in user (optionally with one of the given roles). */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect("/dashboard?error=You+do+not+have+access+to+that+page.");
  return user;
}

export const isStaff = (u: User) => u.role === "SECRETARIAT" || u.role === "ADMIN";
