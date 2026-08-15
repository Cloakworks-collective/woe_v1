"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Info } from "@/components/Info";
// The engine's OWN scheduler, imported rather than reimplemented. This dialog
// promises an hour and the move cannot be undone, so the two must agree by
// construction — a second copy would eventually forget the 24-hour floor.
import { nextRecruitTick } from "@/lib/engine/commands";
import { dawnChoices, hhmm, offsetFromStatedTime } from "@/lib/localClock";

/**
 * Choose the hour your settlers arrive — in YOUR time, not the realm's.
 *
 * The realm's day boundary is an accident of when the world was seeded, so
 * "14:00 realm time" means nothing to anybody and told a player in Delhi
 * nothing useful about whether they would be awake for it. Everything on this
 * control is therefore stated in local time, and the realm offset it submits is
 * derived rather than typed.
 *
 * THE CLOCK IS NOT ALWAYS RIGHT. Browsers report the machine's timezone, and a
 * machine can be wrong — a VM on UTC, a laptop that never left the last
 * country, a VPN-shaped guess. Getting it wrong here is expensive, because the
 * move is allowed once an age. So the detected time is shown plainly and can be
 * corrected: tell us what time it actually is where you are, and the offset is
 * derived from that instead.
 *
 * GRANULARITY. Turns are ten minutes, so any local hour is reachable to within
 * five minutes, but rarely exactly — the realm's slots sit wherever the world
 * happened to start. We pick the closest slot to the hour asked for and then
 * show the true local time of it, rather than quoting a round number we cannot
 * actually deliver.
 */
export function RecruitHourPicker({
  currentTick,
  lastTickAtMs,
  turnMinutes,
  turnsPerDay,
  lastRecruitAtTick,
}: {
  currentTick: number;
  /** Wall-clock ms of the tick numbered `currentTick` — the anchor that turns
   *  realm ticks into real instants. */
  lastTickAtMs: number;
  turnMinutes: number;
  turnsPerDay: number;
  lastRecruitAtTick?: number;
}) {
  const msPerTick = turnMinutes * 60_000;
  /** Real instant of any realm tick. */
  const tickToMs = (tick: number) => lastTickAtMs + (tick - currentTick) * msPerTick;

  // ── Which clock are we speaking in? ───────────────────────────────────────
  // `null` means "trust the browser". A number is the player's own correction,
  // in minutes east of UTC.
  const [overrideMins, setOverrideMins] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [typedTime, setTypedTime] = useState("");

  const detectedMins = -new Date().getTimezoneOffset(); // getTimezoneOffset is inverted
  const zoneMins = overrideMins ?? detectedMins;
  const zoneName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  }, []);

  /** Format an instant in the chosen zone, as HH:MM on a 24-hour clock. */
  const localHhmm = (ms: number) => hhmm(ms, zoneMins);

  const nowMs = tickToMs(currentTick);

  // One option per LOCAL hour, each carrying the realm slot nearest to it and
  // the true local time that slot lands at. Rebuilt when the zone changes,
  // because changing the zone relabels every option.
  const choices = useMemo(
    () => dawnChoices({ currentTick, lastTickAtMs, turnMinutes, turnsPerDay, zoneMins }),
    [currentTick, lastTickAtMs, turnMinutes, turnsPerDay, zoneMins],
  );

  // Open on the hour it is now, which is almost always the hour they are awake.
  const nowHour = new Date(nowMs + zoneMins * 60_000).getUTCHours();
  const [picked, setPicked] = useState<number>(nowHour);
  const choice = choices.find((c) => c.hour === picked) ?? choices[0];

  // ── What the order will actually do ───────────────────────────────────────
  // Computed with the ENGINE's own scheduler (nextRecruitTick, mirrored below
  // via the same rules) so the hour promised here is the hour delivered. The
  // 24-hour floor means the first arrival can land a day later than the slot
  // suggests, and that is exactly what a player needs told before committing.
  const nextTick = nextRecruitTick(choice.offset, currentTick, lastRecruitAtTick);
  const hoursAway = ((nextTick - currentTick) * turnMinutes) / 60;
  const nextLocal = localHhmm(tickToMs(nextTick));
  const nextIsTomorrow =
    new Date(tickToMs(nextTick) + zoneMins * 60_000).getUTCDate() !==
    new Date(nowMs + zoneMins * 60_000).getUTCDate();

  // Every label below is derived from the READER's clock, which the server
  // cannot know: rendering them during SSR would print the host's timezone and
  // mismatch on hydration, on every page load. So the control only appears once
  // mounted, behind a placeholder of the same shape.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const zoneLabel =
    overrideMins === null
      ? zoneName
        ? `detected: ${zoneName}`
        : "detected from your browser"
      : "set by you";

  /** Take the player at their word about what time it is where they are. */
  const applyTypedTime = () => {
    // The browser's guess breaks the today/tomorrow tie — see localClock.ts.
    const mins = offsetFromStatedTime(typedTime, nowMs, detectedMins);
    if (mins === null) return;
    setOverrideMins(mins);
    setCorrecting(false);
  };

  if (!mounted) {
    return (
      <div className="dawn-set">
        <div className="dawn-clock">
          <span className="dawn-clock-label">Local Time</span>
          <b className="dawn-clock-now">--:--</b>
        </div>
      </div>
    );
  }

  return (
    <div className="dawn-set">
      <div className="dawn-clock">
        <span className="dawn-clock-label">Local Time</span>
        <b className="dawn-clock-now">{localHhmm(nowMs)}</b>
        <span className="dawn-clock-zone">({zoneLabel})</span>
        {!correcting ? (
          <button
            type="button"
            className="dawn-fixlink"
            onClick={() => {
              setTypedTime(localHhmm(nowMs));
              setCorrecting(true);
            }}
          >
            Not your time? Set it
          </button>
        ) : (
          <span className="dawn-fixrow">
            <label>
              It is actually{" "}
              <input
                type="time"
                value={typedTime}
                onChange={(e) => setTypedTime(e.target.value)}
                aria-label="The time it actually is where you are"
                className="dawn-timein"
              />{" "}
              here
            </label>
            <button type="button" className="btn dawn-mini" onClick={applyTypedTime}>
              Use this
            </button>
            <button
              type="button"
              className="dawn-fixlink"
              onClick={() => {
                setOverrideMins(null);
                setCorrecting(false);
              }}
            >
              Use my browser&apos;s
            </button>
          </span>
        )}
      </div>

      <label className="dawn-pick">
        Settlers arrive at{" "}
        <select
          value={picked}
          onChange={(e) => setPicked(Number(e.target.value))}
          aria-label="The local hour your settlers arrive"
          className="calc-select"
        >
          {choices.map((c) => (
            <option key={c.hour} value={c.hour}>
              {c.hhmm} Local Time
            </option>
          ))}
        </select>
        <Info tip="Every hour here is YOUR local time. Turns are ten minutes long and the realm's day starts wherever the world did, so the slot nearest the hour you pick may sit a few minutes either side of it — the exact time is shown before you confirm." />
      </label>

      <ConfirmDialog
        label="Set my dawn"
        buttonClassName="btn"
        title="🌅 Setting your dawn"
        settledKey={String(lastRecruitAtTick ?? "")}
        cmd={{ name: "setRecruitHour", path: "/", fields: { offset: String(choice.offset) } }}
        confirmLabel={`Set my dawn to ${choice.hhmm} — I understand`}
      >
        <p className="cdlg-lede">
          Your settlers will arrive at{" "}
          <b>
            {choice.hhmm} Local Time
          </b>{" "}
          every day, and at that hour from then on.
        </p>
        <div className="cdlg-note cdlg-note-bad">
          <b>⚠ This can only be set once for the whole age.</b> There is no undoing it and no second
          attempt — if the clock above is not really your local time, correct it first.
        </div>
        <table className="cdlg-table">
          <tbody>
            <tr>
              <td>Your local time right now</td>
              <td className="num">{localHhmm(nowMs)}</td>
            </tr>
            <tr>
              <td>Settlers will arrive at</td>
              <td className="num cdlg-good">{choice.hhmm} Local Time</td>
            </tr>
            <tr>
              <td>Your next recruitment</td>
              <td className="num">
                in {hoursAway.toFixed(1)} hours — {nextLocal}
                {nextIsTomorrow ? " tomorrow" : " today"}
              </td>
            </tr>
          </tbody>
        </table>
        {hoursAway > 24 && (
          <p className="cdlg-warn" style={{ fontSize: 13.5 }}>
            That first arrival is more than a day out because a <b>full day must pass between
            payouts</b> — moving your dawn can only ever delay the next one, never bring it forward.
            Every arrival after it lands at {choice.hhmm}.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
