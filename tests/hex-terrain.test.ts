import { describe, expect, it } from 'vitest';
import { HEX_EDGES, hexCorner, hexEdgeCorners, hexKey, hexNeighbor, hexToWorld, worldToHex } from '@/lib/islands/hex';
import {
  RAMP_WIDTH, SEA_FLOOR, TERRAIN_PALETTE, TILE_INSET, buildSettlementTerrain, roadProfiles, tileTop, type TerrainTriangle,
} from '@/lib/islands/hex-terrain';
import { WATER_LEVEL, hexWorld, portPoint, settlementRoads, validateHexWorld } from '@/lib/islands/hex-world';
import { islands } from '@/lib/islands/data';

const R = hexWorld.size;
const foundations = hexWorld.settlements.find(s => s.islandId === 'foundations')!;
const terrain = buildSettlementTerrain(hexWorld, foundations);
const land = new Map(foundations.tiles.map(t => [hexKey(t), t]));
const normal = ({ a, b, c }: TerrainTriangle) => {
  const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('continuous foundations terrain', () => {
  it('only the foundations island uses continuous terrain, and the world stays valid', () => {
    expect(hexWorld.settlements.filter(s => s.surface === 'continuous').map(s => s.islandId)).toEqual(['foundations']);
    expect(validateHexWorld(hexWorld, islands.map(i => i.id))).toEqual([]);
  });

  it('keeps every tile outline on the hex grid, so level neighbors meet without a water gap', () => {
    const allowed = new Set(foundations.tiles.flatMap(t => {
      const [cx, cz] = hexToWorld(t, R);
      return [0, 1, 2, 3, 4, 5].flatMap(i => {
        const [x, z] = hexCorner(t, R, i);
        return [`${x.toFixed(5)},${z.toFixed(5)}`, `${(cx + (x - cx) * TILE_INSET).toFixed(5)},${(cz + (z - cz) * TILE_INSET).toFixed(5)}`];
      }).concat(`${cx.toFixed(5)},${cz.toFixed(5)}`);
    }));
    // Flat, upward triangles are tile tops (ramps are sloped, walls vertical).
    const tops = terrain.triangles.filter(t => normal(t)[1] > 1e-9 && [t.a, t.b, t.c].every(p => close(p[1], t.a[1])));
    for (const t of tops) for (const p of [t.a, t.b, t.c]) expect(allowed.has(`${p[0].toFixed(5)},${p[2].toFixed(5)}`)).toBe(true);
    // Two level neighbors use the same two corner points for their shared edge and build no wall there.
    for (const tile of foundations.tiles) for (const edge of HEX_EDGES) {
      const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
      if (!neighbor || !close(tileTop(neighbor), tileTop(tile))) continue;
      const [a, b] = hexEdgeCorners(tile, edge, R), [c, d] = hexEdgeCorners(neighbor, ((edge + 3) % 6) as typeof edge, R);
      expect(close(a[0], d[0]) && close(a[1], d[1]) && close(b[0], c[0]) && close(b[1], c[1])).toBe(true);
      expect(terrain.walls.some(w => hexKey(w.tile) === hexKey(tile) && w.edge === edge)).toBe(false);
    }
  });

  it('draws two shades per tile so the hex grid stays readable', () => {
    for (const tile of foundations.tiles) {
      const [cx, cz] = hexToWorld(tile, R);
      const colors = new Set(terrain.triangles.filter(t => [t.a, t.b, t.c].every(p => close(p[1], tileTop(tile)) && hexKey(worldToHex(p[0] * .999 + cx * .001, p[2] * .999 + cz * .001, R)) === hexKey(tile))).map(t => t.color));
      expect(colors.size, hexKey(tile)).toBeGreaterThanOrEqual(2);
    }
  });

  it('builds a coast cliff on every water edge, reaching below the sea', () => {
    expect(SEA_FLOOR).toBeLessThan(WATER_LEVEL);
    for (const tile of foundations.tiles) for (const edge of HEX_EDGES) {
      const water = !land.has(hexKey(hexNeighbor(tile, edge)));
      const wall = terrain.walls.find(w => hexKey(w.tile) === hexKey(tile) && w.edge === edge && w.kind === 'coast');
      expect(Boolean(wall), `${hexKey(tile)} edge ${edge}`).toBe(water);
      if (wall) expect([wall.top, wall.bottom]).toEqual([tileTop(tile), SEA_FLOOR]);
    }
    expect(terrain.walls.filter(w => w.kind === 'coast')).toHaveLength(foundations.tiles.reduce((n, t) => n + HEX_EDGES.filter(e => !land.has(hexKey(hexNeighbor(t, e)))).length, 0));
  });

  it('builds a step cliff wherever a tile drops to a lower neighbor', () => {
    const steps = terrain.walls.filter(w => w.kind === 'step');
    expect(steps.length).toBeGreaterThan(0);
    for (const wall of steps) {
      const neighbor = land.get(hexKey(hexNeighbor(wall.tile, wall.edge)))!;
      expect(wall.top).toBeGreaterThan(tileTop(neighbor));
      expect(wall.bottom).toBe(tileTop(neighbor));
    }
    // The lighthouse headland stands above all of its land neighbors.
    expect(steps.filter(w => hexKey(w.tile) === '0,-1').length).toBe(HEX_EDGES.filter(e => land.has(hexKey(hexNeighbor({ q: 0, r: -1 }, e)))).length);
  });

  it('never faces a triangle downward, and colors only from the GLB palette', () => {
    for (const t of terrain.triangles) expect(normal(t)[1]).toBeGreaterThan(-1e-9);
    const keys = new Set(Object.keys(TERRAIN_PALETTE));
    for (const t of terrain.triangles) expect(keys.has(t.color)).toBe(true);
  });
});

describe('ramps and road profiles', () => {
  it('puts a ramp on every road crossing between tiles of different height', () => {
    const crossings = settlementRoads(hexWorld).filter(r => r.islandId === 'foundations').flatMap(r => r.tiles.slice(1).map((t, i) => [r.tiles[i], t]))
      .filter(([a, b]) => !close(tileTop(land.get(hexKey(a))!), tileTop(land.get(hexKey(b))!)));
    expect(crossings.length).toBeGreaterThan(0);
    for (const [a, b] of crossings) {
      const [high, low] = tileTop(land.get(hexKey(a))!) > tileTop(land.get(hexKey(b))!) ? [a, b] : [b, a];
      const ramp = terrain.ramps.find(r => hexKey(r.upper) === hexKey(high) && hexKey(r.lower) === hexKey(low))!;
      expect(ramp, `${hexKey(high)}→${hexKey(low)}`).toBeDefined();
      expect([ramp.from[1], ramp.to[1]]).toEqual([tileTop(land.get(hexKey(high))!), tileTop(land.get(hexKey(low))!)]);
      expect(hexKey(worldToHex(ramp.to[0], ramp.to[2], R))).toBe(hexKey(low));
      expect(ramp.width).toBe(RAMP_WIDTH);
      const slope = Math.atan2(ramp.from[1] - ramp.to[1], Math.hypot(ramp.to[0] - ramp.from[0], ramp.to[2] - ramp.from[2]));
      expect(slope).toBeLessThan((35 * Math.PI) / 180);
    }
  });

  it('keeps every road on the surface: no vertical jumps, ending at its port on the tile top', () => {
    for (const road of roadProfiles(hexWorld)) {
      for (let i = 1; i < road.points.length; i++) {
        const [a, b] = [road.points[i - 1], road.points[i]];
        const rise = Math.abs(b[1] - a[1]), run = Math.hypot(b[0] - a[0], b[2] - a[2]);
        expect(rise, `${road.routeId} segment ${i}`).toBeLessThanOrEqual(Math.tan((35 * Math.PI) / 180) * run + 1e-9);
      }
      const plain = settlementRoads(hexWorld).find(r => r.routeId === road.routeId && r.islandId === road.islandId)!;
      const last = road.points.at(-1)!, [px, pz] = portPoint(hexWorld, plain.port!);
      expect(close(last[0], px) && close(last[2], pz)).toBe(true);
    }
  });

  it('connects the plaza down to the low dock shore', () => {
    const dock = roadProfiles(hexWorld).find(r => r.routeId === 'foundations-dock')!;
    expect(dock.points[0][1]).toBe(tileTop(land.get('0,0')!));
    expect(dock.points.at(-1)![1]).toBe(tileTop(land.get('0,1')!));
    expect(terrain.ramps.some(r => hexKey(r.upper) === '0,0' && hexKey(r.lower) === '0,1')).toBe(true);
  });
});
