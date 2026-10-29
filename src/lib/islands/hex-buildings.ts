import { hexEdgeMidpoint, hexToWorld, type Axial, type HexEdge } from './hex';
import { LAND_TOP, findTile, tileHeight, type HexWorld } from './hex-world';
import type { GlbAssetId } from './types';

/**
 * Where one GLB subtree stands on the hex map. The node keeps its own local geometry; only its
 * pivot moves. With `edge`, the pivot sits on that edge midpoint and the node's +z faces outward.
 * With `across`, the pivot sits on the edge shared with that neighbor, so the node spans both tiles
 * (which must be level) without turning.
 */
export interface HexGlbPlacement { node: string; tile: Axial; edge?: HexEdge; across?: HexEdge; offset?: [number, number] }
/** `label` lifts the settlement name above its tallest building instead of the plaza. */
export interface HexGlbSettlement { islandId: string; asset: GlbAssetId; placements: HexGlbPlacement[]; label?: { tile: Axial; height: number } }

/** D.2b trial: only the foundations island uses real GLB buildings. */
export const hexGlbSettlements: HexGlbSettlement[] = [
  {
    // The name label floats over the low south-east trees, clear of the lighthouse behind.
    islandId: 'foundations', asset: 'basics-island-v2.1', label: { tile: { q: 1, r: 0 }, height: 2.9 },
    placements: [
      // Raised north headland (tile height 0.5) keeps the lighthouse above the plaza.
      { node: 'Landmark_Lighthouse', tile: { q: 0, r: -1 }, offset: [0, -.2] },
      // Spans (-1, 1) and its northern neighbor (-1, 0): at 0.6 scale it is wider than one tile.
      { node: 'Building_Workshop', tile: { q: -1, r: 1 }, across: 2 },
      // Low shore tile; the south edge faces open water, away from the bridge (north-east).
      { node: 'Dock_Entry', tile: { q: 0, r: 1 }, edge: 5 },
      { node: 'Tree_001', tile: { q: -2, r: 1 }, offset: [-.2, .25] },
      { node: 'Tree_003', tile: { q: 1, r: 0 }, offset: [.25, .1] },
      { node: 'Tree_005', tile: { q: 1, r: 0 }, offset: [-.35, -.3] },
    ],
  },
];

/** World pose (before the scene's map offset) for a placement: position and rotation about y. */
export function placementPose(world: HexWorld, islandId: string, placement: HexGlbPlacement) {
  const tile = findTile(world, islandId, placement.tile);
  if (!tile) throw new Error(`${placement.node}: ${islandId} has no tile ${placement.tile.q},${placement.tile.r}`);
  const [cx, cz] = hexToWorld(tile, world.size);
  const y = LAND_TOP + tileHeight(tile);
  if (placement.across !== undefined) {
    const [mx, mz] = hexEdgeMidpoint(tile, placement.across, world.size), [dx, dz] = placement.offset ?? [0, 0];
    return { position: [mx + dx, y, mz + dz] as [number, number, number], rotation: 0 };
  }
  if (placement.edge === undefined) {
    const [dx, dz] = placement.offset ?? [0, 0];
    return { position: [cx + dx, y, cz + dz] as [number, number, number], rotation: 0 };
  }
  const [mx, mz] = hexEdgeMidpoint(tile, placement.edge, world.size);
  return { position: [mx, y, mz] as [number, number, number], rotation: Math.atan2(mx - cx, mz - cz) };
}
