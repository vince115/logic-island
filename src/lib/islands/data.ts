import type { IslandBounds, IslandDefinition, Vec3 } from './types';

export const islands: IslandDefinition[] = [
  {
    id: 'foundations', name: '基礎程式島', englishName: 'THE FIRST LIGHT',
    description: '從這座燈塔出發，找到適合自己的學習起點。此島作為導覽，尚無專屬教材。',
    landmark: '燈塔工作坊 · 從理解開始', modelId: 'beacon-workshop',
    // Bounds follow the v2.1 GLB at scale 0.6; beacon-workshop stays as its fallback geometry.
    position: [-6.6, 0, 1.4], bounds: { min: [-3.3, -2, -2.2], max: [3.2, 5.4, 3] }, glbAssetId: 'basics-island-v2.1',
    accent: '#4285f4', courseSlugs: [], catalogEntry: { href: '/learn', label: '瀏覽學習路線' },
  },
  {
    id: 'structures', name: '資料結構島', englishName: 'THE DATA HARBOR',
    description: '沿著碼頭看見資料如何排列、堆疊與排隊。選一份教材，進入真正的互動實驗室。',
    landmark: '資料港 · 儲存、堆疊、流動', modelId: 'data-harbor',
    position: [0.1, 0.15, -4.6], bounds: { min: [-3.6, -2, -2.9], max: [3.6, 4.2, 3.3] },
    accent: '#188038', courseSlugs: ['array', 'stack', 'queue'],
  },
  {
    id: 'algorithms', name: '演算法島', englishName: 'THE DISCOVERY RIDGE',
    description: '沿著山脊縮小搜尋範圍，在階梯庭院觀察數值排列。讓每一次選擇都有理由。',
    landmark: '探索山脊 · 比較與選擇', modelId: 'algorithm-observatory',
    position: [6.5, -0.05, 1.1], bounds: { min: [-3.4, -1.9, -2.9], max: [3.4, 4.8, 2.9] },
    accent: '#db4437', courseSlugs: ['binary-search', 'bubble-sort'],
  },
];

/**
 * 2026-11-01: 互動實驗島 (Interactive Lab Island), the labs of /learn as an island, on the home page's map only (`islandsHomeWorld`); `islands`
 * above, which /islands and /islands/candidate show, stays three. The hex map draws its own landmark and frames it from
 * its tiles, so `modelId`, `position` and `bounds` are never used for it.
 */
export const labIsland: IslandDefinition = {
  id: 'labs', name: '互動實驗島', englishName: 'INTERACTIVE LAB ISLAND',
  description: '把每一步畫出來：自己輸入資料，逐步播放陣列、堆疊、佇列、搜尋、排序與圖的走訪。',
  landmark: '實驗穹頂 · 看見每一步', modelId: 'algorithm-observatory',
  position: [0, 0, 0], bounds: { min: [-3, -2, -3], max: [3, 3, 3] },
  accent: '#8a4fd1', courseSlugs: ['array', 'stack', 'queue', 'binary-search', 'bubble-sort', 'bfs'],
};

/**
 * Phase F.2 (2026-11-02): 資料庫應用島 (DB01–DB20), on the home page's map only (`islandsHomeWorld`), like `labIsland`:
 * `islands` above, which /islands and /islands/candidate show, stays three. The hex map draws its settlement and its
 * Transitional Art landmarks, so `modelId`, `position` and `bounds` are never used for it. Name, accent and landmark
 * match the world registry (src/content/world/islands.ts), which tests check.
 */
export const databaseIsland: IslandDefinition = {
  id: 'databases', name: '資料庫應用島', englishName: 'THE DATA VAULT',
  description: '從資料表與 SQL 查詢出發，走過 ER 設計、正規化、索引與交易，再到程式串接、資安、NoSQL 與備份複寫。',
  landmark: '資料庫主塔 · 查詢、設計與交易', modelId: 'data-harbor',
  position: [0, 0, 0], bounds: { min: [-3, -2, -3], max: [3, 3, 3] },
  accent: '#2f7d6d', courseSlugs: [],
};

/** World bounds are data-driven; adding islands does not require camera rewrites. */
export function getWorldBounds(items: readonly IslandDefinition[]): IslandBounds {
  if (!items.length) return { min: [-1, -1, -1], max: [1, 1, 1] };
  return {
    min: [0, 1, 2].map(axis => Math.min(...items.map(i => i.position[axis] + i.bounds.min[axis]))) as Vec3,
    max: [0, 1, 2].map(axis => Math.max(...items.map(i => i.position[axis] + i.bounds.max[axis]))) as Vec3,
  };
}
export function getFocusBounds(island: IslandDefinition): IslandBounds {
  return {
    min: island.bounds.min.map((v, axis) => v + island.position[axis]) as Vec3,
    max: island.bounds.max.map((v, axis) => v + island.position[axis]) as Vec3,
  };
}
