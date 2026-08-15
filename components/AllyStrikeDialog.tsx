"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ATTACK_MODE_INFO } from "@/lib/constants";
import { modeBlocked, type AttackMode, type TargetState } from "@/lib/constants/attackGating";

/**
 * Striking an ALLY.
 *
 * The alliance never stops the blow — a pact you physically cannot break is a
 * cage, not a promise. What it does is make the blow public and irreversible, so
 * the one thing this must not be is a normal-looking button. The pipeline
 * refuses the strike outright unless it carries `breakAlliance=1`, and the only
 * place that flag comes from is the confirmation below.
 *
 * A separate component from the ordinary console because the mode has to be
 * chosen BEFORE the warning is worded — "raid your ally" and "bombard your
 * ally" are different sentences, and the dialog quotes the one being ordered.
 */
export function AllyStrikeDialog({
  target,
  allyClanName,
  state,
  path,
}: {
  target: { id: string; name: string };
  allyClanName: string;
  state: TargetState;
  path: string;
}) {
  const MODES: AttackMode[] = ["raid", "siege", "revenge", "bombard"];
  const pickable = MODES.filter((m) => {
    // `sameClan`/`isSelf` never reach here, so the only blockers left are the
    // ordinary ones — a shield, a missing revenge window.
    const why = modeBlocked(m, { ...state, sameClan: false, isSelf: false });
    return why === null;
  });
  const [mode, setMode] = useState<AttackMode>(pickable[0] ?? "raid");

  if (pickable.length === 0) {
    return <span className="act-hint">Nothing may be launched at them right now.</span>;
  }

  const label = (m: AttackMode) => (m === "siege" ? "Castle" : m[0].toUpperCase() + m.slice(1));

  return (
    <div className="ally-strike">
      <div className="ally-strike-warn">
        🤝 <b>{target.name}</b> flies the banner of <b>{allyClanName}</b> — your ally.
      </div>
      <label className="ally-strike-pick">
        Order{" "}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AttackMode)}
          aria-label={`Attack mode against your ally ${target.name}`}
          className="act-select"
        >
          {pickable.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
      </label>

      <ConfirmDialog
        label="⚠ Break the alliance and strike"
        buttonClassName="btn btn-no act-go"
        title="🗡 This is treachery"
        settledKey={`${target.id}:${mode}`}
        cmd={{
          name: "attack",
          path,
          // The flag the pipeline demands. Nothing else in the app sets it.
          fields: { targetId: target.id, mode, breakAlliance: "1" },
        }}
        confirmLabel={`Strike ${target.name} anyway`}
        cancelLabel="Keep the alliance"
      >
        <p className="cdlg-lede">
          You are about to order a <b>{label(mode)}</b> against <b>{target.name}</b> of{" "}
          <b>{allyClanName}</b> — a clan your own banner is <b>allied</b> with.
        </p>
        <div className="cdlg-note cdlg-note-bad">
          <b>⚠ The alliance will be broken immediately</b>, on both sides, the moment the blow lands.
          Neither leadership gets a say and it does not come back on its own — it has to be offered
          and accepted again from nothing.
        </div>
        <ul className="cdlg-list">
          <li>
            <b>The whole world will be told.</b> The treachery is written into the world chronicle by
            name — yours, your clan&apos;s, and theirs — and it stays there for the rest of the age.
          </li>
          <li>
            Every member of both clans gets word of it in their inbox.
          </li>
          <li>
            {ATTACK_MODE_INFO[mode].tip}
          </li>
          <li>
            If you meant to leave the pact cleanly instead, your Leader or Vice can{" "}
            <b>end the alliance</b> from the clan page — no treachery, no chronicle entry.
          </li>
        </ul>
      </ConfirmDialog>
    </div>
  );
}
