import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useCourse } from "../courseContext";
import {
  canonicalAnswer,
  canonicalValues,
  gradeSet,
  loadLabProgress,
  recordLabAttempt,
} from "../lib/lab";
import type { BlankResult, LabProgress } from "../lib/lab";
import type { LabBlank, LabSet } from "../types";

export default function CodeLab() {
  const { meta, lab } = useCourse();
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<LabProgress>(() => loadLabProgress(meta.id));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [openId]);

  if (!lab) {
    return (
      <div className="card">
        <h1>Code lab</h1>
        <p className="muted">This course has no coding simulations yet.</p>
      </div>
    );
  }

  const openSet = openId ? lab.setById.get(openId) : undefined;
  if (openSet) {
    const index = lab.sets.findIndex((item) => item.id === openSet.id);
    const next = lab.sets[index + 1];
    return (
      <SetRunner
        key={openSet.id}
        set={openSet}
        solvedBefore={progress.sets[openSet.id]?.solved ?? false}
        nextTitle={next?.title}
        onNext={next ? () => setOpenId(next.id) : undefined}
        onBack={() => setOpenId(null)}
        onChecked={(solved) => setProgress(recordLabAttempt(meta.id, openSet.id, solved))}
      />
    );
  }

  const totalSets = lab.sets.length;
  const solvedSets = lab.sets.filter((set) => progress.sets[set.id]?.solved).length;

  return (
    <div className="lab">
      <div className="card lab-hero">
        <h1>Code lab</h1>
        <p className="muted">
          Complete real Java classes and methods. Every gap is either a dropdown of tokens or a field
          you type into — typed answers are checked token by token, so wrong syntax never counts as
          correct.
        </p>
        <div className="stat-row">
          <div className="stat">
            <b>
              {solvedSets}/{totalSets}
            </b>
            <span>simulations solved</span>
          </div>
          <div className="stat">
            <b>{lab.topics.length}</b>
            <span>topics</span>
          </div>
          <div className="stat">
            <b>{lab.sets.reduce((sum, set) => sum + set.blanks.length, 0)}</b>
            <span>blanks to fill</span>
          </div>
        </div>
      </div>

      {lab.topics.map((topic) => {
        const solvedInTopic = topic.sets.filter((set) => progress.sets[set.id]?.solved).length;
        return (
          <section className="lab-topic" key={topic.name}>
            <div className="lab-topic-head">
              <h2>{topic.name}</h2>
              <span className="muted">
                {solvedInTopic}/{topic.sets.length} solved
              </span>
            </div>
            <div className="lab-set-list">
              {topic.sets.map((set) => {
                const saved = progress.sets[set.id];
                return (
                  <button className="card lab-set" key={set.id} onClick={() => setOpenId(set.id)}>
                    <div className="lab-set-main">
                      <h3>{set.title}</h3>
                      <p className="muted">{set.brief}</p>
                    </div>
                    <div className="lab-set-meta">
                      {saved?.solved && <span className="pill good">solved</span>}
                      {!saved?.solved && saved?.attempts ? (
                        <span className="pill">{saved.attempts} checks</span>
                      ) : null}
                      <span className="pill">{set.blanks.length} blanks</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SetRunner({
  set,
  solvedBefore,
  nextTitle,
  onNext,
  onBack,
  onChecked,
}: {
  set: LabSet;
  solvedBefore: boolean;
  nextTitle?: string;
  onNext?: () => void;
  onBack: () => void;
  onChecked: (solved: boolean) => void;
}) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [blankResults, setBlankResults] = useState<Record<number, BlankResult> | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [cleanSolve, setCleanSolve] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const answered = set.blanks.filter((blank) => (values[blank.id] ?? "").trim()).length;
  const correct = blankResults
    ? set.blanks.filter((blank) => blankResults[blank.id]?.status === "correct").length
    : 0;
  const syntaxErrors = blankResults
    ? set.blanks.filter((blank) => blankResults[blank.id]?.status === "syntax").length
    : 0;
  const allCorrect = correct === set.blanks.length;

  function setValue(id: number, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setBlankResults((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function check() {
    if (answered === 0) return;
    const graded = gradeSet(set, values);
    setBlankResults(graded.blanks);
    const clean = revealed.length === 0;
    if (graded.solved && clean) setCleanSolve(true);
    onChecked(graded.solved && clean);
    requestAnimationFrame(() => feedbackRef.current?.focus({ preventScroll: true }));
  }

  function revealBlank(blank: LabBlank) {
    setValues((prev) => ({ ...prev, [blank.id]: canonicalAnswer(blank) }));
    setRevealed((prev) => (prev.includes(blank.id) ? prev : [...prev, blank.id]));
    setBlankResults((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[blank.id];
      return next;
    });
  }

  function showSolution() {
    setValues(canonicalValues(set));
    setRevealed(set.blanks.map((blank) => blank.id));
    setBlankResults(null);
  }

  function reset() {
    setValues({});
    setBlankResults(null);
    setRevealed([]);
    setShowHint(false);
  }

  function focusNext(id: number) {
    const nodes = Array.from(
      codeRef.current?.querySelectorAll<HTMLElement>("[data-blank]") ?? []
    );
    const index = nodes.findIndex((node) => node.dataset.blank === String(id));
    const next = nodes[index + 1];
    if (next) next.focus();
    else check();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>, id: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    focusNext(id);
  }

  const issues = blankResults
    ? set.blanks.filter((blank) => {
        const result = blankResults[blank.id];
        return result && result.status !== "correct";
      })
    : [];

  return (
    <div className="lab-runner" onKeyDown={(event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        check();
      }
    }}>
      <div className="lab-top">
        <button className="btn ghost" onClick={onBack}>
          ← All simulations
        </button>
        <span className="pill">{set.topic}</span>
        <span className="pill">{set.blanks.length} blanks</span>
        {solvedBefore && <span className="pill good">solved before</span>}
      </div>

      <h1 className="lab-title">{set.title}</h1>
      <p className="muted lab-brief">{set.brief}</p>

      <div className="lab-code" ref={codeRef} role="group" aria-label={`Code for ${set.title}`}>
        {set.code.split("\n").map((line, lineIndex) => (
          <div className="lab-line" key={lineIndex}>
            <span className="lab-gutter" aria-hidden="true">
              {lineIndex + 1}
            </span>
            <code className="lab-content">{renderLine(line, set, values, blankResults, setValue, onInputKeyDown)}</code>
          </div>
        ))}
      </div>

      <div className="lab-actions">
        <button className="btn primary" onClick={check} disabled={answered === 0}>
          Check answers
        </button>
        <button className="btn ghost" onClick={reset}>
          Clear
        </button>
        {set.hint && (
          <button className="btn ghost" onClick={() => setShowHint((value) => !value)}>
            {showHint ? "Hide hint" : "Hint"}
          </button>
        )}
        <button className="btn ghost" onClick={showSolution}>
          Show solution
        </button>
        <span className="muted lab-progress-text">
          {answered}/{set.blanks.length} filled
        </span>
      </div>

      {showHint && set.hint && <p className="hint lab-hint">{set.hint}</p>}

      {blankResults && (
        <div
          className={"lab-feedback" + (allCorrect ? " good" : " bad")}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          ref={feedbackRef}
        >
          {allCorrect ? (
            cleanSolve ? (
              <p>
                <strong>Simulation complete.</strong> Every gap is right and the code is valid Java.
                {nextTitle ? " Try the next simulation when you are ready." : ""}
              </p>
            ) : (
              <p>
                <strong>All gaps are correct.</strong> You used the solution, so this run is not
                marked as solved — reset and try it from memory.
              </p>
            )
          ) : (
            <p>
              <strong>
                {correct}/{set.blanks.length} correct.
              </strong>{" "}
              {syntaxErrors > 0
                ? `${syntaxErrors} ${syntaxErrors === 1 ? "gap is" : "gaps are"} not valid Java yet.`
                : "Check the flagged gaps below."}
            </p>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="lab-issues">
          {issues.map((blank) => {
            const result = blankResults![blank.id];
            return (
              <li key={blank.id}>
                <b>Gap {blank.id}</b>{" "}
                <span className="muted">{issueText(result, blank)}</span>
                <button className="btn tiny ghost" onClick={() => revealBlank(blank)}>
                  Show answer
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {cleanSolve && allCorrect && nextTitle && onNext && (
        <div className="lab-next">
          <button className="btn primary" onClick={onNext}>
            Next: {nextTitle} →
          </button>
        </div>
      )}
    </div>
  );
}

function issueText(result: BlankResult, blank: LabBlank): string {
  if (result.status === "empty") return "is still empty.";
  if (result.status === "syntax") return `is not valid Java — ${result.message}.`;
  return blank.kind === "select"
    ? "is the wrong choice here."
    : "does not match the code this line needs.";
}

function renderLine(
  line: string,
  set: LabSet,
  values: Record<number, string>,
  results: Record<number, BlankResult> | null,
  onChange: (id: number, value: string) => void,
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>, id: number) => void
) {
  const parts = line.split(/(\{\{\d+\}\})/g);
  return parts.map((part, index) => {
    const match = /^\{\{(\d+)\}\}$/.exec(part);
    if (!match) return <span key={index}>{part || " "}</span>;

    const blank = set.blanks.find((item) => item.id === Number(match[1]));
    if (!blank) return <span key={index}>{part}</span>;

    const status = results?.[blank.id]?.status;
    const className = [
      "lab-field",
      blank.kind === "select" ? "lab-select" : "lab-input",
      status ? `is-${status}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const label = `Gap ${blank.id} of ${set.blanks.length}`;

    if (blank.kind === "select") {
      return (
        <select
          key={index}
          className={className}
          data-blank={blank.id}
          aria-label={label}
          aria-invalid={status === "wrong" || status === "empty" ? true : undefined}
          value={values[blank.id] ?? ""}
          onChange={(event) => onChange(blank.id, event.target.value)}
        >
          <option value="">— pick —</option>
          {blank.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    const longest = Math.max(canonicalAnswer(blank).length, blank.placeholder?.length ?? 0);
    const width = Math.min(32, Math.max(6, longest + 2));
    return (
      <input
        key={index}
        type="text"
        className={className}
        data-blank={blank.id}
        aria-label={label}
        aria-invalid={status === "wrong" || status === "syntax" || status === "empty" ? true : undefined}
        placeholder={blank.placeholder ?? ""}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        style={{ width: `${width}ch` }}
        value={values[blank.id] ?? ""}
        onChange={(event) => onChange(blank.id, event.target.value)}
        onKeyDown={(event) => onKeyDown(event, blank.id)}
      />
    );
  });
}
