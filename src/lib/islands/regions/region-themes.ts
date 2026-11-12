import type { RegionId } from '@/content/world/types';
import { REGION_ACCENT } from '@/lib/world/region-accents';
import type { RegionTheme } from './schema';

/*
 * P8.2 Region Theme: each region's look on the world overview. The accent is the region's one accent color
 * (src/lib/world/region-accents.ts); land, planned land and bridges are the outline's fills. CS and AI keep the M3.1
 * colors; design, web and sys are proposals awaiting art review (P8 §7): studio rose, warm sandstone, cool teal.
 */
const fills: Record<RegionId, Omit<RegionTheme, 'accent'>> = {
  // Computer science: the warm lawn and wood of the home map. Artificial intelligence: cool mineral greys.
  cs: { land: '#9cc98a', plannedLand: '#e4dfcf', bridge: '#a77b52' },
  ai: { land: '#8fb3c9', plannedLand: '#cdd6e1', bridge: '#7d8a99' },
  design: { land: '#eea9bd', plannedLand: '#f3d0da', bridge: '#b0627a' },
  web: { land: '#f0b877', plannedLand: '#f6dcb4', bridge: '#b9783c' },
  sys: { land: '#7cc7c4', plannedLand: '#bfe3df', bridge: '#4f8f96' },
};
export const REGION_THEMES = Object.fromEntries((Object.keys(fills) as RegionId[]).map(id => [id, { accent: REGION_ACCENT[id], ...fills[id] }])) as Record<RegionId, RegionTheme>;
/** The hub (the shared Interactive Lab Island) on the overview. */
export const HUB_THEME = { accent: '#8a4fd1', land: '#c8b6e8' } as const;
/**
 * P8.3 the world's links on the overview: the hub's causeways in pale stone, the relation bridges in warm wood. Told
 * apart by more than color: a causeway is one unbroken deck, a relation bridge is planks.
 */
export const LINK_THEME = { hub: '#f1f4f7', relation: '#c98f52' } as const;
