export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen">
      <aside className="hidden w-[42%] flex-col justify-between bg-brand-900 p-10 text-white lg:flex">
        <div>
          <div className="text-sm font-semibold uppercase tracking-widest text-brand-100">Notre Dame of Dadiangas University</div>
          <div className="mt-1 text-xs text-brand-100/70">Research and Publication Center · Ethics Research Committee</div>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Research Ethics Committee Management System</h2>
          <p className="mt-4 max-w-md text-brand-100/80">
            Submit research protocols, track review status in real time, collaborate with reviewers, and download your
            ethics clearance — all in one place.
          </p>
        </div>
        <div className="text-xs text-brand-100/60">RECMS · Marist Avenue, General Santos City</div>
      </aside>
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">NDDU · Ethics Research Committee</div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
