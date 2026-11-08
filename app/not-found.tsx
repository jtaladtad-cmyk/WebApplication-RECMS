import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-slate-600">The record does not exist or you do not have access to it.</p>
      <Link href="/dashboard" className="btn">Go to dashboard</Link>
    </main>
  );
}
