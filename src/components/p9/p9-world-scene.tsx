'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { VIEW } from '../islands/hex-world/hex-camera';
import { GlowProvider, HexEnvironment, STATIC_SHADOW_MAP } from '../islands/hex-world/hex-environment';
import { OCEAN } from '../islands/hex-world/hex-ocean';
import styles from '../world/world.module.css';
import { P9RegionMiniature } from './p9-region-miniature';
import { WORLD_CAMERA_POSITION } from '@/lib/p9/camera-heading';

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
/** The P8 overview's fixed orthographic framing, unchanged: every outline fits with room for its label, left of `insetRight`. */
function Framing({ outlines, links, shape, insetRight, onFramed }: { outlines: OverviewOutline[]; links: OverviewLink[]; shape: OverviewShape; insetRight: number; onFramed: (framed: Framed) => void }) {
  const { size, invalidate, get } = useThree();
  useLayoutEffect(() => {
    const camera = get().camera, frame = frameOverview(outlines, shape, size, insetRight), center = new Vector3(...frame.center);
    camera.position.copy(center).addScaledVector(VIEW, 120);
    camera.lookAt(center);
    camera.zoom = frame.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    onFramed({ extents: frame.boxes, lines: stageLines(frame, links, shape), lands: stageLands(frame, outlines) });
    invalidate();
  }, [get, size, outlines, links, shape, insetRight, invalidate, onFramed]);
  return null;
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
  const [spots, setSpots] = useState<LabelSpot[] | null>(null);
  useLayoutEffect(() => {
    const list = buttons.current.slice(0, sides.length);
    if (!framed || framed.extents.length !== sides.length || !stage.width || list.length < sides.length || list.some(b => !b)) return;
    const next = placeLabels(framed.extents, sides, list.map(b => [b!.offsetWidth, b!.offsetHeight]), { left: 4, right: stage.width - insetRight - 4, top: 4, bottom: stage.height - 4 }, framed);
    setSpots(current => current?.length === next.length && current.every((s, i) => s.x === next[i].x && s.y === next[i].y && s.side === next[i].side) ? current : next);
  }, [framed, sides, stage.width, stage.height, insetRight, compact]);
  useEffect(() => () => { hub?.dispose(); relation?.dispose(); }, [hub, relation]);
  const target = (id: string) => targets.find(t => t.id === id);
  // What was drawn, for the review tools and tests: every scene's source, scale and counts, the links, the time of day.
  const drawn = useMemo(() => JSON.stringify({
    time: environmentId,
    regions: parts.map(p => ({ id: p.id, source: p.scene.source, scale: Math.round(p.placement.scale * 1000) / 1000, islands: p.scene.islands.map(i => i.islandId), bridges: p.scene.region.layout.world.bridges.map(b => b.id),
      landmarks: p.scene.landmarks.map(l => `${l.islandId}:${l.id}`), trees: p.scene.trees.length })),
    links: links.map(l => ({ id: l.id, kind: l.kind })),
  }), [parts, links, environmentId]);
  return <div ref={wrap} className={styles.canvasWrap} style={hovered && target(hovered)?.onOpen ? { cursor: 'pointer' } : undefined} data-shape={shape} data-compact={compact ? 'true' : undefined} data-p9-world={drawn}>
    <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} shadows={STATIC_SHADOW_MAP} camera={{ position: [...WORLD_CAMERA_POSITION], zoom: 10, near: .1, far: 500 }}
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
          onOpen={target(p.id)?.onOpen} onHover={on => setHovered(h => on ? p.id : h === p.id ? null : h)}/>)}
        {/* The world's own links: the hub's causeways in pale stone, the relation bridges as wooden planks (the P8 overview's colours). */}
        {hub && <mesh geometry={hub} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.hub} flatShading roughness={.9}/></mesh>}
        {relation && <mesh geometry={relation} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.relation} flatShading roughness={.9}/></mesh>}
      </GlowProvider>
      <Framing outlines={shownOutlines} links={links} shape={shape} insetRight={insetRight} onFramed={setFramed}/>
    </Canvas>
    {framed && shown.map((t, i) => {
      const common = {
        ref: (element: HTMLElement | null) => { buttons.current[i] = element; }, className: styles.overviewLabel,
        style: { '--region-accent': t.accent, left: spots?.[i].x ?? 0, top: spots?.[i].y ?? 0, visibility: spots ? undefined : 'hidden' } as React.CSSProperties,
        'data-side': spots?.[i].side, 'data-target': t.id, 'data-hovered': hovered === t.id && t.onOpen ? 'true' : undefined,
      };
      const text = <><strong>{(t.name.length > 6 ? t.name.split(/(?<=與)/) : [t.name]).flatMap((part, n) => n ? [<wbr key={n}/>, part] : [part.replace(/ /g, ' ')])}</strong><small className={styles.overviewDetail}>{t.detail}</small></>;
      return t.onOpen
        ? <button key={t.id} type="button" {...common} aria-label={t.label} onClick={t.onOpen}>{text}</button>
        : <div key={t.id} {...common} role="note" aria-label={t.label} data-pending="true">{text}</div>;
    })}
  </div>;
}
