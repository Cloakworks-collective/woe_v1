import Link from "next/link";
import {
  CHRONICLE_GROUPS,
  ELDER_AGES,
  groupForAge,
  type ElderAge,
  type ElderTable,
} from "@/lib/lore/elderAges";

const RACE_ICON: Record<string, string> = {
  Human: "🧑",
  Elf: "🏹",
  Orc: "🐗",
  Troll: "🪓",
  Dwarf: "⛏",
  Gnoll: "🐺",
};

function victorMark(a: ElderAge) {
  return a.victorIsEmpire ? " 🛡" : a.victorRace ? ` ${RACE_ICON[a.victorRace] ?? ""}` : "";
}

export function LeaderTable({ t }: { t: ElderTable }) {
  const numeric = new Set(t.numeric ?? []);
  return (
    <div className="elder-table-wrap">
      <div className="elder-table-title">
        {t.title}
        {t.note && <span className="elder-table-note"> — {t.note}</span>}
      </div>
      <table className="tbl elder-tbl">
        <thead>
          <tr>
            {t.headers.map((h, i) => (
              <th key={i} className={numeric.has(i) ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={numeric.has(ci) ? "num" : undefined}>
                  {typeof cell === "object" && cell !== null ? (
                    <Link href={cell.href}>{cell.text}</Link>
                  ) : cell === "" ? (
                    "—"
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The full record of ONE elder age — every leaderboard, expanded. Rendered on
 * its own subpage (`/annals/age/[age]`) so the heavy tables load only when a
 * reader opens that age, not all 35 at once.
 */
export function ElderAgeDetail({ age: a }: { age: ElderAge }) {
  const group = groupForAge(a.age);
  return (
    <div className="elder-detail">
      <p className="elder-lore">{a.lore}</p>
      <p className="elder-crown">
        👑 <b>{group.crownLabel}:</b> {a.victor}
        {a.victorRace ? ` — ${a.victorRace}` : ""}
      </p>
      {a.topRuler && (
        <p className="elder-crown">
          🥇 <b>Foremost ruler:</b> {a.topRuler.name}
          {a.topRuler.clan ? ` of ${a.topRuler.clan}` : " (beholden to no banner)"}
          {a.topRuler.race ? ` — ${a.topRuler.race}` : ""}
        </p>
      )}
      {a.tables.map((t, i) => (
        <LeaderTable key={i} t={t} />
      ))}
    </div>
  );
}

/**
 * A light index of all 35 elder ages, grouped into the four victory eras. Each
 * age is a link-card (badge, name, span, victor) to its own subpage — no
 * leaderboard tables here, so `/annals` stays fast to load.
 */
export function ElderAgesIndex() {
  const sorted = [...ELDER_AGES].sort((a, b) => a.age - b.age);
  return (
    <div className="elder-realm">
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 4px" }}>
        War of Empires is the modern iteration of an elder realm that stood from 2005 to 2013 —{" "}
        <b>thirty-five recorded ages</b> of glory. The sages committed these great names to live
        forever; bards yet sing of their exploits. Because the win itself changed down the years, the
        chronicles fall into four eras. Open any age to read its full record.
      </p>

      {CHRONICLE_GROUPS.map((g) => {
        const ages = sorted.filter((a) => groupForAge(a.age).key === g.key);
        return (
          <section className="elder-group" id={`g-${g.key}`} key={g.key}>
            <div className="elder-group-head">
              <span className="elder-group-title">{g.title}</span>
              <span className="elder-group-ages">Ages {g.ageLabel}</span>
            </div>
            <p className="elder-group-rule">{g.rule}</p>
            {ages.length === 0 ? (
              <p className="elder-empty">— chronicles yet to be recovered —</p>
            ) : (
              <div className="elder-cards">
                {ages.map((a) => (
                  <Link key={a.age} href={`/annals/age/${a.age}`} className="elder-card">
                    <span className="elder-num">Age {a.age}</span>
                    <span className="elder-card-name">{a.name}</span>
                    <span className="elder-span">{a.span}</span>
                    <span className="elder-card-victor">
                      🏆 {a.victor}
                      {victorMark(a)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
