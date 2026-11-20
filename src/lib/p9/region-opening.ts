import { Vector3 } from 'three';
import { VIEW, fitPoints, frame } from '@/lib/islands/hex-framing';
import { worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import type { OverviewFrame } from '@/lib/islands/regions/world-overview-geometry';
import { LAYOUT, PHONE_PIN_REACH, PHONE_ROOM, type RegionStage } from './region-layout';
import { regionScene, type SceneId, type ScenePlacement } from './region-scene';
import { viewPlacing } from './world-fly';
import type { Stage, WorldView } from './world-view';

/*
 * P9.8a: a P9 region page's opening view, worked out before that page exists, so the world overview's flight can end
 * on it (p9-world-scene.tsx) and the switch from one canvas to the other shows the same map at the same place and size.
 *
 * The region page frames its map with the shared hex camera (hex-camera.tsx): the content points (fitPoints) fitted
 * along VIEW (P9_REGION_BASE_AZIMUTH is 0) into the canvas, left of the island list on wide screens and within
 * PHONE_ROOM on single-column ones. Only the page's layout rules are repeated (region-layout.ts: which canvas size,
 * list width, room and label reach a viewport gets); the fit itself is the camera's own `frame`. e2e/p9-continuity.spec.ts checks
 * the result against the page's real camera for every region on desktop and phone sizes.
 */

export interface RegionOpening {
  /** The map point (region scene space: the map's centre at the origin) drawn at the canvas's centre. */
  centre: Vector3;
  /** Pixels per map unit (the orthographic camera's zoom). */
  zoom: number;
}

/** The view the region page opens with on `stage` (the page's map canvas), for a viewport `viewportWidth` wide. */
export function regionOpening(id: SceneId, stage: RegionStage, viewportWidth: number): RegionOpening {
  const { layout, camera } = regionScene(id).region, world = layout.world;
  const pins = viewportWidth <= LAYOUT.pinsTo, wide = viewportWidth >= LAYOUT.wideFrom;
  // The page's scene options: compact labels with content framing (SCENE_PRESETS.lab), this reach, the region's GLB layout.
  const fit = fitPoints(world, layout.glb, worldCenter(world), true, pins ? PHONE_PIN_REACH : camera.labelReach, VIEW);
  const insetRight = wide ? viewportWidth <= LAYOUT.narrowListTo ? LAYOUT.list.narrow : LAYOUT.list.wide : 0;
  const { center, zoom, right, up, side, shift } = frame(fit.all, VIEW, stage.width, stage.height, false, insetRight, wide ? undefined : PHONE_ROOM);
  // The free camera looks at `center` with the focal offset (side, −shift), which camera-controls applies along the
  // camera's right and (negated) up: the canvas's centre shows the point `side` to the right and `shift` above it.
  return { centre: center.clone().addScaledVector(right, side).addScaledVector(up, shift), zoom };
}

/**
 * The world overview's view that draws the region's opening exactly where the region page will: the region's map
 * point at the page's canvas centre lands on the same screen point, at the same pixels per map unit. The miniature is
 * the region's map scaled by `placement.scale` (scenePlacement), so one view matches every point at once.
 * `frame` is the overview's framing at rest, `stage` its canvas size, `region` the region page's canvas (regionStage)
 * and `offset` where the overview's canvas sits on the screen (px), both in viewport px.
 */
export function openingWorldView(opening: RegionOpening, placement: ScenePlacement, world: HexWorld, frame: OverviewFrame, stage: Stage, region: RegionStage, offset: readonly [number, number]): WorldView {
  const [cx, cz] = worldCenter(world), { scale: s, position: [px, py, pz] } = placement, { centre } = opening;
  // Region scene space is the map less its centre; the miniature draws the map at position + s·map (scenePlacement).
  const at = frame.stage([px + s * (centre.x + cx), pz + s * (centre.z + cz)], py + s * centre.y);
  return viewPlacing(at, [region.left + region.width / 2 - offset[0], region.top + region.height / 2 - offset[1]], opening.zoom / (frame.zoom * s), stage);
}
