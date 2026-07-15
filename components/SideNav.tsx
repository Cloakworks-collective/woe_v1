"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; desc: string };

// The sidebar holds only the hands-on management of the empire — building,
// training, and warring. Overview, the wider world, the council, and premium
// all live in the horizontal TopNav so this column stays short.
const SECTIONS: { head: string; sub: string; items: Item[] }[] = [
  {
    head: "The Realm",
    sub: "economy",
    items: [
      { href: "/buildings", label: "🏗️ Buildings", desc: "Construct & upgrade; repair bombard damage" },
      { href: "/train", label: "👥 Workers & Levy", desc: "Assign peasants to jobs; train spies, scouts, warriors" },
      { href: "/research", label: "📚 Research", desc: "The Collegium — 10 fields of technology" },
      { href: "/market", label: "⚖️ Market", desc: "The Grand Bazaar — buy & sell resources" },
    ],
  },
  {
    head: "The War",
    sub: "military",
    items: [
      { href: "/troops", label: "⚔️ The Army", desc: "Equip warriors into footmen/archers/cavalry; hire mercs" },
      { href: "/siege", label: "🏹 Siege Works", desc: "Build engines & see your defensive counters" },
      { href: "/attack", label: "🔥 Attack", desc: "The war room — raid, siege, revenge, bombard" },
      { href: "/spy", label: "🗡️ Spy & Scout", desc: "Espionage missions and reconnaissance" },
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
