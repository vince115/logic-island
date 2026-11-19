'use client';

import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { LAND_TOP, tileHeight, type HexWorld } from '@/lib/islands/hex-world';
import type { PlannedLandscape } from '@/lib/p9/cs-region';
import type { SceneId } from '@/lib/p9/region-scene';
import { useGlowLevel } from '../islands/hex-world/hex-environment';
import { REGION_STYLE, glowStrength } from './landmarks/style';
import { landmarkPieces } from './landmarks';
import type { Piece } from './landmarks/kit';

/*
 * P9: every island's landmarks in a region, drawn as the islands' own buildings (P9.2 資料結構島, P9.3 the rest; see
 * ./landmarks). One renderer for every region and both levels of detail: all the pieces of a region merged into one
 * flat-shaded, vertex-coloured mesh, and what glows at night (windows, screens, lamps) into a second one whose
 * emissive strength follows the time of day as the GLB buildings' windows do (useGlow). Decoration only: no raycast,
 * no HTML. An island's lessons are reached through its label and list entry; a planned island opens none.
 */


/** How many pieces an island's landmarks have at a level of detail (for tests: the world draws fewer). */
export const landscapePieceCount = (islandId: string, detail: 'region' | 'world') =>
  landmarkPieces(islandId, '#000000').filter(p => detail === 'region' || !p.fine).length;

function place(piece: Piece, x: number, y: number, z: number, SCALE: number, tall: number): BufferGeometry {
  const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
  const up = new Vector3(0, 1, 0), side = new Vector3(1, 0, 0), front = new Vector3(0, 0, 1);
  const q = piece.quat ?? new Quaternion().setFromAxisAngle(up, piece.turn ?? 0).multiply(new Quaternion().setFromAxisAngle(side, piece.tilt ?? 0)).multiply(new Quaternion().setFromAxisAngle(front, piece.roll ?? 0));
  const [sx, sy, sz] = piece.scale ?? [1, 1, 1];
  g.applyMatrix4(new Matrix4().compose(new Vector3(x + piece.at[0] * SCALE, y + piece.at[1] * SCALE, z + piece.at[2] * SCALE), q, new Vector3(SCALE * sx, SCALE * sy, SCALE * sz)));
  // Taller about the tile's ground: heights and how high each piece stands grow, footprints do not.
  if (tall !== 1) g.applyMatrix4(new Matrix4().makeTranslation(0, -y, 0)).applyMatrix4(new Matrix4().makeScale(1, tall, 1)).applyMatrix4(new Matrix4().makeTranslation(0, y, 0));
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
export function P9Landscapes({ world, landscapes, accents, region, detail = 'region' }: { world: HexWorld; landscapes: readonly PlannedLandscape[]; accents: Record<string, string>; region: SceneId; detail?: 'region' | 'world' }) {
  const style = REGION_STYLE[region];
  const { solid, lit } = useMemo(() => {
    const solid: BufferGeometry[] = [], lit: BufferGeometry[] = [];
    for (const landscape of landscapes) {
      const settlement = world.settlements.find(s => s.islandId === landscape.islandId);
      if (!settlement) continue;
      const ground = (t: Axial) => { const [x, z] = hexToWorld(t, world.size), tile = settlement.tiles.find(u => u.q === t.q && u.r === t.r); return [x, LAND_TOP + (tile ? tileHeight(tile) : 0), z] as const; };
      for (const piece of landmarkPieces(landscape.islandId, accents[landscape.islandId] ?? '#4285f4')) {
        const tile = landscape.tiles[piece.tile];
        if (!tile || (detail === 'world' && piece.fine)) { piece.geometry.dispose(); continue; }
        (piece.glow ? lit : solid).push(place(piece, ...ground(tile), style.scale * (piece.tile === 0 ? style.main : 1), style.tall));
        piece.geometry.dispose();
      }
    }
    const merge = (list: BufferGeometry[]) => { if (!list.length) return null; const m = mergeGeometries(list); list.forEach(g => g.dispose()); return m; };
    return { solid: merge(solid), lit: merge(lit) };
  }, [world, landscapes, accents, detail, style]);
  useEffect(() => () => { solid?.dispose(); lit?.dispose(); }, [solid, lit]);
  // One material a region: its own night-light colour, its strength on the time of day's curve (style.ts). A prop
  // change re-renders and R3F draws the frame it asks for.
  const strength = glowStrength(useGlowLevel());
  return <>
    {solid && <mesh geometry={solid} castShadow receiveShadow raycast={() => undefined}><meshStandardMaterial vertexColors flatShading roughness={.85}/></mesh>}
    {lit && <mesh geometry={lit} raycast={() => undefined}><meshStandardMaterial vertexColors flatShading roughness={.8} emissive={style.glow} emissiveIntensity={strength}/></mesh>}
  </>;
}
