import { useEffect, useMemo, useRef, useState } from "react";
import CodeLab from "./components/CodeLab";
import CourseHome from "./components/CourseHome";
import CoursePicker from "./components/CoursePicker";
import DisplaySettings from "./components/DisplaySettings";
import ExamResults from "./components/ExamResults";
import LearningPath from "./components/LearningPath";
import LibraryView from "./components/LibraryView";
import PracticeResults from "./components/PracticeResults";
import ReplacePracticeDialog from "./components/ReplacePracticeDialog";
import { ExamQuiz, PracticeQuiz } from "./components/QuizEngine";
import ReviewView from "./components/ReviewView";
import { CourseProvider } from "./courseContext";
import { listCourses, loadCourse } from "./courses";
import type { ExamSummary } from "./lib/grading";
import { gradeExam, isAnswered, isPass, percentScore, remainingSeconds, sameSet } from "./lib/grading";
import { clearExamSession, loadExamSession, saveExamSession } from "./lib/examSession";
import type { ExamSession } from "./lib/examSession";
import { clearExamResult, loadExamResult, saveExamResult } from "./lib/examResult";
import { clearPracticeSession, loadPracticeSession, practiceScore, savePracticeSession } from "./lib/practiceSession";
import type { PracticeAnswer, PracticeSession } from "./lib/practiceSession";
import { buildPracticeSummary, clearPracticeSummary, loadPracticeSummary, savePracticeSummary } from "./lib/practiceSummary";
import type { PracticeSummary } from "./lib/practiceSummary";
import { addExamResult, recordAnswer, recordUnanswered, resetProgress } from "./lib/storage";
import { resetLabProgress } from "./lib/lab";
import { resetLabDrafts } from "./lib/labDrafts";
import { selectQuestions } from "./lib/study";
import type { Recommendation } from "./lib/study";
import { initDisplayPreferences } from "./lib/preferences";
import { courseUrl, navigateCourse, readRoute } from "./lib/routes";
import type { Route } from "./lib/routes";
import type { CourseData, ExamAnswer, Question, View } from "./types";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function restorePracticeSession(data: CourseData): PracticeSession | null {
  const saved = loadPracticeSession(data.meta.id);
  if (!saved) return null;
  if (saved.questionIds.every((id) => data.questionById.has(id))) return saved;
  clearPracticeSession(data.meta.id);
  return null;
}
function restoreExamSession(data: CourseData): ExamSession | null {
  const saved = loadExamSession(data.meta.id);
  if (!saved) return null;
  if (saved.questionIds.every((id) => data.questionById.has(id))) return saved;
  clearExamSession(data.meta.id);
  return null;
}

export default function App() {
  const courses = useMemo(() => listCourses(), []);
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(initDisplayPreferences, []);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    const failed = () => setStorageFailed(true);
    window.addEventListener("hashchange", update);
    window.addEventListener("hub-storage-error", failed);
    return () => { window.removeEventListener("hashchange", update); window.removeEventListener("hub-storage-error", failed); };
  }, []);
  const exit = () => { window.location.hash = "#/"; };
  return <>
    {storageFailed && <div className="storage-warning" role="alert">Browser storage is full or unavailable. Some work is only kept in this tab. Export your progress before closing.</div>}
    {route.kind === "course" ? <CourseShell key={route.id} route={route} onExit={exit} /> :
      route.kind === "picker" ? <div className="app"><CoursePicker courses={courses} onOpen={(id) => navigateCourse(id)} onSettings={() => { window.location.hash = "#/settings"; }} /></div> :
      <div className="app"><header className="topbar"><button className="btn ghost" onClick={exit}>All courses</button></header><main>
        {route.kind === "settings" ? <DisplaySettings /> : <div className="card"><h1>Page not found</h1><p>This link is not available. Choose a course to continue.</p><button className="btn primary" onClick={exit}>Browse courses</button></div>}
      </main></div>}
  </>;
}

function CourseShell({ route, onExit }: { route: Extract<Route, { kind: "course" }>; onExit: () => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: CourseData }>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadCourse(route.id).then((data) => { if (live) setState({ status: "ready", data }); }).catch(() => { if (live) setState({ status: "error" }); });
    return () => { live = false; };
  }, [route.id]);
  if (state.status === "loading") return <div className="app"><p className="muted loading" role="status">Loading course…</p></div>;
  if (state.status === "error") return <div className="app"><div className="card"><h1>Course not available</h1><p className="muted">We could not load this course. Check the link or try again when connected.</p><button className="btn primary" onClick={onExit}>All courses</button></div></div>;
  return <CourseProvider data={state.data}><CourseApp data={state.data} route={route} onExit={onExit} /></CourseProvider>;
}

type PendingPractice = { questions: Question[]; label: string; source: PracticeSession["source"] };
function CourseApp({ data, route, onExit }: { data: CourseData; route: Extract<Route, { kind: "course" }>; onExit: () => void }) {
  const { meta, questions, topics, questionById } = data;
  const { view, detail } = route;
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(() => restorePracticeSession(data));
  const [examSession, setExamSession] = useState<ExamSession | null>(() => restoreExamSession(data));
  const [examSummary, setExamSummary] = useState<ExamSummary | null>(() => loadExamResult(data));
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummary | null>(() => loadPracticeSummary(meta.id));
  const [pendingPractice, setPendingPractice] = useState<PendingPractice | null>(null);
  const [revision, setRevision] = useState(0);
  const [sessionNotice, setSessionNotice] = useState("");
  const finishing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const goTo = (next: View, selected?: string) => navigateCourse(meta.id, next, selected);

  useEffect(() => {
    function syncFromOtherTab(event: StorageEvent) {
      const prefix = `hub.v1.course.${meta.id}.`;
      if (event.key !== null && !event.key.startsWith(prefix) && event.key !== `hub.v1.lab.${meta.id}` && event.key !== `hub.v1.lab-drafts.${meta.id}`) return;
      setPracticeSession(restorePracticeSession(data));
      setExamSession(restoreExamSession(data));
      setExamSummary(loadExamResult(data));
      setPracticeSummary(loadPracticeSummary(meta.id));
      setPendingPractice(null);
      setRevision((n) => n + 1);
      setSessionNotice("This course was updated in another tab. The latest saved work is now shown.");
    }
    window.addEventListener("storage", syncFromOtherTab);
    return () => window.removeEventListener("storage", syncFromOtherTab);
  }, [data, meta.id]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${meta.shortTitle} · ${view === "home" ? "Learn" : view.charAt(0).toUpperCase() + view.slice(1)} · Learn`;
    // Respect focus already placed by a child heading or a keyboard-operated tab.
    if (view !== "quiz" && view !== "exam" && !mainRef.current?.contains(document.activeElement)) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [view, detail, meta.shortTitle]);

  function storePractice(next: PracticeSession) { savePracticeSession(meta.id, next); setPracticeSession(next); }
  function commitPractice(next: PendingPractice) {
    storePractice({ version: 1, label: next.label, source: next.source, questionIds: next.questions.map((q) => q.id), index: 0, answers: {}, revealed: [], startedAt: Date.now() });
    setPendingPractice(null);
    goTo("quiz");
  }
  function beginPractice(questionsIn: Question[], label: string, source: PracticeSession["source"]) {
    if (!questionsIn.length) return;
    const next = { questions: questionsIn, label, source };
    if (practiceSession) { setPendingPractice(next); return; }
    commitPractice(next);
  }
  function startRandomQuiz(count = 10) { beginPractice(selectQuestions(questions, count), "Quick quiz", "practice"); }
  function startTopic(topicName: string, count = 10) {
    const group = topics.find((topic) => topic.name === topicName);
    if (group) beginPractice(selectQuestions(group.ids.map((id) => questionById.get(id)!), count), topicName, "practice");
  }
  function startDrill(missed: Question[]) { beginPractice(shuffle(missed).slice(0, 20), "Recall review", "review"); }
  function practiceIds(ids: number[], label = "Focused practice", source: PracticeSession["source"] = "review") {
    beginPractice(shuffle(ids.map((id) => questionById.get(id)).filter((q): q is Question => !!q)).slice(0, 20), label, source);
  }
  function followRecommendation(item: Recommendation) {
    if (item.kind === "learn") goTo("learn", item.lessonId);
    else if (item.kind === "lab") goTo("lab", item.labId);
    else practiceIds(item.questionIds ?? [], item.kind === "review" ? "Due review" : item.topic ?? "Focused practice", item.kind === "review" ? "review" : "practice");
  }
  function answerPractice(qid: number, answer: PracticeAnswer) {
    if (!practiceSession || practiceSession.revealed.includes(qid)) return;
    storePractice({ ...practiceSession, answers: { ...practiceSession.answers, [qid]: answer } });
  }
  function revealPractice(qid: number) {
    if (!practiceSession || practiceSession.revealed.includes(qid)) return;
    const question = questionById.get(qid);
    if (!question) return;
    recordAnswer(meta.id, qid, sameSet(practiceSession.answers[qid]?.letters ?? [], question.answer), practiceSession.source);
    storePractice({ ...practiceSession, revealed: [...practiceSession.revealed, qid] });
  }
  function finishPractice() {
    if (!practiceSession) return;
    const summary = buildPracticeSummary(practiceSession, questionById);
    savePracticeSummary(meta.id, summary); setPracticeSummary(summary);
    clearPracticeSession(meta.id); setPracticeSession(null); goTo("summary");
  }
  function discardPractice() {
    if (!practiceSession || !confirm("Discard this practice draft? Answers already checked stay in your stats.")) return;
    clearPracticeSession(meta.id); setPracticeSession(null);
  }
  function startExam() {
    if (examSession) { goTo("exam"); return; }
    const picked = shuffle(questions).slice(0, Math.min(meta.exam.questions, questions.length));
    const now = Date.now();
    const session: ExamSession = { version: 1, questionIds: picked.map((q) => q.id), answers: {}, index: 0, startedAt: now, deadline: now + meta.exam.minutes * 60 * 1000, flags: [] };
    finishing.current = false;
    saveExamSession(meta.id, session); setExamSession(session);
    setExamSummary(null); clearExamResult(meta.id); goTo("exam");
  }
  function updateExam(next: ExamSession) { saveExamSession(meta.id, next); setExamSession(next); }
  async function finishExam(auto: boolean) {
    if (finishing.current || !examSession) return;
    finishing.current = true;
    const requested = examSession;
    function gradeSavedExam() {
      // Re-read while holding the cross-tab lock: another tab may have submitted,
      // replaced, reset or restored this exam while this callback was waiting.
      const saved = restoreExamSession(data);
      if (!saved || saved.startedAt !== requested.startedAt || saved.deadline !== requested.deadline || saved.questionIds.join(",") !== requested.questionIds.join(",")) {
        const summary = loadExamResult(data);
        setExamSession(saved); setExamSummary(summary);
        goTo("exam", !saved && summary ? "results" : undefined);
        return;
      }
      const graded = gradeExam(saved.questionIds.map((id) => questionById.get(id)!), saved.answers);
      const raw = graded.filter((g) => g.correct).length;
      const percent = percentScore(raw, graded.length);
      const passed = isPass(percent, meta.exam.passPercent);
      for (const g of graded) {
        if (!isAnswered(g.answer)) recordUnanswered(meta.id, g.q.id);
        else recordAnswer(meta.id, g.q.id, g.correct, "exam");
      }
      if (graded.length) addExamResult(meta.id, { date: new Date().toISOString(), raw, total: graded.length, percent, passed });
      const summary: ExamSummary = { graded, raw, total: graded.length, percent, passed, passPercent: meta.exam.passPercent, autoSubmitted: auto };
      saveExamResult(meta.id, summary);
      clearExamSession(meta.id); setExamSession(null); setExamSummary(summary); goTo("exam", "results");
    }
    try {
      if (navigator.locks?.request) await navigator.locks.request(`hub:${meta.id}:exam-finish`, gradeSavedExam);
      else gradeSavedExam();
    } catch {
      setSessionNotice("The exam could not be submitted. Your saved answers are still available; try submitting again.");
    } finally {
      finishing.current = false;
    }
  }
  function abandonExam() {
    if (!confirm("Abandon this exam? Your answers will be discarded.")) return;
    clearExamSession(meta.id); setExamSession(null); setExamSummary(null); goTo("home");
  }
  function clearActiveState() {
    clearExamSession(meta.id); clearPracticeSession(meta.id); clearPracticeSummary(meta.id); clearExamResult(meta.id);
    setPracticeSession(null); setExamSession(null); setExamSummary(null); setPracticeSummary(null); setPendingPractice(null);
    setRevision((n) => n + 1);
  }
  function resetAll() {
    if (!confirm("Reset this course's question stats, review schedule, exam history, lab results, lab drafts and active sessions? Export a backup first to keep your progress.")) return;
    clearActiveState(); resetProgress(meta.id); resetLabProgress(meta.id); resetLabDrafts(meta.id); goTo("home");
  }
  useEffect(() => {
    if (view === "exam" && examSession && remainingSeconds(examSession.deadline) === 0) finishExam(true);
    // The saved deadline, never navigation, determines expiration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, examSession]);

  const examResume = examSession ? { answered: examSession.questionIds.filter((id) => isAnswered(examSession.answers[id])).length, total: examSession.questionIds.length, deadline: examSession.deadline } : null;
  const practiceResume = practiceSession ? { label: practiceSession.label, index: practiceSession.index, total: practiceSession.questionIds.length, ...practiceScore(practiceSession, questionById) } : null;
  const emptySession = (heading: string) => <div className="card"><h1>{heading}</h1><p className="muted">Start a session from your course home.</p><button className="btn primary" onClick={() => goTo("home")}>Course home</button></div>;
  function body() {
    switch (view) {
      case "quiz": return practiceSession ? <PracticeQuiz session={practiceSession} questions={practiceSession.questionIds.map((id) => questionById.get(id)!)} onAnswer={answerPractice} onReveal={revealPractice} onIndex={(index) => storePractice({ ...practiceSession, index: Math.max(0, Math.min(practiceSession.questionIds.length - 1, index)) })} onExit={() => goTo("home")} onFinish={finishPractice} /> : emptySession("No practice in progress");
      case "summary": return practiceSummary ? <PracticeResults summary={practiceSummary} onRetry={(ids) => practiceIds(ids)} onLearn={(id) => goTo("learn", id)} onLab={(id) => goTo("lab", id)} onHome={() => goTo("home")} onReview={() => goTo("review")} /> : emptySession("No recent practice summary");
      case "review": return <ReviewView onStartDrill={startDrill} onLearn={(id) => goTo("learn", id)} />;
      case "learn": return <LearningPath lessonId={detail} onSelect={(id) => goTo("learn", id)} onPractice={startTopic} onLab={(id) => goTo("lab", id)} onReview={() => goTo("review")} />;
      case "lab": return <CodeLab key={revision} selectedSetId={detail ?? null} onSelectSet={(id) => goTo("lab", id ?? undefined)} />;
      case "settings": return <DisplaySettings />;
      case "library": return <LibraryView detail={detail} onNavigate={(selected) => goTo("library", selected)} onPracticeOne={(q) => beginPractice([q], `Q${q.id}`, "practice")} onReset={resetAll} onRestored={clearActiveState} />;
      case "exam": {
        if (!examSession && examSummary && detail === "results") return <ExamResults summary={examSummary} onRetake={startExam} onRetryMissed={startDrill} onHome={() => goTo("home")} />;
        if (examSession) {
          if (!remainingSeconds(examSession.deadline)) return <div className="card"><h1>Time expired</h1><p>Grading your saved answers…</p><button className="btn ghost" onClick={() => void finishExam(true)}>Grade saved answers</button></div>;
          return <ExamQuiz questions={examSession.questionIds.map((id) => questionById.get(id)!)} answers={examSession.answers} index={examSession.index} deadline={examSession.deadline} flags={examSession.flags}
            onAnswer={(id: number, answer: ExamAnswer) => updateExam({ ...examSession, answers: { ...examSession.answers, [id]: answer } })}
            onIndexChange={(index) => updateExam({ ...examSession, index })}
            onToggleFlag={(id) => updateExam({ ...examSession, flags: examSession.flags.includes(id) ? examSession.flags.filter((flag) => flag !== id) : [...examSession.flags, id] })}
            onFinish={finishExam} onAbandon={abandonExam} />;
        }
        return <div className="exam-intro card"><h1>Timed mock exam</h1><p className="muted">{Math.min(meta.exam.questions, questions.length)} questions in {meta.exam.minutes} minutes. Pass mark {meta.exam.passPercent}%. Answers save automatically; the timer keeps running if you leave. Unanswered questions count as incorrect and are kept for follow-up review.</p><button className="btn primary" onClick={startExam}>Start exam</button>{examSummary && <button className="btn ghost" onClick={() => goTo("exam", "results")}>View last results</button>}</div>;
      }
      default: return <CourseHome key={revision} examResume={examResume} practiceResume={practiceResume} onResumePractice={() => goTo("quiz")} onDiscardPractice={discardPractice} onNav={(target) => goTo(target)} onQuickQuiz={startRandomQuiz} onStartTopic={startTopic} onRecommend={followRecommendation} onLearn={(id) => goTo("learn", id)} hasSummary={!!practiceSummary} />;
    }
  }
  const navigation: { view: View; label: string }[] = [{ view: "home", label: "Home" }, { view: "learn", label: "Learn" }, { view: "review", label: "Review" }, { view: "exam", label: "Mock exam" }, ...(data.lab ? [{ view: "lab" as View, label: "Code lab" }] : []), { view: "library", label: "Library" }];
  return <div className="app">
    <a className="skip-link" href={courseUrl(meta.id, view, detail)} onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to main content</a>
    <header className="topbar">
      <button className="brand" onClick={() => goTo("home")}>Learn<span>.</span> <em>{meta.shortTitle}</em></button>
      <div className="header-tools"><button className="btn tiny ghost" onClick={() => goTo("settings")}>Display</button><button className="btn tiny ghost" onClick={onExit}>All courses</button></div>
      <nav aria-label="Course">{navigation.map((item) => <button key={item.view} className={view === item.view ? "active" : ""} aria-current={view === item.view ? "page" : undefined} onClick={() => goTo(item.view)}>{item.label}</button>)}</nav>
    </header>
    <main id="main" ref={mainRef} tabIndex={-1}>{sessionNotice && <p className="hint" role="status">{sessionNotice}</p>}{body()}</main>
    {pendingPractice && practiceSession && <ReplacePracticeDialog currentLabel={practiceSession.label} nextLabel={pendingPractice.label} onResume={() => { setPendingPractice(null); goTo("quiz"); }} onReplace={() => commitPractice(pendingPractice)} onCancel={() => setPendingPractice(null)} />}
  </div>;
}
