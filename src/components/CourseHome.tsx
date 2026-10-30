import { useEffect, useState } from "react";
import { useCourse } from "../courseContext";
import { remainingSeconds } from "../lib/grading";
import { load } from "../lib/storage";
import { loadLabProgress } from "../lib/lab";
import { recommendStudy, topicMetrics } from "../lib/study";
import type { Recommendation } from "../lib/study";
import type { View } from "../types";

export interface ExamResume { answered: number; total: number; deadline: number }
export interface PracticeResume { label: string; index: number; total: number; score: number; answered: number }
interface Props {
  onNav: (view: View) => void;
  onQuickQuiz: (count: number) => void;
  onStartTopic: (topic: string, count: number) => void;
  onRecommend: (item: Recommendation) => void;
  onLearn: (id: string) => void;
  examResume?: ExamResume | null;
  practiceResume?: PracticeResume | null;
  onResumePractice: () => void;
  onDiscardPractice: () => void;
  hasSummary: boolean;
}
export default function CourseHome({ onNav, onQuickQuiz, onStartTopic, onRecommend, onLearn, examResume, practiceResume, onResumePractice, onDiscardPractice, hasSummary }: Props) {
  const data = useCourse();
  const { meta, questions, topics, lab, lessons } = data;
  const [sessionSize, setSessionSize] = useState(10);
  const [, tick] = useState(0);
  const state = load(meta.id);
  const metrics = topicMetrics(questions.map((q) => q.id), state);
  const recommendation = recommendStudy(data, state, loadLabProgress(meta.id));
  const lastExam = state.examHistory[state.examHistory.length - 1];
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), examResume ? 1000 : 60000); return () => clearInterval(timer); }, [examResume?.deadline]);
  const remaining = examResume ? remainingSeconds(examResume.deadline) : 0;
  const expired = !!examResume && !remaining;
  const examSize = Math.min(meta.exam.questions, questions.length);
  return <div className="home">
    <section className="hero course-heading">
      <p className="eyebrow">Your learning space</p><h1>{meta.title}</h1>
      <p className="muted">Learn a concept, put it into practice, and return to it later.</p>
    </section>
    {examResume && <section className="card resume-card"><div><p className="eyebrow">Continue first</p><h2>{expired ? "Mock exam time expired" : "Mock exam in progress"}</h2><p className="muted">{expired ? "Your saved answers are ready to grade." : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left · ${examResume.answered}/${examResume.total} answered`}</p></div><button className="btn primary" onClick={() => onNav("exam")}>{expired ? "View results" : "Resume exam"}</button></section>}
    {practiceResume && <section className="card resume-card practice-resume"><div><p className="eyebrow">Pick up where you left off</p><h2>Practice in progress</h2><p className="muted">{practiceResume.label} · question {practiceResume.index + 1}/{practiceResume.total} · {practiceResume.answered ? `${practiceResume.score}/${practiceResume.answered} correct` : "nothing checked yet"}</p></div><div className="resume-actions"><button className="btn primary" onClick={onResumePractice}>Resume practice</button><button className="btn ghost" onClick={onDiscardPractice}>Discard</button></div></section>}
    {!practiceResume && !examResume && <section className="card next-session" aria-labelledby="next-session-title"><div><p className="eyebrow">Recommended next session</p><h2 id="next-session-title">{recommendation.title}</h2><p className="muted">{recommendation.description}</p></div><button className="btn primary" onClick={() => onRecommend(recommendation)}>{recommendation.kind === "learn" ? "Start learning" : recommendation.kind === "lab" ? "Open exercise" : "Start recommended session"}</button></section>}
    <section className="card" aria-label="Course progress"><div className="stat-row dashboard-stats">
      <div className="stat"><b>{metrics.covered}/{questions.length}</b><span>questions covered</span></div>
      <div className="stat"><b>{metrics.accuracy === null ? "—" : `${metrics.accuracy}%`}</b><span>accuracy · all attempts</span></div>
      <div className="stat"><b>{metrics.due}</b><span>review due</span></div>
      <div className="stat"><b>{lastExam ? `${lastExam.percent}%` : "—"}</b><span>last mock</span></div>
    </div><p className="muted progress-note">Coverage is not mastery. {metrics.recalled} question{metrics.recalled === 1 ? "" : "s"} recalled correctly across at least three scheduled checks.</p>{hasSummary && <button className="btn tiny ghost" onClick={() => onNav("summary")}>View last practice summary</button>}</section>
    <section className="card quick-session" aria-labelledby="quick-session-title"><div><h2 id="quick-session-title">A session that fits your time</h2><p className="muted">Choose your question limit. You can finish early without a penalty.</p></div><div className="session-controls"><label htmlFor="session-size">Questions per session</label><select id="session-size" value={sessionSize} onChange={(event) => setSessionSize(Number(event.target.value))}>{[5, 10, 20].map((size) => <option key={size} value={size}>{size} questions</option>)}</select><button className="btn primary" onClick={() => onQuickQuiz(sessionSize)}>Quick quiz</button></div></section>
    <h2 className="section-title">Study by topic</h2>
    <div className="topic-list">{topics.map((topic) => {
      const progress = topicMetrics(topic.ids, state);
      const lesson = lessons?.find((item) => item.topic === topic.name);
      return <section className="card topic-row" key={topic.name}><div className="topic-info"><h3>{topic.name}</h3><p className="muted">Coverage {progress.covered}/{progress.total} · {progress.accuracy === null ? "not practised yet" : `${progress.accuracy}% accuracy`} · {progress.due} due</p><div className="progress slim" role="progressbar" aria-label={`${topic.name} coverage`} aria-valuemin={0} aria-valuemax={topic.ids.length} aria-valuenow={progress.covered} aria-valuetext={`${progress.covered} of ${topic.ids.length} attempted; this is coverage, not mastery`}><div className="progress-bar" style={{ width: `${progress.covered / progress.total * 100}%` }} /></div><p className="muted evidence-note">{progress.enoughEvidence ? `${progress.recalled}/${progress.total} recalled over time` : "Not enough practice yet to judge understanding."}</p></div><div className="topic-actions">{lesson && <button className="btn ghost" onClick={() => onLearn(lesson.id)}>Learn topic</button>}<button className="btn ghost" onClick={() => onStartTopic(topic.name, sessionSize)}>Practice</button></div></section>;
    })}</div>
    <h2 className="section-title">More ways to study</h2><div className="mode-grid compact-modes">
      <button className="mode card" onClick={() => onNav("review")}><h2>Recall review</h2><p>Revisit mistakes and questions due for a spaced recall check.</p></button>
      <button className="mode card" onClick={() => onNav("exam")}><h2>Timed mock exam</h2><p>{examSize} questions · {meta.exam.minutes} minutes · {meta.exam.passPercent}% study pass mark.</p></button>
      {lab && <button className="mode card" onClick={() => onNav("lab")}><h2>Code lab</h2><p>{lab.sets.length} guided exercises with hints, explanations and saved drafts.</p></button>}
      <button className="mode card" onClick={() => onNav("library")}><h2>Library</h2><p>Search questions, read explanations, and back up your progress.</p></button>
    </div>
    <p className="muted local-note">Saved in this browser, not synced across devices. Use Library → Progress to make a backup.</p>
  </div>;
}
