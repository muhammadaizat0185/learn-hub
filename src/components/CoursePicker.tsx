import type { CourseMeta } from "../types";

export default function CoursePicker({
  courses,
  onOpen,
  onSettings,
}: {
  courses: CourseMeta[];
  onOpen: (id: string) => void;
  onSettings?: () => void;
}) {
  const availableCourses = courses.filter((course) => !course.sample);
  const samples = courses.filter((course) => course.sample);

  function courseCard(course: CourseMeta) {
    return (
      <button
        type="button"
        className="mode card course-card"
        key={course.id}
        onClick={() => onOpen(course.id)}
      >
        <span className="course-card-head">
          <h2>{course.title}</h2>
          <span className="pill">Open →</span>
        </span>
        <p>{course.description}</p>
        <span className="course-meta muted">
          {course.exam.questions}-question mock · {course.exam.minutes} min · pass{" "}
          {course.exam.passPercent}%
        </span>
      </button>
    );
  }

  return (
    <div className="picker">
      <header className="topbar picker-top">
        <span className="brand">
          Learn<span>.</span>
        </span>
        <div className="picker-tools">
          <span className="muted picker-domain">learn.aizat.my</span>
          {onSettings && (
            <button type="button" className="btn ghost" onClick={onSettings}>
              Display preferences
            </button>
          )}
        </div>
      </header>

      <div className="hero card picker-hero">
        <h1>
          Course <span>hub</span>
        </h1>
        <p className="muted">
          Practice questions with instant feedback, review the ones you miss, and try timed mock
          exams. Hub courses are public and progress stays in this browser.
        </p>
      </div>

      <section aria-labelledby="picker-courses-title">
        <h2 id="picker-courses-title" className="section-title">Courses</h2>
        {availableCourses.length === 0 ? (
          <div className="card">
            <p className="empty">
              {samples.length > 0
                ? "Try a sample below to explore how practice works."
                : "No courses are available right now. Please check back soon."}
            </p>
          </div>
        ) : (
          <div className="course-list">{availableCourses.map(courseCard)}</div>
        )}
      </section>

      {samples.length > 0 && (
        <section className="picker-samples" aria-labelledby="picker-samples-title">
          <h2 id="picker-samples-title" className="section-title">Try a sample</h2>
          <p className="muted">Explore the practice tools with a short sample course.</p>
          <div className="course-list">{samples.map(courseCard)}</div>
        </section>
      )}

      <h2 className="section-title">Private</h2>
      <a
        className="mode card course-card private-site"
        href="https://nplus.aizat.my/"
        target="_blank"
        rel="noopener"
      >
        <span className="course-card-head">
          <h2>CompTIA Network+ Trainer</h2>
          <span className="pill">Sign-in required</span>
        </span>
        <p>
          N10-009 practice bank, simulations, and timed mock exams. Opens nplus.aizat.my in a new
          tab. This separate, private site requires sign-in.
        </p>
      </a>

      <p className="muted picker-foot">
        Hub courses are public and need no login. Progress, review decks, and exam history are
        stored locally on each device.
      </p>
    </div>
  );
}
