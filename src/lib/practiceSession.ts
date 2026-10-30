import type { AnswerSource } from "./storage";
import type { Question } from "../types";
import { sameSet } from "./grading";
import { readStored, writeStored } from "./persistence";

const KEY_PREFIX = "hub.v1.course.";
const KEY_SUFFIX = ".practice";
const VERSION = 1;

export interface PracticeAnswer {
  letters: string[];
}

export interface PracticeSession {
  version: 1;
  label: string;
  source: Exclude<AnswerSource, "exam">;
  questionIds: number[];
  index: number;
  answers: Record<number, PracticeAnswer>;
  revealed: number[];
  startedAt: number;
}

export const EMPTY_PRACTICE_ANSWER: PracticeAnswer = { letters: [] };

function key(courseId: string): string {
  return `${KEY_PREFIX}${courseId}${KEY_SUFFIX}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function normalizeAnswer(value: unknown): PracticeAnswer | null {
  if (!isRecord(value) || !Array.isArray(value.letters)) return null;
  if (!value.letters.every((letter) => typeof letter === "string")) return null;
  return { letters: value.letters };
}

export function loadPracticeSession(courseId: string): PracticeSession | null {
  try {
    const raw = readStored(key(courseId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== VERSION) return null;
    if (typeof parsed.label !== "string" || !parsed.label.trim()) return null;
    if (parsed.source !== "practice" && parsed.source !== "review") return null;
    if (!Array.isArray(parsed.questionIds) || parsed.questionIds.length === 0) return null;
    if (!parsed.questionIds.every(isPositiveId)) return null;
    if (!isRecord(parsed.answers)) return null;
    if (!Array.isArray(parsed.revealed) || !parsed.revealed.every(isPositiveId)) return null;
    if (typeof parsed.index !== "number" || !Number.isFinite(parsed.index)) return null;
    if (typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) return null;

    const questionIds = parsed.questionIds as number[];
    const idSet = new Set(questionIds);
    const answers: Record<number, PracticeAnswer> = {};
    for (const [entry, value] of Object.entries(parsed.answers)) {
      const id = Number(entry);
      if (!Number.isInteger(id) || !idSet.has(id)) return null;
      const answer = normalizeAnswer(value);
      if (!answer) return null;
      answers[id] = answer;
    }

    return {
      version: VERSION,
      label: parsed.label,
      source: parsed.source,
      questionIds,
      index: Math.max(0, Math.min(questionIds.length - 1, Math.floor(parsed.index))),
      answers,
      revealed: [...new Set(parsed.revealed.filter((id) => idSet.has(id)))],
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function savePracticeSession(courseId: string, session: PracticeSession) {
  return writeStored(key(courseId), JSON.stringify(session));
}

export function clearPracticeSession(courseId: string) {
  return writeStored(key(courseId), null);
}

/** Score is derived from revealed answers so a resumed quiz cannot drift from storage. */
export function practiceScore(
  session: PracticeSession,
  questionById: ReadonlyMap<number, Question>
): { score: number; answered: number } {
  let score = 0;
  for (const id of session.revealed) {
    const question = questionById.get(id);
    if (!question) continue;
    const answer = session.answers[id] ?? EMPTY_PRACTICE_ANSWER;
    if (sameSet(answer.letters, question.answer)) score += 1;
  }
  return { score, answered: session.revealed.length };
}
