import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAP_VIEW } from '@/lib/islands/map-view';
import { P9_REGION_BASE_AZIMUTH, WORLD_HEADING_DEG, headingDeg } from '@/lib/p9/camera-heading';

const near = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 1e-9;

describe('P9 camera heading: world and region face the same way', () => {
  it('the world overview frames its camera along VIEW, whose heading is the shared one', () => {
    const world = readFileSync('src/components/p9/p9-world-scene.tsx', 'utf8');
    expect(world).toMatch(/camera\.position\.copy\(center\)\.addScaledVector\(VIEW, \d+\)/);
    expect(near(WORLD_HEADING_DEG, headingDeg(MAP_VIEW))).toBe(true);
  });

  it('the region map adds no turn to MAP_VIEW, on desktop and phone alike', () => {
    expect(near(headingDeg(MAP_VIEW) + P9_REGION_BASE_AZIMUTH, WORLD_HEADING_DEG)).toBe(true);
    const region = readFileSync('src/components/p9/p9-region-explorer.tsx', 'utf8');
    expect(region).toContain('baseAzimuth={P9_REGION_BASE_AZIMUTH}');
    expect(region).not.toMatch(/camera\.azimuth\[/);
  });
});
