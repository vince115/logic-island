import type { IslandId, LessonId, LessonPrefixWritten } from './schema';

/**
 * 2026-11-01: each island is a subject area; its 20 lessons fall into units (科目), shown when an island is chosen on
 * the map. Every lesson belongs to exactly one unit of its own island, in the recommended order
 * (tests/curriculum.test.ts checks this).
 */
export interface CurriculumUnit { title: string; summary: string; lessonIds: LessonId[] }

const range = (prefix: LessonPrefixWritten, from: number, to: number) =>
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
  // 2026-11-20 (course production, batch 1): the written lessons only; the island's other units come with their lessons.
  // CN-1 to CN-5: the whole island, CN01–CN20.
  networks: [
    { title: '分層模型與實體層', summary: '網路為什麼分層、OSI 與 TCP/IP、封裝與 PDU；訊號與媒介、頻寬、延遲、吞吐量與頻寬延遲乘積', lessonIds: range('CN', 1, 2) },
    { title: '區域網路與 IP 定址', summary: 'Ethernet 訊框、MAC 位址與交換器學習、VLAN；Wi-Fi、CSMA/CA 與換手；IPv4、子網路切割、私有位址與 IPv6', lessonIds: range('CN', 3, 5) },
    { title: '位址轉換與路由', summary: 'DHCP、ARP 與 NAT；路由表、最長前綴匹配與 TTL；距離向量、鏈路狀態與 BGP', lessonIds: range('CN', 6, 8) },
    { title: '傳輸層', summary: '連接埠、TCP 與 UDP、三向交握與連線關閉；滑動視窗、逾時重送、流量控制與壅塞控制', lessonIds: range('CN', 9, 10) },
    { title: '網路程式與應用層', summary: 'socket、訊息框架與並行伺服器；DNS 解析、HTTP 請求與回應、Cookie', lessonIds: range('CN', 11, 12) },
    { title: 'Web 安全、API 與效能', summary: 'TLS 1.3、憑證與 HSTS；REST、JSON、冪等性與 CORS；HTTP 快取、CDN、HTTP/2 與 HTTP/3', lessonIds: range('CN', 13, 15) },
    { title: '即時通訊與除錯', summary: '輪詢、SSE 與 WebSocket；ping、traceroute、dig、curl 與封包擷取的分層除錯', lessonIds: range('CN', 16, 17) },
    { title: '網路安全與防護', summary: 'CIA、中間人、偽冒、DoS 與釣魚；封包過濾、狀態檢查、DMZ、VPN 與零信任', lessonIds: range('CN', 18, 19) },
    { title: '綜合挑戰', summary: '追蹤一個 HTTPS 請求的每一步，實作並保護一個 REST API 服務，診斷埋入的網路錯誤', lessonIds: ['CN20'] },
  ],
  'programming-languages': [
    { title: '程式設計典範與抽象', summary: '命令式、程序式、物件導向、函數式與宣告式的比較；封裝、繼承與介面；純函式與函式組合', lessonIds: range('PL', 1, 3) },
    { title: '型別與多型', summary: '靜態與動態、強與弱型別、型別推論；多載、覆寫與泛型', lessonIds: range('PL', 4, 5) },
    { title: '作用域、記憶體與錯誤處理', summary: '名稱綁定、作用域鏈與閉包；堆疊與堆積、值與參考；RAII、參考計數與垃圾回收；例外、Result 與錯誤邊界', lessonIds: range('PL', 6, 9) },
    { title: '語言處理', summary: '從字元到 token 再到 AST 與執行：詞法分析、遞迴下降解析、走訪 AST 的直譯器與環境', lessonIds: range('PL', 10, 12) },
    { title: '並行與非同步', summary: '並行與平行、競爭條件；互斥鎖、原子操作、死結與生產者—消費者；事件迴圈、Promise 與 async／await', lessonIds: range('PL', 13, 15) },
    { title: '編譯、執行、語言設計與綜合挑戰', summary: '編譯流程與中間表示、虛擬機與 JIT、反射與裝飾器等超程式設計、從安全、效能與表達力比較語言的設計取捨，以及整合 lexer、parser 與直譯器打造迷你語言', lessonIds: range('PL', 16, 20) },
  ],
};
