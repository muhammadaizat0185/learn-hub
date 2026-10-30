import { useEffect, useRef, useState } from "react";
import { useCourse } from "../courseContext";
import { isAnswered, remainingSeconds, sameSet } from "../lib/grading";
import { EMPTY_PRACTICE_ANSWER, practiceScore } from "../lib/practiceSession";
import type { PracticeAnswer, PracticeSession } from "../lib/practiceSession";
import { load } from "../lib/storage";
import type { ExamAnswer, Question } from "../types";
import AnswerExplanation from "./AnswerExplanation";
import Stem from "./Stem";

interface PracticeProps {
  session: PracticeSession;
  questions: Question[];
  onAnswer: (qid: number, answer: PracticeAnswer) => void;
  onReveal: (qid: number) => void;
  onIndex: (index: number) => void;
  onExit: () => void;
  onFinish: () => void;
}

export function PracticeQuiz({
  session,
  questions,
  onAnswer,
  onReveal,
  onIndex,
  onExit,
  onFinish,
}: PracticeProps) {
  const { meta, questionById, explanations } = useCourse();
  const idx = session.index;
  const q = questions[idx];
  const total = questions.length;
  const answer = session.answers[q.id] ?? EMPTY_PRACTICE_ANSWER;
  const revealed = session.revealed.includes(q.id);
  const isCorrect = revealed && sameSet(answer.letters, q.answer);
  const { score, answered } = practiceScore(session, questionById);
  const reviewSchedule = revealed ? load(meta.id).reviews[q.id] : undefined;
  const caveat = !!explanations[q.id]?.caveat;
  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const wasRevealed = useRef(revealed);

  useEffect(() => {
    window.scrollTo(0, 0);
    questionRef.current?.focus({ preventScroll: true });
  }, [idx, session.startedAt]);

  useEffect(() => {
    if (revealed && !wasRevealed.current) feedbackRef.current?.focus({ preventScroll: true });
    wasRevealed.current = revealed;
  }, [revealed]);

  function reveal() {
    if (revealed) return;
    onReveal(q.id);
  }

  function next() {
    if (idx + 1 >= total) {
      onFinish();
      return;
    }
    onIndex(idx + 1);
  }

  function toggle(letter: string) {
    if (revealed) return;
    if (q.type === "multi") {
      onAnswer(q.id, {
        letters: answer.letters.includes(letter)
          ? answer.letters.filter((x) => x !== letter)
          : [...answer.letters, letter],
      });
    } else {
      onAnswer(q.id, { letters: [letter] });
    }
  }

  const correctFeedback = caveat
    ? "Matches key — see caveat below."
    : reviewSchedule
      ? `Correct. Next recall check: ${new Date(reviewSchedule.dueAt).toLocaleDateString()}.`
      : "Correct!";

  return (
    <div className={"quiz" + (revealed ? " quiz-split" : "")}>
      <h1 className="sr-only">
        Practice — question {idx + 1} of {total}
      </h1>
      <div className="quiz-top">
        <span className="pill">{session.label}</span>
        <span className="pill">
          Question {idx + 1} / {total}
        </span>
        <span className="pill good">
          Score: {score}/{answered}
        </span>
        <button className="btn ghost" onClick={onFinish}>
          Finish session
        </button>
        <button className="btn ghost" onClick={onExit}>
          Save &amp; exit
        </button>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Practice progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={idx + 1}
        aria-valuetext={`Question ${idx + 1} of ${total}`}
      >
        <div className="progress-bar" style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>

      <div className="quiz-body">
        <div className="quiz-main">
          <div className="question-focus" ref={questionRef} tabIndex={-1}>
            <Stem text={q.question} />
          </div>
          {q.type === "multi" && (
            <p className="hint">Multiple answers — select all that apply.</p>
          )}

          <div className="options">
            {q.options.map((option) => {
              const picked = answer.letters.includes(option.letter);
              const isAnswer = q.answer.includes(option.letter);
              let className = "option";
              if (revealed) {
                if (isAnswer) className += " correct";
                else if (picked) className += " wrong";
              } else if (picked) {
                className += " picked";
              }
              return (
                <button
                  key={option.letter}
                  className={className}
                  onClick={() => toggle(option.letter)}
                  disabled={revealed}
                  aria-pressed={picked}
                >
                  <span className="letter">{option.letter}</span>
                  <span>
                    {revealed && isAnswer && <span className="sr-only">Correct answer. </span>}
                    {revealed && picked && !isAnswer && (
                      <span className="sr-only">Your answer, incorrect. </span>
                    )}
                    {option.text}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="quiz-actions">
            {!revealed ? (
              <button
                className="btn primary"
                disabled={answer.letters.length === 0}
                onClick={reveal}
              >
                Check answer
              </button>
            ) : (
              <>
                <div
                  className={isCorrect ? "feedback good" : "feedback bad"}
                  ref={feedbackRef}
                  tabIndex={-1}
                  role="status"
                >
                  {isCorrect
                    ? correctFeedback
                    : `${caveat ? "Course key" : "Correct answer"}: ${q.answer.join(", ")}`}
                </div>
                <button className="btn primary" onClick={next}>
                  {idx === total - 1 ? "Finish" : "Next question →"}
                </button>
              </>
            )}
          </div>
        </div>

        {revealed && (
          <aside className="quiz-side">
            <AnswerExplanation key={q.id} question={q} />
          </aside>
        )}
      </div>
    </div>
  );
}

interface ExamProps {
  questions: Question[];
  answers: Record<number, ExamAnswer>;
  index: number;
  deadline: number;
  flags: number[];
  onAnswer: (qid: number, answer: ExamAnswer) => void;
  onIndexChange: (index: number) => void;
  onToggleFlag: (qid: number) => void;
  onFinish: (auto: boolean) => void;
  onAbandon: () => void;
}

const EMPTY_ANSWER: ExamAnswer = { letters: [] };

export function ExamQuiz({
  questions,
  answers,
  index,
  deadline,
  flags,
  onAnswer,
  onIndexChange,
  onToggleFlag,
  onFinish,
  onAbandon,
}: ExamProps) {
  const [remaining, setRemaining] = useState(() => remainingSeconds(deadline));
  const [timeNotice, setTimeNotice] = useState("");
  const finished = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const announced = useRef(new Set<number>());

  useEffect(() => {
    setRemaining(remainingSeconds(deadline));
    const tick = setInterval(() => setRemaining(remainingSeconds(deadline)), 250);
    return () => clearInterval(tick);
  }, [deadline]);

  useEffect(() => {
    if (remaining <= 0) return;
    const due = [600, 300, 60].filter((mark) => remaining <= mark && !announced.current.has(mark));
    if (due.length === 0) return;
    for (const mark of due) announced.current.add(mark);
    const threshold = due[due.length - 1];
    setTimeNotice(
      threshold === 60 ? "1 minute remaining" : `${threshold / 60} minutes remaining`
    );
  }, [remaining]);

  useEffect(() => {
    if (remaining > 0 || finished.current) return;
    finished.current = true;
    onFinish(true);
  }, [remaining, onFinish]);

  useEffect(() => {
    window.scrollTo(0, 0);
    questionRef.current?.focus({ preventScroll: true });
  }, [index]);

  const q = questions[index];
  const total = questions.length;
  const answer = answers[q.id] ?? EMPTY_ANSWER;
  const flagged = flags.includes(q.id);
  const answeredCount = questions.filter((qq) => isAnswered(answers[qq.id])).length;

  function toggle(letter: string) {
    if (q.type === "multi") {
      onAnswer(q.id, {
        letters: answer.letters.includes(letter)
          ? answer.letters.filter((x) => x !== letter)
          : [...answer.letters, letter],
      });
    } else {
      onAnswer(q.id, { letters: [letter] });
    }
  }

  function submit() {
    const unanswered = total - answeredCount;
    const flaggedCount = questions.filter((qq) => flags.includes(qq.id)).length;
    if (unanswered > 0 || flaggedCount > 0) {
      const parts: string[] = [];
      if (unanswered > 0) {
        parts.push(`${unanswered} unanswered question${unanswered === 1 ? "" : "s"}`);
      }
      if (flaggedCount > 0) {
        parts.push(`${flaggedCount} flagged question${flaggedCount === 1 ? "" : "s"}`);
      }
      const tail = unanswered > 0 ? " Unanswered questions are marked incorrect." : "";
      if (!window.confirm(`You have ${parts.join(" and ")}. Submit anyway?${tail}`)) return;
    }
    onFinish(false);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="quiz">
      <h1 className="sr-only">
        Mock exam — question {index + 1} of {total}
      </h1>
      <div className="quiz-top">
        <span className="pill">Mock exam</span>
        <span
          className={`pill timer ${remaining < 300 ? "bad" : ""}`}
          role="timer"
          aria-label={`Time remaining ${mm} minutes ${ss} seconds`}
        >
          ⏱ {mm}:{ss}
        </span>
        <span className="sr-only" role="status" aria-live="polite">
          {timeNotice}
        </span>
        <span className="pill">
          Answered: {answeredCount}/{total}
        </span>
        <button
          className={"btn ghost flag" + (flagged ? " on" : "")}
          aria-pressed={flagged}
          onClick={() => onToggleFlag(q.id)}
        >
          {flagged ? "Unflag" : "Flag for review"}
        </button>
        <button className="btn ghost" onClick={onAbandon}>
          Abandon
        </button>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Exam progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext={`Question ${index + 1} of ${total}`}
      >
        <div className="progress-bar" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="exam-layout">
        <div className="exam-main">
          <div className="question-focus" ref={questionRef} tabIndex={-1}>
            <Stem text={q.question} />
          </div>
          {q.type === "multi" && (
            <p className="hint">Multiple answers — select all that apply.</p>
          )}

          <div className="options">
            {q.options.map((option) => (
              <button
                key={option.letter}
                className={"option" + (answer.letters.includes(option.letter) ? " picked" : "")}
                onClick={() => toggle(option.letter)}
                aria-pressed={answer.letters.includes(option.letter)}
              >
                <span className="letter">{option.letter}</span>
                <span>{option.text}</span>
              </button>
            ))}
          </div>

          <div className="quiz-actions spread">
            <button
              className="btn ghost"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
            >
              ← Back
            </button>
            {index === total - 1 ? (
              <button className="btn primary" onClick={submit}>
                Submit exam
              </button>
            ) : (
              <button className="btn primary" onClick={() => onIndexChange(index + 1)}>
                Next →
              </button>
            )}
          </div>
        </div>

        <nav className="exam-side" aria-label="Question list">
          <h2>Questions</h2>
          <div className="exam-nav">
            {questions.map((qq, i) => {
              const isFlagged = flags.includes(qq.id);
              const isDone = isAnswered(answers[qq.id]);
              return (
                <button
                  key={qq.id}
                  className={
                    "qdot" +
                    (i === index ? " current" : "") +
                    (isDone ? " done" : "") +
                    (isFlagged ? " flagged" : "")
                  }
                  aria-current={i === index ? "step" : undefined}
                  aria-label={
                    `Question ${i + 1}` +
                    (isDone ? ", answered" : ", not answered") +
                    (isFlagged ? ", flagged for review" : "")
                  }
                  onClick={() => onIndexChange(i)}
                  title={
                    `Question ${i + 1}` + (isFlagged ? " · flagged for review" : "")
                  }
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
