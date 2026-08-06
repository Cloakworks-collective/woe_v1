// The gate of the clan: petitions awaiting an answer, and the invitation list.
// Only the Leader and Vice-Leader see this — Officers may kick, but not admit.

import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { memberCap, type Clan } from "@/lib/engine";
import type { World } from "@/lib/server/store";

export function ClanPetitions({ world, clan, path = "/clan" }: { world: World; clan: Clan; path?: string }) {
  const requests = clan.joinRequests ?? [];
  const invites = clan.invites ?? [];
  const full = clan.members.length >= memberCap(clan);

  // Anyone bannerless is invitable — minus those already holding an invitation.
  const invitable = Object.values(world.players)
    .filter((t) => !t.clanId && !invites.some((i) => i.playerId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="clan-gate">
      <h4 className="clan-gate-head">⏳ Petitions ({requests.length})</h4>
      {requests.length === 0 ? (
        <p className="panel-lede">No one waits at your gate.</p>
      ) : (
        <table className="tbl">
          <tbody>
            {requests.map((r) => {
              const t = world.players[r.playerId];
              return (
                <tr key={r.playerId}>
                  <td>
                    <b>{t?.name ?? "an unknown empire"}</b>
                    <span style={{ color: "var(--ink-soft)" }}> · petitioned turn {r.atTick}</span>
                  </td>
                  <td>
                    <CmdForm name="clanAnswerRequest" path={path}>
                      <input type="hidden" name="targetId" value={r.playerId} />
                      <input type="hidden" name="accept" value="1" />
                      <ReqTip
                        heading={`Admit ${t?.name ?? "them"}`}
                        body="Let this petitioner march under your banner. They share the pool and fight your wars."
                        disabledReason={full ? "Your Hall is full — raise it before admitting more." : undefined}
                      >
                        <Btn className="btn">✓ Admit</Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                  <td>
                    <CmdForm name="clanAnswerRequest" path={path}>
                      <input type="hidden" name="targetId" value={r.playerId} />
                      <input type="hidden" name="accept" value="0" />
                      <ReqTip
                        heading={`Refuse ${t?.name ?? "them"}`}
                        body="Turn this petitioner away."
                        note="This is final — they can never petition your banner again. Only an invitation from you or your Vice could bring them in later."
                      >
                        <Btn className="btn">✕ Refuse</Btn>
                      </ReqTip>
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h4 className="clan-gate-head">✉ Invitations ({invites.length} standing)</h4>
      {invites.length > 0 && (
        <p className="panel-lede">
          {invites
            .map((i) => world.players[i.playerId]?.name ?? "an unknown empire")
            .join(", ")}{" "}
          — awaiting their answer.
        </p>
      )}
      {invitable.length === 0 ? (
        <p className="panel-lede">Every empire already flies a banner.</p>
      ) : (
        <CmdForm name="clanInvite" path={path}>
          <select name="targetId" aria-label="Empire to invite" style={{ font: "14.5px Verdana", padding: 3 }}>
            {invitable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ReqTip
            heading="Invite an empire"
            body="Ask a bannerless empire to join you. They can accept it whenever they like — no petition needed."
            note="An invitation also lifts an earlier refusal, if you have changed your mind about them."
            disabledReason={full ? "Your Hall is full — raise it before inviting more." : undefined}
          >
            <Btn className="btn">Invite</Btn>
          </ReqTip>
        </CmdForm>
      )}
    </div>
  );
}
