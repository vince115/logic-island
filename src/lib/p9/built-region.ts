import { hexDistance, hexKey, type Axial } from '@/lib/islands/hex';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import type { ForestPatch } from '@/lib/islands/hex-nature-data';
import type { HexSettlement, HexTile, HexWorld } from '@/lib/islands/hex-world';
import { regionLayout, type RegionLayout } from '@/lib/islands/regions/region-layouts';
import type { RegionId } from '@/content/world/types';
import type { PlannedLandscape } from './cs-region';
import { clearTiles, pickSites } from './island-sites';

/*
 * P9.3: a region's map as P9 draws it, from its approved layout. Every island is built: a planned island keeps its id,
 * centre, outline, bridges and roads, loses the mist, and gets the same treatment as an island with lessons: a rise
 * under its main landmark, a few woods on its outer tiles and landmark sites (island-sites.ts) for its buildings
 * (src/components/p9/landmarks). That an island is planned stays where it always was, in the world registry: its label
 * says 規劃中 and it opens no lesson. Nothing here moves an island or a bridge.
 */
const MAIN_RISE = .4, SECOND_RISE = .2;
/** How many of an island's outer clear tiles become woods (the rest stay open for the buildings and the coast). */
const WOODS = 3;

export function buildIsland(world: HexWorld, settlement: HexSettlement): { settlement: HexSettlement; sites: Axial[]; woods: Axial[] } {
  const sites = pickSites(world, settlement, 4);
  const taken = new Set(sites.map(hexKey));
  const woods = clearTiles(world, settlement).filter(t => !taken.has(hexKey(t)) && hexDistance(t, settlement.center) >= 2)
    .filter(t => sites.every(s => hexDistance(s, t) >= 1)).reverse().slice(0, WOODS);
  const wood = new Set(woods.map(hexKey));
  const tiles: HexTile[] = settlement.tiles.map(t => {
    const key = hexKey(t);
    if (sites[0] && key === hexKey(sites[0])) return { ...t, terrain: 'grass', height: MAIN_RISE };
    if (taken.has(key)) return { ...t, terrain: t.terrain === 'sand' ? 'meadow' : 'grass', height: SECOND_RISE };
    if (wood.has(key)) return { ...t, terrain: 'forest' };
    return t;
  });
  const { planned: _planned, ...rest } = settlement;
  void _planned;
  return { settlement: { ...rest, tiles, ownLandmarks: true }, sites, woods };
}

export function builtRegion(id: Exclude<RegionId, 'cs'>): { region: RegionLayout; landscapes: PlannedLandscape[] } {
  const base = regionLayout(id), { world } = base.layout;
  const built = world.settlements.map(s => buildIsland(world, s));
  const p9World: HexWorld = { ...world, settlements: built.map(b => b.settlement) };
  const forests: ForestPatch[] = [...base.layout.forests.filter(f => !built.some(b => b.settlement.islandId === f.islandId)),
    ...built.filter(b => b.woods.length).map(b => ({ islandId: b.settlement.islandId, tiles: b.woods, density: 4 }))];
  const layout: WorldLayout = { ...base.layout, world: p9World, forests };
  const landscapes = built.filter(b => b.sites.length).map(b => ({ islandId: b.settlement.islandId, center: b.settlement.center, tiles: b.sites }));
  return { region: { ...base, layout }, landscapes };
}
