# Learn — Course Hub

The public university course hub for **learn.aizat.my**: practice questions with instant
feedback, a review deck for missed questions, timed mock exams, and a searchable question bank.
Progress is stored per course in the browser.

This is a separate repository from the private Network+ trainer (now at `nplus.aizat.my` behind
Cloudflare Access). Course material here is public; CompTIA question-bank content must never be
copied into this repo.

## Stack

React 18 + TypeScript + Vite 6, `vite-plugin-pwa` for offline installs, Vitest for unit tests,
Playwright for browser smoke tests. No backend.

## Run

```bash
npm install
npm run dev          # local dev server
npm run build        # typecheck + production build -> dist/
npm run preview      # preview the production build
npm test             # unit tests (Vitest, jsdom)
npm run test:browser # Playwright smoke tests (local Chrome)
npm run brand        # regenerate favicon, PWA icons, and og-image
```

## Add a course

Create `src/courses/<folder>/` with three files:

1. **`course.json`** — metadata and exam settings:

   ```json
   {
     "id": "course-id",
     "title": "Course title",
     "shortTitle": "Short label",
     "description": "One or two sentences shown on the course picker.",
     "exam": { "questions": 40, "minutes": 60, "passPercent": 50 }
   }
   ```

2. **`questions.json`** — an array of questions:

   ```json
   {
     "id": 1,
     "topic": "Topic name",
     "type": "mcq",
     "question": "Question text. Use \"\\n· item\" lines for requirement lists.",
     "options": [
       { "letter": "A", "text": "First option" },
       { "letter": "B", "text": "Second option" }
     ],
     "answer": ["B"]
   }
   ```

   `type` is `mcq` (exactly one answer) or `multi` (two or more answers). Ids must be unique
   positive integers. Answers must reference existing option letters. Topics group the home-page
   practice list and the library filter.

3. **`explanations.json`** (optional but recommended) — keyed by question id:

   ```json
   {
     "1": {
       "summary": "Why the key is right.",
       "options": { "A": "Why A is wrong.", "B": "Why B is right." },
       "caveat": "Optional note when the source key is disputed."
     }
   }
   ```

4. **`lab.json`** (optional) — coding simulations for the Code lab, as an array of sets:

   ```json
   [
     {
       "id": "basics-1",
       "topic": "Java basics",
       "title": "Welcome banner",
       "brief": "What the finished program does.",
       "hint": "One nudge, shown only when asked for.",
       "code": "int total = {{1}};\nSystem.out.println(total{{2}});",
       "blanks": [
         { "id": 1, "kind": "input", "answers": ["0"], "placeholder": "start" },
         { "id": 2, "kind": "select", "options": [";", ",", "."], "answer": ";" }
       ]
     }
   ]
   ```

   Every `{{n}}` in `code` must match exactly one blank, and each set holds 3-10 blanks. A
   `select` blank is a dropdown whose `answer` must be one of its `options`. An `input` blank
   compares the typed tokens against every entry in `answers`; `answers[0]` is what "Show
   solution" fills in. Sets are grouped by `topic` in first-seen order.

Both `course.json` and each lesson in `lessons.json` may carry a `resources` array of
`{ "label", "url", "note?" }` study links. Course resources appear under **Watch and explore** on the
course home, lesson resources under **Watch this topic** on the lesson page. Only an https URL with a
non-empty label is kept; anything else is dropped at load time instead of rendered, so a hand-edited
file cannot point an anchor at `javascript:` or a local file. Use `note` for the caveat the learner
needs before clicking, for example "Google sign-in needed".

Course files load lazily in their own bundle when a course is opened. The loader validates ids,
option letters, answer sets, and exam settings, and shows an error page instead of a broken quiz
when a course is invalid. `tests/unit/courses.test.ts` checks the bundled sample course.

The PWA precache covers all built chunks, so every course works offline after first load.

## Code lab

A simulation is a real Java class (or method) with gaps. Dropdown gaps ask you to pick the right
token; typed gaps are tokenised, so `i=i+1` is accepted for `i = i + 1` while `i+1` is not.
Unbalanced brackets, unterminated strings, and stray characters are reported as syntax errors
rather than a plain wrong answer. Enter jumps to the next gap, Ctrl+Enter checks the set, and a
set only counts as solved when every gap is correct without using "Show answer".

`npm run verify:lab` re-assembles every set from its canonical answers and enforces 2-3 sets per
topic and 3-10 blanks per set. Courses whose sets really assemble into Java opt in with
`"lab": { "compile": "javac" }` in `course.json`; only those are handed to `javac`, so a logic or
discrete-math lab gets the structure checks without the compiler. Run the script after editing any
`lab.json`; a Java simulation cannot ship as invalid Java.

A subject that has nothing to compile labels the tab and writes its own intro line in the same
block:

```json
"lab": { "label": "Logic lab", "note": "How the gaps work for this subject." }
```

`labLabel()` and `labNote()` fall back to the Java wording, so the navigation tab, the heading, the
runner text and the lesson page's exercise links stay honest per subject. Typed gaps still pass through the Java tokeniser, which
rejects `∀ ∃ ¬ ∧ ∨`: keep those symbols in `select` options or in the `code` text, and leave the
typed answers as ASCII (`T`, `F`, `k + 1`, `n = 1`, `k(k + 1) / 2`).

## Progress and privacy

All progress is local to the browser and namespaced per course:

- `hub.v1.course.<id>.progress` — stats, review deck, exam history
- `hub.v1.course.<id>.practice` — resumable practice session
- `hub.v1.course.<id>.exam` — resumable timed exam
- `hub.v1.lab.<id>` — solved coding simulations and check counts

The Library → Progress tab can export/import a course-specific JSON backup. There is no account
system and no server-side storage. (Code lab results are not part of the backup file yet.)

## Routing and deployment

The app uses hash routing (`#/` for the picker, `#/c/<id>` for a course), so static hosting needs
no SPA rewrite rules. Planned host: `learn.aizat.my` on Cloudflare Workers with automatic deploys
on push to `main` (same pattern as the trainer). Do not move the CompTIA trainer onto this
hostname — its bundled question bank must stay behind Access.

## Status

Live at `learn.aizat.my`. The Java Programming course has 41 practice questions and 17 code-lab
simulations across eight topics. Discrete Structure (BIT11003/BIC10103) is in progress: a 40-question
bank and one lesson per topic across four units — propositions and logic, CNF and DNF, predicates and
quantifiers, and mathematical induction — plus a Logic lab of eight gap-filling sets, two per unit,
all built from the tutorial sheets and lecture slides. Decision Support System (BIT30303) covers all
nine chapters: a 71-question bank with a 40-question timed exam, one lesson per topic across nine
topics — from DSS fundamentals and Power's five types through decision modelling, design and
implementation — and a Decision lab of 19 gap-filling sets. Each lesson links the chapter's
NotebookLM video, and the course home links the full playlist plus the source notebook. Its lecture
slides and scanned finals live in a `DSS/` folder beside this repo, so they are never committed.
The sample course stays as a template for new courses.
