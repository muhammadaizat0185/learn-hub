import type { LabSet } from "../types";

export interface LabDraft {
  values: Record<number, string>;
  revealed: number[];
  updatedAt: number;
  fingerprint: string;
}

export type LabDrafts = Record<string, LabDraft>;

export const LAB_DRAFT_VALUE_LIMIT = 4096;
const PREFIX = "hub.v1.lab-drafts.";
const MAX_DRAFTS = 200;
const MAX_BLANKS = 100;
const MAX_STORAGE_LENGTH = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSetId(id: string): boolean {
  return id.length <= 200 && id.trim().length > 0 &&
    !["__proto__", "constructor", "prototype"].includes(id);
}

function blankId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function normalizeDraft(input: unknown): LabDraft | undefined {
  if (!isRecord(input) || !isRecord(input.values) || !Array.isArray(input.revealed)) return;
  if (typeof input.fingerprint !== "string" || !input.fingerprint.trim() || input.fingerprint.length > 128) return;
  if (typeof input.updatedAt !== "number" || !Number.isSafeInteger(input.updatedAt) ||
      input.updatedAt < 0 || input.updatedAt > 8_640_000_000_000_000) return;
  const entries = Object.entries(input.values);
  if (entries.length > MAX_BLANKS || input.revealed.length > MAX_BLANKS) return;
  // Reject malformed assistance data rather than silently turning an assisted attempt clean.
  if (!input.revealed.every(blankId)) return;
  const values: Record<number, string> = {};
  for (const [key, value] of entries) {
    const id = Number(key);
    if (!blankId(id) || String(id) !== key || typeof value !== "string" || value.length > LAB_DRAFT_VALUE_LIMIT) return;
    values[id] = value;
  }
  return {
    values,
    revealed: [...new Set(input.revealed)],
    updatedAt: input.updatedAt,
    fingerprint: input.fingerprint,
  };
}

export function normalizeLabDrafts(input: unknown): LabDrafts {
  const drafts: LabDrafts = {};
  if (!isRecord(input)) return drafts;
  let length = 0;
  for (const [id, value] of Object.entries(input).slice(0, MAX_DRAFTS)) {
    if (!safeSetId(id)) continue;
    const draft = normalizeDraft(value);
    if (!draft) continue;
    length += JSON.stringify(draft).length + JSON.stringify(id).length + 2;
    if (length > MAX_STORAGE_LENGTH - 2) break;
    drafts[id] = draft;
  }
  return drafts;
}

// Only code and grading definitions affect compatibility. Teaching copy, labels,
// hints and walkthroughs can improve without throwing away a learner's work.
export function labSetFingerprint(set: LabSet): string {
  const source = JSON.stringify({
    code: set.code,
    blanks: [...set.blanks].sort((a, b) => a.id - b.id).map((blank) =>
      blank.kind === "select"
        ? { id: blank.id, kind: blank.kind, options: blank.options, answer: blank.answer }
        : { id: blank.id, kind: blank.kind, answers: blank.answers }
    ),
  });
  // Two independent 32-bit accumulators; this is a content version, not a security hash.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `v1:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function getLabDraft(set: LabSet, drafts: LabDrafts): LabDraft | undefined {
  if (!Object.prototype.hasOwnProperty.call(drafts, set.id)) return;
  const draft = normalizeDraft(drafts[set.id]);
  if (!draft || draft.fingerprint !== labSetFingerprint(set)) return;
  const ids = new Set(set.blanks.map((blank) => blank.id));
  if (Object.keys(draft.values).some((id) => !ids.has(Number(id))) ||
      draft.revealed.some((id) => !ids.has(id))) return;
  if (set.blanks.some((blank) => blank.kind === "select" && draft.values[blank.id] &&
      !blank.options.includes(draft.values[blank.id]))) return;
  return draft;
}

function readDrafts(courseId: string): LabDrafts {
  // Let read failures reach save/clear so they cannot overwrite other sets with
  // an apparently empty snapshot. Malformed persisted JSON can be discarded.
  const raw = localStorage.getItem(`${PREFIX}${courseId}`);
  try {
    return raw && raw.length <= MAX_STORAGE_LENGTH ? normalizeLabDrafts(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function loadLabDrafts(courseId: string): LabDrafts {
  try {
    return readDrafts(courseId);
  } catch {
    return {};
  }
}

function writeDrafts(courseId: string, drafts: LabDrafts): boolean {
  try {
    const raw = JSON.stringify(drafts);
    if (raw.length > MAX_STORAGE_LENGTH || Object.keys(drafts).length > MAX_DRAFTS) return false;
    localStorage.setItem(`${PREFIX}${courseId}`, raw);
    return true;
  } catch {
    return false;
  }
}

export function saveLabDraft(courseId: string, setId: string, draft: LabDraft): boolean {
  if (!safeSetId(setId)) return false;
  const normalized = normalizeDraft(draft);
  if (!normalized) return false;
  try {
    return writeDrafts(courseId, { ...readDrafts(courseId), [setId]: normalized });
  } catch {
    return false;
  }
}

export function clearLabDraft(courseId: string, setId: string): boolean {
  try {
    const drafts = readDrafts(courseId);
    delete drafts[setId];
    return Object.keys(drafts).length ? writeDrafts(courseId, drafts) : resetLabDrafts(courseId);
  } catch {
    return false;
  }
}

export function resetLabDrafts(courseId: string): boolean {
  try {
    localStorage.removeItem(`${PREFIX}${courseId}`);
    return true;
  } catch {
    return false;
  }
}

export function replaceLabDrafts(courseId: string, drafts: LabDrafts): boolean {
  return writeDrafts(courseId, normalizeLabDrafts(drafts));
}
