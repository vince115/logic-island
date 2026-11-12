import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { islands, lessons } from '@/content/curriculum';
import { APCS_LABELS, DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES } from '@/content/curriculum/schema';
import { lessonsOfIsland } from '@/content/world/catalog';
import { getIsland } from '@/content/world';
import { IslandProgress, ProgressBadge } from './progress';
import styles from './curriculum.module.css';

const NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * /curriculum: every lesson that can be learned, island by island in recommended order, with status and this learner's
 * progress. Phase F.1a: an island with planned lessons (the database island) also lists them, marked 規劃中 and not
 * linked, since they have no page yet.
 */
export function CurriculumCatalog() {
  const complete = lessons.filter(l => l.lessonStatus === 'complete').length, first = lessons.find(l => l.lessonId === 'F01');
  const listed = islands.flatMap(i => lessonsOfIsland(i.id)), planned = listed.length - complete;
  const db = islands.find(i => i.id === 'databases'), dbOpen = lessons.filter(l => l.islandId === 'databases').length;
  return <main id="main" className={`container ${styles.catalog}`}>
    <span className="eyebrow">THE CURRICULUM · PHASE E</span>
    <h1>{complete} 堂課，{NUMERALS[islands.length] ?? islands.length}座島。</h1>
    <p className={styles.intro}>從第一支程式到動態規劃：基礎程式島、資料結構島、演算法島各 20 堂，依建議順序排列，C++、Java、Python、JavaScript 四語對照。{db && `${db.name}已開放 ${dbOpen} 堂 SQL 課程（全島 ${getIsland(db.id)!.lessonCount} 堂，其餘規劃中），SQL 直接在瀏覽器裡執行。`}先修課程只是建議，所有開放的課程都可以直接開啟。</p>
    {/* Phase E.5: the site's introduction (once the home page, then /learn) in brief: how each lesson works, and where to start. */}
    <section className={styles.approach} aria-labelledby="curriculum-approach">
      <h2 id="curriculum-approach">每一堂都是 Think · Visualize · Code</h2>
      <ol>
        <li><strong>01 · Think</strong><span>讀懂概念與使用情境</span></li>
        <li><strong>02 · Visualize</strong><span>修改輸入，觀察每一步</span></li>
        <li><strong>03 · Code</strong><span>四種語言對照，建立自己的理解</span></li>
      </ol>
      <div className={styles.approachActions}>
        {first && <Link className={styles.approachPrimary} href={`/curriculum/${first.slug}`}>從 {first.lessonId} {first.title} 開始<ArrowRight size={15} aria-hidden/></Link>}
        <Link href="/learn">先到互動實驗島試試<ArrowRight size={15} aria-hidden/></Link>
      </div>
    </section>
    <dl className={styles.summary}>
      <div><dt>課程</dt><dd>{listed.length} 堂</dd></div>
      <div><dt>已完成教材</dt><dd>{complete} 堂</dd></div>
      <div><dt>規劃中（大綱）</dt><dd>{planned} 堂</dd></div>
      {DIFFICULTIES.map(d => <div key={d}><dt>{DIFFICULTY_LABELS[d]}</dt><dd>{lessons.filter(l => l.difficulty === d).length} 堂</dd></div>)}
    </dl>
    <IslandProgress name="全部課程" lessonIds={lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)} completeText={`${lessons.length} 堂課全部完成！`}/>
    {islands.map(island => <section key={island.id} className={styles.island} aria-labelledby={`island-${island.id}`}>
      <h2 id={`island-${island.id}`}>{island.name}<span>{island.englishName}</span></h2>
      <p className={styles.muted}>{island.summary}</p>
      {lessonsOfIsland(island.id).some(l => l.lessonStatus === 'planned') && <p className={styles.islandOpen}>
        已開放 {lessons.filter(l => l.islandId === island.id).length}／{lessonsOfIsland(island.id).length} 堂，{lessonsOfIsland(island.id).filter(l => l.lessonStatus === 'planned').length} 堂規劃中（尚未開放，不能點選）。</p>}
      {lessons.some(l => l.islandId === island.id && l.lessonStatus === 'complete') &&
        <IslandProgress name={island.name} lessonIds={lessons.filter(l => l.islandId === island.id && l.lessonStatus === 'complete').map(l => l.lessonId)}/>}
      <ol className={styles.lessonList}>
        {lessons.filter(l => l.islandId === island.id).map(l => <li key={l.lessonId} data-status={l.lessonStatus}>
          <span className={styles.lessonId}>{l.lessonId}</span>
          <div className={styles.lessonMain}>
            <Link href={`/curriculum/${l.slug}`}>{l.title}</Link>
            <span className={styles.lessonMeta}>{DIFFICULTY_LABELS[l.difficulty]} · {l.estimatedMinutes} 分鐘 · {l.apcsRelevance.map(r => APCS_LABELS[r]).join('、')}</span>
          </div>
          <span className={styles.statusTag} data-status={l.lessonStatus}>{l.lessonStatus === 'complete' ? '完整教材' : '規劃中'}</span>
          {l.lessonStatus === 'complete' ? <ProgressBadge lessonId={l.lessonId}/> : <span className={styles.progressPlaceholder} aria-hidden/>}
        </li>)}
        {lessonsOfIsland(island.id).filter(l => l.lessonStatus === 'planned').map(l => <li key={l.lessonId} data-status="planned">
          <span className={styles.lessonId}>{l.lessonId}</span>
          <div className={styles.lessonMain}>
            <span className={styles.plannedTitle}>{l.title}</span>
            <span className={styles.lessonMeta}>{DIFFICULTY_LABELS[l.difficulty]} · {l.titleEn}</span>
          </div>
          <span className={styles.statusTag} data-status="planned">規劃中</span>
          <span className={styles.progressPlaceholder} aria-hidden/>
        </li>)}
      </ol>
    </section>)}
  </main>;
}
