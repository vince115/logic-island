import type { LessonContent } from '../schema';

const sql = String.raw;

/** The orders of a customer, newest first: the shop's main feature (examples, presets and the index stage). */
const HISTORY = sql`SELECT o.id, o.ordered_on, p.name AS product, o.quantity,
  o.quantity * p.price AS amount, o.status
FROM orders o
JOIN products p ON p.id = o.product_id
WHERE o.customer_id = 42
ORDER BY o.ordered_on DESC, o.id DESC
LIMIT 5;`;

/** The three tables exercise 2 starts from (second version: categories become a table). */
const V2_GIVEN = sql`-- 沿用第一版（為了簡短，customers 省略 joined_on）；分類改成一張表
CREATE TABLE categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(code),
  price INTEGER NOT NULL CHECK (price > 0)
);`;

const V2_ORDERS = sql`CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'shipped', 'cancelled')),
  ordered_on TEXT NOT NULL
);`;

const V2_ITEMS = sql`CREATE TABLE order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (order_id, product_id)
);`;

/** The category report of exercise 3, with the city as its one parameter (NULL: every city). */
const REPORT_HEAD = sql`SELECT p.category, COUNT(*) AS orders, SUM(o.quantity * p.price) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id`;
const REPORT_TAIL = sql`GROUP BY p.category
ORDER BY revenue DESC, p.category;`;
const report = (where: string) => `${REPORT_HEAD}\n${where}\n${REPORT_TAIL}`;

/** DB20 Database Applications Capstone. SQL, ER, normalization, query plans and driver code (Phase F.1d): checked by tests/curriculum-*.test.ts. */
export const DB20: LessonContent = {
  lessonId: 'DB20',
  motivation: '前面的課各練一項本領：畫 ER 圖、正規化、寫查詢與檢視表、把修改包成交易、看查詢計畫加索引、用參數化查詢擋下 injection。真正的專案不會一次只考一項，而是要把它們接成一條線：需求寫錯一句，ER 圖就畫錯一條關係，綱要少一個約束，查詢就算出錯的報表；索引沒依查詢設計，資料一多頁面就變慢；程式把輸入拼進 SQL，整個資料庫就門戶大開。本課是資料庫應用島的綜合挑戰：以一家小店「島嶼 3C 小舖」的訂單系統為貫穿全課的案例，分五個關卡從需求走到上線，先畫 ER 圖並用函數相依檢查到 3NF，寫出有約束的 DDL；再寫出主要功能的查詢、報表檢視表與拆單交易；接著讀查詢計畫加上複合索引並前後量測；最後用參數化查詢、交易與最小權限把它接上應用程式。各節示範第一版怎麼做，三個練習則是你的關卡：店長提出第二版需求，你要自己畫 ER 圖、寫出綱要與索引，並寫出一個能承受惡意輸入的報表查詢。學完後，你能交出一個從 ER 圖到可執行的查詢、索引與安全串接程式的完整資料庫應用。',
  sections: [
    {
      id: 'brief', title: '挑戰說明：島嶼 3C 小舖的訂單系統',
      blocks: [
        { type: 'p', text: '島嶼 3C 小舖在網路上賣耳機、隨身碟、螢幕等 3C 商品，原本用一張試算表記訂單。訂單越來越多，試算表開始出錯：同一位顧客的城市在不同列寫得不一樣，改一項商品的價格要改好幾十列。店長決定做一個正式的訂單系統，第一版（v1）的需求如下：' },
        { type: 'list', ordered: true, items: [
          '顧客：以顧客編號識別，記錄姓名、城市與加入日。顧客可以註冊了還沒下過單。',
          '商品：以商品編號識別，記錄品名、分類（例如音訊、儲存）與售價。第一版的售價不會調整。',
          '訂單：以訂單編號識別，記錄下單日、數量與狀態（待出貨 `pending`、已出貨 `shipped`、已取消 `cancelled`）。每筆訂單恰好由一位顧客下單，只買一種商品，但可以買好幾件。',
          '功能：顧客查看自己的訂單（最新的在前）；店長查看每月與各分類的營收；倉庫可以先出貨一部分，其餘留著之後再出（拆單）。',
          '安全：網站收到的輸入一律不可信任；報表程式只需要讀資料，不應該有修改資料的能力。',
        ] },
        { type: 'p', text: '這些需求要經過五個關卡才會變成可以上線的系統。各節之後的「互動視覺化」可以一關一關看每一關的目標與用到的課，下表是每一關要交出的成果：' },
        { type: 'table', head: ['關卡', '要交出的成果', '用到的課', '本課的位置'], rows: [
          ['1. 需求到 ER 圖', '實體、屬性與關係，以及每條關係兩端的最少與最多', 'DB08、DB09', '第 2 節、ER 練習'],
          ['2. 正規化與綱要', '檢查到 3NF 的資料表、含主鍵外鍵與約束的 DDL', 'DB07、DB09、DB10', '第 3 節、綱要練習'],
          ['3. 查詢、檢視表與交易', '主要功能的查詢、報表檢視表、拆單交易', 'DB04～DB06、DB13、DB14', '第 4 節'],
          ['4. 索引調校', '依查詢計畫加上的索引、前後的計畫與量測紀錄', 'DB11、DB12', '第 5 節、綱要練習'],
          ['5. 安全串接', '參數化查詢的程式、交易的提交與回滾、權限最小的帳號', '程式串接資料庫、SQL injection 與資料庫安全兩課', '第 6 節、報表練習'],
        ] },
        { type: 'callout', tone: 'note', title: '示範做第一版，練習做第二版', text: '第 2～6 節示範第一版怎麼一路做到上線。從第 4 節起使用練習場的 `sales` 資料集：它的三張表就是第 3 節設計出來的綱要（只是沒有寫 CHECK 與 DEFAULT 約束），裡面是小舖營運一段時間後的 2,000 位顧客、200 項商品與 30,000 筆訂單。資料由固定的算式產生，每次重設都一樣，所以同一位顧客的訂單都是同一項商品，不必覺得奇怪。三個練習是你的關卡：店長接著提出第二版需求（一筆訂單可以買好幾種商品、商品會調價），你要畫出第二版的 ER 圖、寫出第二版的綱要與索引，並在現有的資料上寫出一個要上線的參數化報表。它們都在頁面最後的「練習」：兩個 SQL 練習在前，ER 練習在後，建議從 ER 練習做起。' },
      ],
    },
    {
      id: 'stage-er', title: '第一關：從需求畫出 ER 圖',
      blocks: [
        { type: 'p', text: '照 DB08 的方法，先圈出需求裡的名詞與動詞。顧客、商品、訂單都有自己的編號，而且各有好幾個要記錄的性質，是實體；姓名、城市、品名、售價、數量、狀態這些描述它們的詞是屬性；「下單」「訂購」把兩個實體連起來，是關係。第一個要想清楚的決定是：訂單是實體，還是顧客與商品之間的一個關係？' },
        { type: 'p', text: '答案是實體。訂單有自己的編號、下單日與狀態；更關鍵的是，同一位顧客可以多次買同一項商品。若把「購買」畫成顧客與商品之間的關係，每一對（顧客, 商品）只能出現一次，第二次購買就沒有地方記錄。這和 DB09 把「借閱」建成實體是同一個理由：會重複發生、需要各自記錄的事件，要有自己的鍵。' },
        { type: 'example', id: 'er-shop-v1' },
        { type: 'p', text: '每條關係兩端的多重性，都要能指到需求裡的一句話：' },
        { type: 'list', items: [
          '「下單」：每筆訂單恰好由一位顧客下單（訂單對顧客 1..1）；顧客可以還沒下過單，也可以下很多筆（顧客對訂單 0..N）。',
          '「訂購」：第一版每筆訂單只買一種商品（訂單對商品 1..1）；一項商品可以被很多筆訂單買，也可能還沒有人買（商品對訂單 0..N）。',
          '「數量」放在訂單上：每筆訂單只買一種商品，所以一筆訂單只有一個數量。第二版一筆訂單有好幾種商品時，這個決定就要改（ER 練習「第二版的 ER 圖」）。',
        ] },
        { type: 'callout', tone: 'tip', title: '不畫進 ER 圖的東西', text: '訂單金額等於數量乘以售價，可以隨時算出來，不另外記錄（存一份就多一份可能和來源不一致的資料，DB10 的反正規化討論過代價）。「小舖」只有一家，不需要和別的店區分，也不建模。分類在第一版只是商品的一個文字屬性：需求只要求記下每項商品屬於哪一類，沒有要求分類本身被單獨記錄。需求一改，這個判斷就要重新檢查一次。' },
      ],
    },
    {
      id: 'stage-schema', title: '第二關：用正規化檢查，再寫出 DDL',
      blocks: [
        { type: 'p', text: '從另一個方向檢查設計：店長原本的試算表 `order_sheet` 一列記一筆訂單，顧客與商品的資料一再重複。依需求寫下函數相依：訂單編號決定下單日、顧客、商品與數量；顧客編號決定姓名與城市；商品編號決定品名、分類與售價（第一版售價不調整，這條相依才成立）。下面的分析由這些相依算出：' },
        { type: 'example', id: 'nf-order-sheet' },
        { type: 'p', text: '用 DB10 的正規化拆出來的三張表，和用 DB09 的規則把 ER 圖轉成資料表（每個實體一張表，一對多把外鍵放在「多」的那一邊）得到的完全相同。兩種方法走到同一個結果，是設計站得住的好跡象；如果兩邊不一致，通常表示需求裡有一條規則被漏看了。頁面下方的「正規化工作台」可以拿同一張試算表自己試試別的拆法。接著把設計寫成 DDL，每一個約束都對應一句需求：' },
        { type: 'example', id: 'sql-ddl-v1' },
        { type: 'table', head: ['DDL 中的寫法', '對應的需求', '擋下什麼資料'], rows: [
          ['`customer_id INTEGER NOT NULL REFERENCES customers(id)`', '每筆訂單恰好由一位顧客下單', '沒有顧客、或顧客不存在的訂單'],
          ['`product_id INTEGER NOT NULL REFERENCES products(id)`', '每筆訂單買一種商品', '沒有商品、或商品不存在的訂單'],
          ['`quantity INTEGER NOT NULL CHECK (quantity > 0)`', '至少買一件', '0 件、負數；`NOT NULL` 擋下沒填（`CHECK` 遇到 NULL 不算違反，所以兩個都要寫）'],
          ['`status … DEFAULT \'pending\' CHECK (status IN (…))`', '只有三種狀態，新訂單是待出貨', '打錯或自創的狀態'],
          ['`price INTEGER NOT NULL CHECK (price > 0)`', '每項商品都有售價', '沒有售價或售價不是正數的商品'],
        ] },
        { type: 'callout', tone: 'note', title: '這份 DDL 裡屬於 SQLite 的部分', text: '外鍵在 SQLite 預設不檢查，每個連線要先執行 `PRAGMA foreign_keys = ON`（練習場已經開啟，第 6 節的程式也會寫）；PostgreSQL 與 MySQL 的 InnoDB 預設就會檢查。SQLite 的型別是親和性，宣告 `INTEGER` 的欄位仍可能存進文字，要嚴格檢查型別可以用 `STRICT` 表（DB07）。日期存成 `YYYY-MM-DD` 的文字，字串順序就是日期順序；PostgreSQL、MySQL 有 `DATE` 型別。金額用整數的「元」，避開浮點數誤差。' },
      ],
    },
    {
      id: 'stage-queries', title: '第三關：主要功能的查詢、檢視表與交易',
      blocks: [
        { type: 'p', text: '綱要定了，接著替每一項功能寫出 SQL，並在有資料的 `sales` 上確認結果。第一項是顧客查看自己的訂單，最新的在前，每頁 5 筆，附上品名與金額：' },
        { type: 'example', id: 'sql-history' },
        { type: 'p', text: '同一天可能有好幾筆訂單（顧客 42 在 2026-08-11 就有兩筆），只寫 `ORDER BY o.ordered_on DESC` 時，同一天的先後沒有定義，翻頁時可能重複或漏掉一筆；加上 `o.id DESC` 當第二個排序鍵，順序才唯一（DB03）。第二項是報表：每月營收、各分類營收、各城市營收都要同一段 JOIN 與「數量乘以售價」，把它包成檢視表（DB13），每份報表就只要寫自己的篩選與分組：' },
        { type: 'example', id: 'sql-view-report' },
        { type: 'p', text: '檢視表不存資料，每次查詢都依定義重新計算，所以 `amount` 用的是商品「現在」的售價。第一版售價不調整，這樣算是對的；第二版商品會調價，若仍用這個檢視表計算舊訂單，金額會跟著新價格改變，這就是第二版的綱要要在訂單明細記下成交單價的原因。第三項是拆單：訂單 14 待出貨 5 件，倉庫先出 3 件，其餘 2 件另開一筆待出貨訂單。這要兩個修改，必須一起成功或一起取消（DB14）：' },
        { type: 'example', id: 'sql-split-order' },
        { type: 'list', items: [
          '先 `INSERT … SELECT` 再 `UPDATE`：新訂單從原訂單複製顧客、商品與下單日，要在原訂單被改掉之前讀。',
          '兩個敘述都帶著同樣的條件 `status = \'pending\' AND quantity = 5`：如果訂單已經被別人處理過，兩個敘述都改不到任何一列，不會只做一半。',
          '沒有 `BEGIN`：每個敘述各自自動提交。若在 `INSERT` 之後、`UPDATE` 之前當機，資料庫裡會有 5 件的原訂單加上 2 件的新訂單，同一批商品記成 7 件。包在交易裡，當機時還沒 `COMMIT` 的修改全部不算。',
        ] },
        { type: 'callout', tone: 'note', title: '兩位店員同時拆同一筆訂單', text: 'SQLite 同一時間只允許一筆交易寫入：第二位店員要等第一筆交易結束才能寫（沒有設定等待時間的話，會直接收到 `database is locked` 錯誤，要重試）。等他的敘述真正執行時，訂單 14 已經不是 `pending`，兩個敘述都不會改到資料。PostgreSQL、MySQL 允許多筆交易同時修改不同的列，情況就不同：例如在 PostgreSQL 預設的 READ COMMITTED 下，第二筆交易的 `INSERT … SELECT` 可能讀到第一筆交易提交前的舊資料（待出貨、5 件），多開一筆 2 件的訂單，之後的 `UPDATE` 卻因為條件不成立而改不到，留下多出來的訂單。這時要依 DB15 選擇隔離等級，或在交易開頭用 `SELECT … FROM orders WHERE id = 14 FOR UPDATE` 先鎖住那一筆（這是 PostgreSQL 與 MySQL 的語法，SQLite 沒有）。' },
      ],
    },
    {
      id: 'stage-index', title: '第四關：依查詢計畫加索引，前後量測',
      blocks: [
        { type: 'p', text: '功能寫完、結果正確之後，才輪到速度。顧客查訂單是全站最常執行的查詢，先看它的計畫：' },
        { type: 'example', id: 'plan-history-before' },
        { type: 'p', text: '兩個問題：`SCAN o` 為了顧客 42 的 15 筆訂單讀過全部 30,000 筆；`USE TEMP B-TREE FOR ORDER BY` 再把找到的訂單另外排序。依 DB11 的規則設計複合索引：用 `=` 比較的欄位放前面（`customer_id`），排序的欄位接在後面（`ordered_on`）：' },
        { type: 'example', id: 'plan-history-after' },
        { type: 'p', text: '全表掃描與額外排序都不見了：索引裡顧客 42 的項目本來就依 `ordered_on` 排好，SQLite 從這一段的尾端往回讀就是由新到舊。SQLite 的每個索引項目最後還帶著那一列的 rowid（也就是 `orders.id`），所以同一天的項目也依 `id` 排好，`o.id DESC` 這個第二排序鍵同樣不必另外排序（這是 SQLite 的行為，計畫裡沒有 `USE TEMP B-TREE` 就是證據）。其他功能也逐一檢查：' },
        { type: 'table', head: ['功能', '條件與排序', '索引', '理由'], rows: [
          ['顧客訂單歷史', '`customer_id = ?`，`ORDER BY ordered_on DESC`', '`(customer_id, ordered_on)`', '最常執行；先等值再排序，搜尋與排序一次完成'],
          ['拆單', '`id = ?`', '不必另建', '`id` 是整數主鍵，本來就能直接搜尋'],
          ['月報與分類報表', '一段日期範圍、整季或全部資料', '先量再決定', '一個月跑幾次、每次讀幾千列以上；索引幫助有限，卻讓每一筆新訂單都多寫一份'],
        ] },
        { type: 'p', text: '改善是不是真的，要用 DB12 的方法量：按「重設資料」，把查詢執行 3～5 次記下時間；單獨執行一次 `CREATE INDEX`；再執行 3～5 次，在同一台電腦上比較，並確認計畫真的變了、結果也沒變。只查一位顧客時，30,000 筆的全表掃描本身就很快，前後差別可能只有幾毫秒，被每次執行的起伏蓋過；練習場的預設查詢「量時間：台中最近有下單的顧客」替 334 位顧客各查一次最新訂單，差別就明顯得多。本課不寫出任何毫秒數，請你自己量。' },
        { type: 'callout', tone: 'warning', title: '索引不是越多越好', text: '訂單表是寫入最頻繁的表，每多一個索引，每筆 `INSERT`、拆單的 `UPDATE` 都要多改一棵 B+ 樹，也多占空間。建了 `(customer_id, ordered_on)` 之後，只有 `customer_id` 的單欄索引就多餘了：只給 `customer_id` 的查詢可以用複合索引的最左欄（DB11）。只替真正常用、而且量得出改善的查詢建索引。' },
      ],
    },
    {
      id: 'stage-secure', title: '第五關：安全串接：參數化查詢與最小權限',
      blocks: [
        { type: 'p', text: '應用程式把 SQL 送給資料庫，SQL 裡的值常常來自網址或表單，這些輸入任何人都能改。如果程式把輸入直接拼進 SQL 的文字，輸入就可能改變 SQL 的意思。下例模擬「我的訂單」頁：顧客 42 篩選已出貨的訂單，有人把網址裡的狀態改成 `shipped\' OR \'1\'=\'1`：' },
        { type: 'example', id: 'sql-injection-demo' },
        { type: 'list', items: [
          '`intended`：正常輸入 `shipped`，顧客 42 有 13 筆已出貨訂單。',
          '`spliced`：輸入被拼進文字後，條件變成 `customer_id = 42 AND status = \'shipped\' OR \'1\'=\'1\'`。`AND` 比 `OR` 先結合，`\'1\'=\'1\'` 永遠成立，於是 30,000 筆、所有顧客的訂單全部被查出來。',
          '`bound`：用參數綁定時，整段輸入只是一個值，等於拿 `status` 和整串文字 `shipped\' OR \'1\'=\'1` 比較，一筆都不符合。SQL 的意思不會因為值而改變。',
        ] },
        { type: 'p', text: '下面是串接的完整程式：用 `?` 參數化查詢實作「我的訂單」，用交易實作拆單（失敗就回滾），最後把報表用的連線設成只能讀。Python 與 JavaScript 版本會真的執行，印出的結果相同：' },
        { type: 'example', id: 'drv-shop-app' },
        { type: 'list', items: [
          '參數化：SQL 文字固定，值由驅動程式分開送（Python 的 `execute(sql, (a, b))`、Node 的 `prepare(sql).all(a, b)`、JDBC 的 `PreparedStatement.setInt`／`setString`）。SQL 的文字裡沒有拼進任何輸入。',
          '越權：參數化擋得住 injection，擋不住「看別人的資料」。`customer_id` 取自登入後的工作階段，不能取自網址；否則攻擊者只要把網址的 42 改成 43，用的仍是完全正常的參數。',
          '交易：Python 用 `isolation_level=None` 關掉驅動程式自動開交易的行為，自己寫 `BEGIN`／`COMMIT`／`ROLLBACK`；JDBC 預設自動提交，要 `setAutoCommit(false)` 再 `commit()` 或 `rollback()`。拆 9 件超過訂單的 5 件，丟出例外後回滾，資料完全不變。',
          '只能讀：`PRAGMA query_only = ON` 讓這個連線拒絕任何修改。它是 SQLite 的連線設定，同一個連線可以再把它關掉，只是一道防呆，不是安全邊界。',
        ] },
        { type: 'p', text: '真正的最小權限要靠 DBMS 的帳號與權限。SQLite 是一個檔案，沒有使用者、角色與 `GRANT`；PostgreSQL、MySQL 這類伺服器型 DBMS 才有。下表的 PostgreSQL 與 MySQL 語法只是示範，練習場無法執行：' },
        { type: 'table', head: ['系統', '報表程式只能讀報表的做法'], rows: [
          ['PostgreSQL', '`CREATE ROLE report_app LOGIN PASSWORD \'…\';`，`GRANT SELECT ON order_lines TO report_app;`：只給檢視表的讀取權，不給底層的表。檢視表預設以擁有者的權限讀取底層的表，所以報表程式查得到檢視表，卻不能直接讀或改 `orders`、`customers`。'],
          ['MySQL', '`CREATE USER \'report_app\'@\'%\' IDENTIFIED BY \'…\';`，`GRANT SELECT ON shop.order_lines TO \'report_app\'@\'%\';`'],
          ['SQLite', '沒有帳號與 `GRANT`：誰能讀寫取決於作業系統對資料庫檔的權限，例如讓執行報表程式的系統帳號對那個檔只有讀取權；程式也以唯讀模式開檔（URI 檔名 `file:shop.db?mode=ro`，Python 要加 `uri=True`）。檢視表在 SQLite 只能提供一個比較窄的查詢介面，擋不住能開檔的人直接讀表。'],
        ] },
        { type: 'callout', tone: 'warning', title: '參數化之後仍要注意的三件事', text: '一、`LIKE ?` 的值裡的 `%` 與 `_` 仍是萬用字元：參數化保證 SQL 的文字不變，但 `LIKE` 本來就把它們當萬用字元，輸入 `%` 會符合每一列。要比較相等就用 `=`，真的要模糊搜尋時用 `ESCAPE` 跳脫使用者輸入的 `%`、`_`。二、只有「值」能當參數，表名、欄名、`ASC`／`DESC` 不行；這些要從程式內建的白名單裡挑，不能來自輸入。三、程式連線用的帳號只給它需要的權限，萬一程式有漏洞，損害也有上限。' },
      ],
    },
    {
      id: 'delivery', title: '交付前的自我檢查',
      blocks: [
        { type: 'p', text: '一個資料庫應用能不能上線，不是看某一個查詢寫得多漂亮，而是看每一關都有證據。交付前逐項檢查：' },
        { type: 'table', head: ['檢查項目', '怎麼確認'], rows: [
          ['每一句需求都有落點', '對照需求，指出它變成哪個實體、屬性、關係、欄位或約束；說不出來的需求不是漏了，就是要用程式守'],
          ['綱要到 3NF', '每張表列出函數相依，每個相依的左邊都是那張表的超鍵（第 3 節的分析）'],
          ['約束擋得下不合法的資料', '對每個約束各插入一筆違規資料，確認被拒絕；也插入合法的邊界值（例如數量 1）確認被接受'],
          ['每項功能的結果是對的', '在有資料的資料集上執行，挑幾筆用手算核對；排序有唯一的第二排序鍵'],
          ['多步驟的修改是一筆交易', '想像在任兩個敘述之間當機，資料會停在什麼狀態（DB14）'],
          ['主要查詢的計畫合理', '`EXPLAIN QUERY PLAN` 沒有意料外的 `SCAN` 或 `USE TEMP B-TREE`，索引前後都量過'],
          ['程式不拼接 SQL', '所有值都用 `?` 綁定；表名、欄名、排序方向來自白名單；能看到哪些資料取決於登入身分，而不是輸入'],
          ['帳號權限最小', '報表帳號只能讀；應用程式帳號不能改綱要'],
        ] },
        { type: 'p', text: '第二版需求改變了兩條規則，設計也要跟著改。「一筆訂單可以買好幾種商品」讓訂單與商品變成多對多，數量要搬到中介表 `order_items`（DB09）。「商品會調價」讓第一版的相依「商品編號決定售價」不再描述訂單上的價格：成交單價是「這筆訂單的這種商品」的事實，由 `(order_id, product_id)` 決定，記在 `order_items`；`products.price` 只表示目前售價。這不是反正規化的重複：兩個欄位記的是兩件不同的事，調價時只改 `products.price`，舊訂單不受影響。三個練習就是這次改版。' },
        { type: 'callout', tone: 'tip', title: '上線之後', text: '系統上線只是開始。訂單文件若需要整份讀寫（例如給物流系統的出貨單），可以參考 NoSQL 資料模型一課，比較把明細內嵌在文件裡的設計；資料會壞、機器會掛，備份、複寫與擴展一課會說明怎麼規劃備份與還原、在故障時把資料救回來。並行的店員越來越多時，回頭看 DB15 的隔離等級與鎖。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '島嶼 3C 小舖：從需求到上線的五個關卡',
    stages: [
      { title: '需求到 ER 圖', concepts: ['DB08', 'DB09'], goal: '從需求找出實體、屬性與關係，標出每條關係兩端的最少與最多，畫成 ER 圖。',
        detail: '顧客、商品、訂單都有自己的編號，是實體。訂單會重複發生（同一位顧客可以多次買同一項商品），所以建成實體，而不是顧客與商品之間的關係。每個多重性都要指得出需求裡的哪一句話；能算出來的訂單金額不建模。' },
      { title: '正規化與綱要', concepts: ['DB10', 'DB09', 'DB07'], goal: '用函數相依把試算表檢查到 3NF，寫出含主鍵、外鍵、NOT NULL、CHECK 與 DEFAULT 的 DDL。',
        detail: '試算表的唯一候選鍵是訂單編號，沒有部分相依，但顧客與商品的資料是遞移相依，只到 2NF；拆出 customers 與 products 後三張表都到 BCNF，和 ER 圖轉成的資料表相同。每個約束都對應一句需求，NOT NULL 與 CHECK 各擋不同的東西。' },
      { title: '查詢、檢視表與交易', concepts: ['DB05', 'DB06', 'DB13', 'DB14'], goal: '寫出顧客訂單歷史、報表檢視表與拆單交易，在有資料的資料集上核對結果。',
        detail: '排序加上唯一的第二排序鍵，翻頁才不會重複或漏列。報表共用的 JOIN 與金額計算包成檢視表；檢視表每次都依目前的售價重算。拆單的 INSERT 與 UPDATE 包在 BEGIN … COMMIT 裡，兩個敘述都帶著相同的狀態條件。' },
      { title: '索引調校與量測', concepts: ['DB11', 'DB12'], goal: '用 EXPLAIN QUERY PLAN 找出全表掃描與額外排序，依查詢設計複合索引，前後量測。',
        detail: '訂單歷史從 SCAN 加 USE TEMP B-TREE，變成用 (customer_id, ordered_on) 索引的 SEARCH。重設資料、前後各量幾次、單獨建索引，確認計畫變了而結果沒變；寫入頻繁的表只建量得出改善的索引。' },
      { title: '安全串接', concepts: ['DB16', 'DB17', 'DB13'], goal: '用參數化查詢與交易把資料庫接上程式，並讓每個帳號只有需要的權限。',
        detail: '所有值用 ? 綁定，惡意輸入只是一個比不到的值；顧客編號取自登入身分而不是輸入。拆單在程式裡失敗就回滾。報表帳號只能讀檢視表：PostgreSQL、MySQL 用 GRANT，SQLite 用檔案權限與唯讀開檔。' },
    ],
  },
  quiz: [
    {
      id: 'q-fk-placement', prompt: '需求：「每筆訂單恰好由一位顧客下單；顧客可以還沒下過單，也可以下很多筆。」轉成資料表時，哪一種寫法完整表達了這句需求？',
      options: [
        '在 `customers` 加上 `order_id INTEGER REFERENCES orders(id)`',
        '在 `orders` 加上 `customer_id INTEGER REFERENCES customers(id)`（可以是 NULL）',
        '在 `orders` 加上 `customer_id INTEGER NOT NULL REFERENCES customers(id)`',
        '建一張 `customer_orders(customer_id, order_id)`，以兩個欄位當複合主鍵',
      ],
      answer: 2, explanation: '一對多的外鍵放在「多」的那一邊（訂單），「恰好一位」的最少 1 要靠 `NOT NULL`。外鍵放在 `customers` 上，一位顧客只能記一筆訂單，「很多筆」就放不下；少了 `NOT NULL`，就允許沒有顧客的訂單，最少變成 0；以 `(customer_id, order_id)` 為主鍵的中介表允許一筆訂單出現在好幾位顧客名下，那是多對多。顧客可以沒有訂單這一端不必寫任何約束：沒有訂單參照他就好。',
    },
    {
      id: 'q-sheet-nf', prompt: '店長的試算表 `order_sheet(order_id, ordered_on, customer_id, customer_name, city, product_id, product_name, category, price, quantity)` 有三條相依：`order_id` 決定下單日、顧客、商品與數量；`customer_id` 決定姓名與城市；`product_id` 決定品名、分類與售價。它最高符合哪個正規形式？',
      options: [
        '1NF：`customer_id → city` 是部分相依',
        '2NF：唯一的候選鍵是 `order_id`，不可能有部分相依；但 `customer_id → city` 這類相依是遞移相依',
        '3NF：每個欄位都相依於 `order_id`',
        'BCNF：`order_id` 決定所有欄位，所以每個決定因素都是超鍵',
      ],
      answer: 1, explanation: '`order_id` 的閉包是全部欄位；沒有任何相依決定 `order_id`，每個鍵都必須包含它，所以它是唯一的候選鍵。部分相依要「依賴候選鍵的一部分」，單一欄位的鍵沒有更小的部分，所以至少是 2NF。`customer_id` 不是超鍵，卻決定非鍵欄位 `city`，`order_id → customer_id → city` 是遞移相依，所以停在 2NF。「每個欄位都相依於鍵」是 2NF 的條件，3NF 還要求非鍵欄位不經由別的非鍵欄位相依；BCNF 要求每一條相依的左邊都是超鍵，`customer_id` 與 `product_id` 都不是。',
    },
    {
      id: 'q-view-price', prompt: '在 `sales` 上建立第 4 節的檢視表 `order_lines` 之後，店長執行 `UPDATE products SET price = 2000 WHERE id = 32;`（原價 1,800）。訂單 22839 買了 5 件商品 32，已經出貨。現在查 `SELECT amount FROM order_lines WHERE order_id = 22839;` 得到什麼？',
      options: [
        '9000：檢視表在建立時就把結果存下來了',
        '10000：檢視表每次都依定義重算，用的是商品現在的售價',
        '9000：已出貨的訂單不受調價影響，只有待出貨的會變',
        '執行錯誤：底層的表改過之後，檢視表必須重建才能查詢',
      ],
      answer: 1, explanation: '檢視表只存定義，查詢時才依當下的 `orders` 與 `products` 計算，所以 5 × 2,000 = 10,000，連已出貨的舊訂單也一樣，這正是第二版要記下成交單價的原因。存下結果的是快照或具體化檢視表（DB13），不是一般檢視表；`order_lines` 的定義裡沒有任何依狀態區分價格的條件；修改底層資料不需要重建檢視表，只有改到檢視表用到的欄位定義（例如刪掉 `price`）才會出問題。',
    },
    {
      id: 'q-split-crash', prompt: '訂單 14 原本待出貨 5 件。倉庫用下面兩個敘述拆單，但忘了寫 `BEGIN` 與 `COMMIT`。如果第一個敘述完成後、第二個敘述執行前系統當機，重新啟動後資料是什麼樣子？',
      code: { language: 'SQL', text: 'INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on)\nSELECT customer_id, product_id, 2, \'pending\', ordered_on\nFROM orders\nWHERE id = 14 AND status = \'pending\' AND quantity = 5;\nUPDATE orders SET quantity = 3, status = \'shipped\'\nWHERE id = 14 AND status = \'pending\' AND quantity = 5;' },
      options: [
        '訂單 14 仍是 5 件待出貨，另外多了一筆 2 件的待出貨訂單：同一批商品記成 7 件',
        '兩個敘述一起被復原：只剩訂單 14，5 件待出貨',
        '訂單 14 變成 3 件已出貨，沒有新訂單',
        '訂單 14 變成 3 件已出貨，另有一筆 2 件的待出貨訂單',
      ],
      answer: 0, explanation: '沒有 `BEGIN` 時，每個敘述自己就是一筆自動提交的交易：`INSERT` 完成就已提交，當機也不會撤銷；`UPDATE` 還沒執行，訂單 14 保持原樣，結果多記了 2 件。「兩個一起復原」只有兩個敘述在同一筆交易裡、而且還沒 `COMMIT` 時才會發生；後兩個選項都需要 `UPDATE` 已經執行，題目說它還沒開始。',
    },
    {
      id: 'q-history-index', prompt: '顧客訂單歷史的查詢是 `… WHERE o.customer_id = ? ORDER BY o.ordered_on DESC, o.id DESC`。在 `sales`（`orders` 只有主鍵）上，建立下列哪一組索引後，SQLite 的計畫既沒有全表掃描、也沒有 `USE TEMP B-TREE`？',
      options: [
        '`CREATE INDEX i1 ON orders(customer_id);`',
        '`CREATE INDEX i1 ON orders(ordered_on, customer_id);`',
        '`CREATE INDEX i1 ON orders(customer_id); CREATE INDEX i2 ON orders(ordered_on);`',
        '`CREATE INDEX i1 ON orders(customer_id, ordered_on);`',
      ],
      answer: 3, explanation: '等值條件的欄位在前、排序欄位在後，SQLite 搜尋到顧客那一段，項目已經依日期（同一天再依 rowid，也就是 `id`）排好，倒著讀就是答案的順序。只有 `customer_id` 的索引能搜尋，但找到的訂單還要另外排序（`USE TEMP B-TREE FOR ORDER BY`）；`(ordered_on, customer_id)` 缺了最左欄，只能掃描整個索引；有兩個單欄索引時，SQLite 在這個查詢只用其中一個：它選了 `customer_id` 的索引，找到的訂單仍然要另外排序。',
    },
    {
      id: 'q-like-param', prompt: '城市報表的程式已經改用參數綁定，條件寫成 `WHERE c.city LIKE ?`。有人在城市欄位輸入 `%`。會發生什麼事？',
      options: [
        '查不到任何資料：參數綁定後，`%` 只是一個普通的字元',
        '執行錯誤：參數裡不能出現 `%`',
        '所有城市的資料都被查出來：SQL 的文字沒有被改變，但 `LIKE` 仍把值裡的 `%` 當成萬用字元',
        '這是 SQL injection：輸入改變了 SQL 敘述的文字',
      ],
      answer: 2, explanation: '參數化保證值不會變成 SQL 語法，但 `LIKE` 的語意本來就是「值裡的 `%` 代表任意字串」，所以 `city LIKE \'%\'` 符合每一列（不是 NULL 的）。要比較相等就用 `=`，此時 `city = \'%\'` 一列都不符合；若真的要模糊搜尋，用 `ESCAPE` 跳脫使用者輸入的 `%` 與 `_`。值可以包含任何字元，不會造成錯誤；SQL 的文字一個字都沒變，所以這不是 injection，而是查詢設計上的漏洞。',
    },
    {
      id: 'q-least-privilege', prompt: '小舖改用 PostgreSQL。報表程式只需要讀檢視表 `order_lines`。下列哪一種設定最符合最小權限原則？',
      options: [
        '建立角色 `report_app`，只執行 `GRANT SELECT ON order_lines TO report_app;`',
        '`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO report_app;`，在程式裡注意不要寫入',
        '讓報表程式直接用擁有所有資料表的帳號連線，省去權限設定',
        '`GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO report_app;`，再由程式檢查使用者能做什麼',
      ],
      answer: 0, explanation: '最小權限是「只給完成工作需要的那一項」：讀一個檢視表就只給它的 `SELECT`。在 PostgreSQL，檢視表預設以擁有者的權限讀取底層的表，所以報表程式不必、也不應該直接讀 `orders`。其他選項都把安全寄託在程式「不犯錯」：程式一旦有 injection 或漏洞，`ALL PRIVILEGES`、擁有者帳號或對 `orders` 的寫入權，會讓攻擊者能修改甚至刪除資料。',
    },
  ],
  er: {
    diagrams: [
      {
        id: 'er-shop-v1', title: 'ER 圖：島嶼 3C 小舖第一版',
        description: '三個強實體。「下單」：每筆訂單恰好一位顧客，顧客可以有零或多筆訂單。「訂購」：第一版每筆訂單恰好買一種商品，一項商品可以有零或多筆訂單。數量、狀態與下單日都屬於訂單。',
        model: {
          entities: [
            { id: 'customer', name: '顧客', attributes: [{ name: '顧客編號', key: true }, { name: '姓名' }, { name: '城市' }, { name: '加入日' }] },
            { id: 'order', name: '訂單', attributes: [{ name: '訂單編號', key: true }, { name: '數量' }, { name: '狀態' }, { name: '下單日' }] },
            { id: 'product', name: '商品', attributes: [{ name: '商品編號', key: true }, { name: '品名' }, { name: '分類' }, { name: '售價' }] },
          ],
          relationships: [
            { id: 'places', name: '下單', a: 'customer', b: 'order', aToB: '0..N', bToA: '1..1' },
            { id: 'buys', name: '訂購', a: 'order', b: 'product', aToB: '1..1', bToA: '0..N' },
          ],
        },
        at: { customer: [0, 0], order: [1, 0], product: [2, 0] },
      },
    ],
    exercises: [
      {
        id: 'ex-er-v2', title: '第二版的 ER 圖：訂單明細與分類',
        statement: '店長提出第二版需求：顧客以顧客編號識別；一位顧客可以還沒下過單，也可以下很多筆訂單。每筆訂單以訂單編號識別，記錄下單日，恰好由一位顧客下單。一筆訂單至少包含一種商品，也可以包含很多種；一種商品可以出現在很多筆訂單裡，也可能還沒有人買過。訂單裡的每一種商品都要記下購買的數量與成交單價（商品日後調價時，舊訂單的金額不能跟著改變）。商品以商品編號識別，記錄目前售價。每項商品恰好屬於一個分類；分類以分類代碼識別，一個分類可以有很多項商品，新開的分類也可能還沒有任何商品。訂單金額可以由明細算出，不另外儲存。',
        terms: [
          { id: 'customer', label: '顧客' }, { id: 'cid', label: '顧客編號' }, { id: 'order', label: '訂單' },
          { id: 'oid', label: '訂單編號' }, { id: 'date', label: '下單日' }, { id: 'places', label: '下單' },
          { id: 'product', label: '商品' }, { id: 'pid', label: '商品編號' }, { id: 'price', label: '目前售價' },
          { id: 'contains', label: '包含' }, { id: 'qty', label: '數量' }, { id: 'unit', label: '成交單價' },
          { id: 'category', label: '分類' }, { id: 'code', label: '分類代碼' }, { id: 'belongs', label: '屬於' },
          { id: 'total', label: '訂單金額' },
        ],
        answer: {
          customer: { role: 'entity' }, cid: { role: 'attribute', of: 'customer', key: true },
          order: { role: 'entity' }, oid: { role: 'attribute', of: 'order', key: true }, date: { role: 'attribute', of: 'order' },
          places: { role: 'relationship', a: 'customer', b: 'order', aToB: '0..N', bToA: '1..1' },
          product: { role: 'entity' }, pid: { role: 'attribute', of: 'product', key: true }, price: { role: 'attribute', of: 'product' },
          contains: { role: 'relationship', a: 'order', b: 'product', aToB: '1..N', bToA: '0..N' },
          qty: { role: 'attribute', of: 'contains' }, unit: { role: 'attribute', of: 'contains' },
          category: { role: 'entity' }, code: { role: 'attribute', of: 'category', key: true },
          belongs: { role: 'relationship', a: 'product', b: 'category', aToB: '1..1', bToA: '0..N' },
          total: { role: 'none' },
        },
        termHints: {
          customer: '顧客有很多位、要分別記錄嗎？情境用哪個屬性識別顧客？',
          cid: '它描述誰？兩位顧客會有相同的值嗎？',
          order: '訂單有自己的編號與下單日，同一位顧客可以下很多筆。它是要分別記錄的東西，還是兩個東西之間的連結？',
          oid: '它描述哪一個東西？能唯一識別嗎？',
          date: '下單日描述的是一筆訂單，還是訂單裡的某一種商品？同一筆訂單裡的各種商品，下單日會不一樣嗎？',
          places: '分別問兩個問題：一位顧客最少、最多下幾筆訂單？一筆訂單最少、最多由幾位顧客下單？',
          product: '商品有很多項、要分別記錄嗎？有能識別它的屬性嗎？',
          pid: '它描述哪一個東西？會不會有兩項商品的值相同？',
          price: '「目前售價」是商品本身的性質，還是某一筆訂單成交時的價格？調價時要改的是哪一個？',
          contains: '分別問兩個問題：一筆訂單最少、最多包含幾種商品？一種商品最少、最多出現在幾筆訂單？再讀一次「至少」「也可能還沒有」那兩句。',
          qty: '數量描述的是訂單、商品，還是「這筆訂單裡的這種商品」？一筆訂單買了兩種商品時，兩種的數量一定一樣嗎？',
          unit: '成交單價和目前售價是同一件事嗎？調價之後，舊訂單裡的這個值要不要變？它要放在哪裡，才能讓每筆訂單的每種商品各有一個值？',
          category: '新開的分類還沒有任何商品時，系統要不要記得它？如果它只是商品的一個屬性，沒有商品時要記在哪裡？',
          code: '它描述哪一個東西？能唯一識別嗎？',
          belongs: '分別問兩個問題：一項商品最少、最多屬於幾個分類？一個分類最少、最多有幾項商品？',
          total: '情境說訂單金額怎麼得到、要不要儲存？能由其他資料算出、也不另外儲存的值需要建模嗎？',
        },
        hints: [
          '先找出有自己識別碼的名詞：顧客、訂單、商品、分類。它們是實體；描述它們的詞是屬性；把兩個實體連起來的動詞是關係。',
          '第一版每筆訂單只買一種商品。第二版「一筆訂單可以包含很多種商品，一種商品可以出現在很多筆訂單」是多對多；描述「這筆訂單的這種商品」的值，要畫在多對多的關係上。',
          '每個關係問兩個方向的最少與最多：「至少一種」「恰好一個」的最少是 1，「可以還沒有」「也可能沒有」的最少是 0，「很多」的最多是 N。',
        ],
        explanation: '顧客、訂單、商品、分類都有自己的識別碼，是四個強實體。「下單」：每筆訂單恰好一位顧客（1..1），一位顧客可以有 0..N 筆訂單。「包含」是多對多：一筆訂單至少一種商品（1..N），一種商品可能還沒人買過（0..N）。數量與成交單價描述的是「這筆訂單的這種商品」，只能畫在「包含」上；轉成資料表時，它們就是中介表 `order_items` 的欄位（SQL 練習「第二版的綱要」）。成交單價和目前售價是兩件事：前者記下成交當時的價格，商品調價時不變；後者是商品現在的價格。分類要建成實體，因為新開的分類可能還沒有商品，當成商品的屬性就無處記錄；「屬於」：每項商品恰好一個分類（1..1），一個分類有 0..N 項商品。訂單金額能由明細算出、不儲存，不需要建模。',
        at: { customer: [0, 0], order: [1, 0], product: [2, 0], category: [2, 1] },
        mistakes: [
          { roles: { contains: { role: 'relationship', a: 'order', b: 'product', aToB: '1..1', bToA: '0..N' } },
            why: '沿用第一版「每筆訂單只買一種商品」：第二版一筆訂單可以包含很多種商品，訂單對商品的最多是 N，這是多對多，不是一對多。' },
          { roles: { unit: { role: 'attribute', of: 'product' } },
            why: '成交單價放在商品上：商品身上只放得下一個價格，調價後舊訂單的金額就跟著改變，而且和目前售價重複。成交單價屬於「這筆訂單的這種商品」。' },
          { roles: { category: { role: 'attribute', of: 'product' } },
            why: '把分類當成商品的屬性：新開、還沒有商品的分類就沒有地方記錄，分類代碼也沒有主人。需要獨立存在、有自己識別碼的東西是實體。' },
          { roles: { total: { role: 'attribute', of: 'order' } },
            why: '把訂單金額畫成訂單的屬性：它能由各明細的數量乘以成交單價算出，情境也說不另外儲存。多存一份，就多一份會和明細不一致的資料。' },
        ],
      },
    ],
  },
  normalization: {
    explorer: {
      title: '店長的試算表 order_sheet',
      name: 'order_sheet',
      attributes: ['order_id', 'ordered_on', 'customer_id', 'customer_name', 'city', 'product_id', 'product_name', 'category', 'price', 'quantity'],
      fds: [
        { lhs: ['order_id'], rhs: ['ordered_on', 'customer_id', 'product_id', 'quantity'] },
        { lhs: ['customer_id'], rhs: ['customer_name', 'city'] },
        { lhs: ['product_id'], rhs: ['product_name', 'category', 'price'] },
      ],
      labels: { order_id: '訂單編號', ordered_on: '下單日', customer_id: '顧客編號', customer_name: '顧客姓名', city: '城市', product_id: '商品編號', product_name: '品名', category: '分類', price: '售價', quantity: '數量' },
      sample: [
        [1, '2025-01-03', 7, '林小美', '台北', 32, '藍牙耳機', '音訊', 1290, 2],
        [2, '2025-01-03', 9, '陳大文', '高雄', 15, '隨身碟', '儲存', 390, 1],
        [3, '2025-01-05', 7, '林小美', '台北', 15, '隨身碟', '儲存', 390, 3],
        [4, '2025-01-06', 12, '王志明', '台中', 32, '藍牙耳機', '音訊', 1290, 1],
        [5, '2025-01-06', 9, '陳大文', '高雄', 32, '藍牙耳機', '音訊', 1290, 1],
      ],
    },
    examples: [
      {
        id: 'nf-order-sheet', title: 'order_sheet：從試算表拆到 3NF',
        description: '一列一筆訂單的試算表。先拆出顧客，再拆出商品；每一步的候選鍵、正規形式與是否無損，都由函數相依算出。',
        relation: {
          name: 'order_sheet',
          attributes: ['order_id', 'ordered_on', 'customer_id', 'customer_name', 'city', 'product_id', 'product_name', 'category', 'price', 'quantity'],
          fds: [
            { lhs: ['order_id'], rhs: ['ordered_on', 'customer_id', 'product_id', 'quantity'] },
            { lhs: ['customer_id'], rhs: ['customer_name', 'city'] },
            { lhs: ['product_id'], rhs: ['product_name', 'category', 'price'] },
          ],
          labels: { order_id: '訂單編號', ordered_on: '下單日', customer_id: '顧客編號', customer_name: '顧客姓名', city: '城市', product_id: '商品編號', product_name: '品名', category: '分類', price: '售價', quantity: '數量' },
        },
        steps: [
          {
            title: '原始的試算表：只到 2NF',
            note: '唯一的候選鍵是 `order_id`。鍵只有一個欄位，不可能有部分相依，所以至少是 2NF；但 `customer_id` 與 `product_id` 都不是超鍵，卻決定姓名、城市、品名、分類與售價，這些是遞移相依。林小美的城市每下一單就記一次，藍牙耳機的售價也記了三次：改一處漏一處，就是更新異常。',
            parts: [{ name: 'order_sheet', attributes: ['order_id', 'ordered_on', 'customer_id', 'customer_name', 'city', 'product_id', 'product_name', 'category', 'price', 'quantity'] }],
          },
          {
            title: '拆出 customers：orders 仍只到 2NF',
            note: '依 `customer_id → customer_name, city` 拆出 `customers`，`orders` 留下 `customer_id` 當連結。`customers` 已經是 BCNF，合併回來無損；但 `orders` 裡還有 `product_id → product_name, category, price` 的遞移相依。',
            parts: [
              { name: 'customers', attributes: ['customer_id', 'customer_name', 'city'] },
              { name: 'orders', attributes: ['order_id', 'ordered_on', 'customer_id', 'product_id', 'product_name', 'category', 'price', 'quantity'] },
            ],
          },
          {
            title: '再拆出 products：三張表都到 3NF',
            note: '依 `product_id → product_name, category, price` 拆出 `products`。三張表都符合 3NF（而且都是 BCNF），分解無損，三條相依各由一張表的主鍵保證。這三張表正是 ER 圖的三個實體，也是 `sales` 資料集的三張表。',
            parts: [
              { name: 'customers', attributes: ['customer_id', 'customer_name', 'city'] },
              { name: 'products', attributes: ['product_id', 'product_name', 'category', 'price'] },
              { name: 'orders', attributes: ['order_id', 'ordered_on', 'customer_id', 'product_id', 'quantity'] },
            ],
          },
        ],
      },
    ],
    exercises: [],
  },
  // The B+ tree explorer belongs to DB11; this lesson reads plans in the SQL playground and checks exercise 2 by its plans.
  queryPlan: { trees: [] },
  driverCode: {
    examples: [
      {
        id: 'drv-shop-app', title: '串接程式：參數化查詢、拆單交易與唯讀連線',
        description: '程式自己建立記憶體中的資料庫與幾筆資料。「我的訂單」用兩個 ? 參數查詢，惡意輸入只是一個比不到的值；拆單在交易裡進行，出貨件數不合理就回滾；最後把連線設成只能讀，DELETE 被拒絕。',
        code: {
          Python: String.raw`import sqlite3

# isolation_level=None：驅動程式不自動開交易，交易由我們自己寫 BEGIN／COMMIT
conn = sqlite3.connect(':memory:', isolation_level=None)
conn.execute('PRAGMA foreign_keys = ON')
conn.executescript('''
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0));
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL,
  ordered_on TEXT NOT NULL
);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
INSERT INTO customers VALUES (1, '林小美'), (2, '陳大文');
INSERT INTO products VALUES (1, '藍牙耳機', 1290), (2, '隨身碟', 390);
INSERT INTO orders VALUES
  (1, 1, 1, 1, 'shipped', '2026-09-12'),
  (2, 2, 2, 3, 'shipped', '2026-09-20'),
  (3, 1, 2, 5, 'pending', '2026-10-01'),
  (4, 1, 2, 1, 'shipped', '2026-10-02');
''')

MY_ORDERS = '''
SELECT o.id, o.ordered_on, p.name, o.quantity * p.price AS amount
FROM orders o JOIN products p ON p.id = o.product_id
WHERE o.customer_id = ? AND o.status = ?
ORDER BY o.ordered_on DESC, o.id DESC'''


def my_orders(customer_id, status):
    # customer_id 來自登入的工作階段，status 來自網址：兩者都只當成值綁定
    return conn.execute(MY_ORDERS, (customer_id, status)).fetchall()


def split_order(order_id, ship_now):
    # 拆單：先出貨 ship_now 件，其餘另開一筆待出貨訂單；兩個修改一起成功或一起取消
    conn.execute('BEGIN')
    try:
        row = conn.execute("SELECT quantity FROM orders WHERE id = ? AND status = 'pending'",
                           (order_id,)).fetchone()
        if row is None or not 0 < ship_now < row[0]:
            raise ValueError('nothing to split')
        conn.execute("INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on) "
                     "SELECT customer_id, product_id, ?, 'pending', ordered_on FROM orders WHERE id = ?",
                     (row[0] - ship_now, order_id))
        conn.execute("UPDATE orders SET quantity = ?, status = 'shipped' WHERE id = ?", (ship_now, order_id))
        conn.execute('COMMIT')
        return 'committed'
    except Exception:
        conn.execute('ROLLBACK')
        return 'rolled back'


for status in ['shipped', "shipped' OR '1'='1"]:
    rows = my_orders(1, status)
    print(f'{status}: {len(rows)} rows')
    for r in rows:
        print(f'  #{r[0]} {r[1]} {r[2]} {r[3]}')
print('split #3, ship 9:', split_order(3, 9))
print('split #3, ship 3:', split_order(3, 3))
for r in conn.execute('SELECT id, quantity, status FROM orders WHERE customer_id = 1 ORDER BY id'):
    print(f'  #{r[0]} x{r[1]} {r[2]}')

conn.execute('PRAGMA query_only = ON')  # 報表用的連線：只能讀
try:
    conn.execute('DELETE FROM orders')
except sqlite3.Error as e:
    print('DELETE rejected:', e)`,
          JavaScript: String.raw`const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(` + '`' + String.raw`
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0));
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL,
  ordered_on TEXT NOT NULL
);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
INSERT INTO customers VALUES (1, '林小美'), (2, '陳大文');
INSERT INTO products VALUES (1, '藍牙耳機', 1290), (2, '隨身碟', 390);
INSERT INTO orders VALUES
  (1, 1, 1, 1, 'shipped', '2026-09-12'),
  (2, 2, 2, 3, 'shipped', '2026-09-20'),
  (3, 1, 2, 5, 'pending', '2026-10-01'),
  (4, 1, 2, 1, 'shipped', '2026-10-02');
` + '`' + String.raw`);

const myOrders = db.prepare(` + '`' + String.raw`
SELECT o.id, o.ordered_on, p.name, o.quantity * p.price AS amount
FROM orders o JOIN products p ON p.id = o.product_id
WHERE o.customer_id = ? AND o.status = ?
ORDER BY o.ordered_on DESC, o.id DESC` + '`' + String.raw`);

// 拆單：先出貨 shipNow 件，其餘另開一筆待出貨訂單；兩個修改一起成功或一起取消
function splitOrder(orderId, shipNow) {
  db.exec('BEGIN');
  try {
    const row = db.prepare("SELECT quantity FROM orders WHERE id = ? AND status = 'pending'").get(orderId);
    if (!row || !(shipNow > 0 && shipNow < row.quantity)) throw new Error('nothing to split');
    db.prepare("INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on) " +
      "SELECT customer_id, product_id, ?, 'pending', ordered_on FROM orders WHERE id = ?").run(row.quantity - shipNow, orderId);
    db.prepare("UPDATE orders SET quantity = ?, status = 'shipped' WHERE id = ?").run(shipNow, orderId);
    db.exec('COMMIT');
    return 'committed';
  } catch {
    db.exec('ROLLBACK');
    return 'rolled back';
  }
}

for (const status of ['shipped', "shipped' OR '1'='1"]) {
  // customerId 來自登入的工作階段，status 來自網址：兩者都只當成值綁定
  const rows = myOrders.all(1, status);
  console.log(` + '`${status}: ${rows.length} rows`' + String.raw`);
  for (const r of rows) console.log(` + '`  #${r.id} ${r.ordered_on} ${r.name} ${r.amount}`' + String.raw`);
}
console.log('split #3, ship 9:', splitOrder(3, 9));
console.log('split #3, ship 3:', splitOrder(3, 3));
for (const r of db.prepare('SELECT id, quantity, status FROM orders WHERE customer_id = 1 ORDER BY id').all())
  console.log(` + '`  #${r.id} x${r.quantity} ${r.status}`' + String.raw`);

db.exec('PRAGMA query_only = ON'); // 報表用的連線：只能讀
try {
  db.exec('DELETE FROM orders');
} catch (e) {
  console.log('DELETE rejected:', e.message);
}`,
          Java: String.raw`import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class Main {
    static final String MY_ORDERS = """
        SELECT o.id, o.ordered_on, p.name, o.quantity * p.price AS amount
        FROM orders o JOIN products p ON p.id = o.product_id
        WHERE o.customer_id = ? AND o.status = ?
        ORDER BY o.ordered_on DESC, o.id DESC""";

    // customerId 來自登入的工作階段，status 來自網址：兩者都只當成值綁定
    static List<String> myOrders(Connection conn, int customerId, String status) throws SQLException {
        List<String> rows = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(MY_ORDERS)) {
            ps.setInt(1, customerId);
            ps.setString(2, status);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next())
                    rows.add("  #" + rs.getInt(1) + " " + rs.getString(2) + " " + rs.getString(3) + " " + rs.getInt(4));
            }
        }
        return rows;
    }

    // 拆單：先出貨 shipNow 件，其餘另開一筆待出貨訂單；兩個修改一起成功或一起取消
    static String splitOrder(Connection conn, int orderId, int shipNow) throws SQLException {
        conn.setAutoCommit(false);  // JDBC 預設自動提交；關掉後由 commit／rollback 結束交易
        try {
            int quantity;
            try (PreparedStatement ps = conn.prepareStatement("SELECT quantity FROM orders WHERE id = ? AND status = 'pending'")) {
                ps.setInt(1, orderId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw new SQLException("nothing to split");
                    quantity = rs.getInt(1);
                }
            }
            if (shipNow <= 0 || shipNow >= quantity) throw new SQLException("nothing to split");
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on) "
                    + "SELECT customer_id, product_id, ?, 'pending', ordered_on FROM orders WHERE id = ?")) {
                ps.setInt(1, quantity - shipNow);
                ps.setInt(2, orderId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("UPDATE orders SET quantity = ?, status = 'shipped' WHERE id = ?")) {
                ps.setInt(1, shipNow);
                ps.setInt(2, orderId);
                ps.executeUpdate();
            }
            conn.commit();
            return "committed";
        } catch (SQLException e) {
            conn.rollback();
            return "rolled back";
        } finally {
            conn.setAutoCommit(true);
        }
    }

    public static void main(String[] args) throws SQLException {
        // 執行時需要 SQLite 的 JDBC 驅動程式（例如 sqlite-jdbc）在 classpath 上
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:");
             Statement st = conn.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON");
            st.executeUpdate("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
            st.executeUpdate("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK (price > 0))");
            st.executeUpdate("""
                CREATE TABLE orders (
                  id INTEGER PRIMARY KEY,
                  customer_id INTEGER NOT NULL REFERENCES customers(id),
                  product_id INTEGER NOT NULL REFERENCES products(id),
                  quantity INTEGER NOT NULL CHECK (quantity > 0),
                  status TEXT NOT NULL,
                  ordered_on TEXT NOT NULL
                )""");
            st.executeUpdate("CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on)");
            st.executeUpdate("INSERT INTO customers VALUES (1, '林小美'), (2, '陳大文')");
            st.executeUpdate("INSERT INTO products VALUES (1, '藍牙耳機', 1290), (2, '隨身碟', 390)");
            st.executeUpdate("""
                INSERT INTO orders VALUES
                  (1, 1, 1, 1, 'shipped', '2026-09-12'),
                  (2, 2, 2, 3, 'shipped', '2026-09-20'),
                  (3, 1, 2, 5, 'pending', '2026-10-01'),
                  (4, 1, 2, 1, 'shipped', '2026-10-02')""");

            for (String status : new String[] { "shipped", "shipped' OR '1'='1" }) {
                List<String> rows = myOrders(conn, 1, status);
                System.out.println(status + ": " + rows.size() + " rows");
                rows.forEach(System.out::println);
            }
            System.out.println("split #3, ship 9: " + splitOrder(conn, 3, 9));
            System.out.println("split #3, ship 3: " + splitOrder(conn, 3, 3));
            try (ResultSet rs = st.executeQuery("SELECT id, quantity, status FROM orders WHERE customer_id = 1 ORDER BY id")) {
                while (rs.next()) System.out.println("  #" + rs.getInt(1) + " x" + rs.getInt(2) + " " + rs.getString(3));
            }

            st.execute("PRAGMA query_only = ON");  // 報表用的連線：只能讀
            try {
                st.executeUpdate("DELETE FROM orders");
            } catch (SQLException e) {
                System.out.println("DELETE rejected: " + e.getMessage());
            }
        }
    }
}`,
        },
        output: `shipped: 2 rows
  #4 2026-10-02 隨身碟 390
  #1 2026-09-12 藍牙耳機 1290
shipped' OR '1'='1: 0 rows
split #3, ship 9: rolled back
split #3, ship 3: committed
  #1 x1 shipped
  #3 x3 shipped
  #4 x1 shipped
  #5 x2 pending
DELETE rejected: attempt to write a readonly database`,
      },
    ],
  },
  sql: {
    dataset: 'sales',
    params: true,
    presets: [
      { label: '主要功能：顧客 42 的訂單歷史', sql: HISTORY },
      { label: '讀計畫：訂單歷史（建索引前後各看一次）', sql: `EXPLAIN QUERY PLAN\n${HISTORY}` },
      { label: '建立複合索引（單獨執行一次）', sql: sql`CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id, ordered_on);` },
      { label: '量時間：台中最近有下單的顧客', sql: sql`SELECT COUNT(*) AS active
FROM customers c
WHERE c.city = '台中'
  AND (SELECT MAX(o.ordered_on) FROM orders o WHERE o.customer_id = c.id) >= '2026-09-01';` },
      { label: '參數化：我的訂單（參數框依序輸入顧客編號與狀態）', sql: sql`SELECT o.id, o.ordered_on, p.name AS product, o.quantity * p.price AS amount
FROM orders o
JOIN products p ON p.id = o.product_id
WHERE o.customer_id = ? AND o.status = ?
ORDER BY o.ordered_on DESC, o.id DESC
LIMIT 5;` },
    ],
    examples: [
      {
        id: 'sql-ddl-v1', title: '第一版的 DDL：每個約束對應一句需求', dataset: 'empty',
        description: '從 ER 圖與正規化得到的三張表。新增訂單時沒有給狀態，DEFAULT 填入 pending；最後用 JOIN 確認外鍵把三張表接起來了。',
        sql: sql`CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  joined_on TEXT NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0)
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'shipped', 'cancelled')),
  ordered_on TEXT NOT NULL
);
INSERT INTO customers VALUES (1, '林小美', '台北', '2025-01-08');
INSERT INTO products VALUES (1, '藍牙耳機', '音訊', 1290);
INSERT INTO orders (customer_id, product_id, quantity, ordered_on)
VALUES (1, 1, 2, '2026-10-01');
SELECT o.id, c.name, p.name AS product, o.quantity, o.status
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id;`,
        result: { columns: ['id', 'name', 'product', 'quantity', 'status'], rows: [[1, '林小美', '藍牙耳機', 2, 'pending']] },
      },
      {
        id: 'sql-history', title: '顧客訂單歷史：最新的 5 筆', dataset: 'sales',
        description: '顧客 42 的訂單，依下單日由新到舊、同一天再依編號由大到小，附上品名與金額。',
        sql: HISTORY,
        result: { columns: ['id', 'ordered_on', 'product', 'quantity', 'amount', 'status'], rows: [
          [22839, '2026-08-11', '商品032', 5, 9000, 'shipped'],
          [6839, '2026-08-11', '商品032', 5, 9000, 'pending'],
          [28839, '2026-05-23', '商品032', 5, 9000, 'shipped'],
          [12839, '2026-05-23', '商品032', 5, 9000, 'shipped'],
          [18839, '2026-03-04', '商品032', 5, 9000, 'shipped'],
        ] },
      },
      {
        id: 'sql-view-report', title: '報表檢視表 order_lines 與季報', dataset: 'sales',
        description: 'order_lines 把三張表的 JOIN 與金額計算包起來；季報只寫自己的篩選與分組：2026 年第三季每月的已出貨訂單數與營收。',
        sql: sql`CREATE VIEW order_lines AS
SELECT o.id AS order_id, o.ordered_on, o.status, o.customer_id, c.city,
  p.category, o.quantity, p.price, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id;
SELECT substr(ordered_on, 1, 7) AS month, COUNT(*) AS orders, SUM(amount) AS revenue
FROM order_lines
WHERE status = 'shipped'
  AND ordered_on >= '2026-07-01' AND ordered_on < '2026-10-01'
GROUP BY month
ORDER BY month;`,
        result: { columns: ['month', 'orders', 'revenue'], rows: [
          ['2026-07', 1205, 4935250],
          ['2026-08', 1164, 4988300],
          ['2026-09', 1164, 4802250],
        ] },
      },
      {
        id: 'sql-split-order', title: '拆單交易：先出 3 件，其餘 2 件另開訂單', dataset: 'sales',
        description: '訂單 14 待出貨 5 件。新訂單複製原訂單的顧客、商品與下單日，原訂單改成 3 件已出貨；兩個修改在同一筆交易裡。last_insert_rowid() 是剛新增的那一列的編號（SQLite 的函式）。',
        sql: sql`BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, status, ordered_on)
SELECT customer_id, product_id, 2, 'pending', ordered_on
FROM orders
WHERE id = 14 AND status = 'pending' AND quantity = 5;
UPDATE orders SET quantity = 3, status = 'shipped'
WHERE id = 14 AND status = 'pending' AND quantity = 5;
COMMIT;
SELECT id, customer_id, product_id, quantity, status, ordered_on
FROM orders
WHERE id IN (14, last_insert_rowid())
ORDER BY id;`,
        result: { columns: ['id', 'customer_id', 'product_id', 'quantity', 'status', 'ordered_on'], rows: [
          [14, 867, 7, 3, 'shipped', '2025-07-02'],
          [30001, 867, 7, 2, 'pending', '2025-07-02'],
        ] },
      },
      {
        id: 'plan-history-before', title: '加索引之前：全表掃描再排序', dataset: 'sales',
        description: '訂單歷史的計畫：掃描整張 orders 找顧客 42 的訂單，每筆用主鍵找商品，最後另外排序。',
        sql: `EXPLAIN QUERY PLAN\n${HISTORY}`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [5, 0, 216, 'SCAN o'],
          [9, 0, 45, 'SEARCH p USING INTEGER PRIMARY KEY (rowid=?)'],
          [28, 0, 0, 'USE TEMP B-TREE FOR ORDER BY'],
        ] },
      },
      {
        id: 'plan-history-after', title: '加上 (customer_id, ordered_on) 之後：搜尋，不必排序', dataset: 'sales',
        description: '同一個查詢。複合索引讓 SQLite 直接搜尋到顧客 42 的那一段，項目已依日期排好，全表掃描與額外排序都不見了。',
        sql: `CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);\nEXPLAIN QUERY PLAN\n${HISTORY}`,
        result: { columns: ['id', 'parent', 'notused', 'detail'], rows: [
          [6, 0, 62, 'SEARCH o USING INDEX idx_orders_customer_date (customer_id=?)'],
          [11, 0, 45, 'SEARCH p USING INTEGER PRIMARY KEY (rowid=?)'],
        ] },
      },
      {
        id: 'sql-injection-demo', title: '拼接與綁定：同一個輸入，兩種結果', dataset: 'sales',
        description: 'intended 是正常輸入；spliced 是把惡意輸入拼進 SQL 文字後的條件；bound 等於參數綁定：整段輸入只當一個值，和 status 比較。',
        sql: sql`SELECT
  (SELECT COUNT(*) FROM orders
   WHERE customer_id = 42 AND status = 'shipped') AS intended,
  (SELECT COUNT(*) FROM orders
   WHERE customer_id = 42 AND status = 'shipped' OR '1'='1') AS spliced,
  (SELECT COUNT(*) FROM orders
   WHERE customer_id = 42 AND status = 'shipped'' OR ''1''=''1') AS bound;`,
        result: { columns: ['intended', 'spliced', 'bound'], rows: [[13, 30000, 0]] },
      },
    ],
    exercises: [
      {
        id: 'ex-v2-schema', title: '第二版的綱要：訂單明細、約束與索引',
        statement: '第二版需求：一筆訂單可以買好幾種商品，訂單裡的每一種商品都要記下數量與成交單價（商品會調價，舊訂單的金額不能跟著改變）；分類改成一張表（也就是 ER 練習「第二版的 ER 圖」的設計）。答案框已經寫好 `categories`、`customers`、`products` 三張表，請保留它們，接著寫出：(1) `orders`：`id` 整數主鍵；`customer_id` 必填，參照 `customers(id)`；`status` 必填，只能是 `\'pending\'`、`\'shipped\'`、`\'cancelled\'`，預設 `\'pending\'`；`ordered_on` 必填（`YYYY-MM-DD` 文字）。第二版的 `orders` 不再有 `product_id` 與 `quantity`。(2) `order_items`（訂單明細）：`order_id` 參照 `orders(id)`、`product_id` 參照 `products(id)`，兩者必填，同一筆訂單的同一種商品只能有一列；`quantity` 必填且大於 0；`unit_price`（成交單價，元）必填且不可為負（贈品是 0）。(3) 建立索引，讓下列三種查詢都不全表掃描、也不掃描整個索引：某位顧客的訂單 `WHERE customer_id = ? ORDER BY ordered_on DESC`（而且不需要額外排序）、一筆訂單的明細（`order_items` 的 `WHERE order_id = ?`）、某項商品的銷售明細（`order_items` 的 `WHERE product_id = ?`）。檢查時會在你的 SQL 之後插入合法與不合法的資料，並用 `EXPLAIN QUERY PLAN` 檢查這些查詢的計畫。',
        dataset: 'empty', hidden: ['empty'], ordered: true,
        starter: `${V2_GIVEN}\n\n-- (1) orders\n\n-- (2) order_items\n\n-- (3) 索引\n`,
        hints: [
          '`order_items` 是多對多的中介表（DB09）：「同一筆訂單的同一種商品只能有一列」就是 `(order_id, product_id)` 不可重複，用複合主鍵或 `UNIQUE` 都可以。',
          '`CHECK (quantity > 0)` 遇到 NULL 不算違反，「必填」還要另外寫 `NOT NULL`。外鍵不會自動建立索引（SQLite 與 PostgreSQL 都不會），參照欄位上的查詢要自己建索引。',
          '複合主鍵 `(order_id, product_id)` 會建立一個以 `order_id` 開頭的索引，能搜尋 `order_id`，卻不能搜尋只給 `product_id` 的條件。顧客的訂單要搜尋又不排序，索引是 `(customer_id, ordered_on)`。',
        ],
        solution: `${V2_GIVEN}\n${V2_ORDERS}\n${V2_ITEMS}\nCREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);\nCREATE INDEX idx_order_items_product ON order_items(product_id);`,
        alternatives: [
          `${V2_GIVEN}
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ordered_on TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  CHECK (status IN ('pending', 'shipped', 'cancelled'))
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  UNIQUE (order_id, product_id)
);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on DESC);
CREATE INDEX idx_order_items_product ON order_items(product_id);`,
          `${V2_GIVEN}
${V2_ORDERS}
CREATE TABLE order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (product_id, order_id)
);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
CREATE INDEX idx_order_items_order ON order_items(order_id);`,
        ],
        mistakes: [
          { sql: `${V2_GIVEN}
${V2_ORDERS}
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0)
);
CREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);`, why: '加了代理鍵 `id`，卻忘了 `UNIQUE (order_id, product_id)`：同一筆訂單可以把同一種商品記成兩列，數量與金額就各說各話。代理鍵不能取代需求裡的唯一性。' },
          { sql: `${V2_GIVEN}\n${V2_ORDERS}\n${V2_ITEMS}\nCREATE INDEX idx_orders_customer ON orders(customer_id);\nCREATE INDEX idx_order_items_product ON order_items(product_id);`,
            why: '只替 `customer_id` 建索引：找得到顧客的訂單，但找到之後還要依 `ordered_on` 另外排序（`USE TEMP B-TREE FOR ORDER BY`）。排序的欄位要接在等值欄位後面：`(customer_id, ordered_on)`。' },
          { sql: `${V2_GIVEN}\n${V2_ORDERS}\n${V2_ITEMS}\nCREATE INDEX idx_orders_customer_date ON orders(customer_id, ordered_on);`,
            why: '以為主鍵與外鍵就夠了：複合主鍵 `(order_id, product_id)` 的索引以 `order_id` 開頭，只給 `product_id` 的查詢缺了最左欄，計畫仍是 `SCAN order_items`；外鍵本身也不會建立索引。' },
        ],
        probes: [
          { label: '新增分類', sql: sql`INSERT INTO categories (code, name) VALUES ('AUD', '音訊'), ('STO', '儲存');` },
          { label: '新增顧客', sql: sql`INSERT INTO customers (id, name, city) VALUES (1, '林小美', '台北'), (2, '陳大文', '高雄');` },
          { label: '新增商品', sql: sql`INSERT INTO products (id, name, category, price) VALUES (1, '藍牙耳機', 'AUD', 1290), (2, '隨身碟', 'STO', 390), (3, '喇叭', 'AUD', 2490);` },
          { label: '新增訂單（沒給狀態）：應該接受', sql: sql`INSERT INTO orders (id, customer_id, ordered_on) VALUES (10, 1, '2026-10-01');` },
          { label: '一筆訂單兩種商品，隨身碟以特價成交：應該接受', sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (10, 1, 1, 1290), (10, 2, 3, 350);` },
          { label: '同一筆訂單再記一次藍牙耳機：應該拒絕', sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (10, 1, 2, 1290);` },
          { label: '數量 0：應該拒絕', sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (10, 3, 0, 2490);` },
          { label: '不存在的顧客 99：應該拒絕', sql: sql`INSERT INTO orders (id, customer_id, ordered_on) VALUES (11, 99, '2026-10-02');` },
          { label: '訂單的內容（狀態應為預設值）', sql: sql`SELECT id, customer_id, status, ordered_on FROM orders ORDER BY id;` },
          { label: '某位顧客的訂單：不可全部掃描、不可額外排序', sql: sql`SELECT id, status, ordered_on FROM orders WHERE customer_id = 1 ORDER BY ordered_on DESC;`, plan: { maxFullScans: 0, noTempSort: true } },
          { label: '某項商品的銷售明細：不可全部掃描', sql: sql`SELECT order_id, quantity, unit_price FROM order_items WHERE product_id = 2;`, plan: { maxFullScans: 0 } },
          { label: '狀態打錯', hidden: true, sql: sql`INSERT INTO orders (id, customer_id, status, ordered_on) VALUES (12, 2, 'lost', '2026-10-03');` },
          { label: '已出貨的訂單', hidden: true, sql: sql`INSERT INTO orders (id, customer_id, status, ordered_on) VALUES (13, 2, 'shipped', '2026-10-04');` },
          { label: '沒有下單日', hidden: true, sql: sql`INSERT INTO orders (id, customer_id) VALUES (14, 2);` },
          { label: '沒有顧客', hidden: true, sql: sql`INSERT INTO orders (id, ordered_on) VALUES (15, '2026-10-05');` },
          { label: '不存在的訂單', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (99, 1, 1, 1290);` },
          { label: '不存在的商品', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (13, 9, 1, 100);` },
          { label: '沒有數量', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (13, 1, NULL, 1290);` },
          { label: '沒有成交單價', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (13, 3, 1, NULL);` },
          { label: '負的成交單價', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (13, 3, 2, -1);` },
          { label: '贈品：成交單價 0', hidden: true, sql: sql`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (13, 3, 2, 0);` },
          { label: '明細的內容', hidden: true, sql: sql`SELECT order_id, product_id, quantity, unit_price FROM order_items ORDER BY order_id, product_id;` },
          { label: '一筆訂單的明細', hidden: true, sql: sql`SELECT product_id, quantity FROM order_items WHERE order_id = 13;`, plan: { maxFullScans: 0 } },
          { label: '另一位顧客最近的訂單', hidden: true, sql: sql`SELECT id FROM orders WHERE customer_id = 2 AND ordered_on >= '2026-10-01' ORDER BY ordered_on DESC;`, plan: { maxFullScans: 0, noTempSort: true } },
        ],
      },
      {
        id: 'ex-city-report', title: '上線前的報表查詢：參數化與惡意輸入',
        statement: '管理後台要上線「各分類營收」報表：店長從下拉選單選一個城市，程式把它當成參數傳給 SQL；選「全部城市」時傳入 NULL。網址可以被任何人改寫，所以參數可能是任何文字。請在 `sales` 上寫出這個參數化查詢：整段 SQL 剛好用一個 `?` 代表城市，不要把城市寫死。只算已出貨（`status = \'shipped\'`）的訂單，依商品分類統計，欄位依序為 `category`、`orders`（訂單數）、`revenue`（`quantity` 乘以 `price` 的總和）；顧客的城市要和參數完全相同才算，參數是 NULL 時統計所有城市。依 `revenue` 由大到小排列，相同時依 `category` 由小到大。檢查時會用下列每一組參數各執行一次，包括惡意輸入與萬用字元。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true, columnNames: true,
        starter: sql`SELECT p.category, COUNT(*) AS orders, SUM(o.quantity * p.price) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
WHERE o.status = 'shipped' AND c.city = '台北'
GROUP BY p.category
ORDER BY revenue DESC, p.category;`,
        hints: [
          '答案框裡是寫死台北的版本，結果是對的。先把 `\'台北\'` 換成 `?`，在練習場的參數框輸入 `台北` 執行看看。',
          '參數是 NULL 時，`c.city = ?` 變成 `c.city = NULL`，結果是 NULL 而不是 true，一列都不會留下。`COALESCE(?, c.city)` 在參數不是 NULL 時就是參數，是 NULL 時換成這一列自己的城市。',
          '在參數框分別輸入 `NULL` 與 `%` 試試。參數化之後 SQL 的文字不會變，但 `LIKE` 仍會把值裡的 `%` 當成萬用字元；「完全相同」要用 `=`。',
        ],
        solution: report(`WHERE o.status = 'shipped' AND c.city = COALESCE(?, c.city)`),
        alternatives: [
          report(`WHERE o.status = 'shipped' AND c.city = IFNULL(?, c.city)`),
          sql`WITH params(city) AS (SELECT ?)
SELECT p.category, COUNT(*) AS orders, SUM(o.quantity * p.price) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
CROSS JOIN params
WHERE o.status = 'shipped' AND (params.city IS NULL OR c.city = params.city)
GROUP BY p.category
ORDER BY revenue DESC, p.category;`,
          sql`SELECT p.category, COUNT(*) AS orders, SUM(o.quantity * p.price) AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
WHERE o.status = 'shipped'
  AND o.customer_id IN (SELECT id FROM customers WHERE city = COALESCE(?, city))
GROUP BY p.category
ORDER BY revenue DESC, p.category;`,
        ],
        mistakes: [
          { sql: report(`WHERE o.status = 'shipped' AND c.city = ?`),
            why: '沒有處理 NULL：選「全部城市」時條件變成 `c.city = NULL`，結果是 NULL，一列都不留，報表一片空白。' },
          { sql: report(`WHERE o.status = 'shipped' AND c.city LIKE COALESCE(?, c.city)`),
            why: '用 `LIKE` 比較城市：一般的城市名稱結果相同，但輸入 `%` 時符合每一個城市，等於繞過了城市的篩選。參數化擋得住 injection，擋不住 `LIKE` 本來的萬用字元語意；完全相同要用 `=`。' },
          { sql: report(`WHERE o.status = 'shipped' AND c.city = COALESCE(c.city, ?)`),
            why: '`COALESCE` 的參數順序寫反了：它回傳第一個不是 NULL 的值，`c.city` 永遠不是 NULL，參數完全被忽略，選台北也是全部城市的營收。' },
        ],
        paramSets: [
          { label: '台北', values: ['台北'] },
          { label: '全部城市（NULL）', values: [null] },
          { label: '惡意輸入 台北\' OR \'1\'=\'1', values: ['台北\' OR \'1\'=\'1'] },
          { label: '萬用字元 %', values: ['%'] },
          { label: '高雄', values: ['高雄'], hidden: true },
          { label: '新竹', values: ['新竹'], hidden: true },
        ],
      },
    ],
  },
};
