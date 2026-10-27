import { beforeEach, describe, expect, it } from "vitest";
import {
  addExamResult,
  lastAttemptCorrect,
  load,
  markWrongMastered,
  recordAnswer,
  resetProgress,
} from "../../src/lib/storage";

const COURSE = "sample-course";
const OTHER = "another-course";

beforeEach(() => {
  localStorage.clear();
});

describe("per-course isolation", () => {
  it("keeps stats separate between courses", () => {
    recordAnswer(COURSE, 1, false, "practice");
    expect(load(COURSE).stats[1]).toBeDefined();
    expect(load(OTHER).stats[1]).toBeUndefined();
    expect(load(OTHER).wrong).toEqual([]);
  });

  it("stores keys under a per-course namespace", () => {
    recordAnswer(COURSE, 1, true, "practice");
    expect(localStorage.getItem(`hub.v1.course.${COURSE}.progress`)).toBeTruthy();
    expect(localStorage.getItem(`hub.v1.course.${OTHER}.progress`)).toBeNull();
  });

  it("ignores corrupt JSON and resets to an empty state per course", () => {
    localStorage.setItem(`hub.v1.course.${COURSE}.progress`, "{");
    expect(load(COURSE)).toEqual({
      version: 1,
      stats: {},
      wrong: [],
      masteredWrong: [],
      examHistory: [],
    });
  });
});

describe("recording answers", () => {
  it("tracks attempts and adds misses to the review deck", () => {
    recordAnswer(COURSE, 10, false, "practice");
    let state = load(COURSE);
    expect(state.stats[10]).toMatchObject({ seen: 1, correct: 0, lastCorrect: false });
    expect(state.wrong).toContain(10);
    expect(state.masteredWrong).not.toContain(10);

    recordAnswer(COURSE, 10, true, "practice");
    state = load(COURSE);
    expect(state.stats[10]).toMatchObject({ seen: 2, correct: 1, lastCorrect: true });
    expect(lastAttemptCorrect(state.stats[10])).toBe(true);
  });

  it("does not master during ordinary practice", () => {
    recordAnswer(COURSE, 11, false, "practice");
    recordAnswer(COURSE, 11, true, "practice");
    expect(load(COURSE).masteredWrong).not.toContain(11);
  });

  it("masters a review question after one correct answer", () => {
    recordAnswer(COURSE, 12, false, "practice");
    recordAnswer(COURSE, 12, true, "review");
    expect(load(COURSE).masteredWrong).toContain(12);
    expect(load(COURSE).wrong).toContain(12);
  });

  it("returns a mastered question to the review deck after another miss", () => {
    recordAnswer(COURSE, 13, false, "practice");
    recordAnswer(COURSE, 13, true, "review");
    expect(load(COURSE).masteredWrong).toContain(13);

    recordAnswer(COURSE, 13, false, "review");
    expect(load(COURSE).masteredWrong).not.toContain(13);
    expect(load(COURSE).wrong).toContain(13);
  });

  it("does not master from an exam answer", () => {
    recordAnswer(COURSE, 14, false, "practice");
    recordAnswer(COURSE, 14, true, "exam");
    expect(load(COURSE).masteredWrong).not.toContain(14);
  });
});

describe("exam history", () => {
  it("keeps the newest 20 results", () => {
    for (let i = 0; i < 25; i++) {
      addExamResult(COURSE, {
        date: new Date(2026, 0, i + 1).toISOString(),
        raw: i,
        total: 90,
        percent: i,
        passed: false,
      });
    }
    const history = load(COURSE).examHistory;
    expect(history).toHaveLength(20);
    expect(history[0].raw).toBe(5);
    expect(history[19].raw).toBe(24);
  });

  it("repairs a missing percentage on load", () => {
    localStorage.setItem(
      `hub.v1.course.${COURSE}.progress`,
      JSON.stringify({
        stats: {},
        wrong: [],
        masteredWrong: [],
        examHistory: [
          { date: "2026-01-01T00:00:00.000Z", raw: 6, total: 8, passed: true },
        ],
      })
    );
    expect(load(COURSE).examHistory[0].percent).toBe(75);
  });
});

describe("manual controls", () => {
  it("marks questions mastered without dropping them from the wrong list", () => {
    recordAnswer(COURSE, 20, false, "practice");
    markWrongMastered(COURSE, [20]);
    expect(load(COURSE).masteredWrong).toContain(20);
    expect(load(COURSE).wrong).toContain(20);
  });

  it("resetProgress clears every field for one course only", () => {
    recordAnswer(COURSE, 21, false, "practice");
    recordAnswer(OTHER, 21, false, "practice");
    resetProgress(COURSE);
    expect(load(COURSE)).toEqual({
      version: 1,
      stats: {},
      wrong: [],
      masteredWrong: [],
      examHistory: [],
    });
    expect(load(OTHER).wrong).toContain(21);
  });
});
