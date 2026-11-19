import { describe, expect, it } from 'vitest';
import { glbAssets } from '@/lib/islands/asset-registry';
import { hexToWorld } from '@/lib/islands/hex';
import { A, assembleLayout, plannedIsland, shape, shapedIsland, tiles, type IslandSpec, type LayoutSpec } from '@/lib/islands/hex-layout';
import { MAIN_ROAD_WIDTH } from '@/lib/islands/hex-natural-scene';
import { roadProfiles } from '@/lib/islands/hex-terrain';
import { validateHexWorld } from '@/lib/islands/hex-world';
import { ALGORITHMS_ISLAND, DATABASES_ISLAND, FOUNDATIONS_ISLAND, ISLANDS_LAYOUT, LABS_ISLAND, STRUCTURES_ISLAND, islandsHomeWorld, islandsWorld } from '@/lib/islands/islands-world';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';

/*
 * P9 S1: a world layout is a list of island specs. The builder names no island: any island may bring its own terrain,
 * woods, roads, GLB buildings and plaza, and more than one island of a map may have buildings and a plaza. The
 * existing worlds are unchanged (tests/world-data.test.ts holds their fingerprints).
 */

describe('generic layout builder (P9 S1)', () => {
  it('the existing maps are the same island specs, in the same order', () => {
    expect(ISLANDS_LAYOUT.islands).toEqual([FOUNDATIONS_ISLAND, STRUCTURES_ISLAND, ALGORITHMS_ISLAND]);
    expect(islandsWorld.world.settlements.map(s => s.islandId)).toEqual(['foundations', 'structures', 'algorithms']);
    expect(islandsHomeWorld.world.settlements.map(s => s.islandId)).toEqual(['foundations', 'structures', 'algorithms', 'labs', 'databases']);
    const cs = REGION_LAYOUTS.cs!.layout;
    expect(cs.world.settlements.map(s => s.islandId)).toEqual(['foundations', 'structures', 'algorithms', 'databases', 'programming-languages', 'networks', 'systems-analysis', 'information-systems']);
    // The region draws the very tiles the home map draws for the islands they share: one definition, two maps.
    for (const spec of [FOUNDATIONS_ISLAND, STRUCTURES_ISLAND, ALGORITHMS_ISLAND, DATABASES_ISLAND]) {
      for (const layout of [islandsHomeWorld, cs]) expect(layout.world.settlements.find(s => s.islandId === spec.islandId)!.tiles, spec.islandId).toBe(spec.tiles);
    }
    expect(islandsHomeWorld.world.settlements.find(s => s.islandId === 'labs')!.tiles).toBe(LABS_ISLAND.tiles);
  });

  it('only what an island declares is built: woods, buildings, plaza and main route each follow its own spec', () => {
    for (const layout of [islandsWorld, islandsHomeWorld, REGION_LAYOUTS.cs!.layout]) {
      expect(layout.glb.map(g => [g.islandId, g.asset])).toEqual([['foundations', 'basics-island-v2.1']]);
      expect(layout.natural!.plazas.map(p => p.islandId)).toEqual(['foundations']);
      expect(layout.natural!.roadWidths).toEqual(Object.fromEntries(FOUNDATIONS_ISLAND.plaza!.mainRoutes.map(id => [id, MAIN_ROAD_WIDTH])));
      expect(layout.forests.map(f => f.islandId)).toEqual(layout.world.settlements.filter(s => !s.planned).map(s => s.islandId));
    }
    // A planned island keeps the shared low-detail terrain and declares nothing else.
    const planned = plannedIsland({ islandId: 'x', center: A(0, 0), shape: shape(2, [], []) });
    expect(planned).toMatchObject({ planned: true });
    expect([planned.forest, planned.glb, planned.plaza]).toEqual([undefined, undefined, undefined]);
  });

  it('a map may hold several islands with GLB buildings and a plaza each, none of them named foundations', () => {
    // Two islands built to the foundations island's standard, under other ids, 14 tiles apart, joined by one bridge.
    const copy = (islandId: string, center: ReturnType<typeof A>): IslandSpec => {
      const move = (t: { q: number; r: number }) => ({ q: t.q + center.q, r: t.r + center.r });
      const [ox, oz] = hexToWorld(center, 1.25);
      return {
        islandId, center,
        tiles: FOUNDATIONS_ISLAND.tiles.map(t => ({ ...t, ...move(t) })), cliffBeaches: FOUNDATIONS_ISLAND.cliffBeaches!.map(move),
        forest: { tiles: FOUNDATIONS_ISLAND.forest!.tiles.map(move), density: 5 }, buildingTiles: FOUNDATIONS_ISLAND.buildingTiles!.map(move),
        spurs: FOUNDATIONS_ISLAND.spurs!.map(s => ({ ...s, id: s.id.replace('foundations', islandId), tile: move(s.tile), ...(s.via ? { via: s.via.map(move) } : {}),
          ...(s.approach ? { approach: s.approach.map(([x, z]): [number, number] => [x + ox, z + oz]) } : {}) })),
        glb: { asset: 'basics-island-v2.1', placements: FOUNDATIONS_ISLAND.glb!.placements.map(p => ({ ...p, tile: move(p.tile) })) },
        plaza: { mainRoutes: [`${islandId}-dock`, `${islandId}-lighthouse`], forecourts: [`${islandId}-workshop`], terraces: FOUNDATIONS_ISLAND.plaza!.terraces },
      };
    };
    const west = copy('west', A(0, 0)), east = copy('east', A(14, -7));
    const spec: LayoutSpec = { islands: [west, east, shapedIsland('middle', 'lawn', { center: A(7, 5), shape: shape(1, [], []), forest: [] })],
      bridges: [{ id: 'west-east', kind: 'stone', from: { islandId: 'west', tile: A(3, -3), edge: 1 }, to: { islandId: 'east', tile: A(11, -11 + 7), edge: 4 } }], natural: true };
    const layout = assembleLayout(spec);
    expect(layout.glb.map(g => g.islandId)).toEqual(['west', 'east']);
    const [a, b] = layout.natural!.plazas;
    expect([a.islandId, b.islandId]).toEqual(['west', 'east']);
    // Each plaza is laid out on its own island, to the same plan as the foundations island's, moved with the island.
    const reference = islandsWorld.natural!.plazas[0], [dx, dz] = hexToWorld(A(14, -7), 1.25);
    expect(a.lamps).toEqual(reference.lamps);
    expect(b.lamps.length).toBe(reference.lamps.length);
    b.lamps.forEach(([x, y, z], i) => { expect(x - dx).toBeCloseTo(reference.lamps[i][0], 9); expect(y).toBeCloseTo(reference.lamps[i][1], 9); expect(z - dz).toBeCloseTo(reference.lamps[i][2], 9); });
    expect(b.pads.map(p => p.kind)).toEqual(['forecourt', 'terrace']);
    expect(b.center[0] - dx).toBeCloseTo(reference.center[0], 9);
    // Every main route of both islands is widened, and no other road.
    expect(Object.keys(layout.natural!.roadWidths).sort()).toEqual(['east-dock', 'east-lighthouse', 'west-dock', 'west-lighthouse']);
    expect(roadProfiles(layout.world).filter(r => r.routeId.endsWith('-workshop')).length).toBe(2);
    // The trees and rocks keep clear of both islands' buildings: twice the footprints of one.
    const circles = Object.values(glbAssets['basics-island-v2.1'].footprints).reduce((n, list) => n + list.length, 0);
    expect(layout.natural!.keepOut).toHaveLength(circles * 2);
    // The zone report is the first island's that declares building tiles.
    expect(layout.zones).toEqual(islandsWorld.zones);
    // The bridge above is only there to make one connected world; its ports are not the point of this test.
    expect(validateHexWorld({ ...layout.world, bridges: [] }, ['west', 'east', 'middle']).filter(p => !/not connected/.test(p))).toEqual([]);
  });

  it('a broken spec fails at build time instead of drawing a broken map', () => {
    const island = { ...shapedIsland('a', 'lawn', { center: A(0, 0), shape: shape(1, [], []), forest: [] }) };
    expect(() => assembleLayout({ islands: [island, island], bridges: [], natural: false })).toThrow(/listed twice/);
    const noNode: IslandSpec = { ...island, tiles: tiles(A(0, 0), shape(1, [], []), () => ({ terrain: 'grass' })), plaza: { mainRoutes: [], terraces: [{ node: 'Landmark_Lighthouse', radius: 1 }] } };
    expect(() => assembleLayout({ islands: [noNode], bridges: [], natural: true })).toThrow(/not placed on the island/);
  });
});
