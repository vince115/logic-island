import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Route } from 'lucide-react';
import { getIsland } from '@/content/world';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { PlannedIsland, REGION_ACCENT, RegionExams } from '@/components/curriculum/region-overview';
import { regionEntries, type RegionIslandSummary, type RegionOverview } from '@/lib/world/region-overview';
import styles from './region-page.module.css';

/*
 * R6: a region's overview (/regions/<id>). What the region teaches, its islands by navigation group, the learning paths
 * that lead through it and, in a trials build only, its related mock exams. An island with published lessons links to
 * its syllabus on /curriculum; a planned island shows its outline folded away and links nowhere. Every planned item
 * says 規劃中, so nothing reads as learnable before it is.
 */

function OpenIsland({ island }: { island: RegionIslandSummary }) {
  return <article className={styles.open} style={{ '--island-accent': island.accent } as CSSProperties} aria-labelledby={`open-${island.id}`}>
    <div className={styles.openHead}>
      <span className={styles.code}>{island.code}</span>
      <h4 id={`open-${island.id}`}>{island.name}<small>{island.nameEn}</small></h4>
      <span className={styles.tag} data-status={island.published === island.lessonCount ? 'published' : 'partial'}>{island.published === island.lessonCount ? '已開放' : '部分開放'}</span>
    </div>
    <p>{island.description}</p>
    <Link href={island.href!} className={styles.openLink}>{island.published} 堂已開放 · 前往課綱<ArrowRight size={14} aria-hidden/></Link>
  </article>;
}

function IslandCard({ island }: { island: RegionIslandSummary }) {
  if (island.href) return <OpenIsland island={island}/>;
  const config = getIsland(island.id);
  return config ? <PlannedIsland island={config}/> : null;
}

export function RegionPage({ overview: o }: { overview: RegionOverview }) {
  const planned = o.status === 'planned', others = regionEntries().filter(r => r.id !== o.id);
  return <main id="main" className={`container ${styles.page}`} style={{ '--island-accent': REGION_ACCENT[o.id] } as CSSProperties}>
    <Breadcrumbs items={[{ label: '探索群島', href: '/' }, { label: '四大群島', href: '/curriculum' }, { label: o.name }]}/>
    <header className={styles.hero}>
      <span className="eyebrow">{o.nameEn} · 第 {o.order} 群島</span>
      <h1>{o.name}</h1>
      <p className={styles.stats}>
        <span><strong>{o.islandCount}</strong> 座主題島</span>
        <span><strong>{o.lessonCount}</strong> 堂課程{planned ? '大綱' : ''}</span>
        <span><strong>{o.published}</strong> 堂已開放</span>
        <em className={styles.tag} data-status={planned ? 'planned' : 'partial'}>{planned ? '規劃中' : '部分開放'}</em>
      </p>
      {planned && <p className={styles.notice} role="note">這個群島的課程還在規劃：下面是每座島的主題與課程大綱，教材尚未開放，所以沒有可以點進去的課。</p>}
      <RegionExams region={o.id}/>
    </header>

    {o.groups.map(g => <section key={g.id} className={styles.group} aria-labelledby={`group-${g.id}`}>
      <h2 id={`group-${g.id}`}>{g.label}<span>{g.islands.length} 座島 · {g.islands.reduce((n, i) => n + i.lessonCount, 0)} 堂</span></h2>
      <div className={styles.grid}>{g.islands.map(i => <IslandCard key={i.id} island={i}/>)}</div>
    </section>)}
    {o.ungrouped.length > 0 && <section className={styles.group} aria-labelledby="group-islands">
      <h2 id="group-islands">{o.groups.length ? '其他主題島' : '主題島'}<span>{o.ungrouped.length} 座島</span></h2>
      <div className={styles.grid}>{o.ungrouped.map(i => <IslandCard key={i.id} island={i}/>)}</div>
    </section>}

    {o.paths.length > 0 && <section className={styles.paths} aria-labelledby="region-paths">
      <h2 id="region-paths"><Route size={18} aria-hidden/>學習路線<span>跨島的建議順序</span></h2>
      <ul>{o.paths.map(p => <li key={p.id}>
        <strong>{p.title}<small>{p.titleEn}</small></strong>
        <p>{p.description}</p>
        {/* R7: the path's length is lessons to take, not lessons written; say how many are open and how many are not. */}
        <span className={styles.pathMeta}>路線共 {p.lessonCount} 堂 · 已開放 {p.publishedLessons} 堂{p.learnable ? '' : ` · 其餘 ${p.lessonCount - p.publishedLessons} 堂規劃中`}</span>
      </li>)}</ul>
    </section>}

    <nav className={styles.others} aria-label="其他學習群島">
      <h2>其他學習群島</h2>
      <ul>{others.map(r => <li key={r.id}><Link href={r.href} style={{ '--island-accent': REGION_ACCENT[r.id] } as CSSProperties}>
        <strong>{r.name}</strong><small>{r.islandCount} 座島 · {r.status === 'planned' ? `規劃中 ${r.lessonCount} 堂` : `已開放 ${r.published}／${r.lessonCount} 堂`}</small><ArrowRight size={14} aria-hidden/>
      </Link></li>)}</ul>
    </nav>
  </main>;
}
