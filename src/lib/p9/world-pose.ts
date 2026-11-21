import { VIEW } from '@/lib/islands/hex-framing';
import type { OverviewFrame } from '@/lib/islands/regions/world-overview-geometry';
import { looksAlong, poseCentredOn, type ScreenRect, type StagePose } from '@/lib/islands/stage-pose';
import { viewPlacing } from './world-fly';
import type { Stage, WorldView } from './world-view';

/**
 * P9.8c: the world overview's view that shows a handed-over camera pose (StagePose, world space) on a canvas at `rect`
 * the size of `stage`: the point at the canvas's centre stays at its screen pixel and the scale is the same. The
 * overview's camera never turns, so a pose that looks along another direction (a region map the user turned) has
 * none: undefined.
 */
export function worldViewFromPose(pose: StagePose, rect: ScreenRect, frame: OverviewFrame, stage: Stage): WorldView | undefined {
  if (!looksAlong(pose, [VIEW.x, VIEW.y, VIEW.z])) return undefined;
  const point = poseCentredOn(pose, rect);
  return viewPlacing(frame.stage([point[0], point[2]], point[1]), [stage.width / 2, stage.height / 2], pose.zoom / frame.zoom, stage);
}
