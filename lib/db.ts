import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import { SCHEMA_SQL } from "./schema";
import { hashPassword } from "./password";

/**
 * Database access. One code path for both environments:
 *  - Production (Vercel): Turso, a hosted SQLite. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
 *  - Local development: a SQLite file in data/recms.db (no setup needed).
 */
export const DATA_DIR = process.env.RECMS_DATA_DIR ?? path.join(process.cwd(), "data");

/** Demo accounts created on first run when the database is empty. */
export const DEMO_ACCOUNTS = [
  { full_name: "System Administrator", email: "admin@recms.local", password: "Admin@123", role: "ADMIN", college: "Research and Publication Center" },
  { full_name: "ERC Secretariat", email: "secretariat@recms.local", password: "Secretariat@123", role: "SECRETARIAT", college: "Ethics Research Committee" },
  { full_name: "Dr. Maria Santos", email: "reviewer1@recms.local", password: "Reviewer@123", role: "REVIEWER", college: "College of Health Sciences" },
  { full_name: "Dr. Jose Reyes", email: "reviewer2@recms.local", password: "Reviewer@123", role: "REVIEWER", college: "College of Arts and Sciences" },
  { full_name: "Juan Dela Cruz", email: "researcher@recms.local", password: "Researcher@123", role: "RESEARCHER", college: "College of Engineering, Architecture and Technology" },
] as const;

type Param = string | number | null;
type Params = Param[];

let client: Client | undefined;
let ready: Promise<void> | undefined;
/** Set while inside tx(), so every helper uses the open transaction. */
const txStore = new AsyncLocalStorage<Transaction>();

function getClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (url) {
      client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      client = createClient({ url: `file:${path.join(DATA_DIR, "recms.db")}` });
    }
  }
  return client;
}

async function init(): Promise<void> {
  const c = getClient();
  await c.executeMultiple(SCHEMA_SQL);
  const row = (await c.execute("SELECT COUNT(*) AS n FROM users")).rows[0];
  if (Number(row.n) === 0) {
    for (const a of DEMO_ACCOUNTS) {
      await c.execute({
        sql: "INSERT INTO users (full_name, email, password_hash, role, college) VALUES (?, ?, ?, ?, ?)",
        args: [a.full_name, a.email, hashPassword(a.password), a.role, a.college],
      });
    }
  }
}

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = init().catch((e) => {
      ready = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return ready;
}

/** The executor for the current context: the open transaction, or the client. */
async function exec(sql: string, params: Params) {
  await ensureReady();
  const t = txStore.getStore();
  return t ? t.execute({ sql, args: params as InArgs }) : getClient().execute({ sql, args: params as InArgs });
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await exec(sql, params)).rows as unknown as T[];
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await exec(sql, params)).rows[0] as unknown as T | undefined;
}

export async function run(sql: string, ...params: Param[]) {
  const r = await exec(sql, params);
  return { changes: Number(r.rowsAffected), lastId: Number(r.lastInsertRowid ?? 0) };
}

/** Runs fn inside one database transaction; rolls back if it throws. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn(); // already inside one
  await ensureReady();
  const t = await getClient().transaction("write");
  try {
    const out = await txStore.run(t, fn);
    await t.commit();
    return out;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}
