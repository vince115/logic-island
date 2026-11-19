import { hexDistance, hexKey, hexToWorld, type Axial } from '@/lib/islands/hex';
import { routeSegments } from '@/lib/islands/hex-natural-scene';
import type { HexSettlement, HexWorld } from '@/lib/islands/hex-world';

/*
 * P9.3: where an island's landmarks stand. A site is a land tile that no road or bridge crosses (its centre at least
 * ROAD_CLEARANCE from every road and bridge centreline), that is not the plaza, a bridge landing or a spur's end, and
 * not shore. The first site is the main landmark's: the clear tile nearest the plaza; each next one is the clear tile
 * farthest from those already taken, so an island's buildings spread over it. Deterministic: the same map gives the
 * same sites.
 */
export const ROAD_CLEARANCE = .72;

type Segment = [[number, number], [number, number]];
const distance = ([[ax, az], [bx, bz]]: Segment, px: number, pz: number) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
  return Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az)));
};

/** The tiles of `settlement` a landmark may stand on, nearest the plaza first. */
export function clearTiles(world: HexWorld, settlement: HexSettlement, routes: Segment[] = routeSegments(world)): Axial[] {
  const blocked = new Set<string>([hexKey(settlement.center)]);
  for (const b of world.bridges) for (const p of [b.from, b.to]) if (p.islandId === settlement.islandId) blocked.add(hexKey(p.tile));
  for (const s of settlement.spurs ?? []) blocked.add(hexKey(s.tile));
  return settlement.tiles
    .filter(t => !blocked.has(hexKey(t)) && t.terrain !== 'shore' && t.terrain !== 'plaza')
    .map(t => { const [x, z] = hexToWorld(t, world.size); return { t: { q: t.q, r: t.r }, clear: Math.min(...routes.map(s => distance(s, x, z))), ring: hexDistance(t, settlement.center) }; })
    .filter(c => c.clear >= ROAD_CLEARANCE)
    .sort((a, b) => a.ring - b.ring || b.clear - a.clear || a.t.q - b.t.q || a.t.r - b.t.r)
    .map(c => c.t);
}

/** Up to `count` sites spread over the island: the main one nearest the plaza, then each farthest from the rest. */
export function pickSites(world: HexWorld, settlement: HexSettlement, count = 4): Axial[] {
  const clear = clearTiles(world, settlement);
  if (!clear.length) return [];
  const sites = [clear[0]];
  while (sites.length < count) {
    let best: Axial | null = null, bestScore = -1;
    for (const t of clear) {
      if (sites.some(s => s.q === t.q && s.r === t.r)) continue;
      const score = Math.min(...sites.map(s => hexDistance(s, t)));
      if (score > bestScore) { best = t; bestScore = score; }
    }
    if (!best) break;
    sites.push(best);
  }
  return sites;
}
