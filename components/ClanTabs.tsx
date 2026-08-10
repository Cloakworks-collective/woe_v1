"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ClanBadges } from "@/lib/server/clanView";

// The clan's own tab strip. Deliberately NOT extra sidebar rows: the sidebar is
// "everything you manage in your OWN empire", and every one of these is
// meaningless to a bannerless player. Same pattern (and CSS) as the Rankings
// tabs. The badges are the point of the split — a leader should see "3
// petitions" without loading and scrolling a page to find out.

const TABS: { href: string; label: string }[] = [
  { href: "/clan", label: "🛡 Hall" },
  { href: "/clan/works", label: "🏛 Works" },
  { href: "/clan/vault", label: "🏦 Vault" },
  { href: "/clan/chat", label: "💬 Chat" },
  { href: "/clan/war", label: "⚔ War Front" },
];

export function ClanTabs({ badges }: { badges: ClanBadges }) {
  const pathname = usePathname();
  return (
    <nav className="rank-tabs clan-tabs" aria-label="Clan">
      {TABS.map((t) => {
        // Exact match: "/clan" is a prefix of every other tab.
        const active = pathname === t.href;
        const badge =
          t.href === "/clan" && badges.petitions > 0
            ? { text: `${badges.petitions} petition${badges.petitions === 1 ? "" : "s"}`, tone: "warn" }
            : t.href === "/clan/chat" && badges.chatToday > 0
              ? { text: `${badges.chatToday} today`, tone: "soft" }
              : t.href === "/clan/war" && badges.atWar
                ? { text: "at war", tone: "warn" }
                : null;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            {t.label}
            {badge && (
              <span
                className="clan-tab-badge"
                style={badge.tone === "warn" ? { color: "var(--warn)" } : undefined}
              >
                {badge.text}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
