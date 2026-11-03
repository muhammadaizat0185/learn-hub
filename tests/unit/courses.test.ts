import { describe, expect, it } from "vitest";
import { listCourses, loadCourse, normalizeResources } from "../../src/courses";
import { tokenKey } from "../../src/lib/lab";

describe("course registry", () => {
  it("lists the sample course", () => {
    const courses = listCourses();
    expect(courses.map((course) => course.id)).toContain("sample-course");
    expect(courses[0].exam.questions).toBeGreaterThan(0);
  });

  it("loads and validates the sample course", async () => {
    const data = await loadCourse("sample-course");
    expect(data.meta.id).toBe("sample-course");
    expect(data.questions).toHaveLength(12);
    expect(data.questionById.size).toBe(12);

    for (const question of data.questions) {
      const letters = new Set(question.options.map((option) => option.letter));
      expect(question.answer.length).toBeGreaterThan(0);
      for (const letter of question.answer) expect(letters.has(letter)).toBe(true);
      if (question.type === "mcq") expect(question.answer).toHaveLength(1);
      if (question.type === "multi") expect(question.answer.length).toBeGreaterThan(1);
    }
  });

  it("has explanations for every question and every option answer", async () => {
    const data = await loadCourse("sample-course");
    for (const question of data.questions) {
      const explanation = data.explanations[question.id];
      expect(explanation, `Q${question.id}`).toBeDefined();
      expect(explanation.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it("groups topics in first-seen order and covers every question", async () => {
    const data = await loadCourse("sample-course");
    expect(data.topics.map((topic) => topic.name)).toEqual([
      "Study techniques",
      "Focus & wellbeing",
      "Exam strategy",
    ]);
    const grouped = data.topics.flatMap((topic) => topic.ids).sort((a, b) => a - b);
    expect(grouped).toEqual(data.questions.map((q) => q.id).sort((a, b) => a - b));
  });

  it("rejects an unknown course id", async () => {
    await expect(loadCourse("missing-course")).rejects.toThrow(/no course folder/i);
  });
});

describe("discrete structure course", () => {
  it("is listed and loads without validation errors", async () => {
    expect(listCourses().map((course) => course.id)).toContain("discrete-structure");
    const data = await loadCourse("discrete-structure");
    expect(data.meta.shortTitle).toBe("Discrete");
    expect(data.questions.length).toBeGreaterThan(0);
  });

  it("covers the four source units as topics", async () => {
    const data = await loadCourse("discrete-structure");
    expect(data.topics.map((topic) => topic.name)).toEqual([
      "Propositions and logic",
      "CNF and DNF",
      "Predicates and quantifiers",
      "Mathematical induction",
    ]);
  });

  it("explains every question and marks every option letter", async () => {
    const data = await loadCourse("discrete-structure");
    for (const question of data.questions) {
      const explanation = data.explanations[question.id];
      expect(explanation, `Q${question.id}`).toBeDefined();
      expect(explanation.summary.trim().length).toBeGreaterThan(0);
      for (const option of question.options) {
        expect(explanation.options[option.letter], `Q${question.id} option ${option.letter}`).toBeDefined();
      }
    }
  });

  it("fills a whole mock exam and pairs every unit with two lab sets", async () => {
    const data = await loadCourse("discrete-structure");
    expect(data.questions).toHaveLength(data.meta.exam.questions);

    const lab = data.lab;
    expect(lab?.topics.map((topic) => [topic.name, topic.sets.length])).toEqual([
      ["Propositions and logic", 2],
      ["CNF and DNF", 2],
      ["Predicates and quantifiers", 2],
      ["Mathematical induction", 2],
    ]);

    const units = new Set(data.topics.map((topic) => topic.name));
    for (const set of lab?.sets ?? []) {
      expect(units.has(set.topic), `${set.id} topic`).toBe(true);
      expect(set.blanks.length, `${set.id} blanks`).toBeGreaterThanOrEqual(4);
      for (const blank of set.blanks) {
        if (blank.kind !== "input") continue;
        for (const answer of blank.answers) {
          expect(tokenKey(answer), `${set.id} blank ${blank.id}: "${answer}"`).not.toBeUndefined();
        }
      }
    }
  });
});

describe("decision support system course", () => {
  it("is listed and groups the chapter 1 pilot into three topics", async () => {
    expect(listCourses().map((course) => course.id)).toContain("decision-support-system");
    const data = await loadCourse("decision-support-system");
    expect(data.questions).toHaveLength(data.meta.exam.questions);
    expect(data.topics.map((topic) => [topic.name, topic.ids.length])).toEqual([
      ["DSS fundamentals", 7],
      ["Types of DSS", 6],
      ["Decision types and information systems", 7],
    ]);
  });

  it("explains every question and every option letter", async () => {
    const data = await loadCourse("decision-support-system");
    for (const question of data.questions) {
      const explanation = data.explanations[question.id];
      expect(explanation, `Q${question.id}`).toBeDefined();
      expect(explanation.summary.trim().length).toBeGreaterThan(0);
      for (const option of question.options) {
        expect(explanation.options[option.letter], `Q${question.id} option ${option.letter}`).toBeDefined();
      }
    }
  });

  it("pairs every topic with two decision lab sets of at least four blanks", async () => {
    const data = await loadCourse("decision-support-system");
    expect(data.meta.lab?.label).toBe("Decision lab");
    expect(data.lab?.topics.map((topic) => [topic.name, topic.sets.length])).toEqual([
      ["DSS fundamentals", 2],
      ["Types of DSS", 2],
      ["Decision types and information systems", 2],
    ]);
    for (const set of data.lab?.sets ?? []) expect(set.blanks.length, set.id).toBeGreaterThanOrEqual(4);
  });

  it("offers the playlist and notebook, and one video link per lesson", async () => {
    const data = await loadCourse("decision-support-system");
    expect(data.resources.map((resource) => resource.url)).toEqual([
      "https://youtube.com/playlist?list=PLjZJ5J1CN9KWr9SYZBSZpQuCCzeSIZja6",
      "https://notebook.google.com/notebook/1d3caef1-dfaa-48c3-b534-19c9f6c91a02",
    ]);
    expect(data.resources[1].note).toMatch(/sign-in/i);

    const lessons = data.lessons ?? [];
    expect(lessons).toHaveLength(3);
    for (const lesson of lessons) {
      expect(lesson.resources.length, lesson.id).toBeGreaterThan(0);
      for (const resource of lesson.resources) {
        expect(resource.url, `${lesson.id}: ${resource.label}`).toMatch(/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/);
      }
    }
  });
});

describe("study resource validation", () => {
  it("keeps labelled https links and drops everything else", () => {
    const kept = { label: "Chapter video", url: "https://www.youtube.com/watch?v=lZ0O_RcbdSg", note: "Ten minutes" };
    const loaded = normalizeResources([
      kept,
      { label: "Script", url: "javascript:alert(1)" },
      { label: "Local file", url: "file:///C:/notes.pdf" },
      { label: "Insecure", url: "http://example.com/notes" },
      { label: "Space in host", url: "https://not a url" },
      { label: "", url: "https://example.com" },
      { url: "https://example.com" },
      "Chapter video",
      null,
    ]);
    expect(loaded).toEqual([kept]);
  });

  it("returns an empty list when a course file omits or misshapes resources", () => {
    expect(normalizeResources(undefined)).toEqual([]);
    expect(normalizeResources("https://example.com")).toEqual([]);
    expect(normalizeResources([])).toEqual([]);
  });
});
