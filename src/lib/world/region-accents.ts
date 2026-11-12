import type { RegionId } from '@/content/world/types';

/**
 * A region's accent color, the one source for the 2D pages (the curriculum's region overview, /regions) and the 3D
 * world (region-themes.ts). Kept apart from the registry index, which carries the planning data, so client code can
 * import it.
 */
export const REGION_ACCENT: Record<RegionId, string> = { cs: '#4285f4', ai: '#3949ab', design: '#d81b60', web: '#e65100', sys: '#0097a7' };
