import { HEX_EDGES, hexCorner, hexEdgeMidpoint, hexKey, hexNeighbor, hexToWorld, type HexEdge } from './hex';
import { SEA_FLOOR, TERRAIN_PALETTE, buildRamps, landIndex, terrainHash as hash, tileTop, type TerrainRamp } from './hex-terrain';
import { WATER_LEVEL, type HexSettlement, type HexTerrain, type HexTile, type HexWorld } from './hex-world';
import type { Vec3 } from './types';

/**
 * Natural terrain style (Phase D.2c-1, 37-tile prototype only). Same hex tops, ramps and road levels as
 * the A2 terrain, but level neighbors of the same ground run into each other without a rim, so the land
 * reads as one surface; faceted rock walls; and sand beaches that slope from the coast into the water.
 * Plain data like hex-terrain.ts; A2 and the 19-tile prototype keep using buildSettlementTerrain.
 */

/** The GLB palette plus a few close shades: quiet rims, a forest floor near the grass, sand and two GLB rock tones. */
export const NATURAL_PALETTE = {
  ...TERRAIN_PALETTE,
  grassRim: '#aac3a0', forestFloor: '#a9c39f', forestRim: '#9dbb9d',
  sand: '#ead9b2', sandRim: '#e3d1aa', sandWet: '#d2c4a1',
  rockMid: '#9caeb9', rockPale: '#bbc8cd',
} as const;
export type NaturalKey = keyof typeof NATURAL_PALETTE;
export type TerrainPart = 'top' | 'wall' | 'ramp' | 'beach';
/** `shade` scales the palette color (1 when absent): the faint per-tile variation that keeps hexes readable. */
export interface NaturalTriangle { a: Vec3; b: Vec3; c: Vec3; color: NaturalKey; part: TerrainPart; shade?: number }

/** Inner face share of the circumradius; outside it, each edge is a rim or (toward level, like ground) a seamless band. */
export const NATURAL_INSET = 0.9;
/** Per-tile shade spread of the ground, and how much darker the band toward a seamless neighbor is. */
export const TILE_SHADE = 0.05, SEAM_SHADE = 0.985;
/** Beaches start at most this high, just under the land they leave, and run down into the water. */
export const BEACH_TOP = WATER_LEVEL + 0.3;
export const BEACH_LIP = 0.004;
const DRY_SLOPE = (22 * Math.PI) / 180, WET_SLOPE = (10 * Math.PI) / 180;
const DRY_LINE = WATER_LEVEL + 0.05, BEACH_END = WATER_LEVEL - 0.07, SKIRT_BOTTOM = WATER_LEVEL - 0.1;
/** Walls: a thin lip in the tile's own color, then rock rows about this tall. */
const LIP = 0.07, ROW = 0.3;
/** Step walls lean onto the lower tile by at most this much, so ramps, trees and decor next to them stay clear. */
export const STEP_LEAN_MAX = 0.16;
const EPSILON = 1e-6;

export type CoastKind = 'beach' | 'cliff';
/** One wall as a grid of points, `grid[column][row]`: columns run from corner A to corner B, rows top to bottom. */
export interface NaturalWall {
  tile: HexTile; edge: HexEdge; kind: 'coast' | 'step'; coast?: CoastKind; top: number; bottom: number;
  /** Bridge and dock edges, and steps under a ramp, stay plain (no lean) so what stands on them fits. */
  flat: boolean; grid: Vec3[][];
}
/** A beach in front of one coast edge: start heights at both corners (A, B) and the waterline distance. */
export interface BeachEdge { tile: HexTile; edge: HexEdge; start: [number, number]; waterline: [number, number] }
export interface NaturalTerrain {
  islandId: string; triangles: NaturalTriangle[]; walls: NaturalWall[]; ramps: TerrainRamp[]; beaches: BeachEdge[];
  /** Foam quads at the waterline: along the foot of every cliff, and where every beach meets the sea. */
  foam: Vec3[][];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const edgeKey = (tile: { q: number; r: number }, edge: HexEdge) => `${hexKey(tile)}:${edge}`;

/** Coast edges that carry a bridge end or a dock: they keep a plain cliff, never a beach. */
export function reservedEdges(world: HexWorld, islandId: string): Set<string> {
  const settlement = world.settlements.find(s => s.islandId === islandId);
  return new Set([
    ...world.bridges.flatMap(b => [b.from, b.to]).filter(p => p.islandId === islandId).map(p => edgeKey(p.tile, p.edge)),
    ...(settlement?.spurs ?? []).filter(s => s.edge !== undefined).map(s => edgeKey(s.tile, s.edge!)),
  ]);
}
/** Tiles that carry a bridge end: bridges start from rock, so these tiles keep cliffs on every coast edge. */
export function bridgeTiles(world: HexWorld, islandId: string): Set<string> {
  return new Set(world.bridges.flatMap(b => [b.from, b.to]).filter(p => p.islandId === islandId).map(p => hexKey(p.tile)));
}
const BEACH_TERRAIN: readonly HexTerrain[] = ['shore', 'sand'];
/** Shore and sand tiles, and the settlement's `cliffBeaches`, get beaches; every other coast is rock. */
export function coastKind(settlement: HexSettlement, tile: HexTile, edge: HexEdge, reserved: Set<string>, bridged: Set<string> = new Set()): CoastKind {
  if (reserved.has(edgeKey(tile, edge)) || bridged.has(hexKey(tile))) return 'cliff';
  const listed = (settlement.cliffBeaches ?? []).some(t => t.q === tile.q && t.r === tile.r);
  return BEACH_TERRAIN.includes(tile.terrain) || listed ? 'beach' : 'cliff';
}

/** Beach cross-section from start height `h`: [distance from the edge, height] rows, dry sand then wet sand. */
export function beachRows(h: number): [number, number][] {
  const dry = Math.max(0, h - DRY_LINE) / Math.tan(DRY_SLOPE);
  return [[0, h], [dry, Math.min(h, DRY_LINE)], [dry + (Math.min(h, DRY_LINE) - BEACH_END) / Math.tan(WET_SLOPE), BEACH_END]];
}
/** Distance from the edge at which a beach starting at height `h` reaches the water surface. */
export function beachWaterline(h: number): number {
  const [, [dry, y]] = beachRows(h);
  return dry + (y - WATER_LEVEL) / Math.tan(WET_SLOPE);
}

/**
 * Ground groups: level neighbors in the same group share one surface. The plaza tile is grass here (the
 * scene paves a round plaza on it) and meadows are a lighter shade of the same grass.
 */
const GROUND: Record<HexTerrain, { group: string; inner: NaturalKey; rim: NaturalKey; lift?: number }> = {
  grass: { group: 'green', inner: 'grass', rim: 'grassRim' }, meadow: { group: 'green', inner: 'grass', rim: 'grassRim', lift: 0.025 },
  plaza: { group: 'green', inner: 'grass', rim: 'grassRim' }, forest: { group: 'forest', inner: 'forestFloor', rim: 'forestRim' },
  shore: { group: 'sand', inner: 'sand', rim: 'sandRim' }, sand: { group: 'sand', inner: 'sand', rim: 'sandRim' },
  stone: { group: 'stone', inner: 'cliffTop', rim: 'rockMid' },
};
const LIP_COLORS: Record<HexTerrain, NaturalKey> = {
  grass: 'grassEdge', meadow: 'grassEdge', plaza: 'grassEdge', forest: 'grassEdge', shore: 'sandWet', sand: 'sandWet', stone: 'rockPale',
};
/** A tile's own faint shade: a few percent either way, so hexes stay readable up close without forming a board. */
export const tileShade = (tile: HexTile) => 1 + (hash(tile.q, 3, tile.r) - 0.5) * TILE_SHADE + (GROUND[tile.terrain].lift ?? 0);
/** Whether two neighbors draw no rim between them: same ground group and the same height. */
export const seamless = (a: HexTile, b: HexTile) =>
  GROUND[a.terrain].group === GROUND[b.terrain].group && Math.abs(tileTop(a) - tileTop(b)) < EPSILON;

/**
 * Wall rows and columns. Corner columns stay on the hex corners and every top point on the hex edge, so
 * neighboring walls and tops meet; the two inner columns lean outward more with depth, so no face overhangs.
 */
function wallGrid(world: HexWorld, tile: HexTile, edge: HexEdge, top: number, bottom: number, kind: 'coast' | 'step', flat: boolean) {
  const R = world.size, [ax, az] = hexCorner(tile, R, (edge + 5) % 6), [bx, bz] = hexCorner(tile, R, edge);
  const [cx, cz] = hexToWorld(tile, R), [mx, mz] = hexEdgeMidpoint(tile, edge, R), apothem = (R * Math.sqrt(3)) / 2;
  const nx = (mx - cx) / apothem, nz = (mz - cz) / apothem;
  const end = kind === 'coast' ? WATER_LEVEL - 0.12 : bottom, lip = Math.min(LIP, (top - end) / 3);
  const split = Math.max(1, Math.round((top - lip - end) / ROW)), spacing = (top - lip - end) / split;
  const rows = [top, top - lip, ...Array.from({ length: split - 1 }, (_, k) => top - lip - spacing * (k + 1)), end, ...(kind === 'coast' ? [SEA_FLOOR] : [])];
  return [0, 1 / 3, 2 / 3, 1].map((t, c) => {
    const px = lerp(ax, bx, t), pz = lerp(az, bz, t), inner = c === 1 || c === 2;
    let lean = 0;
    return rows.map((row, r) => {
      let y = row;
      // Inner rock rows shift up or down a little, so facets do not line up in bands.
      if (inner && r >= 2 && r <= split) y += (hash(px, r, pz) - 0.5) * 0.44 * spacing;
      if (inner && !flat && r > 0) {
        const drop = rows[r - 1] - rows[r];
        lean += r === 1 ? 0.012 + 0.02 * hash(pz, r, px) : drop * (0.12 + 0.22 * hash(px, r + 7, pz));
        if (kind === 'step') lean = Math.min(lean, STEP_LEAN_MAX);
      }
      return [px + nx * lean, y, pz + nz * lean] as Vec3;
    });
  });
}

function wallColor(tile: HexTile, kind: 'coast' | 'step', r: number, lowerY: number, x: number, z: number): NaturalKey {
  if (r === 0) return LIP_COLORS[tile.terrain];
  // Rock just above and below the waterline is darker, like wet stone.
  if (kind === 'coast' && lowerY <= WATER_LEVEL + 0.02) return 'cliffDeep';
  const h = hash(x, r + 11, z);
  return kind === 'step' ? (h < 0.4 ? 'cliffTop' : h < 0.75 ? 'rockMid' : 'cliff') : (h < 0.45 ? 'cliff' : h < 0.8 ? 'rockMid' : 'cliffTop');
}

/** Point of a wall column at the water surface (columns only go down, so this is one crossing). */
function waterlinePoint(column: Vec3[]): Vec3 {
  for (let r = 1; r < column.length; r++) {
    const [a, b] = [column[r - 1], column[r]];
    if (a[1] >= WATER_LEVEL && b[1] <= WATER_LEVEL) {
      const t = (a[1] - WATER_LEVEL) / (a[1] - b[1] || 1);
      return [lerp(a[0], b[0], t), WATER_LEVEL, lerp(a[2], b[2], t)];
    }
  }
  return column.at(-1)!;
}
export const wallWaterline = (wall: NaturalWall) => wall.grid.map(waterlinePoint);

export function buildNaturalTerrain(world: HexWorld, settlement: HexSettlement): NaturalTerrain {
  const R = world.size, land = landIndex(settlement), reserved = reservedEdges(world, settlement.islandId), bridged = bridgeTiles(world, settlement.islandId);
  const triangles: NaturalTriangle[] = [], walls: NaturalWall[] = [], beaches: BeachEdge[] = [], foam: Vec3[][] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: NaturalKey, part: TerrainPart, shade?: number) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) < 1e-9) return;
    triangles.push(shade === undefined ? { a, b, c, color, part } : { a, b, c, color, part, shade });
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: NaturalKey, part: TerrainPart, shade?: number) => {
    tri(a, b, c, color, part, shade); tri(a, c, d, color, part, shade);
  };
  // Beach pieces are generated without a fixed winding; turn each one to face up (or, for skirts, `toward`).
  const facing = (a: Vec3, b: Vec3, c: Vec3, color: NaturalKey, toward: Vec3 = [0, 1, 0]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] < 0) tri(a, c, b, color, 'beach');
    else tri(a, b, c, color, 'beach');
  };
  const rampEdges = new Set(buildRamps(world, settlement).ramps.map(r => edgeKey(r.upper, r.edge)));

  for (const tile of settlement.tiles) {
    const top = tileTop(tile), [cx, cz] = hexToWorld(tile, R), { inner, rim } = GROUND[tile.terrain], shade = tileShade(tile);
    const outer = [0, 1, 2, 3, 4, 5].map(i => { const [x, z] = hexCorner(tile, R, i); return [x, top, z] as Vec3; });
    const inset = outer.map(([x, , z]) => [lerp(cx, x, NATURAL_INSET), top, lerp(cz, z, NATURAL_INSET)] as Vec3);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      tri([cx, top, cz], inset[i], inset[j], inner, 'top', shade);
      // The band between corners i and i + 1 lies along edge i + 1.
      const neighbor = land.get(hexKey(hexNeighbor(tile, ((i + 1) % 6) as HexEdge)));
      if (neighbor && seamless(tile, neighbor)) quad(inset[i], outer[i], outer[j], inset[j], inner, 'top', shade * SEAM_SHADE);
      else quad(inset[i], outer[i], outer[j], inset[j], rim, 'top', shade);
    }
    for (const edge of HEX_EDGES) {
      const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
      const bottom = neighbor ? tileTop(neighbor) : SEA_FLOOR;
      if (neighbor && bottom >= top - EPSILON) continue;
      const kind = neighbor ? 'step' : 'coast', key = edgeKey(tile, edge);
      const coast = neighbor ? undefined : coastKind(settlement, tile, edge, reserved, bridged);
      // Behind a beach the wall stays plain too, so no rock pokes through the sand.
      const flat = reserved.has(key) || rampEdges.has(key) || coast === 'beach';
      const grid = wallGrid(world, tile, edge, top, bottom, kind, flat);
      walls.push({ tile, edge, kind, coast, top, bottom, flat, grid });
      for (let c = 0; c < 3; c++) for (let r = 0; r < grid[c].length - 1; r++) {
        const color = wallColor(tile, kind, r, grid[c][r + 1][1], (grid[c][r][0] + grid[c + 1][r][0]) / 2, (grid[c][r][2] + grid[c + 1][r][2]) / 2);
        // Same winding as A2: (upper c, lower c, lower c+1, upper c+1) faces away from the tile.
        quad(grid[c][r], grid[c][r + 1], grid[c + 1][r + 1], grid[c + 1][r], color, 'wall');
      }
    }
  }
  const ramps = buildRamps(world, settlement);
  for (const t of ramps.triangles) triangles.push({ ...t, part: 'ramp' });

  /* ------------------------------------------------------------------ beaches and foam */
  const coastWalls = walls.filter(w => w.kind === 'coast');
  const apothem = (R * Math.sqrt(3)) / 2;
  const geometry = (w: NaturalWall) => {
    const [cx, cz] = hexToWorld(w.tile, R), [mx, mz] = hexEdgeMidpoint(w.tile, w.edge, R);
    const A = hexCorner(w.tile, R, (w.edge + 5) % 6), B = hexCorner(w.tile, R, w.edge);
    return { A, B, n: [(mx - cx) / apothem, (mz - cz) / apothem] as [number, number] };
  };
  // Rounded (and -0 folded into 0) so the two coast edges meeting at a corner find each other.
  const pointKey = ([x, z]: [number, number]) => `${Math.round(x * 1e4) / 1e4 + 0},${Math.round(z * 1e4) / 1e4 + 0}`;
  // A beach starts just under the lowest land tile at each corner, so it never rises over a lower neighbor.
  const startHeight = (tile: HexTile, corner: number) => {
    const touching = [tile, land.get(hexKey(hexNeighbor(tile, corner as HexEdge))), land.get(hexKey(hexNeighbor(tile, ((corner + 1) % 6) as HexEdge)))];
    return Math.min(BEACH_TOP, ...touching.filter((t): t is HexTile => Boolean(t)).map(t => tileTop(t) - BEACH_LIP));
  };
  const at = (p: [number, number], dir: [number, number], d: number, y: number): Vec3 => [p[0] + dir[0] * d, y, p[1] + dir[1] * d];
  const band = (p: [number, number], q: [number, number], dir: [number, number], dp: number, dq: number, width: number) => {
    const y = WATER_LEVEL + 0.012;
    foam.push([at(p, dir, dp, y), at(q, dir, dq, y), at(q, dir, dq + width, y), at(p, dir, dp + width, y)]);
  };

  for (const wall of coastWalls) {
    const { A, B, n } = geometry(wall);
    if (wall.coast === 'beach') {
      const start: [number, number] = [startHeight(wall.tile, (wall.edge + 5) % 6), startHeight(wall.tile, wall.edge)];
      const [ra, rb] = start.map(beachRows);
      for (let k = 0; k < ra.length - 1; k++) {
        const color: NaturalKey = ra[k + 1][1] >= DRY_LINE - EPSILON && rb[k + 1][1] >= DRY_LINE - EPSILON ? 'sand' : 'sandWet';
        const a0 = at(A, n, ra[k][0], ra[k][1]), b0 = at(B, n, rb[k][0], rb[k][1]), a1 = at(A, n, ra[k + 1][0], ra[k + 1][1]), b1 = at(B, n, rb[k + 1][0], rb[k + 1][1]);
        facing(a0, b0, b1, color);
        facing(a0, b1, a1, color);
      }
      const waterline = start.map(beachWaterline) as [number, number];
      beaches.push({ tile: wall.tile, edge: wall.edge, start, waterline });
      band(A, B, n, waterline[0] - 0.05, waterline[1] - 0.05, 0.14);
    } else {
      const line = wallWaterline(wall);
      for (let c = 0; c < 3; c++) {
        const p: [number, number] = [line[c][0], line[c][2]], q: [number, number] = [line[c + 1][0], line[c + 1][2]];
        band(p, q, n, 0.03, 0.03, 0.14);
      }
    }
  }

  // Corners: every coast corner joins exactly two coast edges. Fill the open water wedge between them.
  const corners = new Map<string, { wall: NaturalWall; end: 'A' | 'B' }[]>();
  for (const wall of coastWalls) {
    const { A, B } = geometry(wall);
    for (const [p, end] of [[A, 'A'], [B, 'B']] as const) corners.set(pointKey(p), [...(corners.get(pointKey(p)) ?? []), { wall, end }]);
  }
  const angle = ([x, z]: [number, number]) => Math.atan2(z, x);
  const dir = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];
  for (const pair of corners.values()) {
    if (pair.length !== 2) continue;
    const ends = pair.map(({ wall, end }) => {
      const { A, B, n } = geometry(wall), v = end === 'A' ? A : B, other = end === 'A' ? B : A;
      const len = Math.hypot(other[0] - v[0], other[1] - v[1]);
      return { wall, v, u: [(other[0] - v[0]) / len, (other[1] - v[1]) / len] as [number, number], n, beach: wall.coast === 'beach',
        reserved: reserved.has(edgeKey(wall.tile, wall.edge)), corner: end === 'A' ? (wall.edge + 5) % 6 : wall.edge };
    });
    if (!ends.some(e => e.beach)) {
      // Two cliffs at an outer corner: close the gap between their foam strips with a small fan.
      const [e1, e2] = ends, cross = e1.u[0] * e1.n[1] - e1.u[1] * e1.n[0], s = Math.sign(cross) || 1;
      let span = s * (angle(e2.u) - angle(e1.u));
      while (span <= 0) span += Math.PI * 2;
      if (span > Math.PI) {
        const from = angle(e1.n), to = from + s * (span - Math.PI), steps = 3;
        for (let i = 0; i < steps; i++) {
          const a = dir(from + ((to - from) * i) / steps), b = dir(from + ((to - from) * (i + 1)) / steps), y = WATER_LEVEL + 0.012;
          foam.push([at(e1.v, a, 0.03, y), at(e1.v, b, 0.03, y), at(e1.v, b, 0.17, y), at(e1.v, a, 0.17, y)]);
        }
      }
      continue;
    }
    // Rotate from the first edge toward the second through the water: `s` is the turning direction.
    const [e1, e2] = ends, s = Math.sign(e1.u[0] * e1.n[1] - e1.u[1] * e1.n[0]) || 1;
    let span = s * (angle(e2.u) - angle(e1.u));
    while (span <= 0) span += Math.PI * 2;
    const h = startHeight(e1.wall.tile, e1.corner);
    let from: number | null = null, to = 0;
    if (e1.beach && e2.beach) { if (span > Math.PI + EPSILON) { from = Math.PI / 2; to = span - Math.PI / 2; } }
    else if (e1.beach && !e2.reserved) { from = Math.PI / 2; to = span; }
    else if (e2.beach && !e1.reserved) { from = 0; to = span - Math.PI / 2; }
    if (from !== null && to > from + EPSILON) {
      const rows = beachRows(h), steps = Math.ceil((to - from) / (Math.PI / 6)), base = angle(e1.u);
      const ray = (k: number) => dir(base + s * (from! + ((to - from!) * k) / steps));
      for (let i = 0; i < steps; i++) {
        const [p, q] = [ray(i), ray(i + 1)];
        for (let k = 0; k < rows.length - 1; k++) {
          const color: NaturalKey = rows[k + 1][1] >= DRY_LINE - EPSILON ? 'sand' : 'sandWet';
          const p0 = at(e1.v, p, rows[k][0], rows[k][1]), q0 = at(e1.v, q, rows[k][0], rows[k][1]);
          const p1 = at(e1.v, p, rows[k + 1][0], rows[k + 1][1]), q1 = at(e1.v, q, rows[k + 1][0], rows[k + 1][1]);
          facing(p0, q0, q1, color);
          facing(p0, q1, p1, color);
        }
        const w = beachWaterline(h), y = WATER_LEVEL + 0.012;
        foam.push([at(e1.v, p, w - 0.05, y), at(e1.v, q, w - 0.05, y), at(e1.v, q, w + 0.09, y), at(e1.v, p, w + 0.09, y)]);
      }
    }
    // A beach that stops at a bridge or dock edge closes its open side with a short sand skirt.
    for (const [e, other] of [[e1, e2], [e2, e1]] as const) {
      if (!e.beach || !other.reserved) continue;
      const rows = beachRows(h), away: Vec3 = [-e.u[0], 0, -e.u[1]];
      for (let k = 0; k < rows.length - 1; k++) {
        const t0 = at(e.v, e.n, rows[k][0], rows[k][1]), t1 = at(e.v, e.n, rows[k + 1][0], rows[k + 1][1]);
        const b0 = at(e.v, e.n, rows[k][0], SKIRT_BOTTOM), b1 = at(e.v, e.n, rows[k + 1][0], SKIRT_BOTTOM);
        facing(t0, t1, b1, 'sandWet', away);
        facing(t0, b1, b0, 'sandWet', away);
      }
    }
  }
  return { islandId: settlement.islandId, triangles, walls, ramps: ramps.ramps, beaches, foam };
}
