import type { LabBlank, LabInputBlank, LabSet, LabSelectBlank } from "../types";
import { readStored, writeStored } from "./persistence";

export type TokenKind = "word" | "number" | "string" | "char" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
}

export type BlankStatus = "correct" | "wrong" | "syntax" | "empty";

export interface BlankResult {
  status: BlankStatus;
  message?: string;
}

export interface SetResult {
  blanks: Record<number, BlankResult>;
  correct: number;
  total: number;
  solved: boolean;
  syntaxErrors: number;
}

const PUNCTUATION = [
  ">>>=", "<<=", ">>=", "...",
  "->", "::", "++", "--", "&&", "||", "==", "!=", "<=", ">=",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", ">>>", "<<", ">>",
  "=", "<", ">", "+", "-", "*", "/", "%", "!", "~", "&", "|", "^", "?",
  ":", ";", ",", ".", "(", ")", "{", "}", "[", "]", "@",
].sort((a, b) => b.length - a.length);

const MARKER = /\{\{(\d+)\}\}/g;

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isLetterOrDigit(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

export function tokenize(source: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }

    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return { tokens, error: "unterminated comment" };
      i = end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let closed = false;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (!closed) {
        return { tokens, error: quote === '"' ? "unterminated string literal" : "unterminated character literal" };
      }
      tokens.push({ kind: quote === '"' ? "string" : "char", text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      let j = i;
      if (ch === "0" && (source[j + 1] === "x" || source[j + 1] === "X")) {
        j += 2;
        while (j < source.length && /[0-9a-fA-F_]/.test(source[j])) j += 1;
      } else {
        while (j < source.length && isDigit(source[j])) j += 1;
        if (source[j] === ".") {
          j += 1;
          while (j < source.length && isDigit(source[j])) j += 1;
        }
        if (source[j] === "e" || source[j] === "E") {
          const next = source[j + 1];
          if (isDigit(next ?? "") || ((next === "+" || next === "-") && isDigit(source[j + 2] ?? ""))) {
            j += 2;
            while (j < source.length && isDigit(source[j])) j += 1;
          }
        }
      }
      while (j < source.length && /[fFdDlL]/.test(source[j])) j += 1;
      tokens.push({ kind: "number", text: source.slice(i, j) });
      i = j;
      continue;
    }

    if (isLetter(ch)) {
      let j = i + 1;
      while (j < source.length && isLetterOrDigit(source[j])) j += 1;
      tokens.push({ kind: "word", text: source.slice(i, j) });
      i = j;
      continue;
    }

    const punct = PUNCTUATION.find((candidate) => source.startsWith(candidate, i));
    if (punct) {
      tokens.push({ kind: "punct", text: punct });
      i += punct.length;
      continue;
    }

    return { tokens, error: `unexpected character "${ch}"` };
  }

  return { tokens };
}

function delimiterIssue(tokens: Token[]): string | undefined {
  const stack: string[] = [];
  const closing: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (const token of tokens) {
    if (token.kind !== "punct") continue;
    if (token.text === "(" || token.text === "[" || token.text === "{") {
      stack.push(token.text);
    } else if (token.text === ")" || token.text === "]" || token.text === "}") {
      const open = stack.pop();
      if (open !== closing[token.text]) {
        return `unexpected "${token.text}"`;
      }
    }
  }
  if (stack.length > 0) {
    return `unclosed "${stack[stack.length - 1]}"`;
  }
  return undefined;
}

function variants(parts: string[]): string[] {
  const joined = parts.join(" ");
  if (parts[parts.length - 1] === ";") {
    return [joined, parts.slice(0, -1).join(" ")];
  }
  return [joined];
}

export function tokenKey(source: string): string | undefined {
  const { tokens, error } = tokenize(source);
  if (error) return undefined;
  return tokens.map((token) => token.text).join(" ");
}

export function isInputBlank(blank: LabBlank): blank is LabInputBlank {
  return blank.kind === "input";
}

export function isSelectBlank(blank: LabBlank): blank is LabSelectBlank {
  return blank.kind === "select";
}

export function canonicalAnswer(blank: LabBlank): string {
  return isSelectBlank(blank) ? blank.answer : blank.answers[0] ?? "";
}

export function gradeBlank(blank: LabBlank, raw: string): BlankResult {
  const value = raw.trim();
  if (!value) return { status: "empty" };

  if (isSelectBlank(blank)) {
    return value === blank.answer ? { status: "correct" } : { status: "wrong" };
  }

  const { tokens, error } = tokenize(value);
  if (error) return { status: "syntax", message: error };

  const unmatched = delimiterIssue(tokens);
  if (unmatched) return { status: "syntax", message: unmatched };

  const typed = variants(tokens.map((token) => token.text));
  const accepted = blank.answers.flatMap((answer) => {
    const parsed = tokenize(answer);
    if (parsed.error) return [];
    return variants(parsed.tokens.map((token) => token.text));
  });
  return typed.some((variant) => accepted.includes(variant))
    ? { status: "correct" }
    : { status: "wrong" };
}

export function gradeSet(set: LabSet, values: Record<number, string>): SetResult {
  const blanks: Record<number, BlankResult> = {};
  let correct = 0;
  let syntaxErrors = 0;
  for (const blank of set.blanks) {
    const result = gradeBlank(blank, values[blank.id] ?? "");
    blanks[blank.id] = result;
    if (result.status === "correct") correct += 1;
    if (result.status === "syntax") syntaxErrors += 1;
  }
  return {
    blanks,
    correct,
    total: set.blanks.length,
    solved: set.blanks.length > 0 && correct === set.blanks.length,
    syntaxErrors,
  };
}

export function assemble(set: LabSet, values: Record<number, string>): string {
  return set.code.replace(MARKER, (_match, raw: string) => {
    const value = values[Number(raw)]?.trim();
    return value ? value : "/* ? */";
  });
}

export function canonicalValues(set: LabSet): Record<number, string> {
  const values: Record<number, string> = {};
  for (const blank of set.blanks) values[blank.id] = canonicalAnswer(blank);
  return values;
}

export function validateLab(sets: LabSet[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const set of sets) {
    const at = `set ${set.id || "(no id)"}`;
    if (!set.id.trim()) errors.push("a set has no id");
    if (ids.has(set.id)) errors.push(`${at}: duplicate id`);
    ids.add(set.id);
    if (!set.topic.trim()) errors.push(`${at}: topic is empty`);
    if (!set.title.trim()) errors.push(`${at}: title is empty`);
    if (!set.brief.trim()) errors.push(`${at}: brief is empty`);
    if (!set.code.trim()) errors.push(`${at}: code is empty`);
    if (set.walkthrough !== undefined) {
      const walkthrough = set.walkthrough;
      if (!walkthrough || typeof walkthrough !== "object" || Array.isArray(walkthrough) ||
          !Array.isArray(walkthrough.steps) || walkthrough.steps.length === 0 || walkthrough.steps.length > 20 ||
          walkthrough.steps.some((step) => typeof step !== "string" || !step.trim() || step.length > 2000)) {
        errors.push(`${at}: walkthrough needs 1-20 nonempty steps of at most 2000 characters`);
      }
      if (walkthrough && walkthrough.output !== undefined &&
          (typeof walkthrough.output !== "string" || !walkthrough.output.trim() || walkthrough.output.length > 10000)) {
        errors.push(`${at}: walkthrough output must be nonempty text of at most 10000 characters`);
      }
    }

    const markers = [...set.code.matchAll(MARKER)].map((match) => Number(match[1]));
    const blankIds = set.blanks.map((blank) => blank.id);
    const blankSet = new Set(blankIds);
    if (blankSet.size !== blankIds.length) errors.push(`${at}: duplicate blank ids`);
    for (const id of markers) {
      if (!blankSet.has(id)) errors.push(`${at}: marker {{${id}}} has no blank`);
    }
    for (const id of blankIds) {
      const uses = markers.filter((marker) => marker === id).length;
      if (uses !== 1) errors.push(`${at}: blank ${id} appears ${uses} times`);
    }
    if (set.blanks.length < 3 || set.blanks.length > 10) {
      errors.push(`${at}: has ${set.blanks.length} blanks, expected 3-10`);
    }

    for (const blank of set.blanks) {
      const label = `${at} blank ${blank.id}`;
      if (!Number.isInteger(blank.id) || blank.id <= 0) errors.push(`${label}: id must be positive`);
      if (blank.explanation !== undefined &&
          (typeof blank.explanation !== "string" || !blank.explanation.trim() || blank.explanation.length > 2000)) {
        errors.push(`${label}: explanation must be nonempty text of at most 2000 characters`);
      }
      if (isSelectBlank(blank)) {
        if (blank.options.length < 2) errors.push(`${label}: needs at least two options`);
        if (new Set(blank.options).size !== blank.options.length) {
          errors.push(`${label}: duplicate options`);
        }
        if (!blank.options.includes(blank.answer)) errors.push(`${label}: answer is not an option`);
      } else {
        if (blank.answers.length === 0) errors.push(`${label}: no accepted answers`);
        for (const answer of blank.answers) {
          if (!answer.trim()) errors.push(`${label}: an accepted answer is empty`);
          if (tokenKey(answer) === undefined) errors.push(`${label}: answer "${answer}" cannot be tokenized by this checker`);
        }
      }
    }
  }
  return errors;
}

export interface LabSetProgress {
  attempts: number;
  solved: boolean;
  lastAt: string;
}

export interface LabProgress {
  version: 1;
  sets: Record<string, LabSetProgress>;
}

const PROGRESS_PREFIX = "hub.v1.lab.";

function progressKey(courseId: string): string {
  return `${PROGRESS_PREFIX}${courseId}`;
}

function emptyProgress(): LabProgress {
  return { version: 1, sets: {} };
}

export function normalizeLabProgress(input: unknown): LabProgress {
  const progress = emptyProgress();
  if (typeof input !== "object" || input === null || Array.isArray(input)) return progress;
  const parsed = input as Record<string, unknown>;
  if (parsed.version !== undefined && parsed.version !== 1) return progress;
  const source = parsed.sets;
  if (typeof source !== "object" || source === null || Array.isArray(source)) return progress;
  for (const [id, value] of Object.entries(source).slice(0, 2000)) {
    if (!id.trim() || id.length > 200 || ["__proto__", "constructor", "prototype"].includes(id)) continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    progress.sets[id] = {
      attempts: typeof entry.attempts === "number" && Number.isFinite(entry.attempts) && entry.attempts >= 0
        ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(entry.attempts)) : 0,
      solved: entry.solved === true,
      lastAt: typeof entry.lastAt === "string" && entry.lastAt.length <= 64 && Number.isFinite(Date.parse(entry.lastAt))
        ? entry.lastAt : "",
    };
  }
  return progress;
}

export function loadLabProgress(courseId: string): LabProgress {
  try {
    const raw = readStored(progressKey(courseId));
    return raw ? normalizeLabProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveLabProgress(courseId: string, progress: LabProgress): boolean {
  return writeStored(progressKey(courseId), JSON.stringify(normalizeLabProgress(progress)));
}

export function recordLabAttempt(courseId: string, setId: string, solved: boolean): LabProgress {
  const progress = loadLabProgress(courseId);
  if (!setId.trim() || setId.length > 200 || ["__proto__", "constructor", "prototype"].includes(setId)) return progress;
  const previous = progress.sets[setId] ?? { attempts: 0, solved: false, lastAt: "" };
  progress.sets[setId] = {
    attempts: Math.min(Number.MAX_SAFE_INTEGER, previous.attempts + 1),
    solved: previous.solved || solved,
    lastAt: new Date().toISOString(),
  };
  saveLabProgress(courseId, progress);
  return progress;
}

export function resetLabProgress(courseId: string): boolean {
  return writeStored(progressKey(courseId), null);
}
