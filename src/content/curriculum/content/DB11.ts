import type { LessonContent } from '../schema';

const sql = String.raw;

/**
 * DB11 Indexes and B+ Trees. SQL lesson with the query-plan activity (Phase F.1c): SQL examples and exercises run in
 * tests/curriculum-sql.test.ts; the B+ tree examples are built by src/lib/bplus/tree.ts.
 */
export const DB11: LessonContent = {
  lessonId: 'DB11',
  motivation: '到目前為止，你寫的查詢都在幾十列的小表上執行，結果一按就出來。真正的系統動輒幾萬、幾百萬列：本課的 `sales` 資料有 30,000 筆訂單，而且除了主鍵沒有任何索引，所以「查顧客 42 的訂單」這種最普通的查詢，資料庫也只能把 30,000 筆從頭讀到尾。索引（index）就是為了這件事：它是另外存放、依某些欄位排好序的一棵樹，讓 DBMS 像查字典一樣從根往下走幾步就找到資料，不必翻遍整張表。本課先用 `EXPLAIN QUERY PLAN` 親眼看到「全表掃描」變成「索引搜尋」；再從你在 D14 學過的二元搜尋樹出發，用互動的 B+ 樹看懂節點為什麼要有很多分支、插入時怎麼分裂、範圍查詢為什麼只要沿著葉節點走；接著比較只會回答「等於」的雜湊索引。最後回到實務：依查詢條件設計單欄與複合索引，說出欄位順序為什麼重要、哪些寫法會讓索引用不上，以及每多一個索引，每次寫入就多一份工作。學完之後，你能替一組常用查詢挑出合適的索引，並說明哪些查詢用得到、哪些用不到。',
  sections: [
    {
      id: 'full-table-scan', title: '沒有索引：只能一筆一筆找',
      blocks: [
        { type: 'p', text: '本課的練習場是 `sales`：2,000 位顧客、200 項商品、30,000 筆訂單（`orders`）。`orders.customer_id` 是參照顧客的外鍵，但外鍵只負責參考完整性（DB07），不會讓查詢變快。要找顧客 42 的訂單，DBMS 沒有任何捷徑，只能讀過每一列、逐一檢查 `customer_id = 42`，這叫全表掃描（full table scan），和 A03 的線性搜尋一樣是 O(n)。' },
        { type: 'p', text: '想知道 DBMS 打算怎麼執行一個查詢，在 SQLite 裡把 `EXPLAIN QUERY PLAN` 寫在查詢前面：它不執行查詢，只列出查詢計畫（query plan）。結果有四欄：`id` 與 `parent` 表示步驟之間的上下層關係，`notused` 是 SQLite 內部使用的數字，可以忽略，`detail` 才是重點。練習場會把每一步標成「全表掃描」「掃描整個索引」「索引搜尋」或「額外排序」。' },
        { type: 'example', id: 'plan-full-scan' },
        { type: 'p', text: '`SCAN orders` 就是全表掃描。替 `customer_id` 建立索引的語法是 `CREATE INDEX 索引名稱 ON 表名(欄位);`，名稱自己取，習慣上寫出表與欄位，例如 `idx_orders_customer`。建好之後，同一個查詢的計畫就變了：' },
        { type: 'example', id: 'plan-index-search' },
        { type: 'p', text: '`SEARCH orders USING INDEX idx_orders_customer (customer_id=?)` 表示用索引搜尋：括號裡是拿來搜尋的條件，`?` 代表查詢中的值。查詢的寫法和結果完全沒變，變的只有 DBMS 找資料的方法；這正是 DB01 說的資料獨立性，加減索引不必改任何一個查詢。刪除索引用 `DROP INDEX 索引名稱;`。' },
        { type: 'callout', tone: 'tip', title: '練習場會記住你建的索引', text: '和 DB07 一樣，練習場的修改會留下來，包括索引。同一個 `CREATE INDEX` 執行第二次會得到 `index idx_orders_customer already exists`；重跑範例之前先按「重設資料」，或改寫成 `CREATE INDEX IF NOT EXISTS …`。想知道目前有哪些索引，執行 `SELECT name, tbl_name, sql FROM sqlite_schema WHERE type = \'index\';`。' },
        { type: 'p', text: '索引裡存的是什麼？SQLite 的每張表（特別宣告為 `WITHOUT ROWID` 的表除外）本身就是一棵依 rowid（DB07 的內部列編號，`INTEGER PRIMARY KEY` 就是它）排序的 B 樹，每一列的資料放在這棵樹裡；每個索引則是另一棵 B 樹，每筆項目是「索引欄位的值，加上那一列的 rowid」，依欄位值排序。排好序才能快速定位，就像 A04 的二分搜尋需要排序好的陣列；用樹而不是陣列存放，是為了新增資料時不必搬動後面所有的項目。`pragma_index_xinfo` 是 SQLite 的函式，列出索引項目的組成：' },
        { type: 'example', id: 'index-entries' },
        { type: 'p', text: '第二列 `cid` 是 −1、沒有名稱，就是附在每個項目後面的 rowid（`key` 是 0，表示它不是你指定的索引欄位）。所以索引搜尋分兩步：先在索引樹裡找到 `customer_id = 42` 的 15 個項目，拿到 15 個 rowid；再到資料表那棵樹，依 rowid 逐一取出整列。查詢主鍵本身（`WHERE id = 42`）則直接搜尋資料表，計畫是 `SEARCH orders USING INTEGER PRIMARY KEY (rowid=?)`。' },
        { type: 'callout', tone: 'note', title: '標準 SQL 與各家 DBMS', text: '標準 SQL 沒有定義索引，也沒有定義 `EXPLAIN`：它們屬於各家 DBMS 的實作。不過 `CREATE INDEX 名稱 ON 表 (欄位, …)` 的寫法在 SQLite、PostgreSQL、MySQL、SQL Server 都通用。查詢計畫的格式就各不相同：PostgreSQL 的 `EXPLAIN` 把全表掃描叫 `Seq Scan`、索引搜尋叫 `Index Scan`；本課的計畫一律是 SQLite 3.49 的 `EXPLAIN QUERY PLAN` 輸出。' },
        { type: 'callout', tone: 'tip', title: '自己量時間', text: '練習場每次執行都會顯示 SQLite 花了幾毫秒。預設查詢「量測：沒有索引（看執行時間）」與「量測：有索引（看執行時間）」執行同一個子查詢 200 次（每項商品一次），差別只在 `orders(product_id)` 有沒有索引。先後執行兩者，比較時間：有索引時快很多。實際的毫秒數取決於你的電腦、瀏覽器與當下的負載，每次都會略有不同，所以本課不寫具體數字；請比較相對差距，並多量幾次。' },
      ],
    },
    {
      id: 'bst-to-bplus', title: '從 BST 到 B+ 樹：每個節點有很多分支',
      blocks: [
        { type: 'p', text: 'D14 的平衡二元搜尋樹已經能在 O(log n) 內找到一個鍵，為什麼資料庫不用它？因為資料庫的資料存在磁碟（或 SSD）上，以固定大小的頁面（page）為單位讀寫；SQLite 預設一頁 4096 位元組。從磁碟讀一頁比在記憶體裡比較幾個數字慢得多，所以要算的是「讀了幾頁」。平衡的 BST 每個節點只有一個鍵、兩個分支，100 萬個鍵就有大約 20 層，最壞要讀 20 頁。如果一個節點就是一整頁，裡面放幾百個鍵、分出幾百個分支，樹就變得又矮又胖，三、四層就夠了。這就是 B 樹家族的想法；資料庫索引最常用的是其中的 B+ 樹。' },
        { type: 'p', text: '本課的 B+ 樹規則（也是下方互動練習器的規則）：' },
        { type: 'list', items: [
          '階數 m：每個節點最多 m 個子節點，所以最多 m − 1 個鍵；同一個節點裡的鍵由小到大排列。',
          '內部節點只存分隔鍵，當作路標；所有的鍵（在索引裡就是「鍵 + rowid」）都在葉節點。',
          '分隔鍵的規則是「左邊 < 分隔鍵 ≤ 右邊」：等於分隔鍵的鍵在右邊的子樹。',
          '葉節點依鍵的順序串成一條鏈，每個葉節點指向下一個，範圍查詢就沿著這條鏈走。',
          '所有葉節點都在同一層；除了根以外，每個節點至少大約半滿。',
        ] },
        { type: 'callout', tone: 'note', title: '「階數」的定義不只一種', text: '不同教科書對 B 樹與 B+ 樹的「階數」定義不同：有的指最多幾個子節點（本課與練習器採用這個），有的指最少幾個鍵。看到題目時先確認它用哪一種，結論（樹高與分支數的關係）都一樣。' },
        { type: 'p', text: '插入時先像搜尋一樣走到該放的葉節點，放進去並保持排序。葉節點超過 m − 1 個鍵就分裂：左邊留前 ⌈鍵數/2⌉ 個，其餘放到新的右葉節點，再把右葉節點的第一個鍵「複製」一份上去，當作父節點的新分隔鍵。這個鍵仍然留在葉節點裡，因為資料只在葉節點。如果父節點因此也超過上限，內部節點分裂：中間的鍵「移」上去（不留在原處），兩邊各成一個節點。根分裂時，上面長出一個新根，樹高加 1。下面是階數 4（每個節點最多 3 個鍵）的 B+ 樹，依序插入 12 個鍵：' },
        { type: 'example', id: 'bplus-build' },
        { type: 'table', head: ['插入', '發生什麼事', '插入後'], rows: [
          ['15、40、25', '都放進同一個葉節點，保持排序', '葉 [15, 25, 40]，已經滿了'],
          ['60', '葉節點變成 4 個鍵，超過上限：分裂成 [15, 25] 與 [40, 60]，40 複製上去，成為新的根', '根 [40]，高度 2'],
          ['5', '5 < 40，走左邊', '左葉 [5, 15, 25]'],
          ['35', '35 < 40，左葉變成 [5, 15, 25, 35] 而分裂：[5, 15] 與 [25, 35]，25 複製到根', '根 [25, 40]'],
          ['50、70', '右葉 [40, 50, 60] 再放 70 就分裂：[40, 50] 與 [60, 70]，60 複製到根', '根 [25, 40, 60]，已經滿了'],
          ['45、20、30', '各自放進還有空位的葉節點，沒有分裂', '葉 [5, 15, 20]、[25, 30, 35]、[40, 45, 50]、[60, 70]'],
          ['10', '葉 [5, 10, 15, 20] 分裂成 [5, 10] 與 [15, 20]，15 複製到根；根變成 [15, 25, 40, 60] 也超過上限，內部節點分裂：中間的 40 移上去成為新根，兩邊是 [15, 25] 與 [60]', '根 [40]，高度 3'],
        ] },
        { type: 'p', text: '在練習器裡把鍵刪到只剩前幾個再「重新建樹」，就能一步一步看到上表的每次分裂。注意樹只會從根長高：分裂向上傳遞，新的一層永遠長在最上面，所以所有葉節點一定在同一層。這和 D14 的普通 BST 很不一樣：依大小順序插入時，BST 會退化成一條鏈，B+ 樹卻依然平衡：' },
        { type: 'example', id: 'bplus-sorted' },
        { type: 'callout', tone: 'note', title: '真實系統裡的樹', text: '本課的 B+ 樹是教學模型。PostgreSQL 與 MySQL（InnoDB）的一般索引是 B+ 樹的變形，同一層的頁面互相鏈結。SQLite 的資料表樹把資料都放在葉節點，和 B+ 樹相同；它的索引樹則在內部節點也存放完整的索引項目，讀下一個項目時沿著樹走，而不是靠葉節點之間的鏈結。各家的細節不同，但「依鍵排序、每個節點分支很多、樹很矮」的道理都一樣，所以點查詢與範圍查詢的效果也相同。' },
      ],
    },
    {
      id: 'search-and-range', title: '點查詢、範圍查詢與樹高',
      blocks: [
        { type: 'p', text: '找一個鍵（點查詢）時，從根開始，在每個內部節點依「左邊 < 分隔鍵 ≤ 右邊」選一個子節點往下走，一路走到葉節點，再看葉節點裡有沒有這個鍵。內部節點裡出現的鍵只是路標，看到了也不能停，一定要走到葉節點。不論找哪個鍵、找不找得到，經過的節點數都等於樹高：' },
        { type: 'example', id: 'bplus-search' },
        { type: 'p', text: '把要找的鍵改成 42 再搜尋：經過同樣的三個節點，走到葉 [40, 45, 50] 沒看到 42，就能確定它不存在，不必再看其他節點。' },
        { type: 'p', text: '範圍查詢（例如 `BETWEEN 22 AND 48`）是 B+ 樹真正的強項：先像點查詢一樣找到下限 22 該在的葉節點，然後沿著葉節點鏈往右走，收集範圍內的鍵，直到遇到比上限 48 大的鍵就停。中間不必回到根，而且鍵已經依序排好：' },
        { type: 'example', id: 'bplus-range' },
        { type: 'p', text: '同樣的事發生在 SQLite 裡。替 `ordered_on` 建立索引之後，查一週的訂單並依日期排序，計畫是一次索引搜尋，而且沒有額外排序：沿著索引讀出來的項目本來就依日期排好了。' },
        { type: 'example', id: 'range-plan' },
        { type: 'p', text: '計畫中的 `(ordered_on>? AND ordered_on<?)` 只表示「用一個下限和一個上限在索引裡搜尋」；`BETWEEN` 包含兩端的語意並沒有改變，3 月 1 日與 3 月 7 日的訂單都會被找到。' },
        { type: 'p', text: '樹高決定點查詢要讀幾個節點，而分支越多，樹越矮。下面兩棵樹存的是同樣的 40 個鍵、同樣的插入順序，只有階數不同：' },
        { type: 'example', id: 'bplus-order3' },
        { type: 'example', id: 'bplus-order6' },
        { type: 'p', text: '階數 3 的樹有 5 層、59 個節點；階數 6 的只有 3 層、13 個節點。一般地說，高度 h、階數 m 的 B+ 樹最多能放 m^(h−1) × (m − 1) 個鍵（每個節點都滿的時候），所以能放的鍵數隨高度呈指數成長：' },
        { type: 'table', head: ['高度（層數）', 'm = 4（每個節點最多 3 個鍵）', 'm = 200（每個節點最多 199 個鍵）'], rows: [
          ['1', '3', '199'],
          ['2', '12', '39,800'],
          ['3', '48', '7,960,000'],
          ['4', '192', '1,592,000,000'],
        ] },
        { type: 'p', text: '實際的索引頁面能放幾個項目，取決於索引欄位有多大。在練習場替 `orders(customer_id)` 建立索引，資料庫會多出 74 頁（見最後一節的範例）：30,000 個項目平均每頁大約 400 個。直接檢查資料庫檔案的結構，這個索引正好兩層：一個根頁面，下面 73 個葉頁面。相比之下，全表掃描要讀過 `orders` 的每一頁。' },
      ],
    },
    {
      id: 'hash-index', title: '雜湊索引：只會回答「等於」',
      blocks: [
        { type: 'p', text: 'D10 的雜湊表也能當索引：用雜湊函式把鍵算成桶子的編號，等值查詢平均 O(1)，不必一層一層往下走。代價是雜湊函式會把鍵打散：`2025-03-01` 和 `2025-03-02` 可能落在相距很遠的桶子，鍵之間的大小順序完全消失。所以雜湊索引只能回答「等於」：' },
        { type: 'table', head: ['查詢條件', 'B+ 樹索引', '雜湊索引'], rows: [
          ['`col = 值`、`col IN (…)`', '可以：O(log n)，走一條根到葉的路徑', '可以：平均 O(1)'],
          ['`col BETWEEN a AND b`、`col > a`', '可以：找到下限後沿著葉節點鏈走', '不行：範圍內的鍵散在各個桶子'],
          ['`ORDER BY col`、`MIN(col)`、`MAX(col)`', '可以：葉節點本來就排好序', '不行：沒有順序'],
          ['前綴查詢（`col` 開頭是某段文字）', '可以改寫成範圍查詢', '不行'],
          ['複合索引只給最左欄（下一節）', '可以', '不行：雜湊的是整組欄位的值'],
        ] },
        { type: 'p', text: '各家 DBMS 的支援不同。SQLite 只有 B 樹索引，沒有雜湊索引。PostgreSQL 預設的索引是 B 樹，也可以寫 `CREATE INDEX … USING HASH (欄位)` 建立雜湊索引，而它只支援 `=` 比較。MySQL 的 MEMORY 儲存引擎預設用雜湊索引，常用的 InnoDB 引擎的索引則是 B+ 樹。' },
        { type: 'callout', tone: 'tip', title: '預設就選 B 樹', text: '一個欄位只要可能用到範圍、排序或前綴條件，雜湊索引就幫不上忙；而 B 樹索引在等值查詢上也只多走幾層。所以 B 樹是各家 DBMS 的預設，也是本課其餘部分的主角。只有確定某個欄位永遠只做等值比較時，才值得考慮雜湊索引。' },
      ],
    },
    {
      id: 'single-column', title: '單欄索引：哪些查詢用得上',
      blocks: [
        { type: 'p', text: '一個欄位 `col` 上的 B 樹索引，對下列條件有用：`col = 值`、`col IN (…)`、`col > 值`、`col BETWEEN a AND b` 等範圍、`ORDER BY col`、`MIN(col)` 與 `MAX(col)`，以及在 `JOIN … ON 另一表.欄 = col` 時，替另一張表的每一列找配對。共同點是：條件直接拿欄位本身去比較，DBMS 才能在排好序的索引裡定位。' },
        { type: 'p', text: '反過來，凡是先對欄位做運算再比較的條件，索引都用不上，因為索引存的是欄位原本的值，不是運算後的值：' },
        { type: 'example', id: 'function-hides-index' },
        { type: 'p', text: '`substr(ordered_on, 1, 7)` 把日期切成年月，SQLite 不知道切完的結果在索引的哪裡，只好讀過每個項目、逐一計算。計畫是 `SCAN orders USING COVERING INDEX`，練習場標成「掃描整個索引」：它比讀整張表省一點（索引比資料表小），但仍然是 30,000 個項目全部看過，不是搜尋。改寫成直接比較欄位的範圍，就又變回索引搜尋：`WHERE ordered_on >= \'2025-03-01\' AND ordered_on < \'2025-04-01\'`。' },
        { type: 'table', head: ['`SELECT COUNT(*) FROM orders WHERE …` 的條件（`ordered_on` 與 `customer_id` 各有索引）', '計畫', '原因'], rows: [
          ['`ordered_on >= \'2025-03-01\' AND ordered_on < \'2025-04-01\'`', '索引搜尋', '直接比較欄位的範圍'],
          ['`substr(ordered_on, 1, 7) = \'2025-03\'`', '掃描整個索引', '函式包住了欄位'],
          ['`customer_id + 0 = 7`', '掃描整個索引', '欄位做了運算，即使結果不變'],
          ['`ordered_on LIKE \'%-03-01\'`', '掃描整個索引', '開頭是萬用字元，不知道從哪裡開始找'],
          ['`ordered_on LIKE \'2025-03%\'`', '掃描整個索引（SQLite 預設）', '見下方說明'],
          ['`customer_id = 7 OR product_id = 15`', '全表掃描', '`product_id` 沒有索引，符合 `product_id = 15` 的列只能逐列找'],
        ] },
        { type: 'callout', tone: 'note', title: 'SQLite 的 LIKE 與 GLOB', text: '在 SQLite 預設設定下，`LIKE` 不分英文大小寫，而一般索引是依區分大小寫的順序排的，所以連 `LIKE \'2025-03%\'` 這種前綴條件也用不上一般索引；`GLOB \'2025-03*\'` 區分大小寫，就能用索引搜尋，索引宣告成 `COLLATE NOCASE` 時 `LIKE` 也可以。這些是 SQLite 自己的規則；其他 DBMS 能不能用索引處理前綴 `LIKE`，也各有條件。最可靠的寫法是改成範圍比較。至於 `OR`：如果兩個欄位都有索引，SQLite 可以分別搜尋再合併，計畫會顯示 `MULTI-INDEX OR`。' },
        { type: 'p', text: '索引還有一個好處：如果查詢需要的欄位全部都在索引項目裡，DBMS 只讀索引就能回答，完全不必回資料表取列。這樣的索引對這個查詢叫做覆蓋索引（covering index），SQLite 在計畫中寫 `USING COVERING INDEX`：' },
        { type: 'example', id: 'covering-count' },
        { type: 'p', text: '`COUNT(*)` 只需要數出 `customer_id = 42` 的項目有幾個，索引項目就夠了。同樣的索引，`SELECT *` 就不是覆蓋索引：還要拿 rowid 回資料表取出每一列的其他欄位，所以計畫只寫 `USING INDEX`。別忘了每個索引項目都帶著 rowid，所以 `SELECT id, customer_id FROM orders WHERE customer_id = 42` 也能被這個單欄索引覆蓋。' },
      ],
    },
    {
      id: 'composite-index', title: '複合索引與欄位順序',
      blocks: [
        { type: 'p', text: '索引可以包含好幾個欄位，例如 `CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);`。這個複合索引（composite index）的項目先依 `customer_id` 排序，`customer_id` 相同的再依 `ordered_on` 排序，就像電話簿先依姓、同姓再依名字排列。用電話簿找「姓陳的人」或「陳大文」都很快；但要找「名字叫大文的人」，因為他們散落在每個姓氏底下，只能整本翻過。複合索引也一樣：條件必須從最左邊的欄位開始用起，這叫最左前綴（leftmost prefix）規則。' },
        { type: 'p', text: '先看只有單欄索引 `orders(customer_id)` 時，「顧客 42 的訂單依日期排序」的計畫：' },
        { type: 'example', id: 'temp-sort' },
        { type: 'p', text: '索引找到了顧客 42 的 15 筆訂單，但它們在索引裡依 rowid 排列，不是依日期，所以 SQLite 還要把它們放進一棵暫存的 B 樹排序一次：`USE TEMP B-TREE FOR ORDER BY`，練習場標成「額外排序」。換成複合索引，同一位顧客的項目在索引裡已經依日期排好，排序這一步就消失了：' },
        { type: 'example', id: 'composite-order' },
        { type: 'p', text: '`ORDER BY ordered_on DESC` 也一樣不必排序：沿著同一段索引反方向讀就好。可是同一個複合索引，遇到沒有給 `customer_id` 的條件就用不上：' },
        { type: 'example', id: 'composite-not-used' },
        { type: 'p', text: '下表整理 `orders(customer_id, ordered_on)` 這個索引對各種查詢的效果（全部在練習場驗證過，可以自己執行 `EXPLAIN QUERY PLAN` 確認）：' },
        { type: 'table', head: ['WHERE／ORDER BY', '計畫', '說明'], rows: [
          ['`customer_id = 42`', '`SEARCH … (customer_id=?)`', '用到最左欄'],
          ['`customer_id = 42 AND ordered_on >= \'2026-01-01\'`', '`SEARCH … (customer_id=? AND ordered_on>?)`', '兩欄都用來搜尋'],
          ['`ordered_on = \'2026-09-01\' AND customer_id = 42`', '`SEARCH … (customer_id=? AND ordered_on=?)`', '條件在 `WHERE` 裡寫的先後無關'],
          ['`customer_id = 42 ORDER BY ordered_on`', '`SEARCH … (customer_id=?)`，沒有額外排序', '同一位顧客的項目已依日期排好'],
          ['`customer_id = 42 AND quantity = 5`', '`SEARCH … (customer_id=?)`', '`quantity` 不在索引裡，找到的列再逐一檢查'],
          ['`customer_id > 1990 ORDER BY ordered_on`', '`SEARCH … (customer_id>?)` 加上額外排序', '第一欄是範圍時，跨了好幾位顧客，日期就不再整體有序'],
          ['`ordered_on >= \'2026-09-01\'`', '`SCAN orders`', '缺了最左欄 `customer_id`'],
        ] },
        { type: 'p', text: '由此得到設計複合索引的順序原則：一、把用 `=`（或 `IN`）比較的欄位放前面；二、接著放用範圍比較或要 `ORDER BY` 的欄位；三、範圍條件之後的欄位不能再拿來搜尋。例如索引 `orders(ordered_on, customer_id)` 碰上 `WHERE customer_id = 42 AND ordered_on >= \'2026-01-01\'`，計畫是 `SEARCH … (ordered_on>?)`：只用日期範圍搜尋，然後在 2026 年以後的每個項目裡逐一檢查顧客編號，比 `(customer_id, ordered_on)` 多看了很多項目。另外，有了 `(customer_id, ordered_on)`，單欄的 `(customer_id)` 就是多餘的：凡是它能做的，複合索引的最左欄都能做。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的 skip-scan', text: '最左前綴規則有一個例外：SQLite 在執行過 `ANALYZE`（收集統計資訊，DB12 會介紹）之後，如果發現最左欄只有很少幾種值，可能改用 skip-scan，把最左欄的每一種值各搜尋一次，計畫會顯示 `ANY(欄位)`。例如在 `orders(status, ordered_on)` 上執行 `ANALYZE` 之後，`WHERE ordered_on = \'2025-03-01\'` 的計畫是 `SEARCH orders USING INDEX … (ANY(status) AND ordered_on=?)`。沒有統計資訊時（練習場的預設狀態），SQLite 不會這麼做。設計索引時不要依賴它。' },
      ],
    },
    {
      id: 'write-cost', title: '索引的代價：寫入成本與空間',
      blocks: [
        { type: 'p', text: '索引不是免費的。DBMS 必須讓每個索引隨時和資料表一致，所以每次寫入，都要連索引一起改：' },
        { type: 'list', items: [
          '`INSERT` 一列：除了寫入資料表，還要在每一個索引裡插入一個項目，可能引起節點分裂。',
          '`DELETE` 一列：每一個索引裡的對應項目都要刪除。',
          '`UPDATE`：被修改的欄位出現在哪些索引裡，那些索引就要刪掉舊項目、插入新項目；沒有用到這些欄位的索引不受影響。',
        ] },
        { type: 'p', text: '這一切都是 DBMS 自動做的，你不必（也不能）手動更新索引。下面先建索引再新增一筆訂單，最後的 `COUNT(*)` 是用覆蓋索引算出來的（就像上一節的範例），完全沒有讀資料表，數字卻已經包含新的那一筆：' },
        { type: 'example', id: 'index-maintained' },
        { type: 'p', text: '想親眼看見寫入成本，可以執行預設查詢「寫入成本：EXPLAIN INSERT」。`EXPLAIN`（後面沒有 `QUERY PLAN`）是 SQLite 列出內部虛擬機器指令的指令，敘述本身不會被執行；其中每個 `IdxInsert` 是寫入一個索引，`Insert` 是寫入資料表。`orders` 有兩個索引時，一筆 `INSERT` 有兩個 `IdxInsert`；每多建一個索引，就多一個。索引也要占空間，每個索引都是一棵完整的樹：' },
        { type: 'example', id: 'index-size' },
        { type: 'p', text: '原本 272 頁的資料庫，一個整數欄位的索引多了 74 頁，`(status, ordered_on)` 這個兩個文字欄位的索引又多了 194 頁，相當於原本整個資料庫的七成。練習場的資料庫上限是 2,048 頁（8 MB），在 `orders` 上建十幾個索引就可能超過，所以練習時記得用 `DROP INDEX` 或「重設資料」清掉不用的索引。' },
        { type: 'p', text: '因此索引要挑著建。替一組常用查詢設計索引時，依序問自己：' },
        { type: 'list', ordered: true, items: [
          '這個查詢經常執行嗎？資料表大到全表掃描真的慢嗎？幾十列的小表不需要索引。',
          '`WHERE`、`JOIN … ON` 與 `ORDER BY` 用到哪些欄位？用 `=` 比較的欄位放前面，範圍或排序的欄位放後面。',
          '能不能讓一個複合索引同時服務好幾個查詢（最左前綴），而不是每個查詢各建一個？已經被複合索引的最左欄涵蓋的單欄索引，可以刪掉。',
          '條件有沒有把欄位包在函式或運算裡？先改寫查詢，否則建了索引也用不上。',
          '建好之後，用 `EXPLAIN QUERY PLAN` 確認計畫真的變成 `SEARCH`，再實際量一次時間。',
          '這張表寫入很頻繁嗎？每個索引都會讓每一次 `INSERT`、`DELETE` 多一份工作。',
        ] },
        { type: 'callout', tone: 'note', title: '自動建立的索引與外鍵', text: '`PRIMARY KEY` 與 `UNIQUE` 約束需要快速檢查重複，SQLite 與 PostgreSQL 都會自動替它們建立索引；SQLite 把它命名為 `sqlite_autoindex_表名_1` 這類名稱，可以在 `sqlite_schema` 裡看到。例外是 SQLite 的 `INTEGER PRIMARY KEY`：它就是 rowid，資料表本身已依它排序，不需要另外的索引。外鍵欄位則不會自動有索引（SQLite 與 PostgreSQL 都是；MySQL 的 InnoDB 會自動替外鍵建立索引）。所以 `sales` 的 `orders.customer_id` 沒有索引時，`customers` 與 `orders` 的 `JOIN` 只能掃描整個 `orders`；外鍵欄位常常是最值得建索引的欄位。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-leaf-split', prompt: '一棵階數 4 的 B+ 樹（每個節點最多 3 個鍵，分裂規則和本課的練習器相同），從空樹開始依序插入 10、20、30、40。插入完成後，樹長什麼樣子？',
      options: [
        '只有一個葉節點：[10, 20, 30, 40]',
        '根是 [30]；葉節點 [10, 20] → [30, 40]',
        '根是 [30]；葉節點 [10, 20] → [40]',
        '根是 [20]；葉節點 [10] → [20, 30, 40]',
      ],
      answer: 1, explanation: '插入 40 時葉節點有 4 個鍵，超過上限 3，於是分裂：左邊留前 ⌈4/2⌉ = 2 個 [10, 20]，其餘 [30, 40] 成為新的右葉節點，右葉節點的第一個鍵 30 複製上去，成為新的根。「只有一個葉節點」忘了每個節點最多 3 個鍵。「葉節點 [40]」把 30 從葉節點移走了，那是內部節點分裂的做法；葉節點分裂時鍵一定要留在葉節點，因為資料只在葉節點。「根是 [20]」不符合本課的規則：左邊應該保留 2 個鍵，分隔鍵是右葉節點的第一個鍵。',
    },
    {
      id: 'q-separator', prompt: 'B+ 樹的一個內部節點存著分隔鍵 25、40、60，有 4 個子節點（由左到右第 1 到第 4 個）。規則是「左邊 < 分隔鍵 ≤ 右邊」。要找鍵 40，下一步怎麼做？',
      options: [
        '走第 2 個子節點（25 到 40 之間）',
        '在這個內部節點就找到了 40，搜尋結束',
        '走第 3 個子節點（40 到 60 之間）',
        '走第 4 個子節點（60 以上）',
      ],
      answer: 2, explanation: '等於分隔鍵的鍵在右邊的子樹：40 ≥ 40 而且 40 < 60，所以走第 3 個子節點，一路走到葉節點才找得到它。B+ 樹的內部節點只存分隔鍵當路標，資料（索引裡的 rowid）只在葉節點，所以在內部節點看到 40 也不能停。第 2 個子節點只放 25 ≤ 鍵 < 40 的鍵，那是把規則記反成「左邊 ≤」；第 4 個子節點放的是 60 以上的鍵。',
    },
    {
      id: 'q-hash-index', prompt: 'PostgreSQL 可以建立雜湊索引：`CREATE INDEX ON orders USING HASH (ordered_on);`。假設這是 `ordered_on` 上唯一的索引，下列哪個條件可能用到它？',
      options: [
        '`WHERE ordered_on = \'2025-03-01\'`',
        '`WHERE ordered_on BETWEEN \'2025-03-01\' AND \'2025-03-31\'`',
        '`ORDER BY ordered_on DESC LIMIT 10`',
        '`WHERE ordered_on LIKE \'2025-03%\'`',
      ],
      answer: 0, explanation: '雜湊索引把鍵打散到各個桶子，只保留「相等」這件事，PostgreSQL 的雜湊索引也只支援 `=` 比較，所以只有等值條件可能用到它。`BETWEEN` 範圍內的日期散在不同的桶子；`ORDER BY … LIMIT 10` 需要依大小順序讀出鍵，雜湊沒有順序；`LIKE` 前綴條件本質上也是範圍查詢。這三種都要靠 B 樹索引。',
    },
    {
      id: 'q-leftmost-prefix', prompt: '在 `sales` 上執行下面的 `CREATE INDEX` 之後（`orders` 沒有其他索引），哪一個查詢的計畫仍然是全表掃描 `SCAN orders`？',
      code: { language: 'SQL', text: 'CREATE INDEX idx_oc ON orders(customer_id, ordered_on);' },
      options: [
        '`SELECT * FROM orders WHERE customer_id = 42;`',
        '`SELECT * FROM orders WHERE ordered_on = \'2026-09-01\' AND customer_id = 42;`',
        '`SELECT * FROM orders WHERE customer_id = 42 AND quantity = 5;`',
        '`SELECT * FROM orders WHERE ordered_on >= \'2026-09-01\';`',
      ],
      answer: 3, explanation: '索引先依 `customer_id` 排序，只給 `ordered_on` 的條件沒有用到最左欄，各位顧客的日期散在索引各處，只能全表掃描。條件只要包含最左欄 `customer_id` 的等值比較就能搜尋：`WHERE` 裡先寫 `ordered_on` 並不影響，計畫是 `(customer_id=? AND ordered_on=?)`；多一個不在索引裡的 `quantity = 5` 也沒關係，計畫是 `(customer_id=?)`，找到的 15 列再逐一檢查數量。',
    },
    {
      id: 'q-temp-sort', prompt: '`orders` 目前只有索引 `idx_c ON orders(customer_id)`。下面查詢的計畫有兩行：`SEARCH orders USING INDEX idx_c (customer_id=?)` 與 `USE TEMP B-TREE FOR ORDER BY`。把 `idx_c` 換成哪一個索引，計畫就只剩一行索引搜尋、不必額外排序？',
      code: { language: 'SQL', text: 'SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on;' },
      options: [
        '`CREATE INDEX i ON orders(ordered_on);`',
        '`CREATE INDEX i ON orders(customer_id, ordered_on);`',
        '`CREATE INDEX i ON orders(ordered_on, customer_id);`',
        '保留 `idx_c`，再加上 `CREATE INDEX i ON orders(ordered_on);`',
      ],
      answer: 1, explanation: '`(customer_id, ordered_on)` 讓同一位顧客的項目在索引裡已依日期排好：計畫是 `SEARCH orders USING INDEX i (customer_id=?)`，沒有額外排序。只有 `(ordered_on)` 或 `(ordered_on, customer_id)` 時，計畫是 `SCAN orders USING INDEX i`：依日期順序讀過整個索引、逐一檢查顧客，雖然不必排序，卻是全部掃描。兩個單欄索引並存時，SQLite 在這個查詢只用其中一個來讀 `orders`：它選了 `idx_c`，日期順序仍然要額外排序。',
    },
    {
      id: 'q-tree-height', prompt: '一棵 B+ 樹的每個節點最多 200 個子節點（葉節點最多 199 個鍵），除了根以外每個節點至少半滿。它存了 1,000,000 個鍵。找一個鍵時，從根到葉節點總共經過幾個節點？',
      options: ['3 個', '1 個', '20 個', '大約 5,000 個'],
      answer: 0, explanation: '兩層最多只能放 200 × 199 = 39,800 個鍵，不夠；三層最多 200 × 200 × 199 = 7,960,000 個，夠了。四層也不可能：根至少 2 個子節點、其他節點至少約 100 個子節點、葉節點至少約 100 個鍵，四層至少有 2 × 100 × 100 × 100 = 2,000,000 個鍵，比 1,000,000 多。所以樹高正好是 3。20 是平衡二元搜尋樹或二分搜尋的 log₂(1,000,000)；大約 5,000 是葉節點都裝滿時的葉節點數，也就是沿著葉節點鏈全部讀過（類似全表掃描）的代價；1 個節點放不下這麼多鍵。',
    },
    {
      id: 'q-update-cost', prompt: '在 SQLite 中，`orders` 的資料存在一棵依 rowid 排序的 B 樹裡，另外有三個索引：`(customer_id)`、`(product_id)`、`(status, ordered_on)`。執行下面的 `UPDATE` 時，SQLite 要修改幾棵 B 樹？',
      code: { language: 'SQL', text: 'UPDATE orders SET status = \'shipped\' WHERE id = 100;' },
      options: [
        '1 棵：只有資料表',
        '4 棵：資料表與三個索引',
        '2 棵：資料表與 (status, ordered_on)',
        '1 棵：只有 (status, ordered_on)',
      ],
      answer: 2, explanation: '資料表裡這一列的 `status` 變了，所以資料表要改；`(status, ordered_on)` 的項目依 `status` 排序，舊項目要刪掉、新項目插到新位置。另外兩個索引不含 `status`，項目完全不變（用 `EXPLAIN` 看 SQLite 的指令，只有這一個索引有 `IdxDelete` 與 `IdxInsert`）。「4 棵」是 `INSERT` 或 `DELETE` 一列的情況；「只有資料表」是修改沒有被任何索引用到的欄位（例如 `quantity`）的情況；只改索引不改資料表，資料就不一致了。',
    },
  ],
  sql: {
    dataset: 'sales',
    presets: [
      { label: '全表掃描：查一位顧客的訂單', sql: sql`EXPLAIN QUERY PLAN
SELECT id, product_id, quantity, ordered_on FROM orders WHERE customer_id = 42;
SELECT id, product_id, quantity, ordered_on FROM orders WHERE customer_id = 42 ORDER BY id;` },
      { label: '建立索引後再看一次', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT id, product_id, quantity, ordered_on FROM orders WHERE customer_id = 42;
SELECT id, product_id, quantity, ordered_on FROM orders WHERE customer_id = 42 ORDER BY id;` },
      { label: '量測：沒有索引（看執行時間）', sql: sql`DROP INDEX IF EXISTS idx_orders_product;
SELECT COUNT(*) AS products_over_450
FROM products p
WHERE (SELECT SUM(quantity) FROM orders o WHERE o.product_id = p.id) > 450;` },
      { label: '量測：有索引（看執行時間）', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
SELECT COUNT(*) AS products_over_450
FROM products p
WHERE (SELECT SUM(quantity) FROM orders o WHERE o.product_id = p.id) > 450;` },
      { label: '複合索引：哪些查詢用得到', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id, ordered_on);
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on DESC;
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42 AND ordered_on >= '2026-01-01';
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE ordered_on >= '2026-09-01';` },
      { label: '寫入成本：EXPLAIN INSERT', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
SELECT name, tbl_name FROM sqlite_schema WHERE type = 'index';
EXPLAIN INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on)
VALUES (42, 7, 1, 'pending', '2026-10-03');` },
    ],
    examples: [
      {
        id: 'plan-full-scan', title: '沒有索引：全表掃描', dataset: 'sales',
        description: '`orders` 除了主鍵沒有索引。找顧客 42 的訂單，計畫只有一步：讀過整張表。',
        sql: sql`EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [2, 0, 216, 'SCAN orders'],
        ] },
      },
      {
        id: 'plan-index-search', title: '建立索引之後：索引搜尋', dataset: 'sales',
        description: '同一個查詢，先替 `customer_id` 建立索引。計畫變成用索引搜尋 `customer_id = ?`。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 61, 'SEARCH orders USING INDEX idx_orders_customer (customer_id=?)'],
        ] },
      },
      {
        id: 'index-entries', title: '索引項目：欄位值加上 rowid（SQLite）', dataset: 'sales',
        description: '`pragma_index_xinfo` 列出索引項目的組成：你指定的 `customer_id`，以及 SQLite 自動附上的 rowid（`cid` 為 −1）。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
SELECT seqno, cid, name, key FROM pragma_index_xinfo('idx_orders_customer');`,
        result: { columns: ['seqno', 'cid', 'name', 'key'], rows: [
          [0, 1, 'customer_id', 1],
          [1, -1, null, 0],
        ] },
      },
      {
        id: 'range-plan', title: '範圍查詢：一次搜尋，不必排序', dataset: 'sales',
        description: '`ordered_on` 有索引後，一週內的訂單用下限與上限在索引裡搜尋；依日期排序也不需要額外步驟，因為索引的項目本來就依日期排列。',
        sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
EXPLAIN QUERY PLAN
SELECT id, customer_id, ordered_on
FROM orders
WHERE ordered_on BETWEEN '2025-03-01' AND '2025-03-07'
ORDER BY ordered_on;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 164, 'SEARCH orders USING INDEX idx_orders_date (ordered_on>? AND ordered_on<?)'],
        ] },
      },
      {
        id: 'function-hides-index', title: '函式包住欄位：索引用不上', dataset: 'sales',
        description: '`ordered_on` 有索引，但條件比較的是 `substr(ordered_on, 1, 7)`。SQLite 只能讀過整個索引、逐一計算，沒有搜尋。',
        sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM orders WHERE substr(ordered_on, 1, 7) = '2025-03';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 212, 'SCAN orders USING COVERING INDEX idx_orders_date'],
        ] },
      },
      {
        id: 'covering-count', title: '覆蓋索引：只讀索引就能回答', dataset: 'sales',
        description: '數顧客 42 有幾筆訂單，只需要索引項目，不必回資料表取列，計畫寫 `USING COVERING INDEX`。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM orders WHERE customer_id = 42;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [3, 0, 52, 'SEARCH orders USING COVERING INDEX idx_orders_customer (customer_id=?)'],
        ] },
      },
      {
        id: 'temp-sort', title: '單欄索引加上 ORDER BY：還要額外排序', dataset: 'sales',
        description: '索引找到顧客 42 的訂單，但它們不是依日期排列，所以多了一步暫存 B 樹排序。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 61, 'SEARCH orders USING INDEX idx_orders_customer (customer_id=?)'],
          [18, 0, 0, 'USE TEMP B-TREE FOR ORDER BY'],
        ] },
      },
      {
        id: 'composite-order', title: '複合索引：搜尋與排序一次完成', dataset: 'sales',
        description: '`(customer_id, ordered_on)` 讓同一位顧客的項目依日期排好，計畫只剩一步索引搜尋。',
        sql: sql`CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42 ORDER BY ordered_on;`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [4, 0, 62, 'SEARCH orders USING INDEX idx_orders_customer_date (customer_id=?)'],
        ] },
      },
      {
        id: 'composite-not-used', title: '缺了最左欄：複合索引用不上', dataset: 'sales',
        description: '同一個複合索引，條件只有 `ordered_on`，沒有 `customer_id`。各位顧客的日期散在索引各處，只能全表掃描。',
        sql: sql`CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE ordered_on >= '2026-09-01';`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [2, 0, 216, 'SCAN orders'],
        ] },
      },
      {
        id: 'index-maintained', title: '新增資料時，索引自動跟著更新', dataset: 'sales',
        description: '顧客 42 原本有 15 筆訂單。建好索引後新增一筆，再用（只讀索引的）`COUNT(*)` 數一次。',
        sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on)
VALUES (42, 7, 1, 'pending', '2026-10-03');
SELECT COUNT(*) AS orders_of_42 FROM orders WHERE customer_id = 42;`,
        result: { columns: ['orders_of_42'], rows: [[16]] },
      },
      {
        id: 'index-size', title: '索引要占空間（SQLite 的頁數）', dataset: 'sales',
        description: '`pragma_page_count()` 是 SQLite 回傳資料庫頁數的函式（每頁 4096 位元組）。先把每個階段的頁數記在暫存表裡，最後一起列出。',
        sql: sql`CREATE TEMP TABLE size_log (stage TEXT, pages INTEGER);
INSERT INTO size_log SELECT '沒有索引', page_count FROM pragma_page_count();
CREATE INDEX idx_orders_customer ON orders(customer_id);
INSERT INTO size_log SELECT '加上 (customer_id)', page_count FROM pragma_page_count();
CREATE INDEX idx_orders_status_date ON orders(status, ordered_on);
INSERT INTO size_log SELECT '再加上 (status, ordered_on)', page_count FROM pragma_page_count();
SELECT stage, pages FROM size_log;`,
        result: { columns: ['stage', 'pages'], rows: [
          ['沒有索引', 272],
          ['加上 (customer_id)', 346],
          ['再加上 (status, ordered_on)', 540],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-fk-indexes', title: '替最常查的外鍵欄位建索引',
        statement: '`sales` 的 `orders` 除了主鍵沒有任何索引。網站最常執行兩種查詢：「某位顧客的訂單」（條件 `customer_id = ?`）與「某項商品賣出幾件」（條件 `product_id = ?`）。請寫出 `CREATE INDEX` 敘述（索引名稱自訂，幾個都可以），讓這兩種查詢都改用索引搜尋、不再全表掃描；不要修改或刪除任何資料。檢查時會在你的 SQL 之後，用 `EXPLAIN QUERY PLAN` 檢查下列查詢的計畫（只看有沒有全部掃描，不看索引名稱），並確認訂單筆數沒有改變。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true,
        starter: sql`CREATE INDEX ... ON ...(...);`,
        hints: [
          '一個索引只能幫「條件用到它最左欄」的查詢搜尋。兩種查詢用的是不同的欄位，想想需要幾個索引。',
          '索引要建在 `WHERE` 條件裡的那個欄位上：`orders.customer_id` 與 `orders.product_id`。`customers.id` 與 `products.id` 是主鍵，本來就能直接搜尋。',
          '寫好之後在練習場先執行你的 `CREATE INDEX`，再執行 `EXPLAIN QUERY PLAN SELECT SUM(quantity) FROM orders WHERE product_id = 15;`，計畫應該從 `SCAN orders` 變成 `SEARCH orders USING …`。',
        ],
        solution: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product ON orders(product_id);`,
        alternatives: [
          sql`CREATE INDEX idx_orders_product_qty ON orders(product_id, quantity);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);`,
        ],
        mistakes: [
          { sql: sql`CREATE INDEX idx_orders_customer ON orders(customer_id);`, why: '只替顧客建了索引：「某項商品賣出幾件」的條件是 `product_id`，這個索引幫不上忙，計畫仍然是 `SCAN orders`。每個常用的條件欄位都要有一個以它開頭的索引。' },
          { sql: sql`CREATE INDEX idx_orders_customer_product ON orders(customer_id, product_id);`, why: '一個複合索引不能同時當兩個單欄索引用。它依 `customer_id` 排序，`product_id` 只在同一位顧客裡有序；只給 `product_id` 的查詢缺了最左欄，只能掃描。' },
          { sql: sql`CREATE INDEX idx_customers_id ON customers(id);
CREATE INDEX idx_products_id ON products(id);`, why: '索引建在被參照的那一邊了。`customers.id`、`products.id` 是主鍵，本來就能搜尋；查詢的條件是 `orders` 的 `customer_id` 與 `product_id`，要建在 `orders` 上。' },
        ],
        probes: [
          { label: '某位顧客的訂單：不可全表掃描', sql: sql`SELECT id, product_id, quantity FROM orders WHERE customer_id = 7;`, plan: { maxFullScans: 0 } },
          { label: '某項商品賣出幾件：不可全表掃描', sql: sql`SELECT SUM(quantity) FROM orders WHERE product_id = 15;`, plan: { maxFullScans: 0 } },
          { label: '訂單筆數沒有改變', sql: sql`SELECT COUNT(*) FROM orders;` },
          { label: '幾位顧客的訂單數', sql: sql`SELECT COUNT(*) FROM orders WHERE customer_id IN (3, 5, 8);`, plan: { maxFullScans: 0 }, hidden: true },
          { label: '某項商品的訂單依編號列出', sql: sql`SELECT * FROM orders WHERE product_id = 150 ORDER BY id;`, plan: { maxFullScans: 0 }, hidden: true },
          { label: '某項商品賣出的件數', sql: sql`SELECT SUM(quantity) FROM orders WHERE product_id = 15;`, hidden: true },
        ],
      },
      {
        id: 'ex-pending-queue', title: '待出貨清單：一個複合索引，兩個查詢',
        statement: '倉庫的待出貨畫面常執行兩個查詢：一、某個狀態的訂單有幾筆（例如 `WHERE status = \'pending\'`）；二、某個狀態、某天以後的訂單，依日期由舊到新列出（見下方檢查敘述）。請只在 `orders` 上建立一個索引，讓兩個查詢都不全表掃描、也不掃描整個索引，而且第二個查詢不需要額外排序（計畫裡沒有 `USE TEMP B-TREE`）。不要修改資料。檢查時會在你的 SQL 之後檢查這些查詢的計畫，並確認 `orders` 上只有一個索引。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true,
        starter: sql`CREATE INDEX idx_orders_status_date ON orders(...);`,
        hints: [
          '兩個查詢都用 `status = ?` 這個等值條件，第二個查詢再加上日期的範圍與 `ORDER BY ordered_on`。',
          '複合索引的欄位順序：用 `=` 比較的欄位放前面，範圍或排序的欄位放後面。反過來的話，只給 `status` 的查詢就缺了最左欄。',
          '中間不要夾別的欄位：`(status, X, ordered_on)` 裡，同一個狀態的項目先依 X 排序，日期就不再整體有序，還是得額外排序。',
        ],
        solution: sql`CREATE INDEX idx_orders_status_date ON orders(status, ordered_on);`,
        alternatives: [
          sql`CREATE INDEX idx_orders_status_date_desc ON orders(status, ordered_on DESC);`,
          sql`CREATE INDEX idx_orders_queue ON orders(status, ordered_on, customer_id);`,
        ],
        mistakes: [
          { sql: sql`CREATE INDEX idx_orders_date_status ON orders(ordered_on, status);`, why: '欄位順序反了。第二個查詢還能用日期範圍搜尋，但「某個狀態有幾筆」沒有給 `ordered_on`，缺了最左欄，計畫是 `SCAN orders USING COVERING INDEX`：讀過整個索引。' },
          { sql: sql`CREATE INDEX idx_orders_status ON orders(status);`, why: '只有 `status` 時，同一個狀態的訂單在索引裡依 rowid 排列，不是依日期；第二個查詢找到之後還要 `USE TEMP B-TREE FOR ORDER BY` 再排序一次。' },
          { sql: sql`CREATE INDEX idx_orders_status_customer_date ON orders(status, customer_id, ordered_on);`, why: '中間夾了 `customer_id`：同一個狀態的項目先依顧客排序，日期只在同一位顧客裡有序，所以第二個查詢只能用 `status = ?` 搜尋，日期範圍與排序都用不上，還要額外排序。' },
        ],
        probes: [
          { label: '某個狀態的訂單數：不可全部掃描', sql: sql`SELECT COUNT(*) FROM orders WHERE status = 'pending';`, plan: { maxFullScans: 0 } },
          { label: '某個狀態、某天以後，依日期排序：不可全部掃描、不可額外排序', sql: sql`SELECT id, customer_id, ordered_on FROM orders WHERE status = 'pending' AND ordered_on >= '2026-09-01' ORDER BY ordered_on;`, plan: { maxFullScans: 0, noTempSort: true } },
          { label: 'orders 上只有一個索引', sql: sql`SELECT COUNT(*) FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'orders';` },
          { label: '另一個狀態與期間，由新到舊', sql: sql`SELECT id FROM orders WHERE status = 'cancelled' AND ordered_on BETWEEN '2025-05-01' AND '2025-05-31' ORDER BY ordered_on DESC;`, plan: { maxFullScans: 0, noTempSort: true }, hidden: true },
          { label: '某個狀態、某天以後的訂單數', sql: sql`SELECT COUNT(*) FROM orders WHERE status = 'pending' AND ordered_on >= '2026-01-01';`, hidden: true },
          { label: '訂單筆數沒有改變', sql: sql`SELECT COUNT(*) FROM orders;`, hidden: true },
        ],
      },
      {
        id: 'ex-month-report', title: '讓月報查詢用得上索引',
        statement: '月報原本這樣計算 2025 年 11 月的訂單數與商品件數：`SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity FROM orders WHERE substr(ordered_on, 1, 7) = \'2025-11\';`。結果正確，但即使 `ordered_on` 有索引也用不上。請先寫一個 `CREATE INDEX` 敘述，再寫改寫後的查詢：結果要完全相同（兩個欄位 `order_count`、`total_quantity`，依序），而且這個查詢（你的最後一個敘述）的計畫不能全表掃描，也不能掃描整個索引。`ordered_on` 一律是 `YYYY-MM-DD` 格式的文字。',
        dataset: 'sales', hidden: ['sales-b'], ordered: false, columnNames: true,
        starter: sql`CREATE INDEX ... ON orders(...);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ...;`,
        hints: [
          '索引存的是 `ordered_on` 原本的值；`substr(ordered_on, 1, 7)` 是算出來的新值，SQLite 不知道它在索引的哪裡。把條件改成直接比較 `ordered_on` 本身。',
          '「11 月的每一天」就是 `ordered_on >= \'2025-11-01\' AND ordered_on < \'2025-12-01\'`。用「小於下個月 1 日」當上限，不必記得每個月有幾天，也不會漏掉月底。',
          '寫好後在練習場執行，再把最後的 `SELECT` 前面加上 `EXPLAIN QUERY PLAN` 執行一次，確認是 `SEARCH orders USING …` 而不是 `SCAN`。',
        ],
        solution: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ordered_on >= '2025-11-01' AND ordered_on < '2025-12-01';`,
        alternatives: [
          sql`CREATE INDEX idx_orders_date_qty ON orders(ordered_on, quantity);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ordered_on BETWEEN '2025-11-01' AND '2025-11-30';`,
          sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ordered_on GLOB '2025-11-*';`,
        ],
        mistakes: [
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE substr(ordered_on, 1, 7) = '2025-11';`, why: '只建了索引，條件還是用函式包住欄位：結果正確，但計畫是掃描整個索引（或整張表），不是搜尋。建索引之外，條件也要直接比較 `ordered_on`。' },
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ordered_on LIKE '2025-11%';`, why: '在 SQLite 預設設定下 `LIKE` 不分大小寫，一般（區分大小寫的）索引用不上，計畫仍然是掃描。改用範圍比較；若一定要寫成模式，SQLite 的 `GLOB` 區分大小寫，可以用索引。' },
          { sql: sql`CREATE INDEX idx_orders_date ON orders(ordered_on);
SELECT COUNT(*) AS order_count, SUM(quantity) AS total_quantity
FROM orders
WHERE ordered_on >= '2025-11-01' AND ordered_on < '2025-11-30';`, why: '上限少了一天：`< \'2025-11-30\'` 不包含 11 月 30 日的訂單，筆數與件數都變少。要嘛寫 `<= \'2025-11-30\'`，要嘛寫 `< \'2025-12-01\'`。' },
        ],
        plan: { maxFullScans: 0 },
      },
    ],
  },
  queryPlan: {
    trees: [
      {
        id: 'bplus-build', title: '依序插入 12 個鍵（階數 4）',
        description: '每個節點最多 3 個鍵。12 個鍵造成四次葉節點分裂、一次內部節點分裂，最後高度 3。把鍵刪到只剩前幾個再按「重新建樹」，可以看到每一步。',
        order: 4, keys: [15, 40, 25, 60, 5, 35, 50, 70, 45, 20, 30, 10],
      },
      {
        id: 'bplus-sorted', title: '依大小順序插入：B+ 樹仍然平衡',
        description: '10、20、…、160 由小到大插入。普通 BST 會退化成一條 16 層的鏈；這棵 B+ 樹只有 3 層，所有葉節點在同一層。',
        order: 4, keys: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160],
      },
      {
        id: 'bplus-search', title: '點查詢：找 45',
        description: '從根 [40] 開始：45 ≥ 40 走右邊，到 [60]：45 < 60 走左邊，到葉節點 [40, 45, 50] 找到。改成 42 再搜尋看看。',
        order: 4, keys: [15, 40, 25, 60, 5, 35, 50, 70, 45, 20, 30, 10], search: 45,
      },
      {
        id: 'bplus-range', title: '範圍查詢：22 到 48',
        description: '先找到 22 該在的葉節點 [15, 20]，再沿著葉節點鏈往右走過 [25, 30, 35] 與 [40, 45, 50]，看到 50 > 48 就停。',
        order: 4, keys: [15, 40, 25, 60, 5, 35, 50, 70, 45, 20, 30, 10], range: [22, 48],
      },
      {
        id: 'bplus-order3', title: '40 個鍵，階數 3',
        description: '每個節點最多 2 個鍵、3 個分支：樹有 5 層。和下一棵樹比較高度與節點數。',
        order: 3, keys: [5, 90, 175, 60, 145, 30, 115, 200, 85, 170, 55, 140, 25, 110, 195, 80, 165, 50, 135, 20, 105, 190, 75, 160, 45, 130, 15, 100, 185, 70, 155, 40, 125, 10, 95, 180, 65, 150, 35, 120],
      },
      {
        id: 'bplus-order6', title: '同樣 40 個鍵，階數 6',
        description: '每個節點最多 5 個鍵、6 個分支：只有 3 層。也可以把階數改成 4 或 5，看樹高怎麼變。',
        order: 6, keys: [5, 90, 175, 60, 145, 30, 115, 200, 85, 170, 55, 140, 25, 110, 195, 80, 165, 50, 135, 20, 105, 190, 75, 160, 45, 130, 15, 100, 185, 70, 155, 40, 125, 10, 95, 180, 65, 150, 35, 120],
      },
    ],
  },
};
