import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexKey, type Axial } from '@/lib/islands/hex';
import { settlementRoads, type HexWorld } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { DATABASES_SPEC } from '@/lib/islands/islands-world';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { AI_BASELINE_LAYOUT, MAPPED_REGION_IDS, REGION_LAYOUTS, isMappedRegion, regionLayout } from '@/lib/islands/regions/region-layouts';
import { LATTICE_SPACING, latticeLayout } from '@/lib/islands/regions/lattice-layout';
import { REGION_THEMES } from '@/lib/islands/regions/region-themes';
import { WORLD_MAP, bridgedRegions, ringNeighbours, validateWorldMap, worldLinks, worldMapRegionIds } from '@/lib/islands/regions/world-map';
import { OVERVIEW_HEIGHT, frameOverview, overviewLinks, overviewOutlines, stageLands, stageLines, validateOverviewLinks, type OverviewLink } from '@/lib/islands/regions/world-overview-geometry';
import { boxCoversLand, boxesOverlap, lineHitsBox, placeLabels, type Box, type StageLine } from '@/lib/islands/regions/overview-labels';
import type { WorldMapSpec } from '@/lib/islands/regions/schema';
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
    for (const id of MAPPED_REGION_IDS) expect(Object.keys(REGION_LAYOUTS[id]!).filter(k => k !== 'plannedMarkers').sort(), id).toEqual(['camera', 'docks', 'layout', 'regionId', 'source']);
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

const hexDistanceTo = (a: Axial, b: Axial) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

// P8.3: layouts are stored and reviewed. The curriculum's relations were the reason for them and are only reported
// against them; no test here fails because a lesson or a prerequisite was added.
describe('island relations are a report, not a rule (P8.2, P8.3)', async () => {
  const { islandRelations, relationsInRegion, regionRelations, bridgeCoverage } = await import('@/lib/world/island-relations');
  it('relations come from lesson prerequisites and recommendations, each pair once, inside a region and between regions', () => {
    const all = islandRelations();
    expect(new Set(all.map(r => `${r.a} ${r.b}`)).size).toBe(all.length);
    for (const r of all) { expect(r.a < r.b, `${r.a} ${r.b}`).toBe(true); expect(r.required + r.recommended).toBeGreaterThan(0); }
    for (const region of MAPPED_REGION_IDS) for (const r of relationsInRegion(region)) expect([getIsland(r.a)!.regionId, getIsland(r.b)!.regionId]).toEqual([region, region]);
    const between = regionRelations();
    expect(between.every((r, i) => i === 0 || between[i - 1].links >= r.links)).toBe(true);
    for (const r of between) expect(r.a).not.toBe(r.b);
  });
  it('bridgeCoverage reports bridged, unbridged and unrelated pairs', () => {
    const relations = [{ a: 'a', b: 'b' }, { a: 'b', b: 'c' }];
    expect(bridgeCoverage(relations, [['b', 'a'], ['c', 'd']])).toEqual({ bridged: ['a — b'], unbridged: ['b — c'], unrelated: ['c — d'] });
    // On today's curriculum it runs for every region and for the world; what it says is recorded in the P8.3 doc, not pinned here.
    for (const region of MAPPED_REGION_IDS) {
      const report = bridgeCoverage(relationsInRegion(region), regionLayout(region).layout.world.bridges.map(b => [b.from.islandId, b.to.islandId] as const));
      expect(report.bridged.length + report.unrelated.length, region).toBe(regionLayout(region).layout.world.bridges.length);
    }
    expect(bridgeCoverage(regionRelations(), WORLD_MAP.bridges.map(b => b.between)).bridged.length).toBeLessThanOrEqual(WORLD_MAP.bridges.length);
  });
});

describe('region layouts are stored, not derived (P8.3)', () => {
  const lattice = MAPPED_REGION_IDS.filter(id => regionLayout(id).source === 'lattice');
  it('the layout layer reads no curriculum data: no lesson, catalog, course or relation import', () => {
    for (const file of ['region-layouts.ts', 'lattice-layout.ts', 'world-map.ts', 'world-overview-geometry.ts', 'overview-labels.ts', 'region-themes.ts', 'schema.ts']) {
      const source = readFileSync(`src/lib/islands/regions/${file}`, 'utf8');
      expect(source, file).not.toMatch(/from '@\/(content\/(curriculum|courses|trials|world\/catalog|world')|lib\/world\/(island-relations|learning-islands|region-overview))/);
    }
  });
  it('the lattice maps as reviewed: every island\'s cell and every bridge, pinned so a change is a deliberate one', () => {
    const pinned = Object.fromEntries(lattice.map(id => {
      const { world } = regionLayout(id).layout;
      return [id, { cells: world.settlements.map(s => `${s.islandId} ${s.center.q / LATTICE_SPACING},${s.center.r / LATTICE_SPACING}`), bridges: world.bridges.map(b => b.id) }];
    }));
    expect(pinned).toMatchInlineSnapshot(`
      {
        "ai": {
          "bridges": [
            "deep-learning-machine-learning",
            "machine-learning-ai-engineering",
            "ai-engineering-ai-agents",
            "ai-agents-ai-foundations",
            "ai-foundations-generative-ai",
            "generative-ai-deep-learning",
            "large-language-models-ai-agents",
          ],
          "cells": [
            "large-language-models 0,0",
            "deep-learning 1,0",
            "machine-learning 1,-1",
            "ai-engineering 0,-1",
            "ai-agents -1,0",
            "ai-foundations -1,1",
            "generative-ai 0,1",
          ],
        },
        "design": {
          "bridges": [
            "ux-research-ui-design",
            "ux-research-interaction-design",
            "ui-design-interaction-design",
            "ui-design-design-systems",
            "interaction-design-design-systems",
          ],
          "cells": [
            "ux-research 0,0",
            "ui-design 1,0",
            "interaction-design 0,1",
            "design-systems 1,1",
          ],
        },
        "sys": {
          "bridges": [
            "linux-systems-network-servers",
            "linux-systems-devops-cicd",
            "linux-systems-docker-containers",
            "linux-systems-cloud-infrastructure",
            "devops-cicd-docker-containers",
            "network-servers-cloud-infrastructure",
            "network-servers-kubernetes-reliability",
            "devops-cicd-kubernetes-reliability",
          ],
          "cells": [
            "linux-systems 0,0",
            "network-servers 1,0",
            "devops-cicd 1,-1",
            "docker-containers 0,-1",
            "cloud-infrastructure 0,1",
            "kubernetes-reliability 2,-1",
          ],
        },
        "web": {
          "bridges": [
            "frontend-web-foundations",
            "frontend-mobile-apps",
            "web-foundations-mobile-apps",
            "web-foundations-responsive-design",
            "mobile-apps-responsive-design",
          ],
          "cells": [
            "frontend 0,0",
            "web-foundations 1,0",
            "mobile-apps 1,-1",
            "responsive-design 2,-1",
          ],
        },
      }
    `);
  });
  it('every bridge of every region lands on a tile of the island it names, and names two different islands of the region', () => {
    for (const region of MAPPED_REGION_IDS) {
      const { world } = regionLayout(region).layout;
      for (const bridge of world.bridges) {
        expect(bridge.from.islandId, bridge.id).not.toBe(bridge.to.islandId);
        for (const port of [bridge.from, bridge.to]) {
          const island = world.settlements.find(s => s.islandId === port.islandId);
          expect(island, `${bridge.id}: ${port.islandId}`).toBeDefined();
          expect(island!.tiles.some(t => t.q === port.tile.q && t.r === port.tile.r), `${bridge.id}: ${port.islandId} ${hexKey(port.tile)}`).toBe(true);
        }
      }
    }
  });
  it('adding an island to a lattice map leaves every island and bridge that was there as it was', () => {
    const before = { bridge: 'wood' as const, placements: [{ islandId: 'a', cell: [0, 0] as const, dock: 4 as const }, { islandId: 'b', cell: [1, 0] as const, trim: [0 as const] }], links: [['a', 'b'] as const] };
    const after = { ...before, placements: [...before.placements, { islandId: 'c', cell: [0, -1] as const }], links: [...before.links, ['a', 'c'] as const] };
    const one = latticeLayout(before).layout.world, two = latticeLayout(after).layout.world;
    expect(two.settlements.slice(0, 2)).toEqual(one.settlements);
    expect(two.bridges.slice(0, 1)).toEqual(one.bridges);
    expect(two.settlements.map(s => s.islandId)).toEqual(['a', 'b', 'c']);
  });
});

// P8.3 (D7): the hub joined to every region, relation bridges between neighbours on the ring, nothing over an island.
describe('world topology (P8.3, D7)', () => {
  const shapes = ['wide', 'tall'] as const;
  const drawn = (map: WorldMapSpec, shape: 'wide' | 'tall') => { const outlines = overviewOutlines(map, REGION_LAYOUTS, shape); return { outlines, links: overviewLinks(map, outlines) }; };

  it('rule 1: the hub is joined to every region, once each; the ring is the registry\'s regions', () => {
    expect([...WORLD_MAP.ring].sort()).toEqual(orderedRegions.map(r => r.id).sort());
    expect(worldLinks(WORLD_MAP).filter(l => l.kind === 'hub').map(l => [l.from, l.to])).toEqual(WORLD_MAP.ring.map(id => ['hub', id]));
    // A region added to the ring gets its hub link with no other edit.
    const more = { ...WORLD_MAP, ring: [...WORLD_MAP.ring, 'xx' as RegionId] };
    expect(worldLinks(more).filter(l => l.kind === 'hub')).toHaveLength(WORLD_MAP.ring.length + 1);
  });
  it('rules 2 to 4: relation bridges join neighbours on the ring only, not every neighbouring pair has one, and the rest go through the hub', () => {
    expect(WORLD_MAP.bridges.map(b => b.id)).toEqual(['cs-ai', 'design-web', 'web-sys', 'sys-cs']);
    for (const bridge of WORLD_MAP.bridges) expect(ringNeighbours(WORLD_MAP, ...bridge.between), bridge.id).toBe(true);
    // AI and design are neighbours without a bridge.
    expect(ringNeighbours(WORLD_MAP, 'ai', 'design')).toBe(true);
    expect(bridgedRegions(WORLD_MAP, 'ai')).toEqual(['cs']);
    expect(bridgedRegions(WORLD_MAP, 'cs')).toEqual(['ai', 'sys']);
    expect(bridgedRegions(WORLD_MAP, 'design')).toEqual(['web']);
    expect(bridgedRegions(WORLD_MAP, 'web')).toEqual(['design', 'sys']);
    expect(bridgedRegions(WORLD_MAP, 'sys')).toEqual(['cs', 'web']);
    // Every region is one hub link away from the hub, so any two are two links apart at most.
    for (const id of WORLD_MAP.ring) expect(worldLinks(WORLD_MAP).some(l => l.kind === 'hub' && l.to === id), id).toBe(true);
    expect(ringNeighbours(WORLD_MAP, 'cs', 'design')).toBe(false);
    expect(ringNeighbours(WORLD_MAP, 'cs', 'cs')).toBe(false);
  });
  it('the ring is clockwise on screen in both compositions; the validator catches a ring out of order, a bridge between regions that are not neighbours, a doubled bridge, an unplaced region and a link through another outline', () => {
    for (const shape of shapes) expect(validateWorldMap(WORLD_MAP, shape), shape).toEqual([]);
    const swapped = { ...WORLD_MAP, ring: ['cs', 'design', 'ai', 'web', 'sys'] as RegionId[], bridges: [] };
    expect(validateWorldMap(swapped, 'wide')).toContain('ring cs, design, ai, web, sys is not clockwise around the hub on the wide overview');
    expect(validateWorldMap({ ...WORLD_MAP, ring: ['cs', 'ai', 'design', 'web'] }, 'wide').some(p => p.startsWith('ring cs, ai, design, web is not the placed regions'))).toBe(true);
    const across = { ...WORLD_MAP, bridges: [...WORLD_MAP.bridges, { id: 'cs-web', between: ['cs', 'web'] as const }] };
    expect(validateWorldMap(across, 'wide')).toContain('bridge cs-web: cs and web are not neighbours on the ring');
    const twice = { ...WORLD_MAP, bridges: [...WORLD_MAP.bridges, { id: 'ai-cs', between: ['ai', 'cs'] as const }] };
    expect(validateWorldMap(twice, 'tall')).toContain('bridge ai-cs: ai and cs are joined twice');
    expect(validateWorldMap({ ...WORLD_MAP, bridges: [{ id: 'cs-xx', between: ['cs', 'xx' as RegionId] as const }] }, 'wide')).toContain('bridge cs-xx: xx is not placed');
    // The AI region moved to the far side of the hub from the design region: their neighbours' links now pass through the hub.
    const through: WorldMapSpec = { ...WORLD_MAP, bridges: [{ id: 'cs-ai', between: ['cs', 'ai'] }], regions: { ...WORLD_MAP.regions, ai: { ...WORLD_MAP.regions.ai!, wide: { ...WORLD_MAP.regions.ai!.wide, at: [4, -34] } } } };
    expect(validateWorldMap(through, 'wide')).toContain('cs-ai passes through hub on the wide overview');
  });
  it('rule 5: the world map holds positions and pairs only; nothing in it comes from the curriculum', () => {
    expect(JSON.stringify(WORLD_MAP)).not.toMatch(/lesson|prerequisite|堂|島/);
    expect(Object.keys(WORLD_MAP).sort()).toEqual(['bridges', 'hub', 'regions', 'ring']);
  });
  it('every link lands on a tile of each outline it joins and is the shortest crossing between them', () => {
    for (const shape of shapes) {
      const { outlines, links } = drawn(WORLD_MAP, shape);
      expect(links.map(l => l.id)).toEqual(worldLinks(WORLD_MAP).map(l => l.id));
      const gap = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      for (const link of links) {
        const from = outlines.find(o => o.id === link.from)!, to = outlines.find(o => o.id === link.to)!;
        expect(from.tiles).toContainEqual(link.ends[0]);
        expect(to.tiles).toContainEqual(link.ends[1]);
        const shortest = Math.min(...from.tiles.flatMap(a => to.tiles.map(b => gap(a, b))));
        expect(gap(...link.ends), `${shape} ${link.id}`).toBeCloseTo(shortest, 9);
        // The deck starts and ends inside the two tiles it lands on.
        expect(gap(link.a, link.ends[0])).toBeLessThan(from.radius);
        expect(gap(link.b, link.ends[1])).toBeLessThan(to.radius);
      }
    }
  });
  it('rule 6: no link runs over an island or crosses another link, in both compositions; decks lie lower than any land', () => {
    for (const shape of shapes) { const { outlines, links } = drawn(WORLD_MAP, shape); expect(validateOverviewLinks(outlines, links, shape), shape).toEqual([]); }
    expect(OVERVIEW_HEIGHT.link).toBeLessThan(OVERVIEW_HEIGHT.planned);
    expect(OVERVIEW_HEIGHT.planned).toBeLessThan(OVERVIEW_HEIGHT.land);
    // The check itself: a deck laid from the CS region straight through the hub, and two decks that cross.
    const { outlines } = drawn(WORLD_MAP, 'wide');
    const cs = outlines.find(o => o.id === 'cs')!, hub = outlines.find(o => o.id === 'hub')!, web = outlines.find(o => o.id === 'web')!;
    const middle = hub.tiles[0], far: [number, number] = [2 * middle[0] - cs.tiles[0][0], 2 * middle[1] - cs.tiles[0][1]];
    const bad: OverviewLink = { id: 'bad', kind: 'relation', from: 'cs', to: 'web', a: cs.tiles[0], b: far, ends: [cs.tiles[0], web.tiles[0]] };
    expect(validateOverviewLinks(outlines, [bad], 'wide')).toContain('bad runs over hub');
    const crossing = drawn({ ...WORLD_MAP, bridges: [{ id: 'ai-sys', between: ['ai', 'sys'] }] }, 'wide');
    expect(validateOverviewLinks(crossing.outlines, crossing.links, 'wide').some(p => p.includes('crosses ai-sys'))).toBe(true);
  });
});

// P8.3: label placement on the overview, as the scene runs it, for the stage sizes under review. Label sizes are the
// ones the browser measures (the E2E run checks the real ones); what matters here is that a spot exists for each.
describe('world overview labels (P8.3)', () => {
  const FULL: [number, number][] = [[228, 68], [161, 68], [161, 68], [161, 68], [161, 68], [95, 68]], SHORT: [number, number][] = [[79, 28], [82, 28], [67, 28], [67, 41], [67, 41], [67, 28]];
  const stages = [
    { name: '1440×1000', shape: 'wide' as const, size: { width: 1440, height: 1000 }, inset: 360, sizes: FULL },
    { name: '1280×800', shape: 'wide' as const, size: { width: 1280, height: 800 }, inset: 360, sizes: FULL },
    { name: '1024×768', shape: 'wide' as const, size: { width: 1024, height: 768 }, inset: 360, sizes: SHORT },
    { name: '390 phone', shape: 'tall' as const, size: { width: 390, height: 557 }, inset: 0, sizes: SHORT },
    { name: '375 phone', shape: 'tall' as const, size: { width: 375, height: 536 }, inset: 0, sizes: SHORT },
    { name: '320 phone', shape: 'tall' as const, size: { width: 320, height: 430 }, inset: 0, sizes: SHORT },
  ];
  for (const stage of stages) {
    it(`${stage.name}: every label inside the stage, apart from the others, off every island and off every link`, () => {
      const outlines = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, stage.shape), links = overviewLinks(WORLD_MAP, outlines), frame = frameOverview(outlines, stage.shape, stage.size, stage.inset);
      const sides = outlines.map(o => o.id === 'hub' ? WORLD_MAP.hub[stage.shape].label : WORLD_MAP.regions[o.id]![stage.shape].label);
      const lines = stageLines(frame, links, stage.shape), lands = stageLands(frame, outlines), room = { left: 4, right: stage.size.width - stage.inset - 4, top: 4, bottom: stage.size.height - 4 };
      // The whole world is on the stage, left of the guide.
      for (const box of frame.boxes) expect(box.x0 >= 0 && box.x1 <= stage.size.width - stage.inset && box.y0 >= 0 && box.y1 <= stage.size.height).toBe(true);
      const boxes: Box[] = placeLabels(frame.boxes, sides, stage.sizes, room, { lines, lands }).map((spot, i) => ({ x: spot.x, y: spot.y, width: stage.sizes[i][0], height: stage.sizes[i][1] }));
      for (const [i, box] of boxes.entries()) {
        const id = outlines[i].id;
        expect(box.x >= room.left && box.x + box.width <= room.right && box.y >= room.top && box.y + box.height <= room.bottom, `${id} inside`).toBe(true);
        expect(boxes.filter((other, j) => j !== i && boxesOverlap(box, other)).length, `${id} apart`).toBe(0);
        expect(lands.map((land, j) => boxCoversLand(box, land) ? outlines[j].id : '').filter(Boolean), `${id} off the islands`).toEqual([]);
        expect(lines.filter(line => lineHitsBox(line, box, 1)).map(l => l.id), `${id} off the links`).toEqual([]);
      }
    });
  }
  it('a label slides off a link, takes another side when its own is blocked, and stays between the stage\'s sides when nothing is free', () => {
    const extent = { x0: 100, y0: 100, x1: 160, y1: 140 }, room = { left: 0, right: 400, top: 0, bottom: 400 };
    const line = (x0: number, y0: number, x1: number, y1: number): StageLine => ({ id: 'l', kind: 'hub', x0, y0, x1, y1, width: 4 });
    // Free: straight below its outline, centered.
    expect(placeLabels([extent], ['below'], [[60, 20]], room)).toEqual([{ x: 100, y: 148, side: 'below' }]);
    // A link running down from the outline's middle: the label slides to one side of it and stays below.
    const [slid] = placeLabels([extent], ['below'], [[60, 20]], room, { lines: [line(130, 140, 130, 260)] });
    expect(slid.side).toBe('below');
    expect(lineHitsBox(line(130, 140, 130, 260), { x: slid.x, y: slid.y, width: 60, height: 20 }, 1)).toBe(false);
    // The whole side below is land: the label goes to another side.
    const land = { points: Array.from({ length: 12 }, (_, row) => Array.from({ length: 40 }, (_, i) => [i * 10, 150 + row * 10] as [number, number])).flat(), radius: 12 };
    expect(placeLabels([extent], ['below'], [[60, 20]], room, { lands: [land] })[0].side).not.toBe('below');
    // Two labels wanting the same spot do not share it.
    const two = placeLabels([extent, extent], ['below', 'below'], [[60, 20], [60, 20]], room);
    expect(boxesOverlap({ x: two[0].x, y: two[0].y, width: 60, height: 20 }, { x: two[1].x, y: two[1].y, width: 60, height: 20 })).toBe(false);
    // No room at all: still a defined spot, between the stage's sides.
    const [stuck] = placeLabels([{ x0: 0, y0: 0, x1: 20, y1: 20 }], ['left'], [[60, 20]], { left: 0, right: 64, top: 0, bottom: 30 });
    expect(stuck.x).toBeGreaterThanOrEqual(0);
    expect(stuck.x + 60).toBeLessThanOrEqual(64);
  });
});

describe('lattice region maps (P8.2)', () => {
  const zones = { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 };
  it('ai, design, web and sys are lattice maps with different outlines; cs stays authored', () => {
    expect(MAPPED_REGION_IDS.map(id => [id, regionLayout(id).source])).toEqual([['cs', 'authored'], ['ai', 'lattice'], ['design', 'lattice'], ['web', 'lattice'], ['sys', 'lattice']]);
    // The outline of a lattice map is its cells: no two regions share one (as a set of cell offsets from the first cell).
    const outline = (id: 'ai' | 'design' | 'web' | 'sys') => { const c = regionLayout(id).layout.world.settlements.map(s => s.center); return c.map(x => `${(x.q - c[0].q) / LATTICE_SPACING},${(x.r - c[0].r) / LATTICE_SPACING}`).sort().join(' '); };
    expect(new Set([outline('ai'), outline('design'), outline('web'), outline('sys')]).size).toBe(4);
    // Only the three new regions mark their planned islands with a pennant; AI keeps the M3.1 planned-island look.
    expect(MAPPED_REGION_IDS.filter(id => regionLayout(id).plannedMarkers)).toEqual(['design', 'web', 'sys']);
  });
  it('the AI region is a six-petal pinwheel: six petals turned the same way around a lagoon, bridged in a ring, not spokes from a hub', () => {
    const { world } = regionLayout('ai').layout, middle = world.settlements[0], ring = world.settlements.slice(1);
    expect(middle.islandId).toBe('large-language-models');
    expect(ring).toHaveLength(6);
    // Six-fold turning: petal j is petal 0 turned j times by 60 degrees about the middle (the dock petal keeps one rim tile for its dock).
    const turned = ({ q, r }: Axial, times: number) => { let p = { q, r }; for (let i = 0; i < times; i++) p = { q: p.q + p.r, r: -p.q }; return p; };
    const shape = (s: typeof ring[number]) => s.tiles.map(t => hexKey({ q: t.q - middle.center.q, r: t.r - middle.center.r })).sort();
    const first = ring[0].tiles.map(t => ({ q: t.q - middle.center.q, r: t.r - middle.center.r }));
    for (const [j, petal] of ring.entries()) {
      const expected = first.map(t => hexKey(turned(t, j))).sort();
      if (petal.spurs) expect(shape(petal).filter(k => !expected.includes(k)), petal.islandId).toHaveLength(1);
      else expect(shape(petal), petal.islandId).toEqual(expected);
      expect(hexDistanceTo(petal.center, middle.center), petal.islandId).toBe(LATTICE_SPACING);
    }
    // A leaning petal is not symmetric: its mirror image is a different shape.
    expect(first.map(t => hexKey({ q: t.q + t.r, r: -t.r })).sort()).not.toEqual(first.map(hexKey).sort());
    const between = (a: string, b: string) => world.bridges.some(x => [x.from.islandId, x.to.islandId].sort().join() === [a, b].sort().join());
    for (const [j, petal] of ring.entries()) expect(between(petal.islandId, ring[(j + 1) % 6].islandId), petal.islandId).toBe(true);
    // One bridge to the island in the lagoon, not six spokes.
    expect(world.bridges.filter(x => x.from.islandId === middle.islandId || x.to.islandId === middle.islandId).map(x => x.id)).toEqual(['large-language-models-ai-agents']);
    expect(world.bridges).toHaveLength(7);
  });
  it('the M3.1 AI loop is kept whole and still valid, one line away', () => {
    const ids = islandsInRegion('ai').map(i => i.id);
    expect(validateRegion(AI_BASELINE_LAYOUT, ids, reserved(AI_BASELINE_LAYOUT.layout.world))).toEqual([]);
    expect(AI_BASELINE_LAYOUT.source).toBe('authored');
    expect(AI_BASELINE_LAYOUT.layout.world.settlements.find(s => s.islandId === 'ai-foundations')!.center).toEqual({ q: 0, r: 0 });
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
    // A headland needs open sea: not toward a neighbouring island, not on a trimmed tile, not where the dock faces.
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ ...one, extend: [0] }, { islandId: 'b', cell: [1, 0] }], links: [['a', 'b']] })).toThrow('less than two water hexes');
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ ...one, extend: [2], trim: [2] }], links: [] })).toThrow('stands on a trimmed tile');
    expect(() => latticeLayout({ bridge: 'wood', placements: [{ ...one, extend: [4] }], links: [] })).toThrow('faces its own headland');
  });
});
