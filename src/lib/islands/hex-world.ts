import {
  HEX_EDGES, addAxial, hexDirection, hexDistance, hexEdgeMidpoint, hexKey, hexNeighbor, hexSpiral, hexToWorld, oppositeEdge, worldToHex,
  type Axial, type HexEdge,
} from './hex';
import type { IslandDefinition } from './types';

export type HexTerrain = 'plaza' | 'grass' | 'meadow' | 'sand' | 'stone' | 'shore' | 'forest';
export interface HexTile extends Axial { terrain: HexTerrain; /** Raises the tile top; 0 is the base land height. */ height?: number }
/** A road from the plaza without a bridge: to a water-facing edge (a dock), or with no edge to a tile center. */
export interface HexSpur {
  id: string; tile: Axial; edge?: HexEdge;
  /** Explicit tiles between the plaza and `tile`, when the shortest path would cross a building. */
  via?: Axial[];
  /** Map points (x, z) after `tile`, all on level land: e.g. straight up to a door between porch posts. */
  approach?: [number, number][];
}
/**
 * One island as a cluster of tiles. The tile list may have any size or shape, as long as it is contiguous.
 * `surface: 'continuous'` merges the tiles into one terrain mesh with cliffs and ramps (D.2b); otherwise
 * each tile is a separate prism (D.2a).
 */
export interface HexSettlement {
  islandId: string; center: Axial; tiles: HexTile[]; surface?: 'continuous'; spurs?: HexSpur[];
  /** Natural terrain style only (D.2c-1): land tiles whose coast cliffs get a strip of beach at their foot. */
  cliffBeaches?: Axial[];
  /** M3.1 regional world: an island of the plan with no written lessons, drawn as a low-detail island in mist. */
  planned?: true;
}
/** A bridge end: the outward edge of one land tile. */
export interface HexPort { islandId: string; tile: Axial; edge: HexEdge }
/** A straight bridge across one or more water hexes; any port can take more routes later. */
export interface HexBridge { id: string; from: HexPort; to: HexPort; kind: 'wood' | 'stone' }
export interface HexWorld { size: number; settlements: HexSettlement[]; bridges: HexBridge[] }

const cluster = (center: Axial, terrain: (tile: Axial) => HexTerrain, height: (tile: Axial) => number = () => 0): HexTile[] =>
  hexSpiral(center, 1).map(tile => ({ ...tile, terrain: terrain(tile), height: height(tile) }));
const at = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;

/**
 * Phase D.2a prototype: the three existing islands as 7-tile settlements, one water hex apart,
 * joined by two bridges. Preview only; the production /islands scene does not read this.
 */
export const hexWorld: HexWorld = {
  size: 1.25,
  settlements: [
    {
      islandId: 'foundations', center: { q: 0, r: 0 }, surface: 'continuous',
      // D.2b: 8 tiles. (0, -1) is a raised headland for the lighthouse, (0, 1) a low shore for the dock,
      // and (-2, 1) gives the workshop two level tiles to stand across.
      tiles: [
        ...cluster({ q: 0, r: 0 }, t => at(t, { q: 0, r: 0 }) ? 'plaza' : at(t, { q: 0, r: 1 }) ? 'shore' : 'grass',
          t => at(t, { q: 0, r: -1 }) ? 0.5 : at(t, { q: 0, r: 1 }) ? -0.55 : 0),
        { q: -2, r: 1, terrain: 'grass', height: 0 },
      ],
      spurs: [{ id: 'foundations-dock', tile: { q: 0, r: 1 }, edge: 5 }],
    },
    {
      islandId: 'structures', center: { q: 4, r: -4 },
      tiles: cluster({ q: 4, r: -4 }, t => at(t, { q: 4, r: -4 }) ? 'plaza' : t.r === -3 ? 'sand' : 'meadow'),
    },
    {
      islandId: 'algorithms', center: { q: 8, r: -4 },
      tiles: cluster({ q: 8, r: -4 }, t => at(t, { q: 8, r: -4 }) ? 'plaza' : t.r === -5 ? 'stone' : 'grass', t => t.r === -5 ? 0.22 : 0),
    },
  ],
  bridges: [
    { id: 'foundations-structures', kind: 'wood',
      from: { islandId: 'foundations', tile: { q: 1, r: -1 }, edge: 1 }, to: { islandId: 'structures', tile: { q: 3, r: -3 }, edge: 4 } },
    { id: 'structures-algorithms', kind: 'stone',
      from: { islandId: 'structures', tile: { q: 5, r: -4 }, edge: 0 }, to: { islandId: 'algorithms', tile: { q: 7, r: -4 }, edge: 3 } },
  ],
};

/** World y of a tile top at height 0; tiles, roads, bridges and buildings all stand on it. */
export const LAND_TOP = 0.55;
/** World y of the sea surface. */
export const WATER_LEVEL = -0.3;
export const tileHeight = (tile: HexTile) => tile.height ?? 0;
export function findTile(world: HexWorld, islandId: string, hex: Axial) {
  return world.settlements.find(s => s.islandId === islandId)?.tiles.find(t => at(t, hex));
}
/** World x/z where a bridge meets its tile: the midpoint of the port edge. */
export const portPoint = (world: HexWorld, port: HexPort) => hexEdgeMidpoint(port.tile, port.edge, world.size);

/** Tile path from the settlement center to `target`, staying on the settlement's own tiles and out of forests. */
export function settlementPath(settlement: HexSettlement, target: Axial, avoidForest = true): Axial[] {
  const land = new Set(settlement.tiles.filter(t => !avoidForest || t.terrain !== 'forest' || at(t, target)).map(hexKey));
  const previous = new Map<string, Axial | null>([[hexKey(settlement.center), null]]);
  const queue = [settlement.center];
  while (queue.length) {
    const hex = queue.shift()!;
    if (at(hex, target)) break;
    for (const edge of HEX_EDGES) {
      const next = hexNeighbor(hex, edge);
      if (land.has(hexKey(next)) && !previous.has(hexKey(next))) { previous.set(hexKey(next), hex); queue.push(next); }
    }
  }
  if (!previous.has(hexKey(target))) return [];
  const path: Axial[] = [];
  for (let hex: Axial | null = target; hex; hex = previous.get(hexKey(hex)) ?? null) path.unshift(hex);
  return path;
}

/** Road polylines (world x/z): settlement center → port tile → port edge midpoint, per bridge end and spur. */
export function settlementRoads(world: HexWorld) {
  const road = (routeId: string, islandId: string, tile: Axial, edge?: HexEdge, bridgeId?: string, spur?: HexSpur) => {
    const settlement = world.settlements.find(s => s.islandId === islandId)!;
    const tiles = spur?.via ? [settlement.center, ...spur.via, tile] : settlementPath(settlement, tile);
    const port: HexPort | undefined = edge === undefined ? undefined : { islandId, tile, edge };
    const approach = spur?.approach ?? [];
    return { islandId, routeId, bridgeId, port, approach, tiles,
      points: [...tiles.map(t => hexToWorld(t, world.size)), ...(port ? [portPoint(world, port)] : []), ...approach] };
  };
  return [
    ...world.bridges.flatMap(bridge => [bridge.from, bridge.to].map(port => road(bridge.id, port.islandId, port.tile, port.edge, bridge.id))),
    ...world.settlements.flatMap(s => (s.spurs ?? []).map(spur => road(spur.id, s.islandId, spur.tile, spur.edge, undefined, spur))),
  ];
}

/** Returns every rule the world breaks; an empty list means the layout is valid. */
export function validateHexWorld(world: HexWorld, islandIds: readonly string[]): string[] {
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const settlement of world.settlements) {
    const keys = settlement.tiles.map(hexKey);
    if (new Set(keys).size !== keys.length) problems.push(`${settlement.islandId}: duplicate tiles`);
    if (!keys.includes(hexKey(settlement.center))) problems.push(`${settlement.islandId}: center is not a tile`);
    else {
      const reached = settlement.tiles.filter(t => settlementPath(settlement, t, false).length).length;
      if (reached !== settlement.tiles.length) problems.push(`${settlement.islandId}: tiles are not contiguous`);
    }
    for (const key of keys) {
      const other = owner.get(key);
      if (other && other !== settlement.islandId) problems.push(`tile ${key}: shared by ${other} and ${settlement.islandId}`);
      owner.set(key, settlement.islandId);
    }
  }
  // Settlements must stay separate islands: at least one water hex between any two of them.
  for (const [i, a] of world.settlements.entries()) for (const b of world.settlements.slice(i + 1)) {
    if (a.tiles.some(t => b.tiles.some(u => hexDistance(t, u) < 2))) problems.push(`${a.islandId} and ${b.islandId}: no water between them`);
  }
  const ids = world.settlements.map(s => s.islandId);
  for (const id of islandIds) if (ids.filter(x => x === id).length !== 1) problems.push(`${id}: expected exactly one settlement`);
  for (const id of ids) if (!islandIds.includes(id)) problems.push(`${id}: unknown island`);

  for (const settlement of world.settlements) for (const spur of settlement.spurs ?? []) {
    if (owner.get(hexKey(spur.tile)) !== settlement.islandId) problems.push(`${spur.id}: ${hexKey(spur.tile)} is not a ${settlement.islandId} tile`);
    if (spur.edge !== undefined && owner.has(hexKey(hexNeighbor(spur.tile, spur.edge)))) problems.push(`${spur.id}: edge ${spur.edge} does not face water`);
    if (spur.edge !== undefined && spur.approach) problems.push(`${spur.id}: ends at an edge and at approach points`);
    const chain = spur.via ? [settlement.center, ...spur.via, spur.tile] : [];
    for (const [i, hex] of chain.entries()) {
      const tile = settlement.tiles.find(t => at(t, hex));
      if (!tile) problems.push(`${spur.id}: via ${hexKey(hex)} is not a ${settlement.islandId} tile`);
      else if (tile.terrain === 'forest') problems.push(`${spur.id}: via ${hexKey(hex)} is forest`);
      if (i > 0 && hexDistance(chain[i - 1], hex) !== 1) problems.push(`${spur.id}: via ${hexKey(chain[i - 1])} → ${hexKey(hex)} is not adjacent`);
    }
    // Approach points continue on the level of `tile`, so the road needs no ramp to reach them.
    const level = tileHeight(settlement.tiles.find(t => at(t, spur.tile)) ?? { q: 0, r: 0, terrain: 'grass' });
    let previous = hexToWorld(spur.tile, world.size);
    for (const point of spur.approach ?? []) {
      for (let k = 1; k <= 10; k++) {
        const x = previous[0] + (point[0] - previous[0]) * k / 10, z = previous[1] + (point[1] - previous[1]) * k / 10;
        const under = settlement.tiles.find(t => at(t, worldToHex(x, z, world.size)));
        if (!under || under.terrain === 'forest' || Math.abs(tileHeight(under) - level) > 1e-9) {
          problems.push(`${spur.id}: approach leaves level land near ${x.toFixed(2)},${z.toFixed(2)}`); break;
        }
      }
      previous = point;
    }
  }
  const bridgeIds = world.bridges.map(b => b.id);
  if (new Set(bridgeIds).size !== bridgeIds.length) problems.push('duplicate bridge ids');
  for (const bridge of world.bridges) {
    const { from, to } = bridge;
    for (const port of [from, to]) {
      if (owner.get(hexKey(port.tile)) !== port.islandId) problems.push(`${bridge.id}: ${hexKey(port.tile)} is not a ${port.islandId} tile`);
      if (owner.has(hexKey(hexNeighbor(port.tile, port.edge)))) problems.push(`${bridge.id}: ${port.islandId} edge ${port.edge} does not face water`);
    }
    if (from.islandId === to.islandId) problems.push(`${bridge.id}: connects an island to itself`);
    for (const port of [from, to]) for (const spur of world.settlements.find(s => s.islandId === port.islandId)?.spurs ?? []) {
      if (at(spur.tile, port.tile) && spur.edge === port.edge) problems.push(`${spur.id}: shares an edge with ${bridge.id}`);
    }
    if (to.edge !== oppositeEdge(from.edge)) problems.push(`${bridge.id}: edges ${from.edge} and ${to.edge} do not face each other`);
    const span = hexDistance(from.tile, to.tile);
    if (!at(addAxial(from.tile, hexDirection(from.edge), span), to.tile)) problems.push(`${bridge.id}: ports are not on one straight line`);
    else for (let k = 1; k < span; k++) {
      const key = hexKey(addAxial(from.tile, hexDirection(from.edge), k));
      if (owner.has(key)) problems.push(`${bridge.id}: crosses land at ${key}`);
    }
  }
  // Every settlement is reachable from the first one over bridges.
  const reached = new Set(ids.slice(0, 1));
  for (let grew = true; grew;) {
    grew = false;
    for (const { from, to } of world.bridges) for (const [a, b] of [[from.islandId, to.islandId], [to.islandId, from.islandId]]) {
      if (reached.has(a) && !reached.has(b)) { reached.add(b); grew = true; }
    }
  }
  for (const id of ids) if (!reached.has(id)) problems.push(`${id}: not connected by bridges`);
  return problems;
}

/** Center of all land tiles; the scene shifts the map by this so it sits around the origin. */
export function worldCenter(world: HexWorld): [number, number] {
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  const mid = (i: 0 | 1) => (Math.min(...all.map(p => p[i])) + Math.max(...all.map(p => p[i]))) / 2;
  return [mid(0), mid(1)];
}
/** Gives each island the position and bounds of its hex settlement so the hex camera can frame it. */
export function settlementFrames(world: HexWorld, islands: IslandDefinition[]): IslandDefinition[] {
  const offset = worldCenter(world);
  return islands.flatMap(island => {
    const settlement = world.settlements.find(s => s.islandId === island.id);
    if (!settlement) return [];
    const points = settlement.tiles.map(t => hexToWorld(t, world.size));
    const [cx, cz] = hexToWorld(settlement.center, world.size);
    const xs = points.map(p => p[0] - cx), zs = points.map(p => p[1] - cz), r = world.size;
    return [{ ...island,
      position: [cx - offset[0], 0, cz - offset[1]],
      bounds: { min: [Math.min(...xs) - r, -1, Math.min(...zs) - r], max: [Math.max(...xs) + r, 2.6, Math.max(...zs) + r] },
    } satisfies IslandDefinition];
  });
}
