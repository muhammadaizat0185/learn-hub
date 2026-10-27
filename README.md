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

Course files load lazily in their own bundle when a course is opened. The loader validates ids,
option letters, answer sets, and exam settings, and shows an error page instead of a broken quiz
when a course is invalid. `tests/unit/courses.test.ts` checks the bundled sample course.

The PWA precache covers all built chunks, so every course works offline after first load.

## Progress and privacy

All progress is local to the browser and namespaced per course:

- `hub.v1.course.<id>.progress` — stats, review deck, exam history
- `hub.v1.course.<id>.practice` — resumable practice session
- `hub.v1.course.<id>.exam` — resumable timed exam

The Library → Progress tab can export/import a course-specific JSON backup. There is no account
system and no server-side storage.

## Routing and deployment

The app uses hash routing (`#/` for the picker, `#/c/<id>` for a course), so static hosting needs
no SPA rewrite rules. Planned host: `learn.aizat.my` on Cloudflare Workers with automatic deploys
on push to `main` (same pattern as the trainer). Do not move the CompTIA trainer onto this
hostname — its bundled question bank must stay behind Access.

## Status

Base engine and sample course are local-only as of 2026-10-28. GitHub remote, deployment wiring,
and real course content are next.
