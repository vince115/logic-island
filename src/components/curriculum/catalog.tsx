import Link from 'next/link';
import { islands, lessons } from '@/content/curriculum';
import { APCS_LABELS, DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES } from '@/content/curriculum/schema';
import { ProgressBadge } from './progress';
import styles from './curriculum.module.css';

/** /curriculum: the 60 lessons of the three islands in recommended order, with status and this learner's progress. */
export function CurriculumCatalog() {
  const complete = lessons.filter(l => l.lessonStatus === 'complete').length;
  return <main id="main" className={`container ${styles.catalog}`}>
    <span className="eyebrow">THE CURRICULUM · PHASE E</span>
    <h1>60 堂課，三座島。</h1>
    <p className={styles.intro}>從第一支程式到動態規劃：基礎程式島、資料結構島、演算法島各 20 堂，依建議順序排列，C++、Python、Java 三語對照。先修課程只是建議，所有課程都可以直接開啟。</p>
    <dl className={styles.summary}>
      <div><dt>課程</dt><dd>{lessons.length} 堂</dd></div>
      <div><dt>已完成教材</dt><dd>{complete} 堂</dd></div>
      <div><dt>規劃中（大綱）</dt><dd>{lessons.length - complete} 堂</dd></div>
      {DIFFICULTIES.map(d => <div key={d}><dt>{DIFFICULTY_LABELS[d]}</dt><dd>{lessons.filter(l => l.difficulty === d).length} 堂</dd></div>)}
    </dl>
    {islands.map(island => <section key={island.id} className={styles.island} aria-labelledby={`island-${island.id}`}>
      <h2 id={`island-${island.id}`}>{island.name}<span>{island.englishName}</span></h2>
      <p className={styles.muted}>{island.summary}</p>
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
      </ol>
    </section>)}
  </main>;
}
