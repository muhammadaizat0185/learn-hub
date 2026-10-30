import { useCourse } from "../courseContext";
import type { PracticeSummary } from "../lib/practiceSummary";

interface Props {
  summary: PracticeSummary;
  onRetry: (ids: number[]) => void;
  onLearn: (id: string) => void;
  onLab: (id: string) => void;
  onHome: () => void;
  onReview: () => void;
}

export default function PracticeResults({ summary, onRetry, onLearn, onLab, onHome, onReview }: Props) {
  const { questions, lessons, lab } = useCourse();
  const checked = summary.correctIds.length + summary.missedIds.length;
  const touched = new Set([...summary.correctIds, ...summary.missedIds]);
  const topics = [...new Set(questions.filter((q) => touched.has(q.id)).map((q) => q.topic))];
  const weakTopic = questions.find((q) => summary.missedIds.includes(q.id))?.topic;
  const lesson = lessons?.find((item) => item.topic === weakTopic) ?? lessons?.find((item) => topics.includes(item.topic));
  const relatedLab = lesson?.labIds.find((id) => lab?.setById.has(id));
  return (
    <div className="practice-results">
      <section className="card hero">
        <p className="eyebrow">{summary.label}</p>
        <h1>Session complete</h1>
        <p className="muted">{checked ? "A useful step forward. Here is what to take into your next session." : "You stopped before checking any answers. No accuracy score has been recorded."}</p>
        <div className="stat-row">
          <div className="stat"><b>{summary.correctIds.length}/{checked}</b><span>checked answers correct</span></div>
          <div className="stat"><b>{summary.missedIds.length}</b><span>to revisit</span></div>
          <div className="stat"><b>{summary.uncheckedIds.length}</b><span>not checked</span></div>
        </div>
        <p className="muted">Unchecked questions do not count as wrong in practice. Correct answers will return for a later recall check.</p>
        <div className="btn-row start">
          {summary.missedIds.length > 0 && <button className="btn primary" onClick={() => onRetry(summary.missedIds)}>Retry mistakes ({summary.missedIds.length})</button>}
          {summary.missedIds.length === 0 && relatedLab && <button className="btn primary" onClick={() => onLab(relatedLab)}>Try a related lab</button>}
          {summary.uncheckedIds.length > 0 && <button className="btn ghost" onClick={() => onRetry(summary.uncheckedIds)}>Practise unchecked questions</button>}
          <button className="btn ghost" onClick={onHome}>Finish for now</button>
        </div>
      </section>
      {topics.length > 0 && <section className="card"><h2>Your topic snapshot</h2>
        <ul className="summary-topics">{topics.map((topic) => {
          const ids = questions.filter((q) => q.topic === topic).map((q) => q.id);
          const correct = ids.filter((id) => summary.correctIds.includes(id)).length;
          const missed = ids.filter((id) => summary.missedIds.includes(id)).length;
          return <li key={topic}><span>{topic}</span><strong>{correct}/{correct + missed} correct</strong></li>;
        })}</ul>
        {lesson && <button className="btn ghost" onClick={() => onLearn(lesson.id)}>Revisit the concept: {lesson.title}</button>}
      </section>}
      <button className="btn ghost" onClick={onReview}>See review schedule</button>
    </div>
  );
}
