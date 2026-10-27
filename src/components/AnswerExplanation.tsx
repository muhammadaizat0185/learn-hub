import { useCourse } from "../courseContext";
import type { Question } from "../types";

export default function AnswerExplanation({ question }: { question: Question }) {
  const { explanations } = useCourse();
  const explanation = explanations[question.id];

  if (!explanation) {
    return (
      <section className="explanation card" aria-label="Answer explanation">
        <h2>
          Answer explanation <span className="muted">· Q{question.id}</span>
        </h2>
        <p className="muted">No explanation has been added for this question yet.</p>
      </section>
    );
  }

  const correctOptions = question.options.filter((o) => question.answer.includes(o.letter));
  const otherOptions = question.options.filter((o) => !question.answer.includes(o.letter));

  return (
    <section className="explanation card" aria-label="Answer explanation">
      <h2>
        Answer explanation <span className="muted">· Q{question.id}</span>
      </h2>
      {explanation.caveat && (
        <div className="explanation-caveat" role="note">
          <strong>Key caveat</strong>
          <p>{explanation.caveat}</p>
          <p>Grading and highlights follow the course key.</p>
        </div>
      )}
      <p className="explanation-summary">{explanation.summary}</p>
      <h3>
        {correctOptions.length > 1 ? "Why these answers fit" : "Why this answer fits"}
      </h3>
      <ul className="explanation-options">
        {correctOptions.map((option) => (
          <li key={option.letter}>
            <strong>
              {option.letter}. {option.text}
            </strong>
            {explanation.options[option.letter] && <p>{explanation.options[option.letter]}</p>}
          </li>
        ))}
      </ul>
      {otherOptions.length > 0 && (
        <details className="explanation-alternatives" open={!!explanation.caveat}>
          <summary>
            {explanation.caveat ? "Review the other choices" : "Why the other options don't fit"}
          </summary>
          <ul className="explanation-options">
            {otherOptions.map((option) => (
              <li key={option.letter}>
                <strong>
                  {option.letter}. {option.text}
                </strong>
                {explanation.options[option.letter] && (
                  <p>{explanation.options[option.letter]}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="explanation-disclaimer muted">Study notes for this course, not official materials.</p>
    </section>
  );
}
