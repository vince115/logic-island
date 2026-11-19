'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGLTF } from '@react-three/drei';
import { VEGETATION_ASSET, glbAssets, type GlbAssetId } from '@/lib/islands/asset-registry';
import { ENVIRONMENTS, type WorldEnvironment } from '@/lib/islands/environments';
import { worldCenter } from '@/lib/islands/hex-world';
import { frameOverview } from '@/lib/islands/regions/world-overview-geometry';
import { LINK_THEME } from '@/lib/islands/regions/region-themes';
import type { LearningIsland } from '@/lib/islands/types';
import { regionScene } from '@/lib/p9/region-scene';
import { P9_REGION_BASE_AZIMUTH } from '@/lib/p9/camera-heading';
import { FLY_MS, flightView, flyTarget } from '@/lib/p9/world-fly';
import { HOME_VIEW, clampView, type WorldView } from '@/lib/p9/world-view';
import { useSiteTime } from '@/lib/site-time';
import { VIEW, type CameraFrom } from '../islands/hex-world/hex-camera';
import { GlowProvider, HexEnvironment, STATIC_SHADOW_MAP } from '../islands/hex-world/hex-environment';
import { SCENE_PRESETS, sceneOptions } from '../islands/hex-world/hex-scene-presets';
import { HexWorldContent } from '../islands/hex-world/hex-world-scene';
import styles from '../world/world.module.css';
import { EXPLORE } from './p9-region-explorer';
import { P9Landscapes } from './p9-landscapes';
import { P9RegionMiniature } from './p9-region-miniature';
import { Framing, Sea, useWorld, useWorldGestures, type Framed } from './p9-world-scene';

/*
 * P9.7 PROTOTYPE (branch p9/7-shared-canvas-proto, never merged without approval): one canvas, kept by the /p97 layout
 * across /p97 (the world) and /p97/cs (the CS region), so going from one to the other keeps the WebGL context. The
 * world's content (the P9 miniatures, framing, zoom and pan, fly-to) and the CS region's content (the shared hex map,
 * HexWorldContent) take turns inside it; the camera is handed over between their coordinate systems:
 *   a CS map point M is drawn on the world at W = anchor + s·(M − c) (lowered by the sea level), and on the region
 *   map at R = M − c, so R = (W − anchor)/s (+ sea level in y) and the region's orthographic zoom is the world's × s.
 * Both look along VIEW (P9_REGION_BASE_AZIMUTH = 0), so a point on the camera's axis is all a handover needs.
 * Desktop only, no list, no panels: just enough to measure continuity, contexts and cost.
 */
// A static import, not lazy(): the world already loaded this module, and a lazy component's first render suspends
// once even then; React then holds the boundary's reveal back (about 300 ms), which was the buildings' pop-in.
const SHAPE = 'wide' as const, INSET = 0;
const csScene = () => regionScene('cs');

/**
 * The CS region's own GLB files (its buildings' assets and the trees'), fetched and parsed when the flight starts, so
 * the region's first frame has its buildings instead of their stand-ins (the pop-in). Only this region's, once.
 */
let csAssetsLoaded = false;
const preloadCsAssets = () => {
  if (csAssetsLoaded) return;
  csAssetsLoaded = true;
  const ids = new Set<GlbAssetId>([...csScene().region.layout.glb.map(g => g.asset), VEGETATION_ASSET]);
  for (const id of ids) useGLTF.preload(glbAssets[id].url, false, false);
};

/** How a CS map point moves between the world (its miniature) and the region map. */
function csTransform(placement: { scale: number; position: [number, number, number] }) {
  const { world } = csScene().region.layout, [cx, cz] = worldCenter(world), s = placement.scale, [px, py, pz] = placement.position;
  // Miniature: W = position + s·M, position = anchor − s·c (x, z) and −s·sea (y). Region map: R = M − c (x, z), y as is.
  const toRegion = (w: Vector3) => new Vector3((w.x - px) / s - cx, (w.y - py) / s, (w.z - pz) / s - cz);
  const toWorld = (r: Vector3) => new Vector3(px + s * (r.x + cx), py + s * r.y, pz + s * (r.z + cz));
  return { s, toRegion, toWorld };
}

/** Lets the stage read the canvas state (camera, renderer) from outside it, and the tests read the renderer's counts. */
function Grab({ intoRef }: { intoRef: React.RefObject<(() => RootState) | null> }) {
  const get = useThree(state => state.get);
  useEffect(() => {
    intoRef.current = get;
    const canvas = get().gl.domElement as HTMLCanvasElement & { __p97Info?: () => unknown; __p97Scene?: () => unknown };
    canvas.__p97Scene = () => { const { scene, camera, gl } = get(); let meshes = 0, visible = 0; scene.traverse(o => { if ((o as { isMesh?: boolean }).isMesh) { meshes++; if (o.visible) visible++; } }); gl.render(scene, camera); return { children: scene.children.length, meshes, visible, cam: camera.position.toArray().map(v => +v.toFixed(1)), zoom: (camera as { zoom: number }).zoom, calls: gl.info.render.calls }; };
    canvas.__p97Info = () => { const { gl } = get(); return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? null }; };
  }, [get, intoRef]);
  return null;
}

/**
 * Measurement for the prototype: every drawn frame, where the CS map's centre is on screen and how many pixels one CS
 * map unit is, in either mode, so the handover's continuity can be read as numbers (`window.__p97Track`).
 */
function Track({ mode, toWorld, s }: { mode: 'world' | 'region'; toWorld: (r: Vector3) => Vector3; s: number }) {
  useFrame(({ camera, size }) => {
    const p = (mode === 'world' ? toWorld(new Vector3(0, 0, 0)) : new Vector3(0, 0, 0)).project(camera);
    const unit = (camera as { zoom: number }).zoom * (mode === 'world' ? s : 1);
    const w = window as unknown as { __p97Track?: [number, string, number, number, number][] };
    (w.__p97Track ??= []).push([performance.now(), mode, (p.x + 1) / 2 * size.width, (1 - p.y) / 2 * size.height, unit]);
  });
  return null;
}

function WorldContent({ view, onFramed, onOpenCs, accents }: { view: WorldView; onFramed: (f: Framed) => void; onOpenCs: () => void; accents: Record<string, string> }) {
  const { outlines, links, parts, hub, relation, reach } = useWorld(SHAPE);
  const time = useSiteTime();
  const environment: WorldEnvironment = useMemo(() => { const e = ENVIRONMENTS[time]; return { ...e, shadow: { mapSize: 2048, bias: e.shadow.bias, normalBias: e.shadow.normalBias, fit: 'sun' } }; }, [time]);
  useEffect(() => () => { hub?.dispose(); relation?.dispose(); }, [hub, relation]);
  return <>
    <HexEnvironment environment={environment} shadowExtent={reach} staticShadows/>
    <GlowProvider value={environment}>
      <Sea tint={environment.sea.tint}/>
      {parts.map(p => <P9RegionMiniature key={p.id} scene={p.scene} placement={p.placement} seaTint={environment.sea.tint} accents={accents} order={p.order + 1}
        onOpen={p.id === 'cs' ? onOpenCs : undefined} onHover={() => {}}/>)}
      {hub && <mesh geometry={hub}><meshStandardMaterial color={LINK_THEME.hub} flatShading roughness={.9}/></mesh>}
      {relation && <mesh geometry={relation}><meshStandardMaterial color={LINK_THEME.relation} flatShading roughness={.9}/></mesh>}
    </GlowProvider>
    <Framing outlines={outlines} links={links} shape={SHAPE} insetRight={INSET} view={view} onFramed={onFramed}/>
  </>;
}

function RegionContent({ islands, cameraFrom, onReady }: { islands: LearningIsland[]; cameraFrom?: CameraFrom; onReady: () => void }) {
  const router = useRouter(), params = useSearchParams();
  const requested = params.get('island'), selectedId = requested && islands.some(i => i.id === requested) ? requested : null;
  const scene = csScene(), { layout, camera } = scene.region, time = useSiteTime();
  const accents = useMemo(() => Object.fromEntries(islands.map(i => [i.id, i.accent])), [islands]);
  const options = useMemo(() => ({
    ...sceneOptions(layout, SCENE_PRESETS.lab), labelReach: camera.labelReach, largeTargets: true, mapControls: true, ownLayer: true, explore: EXPLORE,
    extras: <P9Landscapes world={layout.world} landscapes={scene.landscapes} accents={accents} region="cs"/>,
  }), [layout, camera, scene, accents]);
  const select = useCallback((id: string | null) => router.push(id ? `/p97/cs?island=${id}` : '/p97/cs', { scroll: false }), [router]);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <HexWorldContent world={layout.world} islands={islands} selectedId={selectedId} onSelect={select} onNavigate={href => router.push(href)}
    reducedMotion={reduced} onReady={onReady} onUnavailable={() => {}} options={options} label="CS（P9.7 原型）" environmentId={time}
    baseAzimuth={P9_REGION_BASE_AZIMUTH} cameraFrom={cameraFrom}/>;
}

/** The handover between the two modes, kept outside React so a route change cannot lose it. */
const handover: { toRegion?: CameraFrom; worldView?: WorldView } = {};

export function P97SharedStage({ islands, accents, children }: { islands: LearningIsland[]; accents: Record<string, string>; children: React.ReactNode }) {
  const router = useRouter(), path = usePathname();
  const mode = path.startsWith('/p97/cs') ? 'region' : 'world';
  const wrap = useRef<HTMLDivElement>(null), get = useRef<(() => RootState) | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const o = new ResizeObserver(() => setStage({ width: el.clientWidth, height: el.clientHeight })); o.observe(el); return () => o.disconnect();
  }, []);
  const [view, setView] = useState<WorldView>(HOME_VIEW);
  const shown = useMemo(() => stage.width ? clampView(view, stage) : view, [view, stage]);
  const [framed, setFramed] = useState<Framed | null>(null);
  const [flying, setFlying] = useState(false);
  const frame = useRef(0);
  const { parts, outlines } = useWorld(SHAPE);
  const csPart = parts.find(p => p.id === 'cs')!, cs = useMemo(() => csTransform(csPart.placement), [csPart]);
  /** The camera's axis point and zoom now, in the world's space (only meaningful in world mode). */
  const cameraNow = () => { const c = get.current?.().camera; return c ? { at: c.position.clone(), zoom: c.zoom } : null; };
  const animate = useCallback((from: WorldView, to: WorldView, done: () => void) => {
    // The clock starts at the first frame: after a mode switch that frame waits for the new content to be built.
    let t0 = 0; setFlying(true);
    // Reduced motion: no flight; the view jumps to its end and the handover follows once the camera has it (two frames).
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(to); frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => { setFlying(false); done(); }); }); return;
    }
    const tick = () => { if (!t0) t0 = performance.now(); const t = (performance.now() - t0) / FLY_MS; setView(flightView(from, to, t, stage, INSET)); if (t >= 1) { setFlying(false); done(); } else frame.current = requestAnimationFrame(tick); };
    frame.current = requestAnimationFrame(tick);
  }, [stage]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useWorldGestures(wrap, stage, setView, () => {});
  // World → CS: fly the world view to CS, hand the camera over, change the route; the canvas stays.
  // A second click (or a click on the miniature too) in the same frame sees `flying` still false; this ref does not.
  const busy = useRef(false);
  useEffect(() => { busy.current = false; }, [mode]);
  const openCs = useCallback(() => {
    if (busy.current || !framed) return;
    busy.current = true;
    (window as unknown as { __p97Click?: number }).__p97Click = performance.now();
    const box = framed.extents[outlines.findIndex(o => o.id === 'cs')], to = flyTarget(box, stage, INSET);
    router.prefetch('/p97/cs');
    if (!new URLSearchParams(location.search).has('noPreload')) preloadCsAssets();
    animate(shown, to, () => {
      const now = cameraNow(); if (!now) return;
      const at = cs.toRegion(now.at), target = at.clone().addScaledVector(VIEW, -60);
      handover.toRegion = { position: [at.x, at.y, at.z], target: [target.x, target.y, target.z], zoom: now.zoom * cs.s };
      handover.worldView = to;
      router.push('/p97/cs');
    });
  }, [framed, outlines, stage, shown, animate, router, cs]);
  // CS → world (Back or the link): the world opens at the view that shows what the region camera showed, then flies home.
  const lastMode = useRef(mode), regionCamera = useRef<{ at: Vector3; zoom: number } | null>(null);
  useEffect(() => {
    if (mode !== 'region') return;
    let id = 0;
    const keep = () => { const c = get.current?.().camera; if (c) regionCamera.current = { at: c.position.clone(), zoom: c.zoom }; id = requestAnimationFrame(keep); };
    id = requestAnimationFrame(keep); return () => cancelAnimationFrame(id);
  }, [mode]);
  useLayoutEffect(() => {
    const before = lastMode.current; lastMode.current = mode;
    if (before !== 'region' || mode !== 'world' || !regionCamera.current || !stage.width) return;
    (window as unknown as { __p97Back?: number }).__p97Back = performance.now();
    const frameNow = frameOverview(outlines, SHAPE, stage, INSET), w = cs.toWorld(regionCamera.current.at), zoom = regionCamera.current.zoom / cs.s;
    const k = zoom / frameNow.zoom, center = new Vector3(...frameNow.center);
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), VIEW).normalize(), up = new Vector3().crossVectors(VIEW, right);
    const d = w.sub(center), from = { k, dx: -zoom * d.dot(right), dy: zoom * d.dot(up) };
    setView(from);
    animate(from, HOME_VIEW, () => {});
  }, [mode, outlines, stage, cs, animate]);
  // The region content says when it has mounted (its Lifecycle); the tests read it from the attribute.
  const section = useRef<HTMLElement>(null);
  const ready = useCallback(() => { section.current?.setAttribute('data-p97-ready', 'true'); (window as unknown as { __p97Ready?: number }).__p97Ready = performance.now(); }, []);
  useEffect(() => { if (mode === 'world') section.current?.removeAttribute('data-p97-ready'); }, [mode]);
  const cameraFrom = mode === 'region' ? handover.toRegion : undefined;
  return <section className={styles.overview} aria-label="P9.7 原型" ref={section} data-p97-mode={mode}>
    <div className={styles.stage} style={{ gridColumn: '1 / -1' }}>
      <div ref={wrap} className={styles.canvasWrap} data-view={`${shown.k.toFixed(3)},${shown.dx.toFixed(1)},${shown.dy.toFixed(1)}`} data-fly={flying ? 'flying' : 'idle'}>
        <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} shadows={STATIC_SHADOW_MAP} camera={{ position: [0, 40, 60], zoom: 10, near: .1, far: 500 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}>
          <Grab intoRef={get}/>
          <Track mode={mode} toWorld={cs.toWorld} s={cs.s}/>
          {mode === 'world'
            ? <WorldContent view={shown} onFramed={setFramed} onOpenCs={openCs} accents={accents}/>
            : <Suspense fallback={null}><RegionContent islands={islands} cameraFrom={cameraFrom} onReady={ready}/></Suspense>}
        </Canvas>
        <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 20, display: 'flex', gap: 8 }}>
          {mode === 'world'
            ? <button type="button" className={styles.overviewLabel} style={{ position: 'static' }} data-p97-open="cs" onClick={openCs} disabled={flying}>進入程式與資訊群島（同一 Canvas）</button>
            : <Link href="/p97" className={styles.overviewLabel} style={{ position: 'static' }} data-p97-world>返回世界（同一 Canvas）</Link>}
        </div>
      </div>
    </div>
    {children}
  </section>;
}
