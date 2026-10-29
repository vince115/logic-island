import type { IslandModelId } from './types';

/** Original local geometry. No remote assets, empty GLB URLs, or hidden downloads. */
export const assetRegistry = {
  'beacon-workshop': { source: 'original-geometry', component: 'BeaconWorkshop', label: '岩岸燈塔工作坊' },
  'data-harbor': { source: 'original-geometry', component: 'DataHarbor', label: '台地資料港' },
  'algorithm-observatory': { source: 'original-geometry', component: 'AlgorithmObservatory', label: '山脊觀測站' },
} as const satisfies Record<IslandModelId, { source: 'original-geometry'; component: string; label: string }>;
