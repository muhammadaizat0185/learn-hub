import { useState } from "react";
import { useCourse } from "../courseContext";
import { load, markWrongMastered } from "../lib/storage";
import type { Question } from "../types";

export default function ReviewView({ onStartDrill }: { onStartDrill: (questions: Question[]) => void }) {
  const { meta, questionById } = useCourse();
  const [tick, setTick] = useState(0);
  const state = load(meta.id);
  void tick;

  const open = state.wrong
    .filter((id) => !state.masteredWrong.includes(id))
    .map((id) => questionById.get(id))
    .filter((q): q is Question => !!q);
  const mastered = state.wrong.filter((id) => state.masteredWrong.includes(id));

  return (
    <div className="review">
      <h1>Wrong-answers review</h1>
      <p className="muted">
        Every question you miss lands here. A correct flashcard answer masters it automatically, or
        mark any question mastered yourself.
      </p>
      <div className="card">
        <div className="review-counts">
          <div>
            <b>{open.length}</b>
            <span>to master</span>
          </div>
          <div>
            <b>{mastered.length}</b>
            <span>mastered ✓</span>
          </div>
        </div>
        {open.length > 0 ? (
          <>
            <button className="btn primary" onClick={() => onStartDrill(open)}>
              Start flashcard drill ({open.length})
            </button>
            <div className="wrong-list">
              {open.slice(0, 200).map((q) => (
                <div className="wrong-item" key={q.id}>
                  <span className="qnum">Q{q.id}</span>
                  <span className="wtext">
                    {q.question.slice(0, 110)}
                    {q.question.length > 110 ? "…" : ""}
                  </span>
                  <button
                    className="btn tiny ghost"
                    onClick={() => {
                      markWrongMastered(meta.id, [q.id]);
                      setTick((value) => value + 1);
                    }}
                  >
                    Mark mastered
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="empty">
            Nothing to review right now. Miss a question and it will show up here.
          </p>
        )}
      </div>
    </div>
  );
}
