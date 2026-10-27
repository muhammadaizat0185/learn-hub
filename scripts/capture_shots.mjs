import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const outDir = fileURLToPath(new URL("../test-results/shots/", import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CI ? {} : { channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://127.0.0.1:4184/");
await page.waitForSelector(".course-card");
await page.screenshot({ path: `${outDir}01-picker.png`, fullPage: true });

await page.goto("http://127.0.0.1:4184/#/c/sample-course");
await page.getByRole("heading", { name: "Academic Skills (Sample)" }).waitFor();
await page.screenshot({ path: `${outDir}02-course-home.png`, fullPage: true });

await page.getByRole("button", { name: /Quick quiz/ }).click();
await page.locator(".option").first().click();
await page.getByRole("button", { name: "Check answer" }).click();
await page.locator(".explanation").waitFor();
await page.screenshot({ path: `${outDir}03-quiz-explanation.png`, fullPage: true });

await page.getByRole("navigation", { name: "Course" }).getByRole("button", { name: "Mock exam" }).click();
await page.getByRole("button", { name: "Start exam" }).click();
await page.locator(".option").first().click();
await page.screenshot({ path: `${outDir}04-exam.png`, fullPage: true });

await page.goto("http://127.0.0.1:4184/#/c/sample-course");
await page.getByRole("navigation", { name: "Course" }).getByRole("button", { name: "Library" }).click();
await page.locator(".bank-item").first().click();
await page.locator(".explanation").waitFor();
await page.screenshot({ path: `${outDir}05-library-question.png`, fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto("http://127.0.0.1:4184/");
await mobile.waitForSelector(".private-site");
await mobile.screenshot({ path: `${outDir}07-mobile-picker.png`, fullPage: true });
await mobile.goto("http://127.0.0.1:4184/#/c/sample-course");
await mobile.getByRole("heading", { name: "Academic Skills (Sample)" }).waitFor();
await mobile.screenshot({ path: `${outDir}06-mobile-home.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${outDir}`);
