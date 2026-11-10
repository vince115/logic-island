import { describe, expect, it } from 'vitest';
import {
  HEX_EDGES, hexCorner, hexDistance, hexEdgeCorners, hexEdgeMidpoint, hexKey, hexNeighbor, hexSpiral, hexToWorld, oppositeEdge,
} from '@/lib/islands/hex';
import {
  hexWorld, portPoint, settlementFrames, settlementRoads, validateHexWorld, type HexSettlement, type HexWorld,
} from '@/lib/islands/hex-world';
import { islands } from '@/lib/islands/data';

const R = hexWorld.size;
const ids = islands.map(i => i.id);
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
const flower = (islandId: string, q: number, r: number): HexSettlement =>
  ({ islandId, center: { q, r }, tiles: hexSpiral({ q, r }, 1).map(t => ({ ...t, terrain: 'grass' })) });
const world = (patch: Partial<HexWorld>): HexWorld => ({ ...structuredClone(hexWorld), ...patch });

describe('flat-top axial hex math', () => {
  it('puts corners 0 and 3 on the x axis and neighbors √3·R apart', () => {
    close(hexCorner({ q: 0, r: 0 }, R, 0), [R, 0]);
    close(hexCorner({ q: 0, r: 0 }, R, 3), [-R, 0]);
    for (const edge of HEX_EDGES) {
      const [x, z] = hexToWorld(hexNeighbor({ q: 0, r: 0 }, edge), R);
      expect(Math.hypot(x, z)).toBeCloseTo(Math.sqrt(3) * R, 9);
      expect(hexDistance({ q: 0, r: 0 }, hexNeighbor({ q: 0, r: 0 }, edge))).toBe(1);
      expect(hexNeighbor(hexNeighbor({ q: 0, r: 0 }, edge), oppositeEdge(edge))).toEqual({ q: 0, r: 0 });
    }
  });

  it('places every edge midpoint halfway between that edge’s two corners', () => {
    for (const edge of HEX_EDGES) {
      const [a, b] = hexEdgeCorners({ q: 2, r: -1 }, edge, R);
      close(hexEdgeMidpoint({ q: 2, r: -1 }, edge, R), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      const [cx, cz] = hexToWorld({ q: 2, r: -1 }, R), [mx, mz] = hexEdgeMidpoint({ q: 2, r: -1 }, edge, R);
      expect(Math.hypot(mx - cx, mz - cz)).toBeCloseTo((Math.sqrt(3) / 2) * R, 9);
    }
  });

  it('builds spirals of 1, 7 and 19 tiles', () => {
    expect([0, 1, 2].map(radius => hexSpiral({ q: 3, r: 3 }, radius).length)).toEqual([1, 7, 19]);
  });
});

describe('D.2a hex world layout', () => {
  it('is valid', () => {
    expect(validateHexWorld(hexWorld, ids)).toEqual([]);
  });

  it('has the three existing islands at the agreed coordinates; foundations grew to 8 tiles in D.2b', () => {
    expect(hexWorld.settlements.map(s => [s.islandId, s.center, s.tiles.length])).toEqual([
      ['foundations', { q: 0, r: 0 }, 8], ['structures', { q: 4, r: -4 }, 7], ['algorithms', { q: 8, r: -4 }, 7],
    ]);
    expect(hexWorld.settlements[0].tiles.at(-1)).toMatchObject({ q: -2, r: 1 });
  });

  it('never overlaps tiles, by coordinate or by geometry', () => {
    const tiles = hexWorld.settlements.flatMap(s => s.tiles);
    expect(new Set(tiles.map(hexKey)).size).toBe(tiles.length);
    for (const [i, a] of tiles.entries()) for (const b of tiles.slice(i + 1)) {
      const [ax, az] = hexToWorld(a, R), [bx, bz] = hexToWorld(b, R);
      // Two flat-top hexes only touch (never overlap) when their centers are at least √3·R apart.
      expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThanOrEqual(Math.sqrt(3) * R - 1e-9);
    }
  });

  it('joins two bridges at facing tile edges across one water hex', () => {
    expect(hexWorld.bridges.map(b => [b.id, hexKey(b.from.tile), b.from.edge, hexKey(b.to.tile), b.to.edge])).toEqual([
      ['foundations-structures', '1,-1', 1, '3,-3', 4], ['structures-algorithms', '5,-4', 0, '7,-4', 3],
    ]);
    for (const bridge of hexWorld.bridges) {
      for (const port of [bridge.from, bridge.to]) {
        const [a, b] = hexEdgeCorners(port.tile, port.edge, R);
        close(portPoint(hexWorld, port), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      const [ax, az] = portPoint(hexWorld, bridge.from), [bx, bz] = portPoint(hexWorld, bridge.to);
      expect(Math.hypot(bx - ax, bz - az)).toBeCloseTo(Math.sqrt(3) * R, 9);
    }
  });

  it('runs a road from each plaza to each of its bridge edges and to the dock', () => {
    const roads = settlementRoads(hexWorld);
    expect(roads.map(r => r.routeId)).toEqual(['foundations-structures', 'foundations-structures', 'structures-algorithms', 'structures-algorithms', 'foundations-dock']);
    for (const road of roads) {
      const settlement = hexWorld.settlements.find(s => s.islandId === road.islandId)!;
      close(road.points[0], hexToWorld(settlement.center, R));
      close(road.points.at(-1)!, portPoint(hexWorld, road.port!));
    }
  });

  it('frames each island around its settlement, centered on the whole map', () => {
    const frames = settlementFrames(hexWorld, islands);
    expect(frames.map(f => f.id)).toEqual(ids);
    expect(frames.map(f => f.courseSlugs)).toEqual(islands.map(i => i.courseSlugs));
    const xs = frames.flatMap(f => [f.position[0] + f.bounds.min[0], f.position[0] + f.bounds.max[0]]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
  });

  it('does not change the production island data', () => {
    expect(islands.map(i => [i.id, i.position, i.modelId, i.glbAssetId])).toEqual([
      ['foundations', [-6.6, 0, 1.4], 'beacon-workshop', 'basics-island-v2.1'],
      ['structures', [0.1, 0.15, -4.6], 'data-harbor', undefined],
      ['algorithms', [6.5, -0.05, 1.1], 'algorithm-observatory', undefined],
    ]);
  });
});

describe('hex world validation', () => {
  it('accepts settlements of other sizes and longer bridges', () => {
    const small: HexSettlement = { islandId: 'foundations', center: { q: 0, r: 0 }, tiles: [{ q: 0, r: 0, terrain: 'plaza' }, { q: 1, r: -1, terrain: 'grass' }] };
    const big: HexSettlement = { ...flower('structures', 5, -5), tiles: hexSpiral({ q: 5, r: -5 }, 2).map(t => ({ ...t, terrain: 'grass' as const })) };
    const custom = world({
      settlements: [small, big, flower('algorithms', 12, -5)],
      bridges: [
        { id: 'a', kind: 'wood', from: { islandId: 'foundations', tile: { q: 1, r: -1 }, edge: 1 }, to: { islandId: 'structures', tile: { q: 3, r: -3 }, edge: 4 } },
        { id: 'b', kind: 'stone', from: { islandId: 'structures', tile: { q: 7, r: -5 }, edge: 0 }, to: { islandId: 'algorithms', tile: { q: 11, r: -5 }, edge: 3 } },
      ],
    });
    expect(validateHexWorld(custom, ids)).toEqual([]);
  });

  it('rejects overlapping or touching settlements', () => {
    expect(validateHexWorld(world({ settlements: [flower('foundations', 0, 0), flower('structures', 2, -1), flower('algorithms', 8, -4)] }), ids))
      .toEqual(expect.arrayContaining(['tile 1,0: shared by foundations and structures', 'foundations and structures: no water between them']));
    expect(validateHexWorld(world({ settlements: [flower('foundations', 0, 0), flower('structures', 3, -3), flower('algorithms', 8, -4)] }), ids))
      .toContain('foundations and structures: no water between them');
  });

  it('rejects bridges that miss tile edges, cross land or leave an island unreachable', () => {
    const [fs, sa] = hexWorld.bridges;
    const check = (patch: Partial<HexWorld>) => validateHexWorld(world(patch), ids);
    expect(check({ bridges: [{ ...fs, from: { ...fs.from, edge: 0 } }, sa] })).toEqual(expect.arrayContaining([
      'foundations-structures: edges 0 and 4 do not face each other', 'foundations-structures: ports are not on one straight line',
    ]));
    expect(check({ bridges: [{ ...fs, from: { ...fs.from, tile: { q: 0, r: 0 } } }, sa] }))
      .toContain('foundations-structures: foundations edge 1 does not face water');
    expect(check({ bridges: [{ ...fs, from: { ...fs.from, tile: { q: 1, r: -1 } }, to: { ...fs.to, tile: { q: 7, r: -4 }, islandId: 'algorithms', edge: 4 } }] }))
      .toEqual(expect.arrayContaining(['foundations-structures: ports are not on one straight line', 'structures: not connected by bridges']));
    expect(check({ bridges: [fs] })).toContain('algorithms: not connected by bridges');
  });

  it('rejects broken settlements and unknown islands', () => {
    const gap: HexSettlement = { islandId: 'foundations', center: { q: 0, r: 0 }, tiles: [{ q: 0, r: 0, terrain: 'plaza' }, { q: 0, r: 2, terrain: 'grass' }] };
    expect(validateHexWorld(world({ settlements: [gap, ...hexWorld.settlements.slice(1)] }), ids)).toContain('foundations: tiles are not contiguous');
    expect(validateHexWorld(hexWorld, [...ids, 'ai-machine-learning'])).toContain('ai-machine-learning: expected exactly one settlement');
  });
});
