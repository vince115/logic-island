import { describe, expect, it } from 'vitest';
import { getIsland, islandsInRegion } from '@/content/world';
import { hexDistance, hexKey, type Axial } from '@/lib/islands/hex';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { regionLayout } from '@/lib/islands/regions/region-layouts';
import { validateRegion } from '@/lib/islands/regions/validate-region';
import { placeholderLandmarkTiles } from '@/components/islands/hex-world/hex-landmarks';
import { P9_CS_REGION, PLANNED_LANDSCAPES } from '@/lib/p9/cs-region';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { overviewLinks, overviewOutlines } from '@/lib/islands/regions/world-overview-geometry';
import { WORLD_MAP, validateWorldMap, worldMapRegionIds } from '@/lib/islands/regions/world-map';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { LANDMARK_ISLAND, P9_GROW, P9_WORLD_MAP } from '@/lib/p9/world-map';
import { BIOMES, regionField, sampleHeight, shorePoint, terrainMesh, treeSpots } from '@/lib/p9/world-terrain';
import { regionIslands } from '@/lib/world/learning-islands';

/*
 * P9.1 visual prototype. The prototype's CS map is the approved CS layout with new land for its four planned islands;
 * these tests hold it to the same region rules as /world/cs and to what it must not change.
 */
const base = regionLayout('cs'), ids = islandsInRegion('cs').map(i => i.id);
const plannedIds = ids.filter(id => getIsland(id)!.status === 'planned');
const accepted = islandsHomeWorld.world.bridges.map(b => b.id);
function reserved(): Record<string, Axial[]> {
  const { world, glb } = P9_CS_REGION.layout, out: Record<string, Axial[]> = {};
  for (const s of world.settlements) {
    const layout = glb.find(g => g.islandId === s.islandId), landscape = PLANNED_LANDSCAPES.find(l => l.islandId === s.islandId);
    out[s.islandId] = layout ? layout.placements.map(p => p.tile) : landscape ? [...landscape.tiles] : placeholderLandmarkTiles(s);
  }
  return out;
}

describe('P9.1 CS region layout', () => {
  it('passes the region rules of /world/cs', () => {
    expect(validateRegion(P9_CS_REGION, ids, reserved(), accepted)).toEqual([]);
  });
  it('keeps the islands with lessons, every bridge, the docks and the camera of the approved layout', () => {
    const { world } = P9_CS_REGION.layout;
    for (const s of base.layout.world.settlements.filter(s => !s.planned)) expect(world.settlements.find(o => o.islandId === s.islandId)).toBe(s);
    expect(world.bridges).toBe(base.layout.world.bridges);
    expect(P9_CS_REGION.docks).toBe(base.docks);
    // The camera keeps the approved caption room and takes the world overview's heading on both devices.
    expect(P9_CS_REGION.camera).toEqual({ ...base.camera, azimuth: { desktop: 0, phone: 0 } });
    expect(base.camera.azimuth).toEqual({ desktop: 295, phone: 105 });
    expect(P9_CS_REGION.layout.glb).toBe(base.layout.glb);
  });
  it('gives each planned island its own land: no two share an outline, none is the 19-tile plate, none is flat', () => {
    const { world } = P9_CS_REGION.layout, outlines = new Set<string>();
    for (const id of plannedIds) {
      const s = world.settlements.find(o => o.islandId === id)!, before = base.layout.world.settlements.find(o => o.islandId === id)!;
      expect(s.planned, id).toBeUndefined();
      expect(s.center, id).toEqual(before.center);
      expect(s.tiles.length, id).toBeGreaterThanOrEqual(24);
      expect(new Set(s.tiles.map(t => t.height ?? 0)).size, `${id} heights`).toBeGreaterThanOrEqual(3);
      expect(s.tiles.some(t => t.terrain === 'forest'), `${id} woods`).toBe(true);
      outlines.add(s.tiles.map(t => hexKey({ q: t.q - s.center.q, r: t.r - s.center.r })).sort().join(' '));
    }
    expect(outlines.size).toBe(plannedIds.length);
  });
  it('stands every landscape on its own island, off the roads\' ports and with trees kept clear', () => {
    const { world, natural } = P9_CS_REGION.layout;
    expect(PLANNED_LANDSCAPES.map(l => l.islandId).sort()).toEqual([...plannedIds].sort());
    for (const l of PLANNED_LANDSCAPES) {
      const s = world.settlements.find(o => o.islandId === l.islandId)!;
      for (const t of l.tiles) expect(s.tiles.some(u => u.q === t.q && u.r === t.r), `${l.islandId} ${hexKey(t)}`).toBe(true);
      for (const tree of natural!.trees.filter(t => t.islandId === l.islandId)) expect(l.tiles.some(t => hexDistance(t, tree.tile) === 0), `${l.islandId} tree on a landscape tile`).toBe(false);
    }
  });
  it('plants the islands with lessons exactly as /world/cs does', () => {
    const open = (trees: NonNullable<typeof base.layout.natural>['trees']) => trees.filter(t => !plannedIds.includes(t.islandId));
    expect(open(P9_CS_REGION.layout.natural!.trees)).toEqual(open(base.layout.natural!.trees));
  });
});

describe('P9.1 world overview', () => {
  const shapes = ['wide', 'tall'] as const;
  it('keeps the world map\'s places, ring and bridges, drawn larger without breaking its composition rules', () => {
    expect(P9_WORLD_MAP.ring).toBe(WORLD_MAP.ring);
    expect(P9_WORLD_MAP.bridges).toBe(WORLD_MAP.bridges);
    for (const shape of shapes) {
      expect(validateWorldMap(P9_WORLD_MAP, shape), shape).toEqual([]);
      for (const id of worldMapRegionIds()) {
        expect(P9_WORLD_MAP.regions[id]![shape].at).toBe(WORLD_MAP.regions[id]![shape].at);
        expect(P9_WORLD_MAP.regions[id]![shape].width).toBeCloseTo(WORLD_MAP.regions[id]![shape].width * P9_GROW.region);
      }
    }
  });
  for (const shape of shapes) it(`${shape}: every region and the hub is land with relief, woods and a landmark site above the sea`, () => {
    const outlines = overviewOutlines(P9_WORLD_MAP, REGION_LAYOUTS, shape);
    expect(outlines.map(o => o.id).sort()).toEqual([...worldMapRegionIds(), 'hub'].sort());
    for (const outline of outlines) {
      const field = regionField(outline, BIOMES[outline.id], outline.id === 'hub' ? undefined : LANDMARK_ISLAND[outline.id], 48);
      const top = Math.max(...field.heights), mesh = terrainMesh(field);
      // Relief: the land rises well above the flat 0.5 of the P8 outlines (the hub is one small island).
      expect(top, `${outline.id} relief`).toBeGreaterThan(outline.id === 'hub' ? .6 : 1.5);
      expect(Math.min(...field.heights), `${outline.id} seabed`).toBeLessThan(0);
      expect(field.islands.length, `${outline.id} islands`).toBe(outline.world.settlements.length);
      // Every tile of the region's own islands stands on land: the landform covers the islands it was grown from.
      for (const [x, z] of outline.tiles) expect(sampleHeight(field, x, z), `${outline.id} tile ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(0);
      expect(sampleHeight(field, ...field.site.at), `${outline.id} landmark site`).toBeGreaterThan(.25);
      expect(mesh.triangles, `${outline.id} triangles`).toBeGreaterThan(200);
      expect(mesh.positions.length).toBe(mesh.triangles * 9);
      expect(treeSpots(field).length, `${outline.id} trees`).toBeGreaterThan(outline.id === 'hub' ? 3 : 20);
      for (const spot of treeSpots(field)) expect(spot.y).toBeGreaterThan(0);
    }
  });
  it('is the same land on every run', () => {
    const [outline] = overviewOutlines(P9_WORLD_MAP, REGION_LAYOUTS, 'wide');
    const a = regionField(outline, BIOMES[outline.id], LANDMARK_ISLAND.cs, 32), b = regionField(outline, BIOMES[outline.id], LANDMARK_ISLAND.cs, 32);
    expect([...a.heights]).toEqual([...b.heights]);
  });
  it('links leave each region at its shore, and every link of the world map is kept', () => {
    const outlines = overviewOutlines(P9_WORLD_MAP, REGION_LAYOUTS, 'wide'), links = overviewLinks(P9_WORLD_MAP, outlines);
    expect(links.map(l => l.id).sort()).toEqual(overviewLinks(WORLD_MAP, overviewOutlines(WORLD_MAP, REGION_LAYOUTS, 'wide')).map(l => l.id).sort());
    const fields = new Map(outlines.map(o => [o.id, regionField(o, BIOMES[o.id], undefined, 48)]));
    for (const link of links) {
      const from = fields.get(link.from)!, shore = shorePoint(from, link.a, link.b);
      expect(sampleHeight(from, ...shore), `${link.id} leaves land`).toBeGreaterThan(0);
      const step = from.cell * 1.5, length = Math.hypot(link.b[0] - shore[0], link.b[1] - shore[1]);
      expect(sampleHeight(from, shore[0] + (link.b[0] - shore[0]) / length * step, shore[1] + (link.b[1] - shore[1]) / length * step), `${link.id} then sea`).toBeLessThanOrEqual(.04);
    }
  });
});

describe('P9.1 review flag', () => {
  const env = process.env as Record<string, string | undefined>;
  const run = (prototype: string | undefined, vercel: string | undefined) => {
    const before = [env.LOGIC_ISLAND_P9_PROTOTYPE, env.VERCEL_ENV];
    if (prototype === undefined) delete env.LOGIC_ISLAND_P9_PROTOTYPE; else env.LOGIC_ISLAND_P9_PROTOTYPE = prototype;
    if (vercel === undefined) delete env.VERCEL_ENV; else env.VERCEL_ENV = vercel;
    try { return p9PrototypeEnabled(); } finally {
      if (before[0] === undefined) delete env.LOGIC_ISLAND_P9_PROTOTYPE; else env.LOGIC_ISLAND_P9_PROTOTYPE = before[0];
      if (before[1] === undefined) delete env.VERCEL_ENV; else env.VERCEL_ENV = before[1];
    }
  };
  it('is off unless the build asks for it, and always off in a Vercel Production build', () => {
    expect(run(undefined, undefined)).toBe(false);
    expect(run('0', undefined)).toBe(false);
    expect(run('true', 'preview')).toBe(false);
    expect(run('1', undefined)).toBe(true);
    expect(run('1', 'preview')).toBe(true);
    expect(run('1', 'development')).toBe(true);
    expect(run('1', 'production')).toBe(false);
  });
  it('gives planned islands no lesson to open on the prototype\'s region page', () => {
    for (const island of regionIslands('cs').filter(i => i.planned)) {
      expect(island.lessons, island.id).toEqual([]);
      expect(island.units, island.id).toBeUndefined();
      expect(island.courseSlugs, island.id).toEqual([]);
      expect(island.glbAssetId, island.id).toBeUndefined();
      expect(P9_CS_REGION.layout.glb.some(g => g.islandId === island.id), `${island.id} has no GLB target`).toBe(false);
    }
  });
});
