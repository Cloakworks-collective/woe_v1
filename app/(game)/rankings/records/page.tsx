import Link from "next/link";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { RecordsHall, type DaisEntry } from "@/components/RecordsHall";
import { RACE_NAMES } from "@/lib/constants";
import { rankingScore } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { buildEraTables } from "@/lib/server/eraTables";

export const metadata = { title: "Records" };

export const dynamic = "force-dynamic";

export default async function WarRecordsPage() {
  const { world } = await getGame();
  const tables = buildEraTables(world);

  // The three greatest rulers, for the Victors' Dais.
  const dais: DaisEntry[] = Object.values(world.players)
    .map((p) => ({ p, score: rankingScore(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ p, score }) => {
      const clan = p.clanId ? world.clans[p.clanId] : undefined;
      return {
        name: p.name,
        race: p.race,
        raceLabel: RACE_NAMES[p.race] ?? p.race,
        clanName: clan?.name,
        clanHref: clan ? `/clan/${clan.id}` : undefined,
        score,
      };
    });

  return (
    <>
      <LearnLink href="/guide#winning">How the era is won &amp; named</LearnLink>
      <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>
        <Link href="/rankings">← The Ladder</Link>
      </p>

      <Panel
        title={`🏆 Records of the Age — ${world.meta.eraName} (still being written)`}
        info="Every superlative of the age, tallied live: the greatest rulers and clans, the champion of each feat of arms and civil title, the mightiest of each race, and the richest, bloodiest and bitterest clashes. Sealed into the Annals when the age ends. The Clan column links to each clan's page; — means the ruler answers to no clan."
      >
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 4 }}>
          Tallied as the deeds happen; sealed into <Link href="/annals">the Annals</Link> for all
          time when the age ends.
        </p>
        <RecordsHall tables={tables} dais={dais} eraName={world.meta.eraName} />
      </Panel>
    </>
  );
}
