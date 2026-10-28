import { describe, expect, it } from "vitest";
import {
  assemble,
  canonicalValues,
  gradeBlank,
  gradeSet,
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
