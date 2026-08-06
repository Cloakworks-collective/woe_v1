"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; desc: string };

// The sidebar holds everything you manage in your OWN empire — overview,
// economy, war, and your court. The wider world (rankings, the age's battles,
// the annals, the forum) plus the meta links (manual, premium) live in the
// horizontal TopNav.
const SECTIONS: { head: string; sub: string; items: Item[] }[] = [
  {
    head: "The Court",
    sub: "your seat & council",
    items: [
      { href: "/", label: "🏰 Command", desc: "Your empire at a glance — decrees & treasury" },
      { href: "/chronicle", label: "📖 Chronicle", desc: "Your own tidings & battles" },
      { href: "/advisors", label: "🧙 Advisors", desc: "Four councillors read your numbers" },
    ],
  },
  {
    head: "The Realm",
    sub: "economy",
    items: [
      { href: "/buildings", label: "🏗️ Buildings", desc: "Construct & upgrade; repair bombard damage" },
      { href: "/train", label: "👥 Workers & Levy", desc: "Assign peasants to jobs; train spies & scouts" },
      { href: "/research", label: "📚 Research", desc: "The Collegium — 10 fields of technology" },
      { href: "/market", label: "⚖️ Market", desc: "The Grand Bazaar — buy & sell resources" },
    ],
  },
  {
    head: "The War",
    sub: "military",
    items: [
      { href: "/troops", label: "⚔️ The Army", desc: "Raise footmen/archers/cavalry; hire mercenaries" },
      { href: "/siege", label: "🏹 Siege Works", desc: "Build engines & see your defensive counters" },
      { href: "/clan", label: "🛡️ Clan", desc: "Your banner — hall, works & vault, chat, wars" },
    ],
  },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {SECTIONS.map((s) => (
        <div key={s.head}>
          <div className="nav-head">
            {s.head} <span className="nav-head-sub">· {s.sub}</span>
          </div>
          {s.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} title={item.desc}>
                <span className="nav-label">{item.label}</span>
                <span className="nav-desc">{item.desc}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
