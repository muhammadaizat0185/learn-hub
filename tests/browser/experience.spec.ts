import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Question } from "../../src/types";

const sampleQuestions: Question[] = JSON.parse(readFileSync(new URL("../../src/courses/sample-course/questions.json", import.meta.url), "utf8"));
const course = "sample-course";
const key = (suffix: string, id = course) => `hub.v1.course.${id}.${suffix}`;
async function stored(page: Page, name: string) {
  return page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? "null"), name);
}
async function seedPractice(page: Page, ids = [1, 2, 3], id = course) {
  await page.goto("/");
  await page.evaluate(({ name, ids }) => localStorage.setItem(name, JSON.stringify({
    version: 1, label: "Saved practice", source: "practice", questionIds: ids,
    index: 0, answers: {}, revealed: [], startedAt: Date.now(),
  })), { name: key("practice", id), ids });
  await page.goto(`/#/c/${id}/quiz`);
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeVisible();
}
async function answer(page: Page, qid: number, correct = true) {
  const question = sampleQuestions.find((q) => q.id === qid)!;
  const letters = correct ? question.answer : [question.options.find((option) => !question.answer.includes(option.letter))!.letter];
  for (const letter of letters) await page.locator("button.option").filter({ has: page.locator(".letter", { hasText: new RegExp(`^${letter}$`) }) }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.locator(".feedback")).toBeVisible();
}
async function nav(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Course", exact: true }).getByRole("button", { name: label, exact: true }).click();
}
async function fits(page: Page) {
  const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
}

test("real courses precede samples and display settings persist", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("button.course-card").first()).toContainText("Java");
  await expect(page.getByRole("heading", { name: "Try a sample" })).toBeVisible();
  await page.getByRole("button", { name: "Display preferences", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByLabel("Reading text size").selectOption("larger");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const count of [5, 10, 20]) {
  test(`quick quiz respects a ${count}-question limit`, async ({ page }) => {
    await page.goto("/#/c/java-programming");
    await page.getByLabel("Questions per session").selectOption(String(count));
    await page.getByRole("button", { name: "Quick quiz", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Practice — question 1 of ${count}`, exact: true })).toBeAttached();
    const session = await stored(page, key("practice", "java-programming"));
    expect(session.questionIds).toHaveLength(count);
    expect(new Set(session.questionIds).size).toBe(count);
  });
}

test("replacement dialog can cancel, resume, and replace without deleting checked progress", async ({ page }) => {
  await seedPractice(page);
  await answer(page, 1);
  await page.getByRole("button", { name: "Save & exit" }).click();
  const saved = await stored(page, key("practice"));
  await page.getByRole("button", { name: "Quick quiz", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Resume existing practice" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await stored(page, key("practice"))).toEqual(saved);
  await page.getByRole("button", { name: "Quick quiz", exact: true }).click();
  await dialog.getByRole("button", { name: "Resume existing practice" }).click();
  await expect(page.locator(".explanation")).toBeVisible();
  expect(await stored(page, key("practice"))).toEqual(saved);
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.getByLabel("Questions per session").selectOption("5");
  await page.getByRole("button", { name: "Quick quiz", exact: true }).click();
  await dialog.getByRole("button", { name: "Replace with new practice" }).click();
  await expect(page.locator(".quiz-top")).toContainText("Question 1 / 5");
  expect((await stored(page, key("practice"))).revealed).toEqual([]);
  expect((await stored(page, key("progress"))).stats[1]).toMatchObject({ seen: 1, correct: 1 });
});

test("partial practice has honest summary, retry, and reload-safe stats", async ({ page }) => {
  await seedPractice(page);
  await answer(page, 1);
  await page.getByRole("button", { name: "Next question →" }).click();
  await answer(page, 2, false);
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  const summary = await stored(page, key("summary"));
  expect(summary).toMatchObject({ correctIds: [1], missedIds: [2], uncheckedIds: [3] });
  expect(await stored(page, key("practice"))).toBeNull();
  const before = await stored(page, key("progress"));
  expect(before.stats[3]).toBeUndefined();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  expect(await stored(page, key("progress"))).toEqual(before);
  await page.getByRole("button", { name: "Retry mistakes (1)" }).click();
  await expect(page.locator(".quiz-top")).toContainText("Question 1 / 1");
  expect((await stored(page, key("practice"))).questionIds).toEqual([2]);
});

test("wrong answers are due now; early correct practice does not promote spaced recall", async ({ page }) => {
  await seedPractice(page, [1]);
  await answer(page, 1, false);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "See review schedule", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recall review" })).toBeVisible();
  await page.getByRole("button", { name: "Review question", exact: true }).click();
  await answer(page, 1);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const first = (await stored(page, key("progress"))).reviews[1];
  expect(first.successfulReviews).toBe(1);
  expect(first.dueAt).toBeGreaterThan(Date.now());
  await page.goto("/#/c/sample-course/library/q-1");
  await page.getByRole("button", { name: "Practice this one" }).click();
  await answer(page, 1);
  const early = (await stored(page, key("progress"))).reviews[1];
  expect(early.successfulReviews).toBe(1);
  expect(early.dueAt).toBe(first.dueAt);
});

test("completed exam keeps unanswered questions for review and never regrades on reload", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/#/c/sample-course/exam");
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await page.locator("button.option").first().click();
  await page.getByRole("navigation", { name: "Question list" }).getByRole("button").last().click();
  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page).toHaveURL(/\/exam\/results$/);
  const before = await stored(page, key("progress"));
  expect(before.examHistory).toHaveLength(1);
  expect(Object.keys(before.stats)).toHaveLength(1);
  expect(Object.values(before.reviews).filter((r: any) => r.reason === "unanswered")).toHaveLength(7);
  await page.reload();
  await expect(page.getByRole("button", { name: /Review missed and unanswered/ })).toBeVisible();
  await nav(page, "Home");
  await page.goBack();
  await expect(page).toHaveURL(/\/exam\/results$/);
  expect(await stored(page, key("progress"))).toEqual(before);
  expect(await stored(page, key("exam"))).toBeNull();
});

test("expired saved exam grades once when resumed", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((name) => localStorage.setItem(name, JSON.stringify({
    version: 1, questionIds: [1, 2], index: 0, answers: {}, flags: [],
    startedAt: Date.now() - 120000, deadline: Date.now() - 1000,
  })), key("exam"));
  await page.goto("/#/c/sample-course");
  await page.getByRole("button", { name: "View results", exact: true }).click();
  await expect(page).toHaveURL(/\/exam\/results$/);
  expect((await stored(page, key("progress"))).examHistory).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("button", { name: /Review missed and unanswered/ })).toBeVisible();
  expect((await stored(page, key("progress"))).examHistory).toHaveLength(1);
});

test("lesson links connect practice and labs, browser Back and skip link retain route", async ({ page }) => {
  await page.goto("/#/c/java-programming/learn");
  await page.getByRole("button", { name: "Open topic", exact: true }).first().click();
  await expect(page).toHaveURL(/\/learn\/code-validity-foundations$/);
  await expect(page.getByRole("heading", { name: "Read declarations, types, and failures" })).toBeVisible();
  const route = page.url();
  await page.getByRole("link", { name: "Skip to main content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  expect(page.url()).toBe(route);
  await page.getByRole("button", { name: "Practise this topic" }).click();
  await expect(page.locator(".quiz-top")).toContainText("Code validity");
  await page.getByRole("button", { name: "Finish session", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await page.goto(route);
  await page.getByRole("button", { name: "Welcome banner", exact: true }).click();
  await expect(page).toHaveURL(/\/lab\/basics-1$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Read declarations, types, and failures" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Read declarations, types, and failures" })).toBeVisible();
});

test("lab drafts survive routes and reload, revealed solutions remain assisted", async ({ page }) => {
  await page.goto("/#/c/java-programming/lab/basics-1");
  await page.locator('input[data-blank="3"]').fill("nextLine");
  await nav(page, "Home");
  await page.goBack();
  await expect(page.locator('input[data-blank="3"]')).toHaveValue("nextLine");
  await page.reload();
  await expect(page.locator('input[data-blank="3"]')).toHaveValue("nextLine");
  await expect(page.getByText(/Draft resumed/)).toBeVisible();
  await page.getByRole("button", { name: "Show solution", exact: true }).click();
  await page.reload();
  await expect(page.getByText("assisted attempt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.locator(".lab-feedback")).toContainText("does not count as a new independent solve");
  await expect(page.getByRole("heading", { name: "Worked walkthrough" })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator('input[data-blank="3"]')).toHaveValue("nextLine");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator('input[data-blank="3"]')).toHaveValue("");
  await expect(page.getByText("assisted attempt", { exact: true })).not.toBeVisible();
});

test("clean lab success is invalidated by edits and solution reveals, while history stays", async ({ page }) => {
  await page.goto("/#/c/java-programming/lab/basics-1");
  await page.locator('select[data-blank="1"]').selectOption("new");
  await page.locator('select[data-blank="2"]').selectOption("String");
  await page.locator('input[data-blank="3"]').fill("nextLine");
  await page.locator('select[data-blank="4"]').selectOption("+");
  await page.locator('input[data-blank="5"]').fill("+");
  await page.locator('input[data-blank="5"]').press("Control+Enter");
  await expect(page.locator(".lab-feedback.good")).toContainText("Lab complete");
  await expect(page.locator(".lab-next")).toBeVisible();
  await page.locator('input[data-blank="3"]').fill("wrong");
  await expect(page.locator(".lab-next")).not.toBeVisible();
  await page.getByRole("button", { name: "Show solution", exact: true }).click();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.locator(".lab-feedback.good")).toContainText("assisted attempt");
  expect((await stored(page, "hub.v1.lab.java-programming")).sets["basics-1"].solved).toBe(true);
  await expect(page.locator(".lab-next")).not.toBeVisible();
});

test("complete backup exports assisted drafts and restores with session cleanup", async ({ page }) => {
  await seedPractice(page, [1], "java-programming");
  await nav(page, "Code lab");
  await page.getByRole("button", { name: /Welcome banner/ }).click();
  await page.getByRole("button", { name: "Show solution", exact: true }).click();
  await nav(page, "Library");
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.version).toBe(2);
  expect(backup.labDrafts["basics-1"].revealed).toHaveLength(5);
  expect(backup.practice).toBeUndefined();
  await page.evaluate((name) => localStorage.setItem(name, "unrelated-course"), key("practice"));
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole("status")).toContainText("Active sessions were cleared");
  expect(await stored(page, key("practice", "java-programming"))).toBeNull();
  expect(await page.evaluate((name) => localStorage.getItem(name), key("practice"))).toBe("unrelated-course");
  await page.goto("/#/c/java-programming/lab/basics-1");
  await expect(page.getByText("assisted attempt", { exact: true })).toBeVisible();
  await page.goto("/#/c/sample-course/library/progress");
  await page.locator('input[type="file"]').setInputFiles({ name: "wrong-course.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole("alert")).toContainText(/belongs to|different course/i);
});

for (const width of [320, 390]) {
  test(`larger text and code stay within ${width}px mobile viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem("hub.v1.preferences", JSON.stringify({ theme: "light", textSize: "larger" })));
    await page.goto("/#/c/java-programming");
    await expect(page.getByRole("heading", { name: "Java Programming (BIT 33803)", exact: true })).toBeVisible();
    await fits(page);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
    await page.goto("/#/c/java-programming/learn/code-validity-foundations");
    await expect(page.locator(".lesson-code").first()).toBeVisible();
    await fits(page);
    expect(await page.locator(".lesson-code").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    await page.screenshot({ path: testInfo.outputPath(`lesson-${width}.png`), fullPage: true });
    await page.goto("/#/c/java-programming/lab/basics-1");
    await expect(page.locator(".lab-code")).toBeVisible();
    await fits(page);
    expect(await page.locator(".lab-code").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.locator(".lab-field").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    const targets = await page.locator("button:visible, select:visible, input:visible").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...targets)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`lab-${width}.png`), fullPage: true });
  });
}

test("keyboard tabs and lesson section controls keep useful focus", async ({ page }) => {
  await page.goto("/#/c/java-programming/library/questions");
  const questions = page.getByRole("tab", { name: "Question bank", exact: true });
  const progress = page.getByRole("tab", { name: "Progress", exact: true });
  await questions.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/library\/progress$/);
  await expect(progress).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/library\/questions$/);
  await expect(questions).toBeFocused();
  await page.goto("/#/c/java-programming/learn/code-validity-foundations");
  const url = page.url();
  await page.getByRole("button", { name: "2. See an example", exact: true }).click();
  await expect(page.locator("#lesson-example")).toBeFocused();
  expect(page.url()).toBe(url);
});

test("two tabs submitting the same saved exam record it only once", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate((name) => localStorage.setItem(name, JSON.stringify({
    version: 1, questionIds: [1, 2], index: 1, answers: { 1: { letters: ["B"] } }, flags: [],
    startedAt: Date.now() - 1000, deadline: Date.now() + 60000,
  })), key("exam"));
  const other = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  other.on("dialog", (dialog) => void dialog.accept());
  await Promise.all([page.goto("/#/c/sample-course/exam"), other.goto("/#/c/sample-course/exam")]);
  await expect(page.getByRole("button", { name: "Submit exam" })).toBeVisible();
  await expect(other.getByRole("button", { name: "Submit exam" })).toBeVisible();
  // Hold the lock until both tabs have queued a submit, then release them together.
  await page.evaluate(async () => {
    const scope = window as typeof window & { releaseExamLock?: () => void };
    let ready!: () => void;
    const acquired = new Promise<void>((resolve) => { ready = resolve; });
    void navigator.locks.request("hub:sample-course:exam-finish", () => new Promise<void>((release) => {
      scope.releaseExamLock = release;
      ready();
    }));
    await acquired;
  });
  await Promise.all([
    page.getByRole("button", { name: "Submit exam" }).click(),
    other.getByRole("button", { name: "Submit exam" }).click(),
  ]);
  await page.evaluate(() => (window as typeof window & { releaseExamLock: () => void }).releaseExamLock());
  await expect(page).toHaveURL(/\/exam\/results$/);
  await expect(other).toHaveURL(/\/exam\/results$/);
  const progress = await stored(page, key("progress"));
  expect(progress.examHistory).toHaveLength(1);
  expect(progress.stats[1].seen).toBe(1);
  expect(progress.stats[2]).toBeUndefined();
  await other.reload();
  expect(await stored(other, key("progress"))).toEqual(progress);
});

test("failed lab-result saves warn and remain available for backup in this tab", async ({ page }) => {
  await page.goto("/#/c/java-programming/lab/basics-1");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === "hub.v1.lab.java-programming") throw new DOMException("Quota exceeded", "QuotaExceededError");
      original.call(this, name, value);
    };
  });
  await page.locator('select[data-blank="1"]').selectOption("new");
  await page.locator('select[data-blank="2"]').selectOption("String");
  await page.locator('input[data-blank="3"]').fill("nextLine");
  await page.locator('select[data-blank="4"]').selectOption("+");
  await page.locator('input[data-blank="5"]').fill("+");
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.locator(".lab-feedback.good")).toContainText("Lab complete");
  await expect(page.getByRole("alert")).toContainText("only kept in this tab");
  expect(await stored(page, "hub.v1.lab.java-programming")).toBeNull();
  await nav(page, "Library");
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export progress" }).click();
  const download = await downloaded;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.labProgress.sets["basics-1"]).toMatchObject({ solved: true, attempts: 1 });
});

test("course reset removes drafts and sessions but keeps other courses and display choices", async ({ page }) => {
  await seedPractice(page, [1], "java-programming");
  await nav(page, "Code lab");
  await page.getByRole("button", { name: /Welcome banner/ }).click();
  await page.getByRole("button", { name: "Show solution", exact: true }).click();
  await page.evaluate(({ other, settings }) => {
    localStorage.setItem(other, "other course progress");
    localStorage.setItem(settings, JSON.stringify({ theme: "dark", textSize: "large" }));
  }, { other: key("progress"), settings: "hub.v1.preferences" });
  await nav(page, "Library");
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Reset all progress…", exact: true }).click();
  await expect(page).toHaveURL(/#\/c\/java-programming$/);
  expect(await stored(page, key("practice", "java-programming"))).toBeNull();
  expect(await stored(page, "hub.v1.lab-drafts.java-programming")).toBeNull();
  expect(await stored(page, "hub.v1.lab.java-programming")).toBeNull();
  expect(await page.evaluate((name) => localStorage.getItem(name), key("progress"))).toBe("other course progress");
  expect(await stored(page, "hub.v1.preferences")).toEqual({ theme: "dark", textSize: "large" });
});

for (const theme of ["light", "dark"]) {
  test(`desktop ${theme} home and lesson layouts`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((theme) => localStorage.setItem("hub.v1.preferences", JSON.stringify({ theme, textSize: "standard" })), theme);
    await page.goto("/#/c/java-programming");
    await expect(page.locator(".next-session")).toBeVisible();
    await fits(page);
    await page.screenshot({ path: testInfo.outputPath(`desktop-home-${theme}.png`), fullPage: true });
    await page.goto("/#/c/java-programming/learn/oop-state-and-contracts");
    await expect(page.locator(".lesson-code").first()).toBeVisible();
    await fits(page);
    await page.screenshot({ path: testInfo.outputPath(`desktop-lesson-${theme}.png`), fullPage: true });
  });
}

test("unknown deep links recover without blank pages", async ({ page }) => {
  await page.goto("/#/c/java-programming/learn/not-a-topic");
  await expect(page.getByRole("heading", { name: "Lesson not available" })).toBeVisible();
  await page.getByRole("button", { name: "All topics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your learning path" })).toBeVisible();
  await page.goto("/#/c/java-programming/quiz");
  await expect(page.getByRole("heading", { name: "No practice in progress" })).toBeVisible();
  await page.goto("/#/c/java-programming/unsupported");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
