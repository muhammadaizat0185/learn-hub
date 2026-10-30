import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { useCourse } from "../courseContext";
import { downloadProgressBackup, parseProgressBackup, restoreProgressBackup } from "../lib/backup";
import { dueReviewIds, load } from "../lib/storage";
import { loadLabProgress } from "../lib/lab";
import type { Question } from "../types";
import AnswerExplanation from "./AnswerExplanation";
import Stem from "./Stem";

const LIST_LIMIT = 150;

const TABS = [
  { id: "questions", label: "Question bank" },
  { id: "progress", label: "Progress" },
] as const;

type LibraryTab = (typeof TABS)[number]["id"];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function LibraryView({
  onPracticeOne, onReset, onRestored, detail, onNavigate,
}: {
  onPracticeOne: (q: Question) => void;
  onReset: () => void;
  onRestored: () => void;
  detail?: string;
  onNavigate: (detail: string) => void;
}) {
  const tab: LibraryTab = detail === "progress" ? "progress" : "questions";
  const setTab = (next: LibraryTab) => onNavigate(next);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    setTab(TABS[target].id);
    tabRefs.current[target]?.focus();
  }

  return (
    <div className="library">
      <h1>Library</h1>
      <p className="muted">
        The full question bank with explanations, plus your saved progress and mock exam history.
      </p>

      <div className="lib-tabs" role="tablist" aria-label="Library sections">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            id={`lib-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`lib-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={"lib-tab" + (tab === item.id ? " current" : "")}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="lib-panel"
        role="tabpanel"
        id={`lib-panel-${tab}`}
        aria-labelledby={`lib-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "questions" && <QuestionBank onPracticeOne={onPracticeOne} selected={detail?.startsWith("q-") ? Number(detail.slice(2)) : null} onSelect={(id) => onNavigate(id === null ? "questions" : `q-${id}`)} />}
        {tab === "progress" && <ProgressPanel onReset={onReset} onRestored={onRestored} />}
      </div>
    </div>
  );
}

function QuestionBank({ onPracticeOne, selected, onSelect: setSelected }: { onPracticeOne: (q: Question) => void; selected: number | null; onSelect: (id: number | null) => void }) {
  const { questions, topics } = useCourse();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter((q) => {
      if (topic !== "all" && q.topic !== topic) return false;
      if (!needle) return true;
      return (
        String(q.id) === needle ||
        `q${q.id}` === needle ||
        q.question.toLowerCase().includes(needle) ||
        q.topic.toLowerCase().includes(needle) ||
        q.options.some((option) => option.text.toLowerCase().includes(needle))
      );
    });
  }, [questions, query, topic]);

  const question = selected === null ? null : questions.find((q) => q.id === selected) ?? null;

  useEffect(() => {
    if (question) detailRef.current?.focus();
  }, [question]);

  function backToResults() {
    setSelected(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  if (question) {
    return (
      <QuestionDetail
        question={question}
        headingRef={detailRef}
        onBack={backToResults}
        onPracticeOne={onPracticeOne}
      />
    );
  }

  const shown = results.slice(0, LIST_LIMIT);

  return (
    <div className="bank">
      <label className="search-label" htmlFor="bank-search">
        Search questions
      </label>
      <input
        ref={searchRef}
        id="bank-search"
        className="search"
        type="search"
        value={query}
        placeholder="Question text, option text, Q30…"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="bank-filters">
        <label htmlFor="bank-topic">Filter by topic</label>
        <select id="bank-topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="all">All {questions.length} questions</option>
          {topics.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name} ({group.ids.length})
            </option>
          ))}
        </select>
      </div>
      <p className="muted result-count" role="status" aria-live="polite">
        {results.length} match{results.length === 1 ? "" : "es"}
        {results.length > LIST_LIMIT ? ` · showing the first ${LIST_LIMIT}` : ""}
      </p>
      {results.length === 0 ? (
        <p className="empty">No question matches those filters.</p>
      ) : (
        <ul className="bank-list">
          {shown.map((q) => (
            <li key={q.id}>
              <button className="bank-item" onClick={() => setSelected(q.id)}>
                <span className="bank-id">Q{q.id}</span>
                <span className="bank-main">
                  <span className="bank-title">
                    {q.type === "multi" ? "Multiple answer" : "Multiple choice"} · {q.topic}
                  </span>
                  <span className="muted bank-snippet">
                    {q.question.replace(/\s+/g, " ").slice(0, 130)}
                    {q.question.length > 130 ? "…" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionDetail({
  question,
  headingRef,
  onBack,
  onPracticeOne,
}: {
  question: Question;
  headingRef: RefObject<HTMLHeadingElement>;
  onBack: () => void;
  onPracticeOne: (q: Question) => void;
}) {
  const { meta } = useCourse();
  const stat = load(meta.id).stats[question.id];
  const attempts = stat?.seen ?? 0;
  const correct = stat?.correct ?? 0;

  return (
    <div className="question-detail">
      <div className="quiz-top">
        <button className="btn ghost" onClick={onBack}>
          ← Back to results
        </button>
        <button className="btn primary" onClick={() => onPracticeOne(question)}>
          Practice this one
        </button>
      </div>

      <h2 className="detail-title" ref={headingRef} tabIndex={-1}>
        Q{question.id}
        <span className="muted">
          {" "}
          · {question.type === "multi" ? "Multiple answer" : "Multiple choice"} · {question.topic}
        </span>
      </h2>

      <p className="muted detail-stats">
        {attempts === 0
          ? "Not attempted yet"
          : `${attempts} attempt${attempts === 1 ? "" : "s"} · ${correct} correct · ${
              attempts - correct
            } missed`}
      </p>

      <Stem text={question.question} />
      <div className="options">
        {question.options.map((option) => {
          const isCorrect = question.answer.includes(option.letter);
          return (
            <div className={"option" + (isCorrect ? " correct" : "")} key={option.letter}>
              <span className="letter">{option.letter}</span>
              <span>
                {isCorrect && <span className="sr-only">Correct answer. </span>}
                {option.text}
              </span>
            </div>
          );
        })}
      </div>
      <AnswerExplanation key={question.id} question={question} />
    </div>
  );
}

function ProgressPanel({ onReset, onRestored }: { onReset: () => void; onRestored: () => void }) {
  const { meta, questions, lab } = useCourse();
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const state = useMemo(() => load(meta.id), [meta.id, revision]);

  const attempted = questions.filter((q) => state.stats[q.id]?.seen).length;
  const openWrong = dueReviewIds(state).filter((id) => questions.some((q) => q.id === id)).length;
  const labProgress = loadLabProgress(meta.id);
  const solvedLabs = lab?.sets.filter((set) => labProgress.sets[set.id]?.solved).length ?? 0;

  function exportBackup() {
    const name = downloadProgressBackup(meta.id, state);
    setError("");
    setMessage(`Exported ${name}.`);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    setError("");
    if (file.size > 5 * 1024 * 1024) { setError("That file is too large for a course backup (5 MB maximum)."); return; }
    let text: string;
    try { text = await file.text(); } catch { setError("That file could not be read. Try selecting it again."); return; }
    const parsed = parseProgressBackup(text, meta.id);
    if (!parsed.ok) { setError(parsed.error); return; }
    const labCount = parsed.labProgress ? Object.keys(parsed.labProgress.sets).length : 0;
    const preview = `${Object.keys(parsed.state.stats).length} question records, ${parsed.state.examHistory.length} exam results${parsed.labProgress ? `, ${labCount} lab records and ${Object.keys(parsed.labDrafts ?? {}).length} lab drafts` : ". This older backup has no lab data; your existing lab results and drafts will be kept"}`;
    if (!window.confirm(`Restore ${preview}? This replaces this course's progress and clears active practice/exam sessions and recent result screens. Timed exams are never restored. Export your current progress first if you need to keep it.`)) return;
    if (!restoreProgressBackup(meta.id, parsed)) { setError("Restore could not be completed because browser storage is unavailable. Your previous data was retained where possible; keep both backup files."); return; }
    onRestored();
    setRevision((value) => value + 1);
    setMessage(`Restored ${Object.keys(parsed.state.stats).length} question records and ${parsed.state.examHistory.length} exam results${parsed.labProgress ? `, with ${labCount} lab records` : "; existing lab progress was kept"}. Active sessions were cleared.`);
  }

  return (
    <div className="progress-panel">
      <div className="progress-summary">
        <div>
          <b>{attempted}</b>
          <span>questions attempted</span>
        </div>
        <div>
          <b>{openWrong}</b>
          <span>reviews due now</span>
        </div>
        <div>
          <b>{state.examHistory.length}</b>
          <span>mock exams taken</span>
        </div>
        {lab && <div><b>{solvedLabs}/{lab.sets.length}</b><span>labs solved</span></div>}
      </div>

      <section className="card" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Backup and restore</h2>
        <p className="muted">
          Export this course's question stats, review schedule, mock exam history, lab results and
          lab drafts. You can import the file on another device. Active practice/exam sessions and
          recent result screens are not included; restoring clears them so they cannot change restored progress.
          Nothing is uploaded and there is no automatic cross-device sync.
        </p>
        <div className="btn-row start">
          <button className="btn primary" onClick={exportBackup}>
            Export progress
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            Import backup…
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={importBackup}
          />
        </div>
        {message && (
          <p className="feedback good" role="status" aria-live="polite">
            {message}
          </p>
        )}
        {error && (
          <p className="feedback bad" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Mock exam history</h2>
        {state.examHistory.length === 0 ? (
          <p className="empty">No completed mock exams yet.</p>
        ) : (
          <ul className="exam-history">
            {[...state.examHistory].reverse().map((entry, index) => (
              <li key={`${entry.date}-${index}`}>
                <span className="muted">{formatDate(entry.date)}</span>
                <b className={entry.passed ? "pass-text" : "fail-text"}>
                  {entry.percent}% {entry.passed ? "Pass" : "Below pass"}
                </b>
                <span className="muted">
                  {entry.raw}/{entry.total} correct
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card danger-zone" aria-labelledby="reset-heading">
        <h2 id="reset-heading">Reset progress</h2>
        <p className="muted">
          Clears question stats, review schedules, mock exam history, lab results, lab drafts and
          all active sessions and recent summaries for this course on this device. Display preferences
          and other courses are not changed. Export a backup first if you want to keep your progress.
        </p>
        <button className="btn danger" onClick={onReset}>
          Reset all progress…
        </button>
      </section>
    </div>
  );
}
