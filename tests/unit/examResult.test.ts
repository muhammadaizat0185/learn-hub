import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseData, Question } from "../../src/types";
import type { ExamSummary } from "../../src/lib/grading";
import { gradeExam } from "../../src/lib/grading";
import { clearExamResult, loadExamResult, saveExamResult } from "../../src/lib/examResult";
import * as storage from "../../src/lib/storage";

const COURSE = "exam-result-course";
const OTHER = "exam-result-other";
const NOW = 1_800_000_000_000;
const key = (id: string) => `hub.v1.course.${id}.exam-result`;
const questions: Question[] = [1, 2, 3].map((id) => ({
  id, topic: "Topic", type: id === 2 ? "multi" : "mcq", question: `Q${id}`,
  options: [{ letter: "A", text: "A" }, { letter: "B", text: "B" }], answer: id === 2 ? ["A", "B"] : ["A"],
}));
const data: CourseData = {
  meta: { id: COURSE, title: "Exam", shortTitle: "Exam", description: "Tests", exam: { questions: 3, minutes: 3, passPercent: 70 } },
  questions, questionById: new Map(questions.map((question) => [question.id, question])), explanations: {}, topics: [{ name: "Topic", ids: [1, 2, 3] }],
};

function summary(): ExamSummary {
  return {
    graded: gradeExam([questions[1], questions[0], questions[2]], { 1: { letters: ["B"] }, 2: { letters: ["B", "A"] } }),
    raw: 1, total: 3, percent: 33, passPercent: 30, passed: true, autoSubmitted: true,
  };
}

function saved() {
  return {
    version: 1, questionIds: [2, 1, 3],
    answers: { 1: { letters: ["B"] }, 2: { letters: ["B", "A"] }, 3: { letters: [] } },
    passPercent: 30, autoSubmitted: true,
  };
}

beforeEach(() => localStorage.clear());

describe("reloadable exam results", () => {
  it("persists ordered answers including unanswered questions and restores the original threshold", () => {
    expect(loadExamResult(data)).toBeNull();
    saveExamResult(COURSE, summary());
    expect(JSON.parse(localStorage.getItem(key(COURSE))!)).toEqual(saved());
    expect(loadExamResult(data)).toEqual(summary());
    expect(loadExamResult(data)?.graded.map(({ correct }) => correct)).toEqual([true, false, false]);
  });

  it("reconstructs results in a freshly loaded module without recording grading side effects", async () => {
    storage.recordAnswer(COURSE, 1, false, "exam", NOW);
    storage.recordAnswer(COURSE, 2, true, "exam", NOW);
    storage.recordUnanswered(COURSE, 3, NOW);
    storage.addExamResult(COURSE, { date: new Date(NOW).toISOString(), raw: 1, total: 3, percent: 33, passed: true });
    saveExamResult(COURSE, summary());
    const progressBefore = localStorage.getItem(`hub.v1.course.${COURSE}.progress`);
    const resultBefore = localStorage.getItem(key(COURSE));
    const questionsBefore = JSON.stringify([...data.questionById]);
    const record = vi.spyOn(storage, "recordAnswer");
    const unanswered = vi.spyOn(storage, "recordUnanswered");
    const history = vi.spyOn(storage, "addExamResult");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    vi.resetModules();
    const reloaded = await import("../../src/lib/examResult");
    for (let count = 0; count < 3; count++) expect(reloaded.loadExamResult(data)).toEqual(summary());
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBe(progressBefore);
    expect(localStorage.getItem(key(COURSE))).toBe(resultBefore);
    expect(JSON.stringify([...data.questionById])).toBe(questionsBefore);
    expect(record).not.toHaveBeenCalled();
    expect(unanswered).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("derives scores from canonical questions, not injected score fields", () => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...saved(), raw: 3, total: 3, percent: 100, passed: false }));
    expect(loadExamResult(data)).toMatchObject({ raw: 1, total: 3, percent: 33, passed: true });
  });

  it("does not alias the caller's summary or prior loaded answers", () => {
    const original = summary();
    const before = JSON.stringify(original);
    saveExamResult(COURSE, original);
    const loaded = loadExamResult(data)!;
    loaded.graded[0].answer.letters.push("C");
    expect(loadExamResult(data)).toEqual(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("isolates courses and only clears the selected result, not progress or an active exam", () => {
    const otherData = { ...data, meta: { ...data.meta, id: OTHER } };
    saveExamResult(COURSE, summary());
    expect(loadExamResult(otherData)).toBeNull();
    saveExamResult(OTHER, summary());
    localStorage.setItem(`hub.v1.course.${COURSE}.progress`, "progress sentinel");
    localStorage.setItem(`hub.v1.course.${COURSE}.exam`, "session sentinel");
    clearExamResult(COURSE);
    expect(loadExamResult(data)).toBeNull();
    expect(loadExamResult(otherData)).toEqual(summary());
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBe("progress sentinel");
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.exam`)).toBe("session sentinel");
  });

  it.each([undefined, null, "30", -1, 101])("falls back to the course threshold for invalid saved threshold %j", (passPercent) => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...saved(), passPercent }));
    expect(loadExamResult(data)).toMatchObject({ passPercent: 70, passed: false });
  });

  it.each([0, 33, 100])("preserves a valid saved threshold of %i", (passPercent) => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...saved(), passPercent, autoSubmitted: false }));
    expect(loadExamResult(data)).toMatchObject({ passPercent, passed: 33 >= passPercent, autoSubmitted: false });
  });

  it("does not interpret truthy strings as automatic submission", () => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...saved(), autoSubmitted: "true" }));
    expect(loadExamResult(data)?.autoSubmitted).toBe(false);
  });
});

describe("invalid saved exam results", () => {
  it.each(["{", "null", "[]", "false"])("ignores corrupt JSON/root %j", (text) => {
    localStorage.setItem(key(COURSE), text);
    expect(loadExamResult(data)).toBeNull();
  });

  it.each([
    { version: 2 }, { questionIds: [] }, { questionIds: "1" }, { questionIds: [1, 1] },
    { questionIds: [999] }, { questionIds: ["1"] }, { questionIds: [1.5] }, { questionIds: [0] },
    { answers: null }, { answers: [] }, { answers: { 1: { letters: ["A"] } } },
    { answers: { ...saved().answers, 2: { letters: "A" } } },
    { answers: { ...saved().answers, 2: { letters: [1] } } },
  ])("rejects malformed question IDs or answer data %#", (invalid) => {
    localStorage.setItem(key(COURSE), JSON.stringify({ ...saved(), ...invalid }));
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(loadExamResult(data)).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("returns null when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadExamResult(data)).toBeNull();
  });
});
