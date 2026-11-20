import { WATER_LEVEL, worldCenter } from '@/lib/islands/hex-world';
import type { OverviewShape } from '@/lib/islands/regions/schema';
import { overviewOutlines } from '@/lib/islands/regions/world-overview-geometry';
import { regionScene, sceneLayouts, scenePlacement, type SceneId } from './region-scene';
import { P9_WORLD_MAP } from './world-map';

/**
 * Where each region's scene sits on the P9 world overview for a stage shape: its outline (the P8 overview's
 * placement) and the scene's placement in world space (scenePlacement: the map's centre on the outline's anchor, at
 * its scale, sea level at the world's water). P9.8c: moved out of p9-world-scene.tsx unchanged, so the CS page can
 * place its own scene in the world's space too (regionFrame).
 */
export function worldPlacements(shape: OverviewShape) {
  const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape);
  const parts = outlines.map((outline, order) => {
    const scene = regionScene(outline.id as SceneId), { world } = scene.region.layout;
    // The outline's own anchor: where the map's centre lands. The hub's outline is the same island as the hub scene's.
    const anchor = outline.placed.point(...worldCenter(outline.world));
    return { id: outline.id as SceneId, scene, order, placement: scenePlacement(world, anchor, outline.placed.scale, WATER_LEVEL) };
  });
  return { outlines, parts };
}

/**
 * P9.8c: a region's scene space (its map less the map's centre, as the region page draws it) in the world overview's
 * space: world = offset + scale · region.
 */
export function regionFrame(id: SceneId, shape: OverviewShape) {
  const part = worldPlacements(shape).parts.find(p => p.id === id);
  if (!part) throw new Error(`No world placement for ${id}`);
  const { scale, position } = part.placement, [cx, cz] = worldCenter(part.scene.region.layout.world);
  return { scale, offset: [position[0] + scale * cx, position[1], position[2] + scale * cz] as [number, number, number] };
}
