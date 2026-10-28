import type {
  AnswerExplanation,
  CourseData,
  CourseMeta,
  LabData,
  LabSet,
  LabTopicGroup,
  Question,
  TopicGroup,
} from "../types";
import { validateLab } from "../lib/lab";

type JsonModule<T> = { default: T };

const metaModules = import.meta.glob("./*/course.json", { eager: true }) as Record<
  string,
  JsonModule<CourseMeta>
>;
const questionLoaders = import.meta.glob("./*/questions.json") as Record<
  string,
  () => Promise<JsonModule<Question[]>>
>;
const explanationLoaders = import.meta.glob("./*/explanations.json") as Record<
  string,
  () => Promise<JsonModule<Record<string, AnswerExplanation>>>
>;
const labLoaders = import.meta.glob("./*/lab.json") as Record<
  string,
  () => Promise<JsonModule<LabSet[]>>
>;

function folderOf(path: string): string {
  return path.split("/")[1] ?? "";
}

const metaByFolder = new Map<string, CourseMeta>();
for (const [path, module] of Object.entries(metaModules)) {
  metaByFolder.set(folderOf(path), module.default);
}

export function listCourses(): CourseMeta[] {
  return [...metaByFolder.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function getCourseMeta(id: string): CourseMeta | undefined {
  return [...metaByFolder.values()].find((meta) => meta.id === id);
}

function validate(meta: CourseMeta, questions: Question[]): string[] {
  const errors: string[] = [];
  if (!meta.id.trim()) errors.push("course id is empty");
  if (!meta.title.trim()) errors.push("title is empty");
  const exam = meta.exam;
  if (!Number.isInteger(exam.questions) || exam.questions <= 0) {
    errors.push("exam.questions must be a positive integer");
  }
  if (!Number.isInteger(exam.minutes) || exam.minutes <= 0) {
    errors.push("exam.minutes must be a positive integer");
  }
  if (typeof exam.passPercent !== "number" || exam.passPercent < 0 || exam.passPercent > 100) {
    errors.push("exam.passPercent must be between 0 and 100");
  }
  if (questions.length === 0) errors.push("no questions");

  const ids = new Set<number>();
  for (const q of questions) {
    const at = `Q${q.id}`;
    if (!Number.isInteger(q.id) || q.id <= 0) {
      errors.push(`an id is not a positive integer`);
      continue;
    }
    if (ids.has(q.id)) errors.push(`duplicate id ${q.id}`);
    ids.add(q.id);
    if (q.type !== "mcq" && q.type !== "multi") errors.push(`${at}: type must be mcq or multi`);
    if (!q.topic.trim()) errors.push(`${at}: topic is empty`);
    if (!q.question.trim()) errors.push(`${at}: question text is empty`);
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`${at}: needs at least two options`);
      continue;
    }
    const letters = new Set<string>();
    for (const option of q.options) {
      if (!option.letter.trim()) errors.push(`${at}: an option has no letter`);
      if (letters.has(option.letter)) errors.push(`${at}: duplicate option ${option.letter}`);
      letters.add(option.letter);
      if (!option.text.trim()) errors.push(`${at}: option ${option.letter} has no text`);
    }
    if (!Array.isArray(q.answer) || q.answer.length === 0) {
      errors.push(`${at}: no answer letters`);
      continue;
    }
    for (const letter of q.answer) {
      if (!letters.has(letter)) errors.push(`${at}: answer ${letter} is not an option`);
    }
    if (q.type === "mcq" && q.answer.length !== 1) errors.push(`${at}: mcq needs one answer`);
    if (q.type === "multi" && q.answer.length < 2) {
      errors.push(`${at}: multi needs at least two answers`);
    }
  }
  return errors;
}

function groupTopics(questions: Question[]): TopicGroup[] {
  const order: string[] = [];
  const ids = new Map<string, number[]>();
  for (const q of questions) {
    if (!ids.has(q.topic)) {
      order.push(q.topic);
      ids.set(q.topic, []);
    }
    ids.get(q.topic)!.push(q.id);
  }
  return order.map((name) => ({ name, ids: ids.get(name)! }));
}

function groupLab(sets: LabSet[]): LabTopicGroup[] {
  const order: string[] = [];
  const byTopic = new Map<string, LabSet[]>();
  for (const set of sets) {
    if (!byTopic.has(set.topic)) {
      order.push(set.topic);
      byTopic.set(set.topic, []);
    }
    byTopic.get(set.topic)!.push(set);
  }
  return order.map((name) => ({ name, sets: byTopic.get(name)! }));
}

function buildLab(folder: string, sets: LabSet[]): LabData {
  const errors = validateLab(sets);
  if (errors.length > 0) {
    throw new Error(`Course "${folder}" has invalid lab data: ${errors.slice(0, 5).join("; ")}`);
  }
  return {
    sets,
    topics: groupLab(sets),
    setById: new Map(sets.map((set) => [set.id, set])),
  };
}

const cache = new Map<string, CourseData>();

export async function loadCourse(id: string): Promise<CourseData> {
  const cached = cache.get(id);
  if (cached) return cached;

  const folder = [...metaByFolder.keys()].find((key) => metaByFolder.get(key)?.id === id);
  if (!folder) throw new Error(`No course folder has the id "${id}".`);

  const meta = metaByFolder.get(folder)!;
  const questionPath = `./${folder}/questions.json`;
  const explanationPath = `./${folder}/explanations.json`;
  const loadQuestions = questionLoaders[questionPath];
  const loadExplanations = explanationLoaders[explanationPath];
  const loadLab = labLoaders[`./${folder}/lab.json`];
  if (!loadQuestions) throw new Error(`Course "${folder}" has no questions.json.`);

  const [questionsModule, explanationsModule, labModule] = await Promise.all([
    loadQuestions(),
    loadExplanations ? loadExplanations() : Promise.resolve({ default: {} }),
    loadLab ? loadLab() : Promise.resolve(null),
  ]);

  const questions = questionsModule.default;
  const errors = validate(meta, questions);
  if (errors.length > 0) {
    throw new Error(`Course "${folder}" has invalid data: ${errors.slice(0, 5).join("; ")}`);
  }

  const unique = [...new Map(questions.map((q) => [q.id, q])).values()];
  const explanations: Record<number, AnswerExplanation> = {};
  const rawExplanations = (explanationsModule.default ?? {}) as Record<string, AnswerExplanation>;
  for (const [key, value] of Object.entries(rawExplanations)) {
    const questionId = Number(key);
    if (!Number.isInteger(questionId) || !unique.some((q) => q.id === questionId)) continue;
    if (!value || typeof value.summary !== "string") continue;
    explanations[questionId] = {
      summary: value.summary,
      options: value.options ?? {},
      ...(value.caveat ? { caveat: value.caveat } : {}),
    };
  }

  const data: CourseData = {
    meta,
    questions: unique,
    questionById: new Map(unique.map((q) => [q.id, q])),
    explanations,
    topics: groupTopics(unique),
    ...(labModule?.default?.length ? { lab: buildLab(folder, labModule.default) } : {}),
  };
  cache.set(id, data);
  return data;
}
