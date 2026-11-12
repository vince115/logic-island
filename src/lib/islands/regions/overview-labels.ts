import type { LabelSide } from './schema';

/*
 * P8.3: where the world overview's labels go, as a pure function of what is on the stage (px): each outline's extent,
 * the side its label prefers, the label's size, the free part of the stage, the land of every outline and the links
 * drawn on the sea. A label stays clear of every other label, of the islands and of every link (P8.3 rule 6: a link
 * and a label never share a spot), inside the stage. Pure, so it settles in one step for any text length and font,
 * and unit tests can give it a crowded stage.
 */
/** A rectangle on the stage by its corners: an outline's extent. */
export interface StageBox { x0: number; y0: number; x1: number; y1: number }
export interface Box { x: number; y: number; width: number; height: number }
/** A link as drawn on the stage: its two ends and how wide its deck is. */
export interface StageLine { id: string; kind: 'hub' | 'relation'; x0: number; y0: number; x1: number; y1: number; width: number }
/** An outline's land on the stage: its tiles' centers and a tile's radius. */
export interface StageLand { points: [number, number][]; radius: number }
export interface StageRoom { left: number; right: number; top?: number; bottom?: number }
/** Where a label ends up: its box's top-left corner and the side of its outline it hangs on. */
export interface LabelSpot { x: number; y: number; side: LabelSide }

const GAP = 4;
export const boxesOverlap = (a: Box, b: Box, margin = 0) => a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
/** A label's box hanging off the middle of `side` of an outline's extent, `gap` away. */
export function labelBox({ x0, y0, x1, y1 }: StageBox, side: LabelSide, width: number, height: number, gap = 8): Box {
  return side === 'above' ? { x: (x0 + x1) / 2 - width / 2, y: y0 - gap - height, width, height } : side === 'below' ? { x: (x0 + x1) / 2 - width / 2, y: y1 + gap, width, height }
    : side === 'left' ? { x: x0 - gap - width, y: (y0 + y1) / 2 - height / 2, width, height } : { x: x1 + gap, y: (y0 + y1) / 2 - height / 2, width, height };
}
/** Whether a line (with half its width and `margin` around it) touches a box: the segment clipped to the grown box is not empty. */
export function lineHitsBox(line: StageLine, box: Box, margin = 0): boolean {
  const grow = line.width / 2 + margin, x0 = box.x - grow, x1 = box.x + box.width + grow, y0 = box.y - grow, y1 = box.y + box.height + grow;
  const dx = line.x1 - line.x0, dy = line.y1 - line.y0;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, line.x0 - x0], [dx, x1 - line.x0], [-dy, line.y0 - y0], [dy, y1 - line.y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return true;
}
/** Whether a box covers any of a land's tiles (a tile counts once the box reaches well into it). */
export function boxCoversLand(box: Box, land: StageLand): boolean {
  // The view looks down at about 40 degrees, so a tile is about .6 as tall on the stage as it is wide.
  const reach = land.radius * .8;
  return land.points.some(([x, y]) => x > box.x - reach && x < box.x + box.width + reach && y > box.y - reach * .6 && y < box.y + box.height + reach * .6);
}

const SIDES: readonly LabelSide[] = ['below', 'above', 'right', 'left'];
/**
 * How much worse than its own side another side is, in px of distance: a label that would have to slide further than
 * this along its own side looks at the other sides of its outline too, and takes one only if it is that much nearer.
 */
const OTHER_SIDE = 48;
/**
 * Where each label goes. Labels are placed in order; each takes the nearest spot where it is inside the stage, apart
 * from the labels placed before it, off every outline's land and off every link: first along the side the world map
 * names (sliding along it in steps, then further out from it), and on another side of its outline only when its own
 * has no such spot nearby. If nothing within reach is free it takes the spot that breaks the least: a label never covers
 * another label if it can cover land instead, never leaves the stage or covers land if it can cross a link instead.
 * The result is always defined, and a label is always between the stage's sides.
 */
export function placeLabels(extents: StageBox[], sides: LabelSide[], sizes: [number, number][], room: StageRoom, { lines = [], lands = [] }: { lines?: StageLine[]; lands?: StageLand[] } = {}): LabelSpot[] {
  const placed: Box[] = [], out: LabelSpot[] = [];
  const STEP = 6, SLIDE = 24, OUT = 12;
  for (const [i, extent] of extents.entries()) {
    let best: { box: Box; side: LabelSide; cost: number } | null = null;
    for (const [n, side] of [sides[i], ...SIDES.filter(s => s !== sides[i])].entries()) {
      if (best && best.cost < OTHER_SIDE) break;
      const base = labelBox(extent, side, sizes[i][0], sizes[i][1]);
      const along = side === 'above' || side === 'below' ? 0 : 1, away = side === 'above' || side === 'left' ? -1 : 1;
      for (let o = 0; o <= OUT; o++) for (let s = 0; s <= SLIDE * 2; s++) {
        // 0, +1, -1, +2, -2, … steps along the side; `o` steps further out.
        const slide = (s % 2 ? 1 : -1) * Math.ceil(s / 2) * STEP;
        const box = along === 0 ? { ...base, x: base.x + slide, y: base.y + away * o * STEP } : { ...base, x: base.x + away * o * STEP, y: base.y + slide };
        const outside = (room.right > room.left && (box.x < room.left || box.x + box.width > room.right)) || (room.top !== undefined && box.y < room.top) || (room.bottom !== undefined && box.y + box.height > room.bottom);
        const labels = placed.filter(other => boxesOverlap(box, other, GAP)).length, land = lands.filter(l => boxCoversLand(box, l)).length, links = lines.filter(line => lineHitsBox(line, box, 3)).length;
        // Distance moved, with moving out costing a little more than sliding; broken rules outweigh any distance.
        const cost = Math.abs(slide) + o * STEP * 1.5 + (n ? OTHER_SIDE : 0) + labels * 1e7 + (outside ? 1e6 : 0) + land * 1e5 + links * 1e4;
        if (!best || cost < best.cost) best = { box, side, cost };
      }
    }
    const { box, side } = best!;
    // Whatever was chosen, the label stays between the stage's sides (a label wider than the stage keeps its left edge).
    if (room.right > room.left) box.x = Math.max(room.left, Math.min(box.x, room.right - box.width));
    placed.push(box);
    out.push({ x: Math.round(box.x), y: Math.round(box.y), side });
  }
  return out;
}
