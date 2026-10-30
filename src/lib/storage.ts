import { percentScore } from "./grading";
import { readStored, writeStored } from "./persistence";

const VERSION = 2;
export const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 14, 30];

export interface QStats { seen: number; correct: number; lastCorrect?: boolean }
export interface ReviewSchedule {
  dueAt: number;
  lastReviewedAt: number | null;
  successfulReviews: number;
  intervalDays: number;
  reason: "practice" | "mistake" | "unanswered" | "legacy";
}
export interface ExamHistoryEntry { date: string; raw: number; total: number; percent: number; passed: boolean }
export interface StoredState {
  version: number;
  stats: Record<number, QStats>;
  wrong: number[];
  // Preserved for old backups, not presented as evidence of durable mastery.
  masteredWrong: number[];
  reviews: Record<number, ReviewSchedule>;
  examHistory: ExamHistoryEntry[];
}
export type AnswerSource = "practice" | "review" | "exam";

function key(courseId: string) { return `hub.v1.course.${courseId}.progress`; }
function emptyState(): StoredState {
  return { version: VERSION, stats: {}, wrong: [], masteredWrong: [], reviews: {}, examHistory: [] };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
function normalizeStats(raw: unknown): Record<number, QStats> {
  if (!isRecord(raw)) return {};
  const stats: Record<number, QStats> = {};
  for (const [entry, value] of Object.entries(raw)) {
    const id = Number(entry);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) continue;
    const seen = count(value.seen);
    const stat: QStats = { seen, correct: Math.min(count(value.correct), seen) };
    if (typeof value.lastCorrect === "boolean") stat.lastCorrect = value.lastCorrect;
    stats[id] = stat;
  }
  return stats;
}
function normalizeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is number => Number.isSafeInteger(id) && id > 0))];
}
function normalizeHistory(raw: unknown): ExamHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const history: ExamHistoryEntry[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.date !== "string") continue;
    const total = count(entry.total);
    if (total <= 0 || typeof entry.raw !== "number" || !Number.isFinite(entry.raw) || entry.raw < 0) continue;
    const score = Math.min(entry.raw, total);
    const percent = typeof entry.percent === "number" && Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100
      ? Math.round(entry.percent) : percentScore(score, total);
    history.push({ date: entry.date, raw: score, total, percent, passed: entry.passed === true });
  }
  return history.slice(-20);
}
export function normalizeReviews(raw: unknown): Record<number, ReviewSchedule> {
  if (!isRecord(raw)) return {};
  const reviews: Record<number, ReviewSchedule> = {};
  for (const [entry, value] of Object.entries(raw)) {
    const id = Number(entry);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) continue;
    if (typeof value.dueAt !== "number" || !Number.isFinite(value.dueAt) || value.dueAt < 0) continue;
    const last = value.lastReviewedAt;
    reviews[id] = {
      dueAt: value.dueAt,
      lastReviewedAt: typeof last === "number" && Number.isFinite(last) && last >= 0 ? last : null,
      successfulReviews: Math.min(100, count(value.successfulReviews)),
      intervalDays: Math.min(30, count(value.intervalDays)),
      reason: value.reason === "mistake" || value.reason === "unanswered" || value.reason === "practice" ? value.reason : "legacy",
    };
  }
  return reviews;
}
export function normalizeState(parsed: unknown): StoredState {
  if (!isRecord(parsed)) return emptyState();
  const stats = normalizeStats(parsed.stats);
  const wrong = normalizeIds(parsed.wrong);
  const reviews = normalizeReviews(parsed.reviews);
  // Preserve old counts without inventing spaced successes from single or manual clears.
  for (const id of new Set([...Object.keys(stats).map(Number), ...wrong])) {
    if (!reviews[id]) reviews[id] = { dueAt: 0, lastReviewedAt: null, successfulReviews: 0, intervalDays: 0, reason: "legacy" };
  }
  return { version: VERSION, stats, wrong, masteredWrong: normalizeIds(parsed.masteredWrong), reviews, examHistory: normalizeHistory(parsed.examHistory) };
}
export function load(courseId: string): StoredState {
  try { const raw = readStored(key(courseId)); return raw ? normalizeState(JSON.parse(raw)) : emptyState(); }
  catch { return emptyState(); }
}
export function save(courseId: string, state: StoredState): boolean {
  return writeStored(key(courseId), JSON.stringify(state));
}
export function lastAttemptCorrect(stat: QStats): boolean {
  return stat.lastCorrect ?? (stat.seen > 0 && stat.correct >= Math.ceil(stat.seen / 2));
}
export function dueReviewIds(state: StoredState, now = Date.now()): number[] {
  return Object.entries(state.reviews).filter(([, item]) => item.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt || Number(a[0]) - Number(b[0]))
    .map(([id]) => Number(id));
}
export function reviewStatus(review: ReviewSchedule | undefined): string {
  if (!review) return "Not practised yet";
  if (review.reason === "unanswered") return "Not attempted in exam";
  if (review.reason === "legacy" && review.lastReviewedAt === null) return "Earlier progress · check recall";
  if (review.successfulReviews >= 3) return "Recalled over time";
  return review.successfulReviews > 0 ? "Learning · correct once or twice" : "Needs another try";
}
export function recordAnswer(courseId: string, qid: number, isCorrect: boolean, source: AnswerSource = "practice", now = Date.now()) {
  const state = load(courseId);
  const stat = state.stats[qid] ?? { seen: 0, correct: 0 };
  stat.seen += 1;
  if (isCorrect) stat.correct += 1;
  stat.lastCorrect = isCorrect;
  state.stats[qid] = stat;
  const previous = state.reviews[qid];
  if (!isCorrect) {
    if (!state.wrong.includes(qid)) state.wrong.push(qid);
    state.masteredWrong = state.masteredWrong.filter((id) => id !== qid);
    state.reviews[qid] = { dueAt: now, lastReviewedAt: now, successfulReviews: 0, intervalDays: 0, reason: "mistake" };
  } else if (!previous || previous.dueAt <= now) {
    const successfulReviews = (previous?.successfulReviews ?? 0) + 1;
    const intervalDays = INTERVALS[Math.min(successfulReviews - 1, INTERVALS.length - 1)];
    state.reviews[qid] = { dueAt: now + intervalDays * DAY, lastReviewedAt: now, successfulReviews, intervalDays, reason: "practice" };
    if (source === "review" && successfulReviews >= 3 && state.wrong.includes(qid) && !state.masteredWrong.includes(qid)) state.masteredWrong.push(qid);
  }
  // Early replays count as practice but cannot inflate spaced recall or postpone due dates.
  save(courseId, state);
  return state;
}
export function recordUnanswered(courseId: string, qid: number, now = Date.now()) {
  const state = load(courseId);
  state.reviews[qid] = { dueAt: now, lastReviewedAt: null, successfulReviews: 0, intervalDays: 0, reason: "unanswered" };
  state.masteredWrong = state.masteredWrong.filter((id) => id !== qid);
  save(courseId, state);
}
export function snoozeReview(courseId: string, qids: number[], now = Date.now()) {
  const state = load(courseId);
  for (const id of qids) {
    const review = state.reviews[id];
    if (review) state.reviews[id] = { ...review, dueAt: now + DAY };
  }
  save(courseId, state);
  return state;
}
export function addExamResult(courseId: string, entry: ExamHistoryEntry) {
  const state = load(courseId);
  state.examHistory.push(entry);
  state.examHistory = state.examHistory.slice(-20);
  save(courseId, state);
  return state;
}
export function resetProgress(courseId: string) { save(courseId, emptyState()); }
