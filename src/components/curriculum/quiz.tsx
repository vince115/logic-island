'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { QuizQuestion } from '@/content/curriculum/schema';
import { PASS_RATIO, recordQuiz } from '@/lib/progress';
import { Snippet } from './code';
import type { HlLines } from '@/lib/highlight/kinds';
import { Rich } from './rich';
import { useProgress } from './use-progress';
import styles from './curriculum.module.css';

/**
 * The lesson's concept quiz, graded in the browser: answer every question, submit, then each question shows whether
 * it was right, the right answer and why. The best score counts towards completing the lesson.
 */
export function Quiz({ lessonId, questions, tokens }: { lessonId: string; questions: QuizQuestion[]; tokens?: Record<string, HlLines> }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [missing, setMissing] = useState(false);
  const { update } = useProgress();
  const correct = questions.filter(q => answers[q.id] === q.answer).length;
  const needed = Math.ceil(questions.length * PASS_RATIO);
  const submit = () => {
    if (questions.some(q => answers[q.id] === undefined)) { setMissing(true); return; }
    setMissing(false);
    setSubmitted(true);
    update(p => recordQuiz(p, lessonId, correct, questions.length, new Date().toISOString()));
  };
  const retry = () => { setAnswers({}); setSubmitted(false); };
  return <form className={styles.quiz} onSubmit={e => { e.preventDefault(); submit(); }} aria-describedby="quiz-rule">
    <p id="quiz-rule" className={styles.muted}>共 {questions.length} 題，答對 {needed} 題以上即通過。可以重新作答，進度記錄最佳成績。</p>
    {questions.map((q, n) => {
      const chosen = answers[q.id];
      const right = submitted && chosen === q.answer;
      return <fieldset key={q.id} className={styles.question} data-result={submitted ? (right ? 'right' : 'wrong') : undefined}>
        <legend><span className={styles.questionNo}>第 {n + 1} 題</span> <Rich text={q.prompt}/></legend>
        {q.code && <Snippet language={q.code.language} text={q.code.text} tokens={tokens?.[q.id]}/>}
        <div className={styles.options}>
          {q.options.map((option, i) => <label key={i} className={styles.option} data-correct={submitted && i === q.answer ? 'true' : undefined}>
            <input type="radio" name={`${lessonId}-${q.id}`} value={i} checked={chosen === i} disabled={submitted}
              onChange={() => setAnswers(a => ({ ...a, [q.id]: i }))}/>
            <span><Rich text={option}/></span>
          </label>)}
        </div>
        {submitted && <div className={styles.feedback} data-result={right ? 'right' : 'wrong'}>
          <p className={styles.verdict}>{right ? <CheckCircle2 size={16} aria-hidden/> : <XCircle size={16} aria-hidden/>}{right ? '答對了' : `答錯了，正確答案是：${q.options[q.answer]}`}</p>
          <p><Rich text={q.explanation}/></p>
        </div>}
      </fieldset>;
    })}
    <div className={styles.quizActions}>
      {submitted
        ? <button type="button" className={styles.secondaryButton} onClick={retry}>重新作答</button>
        : <button type="submit" className={styles.primaryButton}>提交答案</button>}
      <p role="status" className={styles.quizStatus}>
        {missing ? '還有題目沒有作答。' : submitted ? `答對 ${correct}／${questions.length} 題，${correct >= needed ? '通過！' : `還差 ${needed - correct} 題才通過。`}` : ''}
      </p>
    </div>
  </form>;
}
