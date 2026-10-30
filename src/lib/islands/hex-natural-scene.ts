import { HEX_EDGES, hexEdgeMidpoint, hexKey, hexNeighbor, hexToWorld, type Axial, type HexEdge } from './hex';
import { roadProfiles, tileTop } from './hex-terrain';
import { buildNaturalTerrain, wallWaterline, type NaturalTerrain } from './hex-terrain-natural';
import { WATER_LEVEL, portPoint, type HexTile, type HexWorld } from './hex-world';
import type { ForestPatch, RockInstance, TreeInstance } from './hex-scale-prototype';
import type { Vec3 } from './types';

/**
 * Placement for the natural style (Phase D.2c-1, 37-tile prototype only), as plain data: clustered forests,
 * cliff-foot boulders and summit crags, the settlement layout around the plaza, and the sea shade. The
 * scene only instances what these functions return.
 */

/** Deterministic 0–1 value per position and salt. */
function hash(x: number, z: number, salt: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
const apothem = (world: HexWorld) => (world.size * Math.sqrt(3)) / 2;

/** Places to keep clear on the map: building footprints as circles (x, z, radius). */
export type KeepOut = [number, number, number];
type Segment = [[number, number], [number, number]];

const segmentDistance = ([[ax, az], [bx, bz]]: Segment, px: number, pz: number) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)));
};
/** Every road and bridge centerline as 2D segments. */
export function routeSegments(world: HexWorld): Segment[] {
  return [
    ...roadProfiles(world).flatMap(r => r.points.slice(1).map((p, i): Segment => [[r.points[i][0], r.points[i][2]], [p[0], p[2]]])),
    ...world.bridges.map((b): Segment => [portPoint(world, b.from), portPoint(world, b.to)]),
  ];
}

/**
 * Distance from (x, z) to the inside edge of `tile` across `edge`: how far a point is from that side.
 * Positive inside the tile.
 */
function insideBy(world: HexWorld, tile: Axial, edge: HexEdge, x: number, z: number) {
  const [cx, cz] = hexToWorld(tile, world.size), [mx, mz] = hexEdgeMidpoint(tile, edge, world.size), a = apothem(world);
  return a - ((x - cx) * (mx - cx) + (z - cz) * (mz - cz)) / a;
}

interface Clearance { routes: Segment[]; keepOut: KeepOut[] }
const clear = ({ routes, keepOut }: Clearance, x: number, z: number, road: number, building: number) =>
  routes.every(s => segmentDistance(s, x, z) >= road) && keepOut.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) >= r + building);

/** Edge margins for a point on `tile`: small toward level neighbors that `joins` accepts, larger toward coasts and steps. */
function fits(world: HexWorld, land: Map<string, HexTile>, tile: HexTile, x: number, z: number, open: number, closed: number,
  joins: (neighbor: HexTile) => boolean = () => true) {
  return HEX_EDGES.every(edge => {
    const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
    const level = neighbor && Math.abs(tileTop(neighbor) - tileTop(tile)) < 1e-6 && joins(neighbor);
    return insideBy(world, tile, edge, x, z) >= (level ? open : closed);
  });
}

/** Jittered triangular lattice over one hex, `spacing` apart, deterministic. */
function lattice(world: HexWorld, tile: Axial, spacing: number, salt: number): [number, number][] {
  const [cx, cz] = hexToWorld(tile, world.size), out: [number, number][] = [], reach = world.size;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
    const x = cx + (i + (j % 2 ? 0.5 : 0)) * spacing, z = cz + j * spacing * 0.866;
    if (Math.hypot(x - cx, z - cz) > reach) continue;
    out.push([x + (hash(x, z, salt) - 0.5) * spacing * 0.5, z + (hash(z, x, salt + 1) - 0.5) * spacing * 0.5]);
  }
  return out;
}

/** GLB tree kinds by instancing index: 2 and 3 are the conifers (138 triangles), the others broadleaf (324). */
const CONIFERS = [2, 3], BROADLEAF = [0, 1, 4];
/**
 * Forest density. The first D.2c-1 pass planted 123 trees (D.2b: 54) and halved the continuous render rate;
 * these values keep the clusters at about 1.5 times D.2b, with more of the lighter conifers.
 */
const FOREST = { spacing: 0.5, core: 0.75, rim: 0.5, spill: 0.25, conifers: 0.45 } as const;

/**
 * Forests as clusters: dense inside, thinner toward the rim, a few smaller trees spilling onto the meadow
 * next to them, and conifers on high ground. Trees stay off roads, buildings and tile edges that drop away.
 */
export function clusteredForest(world: HexWorld, patches: ForestPatch[], keepOut: KeepOut[]): TreeInstance[] {
  const routes = routeSegments(world), out: TreeInstance[] = [];
  for (const patch of patches) {
    const settlement = world.settlements.find(s => s.islandId === patch.islandId);
    if (!settlement) continue;
    const land = new Map(settlement.tiles.map(t => [hexKey(t), t]));
    const inPatch = new Set(patch.tiles.map(hexKey));
    const placed: [number, number][] = [];
    const plant = (tile: HexTile, x: number, z: number, scale: number, conifer: boolean) => {
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.36)) return;
      placed.push([x, z]);
      const kinds = conifer ? CONIFERS : BROADLEAF;
      out.push({ islandId: patch.islandId, tile: { q: tile.q, r: tile.r }, position: [x, tileTop(tile), z], rotation: hash(x, z, 9) * Math.PI * 2,
        scale, kind: kinds[Math.floor(hash(x, z, 5) * kinds.length)] });
    };
    for (const hex of patch.tiles) {
      const tile = land.get(hexKey(hex));
      if (!tile) continue;
      const neighbors = HEX_EDGES.filter(e => inPatch.has(hexKey(hexNeighbor(tile, e)))).length, core = neighbors >= 2;
      const high = (tile.height ?? 0) >= 0.6;
      for (const [x, z] of lattice(world, tile, FOREST.spacing, hexKey(tile).length + tile.q * 3 + tile.r)) {
        if (hash(x, z, 2) > (core ? FOREST.core : FOREST.rim)) continue;
        // Toward a level forest neighbor the canopy may close up; elsewhere it keeps back from the edge.
        if (!fits(world, land, tile, x, z, 0.1, 0.36, n => inPatch.has(hexKey(n)))) continue;
        if (!clear({ routes, keepOut }, x, z, 0.62, 0.45)) continue;
        plant(tile, x, z, (core ? 0.58 : 0.5) + 0.16 * hash(x, z, 3), high || hash(x, z, 6) < FOREST.conifers);
      }
    }
    // Spill: a few smaller trees on open grass right next to the forest, so its edge is not a tile outline.
    for (const hex of patch.tiles) for (const edge of HEX_EDGES) {
      const tile = land.get(hexKey(hexNeighbor(hex, edge)));
      if (!tile || inPatch.has(hexKey(tile)) || !['grass', 'meadow'].includes(tile.terrain) || hexKey(tile) === hexKey(settlement.center)) continue;
      for (const [x, z] of lattice(world, tile, 0.5, 31 + edge)) {
        if (insideBy(world, tile, ((edge + 3) % 6) as HexEdge, x, z) > 0.6 || hash(x, z, 12) > FOREST.spill) continue;
        if (!fits(world, land, tile, x, z, 0.1, 0.36, n => inPatch.has(hexKey(n)))) continue;
        if (!clear({ routes, keepOut }, x, z, 0.62, 0.45)) continue;
        plant(tile, x, z, 0.42 + 0.1 * hash(x, z, 3), (tile.height ?? 0) >= 0.6);
      }
    }
  }
  // No stray trees: drop any with fewer than two others close by, until none is left alone.
  for (let pruned = true; pruned;) {
    pruned = false;
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i];
      const near = out.filter(o => o !== t && o.islandId === t.islandId && Math.hypot(o.position[0] - t.position[0], o.position[2] - t.position[2]) < 0.9).length;
      if (near < 2) { out.splice(i, 1); pruned = true; }
    }
  }
  return out;
}

export interface NaturalRock extends RockInstance { kind: 'foot' | 'crag'; islandId: string }

/** Boulders at the foot of rock cliffs (more under tall ones) and a few crags on every stone summit. */
export function naturalRocks(world: HexWorld, terrains: NaturalTerrain[], keepOut: KeepOut[]): NaturalRock[] {
  const routes = routeSegments(world), out: NaturalRock[] = [];
  for (const terrain of terrains) {
    for (const wall of terrain.walls) {
      if (wall.kind !== 'coast' || wall.coast !== 'cliff' || wall.flat) continue;
      const height = wall.top - WATER_LEVEL, line = wallWaterline(wall);
      const [cx, cz] = hexToWorld(wall.tile, world.size), [mx, mz] = hexEdgeMidpoint(wall.tile, wall.edge, world.size), a = apothem(world);
      const n = [(mx - cx) / a, (mz - cz) / a];
      // About one boulder under each tall cliff, fewer under low ones (D.2b had 44 coast rocks in all).
      const count = (height > 1.2 ? 1 : 0) + (hash(mx, mz, 1) < (height > 1.2 ? 0.3 : height > 0.7 ? 0.4 : 0.2) ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const p = line[1 + ((k + Math.floor(hash(mz, mx, k) * 2)) % 2)], out1 = 0.12 + 0.16 * hash(mx, mz, 2 + k);
        const x = p[0] + n[0] * out1, z = p[2] + n[1] * out1;
        if (!clear({ routes, keepOut }, x, z, 0.7, 0.4)) continue;
        out.push({ kind: 'foot', islandId: terrain.islandId, position: [x, WATER_LEVEL + 0.02, z],
          scale: (height > 1.2 ? 0.3 : 0.22) + 0.2 * hash(mx, mz, 6 + k), tint: hash(mx, mz, 7 + k) });
      }
    }
    const settlement = world.settlements.find(s => s.islandId === terrain.islandId)!;
    for (const tile of settlement.tiles.filter(t => t.terrain === 'stone')) {
      const [cx, cz] = hexToWorld(tile, world.size);
      for (let k = 0; k < 2; k++) {
        const ang = hash(cx, cz, 30 + k) * Math.PI * 2, d = 0.15 + 0.35 * hash(cz, cx, 31 + k);
        const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d, scale = 0.3 + 0.22 * hash(x, z, 32);
        if (!clear({ routes, keepOut }, x, z, 0.6, 0.35)) continue;
        // Sunk a little into the summit so the crag reads as part of the rock.
        out.push({ kind: 'crag', islandId: terrain.islandId, position: [x, tileTop(tile) + 0.15 * scale, z], scale, tint: hash(x, z, 33) });
      }
    }
  }
  return out;
}

/** Sea shade at (x, z): 0 at the coast, 1 in open water, from the distance to the nearest land tile. */
export function seaShade(world: HexWorld, x: number, z: number): number {
  let nearest = Infinity;
  for (const s of world.settlements) for (const t of s.tiles) {
    const [cx, cz] = hexToWorld(t, world.size);
    nearest = Math.min(nearest, Math.hypot(x - cx, z - cz));
  }
  const d = Math.max(0, nearest - apothem(world)) + (hash(x, z, 90) - 0.5) * 0.35;
  return Math.max(0, Math.min(1, (d - 0.35) / 3.2));
}

/** A grid over the whole map plus a wide margin: positions (x, z) and a shade per vertex, for one water mesh. */
export function seaGrid(world: HexWorld, step = 0.6, margin = 9) {
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  const [x0, x1] = [Math.min(...all.map(p => p[0])) - margin, Math.max(...all.map(p => p[0])) + margin];
  const [z0, z1] = [Math.min(...all.map(p => p[1])) - margin, Math.max(...all.map(p => p[1])) + margin];
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const points: [number, number][] = [], shade: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    points.push([x, z]);
    // The outer ring is pure open sea, so the grid blends into the plane under it.
    shade.push(i === 0 || j === 0 || i === nx || j === nz ? 1 : seaShade(world, x, z));
  }
  return { nx, nz, points, shade };
}

/** Natural terrain for every settlement, built once per world. */
const terrainCache = new WeakMap<HexWorld, NaturalTerrain[]>();
export function naturalTerrains(world: HexWorld): NaturalTerrain[] {
  let terrains = terrainCache.get(world);
  if (!terrains) { terrains = world.settlements.map(s => buildNaturalTerrain(world, s)); terrainCache.set(world, terrains); }
  return terrains;
}

/** The spine of the foundations island: arrival at the dock, through the plaza, up to the lighthouse. */
export const MAIN_ROUTES = ['foundations-dock', 'foundations-lighthouse'] as const;
export const MAIN_ROAD_WIDTH = 0.6;

export interface PlazaLayout {
  islandId: string;
  /** A round paved plaza on the center tile, where every road starts. */
  center: Vec3; radius: number;
  /** Low hedges on the plaza rim, between the road entries. */
  hedges: { position: Vec3; yaw: number; length: number }[];
  /** Guidepost boards in the middle of the plaza: one per destination, `yaw` turning +x toward it. */
  signs: { routeId: string; yaw: number }[];
  /** Lamps along the main route, alternating sides, and a pair at each main road's plaza entry. */
  lamps: Vec3[];
  /** Paving in front of the landmarks: the workshop forecourt and the lighthouse terrace. */
  pads: { kind: 'forecourt' | 'terrace'; position: Vec3; size: [number, number] }[];
}

/** Plaza, guidepost, lamps and landmark paving for one settlement, from its roads and building placements. */
export function plazaLayout(world: HexWorld, islandId: string, keepOut: KeepOut[], landmarks: { terrace?: [number, number, number] } = {}): PlazaLayout {
  const settlement = world.settlements.find(s => s.islandId === islandId)!, land = new Map(settlement.tiles.map(t => [hexKey(t), t]));
  const plaza = land.get(hexKey(settlement.center))!, [cx, cz] = hexToWorld(plaza, world.size), y = tileTop(plaza);
  const radius = 1, routes = routeSegments(world);
  const roads = roadProfiles(world).filter(r => r.islandId === islandId);
  const entry = (r: (typeof roads)[number]) => Math.atan2(r.points[1][2] - cz, r.points[1][0] - cx);
  const entries = roads.filter(r => r.points.length > 1).map(entry);
  // Hedge segments every 18° on the rim, except within 30° of a road entry.
  const hedges: PlazaLayout['hedges'] = [];
  const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    if (entries.some(e => gap(a, e) < (30 * Math.PI) / 180)) continue;
    hedges.push({ position: [cx + Math.cos(a) * (radius + 0.24), y, cz + Math.sin(a) * (radius + 0.24)], yaw: -a + Math.PI / 2, length: 0.32 });
  }
  const signs = roads.filter(r => r.points.length > 1).map(r => {
    const end = r.points.at(-1)!;
    return { routeId: r.routeId, yaw: -Math.atan2(end[2] - cz, end[0] - cx) };
  });
  const lamps: Vec3[] = [];
  const groundAt = (x: number, z: number) => settlement.tiles.find(t => {
    const [tx, tz] = hexToWorld(t, world.size);
    return HEX_EDGES.every(e => insideBy(world, t, e, x, z) >= 0) && Math.hypot(x - tx, z - tz) <= world.size;
  });
  const lampOk = (x: number, z: number, level: number) => {
    const tile = groundAt(x, z);
    return Boolean(tile && Math.abs(tileTop(tile) - level) < 1e-6 && fits(world, land, tile, x, z, 0, 0.18)
      && clear({ routes, keepOut }, x, z, 0.33, 0.15) && Math.hypot(x - cx, z - cz) > radius + 0.12);
  };
  for (const road of roads.filter(r => (MAIN_ROUTES as readonly string[]).includes(r.routeId))) {
    // A pair at the plaza entry, then one every 1.6 along level stretches, alternating sides.
    const a = entry(road);
    for (const side of [-1, 1]) {
      const x = cx + Math.cos(a + side * 0.4) * (radius + 0.26), z = cz + Math.sin(a + side * 0.4) * (radius + 0.26);
      if (lampOk(x, z, y)) lamps.push([x, y, z]);
    }
    let walked = 0, next = radius + 1.4, side = 1;
    for (let i = 1; i < road.points.length; i++) {
      const [p, q] = [road.points[i - 1], road.points[i]], run = Math.hypot(q[0] - p[0], q[2] - p[2]);
      if (Math.abs(q[1] - p[1]) < 1e-6) while (next <= walked + run) {
        const t = (next - walked) / run, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
        const nx = -(q[2] - p[2]) / run, nz = (q[0] - p[0]) / run, lx = x + nx * 0.42 * side, lz = z + nz * 0.42 * side;
        if (lampOk(lx, lz, p[1])) { lamps.push([lx, p[1], lz]); side = -side; }
        next += 1.6;
      }
      else next = Math.max(next, walked + run + 0.5);
      walked += run;
    }
  }
  const pads: PlazaLayout['pads'] = [];
  const workshop = settlement.spurs?.find(s => s.id === `${islandId}-workshop`)?.approach;
  if (workshop && workshop.length >= 2) {
    const [[fx, fz], [dx, dz]] = workshop.slice(-2), level = tileTop(groundAt(dx, dz)!);
    pads.push({ kind: 'forecourt', position: [(fx + dx) / 2, level, (fz + dz) / 2], size: [1.1, Math.hypot(fx - dx, fz - dz) + 0.1] });
  }
  if (landmarks.terrace) {
    const [tx, tz, r] = landmarks.terrace;
    pads.push({ kind: 'terrace', position: [tx, tileTop(groundAt(tx, tz)!), tz], size: [r, r] });
  }
  return { islandId, center: [cx, y, cz], radius, hedges, signs, lamps, pads };
}
