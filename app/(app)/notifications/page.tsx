import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { markAllRead } from "@/app/actions/admin";
import { Empty, Flash, PageHeader, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const rows = all<{ notification_id: number; proposal_id: number | null; message: string; is_read: number; created_at: string }>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 200",
    user.user_id,
  );
  const unread = rows.filter((r) => !r.is_read).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread`}
        action={unread > 0 && <form action={markAllRead}><button className="btn-secondary">Mark all as read</button></form>}
      />
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? <Empty>No notifications yet.</Empty> : (
        <ul className="card divide-y divide-slate-100 p-0">
          {rows.map((n) => (
            <li key={n.notification_id} className={`flex items-start gap-3 px-5 py-3 text-sm ${n.is_read ? "" : "bg-brand-50/60"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-slate-300" : "bg-amber-500"}`} />
              <div className="flex-1">
                <p className={n.is_read ? "text-slate-600" : "font-medium text-slate-900"}>{n.message}</p>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fmtDate(n.created_at)}
                  {n.proposal_id && (
                    <> · <Link className="link" href={user.role === "REVIEWER" ? "/reviews" : `/proposals/${n.proposal_id}`}>Open</Link></>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
