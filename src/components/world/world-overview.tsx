'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import type { RegionTrialEntry } from '@/content/trials';
import type { RegionId } from '@/content/world/types';
import { HUB_THEME, LINK_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import type { HubSummary, RegionSummary, UnmappedRegionSummary } from '@/lib/world/learning-islands';
import { RegionTrials } from '../trials/region-trials';
import { SceneBoundary } from '../islands/hex-world/scene-boundary';
import status from '../islands/island-status.module.css';
import { WORLD_RETURN_KEY } from './regional-world-explorer';
import type { OverviewTarget } from './world-overview-scene';
import styles from './world.module.css';

const Scene = dynamic(() => import('./world-overview-scene'), { ssr: false, loading: () => <div className={styles.loading} role="status">正在準備世界總覽…</div> });
const WIDE = '(min-width: 781px)';
const subscribe = (onChange: () => void) => { const list = matchMedia(WIDE); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };

// The trial pages type their regions themselves (src/content/trials); the world only passes its own id through.
type TrialRegion = React.ComponentProps<typeof RegionTrials>['regionId'];
const regionDetail = (r: RegionSummary) => r.open ? `${r.islands} 座學科島 · ${r.open} 座已開放 · ${r.planned} 座規劃中` : `${r.islands} 座學科島 · 全部規劃中`;
/** The map label's short name: the region without its 「群島」, which every region shares. */
const shortName = (name: string) => name.replace(/群島$/, '');

/**
 * World overview (/world): every region with a 3D map around the hub. The 3D outlines are one way in; the guide beside
 * them (below on phones) is the other and the only one without WebGL, and every entry of one is in the other.
 * P8.2: the regions, their order and their counts come from the world registry through `regions`; this component and
 * its scene name no region. A region without a 3D layout (`unmapped`) is listed in the guide only, marked 規劃中, and
 * leads to its 2D overview. Each mapped region's guide entry also offers that 2D overview, the way in without WebGL.
 * P8.3 (D7): the guide also says in words what the map draws between the outlines: the hub's link to every region and
 * the relation bridges between neighbouring regions (WORLD_MAP), so the topology does not depend on seeing the 3D map.
 */
export function WorldOverview({ regions, unmapped = [], hub, trials }: { regions: RegionSummary[]; unmapped?: UnmappedRegionSummary[]; hub: HubSummary; trials?: Partial<Record<RegionId, RegionTrialEntry[]>> }) {
  const router = useRouter();
  const [available, setAvailable] = useState(true);
  const unavailable = useCallback(() => setAvailable(false), []);
  const ready = useCallback(() => {}, []);
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  // Stable, so the scene places its labels once per framing.
  const targets: OverviewTarget[] = useMemo(() => [
    ...regions.map(r => ({ id: r.id, name: shortName(r.name), label: `進入${r.name}`, detail: regionDetail(r), accent: REGION_THEMES[r.id].accent, onOpen: () => router.push(r.href) })),
    // Five causeways meet at the hub, so its label is short enough to stand between them: what it is and which island
    // (phones: the name alone). The guide says the rest: a tool island every region shares.
    { id: 'hub' as const, name: '中央樞紐', label: `前往中央樞紐：${hub.lab.name}`, detail: hub.lab.name, accent: HUB_THEME.accent, onOpen: () => router.push(hub.lab.href) },
  ], [regions, hub.lab.href, hub.lab.name, router]);
  // P8.4 visual review (this prototype only): `/world?without=web-sys` draws the map without the named links; the
  // guide and the world map's data do not change.
  const [without, setWithout] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser, and the page is prerendered
  useEffect(() => { setWithout(new URLSearchParams(location.search).get('without') ?? ''); }, []);
  const names = regions.map(r => r.name).join('、');
  // The relation bridges between regions that are on the map, by name.
  const bridges = WORLD_MAP.bridges.flatMap(b => { const [a, z] = b.between.map(id => regions.find(r => r.id === id)); return a && z ? [{ id: b.id, a, z }] : []; });
  // P8.2 focus management: reached from a region (Escape or its 世界總覽 link), the keyboard focus goes to that region's
  // entry in the guide, so the three levels can be walked up and down without losing the place.
  useEffect(() => {
    let from: string | null = null;
    try { from = sessionStorage.getItem(WORLD_RETURN_KEY); sessionStorage.removeItem(WORLD_RETURN_KEY); } catch { /* no storage */ }
    if (from) document.querySelector<HTMLElement>(`[data-region-entry="${from}"]`)?.focus({ preventScroll: true });
  }, []);
  return <section className={styles.overview} aria-label="世界總覽">
    <div className={styles.stage}>
      {available ? <SceneBoundary onUnavailable={unavailable}>
        <Scene targets={targets} insetRight={wide ? 360 : 0} shape={wide ? 'wide' : 'tall'} label={`Logic Island 世界總覽：中央樞紐以樞紐橋連接 ${regions.length} 個群島（${names}），相鄰群島之間有 ${bridges.length} 座關聯橋，亦可使用清單導航`} onReady={ready} onUnavailable={unavailable} without={without}/>
      </SceneBoundary> : <p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。所有區域與教材仍可開啟。</p>}
    </div>
    <nav className={styles.guide} aria-label="世界導覽">
      <div className={styles.guideHeading}><Compass size={17}/><span>世界總覽</span><small>{String(regions.length + unmapped.length).padStart(2, '0')} REGIONS · PROTOTYPE</small></div>
      <ol className={styles.guideList}>
        {regions.map(r => <li key={r.id} className={styles.guideRegion}><Link href={r.href} className={styles.guideEntry} data-region-entry={r.id} style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>
          <span><small>{r.nameEn}</small><strong>{r.name}</strong><em>{regionDetail(r)}</em></span><ArrowRight size={16}/>
        </Link>
        <Link href={`/regions/${r.id}`} className={styles.guideAlt}>{r.name}的清單總覽（不需 3D）</Link>
        {trials?.[r.id] && <RegionTrials regionId={r.id as TrialRegion} regionName={r.name} entries={trials[r.id]!}/>}</li>)}
        {unmapped.map(r => <li key={r.id} className={styles.guideRegion}>
          <Link href={`/regions/${r.id}`} className={styles.guideEntry} style={{ '--region-accent': 'var(--muted)' } as React.CSSProperties}>
            <span><small>{r.nameEn}</small><strong>{r.name}</strong><em><span className={status.plannedTag}>規劃中</span> {r.islands} 座主題島 · {r.lessons} 堂大綱 · 尚無 3D 地圖</em></span><ArrowRight size={16}/>
          </Link>
        </li>)}
        <li className={styles.guideHub}>
          <Link href={hub.lab.href} className={styles.guideEntry} style={{ '--region-accent': HUB_THEME.accent } as React.CSSProperties}>
            <span><small>CENTRAL HUB · SHARED</small><strong>中央樞紐 · {hub.lab.name}</strong><em>{hub.lab.description}</em></span><ArrowRight size={16}/>
          </Link>
          {/* Phase F.6 plans it; no route exists, so it is named and nothing more. */}
          <p className={styles.guidePlanned}><em className={status.plannedTag}>規劃中</em>中央挑戰島（APCS Trial、AI Capstone）尚未開放</p>
        </li>
      </ol>
      <section className={styles.guideLinks} aria-label="世界橋樑" style={{ '--link-hub': LINK_THEME.hub, '--link-relation': LINK_THEME.relation } as React.CSSProperties}>
        <strong>世界橋樑</strong>
        <ul>
          <li data-link="hub"><i aria-hidden="true"/><span><b>樞紐橋</b>中央樞紐通往全部 {regions.length} 個群島</span></li>
          <li data-link="relation"><i aria-hidden="true"/><span><b>關聯橋</b>相鄰且課程相關的群島：{bridges.map(b => `${shortName(b.a.name)} ↔ ${shortName(b.z.name)}`).join('、')}</span></li>
        </ul>
        <p>沒有關聯橋相連的群島，經中央樞紐前往。</p>
      </section>
      <p className={styles.guideNote}>選一個群島進入區域地圖；每座島的教材狀態以課綱為準，「規劃中」的島還沒有可開啟的課程。互動實驗島是各群島共用的工具島，不屬於任何一個群島。</p>
    </nav>
  </section>;
}
