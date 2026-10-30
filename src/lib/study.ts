import type { CourseData, Question } from "../types";
import type { StoredState } from "./storage";
import { dueReviewIds } from "./storage";
import type { LabProgress } from "./lab";

export function topicMetrics(ids: number[], state: StoredState, now = Date.now()) {
  const stats = ids.map((id) => state.stats[id]).filter((stat) => stat && stat.seen > 0);
  const attempts = stats.reduce((sum, stat) => sum + stat.seen, 0);
  const correct = stats.reduce((sum, stat) => sum + stat.correct, 0);
  return {
    covered: stats.length, total: ids.length, attempts,
    accuracy: attempts ? Math.round(correct / attempts * 100) : null,
    enoughEvidence: stats.length >= Math.min(3, ids.length) && attempts >= 3,
    recalled: ids.filter((id) => (state.reviews[id]?.successfulReviews ?? 0) >= 3).length,
    due: ids.filter((id) => state.reviews[id] && state.reviews[id].dueAt <= now).length,
  };
}

export interface Recommendation {
  kind: "review" | "learn" | "practice" | "lab";
  title: string;
  description: string;
  questionIds?: number[];
  topic?: string;
  lessonId?: string;
  labId?: string;
}

export function recommendStudy(data: CourseData, state: StoredState, labProgress?: LabProgress, now = Date.now()): Recommendation {
  const due = dueReviewIds(state, now).filter((id) => data.questionById.has(id));
  if (due.length) return {
    kind: "review", title: `Review ${Math.min(due.length, 10)} questions due`,
    description: "Recall these before adding new material. You can stop after a short session.", questionIds: due.slice(0, 10),
  };
  const ordered = data.lessons?.length
    ? data.lessons.map((lesson) => data.topics.find((topic) => topic.name === lesson.topic)!).filter(Boolean)
    : data.topics;
  const weak = ordered.map((topic) => ({ topic, metrics: topicMetrics(topic.ids, state, now) }))
    .filter(({ metrics }) => metrics.enoughEvidence && metrics.accuracy !== null && metrics.accuracy < 70)
    .sort((a, b) => a.metrics.accuracy! - b.metrics.accuracy!)[0];
  if (weak) return {
    kind: "practice", title: `Build confidence in ${weak.topic.name}`,
    description: `${weak.metrics.accuracy}% across ${weak.metrics.attempts} attempts. Try up to five focused questions.`,
    topic: weak.topic.name, questionIds: selectQuestions(weak.topic.ids.map((id) => data.questionById.get(id)!), 5).map((q) => q.id),
  };
  const untouched = ordered.find((topic) => topic.ids.every((id) => !state.stats[id]?.seen));
  if (untouched) {
    const lesson = data.lessons?.find((item) => item.topic === untouched.name);
    return lesson ? {
      kind: "learn", title: lesson.title, description: `About ${lesson.minutes} minutes of reading, then practise and apply it.`, lessonId: lesson.id,
    } : { kind: "practice", title: `Try ${untouched.name}`, description: "Start small with up to five questions and explanations.", questionIds: selectQuestions(untouched.ids.map((id) => data.questionById.get(id)!), 5).map((q) => q.id), topic: untouched.name };
  }
  const nextLab = data.lab?.sets.find((set) => !labProgress?.sets[set.id]?.solved);
  if (nextLab) return { kind: "lab", title: `Apply it: ${nextLab.title}`, description: "Put your knowledge into a coding exercise. Hints are available.", labId: nextLab.id };
  return { kind: "practice", title: "Keep your knowledge fresh", description: "Nothing is due right now. Try up to five mixed questions, or finish for today.", questionIds: selectQuestions(data.questions, 5).map((q) => q.id) };
}

export function selectQuestions(questions: Question[], count: number, random = Math.random): Question[] {
  const copy = [...questions];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const requested = Number.isNaN(count) ? 10 : count;
  return copy.slice(0, Math.max(1, Math.min(20, Math.floor(requested))));
}
