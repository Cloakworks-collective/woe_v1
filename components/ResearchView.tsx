import Link from "next/link";
import { Art } from "@/components/Art";
import { MAX_FIELD_LEVEL, RESEARCH_FIELDS, RESEARCH_INFO, researchOrdinalCost } from "@/lib/constants";
import { researchLevel, researchRate, totalResearchLevels, type Player } from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

// 1 turn = 10 minutes → a compact "~N turns (~Xh Ym)" ETA.
function etaLabel(turns: number): string {
  if (!Number.isFinite(turns) || turns <= 0) return "—";
  const mins = turns * 10;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const time = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return `~${fmt(turns)} turn${turns === 1 ? "" : "s"} (${time})`;
}

/** The Collegium at a glance — the field under study with its progress, then
 *  every field's art and level so a ruler sees the whole tech tree filling in. */
export function ResearchView({ player: p }: { player: Player }) {
  const active = RESEARCH_FIELDS.find((f) => f.id === p.research.activeField);
  const activeLvl = active ? researchLevel(p, active.id) : 0;
  const banked = active ? p.research.banked[active.id] ?? 0 : 0;
  const cost = active ? researchOrdinalCost(totalResearchLevels(p) + 1) : 0;
  const pct = active && cost > 0 ? Math.min(100, Math.round((banked / cost) * 100)) : 0;
  const rate = researchRate(p);
  const maxed = Boolean(active) && activeLvl >= MAX_FIELD_LEVEL;
  /**
   * A maxed field is NOT a study in progress, so it does not get the headline.
   *
   * It used to render as one — name, "— mastered", and "The scholars have wrung
   * this field dry" — which duplicated the 5/5 pips in the grid below AND read
   * like a happy ending. It is not one: `tick.ts` keeps banking points into the
   * active field whatever its level, while the level-up loop is gated at
   * MAX_FIELD_LEVEL, so every point those scholars make is poured away until
   * somebody moves them. Showing the prompt instead says the one useful thing.
   */
  const studying = active && !maxed ? active : undefined;

  return (
    <>
      {studying ? (
        <div className="rsch-active">
          <Art path={`research/${studying.id}`} size={64} title={studying.name} />
          <div className="rsch-active-body">
            <div className="rsch-active-name">
              {studying.name}{" "}
              <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                — level {activeLvl} → {activeLvl + 1}
              </span>
            </div>
            <div className="rsch-bar" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="rsch-active-sub">
              <b style={{ color: "var(--pos)" }}>{pct}%</b> · {fmt(banked)} / {fmt(cost)} points ·{" "}
              <b style={{ color: "var(--pos)" }}>+{fmt(rate)}</b>/turn
              {rate > 0 && (
                <>
                  {" · "}⏳ {etaLabel(Math.ceil((cost - banked) / rate))}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, margin: "0 0 8px" }}>
          {maxed ? (
            <>
              <b style={{ color: "var(--warn)" }}>{active!.name} is at {MAX_FIELD_LEVEL}/{MAX_FIELD_LEVEL}</b>{" "}
              — every point your scholars make is being poured into a field that cannot rise.{" "}
              <Link href="/research">Set them on something else</Link>.
            </>
          ) : (
            <>
              No scholars at work — <Link href="/research">choose a field to study</Link>.
            </>
          )}
        </p>
      )}

      <div className="rsch-grid">
        {RESEARCH_FIELDS.map((f) => {
          const lvl = researchLevel(p, f.id);
          const isActive = f.id === p.research.activeField;
          return (
            <Link
              key={f.id}
              href="/research"
              className={`rsch-tile${isActive ? " active" : ""}${lvl === 0 ? " none" : ""}`}
              title={`${RESEARCH_INFO[f.id].title}${f.ranked ? "" : " (shadow field — power, not ranking)"} — ${RESEARCH_INFO[f.id].tip}`}
            >
              <span className="rsch-tile-art">
                <Art path={`research/${f.id}`} size={44} title={f.name} />
                <span className="rsch-lv">
                  {lvl}/{MAX_FIELD_LEVEL}
                </span>
              </span>
              <span className="rsch-tile-name">{f.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
