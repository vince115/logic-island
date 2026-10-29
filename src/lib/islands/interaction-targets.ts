import type { Vec3 } from './types';

/**
 * Invisible hit proxies for GLB targets (D.2b scale refinement). A proxy is a box in the part's own
 * local GLB units that encloses the part and is at least `minWorld` wide on the map, so small targets
 * such as the dock stay tappable on phones. The GLB itself is not scaled or changed.
 */
export const HIT_PROXY_MIN_WORLD = 1.6;
export const HIT_PROXY_MIN_HEIGHT = 1;

export interface HitProxyBox { center: Vec3; size: Vec3 }

export function hitProxyBox(bounds: { min: Vec3; max: Vec3 }, scale: number, minWorld = HIT_PROXY_MIN_WORLD): HitProxyBox {
  const size = [0, 1, 2].map(i => bounds.max[i] - bounds.min[i]);
  const min = minWorld / scale, minHeight = HIT_PROXY_MIN_HEIGHT / scale;
  const out: Vec3 = [Math.max(size[0], min), Math.max(size[1], minHeight), Math.max(size[2], min)];
  // Centered on the part horizontally; standing on its base so the proxy never sinks below the ground.
  return {
    center: [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1] + out[1] / 2, (bounds.min[2] + bounds.max[2]) / 2],
    size: out,
  };
}
