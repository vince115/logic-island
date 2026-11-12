import { describe, expect, it } from 'vitest';
import { bridgeParts, roadParts } from '@/lib/islands/hex-route-parts';
import { DATABASE_ISLAND_ID, LAB_ISLAND_ID, islandsHomeWorld, islandsWorld } from '@/lib/islands/islands-world';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { settlementRoads } from '@/lib/islands/hex-world';
import { roadProfiles } from '@/lib/islands/hex-terrain';
import { validateHexWorld } from '@/lib/islands/hex-world';
import { hexDistance } from '@/lib/islands/hex';

/** 2026-11-01: the home page's world is the candidate world plus 互動實驗島 and one bridge; nothing else moves. */
describe('home world (互動實驗島)', () => {
  const home = islandsHomeWorld.world, candidate = islandsWorld.world;

  it('is a valid world with five islands (Phase F.2 adds 資料庫應用島)', () => {
    expect(validateHexWorld(home, ['foundations', 'structures', 'algorithms', LAB_ISLAND_ID, DATABASE_ISLAND_ID])).toEqual([]);
    expect(validateHexWorld(candidate, ['foundations', 'structures', 'algorithms'])).toEqual([]);
  });

  it('keeps the three islands, their bridges and the GLB placements as they are', () => {
    expect(home.settlements.slice(0, 3)).toEqual(candidate.settlements);
    expect(home.bridges.slice(0, 2)).toEqual(candidate.bridges);
    expect(islandsHomeWorld.glb).toEqual(islandsWorld.glb);
  });

  it('joins the lab island to the algorithms island only, across two water hexes', () => {
    const bridges = home.bridges.filter(b => [b.from.islandId, b.to.islandId].includes(LAB_ISLAND_ID));
    expect(bridges.map(b => [b.from.islandId, b.to.islandId])).toEqual([['algorithms', LAB_ISLAND_ID]]);
    expect(hexDistance(bridges[0].from.tile, bridges[0].to.tile)).toBe(3);
    // The lab island keeps at least two water hexes from every other island.
    const lab = home.settlements.find(s => s.islandId === LAB_ISLAND_ID)!;
    for (const other of home.settlements.filter(s => s !== lab)) {
      expect(Math.min(...lab.tiles.flatMap(t => other.tiles.map(u => hexDistance(t, u))))).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps 互動實驗島 and its bridge where they were (Phase F.2)', () => {
    expect(home.settlements[3]).toMatchObject({ islandId: LAB_ISLAND_ID, center: { q: 3, r: 5 } });
    expect(home.settlements[3].tiles).toHaveLength(16);
    expect(home.bridges[2].id).toBe('algorithms-labs');
  });

  it('builds roads and bridge parts for the new bridge', () => {
    expect(roadProfiles(home).filter(r => r.routeId === 'algorithms-labs')).toHaveLength(2);
    expect(bridgeParts(home).boxes.length).toBeGreaterThan(bridgeParts(candidate).boxes.length);
    expect(roadParts(home).boxes.length).toBeGreaterThan(roadParts(candidate).boxes.length);
  });
});

/** Phase F.2 (2026-11-02): 資料庫應用島 at (2, -9), bridged to the structures island; the other four islands do not move. */
describe('home world (資料庫應用島)', () => {
  const home = islandsHomeWorld.world, db = home.settlements.find(s => s.islandId === DATABASE_ISLAND_ID)!;
  const others = home.settlements.filter(s => s !== db);
  const gap = (s: typeof db) => Math.min(...db.tiles.flatMap(t => s.tiles.map(u => hexDistance(t, u))));

  it('sits at (2, -9), 16 tiles, with at least two water hexes to every island and exactly two to its neighbors', () => {
    expect(db.center).toEqual({ q: 2, r: -9 });
    expect(db.tiles).toHaveLength(16);
    for (const other of others) expect(gap(other), other.islandId).toBeGreaterThanOrEqual(3);
    expect(['foundations', 'structures'].map(id => gap(others.find(s => s.islandId === id)!))).toEqual([3, 3]);
  });

  it('is joined to the structures island only, by one straight wooden bridge across two water hexes', () => {
    const bridges = home.bridges.filter(b => [b.from.islandId, b.to.islandId].includes(DATABASE_ISLAND_ID));
    expect(bridges).toEqual([{ id: 'structures-databases', kind: 'wood',
      from: { islandId: 'structures', tile: { q: 6, r: -8 }, edge: 3 }, to: { islandId: DATABASE_ISLAND_ID, tile: { q: 3, r: -8 }, edge: 0 } }]);
    expect(hexDistance(bridges[0].from.tile, bridges[0].to.tile)).toBe(3);
    // On the structures island the road runs straight west from its center, clear of its landmarks and woods.
    const road = settlementRoads(home).filter(r => r.bridgeId === 'structures-databases');
    expect(road.map(r => r.tiles.map(t => `${t.q},${t.r}`))).toEqual([['8,-8', '7,-8', '6,-8'], ['2,-9', '3,-9', '3,-8']]);
  });

  it('leaves the four other islands, their bridges, roads, trees, rocks, plaza and GLB placements exactly as before', () => {
    const before = islandsHomeWorld.world.settlements.filter(s => s.islandId !== DATABASE_ISLAND_ID);
    expect(before.map(s => s.islandId)).toEqual(['foundations', 'structures', 'algorithms', LAB_ISLAND_ID]);
    expect(home.settlements.slice(0, 3)).toEqual(islandsWorld.world.settlements);
    const keep = <T extends { islandId: string }>(list: T[]) => list.filter(x => x.islandId !== DATABASE_ISLAND_ID);
    const candidate = islandsWorld.natural!;
    expect(keep(islandsHomeWorld.natural!.trees).filter(t => t.islandId !== LAB_ISLAND_ID)).toEqual(candidate.trees);
    expect(keep(islandsHomeWorld.natural!.rocks).filter(t => t.islandId !== LAB_ISLAND_ID)).toEqual(candidate.rocks);
    expect(islandsHomeWorld.natural!.plaza).toEqual(candidate.plaza);
    const roads = (w: typeof home) => settlementRoads(w).filter(r => r.bridgeId !== 'structures-databases' && r.bridgeId !== 'algorithms-labs').map(r => JSON.stringify(r));
    expect(roads(home)).toEqual(roads(islandsWorld.world));
  });

  it('places its four Transitional Art landmarks on its own land, off the road to the bridge', () => {
    const road = settlementRoads(home).find(r => r.islandId === DATABASE_ISLAND_ID)!.tiles.map(t => `${t.q},${t.r}`);
    expect(DATABASE_LANDMARKS.map(l => l.role)).toEqual(['資料庫主塔', 'B+ Tree 索引館', '資料複寫雙塔', '資料表廣場']);
    for (const { node, at } of DATABASE_LANDMARKS) {
      const tile = db.tiles.find(t => t.q === db.center.q + at.q && t.r === db.center.r + at.r);
      expect(tile, node).toBeDefined();
      expect(tile!.terrain, node).not.toBe('forest');
      expect(road, node).not.toContain(`${tile!.q},${tile!.r}`);
    }
    // The main tower stands on the raised terrace.
    expect(db.tiles.find(t => t.q === 2 && t.r === -10)?.height).toBeGreaterThan(0);
  });
});
