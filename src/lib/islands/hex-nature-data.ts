import { HEX_EDGES, hexCorner, hexEdgeMidpoint, hexKey, hexNeighbor, hexSpiral, hexToWorld, type Axial } from './hex';
import { tileTop } from './hex-terrain';
import { WATER_LEVEL, settlementRoads, type HexWorld } from './hex-world';
import type { Vec3 } from './types';

/**
 * Nature and water placement shared by every hex world (D.3-1, moved out of the scale prototype): forest patches
 * and GLB tree instances, coast rocks and foam, shallow water and road tiles. Pure data, deterministic.
 */

/** Trees from the v2.1 GLB, instanced; `density` is trees per tile. */
export interface ForestPatch { islandId: string; tiles: Axial[]; density: number }

const at = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;

/** Deterministic 0–1 value per position and salt. */
function hash(x: number, z: number, salt: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
export interface TreeInstance { islandId: string; tile: Axial; position: Vec3; rotation: number; scale: number; kind: number }
/** GLB tree kinds, in instancing order. */
export const TREE_NODES = ['Tree_001_CanopyTrunk', 'Tree_002_CanopyTrunk', 'Tree_003_CanopyTrunk', 'Tree_004_CanopyTrunk', 'Tree_005_CanopyTrunk'] as const;
const TREE_MIN_GAP = 0.5, TREE_RADIUS = 0.62;

/** Trees scattered inside each forest tile (never over its edge), spaced apart, varied in size and kind. */
export function forestInstances(world: HexWorld, patches: ForestPatch[]): TreeInstance[] {
  const out: TreeInstance[] = [];
  for (const patch of patches) {
    const settlement = world.settlements.find(s => s.islandId === patch.islandId);
    for (const hex of patch.tiles) {
      const tile = settlement?.tiles.find(t => at(t, hex));
      if (!tile) continue;
      const [cx, cz] = hexToWorld(tile, world.size), placed: [number, number][] = [];
      for (let attempt = 0; placed.length < patch.density && attempt < 40; attempt++) {
        const a = hash(cx, cz, attempt * 2) * Math.PI * 2, d = Math.sqrt(hash(cx, cz, attempt * 2 + 1)) * TREE_RADIUS * world.size / 1.25;
        const p: [number, number] = [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
        if (placed.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < TREE_MIN_GAP)) continue;
        placed.push(p);
        const h = hash(p[0], p[1], 9);
        out.push({ islandId: patch.islandId, tile: hex, position: [p[0], tileTop(tile), p[1]], rotation: h * Math.PI * 2,
          scale: .5 + .2 * hash(p[0], p[1], 3), kind: Math.floor(hash(p[0], p[1], 5) * TREE_NODES.length) });
      }
    }
  }
  return out;
}

export interface RockInstance { position: Vec3; scale: number; tint: number }
/** Low-poly boulders at the foot of some coast cliffs, skipping docks and bridge ends. */
export function coastRocks(world: HexWorld): RockInstance[] {
  const reserved = new Set([
    ...world.bridges.flatMap(b => [b.from, b.to].map(p => `${hexKey(p.tile)}:${p.edge}`)),
    ...world.settlements.flatMap(s => (s.spurs ?? []).filter(x => x.edge !== undefined).map(x => `${hexKey(x.tile)}:${x.edge}`)),
  ]);
  const out: RockInstance[] = [];
  for (const settlement of world.settlements) {
    const land = new Set(settlement.tiles.map(hexKey));
    for (const tile of settlement.tiles) for (const edge of HEX_EDGES) {
      if (land.has(hexKey(hexNeighbor(tile, edge))) || reserved.has(`${hexKey(tile)}:${edge}`)) continue;
      const [mx, mz] = hexEdgeMidpoint(tile, edge, world.size), [cx, cz] = hexToWorld(tile, world.size);
      if (hash(mx, mz, 1) > .35) continue;
      const out1 = .18 + .12 * hash(mx, mz, 2), along = (hash(mx, mz, 4) - .5) * .6;
      const nx = (mx - cx) / Math.hypot(mx - cx, mz - cz), nz = (mz - cz) / Math.hypot(mx - cx, mz - cz);
      out.push({ position: [mx + nx * out1 - nz * along, WATER_LEVEL + .02, mz + nz * out1 + nx * along], scale: .22 + .2 * hash(mx, mz, 6), tint: hash(mx, mz, 7) });
    }
  }
  return out;
}

/** Foam strips just outside every coast edge, at the waterline: one quad (4 corners) per edge. */
export function coastFoam(world: HexWorld, width = 0.16): Vec3[][] {
  const out: Vec3[][] = [];
  for (const settlement of world.settlements) {
    const land = new Set(settlement.tiles.map(hexKey));
    for (const tile of settlement.tiles) for (const edge of HEX_EDGES) {
      if (land.has(hexKey(hexNeighbor(tile, edge)))) continue;
      const [cx, cz] = hexToWorld(tile, world.size);
      const a = hexCorner(tile, world.size, (edge + 5) % 6), b = hexCorner(tile, world.size, edge);
      const push = (p: [number, number], k: number): Vec3 => {
        const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz);
        return [p[0] + dx / l * k, WATER_LEVEL + .012, p[1] + dz / l * k];
      };
      out.push([push(a, .02), push(b, .02), push(b, .02 + width), push(a, .02 + width)]);
    }
  }
  return out;
}

/** Shallow water: every non-land hex within `ring` of land, deduplicated across islands. */
export function shallowHexes(world: HexWorld, ring: number): Axial[] {
  const land = new Set(world.settlements.flatMap(s => s.tiles.map(hexKey)));
  const seen = new Map<string, Axial>();
  for (const t of world.settlements.flatMap(s => s.tiles)) for (const h of hexSpiral(t, ring)) {
    if (!land.has(hexKey(h))) seen.set(hexKey(h), h);
  }
  return [...seen.values()];
}

/** Path tiles of every road, per island, so forests and other decor can stay off them. */
export function roadTiles(world: HexWorld): Set<string> {
  return new Set(settlementRoads(world).flatMap(r => r.tiles.map(t => `${r.islandId}:${hexKey(t)}`)));
}
