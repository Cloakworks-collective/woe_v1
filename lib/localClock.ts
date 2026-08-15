// Speaking the realm's clock in the reader's.
//
// The realm counts in TICKS — ten minutes each, 144 to a day — and its day
// boundary is an accident of when the world was seeded. "Turn 84" therefore
// tells a player in Delhi nothing about whether they will be awake for it,
// which is the whole problem the settler-hour control exists to solve.
//
// These are the pure parts of that translation, kept out of the component so
// they can be tested. The component owns the React; this owns the arithmetic.

/** Minutes past midnight, in a zone `zoneMins` east of UTC. */
export function minutesOfDay(atMs: number, zoneMins: number): number {
  const shifted = new Date(atMs + zoneMins * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** An instant as HH:MM on a 24-hour clock, in a zone `zoneMins` east of UTC. */
export function hhmm(atMs: number, zoneMins: number): string {
  const mins = minutesOfDay(atMs, zoneMins);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Distance between two times of day, the short way round: 23:58 is two
 *  minutes from midnight, not 1,438. */
export function clockGap(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 1440 - raw);
}

export interface DawnChoice {
  /** The local hour this option is offered as. */
  hour: number;
  /** The realm tick-offset it submits. */
  offset: number;
  /** The local time it ACTUALLY lands at — see the note below. */
  hhmm: string;
}

/**
 * One option per local hour, each carrying the realm slot nearest to it.
 *
 * Slots are ten minutes apart, so any local hour is reachable to within five
 * minutes — but rarely exactly, because the realm's slots sit wherever the
 * world happened to start. We therefore label each option with the time it
 * truly lands at rather than the round number asked for. Quoting "07:00" and
 * delivering 06:57 would be a small lie told at the one moment the player is
 * committing to it for the age.
 */
export function dawnChoices(opts: {
  currentTick: number;
  lastTickAtMs: number;
  turnMinutes: number;
  turnsPerDay: number;
  zoneMins: number;
}): DawnChoice[] {
  const { currentTick, lastTickAtMs, turnMinutes, turnsPerDay, zoneMins } = opts;
  const dayStart = currentTick - (currentTick % turnsPerDay);
  const tickToMs = (tick: number) => lastTickAtMs + (tick - currentTick) * turnMinutes * 60_000;

  const out: DawnChoice[] = [];
  for (let hour = 0; hour < 24; hour++) {
    let best = 0;
    let bestGap = Infinity;
    for (let offset = 0; offset < turnsPerDay; offset++) {
      const gap = clockGap(minutesOfDay(tickToMs(dayStart + offset), zoneMins), hour * 60);
      if (gap < bestGap) {
        bestGap = gap;
        best = offset;
      }
    }
    out.push({ hour, offset: best, hhmm: hhmm(tickToMs(dayStart + best), zoneMins) });
  }
  return out;
}

/**
 * Work out the reader's UTC offset from "it is actually HH:MM here".
 *
 * The escape hatch for a browser that reports the wrong zone — a VM left on
 * UTC, a laptop that never changed country, a VPN-shaped guess. Getting this
 * wrong is expensive because the settler hour is set once an age, so the player
 * is allowed to simply state the truth and have the offset derived from it.
 *
 * Snapped to a quarter hour, which every real zone is, so a minute or two of
 * typing slop resolves to the zone they plainly meant. Returns null on anything
 * unparseable rather than guessing.
 *
 * A TIME OF DAY DOES NOT NAME A ZONE. "01:00" when it is 12:00 UTC is both
 * UTC−11 (Niue) and UTC+13 (Tonga) — same clock face, different date. Both
 * would show the player identical times everywhere in this control, so the
 * ambiguity is nearly harmless; it shows up only in whether an arrival is
 * described as today or tomorrow. We settle it with `hintMins`, the offset the
 * browser reported: someone correcting a clock that is out by an hour or two
 * stays in their own hemisphere instead of being flung across the date line.
 */
export function offsetFromStatedTime(
  stated: string,
  nowMs: number,
  hintMins = 0,
): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(stated.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;

  const now = new Date(nowMs);
  const diff = hours * 60 + mins - (now.getUTCHours() * 60 + now.getUTCMinutes());
  // Every candidate that reads as this clock face and is a real-world offset,
  // then the one nearest what the browser thought.
  const candidates = [diff - 1440, diff, diff + 1440]
    .filter((d) => d > -720 && d <= 840)
    .map((d) => Math.round(d / 15) * 15);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, d) =>
    Math.abs(d - hintMins) < Math.abs(best - hintMins) ? d : best,
  );
}
