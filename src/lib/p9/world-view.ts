/*
 * P9.4: the world overview's zoom and pan, as plain math on the stage (CSS px). The overview's framing
 * (frameOverview) stays the one source of where everything is at rest; a view only scales the picture about the
 * stage's centre by `k` and moves it by (dx, dy), the way an orthographic camera does when its zoom and position
 * change. The camera, the region labels and the clicks all use the same transform, so a label stays on its region.
 *
 *   p' = c + k (p − c) + (dx, dy)        c = the stage's centre
 */
export interface WorldView { k: number; dx: number; dy: number }
export interface Stage { width: number; height: number }

export const HOME_VIEW: WorldView = { k: 1, dx: 0, dy: 0 };
/** Closest and farthest: the whole world at rest is the farthest out; four times closer is about one region. */
export const MIN_ZOOM = 1, MAX_ZOOM = 4;
/** A press that moves less than this (px) is a tap or a click, more is a drag: it pans and opens nothing. */
export const DRAG_THRESHOLD = 6;
/** How far the world's centre may be pulled toward the stage's edges (fraction of the stage). */
const EDGE = .1;

const centre = (s: Stage) => [s.width / 2, s.height / 2] as const;
export const isHome = (v: WorldView) => Math.abs(v.k - 1) < 1e-6 && Math.abs(v.dx) < .5 && Math.abs(v.dy) < .5;

/** Where a stage point at rest is drawn under the view. */
export function project(v: WorldView, s: Stage, x: number, y: number): [number, number] {
  const [cx, cy] = centre(s);
  return [cx + v.k * (x - cx) + v.dx, cy + v.k * (y - cy) + v.dy];
}

/**
 * Keeps the view usable: zoom within [MIN_ZOOM, MAX_ZOOM], and the world's centre at rest (`anchor`, by default the
 * stage's centre) inside the stage less a tenth on each side, so the map can never be dragged out of sight.
 */
export function clampView(v: WorldView, s: Stage, anchor: [number, number] = [s.width / 2, s.height / 2]): WorldView {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k));
  const [ax, ay] = project({ k, dx: v.dx, dy: v.dy }, s, ...anchor);
  const x = Math.min(s.width * (1 - EDGE), Math.max(s.width * EDGE, ax)), y = Math.min(s.height * (1 - EDGE), Math.max(s.height * EDGE, ay));
  return { k, dx: v.dx + x - ax, dy: v.dy + y - ay };
}

/** Zoom by `factor` keeping the stage point (px, py) still: the wheel at the cursor, a pinch at its midpoint. */
export function zoomAt(v: WorldView, s: Stage, factor: number, px: number, py: number): WorldView {
  const [cx, cy] = centre(s), k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor)), r = k / v.k;
  // The point under (px, py) at rest: p0 = c + (p − c − d) / k. Keep it at (px, py) after the zoom.
  return clampView({ k, dx: px - cx - r * (px - cx - v.dx), dy: py - cy - r * (py - cy - v.dy) }, s);
}

export const panBy = (v: WorldView, s: Stage, dx: number, dy: number): WorldView => clampView({ k: v.k, dx: v.dx + dx, dy: v.dy + dy }, s);

/** One wheel event's zoom factor: smooth for trackpads (small deltas), a step of about 15 % for a mouse notch. */
export const wheelFactor = (deltaY: number, deltaMode: number) => Math.exp(-Math.max(-60, Math.min(60, deltaY * (deltaMode === 1 ? 16 : 1))) * .0025);
