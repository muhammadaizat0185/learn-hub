export interface Option {
  letter: string;
  text: string;
}

export interface Question {
  id: number;
  topic: string;
  type: "mcq" | "multi";
  question: string;
  options: Option[];
  answer: string[];
}

export interface AnswerExplanation {
  summary: string;
  options: Record<string, string>;
  caveat?: string;
}

export interface ExamConfig {
  questions: number;
  minutes: number;
  passPercent: number;
}

export interface CourseMeta {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  exam: ExamConfig;
}

export interface TopicGroup {
  name: string;
  ids: number[];
}

export interface CourseData {
  meta: CourseMeta;
  questions: Question[];
  questionById: Map<number, Question>;
  explanations: Record<number, AnswerExplanation>;
  topics: TopicGroup[];
}

export interface ExamAnswer {
  letters: string[];
}

export type View = "home" | "quiz" | "review" | "exam" | "library";
