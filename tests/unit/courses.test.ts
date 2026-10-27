import { describe, expect, it } from "vitest";
import { listCourses, loadCourse } from "../../src/courses";

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
