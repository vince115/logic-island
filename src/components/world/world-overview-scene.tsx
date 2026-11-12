'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry, CylinderGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useThree } from '@react-three/fiber';
import type { RegionId } from '@/content/world/types';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { portPoint, type HexWorld } from '@/lib/islands/hex-world';
import { placeLabels, type LabelSpot, type StageBox, type StageLand, type StageLine } from '@/lib/islands/regions/overview-labels';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { HUB_THEME, LINK_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import type { LabelSide, OverviewShape } from '@/lib/islands/regions/schema';
import { LINK_WIDTH, OVERVIEW_HEIGHT, frameOverview, overviewLinks, overviewOutlines, stageLands, stageLines, type OverviewLink, type OverviewOutline, type Placed, type SeaPoint } from '@/lib/islands/regions/world-overview-geometry';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { VIEW } from '../islands/hex-world/hex-camera';
import styles from './world.module.css';

/*
 * World overview scene: the hub and every region placed in WORLD_MAP, as low-detail outlines; no GLB, trees, roads or
 * water effects. Each region is its own islands' tiles shrunk to the width the world map gives it and drawn as two
 * merged meshes (islands with lessons, and planned ones paler) and one for its bridges, in its theme's colors. Three
 * draw calls a region at most.
 *
 * P8.2: nothing here names a region. Which regions are drawn, where and how large comes from WORLD_MAP, their shapes
 * from REGION_LAYOUTS, their colors from REGION_THEMES; a region is loaded as a map only on its own page.
 *
 * P8.3 (D7): the world's links, two more meshes. The hub's link to every region is a pale causeway from the hub to
 * the region's nearest shore; a relation bridge between two neighbouring regions is a plank bridge in a warm wood. Where they
 * run is world-overview-geometry.ts (checked in unit tests); their decks lie lower than any land, so a link can never
 * be drawn over an island, and the labels keep off them (overview-labels.ts).
 */
const { land: LAND_TOP, planned: PLANNED_TOP, link: LINK_TOP } = OVERVIEW_HEIGHT;
const noRaycast = () => undefined;

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
/** Boxes along each segment: one whole, or with `dash` planks `dash` long with a third of that between them. */
function segments(list: [SeaPoint, SeaPoint][], width: number, height: number, dash = 0): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const [[ax, az], [bx, bz]] of list) {
    const length = Math.hypot(bx - ax, bz - az), angle = Math.atan2(bx - ax, bz - az);
    const pieces = dash ? Math.max(1, Math.round(length / (dash * 4 / 3))) : 1, step = length / pieces;
    for (let i = 0; i < pieces; i++) {
      const t = (i + .5) * step / length, piece = dash ? step * .75 : length;
      parts.push(new BoxGeometry(width, height, piece).rotateY(angle).translate(ax + (bx - ax) * t, height / 2, az + (bz - az) * t));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
}

/** Everything the overview draws, in overview units on the sea plane. */
function useOverview(shape: OverviewShape) {
  return useMemo(() => {
    const outlines = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape), links = overviewLinks(WORLD_MAP, outlines);
    const regions = outlines.filter(o => o.id !== 'hub').map(o => {
      const { world, placed } = o, id = o.id as RegionId;
      const open = world.settlements.filter(s => !s.planned).flatMap(s => s.tiles), planned = world.settlements.filter(s => s.planned).flatMap(s => s.tiles);
      const bridges = world.bridges.map(b => [placed.point(...portPoint(world, b.from)), placed.point(...portPoint(world, b.to))] as [SeaPoint, SeaPoint]);
      return { id, open: tilesMesh(world, open, placed, LAND_TOP), planned: tilesMesh(world, planned, placed, PLANNED_TOP), bridges: segments(bridges, Math.max(.12, .5 * placed.scale), LAND_TOP) };
    });
    const hubOutline = outlines.find(o => o.id === 'hub')!;
    const hub = tilesMesh(hubOutline.world, hubOutline.world.settlements[0].tiles, hubOutline.placed, LAND_TOP);
    const ends = (kind: 'hub' | 'relation') => links.filter(l => l.kind === kind).map(l => [l.a, l.b] as [SeaPoint, SeaPoint]);
    const hubLinks = segments(ends('hub'), LINK_WIDTH[shape].hub, LINK_TOP), relationLinks = segments(ends('relation'), LINK_WIDTH[shape].relation, LINK_TOP, shape === 'wide' ? .8 : .55);
    return { regions, hub, hubLinks, relationLinks, links, outlines };
  }, [shape]);
}

/** What the framing reports, on the stage (px): every outline's extent and land, and where each link runs. */
interface Framed { extents: StageBox[]; lines: StageLine[]; lands: StageLand[] }

/**
 * A fixed orthographic view along the map's VIEW that fits every outline with room for its label, left of
 * `insetRight` (frameOverview); then where the outlines, the links and the land are on the stage.
 */
function Framing({ outlines, links, shape, insetRight, onFramed }: { outlines: OverviewOutline[]; links: OverviewLink[]; shape: OverviewShape; insetRight: number; onFramed: (framed: Framed) => void }) {
  const { size, invalidate, get } = useThree();
  useLayoutEffect(() => {
    // The camera is three.js state, set imperatively like camera-controls does in the map.
    const camera = get().camera, frame = frameOverview(outlines, shape, size, insetRight), center = new Vector3(...frame.center);
    camera.position.copy(center).addScaledVector(VIEW, 80);
    camera.lookAt(center);
    camera.zoom = frame.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    onFramed({ extents: frame.boxes, lines: stageLines(frame, links, shape), lands: stageLands(frame, outlines) });
    invalidate();
  }, [get, size, outlines, links, shape, insetRight, invalidate, onFramed]);
  return null;
}

export interface OverviewTarget {
  id: RegionId | 'hub';
  /** The label's text: `name` with `detail` under it on wide screens; `name` alone on phones, where it may wrap after 與. */
  name: string; detail: string;
  /** Accessible name of the label button. */
  label: string;
  accent: string; onOpen: () => void;
}

/** Under this much free stage width (px) the labels are the short ones. */
const COMPACT_BELOW = 720;
/** Where the labels go once they are rendered and measured (overview-labels.ts); null until then. */
function useLabelSpots(framed: Framed | null, sides: LabelSide[], refs: React.RefObject<(HTMLButtonElement | null)[]>, stage: { width: number; height: number; right: number; compact: boolean }) {
  const [spots, setSpots] = useState<LabelSpot[] | null>(null);
  useLayoutEffect(() => {
    const buttons = refs.current.slice(0, sides.length);
    if (!framed || framed.extents.length !== sides.length || !stage.width || buttons.length < sides.length || buttons.some(b => !b)) return;
    // Sizes only (never positions), so the result does not depend on the spots it produced.
    const next = placeLabels(framed.extents, sides, buttons.map(b => [b!.offsetWidth, b!.offsetHeight]), { left: 4, right: stage.width - stage.right - 4, top: 4, bottom: stage.height - 4 }, framed);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- positions come from the rendered buttons' measured sizes
    setSpots(current => current?.length === next.length && current.every((s, i) => s.x === next[i].x && s.y === next[i].y && s.side === next[i].side) ? current : next);
  }, [framed, sides, refs, stage.width, stage.height, stage.right, stage.compact]);
  return spots?.length === sides.length ? spots : null;
}

export default function WorldOverviewScene({ targets, insetRight, label, onReady, onUnavailable, shape }: {
  targets: OverviewTarget[]; insetRight: number; label: string; onReady: () => void; onUnavailable: () => void;
  /** `tall` on phones: the regions in two columns around the hub. */
  shape: OverviewShape;
}) {
  const { regions, hub, hubLinks, relationLinks, links, outlines } = useOverview(shape);
  const [hovered, setHovered] = useState<string | null>(null);
  // Only what the world map places is drawn and labelled; a target without a place stays in the guide alone.
  const shown = useMemo(() => targets.filter(t => outlines.some(o => o.id === t.id)), [targets, outlines]);
  const shownOutlines = useMemo(() => shown.map(t => outlines.find(o => o.id === t.id)!), [shown, outlines]);
  const sides = useMemo(() => shown.map(t => t.id === 'hub' ? WORLD_MAP.hub[shape].label : WORLD_MAP.regions[t.id]![shape].label), [shown, shape]);
  const [framed, setFramed] = useState<Framed | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStage({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Short labels (the name alone) once the free part of the stage is narrow: phones, and a tablet with the guide beside the map.
  const compact = stage.width > 0 && stage.width - insetRight < COMPACT_BELOW;
  const spots = useLabelSpots(framed?.extents.length === shown.length ? framed : null, sides, buttons, { ...stage, right: insetRight, compact });
  useEffect(() => () => { for (const r of regions) [r.open, r.planned, r.bridges].forEach(g => g?.dispose()); [hub, hubLinks, relationLinks].forEach(g => g?.dispose()); }, [regions, hub, hubLinks, relationLinks]);
  const open = (id: string) => targets.find(t => t.id === id)?.onOpen();
  // The links as drawn on the stage (px), for tests and tools: which link, its two ends, its width.
  const drawn = useMemo(() => framed ? JSON.stringify(framed.lines.map(l => ({ ...l, x0: Math.round(l.x0), y0: Math.round(l.y0), x1: Math.round(l.x1), y1: Math.round(l.y1), width: Math.round(l.width * 10) / 10 }))) : undefined, [framed]);
  return <div ref={wrap} className={styles.canvasWrap} style={hovered ? { cursor: 'pointer' } : undefined} data-shape={shape} data-compact={compact ? 'true' : undefined} data-links={drawn}>
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
      {hubLinks && <mesh geometry={hubLinks} raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.hub} flatShading/></mesh>}
      {relationLinks && <mesh geometry={relationLinks} raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.relation} flatShading/></mesh>}
      <Framing outlines={shownOutlines} links={links} shape={shape} insetRight={insetRight} onFramed={setFramed}/>
    </Canvas>
    {/* Rendered at once to be measured, shown once placed: a label's spot depends on its own size. */}
    {framed && shown.map((t, i) => <button key={t.id} type="button" ref={element => { buttons.current[i] = element; }} className={styles.overviewLabel}
      style={{ '--region-accent': t.accent, left: spots?.[i].x ?? 0, top: spots?.[i].y ?? 0, visibility: spots ? undefined : 'hidden' } as React.CSSProperties}
      aria-label={t.label} data-side={spots?.[i].side} data-target={t.id} data-hovered={hovered === t.id ? 'true' : undefined} onClick={t.onOpen}>
      {/* A long name may break after its 與 (phones only: the label does not wrap on wide screens), and nowhere else. */}
      <strong>{(t.name.length > 6 ? t.name.split(/(?<=與)/) : [t.name]).flatMap((part, n) => n ? [<wbr key={n}/>, part] : [part.replace(/ /g, '\u00a0')])}</strong><small className={styles.overviewDetail}>{t.detail}</small>
    </button>)}
  </div>;
}
