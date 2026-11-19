'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Object3D, OctahedronGeometry,
  PCFShadowMap, Quaternion, SphereGeometry, TorusGeometry, Vector3, type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Canvas, useThree } from '@react-three/fiber';
import { placeLabels, type LabelSpot, type StageBox, type StageLand, type StageLine } from '@/lib/islands/regions/overview-labels';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import type { LabelSide, OverviewShape } from '@/lib/islands/regions/schema';
import { LINK_WIDTH, frameOverview, overviewLinks, overviewOutlines, stageLands, stageLines, type OverviewLink, type OverviewOutline } from '@/lib/islands/regions/world-overview-geometry';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { LANDMARK_ISLAND, P9_WORLD_MAP } from '@/lib/p9/world-map';
import { BIOMES, SEA, regionField, sampleHeight, shorePoint, terrainMesh, treeSpots, type BiomeId, type TreeKind } from '@/lib/p9/world-terrain';
import { VIEW } from '../islands/hex-world/hex-camera';
import styles from '../world/world.module.css';

/*
 * P9.1 visual prototype: the world overview as five archipelagos with relief, coasts, woods and a landmark each,
 * around the hub, in place of the P8 overview's shrunken hex tiles. Same data as the P8 overview (WORLD_MAP for where
 * the regions sit and how they are linked, REGION_LAYOUTS for each region's islands), same fixed orthographic view,
 * same label placement; only what is drawn changed. Review page only (src/app/p9): /world does not load this file.
 *
 * Draw calls: one terrain mesh a region and the hub (6), three instanced tree kinds, the landmarks (2: solid, glowing),
 * the links (1), the sea and its floor (2).
 */
const noRaycast = () => undefined;

/* ------------------------------------------------------------------ merged, vertex-coloured parts */

type Part = { geometry: BufferGeometry; color: string; at: [number, number, number]; turn?: number; tilt?: number; scale?: [number, number, number] };
/** One mesh from many primitives: each takes its place and a flat colour (as a vertex colour). */
function mergeParts(parts: Part[]): BufferGeometry | null {
  if (!parts.length) return null;
  const up = new Vector3(0, 1, 0), side = new Vector3(1, 0, 0);
  const placed = parts.map(({ geometry, color, at, turn = 0, tilt = 0, scale = [1, 1, 1] }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const q = new Quaternion().setFromAxisAngle(up, turn).multiply(new Quaternion().setFromAxisAngle(side, tilt));
    g.applyMatrix4(new Matrix4().compose(new Vector3(...at), q, new Vector3(...scale)));
    const c = new Color(color), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(placed);
  placed.forEach(g => g.dispose());
  parts.forEach(p => p.geometry.dispose());
  return merged;
}
const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (top: number, bottom: number, h: number, sides = 10) => new CylinderGeometry(top, bottom, h, sides);
const cone = (r: number, h: number, sides = 8) => new ConeGeometry(r, h, sides);

/**
 * A region's landmark, in its own units (about 1 = a tile's radius) standing on y = 0, and the parts of it that glow.
 * Flat-shaded primitives in the language of the home map's placeholder landmarks: a silhouette to tell the regions
 * apart from far away, not a building to enter.
 */
function landmark(id: BiomeId): { solid: Part[]; glow: Part[] } {
  switch (id) {
    case 'cs': return { // The lighthouse of the foundations island, and the workshop beside it.
      solid: [
        { geometry: cyl(.95, 1.1, .5), color: '#b9b2a4', at: [0, .25, 0] },
        { geometry: cyl(.42, .62, 3.4), color: '#f6f3ea', at: [0, 2.2, 0] },
        { geometry: cyl(.5, .54, .5), color: '#3f7fd6', at: [0, 2, 0] },
        { geometry: cyl(.62, .62, .14), color: '#3a5f8f', at: [0, 3.96, 0] },
        { geometry: cone(.56, .7), color: '#2f5f9f', at: [0, 4.92, 0] },
        { geometry: box(1.5, .9, 1.1), color: '#f2e5cb', at: [1.75, .45, .55], turn: .35 },
        { geometry: cone(1.15, .7, 4), color: '#3f6fb0', at: [1.75, 1.25, .55], turn: .35 + Math.PI / 4 },
      ],
      glow: [{ geometry: cyl(.36, .36, .55), color: '#ffe08a', at: [0, 4.3, 0] }],
    };
    case 'ai': return { // A stepped tower with a ring turning about it and a crystal at its head.
      solid: [
        { geometry: cyl(1.05, 1.2, 1.1, 6), color: '#5f6f8f', at: [0, .55, 0] },
        { geometry: cyl(.78, .9, 1.1, 6), color: '#7386a8', at: [0, 1.65, 0], turn: Math.PI / 6 },
        { geometry: cyl(.52, .64, 1.1, 6), color: '#8fa3c4', at: [0, 2.75, 0] },
        { geometry: new TorusGeometry(1.45, .1, 6, 28), color: '#dfe9f6', at: [0, 2.5, 0], tilt: Math.PI / 2 - .32 },
        { geometry: new OctahedronGeometry(.42), color: '#cdbdf7', at: [-1.7, .5, .9], scale: [1, 1.7, 1] },
        { geometry: new OctahedronGeometry(.32), color: '#9fdcf2', at: [1.5, .4, -1.1], scale: [1, 1.6, 1] },
      ],
      glow: [{ geometry: new OctahedronGeometry(.5), color: '#9be7ff', at: [0, 4.05, 0], scale: [1, 1.5, 1] }],
    };
    case 'design': return { // A gateway over a round court, with swatch blocks and a sphere on a plinth.
      solid: [
        { geometry: cyl(2, 2, .12, 20), color: '#fff3ea', at: [0, .06, 0] },
        { geometry: box(.42, 3, .42), color: '#e0668f', at: [-1.05, 1.5, 0] },
        { geometry: box(.42, 3, .42), color: '#e0668f', at: [1.05, 1.5, 0] },
        { geometry: box(2.9, .42, .5), color: '#f2b84b', at: [0, 3.2, 0] },
        { geometry: box(.7, .7, .7), color: '#4aa3d9', at: [-1.6, .47, 1.1], turn: .3 },
        { geometry: box(.6, .6, .6), color: '#7ccf8f', at: [-1.45, 1.12, 1.05], turn: .7 },
        { geometry: cyl(.3, .36, .7, 8), color: '#f6e9df', at: [1.5, .47, 1.1] },
      ],
      glow: [{ geometry: new IcosahedronGeometry(.46, 1), color: '#ffd166', at: [1.5, 1.28, 1.1] }],
    };
    case 'web': return { // A harbour city: sandstone towers with window bands and a framed screen facing the sea.
      solid: [
        { geometry: box(1, 3.6, 1), color: '#e6b877', at: [-.2, 1.8, -.3] },
        { geometry: box(.9, 2.5, .9), color: '#d99a55', at: [1.05, 1.25, .1] },
        { geometry: box(1.1, 1.7, 1), color: '#f0cf9a', at: [-1.35, .85, .4] },
        { geometry: cone(.78, .7, 4), color: '#b9603a', at: [-.2, 3.95, -.3], turn: Math.PI / 4 },
        { geometry: box(2.3, .16, 1.3), color: '#8a5a3a', at: [.4, .08, 1.5] },
        { geometry: box(1.9, 1.25, .12), color: '#5a3d2c', at: [.4, .95, 1.5] },
      ],
      glow: [
        { geometry: box(1.66, .92, .08), color: '#8fe3ff', at: [.4, .9, 1.58] },
        { geometry: box(.7, .1, 1.02), color: '#ffe3a8', at: [-.2, 2.6, -.3] },
        { geometry: box(.62, .1, .92), color: '#ffe3a8', at: [1.05, 1.7, .1] },
      ],
    };
    case 'sys': return { // Cooling towers, server halls in rows and a mast with a beacon.
      solid: [
        { geometry: cyl(.62, .95, 1.7, 12), color: '#cfe1e3', at: [-1.1, .85, -.5] },
        { geometry: cyl(.7, .62, .5, 12), color: '#cfe1e3', at: [-1.1, 1.95, -.5] },
        { geometry: cyl(.52, .8, 1.4, 12), color: '#b9d2d6', at: [.2, .7, -1] },
        { geometry: cyl(.58, .52, .4, 12), color: '#b9d2d6', at: [.2, 1.6, -1] },
        { geometry: box(2.4, .7, .7), color: '#2f5560', at: [.3, .35, .5] },
        { geometry: box(2.4, .7, .7), color: '#2f5560', at: [.3, .35, 1.45] },
        { geometry: cyl(.07, .1, 4.2, 6), color: '#e8f1f2', at: [1.75, 2.1, -.4] },
        { geometry: box(.9, .07, .07), color: '#e8f1f2', at: [1.75, 3.2, -.4] },
        { geometry: box(.6, .07, .07), color: '#e8f1f2', at: [1.75, 3.7, -.4] },
      ],
      glow: [
        { geometry: box(2.3, .12, .04), color: '#7ff0d8', at: [.3, .45, .86] },
        { geometry: box(2.3, .12, .04), color: '#7ff0d8', at: [.3, .45, 1.81] },
        { geometry: new IcosahedronGeometry(.16, 0), color: '#ff6b5a', at: [1.75, 4.28, -.4] },
      ],
    };
    default: return { // The hub: the lab's glass dome on a drum, with a ring.
      solid: [
        { geometry: cyl(1.5, 1.6, .4, 16), color: '#efe9f8', at: [0, .2, 0] },
        { geometry: new TorusGeometry(1.75, .08, 6, 28), color: '#8a4fd1', at: [0, .42, 0], tilt: Math.PI / 2 },
        { geometry: box(.5, .9, .5), color: '#4285f4', at: [-2, .45, .8], turn: .4 },
        { geometry: box(.4, .6, .4), color: '#0f9d58', at: [-2.05, 1.2, .78], turn: .9 },
      ],
      glow: [{ geometry: new SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: '#c9b3f5', at: [0, .4, 0] }],
    };
  }
}
/** How large each landmark is drawn (tile radii per landmark unit). */
const LANDMARK_SCALE: Record<BiomeId, number> = { cs: 1.4, ai: 1.4, design: 1.3, web: 1.3, sys: 1.35, hub: .8 };

function treeGeometry(kind: TreeKind): BufferGeometry {
  const parts: Part[] = kind === 'broadleaf' ? [
    { geometry: new CylinderGeometry(.07, .1, .5, 4, 1, true), color: '#8a6a4c', at: [0, .25, 0] },
    { geometry: new IcosahedronGeometry(.46, 0), color: '#ffffff', at: [0, .84, 0], scale: [1, 1.05, 1] },
  ] : kind === 'conifer' ? [
    { geometry: new CylinderGeometry(.06, .09, .4, 4, 1, true), color: '#7a5c44', at: [0, .2, 0] },
    { geometry: new ConeGeometry(.42, .7, 5, 1, true), color: '#ffffff', at: [0, .7, 0] },
    { geometry: new ConeGeometry(.3, .6, 5, 1, true), color: '#f0f0f0', at: [0, 1.12, 0] },
  ] : [
    { geometry: new OctahedronGeometry(.3), color: '#ffffff', at: [0, .52, 0], scale: [1, 1.9, 1] },
    { geometry: new OctahedronGeometry(.18), color: '#f2f2f2', at: [.26, .3, .1], scale: [1, 1.7, 1], tilt: .3 },
  ];
  return mergeParts(parts)!;
}

/* ------------------------------------------------------------------ the scene's data */

function useWorld(shape: OverviewShape) {
  return useMemo(() => {
    const outlines = overviewOutlines(P9_WORLD_MAP, REGION_LAYOUTS, shape), links = overviewLinks(P9_WORLD_MAP, outlines);
    const fields = outlines.map(o => regionField(o, BIOMES[o.id], o.id === 'hub' ? undefined : LANDMARK_ISLAND[o.id], o.id === 'hub' ? 30 : 58));
    const field = (id: BiomeId) => fields.find(f => f.id === id)!;
    const terrains = fields.map(f => {
      const mesh = terrainMesh(f), g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
      // The palette is sRGB; the attribute is read as linear.
      const linear = new Float32Array(mesh.colors.length), c = new Color();
      for (let i = 0; i < linear.length; i += 3) { c.setRGB(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2], 'srgb'); linear.set([c.r, c.g, c.b], i); }
      g.setAttribute('color', new Float32BufferAttribute(linear, 3));
      g.computeVertexNormals();
      return { id: f.id, geometry: g };
    });
    const trees = (['broadleaf', 'conifer', 'crystal'] as const).map(kind => ({
      kind, geometry: treeGeometry(kind),
      spots: fields.filter(f => f.biome.trees === kind).flatMap(f => treeSpots(f).map(s => ({ ...s, color: f.biome.treeColors[s.tint] }))),
    })).filter(t => t.spots.length);
    const solid: Part[] = [], glow: Part[] = [];
    for (const f of fields) {
      const s = f.unit * LANDMARK_SCALE[f.id], parts = landmark(f.id), [x, z] = f.site.at;
      const place = (p: Part): Part => ({ ...p, at: [x + p.at[0] * s, f.site.height + p.at[1] * s, z + p.at[2] * s], scale: [(p.scale?.[0] ?? 1) * s, (p.scale?.[1] ?? 1) * s, (p.scale?.[2] ?? 1) * s] });
      solid.push(...parts.solid.map(place)); glow.push(...parts.glow.map(place));
    }
    // The links of the world's topology, from shore to shore: a deck on piers, planks for a relation bridge.
    const decks: Part[] = [];
    const spans = links.map(link => {
      const a = shorePoint(field(link.from), link.a, link.b), b = shorePoint(field(link.to), link.b, link.a);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), turn = Math.atan2(b[0] - a[0], b[1] - a[1]), width = LINK_WIDTH[shape][link.kind] * 1.7;
      const at = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const relation = link.kind === 'relation', pieces = relation ? Math.max(2, Math.round(length / 1.1)) : 1;
      for (let i = 0; i < pieces; i++) {
        const [x, z] = at((i + .5) / pieces);
        decks.push({ geometry: box(width, .12, length / pieces * (relation ? .8 : 1)), color: relation ? '#c98f52' : '#e3e8ea', at: [x, .32, z], turn });
      }
      for (let i = 1, piers = Math.max(1, Math.round(length / 2.6)); i < piers; i++) {
        const [x, z] = at(i / piers);
        decks.push({ geometry: box(width * .55, .62, .26), color: relation ? '#8a6240' : '#b7c2c8', at: [x, 0, z], turn });
      }
      return { id: link.id, kind: link.kind, a, b };
    });
    return { outlines, links, fields, terrains, trees, landmarks: mergeParts(solid), glows: mergeParts(glow), decks: mergeParts(decks), spans };
  }, [shape]);
}

interface Framed { extents: StageBox[]; lines: StageLine[]; lands: StageLand[] }
/** The P8 overview's fixed orthographic framing, unchanged: every outline fits with room for its label, left of `insetRight`. */
function Framing({ outlines, links, shape, insetRight, onFramed }: { outlines: OverviewOutline[]; links: OverviewLink[]; shape: OverviewShape; insetRight: number; onFramed: (framed: Framed) => void }) {
  const { size, invalidate, get } = useThree();
  useLayoutEffect(() => {
    const camera = get().camera, frame = frameOverview(outlines, shape, size, insetRight), center = new Vector3(...frame.center);
    camera.position.copy(center).addScaledVector(VIEW, 90);
    camera.lookAt(center);
    camera.zoom = frame.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    onFramed({ extents: frame.boxes, lines: stageLines(frame, links, shape), lands: stageLands(frame, outlines) });
    invalidate();
  }, [get, size, outlines, links, shape, insetRight, invalidate, onFramed]);
  return null;
}

function Trees({ geometry, spots }: { geometry: BufferGeometry; spots: { x: number; y: number; z: number; scale: number; turn: number; color: string }[] }) {
  const mesh = useRef<InstancedMesh>(null), invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const dummy = new Object3D(), color = new Color();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y - .02, s.z); dummy.rotation.set(0, s.turn, 0); dummy.scale.setScalar(s.scale); dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix); target.setColorAt(i, color.set(s.color));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
    invalidate();
  }, [spots, invalidate]);
  return <instancedMesh ref={mesh} args={[geometry, undefined, spots.length]} castShadow receiveShadow raycast={noRaycast}>
    <meshStandardMaterial vertexColors flatShading roughness={.85}/>
  </instancedMesh>;
}

export interface P9WorldTarget {
  id: BiomeId; name: string; detail: string;
  /** Accessible name of the label button. */
  label: string; accent: string;
  /** Nothing to open yet (a region the prototype has not built): the label is shown, not a button to somewhere. */
  onOpen?: () => void;
}
/** Under this much free stage width (px) the labels are the short ones (as on the P8 overview). */
const COMPACT_BELOW = 720;

export default function P9WorldScene({ targets, insetRight, label, shape, onReady, onUnavailable }: {
  targets: P9WorldTarget[]; insetRight: number; label: string; shape: OverviewShape; onReady: () => void; onUnavailable: () => void;
}) {
  const { outlines, links, fields, terrains, trees, landmarks, glows, decks, spans } = useWorld(shape);
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
  useEffect(() => () => { terrains.forEach(t => t.geometry.dispose()); trees.forEach(t => t.geometry.dispose()); [landmarks, glows, decks].forEach(g => g?.dispose()); }, [terrains, trees, landmarks, glows, decks]);
  const target = (id: string) => targets.find(t => t.id === id);
  // What was drawn, for the review tools: land above the sea per region, tallest point, trees, and the links' ends.
  const drawn = useMemo(() => JSON.stringify({
    regions: fields.map(f => ({ id: f.id, top: Math.round(Math.max(...f.heights) * 100) / 100, islands: f.islands.length, landmark: Math.round(sampleHeight(f, ...f.site.at) * 100) / 100 })),
    trees: trees.reduce((n, t) => n + t.spots.length, 0), links: spans.map(s => ({ id: s.id, kind: s.kind })),
  }), [fields, trees, spans]);
  return <div ref={wrap} className={styles.canvasWrap} style={hovered && target(hovered)?.onOpen ? { cursor: 'pointer' } : undefined} data-shape={shape} data-compact={compact ? 'true' : undefined} data-p9-world={drawn}>
    <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} shadows={{ type: PCFShadowMap }} camera={{ position: [0, 40, 60], zoom: 10, near: .1, far: 400 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.setAttribute('aria-label', label); canvas.setAttribute('role', 'img');
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onUnavailable(); });
        onReady();
      }}>
      <color attach="background" args={['#9fd3ea']}/>
      <ambientLight intensity={.55}/>
      <hemisphereLight args={['#dff2ff', '#7fa08a', .95]}/>
      <directionalLight position={[-38, 52, 18]} intensity={2.3} color="#fff4de" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-near={1} shadow-camera-far={200} shadow-normalBias={.06} shadow-bias={-.0006}/>
      {/* The sea: its floor in the deep colour, and a clear surface over it, so the shelf around each region shows through as shallows. */}
      <mesh rotation-x={-Math.PI / 2} position-y={SEA.floor - .02} raycast={noRaycast}><planeGeometry args={[500, 500]}/><meshStandardMaterial color={SEA.deep} roughness={1}/></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={SEA.level} raycast={noRaycast} renderOrder={2}><planeGeometry args={[500, 500]}/>
        <meshStandardMaterial color="#3d9fd0" transparent opacity={.5} roughness={.25} depthWrite={false}/></mesh>
      {terrains.map(t => <mesh key={t.id} geometry={t.geometry} castShadow receiveShadow
        onClick={event => { event.stopPropagation(); target(t.id)?.onOpen?.(); }}
        onPointerOver={() => setHovered(t.id)} onPointerOut={() => setHovered(h => h === t.id ? null : h)}>
        <meshStandardMaterial vertexColors flatShading roughness={.92}/>
      </mesh>)}
      {trees.map(t => <Trees key={t.kind} geometry={t.geometry} spots={t.spots}/>)}
      {landmarks && <mesh geometry={landmarks} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial vertexColors flatShading roughness={.8}/></mesh>}
      {glows && <mesh geometry={glows} raycast={noRaycast}><meshStandardMaterial vertexColors flatShading roughness={.4} emissive="#ffffff" emissiveIntensity={.28}/></mesh>}
      {decks && <mesh geometry={decks} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial vertexColors flatShading roughness={.9}/></mesh>}
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
