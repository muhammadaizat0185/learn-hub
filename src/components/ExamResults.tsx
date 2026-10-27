import { useEffect, useMemo, useRef, useState } from "react";
import { useCourse } from "../courseContext";
import { isAnswered } from "../lib/grading";
import type { ExamSummary } from "../lib/grading";
import type { Question } from "../types";
import AnswerExplanation from "./AnswerExplanation";
import Stem from "./Stem";

interface Props {
  summary: ExamSummary;
  onRetake: () => void;
  onHome: () => void;
  onRetryMissed: (questions: Question[]) => void;
}

export default function ExamResults({ summary, onRetake, onHome, onRetryMissed }: Props) {
  const { meta } = useCourse();
  const [reviewIdx, setReviewIdx] = useState<number | null>(null);
  const [missedOnly, setMissedOnly] = useState(false);
  const { graded, raw, total, percent, passed, passPercent, autoSubmitted } = summary;
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (reviewIdx === null) summaryRef.current?.focus({ preventScroll: true });
    else reviewRef.current?.focus({ preventScroll: true });
  }, [reviewIdx]);

  const unanswered = graded.filter((g) => !isAnswered(g.answer)).length;
  const allEntries = graded.map((g, i) => ({ g, i }));
  const missed = allEntries.filter(({ g }) => !g.correct);
  const shown = missedOnly ? missed : allEntries;

  const byTopic = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const g of graded) {
      const current = map.get(g.q.topic) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (g.correct) current.correct += 1;
      map.set(g.q.topic, current);
    }
    return map;
  }, [graded]);

  if (reviewIdx !== null) {
    const g = graded[reviewIdx];
    const pos = Math.max(0, shown.findIndex((entry) => entry.i === reviewIdx));
    return (
      <div className="exam-review card" ref={reviewRef} tabIndex={-1}>
        <h1 className="sr-only">
          Review question {pos + 1} of {shown.length}
        </h1>
        <div className="quiz-top">
          <span className="pill">
            Review Q{g.q.id} ({pos + 1}/{shown.length})
          </span>
          <button className="btn ghost" onClick={() => setReviewIdx(null)}>
            Back to summary
          </button>
        </div>
        <Stem text={g.q.question} />
        <div className="options">
          {g.q.options.map((option) => {
            let className = "option";
            if (g.q.answer.includes(option.letter)) className += " correct";
            else if (g.answer.letters.includes(option.letter)) className += " wrong";
            return (
              <div className={className} key={option.letter}>
                <span className="letter">{option.letter}</span>
                <span>
                  {g.q.answer.includes(option.letter) ? (
                    <span className="sr-only">Correct answer. </span>
                  ) : g.answer.letters.includes(option.letter) ? (
                    <span className="sr-only">Your answer, incorrect. </span>
                  ) : null}
                  {option.text}
                </span>
              </div>
            );
          })}
        </div>
        <AnswerExplanation key={g.q.id} question={g.q} />
        <div className="nav-row">
          <button
            className="btn ghost"
            disabled={pos === 0}
            onClick={() => setReviewIdx(shown[pos - 1].i)}
          >
            ← Prev
          </button>
          <button
            className="btn ghost"
            disabled={pos >= shown.length - 1}
            onClick={() => setReviewIdx(shown[pos + 1].i)}
          >
            Next →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results">
      <div className={`card result-hero ${passed ? "pass" : "fail"}`}>
        <h1 ref={summaryRef} tabIndex={-1}>
          {percent}%
        </h1>
        <p className="big">{passed ? "PASS 🎉" : "BELOW PASS MARK"}</p>
        <p className="muted">
          {raw} of {total} correct — pass mark is {passPercent}%
        </p>
        {unanswered > 0 && (
          <p className="hint">
            {unanswered} unanswered {unanswered === 1 ? "question was" : "questions were"} counted
            as incorrect.
          </p>
        )}
        {autoSubmitted && (
          <p className="hint">Time expired — the exam was submitted automatically.</p>
        )}
        <p className="hint">
          This percentage is for study feedback; it is not an official university grade.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={onRetake}>
            Take another mock
          </button>
          <button className="btn ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
      <div className="card">
        <div className="review-head">
          <div>
            <h2>Question review</h2>
            <p className="muted">Open any number to see the question, key, and explanation.</p>
          </div>
          {missed.length > 0 && (
            <div className="review-actions">
              <button
                className={"btn tiny " + (missedOnly ? "primary" : "ghost")}
                aria-pressed={missedOnly}
                onClick={() => setMissedOnly((value) => !value)}
              >
                {missedOnly ? "Show all questions" : `Show only missed (${missed.length})`}
              </button>
              <button
                className="btn tiny primary"
                onClick={() => onRetryMissed(missed.map(({ g }) => g.q))}
              >
                Retry missed in quiz mode ({missed.length})
              </button>
            </div>
          )}
        </div>
        {missed.length > 0 && (
          <p className="muted review-note">
            A retry works like a quiz: check each answer to reveal the key and explanation.
          </p>
        )}
        <div className="answer-grid">
          {shown.map(({ g, i }) => (
            <button
              key={g.q.id}
              className={"qdot " + (g.correct ? "correct" : "wrong")}
              aria-label={`Question ${i + 1}, ${g.correct ? "correct" : "incorrect"}`}
              onClick={() => setReviewIdx(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {byTopic.size > 0 && (
          <div className="phase-breakdown">
            {[...byTopic.entries()].map(([topic, value]) => (
              <div key={topic}>
                {topic}: {value.correct}/{value.total}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="muted">
        {meta.title} · mock exam pass mark {passPercent}%
      </p>
    </div>
  );
}
