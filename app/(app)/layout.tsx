import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/recms";
import { label } from "@/lib/format";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "@/components/NavLinks";
import type { Role } from "@/lib/schema";

const NAV: Record<Role, { href: string; label: string }[]> = {
  RESEARCHER: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/proposals", label: "My Proposals" },
    { href: "/proposals/new", label: "New Submission" },
  ],
  SECRETARIAT: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/proposals", label: "Proposals" },
    { href: "/meetings", label: "Meetings" },
    { href: "/reports", label: "Reports" },
  ],
  REVIEWER: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/reviews", label: "My Reviews" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/proposals", label: "Proposals" },
    { href: "/meetings", label: "Meetings" },
    { href: "/reports", label: "Reports" },
    { href: "/admin/users", label: "Accounts" },
  ],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = unreadCount(user.user_id);
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-brand-800 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="mr-2 leading-tight">
            <div className="text-lg font-bold tracking-tight">RECMS</div>
            <div className="text-[11px] text-brand-100/70">NDDU Ethics Research Committee</div>
          </Link>
          <NavLinks items={NAV[user.role]} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/notifications" className="relative rounded-md px-2 py-1 hover:bg-brand-800" aria-label={`Notifications (${unread} unread)`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-400 px-1 text-center text-[11px] font-bold text-slate-900">{unread}</span>
              )}
            </Link>
            <Link href="/profile" className="hidden text-right leading-tight hover:underline sm:block">
              <div className="font-medium">{user.full_name}</div>
              <div className="text-[11px] text-brand-100/70">{label(user.role)}</div>
            </Link>
            <form action={logout}>
              <button className="rounded-md border border-brand-600 px-3 py-1 text-xs hover:bg-brand-800">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
