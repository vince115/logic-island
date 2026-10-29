import type { IslandBounds, IslandDefinition, Vec3 } from './types';

export const islands: IslandDefinition[] = [
  {
    id: 'foundations', name: '基礎程式島', englishName: 'THE FIRST LIGHT',
    description: '從這座燈塔出發，找到適合自己的學習起點。此島作為導覽，尚無專屬教材。',
    landmark: '燈塔工作坊 · 從理解開始', modelId: 'beacon-workshop',
    position: [-6.6, 0, 1.4], bounds: { min: [-3.2, -1.9, -2.8], max: [3.2, 5.4, 2.8] },
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
