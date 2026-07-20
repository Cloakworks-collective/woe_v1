"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Group = { head: string; items: Item[] };

/**
 * The single mobile menu — a burger that opens a grouped drawer with EVERY
 * destination (both the desktop top-bar and the left sidebar). On desktop this
 * whole component is hidden by CSS and the two desktop navs show instead.
 */
export function MobileNav({ premium }: { premium: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the drawer on an outside tap or Escape (attached only while open, so
  // the tap that opens it can't immediately close it).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups: Group[] = [
    {
      head: "Your Empire",
      items: [
        { href: "/", label: "🏰 Command" },
        { href: "/buildings", label: "🏗️ Buildings" },
        { href: "/train", label: "👥 Workers & Levy" },
        { href: "/research", label: "📚 Research" },
        { href: "/market", label: "⚖️ Market" },
      ],
    },
    {
      head: "War",
      items: [
        { href: "/troops", label: "⚔️ The Army" },
        { href: "/siege", label: "🏹 Siege Works" },
        { href: "/rankings", label: "🔥 Rankings — the ladder" },
        { href: "/rankings/clans", label: "🛡️ Clan Ranks" },
        { href: "/rankings/records", label: "⚔ War Records — this age" },
        { href: "/battles", label: "🌍 World" },
        { href: "/clan", label: "🛡️ Your Clan" },
      ],
    },
    {
      head: "Chronicle & Council",
      items: [
        { href: "/chronicle", label: "📖 Chronicle" },
        { href: "/advisors", label: "🧙 Advisors" },
        { href: "/annals", label: "📚 Annals — sealed ages" },
        { href: "/forum", label: "🕯️ Forum" },
      ],
    },
    {
      head: "Help & Account",
      items: [
        { href: "/guide", label: "📜 Field Manual" },
        premium
          ? { href: "/steward", label: "🪶 The Steward" }
          : { href: "/premium", label: "👑 Buy Premium" },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="mnav" ref={rootRef}>
      <button
        className="mnav-burger"
        aria-expanded={open}
        aria-controls="mnav-drawer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mnav-burger-icon">{open ? "✕" : "☰"}</span> Menu
      </button>
      {open && (
        <nav id="mnav-drawer" className="mnav-drawer" aria-label="Site menu">
          {groups.map((g) => (
            <div key={g.head} className="mnav-group">
              <div className="mnav-head">{g.head}</div>
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={isActive(it.href) ? "active" : ""}
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
