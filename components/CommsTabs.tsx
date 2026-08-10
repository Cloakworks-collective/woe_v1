"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Two rooms, two rhythms. Letters are private and permanent; the era hall is
// public and dies with the age. They were tabs inside one page, which meant the
// nav could not tell you which you were in — or link you straight to one.
const TABS: { href: string; label: string }[] = [
  { href: "/messages", label: "✉ Letters" },
  { href: "/messages/chat", label: "🕯 Era Chat" },
];

export function CommsTabs() {
  const pathname = usePathname();
  return (
    <nav className="rank-tabs clan-tabs" aria-label="Communications">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
