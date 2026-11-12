import type { RegionId } from '@/content/world/types';
import type { OverviewShape, WorldMapSpec } from './schema';

/*
 * P8.2 World Layout Registry: the hub in the middle of the sea and the regions around it (decision D2). A natural,
 * uneven ring rather than five equal slots: clockwise from the far side CS, AI, design, web, sys, each at its own
 * distance and drawn at a width that follows how much land it has. Positions are in screen-aligned sea units
 * ([right, away]); `tall` is the phone composition, two columns around the hub. A proposal for screenshot review:
 * nothing here changes a region's own map.
 */
export const WORLD_MAP: WorldMapSpec = {
  hub: {
    islandId: 'labs',
    wide: { at: [0, 0], width: 8, label: 'below' },
    tall: { at: [0, 0], width: 6, label: 'below' },
  },
  regions: {
    cs: { wide: { at: [-4, 30], width: 30, label: 'above' }, tall: { at: [-1, 28], width: 19, label: 'above' } },
    ai: { wide: { at: [27, 10], width: 23, label: 'below' }, tall: { at: [13, 9], width: 13, label: 'below' } },
    design: { wide: { at: [19, -24], width: 16, label: 'below' }, tall: { at: [10, -19], width: 11, label: 'below' } },
    web: { wide: { at: [-13, -28], width: 19, label: 'below' }, tall: { at: [-10, -23], width: 13, label: 'below' } },
    sys: { wide: { at: [-29, 4], width: 20, label: 'below' }, tall: { at: [-13, 4], width: 12, label: 'above' } },
  },
};

/** The regions that have a place on the overview, in the order they are declared above. */
export const worldMapRegionIds = () => Object.keys(WORLD_MAP.regions) as RegionId[];

/**
 * Rules of the overview composition, checked in unit tests: every placed region is drawn at a positive width, no two
 * outlines' circles (half the width) and neither the hub's overlap, so labels and ferry routes have sea between them.
 */
export function validateWorldMap(map: WorldMapSpec, shape: OverviewShape): string[] {
  const problems: string[] = [];
  const parts = [{ id: 'hub', ...map.hub[shape] }, ...(Object.entries(map.regions) as [RegionId, WorldMapSpec['hub']][]).map(([id, p]) => ({ id, ...p[shape] }))];
  for (const part of parts) if (!(part.width > 0)) problems.push(`${part.id}: width ${part.width}`);
  for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) {
    const distance = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
    if (distance < (a.width + b.width) / 2) problems.push(`${a.id} and ${b.id} overlap on the ${shape} overview (${distance.toFixed(1)} apart, need ${((a.width + b.width) / 2).toFixed(1)})`);
  }
  return problems;
}
