import { useEffect, useState } from "react";
import { useCourse } from "../courseContext";
import { dueReviewIds, load, reviewStatus, snoozeReview } from "../lib/storage";
import type { Question } from "../types";

export default function ReviewView({ onStartDrill, onLearn }: { onStartDrill: (questions: Question[]) => void; onLearn: (id: string) => void }) {
  const { meta, questionById, lessons } = useCourse();
  const [, tick] = useState(0);
  const [size, setSize] = useState(10);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const state = load(meta.id);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(timer); }, []);
  const now = Date.now();
  const due = dueReviewIds(state, now).map((id) => questionById.get(id)).filter((q): q is Question => !!q);
  const upcoming = Object.keys(state.reviews).map(Number).filter((id) => state.reviews[id].dueAt > now && questionById.has(id)).sort((a, b) => state.reviews[a].dueAt - state.reviews[b].dueAt);
  const recalled = Object.keys(state.reviews).map(Number).filter((id) => questionById.has(id) && state.reviews[id].successfulReviews >= 3).length;
  return <div className="review">
    <h1>Recall review</h1><p className="muted">Mistakes return now. Correct answers return after 1, 3, 7, 14 and then 30 days as you recall them successfully. Early repeats count as practice, not another spaced success.</p>
    <section className="card"><div className="review-counts"><div><b>{due.length}</b><span>due now</span></div><div><b>{upcoming.length}</b><span>scheduled later</span></div><div><b>{recalled}</b><span>recalled over time</span></div></div>
      <p className="muted">“Recalled over time” means at least three scheduled correct checks, not a guarantee of mastery. Earlier saved progress needs a fresh recall check.</p>
      {due.length ? <><div className="session-controls"><label htmlFor="review-size">Review length</label><select id="review-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[5, 10, 20].map((value) => <option value={value} key={value}>Up to {value} questions</option>)}</select><button className="btn primary" onClick={() => onStartDrill(due.slice(0, size))}>Review due questions ({Math.min(size, due.length)})</button></div>
        <ul className="review-items">{due.slice(0, 200).map((q) => {
          const lesson = lessons?.find((item) => item.topic === q.topic);
          return <li className="review-item" key={q.id}><div><strong>Q{q.id} · {q.topic}</strong><p>{q.question.slice(0, 160)}{q.question.length > 160 ? "…" : ""}</p><span className="muted">{reviewStatus(state.reviews[q.id])}</span></div><div className="topic-actions"><button className="btn tiny ghost" onClick={() => onStartDrill([q])}>Review question</button>{lesson && <button className="btn tiny ghost" onClick={() => onLearn(lesson.id)}>Revisit concept</button>}<button className="btn tiny ghost" onClick={() => { snoozeReview(meta.id, [q.id]); tick((n) => n + 1); }}>Snooze 1 day</button></div></li>;
        })}</ul></> : <p className="empty">Nothing is due right now. Take a break, explore another topic, or return for your next scheduled check.</p>}
    </section>
    {upcoming.length > 0 && <section className="card"><h2>Coming up</h2><p className="muted">Next review: {new Date(state.reviews[upcoming[0]].dueAt).toLocaleString()}.</p><button className="btn ghost" aria-expanded={showUpcoming} onClick={() => setShowUpcoming(!showUpcoming)}>{showUpcoming ? "Hide schedule" : "Show review schedule"}</button>{showUpcoming && <ul className="review-items">{upcoming.slice(0, 100).map((id) => <li className="review-item" key={id}><div><strong>Q{id} · {questionById.get(id)!.topic}</strong><p className="muted">{new Date(state.reviews[id].dueAt).toLocaleString()} · {reviewStatus(state.reviews[id])}</p></div><button className="btn tiny ghost" onClick={() => onStartDrill([questionById.get(id)!])}>Practise early</button></li>)}</ul>}</section>}
  </div>;
}
