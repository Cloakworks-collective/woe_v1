"use client";

import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * The vacation button, with the briefing that has to be read before it fires.
 *
 * Both directions are decisions people regret, and for opposite reasons.
 * Departing quietly costs four fifths of your production and — if your beds are
 * full — every settler who would have arrived while you slept, none of which is
 * visible on the button. Returning quietly can drop you into the world with no
 * shield at all, which is the one outcome a player would never choose on
 * purpose. So neither happens on a single click.
 *
 * Cancelling a QUEUED departure is exempt — nothing has happened yet and
 * nothing is lost, so it stays a plain button.
 */
export function VacationGate({
  onVacation,
  queued,
  budgetSpent,
  daysLeft,
  daysPerEra,
  // Departure briefing
  taxPct,
  productionPct,
  researchPct,
  settlersPerDay,
  vacantBeds,
  foodNetPerTurn,
  foodStock,
  reattackHours,
  // Return briefing
  awayHours,
  shieldMinHours,
  shieldHours,
}: {
  onVacation: boolean;
  queued: boolean;
  budgetSpent: boolean;
  daysLeft: number;
  daysPerEra: number;
  /** What each dial keeps while away, as a whole percent (50 = half). */
  taxPct: number;
  productionPct: number;
  researchPct: number;
  settlersPerDay: number;
  vacantBeds: number;
  /** Food per turn at VACATION rates, upkeep already deducted. */
  foodNetPerTurn: number;
  foodStock: number;
  reattackHours: number;
  /** How long this absence has run. Only meaningful while away. */
  awayHours: number;
  shieldMinHours: number;
  shieldHours: number;
}) {
  // A queued departure has not happened yet — cancelling it needs no briefing.
  if (queued) {
    return (
      <CmdForm name="vacation" path="/">
        <input type="hidden" name="away" value="" />
        <Btn className="btn btn-brass">Cancel queued vacation</Btn>
      </CmdForm>
    );
  }

  const label = onVacation ? "Return to the world" : "🏖 Go on vacation";
  const disabled = !onVacation && budgetSpent;

  // How many days of settlers your empty beds can actually absorb. Once they
  // are full the intake stops — not because you are away, but because there is
  // nowhere to put anybody, and a sleeping ruler is the one who cannot notice.
  const daysOfBeds = settlersPerDay > 0 ? vacantBeds / settlersPerDay : Infinity;
  const bedsShort = daysOfBeds < Math.min(daysLeft, 7);
  const turnsOfFood = foodNetPerTurn < 0 ? foodStock / -foodNetPerTurn : Infinity;
  const foodShort = turnsOfFood < 144 * Math.min(daysLeft, 7); // 144 turns to a day
  const shielded = awayHours >= shieldMinHours;
  const waitHours = Math.max(0, shieldMinHours - awayHours);

  return (
    <ConfirmDialog
      label={label}
      buttonClassName="btn btn-brass"
      disabled={disabled}
      title={onVacation ? "🏰 Coming home" : "🏖 Before you go"}
      settledKey={`${onVacation}:${queued}`}
      cmd={{ name: "vacation", path: "/", fields: { away: onVacation ? "" : "1" } }}
      confirmLabel={
        onVacation
          ? shielded
            ? `Return under the ${shieldHours}-hour shield`
            : "Return unprotected — I understand"
          : "Depart — I understand the cost"
      }
    >
      {onVacation ? (
        <>
          <p className="cdlg-lede">
            You have been away <b>{awayHours.toFixed(1)} hours</b>.
          </p>
          {shielded ? (
            <div className="cdlg-note cdlg-note-good">
              <b>✔ You return under a {shieldHours}-hour shield.</b> Nobody may march on you,
              spy on you or scout you while it holds. Use it: bank your gold and goods, mend
              your walls, and put peasants back to work before it lifts.
            </div>
          ) : (
            <div className="cdlg-note cdlg-note-bad">
              <b>⚠ You will return with NO protection.</b> The shield needs an absence of at
              least {shieldMinHours} hours and yours has run {awayHours.toFixed(1)}. Return now
              and you are a target from this moment — raids, sieges and spies all reach you.
              Stay away <b>{waitHours.toFixed(1)} hours more</b> to earn the {shieldHours}-hour
              shield.
            </div>
          )}
          <ul className="cdlg-list">
            <li>
              Your own sword arm stays tied for <b>{reattackHours} hours</b> — no fresh attacks
              while the host musters. Revenge is exempt.
            </li>
            <li>
              Tax, production and research all return to full at once, on the next turn.
            </li>
            <li>
              Days spent do not come back: you have <b>{daysLeft.toFixed(1)}</b> of{" "}
              {daysPerEra} vacation-days left this age, and returning stops the meter.
            </li>
          </ul>
        </>
      ) : (
        <>
          <p className="cdlg-lede">
            You step out of the age entirely. <b>Nothing reaches you</b> — no raid, no siege,
            no bombard, no rangers, no spies, and not even a revenge, because nobody may
            depart while owing one (your departure queues until the last window closes). Your
            storehouses cannot be read and cannot be robbed while you are gone. The price is
            your economy.
          </p>
          <table className="cdlg-table">
            <tbody>
              <tr>
                <td>Tax income</td>
                <td className="num">{taxPct}% of normal</td>
              </tr>
              <tr>
                <td>Resource production</td>
                <td className="num cdlg-bad">{productionPct}% of normal</td>
              </tr>
              <tr>
                <td>Research points</td>
                <td className="num">{researchPct}% of normal</td>
              </tr>
              <tr>
                <td>Settler recruitment</td>
                <td className="num cdlg-good">unchanged — full rate</td>
              </tr>
            </tbody>
          </table>
          <ul className="cdlg-list">
            <li>
              <b>Your scholars keep working.</b> Research runs the whole time you are away, at{" "}
              {researchPct}% — <b>as long as there is food on the table</b>. A starving empire
              studies nothing, away or not, so leave the granary stocked.
            </li>
            <li>
              <b>Settlers keep arriving at the full rate</b> — vacation does not slow
              recruitment at all. But they only arrive if there is <b>a bed standing empty</b>,
              and nobody is home to build more.{" "}
              {bedsShort ? (
                <span className="cdlg-warn">
                  You have <b>{vacantBeds.toLocaleString("en-US")} empty beds</b> and take
                  about {settlersPerDay.toLocaleString("en-US")} settlers a day — roughly{" "}
                  <b>{daysOfBeds.toFixed(1)} days</b> before your town is full and every
                  further settler is turned away. Raise more Hearthsteads before you go.
                </span>
              ) : (
                <span>
                  You have {vacantBeds.toLocaleString("en-US")} empty beds against about{" "}
                  {settlersPerDay.toLocaleString("en-US")} settlers a day —{" "}
                  {daysOfBeds === Infinity ? "room to spare" : `about ${daysOfBeds.toFixed(1)} days of room`}. More
                  Hearthsteads means more of the absence spent growing.
                </span>
              )}
            </li>
            {foodShort && (
              <li className="cdlg-warn">
                <b>Your granary will not last.</b> At vacation rates you are losing food every
                turn and have about {Math.floor(turnsOfFood / 144)} day
                {Math.floor(turnsOfFood / 144) === 1 ? "" : "s"} of it left. Starve and
                everything stops — production, research and stamina alike. Move farmers onto
                the fields or buy grain before you leave.
              </li>
            )}
            <li>
              <b>You cannot attack</b> while away, and your standing at the top of the ladder
              keeps slipping as others build.
            </li>
            <li>
              You may spend <b>{daysLeft.toFixed(1)}</b> more of your {daysPerEra}{" "}
              vacation-days this age. When the budget runs dry you are returned to the world
              whether you like it or not.
            </li>
            <li>
              Coming back: an absence of <b>{shieldMinHours} hours or more</b> earns a{" "}
              {shieldHours}-hour shield on your return. A shorter hop earns nothing. Either
              way your own attacks are locked for {reattackHours} hours afterwards.
            </li>
          </ul>
        </>
      )}
    </ConfirmDialog>
  );
}
