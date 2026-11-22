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
  // AIF-1 to AIF-5: the whole island, AIF01–AIF20.
  'ai-foundations': [
    { title: 'AI 的定義與歷史', summary: 'AI 的四種定義、理性代理人與圖靈測試；從達特茅斯會議、專家系統與 AI 寒冬到深度學習與基礎模型', lessonIds: range('AIF', 1, 2) },
    { title: '代理人與搜尋', summary: 'PEAS、環境性質與代理人類型；問題形式化、無資訊搜尋、啟發式搜尋與 A*', lessonIds: range('AIF', 3, 5) },
    { title: '區域搜尋與賽局', summary: '爬山法、模擬退火與基因演算法；minimax、alpha-beta 剪枝、expectiminimax 與蒙地卡羅樹搜尋', lessonIds: range('AIF', 6, 8) },
    { title: '限制滿足與知識表示', summary: 'CSP、回溯、前向檢查、AC-3 與 MRV／LCV；語意網路、框架、本體論與知識圖譜', lessonIds: range('AIF', 9, 10) },
    { title: '邏輯與推論', summary: '命題邏輯的模型檢查、推論規則、CNF 與歸結、Horn 子句的前向與後向鏈結；一階邏輯的量詞、合一與前向鏈結', lessonIds: range('AIF', 11, 12) },
    { title: '機率與貝氏推論', summary: '聯合分布、邊際化、條件機率與條件獨立；貝氏定理、基本比率與單純貝氏；貝氏網路的因式分解、d-分離、枚舉、變數消去與抽樣', lessonIds: range('AIF', 13, 15) },
    { title: '時序機率與序列決策', summary: '馬可夫鏈、穩態分布與隱馬可夫模型的濾波與 Viterbi；期望效用、風險態度與資訊價值；MDP、貝爾曼方程、價值迭代與策略迭代', lessonIds: range('AIF', 16, 18) },
    { title: '負責任的 AI 與綜合專題', summary: '傷害來源、分組混淆矩陣與公平性指標的取捨、隱私保護、可解釋性、人類監督與治理；把搜尋、賽局、機率推論、期望效用與 MDP 接成一個迷宮代理人，並寫出含風險分級的設計報告', lessonIds: range('AIF', 19, 20) },
  ],
  // LNX-1 to LNX-5: the whole island, LNX01–LNX15.
  'linux-systems': [
    { title: 'Linux 與 Shell 入門', summary: '核心與使用者空間、GNU／Linux、發行版與 LTS；終端機、Shell、提示字元、選項與參數、man 與 --help', lessonIds: range('LNX', 1, 2) },
    { title: '檔案系統與檔案操作', summary: 'FHS、絕對與相對路徑、掛載與 df、du；mkdir、cp、mv、rm、萬用字元、隱藏檔與符號連結', lessonIds: range('LNX', 3, 4) },
    { title: '文字處理與管線', summary: 'cat、less、head、tail、grep、sort、uniq、wc、cut；管線與標準輸出、標準錯誤的重新導向', lessonIds: range('LNX', 5, 5) },
    { title: '使用者、群組與權限', summary: 'UID 與 GID、/etc/passwd 與 /etc/group、useradd、usermod -aG、sudo 與服務帳號；rwx、八進位與符號 chmod、chown、chgrp 與 umask', lessonIds: range('LNX', 6, 7) },
    { title: '行程與套件', summary: 'PID、ps、top、前景與背景工作、kill 與訊號、結束碼；apt 的套件庫、相依、安裝與移除、版本鎖定與安全更新', lessonIds: range('LNX', 8, 9) },
    { title: '服務與日誌', summary: 'systemd 與 unit 檔、systemctl、enable 與 start、Restart= 與服務相依；journalctl 的單位、等級與時間範圍過濾、/var/log 與日誌輪替', lessonIds: range('LNX', 10, 11) },
    { title: '遠端連線、指令稿與排程', summary: 'SSH 的協定步驟、ed25519 金鑰、known_hosts 與只允許金鑰登入；Bash 指令稿的變數、條件、迴圈、函式與 set -euo pipefail；crontab、systemd timer、時區與 flock', lessonIds: range('LNX', 12, 14) },
    { title: '綜合專題', summary: '接手一台伺服器並完成一天的維護：帳號與權限、SSH 金鑰、部署服務、從日誌追查故障、排程備份、套件更新與變更紀錄', lessonIds: range('LNX', 15, 15) },
  ],
  // SRV-0 (2026-11-22): the network and servers island is prepared for authoring; its units come with its first lessons.
  // DKR-0 (2026-11-23): the docker-containers island is prepared for authoring; its units come with its first lessons.
  'docker-containers': [],
  'network-servers': [
    { title: '位址、名稱與請求', summary: '公有與私有 IP、介面與路由、監聽埠與 socket、ss、lsof 與 nc；DNS 區域、A／CNAME／MX／TXT、TTL 與快取、dig；用 curl 讀懂 HTTP 請求、回應、狀態碼與重新導向', lessonIds: range('SRV', 1, 3) },
    { title: '憑證與網頁伺服器', summary: '憑證鏈、ACME 與 Let\'s Encrypt、certbot 自動更新、HSTS 與到期監控；網頁伺服器與應用伺服器、並行模型、逾時與 502／504；nginx 的 server 與 location、nginx -t 與 reload、存取與錯誤日誌', lessonIds: range('SRV', 4, 6) },
    { title: '代理、防火牆與通道', summary: '反向代理與 proxy_pass 的路徑規則、轉送標頭與 WebSocket、502 與 504；upstream 負載平衡、健康檢查與工作階段；ufw 與 nftables 的主機防火牆、規則順序與狀態追蹤；SSH 通道、ProxyJump 與跳板機', lessonIds: range('SRV', 7, 10) },
    { title: '快取、診斷與故障排除', summary: 'Cache-Control、驗證器與 304、CDN 邊緣節點的命中與過期、版本化檔名與快取清除、nginx 的 proxy_cache；由下而上排查連線：ip、dig、ping、traceroute 與 mtr、nc 與 ss、curl -w、tcpdump；依症狀建立假設、分辨 502 與 504、資源與日誌的時間線、修復後驗證', lessonIds: range('SRV', 11, 13) },
    { title: '綜合專題', summary: '架設並維運一個 HTTPS 網站：修好網域並取得憑證、反向代理與負載平衡、防火牆與跳板機、CDN 與快取，追蹤一個請求經過的每一段，再找出只壞了一台後端的故障', lessonIds: range('SRV', 14, 14) },
  ],
  // LLM-0 (2026-11-22): the large-language-models and generative-ai islands are prepared for authoring; their units come
  // with their first lessons.
  // LLM-1: LLM01–LLM03; LLM04 needs DL18 of the deep learning island.
  'large-language-models': [
    { title: '語言模型如何讀寫文字', summary: '逐一預測下一個 token、greedy、temperature、top-k 與 top-p 取樣、基礎模型、指令模型與推理模型、上下文視窗、知識截止與幻覺；BPE 子詞斷詞、UTF-8 位元組、token ID、特殊 token 與費用；embedding 向量、內積、餘弦相似度、最近鄰與 2D 投影', lessonIds: range('LLM', 1, 3) },
  ],
  // GEN-1: GEN01–GEN02; GEN03 and GEN04 need the deep learning island, GEN05 a diffusion-steps capability.
  'generative-ai': [
    { title: '生成模型與自回歸生成', summary: '判別式與生成式模型、學習資料分布再取樣、似然、自回歸、VAE、GAN、流模型與擴散模型的家族地圖；機率連鎖律、生成迴圈、greedy 與取樣、log 機率與下溢、teacher forcing 與 exposure bias、圖像與音訊的離散化', lessonIds: range('GEN', 1, 2) },
  ],
  // WEB-1 (2026-11-23): the web foundations island's first units; WEB-2 adds the CSS unit.
  'web-foundations': [
    { title: '網頁如何運作與 HTML 結構', summary: 'HTML、CSS 與 JavaScript 的分工、頁面載入流程、DOM 與開發者工具；文件骨架、語意元素、地標區域與標題層級', lessonIds: range('WEB', 1, 2) },
    { title: '內容與表單', summary: '文字的語意、連結與錨點、相對與絕對路徑、圖片的替代文字與尺寸、影音與字幕；表單控制項、label 關聯、輸入類型與原生驗證', lessonIds: range('WEB', 3, 4) },
    { title: 'CSS：樣式、盒子與定位', summary: '選擇器、串接、特異性與繼承；盒模型、box-sizing、區塊與行內、外距合併；position 的五種值、包含區塊、z-index 與堆疊環境', lessonIds: range('WEB', 5, 7) },
    { title: 'JavaScript：DOM、事件與非同步', summary: 'DOM 樹與指令稿的執行時機、選取與修改元素、建立並插入元素；事件監聽、事件物件、冒泡與事件委派；事件迴圈、Promise、async／await 與非同步的錯誤處理', lessonIds: range('WEB', 8, 10) },
    { title: '資料、儲存與無障礙', summary: 'fetch、JSON、HTTP 狀態碼與載入／錯誤狀態；localStorage、sessionStorage、Cookie 與資料版本；無障礙名稱、ARIA 角色與狀態、焦點管理', lessonIds: range('WEB', 11, 13) },
    { title: '效能與綜合專題', summary: '關鍵渲染路徑、Core Web Vitals、資源載入與版面位移；不用框架完成小島圖書館的網站：語意結構、樣式、互動、資料、無障礙與效能五個關卡', lessonIds: range('WEB', 14, 15) },
  ],
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
