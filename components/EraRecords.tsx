// The living War Records of the current age, drawn in the same hand as the
// sealed Elder Ages (reusing LeaderTable) so this age reads like history the
// moment it is made.

import { LeaderTable } from "./ElderAges";
import { eraRecordsEmpty, topFeuds, topWars, type EraRecords, type RankedBattle } from "@/lib/engine";
import type { ElderTable } from "@/lib/lore/elderAges";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

function battleRows(list: RankedBattle[], valueOnly: boolean): (string | number)[][] {
  return list.map((b, i) =>
    valueOnly
      ? [i + 1, b.attacker, b.attackerTag, b.defender, b.defenderTag, fmt(b.value)]
      : [i + 1, b.attacker, b.attackerTag, b.defender, b.defenderTag, fmt(b.atkLost), fmt(b.defLost), fmt(b.value)],
  );
}

function buildTables(records: EraRecords): ElderTable[] {
  const tables: ElderTable[] = [];

  if (records.richestAttacks.length) {
    tables.push({
      title: "Richest Attacks",
      note: "the greatest hauls of gold taken by force",
      headers: ["#", "ATTACKER", "BANNER", "DEFENDER", "BANNER", "GOLD TAKEN"],
      numeric: [0, 5],
      rows: battleRows(records.richestAttacks, true),
    });
  }

  if (records.richestRaids.length) {
    tables.push({
      title: "Richest Raids",
      note: "the fattest wagons of plunder hauled home",
      headers: ["#", "ATTACKER", "BANNER", "DEFENDER", "BANNER", "RESOURCES"],
      numeric: [0, 5],
      rows: battleRows(records.richestRaids, true),
    });
  }

  if (records.bloodiestAttacks.length) {
    tables.push({
      title: "Bloodiest Attacks",
      note: "the clashes with the most fallen on both sides",
      headers: ["#", "ATTACKER", "BANNER", "DEFENDER", "BANNER", "ATK LOST", "DEF LOST", "TOTAL"],
      numeric: [0, 5, 6, 7],
      rows: battleRows(records.bloodiestAttacks, false),
    });
  }

  const feuds = topFeuds(records);
  if (feuds.length) {
    tables.push({
      title: "Greatest Feuds",
      note: "the bitterest ruler-against-ruler rivalries of the age",
      headers: ["#", "RULER", "BANNER", "RIVAL", "BANNER", "LOSSES", "RIVAL LOSSES", "TOTAL"],
      numeric: [0, 5, 6, 7],
      rows: feuds.map((f, i) => [i + 1, f.n1, f.t1, f.n2, f.t2, fmt(f.v1), fmt(f.v2), fmt(f.total)]),
    });
  }

  const wars = topWars(records);
  if (wars.length) {
    tables.push({
      title: "Greatest Wars",
      note: "the mightiest banner-against-banner wars, by regulars felled",
      headers: ["#", "BANNER", "CODE", "RIVAL", "CODE", "KILLS", "RIVAL KILLS", "TOTAL"],
      numeric: [0, 5, 6, 7],
      rows: wars.map((w, i) => [i + 1, w.n1, w.t1, w.n2, w.t2, fmt(w.v1), fmt(w.v2), fmt(w.total)]),
    });
  }

  return tables;
}

export function EraRecordsView({ records }: { records?: EraRecords }) {
  if (eraRecordsEmpty(records)) {
    return (
      <p style={{ fontSize: 13.5, fontStyle: "italic" }}>
        No deed of arms is yet recorded. When the first blade falls, the age&apos;s records begin.
      </p>
    );
  }
  const tables = buildTables(records!);
  return (
    <div className="elder-detail">
      {tables.map((t, i) => (
        <LeaderTable key={i} t={t} />
      ))}
    </div>
  );
}
