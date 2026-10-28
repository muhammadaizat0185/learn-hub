import { useEffect, useMemo, useRef, useState } from "react";
import CodeLab from "./components/CodeLab";
import CourseHome from "./components/CourseHome";
import CoursePicker from "./components/CoursePicker";
import ExamResults from "./components/ExamResults";
import LibraryView from "./components/LibraryView";
import { ExamQuiz, PracticeQuiz } from "./components/QuizEngine";
import ReviewView from "./components/ReviewView";
import { CourseProvider } from "./courseContext";
import { listCourses, loadCourse } from "./courses";
import type { ExamSummary } from "./lib/grading";
import {
  gradeExam,
  isAnswered,
  isPass,
  percentScore,
  remainingSeconds,
} from "./lib/grading";
import { clearExamSession, loadExamSession, saveExamSession } from "./lib/examSession";
import type { ExamSession } from "./lib/examSession";
import {
  clearPracticeSession,
  loadPracticeSession,
  practiceScore,
  savePracticeSession,
} from "./lib/practiceSession";
import type { PracticeAnswer, PracticeSession } from "./lib/practiceSession";
import { addExamResult, recordAnswer, resetProgress } from "./lib/storage";
import { resetLabProgress } from "./lib/lab";
import type { CourseData, ExamAnswer, Question, View } from "./types";

type Route = { kind: "picker" } | { kind: "course"; id: string };

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const match = /^c\/([A-Za-z0-9_-]+)$/.exec(hash);
  return match ? { kind: "course", id: match[1] } : { kind: "picker" };
}

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
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  if (route.kind === "course") {
    return (
      <CourseShell
        key={route.id}
        id={route.id}
        onExit={() => {
          window.location.hash = "#/";
        }}
      />
    );
  }

  return (
    <div className="app">
      <CoursePicker
        courses={courses}
        onOpen={(id) => {
          window.location.hash = `#/c/${id}`;
        }}
      />
    </div>
  );
}

function CourseShell({ id, onExit }: { id: string; onExit: () => void }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: CourseData }
  >({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadCourse(id)
      .then((data) => {
        if (live) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      live = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="app">
        <p className="muted loading">Loading course…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="app">
        <div className="card">
          <h1>Course not available</h1>
          <p className="muted">{state.message}</p>
          <button className="btn primary" onClick={onExit}>
            All courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <CourseProvider data={state.data}>
      <CourseApp data={state.data} onExit={onExit} />
    </CourseProvider>
  );
}

function CourseApp({ data, onExit }: { data: CourseData; onExit: () => void }) {
  const { meta, questions, topics, questionById } = data;
  const [view, setView] = useState<View>("home");
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(() =>
    restorePracticeSession(data)
  );
  const [examSession, setExamSession] = useState<ExamSession | null>(() =>
    restoreExamSession(data)
  );
  const [examSummary, setExamSummary] = useState<ExamSummary | null>(null);
  const finishing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const initialView = useRef(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (initialView.current) {
      initialView.current = false;
      return;
    }
    if (view === "quiz" || view === "exam") return;
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);

  function storePractice(next: PracticeSession) {
    savePracticeSession(meta.id, next);
    setPracticeSession(next);
  }

  function beginPractice(questionsIn: Question[], label: string, source: PracticeSession["source"]) {
    if (questionsIn.length === 0) return;
    const session: PracticeSession = {
      version: 1,
      label,
      source,
      questionIds: questionsIn.map((q) => q.id),
      index: 0,
      answers: {},
      revealed: [],
      startedAt: Date.now(),
    };
    storePractice(session);
    setExamSummary(null);
    setView("quiz");
  }

  function startRandomQuiz() {
    beginPractice(shuffle(questions).slice(0, 20), "Quick quiz", "practice");
  }

  function startTopic(topicName: string) {
    const group = topics.find((topic) => topic.name === topicName);
    if (!group) return;
    const topicQuestions = group.ids
      .map((qid) => questionById.get(qid))
      .filter((q): q is Question => !!q);
    beginPractice(shuffle(topicQuestions), topicName, "practice");
  }

  function startDrill(missed: Question[]) {
    beginPractice(shuffle(missed), "Mistake drill", "review");
  }

  function retryExamMisses(missed: Question[]) {
    beginPractice(shuffle(missed), "Exam mistakes", "review");
  }

  function startSingle(question: Question) {
    beginPractice([question], `Q${question.id}`, "practice");
  }

  function answerPractice(qid: number, answer: PracticeAnswer) {
    if (!practiceSession || practiceSession.revealed.includes(qid)) return;
    storePractice({
      ...practiceSession,
      answers: { ...practiceSession.answers, [qid]: answer },
    });
  }

  function revealPractice(qid: number) {
    if (!practiceSession || practiceSession.revealed.includes(qid)) return;
    storePractice({
      ...practiceSession,
      revealed: [...practiceSession.revealed, qid],
    });
  }

  function indexPractice(index: number) {
    if (!practiceSession) return;
    const clamped = Math.max(0, Math.min(practiceSession.questionIds.length - 1, index));
    storePractice({ ...practiceSession, index: clamped });
  }

  function exitPractice() {
    setView("home");
  }

  function finishPractice() {
    const wasReview = practiceSession?.source === "review";
    clearPracticeSession(meta.id);
    setPracticeSession(null);
    setView(wasReview ? "review" : "home");
  }

  function resumePractice() {
    if (practiceSession) setView("quiz");
  }

  function discardPractice() {
    if (!practiceSession) return;
    if (!confirm("Discard this practice session? Answers you already checked stay in your stats.")) {
      return;
    }
    clearPracticeSession(meta.id);
    setPracticeSession(null);
  }

  function startExam() {
    const size = Math.min(meta.exam.questions, questions.length);
    const picked = shuffle(questions).slice(0, size);
    const now = Date.now();
    const session: ExamSession = {
      version: 1,
      questionIds: picked.map((q) => q.id),
      answers: {},
      index: 0,
      startedAt: now,
      deadline: now + meta.exam.minutes * 60 * 1000,
      flags: [],
    };
    finishing.current = false;
    saveExamSession(meta.id, session);
    setExamSession(session);
    setExamSummary(null);
    setView("exam");
  }

  function answerExamQuestion(id: number, answer: ExamAnswer) {
    setExamSession((current) => {
      if (!current) return current;
      const next = { ...current, answers: { ...current.answers, [id]: answer } };
      saveExamSession(meta.id, next);
      return next;
    });
  }

  function setExamIndex(index: number) {
    setExamSession((current) => {
      if (!current) return current;
      const next = { ...current, index };
      saveExamSession(meta.id, next);
      return next;
    });
  }

  function toggleExamFlag(id: number) {
    setExamSession((current) => {
      if (!current) return current;
      const flags = current.flags.includes(id)
        ? current.flags.filter((flag) => flag !== id)
        : [...current.flags, id];
      const next = { ...current, flags };
      saveExamSession(meta.id, next);
      return next;
    });
  }

  function finishExam(auto: boolean) {
    if (finishing.current || !examSession) return;
    finishing.current = true;

    const examQuestions = examSession.questionIds
      .map((id) => questionById.get(id))
      .filter((q): q is Question => !!q);
    const graded = gradeExam(examQuestions, examSession.answers);
    const raw = graded.filter((g) => g.correct).length;
    const percent = percentScore(raw, graded.length);
    const passed = isPass(percent, meta.exam.passPercent);

    for (const g of graded) {
      if (!isAnswered(g.answer)) continue;
      recordAnswer(meta.id, g.q.id, g.correct, "exam");
    }
    if (graded.length > 0) {
      addExamResult(meta.id, {
        date: new Date().toISOString(),
        raw,
        total: graded.length,
        percent,
        passed,
      });
    }

    clearExamSession(meta.id);
    setExamSession(null);
    setExamSummary({
      graded,
      raw,
      total: graded.length,
      percent,
      passed,
      passPercent: meta.exam.passPercent,
      autoSubmitted: auto,
    });
    setView("exam");
  }

  function abandonExam() {
    if (!confirm("Abandon this exam? Your answers will be discarded.")) return;
    clearExamSession(meta.id);
    setExamSession(null);
    setExamSummary(null);
    setView("home");
  }

  function resetAll() {
    if (!confirm("Reset all progress? This also discards any exam or practice session.")) return;
    clearExamSession(meta.id);
    clearPracticeSession(meta.id);
    setPracticeSession(null);
    setExamSession(null);
    setExamSummary(null);
    resetProgress(meta.id);
    resetLabProgress(meta.id);
    setView("home");
  }

  function goTo(next: View) {
    if (next !== "exam") setExamSummary(null);
    setView(next);
  }

  useEffect(() => {
    if (view !== "exam" || !examSession || examSummary) return;
    if (remainingSeconds(examSession.deadline) > 0) return;
    finishExam(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, examSession, examSummary]);

  const examResume = examSession
    ? {
        answered: examSession.questionIds.filter((id) => isAnswered(examSession.answers[id]))
          .length,
        total: examSession.questionIds.length,
        deadline: examSession.deadline,
      }
    : null;

  const practiceResume = practiceSession
    ? {
        label: practiceSession.label,
        index: practiceSession.index,
        total: practiceSession.questionIds.length,
        ...practiceScore(practiceSession, questionById),
      }
    : null;

  const examSize = Math.min(meta.exam.questions, questions.length);

  const body = useMemo(() => {
    switch (view) {
      case "quiz": {
        if (!practiceSession) return null;
        const sessionQuestions = practiceSession.questionIds
          .map((id) => questionById.get(id))
          .filter((q): q is Question => !!q);
        return (
          <PracticeQuiz
            session={practiceSession}
            questions={sessionQuestions}
            onAnswer={answerPractice}
            onReveal={revealPractice}
            onIndex={indexPractice}
            onExit={exitPractice}
            onFinish={finishPractice}
          />
        );
      }
      case "review":
        return <ReviewView onStartDrill={startDrill} />;
      case "lab":
        return <CodeLab />;
      case "library":
        return <LibraryView onPracticeOne={startSingle} onReset={resetAll} />;
      case "exam": {
        if (examSummary) {
          return (
            <ExamResults
              summary={examSummary}
              onRetake={startExam}
              onRetryMissed={retryExamMisses}
              onHome={() => {
                setExamSummary(null);
                setView("home");
              }}
            />
          );
        }
        if (examSession) {
          if (remainingSeconds(examSession.deadline) === 0) {
            return (
              <div className="exam-intro card">
                <h1>Time expired</h1>
                <p className="muted">Grading your saved answers…</p>
              </div>
            );
          }
          const sessionQuestions = examSession.questionIds
            .map((id) => questionById.get(id))
            .filter((q): q is Question => !!q);
          return (
            <ExamQuiz
              questions={sessionQuestions}
              answers={examSession.answers}
              index={examSession.index}
              deadline={examSession.deadline}
              flags={examSession.flags}
              onAnswer={answerExamQuestion}
              onIndexChange={setExamIndex}
              onToggleFlag={toggleExamFlag}
              onFinish={finishExam}
              onAbandon={abandonExam}
            />
          );
        }
        return (
          <div className="exam-intro card">
            <h1>Timed mock exam</h1>
            <p className="muted">
              {examSize} questions in {meta.exam.minutes} minutes, drawn at random from the full
              bank. The pass mark is {meta.exam.passPercent}%. Answers save automatically, and the
              timer keeps running if you leave. Unanswered questions count as incorrect, and missed
              answers feed your review deck.
            </p>
            <button className="btn primary" onClick={startExam}>
              Start exam
            </button>
          </div>
        );
      }
      default:
        return (
          <CourseHome
            examResume={examResume}
            practiceResume={practiceResume}
            onResumePractice={resumePractice}
            onDiscardPractice={discardPractice}
            onNav={(target) => {
              if (target === "quiz") startRandomQuiz();
              else goTo(target);
            }}
            onStartTopic={startTopic}
          />
        );
    }
  }, [view, practiceSession, examSession, examSummary, examResume, practiceResume, data]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <button className="brand" onClick={() => goTo("home")}>
          Learn<span>.</span> <em>{meta.shortTitle}</em>
        </button>
        <nav aria-label="Course">
          <button className={view === "home" || view === "quiz" ? "active" : ""} onClick={() => goTo("home")}>
            Home
          </button>
          <button className={view === "review" ? "active" : ""} onClick={() => goTo("review")}>
            Review
          </button>
          <button className={view === "exam" ? "active" : ""} onClick={() => goTo("exam")}>
            Mock exam
          </button>
          <button className={view === "library" ? "active" : ""} onClick={() => goTo("library")}>
            Library
          </button>
          {data.lab && (
            <button className={view === "lab" ? "active" : ""} onClick={() => goTo("lab")}>
              Code lab
            </button>
          )}
          <button onClick={onExit}>All courses</button>
        </nav>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {body}
      </main>
    </div>
  );
}
