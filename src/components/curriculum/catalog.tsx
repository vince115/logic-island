import type { CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Map as MapIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { islandPreviews } from '@/lib/nav/site-nav';
import { islands, lessons } from '@/content/curriculum';
import { APCS_LABELS, DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { DIFFICULTIES } from '@/content/curriculum/schema';
import { catalogCounts, lessonsOfIsland } from '@/content/world/catalog';
import { getIsland, getRegion, orderedRegions } from '@/content/world';
import { PlannedIslandsOf, PlannedRegion, RegionExams, RegionStrip } from './region-overview';
import { IslandProgress, ProgressBadge } from './progress';
import styles from './curriculum.module.css';
import overview from './catalog-overview.module.css';

const NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * /curriculum: every lesson that can be learned, island by island in recommended order, with status and this learner's
 * progress. Phase F.1a: an island with planned lessons (the database island) also lists them, marked 規劃中 and not
 * linked, since they have no page yet.
 * 2026-11-12: the sidebar carries the tree (island → level → lesson); this page opens with one card per island (its
 * map screenshot, levels and progress) and lists each island's lessons by level, so no island is a single long list.
 * Multi-archipelago v2 (P2): the four regions open the page; the islands with written lessons (程式與資訊群島) follow
 * as before, then every planned island, region by region, as outlines marked 規劃中 and never linked.
 */
export function CurriculumCatalog() {
  const complete = lessons.filter(l => l.lessonStatus === 'complete').length, first = lessons.find(l => l.lessonId === 'F01');
  const db = islands.find(i => i.id === 'databases'), dbOpen = lessons.filter(l => l.islandId === 'databases').length;
  const previews = islandPreviews(), counts = catalogCounts(), cs = getRegion('cs')!;
  return <main id="main" className={`container ${styles.catalog}`}>
    <Breadcrumbs items={[{ label: '探索群島', href: '/' }, { label: '完整課綱' }]}/>
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
    <h2 className={overview.heading}>四大學習群島</h2>
    <RegionStrip/>
    <dl className={styles.summary}>
      <div><dt>規劃課程</dt><dd>{counts.total} 堂</dd></div>
      <div><dt>已開放教材</dt><dd>{counts.complete} 堂</dd></div>
      <div><dt>規劃中（大綱）</dt><dd>{counts.planned} 堂</dd></div>
      {DIFFICULTIES.map(d => <div key={d}><dt>{DIFFICULTY_LABELS[d]}</dt><dd>{lessons.filter(l => l.difficulty === d).length} 堂</dd></div>)}
    </dl>
    <IslandProgress name="全部課程" lessonIds={lessons.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)} completeText={`${lessons.length} 堂課全部完成！`}/>
    <h2 id="region-cs" className={`${overview.heading} ${overview.regionHeading}`}>{cs.name}<span>{cs.nameEn} · 已開放的主題島</span></h2>
    <RegionExams region="cs"/>
    <div className={overview.grid}>{islands.map(island => {
      const own = lessons.filter(l => l.islandId === island.id), card = previews[island.id];
      return <article key={island.id} className={overview.card} style={{ '--island-accent': card.accent } as CSSProperties} aria-labelledby={`card-${island.id}`}>
        <a href={`#island-${island.id}`} className={overview.image} tabIndex={-1} aria-hidden><Image src={card.image} alt="" width={480} height={270} sizes="(max-width: 700px) 100vw, 300px" unoptimized/></a>
        <div className={overview.body}>
          <small>{island.englishName}</small>
          <h3 id={`card-${island.id}`}>{island.name}</h3>
          <p className={overview.levels}>{DIFFICULTIES.map(d => ({ d, n: own.filter(l => l.difficulty === d).length })).filter(x => x.n).map(x => `${DIFFICULTY_LABELS[x.d]} ${x.n}`).join(' · ')} 堂</p>
          <IslandProgress name="我的進度" lessonIds={own.filter(l => l.lessonStatus === 'complete').map(l => l.lessonId)} completeText={`${island.name}全部完成！`}/>
          <div className={overview.actions}>
            <a href={`#island-${island.id}`}>查看課程<ArrowRight size={14} aria-hidden/></a>
            <Link href={card.mapHref}><MapIcon size={14} aria-hidden/>3D 島嶼</Link>
          </div>
        </div>
      </article>;
    })}</div>
    {islands.map(island => <section key={island.id} className={`${styles.island} ${overview.section}`} aria-labelledby={`island-${island.id}`}>
      <h2 id={`island-${island.id}`}>{island.name}<span>{island.englishName}</span></h2>
      <p className={styles.muted}>{island.summary}</p>
      {lessonsOfIsland(island.id).some(l => l.lessonStatus === 'planned') && <p className={styles.islandOpen}>
        已開放 {lessons.filter(l => l.islandId === island.id).length}／{lessonsOfIsland(island.id).length} 堂，{lessonsOfIsland(island.id).filter(l => l.lessonStatus === 'planned').length} 堂規劃中（尚未開放，不能點選）。</p>}
      {lessons.some(l => l.islandId === island.id && l.lessonStatus === 'complete') &&
        <IslandProgress name={island.name} lessonIds={lessons.filter(l => l.islandId === island.id && l.lessonStatus === 'complete').map(l => l.lessonId)}/>}
      {DIFFICULTIES.map(level => ({ level, own: lessons.filter(l => l.islandId === island.id && l.difficulty === level) })).filter(g => g.own.length).map(({ level, own }) => <div key={level} className={overview.level}>
      <h3 id={`island-${island.id}-${level.toLowerCase()}`}>{DIFFICULTY_LABELS[level]}<span>{own.length} 堂</span></h3>
      <ol className={styles.lessonList}>
        {own.map(l => <li key={l.lessonId} data-status={l.lessonStatus}>
          <span className={styles.lessonId}>{l.lessonId}</span>
          <div className={styles.lessonMain}>
            <Link href={`/curriculum/${l.slug}`}>{l.title}</Link>
            <span className={styles.lessonMeta}>{l.estimatedMinutes} 分鐘 · {l.apcsRelevance.map(r => APCS_LABELS[r]).join('、')}</span>
          </div>
          <span className={styles.statusTag} data-status={l.lessonStatus}>{l.lessonStatus === 'complete' ? '完整教材' : '規劃中'}</span>
          {l.lessonStatus === 'complete' ? <ProgressBadge lessonId={l.lessonId}/> : <span className={styles.progressPlaceholder} aria-hidden/>}
        </li>)}
      </ol>
      </div>)}
      {lessonsOfIsland(island.id).some(l => l.lessonStatus === 'planned') && <ol className={styles.lessonList}>
        {lessonsOfIsland(island.id).filter(l => l.lessonStatus === 'planned').map(l => <li key={l.lessonId} data-status="planned">
          <span className={styles.lessonId}>{l.lessonId}</span>
          <div className={styles.lessonMain}>
            <span className={styles.plannedTitle}>{l.title}</span>
            <span className={styles.lessonMeta}>{DIFFICULTY_LABELS[l.difficulty]} · {l.titleEn}</span>
          </div>
          <span className={styles.statusTag} data-status="planned">規劃中</span>
          <span className={styles.progressPlaceholder} aria-hidden/>
        </li>)}
      </ol>}
    </section>)}
    <PlannedIslandsOf region="cs"/>
    {orderedRegions.filter(r => r.id !== 'cs').map(r => <PlannedRegion key={r.id} region={r}/>)}
  </main>;
}
