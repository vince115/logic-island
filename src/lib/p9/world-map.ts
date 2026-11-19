import { REGION_IDS } from '@/content/world/types';
import { hexToWorld } from '@/lib/islands/hex';
import type { HexWorld } from '@/lib/islands/hex-world';
import type { OverviewShape, WorldMapSpec } from '@/lib/islands/regions/schema';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { regionScene } from './region-scene';

/*
 * P9.1 visual prototype: where the prototype's world overview puts the regions. The world map itself (WORLD_MAP: the
 * places, the ring, the relation bridges) is read and never changed; /world keeps drawing it as it is.
 *
 * P9.1b: what stands at each place is the region's own scene (region-scene.ts), and every scene is drawn at ONE scale,
 * the hub's island too, so the overview is one map: an island of 25 tiles is the same size in every region, and a
 * region is as wide as its own map makes it. (The P8 overview gives each region a width by hand, which draws CS at
 * about half the scale of the hub.) A region's width here is therefore not data but its map's span times the scale;
 * the composition rules of the world map still hold at these widths (a unit test checks both shapes).
 */
export const P9_SCALE: Record<OverviewShape, number> = { wide: .58, tall: .35 };
/** A map's span as the overview measures it (world-overview-geometry.ts, `placing`): its longest side plus a tile each way. */
export function mapSpan(world: HexWorld): number {
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  return Math.max(...[0, 1].map(i => Math.max(...all.map(p => p[i])) - Math.min(...all.map(p => p[i])))) + world.size * 2;
}
const sized = <T extends { width: number }>(place: T, world: HexWorld, shape: OverviewShape): T => ({ ...place, width: mapSpan(world) * P9_SCALE[shape] });
function build(): WorldMapSpec {
  const hub = regionScene('hub').region.layout.world;
  return {
    ...WORLD_MAP,
    hub: { ...WORLD_MAP.hub, wide: sized(WORLD_MAP.hub.wide, hub, 'wide'), tall: sized(WORLD_MAP.hub.tall, hub, 'tall') },
    regions: Object.fromEntries(REGION_IDS.flatMap(id => {
      const place = WORLD_MAP.regions[id], { world } = regionScene(id).region.layout;
      return place ? [[id, { wide: sized(place.wide, world, 'wide'), tall: sized(place.tall, world, 'tall') }]] : [];
    })),
  };
}
export const P9_WORLD_MAP: WorldMapSpec = build();
