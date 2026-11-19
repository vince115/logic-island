'use client';

import Link from 'next/link';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ENVIRONMENTS } from '@/lib/islands/environments';
import type { LearningIsland } from '@/lib/islands/types';
import { SITE_TIME_LABELS, useSiteTime } from '@/lib/site-time';
import type { HubSummary, RegionSummary } from '@/lib/world/learning-islands';
import { regionScene } from '@/lib/p9/region-scene';
import { worldFraming, worldPlan } from '@/lib/p9/world-plan';
import type { ExploreView, WorldView } from '../islands/hex-world/hex-camera';
import { HexWorldExplorer } from '../islands/hex-world/hex-world-explorer';
import { HEADER_TOOLS_ID } from '../islands/hex-world/islands-world-explorer';
import { SCENE_PRESETS, sceneOptions } from '../islands/hex-world/hex-scene-presets';
import styles from '../world/world.module.css';
import { P9WorldGuide, P9WorldLabels, worldTargets } from './p9-world-ui';

/*
 * P9.1c visual prototype: the world, the CS region and its islands are ONE scene in ONE canvas. This component lives in
 * the /p9 layout, so it stays mounted from /p9 to /p9/cs to /p9/cs?island=<id> and back: the address says the level,
 * and the camera flies there (hex-camera.tsx). Nothing is remounted, re-lit or re-loaded between levels.
 *
 *   /p9                    the world: the CS map at full detail where its miniature stood on the overview, every other
 *                          region's own scene drawn small around it (P9WorldLayer), the overview's labels and guide
 *   /p9/cs                 the CS region: the same camera flies in to the region's own view
 *   /p9/cs?island=<id>     an island: the region explorer's explore view of that island (as P9.1)
 *
 * Going up is the same flight backwards (Escape, the back button, the header's 世界總覽, the guide). With
 * prefers-reduced-motion every move is a cut, as everywhere on the site. The HTML guide and lists stay the way in
 * without WebGL, and the keyboard reaches every level.
 */
const P9Landscapes = lazy(() => import('./p9-landscapes').then(m => ({ default: m.P9Landscapes })));
const P9WorldLayer = lazy(() => import('./p9-world-layer').then(m => ({ default: m.P9WorldLayer })));
/** Phones: the camera's own phone breakpoint; under PINS the map's labels are pins (both as on /world/<region>). */
const PHONE = '(max-width: 699px)', PINS = '(max-width: 1239px)', WIDE = '(min-width: 781px)';
const watch = (query: string) => (onChange: () => void) => { const list = matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };
const subscribe = watch(PHONE), subscribePins = watch(PINS), subscribeWide = watch(WIDE);
const PHONE_PIN_REACH = 3.2, PHONE_ROOM = { top: 30, bottom: 26 } as const;
/**
 * The explore view of a focused island: from 28° above the water instead of about 40°, a tenth closer than the fit
 * that shows the whole island, and free to go down to 14° and in to three and a half times the closest island fit.
 */
export const EXPLORE: ExploreView = { elevation: 28, zoom: 1.1, minElevation: 14, zoomIn: 3.5 };
/** The camera's distance from what it looks at: far enough that the whole world is in front of the near plane. */
const WORLD_DISTANCE = 600, WORLD_FAR = 4000;

function BackToWorld() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React's tree and exists only in the DOM
  useEffect(() => { setSlot(document.getElementById(HEADER_TOOLS_ID)); }, []);
  return slot ? createPortal(<Link className={styles.backToWorld} href="/p9" scroll={false} aria-label="返回世界總覽（原型）"><ArrowLeft size={15}/><span>世界總覽</span></Link>, slot) : null;
}

export function P9Stage({ regions, hub, accents, islands, regionName, regionNameEn }: {
  regions: RegionSummary[]; hub: HubSummary; accents: Record<string, string>;
  islands: LearningIsland[]; regionName: string; regionNameEn: string;
}) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  // The level is the address: /p9 the world, /p9/cs the region (and ?island= an island of it).
  const atWorld = path === '/p9';
  const requested = atWorld ? null : params.get('island');
  const selectedId = requested && islands.some(i => i.id === requested) ? requested : null;
  const go = useCallback((href: string) => router.push(href, { scroll: false }), [router]);
  const withIsland = useCallback((id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('island', id); else next.delete('island');
    const query = next.toString();
    return query ? `/p9/cs?${query}` : '/p9/cs';
  }, [params]);
  useEffect(() => { if (requested && !selectedId) router.replace(withIsland(null), { scroll: false }); }, [requested, selectedId, router, withIsland]);
  // A choice on the map: on the world, any CS island leads into the region first; on the region, to that island.
  const change = useCallback((id: string | null) => {
    if (atWorld) { if (id) go('/p9/cs'); return; }
    if (id === selectedId) return;
    go(withIsland(id));
  }, [atWorld, go, withIsland, selectedId]);
  // Escape goes one level up: island → region → world (nothing above the world).
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || atWorld) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (selectedId) { returnTo.current = selectedId; change(null); } else go('/p9');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [atWorld, selectedId, change, go]);
  useEffect(() => {
    const id = returnTo.current;
    if (selectedId || !id) return;
    returnTo.current = null;
    const name = islands.find(i => i.id === id)?.name;
    let frames = 30;
    const seek = () => {
      const label = document.querySelector<HTMLElement>(`button[aria-label^="聚焦${name}"]`);
      if (!label && --frames > 0 && document.querySelector('canvas')) { frame = requestAnimationFrame(seek); return; }
      (label ?? document.querySelector<HTMLElement>(`[data-island-choice="${id}"]`))?.focus({ preventScroll: true });
    };
    let frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
  }, [selectedId, islands]);
  const phone = useSyncExternalStore(subscribe, () => matchMedia(PHONE).matches, () => false);
  const pins = useSyncExternalStore(subscribePins, () => matchMedia(PINS).matches, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(WIDE).matches, () => false);
  const time = useSiteTime();
  // The world around the region: the overview's own plan for this screen shape (world-plan.ts).
  const plan = useMemo(() => worldPlan(wide ? 'wide' : 'tall'), [wide]);
  const [settled, setSettled] = useState(atWorld);
  const targets = useMemo(() => worldTargets(regions, hub, go), [regions, hub, go]);
  const frameWorld = useCallback<WorldView['frame']>((size, insetRight) => {
    const { center, zoom } = worldFraming(plan, size, insetRight);
    return { center, zoom };
  }, [plan]);
  // The region's scene definition, the one the world draws at its place.
  const scene = regionScene('cs'), { layout, camera } = scene.region;
  const regionAccents = useMemo(() => Object.fromEntries(islands.map(i => [i.id, i.accent])), [islands]);
  const openHub = useCallback(() => go(hub.lab.href), [go, hub.lab.href]);
  const names = regions.map(r => r.name).join('、');
  const options = useMemo(() => ({
    ...sceneOptions(layout, SCENE_PRESETS.lab), labelReach: pins ? PHONE_PIN_REACH : camera.labelReach, largeTargets: true, mapControls: true, phoneRoom: PHONE_ROOM, pins, ownLayer: true,
    extras: <Suspense fallback={null}>
      <P9Landscapes world={layout.world} landscapes={scene.landscapes} accents={regionAccents}/>
      <P9WorldLayer plan={plan} seaTint={ENVIRONMENTS[time].sea.tint} accents={accents} onOpenHub={openHub}/>
    </Suspense>,
    explore: EXPLORE,
    world: {
      active: atWorld, frame: frameWorld, distance: WORLD_DISTANCE, far: WORLD_FAR, onSettled: setSettled,
      caption: <><span>P9.1 · LOGIC ISLAND WORLD</span><strong>世界總覽<small className={styles.captionStats}>{`中央樞紐與 ${regions.length} 個群島`}</small></strong></>,
      panel: <P9WorldGuide regions={regions} hub={hub}/>,
      overlay: (insetRight: number) => atWorld ? <P9WorldLabels plan={plan} targets={targets} insetRight={insetRight} settled={settled} time={time}/> : null,
    },
  }), [layout, camera, pins, regionAccents, scene, plan, time, accents, openHub, atWorld, frameWorld, regions, hub, targets, settled]);
  const open = islands.filter(i => !i.planned).length, planned = islands.length - open;
  return <>
    {!atWorld && <BackToWorld/>}
    <HexWorldExplorer islands={islands} world={layout.world} options={options} poiPanel captionAbove controlsBelow
      layout="fullscreen" modeSwitchTarget={HEADER_TOOLS_ID} selectedId={selectedId} onSelectedChange={change}
      baseAzimuth={camera.azimuth[phone ? 'phone' : 'desktop']}
      listMore={<nav className={styles.regionMore} aria-label={`${regionName}以外`}>
        <p>{regionName}共 {islands.length} 座學科島。這是 P9.1 的視覺審查頁；課程、導覽與島嶼資料與正式頁面相同。</p>
        <ul>
          <li><Link href={hub.lab.href}><span><small>共用 · 中央樞紐</small><strong>{hub.lab.name}</strong><em>{hub.lab.labs} 個互動實驗</em></span><ArrowRight size={15}/></Link></li>
          <li><Link href="/p9" scroll={false}><span><small>原型</small><strong>世界總覽</strong></span><ArrowRight size={15}/></Link></li>
          <li><Link href="/regions/cs"><span><small>不需 3D</small><strong>{regionName}清單總覽</strong></span><ArrowRight size={15}/></Link></li>
        </ul>
      </nav>}
      copy={{
        section: atWorld ? '世界總覽（P9.1 原型）' : `${regionName}地圖（P9.1 原型）`, overview: `${regionName}全景`, tag: 'P9.1 VISUAL PROTOTYPE',
        eyebrow: `P9.1 · ${regionNameEn.toUpperCase()}`,
        title: <>{regionName}<small className={styles.captionStats}>{`${open} 座已開放 · ${planned} 座規劃中`}</small></>,
        hint: atWorld ? '點擊群島或名牌進入 · 拖曳旋轉 · 滾輪縮放' : phone ? '單指左右旋轉 · 雙指縮放與平移 · 點選島嶼探索' : pins ? '拖曳旋轉 · 滾輪縮放 · 點擊島嶼或圖釘探索 · Esc 返回上一層' : '拖曳旋轉 · 右鍵拖曳或方向鍵平移 · 滾輪縮放 · 點擊島嶼或名牌探索 · Esc 返回上一層',
        canvas: `Logic Island 世界原型（${SITE_TIME_LABELS[time]}）：中央樞紐與 ${regions.length} 個群島（${names}）；${regionName}有 ${islands.length} 座學科島（${open} 座已開放、${planned} 座規劃中），亦可使用場景外的清單導航`,
        loading: { title: '正在準備世界原型…', note: '也可以先使用清單選擇群島或島嶼。' },
      }}/>
  </>;
}
