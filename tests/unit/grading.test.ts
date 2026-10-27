import { describe, expect, it } from "vitest";
import {
  gradeExam,
  isAnswered,
  isPass,
  percentScore,
  remainingSeconds,
  sameSet,
} from "../../src/lib/grading";
import type { Question } from "../../src/types";

const questions: Question[] = [
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
  {
    id: 2,
    topic: "Topic",
    type: "multi",
    question: "Two?",
    options: [
      { letter: "A", text: "a" },
      { letter: "B", text: "b" },
      { letter: "C", text: "c" },
    ],
    answer: ["A", "C"],
  },
];

describe("answer matching", () => {
  it("compares answer sets regardless of order", () => {
    expect(sameSet(["A", "C"], ["C", "A"])).toBe(true);
    expect(sameSet(["A"], ["A", "C"])).toBe(false);
    expect(sameSet(["B"], ["A"])).toBe(false);
  });

  it("treats an empty answer as unanswered", () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered({ letters: [] })).toBe(false);
    expect(isAnswered({ letters: ["A"] })).toBe(true);
  });
});

describe("gradeExam", () => {
  it("marks correct, incorrect, and missing answers", () => {
    const graded = gradeExam(questions, {
      1: { letters: ["B"] },
      2: { letters: ["A"] },
    });
    expect(graded[0].correct).toBe(true);
    expect(graded[1].correct).toBe(false);
  });

  it("counts unanswered questions as incorrect", () => {
    const graded = gradeExam(questions, {});
    expect(graded.every((g) => !g.correct)).toBe(true);
    expect(graded[0].answer).toEqual({ letters: [] });
  });
});

describe("percent scoring", () => {
  it("rounds the raw percentage and clamps it", () => {
    expect(percentScore(8, 8)).toBe(100);
    expect(percentScore(5, 8)).toBe(63);
    expect(percentScore(0, 8)).toBe(0);
    expect(percentScore(9, 8)).toBe(100);
    expect(percentScore(0, 0)).toBe(0);
  });

  it("compares against the course pass mark", () => {
    expect(isPass(60, 60)).toBe(true);
    expect(isPass(59, 60)).toBe(false);
    expect(isPass(50, 50)).toBe(true);
  });
});

describe("exam timer", () => {
  it("never returns a negative number of seconds", () => {
    expect(remainingSeconds(1_000, 0)).toBe(1);
    expect(remainingSeconds(0, 1_000)).toBe(0);
  });
});
