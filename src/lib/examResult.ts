import type { CourseData, ExamAnswer } from "../types";
import { gradeExam, isPass, percentScore } from "./grading";
import type { ExamSummary } from "./grading";
import { readStored, writeStored } from "./persistence";

const key = (id: string) => `hub.v1.course.${id}.exam-result`;
export function saveExamResult(courseId: string, summary: ExamSummary) {
  writeStored(key(courseId), JSON.stringify({
    version: 1, questionIds: summary.graded.map(({ q }) => q.id),
    answers: Object.fromEntries(summary.graded.map(({ q, answer }) => [q.id, answer])),
    autoSubmitted: summary.autoSubmitted, passPercent: summary.passPercent,
  }));
}
export function clearExamResult(courseId: string) { writeStored(key(courseId), null); }
export function loadExamResult(data: CourseData): ExamSummary | null {
  try {
    const text = readStored(key(data.meta.id));
    if (!text) return null;
    const saved = JSON.parse(text);
    if (saved?.version !== 1 || !Array.isArray(saved.questionIds) || !saved.questionIds.length || !saved.answers || typeof saved.answers !== "object") return null;
    if (!saved.questionIds.every((id: number) => Number.isSafeInteger(id) && data.questionById.has(id)) || new Set(saved.questionIds).size !== saved.questionIds.length) return null;
    const answers: Record<number, ExamAnswer> = {};
    for (const id of saved.questionIds as number[]) {
      const value = saved.answers[id];
      if (!value || !Array.isArray(value.letters) || !value.letters.every((letter: unknown) => typeof letter === "string")) return null;
      answers[id] = { letters: value.letters };
    }
    const graded = gradeExam((saved.questionIds as number[]).map((id) => data.questionById.get(id)!), answers);
    const raw = graded.filter((item) => item.correct).length;
    const percent = percentScore(raw, graded.length);
    const passPercent = typeof saved.passPercent === "number" && saved.passPercent >= 0 && saved.passPercent <= 100 ? saved.passPercent : data.meta.exam.passPercent;
    return { graded, raw, total: graded.length, percent, passed: isPass(percent, passPercent), passPercent, autoSubmitted: saved.autoSubmitted === true };
  } catch { return null; }
}
