import { beforeEach, describe, expect, it } from "vitest";
import { addExamResult, DAY, dueReviewIds, lastAttemptCorrect, load, normalizeState, recordAnswer, recordUnanswered, resetProgress, reviewStatus, snoozeReview } from "../../src/lib/storage";
const COURSE = "sample-course";
const OTHER = "another-course";
const NOW = 1_800_000_000_000;
beforeEach(() => localStorage.clear());

describe("per-course isolation and migration", () => {
  it("keeps stats separate and uses the existing key", () => {
    recordAnswer(COURSE, 1, false);
    expect(load(COURSE).stats[1]).toBeDefined();
    expect(load(OTHER).stats[1]).toBeUndefined();
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBeTruthy();
  });
  it("recovers from corrupt JSON", () => {
    localStorage.setItem(`hub.v1.course.${COURSE}.progress`, "{");
    expect(load(COURSE)).toEqual({ version: 2, stats: {}, wrong: [], masteredWrong: [], reviews: {}, examHistory: [] });
  });
  it("preserves legacy stats and manual clears without inventing spaced mastery", () => {
    const legacy = { version: 1, stats: { 1: { seen: 4, correct: 3 } }, wrong: [1], masteredWrong: [1], examHistory: [] };
    localStorage.setItem(`hub.v1.course.${COURSE}.progress`, JSON.stringify(legacy));
    const state = load(COURSE);
    expect(state.stats).toEqual(legacy.stats);
    expect(state.masteredWrong).toEqual([1]);
    expect(state.reviews[1]).toMatchObject({ successfulReviews: 0, reason: "legacy", lastReviewedAt: null });
    expect(dueReviewIds(state, NOW)).toEqual([1]);
    expect(normalizeState(state)).toEqual(state);
  });
  it("ignores invalid scheduling records and repairs missing ones", () => {
    const state = normalizeState({ stats: { 1: { seen: 1, correct: 9 } }, reviews: { 1: { dueAt: -1 }, nope: { dueAt: 0 } } });
    expect(state.stats[1].correct).toBe(1);
    expect(Object.keys(state.reviews)).toEqual(["1"]);
    expect(state.reviews[1].reason).toBe("legacy");
  });
});

describe("scheduled recall", () => {
  it("records misses and schedules them immediately", () => {
    recordAnswer(COURSE, 10, false, "practice", NOW);
    expect(load(COURSE).stats[10]).toEqual({ seen: 1, correct: 0, lastCorrect: false });
    expect(load(COURSE).wrong).toContain(10);
    expect(dueReviewIds(load(COURSE), NOW)).toEqual([10]);
  });
  it("one correct answer schedules tomorrow, not mastery", () => {
    recordAnswer(COURSE, 12, false, "practice", NOW);
    recordAnswer(COURSE, 12, true, "review", NOW + 1);
    const state = load(COURSE);
    expect(state.masteredWrong).not.toContain(12);
    expect(state.reviews[12]).toMatchObject({ successfulReviews: 1, intervalDays: 1, dueAt: NOW + 1 + DAY });
    expect(dueReviewIds(state, NOW + 2)).toEqual([]);
  });
  it("early repeats do not inflate recall or postpone the due date", () => {
    recordAnswer(COURSE, 1, true, "practice", NOW);
    const original = load(COURSE).reviews[1];
    for (let i = 1; i <= 20; i++) recordAnswer(COURSE, 1, true, "review", NOW + i);
    expect(load(COURSE).reviews[1]).toEqual(original);
    expect(load(COURSE).stats[1].seen).toBe(21);
  });
  it("advances 1, 3, 7 days only when due and lapses reset spacing", () => {
    recordAnswer(COURSE, 13, false, "practice", NOW);
    recordAnswer(COURSE, 13, true, "review", NOW);
    recordAnswer(COURSE, 13, true, "review", NOW + DAY);
    expect(load(COURSE).reviews[13]).toMatchObject({ successfulReviews: 2, intervalDays: 3, dueAt: NOW + 4 * DAY });
    recordAnswer(COURSE, 13, true, "review", NOW + 4 * DAY);
    expect(reviewStatus(load(COURSE).reviews[13])).toBe("Recalled over time");
    expect(load(COURSE).reviews[13].dueAt).toBe(NOW + 11 * DAY);
    recordAnswer(COURSE, 13, false, "exam", NOW + 5 * DAY);
    expect(load(COURSE).reviews[13]).toMatchObject({ successfulReviews: 0, dueAt: NOW + 5 * DAY });
    expect(load(COURSE).masteredWrong).not.toContain(13);
  });
  it("snoozing postpones without claiming a correct answer", () => {
    recordAnswer(COURSE, 20, false, "practice", NOW);
    snoozeReview(COURSE, [20], NOW);
    expect(load(COURSE).reviews[20]).toMatchObject({ successfulReviews: 0, dueAt: NOW + DAY });
    expect(load(COURSE).stats[20].correct).toBe(0);
  });
  it("retains unanswered exam questions separately without fake attempts", () => {
    recordUnanswered(COURSE, 7, NOW);
    expect(load(COURSE).stats[7]).toBeUndefined();
    expect(load(COURSE).wrong).not.toContain(7);
    expect(dueReviewIds(load(COURSE), NOW)).toEqual([7]);
    expect(reviewStatus(load(COURSE).reviews[7])).toBe("Not attempted in exam");
  });
  it("new correct questions are also scheduled", () => {
    recordAnswer(COURSE, 8, true, "exam", NOW);
    expect(load(COURSE).reviews[8].dueAt).toBe(NOW + DAY);
    expect(lastAttemptCorrect(load(COURSE).stats[8])).toBe(true);
    expect(lastAttemptCorrect({ seen: 0, correct: 0 })).toBe(false);
  });
});

describe("history and reset", () => {
  it("keeps the newest 20 exam results", () => {
    for (let i = 0; i < 25; i++) addExamResult(COURSE, { date: new Date(2026, 0, i + 1).toISOString(), raw: i, total: 90, percent: i, passed: false });
    expect(load(COURSE).examHistory).toHaveLength(20);
    expect(load(COURSE).examHistory[0].raw).toBe(5);
  });
  it("repairs missing legacy percentages", () => {
    expect(normalizeState({ examHistory: [{ date: "2026-01-01", raw: 6, total: 8, passed: true }] }).examHistory[0].percent).toBe(75);
  });
  it("resets just one course", () => {
    recordAnswer(COURSE, 21, false); recordAnswer(OTHER, 21, false); resetProgress(COURSE);
    expect(load(COURSE).stats).toEqual({}); expect(load(COURSE).reviews).toEqual({});
    expect(load(OTHER).wrong).toContain(21);
  });
});
