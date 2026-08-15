"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Art } from "@/components/Art";
import { ReqTip } from "@/components/CostTip";
import { TargetActions } from "@/components/TargetActions";
import type { TargetState } from "@/lib/constants/attackGating";

/**
 * The ladder table, filtered as you type.
 *
 * The search used to be a GET form: type, press Search, wait for the whole page
 * to come back. Finding "that elf in the Iron Pact" took three round trips and
 * you could not tell you had mistyped until the empty table arrived. So the
 * server now hands over the WHOLE ladder as plain data — a couple of hundred
 * bytes an empire — and the filtering and paging happen here, in the browser,
 * on every keystroke.
 *
 * The rows are rendered from data rather than shipped as markup precisely so
 * this stays cheap: only the thirty rows of the current page are ever in the
 * DOM, however long the ladder gets.
 */
export interface LadderRow {
  id: string;
  name: string;
  race: string;
  raceName: string;
  rank: number;
  clanId?: string;
  clanName?: string;
  /** "None · Weak · Moderate · Strong · Heavy" — a traveller's guess. */
  troops: string;
  population: number;
  isMe: boolean;
  onVacation: boolean;
  shielded: boolean;
  revengeOpen: boolean;
  atWar: boolean;
  allied: boolean;
  allyClanName?: string;
  state: TargetState;
  hint?: string;
  /** Everything the box matches on — name, race, clan, settlement title, rank
   *  — lower-cased once on the server so a keystroke is a substring test. */
  hay: string;
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** Every whitespace-separated word must appear somewhere in the row, so
 *  "elf iron" finds the elves of the Iron Pact and nothing else. */
function matches(hay: string, terms: string[]): boolean {
  for (const t of terms) if (!hay.includes(t)) return false;
  return true;
}

export function Ladder({
  rows,
  initialQuery = "",
  initialPage = 1,
  pageSize = 30,
  arm,
  tradecraft,
  pathfinding,
  last,
}: {
  rows: LadderRow[];
  initialQuery?: string;
  initialPage?: number;
  pageSize?: number;
  arm?: "attack" | "scout" | "spy";
  tradecraft: number;
  pathfinding: number;
  last?: { scoutOp?: string; scoutAgents?: number; spyOp?: string; spyAgents?: number };
}) {
  const [q, setQ] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const boxRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(
    () => q.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [q],
  );
  const filtered = useMemo(
    () => (terms.length === 0 ? rows : rows.filter((r) => matches(r.hay, terms))),
    [rows, terms],
  );

  // A new query starts at its own first page — page 4 of a search that returns
  // two rows is an empty table. Skipped on the first render so arriving with
  // ?act=attack still opens at your own rank.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(1);
  }, [q]);

  // Keep the address bar honest without paying for a server round trip — a
  // filtered ladder stays a link you can send someone. history.replaceState
  // does not re-run the route, which is the whole point.
  useEffect(() => {
    const id = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set("q", q.trim());
      else url.searchParams.delete("q");
      url.searchParams.delete("page");
      window.history.replaceState(null, "", url.toString());
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageNo = Math.min(Math.max(1, page), pages);
  const start = (pageNo - 1) * pageSize;
  const shown = filtered.slice(start, start + pageSize);

  return (
    <>
      <div className="rank-search">
        <span className="rank-search-glass" aria-hidden="true">
          🔍
        </span>
        <input
          ref={boxRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder="Search empire, race, clan or title…"
          aria-label="Search the ladder"
          autoComplete="off"
          className="rank-search-box"
        />
        {q && (
          <button type="button" className="rank-search-clear" onClick={() => { setQ(""); boxRef.current?.focus(); }} aria-label="Clear the search">
            ✕
          </button>
        )}
        <span className="rank-search-count" aria-live="polite">
          {terms.length === 0
            ? `${fmt(rows.length)} empires`
            : `${fmt(filtered.length)} of ${fmt(rows.length)} match`}
        </span>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th className="num">Rank</th>
            <th>Empire</th>
            <th>Clan</th>
            <th>
              <ReqTip
                down
                heading="Troop strength — a traveller's guess"
                body="Read as a passer-by would judge it: None · Weak · Moderate · Strong · Heavy. Exact counts are for spies — run an op from 🗡 Spy to see the real muster."
              >
                <span className="tip-under">Troops</span>
              </ReqTip>
            </th>
            <th className="num">
              <ReqTip
                down
                heading="Population — the victory fuel"
                body="Civilians + regular troops (mercenaries never count). Ranking score also weighs walls, buildings, treasury, experience, and 7 of the 10 research fields — and the victory clocks only tick with enough REGULARS in the field (mercenaries and engineers do not count)."
              >
                <span className="tip-under">Population</span>
              </ReqTip>
            </th>
            <th>Act</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6} className="rank-nohits">
                No empire answers to <b>{q.trim()}</b> — try part of a name, a race, or a clan.
              </td>
            </tr>
          ) : (
            shown.map((r) => (
              // The green wash is the one flag worth reading from across the
              // table: an empire on vacation cannot be attacked, spied on or
              // scouted at all, so every order on this row will bounce. Better
              // to see that before opening the menu than after the pipeline
              // refuses the strike.
              <tr
                key={r.id}
                className={r.onVacation ? "rank-away" : undefined}
                style={r.isMe ? { fontWeight: 700 } : undefined}
              >
                <td className="num">
                  {r.rank === 1 ? (
                    <span style={{ color: "var(--coin)", fontWeight: 700 }}>👑 1</span>
                  ) : r.rank <= 3 ? (
                    <span style={{ color: "var(--coin)" }}>{r.rank}</span>
                  ) : (
                    r.rank
                  )}
                </td>
                <td>
                  <span className="race-cell">
                    <span className="race-avatar">
                      <Art path={`races/${r.race}`} size={30} title={r.raceName} />
                    </span>
                    <span>
                      <Link href={`/empire/${r.id}`}>{r.name}</Link>
                      {r.isMe && <span style={{ color: "var(--pos)" }}> (you)</span>}
                      {/* Only the flags that change what you can DO to this
                          empire. The settlement title was a restatement of
                          the population column, and the race is the avatar
                          sitting immediately to the left of it. */}
                      {(r.revengeOpen || r.atWar || r.allied || r.onVacation || r.shielded) && (
                        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                          {r.revengeOpen && <span style={{ color: "var(--warn)", fontWeight: 700 }}>⚔ revenge open</span>}
                          {r.atWar && <span style={{ color: "var(--warn)" }}>{r.revengeOpen ? " · " : ""}🔥 at war</span>}
                          {r.allied && <span style={{ color: "var(--pos)", fontWeight: 700 }}>{r.revengeOpen || r.atWar ? " · " : ""}🤝 allied</span>}
                          {r.onVacation && (
                            <span className="rank-flag-away">
                              {r.revengeOpen || r.atWar ? " · " : ""}🏖 on vacation — untouchable
                            </span>
                          )}
                          {r.shielded && <span>{r.revengeOpen || r.atWar || r.onVacation ? " · " : ""}🛡 shielded</span>}
                        </div>
                      )}
                    </span>
                  </span>
                </td>
                <td>
                  {r.clanId ? (
                    <Link href={`/clan/${r.clanId}`}>{r.clanName}</Link>
                  ) : (
                    <span style={{ color: "var(--ink-soft)" }}>—</span>
                  )}
                </td>
                <td>{r.troops}</td>
                <td className="num">{fmt(r.population)}</td>
                <td>
                  {r.isMe ? (
                    <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>— your seat —</span>
                  ) : (
                    <TargetActions
                      target={{ id: r.id, name: r.name }}
                      revengeOpen={r.revengeOpen}
                      tradecraft={tradecraft}
                      pathfinding={pathfinding}
                      state={r.state}
                      allyClanName={r.allyClanName}
                      last={last}
                      hint={r.hint}
                      only={arm}
                    />
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="rank-pager">
        {pageNo > 1 ? (
          <button type="button" onClick={() => setPage(pageNo - 1)}>
            Prev
          </button>
        ) : (
          <span className="pager-off">Prev</span>
        )}
        <span>
          Showing {filtered.length === 0 ? 0 : start + 1}–{start + shown.length} of{" "}
          {fmt(filtered.length)} empires · Page {pageNo} of {pages}
        </span>
        {pageNo < pages ? (
          <button type="button" onClick={() => setPage(pageNo + 1)}>
            Next
          </button>
        ) : (
          <span className="pager-off">Next</span>
        )}
      </div>
    </>
  );
}
