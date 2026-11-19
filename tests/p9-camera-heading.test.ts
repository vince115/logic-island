import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAP_VIEW } from '@/lib/islands/map-view';
import { P9_REGION_BASE_AZIMUTH, WORLD_CAMERA_POSITION, WORLD_HEADING_DEG, headingDeg } from '@/lib/p9/camera-heading';

const near = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 1e-9;

describe('P9 camera heading: world and region face the same way', () => {
  it('the region map default view plus its base turn equals the world heading', () => {
    // hex-world-scene turns MAP_VIEW by baseAzimuth around the vertical axis (atan2(x, z) + baseAzimuth).
    expect(near(headingDeg(MAP_VIEW) + P9_REGION_BASE_AZIMUTH, WORLD_HEADING_DEG)).toBe(true);
    expect(near(headingDeg(WORLD_CAMERA_POSITION), 0)).toBe(true);
  });

  it('the turn is non-zero, so hex-world-scene applies it (a 0 turn falls back to MAP_VIEW)', () => {
    expect(P9_REGION_BASE_AZIMUTH).not.toBe(0);
  });

  it('the P9 pages use the shared heading on every device, not the P8 per-region turns', () => {
    const region = readFileSync('src/components/p9/p9-region-explorer.tsx', 'utf8');
    expect(region).toContain('baseAzimuth={P9_REGION_BASE_AZIMUTH}');
    expect(region).not.toMatch(/camera\.azimuth\[/);
    const world = readFileSync('src/components/p9/p9-world-scene.tsx', 'utf8');
    expect(world).toContain('position: [...WORLD_CAMERA_POSITION]');
  });
});
