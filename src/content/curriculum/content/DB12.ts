import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB12 Query Plans and Performance Tuning. SQL lesson with query plans (Phase F.1c): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB12: LessonContent = {
  lessonId: 'DB12',
  motivation: '同一個查詢，在 30 筆資料上怎麼寫都一樣快；資料長到幾萬、幾百萬筆時，寫法與索引的差別可能就是「立刻有結果」和「等到逾時」。可是 SQL 只描述要什麼，DBMS 實際怎麼做（先讀哪張表、用不用索引、怎麼合併、要不要排序）是查詢最佳化器決定的，從 SQL 本身看不出來。本課用 30,000 筆訂單的 `sales` 資料學會調校的基本功：用 `EXPLAIN QUERY PLAN` 看見 SQLite 選擇的計畫，分辨全表掃描、索引搜尋與覆蓋索引；認識巢狀迴圈、雜湊與合併三種 JOIN 演算法，並用簡單的算術比較它們的成本；找出讓索引失效的寫法（函式包住欄位、前綴萬用字元、跨欄位的 OR）並改寫，也把逐列重算的相關子查詢改寫成只讀一次；了解最佳化器靠選擇性與統計資訊估計成本，`ANALYZE` 會讓它改變主意；最後用同一台電腦前後多次測量，確認改善是真的、結果也沒有變。學完後，你拿到一個慢查詢，能從計畫指出瓶頸在哪一步，並提出改寫或索引方案。',
  sections: [
    {
      id: 'optimizer-explain', title: '查詢最佳化器與 EXPLAIN QUERY PLAN',
      blocks: [
        { type: 'p', text: 'DB01 說過 SQL 是宣告式的：只說要什麼，怎麼找由 DBMS 決定。負責決定的元件叫查詢最佳化器（query optimizer）。同一個查詢，先讀哪張表、每張表用全表掃描還是索引、合併用什麼方法、要不要另外排序，組合起來有很多種執行方式，每一種叫一個執行計畫（query plan）。最佳化器估計每個計畫的成本，挑估計最便宜的那一個。估計靠的是它對資料的了解：有哪些索引、表有多大、值怎麼分布，所以它也可能估錯。調校的第一步，是看見它挑了什麼。' },
        { type: 'p', text: '本課的練習場用 `sales` 資料：`customers` 2,000 位顧客、`products` 200 項商品、`orders` 30,000 筆訂單，除了主鍵沒有任何索引。在 SQLite 的查詢前面加上 `EXPLAIN QUERY PLAN`，SQLite 不會執行查詢，只回傳它打算怎麼做。下面是「台中顧客的訂單」：' },
        { type: 'example', id: 'plan-join' },
        { type: 'p', text: '每一列是計畫的一個步驟，`detail` 是步驟的說明。`id` 與 `parent` 把步驟組成一棵樹：`parent` 是 0 的步驟在最上層，其他步驟屬於 `id` 等於它的 `parent` 的那一步（子查詢、`UNION` 的兩邊會這樣往內縮）。練習場會依這棵樹縮排，並替每一步標上「全表掃描」「索引搜尋」等名稱。`notused` 欄如其名，不是給人讀的，本課不使用它。同一層的合併步驟由上往下，就是巢狀迴圈由外到內：' },
        { type: 'list', items: [
          '`SCAN o`：外層迴圈，逐列讀完整張 `orders`（別名 `o`），共 30,000 列。',
          '`SEARCH c USING INTEGER PRIMARY KEY (rowid=?)`：對外層的每一列，拿 `o.customer_id` 到 `customers` 的主鍵 B+ 樹裡找那一位顧客（`?` 代表每次代入的值），再檢查 `c.city = \'台中\'`。',
        ] },
        { type: 'p', text: '為什麼不先挑出台中的顧客，再找他們的訂單？因為 `orders.customer_id` 沒有索引：從顧客找訂單，每位顧客都得把 30,000 筆訂單掃描一次；反過來從訂單找顧客，可以用 `customers` 的主鍵，整張 `orders` 只要掃描一次。最佳化器比較了兩種順序，選了後者。下一節替 `orders.customer_id` 加上索引，它就會改變主意。下表整理本課會遇到的 SQLite 計畫步驟：' },
        { type: 'table', head: ['計畫中的文字', '意思', '練習場的標示'], rows: [
          ['`SCAN t`', '全表掃描：逐列讀過整張表', '全表掃描'],
          ['`SCAN t USING INDEX i`、`SCAN t USING COVERING INDEX i`', '依索引的順序讀過整個索引；COVERING 表示只讀索引、不回到表裡', '掃描整個索引'],
          ['`SEARCH t USING INDEX i (col=?)`', '在索引的 B+ 樹裡搜尋，只讀符合的那一段；括號裡是用上的條件，`(col>? AND col<?)` 是範圍', '索引搜尋'],
          ['`SEARCH t USING INTEGER PRIMARY KEY (rowid=?)`', '用整數主鍵（SQLite 的 rowid）直接找到那一列', '索引搜尋'],
          ['`SEARCH t USING AUTOMATIC COVERING INDEX (col=?)`', 'SQLite 為這次查詢臨時建立的索引，查詢結束就丟掉', '索引搜尋'],
          ['`USE TEMP B-TREE FOR ORDER BY`（或 `GROUP BY`、`DISTINCT`）', '沒有現成的順序可用，另外建一棵暫存 B 樹來排序或分組', '額外排序'],
          ['`CORRELATED SCALAR SUBQUERY n`、`LIST SUBQUERY n`', '子查詢；相關子查詢底下的步驟，對外層的每一列各執行一次', '其他步驟'],
          ['`MATERIALIZE x`／`CO-ROUTINE x` 之後的 `SCAN x`', '讀取 CTE 或 `FROM` 子查詢算出的中間結果（不是資料表）；算出它的步驟縮排在 `MATERIALIZE`／`CO-ROUTINE` 底下', '讀取中間結果'],
          ['`MULTI-INDEX OR`、`BLOOM FILTER ON t`、`CREATE BLOOM FILTER`', '用兩個索引分別處理 OR 的兩邊；用 Bloom 過濾器先排除一定配不到的列', '其他步驟'],
        ] },
        { type: 'callout', tone: 'note', title: '這是 SQLite 的格式', text: '`EXPLAIN QUERY PLAN` 是 SQLite 的語法，輸出的文字也是 SQLite 自己的，版本不同可能略有差異（本練習場是 SQLite 3.49.1）。只寫 `EXPLAIN`（不加 `QUERY PLAN`）時，SQLite 會列出它內部虛擬機器的指令（`addr`、`opcode`…），那是給除錯 SQLite 本身用的。PostgreSQL、MySQL 也用 `EXPLAIN`，但輸出格式完全不同，第 4 節與第 7 節會對照。' },
      ],
    },
    {
      id: 'scan-methods', title: '掃描方式：全表掃描、索引搜尋與覆蓋索引',
      blocks: [
        { type: 'p', text: '找瓶頸的第一步：找出計畫裡要讀「整張表」的步驟，再估計那一步總共讀了多少列。下面只要顧客 42 的訂單：' },
        { type: 'example', id: 'plan-one-customer' },
        { type: 'p', text: '找顧客 42 用主鍵，一步就到；但他只有 15 筆訂單，`SCAN o` 卻要讀完 30,000 筆才能確定沒有漏掉，這一步就是瓶頸。解法是「索引與 B+ 樹」那一課的主題：替 `orders.customer_id` 建立索引。建好之後，再看一次上一節台中顧客的查詢：' },
        { type: 'example', id: 'plan-join-indexed' },
        { type: 'p', text: '合併的順序反過來了：現在外層掃描 `customers`（2,000 列，逐一檢查城市），對 334 位台中顧客各在新索引裡搜尋一次，每次找到 15 筆訂單，總共只讀 334 × 15 = 5,010 筆訂單。查詢一個字都沒改，改變的是最佳化器能選的路，以及它估計的成本。這也是為什麼看計畫比背規則可靠：同一個查詢的計畫會隨索引而變。' },
        { type: 'table', head: ['掃描方式', '計畫的寫法', '讀多少', '常在什麼時候出現'], rows: [
          ['全表掃描', '`SCAN t`', '每一列', '沒有可用的索引，或最佳化器估計反正要讀大部分的列'],
          ['掃描整個索引', '`SCAN t USING (COVERING) INDEX i`', '索引的每一筆', '條件沒辦法用索引搜尋，但索引比表小（覆蓋）或順序剛好符合 `ORDER BY`'],
          ['索引搜尋', '`SEARCH t USING INDEX i (…)`', '只讀符合範圍的索引項目，再依 rowid 回表讀整列', '條件用到索引最左邊欄位的 `=`、`IN` 或範圍'],
          ['覆蓋索引搜尋', '`SEARCH t USING COVERING INDEX i (…)`', '只讀符合範圍的索引項目，不回表', '查詢用到的欄位全都在索引裡'],
        ] },
        { type: 'p', text: '索引裡存著索引欄位的值與那一列的 rowid。查詢需要的欄位都在索引裡時，SQLite 不必回到表裡讀整列，計畫會寫 `COVERING INDEX`。例如建了 `idx_orders_customer` 之後，`SELECT COUNT(*) FROM orders WHERE customer_id = 42` 的計畫是 `SEARCH orders USING COVERING INDEX idx_orders_customer (customer_id=?)`：數一數索引裡的 15 筆就好；`SELECT *` 則要回表讀出每一列的其他欄位。' },
        { type: 'callout', tone: 'warning', title: '有 INDEX 字樣不等於快', text: '`SCAN orders USING COVERING INDEX …` 也用了索引，但它是「掃描」：索引的 30,000 筆項目一筆都沒少讀，只是每筆比較小、不必回表。真正只讀需要的那一段，計畫裡要看到 `SEARCH`。本課的練習也這樣檢查：全表掃描與掃描整個索引都算一次「全部掃描」。' },
      ],
    },
    {
      id: 'index-killers', title: '讓索引失效的寫法與改寫',
      blocks: [
        { type: 'p', text: '索引依欄位「原本的值」排序。條件若把欄位包進函式或運算，SQLite 就得先替每一列算出結果才能比較，B+ 樹的順序派不上用場。建立 `ordered_on` 的索引，數一數 2025 年 3 月的訂單：' },
        { type: 'example', id: 'substr-plan' },
        { type: 'p', text: '計畫用了索引，卻是 `SCAN`：讀完 30,000 筆索引項目，逐筆算 `substr()` 再比較。`ordered_on` 存成 `YYYY-MM-DD` 的文字，字串的大小順序就是日期的先後，所以「2025 年 3 月」可以改寫成欄位本身的範圍：' },
        { type: 'example', id: 'range-plan' },
        { type: 'p', text: '`SEARCH … (ordered_on>? AND ordered_on<?)`：在 B+ 樹裡找到 2025-03-01 的位置，沿著葉節點往後讀到 2025-04-01 之前為止。兩種寫法數到的都是 1,455 筆，`BETWEEN \'2025-03-01\' AND \'2025-03-31\'` 也一樣（日期沒有時間部分，所以 3 月 31 日包含在內）。改寫沒有改變結果，只改變了計畫。常見的失效寫法與改寫方式：' },
        { type: 'table', head: ['失效的寫法', '為什麼用不上索引', '改寫'], rows: [
          ['`substr(ordered_on, 1, 7) = \'2025-03\'`、`strftime(\'%Y-%m\', ordered_on) = \'2025-03\'`', '函式包住欄位，要對每一列計算', '`ordered_on >= \'2025-03-01\' AND ordered_on < \'2025-04-01\'`'],
          ['`date(ordered_on, \'+7 days\') > \'2026-10-01\'`', '欄位參與運算', '把運算移到常數那一邊：`ordered_on > date(\'2026-10-01\', \'-7 days\')`'],
          ['`CAST(customer_id AS TEXT) = \'42\'`', '欄位被轉型', '`customer_id = 42`：常數寫成和欄位相同的型別'],
          ['`name LIKE \'%7\'`、`name GLOB \'*7\'`', '前綴萬用字元：開頭不固定，依開頭排序的索引幫不上忙', '單靠改寫做不到，要改變設計（例如另存可搜尋的欄位，或使用全文檢索）'],
          ['`name LIKE \'顧客01%\'`（SQLite）', 'SQLite 的 `LIKE` 預設不分大小寫，一般索引是分大小寫排序的', '`name GLOB \'顧客01*\'`（分大小寫），或範圍 `name >= \'顧客01\' AND name < \'顧客02\'`'],
          ['`customer_id = 42 OR product_id = 7`', 'OR 的兩邊是不同欄位：只有一邊有索引時，另一邊仍得全表掃描', '兩個欄位各建索引（SQLite 會用 `MULTI-INDEX OR`），或改寫成兩個查詢的 `UNION`'],
        ] },
        { type: 'p', text: '前綴萬用字元在任何使用 B+ 樹索引的 DBMS 都一樣：索引像字典依開頭排序，「以 7 結尾的名字」散落在各處。開頭固定的 `LIKE` 在 SQLite 卻另有陷阱，計畫是這樣：' },
        { type: 'example', id: 'like-plan' },
        { type: 'p', text: '索引只被拿來整個掃描。SQLite 的 `LIKE` 對英文字母不分大小寫，而一般索引（BINARY 排序）分大小寫，SQLite 因此不拿它來搜尋 `LIKE`；改用分大小寫的 `GLOB \'顧客01*\'` 或寫成範圍，計畫就變成 `SEARCH customers USING COVERING INDEX idx_customers_name (name>? AND name<?)`。（建索引時寫 `COLLATE NOCASE` 也能讓 SQLite 用它搜尋 `LIKE`。）OR 跨兩個欄位時，兩個欄位都要有索引：' },
        { type: 'example', id: 'or-plan' },
        { type: 'p', text: '`MULTI-INDEX OR` 底下的 `INDEX 1`、`INDEX 2` 各自搜尋一個索引，SQLite 再合併兩邊找到的列、去掉重複。若只替 `customer_id` 建索引，計畫是 `SCAN orders`：`product_id = 7` 的列可能在表的任何地方，反正要掃一遍，`customer_id` 的索引也就沒用了。' },
        { type: 'callout', tone: 'note', title: 'LIKE 與型別轉換：各 DBMS 不同', text: '開頭固定的 `LIKE \'abc%\'`：MySQL 可以用一般的 B+ 樹索引做範圍搜尋；PostgreSQL 在非 C 排序規則的資料庫裡，要用 `text_pattern_ops` 之類的運算子類別建索引才行；SQLite 如上所述。型別轉換也不同：SQLite 的 `customer_id = \'42\'` 會先把常數 \'42\' 轉成整數，仍然用得上索引（可以在練習場用 `EXPLAIN QUERY PLAN` 驗證）；MySQL 拿字串欄位和數字比較時，要把每一列的字串轉成數字，就用不上那個欄位的索引。最穩當的習慣是讓常數和欄位同型別。' },
      ],
    },
    {
      id: 'join-algorithms', title: 'JOIN 演算法：巢狀迴圈、雜湊與合併',
      blocks: [
        { type: 'p', text: 'SQLite 用巢狀迴圈（nested loop）執行所有合併：外層的表逐列讀，每一列再到內層的表找配對的列，計畫裡同一層的步驟由上往下就是由外到內。內層怎麼「找」決定了成本：用主鍵或索引搜尋（索引巢狀迴圈），或把內層整張掃描一遍。內層沒有可用的索引時，SQLite 常會臨時建一個自動索引（automatic index）。下面用 DB05 的 LEFT JOIN 列出每項商品的訂單數，連沒有訂單的商品也要列出：' },
        { type: 'example', id: 'auto-index' },
        { type: 'p', text: '`orders.product_id` 沒有索引，SQLite 在查詢一開始讀一遍 `orders`，建好一個只用於這次查詢的自動索引，之後 200 項商品各在裡面搜尋一次；`BLOOM FILTER` 是一個很省空間的結構，能快速判斷「這個 `product_id` 一定沒有訂單」，省下一些搜尋。自動索引每次執行都要重建一次，同樣的查詢若常常執行，就該建一個真正的索引。想看看沒有自動索引的代價，可以先單獨執行 `PRAGMA automatic_index = OFF;` 再執行同一個查詢：計畫變成 `SCAN p` 加上 `SCAN o LEFT-JOIN`，也就是 200 × 30,000 = 6,000,000 次讀取，比較一下兩者的時間（這個設定會一直留在練習場裡，做完按「重設資料」）。' },
        { type: 'p', text: '其他 DBMS 除了巢狀迴圈，還有兩種合併演算法。SQLite 沒有實作它們，所以練習場看不到，下面只說明概念：' },
        { type: 'list', items: [
          '雜湊合併（hash join）：先把較小的表依合併欄位放進記憶體裡的雜湊表（建置階段），再逐列讀另一張表，用合併欄位到雜湊表查有沒有配對（探查階段）。每張表只讀一次，但只能處理等號條件，而且需要放得下雜湊表的記憶體。',
          '合併（排序合併，merge join）：兩邊先依合併欄位排好序，再像合併排序的合併步驟一樣，兩個指標同步往下走。輸入已經有序（例如來自索引）時特別划算，排序的成本就省掉了。',
        ] },
        { type: 'p', text: '用 `customers`（2,000 列）合併 `orders`（30,000 列）、條件 `o.customer_id = c.id` 估算一下。下表只數主要的比較或讀取次數，是比較數量級用的粗略模型，不是任何 DBMS 的真實成本公式；log₂ 2,000 ≈ 11，log₂ 30,000 ≈ 15：' },
        { type: 'table', head: ['演算法', '做法', '粗估工作量', '誰在用'], rows: [
          ['巢狀迴圈（內層沒有索引）', '外層每一列，都把內層整張表讀一遍', '2,000 × 30,000 = 60,000,000 次比較', '所有 DBMS 都有；SQLite 在建不了自動索引時'],
          ['索引巢狀迴圈', '外層 `orders` 每一列，到 `customers` 的主鍵 B+ 樹查一次', '30,000 × 11 ≈ 330,000 次比較', 'SQLite 最主要的做法（主鍵、索引或自動索引）'],
          ['雜湊合併', '用較小的 `customers` 建雜湊表，再讀 `orders` 逐列查表', '2,000 + 30,000 = 32,000 次讀取與雜湊查表', 'PostgreSQL、SQL Server、Oracle，MySQL 8.0.18 起；SQLite 沒有'],
          ['合併（排序合併）', '兩邊依 `customer_id` 排序，再同步往下走', '排序約 2,000 × 11 + 30,000 × 15 = 22,000 + 450,000 = 472,000 次比較，再加上合併的 32,000 步；兩邊已依索引排好序時只要 32,000 步', 'PostgreSQL、SQL Server、Oracle；SQLite 沒有'],
        ] },
        { type: 'p', text: '看起來雜湊合併總是贏？換成「只要顧客 42 的訂單」：外層只有 1 位顧客，若 `orders.customer_id` 有索引，索引巢狀迴圈只要搜尋一次（約 15 次比較）再讀出 15 筆訂單；雜湊合併卻仍要把 30,000 筆訂單全部讀過、逐筆查表。沒有永遠最好的演算法：外層有幾列、內層有沒有索引、輸入是否已排序、記憶體夠不夠，都會改變答案。這正是最佳化器的工作，而它判斷「外層有幾列」靠的是下一節的統計資訊。' },
        { type: 'callout', tone: 'note', title: '在其他 DBMS 看出合併演算法', text: 'PostgreSQL 的 `EXPLAIN` 輸出一棵節點樹，合併節點叫 `Nested Loop`、`Hash Join`（底下有一個建雜湊表的 `Hash` 節點）、`Merge Join`；掃描節點叫 `Seq Scan`（全表掃描）、`Index Scan`、`Index Only Scan`（相當於覆蓋索引）、`Bitmap Heap Scan`，每個節點附上估計的成本與列數。MySQL 傳統的 `EXPLAIN` 是一張表，每張表一列，`type` 欄的 `ALL` 是全表掃描、`index` 是掃描整個索引、`range` 是範圍搜尋、`ref`／`eq_ref`／`const` 是用索引找相等的值；雜湊合併在 `EXPLAIN FORMAT=TREE` 的輸出裡看得到。名稱不同，要找的東西相同：哪一步讀了整張表、內層怎麼找配對。' },
      ],
    },
    {
      id: 'selectivity-statistics', title: '選擇性與統計資訊：最佳化器怎麼估計',
      blocks: [
        { type: 'p', text: '條件的選擇性（selectivity）指符合條件的列占全部的比例。比例越小，條件越「挑剔」，用索引越划算；比例很大時，索引搜尋要在索引裡讀一大段，再為每一筆回表讀整列，可能比從頭到尾掃描一次還累。`orders.status` 的分布：' },
        { type: 'example', id: 'selectivity' },
        { type: 'p', text: '`customer_id = 42` 只占 15 / 30,000 = 0.05%，索引的效果很明顯；`status = \'cancelled\'` 占 5%；`status = \'shipped\'` 占 81.4%，就算替 `status` 建了索引，那個查詢也不見得變快，甚至可能變慢。不要背「超過幾 % 就不該用索引」這種數字，它隨資料、硬體與 DBMS 而變；建索引後用第 7 節的方法實際量一量。' },
        { type: 'p', text: '問題是：最佳化器怎麼知道比例？它要靠統計資訊（statistics）。SQLite 沒有自動收集統計資訊，要執行 `ANALYZE` 才會掃描資料表與索引，把結果寫進 `sqlite_stat1` 表。先看沒有統計資訊時，SQLite 怎麼在兩個索引之間選擇：' },
        { type: 'example', id: 'stats-before' },
        { type: 'p', text: '它選了 `status` 的索引：沒有統計資訊時，SQLite 通常認為「等於」比「範圍」挑剔。但實際上 `cancelled` 有 1,500 筆，這兩天的訂單只有 94 筆。執行 `ANALYZE` 之後，同一個查詢：' },
        { type: 'example', id: 'stats-after' },
        { type: 'p', text: '它改用日期的索引了：先找出兩天內的 94 筆，再檢查狀態，最後留下 47 筆。結果完全一樣，只是讀的資料少得多。改變它主意的，是 `ANALYZE` 寫下的數字：' },
        { type: 'example', id: 'stat1' },
        { type: 'p', text: '`stat` 欄的第一個數字是表的列數，後面是「索引欄位的值相同時，平均有幾列」：`30000 47` 表示同一天平均 47 筆訂單，`30000 10000` 表示同一個狀態平均 10,000 筆（30,000 筆分成 3 種狀態）。有了這些數字，SQLite 估計 `status = ?` 大約 10,000 列、兩天的範圍大約 94 列，於是改選日期索引。沒有建索引的 `customers`、`products` 只記下列數。' },
        { type: 'callout', tone: 'warning', title: '平均值看不出分布不均', text: '`sqlite_stat1` 只存平均值：它對 `shipped`（24,429 筆）和 `cancelled`（1,500 筆）一律估計 10,000 筆，看不出兩者差了十幾倍。SQLite 另有存放樣本的 `sqlite_stat4`，但要在編譯時開啟 `SQLITE_ENABLE_STAT4`；本練習場的 `ANALYZE` 只產生 `sqlite_stat1`。統計資訊也會過時：資料大量變動後要再執行一次 `ANALYZE`。其他 DBMS：PostgreSQL 也用 `ANALYZE` 收集統計資訊（通常由 autovacuum 自動執行），除了平均還記下最常見的值與直方圖，可以從 `pg_stats` 查看；MySQL 用 `ANALYZE TABLE`，8.0 起也能為欄位建立直方圖。' },
      ],
    },
    {
      id: 'rewrite-subquery', title: '改寫相關子查詢：從每列一次到讀一次',
      blocks: [
        { type: 'p', text: 'DB06 提過：相關子查詢的意義是「對外層的每一列各算一次」，DBMS 不一定照字面執行，在意效能時要看計畫。下面算出每項商品的營收（數量總和 × 單價），取前五名，看 SQLite 怎麼做：' },
        { type: 'example', id: 'correlated-plan' },
        { type: 'p', text: '`CORRELATED SCALAR SUBQUERY 1` 底下的 `SCAN o` 縮排在子查詢裡：外層每讀一項商品，就把 30,000 筆訂單掃描一次，共 200 × 30,000 = 6,000,000 次讀取。在練習場執行它，時間明顯比本課其他查詢長；同樣的寫法套在 2,000 位顧客上，要讀 60,000,000 次，在練習場可能超過 3 秒而被停止。有兩種解法：' },
        { type: 'list', ordered: true, items: [
          '替子查詢的條件欄位建索引：`CREATE INDEX idx_orders_product ON orders(product_id);` 之後，子查詢變成 `SEARCH o USING INDEX idx_orders_product (product_id=?)`，每項商品只讀自己的 150 筆訂單。',
          '改寫成 JOIN 加 GROUP BY：整張 `orders` 只讀一次，邊讀邊依商品累加。',
        ] },
        { type: 'example', id: 'group-join-plan' },
        { type: 'p', text: '現在只有一個 `SCAN o`（30,000 列），每一列用主鍵找一次商品，再用兩棵暫存 B 樹分組與排序。`USE TEMP B-TREE` 本身不一定是問題，要看它排了多少列：這裡分組後只剩 200 列，排序很便宜；如果是幾萬列的 `ORDER BY` 只為了取前 10 列，一個欄位順序合適的索引就能省掉它。兩種解法都可以，選哪一種看情況：索引對所有用到 `product_id` 的查詢都有幫助，但會讓寫入變慢、占用空間；改寫不必動綱要，但只幫到這一個查詢。' },
        { type: 'callout', tone: 'tip', title: '改寫前先確認意思相同', text: '相關子查詢與 JOIN 在「沒有配對」時行為不同：一項沒有任何訂單的商品，在相關子查詢版本裡營收是 NULL、仍然佔一列；在 JOIN 加 GROUP BY 版本裡整列消失（用 LEFT JOIN 才會留下）。`sales` 的每項商品都有訂單，所以兩者結果相同，換一份資料就不一定。調校的前提是結果不變，第 7 節示範怎麼用 SQL 比對兩種寫法的結果。' },
      ],
    },
    {
      id: 'measure', title: '實際測量：調校前後怎麼比',
      blocks: [
        { type: 'p', text: '計畫告訴你 SQLite 打算怎麼做，但它是估計；改善是不是真的，最後要靠測量。練習場在每次執行後顯示「SQLite 執行時間約 … 毫秒」，那是在你的瀏覽器裡量的：不同電腦、同一台電腦的不同次執行都會有差，所以本課不寫出任何具體的毫秒數，請你自己量。可靠的比較方法：' },
        { type: 'list', ordered: true, items: [
          '按「重設資料」，確定沒有之前留下的索引、`ANALYZE` 統計資訊或 `PRAGMA` 設定。',
          '執行原查詢 3 到 5 次，記下每次的時間，看中間的值；第一次常常比較慢，不要只看一次。',
          '用 `EXPLAIN QUERY PLAN` 找出瓶頸：哪一步讀了整張表，那一步共讀幾列。',
          '一次只改一件事：建索引，或改寫查詢。建索引要單獨執行一次，因為練習場量的是整次執行的時間，`CREATE INDEX` 和查詢寫在同一次執行裡，建索引的時間也會算進去。',
          '再執行 3 到 5 次，在同一台電腦、同一份資料上和第 2 步比較；同時確認新的計畫真的變了。',
          '確認結果相同（見下例），並想想代價：每個索引都占空間，也會讓 INSERT、UPDATE、DELETE 變慢。',
        ] },
        { type: 'p', text: '確認兩種寫法結果相同，可以用 `EXCEPT`（標準 SQL 的差集：留下在左邊、不在右邊的列）兩個方向各比一次，兩邊都是 0 才表示兩組結果的列完全相同（`EXCEPT` 會去掉重複，所以列數也要另外比一下）。`AS MATERIALIZED` 讓 SQLite 把慢的版本只算一次（SQLite 與 PostgreSQL 的寫法）：' },
        { type: 'example', id: 'same-result' },
        { type: 'callout', tone: 'warning', title: '200 列的上限也會影響時間', text: '練習場每次最多讀取 200 列結果，讀到第 200 列就停止。一個會回傳幾千列的查詢，量到的只是產生前 200 列的時間，前後比較就失真了。測量時改用會讀完全部資料的形式，例如 `SELECT COUNT(*) FROM (原查詢)`，或本來就只回傳少數幾列的彙總查詢。' },
        { type: 'callout', tone: 'tip', title: 'SQLite 的 NOT INDEXED', text: '想在同一個練習場比較「有索引」與「沒索引」，不必刪掉索引：SQLite 允許在表名後面寫 `NOT INDEXED`，例如 `SELECT * FROM orders NOT INDEXED WHERE customer_id = 42`，這一次查詢就不使用那張表的索引（計畫會是 `SCAN orders`）。這是 SQLite 的語法，其他 DBMS 有各自的提示（hint）寫法。' },
        { type: 'callout', tone: 'note', title: 'EXPLAIN ANALYZE（其他 DBMS）', text: 'PostgreSQL 的 `EXPLAIN ANALYZE` 會真的執行查詢，在每個節點旁邊列出實際的列數與時間，和估計值並排；估計列數與實際列數差很多，往往就是統計資訊過時或分布不均。因為它真的執行，`EXPLAIN ANALYZE DELETE …` 會真的刪除資料，要包在 `BEGIN` 與 `ROLLBACK` 之間。MySQL 從 8.0.18 起也有 `EXPLAIN ANALYZE`。SQLite 沒有 `EXPLAIN ANALYZE`，它的命令列工具 `sqlite3` 可以用 `.timer on` 顯示每個敘述的執行時間。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-bottleneck', prompt: '在 `sales` 上（沒有額外的索引），下面查詢的計畫有兩個步驟。哪一個是瓶頸，該怎麼改善？',
      code: { language: 'SQL', text: 'EXPLAIN QUERY PLAN\nSELECT c.name, o.ordered_on\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE c.id = 42;\n\n-- SEARCH c USING INTEGER PRIMARY KEY (rowid=?)\n-- SCAN o' },
      options: [
        '`SCAN o`：為了顧客 42 的 15 筆訂單讀完 30,000 筆訂單；替 `orders(customer_id)` 建立索引',
        '`SEARCH c`：主鍵搜尋要走過整棵 B+ 樹；替 `customers(id)` 再建一個索引',
        '計畫順序表示 `customers` 被搜尋了 30,000 次；把 FROM 裡兩張表的順序對調',
        '沒有瓶頸：兩個步驟都是在 B+ 樹裡讀資料，已經是最好的計畫',
      ],
      answer: 0, explanation: '只要找一位顧客，`SEARCH c` 用主鍵一步就到；`SCAN o` 卻要讀完整張 `orders`，才能找出 `customer_id = 42` 的 15 筆，這就是瓶頸。建立 `orders(customer_id)` 的索引後，它變成 `SEARCH o USING INDEX …`。`customers.id` 是整數主鍵，本身就是那棵 B+ 樹，再建索引沒有用；`SEARCH c` 在外層、只執行一次，不是 30,000 次；FROM 裡的順序不決定執行順序，最佳化器會自己選；`SCAN` 是全表掃描，不是樹狀搜尋。',
    },
    {
      id: 'q-date-rewrite', prompt: '`orders` 已經有 `CREATE INDEX idx_orders_date ON orders(ordered_on);`（`ordered_on` 存成 `YYYY-MM-DD`）。要數 2025 年 3 月的訂單，哪一個條件能讓 SQLite 的計畫出現 `SEARCH`？',
      options: [
        '`WHERE substr(ordered_on, 1, 7) = \'2025-03\'`',
        '`WHERE strftime(\'%Y-%m\', ordered_on) = \'2025-03\'`',
        '`WHERE ordered_on LIKE \'2025-03%\'`',
        '`WHERE ordered_on >= \'2025-03-01\' AND ordered_on < \'2025-04-01\'`',
      ],
      answer: 3, explanation: '只有範圍條件直接比較欄位本身的值，SQLite 能在索引裡找到 2025-03-01 的位置往後讀：`SEARCH orders USING COVERING INDEX idx_orders_date (ordered_on>? AND ordered_on<?)`。`substr()` 與 `strftime()` 把欄位包進函式，每一列都要先算，計畫是 `SCAN orders USING COVERING INDEX …`（掃描整個索引）。`LIKE \'2025-03%\'` 雖然開頭固定，但 SQLite 的 `LIKE` 預設不分大小寫，一般索引不能拿來搜尋，計畫同樣是掃描；這一點是 SQLite 的行為，其他 DBMS 不一定如此。四個條件數到的筆數相同（1,455），差別只在計畫。',
    },
    {
      id: 'q-covering-scan', prompt: '建立 `idx_orders_date` 之後，`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM orders WHERE substr(ordered_on, 1, 7) = \'2025-03\';` 的計畫是 `SCAN orders USING COVERING INDEX idx_orders_date`。下列哪一個說法正確？',
      options: [
        '計畫用了索引，所以 SQLite 只讀 2025 年 3 月的那 1,455 筆索引項目',
        'SQLite 讀過索引的全部 30,000 筆項目，只是不必回表；條件包在函式裡，沒辦法用索引搜尋',
        '`COVERING` 表示結果被快取起來，第二次執行不必再讀資料',
        '執行 `ANALYZE` 之後，同一個查詢的計畫就會變成 `SEARCH`',
      ],
      answer: 1, explanation: '`SCAN … USING COVERING INDEX` 是掃描整個索引：索引比表小、而且查詢只需要 `ordered_on`，所以 SQLite 讀索引而不讀表，但 30,000 筆一筆都沒少。只讀需要的那一段要看到 `SEARCH`。`COVERING` 指查詢需要的欄位都在索引裡，和快取無關。`ANALYZE` 只提供統計數字，讓最佳化器在可行的計畫之間選；`substr()` 讓索引搜尋根本不可行，統計資訊改變不了這一點，要改寫成範圍。',
    },
    {
      id: 'q-stat1', prompt: '執行 `CREATE INDEX idx_orders_status ON orders(status); ANALYZE;` 之後，`sqlite_stat1` 裡有一列 `orders | idx_orders_status | 30000 10000`。`10000` 是什麼意思？（實際上 shipped 24,429 筆、pending 4,071 筆、cancelled 1,500 筆）',
      options: [
        '`status = \'shipped\'` 的列數，四捨五入到萬',
        '`status` 有 10,000 種不同的值',
        '`status` 值相同的列平均有 10,000 列：30,000 列分成 3 種狀態',
        '索引占用了 10,000 個頁面',
      ],
      answer: 2, explanation: '`stat` 的第一個數字是表的列數，接著是「索引欄位值相同時平均有幾列」，30,000 ÷ 3 = 10,000。它是平均值，所以對 shipped 與 cancelled 都估計 10,000 列，看不出分布不均（那需要 `sqlite_stat4` 這類樣本統計）。它不是某一個值的列數（shipped 實際是 24,429）；不同值只有 3 種，若有 10,000 種，平均每個值只會有 3 列；`sqlite_stat1` 記的是列數估計，不是頁數。',
    },
    {
      id: 'q-join-cost', prompt: '表 R 有 1,000 列、表 S 有 50,000 列，用等號條件合併，兩邊都沒有索引。用本課的粗略模型：不建索引的巢狀迴圈要比較幾次？以 R 建雜湊表的雜湊合併要讀幾列？',
      options: [
        '巢狀迴圈 51,000 次；雜湊合併 50,000,000 列',
        '巢狀迴圈 50,000,000 次；雜湊合併 50,000,000 列，因為每一對都要比較',
        '巢狀迴圈 1,000 次；雜湊合併 50,000 列',
        '巢狀迴圈 50,000,000 次；雜湊合併約 51,000 列',
      ],
      answer: 3, explanation: '巢狀迴圈對 R 的每一列都把 S 讀一遍：1,000 × 50,000 = 50,000,000 次比較。雜湊合併先讀 R 的 1,000 列建雜湊表，再讀 S 的 50,000 列各查一次表：1,000 + 50,000 = 51,000 列，不必比較每一對，因為雜湊表直接指出可能配對的列。把兩個數字對調是弄反了兩種方法；1,000 只是外層的列數，忘了乘上內層。SQLite 沒有雜湊合併，遇到這種情況通常會建自動索引，改用索引巢狀迴圈。',
    },
    {
      id: 'q-or-plan', prompt: '`orders` 只有一個索引 `CREATE INDEX idx_orders_customer ON orders(customer_id);`。下面查詢的計畫是什麼？',
      code: { language: 'SQL', text: 'EXPLAIN QUERY PLAN\nSELECT *\nFROM orders\nWHERE customer_id = 42 OR product_id = 7;' },
      options: [
        '`SEARCH orders USING INDEX idx_orders_customer (customer_id=?)`，再對結果檢查 `product_id`',
        '`MULTI-INDEX OR`，底下一個 `SEARCH` 用索引、一個 `SCAN`',
        '`SCAN orders`',
        '執行失敗：有索引的欄位不能和沒有索引的欄位用 OR 連接',
      ],
      answer: 2, explanation: '`product_id = 7` 的列可能在表的任何地方，沒有索引就只能全表掃描；既然反正要掃一遍，順便檢查 `customer_id = 42` 就好，索引沒有用處，計畫是 `SCAN orders`。第一個選項只會找到顧客 42 的訂單，漏掉其他顧客買商品 7 的訂單；`MULTI-INDEX OR` 要兩邊都能用索引搜尋才會出現（替 `product_id` 也建索引後就是）；OR 連接任何欄位都合法，索引只影響速度，不影響能不能執行。',
    },
    {
      id: 'q-measure', prompt: '你想證明替 `orders(product_id)` 建索引讓營收報表變快了。在練習場裡，哪一種做法得到的結論最可靠？',
      options: [
        '建索引前執行一次報表、建索引後再執行一次，比較這兩個時間',
        '重設資料後先執行報表幾次記下時間；單獨執行 `CREATE INDEX`；再執行報表幾次，確認計畫從 `SCAN` 變成 `SEARCH`、結果相同，在同一台電腦上比較',
        '把 `CREATE INDEX …;` 和報表寫在同一次執行裡，拿這次的時間和建索引前比較',
        '把自己量到的時間和同學電腦上量到的時間比較',
      ],
      answer: 1, explanation: '每次執行的時間都有起伏，第一次常常比較慢，所以前後各量幾次、在同一台電腦與同一份資料上比較；同時用計畫確認改變的原因，用結果確認意思沒變。只量一次容易被偶然的快慢誤導；練習場量的是整次執行，和 `CREATE INDEX` 寫在一起時，建索引的時間也算進去，會低估改善；不同電腦的速度本來就不同，比較不出索引的效果。',
    },
  ],
  // F.1c: DB12 reads plans in the SQL playground; the B+ tree explorer belongs to DB11, so no tree examples here.
  queryPlan: { trees: [] },
  sql: {
    dataset: 'sales',
    presets: [
      { label: '讀計畫：顧客 42 的訂單', sql: sql`EXPLAIN QUERY PLAN
SELECT c.name, o.ordered_on
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.id = 42;` },
      { label: '量時間：相關子查詢的營收前五名', sql: sql`SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;` },
      { label: '建立索引（單獨執行一次）', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);` },
      { label: '改寫：JOIN 加 GROUP BY', sql: sql`SELECT p.id, p.name, SUM(o.quantity) * p.price AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
GROUP BY p.id, p.name, p.price
ORDER BY revenue DESC, p.id
LIMIT 5;` },
      { label: '選擇性：各狀態的比例', sql: sql`SELECT status, COUNT(*) AS orders,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS pct
FROM orders
GROUP BY status
ORDER BY orders DESC;` },
      { label: 'ANALYZE 後看統計資訊', sql: sql`ANALYZE;
SELECT tbl, idx, stat
FROM sqlite_stat1
ORDER BY tbl, idx;` },
    ],
    examples: [
      {
        id: 'plan-join', title: '第一個查詢計畫：台中顧客的訂單', dataset: 'sales',
        description: '沒有 orders.customer_id 的索引時，SQLite 掃描整張 orders，對每一筆訂單用主鍵找到顧客，再檢查城市。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT c.name, o.ordered_on
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.city = '台中';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 216, 'SCAN o'],
          [5, 0, 45, 'SEARCH c USING INTEGER PRIMARY KEY (rowid=?)'],
        ] },
      },
      {
        id: 'plan-one-customer', title: '找出瓶頸：為 15 筆訂單掃描 30,000 筆', dataset: 'sales',
        description: '顧客 42 用主鍵一步找到；他的訂單卻要掃描整張 orders 才找得齊。SCAN o 就是瓶頸。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT c.name, o.ordered_on
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.id = 42;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 45, 'SEARCH c USING INTEGER PRIMARY KEY (rowid=?)'],
          [6, 0, 216, 'SCAN o'],
        ] },
      },
      {
        id: 'plan-join-indexed', title: '加上索引，最佳化器換了合併順序', dataset: 'sales',
        description: '同一個台中顧客的查詢。有了 orders(customer_id) 的索引，SQLite 改成掃描 2,000 位顧客，對台中顧客在索引裡搜尋他們的訂單。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT c.name, o.ordered_on
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.city = '台中';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 216, 'SCAN c'],
          [8, 0, 61, 'SEARCH o USING INDEX idx_orders_customer (customer_id=?)'],
        ] },
      },
      {
        id: 'substr-plan', title: '函式包住欄位：索引只能整個掃描', dataset: 'sales',
        description: 'ordered_on 有索引，但條件是 substr(ordered_on, 1, 7)。SQLite 只能讀過全部 30,000 筆索引項目逐一計算。',
        sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
EXPLAIN QUERY PLAN
SELECT COUNT(*)
FROM orders
WHERE substr(ordered_on, 1, 7) = '2025-03';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 212, 'SCAN orders USING COVERING INDEX idx_orders_date'],
        ] },
      },
      {
        id: 'range-plan', title: '改寫成範圍：索引搜尋', dataset: 'sales',
        description: '同一件事寫成 ordered_on 本身的範圍，SQLite 在索引裡找到起點，只讀 3 月的那一段。結果同樣是 1,455 筆。',
        sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
EXPLAIN QUERY PLAN
SELECT COUNT(*)
FROM orders
WHERE ordered_on >= '2025-03-01' AND ordered_on < '2025-04-01';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 152, 'SEARCH orders USING COVERING INDEX idx_orders_date (ordered_on>? AND ordered_on<?)'],
        ] },
      },
      {
        id: 'like-plan', title: 'SQLite 的 LIKE：開頭固定也用不上一般索引', dataset: 'sales',
        description: 'customers.name 有索引，條件是 LIKE \'顧客01%\'。因為 SQLite 的 LIKE 不分大小寫，索引只被整個掃描。改用 GLOB 或範圍就會變成 SEARCH。',
        sql: sql`CREATE INDEX idx_customers_name ON customers(name);
EXPLAIN QUERY PLAN
SELECT id, name
FROM customers
WHERE name LIKE '顧客01%';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [2, 0, 212, 'SCAN customers USING COVERING INDEX idx_customers_name'],
        ] },
      },
      {
        id: 'or-plan', title: 'OR 跨兩個欄位：兩個索引各搜尋一次', dataset: 'sales',
        description: 'customer_id 與 product_id 各有索引，SQLite 用 MULTI-INDEX OR 分別搜尋兩個索引，再合併兩邊的結果。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
EXPLAIN QUERY PLAN
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 42 OR product_id = 7;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 0, 'MULTI-INDEX OR'],
          [5, 4, 0, 'INDEX 1'],
          [11, 5, 61, 'SEARCH orders USING INDEX idx_orders_customer (customer_id=?)'],
          [16, 4, 0, 'INDEX 2'],
          [22, 16, 61, 'SEARCH orders USING INDEX idx_orders_product (product_id=?)'],
        ] },
      },
      {
        id: 'auto-index', title: '巢狀迴圈與自動索引', dataset: 'sales',
        description: 'orders.product_id 沒有索引，SQLite 為這次查詢臨時建立自動索引，並用 Bloom 過濾器先排除一定沒有訂單的商品。外層是 200 項商品。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT p.id, p.name, COUNT(o.id) AS orders
FROM products p
LEFT JOIN orders o ON o.product_id = p.id
GROUP BY p.id;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [7, 0, 216, 'SCAN p'],
          [11, 0, 0, 'BLOOM FILTER ON o (product_id=?)'],
          [20, 0, 53, 'SEARCH o USING AUTOMATIC COVERING INDEX (product_id=?) LEFT-JOIN'],
        ] },
      },
      {
        id: 'selectivity', title: '選擇性：各狀態占全部訂單的比例', dataset: 'sales',
        description: '純量子查詢算出總筆數，每個狀態的筆數除以它得到百分比。shipped 占八成以上，cancelled 只占 5%。',
        sql: sql`SELECT status, COUNT(*) AS orders,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS pct
FROM orders
GROUP BY status
ORDER BY orders DESC;`,
        result: { columns: ['status', 'orders', 'pct'], rows: [
          ['shipped', 24429, 81.4],
          ['pending', 4071, 13.6],
          ['cancelled', 1500, 5],
        ] },
      },
      {
        id: 'stats-before', title: '沒有統計資訊：選了 status 的索引', dataset: 'sales',
        description: '兩個索引都能用。沒有統計資訊時，SQLite 偏好等號條件，選了 status 的索引，要讀 1,500 筆 cancelled 訂單再逐一檢查日期。',
        sql: sql`CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(ordered_on);
EXPLAIN QUERY PLAN
SELECT id, customer_id, quantity
FROM orders
WHERE status = 'cancelled'
  AND ordered_on BETWEEN '2025-03-01' AND '2025-03-02';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 62, 'SEARCH orders USING INDEX idx_orders_status (status=?)'],
        ] },
      },
      {
        id: 'stats-after', title: 'ANALYZE 之後：改選日期的索引', dataset: 'sales',
        description: '同樣的索引與查詢，只多了 ANALYZE。SQLite 知道同一個狀態平均有 10,000 筆、同一天平均 47 筆，改用日期索引只讀兩天的 94 筆。',
        sql: sql`CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(ordered_on);
ANALYZE;
EXPLAIN QUERY PLAN
SELECT id, customer_id, quantity
FROM orders
WHERE status = 'cancelled'
  AND ordered_on BETWEEN '2025-03-01' AND '2025-03-02';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 112, 'SEARCH orders USING INDEX idx_orders_date (ordered_on>? AND ordered_on<?)'],
        ] },
      },
      {
        id: 'stat1', title: 'ANALYZE 寫下的統計資訊', dataset: 'sales',
        description: 'sqlite_stat1 每個索引一列：表的列數，以及索引欄位值相同時平均的列數。沒有索引的表只記列數（idx 是 NULL）。',
        sql: sql`CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(ordered_on);
ANALYZE;
SELECT tbl, idx, stat
FROM sqlite_stat1
ORDER BY tbl, idx;`,
        result: { columns: ['tbl', 'idx', 'stat'], rows: [
          ['customers', null, '2000'],
          ['orders', 'idx_orders_date', '30000 47'],
          ['orders', 'idx_orders_status', '30000 10000'],
          ['products', null, '200'],
        ] },
      },
      {
        id: 'correlated-plan', title: '相關子查詢：每項商品掃描一次訂單', dataset: 'sales',
        description: 'SCAN o 縮排在 CORRELATED SCALAR SUBQUERY 底下：外層 200 項商品，每一項都把 30,000 筆訂單掃描一遍。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 216, 'SCAN p'],
          [7, 0, 0, 'CORRELATED SCALAR SUBQUERY 1'],
          [12, 7, 216, 'SCAN o'],
          [36, 0, 0, 'USE TEMP B-TREE FOR ORDER BY'],
        ] },
      },
      {
        id: 'group-join-plan', title: '改寫成 JOIN 加 GROUP BY：訂單只讀一次', dataset: 'sales',
        description: '掃描一次 orders，每筆用主鍵找到商品，依商品分組累加，最後排序。只剩一個全表掃描。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT p.id, p.name, SUM(o.quantity) * p.price AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
GROUP BY p.id, p.name, p.price
ORDER BY revenue DESC, p.id
LIMIT 5;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [9, 0, 216, 'SCAN o'],
          [11, 0, 45, 'SEARCH p USING INTEGER PRIMARY KEY (rowid=?)'],
          [14, 0, 0, 'USE TEMP B-TREE FOR GROUP BY'],
          [63, 0, 0, 'USE TEMP B-TREE FOR ORDER BY'],
        ] },
      },
      {
        id: 'same-result', title: '用 EXCEPT 確認改寫前後結果相同', dataset: 'sales',
        description: 'slow 是相關子查詢版本（只算一次），fast 是 JOIN 加 GROUP BY 版本。兩個方向的差集都是 0 列，兩組結果的列完全相同。',
        sql: sql`WITH slow AS MATERIALIZED (
  SELECT p.id, (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
  FROM products p
),
fast AS (
  SELECT p.id, SUM(o.quantity) * p.price AS revenue
  FROM orders o
  JOIN products p ON p.id = o.product_id
  GROUP BY p.id, p.price
)
SELECT
  (SELECT COUNT(*) FROM (SELECT * FROM slow EXCEPT SELECT * FROM fast)) AS only_slow,
  (SELECT COUNT(*) FROM (SELECT * FROM fast EXCEPT SELECT * FROM slow)) AS only_fast;`,
        result: { columns: ['only_slow', 'only_fast'], rows: [[0, 0]] },
      },
    ],
    exercises: [
      {
        id: 'ex-month-range', title: '改寫日期條件：讓索引搜尋得到',
        statement: '月報的原始查詢（已放在答案框裡）用 `substr(ordered_on, 1, 7) = \'2025-03\'` 篩選 2025 年 3 月的訂單，再依狀態統計。請調校它：可以在 SELECT 之前先寫 `CREATE INDEX …;`（索引名稱自訂），並改寫條件，讓最後一個 SELECT 的查詢計畫沒有任何全部掃描（全表掃描與掃描整個索引都不行，要看到 `SEARCH`）。結果要和原查詢相同：欄位依序為 `status`、`orders`（訂單數）、`qty`（數量總和），依 `status` 由小到大排列。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true, columnNames: true, plan: { maxFullScans: 0 },
        starter: sql`SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE substr(ordered_on, 1, 7) = '2025-03'
GROUP BY status
ORDER BY status;`,
        hints: [
          '先在練習場執行 `EXPLAIN QUERY PLAN` 加上原查詢，再試試只建索引、不改條件：計畫會從 `SCAN orders` 變成 `SEARCH` 嗎？',
          '`substr()` 包住了欄位，索引的順序用不上。日期存成 `YYYY-MM-DD`，3 月就是 `ordered_on` 從 `\'2025-03-01\'`（含）到 `\'2025-04-01\'`（不含）的範圍。',
          '在 SQLite，`ordered_on LIKE \'2025-03%\'` 也用不上一般索引；直接比較欄位值的範圍最可靠，在任何 DBMS 都適用。',
        ],
        solution: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE ordered_on >= '2025-03-01' AND ordered_on < '2025-04-01'
GROUP BY status
ORDER BY status;`,
        alternatives: [
          sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE ordered_on BETWEEN '2025-03-01' AND '2025-03-31'
GROUP BY status
ORDER BY status;`,
          sql`CREATE INDEX idx_orders_month ON orders(ordered_on, status, quantity);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE ordered_on >= '2025-03-01' AND ordered_on < '2025-04-01'
GROUP BY status
ORDER BY status;`,
        ],
        mistakes: [
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE substr(ordered_on, 1, 7) = '2025-03'
GROUP BY status
ORDER BY status;`, why: '只建索引、沒改條件：結果正確，但 `substr()` 包住了欄位，SQLite 不能在索引裡搜尋，計畫仍然是 `SCAN orders`。' },
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE ordered_on LIKE '2025-03%'
GROUP BY status
ORDER BY status;`, why: '結果正確，但 SQLite 的 `LIKE` 預設不分大小寫，一般索引不能拿來搜尋它，計畫仍是 `SCAN orders`。改寫成範圍比較。' },
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT status, COUNT(*) AS orders, SUM(quantity) AS qty
FROM orders
WHERE ordered_on >= '2025-03-01' AND ordered_on <= '2025-04-01'
GROUP BY status
ORDER BY status;`, why: '計畫是索引搜尋，但上界寫成 `<= \'2025-04-01\'`，把 4 月 1 日的訂單也算進來，結果變了。半開區間的上界要用 `<`。' },
        ],
      },
      {
        id: 'ex-or-split', title: '拆開 OR：兩個欄位的條件',
        statement: '商品 58 要召回，客服同時要處理顧客 128 的所有訂單。原始查詢（已放在答案框裡）用 `customer_id = 128 OR product_id = 58`，在 `sales` 上是全表掃描。請加上索引（寫在查詢之前）並視需要改寫，讓最後一個查詢的計畫沒有任何全部掃描。結果欄位依序為 `id`、`customer_id`、`product_id`、`ordered_on`，每筆訂單只出現一次，依 `id` 由小到大排列。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true, columnNames: true, plan: { maxFullScans: 0 },
        starter: sql`SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128 OR product_id = 58
ORDER BY id;`,
        hints: [
          '先只替 `customer_id` 建索引，看計畫：`product_id = 58` 的列可能散在表的任何地方，SQLite 還是得掃一遍。',
          '兩個欄位各建一個索引，SQLite 會用 `MULTI-INDEX OR` 分別搜尋；也可以寫成兩個 SELECT，用 `UNION` 接起來再 `ORDER BY id`。',
          '同一筆訂單可能同時符合兩個條件。`UNION` 與 OR 都只留一份，`UNION ALL` 會留下兩份。',
        ],
        solution: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128 OR product_id = 58
ORDER BY id;`,
        alternatives: [
          sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128
UNION
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE product_id = 58
ORDER BY id;`,
          sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE id IN (
  SELECT id FROM orders WHERE customer_id = 128
  UNION
  SELECT id FROM orders WHERE product_id = 58
)
ORDER BY id;`,
        ],
        mistakes: [
          { sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128 OR product_id = 58
ORDER BY id;`, why: '結果正確，但只有 `customer_id` 有索引：OR 的另一邊仍要全表掃描，SQLite 乾脆整個 `SCAN orders`，這個索引沒有用上。' },
          { sql: sql`CREATE INDEX idx_orders_cp ON orders(customer_id, product_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128 OR product_id = 58
ORDER BY id;`, why: '複合索引依 `customer_id` 排序，`product_id` 只在 `customer_id` 相同時才有順序，`product_id = 58` 沒辦法在裡面搜尋，計畫仍是 `SCAN orders`。兩個條件要各有一個以該欄位開頭的索引。' },
          { sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE customer_id = 128
UNION ALL
SELECT id, customer_id, product_id, ordered_on
FROM orders
WHERE product_id = 58
ORDER BY id;`, why: '計畫沒有全表掃描，但 `UNION ALL` 不去掉重複：顧客 128 買的若正是商品 58，同一筆訂單會出現兩次，結果多出列來。要用 `UNION`。' },
        ],
      },
      {
        id: 'ex-correlated-rewrite', title: '改寫相關子查詢：商品營收前五名',
        statement: '原始查詢（已放在答案框裡）用相關子查詢算出每項商品的營收（訂單數量總和 × `products.price`），取前五名；計畫裡 `CORRELATED SCALAR SUBQUERY` 底下的 `SCAN o` 會為 200 項商品各掃描一次訂單。請改寫成 JOIN 加 GROUP BY，或替 `orders` 建立合適的索引（寫在查詢之前），讓最後一個查詢的計畫中，全部掃描（`SCAN` 開頭、讀整張表或整個索引的步驟）最多只有一個。結果欄位依序為 `id`、`name`、`revenue`，依 `revenue` 由大到小、營收相同時依 `id` 由小到大排列，只取前 5 列。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true, columnNames: true, plan: { maxFullScans: 1 },
        starter: sql`SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;`,
        hints: [
          '先量原查詢的時間，再看計畫：`SCAN p` 讀 200 列，子查詢裡的 `SCAN o` 每次讀 30,000 列，共有兩個 `SCAN`。',
          'JOIN 寫法：`FROM orders o JOIN products p ON p.id = o.product_id`，依商品分組（`GROUP BY p.id, p.name, p.price`），營收是 `SUM(o.quantity) * p.price`。',
          '索引寫法：子查詢的條件是 `o.product_id = p.id`，替這個欄位建索引，子查詢就變成 `SEARCH`。先用 CTE 分組再接 `products` 也可以：計畫裡讀取分組結果的 `SCAN` 讀的是中間結果、不是資料表，不算全部掃描（練習場會把它標成「讀取中間結果」）。',
        ],
        solution: sql`SELECT p.id, p.name, SUM(o.quantity) * p.price AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
GROUP BY p.id, p.name, p.price
ORDER BY revenue DESC, p.id
LIMIT 5;`,
        alternatives: [
          sql`CREATE INDEX idx_orders_product ON orders(product_id);
SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;`,
          sql`CREATE INDEX idx_orders_product_qty ON orders(product_id, quantity);
SELECT p.id, p.name, SUM(o.quantity * p.price) AS revenue
FROM products p
JOIN orders o ON o.product_id = p.id
GROUP BY p.id, p.name
ORDER BY revenue DESC, p.id
LIMIT 5;`,
          sql`WITH t AS (
  SELECT product_id, SUM(quantity) AS q FROM orders GROUP BY product_id
)
SELECT p.id, p.name, t.q * p.price AS revenue
FROM t
JOIN products p ON p.id = t.product_id
ORDER BY revenue DESC, p.id
LIMIT 5;`,
        ],
        mistakes: [
          { sql: sql`SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;`, why: '原封不動：結果正確，但計畫有 `SCAN p` 和子查詢裡的 `SCAN o` 兩個全表掃描，而且後者對每項商品各執行一次。' },
          { sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
SELECT p.id, p.name,
  (SELECT SUM(o.quantity) FROM orders o WHERE o.product_id = p.id) * p.price AS revenue
FROM products p
ORDER BY revenue DESC, p.id
LIMIT 5;`, why: '索引建錯欄位：子查詢的條件是 `product_id`，`customer_id` 的索引幫不上忙，子查詢仍是 `SCAN o`。先看計畫裡被掃描的是哪一步、條件用到哪個欄位，再決定索引。' },
          { sql: sql`SELECT p.id, p.name, COUNT(*) * p.price AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
GROUP BY p.id, p.name, p.price
ORDER BY revenue DESC, p.id
LIMIT 5;`, why: '計畫只有一個掃描，但 `COUNT(*)` 數的是訂單筆數，不是數量總和；每筆訂單的 `quantity` 不一定是 1，營收與名次都變了。調校不能改變結果。' },
        ],
      },
    ],
  },
};
