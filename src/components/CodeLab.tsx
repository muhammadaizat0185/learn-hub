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
import {
  clearLabDraft,
  getLabDraft,
  LAB_DRAFT_VALUE_LIMIT,
  labSetFingerprint,
  loadLabDrafts,
  saveLabDraft,
} from "../lib/labDrafts";
import type { LabDraft, LabDrafts } from "../lib/labDrafts";
import type { LabBlank, LabSet } from "../types";

export interface CodeLabProps {
  selectedSetId?: string | null;
  onSelectSet?: (id: string | null) => void;
}

export default function CodeLab(props: CodeLabProps) {
  const { meta } = useCourse();
  return <CourseCodeLab key={meta.id} {...props} />;
}

function CourseCodeLab({ selectedSetId, onSelectSet }: CodeLabProps) {
  const { meta, lab } = useCourse();
  const [internalId, setInternalId] = useState<string | null>(null);
  const openId = selectedSetId === undefined ? internalId : selectedSetId;
  const [progress, setProgress] = useState<LabProgress>(() => loadLabProgress(meta.id));
  const [drafts, setDrafts] = useState<LabDrafts>(() => loadLabDrafts(meta.id));
  const [saveFailures, setSaveFailures] = useState<Record<string, boolean>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [openId]);

  useEffect(() => {
    // Stale drafts are never offered or restored, even if removing storage fails.
    if (!lab) return;
    const stored = loadLabDrafts(meta.id);
    for (const id of Object.keys(stored)) {
      const set = lab.setById.get(id);
      if (!set || !getLabDraft(set, stored)) clearLabDraft(meta.id, id);
    }
  }, [lab, meta.id]);

  function selectSet(id: string | null) {
    if (selectedSetId === undefined) setInternalId(id);
    onSelectSet?.(id);
  }

  function updateDraft(setId: string, draft: LabDraft | null) {
    // Write synchronously with the edit, not on unmount or a debounce: route changes
    // and reloads must not lose a reveal made just before leaving the page.
    const saved = draft ? saveLabDraft(meta.id, setId, draft) : clearLabDraft(meta.id, setId);
    setDrafts((previous) => {
      const next = { ...previous };
      if (draft) next[setId] = draft;
      else delete next[setId];
      return next;
    });
    setSaveFailures((previous) => ({ ...previous, [setId]: !saved }));
  }

  const openSet = openId !== null ? lab?.setById.get(openId) : undefined;
  if (openId !== null && !openSet) {
    return (
      <div className="card">
        <h1 ref={headingRef} tabIndex={-1}>Lab not found</h1>
        <p className="muted">This lab is not available in this course. Choose another exercise.</p>
        <button className="btn primary" onClick={() => selectSet(null)}>All labs</button>
      </div>
    );
  }

  if (!lab) {
    return (
      <div className="card">
        <h1 ref={headingRef} tabIndex={-1}>Code lab</h1>
        <p className="muted">This course has no coding exercises yet.</p>
      </div>
    );
  }

  if (openSet) {
    const index = lab.sets.findIndex((item) => item.id === openSet.id);
    const next = lab.sets[index + 1];
    return (
      <SetRunner
        key={`${openSet.id}:${labSetFingerprint(openSet)}`}
        set={openSet}
        initialDraft={getLabDraft(openSet, drafts)}
        saveFailed={saveFailures[openSet.id] ?? false}
        onDraftChange={(draft) => updateDraft(openSet.id, draft)}
        solvedBefore={progress.sets[openSet.id]?.solved ?? false}
        nextTitle={next?.title}
        onNext={next ? () => selectSet(next.id) : undefined}
        onBack={() => selectSet(null)}
        onChecked={(solved) => setProgress(recordLabAttempt(meta.id, openSet.id, solved))}
      />
    );
  }

  const totalSets = lab.sets.length;
  const solvedSets = lab.sets.filter((set) => progress.sets[set.id]?.solved).length;

  return (
    <div className="lab">
      <div className="card lab-hero">
        <h1 ref={headingRef} tabIndex={-1}>Code lab</h1>
        <p className="muted">
          Complete Java examples with dropdowns and typed gaps. Answers are compared with authored
          expected solutions, not compiled or executed. Equivalent Java may not be recognized.
          Drafts, including revealed answers, are saved on this device when storage is available.
        </p>
        <div className="stat-row">
          <div className="stat">
            <b>{solvedSets}/{totalSets}</b>
            <span>labs solved without revealed answers</span>
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
              <span className="muted">{solvedInTopic}/{topic.sets.length} solved</span>
            </div>
            <div className="lab-set-list">
              {topic.sets.map((set) => {
                const saved = progress.sets[set.id];
                const draft = getLabDraft(set, drafts);
                const filled = set.blanks.filter((blank) => draft?.values[blank.id]?.trim()).length;
                return (
                  <button className="card lab-set" key={set.id} onClick={() => selectSet(set.id)}>
                    <div className="lab-set-main">
                      <h3>{set.title}</h3>
                      <p className="muted">{set.brief}</p>
                    </div>
                    <div className="lab-set-meta">
                      {saved?.solved && <span className="pill good">solved before</span>}
                      {!saved?.solved && saved?.attempts ? <span className="pill">{saved.attempts} checks</span> : null}
                      {saveFailures[set.id] && <span className="pill bad">Draft changes not saved</span>}
                      {draft && (
                        <span className="pill">
                          {saveFailures[set.id] ? "In this session" : "Resume saved draft"} · {filled}/{set.blanks.length} filled
                        </span>
                      )}
                      {!!draft?.revealed.length && <span className="pill">assisted attempt</span>}
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
  initialDraft,
  saveFailed,
  onDraftChange,
  solvedBefore,
  nextTitle,
  onNext,
  onBack,
  onChecked,
}: {
  set: LabSet;
  initialDraft?: LabDraft;
  saveFailed: boolean;
  onDraftChange: (draft: LabDraft | null) => void;
  solvedBefore: boolean;
  nextTitle?: string;
  onNext?: () => void;
  onBack: () => void;
  onChecked: (solved: boolean) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [resumed, setResumed] = useState(!!initialDraft);
  const values = draft?.values ?? {};
  const revealed = draft?.revealed ?? [];
  const [blankResults, setBlankResults] = useState<Record<number, BlankResult> | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [cleanSolve, setCleanSolve] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const answered = set.blanks.filter((blank) => (values[blank.id] ?? "").trim()).length;
  const correct = blankResults
    ? set.blanks.filter((blank) => blankResults[blank.id]?.status === "correct").length
    : 0;
  const syntaxErrors = blankResults
    ? set.blanks.filter((blank) => blankResults[blank.id]?.status === "syntax").length
    : 0;
  const allCorrect = set.blanks.length > 0 && correct === set.blanks.length;

  function persist(nextValues: Record<number, string>, nextRevealed: number[]) {
    const next = Object.values(nextValues).some((value) => value.length > 0) || nextRevealed.length > 0
      ? { values: nextValues, revealed: nextRevealed, updatedAt: Date.now(), fingerprint: labSetFingerprint(set) }
      : undefined;
    setDraft(next);
    onDraftChange(next ?? null);
  }

  function invalidateBlank(id: number) {
    setCleanSolve(false);
    setBlankResults((previous) => {
      if (!previous) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  function setValue(id: number, value: string) {
    persist({ ...values, [id]: value }, revealed);
    invalidateBlank(id);
  }

  function check() {
    if (answered === 0) return;
    const graded = gradeSet(set, values);
    setBlankResults(graded.blanks);
    const clean = graded.solved && revealed.length === 0;
    setCleanSolve(clean);
    onChecked(clean);
    requestAnimationFrame(() => feedbackRef.current?.focus({ preventScroll: true }));
  }

  function revealBlank(blank: LabBlank) {
    persist(
      { ...values, [blank.id]: canonicalAnswer(blank) },
      revealed.includes(blank.id) ? revealed : [...revealed, blank.id]
    );
    invalidateBlank(blank.id);
  }

  function showSolution() {
    persist(canonicalValues(set), set.blanks.map((blank) => blank.id));
    setCleanSolve(false);
    setBlankResults(null);
  }

  function reset() {
    const nonempty = Object.values(values).some((value) => value.length > 0) || revealed.length > 0;
    if (nonempty && !window.confirm("Clear this draft and start a fresh attempt? Your previous solve history will be kept.")) return;
    persist({}, []);
    setBlankResults(null);
    setCleanSolve(false);
    setShowHint(false);
    setResumed(false);
    codeRef.current?.querySelector<HTMLElement>("[data-blank]")?.focus();
  }

  function focusNext(id: number) {
    const nodes = Array.from(codeRef.current?.querySelectorAll<HTMLElement>("[data-blank]") ?? []);
    const index = nodes.findIndex((node) => node.dataset.blank === String(id));
    const next = nodes[index + 1];
    if (next) next.focus();
    else check();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>, id: number) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Let the runner handle Ctrl/Command+Enter once, rather than also advancing a gap.
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    focusNext(id);
  }

  const explained = set.blanks.filter((blank) => blankResults?.[blank.id] || revealed.includes(blank.id));
  const showWalkthrough = allCorrect || revealed.length === set.blanks.length;

  return (
    <div className="lab-runner" onKeyDown={(event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        check();
      }
    }}>
      <div className="lab-top">
        <button className="btn ghost" onClick={onBack}>← All labs</button>
        <span className="pill">{set.topic}</span>
        <span className="pill">{set.blanks.length} blanks</span>
        {solvedBefore && <span className="pill good">solved before</span>}
        {revealed.length > 0 && <span className="pill">assisted attempt</span>}
      </div>

      <h1 className="lab-title" ref={headingRef} tabIndex={-1}>{set.title}</h1>
      <p className="muted lab-brief">{set.brief}</p>
      <p className="muted">
        This is expected-solution matching, not a Java compiler. Typed gaps are compared token by
        token, ignoring spacing, comments and an optional trailing semicolon. Equivalent solutions
        may not be recognized. Your code is not executed. Ctrl/Command+Enter checks all gaps.
      </p>
      {saveFailed ? (
        <p className="hint lab-hint" role="alert">
          Draft changes could not be saved on this device. Keep this page open; leaving or reloading
          may lose changes or restore an older draft.
          <button className="btn tiny ghost" onClick={() => onDraftChange(draft ?? null)}>Retry save</button>
        </p>
      ) : (
        <p className="muted lab-draft-status" role="status">
          {draft ? `${resumed ? "Draft resumed. " : ""}Draft saved on this device.` : "No saved draft for this attempt."}
        </p>
      )}
      {revealed.length > 0 && (
        <p className="muted">Revealed answers stay recorded when you leave. Clear starts a fresh attempt; previous solves stay in your history.</p>
      )}

      <div className="lab-code" ref={codeRef} role="group" aria-label={`Code for ${set.title}`}>
        {set.code.split("\n").map((line, lineIndex) => (
          <div className="lab-line" key={lineIndex}>
            <span className="lab-gutter" aria-hidden="true">{lineIndex + 1}</span>
            <code className="lab-content">{renderLine(line, set, values, blankResults, setValue, onInputKeyDown)}</code>
          </div>
        ))}
      </div>

      <div className="lab-actions">
        <button className="btn primary" onClick={check} disabled={answered === 0}>Check answers</button>
        <button className="btn ghost" onClick={reset}>Clear</button>
        {set.hint && (
          <button className="btn ghost" onClick={() => setShowHint((value) => !value)} aria-expanded={showHint}>
            {showHint ? "Hide hint" : "Hint"}
          </button>
        )}
        <button className="btn ghost" onClick={showSolution}>Show solution</button>
        <span className="muted lab-progress-text">{answered}/{set.blanks.length} filled</span>
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
                <strong>Lab complete.</strong> Every gap matches an expected solution, without revealed answers.
                {nextTitle ? " Try the next lab when you are ready." : ""}
              </p>
            ) : (
              <p>
                <strong>All gaps match expected solutions.</strong> This assisted attempt does not count as
                a new independent solve. Clear and try from memory; previous solve history is unchanged.
              </p>
            )
          ) : (
            <p>
              <strong>{correct}/{set.blanks.length} gaps match expected solutions.</strong>{" "}
              {syntaxErrors > 0
                ? `The token checker found ${syntaxErrors} gap(s) with a token or delimiter issue. `
                : ""}
              Check the gap feedback below. Edited gaps need another check.
            </p>
          )}
        </div>
      )}

      {explained.length > 0 && (
        <ul className="lab-issues">
          {explained.map((blank) => {
            const result = blankResults?.[blank.id];
            const wasRevealed = revealed.includes(blank.id);
            return (
              <li key={blank.id} id={`lab-gap-feedback-${blank.id}`}>
                <b>Gap {blank.id}</b>{" "}
                <span className="muted">
                  {result?.status === "correct" ? "matches an expected solution." : result ? issueText(result) : "has a revealed answer; check after editing."}
                  {wasRevealed ? " Answer revealed in this attempt." : ""}
                </span>
                {blank.explanation && <p>{blank.explanation}</p>}
                {result && result.status !== "correct" && (
                  <button className="btn tiny ghost" onClick={() => revealBlank(blank)}>Show answer</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showWalkthrough && set.walkthrough && (
        <section className="card lab-walkthrough" aria-labelledby="lab-walkthrough-heading">
          <h2 id="lab-walkthrough-heading">Worked walkthrough</h2>
          <p className="muted">An explanation of the authored solution, not a run of your code.</p>
          <ol>{set.walkthrough.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          {set.walkthrough.output && (
            <>
              <h3>Worked expected output — not execution</h3>
              <pre><code>{set.walkthrough.output}</code></pre>
            </>
          )}
        </section>
      )}

      {cleanSolve && allCorrect && nextTitle && onNext && (
        <div className="lab-next">
          <button className="btn primary" onClick={onNext}>Next: {nextTitle} →</button>
        </div>
      )}
    </div>
  );
}

function issueText(result: BlankResult): string {
  if (result.status === "empty") return "is still empty.";
  if (result.status === "syntax") return `could not be matched: ${result.message}. This is a token check, not a compiler diagnostic.`;
  return "does not match an authored solution. An equivalent Java expression may not be recognized.";
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
    ].filter(Boolean).join(" ");
    const label = `Gap ${blank.id} of ${set.blanks.length}`;
    const description = status ? `lab-gap-feedback-${blank.id}` : undefined;

    if (blank.kind === "select") {
      return (
        <select
          key={index}
          className={className}
          data-blank={blank.id}
          aria-label={label}
          aria-describedby={description}
          aria-invalid={status === "wrong" || status === "empty" ? true : undefined}
          value={values[blank.id] ?? ""}
          onChange={(event) => onChange(blank.id, event.target.value)}
        >
          <option value="">— pick —</option>
          {blank.options.map((option) => <option key={option} value={option}>{option}</option>)}
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
        aria-describedby={description}
        aria-invalid={status === "wrong" || status === "syntax" || status === "empty" ? true : undefined}
        placeholder={blank.placeholder ?? ""}
        maxLength={LAB_DRAFT_VALUE_LIMIT}
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
