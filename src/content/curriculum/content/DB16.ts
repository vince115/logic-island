import type { LessonContent } from '../schema';

const sql = String.raw;
/** Application code (Python, JavaScript, Java) is kept verbatim. */
const code = String.raw;

/** The stock table of the order examples and the checkout exercise (`shop` has no stock column). */
const stockTable = sql`CREATE TABLE stock (
  product_id INTEGER PRIMARY KEY REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0)
);
INSERT INTO stock (product_id, quantity) VALUES (1, 5), (2, 3), (3, 2), (4, 10), (5, 1);`;

/** The N+1 code the second exercise starts from (shown in its statement). */
const customersAndOrders = sql`SELECT c.id, c.name, o.id, p.name, o.quantity
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN products p ON p.id = o.product_id
ORDER BY c.id, o.id;`;

/** DB16 程式串接資料庫與 ORM. SQL lesson (Phase F.1d) with driver code and round-trip sequences: run in tests/curriculum-sql.test.ts, tests/curriculum-driver.test.ts. */
export const DB16: LessonContent = {
  lessonId: 'DB16',
  motivation: '到目前為止，SQL 都是你在練習場親手輸入的。真正的應用程式不是這樣：使用者在網頁上按下「結帳」，伺服器上的 Python、JavaScript 或 Java 程式透過資料庫驅動程式送出 SQL，拿回資料列，再把它們變成網頁上的表格。這中間有四個地方最常出錯：把使用者輸入直接拼進 SQL 文字；交易開了沒提交、出錯沒回滾、連線忘了關；用 ORM 寫出看起來只有一行、其實送出幾百個查詢的 N+1 迴圈；以及在正式資料庫上執行一個在開發機上沒問題的綱要修改。本課先用三種語言的驅動程式連線並執行參數化查詢，再在程式裡把「新增訂單、扣庫存」包成一筆交易，出錯就回滾、最後一定釋放連線；接著手寫一個很小的迷你 ORM，看類別怎麼對映到資料表、延遲載入怎麼變成 N+1，並在往返模擬器裡比較 N+1、JOIN 與批次 IN 各要幾次往返；最後認識連線池與資料庫遷移。學完後，你能寫出一段以交易安全地新增訂單的程式，並把 N+1 查詢改成單次 JOIN。',
  sections: [
    {
      id: 'drivers', title: '資料庫驅動：程式怎麼和資料庫說話',
      blocks: [
        { type: 'p', text: '應用程式不會自己解析 SQL，也不會自己讀資料庫檔案。它呼叫資料庫驅動程式（driver）：一個函式庫，負責開啟連線、把 SQL 與參數值交給資料庫、把結果一列一列交回給程式，並把資料庫的錯誤轉成程式語言的例外。不論哪一種語言，流程都一樣：' },
        { type: 'list', ordered: true, items: [
          '開啟連線（connection）：說明要連哪一個資料庫。',
          '準備敘述（statement）：一段 SQL，值的位置寫成佔位符 `?`。',
          '執行：把參數值綁定到佔位符，送出。',
          '讀取結果：逐列取出，每一列變成程式裡的 tuple、物件或陣列。',
          '關閉：釋放敘述與連線，不論成功或失敗。',
        ] },
        { type: 'table', head: ['', 'Python', 'JavaScript（Node.js）', 'Java'], rows: [
          ['本課使用的驅動程式', '標準函式庫的 `sqlite3`', 'Node.js 內建的 `node:sqlite`（`DatabaseSync`）', 'JDK 的 JDBC 介面（`java.sql`）加上 SQLite 的 JDBC 驅動程式'],
          ['開啟連線', '`sqlite3.connect(\'shop.db\')`', '`new DatabaseSync(\'shop.db\')`', '`DriverManager.getConnection("jdbc:sqlite:shop.db")`'],
          ['執行參數化查詢', '`conn.execute(sql, (city,))`', '`db.prepare(sql).all(city)`', '`prepareStatement(sql)`、`setString(1, city)`、`executeQuery()`'],
          ['一列資料是', 'tuple', '物件（欄名是屬性）', '`ResultSet` 的目前這一列，用 `getInt`、`getString` 取值'],
          ['釋放資源', '`conn.close()`，放在 `finally`', '`db.close()`，放在 `finally`', 'try-with-resources 自動呼叫 `close()`'],
        ] },
        { type: 'example', id: 'drv-connect' },
        { type: 'p', text: 'Python 與 JavaScript 版本由本站的自動檢查真正執行，印出的結果就是上面的輸出；Java 版本只編譯：JDBC 只定義介面，執行時還需要 SQLite 的 JDBC 驅動程式（一個額外的 jar 檔），本站沒有安裝。三個版本做的事完全相同，連第三次查詢的那個奇怪城市名稱也一樣查不到任何列，第 2 節說明原因。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的「連線」和伺服器型資料庫不同', text: 'SQLite 是嵌入式資料庫：它就是驅動程式裡的一段程式碼，「連線」是在同一個行程裡開啟一個資料庫檔，沒有伺服器、沒有網路，也沒有帳號密碼。PostgreSQL、MySQL 等伺服器型資料庫則是另一個程式，通常在另一台主機上，連線要經過網路、驗證身分，伺服器還要為每條連線配置資源（PostgreSQL 為每條連線啟動一個伺服器行程）。所以第 6 節的連線池對它們很重要，對 SQLite 則不那麼重要。' },
        { type: 'callout', tone: 'tip', title: '查詢結果是一列一列取的', text: '`fetchall()`、`all()` 一次取回全部資料列放進記憶體，結果很大時會吃掉大量記憶體。驅動程式也能逐列讀取（Python 直接 `for row in conn.execute(sql)`，Java 用 `while (rs.next())`）。比這更好的做法，是在 SQL 裡就用 `WHERE`、`LIMIT` 與彙總只取需要的資料，第 5 節會再看到。' },
      ],
    },
    {
      id: 'parameters', title: '參數化查詢：SQL 與值分開送',
      blocks: [
        { type: 'p', text: '使用者在搜尋框輸入城市，程式要查這個城市的顧客。最直覺的寫法是把輸入拼進 SQL 文字裡，例如 Python 的 `"... WHERE city = \'" + city + "\'"`。如果使用者輸入的是 `台北\' OR \'1\'=\'1`，資料庫收到的就是下面這段 SQL：' },
        { type: 'example', id: 'sql-spliced' },
        { type: 'p', text: '輸入裡的引號結束了字串，`OR \'1\'=\'1\'` 變成了條件的一部分，五位顧客全部被查出來。使用者的輸入改寫了 SQL 的意思：這就是 SQL injection，DB17（SQL Injection 與資料庫安全）會專門討論它能造成多大的傷害，以及一個登入查詢如何被繞過。本課只需要記住解法：參數化查詢（parameterized query）。' },
        { type: 'p', text: '參數化查詢把 SQL 文字和值分成兩部分送出：SQL 裡值的位置寫佔位符 `?`，值另外交給驅動程式綁定（bind）。資料庫先解析 SQL、決定它的意思，再把值放進已經決定好的位置，值裡的引號、`OR`、分號都只是資料，不可能變成 SQL 的一部分。第 1 節的範例裡，`台北\' OR \'1\'=\'1` 被當成一個完整的城市名稱去比對，當然沒有這個城市，所以是 0 列。' },
        { type: 'table', head: ['驅動程式', '佔位符寫法', '說明'], rows: [
          ['Python `sqlite3`', '`?`，或具名的 `:city`', '值放在 tuple 或 dict：`conn.execute(sql, (city,))`；只有一個值也要寫成 `(city,)`'],
          ['Node.js `node:sqlite`', '`?`，或具名的 `:city`、`$city`、`@city`', '值當成 `run`、`get`、`all` 的引數；具名參數放在一個物件裡'],
          ['Java JDBC', '`?`', '`setInt(1, …)`、`setString(2, …)`：位置從 1 開始數'],
          ['Python `psycopg`（PostgreSQL）', '`%s`', '寫法像字串格式化，但仍由驅動程式綁定，不能自己用 `%` 把值代進去'],
          ['Node.js `pg`（PostgreSQL）', '`$1`、`$2`', '值放在陣列：`client.query(sql, [city])`'],
        ] },
        { type: 'p', text: '佔位符只能代表值，不能代表 SQL 的其他部分：表名、欄名、`ASC`／`DESC`、`AND`／`OR` 都不能用參數傳入。網頁讓使用者選「依價格排序」時，正確的做法是在程式裡用白名單對應：使用者送來 `price`，程式確認它在允許的清單裡，才把固定的欄名寫進 SQL。本課的測驗會問：把欄名當成參數傳入，結果會怎麼排序。' },
        { type: 'callout', tone: 'tip', title: '在練習場試參數', text: '本課的練習場多了一個「參數值」框：每行一個值，依序對應 SQL 裡的 `?`。載入預設查詢「某城市的顧客（參數：城市）」，參數框填 `台北` 執行，再改成 `台北\' OR \'1\'=\'1` 執行：前者 2 列，後者 0 列。也可以把 SQL 改成 `WHERE city = \'?\'` 看看：引號裡的 `?` 只是一個問號字元，不是佔位符。' },
        { type: 'callout', tone: 'note', title: '準備好的敘述可以重複使用', text: '參數化查詢通常也是預備敘述（prepared statement）：SQL 解析一次，之後每次只換參數值執行。第 1 節的 JavaScript 與 Java 版本都只 `prepare` 一次，迴圈裡執行三次。Python 的 `sqlite3` 也會快取最近用過的敘述。同一段 SQL 換不同的值執行，正是參數化查詢的日常。' },
      ],
    },
    {
      id: 'transactions-in-code', title: '在程式裡提交、回滾並釋放連線',
      blocks: [
        { type: 'p', text: 'DB14 在練習場用 `BEGIN`、`COMMIT`、`ROLLBACK` 包住一筆轉帳。應用程式裡也一樣，只是錯誤處理由程式負責：結帳時，購物車的每個品項都要在 `orders` 新增一列、並從庫存扣掉數量，庫存不夠（違反 `CHECK (quantity >= 0)`）就整張訂單都不算。下面是程式送給資料庫的敘述（這裡把參數值直接寫出來，方便在練習場執行；本課的商店資料沒有庫存，所以先建立一張 `stock` 表）：' },
        { type: 'example', id: 'sql-order-tx' },
        { type: 'p', text: '換成程式，固定的骨架是：開始交易；依序執行每個敘述；任何一步出錯就回滾並回報失敗；全部成功才提交；最後不論結果如何，都釋放連線。下面的程式下了兩張訂單，第二張的第二個品項庫存不夠：' },
        { type: 'example', id: 'drv-transaction' },
        { type: 'p', text: '第二張訂單的第一個品項其實已經成功：新增了一列訂單、商品 2 的庫存也從 1 扣到 0。第二個品項的 `UPDATE` 違反 `CHECK` 之後，回滾把這些修改一起撤銷，所以輸出裡訂單仍是 2 列、商品 2 仍是 1。三種語言的寫法不同，對應關係如下：' },
        { type: 'table', head: ['', 'Python `sqlite3`（預設設定）', 'JavaScript `node:sqlite`', 'Java JDBC'], rows: [
          ['預設', '在 `INSERT`、`UPDATE`、`DELETE` 之前自動送出 `BEGIN`，直到呼叫 `commit()` 或 `rollback()`', '自動提交：沒有 `BEGIN`，每個敘述自己就是一筆交易', '自動提交'],
          ['開始交易', '自動；或用 `with conn:` 包住一段程式', '`db.exec(\'BEGIN\')`', '`conn.setAutoCommit(false)`'],
          ['提交', '`conn.commit()`；`with conn:` 區塊正常結束時自動提交', '`db.exec(\'COMMIT\')`', '`conn.commit()`'],
          ['出錯回滾', '`conn.rollback()`；`with conn:` 區塊拋出例外時自動回滾', '在 `catch` 裡 `db.exec(\'ROLLBACK\')`', '在 `catch` 裡 `conn.rollback()`'],
          ['釋放連線', '`finally: conn.close()`（`with conn:` 不會關閉連線）', '`finally { db.close(); }`', 'try-with-resources'],
        ] },
        { type: 'callout', tone: 'warning', title: '忘了 commit()，關閉連線時修改就不見了', text: 'Python 的 `sqlite3` 在預設設定下會自動送出 `BEGIN`，卻不會自動送出 `COMMIT`。程式執行了 `INSERT`，在同一個連線裡查得到新資料，看起來一切正常；但 `close()` 不會替你提交，這筆交易在連線關閉時被撤銷，其他連線從來沒看到過它。Python 3.12 起可以用 `autocommit` 參數改變這個行為；用任何驅動程式之前，先查清楚它的預設是哪一種。' },
        { type: 'callout', tone: 'note', title: '為什麼一定要在 finally 裡釋放連線', text: '例外會跳過後面的程式碼。如果 `close()` 寫在 `commit()` 之後，出錯的那一次就永遠不會關閉連線：伺服器型資料庫的連線會一直占用到逾時，連線池的連線也不會歸還（第 6 節）。`try`／`finally`、Python 的 `with`、Java 的 try-with-resources 都保證離開區塊時一定執行清理；例外與清理的一般概念，是 PL09（錯誤處理模型）的主題。' },
        { type: 'callout', tone: 'tip', title: '交易保證全有或全無，不保證你寫對', text: '交易只負責「全部生效或全部不算」。如果迴圈只扣了最後一個品項的庫存，每個敘述都合法，交易照樣提交錯的資料。下單前可以先在練習場把敘述跑一次，用 `SELECT` 檢查每張受影響的表，DB07 說的「先預測影響列數」在這裡同樣適用。' },
      ],
    },
    {
      id: 'orm', title: 'ORM：把類別對映到資料表',
      blocks: [
        { type: 'p', text: '直接用驅動程式時，程式裡到處是 SQL 字串，資料列是 tuple，欄位靠位置取值。物件導向的程式比較想要的是 `customer.name`、`customer.orders` 這樣的物件（類別與物件是 PL02 物件導向的主題）。ORM（object-relational mapping，物件關聯對映）就是這個翻譯層：' },
        { type: 'table', head: ['程式這一邊', '資料庫這一邊', 'ORM 做的事'], rows: [
          ['類別 `Customer`', '資料表 `customers`', '宣告對映：類別名稱、欄位與型別'],
          ['一個物件', '一列資料', '查詢時把資料列變成物件；儲存時把物件變成 `INSERT` 或 `UPDATE`'],
          ['屬性 `customer.name`', '欄位 `name`', '讀取時從資料列取值，修改後記下「這個欄位變了」'],
          ['關聯 `customer.orders`', '外鍵 `orders.customer_id`', '讀取這個屬性時，送出查詢或使用已經 JOIN 進來的資料'],
          ['工作階段（session）', '一條連線與一筆交易', '收集所有修改，提交時依序送出 SQL，再 `COMMIT`'],
        ] },
        { type: 'p', text: 'ORM 沒有魔法：它最後送給資料庫的仍然是 SQL，只是由它替你產生。為了看清楚，下面用 Python 手寫一個不到五十行的迷你 ORM：`Customer` 類別對映 `customers` 表，`customer.orders` 在第一次被讀取時才去查 `orders`（延遲載入，lazy loading）；另外提供一個一次用 `LEFT JOIN` 取回顧客與訂單的預先載入（eager loading）版本。所有查詢都經過 `Session.query`，所以能把送出的 SQL 印出來，就像真正的 ORM 打開 SQL 記錄一樣：' },
        { type: 'example', id: 'drv-mini-orm' },
        { type: 'p', text: '兩種寫法印出的報表一模一樣，差別只在送出的查詢：延遲載入先查一次顧客，接著每位顧客在 `len(customer.orders)` 那一行各觸發一次查詢，共 1 + 5 = 6 次；預先載入只有 1 次。迴圈裡完全看不到 SQL，這正是 ORM 方便又危險的地方，下一節專門處理它。' },
        { type: 'p', text: '真正的 ORM 做的事比這多得多：產生 `INSERT`／`UPDATE`、追蹤哪些屬性被修改、同一列在一個工作階段裡只對應一個物件（identity map）、由類別定義產生綱要等。下表是幾個常見 ORM 的寫法對照，只作為示意，網站未執行；細節請以各自的官方文件為準：' },
        { type: 'table', head: ['ORM（語言）', '類別對映', '預先載入關聯', '看它產生的 SQL'], rows: [
          ['SQLAlchemy（Python）', '`class Customer(Base)` 加上 `__tablename__ = \'customers\'`，關聯用 `relationship()`', '`selectinload()`（另送一個 `IN` 查詢）、`joinedload()`（`LEFT OUTER JOIN`）', '`create_engine(url, echo=True)`'],
          ['Django ORM（Python）', '`class Customer(models.Model)`，關聯用 `ForeignKey`', '`prefetch_related()`（另送一個 `IN` 查詢）、`select_related()`（JOIN，用在外鍵這一側）', '`print(queryset.query)`；`DEBUG = True` 時的 `connection.queries`'],
          ['Hibernate／JPA（Java）', '`@Entity`、`@Table(name = "customers")`，關聯用 `@OneToMany`、`@ManyToOne`', 'JPQL 的 `JOIN FETCH`、`@BatchSize`（批次 `IN`）', '設定 `hibernate.show_sql`'],
          ['Prisma（JavaScript／TypeScript）', '`schema.prisma` 裡的 `model Customer { … }`', '查詢時加 `include: { orders: true }`', '`new PrismaClient({ log: [\'query\'] })`'],
        ] },
        { type: 'callout', tone: 'warning', title: '一定要讀 ORM 產生的 SQL', text: '開發時把 ORM 的 SQL 記錄打開，看一個頁面送出幾個查詢、每個查詢長什麼樣子。很多 ORM 的一對多關聯預設是延遲載入（例如 SQLAlchemy 的 `relationship()`、JPA 的 `@OneToMany`），在迴圈裡讀關聯就會變成 N+1；ORM 產生的查詢也可能取了用不到的欄位，或少了你以為會有的 `WHERE`。把記錄裡的 SQL 貼到練習場執行，用 DB12 的 `EXPLAIN QUERY PLAN` 檢查，是找出慢查詢最直接的方法。' },
        { type: 'callout', tone: 'note', title: 'ORM 裡也要用參數化查詢', text: 'ORM 用自己的查詢方法時會自動綁定參數，但每個 ORM 都留了「直接寫 SQL」的出口（例如 SQLAlchemy 的 `text()`、Django 的 `raw()`）。在那裡把使用者輸入拼進字串，第 2 節的問題原封不動地回來了：照樣要用佔位符傳值。' },
      ],
    },
    {
      id: 'n-plus-one', title: 'N+1 查詢：數一數往返次數',
      blocks: [
        { type: 'p', text: '「列出所有顧客與他們的訂單」，延遲載入的寫法送出 1 個查詢取得 N 位顧客，再為每位顧客各送 1 個查詢取訂單，共 N + 1 個，所以叫 N+1 查詢問題。每個查詢本身都很快，問題出在往返（round trip）：程式送出 SQL、等資料庫回覆，才能送下一個。伺服器型資料庫每次往返都要經過網路，一次往返哪怕只要 1 毫秒，1000 位顧客的頁面就是 1001 次往返。' },
        { type: 'p', text: '下面的往返模擬器在你的瀏覽器裡真正執行每個查詢（商店資料），列出每一次「應用程式 → 資料庫」送出的 SQL 與參數，以及「資料庫 → 應用程式」回傳的列數。依序按三種做法：' },
        { type: 'example', id: 'seq-customer-orders' },
        { type: 'table', head: ['做法', '往返次數', '取回的列', '適合'], rows: [
          ['N+1：逐筆延遲載入', '1 + N（商店資料是 6 次）', '顧客 5 列 + 訂單共 8 列', '只有少數幾筆會用到關聯時'],
          ['一個 `LEFT JOIN`', '1 次', '9 列：每筆訂單一列，沒有訂單的顧客也有一列', '一對多、資料量不大；顧客欄位在每一列重複出現'],
          ['批次 `IN`', '2 次，與 N 無關', '顧客 5 列 + 訂單 8 列', '關聯很多或很寬時，避免 JOIN 的重複；`IN` 的值很多時要分批'],
        ] },
        { type: 'p', text: '`LEFT JOIN` 把兩個查詢合成一個，結果是每筆訂單一列，顧客的欄位跟著重複；陳美玲有 3 筆訂單，她的名字就出現 3 次。沒有訂單的李淑芬仍然有一列，訂單欄位是 NULL：這正是要用 `LEFT JOIN` 而不是 `JOIN` 的原因（DB05）。ORM 的 JOIN 預先載入，就是把這種結果依顧客分組、去掉重複，變回物件。' },
        { type: 'example', id: 'sql-join-orders' },
        { type: 'p', text: '批次 `IN` 是第二種修法：先查顧客，取出所有顧客的編號，再用一個 `WHERE customer_id IN (?, ?, ?, ?, ?)` 一次取回全部訂單，程式再依 `customer_id` 分配給各個顧客。每個值仍然是一個佔位符；SQLAlchemy 的 `selectinload()`、Django 的 `prefetch_related()` 都是這種做法。一個敘述能帶的參數個數有上限（各 DBMS 不同），值很多時，ORM 會把它們分成好幾批。' },
        { type: 'p', text: '還有第三種修法常被忘記：如果頁面只要「每位顧客幾筆訂單、共幾件」，根本不需要把訂單一筆筆載入程式再計算，讓資料庫用 DB04 的 `GROUP BY` 算好，只傳回 5 列：' },
        { type: 'example', id: 'sql-aggregate-instead' },
        { type: 'list', items: [
          '怎麼發現 N+1：打開 SQL 記錄，看同一個形狀的查詢是不是換了不同的參數重複出現很多次；或在測試裡計算一個頁面送出的查詢數。',
          '一對多（顧客的訂單）與多對一（每筆訂單的商品）都會發生：迴圈裡讀 `order.product.name`，也是每筆訂單一個查詢。',
          '巢狀的關聯會相乘：顧客 → 訂單 → 商品，全部延遲載入時是 1 + 顧客數 + 訂單數。',
        ] },
        { type: 'callout', tone: 'note', title: 'SQLite 是例外', text: 'SQLite 的官方文件有一篇專門說明，在 SQLite 裡很多個小查詢並不慢：資料庫就在同一個行程裡，一次「往返」只是一次函式呼叫，沒有網路延遲。所以 N+1 在 SQLite 上的代價比在 PostgreSQL、MySQL 上小得多。不過應用程式常常日後換成伺服器型資料庫，養成一次取回需要的資料的習慣，仍然是對的。' },
      ],
    },
    {
      id: 'pools', title: '連線池：不要每個請求都開新連線',
      blocks: [
        { type: 'p', text: '連上伺服器型資料庫並不便宜：建立 TCP 連線、可能還要 TLS 加密握手、驗證帳號密碼，伺服器還要為這條連線配置記憶體或行程。一個網站每秒幾百個請求，如果每個請求都開一條新連線、用完就關，大部分時間會花在連線本身；同時開著的連線太多，資料庫也撐不住，每個 DBMS 都有最大連線數的設定（例如 PostgreSQL 的 `max_connections`）。' },
        { type: 'p', text: '連線池（connection pool）預先開好固定數量的連線，放在池子裡重複使用：' },
        { type: 'list', ordered: true, items: [
          '請求開始時向池子借一條連線；池子裡沒有空閒的連線，就排隊等待，等太久則逾時失敗。',
          '用這條連線執行查詢與交易。',
          '請求結束時歸還連線（在多數函式庫裡，對借來的連線呼叫 `close()` 就是歸還，而不是真的斷線）。歸還之前，交易應該已經提交或回滾。有些連線池會在歸還時自動回滾（例如 SQLAlchemy 的預設設定），但不要依賴它：沒有這樣做的池子，會讓下一個借到這條連線的請求接手一筆開到一半的交易。',
        ] },
        { type: 'table', head: ['生態系', '常見的連線池（示意，網站未執行）', '設定池子大小'], rows: [
          ['Java', 'HikariCP，以 `DataSource` 的形式提供給 JDBC', '`maximumPoolSize`'],
          ['Python', 'SQLAlchemy 的 `Engine` 內建連線池', '`create_engine(url, pool_size=…, max_overflow=…)`'],
          ['Node.js', 'PostgreSQL 驅動程式 `pg` 的 `Pool`', '`new Pool({ max: … })`'],
          ['資料庫前面', 'PgBouncer 等獨立的連線池服務，替很多個應用程式共用連線', '設定檔'],
        ] },
        { type: 'p', text: '池子不是越大越好。資料庫同時能有效處理的查詢數，受 CPU 核心數與磁碟限制；連線多到超過這個數量，只會讓查詢互相搶資源。池子用完時，真正的原因通常是每個請求拿著連線太久，例如在交易裡呼叫外部服務、等使用者回應，或忘了歸還（第 3 節的 `finally`）。借用的時間越短，同樣大小的池子能服務越多請求。' },
        { type: 'callout', tone: 'note', title: 'SQLite 與本課的練習場', text: 'SQLite 沒有伺服器與網路連線，開啟一個資料庫檔的成本很低，連線池的意義也小得多；SQLite 同一時間只允許一個寫入交易（DB14），多開連線並不會讓寫入變快。本課不提供可以執行的連線池範例：練習場只有一條連線，任何「池子」在這裡都只是假裝的。' },
      ],
    },
    {
      id: 'migrations', title: '資料庫遷移：讓綱要的修改也有版本',
      blocks: [
        { type: 'p', text: '程式碼放在版本控制裡，每次修改都有紀錄、可以審查、可以重現。資料庫的綱要也需要一樣的待遇：開發機、測試機、正式環境的資料庫，必須在同一個版本的程式上線前，變成同一個版本的綱要。資料庫遷移（migration）就是做這件事的方法：' },
        { type: 'list', items: [
          '每次綱要修改寫成一個有編號的遷移檔（例如 `0002_add_customers_vip.sql`），內容是 `CREATE TABLE`、`ALTER TABLE`、`CREATE INDEX`，必要時也包括搬移資料的 `UPDATE`。',
          '資料庫裡有一張版本表，記錄哪些遷移已經執行過。遷移工具比對版本表與遷移檔，依編號只執行還沒執行的那些。',
          '每個遷移放在一筆交易裡（資料庫支援的話），失敗就整個撤銷，版本表也不會被更新。',
          '已經在別的環境執行過的遷移檔不再修改；要改就寫一個新的遷移。',
        ] },
        { type: 'example', id: 'sql-migration' },
        { type: 'p', text: '範例的第 2 號遷移同時修改綱要與資料：新增 `vip` 欄位，再把下過 3 筆以上訂單的顧客設為 1，最後在版本表記下編號 2，三件事在同一筆交易裡提交。在 SQLite 與 PostgreSQL，`ALTER TABLE` 可以和其他敘述一起在交易裡回滾；MySQL 則會在 `ALTER TABLE` 等 DDL 敘述之前隱含提交目前的交易（DB14），一個遷移做到一半失敗時，前面的綱要修改已經生效，需要另外處理。' },
        { type: 'table', head: ['遷移工具（示意，網站未執行）', '搭配', '版本表'], rows: [
          ['Alembic', 'SQLAlchemy（Python）', '`alembic_version`'],
          ['Django migrations（`makemigrations`、`migrate`）', 'Django ORM（Python）', '`django_migrations`'],
          ['Flyway（遷移檔命名如 `V2__add_customers_vip.sql`）', 'Java 等，直接寫 SQL', '`flyway_schema_history`'],
          ['Prisma Migrate（`prisma migrate dev`）', 'Prisma（JavaScript／TypeScript）', '`_prisma_migrations`'],
        ] },
        { type: 'callout', tone: 'warning', title: '在空資料庫上成功，不代表在正式環境也成功', text: '開發機的資料表常常是空的，正式環境卻有幾百萬列。在 SQLite 裡試試：空表可以 `ALTER TABLE … ADD COLUMN email TEXT NOT NULL`，但只要表裡已經有資料列，同一個敘述就被拒絕（`Cannot add a NOT NULL column with default value NULL`）：舊的資料列這個欄位該填什麼？穩妥的做法是分步驟：先加可以是 NULL 或有 `DEFAULT` 的欄位，再補上舊資料的值，最後才加上限制（SQLite 的 `ALTER TABLE` 功能有限，要加 `NOT NULL` 得重建資料表，DB07 介紹過；PostgreSQL 可以 `ALTER COLUMN … SET NOT NULL`）。在大資料表上，改綱要也可能鎖住表很久，上線前用接近正式環境的資料量演練。' },
        { type: 'callout', tone: 'tip', title: '寫資料庫程式的檢查清單', text: '值一律用佔位符傳；欄名、排序方向用白名單；相關的修改放在同一筆交易，出錯就回滾；連線與敘述在 `finally` 或 try-with-resources 裡釋放；打開 ORM 的 SQL 記錄，數一數一個頁面的查詢數，把 N+1 改成 JOIN、批次 IN 或彙總；交易裡不要等外部服務；綱要的每次修改都寫成遷移。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-count-round-trips', prompt: '商店資料有 5 位顧客、8 筆訂單。一個頁面用 ORM 的延遲載入列出每位顧客、他的每筆訂單，以及每筆訂單的商品名稱：迴圈先送出第一個查詢，每位顧客送一次第二個查詢，每筆訂單再送一次第三個查詢。假設這個 ORM 不快取已經載入的商品，這個頁面共送出幾個查詢？',
      code: { language: 'SQL', text: 'SELECT id, name FROM customers ORDER BY id;\n-- 每位顧客一次：\nSELECT id, product_id, quantity FROM orders WHERE customer_id = ? ORDER BY id;\n-- 每筆訂單一次：\nSELECT name FROM products WHERE id = ?;' },
      options: ['2', '6', '10', '14'],
      answer: 3, explanation: '1 個查詢取顧客，5 位顧客各 1 個查詢取訂單，8 筆訂單各 1 個查詢取商品：1 + 5 + 8 = 14。巢狀的延遲載入會相乘，N+1 變成 1 + N + M。6 是只算了第一層的 1 + 5；10 是 1 + 5 + 4，假設同一項商品只查一次（8 筆訂單只用到 4 種商品），題目說這個 ORM 不快取，所以不成立；2 是以為 ORM 會自動合併成兩個查詢。用兩個 JOIN 寫成一個查詢，只要 1 次往返。',
    },
    {
      id: 'q-quoted-placeholder', prompt: '程式想查參數指定的城市，參數值是 `台北`。下面的 SQL 有什麼問題？',
      code: { language: 'SQL', text: 'SELECT id, name FROM customers WHERE city = \'?\' ORDER BY id;' },
      options: [
        '引號裡的 `?` 是只有一個問號字元的字串，不是佔位符：這個敘述沒有任何參數，參數值永遠用不到',
        '沒有問題：驅動程式會把 `台北` 放進引號裡，查到 2 位顧客',
        '沒有問題，而且比不加引號更安全，因為值一定被當成字串',
        '會查出所有顧客：`?` 在引號裡是萬用字元',
      ],
      answer: 0, explanation: '佔位符必須是一個獨立的 `?`，寫在引號裡就成了字串常值 `\'?\'`，比對的是名叫「?」的城市。Python 的 `sqlite3` 與 Node 的 `node:sqlite` 都會因為「敘述有 0 個參數、卻給了 1 個值」而報錯；本課的練習場沒有佔位符時不綁定，直接執行，結果是 0 列。驅動程式不會替你加引號：值是另外送出的，型別由綁定的值決定，所以不需要、也不能加引號。`?` 不是萬用字元，`LIKE` 的萬用字元是 `%` 和 `_`。',
    },
    {
      id: 'q-order-by-param', prompt: '網頁讓使用者選擇排序欄位，程式把選到的欄名 `price` 當成參數傳給下面的查詢。在 SQLite 執行，結果怎麼排序？',
      code: { language: 'SQL', text: 'SELECT id, name, price FROM products ORDER BY ?;' },
      options: [
        '依價格由低到高排序',
        '執行錯誤：`ORDER BY` 不能使用參數',
        '每一列的排序鍵都是同一個字串 `\'price\'`，等於沒有指定順序；欄名不能用參數傳入，要用白名單選出固定的欄名',
        '依第 1 個欄位 `id` 排序，因為參數值會被當成欄位編號',
      ],
      answer: 2, explanation: '參數永遠只是一個值，不是 SQL 的一部分：`ORDER BY ?` 綁定 `\'price\'` 之後，是依一個常數字串排序，每一列都一樣，順序沒有任何保證（在商店資料上碰巧照 `id` 排列，價格並沒有排序）。SQLite 接受這個敘述，不會報錯；只有直接寫在 SQL 裡的整數常值（如 `ORDER BY 3`）才代表欄位編號，綁定的參數不算。正確做法是在程式裡用白名單把 `price` 對應到固定的欄名，再寫進 SQL 文字。',
    },
    {
      id: 'q-close-without-commit', prompt: '一段 Python 程式使用標準函式庫 `sqlite3` 的預設設定，對一個資料庫檔執行一個 `INSERT` 和一個 `UPDATE`，然後直接呼叫 `conn.close()`，沒有呼叫 `conn.commit()`。下面是驅動程式實際送給 SQLite 的敘述。之後另一個連線開啟同一個檔案，會看到什麼？',
      code: { language: 'SQL', text: 'BEGIN;  -- 驅動程式在 INSERT 之前自動送出\nINSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (?, ?, ?, ?);\nUPDATE stock SET quantity = quantity - ? WHERE product_id = ?;\n-- 接著程式呼叫 conn.close()' },
      options: [
        '新訂單和扣好的庫存都在：每次 `execute()` 都會自動提交',
        '兩個修改都看不到：交易從未提交，連線關閉時被撤銷',
        '只看得到新訂單：`UPDATE` 在交易裡，`INSERT` 不在',
        '兩個修改都在：SQLite 下次開啟時會自動提交上次沒結束的交易',
      ],
      answer: 1, explanation: '預設設定下，Python 的 `sqlite3` 在 `INSERT` 之前自動送出 `BEGIN`，兩個修改都在這筆交易裡；`close()` 不會替你提交，交易在連線關閉時被撤銷。程式在關閉之前用同一個連線查詢，看得到自己的修改，所以這個錯誤很容易在測試時漏掉。每次 `execute()` 自動提交的是 Node 的 `node:sqlite` 與 JDBC 的預設；`INSERT` 與 `UPDATE` 都在 `BEGIN` 之後，不會只有一個生效；連線關閉時，SQLite 撤銷沒有提交的交易；就算程式當掉、留下日誌檔，下次開啟時做的也是撤銷，不是提交（DB14 的 rollback journal）。',
    },
    {
      id: 'q-join-rows', prompt: '用一個查詢取代 N+1：商店資料有 5 位顧客、8 筆訂單，其中李淑芬沒有訂單，其他每位顧客至少有一筆。下面的查詢傳回幾列？',
      code: { language: 'SQL', text: 'SELECT c.id, c.name, o.id, o.quantity\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nORDER BY c.id, o.id;' },
      options: ['5', '8', '9', '13'],
      answer: 2, explanation: '`LEFT JOIN` 的結果是每筆訂單一列（8 列），再加上沒有訂單、但仍要保留的李淑芬一列，訂單欄位是 NULL，共 9 列。5 是以為一位顧客只有一列：顧客的欄位其實會隨著他的訂單數重複出現，ORM 或程式要依 `c.id` 分組才能變回「每位顧客一個物件」；8 是內部合併 `JOIN` 的結果，會漏掉李淑芬；13 是把 N+1 兩個查詢的列數相加（5 + 8），那是兩次查詢、不是一個 JOIN 的結果。',
    },
    {
      id: 'q-pool-exhausted', prompt: '一個網站的連線池有 10 條連線。每個下單請求借一條連線、`BEGIN`、新增訂單，接著在交易裡呼叫外部的付款服務（約 2 秒），回來後 `COMMIT` 並歸還連線。尖峰時每秒有 20 個下單請求，很多請求因為借不到連線而逾時。最好的修正是哪一個？',
      options: [
        '把連線池加大到 500 條，讓每個請求都借得到連線',
        '縮短借用時間：先用一筆短交易建立「待付款」訂單並提交、歸還連線，再呼叫付款服務，回來後用另一筆短交易更新訂單狀態',
        '不用連線池，每個請求自己開一條新連線',
        '拿掉 `BEGIN`／`COMMIT` 改成自動提交，但仍在拿著連線時呼叫付款服務',
      ],
      answer: 1, explanation: '每個請求拿著連線約 2 秒，10 條連線每秒最多只能服務約 5 個請求，瓶頸是借用時間而不是池子大小。把等待外部服務的時間移到交易與連線之外，每次借用只剩幾毫秒，同一個池子就夠用；訂單狀態分成「待付款」與「已付款」，付款失敗時也有紀錄可以處理。池子加大到 500 會讓資料庫同時開幾百條連線、還開著幾百筆交易，資料庫先撐不住；不用連線池則每個請求都付一次連線成本，連線總數也失去控制；改成自動提交解決不了問題，連線仍被占用 2 秒，而且新增訂單與後續更新不再是同一筆交易。',
    },
    {
      id: 'q-migration-not-null', prompt: '一個遷移檔在開發者的空資料庫上執行成功。部署到正式環境的 SQLite 資料庫時，`customers` 已經有資料列。執行下面的遷移會發生什麼？',
      code: { language: 'SQL', text: 'ALTER TABLE customers ADD COLUMN email TEXT NOT NULL;' },
      options: [
        '成功，舊資料列的 `email` 自動填入空字串',
        '成功，舊資料列的 `email` 是 NULL，因為 SQLite 不檢查新欄位的 NOT NULL',
        '被拒絕，因為 SQLite 不支援 `ALTER TABLE … ADD COLUMN`',
        '被拒絕：已經有資料列時，不能新增沒有預設值的 NOT NULL 欄位；要給 `DEFAULT`，或先加可以是 NULL 的欄位、補上資料，再加上限制',
      ],
      answer: 3, explanation: '舊的資料列必須有這個欄位的值，`NOT NULL` 又沒有 `DEFAULT`，SQLite 回報 `Cannot add a NOT NULL column with default value NULL`；同一個敘述在空表上會成功，所以只在正式環境出錯。SQLite 不會自動填空字串，也不會讓 NOT NULL 欄位出現 NULL。SQLite 支援 `ADD COLUMN`（`ALTER TABLE` 的功能有限，但這一項有）。修法是給預設值（例如 `DEFAULT \'\'`，但要想清楚空字串是不是有意義的值），或分步驟遷移；在 SQLite 裡，事後要加 `NOT NULL` 得重建資料表。',
    },
  ],
  sql: {
    dataset: 'shop',
    params: true,
    presets: [
      { label: '某城市的顧客（參數：城市）', sql: sql`SELECT id, name, city
FROM customers
WHERE city = ?
ORDER BY id;` },
      { label: '一位顧客的訂單（參數：顧客編號）', sql: sql`SELECT o.id, p.name, o.quantity, o.ordered_on
FROM orders o
JOIN products p ON p.id = o.product_id
WHERE o.customer_id = ?
ORDER BY o.id;` },
      { label: '批次 IN（參數：1、3、5 各一行）', sql: sql`SELECT id, customer_id, product_id, quantity
FROM orders
WHERE customer_id IN (?, ?, ?)
ORDER BY customer_id, id;` },
      { label: '一個 LEFT JOIN 取回顧客與訂單', sql: sql`SELECT c.id, c.name, o.id AS order_id, o.quantity
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
ORDER BY c.id, o.id;` },
      { label: '下訂單的交易（重建庫存表）', sql: sql`DROP TABLE IF EXISTS stock;
${stockTable}
BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (5, 3, 1, '2026-10-05');
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 3;
COMMIT;
SELECT o.id, o.customer_id, o.product_id, o.quantity, s.quantity AS left_in_stock
FROM orders o
JOIN stock s ON s.product_id = o.product_id
WHERE o.ordered_on >= '2026-10-01'
ORDER BY o.id;` },
    ],
    examples: [
      {
        id: 'sql-spliced', title: '把輸入拼進 SQL 文字：條件被改寫了', dataset: 'shop',
        description: '程式把使用者輸入的 `台北\' OR \'1\'=\'1` 直接放進兩個引號之間，資料庫收到的是這段 SQL。`\'1\'=\'1\'` 永遠成立，用 `OR` 接上之後，`WHERE` 對每一列都是真。',
        sql: sql`-- 程式寫的是：WHERE city = '<使用者輸入>'
SELECT id, name, city
FROM customers
WHERE city = '台北' OR '1'='1'
ORDER BY id;`,
        result: { columns: ['id', 'name', 'city'], rows: [[1, '陳美玲', '台北'], [2, '林建宏', '台中'], [3, '王雅雯', '台北'], [4, '張志明', '高雄'], [5, '李淑芬', '台南']] },
      },
      {
        id: 'sql-order-tx', title: '下一張訂單：程式送出的敘述', dataset: 'shop',
        description: '陳美玲（顧客 1）在 2026-10-02 買了 1 個機械鍵盤（商品 1）和 2 個 USB-C 集線器（商品 4）。每個品項新增一列訂單、扣一次庫存，全部放在一筆交易裡；訂單編號不寫，由資料庫產生。',
        sql: sql`${stockTable}
BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (1, 1, 1, '2026-10-02');
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 1;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (1, 4, 2, '2026-10-02');
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;
COMMIT;
SELECT o.id, o.product_id, o.quantity, s.quantity AS left_in_stock
FROM orders o
JOIN stock s ON s.product_id = o.product_id
WHERE o.ordered_on = '2026-10-02'
ORDER BY o.id;`,
        result: { columns: ['id', 'product_id', 'quantity', 'left_in_stock'], rows: [[9, 1, 1, 4], [10, 4, 2, 8]] },
      },
      {
        id: 'sql-join-orders', title: '一個 LEFT JOIN 取代 N+1', dataset: 'shop',
        description: '每筆訂單一列，顧客欄位隨著訂單數重複；沒有訂單的李淑芬也有一列，訂單欄位是 NULL。',
        sql: sql`SELECT c.id, c.name, o.id AS order_id, o.quantity
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
ORDER BY c.id, o.id;`,
        result: { columns: ['id', 'name', 'order_id', 'quantity'], rows: [
          [1, '陳美玲', 1, 1], [1, '陳美玲', 2, 2], [1, '陳美玲', 8, 1], [2, '林建宏', 3, 1], [2, '林建宏', 7, 1],
          [3, '王雅雯', 4, 1], [3, '王雅雯', 5, 3], [4, '張志明', 6, 2], [5, '李淑芬', null, null]] },
      },
      {
        id: 'sql-aggregate-instead', title: '只要統計值時，讓資料庫算', dataset: 'shop',
        description: '迷你 ORM 的報表只需要每位顧客的訂單數與件數：一個 `LEFT JOIN` 加 `GROUP BY`，傳回 5 列，不必把 8 筆訂單載入程式。`COUNT(o.id)` 不算 NULL，所以李淑芬是 0；`SUM` 沒有值時是 NULL，用 `COALESCE` 換成 0。',
        sql: sql`SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.quantity), 0) AS items
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY c.id;`,
        result: { columns: ['name', 'orders', 'items'], rows: [['陳美玲', 3, 4], ['林建宏', 2, 2], ['王雅雯', 2, 4], ['張志明', 1, 2], ['李淑芬', 0, 0]] },
      },
      {
        id: 'sql-migration', title: '兩個遷移與版本表', dataset: 'shop',
        description: '遷移工具第一次執行時建立版本表並記下已有的 1 號遷移；2 號遷移新增 `vip` 欄位、補上資料、記下版本，三件事在同一筆交易裡。`ADD COLUMN` 有 `DEFAULT 0`，所以已有資料列的表也能加 NOT NULL 欄位。',
        sql: sql`CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_on TEXT NOT NULL
);
INSERT INTO schema_migrations (version, name, applied_on) VALUES (1, 'create_shop_tables', '2026-08-01');
-- 0002_add_customers_vip
BEGIN;
ALTER TABLE customers ADD COLUMN vip INTEGER NOT NULL DEFAULT 0 CHECK (vip IN (0, 1));
UPDATE customers SET vip = 1
WHERE id IN (SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(*) >= 3);
INSERT INTO schema_migrations (version, name, applied_on) VALUES (2, 'add_customers_vip', '2026-10-01');
COMMIT;
SELECT (SELECT MAX(version) FROM schema_migrations) AS schema_version, id, name, vip
FROM customers
ORDER BY id;`,
        result: { columns: ['schema_version', 'id', 'name', 'vip'], rows: [[2, 1, '陳美玲', 1], [2, 2, '林建宏', 0], [2, 3, '王雅雯', 0], [2, 4, '張志明', 0], [2, 5, '李淑芬', 0]] },
      },
    ],
    exercises: [
      {
        id: 'ex-category-report', title: '參數化的分類報表',
        statement: '行銷部門要一份報表：每位顧客買了多少件某個分類的商品，分類由使用者在下拉選單選擇，程式以參數傳入。請寫一個參數化查詢，SQL 裡只有一個佔位符 `?` 代表分類（例如 `周邊`）。每位顧客一列，三個欄位依序是：顧客 `id`、`name`、這位顧客買過該分類商品的總件數（`orders.quantity` 的總和；沒有買過是 0）；依顧客 `id` 由小到大排序。下拉選單的值可以被竄改，所以檢查也會代入惡意的值。',
        dataset: 'shop', hidden: ['shop-b'], ordered: true,
        paramSets: [
          { label: '周邊', values: ['周邊'] },
          { label: '配件', values: ['配件'] },
          { label: '惡意輸入：周邊\' OR \'1\'=\'1', values: ['周邊\' OR \'1\'=\'1'] },
          { label: '萬用字元：%', values: ['%'] },
          { label: '顯示器', values: ['顯示器'], hidden: true },
          { label: '音訊', values: ['音訊'], hidden: true },
        ],
        starter: sql`SELECT c.id, c.name,
  -- 這位顧客買過分類 ? 的商品幾件？
FROM customers c
ORDER BY c.id;`,
        hints: [
          '每位顧客都要出現，買過 0 件也一樣：從 `customers` 出發，每位顧客用一個相關子查詢算件數，或用 `LEFT JOIN` 接上 `orders` 與 `products` 再 `GROUP BY`。',
          '分類只出現一次，寫成不加引號的 `?`：`\'?\'` 是一個只有問號的字串，不是佔位符。',
          '比對分類用 `=`，不要用 `LIKE`：參數值 `%` 對 `LIKE` 是萬用字元，會比對到每一個分類。子查詢的 `SUM` 沒有資料時是 NULL，用 `COALESCE(…, 0)` 換成 0。',
        ],
        solution: sql`SELECT c.id, c.name,
  (SELECT COALESCE(SUM(o.quantity), 0)
   FROM orders o
   JOIN products p ON p.id = o.product_id
   WHERE o.customer_id = c.id AND p.category = ?) AS items
FROM customers c
ORDER BY c.id;`,
        alternatives: [
          sql`SELECT c.id, c.name, SUM(CASE WHEN p.category = ? THEN o.quantity ELSE 0 END) AS items
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN products p ON p.id = o.product_id
GROUP BY c.id, c.name
ORDER BY c.id;`,
          sql`SELECT c.id, c.name, COALESCE(SUM(o.quantity), 0) AS items
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.id
  AND o.product_id IN (SELECT id FROM products WHERE category = ?)
GROUP BY c.id, c.name
ORDER BY c.id;`,
        ],
        mistakes: [
          { sql: sql`SELECT c.id, c.name,
  (SELECT COALESCE(SUM(o.quantity), 0)
   FROM orders o
   JOIN products p ON p.id = o.product_id
   WHERE o.customer_id = c.id AND p.category = '?') AS items
FROM customers c
ORDER BY c.id;`, why: '`\'?\'` 加了引號，就成了只有一個問號字元的字串，敘述裡沒有任何佔位符，比對的是名叫「?」的分類：每位顧客都是 0 件。參數「周邊」的檢查就會發現（陳美玲應該是 3 件）。真正的 Python 或 Node 驅動程式會直接回報參數個數不符。' },
          { sql: sql`SELECT c.id, c.name,
  (SELECT COALESCE(SUM(o.quantity), 0)
   FROM orders o
   JOIN products p ON p.id = o.product_id
   WHERE o.customer_id = c.id AND p.category LIKE ?) AS items
FROM customers c
ORDER BY c.id;`, why: '用了 `LIKE`：一般的分類名稱看不出差別，但參數值 `%` 對 `LIKE` 是「任何字串」，每個分類都比對成功，報表變成每位顧客買過的全部件數。參數化保證值不會改寫 SQL 的結構，卻不會改變運算子的意思：`LIKE` 的參數裡，`%` 與 `_` 仍然是萬用字元。' },
          { sql: sql`SELECT c.id, c.name, SUM(o.quantity) AS items
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN products p ON p.id = o.product_id
WHERE p.category = ?
GROUP BY c.id, c.name
ORDER BY c.id;`, why: '內部合併再用 `WHERE` 篩分類，沒買過這個分類的顧客整列消失：參數「周邊」時只剩 3 位顧客，林建宏與李淑芬不見了。題目要每位顧客一列、沒買過是 0，所以要從 `customers` 出發，用相關子查詢或 `LEFT JOIN`，並把分類條件放在子查詢或 `ON` 裡（DB05）。' },
        ],
      },
      {
        id: 'ex-n-plus-one-join', title: '把 N+1 改成一個 JOIN',
        statement: '一個頁面列出所有顧客與他們的訂單，程式先送出 `SELECT id, name FROM customers ORDER BY id;`，再對每位顧客送出 `SELECT o.id, p.name, o.quantity FROM orders o JOIN products p ON p.id = o.product_id WHERE o.customer_id = ? ORDER BY o.id;`，共 1 + N 次往返。請改寫成一個查詢，一次取回同樣的資料：每筆訂單一列，五個欄位依序是顧客 `id`、顧客 `name`、訂單 `id`、商品 `name`、訂購數量 `quantity`；沒有訂單的顧客也要出現一列，後三個欄位是 NULL（原本的頁面會顯示這位顧客、但訂單是空的）。依顧客 `id`、再依訂單 `id` 排序。',
        dataset: 'shop', hidden: ['shop-b'], ordered: true,
        hints: [
          '從 `customers` 出發，接上 `orders`，再從訂單接上 `products`。哪一種 JOIN 能保留沒有訂單的顧客？',
          '兩個 JOIN 都要是 `LEFT JOIN`：沒有訂單的顧客那一列，`o.product_id` 是 NULL，和 `products` 的內部合併會把這一列丟掉。',
          '`ORDER BY c.id, o.id`：每位顧客的訂單各自依編號排列；沒有訂單的顧客只有一列，NULL 的位置不影響順序。',
        ],
        solution: customersAndOrders,
        alternatives: [
          sql`SELECT c.id, c.name, o.id, p.name, o.quantity
FROM customers c
LEFT JOIN (orders o JOIN products p ON p.id = o.product_id)
  ON o.customer_id = c.id
ORDER BY c.id, o.id;`,
          sql`SELECT c.id, c.name, x.order_id, x.product_name, x.quantity
FROM customers c
LEFT JOIN (
  SELECT o.customer_id, o.id AS order_id, p.name AS product_name, o.quantity
  FROM orders o
  JOIN products p ON p.id = o.product_id
) x ON x.customer_id = c.id
ORDER BY c.id, x.order_id;`,
        ],
        mistakes: [
          { sql: sql`SELECT c.id, c.name, o.id, p.name, o.quantity
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN products p ON p.id = o.product_id
ORDER BY c.id, o.id;`, why: '內部合併只保留有訂單的顧客：李淑芬整列消失，結果少一列。N+1 的頁面會顯示她（只是訂單是空的），改寫之後的頁面卻沒有她，這種「改快了、也改錯了」的差異最難發現。' },
          { sql: sql`SELECT c.id, c.name, o.id, p.name, o.quantity
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
JOIN products p ON p.id = o.product_id
ORDER BY c.id, o.id;`, why: '第一個是 `LEFT JOIN`，第二個卻是內部合併：李淑芬那一列的 `o.product_id` 是 NULL，找不到任何商品，在第二個 JOIN 被丟掉，等於前面的 `LEFT JOIN` 白寫了。左外部合併之後接的表也要用 `LEFT JOIN`，或把內部合併放在括號或子查詢裡先做。' },
          { sql: sql`SELECT c.id, c.name, o.id, p.name, o.quantity
FROM customers c
LEFT JOIN orders o ON o.id = c.id
LEFT JOIN products p ON p.id = o.product_id
ORDER BY c.id, o.id;`, why: '合併條件寫成 `o.id = c.id`：把訂單編號拿去和顧客編號比對，每位顧客配到「編號剛好相同」的那一筆訂單，和誰下的訂單無關。合併條件要沿著外鍵：`orders.customer_id` 參考 `customers.id`。' },
        ],
      },
      {
        id: 'ex-checkout-tx', title: '結帳：安全地新增一張訂單',
        statement: '起始程式已經建立庫存表 `stock`（`product_id`、`quantity`，庫存不能是負數）並填好每項商品的庫存。林建宏（顧客 2）在 2026-10-03 結帳，購物車裡有 1 個機械鍵盤（商品 1）和 2 個 USB-C 集線器（商品 4）。請在起始程式後面寫出應用程式要送出的 SQL：用一筆交易，為每個品項在 `orders` 新增一列（`customer_id`、`product_id`、`quantity`、`ordered_on`，訂單 `id` 不寫，由資料庫產生），並從 `stock` 扣掉該商品的數量，最後提交。檢查時會在你的 SQL 之後開始另一筆交易、列出新訂單與庫存、再放棄這筆檢查用的交易；另外有當機測試與隱藏的檢查。',
        dataset: 'shop', hidden: ['shop'], ordered: false,
        atomic: { probe: 'SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT SUM(quantity) FROM stock) AS stock;' },
        starter: sql`${stockTable}
-- 在這裡寫結帳的交易
`,
        hints: [
          '骨架是 `BEGIN;`、兩個 `INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (…);`、兩個 `UPDATE stock SET quantity = quantity - 數量 WHERE product_id = 商品;`、`COMMIT;`。',
          '沒有 `BEGIN` 也能得到一樣的最後結果，但當機測試會模擬在每個敘述之後當機：新增了訂單、還沒扣庫存的狀態，不能讓其他人看到。',
          '購物車有兩個品項，就要扣兩次庫存，每次的 `WHERE` 對準那一項商品。程式裡把扣庫存寫在迴圈外面，是常見的錯誤。',
        ],
        solution: sql`${stockTable}
BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 1, 1, '2026-10-03');
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 1;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 4, 2, '2026-10-03');
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;
COMMIT;`,
        alternatives: [
          sql`${stockTable}
BEGIN TRANSACTION;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES
  (2, 1, 1, '2026-10-03'),
  (2, 4, 2, '2026-10-03');
UPDATE stock
SET quantity = quantity - CASE product_id WHEN 1 THEN 1 WHEN 4 THEN 2 END
WHERE product_id IN (1, 4);
END TRANSACTION;`,
          sql`${stockTable}
SAVEPOINT checkout;
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 1;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 4, 2, '2026-10-03');
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 1, 1, '2026-10-03');
RELEASE checkout;`,
        ],
        mistakes: [
          { sql: sql`${stockTable}
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 1, 1, '2026-10-03');
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 1;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 4, 2, '2026-10-03');
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;`, why: '沒有 `BEGIN`／`COMMIT`：每個敘述自動提交，正常執行時最後的資料一模一樣，但當機測試會抓到：如果在第一個 `INSERT` 之後當機，訂單已經存在、庫存卻沒有扣，或是一張訂單只成立了一半。這就是 JDBC 與 `node:sqlite` 預設自動提交時，程式忘了開交易的後果。' },
          { sql: sql`${stockTable}
BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 1, 1, '2026-10-03');
UPDATE stock SET quantity = quantity - 1 WHERE product_id = 1;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 4, 2, '2026-10-03');
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;`, why: '少了 `COMMIT`：同一個連線查得到新訂單，看起來都對，但交易還開著，檢查的 `BEGIN;` 因此被拒絕（`cannot start a transaction within a transaction`）。在程式裡，這就是忘了呼叫 `commit()`：連線一關閉，整張訂單消失。' },
          { sql: sql`${stockTable}
BEGIN;
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 1, 1, '2026-10-03');
INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (2, 4, 2, '2026-10-03');
UPDATE stock SET quantity = quantity - 2 WHERE product_id = 4;
COMMIT;`, why: '只扣了最後一個品項的庫存：程式把扣庫存寫在迴圈外面時就會這樣。機械鍵盤賣出 1 個，庫存卻還是 5。每個敘述都合法，交易也正常提交，原子性擋不住寫錯的邏輯，「列出庫存」的檢查才看得出來。' },
        ],
        probes: [
          { label: '開始另一筆交易（只有你的交易已經結束才可以）', sql: sql`BEGIN;` },
          { label: '這次結帳新增的訂單', sql: sql`SELECT customer_id, product_id, quantity, ordered_on FROM orders WHERE id > 8 ORDER BY product_id;` },
          { label: '列出庫存', sql: sql`SELECT product_id, quantity FROM stock ORDER BY product_id;` },
          { label: '放棄檢查用的交易', sql: sql`ROLLBACK;` },
          { label: '訂單總數', sql: sql`SELECT COUNT(*) FROM orders;`, hidden: true },
          { label: '訂單編號由資料庫依序產生', sql: sql`SELECT MIN(id), MAX(id) FROM orders WHERE id > 8;`, hidden: true },
        ],
      },
    ],
  },
  driverCode: {
    examples: [
      {
        id: 'drv-connect', title: '連線並執行參數化查詢',
        description: '建立一個記憶體中的資料庫與顧客表，用同一個參數化查詢查三個城市：`台北`、`台中`，以及一個含有引號的惡意值。值另外交給驅動程式綁定，所以惡意值只是一個查不到的城市名稱。',
        code: {
          Python: code`import sqlite3

conn = sqlite3.connect(':memory:')  # SQLite：開啟一個資料庫（這裡在記憶體裡）
try:
    conn.executescript('''
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
        INSERT INTO customers (name, city) VALUES ('陳美玲', '台北'), ('林建宏', '台中'), ('王雅雯', '台北');
    ''')
    sql = 'SELECT id, name FROM customers WHERE city = ? ORDER BY id'
    for city in ['台北', '台中', "台北' OR '1'='1"]:
        rows = conn.execute(sql, (city,)).fetchall()  # 值另外交給驅動程式綁定
        print(f'{city}：{len(rows)} 列')
        for customer_id, name in rows:
            print(' ', customer_id, name)
finally:
    conn.close()  # 不論成功或失敗都關閉連線
`,
          JavaScript: code`const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:'); // SQLite：開啟一個資料庫（這裡在記憶體裡）
try {
  db.exec(
    'CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);' +
    "INSERT INTO customers (name, city) VALUES ('陳美玲', '台北'), ('林建宏', '台中'), ('王雅雯', '台北');"
  );
  const query = db.prepare('SELECT id, name FROM customers WHERE city = ? ORDER BY id');
  for (const city of ['台北', '台中', "台北' OR '1'='1"]) {
    const rows = query.all(city); // 值另外交給驅動程式綁定
    console.log(city + '：' + rows.length + ' 列');
    for (const row of rows) console.log(' ', row.id, row.name);
  }
} finally {
  db.close(); // 不論成功或失敗都關閉連線
}
`,
          Java: code`import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) throws SQLException {
    // JDBC 只定義介面；執行時要有 SQLite 的 JDBC 驅動程式（例如 sqlite-jdbc）在 classpath 上。
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
      try (Statement st = conn.createStatement()) {
        st.executeUpdate("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL)");
        st.executeUpdate("INSERT INTO customers (name, city) VALUES ('陳美玲', '台北'), ('林建宏', '台中'), ('王雅雯', '台北')");
      }
      String sql = "SELECT id, name FROM customers WHERE city = ? ORDER BY id";
      try (PreparedStatement query = conn.prepareStatement(sql)) {
        for (String city : List.of("台北", "台中", "台北' OR '1'='1")) {
          query.setString(1, city); // 值另外交給驅動程式綁定；第 1 個 ? 的位置是 1
          List<String> lines = new ArrayList<>();
          try (ResultSet rs = query.executeQuery()) {
            while (rs.next()) lines.add("  " + rs.getInt("id") + " " + rs.getString("name"));
          }
          System.out.println(city + "：" + lines.size() + " 列");
          lines.forEach(System.out::println);
        }
      }
    } // try-with-resources：離開區塊時依相反順序關閉 ResultSet、PreparedStatement 與 Connection
  }
}
`,
        },
        output: `台北：2 列
  1 陳美玲
  3 王雅雯
台中：1 列
  2 林建宏
台北' OR '1'='1：0 列`,
      },
      {
        id: 'drv-transaction', title: '在程式裡用交易下訂單',
        description: '`place_order`／`placeOrder` 為每個品項新增一列訂單並扣庫存，全部成功才提交；庫存不夠時 `CHECK` 拒絕 `UPDATE`，程式回滾整張訂單。連線在 `finally`（Java 是 try-with-resources）裡關閉。',
        code: {
          Python: code`import sqlite3

SETUP = '''
CREATE TABLE stock (product_id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK (quantity >= 0));
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
                     quantity INTEGER NOT NULL, ordered_on TEXT NOT NULL);
INSERT INTO stock (product_id, quantity) VALUES (2, 3), (5, 1);
'''

def place_order(conn, customer_id, items, day):
    """一張訂單的每個品項：新增一列訂單、扣庫存。全部成功才提交。"""
    try:
        with conn:  # 區塊正常結束就 commit()，拋出例外就 rollback()；它不會關閉連線
            for product_id, quantity in items:
                conn.execute('INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (?, ?, ?, ?)',
                             (customer_id, product_id, quantity, day))
                conn.execute('UPDATE stock SET quantity = quantity - ? WHERE product_id = ?', (quantity, product_id))
        return '成功，已提交'
    except sqlite3.IntegrityError:  # 違反約束：這裡是 CHECK (quantity >= 0)，庫存不夠
        return '庫存不足，已回滾'

def show(conn):
    count = conn.execute('SELECT COUNT(*) FROM orders').fetchone()[0]
    stock = conn.execute('SELECT product_id, quantity FROM stock ORDER BY product_id').fetchall()
    print('  訂單', count, '列；庫存', ', '.join(f'商品{p}={q}' for p, q in stock))

conn = sqlite3.connect(':memory:')
try:
    conn.executescript(SETUP)
    print('第一張訂單：', place_order(conn, 3, [(2, 2), (5, 1)], '2026-10-01'))
    show(conn)
    print('第二張訂單：', place_order(conn, 1, [(2, 1), (5, 1)], '2026-10-02'))
    show(conn)
finally:
    conn.close()  # 不論成功或失敗都釋放連線
`,
          JavaScript: code`const { DatabaseSync } = require('node:sqlite');

const SETUP = [
  'CREATE TABLE stock (product_id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK (quantity >= 0));',
  'CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL,',
  '                     quantity INTEGER NOT NULL, ordered_on TEXT NOT NULL);',
  'INSERT INTO stock (product_id, quantity) VALUES (2, 3), (5, 1);',
].join('\n');

/** 一張訂單的每個品項：新增一列訂單、扣庫存。全部成功才提交。 */
function placeOrder(db, customerId, items, day) {
  const insert = db.prepare('INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (?, ?, ?, ?)');
  const deduct = db.prepare('UPDATE stock SET quantity = quantity - ? WHERE product_id = ?');
  db.exec('BEGIN'); // node:sqlite 預設自動提交：不寫 BEGIN，每個敘述各自是一筆交易
  try {
    for (const [productId, quantity] of items) {
      insert.run(customerId, productId, quantity, day);
      deduct.run(quantity, productId);
    }
    db.exec('COMMIT');
    return '成功，已提交';
  } catch (e) {
    db.exec('ROLLBACK'); // 任何一步失敗：整張訂單都不算
    if (!String(e.message).includes('CHECK constraint failed')) throw e;
    return '庫存不足，已回滾';
  }
}

function show(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
  const stock = db.prepare('SELECT product_id, quantity FROM stock ORDER BY product_id').all();
  console.log('  訂單', count, '列；庫存', stock.map(s => '商品' + s.product_id + '=' + s.quantity).join(', '));
}

const db = new DatabaseSync(':memory:');
try {
  db.exec(SETUP);
  console.log('第一張訂單：', placeOrder(db, 3, [[2, 2], [5, 1]], '2026-10-01'));
  show(db);
  console.log('第二張訂單：', placeOrder(db, 1, [[2, 1], [5, 1]], '2026-10-02'));
  show(db);
} finally {
  db.close(); // 不論成功或失敗都釋放連線
}
`,
          Java: code`import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public class Main {
  /** 一張訂單的每個品項：新增一列訂單、扣庫存。全部成功才提交。 */
  static String placeOrder(Connection conn, int customerId, int[][] items, String day) throws SQLException {
    conn.setAutoCommit(false); // JDBC 連線預設自動提交；關掉之後，敘述都在同一筆交易裡，直到 commit() 或 rollback()
    try (PreparedStatement insert = conn.prepareStatement(
             "INSERT INTO orders (customer_id, product_id, quantity, ordered_on) VALUES (?, ?, ?, ?)");
         PreparedStatement deduct = conn.prepareStatement("UPDATE stock SET quantity = quantity - ? WHERE product_id = ?")) {
      for (int[] item : items) {
        insert.setInt(1, customerId);
        insert.setInt(2, item[0]);
        insert.setInt(3, item[1]);
        insert.setString(4, day);
        insert.executeUpdate();
        deduct.setInt(1, item[1]);
        deduct.setInt(2, item[0]);
        deduct.executeUpdate();
      }
      conn.commit();
      return "成功，已提交";
    } catch (SQLException e) {
      conn.rollback(); // 任何一步失敗：整張訂單都不算
      if (e.getMessage() == null || !e.getMessage().contains("CHECK constraint failed")) throw e;
      return "庫存不足，已回滾";
    } finally {
      conn.setAutoCommit(true);
    }
  }

  static void show(Connection conn) throws SQLException {
    try (Statement st = conn.createStatement()) {
      try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM orders")) {
        rs.next();
        System.out.print("  訂單 " + rs.getInt(1) + " 列；庫存");
      }
      try (ResultSet rs = st.executeQuery("SELECT product_id, quantity FROM stock ORDER BY product_id")) {
        String separator = " ";
        while (rs.next()) {
          System.out.print(separator + "商品" + rs.getInt(1) + "=" + rs.getInt(2));
          separator = ", ";
        }
        System.out.println();
      }
    }
  }

  public static void main(String[] args) throws SQLException {
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
      try (Statement st = conn.createStatement()) {
        st.executeUpdate("CREATE TABLE stock (product_id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL CHECK (quantity >= 0))");
        st.executeUpdate("CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL, "
            + "quantity INTEGER NOT NULL, ordered_on TEXT NOT NULL)");
        st.executeUpdate("INSERT INTO stock (product_id, quantity) VALUES (2, 3), (5, 1)");
      }
      System.out.println("第一張訂單： " + placeOrder(conn, 3, new int[][] {{2, 2}, {5, 1}}, "2026-10-01"));
      show(conn);
      System.out.println("第二張訂單： " + placeOrder(conn, 1, new int[][] {{2, 1}, {5, 1}}, "2026-10-02"));
      show(conn);
    } // 離開區塊時關閉連線；使用連線池時，close() 是把連線還給池子
  }
}
`,
        },
        output: `第一張訂單： 成功，已提交
  訂單 2 列；庫存 商品2=1, 商品5=0
第二張訂單： 庫存不足，已回滾
  訂單 2 列；庫存 商品2=1, 商品5=0`,
      },
      {
        id: 'drv-mini-orm', title: '手寫迷你 ORM：延遲載入造成的 N+1',
        description: '`Customer` 類別對映 `customers` 表；`customer.orders` 第一次被讀取時才查詢（延遲載入）。`Session.query` 印出每個送出的 SQL 並計數，比較延遲載入與一個 `LEFT JOIN` 的預先載入。這是教學用的迷你 ORM，只有 Python 版本。',
        code: {
          Python: code`import sqlite3

class Session:
    """迷你 ORM 的工作階段：每個查詢都經過這裡，所以能記下送出的 SQL（像 ORM 的 SQL 記錄）。"""
    def __init__(self, conn):
        self.conn = conn
        self.sent = 0

    def query(self, sql, params=()):
        self.sent += 1
        print(f'  SQL #{self.sent}: {sql}' + (f'  參數 {list(params)}' if params else ''))
        return self.conn.execute(sql, params).fetchall()

class Order:
    def __init__(self, id, quantity):
        self.id, self.quantity = id, quantity

class Customer:
    """類別對映資料表 customers：一個物件是一列，屬性是欄位。"""
    def __init__(self, session, id, name):
        self.session, self.id, self.name = session, id, name
        self._orders = None

    @property
    def orders(self):
        # 延遲載入（lazy loading）：第一次讀 customer.orders 時才送查詢
        if self._orders is None:
            rows = self.session.query('SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id', (self.id,))
            self._orders = [Order(*row) for row in rows]
        return self._orders

    @classmethod
    def all(cls, session):
        return [cls(session, *row) for row in session.query('SELECT id, name FROM customers ORDER BY id')]

    @classmethod
    def all_with_orders(cls, session):
        # 預先載入（eager loading）：一個 LEFT JOIN 取回顧客與訂單，再在程式裡依顧客分組
        rows = session.query('SELECT c.id, c.name, o.id, o.quantity FROM customers c '
                             'LEFT JOIN orders o ON o.customer_id = c.id ORDER BY c.id, o.id')
        customers = {}
        for cid, name, oid, quantity in rows:
            customer = customers.setdefault(cid, cls(session, cid, name))
            if customer._orders is None:
                customer._orders = []
            if oid is not None:
                customer._orders.append(Order(oid, quantity))
        return list(customers.values())

conn = sqlite3.connect(':memory:')
try:
    conn.executescript('''
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
                             quantity INTEGER NOT NULL);
        INSERT INTO customers VALUES (1, '陳美玲'), (2, '林建宏'), (3, '王雅雯'), (4, '張志明'), (5, '李淑芬');
        INSERT INTO orders VALUES (1, 1, 1), (2, 1, 2), (3, 2, 1), (4, 3, 1), (5, 3, 3), (6, 4, 2), (7, 2, 1), (8, 1, 1);
    ''')
    for title, load in [('延遲載入', Customer.all), ('預先載入（JOIN）', Customer.all_with_orders)]:
        print(f'-- {title}')
        session = Session(conn)
        for customer in load(session):
            print(f'{customer.name}：{len(customer.orders)} 筆訂單，共 {sum(o.quantity for o in customer.orders)} 件')
        print(f'共送出 {session.sent} 個查詢')
finally:
    conn.close()
`,
        },
        output: `-- 延遲載入
  SQL #1: SELECT id, name FROM customers ORDER BY id
  SQL #2: SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id  參數 [1]
陳美玲：3 筆訂單，共 4 件
  SQL #3: SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id  參數 [2]
林建宏：2 筆訂單，共 2 件
  SQL #4: SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id  參數 [3]
王雅雯：2 筆訂單，共 4 件
  SQL #5: SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id  參數 [4]
張志明：1 筆訂單，共 2 件
  SQL #6: SELECT id, quantity FROM orders WHERE customer_id = ? ORDER BY id  參數 [5]
李淑芬：0 筆訂單，共 0 件
共送出 6 個查詢
-- 預先載入（JOIN）
  SQL #1: SELECT c.id, c.name, o.id, o.quantity FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ORDER BY c.id, o.id
陳美玲：3 筆訂單，共 4 件
林建宏：2 筆訂單，共 2 件
王雅雯：2 筆訂單，共 4 件
張志明：1 筆訂單，共 2 件
李淑芬：0 筆訂單，共 0 件
共送出 1 個查詢`,
      },
    ],
  },
  sequences: [
    {
      id: 'seq-customer-orders', title: '往返模擬器：列出每位顧客的訂單', dataset: 'shop',
      description: '同一件工作（5 位顧客與他們的 8 筆訂單）的三種做法。每個查詢都在你的瀏覽器裡真正執行；先猜每種做法要幾次往返，再按下去對答案。',
      strategies: [
        {
          label: 'N+1（逐筆延遲載入）',
          note: '先查顧客，再為第一個查詢的每一列（每位顧客）各送一次訂單查詢，參數是那位顧客的 `id`。顧客越多，往返越多：1000 位顧客就是 1001 次。',
          first: { sql: 'SELECT id, name FROM customers ORDER BY id' },
          then: { sql: 'SELECT id, product_id, quantity FROM orders WHERE customer_id = ? ORDER BY id', column: 'id', mode: 'per-row' },
        },
        {
          label: '一個 LEFT JOIN',
          note: '一次往返取回全部資料：每筆訂單一列，顧客欄位重複；沒有訂單的李淑芬也有一列。程式（或 ORM）再依顧客 `id` 分組。',
          first: { sql: 'SELECT c.id, c.name, o.id AS order_id, o.product_id, o.quantity FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ORDER BY c.id, o.id' },
        },
        {
          label: '批次 IN',
          note: '先查顧客，再把所有顧客的 `id` 當成參數，用一個 `IN (?, ?, …)` 取回全部訂單：不論顧客有幾位，都是 2 次往返。程式依 `customer_id` 把訂單分給各個顧客。',
          first: { sql: 'SELECT id, name FROM customers ORDER BY id' },
          then: { sql: 'SELECT id, customer_id, product_id, quantity FROM orders WHERE customer_id IN (?) ORDER BY customer_id, id', column: 'id', mode: 'batched' },
        },
      ],
    },
  ],
};
