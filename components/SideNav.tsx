"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; desc: string };

// The sidebar holds everything you manage in your OWN empire — overview,
// economy, war, and your court. The wider world (rankings, the age's battles,
// the annals, the forum) plus the meta links (manual, premium) live in the
// horizontal TopNav.
//
// `icon` names an emblem in /art/ui/icons, cut from the PixelLab sheet by
// scripts/ui-kit.py. These replaced emoji labels: an OS emoji renders in full
// colour at whatever resolution the platform likes, which read as a sticker
// stuck to a game drawn at 32px — and looked different on every machine.
//
// `desc` is the link's tooltip only. It used to print under every label, but
// three lines of 10px grey on dark oak fought the label it was explaining —
// the emblem and the section heading already say what the page is, so the
// sentence is one hover away instead of always underfoot.
const SECTIONS: { head: string; sub: string; items: Item[] }[] = [
  {
    head: "The Court",
    sub: "your seat & council",
    items: [
      { href: "/", label: "Command", icon: "castle", desc: "Your empire at a glance — decrees & treasury" },
      { href: "/chronicle", label: "Chronicle", icon: "chronicle", desc: "Your own tidings & battles" },
      { href: "/advisors", label: "Advisors", icon: "advisor", desc: "Four councillors read your numbers" },
    ],
  },
  {
    head: "The Realm",
    sub: "economy",
    items: [
      { href: "/buildings", label: "Buildings", icon: "build", desc: "Construct & upgrade; repair bombard damage" },
      { href: "/train", label: "Workers & Levy", icon: "workers", desc: "Assign peasants to jobs; train spies & scouts" },
      { href: "/research", label: "Research", icon: "research", desc: "The Collegium — 10 fields of technology" },
      { href: "/market", label: "Market", icon: "market", desc: "The Grand Bazaar — buy & sell resources" },
    ],
  },
  {
    head: "The War",
    sub: "military",
    items: [
      { href: "/troops", label: "The Army", icon: "army", desc: "Raise footmen/archers/cavalry; hire mercenaries" },
      { href: "/siege", label: "Siege Works", icon: "siege", desc: "Build engines & see your defensive counters" },
      { href: "/clan", label: "Clan", icon: "clan", desc: "Your banner — hall, works & vault, chat, wars" },
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
            {s.head} <span className="nav-head-sub">{s.sub}</span>
          </div>
          {s.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} title={item.desc}>
                <img src={`/art/ui/icons/${item.icon}.png`} alt="" className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
