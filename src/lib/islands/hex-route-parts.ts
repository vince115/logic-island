import { roadProfiles } from './hex-terrain';
import { LAND_TOP, findTile, portPoint, tileHeight, type HexWorld } from './hex-world';
import type { Vec3 } from './types';

/**
 * Static road and bridge pieces as plain data (D.2b scale refinement), so the scene can merge or
 * instance them instead of creating one mesh per road segment and per plank. Same layout as the
 * per-mesh HexRoads/HexBridges used by the A2 preview.
 */
export interface BoxPart { position: Vec3; yaw: number; pitch: number; size: Vec3; color: string }
export interface DiscPart { position: Vec3; radius: number }
export interface ArchPart { position: Vec3; yaw: number; radius: number; color: string }

export const ROAD = { width: 0.5, thickness: 0.03, lift: 0.018, color: '#e5dcc6' } as const;
const BRIDGE = {
  wood: { deck: '#b07a4a', plankDark: '#a16d40', rail: '#7c5434', posts: 5 },
  stone: { deck: '#eeeae1', rail: '#ffffff', posts: 7 },
} as const;

/** Road strips (sloped along ramps) and the round joints that close their turns. */
export function roadParts(world: HexWorld): { boxes: BoxPart[]; joints: DiscPart[] } {
  const boxes: BoxPart[] = [], joints: DiscPart[] = [];
  for (const road of roadProfiles(world)) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], run = Math.hypot(dx, dz);
    boxes.push({
      position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + ROAD.lift, (a[2] + b[2]) / 2],
      yaw: -Math.atan2(dz, dx), pitch: Math.atan2(dy, run), size: [Math.hypot(run, dy), ROAD.thickness, ROAD.width], color: ROAD.color,
    });
    joints.push({ position: [b[0], b[1] + ROAD.lift, b[2]], radius: ROAD.width / 2 });
  }
  return { boxes, joints };
}

/** Bridge decks, planks, rails and posts as boxes; stone bridges also get a half-ring arch. */
export function bridgeParts(world: HexWorld): { boxes: BoxPart[]; arches: ArchPart[] } {
  const boxes: BoxPart[] = [], arches: ArchPart[] = [];
  for (const bridge of world.bridges) {
    const a = portPoint(world, bridge.from), b = portPoint(world, bridge.to);
    const ya = LAND_TOP + tileHeight(findTile(world, bridge.from.islandId, bridge.from.tile)!);
    const yb = LAND_TOP + tileHeight(findTile(world, bridge.to.islandId, bridge.to.tile)!);
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), y = (ya + yb) / 2;
    const yaw = -Math.atan2(dz, dx), cos = Math.cos(yaw), sin = Math.sin(yaw);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    // Bridge-local (along, up, across) to world, matching a group rotated by `yaw` about y.
    const at = (lx: number, ly: number, lz: number): Vec3 => [mx + lx * cos + lz * sin, y + ly, mz - lx * sin + lz * cos];
    const box = (lx: number, ly: number, lz: number, size: Vec3, color: string) => boxes.push({ position: at(lx, ly, lz), yaw, pitch: 0, size, color });
    if (bridge.kind === 'wood') {
      const style = BRIDGE.wood, planks = Math.round(length / .2);
      for (let i = 0; i < planks; i++) box(-length / 2 + (i + .5) * (length / planks), .02, 0, [length / planks - .03, .06, .82], i % 3 ? style.deck : style.plankDark);
    } else {
      box(0, .02, 0, [length, .08, .86], BRIDGE.stone.deck);
      arches.push({ position: at(0, -length / 2, 0), yaw, radius: length / 2, color: BRIDGE.stone.deck });
    }
    const style = BRIDGE[bridge.kind];
    for (const side of [-1, 1]) {
      box(0, .24, side * .4, [length, .05, .05], style.rail);
      for (let i = 0; i < style.posts; i++) box(-length / 2 + i * (length / (style.posts - 1)), .13, side * .4, [.07, .24, .07], style.rail);
    }
  }
  return { boxes, arches };
}
