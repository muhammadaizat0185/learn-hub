import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CodeLab from "../../src/components/CodeLab";
import type { CodeLabProps } from "../../src/components/CodeLab";
import { CourseProvider } from "../../src/courseContext";
import { canonicalValues, loadLabProgress } from "../../src/lib/lab";
import {
  clearLabDraft,
  getLabDraft,
  LAB_DRAFT_VALUE_LIMIT,
  labSetFingerprint,
  loadLabDrafts,
  normalizeLabDrafts,
  replaceLabDrafts,
  resetLabDrafts,
  saveLabDraft,
} from "../../src/lib/labDrafts";
import type { LabDraft } from "../../src/lib/labDrafts";
import type { CourseData, LabSet } from "../../src/types";

const set: LabSet = {
  id: "loops-1",
  topic: "Loops",
  title: "A small loop",
  brief: "Accumulate three numbers.",
  code: "int sum = {{1}};\nfor (int i = 1; i <= 3; {{2}}) {\n  sum {{3}} i;\n}",
  blanks: [
    { id: 1, kind: "input", answers: ["0"], explanation: "Start at zero so the initial value does not add to the total." },
    { id: 2, kind: "input", answers: ["i++"], explanation: "Increment i after each pass through the loop." },
    { id: 3, kind: "select", options: ["+=", "="], answer: "+=", explanation: "Add i to the running sum rather than replacing it." },
  ],
  walkthrough: { steps: ["Add 1, 2 and 3 to obtain 6."] },
};
const nextSet: LabSet = { ...set, id: "loops-2", title: "Another loop" };
const course: CourseData = {
  meta: { id: "draft-course", title: "Draft tests", shortTitle: "Drafts", description: "Tests", exam: { questions: 1, minutes: 1, passPercent: 50 } },
  questions: [],
  questionById: new Map(),
  explanations: {},
  topics: [],
  lab: { sets: [set, nextSet], topics: [{ name: "Loops", sets: [set, nextSet] }], setById: new Map([[set.id, set], [nextSet.id, nextSet]]) },
};

function draft(overrides: Partial<LabDraft> = {}): LabDraft {
  return { values: { 1: "0", 2: "i++" }, revealed: [2], updatedAt: 123456, fingerprint: labSetFingerprint(set), ...overrides };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("draft validation and fingerprints", () => {
  it.each([null, false, "draft", [], 3])("normalizes malformed roots %#", (input) => {
    expect(normalizeLabDrafts(input)).toEqual({});
  });

  it("copies valid entries, deduplicates revealed IDs and rejects unsafe set keys", () => {
    const original = draft({ revealed: [2, 2] });
    const normalized = normalizeLabDrafts({ [set.id]: original, constructor: original, ["__proto__"]: original, empty: null });
    expect(Object.keys(normalized)).toEqual([set.id]);
    expect(normalized[set.id]).toEqual(draft());
    normalized[set.id].values[1] = "changed";
    normalized[set.id].revealed.push(1);
    expect(original.values[1]).toBe("0");
    expect(original.revealed).toEqual([2, 2]);
  });

  it.each([
    { values: [] }, { values: null }, { values: { 0: "x" } }, { values: { "01": "x" } },
    { values: { 1: 4 } }, { values: { 1: "x".repeat(LAB_DRAFT_VALUE_LIMIT + 1) } },
    { revealed: undefined }, { revealed: "2" }, { revealed: ["2"] }, { revealed: [0] },
    { revealed: [NaN] }, { revealed: [1.5] }, { revealed: Array(101).fill(1) },
    { updatedAt: NaN }, { updatedAt: Infinity }, { updatedAt: -1 }, { updatedAt: "123" },
    { updatedAt: Number.MAX_SAFE_INTEGER }, { fingerprint: "" }, { fingerprint: "x".repeat(129) },
  ])("drops a malformed draft without silently erasing assistance %#", (invalid) => {
    expect(normalizeLabDrafts({ [set.id]: { ...draft(), ...invalid } })).toEqual({});
  });

  it("bounds draft counts and blank counts", () => {
    const many = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`set-${index}`, draft()]));
    expect(Object.keys(normalizeLabDrafts(many))).toHaveLength(200);
    const values = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [index + 1, "x"]));
    expect(normalizeLabDrafts({ many: draft({ values }) })).toEqual({});
  });

  it("fingerprints code and grading definitions but not teaching metadata", () => {
    const fingerprint = labSetFingerprint(set);
    expect(labSetFingerprint({
      ...set, title: "Better title", brief: "New summary", hint: "A useful hint",
      walkthrough: { steps: ["Improved explanation"], output: "Worked example" },
      blanks: set.blanks.map((blank) => ({ ...blank, explanation: "New teaching text", placeholder: "Type here", reveal: "Hint" })),
    })).toBe(fingerprint);
    expect(labSetFingerprint({ ...set, code: set.code + "\n" })).not.toBe(fingerprint);
    expect(labSetFingerprint({ ...set, blanks: [{ id: 1, kind: "input", answers: ["1"] }, ...set.blanks.slice(1)] })).not.toBe(fingerprint);
    expect(labSetFingerprint({ ...set, blanks: [...set.blanks.slice(0, 2), { id: 3, kind: "select", options: ["+=", "=", "-="], answer: "+=" }] })).not.toBe(fingerprint);
    expect(labSetFingerprint({ ...set, blanks: [...set.blanks].reverse() })).toBe(fingerprint);
  });

  it("drops stale drafts and unknown gap IDs against the current set", () => {
    expect(getLabDraft(set, { [set.id]: draft() })).toEqual(draft());
    expect(getLabDraft({ ...set, code: "changed" }, { [set.id]: draft() })).toBeUndefined();
    expect(getLabDraft(set, { [set.id]: draft({ revealed: [99] }) })).toBeUndefined();
    expect(getLabDraft(set, { [set.id]: draft({ values: { 99: "old" } }) })).toBeUndefined();
    expect(getLabDraft(set, { [set.id]: draft({ values: { 3: "not an option" } }) })).toBeUndefined();
    expect(getLabDraft(set, { [set.id]: draft({ values: { 3: "" } }) })).toBeDefined();
  });
});

describe("course and set draft storage", () => {
  it("persists values and revealed IDs through a fresh load without touching progress", () => {
    localStorage.setItem("hub.v1.lab.java", "history");
    expect(saveLabDraft("java", set.id, draft())).toBe(true);
    expect(JSON.parse(localStorage.getItem("hub.v1.lab-drafts.java")!)[set.id]).toEqual(draft());
    const resumed = getLabDraft(set, loadLabDrafts("java"))!;
    expect(resumed.revealed).toEqual([2]);
    resumed.values[2] = "i += 1";
    expect(saveLabDraft("java", set.id, resumed)).toBe(true);
    expect(loadLabDrafts("java")[set.id].revealed).toEqual([2]);
    expect(localStorage.getItem("hub.v1.lab.java")).toBe("history");
  });

  it("isolates courses and sets and clears only the selected draft", () => {
    saveLabDraft("java", set.id, draft());
    saveLabDraft("java", nextSet.id, draft({ values: { 1: "other set" } }));
    saveLabDraft("other", set.id, draft({ values: { 1: "other course" } }));
    expect(clearLabDraft("java", set.id)).toBe(true);
    expect(loadLabDrafts("java")[set.id]).toBeUndefined();
    expect(loadLabDrafts("java")[nextSet.id].values[1]).toBe("other set");
    expect(loadLabDrafts("other")[set.id].values[1]).toBe("other course");
    expect(resetLabDrafts("java")).toBe(true);
    expect(loadLabDrafts("java")).toEqual({});
    expect(loadLabDrafts("other")[set.id]).toBeDefined();
  });

  it("replaces rather than merges drafts for backup import", () => {
    saveLabDraft("java", set.id, draft());
    saveLabDraft("other", set.id, draft());
    expect(replaceLabDrafts("java", { [nextSet.id]: draft() })).toBe(true);
    expect(Object.keys(loadLabDrafts("java"))).toEqual([nextSet.id]);
    expect(Object.keys(loadLabDrafts("other"))).toEqual([set.id]);
  });

  it("ignores corrupt or oversized stored data and rejects invalid saves", () => {
    localStorage.setItem("hub.v1.lab-drafts.java", "{");
    expect(loadLabDrafts("java")).toEqual({});
    localStorage.setItem("hub.v1.lab-drafts.java", " ".repeat(2_000_001));
    expect(loadLabDrafts("java")).toEqual({});
    expect(saveLabDraft("java", "__proto__", draft())).toBe(false);
    expect(saveLabDraft("java", set.id, draft({ values: { 1: "x".repeat(LAB_DRAFT_VALUE_LIMIT + 1) } }))).toBe(false);
  });

  it("does not overwrite other drafts when reading storage fails but writes are allowed", () => {
    saveLabDraft("java", nextSet.id, draft());
    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read blocked"); });
    expect(saveLabDraft("java", set.id, draft())).toBe(false);
    expect(clearLabDraft("java", set.id)).toBe(false);
    readFailure.mockRestore();
    expect(Object.keys(loadLabDrafts("java"))).toEqual([nextSet.id]);
  });

  it("reports storage failures rather than claiming a save succeeded", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveLabDraft("java", set.id, draft())).toBe(false);
    expect(replaceLabDrafts("java", { [set.id]: draft() })).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadLabDrafts("java")).toEqual({});
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(clearLabDraft("java", set.id)).toBe(false);
    expect(resetLabDrafts("java")).toBe(false);
  });
});

describe("CodeLab draft and attempt experience (DOM unit tests)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(props: CodeLabProps = {}, data = course) {
    act(() => root.render(createElement(CourseProvider, { data, children: createElement(CodeLab, props) })));
  }

  function click(text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent?.includes(text));
    expect(button, `button containing ${text}`).toBeDefined();
    act(() => button!.click());
  }

  function input(id: number, value: string) {
    const node = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-blank="${id}"]`)!;
    const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
      node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }

  function fillCorrectly() {
    for (const [id, value] of Object.entries(canonicalValues(set))) input(Number(id), value);
  }

  function remount(props: CodeLabProps = {}) {
    act(() => root.unmount());
    root = createRoot(container);
    render(props);
  }

  it("focuses the heading and resumes assistance across leaving and remounting", () => {
    render();
    click(set.title);
    expect(document.activeElement?.textContent).toBe(set.title);
    click("Show solution");
    click("All labs");
    expect(container.textContent).toContain("Resume saved draft");
    expect(container.textContent).toContain("assisted attempt");
    remount();
    click(set.title);
    expect(container.textContent).toContain("Draft resumed.");
    expect(container.querySelector<HTMLInputElement>('[data-blank="1"]')!.value).toBe("0");
    click("Check answers");
    expect(container.querySelector(".lab-feedback")?.textContent).toContain("assisted attempt");
    expect(loadLabProgress(course.meta.id).sets[set.id].solved).toBe(false);
    expect(loadLabDrafts(course.meta.id)[set.id].revealed).toEqual([1, 2, 3]);
  });

  it("does not turn a revealed answer clean when it is edited or emptied", () => {
    render({ selectedSetId: set.id });
    input(1, "1");
    click("Check answers");
    expect(container.textContent).toContain(set.blanks[0].explanation);
    click("Show answer");
    input(1, "");
    expect(loadLabDrafts(course.meta.id)[set.id].revealed).toEqual([1]);
    remount({ selectedSetId: set.id });
    fillCorrectly();
    click("Check answers");
    expect(container.querySelector(".lab-feedback")?.textContent).toContain("assisted attempt");
  });

  it("resets current solve state after editing, showing answers and confirmed Clear, not solve history", () => {
    render({ selectedSetId: set.id });
    fillCorrectly();
    click("Check answers");
    expect(container.querySelector(".lab-next")).not.toBeNull();
    expect(container.textContent).toContain(set.blanks[0].explanation);
    input(1, "1");
    expect(container.querySelector(".lab-next")).toBeNull();
    input(1, "0");
    expect(container.querySelector(".lab-next")).toBeNull();
    click("Check answers");
    expect(container.querySelector(".lab-next")).not.toBeNull();
    click("Show solution");
    expect(container.querySelector(".lab-next")).toBeNull();
    click("Check answers");
    expect(container.querySelector(".lab-feedback")?.textContent).toContain("assisted attempt");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click("Clear");
    expect(container.querySelector<HTMLInputElement>('[data-blank="1"]')!.value).toBe("0");
    expect(loadLabDrafts(course.meta.id)[set.id]).toBeDefined();
    click("Clear");
    expect(container.querySelector(".lab-next")).toBeNull();
    expect(container.querySelector(".lab-feedback")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('[data-blank="1"]')!.value).toBe("");
    expect(loadLabDrafts(course.meta.id)[set.id]).toBeUndefined();
    expect(container.textContent).toContain("solved before");
    expect(loadLabProgress(course.meta.id).sets[set.id].solved).toBe(true);
    fillCorrectly();
    click("Check answers");
    expect(container.querySelector(".lab-feedback")?.textContent).toContain("Lab complete.");
  });

  it("does not require confirmation to clear an empty attempt", () => {
    render({ selectedSetId: set.id });
    click("Clear");
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("checks once on Ctrl+Enter in the last input without advancing focus", () => {
    render({ selectedSetId: set.id });
    fillCorrectly();
    const node = container.querySelector<HTMLInputElement>('[data-blank="2"]')!;
    act(() => {
      node.focus();
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(loadLabProgress(course.meta.id).sets[set.id].attempts).toBe(1);
    expect(document.activeElement).toBe(container.querySelector(".lab-feedback"));
  });

  it("uses controlled selection, including not-found recovery, without changing the route itself", () => {
    const onSelectSet = vi.fn();
    render({ selectedSetId: "missing", onSelectSet });
    expect(container.textContent).toContain("Lab not found");
    click("All labs");
    expect(onSelectSet).toHaveBeenLastCalledWith(null);
    expect(container.textContent).toContain("Lab not found");
    render({ selectedSetId: null, onSelectSet });
    click(set.title);
    expect(onSelectSet).toHaveBeenLastCalledWith(set.id);
    expect(container.querySelector(".lab-runner")).toBeNull();
    render({ selectedSetId: set.id, onSelectSet });
    fillCorrectly();
    click("Check answers");
    click("Next:");
    expect(onSelectSet).toHaveBeenLastCalledWith(nextSet.id);
  });

  it("drops stale drafts before offering resume and isolates a changed course", () => {
    saveLabDraft(course.meta.id, set.id, draft({ fingerprint: "old-definition" }));
    render();
    expect(container.textContent).not.toContain("Resume saved draft");
    expect(loadLabDrafts(course.meta.id)).toEqual({});
    click(set.title);
    input(1, "42");
    render({}, { ...course, meta: { ...course.meta, id: "other-course" } });
    expect(container.querySelector(".lab-runner")).toBeNull();
    click(set.title);
    expect(container.querySelector<HTMLInputElement>('[data-blank="1"]')!.value).toBe("");
    expect(loadLabDrafts(course.meta.id)[set.id].values[1]).toBe("42");
  });

  it("shows failed-save warnings in runner and listing, retains session values and retries", () => {
    render();
    click(set.title);
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    click("Show solution");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be saved");
    expect(container.textContent).not.toContain("Draft saved on this device.");
    click("All labs");
    expect(container.textContent).toContain("Draft changes not saved");
    expect(container.textContent).not.toContain("Resume saved draft");
    click(set.title);
    expect(container.querySelector<HTMLInputElement>('[data-blank="1"]')!.value).toBe("0");
    failure.mockRestore();
    click("Retry save");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(loadLabDrafts(course.meta.id)[set.id].revealed).toEqual([1, 2, 3]);
  });

  it("labels worked output as an explanation, never as user-code execution", () => {
    const workedSet = { ...set, walkthrough: { steps: ["A worked illustration."], output: "Example only" } };
    const workedCourse = { ...course, lab: { sets: [workedSet], topics: [{ name: set.topic, sets: [workedSet] }], setById: new Map([[set.id, workedSet]]) } };
    render({ selectedSetId: set.id }, workedCourse);
    click("Show solution");
    expect(container.textContent).toContain("Worked expected output — not execution");
    expect(container.textContent).toContain("not a run of your code");
    expect(container.textContent).not.toContain("the code is valid Java");
  });
});
