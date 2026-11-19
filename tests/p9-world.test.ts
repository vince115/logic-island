import { describe, expect, it } from 'vitest';
import { islandsInRegion, labIslandConfig } from '@/content/world';
import { REGION_IDS } from '@/content/world/types';
import { hexToWorld } from '@/lib/islands/hex';
import { naturalTerrains } from '@/lib/islands/hex-natural-scene';
import { WATER_LEVEL, portPoint, worldCenter } from '@/lib/islands/hex-world';
import { regionLayout } from '@/lib/islands/regions/region-layouts';
import { overviewLinks, overviewOutlines } from '@/lib/islands/regions/world-overview-geometry';
import { WORLD_MAP, validateWorldMap, worldMapRegionIds } from '@/lib/islands/regions/world-map';
import { P9_CS_REGION, PLANNED_LANDSCAPES } from '@/lib/p9/cs-region';
import { SCENE_IDS, regionScene, sceneLayouts, scenePlacement } from '@/lib/p9/region-scene';
import { P9_SCALE, P9_WORLD_MAP, mapSpan } from '@/lib/p9/world-map';

/*
 * P9.1b: the world overview draws the regions' own scenes. These tests hold the Region Scene Definition to that: one
 * definition a region, the Region page's own layout by identity, and a placement that moves and shrinks a map without
 * changing it.
 */
const shapes = ['wide', 'tall'] as const;

describe('P9.1b Region Scene Definition', () => {
  it('is the Region page\'s own layout: CS the prototype\'s map, the other regions their approved maps, by identity', () => {
    expect(regionScene('cs').region).toBe(P9_CS_REGION);
    expect(regionScene('cs').source).toBe('p9');
    expect(regionScene('cs').landscapes).toBe(PLANNED_LANDSCAPES);
    for (const id of REGION_IDS.filter(r => r !== 'cs')) {
      expect(regionScene(id).region, id).toBe(regionLayout(id));
      expect(regionScene(id).source, id).toBe('approved');
    }
    for (const id of SCENE_IDS) expect(regionScene(id), `${id} is built once`).toBe(regionScene(id));
  });
  it('holds the registry\'s islands, each once, under its own region: 29 subject islands and the hub\'s one', () => {
    const seen = new Set<string>();
    for (const id of REGION_IDS) {
      const scene = regionScene(id), registry = islandsInRegion(id);
      expect(scene.islands.map(i => i.islandId).sort(), id).toEqual(registry.map(i => i.id).sort());
      for (const island of scene.islands) {
        expect(island.regionId, island.islandId).toBe(id);
        expect(island.planned, island.islandId).toBe(registry.find(i => i.id === island.islandId)!.status === 'planned');
        expect(seen.has(island.islandId), `${island.islandId} twice`).toBe(false);
        seen.add(island.islandId);
      }
    }
    expect(seen.size).toBe(29);
    const hub = regionScene('hub');
    expect(hub.islands.map(i => i.islandId)).toEqual([labIslandConfig.id]);
    expect(hub.islands[0].regionId).toBeNull();
    expect(seen.has(labIslandConfig.id), 'the hub is not one of the 29').toBe(false);
  });
  it('lists the landmarks where the region has them: the GLB buildings at their placements, authored landmarks and landscapes on their tiles', () => {
    const cs = regionScene('cs'), { world } = cs.region.layout;
    expect(cs.landmarks.filter(l => l.kind === 'glb').map(l => l.id).sort()).toEqual(['Building_Workshop', 'Dock_Entry', 'Landmark_Lighthouse']);
    expect(cs.landmarks.filter(l => l.kind === 'glb').every(l => l.islandId === 'foundations')).toBe(true);
    expect(cs.landmarks.filter(l => l.kind === 'authored').map(l => l.islandId)).toEqual(['databases', 'databases', 'databases', 'databases']);
    expect(cs.landmarks.filter(l => l.kind === 'landscape').map(l => l.islandId).sort()).toEqual(PLANNED_LANDSCAPES.map(l => l.islandId).sort());
    for (const landmark of cs.landmarks) {
      const settlement = world.settlements.find(s => s.islandId === landmark.islandId)!;
      expect(settlement.tiles.some(t => t.q === landmark.tile.q && t.r === landmark.tile.r), `${landmark.islandId}:${landmark.id} stands on its island`).toBe(true);
    }
    // Every tree is one of the Region's own (the natural layout's), on an island of the region.
    expect(cs.trees).toBe(cs.region.layout.natural!.trees);
    expect(cs.trees.length).toBeGreaterThan(100);
  });
});

describe('P9.1b world overview', () => {
  it('keeps the world map\'s places, ring and bridges; a region\'s width is its own map at the one scale', () => {
    expect(P9_WORLD_MAP.ring).toBe(WORLD_MAP.ring);
    expect(P9_WORLD_MAP.bridges).toBe(WORLD_MAP.bridges);
    for (const shape of shapes) {
      expect(validateWorldMap(P9_WORLD_MAP, shape), shape).toEqual([]);
      for (const id of worldMapRegionIds()) {
        expect(P9_WORLD_MAP.regions[id]![shape].at).toBe(WORLD_MAP.regions[id]![shape].at);
        expect(P9_WORLD_MAP.regions[id]![shape].width).toBeCloseTo(mapSpan(regionScene(id).region.layout.world) * P9_SCALE[shape]);
      }
    }
  });
  for (const shape of shapes) it(`${shape}: every scene is placed at the same scale, and a placed map is the Region's map moved and shrunk, nothing else`, () => {
    const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape);
    expect(outlines.map(o => o.id).sort()).toEqual([...SCENE_IDS].sort());
    for (const outline of outlines) {
      const scene = regionScene(outline.id), { world } = scene.region.layout;
      expect(outline.placed.scale, `${outline.id} scale`).toBeCloseTo(P9_SCALE[shape], 6);
      const placement = scenePlacement(world, outline.placed.point(...worldCenter(outline.world)), outline.placed.scale, WATER_LEVEL);
      const put = ([x, y, z]: readonly [number, number, number]) => [placement.position[0] + x * placement.scale, placement.position[1] + y * placement.scale, placement.position[2] + z * placement.scale];
      // The scaled group puts every tile exactly where the overview's own outline has it, and the map's sea level on the overview's.
      for (const settlement of world.settlements) for (const tile of settlement.tiles) {
        const [x, z] = hexToWorld(tile, world.size), [px, py, pz] = put([x, WATER_LEVEL, z]), [ox, oz] = outline.placed.point(x, z);
        expect(px).toBeCloseTo(ox, 6); expect(pz).toBeCloseTo(oz, 6); expect(py).toBeCloseTo(0, 6);
      }
      // Topology: the distance between any two islands' centres, and every bridge's length, shrink by the scale and by nothing else.
      const centres = scene.islands.map(i => put([i.center[0], 0, i.center[1]]));
      for (const [i, a] of scene.islands.entries()) for (const [j, b] of scene.islands.entries()) if (i < j) {
        expect(Math.hypot(centres[i][0] - centres[j][0], centres[i][2] - centres[j][2])).toBeCloseTo(Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) * placement.scale, 6);
      }
      for (const bridge of world.bridges) {
        const [a, b] = [portPoint(world, bridge.from), portPoint(world, bridge.to)], [pa, pb] = [put([a[0], 0, a[1]]), put([b[0], 0, b[1]])];
        expect(Math.hypot(pa[0] - pb[0], pa[2] - pb[2]), bridge.id).toBeCloseTo(Math.hypot(a[0] - b[0], a[1] - b[1]) * placement.scale, 6);
      }
    }
  });
  it('draws the Region\'s own terrain: the triangles of the map the Region page draws, island for island', () => {
    for (const id of SCENE_IDS) {
      const { world } = regionScene(id).region.layout, terrains = naturalTerrains(world);
      expect(terrains.map(t => t.islandId), id).toEqual(world.settlements.map(s => s.islandId));
      expect(naturalTerrains(world), `${id}: one terrain per map`).toBe(terrains);
      for (const terrain of terrains) expect(terrain.triangles.length, `${id} ${terrain.islandId}`).toBeGreaterThan(50);
    }
  });
  it('keeps every link of the world map, each landing on a tile of the two scenes it joins', () => {
    for (const shape of shapes) {
      const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape), links = overviewLinks(P9_WORLD_MAP, outlines);
      expect(links.map(l => l.id).sort()).toEqual(overviewLinks(WORLD_MAP, overviewOutlines(WORLD_MAP, sceneLayouts(), shape)).map(l => l.id).sort());
      expect(links.filter(l => l.kind === 'hub')).toHaveLength(5);
      expect(links.filter(l => l.kind === 'relation').map(l => l.id).sort()).toEqual(['cs-ai', 'design-web', 'sys-cs']);
      for (const link of links) {
        const [from, to] = [outlines.find(o => o.id === link.from)!, outlines.find(o => o.id === link.to)!];
        expect(from.tiles.some(t => t[0] === link.ends[0][0] && t[1] === link.ends[0][1]), `${link.id} from`).toBe(true);
        expect(to.tiles.some(t => t[0] === link.ends[1][0] && t[1] === link.ends[1][1]), `${link.id} to`).toBe(true);
      }
    }
  });
});
