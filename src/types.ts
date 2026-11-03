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

export interface CourseLabOptions {
  /** Tab and heading label for the gap-filling sets. Defaults to "Code lab". */
  label?: string;
  /** Intro line under the lab heading. Defaults to the Java wording. */
  note?: string;
  /** Set to "javac" only when every set assembles into compilable Java. */
  compile?: "javac";
}

/**
 * An external study link offered by a course. Only https URLs survive loading, so a
 * hand-edited course file cannot smuggle a javascript: or file: target into an anchor.
 */
export interface CourseResource {
  label: string;
  url: string;
  note?: string;
}

export interface CourseMeta {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  exam: ExamConfig;
  sample?: boolean;
  lab?: CourseLabOptions;
  resources?: CourseResource[];
}

export interface TopicLesson {
  id: string;
  title: string;
  topic: string;
  minutes: number;
  concepts: string[];
  example: {
    title: string;
    code?: string;
    explanation: string;
    output?: string;
    steps?: string[];
  };
  labIds: string[];
  resources?: CourseResource[];
}

/** A lesson after loading, where every resource link has passed https validation. */
export type LoadedLesson = TopicLesson & { resources: CourseResource[] };

export interface TopicGroup {
  name: string;
  ids: number[];
}

export interface LabSelectBlank {
  id: number;
  kind: "select";
  options: string[];
  answer: string;
  explanation?: string;
}

export interface LabInputBlank {
  id: number;
  kind: "input";
  answers: string[];
  placeholder?: string;
  reveal?: string;
  explanation?: string;
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
  walkthrough?: { steps: string[]; output?: string };
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
  resources: CourseResource[];
  lab?: LabData;
  lessons?: LoadedLesson[];
}

export interface ExamAnswer {
  letters: string[];
}

export type View = "home" | "quiz" | "summary" | "review" | "exam" | "library" | "lab" | "learn" | "settings";
