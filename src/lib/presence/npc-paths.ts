import { hexKey, worldToHex } from '@/lib/islands/hex';
import { roadProfiles } from '@/lib/islands/hex-terrain';
import { settlementRoads, type HexWorld } from '@/lib/islands/hex-world';
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
}
export interface WalkNetwork {
  islandId: string;
  center: Vec3;
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
  let center: Vec3 | undefined;
  profiles.forEach((profile, index) => {
    if (profile.islandId !== islandId || profile.points.length < 2) return;
    center ??= profile.points[0];
    const cumulative = [0];
    for (let i = 1; i < profile.points.length; i++) {
      const [a, b] = [profile.points[i - 1], profile.points[i]];
      cumulative.push(cumulative[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
    }
    const road = { points: profile.points, cumulative }, total = cumulative.at(-1)!;
    if (total <= RING) return;
    // Walk outward from the ring; the road is usable up to the last sample that is safe.
    let end = RING;
    for (let s = RING; s <= total + 1e-9; s += SAMPLE) {
      const { point, direction } = roadPoint(road, s);
      if (!safe(point, direction)) break;
      end = s;
    }
    if (end - RING < 0.5) return;
    const at = roadPoint(road, RING).point;
    roads.push({ id: profile.routeId, ...road, start: RING, end, entry: Math.atan2(at[2] - profile.points[0][2], at[0] - profile.points[0][0]),
      gateway: plans[index].port !== undefined });
  });
  return { islandId, center: center ?? [0, 0, 0], ring: RING, platform, roads };
}
