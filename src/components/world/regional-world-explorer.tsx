'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { RegionId } from '@/content/world/types';
import { regionLayout } from '@/lib/islands/regions/region-layouts';
import type { LearningIsland } from '@/lib/islands/types';
import type { HexGlbSettlement } from '@/lib/islands/hex-buildings';
import { HexWorldExplorer } from '../islands/hex-world/hex-world-explorer';
import { HEADER_TOOLS_ID } from '../islands/hex-world/islands-world-explorer';
import { SCENE_PRESETS, sceneOptions } from '../islands/hex-world/hex-scene-presets';
import styles from './world.module.css';

/** Where the world overview puts the keyboard focus when it is reached from a region (session only). */
export const WORLD_RETURN_KEY = 'logic-island:world-return';

/*
 * The production look with the lab's measurement probe (canvas.__hexProject and friends, loaded only with it): this is
 * a flag-gated prototype whose island widths on screen are part of its acceptance. Captions get more room than on the
 * home map, which is framed at about twice the zoom: desktop names hang sideways about 150 px (the region's camera
 * preset); phone labels are pins, which the home map's room already fits.
 * P8.2: built from the region's layout and camera preset (REGION_LAYOUTS), for any region; region maps can be panned
 * and driven from the keyboard (`mapControls`), and a region may mark each planned island with its accent.
 */
function regionSceneOptions(region: RegionId, phone: boolean) {
  const { layout, camera, plannedMarkers } = regionLayout(region);
  return { ...sceneOptions(layout, SCENE_PRESETS.lab), labelReach: phone ? undefined : camera.labelReach, largeTargets: true, mapControls: true, plannedMarkers };
}

/*
 * M3.1 performance case P4 (`?stress=glb`, only in this flag-gated prototype): every island without a GLB gets a copy
 * of v2.1's lighthouse and workshop, loaded read-only from the same file, to measure what a region of GLB islands
 * costs before any is made. A load test, never art: the map's accessible name says「效能測試替身」while it is on.
 */
function stressLayouts(region: RegionId): HexGlbSettlement[] {
  const { layout } = regionLayout(region);
  return layout.world.settlements.filter(s => !layout.glb.some(g => g.islandId === s.islandId)).map(s => ({
    islandId: s.islandId, asset: 'basics-island-v2.1' as const,
    placements: [{ node: 'Landmark_Lighthouse', tile: { q: s.center.q, r: s.center.r - 1 } }, { node: 'Building_Workshop', tile: { q: s.center.q - 1, r: s.center.r + 1 }, across: 2 as const }],
  }));
}
/** Phones: the camera's own phone breakpoint (hex-camera.tsx frames a stage under 700 px as a phone). */
const PHONE = '(max-width: 699px)';
const subscribe = (onChange: () => void) => { const list = matchMedia(PHONE); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); };

/** The breadcrumb back to the overview, in the site header's tool slot beside the explorer's 清單 button. */
function BackToWorld({ onLeave }: { onLeave: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React's tree and exists only in the DOM
  useEffect(() => { setSlot(document.getElementById(HEADER_TOOLS_ID)); }, []);
  return slot ? createPortal(<Link className={styles.backToWorld} href="/world" aria-label="返回世界總覽" onClick={onLeave}><ArrowLeft size={15}/><span>世界總覽</span></Link>, slot) : null;
}

/**
 * P8.2: what a region's island list says below its islands. The region's subject islands are the list; the Interactive
 * Lab Island is shared by every region (the world's hub) and is offered here as such, never as one of them. Then the
 * two other ways around: the region's 2D overview, which needs no WebGL, and the world overview.
 */
function RegionMore({ regionId, regionName, islandCount, hub }: { regionId: RegionId; regionName: string; islandCount: number; hub: { name: string; href: string; labs: number } }) {
  return <nav className={styles.regionMore} aria-label={`${regionName}以外`}>
    <p>{regionName}共 {islandCount} 座學科島。{hub.name}是各群島共用的工具島，不屬於這個群島。</p>
    <ul>
      <li><Link href={hub.href}><span><small>共用 · 中央樞紐</small><strong>{hub.name}</strong><em>{hub.labs} 個互動實驗</em></span><ArrowRight size={15}/></Link></li>
      <li><Link href={`/regions/${regionId}`}><span><small>不需 3D</small><strong>{regionName}清單總覽</strong></span><ArrowRight size={15}/></Link></li>
    </ul>
  </nav>;
}

/**
 * Regional world: one region's map (/world/<region>). The shared hex explorer draws it; this component owns the
 * address. The focused island is `?island=<id>`: choosing one pushes it, back and forward restore it, an unknown id is
 * dropped from the address, and Escape goes one level up (island → region → overview).
 * P8.2 focus management: leaving an island with Escape puts the keyboard focus back on that island's entry (its map
 * label, or its list entry when the map is unavailable), and leaving the region tells the overview which region to
 * focus, so the keyboard keeps its place across the three levels.
 */
export function RegionalWorldExplorer({ regionId, regionName, regionNameEn, islands, hub, footer }: { regionId: RegionId; regionName: string; regionNameEn: string; islands: LearningIsland[];
  hub: { name: string; href: string; labs: number }; footer?: ReactNode }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const requested = params.get('island');
  const selectedId = requested && islands.some(i => i.id === requested) ? requested : null;
  // Only `island` changes; any other parameter (such as the P4 `stress` case) stays in the address.
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
  const leave = useCallback(() => { try { sessionStorage.setItem(WORLD_RETURN_KEY, regionId); } catch { /* no storage: the overview just keeps its default focus */ } }, [regionId]);
  // The island whose entry takes the focus once it is no longer the focused island (Escape).
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (selectedId) { returnTo.current = selectedId; change(null); } else { leave(); router.push('/world'); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selectedId, change, router, leave]);
  useEffect(() => {
    const id = returnTo.current;
    if (selectedId || !id) return;
    returnTo.current = null;
    const name = islands.find(i => i.id === id)?.name;
    // The map label appears a frame after the island is released; the list entry is always there.
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`button[aria-label^="聚焦${name}"]`) ?? document.querySelector<HTMLElement>(`[data-island-choice="${id}"]`);
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, islands]);
  const phone = useSyncExternalStore(subscribe, () => matchMedia(PHONE).matches, () => false);
  const stress = params.get('stress') === 'glb';
  const { layout, camera } = regionLayout(regionId);
  const base = useMemo(() => regionSceneOptions(regionId, phone), [regionId, phone]);
  const sceneOptions = useMemo(() => stress ? { ...base, glbLayouts: [...(base.glbLayouts ?? []), ...stressLayouts(regionId)] } : base, [stress, base, regionId]);
  const open = islands.filter(i => !i.planned).length, planned = islands.length - open;
  return <>
    <BackToWorld onLeave={leave}/>
    <HexWorldExplorer islands={islands} world={layout.world} options={sceneOptions} poiPanel captionAbove controlsBelow
      layout="fullscreen" modeSwitchTarget={HEADER_TOOLS_ID} selectedId={selectedId} onSelectedChange={change} footer={footer}
      baseAzimuth={camera.azimuth[phone ? 'phone' : 'desktop']}
      listMore={<RegionMore regionId={regionId} regionName={regionName} islandCount={islands.length} hub={hub}/>}
      copy={{
        section: `${regionName}地圖${stress ? '（效能測試替身）' : ''}`, overview: `${regionName}全景`, tag: 'REGIONAL WORLD PROTOTYPE',
        eyebrow: `WORLD · ${regionNameEn.toUpperCase()}`,
        // A <small>: the caption styles every <span> as its eyebrow line.
        title: <>{regionName}<small className={styles.captionStats}>{open ? `${open} 座已開放 · ${planned} 座規劃中` : `${planned} 座學科島 · 全部規劃中`}</small></>,
        hint: phone ? '單指左右旋轉 · 雙指縮放與平移 · 點選島嶼探索' : '拖曳旋轉 · 右鍵拖曳或方向鍵平移 · 滾輪縮放 · 點擊島嶼或名牌探索 · Esc 返回上一層',
        canvas: `${regionName}：${islands.length} 座學科島（${open} 座已開放、${planned} 座規劃中），亦可使用場景外的清單導航`,
        loading: { title: `正在準備${regionName}…`, note: '也可以先使用清單選擇島嶼。' },
      }}/>
  </>;
}
