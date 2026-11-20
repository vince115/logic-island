import type { StageRoom } from '@/lib/islands/hex-framing';

/*
 * P9.8a: a P9 region page's layout rules, as plain numbers (no three.js, so the region page can share them without
 * loading the renderer with its own script): which map canvas, list width, room and label reach a viewport gets.
 * region-opening.ts turns them into the page's opening view.
 */

/** P9 region pages (p9-region-explorer.tsx): under PINS the map's labels are pins, which reach this far off the coast. */
export const PHONE_PIN_REACH = 3.2;
/** P9 region pages on single-column screens: the room the camera keeps at the map's top and bottom (px). */
export const PHONE_ROOM: StageRoom = { top: 30, bottom: 26 };

/**
 * The region page's layout, as hex-world-explorer.tsx and islands.module.css (data-layout='fullscreen') set it:
 * - wide (≥ 781 px): the map fills the screen under the floating header, at least 600 px tall; the island list floats
 *   over its right edge, 340 px wide (300 px up to 1050 px) and open by default;
 * - single column (≤ 780 px): the caption sits in a row above the map and the controls in one below it, so the map is
 *   the screen less the header and 142 px, at least 340 px tall;
 * - labels are pins up to 1239 px.
 */
export const LAYOUT = { wideFrom: 781, narrowListTo: 1050, list: { wide: 340, narrow: 300 }, minHeight: { wide: 600, column: 340 }, columnChrome: 142, pinsTo: 1239 } as const;
/**
 * The caption row above the map on single-column screens (eyebrow, name, counts): one line each at every phone width
 * measured (360–768 px), except a long English eyebrow wrapping on the narrowest phones (Systems & Cloud at 360 px:
 * 100 px). That case ends the flight 14 px off; the e2e test records it.
 */
export const COLUMN_CAPTION = 86;

/** Where the region page's map canvas will be, in viewport px. */
export interface RegionStage { left: number; top: number; width: number; height: number }

/**
 * The region page's map canvas for a viewport: `width` and `svh` (the small viewport height, what 100svh is) and the
 * site header's height (--header-h).
 */
export function regionStage(width: number, svh: number, header: number): RegionStage {
  if (width >= LAYOUT.wideFrom) return { left: 0, top: 0, width, height: Math.max(LAYOUT.minHeight.wide, svh) };
  return { left: 0, top: header + COLUMN_CAPTION, width, height: Math.max(LAYOUT.minHeight.column, svh - header - LAYOUT.columnChrome) };
}
