import { beforeEach, describe, expect, it } from "vitest";
import {
  buildProgressBackup,
  parseProgressBackup,
  progressBackupFilename,
  serializeProgressBackup,
} from "../../src/lib/backup";
import type { StoredState } from "../../src/lib/storage";

const COURSE = "sample-course";

const state: StoredState = {
  version: 1,
  stats: { 1: { seen: 2, correct: 1, lastCorrect: false } },
  wrong: [1],
  masteredWrong: [],
  examHistory: [
    { date: "2026-10-28T00:00:00.000Z", raw: 6, total: 8, percent: 75, passed: true },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe("progress backups", () => {
  it("serializes the course and progress", () => {
    const backup = buildProgressBackup(COURSE, state, new Date("2026-10-28T00:00:00.000Z"));
    expect(backup.kind).toBe("learn-hub-progress");
    expect(backup.courseId).toBe(COURSE);
    expect(backup.progress.stats[1]).toEqual({ seen: 2, correct: 1, lastCorrect: false });
    expect(progressBackupFilename(COURSE, new Date("2026-10-28T00:00:00.000Z"))).toBe(
      "learn-sample-course-progress-2026-10-28.json"
    );
  });

  it("round-trips through parse", () => {
    const parsed = parseProgressBackup(serializeProgressBackup(COURSE, state), COURSE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.stats[1]).toEqual({ seen: 2, correct: 1, lastCorrect: false });
      expect(parsed.state.examHistory[0].percent).toBe(75);
    }
  });

  it("rejects a backup from another course", () => {
    const parsed = parseProgressBackup(serializeProgressBackup(COURSE, state), "another-course");
    expect(parsed).toEqual({ ok: false, error: "That backup belongs to a different course." });
  });

  it("rejects invalid JSON and malformed stats", () => {
    expect(parseProgressBackup("{", COURSE).ok).toBe(false);
    const parsed = parseProgressBackup(
      JSON.stringify({
        ...buildProgressBackup(COURSE, state),
        progress: { stats: { 1: { seen: -1, correct: 0 } }, wrong: [], masteredWrong: [], examHistory: [] },
      }),
      COURSE
    );
    expect(parsed.ok).toBe(false);
  });
});
