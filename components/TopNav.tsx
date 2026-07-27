"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import { CHRONICLE_GROUPS } from "@/lib/lore/elderAges";

type Item = { href: string; label: string; title: string };

/**
 * The desktop top bar for the WIDER WORLD and meta links — everything that
 * isn't managing your own empire (that all lives in the left SideNav now:
 * Command, economy, war, and your court). Kept to a handful of entries —
 * two direct links plus two themed dropdowns (Rankings, Annals) — so the row
 * always fits on one line and never wraps. On mobile it's hidden and
 * MobileNav's burger takes over. The premium entry always reads "Premium"; it
 * routes to the Royal Charter buy page until owned, then to the Steward manager
 * (the Charter's automation) — one product, one nav label.
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

  const worldItem: Item = { href: "/battles", label: "🌍 World", title: "The living age — clan wars, the latest battles, and the grand chronicle" };
  const forum: Item = { href: "/forum", label: "🕯️ Forum", title: "The Forum — era chat & permanent letters with other empires" };
  const premiumItem: Item = premium
    ? { href: "/steward", label: "👑 Premium", title: "Your Royal Charter — the Steward's build/research queues, standing orders & auto-banking" }
    : { href: "/premium", label: "👑 Premium", title: "The Royal Charter (premium) — the Steward: queues, standing orders & auto-banking while you're away" };

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
  const guidesActive = pathname.startsWith("/guide") || pathname.startsWith("/almanac");
  const closeMenu = (e: MouseEvent<HTMLAnchorElement>) =>
    e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <nav className="topnav" aria-label="The wider world">
      <div className="topnav-inner">
        <div className="topnav-group">
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
                🏆 Records of the Age <span className="topnav-menu-sub">rulers, champions & titles — still being written</span>
              </Link>
            </div>
          </details>

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

          {render(forum)}
        </div>

        <div className="topnav-group topnav-meta">
          <details className="topnav-dd">
            <summary className={guidesActive ? "active" : ""} title="Guides — the Field Manual and the Codex of Balance">
              📜 Guides ▾
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/guide" onClick={closeMenu}>
                📜 Field Manual <span className="topnav-menu-sub">how to win — growth, war & the market</span>
              </Link>
              <Link href="/almanac" onClick={closeMenu}>
                ⚖ Codex of Balance <span className="topnav-menu-sub">every curve & constant, charted</span>
              </Link>
            </div>
          </details>
          {render(premiumItem)}
        </div>
      </div>
    </nav>
  );
}
