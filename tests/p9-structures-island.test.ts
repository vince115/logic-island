import { describe, expect, it } from 'vitest';
import { landscapePieceCount } from '@/components/p9/p9-landscapes';
import { P9_CS_REGION, PLANNED_LANDSCAPES } from '@/lib/p9/cs-region';
import { regionScene } from '@/lib/p9/region-scene';
import { regionLayout } from '@/lib/islands/regions/region-layouts';

const key = (t: { q: number; r: number }) => `${t.q},${t.r}`;

describe('P9.2 資料結構島 landmarks', () => {
  const world = P9_CS_REGION.layout.world, approved = regionLayout('cs').layout.world;
  const ds = world.settlements.find(s => s.islandId === 'structures')!, before = approved.settlements.find(s => s.islandId === 'structures')!;

  it('keeps the island: id, centre, tile set and every bridge', () => {
    expect(ds.center).toEqual(before.center);
    expect(ds.tiles.map(key).sort()).toEqual(before.tiles.map(key).sort());
    expect(world.bridges).toEqual(approved.bridges);
    expect(ds.ownLandmarks).toBe(true);
  });

  it('builds on free tiles only: no bridge landing, no plaza, all on the island', () => {
    const site = PLANNED_LANDSCAPES.find(l => l.islandId === 'structures')!;
    const ports = new Set(world.bridges.flatMap(b => [b.from, b.to]).filter(p => p.islandId === 'structures').map(p => key(p.tile)));
    const own = new Set(ds.tiles.map(key));
    expect(site.tiles).toHaveLength(6);
    for (const t of site.tiles) {
      expect(own.has(key(t))).toBe(true);
      expect(ports.has(key(t))).toBe(false);
      expect(key(t)).not.toBe(key(ds.center));
    }
  });

  it('is part of the one scene definition the World and the Region both draw', () => {
    const scene = regionScene('cs');
    expect(scene.landscapes.some(l => l.islandId === 'structures')).toBe(true);
    expect(scene.landmarks.some(l => l.islandId === 'structures' && l.kind === 'landscape')).toBe(true);
  });

  it('the World level of detail drops the fine pieces and keeps the landmarks', () => {
    const region = landscapePieceCount('structures', 'region'), far = landscapePieceCount('structures', 'world');
    expect(far).toBeLessThan(region);
    expect(far).toBeGreaterThan(region * .7);
  });
});
