"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  // Longest matching prefix wins so /proposals/new doesn't also light up /proposals.
  const active = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-md px-3 py-1.5 ${active === i.href ? "bg-brand-700 font-medium" : "text-brand-100 hover:bg-brand-800"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
