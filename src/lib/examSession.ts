import type { ExamAnswer } from "../types";
import { readStored, writeStored } from "./persistence";

const KEY_PREFIX = "hub.v1.course.";
const KEY_SUFFIX = ".exam";
const VERSION = 1;

export interface ExamSession {
  version: 1;
  questionIds: number[];
  answers: Record<number, ExamAnswer>;
  index: number;
  startedAt: number;
  deadline: number;
  flags: number[];
}

function key(courseId: string): string {
  return `${KEY_PREFIX}${courseId}${KEY_SUFFIX}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadExamSession(courseId: string): ExamSession | null {
  try {
    const raw = readStored(key(courseId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== VERSION) return null;
    if (!Array.isArray(parsed.questionIds) || parsed.questionIds.length === 0) return null;
    if (!parsed.questionIds.every((id) => Number.isInteger(id) && (id as number) > 0)) return null;
    if (!isRecord(parsed.answers)) return null;
    if (typeof parsed.startedAt !== "number" || typeof parsed.deadline !== "number") return null;
    if (typeof parsed.index !== "number" || !Number.isFinite(parsed.index)) return null;

    const answers: Record<number, ExamAnswer> = {};
    for (const [entry, value] of Object.entries(parsed.answers)) {
      const id = Number(entry);
      if (!Number.isInteger(id) || !isRecord(value) || !Array.isArray(value.letters)) return null;
      answers[id] = {
        letters: value.letters.filter(
          (letter): letter is string => typeof letter === "string"
        ),
      };
    }

    const questionIds = parsed.questionIds as number[];
    const idSet = new Set(questionIds);
    const flags = Array.isArray(parsed.flags)
      ? [
          ...new Set(
            parsed.flags.filter(
              (id): id is number => Number.isInteger(id) && idSet.has(id as number)
            )
          ),
        ]
      : [];
    return {
      version: VERSION,
      questionIds,
      answers,
      index: Math.max(0, Math.min(questionIds.length - 1, Math.floor(parsed.index))),
      startedAt: parsed.startedAt,
      deadline: parsed.deadline,
      flags,
    };
  } catch {
    return null;
  }
}

export function saveExamSession(courseId: string, session: ExamSession) {
  return writeStored(key(courseId), JSON.stringify(session));
}

export function clearExamSession(courseId: string) {
  return writeStored(key(courseId), null);
}
