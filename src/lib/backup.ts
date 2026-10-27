import { load, normalizeState } from "./storage";
import type { ExamHistoryEntry, QStats, StoredState } from "./storage";

export const BACKUP_KIND = "learn-hub-progress";
export const BACKUP_VERSION = 1;

export interface ProgressBackup {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  app: "Learn Course Hub";
  courseId: string;
  exportedAt: string;
  progress: {
    stats: Record<string, QStats>;
    wrong: number[];
    masteredWrong: number[];
    examHistory: ExamHistoryEntry[];
  };
}

export type BackupParseResult =
  | { ok: true; state: StoredState }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function invalid(error: string): BackupParseResult {
  return { ok: false, error };
}

export function buildProgressBackup(
  courseId: string,
  state: StoredState = load(courseId),
  now: Date = new Date()
): ProgressBackup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    app: "Learn Course Hub",
    courseId,
    exportedAt: now.toISOString(),
    // Sessions are deliberately absent: a backup restores progress, never a timed exam.
    progress: {
      stats: state.stats,
      wrong: state.wrong,
      masteredWrong: state.masteredWrong,
      examHistory: state.examHistory,
    },
  };
}

export function serializeProgressBackup(
  courseId: string,
  state: StoredState = load(courseId),
  now: Date = new Date()
): string {
  return JSON.stringify(buildProgressBackup(courseId, state, now), null, 2);
}

export function progressBackupFilename(courseId: string, now: Date = new Date()): string {
  return `learn-${courseId}-progress-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadProgressBackup(
  courseId: string,
  state: StoredState = load(courseId),
  now: Date = new Date()
): string {
  const filename = progressBackupFilename(courseId, now);
  const blob = new Blob([serializeProgressBackup(courseId, state, now)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}

/** Validates a backup before anything is written; the caller confirms the replace. */
export function parseProgressBackup(text: string, courseId: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid("That file is not valid JSON.");
  }
  if (!isRecord(parsed)) return invalid("That file is not a progress backup.");
  if (parsed.kind !== BACKUP_KIND) return invalid("That file was not exported by this course hub.");
  if (parsed.version !== BACKUP_VERSION) {
    return invalid(`Unsupported backup version: ${String(parsed.version)}.`);
  }
  if (parsed.courseId !== courseId) {
    return invalid("That backup belongs to a different course.");
  }

  const progress = parsed.progress;
  if (!isRecord(progress)) return invalid("The backup has no progress data.");
  if (!isRecord(progress.stats)) return invalid("The backup's stats are missing.");

  for (const [entry, value] of Object.entries(progress.stats)) {
    const id = Number(entry);
    if (!Number.isInteger(id) || id <= 0) return invalid(`Invalid question id in stats: ${entry}.`);
    if (!isRecord(value)) return invalid(`Invalid stats for Q${id}.`);
    if (!isCount(value.seen) || !isCount(value.correct)) {
      return invalid(`Q${id} has invalid attempt counts.`);
    }
    if (value.lastCorrect !== undefined && typeof value.lastCorrect !== "boolean") {
      return invalid(`Q${id} has an invalid last result.`);
    }
  }

  for (const field of ["wrong", "masteredWrong"] as const) {
    const ids = progress[field];
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0)) {
      return invalid(`The backup's ${field} list is invalid.`);
    }
  }

  const history = progress.examHistory;
  if (!Array.isArray(history)) return invalid("The backup's exam history is invalid.");
  for (const entry of history) {
    if (!isRecord(entry) || typeof entry.date !== "string") {
      return invalid("An exam history entry has no date.");
    }
    if (typeof entry.raw !== "number" || entry.raw < 0) {
      return invalid("An exam history entry has an invalid score.");
    }
    if (typeof entry.total !== "number" || entry.total <= 0) {
      return invalid("An exam history entry has an invalid question count.");
    }
    if (
      entry.percent !== undefined &&
      (typeof entry.percent !== "number" || entry.percent < 0 || entry.percent > 100)
    ) {
      return invalid("An exam history entry has an invalid percentage.");
    }
  }

  return { ok: true, state: normalizeState(progress) };
}
