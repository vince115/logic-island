import { describe, expect, it } from 'vitest';
import { hexKey, type Axial } from '@/lib/islands/hex';
import { settlementRoads, type HexWorld } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { DATABASES_SPEC } from '@/lib/islands/islands-world';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { validateRegion } from '@/lib/islands/regions/validate-region';
import { placeholderLandmarkTiles } from '@/components/islands/hex-world/hex-landmarks';
import { getIsland, islandsInRegion } from '@/content/world';
import type { RegionId } from '@/content/world/types';

/*
 * M3.1 regional world prototype: the two region maps. Each holds exactly its registry islands, passes the region
 * validator (landmarks and buildings taken from the components and GLB placements, not copied), and the CS map keeps
 * the four existing islands as the home page places them.
 */
const home = islandsHomeWorld.world;
const add = (a: Axial, b: Axial) => ({ q: a.q + b.q, r: a.r + b.r });
function reserved(world: HexWorld, glb = REGION_LAYOUTS.cs.layout.glb): Record<string, Axial[]> {
  const out: Record<string, Axial[]> = {};
  for (const s of world.settlements) {
    if (s.islandId === 'databases') out[s.islandId] = [...DATABASE_LANDMARKS.map(l => add(s.center, l.at)), ...DATABASES_SPEC.terrace.map(t => add(s.center, t))];
    else if (glb.some(l => l.islandId === s.islandId)) {
      // A GLB building's tile, and the second tile of one placed across an edge (the workshop).
      out[s.islandId] = glb.filter(l => l.islandId === s.islandId).flatMap(l => l.placements.flatMap(p => [p.tile, ...('across' in p && p.across !== undefined ? [{ q: p.tile.q + [1, 1, 0, -1, -1, 0][p.across], r: p.tile.r + [0, -1, -1, 0, 1, 1][p.across] }] : [])]));
    } else out[s.islandId] = placeholderLandmarkTiles(s);
  }
  return out;
}
const regionIds = (region: RegionId) => islandsInRegion(region).map(i => i.id);
const accepted = home.bridges.map(b => b.id);

describe('regional world layouts (M3.1)', () => {
  for (const region of ['cs', 'ai'] as const) {
    it(`${region}: the registry's islands, valid, docks for the ferry`, () => {
      const layout = REGION_LAYOUTS[region];
      expect(validateRegion(layout, regionIds(region), reserved(layout.layout.world), accepted)).toEqual([]);
      expect(layout.layout.world.settlements.map(s => s.islandId).sort()).toEqual(regionIds(region).sort());
    });
    it(`${region}: planned islands are exactly the registry's planned ones`, () => {
      for (const s of REGION_LAYOUTS[region].layout.world.settlements) expect(Boolean(s.planned), s.islandId).toBe(getIsland(s.islandId)!.status === 'planned');
    });
  }

  it('the validator catches what the drafts got wrong: a port on the main tower terrace, a road over a landmark, too little water', () => {
    const cs = REGION_LAYOUTS.cs;
    const terracePort = { ...cs, layout: { ...cs.layout, world: { ...cs.layout.world, bridges: cs.layout.world.bridges.map(b => b.id !== 'databases-systems-analysis' ? b
      : { ...b, from: { islandId: 'databases', tile: { q: 2, r: -11 }, edge: 1 as const }, to: { islandId: 'systems-analysis', tile: { q: 6, r: -15 }, edge: 4 as const } }) } } };
    const problems = validateRegion(terracePort, regionIds('cs'), reserved(terracePort.layout.world), accepted);
    expect(problems.some(p => /databases port 2,-11 is (raised|a landmark tile)/.test(p))).toBe(true);
    // 程式語言島 one hex closer to the foundations island's west hill than the draft: one water hex between them.
    const moved = { ...cs, layout: { ...cs.layout, world: { ...cs.layout.world, settlements: cs.layout.world.settlements.map(s => s.islandId !== 'programming-languages' ? s
      : { ...s, center: { q: -8, r: 1 }, tiles: s.tiles.map(t => ({ ...t, q: t.q - 13, r: t.r - 5 })) }) } } };
    expect(validateRegion(moved, regionIds('cs'), reserved(moved.layout.world), accepted)).toContain('foundations and programming-languages: 1 water hex between them, need 2');
  });

  it('the database island port moved off the terrace to its north-east shore', () => {
    const bridge = REGION_LAYOUTS.cs.layout.world.bridges.find(b => b.id === 'databases-systems-analysis')!;
    expect(hexKey(bridge.from.tile)).toBe('4,-10');
    const terrace = DATABASES_SPEC.terrace.map(t => hexKey(add(DATABASES_SPEC.center, t)));
    expect(terrace).not.toContain(hexKey(bridge.from.tile));
    // Its road leaves the plaza east, past the replica towers' tile, not across it.
    const road = settlementRoads(REGION_LAYOUTS.cs.layout.world).find(r => r.bridgeId === bridge.id && r.islandId === 'databases')!;
    expect(road.tiles.map(hexKey)).toEqual(['2,-9', '3,-9', '4,-10']);
  });
});

describe('CS region keeps the home page islands (M3.1)', () => {
  const cs = REGION_LAYOUTS.cs.layout;
  const ids = ['foundations', 'structures', 'algorithms', 'databases'];
  it('same tiles, spurs and coast as on the home page', () => {
    for (const id of ids) expect(cs.world.settlements.find(s => s.islandId === id), id).toEqual(home.settlements.find(s => s.islandId === id));
  });
  it('the home page bridges between them, unchanged; none to 互動實驗島, which is not on the map', () => {
    for (const bridge of home.bridges.filter(b => b.from.islandId !== 'labs' && b.to.islandId !== 'labs')) expect(cs.world.bridges).toContainEqual(bridge);
    expect(cs.world.settlements.some(s => s.islandId === 'labs')).toBe(false);
    expect(cs.world.bridges.some(b => b.from.islandId === 'labs' || b.to.islandId === 'labs')).toBe(false);
  });
  it('same GLB placements, plaza and existing roads', () => {
    expect(cs.glb).toEqual(islandsHomeWorld.glb);
    expect(cs.natural!.plaza).toEqual(islandsHomeWorld.natural!.plaza);
    const homeRoads = settlementRoads(home).filter(r => ids.includes(r.islandId) && (!r.bridgeId || !r.bridgeId.includes('labs')));
    const roads = settlementRoads(cs.world);
    for (const road of homeRoads) expect(roads.find(r => r.routeId === road.routeId && r.islandId === road.islandId)?.tiles, road.routeId).toEqual(road.tiles);
  });
  it('trees and rocks of the four islands: what the new roads change', () => {
    // New bridges bring new roads onto the algorithms, structures and database islands; trees and rocks keep clear
    // of roads, so a few may move there. Pinned here so a change shows up in review.
    const pick = <T extends { islandId: string }>(list: T[]) => list.filter(x => ids.includes(x.islandId));
    const same = (a: unknown[], b: unknown[]) => a.filter(x => b.some(y => JSON.stringify(y) === JSON.stringify(x))).length;
    const trees = pick(cs.natural!.trees), homeTrees = pick(islandsHomeWorld.natural!.trees);
    const rocks = pick(cs.natural!.rocks), homeRocks = pick(islandsHomeWorld.natural!.rocks);
    expect({ trees: [trees.length, homeTrees.length, same(trees, homeTrees)], rocks: [rocks.length, homeRocks.length, same(rocks, homeRocks)] }).toMatchSnapshot();
  });
});

describe('regional world panel data and flag (M3.1)', () => {
  it('planned islands carry no lesson, unit, progress or "已開放" data, only their planned count', async () => {
    const { regionIslands } = await import('@/lib/world/learning-islands');
    const ai = regionIslands('ai');
    expect(ai.map(i => i.id)).toEqual(islandsInRegion('ai').map(i => i.id));
    for (const island of ai) {
      expect(island.planned, island.id).toEqual({ lessonCount: getIsland(island.id)!.lessonCount });
      expect([island.lessons, island.units, island.published, island.curriculumHref], island.id).toEqual([[], undefined, undefined, undefined]);
    }
    const cs = regionIslands('cs');
    expect(cs.filter(i => i.planned).map(i => i.id)).toEqual(['programming-languages', 'networks', 'systems-analysis', 'information-systems']);
    // The written islands get what the home page gives them: the database island's units and written-lesson count.
    const db = cs.find(i => i.id === 'databases')!;
    expect(db.published).toEqual({ open: 20, total: 20 });
    expect(db.curriculumHref).toBe('/curriculum#island-databases');
    expect(db.units?.flatMap(u => u.lessons).length).toBe(20);
  });

  it('the flag is read on the server at build time: without it no region page is generated', async () => {
    const { regionalWorldEnabled } = await import('@/lib/world/flag');
    const before = process.env.LOGIC_ISLAND_REGIONAL_WORLD;
    try {
      delete process.env.LOGIC_ISLAND_REGIONAL_WORLD;
      expect(regionalWorldEnabled()).toBe(false);
      process.env.LOGIC_ISLAND_REGIONAL_WORLD = 'true';
      expect(regionalWorldEnabled(), 'only exactly 1 turns it on').toBe(false);
      process.env.LOGIC_ISLAND_REGIONAL_WORLD = '1';
      expect(regionalWorldEnabled()).toBe(true);
    } finally {
      if (before === undefined) delete process.env.LOGIC_ISLAND_REGIONAL_WORLD; else process.env.LOGIC_ISLAND_REGIONAL_WORLD = before;
    }
  });
});
