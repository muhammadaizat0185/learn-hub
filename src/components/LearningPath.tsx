import { useState } from "react";
import { useCourse } from "../courseContext";
import { load } from "../lib/storage";
import { topicMetrics } from "../lib/study";
import { loadLabProgress } from "../lib/lab";

export default function LearningPath({ lessonId, onSelect, onPractice, onLab, onReview }: {
  lessonId?: string; onSelect: (id?: string) => void; onPractice: (topic: string, count: number) => void; onLab: (id: string) => void; onReview: () => void;
}) {
  const { meta, topics, lessons = [], lab } = useCourse();
  const [count, setCount] = useState(5);
  const state = load(meta.id);
  const labProgress = loadLabProgress(meta.id);
  const lesson = lessons.find((item) => item.id === lessonId);
  function jumpTo(id: string) {
    const section = document.getElementById(id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ behavior: "instant" });
  }
  if (lessonId && !lesson) return <div className="card"><h1>Lesson not available</h1><p>Choose a topic from this course's learning path.</p><button className="btn primary" onClick={() => onSelect()}>All topics</button></div>;
  if (!lesson) return <div className="learning-path"><h1>Your learning path</h1><p className="muted">Start with a concept, study a worked example, practise, then return for a later recall check. You can choose any topic.</p>
    <ol className="path-list">{(lessons.length ? lessons.map((item) => ({ topic: item.topic, lesson: item })) : topics.map((topic) => ({ topic: topic.name, lesson: undefined }))).map((item, index) => {
      const topic = topics.find((group) => group.name === item.topic)!;
      const progress = topicMetrics(topic.ids, state);
      return <li className="card path-card" key={item.topic}><span className="path-number" aria-hidden="true">{index + 1}</span><div><h2>{item.lesson?.title ?? item.topic}</h2><p className="muted">{item.lesson ? `${item.lesson.minutes} min reading · ` : ""}{topic.ids.length} practice questions{item.lesson?.labIds.length ? ` · ${item.lesson.labIds.length} coding exercises` : ""}</p><p className="muted">{progress.covered}/{progress.total} covered · {progress.due} reviews due</p><button className="btn primary" onClick={() => item.lesson ? onSelect(item.lesson.id) : onPractice(topic.name, 5)}>{item.lesson ? "Open topic" : "Practise topic"}</button></div></li>;
    })}</ol></div>;
  const topic = topics.find((item) => item.name === lesson.topic)!;
  const progress = topicMetrics(topic.ids, state);
  return <article className="lesson">
    <button className="btn ghost" onClick={() => onSelect()}>← All topics</button>
    <p className="eyebrow">{lesson.topic} · about {lesson.minutes} minutes</p><h1>{lesson.title}</h1>
    <nav className="lesson-steps" aria-label="Learning steps"><button onClick={() => jumpTo("lesson-concept")}>1. Understand</button><button onClick={() => jumpTo("lesson-example")}>2. See an example</button><button onClick={() => jumpTo("lesson-practice")}>3. Practise & apply</button></nav>
    <section className="card lesson-reading" id="lesson-concept" tabIndex={-1}><h2>Understand the concept</h2><ul>{lesson.concepts.map((concept) => <li key={concept}>{concept}</li>)}</ul></section>
    <section className="card lesson-reading" id="lesson-example" tabIndex={-1}><p className="eyebrow">Worked example</p><h2>{lesson.example.title}</h2>{lesson.example.code && <pre className="lesson-code" tabIndex={0} aria-label="Worked example code"><code>{lesson.example.code}</code></pre>}<p>{lesson.example.explanation}</p>{lesson.example.steps && <ol>{lesson.example.steps.map((step) => <li key={step}>{step}</li>)}</ol>}{lesson.example.output && <><h3>Expected output</h3><pre className="lesson-code" tabIndex={0}><code>{lesson.example.output}</code></pre><p className="muted">Shown as part of this worked example; code is not executed in your browser.</p></>}</section>
    <section className="card" id="lesson-practice" tabIndex={-1}><h2>Put it into practice</h2><p className="muted">{progress.covered}/{topic.ids.length} questions covered. Start small and check the explanation after each answer.</p><div className="session-controls"><label htmlFor="lesson-count">Practice length</label><select id="lesson-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[5, 10, 20].map((size) => <option value={size} key={size}>Up to {size} questions</option>)}</select><button className="btn primary" onClick={() => onPractice(lesson.topic, count)}>Practise this topic</button></div>
      {lesson.labIds.length > 0 && <><h3>Apply it in a coding exercise</h3><div className="related-labs">{lesson.labIds.map((id) => {
        const set = lab?.setById.get(id);
        return set ? <button className="btn ghost" key={id} onClick={() => onLab(id)}>{set.title}{labProgress.sets[id]?.solved ? " · solved before" : ""}</button> : null;
      })}</div></>}
    </section>
    <section className="card"><h2>Return to it later</h2><p className="muted">Correct answers are scheduled for another check after a delay. Repeating an answer immediately does not prove you will remember it tomorrow.</p><button className="btn ghost" onClick={onReview}>See review schedule{progress.due ? ` (${progress.due} due in this topic)` : ""}</button></section>
  </article>;
}
