import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "../../src/types";
import type { PracticeSession } from "../../src/lib/practiceSession";
import {
  buildPracticeSummary, clearPracticeSummary, loadPracticeSummary, savePracticeSummary,
} from "../../src/lib/practiceSummary";
import * as storage from "../../src/lib/storage";

const COURSE = "summary-course";
const OTHER = "summary-other";
const NOW = 1_800_000_000_000;
const key = (id: string) => `hub.v1.course.${id}.summary`;
const questions = new Map<number, Question>(Array.from({ length: 6 }, (_, index) => {
  const id = index + 1;
  return [id, {
    id, topic: "Topic", type: id === 1 ? "multi" : "mcq", question: `Q${id}`,
    options: [{ letter: "A", text: "A" }, { letter: "B", text: "B" }], answer: id === 1 ? ["A", "B"] : ["A"],
  }];
}));

function session(): PracticeSession {
  return {
    version: 1, source: "practice", label: "A short session", startedAt: NOW - 5000, index: 5,
    questionIds: [1, 2, 3, 4, 5, 6, 999],
    answers: { 1: { letters: ["B", "A"] }, 2: { letters: ["B"] }, 4: { letters: ["A"] }, 5: { letters: ["B"] } },
    revealed: [1, 2, 3, 999],
  };
}

beforeEach(() => localStorage.clear());

describe("practice summary evidence", () => {
  it("separates checked correct/missed answers from unchecked selections and omissions", () => {
    expect(buildPracticeSummary(session(), questions, NOW)).toEqual({
      version: 1, label: "A short session", startedAt: NOW - 5000, finishedAt: NOW,
      correctIds: [1], missedIds: [2, 3], uncheckedIds: [4, 5, 6],
    });
  });

  it("preserves session order, ignores missing questions and does not count an extraneous reveal", () => {
    const input = session();
    input.questionIds = [6, 2, 4, 999];
    input.revealed = [1, 2, 999];
    expect(buildPracticeSummary(input, questions, NOW)).toMatchObject({ correctIds: [], missedIds: [2], uncheckedIds: [6, 4] });
  });

  it("handles an unfinished session without treating unchecked answers as misses", () => {
    const input = session();
    input.revealed = [];
    expect(buildPracticeSummary(input, questions, NOW)).toMatchObject({ correctIds: [], missedIds: [], uncheckedIds: [1, 2, 3, 4, 5, 6] });
    input.questionIds = [];
    expect(buildPracticeSummary(input, questions, NOW)).toMatchObject({ correctIds: [], missedIds: [], uncheckedIds: [] });
  });

  it("does not mutate the session, questions, question stats, schedule or exam history", () => {
    storage.recordAnswer(COURSE, 1, false, "practice", NOW - 1000);
    const input = session();
    const sessionBefore = JSON.stringify(input);
    const questionsBefore = JSON.stringify([...questions]);
    const progressBefore = localStorage.getItem(`hub.v1.course.${COURSE}.progress`);
    const record = vi.spyOn(storage, "recordAnswer");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(buildPracticeSummary(input, questions, NOW)).toEqual(buildPracticeSummary(input, questions, NOW));
    expect(JSON.stringify(input)).toBe(sessionBefore);
    expect(JSON.stringify([...questions])).toBe(questionsBefore);
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBe(progressBefore);
    expect(record).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("uses the current time when no finish time is supplied", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    expect(buildPracticeSummary(session(), questions).finishedAt).toBe(NOW);
  });
});

describe("saved practice summaries", () => {
  it("round-trips through storage and clears only the selected course", () => {
    const summary = buildPracticeSummary(session(), questions, NOW);
    expect(loadPracticeSummary(COURSE)).toBeNull();
    expect(savePracticeSummary(COURSE, summary)).toBe(true);
    expect(loadPracticeSummary(COURSE)).toEqual(summary);
    expect(loadPracticeSummary(OTHER)).toBeNull();
    savePracticeSummary(OTHER, { ...summary, label: "Other summary" });
    clearPracticeSummary(COURSE);
    expect(localStorage.getItem(key(COURSE))).toBeNull();
    expect(loadPracticeSummary(OTHER)?.label).toBe("Other summary");
  });

  it("loads repeatedly without recording more attempts or modifying stored progress", () => {
    storage.recordAnswer(COURSE, 2, false, "practice", NOW);
    const summary = buildPracticeSummary(session(), questions, NOW);
    savePracticeSummary(COURSE, summary);
    const before = localStorage.getItem(`hub.v1.course.${COURSE}.progress`);
    const write = vi.spyOn(Storage.prototype, "setItem");
    for (let count = 0; count < 3; count++) expect(loadPracticeSummary(COURSE)).toEqual(summary);
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBe(before);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "[]", "false"])("ignores malformed JSON/root %j", (text) => {
    localStorage.setItem(key(COURSE), text);
    expect(loadPracticeSummary(COURSE)).toBeNull();
  });

  it.each([
    { version: 2 }, { label: null }, { startedAt: "1000" }, { finishedAt: null },
    { correctIds: [0] }, { missedIds: [-1] }, { uncheckedIds: [1.5] },
    { correctIds: [Number.MAX_SAFE_INTEGER + 1] }, { missedIds: ["2"] }, { uncheckedIds: null },
  ])("rejects invalid summary metadata or IDs %#", (invalid) => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...buildPracticeSummary(session(), questions, NOW), ...invalid }));
    expect(loadPracticeSummary(COURSE)).toBeNull();
  });

  it("returns null when reading browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadPracticeSummary(COURSE)).toBeNull();
  });
});
