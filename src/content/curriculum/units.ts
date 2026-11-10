import type { IslandId, LessonId } from './schema';

/**
 * 2026-11-01: each island is a subject area; its 20 lessons fall into units (科目), shown when an island is chosen on
 * the map. Every lesson belongs to exactly one unit of its own island, in the recommended order
 * (tests/curriculum.test.ts checks this).
 */
export interface CurriculumUnit { title: string; summary: string; lessonIds: LessonId[] }

const range = (prefix: 'F' | 'D' | 'A' | 'DB', from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}` as LessonId);

export const UNITS: Record<IslandId, CurriculumUnit[]> = {
  foundations: [
    { title: '程式入門', summary: '程式、變數、輸入輸出與運算子', lessonIds: range('F', 1, 4) },
    { title: '條件與迴圈', summary: '判斷、邏輯運算與三種迴圈', lessonIds: range('F', 5, 9) },
    { title: '字串與陣列', summary: '字串、一維與二維陣列的操作', lessonIds: ['F10', 'F11', 'F12', 'F16'] },
    { title: '函式與遞迴', summary: '函式、參數、作用域與遞迴', lessonIds: ['F13', 'F14', 'F15', 'F18'] },
    { title: '除錯、複雜度與挑戰', summary: '除錯技巧、複雜度入門與綜合挑戰', lessonIds: ['F17', 'F19', 'F20'] },
  ],
  structures: [
    { title: '線性結構', summary: '結構概論、陣列、字串與鏈結串列', lessonIds: range('D', 1, 4) },
    { title: '堆疊與佇列', summary: '後進先出、先進先出與雙端佇列', lessonIds: range('D', 5, 7) },
    { title: '集合與雜湊', summary: 'Set、Map 與雜湊表', lessonIds: range('D', 8, 10) },
    { title: '樹與堆積', summary: '樹、二元樹、走訪、搜尋樹與堆積', lessonIds: range('D', 11, 15) },
    { title: '圖與綜合', summary: '圖、表示法、並查集、選型與綜合挑戰', lessonIds: range('D', 16, 20) },
  ],
  algorithms: [
    { title: '分析與搜尋', summary: '複雜度分析、模擬、線性與二分搜尋', lessonIds: range('A', 1, 4) },
    { title: '排序', summary: '基本排序、合併排序與快速排序', lessonIds: range('A', 5, 7) },
    { title: '陣列技巧', summary: '雙指標、滑動視窗與前綴和', lessonIds: range('A', 8, 10) },
    { title: '遞迴、回溯與貪心', summary: '分治、回溯搜尋與貪心選擇', lessonIds: range('A', 11, 13) },
    { title: '圖論', summary: 'BFS、DFS 與最短路徑', lessonIds: range('A', 14, 16) },
    { title: '動態規劃與 APCS', summary: '動態規劃、背包、解題策略與綜合試煉', lessonIds: range('A', 17, 20) },
  ],
  // Phase F.1a–F.1d: all 20 lessons are written; Phase F.2: the home map shows these units when the island is chosen.
  databases: [
    { title: '資料庫與 SQL 基礎', summary: 'DBMS 的角色、關聯式模型與鍵；SELECT 查詢、彙總與分組', lessonIds: range('DB', 1, 4) },
    { title: '進階 SQL 與資料定義', summary: '多表合併、子查詢、CTE 與視窗函式；建表、約束與資料修改', lessonIds: range('DB', 5, 7) },
    { title: '資料庫設計', summary: 'ER 模型、從 ER 圖到資料表、正規化', lessonIds: range('DB', 8, 10) },
    { title: '效能與資料庫程式', summary: 'B+ 樹索引、查詢計畫與調校；檢視表、預存程序與觸發器', lessonIds: range('DB', 11, 13) },
    { title: '交易、應用程式與安全', summary: 'ACID、隔離等級與並行控制；驅動程式、ORM 與 N+1；SQL injection 與最小權限', lessonIds: range('DB', 14, 17) },
    { title: '資料模型、架構與綜合挑戰', summary: 'NoSQL 與 CAP；備份、複寫與分片；從需求到安全串接的完整應用', lessonIds: range('DB', 18, 20) },
  ],
};
