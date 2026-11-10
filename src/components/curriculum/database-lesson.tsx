import { islands, lessons } from '@/content/curriculum';
import { hasCapability, type DriverExample, type ErDiagramExample, type LessonCode, type ErExercise, type LessonContent, type LessonMeta, type NfExercise, type OpsExercise, type TxExercise } from '@/content/curriculum/schema';
import { highlightAll } from '@/lib/highlight/server';
import { buildModel } from '@/lib/er/model';
import { analyzeDecomposition, showSet } from '@/lib/normalization/fd';
import { highlight } from '@/lib/highlight/server';
import { BackupPlanner, BPlusExplorer, ErBuilder, NfExerciseBox, NfExplorer, OpsExerciseBox, ReplicationExplorer, ScheduleExplorer, SequenceExplorer, TimelineExplorer, TxExerciseBox } from './db-lazy';
import { CodeTabs, LessonLanguages } from './code';
import { ChallengeStages, DsComparison } from './visualizations';
import { ErDiagram, ErLegend } from './er-diagram';
import { DecompositionSummary, NfStepsView, PartAnalysis, RelationHeader } from './normalization-view';
import { LessonCompletion } from './progress';
import { Quiz } from './quiz';
import { Rich } from './rich';
import { SqlPlayground } from './sql-lazy';
import { SqlExampleView, SqlExerciseView } from './sql-lesson';
import styles from './curriculum.module.css';

/*
 * The body of a database-island lesson (Phase F.1a, generalized in F.1b). Same sections, quiz and completion as every
 * lesson; instead of program tabs it has what the lesson's content holds: SQL examples, the SQL playground and SQL
 * exercises; ER diagrams and ER modeling exercises (erd-builder); normalization steps, the normalization workbench and
 * its exercises (normalization-steps). Everything runs in the browser. Sections are drawn by the caller's
 * `renderSection`, which receives this lesson's examples by id.
 */

export function databaseExamples(content: LessonContent): Map<string, React.ReactNode> {
  return new Map<string, React.ReactNode>([
    ...(content.sql?.examples ?? []).map(e => [e.id, <SqlExampleView key={e.id} example={e}/>] as const),
    ...(content.er?.diagrams ?? []).map(d => [d.id, <ErDiagramView key={d.id} diagram={d}/>] as const),
    ...(content.normalization?.examples ?? []).map(e => [e.id, <NfStepsView key={e.id} example={e}/>] as const),
    ...(content.queryPlan?.trees ?? []).map(e => [e.id, <BPlusExplorer key={e.id} example={e}/>] as const),
    ...(content.transactions?.timelines ?? []).map(e => [e.id, <TimelineExplorer key={e.id} example={e}/>] as const),
    ...(content.transactions?.schedules ?? []).map(e => [e.id, <ScheduleExplorer key={e.id} example={e}/>] as const),
    ...(content.driverCode?.examples ?? []).map(e => [e.id, <DriverExampleView key={e.id} example={e}/>] as const),
    ...(content.sequences ?? []).map(e => [e.id, <SequenceExplorer key={e.id} example={e}/>] as const),
    ...(content.ops?.replication ?? []).map(e => [e.id, <ReplicationExplorer key={e.id} example={e}/>] as const),
    ...(content.ops?.backups ?? []).map(e => [e.id, <BackupPlanner key={e.id} example={e}/>] as const),
  ]);
}

/**
 * F.1d: application code with a database driver, in the languages it is written in. Python and JavaScript are run by the
 * tests (tests/curriculum-driver.test.ts); Java is only compiled there (it needs a SQLite JDBC driver to run).
 */
function DriverExampleView({ example }: { example: DriverExample }) {
  const languages = (['Python', 'JavaScript', 'Java'] as const).filter(l => example.code[l]);
  return <div className={styles.example}>
    <h3>{example.title}</h3>
    <p className={styles.muted}><Rich text={example.description}/></p>
    <LessonLanguages languages={languages}>
      {/* The printed output is shown for the languages the tests run (Python, JavaScript), not for Java, which is only compiled. */}
      <CodeTabs code={example.code as LessonCode} tokens={highlightAll(example.code as LessonCode)} label={example.title}
        output={Object.fromEntries(languages.filter(l => l !== 'Java').map(l => [l, example.output]))}/>
    </LessonLanguages>
    {example.code.Java && <p className={styles.muted}>Java 版本只在自動檢查中編譯（使用 JDK 內建的 JDBC API）；要執行它，還需要 SQLite 的 JDBC 驅動程式。</p>}
  </div>;
}

function ErDiagramView({ diagram }: { diagram: ErDiagramExample }) {
  return <div className={styles.example}>
    <h3>{diagram.title}</h3>
    <p className={styles.muted}><Rich text={diagram.description}/></p>
    <ErDiagram model={diagram.model} title={diagram.title} at={diagram.at}/>
    <ErLegend/>
  </div>;
}

function Hints({ hints }: { hints: string[] }) {
  return <details className={styles.details}><summary>提示（{hints.length}）</summary><ul>{hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>;
}

function ErExerciseView({ exercise }: { exercise: ErExercise }) {
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <p className={styles.muted}>替每個詞語選一個角色：實體、屬性（屬於哪個實體或關係，是否為鍵、是否多值）、關係（連接哪兩個實體、兩端各對應幾個），或不需要建模。下方的 ER 圖會隨你的選擇即時畫出。</p>
    <ErBuilder exercise={{ id: exercise.id, terms: exercise.terms, answer: exercise.answer, accept: exercise.accept, termHints: exercise.termHints }}/>
    <ErLegend/>
    <Hints hints={exercise.hints}/>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考答案</summary>
      <ErDiagram model={buildModel(exercise.terms, exercise.answer)} title={`${exercise.title}：參考 ER 圖`} at={exercise.at}/>
      <p><Rich text={exercise.explanation}/></p>
    </details>
  </article>;
}

function NfExerciseView({ exercise }: { exercise: NfExercise }) {
  const { relation } = exercise;
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <RelationHeader relation={relation}/>
    <NfExerciseBox exercise={exercise}/>
    <Hints hints={exercise.hints}/>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考解答</summary>
      {exercise.task === 'keys' ? <p>候選鍵：{exercise.solution.map(showSet).join('、')}</p> : (() => {
        const analysis = analyzeDecomposition(relation.attributes, exercise.solution.map(p => p.attributes), relation.fds);
        return <>
          {exercise.solution.map((p, i) => <PartAnalysis key={p.name} name={p.name} part={analysis.parts[i]}/>)}
          <DecompositionSummary analysis={analysis}/>
          {exercise.alternatives.length > 0 && <p className={styles.muted}>其他同樣正確的分解：{exercise.alternatives.map(alt => alt.map(p => `${p.name}(${p.attributes.join(', ')})`).join('、')).join('；')}</p>}
        </>;
      })()}
      <p><Rich text={exercise.explanation}/></p>
    </details>
  </article>;
}

function TxExerciseView({ exercise }: { exercise: TxExercise }) {
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <TxExerciseBox exercise={exercise}/>
    <Hints hints={exercise.hints}/>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考解答</summary><p><Rich text={exercise.explanation}/></p></details>
  </article>;
}

function OpsExerciseView({ exercise }: { exercise: OpsExercise }) {
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <OpsExerciseBox exercise={exercise}/>
    <Hints hints={exercise.hints}/>
    <details className={styles.details}><summary>常見錯誤（{exercise.mistakes.length}）</summary><ul>{exercise.mistakes.map(m => <li key={m.why}><Rich text={m.why}/></li>)}</ul></details>
    <details className={styles.details}><summary>參考解答</summary><p><Rich text={exercise.explanation}/></p></details>
  </article>;
}

export function DatabaseLessonBody({ lesson, content, renderSection }: {
  lesson: LessonMeta; content: LessonContent; renderSection: (section: LessonContent['sections'][number]) => React.ReactNode;
}) {
  const island = islands.find(i => i.id === lesson.islandId)!;
  // Each part is shown for a declared capability (the validator guarantees its content is there).
  const sql = hasCapability(lesson, 'sql') ? content.sql : undefined;
  const er = hasCapability(lesson, 'er-diagram') ? content.er : undefined;
  const normalization = hasCapability(lesson, 'normalization') ? content.normalization : undefined;
  const transactions = hasCapability(lesson, 'transaction-timeline') ? content.transactions : undefined;
  const ops = hasCapability(lesson, 'architecture-diagram') ? content.ops : undefined;
  const viz = hasCapability(lesson, 'visualization') ? content.visualization : undefined;
  const onlySql = !er?.exercises.length && !normalization?.exercises.length && !transactions?.exercises.length && !ops?.exercises.length;
  return <>
    <nav className={styles.toc} aria-label="本課內容">
      <ol>{content.sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
        {viz && <li><a href="#visualization">互動視覺化</a></li>}{sql && <li><a href="#playground">SQL 練習場</a></li>}{normalization && <li><a href="#workbench">正規化工作台</a></li>}
        <li><a href="#quiz">觀念測驗</a></li><li><a href="#exercises">{onlySql ? 'SQL 練習' : '練習'}</a></li></ol>
    </nav>
    {content.sections.map(renderSection)}
    {viz && <section id="visualization" className={styles.block} aria-labelledby="visualization-heading">
      <h2 id="visualization-heading">互動視覺化：{viz.title}</h2>
      {viz.kind === 'ds-comparison' ? <DsComparison config={viz}/>
        : viz.kind === 'challenge-stages' ? <ChallengeStages config={viz} titles={Object.fromEntries(lessons.map(l => [l.lessonId, l.title]))}/> : null}
    </section>}
    {sql && <section id="playground" className={styles.block} aria-labelledby="playground-heading">
      <h2 id="playground-heading">SQL 練習場</h2>
      <p className={styles.muted}>在這個瀏覽器裡執行 SQLite（WebAssembly）：資料只存在這個頁面，不連線、不上傳；修改資料後可以隨時「重設資料」。</p>
      <SqlPlayground dataset={sql.dataset} presets={sql.presets} params={sql.params}/>
    </section>}
    {normalization && <section id="workbench" className={styles.block} aria-labelledby="workbench-heading">
      <h2 id="workbench-heading">正規化工作台：{normalization.explorer.title}</h2>
      <RelationHeader relation={normalization.explorer}/>
      <NfExplorer relation={normalization.explorer}/>
    </section>}
    <section id="quiz" className={styles.block} aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">觀念測驗</h2>
      <Quiz lessonId={lesson.lessonId} questions={content.quiz}
        tokens={Object.fromEntries(content.quiz.flatMap(q => q.code ? [[q.id, highlight(q.code.text, q.code.language)]] : []))}/>
    </section>
    <section id="exercises" className={styles.block} aria-labelledby="exercises-heading">
      <h2 id="exercises-heading">{onlySql ? 'SQL 練習' : '練習'}</h2>
      <p className={styles.judgeNotice} role="note">{[
        sql?.exercises.length ? '按「檢查答案」後，你的 SQL 和參考解答會在這個瀏覽器裡，各自用一份全新的資料執行，再比對結果（或比對之後每個檢查敘述的結果）：只看結果、不看寫法，所以不同的正確寫法都會通過；另外會用隱藏的資料或檢查敘述再檢查一次，只顯示通過與否。' : '',
        er?.exercises.length ? 'ER 模型依意義比對：關係畫成反方向、兩端數量對調，仍是同一個關係。' : '',
        normalization?.exercises.length ? '正規化練習依條件檢查（鍵的閉包與最小性；分解後每張表的正規形式、是否無損、是否保留相依），任何符合條件的答案都會通過。' : '',
        transactions?.exercises.length ? '交易練習的答案由模擬器算出（日誌復原、鎖或 MVCC 的實際執行），再和你的答案比對。' : '',
        ops?.exercises.length ? '備份與複寫練習的答案由模擬器算出（還原步驟、複本延遲、切換時遺失的寫入），再和你的答案比對。' : '',
        sql?.exercises.some(e => e.plan || e.probes?.some(p => p.plan)) ? '有些 SQL 練習還會檢查查詢計畫（EXPLAIN QUERY PLAN）：只看是否用上索引、是否還要額外排序，不看索引的名稱。' : '',
        '網站不會上傳或儲存你的答案；練習不計入學習進度。',
      ].join('')}</p>
      {sql?.exercises.map(e => <SqlExerciseView key={e.id} exercise={e}/>)}
      {er?.exercises.map(e => <ErExerciseView key={e.id} exercise={e}/>)}
      {normalization?.exercises.map(e => <NfExerciseView key={e.id} exercise={e}/>)}
      {transactions?.exercises.map(e => <TxExerciseView key={e.id} exercise={e}/>)}
      {ops?.exercises.map(e => <OpsExerciseView key={e.id} exercise={e}/>)}
    </section>
    <LessonCompletion lessonId={lesson.lessonId} quizTotal={content.quiz.length}
      island={{ name: island.name, lessonIds: lessons.filter(l => l.islandId === lesson.islandId && l.lessonStatus === 'complete').map(l => l.lessonId) }}/>
  </>;
}
