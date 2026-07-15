import Link from "next/link";
import { Panel } from "@/components/Panel";
import { ToneGlyph } from "@/components/ToneGlyph";
import { timeAgo } from "@/components/timeAgo";
import { WAR } from "@/lib/constants";
import { publicBattle, type Clan } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// How each attack mode is told and tinted in the feed.
const MODE: Record<string, { icon: string; verb: string; tone: string }> = {
  raid: { icon: "🐎", verb: "raids", tone: "trade" },
  siege: { icon: "🏰", verb: "storms the castle of", tone: "danger" },
  revenge: { icon: "🗡", verb: "takes revenge upon", tone: "war" },
  bombard: { icon: "💥", verb: "bombards", tone: "shadow" },
};

export default async function WorldNewsPage() {
  const { world, player: me } = await getGame();

  // playerId → their clan.
  const clanOf: Record<string, Clan> = {};
  for (const c of Object.values(world.clans)) for (const m of c.members) clanOf[m] = c;

  // Active clan wars, deduped to one row per warring pair.
  const seen = new Set<string>();
  const wars: { a: Clan; b: Clan; net: number }[] = [];
  for (const c of Object.values(world.clans)) {
    for (const w of c.wars) {
      const other = world.clans[w.clanId];
      if (!other) continue;
      const key = [c.id, other.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      wars.push({ a: c, b: other, net: w.regularKills - w.regularLosses });
    }
  }

  const battles = world.battles.slice(0, 60).map(publicBattle);

  const nameLink = (id: string, n: string) => (
    <Link href={`/empire/${id}`} style={id === me.id ? { fontWeight: 700 } : undefined}>
      {n}
    </Link>
  );
  const clanTag = (id: string) => {
    const c = clanOf[id];
    return c ? <span className="clan-tag">⟨{c.name}⟩</span> : null;
  };

  return (
    <>
      <Panel
        title="⚔ Wars Afoot — banner against banner"
        info="Heralds carry the broad tale: which banners are at war, and who has fallen upon whom. Army composition and plunder stay with the combatants — send scouts and spies if you would know more. For your own story, ride to your Chronicle."
      >
        {wars.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>
            The clans hold an uneasy peace — no war is declared.
          </p>
        ) : (
          <ul className="chron">
            {wars.map(({ a, b, net }) => {
              const leader = net === 0 ? null : net > 0 ? a : b;
              const lead = Math.abs(net);
              return (
                <li key={`${a.id}|${b.id}`} className="chron-row tone-war">
                  <ToneGlyph tone="clan" />
                  <span className="chron-line">
                    🛡 <b>{a.name}</b> wars upon <b>{b.name}</b> —{" "}
                    {leader
                      ? `${leader.name} leads the slaughter by ${lead} of the ${WAR.NET_REGULAR_KILLS_TO_WIN} net kills that decide it`
                      : "the field is evenly bloodied, neither banner ahead"}
                    .
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="📯 The Heralds — the realm's latest battles">
        {battles.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>No battles on record. Peace — for now.</p>
        ) : (
          <ul className="chron">
            {battles.map((b) => {
              const m = MODE[b.mode] ?? { icon: "⚔", verb: "attacks", tone: "war" };
              const aClan = clanOf[b.attackerId];
              const dClan = clanOf[b.defenderId];
              const clanWar =
                aClan && dClan && aClan.id !== dClan.id && aClan.wars.some((w) => w.clanId === dClan.id);
              const outcome =
                b.victor === "none"
                  ? "the engines merely traded fire"
                  : b.victor === "attacker"
                    ? `${b.attackerName} carried the day (${b.rounds}r)`
                    : `${b.defenderName} held the field (${b.rounds}r)`;
              const damage = [
                b.wallDamage > 0 ? `🧱 −${Math.round(b.wallDamage * 100)}%` : "",
                b.buildingsHit > 0 ? `🏚 ${b.buildingsHit}` : "",
                b.attackerGearLost > 0 ? `🏹 −${b.attackerGearLost}` : "",
              ]
                .filter(Boolean)
                .join("  ");
              return (
                <li key={b.id} className={`chron-row tone-${m.tone}`}>
                  <ToneGlyph tone={m.tone} />
                  <span className="chron-line">
                    {m.icon} {nameLink(b.attackerId, b.attackerName)} {clanTag(b.attackerId)}{" "}
                    {m.verb} {nameLink(b.defenderId, b.defenderName)} {clanTag(b.defenderId)} — {outcome}.
                    {clanWar && <span className="chron-badge">⚔ clan war</span>}
                    {(damage || b.attackerTroopsLost + b.defenderTroopsLost > 0) && (
                      <span className="chron-sub">
                        {" "}
                        losses {b.attackerTroopsLost.toLocaleString("en-US")} /{" "}
                        {b.defenderTroopsLost.toLocaleString("en-US")}
                        {damage ? `  ·  ${damage}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="chron-when" title={`turn ${b.tick}`}>
                    {timeAgo(b, world.meta)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
