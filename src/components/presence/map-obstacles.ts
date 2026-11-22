import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import type { KeepOutCircle } from '@/lib/presence/npc-paths';
import { placeholderLandmarkTiles } from '../islands/hex-world/hex-landmarks';

/**
 * P3: the footprints of what a hex map draws by code, for the figures to keep clear of (npc-zones.ts `obstacles`).
 * The layout already holds its GLB buildings' footprints (WorldLayout.natural.keepOut); this adds the landmarks that
 * exist only as components, read from the same data those components draw from:
 *
 *   - an island's placeholder pieces (hex-landmarks.tsx: warehouse, observatory, lab dome…), one circle a tile;
 *   - 資料庫應用島's Transitional Art (database-island.ts DATABASE_LANDMARKS);
 *   - nothing for a planned island in mist (its survey marker stands on the centre, inside the figures' ring) and
 *     nothing for an island that draws its own landmarks (P9: the scene gives those footprints itself).
 *
 * An island with GLB buildings shows placeholders only while its model loads or fails; the GLB's own footprints are
 * what its roads are kept clear of.
 */
/** A placeholder piece is at most a hex's inner width across (the warehouse's base is 0.95 square, a tree leans 0.3 off centre). */
export const LANDMARK_RADIUS = 0.85;

export function mapObstacles(layout: WorldLayout): KeepOutCircle[] {
  const { world, glb } = layout, circles: KeepOutCircle[] = [];
  for (const settlement of world.settlements) {
    if (settlement.ownLandmarks || settlement.planned || glb.some(g => g.islandId === settlement.islandId)) continue;
    const tiles: Axial[] = settlement.islandId === 'databases'
      ? DATABASE_LANDMARKS.map(l => ({ q: settlement.center.q + l.at.q, r: settlement.center.r + l.at.r }))
      : placeholderLandmarkTiles(settlement);
    for (const tile of tiles) { const [x, z] = hexToWorld(tile, world.size); circles.push([x, z, LANDMARK_RADIUS]); }
  }
  return circles;
}
