// The minimized quiz: a box above the sidebar footer while a quiz is in progress (or its
// results are waiting) but you're back in your notes. Click to go back; ✕ stops it (after
// asking) or closes finished results.
import { useQuiz, active, showQuiz, confirmStop, closeQuiz, pillName } from '../quiz';
import { SCORE } from '../lib/quiz-logic';
import { Icon } from './Icon';

export function QuizPill() {
  const shown = useQuiz((s) => s.shown);
  const view = useQuiz((s) => s.view);
  const run = useQuiz((s) => s.run);
  const scope = useQuiz((s) => s.scope);
  const running = active();
  const finished = view === 'results';
  const on = Boolean(run && scope && !shown && (running || finished));
  if (!on || !run || !scope) return <div id="quiz-pill" hidden />;

  const score = run.answers.reduce((s, a) => s + SCORE[a.r], 0);
  return (
    <div id="quiz-pill" aria-label={running ? 'Quiz in progress' : 'Quiz results'}>
      <button type="button" className="pill-main" data-pill="resume" title={`${running ? 'Back to the quiz' : 'Back to the results'} (Ctrl+Shift+Q)`} onClick={showQuiz}>
        <Icon name="quiz" className="pill-icon" />
        <span className="pill-text">
          <b>
            {running ? 'Quiz in progress ' : 'Quiz finished '}
            <em>{running ? `${run.index + 1}/${run.questions.length}` : `${score % 1 ? score.toFixed(1) : score}/${run.answers.length}`}</em>
          </b>
          <span>{pillName(scope.current)}</span>
        </span>
        <span className="pill-go">{running ? 'Resume' : 'Results'}</span>
      </button>
      <button type="button" className="icon-btn pill-stop" data-pill="stop" title={running ? 'Stop the quiz' : 'Close the results'}
        aria-label={running ? 'Stop the quiz' : 'Close the results'} onClick={() => (running ? void confirmStop() : closeQuiz())}>
        <Icon name="close" className="" />
      </button>
    </div>
  );
}
