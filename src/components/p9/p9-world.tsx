'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { canvasSlot } from '../islands/hex-world/canvas-slot';
import { ArrowRight, Compass } from 'lucide-react';
import { REGION_IDS, type RegionId } from '@/content/world/types';
import { p9RegionHref } from '@/lib/p9/routes';
import { HUB_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import { SITE_TIME_LABELS, useSiteTime } from '@/lib/site-time';
import type { HubSummary, RegionSummary } from '@/lib/world/learning-islands';
import { SceneBoundary } from '../islands/hex-world/scene-boundary';
import status from '../islands/island-status.module.css';
import styles from '../world/world.module.css';
import type { P9WorldTarget } from './p9-world-scene';
import { loadWorldScene } from './p9-scene-loaders';
import { useFocusOnLoss } from './use-focus-on-loss';

const Scene = dynamic(loadWorldScene, { ssr: false, loading: () => <div className={styles.loading} role="status">正在準備世界群島…</div> });
const WIDE = '(min-width: 781px)';
const subscribe = (onChange: () => void) => { const list = matchMedia(WIDE); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };

/** The regions with a P9 map page (/<region>): all five; CS has the P9 land and landmarks, the others their approved maps. */
export const P9_REGIONS: readonly RegionId[] = REGION_IDS;
const regionDetail = (r: RegionSummary) => r.open ? `${r.islands} 座學科島 · ${r.open} 座已開放 · ${r.planned} 座規劃中` : `${r.islands} 座學科島 · 全部規劃中`;
const shortName = (name: string) => name.replace(/群島$/, '');

/**
 * P9.1 visual prototype: the world overview (/p9). The P8 overview's page, with the prototype's scene in the stage
 * (P9.1b: every region drawn from its own Region Scene Definition, in the site's time of day):
 * the same regions, counts and hub from the world registry, the same guide beside the map (below it on phones) as the
 * way in without WebGL. Only the regions in P9_REGIONS lead to a prototype region page; the rest say so.
 */
export function P9World({ regions, hub, accents, sharedCanvas = false }: { regions: RegionSummary[]; hub: HubSummary;
  /** Every subject island's accent, by island id (the registry's), for what the regions' scenes draw in it. */
  accents: Record<string, string>;
  /** P9.8c: the scene draws in the canvas shared with the CS page (p9-world-scene.tsx `sharedCanvas`). */
  sharedCanvas?: boolean }) {
  const router = useRouter();
  const [ownAvailable, setAvailable] = useState(true);
  // P9.8c: a shared canvas that lost its WebGL context is lost for this page too, also when it was lost on the CS page.
  const sharedLost = useSyncExternalStore(canvasSlot.subscribe, () => sharedCanvas && canvasSlot.lost(), () => false);
  const available = ownAvailable && !sharedLost;
  const retry = useCallback(() => { canvasSlot.retry(); setAvailable(true); }, []);
  const lostNotice = useFocusOnLoss<HTMLDivElement>(Boolean(sharedLost));
  const unavailable = useCallback(() => setAvailable(false), []);
  const ready = useCallback(() => {}, []);
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  // P9.1b: the site's time of day (the header's time button), the one every island scene draws.
  const time = useSiteTime();
  const targets: P9WorldTarget[] = useMemo(() => [
    ...regions.map(r => {
      const built = P9_REGIONS.includes(r.id);
      return { id: r.id, name: shortName(r.name), detail: regionDetail(r), accent: REGION_THEMES[r.id].accent,
        label: built ? `進入${r.name}` : `${r.name}：${regionDetail(r)}`, ...(built ? { onOpen: () => router.push(p9RegionHref(r.id)), href: p9RegionHref(r.id) } : {}) };
    }),
    { id: 'hub' as const, name: '中央樞紐', label: `前往中央樞紐：${hub.lab.name}`, detail: hub.lab.name, accent: HUB_THEME.accent, onOpen: () => router.push(hub.lab.href), href: hub.lab.href },
  ], [regions, hub.lab.href, hub.lab.name, router]);
  const names = regions.map(r => r.name).join('、');
  return <section className={styles.overview} aria-label="世界總覽">
    <div className={styles.stage}>
      {available ? <SceneBoundary onUnavailable={unavailable}>
        <Scene targets={targets} insetRight={wide ? 360 : 0} shape={wide ? 'wide' : 'tall'} environmentId={time} accents={accents} onReady={ready} onUnavailable={unavailable}
          label={`Logic Island 互動學習群島（${SITE_TIME_LABELS[time]}）：中央樞紐與 ${regions.length} 個群島（${names}）各自的島嶼、橋樑與地標，亦可使用清單導航`} sharedCanvas={sharedCanvas}/>
      </SceneBoundary> : <div ref={lostNotice} className={styles.fallbackNotice} role="status" tabIndex={-1}>
        <p>此裝置的 3D 場景無法使用，已切換至清單導航：請使用下方的「世界導覽」進入各群島。</p>
        {/* P9.8c: a shared canvas whose context was lost comes back only when asked (never by itself). */}
        {sharedLost && <button type="button" onClick={retry}>重新載入 3D 地圖</button>}
      </div>}
    </div>
    <nav className={styles.guide} aria-label="世界導覽">
      <div className={styles.guideHeading}><Compass size={17}/><span>世界總覽</span><small>Logic Island — 互動學習群島</small></div>
      <ol className={styles.guideList}>
        {regions.map(r => {
          const built = P9_REGIONS.includes(r.id), text = <span><small>{r.nameEn}</small><strong>{r.name}</strong><em>{regionDetail(r)}</em></span>;
          return <li key={r.id} className={styles.guideRegion}>
            {built ? <Link href={p9RegionHref(r.id)} className={styles.guideEntry} data-region-entry={r.id} style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}<ArrowRight size={16}/></Link>
              : <div className={styles.guideEntry} data-region-entry={r.id} data-pending="true" style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}</div>}
            {!built && <p className={styles.guidePlanned}><em className={status.plannedTag}>規劃中</em>區域地圖尚未開放</p>}
          </li>;
        })}
        <li className={styles.guideHub}>
          <Link href={hub.lab.href} className={styles.guideEntry} style={{ '--region-accent': HUB_THEME.accent } as React.CSSProperties}>
            <span><small>CENTRAL HUB · SHARED</small><strong>中央樞紐 · {hub.lab.name}</strong><em>{hub.lab.description}</em></span><ArrowRight size={16}/>
          </Link>
        </li>
      </ol>
      <p className={styles.guideNote}>每個群島都是該區域地圖的縮影：島嶼、橋樑與地標都來自同一份區域資料。頁首的時間按鈕切換清晨、中午、黃昏、傍晚，進入區域與島嶼後維持同一個時段。</p>
    </nav>
  </section>;
}
