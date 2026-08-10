"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import { CHRONICLE_GROUPS } from "@/lib/lore/elderAges";

type Item = { href: string; label: string; icon: string; title: string };

/** An emblem from the PixelLab sheet — see SideNav for why these aren't emoji. */
function Emblem({ name, sm }: { name: string; sm?: boolean }) {
  return <img src={`/art/ui/icons/${name}.png`} alt="" className={sm ? "nav-icon nav-icon-sm" : "nav-icon"} />;
}

/**
 * The desktop top bar for META links — the annals, the Heralds (letters, the
 * era hall and the public forum),
 * guides, the sandboxes and the Charter. Everything you MANAGE lives in the
 * left SideNav, and so now does the wider world: the ladder and the age's
 * battles moved down there, because the header also carries the realm's name
 * and the throne and had run out of room. Kept short so the row always fits on
 * one line and never wraps. On mobile it's hidden and
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

  const premiumItem: Item = premium
    ? { href: "/steward", label: "Premium", icon: "crown", title: "Your Royal Charter — the Steward's build/research queues, standing orders & auto-banking" }
    : { href: "/premium", label: "Premium", icon: "crown", title: "The Royal Charter (premium) — the Steward: queues, standing orders & auto-banking while you're away" };

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/steward" || href === "/premium"
        ? pathname === "/steward" || pathname === "/premium"
        : pathname.startsWith(href);

  const render = (item: Item, extraClass = "") => (
    <Link
      key={item.href}
      href={item.href}
      className={[extraClass, active(item.href) ? "active" : ""].filter(Boolean).join(" ")}
      title={item.title}
    >
      <Emblem name={item.icon} /> {item.label}
    </Link>
  );

  const annalsActive = pathname.startsWith("/annals");
  const guidesActive = pathname.startsWith("/guide") || pathname.startsWith("/almanac");
  const toolsActive = pathname.startsWith("/tools");
  const commsActive = pathname.startsWith("/messages") || pathname.startsWith("/forum");
  const closeMenu = (e: MouseEvent<HTMLAnchorElement>) =>
    e.currentTarget.closest("details")?.removeAttribute("open");

  return (
    <nav className="topnav" aria-label="The wider world">
      <div className="topnav-inner">
        <div className="topnav-group">
          <details className="topnav-dd">
            <summary className={annalsActive ? "active" : ""} title="The finished history — sealed ages and the elder legends">
              <Emblem name="chronicle" /> Annals
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/annals" onClick={closeMenu}>
                <Emblem name="chronicle" sm /> Sealed Ages <span className="topnav-menu-sub">finished eras, kept for all time</span>
              </Link>
              <div className="topnav-menu-head">Elder Ages</div>
              {CHRONICLE_GROUPS.map((g) => (
                <Link key={g.key} href={`/annals#g-${g.key}`} onClick={closeMenu}>
                  <Emblem name="banner" sm /> {g.title} <span className="topnav-menu-sub">Ages {g.ageLabel}</span>
                </Link>
              ))}
            </div>
          </details>

          <details className="topnav-dd">
            <summary className={commsActive ? "active" : ""} title="Where the realm's words travel — letters, the era hall, and the public forum">
              <Emblem name="letter" /> Heralds
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/messages" onClick={closeMenu}>
                <Emblem name="letter" sm /> Letters{" "}
                <span className="topnav-menu-sub">private & permanent, one ruler at a time</span>
              </Link>
              <Link href="/messages/chat" onClick={closeMenu}>
                <Emblem name="forum" sm /> Era Chat{" "}
                <span className="topnav-menu-sub">one public room for this age — wiped when it ends</span>
              </Link>
              <div className="topnav-menu-head">Beyond the age</div>
              <Link href="/forum" onClick={closeMenu}>
                <Emblem name="chronicle" sm /> The Forum{" "}
                <span className="topnav-menu-sub">its own login — outlives every era</span>
              </Link>
            </div>
          </details>


          <details className="topnav-dd">
            <summary className={guidesActive ? "active" : ""} title="Guides — the Field Manual and the Codex of Balance">
              <Emblem name="scroll" /> Guides
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/guide" onClick={closeMenu}>
                <Emblem name="scroll" sm /> Field Manual <span className="topnav-menu-sub">how to win — growth, war & the market</span>
              </Link>
              <Link href="/almanac" onClick={closeMenu}>
                <Emblem name="market" sm /> Codex of Balance <span className="topnav-menu-sub">every curve & constant, charted</span>
              </Link>
            </div>
          </details>

          <details className="topnav-dd">
            <summary className={toolsActive ? "active" : ""} title="Sandboxes — test a battle or a ranking with no effect on the world">
              <Emblem name="siege" /> Tools
            </summary>
            <div className="topnav-menu" role="menu">
              <Link href="/tools/battle" onClick={closeMenu}>
                <Emblem name="army" sm /> Battle Calculator{" "}
                <span className="topnav-menu-sub">pit any two armies — real engine, no consequences</span>
              </Link>
              <Link href="/tools/ranking" onClick={closeMenu}>
                <Emblem name="trophy" sm /> Ranking Calculator{" "}
                <span className="topnav-menu-sub">what the ladder counts, and what it hides</span>
              </Link>
            </div>
          </details>

          {render(premiumItem, "topnav-charter")}
        </div>
      </div>
    </nav>
  );
}
