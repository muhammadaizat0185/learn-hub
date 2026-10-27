import { beforeEach, describe, expect, it } from "vitest";
import type { ExamSession } from "../../src/lib/examSession";
import {
  clearExamSession,
  loadExamSession,
  saveExamSession,
} from "../../src/lib/examSession";
import type { PracticeSession } from "../../src/lib/practiceSession";
import {
  clearPracticeSession,
  loadPracticeSession,
  practiceScore,
  savePracticeSession,
} from "../../src/lib/practiceSession";
import type { Question } from "../../src/types";

const COURSE = "sample-course";
const OTHER = "another-course";

const questions = new Map<number, Question>([
  [
    1,
    {
      id: 1,
      topic: "Topic",
      type: "mcq",
      question: "One?",
      options: [
        { letter: "A", text: "a" },
        { letter: "B", text: "b" },
      ],
      answer: ["B"],
    },
  ],
]);

function practice(): PracticeSession {
  return {
    version: 1,
    label: "Quick quiz",
    source: "practice",
    questionIds: [1],
    index: 0,
    answers: { 1: { letters: ["B"] } },
    revealed: [1],
    startedAt: 1_000,
  };
}

function exam(): ExamSession {
  return {
    version: 1,
    questionIds: [1],
    answers: { 1: { letters: ["A"] } },
    index: 0,
    startedAt: 1_000,
    deadline: 2_000,
    flags: [1],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("practice sessions", () => {
  it("round-trips a session and scores revealed answers", () => {
    savePracticeSession(COURSE, practice());
    const loaded = loadPracticeSession(COURSE);
    expect(loaded).not.toBeNull();
    expect(practiceScore(loaded!, questions)).toEqual({ score: 1, answered: 1 });
  });

  it("is isolated per course", () => {
    savePracticeSession(COURSE, practice());
    expect(loadPracticeSession(OTHER)).toBeNull();
  });

  it("rejects malformed sessions", () => {
    localStorage.setItem(
      `hub.v1.course.${COURSE}.practice`,
      JSON.stringify({ version: 1, label: "", questionIds: [], source: "practice" })
    );
    expect(loadPracticeSession(COURSE)).toBeNull();
  });

  it("clears only the selected course", () => {
    savePracticeSession(COURSE, practice());
    savePracticeSession(OTHER, practice());
    clearPracticeSession(COURSE);
    expect(loadPracticeSession(COURSE)).toBeNull();
    expect(loadPracticeSession(OTHER)).not.toBeNull();
  });
});

describe("exam sessions", () => {
  it("round-trips answers, deadline, and flags", () => {
    saveExamSession(COURSE, exam());
    expect(loadExamSession(COURSE)).toEqual(exam());
  });

  it("drops flags for questions that are not in the session", () => {
    localStorage.setItem(
      `hub.v1.course.${COURSE}.exam`,
      JSON.stringify({ ...exam(), flags: [1, 2, 999] })
    );
    expect(loadExamSession(COURSE)?.flags).toEqual([1]);
  });

  it("is isolated per course", () => {
    saveExamSession(COURSE, exam());
    expect(loadExamSession(OTHER)).toBeNull();
    clearExamSession(COURSE);
    expect(loadExamSession(COURSE)).toBeNull();
  });
});
