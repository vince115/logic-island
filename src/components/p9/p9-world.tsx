'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import type { RegionId } from '@/content/world/types';
import { HUB_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import type { HubSummary, RegionSummary } from '@/lib/world/learning-islands';
import { SceneBoundary } from '../islands/hex-world/scene-boundary';
import status from '../islands/island-status.module.css';
import styles from '../world/world.module.css';
import type { P9WorldTarget } from './p9-world-scene';

const Scene = dynamic(() => import('./p9-world-scene'), { ssr: false, loading: () => <div className={styles.loading} role="status">正在準備世界原型…</div> });
const WIDE = '(min-width: 781px)';
const subscribe = (onChange: () => void) => { const list = matchMedia(WIDE); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };

/** The regions the prototype has built a map for. The others are drawn on the overview and listed, but open nothing yet. */
export const P9_REGIONS: readonly RegionId[] = ['cs'];
const regionDetail = (r: RegionSummary) => r.open ? `${r.islands} 座學科島 · ${r.open} 座已開放 · ${r.planned} 座規劃中` : `${r.islands} 座學科島 · 全部規劃中`;
const shortName = (name: string) => name.replace(/群島$/, '');

/**
 * P9.1 visual prototype: the world overview (/p9). The P8 overview's page, with the prototype's scene in the stage:
 * the same regions, counts and hub from the world registry, the same guide beside the map (below it on phones) as the
 * way in without WebGL. Only the regions in P9_REGIONS lead to a prototype region page; the rest say so.
 */
export function P9World({ regions, hub }: { regions: RegionSummary[]; hub: HubSummary }) {
  const router = useRouter();
  const [available, setAvailable] = useState(true);
  const unavailable = useCallback(() => setAvailable(false), []);
  const ready = useCallback(() => {}, []);
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  const targets: P9WorldTarget[] = useMemo(() => [
    ...regions.map(r => {
      const built = P9_REGIONS.includes(r.id);
      return { id: r.id, name: shortName(r.name), detail: regionDetail(r), accent: REGION_THEMES[r.id].accent,
        label: built ? `進入${r.name}（原型）` : `${r.name}：${regionDetail(r)}，原型尚未製作區域地圖`, ...(built ? { onOpen: () => router.push(`/p9/${r.id}`) } : {}) };
    }),
    { id: 'hub' as const, name: '中央樞紐', label: `前往中央樞紐：${hub.lab.name}`, detail: hub.lab.name, accent: HUB_THEME.accent, onOpen: () => router.push(hub.lab.href) },
  ], [regions, hub.lab.href, hub.lab.name, router]);
  const names = regions.map(r => r.name).join('、');
  return <section className={styles.overview} aria-label="世界總覽（P9.1 原型）">
    <div className={styles.stage}>
      {available ? <SceneBoundary onUnavailable={unavailable}>
        <Scene targets={targets} insetRight={wide ? 360 : 0} shape={wide ? 'wide' : 'tall'} onReady={ready} onUnavailable={unavailable}
          label={`Logic Island 世界總覽原型：中央樞紐與 ${regions.length} 個群島（${names}）的地形、地標與連結，亦可使用清單導航`}/>
      </SceneBoundary> : <p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。</p>}
    </div>
    <nav className={styles.guide} aria-label="世界導覽（原型）">
      <div className={styles.guideHeading}><Compass size={17}/><span>世界總覽</span><small>P9.1 · VISUAL PROTOTYPE</small></div>
      <ol className={styles.guideList}>
        {regions.map(r => {
          const built = P9_REGIONS.includes(r.id), text = <span><small>{r.nameEn}</small><strong>{r.name}</strong><em>{regionDetail(r)}</em></span>;
          return <li key={r.id} className={styles.guideRegion}>
            {built ? <Link href={`/p9/${r.id}`} className={styles.guideEntry} data-region-entry={r.id} style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}<ArrowRight size={16}/></Link>
              : <div className={styles.guideEntry} data-region-entry={r.id} data-pending="true" style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}</div>}
            {!built && <p className={styles.guidePlanned}><em className={status.plannedTag}>原型未製作</em>區域地圖留待 P9.2</p>}
          </li>;
        })}
        <li className={styles.guideHub}>
          <Link href={hub.lab.href} className={styles.guideEntry} style={{ '--region-accent': HUB_THEME.accent } as React.CSSProperties}>
            <span><small>CENTRAL HUB · SHARED</small><strong>中央樞紐 · {hub.lab.name}</strong><em>{hub.lab.description}</em></span><ArrowRight size={16}/>
          </Link>
        </li>
      </ol>
      <p className={styles.guideNote}>這是 P9.1 的視覺審查頁，不是正式的世界頁面。地形、地標與配色都是待審的提案；群島的數量、位置與橋樑沿用現有的世界資料。</p>
    </nav>
  </section>;
}
