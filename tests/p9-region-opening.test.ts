import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '@/content/world/types';
import { WATER_LEVEL, worldCenter } from '@/lib/islands/hex-world';
import { frameOverview, overviewOutlines } from '@/lib/islands/regions/world-overview-geometry';
import type { OverviewShape } from '@/lib/islands/regions/schema';
import { regionStage } from '@/lib/p9/region-layout';
import { openingWorldView, regionOpening } from '@/lib/p9/region-opening';
import { regionScene, sceneLayouts, scenePlacement, type SceneId } from '@/lib/p9/region-scene';
import { P9_WORLD_MAP } from '@/lib/p9/world-map';
import { viewPlacing } from '@/lib/p9/world-fly';
import { MAX_ZOOM, MIN_ZOOM, project, type Stage } from '@/lib/p9/world-view';

/** The world overview as p9-world-scene.tsx composes it (useWorld): each region's outline, and its scene's placement. */
function world(shape: OverviewShape) {
  const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape);
  return { outlines, placement: (id: SceneId) => {
    const outline = outlines.find(o => o.id === id)!, { world: map } = regionScene(id).region.layout;
    return scenePlacement(map, outline.placed.point(...worldCenter(outline.world)), outline.placed.scale, WATER_LEVEL);
  } };
}

/** Reference screens: the region page's canvas measured on the P9.6 build (desktop full screen; phone below the caption). */
const SCREENS = [
  { name: 'desktop 1440×1000', shape: 'wide' as const, viewport: [1440, 1000], worldStage: { width: 1440, height: 1000 }, worldOffset: [0, 0] as const, inset: 360, region: { left: 0, top: 0, width: 1440, height: 1000 } },
  { name: 'phone 390×664', shape: 'tall' as const, viewport: [390, 664], worldStage: { width: 390, height: 438 }, worldOffset: [0, 88] as const, inset: 0, region: { left: 0, top: 174, width: 390, height: 434 } },
];

describe('P9.8a region opening and the flight that ends on it', () => {
  it('places a stage point where asked, at the zoom asked', () => {
    const s: Stage = { width: 1000, height: 600 }, v = viewPlacing([120, 80], [400, 300], 2.5, s);
    expect(v.k).toBe(2.5);
    const [x, y] = project(v, s, 120, 80);
    expect(x).toBeCloseTo(400); expect(y).toBeCloseTo(300);
  });
  it('predicts the region page canvas the P9.6 build lays out', () => {
    for (const screen of SCREENS) expect(regionStage(screen.viewport[0], screen.viewport[1], screen.shape === 'wide' ? 64 : 88)).toEqual(screen.region);
  });
  for (const screen of SCREENS) it(`${screen.name}: every region's flight ends with its opening centre on the page's canvas centre, at its zoom`, () => {
    const { outlines, placement } = world(screen.shape), frame = frameOverview(outlines, screen.shape, screen.worldStage, screen.inset);
    for (const id of REGION_IDS) {
      const opening = regionOpening(id, screen.region, screen.viewport[0]), map = regionScene(id).region.layout.world, at = placement(id);
      const view = openingWorldView(opening, at, map, frame, screen.worldStage, screen.region, screen.worldOffset);
      // A view the overview can draw: within its zoom range (the flight may pass the pan limits, not the zoom ones).
      expect(view.k, id).toBeGreaterThanOrEqual(MIN_ZOOM); expect(view.k, id).toBeLessThanOrEqual(MAX_ZOOM);
      const [cx, cz] = worldCenter(map), s = at.scale, { centre } = opening;
      const rest = frame.stage([at.position[0] + s * (centre.x + cx), at.position[2] + s * (centre.z + cz)], at.position[1] + s * centre.y);
      const [x, y] = project(view, screen.worldStage, ...rest);
      expect(x + screen.worldOffset[0], id).toBeCloseTo(screen.region.left + screen.region.width / 2, 6);
      expect(y + screen.worldOffset[1], id).toBeCloseTo(screen.region.top + screen.region.height / 2, 6);
      expect(frame.zoom * view.k * s, id).toBeCloseTo(opening.zoom, 6);
    }
  });
});
