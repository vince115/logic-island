'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Box3, BoxGeometry, CylinderGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useThree } from '@react-three/fiber';
import { hexEdgeMidpoint, hexToWorld, type Axial } from '@/lib/islands/hex';
import { portPoint, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { islandsHomeWorld, LAB_ISLAND_ID } from '@/lib/islands/islands-world';
import { VIEW } from '../islands/hex-world/hex-camera';
import type { RegionId } from '@/content/world/types';
import styles from './world.module.css';

/*
 * M3.1 world overview: the two regions and the hub as low-detail outlines, no GLB, trees, roads or water effects.
 * Each region is its own islands' tiles shrunk to one size and drawn as two merged meshes (islands with lessons, and
 * planned ones paler), its bridges one more; the ferry routes from each region's docks to the hub are one mesh of
 * dashes. About ten draw calls in all. The north and south of the sea stay free for later regions.
 */
const REGION_WIDTH = 22, HUB_SCALE = .45;
/*
 * Where each part sits on the sea: side by side on wide screens; on phones (portrait) one above the other, along the
 * view's screen-up direction (from the south-east, screen up is north-west on the map).
 */
const ANCHORS: Record<'wide' | 'tall', Record<RegionId | 'hub', [number, number]>> = {
  wide: { cs: [-24, 0], hub: [0, 2], ai: [24, 0] },
  tall: { cs: [-13, -20], hub: [0, 0], ai: [13, 20] },
};
const COLORS: Record<RegionId, { open: string; planned: string; bridge: string }> = {
  // Computer science: the warm lawn and wood of the home map. Artificial intelligence: cool mineral greys.
  cs: { open: '#9cc98a', planned: '#e4dfcf', bridge: '#a77b52' },
  ai: { open: '#8fb3c9', planned: '#cdd6e1', bridge: '#7d8a99' },
};
const HUB_COLOR = '#c8b6e8';
const noRaycast = () => undefined;

type Placed = { point: (x: number, z: number) => [number, number]; scale: number };
/** Shrinks a world onto its anchor: `width` across its longest side. */
function placing(world: HexWorld, anchor: [number, number], width: number | null, scale?: number): Placed {
  const [cx, cz] = worldCenter(world);
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  const span = Math.max(...[0, 1].map(i => Math.max(...all.map(p => p[i])) - Math.min(...all.map(p => p[i]))));
  const k = scale ?? width! / span;
  return { scale: k, point: (x, z) => [anchor[0] + (x - cx) * k, anchor[1] + (z - cz) * k] };
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

/** Everything the overview draws, in overview units on the sea plane. */
function useOverview(shape: 'wide' | 'tall') {
  return useMemo(() => {
    const regions = (['cs', 'ai'] as const).map(id => {
      const { layout, docks } = REGION_LAYOUTS[id], world = layout.world, placed = placing(world, ANCHORS[shape][id], REGION_WIDTH);
      const open = world.settlements.filter(s => !s.planned).flatMap(s => s.tiles), planned = world.settlements.filter(s => s.planned).flatMap(s => s.tiles);
      const bridges = world.bridges.map(b => [placed.point(...portPoint(world, b.from)), placed.point(...portPoint(world, b.to))] as [[number, number], [number, number]]);
      const dockPoints = docks.map(d => {
        const spur = world.settlements.find(s => s.islandId === d.islandId)!.spurs!.find(s => s.id === d.spurId)!;
        return placed.point(...hexEdgeMidpoint(spur.tile, spur.edge!, world.size));
      });
      return { id, placed, open: tilesMesh(world, open, placed, .5), planned: tilesMesh(world, planned, placed, .32), bridges: segments(bridges, .18, .5), docks: dockPoints };
    });
    const lab = islandsHomeWorld.world.settlements.find(s => s.islandId === LAB_ISLAND_ID)!;
    const hubWorld: HexWorld = { size: islandsHomeWorld.world.size, settlements: [lab], bridges: [] };
    const hubPlaced = placing(hubWorld, ANCHORS[shape].hub, null, HUB_SCALE);
    const hub = tilesMesh(hubWorld, lab.tiles, hubPlaced, .5);
    const hubPoint = ANCHORS[shape].hub;
    const ferries = segments(regions.flatMap(r => r.docks.map(d => [d, hubPoint] as [[number, number], [number, number]])), .16, .06, .7);
    // Each label hangs just below (screen-wise, south of) what it names.
    const box = (...list: (BufferGeometry | null)[]) => {
      const out = new Box3();
      for (const g of list) if (g) { g.computeBoundingBox(); out.union(g.boundingBox!); }
      return out;
    };
    const extents: Record<RegionId | 'hub', Box3> = { cs: box(regions[0].open, regions[0].planned), ai: box(regions[1].open, regions[1].planned), hub: box(hub) };
    return { regions, hub, ferries, extents };
  }, [shape]);
}

/**
 * A fixed orthographic view along the map's VIEW that fits the outlines and their labels, left of `insetRight`; then
 * where each label point lands on the stage, for the HTML labels over the canvas.
 */
function Framing({ points, labels, insetRight, onLabels }: { points: Vector3[]; labels: Vector3[]; insetRight: number; onLabels: (at: [number, number][]) => void }) {
  const { size, invalidate, get } = useThree();
  useLayoutEffect(() => {
    // The camera is three.js state, set imperatively like camera-controls does in the map.
    const camera = get().camera;
    const up0 = new Vector3(0, 1, 0), right = new Vector3().crossVectors(up0, VIEW).normalize(), up = new Vector3().crossVectors(VIEW, right);
    const rs = points.map(p => p.dot(right)), us = points.map(p => p.dot(up));
    const [r0, r1, u0, u1] = [Math.min(...rs), Math.max(...rs), Math.min(...us), Math.max(...us)];
    const zoom = Math.min((size.width - insetRight) / ((r1 - r0) * 1.1), size.height / ((u1 - u0) * 1.2));
    // Shift the view so the outlines sit in the free part of the stage, left of the guide.
    const center = right.clone().multiplyScalar((r0 + r1) / 2 + insetRight / 2 / zoom).addScaledVector(up, (u0 + u1) / 2);
    camera.position.copy(center).addScaledVector(VIEW, 80);
    camera.lookAt(center);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    onLabels(labels.map(p => { const v = p.clone().project(camera); return [(v.x + 1) / 2 * size.width, (1 - v.y) / 2 * size.height]; }));
    invalidate();
  }, [get, size, points, labels, insetRight, invalidate, onLabels]);
  return null;
}

export interface OverviewTarget { id: RegionId | 'hub'; label: string; detail: string; accent: string; onOpen: () => void }

export default function WorldOverviewScene({ targets, insetRight, label, onReady, onUnavailable, shape }: {
  targets: OverviewTarget[]; insetRight: number; label: string; onReady: () => void; onUnavailable: () => void;
  /** `tall` on phones: the regions one above the other. */
  shape: 'wide' | 'tall';
}) {
  const { regions, hub, ferries, extents } = useOverview(shape);
  const [hovered, setHovered] = useState<string | null>(null);
  // Each label hangs just south of what it names; HTML buttons over the canvas, placed from the camera.
  const labelPoints = useMemo(() => targets.map(t => { const b = extents[t.id]; return new Vector3((b.min.x + b.max.x) / 2, .5, b.max.z + 1.6); }), [targets, extents]);
  const [labelAt, setLabelAt] = useState<[number, number][]>([]);
  // The outlines, and room for the labels under them.
  // All four corners: seen diagonally, a box's screen extremes are any of them.
  const points = useMemo(() => Object.values(extents).flatMap(b => [b.min.x, b.max.x].flatMap(x => [b.min.z, b.max.z + 4].map(z => new Vector3(x, 0, z)))), [extents]);
  useEffect(() => () => { for (const r of regions) [r.open, r.planned, r.bridges].forEach(g => g?.dispose()); hub?.dispose(); ferries?.dispose(); }, [regions, hub, ferries]);
  const open = (id: string) => targets.find(t => t.id === id)?.onOpen();
  return <div className={styles.canvasWrap} style={hovered ? { cursor: 'pointer' } : undefined}>
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
        {r.open && <mesh geometry={r.open}><meshStandardMaterial color={COLORS[r.id].open} flatShading/></mesh>}
        {r.planned && <mesh geometry={r.planned}><meshStandardMaterial color={COLORS[r.id].planned} flatShading transparent opacity={.85}/></mesh>}
        {r.bridges && <mesh geometry={r.bridges} raycast={noRaycast}><meshStandardMaterial color={COLORS[r.id].bridge} flatShading/></mesh>}
      </group>)}
      {hub && <mesh geometry={hub} onClick={event => { event.stopPropagation(); open('hub'); }}
        onPointerOver={() => setHovered('hub')} onPointerOut={() => setHovered(h => h === 'hub' ? null : h)}><meshStandardMaterial color={HUB_COLOR} flatShading/></mesh>}
      {ferries && <mesh geometry={ferries} raycast={noRaycast}><meshStandardMaterial color="#f4f6f8" flatShading/></mesh>}
      <Framing points={points} labels={labelPoints} insetRight={insetRight} onLabels={setLabelAt}/>
    </Canvas>
    {labelAt.length === targets.length && targets.map((t, i) => <button key={t.id} type="button" className={styles.overviewLabel}
      style={{ '--region-accent': t.accent, left: labelAt[i][0], top: labelAt[i][1] } as React.CSSProperties}
      aria-label={t.label} data-hovered={hovered === t.id ? 'true' : undefined} onClick={t.onOpen}>
      <strong>{t.label.replace(/^(進入|前往)/, '')}</strong><small>{t.detail}</small>
    </button>)}
  </div>;
}
