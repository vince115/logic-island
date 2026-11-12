import type { RegionId } from '@/content/world/types';
import { hexToWorld } from '../hex';
import { worldCenter, type HexWorld } from '../hex-world';
import { islandsHomeWorld } from '../islands-world';
import { MAP_VIEW } from '../map-view';
import type { StageBox, StageLand, StageLine } from './overview-labels';
import type { OverviewPlacement, OverviewShape, RegionLayout, WorldLink, WorldMapSpec } from './schema';
import { distanceToSegment, worldLinks } from './world-map';

/*
 * P8.3: the world overview as plain geometry on the sea plane, with no renderer in it: where every outline's tiles
 * stand once a region is shrunk onto its place, and where each link of the world's topology (world-map.ts) runs. The
 * overview scene draws exactly this, and unit tests check it, so "no link runs through an island" is a rule of the
 * data and not something a screenshot has to catch.
 */
export type SeaPoint = [x: number, z: number];
export type OverviewPartId = RegionId | 'hub';

// The sea plane's screen-aligned axes for the map's view: `RIGHT` runs to the right of the screen, `AWAY` from the viewer.
const flat = Math.hypot(MAP_VIEW[0], MAP_VIEW[2]);
const RIGHT = [MAP_VIEW[2] / flat, -MAP_VIEW[0] / flat], AWAY = [-MAP_VIEW[0] / flat, -MAP_VIEW[2] / flat];
/** A world-map position ([right, away]) as a point of the sea plane. */
export const onSea = ([right, away]: readonly [number, number]): SeaPoint => [RIGHT[0] * right + AWAY[0] * away, RIGHT[1] * right + AWAY[1] * away];

export interface Placed { scale: number; point: (x: number, z: number) => SeaPoint }
/** Shrinks a world onto its place: `width` across its longest side. */
export function placing(world: HexWorld, { at, width }: OverviewPlacement): Placed {
  const [cx, cz] = worldCenter(world), anchor = onSea(at);
  const all = world.settlements.flatMap(s => s.tiles.map(t => hexToWorld(t, world.size)));
  const span = Math.max(...[0, 1].map(i => Math.max(...all.map(p => p[i])) - Math.min(...all.map(p => p[i])))) + world.size * 2;
  const scale = width / span;
  return { scale, point: (x, z) => [anchor[0] + (x - cx) * scale, anchor[1] + (z - cz) * scale] };
}

/** One outline of the overview (a region or the hub): its world, how it is placed, and its tiles on the sea. */
export interface OverviewOutline {
  id: OverviewPartId; world: HexWorld; placed: Placed;
  /** Every tile's center on the sea, and a tile's circumradius there. */
  tiles: SeaPoint[]; radius: number;
}
function outline(id: OverviewPartId, world: HexWorld, place: OverviewPlacement): OverviewOutline {
  const placed = placing(world, place);
  return { id, world, placed, tiles: world.settlements.flatMap(s => s.tiles.map(t => placed.point(...hexToWorld(t, world.size)))), radius: world.size * placed.scale };
}
/** The hub's own little world: the shared island alone, as the home map draws it. */
export function hubWorld(map: WorldMapSpec): HexWorld {
  const island = islandsHomeWorld.world.settlements.find(s => s.islandId === map.hub.islandId);
  if (!island) throw new Error(`world map: hub island ${map.hub.islandId} is not on the home map`);
  return { size: islandsHomeWorld.world.size, settlements: [island], bridges: [] };
}
/** Every outline of the overview in this shape: the placed regions that have a layout, in the map's order, then the hub. */
export function overviewOutlines(map: WorldMapSpec, layouts: Partial<Record<RegionId, RegionLayout>>, shape: OverviewShape): OverviewOutline[] {
  const regions = (Object.keys(map.regions) as RegionId[]).flatMap(id => { const region = layouts[id]; return region ? [outline(id, region.layout.world, map.regions[id]![shape])] : []; });
  return [...regions, outline('hub', hubWorld(map), map.hub[shape])];
}

/** A link of the topology as drawn: from `a` to `b` on the sea, landing on the two tiles whose centers are `ends`. */
export interface OverviewLink extends WorldLink { a: SeaPoint; b: SeaPoint; ends: [SeaPoint, SeaPoint] }
/**
 * How wide a link's deck is drawn (overview units) in each composition; the phone's outlines are smaller, and so are
 * its decks. A hub causeway is wider than a relation bridge.
 */
export const LINK_WIDTH: Record<OverviewShape, Record<WorldLink['kind'], number>> = { wide: { hub: .55, relation: .42 }, tall: { hub: .36, relation: .28 } };
/** How far into the tile it lands on a deck reaches (of the tile's radius). */
const REACH = .72;

const distance = (a: SeaPoint, b: SeaPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const toward = (from: SeaPoint, to: SeaPoint, by: number): SeaPoint => { const d = distance(from, to) || 1; return [from[0] + (to[0] - from[0]) / d * by, from[1] + (to[1] - from[1]) / d * by]; };
const nearest = (points: SeaPoint[], to: SeaPoint) => points.reduce((best, p) => distance(p, to) < distance(best, to) ? p : best);
/**
 * Where the links run: every link takes the shortest crossing, between the two tiles of its two outlines that are
 * closest to each other. That needs no hand-placed endpoint, so it stays valid when a region's map or its place
 * changes, and the shortest crossing cannot pass over another tile of the outlines it joins. Links of regions without
 * an outline (no layout yet) are left out.
 */
export function overviewLinks(map: WorldMapSpec, outlines: OverviewOutline[]): OverviewLink[] {
  const part = (id: OverviewPartId) => outlines.find(o => o.id === id);
  return worldLinks(map).flatMap(link => {
    const from = part(link.from), to = part(link.to);
    if (!from || !to) return [];
    let pair: [SeaPoint, SeaPoint] = [from.tiles[0], to.tiles[0]];
    for (const a of from.tiles) { const b = nearest(to.tiles, a); if (distance(a, b) < distance(...pair)) pair = [a, b]; }
    return [{ ...link, a: toward(pair[0], pair[1], from.radius * REACH), b: toward(pair[1], pair[0], to.radius * REACH), ends: pair }];
  });
}

const crosses = (a: SeaPoint, b: SeaPoint, c: SeaPoint, d: SeaPoint) => {
  const side = (p: SeaPoint, q: SeaPoint, r: SeaPoint) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};
/**
 * P8.3 rule 6 as a check on the drawn geometry: a link's deck stays out of every tile it does not land on (it may
 * touch a tile's corner, never its inscribed circle), in its own outlines and in every other, and no two links cross.
 * Returns every rule broken.
 */
export function validateOverviewLinks(outlines: OverviewOutline[], links: OverviewLink[], shape: OverviewShape): string[] {
  const problems: string[] = [];
  for (const link of links) for (const part of outlines) {
    const inner = part.radius * Math.sqrt(3) / 2;
    const hit = part.tiles.some(tile => !link.ends.some(end => distance(end, tile) < 1e-9) && distanceToSegment(tile, link.a, link.b) < inner + LINK_WIDTH[shape][link.kind] / 2);
    if (hit) problems.push(`${link.id} runs over ${part.id}`);
  }
  for (const [i, a] of links.entries()) for (const b of links.slice(i + 1)) if (crosses(a.a, a.b, b.a, b.b)) problems.push(`${a.id} crosses ${b.id}`);
  return problems;
}

/* ------------------------------------------------------------------ the overview on the stage (px) */

// The screen's axes for the map's view, in scene space: a point's place on screen is its dot with `right` and `up`.
const length = Math.hypot(...MAP_VIEW), view = MAP_VIEW.map(v => v / length);
const right3 = [RIGHT[0], 0, RIGHT[1]], up3 = [view[1] * right3[2], view[2] * right3[0] - view[0] * right3[2], -view[1] * right3[0]];
/** Heights of what the overview draws: land with lessons, planned land, and the links' decks (lower than any land). */
export const OVERVIEW_HEIGHT = { land: .5, planned: .32, link: .24 } as const;
/** Room kept around the outlines (px): the site header floats over a wide stage, and labels hang above and below. */
export const OVERVIEW_ROOM = { wide: { top: 132, bottom: 84, side: 28 }, tall: { top: 52, bottom: 46, side: 14 } } as const;

/**
 * The fixed orthographic framing of the overview for a stage size: every outline fits, with room for its label, left
 * of `insetRight` (the guide over a wide stage). `center` is where the camera looks, on the screen's axes and in scene
 * space; `stage` puts a sea point at a height on the stage in px; `boxes` are the outlines' own extents there.
 */
export interface OverviewFrame { zoom: number; center: [number, number, number]; stage: (point: SeaPoint, height: number) => [number, number]; boxes: StageBox[] }
export function frameOverview(outlines: OverviewOutline[], shape: OverviewShape, size: { width: number; height: number }, insetRight: number): OverviewFrame {
  const room = OVERVIEW_ROOM[shape], h = OVERVIEW_HEIGHT.land;
  const axes = ([x, z]: SeaPoint, y: number): [number, number] => [x * right3[0] + z * right3[2], x * up3[0] + y * up3[1] + z * up3[2]];
  const reach = outlines.map(o => { const at = o.tiles.map(t => axes(t, h)), rs = at.map(p => p[0]), us = at.map(p => p[1]); return [Math.min(...rs) - o.radius, Math.max(...rs) + o.radius, Math.min(...us) - o.radius, Math.max(...us) + o.radius]; });
  const [r0, r1, u0, u1] = [Math.min(...reach.map(r => r[0])), Math.max(...reach.map(r => r[1])), Math.min(...reach.map(r => r[2])), Math.max(...reach.map(r => r[3]))];
  const free = { width: size.width - insetRight - room.side * 2, height: size.height - room.top - room.bottom };
  const zoom = Math.max(1, Math.min(free.width / (r1 - r0), free.height / (u1 - u0)));
  // The outlines sit in the middle of the free part of the stage: left of the guide, between the label rooms.
  const cr = (r0 + r1) / 2 + insetRight / 2 / zoom, cu = (u0 + u1) / 2 + (room.top - room.bottom) / 2 / zoom;
  const px = (r: number, u: number): [number, number] => [size.width / 2 + (r - cr) * zoom, size.height / 2 - (u - cu) * zoom];
  return {
    zoom, center: [right3[0] * cr + up3[0] * cu, up3[1] * cu, right3[2] * cr + up3[2] * cu],
    stage: (point, height) => px(...axes(point, height)),
    boxes: reach.map(([a, b, c, d]) => { const [x0, y0] = px(a, d), [x1, y1] = px(b, c); return { x0, y0, x1, y1 }; }),
  };
}
/** The links as drawn on the stage. */
export const stageLines = (frame: OverviewFrame, links: OverviewLink[], shape: OverviewShape): StageLine[] => links.map(l => {
  const [x0, y0] = frame.stage(l.a, OVERVIEW_HEIGHT.link), [x1, y1] = frame.stage(l.b, OVERVIEW_HEIGHT.link);
  return { id: l.id, kind: l.kind, x0, y0, x1, y1, width: LINK_WIDTH[shape][l.kind] * frame.zoom };
});
/** Every outline's tiles on the stage: their centers and a tile's radius in px. */
export const stageLands = (frame: OverviewFrame, outlines: OverviewOutline[]): StageLand[] =>
  outlines.map(o => ({ points: o.tiles.map(t => frame.stage(t, OVERVIEW_HEIGHT.land)), radius: o.radius * frame.zoom }));
