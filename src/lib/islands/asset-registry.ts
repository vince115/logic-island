import type { GlbAsset, IslandModelId } from './types';

/** Original local geometry. No remote assets, empty GLB URLs, or hidden downloads. */
export const assetRegistry = {
  'beacon-workshop': { source: 'original-geometry', component: 'BeaconWorkshop', label: '岩岸燈塔工作坊' },
  'data-harbor': { source: 'original-geometry', component: 'DataHarbor', label: '台地資料港' },
  'algorithm-observatory': { source: 'original-geometry', component: 'AlgorithmObservatory', label: '山脊觀測站' },
} as const satisfies Record<IslandModelId, { source: 'original-geometry'; component: string; label: string }>;

/**
 * Runtime GLBs derived by scripts/assets/derive-runtime-glb.mjs (provenance in docs/assets/).
 * Islands opt in with `glbAssetId`; `fallback` geometry renders while loading and on failure.
 *
 * P9 S1: this is the GLB Asset Registry of every island, keyed by asset id. An island's asset is one entry here
 * (`islandId` says whose), checked against the Scale and Anchor Contract (glb-island-contract.ts) and against its
 * file (sha256, bytes, node names and bounds) in tests; `GlbAssetId` is the set of keys, so nothing else lists the
 * assets. Each entry holds what the file is, never what a click does: actions and labels are the island's interaction
 * spec (island-interactions.ts), joined to the nodes by `interactionId`.
 */
export const glbAssets = {
  'basics-island-v2.1': {
    source: 'glb',
    islandId: 'foundations',
    url: '/models/islands/basics-island.v2.1.glb',
    version: '2.1',
    sha256: '37226e9ba7dfa7c6b839e352da8214788010b5dc148acc6f7c1416bb2ac3fb55',
    bytes: 879708,
    root: 'Island_Basics_Root',
    scale: 0.6,
    fallback: 'beacon-workshop',
    nodes: [
      { node: 'Building_Workshop', kind: 'target', role: 'course_entry', interactionId: 'learn', anchor: 'Anchor_Workshop' },
      { node: 'Landmark_Lighthouse', kind: 'target', role: 'learning_landmark', interactionId: 'lighthouse', anchor: 'Anchor_Lighthouse' },
      { node: 'Dock_Entry', kind: 'target', role: 'entry', interactionId: 'entry', anchor: 'Anchor_Entry' },
      { node: 'Anchor_Workshop', kind: 'anchor', role: 'learn', interactionId: 'learn' },
      { node: 'Anchor_Lighthouse', kind: 'anchor', role: 'lighthouse', interactionId: 'lighthouse' },
      { node: 'Anchor_Entry', kind: 'anchor', role: 'entry', interactionId: 'entry' },
      // route_exit has no target, so no label or behavior, until island relations use it.
      { node: 'Anchor_Route_Exit', kind: 'anchor', role: 'route_exit', interactionId: 'route_exit' },
    ],
    // The workshop is about 1.8 × 1.9 at 0.6 scale, so three circles.
    footprints: {
      Landmark_Lighthouse: [[0, 0, 0.8]], Dock_Entry: [[0, 0, 0.9]], Building_Workshop: [[-0.55, 0.15, 1], [0, 0.15, 1], [0.55, 0.15, 1]],
    },
  },
} as const satisfies Record<string, GlbAsset>;
export type GlbAssetId = keyof typeof glbAssets;
export const GLB_ASSET_IDS = Object.keys(glbAssets) as GlbAssetId[];
/** The runtime GLB of an island, when it has one. */
export const glbAssetOfIsland = (islandId: string): GlbAssetId | undefined => GLB_ASSET_IDS.find(id => glbAssets[id].islandId === islandId);

/**
 * The shared trees of every hex map are instanced from this asset's `Tree_###` nodes (hex-nature-data.ts TREE_NODES),
 * read from the same cached file as the island itself. A shared vegetation kit would replace this one line.
 */
export const VEGETATION_ASSET: GlbAssetId = 'basics-island-v2.1';
