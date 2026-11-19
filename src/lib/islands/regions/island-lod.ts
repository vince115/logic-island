import { hexToWorld } from '../hex';
import { placementPose, type HexGlbSettlement } from '../hex-buildings';
import { tileHeight } from '../hex-world';
import type { OverviewOutline, SeaPoint } from './world-overview-geometry';

/*
 * P9 S1: an island at the world overview's level of detail. The world level may draw less than the region map does
 * (S1 brief: it need not share the high-detail mesh), but what it draws must be the same island: the same place among
 * its neighbours, the same outline, the same high ground and the same landmarks. So the low-detail island is derived,
 * never authored: from the island's own settlement on its region map, through the very placement the overview shrinks
 * that map with. A world scene that draws terrain, relief or landmarks takes them from here and stays in step with the
 * region map by construction; tests/island-registry.test.ts holds the two levels together.
 */
export interface IslandLod {
  islandId: string;
  /** The island's outline at this level: its tiles' centres on the sea, and a tile's radius there. */
  tiles: SeaPoint[]; tileRadius: number;
  /** Its centre tile (where its roads meet on the region map), and how far its land reaches from there. */
  center: SeaPoint; reach: number;
  /** Its relief, in overview units: every tile's height above the base land, the highest of them and where it is. */
  heights: number[]; peak: number; summit: SeaPoint;
  /** Where its GLB nodes stand on the region map, moved to the overview: the island's landmarks at this level. */
  landmarks: { node: string; at: SeaPoint; height: number }[];
  /** Drawn as a planned island on the region map (HexSettlement.planned). */
  planned: boolean;
}

/** Every island of an overview outline (a region, or the hub) at the overview's level of detail, in the map's own order. */
export function islandLods(outline: OverviewOutline, glb: readonly HexGlbSettlement[] = []): IslandLod[] {
  const { world, placed, radius: tileRadius } = outline;
  return world.settlements.map(settlement => {
    const tiles = settlement.tiles.map(t => placed.point(...hexToWorld(t, world.size)));
    const heights = settlement.tiles.map(t => tileHeight(t) * placed.scale);
    const center = placed.point(...hexToWorld(settlement.center, world.size));
    const top = heights.reduce((best, h, i) => h > heights[best] ? i : best, 0);
    const layout = glb.find(g => g.islandId === settlement.islandId);
    return {
      islandId: settlement.islandId, tiles, tileRadius, center,
      reach: Math.max(...tiles.map(t => Math.hypot(t[0] - center[0], t[1] - center[1]))) + tileRadius,
      heights, peak: heights[top], summit: tiles[top],
      landmarks: (layout?.placements ?? []).map(p => {
        const { position } = placementPose(world, settlement.islandId, p);
        return { node: p.node, at: placed.point(position[0], position[2]), height: position[1] * placed.scale };
      }),
      planned: settlement.planned === true,
    };
  });
}
