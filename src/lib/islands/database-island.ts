import type { Axial } from './hex';

/**
 * Phase F.2 (2026-11-02): 資料庫應用島's landmarks on the home map, relative to the island's center, named as the nodes of
 * its future GLB. Until that GLB is made they are drawn by the Transitional Art in
 * src/components/islands/hex-world/hex-database-landmarks.tsx; the road from the plaza to the bridge keeps (1, 0) and
 * (1, 1) clear. Kept apart from islands-world.ts so the shared landmark component does not pull in the world layouts.
 */
export const DATABASE_LANDMARKS = [
  { node: 'Landmark_DatabaseTower', role: '資料庫主塔', at: { q: 0, r: -1 } },
  { node: 'Building_IndexHall', role: 'B+ Tree 索引館', at: { q: -1, r: 0 } },
  { node: 'Landmark_ReplicaTowers', role: '資料複寫雙塔', at: { q: 1, r: -1 } },
  { node: 'Plaza_DataTables', role: '資料表廣場', at: { q: -1, r: 1 } },
] as const satisfies readonly { node: string; role: string; at: Axial }[];
