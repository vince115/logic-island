import type { AlgorithmId } from '@/lib/engine';
import planning from '@/content/world/planning-data.json';
import type { AnyLessonId } from '@/content/world/lesson-id';
import { DATABASE_VISUALIZATIONS, LANGUAGES, LESSON_ACTIVITIES, LLM_ACTIVITIES, OPTIONAL_LANGUAGES, ISLAND_PREFIX, ISLAND_IDS, PYTHON_LANGUAGES, type ApcsRelevance, type Difficulty, type LessonActivity, type LessonCapability, type LessonId, type LessonMeta, type LessonStatus, type VisualizationType } from './schema';

/*
 * The lessons in recommended order (F01..F20, D01..D20, A01..A20, then the database island's written lessons from DB01).
 * Every lesson has its outline here; only lessons marked complete have content (content/*.ts). See docs/curriculum/PHASE_E_CURRICULUM.md for the reasoning behind the
 * order and the prerequisites.
 */
type Outline = {
  slug: string; title: string; summary: string; objectives: string[]; difficulty: Difficulty; minutes: number;
  prerequisites: LessonId[]; concepts: string[]; apcs: ApcsRelevance[]; visualization: VisualizationType;
  status?: LessonStatus; version?: string; labs?: AlgorithmId[];
  /** 2026-11-02: languages beyond C++, Java and Python that the lesson offers. All 60 lessons offer JavaScript (Node.js). */
  extraLanguages?: (typeof OPTIONAL_LANGUAGES)[number][];
  /** Phase F.1b: what the lesson is taught with (schema LESSON_CAPABILITIES): program-code for F, D and A. */
  capabilities: LessonCapability[];
  /** Phase F.1b: a database lesson's activity (the blueprint's). */
  activity?: LessonActivity;
  recommended?: AnyLessonId[];
  /** The blueprint's id of an outline built from it: the lesson's place in the list must give the same id. */
  blueprintId?: string;
};
const B = 'Beginner', I = 'Intermediate', A = 'Advanced';

const foundations: Omit<Outline, 'capabilities'>[] = [
  { slug: 'programs-and-algorithms', title: '程式與演算法入門', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 30, prerequisites: [], visualization: 'variable-state', apcs: ['foundation'],
    summary: '用「輸入、處理、輸出」描述問題，認識演算法的特性，並讀懂 C++、Java、Python、JavaScript 程式的基本結構與執行順序。',
    objectives: ['用輸入、處理、輸出描述一個問題的解法', '說出演算法必須具備的特性', '讀懂各語言的程式結構並預測循序執行的結果', '區分語法錯誤、執行期錯誤與邏輯錯誤'],
    concepts: ['演算法', '輸入／處理／輸出', '循序執行', '編譯與直譯', '錯誤類型'] },
  { slug: 'variables-and-types', title: '變數與資料型別', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F01'], visualization: 'variable-state', apcs: ['concept', 'implementation'],
    summary: '宣告、指定與追蹤變數；依資料選擇整數、浮點數、布林與字串型別，避開整數溢位與浮點誤差。',
    objectives: ['宣告、初始化與重新指定變數，並追蹤變數值的變化', '依資料範圍選擇 int、long long／long 或 double', '辨識整數溢位與浮點數誤差並採取對策', '正確交換兩個變數的值'],
    concepts: ['變數', '指定', '靜態與動態型別', '整數範圍與溢位', '浮點誤差', '交換'] },
  { slug: 'input-and-output', title: '輸入與輸出', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F02'], visualization: 'variable-state', apcs: ['implementation'],
    summary: '依題目格式讀取整數與字串、依規定格式輸出，理解線上評測如何比對輸出。',
    objectives: ['讀取以空白或換行分隔的整數與字串並轉成正確型別', '依指定格式輸出空白、換行與小數位數', '依測資格式設計讀取方式，避免格式錯誤造成答案錯誤'],
    concepts: ['標準輸入輸出', 'token 與整行讀取', '型別轉換', '格式化輸出', '測資'] },
  { slug: 'operators-and-precedence', title: '運算子與運算順序', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F03'], visualization: 'variable-state', apcs: ['concept', 'implementation'],
    summary: '算術、比較、邏輯與指定運算子；優先順序與結合性；整數除法與餘數在各語言中的差異。',
    objectives: ['使用算術、比較與指定運算子並預測結果', '依優先順序與結合性計算運算式，必要時加括號', '正確使用整數除法與餘數，掌握負數時各語言的差異', '用除法與餘數完成單位換算'],
    concepts: ['算術運算子', '整數除法與餘數', '優先順序', '結合性', '比較運算子', '複合指定'] },
  { slug: 'conditionals', title: '條件判斷', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 45, prerequisites: ['F04'], visualization: 'conditional-branch', apcs: ['concept', 'implementation'],
    summary: '用 if／else if／else 選擇執行路徑，設計互斥且完整的條件區間，並用邊界值測試。',
    objectives: ['使用 if、else if、else 依條件選擇執行路徑', '設計互斥且完整的條件區間並安排判斷順序', '用邊界值測試條件並找出遺漏或重疊', '處理不合法的輸入'],
    concepts: ['if／else', '條件區間', '判斷順序', '邊界值測試', '輸入檢查'] },
  { slug: 'logical-operators', title: '多重條件與邏輯運算', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F05'], visualization: 'conditional-branch', apcs: ['concept', 'implementation'],
    summary: '用 and／or／not 組合條件，理解短路求值與德摩根定律，改寫巢狀 if。',
    objectives: ['用邏輯運算子組合多個條件', '利用短路求值避免除以零或越界', '用德摩根定律改寫否定條件', '把巢狀 if 改寫成等價的組合條件'],
    concepts: ['&&／and', '||／or', '!／not', '短路求值', '德摩根定律', '巢狀條件'] },
  { slug: 'for-loops', title: 'For 迴圈', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F05'], visualization: 'loop-execution', apcs: ['concept', 'implementation'],
    summary: '以計數迴圈重複執行；掌握起點、終點與步長，計算累加、計數與最大值。',
    objectives: ['寫出指定次數與範圍的 for 迴圈', '預測迴圈變數每一輪的值與迴圈次數', '在迴圈中累加、計數與找最大最小值', '避免差一錯誤（off-by-one）'],
    concepts: ['for 迴圈', 'range', '累加器', '計數器', 'off-by-one'] },
  { slug: 'while-loops', title: 'While 迴圈', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F07'], visualization: 'loop-execution', apcs: ['concept', 'implementation'],
    summary: '依條件重複：讀到結束為止、逐位數處理、break 與 continue，以及避免無窮迴圈。',
    objectives: ['依條件決定何時停止迴圈', '讀取「直到特定值或檔尾」的輸入', '正確使用 break 與 continue', '找出並修正無窮迴圈'],
    concepts: ['while', 'do-while', '哨兵值', 'EOF 讀取', 'break／continue', '逐位數處理'] },
  { slug: 'nested-loops', title: '巢狀迴圈', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 45, prerequisites: ['F08'], visualization: 'loop-execution', apcs: ['concept', 'implementation'],
    summary: '迴圈中的迴圈：印出圖形、枚舉所有組合，並估計總執行次數。',
    objectives: ['追蹤內外層迴圈變數的變化', '用巢狀迴圈輸出圖形與表格', '枚舉所有配對與組合', '計算巢狀迴圈的總執行次數'],
    concepts: ['巢狀迴圈', '枚舉', '圖形輸出', '執行次數'] },
  { slug: 'string-basics', title: '字串基礎', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F07'], visualization: 'array-index', apcs: ['concept', 'implementation'],
    summary: '字串是字元序列：長度、索引、走訪、比較與字元碼的運用。',
    objectives: ['取得字串長度並以索引存取字元', '走訪字串並統計特定字元', '比較字串與判斷字元種類', '理解 C++／Java 與 Python 字串可變性的差異'],
    concepts: ['字元與字串', '索引', '長度', '字元碼', '字串比較', '不可變字串'] },
  { slug: 'one-dimensional-arrays', title: '一維陣列', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 45, prerequisites: ['F07'], visualization: 'array-index', apcs: ['concept', 'implementation'], labs: ['array'],
    summary: '用一個名稱存放多筆資料：宣告、索引、走訪、統計與越界錯誤。',
    objectives: ['宣告陣列並用從 0 開始的索引存取', '用迴圈讀入、走訪與統計陣列', '辨識並避免索引越界', '選擇固定陣列或 vector／list／ArrayList'],
    concepts: ['陣列', '索引', '走訪', '越界', 'vector／list／ArrayList'] },
  { slug: 'two-dimensional-arrays', title: '二維陣列', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['F09', 'F11'], visualization: 'array-index', apcs: ['concept', 'implementation'],
    summary: '以列與行表示表格與地圖：走訪、列行統計與上下左右鄰居。',
    objectives: ['宣告並讀入 R × C 的二維陣列', '以列優先與行優先走訪', '計算每列、每行的總和', '用方向陣列安全地檢查上下左右鄰居'],
    concepts: ['二維陣列', '列與行', '方向陣列', '邊界檢查', '矩陣走訪'] },
  { slug: 'functions', title: '函式基礎', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['F07'], visualization: 'function-call', apcs: ['concept', 'implementation'],
    summary: '把重複的步驟命名成函式：定義、呼叫與把大問題拆成小問題。',
    objectives: ['定義並呼叫函式', '追蹤函式呼叫時的執行流程', '把重複程式碼抽成函式', '用函式把問題分解成步驟'],
    concepts: ['函式定義', '呼叫', '執行流程', '模組化', '問題分解'] },
  { slug: 'parameters-and-return', title: '參數與回傳值', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['F13'], visualization: 'function-call', apcs: ['concept', 'implementation'],
    summary: '函式的輸入與輸出：傳值、傳參考、回傳值，以及陣列傳入函式時的行為。',
    objectives: ['設計有參數與回傳值的函式', '區分傳值與傳參考（C++ 的 &）', '說明 Python 與 Java 傳入物件時的行為', '用回傳值取代全域變數'],
    concepts: ['參數', '引數', '回傳值', '傳值', '傳參考', '物件參考'] },
  { slug: 'variable-scope', title: '變數作用域', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 35, prerequisites: ['F14'], visualization: 'function-call', apcs: ['concept'],
    summary: '變數在哪裡看得見：區域、全域、區塊作用域與名稱遮蔽。',
    objectives: ['判斷變數在程式各處是否可見', '辨識名稱遮蔽造成的錯誤', '說明 Python 的 global 與 C++／Java 區塊作用域的差異', '減少全域變數的使用'],
    concepts: ['作用域', '區域變數', '全域變數', '區塊', '名稱遮蔽', '生命週期'] },
  { slug: 'string-and-array-operations', title: '字串與陣列操作', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['F10', 'F11', 'F14'], visualization: 'array-index', apcs: ['implementation'],
    summary: '常用操作與函式庫：反轉、搜尋、切割、計數、排序呼叫與字串轉數字。',
    objectives: ['實作反轉、搜尋與計數', '使用標準函式庫的排序與搜尋', '切割字串並轉換成數字', '比較手寫與函式庫做法的成本'],
    concepts: ['反轉', '搜尋', '切割', '轉換', '函式庫排序', '計數陣列'] },
  { slug: 'debugging-basics', title: '基本除錯技巧', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 40, prerequisites: ['F09', 'F14'], visualization: 'variable-state', apcs: ['implementation'],
    summary: '有系統地找出錯誤：讀錯誤訊息、追蹤輸出、縮小範圍、自製邊界測資。',
    objectives: ['讀懂編譯與執行期錯誤訊息', '用追蹤輸出與手動追蹤找出錯誤位置', '設計能抓出錯誤的邊界測資', '分辨 WA、TLE、RE 等評測結果的可能原因'],
    concepts: ['錯誤訊息', '追蹤輸出', '二分定位', '邊界測資', '評測結果'] },
  { slug: 'recursion-basics', title: '遞迴入門', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['F14'], visualization: 'recursion-trace', apcs: ['concept', 'implementation'],
    summary: '函式呼叫自己：終止條件、遞迴關係、呼叫堆疊，以及何時改用迴圈。',
    objectives: ['寫出具有正確終止條件的遞迴函式', '追蹤遞迴呼叫與回傳的順序', '把遞迴關係轉成程式', '說明遞迴深度與呼叫堆疊的限制'],
    concepts: ['遞迴', '終止條件', '遞迴關係', '呼叫堆疊', '遞迴深度'] },
  { slug: 'complexity-basics', title: '時間與空間複雜度入門', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['F09', 'F11'], visualization: 'complexity', apcs: ['concept'],
    summary: '估計程式要跑多久、用多少記憶體：Big-O、常見等級與依資料範圍選擇做法。',
    objectives: ['數出迴圈的執行次數並寫成 Big-O', '比較 O(1)、O(log n)、O(n)、O(n²) 的成長', '依輸入範圍判斷做法是否可能超時', '估計陣列需要的記憶體'],
    concepts: ['時間複雜度', '空間複雜度', 'Big-O', '成長率', '資料範圍'] },
  { slug: 'foundations-challenge', title: '基礎程式島綜合挑戰', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 90, prerequisites: ['F12', 'F16', 'F17', 'F18', 'F19'], visualization: 'challenge-stages', apcs: ['implementation'],
    summary: '綜合輸入輸出、條件、迴圈、陣列、字串與函式的多題挑戰，練習讀題、拆解與自我測試。',
    objectives: ['讀懂完整題目並拆成可實作的步驟', '綜合使用陣列、字串、迴圈與函式', '自行設計正常與邊界測資驗證程式', '評估解法的時間複雜度'],
    concepts: ['綜合應用', '問題拆解', '自我測試', '複雜度評估'] },
];

const structures: Omit<Outline, 'capabilities'>[] = [
  { slug: 'data-structures-overview', title: '資料結構概論', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 35, prerequisites: ['F11', 'F13', 'F19'], visualization: 'ds-comparison', apcs: ['concept'],
    summary: '資料結構是「資料的擺放方式加上允許的操作」：抽象資料型別與操作成本。',
    objectives: ['說明抽象資料型別與實作的差別', '比較不同結構在存取、插入、刪除上的成本', '依操作需求選擇候選結構'],
    concepts: ['抽象資料型別', '操作成本', '記憶體配置', '連續與非連續儲存'] },
  { slug: 'arrays-and-dynamic-arrays', title: 'Array 與 Dynamic Array', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 45, prerequisites: ['D01'], visualization: 'array-index', apcs: ['concept', 'implementation'], labs: ['array'],
    summary: '固定陣列與可變長度陣列：擴容策略、攤銷 O(1) 的尾端加入、中間插入的成本。',
    objectives: ['說明動態陣列擴容的過程', '解釋尾端加入的攤銷 O(1)', '估算中間插入與刪除的成本', '使用 vector、list、ArrayList 的常用操作'],
    concepts: ['動態陣列', '容量與長度', '擴容', '攤銷分析', '插入刪除成本'] },
  { slug: 'string-processing', title: 'String Processing', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D02', 'F16'], visualization: 'array-index', apcs: ['implementation'],
    summary: '字串處理的常見題型：字元計數、回文、子字串、大量串接的效能。',
    objectives: ['用計數陣列統計字元', '判斷回文與比較子字串', '避免在迴圈中反覆串接字串造成 O(n²)', '解析有固定格式的字串'],
    concepts: ['字元計數', '回文', '子字串', 'StringBuilder／join', '字串解析'] },
  { slug: 'linked-lists', title: 'Linked List', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D02'], visualization: 'linked-list', apcs: ['concept'],
    summary: '以節點與指標串起資料：插入、刪除、走訪與陣列的取捨。',
    objectives: ['描述節點與指標（參考）的結構', '實作在頭端插入與刪除', '走訪並搜尋鏈結串列', '比較鏈結串列與陣列的操作成本'],
    concepts: ['節點', '指標與參考', '單向鏈結串列', '插入刪除', '走訪'] },
  { slug: 'stacks', title: 'Stack', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['D02'], visualization: 'stack-queue', apcs: ['concept', 'implementation'], labs: ['stack'],
    summary: '後進先出：push、pop、top，以及括號配對與復原功能。',
    objectives: ['說明 LIFO 並執行 push／pop／top', '安全處理空堆疊', '用堆疊檢查括號配對', '選用各語言的堆疊實作'],
    concepts: ['LIFO', 'push／pop', '空堆疊', '括號配對', '函式呼叫堆疊'] },
  { slug: 'queues', title: 'Queue', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['D02'], visualization: 'stack-queue', apcs: ['concept', 'implementation'], labs: ['queue'],
    summary: '先進先出：enqueue、dequeue，環狀佇列與排隊模擬。',
    objectives: ['說明 FIFO 並執行 enqueue／dequeue', '解釋為何不用陣列頭端刪除', '理解環狀佇列的索引運算', '用佇列模擬排隊'],
    concepts: ['FIFO', 'enqueue／dequeue', '環狀佇列', 'deque／ArrayDeque', '排隊模擬'] },
  { slug: 'deques', title: 'Deque', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 40, prerequisites: ['D05', 'D06'], visualization: 'stack-queue', apcs: ['implementation'],
    summary: '兩端都能進出的雙端佇列，以及單調佇列的入門。',
    objectives: ['使用雙端佇列的兩端操作', '用 deque 同時當作堆疊與佇列', '理解單調佇列維護區間最大值的想法'],
    concepts: ['雙端佇列', '兩端操作', '單調佇列'] },
  { slug: 'sets', title: 'Set', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 35, prerequisites: ['D01'], visualization: 'hash-table', apcs: ['implementation'],
    summary: '不重複元素的集合：去重、成員查詢、有序與雜湊集合。',
    objectives: ['用集合去除重複與查詢是否存在', '比較有序集合與雜湊集合的特性', '使用 set／unordered_set、set、HashSet／TreeSet'],
    concepts: ['集合', '去重', '成員查詢', '有序集合', '雜湊集合'] },
  { slug: 'maps', title: 'Map / Dictionary', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 40, prerequisites: ['D08'], visualization: 'hash-table', apcs: ['implementation'],
    summary: '以鍵查值的對照表：統計次數、依鍵分組，以及安全處理不存在的鍵。',
    objectives: ['用鍵值對儲存與查詢資料', '用 map 統計次數', '安全處理不存在的鍵', '依鍵排序輸出'],
    concepts: ['鍵與值', '計數', '分組', '不存在的鍵', '有序 map'] },
  { slug: 'hash-tables', title: 'Hash Table', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D09'], visualization: 'hash-table', apcs: ['concept'],
    summary: '雜湊函數、碰撞處理與平均 O(1) 的條件。',
    objectives: ['說明雜湊函數把鍵對應到位置的方式', '比較鏈結法與開放定址法', '解釋平均 O(1) 與最差情況', '理解負載因子與重新雜湊'],
    concepts: ['雜湊函數', '碰撞', '鏈結法', '開放定址', '負載因子'] },
  { slug: 'tree-basics', title: 'Tree 基礎', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 40, prerequisites: ['D01', 'F18'], visualization: 'tree-traversal', apcs: ['concept'],
    summary: '階層資料的樹：根、子節點、葉、深度與高度，以及用陣列存父節點。',
    objectives: ['辨認樹的根、葉、父子、深度與高度', '用父節點陣列或子節點清單表示樹', '用遞迴計算樹的高度與節點數'],
    concepts: ['樹', '根與葉', '深度與高度', '父節點陣列', '子節點清單'] },
  { slug: 'binary-trees', title: 'Binary Tree', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['D11'], visualization: 'tree-traversal', apcs: ['concept'],
    summary: '每個節點最多兩個孩子：節點結構、陣列表示法與完全二元樹。',
    objectives: ['以節點與左右指標表示二元樹', '用陣列索引表示完全二元樹', '區分滿二元樹與完全二元樹', '計算高度與節點數的關係'],
    concepts: ['二元樹', '左右子樹', '陣列表示法', '完全二元樹'] },
  { slug: 'tree-traversal', title: 'Tree Traversal', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D12', 'D05', 'D06'], visualization: 'tree-traversal', apcs: ['concept', 'implementation'],
    summary: '前序、中序、後序與層序走訪，遞迴與迭代兩種寫法。',
    objectives: ['寫出前序、中序、後序走訪', '用佇列完成層序走訪', '由走訪結果推回樹的結構', '比較遞迴與堆疊迭代的寫法'],
    concepts: ['前序', '中序', '後序', '層序', '遞迴走訪', '迭代走訪'] },
  { slug: 'binary-search-trees', title: 'Binary Search Tree', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D13'], visualization: 'tree-traversal', apcs: ['concept'],
    summary: '左小右大的搜尋樹：搜尋、插入、刪除與退化成鏈的風險。',
    objectives: ['說明 BST 的性質', '實作搜尋與插入', '說明刪除的三種情況', '解釋平衡與退化對效能的影響'],
    concepts: ['BST 性質', '搜尋', '插入', '刪除', '平衡', '有序走訪'] },
  { slug: 'heaps-and-priority-queues', title: 'Heap / Priority Queue', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D12'], visualization: 'heap', apcs: ['concept', 'implementation'],
    summary: '隨時取出最大或最小值：堆積的上浮下沉與優先佇列的使用。',
    objectives: ['說明最大堆積與最小堆積的性質', '追蹤插入的上浮與刪除的下沉', '使用 priority_queue、heapq、PriorityQueue', '用優先佇列找前 k 大'],
    concepts: ['堆積', '上浮', '下沉', '優先佇列', 'top-k'] },
  { slug: 'graph-basics', title: 'Graph 基礎', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 40, prerequisites: ['D01'], visualization: 'graph-traversal', apcs: ['concept'],
    summary: '節點與邊：有向、無向、權重、度數、路徑與連通。',
    objectives: ['用節點與邊描述關係', '區分有向、無向與加權圖', '計算度數並判斷路徑與連通', '把生活問題轉成圖'],
    concepts: ['節點與邊', '有向與無向', '權重', '度數', '路徑', '連通'] },
  { slug: 'graph-representations', title: 'Adjacency List / Matrix', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['D16'], visualization: 'graph-traversal', apcs: ['concept', 'implementation'],
    summary: '把圖存進程式：鄰接矩陣與鄰接串列的建立與取捨。',
    objectives: ['由邊的輸入建立鄰接矩陣與鄰接串列', '比較兩者的空間與查詢成本', '依節點與邊數選擇表示法'],
    concepts: ['鄰接矩陣', '鄰接串列', '邊串列', '稀疏與稠密'] },
  { slug: 'disjoint-set-union', title: 'Disjoint Set Union', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 50, prerequisites: ['D16'], visualization: 'disjoint-set', apcs: ['implementation'],
    summary: '合併與查詢群組：find、union、路徑壓縮與按大小合併。',
    objectives: ['實作 find 與 union', '用路徑壓縮與按大小合併加速', '用並查集判斷連通與偵測環'],
    concepts: ['並查集', 'find', 'union', '路徑壓縮', '按大小合併'] },
  { slug: 'choosing-data-structures', title: '資料結構選型與複雜度', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 45, prerequisites: ['D07', 'D10', 'D14', 'D15', 'D17'], visualization: 'ds-comparison', apcs: ['concept', 'implementation'],
    summary: '依操作與資料範圍挑選結構：常見題型對應的結構與複雜度比較表。',
    objectives: ['列出題目需要的操作並估計次數', '比較候選結構的複雜度', '依限制選出可行的結構組合'],
    concepts: ['操作分析', '複雜度比較', '選型', '取捨'] },
  { slug: 'structures-challenge', title: '資料結構島綜合挑戰', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 90, prerequisites: ['D18', 'D19'], visualization: 'challenge-stages', apcs: ['implementation'],
    summary: '需要選擇並組合資料結構的多題挑戰。',
    objectives: ['從題目需求推導合適的資料結構', '組合兩種以上結構解題', '驗證解法的正確性與複雜度'],
    concepts: ['綜合應用', '結構組合', '複雜度驗證'] },
];

const algorithms: Omit<Outline, 'capabilities'>[] = [
  { slug: 'algorithm-analysis', title: '演算法分析', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['F19'], visualization: 'complexity', apcs: ['concept'],
    summary: '比較演算法的方法：最佳、最差、平均情況，以及依資料範圍反推可行的複雜度。',
    objectives: ['分析最佳、最差與平均情況', '由程式結構推導 Big-O', '依資料範圍判斷可接受的複雜度', '用實測驗證分析'],
    concepts: ['最佳／最差／平均', 'Big-O', '資料範圍', '實測'] },
  { slug: 'simulation', title: 'Simulation', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['A01', 'F12'], visualization: 'array-index', apcs: ['implementation'],
    summary: '依題目規則一步步模擬：狀態設計、更新順序與邊界處理（APCS 實作題常見）。',
    objectives: ['把題目規則轉成狀態與更新步驟', '在二維格子上安全地移動與檢查邊界', '區分同步更新與即時更新', '設計測資驗證每條規則'],
    concepts: ['狀態', '規則', '更新順序', '二維格子', '邊界'] },
  { slug: 'linear-search', title: 'Linear Search', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 30, prerequisites: ['A01'], visualization: 'array-index', apcs: ['concept', 'implementation'],
    summary: '逐一檢查的搜尋：找第一個、最後一個、全部，以及何時已經足夠。',
    objectives: ['實作線性搜尋並處理找不到的情況', '找出第一個、最後一個與所有符合的位置', '分析線性搜尋的複雜度'],
    concepts: ['線性搜尋', '找不到', '第一個與最後一個', 'O(n)'] },
  { slug: 'binary-search', title: 'Binary Search', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['A03'], visualization: 'array-index', apcs: ['concept', 'implementation'], labs: ['binary-search'],
    summary: '在有序資料中每次排除一半：邊界、lower bound，以及對答案二分搜。',
    objectives: ['寫出不會無窮迴圈的二分搜尋', '找出第一個大於等於目標的位置', '使用 lower_bound、bisect、Arrays.binarySearch', '辨認可以對答案二分搜的單調性'],
    concepts: ['有序前提', '左右邊界', 'lower bound', '單調性', '對答案二分搜'] },
  { slug: 'basic-sorting', title: 'Bubble / Selection / Insertion Sort', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: B, minutes: 50, prerequisites: ['A01'], visualization: 'sorting-steps', apcs: ['concept'], labs: ['bubble-sort'],
    summary: '三種 O(n²) 排序的步驟、比較次數與穩定性。',
    objectives: ['追蹤三種基本排序的每一輪', '比較它們的比較與交換次數', '說明排序的穩定性', '說明為何實作題多用函式庫排序'],
    concepts: ['氣泡排序', '選擇排序', '插入排序', '穩定性', 'O(n²)'] },
  { slug: 'merge-sort', title: 'Merge Sort', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['A05', 'F18'], visualization: 'sorting-steps', apcs: ['concept'],
    summary: '分割、遞迴排序、合併：O(n log n) 的由來與逆序數計算。',
    objectives: ['實作兩個有序陣列的合併', '追蹤合併排序的遞迴過程', '說明 O(n log n) 的由來', '在合併時計算逆序數'],
    concepts: ['分治', '合併', 'O(n log n)', '穩定排序', '逆序數'] },
  { slug: 'quick-sort', title: 'Quick Sort', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['A06'], visualization: 'sorting-steps', apcs: ['concept'],
    summary: '以基準值分割：平均 O(n log n)、最差 O(n²) 與隨機化。',
    objectives: ['實作分割（partition）', '分析平均與最差情況', '說明隨機選基準的作用', '比較快速排序與合併排序'],
    concepts: ['基準值', '分割', '平均與最差', '隨機化', '原地排序'] },
  { slug: 'two-pointers', title: 'Two Pointers', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['A05'], visualization: 'array-index', apcs: ['implementation'],
    summary: '兩個索引同時移動：有序陣列配對、合併與去重，把 O(n²) 降為 O(n)。',
    objectives: ['用左右指標找和為目標的配對', '用快慢指標原地去重', '說明指標只前進為何能保證正確', '比較暴力與雙指標的複雜度'],
    concepts: ['左右指標', '快慢指標', '有序前提', 'O(n)'] },
  { slug: 'sliding-window', title: 'Sliding Window', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['A08'], visualization: 'array-index', apcs: ['implementation'],
    summary: '固定與可變長度視窗：連續區間的和、最長與最短區間。',
    objectives: ['計算固定長度視窗的最大和', '用可變視窗找滿足條件的最短或最長區間', '維護視窗內的計數'],
    concepts: ['固定視窗', '可變視窗', '區間', '視窗計數'] },
  { slug: 'prefix-sums', title: 'Prefix Sum', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 45, prerequisites: ['A01'], visualization: 'array-index', apcs: ['implementation'],
    summary: '先累加再查詢：一維與二維前綴和、差分陣列。',
    objectives: ['建立前綴和並在 O(1) 回答區間和', '建立二維前綴和回答子矩形和', '用差分陣列處理大量區間加值', '注意前綴和的整數範圍'],
    concepts: ['前綴和', '區間和', '二維前綴和', '差分陣列'] },
  { slug: 'recursion-and-divide-and-conquer', title: 'Recursion 與分治', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['F18', 'A06'], visualization: 'recursion-tree', apcs: ['concept', 'implementation'],
    summary: '把問題拆成相同形式的子問題：遞迴設計、分治，以及重複計算的問題。',
    objectives: ['把問題寫成遞迴關係', '設計分治演算法', '用遞迴樹估計複雜度', '辨認重複子問題並加上記憶化'],
    concepts: ['遞迴設計', '分治', '遞迴樹', '記憶化'] },
  { slug: 'backtracking', title: 'Backtracking', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 55, prerequisites: ['A11'], visualization: 'recursion-tree', apcs: ['implementation'],
    summary: '試探、遞迴、撤銷：排列、組合、子集與剪枝。',
    objectives: ['用回溯列舉排列、組合與子集', '正確地在遞迴後撤銷狀態', '加入剪枝減少搜尋', '估計搜尋空間大小'],
    concepts: ['回溯', '狀態撤銷', '排列', '組合', '子集', '剪枝'] },
  { slug: 'greedy', title: 'Greedy', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['A05'], visualization: 'greedy-choice', apcs: ['implementation'],
    summary: '每一步做當下最好的選擇：活動選擇、找零，以及反例檢查。',
    objectives: ['辨認可以貪心的題型', '用排序搭配貪心解題', '用反例檢查貪心策略', '說明交換論證的想法'],
    concepts: ['貪心選擇', '排序', '反例', '交換論證'] },
  { slug: 'breadth-first-search', title: 'BFS', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D06', 'D17'], visualization: 'graph-traversal', apcs: ['implementation'], labs: ['bfs'],
    summary: '以佇列一層一層擴展：走訪、無權最短路徑與格子地圖。',
    objectives: ['用佇列實作 BFS 並避免重複拜訪', '求無權圖的最短距離', '在二維格子上做 BFS', '記錄路徑並還原'],
    concepts: ['BFS', '佇列', '拜訪標記', '無權最短路徑', '格子 BFS'] },
  { slug: 'depth-first-search', title: 'DFS', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: I, minutes: 50, prerequisites: ['D05', 'D17', 'F18'], visualization: 'graph-traversal', apcs: ['implementation'],
    summary: '一路走到底再回頭：遞迴與堆疊 DFS、連通塊計數。',
    objectives: ['用遞迴與堆疊實作 DFS', '計算連通塊的數量與大小', '在格子地圖上做 flood fill', '注意遞迴深度限制'],
    concepts: ['DFS', '遞迴', '堆疊', '連通塊', 'flood fill'] },
  { slug: 'shortest-paths', title: 'Graph Shortest Path', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 55, prerequisites: ['A14', 'D15'], visualization: 'graph-traversal', apcs: ['implementation'],
    summary: '加權圖的最短路徑：Dijkstra 與優先佇列，以及負權的限制。',
    objectives: ['說明鬆弛（relax）的意義', '用優先佇列實作 Dijkstra', '說明 Dijkstra 不適用負權邊的原因', '依題目選擇 BFS 或 Dijkstra'],
    concepts: ['加權圖', '鬆弛', 'Dijkstra', '優先佇列', '負權'] },
  { slug: 'dynamic-programming-intro', title: 'Dynamic Programming 入門', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 55, prerequisites: ['A11'], visualization: 'dp-table', apcs: ['concept', 'implementation'],
    summary: '定義狀態、轉移與初始值：爬樓梯、最小成本路徑與表格填寫順序。',
    objectives: ['定義 DP 的狀態與轉移式', '設定初始值與填表順序', '比較記憶化遞迴與迭代 DP', '分析 DP 的時間與空間'],
    concepts: ['狀態', '轉移', '初始值', '填表順序', '記憶化'] },
  { slug: 'knapsack', title: 'Knapsack 基礎', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 55, prerequisites: ['A17'], visualization: 'dp-table', apcs: ['implementation'],
    summary: '0/1 背包與無限背包：狀態設計、一維優化與迴圈方向。',
    objectives: ['寫出 0/1 背包的狀態與轉移', '用一維陣列優化空間並說明迴圈方向', '區分 0/1 與無限背包', '辨認背包變形題'],
    concepts: ['0/1 背包', '無限背包', '一維優化', '迴圈方向'] },
  { slug: 'apcs-strategies', title: 'APCS 題型分析與解題策略', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 60, prerequisites: ['A02', 'A04', 'A10', 'A13', 'A15', 'A17'], visualization: 'challenge-stages', apcs: ['concept', 'implementation'],
    summary: '觀念題的程式追蹤技巧、實作題的讀題與拆解、依資料範圍選擇演算法、時間分配。',
    objectives: ['用表格追蹤程式片段的執行', '依資料範圍判斷需要的複雜度', '把實作題拆成可驗證的步驟', '規劃考試的時間分配與檢查方式'],
    concepts: ['程式追蹤', '題型辨識', '資料範圍', '解題流程', '時間分配'] },
  { slug: 'algorithms-challenge', title: '演算法島綜合試煉', status: 'complete', version: '1.1.0', extraLanguages: ['JavaScript'], difficulty: A, minutes: 120, prerequisites: ['A09', 'A12', 'A16', 'A18', 'A19'], visualization: 'challenge-stages', apcs: ['implementation'],
    summary: '綜合搜尋、排序、圖論與動態規劃的多題試煉。',
    objectives: ['辨認題目適用的演算法', '組合多種技巧完成完整解題', '用自製測資與複雜度分析檢查解法'],
    concepts: ['綜合應用', '演算法選擇', '測試與分析'] },
];

/**
 * Phase F.1a/F.1b: the database island's written lessons. Slug, title, objectives, concepts, difficulty and both kinds of
 * prerequisites are the blueprint's (docs/planning/data via planning-data.json), so they cannot drift from it; only
 * what the blueprint has no field for is written here. Its other lessons stay planned in src/content/world.
 */
function fromBlueprint(lessonId: string, summary: string, minutes: number, capabilities: LessonCapability[]): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b) throw new Error(`${lessonId} is not in the blueprint`);
  // Phase F.1b: the activity is the blueprint's too (SQL playground, ER builder, normalization steps).
  if (!(LESSON_ACTIVITIES as readonly string[]).includes(b.activity)) throw new Error(`${lessonId}: activity ${b.activity} is not implemented`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'],
    // F.1d: the blueprint's shared-visualization activities (ds-comparison, challenge-stages) are the lesson's visualization.
    visualization: (DATABASE_VISUALIZATIONS as readonly string[]).includes(b.activity) ? b.activity as VisualizationType : 'none',
    status: 'complete', version: '1.0.0', activity: b.activity as LessonActivity, capabilities, blueprintId: lessonId };
}
const databases: Outline[] = [
  fromBlueprint('DB01', '為什麼應用程式需要資料庫管理系統（DBMS）：綱要與實例、資料獨立性、DBMS 的各種功能，並在 SQL 練習場執行第一個查詢。', 40, ['sql']),
  fromBlueprint('DB02', '用關聯、屬性與元組描述一張表，辨識超鍵、候選鍵、主鍵與外鍵，以選擇、投影、合併推算結果，並理解實體與參考完整性。', 50, ['sql']),
  fromBlueprint('DB03', '用 SELECT、FROM、WHERE 取出需要的欄位與資料列，組合各種條件，排序、限制筆數、去除重複，並正確處理 NULL。', 50, ['sql']),
  fromBlueprint('DB04', '用 COUNT、SUM、AVG、MIN、MAX 計算統計值，以 GROUP BY 分組、HAVING 篩選分組，並看懂 NULL 對彙總結果的影響。', 50, ['sql']),
  fromBlueprint('DB05', '依外鍵把多張表合併成一張結果：INNER JOIN、LEFT／RIGHT／FULL OUTER JOIN、自我合併與表別名，並找出遺漏條件造成的笛卡兒積。', 60, ['sql']),
  // Phase F.1b
  fromBlueprint('DB06', '把查詢拆成小步：純量、IN 與 EXISTS 子查詢（相關與非相關）、WITH 與遞迴 CTE，以及用 ROW_NUMBER、RANK 與 OVER (PARTITION BY) 算排名與累計值。', 70, ['sql']),
  fromBlueprint('DB07', '用 CREATE TABLE 定義型別、主鍵與外鍵，以 NOT NULL、UNIQUE、CHECK、DEFAULT 擋下不合法的資料，用 INSERT、UPDATE、DELETE 修改資料並預測影響列數，再設定外鍵動作並以 ALTER TABLE 調整綱要。', 60, ['sql']),
  fromBlueprint('DB08', '從情境描述找出實體、屬性與關係，標出一對一、一對多、多對多的基數與參與限制，辨識弱實體、多值屬性與關係上的屬性，並以 crow\'s foot 畫出 ER 圖、對照 Chen 表示法。', 60, ['er-diagram']),
  fromBlueprint('DB09', '把 ER 圖轉成可執行的綱要：實體變成資料表，一對多放外鍵、多對多建中介表，處理弱實體的複合主鍵、多值屬性與一對一的 UNIQUE 外鍵，並用約束檢查與 JOIN 查詢驗證設計。', 60, ['sql', 'er-diagram']),
  fromBlueprint('DB10', '從插入、更新、刪除異常看出一張表為什麼要拆：依業務規則寫出函數相依、用閉包判斷候選鍵，逐步分解到 1NF、2NF、3NF 與 BCNF，以 SQL 驗證無損分解，並權衡何時刻意反正規化。', 70, ['sql', 'normalization']),
  // Phase F.1c
  fromBlueprint('DB11', '用 EXPLAIN QUERY PLAN 看索引如何把全表掃描變成樹狀搜尋：從 BST 延伸到 B+ 樹的分支、分裂、葉節點鏈結與範圍查詢，比較雜湊索引，依查詢條件設計單欄、複合與覆蓋索引，並權衡寫入成本。', 70, ['sql', 'query-plan']),
  fromBlueprint('DB12', '用 EXPLAIN QUERY PLAN 讀懂全表掃描、索引搜尋、覆蓋索引與額外排序，比較巢狀迴圈、雜湊與合併三種 JOIN 的成本，找出讓索引失效的寫法並改寫，再用 ANALYZE 的統計資訊與前後實測驗證調校效果。', 70, ['sql', 'query-plan']),
  fromBlueprint('DB13', '用 CREATE VIEW 封裝常用查詢並隱藏敏感欄位，比較檢視表、快照與具體化檢視表，看懂其他 DBMS 帶參數的預存程序與 SQLite 的替代做法，以觸發器自動寫入稽核紀錄、擋下違規的修改，並權衡商業邏輯放在資料庫或應用程式。', 60, ['sql']),
  fromBlueprint('DB14', '用 BEGIN、COMMIT、ROLLBACK 把轉帳的多個步驟包成一筆交易，以轉帳說明 ACID 與自動提交，分辨交易中途出錯時 SQLite 與 PostgreSQL 的不同，用 write-ahead log 推算當機後的資料，並以 SAVEPOINT 部分回滾。', 60, ['sql', 'transaction-timeline']),
  fromBlueprint('DB15', '在交錯的時間軸上重現髒讀、不可重複讀、幻讀與遺失更新，比較四種隔離等級擋得住哪些異常，看懂共享／排他鎖、兩階段鎖、死結偵測與 MVCC 快照如何運作，並用 SELECT … FOR UPDATE、原子更新或樂觀鎖修正並發更新錯誤。', 70, ['sql', 'transaction-timeline']),
  // Phase F.1d
  fromBlueprint('DB16', '用 Python、JavaScript、Java 的驅動程式連線並執行參數化查詢，在程式裡提交、回滾交易並釋放連線，以 ORM 對映類別與資料表並讀懂它送出的 SQL，把 N+1 查詢改成 JOIN 或批次 IN，並認識連線池與資料庫遷移。', 70, ['sql', 'driver-code', 'protocol-sequence']),
  fromBlueprint('DB17', '從被繞過的登入查詢看懂 SQL injection：引號、註解、OR 與 UNION 如何改寫查詢、為什麼手工跳脫不可靠，用參數化查詢與 ORM 的安全 API 修正程式，以 GRANT／REVOKE 與角色落實最小權限，並用加鹽的慢速雜湊保存密碼、加密敏感欄位、以觸發器留下稽核紀錄。', 60, ['sql', 'driver-code']),
  fromBlueprint('DB18', '比較鍵值、文件、寬欄與圖形四種 NoSQL 資料模型，用 SQLite 的 JSON 函式與遞迴 CTE 模擬查詢內嵌欄位、展開陣列與走訪追蹤關係，依存取模式決定內嵌或參照，說明 CAP 取捨與最終一致性，並為情境選擇關聯式或某類 NoSQL。', 60, ['sql', 'visualization']),
  fromBlueprint('DB19', '用 RPO 與 RTO 比較完整、增量備份與日誌封存的時間點復原，看懂主從複寫的延遲如何造成讀不到剛寫入的資料、非同步切換如何遺失寫入，再以 SQL 計算分割與分片的資料分布、找出分片鍵造成的熱點，為成長中的服務規劃備份與擴展。', 70, ['sql', 'architecture-diagram']),
  fromBlueprint('DB20', '綜合挑戰：以一家小店的訂單系統貫穿五個關卡，從需求畫出 ER 圖、正規化到 3NF 並寫出有約束的 DDL，完成主要功能的查詢、檢視表與交易，依查詢計畫加上複合索引並前後量測，再以參數化查詢、交易與最小權限安全地接上程式。', 120, ['sql', 'er-diagram', 'normalization', 'query-plan', 'driver-code', 'visualization']),
];

/**
 * 2026-11-20 (course production): a program-language lesson of a planned island, written from its blueprint outline the
 * way the database lessons are (fromBlueprint): slug, title, objectives, concepts, difficulty and prerequisites are the
 * blueprint's. The blueprint's activity may be one that is not built yet (type-checker, memory-model); the lesson then
 * shows one of the implemented shared visualizations instead (`visualization`), never a stand-in.
 */
function programFromBlueprint(lessonId: string, summary: string, minutes: number, visualization: VisualizationType, apcs: ApcsRelevance[] = ['none']): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b) throw new Error(`${lessonId} is not in the blueprint`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs, visualization,
    status: 'complete', version: '1.0.0', extraLanguages: ['JavaScript'], capabilities: ['program-code'], blueprintId: lessonId };
}
/**
 * CN-0 (2026-11-21): a network lesson written from its blueprint outline. Slug, title, objectives, concepts, difficulty
 * and prerequisites are the blueprint's. Its body is the network-protocol capability (scenes and their exercises); the
 * activity it names is what that capability draws: packet-journey stays packet-journey, and the blueprint's
 * protocol-sequence becomes network-sequence (on the database island protocol-sequence means SQL round trips, and keeps
 * that meaning). An activity not built yet (routing-table, subnet-calculator) stays in INTERACTIVE_LAB_ROADMAP: the lesson
 * shows network scenes (packet-journey) instead, never a stand-in. A capstone adds the challenge-stages visualization.
 */
export function networkFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== 'networks') throw new Error(`${lessonId} is not a network lesson of the blueprint`);
  const capstone = b.activity === 'challenge-stages';
  const activity: LessonActivity = capstone ? 'challenge-stages' : b.activity === 'protocol-sequence' ? 'network-sequence' : 'packet-journey';
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'],
    visualization: capstone ? 'challenge-stages' : 'none', status: 'complete', version: '1.0.0', activity,
    capabilities: capstone ? ['network-protocol', 'visualization'] : ['network-protocol'], blueprintId: lessonId };
}
/**
 * LNX-0 and SRV-0 (2026-11-22): the lesson shapes of the terminal capability, by blueprint activity. terminal-sim stays; an
 * overview's case-study-board is not built (it stays in INTERACTIVE_LAB_ROADMAP) and the lesson uses the terminal instead;
 * protocol-sequence (LNX12 SSH, SRV10 tunnels) and the server island's request-path and architecture-diagram become
 * network-sequence with network scenes beside the terminal (protocol-sequence keeps meaning the database lessons' SQL round
 * trips, and architecture-diagram the database island's backup simulations: content.ops); a capstone adds challenge-stages.
 */
const TERMINAL_SHAPES: Readonly<Record<string, Pick<Outline, 'activity' | 'capabilities' | 'visualization'>>> = {
  'terminal-sim': { activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none' },
  'case-study-board': { activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none' },
  'protocol-sequence': { activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' },
  'request-path': { activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' },
  'architecture-diagram': { activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' },
  'challenge-stages': { activity: 'challenge-stages', capabilities: ['terminal', 'visualization'], visualization: 'challenge-stages' },
  // DKR-0: the Docker island's container-playground is the terminal with the containers profile (docker); its pipeline-diagram
  // (DKR11, registries: build → tag → push → pull) is drawn as network scenes beside the terminal, like the request paths.
  'container-playground': { activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none' },
  'pipeline-diagram': { activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' },
};
type TerminalIsland = 'linux-systems' | 'network-servers' | 'docker-containers';
/** The activities each terminal island maps (the Linux island's blueprint has no request-path or architecture-diagram). */
const TERMINAL_ACTIVITIES: Readonly<Record<TerminalIsland, readonly string[]>> = {
  'linux-systems': ['terminal-sim', 'case-study-board', 'protocol-sequence', 'challenge-stages'],
  'network-servers': ['terminal-sim', 'case-study-board', 'protocol-sequence', 'request-path', 'architecture-diagram', 'challenge-stages'],
  'docker-containers': ['container-playground', 'architecture-diagram', 'pipeline-diagram', 'case-study-board', 'challenge-stages'],
};
function terminalOutline(lessonId: string, summary: string, minutes: number, island: TerminalIsland, what: string): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== island) throw new Error(`${lessonId} is not a ${what} lesson of the blueprint`);
  const s = TERMINAL_ACTIVITIES[island].includes(b.activity) ? TERMINAL_SHAPES[b.activity] : undefined;
  if (!s) throw new Error(`${lessonId}: no terminal lesson shape for the blueprint activity ${b.activity}`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'],
    status: 'complete', version: '1.0.0', ...s, blueprintId: lessonId };
}
/**
 * LNX-0 (2026-11-22): a Linux lesson written from its blueprint outline. Slug, title, objectives, concepts, difficulty
 * and prerequisites are the blueprint's. Its body is the terminal capability (machines, replayed transcripts, exercises
 * checked in the simulated shell); the activity follows TERMINAL_SHAPES.
 */
export function terminalFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return terminalOutline(lessonId, summary, minutes, 'linux-systems', 'Linux systems');
}
/**
 * SRV-0 (2026-11-22): a network and servers lesson written from its blueprint outline, the same way: the terminal
 * capability (the engine stages E10–E19 of docs/curriculum/SRV0_SERVER_CAPABILITY.md), with network-protocol scenes for
 * the request paths, the architecture overview (SRV05) and the tunnels (SRV10).
 */
export function serverFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return terminalOutline(lessonId, summary, minutes, 'network-servers', 'network and servers');
}
/**
 * DKR-0 (2026-11-23): a Docker lesson written from its blueprint outline, the same way: the terminal capability with the
 * containers profile (engine stage E20 on, docs/curriculum/DKR0_CONTAINER_CAPABILITY.md). container-playground and the
 * security case-study-board are terminal lessons; the architecture overviews (DKR01, DKR02) and the registry pipeline (DKR11)
 * pair the terminal with network-protocol scenes (network-sequence); the capstone is challenge-stages.
 */
export function dockerFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return terminalOutline(lessonId, summary, minutes, 'docker-containers', 'Docker containers');
}
/**
 * LLM-0 (2026-11-22): a lesson of the large-language-models or generative-ai island written from its blueprint outline.
 * Slug, title, objectives, concepts, difficulty and prerequisites are the blueprint's. Its body is the llm-explorer
 * capability (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md): the blueprint's token-explorer, sampling-explorer and
 * embedding-space stay the lesson's activity. A lesson whose blueprint exercises are code-python also has python-code
 * (Python examples and exercises beside the explorers, e.g. BPE merges or cosine similarity with the standard library);
 * `python` overrides that. Other blueprint activities (attention-explorer, prompt-lab, rag-explorer…) are not built:
 * their lessons cannot be written with this builder yet.
 */
export const LLM_ISLANDS = ['large-language-models', 'generative-ai'] as const;
export function llmFromBlueprint(lessonId: string, summary: string, minutes: number, python?: boolean): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || !(LLM_ISLANDS as readonly string[]).includes(b.islandId)) throw new Error(`${lessonId} is not a large-language-models or generative-ai lesson of the blueprint`);
  if (!(LLM_ACTIVITIES as readonly string[]).includes(b.activity)) throw new Error(`${lessonId}: no llm-explorer lesson shape for the blueprint activity ${b.activity}`);
  const withPython = python ?? b.exerciseType === 'code-python';
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'], visualization: 'none',
    status: 'complete', version: '1.0.0', activity: b.activity as LessonActivity,
    capabilities: withPython ? ['python-code', 'llm-explorer'] : ['llm-explorer'], blueprintId: lessonId };
}
/**
 * CICD-0 (2026-11-23): a lesson of the devops-cicd island written from its blueprint outline (slug, title, objectives,
 * concepts, difficulty, prerequisites), docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §2. Unlike the other islands, the
 * shape is chosen per lesson, because the blueprint's case-study-board needs different tools at CICD01 (DORA metrics from
 * a deployment history), CICD08 (secrets in the terminal) and CICD14 (a mitigation drill with the incident's numbers).
 * `stages` are the devops-explorer stages (D1–D4) and terminal engine stages (E25–E31) the lesson needs: a lesson can be
 * mapped before they are built, but it cannot publish until its content exists. `optional` capabilities are added with
 * `withOptional` (CICD10's terminal example, E15 nginx upstream weights in front of two E20 containers). An activity not
 * registered yet cannot be built, nor can a lesson whose devops-explorer stages are not all built (DEVOPS_STAGES_BUILT;
 * CICD12 waited for D4, the logs, which CICD-5 built): the builder says so. monitoring-dashboard is registered with D3
 * (CICD-4); D4's logs are part of it. The blueprint
 * names pipeline-sim, case-study-board and decision-simulation stay planned names; none of them is a lesson activity.
 */
type CicdShape = { blueprint: string; activity: string; capabilities: LessonCapability[]; optional?: LessonCapability[]; visualization: VisualizationType; stages: readonly string[] };
const pipeline = (stages: string[]): CicdShape => ({ blueprint: 'pipeline-sim', activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', stages });
export const CICD_SHAPES: Readonly<Record<string, CicdShape>> = {
  CICD01: { blueprint: 'case-study-board', activity: 'deployment-simulator', capabilities: ['devops-explorer'], visualization: 'none', stages: ['D1'] },
  CICD02: { blueprint: 'decision-simulation', activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', stages: ['E25', 'E26'] },
  CICD03: pipeline(['E25', 'E26', 'E27', 'E28']),
  CICD04: pipeline(['E25', 'E26', 'E27', 'E28']),
  CICD05: pipeline(['E25', 'E26', 'E27', 'E28']),
  CICD06: pipeline(['E25', 'E26', 'E27', 'E28', 'E29']),
  CICD07: pipeline(['E25', 'E26', 'E27', 'E28', 'E29']),
  CICD08: { blueprint: 'case-study-board', activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', stages: ['E25', 'E26', 'E27', 'E28', 'E29'] },
  CICD09: pipeline(['E25', 'E26', 'E27', 'E28', 'E29', 'E30', 'E31']),
  CICD10: { blueprint: 'deployment-simulator', activity: 'deployment-simulator', capabilities: ['devops-explorer'], optional: ['terminal'], visualization: 'none', stages: ['D2'] },
  CICD11: { blueprint: 'monitoring-dashboard', activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], visualization: 'none', stages: ['D3'] },
  CICD12: { blueprint: 'monitoring-dashboard', activity: 'monitoring-dashboard', capabilities: ['devops-explorer', 'terminal'], visualization: 'none', stages: ['D3', 'D4'] },
  CICD13: { blueprint: 'pipeline-sim', activity: 'terminal-sim', capabilities: ['terminal', 'devops-explorer'], visualization: 'none', stages: ['E25', 'E26', 'E27', 'E28', 'E29', 'E30', 'D2'] },
  CICD14: { blueprint: 'case-study-board', activity: 'terminal-sim', capabilities: ['terminal', 'devops-explorer'], visualization: 'none', stages: ['E31', 'D3'] },
  CICD15: { blueprint: 'challenge-stages', activity: 'challenge-stages', capabilities: ['terminal', 'devops-explorer', 'visualization'], visualization: 'challenge-stages', stages: ['E25', 'E26', 'E27', 'E28', 'E29', 'E30', 'E31', 'D2', 'D3'] },
};
/** The devops-explorer stages that exist (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §4): all four. */
export const DEVOPS_STAGES_BUILT: readonly string[] = ['D1', 'D2', 'D3', 'D4'];
export function cicdFromBlueprint(lessonId: string, summary: string, minutes: number, withOptional = false): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== 'devops-cicd') throw new Error(`${lessonId} is not a DevOps and CI/CD lesson of the blueprint`);
  const s = CICD_SHAPES[lessonId];
  if (!s || s.blueprint !== b.activity) throw new Error(`${lessonId}: no devops-cicd lesson shape for the blueprint activity ${b.activity}`);
  if (!(LESSON_ACTIVITIES as readonly string[]).includes(s.activity)) throw new Error(`${lessonId}: the ${s.activity} activity is not registered yet (it is built with ${s.stages.join(', ')})`);
  const waiting = s.stages.filter(x => /^D\d$/.test(x) && !DEVOPS_STAGES_BUILT.includes(x));
  if (waiting.length) throw new Error(`${lessonId}: the devops-explorer stage ${waiting.join(', ')} is not built yet (the ${s.activity} activity needs ${s.stages.filter(x => /^D\d$/.test(x)).join(' and ')})`);
  if (withOptional && !s.optional) throw new Error(`${lessonId} has no optional capability`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'], visualization: s.visualization,
    status: 'complete', version: '1.0.0', activity: s.activity as LessonActivity,
    capabilities: withOptional ? [...s.capabilities, ...s.optional!] : [...s.capabilities], blueprintId: lessonId };
}
/**
 * KUB-0 (2026-11-24): a lesson of the kubernetes-reliability island written from its blueprint outline (slug, title,
 * objectives, concepts, difficulty, prerequisites), docs/curriculum/KUB0_KUBERNETES_CAPABILITY.md §2. The shape is chosen
 * per lesson, as CICD_SHAPES does: the blueprint's cluster-sim is the terminal with a simulated cluster (kubectl, engine
 * stages E32–E40), architecture-diagram (KUB02) and request-path (KUB07) pair the terminal with network-protocol scenes,
 * KUB12–KUB14 are the devops-explorer's monitoring-dashboard (metric-explorer is not registered: ML19–ML22 keep that name
 * for model metrics), and the capstone is challenge-stages. `stages` are the terminal engine stages (E32–E40, plus older
 * ones a lesson leans on) and devops-explorer stages (D3–D6) it needs; a lesson whose KUB engine stages
 * (KUBE_STAGES_BUILT) or devops-explorer stages (DEVOPS_STAGES_BUILT) are not all built cannot be built yet: the builder
 * says so. KUB11's optional devops-explorer (a D2 rollout beside kubectl) is added with `withOptional`.
 */
type KubeShape = { blueprint: string; activity: string; capabilities: LessonCapability[]; optional?: LessonCapability[]; visualization: VisualizationType; stages: readonly string[] };
const cluster = (stages: string[]): KubeShape => ({ blueprint: 'cluster-sim', activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', stages });
export const KUB_SHAPES: Readonly<Record<string, KubeShape>> = {
  KUB01: cluster(['E32', 'E33', 'E34']),
  KUB02: { blueprint: 'architecture-diagram', activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none', stages: ['E32'] },
  KUB03: cluster(['E32', 'E33']),
  KUB04: cluster(['E32', 'E33', 'E34']),
  KUB05: cluster(['E35']),
  KUB06: cluster(['E36']),
  KUB07: { blueprint: 'request-path', activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none', stages: ['E35', 'E37', 'E13'] },
  KUB08: cluster(['E38']),
  KUB09: cluster(['E39']),
  KUB10: cluster(['E40']),
  KUB11: { ...cluster(['E34', 'E35']), optional: ['devops-explorer'] },
  KUB12: { blueprint: 'monitoring-dashboard', activity: 'monitoring-dashboard', capabilities: ['devops-explorer', 'terminal'], visualization: 'none', stages: ['D3', 'D4', 'E40'] },
  KUB13: { blueprint: 'metric-explorer', activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], visualization: 'none', stages: ['D3', 'D4', 'D5'] },
  KUB14: { blueprint: 'metric-explorer', activity: 'monitoring-dashboard', capabilities: ['devops-explorer'], visualization: 'none', stages: ['D6'] },
  KUB15: { blueprint: 'challenge-stages', activity: 'challenge-stages', capabilities: ['terminal', 'devops-explorer', 'visualization'], visualization: 'challenge-stages',
    stages: ['E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'E38', 'E39', 'E40', 'D3', 'D5', 'D6'] },
};
/** The terminal engine stages of the KUB range (E32–E40) that exist (KUB0_KUBERNETES_CAPABILITY.md §4): E32, built in KUB-0; E33 and E34 (KUB-1). */
export const KUBE_STAGES_BUILT: readonly string[] = ['E32', 'E33', 'E34'];
const KUBE_RANGE = /^E(3[2-9]|40)$/;
export function kubeFromBlueprint(lessonId: string, summary: string, minutes: number, withOptional = false): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== 'kubernetes-reliability') throw new Error(`${lessonId} is not a Kubernetes and reliability lesson of the blueprint`);
  const s = KUB_SHAPES[lessonId];
  if (!s || s.blueprint !== b.activity) throw new Error(`${lessonId}: no kubernetes-reliability lesson shape for the blueprint activity ${b.activity}`);
  if (!(LESSON_ACTIVITIES as readonly string[]).includes(s.activity)) throw new Error(`${lessonId}: the ${s.activity} activity is not registered yet`);
  const engine = s.stages.filter(x => KUBE_RANGE.test(x) && !KUBE_STAGES_BUILT.includes(x));
  if (engine.length) throw new Error(`${lessonId}: the terminal engine stage ${engine.join(', ')} is not built yet (the lesson needs ${s.stages.filter(x => KUBE_RANGE.test(x)).join(', ')})`);
  const devops = s.stages.filter(x => /^D\d$/.test(x) && !DEVOPS_STAGES_BUILT.includes(x));
  if (devops.length) throw new Error(`${lessonId}: the devops-explorer stage ${devops.join(', ')} is not built yet (the lesson needs ${s.stages.filter(x => /^D\d$/.test(x)).join(', ')})`);
  if (withOptional && !s.optional) throw new Error(`${lessonId} has no optional capability`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'], visualization: s.visualization,
    status: 'complete', version: '1.0.0', activity: s.activity as LessonActivity,
    capabilities: withOptional ? [...s.capabilities, ...s.optional!] : [...s.capabilities], blueprintId: lessonId };
}
/**
 * WEB-0 (2026-11-23): a web foundations lesson written from its blueprint outline (slug, title, objectives, concepts,
 * difficulty, prerequisites). Its body is the web-code capability: pages in a sandboxed frame beside the DOM the browser
 * built, and exercises checked on that page. dom-explorer is that activity. The island's other blueprint activities
 * (pipeline-diagram, concurrency-timeline, memory-inspector, a11y-checker, metric-explorer) are not built: they stay in
 * INTERACTIVE_LAB_ROADMAP and the lesson uses pages instead, never a stand-in; protocol-sequence (WEB11, fetch) is taught
 * on pages too, with the requests they make listed beside them; the capstone adds challenge-stages.
 */
const WEB_SHAPES: Readonly<Record<string, Pick<Outline, 'activity' | 'capabilities' | 'visualization'>>> = {
  'dom-explorer': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'pipeline-diagram': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'concurrency-timeline': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'memory-inspector': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'a11y-checker': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'metric-explorer': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  // WEB-4: fetch (WEB11) is taught on pages whose requests a pretend server answers (engine stage W3); the page's list
  // of requests and answers is the sequence, so no network-protocol scene is added.
  'protocol-sequence': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  // MOB-1: the mobile apps island's analysis lessons are taught on pages too (cases a learner repairs), not on a board.
  'case-study-board': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'decision-simulation': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  // RWD-0: the responsive design island's activities.
  'responsive-sim': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'flexbox-playground': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'grid-playground': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'mobile-nav-sim': { activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' },
  'challenge-stages': { activity: 'challenge-stages', capabilities: ['web-code', 'visualization'], visualization: 'challenge-stages' },
};
/** The blueprint activities each web-code island maps. */
type WebIsland = 'web-foundations' | 'responsive-design' | 'mobile-apps';
const WEB_ACTIVITIES: Readonly<Record<WebIsland, readonly string[]>> = {
  'web-foundations': ['dom-explorer', 'pipeline-diagram', 'concurrency-timeline', 'memory-inspector', 'a11y-checker', 'metric-explorer', 'protocol-sequence', 'challenge-stages'],
  'responsive-design': ['responsive-sim', 'flexbox-playground', 'grid-playground', 'mobile-nav-sim', 'challenge-stages'],
  'mobile-apps': ['case-study-board', 'mobile-nav-sim', 'dom-explorer', 'responsive-sim', 'decision-simulation', 'protocol-sequence', 'metric-explorer', 'a11y-checker', 'challenge-stages'],
};
function webOutline(lessonId: string, summary: string, minutes: number, island: WebIsland, what: string): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== island) throw new Error(`${lessonId} is not a ${what} lesson of the blueprint`);
  const s = WEB_ACTIVITIES[island].includes(b.activity) ? WEB_SHAPES[b.activity] : undefined;
  if (!s) throw new Error(`${lessonId}: no web lesson shape for the blueprint activity ${b.activity}`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'],
    status: 'complete', version: '1.0.0', ...s, blueprintId: lessonId };
}
export function webFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return webOutline(lessonId, summary, minutes, 'web-foundations', 'web foundations');
}
/**
 * RWD-0 (2026-11-23): a responsive design lesson written from its blueprint outline, on the web-code capability: pages in
 * a preview whose width the learner switches, and exercises whose one answer is checked at several viewport widths
 * (the resize step). The blueprint's responsive-sim, flexbox-playground, grid-playground and mobile-nav-sim name the
 * standalone labs under /learn (linked from the lessons as further practice); in a lesson the activity is dom-explorer.
 */
export function responsiveFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return webOutline(lessonId, summary, minutes, 'responsive-design', 'responsive design');
}
/** Batches 1–5: the programming-languages island's written lessons, PL20 its capstone. */
const programmingLanguages: Outline[] = [
  programFromBlueprint('PL01', '用同一個「偶數平方和」問題比較命令式、程序式、物件導向與函數式寫法，認識宣告式的 SQL 與邏輯式的 Prolog，看懂 C++、Java、Python、JavaScript 各自支援的典範組合，並依可讀性與可變狀態選擇合適的風格。', 45, 'variable-state'),
  programFromBlueprint('PL02', '用類別把狀態與行為包在一起、以私有欄位守住不變條件，比較 C++、Java、Python、JavaScript 的存取權限、繼承、介面與抽象類別（含 JavaScript 的 prototype 鏈），追蹤 virtual／override 的動態分派在執行時選到哪個方法，並判斷何時該用組合而非繼承。', 55, 'function-call'),
  programFromBlueprint('PL03', '分辨純函式與副作用、用不可變資料避免意外修改，以 lambda 與 map、filter、reduce 把可變狀態的迴圈改寫成函式組合，並比較遞迴與 reduce 的限制，說明參照透明為什麼讓測試更簡單。', 50, 'function-call'),
  programFromBlueprint('PL04', '區分「什麼時候檢查」的靜態／動態型別與「會不會自動轉型」的強／弱型別，預測 "5" + 1 這類運算在 C++、Java、Python、JavaScript 中是編譯錯誤、執行期錯誤還是悄悄轉型，追蹤 auto 與 var 的型別推論，比較名義與結構型別，並把寬鬆的隱式轉型改寫成嚴格驗證的輸入解析。', 50, 'none'),
  programFromBlueprint('PL05', '區分多載、覆寫與泛型三種多型，用 C++ 模板、Java 有界泛型、Python TypeVar 與 Protocol 寫出帶約束的通用函式，並比較模板實例化與型別擦除的代價與限制。', 60, 'none'),
  // Batch 2 (2026-11-20): scope, memory, errors and the first step of language processing.
  programFromBlueprint('PL06', '分辨名稱綁定與環境、比較詞法作用域與動態作用域並畫出作用域鏈，追蹤閉包如何捕捉外層變數並在呼叫結束後繼續存活，修正 JavaScript var 與 Python late binding 在迴圈中捕捉錯值的 bug，並比較 C++ lambda 的值捕捉、參考捕捉與 Java 只能捕捉 effectively final 變數的規則。', 55, 'function-call'),
  programFromBlueprint('PL07', '畫出函式呼叫時的堆疊框架與堆積物件，預測 C++ 值複製、指標與參考，以及 Java、Python、JavaScript 共用參考時「改了誰」，比較四種語言的參數傳遞（含傳遞參考的值與重新賦值的差別）與物件生命週期，並辨識懸空指標、記憶體洩漏與越界存取。', 55, 'function-call'),
  programFromBlueprint('PL08', '比較手動 new/delete、RAII 與 unique_ptr／shared_ptr／weak_ptr、參考計數與追蹤式 GC 由誰在何時釋放物件，看出循環參考為什麼讓參考計數失效、weak_ptr 與 Python 的循環收集器如何補救，在物件圖上模擬 mark-and-sweep 從根集合標記可達物件，並說明世代式 GC 的弱世代假說與停頓對程式的影響。', 55, 'graph-traversal'),
  programFromBlueprint('PL09', '比較錯誤碼、例外與 Result／Optional 三種錯誤表示，用 C++ 的 std::optional、Java 的 Optional、Python 的 None 與 JavaScript 的 { ok, value } 寫同一個解析函式，追蹤例外穿過多層呼叫時的堆疊回溯與 finally／RAII 清理順序，說明 Java checked 與 unchecked 例外的設計取捨，並以邊緣驗證、統一錯誤表示與資源釋放設計清楚的錯誤邊界。', 55, 'function-call'),
  programFromBlueprint('PL10', '說明 lexer 在編譯／直譯流程中的位置，把字元切成帶有種類、原文與位置的 token，用狀態轉移迴圈（有限狀態機）寫出 lexer，以最長匹配區分 >= 與 >、關鍵字與識別字，比較正規表示式寫法的順序陷阱，並跳過空白與註解、對非法字元回報行號與欄號。', 55, 'variable-state'),
  // Batch 3 (2026-11-20): parsing and interpreting, then concurrency (BATCH_3_PLAN.md).
  programFromBlueprint('PL11', '讀懂 BNF／EBNF 描述的運算式文法並手動推導，把每條規則寫成一個函式、以遞迴下降把 token 串列解析成 AST，用 expr／term／factor 的層次表達先乘除後加減，以迴圈做左結合、遞迴做右結合，比較具體語法樹與 AST，辨識歧義文法與懸置 else，並對語法錯誤回報出錯 token 的欄號。', 55, 'tree-traversal'),
  programFromBlueprint('PL12', '以後序走訪對 AST 求值，用帶 parent 鏈的環境表實作變數綁定與巢狀作用域（對應 PL06 的作用域鏈），為小語言加上 set、if、while 與建立新環境的函式呼叫，分辨 parser 發現的語法錯誤與走訪到節點才發生的執行期錯誤，寫出保留環境的 REPL，並比較直譯與編譯在啟動、執行速度與除錯上的取捨。', 55, 'recursion-trace'),
  programFromBlueprint('PL13', '區分並行與平行，比較共享記憶體執行緒、事件迴圈非同步與 actor／訊息傳遞三種模型並依情境選擇，用可重現的排程模擬在時間軸上重現兩個執行緒「讀—加—寫」的遺失更新並列舉所有交錯的結果，說明 C++ std::thread、Java 執行緒與 ExecutorService、Python GIL 下的執行緒與 JavaScript 單執行緒事件迴圈的差異。', 55, 'variable-state'),
  programFromBlueprint('PL14', '用互斥鎖（std::mutex＋lock_guard、synchronized、threading.Lock）與原子操作（std::atomic、AtomicInteger、Atomics）保護共享計數器並分辨可見性與原子性，以等待圖說明死結的四個條件、用固定鎖順序與 std::scoped_lock 避開它，用條件變數（在 while 迴圈中等待）或 BlockingQueue／queue.Queue 寫出有界緩衝區的生產者—消費者，並比較 C++ std::thread、Java synchronized 與虛擬執行緒、Python threading 與 JavaScript 單執行緒事件迴圈的同步方式。', 60, 'stack-queue'),
  programFromBlueprint('PL15', '追蹤 JavaScript 事件迴圈中呼叫堆疊、任務佇列與微任務佇列的變化，準確預測同步程式、Promise、await 與 setTimeout 混合時的輸出順序，把巢狀回呼改寫成 Promise／Future 與 async／await，用 Promise.all、asyncio.gather 同時等待多個工作並在 await 處處理錯誤，以 generator 與協程說明函式如何暫停與恢復，並比較 JavaScript、Python asyncio、Java CompletableFuture 與 C++ std::future 的執行模型。', 60, 'stack-queue'),
  programFromBlueprint('PL16', '把一小段程式走過完整的編譯流程：說明前端、中端、後端各階段的輸入與輸出，以符號表做名稱解析並檢查型別，用後序走訪把運算式攤平成三位址碼，把 if 與 while 降成跳躍、切出基本區塊並畫出控制流程圖，再以常數折疊、常數傳播與死碼消除改寫中間表示，最後產生堆疊機器指令，並認識 LLVM IR、GIMPLE 與 JVM 位元組碼這些真實的中間表示。', 60, 'graph-traversal'),
  programFromBlueprint('PL17', '把運算式與迴圈編譯成的位元組碼交給堆疊式 VM，以取指—解碼—執行迴圈逐條追蹤 pc、運算元堆疊與區域變數槽，比較堆疊式與暫存器式 VM（JVM、CPython 與 Lua、Dalvik），說明 Java（javac、.class、HotSpot 直譯器與 C1／C2）、CPython（.pyc 與直譯器迴圈）、V8（Ignition 與 TurboFan）與 C++ AOT 的執行路徑，用呼叫計數與型別守衛的確定性模擬說明 JIT 的熱點、型別回饋與去最佳化，並分析 AOT、直譯與 JIT 在啟動時間、峰值效能、記憶體與暖機上的取捨。', 60, 'stack-queue'),
  programFromBlueprint('PL18', '用反射在執行期列出類別的欄位與方法並依名稱呼叫（Java Class、getDeclaredMethods 與 setAccessible 在模組系統下的限制、Python getattr／vars／inspect、JavaScript Reflect，C++ 沒有執行期反射），寫出在定義時套用的 Python 裝飾器並追蹤疊加時「套用由下往上、呼叫由外往內」的順序與 functools.wraps，以 @Retention(RUNTIME) 的 Java 註解搭配反射做計時處理，用 C++ 模板遞迴、constexpr 與 static_assert 在編譯期計算，以 Proxy 的 get／set／apply 陷阱攔截物件操作，並評估反射、Proxy、程式碼產生、巨集與 eval 對可讀性、除錯、效能與安全的影響。', 60, 'function-call'),
  programFromBlueprint('PL19', '從安全、效能、表達力與學習成本比較 C++、Java、Python、JavaScript 的設計選擇，以四語程式看出 null 處理（std::optional、Optional、None、?. 與 ??）、預設可變與淺層的 const／final／tuple／Object.freeze、記憶體管理、整數溢位與相等比較的後果，讀懂 Java record、Python match、ES2020 ?? 等新版本特性解決了什麼、沒有解決什麼，並以硬性限制加權重的方法為專案情境選語言、寫出理由與代價。', 55, 'none'),
  programFromBlueprint('PL20', '把 PL10 的 lexer、PL11 的遞迴下降 parser 與 PL12 的樹走訪直譯器接成一個能執行的迷你語言：用帶 parent 鏈的環境實作 let、遞迴與捕捉環境的閉包，在每個運算做動態型別檢查並以「error line N: …」回報第一個語法、名稱或型別錯誤，以瞄準規則的測試證明作用域、遞迴與錯誤行為，並說明動態檢查、急切求值、整數除法與全域重新綁定這些設計取捨的代價。', 120, 'challenge-stages'),
];

/** CN-1 to CN-5 (2026-11-22): the computer-networks island's lessons, written with the network-protocol capability (CN0_NETWORK_CAPABILITY.md). */
const networks: Outline[] = [
  networkFromBlueprint('CN01', '說明網路為什麼分層、每層只使用下一層的服務，對照 OSI 七層與 TCP/IP 四層及各層代表協定，在固定情境中追蹤 HTTP 請求經過交換器與路由器時由上而下封裝成訊框、在接收端由下而上解封裝，並以 DNS 查詢比較 UDP 與 TCP 標頭，區分訊息、區段／資料包、封包、訊框與位元等各層 PDU。', 45),
  networkFromBlueprint('CN02', '把位元看成在雙絞線、光纖與空氣中傳送的電、光與無線電訊號並比較三種媒介，分清頻寬、吞吐量與延遲，逐步算出傳輸延遲與傳播延遲、RTT 與頻寬延遲乘積，並在多段路徑上找出決定吞吐量的瓶頸鏈路。', 50),
  networkFromBlueprint('CN03', '拆開 Ethernet 訊框的前導碼、MAC 位址、EtherType、酬載與 FCS，認識 48 位元 MAC 位址、OUI 與廣播位址，比較同位元、檢查碼與 CRC 如何偵測（而不修正）錯誤，依一串訊框模擬交換器學習 MAC 位址表並判斷轉送、泛洪、過濾與老化，區分集線器、交換器與路由器的工作層級，並以 802.1Q 標籤看 VLAN 如何切開廣播網域。', 50),
  networkFromBlueprint('CN04', '從 Wi-Fi 的 SSID、BSSID 與 2.4／5／6 GHz 頻段和通道出發，逐步看手機掃描、關聯並完成 WPA2 四向交握，比較 CSMA/CD 與 CSMA/CA、用 RTS/CTS 與 NAV 解決隱藏終端，追蹤手機邊下載邊在兩座 5G 基地台之間換手，並用訊號強度、干擾、距離與速率調整解釋 Wi-Fi 為什麼會變慢、提出改善做法。', 50),
  networkFromBlueprint('CN05', '把 IPv4 位址在二進位與點分十進位之間轉換，以子網路遮罩與 CIDR 用 AND 算出網路位址、廣播位址與可用主機數，判斷目的地在同一子網路還是交給預設閘道，依部門人數由大到小、對齊邊界把 192.168.10.0/24 切成子網路並寫出每段範圍，再認識私有位址、特殊用途位址與 IPv6 的壓縮寫法。', 55),
  // CN-2 (2026-11-22): address translation, routing and the transport layer.
  networkFromBlueprint('CN06', '追蹤筆電接上網路後以 DHCP 的 Discover、Offer、Request、Ack 廣播與單播取得位址、遮罩、預設閘道與租約並在 T1 續約，判斷同網段或跨網段後用 ARP 廣播請求、單播回覆問出閘道或目的主機的 MAC 並讀懂 ARP 快取，再以 NAT 轉譯表與連接埠轉譯讓多台裝置共用一個公開位址，說明入站連線為什麼需要連接埠轉送、NAT 為什麼不等於防火牆。', 55),
  networkFromBlueprint('CN07', '分清轉送與路由，讀懂路由表的目的前綴、下一跳、介面與來源，用二進位做最長前綴匹配選出送出介面，設定靜態路由與預設路由，並追蹤 TTL 如何結束靜態路由打錯造成的迴圈、回傳 ICMP Time Exceeded。', 55),
  networkFromBlueprint('CN08', '以 Bellman-Ford 的想法逐步模擬 RIP 式距離向量路由交換向量、更新路由表直到收斂，看鏈路斷線後壞消息如何慢慢傳開、計數到無限與毒性逆轉的效果，再以 LSA 泛洪與 Dijkstra 說明 OSPF 每台路由器如何從同一份鏈路狀態資料庫算出自己的最短路徑樹，最後區分自治系統內部的路由與依政策選路的 BGP 路徑向量。', 60),
  networkFromBlueprint('CN09', '以 5-tuple 說明連接埠與 socket 如何區分同一台主機上的程式，拆開 8 位元組的 UDP 標頭與 TCP 標頭的連接埠、Seq、Ack、旗標、視窗與檢查碼，逐步追蹤三向交握、資料傳輸與四次揮手的序號與 ACK（SYN 與 FIN 各占一個序號、Ack 是下一個期待的位元組），看懂 TIME_WAIT 與連到沒開的連接埠時的 RST，並為 DNS、串流影音、線上遊戲與檔案下載選擇 TCP 或 UDP。', 55),
  networkFromBlueprint('CN10', '從累積確認、RTO 逾時重送與三個重複 ACK 的快速重傳出發，用滑動視窗說明在途資料最多 min(rwnd, cwnd)，追蹤接收視窗縮到 0、視窗探測與視窗更新的流量控制，依 Reno 規則一輪一輪算出慢啟動、壅塞避免（AIMD）、重複 ACK 減半與逾時歸 1 的壅塞視窗，並比較流量控制與壅塞控制、說明遺失為什麼讓吞吐量下降。', 60),
  // CN-3 (2026-11-22): sockets and REST are program lessons (their code runs in the tests, on loopback or recorded
  // responses, never a real network); DNS and HTTP, TLS and caching are network scenes.
  programFromBlueprint('CN11', '用 socket、bind、listen、accept 與 connect 在本機迴路上寫出 TCP 回聲伺服器與客戶端，看懂 TCP 是位元組串流、一次 send 不等於一次 recv，以換行分隔與 4 位元組大端序的長度前綴切出每一則訊息，分清 UTF-8 的字元數與位元組數，用序號處理 UDP 資料包的遺失、重複與亂序，以每條連線一個執行緒或事件驅動讓伺服器同時服務多個客戶端，並處理連線被拒、逾時、部分讀取與正確關閉。', 60, 'stack-queue'),
  networkFromBlueprint('CN12', '從在網址列輸入網址到收到 HTML，逐步追蹤 stub 解析程式、遞迴解析器、根、TLD 與權威伺服器的迭代查詢與 AA、RD、RA 旗標，讀懂 A、AAAA、CNAME、MX、NS、TXT 紀錄與 TTL 快取如何讓第二次查詢跳過根伺服器，拆開 HTTP/1.1 請求與回應的起始列、標頭與本文，分辨 GET、HEAD、POST、PUT、DELETE 的安全與冪等和 2xx 到 5xx 狀態碼，看懂 301 重新導向與持久連線上的多個請求，並以 Set-Cookie 的 Domain、HttpOnly、Secure、SameSite 與 Cookie 標頭說明登入如何在無狀態的 HTTP 上維持。', 55),
  networkFromBlueprint('CN13', '分清對稱加密、非對稱加密與雜湊在 TLS 中的分工，讀懂 X.509 憑證的主體、SAN、簽發者、有效期間與公鑰，從葉憑證經中繼憑證走到信任儲存區的根憑證驗證信任鏈，逐步追蹤 TLS 1.3 的 ClientHello、ServerHello 與加密的 EncryptedExtensions、Certificate、CertificateVerify、Finished（外層內容類型 23）以及兩端金鑰的導出，說明 (EC)DHE 如何提供前向保密，辨識憑證過期、名稱不符與混合內容警告的風險，並以 HSTS 與預載清單防止降級，說清楚 HTTPS 保護與不保護的資訊。', 60),
  programFromBlueprint('CN14', '用資源與 HTTP 方法設計待辦事項 API 的端點與分頁，組出帶 Authorization 標頭與 JSON 本文的請求，解析 JSON 並驗證它的形狀（C++ 與 Java 以手寫的子集解析器示範），看懂 JavaScript double 對大整數 id 的捨入，依 200、201、204、401、403、404、409、422、429 等狀態碼與錯誤物件處理回應，以重送實驗說明 PUT、DELETE 的冪等性與 POST 的 Idempotency-Key，並分辨 API 金鑰與 Bearer token、401 與 403，以及由瀏覽器執行的 CORS 預檢。', 60, 'variable-state'),
  networkFromBlueprint('CN15', '以 Cache-Control 的 max-age、no-cache、no-store、private／public 與 immutable 決定瀏覽器與 CDN 何時重用快取，用 ETag 與 If-None-Match 換得 304 Not Modified，以雜湊檔名讓靜態檔放心快取一年，在固定情境中追蹤 CDN 邊緣節點的命中與回源，依「命中率 × 邊緣 RTT +（1 − 命中率）×（邊緣 RTT + 來源 RTT）」算出期望延遲，並比較 HTTP/1.1 的隊頭阻塞、HTTP/2 在一條 TCP 連線上的多工與 HPACK，以及 HTTP/3 以 QUIC 在 UDP 上做到逐串流的遺失復原、1-RTT 交握與連線遷移。', 55),
  // CN-4 (2026-11-22): WebSocket is a program lesson (frames and the handshake key run in the tests); debugging tools,
  // security basics and firewalls are network scenes; CN19's firewall exercises are rules the learner writes.
  programFromBlueprint('CN16', '比較輪詢、長輪詢、Server-Sent Events（text/event-stream）與全雙工的 WebSocket 在請求數、延遲與標頭成本上的差異，追蹤 HTTP/1.1 的 Upgrade 交握與 101 Switching Protocols 並以 base64(SHA-1(key + GUID)) 算出 Sec-WebSocket-Accept，逐位元拆解 RFC 6455 訊框的 FIN、opcode、MASK、7／16／64 位元長度與遮罩金鑰的 XOR，寫出以連線表廣播訊息的簡易聊天室伺服器，並用 ping／pong 心跳偵測半開連線、以 close 狀態碼關閉，再以指數退避加抖動重連，說明聊天室為何選擇 WebSocket 而非輪詢。', 60, 'variable-state'),
  networkFromBlueprint('CN17', '用 ping 的 ICMP Echo 與回覆 TTL、traceroute 的 TTL 遞增與 Time Exceeded、dig 的 status 與 @解析器比較、curl -v 的連線與 TLS 階段和封包擷取的 SYN／RST，依分層除錯判斷「網站打不開」是 DNS、路由、連接埠還是應用層的問題。', 55),
  networkFromBlueprint('CN18', '以機密性、完整性與可用性分析網路威脅，逐步追蹤咖啡店區域網路上的 ARP 偽冒如何形成中間人、TLS 的憑證檢查如何以 unknown_ca 擋下偽造的憑證，看懂 IP、MAC、DNS 與電子郵件寄件者的偽冒與對應防護，在固定情境中看偽冒來源的 SYN flood 塞滿半開佇列、SYN cookies 如何不占佇列完成交握，比較流量型與反射放大攻擊及速率限制、CDN 與清洗、anycast 的防護，辨識仿冒網域與有效憑證的釣魚網站、說明鎖頭為什麼不證明網站身分與通行金鑰為什麼能抵抗釣魚，並認識封包過濾防火牆的能力與限制。', 55),
  networkFromBlueprint('CN19', '分清無狀態封包過濾與狀態檢查，讀懂連線追蹤表如何讓回應進來而不開放入站埠，以預設拒絕、最小權限與「第一條符合的規則決定結果」寫出防火牆規則並預測每個封包的結果，用 DMZ 與網段隔離限制被攻破的伺服器能走的路，追蹤站對站 VPN 把內層封包加密後裝進外層 UDP 封包的封裝、比較遠端存取 VPN 並說明 VPN 保護與不保護的範圍，最後以身分感知的存取代理與微分段比較城堡與護城河和零信任。', 60),
  // CN-5 (2026-11-22): the capstone; its outcome is a working API service, so it is a program lesson with challenge stages.
  programFromBlueprint('CN20', '把整座島接成一件作品：依時間順序追蹤筆電以 DHCP 取得位址、以 ARP 問出閘道的 MAC、以 DNS 解析 api.example.com，再經路由與 NAT、TCP 三向交握與 TLS 1.3 送出 HTTPS 請求，設計並實作一個在記憶體中處理原始 HTTP/1.1 請求的待辦事項 REST API 服務（以 FNV-1a 的 ETag 回應 304、以 Bearer token 區分 401 與 403、固定的檢查順序與 Cache-Control），用 dig、curl、ss、openssl 與 tcpdump 分層診斷錯誤的 DNS 紀錄、丟棄 443 的防火牆、只聽 127.0.0.1 的服務、過期的憑證與缺少的 Cache-Control，最後寫下 HTTPS、HSTS、快取、存取控制與防火牆規則的設定和設計取捨。', 120, 'challenge-stages'),
];

/**
 * AIF-0 (2026-11-22): a Python-only program lesson of an AI island, written from its blueprint outline (slug, title,
 * objectives, concepts, difficulty, prerequisites). The blueprint's exercises there are code-python, so the lesson's
 * examples and exercises are Python, run by the tests; its blueprint activity (search-tree, game-tree…) is not built yet
 * and the lesson shows one of the implemented shared visualizations instead, never a stand-in.
 */
export function pythonFromBlueprint(lessonId: string, summary: string, minutes: number, visualization: VisualizationType): Outline {
  const b = planning.plannedLessons.find(l => l.lessonId === lessonId);
  if (!b || b.islandId !== 'ai-foundations') throw new Error(`${lessonId} is not an AI foundations lesson of the blueprint`);
  return { slug: b.slug, title: b.title, summary, objectives: b.learningObjectives, concepts: b.concepts, difficulty: b.difficulty as Difficulty,
    minutes, prerequisites: b.prerequisites as LessonId[], recommended: b.recommended as AnyLessonId[], apcs: ['none'], visualization,
    status: 'complete', version: '1.0.0', capabilities: ['python-code'], blueprintId: lessonId };
}

/** AIF-1 (2026-11-22): the AI foundations island's first lessons, Python only (python-code, AIF0_PYTHON_CAPABILITY.md); AIF-2 adds AIF06–AIF10, AIF-3 AIF11–AIF15, AIF-4 AIF16–AIF19, AIF-5 the capstone AIF20. */
const aiFoundations: Outline[] = [
  pythonFromBlueprint('AIF01', '用 AI 的四種定義、理性代理人與圖靈測試判斷什麼算 AI，比較狹義 AI 與通用 AI、符號式與資料驅動兩條路線，並以明確的規則把日常系統分類為規則式程式或 AI 系統。', 45, 'conditional-branch'),
  pythonFromBlueprint('AIF02', '從 1956 年達特茅斯會議、早期符號 AI、MYCIN 與 XCON 等專家系統和兩次 AI 寒冬，到感知器與 XOR、1986 年普及的反向傳播、2012 年的 AlexNet 與 2017 年 Transformer 之後的基礎模型，比較符號主義、連結主義與統計學習，說明運算力、資料與演算法如何推動每一波興起，並以 Python 實作前向鏈結專家系統、學會 AND 卻學不會 XOR 的整數感知器，以及依時期分組的 AI 時間軸。', 45, 'none'),
  pythonFromBlueprint('AIF03', '以 PEAS 描述任務、分類環境並比較五種代理人，再用 Python 寫出在格子世界中吸塵的反射型代理人。', 50, 'array-index'),
  pythonFromBlueprint('AIF04', '把問題形式化為狀態、動作、轉移模型、目標測試與路徑成本，在同一個搜尋框架中比較 BFS、UCS、DFS 與迭代加深搜尋的完備性、最佳性與展開節點數。', 60, 'tree-traversal'),
  pythonFromBlueprint('AIF05', '依估計的剩餘成本引導搜尋：貪婪最佳優先、A* 的 f = g + h、可接受與一致的啟發函數，以及格子尋路。', 60, 'graph-traversal'),
  pythonFromBlueprint('AIF06', '以目標函數地形說明區域最大、高原與山脊，用 Python 在 8 皇后上實作最陡上升、橫移與隨機重啟、模擬退火的 exp(Δ/T) 接受機率與溫度排程，以及基因演算法的選擇、交配與突變，並以固定種子比較各方法的成功率與步數。', 55, 'array-index'),
  pythonFromBlueprint('AIF07', '把雙人零和、完全資訊遊戲寫成遊戲樹，讓 MAX 與 MIN 輪流取最大與最小值倒推出 minimax 值，數出井字遊戲完整遊戲樹的 549,946 個節點與 5,478 個盤面，說明深度限制、評估函數與地平線效應，並以 Python 實作不會輸的井字遊戲 AI。', 55, 'recursion-tree'),
  pythonFromBlueprint('AIF08', '在 minimax 上加入 alpha 與 beta 剪掉不影響結果的分支，量測行動排序省下的節點數，並以 expectiminimax 處理機率節點、以 UCB1 的蒙地卡羅樹搜尋選擇走法。', 55, 'recursion-tree'),
  pythonFromBlueprint('AIF09', '把地圖著色、考試排程與數獨寫成變數、值域與限制，以回溯搜尋加上前向檢查與 AC-3 弧一致性縮小值域，用 MRV、degree 與 LCV 決定順序，並以 Python 寫出解地圖著色與 4 × 4 數獨的 CSP 解題器。', 60, 'recursion-tree'),
  pythonFromBlueprint('AIF10', '比較規則、語意網路、框架與本體論，用主詞—述詞—受詞三元組建立校園知識圖譜，以類別階層、繼承與企鵝的例外說明預設推理，並以 Python 寫出直接查詢、繼承查詢與沿指定述詞做 BFS 的多步關係查詢，再和 ER 模型比較表達能力。', 50, 'graph-traversal'),
  pythonFromBlueprint('AIF11', '以命題、連接詞與真值表定義語法和語意，用列舉模型的模型檢查判斷蘊涵、可滿足性與有效性，以真值表說明 modus ponens 等推論規則的可靠性，把語句轉成 CNF 以歸結反證，並以 Python 對 Horn 子句實作前向鏈結與後向鏈結。', 60, 'dp-table'),
  pythonFromBlueprint('AIF12', '說明命題邏輯為何不夠，以物件、述詞、函數與常數描述家族關係，正確使用全稱與存在量詞翻譯中文敘述並避開 ∀ 配 ∧、∃ 配 ⇒ 的錯誤，用 Python 實作含 occurs check 的合一與一階前向鏈結推導隱含的親屬關係，再說明一階歸結的半可判定性並和知識圖譜查詢比較。', 60, 'variable-state'),
  pythonFromBlueprint('AIF13', '從代理人為何需要以機率表示信念談起，以隨機變數與完整聯合分布做邊際化、條件機率、乘法規則與連鎖規則，用列舉與正規化 α 回答查詢，說明獨立與條件獨立如何把指數大小的表格縮小，並以 Fraction 精確計算、以固定種子的模擬估計機率。', 50, 'dp-table'),
  pythonFromBlueprint('AIF14', '從乘法規則推導貝氏定理，區分先驗、概似、證據與後驗，以醫療檢測的精確分數說明基本比率謬誤，用正規化與枚舉從聯合分布回答查詢，在條件獨立下逐一更新多個證據，並以 Python 寫出加上 Laplace 平滑與對數機率的單純貝氏文字分類器。', 50, 'variable-state'),
  pythonFromBlueprint('AIF15', '以有向無環圖與條件機率表建立警報情境的貝氏網路，用因式分解比較參數數量，從鏈、分叉與對撞讀出條件獨立與 d-分離，以枚舉推論算出兩通電話後闖空門的精確後驗，再以變數消去重複使用因子，並用固定種子的拒絕抽樣與似然加權近似同一個答案。', 60, 'recursion-tree'),
  pythonFromBlueprint('AIF16', '以馬可夫性質與轉移矩陣描述隨時間變化的狀態，用 Fraction 計算 n 步分布並解出精確的穩態分布、說明它存在、唯一與收斂的條件，以固定種子模擬馬可夫鏈，再以隱馬可夫模型區分隱藏狀態與觀察，用前向演算法加正規化做濾波、以 log 機率與 backpointer 的 Viterbi 找最可能的狀態序列，並說明 Baum–Welch 如何學習參數。', 60, 'dp-table'),
  pythonFromBlueprint('AIF17', '從理性代理人最大化期望效用談起，以效用函數與樂透表達偏好，用凹效用、確定等值與風險貼水說明風險態度，以決策表套用最大期望效用原則，用決策樹倒推與決策網路結合機率、決策與效用節點，計算完美與不完美資訊的價值，並簡述 von Neumann–Morgenstern 公理與 Allais 悖論。', 50, 'variable-state'),
  pythonFromBlueprint('AIF18', '以狀態、動作、轉移機率、獎勵與折扣因子定義地板會滑的格子世界 MDP，說明隨機轉移下為什麼需要策略而不是一條計畫，計算折扣報酬並推導貝爾曼方程，用 Python 實作同步價值迭代與 δ < θ 的停止規則、依固定順序處理平手取出最佳策略，比較策略迭代的評估與改進，觀察折扣因子與生存獎勵如何改變策略，並說明模型未知時的強化學習與 Q-learning。', 60, 'dp-table'),
  pythonFromBlueprint('AIF19', '從資料、標籤、代理變數、回饋迴圈與部署情境找出 AI 系統的傷害來源，以分組混淆矩陣計算選取率、真陽性率、偽陽性率與精確率並說明基本比率不同時這些公平性指標無法同時相等，用資料最小化、k-匿名與 Laplace 機制的差分隱私保護個人資料，再以可解釋性、穩健性、人類監督、文件化、影響評估與歐盟 AI 法的風險分級，為自動審核系統做風險評估。', 50, 'dp-table'),
  pythonFromBlueprint('AIF20', '把整座島接成一個迷宮對戰代理人：以 A* 與可接受的曼哈頓距離規劃三條穿越路線，用深度限制的 alpha-beta 與 BFS 評估函數判斷守衛是最佳對手時何時能穿越，以隱馬可夫模型的前向演算法從雜訊讀數濾出守衛的位置並以期望效用選路，用價值迭代解出「穿越或等待」的 MDP 並與 minimax 規則比較，最後以固定種子的模擬分開報告成功、被抓與交給人類的比例，設計決策紀錄與人類監督，寫出含風險分級的設計報告。', 120, 'challenge-stages'),
];

/** LNX-1 (2026-11-22): the Linux systems island's first lessons, written with the terminal capability (LNX0_TERMINAL_CAPABILITY.md); LNX-2 adds LNX05–LNX07, LNX-3 LNX08–LNX11, LNX-4 LNX12–LNX14, LNX-5 the capstone LNX15. */
const linuxSystems: Outline[] = [
  terminalFromBlueprint('LNX01', '從核心、使用者空間與 GNU 工具說明 Linux 是什麼，比較 Debian／Ubuntu 與 RHEL 系發行版、LTS 版本的支援週期與伺服器和桌面的取捨，並在三台模擬機器上用 uname、hostname、/etc/os-release 與 df 辨認系統。', 40),
  terminalFromBlueprint('LNX02', '分辨終端機、Shell 與主控台，讀懂 user@host:路徑$ 與 root 的 # 提示字元，拆解指令的短選項、長選項與參數（含空白與引號），用 man 與 --help 查出需要的選項，並從 command not found、invalid option、missing operand 等錯誤訊息找出打錯的地方。', 45),
  terminalFromBlueprint('LNX03', '走一遍 FHS 的主要目錄（/etc、/var/log、/home、/root、/tmp、/opt、/srv，以及由核心產生的 /dev 與 /proc），用 pwd、cd 與 ls 的 -l、-a、-h、-d 以絕對與相對路徑（.、..、~）在目錄樹上移動，認識掛載點並以 df、df -h、df -T 找出路徑所在的檔案系統，再用 du -sh 估計目錄占用的空間。', 50),
  terminalFromBlueprint('LNX04', '用 mkdir -p 與 touch 建立目錄與檔案，分辨 cp、mv 的複製、改名與搬移（含多個來源與悄悄覆寫），以萬用字元 * ? [...] 一次挑出一批檔案並看懂隱藏檔為什麼不被 * 選到，用 ln -s 與 readlink 管理符號連結、比較硬連結，並養成先列出再 rm 的習慣，避免無法復原的誤刪。', 55),
  terminalFromBlueprint('LNX05', '用 cat、less、head、tail 查看日誌，以 grep 的 -i、-n、-v、-c、-w 與基本正規表示式（. ^ $ 方括號）找出需要的行，用管線把 cut、wc、sort、uniq 接成 sort | uniq -c | sort -rn | head 的次數排行，分辨標準輸出與標準錯誤並以 >、>>、2>、2>&1、< 與 /dev/null 重新導向，避開 uniq 前忘了排序、> 覆寫與 sort f > f 清空檔案的陷阱。', 55),
  terminalFromBlueprint('LNX06', '說明使用者、群組與 UID／GID（root 是 0、系統帳號在 1000 以下、一般使用者從 1000 開始，由 /etc/login.defs 設定），讀懂 /etc/passwd 與 /etc/group 的欄位與密碼為什麼放在 /etc/shadow，分清主要與附加群組，用 useradd（-m、-s、-G、-r）與 groupadd 建立帳號，以 usermod -aG 加入群組並避開少了 -a 的 -G 陷阱，理解新群組為什麼要重新登入或 newgrp，比較 root 與 sudo，並以不能登入的服務帳號落實最小權限。', 50),
  terminalFromBlueprint('LNX07', '讀懂 ls -l 的類型字元與擁有者／群組／其他人三組權限，分辨 r、w、x 對檔案與目錄的不同意義（目錄的 x 是進入、w 是建立與刪除名稱），依擁有者 → 群組 → 其他人只看第一個符合的那一組判斷存取，用 chmod 的八進位與符號寫法、chown、chgrp 與 umask 給檔案與目錄最小必要權限，並認識 setuid、setgid 與 sticky 位元。', 55),
  terminalFromBlueprint('LNX08', '分辨程式與行程、讀懂 PID 與 PPID，用 ps aux、ps -ef 的欄位與 ps --sort、top -b -n 1 找出吃 CPU 與記憶體的行程，以 &、jobs、fg、bg 與 Ctrl+C、Ctrl+Z 管理前景與背景工作，依 SIGTERM → SIGKILL 的順序用 kill 結束行程（SIGHUP 重新載入、SIGINT 中斷，只有擁有者與 root 能送訊號），並用 $? 讀懂 0、1、2、126、127 與 128＋N 的結束碼。', 55),
  terminalFromBlueprint('LNX09', '說明套件與套件管理器（.deb／dpkg 與 apt、.rpm／rpm 與 dnf），讀懂套件庫的 suite 與 component、分清只更新清單的 apt update 與真正升級的 apt upgrade，看懂 apt 為什麼一起安裝相依套件與自動安裝的標記，用 apt install、remove、purge、autoremove 安裝與移除軟體（remove 留下設定檔成為 rc），以 apt show、apt policy、apt list --upgradable 查詢版本，用 apt-mark hold 鎖定版本並了解永久鎖定的風險，再以 unattended-upgrades、測試環境、維護時段與核心更新後的重新開機規劃伺服器的安全更新策略。', 55),
  terminalFromBlueprint('LNX10', '說明 init 與 PID 1 的角色，分辨套件放在 /usr/lib/systemd/system 與管理員放在 /etc/systemd/system 的 unit 檔及 /etc 整份優先的規則，用 systemctl 的 start、stop、restart、reload 操作服務並讀懂 status 的 Loaded、Active、Main PID 與日誌，分清 enable（WantedBy 建立的開機連結）與 start，替程式寫出含 User=、Restart=、RestartSec= 的 service unit 並在修改後 daemon-reload，再以 Restart=on-failure、啟動上限與 After、Requires、Wants 管理重新啟動與服務相依。', 60),
  terminalFromBlueprint('LNX11', '分辨 journald 的 journal 與 /var/log 的文字檔（Ubuntu 的 syslog、auth.log、kern.log 與程式自己的日誌），知道只有 root、adm 與 systemd-journal 群組讀得到系統日誌，用 journalctl 的 -u、-p（0–7 的日誌等級與範圍）、--since／--until（絕對時間、today、相對時間）、-n、-r、-g 依服務與時間範圍過濾，接上 grep、wc -l 與 sort | uniq -c 計數，讀懂 permission denied、address already in use、no space left on device、Out of memory 與 Failed password，並說明 logrotate 與 journald 的大小上限如何以日誌輪替避免磁碟被寫滿。', 50),
  terminalFromBlueprint('LNX12', '分辨用戶端 ssh 與伺服器 sshd（連接埠 22），用 ssh 使用者@主機 開啟工作階段或執行單一指令並讀懂 255 的結束碼，依序說出 TCP、版本交換、金鑰交換、主機金鑰驗證、使用者認證與 channel 的協定步驟，以 ssh-keygen 產生 ed25519 公私鑰（私鑰 600 不離開用戶端、~/.ssh 700）並用 ssh-copy-id 安裝到 authorized_keys，用 ssh-keyscan 與 ssh-keygen -l 核對指紋寫入 known_hosts、說明主機指紋防止的中間人攻擊並在金鑰改變時先核對再以 ssh-keygen -R 更新，最後以排在 50-cloud-init.conf 之前的 drop-in 設定 PasswordAuthentication no 與 PermitRootLogin，經 sshd -t 檢查後 reload，安全地改成只允許金鑰登入。', 55),
  terminalFromBlueprint('LNX13', '寫出以 #!/bin/bash 開頭、以 chmod u+x 與 ./ 執行的指令稿並分辨 bash script.sh 與 PATH 的差別，用變數、雙引號（"$var" 與含空白的檔名）、$1、$#、"$@"、$( ) 與 $(( )) 處理參數與運算，以結束碼、if、test、[ ] 與 [[ ]] 比較檔案、字串與整數，用 for、while read、case 與含 local、return 的函式組成流程，並以 set -euo pipefail（含它在條件、&&／||、((n++)) 與 local 的例外）、set -x、寫到標準錯誤的訊息與非零結束碼寫出遇到錯誤就停止的可靠指令稿。', 60),
  terminalFromBlueprint('LNX14', '讀寫 crontab 的五個時間欄位（範圍、清單、步進、名稱與 @daily 等簡寫，以及日與週兩欄的 OR 規則），分辨使用者的 crontab 與多一個使用者欄位的 /etc/crontab、/etc/cron.d，掌握 cron 精簡的環境（PATH、家目錄、% 代表換行）與輸出被寄出或丟掉而必須導向日誌的原因，認識機器時區與夏令時間的陷阱，把工作寫成 .timer 與 .service 一組並以 OnCalendar=、Persistent=、list-timers、journal 與 systemd-analyze calendar 管理與驗算，比較 cron 與 systemd timer 的取捨，再以 flock -n 避免重疊執行。', 55),
  terminalFromBlueprint('LNX15', '接手一台小公司的 Ubuntu 伺服器並完成一天的維護：規劃帳號與群組、以 usermod -G 收回實習生的 sudo 並建立 root:ops 770 的共用目錄，核對主機指紋後安裝 SSH 金鑰、在排序優先的 sshd_config.d 檔案關閉密碼登入，以不能登入的系統帳號與 Restart=on-failure 部署 systemd 服務，從 status、journal、sudo 紀錄與應用程式日誌追查撞到啟動上限的停擺並修復，結束持有鎖的舊備份、以 set -euo pipefail 的指令稿搭配 /etc/cron.d 與 flock -n 排程備份並實際跑一次，最後鎖定需要資料遷移的套件、套用安全更新，寫下變更紀錄、檢查清單與負責任維運的原則。', 120),
];

/** SRV-1 (2026-11-22): the network and servers island's first lessons, on the terminal capability with network-protocol scenes (SRV0_SERVER_CAPABILITY.md); SRV-2 adds SRV04–SRV06; SRV-3 adds SRV07–SRV10; SRV-4 adds SRV11–SRV13; SRV-5 the capstone SRV14. */
const networkServers: Outline[] = [
  serverFromBlueprint('SRV01', '分辨公有、私有（RFC 1918）與迴路位址並說明 NAT 為什麼讓外面連不進私有位址，用 ip -br addr、ip addr、ip route 與 ip route get 看懂介面、網段與預設閘道，以 /etc/services 與 getent services 對照常見服務埠，把 socket 理解為協定加上位址與埠並分清 LISTEN 與 ESTAB，說明綁定 127.0.0.1、介面位址與 0.0.0.0 對其他主機的可達性有何不同（0.0.0.0 不等於對網際網路開放，還要看 NAT 與防火牆），用 sudo ss -tlnp 與 lsof -i 找出監聽的程式，再從另一台主機以 nc -zv 依 succeeded、Connection refused 與 timed out 判斷問題出在位址、埠還是服務。', 50),
  serverFromBlueprint('SRV02', '在自己的 BIND 伺服器上新增與修正 A、CNAME 等記錄，用 dig 從權威伺服器與解析器兩邊驗證，並依 TTL 與快取安排網站搬家。', 55),
  serverFromBlueprint('SRV03', '用 curl -v 讀懂一次 HTTP 往返：* 開頭的名稱解析與 TCP 連線、> 開頭的請求列與 Host、User-Agent、Accept 標頭、< 開頭的狀態列與 Content-Type、Content-Length、Location、Cache-Control 等回應標頭，分辨送出 HEAD 的 -I 與加印標頭的 -i，依 2xx 到 5xx 的狀態碼（200、201、204、301、302、304、400、401、403、404、500、502、503、504）與 curl 自己的錯誤碼 6、7、28 判斷問題在用戶端、網路還是伺服器，以 -w 的 %{http_code} 巡檢、-f 讓錯誤變成結束碼，用 -L、%{url_effective} 與 --max-redirs 追蹤重新導向鏈，從 Re-using existing connection 與 Connection: close 看懂 keep-alive 的連線重用，再以 -X、-d、-H（含選擇虛擬主機的 Host 標頭）送出指定的方法與標頭，並用 --resolve 在 DNS 切換前測試新主機。', 55),
  serverFromBlueprint('SRV04', '說明憑證的 subject、SAN、簽發者與有效期間，分清葉憑證、中繼憑證、根憑證與信任庫，看懂 TLS 交握中的 SNI 與伺服器送出的憑證鏈，用 certbot certonly --webroot 經由 ACME 的 HTTP-01（公開 DNS 與 80 埠）向 Let\'s Encrypt 申請憑證並從 DNS、逾時、404 與轉址判斷驗證失敗的原因，以 fullchain.pem 與 privkey.pem 安裝到 nginx 並修正只送出葉憑證（unable to verify the first certificate）的伺服器，用 certbot certificates、renew、--dry-run、certbot.timer 與 deploy hook 讓 90 天的憑證自動更新並由 nginx 載入，了解 HSTS 的作用與過長 max-age、includeSubDomains、preload 的風險，再以 openssl x509 -checkend 與 s_client 監控到期。', 60),
  serverFromBlueprint('SRV05', '分辨網頁伺服器（nginx 的 master 與 www-data 的 worker）與應用伺服器（gunicorn 的 sync worker）的職責，依 location 的最長前綴判斷靜態檔案由 nginx 以 alias 直接讀磁碟、動態請求交給 upstream，用 ps 與 sudo ss -tlnp 看出誰在 0.0.0.0:80／443、誰只綁 127.0.0.1:8000 與 5432 並說明應用伺服器為什麼只綁迴路位址，比較每個請求一個行程、執行緒池與事件迴圈三種並行模型，以 worker_processes × worker_connections 估計連線上限，並依 client、keep-alive 與 upstream 的逾時說明 502 與 504 在這個架構中的意思。', 50),
  serverFromBlueprint('SRV06', '認識 Ubuntu 上 nginx 的 nginx.conf、sites-available 與 sites-enabled 連結、conf.d 與 main、events、http、server、location 五層區塊，以 listen、server_name、root、index 與 try_files $uri $uri/ =404 寫出靜態網站的 server 區塊，說明 nginx 依精確名稱、萬用字元、正規表示式與 default_server 選 server，依 =、最長前綴、^~ 與依序比對的正規表示式選 location，分辨 root 與 alias 和 add_header 的繼承，先 nginx -t 再 systemctl reload 不中斷地套用設定（reload 失敗保留舊設定、restart 失敗讓網站停擺），並從 combined 格式的存取日誌與錯誤日誌找出 404 與 403（缺 index 或 www-data 的權限）的原因。', 60),
  serverFromBlueprint('SRV07', '分辨反向代理與正向代理並說明單一入口、TLS 終止、依路徑路由與藏起後端的作用，依 proxy_pass 有沒有 URI 部分預測送到後端的路徑（結尾斜線造成的 /v1orders、//orders 與 /api/api/orders），以 Host、X-Real-IP、X-Forwarded-For（$proxy_add_x_forwarded_for）與 X-Forwarded-Proto 讓應用拿到顧客的真實 IP 與 https 並從右邊讀可信的位址，留意 proxy_set_header 只在沒有自己的設定時才繼承，把同一網域的路徑分給本機與私有網段的多個服務，以 proxy_http_version 1.1 與 Upgrade、Connection 標頭讓 WebSocket 得到 101 而不是 426，並從 error.log 分辨 502（Connection refused）與兩種 504（連不上與等不到），決定修後端、修位址或只替需要的路徑調整 proxy_read_timeout。', 60),
  serverFromBlueprint('SRV08', '說明水平擴展為什麼要讓 session、上傳的檔案與資料庫由各台後端共用，用 nginx 的 upstream 區塊與 proxy_pass 把請求分給三台後端，看懂平滑加權輪詢算出的順序與 reload 時的重設、least_conn 以進行中的連線數除以權重選擇後端，比較 ip_hash 與 cookie 黏著連線的代價，以 max_fails、fail_timeout 的被動健康檢查自動避開故障的節點並讓 backup 在主要後端都不能用時接手，分辨 L4 與 L7 的負載平衡，再用 down 加上 reload 不中斷地把一台後端排空維護。', 55),
  serverFromBlueprint('SRV09', '說明主機防火牆在 netfilter 中的位置與它和雲端安全群組的分工，以 ufw 的預設拒絕連入、允許連出與依連接埠、協定和應用程式設定檔（OpenSSH、Nginx Full）的允許規則保護網站伺服器，用 from 網段 to any port 22 限制管理埠的來源並以 limit 減緩猜密碼，依第一條符合的順序以 status numbered、insert 與 delete 管理規則（含 IPv6 副本與刪除後往前移的編號），從另一台主機以 nc 與 curl 分辨丟棄的逾時與拒絕的 Connection refused，理解狀態追蹤為什麼讓開著的 SSH 工作階段在 ufw enable 之後存活、新的連線卻被丟棄，並先允許 SSH 再啟用、另開新連線驗證來避免把自己鎖在外面，再用 nft list ruleset 讀懂同一套原則，寫出含 ct state established,related 與 iif lo 的最小規則集（沒有 iif lo 時連 127.0.0.1 也逾時），以 nft -c -f 檢查、nft -f 一次載入。', 55),
  serverFromBlueprint('SRV10', '以跳板機落實最小暴露（只有 bastion 的 22 埠對外、內網主機只讓 bastion 連線），用 ssh -J 與 ~/.ssh/config 的 Host 區塊（HostName、User、IdentityFile、ProxyJump）經由跳板機管理私有網段，分辨跳板機不套用命令列的 -i 與 -o，以本機轉送 -L 把內網的資料庫與只綁 127.0.0.1 的管理頁面拉到筆電（目的主機由 SSH 伺服器那一端解析、內網那一段不在 SSH 加密裡），以遠端轉送 -R 把筆電的服務借給伺服器並理解 GatewayPorts，用 -f -N 開背景通道、以 ss -tlnp、pgrep -af 找出並用 kill 或 pkill -f 關掉被遺忘的通道，說明 ProxyJump 比 agent 轉送安全的原因，並在 sshd 以 AllowTcpForwarding local、GatewayPorts no 與 AllowAgentForwarding no 限制跳板機的轉送。', 55),
  serverFromBlueprint('SRV11', '依資源的性質選擇 Cache-Control（含雜湊檔名的靜態檔 public, max-age=31536000, immutable、HTML 用 no-cache、個人化的 API 用 private 或 no-store、共用快取的 s-maxage），以 ETag、Last-Modified 與 304 看懂驗證器，在 nginx 的 location 以 add_header 設定標頭並留意它的繼承，從 X-Cache 與 Age 讀出 CDN 邊緣節點的 HIT 與 MISS、用 sleep 觀察過期並算出快取命中率與回到來源伺服器的請求數，找出 Set-Cookie、private、Vary 與查詢字串造成的 MISS（以及 proxy_ignore_headers Set-Cookie 的風險），認識來源端 nginx 的 proxy_cache 與 X-Cache-Status 的 MISS、HIT、EXPIRED，並用靜態資源版本化（先上傳新檔名、最後換 HTML）取代每次部署的快取清除，只在內容必須立刻下架時才清除。', 55),
  serverFromBlueprint('SRV12', '以由下而上的方法排查「連不上」：用 ip -br addr、ip route 與 ip route get 確認本機的介面與路由，以 getent hosts 對照 dig 與 dig @DNS 伺服器找出 /etc/hosts 蓋過 DNS 的舊記錄並讀懂 dig 的 status、flags、TTL 與 SERVER，理解 ping 不通不代表主機關機（ICMP 可能被防火牆丟棄），用 traceroute 與 mtr --report 分辨中間不回應或限速的路由器與一路延續到終點的遺失，以 nc -zv 的 succeeded、refused、timed out 與伺服器上的 ss -tlnp 判斷埠與綁定的位址（修正只綁 127.0.0.1 的 nginx 並 reload），用 curl -v 與 curl -w 的 time_namelookup、time_connect、time_starttransfer、time_total 分出 DNS、連線與伺服器處理各花多少時間，最後以 tcpdump -r 讀擷取檔，分辨完整的三向交握、SYN 換來 RST，與一再重送卻沒有回覆的 SYN。', 55),
  serverFromBlueprint('SRV13', '以一致的方法處理網站變慢或出錯的事故：先把症狀描述成「什麼壞了、影響誰、從什麼時候開始」，再依便宜又可能的順序提出並驗證假設、一次只改一件事；從 nginx 的 error.log 分辨 502（後端沒有執行、當掉或在 crash loop 裡被 systemd 放棄、埠寫錯）與 504（資料庫的鎖、連線池耗盡、CPU 滿載、慢的相依服務，或 while connecting 的位址與防火牆），用 df -h、du、journalctl -k、top -b -n 1 與 ps 看出磁碟、記憶體（OOM killer）與 CPU 的耗盡並說明刪除仍被開著的日誌檔為什麼不會釋放空間，以時間為錨點用 grep、sed -n 與 journalctl --since／--until 把 access.log、error.log、應用程式與整台系統的 journal、資料庫與部署紀錄關聯起來，再以回滾、補上防火牆規則、停止吃掉記憶體的工作修復事故，從使用者那一端的公開網址驗證，最後寫下時間線。', 60),
  serverFromBlueprint('SRV14', '把搬家當天的網域修好並用 certbot --nginx 取得 HTTPS 憑證，以 nginx 終止 TLS、把請求與轉送標頭交給私有網段的兩台應用伺服器（max_fails 與 backup），用 ufw 與 ssh -J 讓 22 只經由跳板機、8080 只給網頁伺服器，依資源設定 Cache-Control 並確認 CDN 邊緣節點的 HIT，以 dig、mtr、curl -v／-w、access.log 與 X-Forwarded-For 追蹤一個請求經過的每一段，最後依故障排除方法找出只壞了一台後端的防火牆規則並修好原因。', 90),
];

/** LLM-1 (2026-11-22): the large-language-models island's first lessons, on the llm-explorer capability (LLM0_LANGUAGE_MODEL_CAPABILITY.md). */
const largeLanguageModels: Outline[] = [
  llmFromBlueprint('LLM01', '以玩具模型看懂大型語言模型如何逐一預測下一個 token 生成文字，比較 greedy、temperature、top-k 與 top-p 的取樣，區分基礎模型、指令模型與推理模型，認識上下文視窗、知識截止與幻覺的限制，並判斷需求該用直接提示、RAG 或微調。', 45),
  llmFromBlueprint('LLM02', '從字元、單字與子詞的取捨說明為什麼用 BPE，在小語料上訓練合併規則並依名次逐步斷詞，看中文字的三個 UTF-8 位元組如何成為 token，認識 token ID 與特殊 token，並比較中文、英文與程式碼的 token 數、估算提示的費用。', 50),
  llmFromBlueprint('LLM03', '從零學會向量的內積、長度與餘弦相似度，分辨語言模型內依 token ID 查表的 embedding 表與為整段文字算出一個向量的句子 embedding 模型，用最近鄰在示意的句子空間中找出語意最接近的句子，比較向量沒有正規化時內積與餘弦的排名差異，並看懂 2D PCA 投影保留與失去的資訊。', 50),
];

/** GEN-1 (2026-11-23): the generative-ai island's first lessons, on the llm-explorer capability (GEN02 with python-code too). */
const generativeAi: Outline[] = [
  llmFromBlueprint('GEN01', '分清判別式與生成式模型，用玩具旋律看懂「學習資料分布、再取樣」與一段樣本的似然，比較自回歸、VAE、GAN、流模型與擴散模型產生新樣本的方式及其在品質、速度、多樣性與訓練穩定性上的取捨，並指出文字、圖像與音訊常用的模型家族。', 45),
  llmFromBlueprint('GEN02', '以機率連鎖律把整串 token 的機率拆成逐步的條件機率，用 Python 寫出字元級的自回歸取樣器，比較 greedy、temperature、top-k 與 top-p 並看 greedy 陷入重複的原因，以 log 機率替序列打分數並避開連乘的下溢，區分訓練時的 teacher forcing 與推論時的 exposure bias，再說明圖像與音訊如何先離散化成 token 再自回歸生成，以及一次一個 token 的生成延遲與品質取捨。', 55),
];

/** WEB-1 (2026-11-23): the web foundations island's first lessons, written with the web-code capability (WEB0_WEB_CODE_CAPABILITY.md); WEB-2 adds WEB05–WEB07, WEB-3 WEB08–WEB10, WEB-4 WEB11–WEB13, WEB-5 WEB14 and the capstone WEB15. */
const webFoundations: Outline[] = [
  webFromBlueprint('WEB01', '用同一個「小島圖書館」頁面依序加上 HTML、CSS 與 JavaScript，分清內容、外觀與行為的分工，走一遍瀏覽器從網址、解析 HTML 建立 DOM、計算樣式、版面配置到繪製的頁面載入流程，看懂原始碼與 DOM 為何不同，並用開發者工具的 Elements、Console 與 Network 面板檢查網頁。', 40),
  webFromBlueprint('WEB02', '寫出含 DOCTYPE、lang、charset 與 title 的文件骨架，分清元素、標籤、屬性與巢狀規則，用 header、nav、main、article、section、aside、footer 取代無意義的 div，並以不跳級的 h1–h6 標題層級與地標區域，讓頁面不靠外觀也讀得出結構。', 45),
  webFromBlueprint('WEB03', '用 em、strong、清單與 blockquote 標出文字的意義，以 a 與 href 寫出文字清楚的連結與頁內錨點，分辨相對與絕對路徑並安全地另開分頁，為圖片寫替代文字、標出 width 與 height、加上圖說，再用 audio、video、source 與 track 嵌入影音並提供字幕。', 45),
  webFromBlueprint('WEB04', '用 form、name 與送出按鈕組成表單並讀懂送出的資料，以 label 關聯每個欄位，依資料選擇 email、number、date、radio、select 等輸入類型，再用 required、min／max、pattern 等原生驗證屬性讓瀏覽器擋下漏填與格式錯誤，並確認表單只靠鍵盤也能填寫與送出。', 50),
  webFromBlueprint('WEB05', '用型別、class、id、後代與子代選擇器及虛擬類別選取元素，依重要性、特異性與原始碼順序判斷串接時哪一條宣告勝出，分辨會繼承與不會繼承的屬性，並以低特異性的 class 寫法取代 id 與 !important。', 50),
  webFromBlueprint('WEB06', '用內容、內距、邊框與外距四層算出元素的實際寬高，以 box-sizing: border-box 讓 width 代表整個盒子，分辨區塊與行內盒子在一般排版流中的排法並用 display 切換成 inline-block，預測上下相鄰與父子之間的外距合併，再用 margin: 0 auto 把有寬度的區塊置中。', 50),
  webFromBlueprint('WEB07', '用 position 的 static、relative、absolute、fixed、sticky 讓盒子位移、離開一般排版流或在捲動時留在畫面上，找出絕對定位的包含區塊，做出角落徽章與固定頁首，並用堆疊順序、z-index 與堆疊環境判斷誰蓋住誰、z-index 為何無效。', 55),
  webFromBlueprint('WEB08', '從 DOM 樹與指令稿執行的時機開始，用 querySelector 與 querySelectorAll 選取元素並處理找不到的情況，以 textContent、屬性與 classList 修改內容與外觀，再用 createElement 與 append 依陣列資料建立清單並插入頁面。', 55),
  webFromBlueprint('WEB09', '用 addEventListener 登記 click、input、submit 等事件的監聽器，從事件物件讀出 target、currentTarget 與 key，追蹤事件由內往外冒泡的順序，以 preventDefault 接手表單送出，再用事件委派與 closest 讓一個監聽器處理整份清單與之後才加入的項目。', 55),
  webFromBlueprint('WEB10', '說明單一執行緒與事件迴圈如何安排同步程式、微任務與任務的先後，用計時器與 Promise 的 then／catch／finally 接住晚一點才有的結果，以 async／await 寫出依序與 Promise.all 並行的流程，並用 try／catch／finally 處理錯誤，交代載入中、成功與失敗三種狀態。', 60),
  webFromBlueprint('WEB11', '用 fetch 向 API 送出請求並解析回應的 JSON 本文，分清 JSON 文字與 JavaScript 物件，依 HTTP 狀態碼與 response.ok 分辨成功與失敗，在畫面上交代載入中、沒有資料與錯誤狀態，並用 POST 送出 JSON、以 encodeURIComponent 組出查詢字串。', 60),
  webFromBlueprint('WEB12', '用 localStorage 與 JSON 讓偏好和清單在重新整理後留著，處理 null 與壞掉的文字，分辨只活在一個分頁的 sessionStorage 與每次請求都送出的 Cookie（max-age、HttpOnly、SameSite），用版本號遷移舊格式資料，並判斷密碼、登入憑證與價格等資料為何不該存在瀏覽器。', 55),
  webFromBlueprint('WEB13', '從無障礙樹的角色、無障礙名稱與狀態出發，依第一條 ARIA 規則優先使用原生元素，必要時以 aria-label、aria-expanded、aria-pressed 補上名稱與狀態，並用 tabindex、focus()、Escape 與即時區域管理下拉選單和動態訊息的焦點與朗讀。', 60),
  webFromBlueprint('WEB14', '說明效能量測的實驗室資料與真實使用者資料，解讀 Core Web Vitals 的 LCP、INP、CLS 與公布的良好門檻，沿著關鍵渲染路徑找出擋住畫面的樣式表與指令稿，再用 defer、圖片尺寸與延後載入、預留空間與分批工作，提出並驗證三項改善。', 60),
  webFromBlueprint('WEB15', '不用框架，分五關完成小島圖書館的四頁網站：以語意結構與全站共用的樣式表建立頁面，用表單的 submit 與事件委派做出願望清單，以 fetch 取得新書並交代載入中、沒有資料與失敗三種狀態，用 localStorage 記住分類，最後補上選單按鈕的無障礙名稱與狀態、defer 與預留位置，通過無障礙與效能的檢查。', 110),
];

/** DKR-1 (2026-11-23): the docker-containers island's first lessons, on the terminal capability with engine stage E20 (DKR0_CONTAINER_CAPABILITY.md); DKR-2 adds DKR05–DKR06 on E21, DKR-3 DKR07–DKR08 on E22, DKR-4 DKR09–DKR11 on E23, DKR-5 DKR12–DKR14 on E24, DKR-6 the capstone DKR15. */
const dockerContainers: Outline[] = [
  dockerFromBlueprint('DKR01', '說明容器解決的「在我電腦可以跑」問題與 Image 帶來的可重現環境（只固定使用者空間），比較 Hypervisor 與各自有客體核心的虛擬機和共用主機核心的容器在隔離方式、啟動時間、大小與安全界線上的取捨，以 docker version 分清 Client 與 daemon（containerd、runc），從 docker exec 的 ps（PID 1 是 uvicorn）與主機的 ps aux、hostname、/etc/os-release 與容器 IP 看出 pid、uts、mnt、net namespace 的效果並說明 ipc 與 user namespace（Docker 預設不重新對應 root），說明 cgroup 對記憶體、CPU、行程數與 I/O 的限制，用 uname -r 與 docker info 的 Kernel Version 證明所有容器共用一個核心，並依核心需求、對象是否可信與部署速度判斷該用容器還是虛擬機。', 45),
  dockerFromBlueprint('DKR02', '分辨 docker CLI（Client）與以 root 執行的 dockerd（Docker daemon），說明 Engine API 經由 /var/run/docker.sock 的權限與「docker 群組等於 root」，看懂 dockerd、containerd、shim 與 runc 的分工，依 registry/namespace/repository:tag 讀出 Image 的完整名稱並以 docker pull 從 Docker Hub 拉取，把 docker run nginx 從 Client 到核心畫成一條路徑，並說明 OCI 的 Image、runtime 與 distribution 規格的意義。', 45),
  dockerFromBlueprint('DKR03', '分辨唯讀的 Image 與帶有可寫層的 Container，從同一個 Image 啟動多個容器，追蹤容器從 created、running、exited 到刪除的狀態（docker run 等於 create 加 start），讀懂結束碼 0、1、125–127 與 docker stop 對忽略 SIGTERM 的 PID 1 送出 SIGKILL 的 137，證明可寫層與日誌撐得過 stop 與 start、撐不過 rm，並依先容器後 Image 的順序以 docker rm、docker container prune 與 docker rmi 清理主機（停止與 created 的容器也會讓 rmi 衝突，rmi -f 只移除標籤）。', 50),
  dockerFromBlueprint('DKR04', '用 docker run 的 -d、--name、-p、-e、--rm、-it 啟動容器，以 ps、logs、exec、inspect -f 檢查，並讀懂名稱衝突與連接埠被占用等錯誤。', 55),
  dockerFromBlueprint('DKR05', '用 FROM（官方 Image、固定版本標籤而不是 latest、slim 與 alpine 的取捨）、RUN（apt-get update、安裝與清理寫在同一個 RUN）、COPY（而不是 ADD）、WORKDIR、ENV、ARG、LABEL、EXPOSE（只是說明，公開要靠 -p）與 USER 撰寫 Dockerfile，以 docker build -t 建置並用 docker run -p 執行，區分 CMD 與 ENTRYPOINT 的 exec 與 shell 形式、兩者如何組合與 exec 形式讓 PID 1 收到 SIGTERM，並用 .dockerignore 把 .env、.git 等檔案擋在建置內容與 Image 之外。', 55),
  dockerFromBlueprint('DKR06', '說明 RUN、COPY、ADD 與建立資料夾的 WORKDIR 各產生一層而 ENV、CMD 等只改設定，以 docker history（<missing> 列、--no-trunc、--human=false）與 RootFS.Layers 讀出每一層的大小並找出最大的一層，看懂快取鍵（前一步的鍵加上這一步的定義與複製檔案的 checksum）帶來的 CACHED、之後各步一起失效、ARG 與 ENV 改值的影響與 --no-cache，先複製依賴清單並安裝再 COPY 原始碼讓改程式時安裝維持 CACHED，在同一個 RUN 清掉 apt 清單、以 pip --no-cache-dir 與合適的基底縮小 Image（後面的層刪檔不會變小），並用 .dockerignore 排除秘密、.git 與會自己變動的檔案。', 55),
  dockerFromBlueprint('DKR07', '說明容器的可寫層為什麼不能放資料（docker rm 就消失、綁在單一容器、copy-on-write 較慢），以 docker volume create、ls、inspect（Mountpoint）管理具名 Volume，證明它撐得過 docker rm、能在容器之間共用並在空的時候 copy-up Image 的檔案，用 bind mount 讓主機與容器雙向即時看到同一份檔案（開發用、:ro 唯讀、不做 copy-up、-v 會以 root 建立不存在的來源而 --mount 報錯、沒有 ./ 的名稱是 Volume），以 tmpfs 放暫存與秘密，分辨 -v 與 --mount，看懂 Image 的 VOLUME 產生的匿名 Volume、docker rm -v 與 docker volume prune（預設只刪匿名，-a 全部），用用完即丟的容器與 tar（-C 讓路徑相對）備份並還原 Volume，並以 chown 給容器的 UID 或 -u 修正非 root USER 寫不進 root 擁有的 bind mount 的權限錯誤（不用 chmod 777），讓資料庫升級重建後資料不遺失。', 55),
  dockerFromBlueprint('DKR08', '說明預設 bridge 網路（172.17 的位址、只能用位址互連、沒有名稱解析）與自訂網路的差異，讓容器接上自訂網路以 Docker 內建 DNS（127.0.0.11）用容器名稱與別名互連，分清楚容器之間使用的容器埠（http://api:3000）與 -p 只為主機與外界公開的主機埠、容器裡的 localhost 是自己，以 docker network connect／disconnect 把反向代理、api 與資料庫分成前端與後端網路使資料庫只對 api 開放，比較 --network host（-p 無效、埠衝突、沒有隔離）與 none 的取捨，並從 docker network inspect 與 docker inspect 讀出容器所在的網路與位址。', 55),
  dockerFromBlueprint('DKR09', '以 compose.yaml 描述由 Dockerfile 建置的 app、postgres 資料庫與 Docker Hub 上的 redis（services、image 與 build、ports、environment、${VAR} 與 .env、:- 預設值與 :? 必填變數、在最外層宣告的具名 Volume），用 docker compose config 在啟動前驗證並看出代換後的設定與打錯的鍵，看懂專案名稱決定的 shop-db-1、shop_default 與 shop_pgdata 以及以服務名稱互連（容器裡的 localhost 是自己），說明簡短的 depends_on 只等容器啟動、healthcheck（pg_isready）加上 condition: service_healthy 才等資料庫準備好，以 docker compose up -d 一個指令拉取、建置、建立網路與 Volume 並依序啟動整個應用，並用 ps、logs、exec、stop／start／restart、up -d --build 與 down 做日常操作，避開 down -v 刪掉資料庫 Volume 的陷阱。', 55),
  dockerFromBlueprint('DKR10', '說明單一階段的 Go Image 把編譯器、原始碼與模組快取一起帶上線，用 FROM … AS 命名建置階段與執行階段、以 COPY --from 只複製執行檔（也可以從階段編號或另一個 Image 複製，打錯階段名稱會被當成 Image 去拉取），比較多階段建置前後的 Image 大小（844MB 與 11.1MB）與 docker history，認識 alpine、distroless（沒有 Shell，docker exec sh 失敗）與 scratch 等精簡基底及靜態連結的需要，以 --target 建置除錯用的建置階段與 CI 的測試階段（BuildKit 略過目標用不到的階段），並用 ARG 與 --build-arg 選擇基底版本與寫入版本標籤（FROM 之前的 ARG 要在階段裡重新宣告），讓先複製 go.mod 的建置快取在多階段裡照樣生效。', 50),
  dockerFromBlueprint('DKR11', '分清 Registry 位址、儲存庫與標籤組成的 Image 名稱，以 docker tag 為同一個 Image 加上版本與 commit 標籤，用 --password-stdin 從 Token 檔 docker login 私有 Registry（-p 的警告、config.json 只以 base64 保存憑證）並分辨 unauthorized 與 denied（沒有 Registry 位址推到 Docker Hub、只能拉取的帳號），讀懂 docker push 的 Pushed、Layer already exists、Mounted from 與 digest，說明標籤可移動而 digest 是 manifest 內容的雜湊，以 docker images --digests、名稱@sha256: 拉取與執行鎖定部署的確切版本，說明 latest 會移動、重新建置得到新的 digest 而舊 Image 成為 <none> 的風險與不可變標籤的保護，並訂出 SemVer 加 commit 標籤、記錄 digest、不部署 latest 的可追溯標籤規則。', 50),
  dockerFromBlueprint('DKR12', '以資安審查案件的方式檢查一個 Image 與它的執行方式：用 docker history --no-trunc、docker image inspect 與 docker inspect（User、Privileged、ReadonlyRootfs、CapAdd、CapDrop、SecurityOpt、Mounts）找出以 root 執行、完整的 node:22 基底、寫進 ENV 的金鑰、經由 ARG 留在 RUN 歷史裡的 Token 與後面的 RUN 才刪掉的 .env，說明機密一旦進入 Image 就要撤銷並改在執行時以唯讀掛載的檔案（或 BuildKit 與編排工具的 secret）提供，以 USER 讓容器以非 root 的 UID 執行，說明 --privileged 與掛載 docker.sock 等於交出主機的 root，以 --cap-drop ALL、no-new-privileges、--read-only 加 --tmpfs 縮小容器能做的事，並以最小基底與持續的弱點掃描減少要修補的套件。', 50),
  dockerFromBlueprint('DKR13', '以 docker ps -a、docker logs（--tail、--since、-t）與 docker inspect（State、ExitCode、Error、OOMKilled、RestartCount、Config.Env、HostConfig 與 --format 的 Go template）組成狀態 → 日誌 → 設定 → 修正 → 驗證的除錯步驟，讀懂結束碼 0、1、125、126、127 與 128＋N（137 是 SIGKILL、143 是 SIGTERM），從日誌找出缺少的環境變數與寫錯的主程式路徑並以 rm 加 run 修正，辨認 Restarting (1) 的重啟迴圈、退避時間與 on-failure:N 放棄後的 Exited，用 OOMKilled 與 docker events --since／--until 分辨記憶體不足、docker kill 與 docker stop 逾時造成的 137，並以 docker stats --no-stream、docker top 觀察用量後用 docker update -m 提高上限修好 OOM 的重啟迴圈。', 55),
  dockerFromBlueprint('DKR14', '以 Dockerfile 的 HEALTHCHECK 與 --health-* 為訂單 API 加上健康檢查並讀懂 (health: starting)、(healthy)、(unhealthy) 與 .State.Health（單獨的 Docker 不會重新啟動不健康的容器），用 docker stats --no-stream 量出穩定的用量後以 -m 與 --cpus 設定上限並以 docker update 調整（記憶體越過上限被 OOM 結束為 137 與 OOMKilled，CPU 超過只會被節流），比較 no、on-failure[:N]、always 與 unless-stopped 的重新啟動策略、Restarting (1) 與加倍的退避（always 在 daemon 重新啟動後連手動停止的容器也叫回來），並以 exec 形式讓 node 成為 PID 1 收到 SIGTERM、在 docker stop 的寬限期內做完手上的請求以 0 結束（Shell 形式的 sh 不轉送訊號而 10 秒後被 SIGKILL 為 137，--init 與 STOPSIGNAL 的作用），再對照十二要素應用的設定放環境變數、無狀態行程、可拋棄性與日誌寫到標準輸出。', 55),
  dockerFromBlueprint('DKR15', '把三層式的拾光書屋從筆電上手打的 docker run 帶到可以上線：以兩個階段建置 distroless、nonroot、exec 形式的 API Image 並試跑優雅關閉，修好 Compose 開發環境的具名 Volume、pg_isready 健康檢查與 service_healthy，從 docker history 找出經由 ARG 與 ENV 包進舊 Image 的付款金鑰、撤銷後刪除舊 Image 並改以唯讀掛載的檔案提供，以 SemVer 與 commit 標籤從 --password-stdin 登入推送到私有 Registry、不推送 latest，以 deploy 帳號拉取並以 digest、--read-only 加 tmpfs、--cap-drop ALL、no-new-privileges、記憶體與 CPU 上限、unless-stopped 與只綁 127.0.0.1 上線，最後照上線檢查清單以 ps、logs、inspect、events、stats 與 curl 驗收第二台主機，找出手動部署造成的 OOM 重啟迴圈並以審查過的部署指令稿從根本修好。', 90),
];

/** CICD-1 (2026-11-23): the devops-cicd island's first lesson, on the devops-explorer capability (CICD0_DEVOPS_CAPABILITY.md); CICD-2 adds CICD02 on the terminal with engine stages E25 git and E26 forge, CICD-3 CICD03–CICD05 on E27 workflows and E28 actions, CICD-4 CICD06–CICD08 on E29 artifacts, CICD-5 CICD09 on E30 environments and E31 deploy hosts, CICD10 on the devops-explorer's rollouts (D2) and CICD11 on its dashboards (D3); CICD-6 CICD12 (D4 logs and the terminal), CICD13 (E30–E31 and D2) and CICD14 (E31 and D3); CICD-7 the capstone CICD15. */
const devopsCicd: Outline[] = [
  cicdFromBlueprint('CICD01', '從開發與維運的隔閡說明 DevOps 要解決的問題與共同責任、自動化的做法，用同一週八個變更的一次上線與分開上線比較小批量與快速回饋如何縮短前置時間、縮小故障範圍並加快復原，再以兩個團隊同一季的部署紀錄算出 deployment frequency、change lead time、change fail rate 與 failed deployment recovery time 四個 DORA 指標，並說明指標該怎麼讀、為什麼不能拿來排名。', 45),
  cicdFromBlueprint('CICD02', '在一個小型圖書館團隊的模擬 GitHub 上實際開分支、推送、開 Pull Request、等同事審查再合併，說明分支保護的規則並用 gh api 讀取與設定，比較 Trunk-based development 與 Git Flow 的取捨，再以 merge 與 rebase 的歷史形狀、主機上的三種合併方式與衝突的解決，在落後且衝突的分支、凌亂的 PR 與共用分支三個情境中選擇並執行合適的做法。', 55),
  cicdFromBlueprint('CICD03', '在一個渡輪時刻表團隊的模擬 GitHub 上，比較三週才整合一次的分支與每天小步整合的差別，跟著一次推送看 GitHub Actions 在全新的 runner 上自動執行 lint、建置與測試並回報成 Pull Request 的檢查，用 gh run list、watch 與 view --log-failed 讀出失敗的 step，說明快速回饋的做法與以要求的狀態檢查讓主分支保持綠燈，再在主分支紅燈時找出造成失敗的 commit、修好程式讓它重新變綠，讓紅燈的 Pull Request 修好後才合併，並替新的儲存庫要求 build 檢查。', 50),
  cicdFromBlueprint('CICD04', '在一個渡輪團隊的模擬 GitHub 上撰寫並推送 workflow 檔案，看真實的 run 由 workflow、job 到 step 展開，分辨以 uses 引用的 action 與以 run 執行的指令，認識 GitHub-hosted runner 與 runs-on 的 label，設定 push、Pull Request 的分支與路徑篩選、帶輸入的 workflow_dispatch 與以 UTC 計時的 schedule，用 needs、matrix、step 與 job 的輸出串起多個 job，讀懂無效 workflow 的錯誤，並以 workflow 與 job 層級的 permissions 讓 GITHUB_TOKEN 只有需要的最小權限。', 60),
  cicdFromBlueprint('CICD05', '在一個渡輪訂票團隊的模擬 GitHub Actions 上，依測試金字塔比較單元、整合與端對端測試的數量與速度，把 e2e 排在最前面的單一 job 改成以 needs 串起的三層 job，讓單元測試在 20 秒內失敗、後面的 job 略過，以 if: always() 印出 JUnit 風格的測試報告，用 matrix 把端對端測試分成 3 片平行執行縮短回饋時間並說明 fail-fast，再從 --log-failed 找出跨瀏覽器 Nightly 裡的不穩定測試，以 gh run rerun --failed 確認它是偶發的失敗，並說明記錄、隔離與修正原因為什麼比一直重新執行或刪掉測試重要。', 55),
  cicdFromBlueprint('CICD06', '在一間連鎖餐廳團隊的模擬 GitHub Actions 上，以 lockfile 與 npm ci 說明可重現建置並看 npm ci 拒絕與 package.json 不一致的 lockfile，用 upload-artifact、download-artifact 與 gh run download 讓後面的 job 與本機取得同一份產出物並處理 matrix 裡同名 artifact 的 409 衝突，以 hashFiles(\'package-lock.json\') 作為 actions/cache 的 key 讓第二次的 npm ci 從 32 秒降到 6 秒，在 workflow 裡建置 Docker Image、以 secret 經 --password-stdin 登入私有 Registry 並推送 sha-<commit> 標籤，再推送 v 開頭的 Git 標籤檢查版本號、把測過的 Image 重新標記成 SemVer 版本發布，而不部署 latest。', 60),
  cicdFromBlueprint('CICD07', '從寫死在程式裡、為了切換環境而反覆修改的設定出發，說明設定與程式碼分離與環境變數（export 與子行程、開發用的預設值、.env 不提交），在 GitHub Actions 以 workflow、job、step 三層的 env、Actions variable 與 GITHUB_ENV 提供設定，以 environment 的 variable 讓 staging 與 production 各用自己的值，最後在使用設定之前驗證必要的值，缺少時以清楚的訊息讓管線立刻失敗。', 50),
  cicdFromBlueprint('CICD08', '以一次 Registry Token 外洩的事故檢討，分辨機密與一般設定，從 Git 歷史找出 Token 進入儲存庫的 commit，看懂 secret 的存放、遮蔽與它的極限，修正 PR 標題造成的 script injection，再以範圍更小的新 Token 完成輪替、把 GITHUB_TOKEN 收斂到最小權限，並整理外洩時撤銷、移除與檢查日誌的處理順序。', 55),
  cicdFromBlueprint('CICD09', '用一個虛構圖書館的借書服務與兩台 Docker 主機區分持續交付與持續部署，設計從 staging 晉升到 production 的管線：build 只建置一次並輸出 digest，staging 以同一個 digest 部署並做冒煙測試，production 以 needs 接在後面、經環境的必要審核者、禁止自我審核與部署分支規則把關後才拿到部署金鑰，再以 concurrency 避免兩個部署重疊；用 curl 的冒煙測試擋下一個容器一啟動就結束的發布，最後從部署紀錄查出 production 上跑的是哪個 commit。', 60),
  cicdFromBlueprint('CICD10', '在一個虛構的渡輪訂票服務上逐分鐘模擬 v1 換成 v2：比較重建的停機、滾動更新的 maxSurge 與 maxUnavailable 對容量與丟棄請求的影響、藍綠部署的兩倍資源與立即回滾、金絲雀發布的流量比例、觀察時間與錯誤率閘門如何在少數使用者受影響時中止並切回舊版本，說明流量切換是各種策略的共同點，再以擴充、部署、收縮的順序維持資料庫相容性，並用功能旗標把部署與發布分開。', 55),
  cicdFromBlueprint('CICD11', '以外送訂單服務的值班團隊為例，說明指標是有單位、經過聚合的時間序列（計數、比例與 p95 百分位數），用三小時的儀表板讀延遲、流量、錯誤與飽和度四大黃金訊號並說明每個面板回答的問題，再以靜態告警門檻、持續時間（等待中）、視窗平均與嚴重度設定告警規則，算出偵測延遲、通知、誤報與漏掉的事故，說明對使用者症狀告警、附處理手冊的有行動意義告警與告警疲勞的危險，最後寫出一條在 2 分鐘內偵測每個事故且沒有誤報的規則。', 50),
  cicdFromBlueprint('CICD12', '以一家虛構茶葉店的結帳事故為例，把閘道、訂單與付款三個服務的日誌改成 JSON Lines 結構化日誌並由收集器集中，用服務、等級、欄位條件與時間篩選、分組計數，在一千多筆中找出 status 5xx 與最慢的請求，以閘道產生並一路傳遞的關聯 ID 串起跨服務的請求、找出第一個出錯的服務並分辨紀錄時間差與 duration_ms，再以 ssh 登入日誌主機，用 grep、cut、sort、uniq 與 wc 查同樣的 JSON 行，讓退款指令稿帶上關聯 ID，最後以欄位與樣式規則遮蔽外洩的電子郵件、卡號與權杖並避免過度遮蔽，依每天筆數、平均大小與天數估算熱儲存與封存的保留容量。', 50),
  cicdFromBlueprint('CICD13', '以一個虛構運動中心的球場預約服務重現一次壞掉的發布：2.4.0 的冒煙測試只看 /healthz 而讓空場地列表的 500 上了 production，依影響、相容性與修正的把握判斷先回滾再向前修復，從部署紀錄與 run 的日誌找出上一個 digest，以檢查輸入、經同一個環境審核、冒煙測試涵蓋關鍵路徑的 rollback workflow 把它部署回去，並看懂部署紀錄的 sha 不等於線上的程式；在部署模擬器比較關掉功能旗標與回滾的錯誤數、回滾時刪除欄位與破壞性改名的後果，以擴充優先的遷移讓回滾可行，再以撤銷程式、保留遷移的 commit 向前修復，最後整理以 digest 晉升、遷移先擴充、旗標預設關閉、冒煙與告警、演練過的回滾計畫與核准分工的發布檢查清單。', 60),
  cicdFromBlueprint('CICD14', '以虛構社區單車共享一次設定變更造成的發布事故為案例，依受影響的使用者比例與影響時間的矩陣判定嚴重等級並及早宣告事故，說明事故指揮、溝通與操作的分工與單一頻道，先止血再找原因（回滾到上一個正常版本的 digest，而不是重新啟動或在壓力下往前修），寫出影響、處理與下次更新時間的狀態更新，從儀表板的事故時間線算出偵測、確認、止血與恢復時間，並在事故演練中以 ssh 查證主機上的容器、日誌與部署紀錄、經由 Deploy 回滾、更新狀態頁，最後寫一份聚焦系統與條件、每個行動項目都有負責人與期限的不究責事後檢討。', 55),
  cicdFromBlueprint('CICD15', '為虛構咖啡店的點餐服務建立從 commit 到上線的完整流程：以分支保護要求 PR、核准與 lint、test 兩個必要檢查並讓 CI 在 PR 上執行，經由 PR 修好失敗的測試；main 的每個 commit 只建置一次 Image，以 env 與 --password-stdin 推送 sha-<commit> 並快取 npm 的下載；依環境設定 variable 與 secret、刪除人人讀得到的儲存庫層級金鑰、以審核者與受保護分支保護 production；修好部署管線的權限、digest 與 environment，以同一個 digest 從 staging 晉升到 production；在部署模擬器選一個閘門在足夠樣本上擋下壞版本的金絲雀計畫，在儀表板寫一條及時又沒有誤報的症狀告警；最後在演練中從部署紀錄找到上一個 digest、經由 rollback.yml 回滾並算出偵測、確認、止血與恢復時間。', 90),
];

/** KUB-1 (2026-11-24): the kubernetes-reliability island's first lessons, on the terminal with a simulated cluster (engine stages E32 cluster, E33 probes, E34 workloads; KUB0_KUBERNETES_CAPABILITY.md, KUBERNETES_RELIABILITY_ISLAND.md); KUB02 pairs the terminal with network-protocol scenes. */
const kubernetesReliability: Outline[] = [
  kubeFromBlueprint('KUB01', '從單機 Compose 的極限（一台主機就是一個故障域、restart: always 只在同一台重新啟動、手動放置、--scale 與寫死的主機埠、只在一台主機有效的服務名稱）說明容器編排要解決的問題，比較命令式指令與宣告式的期望狀態（kubectl apply 的 unchanged 與 configured）並和 DKR09 的 Compose 對照，說明控制器的調和迴圈與排程，在模擬叢集上刪掉 Deployment 的 Pod 看 ReplicaSet 以新名稱、新節點與新 IP 補回而 bare pod 不會回來，以 drain --ignore-daemonsets 排空節點並看 uncordon 不會重新平衡，觀察節點失聯 50 秒後 NotReady、300 秒後驅逐並在其他節點重建，說明 Pod 會換所以需要服務發現，並以團隊、流量、服務數量與維運能力判斷何時不需要編排、改用一台 VM 加 Compose 或託管平台。', 30),
  kubeFromBlueprint('KUB02', '分辨控制平面（kube-apiserver、etcd、kube-scheduler、kube-controller-manager）與工作節點（kubelet、kube-proxy、containerd）的職責，從 kubeconfig、節點與 kube-system 的 static pod 讀出一個 kubeadm 叢集的組成，把一次 kubectl apply 從 API server 的檢查與 etcd 的寫入、scheduler 的 binding、kubelet 的 watch 到 CRI 啟動容器逐步追蹤，以 kubectl wait 等到 Pod 就緒，並說明 watch 與調和迴圈、etcd 為什麼是唯一的真實來源、quorum 的容錯與備份。', 30),
  kubeFromBlueprint('KUB03', '以 YAML manifest 描述 Pod（apiVersion、kind、metadata、spec、containers、ports 與 resources），理解同一個 Pod 的容器共用 IP 與 localhost、一起排程到同一個節點，用 init container 與 sidecar 組成多容器 Pod 並以 logs -c、exec -c 檢查各個容器，從 phase、STATUS、restartPolicy 與退避讀懂 Completed 與 CrashLoopBackOff，以存活、就緒與啟動探針判斷容器是否該重啟或接工作，修好探針寫錯與初始化失敗的 Pod，並說明不可變的 spec 與 SIGTERM、寬限期的優雅終止。', 35),
  kubeFromBlueprint('KUB04', '以 Deployment 維持指定數量的 Pod，沿著 ownerReferences 與 pod-template-hash 看懂 Deployment、ReplicaSet 與 Pod 三層物件，用等號、集合與存在的 Label 選擇器篩選資源並以 kubectl label --overwrite 修改標籤，理解選擇器必須符合範本而且不可修改，以 kubectl scale 或修改 manifest 再 apply 調整副本數並避開命令式改動造成的漂移，知道縮減時先刪哪些 Pod，並觀察刪除 Pod、把 Pod 移出選擇器之後 ReplicaSet 如何自動補上。', 40),
];

/** RWD-1 (2026-11-23): the responsive design island's first lessons, on the web-code capability with the resize step and preview widths (WEB0_WEB_CODE_CAPABILITY.md, RESPONSIVE_DESIGN_ISLAND.md); RWD-2 adds RWD05–RWD08, RWD-3 RWD09–RWD12 (the capstone): the island is complete. */
const responsiveDesign: Outline[] = [
  responsiveFromBlueprint('RWD01', '從寫死 960px 的頁面在窄視窗得橫向捲動出發，說明響應式設計如何以同一份 HTML 依寬度調整版面，用 max-width 加 margin: 0 auto、圖片的 max-width: 100% 與一條 min-width 媒體查詢寫出行動優先的頁面，並以內容優先決定原始碼順序與斷點、以漸進增強確保頁面始終可用。', 45),
  responsiveFromBlueprint('RWD02', '在 head 加上 viewport 設定讓手機照裝置寬度排版且不限制縮放，分辨 px 與相對單位：百分比以包含區塊的寬度為準、em 跟著元素字級而 rem 跟著根字級、vw 與 dvh 跟著視窗，並找出 100vw 加內距、固定寬度與長字串造成的橫向捲動加以修正。', 50),
  responsiveFromBlueprint('RWD03', '用 display: flex 建立 flex 容器，以 flex-direction 決定主軸與交錯軸，用 justify-content 分配主軸的剩餘空間、以 align-items 與 align-self 在交錯軸對齊，搭配 gap 與 auto 外距做出水平導覽列與正中央的內容，並在動手前算出項目的位置。', 55),
  responsiveFromBlueprint('RWD04', '以 flex-basis 為起始大小，計算 flex-grow 如何分配剩餘空間、flex-shrink 如何依比例縮小，分辨 flex: 1、auto、none 等簡寫，用 min-width: 0 修好被長內容撐破的項目，並以 flex-wrap 與 gap 做出不靠媒體查詢也會自動換行、填滿每一行的卡片列。', 55),
  responsiveFromBlueprint('RWD05', '用 display: grid 建立 grid 容器，以 grid-template-columns 定義軌道，用 fr 單位、repeat() 與 gap 分配空間並算出欄寬，看懂自動放置與隱含的列，再用 grid-column、grid-row 的格線編號與 span 放置項目，排出頁首、側欄、內容區與頁尾的版面。', 55),
  responsiveFromBlueprint('RWD06', '用 grid-template-areas 把版面畫成命名區域、在斷點只換模板，以 minmax() 訂軌道下限並避開 1fr 被內容撐開，用 repeat(auto-fit, minmax()) 做出不寫 Media Query 的圖片牆，分辨 auto-fill 與 auto-fit，以 dense 控制自動排列。', 55),
  responsiveFromBlueprint('RWD07', '拆解 @media 的媒體類型與媒體特徵，用 min-width、max-width 與範圍語法寫出不重疊的寬度條件，理解媒體查詢不加特異性、行動優先要由窄到寬排列，依內容導向斷點訂出最少而足夠的斷點，並用 prefers-color-scheme、prefers-reduced-motion 等偏好查詢回應系統設定。', 55),
  responsiveFromBlueprint('RWD08', '用 container-type 把元素宣告成容器、以 @container 讓同一張卡片在側欄與主欄各自依容器寬度切換排法，釐清元素不能查詢自己、容器寬度不能靠內容撐開與查詢量的是內容區，再用容器名稱指名外層容器、以 cqi 等容器單位讓字級跟著容器縮放，並比較容器查詢與媒體查詢的分工。', 55),
  responsiveFromBlueprint('RWD09', '從階梯式字級與純 vw 的問題出發，用 min()、max() 與 clamp() 替會變的值加上最小與最大值，由兩個端點算出 rem 加 vw 的偏好值寫成流體字級，確認使用者調大預設字級或縮放頁面時文字仍會變大，並把同樣的寫法用在流動的內距與置中的內容欄。', 50),
  responsiveFromBlueprint('RWD10', '用 max-width 與 height: auto 讓圖片跟著容器縮放而不變形，以寬高屬性和 aspect-ratio 預留空間、用 object-fit 處理比例不合的盒子，再用 srcset 與 sizes 提供不同解析度的檔案、用 picture 元素依寬度更換構圖，並延遲載入畫面外的圖片與嵌入影片。', 55),
  responsiveFromBlueprint('RWD11', '依優先順序替窄螢幕的導覽選擇換行、橫向捲動或收合到選單按鈕，用 aria-expanded、hidden 與 Escape 做出鍵盤可用的導覽收合，並讓寬版的媒體查詢蓋過收合狀態；再依資料特性讓表格在有名稱、可聚焦的外框裡水平捲動、隱藏次要欄位，或用 data-label 把表格重排成卡片。', 60),
  responsiveFromBlueprint('RWD12', '分五關完成小島市集的首頁：以流動置中的欄與 rem 留白建立行動優先骨架，用 Flexbox 與選單按鈕做出會收合的導覽，以 Grid 命名區域在兩個斷點重畫版面，用 auto-fit 與容器查詢讓商品卡依容器換排法，以 clamp() 與流動圖片處理字級與圖片，並在 360、768、1280px 與斷點兩側測試。', 110),
];

/**
 * MOB-1 (2026-11-23): a mobile apps lesson written from its blueprint outline, on the web-code capability: pages at
 * phone sizes, pointer steps (a finger or a mouse pressed, moved, lifted, cancelled), touch targets measured with at
 * least and at most (WEB0_WEB_CODE_CAPABILITY.md stage W9, MOBILE_APPS_ISLAND.md).
 */
export function mobileFromBlueprint(lessonId: string, summary: string, minutes: number): Outline {
  return webOutline(lessonId, summary, minutes, 'mobile-apps', 'mobile apps');
}
const mobileApps: Outline[] = [
  mobileFromBlueprint('MOB01', '從短暫、常被打斷、單手握持的使用情境出發，把主要操作移到拇指搆得到的底部操作列、讓破壞性操作遠離它，在 360 × 640 的螢幕尺寸下依優先順序排成一欄、用 details 延後次要內容、不讓操作只在滑過時出現，顧及網路與電量：替載入失敗加上訊息與重試、讓輪詢在完成後停止，並用檢查表找出網站在手機上最大的三個問題。', 45),
  mobileFromBlueprint('MOB02', '比較分頁列、抽屜與底部面板三種行動導覽模式的用途、代價與可及範圍，用 nav 與 aria-current 做底部的分頁列，用 aria-expanded 按鈕、遮罩與 inert 做抽屜，用 dialog 的 showModal() 做強制回應的底部面板並和 show() 比較，再依目的地或動作、數量與頻率選擇模式。', 50),
  mobileFromBlueprint('MOB03', '依 WCAG 2.2 的 24 × 24 最低與 44 × 44 加強尺寸，用 min-height 與內距把觸控目標做大，用偽元素與負的 inset 擴大點擊區域而不改變外觀、不蓋住鄰居，再以 touch-action 與 overscroll-behavior 處理手勢衝突，並替每個手勢加上看得到的替代操作。', 50),
  mobileFromBlueprint('MOB04', '比較滑鼠事件、Touch Events 與 Pointer Events，用同一組指標事件與 pointerType 支援觸控與滑鼠，以拖曳旗標、setPointerCapture 與 touch-action 做出可拖曳的滑桿，在 pointercancel 時還原位置並補上方向鍵操作，再用被動監聽器避免捲動卡頓。', 55),
  mobileFromBlueprint('MOB05', '用 type 與 inputmode 叫出合適的虛擬鍵盤、分辨數量與由數字組成的資料，用 autocomplete 讓瀏覽器自動完成，靠預設值、選項與 localStorage 減少輸入量，再用 scroll-margin 與 scrollIntoView 處理虛擬鍵盤遮擋與欄位捲動。', 50),
  mobileFromBlueprint('MOB06', '用 viewport-fit=cover 讓頁面延伸到螢幕邊緣，以 env() 的安全區域配合自訂屬性與 max()，讓底部操作列避開瀏海與手勢列、內容不被它蓋住；用方向與高度的媒體查詢處理手機橫放時不足的高度與轉到兩側的安全區域，再用 dvh、svh 做出和看得到的視窗一樣高、不被工具列遮住的全螢幕版面。', 50),
  mobileFromBlueprint('MOB07', '比較原生 App、跨平台框架與 PWA 在發布、裝置功能、效能、離線、更新、成本與連結上的取捨，用一張從需求出發的規則表寫出 chooseRoute 來選擇路線並說明理由，學會查證 PWA 在各平台的限制，再以功能偵測替分享按鈕準備退路，並規劃分階段的路線。', 50),
  mobileFromBlueprint('MOB08', '說明把網站安裝到主畫面的意義與安裝條件，用 link rel="manifest" 連結 Web App Manifest，寫出名稱、start_url、display、顏色與 192、512、maskable 圖示，避開 JSON 的語法陷阱，並用 display-mode 媒體查詢調整安裝後的畫面。', 50),
  mobileFromBlueprint('MOB09', '註冊 Service Worker 並說明安裝、等待、啟用的生命週期與第一次造訪不受控制的原因，用 Cache API 預先快取外殼，依資源選擇快取優先、網路優先、背景更新或只走網路，準備離線時的替代回應，並以版本化的快取名稱與 skipWaiting 完成新版本的更新流程。', 60),
  mobileFromBlueprint('MOB10', '說明低階裝置與開發用電腦的差距，在開發者工具用 CPU 與網路節流重現並找出長任務，以讓路、延後、防彈跳、requestAnimationFrame 與先讀後寫減輕主執行緒的負擔，讓動畫只改 transform 與 opacity，並用 visibilitychange 讓輪詢在頁面隱藏時暫停、回來時恢復。', 55),
  mobileFromBlueprint('MOB11', '用手機內建的螢幕閱讀器照著測試腳本把頁面聽一遍並記錄問題，替圖示控制項補上名稱、把自製按鈕換回原生按鈕；讓卡片在文字放大與 320px 寬的視窗下不被裁切、不必左右捲動，拿掉禁止縮放與方向鎖定，再替拖曳排序加上上移、下移按鈕，並用狀態訊息說出結果。', 50),
  mobileFromBlueprint('MOB12', '分辨瀏覽器的裝置模式、模擬器與真機各自驗證得到的範圍，把「哪一種問題要去哪裡驗證」寫成規則表與 whereToVerify，用遠端除錯查看真機上頁面的主控台、樣式與請求，依自己網站的資料訂出每個維度的值都被涵蓋的裝置測試矩陣與冒煙測試，並寫出可以重現的錯誤回報。', 45),
  mobileFromBlueprint('MOB13', '分五關把小島外送做成可安裝、可離線的 PWA：底部分頁列與避開手勢列的操作列、44px 的觸控目標與少打字的結帳表單、通過檢查器的 Manifest、預先快取外殼並以網路優先回答菜單且會清理舊快取的 Service Worker、有名稱的圖示按鈕與狀態訊息和送達就停的輪詢，最後照驗收紀錄表在真機上逐項驗證並記錄。', 110),
];

/** A lesson's id is its place in its island's list; an outline built from the blueprint must sit where its id says. */
function idAt(islandId: (typeof ISLAND_IDS)[number], index: number, blueprintId?: string): LessonId {
  const id = `${ISLAND_PREFIX[islandId]}${String(index + 1).padStart(2, '0')}` as LessonId;
  if (blueprintId && blueprintId !== id) throw new Error(`${blueprintId} is listed in the place of ${id}`);
  return id;
}
/** F, D and A are taught in the program languages: every lesson there declares program-code. */
const program = (list: Omit<Outline, 'capabilities'>[]): Outline[] => list.map(o => ({ ...o, capabilities: ['program-code'] }));
const outlines: Record<(typeof ISLAND_IDS)[number], Outline[]> = {
  foundations: program(foundations), structures: program(structures), algorithms: program(algorithms), databases, 'programming-languages': programmingLanguages, networks, 'ai-foundations': aiFoundations, 'large-language-models': largeLanguageModels, 'generative-ai': generativeAi, 'web-foundations': webFoundations, 'responsive-design': responsiveDesign, 'mobile-apps': mobileApps, 'linux-systems': linuxSystems, 'docker-containers': dockerContainers, 'network-servers': networkServers, 'devops-cicd': devopsCicd, 'kubernetes-reliability': kubernetesReliability };

/** Every lesson the blueprint outlines, written or not (validateCurriculum's recommended-lesson check). */
export const outlinedLessonIds: readonly string[] = planning.plannedLessons.map(l => l.lessonId);

export const lessons: LessonMeta[] = ISLAND_IDS.flatMap(islandId => outlines[islandId].map((o, index): LessonMeta => ({
  lessonId: idAt(islandId, index, o.blueprintId),
  islandId, slug: o.slug, title: o.title, summary: o.summary, learningObjectives: o.objectives, difficulty: o.difficulty,
  estimatedMinutes: o.minutes, prerequisites: o.prerequisites, concepts: o.concepts, apcsRelevance: o.apcs,
  supportedLanguages: o.capabilities.includes('program-code') ? [...LANGUAGES, ...(o.extraLanguages ?? [])] : o.capabilities.includes('python-code') ? [...PYTHON_LANGUAGES] : [], visualizationType: o.visualization, lessonStatus: o.status ?? 'planned',
  version: o.version ?? '0.1.0', ...(o.labs ? { labs: o.labs } : {}), capabilities: o.capabilities,
  ...(o.capabilities.includes('sql') ? { queryLanguage: 'SQL' as const } : {}), ...(o.activity ? { activity: o.activity } : {}), ...(o.recommended?.length ? { recommended: o.recommended } : {}),
})));
