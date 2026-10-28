import { useEffect, useState } from "react";
import { useCourse } from "../courseContext";
import { remainingSeconds } from "../lib/grading";
import { lastAttemptCorrect, load } from "../lib/storage";

export interface ExamResume {
  answered: number;
  total: number;
  deadline: number;
}

export interface PracticeResume {
  label: string;
  index: number;
  total: number;
  score: number;
  answered: number;
}

interface Props {
  onNav: (view: "quiz" | "review" | "exam" | "library" | "lab") => void;
  onStartTopic: (topic: string) => void;
  examResume?: ExamResume | null;
  practiceResume?: PracticeResume | null;
  onResumePractice?: () => void;
  onDiscardPractice?: () => void;
}

function formatRemaining(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function CourseHome({
  onNav,
  onStartTopic,
  examResume,
  practiceResume,
  onResumePractice,
  onDiscardPractice,
}: Props) {
  const { meta, questions, topics, lab } = useCourse();
  const [, forceTick] = useState(0);
  const state = load(meta.id);
  const attempted = Object.keys(state.stats).length;
  const wrongOpen = state.wrong.filter((id) => !state.masteredWrong.includes(id)).length;
  const lastExam = state.examHistory[state.examHistory.length - 1];

  useEffect(() => {
    if (!examResume) return;
    const tick = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(tick);
  }, [examResume]);

  const remaining = examResume ? remainingSeconds(examResume.deadline) : 0;
  const expired = !!examResume && remaining === 0;
  const examSize = Math.min(meta.exam.questions, questions.length);

  return (
    <div className="home">
      <div className="hero card">
        <h1>{meta.title}</h1>
        <p className="muted">
          {questions.length} questions · {topics.length} topic{topics.length === 1 ? "" : "s"} ·{" "}
          {examSize}-question mock exam in {meta.exam.minutes} minutes · pass mark{" "}
          {meta.exam.passPercent}%
        </p>
        <div className="stat-row">
          <div className="stat">
            <b>{attempted}</b>
            <span>attempted</span>
          </div>
          <div className="stat">
            <b>{wrongOpen}</b>
            <span>to review</span>
          </div>
          <div className="stat">
            <b>{lastExam ? `${lastExam.percent}%` : "—"}</b>
            <span>last mock</span>
          </div>
        </div>
      </div>

      {examResume && (
        <div className="card resume-card">
          <div>
            <h2>{expired ? "Mock exam time expired" : "Mock exam in progress"}</h2>
            <p className="muted">
              {expired
                ? `Your ${examResume.total}-question attempt is saved and ready to grade.`
                : `${formatRemaining(remaining)} left · ${examResume.answered}/${examResume.total} answered`}
            </p>
          </div>
          <button className="btn primary" onClick={() => onNav("exam")}>
            {expired ? "View results" : "Resume exam"}
          </button>
        </div>
      )}

      {practiceResume && (
        <div className="card resume-card practice-resume">
          <div>
            <h2>Practice in progress</h2>
            <p className="muted">
              {practiceResume.label} · question {practiceResume.index + 1}/{practiceResume.total} ·{" "}
              {practiceResume.answered > 0
                ? `${practiceResume.score}/${practiceResume.answered} correct`
                : "nothing checked yet"}
            </p>
          </div>
          <div className="resume-actions">
            <button className="btn primary" onClick={onResumePractice}>
              Resume practice
            </button>
            <button className="btn ghost" onClick={onDiscardPractice}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="mode-grid">
        <button className="mode card" onClick={() => onNav("quiz")}>
          <h2>Quick quiz</h2>
          <p>Up to 20 random questions with instant feedback and score tracking.</p>
        </button>
        <button className="mode card" onClick={() => onNav("review")}>
          <h2>Review mistakes</h2>
          <p>Flashcard drill of only the questions you missed, until they are mastered.</p>
        </button>
        <button className="mode card" onClick={() => onNav("exam")}>
          <h2>Timed mock exam</h2>
          <p>
            {examSize} questions in {meta.exam.minutes} minutes. Answers save automatically, missed
            questions feed your review deck.
          </p>
        </button>
        <button className="mode card" onClick={() => onNav("library")}>
          <h2>Library</h2>
          <p>Search every question, read explanations, back up progress, and see exam history.</p>
        </button>
        {lab && (
          <button className="mode card" onClick={() => onNav("lab")}>
            <h2>Code lab</h2>
            <p>
              {lab.sets.length} coding simulations: fill the gaps in Java classes and methods, with
              dropdown tokens and typed lines checked for syntax.
            </p>
          </button>
        )}
      </div>

      <h2 className="section-title">Study by topic</h2>
      <div className="topic-list">
        {topics.map((topic) => {
          const stats = topic.ids.map((id) => state.stats[id]).filter((stat) => !!stat);
          const attemptedCount = stats.length;
          const correctCount = stats.filter((stat) => lastAttemptCorrect(stat)).length;
          const pct = topic.ids.length ? Math.round((attemptedCount / topic.ids.length) * 100) : 0;
          return (
            <div className="card topic-row" key={topic.name}>
              <div className="topic-info">
                <h3>{topic.name}</h3>
                <p className="muted">
                  {topic.ids.length} question{topic.ids.length === 1 ? "" : "s"} ·{" "}
                  {attemptedCount === 0
                    ? "not practised yet"
                    : `${correctCount}/${attemptedCount} correct on last try`}
                </p>
                <div
                  className="progress slim"
                  role="progressbar"
                  aria-label={`${topic.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={topic.ids.length}
                  aria-valuenow={attemptedCount}
                  aria-valuetext={`${attemptedCount} of ${topic.ids.length} attempted`}
                >
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button className="btn ghost" onClick={() => onStartTopic(topic.name)}>
                Practice
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
