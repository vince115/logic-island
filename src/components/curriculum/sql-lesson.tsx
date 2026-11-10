import { sqlCheckSpec, type SqlExample, type SqlExercise } from '@/content/curriculum/schema';
import { Highlighted } from '@/components/highlighted';
import { highlight } from '@/lib/highlight/server';
import { DATASETS } from '@/lib/sql/datasets';
import { Rich } from './rich';
import { SqlChecker } from './sql-lazy';
import { DatasetSchema, SqlResultTable } from './sql-table';
import styles from './curriculum.module.css';
import sqlStyles from './sql.module.css';

/*
 * Phase F.1a: SQL examples with their results and SQL exercises checked in the browser, as parts of a database lesson
 * (database-lesson.tsx).
 */

/** SQL, highlighted on the server like the programs (colours only). */
export function SqlCode({ sql, label }: { sql: string; label: string }) {
  const pieces = highlight(sql, 'SQL');
  return <pre className={sqlStyles.code} aria-label={label}><code>{sql.split('\n').map((line, i) =>
    <span key={i}>{i > 0 && '\n'}<Highlighted text={line} pieces={pieces[i]}/></span>)}</code></pre>;
}

export function SqlExampleView({ example }: { example: SqlExample }) {
  return <div className={sqlStyles.example}>
    <h3>{example.title}</h3>
    <p className={styles.muted}><Rich text={example.description}/></p>
    <SqlCode sql={example.sql} label={`${example.title} 的 SQL`}/>
    <SqlResultTable table={example.result} caption={`執行結果（${DATASETS[example.dataset].title}）`}/>
  </div>;
}

export function SqlExerciseView({ exercise }: { exercise: SqlExercise }) {
  const spec = sqlCheckSpec(exercise);
  const probes = exercise.probes?.filter(p => !p.hidden) ?? [], hiddenProbes = (exercise.probes?.length ?? 0) - probes.length;
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <DatasetSchema dataset={exercise.dataset}/>
    {exercise.paramSets && <p className={styles.muted}>檢查時，你的 SQL 會以參數化查詢執行（值綁定到 ?，不拼進文字），依序代入：{exercise.paramSets.filter(p => !p.hidden).map(p => `「${p.label}」`).join('、')}{exercise.paramSets.some(p => p.hidden) ? '，另有隱藏的參數' : ''}。</p>}
    {exercise.atomic && <p className={styles.muted}>另外會做當機測試：模擬在你的每個敘述之後當機（尚未提交的交易被撤銷），資料不能停在參考解答不會出現的狀態。</p>}
    {probes.length > 0 && <details className={styles.details}>
      <summary>檢查方式：執行你的 SQL 之後，依序執行 {probes.length} 個檢查敘述{hiddenProbes ? `（隱藏測試另有 ${hiddenProbes} 個）` : ''}</summary>
      <p className={styles.muted}>參考解答也做一樣的事，兩邊每個檢查敘述的結果（查詢結果、被接受或被拒絕）都要相同。</p>
      <ol>{probes.map(p => <li key={p.label}><Rich text={p.label}/><SqlCode sql={p.sql} label={`檢查：${p.label}`}/></li>)}</ol>
    </details>}
    <SqlChecker id={exercise.id} dataset={exercise.dataset} spec={spec} starter={exercise.starter}/>
    <details className={styles.details}><summary>提示（{exercise.hints.length}）</summary><ul>{exercise.hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary>
      {exercise.mistakes.map((m, i) => <div key={i}><SqlCode sql={m.sql} label={`常見錯誤 ${i + 1}`}/><p className={styles.muted}><Rich text={m.why}/></p></div>)}
    </details>
    <details className={styles.details}><summary>參考解答</summary>
      <SqlCode sql={exercise.solution} label={`${exercise.title} 參考解答`}/>
      {exercise.alternatives.length > 0 && <>
        <p className={styles.muted}>其他同樣正確的寫法（結果相同就會通過）：</p>
        {exercise.alternatives.map((a, i) => <SqlCode key={i} sql={a} label={`另一種寫法 ${i + 1}`}/>)}
      </>}
    </details>
  </article>;
}
