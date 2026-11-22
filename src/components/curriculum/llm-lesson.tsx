import type { LessonContent } from '@/content/curriculum/schema';
import { referenceAnswer, type LlmExercise } from '@/lib/llm/lesson';
import { EmbeddingSpaceView, LlmExerciseBox, SamplingExplorerView, TokenExplorerView } from './llm-explorer';
import { Rich } from './rich';
import styles from './curriculum.module.css';

/*
 * LLM-0: the llm-explorer capability's part of a lesson page, for both bodies (an llm-explorer lesson's activity body
 * and a python-code lesson's program body): the explorers by id, for the sections that show them, and the exercises.
 */

export function llmExamples(content: LessonContent): [string, React.ReactNode][] {
  const llm = content.llm;
  if (!llm) return [];
  return [
    ...(llm.tokenizers ?? []).map(x => [x.id, <TokenExplorerView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(llm.samplers ?? []).map(x => [x.id, <SamplingExplorerView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
    ...(llm.embeddings ?? []).map(x => [x.id, <EmbeddingSpaceView key={x.id} explorer={x}/>] as [string, React.ReactNode]),
  ];
}

/** What the exercise checks by value, said once above the exercises. */
export const LLM_EXERCISE_NOTICE = '探索練習的答案由課內的示意資料算出（斷詞、機率、相似度），再和你的答案比對：數字容許題目說明的誤差，清單比對每一項。課程不呼叫任何真實模型或 API。';

export function LlmExerciseView({ exercise }: { exercise: LlmExercise }) {
  const reference = referenceAnswer(exercise);
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <LlmExerciseBox exercise={exercise}/>
    <details className={styles.details}><summary>提示（{exercise.hints.length}）</summary><ul>{exercise.hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考解答</summary>
      {exercise.kind === 'choice' ? <p>答案：<Rich text={exercise.options[exercise.answer]}/></p>
        : <ul>{(exercise.kind === 'table' ? exercise.blanks : [exercise.blank]).map(b => <li key={b.id}><Rich text={b.label}/>：<code>{reference[exercise.kind === 'table' ? b.id : 'value']}</code></li>)}</ul>}
      <p><Rich text={exercise.explanation}/></p>
    </details>
  </article>;
}
