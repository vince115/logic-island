import { describe, expect, it } from 'vitest';
import { hexKey, worldToHex } from '@/lib/islands/hex';
import { tileTop } from '@/lib/islands/hex-terrain';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { validateHexWorld } from '@/lib/islands/hex-world';
import { PLATFORM_HEIGHT, RING, roadPoint, walkNetwork, type WalkNetwork } from '@/lib/presence/npc-paths';
import { ROSTER_STEP_SECONDS, createCrowd, fillCrowd, stepCrowd, targetPose } from '@/lib/presence/npc-sim';
import { MOCK_STEP_MS, mockSnapshot, npcCountFor, onlineOf, parseSnapshot, tierCap, tierFps, withoutAnswer } from '@/lib/presence/population';
import { ISLAND_CAPS } from '@/lib/presence/npc-zones';

/*
 * Dynamic Island Population: from an online count to figures, the roads they may walk, and the walk itself. The walk
 * is checked the hard way: figures are stepped for a long time and every drawn position must be on the island's own
 * dry, open land, clear of its buildings.
 */

const { world, natural } = islandsHomeWorld;
const plazaOf = (islandId: string) => natural!.plazas.find(p => p.islandId === islandId);
const networkOf = (islandId: string): WalkNetwork => {
  const plaza = plazaOf(islandId);
  return walkNetwork(world, islandId, { keepOut: natural!.keepOut, platform: plaza ? { radius: plaza.radius, height: PLATFORM_HEIGHT } : null });
};

/** What a drawn position must satisfy: a land tile of this island, not woods, with clear ground around the figure. */
function ground(islandId: string) {
  const settlement = world.settlements.find(s => s.islandId === islandId)!;
  const tiles = new Map(settlement.tiles.map(t => [hexKey(t), t]));
  const at = (x: number, z: number) => tiles.get(hexKey(worldToHex(x, z, world.size)));
  return (x: number, y: number, z: number, clearance = 0.12): string | null => {
    const tile = at(x, z);
    if (!tile) return `(${x.toFixed(2)}, ${z.toFixed(2)}) is in the sea`;
    if (tile.terrain === 'forest') return `(${x.toFixed(2)}, ${z.toFixed(2)}) is in the woods`;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, near = at(x + Math.cos(a) * clearance, z + Math.sin(a) * clearance);
      if (!near || near.terrain === 'forest') return `(${x.toFixed(2)}, ${z.toFixed(2)}) is within ${clearance} of the coast or the woods`;
    }
    const hit = natural!.keepOut.find(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);
    if (hit) return `(${x.toFixed(2)}, ${z.toFixed(2)}) is inside a building footprint`;
    // Feet on the ground: never under the lowest tile the figure could be stepping between.
    const lowest = Math.min(tileTop(tile), ...[0, 1, 2, 3, 4, 5].map(k => { const a = (k / 6) * Math.PI * 2, n = at(x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1); return n ? tileTop(n) : Infinity; }));
    if (!(y >= lowest - 1e-6)) return `(${x.toFixed(2)}, ${z.toFixed(2)}) is underground (y ${y.toFixed(3)})`;
    return null;
  };
}

describe('npcCountFor: population and figures are different numbers', () => {
  it('draws one figure a visitor at first, then one more each time the population doubles', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9, 16, 17, 32, 64, 1000].map(n => npcCountFor(n, 99))).toEqual([0, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 12]);
  });

  it('never exceeds the island cap and never decreases as the population grows', () => {
    let previous = 0;
    for (let online = 0; online <= 5_000; online++) {
      const count = npcCountFor(online, 8);
      expect(count).toBeLessThanOrEqual(8);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(npcCountFor(1_000_000, 8)).toBe(8);
  });

  it('draws nothing for nonsense', () => {
    for (const online of [-3, NaN, Infinity, 0.4]) expect(npcCountFor(online, 8)).toBe(0);
    expect(npcCountFor(5, 0)).toBe(0);
    expect(npcCountFor(2.9, 8)).toBe(2);
  });

  it('halves the cap and lowers the frame rate on phones', () => {
    expect(tierCap(8, 'full')).toBe(8);
    expect(tierCap(8, 'low')).toBe(4);
    expect(tierCap(1, 'low')).toBe(1);
    expect(tierFps('low')).toBeLessThan(tierFps('full'));
    expect(npcCountFor(1_000, tierCap(ISLAND_CAPS.foundations, 'low'))).toBe(4);
  });
});

describe('mock presence data', () => {
  it('has the shape the API publishes and steps through quiet, busy and empty', () => {
    const seen = new Set<number>();
    for (let step = 0; step < 16; step++) {
      const snapshot = mockSnapshot(step * MOCK_STEP_MS);
      expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
      expect(snapshot.total).toBe(snapshot.hub + Object.values(snapshot.regions).reduce((a, b) => a + b, 0));
      seen.add(onlineOf(snapshot, 'foundations'));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 3, 6, 12, 40]);
    expect(onlineOf(mockSnapshot(0, { foundations: 7, structures: 0 }), 'foundations')).toBe(7);
    expect(mockSnapshot(0, { foundations: 7, structures: 0 }).islands).toEqual({ foundations: 7 });
    expect(onlineOf(null, 'foundations')).toBe(0);
  });

  it('refuses answers that are not a snapshot', () => {
    for (const value of [null, 'x', {}, { v: 1, at: 1, ttlMs: 1, total: 1, hub: 0, regions: {}, islands: { a: -1 } }, { v: 1, at: 1, ttlMs: 1, total: 1, hub: 0, regions: { cs: 'many' }, islands: {} }])
      expect(parseSnapshot(value)).toBeNull();
  });
});

describe('walkNetwork: safe paths from the island\'s own roads', () => {
  it('reads a valid home world', () => {
    expect(validateHexWorld(world, world.settlements.map(s => s.islandId))).toEqual([]);
  });

  it('gives the foundations island its dock, lighthouse, workshop and bridge roads, with arrivals at the coast', () => {
    const network = networkOf('foundations');
    expect(network.roads.map(r => r.id).sort()).toEqual(['foundations-dock', 'foundations-lighthouse', 'foundations-structures', 'foundations-workshop']);
    expect(network.roads.filter(r => r.gateway).map(r => r.id).sort()).toEqual(['foundations-dock', 'foundations-structures']);
    expect(network.platform).toEqual({ radius: 1, height: PLATFORM_HEIGHT });
    for (const road of network.roads) {
      expect(road.start).toBe(RING);
      expect(road.end - road.start).toBeGreaterThan(1.5);
      // The road stops short of its drawn end: before the coast, a door or a building's footprint.
      expect(road.end).toBeLessThan(road.cumulative.at(-1)!);
    }
  });

  it('keeps every usable stretch on dry open land, both lanes, for every island of the home map', () => {
    for (const settlement of world.settlements) {
      const network = networkOf(settlement.islandId), check = ground(settlement.islandId);
      for (const road of network.roads) for (let s = road.start; s <= road.end; s += 0.02) for (const dir of [1, -1] as const) {
        const pose = targetPose(network, { mode: 'road', road: network.roads.indexOf(road), s, dir, angle: 0, toRoad: 0, arc: 1 } as never);
        expect(check(pose.x, pose.y, pose.z, 0.19), `${road.id} at ${s.toFixed(2)}`).toBeNull();
      }
      // The ring, both ways round.
      if (network.roads.length) for (let a = 0; a < Math.PI * 2; a += 0.05) for (const arc of [1, -1] as const) {
        const pose = targetPose(network, { mode: 'ring', road: 0, s: 0, dir: 1, angle: a, toRoad: 0, arc } as never);
        expect(check(pose.x, pose.y, pose.z, 0.19), `${settlement.islandId} ring`).toBeNull();
      }
    }
  });

  it('follows a road\'s height, ramps included', () => {
    const network = networkOf('foundations'), lighthouse = network.roads.find(r => r.id === 'foundations-lighthouse')!, dock = network.roads.find(r => r.id === 'foundations-dock')!;
    // The lookout road climbs to the headland; the dock road drops to the low shore.
    expect(roadPoint(lighthouse, lighthouse.end).point[1]).toBeGreaterThan(network.center[1] + 0.5);
    expect(roadPoint(dock, dock.end).point[1]).toBeLessThan(network.center[1] - 0.5);
    for (const road of network.roads) for (let s = 0.1; s <= road.end; s += 0.1) {
      const rise = Math.abs(roadPoint(road, s).point[1] - roadPoint(road, s - 0.1).point[1]);
      expect(rise, `${road.id} at ${s.toFixed(1)}`).toBeLessThan(0.15);
    }
  });

  it('is empty for an island that is not on the map', () => {
    expect(networkOf('atlantis').roads).toEqual([]);
    const crowd = createCrowd(1);
    stepCrowd(crowd, networkOf('atlantis'), 5, 0.1);
    expect(crowd.npcs).toEqual([]);
  });
});

describe('the walk', () => {
  it('keeps eight figures on land, out of the woods and off the buildings for fifteen minutes', () => {
    const network = networkOf('foundations'), check = ground('foundations'), crowd = createCrowd(20261120);
    const visited = new Map<number, Set<number>>();
    let modes = new Set<string>();
    for (let step = 0; step < 15 * 60 * 30; step++) {
      stepCrowd(crowd, network, 8, 1 / 30);
      for (const npc of crowd.npcs) {
        expect(Number.isFinite(npc.x + npc.y + npc.z + npc.yaw)).toBe(true);
        const problem = check(npc.x, npc.y, npc.z);
        if (problem) throw new Error(`figure ${npc.id} at step ${step} (${npc.mode}): ${problem}`);
        (visited.get(npc.id) ?? visited.set(npc.id, new Set()).get(npc.id)!).add(npc.road);
        modes = modes.add(npc.mode);
      }
    }
    expect(crowd.npcs).toHaveLength(8);
    expect([...modes].sort()).toEqual(['pause', 'ring', 'road']);
    // Everyone gets around: each figure has walked at least three of the four roads.
    for (const roads of visited.values()) expect(roads.size).toBeGreaterThanOrEqual(3);
  });

  it('stays safe with long frames too (a throttled or slow page)', () => {
    const network = networkOf('foundations'), check = ground('foundations'), crowd = createCrowd(7);
    for (let step = 0; step < 6_000; step++) {
      stepCrowd(crowd, network, 4, 0.1);
      for (const npc of crowd.npcs) expect(check(npc.x, npc.y, npc.z), `step ${step}`).toBeNull();
    }
  });

  it('walks the same way from the same seed', () => {
    const network = networkOf('foundations');
    const run = (seed: number) => { const crowd = createCrowd(seed); for (let i = 0; i < 2_000; i++) stepCrowd(crowd, network, 5, 1 / 30); return crowd.npcs.map(n => [n.x, n.z, n.mode]); };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });
});

describe('population changes are smooth', () => {
  it('lets figures arrive one at a time at a dock or bridge head, growing in', () => {
    const network = networkOf('foundations'), crowd = createCrowd(3);
    const gateways = network.roads.map((road, index) => ({ road, index })).filter(e => e.road.gateway).map(e => e.index);
    let elapsed = 0, previous = 0;
    while (crowd.npcs.length < 8) {
      stepCrowd(crowd, network, 8, 1 / 30); elapsed += 1 / 30;
      expect(crowd.npcs.length - previous).toBeLessThanOrEqual(1);
      if (crowd.npcs.length > previous) {
        const arrived = crowd.npcs.at(-1)!;
        expect(gateways).toContain(arrived.road);
        expect(arrived.presence).toBeLessThan(0.1);
      }
      previous = crowd.npcs.length;
      if (elapsed > 60) throw new Error('the island never filled');
    }
    // Eight arrivals take at least seven roster steps.
    expect(elapsed).toBeGreaterThanOrEqual(7 * ROSTER_STEP_SECONDS - 0.05);
    for (let i = 0; i < 60; i++) stepCrowd(crowd, network, 8, 1 / 30);
    expect(crowd.npcs.every(npc => npc.presence === 1)).toBe(true);
    expect(crowd.npcs).toHaveLength(8);
  });

  it('lets figures leave one at a time, shrinking out, down to an empty island', () => {
    const network = networkOf('foundations'), crowd = createCrowd(3);
    fillCrowd(crowd, network, 8);
    let previous = 8, elapsed = 0;
    while (crowd.npcs.length) {
      stepCrowd(crowd, network, 2, 1 / 30); elapsed += 1 / 30;
      expect(previous - crowd.npcs.length).toBeLessThanOrEqual(1);
      for (const npc of crowd.npcs) expect(npc.presence).toBeGreaterThanOrEqual(0);
      previous = crowd.npcs.length;
      if (crowd.npcs.length === 2 && crowd.npcs.every(npc => !npc.leaving)) break;
      if (elapsed > 60) throw new Error('the island never emptied');
    }
    expect(crowd.npcs).toHaveLength(2);
    expect(elapsed).toBeGreaterThanOrEqual(5 * 0.5);
    for (let i = 0; i < 300; i++) stepCrowd(crowd, network, 0, 1 / 30);
    expect(crowd.npcs).toEqual([]);
  });

  it('places a still map\'s figures at once and keeps them where they are', () => {
    const network = networkOf('foundations'), check = ground('foundations'), crowd = createCrowd(11);
    fillCrowd(crowd, network, 5);
    expect(crowd.npcs).toHaveLength(5);
    expect(crowd.npcs.every(npc => npc.presence === 1)).toBe(true);
    for (const npc of crowd.npcs) expect(check(npc.x, npc.y, npc.z)).toBeNull();
    const before = crowd.npcs.map(n => [n.id, n.x, n.z]);
    fillCrowd(crowd, network, 7);
    expect(crowd.npcs.slice(0, 5).map(n => [n.id, n.x, n.z])).toEqual(before);
    fillCrowd(crowd, network, 3);
    expect(crowd.npcs.map(n => [n.id, n.x, n.z])).toEqual(before.slice(0, 3));
    fillCrowd(crowd, network, 0);
    expect(crowd.npcs).toEqual([]);
  });
});

describe('a map whose population cannot be asked for (P7: the API or its store is down)', () => {
  const answer = { v: 1, at: 1_000, ttlMs: 150_000, total: 3, hub: 1, regions: { cs: 2, ai: 0 }, islands: { foundations: 2 }, commons: { hub: 1 } };

  it('keeps the last numbers for as long as a silent visitor would have counted, then shows nobody', () => {
    expect(withoutAnswer(answer, 10_000, 10_000 + 150_000)).toBeNull();
    const empty = withoutAnswer(answer, 10_000, 10_000 + 150_001)!;
    expect(empty).toEqual({ v: 1, at: 1_000, ttlMs: 150_000, total: 0, hub: 0, regions: { cs: 0, ai: 0 }, islands: {}, commons: {} });
    // What it shows instead is an answer like any other: nobody anywhere.
    expect(parseSnapshot(empty)).toEqual(empty);
    expect(onlineOf(empty, 'foundations')).toBe(0);
  });

  it('has nothing to take back when there was no answer yet, or the last one was already nobody', () => {
    expect(withoutAnswer(undefined, 0, 1e12)).toBeNull();
    expect(withoutAnswer({ ...answer, total: 0, hub: 0, regions: {}, islands: {}, commons: {} }, 0, 1e12)).toBeNull();
    // Once it showed nobody, it stays quiet until an answer comes.
    const empty = withoutAnswer(answer, 0, 1e9)!;
    expect(withoutAnswer(empty, 0, 2e9)).toBeNull();
  });
});
