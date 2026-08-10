"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sandboxes. Same tab pattern as the clan and rankings strips.
const TABS: { href: string; label: string }[] = [
  { href: "/tools/battle", label: "⚔️ Battle Calculator" },
  { href: "/tools/ranking", label: "📜 Ranking Calculator" },
];

export function ToolTabs() {
  const pathname = usePathname();
  return (
    <nav className="rank-tabs clan-tabs" aria-label="Tools">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
