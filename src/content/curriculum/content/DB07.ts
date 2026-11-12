import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB07 Defining and Changing Data: DDL, DML, and Constraints. SQL lesson (Phase F.1b): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB07: LessonContent = {
  lessonId: 'DB07',
  motivation: '前幾課你一直在「讀」資料：表是別人建好的，資料也早就放好了。真正的應用程式還要「寫」：會員註冊是 `INSERT`，商品調價是 `UPDATE`，取消訂單是 `DELETE`，新功能需要一張新表就是 `CREATE TABLE`。寫入比查詢危險得多：查詢寫錯只是結果不對，改好再查一次就好；`UPDATE` 少寫一個 `WHERE`，卻會一口氣改掉整張表，而且沒有「復原」可按。本課分兩條線。第一，建表時就把規則寫進綱要：主鍵、外鍵、`NOT NULL`、`UNIQUE`、`CHECK`、`DEFAULT`，讓違反規則的資料根本進不來，不管它來自哪一支程式、哪一位工程師；你會練習讀懂錯誤訊息，說出一筆 `INSERT` 為什麼被拒絕。第二，修改資料之前先預測會影響幾列，並決定刪除被參照的資料時，該拒絕、連帶刪除，還是改成 NULL（外鍵動作）。最後用 `ALTER TABLE` 調整已經在用的表，並認識 SQLite 在型別、外鍵與 `ALTER TABLE` 上和其他 DBMS 不一樣的地方。',
  sections: [
    {
      id: 'ddl-and-dml', title: 'DDL 與 DML：改結構與改內容',
      blocks: [
        { type: 'p', text: 'DB01 把 SQL 敘述分成幾類，本課用到其中兩類。DDL 改的是綱要（有哪些表、哪些欄位、哪些規則），DML 改的是實例（表裡此刻有哪些列）。`SELECT` 也屬於 DML，但它只讀不寫：' },
        { type: 'table', head: ['類別', '敘述', '作用'], rows: [
          ['DDL', '`CREATE TABLE`', '建立新表：欄位、型別、約束'],
          ['DDL', '`ALTER TABLE`', '修改既有的表：改名、加欄位、刪欄位'],
          ['DDL', '`DROP TABLE`', '刪除整張表，結構和資料一起消失'],
          ['DML', '`INSERT`', '新增資料列'],
          ['DML', '`UPDATE`', '修改符合條件的列的欄位值'],
          ['DML', '`DELETE`', '刪除符合條件的列'],
        ] },
        { type: 'p', text: '本課的練習場是線上商店 `shop`，而且你的修改會留下來：每次按「執行」都作用在同一個資料庫上，直到你按「重設資料」。一次執行好幾個敘述時，練習場依序執行，遇到第一個錯誤就停下：錯誤之前的敘述已經生效，不會整批復原；出錯的那一個敘述則完全沒有效果。執行 `INSERT`、`UPDATE`、`DELETE` 之後，結果下方會顯示「已修改 N 列」，這是這一次執行總共改動的列數。' },
        { type: 'callout', tone: 'tip', title: '重跑範例前先重設', text: '本課的範例都假設從原始資料開始。同一個 `CREATE TABLE` 執行第二次會得到 `table reviews already exists`，`DELETE` 過的列也不會自己回來，所以重跑範例之前先按「重設資料」。標示「空白資料庫」的範例建立的表（`readings`、`coupons`、`items`）在 `shop` 裡沒有同名的表，直接貼到練習場也能執行。' },
      ],
    },
    {
      id: 'create-table-types', title: 'CREATE TABLE 與資料型別',
      blocks: [
        { type: 'p', text: '`CREATE TABLE` 的骨架是 `CREATE TABLE 表名 (欄位定義, 欄位定義, …, 表格約束, …)`。每個欄位定義依序是名稱、型別、零到多個欄位約束，例如 `rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5)`。牽涉好幾個欄位的規則（複合主鍵、「兩欄的組合不能重複」）寫在所有欄位之後，叫做表格約束，例如 DB02 的 `PRIMARY KEY (student_id, course_id)`。' },
        { type: 'p', text: '型別描述欄位存什麼樣的值。標準 SQL 與多數 DBMS 的常用型別，和 SQLite 的處理方式對照如下：' },
        { type: 'table', head: ['用途', '標準 SQL 與多數 DBMS', 'SQLite 的做法'], rows: [
          ['整數', '`INTEGER`、`SMALLINT`、`BIGINT`', '存成整數'],
          ['精確小數（金額）', '`DECIMAL(10, 2)`、`NUMERIC(10, 2)`', '沒有精確小數：`\'12.30\'` 存成浮點數 12.3，存在這種欄位裡的 0.1 乘以 3 得到 0.30000000000000004。本課的 `price` 以「元」存成整數，避開這個問題'],
          ['文字', '`CHAR(n)`、`VARCHAR(n)`', '一律存成文字，`VARCHAR(3)` 的長度不會被檢查'],
          ['日期與時間', '`DATE`、`TIMESTAMP`', '沒有日期型別：常見做法是存成 `YYYY-MM-DD` 文字（本課資料的 `ordered_on` 就是），再用 `date()` 等函式計算'],
          ['真假值', '`BOOLEAN`', '沒有布林型別：慣例存 0 與 1'],
        ] },
        { type: 'p', text: '最大的差別在於型別有沒有強制力。在 PostgreSQL 等多數 DBMS 裡，把 `\'abc\'` 存進整數欄位、把 7 個字元存進 `VARCHAR(3)` 都會直接報錯。SQLite 預設採用型別親和性（type affinity）：宣告的型別只是「偏好」，存入時能無損轉換就轉換，轉不了就照原樣存下。`typeof()` 是 SQLite 的函式，回傳一個值實際的儲存類別：' },
        { type: 'example', id: 'type-affinity' },
        { type: 'list', items: [
          '`\'42\'` 存進 `INTEGER` 欄位：這段文字能無損轉成整數，所以存成整數 42。',
          '`\'abc\'` 存進 `INTEGER` 欄位：轉不了，SQLite 不報錯，照樣存成文字。之後 `n + 1`、排序、比較都可能出乎意料。',
          '7 存進 `TEXT` 欄位：轉成文字 `\'7\'`。',
          '`\'ABCDEFG\'` 存進 `VARCHAR(3)`：7 個字元全部存下，括號裡的長度被忽略。',
        ] },
        { type: 'callout', tone: 'note', title: 'SQLite 的 STRICT 表（3.37.0 起）', text: '在 `CREATE TABLE` 的右括號後面加上 `STRICT`，SQLite 就會像其他 DBMS 一樣檢查型別。試試 `CREATE TABLE strict_demo (n INTEGER, label TEXT) STRICT; INSERT INTO strict_demo VALUES (\'abc\', \'x\');`，會得到 `cannot store TEXT value in INTEGER column strict_demo.n`；`\'42\'` 仍然會被轉成整數 42 存入。STRICT 表只接受 `INT`、`INTEGER`、`REAL`、`TEXT`、`BLOB`、`ANY` 這幾個型別名稱，寫 `DATE` 會得到 `unknown datatype`。本練習場執行 SQLite 3.49.1，支援 STRICT。' },
        { type: 'callout', tone: 'tip', title: '型別擋不住的，交給約束', text: '就算型別有強制力，它也只能確保「是整數」，擋不了「價格是負數」或「評分是 9」。值的範圍、允許的選項、必填與否，要靠下一節開始介紹的約束。DB02 說過，資料型別只是值域的粗略近似；約束才把值域說清楚。' },
      ],
    },
    {
      id: 'keys', title: '主鍵與外鍵：把關聯寫進綱要',
      blocks: [
        { type: 'p', text: '主鍵寫在欄位後面是 `id INTEGER PRIMARY KEY`；由多個欄位組成時寫成表格約束 `PRIMARY KEY (a, b)`。外鍵也有兩種寫法：欄位約束 `product_id INTEGER REFERENCES products(id)`，或表格約束 `FOREIGN KEY (product_id) REFERENCES products(id)`，兩者意思相同。被參照的欄位必須是那張表的主鍵或有 `UNIQUE` 約束，否則 SQLite 寫入時會回報 `foreign key mismatch`。PostgreSQL 等 DBMS 要求被參照的表先存在才能建子表；SQLite 建表時不檢查，但父表建好之前，子表一列都寫不進去（`no such table`）。所以一律先建父表、後建子表。' },
        { type: 'p', text: '下面替商店加一張商品評論表 `reviews`：每則評論一定屬於一項商品（`NOT NULL` 外鍵），評論者可以是 NULL（匿名評論）。新增時不給 `id`，看看主鍵怎麼來：' },
        { type: 'example', id: 'create-reviews' },
        { type: 'p', text: '兩則評論的 `id` 自動編成 1 和 2，最後的查詢再用 DB05 的 `JOIN` 把編號換回名稱。外鍵現在會守住參考完整性：在練習場執行這個範例之後，再試 `INSERT INTO reviews (product_id, customer_id, rating) VALUES (99, 1, 5);`，因為沒有編號 99 的商品，得到 `FOREIGN KEY constraint failed`。`customer_id` 給 NULL 則可以：外鍵欄位允許 NULL 時，NULL 表示「沒有參照任何列」，不需要配對（DB02 的參考完整性）。' },
        { type: 'callout', tone: 'note', title: 'INTEGER PRIMARY KEY 與自動編號（SQLite）', text: '在 SQLite 裡，型別剛好寫成 `INTEGER` 的主鍵是 rowid（每一列內部的列編號）的別名：新增時不給值或給 NULL，SQLite 自動配一個編號，通常是目前最大值加 1；再加上 `AUTOINCREMENT` 可以保證刪掉的編號永遠不會被重複使用。只有剛好寫 `INTEGER` 才算：`id INT PRIMARY KEY` 是普通主鍵，不會自動編號，而且因為 DB02 提過的歷史原因，SQLite 還允許它存 NULL，新增時不給值就會得到 `id` 是 NULL 的列。其他 DBMS 用不同的語法宣告自動編號：標準 SQL 與 PostgreSQL 的 `GENERATED ALWAYS AS IDENTITY`、MySQL 的 `AUTO_INCREMENT`、SQL Server 的 `IDENTITY`。' },
        { type: 'callout', tone: 'note', title: 'SQLite 預設不檢查外鍵', text: '為了相容舊程式，SQLite 每個連線預設都不檢查外鍵，要先執行 `PRAGMA foreign_keys = ON;`；練習場已經替你開好，執行 `PRAGMA foreign_keys;` 會看到 1。如果你執行 `PRAGMA foreign_keys = OFF;`，`DELETE FROM customers WHERE id = 4;` 就會成功，留下一筆指向不存在顧客的訂單 6，正是外鍵要防止的孤兒資料。按「重設資料」會重新開啟檢查。PostgreSQL 等 DBMS 則一律檢查宣告過的外鍵，沒有這個開關。' },
      ],
    },
    {
      id: 'constraints', title: '約束：NOT NULL、UNIQUE、CHECK、DEFAULT',
      blocks: [
        { type: 'p', text: '約束（constraint）是寫在綱要裡、每一列都必須遵守的規則。DBMS 在每次新增或修改資料時檢查，不符合就拒絕整個敘述。四個最常用的：' },
        { type: 'list', items: [
          '`NOT NULL`：這個欄位一定要有值。',
          '`UNIQUE`：任兩列在這個欄位上的值都不能相同。寫成表格約束 `UNIQUE (product_id, customer_id)` 時，是「組合」不能重複：同一位顧客對同一項商品只能評一次，但可以評很多項商品。一張表只有一個主鍵，但可以有好幾個 `UNIQUE`，通常用來宣告 DB02 說的其他候選鍵。',
          '`CHECK (條件)`：每一列都要讓條件成立，例如 `CHECK (discount BETWEEN 1 AND 90)`、`CHECK (status IN (\'active\', \'expired\'))`。',
          '`DEFAULT 值`：`INSERT` 沒有提到這個欄位時使用的值。它本身不會拒絕任何資料，但常和 `NOT NULL` 搭配：「必填，但不填就用預設值」。',
        ] },
        { type: 'p', text: '下面在空白資料庫建立一張優惠券表，四種約束都用上，然後新增三張合法的優惠券：' },
        { type: 'example', id: 'coupon-constraints' },
        { type: 'p', text: 'WELCOME10 沒有提到 `status`，所以得到預設值 `active`；`min_spend` 沒有預設值，就是 NULL。FREE5 明確把 `min_spend` 寫成 NULL，`CHECK (min_spend >= 0)` 也放行了，原因見下面的提醒。接著在練習場逐一執行下表的敘述（先執行上面的範例），每一個都會被拒絕：' },
        { type: 'table', head: ['敘述', 'SQLite 的錯誤訊息', '為什麼被拒絕'], rows: [
          ['`INSERT INTO coupons (code, discount) VALUES (\'WELCOME10\', 15);`', '`UNIQUE constraint failed: coupons.code`', '已經有一張代碼 WELCOME10 的優惠券'],
          ['`INSERT INTO coupons (code, discount) VALUES (\'HALF\', 95);`', '`CHECK constraint failed: discount BETWEEN 1 AND 90`', '把 95 代進條件，`95 BETWEEN 1 AND 90` 不成立'],
          ['`INSERT INTO coupons (code) VALUES (\'NODISC\');`', '`NOT NULL constraint failed: coupons.discount`', '沒提到 `discount`，它又沒有預設值，於是是 NULL'],
          ['`INSERT INTO coupons (code, discount, status) VALUES (\'X1\', 10, NULL);`', '`NOT NULL constraint failed: coupons.status`', '明確寫了 NULL；預設值只在「沒有提到這個欄位」時才用'],
          ['`INSERT INTO coupons (code, discount, status) VALUES (\'X2\', 10, \'used\');`', '`CHECK constraint failed: status IN (\'active\', \'expired\')`', '`used` 不在允許的選項裡'],
          ['`INSERT INTO coupons (id, code, discount) VALUES (1, \'DUP\', 10);`', '`UNIQUE constraint failed: coupons.id`', '主鍵 1 已經被 WELCOME10 用掉；SQLite 把主鍵重複也回報成 UNIQUE'],
        ] },
        { type: 'p', text: '說明一筆 `INSERT` 為什麼被拒絕，照三個步驟：一、錯誤訊息的開頭說明是哪一種約束（`NOT NULL`、`UNIQUE`、`CHECK`、`FOREIGN KEY`）；二、冒號後面是哪個欄位或哪個條件（`FOREIGN KEY` 的訊息沒有寫是哪一個外鍵，要自己對照綱要）；三、把這一列的值代進那條規則，指出哪裡不成立：是缺了值、和哪一列重複、讓哪個條件為假，還是指向不存在的列。' },
        { type: 'callout', tone: 'warning', title: 'CHECK 遇到 NULL 會放行', text: '`CHECK` 只拒絕讓條件為「假」的列。`NULL >= 0` 的結果是未知（DB03 的三值邏輯），不是假，所以放行。這和 `WHERE` 正好相反：`WHERE` 只留下為「真」的列，`CHECK` 只擋下為「假」的列，未知的兩邊都不算數。這是標準 SQL 的規則，PostgreSQL 也一樣。所以「必填而且不能是負數」要寫成 `NOT NULL CHECK (min_spend >= 0)`，兩個都要。' },
        { type: 'callout', tone: 'note', title: 'UNIQUE 與 NULL', text: '`UNIQUE` 欄位可以有好幾列都是 NULL：NULL 代表未知，兩個未知不算「相同」。SQLite 與 PostgreSQL 都是這樣；SQL Server 的 `UNIQUE` 約束則把 NULL 當成相同的值，只允許一列是 NULL。所以「每位會員的 email 不能重複，而且一定要填」要寫成 `NOT NULL UNIQUE`。' },
        { type: 'callout', tone: 'tip', title: '替約束取名', text: '約束前面可以加名稱：`discount INTEGER NOT NULL CONSTRAINT discount_range CHECK (discount BETWEEN 1 AND 90)`。違反時 SQLite 的訊息會變成 `CHECK constraint failed: discount_range`，比一長串條件好認。在支援 `ALTER TABLE … DROP CONSTRAINT` 的 DBMS（如 PostgreSQL、SQL Server）裡，名稱也是日後移除這條約束時要用的。' },
      ],
    },
    {
      id: 'insert', title: 'INSERT：新增資料列',
      blocks: [
        { type: 'p', text: '`INSERT` 最好的寫法是列出欄位：`INSERT INTO coupons (code, discount) VALUES (\'WELCOME10\', 10);`。值依欄位清單的順序對應；清單裡沒有的欄位用 `DEFAULT`，沒有預設值就是 NULL（若該欄是 `NOT NULL` 就被拒絕）。省略欄位清單的 `INSERT INTO coupons VALUES (…)` 必須依建表順序給齊每一個欄位：少給一個就得到 `table coupons has 3 columns but 2 values were supplied` 這類錯誤，而且表日後用 `ALTER TABLE` 多了一欄，所有這樣寫的程式都會一起壞掉。' },
        { type: 'p', text: '一個 `VALUES` 後面可以接好幾列，用逗號分開，它們仍然是同一個敘述。一個敘述是全有或全無的：`INSERT INTO coupons (code, discount) VALUES (\'A\', 10), (\'B\', 95), (\'C\', 20);` 的第二列違反 `CHECK`，結果三列一列都不會新增，不是先存下 A 再停住。這是標準 SQL 對單一敘述的保證，叫做敘述的原子性；要讓好幾個敘述也全有或全無，就需要交易（transaction），DB14 會介紹。' },
        { type: 'p', text: '`INSERT` 也可以把查詢的結果整批新增，寫成 `INSERT INTO 表 (欄位清單) SELECT …`。SELECT 的欄位依位置對應到欄位清單，名稱不必相同。下面在調價之前，先把周邊商品的舊價格存進價格紀錄表：' },
        { type: 'example', id: 'insert-select' },
        { type: 'p', text: '`SELECT id, price` 的兩欄依序填進 `product_id` 與 `old_price`；`changed_on` 不在欄位清單裡，兩列都得到預設值。因為先存了舊價格才調價，紀錄表裡的才是調價前的數字；兩個敘述的順序對調，存下的就是新價格了。中間的 `UPDATE` 是下一節的主題。' },
      ],
    },
    {
      id: 'update-delete', title: 'UPDATE 與 DELETE：先預測影響幾列',
      blocks: [
        { type: 'p', text: '`UPDATE 表 SET 欄位 = 運算式, … WHERE 條件;` 修改符合條件的每一列；運算式可以用這一列原本的值，例如 `price = price + 100`。`DELETE FROM 表 WHERE 條件;` 刪除符合條件的每一列。兩者的 `WHERE` 和 `SELECT` 的 `WHERE` 完全一樣，所以有一個可靠的預測方法：先把同一個條件放進 `SELECT COUNT(*) FROM 表 WHERE …` 或直接列出那些列，看清楚會動到誰，再執行修改。' },
        { type: 'example', id: 'update-changes' },
        { type: 'p', text: '低於 1000 元的是無線滑鼠（890）與筆電支架（990），所以 `updated` 是 2。`changes()` 是 SQLite 的函式，回傳最近一個 `INSERT`、`UPDATE` 或 `DELETE` 改動的列數；其他 DBMS 則由用戶端回報，例如 PostgreSQL 的 psql 在 `UPDATE` 後顯示 `UPDATE 2`，Java 的 JDBC `executeUpdate` 回傳列數。注意這個 `UPDATE` 不能重複執行而得到同樣效果：再執行一次，筆電支架已經是 1090 元，只剩無線滑鼠（990）符合條件，`changes()` 變成 1。' },
        { type: 'p', text: '`DELETE` 也一樣先預測。下表都從練習場的原始資料開始：' },
        { type: 'table', head: ['敘述', '結果', '原因'], rows: [
          ['`DELETE FROM orders WHERE quantity >= 2;`', '刪除 3 列', '訂單 2、5、6 的數量是 2、3、2'],
          ['`DELETE FROM customers WHERE id = 5;`', '刪除 1 列', '李淑芬沒有訂單，也不是任何人的推薦人'],
          ['`DELETE FROM customers WHERE id = 4;`', '被拒絕，0 列', '`FOREIGN KEY constraint failed`：訂單 6 參照張志明，外鍵的預設動作拒絕刪除'],
          ['`DELETE FROM customers WHERE city = \'台北\';`', '被拒絕，0 列', '陳美玲與王雅雯都有訂單；整個敘述失敗，一列都不刪'],
          ['`DELETE FROM orders WHERE product_id IN (SELECT id FROM products WHERE category = \'配件\');`', '刪除 2 列', '`WHERE` 裡可以放子查詢（DB06）：配件是商品 4、5，訂單 5、7 買的是商品 4'],
          ['`DELETE FROM orders;`', '刪除 8 列', '沒有 `WHERE` 就是整張表'],
        ] },
        { type: 'callout', tone: 'warning', title: '忘了 WHERE', text: '`UPDATE products SET price = price + 100;` 是合法的敘述，DBMS 不會警告，五項商品全部漲價。在練習場按「重設資料」就能還原，正式系統沒有這個按鈕，只能靠交易（執行前開始、發現錯誤就復原）與備份。養成習慣：先寫好並執行 `SELECT … WHERE 條件`，確認列數，再把 `SELECT` 換成 `UPDATE` 或 `DELETE`；執行後看「已修改 N 列」或 `changes()`，和你預測的數字對照。' },
        { type: 'callout', tone: 'note', title: '清空整張表', text: 'PostgreSQL、MySQL、SQL Server 等有 `TRUNCATE TABLE 表名` 快速清空一張表。SQLite 沒有 `TRUNCATE`，用不加 `WHERE` 的 `DELETE FROM 表名`，SQLite 通常會用比較快的方式一次清空。兩者都只清資料、保留表的結構；連結構一起刪除是 `DROP TABLE`。' },
      ],
    },
    {
      id: 'fk-actions', title: '外鍵動作：ON DELETE 與 ON UPDATE',
      blocks: [
        { type: 'p', text: '上一節刪除張志明被拒絕，是外鍵的預設動作在作用。被參照的列（父列）被刪除或主鍵被修改時，參照它的列（子列）該怎麼辦，可以在外鍵後面指定：`REFERENCES products(id) ON DELETE CASCADE ON UPDATE …`。標準 SQL 定義了五種動作，名稱在各家 DBMS 都通用：' },
        { type: 'table', head: ['動作', '刪除父列時（ON DELETE）', '適合的情況'], rows: [
          ['`NO ACTION`（預設）', '還有子列參照它就拒絕', '沒有特別理由時的安全選擇；訂單參照顧客'],
          ['`RESTRICT`', '同樣拒絕', '和 `NO ACTION` 幾乎相同，差別只在檢查的時機（見下方說明）'],
          ['`CASCADE`', '連同參照它的子列一起刪除', '子列離開父列就沒有意義：訂單明細、商品評論、文章的留言'],
          ['`SET NULL`', '把子列的外鍵改成 NULL，子列保留', '關係是可有可無的：顧客刪除帳號後，評論保留為匿名'],
          ['`SET DEFAULT`', '把子列的外鍵改成該欄位的預設值', '很少用；預設值本身也必須是存在的父列，否則照樣違反外鍵'],
        ] },
        { type: 'p', text: '`ON UPDATE` 用同樣的五種動作，處理父列的主鍵被修改的情況，例如 `ON UPDATE CASCADE` 會把子列的外鍵一起改成新值。主鍵若是不會改變的編號，`ON UPDATE` 很少派上用場；若是 `\'CS101\'` 這種有意義的代碼，課程改代碼時 `ON UPDATE CASCADE` 會讓選課紀錄跟著改。下面重新定義 `reviews`：刪商品時評論一起刪，刪顧客時評論留下但變成匿名。筆電支架（商品 5）與李淑芬（顧客 5）都沒有訂單，`orders` 的外鍵不會擋下刪除：' },
        { type: 'example', id: 'fk-cascade-set-null' },
        { type: 'p', text: '評論 1、2 是筆電支架的，隨著商品被刪而消失（`CASCADE`）；評論 3、4 是李淑芬寫的，留下來，但 `customer_id` 變成 NULL（`SET NULL`）；評論 5 和被刪的兩列都無關，原封不動。那麼「刪除筆電支架」這個敘述影響了幾列？' },
        { type: 'example', id: 'cascade-changes' },
        { type: 'p', text: '`changes()` 是 1：它只計算敘述本身直接刪除、修改或新增的列，外鍵動作（以及觸發程序）連帶造成的改動不算在內，這是 SQLite 文件明定的行為。可是 `reviews` 確實少了兩列，從 3 列剩下 1 列。SQLite 另一個函式 `total_changes()` 累計這個連線開啟以來的所有改動，就包含外鍵動作；練習場的「已修改 N 列」也是用它算的，所以把上例拆成兩次執行，先執行到 `INSERT` 為止，再單獨執行 `DELETE FROM products WHERE id = 5;`，練習場會顯示「已修改 3 列」，接著執行 `SELECT changes();` 仍然是 1。預測影響列數時，記得把 `CASCADE` 與 `SET NULL` 波及的子列也算進去。' },
        { type: 'callout', tone: 'warning', title: 'SET NULL 碰上 NOT NULL', text: '如果把外鍵欄位宣告成 `NOT NULL` 又設定 `ON DELETE SET NULL`，建表不會報錯，但刪除父列時 SQLite 要把子列改成 NULL，違反 `NOT NULL`，整個刪除被拒絕，錯誤訊息是 `NOT NULL constraint failed`，而不是外鍵的錯誤。選 `SET NULL` 就要讓那一欄允許 NULL；不允許 NULL 的外鍵只能選拒絕或 `CASCADE`。' },
        { type: 'callout', tone: 'note', title: 'NO ACTION 與 RESTRICT 的差別', text: '兩者在大多數情況都是「拒絕」。在標準 SQL 與 SQLite 裡，差別在檢查的時機：`RESTRICT` 在父列一被刪除或修改時就立刻檢查；`NO ACTION` 等到整個敘述結束才檢查（宣告為延遲檢查的外鍵則等到交易提交時），所以同一個敘述裡若也把子列處理掉了，`NO ACTION` 可以通過。初學時把兩者都當成「不准刪」即可。DB02 的預設查詢 `PRAGMA foreign_key_list(enrollments);` 列出的 `on_delete` 欄位顯示 `NO ACTION`，就是沒有指定動作時的預設值。' },
        { type: 'callout', tone: 'tip', title: '選擇外鍵動作的問題', text: '問自己：父列不在了，子列還有意義嗎？沒有意義（明細、評論、留言）用 `CASCADE`；還有意義、只是關係變成空的（評論的作者、員工的部門）用 `SET NULL`；子列是不能悄悄消失的紀錄（訂單、付款），就保留預設的拒絕，逼使用者先處理子列，或乾脆不刪除父列，改用一個狀態欄位標示「已停用」。`CASCADE` 很方便，但一個 `DELETE` 可能沿著好幾層外鍵刪掉大量資料，選它之前要確定這正是你要的。' },
      ],
    },
    {
      id: 'alter-table', title: 'ALTER TABLE：調整已經在用的表',
      blocks: [
        { type: 'p', text: '表一旦有了資料、有程式在用，就不能隨便 `DROP` 掉重建。`ALTER TABLE` 在保留資料的前提下修改綱要。SQLite 支援的 `ALTER TABLE` 只有四種：' },
        { type: 'table', head: ['敘述', '作用', 'SQLite 的限制與細節'], rows: [
          ['`ALTER TABLE products RENAME TO items;`', '表改名', '其他表外鍵裡的表名會一起改寫：`orders` 會變成參照 `items(id)`'],
          ['`ALTER TABLE customers RENAME COLUMN city TO town;`', '欄位改名（3.25.0 起）', '表定義、索引與其他表的外鍵裡用到這個欄位的地方一起改寫'],
          ['`ALTER TABLE customers ADD COLUMN phone TEXT;`', '在最後加一個欄位，既有的列填入預設值（沒有預設值就是 NULL）', '不能是 `PRIMARY KEY` 或 `UNIQUE`；表裡已經有資料時，加 `NOT NULL` 必須同時給非 NULL 的預設值；預設值不能是 `CURRENT_DATE` 這類非常數'],
          ['`ALTER TABLE customers DROP COLUMN phone;`', '刪除一個欄位（3.35.0 起）', '不能刪主鍵或 `UNIQUE` 的欄位'],
        ] },
        { type: 'example', id: 'alter-add-column' },
        { type: 'p', text: '五位既有的顧客都得到 `phone` 為 NULL、`vip` 為 0，接著用 `UPDATE` 把訂單至少 2 筆的三位顧客標成 1。少了 `DEFAULT 0` 的 `ADD COLUMN vip INTEGER NOT NULL` 會被拒絕：既有的五列沒有值可以填，會立刻違反 `NOT NULL`，SQLite 的訊息是 `Cannot add a NOT NULL column with default value NULL`。' },
        { type: 'p', text: 'SQLite 沒有的是「修改既有欄位」：不能替已經存在的欄位加上或移除約束，也不能改型別。PostgreSQL、SQL Server 可以寫 `ALTER TABLE products ADD CONSTRAINT price_ok CHECK (price >= 0);`，PostgreSQL 還有 `ALTER TABLE … ALTER COLUMN … SET NOT NULL` 等；在 SQLite 執行前者會得到 `near "CONSTRAINT": syntax error`。SQLite 的做法是重建：一、用想要的定義建立新表；二、用 `INSERT … SELECT` 把資料複製過去；三、刪除舊表；四、把新表改成舊表的名稱。' },
        { type: 'example', id: 'rebuild-table' },
        { type: 'p', text: '最後查詢系統目錄 `sqlite_schema`（DB01），`items` 的定義已經帶著 `NOT NULL` 與 `CHECK`。重建還有一個好處：舊資料若有違反新規則的列（例如某個 `qty` 是 -3），第二步的 `INSERT … SELECT` 就會被 `CHECK constraint failed` 擋下，舊表原封不動，你可以先用 `SELECT … WHERE qty < 0` 找出那些列、修正之後再重建。' },
        { type: 'callout', tone: 'warning', title: '被參照的表不能直接 DROP', text: '上例的 `items` 沒有被任何表參照。在練習場執行 `DROP TABLE products;` 會得到 `FOREIGN KEY constraint failed`：外鍵檢查開啟時，SQLite 的 `DROP TABLE` 會先刪除表裡所有的列，而 `orders` 還參照著它們。SQLite 文件為這種表提供的完整程序是先關閉外鍵檢查，在交易中完成重建，用 `PRAGMA foreign_key_check` 確認沒有違規，再開回外鍵檢查；表上原有的索引、觸發程序也要重新建立。本課不需要做到這一步。' },
        { type: 'callout', tone: 'note', title: 'DROP TABLE IF EXISTS', text: '`DROP TABLE reviews;` 在表不存在時會報錯；`DROP TABLE IF EXISTS reviews;` 則什麼都不做。練習場的預設查詢「建立評論表」就用它開頭，所以可以重複執行；同理，`CREATE TABLE IF NOT EXISTS` 在表已存在時什麼都不做，但要注意它不會檢查既有的表定義是否和你寫的一樣。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-predict-update', prompt: '在練習場的原始資料上（周邊：機械鍵盤 2490、無線滑鼠 890；其他：27 吋螢幕 6990、USB-C 集線器 1290、筆電支架 990），執行下面兩個敘述，`changes()` 回傳多少？',
      code: { language: 'SQL', text: 'UPDATE products SET price = price + 100\nWHERE category = \'周邊\' OR price < 1000;\nSELECT changes();' },
      options: ['2', '3', '4', '5'],
      answer: 1, explanation: '符合條件的是機械鍵盤（周邊）、無線滑鼠（周邊，也低於 1000）與筆電支架（990 < 1000），共 3 列。4 是把無線滑鼠算了兩次：`WHERE` 對每一列只判斷一次，同時符合兩個條件也只改一次。2 是只算了其中一個條件（周邊 2 項，或低於 1000 的 2 項）。5 是沒有 `WHERE` 時整張表的列數；27 吋螢幕與 USB-C 集線器兩個條件都不符合。',
    },
    {
      id: 'q-rejected-insert', prompt: '依照下面的定義建立 `coupons` 之後（表是空的），哪一個 `INSERT` 會被拒絕？',
      code: { language: 'SQL', text: 'CREATE TABLE coupons (\n  id INTEGER PRIMARY KEY,\n  code TEXT NOT NULL UNIQUE,\n  discount INTEGER NOT NULL CHECK (discount BETWEEN 1 AND 90),\n  min_spend INTEGER CHECK (min_spend >= 0),\n  status TEXT NOT NULL DEFAULT \'active\' CHECK (status IN (\'active\', \'expired\'))\n);' },
      options: [
        '`INSERT INTO coupons (code, discount) VALUES (\'A1\', 10);`',
        '`INSERT INTO coupons (code, discount, min_spend) VALUES (\'A2\', 10, NULL);`',
        '`INSERT INTO coupons (code, discount, status) VALUES (\'A3\', 10, NULL);`',
        '`INSERT INTO coupons (code, discount, status) VALUES (\'A4\', 90, \'expired\');`',
      ],
      answer: 2, explanation: 'A3 明確把 `status` 寫成 NULL，`DEFAULT \'active\'` 只在 `INSERT` 沒有提到這個欄位時才使用，所以 `NOT NULL` 拒絕它：`NOT NULL constraint failed: coupons.status`。A1 沒提到 `status`，得到預設值 `active`，`min_spend` 是 NULL。A2 的 `min_spend` 是 NULL，`NULL >= 0` 是未知而不是假，`CHECK` 放行，而且這一欄沒有 `NOT NULL`。A4 的 90 在 `BETWEEN 1 AND 90` 裡（兩端都包含），`expired` 也是允許的選項。',
    },
    {
      id: 'q-affinity', prompt: '在 SQLite（沒有 `STRICT`）執行下面的敘述，最後的查詢得到什麼？',
      code: { language: 'SQL', text: 'CREATE TABLE t (n INTEGER);\nINSERT INTO t VALUES (\'42\'), (\'abc\');\nSELECT n, typeof(n) FROM t;' },
      options: [
        '兩列：(42, integer) 與 (abc, text)',
        '`INSERT` 失敗：abc 不是整數',
        '兩列：(42, text) 與 (abc, text)',
        '兩列：(42, integer) 與 (0, integer)',
      ],
      answer: 0, explanation: 'SQLite 的型別親和性：`INTEGER` 欄位收到能無損轉成整數的文字 `\'42\'`，就存成整數；`\'abc\'` 轉不了，照原樣存成文字，不報錯。「INSERT 失敗」是 `STRICT` 表或 PostgreSQL 等 DBMS 的行為，不是預設的 SQLite。(42, text) 忽略了親和性會轉換能轉的值；把 `\'abc\'` 變成 0 也不是 SQLite 的做法，它不會改掉轉不了的值。',
    },
    {
      id: 'q-cascade-count', prompt: '`reviews` 的外鍵是 `product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE`，表裡有 4 則評論，其中 3 則是筆電支架（商品 5）的，筆電支架沒有任何訂單。執行下面的敘述後，`changes()` 回傳多少？`reviews` 還剩幾列？',
      code: { language: 'SQL', text: 'DELETE FROM products WHERE id = 5;\nSELECT changes();' },
      options: [
        '執行失敗：還有評論參照筆電支架',
        '`changes()` 是 4，`reviews` 剩 1 列',
        '`changes()` 是 1，`reviews` 仍有 4 列',
        '`changes()` 是 1，`reviews` 剩 1 列',
      ],
      answer: 3, explanation: '`ON DELETE CASCADE` 讓三則評論隨著商品一起刪除，所以 `reviews` 剩 1 列；但 `changes()` 只計算敘述本身直接刪除的列（1 項商品），外鍵動作連帶刪除的列不算，所以是 1。「執行失敗」是沒有指定動作（預設 `NO ACTION`）時才會發生的事；4 是把連帶刪除也算進去，那是 `total_changes()` 的增加量與練習場「已修改 N 列」的算法；「仍有 4 列」則是忘了 `CASCADE` 會真的刪掉子列。',
    },
    {
      id: 'q-fk-design', prompt: '訂單明細 `order_items.order_id` 參照 `orders.id`，`orders.customer_id` 參照 `customers.id`。公司規定：刪除（取消）一筆訂單時，它的明細一起刪除；還有訂單的顧客不能被刪除。哪一組外鍵動作符合規定？',
      options: [
        '`order_items.order_id` 設 `ON DELETE CASCADE`；`orders.customer_id` 不指定動作',
        '`order_items.order_id` 設 `ON DELETE SET NULL`；`orders.customer_id` 設 `ON DELETE CASCADE`',
        '兩個外鍵都設 `ON DELETE CASCADE`',
        '`order_items.order_id` 不指定動作；`orders.customer_id` 設 `ON DELETE SET NULL`',
      ],
      answer: 0, explanation: '明細離開訂單沒有意義，用 `CASCADE`；「有訂單的顧客不能刪」正是不指定動作時的預設 `NO ACTION`（或寫明 `RESTRICT`）：刪除會被拒絕。兩個都 `CASCADE` 會讓刪除一位顧客時，他的訂單和明細全部被連帶刪除，違反第二條規定。明細設 `SET NULL` 會留下不屬於任何訂單的明細；顧客設 `CASCADE` 或 `SET NULL` 都允許刪除有訂單的顧客。最後一組的明細不指定動作，刪除有明細的訂單會被拒絕，違反第一條規定。',
    },
    {
      id: 'q-alter-sqlite', prompt: '`items` 表已經有資料，沒有其他表參照它。在 SQLite 裡要讓既有的欄位 `qty` 從此不能是負數，應該怎麼做？',
      options: [
        '`ALTER TABLE items ADD CONSTRAINT qty_ok CHECK (qty >= 0);`',
        '`ALTER TABLE items ADD COLUMN qty INTEGER CHECK (qty >= 0);`',
        '建立帶有 `CHECK (qty >= 0)` 的新表，用 `INSERT … SELECT` 複製資料，刪除舊表，再把新表改名為 `items`',
        '`UPDATE items SET qty = 0 WHERE qty < 0;`',
      ],
      answer: 2, explanation: 'SQLite 的 `ALTER TABLE` 只能改表名、改欄位名、加欄位、刪欄位，不能替既有欄位加約束，所以要重建表。`ADD CONSTRAINT` 在 SQLite 是語法錯誤（PostgreSQL、SQL Server 可以這樣寫）。`ADD COLUMN qty` 是新增一個同名欄位，得到 `duplicate column name: qty`。`UPDATE` 只修正了現在的資料，沒有寫下規則，下一個 `INSERT` 照樣可以存入負數。',
    },
    {
      id: 'q-partial-run', prompt: '在練習場一次執行下面三個敘述，第三個敘述報錯後，再執行 `SELECT COUNT(*) FROM tags;`，得到什麼？',
      code: { language: 'SQL', text: 'CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);\nINSERT INTO tags (name) VALUES (\'新品\'), (\'特價\');\nINSERT INTO tags (name) VALUES (\'熱銷\'), (\'特價\'), (\'限量\');' },
      options: [
        '執行失敗：整批被復原，`tags` 表不存在',
        '2',
        '3',
        '4',
      ],
      answer: 1, explanation: '第三個敘述的「特價」違反 `UNIQUE`，整個敘述失敗，它的三列一列都沒有新增，連排在前面的「熱銷」也沒有：一個敘述是全有或全無。但前兩個敘述在錯誤之前已經生效，練習場不會整批復原，所以表存在、有「新品」「特價」2 列。3 是以為「熱銷」在出錯之前已經存下；4 是以為只有重複的那一列被略過；「整批復原」要在交易裡執行才會發生。',
    },
  ],
  sql: {
    dataset: 'shop',
    presets: [
      { label: '查看綱要：orders 的定義與外鍵', sql: sql`SELECT sql FROM sqlite_schema WHERE name = 'orders';
PRAGMA foreign_key_list(orders);` },
      { label: '建立評論表 reviews（可重複執行）', sql: sql`DROP TABLE IF EXISTS reviews;
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  UNIQUE (product_id, customer_id)
);
INSERT INTO reviews (product_id, customer_id, rating, body) VALUES
  (1, 1, 5, '手感很好'),
  (2, 3, 4, NULL),
  (3, 2, 5, '色彩漂亮');
SELECT * FROM reviews;` },
      { label: '先數再改：UPDATE 影響幾列', sql: sql`SELECT COUNT(*) AS will_change FROM products WHERE category = '周邊';
UPDATE products SET price = price + 100 WHERE category = '周邊';
SELECT changes() AS changed;
SELECT id, name, category, price FROM products ORDER BY id;` },
      { label: 'ON DELETE CASCADE 與 changes()', sql: sql`DROP TABLE IF EXISTS reviews;
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  UNIQUE (product_id, customer_id)
);
INSERT INTO reviews (product_id, customer_id, rating)
  SELECT p.id, c.id, 4 FROM products p CROSS JOIN customers c WHERE c.city = '台北';
DELETE FROM products WHERE id NOT IN (SELECT product_id FROM orders);
SELECT changes() AS deleted_products, (SELECT COUNT(*) FROM reviews) AS reviews_left;` },
      { label: '型別親和性：typeof()', sql: sql`DROP TABLE IF EXISTS readings;
CREATE TABLE readings (n INTEGER, label TEXT, code VARCHAR(3));
INSERT INTO readings VALUES ('42', 7, 'ABCDEFG'), ('abc', 'x', 'OK'), (3.0, 'y', 'Z');
SELECT n, typeof(n), label, typeof(label), code FROM readings;` },
    ],
    examples: [
      {
        id: 'type-affinity', title: '型別親和性：宣告的型別只是偏好', dataset: 'empty',
        description: '空白資料庫。SQLite 預設不強制型別：能無損轉換的值就轉換，轉不了的照原樣存下；`typeof()` 顯示每個值實際的儲存類別。',
        sql: sql`CREATE TABLE readings (
  n INTEGER,
  label TEXT,
  code VARCHAR(3)
);
INSERT INTO readings VALUES ('42', 7, 'ABCDEFG'), ('abc', 'x', 'OK');
SELECT n, typeof(n), label, typeof(label), code FROM readings;`,
        result: { columns: ['n', 'typeof(n)', 'label', 'typeof(label)', 'code'], rows: [
          [42, 'integer', '7', 'text', 'ABCDEFG'],
          ['abc', 'text', 'x', 'text', 'OK'],
        ] },
      },
      {
        id: 'create-reviews', title: '建立有主鍵與外鍵的評論表', dataset: 'shop',
        description: '`reviews` 參照既有的 products 與 customers。`id INTEGER PRIMARY KEY` 在新增時沒有給值，SQLite 自動編號；最後用 JOIN 把編號換回名稱。',
        sql: sql`CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER NOT NULL,
  body TEXT
);
INSERT INTO reviews (product_id, customer_id, rating, body) VALUES
  (1, 1, 5, '手感很好'),
  (2, 3, 4, NULL);
SELECT r.id, p.name AS product, c.name AS customer, r.rating, r.body
FROM reviews r
JOIN products p ON r.product_id = p.id
JOIN customers c ON r.customer_id = c.id
ORDER BY r.id;`,
        result: { columns: ['id', 'product', 'customer', 'rating', 'body'], rows: [
          [1, '機械鍵盤', '陳美玲', 5, '手感很好'],
          [2, '無線滑鼠', '王雅雯', 4, null],
        ] },
      },
      {
        id: 'coupon-constraints', title: '四種約束與預設值', dataset: 'empty',
        description: '空白資料庫。`code` 必填且不重複，`discount` 必填且在 1 到 90 之間，`min_spend` 可為 NULL 但不能是負數，`status` 不填時是 active。三張合法的優惠券都被接受。',
        sql: sql`CREATE TABLE coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount INTEGER NOT NULL CHECK (discount BETWEEN 1 AND 90),
  min_spend INTEGER CHECK (min_spend >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired'))
);
INSERT INTO coupons (code, discount) VALUES ('WELCOME10', 10);
INSERT INTO coupons (code, discount, min_spend, status) VALUES ('BIG30', 30, 3000, 'expired');
INSERT INTO coupons (code, discount, min_spend) VALUES ('FREE5', 5, NULL);
SELECT id, code, discount, min_spend, status FROM coupons ORDER BY id;`,
        result: { columns: ['id', 'code', 'discount', 'min_spend', 'status'], rows: [
          [1, 'WELCOME10', 10, null, 'active'],
          [2, 'BIG30', 30, 3000, 'expired'],
          [3, 'FREE5', 5, null, 'active'],
        ] },
      },
      {
        id: 'insert-select', title: 'INSERT … SELECT：調價前先存下舊價格', dataset: 'shop',
        description: '把查詢結果整批新增到價格紀錄表，`changed_on` 用預設值；接著才調價。最後合併兩張表，對照舊價格與新價格。',
        sql: sql`CREATE TABLE price_history (
  product_id INTEGER NOT NULL REFERENCES products(id),
  old_price INTEGER NOT NULL,
  changed_on TEXT NOT NULL DEFAULT '2026-10-01'
);
INSERT INTO price_history (product_id, old_price)
  SELECT id, price FROM products WHERE category = '周邊';
UPDATE products SET price = price - 100 WHERE category = '周邊';
SELECT p.name, h.old_price, p.price AS new_price, h.changed_on
FROM price_history h
JOIN products p ON h.product_id = p.id
ORDER BY p.id;`,
        result: { columns: ['name', 'old_price', 'new_price', 'changed_on'], rows: [
          ['機械鍵盤', 2490, 2390, '2026-10-01'],
          ['無線滑鼠', 890, 790, '2026-10-01'],
        ] },
      },
      {
        id: 'update-changes', title: 'UPDATE 與 changes()：改了幾列', dataset: 'shop',
        description: '低於 1000 元的商品加價 100 元。`changes()` 回傳剛才的 UPDATE 改動的列數，放在查詢裡的每一列都是同一個值。',
        sql: sql`UPDATE products SET price = price + 100 WHERE price < 1000;
SELECT changes() AS updated, id, name, price FROM products ORDER BY id;`,
        result: { columns: ['updated', 'id', 'name', 'price'], rows: [
          [2, 1, '機械鍵盤', 2490],
          [2, 2, '無線滑鼠', 990],
          [2, 3, '27 吋螢幕', 6990],
          [2, 4, 'USB-C 集線器', 1290],
          [2, 5, '筆電支架', 1090],
        ] },
      },
      {
        id: 'fk-cascade-set-null', title: 'ON DELETE CASCADE 與 ON DELETE SET NULL', dataset: 'shop',
        description: '刪除商品時連帶刪除它的評論；刪除顧客時保留評論，評論者改成 NULL。筆電支架與李淑芬都沒有訂單，所以可以刪除。',
        sql: sql`CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT
);
INSERT INTO reviews (product_id, customer_id, rating) VALUES
  (5, 1, 4), (5, 3, 5), (1, 5, 3), (2, 5, 4), (1, 2, 5);
DELETE FROM products WHERE id = 5;
DELETE FROM customers WHERE id = 5;
SELECT id, product_id, customer_id, rating FROM reviews ORDER BY id;`,
        result: { columns: ['id', 'product_id', 'customer_id', 'rating'], rows: [
          [3, 1, null, 3],
          [4, 2, null, 4],
          [5, 1, 2, 5],
        ] },
      },
      {
        id: 'cascade-changes', title: 'changes() 不計外鍵動作連帶刪除的列', dataset: 'shop',
        description: '三則評論中有兩則是筆電支架的。刪除筆電支架後，`changes()` 是 1，但評論只剩 1 則：另外兩則是 CASCADE 刪掉的。',
        sql: sql`CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT
);
INSERT INTO reviews (product_id, customer_id, rating) VALUES (5, 1, 4), (5, 3, 5), (1, 2, 5);
DELETE FROM products WHERE id = 5;
SELECT changes() AS deleted, (SELECT COUNT(*) FROM reviews) AS reviews_left;`,
        result: { columns: ['deleted', 'reviews_left'], rows: [[1, 1]] },
      },
      {
        id: 'alter-add-column', title: 'ALTER TABLE ADD COLUMN：替既有的表加欄位', dataset: 'shop',
        description: '`phone` 沒有預設值，既有的列都是 NULL；`vip` 是 NOT NULL，必須給預設值 0。再用 UPDATE 把訂單至少 2 筆的顧客標成 1。',
        sql: sql`ALTER TABLE customers ADD COLUMN phone TEXT;
ALTER TABLE customers ADD COLUMN vip INTEGER NOT NULL DEFAULT 0;
UPDATE customers SET vip = 1
WHERE id IN (SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(*) >= 2);
SELECT id, name, phone, vip FROM customers ORDER BY id;`,
        result: { columns: ['id', 'name', 'phone', 'vip'], rows: [
          [1, '陳美玲', null, 1],
          [2, '林建宏', null, 1],
          [3, '王雅雯', null, 1],
          [4, '張志明', null, 0],
          [5, '李淑芬', null, 0],
        ] },
      },
      {
        id: 'rebuild-table', title: '重建表：替既有欄位加上約束（SQLite）', dataset: 'empty',
        description: '空白資料庫。`items` 原本沒有任何約束。建立新定義的表、複製資料、刪除舊表、改名，最後從 sqlite_schema 看到新的定義。',
        sql: sql`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER);
INSERT INTO items (name, qty) VALUES ('螺絲', 40), ('螺帽', 25);
CREATE TABLE items_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty >= 0)
);
INSERT INTO items_new (id, name, qty) SELECT id, name, qty FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
SELECT sql FROM sqlite_schema WHERE name = 'items';`,
        result: { columns: ['sql'], rows: [
          ['CREATE TABLE "items" (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  qty INTEGER NOT NULL CHECK (qty >= 0)\n)'],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-members', title: '建立有約束的會員表',
        statement: '在空白資料庫建立會員表 `members`，欄位依序為：`id`（整數主鍵，新增時不給值就自動編號）；`email`（文字，必填，不能和其他會員重複）；`name`（文字，必填）；`points`（整數點數，必填，沒有給值時是 0，不能是負數）；`level`（文字等級，必填，沒有給值時是 `\'basic\'`，只能是 `\'basic\'`、`\'silver\'`、`\'gold\'` 其中之一）。檢查時會在你的表上新增合法與不合法的會員，比對哪些被接受、哪些被拒絕，再列出表的內容。',
        dataset: 'empty', hidden: ['empty'], ordered: true, columnNames: true,
        starter: sql`CREATE TABLE members (
  id ...,
  email ...,
  name ...,
  points ...,
  level ...
);`,
        hints: [
          '主鍵寫成 `id INTEGER PRIMARY KEY`。只有型別剛好是 `INTEGER` 才是 SQLite 的自動編號；寫成 `INT PRIMARY KEY`，不給值的列 `id` 會是 NULL。',
          '「必填」是 `NOT NULL`，「不能重複」是 `UNIQUE`，「沒有給值時是 0」是 `DEFAULT 0`，「不能是負數」是 `CHECK (points >= 0)`，「只能是其中之一」是 `CHECK (level IN (…))`。同一個欄位可以接好幾個約束。',
          '`DEFAULT` 只在 `INSERT` 沒有提到這個欄位時使用；有人明確寫入 NULL 時，只有 `NOT NULL` 擋得住，`CHECK` 遇到 NULL 會放行。',
        ],
        solution: sql`CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  level TEXT NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'silver', 'gold'))
);`,
        alternatives: [
          sql`CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'basic',
  CONSTRAINT email_unique UNIQUE (email),
  CONSTRAINT points_not_negative CHECK (points >= 0),
  CONSTRAINT level_allowed CHECK (level = 'basic' OR level = 'silver' OR level = 'gold')
);`,
          sql`CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  level TEXT NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'silver', 'gold'))
) STRICT;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  level TEXT NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'silver', 'gold'))
);`, why: '`email` 少了 `UNIQUE`：第二位會員用同一個 email 註冊也會被接受，檢查「重複的 email」應該被拒絕卻通過了。`NOT NULL` 只保證有值，不保證不重複。' },
          { sql: sql`CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  level TEXT DEFAULT 'basic' CHECK (level IN ('basic', 'silver', 'gold'))
);`, why: '`level` 有預設值但少了 `NOT NULL`：沒提到 `level` 時確實是 basic，可是明確寫入 NULL 時，`DEFAULT` 不起作用，`CHECK` 遇到 NULL 又放行，於是存進一位沒有等級的會員。' },
          { sql: sql`CREATE TABLE members (
  id INT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  level TEXT NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'silver', 'gold'))
);`, why: '`INT PRIMARY KEY` 不是 SQLite 的 rowid 別名，不會自動編號；新增會員時沒有給 `id`，SQLite 又允許這種主鍵存 NULL，結果每位會員的 `id` 都是 NULL。要寫成剛好 `INTEGER PRIMARY KEY`。' },
        ],
        probes: [
          { label: '新增一位只填 email 與姓名的會員（應被接受）', sql: sql`INSERT INTO members (email, name) VALUES ('an@example.com', '小安');` },
          { label: '新增一位指定點數與等級的會員（應被接受）', sql: sql`INSERT INTO members (email, name, points, level) VALUES ('zhe@example.com', '阿哲', 120, 'gold');` },
          { label: '重複的 email（應被拒絕）', sql: sql`INSERT INTO members (email, name) VALUES ('an@example.com', '另一個小安');` },
          { label: '負的點數（應被拒絕）', sql: sql`INSERT INTO members (email, name, points) VALUES ('yu@example.com', '小宇', -5);` },
          { label: '列出會員', sql: sql`SELECT id, email, name, points, level FROM members ORDER BY id;` },
          { label: '不允許的等級', sql: sql`INSERT INTO members (email, name, level) VALUES ('mei@example.com', '小美', 'vip');`, hidden: true },
          { label: '沒有 email', sql: sql`INSERT INTO members (email, name) VALUES (NULL, '無名');`, hidden: true },
          { label: '沒有姓名', sql: sql`INSERT INTO members (email) VALUES ('noname@example.com');`, hidden: true },
          { label: '點數明確寫成 NULL', sql: sql`INSERT INTO members (email, name, points, level) VALUES ('ling@example.com', '小玲', NULL, 'silver');`, hidden: true },
          { label: '等級明確寫成 NULL', sql: sql`INSERT INTO members (email, name, level) VALUES ('wen@example.com', '小文', NULL);`, hidden: true },
          { label: '點數剛好是 0', sql: sql`INSERT INTO members (email, name, points, level) VALUES ('kai@example.com', '小凱', 0, 'silver');`, hidden: true },
          { label: '再列出會員', sql: sql`SELECT id, email, name, points, level FROM members ORDER BY id;`, hidden: true },
        ],
      },
      {
        id: 'ex-price-cleanup', title: '調整價格並刪除從未售出的商品',
        statement: '在 `shop` 資料上完成兩件事：一、所有「配件」類商品的單價 `price` 各加 50 元，其他商品的價格不變；二、刪除從來沒有被訂購過的商品（`orders` 裡沒有任何一筆訂單的 `product_id` 是它）。訂單與顧客都不能改動。檢查時會列出 `products` 的所有商品，並確認 `orders`、`customers` 的列數沒有改變。',
        dataset: 'shop', hidden: ['shop-b'], ordered: true, columnNames: true,
        starter: sql`UPDATE products SET ... WHERE ...;
DELETE FROM products WHERE ...;`,
        hints: [
          '`UPDATE products SET price = price + 50 WHERE category = \'配件\';`：沒有 `WHERE` 會讓每一項商品都漲價。',
          '「從來沒有被訂購過」就是商品編號不在 `orders.product_id` 裡：`WHERE id NOT IN (SELECT product_id FROM orders)`。要比對的是訂單裡的商品編號 `product_id`，不是訂單編號 `id`。',
          '想先確認會刪掉哪些列，把 `DELETE FROM products` 換成 `SELECT * FROM products`、條件不變，在練習場執行一次。',
        ],
        solution: sql`UPDATE products SET price = price + 50 WHERE category = '配件';
DELETE FROM products WHERE id NOT IN (SELECT product_id FROM orders);`,
        alternatives: [
          sql`DELETE FROM products
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = products.id);
UPDATE products SET price = price + 50 WHERE category = '配件';`,
          sql`UPDATE products SET price = price + 50 WHERE category = '配件';
DELETE FROM products
WHERE id IN (
  SELECT p.id
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.id
  WHERE o.id IS NULL
);`,
          sql`UPDATE products SET price = price + 50 WHERE category = '配件';
DELETE FROM products
WHERE id IN (SELECT id FROM products EXCEPT SELECT product_id FROM orders);`,
        ],
        mistakes: [
          { sql: sql`UPDATE products SET price = price + 50;
DELETE FROM products WHERE id NOT IN (SELECT product_id FROM orders);`, why: '`UPDATE` 少了 `WHERE`：每一項商品都加了 50 元，不只是配件。執行前先用 `SELECT COUNT(*) FROM products WHERE category = \'配件\'` 預測影響列數，就會發現數字不對。' },
          { sql: sql`UPDATE products SET price = price + 50 WHERE category = '配件';
DELETE FROM products WHERE id NOT IN (SELECT id FROM orders);`, why: '子查詢取的是訂單編號 `orders.id`，不是商品編號 `orders.product_id`：拿商品編號去和訂單編號比，毫無意義。在練習場資料上商品 1 到 5 剛好都是某個訂單編號，一項也沒刪；在另一組資料上則可能想刪掉還有訂單的商品而被外鍵拒絕。' },
          { sql: sql`UPDATE products SET price = 50 WHERE category = '配件';
DELETE FROM products WHERE id NOT IN (SELECT product_id FROM orders);`, why: '`SET price = 50` 把價格改成 50 元，而不是加 50 元；要用原本的值計算，寫成 `price = price + 50`。' },
        ],
        probes: [
          { label: '列出所有商品', sql: sql`SELECT id, name, category, price FROM products ORDER BY id;` },
          { label: '訂單數', sql: sql`SELECT COUNT(*) FROM orders;`, hidden: true },
          { label: '顧客數', sql: sql`SELECT COUNT(*) FROM customers;`, hidden: true },
        ],
      },
      {
        id: 'ex-comment-actions', title: '外鍵動作：文章、留言與使用者',
        statement: '在空白資料庫建立三張表。起始程式已經寫好 `users`（`id` 整數主鍵、`name` 文字必填）與 `posts`（`id` 整數主鍵、`title` 文字必填）。請完成 `comments`，欄位依序為：`id`（整數主鍵）；`post_id`（必填，參照 `posts(id)`）；`user_id`（可為 NULL，參照 `users(id)`）；`body`（文字，必填）。規則：刪除一篇文章時，它的留言一起刪除；刪除一位使用者時，他的留言保留，但 `user_id` 變成 NULL。檢查時會新增使用者、文章與留言，刪除一篇文章與一位使用者，再列出剩下的留言。',
        dataset: 'empty', hidden: ['empty'], ordered: true, columnNames: true,
        starter: sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id ...,
  user_id ...,
  body TEXT NOT NULL
);`,
        hints: [
          '外鍵後面接動作：`post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE …`、`user_id INTEGER REFERENCES users(id) ON DELETE …`。',
          '留言跟著文章消失是 `CASCADE`；留言留下、作者變成 NULL 是 `SET NULL`。沒寫動作就是預設的 `NO ACTION`，刪除會被拒絕。',
          '設定 `SET NULL` 的欄位不能是 `NOT NULL`，否則刪除使用者時會因為 `NOT NULL constraint failed` 被拒絕。',
        ],
        solution: sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL
);`,
        alternatives: [
          sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER,
  body TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);`,
          sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL) STRICT;
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL CONSTRAINT comment_post REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER CONSTRAINT comment_user REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL
) STRICT;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL
);`, why: '兩個動作對調了：刪除文章時 SQLite 要把 `post_id` 改成 NULL，違反 `NOT NULL`，刪除被拒絕；就算刪得掉，刪除使用者也會用 `CASCADE` 把他的留言全部刪光，而規則要的是保留。' },
          { sql: sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL
);`, why: '`user_id` 既是 `NOT NULL` 又設定 `ON DELETE SET NULL`：建表不會報錯，但刪除一位有留言的使用者時，要把留言的 `user_id` 改成 NULL 而違反 `NOT NULL`，整個刪除被拒絕。' },
          { sql: sql`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL
);`, why: '`post_id` 少了 `NOT NULL`：外鍵允許 NULL，NULL 表示「沒有參照」，所以一則不屬於任何文章的留言也存得進去。題目要求每則留言都必填文章。' },
        ],
        probes: [
          { label: '新增兩位使用者', sql: sql`INSERT INTO users (id, name) VALUES (1, '小安'), (2, '阿哲');` },
          { label: '新增兩篇文章', sql: sql`INSERT INTO posts (id, title) VALUES (10, '第一篇'), (11, '第二篇');` },
          { label: '新增三則留言', sql: sql`INSERT INTO comments (id, post_id, user_id, body) VALUES (100, 10, 1, '推'), (101, 10, 2, '同意'), (102, 11, 1, '好文');` },
          { label: '刪除文章 10', sql: sql`DELETE FROM posts WHERE id = 10;` },
          { label: '刪除使用者 1', sql: sql`DELETE FROM users WHERE id = 1;` },
          { label: '列出剩下的留言', sql: sql`SELECT id, post_id, user_id, body FROM comments ORDER BY id;` },
          { label: '留言指向不存在的文章', sql: sql`INSERT INTO comments (id, post_id, user_id, body) VALUES (103, 99, 2, '迷路的留言');`, hidden: true },
          { label: '留言沒有文章', sql: sql`INSERT INTO comments (id, post_id, user_id, body) VALUES (104, NULL, 2, '沒有文章');`, hidden: true },
          { label: '留言指向不存在的使用者', sql: sql`INSERT INTO comments (id, post_id, user_id, body) VALUES (105, 11, 7, '不存在的人');`, hidden: true },
          { label: '匿名留言', sql: sql`INSERT INTO comments (id, post_id, user_id, body) VALUES (106, 11, NULL, '匿名');`, hidden: true },
          { label: '刪除使用者 2', sql: sql`DELETE FROM users WHERE id = 2;`, hidden: true },
          { label: '再列出留言', sql: sql`SELECT id, post_id, user_id, body FROM comments ORDER BY id;`, hidden: true },
          { label: '刪除文章 11', sql: sql`DELETE FROM posts WHERE id = 11;`, hidden: true },
          { label: '留言數', sql: sql`SELECT COUNT(*) FROM comments;`, hidden: true },
        ],
      },
    ],
  },
};
