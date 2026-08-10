"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { glyphs } from "@/components/Glyph";

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
      head: "The Court · your seat & council",
      items: [
        { href: "/", label: "🏰 Command" },
        { href: "/chronicle", label: "📖 Chronicle" },
        { href: "/advisors", label: "🧙 Advisors" },
      ],
    },
    {
      head: "The Realm · economy",
      items: [
        { href: "/buildings", label: "🏗️ Buildings" },
        { href: "/train", label: "👥 Workers & Levy" },
        { href: "/research", label: "📚 Research" },
        { href: "/market", label: "⚖️ Market" },
        { href: "/blackmarket", label: "🕯️ Black Market" },
      ],
    },
    {
      head: "The War · military",
      items: [
        { href: "/troops", label: "⚔️ The Army" },
        { href: "/siege", label: "🏹 Siege Works" },
        { href: "/clan", label: "🛡️ Clan" },
      ],
    },
    {
      head: "The Wider World",
      items: [
        { href: "/rankings", label: "📜 Empire Ranks — the ladder" },
        { href: "/rankings/clans", label: "🛡️ Clan Ranks" },
        { href: "/rankings/records", label: "🏆 Records of the Age" },
        { href: "/battles", label: "🌍 World" },
        { href: "/annals", label: "📚 Annals — sealed ages" },
        { href: "/messages", label: "🕯️ Messages" },
        { href: "/forum", label: "💬 Forum (public)" },
      ],
    },
    {
      head: "Guides & Account",
      items: [
        { href: "/tools/battle", label: "⚔️ Battle Calculator" },
        { href: "/tools/ranking", label: "📜 Ranking Calculator" },
        { href: "/guide", label: "📜 Field Manual" },
        { href: "/almanac", label: "⚖ Codex of Balance" },
        premium
          ? { href: "/steward", label: "👑 Premium" }
          : { href: "/premium", label: "👑 Premium" },
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
        title={open ? "Close the menu" : "Open the navigation menu"}
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
                  {glyphs(it.label)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
