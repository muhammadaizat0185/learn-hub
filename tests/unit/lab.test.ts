import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assemble,
  canonicalValues,
  gradeBlank,
  gradeSet,
  loadLabProgress,
  normalizeLabProgress,
  recordLabAttempt,
  resetLabProgress,
  saveLabProgress,
  tokenKey,
  tokenize,
  validateLab,
} from "../../src/lib/lab";
import { loadCourse } from "../../src/courses";
import type { LabSet } from "../../src/types";

const loopSet: LabSet = {
  id: "loops-1",
  topic: "Loops",
  title: "Sum 1 to n",
  brief: "Add every number from 1 to n.",
  code: "int sum = {{1}};\nfor (int i = 1; i <= n; {{2}}) {\n    sum {{3}} i;\n}",
  blanks: [
    { id: 1, kind: "input", answers: ["0"] },
    { id: 2, kind: "select", options: ["i++", "i--", "i + 2"], answer: "i++" },
    { id: 3, kind: "select", options: ["+=", "-=", "=="], answer: "+=" },
  ],
};

describe("java tokenizer", () => {
  it("ignores formatting differences", () => {
    expect(tokenKey("i  =  i+1")).toBe(tokenKey("i = i + 1"));
    expect(tokenKey("for(int i=0;i<3;i++)")).toBe(tokenKey("for (int i = 0; i < 3; i++)"));
  });

  it("keeps string contents intact", () => {
    expect(tokenKey('"Hello  World"')).toBe('"Hello  World"');
    expect(tokenKey('"Hello World"')).not.toBe(tokenKey('"HelloWorld"'));
  });

  it("reads shifts and generics as single tokens", () => {
    expect(tokenize("a >>>= 2").tokens.map((token) => token.text)).toEqual(["a", ">>>=", "2"]);
    expect(tokenize("List<String>").tokens.map((token) => token.text)).toEqual([
      "List",
      "<",
      "String",
      ">",
    ]);
  });

  it("reports unterminated literals and stray characters", () => {
    expect(tokenize('"abc').error).toMatch(/unterminated string/);
    expect(tokenize("a # b").error).toMatch(/unexpected character/);
  });
});

describe("blank grading", () => {
  it("accepts the canonical typed answer regardless of spacing", () => {
    expect(gradeBlank({ id: 1, kind: "input", answers: ["i = i + 1"] }, "i=i+1").status).toBe(
      "correct"
    );
  });

  it("ignores a stray trailing semicolon", () => {
    expect(gradeBlank({ id: 1, kind: "input", answers: ["count++"] }, "count++;").status).toBe(
      "correct"
    );
  });

  it("rejects wrong code and wrong syntax differently", () => {
    expect(gradeBlank({ id: 1, kind: "input", answers: ["count++"] }, "count--").status).toBe(
      "wrong"
    );
    expect(gradeBlank({ id: 1, kind: "input", answers: ["count++"] }, "count+(").status).toBe(
      "syntax"
    );
    expect(gradeBlank({ id: 1, kind: "input", answers: ["count++"] }, "count++ ; )").status).toBe(
      "syntax"
    );
  });

  it("treats an empty blank as unanswered, not wrong", () => {
    expect(gradeBlank({ id: 1, kind: "input", answers: ["x"] }, "   ").status).toBe("empty");
  });

  it("matches authored tokens rather than recognizing all equivalent Java", () => {
    const blank = { id: 1, kind: "input" as const, answers: ["count++"] };
    expect(gradeBlank(blank, "count += 1").status).toBe("wrong");
    expect(gradeBlank(blank, "count /* increment */ ++;").status).toBe("correct");
    // An optional semicolon is a matching convenience, not a compilation guarantee.
    expect(gradeBlank({ id: 1, kind: "input", answers: ["(double)"] }, "(double);").status).toBe("correct");
  });

  it("checks dropdown blanks exactly", () => {
    const blank = { id: 2, kind: "select" as const, options: ["int", "double"], answer: "double" };
    expect(gradeBlank(blank, "double").status).toBe("correct");
    expect(gradeBlank(blank, "Double").status).toBe("wrong");
  });
});

describe("set grading", () => {
  it("solves a set only when every blank is right", () => {
    const answers = canonicalValues(loopSet);
    expect(gradeSet(loopSet, answers).solved).toBe(true);
    expect(gradeSet(loopSet, { ...answers, 3: "==" })).toMatchObject({
      solved: false,
      correct: 2,
      total: 3,
    });
  });

  it("counts syntax errors separately from wrong answers", () => {
    const result = gradeSet(loopSet, { 1: "0 ((", 2: "i++", 3: "+=" });
    expect(result.syntaxErrors).toBe(1);
    expect(result.blanks[1]).toMatchObject({ status: "syntax" });
    expect(result.correct).toBe(2);
  });

  it("assembles the source with answers and leaves gaps visible", () => {
    expect(assemble(loopSet, canonicalValues(loopSet))).toContain("sum += i;");
    expect(assemble(loopSet, {})).toContain("/* ? */");
  });
});

describe("content validation", () => {
  it("accepts a well-formed set", () => {
    expect(validateLab([loopSet])).toEqual([]);
  });

  it("accepts optional teaching metadata without requiring it for legacy sets", () => {
    expect(validateLab([{
      ...loopSet,
      blanks: loopSet.blanks.map((blank) => ({ ...blank, explanation: "Accumulate the running sum." })),
      walkthrough: { steps: ["Add the integers in order."], output: "Total: 6" },
    }])).toEqual([]);
    expect(validateLab([loopSet])).toEqual([]);
  });

  it.each([null, "steps", [], {}, { steps: [] }, { steps: [false] }, { steps: [" "] },
    { steps: ["x".repeat(2001)] }, { steps: Array(21).fill("Step") },
    { steps: ["Step"], output: 42 }, { steps: ["Step"], output: " " },
    { steps: ["Step"], output: "x".repeat(10001) },
  ])("rejects malformed optional walkthrough %#", (walkthrough) => {
    expect(validateLab([{ ...loopSet, walkthrough } as unknown as LabSet]).some((error) => error.includes("walkthrough"))).toBe(true);
  });

  it.each([null, 42, {}, " ", "x".repeat(2001)])("rejects malformed optional explanation %#", (explanation) => {
    const set = { ...loopSet, blanks: [{ ...loopSet.blanks[0], explanation }, ...loopSet.blanks.slice(1)] };
    expect(validateLab([set as unknown as LabSet]).some((error) => error.includes("explanation"))).toBe(true);
  });

  it("flags markers without blanks and duplicate ids", () => {
    const broken: LabSet = {
      ...loopSet,
      code: "int a = {{1}}; int b = {{9}};",
      blanks: [loopSet.blanks[0], { ...loopSet.blanks[1], id: 1 }],
    };
    const errors = validateLab([broken]);
    expect(errors.some((error) => error.includes("{{9}}"))).toBe(true);
    expect(errors.some((error) => error.includes("duplicate blank ids"))).toBe(true);
    expect(errors.some((error) => error.includes("3-10"))).toBe(true);
  });

  it("flags a dropdown answer that is not one of its options", () => {
    const broken: LabSet = {
      ...loopSet,
      blanks: [
        { id: 1, kind: "select", options: ["a", "b"], answer: "c" },
        { id: 2, kind: "select", options: ["x", "y"], answer: "x" },
        { id: 3, kind: "select", options: ["p", "q"], answer: "p" },
      ],
      code: "{{1}} {{2}} {{3}}",
    };
    expect(validateLab([broken]).some((error) => error.includes("not an option"))).toBe(true);
  });
});

describe("lab progress persistence", () => {
  beforeEach(() => localStorage.clear());

  it.each([null, false, [], "bad", { version: 2, sets: {} }, { sets: [] }, { sets: null }])("normalizes malformed progress %#", (value) => {
    expect(normalizeLabProgress(value)).toEqual({ version: 1, sets: {} });
  });

  it("sanitizes fields, nonfinite counters and unsafe keys without mutating input", () => {
    const source = {
      sets: {
        good: { attempts: 3.8, solved: true, lastAt: "2026-01-01T00:00:00.000Z" },
        bad: { attempts: Infinity, solved: "true", lastAt: "not a date" },
        huge: { attempts: Number.MAX_VALUE, solved: false, lastAt: "x".repeat(100) },
        negative: { attempts: -5, solved: false, lastAt: "" },
        nan: { attempts: NaN },
        array: [],
        nil: null,
        constructor: { attempts: 2, solved: true },
        ["__proto__"]: { attempts: 5, solved: true },
      },
    };
    const progress = normalizeLabProgress(source);
    expect(progress.sets.good).toEqual({ attempts: 3, solved: true, lastAt: "2026-01-01T00:00:00.000Z" });
    expect(progress.sets.bad).toEqual({ attempts: 0, solved: false, lastAt: "" });
    expect(progress.sets.huge.attempts).toBe(Number.MAX_SAFE_INTEGER);
    expect(progress.sets.negative.attempts).toBe(0);
    expect(progress.sets.nan.attempts).toBe(0);
    expect(Object.keys(progress.sets)).toEqual(["good", "bad", "huge", "negative", "nan"]);
    expect(source.sets.good.attempts).toBe(3.8);
  });

  it("preserves the existing storage key and course-isolated progress APIs", () => {
    saveLabProgress("java", { version: 1, sets: { "loops-1": { attempts: 2, solved: true, lastAt: "" } } });
    expect(localStorage.getItem("hub.v1.lab.java")).toBeTruthy();
    expect(loadLabProgress("other").sets).toEqual({});
    expect(recordLabAttempt("java", "loops-1", false).sets["loops-1"]).toMatchObject({ attempts: 3, solved: true });
    recordLabAttempt("other", "loops-1", false);
    resetLabProgress("java");
    expect(loadLabProgress("java").sets).toEqual({});
    expect(loadLabProgress("other").sets["loops-1"].attempts).toBe(1);
  });

  it("keeps assisted checks separate from previous solve history", () => {
    expect(recordLabAttempt("java", "loops-1", false).sets["loops-1"].solved).toBe(false);
    recordLabAttempt("java", "loops-1", true);
    expect(recordLabAttempt("java", "loops-1", false).sets["loops-1"].solved).toBe(true);
  });

  it("handles corrupt JSON and unavailable storage gracefully", () => {
    localStorage.setItem("hub.v1.lab.java", "{");
    expect(loadLabProgress("java").sets).toEqual({});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadLabProgress("java").sets).toEqual({});
    expect(() => saveLabProgress("java", { version: 1, sets: {} })).not.toThrow();
    expect(recordLabAttempt("java", "loops-1", true).sets["loops-1"].solved).toBe(true);
    expect(() => resetLabProgress("java")).not.toThrow();
  });
});

describe("java course code lab", () => {
  it("groups 2-3 simulations per topic with 3-10 gaps each", async () => {
    const data = await loadCourse("java-programming");
    expect(data.lab).toBeDefined();
    const lab = data.lab!;

    expect(lab.setById.size).toBe(lab.sets.length);
    expect(lab.topics.length).toBeGreaterThanOrEqual(6);
    for (const topic of lab.topics) {
      expect(topic.sets.length, topic.name).toBeGreaterThanOrEqual(2);
      expect(topic.sets.length, topic.name).toBeLessThanOrEqual(3);
      for (const set of topic.sets) {
        expect(set.blanks.length, set.id).toBeGreaterThanOrEqual(3);
        expect(set.blanks.length, set.id).toBeLessThanOrEqual(10);
      }
    }
  });

  it("mixes dropdown tokens and typed gaps", async () => {
    const lab = (await loadCourse("java-programming")).lab!;
    const kinds = lab.sets.flatMap((set) => set.blanks.map((blank) => blank.kind));
    expect(kinds).toContain("select");
    expect(kinds).toContain("input");
    expect(lab.sets.some((set) => set.blanks.filter((blank) => blank.kind === "input").length >= 2)).toBe(
      true
    );
  });

  it("provides authored explanations for all 86 blanks and a walkthrough for all 17 sets", async () => {
    const lab = (await loadCourse("java-programming")).lab!;
    expect(lab.sets).toHaveLength(17);
    expect(lab.sets.flatMap((set) => set.blanks)).toHaveLength(86);
    const explanations: string[] = [];
    for (const set of lab.sets) {
      expect(set.walkthrough?.steps.length, set.id).toBeGreaterThanOrEqual(2);
      for (const blank of set.blanks) {
        expect(blank.explanation?.trim().length, `${set.id}/${blank.id}`).toBeGreaterThan(30);
        explanations.push(blank.explanation!);
      }
    }
    expect(new Set(explanations).size).toBe(explanations.length);
    const outputs = Object.fromEntries(lab.sets.filter((set) => set.walkthrough?.output).map((set) => [set.id, set.walkthrough!.output]));
    expect(outputs).toEqual({
      "loops-2": "1 2 3 \n2 4 6 \n3 6 9 \nSum of all products: 36",
      "classes-1": "75.0",
      "classes-2": "Area: 12.0\nPerimeter: 14.0\nDouble area: 24.0",
      "inheritance-1": "Woof",
      "exceptions-2": "Not enough money",
    });
    expect(lab.setById.get("classes-1")!.blanks[1].explanation).toContain("plain balance would also be valid Java");
    expect(lab.setById.get("decision-2")!.blanks[3].explanation).toContain("out-of-range");
    expect(lab.setById.get("basics-2")!.hint).toContain("truncate first");
  });

  it("accepts the canonical answer for every gap in every set", async () => {
    const lab = (await loadCourse("java-programming")).lab!;
    for (const set of lab.sets) {
      expect(validateLab([set]), set.id).toEqual([]);
      const result = gradeSet(set, canonicalValues(set));
      expect(result.solved, `${set.id} (${result.correct}/${result.total})`).toBe(true);
    }
  });

  it("reports a set as unsolved when one gap is cleared", async () => {
    const lab = (await loadCourse("java-programming")).lab!;
    for (const set of lab.sets) {
      const values = canonicalValues(set);
      const last = set.blanks[set.blanks.length - 1];
      delete values[last.id];
      const result = gradeSet(set, values);
      expect(result.solved, set.id).toBe(false);
      expect(result.blanks[last.id].status, set.id).toBe("empty");
    }
  });
});
