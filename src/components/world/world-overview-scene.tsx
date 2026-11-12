'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, CylinderGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useThree } from '@react-three/fiber';
import type { RegionId } from '@/content/world/types';
import { hexEdgeMidpoint, hexToWorld, type Axial } from '@/lib/islands/hex';
import { portPoint, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { HUB_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import type { LabelSide, OverviewPlacement, OverviewShape } from '@/lib/islands/regions/schema';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { VIEW } from '../islands/hex-world/hex-camera';
import styles from './world.module.css';

/*
 * World overview scene: the hub and every region placed in WORLD_MAP, as low-detail outlines; no GLB, trees, roads or
 * water effects. Each region is its own islands' tiles shrunk to the width the world map gives it and drawn as two
 * merged meshes (islands with lessons, and planned ones paler) and one for its bridges, in its theme's colors; the
 * ferry routes from each region's docks to the hub are one mesh of dashes. Three draw calls a region at most.
 *
 * P8.2: nothing here names a region. Which regions are drawn, where and how large comes from WORLD_MAP, their shapes
 * from REGION_LAYOUTS, their colors from REGION_THEMES; a region is loaded as a map only on its own page.
 */
const UP = new Vector3(0, 1, 0);
// The sea plane's screen-aligned axes for VIEW: `RIGHT` runs to the right of the screen, `AWAY` from the viewer.
const RIGHT = new Vector3().crossVectors(UP, VIEW).normalize();
const AWAY = new Vector3(-VIEW.x, 0, -VIEW.z).normalize();
const onSea = ([right, away]: readonly [number, number]): [number, number] => [RIGHT.x * right + AWAY.x * away, RIGHT.z * right + AWAY.z * away];
const LAND_TOP = .5, PLANNED_TOP = .32;
const noRaycast = () => undefined;

type Placed = { point: (x: number, z: number) => [number, number]; scale: number };
/** Shrinks a world onto its place: `width` across its longest side. */
function placing(world: HexWorld, { at, width }: OverviewPlacement): Placed {
  const [cx, cz] = worldCenter(world), anchor = onSea(at);
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  const span = Math.max(...[0, 1].map(i => Math.max(...all.map(p => p[i])) - Math.min(...all.map(p => p[i])))) + world.size * 2;
  const scale = width / span;
  return { scale, point: (x, z) => [anchor[0] + (x - cx) * scale, anchor[1] + (z - cz) * scale] };
}
function tilesMesh(world: HexWorld, tiles: Axial[], placed: Placed, top: number): BufferGeometry | null {
  if (!tiles.length) return null;
  const parts = tiles.map(t => {
    const [x, z] = placed.point(...hexToWorld(t, world.size)), r = world.size * placed.scale * .97;
    return new CylinderGeometry(r, r, top, 6).rotateY(Math.PI / 6).translate(x, top / 2, z);
  });
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
}
function segments(list: [[number, number], [number, number]][], width: number, height: number, dash = 0): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const [[ax, az], [bx, bz]] of list) {
    const length = Math.hypot(bx - ax, bz - az), angle = Math.atan2(bx - ax, bz - az);
    const pieces = dash ? Math.max(1, Math.floor(length / (dash * 2))) : 1, step = dash ? length / pieces : length;
    for (let i = 0; i < pieces; i++) {
      const t = (i + .5) * step / length, piece = dash ? step / 2 : length;
      parts.push(new BoxGeometry(width, height, piece).rotateY(angle).translate(ax + (bx - ax) * t, height / 2, az + (bz - az) * t));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
}

/** What one target (a region or the hub) covers on the sea, for framing and for hanging its label: tile centers and a tile's radius. */
interface Extent { points: Vector3[]; radius: number; side: LabelSide }
const extentOf = (world: HexWorld, tiles: Axial[], placed: Placed, side: LabelSide): Extent =>
  ({ points: tiles.map(t => { const [x, z] = placed.point(...hexToWorld(t, world.size)); return new Vector3(x, LAND_TOP, z); }), radius: world.size * placed.scale, side });

/** Everything the overview draws, in overview units on the sea plane. */
function useOverview(shape: OverviewShape) {
  return useMemo(() => {
    const regions = (Object.keys(WORLD_MAP.regions) as RegionId[]).flatMap(id => {
      const region = REGION_LAYOUTS[id], place = WORLD_MAP.regions[id]![shape];
      if (!region) return [];
      const world = region.layout.world, placed = placing(world, place);
      const open = world.settlements.filter(s => !s.planned).flatMap(s => s.tiles), planned = world.settlements.filter(s => s.planned).flatMap(s => s.tiles);
      const bridges = world.bridges.map(b => [placed.point(...portPoint(world, b.from)), placed.point(...portPoint(world, b.to))] as [[number, number], [number, number]]);
      const docks = region.docks.map(d => {
        const spur = world.settlements.find(s => s.islandId === d.islandId)!.spurs!.find(s => s.id === d.spurId)!;
        return placed.point(...hexEdgeMidpoint(spur.tile, spur.edge!, world.size));
      });
      return [{ id, open: tilesMesh(world, open, placed, LAND_TOP), planned: tilesMesh(world, planned, placed, PLANNED_TOP), bridges: segments(bridges, Math.max(.12, .5 * placed.scale), LAND_TOP),
        docks, extent: extentOf(world, [...open, ...planned], placed, place.label) }];
    });
    const lab = islandsHomeWorld.world.settlements.find(s => s.islandId === WORLD_MAP.hub.islandId)!;
    const hubWorld: HexWorld = { size: islandsHomeWorld.world.size, settlements: [lab], bridges: [] };
    const hubPlace = WORLD_MAP.hub[shape], hubPlaced = placing(hubWorld, hubPlace), hubPoint = onSea(hubPlace.at);
    const hub = tilesMesh(hubWorld, lab.tiles, hubPlaced, LAND_TOP);
    const ferries = segments(regions.flatMap(r => r.docks.map(d => [d, hubPoint] as [[number, number], [number, number]])), .16, .06, .7);
    const extents: Record<string, Extent> = { ...Object.fromEntries(regions.map(r => [r.id, r.extent])), hub: extentOf(hubWorld, lab.tiles, hubPlaced, hubPlace.label) };
    return { regions, hub, ferries, extents };
  }, [shape]);
}

/** A label's place on the stage (px): the point it hangs from and the side of its outline it hangs on. */
export interface LabelPlace { x: number; y: number; side: LabelSide }
/** Room kept around the outlines (px): the site header floats over a wide stage, and labels hang above and below. */
const ROOM = { wide: { top: 132, bottom: 84, side: 28 }, tall: { top: 52, bottom: 46, side: 14 } } as const;

/**
 * A fixed orthographic view along the map's VIEW that fits every outline with room for its label, left of
 * `insetRight`; then where each label hangs, from the outline's own extent on screen.
 */
function Framing({ extents, shape, insetRight, onLabels }: { extents: Extent[]; shape: OverviewShape; insetRight: number; onLabels: (at: LabelPlace[]) => void }) {
  const { size, invalidate, get } = useThree();
  useLayoutEffect(() => {
    // The camera is three.js state, set imperatively like camera-controls does in the map.
    const camera = get().camera, room = ROOM[shape];
    const right = RIGHT, up = new Vector3().crossVectors(VIEW, right);
    const reach = extents.map(e => { const rs = e.points.map(p => p.dot(right)), us = e.points.map(p => p.dot(up)); return [Math.min(...rs) - e.radius, Math.max(...rs) + e.radius, Math.min(...us) - e.radius, Math.max(...us) + e.radius]; });
    const [r0, r1, u0, u1] = [Math.min(...reach.map(r => r[0])), Math.max(...reach.map(r => r[1])), Math.min(...reach.map(r => r[2])), Math.max(...reach.map(r => r[3]))];
    const free = { width: size.width - insetRight - room.side * 2, height: size.height - room.top - room.bottom };
    const zoom = Math.max(1, Math.min(free.width / (r1 - r0), free.height / (u1 - u0)));
    // The outlines sit in the middle of the free part of the stage: left of the guide, between the label rooms.
    const center = right.clone().multiplyScalar((r0 + r1) / 2 + insetRight / 2 / zoom).addScaledVector(up, (u0 + u1) / 2 + (room.top - room.bottom) / 2 / zoom);
    camera.position.copy(center).addScaledVector(VIEW, 80);
    camera.lookAt(center);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const cr = center.dot(right), cu = center.dot(up), gap = 8;
    onLabels(reach.map(([a, b, c, d], i) => {
      const x0 = size.width / 2 + (a - cr) * zoom, x1 = size.width / 2 + (b - cr) * zoom, y0 = size.height / 2 - (d - cu) * zoom, y1 = size.height / 2 - (c - cu) * zoom;
      const side = extents[i].side;
      return side === 'above' ? { x: (x0 + x1) / 2, y: y0 - gap, side } : side === 'below' ? { x: (x0 + x1) / 2, y: y1 + gap, side }
        : side === 'left' ? { x: x0 - gap, y: (y0 + y1) / 2, side } : { x: x1 + gap, y: (y0 + y1) / 2, side };
    }));
    invalidate();
  }, [get, size, extents, shape, insetRight, invalidate, onLabels]);
  return null;
}

export interface OverviewTarget {
  id: RegionId | 'hub';
  /** The label's text: `name` with `detail` under it on wide screens, `name` with `brief` beside it on phones. */
  name: string; brief: string; detail: string;
  /** Accessible name of the label button. */
  label: string;
  accent: string; onOpen: () => void;
}

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box, margin: number) => a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
/** A label's box on the stage for the point it hangs from, the side it hangs on and its own size. */
const boxAt = ({ x, y, side }: LabelPlace, width: number, height: number): Box => side === 'above' ? { x: x - width / 2, y: y - height, width, height }
  : side === 'below' ? { x: x - width / 2, y, width, height } : side === 'left' ? { x: x - width, y: y - height / 2, width, height } : { x, y: y - height / 2, width, height };
/**
 * How far each label moves from its point so that all stay apart and inside the free part of the stage: a label that
 * would touch an earlier one moves the short way out of it (down or sideways). A pure function of where the labels
 * hang and how large they are, so it settles in one step for any text length and font.
 */
export function labelNudges(places: LabelPlace[], sizes: [number, number][], free: { left: number; right: number }): [number, number][] {
  const base = places.map((p, i) => boxAt(p, sizes[i][0], sizes[i][1]));
  const next: [number, number][] = base.map(() => [0, 0]);
  const moved = (i: number): Box => ({ ...base[i], x: base[i].x + next[i][0], y: base[i].y + next[i][1] });
  for (let pass = 0; pass < 8; pass++) {
    let clear = true;
    for (let i = 0; i < base.length; i++) {
      if (free.right > free.left) { // Inside the free part of the stage first.
        const r = moved(i);
        if (r.x < free.left) next[i][0] += free.left - r.x; else if (r.x + r.width > free.right) next[i][0] -= r.x + r.width - free.right;
      }
      for (let j = 0; j < i; j++) {
        const a = moved(i), b = moved(j);
        if (!overlap(a, b, 4)) continue;
        clear = false;
        const down = b.y + b.height + 4 - a.y, side = a.x + a.width / 2 < b.x + b.width / 2 ? -(a.x + a.width + 4 - b.x) : b.x + b.width + 4 - a.x;
        const fits = a.x + side >= free.left && a.x + a.width + side <= free.right;
        if (fits && Math.abs(side) < down) next[i][0] += side; else next[i][1] += down;
      }
    }
    if (clear) break;
  }
  return next.map(([x, y]) => [Math.round(x), Math.round(y)]);
}
function useLabelNudges(labels: LabelPlace[], refs: React.RefObject<(HTMLButtonElement | null)[]>, free: { width: number; right: number }) {
  const [nudges, setNudges] = useState<[number, number][]>([]);
  useLayoutEffect(() => {
    const buttons = refs.current.slice(0, labels.length);
    if (!labels.length || buttons.length < labels.length || buttons.some(b => !b)) return;
    // Sizes only (never positions), so the result does not depend on the nudges it produced.
    const next = labelNudges(labels, buttons.map(b => [b!.offsetWidth, b!.offsetHeight]), { left: 4, right: free.width - free.right - 4 });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- positions come from the rendered buttons' measured sizes
    setNudges(current => current.length === next.length && current.every((n, i) => n[0] === next[i][0] && n[1] === next[i][1]) ? current : next);
  }, [labels, refs, free.width, free.right]);
  return nudges;
}

export default function WorldOverviewScene({ targets, insetRight, label, onReady, onUnavailable, shape }: {
  targets: OverviewTarget[]; insetRight: number; label: string; onReady: () => void; onUnavailable: () => void;
  /** `tall` on phones: the regions in two columns around the hub. */
  shape: OverviewShape;
}) {
  const { regions, hub, ferries, extents } = useOverview(shape);
  const [hovered, setHovered] = useState<string | null>(null);
  // Only what the world map places is drawn and labelled; a target without a place stays in the guide alone.
  const shown = useMemo(() => targets.filter(t => extents[t.id]), [targets, extents]);
  const shownExtents = useMemo(() => shown.map(t => extents[t.id]), [shown, extents]);
  const [labelAt, setLabelAt] = useState<LabelPlace[]>([]);
  const [stageWidth, setStageWidth] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStageWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const nudges = useLabelNudges(labelAt.length === shown.length ? labelAt : [], buttons, { width: stageWidth, right: insetRight });
  useEffect(() => () => { for (const r of regions) [r.open, r.planned, r.bridges].forEach(g => g?.dispose()); hub?.dispose(); ferries?.dispose(); }, [regions, hub, ferries]);
  const open = (id: string) => targets.find(t => t.id === id)?.onOpen();
  return <div ref={wrap} className={styles.canvasWrap} style={hovered ? { cursor: 'pointer' } : undefined} data-shape={shape}>
    <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 40, 60], zoom: 10, near: .1, far: 400 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.setAttribute('aria-label', label); canvas.setAttribute('role', 'img');
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onUnavailable(); });
        onReady();
      }}>
      <color attach="background" args={['#8fcbe4']}/>
      <ambientLight intensity={1.6}/>
      <directionalLight position={[20, 40, 25]} intensity={1.6}/>
      <mesh rotation-x={-Math.PI / 2} position-y={-.05} raycast={noRaycast}><planeGeometry args={[400, 400]}/><meshStandardMaterial color="#7cc3e0" roughness={.9}/></mesh>
      {regions.map(r => <group key={r.id} onClick={event => { event.stopPropagation(); open(r.id); }}
        onPointerOver={() => setHovered(r.id)} onPointerOut={() => setHovered(h => h === r.id ? null : h)}>
        {r.open && <mesh geometry={r.open}><meshStandardMaterial color={REGION_THEMES[r.id].land} flatShading/></mesh>}
        {r.planned && <mesh geometry={r.planned}><meshStandardMaterial color={REGION_THEMES[r.id].plannedLand} flatShading transparent opacity={.9}/></mesh>}
        {r.bridges && <mesh geometry={r.bridges} raycast={noRaycast}><meshStandardMaterial color={REGION_THEMES[r.id].bridge} flatShading/></mesh>}
      </group>)}
      {hub && <mesh geometry={hub} onClick={event => { event.stopPropagation(); open('hub'); }}
        onPointerOver={() => setHovered('hub')} onPointerOut={() => setHovered(h => h === 'hub' ? null : h)}><meshStandardMaterial color={HUB_THEME.land} flatShading/></mesh>}
      {ferries && <mesh geometry={ferries} raycast={noRaycast}><meshStandardMaterial color="#f4f6f8" flatShading/></mesh>}
      <Framing extents={shownExtents} shape={shape} insetRight={insetRight} onLabels={setLabelAt}/>
    </Canvas>
    {labelAt.length === shown.length && shown.map((t, i) => <button key={t.id} type="button" ref={element => { buttons.current[i] = element; }} className={styles.overviewLabel}
      style={{ '--region-accent': t.accent, left: labelAt[i].x + (nudges[i]?.[0] ?? 0), top: labelAt[i].y + (nudges[i]?.[1] ?? 0) } as React.CSSProperties}
      aria-label={t.label} data-side={labelAt[i].side} data-target={t.id} data-hovered={hovered === t.id ? 'true' : undefined} onClick={t.onOpen}>
      <strong>{t.name}</strong><small className={styles.overviewDetail}>{t.detail}</small><small className={styles.overviewBrief}>{t.brief}</small>
    </button>)}
  </div>;
}
