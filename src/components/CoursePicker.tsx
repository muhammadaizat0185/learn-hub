import type { CourseMeta } from "../types";

export default function CoursePicker({
  courses,
  onOpen,
}: {
  courses: CourseMeta[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="picker">
      <header className="topbar picker-top">
        <span className="brand">
          Learn<span>.</span>
        </span>
        <span className="muted picker-domain">learn.aizat.my</span>
      </header>

      <div className="hero card picker-hero">
        <h1>
          Course <span>hub</span>
        </h1>
        <p className="muted">
          Practice questions with instant feedback, master the ones you miss, and sit timed mock
          exams. Everything is public and progress stays in this browser.
        </p>
      </div>

      <h2 className="section-title">Courses</h2>
      {courses.length === 0 ? (
        <div className="card">
          <p className="empty">
            No courses found. Add a folder under <code>src/courses/</code> with a
            <code> course.json</code> and <code>questions.json</code>, then rebuild.
          </p>
        </div>
      ) : (
        <div className="course-list">
          {courses.map((course) => (
            <button className="mode card course-card" key={course.id} onClick={() => onOpen(course.id)}>
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
          ))}
        </div>
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
          N10-009 practice bank, simulations, and timed mock exams. Opens nplus.aizat.my behind
          Cloudflare Access.
        </p>
      </a>

      <p className="muted picker-foot">
        Hub courses are public and need no login. Progress, review decks, and exam history are
        stored locally on each device.
      </p>
    </div>
  );
}
