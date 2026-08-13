"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; desc: string; exact?: boolean; /** Never lights up — several rows share one href (the three verbs → the ladder). */ noHighlight?: boolean };

// The sidebar holds everything you manage in your OWN empire — court, economy,
// war — plus THE WIDER WORLD: the ladder and the age's battles. Those two moved
// down from the header, which had run out of room once it also carried the
// realm's name and the throne; and the ladder is visited far too often to live
// behind a dropdown. What stays up top is the meta: annals, messages, forum,
// guides, tools, premium.
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
  // The three VERBS, second from the top — above the economy, because they are
  // what a turn is actually SPENT on. Everything below this is preparation for
  // it. All three land on the ladder, because that is where you pick a target,
  // but each carries `act=` so arriving for one arm shows that order alone
  // instead of putting all three under your cursor on forty rows. That is also
  // what stops them reading as three copies of "Empire Ranks" further down: the
  // scoreboard shows standings, these send an order.
  {
    head: "Take Action",
    sub: "against another empire",
    items: [
      { href: "/rankings?act=attack", label: "Attack", icon: "target", desc: "Pick a target from the ladder and march — raid, castle, bombard or revenge" },
      { href: "/rankings?act=spy", label: "Spy", icon: "skull", desc: "Pick a target and send shadows over the wall — sabotage, theft, arson" },
      { href: "/rankings?act=scout", label: "Scout", icon: "spyglass", desc: "Pick a target and send rangers to watch — open, safe, never intercepted" },
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
      { href: "/blackmarket", label: "Black Market", icon: "market", desc: "The fence — instant resource trades & siege salvage, at the worst price" },
    ],
  },
  // What you RAISE, at home. Deliberately separate from the group below: this
  // one is spending, that one is spending turns on somebody else.
  {
    head: "Your Forces",
    sub: "what you raise at home",
    items: [
      { href: "/troops", label: "The Army", icon: "army", desc: "Raise footmen/archers/cavalry; hire mercenaries" },
      { href: "/siege", label: "Siege Works", icon: "siege", desc: "Build engines & see your defensive counters" },
      { href: "/clan", label: "Clan", icon: "clan", desc: "Your banner — hall, works & vault, chat, wars" },
    ],
  },
  // Moved down from the top bar. These are destinations you visit constantly —
  // the ladder is the game's scoreboard — and the header had run out of room.
  // A dropdown you have to open is also a worse home for the ranking pages than
  // permanent rows.
  {
    head: "The Wider World",
    sub: "standings & the age's story",
    items: [
      { href: "/rankings", label: "Empire Ranks", icon: "trophy", desc: "The standings — every empire in the age, by score", exact: true },
      { href: "/rankings/clans", label: "Clan Ranks", icon: "clan", desc: "The standings of the banners" },
      { href: "/rankings/records", label: "Records", icon: "medal", desc: "Champions & titles of this age — still being written" },
      { href: "/battles", label: "World Chronicle", icon: "world", desc: "The whole realm's story as it happens — crowns, wars, castles sacked" },
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
            // Query strings never appear in `pathname`, so an `?act=` row is
            // matched by its path alone — hence noHighlight on those, or all
            // four ladder rows would light at once.
            const active =
              !item.noHighlight &&
              !item.href.includes("?") &&
              (item.href === "/" || item.exact ? pathname === item.href : pathname.startsWith(item.href));
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={active ? "active" : ""}
                title={item.desc}
              >
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
