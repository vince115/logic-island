import type { GlbAsset, GlbAssetId, IslandModelId } from './types';

/** Original local geometry. No remote assets, empty GLB URLs, or hidden downloads. */
export const assetRegistry = {
  'beacon-workshop': { source: 'original-geometry', component: 'BeaconWorkshop', label: '岩岸燈塔工作坊' },
  'data-harbor': { source: 'original-geometry', component: 'DataHarbor', label: '台地資料港' },
  'algorithm-observatory': { source: 'original-geometry', component: 'AlgorithmObservatory', label: '山脊觀測站' },
} as const satisfies Record<IslandModelId, { source: 'original-geometry'; component: string; label: string }>;

/**
 * Runtime GLBs derived by scripts/assets/derive-runtime-glb.mjs (provenance in docs/assets/).
 * Islands opt in with `glbAssetId`; `fallback` geometry renders while loading and on failure.
 */
export const glbAssets = {
  'basics-island-v2.1': {
    source: 'glb',
    url: '/models/islands/basics-island.v2.1.glb',
    version: '2.1',
    sha256: '37226e9ba7dfa7c6b839e352da8214788010b5dc148acc6f7c1416bb2ac3fb55',
    bytes: 879708,
    root: 'Island_Basics_Root',
    scale: 0.6,
    fallback: 'beacon-workshop',
    nodes: [
      { node: 'Building_Workshop', kind: 'target', role: 'course_entry', interactionId: 'learn', anchor: 'Anchor_Workshop',
        action: { type: 'route', href: '/learn' } },
      { node: 'Landmark_Lighthouse', kind: 'target', role: 'learning_landmark', interactionId: 'lighthouse', anchor: 'Anchor_Lighthouse',
        action: { type: 'info', title: '燈塔', text: '基礎程式島的地標，提醒你學習從理解開始。' } },
      { node: 'Dock_Entry', kind: 'target', role: 'entry', interactionId: 'entry', anchor: 'Anchor_Entry',
        action: { type: 'info', title: '碼頭', text: '群島的入口，從這裡出發前往其他島嶼。' } },
      { node: 'Anchor_Workshop', kind: 'anchor', role: 'learn', interactionId: 'learn', label: '工坊 · 學習路線' },
      { node: 'Anchor_Lighthouse', kind: 'anchor', role: 'lighthouse', interactionId: 'lighthouse', label: '燈塔' },
      { node: 'Anchor_Entry', kind: 'anchor', role: 'entry', interactionId: 'entry', label: '碼頭' },
      // route_exit has no label or behavior until Phase E island relations.
      { node: 'Anchor_Route_Exit', kind: 'anchor', role: 'route_exit', interactionId: 'route_exit' },
    ],
  },
} as const satisfies Record<GlbAssetId, GlbAsset>;
