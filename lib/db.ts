import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";
import { hashPassword } from "./password";

export const DATA_DIR = process.env.RECMS_DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type GlobalWithDb = typeof globalThis & { __recmsDb?: DatabaseSync };

/** Demo accounts created on first run — one per role. */
export const DEMO_ACCOUNTS = [
  { full_name: "System Administrator", email: "admin@recms.local", password: "Admin@123", role: "ADMIN", college: "Research and Publication Center" },
  { full_name: "ERC Secretariat", email: "secretariat@recms.local", password: "Secretariat@123", role: "SECRETARIAT", college: "Ethics Research Committee" },
  { full_name: "Dr. Maria Santos", email: "reviewer1@recms.local", password: "Reviewer@123", role: "REVIEWER", college: "College of Health Sciences" },
  { full_name: "Dr. Jose Reyes", email: "reviewer2@recms.local", password: "Reviewer@123", role: "REVIEWER", college: "College of Arts and Sciences" },
  { full_name: "Juan Dela Cruz", email: "researcher@recms.local", password: "Researcher@123", role: "RESEARCHER", college: "College of Engineering, Architecture and Technology" },
] as const;

function open(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "recms.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0) {
    const insert = db.prepare(
      "INSERT INTO users (full_name, email, password_hash, role, college) VALUES (?, ?, ?, ?, ?)",
    );
    for (const a of DEMO_ACCOUNTS) {
      insert.run(a.full_name, a.email, hashPassword(a.password), a.role, a.college);
    }
  }
  return db;
}

export function db(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__recmsDb) g.__recmsDb = open();
  return g.__recmsDb;
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  // Not StatementSync.get(): on Node 22.5 it returns a row of NULLs instead of
  // undefined when nothing matches, which makes every existence check true.
  return (db().prepare(sql).all(...params) as T[])[0];
}

export function run(sql: string, ...params: (string | number | null)[]) {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}
