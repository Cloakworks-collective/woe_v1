import Link from "next/link";
import { EXAM, EXAM_PASS_MARK, EXAM_REWARD } from "@/lib/constants";
import { examSealed, examState, sittingFinished, type Player } from "@/lib/engine";
import { ResIcon } from "./ResIcon";

/**
 * The Collegium's standing offer, on the Command View directly beneath the
 * Regent's First Charges.
 *
 * Deliberately NOT part of the Charges. The Charges are a course of actions
 * that build an empire; this is a course of reading that explains one, and
 * folding it into the checklist would have made "go and learn the rules" look
 * like one more errand between raising a Grange and hiring farmers.
 *
 * It sits below them because that is the order of need: a new regent wants to
 * be told what to press first, and only then why. It vanishes for the age the
 * moment the examination is passed — a tutorial that lingers after you have
 * done it is clutter.
 */
export function CollegiumCall({ player }: { player: Player }) {
  if (examSealed(player)) return null;

  const state = examState(player);
  const started = state.answered > 0;
  const marked = sittingFinished(player);

  return (
    <section className="panel collegium" id="collegium-call">
      <h3>
        🎓 The Collegium Examination
        {started && !marked && (
          <span className="charges-count">
            {state.answered} / {EXAM.length} answered
          </span>
        )}
        {marked && <span className="charges-count">missed the mark — sit it again</span>}
      </h3>
      <div className="body">
        <p className="collegium-lede">
          {marked ? (
            <>
              You scored <b>{state.correct}</b> of {EXAM.length} and needed{" "}
              <b>{EXAM_PASS_MARK}</b>. Nothing is lost — you have just read {EXAM.length}{" "}
              explanations, and you may sit it again as often as you like.
            </>
          ) : started ? (
            <>
              Your paper is half-written. Every answer is explained the moment you give it, so a
              wrong one teaches you as much as a right one.
            </>
          ) : (
            <>
              <b>{EXAM.length} questions</b> on how the realm actually works — production, housing,
              the ladder, the four ways to attack, siege duels, growth, the shadows and the markets.{" "}
              <b>Every answer is explained the moment you give it</b>, so it teaches rather than
              tests. Reach <b>{EXAM_PASS_MARK} of {EXAM.length}</b> and the Collegium endows your
              treasury.
            </>
          )}
        </p>

        <div className="collegium-row">
          <p className="collegium-purse">
            <span>
              <ResIcon kind="gold" size={17} /> {EXAM_REWARD.gold.toLocaleString("en-US")}
            </span>
            {(["food", "wood", "stone", "ore"] as const).map((r) => (
              <span key={r}>
                <ResIcon kind={r} size={17} /> {EXAM_REWARD.resources.toLocaleString("en-US")}
              </span>
            ))}
          </p>
          <Link className="btn collegium-go" href="/exam">
            {marked ? "Sit it again →" : started ? "Continue the examination →" : "Sit the examination →"}
          </Link>
        </div>

        <p className="collegium-foot">
          Offered once an age, and gone for good once you pass it. Everything it asks is in the{" "}
          <Link href="/guide">Field Manual</Link>.
        </p>
      </div>
    </section>
  );
}
