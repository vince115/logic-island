import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ChevronRight, FlaskConical } from 'lucide-react';
import { getCourse } from '@/content/courses';
import { getContent, getLessonById, islands, neighbours, visualizations } from '@/content/curriculum';
import { APCS_LABELS, DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import type { Block, CodeExample, Exercise, LessonContent, LessonMeta } from '@/content/curriculum/schema';
import { CodeTabs } from './code';
import { LessonCompletion, ProgressBadge } from './progress';
import { Quiz } from './quiz';
import { Rich } from './rich';
import { ConditionalBranch, VariableState } from './visualizations';
import styles from './curriculum.module.css';

/** /curriculum/[slug]: a complete lesson in full, or a planned lesson's outline, never one made to look like the other. */
export function LessonPage({ lesson }: { lesson: LessonMeta }) {
  const island = islands.find(i => i.id === lesson.islandId)!;
  const content = getContent(lesson.lessonId);
  const { previous, next } = neighbours(lesson);
  return <main id="main" className={`container ${styles.lesson}`}>
    <nav className="breadcrumbs" aria-label="麵包屑">
      <Link href="/curriculum">課綱</Link><ChevronRight size={14} aria-hidden/><span>{island.name}</span><ChevronRight size={14} aria-hidden/><span aria-current="page">{lesson.title}</span>
    </nav>
    <header className={styles.lessonHeader}>
      <span className="eyebrow">{island.name} · {lesson.lessonId}</span>
      <h1>{lesson.title}</h1>
      <p className={styles.intro}>{lesson.summary}</p>
      <ul className={styles.facts} aria-label="課程資訊">
        <li><span>難度</span>{DIFFICULTY_LABELS[lesson.difficulty]}（{lesson.difficulty}）</li>
        <li><span>預估時間</span>{lesson.estimatedMinutes} 分鐘</li>
        <li><span>APCS</span>{lesson.apcsRelevance.map(r => APCS_LABELS[r]).join('、')}</li>
        <li><span>語言</span>{lesson.supportedLanguages.join(' / ')}</li>
        <li><span>狀態</span>{lesson.lessonStatus === 'complete' ? `完整教材 v${lesson.version}` : `規劃中 v${lesson.version}`}</li>
        {content && <li><span>我的進度</span><ProgressBadge lessonId={lesson.lessonId}/></li>}
      </ul>
    </header>
    {!content && <div className={styles.plannedNotice} role="note">
      <strong>這一課還在規劃中。</strong> 以下是課程大綱（學習目標、核心概念與先修課程）；完整教材、程式範例、測驗與練習尚未完成，所以這裡不提供測驗或互動元件。
    </div>}
    <Prerequisites lesson={lesson}/>
    <section className={styles.block} aria-labelledby="objectives-heading">
      <h2 id="objectives-heading">學習目標</h2>
      <ul className="objectives">{lesson.learningObjectives.map(o => <li key={o}><Check size={16} aria-hidden/>{o}</li>)}</ul>
      <p className={styles.concepts}><span>核心概念</span>{lesson.concepts.map(c => <span key={c} className={styles.chip}>{c}</span>)}</p>
    </section>
    {lesson.labs?.length ? <section className={styles.block} aria-labelledby="labs-heading">
      <h2 id="labs-heading">相關互動實驗</h2>
      <p className={styles.muted}>現有的互動教材已經涵蓋這一課的部分內容，可以先動手試試：</p>
      <p>{lesson.labs.map(slug => <Link key={slug} className={styles.labLink} href={`/learn/${slug}`}><FlaskConical size={15} aria-hidden/>{getCourse(slug)?.title} · {getCourse(slug)?.subtitle}</Link>)}</p>
    </section> : null}
    {content ? <Complete lesson={lesson} content={content}/> : <PlannedVisualization lesson={lesson}/>}
    <nav className={styles.pager} aria-label="上一堂與下一堂">
      {previous ? <Link href={`/curriculum/${previous.slug}`} rel="prev"><ArrowLeft size={16} aria-hidden/><span><small>上一堂 · {previous.lessonId}</small>{previous.title}</span></Link> : <span/>}
      {next ? <Link href={`/curriculum/${next.slug}`} rel="next"><span><small>下一堂 · {next.lessonId}{next.lessonStatus === 'planned' ? '（規劃中）' : ''}</small>{next.title}</span><ArrowRight size={16} aria-hidden/></Link> : <span/>}
    </nav>
  </main>;
}

/** The suggested prerequisites, with this learner's status of each. They guide; nothing is locked. */
function Prerequisites({ lesson }: { lesson: LessonMeta }) {
  if (!lesson.prerequisites.length) return <p className={styles.prereqNone}>這是起點，不需要先修課程。</p>;
  return <aside className={styles.prereqs} aria-labelledby="prereq-heading">
    <h2 id="prereq-heading">建議先完成</h2>
    <ul>{lesson.prerequisites.map(id => getLessonById(id)!).map(p => <li key={p.lessonId}>
      <Link href={`/curriculum/${p.slug}`}>{p.lessonId} {p.title}</Link>
      {p.lessonStatus === 'complete' ? <ProgressBadge lessonId={p.lessonId}/> : <span className={styles.statusTag} data-status="planned">規劃中</span>}
    </li>)}</ul>
  </aside>;
}

function PlannedVisualization({ lesson }: { lesson: LessonMeta }) {
  const viz = visualizations[lesson.visualizationType];
  if (viz.status === 'not-available') return null;
  return <section className={styles.block} aria-labelledby="viz-heading">
    <h2 id="viz-heading">互動視覺化</h2>
    <p className={styles.muted}>本課預定使用「{viz.label}」視覺化（{viz.status === 'implemented' ? 'Implemented，會隨完整教材提供' : 'Planned，尚未實作'}）。</p>
  </section>;
}

function Complete({ lesson, content }: { lesson: LessonMeta; content: LessonContent }) {
  const examples = new Map(content.examples.map(e => [e.id, e]));
  const viz = content.visualization;
  return <>
    <nav className={styles.toc} aria-label="本課內容">
      <ol>{content.sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
        {viz && <li><a href="#visualization">互動視覺化</a></li>}<li><a href="#quiz">觀念測驗</a></li><li><a href="#exercises">程式練習</a></li></ol>
    </nav>
    {content.sections.map(section => <section key={section.id} id={section.id} className={styles.block} aria-labelledby={`${section.id}-heading`}>
      <h2 id={`${section.id}-heading`}>{section.title}</h2>
      {section.blocks.map((block, i) => <BlockView key={i} block={block} examples={examples}/>)}
    </section>)}
    {viz && <section id="visualization" className={styles.block} aria-labelledby="visualization-heading">
      <h2 id="visualization-heading">互動視覺化：{viz.title}</h2>
      <p className={styles.muted}>{visualizations[lesson.visualizationType].label}（Implemented）</p>
      {viz.kind === 'variable-state' ? <VariableState config={viz}/> : <ConditionalBranch config={viz}/>}
    </section>}
    <section id="quiz" className={styles.block} aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">觀念測驗</h2>
      <Quiz lessonId={lesson.lessonId} questions={content.quiz}/>
    </section>
    <section id="exercises" className={styles.block} aria-labelledby="exercises-heading">
      <h2 id="exercises-heading">程式練習</h2>
      <p className={styles.judgeNotice} role="note">目前沒有線上評測：請在自己的電腦上執行程式，用下面的測資逐一比對輸出。網站不會執行或批改你的程式碼。</p>
      {content.exercises.map(e => <ExerciseView key={e.id} exercise={e}/>)}
    </section>
    <LessonCompletion lessonId={lesson.lessonId} quizTotal={content.quiz.length}/>
  </>;
}

function BlockView({ block, examples }: { block: Block; examples: Map<string, CodeExample> }) {
  switch (block.type) {
    case 'p': return <p><Rich text={block.text}/></p>;
    case 'list': {
      const items = block.items.map((item, i) => <li key={i}><Rich text={item}/></li>);
      return block.ordered ? <ol className={styles.list}>{items}</ol> : <ul className={styles.list}>{items}</ul>;
    }
    case 'callout': return <aside className={styles.callout} data-tone={block.tone}><strong>{block.title}</strong><p><Rich text={block.text}/></p></aside>;
    case 'table': return <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr>{block.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => c === 0 ? <th key={c} scope="row"><Rich text={cell}/></th> : <td key={c}><Rich text={cell}/></td>)}</tr>)}</tbody>
    </table></div>;
    case 'example': {
      const example = examples.get(block.id)!;
      const output = example.outputByLanguage ? { 'C++': example.output, Python: example.output, Java: example.output, ...example.outputByLanguage } : example.output;
      return <div className={styles.example}>
        <h3>{example.title}</h3>
        <p className={styles.muted}>{example.description}</p>
        <CodeTabs code={example.code} label={example.title} input={example.stdin} output={output}/>
      </div>;
    }
  }
}

function ExerciseView({ exercise }: { exercise: Exercise }) {
  const kinds = { normal: '一般', edge: '邊界', error: '錯誤輸入' } as const;
  return <article className={styles.exercise} aria-labelledby={`${exercise.id}-title`}>
    <h3 id={`${exercise.id}-title`}>{exercise.title}</h3>
    <p><Rich text={exercise.statement}/></p>
    <dl className={styles.spec}>
      <dt>輸入</dt><dd><Rich text={exercise.inputFormat}/></dd>
      <dt>輸出</dt><dd><Rich text={exercise.outputFormat}/></dd>
      <dt>限制</dt><dd><ul>{exercise.constraints.map(c => <li key={c}>{c}</li>)}</ul></dd>
    </dl>
    <h4>範例</h4>
    {exercise.samples.map((s, i) => <div key={i} className={styles.sample}><div><span>輸入</span><pre>{s.input}</pre></div><div><span>輸出</span><pre>{s.output}</pre></div><p className={styles.muted}>{s.note}</p></div>)}
    {exercise.starter && <><h4>起始程式碼</h4><CodeTabs code={exercise.starter} label={`${exercise.title} 起始程式碼`}/></>}
    <details className={styles.details}><summary>提示（{exercise.hints.length}）</summary><ul>{exercise.hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>
    <details className={styles.details}><summary>測資（{exercise.tests.length} 組：一般、邊界{exercise.tests.some(t => t.kind === 'error') ? '、錯誤輸入' : ''}）</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">類型</th><th scope="col">輸入</th><th scope="col">預期輸出</th><th scope="col">說明</th></tr></thead>
        <tbody>{exercise.tests.map((t, i) => <tr key={i}><td>{kinds[t.kind]}</td><td><pre>{t.input}</pre></td><td><pre>{t.output}</pre></td><td>{t.note}</td></tr>)}</tbody>
      </table></div>
      {exercise.errorPolicy && <p className={styles.muted}>錯誤輸入：{exercise.errorPolicy}</p>}
    </details>
    <details className={styles.details}><summary>參考解答</summary><CodeTabs code={exercise.solution} label={`${exercise.title} 參考解答`}/></details>
  </article>;
}
