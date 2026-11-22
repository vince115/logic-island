import { tierFps, type DeviceTier } from './population';

/**
 * P2: when the map draws a frame for its figures (pure; the layer in population-layer.tsx runs the timer). The map
 * itself draws on demand, so a frame for the figures is a frame of the whole scene: the plan asks for one only when a
 * figure someone can see will look different in it, and no more often than its movement needs.
 *
 *   hidden     the page is in a background tab                      no frames, no simulation
 *   offscreen  the canvas is scrolled out of the window             no frames, no simulation
 *   still      reduced motion: figures stand where they are placed  no frames (one when the population changes)
 *   idle       no input for a while (IDLE_MS): the figures stand    no frames until the next input
 *   quiet      no figure in the camera's view has anything to do    no frames until the camera or the population moves
 *   rest       every figure in view is standing                     one frame when the first of them walks on
 *   run        a figure in view is moving                           frames at `fps`
 *
 * A zone outside the camera's view is not simulated either; it catches up when it comes back (npc-sim.ts advanceCrowd).
 */
export type LoopState = 'hidden' | 'offscreen' | 'still' | 'idle' | 'quiet' | 'rest' | 'run';

/** Without input for this long the figures stand still: sooner on a phone, where an unattended screen costs battery. */
export const IDLE_MS: Readonly<Record<DeviceTier, number>> = { full: 120_000, low: 45_000 };
/** The fastest a figure walks (map units a second; npc-sim.ts spawnNpc). */
export const WALK_SPEED = 0.46;
/** The frame rate is the lowest at which a walking figure moves no more than this many CSS px between frames. */
export const STEP_PX: Readonly<Record<DeviceTier, number>> = { full: 1.5, low: 2 };
/** Never slower than this while something moves, so growing in and out stays a movement and not a slide show. */
export const MIN_FPS: Readonly<Record<DeviceTier, number>> = { full: 8, low: 6 };

/**
 * Frames a second for moving figures at a camera zoom (CSS px a map unit, the orthographic camera's `zoom`). On the
 * overview a figure crosses a handful of px a second, so a few frames a second draw every position it has; a focused
 * island is closer and gets more, up to the tier's cap.
 */
export function motionFps(zoom: number, tier: DeviceTier): number {
  const wanted = Math.ceil((WALK_SPEED * Math.max(0, zoom)) / STEP_PX[tier]);
  return Math.min(tierFps(tier), Math.max(MIN_FPS[tier], Number.isFinite(wanted) ? wanted : MIN_FPS[tier]));
}

export interface ZoneActivity {
  /** The zone is inside the camera's view. */
  inView: boolean;
  /** Something of it moved in its last step, or its roster is still changing (npc-sim.ts Crowd.active). */
  active: boolean;
  /** Seconds until a standing figure walks on (Infinity: nothing will). */
  wake: number;
}
export interface LoopInput {
  now: number;
  pageVisible: boolean;
  onScreen: boolean;
  /** Reduced motion. */
  still: boolean;
  /** `now` of the last input (pointer, key, wheel, touch, scroll). */
  lastInput: number;
  tier: DeviceTier;
  zoom: number;
  zones: readonly ZoneActivity[];
}
export interface LoopPlan {
  state: LoopState;
  /** Ms from `now` at which the next frame is asked for; null: none until something outside the figures changes. */
  delay: number | null;
  /** `run` only: the rate. */
  fps: number;
}

const none = (state: LoopState): LoopPlan => ({ state, delay: null, fps: 0 });

export function planLoop({ now, pageVisible, onScreen, still, lastInput, tier, zoom, zones }: LoopInput): LoopPlan {
  if (still) return none('still');
  if (!pageVisible) return none('hidden');
  if (!onScreen) return none('offscreen');
  if (now - lastInput >= IDLE_MS[tier]) return none('idle');
  const seen = zones.filter(zone => zone.inView);
  if (seen.some(zone => zone.active)) {
    const fps = motionFps(zoom, tier);
    return { state: 'run', delay: 1000 / fps, fps };
  }
  const wake = Math.min(Infinity, ...seen.map(zone => zone.wake));
  if (!Number.isFinite(wake)) return none('quiet');
  // Not past the idle limit: a rest that would end after it ends with the next input instead.
  const delay = Math.max(1000 / tierFps(tier), wake * 1000);
  return now + delay - lastInput >= IDLE_MS[tier] ? none('idle') : { state: 'rest', delay, fps: 0 };
}
