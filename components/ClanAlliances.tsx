import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { areAllied, type Clan } from "@/lib/engine";
import type { World } from "@/lib/server/store";

/**
 * Who this banner stands WITH — offered, sealed, and ended.
 *
 * It lives on the war page beside the enemies list on purpose: an alliance and a
 * war are the same decision pointed in opposite directions, and both are the
 * Leader's or the Vice's alone (never an officer's — see isHighLeadership).
 *
 * The one thing to be honest about in the copy: an alliance does not stop your
 * members attacking theirs. It makes doing so treachery — the pact tears up on
 * both sides and the world chronicle records who did it. Players who expect a
 * pact to be a wall will otherwise discover the truth the expensive way.
 */
export function ClanAlliances({
  world,
  clan,
  canLead,
  path,
}: {
  world: World;
  clan: Clan;
  /** Leader or Vice only. */
  canLead: boolean;
  path: string;
}) {
  const allies = (clan.friendly ?? [])
    .map((id) => world.clans[id])
    .filter((c): c is Clan => Boolean(c) && areAllied(clan, c));

  const offersIn = (clan.allianceOffers ?? [])
    .map((o) => ({ offer: o, from: world.clans[o.fromClanId] }))
    .filter((x): x is { offer: typeof x.offer; from: Clan } => Boolean(x.from));

  // Clans we have already written to, so the button can say so rather than
  // bounce with "your offer already stands".
  const offeredOut = Object.values(world.clans).filter((c) =>
    (c.allianceOffers ?? []).some((o) => o.fromClanId === clan.id),
  );

  const atWarWith = new Set(clan.wars.map((w) => w.clanId));
  const candidates = Object.values(world.clans).filter(
    (c) =>
      c.id !== clan.id &&
      !atWarWith.has(c.id) &&
      !allies.some((a) => a.id === c.id) &&
      !offeredOut.some((o) => o.id === c.id),
  );

  return (
    <div className="ally-panel">
      <p className="ally-note">
        An alliance is a <b>promise, not a wall</b>. Your members can still march on theirs — but
        doing it <b>breaks the pact on both sides at once</b> and the treachery is written into the
        world chronicle by name, for the rest of the age. Only the <b>Leader or the Vice</b> may
        offer, accept or end one.
      </p>

      {allies.length > 0 ? (
        <ul className="ally-list">
          {allies.map((a) => (
            <li key={a.id}>
              <span className="ally-name">🤝 {a.name}</span>
              <span className="ally-meta">{a.members.length} members</span>
              {canLead && (
                <CmdForm name="clanAllyEnd" path={path}>
                  <input type="hidden" name="clanId" value={a.id} />
                  <ReqTip
                    heading={`End the alliance with ${a.name}`}
                    body="A clean parting: both banners drop the pact and nobody is branded a traitor. Do this BEFORE you fight them — attacking an ally is treachery and goes in the chronicle."
                    note="Either side's Leader or Vice may end an alliance at any time, with no cooldown."
                  >
                    <Btn className="btn btn-no is-small">End alliance</Btn>
                  </ReqTip>
                </CmdForm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ally-empty">This banner stands alone — no alliances.</p>
      )}

      {offersIn.length > 0 && (
        <div className="ally-block">
          <h4>Offers awaiting your answer</h4>
          <ul className="ally-list">
            {offersIn.map(({ offer, from }) => (
              <li key={from.id}>
                <span className="ally-name">✉ {from.name}</span>
                <span className="ally-meta">{from.members.length} members</span>
                {canLead ? (
                  <>
                    <CmdForm name="clanAllyAccept" path={path}>
                      <input type="hidden" name="clanId" value={from.id} />
                      <Btn className="btn is-small">Accept</Btn>
                    </CmdForm>
                    <CmdForm name="clanAllyDecline" path={path}>
                      <input type="hidden" name="clanId" value={from.id} />
                      <Btn className="btn btn-no is-small">Decline</Btn>
                    </CmdForm>
                  </>
                ) : (
                  <span className="ally-meta">your leadership must answer this</span>
                )}
                <span className="ally-meta">offered turn {offer.atTick.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {offeredOut.length > 0 && (
        <div className="ally-block">
          <h4>Your standing offers</h4>
          <ul className="ally-list">
            {offeredOut.map((c) => (
              <li key={c.id}>
                <span className="ally-name">✉ {c.name}</span>
                <span className="ally-meta">awaiting their leadership</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canLead && candidates.length > 0 && (
        <div className="ally-block">
          <h4>Offer an alliance</h4>
          <CmdForm name="clanAllyOffer" path={path}>
            <select name="clanId" aria-label="Clan to offer an alliance" className="calc-select">
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.members.length})
                </option>
              ))}
            </select>
            <ReqTip
              heading="Offer an alliance"
              body="Their Leader or Vice must accept before it takes effect. If they have already offered YOU, this seals it on the spot."
              note="You cannot ally with a clan you are at war with — make peace first."
            >
              <Btn className="btn">Send offer</Btn>
            </ReqTip>
          </CmdForm>
        </div>
      )}
    </div>
  );
}
