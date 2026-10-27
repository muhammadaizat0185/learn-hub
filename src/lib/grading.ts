import type { ExamAnswer, Question } from "../types";

export interface GradedResult {
  q: Question;
  answer: ExamAnswer;
  correct: boolean;
}

export interface ExamSummary {
  graded: GradedResult[];
  raw: number;
  total: number;
  percent: number;
  passed: boolean;
  passPercent: number;
  autoSubmitted: boolean;
}

const EMPTY_ANSWER: ExamAnswer = { letters: [] };

export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export function isAnswered(answer: ExamAnswer | undefined): boolean {
  return !!answer && answer.letters.length > 0;
}

export function gradeExam(
  questions: Question[],
  answers: Record<number, ExamAnswer>
): GradedResult[] {
  return questions.map((q) => {
    const answer = answers[q.id] ?? EMPTY_ANSWER;
    return { q, answer, correct: sameSet(answer.letters, q.answer) };
  });
}

export function percentScore(raw: number, total: number): number {
  if (total <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, raw / total));
  return Math.round(ratio * 100);
}

export function isPass(percent: number, passPercent: number): boolean {
  return percent >= passPercent;
}

export function remainingSeconds(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
