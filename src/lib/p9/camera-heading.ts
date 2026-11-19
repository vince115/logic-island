import { MAP_VIEW } from '@/lib/islands/map-view';

/**
 * P9 World North: the world overview and every region map look at the map from the same horizontal heading, so a
 * region is the same map, larger. The world overview frames its camera along VIEW (MAP_VIEW normalized, see Framing
 * in p9-world-scene.tsx), so the shared heading is MAP_VIEW's.
 */
export const headingDeg = (v: readonly number[]) => ((Math.atan2(v[0], v[2]) * 180) / Math.PI + 360) % 360;

export const WORLD_HEADING_DEG = headingDeg(MAP_VIEW);

/**
 * The degrees a P9 region map adds to its default view (MAP_VIEW) on every device: none, so it keeps the world's
 * heading. Replaces the P8 per-region turns (REGION_LAYOUTS[*].camera.azimuth) on the P9 pages only; /world keeps its
 * own. (hex-world-scene treats a 0 turn as "use MAP_VIEW", which is this heading.)
 */
export const P9_REGION_BASE_AZIMUTH = 0;
