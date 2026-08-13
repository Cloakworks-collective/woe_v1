// The Collegium Examination.
//
// Written as the ways someone would try to shortcut it, because the endowment
// is large and the whole feature is a reward behind a sequence of clicks.

import { describe, expect, it } from "vitest";
import { EXAM, EXAM_PASS_MARK, EXAM_REWARD } from "../constants";
import {
  answerQuestion,
  currentQuestionIndex,
  examPassed,
  examSealed,
  examState,
  payEndowment,
  retakeExam,
  sittingFinished,
} from "./exam";
import { newEmpire } from "./newEmpire";
import type { Player } from "./types";

const fresh = (): Player => newEmpire({ id: "t", name: "Test", race: "human" });

/** Sit the whole paper, getting exactly `score` questions right. */
function sit(p: Player, score: number): Player {
  let cur = p;
  for (let i = 0; i < EXAM.length; i++) {
    const correct = EXAM[i]!.answer;
    const choice = i < score ? correct : (correct + 1) % EXAM[i]!.options.length;
    cur = answerQuestion(cur, i, choice);
  }
  return cur;
}

describe("the question bank", () => {
  it("is 25 questions, each with a real answer and somewhere to read more", () => {
    expect(EXAM).toHaveLength(25);
    for (const q of EXAM) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(q.why.length).toBeGreaterThan(40); // an explanation, not a word
      expect(q.guide).toMatch(/^\/guide#/);
      expect(q.prompt.length).toBeGreaterThan(10);
    }
  });

  it("has unique ids, so progress cannot collide", () => {
    expect(new Set(EXAM.map((q) => q.id)).size).toBe(EXAM.length);
  });

  it("does not put every answer in the same slot", () => {
    // A bank where the answer is always B is a bank you can pass without
    // reading a word of it.
    const counts = new Map<number, number>();
    for (const q of EXAM) counts.set(q.answer, (counts.get(q.answer) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts.values())).toBeLessThan(EXAM.length * 0.55);
  });

  it("covers every subject the examination promises", () => {
    const topics = new Set(EXAM.map((q) => q.topic));
    for (const t of [
      "Production",
      "Hearthsteads & barracks",
      "Population growth",
      "Raid, castle, bombard, revenge",
      "Siege duels",
      "Spies & scouts",
      "Markets",
      "Ranking",
    ]) {
      expect(topics).toContain(t);
    }
  });
});

describe("sitting the paper", () => {
  it("walks forward one question at a time", () => {
    let p = fresh();
    expect(currentQuestionIndex(p)).toBe(0);
    p = answerQuestion(p, 0, 0);
    expect(currentQuestionIndex(p)).toBe(1);
    expect(examState(p).answered).toBe(1);
  });

  it("counts what you got right", () => {
    expect(examState(sit(fresh(), EXAM.length)).correct).toBe(EXAM.length);
    expect(examState(sit(fresh(), 0)).correct).toBe(0);
    expect(examState(sit(fresh(), 17)).correct).toBe(17);
  });

  it("refuses to skip ahead", () => {
    const p = fresh();
    // The shortcut that matters: answer the LAST question first and collect.
    expect(() => answerQuestion(p, EXAM.length - 1, 0)).toThrow(/not the question/i);
    expect(() => answerQuestion(p, 5, 0)).toThrow();
  });

  it("ignores an echo of a question already answered", () => {
    // A double-click, a slow network, a back button. The first answer is
    // recorded and immutable, so replaying it can gain nothing — and throwing
    // here used to 500 the page for anyone who clicked an option twice.
    const first = answerQuestion(fresh(), 0, EXAM[0]!.answer);
    const echo = answerQuestion(first, 0, (EXAM[0]!.answer + 1) % EXAM[0]!.options.length);
    expect(examState(echo)).toEqual(examState(first));
    expect(examState(echo).correct).toBe(1); // the retry did NOT overwrite it
  });

  it("ignores an answer arriving after the paper is finished", () => {
    const done = sit(fresh(), 20);
    expect(examState(answerQuestion(done, 0, 0))).toEqual(examState(done));
  });

  it("refuses an option that does not exist", () => {
    const p = fresh();
    expect(() => answerQuestion(p, 0, -1)).toThrow();
    expect(() => answerQuestion(p, 0, 99)).toThrow();
    expect(() => answerQuestion(p, 0, 1.5)).toThrow();
  });

  it("knows when the paper is finished", () => {
    const done = sit(fresh(), EXAM.length);
    expect(sittingFinished(done)).toBe(true);
    expect(currentQuestionIndex(done)).toBeNull();
  });

  it("does not mutate the player handed to it", () => {
    const p = fresh();
    answerQuestion(p, 0, 0);
    expect(p.exam).toBeUndefined();
  });
});

describe("the mark, and sitting it again", () => {
  it("passes at exactly the mark and not one below", () => {
    expect(examPassed(sit(fresh(), EXAM_PASS_MARK))).toBe(true);
    expect(examPassed(sit(fresh(), EXAM_PASS_MARK - 1))).toBe(false);
    expect(examPassed(sit(fresh(), EXAM.length))).toBe(true);
  });

  it("is not passed part-way through, however well it is going", () => {
    let p = fresh();
    for (let i = 0; i < EXAM.length - 1; i++) p = answerQuestion(p, i, EXAM[i]!.answer);
    expect(examPassed(p)).toBe(false); // 24 right, still unfinished
  });

  it("hands back a clean paper on a retake, and counts the sitting", () => {
    const failed = sit(fresh(), 3);
    const again = retakeExam(failed);
    expect(examState(again)).toMatchObject({ answered: 0, correct: 0, attempts: 2 });
    expect(currentQuestionIndex(again)).toBe(0);
    // And it can actually be passed the second time.
    expect(examPassed(sit(again, EXAM_PASS_MARK))).toBe(true);
  });

  it("refuses a retake mid-paper, or after it is sealed", () => {
    expect(() => retakeExam(answerQuestion(fresh(), 0, 0))).toThrow(/finish the paper/i);
    const sealed = payEndowment(sit(fresh(), EXAM.length)).player;
    expect(() => retakeExam(sealed)).toThrow(/already sat/i);
  });
});

describe("the endowment", () => {
  it("pays nothing until the last question is answered", () => {
    let p = fresh();
    for (let i = 0; i < EXAM.length - 1; i++) {
      p = answerQuestion(p, i, EXAM[i]!.answer);
      expect(payEndowment(p).paid).toBe(false);
    }
    expect(payEndowment(answerQuestion(p, EXAM.length - 1, EXAM.at(-1)!.answer)).paid).toBe(true);
  });

  it("pays nothing for a paper that missed the mark", () => {
    const missed = sit(fresh(), EXAM_PASS_MARK - 1);
    expect(payEndowment(missed).paid).toBe(false);
    expect(payEndowment(missed).player.gold).toBe(fresh().gold);
    expect(examSealed(missed)).toBe(false); // still on offer
  });

  it("pays gold and every resource, exactly once", () => {
    const before = fresh();
    const first = payEndowment(sit(before, EXAM.length));
    expect(first.paid).toBe(true);
    expect(first.player.gold).toBe(before.gold + EXAM_REWARD.gold);
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      expect(first.player.resources[r]).toBe(before.resources[r] + EXAM_REWARD.resources);
    }

    // The refresh-at-the-results-screen case, ten times over.
    let cur = first.player;
    for (let i = 0; i < 10; i++) {
      const again = payEndowment(cur);
      expect(again.paid).toBe(false);
      cur = again.player;
    }
    expect(cur.gold).toBe(first.player.gold);
    expect(cur.resources.ore).toBe(first.player.resources.ore);
    expect(examSealed(cur)).toBe(true);
  });
});
