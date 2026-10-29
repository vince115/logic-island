import {
  HEX_EDGES, addAxial, hexCorner, hexDistance, hexEdgeMidpoint, hexKey, hexNeighbor, hexSpiral, hexToWorld,
  type Axial,
} from './hex';
import { glbAssets } from './asset-registry';
import type { HexGlbSettlement } from './hex-buildings';
import { tileTop } from './hex-terrain';
import { WATER_LEVEL, settlementRoads, type HexSettlement, type HexTerrain, type HexTile, type HexWorld } from './hex-world';
import type { Vec3 } from './types';

/**
 * Island Scale & World Composition Prototype (D.2b follow-up, not approved for production).
 * Two candidate scales for the foundations island, 19 and 37 tiles, each with the other two islands
 * enlarged to match so the whole world composition can be judged. Only /islands/hex/scale/* reads this.
 */
export type ScaleVariant = '19' | '37';
export const SCALE_VARIANTS: readonly ScaleVariant[] = ['19', '37'];

/** Trees from the v2.1 GLB, instanced; `density` is trees per tile. */
export interface ForestPatch { islandId: string; tiles: Axial[]; density: number }
export interface ScalePrototype {
  variant: ScaleVariant;
  world: HexWorld;
  glb: HexGlbSettlement[];
  forests: ForestPatch[];
  /** Zone summary for the comparison report: which tiles serve which purpose. */
  zones: Record<'plaza' | 'buildings' | 'forest' | 'hills' | 'shore' | 'open', number>;
}

const at = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;
const shift = (tiles: Axial[], center: Axial) => tiles.map(t => addAxial(t, center));
/** A radius-n hex with some rim tiles removed and others added, so coasts are not symmetric. */
function shape(radius: number, remove: Axial[], extra: Axial[]): Axial[] {
  return [...hexSpiral({ q: 0, r: 0 }, radius).filter(t => !remove.some(x => at(x, t))), ...extra];
}
type Zone = { terrain: HexTerrain; height?: number };
function tiles(center: Axial, rel: Axial[], zone: (t: Axial) => Zone): HexTile[] {
  return rel.map(t => ({ ...addAxial(t, center), ...zone(t) }));
}
const inList = (list: Axial[]) => (t: Axial) => list.some(x => at(x, t));
const A = (q: number, r: number): Axial => ({ q, r });

/* ---------------------------------------------------------------- 19 tiles */

const F19 = shape(2, [A(0, 2), A(2, -2)], [A(0, -3), A(-3, 1)]);
const F19_HILLS: Record<string, number> = { '-2,0': .45, '-1,-1': .45, '-3,1': .9 };
// (-2, 1) stays open grass: it borders the workshop, and trees there would brush its wall.
const F19_FOREST = [A(-2, 2), A(-1, 2), A(1, -2)];
const f19 = tiles(A(0, 0), F19, t => {
  const k = hexKey(t);
  if (k === '0,0') return { terrain: 'plaza' };
  // South-east beach for the dock, two tiles from the workshop.
  if (k === '1,1') return { terrain: 'shore', height: -.55 };
  if (k === '0,-3') return { terrain: 'grass', height: .5 };
  if (k === '0,-2') return { terrain: 'grass', height: .25 };
  // Hills keep grass on top; only the highest step is bare stone.
  if (k in F19_HILLS) return { terrain: F19_HILLS[k] >= .9 ? 'stone' : 'grass', height: F19_HILLS[k] };
  if (inList(F19_FOREST)(t)) return { terrain: 'forest' };
  return { terrain: ['1,0', '2,0', '0,1'].includes(k) ? 'meadow' : 'grass' };
});

/* ---------------------------------------------------------------- 37 tiles */

const F37 = shape(3, [A(0, 3), A(-1, 3), A(3, -1)], [A(0, -4), A(1, -4), A(-4, 1)]);
// Scale refinement: gentler 0.3 terraces (foot, slope, peak) instead of 0.45 steps, so hills read as
// rolling ground and the lighthouse path climbs in matching steps.
const F37_HILLS: Record<string, number> = {
  '-2,0': .3, '-1,-1': .3, '-2,1': .3, '-2,-1': .6, '-3,0': .6, '-3,1': .6, '-1,-2': .6, '-4,1': .9,
};
// (-1, 2) stays a clearing: the dock road runs through it to the south-west cove.
const F37_FOREST = [A(-3, 2), A(-3, 3), A(-2, 2), A(1, -3), A(2, -3)];
const f37 = tiles(A(0, 0), F37, t => {
  const k = hexKey(t);
  if (k === '0,0') return { terrain: 'plaza' };
  // South-west cove (dock) and a low south beach.
  if (['-2,3', '0,2', '1,2'].includes(k)) return { terrain: 'shore', height: -.55 };
  if (['0,-4', '1,-4', '0,-3'].includes(k)) return { terrain: 'grass', height: .6 };
  if (k === '0,-2') return { terrain: 'grass', height: .3 };
  if (k in F37_HILLS) return { terrain: F37_HILLS[k] >= .9 ? 'stone' : 'grass', height: F37_HILLS[k] };
  if (inList(F37_FOREST)(t)) return { terrain: 'forest' };
  return { terrain: ['1,0', '1,1', '2,0', '2,1', '3,0'].includes(k) ? 'meadow' : 'grass' };
});

/* -------------------------------------------- the other two islands (placeholders) */

function harbor(center: Axial, rel: Axial[], forest: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' } : t.r >= 1 && t.q + t.r >= 1 ? { terrain: 'sand' }
    : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'meadow' });
}
function ridge(center: Axial, rel: Axial[], forest: Axial[]): HexTile[] {
  return tiles(center, rel, t => at(t, A(0, 0)) ? { terrain: 'plaza' }
    : t.r <= -1 && t.q <= 1 ? hexDistance(t, A(0, 0)) >= 2 ? { terrain: 'stone', height: .7 } : { terrain: 'grass', height: .35 }
      : inList(forest)(t) ? { terrain: 'forest' } : { terrain: 'grass' });
}

const S19 = shape(2, [A(2, 0), A(-2, 2), A(0, -2)], []), S19_FOREST = [A(1, -2), A(2, -1)];
const A19 = shape(2, [A(-2, 0), A(1, 1), A(2, -2)], []), A19_FOREST = [A(1, 0), A(0, 2)];
const S37 = shape(2, [], [A(3, -3), A(3, -2), A(2, 1), A(-1, 3), A(-3, 2), A(0, -3)]), S37_FOREST = [A(1, -2), A(2, -2), A(3, -3), A(2, -1), A(0, -3)];
const A37 = shape(2, [], [A(3, -1), A(3, -3), A(1, -3), A(-2, 3), A(1, 2), A(-3, 1)]), A37_FOREST = [A(2, 0), A(1, 1), A(1, 2), A(3, -1)];

/* ------------------------------------------------------------- assemble */

/** Tile counts per zone for the foundations island, for the comparison report. */
function zones(settlement: HexSettlement, buildingTiles: Axial[]): ScalePrototype['zones'] {
  const count = (f: (t: HexTile) => boolean) => settlement.tiles.filter(f).length;
  const isBuilding = inList(buildingTiles);
  return {
    plaza: count(t => t.terrain === 'plaza'),
    buildings: count(t => isBuilding(t)),
    forest: count(t => t.terrain === 'forest'),
    hills: count(t => t.terrain === 'stone' || (t.height ?? 0) > 0),
    shore: count(t => t.terrain === 'shore'),
    open: count(t => (t.terrain === 'grass' || t.terrain === 'meadow') && !isBuilding(t) && (t.height ?? 0) === 0),
  };
}

/**
 * The v2.1 workshop door, in Building_Workshop local GLB units: the door panel spans x 0.01–0.59 on the
 * +z wall (Anchor_Workshop sits at x 0.30, z 1.55), between porch posts at x ≈ -0.45 and 1.05.
 * Tests check these numbers against the GLB itself.
 */
export const WORKSHOP_DOOR = { x: 0.3, z: 1.55, approach: 1.5 } as const;
/** Map point of the workshop door, and of the spot straight in front of it, for a workshop at `pivot`. */
export function workshopDoor(pivot: [number, number], scale = glbAssets['basics-island-v2.1'].scale) {
  const door: [number, number] = [pivot[0] + WORKSHOP_DOOR.x * scale, pivot[1] + WORKSHOP_DOOR.z * scale];
  return { door, front: [door[0], door[1] + WORKSHOP_DOOR.approach * scale] as [number, number] };
}

function prototype(variant: ScaleVariant): ScalePrototype {
  const big = variant === '37';
  // 37 tiles, workshop road: the workshop stands across (1, 0) and (2, 0) facing +z; the road leaves the
  // plaza south, turns east across the meadow and runs straight north between the porch posts to the door.
  const workshop = workshopDoor(hexEdgeMidpoint(A(1, 0), 0, 1.25));
  const foundations: HexSettlement = {
    islandId: 'foundations', center: A(0, 0), surface: 'continuous', tiles: big ? f37 : f19,
    // A lookout road climbs to the tile below the lighthouse; the dock road drops to the low shore.
    spurs: big
      ? [{ id: 'foundations-dock', tile: A(-2, 3), edge: 5 }, { id: 'foundations-lighthouse', tile: A(0, -3) },
        { id: 'foundations-workshop', tile: A(1, 1), via: [A(0, 1)], approach: [workshop.front, workshop.door] }]
      : [{ id: 'foundations-dock', tile: A(1, 1), edge: 5 }, { id: 'foundations-lighthouse', tile: A(0, -2) }],
  };
  const sCenter = big ? A(8, -8) : A(6, -3), aCenter = big ? A(10, -2) : A(5, 3);
  const structures: HexSettlement = {
    islandId: 'structures', center: sCenter, surface: 'continuous',
    tiles: harbor(sCenter, big ? S37 : S19, big ? S37_FOREST : S19_FOREST),
  };
  const algorithms: HexSettlement = {
    islandId: 'algorithms', center: aCenter, surface: 'continuous',
    tiles: ridge(aCenter, big ? A37 : A19, big ? A37_FOREST : A19_FOREST),
  };
  // Ports chosen so the lighthouse, dock and bridges each get their own coast (see the design log).
  const world: HexWorld = {
    size: 1.25,
    settlements: [foundations, structures, algorithms],
    bridges: big ? [
      { id: 'foundations-structures', kind: 'wood', from: { islandId: 'foundations', tile: A(3, -3), edge: 1 }, to: { islandId: 'structures', tile: A(6, -6), edge: 4 } },
      { id: 'structures-algorithms', kind: 'stone', from: { islandId: 'structures', tile: A(10, -7), edge: 5 }, to: { islandId: 'algorithms', tile: A(10, -4), edge: 2 } },
    ] : [
      { id: 'foundations-structures', kind: 'wood', from: { islandId: 'foundations', tile: A(2, -1), edge: 1 }, to: { islandId: 'structures', tile: A(4, -3), edge: 4 } },
      { id: 'structures-algorithms', kind: 'stone', from: { islandId: 'structures', tile: A(5, -1), edge: 5 }, to: { islandId: 'algorithms', tile: A(5, 1), edge: 2 } },
    ],
  };
  const glb: HexGlbSettlement[] = [{
    islandId: 'foundations', asset: 'basics-island-v2.1',
    label: big ? { tile: A(0, 1), height: 2.2 } : { tile: A(0, 1), height: 2.2 },
    // Scale stays 0.6; the island grows around the buildings instead.
    placements: big ? [
      { node: 'Landmark_Lighthouse', tile: A(0, -4), offset: [0, -.15] },
      // Across (1, 0) and (2, 0) east of the plaza, door facing the meadow so a road can reach it.
      { node: 'Building_Workshop', tile: A(1, 0), across: 0 },
      { node: 'Dock_Entry', tile: A(-2, 3), edge: 5 },
    ] : [
      { node: 'Landmark_Lighthouse', tile: A(0, -3), offset: [0, -.15] },
      { node: 'Building_Workshop', tile: A(-1, 1), across: 2 },
      { node: 'Dock_Entry', tile: A(1, 1), edge: 5 },
    ],
  }];
  const forests: ForestPatch[] = [
    { islandId: 'foundations', tiles: big ? F37_FOREST : F19_FOREST, density: 5 },
    { islandId: 'structures', tiles: shift(big ? S37_FOREST : S19_FOREST, sCenter), density: 4 },
    { islandId: 'algorithms', tiles: shift(big ? A37_FOREST : A19_FOREST, aCenter), density: 4 },
  ];
  const buildingTiles = big ? [A(0, -4), A(1, 0), A(2, 0), A(-2, 3)] : [A(0, -3), A(-1, 1), A(-1, 0), A(1, 1)];
  return { variant, world, glb, forests, zones: zones(foundations, buildingTiles) };
}

export const scalePrototypes: Record<ScaleVariant, ScalePrototype> = { '19': prototype('19'), '37': prototype('37') };

/* ------------------------------------------------- nature: pure placement data */

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
