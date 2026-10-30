// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import javaLessons from "../../src/courses/java-programming/lessons.json";
import javaQuestions from "../../src/courses/java-programming/questions.json";
import javaLabs from "../../src/courses/java-programming/lab.json";
import sampleLessons from "../../src/courses/sample-course/lessons.json";
import sampleQuestions from "../../src/courses/sample-course/questions.json";
import type { TopicLesson } from "../../src/types";

const courses: {
  name: string;
  lessons: TopicLesson[];
  questions: { topic: string }[];
  labs: { id: string }[];
}[] = [
  { name: "Java", lessons: javaLessons, questions: javaQuestions, labs: javaLabs },
  { name: "Sample", lessons: sampleLessons, questions: sampleQuestions, labs: [] },
];

function expectText(value: unknown, context: string) {
  expect(typeof value, context).toBe("string");
  expect((value as string).trim().length, context).toBeGreaterThan(0);
}

describe.each(courses)("$name learning content", ({ lessons, questions, labs }) => {
  it("provides exactly one lesson for every current quiz topic", () => {
    const topics = [...new Set(questions.map((question) => question.topic))].sort();
    expect(lessons.map((lesson) => lesson.topic).sort()).toEqual(topics);
  });

  it("uses unique slug IDs, meaningful titles, and positive reading estimates", () => {
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length);
    for (const lesson of lessons) {
      expect(lesson.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expectText(lesson.title, `${lesson.id}: title`);
      expect(Number.isFinite(lesson.minutes), lesson.id).toBe(true);
      expect(lesson.minutes, lesson.id).toBeGreaterThan(0);
    }
  });

  it("teaches three to five distinct, nonempty concepts per lesson", () => {
    for (const lesson of lessons) {
      expect(Array.isArray(lesson.concepts), lesson.id).toBe(true);
      expect(lesson.concepts.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.concepts.length, lesson.id).toBeLessThanOrEqual(5);
      for (const concept of lesson.concepts) {
        expectText(concept, `${lesson.id}: concept`);
      }
      const unique = new Set(lesson.concepts.map((concept) => concept.trim()));
      expect(unique.size, lesson.id).toBe(lesson.concepts.length);
    }
  });

  it("includes an explained example with code or actionable steps", () => {
    for (const lesson of lessons) {
      const { example } = lesson;
      expectText(example.title, `${lesson.id}: example title`);
      expectText(example.explanation, `${lesson.id}: explanation`);
      expect(Boolean(example.code?.trim()) || Boolean(example.steps?.length), lesson.id).toBe(true);
      if (example.code !== undefined) {
        expectText(example.code, `${lesson.id}: code`);
        expect(example.code, lesson.id).not.toMatch(/\{\{\d+\}\}/);
      }
      if (example.steps !== undefined) {
        expect(Array.isArray(example.steps), lesson.id).toBe(true);
        expect(example.steps.length, lesson.id).toBeGreaterThan(0);
        for (const step of example.steps) {
          expectText(step, `${lesson.id}: step`);
        }
      }
      if (example.output !== undefined) {
        expectText(example.output, `${lesson.id}: output`);
        expectText(example.code, `${lesson.id}: code producing the output`);
        expect(example.explanation, lesson.id).toMatch(/static expected output/i);
      }
    }
  });

  it("references only existing labs without duplicate links in a lesson", () => {
    const knownIds = new Set(labs.map((lab) => lab.id));
    for (const lesson of lessons) {
      expect(Array.isArray(lesson.labIds), lesson.id).toBe(true);
      expect(new Set(lesson.labIds).size, lesson.id).toBe(lesson.labIds.length);
      for (const id of lesson.labIds) {
        expect(knownIds.has(id), `${lesson.id}: unknown lab ${id}`).toBe(true);
      }
    }
  });

  it("makes every available lab reachable from at least one lesson", () => {
    const linkedIds = [...new Set(lessons.flatMap((lesson) => lesson.labIds))].sort();
    expect(linkedIds).toEqual(labs.map((lab) => lab.id).sort());
  });
});

describe("Java guided example progression", () => {
  it("introduces foundations before objects, then windows before event handling", () => {
    const topics = javaLessons.map((lesson) => lesson.topic);
    const prerequisites = [
      ["Code validity", "Control structures"],
      ["Control structures", "OOP concepts"],
      ["String handling", "OOP concepts"],
      ["OOP concepts", "GUI & Swing"],
      ["GUI & Swing", "Event handling"],
    ];
    for (const [earlier, later] of prerequisites) {
      expect(topics.indexOf(earlier), earlier).toBeGreaterThanOrEqual(0);
      expect(topics.indexOf(earlier), `${earlier} before ${later}`).toBeLessThan(topics.indexOf(later));
    }
  });

  it("supplies Java source while distinguishing GUI results from console output", () => {
    for (const lesson of courses[0].lessons) {
      expectText(lesson.example.code, `${lesson.id}: Java source`);
      if (["GUI & Swing", "Event handling"].includes(lesson.topic)) {
        expect(lesson.example.output, lesson.id).toBeUndefined();
        expect(lesson.example.explanation, lesson.id).toMatch(/static expected visual/i);
      } else {
        expectText(lesson.example.output, `${lesson.id}: console output`);
      }
    }
  });
});

const hasJdk = ["javac", "java"].every((command) => {
  const probe = spawnSync(command, ["-version"], { encoding: "utf8", timeout: 10_000 });
  return !probe.error && probe.status === 0;
});

it.skipIf(!hasJdk)(
  "compiles all Java examples and verifies static console outputs (requires javac and java)",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "learn-hub-lessons-"));
    try {
      const examples = courses[0].lessons.map((lesson) => {
        const code = lesson.example.code!;
        const className = /public class ([A-Za-z_$][\w$]*)/.exec(code)?.[1];
        expect(className, `${lesson.id}: runnable class`).toBeDefined();
        const file = join(directory, `${className}.java`);
        writeFileSync(file, code, "utf8");
        return { lesson, className: className!, file };
      });
      // Target Java 11 so a newer compiler can validate against an older installed runtime.
      const compiled = spawnSync(
        "javac",
        ["--release", "11", "-encoding", "UTF-8", "-d", directory, ...examples.map(({ file }) => file)],
        { encoding: "utf8", timeout: 20_000 }
      );
      expect(compiled.error, "javac process").toBeUndefined();
      expect(compiled.status, compiled.stderr || compiled.stdout).toBe(0);

      for (const { lesson, className } of examples) {
        if (lesson.example.output === undefined) continue;
        const result = spawnSync(
          "java",
          ["-Djava.awt.headless=true", "-Duser.language=en", "-Duser.country=US", "-cp", directory, className],
          { encoding: "utf8", timeout: 5_000 }
        );
        expect(result.error, `${lesson.id}: java process`).toBeUndefined();
        expect(result.status, `${lesson.id}: ${result.stderr}`).toBe(0);
        const output = result.stdout.replace(/\r\n/g, "\n").replace(/\n$/, "");
        expect(output, lesson.id).toBe(lesson.example.output);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  45_000
);
