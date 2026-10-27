import { percentScore } from "./grading";

const KEY_PREFIX = "hub.v1.course.";
const KEY_SUFFIX = ".progress";
const VERSION = 1;

export interface QStats {
  seen: number;
  correct: number;
  lastCorrect?: boolean;
}

export interface ExamHistoryEntry {
  date: string;
  raw: number;
  total: number;
  percent: number;
  passed: boolean;
}

export interface StoredState {
  version: number;
  stats: Record<number, QStats>;
  wrong: number[];
  masteredWrong: number[];
  examHistory: ExamHistoryEntry[];
}

export type AnswerSource = "practice" | "review" | "exam";

function key(courseId: string): string {
  return `${KEY_PREFIX}${courseId}${KEY_SUFFIX}`;
}

function emptyState(): StoredState {
  return {
    version: VERSION,
    stats: {},
    wrong: [],
    masteredWrong: [],
    examHistory: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStats(raw: unknown): Record<number, QStats> {
  if (!isRecord(raw)) return {};
  const stats: Record<number, QStats> = {};
  for (const [entry, value] of Object.entries(raw)) {
    const id = Number(entry);
    if (!Number.isInteger(id) || id <= 0 || !isRecord(value)) continue;
    const seen = typeof value.seen === "number" && value.seen >= 0 ? Math.floor(value.seen) : 0;
    const correct =
      typeof value.correct === "number" && value.correct >= 0 ? Math.floor(value.correct) : 0;
    const stat: QStats = { seen, correct: Math.min(correct, seen) };
    if (typeof value.lastCorrect === "boolean") stat.lastCorrect = value.lastCorrect;
    stats[id] = stat;
  }
  return stats;
}

function normalizeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is number => Number.isInteger(id) && id > 0))];
}

function normalizeHistory(raw: unknown): ExamHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const history: ExamHistoryEntry[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.date !== "string") continue;
    const total = entry.total;
    if (typeof total !== "number" || total <= 0) continue;
    const score = typeof entry.raw === "number" && entry.raw >= 0 ? entry.raw : null;
    if (score === null) continue;
    const percent =
      typeof entry.percent === "number" && entry.percent >= 0 && entry.percent <= 100
        ? Math.round(entry.percent)
        : percentScore(score, total);
    history.push({
      date: entry.date,
      raw: score,
      total,
      percent,
      passed: entry.passed === true,
    });
  }
  return history.slice(-20);
}

export function normalizeState(parsed: unknown): StoredState {
  if (!isRecord(parsed)) return emptyState();
  return {
    version: VERSION,
    stats: normalizeStats(parsed.stats),
    wrong: normalizeIds(parsed.wrong),
    masteredWrong: normalizeIds(parsed.masteredWrong),
    examHistory: normalizeHistory(parsed.examHistory),
  };
}

export function load(courseId: string): StoredState {
  try {
    const raw = localStorage.getItem(key(courseId));
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function save(courseId: string, state: StoredState) {
  localStorage.setItem(key(courseId), JSON.stringify(state));
}

export function lastAttemptCorrect(stat: QStats): boolean {
  // Older saves have no lastCorrect; fall back to the old majority heuristic.
  return stat.lastCorrect ?? stat.correct >= Math.ceil(stat.seen / 2);
}

export function recordAnswer(
  courseId: string,
  qid: number,
  isCorrect: boolean,
  source: AnswerSource = "practice"
) {
  const state = load(courseId);
  const stat = state.stats[qid] ?? { seen: 0, correct: 0 };
  stat.seen += 1;
  if (isCorrect) stat.correct += 1;
  stat.lastCorrect = isCorrect;
  state.stats[qid] = stat;

  const wasWrong = state.wrong.includes(qid);

  if (!isCorrect) {
    if (!wasWrong) state.wrong.push(qid);
    state.masteredWrong = state.masteredWrong.filter((id) => id !== qid);
  } else if (source === "review" && wasWrong && !state.masteredWrong.includes(qid)) {
    // One correct review answer masters a missed question; do not add a pass threshold.
    state.masteredWrong.push(qid);
  }

  save(courseId, state);
  return state;
}

export function markWrongMastered(courseId: string, qids: number[]) {
  const state = load(courseId);
  for (const qid of qids) {
    if (!state.masteredWrong.includes(qid)) state.masteredWrong.push(qid);
  }
  save(courseId, state);
  return state;
}

export function addExamResult(courseId: string, entry: ExamHistoryEntry) {
  const state = load(courseId);
  state.examHistory.push(entry);
  if (state.examHistory.length > 20) state.examHistory = state.examHistory.slice(-20);
  save(courseId, state);
  return state;
}

export function resetProgress(courseId: string) {
  save(courseId, emptyState());
}
