import type { LessonContent } from '../schema';

const sql = String.raw;

/** The relational tables DB18 derives from the order documents (the same data, flattened). */
const flatten = sql`CREATE TABLE customers AS
  SELECT DISTINCT doc ->> '$.customer.id' AS id, doc ->> '$.customer.name' AS name, doc ->> '$.customer.city' AS city
  FROM orders_doc;
CREATE TABLE orders AS
  SELECT id, doc ->> '$.customer.id' AS customer_id, doc ->> '$.status' AS status, doc ->> '$.ordered_on' AS ordered_on
  FROM orders_doc;
CREATE TABLE order_items AS
  SELECT o.id AS order_id, j.value ->> '$.product' AS product, j.value ->> '$.qty' AS qty, j.value ->> '$.price' AS price
  FROM orders_doc AS o, json_each(o.doc, '$.items') AS j;`;

/** Who each user reaches by following links (the graph exercise's reference). */
const reachAll = sql`WITH RECURSIVE reach(start, person) AS (
  SELECT follower, followee FROM follows
  UNION
  SELECT r.start, f.followee
  FROM reach AS r
    JOIN follows AS f ON f.follower = r.person
)`;

/** DB18 NoSQL data models. SQL + visualization (ds-comparison) lesson (Phase F.1d): SQL runs in tests/curriculum-sql.test.ts. */
export const DB18: LessonContent = {
  lessonId: 'DB18',
  motivation: '到目前為止，資料都放在關聯表裡：一張訂單拆成訂單、明細、顧客三張表，用的時候再 JOIN 回來。很多系統卻不是這樣存的：購物網站的登入工作階段放在只認得鍵的鍵值資料庫，商品目錄與訂單整筆存成一份 JSON 文件，每台感測器每秒一筆的讀數放在寬欄資料庫，「你可能認識的人」在圖形資料庫裡沿著好友關係走。這些統稱 NoSQL 的資料庫，不是比關聯式「新」或「快」，而是為不同的存取模式而設計：資料長什麼樣子，取決於你最常怎麼讀它。本課先把同一份訂單分別存成 JSON 文件與關聯表，在 SQL 練習場用 SQLite 的 JSON 函式查詢內嵌欄位、把品項陣列展開成列，用鍵值表依鍵取值，再用遞迴 CTE 沿著追蹤關係走訪一張圖；這些都是用 SQLite 模擬，讓你親手看見每種模型的形狀，MongoDB、Redis、Cassandra、Neo4j 自己的查詢語法則以標示清楚的文字對照。接著學會依存取模式決定該內嵌還是參照，弄清楚分散式系統的 CAP 取捨與最終一致性到底保證什麼、不保證什麼，最後為一個情境選擇關聯式或某一類 NoSQL，並說得出理由。',
  sections: [
    {
      id: 'same-data-two-ways', title: '同一份訂單：JSON 文件與關聯表',
      blocks: [
        { type: 'p', text: '本課的資料集 `documents` 有一張 `orders_doc`：每一列是一份訂單文件，`doc` 欄位是 JSON 文字，顧客（`customer`）與品項（`items`，一個陣列）都直接內嵌在文件裡。讀一張完整的訂單，只要依編號取出一份文件：' },
        { type: 'example', id: 'doc-one-order' },
        { type: 'p', text: '同一份資料若依 DB09、DB10 的方法設計成關聯表，會拆成三張：`customers`（顧客）、`orders`（訂單，存 `customer_id`）、`order_items`（每個品項一列，存 `order_id`）。下面的範例直接從文件把三張表做出來（`CREATE TABLE … AS SELECT` 把查詢結果存成新表），再用兩個 JOIN 把 3 號訂單組回來：' },
        { type: 'example', id: 'flatten-to-tables' },
        { type: 'table', head: ['', 'JSON 文件（`orders_doc`）', '關聯表（`customers`、`orders`、`order_items`）'], rows: [
          ['讀一張完整的訂單', '依鍵取一份文件，不用 JOIN', 'JOIN 三張表，再由程式組回巢狀結構'],
          ['顧客資料', '每份訂單各存一份複本', '只存一次，訂單用 `customer_id` 參照'],
          ['問「台北顧客買了幾個無線滑鼠」', '要展開每份文件的陣列再彙總（第 4 節）', '一般的 JOIN 與 `GROUP BY`'],
          ['顧客搬家', '每一份含他的文件都要改（第 5 節）', '改一列'],
          ['結構檢查', '寫入時通常不檢查欄位（第 2 節）', '綱要與約束在寫入時檢查（DB07）'],
        ] },
        { type: 'p', text: '兩種設計存的是同一份事實，差別在於「哪種讀取最省事」：文件把常一起讀的資料預先放在一起，像是預先 JOIN 好的結果；關聯表把每個事實只存一次，任何組合都能事後用 JOIN 拼出來。DB10 的反正規化說的正是這種取捨。本課的目標：拿到一份資料與它的查詢需求，你能把它設計成兩種樣子，並說出哪一種較適合。' },
        { type: 'callout', tone: 'warning', title: '本課用 SQLite 模擬各種模型', text: '練習場執行的是 SQLite。`json_extract`、`->>`、`json_each` 等是 SQLite 的 JSON 函式，`sessions_kv` 與 `follows` 也只是普通的表：本課用它們看見文件、鍵值與圖的資料形狀，不是 MongoDB、Redis、Cassandra 或 Neo4j 的實際查詢方式。那些產品的語法本課只以文字對照（示意，網站未執行），寫法以各產品的文件為準。' },
      ],
    },
    {
      id: 'four-models', title: '四種 NoSQL 資料模型',
      blocks: [
        { type: 'p', text: 'NoSQL 一詞通常解讀為「not only SQL」，泛指不以關聯表為主要資料模型的資料庫。它不是一種技術，而是好幾類設計目標不同的系統，常見的四類如下（產品只是例子）：' },
        { type: 'table', head: ['模型', '資料的單位', '主要的存取方式', '常見用途', '產品例子'], rows: [
          ['鍵值（key-value）', '一個鍵對應一個值；值的內容資料庫多半不解讀', '依鍵讀、寫、刪', '登入工作階段、快取、購物車暫存、計數器', 'Redis'],
          ['文件（document）', '一份 JSON 之類的巢狀文件，可以內嵌物件與陣列', '依鍵取整份文件，也能依文件裡的欄位查詢與建索引', '商品目錄、整筆讀出的訂單、內容管理', 'MongoDB'],
          ['寬欄（wide-column）', '依分區鍵分組的列，分區內依叢集鍵排序；各列可以有不同的欄', '依分區鍵（加上叢集鍵的範圍）讀取', '大量寫入的時間序列、事件紀錄、訊息時間線', 'Apache Cassandra'],
          ['圖形（graph）', '節點與邊（關係），兩者都可以帶屬性', '從某些節點出發，沿著關係走訪、比對路徑模式', '社群關係、推薦、權限與相依關係網', 'Neo4j'],
        ] },
        { type: 'p', text: '四類共同的特色，是把資料的形狀配合最主要的存取模式：鍵值只承諾「依鍵很快」；文件把一起讀的東西放在一起；寬欄把一個查詢要的列放在同一個分區、照查詢的順序排好；圖把關係本身當成資料存起來。換來的代價通常是：事先沒想到的查詢（任意 JOIN、臨時的彙總）比較難寫或很慢，跨多筆資料的交易也比較受限。' },
        { type: 'p', text: '「NoSQL 沒有綱要」並不精確。比較好的說法是：關聯式資料庫在寫入時檢查綱要（schema-on-write），文件資料庫通常把綱要留到讀取時由程式解讀（schema-on-read）。`orders_doc` 的 `CHECK (json_valid(doc))` 只保證文字是語法正確的 JSON，欄位名稱拼錯照樣寫得進去：' },
        { type: 'example', id: 'schema-on-read' },
        { type: 'p', text: '7 號訂單把 `customer` 拼成了 `custmer`，也漏了 `ordered_on`。寫入時沒有任何錯誤，查詢時這些欄位只是安靜地變成 `NULL`，`items` 是空陣列也沒人阻止。彈性是真的：新文件可以多一個欄位，不必先 `ALTER TABLE`；但「每份訂單都要有顧客」這類規則，從資料庫移到了每一支讀寫它的程式身上。許多文件資料庫也提供可選的綱要驗證（例如 MongoDB 的 JSON Schema 驗證），要不要用由設計者決定。' },
        { type: 'p', text: '寬欄模型最容易誤會成「欄很多的表」。它的關鍵是主鍵分成兩段：分區鍵（partition key）決定這一列放在哪一台機器的哪一個分區，叢集鍵（clustering key）決定分區內的排列順序。在 Cassandra 的 CQL 裡（示意，網站未執行），「每位使用者的訊息，依時間由新到舊」是這樣設計的：' },
        { type: 'table', head: ['CQL（Cassandra，示意）', '意思'], rows: [
          ['`CREATE TABLE messages_by_user (user_id text, sent_at timestamp, body text, PRIMARY KEY ((user_id), sent_at)) WITH CLUSTERING ORDER BY (sent_at DESC);`', '分區鍵 `user_id`、叢集鍵 `sent_at`：同一位使用者的訊息在同一個分區，依時間由新到舊排好'],
          ['`SELECT * FROM messages_by_user WHERE user_id = \'alice\' LIMIT 20;`', '只讀一個分區，而且已經排好序：這就是這張表被設計來回答的查詢'],
          ['`SELECT * FROM messages_by_user WHERE body = \'早安\';`', '不是依主鍵查詢：Cassandra 預設會拒絕，除非加上 `ALLOW FILTERING` 或另建索引；常見做法是再建一張依那個欄位分區的表'],
        ] },
        { type: 'p', text: '在 SQLite 裡，可以用複合主鍵模擬「分區內依叢集鍵排序」：`WITHOUT ROWID` 的表直接依主鍵順序存放（SQLite 的功能），`(user_id, sent_at)` 就像 DB11 的複合索引，同一位使用者的訊息依時間排在一起：' },
        { type: 'example', id: 'wide-column-sim' },
        { type: 'p', text: '把範例貼到練習場執行，再對最後的查詢加上 `EXPLAIN QUERY PLAN`，會看到 `SEARCH messages_by_user USING PRIMARY KEY (user_id=?)`，而且沒有額外排序；改成 `WHERE body LIKE \'%雨%\'` 則變成 `SCAN`。差別在於：Cassandra 會把不同的分區分散到很多台機器上，這才是它為大量寫入而設計的地方，單一的 SQLite 檔案只能模擬分區內的順序。寬欄資料庫的設計因此是「先列出查詢，再為每個查詢設計一張表」，同一份資料常常為不同查詢存好幾份。' },
      ],
    },
    {
      id: 'key-value', title: '鍵值資料庫：只認得鍵',
      blocks: [
        { type: 'p', text: '鍵值模型是最簡單的一種：一個鍵、一個值，就像 D09 的 Map／Dictionary，只是放在資料庫伺服器上，而且常常分散在很多台機器上。`sessions_kv` 模擬它：鍵是 `session:a1`、`cart:alice` 這樣的字串，值是一段資料庫不解讀的文字。依鍵取值是一次主鍵查找：' },
        { type: 'example', id: 'kv-get' },
        { type: 'p', text: '鍵的命名是設計的重點：`session:`、`cart:`、`rate:` 這類前綴讓同一種資料的鍵彼此相鄰，程式拿得到鍵就拿得到值。反過來，想用值的內容找資料，例如「bob 的工作階段是哪一個」，鍵值資料庫沒有答案，只能把值一個一個打開看：' },
        { type: 'example', id: 'kv-by-value' },
        { type: 'p', text: '在 SQLite 裡這行得通，只是 `EXPLAIN QUERY PLAN` 顯示 `SCAN sessions_kv`，要讀過每一列。真正的鍵值資料庫通常根本不提供依值查詢：要依使用者找工作階段，就在寫入時多存一個鍵，例如 `user:bob:session` 對應到 `session:b2`，兩個鍵由程式一起維護。這是鍵值模型的基本取捨：資料庫只做一件事，做得簡單；其他的存取路徑要由程式事先設計好。' },
        { type: 'table', head: ['Redis 命令（示意，網站未執行）', '作用'], rows: [
          ['`SET session:a1 \'{"user":"alice"}\' EX 1800`', '寫入一個鍵，1800 秒後自動過期（工作階段、快取常用）'],
          ['`GET session:a1`', '依鍵取值；鍵不存在時回傳空值'],
          ['`DEL session:a1`', '刪除這個鍵'],
          ['`SCAN 0 MATCH session:*`', '逐批列出符合樣式的鍵：要走過整個鍵空間，用於維護工作，不是一般查詢'],
        ] },
        { type: 'callout', tone: 'note', title: '值不一定只是一段文字', text: 'Redis 的值可以是字串、清單、雜湊、集合、有序集合等資料結構，並有對應的命令（例如把計數器加一、把元素放進清單）。這讓「計數器」「排行榜」不必讀出整個值再寫回。但存取的起點仍然是鍵：沒有鍵，就沒有路。' },
      ],
    },
    {
      id: 'documents', title: '文件資料庫：查詢內嵌欄位與展開陣列',
      blocks: [
        { type: 'p', text: '文件模型比鍵值多做一步：資料庫看得懂文件的結構，可以依文件裡的欄位查詢、建索引。在 SQLite 裡，用 JSON 路徑指出巢狀欄位：`$` 是整份文件，`$.customer.city` 是 `customer` 物件裡的 `city`。`doc ->> \'$.customer.city\'` 取出 SQL 的值（文字、數字），等同 `json_extract(doc, \'$.customer.city\')`：' },
        { type: 'example', id: 'doc-nested-filter' },
        { type: 'p', text: '`json_array_length(doc, \'$.items\')` 算陣列有幾個元素，這裡是每份訂單有幾個品項。注意 `->` 與 `->>` 的差別（兩個運算子都是 SQLite 3.38 起的語法）：' },
        { type: 'table', head: ['寫法', '回傳', '`WHERE … = \'台北\'`'], rows: [
          ['`doc ->> \'$.customer.city\'`', 'SQL 的值：文字 `台北`', '成立'],
          ['`json_extract(doc, \'$.customer.city\')`', '同上', '成立'],
          ['`doc -> \'$.customer.city\'`', 'JSON 文字：帶著雙引號的 `"台北"`', '不成立：`"台北"` 和 `台北` 是不同的字串，查詢安靜地傳回 0 列'],
          ['`doc ->> \'$.city\'`', '路徑不存在：`NULL`', '不成立，也不會報錯'],
        ] },
        { type: 'p', text: '品項是陣列，不能直接 `SUM`。`json_each(doc, \'$.items\')` 是一個表值函式：對每份文件，陣列裡的每個元素變成一列，`key` 是元素的位置（從 0 起），`value` 是元素本身。把它寫在 `FROM` 裡，就像和陣列做 JOIN：' },
        { type: 'example', id: 'doc-unwind-items' },
        { type: 'p', text: '展開之後就是一般的列，可以 `GROUP BY`、`SUM`：例如 `SUM((j.value ->> \'$.qty\') * (j.value ->> \'$.price\'))` 依 `o.id` 分組，就是每份訂單的金額（預設查詢裡有）。展開後的每一列是「一個品項」，不是「一份訂單」：`COUNT(*)` 數的是品項列數，要數件數得 `SUM` 數量，要數訂單得 `COUNT(DISTINCT o.id)`。' },
        { type: 'table', head: ['需求', 'SQLite（本課）', 'MongoDB（示意，網站未執行）'], rows: [
          ['依內嵌欄位查詢', '`WHERE doc ->> \'$.customer.city\' = \'台北\'`', '`db.orders.find({ "customer.city": "台北" })`'],
          ['替內嵌欄位建索引', '`CREATE INDEX … ON orders_doc (doc ->> \'$.customer.city\')`（運算式索引）', '`db.orders.createIndex({ "customer.city": 1 })`'],
          ['展開陣列再彙總', '`FROM orders_doc AS o, json_each(o.doc, \'$.items\') AS j … GROUP BY …`', '`db.orders.aggregate([{ $unwind: "$items" }, { $group: { _id: "$items.product", qty: { $sum: "$items.qty" } } }])`'],
          ['修改文件裡的一個欄位', '`UPDATE orders_doc SET doc = json_set(doc, \'$.status\', \'shipped\') WHERE id = 3`', '`db.orders.updateOne({ _id: 3 }, { $set: { status: "shipped" } })`'],
        ] },
        { type: 'callout', tone: 'note', title: '關聯式資料庫也存 JSON', text: '把 JSON 放進關聯表的一個欄位很常見，但語法各家不同。SQL:2016 標準定義了 `JSON_VALUE`、`JSON_QUERY`、`JSON_TABLE` 等函式；SQLite 用的是自己的 `json_extract`、`json_each` 與 `->`、`->>`；MySQL 的 `->>` 也接受 `\'$.customer.city\'` 這樣的路徑；PostgreSQL 的 `jsonb` 型別用 `doc -> \'customer\' ->> \'city\'`，右邊是鍵名而不是路徑。所以「要不要用文件模型」和「要不要換一套資料庫」是兩個問題：一個關聯式資料庫裡，也可以有幾張表的某個欄位是文件。' },
      ],
    },
    {
      id: 'embed-or-reference', title: '內嵌或參照：依存取模式設計文件',
      blocks: [
        { type: 'p', text: '設計文件時最核心的決定是：相關的資料要內嵌（embed）在同一份文件裡，還是另存一份、用鍵參照（reference）？內嵌讓一次讀取就拿到全部，代價是重複；先看 `orders_doc` 裡的顧客資料有幾份複本。下面的範例把 5 號訂單裡林建宏的城市改成台南，卻沒有改他的 2 號訂單：' },
        { type: 'example', id: 'doc-copies-drift' },
        { type: 'p', text: '陳美玲與林建宏都各有兩份複本，而林建宏現在有兩個不同的城市：這就是 DB10 的更新異常，只是發生在文件裡。要改對，得找出每一份含他的文件：`UPDATE orders_doc SET doc = json_set(doc, \'$.customer.city\', \'台南\') WHERE doc ->> \'$.customer.id\' = 2;` 一次改了 2 份（在練習場接著執行 `SELECT changes();` 會看到 2）。如果他有上千筆訂單，就是上千份文件。' },
        { type: 'p', text: '不過，先問清楚這個欄位的意思。如果訂單裡的 `city` 是「這筆訂單寄到哪裡」，它是訂單本身的事實：舊訂單當時就是寄到台中，搬家後不該被改掉，內嵌一份快照才是對的；品項裡的 `price` 也一樣，是下單時的價格，商品之後漲價不影響舊訂單。如果它是「顧客目前住在哪裡」，那它屬於顧客，應該只存在顧客自己的文件裡，訂單用 `customer.id` 參照。同一個欄位名稱，意思不同，設計就不同。' },
        { type: 'table', head: ['傾向內嵌', '傾向參照'], rows: [
          ['幾乎總是和主文件一起讀（訂單和它的品項）', '常常單獨讀取或修改（顧客的個人資料）'],
          ['屬於主文件、不和別人共用（一對一、一對少數）', '被很多文件共用（同一位顧客的上千筆訂單、同一件商品）'],
          ['數量有上限、不會無限增長（一張訂單的品項）', '會無限增長（熱門貼文的留言、感測器的讀數）；文件也有大小上限，例如 MongoDB 單一文件最大 16 MB'],
          ['需要記錄當時的值（下單時的地址與價格）', '必須永遠是最新的值（目前的庫存、目前的地址）'],
          ['要一起原子地修改（文件資料庫通常保證單一文件的修改是原子的）', '多對多（學生與課程、使用者與群組）'],
        ] },
        { type: 'p', text: '反方向也做得到：從關聯表組出文件。下面的範例在 `shop` 資料集（DB05 用過的線上商店，每筆訂單一項商品）上，用 `json_object` 組出物件、`json_group_array` 把每位顧客的訂單聚合成陣列，得到「顧客文件內嵌訂單」：' },
        { type: 'example', id: 'build-document' },
        { type: 'p', text: '`json_group_array` 是聚合函式，和 `COUNT`、`SUM` 一樣配合 `GROUP BY`；括號裡的 `ORDER BY o.id` 決定陣列裡的順序。李淑芬沒有訂單：`LEFT JOIN` 給她一列全是 `NULL` 的訂單，`FILTER (WHERE o.id IS NOT NULL)` 把它排除，她才會得到空陣列 `[]`，而不是一個欄位全是 `null` 的假訂單（拿掉 `FILTER` 試試看）。PostgreSQL 對應的函式是 `json_agg`，標準 SQL 是 `JSON_ARRAYAGG`。' },
        { type: 'p', text: '那麼，同一份資料該存成哪一種？先寫下最重要的查詢，再看每一種設計怎麼回答它：' },
        { type: 'table', head: ['查詢需求', '訂單文件（內嵌顧客與品項）', '關聯表'], rows: [
          ['顯示一張訂單的完整明細（最頻繁）', '一次讀一份文件', '三張表 JOIN'],
          ['顧客修改目前的地址', '若訂單只存寄送快照：不必動訂單；若當成目前地址：每份文件都要改', '改 `customers` 的一列'],
          ['每種商品這個月賣了幾件', '展開每份文件的陣列再彙總', '`order_items` 直接 `GROUP BY`'],
          ['某位顧客的所有訂單', '依內嵌的 `customer.id` 查詢（建索引）', '依 `customer_id` 查詢（建索引）'],
          ['扣庫存並建立訂單（一起成功或一起失敗）', '庫存在另一份文件：需要多文件交易', '一筆交易（DB14）'],
        ] },
        { type: 'p', text: '如果系統的主要工作是「顯示與建立一張張訂單」，訂單文件很合適；如果要經常跨訂單做報表、修改共用的資料、或在一筆交易裡改好幾種資料，關聯表較合適。很多系統兩者並用：交易資料放在關聯表，同時把常讀的組合存成文件或快取。' },
      ],
    },
    {
      id: 'graph', title: '圖形資料庫：沿著關係走',
      blocks: [
        { type: 'p', text: '`follows` 是一張圖：每一列是一條有方向的邊，`alice` 追蹤 `bob`（D16 的圖論語言：節點是使用者，邊是追蹤關係）。在關聯式資料庫裡，走一步就是一次 JOIN。「alice 追蹤的人又追蹤了誰」要把 `follows` 和自己合併一次：' },
        { type: 'example', id: 'graph-two-hops' },
        { type: 'p', text: '結果裡出現了 alice 自己：她追蹤 bob，bob 也追蹤她，圖裡有環。走兩步要一次 JOIN，走三步要兩次；「走幾步都可以」就沒辦法用固定數量的 JOIN 寫出來，要用 DB06 的遞迴 CTE。下面從 alice 出發，最多走三步，列出每個人最少要幾步：' },
        { type: 'example', id: 'graph-reach' },
        { type: 'p', text: '遞迴的部分每次從上一輪找到的人再走一步；`WHERE r.hops < 3` 限制步數，最後用 `MIN(hops)` 取每個人的最短步數，並排除 alice 自己。grace 要四步（alice → bob → carol → dave → frank → grace 是五步，alice → eve → dave → frank → grace 是四步），所以不在三步之內。' },
        { type: 'callout', tone: 'warning', title: '有環的圖：UNION 與 UNION ALL', text: '遞迴 CTE 以 `UNION` 合併時，已經出現過的列會被丟掉，所以「只記錄走到誰」的遞迴遇到環也會停下：在練習場拿掉 `hops` 欄位與步數限制，`UNION` 版會列出 alice 走得到的 7 個人（包括她自己）後結束。改成 `UNION ALL` 卻沒有步數限制，alice → bob → alice → bob … 永遠走不完，練習場在 3 秒後停止。範例保留了 `hops` 欄位，每一列都不同，`UNION` 去不掉重複，所以靠 `hops < 3` 結束。' },
        { type: 'p', text: '圖形資料庫把關係本身存成資料，查詢語言可以直接描述「走 1 到 3 步」這種長度不固定的路徑。Neo4j 的 Cypher（示意，網站未執行）：' },
        { type: 'table', head: ['Cypher（Neo4j，示意）', '意思'], rows: [
          ['`MATCH (a:User {name: \'alice\'})-[:FOLLOWS*1..3]->(b:User) WHERE b <> a RETURN DISTINCT b.name`', '從 alice 出發，沿著 FOLLOWS 關係走 1 到 3 步，列出走得到的人'],
          ['`MATCH (a:User {name: \'alice\'})-[:FOLLOWS]->(:User)-[:FOLLOWS]->(c:User) WHERE NOT (a)-[:FOLLOWS]->(c) AND c <> a RETURN DISTINCT c.name`', '朋友的朋友中，alice 還沒追蹤的人（「你可能認識的人」）'],
        ] },
        { type: 'p', text: '當查詢的重點是「關係的形狀」：幾步之內連得到、兩人之間的最短路徑、哪些帳號形成一個圈，圖形模型寫起來最直接。若查詢多半是「依欄位篩選後彙總」，圖形資料庫就沒有優勢。關聯式資料庫加遞迴 CTE 也能回答圖的問題，像本節這樣；選擇的依據是這類查詢在整個系統裡有多重要。' },
      ],
    },
    {
      id: 'cap', title: 'CAP 取捨與最終一致性',
      blocks: [
        { type: 'p', text: 'NoSQL 系統常被設計成一開始就分散在很多台機器上，同一份資料在好幾台機器各有一份複本（replica）。只要資料有好幾份，就得回答：一台機器剛寫入的值，另一台什麼時候讀得到？CAP 定理談的就是這件事。它的三個字母有精確的意思：' },
        { type: 'table', head: ['字母', '意思', '注意'], rows: [
          ['C：一致性（Consistency）', '每次讀取都得到最新一次寫入的值（或得到錯誤），整個系統看起來像只有一份資料', '和 ACID 的 C 不同：ACID 的一致性是交易前後都滿足約束（DB14）'],
          ['A：可用性（Availability）', '每一個送到正常運作節點的請求，都會得到非錯誤的回應', '不是「服務很少當機」的一般說法，而是每個請求都要回應'],
          ['P：分區容忍（Partition tolerance）', '節點之間的網路訊息遺失或中斷（網路分區）時，系統仍繼續運作', '分散式系統無法選擇「不會發生分區」：網路一定可能斷'],
        ] },
        { type: 'p', text: 'CAP 定理說的是：發生網路分區時，系統無法同時保證 C 與 A。常聽到的「三選二」容易誤導：P 不是可以放棄的選項，因為分區不是設計者決定要不要發生的；真正的選擇只發生在分區期間，在一致性與可用性之間二選一。沒有分區的時候，系統完全可以同時提供兩者。' },
        { type: 'p', text: '例子：商品庫存有兩份複本，一份在台北機房、一份在高雄機房。兩地之間的網路斷了，台北剛把庫存從 1 改成 0，這時一個請求問高雄「還有庫存嗎」：' },
        { type: 'table', head: ['高雄的做法', '選擇', '後果'], rows: [
          ['回答「拒絕」或等到網路恢復、確認最新值才回答', '一致性（CP）', '不會讀到過期的 1，但這段時間高雄回答不了這個問題'],
          ['照常用本地的複本回答「還有 1 件」', '可用性（AP）', '每個請求都有回應，但可能是過期的值；可能賣出不存在的商品，網路恢復後要處理衝突'],
        ] },
        { type: 'p', text: '選擇 A 的系統通常提供最終一致性（eventual consistency）：如果之後不再有新的寫入，所有複本最終會收斂到同一個值。它保證的只有「最終會相同」，以下這些都可能發生，而且不算錯誤：' },
        { type: 'list', items: [
          '讀到過期的值：剛寫入台北，高雄的複本還沒收到。',
          '讀不到自己剛寫的值：改完暱稱馬上重新整理，請求被送到另一份還沒同步的複本。需要「讀到自己的寫入」（read-your-writes）的地方，要另外設計，例如讓這位使用者的讀取送到已寫入的複本。',
          '兩地同時寫入同一筆資料：網路恢復後要決定留下哪一個。常見做法是依時間戳記保留最後寫入的值（last write wins），代價是另一筆寫入被丟掉；或依資料的意義合併，例如兩邊加入購物車的商品取聯集。',
        ] },
        { type: 'p', text: '很多系統讓你逐個操作調整一致性。在 Cassandra 這類系統，每次讀寫可以指定要等幾份複本回應（例如 `ONE` 或 `QUORUM`）；簡化地說，若一份資料有 N 份複本，寫入等 W 份確認、讀取問 R 份，且 R + W > N，讀到的複本中就至少有一份收過最新的寫入。等得越多越一致，但也越慢，而且分區時越可能湊不到足夠的複本而回應失敗。' },
        { type: 'callout', tone: 'note', title: 'PACELC：沒有分區的時候呢？', text: 'CAP 只談分區期間。PACELC 補上平常的情況：發生分區（P）時在可用性（A）與一致性（C）之間取捨；否則（E，else）在延遲（L）與一致性（C）之間取捨。例如寫入時同步等其他複本確認，讀到的值較一致，但每次寫入都要多等網路往返；非同步複寫回應快，複本卻可能落後。複寫、備份與故障轉移的細節是 DB19 的主題。' },
        { type: 'callout', tone: 'tip', title: '不是 NoSQL 才有這個問題', text: '單一的 SQLite 檔案或單一台資料庫伺服器沒有複本之間的網路，CAP 談不上。但關聯式資料庫一旦加上複本，從非同步複本讀取一樣可能讀到過期的值。反過來，NoSQL 也不等於只能最終一致：例如 Neo4j 支援 ACID 交易，MongoDB 可以設定讀寫要等多數複本確認。與 ACID 對照的一個口號是 BASE（Basically Available、Soft state、Eventually consistent），它描述的是一種設計取向，不是某個產品的保證。' },
      ],
    },
    {
      id: 'choosing', title: '選擇關聯式或某類 NoSQL',
      blocks: [
        { type: 'p', text: '選資料庫不是比哪個比較新，而是依序問四個問題：最主要的讀寫是什麼樣子？哪些資料必須在同一筆交易裡一起改？資料的形狀是固定的表、巢狀的文件，還是關係網？資料量與寫入量需要分散到很多台機器嗎？各節之後的「互動視覺化」可以勾選需要的操作，看哪一種模型在每一項都適合，或者沒有一種全部適合、必須取捨。' },
        { type: 'table', head: ['情境', '主要的存取模式', '較合適', '理由'], rows: [
          ['銀行轉帳、扣庫存並建立訂單', '在一筆交易裡改好幾列，不能只做一半', '關聯式', '多列的 ACID 交易、約束與外鍵（DB07、DB14）'],
          ['登入工作階段、購物車暫存、快取', '永遠拿著鍵讀寫，會過期', '鍵值', '只需要依鍵存取；過期與大量讀寫是它的強項'],
          ['商品目錄（每類商品屬性不同）、整筆顯示的訂單', '依編號讀整份資料，結構因類別而不同', '文件（或關聯表加 JSON 欄位）', '一份文件就是一次讀取；新屬性不必改綱要'],
          ['每台感測器每秒一筆讀數，依裝置與時間範圍查詢', '大量寫入、依分區鍵與時間範圍讀', '寬欄', '依裝置分區、依時間排序，分散到多台機器'],
          ['「你可能認識的人」、找出互相轉帳的帳號圈', '沿著關係走好幾步', '圖形', '長度不固定的路徑查詢最直接'],
          ['營運報表、臨時的分析問題', '任意組合的 JOIN、`GROUP BY`，事先不知道會問什麼', '關聯式（或資料倉儲）', '任何組合都能事後用 SQL 拼出來'],
        ] },
        { type: 'p', text: '需求還不清楚、之後的查詢會一直變的時候，關聯式通常是較穩的起點：它能回答設計時沒想到的問題，也有成熟的交易與約束；等某一種存取模式真的成了瓶頸或特別重要，再為它加上合適的 NoSQL 儲存。一個系統同時用好幾種資料庫，各自負責最適合的那部分（例如訂單在關聯式資料庫、工作階段在鍵值資料庫、推薦在圖形資料庫），稱為多語言持久化（polyglot persistence）；代價是多一套系統要維運，以及資料在不同系統之間的同步。' },
        { type: 'callout', tone: 'warning', title: '說理由，不說口號', text: '「NoSQL 比較快」「關聯式無法擴展」都不是理由：快或慢取決於查詢是否符合資料的形狀與索引，關聯式資料庫也有分片與分散式的做法。好的理由會指向具體的存取模式：「訂單總是整筆讀出，而且品項不和別的訂單共用，所以內嵌」「轉帳要在一筆交易裡改兩個帳戶，所以用關聯式」。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-each-count', prompt: '在 `documents` 資料集（6 份訂單，其中 5 號是 `cancelled`）執行下面的查詢，結果是多少？',
      code: { language: 'SQL', text: 'SELECT COUNT(*)\nFROM orders_doc AS o, json_each(o.doc, \'$.items\') AS j\nWHERE o.doc ->> \'$.status\' <> \'cancelled\';' },
      options: ['5', '8', '12', '9'],
      answer: 1, explanation: '`json_each` 把每份文件的 `items` 陣列展開成一列一個品項，所以 `COUNT(*)` 數的是品項列：未取消的 1、2、3、4、6 號訂單分別有 2、1、2、1、2 個品項，共 8 列。5 是訂單數，要 `COUNT(DISTINCT o.id)`；12 是件數（把 `qty` 加起來），要 `SUM`；9 是忘了排除取消的 5 號訂單。',
    },
    {
      id: 'q-arrow', prompt: '`orders_doc` 裡有 3 份訂單的 `status` 是 `shipped`。下面的查詢在 SQLite 得到什麼？',
      code: { language: 'SQL', text: 'SELECT COUNT(*)\nFROM orders_doc\nWHERE doc -> \'$.status\' = \'shipped\';' },
      options: ['3', '6', '錯誤：`->` 不能用在 `WHERE` 裡', '0'],
      answer: 3, explanation: '`->` 回傳的是 JSON 文字，字串值會帶著雙引號，是 `"shipped"`；它和 SQL 字串 `shipped` 不相等，所以 0 列，而且不會有任何錯誤訊息。要取出 SQL 的值，用 `->>` 或 `json_extract`，才會得到 3。6 是以為條件沒有作用；`->` 可以出現在任何運算式裡，只是比較的對象不對。',
    },
    {
      id: 'q-embed-snapshot', prompt: '訂單文件內嵌了 `customer: { id, name, city }`，`city` 用來決定這筆訂單寄到哪裡。顧客林建宏搬到台南，接著又下了一筆新訂單。哪一種處理最恰當？',
      options: [
        '用 `json_set` 把所有含林建宏的訂單文件的 `city` 都改成台南，複本才會一致',
        '訂單裡完全不要存城市，每次出貨時都去讀顧客目前的地址',
        '舊訂單不動，新訂單內嵌台南；顧客「目前的地址」另存在顧客自己的文件或表，訂單只保存下單當時的快照',
        '什麼都不用做：文件資料庫會自動同步同一位顧客的所有複本',
      ],
      answer: 2, explanation: '這個 `city` 的意思是「這筆訂單寄到哪裡」，屬於訂單本身：舊訂單當時寄到台中是事實，改掉它等於竄改紀錄，所以快照式的內嵌是對的，顧客目前的地址另外存一份，給新訂單使用。全部改成台南會讓舊訂單的寄送地變錯；完全不存則失去歷史，顧客再搬一次就查不到舊訂單寄到哪裡；資料庫不知道哪些文件裡的物件是「同一位顧客」，不會自動同步內嵌的複本。',
    },
    {
      id: 'q-cycle', prompt: '`follows` 裡有 alice 追蹤 bob，也有 bob 追蹤 alice。在練習場執行下面的查詢會怎樣？',
      code: { language: 'SQL', text: 'WITH RECURSIVE reach(person, hops) AS (\n  SELECT followee, 1 FROM follows WHERE follower = \'alice\'\n  UNION ALL\n  SELECT f.followee, r.hops + 1\n  FROM reach AS r\n    JOIN follows AS f ON f.follower = r.person\n)\nSELECT DISTINCT person FROM reach;' },
      options: [
        '永遠走不完：alice 與 bob 之間的環讓遞迴一直產生新的列，練習場在 3 秒後停止',
        '列出 alice 走得到的 7 個人後結束',
        '因為最後有 `DISTINCT`，重複的人只走一次，正常結束',
        '錯誤：遞迴 CTE 必須用 `UNION`，不能用 `UNION ALL`',
      ],
      answer: 0, explanation: '`UNION ALL` 不去除重複，而且每一列的 `hops` 都比上一輪多 1，就算改成 `UNION` 也去不掉重複；沒有 `WHERE r.hops < …` 的限制，alice → bob → alice → bob … 的路徑會一直產生新的列。外層的 `DISTINCT` 只作用在遞迴產生的結果上，擋不住遞迴本身。遞迴 CTE 可以用 `UNION ALL`，DB06 的組織圖就是；它在沒有環的圖上會自然結束。',
    },
    {
      id: 'q-eventual', prompt: '使用者在 App 改了暱稱，畫面顯示「已儲存」；他立刻重新整理，卻又看到舊暱稱，幾秒後才變成新的。這個系統宣稱提供最終一致性。哪個說法正確？',
      options: [
        '這違反了最終一致性：寫入成功後，之後的每次讀取都必須是新值',
        '這是最終一致性允許的：它只保證停止寫入後複本終將相同；若要讀到自己的寫入，要另外設計，例如把這位使用者的讀取送到已寫入的複本',
        '這是 ACID 的一致性被破壞了，表示資料違反了約束',
        '只要再儲存一次暱稱，所有複本就會立刻一致',
      ],
      answer: 1, explanation: '最終一致性的承諾是「如果不再有新的寫入，所有複本最終會相同」，不保證讀到最新值，也不保證讀到自己剛寫的值；重新整理時請求可能被送到還沒同步的複本。「之後每次讀取都是新值」描述的是 CAP 的強一致性。ACID 的一致性指交易前後滿足約束，和複本同步無關。再寫一次也只是再一筆要同步的寫入，不會讓複寫變成即時。',
    },
    {
      id: 'q-cap', prompt: '一個資料庫在台北與高雄各有一份複本。兩地之間的網路斷了，台北剛把某商品的庫存從 1 改成 0，這時高雄收到一個讀取庫存的請求。哪個說法正確？',
      options: [
        '只要選對產品，分區期間也能讓兩地都照常回應，而且保證讀到最新值',
        '系統可以選擇放棄分區容忍（成為 CA 系統），這個問題就不會發生',
        'CAP 說任何時候都只能三選二，所以就算網路正常，也必須放棄一致性或可用性其中之一',
        '高雄若照常回應，就可能回傳過期的 1（選擇可用性）；若要保證不讀到過期值，就只能拒絕或等待（選擇一致性）',
      ],
      answer: 3, explanation: 'CAP 定理說的就是這個情況：分區期間，高雄收不到台北的新值，要嘛回應（可能過期），要嘛不回應（或回錯誤）。分區容忍不是可以放棄的選項，網路會不會斷不由設計者決定；而沒有分區的時候，系統可以同時提供一致性與可用性，平常的取捨是延遲與一致性（PACELC）。沒有任何產品能在分區期間同時做到兩者。',
    },
    {
      id: 'q-choose', prompt: '為下面四個需求各選一種最合適的資料模型：(1) 登入工作階段，依工作階段編號讀寫、30 分鐘後過期；(2) 銀行轉帳，兩個帳戶要一起改；(3)「你可能認識的人」：朋友的朋友；(4) 每台感測器每秒一筆讀數，依裝置與時間範圍查詢。',
      options: [
        '(1) 鍵值、(2) 關聯式、(3) 圖形、(4) 寬欄',
        '(1) 文件、(2) 鍵值、(3) 關聯式、(4) 圖形',
        '(1) 關聯式、(2) 文件、(3) 寬欄、(4) 鍵值',
        '(1) 鍵值、(2) 寬欄、(3) 圖形、(4) 關聯式',
      ],
      answer: 0, explanation: '工作階段永遠拿著鍵讀寫，還要過期，正是鍵值的用途；轉帳要在一筆交易裡改兩列，關聯式的 ACID 交易最直接，寬欄與鍵值通常不提供一般的多列交易；朋友的朋友是兩步的路徑查詢，圖形模型寫起來最自然；感測器讀數大量寫入、依裝置分區、依時間排序讀取，符合寬欄的設計。其他組合都至少把一個需求放到不擅長的模型上，例如把轉帳交給鍵值或寬欄。',
    },
  ],
  sql: {
    dataset: 'documents',
    presets: [
      { label: '看所有訂單文件', sql: sql`SELECT id, doc FROM orders_doc ORDER BY id;` },
      { label: '查詢內嵌欄位：台北顧客的訂單', sql: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  doc ->> '$.status' AS status,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE doc ->> '$.customer.city' = '台北'
ORDER BY id;` },
      { label: '展開陣列：每份訂單的金額', sql: sql`SELECT o.id, SUM((j.value ->> '$.qty') * (j.value ->> '$.price')) AS total
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
GROUP BY o.id
ORDER BY o.id;` },
      { label: '鍵值：依鍵取值、依前綴列出', sql: sql`SELECT key, value FROM sessions_kv WHERE key = 'cart:alice';
SELECT key, value FROM sessions_kv WHERE key LIKE 'session:%' ORDER BY key;` },
      { label: '圖：alice 三步之內走得到誰', sql: sql`WITH RECURSIVE reach(person, hops) AS (
  SELECT followee, 1 FROM follows WHERE follower = 'alice'
  UNION
  SELECT f.followee, r.hops + 1
  FROM reach AS r
    JOIN follows AS f ON f.follower = r.person
  WHERE r.hops < 3
)
SELECT person, MIN(hops) AS hops
FROM reach
WHERE person <> 'alice'
GROUP BY person
ORDER BY hops, person;` },
      { label: '排版顯示一份文件（json_pretty）', sql: sql`SELECT json_pretty(doc) FROM orders_doc WHERE id = 3;` },
    ],
    examples: [
      {
        id: 'doc-one-order', title: '依鍵取出一份完整的訂單文件', dataset: 'documents',
        description: '3 號訂單：顧客與兩個品項都在同一份文件裡，一次讀取、不用 JOIN。',
        sql: sql`SELECT id, doc FROM orders_doc WHERE id = 3;`,
        result: { columns: ['id', 'doc'], rows: [
          [3, '{"customer":{"id":3,"name":"王雅雯","city":"台北"},"items":[{"product":"無線滑鼠","qty":1,"price":890},{"product":"USB-C 集線器","qty":3,"price":1290}],"status":"pending","ordered_on":"2026-09-10"}'],
        ] },
      },
      {
        id: 'flatten-to-tables', title: '把文件拆成三張關聯表，再 JOIN 回來', dataset: 'documents',
        description: '從 `orders_doc` 做出 `customers`、`orders`、`order_items` 三張表（同一份資料的關聯式設計），再用兩個 JOIN 組回 3 號訂單：一個品項一列，顧客資料在每一列重複出現。',
        sql: sql`${flatten}
SELECT o.id, c.name, c.city, o.status, i.product, i.qty, i.price
FROM orders AS o
  JOIN customers AS c ON c.id = o.customer_id
  JOIN order_items AS i ON i.order_id = o.id
WHERE o.id = 3
ORDER BY i.product;`,
        result: { columns: ['id', 'name', 'city', 'status', 'product', 'qty', 'price'], rows: [
          [3, '王雅雯', '台北', 'pending', 'USB-C 集線器', 3, 1290],
          [3, '王雅雯', '台北', 'pending', '無線滑鼠', 1, 890],
        ] },
      },
      {
        id: 'schema-on-read', title: '寫入時不檢查欄位：拼錯的鍵變成 NULL', dataset: 'documents',
        description: '新增一份把 `customer` 拼成 `custmer`、又少了 `ordered_on` 的文件。它是合法的 JSON，`CHECK (json_valid(doc))` 照樣接受；查詢時缺少的欄位都是 `NULL`。',
        sql: sql`INSERT INTO orders_doc (id, doc) VALUES
  (7, '{"custmer":{"id":5,"name":"李淑芬","city":"台南"},"items":[],"status":"pending"}');
SELECT id,
  doc ->> '$.customer.name' AS customer,
  doc ->> '$.ordered_on' AS ordered_on,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE id >= 6
ORDER BY id;`,
        result: { columns: ['id', 'customer', 'ordered_on', 'lines'], rows: [
          [6, '陳美玲', '2026-09-28', 2],
          [7, null, null, 0],
        ] },
      },
      {
        id: 'wide-column-sim', title: '用複合主鍵模擬寬欄的分區與叢集鍵', dataset: 'empty',
        description: '空白資料庫。`(user_id, sent_at)` 是主鍵，`WITHOUT ROWID` 讓 SQLite 依主鍵順序存放：同一位使用者的訊息排在一起，依時間取最新兩則。',
        sql: sql`CREATE TABLE messages_by_user (
  user_id TEXT,
  sent_at TEXT,
  body TEXT,
  PRIMARY KEY (user_id, sent_at)
) WITHOUT ROWID;
INSERT INTO messages_by_user VALUES
  ('alice', '2026-11-01 09:00', '早安'),
  ('bob', '2026-11-01 09:05', '開會嗎？'),
  ('alice', '2026-11-01 12:30', '午餐吃什麼'),
  ('alice', '2026-11-02 08:10', '今天下雨'),
  ('bob', '2026-11-02 10:00', '收到');
SELECT user_id, sent_at, body
FROM messages_by_user
WHERE user_id = 'alice'
ORDER BY sent_at DESC
LIMIT 2;`,
        result: { columns: ['user_id', 'sent_at', 'body'], rows: [
          ['alice', '2026-11-02 08:10', '今天下雨'],
          ['alice', '2026-11-01 12:30', '午餐吃什麼'],
        ] },
      },
      {
        id: 'kv-get', title: '鍵值：依鍵取值', dataset: 'documents',
        description: '`sessions_kv` 的主鍵是 `key`：拿著鍵，一次查找就取得值。值對這張表來說只是一段文字。',
        sql: sql`SELECT key, value FROM sessions_kv WHERE key = 'session:a1';`,
        result: { columns: ['key', 'value'], rows: [
          ['session:a1', '{"user":"alice","expires":"2026-11-03 10:00"}'],
        ] },
      },
      {
        id: 'kv-by-value', title: '依值的內容找資料：只能一列一列打開看', dataset: 'documents',
        description: '「bob 的工作階段」寫在值裡面，不在鍵裡：SQLite 要掃描整張表、解析每個值；真正的鍵值資料庫通常不提供這種查詢。',
        sql: sql`SELECT key, value ->> '$.expires' AS expires
FROM sessions_kv
WHERE key LIKE 'session:%'
  AND value ->> '$.user' = 'bob';`,
        result: { columns: ['key', 'expires'], rows: [['session:b2', '2026-11-02 18:00']] },
      },
      {
        id: 'doc-nested-filter', title: '依內嵌欄位查詢：台北顧客的訂單', dataset: 'documents',
        description: '`->>` 依 JSON 路徑取出巢狀欄位的值；`json_array_length` 數 `items` 陣列有幾個品項。',
        sql: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  doc ->> '$.status' AS status,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE doc ->> '$.customer.city' = '台北'
ORDER BY id;`,
        result: { columns: ['id', 'customer', 'status', 'lines'], rows: [
          [1, '陳美玲', 'shipped', 2],
          [3, '王雅雯', 'pending', 2],
          [6, '陳美玲', 'pending', 2],
        ] },
      },
      {
        id: 'doc-unwind-items', title: 'json_each：把品項陣列展開成列', dataset: 'documents',
        description: '1 號與 3 號訂單各有兩個品項，展開後是四列；`idx` 是品項在陣列裡的位置（從 0 起）。',
        sql: sql`SELECT o.id,
  j.key AS idx,
  j.value ->> '$.product' AS product,
  j.value ->> '$.qty' AS qty,
  j.value ->> '$.price' AS price
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
WHERE o.id IN (1, 3)
ORDER BY o.id, j.key;`,
        result: { columns: ['id', 'idx', 'product', 'qty', 'price'], rows: [
          [1, 0, '機械鍵盤', 1, 2490],
          [1, 1, '無線滑鼠', 2, 890],
          [3, 0, '無線滑鼠', 1, 890],
          [3, 1, 'USB-C 集線器', 3, 1290],
        ] },
      },
      {
        id: 'doc-copies-drift', title: '內嵌的複本只改了一份', dataset: 'documents',
        description: '把 5 號訂單裡林建宏的城市改成台南，2 號訂單裡的他還在台中。`copies` 是每位顧客的複本數，`cities` 是複本裡出現幾個不同的城市。',
        sql: sql`UPDATE orders_doc
SET doc = json_set(doc, '$.customer.city', '台南')
WHERE id = 5;
SELECT doc ->> '$.customer.id' AS customer_id,
  doc ->> '$.customer.name' AS name,
  COUNT(*) AS copies,
  COUNT(DISTINCT doc ->> '$.customer.city') AS cities
FROM orders_doc
GROUP BY customer_id
ORDER BY customer_id;`,
        result: { columns: ['customer_id', 'name', 'copies', 'cities'], rows: [
          [1, '陳美玲', 2, 1],
          [2, '林建宏', 2, 2],
          [3, '王雅雯', 1, 1],
          [4, '張志明', 1, 1],
        ] },
      },
      {
        id: 'build-document', title: '從關聯表組出文件：json_object 與 json_group_array', dataset: 'shop',
        description: '`shop` 資料集。每位顧客一份文件，內嵌他的訂單陣列；只列 2 號林建宏與沒有訂單的 5 號李淑芬。',
        sql: sql`SELECT json_object(
  'id', c.id,
  'name', c.name,
  'orders', json_group_array(
    json_object('order_id', o.id, 'product', p.name, 'qty', o.quantity) ORDER BY o.id
  ) FILTER (WHERE o.id IS NOT NULL)
) AS doc
FROM customers AS c
  LEFT JOIN orders AS o ON o.customer_id = c.id
  LEFT JOIN products AS p ON p.id = o.product_id
WHERE c.id IN (2, 5)
GROUP BY c.id
ORDER BY c.id;`,
        result: { columns: ['doc'], rows: [
          ['{"id":2,"name":"林建宏","orders":[{"order_id":3,"product":"27 吋螢幕","qty":1},{"order_id":7,"product":"USB-C 集線器","qty":1}]}'],
          ['{"id":5,"name":"李淑芬","orders":[]}'],
        ] },
      },
      {
        id: 'graph-two-hops', title: '走兩步：把追蹤關係和自己 JOIN 一次', dataset: 'documents',
        description: 'alice 追蹤的人，又追蹤了誰。bob 追蹤 alice，所以 alice 自己也出現在結果裡。',
        sql: sql`SELECT f1.follower AS person, f2.followee AS two_hops
FROM follows AS f1
  JOIN follows AS f2 ON f2.follower = f1.followee
WHERE f1.follower = 'alice'
ORDER BY two_hops;`,
        result: { columns: ['person', 'two_hops'], rows: [
          ['alice', 'alice'],
          ['alice', 'carol'],
          ['alice', 'dave'],
        ] },
      },
      {
        id: 'graph-reach', title: '遞迴 CTE：三步之內走得到誰', dataset: 'documents',
        description: '從 alice 出發，每輪沿著 `follows` 多走一步，最多三步；每個人取最少的步數，並排除 alice 自己。',
        sql: sql`WITH RECURSIVE reach(person, hops) AS (
  SELECT followee, 1 FROM follows WHERE follower = 'alice'
  UNION
  SELECT f.followee, r.hops + 1
  FROM reach AS r
    JOIN follows AS f ON f.follower = r.person
  WHERE r.hops < 3
)
SELECT person, MIN(hops) AS hops
FROM reach
WHERE person <> 'alice'
GROUP BY person
ORDER BY hops, person;`,
        result: { columns: ['person', 'hops'], rows: [
          ['bob', 1],
          ['eve', 1],
          ['carol', 2],
          ['dave', 2],
          ['frank', 3],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-nested-field', title: '依內嵌欄位查詢：台北顧客的訂單',
        statement: '`orders_doc` 的每份訂單文件都內嵌了顧客（`customer` 物件裡有 `id`、`name`、`city`）與品項陣列 `items`。列出顧客城市（`customer.city`）是「台北」的訂單，欄位依序是 `id`（訂單編號）、`customer`（顧客姓名）、`lines`（這份訂單有幾個品項，也就是 `items` 陣列的長度），依下單日期（`ordered_on`）由新到舊排列，同一天的依 `id` 由小到大。還有一組隱藏的資料用來檢查。',
        dataset: 'documents', hidden: ['documents-b'], ordered: true, columnNames: true,
        starter: sql`SELECT id
FROM orders_doc
WHERE …;`,
        hints: [
          '巢狀欄位用 JSON 路徑取出：`doc ->> \'$.customer.city\'`、`doc ->> \'$.customer.name\'`、`doc ->> \'$.ordered_on\'`。',
          '用 `->>`（或 `json_extract`）而不是 `->`：`->` 回傳帶雙引號的 JSON 文字，和 `\'台北\'` 比較永遠不相等，查詢會安靜地傳回 0 列。',
          '陣列長度是 `json_array_length(doc, \'$.items\')`；排序寫成 `ORDER BY doc ->> \'$.ordered_on\' DESC, id`。',
        ],
        solution: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE doc ->> '$.customer.city' = '台北'
ORDER BY doc ->> '$.ordered_on' DESC, id;`,
        alternatives: [
          sql`SELECT id,
  json_extract(doc, '$.customer.name') AS customer,
  (SELECT COUNT(*) FROM json_each(doc, '$.items')) AS lines
FROM orders_doc
WHERE json_extract(doc, '$.customer.city') = '台北'
ORDER BY json_extract(doc, '$.ordered_on') DESC, id ASC;`,
        ],
        mistakes: [
          { sql: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE doc -> '$.customer.city' = '台北'
ORDER BY doc ->> '$.ordered_on' DESC, id;`, why: '`->` 取出的是 JSON 文字 `"台北"`（帶雙引號），和 SQL 字串 `台北` 不相等：沒有錯誤訊息，只是一列都沒有。比較值要用 `->>` 或 `json_extract`。' },
          { sql: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  json_array_length(doc, '$.items') AS lines
FROM orders_doc
WHERE doc ->> '$.city' = '台北'
ORDER BY doc ->> '$.ordered_on' DESC, id;`, why: '路徑少了一層：`city` 在 `customer` 物件裡，`$.city` 在文件最外層不存在，得到 `NULL`，條件永遠不成立。JSON 路徑寫錯不會報錯，只會變成 `NULL`。' },
          { sql: sql`SELECT id,
  doc ->> '$.customer.name' AS customer,
  json_array_length(doc) AS lines
FROM orders_doc
WHERE doc ->> '$.customer.city' = '台北'
ORDER BY doc ->> '$.ordered_on' DESC, id;`, why: '`json_array_length(doc)` 量的是整份文件，而文件是物件不是陣列，所以得到 0。要指出陣列的路徑：`json_array_length(doc, \'$.items\')`。' },
        ],
      },
      {
        id: 'ex-items-total', title: '展開品項陣列：每種商品賣出幾件、多少錢',
        statement: '只看狀態（`status`）不是 `cancelled` 的訂單，把每份訂單的 `items` 陣列展開（每個品項有 `product`、`qty`、`price`），計算每種商品賣出的總件數與總金額。欄位依序是 `product`（商品名稱）、`qty`（總件數，把數量加起來）、`revenue`（總金額，每個品項的數量乘單價再加總）。依 `revenue` 由大到小排列，相同時依 `product` 排列。還有一組隱藏的資料用來檢查。',
        dataset: 'documents', hidden: ['documents-b'], ordered: true, columnNames: true,
        starter: sql`SELECT j.value ->> '$.product' AS product
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j;`,
        hints: [
          '`FROM orders_doc AS o, json_each(o.doc, \'$.items\') AS j` 讓每個品項變成一列，`j.value ->> \'$.qty\'` 取出它的數量。',
          '展開後每一列是「一個品項」：`COUNT(*)` 數的是品項列數，不是件數；件數要 `SUM(j.value ->> \'$.qty\')`，金額要 `SUM((j.value ->> \'$.qty\') * (j.value ->> \'$.price\'))`。',
          '取消的訂單用 `WHERE o.doc ->> \'$.status\' <> \'cancelled\'` 排除，再依商品 `GROUP BY`。',
        ],
        solution: sql`SELECT j.value ->> '$.product' AS product,
  SUM(j.value ->> '$.qty') AS qty,
  SUM((j.value ->> '$.qty') * (j.value ->> '$.price')) AS revenue
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
WHERE o.doc ->> '$.status' <> 'cancelled'
GROUP BY product
ORDER BY revenue DESC, product;`,
        alternatives: [
          sql`WITH items AS (
  SELECT json_extract(j.value, '$.product') AS product,
    json_extract(j.value, '$.qty') AS qty,
    json_extract(j.value, '$.price') AS price
  FROM orders_doc AS o
    JOIN json_each(o.doc, '$.items') AS j
  WHERE json_extract(o.doc, '$.status') <> 'cancelled'
)
SELECT product, SUM(qty) AS qty, SUM(qty * price) AS revenue
FROM items
GROUP BY product
ORDER BY revenue DESC, product ASC;`,
        ],
        mistakes: [
          { sql: sql`SELECT j.value ->> '$.product' AS product,
  COUNT(*) AS qty,
  SUM((j.value ->> '$.qty') * (j.value ->> '$.price')) AS revenue
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
WHERE o.doc ->> '$.status' <> 'cancelled'
GROUP BY product
ORDER BY revenue DESC, product;`, why: '`COUNT(*)` 數的是這種商品出現在幾個品項列（大約是幾筆訂單），不是賣出幾件：1 號訂單買了 2 個無線滑鼠，只算 1。件數要把 `qty` 加起來。' },
          { sql: sql`SELECT j.value ->> '$.product' AS product,
  SUM(j.value ->> '$.qty') AS qty,
  SUM(j.value ->> '$.price') AS revenue
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
WHERE o.doc ->> '$.status' <> 'cancelled'
GROUP BY product
ORDER BY revenue DESC, product;`, why: '金額只加了單價，忘了乘上數量：3 號訂單的 3 個 USB-C 集線器只算了一個的錢。' },
          { sql: sql`SELECT j.value ->> '$.product' AS product,
  SUM(j.value ->> '$.qty') AS qty,
  SUM((j.value ->> '$.qty') * (j.value ->> '$.price')) AS revenue
FROM orders_doc AS o, json_each(o.doc, '$.items') AS j
GROUP BY product
ORDER BY revenue DESC, product;`, why: '沒有排除取消的訂單：5 號訂單已經取消，它的 USB-C 集線器不算賣出。' },
        ],
      },
      {
        id: 'ex-reach-count', title: '圖的可達性：每個人間接追蹤得到幾個人',
        statement: '`follows` 的每一列是一條追蹤關係：`follower` 追蹤 `followee`。如果 A 追蹤 B、B 追蹤 C，就說 A「走得到」B 與 C（走幾步都算）。對每一位至少追蹤一個人的使用者，算出他走得到幾個不同的人，不包括他自己（關係裡有環，可能繞回自己）。欄位依序是 `name`（使用者）、`reachable`（走得到的人數），依 `reachable` 由大到小排列，相同時依 `name` 排列。還有一組隱藏的資料用來檢查。',
        dataset: 'documents', hidden: ['documents-b'], ordered: true, columnNames: true,
        starter: sql`WITH RECURSIVE reach(start, person) AS (
  SELECT follower, followee FROM follows
  UNION
  -- 從上一輪走到的 person 再走一步
  …
)
SELECT …;`,
        hints: [
          '遞迴 CTE 記錄 (出發的人, 走到的人) 這一對：起點是 `follows` 的每一列，遞迴部分把 `reach` 和 `follows` 以 `f.follower = r.person` 合併，產生 `(r.start, f.followee)`。',
          '用 `UNION` 而不是 `UNION ALL`：同一對只留一次，遇到 alice → bob → alice 這樣的環才會停下。不要用固定的步數上限，題目說走幾步都算。',
          '最後排除 `person = start` 的列，再依 `start` 分組 `COUNT(*)`；因為 `UNION` 已經去掉重複的對，每個人只算一次。',
        ],
        solution: sql`${reachAll}
SELECT start AS name, COUNT(*) AS reachable
FROM reach
WHERE person <> start
GROUP BY start
ORDER BY reachable DESC, name;`,
        alternatives: [
          sql`WITH RECURSIVE reach(start, person) AS (
  SELECT DISTINCT follower, follower FROM follows
  UNION
  SELECT r.start, f.followee
  FROM reach AS r
    JOIN follows AS f ON f.follower = r.person
)
SELECT start AS name, COUNT(*) - 1 AS reachable
FROM reach
GROUP BY start
ORDER BY reachable DESC, name;`,
        ],
        mistakes: [
          { sql: sql`${reachAll}
SELECT start AS name, COUNT(*) AS reachable
FROM reach
GROUP BY start
ORDER BY reachable DESC, name;`, why: '沒有排除自己：alice 追蹤 bob、bob 又追蹤 alice，所以 alice 走得到她自己，bob 也一樣，兩人都多算了 1。' },
          { sql: sql`SELECT follower AS name, COUNT(*) AS reachable
FROM follows
GROUP BY follower
ORDER BY reachable DESC, name;`, why: '只數了直接追蹤的人（走一步），沒有沿著關係繼續走：alice 直接追蹤 2 個人，但走得到 6 個。間接的關係要用遞迴 CTE。' },
          { sql: sql`WITH RECURSIVE reach(start, person, hops) AS (
  SELECT follower, followee, 1 FROM follows
  UNION ALL
  SELECT r.start, f.followee, r.hops + 1
  FROM reach AS r
    JOIN follows AS f ON f.follower = r.person
  WHERE r.hops < 3
)
SELECT start AS name, COUNT(DISTINCT person) AS reachable
FROM reach
WHERE person <> start
GROUP BY start
ORDER BY reachable DESC, name;`, why: '用步數上限防止繞圈，卻把上限寫死成三步：alice 要走四步才到 grace，就漏掉了。題目說走幾步都算；用 `UNION` 只記錄 (出發, 到達) 這一對，環自然會停下，不需要上限。' },
        ],
      },
    ],
  },
  visualization: {
    kind: 'ds-comparison', title: '勾選需要的操作：五種資料模型適不適合',
    wording: { caption: '每種資料模型做這些操作的適合程度（一般情況；實際依產品與資料設計而不同）', subject: '資料模型', good: '適合', poor: '不適合' },
    operations: [
      { id: 'get-by-key', label: '依鍵取一筆（工作階段、購物車）' },
      { id: 'read-whole', label: '一次讀出整筆訂單（含顧客與品項）' },
      { id: 'nested-field', label: '依某個欄位或內嵌欄位查詢' },
      { id: 'ad-hoc', label: '跨實體的臨時報表（任意 JOIN、GROUP BY）' },
      { id: 'schema-change', label: '欄位常變、每筆結構不同' },
      { id: 'multi-txn', label: '多筆資料一起改的交易（轉帳、扣庫存）' },
      { id: 'traversal', label: '沿著關係走好幾步（朋友的朋友）' },
      { id: 'scale-writes', label: '大量寫入，分散到很多台機器' },
    ],
    structures: [
      { name: '關聯式', note: '例如 PostgreSQL、MySQL、SQLite：資料拆成表，用 JOIN 組合，綱要與約束在寫入時檢查，支援多列的 ACID 交易。', costs: {
        'get-by-key': { cost: '主鍵索引查一列', good: true },
        'read-whole': { cost: 'JOIN 訂單、明細、顧客三張表再組回巢狀結構', good: false },
        'nested-field': { cost: '欄位就是一般的欄，可以建索引', good: true },
        'ad-hoc': { cost: '任何組合都能事後用 SQL 寫出來', good: true },
        'schema-change': { cost: '要 `ALTER TABLE`，每列結構相同（可另用 JSON 欄位）', good: false },
        'multi-txn': { cost: '多列、多表的 ACID 交易', good: true },
        traversal: { cost: '每多一步多一次 JOIN，或用遞迴 CTE', good: false },
        'scale-writes': { cost: '多半是單一主機寫入，分散寫入要另做分片或用分散式 SQL 產品', good: false } } },
      { name: '鍵值', note: '例如 Redis：一個鍵對應一個值，資料庫多半不解讀值的內容；存取的起點永遠是鍵。', costs: {
        'get-by-key': { cost: '一次依鍵查找', good: true },
        'read-whole': { cost: '整筆存成一個值，依訂單的鍵取回', good: true },
        'nested-field': { cost: '值不透明：只能掃描全部，或由程式多存一組鍵', good: false },
        'ad-hoc': { cost: '不支援，要在程式裡自己組合', good: false },
        'schema-change': { cost: '值的內容由程式決定，資料庫不檢查', good: true },
        'multi-txn': { cost: '單一鍵的操作是原子的；多鍵交易依產品而定，例如 Redis 的 MULTI／EXEC 不會在錯誤時回滾', good: false },
        traversal: { cost: '不支援', good: false },
        'scale-writes': { cost: '依鍵分散到多台機器很直接', good: true } } },
      { name: '文件', note: '例如 MongoDB：一份 JSON 之類的文件內嵌物件與陣列，可依文件內的欄位查詢與建索引；單一文件的修改是原子的。', costs: {
        'get-by-key': { cost: '依文件的鍵取一份', good: true },
        'read-whole': { cost: '一次讀一份文件，不用 JOIN', good: true },
        'nested-field': { cost: '可依內嵌欄位查詢並建索引', good: true },
        'ad-hoc': { cost: '跨集合的組合較受限（例如 MongoDB 的 $lookup），設計上盡量避免', good: false },
        'schema-change': { cost: '同一集合的文件可以有不同欄位（可選擇加上綱要驗證）', good: true },
        'multi-txn': { cost: '單一文件原子；多文件交易部分產品支援（例如 MongoDB），設計上仍以一份文件為單位', good: false },
        traversal: { cost: '要逐層查詢或用特殊運算子，不是主要用途', good: false },
        'scale-writes': { cost: '依分片鍵分散到多台機器', good: true } } },
      { name: '寬欄', note: '例如 Apache Cassandra：依分區鍵分散、分區內依叢集鍵排序；先列出查詢，再為每個查詢設計一張表。', costs: {
        'get-by-key': { cost: '依分區鍵（加叢集鍵）讀取', good: true },
        'read-whole': { cost: '照這個查詢設計表時，一個分區一次讀出', good: true },
        'nested-field': { cost: '只能依主鍵查；其他欄位要另建依它分區的表或索引', good: false },
        'ad-hoc': { cost: '沒有 JOIN（Cassandra 的 CQL 不支援）', good: false },
        'schema-change': { cost: '新增欄容易，各列可以缺欄', good: true },
        'multi-txn': { cost: '沒有一般的多列交易，只有範圍有限的輕量交易與批次', good: false },
        traversal: { cost: '不支援', good: false },
        'scale-writes': { cost: '為大量寫入、多機分散而設計', good: true } } },
      { name: '圖形', note: '例如 Neo4j：節點與關係都是資料，查詢語言（Cypher）直接描述路徑；Neo4j 支援 ACID 交易。', costs: {
        'get-by-key': { cost: '依屬性索引找到節點', good: true },
        'read-whole': { cost: '訂單、品項、顧客是不同節點，要沿關係組回', good: false },
        'nested-field': { cost: '依節點或關係的屬性查詢，可以建索引', good: true },
        'ad-hoc': { cost: '能做彙總，但大範圍的表格式報表不是它的主要用途', good: false },
        'schema-change': { cost: '節點與關係的屬性有彈性', good: true },
        'multi-txn': { cost: '支援 ACID 交易（例如 Neo4j）', good: true },
        traversal: { cost: '長度不固定的路徑查詢最直接', good: true },
        'scale-writes': { cost: '把圖切到多台機器會切斷跨機器的關係，水平擴展較難', good: false } } },
    ],
  },
};
