import type { WorldLayout } from '@/lib/islands/hex-layout';
import { hexToWorld } from '@/lib/islands/hex';
import type { HexBridge } from '@/lib/islands/hex-world';
import type { Vec3 } from '@/lib/islands/types';
import type { PopulationSnapshot } from './engine';
import { PLATFORM_HEIGHT, bridgeNetwork, networkBounds, walkNetwork, type KeepOutCircle, type WalkNetwork } from './npc-paths';
import { HUB_KEY, npcCountFor, tierCap, type DeviceTier } from './population';

/**
 * P3: where figures walk on a map, as data. One function reads any hex map (the home map, a region's map of the
 * regional world, a P9 region scene) and gives its zones; nothing here names an island, and no island has code of its
 * own. A zone is a walk network with a cap and the key of the number that fills it:
 *
 *   island   one per island that has a road to walk: the island's own roads (npc-paths.ts walkNetwork), filled by the
 *            island's online count (snapshot.islands[id]);
 *   commons  one per region on the map: the bridges between that region's islands (npc-paths.ts bridgeNetwork),
 *            filled by the region's visitors who are on no island (snapshot.commons[region]). A bridge belongs to no
 *            island, so a visitor of the region is never drawn as a visitor of one of its islands. A bridge that
 *            lands on a hub island (the Interactive Lab Island on the home map) is the hub's.
 *
 * Spawn points and walkable paths are derived from the map's own data: a road's far end at a dock or a bridge head is
 * where figures arrive, the road between the plaza ring and the last safe point is where they walk. What stands on a
 * map and is not in its layout (procedural landmarks) comes in as `obstacles`.
 */
export interface NpcZone {
  /** Unique on its map: the island's id, or `commons-<region>`. */
  id: string;
  kind: 'island' | 'commons';
  /** The key of the zone's number in a snapshot: an island id (`islands`), or a region id or `hub` (`commons`). */
  key: string;
  network: WalkNetwork;
  /** The most figures the zone draws (desktop; phones draw half, population.ts tierCap). */
  cap: number;
  /** A sphere (map coordinates) around everywhere its figures can be: for view culling. */
  bounds: { center: Vec3; radius: number };
}

export interface ZoneOptions {
  /** Each island's region id, or `hub` (population.ts HUB_KEY). Without an entry an island's bridges are no commons. */
  regions?: Readonly<Record<string, string>>;
  /** Footprints on the map beyond the layout's own (WorldLayout.natural.keepOut): landmarks drawn by code. */
  obstacles?: readonly KeepOutCircle[];
  /**
   * In place of the layout's own keep-out circles, for a layout whose circles are not footprints (a P9 scene keeps its
   * trees a whole tile away from every landmark site; figures only need to stay off what stands there).
   */
  footprints?: readonly KeepOutCircle[];
  /** Caps set by hand, by island id; every other zone's follows from how much road it has (capFor). */
  caps?: Readonly<Record<string, number>>;
}

/** Caps set by hand. The foundations island keeps the prototype's eight. */
export const ISLAND_CAPS: Readonly<Record<string, number>> = { foundations: 8 };
export const CAP_LIMITS = { island: { min: 2, max: 8 }, commons: { min: 2, max: 6 } } as const;
/**
 * Road a figure needs to itself (map units): a zone's cap is its walkable length over this. An island with one road
 * (4.5 units) draws two figures at most, one with two roads and the ring five, one with four roads eight.
 */
export const WALK_PER_FIGURE = 2.6;
/** The most figures a whole map draws at once, every zone together. */
export const MAP_BUDGET: Readonly<Record<DeviceTier, number>> = { full: 40, low: 16 };
/** Footprints farther than this from an island's centre cannot touch its roads (an island is at most four tiles deep). */
const OBSTACLE_REACH = 14;

/** How much road a network's figures have: every road's usable stretch, and the ring when there is more than one. */
export function walkLength(network: WalkNetwork): number {
  const roads = network.roads.reduce((sum, road) => sum + (road.end - road.start), 0);
  return roads + (network.ring > 0 && network.roads.length > 1 ? Math.PI * 2 * network.ring : 0);
}
export function capFor(network: WalkNetwork, kind: NpcZone['kind']): number {
  const { min, max } = CAP_LIMITS[kind];
  return Math.min(max, Math.max(min, Math.floor(walkLength(network) / WALK_PER_FIGURE)));
}

export function npcZones(layout: WorldLayout, { regions = {}, obstacles = [], footprints: own, caps = ISLAND_CAPS }: ZoneOptions = {}): NpcZone[] {
  const { world, natural } = layout, footprints = [...(own ?? natural?.keepOut ?? []), ...obstacles], zones: NpcZone[] = [];
  for (const settlement of world.settlements) {
    const [cx, cz] = hexToWorld(settlement.center, world.size);
    const plaza = natural?.plazas.find(p => p.islandId === settlement.islandId);
    const network = walkNetwork(world, settlement.islandId, {
      keepOut: footprints.filter(([x, z, r]) => Math.hypot(x - cx, z - cz) - r < OBSTACLE_REACH),
      platform: plaza ? { radius: plaza.radius, height: PLATFORM_HEIGHT } : null,
    });
    if (!network.roads.length) continue;
    zones.push({ id: settlement.islandId, kind: 'island', key: settlement.islandId, network, cap: caps[settlement.islandId] ?? capFor(network, 'island'), bounds: networkBounds(network) });
  }
  // The bridges between a region's islands are that region's commons; a bridge to a hub island is the hub's.
  const commons = new Map<string, HexBridge[]>();
  for (const bridge of world.bridges) {
    const from = regions[bridge.from.islandId], to = regions[bridge.to.islandId];
    const region = !from || !to ? null : from === to ? from : from === HUB_KEY || to === HUB_KEY ? HUB_KEY : null;
    if (region) commons.set(region, [...(commons.get(region) ?? []), bridge]);
  }
  for (const [region, bridges] of commons) {
    const network = bridgeNetwork(world, bridges, `commons-${region}`);
    if (network.roads.length) zones.push({ id: network.islandId, kind: 'commons', key: region, network, cap: capFor(network, 'commons'), bounds: networkBounds(network) });
  }
  return zones;
}

/** A zone's online population in a snapshot (0 when there is none, or no snapshot yet). */
export function zoneOnline(zone: Pick<NpcZone, 'kind' | 'key'>, snapshot: PopulationSnapshot | null): number {
  const count = zone.kind === 'island' ? snapshot?.islands[zone.key] : snapshot?.commons?.[zone.key];
  return Number.isFinite(count) ? Math.max(0, Math.floor(count as number)) : 0;
}

/**
 * How many figures each zone draws for a snapshot: population.ts npcCountFor under the zone's cap for this device,
 * and all zones together under the map's budget. Over the budget the fullest zone gives up a figure at a time (the
 * later zone of two equally full ones), so quiet islands keep theirs.
 */
export function zoneTargets(zones: readonly NpcZone[], snapshot: PopulationSnapshot | null, tier: DeviceTier): number[] {
  const targets = zones.map(zone => npcCountFor(zoneOnline(zone, snapshot), tierCap(zone.cap, tier)));
  for (let over = targets.reduce((sum, n) => sum + n, 0) - MAP_BUDGET[tier]; over > 0; over--) {
    let fullest = 0;
    targets.forEach((n, i) => { if (n >= targets[fullest]) fullest = i; });
    targets[fullest] -= 1;
  }
  return targets;
}
