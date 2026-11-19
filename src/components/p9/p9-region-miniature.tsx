'use client';

import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, Float32BufferAttribute, IcosahedronGeometry, LinearFilter, Matrix4,
  MeshStandardMaterial, Object3D, Quaternion, SRGBColorSpace, Vector3, type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HexColor } from '@/lib/islands/environments';
import { placementPose, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import { naturalTerrains, seaGrid } from '@/lib/islands/hex-natural-scene';
import type { TreeInstance } from '@/lib/islands/hex-nature-data';
import { TERRAIN_MATERIAL } from '@/lib/islands/hex-terrain';
import { NATURAL_PALETTE, type NaturalKey } from '@/lib/islands/hex-terrain-natural';
import { WATER_LEVEL, type HexWorld } from '@/lib/islands/hex-world';
import type { RegionSceneDefinition, ScenePlacement } from '@/lib/p9/region-scene';
import { useGlow } from '../islands/hex-world/hex-environment';
import { HexLandmarks } from '../islands/hex-world/hex-landmarks';
import { OCEAN } from '../islands/hex-world/hex-ocean';
import { MergedRoutes } from '../islands/hex-world/hex-routes-merged';

/*
 * P9.1b: a region's scene definition drawn small, for the world overview. It draws the definition the Region page draws
 * (src/lib/p9/region-scene.ts), in the region's own map coordinates inside one scaled group, so an island cannot be
 * anywhere but where the region has it, nor have another outline or height. What changes with the distance is the level
 * of detail only:
 *   - the land: the Region's own terrain triangles (naturalTerrains), every island's merged into one mesh
 *   - roads and bridges: the Region's own component (MergedRoutes), unchanged
 *   - authored landmarks: the Region's own component (HexLandmarks), unchanged
 *   - landscapes of planned islands: the Region's own component (P9Landscapes), unchanged
 *   - GLB buildings: a flat-shaded stand-in at each building's own placement and turn; the GLB is not loaded
 *   - trees: a low-poly tree at each tree's own place and size; the GLB trees are not loaded
 *   - the sea: the Region's shallow-to-deep shade (seaGrid) on one quad; no foam
 * Left out at this distance: rocks, the plaza's furniture, labels and every interaction but opening the region.
 */
const noRaycast = () => undefined;
const P9Landscapes = lazy(() => import('./p9-landscapes').then(m => ({ default: m.P9Landscapes })));

/** Every island's terrain of the region as one mesh: the same triangles and colours HexTerrainMesh draws island by island. */
function Terrain({ world, onOpen, onHover }: { world: HexWorld; onOpen?: () => void; onHover: (on: boolean) => void }) {
  const geometry = useMemo(() => {
    const linear = Object.fromEntries(Object.entries(NATURAL_PALETTE).map(([k, v]) => [k, new Color(v)])) as Record<NaturalKey, Color>;
    const positions: number[] = [], colors: number[] = [];
    for (const terrain of naturalTerrains(world)) for (const t of terrain.triangles) {
      const shade = t.shade ?? 1, c = linear[t.color];
      for (const p of [t.a, t.b, t.c]) { positions.push(...p); colors.push(c.r * shade, c.g * shade, c.b * shade); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [world]);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, ...TERRAIN_MATERIAL }), []);
  useLayoutEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const click = (event: ThreeEvent<MouseEvent>) => { if (event.delta >= 6) return; event.stopPropagation(); onOpen?.(); };
  return <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={click}
    onPointerOver={event => { if (event.pointerType === 'mouse') onHover(true); }} onPointerOut={() => onHover(false)}/>;
}

type Part = { geometry: BufferGeometry; color: string; at: [number, number, number]; turn?: number };
function merge(parts: Part[], origin: [number, number, number], yaw: number): BufferGeometry[] {
  const up = new Vector3(0, 1, 0), base = new Matrix4().compose(new Vector3(...origin), new Quaternion().setFromAxisAngle(up, yaw), new Vector3(1, 1, 1));
  return parts.map(({ geometry, color, at, turn = 0 }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromAxisAngle(up, turn), new Vector3(1, 1, 1))).applyMatrix4(base);
    const c = new Color(color), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    geometry.dispose();
    return g;
  });
}
/**
 * The stand-in of a GLB node at world distance, in map units on the node's own pivot (the v2.1 buildings stand at 0.6
 * scale: a lighthouse about 2.7 tall, a workshop about 1.8 by 1.9, a dock reaching 1.3 out). `glow` parts follow the
 * time of day like the GLB's own lantern and windows. A node without a stand-in (a tree) is not drawn.
 */
function standIn(node: string): { solid: Part[]; glow: Part[] } | null {
  const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d), cyl = (a: number, b: number, h: number, n = 8) => new CylinderGeometry(a, b, h, n);
  if (node === 'Landmark_Lighthouse') return {
    solid: [
      { geometry: cyl(.5, .58, .28), color: '#b9b2a4', at: [0, .14, 0] }, { geometry: cyl(.26, .4, 1.75), color: '#f6f3ea', at: [0, 1.15, 0] },
      { geometry: cyl(.33, .36, .3), color: '#3f7fd6', at: [0, 1, 0] }, { geometry: cyl(.36, .36, .08), color: '#3a5f8f', at: [0, 2.06, 0] },
      { geometry: new ConeGeometry(.33, .4, 8), color: '#2f5f9f', at: [0, 2.62, 0] },
    ],
    glow: [{ geometry: cyl(.22, .22, .32), color: '#ffe08a', at: [0, 2.26, 0] }],
  };
  if (node === 'Building_Workshop') return {
    solid: [
      { geometry: box(1.5, .8, 1.25), color: '#f2e5cb', at: [.15, .4, .2] },
      { geometry: new ConeGeometry(1.2, .7, 4), color: '#3f6fb0', at: [.15, 1.15, .2], turn: Math.PI / 4 },
      { geometry: box(.18, .5, .18), color: '#8a6a4c', at: [-.45, 1.3, -.1] },
    ],
    glow: [{ geometry: box(.3, .32, .04), color: '#ffe3a8', at: [-.3, .45, .84] }, { geometry: box(.3, .32, .04), color: '#ffe3a8', at: [.75, .45, .84] }],
  };
  if (node === 'Dock_Entry') return {
    solid: [
      { geometry: box(.85, .08, 1.3), color: '#a77b52', at: [0, .02, .55] },
      ...[[-.38, .1], [.38, .1], [-.38, 1.1], [.38, 1.1]].map(([x, z]): Part => ({ geometry: cyl(.05, .05, .5, 5), color: '#7d5a3c', at: [x, -.05, z] })),
    ],
    glow: [],
  };
  return null;
}
/** The stand-ins of every GLB building of the region, each at its own placement: one mesh, and one for what glows. */
function GlbStandIns({ world, layouts }: { world: HexWorld; layouts: HexGlbSettlement[] }) {
  const { solid, glow } = useMemo(() => {
    const solid: BufferGeometry[] = [], glow: BufferGeometry[] = [];
    for (const layout of layouts) for (const placement of layout.placements) {
      const parts = standIn(placement.node);
      if (!parts) continue;
      const pose = placementPose(world, layout.islandId, placement);
      solid.push(...merge(parts.solid, pose.position, pose.rotation)); glow.push(...merge(parts.glow, pose.position, pose.rotation));
    }
    const one = (list: BufferGeometry[]) => { if (!list.length) return null; const merged = mergeGeometries(list); list.forEach(g => g.dispose()); return merged; };
    return { solid: one(solid), glow: one(glow) };
  }, [world, layouts]);
  // The lantern and windows follow the environment's glow, as the GLB's own emission material does on the Region page.
  const lamp = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .5, emissive: '#ffffff', emissiveIntensity: .9 }), []);
  const glows = useMemo(() => [{ material: lamp, strength: .9, emissive: new Color('#ffffff') }], [lamp]);
  useGlow(glows);
  useEffect(() => () => { solid?.dispose(); glow?.dispose(); }, [solid, glow]);
  useEffect(() => () => lamp.dispose(), [lamp]);
  return <>
    {solid && <mesh geometry={solid} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial vertexColors flatShading roughness={.85}/></mesh>}
    {glow && <mesh geometry={glow} material={lamp} raycast={noRaycast}/>}
  </>;
}

/** Tree kinds 2 and 3 of the v2.1 GLB are its conifers (hex-natural-scene.ts). */
const CONIFER_KINDS = [2, 3];
/** A low-poly tree at every tree of the definition: the same place, turn and size, a conifer where the Region has one. */
function Trees({ trees }: { trees: TreeInstance[] }) {
  const mesh = useRef<InstancedMesh>(null), invalidate = useThree(state => state.invalidate);
  const geometry = useMemo(() => {
    const paint = (g: BufferGeometry, color: string) => { const n = g.index ? g.toNonIndexed() : g, c = new Color(color), count = n.getAttribute('position').count, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3); n.setAttribute('color', new Float32BufferAttribute(colors, 3)); n.deleteAttribute('uv'); return n; };
    const parts = [paint(new CylinderGeometry(.09, .12, .7, 4, 1, true).translate(0, .35, 0), '#8a6a4c'), paint(new IcosahedronGeometry(.62, 0).scale(1, 1.15, 1).translate(0, 1.25, 0), '#ffffff')];
    const merged = mergeGeometries(parts);
    parts.forEach(p => p.dispose());
    return merged;
  }, []);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const dummy = new Object3D(), color = new Color();
    trees.forEach((tree, i) => {
      const conifer = CONIFER_KINDS.includes(tree.kind);
      dummy.position.set(...tree.position); dummy.rotation.set(0, tree.rotation, 0);
      // A conifer is slimmer and taller; both stand about as tall as the GLB tree of that size.
      dummy.scale.set(tree.scale * (conifer ? 1.1 : 1.5), tree.scale * (conifer ? 2 : 1.55), tree.scale * (conifer ? 1.1 : 1.5)); dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix); target.setColorAt(i, color.set(conifer ? (i % 2 ? '#5f9a78' : '#4f8f6a') : (i % 2 ? '#a9c97f' : '#8fbf6a')));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
    invalidate();
  }, [trees, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!trees.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, undefined, trees.length]} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial vertexColors flatShading roughness={.85}/></instancedMesh>;
}

/** The region's shallows: the Region page's shade from the coast out (seaGrid) on one quad, in the same colours and tint. */
function Sea({ world, tint, lift }: { world: HexWorld; tint: HexColor; lift: number }) {
  const parts = useMemo(() => {
    const { nx, nz, points, shade } = seaGrid(world, .6, 5), step = points[1][0] - points[0][0];
    const stops = [OCEAN.shallow, OCEAN.mid, OCEAN.deep].map(c => new Color(c)), srgb = { r: 0, g: 0, b: 0 };
    const data = new Uint8Array(points.length * 4);
    shade.forEach((v, i) => {
      const t = v * 2, c = t < 1 ? stops[0].clone().lerp(stops[1], t) : stops[1].clone().lerp(stops[2], t - 1);
      c.getRGB(srgb, SRGBColorSpace);
      data.set([srgb.r * 255, srgb.g * 255, srgb.b * 255, 255].map(Math.round), i * 4);
    });
    const texture = new DataTexture(data, nx + 1, nz + 1);
    texture.colorSpace = SRGBColorSpace; texture.magFilter = texture.minFilter = LinearFilter; texture.needsUpdate = true;
    const [x0, z0] = points[0], [x1, z1] = points.at(-1)!, h = step / 2, y = WATER_LEVEL + lift, sea = new BufferGeometry();
    sea.setAttribute('position', new Float32BufferAttribute([x0 - h, y, z0 - h, x1 + h, y, z0 - h, x1 + h, y, z1 + h, x0 - h, y, z1 + h], 3));
    sea.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    sea.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    sea.setIndex([0, 3, 1, 1, 3, 2]);
    return { texture, sea };
  }, [world, lift]);
  const material = useMemo(() => new MeshStandardMaterial({ map: parts.texture, roughness: .5, metalness: 0 }), [parts]);
  useLayoutEffect(() => () => { parts.sea.dispose(); parts.texture.dispose(); material.dispose(); }, [parts, material]);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => { const by = new Color(tint); if (material.color.equals(by)) return; material.color.copy(by); invalidate(); }, [material, tint, invalidate]);
  return <mesh geometry={parts.sea} material={material} receiveShadow raycast={noRaycast} renderOrder={1}/>;
}

export function P9RegionMiniature({ scene, placement, seaTint, accents, order, onOpen, onHover }: {
  scene: RegionSceneDefinition; placement: ScenePlacement;
  /** The environment's sea tint, as the Region page's sea takes it. */
  seaTint: HexColor;
  /** Island accents (the landscapes' bands and pennants), by island id. */
  accents: Record<string, string>;
  /** Stacks the regions' sea quads a hair apart where two overlap, so they never fight for the same depth. */
  order: number;
  onOpen?: () => void; onHover: (on: boolean) => void;
}) {
  const { world, glb, natural } = scene.region.layout;
  return <group position={placement.position} scale={placement.scale}>
    <Terrain world={world} onOpen={onOpen} onHover={onHover}/>
    {/* A map with no bridge and no spur has no road to draw (the hub's one island). */}
    {(world.bridges.length > 0 || world.settlements.some(s => s.spurs?.length)) && <MergedRoutes world={world} widths={natural?.roadWidths}/>}
    {world.settlements.map(settlement => {
      // P8's mist over a planned island is not drawn: at this distance a planned island is its land, as it is on the map.
      if (settlement.planned || glb.some(layout => layout.islandId === settlement.islandId)) return null;
      return <HexLandmarks key={settlement.islandId} world={world} settlement={settlement}/>;
    })}
    <GlbStandIns world={world} layouts={glb}/>
    {scene.landscapes.length > 0 && <Suspense fallback={null}><P9Landscapes world={world} landscapes={scene.landscapes} accents={accents} detail="world"/></Suspense>}
    <Trees trees={scene.trees}/>
    <Sea world={world} tint={seaTint} lift={order * .004}/>
  </group>;
}
