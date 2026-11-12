import { addAxial, hexDirection, hexDistance, hexNeighbor, oppositeEdge, HEX_EDGES, type Axial, type HexEdge } from '../hex';
import { plannedSettlement, shape, type WorldLayout } from '../hex-layout';
import type { HexBridge, HexSpur } from '../hex-world';
import type { LatticeMapSpec, RegionDock } from './schema';

/*
 * P8.2: a region map from placements alone (schema.ts), for regions that have no authored terrain yet. Every island is
 * a radius-2 planned island (19 tiles before trimming) on a coarse hex lattice: neighbouring cells are SPACING tiles
 * apart, which leaves exactly the two water hexes the region validator asks for, and a bridge between neighbours is
 * straight, from the rim tile facing the other island to the one facing back. Adding an island is one placement (and
 * a link); nothing in the scene components changes. Throws on a spec that cannot be built, so a mistake fails the
 * build and the unit tests instead of drawing a broken map.
 */
export const LATTICE_SPACING = 7, LATTICE_RADIUS = 2;
const next = (k: HexEdge) => ((k + 1) % 6) as HexEdge;
/** The rim tile between directions k and k+1, relative to the island's center. */
const rimTile = (k: HexEdge): Axial => addAxial(hexDirection(k), hexDirection(next(k)));
/** The headland beyond rim tile k: the two tiles of the next ring that touch it, and the tip beyond them. */
const headland = (k: HexEdge): Axial[] => [addAxial(rimTile(k), hexDirection(k)), addAxial(rimTile(k), hexDirection(next(k))), addAxial(rimTile(k), rimTile(k))];
export const latticeCenter = ([a, b]: readonly [number, number]): Axial => ({ q: a * LATTICE_SPACING, r: b * LATTICE_SPACING });

export function latticeLayout({ placements, links, bridge }: LatticeMapSpec): { layout: WorldLayout; docks: RegionDock[] } {
  const byId = new Map(placements.map(p => [p.islandId, p]));
  if (byId.size !== placements.length) throw new Error('lattice map: an island is placed twice');
  const cells = new Set(placements.map(p => p.cell.join()));
  if (cells.size !== placements.length) throw new Error('lattice map: two islands share a cell');
  const ports = new Map<string, HexEdge[]>(placements.map(p => [p.islandId, []]));
  const bridges: HexBridge[] = links.map(([from, to]) => {
    const a = byId.get(from), b = byId.get(to);
    if (!a || !b) throw new Error(`lattice map: bridge ${from}-${to} names an island that is not placed`);
    const edge = HEX_EDGES.find(e => { const n = hexNeighbor({ q: a.cell[0], r: a.cell[1] }, e); return n.q === b.cell[0] && n.r === b.cell[1]; });
    if (edge === undefined) throw new Error(`lattice map: ${from} and ${to} are not neighbouring cells`);
    ports.get(from)!.push(edge); ports.get(to)!.push(oppositeEdge(edge));
    return {
      id: `${from}-${to}`, kind: bridge,
      from: { islandId: from, tile: addAxial(latticeCenter(a.cell), hexDirection(edge), LATTICE_RADIUS), edge },
      to: { islandId: to, tile: addAxial(latticeCenter(b.cell), hexDirection(oppositeEdge(edge)), LATTICE_RADIUS), edge: oppositeEdge(edge) },
    };
  });
  // Every island is reached by a bridge (one connected map), unless the region is a single island.
  const reached = new Set<string>(placements.length ? [placements[0].islandId] : []);
  for (let grew = true; grew;) {
    grew = false;
    for (const [from, to] of links) for (const [a, b] of [[from, to], [to, from]]) if (reached.has(a) && !reached.has(b)) { reached.add(b); grew = true; }
  }
  if (reached.size !== placements.length) throw new Error(`lattice map: ${placements.filter(p => !reached.has(p.islandId)).map(p => p.islandId).join(', ')} not joined by bridges`);

  const docks: RegionDock[] = [];
  const settlements = placements.map(p => {
    const center = latticeCenter(p.cell), trim = p.trim ?? [], extend = p.extend ?? [];
    for (const k of extend) {
      // A headland reaches one tile further out, so it needs open sea on both sides it leans toward, and its rim tile.
      if (trim.includes(k)) throw new Error(`lattice map: ${p.islandId} headland ${k} stands on a trimmed tile`);
      for (const e of [k, next(k)]) { const n = hexNeighbor({ q: p.cell[0], r: p.cell[1] }, e); if (cells.has(`${n.q},${n.r}`)) throw new Error(`lattice map: ${p.islandId} headland ${k} leaves less than two water hexes to a neighbour`); }
    }
    let spurs: HexSpur[] | undefined;
    if (p.dock !== undefined) {
      const k = p.dock, tile = addAxial(center, rimTile(k));
      // A dock is more than one tile from every bridge port of its island, on a rim tile that was not trimmed, and the
      // hex it faces is open sea (no other island's cell is that close on the lattice).
      if (trim.includes(k)) throw new Error(`lattice map: ${p.islandId} dock is on a trimmed tile`);
      if (extend.includes(k)) throw new Error(`lattice map: ${p.islandId} dock faces its own headland`);
      if (ports.get(p.islandId)!.some(e => hexDistance(addAxial(center, hexDirection(e), LATTICE_RADIUS), tile) <= 1)) throw new Error(`lattice map: ${p.islandId} dock is next to a bridge port`);
      spurs = [{ id: `${p.islandId}-dock`, tile, edge: k }];
      docks.push({ islandId: p.islandId, spurId: `${p.islandId}-dock` });
    }
    return plannedSettlement({ islandId: p.islandId, center, shape: shape(LATTICE_RADIUS, trim.map(rimTile), extend.flatMap(headland)), ...(spurs ? { spurs } : {}) });
  });
  if (!docks.length) throw new Error('lattice map: no dock for the ferry routes');
  return { layout: { world: { size: 1.25, settlements, bridges }, glb: [], forests: [], zones: { plaza: 0, buildings: 0, forest: 0, hills: 0, shore: 0, open: 0 } }, docks };
}
