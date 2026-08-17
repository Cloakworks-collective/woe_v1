import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { EXAM, EXAM_PASS_MARK, EXAM_REWARD } from "@/lib/constants";
import { currentQuestionIndex, examSealed, examState, sittingFinished } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const metadata = { title: "The Exam" };

export const dynamic = "force-dynamic";

/**
 * The Collegium Examination.
 *
 * One question at a time, and the answer is revealed the moment it is given —
 * this teaches rather than tests, so the explanation is the point and the mark
 * is only the gate on the endowment.
 *
 * THE ANSWER TO AN UNANSWERED QUESTION NEVER REACHES THE BROWSER. The page
 * renders the prompt and the options; the correct index and the explanation are
 * only read out of EXAM for questions the SERVER has already recorded a reply
 * to. Sending the whole bank down and hiding it with CSS would make "read the
 * manual" mean "read the page source".
 */
export default async function ExamPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { player } = await getGame();

  // Sealed for the age — there is nothing here any more.
  if (examSealed(player)) redirect("/");

  const state = examState(player);
  const index = currentQuestionIndex(player);
  const finished = sittingFinished(player);
  const passed = finished && state.correct >= EXAM_PASS_MARK;

  // The question just answered, if any — this is the reveal.
  const lastIndex = state.answered - 1;
  const last = lastIndex >= 0 ? EXAM[lastIndex] : undefined;
  const lastGiven = lastIndex >= 0 ? state.given[lastIndex] : undefined;
  const lastRight = last && lastGiven === last.answer;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide">The Field Manual — everything this asks about</LearnLink>

      {finished ? (
        <Panel title={passed ? "🎓 The Collegium seals your examination" : "📕 The paper is marked"}>
          <p className="exam-score">
            <b>{state.correct}</b> of {EXAM.length}
            <span className="exam-score-mark"> · {EXAM_PASS_MARK} needed</span>
          </p>
          {passed ? (
            <>
              <p style={{ fontSize: 14.5 }}>
                The scholars are satisfied. Your endowment has been paid into the treasury:
              </p>
              <p className="exam-reward">
                <span>
                  <ResIcon kind="gold" size={18} /> {EXAM_REWARD.gold.toLocaleString("en-US")}
                </span>
                {(["food", "wood", "stone", "ore"] as const).map((r) => (
                  <span key={r}>
                    <ResIcon kind={r} size={18} /> {EXAM_REWARD.resources.toLocaleString("en-US")}
                  </span>
                ))}
              </p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                Sat once an age, and never again this one. Back to{" "}
                <Link href="/">your seat of power</Link>.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14.5 }}>
                Short of the mark — but you have just read {EXAM.length} explanations, which is the
                whole point of the thing. Sit it again whenever you like: there is no cooldown, no
                cost, and the endowment is still waiting.
              </p>
              <CmdForm name="examRetake" path="/exam">
                <Btn className="btn">Sit the examination again</Btn>
              </CmdForm>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>
                Attempt {state.attempts}. Or go and read the{" "}
                <Link href="/guide">Field Manual</Link> first — every question came out of it.
              </p>
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title="🎓 The Collegium Examination"
          info={`Twenty-five questions on how the realm actually works. Every answer is explained the moment you give it, right or wrong — this is a lesson, not a trial. Reach ${EXAM_PASS_MARK} of ${EXAM.length} and the Collegium endows your treasury. Miss it and you may sit it again as often as you like.`}
        >
          {index === 0 && (
            <p style={{ fontSize: 14.5, marginTop: 0 }}>
              Twenty-five questions on how the realm actually works — production, housing, the
              ladder, the four ways to attack, siege duels, growth, the shadows and the markets.{" "}
              <b>Every answer is explained the moment you give it</b>, so a wrong one teaches you as
              much as a right one. Reach <b>{EXAM_PASS_MARK} of {EXAM.length}</b> and the Collegium
              endows your treasury with{" "}
              <b>{EXAM_REWARD.gold.toLocaleString("en-US")} gold</b> and{" "}
              <b>{EXAM_REWARD.resources.toLocaleString("en-US")}</b> of every resource.
            </p>
          )}

          <div className="exam-progress" aria-hidden>
            <i style={{ width: `${(state.answered / EXAM.length) * 100}%` }} />
          </div>
          <p className="exam-count">
            Question <b>{(index ?? 0) + 1}</b> of {EXAM.length}
            {state.answered > 0 && <> · {state.correct} right so far</>}
            {state.attempts > 1 && <> · attempt {state.attempts}</>}
          </p>

          {/* The reveal for the question they just answered. */}
          {last && (
            <div className={lastRight ? "exam-reveal is-right" : "exam-reveal is-wrong"}>
              <div className="exam-verdict">
                {lastRight ? "✓ Correct" : "✗ Not quite"}
                <span className="exam-verdict-q"> — {last.prompt}</span>
              </div>
              {!lastRight && (
                <p className="exam-answer">
                  The answer: <b>{last.options[last.answer]}</b>
                </p>
              )}
              <p className="exam-why">{last.why}</p>
              <Link className="exam-chapter" href={last.guide}>
                📜 Read the chapter →
              </Link>
            </div>
          )}

          {index !== null && (
            <div className="exam-q">
              <div className="exam-topic">{EXAM[index]!.topic}</div>
              <h3 className="exam-prompt">{EXAM[index]!.prompt}</h3>
              <CmdForm name="examAnswer" path="/exam">
                <input type="hidden" name="index" value={index} />
                <div className="exam-options">
                  {EXAM[index]!.options.map((opt, i) => (
                    // A button per option, so answering is one click rather than
                    // pick-then-submit. Each carries its own value.
                    <button key={i} className="exam-option" type="submit" name="choice" value={i}>
                      <span className="exam-letter">{"ABCD"[i]}</span>
                      {opt}
                    </button>
                  ))}
                </div>
              </CmdForm>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
