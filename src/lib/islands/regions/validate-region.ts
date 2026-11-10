import { hexDistance, hexKey, hexNeighbor, type Axial } from '../hex';
import { settlementRoads, validateHexWorld, type HexSettlement } from '../hex-world';
import type { RegionLayout } from './region-layouts';

/**
 * M3.1 Region Layout Validator (docs/planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md §2.4), on top of `validateHexWorld`:
 * the region holds exactly the registry's islands, two water hexes between islands, bridges across one to three,
 * bridge ports on level open land away from landmarks, cliff beaches and docks, roads that pass no landmark, and docks
 * facing the sea. `reserved` lists each island's landmark and building tiles (tests take them from the landmark
 * components and the GLB placements, so the validator holds no copy). `accepted` bridges were reviewed on the home page
 * (the stone bridge lands on the algorithms ridge by design) and skip the port rules. Returns every rule broken.
 */
export function validateRegion(region: RegionLayout, islandIds: readonly string[], reserved: Record<string, Axial[]>, accepted: readonly string[] = []): string[] {
  const { world } = region.layout;
  const problems = validateHexWorld(world, islandIds);
  const ids = world.settlements.map(s => s.islandId);
  if ([...ids].sort().join() !== [...islandIds].sort().join()) problems.push(`islands ${ids.join(', ')} are not the region's ${islandIds.join(', ')}`);

  const gap = (a: HexSettlement, b: HexSettlement) => Math.min(...a.tiles.flatMap(t => b.tiles.map(u => hexDistance(t, u)))) - 1;
  for (const [i, a] of world.settlements.entries()) for (const b of world.settlements.slice(i + 1)) {
    if (gap(a, b) < 2) problems.push(`${a.islandId} and ${b.islandId}: ${gap(a, b)} water hex between them, need 2`);
  }

  const held = (islandId: string) => new Set((reserved[islandId] ?? []).map(hexKey));
  const docks = world.settlements.flatMap(s => (s.spurs ?? []).filter(spur => spur.edge !== undefined).map(spur => ({ islandId: s.islandId, tile: spur.tile })));
  for (const bridge of world.bridges) {
    const water = hexDistance(bridge.from.tile, bridge.to.tile) - 1;
    if (water < 1 || water > 3) problems.push(`${bridge.id}: crosses ${water} water hexes, need 1–3`);
    for (const port of accepted.includes(bridge.id) ? [] : [bridge.from, bridge.to]) {
      const settlement = world.settlements.find(s => s.islandId === port.islandId);
      const tile = settlement?.tiles.find(t => t.q === port.tile.q && t.r === port.tile.r);
      const at = `${bridge.id}: ${port.islandId} port ${hexKey(port.tile)}`;
      if (!settlement || !tile) continue;
      if ((tile.height ?? 0) !== 0) problems.push(`${at} is raised (${tile.height})`);
      if (['forest', 'stone', 'plaza', 'shore'].includes(tile.terrain)) problems.push(`${at} is ${tile.terrain}`);
      if (held(port.islandId).has(hexKey(port.tile))) problems.push(`${at} is a landmark tile`);
      if ((settlement.cliffBeaches ?? []).some(t => t.q === port.tile.q && t.r === port.tile.r)) problems.push(`${at} is a cliff beach`);
      if (docks.some(d => d.islandId === port.islandId && hexDistance(d.tile, port.tile) <= 1)) problems.push(`${at} is next to a dock`);
    }
  }
  // Roads run from the plaza to each port and spur; only a spur may end on its own landmark tile (a dock, a door).
  for (const road of settlementRoads(world)) {
    const blocked = held(road.islandId), end = road.tiles.at(-1);
    for (const hex of road.tiles.slice(1)) {
      if (blocked.has(hexKey(hex)) && !(road.bridgeId === undefined && end && hexKey(end) === hexKey(hex))) problems.push(`${road.routeId}: road crosses landmark tile ${hexKey(hex)} on ${road.islandId}`);
    }
  }
  const owner = new Set(world.settlements.flatMap(s => s.tiles.map(hexKey)));
  if (!region.docks.length) problems.push(`${region.regionId}: no dock for the ferry routes`);
  for (const dock of region.docks) {
    const spur = world.settlements.find(s => s.islandId === dock.islandId)?.spurs?.find(s => s.id === dock.spurId);
    if (!spur || spur.edge === undefined) problems.push(`${dock.spurId}: not a dock spur of ${dock.islandId}`);
    else if (owner.has(hexKey(hexNeighbor(spur.tile, spur.edge)))) problems.push(`${dock.spurId}: does not face the sea`);
  }
  return problems;
}
