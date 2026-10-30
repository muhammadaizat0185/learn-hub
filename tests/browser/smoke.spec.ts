import { expect, test } from "@playwright/test";

test("course picker opens a course and practice reveals the explanation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Course hub/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /CompTIA Network\+ Trainer/ })
  ).toHaveAttribute("href", "https://nplus.aizat.my/");

  await page.getByRole("button", { name: /Academic Skills \(Sample\)/ }).click();
  await expect(page).toHaveURL(/#\/c\/sample-course$/);
  await expect(page.getByRole("heading", { name: "Academic Skills (Sample)" })).toBeVisible();

  await page.getByRole("button", { name: /Quick quiz/ }).click();
  await expect(page.getByText(/Question 1 \/ \d+/)).toBeVisible();

  await page.locator(".option").first().click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator(".explanation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next question →" })).toBeVisible();

  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(page.getByRole("heading", { name: "Practice in progress" })).toBeVisible();
});

test("mock exam starts, records an answer, and can be abandoned", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/#/c/sample-course");

  await page.getByRole("navigation", { name: "Course" }).getByRole("button", { name: "Mock exam" }).click();
  await expect(page.getByRole("heading", { name: "Timed mock exam" })).toBeVisible();
  await page.getByRole("button", { name: "Start exam" }).click();

  await expect(page.getByText(/Answered: 0\/8/)).toBeVisible();
  await page.locator(".option").first().click();
  await expect(page.getByText(/Answered: 1\/8/)).toBeVisible();

  await page.getByRole("button", { name: "Abandon" }).click();
  await expect(page.getByRole("heading", { name: "Academic Skills (Sample)" })).toBeVisible();
});

test("library search finds a question and opens its detail", async ({ page }) => {
  await page.goto("/#/c/sample-course");
  await page.getByRole("navigation", { name: "Course" }).getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  await page.getByLabel("Search questions").fill("Pomodoro");
  await expect(page.getByText(/1 match/)).toBeVisible();
  await page.locator(".bank-item").first().click();
  await expect(page.locator(".detail-title")).toContainText("Q6");
  await expect(page.locator(".explanation")).toBeVisible();
});

test("code lab flags wrong syntax, then solves the set", async ({ page }) => {
  await page.goto("/#/c/java-programming");
  await page
    .getByRole("navigation", { name: "Course" })
    .getByRole("button", { name: "Code lab" })
    .click();
  await expect(page.getByRole("heading", { name: "Code lab" })).toBeVisible();

  await page.getByRole("button", { name: /Welcome banner/ }).click();
  await expect(page.getByRole("heading", { name: "Welcome banner" })).toBeVisible();
  await expect(page.locator(".lab-field")).toHaveCount(5);

  await page.locator('select[data-blank="1"]').selectOption("new");
  await page.locator('select[data-blank="2"]').selectOption("int");
  await page.locator('input[data-blank="3"]').fill("readLine(");
  await page.locator('select[data-blank="4"]').selectOption("+");
  await page.locator('input[data-blank="5"]').fill("+");
  await page.getByRole("button", { name: "Check answers" }).click();

  await expect(page.locator(".lab-feedback")).toContainText("token or delimiter issue");
  await expect(page.locator(".lab-field.is-syntax")).toHaveCount(1);

  await page.locator('select[data-blank="2"]').selectOption("String");
  await page.locator('input[data-blank="3"]').fill("nextLine");
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.locator(".lab-feedback.good")).toContainText("Lab complete");

  await page.getByRole("button", { name: "← All labs" }).click();
  await expect(page.getByRole("button", { name: /Welcome banner/ })).toContainText("solved");
});
