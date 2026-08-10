import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { CommsTabs } from "@/components/CommsTabs";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { TextInput } from "@/components/TextInput";
import { dmChannel } from "@/lib/server/store";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// LETTERS ONLY. Era chat moved to its own page and clan talk has always lived
// in the clan, so this room does one thing: a private, permanent thread with
// one other ruler. Mixing all three under tabs meant the nav could not say
// which you were in, and "Messages" named none of them.
export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; with?: string }>;
}) {
  const { err, ok, with: dmWith } = await searchParams;
  const { world, player: p } = await getGame();

  const others = Object.values(world.players)
    .filter((t) => t.id !== p.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const partner = dmWith ? world.players[dmWith] : undefined;
  const channel = partner ? dmChannel(p.id, partner.id) : "";
  const messages = channel ? world.messages.filter((m) => m.channel === channel).slice(-60) : [];

  return (
    <>
      <Flash err={err} ok={ok} />
      <CommsTabs />
      <Panel
        title="Letters"
        info="Private and permanent — a letter is between the two of you, and it is not wiped when the age ends."
      >
        <form className="comms-pick">
          <label htmlFor="with" className="comms-pick-label">
            Correspondent
          </label>
          <select id="with" name="with" defaultValue={dmWith ?? ""} aria-label="Correspondent">
            <option value="">— choose a ruler —</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ReqTip heading="Open letters" body="Open your private, permanent thread with the chosen ruler.">
            <Btn className="btn">Open</Btn>
          </ReqTip>
        </form>

        {!partner ? (
          <p className="comms-empty">
            Choose a ruler above to read and write your letters with them.
          </p>
        ) : (
          <>
            <p className="comms-with">
              Letters with <b>{partner.name}</b>
            </p>
            <div className="comms-log">
              {messages.length === 0 ? (
                <i>No letters yet. Write the first.</i>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="comms-line">
                    <b style={{ color: m.authorId === p.id ? "var(--warn)" : "#5a3b1c" }}>{m.authorName}</b>
                    <span className="comms-when"> · turn {m.tick}</span>
                    <div>{m.body}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <CmdForm name="chat" path={`/messages?with=${partner.id}`}>
                <input type="hidden" name="channel" value={`dm:${partner.id}`} />
                <TextInput name="body" ariaLabel="Letter" placeholder="Write…" maxLength={800} />
                <ReqTip
                  heading={`Write to ${partner.name}`}
                  body="Only the two of you can read this thread."
                  note="Letters are kept — they are not wiped when the era ends."
                >
                  <Btn className="btn">Send</Btn>
                </ReqTip>
              </CmdForm>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
