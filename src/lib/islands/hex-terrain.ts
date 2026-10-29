import { HEX_EDGES, hexCorner, hexEdgeMidpoint, hexKey, hexNeighbor, hexToWorld, type Axial, type HexEdge } from './hex';
import { LAND_TOP, settlementRoads, tileHeight, type HexSettlement, type HexTerrain, type HexTile, type HexWorld } from './hex-world';
import type { Vec3 } from './types';

/**
 * Continuous hex terrain (Phase D.2b, plan A2) as plain data: triangles with palette keys, plus the
 * cliffs, ramps and sloped road profiles that produced them. No three.js here, so it is unit-testable;
 * the scene only turns the triangles into a BufferGeometry.
 */

/** v2.1 GLB pastel palette (vertex colors converted to sRGB). */
export const TERRAIN_PALETTE = {
  grass: '#b7cda9', grassEdge: '#9cbba0',
  cliffTop: '#b9c6cc', cliff: '#98acb7', cliffDeep: '#79939c',
  path: '#e5dcc6', wood: '#bda993',
} as const;
export type PaletteKey = keyof typeof TERRAIN_PALETTE;
/** Matches the GLB's LLv2_Palette_VertexColor material. */
export const TERRAIN_MATERIAL = { roughness: 0.82, metalness: 0 } as const;

/** Coast cliffs reach below the water surface so no gap shows at the waterline. */
export const SEA_FLOOR = -1.1;
/** Fraction of the circumradius kept by the inner face; the darker ring outside it keeps tiles readable. */
export const TILE_INSET = 0.86;
export const RAMP_WIDTH = 0.62;
export const RAMP_LENGTH = 0.9;
const EPSILON = 1e-6;

export interface TerrainTriangle { a: Vec3; b: Vec3; c: Vec3; color: PaletteKey }
/** Every tile edge that needs a wall: open water (`coast`) or a drop to a lower neighbor (`step`). */
export interface TerrainWall { tile: Axial; edge: HexEdge; kind: 'coast' | 'step'; top: number; bottom: number }
/** A wedge on the lower tile, against a step wall, wherever a road crosses that step. */
export interface TerrainRamp { upper: Axial; lower: Axial; edge: HexEdge; from: Vec3; to: Vec3; width: number }
export interface RoadProfile { islandId: string; routeId: string; points: Vec3[] }
export interface SettlementTerrain { islandId: string; triangles: TerrainTriangle[]; walls: TerrainWall[]; ramps: TerrainRamp[] }

const faceColors: Record<HexTerrain, [PaletteKey, PaletteKey]> = {
  grass: ['grass', 'grassEdge'], meadow: ['grass', 'grassEdge'], plaza: ['path', 'grassEdge'],
  shore: ['path', 'cliffTop'], sand: ['path', 'cliffTop'], stone: ['cliffTop', 'cliff'], forest: ['grassEdge', 'grass'],
};
export const tileTop = (tile: HexTile) => LAND_TOP + tileHeight(tile);

/** Deterministic 0–1 value per position, so cliff facets look the same on every render. */
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function landIndex(settlement: HexSettlement) {
  return new Map(settlement.tiles.map(t => [hexKey(t), t]));
}

/** Where each road crosses from one tile to the next: the edge, and which side is higher. */
function roadCrossings(world: HexWorld, settlement: HexSettlement) {
  const land = landIndex(settlement);
  return settlementRoads(world).filter(r => r.islandId === settlement.islandId).flatMap(road => road.tiles.slice(1).map((tile, i) => {
    const from = road.tiles[i], edge = HEX_EDGES.find(e => hexKey(hexNeighbor(from, e)) === hexKey(tile))!;
    return { routeId: road.routeId, from: land.get(hexKey(from))!, to: land.get(hexKey(tile))!, edge };
  }));
}

/** A step ramp starts at the shared edge midpoint on the upper tile and runs into the lower tile. */
function rampFor(world: HexWorld, upper: HexTile, lower: HexTile, edge: HexEdge): TerrainRamp {
  const [mx, mz] = hexEdgeMidpoint(upper, edge, world.size), [lx, lz] = hexToWorld(lower, world.size);
  const length = Math.hypot(lx - mx, lz - mz), t = Math.min(1, RAMP_LENGTH / length);
  return { upper, lower, edge, width: RAMP_WIDTH,
    from: [mx, tileTop(upper), mz], to: [lerp(mx, lx, t), tileTop(lower), lerp(mz, lz, t)] };
}

export function buildSettlementTerrain(world: HexWorld, settlement: HexSettlement): SettlementTerrain {
  const R = world.size, land = landIndex(settlement);
  const triangles: TerrainTriangle[] = [], walls: TerrainWall[] = [], ramps: TerrainRamp[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: PaletteKey) => triangles.push({ a, b, c, color });
  // Quads are wound so their front faces point up (tops) or outward (walls).
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: PaletteKey) => { tri(a, b, c, color); tri(a, c, d, color); };

  for (const tile of settlement.tiles) {
    const top = tileTop(tile), [cx, cz] = hexToWorld(tile, R), [inner, ring] = faceColors[tile.terrain];
    const outer = [0, 1, 2, 3, 4, 5].map(i => { const [x, z] = hexCorner(tile, R, i); return [x, top, z] as Vec3; });
    const inset = outer.map(([x, , z]) => [lerp(cx, x, TILE_INSET), top, lerp(cz, z, TILE_INSET)] as Vec3);
    const center: Vec3 = [cx, top, cz];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      // Corners run counter-clockwise seen from above, so (center, i, j) faces +y.
      tri(center, inset[i], inset[j], inner);
      quad(inset[i], outer[i], outer[j], inset[j], ring);
    }
    for (const edge of HEX_EDGES) {
      const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
      const bottom = neighbor ? tileTop(neighbor) : SEA_FLOOR;
      if (neighbor && bottom >= top - EPSILON) continue; // level, or the neighbor builds the wall
      walls.push({ tile, edge, kind: neighbor ? 'step' : 'coast', top, bottom });
      const a = outer[(edge + 5) % 6], b = outer[edge];
      const [mx, mz] = hexEdgeMidpoint(tile, edge, R), nx = (mx - cx) / (R * Math.sqrt(3) / 2), nz = (mz - cz) / (R * Math.sqrt(3) / 2);
      // Rows: a pale lip, the main face, and a deep base; coast cliffs bulge at the edge middle for low-poly facets.
      const rows = neighbor ? [top, lerp(top, bottom, .45), bottom] : [top, top - .16, lerp(top, bottom, .55), bottom];
      const colors: PaletteKey[] = neighbor ? ['cliffTop', 'cliff'] : ['cliffTop', 'cliff', 'cliffDeep'];
      // The bulge only grows with depth, so the cliff flares toward its base and no face overhangs.
      const column = (y: number, row: number): Vec3[] => {
        let bulge = 0;
        if (!neighbor) for (let k = 1; k <= row; k++) bulge += .03 + .04 * hash(mx, k, mz);
        return [[a[0], y, a[2]], [mx + nx * bulge, y, mz + nz * bulge], [b[0], y, b[2]]];
      };
      for (let row = 0; row < colors.length; row++) {
        const upper = column(rows[row], row), lower = column(rows[row + 1], row + 1);
        // (a_top, a_bottom, m_bottom, m_top) winds so the face points away from the tile.
        quad(upper[0], lower[0], lower[1], upper[1], colors[row]);
        quad(upper[1], lower[1], lower[2], upper[2], colors[row]);
      }
    }
  }

  for (const crossing of roadCrossings(world, settlement)) {
    const [high, low, edge] = tileTop(crossing.from) > tileTop(crossing.to) + EPSILON
      ? [crossing.from, crossing.to, crossing.edge] : tileTop(crossing.to) > tileTop(crossing.from) + EPSILON
        ? [crossing.to, crossing.from, ((crossing.edge + 3) % 6) as HexEdge] : [null, null, null];
    if (!high || !low || edge === null || ramps.some(r => hexKey(r.upper) === hexKey(high) && r.edge === edge)) continue;
    const ramp = rampFor(world, high, low, edge);
    ramps.push(ramp);
    // Wedge: sloped path surface plus two side faces down to the lower tile.
    const dx = ramp.to[0] - ramp.from[0], dz = ramp.to[2] - ramp.from[2], len = Math.hypot(dx, dz);
    const sx = (-dz / len) * ramp.width / 2, sz = (dx / len) * ramp.width / 2;
    const fl: Vec3 = [ramp.from[0] + sx, ramp.from[1], ramp.from[2] + sz], fr: Vec3 = [ramp.from[0] - sx, ramp.from[1], ramp.from[2] - sz];
    const tl: Vec3 = [ramp.to[0] + sx, ramp.to[1], ramp.to[2] + sz], tr: Vec3 = [ramp.to[0] - sx, ramp.to[1], ramp.to[2] - sz];
    const lift = (p: Vec3, y: number): Vec3 => [p[0], y, p[2]];
    quad(fl, tl, tr, fr, 'path');
    tri(fl, lift(fl, ramp.to[1]), tl, 'cliffTop');
    tri(fr, tr, lift(fr, ramp.to[1]), 'cliffTop');
  }
  return { islandId: settlement.islandId, triangles, walls, ramps };
}

/**
 * Road centerlines in 3D. Level crossings stay flat; a crossing onto a lower tile runs down its ramp,
 * so every road reaches its port edge on the surface it is drawn over.
 */
export function roadProfiles(world: HexWorld): RoadProfile[] {
  return settlementRoads(world).map(road => {
    const settlement = world.settlements.find(s => s.islandId === road.islandId)!, land = landIndex(settlement);
    const tiles = road.tiles.map(t => land.get(hexKey(t))!);
    const at = (tile: HexTile): Vec3 => { const [x, z] = hexToWorld(tile, world.size); return [x, tileTop(tile), z]; };
    const points: Vec3[] = tiles.length ? [at(tiles[0])] : [];
    for (let i = 1; i < tiles.length; i++) {
      const from = tiles[i - 1], to = tiles[i], edge = HEX_EDGES.find(e => hexKey(hexNeighbor(from, e)) === hexKey(to))!;
      if (tileTop(from) > tileTop(to) + EPSILON) { const r = rampFor(world, from, to, edge); points.push(r.from, r.to); }
      else if (tileTop(to) > tileTop(from) + EPSILON) { const r = rampFor(world, to, from, ((edge + 3) % 6) as HexEdge); points.push(r.to, r.from); }
      points.push(at(to));
    }
    const last = tiles.at(-1);
    if (last && road.port) { const [px, pz] = road.points.at(-1)!; points.push([px, tileTop(last), pz]); }
    return { islandId: road.islandId, routeId: road.routeId, points };
  });
}
