'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import type { RegionTrialEntry } from '@/content/trials';
import type { RegionSummary, UnmappedRegionSummary } from '@/lib/world/learning-islands';
import { RegionTrials } from '../trials/region-trials';
import { SceneBoundary } from '../islands/hex-world/scene-boundary';
import status from '../islands/island-status.module.css';
import type { OverviewTarget } from './world-overview-scene';
import styles from './world.module.css';

const Scene = dynamic(() => import('./world-overview-scene'), { ssr: false, loading: () => <div className={styles.loading} role="status">正在準備世界總覽…</div> });
const WIDE = '(min-width: 781px)';
const subscribe = (onChange: () => void) => { const list = matchMedia(WIDE); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };
const ACCENT = { cs: '#4285f4', ai: '#3949ab' } as const;
const HUB_ACCENT = '#8a4fd1';

const regionDetail = (r: RegionSummary) => r.open ? `${r.islands} 座學科島 · ${r.open} 座已開放 · ${r.planned} 座規劃中` : `${r.islands} 座學科島 · 全部規劃中`;

/**
 * M3.1 world overview (/world): the two regions and the hub. The 3D outlines are one way in; the guide beside them
 * (below on phones) is the other and the only one without WebGL, and every entry of one is in the other.
 * Multi-archipelago v2 (P3): regions without a 3D layout (design, web) are listed in the guide only, marked 規劃中, and
 * lead to their outline on /curriculum; no model, map or empty page stands in for them.
 */
export function WorldOverview({ regions, unmapped = [], hub, trials }: { regions: RegionSummary[]; unmapped?: UnmappedRegionSummary[]; hub: { lab: { name: string; description: string; href: '/learn'; accent: string } }; trials?: Record<'cs' | 'ai', RegionTrialEntry[]> }) {
  const router = useRouter();
  const [available, setAvailable] = useState(true);
  const unavailable = useCallback(() => setAvailable(false), []);
  const ready = useCallback(() => {}, []);
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  // Stable, so the scene places its labels once per framing.
  const targets: OverviewTarget[] = useMemo(() => [
    ...regions.map(r => ({ id: r.id, label: `進入${r.name}`, detail: regionDetail(r), accent: ACCENT[r.id], onOpen: () => router.push(r.href) })),
    { id: 'hub' as const, label: '前往中央樞紐：互動實驗島', detail: '跨學科共用的工具島', accent: HUB_ACCENT, onOpen: () => router.push(hub.lab.href) },
  ], [regions, hub.lab.href, router]);
  return <section className={styles.overview} aria-label="世界總覽">
    <div className={styles.stage}>
      {available ? <SceneBoundary onUnavailable={unavailable}>
        <Scene targets={targets} insetRight={wide ? 360 : 0} shape={wide ? 'wide' : 'tall'} label="Logic Island 世界總覽：程式與資訊群島、中央樞紐與 AI 人工智慧群島，亦可使用清單導航" onReady={ready} onUnavailable={unavailable}/>
      </SceneBoundary> : <p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。所有區域與教材仍可開啟。</p>}
    </div>
    <nav className={styles.guide} aria-label="世界導覽">
      <div className={styles.guideHeading}><Compass size={17}/><span>世界總覽</span><small>REGIONAL WORLD · PROTOTYPE</small></div>
      <ol className={styles.guideList}>
        {regions.map(r => <li key={r.id} className={styles.guideRegion}><Link href={r.href} className={styles.guideEntry} style={{ '--region-accent': ACCENT[r.id] } as React.CSSProperties}>
          <span><small>{r.nameEn}</small><strong>{r.name}</strong><em>{regionDetail(r)}</em></span><ArrowRight size={16}/>
        </Link>{trials && <RegionTrials regionId={r.id} regionName={r.name} entries={trials[r.id]}/>}</li>)}
        {unmapped.map(r => <li key={r.id} className={styles.guideRegion}>
          <Link href={`/regions/${r.id}`} className={styles.guideEntry} style={{ '--region-accent': 'var(--muted)' } as React.CSSProperties}>
            <span><small>{r.nameEn}</small><strong>{r.name}</strong><em><span className={status.plannedTag}>規劃中</span> {r.islands} 座主題島 · {r.lessons} 堂大綱 · 尚無 3D 地圖</em></span><ArrowRight size={16}/>
          </Link>
        </li>)}
        <li className={styles.guideHub}>
          <Link href={hub.lab.href} className={styles.guideEntry} style={{ '--region-accent': HUB_ACCENT } as React.CSSProperties}>
            <span><small>CENTRAL HUB</small><strong>中央樞紐 · {hub.lab.name}</strong><em>{hub.lab.description}</em></span><ArrowRight size={16}/>
          </Link>
          {/* Phase F.6 plans it; no route exists, so it is named and nothing more. */}
          <p className={styles.guidePlanned}><em className={status.plannedTag}>規劃中</em>中央挑戰島（APCS Trial、AI Capstone）尚未開放</p>
        </li>
      </ol>
      <p className={styles.guideNote}>選一個群島進入區域地圖；每座島的教材狀態以課綱為準，「規劃中」的島還沒有可開啟的課程。</p>
    </nav>
  </section>;
}
