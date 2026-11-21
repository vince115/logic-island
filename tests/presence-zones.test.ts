import { afterEach, describe, expect, it, vi } from 'vitest';
import { subjectIslands } from '@/content/world';
import { REGION_IDS } from '@/content/world/types';
import { hexKey, hexToWorld, worldToHex } from '@/lib/islands/hex';
import { glbFootprints, type WorldLayout } from '@/lib/islands/hex-layout';
import { tileTop } from '@/lib/islands/hex-terrain';
import { LAND_TOP, findTile, portPoint, tileHeight } from '@/lib/islands/hex-world';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { regionLayout } from '@/lib/islands/regions/region-layouts';
import { regionScene } from '@/lib/p9/region-scene';
import { resolvePlace } from '@/lib/presence/locations';
import { mapPopulation } from '@/lib/presence/map-population';
import { BRIDGE_MARGIN, DECK_TOP, LANE, RING, RING_TIGHT, bridgeNetwork, networkBounds, walkNetwork, type KeepOutCircle } from '@/lib/presence/npc-paths';
import { createCrowd, fillCrowd, stepCrowd, targetPose } from '@/lib/presence/npc-sim';
import { CAP_LIMITS, ISLAND_CAPS, MAP_BUDGET, capFor, npcZones, walkLength, zoneOnline, zoneTargets, type NpcZone } from '@/lib/presence/npc-zones';
import { HUB_KEY, mockSnapshot, tierCap } from '@/lib/presence/population';
import { LANDMARK_RADIUS, mapObstacles } from '@/components/presence/map-obstacles';
import { landscapeFootprints } from '@/components/p9/p9-landscapes';
import { HUB } from '@/lib/presence/locations';

/*
 * P3 (figures on every archipelago): the zones of every hex map the site has. One function gives them all, so the
 * tests walk every map the same way: the home map, the five region maps of the regional world (/world/<region>) and
 * the five P9 region scenes (/<region>). Every position a figure can take is checked against the map's own data: its
 * island's land, its woods, its buildings' footprints, its bridges' decks.
 */

const regionsOf = (layout: WorldLayout) => Object.fromEntries(layout.world.settlements.flatMap(s => {
  const location = resolvePlace({ t: 'island', id: s.islandId });
  return location.island === s.islandId ? [[s.islandId, location.region]] : [];
}));

interface MapCase { name: string; layout: WorldLayout; zones: NpcZone[]; footprints: KeepOutCircle[] }
function mapCase(name: string, layout: WorldLayout, own?: KeepOutCircle[]): MapCase {
  const obstacles = mapObstacles(layout);
  return { name, layout, footprints: [...(own ?? layout.natural?.keepOut ?? []), ...obstacles], zones: npcZones(layout, { regions: regionsOf(layout), obstacles, footprints: own }) };
}
const HOME = mapCase('home', islandsHomeWorld);
const P8 = REGION_IDS.map(id => mapCase(`world/${id}`, regionLayout(id).layout));
const P9 = REGION_IDS.map(id => {
  const scene = regionScene(id), layout = scene.region.layout;
  return mapCase(`p9/${id}`, layout, [...glbFootprints(layout.world, layout.glb), ...landscapeFootprints(layout.world, scene.landscapes, id)]);
});
const MAPS = [HOME, ...P8, ...P9];

/** What a figure's position on an island must satisfy, from the map's own data. */
function islandGround(map: MapCase, islandId: string) {
  const { world } = map.layout, settlement = world.settlements.find(s => s.islandId === islandId)!;
  const tiles = new Map(settlement.tiles.map(t => [hexKey(t), t]));
  const at = (x: number, z: number) => tiles.get(hexKey(worldToHex(x, z, world.size)));
  const [cx, cz] = hexToWorld(settlement.center, world.size);
  const near = map.footprints.filter(([x, z, r]) => Math.hypot(x - cx, z - cz) - r < 14);
  return (x: number, y: number, z: number, clearance: number): string | null => {
    const where = `(${x.toFixed(2)}, ${z.toFixed(2)})`, tile = at(x, z);
    if (!tile) return `${where} is in the sea`;
    if (tile.terrain === 'forest') return `${where} is in the woods`;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, beside = at(x + Math.cos(a) * clearance, z + Math.sin(a) * clearance);
      if (!beside || beside.terrain === 'forest') return `${where} is within ${clearance} of the coast or the woods`;
    }
    if (near.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r)) return `${where} is inside a building's footprint`;
    const lowest = Math.min(tileTop(tile), ...[0, 1, 2, 3, 4, 5].map(k => { const a = (k / 6) * Math.PI * 2, n = at(x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1); return n ? tileTop(n) : Infinity; }));
    return y >= lowest - 1e-6 ? null : `${where} is underground (y ${y.toFixed(3)})`;
  };
}

/** What a figure's position on a region's commons must satisfy: on one of its bridges' decks, between the rails. */
function deckGround(map: MapCase, zone: NpcZone) {
  const { world } = map.layout;
  const decks = zone.network.roads.map(road => {
    const bridge = world.bridges.find(b => b.id === road.id)!;
    const a = portPoint(world, bridge.from), b = portPoint(world, bridge.to), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ya = LAND_TOP + tileHeight(findTile(world, bridge.from.islandId, bridge.from.tile)!), yb = LAND_TOP + tileHeight(findTile(world, bridge.to.islandId, bridge.to.tile)!);
    return { a, ux: (b[0] - a[0]) / length, uz: (b[1] - a[1]) / length, length, ya, yb, top: DECK_TOP[bridge.kind] };
  });
  return (x: number, y: number, z: number): string | null => {
    const where = `(${x.toFixed(2)}, ${z.toFixed(2)})`;
    const fits = decks.some(d => {
      const along = (x - d.a[0]) * d.ux + (z - d.a[1]) * d.uz, across = Math.abs(-(x - d.a[0]) * d.uz + (z - d.a[1]) * d.ux);
      // The rails stand 0.4 from the centreline (hex-route-parts.ts); a figure is 0.11 wide at its feet.
      if (along < 0.05 || along > d.length - 0.05 || across > 0.4 - 0.025 - 0.11) return false;
      const deck = d.ya + (d.yb - d.ya) * (along / d.length) + d.top;
      return Math.abs(y - deck) < 0.04;
    });
    return fits ? null : `${where} at y ${y.toFixed(3)} is not on a bridge deck of ${zone.id}`;
  };
}
const checkOf = (map: MapCase, zone: NpcZone) => {
  if (zone.kind === 'commons') { const check = deckGround(map, zone); return (x: number, y: number, z: number) => check(x, y, z); }
  const check = islandGround(map, zone.id);
  return check;
};

describe('coverage: every island of every map has a place for its visitors', () => {
  it('gives each of the five archipelagos\' 29 subject islands, and the hub island, a zone on every map that draws it', () => {
    for (const map of MAPS) {
      const islands = map.layout.world.settlements.map(s => s.islandId), zoned = map.zones.filter(z => z.kind === 'island').map(z => z.id);
      expect(zoned, map.name).toEqual(islands);
      expect(new Set(map.zones.map(z => z.id)).size, map.name).toBe(map.zones.length);
      for (const zone of map.zones) expect(zone.network.roads.length, `${map.name} ${zone.id}`).toBeGreaterThan(0);
    }
    for (const maps of [P8, P9]) {
      const drawn = maps.flatMap(map => map.zones.filter(z => z.kind === 'island').map(z => z.id)).sort();
      expect(drawn).toEqual(subjectIslands.map(island => island.id).sort());
      expect(drawn).toHaveLength(29);
    }
    expect(HOME.zones.filter(z => z.kind === 'island').map(z => z.id)).toEqual(['foundations', 'structures', 'algorithms', 'labs', 'databases']);
  });

  it('gives every region one commons, made of the bridges between its own islands', () => {
    for (const [i, id] of REGION_IDS.entries()) for (const map of [P8[i], P9[i]]) {
      const commons = map.zones.filter(z => z.kind === 'commons');
      expect(commons.map(z => [z.id, z.key]), map.name).toEqual([[`commons-${id}`, id]]);
      // Every bridge of a region map joins two islands of that region.
      expect(commons[0].network.roads.map(r => r.id).sort(), map.name).toEqual(map.layout.world.bridges.map(b => b.id).sort());
      expect(commons[0].network.ring).toBe(0);
    }
    // The home map: the bridges between the CS islands, and the one to the Interactive Lab Island, which is the hub's.
    const home = Object.fromEntries(HOME.zones.filter(z => z.kind === 'commons').map(z => [z.key, z.network.roads.map(r => r.id).sort()]));
    expect(home).toEqual({ cs: ['foundations-structures', 'structures-algorithms', 'structures-databases'], [HUB_KEY]: ['algorithms-labs'] });
    expect(HUB_KEY).toBe(HUB);
  });

  it('draws no commons without the islands\' regions: a bridge is nobody\'s by default', () => {
    expect(npcZones(islandsHomeWorld).filter(z => z.kind === 'commons')).toEqual([]);
    expect(npcZones(islandsHomeWorld, { regions: { foundations: 'cs' } }).filter(z => z.kind === 'commons')).toEqual([]);
  });
});

describe('each zone has its own cap', () => {
  it('follows from how much road the zone has, within limits, and is set by hand where the data says so', () => {
    const caps = new Set<number>();
    for (const map of MAPS) for (const zone of map.zones) {
      const { min, max } = CAP_LIMITS[zone.kind];
      expect(zone.cap, `${map.name} ${zone.id}`).toBeGreaterThanOrEqual(min);
      expect(zone.cap, `${map.name} ${zone.id}`).toBeLessThanOrEqual(max);
      expect(zone.cap).toBe(ISLAND_CAPS[zone.id] ?? capFor(zone.network, zone.kind));
      // A figure has room: never more than one for every 1.3 units of road, even at the floor.
      expect(walkLength(zone.network) / zone.cap, `${map.name} ${zone.id}`).toBeGreaterThan(1.3);
      caps.add(zone.cap);
    }
    // Not one number for all: a one-road island draws two, the foundations island eight.
    expect(HOME.zones.find(z => z.id === 'labs')!.cap).toBe(2);
    expect(HOME.zones.find(z => z.id === 'foundations')!.cap).toBe(8);
    expect(caps.size).toBeGreaterThanOrEqual(4);
    expect(npcZones(islandsHomeWorld, { caps: { labs: 5 } }).find(z => z.id === 'labs')!.cap).toBe(5);
  });
});

describe('zoneTargets: who is drawn where', () => {
  const zones = P8[0].zones, index = (id: string) => zones.findIndex(z => z.id === id);
  const snapshot = (islands: Record<string, number>, commons: Record<string, number>) => mockSnapshot(0, islands, commons);

  it('draws a region\'s own visitors on its bridges and never on an island', () => {
    const targets = zoneTargets(zones, snapshot({}, { cs: 5 }), 'full');
    for (const [i, zone] of zones.entries()) expect(targets[i], zone.id).toBe(zone.kind === 'commons' ? 5 : 0);
    // And the other way round: an island's visitors are its own.
    const own = zoneTargets(zones, snapshot({ structures: 3 }, {}), 'full');
    for (const [i, zone] of zones.entries()) expect(own[i], zone.id).toBe(zone.id === 'structures' ? 3 : 0);
    // Another region's commons and islands draw nothing on this map; neither does the hub's.
    expect(zoneTargets(zones, snapshot({ 'machine-learning': 9, labs: 9 }, { ai: 9, hub: 9 }), 'full').every(n => n === 0)).toBe(true);
    expect(zoneOnline(zones[index('commons-cs')], snapshot({ foundations: 50 }, {}))).toBe(0);
  });

  it('reads a snapshot from before the commons were published as no commons at all', () => {
    const { commons: _commons, ...old } = snapshot({ foundations: 2 }, { cs: 4 });
    void _commons;
    const targets = zoneTargets(zones, old, 'full');
    expect(targets[index('commons-cs')]).toBe(0);
    expect(targets[index('foundations')]).toBe(2);
    expect(zoneTargets(zones, null, 'full').every(n => n === 0)).toBe(true);
  });

  it('stops at each zone\'s cap, halves it on a phone and keeps the whole map under its budget', () => {
    const crowded = snapshot(Object.fromEntries(zones.filter(z => z.kind === 'island').map(z => [z.key, 10_000])), { cs: 10_000 });
    const full = zoneTargets(zones, crowded, 'full'), low = zoneTargets(zones, crowded, 'low');
    for (const [i, zone] of zones.entries()) {
      expect(full[i]).toBeLessThanOrEqual(zone.cap);
      expect(low[i]).toBeLessThanOrEqual(tierCap(zone.cap, 'low'));
      expect(low[i]).toBeLessThanOrEqual(full[i]);
      // Nobody loses all of their figures to the budget.
      expect(low[i]).toBeGreaterThan(0);
    }
    const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
    expect(sum(full)).toBeLessThanOrEqual(MAP_BUDGET.full);
    expect(sum(low)).toBeLessThanOrEqual(MAP_BUDGET.low);
    expect(sum(low)).toBeLessThan(sum(full));
    // Under the budget nothing is taken away: a quiet island keeps what it has.
    const quiet = snapshot({ networks: 1, foundations: 10_000 }, {});
    expect(zoneTargets(zones, quiet, 'low')[index('networks')]).toBe(1);
    expect(zoneTargets(zones, quiet, 'low')[index('foundations')]).toBe(4);
  });
});

describe('walkable paths: nothing a figure can stand on is sea, woods or a building', () => {
  it('keeps every lane of every island road, and its ring, on dry open land clear of footprints (every map)', () => {
    let samples = 0;
    for (const map of MAPS) for (const zone of map.zones.filter(z => z.kind === 'island')) {
      const check = islandGround(map, zone.id), { network } = zone;
      for (const [index, road] of network.roads.entries()) for (let s = road.start; s <= road.end; s += 0.05) for (const dir of [1, -1] as const) {
        const pose = targetPose(network, { mode: 'road', road: index, s, dir, angle: 0, toRoad: 0, arc: 1 } as never);
        expect(check(pose.x, pose.y, pose.z, 0.19), `${map.name} ${road.id} at ${s.toFixed(2)}`).toBeNull();
        samples++;
      }
      for (let a = 0; a < Math.PI * 2; a += 0.1) for (const arc of [1, -1] as const) {
        const pose = targetPose(network, { mode: 'ring', road: 0, s: 0, dir: 1, angle: a, toRoad: 0, arc } as never);
        expect(check(pose.x, pose.y, pose.z, 0.19), `${map.name} ${zone.id} ring`).toBeNull();
      }
    }
    expect(samples).toBeGreaterThan(20_000);
  });

  it('keeps every lane of every bridge on its deck, inside the rails and off both islands\' land', () => {
    for (const map of MAPS) for (const zone of map.zones.filter(z => z.kind === 'commons')) {
      const check = deckGround(map, zone), { network } = zone;
      for (const [index, road] of network.roads.entries()) {
        expect(road.start).toBe(BRIDGE_MARGIN);
        expect(road.end).toBeCloseTo(road.cumulative[1] - BRIDGE_MARGIN, 9);
        expect(road.gateway).toBe(true);
        for (let s = road.start; s <= road.end; s += 0.05) for (const dir of [1, -1] as const) {
          const pose = targetPose(network, { mode: 'road', road: index, s, dir, angle: 0, toRoad: 0, arc: 1 } as never);
          expect(check(pose.x, pose.y, pose.z), `${map.name} ${road.id} at ${s.toFixed(2)}`).toBeNull();
          // A bridge figure never stands on an island: its place is not a land tile's, or is the very edge of one.
          const tile = map.layout.world.settlements.flatMap(s2 => s2.tiles).find(t => hexKey(t) === hexKey(worldToHex(pose.x, pose.z, map.layout.world.size)));
          if (tile) expect(Math.min(s - 0, road.cumulative[1] - s), `${map.name} ${road.id} on land at ${s.toFixed(2)}`).toBeLessThan(BRIDGE_MARGIN + 0.5);
        }
      }
      expect(LANE + 0.11).toBeLessThan(0.4);
    }
  });

  it('knows where each map\'s buildings stand', () => {
    // The home map: placeholder pieces of three islands and the database island's transitional art; the foundations
    // island's buildings are its GLB's own footprints (the layout's keep-out).
    const circles = mapObstacles(islandsHomeWorld);
    expect(circles.every(c => c[2] === LANDMARK_RADIUS)).toBe(true);
    const owner = (c: KeepOutCircle) => islandsHomeWorld.world.settlements.find(s => s.tiles.some(t => hexKey(t) === hexKey(worldToHex(c[0], c[1], 1.25))))!.islandId;
    const count: Record<string, number> = {};
    for (const circle of circles) count[owner(circle)] = (count[owner(circle)] ?? 0) + 1;
    expect(count).toEqual({ structures: 3, algorithms: 4, labs: 4, databases: 4 });
    expect(islandsHomeWorld.natural!.keepOut.length).toBeGreaterThan(0);
    // A region map's planned islands stand in mist with nothing built; a P9 scene's landmarks give their own footprints.
    for (const [i, id] of REGION_IDS.entries()) {
      if (id !== 'cs') expect(mapObstacles(P8[i].layout), id).toEqual([]);
      expect(mapObstacles(P9[i].layout), id).toEqual([]);
      expect(P9[i].footprints.length, id).toBeGreaterThan(100);
      for (const [x, z, r] of P9[i].footprints) expect(Number.isFinite(x + z + r) && r > 0 && r < 2).toBe(true);
    }
  });

  it('gives an island a tighter ring, or none, when something stands beside its centre', () => {
    const { world, natural } = islandsHomeWorld, settlement = world.settlements.find(s => s.islandId === 'structures')!;
    const [cx, cz] = hexToWorld(settlement.center, world.size), options = { platform: null };
    const open = walkNetwork(world, 'structures', { ...options, keepOut: natural!.keepOut });
    expect(open.ring).toBe(RING);
    // A post just outside the usual ring's outer lane: the tighter ring passes inside it.
    const tight = walkNetwork(world, 'structures', { ...options, keepOut: [[cx + 0.95, cz, 0.05]] });
    expect(tight.ring).toBe(RING_TIGHT);
    for (const road of tight.roads) expect(road.start).toBe(RING_TIGHT);
    // Something on the ring itself, away from every road: no ring at all, and each road is walked end to end.
    const blocked = (angle: number): KeepOutCircle => [cx + Math.cos(angle) * 0.55, cz + Math.sin(angle) * 0.55, 0.1];
    const free = [...Array(72).keys()].map(k => (k / 72) * Math.PI * 2).find(angle => walkNetwork(world, 'structures', { ...options, keepOut: [blocked(angle)] }).roads.length === open.roads.length)!;
    const none = walkNetwork(world, 'structures', { ...options, keepOut: [blocked(free)] });
    expect(none.ring).toBe(0);
    const crowd = createCrowd(12);
    for (let step = 0; step < 6_000; step++) {
      stepCrowd(crowd, none, 5, 0.1);
      for (const npc of crowd.npcs) {
        expect(npc.mode).not.toBe('ring');
        expect(Math.hypot(npc.x - blocked(free)[0], npc.z - blocked(free)[1])).toBeGreaterThan(0.1 + 0.11);
      }
    }
    // Every map as it is drawn: which ring each island got.
    const rings: Record<string, number> = {};
    for (const map of MAPS) for (const zone of map.zones.filter(z => z.kind === 'island')) rings[zone.network.ring] = (rings[zone.network.ring] ?? 0) + 1;
    expect(Object.keys(rings).map(Number).every(ring => [RING, RING_TIGHT, 0].includes(ring))).toBe(true);
    expect(rings[RING]).toBeGreaterThan(50);
  });

  it('holds every figure, head included, inside one of its zone\'s bounding spheres', () => {
    let tight = 0, zones = 0;
    for (const map of MAPS) for (const zone of map.zones) {
      expect(zone.bounds).toEqual(networkBounds(zone.network));
      expect(zone.bounds).toHaveLength(zone.network.roads.length + (zone.network.ring > 0 ? 1 : 0));
      const inside = (pose: { x: number; y: number; z: number }) => [0, 0.45].every(up => zone.bounds.some(({ center, radius }) => Math.hypot(pose.x - center[0], pose.y + up - center[1], pose.z - center[2]) <= radius));
      for (const [index, road] of zone.network.roads.entries()) for (let s = road.start; s <= road.end + 1e-9; s += 0.1) for (const dir of [1, -1] as const)
        expect(inside(targetPose(zone.network, { mode: 'road', road: index, s: Math.min(s, road.end), dir, angle: 0, toRoad: 0, arc: 1 } as never)), `${map.name} ${zone.id} ${road.id} at ${s.toFixed(1)}`).toBe(true);
      if (zone.network.ring > 0) for (let a = 0; a < Math.PI * 2; a += 0.2) for (const arc of [1, -1] as const)
        expect(inside(targetPose(zone.network, { mode: 'ring', road: 0, s: 0, dir: 1, angle: a, toRoad: 0, arc } as never)), `${map.name} ${zone.id} ring`).toBe(true);
      // Tight: no sphere is much larger than the road it holds (one sphere round a whole island would reach the next island).
      zones++;
      if (zone.bounds.every(({ radius }) => radius <= 5)) tight++;
    }
    expect(tight).toBe(zones);
  });
});

describe('the walk, on every zone of every map', () => {
  it('keeps a full zone on its ground for three minutes: islands on land, commons on their decks', () => {
    for (const map of MAPS) for (const [z, zone] of map.zones.entries()) {
      const check = checkOf(map, zone), crowd = createCrowd(977 + z);
      const modes = new Set<string>();
      for (let step = 0; step < 3 * 60 * 10; step++) {
        stepCrowd(crowd, zone.network, zone.cap, 0.1);
        for (const npc of crowd.npcs) {
          if (!Number.isFinite(npc.x + npc.y + npc.z + npc.yaw)) throw new Error(`${map.name} ${zone.id}: figure ${npc.id} is nowhere`);
          const problem = check(npc.x, npc.y, npc.z, 0.12);
          if (problem) throw new Error(`${map.name} ${zone.id}: figure ${npc.id} at step ${step} (${npc.mode}): ${problem}`);
          modes.add(npc.mode);
        }
      }
      expect(crowd.npcs.filter(npc => !npc.leaving), `${map.name} ${zone.id}`).toHaveLength(zone.cap);
      // A commons has no ring: its figures cross a bridge, stand and turn back. An island with one road has no use for one either.
      expect(modes.has('ring'), `${map.name} ${zone.id}`).toBe(zone.network.ring > 0 && zone.network.roads.length > 1);
      expect(modes.has('pause'), `${map.name} ${zone.id}`).toBe(true);
    }
  });

  it('lets bridge figures arrive at either end and stand at both', () => {
    const { world } = islandsHomeWorld, network = bridgeNetwork(world, world.bridges, 'commons-test'), crowd = createCrowd(4);
    expect(network.roads).toHaveLength(world.bridges.length);
    const arrivals = new Set<string>(), stands = new Set<string>();
    for (let step = 0; step < 20 * 60 * 10; step++) {
      const before = crowd.npcs.length;
      stepCrowd(crowd, network, step % 400 < 200 ? 6 : 2, 0.1);
      if (crowd.npcs.length > before) { const npc = crowd.npcs.at(-1)!, road = network.roads[npc.road]; arrivals.add(npc.s - road.start < 0.1 ? 'near' : road.end - npc.s < 0.1 ? 'far' : 'middle'); }
      for (const npc of crowd.npcs) if (npc.mode === 'pause') { const road = network.roads[npc.road]; stands.add(npc.s < (road.start + road.end) / 2 ? 'near' : 'far'); }
    }
    expect([...arrivals].sort()).toEqual(['far', 'near']);
    expect([...stands].sort()).toEqual(['far', 'near']);
    // A still map's bridge figures are placed on the deck at once.
    const still = createCrowd(6);
    fillCrowd(still, network, 4);
    const check = deckGround(HOME, { ...HOME.zones.find(z2 => z2.id === 'commons-cs')!, network });
    for (const npc of still.npcs) expect(check(npc.x, npc.y, npc.z)).toBeNull();
    // A bridge too short to walk gives no road, and a world without bridges an empty network.
    expect(bridgeNetwork(world, [], 'none').roads).toEqual([]);
  });
});

describe('mapPopulation: what a page hands its map', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is nothing without a population source, so the map never loads the figures\' code', () => {
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', '');
    expect(mapPopulation(['foundations'])).toBeUndefined();
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'live');
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '');
    expect(mapPopulation(['foundations'])).toBeUndefined();
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'mock');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(mapPopulation(['foundations'])).toBeUndefined();
  });

  it('names each island\'s region as the presence API resolves it, and leaves out what the registry does not know', () => {
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'mock');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(mapPopulation(['foundations', 'structures', 'algorithms', 'labs', 'databases', 'atlantis'])).toEqual({ source: 'mock',
      regions: { foundations: 'cs', structures: 'cs', algorithms: 'cs', labs: HUB_KEY, databases: 'cs' } });
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'live');
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
    for (const id of REGION_IDS) {
      const ids = regionLayout(id).layout.world.settlements.map(s => s.islandId), config = mapPopulation(ids)!;
      expect(config.source).toBe('live');
      expect(Object.keys(config.regions).sort()).toEqual([...ids].sort());
      expect(new Set(Object.values(config.regions))).toEqual(new Set([id]));
    }
  });
});
