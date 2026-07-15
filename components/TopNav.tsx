"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { CHRONICLE_GROUPS } from "@/lib/lore/elderAges";

type Item = { href: string; label: string; title: string };

/**
 * Horizontal bar under the top resource bar for the secondary destinations —
 * the council, the wider world, and the premium hub — keeping the left sidebar
 * short and focused on the core loop. The premium entry is contextual: it reads
 * "Royal Charter" (the buy page) until owned, then "The Steward" (the manager).
 */
export function TopNav({ premium }: { premium: boolean }) {
  const pathname = usePathname();

  // Three intent-based groups: your own empire · the wider world · help & account.
  const you: Item[] = [
    { href: "/", label: "🏰 Command", title: "Your empire at a glance — decrees, treasury, chronicle" },
    { href: "/chronicle", label: "📖 Chronicle", title: "Your own story — every tiding and battle you were part of" },
    { href: "/advisors", label: "🧙 Advisors", title: "Four councillors read your real numbers and advise" },
  ];
  // The Annals sit in a dropdown (this age + the four elder eras) so the heavy
  // history lives on its own subpages rather than one giant page.
  const worldBefore: Item[] = [
    { href: "/battles", label: "🌍 World News", title: "The realm at war — clan wars and who is attacking whom" },
  ];
  const worldAfter: Item[] = [
    { href: "/rankings", label: "📜 Rankings", title: "The ladder — find targets and track the crown" },
    { href: "/clan", label: "🛡️ Clan", title: "Found or join a clan; shared storage and wars" },
    { href: "/forum", label: "🕯️ Forum", title: "Era chat and permanent letters" },
  ];
  const meta: Item[] = [
    { href: "/guide", label: "📜 Field Manual", title: "How to win: growth, battle strategy, the whole game" },
    premium
      ? { href: "/steward", label: "🪶 The Steward", title: "Your build/research queues & standing orders" }
      : { href: "/premium", label: "👑 Royal Charter", title: "Buy the Steward — automation while you're away" },
  ];

  const render = (item: Item) => {
    const active =
      item.href === "/"
        ? pathname === "/"
        : item.href === "/steward" || item.href === "/premium"
          ? pathname === "/steward" || pathname === "/premium"
          : pathname.startsWith(item.href);
    return (
      <Link key={item.href} href={item.href} className={active ? "active" : ""} title={item.title}>
        {item.label}
      </Link>
    );
  };

  const annalsActive = pathname.startsWith("/annals");
  const closeMenu = (e: MouseEvent<HTMLAnchorElement>) =>
    e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <nav className="topnav" aria-label="Your empire, the world, and help">
      <div className="topnav-inner">
        <div className="topnav-group" aria-label="Your empire">{you.map(render)}</div>
        <div className="topnav-group" aria-label="The world">
          {worldBefore.map(render)}
          <details className="topnav-dd">
            <summary
              className={annalsActive ? "active" : ""}
              title="The grand chronicle of the age, and the sealed history of all elder ages"
            >
              📚 Annals ▾
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/annals" onClick={closeMenu}>
                📜 The Annals — this age
              </Link>
              <Link href="/annals/records" onClick={closeMenu}>
                ⚔ War Records — this age
              </Link>
              <div className="topnav-menu-head">Elder Ages</div>
              {CHRONICLE_GROUPS.map((g) => (
                <Link key={g.key} href={`/annals#g-${g.key}`} onClick={closeMenu}>
                  ⚜ {g.title} <span className="topnav-menu-sub">Ages {g.ageLabel}</span>
                </Link>
              ))}
            </div>
          </details>
          {worldAfter.map(render)}
        </div>
        <div className="topnav-group topnav-meta" aria-label="Help and account">{meta.map(render)}</div>
      </div>
    </nav>
  );
}
