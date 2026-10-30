import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAssets } from '@/lib/islands/asset-registry';
import { extractGlbParts, type GlbPart } from '@/lib/islands/glb-parts';
import { HEX_EDGES, hexCorner, hexEdgeCorners, hexKey, hexNeighbor, hexToWorld, worldToHex, type HexEdge } from '@/lib/islands/hex';
import { placementPose } from '@/lib/islands/hex-buildings';
import { SEA_FLOOR, buildRamps, buildSettlementTerrain, roadProfiles, tileTop } from '@/lib/islands/hex-terrain';
import {
  BEACH_TOP, NATURAL_INSET, STEP_LEAN_MAX, buildNaturalTerrain, reservedEdges, seamless, type NaturalTriangle,
} from '@/lib/islands/hex-terrain-natural';
import { MAIN_ROAD_WIDTH, MAIN_ROUTES, naturalTerrains, routeSegments, seaGrid, seaShade } from '@/lib/islands/hex-natural-scene';
import { LIGHTHOUSE_BASE } from '@/lib/islands/hex-layout';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { ROAD, roadParts } from '@/lib/islands/hex-route-parts';
import { WATER_LEVEL, hexWorld, portPoint, validateHexWorld, type HexTile } from '@/lib/islands/hex-world';
import { islands } from '@/lib/islands/data';

// Phase D.2c-1 natural style, 37-tile prototype only.
const asset = glbAssets['basics-island-v2.1'];
const { world, glb, natural } = scalePrototypes['37'];
const layout = glb[0], R = world.size, scale = asset.scale;
let parts: GlbPart[];
beforeAll(async () => {
  const bytes = readFileSync(`public${asset.url}`);
  const scene: Object3D = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  parts = extractGlbParts(scene, asset, ['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry']).parts;
});
const close = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const segDist = ([ax, az]: number[], [bx, bz]: number[], [px, pz]: number[]) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)));
};
const normal = ({ a, b, c }: { a: number[]; b: number[]; c: number[] }) => {
  const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
/** Real GLB footprints on the map: points over each part's bounds, as in hex-scale.test.ts. */
const footprint = (node: string, n = 6) => {
  const part = parts.find(p => p.node === node)!, pose = placementPose(world, 'foundations', layout.placements.find(p => p.node === node)!);
  const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation), out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = part.bounds.min[0] + (part.bounds.max[0] - part.bounds.min[0]) * i / (n - 1), z = part.bounds.min[2] + (part.bounds.max[2] - part.bounds.min[2]) * j / (n - 1);
    out.push([pose.position[0] + scale * (x * cos + z * sin), pose.position[2] + scale * (-x * sin + z * cos)]);
  }
  return out;
};
const nearestBuilding = (x: number, z: number) => Math.min(...['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry']
  .flatMap(n => footprint(n)).map(([px, pz]) => Math.hypot(px - x, pz - z)));

describe('D.2c-1 natural terrain: continuity', () => {
  it.each(world.settlements.map(s => [s.islandId, s] as const))('%s: every tile top is a whole hexagon on the grid', (_, settlement) => {
    const terrain = buildNaturalTerrain(world, settlement), hexArea = (3 * Math.sqrt(3) / 2) * R * R;
    for (const tile of settlement.tiles) {
      const [cx, cz] = hexToWorld(tile, R);
      const tops = terrain.triangles.filter(t => t.part === 'top' && [t.a, t.b, t.c].every(p => close(p[1], tileTop(tile)))
        && hexKey(worldToHex((t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3, R)) === hexKey(tile));
      const area = tops.reduce((sum, t) => sum + Math.hypot(...normal(t)) / 2, 0);
      expect(area, hexKey(tile)).toBeCloseTo(hexArea, 6);
      // Outline points are the six corners, inner points the inset ring and the center.
      const allowed = new Set([0, 1, 2, 3, 4, 5].flatMap(i => {
        const [x, z] = hexCorner(tile, R, i);
        return [`${x.toFixed(5)},${z.toFixed(5)}`, `${(cx + (x - cx) * NATURAL_INSET).toFixed(5)},${(cz + (z - cz) * NATURAL_INSET).toFixed(5)}`];
      }).concat(`${cx.toFixed(5)},${cz.toFixed(5)}`));
      for (const t of tops) for (const p of [t.a, t.b, t.c]) expect(allowed.has(`${p[0].toFixed(5)},${p[2].toFixed(5)}`)).toBe(true);
    }
  });

  it.each(world.settlements.map(s => [s.islandId, s] as const))('%s: one wall on every drop or coast, from the hex edge down to its base', (_, settlement) => {
    const terrain = buildNaturalTerrain(world, settlement), land = new Map(settlement.tiles.map(t => [hexKey(t), t]));
    for (const tile of settlement.tiles) for (const edge of HEX_EDGES) {
      const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
      const walls = terrain.walls.filter(w => hexKey(w.tile) === hexKey(tile) && w.edge === edge);
      const needed = !neighbor || tileTop(neighbor) < tileTop(tile) - 1e-6;
      expect(walls.length, `${hexKey(tile)} edge ${edge}`).toBe(needed ? 1 : 0);
      if (!needed) continue;
      const [wall] = walls, [[ax, az], [bx, bz]] = hexEdgeCorners(tile, edge, R), last = wall.grid[0].length - 1;
      expect(wall.bottom).toBe(neighbor ? tileTop(neighbor) : SEA_FLOOR);
      wall.grid.forEach((column, c) => {
        // Top row exactly on the hex edge at the tile top, so wall and top meet with no gap.
        const t = c / 3;
        expect(close(column[0][0], ax + (bx - ax) * t) && close(column[0][2], az + (bz - az) * t) && close(column[0][1], wall.top)).toBe(true);
        expect(column[last][1]).toBeCloseTo(wall.bottom, 9);
        for (let r = 1; r < column.length; r++) expect(column[r][1]).toBeLessThan(column[r - 1][1]);
      });
      // Corner columns stay on the hex corners all the way down, so neighboring walls share those lines.
      for (const [c, [x, z]] of [[0, [ax, az]], [3, [bx, bz]]] as const) for (const p of wall.grid[c]) expect(close(p[0], x) && close(p[2], z)).toBe(true);
      // Step walls lean only toward the lower tile, and at most STEP_LEAN_MAX.
      const [cx, cz] = hexToWorld(tile, R), apothem = (R * Math.sqrt(3)) / 2;
      for (const column of wall.grid) for (const p of column) {
        const out = ((p[0] - cx) * ((ax + bx) / 2 - cx) + (p[2] - cz) * ((az + bz) / 2 - cz)) / apothem - apothem;
        expect(out).toBeGreaterThanOrEqual(-1e-9);
        if (wall.kind === 'step') expect(out).toBeLessThanOrEqual(STEP_LEAN_MAX + 1e-9);
        if (wall.flat) expect(out).toBeLessThan(1e-9);
      }
    }
  });

  it.each(world.settlements.map(s => [s.islandId, s] as const))('%s: at every corner the walls there cover the whole height, with no slit', (_, settlement) => {
    const terrain = buildNaturalTerrain(world, settlement), spans = new Map<string, [number, number][]>();
    for (const wall of terrain.walls) for (const c of [0, 3]) {
      const column = wall.grid[c], key = `${Math.round(column[0][0] * 1e5) / 1e5 + 0},${Math.round(column[0][2] * 1e5) / 1e5 + 0}`;
      spans.set(key, [...(spans.get(key) ?? []), [column.at(-1)![1], column[0][1]]]);
    }
    for (const [key, list] of spans) {
      const sorted = [...list].sort((a, b) => a[0] - b[0]);
      let reach = sorted[0][0];
      for (const [lo, hi] of sorted) { expect(lo, key).toBeLessThanOrEqual(reach + 1e-9); reach = Math.max(reach, hi); }
      // Two walls meet at every corner they use (an outer corner, or a wall and its continuation).
      expect(list.length, key).toBeGreaterThanOrEqual(2);
    }
  });

  it('never faces a triangle downward', () => {
    for (const terrain of naturalTerrains(world)) for (const t of terrain.triangles) expect(normal(t)[1], terrain.islandId).toBeGreaterThan(-1e-9);
  });

  it('removes the rim between level neighbors of the same ground, and keeps it at every other edge', () => {
    for (const settlement of world.settlements) {
      const terrain = buildNaturalTerrain(world, settlement), land = new Map(settlement.tiles.map(t => [hexKey(t), t]));
      for (const tile of settlement.tiles) for (const edge of HEX_EDGES) {
        const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
        const [[ax, az], [bx, bz]] = hexEdgeCorners(tile, edge, R), mx = (ax + bx) / 2, mz = (az + bz) / 2, [cx, cz] = hexToWorld(tile, R);
        // The band triangles along this edge: tops whose centroid lies in the outer ring next to it.
        const band = terrain.triangles.filter(t => t.part === 'top' && close(t.a[1], tileTop(tile)) && (() => {
          const gx = (t.a[0] + t.b[0] + t.c[0]) / 3, gz = (t.a[2] + t.b[2] + t.c[2]) / 3;
          return hexKey(worldToHex(gx, gz, R)) === hexKey(tile) && Math.hypot(gx - mx, gz - mz) < Math.hypot(gx - cx, gz - cz) * 0.5;
        })());
        expect(band.length, `${settlement.islandId} ${hexKey(tile)}:${edge}`).toBeGreaterThan(0);
        const inner = terrain.triangles.find(t => t.part === 'top' && close(t.a[0], cx) && close(t.a[2], cz))!;
        const joined = Boolean(neighbor && seamless(tile, neighbor));
        for (const t of band) expect(t.color === inner.color, `${hexKey(tile)}:${edge}`).toBe(joined);
      }
    }
  });

  it('keeps the same tops, ramps and road levels as the A2 terrain', () => {
    for (const settlement of world.settlements) {
      expect(buildNaturalTerrain(world, settlement).ramps).toEqual(buildSettlementTerrain(world, settlement).ramps);
      expect(buildNaturalTerrain(world, settlement).ramps).toEqual(buildRamps(world, settlement).ramps);
    }
    // Level road stretches lie on the tile under them; every sloped stretch is exactly one ramp of the terrain.
    const ramps = naturalTerrains(world).flatMap(t => t.ramps);
    for (const road of roadProfiles(world)) for (let i = 1; i < road.points.length; i++) {
      const [a, b] = [road.points[i - 1], road.points[i]];
      if (close(a[1], b[1])) {
        const mid = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
        const tile = world.settlements.find(s => s.islandId === road.islandId)!.tiles.find(t => hexKey(t) === hexKey(worldToHex(mid[0], mid[1], R)))!;
        expect(tileTop(tile), `${road.routeId} ${i}`).toBeCloseTo(a[1], 9);
      } else {
        const match = ramps.some(r => [[r.from, r.to], [r.to, r.from]].some(([p, q]) => p.every((v, k) => close(v, a[k])) && q.every((v, k) => close(v, b[k]))));
        expect(match, `${road.routeId} ${i}`).toBe(true);
      }
    }
  });
});

describe('D.2c-1 natural terrain: beaches', () => {
  const terrains = naturalTerrains(world);
  const landOf = (islandId: string) => new Map(world.settlements.find(s => s.islandId === islandId)!.tiles.map(t => [hexKey(t), t]));

  it('lays beaches on shore and sand tiles and the listed cliff-foot tiles, never on a bridge tile or dock edge', () => {
    for (const terrain of terrains) {
      const settlement = world.settlements.find(s => s.islandId === terrain.islandId)!, reserved = reservedEdges(world, terrain.islandId);
      const bridged = new Set(world.bridges.flatMap(b => [b.from, b.to]).filter(p => p.islandId === terrain.islandId).map(p => hexKey(p.tile)));
      for (const wall of terrain.walls.filter(w => w.kind === 'coast')) {
        const listed = (settlement.cliffBeaches ?? []).some(t => hexKey(t) === hexKey(wall.tile));
        const reservedEdge = reserved.has(`${hexKey(wall.tile)}:${wall.edge}`), rock = reservedEdge || bridged.has(hexKey(wall.tile));
        expect(wall.coast, `${hexKey(wall.tile)}:${wall.edge}`).toBe(!rock && (['shore', 'sand'].includes(wall.tile.terrain) || listed) ? 'beach' : 'cliff');
        if (reservedEdge) expect(wall.flat).toBe(true);
      }
      expect(terrain.beaches.length).toBe(terrain.walls.filter(w => w.coast === 'beach').length);
    }
    expect(terrains[0].beaches.length).toBeGreaterThanOrEqual(10);
  });

  it('keeps bridge ends on rock: no beach edge shares a corner with a bridge edge', () => {
    for (const terrain of terrains) for (const bridge of world.bridges) for (const port of [bridge.from, bridge.to].filter(p => p.islandId === terrain.islandId)) {
      const [a, b] = hexEdgeCorners(port.tile, port.edge, R).map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`);
      for (const beach of terrain.beaches) {
        const corners = hexEdgeCorners(beach.tile, beach.edge, R).map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`);
        expect(corners.some(c => c === a || c === b), `${bridge.id} vs ${hexKey(beach.tile)}:${beach.edge}`).toBe(false);
      }
    }
  });

  it('starts every beach at or under the land it leaves and runs it below the waterline', () => {
    for (const terrain of terrains) for (const beach of terrain.beaches) {
      for (const [i, h] of beach.start.entries()) {
        expect(h).toBeLessThanOrEqual(Math.min(BEACH_TOP, tileTop(beach.tile)) + 1e-9);
        expect(h).toBeGreaterThan(WATER_LEVEL);
        expect(beach.waterline[i]).toBeGreaterThan(0.3);
      }
    }
    for (const terrain of terrains.filter(t => t.beaches.length)) {
      const sand = terrain.triangles.filter(t => t.part === 'beach');
      expect(Math.min(...sand.flatMap(t => [t.a[1], t.b[1], t.c[1]]))).toBeLessThan(WATER_LEVEL);
    }
  });

  it('never lifts sand over a land tile: any beach point above land is below that tile top', () => {
    for (const terrain of terrains) {
      const land = landOf(terrain.islandId);
      for (const t of terrain.triangles.filter((t): t is NaturalTriangle => t.part === 'beach')) for (const p of [t.a, t.b, t.c]) {
        const [gx, gz] = [(t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3];
        const under = land.get(hexKey(worldToHex(gx * 0.98 + p[0] * 0.02, gz * 0.98 + p[2] * 0.02, R)));
        if (under) expect(p[1], hexKey(under)).toBeLessThanOrEqual(tileTop(under) + 1e-9);
      }
    }
  });

  it('puts foam only on the water surface, along every coast edge', () => {
    for (const terrain of terrains) {
      expect(terrain.foam.length).toBeGreaterThanOrEqual(terrain.walls.filter(w => w.kind === 'coast').length);
      for (const quad of terrain.foam) for (const p of quad) expect(p[1]).toBeCloseTo(WATER_LEVEL + 0.012, 9);
    }
  });
});

describe('D.2c-1 sea shade', () => {
  it('runs from shallow at the coast to open sea far out, with an open-sea border', () => {
    const [x, z] = hexEdgeCorners({ q: 0, r: 2 }, 5, R)[0];
    expect(seaShade(world, x, z + 0.3)).toBeLessThan(0.15);
    expect(seaShade(world, -40, -40)).toBe(1);
    const grid = seaGrid(world);
    expect(grid.points.length).toBe((grid.nx + 1) * (grid.nz + 1));
    for (let i = 0; i <= grid.nx; i++) expect(grid.shade[i]).toBe(1);
  });
});

describe('D.2c-1 settlement layout', () => {
  const plaza = natural!.plaza, foundations = world.settlements[0];
  const roads = roadProfiles(world).filter(r => r.islandId === 'foundations'), routes = routeSegments(world);

  it('is still a valid world: same tiles and placements, roads checked by the validator', () => {
    expect(validateHexWorld(world, islands.map(i => i.id))).toEqual([]);
    expect(foundations.tiles).toHaveLength(37);
  });

  it('paves a round plaza on the center tile where every road starts', () => {
    const [cx, cz] = hexToWorld(foundations.center, R);
    expect(plaza.center).toEqual([cx, tileTop(foundations.tiles.find(t => hexKey(t) === '0,0')!), cz]);
    expect(plaza.radius).toBeLessThan((R * Math.sqrt(3)) / 2);
    for (const road of roads) expect(close(road.points[0][0], cx) && close(road.points[0][2], cz), road.routeId).toBe(true);
    // One guidepost board per road, pointing at where that road ends.
    expect(plaza.signs.map(s => s.routeId).sort()).toEqual(roads.map(r => r.routeId).sort());
    for (const sign of plaza.signs) {
      const end = roads.find(r => r.routeId === sign.routeId)!.points.at(-1)!;
      const dir = [Math.cos(-sign.yaw), Math.sin(-sign.yaw)], to = [end[0] - cx, end[2] - cz], len = Math.hypot(to[0], to[1]);
      expect(dir[0] * to[0] / len + dir[1] * to[1] / len).toBeCloseTo(1, 9);
    }
  });

  it('keeps plaza hedges off every road and on level land', () => {
    expect(plaza.hedges.length).toBeGreaterThan(4);
    for (const h of plaza.hedges) {
      for (const s of routes) expect(segDist(s[0], s[1], [h.position[0], h.position[2]])).toBeGreaterThan(ROAD.width / 2 + 0.15);
      expect(h.position[1]).toBe(plaza.center[1]);
    }
  });

  it('lines the main route with lamps on level ground beside it, clear of roads and buildings', () => {
    expect(plaza.lamps.length).toBeGreaterThanOrEqual(6);
    const main = roads.filter(r => (MAIN_ROUTES as readonly string[]).includes(r.routeId));
    for (const [x, y, z] of plaza.lamps) {
      const tile = foundations.tiles.find(t => hexKey(t) === hexKey(worldToHex(x, z, R)))!;
      expect(tile, `${x},${z}`).toBeDefined();
      expect(y).toBeCloseTo(tileTop(tile), 9);
      for (const s of routes) expect(segDist(s[0], s[1], [x, z])).toBeGreaterThan(0.33 - 1e-9);
      // Beside the main route (within half a meter or so of its edge).
      expect(Math.min(...main.flatMap(r => r.points.slice(1).map((p, i) => segDist([r.points[i][0], r.points[i][2]], [p[0], p[2]], [x, z]))))).toBeLessThan(0.75);
      expect(nearestBuilding(x, z)).toBeGreaterThan(0.3);
    }
  });

  it('widens only the main route, dock to plaza to lighthouse', () => {
    expect(natural!.roadWidths).toEqual(Object.fromEntries(MAIN_ROUTES.map(id => [id, MAIN_ROAD_WIDTH])));
    const plain = roadParts(world).boxes, wide = roadParts(world, natural!.roadWidths).boxes;
    let k = 0;
    for (const road of roadProfiles(world)) for (let i = 1; i < road.points.length; i++, k++) {
      expect(wide[k].size[2]).toBe((MAIN_ROUTES as readonly string[]).includes(road.routeId) ? MAIN_ROAD_WIDTH : ROAD.width);
      expect(wide[k].position).toEqual(plain[k].position);
    }
  });

  it('runs the lookout road to the lighthouse door side and paves a terrace up to it', () => {
    const lighthouse = parts.find(p => p.node === 'Landmark_Lighthouse')!;
    // The numbers the road uses are the GLB's own: base front at z 0.90, door anchor just inside it.
    expect(lighthouse.bounds.max[2]).toBeCloseTo(LIGHTHOUSE_BASE.front, 2);
    expect(lighthouse.anchor!.offset[2]).toBeLessThan(LIGHTHOUSE_BASE.front);
    const pose = placementPose(world, 'foundations', layout.placements.find(p => p.node === 'Landmark_Lighthouse')!);
    const end = roads.find(r => r.routeId === 'foundations-lighthouse')!.points.at(-1)!;
    expect(end[0]).toBeCloseTo(pose.position[0], 9);
    expect(end[2] - pose.position[2]).toBeCloseTo((LIGHTHOUSE_BASE.front + LIGHTHOUSE_BASE.gap) * scale, 9);
    expect(end[1]).toBeCloseTo(pose.position[1], 9);
    const terrace = plaza.pads.find(p => p.kind === 'terrace')!;
    expect(terrace.position[1]).toBeCloseTo(pose.position[1], 9);
    expect(Math.hypot(end[0] - terrace.position[0], end[2] - terrace.position[2])).toBeCloseTo(terrace.size[0], 9);
  });

  it('paves the workshop forecourt between the door and the spot in front of it', () => {
    const forecourt = plaza.pads.find(p => p.kind === 'forecourt')!, approach = foundations.spurs!.find(s => s.id === 'foundations-workshop')!.approach!;
    const [[fx, fz], [dx, dz]] = approach;
    expect(forecourt.position[0]).toBeCloseTo((fx + dx) / 2, 9);
    expect(forecourt.position[2]).toBeCloseTo((fz + dz) / 2, 9);
    expect(forecourt.position[1]).toBeCloseTo(placementPose(world, 'foundations', layout.placements.find(p => p.node === 'Building_Workshop')!).position[1], 9);
  });
});

describe('D.2c-1 nature', () => {
  const trees = natural!.trees;

  it('clusters trees: none stands alone, and inner forest tiles are denser than the rim', () => {
    for (const tree of trees) {
      const near = trees.filter(o => o !== tree && o.islandId === tree.islandId && Math.hypot(o.position[0] - tree.position[0], o.position[2] - tree.position[2]) < 0.9);
      expect(near.length, `${tree.islandId} ${tree.position.map(v => v.toFixed(2))}`).toBeGreaterThanOrEqual(2);
    }
    const patch = scalePrototypes['37'].forests[0], inPatch = new Set(patch.tiles.map(hexKey));
    const perTile = (core: boolean) => {
      const tiles = patch.tiles.filter(t => (HEX_EDGES.filter(e => inPatch.has(hexKey(hexNeighbor(t, e)))).length >= 2) === core);
      return trees.filter(t => t.islandId === 'foundations' && tiles.some(x => hexKey(x) === hexKey(t.tile))).length / Math.max(1, tiles.length);
    };
    expect(perTile(true)).toBeGreaterThan(perTile(false));
  });

  it('keeps trees off tile edges that drop away, and away from every building footprint', () => {
    for (const tree of trees) {
      const settlement = world.settlements.find(s => s.islandId === tree.islandId)!, land = new Map(settlement.tiles.map(t => [hexKey(t), t]));
      const tile = land.get(hexKey(tree.tile))!, [cx, cz] = hexToWorld(tile, R), apothem = (R * Math.sqrt(3)) / 2;
      for (const edge of HEX_EDGES) {
        const neighbor = land.get(hexKey(hexNeighbor(tile, edge)));
        if (neighbor && close(tileTop(neighbor), tileTop(tile))) continue;
        const [mx, mz] = hexToWorld(hexNeighbor(tile, edge as HexEdge), R).map((v, i) => (v + [cx, cz][i]) / 2);
        const inside = apothem - ((tree.position[0] - cx) * (mx - cx) + (tree.position[2] - cz) * (mz - cz)) / apothem;
        expect(inside).toBeGreaterThanOrEqual(0.36 - 1e-9);
      }
      if (tree.islandId === 'foundations') expect(nearestBuilding(tree.position[0], tree.position[2])).toBeGreaterThan(0.45);
    }
  });

  it('puts cliff-foot boulders in the water, clear of bridges and the dock, and crags on stone summits', () => {
    const land = new Map(world.settlements.flatMap(s => s.tiles.map(t => [hexKey(t), t] as const)));
    const rocks = natural!.rocks;
    expect(rocks.some(r => r.kind === 'crag')).toBe(true);
    for (const rock of rocks) {
      const under = land.get(hexKey(worldToHex(rock.position[0], rock.position[2], R)));
      if (rock.kind === 'foot') {
        expect(under).toBeUndefined();
        for (const b of world.bridges) for (const p of [b.from, b.to]) expect(Math.hypot(...portPoint(world, p).map((v, i) => v - [rock.position[0], rock.position[2]][i]))).toBeGreaterThan(0.7);
        expect(nearestBuilding(rock.position[0], rock.position[2])).toBeGreaterThan(0.4);
      } else expect((under as HexTile).terrain).toBe('stone');
    }
  });
});

describe('D.2c-1 leaves the A2 preview and the 19-tile prototype alone', () => {
  it('builds A2 and 19-tile terrain with the D.2b builder, which has no natural parts', () => {
    for (const w of [hexWorld, scalePrototypes['19'].world]) for (const s of w.settlements) {
      expect(s.cliffBeaches).toBeUndefined();
      const terrain = buildSettlementTerrain(w, s);
      expect(terrain.triangles.every(t => !('part' in t))).toBe(true);
    }
    expect(scalePrototypes['19'].natural).toBeUndefined();
  });
});
