'use client';

import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { LAND_TOP, tileHeight, type HexWorld } from '@/lib/islands/hex-world';
import type { Glow } from '@/lib/islands/glb-parts';
import type { PlannedLandscape } from '@/lib/p9/cs-region';
import { useGlow } from '../islands/hex-world/hex-environment';
import { landmarkPieces } from './landmarks';
import type { Piece } from './landmarks/kit';

/*
 * P9: every island's landmarks in a region, drawn as the islands' own buildings (P9.2 資料結構島, P9.3 the rest; see
 * ./landmarks). One renderer for every region and both levels of detail: all the pieces of a region merged into one
 * flat-shaded, vertex-coloured mesh, and what glows at night (windows, screens, lamps) into a second one whose
 * emissive strength follows the time of day as the GLB buildings' windows do (useGlow). Decoration only: no raycast,
 * no HTML. An island's lessons are reached through its label and list entry; a planned island opens none.
 */

/** How much larger than their own measures the pieces are drawn, so a landmark reads from the region's overview. */
const SCALE = 1.3;
const GLOW_COLOR = new Color('#ffcf85');
/** Night glow strength before the environment's own factor (noon 1, night 1.6). */
const GLOW_STRENGTH = .4;

/** How many pieces an island's landmarks have at a level of detail (for tests: the world draws fewer). */
export const landscapePieceCount = (islandId: string, detail: 'region' | 'world') =>
  landmarkPieces(islandId, '#000000').filter(p => detail === 'region' || !p.fine).length;

function place(piece: Piece, x: number, y: number, z: number): BufferGeometry {
  const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
  const up = new Vector3(0, 1, 0), side = new Vector3(1, 0, 0), front = new Vector3(0, 0, 1);
  const q = piece.quat ?? new Quaternion().setFromAxisAngle(up, piece.turn ?? 0).multiply(new Quaternion().setFromAxisAngle(side, piece.tilt ?? 0)).multiply(new Quaternion().setFromAxisAngle(front, piece.roll ?? 0));
  const [sx, sy, sz] = piece.scale ?? [1, 1, 1];
  g.applyMatrix4(new Matrix4().compose(new Vector3(x + piece.at[0] * SCALE, y + piece.at[1] * SCALE, z + piece.at[2] * SCALE), q, new Vector3(SCALE * sx, SCALE * sy, SCALE * sz)));
  const c = new Color(piece.color), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * The landmarks of a region's islands, in the map's own coordinates (drawn inside the scene's map group). `detail`
 * 'world' is the overview's level of detail: the same pieces at the same places, without the fine ones.
 */
export function P9Landscapes({ world, landscapes, accents, detail = 'region' }: { world: HexWorld; landscapes: readonly PlannedLandscape[]; accents: Record<string, string>; detail?: 'region' | 'world' }) {
  const { solid, lit } = useMemo(() => {
    const solid: BufferGeometry[] = [], lit: BufferGeometry[] = [];
    for (const landscape of landscapes) {
      const settlement = world.settlements.find(s => s.islandId === landscape.islandId);
      if (!settlement) continue;
      const ground = (t: Axial) => { const [x, z] = hexToWorld(t, world.size), tile = settlement.tiles.find(u => u.q === t.q && u.r === t.r); return [x, LAND_TOP + (tile ? tileHeight(tile) : 0), z] as const; };
      for (const piece of landmarkPieces(landscape.islandId, accents[landscape.islandId] ?? '#4285f4')) {
        const tile = landscape.tiles[piece.tile];
        if (!tile || (detail === 'world' && piece.fine)) { piece.geometry.dispose(); continue; }
        (piece.glow ? lit : solid).push(place(piece, ...ground(tile)));
        piece.geometry.dispose();
      }
    }
    const merge = (list: BufferGeometry[]) => { if (!list.length) return null; const m = mergeGeometries(list); list.forEach(g => g.dispose()); return m; };
    return { solid: merge(solid), lit: merge(lit) };
  }, [world, landscapes, accents, detail]);
  useEffect(() => () => { solid?.dispose(); lit?.dispose(); }, [solid, lit]);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8, emissive: GLOW_COLOR.clone(), emissiveIntensity: GLOW_STRENGTH }), []);
  useEffect(() => () => material.dispose(), [material]);
  const glows: Glow[] = useMemo(() => [{ material, strength: GLOW_STRENGTH, emissive: GLOW_COLOR.clone() }], [material]);
  useGlow(glows);
  return <>
    {solid && <mesh geometry={solid} castShadow receiveShadow raycast={() => undefined}><meshStandardMaterial vertexColors flatShading roughness={.85}/></mesh>}
    {lit && <mesh geometry={lit} material={material} raycast={() => undefined}/>}
  </>;
}
