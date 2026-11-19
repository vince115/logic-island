import type { RegionId } from '@/content/world/types';
import { hexToWorld } from '@/lib/islands/hex';
import type { OverviewOutline, SeaPoint } from '@/lib/islands/regions/world-overview-geometry';

/*
 * P9.1 visual prototype (docs/planning/P9_1_VISUAL_PROTOTYPE.md): the world overview's regions as terrain instead of
 * shrunken hex tiles. Pure data, no renderer: a height field per region, built from where the region's islands stand on
 * the overview (the same OverviewOutline the P8 overview draws), and the triangles, trees and landmark site that follow
 * from it. Nothing here names a coordinate: a region's landform comes from its own layout and its biome.
 *
 * The islands of a region are not drawn one by one. Land reaches further than the tiles, so neighbouring islands grow
 * into a few larger landmasses with channels and bays between them, all standing on one shallow shelf; relief comes
 * from each island's own dome and from a ridge that runs through the whole region.
 */
export type BiomeId = RegionId | 'hub';
export type TreeKind = 'broadleaf' | 'conifer' | 'crystal';
export interface Biome {
  /** Land colours by height, from the shore up: [height in overview units, colour]. */
  ramp: readonly (readonly [number, string])[];
  beach: string; rock: string;
  /** How tall the land gets, as a share of the region's drawn width. */
  relief: number;
  /** Height of a terrace step (overview units); 0 leaves the slopes smooth. */
  terrace: number;
  /** How far the coast wanders (tile radii). */
  coast: number;
  trees: TreeKind; treeColors: readonly [string, string]; treeDensity: number;
  /** Trees grow between these heights (overview units). */
  treeBand: readonly [number, number];
}

/**
 * One look per region, grown from the region's overview colours (region-themes.ts): CS a green highland, AI a cool
 * mineral atoll with crystal growths, design rose terraces, web sandstone mesas, sys a dark teal fjord coast. Proposals
 * for review, like every colour of the prototype.
 */
export const BIOMES: Record<BiomeId, Biome> = {
  cs: { ramp: [[0, '#a9cf7c'], [.5, '#86bf63'], [1.3, '#6aa653'], [2.3, '#8f9a86'], [3.1, '#e9ece6']], beach: '#efdfae', rock: '#9aa3a0', relief: .14, terrace: 0, coast: .55,
    trees: 'broadleaf', treeColors: ['#3f8f4a', '#5aa857'], treeDensity: .42, treeBand: [.22, 1.5] },
  ai: { ramp: [[0, '#b9cbd9'], [.5, '#9db6c9'], [1.2, '#8097b3'], [2, '#6f7fa6'], [2.8, '#eef3fb']], beach: '#dfe6ee', rock: '#66728c', relief: .13, terrace: 0, coast: .45,
    trees: 'crystal', treeColors: ['#7fd6f2', '#b79cf5'], treeDensity: .26, treeBand: [.3, 2] },
  design: { ramp: [[0, '#f6c9d4'], [.45, '#f0a9bd'], [.9, '#e88aa6'], [1.5, '#c7a3d6'], [2.1, '#fff1f4']], beach: '#fbe9df', rock: '#b98a9c', relief: .12, terrace: .34, coast: .4,
    trees: 'broadleaf', treeColors: ['#e0668f', '#f2b84b'], treeDensity: .4, treeBand: [.25, 1.6] },
  web: { ramp: [[0, '#f3cf95'], [.5, '#eeb56f'], [1.1, '#dd9450'], [1.8, '#c2733f'], [2.5, '#f7e3c0']], beach: '#f8e7c2', rock: '#a9673c', relief: .11, terrace: .46, coast: .38,
    trees: 'conifer', treeColors: ['#6f9a4f', '#9bb85a'], treeDensity: .3, treeBand: [.22, 1.5] },
  sys: { ramp: [[0, '#8fcdc6'], [.5, '#62b3ad'], [1.2, '#3f8f93'], [2, '#3b6f7c'], [2.8, '#e6f4f2']], beach: '#cfe8e2', rock: '#365a66', relief: .16, terrace: 0, coast: .6,
    trees: 'conifer', treeColors: ['#1f6f6a', '#2f8a7a'], treeDensity: .36, treeBand: [.22, 1.6] },
  hub: { ramp: [[0, '#d9c9f0'], [.4, '#c8b6e8'], [.9, '#a98fd8'], [1.5, '#f3edfb']], beach: '#efe6f8', rock: '#8d79b5', relief: .16, terrace: 0, coast: .3,
    trees: 'broadleaf', treeColors: ['#7a56c2', '#9b7bd6'], treeDensity: .3, treeBand: [.2, 1] },
};

/** The sea: where the surface is, how deep the drawn seabed goes and its colours from the shore out. */
export const SEA = { level: 0, floor: -1.15, shallow: '#bfe9e4', deep: '#2f86b8' } as const;

/* ------------------------------------------------------------------ deterministic noise */

const hash2 = (x: number, y: number, seed: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
const fade = (t: number) => t * t * (3 - 2 * t);
/** Value noise in [-1, 1]. */
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * .6 + noise(x * 2.1, y * 2.1, seed + 11) * .28 + noise(x * 4.3, y * 4.3, seed + 23) * .12;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (a: number, b: number, v: number) => fade(clamp01((v - a) / (b - a)));
const seedOf = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

/* ------------------------------------------------------------------ the height field */

export interface FieldIsland { id: string; center: SeaPoint; radius: number; peak: number; summit: SeaPoint }
export interface RegionField {
  id: BiomeId; biome: Biome;
  /** The grid: `nx` by `nz` points from `min`, `cell` apart; `heights[i + j * nx]` in overview units (the sea is at 0). */
  min: SeaPoint; cell: number; nx: number; nz: number; heights: Float32Array;
  islands: FieldIsland[];
  /** Where the region's landmark stands, on level ground. */
  site: { at: SeaPoint; height: number; radius: number };
  /** A tile's radius on the overview, the field's unit of length. */
  unit: number;
}

/** Land reaches this many tile radii beyond a tile's centre, before the coast's own wander. */
const LAND_REACH = 2.55;
/** The shelf: how fast the seabed falls away from the shore (overview units per tile radius). */
const SHELF_FALL = .26;

/**
 * The height of a region's land at any point, and the islands it was grown from. `landmarkIsland` names the island the
 * landmark stands on (the region's first island when it is not found).
 */
export function regionField(outline: OverviewOutline, biome: Biome, landmarkIsland?: string, cells = 58): RegionField {
  const { world, placed, radius: unit } = outline, seed = seedOf(outline.id);
  const settlements = world.settlements.map(s => {
    const tiles = s.tiles.map(t => placed.point(...hexToWorld(t, world.size)));
    const center: SeaPoint = [tiles.reduce((n, t) => n + t[0], 0) / tiles.length, tiles.reduce((n, t) => n + t[1], 0) / tiles.length];
    const radius = Math.max(...tiles.map(t => Math.hypot(t[0] - center[0], t[1] - center[1]))) + unit * LAND_REACH;
    return { id: s.islandId, tiles, center, radius };
  });
  const all = settlements.flatMap((s, i) => s.tiles.map(t => [t[0], t[1], i] as const));
  const xs = all.map(t => t[0]), zs = all.map(t => t[1]), margin = unit * (LAND_REACH + 4.6);
  const min: SeaPoint = [Math.min(...xs) - margin, Math.min(...zs) - margin], max: SeaPoint = [Math.max(...xs) + margin, Math.max(...zs) + margin];
  const width = Math.max(max[0] - min[0], max[1] - min[1]), cell = width / cells;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, nz = Math.ceil((max[1] - min[1]) / cell) + 1;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + unit * 2, top = span * biome.relief;

  const islands: FieldIsland[] = settlements.map(s => {
    const h = seedOf(s.id), turn = hash2(h, 1, seed) * Math.PI * 2, off = (s.radius - unit * LAND_REACH) * .28 * hash2(h, 2, seed);
    // Larger islands stand taller; every island keeps a third of the region's relief at least.
    const share = (s.radius - unit * LAND_REACH) / Math.max(...settlements.map(o => o.radius - unit * LAND_REACH));
    return { id: s.id, center: s.center, radius: s.radius, peak: top * (.34 + .66 * share) * (.72 + .5 * hash2(h, 3, seed)), summit: [s.center[0] + Math.cos(turn) * off, s.center[1] + Math.sin(turn) * off] };
  });
  const host = Math.max(0, settlements.findIndex(s => s.id === landmarkIsland));
  const site = { at: islands[host].center, radius: unit * 2.3, height: 0 };

  // The ridge that runs through the region: one direction per region, so every island's hills line up with its neighbours'.
  const ridgeTurn = hash2(seed, 5, 1) * Math.PI, rx = Math.cos(ridgeTurn), rz = Math.sin(ridgeTurn);
  const heightAt = (x: number, z: number) => {
    // Smooth distance to the nearest tile centre, and which island that tile belongs to.
    let sum = 0, nearest = Infinity, owner = 0;
    const k = unit * .5;
    for (const [tx, tz, i] of all) {
      const d = Math.hypot(x - tx, z - tz);
      sum += Math.exp(-d / k);
      if (d < nearest) { nearest = d; owner = i; }
    }
    const d = -k * Math.log(sum);
    const wander = fbm(x / (unit * 3.4), z / (unit * 3.4), seed) * biome.coast + noise(x / (unit * 1.2), z / (unit * 1.2), seed + 5) * biome.coast * .35;
    const s = (unit * (LAND_REACH + wander) - d) / unit;
    if (s <= 0) return Math.max(SEA.floor, s * SHELF_FALL);
    const island = islands[owner];
    const dome = Math.pow(clamp01(1 - Math.hypot(x - island.summit[0], z - island.summit[1]) / (island.radius * .92)), 1.35);
    const along = (x * rx + z * rz) / (unit * 5.5), across = (-x * rz + z * rx) / (unit * 2.6);
    const ridge = Math.pow(1 - Math.abs(noise(along, across, seed + 31)), 2.2);
    const rough = .8 + .35 * fbm(x / (unit * 1.7), z / (unit * 1.7), seed + 43);
    let h = .16 * smoothstep(0, .45, s) + smoothstep(.25, 1.9, s) * rough * (island.peak * dome * .72 + top * ridge * .34 * smoothstep(.6, 2.4, s));
    if (biome.terrace) { const step = Math.round(h / biome.terrace) * biome.terrace; h += (step - h) * .82; }
    return Math.max(.04, h);
  };

  site.height = Math.max(.3, heightAt(...site.at));
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = min[0] + i * cell, z = min[1] + j * cell;
    let h = heightAt(x, z);
    // Level ground under the landmark, blended into the slopes around it.
    const near = Math.hypot(x - site.at[0], z - site.at[1]) / site.radius;
    if (near < 1.6 && h > 0) h += (site.height - h) * (1 - smoothstep(.75, 1.6, near));
    heights[i + j * nx] = h;
  }
  return { id: outline.id, biome, min, cell, nx, nz, heights, islands, site, unit };
}

/** The field's height at a point, between its grid points (the seabed's floor outside the grid). */
export function sampleHeight(field: RegionField, x: number, z: number) {
  const fx = (x - field.min[0]) / field.cell, fz = (z - field.min[1]) / field.cell, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= field.nx - 1 || j >= field.nz - 1) return SEA.floor;
  const at = (a: number, b: number) => field.heights[a + b * field.nx], u = fx - i, v = fz - j;
  return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v;
}

/* ------------------------------------------------------------------ what the scene draws from it */

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(stops: Biome['ramp'], h: number): [number, number, number] {
  for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) return mix(rgb(stops[i - 1][1]), rgb(stops[i][1]), clamp01((h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])));
  return rgb(stops[stops.length - 1][1]);
}

export interface TerrainMesh { positions: Float32Array; colors: Float32Array; triangles: number }
/**
 * The field as triangles with a colour per corner (sRGB, 0..1): the land by height and steepness, the seabed from
 * shallow to deep. Cells entirely on the deep floor are left out; the sea's own floor shows there.
 */
export function terrainMesh(field: RegionField): TerrainMesh {
  const { nx, nz, cell, min, heights, biome } = field, positions: number[] = [], colors: number[] = [];
  const beach = rgb(biome.beach), rock = rgb(biome.rock), shallow = rgb(SEA.shallow), deep = rgb(SEA.deep);
  const h = (i: number, j: number) => heights[i + j * nx];
  const colour = (i: number, j: number): [number, number, number] => {
    const y = h(i, j);
    if (y <= 0) return mix(shallow, deep, Math.pow(clamp01(y / SEA.floor), .7));
    const slope = Math.hypot(h(Math.min(nx - 1, i + 1), j) - h(Math.max(0, i - 1), j), h(i, Math.min(nz - 1, j + 1)) - h(i, Math.max(0, j - 1))) / (2 * cell);
    const land = y < .2 ? mix(beach, ramp(biome.ramp, y), smoothstep(.1, .2, y)) : ramp(biome.ramp, y);
    return mix(land, rock, smoothstep(.75, 1.5, slope) * (y > .25 ? .85 : 0));
  };
  let triangles = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const;
    if (corners.every(([a, b]) => h(a, b) <= SEA.floor + 1e-4)) continue;
    // Split along the diagonal that changes height least, so ridges and shores keep their line.
    const flip = Math.abs(h(i, j) - h(i + 1, j + 1)) > Math.abs(h(i + 1, j) - h(i, j + 1));
    const order = flip ? [0, 2, 1, 1, 2, 3] : [0, 2, 3, 0, 3, 1];
    for (const c of order) {
      const [a, b] = corners[c];
      positions.push(min[0] + a * cell, h(a, b), min[1] + b * cell);
      colors.push(...colour(a, b));
    }
    triangles += 2;
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), triangles };
}

export interface TreeSpot { x: number; y: number; z: number; scale: number; turn: number; tint: 0 | 1 }
/** Where the region's trees (or crystals) stand: clustered by a slow noise, on gentle ground inside the tree band, off the landmark's site. */
export function treeSpots(field: RegionField): TreeSpot[] {
  const { biome, unit, site } = field, seed = seedOf(field.id) + 97, step = unit * .9, spots: TreeSpot[] = [];
  const x1 = field.min[0] + (field.nx - 1) * field.cell, z1 = field.min[1] + (field.nz - 1) * field.cell;
  for (let gz = field.min[1], j = 0; gz < z1; gz += step, j++) for (let gx = field.min[0], i = 0; gx < x1; gx += step, i++) {
    const x = gx + (hash2(i, j, seed) - .5) * step * .9, z = gz + (hash2(i, j, seed + 1) - .5) * step * .9, y = sampleHeight(field, x, z);
    if (y < biome.treeBand[0] || y > biome.treeBand[1]) continue;
    if (Math.hypot(x - site.at[0], z - site.at[1]) < site.radius * 1.15) continue;
    const slope = Math.hypot(sampleHeight(field, x + step * .5, z) - y, sampleHeight(field, x, z + step * .5) - y) / (step * .5);
    if (slope > 1.25) continue;
    const grove = fbm(x / (unit * 4), z / (unit * 4), seed + 3) * .5 + .5;
    if (hash2(i, j, seed + 2) > biome.treeDensity * (.35 + 1.3 * grove)) continue;
    spots.push({ x, y, z, scale: unit * (.5 + .38 * hash2(i, j, seed + 4)), turn: hash2(i, j, seed + 5) * Math.PI * 2, tint: hash2(i, j, seed + 6) > .5 ? 1 : 0 });
  }
  return spots;
}

/** Where a straight link from `from` toward `to` leaves the land of `field`: the last point above the sea along it. */
export function shorePoint(field: RegionField, from: SeaPoint, to: SeaPoint): SeaPoint {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1, dx = (to[0] - from[0]) / length, dz = (to[1] - from[1]) / length;
  let shore: SeaPoint = from;
  for (let t = 0; t < length; t += field.cell * .5) {
    const p: SeaPoint = [from[0] + dx * t, from[1] + dz * t];
    if (sampleHeight(field, ...p) > .04) shore = p; else if (t > field.unit * 3) break;
  }
  return shore;
}
