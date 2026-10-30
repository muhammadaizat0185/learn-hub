import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildProgressBackup,
  parseProgressBackup,
  progressBackupFilename,
  restoreProgressBackup,
  serializeProgressBackup,
} from "../../src/lib/backup";
import { load, save } from "../../src/lib/storage";
import type { StoredState } from "../../src/lib/storage";
import { loadLabProgress, saveLabProgress } from "../../src/lib/lab";
import type { LabProgress } from "../../src/lib/lab";
import { loadLabDrafts, replaceLabDrafts } from "../../src/lib/labDrafts";
import type { LabDrafts } from "../../src/lib/labDrafts";

const COURSE = "sample-course";
const OTHER = "another-course";
const DATE = "2026-10-28T00:00:00.000Z";
const NOW = Date.parse(DATE);
const prefix = (id: string) => `hub.v1.course.${id}.`;
const sessionSuffixes = ["practice", "exam", "summary", "exam-result"];

const state: StoredState = {
  version: 2,
  stats: { 1: { seen: 2, correct: 1, lastCorrect: false }, 2: { seen: 5, correct: 4, lastCorrect: true }, 4: { seen: 1, correct: 0 } },
  wrong: [1, 4],
  masteredWrong: [4],
  reviews: {
    1: { dueAt: NOW, lastReviewedAt: NOW, successfulReviews: 0, intervalDays: 0, reason: "mistake" },
    2: { dueAt: NOW + 604_800_000, lastReviewedAt: NOW, successfulReviews: 3, intervalDays: 7, reason: "practice" },
    3: { dueAt: NOW, lastReviewedAt: null, successfulReviews: 0, intervalDays: 0, reason: "unanswered" },
    4: { dueAt: 0, lastReviewedAt: null, successfulReviews: 0, intervalDays: 0, reason: "legacy" },
  },
  examHistory: [{ date: DATE, raw: 6, total: 8, percent: 75, passed: true }],
};
const labs: LabProgress = {
  version: 1,
  sets: { "loops-1": { attempts: 3, solved: true, lastAt: DATE }, "loops-2": { attempts: 1, solved: false, lastAt: DATE } },
};
const drafts: LabDrafts = {
  "loops-2": { values: { 1: "int count = 0;", 2: "i++", 3: "" }, revealed: [2], updatedAt: NOW, fingerprint: "v1:0123456789abcdef" },
};

function snapshot() {
  return Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]));
}

function parsedBackup() {
  const parsed = parseProgressBackup(serializeProgressBackup(COURSE, state, new Date(NOW)), COURSE);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

function legacyBackup() {
  const { reviews: _reviews, ...progress } = state;
  return { kind: "learn-hub-progress", version: 1, courseId: COURSE, progress: { ...progress, version: 1 } };
}

function seedSessions(id: string) {
  for (const suffix of sessionSuffixes) localStorage.setItem(`${prefix(id)}${suffix}`, `${id} ${suffix}`);
}

beforeEach(() => {
  localStorage.clear();
  saveLabProgress(COURSE, labs);
  replaceLabDrafts(COURSE, drafts);
});

describe("version 2 progress backups", () => {
  it("exports the version, course, timestamp and dated filename without mutating progress", () => {
    const before = JSON.stringify(state);
    const storedBefore = snapshot();
    const backup = buildProgressBackup(COURSE, state, new Date(NOW));
    expect(backup).toEqual({
      kind: "learn-hub-progress", version: 2, app: "Learn Course Hub", courseId: COURSE, exportedAt: DATE,
      progress: state, labProgress: labs, labDrafts: drafts,
    });
    expect(progressBackupFilename(COURSE, new Date(NOW))).toBe("learn-sample-course-progress-2026-10-28.json");
    expect(JSON.stringify(state)).toBe(before);
    expect(snapshot()).toEqual(storedBefore);
  });

  it("loads current progress by default, but not another course's data", () => {
    save(COURSE, state);
    expect(buildProgressBackup(COURSE).progress).toEqual(state);
    expect(buildProgressBackup(OTHER)).toMatchObject({
      progress: { stats: {}, reviews: {}, wrong: [], examHistory: [] }, labProgress: { version: 1, sets: {} }, labDrafts: {},
    });
  });

  it("round-trips every schedule field, lab result and assisted draft through serialize, parse, restore and reload", () => {
    const parsed = parsedBackup();
    expect(parsed).toEqual({ ok: true, state, labProgress: labs, labDrafts: drafts });
    save(COURSE, { version: 2, stats: {}, reviews: {}, wrong: [], masteredWrong: [], examHistory: [] });
    saveLabProgress(COURSE, { version: 1, sets: { stale: { attempts: 7, solved: true, lastAt: DATE } } });
    replaceLabDrafts(COURSE, { stale: { values: { 1: "old" }, revealed: [], updatedAt: NOW, fingerprint: "old" } });
    expect(restoreProgressBackup(COURSE, parsed)).toBe(true);
    expect(load(COURSE)).toEqual(state);
    expect(loadLabProgress(COURSE)).toEqual(labs);
    expect(loadLabDrafts(COURSE)).toEqual(drafts);
    expect(loadLabDrafts(COURSE)["loops-2"].revealed).toEqual([2]);
    expect(load(COURSE).stats[3]).toBeUndefined();
    expect(load(COURSE).reviews[3].reason).toBe("unanswered");
  });

  it("restores empty v2 lab collections as replacements rather than preserving stale entries", () => {
    const parsed = parsedBackup();
    expect(restoreProgressBackup(COURSE, { ...parsed, labProgress: { version: 1, sets: {} }, labDrafts: {} })).toBe(true);
    expect(loadLabProgress(COURSE)).toEqual({ version: 1, sets: {} });
    expect(loadLabDrafts(COURSE)).toEqual({});
  });

  it("accepts equivalent object property order without losing schedule or draft fields", () => {
    const backup = buildProgressBackup(COURSE, state);
    backup.progress.reviews[2] = { reason: "practice", intervalDays: 7, successfulReviews: 3, lastReviewedAt: NOW, dueAt: NOW + 604_800_000 };
    expect(parseProgressBackup(JSON.stringify(backup), COURSE)).toEqual({ ok: true, state, labProgress: labs, labDrafts: drafts });
  });
});

describe("legacy v1 compatibility", () => {
  it("migrates old progress to due reviews without inventing spaced successes", () => {
    const parsed = parseProgressBackup(JSON.stringify(legacyBackup()), COURSE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.labProgress).toBeNull();
    expect(parsed.labDrafts).toBeNull();
    expect(parsed.state).toMatchObject({ version: 2, stats: state.stats, wrong: state.wrong, masteredWrong: state.masteredWrong, examHistory: state.examHistory });
    expect(Object.keys(parsed.state.reviews)).toEqual(["1", "2", "4"]);
    for (const review of Object.values(parsed.state.reviews)) {
      expect(review).toEqual({ dueAt: 0, lastReviewedAt: null, successfulReviews: 0, intervalDays: 0, reason: "legacy" });
    }
  });

  it("keeps existing labs and assisted drafts byte-for-byte but clears stale sessions and results", () => {
    seedSessions(COURSE);
    seedSessions(OTHER);
    const labsBefore = localStorage.getItem(`hub.v1.lab.${COURSE}`);
    const draftsBefore = localStorage.getItem(`hub.v1.lab-drafts.${COURSE}`);
    const parsed = parseProgressBackup(JSON.stringify(legacyBackup()), COURSE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(restoreProgressBackup(COURSE, parsed)).toBe(true);
    expect(localStorage.getItem(`hub.v1.lab.${COURSE}`)).toBe(labsBefore);
    expect(localStorage.getItem(`hub.v1.lab-drafts.${COURSE}`)).toBe(draftsBefore);
    expect(load(COURSE)).toEqual(parsed.state);
    for (const suffix of sessionSuffixes) {
      expect(localStorage.getItem(`${prefix(COURSE)}${suffix}`)).toBeNull();
      expect(localStorage.getItem(`${prefix(OTHER)}${suffix}`)).toBe(`${OTHER} ${suffix}`);
    }
  });

  it("repairs optional legacy percentages while retaining scores", () => {
    const legacy = legacyBackup();
    const { percent: _percent, ...entry } = state.examHistory[0];
    const parsed = parseProgressBackup(JSON.stringify({ ...legacy, progress: { ...legacy.progress, examHistory: [entry] } }), COURSE);
    expect(parsed.ok && parsed.state.examHistory[0]).toEqual(state.examHistory[0]);
  });
});

describe("backup validation before destructive restore", () => {
  it.each(["{", "null", "[]", "true"])("rejects malformed JSON/root %j without writes", (text) => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(parseProgressBackup(text, COURSE).ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([{ kind: "another-app" }, { version: 3 }, { version: "2" }, { courseId: OTHER }])("rejects wrong app/version/course %#", (invalid) => {
    const before = snapshot();
    expect(parseProgressBackup(JSON.stringify({ ...buildProgressBackup(COURSE, state), ...invalid }), COURSE).ok).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it("identifies a wrong-course backup explicitly", () => {
    expect(parseProgressBackup(serializeProgressBackup(COURSE, state), OTHER)).toEqual({ ok: false, error: "That backup belongs to a different course." });
  });

  it.each([
    { stats: null }, { stats: [] }, { stats: { 0: { seen: 1, correct: 0 } } },
    { stats: { invalid: { seen: 1, correct: 0 } } }, { stats: { 1: { seen: -1, correct: 0 } } },
    { stats: { 1: { seen: 1.5, correct: 0 } } }, { stats: { 1: { seen: 1, correct: 2 } } },
    { stats: { 1: { seen: 1, correct: 0, lastCorrect: "false" } } },
    { wrong: [0] }, { masteredWrong: ["1"] }, { wrong: null }, { examHistory: null },
    { examHistory: [{ ...state.examHistory[0], date: "not a date" }] },
    { examHistory: [{ ...state.examHistory[0], raw: 9 }] },
    { examHistory: [{ ...state.examHistory[0], total: 0 }] },
    { examHistory: [{ ...state.examHistory[0], percent: 101 }] },
  ])("rejects malformed progress rather than silently normalizing it %#", (invalid) => {
    const backup = buildProgressBackup(COURSE, state);
    expect(parseProgressBackup(JSON.stringify({ ...backup, progress: { ...backup.progress, ...invalid } }), COURSE).ok).toBe(false);
  });

  it.each([
    undefined, null, [], { 1: { ...state.reviews[1], dueAt: -1 } },
    { 1: { ...state.reviews[1], lastReviewedAt: "now" } },
    { 1: { ...state.reviews[1], successfulReviews: 1.5 } },
    { 1: { ...state.reviews[1], intervalDays: 31 } },
    { 1: { ...state.reviews[1], reason: "mastered" } }, { 1: { dueAt: NOW } },
    { 0: state.reviews[1] },
  ].map((reviews) => ({ reviews })))("rejects malformed v2 review schedules %#", ({ reviews }) => {
    const backup = buildProgressBackup(COURSE, state);
    expect(parseProgressBackup(JSON.stringify({ ...backup, progress: { ...backup.progress, reviews } }), COURSE).ok).toBe(false);
  });

  it.each([
    undefined, null, { version: 2, sets: {} }, { version: 1, sets: [] },
    { version: 1, sets: { loops: { attempts: -1, solved: false, lastAt: DATE } } },
    { version: 1, sets: { loops: { attempts: 1, solved: "yes", lastAt: DATE } } },
    { version: 1, sets: { loops: { attempts: 1, solved: true, lastAt: "invalid" } } },
  ].map((labProgress) => ({ labProgress })))("rejects missing or malformed v2 lab results %#", ({ labProgress }) => {
    expect(parseProgressBackup(JSON.stringify({ ...buildProgressBackup(COURSE, state), labProgress }), COURSE).ok).toBe(false);
  });

  it.each([
    undefined, null, [], { loops: { ...drafts["loops-2"], revealed: ["2"] } },
    { loops: { ...drafts["loops-2"], revealed: [2, 2] } },
    { loops: { ...drafts["loops-2"], values: { 1: 42 } } },
    { loops: { ...drafts["loops-2"], updatedAt: -1 } },
    { loops: { ...drafts["loops-2"], fingerprint: "" } },
    { constructor: drafts["loops-2"] },
  ].map((labDrafts) => ({ labDrafts })))("rejects malformed assisted drafts rather than silently clearing assistance %#", ({ labDrafts }) => {
    expect(parseProgressBackup(JSON.stringify({ ...buildProgressBackup(COURSE, state), labDrafts }), COURSE).ok).toBe(false);
  });
});

describe("course-scoped transactional restore", () => {
  it("clears only this course's sessions/results, preserving other courses, preferences and unrelated keys", () => {
    const parsed = parsedBackup();
    for (const id of [COURSE, OTHER, `${COURSE}-extra`]) {
      seedSessions(id);
      localStorage.setItem(`${prefix(id)}progress`, `${id} progress`);
      localStorage.setItem(`hub.v1.lab.${id}`, `${id} labs`);
      localStorage.setItem(`hub.v1.lab-drafts.${id}`, `${id} drafts`);
    }
    localStorage.setItem("hub.v1.preferences", "display preferences");
    localStorage.setItem(`${prefix(COURSE)}unrelated`, "keep course metadata");
    localStorage.setItem("external-app", "untouched");
    const before = snapshot();
    const parsedBefore = JSON.stringify(parsed);
    expect(restoreProgressBackup(COURSE, parsed)).toBe(true);
    const expected = { ...before,
      [`${prefix(COURSE)}progress`]: JSON.stringify(state),
      [`hub.v1.lab.${COURSE}`]: JSON.stringify(labs),
      [`hub.v1.lab-drafts.${COURSE}`]: JSON.stringify(drafts),
    };
    for (const suffix of sessionSuffixes) delete expected[`${prefix(COURSE)}${suffix}`];
    expect(snapshot()).toEqual(expected);
    expect(JSON.stringify(parsed)).toBe(parsedBefore);
  });

  it.each([
    ["progress", "setItem", `${prefix(COURSE)}progress`],
    ["lab results", "setItem", `hub.v1.lab.${COURSE}`],
    ["lab drafts", "setItem", `hub.v1.lab-drafts.${COURSE}`],
    ...sessionSuffixes.map((suffix) => [suffix, "removeItem", `${prefix(COURSE)}${suffix}`]),
  ])("rolls back the entire restore when writing/removing %s fails", (_label, method, failingKey) => {
    const parsed = parsedBackup();
    seedSessions(COURSE);
    seedSessions(OTHER);
    localStorage.setItem(`${prefix(COURSE)}progress`, "old progress bytes");
    localStorage.setItem(`hub.v1.lab.${COURSE}`, "old lab bytes");
    localStorage.setItem(`hub.v1.lab-drafts.${COURSE}`, "old draft bytes");
    const before = snapshot();
    const realSet = Storage.prototype.setItem;
    const realRemove = Storage.prototype.removeItem;
    let failed = false;
    const failOnce = (key: string) => {
      if (key === failingKey && !failed) {
        failed = true;
        throw new Error("quota or blocked storage");
      }
    };
    if (method === "setItem") {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
        failOnce(key);
        realSet.call(this, key, value);
      });
    } else {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
        failOnce(key);
        realRemove.call(this, key);
      });
    }
    const notify = vi.spyOn(window, "dispatchEvent");
    expect(restoreProgressBackup(COURSE, parsed)).toBe(false);
    expect(failed).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(notify.mock.calls.map(([event]) => event.type)).toEqual(["hub-storage-error"]);
  });

  it("removes newly created restore keys on rollback instead of leaving partial lab data", () => {
    const parsed = parsedBackup();
    localStorage.clear();
    seedSessions(COURSE);
    const before = snapshot();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => { throw new Error("blocked"); });
    expect(restoreProgressBackup(COURSE, parsed)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it("preserves existing state if storage fails while taking the initial snapshot", () => {
    const parsed = parsedBackup();
    seedSessions(COURSE);
    const before = snapshot();
    const failure = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(restoreProgressBackup(COURSE, parsed)).toBe(false);
    failure.mockRestore();
    expect(snapshot()).toEqual(before);
  });
});
