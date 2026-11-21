import { hexKey, worldToHex } from '@/lib/islands/hex';
import { roadProfiles } from '@/lib/islands/hex-terrain';
import { LAND_TOP, findTile, portPoint, settlementRoads, tileHeight, type HexBridge, type HexWorld } from '@/lib/islands/hex-world';
import type { Vec3 } from '@/lib/islands/types';

/**
 * Where figures may walk on an island: its own roads, which the layout already keeps on land, out of the woods and
 * clear of buildings (validateHexWorld, hex-terrain.ts roadProfiles). Nothing is drawn here and no model is touched:
 * a walk network is plain data, computed from the same road profiles the map draws.
 *
 * Every road of an island starts at its centre tile. Figures never cross the centre itself (a plaza's guidepost
 * stands there): they walk each road between a ring around the centre and the road's far end, and go round the ring
 * to change roads. A road's far end stops short of the coast (a dock, a bridge head) and of any building footprint.
 */
export interface WalkRoad {
  id: string;
  points: Vec3[];
  /** Horizontal distance from the road's first point to each point. */
  cumulative: number[];
  /** The stretch figures use, as distances along the road: from the ring to where the road stops being safe. */
  start: number; end: number;
  /** The angle (around the centre, from +x toward +z) at which the road meets the ring. */
  entry: number;
  /** Ends at the coast (a dock or a bridge head): where newcomers arrive. */
  gateway: boolean;
  /** How far above the road's points a figure's feet are; unset: a road's paving (ROAD_SURFACE). A bridge's deck. */
  lift?: number;
  /** Open at both ends (a bridge): newcomers arrive at either. Unset: at the far end only, away from the centre. */
  through?: true;
}
export interface WalkNetwork {
  islandId: string;
  center: Vec3;
  /** The radius of the ring round the centre; 0: no ring (a bridge network: each road is walked end to end). */
  ring: number;
  /** A raised plaza around the centre: its radius and the height of its paving above the tile. */
  platform: { radius: number; height: number } | null;
  roads: WalkRoad[];
}
export type KeepOutCircle = readonly [x: number, z: number, radius: number];

/** How far to the side of a road's centreline a figure walks (opposite directions use opposite sides). */
export const LANE = 0.13;
/** The ring's radius around the centre: outside a plaza's guidepost plinth (0.34), inside its paving (1.0). */
export const RING = 0.7;
/** The ring an island gets when something stands in the way of the usual one (a landmark beside its centre). */
export const RING_TIGHT = 0.5;
/** How far to either side of the ring's radius figures walk round it (npc-sim.ts). */
export const RING_LANE = 0.11;
/** Clear ground a figure keeps around itself: to a coast or the woods, and to a building's footprint. */
export const BODY_CLEARANCE = 0.2;
const BUILDING_CLEARANCE = 0.12;
const SAMPLE = 0.05;
/** The paving of a plaza above its tile (hex-plaza.tsx PLATFORM) and of a road above the ground (hex-route-parts.ts ROAD). */
export const PLATFORM_HEIGHT = 0.07;
export const ROAD_SURFACE = 0.035;

/** The point at horizontal distance `s` along a road, and the unit direction of the road there (toward its far end). */
export function roadPoint(road: Pick<WalkRoad, 'points' | 'cumulative'>, s: number): { point: Vec3; direction: [number, number] } {
  const { points, cumulative } = road, last = points.length - 1;
  let i = 1;
  while (i < last && cumulative[i] < s) i++;
  const a = points[i - 1], b = points[i], run = cumulative[i] - cumulative[i - 1];
  const t = run > 0 ? Math.min(1, Math.max(0, (s - cumulative[i - 1]) / run)) : 0;
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
  return { point: [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t], direction: [dx / length, dz / length] };
}

/**
 * The walk network of one island of a world. `keepOut`: building footprints on the map (WorldLayout.natural.keepOut);
 * `platform`: the island's plaza, when it has one. Roads too short to walk are left out; an island with none has an
 * empty network and draws no figures.
 */
export function walkNetwork(world: HexWorld, islandId: string, { keepOut = [], platform = null }: { keepOut?: readonly KeepOutCircle[]; platform?: WalkNetwork['platform'] } = {}): WalkNetwork {
  const settlement = world.settlements.find(s => s.islandId === islandId);
  const walkable = new Set((settlement?.tiles ?? []).filter(t => t.terrain !== 'forest').map(hexKey));
  const onLand = (x: number, z: number) => walkable.has(hexKey(worldToHex(x, z, world.size)));
  /** A figure's whole footprint, on either lane, is on walkable land and off every building. */
  const safe = (point: Vec3, [dx, dz]: [number, number]) => {
    for (const side of [-1, 0, 1]) {
      const x = point[0] - dz * LANE * side, z = point[2] + dx * LANE * side;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (!onLand(x + Math.cos(a) * BODY_CLEARANCE, z + Math.sin(a) * BODY_CLEARANCE)) return false;
      }
      if (keepOut.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + BUILDING_CLEARANCE)) return false;
    }
    return true;
  };
  const plans = settlementRoads(world), profiles = roadProfiles(world);
  const roads: WalkRoad[] = [];
  // Every road of an island starts at its centre tile.
  const center: Vec3 | undefined = profiles.find(profile => profile.islandId === islandId && profile.points.length >= 2)?.points[0];
  /** Both lanes of a ring of this radius are on walkable land and off every building. */
  const ringClear = (radius: number) => {
    if (!center) return false;
    for (let k = 0; k < 48; k++) for (const lane of [-RING_LANE, RING_LANE]) {
      const a = (k / 48) * Math.PI * 2, x = center[0] + Math.cos(a) * (radius + lane), z = center[2] + Math.sin(a) * (radius + lane);
      if (!onLand(x, z) || keepOut.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + BUILDING_CLEARANCE)) return false;
    }
    return true;
  };
  // The usual ring, a tighter one when a landmark stands beside the centre, or none: then each road is walked end to end.
  const ring = [RING, RING_TIGHT].find(ringClear) ?? 0, RING_START = ring || RING_TIGHT;
  profiles.forEach((profile, index) => {
    if (profile.islandId !== islandId || profile.points.length < 2) return;
    const cumulative = [0];
    for (let i = 1; i < profile.points.length; i++) {
      const [a, b] = [profile.points[i - 1], profile.points[i]];
      cumulative.push(cumulative[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
    }
    const road = { points: profile.points, cumulative }, total = cumulative.at(-1)!;
    if (total <= RING_START) return;
    // Walk outward from the ring; the road is usable up to the last sample that is safe.
    let end = RING_START;
    for (let s = RING_START; s <= total + 1e-9; s += SAMPLE) {
      const { point, direction } = roadPoint(road, s);
      if (!safe(point, direction)) break;
      end = s;
    }
    if (end - RING_START < 0.5) return;
    const at = roadPoint(road, RING_START).point;
    roads.push({ id: profile.routeId, ...road, start: RING_START, end, entry: Math.atan2(at[2] - profile.points[0][2], at[0] - profile.points[0][0]),
      gateway: plans[index].port !== undefined });
  });
  return { islandId, center: center ?? [0, 0, 0], ring, platform, roads };
}

/** A bridge's deck above its ports' land (hex-route-parts.ts bridgeParts: the planks' and the slab's top face). */
export const DECK_TOP = { wood: 0.05, stone: 0.06 } as const;
/** How far from a bridge's ends its figures stay: off the land's edge, where an island's own figures do not come. */
export const BRIDGE_MARGIN = 0.3;
/** The shortest bridge figures walk (its usable stretch). */
const BRIDGE_MIN = 1;

/**
 * The walk network of a set of bridges: one road a bridge, along its deck from port to port (the same two points, at
 * the same heights, the bridge is drawn between), no ring. Both lanes are inside the rails (0.4 either side, LANE is
 * 0.13). Figures arrive at either end, walk across, stand a while and walk back: a bridge belongs to no island.
 */
export function bridgeNetwork(world: HexWorld, bridges: readonly HexBridge[], id: string): WalkNetwork {
  const roads: WalkRoad[] = bridges.flatMap(bridge => {
    const from = findTile(world, bridge.from.islandId, bridge.from.tile), to = findTile(world, bridge.to.islandId, bridge.to.tile);
    if (!from || !to) return [];
    const a = portPoint(world, bridge.from), b = portPoint(world, bridge.to), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length - BRIDGE_MARGIN * 2 < BRIDGE_MIN) return [];
    return [{ id: bridge.id, points: [[a[0], LAND_TOP + tileHeight(from), a[1]], [b[0], LAND_TOP + tileHeight(to), b[1]]] as Vec3[], cumulative: [0, length],
      start: BRIDGE_MARGIN, end: length - BRIDGE_MARGIN, entry: 0, gateway: true, through: true as const, lift: DECK_TOP[bridge.kind] + 0.005 }];
  });
  const first = roads[0]?.points;
  return { islandId: id, center: first ? [(first[0][0] + first[1][0]) / 2, (first[0][1] + first[1][1]) / 2, (first[0][2] + first[1][2]) / 2] : [0, 0, 0], ring: 0, platform: null, roads };
}

/** A sphere in map coordinates. */
export interface BoundingSphere { center: Vec3; radius: number }
/** A lane's width and a figure's height beyond the centrelines. */
const BOUNDS_MARGIN = 0.6;

/**
 * Spheres (map coordinates) that together hold every place a network's figures can be, head included: one a road
 * (its usable stretch) and one for the ring. For view culling: a network is in the camera's view when any of them is.
 * One sphere round the whole network would reach far beyond an island with long roads, and keep it "in view" from
 * the next island's close-up.
 */
export function networkBounds(network: WalkNetwork): BoundingSphere[] {
  const spheres: BoundingSphere[] = [];
  for (const road of network.roads) {
    const points: Vec3[] = [];
    for (let s = road.start; s < road.end; s += 0.25) points.push(roadPoint(road, s).point);
    points.push(roadPoint(road, road.end).point);
    const min = [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))), max = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])));
    spheres.push({ center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + BOUNDS_MARGIN });
  }
  if (network.ring > 0 && network.roads.length) spheres.push({ center: network.center, radius: network.ring + RING_LANE + BOUNDS_MARGIN });
  return spheres;
}
