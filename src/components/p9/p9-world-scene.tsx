'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, Color, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useThree } from '@react-three/fiber';
import { ENVIRONMENTS, type EnvironmentId, type WorldEnvironment } from '@/lib/islands/environments';
import { WATER_LEVEL, worldCenter } from '@/lib/islands/hex-world';
import { placeLabels, type LabelSpot, type StageBox, type StageLand, type StageLine } from '@/lib/islands/regions/overview-labels';
import { LINK_THEME } from '@/lib/islands/regions/region-themes';
import type { LabelSide, OverviewShape } from '@/lib/islands/regions/schema';
import { LINK_WIDTH, frameOverview, overviewLinks, overviewOutlines, stageLands, stageLines, type OverviewLink, type OverviewOutline } from '@/lib/islands/regions/world-overview-geometry';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { regionScene, sceneLayouts, scenePlacement, type SceneId } from '@/lib/p9/region-scene';
import { P9_WORLD_MAP } from '@/lib/p9/world-map';
import { FLY_MS, FLY_SAFETY_MS, flightView, flyTarget, type FlyState } from '@/lib/p9/world-fly';
import { useRouter } from 'next/navigation';
import { REGION_IDS } from '@/content/world/types';
import { DRAG_THRESHOLD, HOME_VIEW, clampView, isHome, panBy, project, wheelFactor, zoomAt, type Stage, type WorldView } from '@/lib/p9/world-view';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { VIEW } from '../islands/hex-world/hex-camera';
import { GlowProvider, HexEnvironment, STATIC_SHADOW_MAP } from '../islands/hex-world/hex-environment';
import { OCEAN } from '../islands/hex-world/hex-ocean';
import styles from '../world/world.module.css';
import { P9RegionMiniature } from './p9-region-miniature';

/*
 * P9.1b: the world overview is the five regions' own scenes, drawn small around the hub. Each region is its Region
 * Scene Definition (src/lib/p9/region-scene.ts), the one its Region page draws, inside a scaled group
 * (p9-region-miniature.tsx): the same islands in the same places with the same outlines, heights, bridges, roads and
 * landmarks, at a lower level of detail. This file adds only what belongs to the world and to no region: where the
 * regions sit and how large (the world map), the hub's causeways and the relation bridges between regions, the open
 * sea, and the labels. It has no terrain, no island coordinates and no building list of its own.
 *
 * The light is the islands' own: the four times of day of src/lib/islands/environments.ts through the Region scene's
 * HexEnvironment, chosen by the site's time button (src/lib/site-time.ts), so a time set here is the time on the
 * Region and Island levels too.
 */
const noRaycast = () => undefined;
const boxes = (list: { a: readonly [number, number]; b: readonly [number, number]; width: number; planks: boolean }[]): BufferGeometry | null => {
  const parts: BufferGeometry[] = [];
  for (const { a, b, width, planks } of list) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), turn = Math.atan2(b[0] - a[0], b[1] - a[1]), pieces = planks ? Math.max(2, Math.round(length / 1.1)) : 1;
    for (let i = 0; i < pieces; i++) {
      const t = (i + .5) / pieces;
      parts.push(new BoxGeometry(width, .14, length / pieces * (planks ? .8 : 1)).rotateY(turn).translate(a[0] + (b[0] - a[0]) * t, .3, a[1] + (b[1] - a[1]) * t));
    }
    for (let i = 1, piers = Math.max(1, Math.round(length / 2.6)); i < piers; i++) {
      parts.push(new BoxGeometry(width * .55, .6, .26).rotateY(turn).translate(a[0] + (b[0] - a[0]) * i / piers, 0, a[1] + (b[1] - a[1]) * i / piers));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
};

/** Everything the overview composes: every scene with its place, and the world's own links between them. */
function useWorld(shape: OverviewShape) {
  return useMemo(() => {
    // The outlines place each region's own map (its tiles) on the overview: the same placement the P8 overview uses.
    const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape), links = overviewLinks(P9_WORLD_MAP, outlines);
    const parts = outlines.map((outline, order) => {
      const scene = regionScene(outline.id as SceneId), { world } = scene.region.layout;
      // The outline's own anchor: where the map's centre lands. The hub's outline is the same island as the hub scene's.
      const anchor = outline.placed.point(...worldCenter(outline.world));
      return { id: outline.id as SceneId, scene, order, placement: scenePlacement(world, anchor, outline.placed.scale, WATER_LEVEL) };
    });
    const hub = boxes(links.filter(l => l.kind === 'hub').map(l => ({ a: l.a, b: l.b, width: LINK_WIDTH[shape].hub * 1.5, planks: false })));
    const relation = boxes(links.filter(l => l.kind === 'relation').map(l => ({ a: l.a, b: l.b, width: LINK_WIDTH[shape].relation * 1.5, planks: true })));
    const reach = Math.max(...outlines.flatMap(o => o.tiles.map(t => Math.max(Math.abs(t[0]), Math.abs(t[1]))))) + 6;
    return { outlines, links, parts, hub, relation, reach };
  }, [shape]);
}

interface Framed { extents: StageBox[]; lines: StageLine[]; lands: StageLand[] }
/**
 * The P8 overview's fixed orthographic framing, unchanged: every outline fits with room for its label, left of
 * `insetRight`. P9.4: the view (zoom k and pan) is applied on top, as an orthographic camera would: zoom about the
 * stage's centre, the camera moved against the pan along its own screen axes.
 */
function Framing({ outlines, links, shape, insetRight, view, onFramed }: { outlines: OverviewOutline[]; links: OverviewLink[]; shape: OverviewShape; insetRight: number; view: WorldView; onFramed: (framed: Framed) => void }) {
  const { size, invalidate, get } = useThree();
  const frame = useMemo(() => frameOverview(outlines, shape, size, insetRight), [outlines, shape, size, insetRight]);
  useLayoutEffect(() => {
    onFramed({ extents: frame.boxes, lines: stageLines(frame, links, shape), lands: stageLands(frame, outlines) });
  }, [frame, links, shape, outlines, onFramed]);
  useLayoutEffect(() => {
    const camera = get().camera, center = new Vector3(...frame.center), zoom = frame.zoom * view.k;
    camera.position.copy(center).addScaledVector(VIEW, 120);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(right, -view.dx / zoom).addScaledVector(up, view.dy / zoom);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [get, frame, view, invalidate]);
  return null;
}

/**
 * P9.4: the world's zoom and pan from the pointer: the wheel zooms at the cursor; one pointer drags; two pinch (zoom
 * at their midpoint, and pan with it). A press that travels past DRAG_THRESHOLD is a drag: the click it ends with is
 * swallowed (capture phase) so a drag never opens a region. The stage takes no browser gestures (touch-action: none),
 * so a pinch zooms the map and not the page.
 */
function useWorldGestures(element: React.RefObject<HTMLDivElement | null>, stage: Stage, setView: React.Dispatch<React.SetStateAction<WorldView>>, onGesture: () => void) {
  const dragged = useRef(false);
  useEffect(() => {
    const el = element.current;
    if (!el || !stage.width) return;
    const local = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number]; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); onGesture(); const [x, y] = local(e); setView(v => zoomAt(v, stage, wheelFactor(e.deltaY, e.deltaMode), x, y)); };
    const pointers = new Map<number, [number, number]>();
    let start: [number, number] | null = null, travel = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button > 0 || (e.target as HTMLElement).closest('button, a, [data-world-controls]')) return;
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) { start = local(e); travel = 0; dragged.current = false; }
    };
    const onMove = (e: PointerEvent) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      const now = local(e);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.entries()].sort(([i], [j]) => i - j).map(([id, p]) => id === e.pointerId ? now : p);
        const [pa, pb] = [...pointers.entries()].sort(([i], [j]) => i - j).map(([, p]) => p);
        const d0 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), d1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m0 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        dragged.current = true; onGesture();
        setView(v => panBy(zoomAt(v, stage, d0 > 0 ? d1 / d0 : 1, m1[0], m1[1]), stage, m1[0] - m0[0], m1[1] - m0[1]));
      } else if (start) {
        travel = Math.max(travel, Math.hypot(now[0] - start[0], now[1] - start[1]));
        if (travel > DRAG_THRESHOLD) { dragged.current = true; onGesture(); setView(v => panBy(v, stage, now[0] - before[0], now[1] - before[1])); }
      }
      pointers.set(e.pointerId, now);
    };
    // The click a drag may end with comes in the same task as its pointerup; after that the flag is cleared, so a
    // touch drag (no click follows) never swallows the next tap.
    const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) { start = null; if (dragged.current) setTimeout(() => { dragged.current = false; }, 0); } };
    // A drag's closing click opens nothing (region terrain, labels); a tap that did not travel still does.
    const onClick = (e: MouseEvent) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('wheel', onWheel); el.removeEventListener('pointerdown', onDown); el.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
    };
  }, [element, stage, setView, onGesture]);
}


/**
 * The targets a flight opens: the five regions, each to its own extent on the overview. The central hub keeps opening
 * its lab list at once, as before.
 */
const FLY_TO: readonly string[] = REGION_IDS;

/**
 * P9.6: the region page's scene code, which that page loads lazily (the shared hex scene and the P9 landscapes), fetched
 * once as soon as a region is about to open (hover, focus, the flight's start), so the page that follows finds it loaded.
 */
let sceneWarmed = false;
const warmRegionScene = () => {
  if (sceneWarmed) return;
  sceneWarmed = true;
  void import('../islands/hex-world/hex-world-scene');
  void import('./p9-landscapes');
};

/**
 * P9.5: the one fly-to controller. start(id, box, go) flies the view to the region's extent and then calls `go` (the
 * route change); repeat starts while flying or navigating are ignored, so a quick double click or a click on another
 * region opens nothing twice. Reduced motion, a region outside FLY_TO or one without an extent opens at once. A wheel
 * or drag cancels the flight (the view stays where it is, nothing opens). If the frames stall, the safety timer still
 * opens the region. The route is prefetched when the flight starts.
 * P9.6: `prepare(id, href)` prefetches the route and the region scene's code before a click (hover, focus); Escape
 * cancels a flight as a wheel does.
 */
function useFlyTo(stage: Stage, insetRight: number, view: WorldView, setView: React.Dispatch<React.SetStateAction<WorldView>>) {
  const router = useRouter();
  const [state, setState] = useState<FlyState>('idle');
  const [target, setTarget] = useState<string | null>(null);
  const live = useRef<{ state: FlyState; frame: number; timer: ReturnType<typeof setTimeout> | null }>({ state: 'idle', frame: 0, timer: null });
  const viewNow = useRef(view);
  useEffect(() => { viewNow.current = view; }, [view]);
  const set = useCallback((next: FlyState) => { live.current.state = next; setState(next); }, []);
  const stop = useCallback(() => { cancelAnimationFrame(live.current.frame); if (live.current.timer) clearTimeout(live.current.timer); live.current.timer = null; }, []);
  useEffect(() => stop, [stop]);
  const cancel = useCallback(() => {
    if (live.current.state !== 'flying') return;
    stop(); set('cancelled'); setTarget(null);
    setTimeout(() => { if (live.current.state === 'cancelled') set('idle'); }, 0);
  }, [stop, set]);
  const prepared = useRef(new Set<string>());
  const prepare = useCallback((id: string, href?: string) => {
    if (!href || prepared.current.has(href)) return;
    prepared.current.add(href);
    router.prefetch(href);
    if (FLY_TO.includes(id)) warmRegionScene();
  }, [router]);
  useEffect(() => {
    if (state !== 'flying') return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state, cancel]);
  const start = useCallback((id: string, box: { x0: number; y0: number; x1: number; y1: number } | undefined, go: () => void, href?: string) => {
    if (live.current.state === 'flying' || live.current.state === 'navigating') return;
    const arrive = () => { stop(); if (live.current.state === 'navigating') return; set('navigating'); go(); };
    prepare(id, href);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !box || !stage.width || !FLY_TO.includes(id)) { setTarget(id); arrive(); return; }
    const from = viewNow.current, to = flyTarget(box, stage, insetRight), t0 = performance.now();
    setTarget(id); set('flying');
    const tick = () => {
      if (live.current.state !== 'flying') return;
      const t = (performance.now() - t0) / FLY_MS;
      setView(flightView(from, to, t, stage, insetRight));
      if (t >= 1) arrive(); else live.current.frame = requestAnimationFrame(tick);
    };
    live.current.frame = requestAnimationFrame(tick);
    live.current.timer = setTimeout(() => { if (live.current.state === 'flying') arrive(); }, FLY_MS + FLY_SAFETY_MS);
  }, [prepare, stage, insetRight, setView, set, stop]);
  return { state, target, start, cancel, prepare };
}

/** The open sea, in the Region's deep colour and the environment's tint. */
function Sea({ tint }: { tint: string }) {
  const color = useMemo(() => new Color(OCEAN.deep).multiply(new Color(tint)), [tint]);
  return <mesh rotation-x={-Math.PI / 2} position-y={-.012} receiveShadow raycast={noRaycast} renderOrder={2}><planeGeometry args={[600, 600]}/><meshStandardMaterial color={color} roughness={.55} metalness={0}/></mesh>;
}
/** Review hook: `canvas.__p9Render()` draws one frame now, waits for the GPU and returns how long it took (ms). */
function Probe() {
  const get = useThree(state => state.get);
  useEffect(() => {
    // Read when called, so the frame is the scene and camera of that moment.
    const canvas = get().gl.domElement as HTMLCanvasElement & { __p9Render?: () => number };
    canvas.__p9Render = () => { const { gl, scene, camera } = get(), t = performance.now(); gl.render(scene, camera); gl.getContext().finish(); return performance.now() - t; };
    return () => { delete canvas.__p9Render; };
  }, [get]);
  return null;
}

export interface P9WorldTarget {
  id: SceneId; name: string; detail: string;
  /** Accessible name of the label button. */
  label: string; accent: string;
  /** Nothing to open yet (a region the prototype has not built a page for): the label is shown, not a button to somewhere. */
  onOpen?: () => void;
  /** P9.5: where onOpen goes, prefetched when a flight to it starts. */
  href?: string;
}
/** Under this much free stage width (px) the labels are the short ones (as on the P8 overview). */
const COMPACT_BELOW = 720;

export default function P9WorldScene({ targets, insetRight, label, shape, environmentId, accents, onReady, onUnavailable }: {
  targets: P9WorldTarget[]; insetRight: number; label: string; shape: OverviewShape;
  /** The time of day: the site's own (src/lib/site-time.ts), the one the Region and Island levels draw. */
  environmentId: EnvironmentId;
  accents: Record<string, string>;
  onReady: () => void; onUnavailable: () => void;
}) {
  const { outlines, links, parts, hub, relation, reach } = useWorld(shape);
  // The islands' own environment. Only the shadow's fit differs: the world is far wider than one region's map, so the
  // sun's box is fitted to it from the sun's direction at every time of day (noon's fixed box is one map wide), on a
  // larger map. Colours, intensities, the sun's direction, the sea's tint and the glow are the environment's.
  const environment: WorldEnvironment = useMemo(() => { const e = ENVIRONMENTS[environmentId]; return { ...e, shadow: { mapSize: 2048, bias: e.shadow.bias, normalBias: e.shadow.normalBias, fit: 'sun' } }; }, [environmentId]);
  const [hovered, setHovered] = useState<string | null>(null);
  const shown = useMemo(() => targets.filter(t => outlines.some(o => o.id === t.id)), [targets, outlines]);
  const shownOutlines = useMemo(() => shown.map(t => outlines.find(o => o.id === t.id)!), [shown, outlines]);
  const sides: LabelSide[] = useMemo(() => shown.map(t => t.id === 'hub' ? WORLD_MAP.hub[shape].label : WORLD_MAP.regions[t.id]![shape].label), [shown, shape]);
  const [framed, setFramed] = useState<Framed | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const buttons = useRef<(HTMLElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStage({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const compact = stage.width > 0 && stage.width - insetRight < COMPACT_BELOW;
  // P9.4: the map's zoom and pan (world-view.ts); a new stage size keeps the view inside its limits.
  const [view, setView] = useState<WorldView>(HOME_VIEW);
  const shown_view = useMemo(() => stage.width ? clampView(view, stage) : view, [view, stage]);
  // P9.5: the camera flight to a region (world-fly.ts), one controller for every target; a wheel or drag cancels it.
  const fly = useFlyTo(stage, insetRight, shown_view, setView);
  useWorldGestures(wrap, stage, setView, fly.cancel);
  const step = (factor: number) => setView(v => zoomAt(v, stage, factor, stage.width / 2 - (stage.width > 780 ? insetRight / 2 : 0), stage.height / 2));
  const [spots, setSpots] = useState<LabelSpot[] | null>(null);
  useLayoutEffect(() => {
    const list = buttons.current.slice(0, sides.length);
    if (!framed || framed.extents.length !== sides.length || !stage.width || list.length < sides.length || list.some(b => !b)) return;
    const next = placeLabels(framed.extents, sides, list.map(b => [b!.offsetWidth, b!.offsetHeight]), { left: 4, right: stage.width - insetRight - 4, top: 4, bottom: stage.height - 4 }, framed);
    setSpots(current => current?.length === next.length && current.every((s, i) => s.x === next[i].x && s.y === next[i].y && s.side === next[i].side) ? current : next);
  }, [framed, sides, stage.width, stage.height, insetRight, compact]);
  useEffect(() => () => { hub?.dispose(); relation?.dispose(); }, [hub, relation]);
  const target = (id: string) => targets.find(t => t.id === id);
  /** Opens a target by flying to it first: its extent at rest is the flight's goal; a target without one opens at once. */
  const open = (id: string) => {
    const t = target(id), i = shown.findIndex(s => s.id === id), box = framed?.extents[i];
    if (!t?.onOpen) return undefined;
    const go = t.onOpen;
    return () => fly.start(id, box, go, t.href);
  };
  // What was drawn, for the review tools and tests: every scene's source, scale and counts, the links, the time of day.
  const drawn = useMemo(() => JSON.stringify({
    time: environmentId,
    regions: parts.map(p => ({ id: p.id, source: p.scene.source, scale: Math.round(p.placement.scale * 1000) / 1000, islands: p.scene.islands.map(i => i.islandId), bridges: p.scene.region.layout.world.bridges.map(b => b.id),
      landmarks: p.scene.landmarks.map(l => `${l.islandId}:${l.id}`), trees: p.scene.trees.length })),
    links: links.map(l => ({ id: l.id, kind: l.kind })),
  }), [parts, links, environmentId]);
  return <div ref={wrap} className={styles.canvasWrap} style={hovered && target(hovered)?.onOpen ? { cursor: 'pointer' } : undefined} data-shape={shape} data-compact={compact ? 'true' : undefined} data-p9-world={drawn}
    data-view={`${shown_view.k.toFixed(3)},${shown_view.dx.toFixed(1)},${shown_view.dy.toFixed(1)}`} data-fly={fly.state} data-fly-target={fly.target ?? undefined}>
    <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} shadows={STATIC_SHADOW_MAP} camera={{ position: [0, 40, 60], zoom: 10, near: .1, far: 500 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.setAttribute('aria-label', label); canvas.setAttribute('role', 'img');
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onUnavailable(); });
        onReady();
      }}>
      <HexEnvironment environment={environment} shadowExtent={reach} staticShadows/>
      <Probe/>
      <GlowProvider value={environment}>
        <Sea tint={environment.sea.tint}/>
        {parts.map(p => <P9RegionMiniature key={p.id} scene={p.scene} placement={p.placement} seaTint={environment.sea.tint} accents={accents} order={p.order + 1}
          onOpen={open(p.id)} onHover={on => { if (on) fly.prepare(p.id, target(p.id)?.href); setHovered(h => on ? p.id : h === p.id ? null : h); }}/>)}
        {/* The world's own links: the hub's causeways in pale stone, the relation bridges as wooden planks (the P8 overview's colours). */}
        {hub && <mesh geometry={hub} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.hub} flatShading roughness={.9}/></mesh>}
        {relation && <mesh geometry={relation} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.relation} flatShading roughness={.9}/></mesh>}
      </GlowProvider>
      <Framing outlines={shownOutlines} links={links} shape={shape} insetRight={insetRight} view={shown_view} onFramed={setFramed}/>
    </Canvas>
    {framed && shown.map((t, i) => {
      // P9.4: a label moves with its region under the view; one whose anchor leaves the stage, or reaches the guide
      // beside it (insetRight), is hidden.
      const at = spots?.map(spot => { const [x, y] = project(shown_view, stage, spot.x, spot.y); return [x, y, x > -40 && x < stage.width - insetRight - 40 && y > -20 && y < stage.height - 20] as const; }) ?? [];
      const common = {
        ref: (element: HTMLElement | null) => { buttons.current[i] = element; }, className: styles.overviewLabel,
        style: { '--region-accent': t.accent, left: at[i]?.[0] ?? 0, top: at[i]?.[1] ?? 0, visibility: spots && at[i]?.[2] ? undefined : 'hidden' } as React.CSSProperties,
        'data-side': spots?.[i].side, 'data-target': t.id, 'data-hovered': hovered === t.id && t.onOpen ? 'true' : undefined,
      };
      const text = <><strong>{(t.name.length > 6 ? t.name.split(/(?<=與)/) : [t.name]).flatMap((part, n) => n ? [<wbr key={n}/>, part] : [part.replace(/ /g, ' ')])}</strong><small className={styles.overviewDetail}>{t.detail}</small></>;
      return t.onOpen
        ? <button key={t.id} type="button" {...common} aria-label={t.label} onClick={open(t.id)} onPointerEnter={() => fly.prepare(t.id, t.href)} onPointerDown={() => fly.prepare(t.id, t.href)} onFocus={() => fly.prepare(t.id, t.href)}>{text}</button>
        : <div key={t.id} {...common} role="note" aria-label={t.label} data-pending="true">{text}</div>;
    })}
    {/* P9.4: zoom buttons and 重設視角, for those without a wheel or a pinch; reset frames all five regions again in place (no reload, same address). */}
    <div className={styles.worldControls} data-world-controls role="group" aria-label="世界地圖視角">
      <button type="button" aria-label="放大" onClick={() => step(1.4)} disabled={shown_view.k >= 4 - 1e-6}><Plus size={16}/></button>
      <button type="button" aria-label="縮小" onClick={() => step(1 / 1.4)} disabled={shown_view.k <= 1 + 1e-6}><Minus size={16}/></button>
      <button type="button" onClick={() => setView(HOME_VIEW)} disabled={isHome(shown_view)}><RotateCcw size={15}/><span>重設視角</span></button>
    </div>
  </div>;
}
