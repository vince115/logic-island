import { worldIslands } from '@/content/world/islands';
import { ISLAND_IDS, type IslandMeta, type VisualizationType } from './schema';

/**
 * The three islands of the curriculum; IDs match the world map (src/lib/islands/data.ts). Phase F.0: read from the world
 * registry (src/content/world/islands.ts), which also lists the planned islands; same names and text as before.
 */
export const islands: IslandMeta[] = ISLAND_IDS.map(id => {
  const island = worldIslands.find(i => i.id === id)!;
  return { id, name: island.name, englishName: island.nameEn, summary: island.description };
});

/**
 * What each visualization type is (E.1, extended in E.2, E.3 and E.4). implemented: a lesson can show it interactively. planned: will come with
 * the lessons that need it (the lesson page says so, and shows no stand-in). not-available: the lesson has none.
 */
export const visualizations: Record<VisualizationType, { label: string; status: 'implemented' | 'planned' | 'not-available' }> = {
  'variable-state': { label: '變數狀態追蹤', status: 'implemented' },
  'conditional-branch': { label: '條件分支', status: 'implemented' },
  'loop-execution': { label: '迴圈執行', status: 'implemented' },
  'array-index': { label: '陣列與字串', status: 'implemented' },
  'stack-queue': { label: '堆疊與佇列', status: 'implemented' },
  'tree-traversal': { label: '樹的走訪', status: 'implemented' },
  'sorting-steps': { label: '排序步驟', status: 'implemented' },
  'graph-traversal': { label: '圖的走訪', status: 'implemented' },
  'linked-list': { label: '鏈結串列', status: 'implemented' },
  'hash-table': { label: '雜湊表', status: 'implemented' },
  heap: { label: '堆積', status: 'implemented' },
  'disjoint-set': { label: '並查集', status: 'implemented' },
  'recursion-tree': { label: '遞迴樹', status: 'implemented' },
  'dp-table': { label: '動態規劃表', status: 'implemented' },
  'function-call': { label: '函式呼叫追蹤', status: 'implemented' },
  'recursion-trace': { label: '遞迴呼叫堆疊', status: 'implemented' },
  complexity: { label: '複雜度比較（示意模型）', status: 'implemented' },
  'challenge-stages': { label: '綜合挑戰分段', status: 'implemented' },
  'ds-comparison': { label: '資料結構比較', status: 'implemented' },
  'greedy-choice': { label: '貪心選擇', status: 'implemented' },
  none: { label: '不使用互動視覺化', status: 'not-available' },
};

export const DIFFICULTY_LABELS = { Beginner: '入門', Intermediate: '中級', Advanced: '進階' } as const;
export const APCS_LABELS = { concept: '觀念題相關', implementation: '實作題相關', foundation: '基礎先修', none: '非直接對應' } as const;
