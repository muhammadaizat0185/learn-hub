import { useEffect, useRef } from "react";

export default function ReplacePracticeDialog({ currentLabel, nextLabel, onResume, onReplace, onCancel }: {
  currentLabel: string; nextLabel: string; onResume: () => void; onReplace: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous.current?.isConnected) previous.current.focus(); };
  }, []);
  return <dialog ref={ref} className="work-dialog" aria-labelledby="replace-title" aria-describedby="replace-description" onCancel={onCancel} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <h2 id="replace-title">Resume or replace your practice?</h2>
    <p id="replace-description">You have an unfinished <strong>{currentLabel}</strong> session. Starting <strong>{nextLabel}</strong> replaces its draft. Answers already checked stay in your progress.</p>
    <div className="btn-row start">
      <button className="btn primary" onClick={onResume} autoFocus>Resume existing practice</button>
      <button className="btn ghost" onClick={onReplace}>Replace with new practice</button>
      <button className="btn ghost" onClick={onCancel}>Cancel</button>
    </div>
  </dialog>;
}
