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

export interface LabSelectBlank {
  id: number;
  kind: "select";
  options: string[];
  answer: string;
}

export interface LabInputBlank {
  id: number;
  kind: "input";
  answers: string[];
  placeholder?: string;
  reveal?: string;
}

export type LabBlank = LabSelectBlank | LabInputBlank;

export interface LabSet {
  id: string;
  topic: string;
  title: string;
  brief: string;
  hint?: string;
  code: string;
  blanks: LabBlank[];
}

export interface LabTopicGroup {
  name: string;
  sets: LabSet[];
}

export interface LabData {
  sets: LabSet[];
  topics: LabTopicGroup[];
  setById: Map<string, LabSet>;
}

export interface CourseData {
  meta: CourseMeta;
  questions: Question[];
  questionById: Map<number, Question>;
  explanations: Record<number, AnswerExplanation>;
  topics: TopicGroup[];
  lab?: LabData;
}

export interface ExamAnswer {
  letters: string[];
}

export type View = "home" | "quiz" | "review" | "exam" | "library" | "lab";
