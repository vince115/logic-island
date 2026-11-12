import { describe, expect, it } from 'vitest';
import { hexKey, type Axial } from '@/lib/islands/hex';
import { settlementRoads, type HexWorld } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { DATABASES_SPEC } from '@/lib/islands/islands-world';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { MAPPED_REGION_IDS, REGION_LAYOUTS, isMappedRegion, regionLayout } from '@/lib/islands/regions/region-layouts';
import { LATTICE_SPACING, latticeLayout } from '@/lib/islands/regions/lattice-layout';
import { REGION_THEMES } from '@/lib/islands/regions/region-themes';
import { WORLD_MAP, validateWorldMap, worldMapRegionIds } from '@/lib/islands/regions/world-map';
import { REGION_ACCENT } from '@/lib/world/region-accents';
import { validateRegion } from '@/lib/islands/regions/validate-region';
import { placeholderLandmarkTiles } from '@/components/islands/hex-world/hex-landmarks';
import { getIsland, islandsInRegion, labIslandConfig, orderedRegions, subjectIslands } from '@/content/world';
import type { RegionId } from '@/content/world/types';

/*
 * M3.1 regional world prototype: the two region maps. Each holds exactly its registry islands, passes the region
 * validator (landmarks and buildings taken from the components and GLB placements, not copied), and the CS map keeps
 * the four existing islands as the home page places them.
 */
const home = islandsHomeWorld.world;
const add = (a: Axial, b: Axial) => ({ q: a.q + b.q, r: a.r + b.r });
function reserved(world: HexWorld, glb = regionLayout('cs').layout.glb): Record<string, Axial[]> {
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

describe('regional world layouts (M3.1; P8.2: every mapped region)', () => {
  for (const region of MAPPED_REGION_IDS) {
    it(`${region}: the registry's islands, valid, docks for the ferry`, () => {
      const layout = regionLayout(region);
      expect(validateRegion(layout, regionIds(region), reserved(layout.layout.world), accepted)).toEqual([]);
      expect(layout.layout.world.settlements.map(s => s.islandId).sort()).toEqual(regionIds(region).sort());
    });
    it(`${region}: planned islands are exactly the registry's planned ones`, () => {
      for (const s of regionLayout(region).layout.world.settlements) expect(Boolean(s.planned), s.islandId).toBe(getIsland(s.islandId)!.status === 'planned');
    });
  }

  it('the validator catches what the drafts got wrong: a port on the main tower terrace, a road over a landmark, too little water', () => {
    const cs = regionLayout('cs');
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
    const bridge = regionLayout('cs').layout.world.bridges.find(b => b.id === 'databases-systems-analysis')!;
    expect(hexKey(bridge.from.tile)).toBe('4,-10');
    const terrace = DATABASES_SPEC.terrace.map(t => hexKey(add(DATABASES_SPEC.center, t)));
    expect(terrace).not.toContain(hexKey(bridge.from.tile));
    // Its road leaves the plaza east, past the replica towers' tile, not across it.
    const road = settlementRoads(regionLayout('cs').layout.world).find(r => r.bridgeId === bridge.id && r.islandId === 'databases')!;
    expect(road.tiles.map(hexKey)).toEqual(['2,-9', '3,-9', '4,-10']);
  });
});

describe('CS region keeps the home page islands (M3.1)', () => {
  const cs = regionLayout('cs').layout;
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
      // P8.2 (D4): its one link is its outline on the region's 2D overview, never a lesson page.
      expect(island.outlineHref, island.id).toBe(`/regions/ai#island-${island.id}`);
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

// P8.2: the multi-region world as data. Which regions and islands exist is the registry's; the 3D layer only places them.
describe('multi-region world data model (P8.2)', async () => {
  const { regionSummaries, unmappedRegions, regionIslands, islandVisual, hubSummary } = await import('@/lib/world/learning-islands');
  const registryRegions = orderedRegions.map(r => r.id);

  it('every registry region has a 3D map, a place on the overview and a theme; no list of regions is kept by hand', () => {
    expect([...MAPPED_REGION_IDS].sort()).toEqual([...registryRegions].sort());
    expect(unmappedRegions()).toEqual([]);
    expect(worldMapRegionIds().sort()).toEqual([...registryRegions].sort());
    for (const id of registryRegions) {
      expect(isMappedRegion(id), id).toBe(true);
      expect(REGION_THEMES[id].accent, id).toBe(REGION_ACCENT[id]);
      expect(regionLayout(id).regionId, id).toBe(id);
    }
    expect(isMappedRegion('xx')).toBe(false);
    expect(() => regionLayout('xx' as never)).toThrow('has no 3D layout');
  });

  it('the overview summaries follow the registry: order, island and lesson counts, open and planned islands', () => {
    expect(regionSummaries().map(r => r.id)).toEqual(registryRegions);
    for (const r of regionSummaries()) {
      const list = islandsInRegion(r.id);
      expect([r.islands, r.lessons, r.open + r.planned, r.href], r.id).toEqual([list.length, list.reduce((n, i) => n + i.lessonCount, 0), list.length, `/world/${r.id}`]);
      expect(r.planned, r.id).toBe(list.filter(i => i.status === 'planned').length);
    }
  });

  it('all 29 subject islands stand on exactly one region map, their own region\'s; the lab island on none', () => {
    const placed = MAPPED_REGION_IDS.flatMap(region => regionLayout(region).layout.world.settlements.map(s => ({ region, id: s.islandId })));
    expect(placed.map(p => p.id).sort()).toEqual(subjectIslands.map(i => i.id).sort());
    for (const p of placed) expect(getIsland(p.id)!.regionId, p.id).toBe(p.region);
    expect(placed.some(p => p.id === labIslandConfig.id)).toBe(false);
  });

  it('the layout layer holds no curriculum data: a region layout is its id, hex world, camera, docks and source', () => {
    for (const id of MAPPED_REGION_IDS) expect(Object.keys(REGION_LAYOUTS[id]!).sort(), id).toEqual(['camera', 'docks', 'layout', 'regionId', 'source']);
    expect(JSON.stringify(WORLD_MAP)).not.toMatch(/lesson|堂|島/);
  });

  it('CS: eight subject islands, four with lessons and four planned, each with its registry record; the lab island is the shared hub', () => {
    const cs = regionIslands('cs');
    expect(cs.map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'programming-languages', 'databases', 'networks', 'systems-analysis', 'information-systems']);
    expect(cs.filter(i => !i.planned).map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'databases']);
    for (const island of cs) expect(getIsland(island.id)!.regionId, island.id).toBe('cs');
    expect(labIslandConfig.kind).toBe('tool');
    expect(labIslandConfig.regionId).toBeUndefined();
    expect(WORLD_MAP.hub.islandId).toBe(labIslandConfig.id);
    expect(hubSummary().lab).toMatchObject({ id: 'labs', href: '/learn', labs: labIslandConfig.labs!.length });
  });

  it('island visual status is derived: GLB model, authored landmarks or the shared planned outline', () => {
    expect(islandVisual('foundations')).toEqual({ state: 'open', tier: 'glb' });
    expect(islandVisual('databases')).toEqual({ state: 'open', tier: 'landmark' });
    expect(islandVisual('networks')).toEqual({ state: 'planned', tier: 'outline' });
    expect(islandVisual('linux-systems')).toEqual({ state: 'planned', tier: 'outline' });
    expect(() => islandVisual('labs')).toThrow('not on a region map');
  });

  it('planned islands of every region offer their outline and no lesson', () => {
    for (const region of MAPPED_REGION_IDS) for (const island of regionIslands(region).filter(i => i.planned)) {
      expect(island.outlineHref, island.id).toBe(`/regions/${region}#island-${island.id}`);
      expect(island.lessons, island.id).toEqual([]);
    }
  });

  it('the overview composition: nothing overlaps, in the wide and in the tall shape', () => {
    expect(validateWorldMap(WORLD_MAP, 'wide')).toEqual([]);
    expect(validateWorldMap(WORLD_MAP, 'tall')).toEqual([]);
    const crowded = { ...WORLD_MAP, regions: { ...WORLD_MAP.regions, ai: { ...WORLD_MAP.regions.ai!, wide: { ...WORLD_MAP.regions.ai!.wide, at: [2, 3] as const } } } };
    expect(validateWorldMap(crowded, 'wide').some(p => p.startsWith('hub and ai overlap'))).toBe(true);
  });
});

describe('lattice region maps (P8.2)', () => {
  const zones = { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 };
  it('design, web and sys are lattice maps with different outlines; cs and ai stay authored', () => {
    expect(MAPPED_REGION_IDS.map(id => [id, regionLayout(id).source])).toEqual([['cs', 'authored'], ['ai', 'authored'], ['design', 'lattice'], ['web', 'lattice'], ['sys', 'lattice']]);
    // The outline of a lattice map is its cells: no two regions share one (as a set of cell offsets from the first cell).
    const outline = (id: 'design' | 'web' | 'sys') => { const c = regionLayout(id).layout.world.settlements.map(s => s.center); return c.map(x => `${(x.q - c[0].q) / LATTICE_SPACING},${(x.r - c[0].r) / LATTICE_SPACING}`).sort().join(' '); };
    expect(new Set([outline('design'), outline('web'), outline('sys')]).size).toBe(3);
  });
  it('builds a valid region from placements alone, at any size', () => {
    for (const n of [1, 4, 12, 30]) {
      // A row of cells, each bridged to the one before; the first carries the dock.
      const ids = Array.from({ length: n }, (_, i) => `island-${i}`);
      const built = latticeLayout({ bridge: 'stone', placements: ids.map((islandId, i) => ({ islandId, cell: [i, 0] as const, ...(i ? {} : { dock: 4 as const }) })), links: ids.slice(1).map((id, i) => [ids[i], id] as const) });
      expect(built.layout.zones).toEqual(zones);
      expect(validateRegion({ regionId: 'cs', ...built, camera: { azimuth: { desktop: 0, phone: 0 } }, source: 'lattice' }, ids, {}), `${n} islands`).toEqual([]);
    }
  });
  it('refuses a spec it cannot build instead of drawing a broken map', () => {
    const one = { islandId: 'a', cell: [0, 0] as const, dock: 4 as const };
    expect(() => latticeLayout({ bridge: 'wood', placements: [one, { islandId: 'b', cell: [2, 0] }], links: [['a', 'b']] })).toThrow('not neighbouring cells');
    expect(() => latticeLayout({ bridge: 'wood', placements: [one, { islandId: 'b', cell: [1, 0] }], links: [] })).toThrow('not joined by bridges');
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ ...one, dock: 0 }, { islandId: 'b', cell: [1, 0] }], links: [['a', 'b']] })).toThrow('next to a bridge port');
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ ...one, trim: [4] }], links: [] })).toThrow('trimmed tile');
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ islandId: 'a', cell: [0, 0] }], links: [] })).toThrow('no dock');
    expect(() => latticeLayout({ bridge: 'wood', placements: [one, { islandId: 'b', cell: [0, 0] }], links: [] })).toThrow('share a cell');
  });
});
