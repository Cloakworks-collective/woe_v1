"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Art } from "@/components/Art";

/**
 * The left rail of the letters room: every thread you already have, then every
 * ruler you don't yet.
 *
 * Letters used to be a <select> of the whole roster — which meant the one thing
 * the page could not tell you was who had written to you. Two rulers share
 * exactly one thread (dmChannel sorts the pair of ids), so a conversation is a
 * correspondent, and this is simply the list of them, newest reply first.
 */
export interface Correspondent {
  id: string;
  name: string;
  race: string;
  raceName: string;
  clanName?: string;
  /** Absent for a ruler you have never written to. */
  last?: { body: string; when: string; mine: boolean };
}

export function Correspondents({
  entries,
  activeId,
}: {
  entries: Correspondent[];
  activeId?: string;
}) {
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => q.trim().toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const shown = useMemo(() => {
    if (terms.length === 0) return entries;
    return entries.filter((e) => {
      const hay = `${e.name} ${e.raceName} ${e.clanName ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [entries, terms]);

  const open = shown.filter((e) => e.last);
  const fresh = shown.filter((e) => !e.last);

  return (
    <aside className="dm-rail">
      <div className="dm-search">
        <input
          ref={boxRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder="🔍 Find a ruler…"
          aria-label="Find a correspondent"
          autoComplete="off"
          className="dm-search-box"
        />
      </div>

      {shown.length === 0 && <p className="comms-empty">No ruler by that name.</p>}

      {open.length > 0 && (
        <>
          <div className="dm-head">Ongoing letters</div>
          <ul className="dm-list">
            {open.map((e) => (
              <Row key={e.id} e={e} active={e.id === activeId} />
            ))}
          </ul>
        </>
      )}

      {fresh.length > 0 && (
        <>
          <div className="dm-head">Write to someone new</div>
          <ul className="dm-list">
            {fresh.map((e) => (
              <Row key={e.id} e={e} active={e.id === activeId} />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function Row({ e, active }: { e: Correspondent; active: boolean }) {
  return (
    <li>
      <Link
        href={`/messages?with=${e.id}`}
        className={active ? "dm-row is-open" : "dm-row"}
        aria-current={active ? "page" : undefined}
      >
        <span className="dm-avatar">
          <Art path={`races/${e.race}`} size={26} title={e.raceName} />
        </span>
        <span className="dm-body">
          <span className="dm-name">
            {e.name}
            {e.last && <span className="dm-when"> · {e.last.when}</span>}
          </span>
          {e.last ? (
            <span className="dm-snip">
              {e.last.mine && <span className="dm-you">You: </span>}
              {e.last.body}
            </span>
          ) : (
            <span className="dm-snip dm-snip-none">
              {e.raceName}
              {e.clanName ? ` · ${e.clanName}` : ""}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
