import { load, normalizeReviews, normalizeState } from "./storage";
import type { StoredState } from "./storage";
import { loadLabProgress, normalizeLabProgress } from "./lab";
import type { LabProgress } from "./lab";
import { loadLabDrafts, normalizeLabDrafts } from "./labDrafts";
import type { LabDrafts } from "./labDrafts";
import { writeTransaction } from "./persistence";

export const BACKUP_KIND = "learn-hub-progress";
export const BACKUP_VERSION = 2;
export interface ProgressBackup {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  app: "Learn Course Hub";
  courseId: string;
  exportedAt: string;
  progress: StoredState;
  labProgress: LabProgress;
  labDrafts: LabDrafts;
}
export type BackupParseResult =
  | { ok: true; state: StoredState; labProgress: LabProgress | null; labDrafts: LabDrafts | null }
  | { ok: false; error: string };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isCount(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function invalid(error: string): BackupParseResult { return { ok: false, error }; }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function buildProgressBackup(courseId: string, state: StoredState = load(courseId), now = new Date()): ProgressBackup {
  return { kind: BACKUP_KIND, version: BACKUP_VERSION, app: "Learn Course Hub", courseId, exportedAt: now.toISOString(), progress: normalizeState(state), labProgress: loadLabProgress(courseId), labDrafts: loadLabDrafts(courseId) };
}
export function serializeProgressBackup(courseId: string, state: StoredState = load(courseId), now = new Date()): string { return JSON.stringify(buildProgressBackup(courseId, state, now), null, 2); }
export function progressBackupFilename(courseId: string, now = new Date()): string { return `learn-${courseId}-progress-${now.toISOString().slice(0, 10)}.json`; }
export function downloadProgressBackup(courseId: string, state: StoredState = load(courseId), now = new Date()): string {
  const filename = progressBackupFilename(courseId, now);
  const url = URL.createObjectURL(new Blob([serializeProgressBackup(courseId, state, now)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}
/** Validate the entire file before showing the destructive restore confirmation. */
export function parseProgressBackup(text: string, courseId: string): BackupParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return invalid("That file is not valid JSON."); }
  if (!isRecord(parsed)) return invalid("That file is not a progress backup.");
  if (parsed.kind !== BACKUP_KIND) return invalid("That file was not exported by this course hub.");
  if (parsed.version !== 1 && parsed.version !== BACKUP_VERSION) return invalid(`Unsupported backup version: ${String(parsed.version)}.`);
  if (parsed.courseId !== courseId) return invalid("That backup belongs to a different course.");
  const progress = parsed.progress;
  if (!isRecord(progress) || !isRecord(progress.stats)) return invalid("The backup's question stats are missing.");
  for (const [entry, value] of Object.entries(progress.stats)) {
    const id = Number(entry);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) return invalid(`Invalid question record: ${entry}.`);
    if (!isCount(value.seen) || !isCount(value.correct) || value.correct > value.seen) return invalid(`Q${id} has invalid attempt counts.`);
    if (value.lastCorrect !== undefined && typeof value.lastCorrect !== "boolean") return invalid(`Q${id} has an invalid last result.`);
  }
  for (const field of ["wrong", "masteredWrong"] as const) {
    const ids = progress[field];
    if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) return invalid(`The backup's ${field} list is invalid.`);
  }
  if (!Array.isArray(progress.examHistory)) return invalid("The backup's exam history is invalid.");
  for (const entry of progress.examHistory) {
    if (!isRecord(entry) || typeof entry.date !== "string" || !Number.isFinite(Date.parse(entry.date))) return invalid("An exam history entry has an invalid date.");
    if (typeof entry.raw !== "number" || !Number.isFinite(entry.raw) || entry.raw < 0 || !isCount(entry.total) || entry.total <= 0 || entry.raw > entry.total) return invalid("An exam history entry has an invalid score.");
    if (entry.percent !== undefined && (typeof entry.percent !== "number" || !Number.isFinite(entry.percent) || entry.percent < 0 || entry.percent > 100)) return invalid("An exam history entry has an invalid percentage.");
  }
  if (parsed.version === 1) return { ok: true, state: normalizeState(progress), labProgress: null, labDrafts: null };
  if (!isRecord(progress.reviews) || stable(normalizeReviews(progress.reviews)) !== stable(progress.reviews)) return invalid("The backup's review schedule is invalid.");
  if (!isRecord(parsed.labProgress) || parsed.labProgress.version !== 1 || !isRecord(parsed.labProgress.sets)) return invalid("The backup's lab results are missing.");
  const labProgress = normalizeLabProgress(parsed.labProgress);
  if (stable(labProgress) !== stable(parsed.labProgress)) return invalid("The backup's lab results are invalid.");
  if (!isRecord(parsed.labDrafts)) return invalid("The backup's lab drafts are missing.");
  const labDrafts = normalizeLabDrafts(parsed.labDrafts);
  if (stable(labDrafts) !== stable(parsed.labDrafts)) return invalid("The backup's lab drafts are invalid.");
  return { ok: true, state: normalizeState(progress), labProgress, labDrafts };
}

export function restoreProgressBackup(courseId: string, parsed: Extract<BackupParseResult, { ok: true }>): boolean {
  const prefix = `hub.v1.course.${courseId}.`;
  const entries: [string, string | null][] = [[`${prefix}progress`, JSON.stringify(parsed.state)]];
  if (parsed.labProgress) entries.push([`hub.v1.lab.${courseId}`, JSON.stringify(parsed.labProgress)]);
  if (parsed.labDrafts) entries.push([`hub.v1.lab-drafts.${courseId}`, JSON.stringify(parsed.labDrafts)]);
  for (const suffix of ["practice", "exam", "summary", "exam-result"]) entries.push([`${prefix}${suffix}`, null]);
  return writeTransaction(entries);
}
