import type { IslandMeta, VisualizationType } from './schema';

/** The three islands of the curriculum; IDs match the world map (src/lib/islands/data.ts). */
export const islands: IslandMeta[] = [
  { id: 'foundations', name: '基礎程式島', englishName: 'Programming Fundamentals', summary: '從第一支程式到遞迴與複雜度：變數、輸入輸出、條件、迴圈、陣列、字串與函式。' },
  { id: 'structures', name: '資料結構島', englishName: 'Data Structures', summary: '資料怎麼放，決定程式能多快：陣列、鏈結串列、堆疊、佇列、雜湊、樹、堆積與圖。' },
  { id: 'algorithms', name: '演算法島', englishName: 'Algorithms', summary: '從分析到設計：搜尋、排序、雙指標、遞迴、貪心、圖論與動態規劃，最後對應 APCS 實作題型。' },
];

/**
 * What each visualization type is in E.1. implemented: a lesson can show it interactively. planned: will come with
 * the lessons that need it (the lesson page says so, and shows no stand-in). not-available: the lesson has none.
 */
export const visualizations: Record<VisualizationType, { label: string; status: 'implemented' | 'planned' | 'not-available' }> = {
  'variable-state': { label: '變數狀態追蹤', status: 'implemented' },
  'conditional-branch': { label: '條件分支', status: 'implemented' },
  'loop-execution': { label: '迴圈執行', status: 'planned' },
  'array-index': { label: '陣列索引', status: 'planned' },
  'stack-queue': { label: '堆疊與佇列', status: 'planned' },
  'tree-traversal': { label: '樹的走訪', status: 'planned' },
  'sorting-steps': { label: '排序步驟', status: 'planned' },
  'graph-traversal': { label: '圖的走訪', status: 'planned' },
  'linked-list': { label: '鏈結串列', status: 'planned' },
  'hash-table': { label: '雜湊表', status: 'planned' },
  heap: { label: '堆積', status: 'planned' },
  'disjoint-set': { label: '並查集', status: 'planned' },
  'recursion-tree': { label: '遞迴樹', status: 'planned' },
  'dp-table': { label: '動態規劃表', status: 'planned' },
  none: { label: '不使用互動視覺化', status: 'not-available' },
};

export const DIFFICULTY_LABELS = { Beginner: '入門', Intermediate: '中級', Advanced: '進階' } as const;
export const APCS_LABELS = { concept: '觀念題相關', implementation: '實作題相關', foundation: '基礎先修', none: '非直接對應' } as const;
