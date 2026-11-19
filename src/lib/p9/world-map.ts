import type { RegionId } from '@/content/world/types';
import type { WorldMapSpec } from '@/lib/islands/regions/schema';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';

/*
 * P9.1 visual prototype: where the prototype's world overview puts the regions. The world map itself (WORLD_MAP: the
 * places, the ring, the relation bridges) is read and never changed; /world keeps drawing it as it is.
 */
/**
 * The prototype draws every region larger than the P8 overview does: the same places, ring and bridges (WORLD_MAP),
 * each region's width times GROW. Land with relief needs the pixels, and the sea between the regions was mostly empty.
 * The composition rules of the world map still hold at this size (a unit test checks it).
 */
export const P9_GROW = { region: 1.3, hub: 1.45 } as const;
const grow = <T extends { width: number }>(place: T, by: number): T => ({ ...place, width: place.width * by });
export const P9_WORLD_MAP: WorldMapSpec = {
  ...WORLD_MAP,
  hub: { ...WORLD_MAP.hub, wide: grow(WORLD_MAP.hub.wide, P9_GROW.hub), tall: grow(WORLD_MAP.hub.tall, P9_GROW.hub) },
  regions: Object.fromEntries(Object.entries(WORLD_MAP.regions).map(([id, place]) => [id, { wide: grow(place.wide, P9_GROW.region), tall: grow(place.tall, P9_GROW.region) }])),
};
/** The island each region's landmark stands on (a proposal; the hub has one island). */
export const LANDMARK_ISLAND: Record<RegionId, string> = { cs: 'foundations', ai: 'large-language-models', design: 'ui-design', web: 'web-foundations', sys: 'linux-systems' };
