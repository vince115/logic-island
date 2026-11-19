'use client';

import Link from 'next/link';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { LearningIsland } from '@/lib/islands/types';
import { regionScene } from '@/lib/p9/region-scene';
import { P9_WORLD_HREF } from '@/lib/p9/routes';
import type { RegionId } from '@/content/world/types';
import { P9_REGION_BASE_AZIMUTH } from '@/lib/p9/camera-heading';
import type { ExploreView } from '../islands/hex-world/hex-camera';
import { HexWorldExplorer } from '../islands/hex-world/hex-world-explorer';
import { HEADER_TOOLS_ID } from '../islands/hex-world/islands-world-explorer';
import { SCENE_PRESETS, sceneOptions } from '../islands/hex-world/hex-scene-presets';
import styles from '../world/world.module.css';

/*
 * P9.1 visual prototype: the CS region's map (/p9/cs), the region page of /world/cs with the prototype's layout. The
 * same shared hex explorer, the same address rules as the regional world (`?island=<id>` is the focused island,
 * choosing one pushes it, an unknown id is dropped, Escape goes one level up: island → region → the prototype's world
 * overview), the same list, sheet and keyboard handling. What differs: the four planned islands' land and landscapes
 * (the region's scene definition, src/lib/p9/region-scene.ts) and how a focused island is looked at (EXPLORE). Review page only.
 */
// Loaded with the scene, not with the page: the landscapes build three.js geometry, which the page's own script never needs.
const P9Landscapes = lazy(() => import('./p9-landscapes').then(m => ({ default: m.P9Landscapes })));
/** Phones: the camera's own phone breakpoint; under PINS the map's labels are pins (both as on /world/<region>). */
const PHONE = '(max-width: 699px)', PINS = '(max-width: 1239px)';
const watch = (query: string) => (onChange: () => void) => { const list = matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };
const subscribe = watch(PHONE), subscribePins = watch(PINS);
const PHONE_PIN_REACH = 3.2, PHONE_ROOM = { top: 30, bottom: 26 } as const;
/**
 * The explore view of a focused island: from 28° above the water instead of about 40°, a tenth closer than the fit
 * that shows the whole island, and free to go down to 14° and in to three and a half times the closest island fit.
 * Numbers for review, tried on the foundations island.
 */
export const EXPLORE: ExploreView = { elevation: 28, zoom: 1.1, minElevation: 14, zoomIn: 3.5 };

function BackToWorld() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React's tree and exists only in the DOM
  useEffect(() => { setSlot(document.getElementById(HEADER_TOOLS_ID)); }, []);
  return slot ? createPortal(<Link className={styles.backToWorld} href={P9_WORLD_HREF} aria-label="返回世界總覽"><ArrowLeft size={15}/><span>世界總覽</span></Link>, slot) : null;
}

export function P9RegionExplorer({ regionId, regionName, regionNameEn, islands, hub }: { regionId: RegionId; regionName: string; regionNameEn: string; islands: LearningIsland[]; hub: { name: string; href: string; labs: number } }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const requested = params.get('island');
  const selectedId = requested && islands.some(i => i.id === requested) ? requested : null;
  const withIsland = useCallback((id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('island', id); else next.delete('island');
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  }, [params, path]);
  useEffect(() => { if (requested && !selectedId) router.replace(withIsland(null), { scroll: false }); }, [requested, selectedId, router, withIsland]);
  const change = useCallback((id: string | null) => {
    if (id === selectedId) return;
    router.push(withIsland(id), { scroll: false });
  }, [router, withIsland, selectedId]);
  // The island whose entry takes the focus once it is no longer the focused island (Escape), as on /world/<region>.
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (selectedId) { returnTo.current = selectedId; change(null); } else router.push(P9_WORLD_HREF);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selectedId, change, router]);
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
  // P9.1b: the region's scene definition, the one the world overview draws small.
  const scene = regionScene(regionId), { layout, camera } = scene.region;
  const accents = useMemo(() => Object.fromEntries(islands.map(i => [i.id, i.accent])), [islands]);
  const options = useMemo(() => ({
    ...sceneOptions(layout, SCENE_PRESETS.lab), labelReach: pins ? PHONE_PIN_REACH : camera.labelReach, largeTargets: true, mapControls: true, phoneRoom: PHONE_ROOM, pins, ownLayer: true,
    extras: <Suspense fallback={null}><P9Landscapes world={layout.world} landscapes={scene.landscapes} accents={accents}/></Suspense>, explore: EXPLORE,
  }), [layout, camera, pins, accents, scene]);
  const open = islands.filter(i => !i.planned).length, planned = islands.length - open;
  return <>
    <BackToWorld/>
    <HexWorldExplorer islands={islands} world={layout.world} options={options} poiPanel captionAbove controlsBelow
      layout="fullscreen" modeSwitchTarget={HEADER_TOOLS_ID} selectedId={selectedId} onSelectedChange={change}
      baseAzimuth={P9_REGION_BASE_AZIMUTH}
      listMore={<nav className={styles.regionMore} aria-label={`${regionName}以外`}>
        <p>{regionName}共 {islands.length} 座學科島。這是 P9.1 的視覺審查頁；課程、導覽與島嶼資料與正式頁面相同。</p>
        <ul>
          <li><Link href={hub.href}><span><small>共用 · 中央樞紐</small><strong>{hub.name}</strong><em>{hub.labs} 個互動實驗</em></span><ArrowRight size={15}/></Link></li>
          <li><Link href={P9_WORLD_HREF}><span><small>世界</small><strong>世界總覽</strong></span><ArrowRight size={15}/></Link></li>
          <li><Link href={`/regions/${regionId}`}><span><small>不需 3D</small><strong>{regionName}清單總覽</strong></span><ArrowRight size={15}/></Link></li>
        </ul>
      </nav>}
      copy={{
        section: `${regionName}地圖（P9.1 原型）`, overview: `${regionName}全景`, tag: 'P9.1 VISUAL PROTOTYPE',
        eyebrow: `P9.1 · ${regionNameEn.toUpperCase()}`,
        title: <>{regionName}<small className={styles.captionStats}>{`${open} 座已開放 · ${planned} 座規劃中`}</small></>,
        hint: phone ? '單指左右旋轉 · 雙指縮放與平移 · 點選島嶼探索' : pins ? '拖曳旋轉 · 滾輪縮放 · 點擊島嶼或圖釘探索 · Esc 返回上一層' : '拖曳旋轉 · 右鍵拖曳或方向鍵平移 · 滾輪縮放 · 點擊島嶼或名牌探索 · Esc 返回上一層',
        canvas: `${regionName}原型：${islands.length} 座學科島（${open} 座已開放、${planned} 座規劃中），亦可使用場景外的清單導航`,
        loading: { title: `正在準備${regionName}…`, note: '也可以先使用清單選擇島嶼。' },
      }}/>
  </>;
}
