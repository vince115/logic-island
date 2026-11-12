import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { DIFFICULTY_LABELS } from '@/content/curriculum/registry';
import { islandsInRegion, orderedRegions, regionCountZh, regionStatus } from '@/content/world';
import { CONTENT_STATUS_LABELS, contentStatusOf, lessonsOfIsland } from '@/content/world/catalog';
import type { IslandConfig, Region, RegionId } from '@/content/world/types';
import { regionHint } from '@/lib/nav/site-nav';
import { trialsEnabled } from '@/lib/trials/flag';
import overview from './catalog-overview.module.css';
import styles from './curriculum.module.css';

/*
 * Multi-archipelago v2 (P2): the regions on /curriculum (five since P6). The strip says what each region holds and how much of it
 * can be opened today; each region's section lists its planned islands with their outline folded away. Nothing here
 * links to a lesson page: planned lessons have none, so they are text marked 規劃中 (CONTENT_STATUS_LABELS).
 */

const REGION_ACCENT: Record<RegionId, string> = { cs: '#4285f4', ai: '#3949ab', design: '#d81b60', web: '#e65100', sys: '#0097a7' };

/** The regions, in order, each a link to its section on this page. */
export function RegionStrip() {
  return <nav aria-label={`${regionCountZh()}大群島`} className={overview.regions}>
    {orderedRegions.map(region => {
      const list = islandsInRegion(region.id), status = regionStatus(region.id);
      return <a key={region.id} href={`#region-${region.id}`} className={overview.region} style={{ '--island-accent': REGION_ACCENT[region.id] } as CSSProperties}>
        <small>{region.nameEn}</small>
        <strong>{region.name}</strong>
        <span>{list.length} 座主題島 · {status === 'planned' ? `${list.reduce((n, i) => n + i.lessonCount, 0)} 堂大綱` : `已開放 ${regionHint(region.id)}`}</span>
        <em className={overview.regionStatus} data-status={status}>{status === 'planned' ? '規劃中' : '部分開放'}</em>
      </a>;
    })}
  </nav>;
}

/** A planned island: what it will teach, how many lessons, and its outline folded away, every lesson 規劃中. */
function PlannedIsland({ island }: { island: IslandConfig }) {
  const outline = lessonsOfIsland(island.id);
  return <article id={`island-${island.id}`} className={overview.planned} style={{ '--island-accent': island.theme.accent } as CSSProperties} aria-labelledby={`planned-${island.id}`}>
    <div className={overview.plannedHead}>
      <span className={overview.plannedCode}>{island.code}</span>
      <h4 id={`planned-${island.id}`}>{island.name}<small>{island.nameEn}</small></h4>
      <span className={styles.statusTag} data-status="planned">規劃中</span>
    </div>
    <p className={styles.muted}>{island.description}</p>
    <details className={overview.outline}>
      <summary>查看 {outline.length} 堂課程大綱（尚未開放）</summary>
      <ol className={styles.lessonList}>
        {outline.map(l => <li key={l.lessonId} data-status="planned">
          <span className={styles.lessonId}>{l.lessonId}</span>
          <div className={styles.lessonMain}>
            <span className={styles.plannedTitle}>{l.title}</span>
            <span className={styles.lessonMeta}>{DIFFICULTY_LABELS[l.difficulty]} · {l.titleEn}</span>
          </div>
          <span className={styles.statusTag} data-status="planned">{CONTENT_STATUS_LABELS[contentStatusOf(l)]}</span>
        </li>)}
      </ol>
    </details>
  </article>;
}

const plannedOf = (region: RegionId) => islandsInRegion(region).filter(i => i.status === 'planned');

/** The planned islands of a region that also has written ones (程式與資訊群島), under its written islands. */
export function PlannedIslandsOf({ region }: { region: RegionId }) {
  const list = plannedOf(region);
  if (!list.length) return null;
  return <section className={overview.plannedSection} aria-labelledby={`planned-${region}`}>
    <h3 id={`planned-${region}`}>規劃中的主題島<span>{list.length} 座 · {list.reduce((n, i) => n + i.lessonCount, 0)} 堂大綱</span></h3>
    <div className={overview.plannedGrid}>{list.map(i => <PlannedIsland key={i.id} island={i}/>)}</div>
  </section>;
}

/** Related mock exams of a region, only in a build with the trial system; a mock exam is practice, never a lesson. */
async function RegionExams({ region }: { region: RegionId }) {
  if (!trialsEnabled() || (region !== 'cs' && region !== 'ai')) return null;
  // Loaded only in a trials build, so the default build never reads the bank; entries say which exams have papers.
  const { regionTrialEntries } = await import('@/content/trials');
  const entries = regionTrialEntries(region);
  if (!entries.length) return null;
  return <p className={overview.exams}>相關模擬考試（題目練習，不是課程）：{entries.map((e, i) => <span key={e.id}>{i > 0 && '、'}
    {e.href ? <a href={e.href}>{e.label}<ArrowRight size={12} aria-hidden/></a> : <span>{e.label}（{e.detail}）</span>}
  </span>)}</p>;
}

/** A region without written lessons: its islands (by navigation group where it has them), all planned. */
export function PlannedRegion({ region }: { region: Region }) {
  const list = plannedOf(region.id), groups = region.groups ?? [];
  const ungrouped = list.filter(i => !groups.some(g => g.islandIds.includes(i.id)));
  return <section id={`region-${region.id}`} className={overview.regionSection} style={{ '--island-accent': REGION_ACCENT[region.id] } as CSSProperties} aria-labelledby={`region-${region.id}-title`}>
    <h2 id={`region-${region.id}-title`}>{region.name}<span>{region.nameEn}</span></h2>
    {region.summary && <p className={styles.muted}>{region.summary}</p>}
    <p className={styles.islandOpen}>{islandsInRegion(region.id).length} 座主題島、{regionHint(region.id)}：只有課程大綱，教材尚未開放，不能點選。</p>
    <RegionExams region={region.id}/>
    {groups.map(g => <div key={g.id} className={overview.group}>
      <h3>{g.label}<span>{g.islandIds.length} 座島</span></h3>
      <div className={overview.plannedGrid}>{g.islandIds.map(id => list.find(i => i.id === id)).filter(Boolean).map(i => <PlannedIsland key={i!.id} island={i!}/>)}</div>
    </div>)}
    {ungrouped.length > 0 && <div className={overview.plannedGrid}>{ungrouped.map(i => <PlannedIsland key={i.id} island={i}/>)}</div>}
  </section>;
}

export { RegionExams };
