import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, FlaskConical } from 'lucide-react';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { getCourse } from '@/content/courses';
import { getContent, islands, lessons, visualizations } from '@/content/curriculum';
import { APCS_LABELS, DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { hasCapability, type Block, type CodeExample, type Exercise, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { getCatalogLesson } from '@/content/world/catalog';
import { lessonNavigation, type LessonNavigation } from '@/content/world/navigation';
import { lessonPlace } from '@/lib/nav/site-nav';
import { CodeTabs, LessonLanguages } from './code';
import { highlight, highlightAll } from '@/lib/highlight/server';
import { IslandProgress, LessonCompletion, ProgressBadge } from './progress';
import { Quiz } from './quiz';
import { Rich } from './rich';
import { DatabaseLessonBody, databaseExamples } from './database-lesson';
import { ChallengeStages, Complexity, ConditionalBranch, DsComparison, Trace } from './visualizations';
import styles from './curriculum.module.css';

/** /curriculum/[slug]: a complete lesson in full, or a planned lesson's outline, never one made to look like the other. */
export function LessonPage({ lesson }: { lesson: LessonMeta }) {
  const island = islands.find(i => i.id === lesson.islandId)!, place = lessonPlace(lesson.lessonId);
  const content = getContent(lesson.lessonId);
  // Phase F.1b: the declared capabilities pick the body: program code, or the database activities (SQL, ER, normalization).
  const programCode = hasCapability(lesson, 'program-code');
  const activityExamples = content && !programCode ? databaseExamples(content) : undefined;
  // Phase F.1b: previous and next stay inside the island; a planned next lesson is named without a link.
  const nav = lessonNavigation(lesson.lessonId), { previous, next, plannedNext } = nav;
  return <main id="main" className={`container ${styles.lesson}`}>
    {/* 2026-11-12: 探索群島 / island (its part of the curriculum) / level / this lesson. */}
    {/* Multi-archipelago v2: World / Region / Island / Level / Lesson. */}
    <Breadcrumbs items={[{ label: '探索群島', href: '/' }, ...place ? [{ label: place.region.name, href: place.regionHref }] : [], { label: island.name, href: `/curriculum#island-${island.id}` }, { label: DIFFICULTY_LABELS[lesson.difficulty] }, { label: `${lesson.lessonId} ${lesson.title}` }]}/>
    <header className={styles.lessonHeader}>
      <span className="eyebrow">{island.name} · {lesson.lessonId}</span>
      <h1>{lesson.title}</h1>
      <p className={styles.intro}>{lesson.summary}</p>
      <ul className={styles.facts} aria-label="課程資訊">
        <li><span>難度</span>{DIFFICULTY_LABELS[lesson.difficulty]}（{lesson.difficulty}）</li>
        <li><span>預估時間</span>{lesson.estimatedMinutes} 分鐘</li>
        <li><span>APCS</span>{lesson.apcsRelevance.map(r => APCS_LABELS[r]).join('、')}</li>
        <li><span>語言</span>{lesson.queryLanguage ?? (lesson.supportedLanguages.join(' / ') || '不需寫程式')}</li>
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
      {content && <p className={styles.motivation}><strong>為什麼要學：</strong><Rich text={content.motivation}/></p>}
      <ul className="objectives">{lesson.learningObjectives.map(o => <li key={o}><Check size={16} aria-hidden/>{o}</li>)}</ul>
      <p className={styles.concepts}><span>核心概念</span>{lesson.concepts.map(c => <span key={c} className={styles.chip}>{c}</span>)}</p>
    </section>
    {lesson.labs?.length ? <section className={styles.block} aria-labelledby="labs-heading">
      <h2 id="labs-heading">相關互動實驗</h2>
      <p className={styles.muted}>現有的互動教材已經涵蓋這一課的部分內容，可以先動手試試：</p>
      <p>{lesson.labs.map(slug => <Link key={slug} className={styles.labLink} href={`/learn/${slug}`}><FlaskConical size={15} aria-hidden/>{getCourse(slug)?.title} · {getCourse(slug)?.subtitle}</Link>)}</p>
    </section> : null}
    {content && !programCode ? <DatabaseLessonBody lesson={lesson} content={content} renderSection={section => <SectionView key={section.id} section={section} examples={new Map()} activityExamples={activityExamples}/>}/>
      : content ? <Complete lesson={lesson} content={content}/> : <PlannedVisualization lesson={lesson}/>}
    <nav className={styles.pager} aria-label="上一堂與下一堂">
      {previous ? <Link href={`/curriculum/${previous.slug}`} rel="prev"><ArrowLeft size={16} aria-hidden/><span><small>上一堂 · {previous.lessonId}</small>{previous.title}</span></Link> : <span/>}
      {next ? <Link href={`/curriculum/${next.slug}`} rel="next"><span><small>下一堂 · {next.lessonId}</small>{next.title}</span><ArrowRight size={16} aria-hidden/></Link>
        : plannedNext ? <span className={styles.pagerPlanned}><span><small>下一堂 · {plannedNext.lessonId}（規劃中，尚未開放）</small>{plannedNext.title}</span></span>
        : <Link href={`/curriculum#island-${island.id}`}><span><small>本島課程已到最後一堂</small>返回{island.name}課綱</span><ArrowRight size={16} aria-hidden/></Link>}
    </nav>
    {nav.islandEnd && <IslandEnd lesson={lesson} islandName={island.name} nav={nav}/>}
    {nav.islandEnd && <IslandProgress name="全部課程" lessonIds={lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)} completeText={`${lessons.length} 堂課全部完成！`}/>}
  </main>;
}

/**
 * Phase F.1b: after the last open lesson of an island. The island's own course ends (or continues later, when its next
 * lesson is planned); other islands are offered as what they are: learning paths and bridges, never as "the next lesson".
 */
function IslandEnd({ lesson, islandName, nav }: { lesson: LessonMeta; islandName: string; nav: LessonNavigation }) {
  return <section className={styles.block} aria-labelledby="island-end-heading">
    <h2 id="island-end-heading">{nav.islandComplete ? '本島課程已到最後一堂' : '後續課程規劃中'}</h2>
    <p>{nav.islandComplete ? `這是${islandName}的最後一堂。` : `${islandName}已開放的課到這裡為止；從 ${nav.plannedNext?.lessonId} 起的課還在規劃中，完成後會出現在課綱與這裡。`}
      <Link href={`/curriculum#island-${lesson.islandId}`}>返回{islandName}課綱</Link></p>
    {nav.paths.length > 0 && <>
      <h3>推薦學習路線</h3>
      <ul className={styles.list}>{nav.paths.map(p => <li key={p.id}>
        <strong>{p.title}</strong>（已開放 {p.open}／{p.total} 堂）：{p.next
          ? <>這條路線的下一步是 <Link href={`/curriculum/${p.next.slug}`}>{p.next.lessonId} {p.next.title}</Link></>
          : p.last ? '這是這條路線的最後一堂。' : '這條路線接下來的課還在規劃中。'}
      </li>)}</ul>
    </>}
    {nav.bridges.length > 0 && <p className={styles.muted}>從這座島過橋可以前往：{nav.bridges.map(b => <Link key={b.id} className={styles.labLink} href={b.href}>{b.name}</Link>)}</p>}
  </section>;
}

/** The suggested prerequisites, with this learner's status of each. They guide; nothing is locked. */
function Prerequisites({ lesson }: { lesson: LessonMeta }) {
  if (!lesson.prerequisites.length) return <p className={styles.prereqNone}>這是起點，不需要先修課程。</p>;
  // Phase F.1a: the blueprint's optional reading, listed apart from the prerequisites (and, like them, never locked).
  // F.1c: a recommendation may be a planned lesson (of this island or another): named, not linked.
  const recommended = (lesson.recommended ?? []).map(id => getCatalogLesson(id)!);
  return <aside className={styles.prereqs} aria-labelledby="prereq-heading">
    <h2 id="prereq-heading">建議先完成</h2>
    {/* F.1d: a prerequisite may be a planned lesson (DB16 → PL02): named, with no link to a page that does not exist. */}
    <ul>{lesson.prerequisites.map(id => getCatalogLesson(id)!).map(p => <li key={p.lessonId}>
      {p.href ? <Link href={p.href}>{p.lessonId} {p.title}</Link> : <span>{p.lessonId} {p.title}</span>}
      {p.lessonStatus === 'complete' ? <ProgressBadge lessonId={p.lessonId}/> : <span className={styles.statusTag} data-status="planned">規劃中</span>}
    </li>)}</ul>
    {recommended.length > 0 && <p className={styles.recommended}><span>也可以參考（非必要）</span>{recommended.map(r => r.href
      ? <Link key={r.lessonId} href={r.href}>{r.lessonId} {r.title}</Link>
      : <span key={r.lessonId}>{r.lessonId} {r.title}（規劃中）</span>)}</p>}
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
  return <LessonLanguages languages={lesson.supportedLanguages}>
    <nav className={styles.toc} aria-label="本課內容">
      <ol>{content.sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
        {viz && <li><a href="#visualization">互動視覺化</a></li>}<li><a href="#quiz">觀念測驗</a></li><li><a href="#exercises">程式練習</a></li></ol>
    </nav>
    {content.sections.map(section => <SectionView key={section.id} section={section} examples={examples}/>)}
    {viz && <section id="visualization" className={styles.block} aria-labelledby="visualization-heading">
      <h2 id="visualization-heading">互動視覺化：{viz.title}</h2>
      <p className={styles.muted}>{visualizations[lesson.visualizationType].label}（Implemented）</p>
      {viz.kind === 'conditional-branch' ? <ConditionalBranch config={viz}/>
        : viz.kind === 'complexity' ? <Complexity config={viz}/>
        : viz.kind === 'ds-comparison' ? <DsComparison config={viz}/>
        : viz.kind === 'challenge-stages' ? <ChallengeStages config={viz} titles={Object.fromEntries(lessons.map(l => [l.lessonId, l.title]))}/>
        : <Trace config={viz} tokens={highlight(viz.code, viz.language)}/>}
    </section>}
    <section id="quiz" className={styles.block} aria-labelledby="quiz-heading">
      <h2 id="quiz-heading">觀念測驗</h2>
      <Quiz lessonId={lesson.lessonId} questions={content.quiz}
        tokens={Object.fromEntries(content.quiz.flatMap(q => q.code ? [[q.id, highlight(q.code.text, q.code.language)]] : []))}/>
    </section>
    <section id="exercises" className={styles.block} aria-labelledby="exercises-heading">
      <h2 id="exercises-heading">程式練習</h2>
      <p className={styles.judgeNotice} role="note">目前沒有線上評測：請在自己的電腦上執行程式，用下面的測資逐一比對輸出。網站不會執行或批改你的程式碼。{lesson.supportedLanguages.includes('JavaScript') && <> JavaScript 以 Node.js 執行，例如 <code>node main.js &lt; input.txt</code>。</>}</p>
      {content.exercises.map(e => <ExerciseView key={e.id} exercise={e}/>)}
    </section>
    <LessonCompletion lessonId={lesson.lessonId} quizTotal={content.quiz.length}
      island={{ name: islands.find(i => i.id === lesson.islandId)!.name, lessonIds: lessons.filter(l => l.islandId === lesson.islandId && l.lessonStatus === 'complete').map(l => l.lessonId) }}/>
  </LessonLanguages>;
}

/** `activityExamples`: a database lesson's examples (SQL, ER diagrams, normalization steps), already drawn, by id. */
function SectionView({ section, examples, activityExamples }: { section: LessonContent['sections'][number]; examples: Map<string, CodeExample>; activityExamples?: Map<string, React.ReactNode> }) {
  return <section id={section.id} className={styles.block} aria-labelledby={`${section.id}-heading`}>
    <h2 id={`${section.id}-heading`}>{section.title}</h2>
    {section.blocks.map((block, i) => <BlockView key={i} block={block} examples={examples} activityExamples={activityExamples}/>)}
  </section>;
}

function BlockView({ block, examples, activityExamples }: { block: Block; examples: Map<string, CodeExample>; activityExamples?: Map<string, React.ReactNode> }) {
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
      if (activityExamples?.has(block.id)) return activityExamples.get(block.id);
      const example = examples.get(block.id)!;
      const output = example.outputByLanguage ? { 'C++': example.output, Python: example.output, Java: example.output, JavaScript: example.output, ...example.outputByLanguage } : example.output;
      return <div className={styles.example}>
        <h3>{example.title}</h3>
        <p className={styles.muted}>{example.description}</p>
        <CodeTabs code={example.code} tokens={highlightAll(example.code)} label={example.title} input={example.stdin} output={output}/>
      </div>;
    }
  }
}

/**
 * A test's text as shown on the page: large generated tests (up to hundreds of kilobytes, used by the automated
 * three-language check) show their first lines and say how big they are, so the page stays light.
 */
function TestText({ text }: { text: string }) {
  const lines = text.split('\n');
  if (text.length <= 600 && lines.length <= 20) return <pre>{text}</pre>;
  const head = lines.slice(0, 8).map(l => l.length > 80 ? `${l.slice(0, 80)}…` : l).join('\n');
  return <><pre>{head}{'\n'}…</pre><p className={styles.muted}>大型測資：共 {lines.length.toLocaleString('en-US')} 行、{text.length.toLocaleString('en-US')} 個字元，只顯示開頭；完整內容在自動驗證中使用。</p></>;
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
    {exercise.starter && <><h4>起始程式碼</h4><CodeTabs code={exercise.starter} tokens={highlightAll(exercise.starter)} label={`${exercise.title} 起始程式碼`}/></>}
    <details className={styles.details}><summary>提示（{exercise.hints.length}）</summary><ul>{exercise.hints.map(h => <li key={h}><Rich text={h}/></li>)}</ul></details>
    <details className={styles.details}><summary>測資（{exercise.tests.length} 組：一般、邊界{exercise.tests.some(t => t.kind === 'error') ? '、錯誤輸入' : ''}）</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">類型</th><th scope="col">輸入</th><th scope="col">預期輸出</th><th scope="col">說明</th></tr></thead>
        <tbody>{exercise.tests.map((t, i) => <tr key={i}><td>{kinds[t.kind]}</td><td><TestText text={t.input}/></td><td><TestText text={t.output}/></td><td>{t.note}</td></tr>)}</tbody>
      </table></div>
      {exercise.errorPolicy && <p className={styles.muted}>錯誤輸入：{exercise.errorPolicy}</p>}
    </details>
    <details className={styles.details}><summary>參考解答</summary><CodeTabs code={exercise.solution} tokens={highlightAll(exercise.solution)} label={`${exercise.title} 參考解答`}/></details>
  </article>;
}
