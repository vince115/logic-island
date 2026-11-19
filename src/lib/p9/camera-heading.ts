import { MAP_VIEW } from '@/lib/islands/map-view';

/**
 * P9 World North: the world overview and every region map look at the map from the same horizontal heading, so a
 * region is the same map, larger. The world camera sits on +z looking toward -z (north is up the screen).
 */
export const WORLD_CAMERA_POSITION = [0, 40, 60] as const;

/** Horizontal heading of a view vector, in degrees in [0, 360), measured like the region camera (atan2(x, z)). */
export const headingDeg = (v: readonly [number, number, number] | readonly number[]) =>
  ((Math.atan2(v[0], v[2]) * 180) / Math.PI + 360) % 360;

export const WORLD_HEADING_DEG = headingDeg(WORLD_CAMERA_POSITION);

/**
 * The degrees a region map adds to its default view (MAP_VIEW) so that it faces the world heading, on every device.
 * Replaces the P8 per-region turns (REGION_LAYOUTS[*].camera.azimuth) on the P9 pages only; /world keeps its own.
 */
export const P9_REGION_BASE_AZIMUTH = WORLD_HEADING_DEG - headingDeg(MAP_VIEW);
