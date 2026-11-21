'use client';

import Link from 'next/link';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { LearningIsland } from '@/lib/islands/types';
import { regionScene } from '@/lib/p9/region-scene';
import { PHONE_PIN_REACH, PHONE_ROOM } from '@/lib/p9/region-layout';
import { loadLandscapes, loadedLandscapes } from './p9-scene-loaders';
import { loadWorldScene } from './world-scene-loader';
import { regionFrame } from '@/lib/p9/world-placements';
import { canvasSlot } from '../islands/hex-world/canvas-slot';
import { P9_WORLD_HREF } from '@/lib/p9/routes';
import type { RegionId } from '@/content/world/types';
import type { PopulationConfig } from '@/lib/presence/population';
import { P9_REGION_BASE_AZIMUTH } from '@/lib/p9/camera-heading';
import type { CameraHandover, ExploreView } from '../islands/hex-world/hex-camera';
import { HexWorldExplorer } from '../islands/hex-world/hex-world-explorer';
import { HEADER_TOOLS_ID } from '../islands/hex-world/islands-world-explorer';
import { SCENE_PRESETS, sceneOptions } from '../islands/hex-world/hex-scene-presets';
import styles from '../world/world.module.css';
import { useFocusOnLoss } from './use-focus-on-loss';

/*
 * P9.1 visual prototype: the CS region's map (/p9/cs), the region page of /world/cs with the prototype's layout. The
 * same shared hex explorer, the same address rules as the regional world (`?island=<id>` is the focused island,
 * choosing one pushes it, an unknown id is dropped, Escape goes one level up: island → region → the prototype's world
 * overview), the same list, sheet and keyboard handling. What differs: the four planned islands' land and landscapes
 * (the region's scene definition, src/lib/p9/region-scene.ts) and how a focused island is looked at (EXPLORE). Review page only.
 */
// Loaded with the scene, not with the page: the landscapes build three.js geometry, which the page's own script never needs.
// P9.8a: once the module has loaded (the world overview loads it before a flight), the lazy component resolves at once
// (a settled thenable, which React.lazy accepts), so the map's first frame has its landmarks; otherwise Suspense waits
// for them and holds their reveal back (about 300 ms), and they pop in after the rest of the map.
const P9Landscapes = lazy(() => {
  const loaded = loadedLandscapes();
  if (!loaded) return loadLandscapes().then(m => ({ default: m.P9Landscapes }));
  const resolved = { default: loaded.P9Landscapes };
  return { then: (resolve: (value: typeof resolved) => void) => resolve(resolved) } as unknown as Promise<typeof resolved>;
});
// Dynamic Island Population: the map's figures, downloaded only by a page whose build chose a population source.
const P9Population = lazy(() => import('./p9-population'));
/** Phones: the camera's own phone breakpoint; under PINS the map's labels are pins (both as on /world/<region>). */
const PHONE = '(max-width: 699px)', PINS = '(max-width: 1239px)';
const watch = (query: string) => (onChange: () => void) => { const list = matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };
const subscribe = watch(PHONE), subscribePins = watch(PINS);
/** P9.8c: the world overview's layout breakpoint (p9-world.tsx WIDE), which decides where this region sits in the world's space. */
const WIDE = '(min-width: 781px)', subscribeWide = watch(WIDE);
/**
 * The explore view of a focused island: from 28° above the water instead of about 40°, a tenth closer than the fit
 * that shows the whole island, and free to go down to 14° and in to three and a half times the closest island fit.
 * Numbers for review, tried on the foundations island.
 */
export const EXPLORE: ExploreView = { elevation: 28, zoom: 1.1, minElevation: 14, zoomIn: 3.5 };

/**
 * P9.8b review and test hook: `?handover=tx,ty,tz,zoom,azimuth,polar` (scene space; angles in degrees) starts the map's
 * camera from that pose (hex-camera.tsx `handover`), the way a shared canvas will hand one over in P9.8c. The region
 * pages exist only in a build with LOGIC_ISLAND_P9_PROTOTYPE=1; anything else in the parameter is ignored.
 */
function handoverParam(value: string | null): CameraHandover | undefined {
  const n = value?.split(',').map(Number);
  if (!n || n.length !== 6 || n.some(v => !Number.isFinite(v)) || n[3] <= 0) return undefined;
  return { target: [n[0], n[1], n[2]], zoom: n[3], azimuth: n[4] * Math.PI / 180, polar: n[5] * Math.PI / 180 };
}

function BackToWorld({ onIntent }: { onIntent?: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React's tree and exists only in the DOM
  useEffect(() => { setSlot(document.getElementById(HEADER_TOOLS_ID)); }, []);
  return slot ? createPortal(<Link className={styles.backToWorld} href={P9_WORLD_HREF} aria-label="返回世界總覽" onPointerEnter={onIntent} onFocus={onIntent} onPointerDown={onIntent}><ArrowLeft size={15}/><span>世界總覽</span></Link>, slot) : null;
}

export function P9RegionExplorer({ regionId, regionName, regionNameEn, islands, hub, sharedCanvas = false, population }: { regionId: RegionId; regionName: string; regionNameEn: string; islands: LearningIsland[]; hub: { name: string; href: string; labs: number };
  /** P9.8c (LOGIC_ISLAND_P9_SHARED_CANVAS=1, CS only): the map draws in the canvas it shares with the world overview. */
  sharedCanvas?: boolean;
  /** Dynamic Island Population: draw the region's online population as walking figures (src/lib/presence/map-population.ts). Unset: none. */
  population?: PopulationConfig }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const requested = params.get('island');
  // Read once: the camera takes a handover at mount only.
  const [handover] = useState(() => handoverParam(params.get('handover')));
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
      if (selectedId) { returnTo.current = selectedId; change(null); } else { if (sharedCanvas) void loadWorldScene(); router.push(P9_WORLD_HREF); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selectedId, change, router, sharedCanvas]);
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
    // The figures have a boundary of their own: the landmarks never wait for them.
    extras: <><Suspense fallback={null}><P9Landscapes world={layout.world} landscapes={scene.landscapes} accents={accents} region={regionId}/></Suspense>
      {population && <Suspense fallback={null}><P9Population layout={layout} landscapes={scene.landscapes} region={regionId} population={population}/></Suspense>}</>, explore: EXPLORE,
    // P9.6: the island's subjects open once the camera has reached it.
    panelsOnArrival: true,
  }), [layout, camera, pins, accents, scene, regionId, population]);
  const open = islands.filter(i => !i.planned).length, planned = islands.length - open;
  // P9.8c: the map's place in the world's space (for the camera handed over from and back to the world), and a canvas
  // lost on the way: the explorer goes to its list by itself; a new canvas only when asked, with a fresh explorer.
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(WIDE).matches, () => true);
  const shared = useMemo(() => sharedCanvas ? { frame: regionFrame(regionId, wide ? 'wide' : 'tall') } : undefined, [sharedCanvas, regionId, wide]);
  const lost = useSyncExternalStore(canvasSlot.subscribe, () => sharedCanvas && canvasSlot.lost(), () => false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { canvasSlot.retry(); setAttempt(n => n + 1); }, []);
  const lostNotice = useFocusOnLoss<HTMLDivElement>(Boolean(lost));
  // The way back to the world is one canvas too: its scene's code is loaded ahead when the way back is about to be taken
  // (a pointer on, or focus on, a link to the world, or Escape), as the world loads this map's on the way here (P9.6),
  // so the canvas goes from this map to the world without a moment between with nothing to draw. Coming from the world
  // it is loaded already. (A browser Back after a direct load of this page loads it then, as a page of its own would.)
  const towardWorld = useCallback(() => { if (sharedCanvas) void loadWorldScene(); }, [sharedCanvas]);
  return <>
    <BackToWorld onIntent={towardWorld}/>
    {lost && <div ref={lostNotice} className={styles.fallbackNotice} role="status" tabIndex={-1}><p>3D 地圖已停止（WebGL 失效），島嶼清單與課程連結仍可使用。</p><button type="button" onClick={retry}>重新載入 3D 地圖</button></div>}
    <HexWorldExplorer key={attempt} islands={islands} sharedCanvas={shared} world={layout.world} options={options} poiPanel captionAbove controlsBelow
      layout="fullscreen" modeSwitchTarget={HEADER_TOOLS_ID} selectedId={selectedId} onSelectedChange={change}
      baseAzimuth={P9_REGION_BASE_AZIMUTH} cameraHandover={handover}
      listMore={<nav className={styles.regionMore} aria-label={`${regionName}以外`}>
        <p>{regionName}共 {islands.length} 座學科島。</p>
        <ul>
          <li><Link href={hub.href}><span><small>共用 · 中央樞紐</small><strong>{hub.name}</strong><em>{hub.labs} 個互動實驗</em></span><ArrowRight size={15}/></Link></li>
          <li><Link href={P9_WORLD_HREF} onPointerEnter={towardWorld} onFocus={towardWorld} onPointerDown={towardWorld}><span><small>世界</small><strong>世界總覽</strong></span><ArrowRight size={15}/></Link></li>
          <li><Link href={`/regions/${regionId}`}><span><small>不需 3D</small><strong>{regionName}清單總覽</strong></span><ArrowRight size={15}/></Link></li>
        </ul>
      </nav>}
      copy={{
        section: `${regionName}地圖`, overview: `${regionName}全景`, tag: 'LOGIC ISLAND',
        eyebrow: regionNameEn.toUpperCase(),
        title: <>{regionName}<small className={styles.captionStats}>{`${open} 座已開放 · ${planned} 座規劃中`}</small></>,
        hint: phone ? '單指左右旋轉 · 雙指縮放與平移 · 點選島嶼探索' : pins ? '拖曳旋轉 · 滾輪縮放 · 點擊島嶼或圖釘探索 · Esc 返回上一層' : '拖曳旋轉 · 右鍵拖曳或方向鍵平移 · 滾輪縮放 · 點擊島嶼或名牌探索 · Esc 返回上一層',
        canvas: `${regionName}：${islands.length} 座學科島（${open} 座已開放、${planned} 座規劃中），亦可使用場景外的清單導航`,
        loading: { title: `正在準備${regionName}…`, note: '也可以先使用清單選擇島嶼。' },
      }}/>
  </>;
}
