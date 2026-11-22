import { describe, expect, it } from 'vitest';
import { getIsland, islandsInRegion, labIslandConfig, orderedRegions, subjectIslands, worldIslands } from '@/content/world';
import { catalogLessons } from '@/content/world/catalog';
import { PLACEHOLDER_ISLANDS, TRANSITIONAL_ISLANDS } from '@/components/islands/hex-world/hex-landmarks';
import { FALLBACK_ART } from '@/lib/islands/fallback-art';
import { hexToWorld } from '@/lib/islands/hex';
import { placementPose } from '@/lib/islands/hex-buildings';
import { settlementFrames } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { islandLods } from '@/lib/islands/regions/island-lod';
import { MAPPED_REGION_IDS, REGION_LAYOUTS, regionLayout } from '@/lib/islands/regions/region-layouts';
import { WORLD_MAP, worldLinks, worldMapRegionIds } from '@/lib/islands/regions/world-map';
import { overviewLinks, overviewOutlines } from '@/lib/islands/regions/world-overview-geometry';
import { getIslandEntry, islandRegistry, meetsCheckedStandard, regionEntries, standardReport, validateIslandRegistry, type IslandRegistryEntry } from '@/lib/world/island-registry';
import { hubSummary, islandVisual, regionIslands, regionSummaries } from '@/lib/world/learning-islands';

/*
 * P9 S1 Island Registry contract: one definition of every island, shared by the three levels of the 3D world.
 *   World   the overview's outlines and links (world-overview-geometry.ts) and its low-detail islands (island-lod.ts)
 *   Region  each region's hex map (region-layouts.ts) and what its page is given (learning-islands.ts)
 *   Island  the same map with the camera on one settlement (hex-world.ts settlementFrames)
 * Ids, publication status and topology must agree across all of them, and with the world registry they come from.
 */
const registry = islandRegistry();
const SHAPES = ['wide', 'tall'] as const;

describe('Island Registry: one entry per island, nothing stored twice (P9 S1)', () => {
  it('holds the world registry\'s 29 subject islands in five regions and the tool island, in registry order', () => {
    expect(registry.map(e => e.islandId)).toEqual([...orderedRegions.flatMap(r => islandsInRegion(r.id).map(i => i.id)), labIslandConfig.id]);
    expect(registry.filter(e => e.kind === 'subject')).toHaveLength(29);
    expect(registry.filter(e => e.kind === 'tool').map(e => e.islandId)).toEqual(['labs']);
    expect(orderedRegions.map(r => [r.id, regionEntries(r.id).length])).toEqual([['cs', 8], ['ai', 7], ['design', 4], ['web', 4], ['sys', 6]]);
    expect(registry.length).toBe(worldIslands.length);
  });

  it('every field that has another owner is read from that owner', () => {
    for (const e of registry) {
      const record = getIsland(e.islandId)!;
      expect([e.kind, e.regionId, e.publicationStatus, e.lessons.planned], e.islandId).toEqual([record.kind, record.regionId, record.status, record.lessonCount]);
      expect(e.lessons.published, e.islandId).toBe(catalogLessons.filter(l => l.islandId === e.islandId && l.lessonStatus === 'complete').length);
      // An entry carries ids, counts and specs; names and descriptions stay in the world registry alone.
      expect(Object.keys(e).sort(), e.islandId).toEqual(['assetSpec', 'interactionSpec', 'islandId', 'kind', 'lessons', 'publicationStatus', 'regionId', 'visualSpec'].filter(k => k in e).sort());
      expect(JSON.stringify({ ...e, visualSpec: undefined, interactionSpec: undefined }), e.islandId).not.toContain(record.name);
    }
    // 80 lessons, then course production batches 1–5 (PL01–PL20), CN-1 to CN-5 (CN01–CN20), AIF-1 to AIF-5 (AIF01–AIF20), LNX-1 to LNX-5 (LNX01–LNX15), SRV-1 to SRV-5 (SRV01–SRV14), LLM-1 (LLM01–LLM03) and WEB-1, WEB-2 (WEB01–WEB07).
    expect(registry.reduce((n, e) => n + e.lessons.published, 0)).toBe(209); // WEB-3: + WEB08–WEB10; WEB-4: + WEB11–WEB13; WEB-5: + WEB14–WEB15; GEN-1: + GEN01–GEN02; RWD-1: + RWD01–RWD04; RWD-2: + RWD05–RWD08; RWD-3: + RWD09–RWD12; MOB-1: + MOB01–MOB04; MOB-2: + MOB05–MOB08
    expect(registry.reduce((n, e) => n + e.lessons.planned, 0)).toBe(subjectIslands.reduce((n, i) => n + i.lessonCount, 0));
    expect(getIslandEntry('no-such-island')).toBeUndefined();
  });

  it('passes its own rules, and they catch a misplaced, duplicated or wrongly routed island', () => {
    expect(validateIslandRegistry()).toEqual([]);
    const change = (id: string, patch: (e: IslandRegistryEntry) => IslandRegistryEntry) => registry.map(e => e.islandId === id ? patch(e) : e);
    expect(validateIslandRegistry(change('foundations', e => ({ ...e, regionId: 'ai' })))).toEqual(expect.arrayContaining([expect.stringMatching(/^foundations is drawn on cs; it belongs on ai alone/)]));
    expect(validateIslandRegistry(change('foundations', e => ({ ...e, kind: 'tool' })))).toEqual(expect.arrayContaining([expect.stringMatching(/^foundations is drawn on cs; it belongs on hub alone/)]));
    expect(validateIslandRegistry([...registry, registry[0]])).toEqual(expect.arrayContaining(['an island is listed twice']));
    expect(validateIslandRegistry(registry.filter(e => e.islandId !== 'networks'))).toEqual(expect.arrayContaining([expect.stringMatching(/^networks is drawn on cs but is not in the registry/)]));
    // A planned island (systems analysis, still an outline; CN opened in CN-1).
    expect(validateIslandRegistry(change('systems-analysis', e => ({ ...e, interactionSpec: { islandId: 'systems-analysis', targets: [{ interactionId: 'gate', label: '入口', action: { type: 'route', to: { kind: 'syllabus', islandId: 'systems-analysis' } } }] } }))))
      .toEqual(expect.arrayContaining(['systems-analysis: a planned island has a route']));
    expect(validateIslandRegistry(change('structures', e => ({ ...e, visualSpec: { ...e.visualSpec, state: 'planned' } })))).toEqual(expect.arrayContaining([expect.stringMatching(/^structures: visual state/)]));
  });
});

describe('S0 decisions 1 and 5: the foundations island is a CS island, drawn and counted once', () => {
  it('stands on the CS map alone: on no other region map, not at the hub, and the overview counts it once', () => {
    const where = MAPPED_REGION_IDS.filter(r => regionLayout(r).layout.world.settlements.some(s => s.islandId === 'foundations'));
    expect(where).toEqual(['cs']);
    expect(getIslandEntry('foundations')).toMatchObject({ kind: 'subject', regionId: 'cs', visualSpec: { place: { kind: 'region', regionId: 'cs' } } });
    expect(WORLD_MAP.hub.islandId).toBe('labs');
    const summaries = regionSummaries();
    expect(summaries.reduce((n, r) => n + r.islands, 0)).toBe(29);
    // Open: an island with published lessons (F, DS, AL, DB, PL since batch 1 and CN since CN-1, whose maps stay planned).
    expect(summaries.find(r => r.id === 'cs')).toMatchObject({ islands: 8, open: 6, planned: 2 });
    // On the world overview every island is drawn exactly once, as part of its own region's outline.
    for (const shape of SHAPES) {
      const drawn = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape).flatMap(o => o.world.settlements.map(s => [s.islandId, o.id] as const));
      expect(drawn.filter(([id]) => id === 'foundations')).toEqual([['foundations', 'cs']]);
      expect(drawn).toHaveLength(30);
      expect(new Set(drawn.map(([id]) => id)).size).toBe(30);
      expect(drawn.filter(([, part]) => part === 'hub')).toEqual([['labs', 'hub']]);
    }
  });
});

describe('World, Region and Island share one island (P9 S1 contract)', () => {
  it('ids: the same islands at every level, region by region', () => {
    for (const region of orderedRegions.map(r => r.id)) {
      const ids = regionEntries(region).map(e => e.islandId), sorted = [...ids].sort();
      const layout = regionLayout(region).layout;
      // Region: the map's settlements and the islands its page is given.
      expect(layout.world.settlements.map(s => s.islandId).sort(), `${region} map`).toEqual(sorted);
      expect(regionIslands(region).map(i => i.id), `${region} page`).toEqual(ids);
      // Island: the camera can frame every island of the page, and only those.
      expect(settlementFrames(layout.world, regionIslands(region)).map(f => f.id).sort(), `${region} frames`).toEqual(sorted);
      // World: the region's outline is that same map, and its low-detail islands are the same islands.
      for (const shape of SHAPES) {
        const outline = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape).find(o => o.id === region)!;
        expect(outline.world, `${region} ${shape} outline`).toBe(layout.world);
        expect(islandLods(outline, layout.glb).map(l => l.islandId).sort(), `${region} ${shape} lod`).toEqual(sorted);
      }
    }
    // The hub is the tool island at every level: the world map's hub, the overview's hub outline, the registry's place.
    for (const shape of SHAPES) expect(overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape).find(o => o.id === 'hub')!.world.settlements.map(s => s.islandId)).toEqual(['labs']);
    expect(getIslandEntry('labs')!.visualSpec.place).toEqual({ kind: 'hub' });
    expect(hubSummary().lab.id).toBe('labs');
  });

  it('definition: an entry\'s settlement is the object its region map draws; the home map draws the same tiles', () => {
    for (const e of registry.filter(x => x.kind === 'subject')) {
      const { world } = regionLayout(e.regionId!).layout;
      expect(e.visualSpec.world, e.islandId).toBe(world);
      expect(e.visualSpec.settlement, e.islandId).toBe(world.settlements.find(s => s.islandId === e.islandId));
    }
    for (const id of ['foundations', 'structures', 'algorithms', 'databases']) {
      expect(islandsHomeWorld.world.settlements.find(s => s.islandId === id)!.tiles, id).toBe(getIslandEntry(id)!.visualSpec.settlement.tiles);
    }
  });

  it('status: published or planned is the same answer at every level', () => {
    for (const region of orderedRegions.map(r => r.id)) {
      const entries = regionEntries(region), planned = entries.filter(e => e.publicationStatus === 'planned').map(e => e.islandId).sort();
      // 2026-11-20 (course production): lessons and landscape are two answers. Whether an island's lessons are open is
      // its publication status; how the 3D maps draw it is its map state, set by hand in the world registry.
      const drawnPlanned = entries.filter(e => getIsland(e.islandId)!.mapState === 'planned').map(e => e.islandId).sort();
      const layout = regionLayout(region).layout;
      // Lessons: the region page data and the overview's summary.
      expect(regionIslands(region).filter(i => i.planned).map(i => i.id).sort(), `${region} page`).toEqual(planned);
      expect(regionSummaries().find(r => r.id === region)).toMatchObject({ islands: entries.length, planned: planned.length, open: entries.length - planned.length });
      // Landscape: the map's own planned settlements, the island's visual status and the overview's LOD.
      expect(layout.world.settlements.filter(s => s.planned).map(s => s.islandId).sort(), `${region} map`).toEqual(drawnPlanned);
      for (const e of entries) expect(islandVisual(e.islandId).state, e.islandId).toBe(drawnPlanned.includes(e.islandId) ? 'planned' : 'open');
      const outline = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, 'wide').find(o => o.id === region)!;
      expect(islandLods(outline).filter(l => l.planned).map(l => l.islandId).sort(), `${region} lod`).toEqual(drawnPlanned);
      // A planned island is never drawn built: the map can lag the lessons, never lead them.
      for (const id of planned) expect(drawnPlanned, `${region} ${id}`).toContain(id);
    }
    expect(registry.filter(e => e.publicationStatus !== 'planned').map(e => e.islandId)).toEqual(['foundations', 'structures', 'algorithms', 'programming-languages', 'databases', 'networks', 'ai-foundations', 'large-language-models', 'generative-ai', 'web-foundations', 'responsive-design', 'mobile-apps', 'linux-systems', 'network-servers', 'labs']);
    // The islands whose lessons opened before their landscape: PL, CN, AIF, LLM, GEN, WEB, RWD, MOB, LNX and SRV keep the planned landscape they had (no GLB, no remodel).
    expect(registry.filter(e => e.publicationStatus !== 'planned' && e.visualSpec.state === 'planned').map(e => e.islandId)).toEqual(['programming-languages', 'networks', 'ai-foundations', 'large-language-models', 'generative-ai', 'web-foundations', 'responsive-design', 'mobile-apps', 'linux-systems', 'network-servers']);
  });

  it('topology: bridges join islands of one region; the world\'s ring, hub links and relation bridges join registry regions', () => {
    for (const region of orderedRegions.map(r => r.id)) {
      const ids = regionEntries(region).map(e => e.islandId);
      for (const bridge of regionLayout(region).layout.world.bridges) for (const port of [bridge.from, bridge.to]) expect(ids, `${region} ${bridge.id}`).toContain(port.islandId);
      for (const dock of regionLayout(region).docks) expect(ids, `${region} dock`).toContain(dock.islandId);
    }
    const regions = orderedRegions.map(r => r.id);
    expect([...WORLD_MAP.ring].sort()).toEqual([...regions].sort());
    expect(worldMapRegionIds().sort()).toEqual([...regions].sort());
    const links = worldLinks(WORLD_MAP);
    expect(links.filter(l => l.kind === 'hub').map(l => l.to).sort()).toEqual([...regions].sort());
    for (const l of links.filter(x => x.kind === 'relation')) { expect(regions).toContain(l.from); expect(regions).toContain(l.to); }
    // Every link of the overview lands on tiles of the two parts it joins, in both compositions.
    for (const shape of SHAPES) {
      const outlines = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape), drawn = overviewLinks(WORLD_MAP, outlines);
      expect(drawn.map(l => l.id).sort()).toEqual(links.map(l => l.id).sort());
      for (const l of drawn) for (const [end, part] of [[l.ends[0], l.from], [l.ends[1], l.to]] as const)
        expect(outlines.find(o => o.id === part)!.tiles.some(t => Math.hypot(t[0] - end[0], t[1] - end[1]) < 1e-9), `${l.id} ${part}`).toBe(true);
    }
  });

  it('geography: the world\'s low-detail islands keep each island\'s outline, relief, neighbours and landmarks', () => {
    for (const shape of SHAPES) for (const outline of overviewOutlines(WORLD_MAP, REGION_LAYOUTS, shape)) {
      const layout = outline.id === 'hub' ? undefined : regionLayout(outline.id).layout;
      const lods = islandLods(outline, layout?.glb), { world, placed } = outline;
      for (const [i, lod] of lods.entries()) {
        const settlement = world.settlements[i];
        // Outline: one point a tile, each the region map's tile centre under the overview's placement.
        expect(lod.tiles).toHaveLength(settlement.tiles.length);
        expect(lod.tiles[0]).toEqual(placed.point(...hexToWorld(settlement.tiles[0], world.size)));
        expect(lod.tileRadius).toBeCloseTo(world.size * placed.scale, 12);
        // Relief: the same tile is highest, by the same height at the overview's scale.
        const top = Math.max(...settlement.tiles.map(t => t.height ?? 0));
        expect(lod.peak).toBeCloseTo(top * placed.scale, 12);
        expect(lod.reach).toBeGreaterThan(lod.tileRadius);
      }
      // Neighbours: the overview is a uniform scale of the region map, so every pair of islands keeps its bearing and
      // its distance in proportion; no island changes side.
      for (const [i, a] of lods.entries()) for (const [j, b] of lods.entries()) if (i < j) {
        const [ax, az] = hexToWorld(world.settlements[i].center, world.size), [bx, bz] = hexToWorld(world.settlements[j].center, world.size);
        expect(Math.atan2(b.center[1] - a.center[1], b.center[0] - a.center[0])).toBeCloseTo(Math.atan2(bz - az, bx - ax), 9);
        expect(Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1])).toBeCloseTo(Math.hypot(bx - ax, bz - az) * placed.scale, 9);
      }
    }
    // Landmarks: the foundations island's three places stand, at world level, where the CS map puts them.
    const cs = regionLayout('cs').layout, outline = overviewOutlines(WORLD_MAP, REGION_LAYOUTS, 'wide').find(o => o.id === 'cs')!;
    const lod = islandLods(outline, cs.glb).find(l => l.islandId === 'foundations')!;
    expect(lod.landmarks.map(l => l.node)).toEqual(['Landmark_Lighthouse', 'Building_Workshop', 'Dock_Entry']);
    for (const mark of lod.landmarks) {
      const { position } = placementPose(cs.world, 'foundations', cs.glb[0].placements.find(p => p.node === mark.node)!);
      expect(mark.at).toEqual(outline.placed.point(position[0], position[2]));
      expect(mark.height).toBeCloseTo(position[1] * outline.placed.scale, 12);
    }
    // The island's high ground is its west hill, where the region map raises it (1.8), not somewhere invented.
    const hill = cs.world.settlements[0].tiles.find(t => (t.height ?? 0) === 1.8)!;
    expect(lod.summit).toEqual(outline.placed.point(...hexToWorld(hill, cs.world.size)));
    // Islands without GLB buildings have no landmark at world level: nothing is added that the region map does not have.
    expect(islandLods(outline, cs.glb).filter(l => l.landmarks.length).map(l => l.islandId)).toEqual(['foundations']);
  });
});

describe('asset and fallback specs follow the registries (P9 S1)', () => {
  it('each island\'s asset spec is its GLB, a declared GLB, or its fallback art', () => {
    expect(getIslandEntry('foundations')!.assetSpec).toMatchObject({ glb: { id: 'basics-island-v2.1', scale: 0.6, root: 'Island_Basics_Root', targets: ['Building_Workshop', 'Landmark_Lighthouse', 'Dock_Entry'] }, fallback: 'placeholder-landmarks' });
    expect(registry.filter(e => e.assetSpec.glb).map(e => e.islandId)).toEqual(['foundations']);
    expect(registry.filter(e => e.assetSpec.declared).map(e => [e.islandId, e.assetSpec.declared!.id])).toEqual([['databases', 'databases-island'], ['large-language-models', 'llm-island']]);
    expect(getIslandEntry('databases')!.assetSpec.fallback).toBe('transitional-art');
    // The art follows the map state, not the lessons (an island with open lessons and a planned map keeps its marker).
    for (const e of registry.filter(x => x.visualSpec.state === 'planned')) expect(e.assetSpec.fallback, e.islandId).toBe('planned-marker');
    for (const e of registry) expect(e.visualSpec.tier, e.islandId).toBe(e.assetSpec.glb ? 'glb' : e.visualSpec.state === 'planned' ? 'outline' : 'landmark');
  });

  it('the fallback art list is exactly what the landmark components draw', () => {
    const byKind = (kind: string) => Object.entries(FALLBACK_ART).filter(([, k]) => k === kind).map(([id]) => id).sort();
    expect(byKind('placeholder-landmarks')).toEqual([...PLACEHOLDER_ISLANDS].sort());
    expect(byKind('transitional-art')).toEqual([...TRANSITIONAL_ISLANDS].sort());
    for (const id of Object.keys(FALLBACK_ART)) expect(getIsland(id), id).toBeDefined();
  });
});

describe('Island Visual Standard report (S0: eight items, the foundations island as the bar)', () => {
  it('the foundations island meets every item the registry can check; no other island does yet', () => {
    const basics = standardReport(getIslandEntry('foundations')!);
    expect(basics.map(c => c.item)).toEqual(['terrain', 'biome', 'buildings', 'roads-and-plaza', 'decor', 'interactions', 'night-lighting', 'budget']);
    expect(basics.filter(c => c.met === true).map(c => c.item)).toEqual(['terrain', 'buildings', 'roads-and-plaza', 'interactions']);
    expect(basics.filter(c => c.met === false)).toEqual([]);
    expect(registry.filter(meetsCheckedStandard).map(e => e.islandId)).toEqual(['foundations']);
  });

  it('S2 target: what the structures island lacks today, item by item', () => {
    const structures = standardReport(getIslandEntry('structures')!);
    expect(Object.fromEntries(structures.map(c => [c.item, c.met]))).toEqual({
      terrain: false, biome: null, buildings: false, 'roads-and-plaza': false, decor: null, interactions: false, 'night-lighting': null, budget: null,
    });
    expect(structures.find(c => c.item === 'terrain')!.note).toBe('25 tiles, 1 height levels');
    // The 21 islands of the lattice regions and the four planned CS islands share one terrain, with no building, road or target.
    for (const e of registry.filter(x => x.publicationStatus === 'planned')) {
      const report = Object.fromEntries(standardReport(e).map(c => [c.item, c.met]));
      expect([report.terrain, report.buildings, report['roads-and-plaza'], report.interactions], e.islandId).toEqual([false, false, false, false]);
    }
  });
});
