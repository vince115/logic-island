import { WATER_LEVEL, worldCenter } from '@/lib/islands/hex-world';
import type { OverviewShape } from '@/lib/islands/regions/schema';
import { frameOverview, overviewLinks, overviewOutlines, type OverviewLink, type OverviewOutline } from '@/lib/islands/regions/world-overview-geometry';
import { regionScene, sceneLayouts, scenePlacement, type RegionSceneDefinition, type ScenePlacement, type SceneId } from './region-scene';
import { P9_WORLD_MAP } from './world-map';

/*
 * P9.1c: the world overview as one plan for both levels of the same scene. P9.1b drew the world in its own canvas;
 * P9.1c draws it around the CS region's own map, in that map's canvas, so going from the world to the region (and to
 * an island, and back) is one camera flight. Nothing about the world changes: the outlines, links and placements are
 * the overview's own (world-overview-geometry.ts with P9_WORLD_MAP), and its framing is frameOverview's. What this file
 * adds is the change of coordinates between the two:
 *
 *   a world point w and the CS map point m it stands on: w = P.position + m · s, so m = (w − P.position) / s,
 *
 * where P is the CS scene's placement on the overview and s its scale (one scale for every region, P9.1b). The region
 * explorer draws its map shifted by its centre (ox, oz), so a rendered point is m − (ox, 0, oz). An orthographic zoom is
 * pixels per unit, and a CS map unit is 1 / s world units, so a world zoom z is a map zoom z · s.
 */

export interface WorldPart { id: SceneId; scene: RegionSceneDefinition; order: number; placement: ScenePlacement }
export interface WorldPlan {
  shape: OverviewShape; outlines: OverviewOutline[]; links: OverviewLink[]; parts: WorldPart[];
  /** The CS scene's placement on the overview: the map the explorer draws at full size. */
  cs: ScenePlacement;
  /** Where the explorer centres the CS map (worldCenter of its world). */
  centre: readonly [number, number];
}

const plans = new Map<OverviewShape, WorldPlan>();
export function worldPlan(shape: OverviewShape): WorldPlan {
  const known = plans.get(shape);
  if (known) return known;
  const outlines = overviewOutlines(P9_WORLD_MAP, sceneLayouts(), shape), links = overviewLinks(P9_WORLD_MAP, outlines);
  const parts = outlines.map((outline, order) => {
    const scene = regionScene(outline.id as SceneId), { world } = scene.region.layout;
    const anchor = outline.placed.point(...worldCenter(outline.world));
    return { id: outline.id as SceneId, scene, order, placement: scenePlacement(world, anchor, outline.placed.scale, WATER_LEVEL) };
  });
  const cs = parts.find(p => p.id === 'cs')!.placement;
  const plan = { shape, outlines, links, parts, cs, centre: worldCenter(regionScene('cs').region.layout.world) };
  plans.set(shape, plan);
  return plan;
}

/** A world point as a CS map point. */
export const toMap = (plan: WorldPlan, [x, y, z]: readonly [number, number, number]): [number, number, number] => {
  const { position: [px, py, pz], scale } = plan.cs;
  return [(x - px) / scale, (y - py) / scale, (z - pz) / scale];
};
/** The group transform that puts world coordinates into the CS map's: inside it, the overview draws as it is. */
export const worldInMap = (plan: WorldPlan) => ({ scale: 1 / plan.cs.scale, position: plan.cs.position.map(v => -v / plan.cs.scale) as [number, number, number] });

/** The overview's own framing for this stage, as the region explorer's camera needs it (rendered coordinates, map zoom). */
export function worldFraming(plan: WorldPlan, size: { width: number; height: number }, insetRight: number) {
  const frame = frameOverview(plan.outlines, plan.shape, size, insetRight), [mx, my, mz] = toMap(plan, frame.center);
  return { frame, center: [mx - plan.centre[0], my, mz - plan.centre[1]] as [number, number, number], zoom: frame.zoom * plan.cs.scale };
}
