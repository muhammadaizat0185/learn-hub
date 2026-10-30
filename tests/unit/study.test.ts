import { describe, expect, it, vi } from "vitest";
import type { CourseData, Question } from "../../src/types";
import type { StoredState } from "../../src/lib/storage";
import type { LabProgress } from "../../src/lib/lab";
import { recommendStudy, selectQuestions, topicMetrics } from "../../src/lib/study";

const NOW = 1_800_000_000_000;

function course(): CourseData {
  const topics = ["Basics", "Loops", "Classes"].map((name, index) => ({
    name, ids: Array.from({ length: 6 }, (_, offset) => index * 6 + offset + 1),
  }));
  const questions: Question[] = topics.flatMap(({ name, ids }) => ids.map((id) => ({
    id, topic: name, type: "mcq" as const, question: `Question ${id}`,
    options: [{ letter: "A", text: "Yes" }, { letter: "B", text: "No" }], answer: ["A"],
  })));
  const sets = ["first-lab", "second-lab"].map((id) => ({
    id, topic: "Basics", title: id, brief: "Apply the basics", code: "{{1}}",
    blanks: [{ id: 1, kind: "input" as const, answers: ["0"] }],
  }));
  return {
    meta: { id: "study-course", title: "Study", shortTitle: "Study", description: "Tests", exam: { questions: 5, minutes: 5, passPercent: 70 } },
    topics, questions, questionById: new Map(questions.map((question) => [question.id, question])), explanations: {},
    lessons: topics.map(({ name }) => ({
      id: name.toLowerCase(), topic: name, title: `Learn ${name}`, minutes: 5, concepts: [name],
      example: { title: "Example", explanation: name }, labIds: [],
    })),
    lab: { sets, setById: new Map(sets.map((set) => [set.id, set])), topics: [{ name: "Basics", sets }] },
  };
}

function state(): StoredState {
  return { version: 2, stats: {}, wrong: [], masteredWrong: [], reviews: {}, examHistory: [] };
}

function attempted(progress: StoredState, ids: number[], seen: number, correct: number) {
  for (const id of ids) progress.stats[id] = { seen, correct };
}

function review(dueAt: number, successfulReviews = 0): StoredState["reviews"][number] {
  return { dueAt, lastReviewedAt: NOW - 100, successfulReviews, intervalDays: 1, reason: "practice" };
}

describe("topic evidence", () => {
  it("reports no accuracy or evidence for an empty or unattempted topic", () => {
    expect(topicMetrics([], state(), NOW)).toEqual({ covered: 0, total: 0, attempts: 0, accuracy: null, enoughEvidence: false, recalled: 0, due: 0 });
    const progress = state();
    progress.stats[1] = { seen: 0, correct: 0 };
    expect(topicMetrics([1, 2, 3], progress, NOW)).toMatchObject({ covered: 0, accuracy: null, enoughEvidence: false });
  });

  it("weights accuracy by attempts and ignores stats outside the topic", () => {
    const progress = state();
    progress.stats = { 1: { seen: 8, correct: 8 }, 2: { seen: 1, correct: 0 }, 3: { seen: 1, correct: 0 }, 99: { seen: 100, correct: 0 } };
    expect(topicMetrics([1, 2, 3, 4], progress, NOW)).toMatchObject({ covered: 3, total: 4, attempts: 10, accuracy: 80, enoughEvidence: true });
  });

  it("does not treat many repeats on one question as broad evidence", () => {
    const progress = state();
    attempted(progress, [1], 100, 0);
    expect(topicMetrics([1, 2, 3, 4], progress, NOW)).toMatchObject({ covered: 1, attempts: 100, enoughEvidence: false });
    attempted(progress, [2], 1, 0);
    expect(topicMetrics([1, 2, 3, 4], progress, NOW).enoughEvidence).toBe(false);
    attempted(progress, [3], 1, 0);
    expect(topicMetrics([1, 2, 3, 4], progress, NOW).enoughEvidence).toBe(true);
  });

  it.each([{ ids: [1] }, { ids: [1, 2] }])("requires at least three attempts even for a small topic $ids", ({ ids }) => {
    const progress = state();
    attempted(progress, ids, 1, 1);
    expect(topicMetrics(ids, progress, NOW).enoughEvidence).toBe(false);
    progress.stats[1] = { seen: 3, correct: 3 };
    expect(topicMetrics(ids, progress, NOW).enoughEvidence).toBe(true);
  });

  it("counts spaced recall, not correct totals or legacy manual clears, and includes due-now reviews", () => {
    const progress = state();
    attempted(progress, [1, 2, 3], 20, 20);
    progress.masteredWrong = [1, 2, 3];
    progress.reviews = { 1: review(NOW, 2), 2: review(NOW + 1, 3), 3: review(NOW - 1, 4), 99: review(0, 10) };
    const before = JSON.stringify(progress);
    expect(topicMetrics([1, 2, 3, 4], progress, NOW)).toMatchObject({ recalled: 2, due: 2 });
    expect(JSON.stringify(progress)).toBe(before);
  });
});

describe("study recommendation priority", () => {
  it("prioritizes due reviews over weak topics, new lessons and labs; filters before taking ten", () => {
    const data = course();
    const progress = state();
    attempted(progress, [1, 2, 3], 1, 0);
    progress.reviews[999] = review(0);
    for (let id = 1; id <= 12; id++) progress.reviews[id] = review(NOW - id);
    progress.reviews[13] = review(NOW);
    progress.reviews[14] = review(NOW + 1);
    const before = JSON.stringify({ data, progress });
    const result = recommendStudy(data, progress, undefined, NOW);
    expect(result).toMatchObject({ kind: "review", questionIds: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3], title: "Review 10 questions due" });
    expect(JSON.stringify({ data, progress })).toBe(before);
  });

  it("breaks equal due-date ties by ID and excludes future and foreign reviews", () => {
    const progress = state();
    progress.reviews = { 3: review(NOW), 1: review(NOW), 2: review(NOW + 1), 999: review(0) };
    expect(recommendStudy(course(), progress, undefined, NOW).questionIds).toEqual([1, 3]);
  });

  it("chooses the weakest sufficiently sampled topic before untouched lessons or labs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const progress = state();
    attempted(progress, [1, 2, 3], 2, 1);
    attempted(progress, [7, 8, 9], 3, 1);
    expect(recommendStudy(course(), progress, undefined, NOW)).toMatchObject({ kind: "practice", topic: "Loops", questionIds: [7, 8, 9, 10, 11] });
  });

  it("does not call a poorly sampled topic weak", () => {
    const progress = state();
    attempted(progress, [1], 100, 0);
    expect(recommendStudy(course(), progress, undefined, NOW)).toMatchObject({ kind: "learn", lessonId: "loops" });
  });

  it.each([69, 70])("uses a strict below-70 accuracy threshold (%i percent)", (correct) => {
    const progress = state();
    attempted(progress, [1, 2, 3], 100, correct);
    expect(recommendStudy(course(), progress, undefined, NOW).kind).toBe(correct < 70 ? "practice" : "learn");
  });

  it("uses lesson order for untouched topics rather than question order", () => {
    const data = course();
    data.lessons = [...data.lessons!].reverse();
    expect(recommendStudy(data, state(), undefined, NOW)).toMatchObject({ kind: "learn", lessonId: "classes" });
  });

  it.each([{ lessons: undefined }, { lessons: [] }])("offers a five-question topic session without lessons %#", ({ lessons }) => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const data = { ...course(), lessons };
    expect(recommendStudy(data, state(), undefined, NOW)).toMatchObject({ kind: "practice", topic: "Basics", questionIds: [1, 2, 3, 4, 5] });
  });

  it("recommends the first unsolved lab only after new topics and weak evidence are handled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const data = course();
    const progress = state();
    attempted(progress, [1, 7, 13], 1, 1);
    expect(recommendStudy(data, progress, undefined, NOW)).toMatchObject({ kind: "lab", labId: "first-lab" });
    const labs: LabProgress = { version: 1, sets: { "first-lab": { solved: true, attempts: 1, lastAt: "2026-10-28" } } };
    expect(recommendStudy(data, progress, labs, NOW)).toMatchObject({ kind: "lab", labId: "second-lab" });
    labs.sets["second-lab"] = { solved: true, attempts: 2, lastAt: "2026-10-28" };
    expect(recommendStudy(data, progress, labs, NOW)).toMatchObject({ kind: "practice", questionIds: [1, 2, 3, 4, 5] });
  });

  it("samples mixed recommendations from the whole bank, not only its first five IDs", () => {
    const data = course();
    const progress = state();
    attempted(progress, [1, 7, 13], 1, 1);
    data.lab = undefined;
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ids = recommendStudy(data, progress, undefined, NOW).questionIds!;
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids.some((id) => id > 6)).toBe(true);
  });

  it("falls back safely when there are no labs or questions", () => {
    const data = course();
    const progress = state();
    attempted(progress, [1, 7, 13], 1, 1);
    data.lab = undefined;
    expect(recommendStudy(data, progress, undefined, NOW).questionIds).toHaveLength(5);
    expect(recommendStudy({ ...data, topics: [], lessons: [], questions: [], questionById: new Map() }, state(), undefined, NOW)).toMatchObject({ kind: "practice", questionIds: [] });
  });
});

describe("bounded randomized sessions", () => {
  const questions: Question[] = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, topic: "Topic", type: "mcq", question: `Q${index + 1}`, options: [], answer: ["A"],
  }));

  it.each([
    [-Infinity, 1], [-10, 1], [0, 1], [0.9, 1], [1, 1], [5.9, 5], [20, 20], [21, 20], [Infinity, 20],
  ])("bounds count %s to %i", (count, expected) => {
    const selected = selectQuestions(questions, count, () => 0.5);
    expect(selected).toHaveLength(expected);
    expect(new Set(selected.map((question) => question.id)).size).toBe(expected);
    expect(selected.every((question) => questions.includes(question))).toBe(true);
  });

  it("uses the ten-question default for an invalid NaN session size", () => {
    const selected = selectQuestions(questions, NaN, () => 0.5);
    expect(selected).toHaveLength(10);
  });

  it("uses the supplied RNG without sorting or mutating the input", () => {
    const input = questions.slice(0, 5);
    const before = JSON.stringify(input);
    Object.freeze(input);
    const random = vi.fn(() => 0);
    expect(selectQuestions(input, 3, random).map((question) => question.id)).toEqual([2, 3, 4]);
    expect(random).toHaveBeenCalledTimes(4);
    expect(selectQuestions(input, 3, () => 0.999).map((question) => question.id)).toEqual([1, 2, 3]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("uses Math.random by default and returns a new array", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const input = questions.slice(0, 3);
    expect(selectQuestions(input, 20).map((question) => question.id)).toEqual([2, 3, 1]);
    expect(random).toHaveBeenCalledTimes(2);
    expect(selectQuestions(input, 20)).not.toBe(input);
  });

  it("never pads a short bank or calls the RNG for zero or one question", () => {
    const random = vi.fn(() => 0);
    expect(selectQuestions([], 10, random)).toEqual([]);
    expect(selectQuestions(questions.slice(0, 1), 20, random)).toEqual([questions[0]]);
    expect(random).not.toHaveBeenCalled();
  });
});
