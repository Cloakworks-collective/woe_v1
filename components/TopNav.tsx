"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import { CHRONICLE_GROUPS } from "@/lib/lore/elderAges";

type Item = { href: string; label: string; title: string };

/**
 * The desktop top bar of secondary destinations. Kept to a handful of entries —
 * four direct links plus three themed dropdowns (Rankings, World, Court) — so
 * the row always fits on one line and never wraps. On mobile it's hidden and
 * MobileNav's burger takes over. The premium entry is contextual: "Royal
 * Charter" (buy) until owned, then "The Steward" (manager).
 */
export function TopNav({ premium }: { premium: boolean }) {
  const pathname = usePathname();

  // Native <details> only closes via its own summary. Close any open dropdown
  // when the click (or Escape) lands outside it — this also enforces one-open-
  // at-a-time, since opening one closes the rest.
  useEffect(() => {
    const openDropdowns = () =>
      document.querySelectorAll<HTMLDetailsElement>("details.topnav-dd[open]");
    const onClick = (e: globalThis.MouseEvent) => {
      const t = e.target as Node | null;
      openDropdowns().forEach((d) => {
        if (!t || !d.contains(t)) d.open = false;
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openDropdowns().forEach((d) => (d.open = false));
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const command: Item = { href: "/", label: "🏰 Command", title: "Your empire at a glance — decrees, treasury, chronicle" };
  const clan: Item = { href: "/clan", label: "🛡️ Clan", title: "Found or join a clan; shared storage and wars" };
  const worldItem: Item = { href: "/battles", label: "🌍 World", title: "The living age — clan wars, the latest battles, and the grand chronicle" };
  const guide: Item = { href: "/guide", label: "📜 Field Manual", title: "How to win: growth, battle strategy, the whole game" };
  const premiumItem: Item = premium
    ? { href: "/steward", label: "🪶 The Steward", title: "Your build/research queues & standing orders" }
    : { href: "/premium", label: "👑 Buy Premium", title: "The Royal Charter — queues, standing orders & auto-banking while you're away" };

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/steward" || href === "/premium"
        ? pathname === "/steward" || pathname === "/premium"
        : pathname.startsWith(href);

  const render = (item: Item) => (
    <Link key={item.href} href={item.href} className={active(item.href) ? "active" : ""} title={item.title}>
      {item.label}
    </Link>
  );

  const rankingsActive = pathname.startsWith("/rankings");
  const annalsActive = pathname.startsWith("/annals");
  const courtActive =
    pathname.startsWith("/chronicle") || pathname.startsWith("/advisors") || pathname.startsWith("/forum");
  const closeMenu = (e: MouseEvent<HTMLAnchorElement>) =>
    e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <nav className="topnav" aria-label="The wider world and your court">
      <div className="topnav-inner">
        <div className="topnav-group">
          {render(command)}

          <details className="topnav-dd">
            <summary className={rankingsActive ? "active" : ""} title="The ladder — empire ranks, clan ranks, and your war console">
              📜 Rankings ▾
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/rankings" onClick={closeMenu}>
                🏰 Empire Ranks <span className="topnav-menu-sub">every empire · attack & spy</span>
              </Link>
              <Link href="/rankings/clans" onClick={closeMenu}>
                🛡️ Clan Ranks <span className="topnav-menu-sub">the banners of the age</span>
              </Link>
              <Link href="/rankings/records" onClick={closeMenu}>
                ⚔ War Records <span className="topnav-menu-sub">this age, still being written</span>
              </Link>
            </div>
          </details>

          {render(clan)}

          {render(worldItem)}

          <details className="topnav-dd">
            <summary className={annalsActive ? "active" : ""} title="The finished history — sealed ages and the elder legends">
              📚 Annals ▾
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/annals" onClick={closeMenu}>
                📚 Sealed Ages <span className="topnav-menu-sub">finished eras, kept for all time</span>
              </Link>
              <div className="topnav-menu-head">Elder Ages</div>
              {CHRONICLE_GROUPS.map((g) => (
                <Link key={g.key} href={`/annals#g-${g.key}`} onClick={closeMenu}>
                  ⚜ {g.title} <span className="topnav-menu-sub">Ages {g.ageLabel}</span>
                </Link>
              ))}
            </div>
          </details>

          <details className="topnav-dd">
            <summary className={courtActive ? "active" : ""} title="Your court — your chronicle, your councillors, and the forum">
              🕯️ Court ▾
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/chronicle" onClick={closeMenu}>
                📖 Chronicle <span className="topnav-menu-sub">your own tidings & battles</span>
              </Link>
              <Link href="/advisors" onClick={closeMenu}>
                🧙 Advisors <span className="topnav-menu-sub">four councillors read your numbers</span>
              </Link>
              <Link href="/forum" onClick={closeMenu}>
                🕯️ Forum <span className="topnav-menu-sub">era chat & permanent letters</span>
              </Link>
            </div>
          </details>
        </div>

        <div className="topnav-group topnav-meta">
          {render(guide)}
          {render(premiumItem)}
        </div>
      </div>
    </nav>
  );
}
