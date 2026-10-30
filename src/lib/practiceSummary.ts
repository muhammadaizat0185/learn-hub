import type { Question } from "../types";
import type { PracticeSession } from "./practiceSession";
import { sameSet } from "./grading";
import { readStored, writeStored } from "./persistence";

export interface PracticeSummary {
  version: 1;
  label: string;
  startedAt: number;
  finishedAt: number;
  correctIds: number[];
  missedIds: number[];
  uncheckedIds: number[];
}
const key = (id: string) => `hub.v1.course.${id}.summary`;

export function buildPracticeSummary(session: PracticeSession, questions: ReadonlyMap<number, Question>, now = Date.now()): PracticeSummary {
  const summary: PracticeSummary = { version: 1, label: session.label, startedAt: session.startedAt, finishedAt: now, correctIds: [], missedIds: [], uncheckedIds: [] };
  for (const id of session.questionIds) {
    const question = questions.get(id);
    if (!question) continue;
    if (!session.revealed.includes(id)) summary.uncheckedIds.push(id);
    else if (sameSet(session.answers[id]?.letters ?? [], question.answer)) summary.correctIds.push(id);
    else summary.missedIds.push(id);
  }
  return summary;
}
export function savePracticeSummary(courseId: string, summary: PracticeSummary) { return writeStored(key(courseId), JSON.stringify(summary)); }
export function clearPracticeSummary(courseId: string) { writeStored(key(courseId), null); }
export function loadPracticeSummary(courseId: string): PracticeSummary | null {
  try {
    const text = readStored(key(courseId));
    if (!text) return null;
    const value = JSON.parse(text) as PracticeSummary;
    if (!value || value.version !== 1 || typeof value.label !== "string" || !Number.isFinite(value.startedAt) || !Number.isFinite(value.finishedAt)) return null;
    if (![value.correctIds, value.missedIds, value.uncheckedIds].every((ids) => Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0))) return null;
    return value;
  } catch { return null; }
}
