import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Panel } from "@/components/Panel";
import { WORK_QUEUE_CAP } from "@/lib/constants";

/**
 * The Steward's build and research queues, rendered where the work is CHOSEN.
 *
 * They used to live only on /steward — so the one page that showed you what was
 * queued was a page away from the forty-odd things you might queue instead, and
 * the Buildings page could only tell you a count. Both pages now carry the real
 * list, in order, with a way to drop an entry.
 *
 * One component for both because they are the same object: an ordered short
 * list of intents, each with a label, a subtitle, and an ✕.
 */

export type QueueRow = {
  /** What is queued, e.g. "Ironhold → level 4". */
  label: string;
  /** The price or the caveat, shown quietly beside it. */
  detail?: React.ReactNode;
  /** Already satisfied by hand in the meantime — the Steward will drop it. */
  done?: boolean;
};

export function WorkQueue({
  title,
  rows,
  cancelCmd,
  path,
  empty,
  premium,
  upsell,
}: {
  title: string;
  rows: QueueRow[];
  /** The pipeline command that removes entry `index`. */
  cancelCmd: string;
  /** Where to return after a cancel — keeps you on the page you were reading. */
  path: string;
  empty: React.ReactNode;
  premium: boolean;
  upsell: React.ReactNode;
}) {
  return (
    <Panel
      title={`${title} — ${rows.length}/${WORK_QUEUE_CAP}`}
      info="The Steward works this list every turn, in order, raising or studying the head entry the moment it becomes affordable — including while you are asleep. Entries you complete by hand are dropped silently."
      guide="/guide#charter"
    >
      {!premium ? (
        <p className="wq-upsell">{upsell}</p>
      ) : rows.length === 0 ? (
        <p className="wq-empty">{empty}</p>
      ) : (
        <ol className="wq-list">
          {rows.map((r, i) => (
            <li className={`wq-row${r.done ? " is-done" : ""}`} key={`${r.label}-${i}`}>
              <span className="wq-pos">{i + 1}</span>
              <span className="wq-body">
                <b className="wq-label">{r.label}</b>
                {r.detail != null && <span className="wq-detail">{r.detail}</span>}
              </span>
              <CmdForm name={cancelCmd} path={path}>
                <input type="hidden" name="index" value={i} />
                <ReqTip
                  heading="Remove from the queue"
                  body="Drop this entry. It will not be raised or studied, and everything behind it moves up a place."
                >
                  <Btn className="btn wq-x" aria-label={`Remove ${r.label} from the queue`}>
                    ✕
                  </Btn>
                </ReqTip>
              </CmdForm>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
