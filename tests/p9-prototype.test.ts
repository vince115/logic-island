import { describe, expect, it } from 'vitest';
import { getIsland, islandsInRegion } from '@/content/world';
import { hexDistance, hexKey, type Axial } from '@/lib/islands/hex';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { regionLayout } from '@/lib/islands/regions/region-layouts';
import { validateRegion } from '@/lib/islands/regions/validate-region';
import { placeholderLandmarkTiles } from '@/components/islands/hex-world/hex-landmarks';
import { P9_CS_REGION, PLANNED_LANDSCAPES } from '@/lib/p9/cs-region';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
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

// P9.2/P9.3: islands with lessons that draw their own landmarks (raised sites, placeholders stepping aside).
const OWN = ['structures', 'algorithms', 'databases'];

describe('P9.1 CS region layout', () => {
  it('passes the region rules of /world/cs', () => {
    expect(validateRegion(P9_CS_REGION, ids, reserved(), accepted)).toEqual([]);
  });
  it('keeps the islands with lessons, every bridge, the docks and the camera of the approved layout', () => {
    const { world } = P9_CS_REGION.layout;
    // P9.2: 資料結構島 draws its own landmarks on raised land (tests/p9-structures-island.test.ts); the other three are untouched.
    for (const s of base.layout.world.settlements.filter(s => !s.planned && !OWN.includes(s.islandId))) expect(world.settlements.find(o => o.islandId === s.islandId)).toBe(s);
    expect(world.bridges).toBe(base.layout.world.bridges);
    expect(P9_CS_REGION.docks).toBe(base.docks);
    expect(P9_CS_REGION.camera).toBe(base.camera);
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
    expect(PLANNED_LANDSCAPES.map(l => l.islandId).sort()).toEqual([...plannedIds, ...OWN].sort());
    for (const l of PLANNED_LANDSCAPES) {
      const s = world.settlements.find(o => o.islandId === l.islandId)!;
      for (const t of l.tiles) expect(s.tiles.some(u => u.q === t.q && u.r === t.r), `${l.islandId} ${hexKey(t)}`).toBe(true);
      for (const tree of natural!.trees.filter(t => t.islandId === l.islandId)) expect(l.tiles.some(t => hexDistance(t, tree.tile) === 0), `${l.islandId} tree on a landscape tile`).toBe(false);
    }
  });
  it('plants the other islands with lessons exactly as /world/cs does', () => {
    // 資料結構島's trees keep off its new landmarks; the other islands with lessons are planted exactly as before.
    const open = (trees: NonNullable<typeof base.layout.natural>['trees']) => trees.filter(t => !plannedIds.includes(t.islandId) && !OWN.includes(t.islandId));
    expect(open(P9_CS_REGION.layout.natural!.trees)).toEqual(open(base.layout.natural!.trees));
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
