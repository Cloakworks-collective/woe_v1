import Link from "next/link";
import { LearnLink } from "@/components/LearnLink";
import { ticksAgo } from "@/lib/engine";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { CommsTabs } from "@/components/CommsTabs";
import { Correspondents, type Correspondent } from "@/components/Correspondents";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { TextArea } from "@/components/TextArea";
import { RACE_NAMES } from "@/lib/constants";
import { dmChannel, type ForumMessage } from "@/lib/server/store";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// LETTERS ONLY. World chat lives on its own page and clan talk has always lived
// in the clan, so this room does one thing: private, permanent threads with
// other rulers, one thread per pair.
//
// The room is a mailbox, not a form. It opens on the list of conversations you
// already have — newest reply first — with the whole roster underneath for
// starting a new one. Picking a correspondent out of a <select> was the old
// shape, and it could not answer the only question you actually arrive with:
// who has written to me?
export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; with?: string }>;
}) {
  const { err, ok, with: dmWith } = await searchParams;
  const { world, player: p } = await getGame();
  const tick = world.meta.tickNumber;

  // Which channel belongs to which ruler. Built from the roster rather than by
  // splitting the channel string, so nothing here depends on the shape of an
  // empire id.
  const partnerOf = new Map<string, string>();
  const others = Object.values(world.players).filter((t) => t.id !== p.id);
  for (const t of others) partnerOf.set(dmChannel(p.id, t.id), t.id);

  const lastOf = new Map<string, ForumMessage>();
  for (const m of world.messages) {
    const other = partnerOf.get(m.channel);
    if (!other) continue;
    lastOf.set(other, m); // world.messages is in postal order — the last wins
  }

  // Threads first, newest reply at the top; everyone you have never written to
  // falls in behind them alphabetically.
  const sorted = [...others].sort((a, b) => {
    const at = lastOf.get(a.id)?.tick ?? -1;
    const bt = lastOf.get(b.id)?.tick ?? -1;
    return bt !== at ? bt - at : a.name.localeCompare(b.name);
  });
  const entries: Correspondent[] = sorted.map((t) => {
    const last = lastOf.get(t.id);
    const clan = t.clanId ? world.clans[t.clanId] : undefined;
    return {
      id: t.id,
      name: t.name,
      race: t.race,
      raceName: RACE_NAMES[t.race],
      clanName: clan?.name,
      last: last
        ? {
            body: last.body.replace(/\s+/g, " ").slice(0, 90),
            when: ticksAgo(last.tick, tick),
            mine: last.authorId === p.id,
          }
        : undefined,
    };
  });

  const partner = dmWith ? world.players[dmWith] : undefined;
  const channel = partner && partner.id !== p.id ? dmChannel(p.id, partner.id) : "";
  const messages = channel ? world.messages.filter((m) => m.channel === channel).slice(-60) : [];
  const openThreads = entries.filter((e) => e.last).length;

  return (
    <>
      <LearnLink href="/guide#heralds">Letters, halls &amp; the forum</LearnLink>
      <Flash err={err} ok={ok} />
      <CommsTabs />
      <Panel
        title="Letters"
        info="Private and permanent — a letter is between the two of you, and it is not wiped when the age ends."
      >
        <div className="dm-room">
          <Correspondents entries={entries} activeId={partner?.id} />

          <section className="dm-thread">
            {!partner ? (
              <p className="comms-empty">
                {openThreads > 0
                  ? "Pick a correspondent on the left to read the thread and reply."
                  : "No letters yet. Pick a ruler on the left and write the first."}
              </p>
            ) : (
              <>
                <p className="comms-with">
                  Letters with{" "}
                  <b>
                    <Link href={`/empire/${partner.id}`}>{partner.name}</Link>
                  </b>{" "}
                  <span className="comms-when">
                    · {RACE_NAMES[partner.race]}
                    {messages.length > 0 ? ` · ${messages.length} in the thread` : ""}
                  </span>
                </p>
                <div className="comms-log">
                  {messages.length === 0 ? (
                    <i>No letters yet. Write the first.</i>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="comms-line">
                        <b style={{ color: m.authorId === p.id ? "var(--warn)" : "#5a3b1c" }}>
                          {m.authorName}
                        </b>
                        <span
                          className="comms-when"
                          title={`turn ${m.tick.toLocaleString("en-US")}`}
                        >
                          {" · "}
                          {ticksAgo(m.tick, tick)}
                        </span>
                        <div className="comms-body">{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
                <CmdForm
                  name="chat"
                  path={`/messages?with=${partner.id}`}
                  inline={false}
                  className="comms-form"
                >
                  <input type="hidden" name="channel" value={`dm:${partner.id}`} />
                  <TextArea
                    name="body"
                    ariaLabel={`Letter to ${partner.name}`}
                    placeholder={`Write to ${partner.name}…`}
                    maxLength={800}
                    rows={5}
                  />
                  <ReqTip
                    heading={`Write to ${partner.name}`}
                    body="Only the two of you can read this thread."
                    note="Letters are kept — they are not wiped when the era ends."
                  >
                    <Btn className="btn">Send</Btn>
                  </ReqTip>
                </CmdForm>
              </>
            )}
          </section>
        </div>
      </Panel>
    </>
  );
}
