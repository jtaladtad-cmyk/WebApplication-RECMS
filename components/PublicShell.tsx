import Link from "next/link";

/** Simple layout for public pages (verification, privacy notice). */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-800 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="leading-tight">
            <div className="text-lg font-bold tracking-tight">RECMS</div>
            <div className="text-[11px] text-brand-100/70">NDDU Ethics Research Committee</div>
          </Link>
          <nav className="flex gap-4 text-sm text-brand-100">
            <Link href="/verify" className="hover:underline">Verify a clearance</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
    </div>
  );
}
