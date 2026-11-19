import { MAX_ZOOM, type Stage, type WorldView } from './world-view';

/*
 * P9.5: the world overview's camera flight to a region, as plain math on the same view as zoom and pan
 * (world-view.ts): the orthographic camera keeps its angle and only zooms and moves, so a flight can never pass
 * through land. A flight interpolates the rest-space point at the middle of the free stage (straight line) and the
 * zoom (on a log scale, so it feels even), eased in and out. When it ends, the page navigates to the region (a route
 * transition: the region page draws its own scene).
 *
 * States: idle → flying → navigating; a pointer or wheel gesture during a flight cancels it (cancelled → idle).
 */
export type FlyState = 'idle' | 'flying' | 'navigating' | 'cancelled';
/**
 * Flight length (ms); short enough not to delay, long enough to read the direction. P9.6: 950 → 700 ms (the brief's
 * 600–750 ms range); the region page's route and scene code load during the flight (p9-world-scene.tsx).
 */
export const FLY_MS = 700;
/** If the frames stall (a hidden tab, a busy device), the region still opens this long after the flight should end. */
export const FLY_SAFETY_MS = 700;
/** How much of the free stage the region fills at the end of the flight. */
const FILL = .78;

export interface StageBox { x0: number; y0: number; x1: number; y1: number }

/** The free stage: left of the guide on wide stages (insetRight), all of it on phones. */
const freeCentre = (s: Stage, insetRight: number): [number, number] => [(s.width - insetRight) / 2, s.height / 2];

/** The view that frames `box` (a region's extent at rest, stage px) in the middle of the free stage. */
export function flyTarget(box: StageBox, s: Stage, insetRight: number): WorldView {
  const w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
  const k = Math.min(MAX_ZOOM, Math.max(1, Math.min((s.width - insetRight) * FILL / w, s.height * FILL / h)));
  return viewCentredOn([(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], k, s, insetRight);
}

/** The view at zoom k with the rest-space point p in the middle of the free stage. */
function viewCentredOn(p: [number, number], k: number, s: Stage, insetRight: number): WorldView {
  const [cx, cy] = [s.width / 2, s.height / 2], [fx, fy] = freeCentre(s, insetRight);
  return { k, dx: fx - cx - k * (p[0] - cx), dy: fy - cy - k * (p[1] - cy) };
}
/** The rest-space point a view shows in the middle of the free stage. */
function centreOf(v: WorldView, s: Stage, insetRight: number): [number, number] {
  const [cx, cy] = [s.width / 2, s.height / 2], [fx, fy] = freeCentre(s, insetRight);
  return [cx + (fx - cx - v.dx) / v.k, cy + (fy - cy - v.dy) / v.k];
}

export const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** The view `t` (0–1, before easing) of the way from `from` to `to`. */
export function flightView(from: WorldView, to: WorldView, t: number, s: Stage, insetRight: number): WorldView {
  const e = easeInOut(Math.min(1, Math.max(0, t)));
  const a = centreOf(from, s, insetRight), b = centreOf(to, s, insetRight);
  const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e);
  return viewCentredOn([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e], k, s, insetRight);
}
