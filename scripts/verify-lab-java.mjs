import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const coursesDir = fileURLToPath(new URL("../src/courses/", import.meta.url));
const problems = [];
let compiled = 0;
let totalBlanks = 0;

function assemble(set) {
  const answers = new Map(set.blanks.map((blank) => {
    const value = blank.kind === "select" ? blank.answer : blank.answers[0];
    return [blank.id, value];
  }));
  return set.code.replace(/\{\{(\d+)\}\}/g, (match, raw) => answers.get(Number(raw)) ?? match);
}

function checkStructure(file, set) {
  const at = `${file} · ${set.id ?? "(no id)"}`;
  if (set.blanks.length < 3 || set.blanks.length > 10) {
    problems.push(`${at}: ${set.blanks.length} blanks (must be 3-10)`);
  }
  const markers = [...set.code.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  for (const blank of set.blanks) {
    const uses = markers.filter((id) => id === blank.id).length;
    if (uses !== 1) problems.push(`${at}: blank ${blank.id} used ${uses} times in the code`);
    if (blank.kind === "select" && !blank.options.includes(blank.answer)) {
      problems.push(`${at}: blank ${blank.id} answer "${blank.answer}" is not an option`);
    }
    if (blank.kind === "input" && !blank.answers.length) {
      problems.push(`${at}: blank ${blank.id} has no accepted answers`);
    }
  }
  for (const marker of new Set(markers)) {
    if (!set.blanks.some((blank) => blank.id === marker)) {
      problems.push(`${at}: marker {{${marker}}} has no blank`);
    }
  }
}

let javac = true;
try {
  execFileSync("javac", ["-version"], { stdio: "pipe" });
} catch {
  javac = false;
  console.warn("javac not found - compiling skipped, structure checks still run.");
}

const workRoot = mkdtempSync(join(tmpdir(), "lab-verify-"));
try {
  for (const entry of readdirSync(coursesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(coursesDir, entry.name, "lab.json");
    if (!existsSync(file)) continue;

    const sets = JSON.parse(readFileSync(file, "utf8"));
    const byTopic = new Map();
    for (const set of sets) {
      byTopic.set(set.topic, (byTopic.get(set.topic) ?? 0) + 1);
      checkStructure(`${entry.name}/lab.json`, set);
    }
    for (const [topic, count] of byTopic) {
      if (count < 2 || count > 3) {
        problems.push(`${entry.name}/lab.json · "${topic}": ${count} sets (must be 2-3)`);
      }
    }

    for (const set of sets) {
      totalBlanks += set.blanks.length;
      const source = assemble(set);
      const className = /public\s+class\s+([A-Za-z_$][\w$]*)/.exec(source)?.[1];
      if (!className) {
        problems.push(`${set.id}: no public class to compile`);
        continue;
      }
      if (!javac) continue;

      const dir = mkdtempSync(join(workRoot, "set-"));
      const javaFile = join(dir, `${className}.java`);
      writeFileSync(javaFile, source);
      try {
        execFileSync("javac", ["-Xlint:none", "-d", dir, javaFile], { stdio: "pipe", timeout: 60_000 });
        compiled += 1;
      } catch (error) {
        const detail = (error.stderr?.toString() || error.message || "").trim().split("\n").slice(0, 6).join("\n");
        problems.push(`${set.id}: javac failed\n${detail}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(`Lab check passed: ${compiled} sets compiled, ${totalBlanks} blanks total.`);
