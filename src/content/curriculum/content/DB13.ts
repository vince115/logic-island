import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB13 Views, Stored Procedures, and Triggers. SQL lesson (Phase F.1c): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB13: LessonContent = {
  lessonId: 'DB13',
  motivation: '到目前為止，資料庫只替你保管資料表，所有的查詢與規則都寫在程式或練習場的編輯器裡。可是同一份「各部門人數與薪資總額」報表，可能有五支程式各寫一遍 `JOIN` 加 `GROUP BY`，改規則時漏改一支就出現兩種數字；「每次調薪都要留下紀錄」這種規則，只要有一支程式忘了寫紀錄，稽核就有了破洞。本課介紹幾種存放在資料庫裡、和資料表並列在綱要中的物件。檢視表（view）把一個查詢取名字存起來，讓大家共用同一個定義，也只露出該露出的欄位（例如員工通訊錄不放薪水）；需要更快的讀取時，具體化檢視表把結果存下來，代價是要更新。預存程序與函式是存在資料庫裡、帶參數的程式；SQLite 沒有這個功能，你會看懂其他 DBMS 的寫法，並知道 SQLite 的應用程式改用什麼做法。觸發器（trigger）在資料被新增、修改或刪除時自動執行，能寫稽核紀錄、維護統計表、擋下違反規則的修改，不管修改來自哪一支程式。最後你會用檢視表與觸發器做出一個自動記錄異動的報表，並說清楚它的維護代價：看不見的邏輯、變慢的寫入、改綱要時要一起照顧的物件，以及哪些邏輯其實應該留在應用程式裡。',
  sections: [
    {
      id: 'schema-objects', title: '把查詢與規則存進資料庫',
      blocks: [
        { type: 'p', text: 'DB01 說過，綱要描述資料庫裡有什麼。除了資料表，綱要還可以存放「程式」：一段有名字的查詢、一段帶參數的程序、一段在資料改變時自動執行的動作。它們和資料表一樣用 DDL 建立與刪除，也一樣列在 SQLite 的系統目錄 `sqlite_schema` 裡（`type` 欄位是 `view` 或 `trigger`）。本課的四種物件：' },
        { type: 'table', head: ['物件', '是什麼', '怎麼執行', 'SQLite'], rows: [
          ['檢視表（`VIEW`）', '存起來的 `SELECT`，不存資料列', '在查詢裡當成一張表使用，每次都重新執行', '支援，但只能讀'],
          ['具體化檢視表（materialized view）', '存起來的 `SELECT` 加上它的結果', '讀取存好的結果；資料改變後要更新（refresh）', '沒有；用一張表加上更新敘述或觸發器模擬'],
          ['預存程序與函式（stored procedure、function）', '有名字、帶參數的程式，存在資料庫裡', '由應用程式呼叫，例如 `CALL 程序(…)`、`SELECT 函式(…)`', '沒有；改用應用程式的程式碼，或宿主程式註冊的函式'],
          ['觸發器（`TRIGGER`）', '綁在某張表某一種修改上的一組敘述', '資料被新增、修改或刪除時自動執行', '支援'],
        ] },
        { type: 'p', text: '本課的練習場是公司人事資料 `company`（DB06 用過）：`departments` 有 4 個部門，法務部沒有員工；`employees` 有 12 位員工，記著部門、直屬主管與月薪。月薪是敏感資料，正好用來練習「只讓人看到該看的欄位」與「每次調薪都留下紀錄」。' },
        { type: 'callout', tone: 'tip', title: '重跑範例前先重設', text: '練習場的修改會一直留著，直到按「重設資料」。檢視表、觸發器和表一樣不能重複建立：第二次執行同一個 `CREATE VIEW` 會得到 `view dept_summary already exists`，`CREATE TRIGGER` 則是 `trigger … already exists`。重跑範例之前先重設，或在前面加上 `DROP VIEW IF EXISTS 名稱;`、`DROP TRIGGER IF EXISTS 名稱;`。練習場的預設查詢都這樣開頭，可以重複執行。' },
      ],
    },
    {
      id: 'views', title: '檢視表：替查詢取一個名字',
      blocks: [
        { type: 'p', text: '`CREATE VIEW 名稱 AS SELECT …;` 建立檢視表。資料庫只存下這段 `SELECT` 的文字，不存任何資料列；之後在查詢裡寫 `FROM 名稱`，就像把那段 `SELECT` 當成 `FROM` 裡的子查詢（DB06）重新執行一次。下面把 DB05、DB04 的「部門合併員工、分組統計」包成檢視表 `dept_summary`，再像查一張表那樣篩選、排序它：' },
        { type: 'example', id: 'view-dept-summary' },
        { type: 'p', text: '寫報表的人不必再記得要用 `LEFT JOIN`（法務部沒有員工也要列出）、要數 `COUNT(e.id)` 而不是 `COUNT(*)`、要用 `COALESCE` 把沒有員工的薪資總額變成 0：這些細節都封裝在檢視表的定義裡，寫一次、大家共用。哪天「薪資總額」的算法改了，只要改這一個定義，所有用到它的查詢一起改變。' },
        { type: 'p', text: '檢視表的第二個用途是限制看得到的欄位與資料列。員工通訊錄需要姓名、部門與到職日，但不該附上月薪：' },
        { type: 'example', id: 'view-limit-columns' },
        { type: 'p', text: '`staff_public` 只有 `id`、`name`、`dept`、`hired_on` 四欄，`SELECT salary FROM staff_public;` 會得到 `no such column: salary`。檢視表的欄位名稱來自 `SELECT` 的欄位與別名，也可以在名稱後面列出：`CREATE VIEW staff_public (id, name, dept, hired_on) AS …`；`PRAGMA table_info(staff_public);` 像查表一樣列出檢視表的欄位。' },
        { type: 'callout', tone: 'note', title: '隱藏欄位不等於權限控管（SQLite）', text: '在有使用者帳號的 DBMS（PostgreSQL、MySQL、SQL Server 等）裡，可以只把檢視表的查詢權限給一般使用者，例如 `GRANT SELECT ON staff_public TO …`，而不給 `employees` 本身的權限，這樣他們真的看不到月薪；權限管理會在之後的資料庫安全課程介紹。SQLite 的資料庫就是一個檔案，沒有使用者帳號，也沒有 `GRANT`：能開啟檔案的程式就能讀每一張表。在 SQLite 裡，檢視表只是方便與一致，誰能看什麼要由應用程式把關。' },
        { type: 'p', text: '檢視表是活的：它存的是查詢，不是結果。對照 DB10 用過的 `CREATE TABLE … AS SELECT …`，後者在建立的那一刻把結果複製成一張新表，之後就和原本的表無關了：' },
        { type: 'example', id: 'view-vs-snapshot' },
        { type: 'p', text: '新增一位業務部員工之後，檢視表 `headcount_view` 重新計算，業務部變成 5 人；複製出來的 `headcount_copy` 還停在建立時的 4 人。需要「隨時正確」用檢視表；需要「某個時間點的快照」（例如月底結算）才用複製的表。' },
      ],
    },
    {
      id: 'view-rules', title: '檢視表的規則：唯讀、修改定義與相依',
      blocks: [
        { type: 'p', text: '在 SQLite 裡，檢視表只能讀。對它執行 `INSERT`、`UPDATE` 或 `DELETE` 都會被拒絕，除非替它寫了 `INSTEAD OF` 觸發器（第 7 節）。在標準 SQL 與 PostgreSQL、MySQL 裡，「簡單」的檢視表（只來自一張表、沒有 `GROUP BY`、`DISTINCT`、彙總函式等）可以直接修改，修改會落到底下的表；它們還支援 `WITH CHECK OPTION`，拒絕「改完之後就不在檢視表裡」的列。SQLite 不支援 `WITH CHECK OPTION`，寫了會得到語法錯誤。先執行上一節的 `staff_public` 範例，再逐一試下表的敘述：' },
        { type: 'table', head: ['敘述', 'SQLite 的結果', '說明'], rows: [
          ['`UPDATE staff_public SET name = \'王俊杰\' WHERE id = 3;`', '`cannot modify staff_public because it is a view`', '檢視表唯讀；要改姓名就改 `employees`'],
          ['`INSERT INTO staff_public (name) VALUES (\'新人\');`', '同樣被拒絕', '檢視表沒有自己的資料列可以新增'],
          ['`CREATE VIEW staff_public AS SELECT id, name FROM employees;`', '`view staff_public already exists`', 'SQLite 沒有 `ALTER VIEW`，也沒有 PostgreSQL、MySQL 的 `CREATE OR REPLACE VIEW`（會得到 `near "OR": syntax error`）：要改定義就先 `DROP VIEW` 再重新 `CREATE VIEW`'],
          ['`DROP VIEW staff_public;`', '成功', '只刪除定義，`employees` 的資料完全不受影響'],
          ['`DROP VIEW IF EXISTS staff_public;`', '成功，即使它已經不存在', '和 `DROP TABLE IF EXISTS` 一樣'],
          ['`ALTER TABLE employees DROP COLUMN hired_on;`（`staff_public` 還在時）', '`error in view staff_public after drop column: no such column: e.hired_on`', '檢視表用到這個欄位，SQLite 拒絕刪除，保護了檢視表'],
        ] },
        { type: 'callout', tone: 'warning', title: '底下的表被刪除，檢視表還在', text: '在 SQLite 裡建立 `CREATE TABLE x (a INTEGER); CREATE VIEW xv AS SELECT a FROM x;` 再 `DROP TABLE x;`，刪除會成功，`xv` 也仍然列在 `sqlite_schema` 裡，直到有人查詢它才得到 `no such table: main.x`。PostgreSQL 則拒絕刪除還有檢視表依賴的表，除非寫 `DROP TABLE x CASCADE` 連同檢視表一起刪。檢視表把查詢和表綁在一起，改表的結構時要一併檢查哪些檢視表用到它。' },
        { type: 'callout', tone: 'note', title: '檢視表不會讓查詢變快', text: '檢視表每次被查詢時都重新執行它的 `SELECT`（DB10 也提過），該掃描、該合併的資料一樣要處理，慢的查詢包成檢視表還是一樣慢。它省下的是「寫」查詢的工夫與出錯的機會，不是「執行」的時間。要讓讀取變快，靠的是索引（「索引與 B+ 樹」一課的主題）或把結果存下來，也就是下一節的具體化檢視表。' },
      ],
    },
    {
      id: 'materialized', title: '具體化檢視表：把結果存下來',
      blocks: [
        { type: 'p', text: '有些報表算起來很貴、讀的次數又遠多於資料改變的次數，例如每分鐘被開好幾百次的部門統計首頁。具體化檢視表（materialized view，也譯作實體化檢視表）把查詢的結果實際存下來，讀取時直接拿存好的列，不必重算。代價和 DB10 的反正規化一樣：底下的資料改變後，存下的結果就過時了，必須更新。' },
        { type: 'callout', tone: 'note', title: 'PostgreSQL 的具體化檢視表（這段在練習場無法執行）', text: 'PostgreSQL 的寫法是 `CREATE MATERIALIZED VIEW dept_stats AS SELECT …;` 建立並存下結果，之後執行 `REFRESH MATERIALIZED VIEW dept_stats;` 重新計算；兩次更新之間讀到的都是上次的結果。其他 DBMS 也各有名稱與更新方式，例如 SQL Server 的索引檢視表（indexed view）會在資料改變時自動維護。' },
        { type: 'p', text: 'SQLite 沒有具體化檢視表，`CREATE MATERIALIZED VIEW` 會得到 `near "MATERIALIZED": syntax error`，要用一張普通的表模擬：建表一次，之後每次「更新」就清空它、再用 `INSERT … SELECT`（DB07）把查詢結果整批放回去。下面建立統計表 `dept_stats` 之後，行政部每人加薪 5000，再用檢查查詢比對存下的值與實際的值：' },
        { type: 'example', id: 'refresh-summary' },
        { type: 'p', text: '行政部存的薪資總額還是 251000，實際已經是 266000（3 人各加 5000）。再執行一次範例裡的兩個更新敘述，存下的值就會追上實際的值：' },
        { type: 'table', head: ['步驟', 'SQLite 的寫法', '相當於 PostgreSQL 的'], rows: [
          ['建立', '`CREATE TABLE dept_stats (…);`', '`CREATE MATERIALIZED VIEW` 的建立部分'],
          ['清空舊結果', '`DELETE FROM dept_stats;`', '`REFRESH MATERIALIZED VIEW dept_stats;`'],
          ['放入新結果', '`INSERT INTO dept_stats SELECT …;`', '（同上，一個敘述完成）'],
        ] },
        { type: 'p', text: '更新要多久做一次，取決於報表能容忍多舊的資料：每晚由排程執行一次，報表上註明「資料截至昨晚」；或者在每次寫入時就同步更新，這要靠第 6 節的觸發器。三種做法的比較：' },
        { type: 'table', head: ['做法', '讀取', '資料多新', '代價'], rows: [
          ['檢視表', '每次重新計算，最慢', '永遠是最新的', '讀取成本'],
          ['表＋定期更新（SQLite 模擬，或 PostgreSQL 的具體化檢視表）', '讀存好的列，快', '停在上次更新的時刻', '更新時要重算整份結果；兩次更新之間可能過時'],
          ['表＋觸發器同步維護', '讀存好的列，快', '每次寫入後就更新', '每次寫入都多做工作；觸發器必須涵蓋每一種會影響結果的修改'],
        ] },
      ],
    },
    {
      id: 'procedures', title: '預存程序與函式：帶參數的資料庫程式',
      blocks: [
        { type: 'p', text: '預存程序（stored procedure）是存在資料庫裡、有名字、帶參數的程式，就像 F13 的函式：定義一次，之後用不同的引數呼叫。它的本體可以有好幾個 SQL 敘述，也可以有變數、`IF` 判斷、迴圈與自訂錯誤。多數 DBMS 區分兩種：函式（function）回傳一個值，可以寫在 `SELECT` 裡；程序（procedure）用 `CALL`（PostgreSQL 11 起、MySQL）或 `EXEC`（SQL Server）呼叫，通常用來執行一連串修改。' },
        { type: 'callout', tone: 'warning', title: '這段在練習場無法執行', text: 'SQLite 沒有預存程序，也不能用 SQL 定義函式：`CREATE PROCEDURE` 會得到 `near "PROCEDURE": syntax error`，`CREATE FUNCTION` 是 `near "FUNCTION": syntax error`。本節的 PostgreSQL 與 MySQL 寫法只用來閱讀，不要貼到練習場。' },
        { type: 'p', text: '下面是 PostgreSQL 的 PL/pgSQL（PostgreSQL 的程序語言）函式 `give_raise`：替一位員工加薪，金額不是正數就報錯，最後回傳新的月薪。整段依序由下表各列組成（這段在練習場無法執行）：' },
        { type: 'table', head: ['部分', 'PostgreSQL（PL/pgSQL）寫法', '作用'], rows: [
          ['宣告', '`CREATE FUNCTION give_raise(p_emp INTEGER, p_amount INTEGER) RETURNS INTEGER LANGUAGE plpgsql AS $$`', '名稱、兩個參數與它們的型別、回傳型別；`$$` 到 `$$` 之間是本體'],
          ['區域變數', '`DECLARE new_salary INTEGER;`', '本體裡用的變數'],
          ['開始', '`BEGIN`', '本體的敘述從這裡開始'],
          ['檢查參數', '`IF p_amount <= 0 THEN RAISE EXCEPTION \'調薪金額必須大於 0\'; END IF;`', '不合理的呼叫直接報錯，什麼都不改'],
          ['修改並取回結果', '`UPDATE employees SET salary = salary + p_amount WHERE id = p_emp RETURNING salary INTO new_salary;`', '`RETURNING … INTO` 把改完的值放進變數'],
          ['回傳', '`RETURN new_salary;`', '函式的結果'],
          ['結束', '`END; $$;`', '本體與整個定義結束'],
          ['呼叫', '`SELECT give_raise(3, 2000);`', '替員工 3 加薪 2000，得到新的月薪'],
        ] },
        { type: 'p', text: '參數取名為 `p_emp`、`p_amount`，加上 `p_` 前綴是為了不和欄位名稱相同：PL/pgSQL 裡參數和欄位同名時，PostgreSQL 預設會回報名稱有歧義。同一件事在各家 DBMS 的語法差異很大（比較下面 MySQL 的寫法），這也是預存程序的成本之一：換資料庫時要整段重寫。' },
        { type: 'callout', tone: 'note', title: 'MySQL 的預存程序（這段在練習場無法執行）', text: 'MySQL 的程序寫成 `CREATE PROCEDURE give_raise(IN p_emp INT, IN p_amount INT) BEGIN UPDATE employees SET salary = salary + p_amount WHERE id = p_emp; END`，用 `CALL give_raise(3, 2000);` 呼叫；參數前的 `IN` 表示輸入，另有 `OUT`、`INOUT` 把值傳回呼叫者。在 MySQL 的命令列用戶端裡，因為本體含有分號，定義前要先用 `DELIMITER` 換掉敘述的結束符號。' },
        { type: 'p', text: '用戶端與伺服器分開的 DBMS 用預存程序，主要是為了：一次呼叫在伺服器上完成好幾個步驟，省下網路往返；每支程式呼叫同一份邏輯；可以只授權執行程序，不授權直接修改表。SQLite 不是伺服器，它是一個函式庫，直接在你的程式裡執行，沒有網路往返可省。SQLite 的應用程式改用這些做法：' },
        { type: 'list', items: [
          '在應用程式裡寫一個函式，執行帶參數的 SQL：例如 Python 的 `conn.execute(\'UPDATE employees SET salary = salary + ? WHERE id = ?\', (2000, 3))`。`?` 是參數的佔位符號，值由程式另外綁定（binding），不是接成 SQL 字串，所以名字裡有引號也不會改變敘述的意思。參數化查詢與 SQL injection 會在之後串接程式與資料庫安全的課程詳細介紹。',
          '由宿主程式註冊自訂函式（user-defined function）：C 的 `sqlite3_create_function()`、Python 的 `conn.create_function(\'fmt_money\', 1, 函式)`，註冊後在這個連線的 SQL 裡就能寫 `SELECT fmt_money(salary) FROM employees`。函式的本體是宿主語言的程式碼，不存在資料庫檔案裡，換一支程式開啟同一個檔案就沒有這個函式；練習場沒有註冊任何自訂函式。',
          '資料庫這一側需要的自動行為，交給 SQLite 有的檢視表（前面幾節）與觸發器（下一節）。',
        ] },
        { type: 'callout', tone: 'note', title: '練習場裡的 ?', text: '在練習場執行 `UPDATE employees SET salary = salary + ? WHERE id = ?;` 不會報錯，但沒有程式替 `?` 綁定值，沒綁定的參數在 SQLite 裡一律是 NULL：`WHERE id = NULL` 不會成立（DB03），所以改了 0 列。`?` 是給應用程式用的。' },
      ],
    },
    {
      id: 'triggers', title: '觸發器：資料改變時自動執行',
      blocks: [
        { type: 'p', text: '觸發器把一組敘述綁在某張表的某一種修改上，那種修改一發生就自動執行，不管修改來自哪一支程式、哪一個人。SQLite 的寫法：' },
        { type: 'list', items: [
          '`CREATE TRIGGER 名稱 時機 事件 ON 表`：時機是 `BEFORE`（修改之前）、`AFTER`（修改之後）或 `INSTEAD OF`（取代修改，只能用在檢視表）；事件是 `INSERT`、`DELETE`、`UPDATE` 其中一種，`UPDATE OF 欄位, …` 只在 `SET` 裡出現這些欄位時才觸發。一個觸發器只對應一種事件，要同時處理新增與刪除就建兩個。',
          '`FOR EACH ROW`：每一列被修改時執行一次。SQLite 只支援這一種，所以可以省略；標準 SQL 與 PostgreSQL 另有 `FOR EACH STATEMENT`，整個敘述只執行一次，SQLite 沒有。',
          '`WHEN 條件`：可省略；條件為真時才執行這一列的動作。和 `WHERE` 一樣，條件是 NULL（未知）就不執行。',
          '`BEGIN 敘述; 敘述; … END;`：本體，可以放 `INSERT`、`UPDATE`、`DELETE`、`SELECT`，每個敘述以分號結尾。',
        ] },
        { type: 'p', text: '本體與 `WHEN` 用 `NEW` 和 `OLD` 取得正在被修改的那一列：' },
        { type: 'table', head: ['事件', '`OLD`', '`NEW`'], rows: [
          ['`INSERT`', '沒有', '即將新增或剛新增的列'],
          ['`UPDATE`', '修改前的列', '修改後的列'],
          ['`DELETE`', '即將刪除或剛刪除的列', '沒有'],
        ] },
        { type: 'p', text: '用錯了不會在建立時發現：在 `AFTER INSERT` 觸發器裡寫 `OLD.id`，`CREATE TRIGGER` 照樣成功，等到第一次新增資料時，那個 `INSERT` 才因為 `no such column: OLD.id` 整個失敗。最常見的用途是稽核紀錄（audit log）：記下哪一列在什麼時候、從什麼值改成什麼值。SQLite 沒有使用者帳號，「是誰改的」要由應用程式另外寫入。下面記錄員工調動部門：' },
        { type: 'example', id: 'audit-transfer' },
        { type: 'p', text: '`UPDATE` 改了李冠宇、黃淑芬、蔡佩君三列，但蔡佩君本來就在業務部（部門 2），`WHEN NEW.dept_id <> OLD.dept_id` 不成立，沒有留下紀錄。`changes()` 是 3：它只計算敘述本身直接改動的列，觸發器寫入的列不算在內（和 DB07 的外鍵動作一樣）。練習場的「已修改 N 列」用的是 `total_changes()` 的增加量，會包含觸發器寫入的兩筆紀錄，所以單獨執行這個 `UPDATE` 時顯示「已修改 5 列」。' },
        { type: 'callout', tone: 'tip', title: 'UPDATE OF 只看 SET，不看值有沒有變', text: '`UPDATE employees SET dept_id = dept_id;` 每一列都會觸發 `AFTER UPDATE OF dept_id`，即使沒有任何值改變；`UPDATE employees SET name = …` 則完全不會觸發它。所以稽核「真的改變」要加 `WHEN NEW.dept_id <> OLD.dept_id`。欄位允許 NULL 時改用 `IS NOT`（`WHEN NEW.x IS NOT OLD.x`），否則從 NULL 改成有值時 `<>` 的結果是 NULL，紀錄就漏了。' },
        { type: 'callout', tone: 'note', title: '時間戳記與結果', text: '`logged_at` 的預設值 `CURRENT_TIMESTAMP` 在 SQLite 裡是 UTC 時間的文字 `YYYY-MM-DD HH:MM:SS`。每次執行的時間都不同，所以範例的查詢沒有列出它；在練習場執行 `SELECT * FROM transfer_log;` 就看得到。稽核表通常也不對員工設外鍵：員工日後被刪除時，他的歷史紀錄仍應保留。' },
        { type: 'p', text: '觸發器的另一個常見用途是維護第 4 節的統計表，讓它在每次寫入後就是最新的。人數會因為新增、刪除、調動部門三種修改而改變，三種都要有觸發器：' },
        { type: 'example', id: 'trigger-stats' },
        { type: 'p', text: '新增一人到法務部、刪除許文彬、把鄭美玲調到法務部之後，存下的人數 `stored` 和即時算出的 `actual` 完全一致。少寫任何一個觸發器（例如忘了調動部門），統計表就會悄悄地和實際資料分家；最後那段比對 `stored` 與 `actual` 的查詢，正是 DB10 建議定期執行的檢查查詢。' },
        { type: 'callout', tone: 'note', title: '觸發器不會遞迴觸發自己（SQLite 預設）', text: '觸發器本體裡的修改也會觸發其他觸發器。但 SQLite 預設關閉遞迴觸發（`PRAGMA recursive_triggers;` 回傳 0）：觸發器執行中所做的修改，不會再次觸發這個正在執行的觸發器。例如一個 `AFTER UPDATE ON employees` 觸發器在本體裡又 `UPDATE employees`，在預設設定下只執行一層；執行 `PRAGMA recursive_triggers = ON;` 之後它會一再觸發自己，最後得到 `too many levels of trigger recursion`。' },
      ],
    },
    {
      id: 'trigger-rules', title: '用觸發器守規則：RAISE 與 INSTEAD OF',
      blocks: [
        { type: 'p', text: 'DB07 的 `CHECK` 只看得到「這一列修改後的值」：它不能比較修改前後（`OLD` 與 `NEW`），在 SQLite 裡也不能用子查詢去看別的列或別的表。「新進員工的月薪不能高於他的直屬主管」牽涉另一列，就要用觸發器：在 `BEFORE` 觸發器裡發現違規，用 `RAISE(ABORT, 訊息)` 拒絕。' },
        { type: 'example', id: 'guard-manager-salary' },
        { type: 'p', text: '月薪 60000 不高於吳承翰的 85000，新增成功。執行範例之後，在練習場逐一試下表的敘述：' },
        { type: 'table', head: ['敘述', '結果', '原因'], rows: [
          ['`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on) VALUES (\'高薪新人\', 2, 7, 90000, \'2026-11-02\');`', '被拒絕：`薪水不能高於直屬主管`', '90000 > 85000，`WHEN` 成立，`RAISE(ABORT, …)` 拒絕這個敘述'],
          ['同上，月薪改成 85000', '成功', '條件是「高於」，相等不違規'],
          ['同上，`manager_id` 改成 NULL、月薪 900000', '成功', '子查詢找不到主管，結果是 NULL；`900000 > NULL` 是未知，`WHEN` 不成立，觸發器不動作，和 DB07 的 `CHECK` 遇到 NULL 放行一樣'],
          ['同上，`manager_id` 改成 99', '被拒絕：`FOREIGN KEY constraint failed`', '觸發器同樣因為 NULL 沒有動作；擋下它的是外鍵'],
          ['`UPDATE employees SET salary = 99000 WHERE id = 8;`', '成功', '觸發器只管 `INSERT`；替蔡佩君加薪到超過主管，要再寫一個 `BEFORE UPDATE OF salary, manager_id` 觸發器，主管自己減薪也要檢查'],
        ] },
        { type: 'p', text: '表的最後一列說明了規則寫成觸發器的難處：一條規則可能被好幾種修改破壞，每一種都要有觸發器把關。`RAISE` 只能寫在觸發器裡（在外面執行會得到 `RAISE() may only be used within a trigger-program`），有四種：' },
        { type: 'table', head: ['寫法', '效果（SQLite）', '適合'], rows: [
          ['`RAISE(ABORT, 訊息)`', '報錯；這個敘述已經改的列全部復原，之前已完成的敘述不受影響', '拒絕不合規則的修改，最常用'],
          ['`RAISE(FAIL, 訊息)`', '報錯；但這個敘述在出錯之前已經改的列保留下來', '很少用：一個 `UPDATE` 可能只做了一半'],
          ['`RAISE(ROLLBACK, 訊息)`', '報錯，並復原整個交易', '交易（DB14）中出錯時要全部放棄'],
          ['`RAISE(IGNORE)`', '不報錯；放棄這一列的修改（用在 `BEFORE` 觸發器時），繼續處理下一列', '刻意靜靜略過某些列；但呼叫者不會知道有列被略過'],
        ] },
        { type: 'p', text: '例如讓業務部四人一起調薪，其中周怡君被改成較低的值、其他三人加薪：減薪的觸發器用 `ABORT` 時整個 `UPDATE` 失敗、四人的月薪都不變；用 `FAIL` 時前三人的加薪留了下來；用 `IGNORE` 時沒有錯誤，只有周怡君那一列沒改，`changes()` 是 3。' },
        { type: 'p', text: '`INSTEAD OF` 觸發器只能建在檢視表上（建在表上會得到 `cannot create INSTEAD OF trigger on table`；反過來，檢視表上不能建 `BEFORE`、`AFTER` 觸發器）。它取代對檢視表的修改，由你決定要改哪些底下的表，讓唯讀的檢視表變得可以修改：' },
        { type: 'example', id: 'instead-of-view' },
        { type: 'p', text: '透過檢視表改姓名成功了，實際被改的是 `employees`。`changes()` 是 0：SQLite 不把 `INSTEAD OF` 觸發器裡的修改算進 `changes()`，練習場則顯示「已修改 1 列」。這個觸發器只處理 `UPDATE OF name`：`UPDATE staff_public SET dept = \'業務部\' WHERE id = 3;` 仍然得到 `cannot modify staff_public because it is a view`，`DELETE` 也一樣；`DROP VIEW` 會連同它的 `INSTEAD OF` 觸發器一起刪除。' },
      ],
    },
    {
      id: 'logic-placement', title: '自動記錄異動的報表，與它的代價',
      blocks: [
        { type: 'p', text: '把本課的零件組起來：一張稽核表、一個寫紀錄的觸發器，再加一個把編號換成名稱的檢視表，就是一個「自動記錄異動的報表」。之後不論哪一支程式調動員工，報表都會出現新的一列，寫報表的人只要 `SELECT * FROM transfer_report`：' },
        { type: 'example', id: 'transfer-report' },
        { type: 'p', text: '鄭美玲調到法務部，接著她的部屬許文彬也跟著調過去，黃淑芬調到業務部，三筆紀錄依序出現。檢視表用 `LEFT JOIN employees`：員工日後被刪除，紀錄還在，`name` 變成 NULL 而不是整列消失。紀錄只存編號，所以部門改名後，報表顯示的是新名稱；如果報表必須呈現「當時」的名稱，就要在紀錄裡另存一份名稱，這是 DB10 說的刻意反正規化。' },
        { type: 'p', text: '這個功能的維護代價，要在決定採用之前說清楚：' },
        { type: 'list', items: [
          '看不見：讀應用程式碼的人只看到 `UPDATE employees SET dept_id = …`，不知道它還會寫入 `transfer_log`。除錯時「多出來的資料」或「莫名的錯誤」可能來自觸發器，要記得查 `SELECT name, sql FROM sqlite_schema WHERE type = \'trigger\';`。',
          '寫入變慢：每一列的修改都多做一次 `INSERT`；一次調動上萬人的批次作業，觸發器也要執行上萬次。',
          '改綱要要一起改：SQLite 的 `RENAME COLUMN` 會改寫觸發器與檢視表裡用到的欄位名稱，但有些修改不會被擋下。實測在 SQLite 裡 `ALTER TABLE transfer_log DROP COLUMN to_dept;` 會成功（觸發器建在 `employees` 上），之後每一次調動部門都因為 `table transfer_log has no column named to_dept` 失敗；`DROP TABLE transfer_log;` 也會成功，之後調動得到 `no such table: main.transfer_log`。一個看似無關的清理，讓正常的業務操作全部失敗。',
          '觸發器只管它綁定的修改：統計表的例子要三個觸發器，漏了一個就悄悄出錯，所以要準備檢查查詢定期比對。',
          '可攜性：檢視表的語法各家大致相同；觸發器與預存程序的語法差異很大，換 DBMS 時要重寫。',
        ] },
        { type: 'p', text: '那麼商業邏輯該放在資料庫，還是應用程式？兩邊的取捨：' },
        { type: 'table', head: ['考量', '放在資料庫（約束、觸發器、預存程序）', '放在應用程式'], rows: [
          ['保證的範圍', '每一個寫入都經過，包括其他程式、批次匯入與手動修正', '只有經過這段程式碼的寫入'],
          ['看得見與除錯', '藏在綱要裡，讀程式碼看不到', '和其他程式碼放在一起，容易閱讀、追蹤'],
          ['測試與版本管理', '要在資料庫裡測；綱要的變更要另外管理（資料庫遷移）', '用一般的單元測試與版本控制'],
          ['可攜性', '觸發器、預存程序的語法依 DBMS 而不同', '換資料庫時改動較少'],
          ['外部動作', '不適合：寄信、呼叫其他服務不該發生在資料庫裡', '適合：例如在修改成功之後寄出通知'],
        ] },
        { type: 'list', ordered: true, items: [
          '資料本身的正確性（不論誰寫入都必須成立）放在資料庫：能用 `NOT NULL`、`UNIQUE`、`CHECK`、外鍵表達的先用約束，約束表達不了的（比較修改前後、跨列、跨表）才用觸發器。',
          '稽核紀錄適合觸發器：它不能依賴每一支程式都記得寫。',
          '流程、會常常改的規則、需要呼叫外部服務的動作，放在應用程式。',
          '讀取端的共用查詢與欄位限制用檢視表；需要快照或加速時，才把結果存成表並決定更新方式。',
        ] },
        { type: 'callout', tone: 'warning', title: '同一條規則不要寫兩份', text: '如果「不能減薪」同時寫在應用程式與觸發器裡，日後改規則時很容易只改了一邊，兩邊的判斷就不一致。決定由哪一邊負責，另一邊頂多做「提早給使用者友善訊息」的檢查，並在文件寫清楚以哪一邊為準。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-view-live', prompt: '在 `company` 的原始資料上（業務部 4 人），依序執行下面的敘述，最後的查詢得到什麼？',
      code: { language: 'SQL', text: 'CREATE VIEW sales_count AS\n  SELECT COUNT(*) AS n FROM employees WHERE dept_id = 2;\nCREATE TABLE sales_copy AS\n  SELECT COUNT(*) AS n FROM employees WHERE dept_id = 2;\nINSERT INTO employees (name, dept_id, manager_id, salary, hired_on)\nVALUES (\'孫立德\', 2, 7, 50000, \'2026-11-02\');\nSELECT (SELECT n FROM sales_count) AS from_view,\n  (SELECT n FROM sales_copy) AS from_copy;' },
      options: ['from_view 是 4，from_copy 是 4', 'from_view 是 5，from_copy 是 4', 'from_view 是 5，from_copy 是 5', 'from_view 是 4，from_copy 是 5'],
      answer: 1, explanation: '檢視表只存查詢，每次被查詢都重新計算，所以看得到新增的孫立德，是 5。`CREATE TABLE … AS SELECT` 在建立時把結果複製成一張新表，之後不再和 `employees` 連動，仍是 4。兩個都是 4，是把檢視表當成建立當下的快照；兩個都是 5，是以為複製的表也會跟著更新；檢視表 4、複製表 5 則把兩者的性質完全弄反了。',
    },
    {
      id: 'q-update-of-count', prompt: '`salary_log` 原本是空的，觸發器沒有 `WHEN`。在 `company` 的原始資料上（行政部有 3 位員工）依序執行三個 `UPDATE` 之後，`salary_log` 有幾列？',
      code: { language: 'SQL', text: 'CREATE TRIGGER log_salary\nAFTER UPDATE OF salary ON employees\nFOR EACH ROW\nBEGIN\n  INSERT INTO salary_log (emp_id, old_salary, new_salary)\n  VALUES (OLD.id, OLD.salary, NEW.salary);\nEND;\nUPDATE employees SET salary = salary + 1000 WHERE id = 3;\nUPDATE employees SET salary = salary WHERE dept_id = 3;\nUPDATE employees SET name = \'王俊杰\' WHERE id = 3;' },
      options: ['1', '2', '4', '5'],
      answer: 2, explanation: '`UPDATE OF salary` 只看 `SET` 裡有沒有 `salary`，不看值有沒有變。第一個敘述改 1 列，留 1 筆；第二個敘述的 `SET salary = salary` 改了行政部 3 列，值雖然沒變，仍然逐列觸發，留 3 筆；第三個只改 `name`，不觸發。共 4 列。1 是以為值沒變就不會觸發（那需要 `WHEN NEW.salary <> OLD.salary`）；2 是把觸發器當成每個敘述執行一次，但它是 `FOR EACH ROW`；5 是以為改姓名也會觸發。',
    },
    {
      id: 'q-raise-ignore', prompt: '業務部有 4 位員工（編號 7、8、9、12）。建立下面的觸發器後執行 `UPDATE`，結果是什麼？',
      code: { language: 'SQL', text: 'CREATE TRIGGER no_pay_cut\nBEFORE UPDATE OF salary ON employees\nFOR EACH ROW\nWHEN NEW.salary < OLD.salary\nBEGIN\n  SELECT RAISE(IGNORE);\nEND;\nUPDATE employees\nSET salary = CASE WHEN id = 12 THEN 1 ELSE salary + 5 END\nWHERE dept_id = 2;\nSELECT changes();' },
      options: [
        '`UPDATE` 失敗，4 人的月薪都不變',
        '沒有錯誤，`changes()` 是 3：只有周怡君（12）的月薪沒改',
        '沒有錯誤，`changes()` 是 4：4 人都照 `SET` 修改',
        '`UPDATE` 失敗，但前 3 人的加薪保留下來',
      ],
      answer: 1, explanation: '`RAISE(IGNORE)` 不報錯，只放棄觸發它的那一列（周怡君被改成 1 是減薪），其他 3 列照常修改，`changes()` 是 3。「失敗且都不變」是 `RAISE(ABORT, …)` 的行為；「失敗但保留前 3 人」是 `RAISE(FAIL, …)`；4 人都修改則是忽略了觸發器，`WHEN` 對周怡君那一列是成立的。',
    },
    {
      id: 'q-when-null', prompt: '`employees` 上有下面的觸發器（外鍵檢查開啟，吳承翰是員工 7，月薪 85000；沒有員工 99）。哪一個 `INSERT` 會成功？',
      code: { language: 'SQL', text: 'CREATE TRIGGER salary_under_manager\nBEFORE INSERT ON employees\nFOR EACH ROW\nWHEN NEW.salary > (SELECT salary FROM employees WHERE id = NEW.manager_id)\nBEGIN\n  SELECT RAISE(ABORT, \'薪水不能高於直屬主管\');\nEND;' },
      options: [
        '`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on) VALUES (\'甲\', 2, 7, 90000, \'2026-11-02\');`',
        '`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on) VALUES (\'乙\', 2, 99, 50000, \'2026-11-02\');`',
        '`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on) VALUES (\'丙\', 3, NULL, 900000, \'2026-11-02\');`',
        '`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on) VALUES (\'丁\', 2, 7, 85001, \'2026-11-02\');`',
      ],
      answer: 2, explanation: '丙沒有主管，子查詢找不到列，結果是 NULL；`900000 > NULL` 是未知，`WHEN` 不成立，觸發器不動作，外鍵欄位是 NULL 也不必配對，所以成功。甲（90000）與丁（85001）都高於 85000，被觸發器以「薪水不能高於直屬主管」拒絕。乙的子查詢同樣是 NULL，觸發器不動作，但沒有員工 99，外鍵拒絕它：`FOREIGN KEY constraint failed`。',
    },
    {
      id: 'q-dropped-log', prompt: '`employees` 上有觸發器 `log_transfer`：`AFTER UPDATE OF dept_id` 時 `INSERT INTO transfer_log …`。有人清理資料庫時執行了 `DROP TABLE transfer_log;`。接著執行下面的敘述，會發生什麼事（SQLite）？',
      code: { language: 'SQL', text: 'UPDATE employees SET dept_id = 2 WHERE id = 6;' },
      options: [
        '`UPDATE` 成功，觸發器找不到表就略過',
        '`UPDATE` 成功：`DROP TABLE` 已經連同觸發器一起刪除',
        '不會走到這一步：還有觸發器用到 `transfer_log`，`DROP TABLE` 被拒絕',
        '`UPDATE` 失敗，得到 `no such table: main.transfer_log`，黃淑芬的部門不變',
      ],
      answer: 3, explanation: 'SQLite 刪除表時只會一起刪掉「建在這張表上」的觸發器；`log_transfer` 建在 `employees` 上，所以留了下來，`DROP TABLE transfer_log` 也不會因為它被拒絕。之後觸發器執行到 `INSERT INTO transfer_log` 時出錯，觸發它的 `UPDATE` 整個失敗。觸發器不會「略過」錯誤，這正是觸發器看不見、改綱要時要一起檢查的維護代價。',
    },
    {
      id: 'q-procedure-sqlite', prompt: '一個團隊把系統從 PostgreSQL 搬到 SQLite。原本的 PL/pgSQL 函式 `give_raise(p_emp, p_amount)` 先檢查金額、再加薪並回傳新月薪。在 SQLite 上最合適的做法是？',
      options: [
        '在應用程式寫一個 `give_raise` 函式：先檢查金額，再執行 `UPDATE employees SET salary = salary + ? WHERE id = ?` 並綁定參數，最後查回新月薪',
        '把同一段 `CREATE FUNCTION … LANGUAGE plpgsql` 在 SQLite 執行一次，之後照樣 `SELECT give_raise(3, 2000);`',
        '建立 `CREATE VIEW give_raise (p_emp, p_amount) AS …`，用 `SELECT * FROM give_raise WHERE p_emp = 3` 傳入參數',
        '建立 `AFTER UPDATE` 觸發器 `give_raise`，再用 `CALL give_raise(3, 2000);` 呼叫它',
      ],
      answer: 0, explanation: 'SQLite 沒有預存程序，也不能用 SQL 定義函式，`CREATE FUNCTION` 是語法錯誤；它在應用程式的行程裡執行，把邏輯寫成應用程式的函式並用 `?` 綁定參數，就是 SQLite 的對應做法。檢視表名稱後的括號是欄位名稱清單，不是參數，檢視表沒有參數。觸發器只會在資料被修改時自動執行，不能被呼叫，SQLite 也沒有 `CALL`。',
    },
    {
      id: 'q-logic-placement', prompt: '人事系統有三條需求：(1) 月薪不能是負數；(2) 每一次調薪都必須留下紀錄，不論是哪一支程式或哪一次手動修正改的；(3) 調薪成功後寄 email 通知員工。哪一種安排最好？',
      options: [
        '三條都寫成觸發器，資料庫最可靠',
        '三條都寫在應用程式，資料庫只負責存資料',
        '(1) 用觸發器；(2) 由每一支程式各自寫入稽核表；(3) 用觸發器寄出',
        '(1) 用 `CHECK (salary >= 0)`；(2) 用 `AFTER UPDATE` 觸發器寫稽核表；(3) 由應用程式在修改成功之後寄出',
      ],
      answer: 3, explanation: '(1) 只看這一列的值，`CHECK` 就能表達，約束比觸發器簡單也更明確。(2) 要求「不論誰改」都留紀錄，只有放在資料庫才擋得住其他程式與手動修正，而且要比較修改前後，所以用觸發器。(3) 是外部動作，不該發生在資料庫裡，而且應該在修改確定成功之後才做。全部用觸發器會讓寄信也藏進資料庫；全部放應用程式則保證不了 (2)；讓每支程式各自寫稽核表，正是漏寫的來源。',
    },
  ],
  sql: {
    dataset: 'company',
    presets: [
      { label: '列出資料表、檢視表與觸發器', sql: sql`SELECT type, name, tbl_name FROM sqlite_schema ORDER BY type, name;` },
      { label: '部門摘要檢視表（可重複執行）', sql: sql`DROP VIEW IF EXISTS dept_summary;
CREATE VIEW dept_summary AS
SELECT d.id, d.name AS dept, d.location,
  COUNT(e.id) AS headcount,
  COALESCE(SUM(e.salary), 0) AS payroll
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id, d.name, d.location;
SELECT * FROM dept_summary ORDER BY id;` },
      { label: '重新整理統計表並比對（模擬具體化檢視表）', sql: sql`CREATE TABLE IF NOT EXISTS dept_stats (
  dept_id INTEGER PRIMARY KEY,
  headcount INTEGER NOT NULL,
  payroll INTEGER NOT NULL
);
DELETE FROM dept_stats;
INSERT INTO dept_stats
SELECT d.id, COUNT(e.id), COALESCE(SUM(e.salary), 0)
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id;
SELECT s.dept_id, s.payroll AS stored,
  (SELECT COALESCE(SUM(salary), 0) FROM employees e WHERE e.dept_id = s.dept_id) AS actual
FROM dept_stats s
ORDER BY s.dept_id;` },
      { label: '調動稽核：觸發器與報表（可重複執行）', sql: sql`DROP VIEW IF EXISTS transfer_report;
DROP TRIGGER IF EXISTS log_transfer;
DROP TABLE IF EXISTS transfer_log;
CREATE TABLE transfer_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  from_dept INTEGER NOT NULL,
  to_dept INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER log_transfer
AFTER UPDATE OF dept_id ON employees
FOR EACH ROW
WHEN NEW.dept_id <> OLD.dept_id
BEGIN
  INSERT INTO transfer_log (emp_id, from_dept, to_dept)
  VALUES (OLD.id, OLD.dept_id, NEW.dept_id);
END;
CREATE VIEW transfer_report AS
SELECT l.id, e.name, f.name AS from_dept, t.name AS to_dept, l.logged_at
FROM transfer_log l
LEFT JOIN employees e ON e.id = l.emp_id
JOIN departments f ON f.id = l.from_dept
JOIN departments t ON t.id = l.to_dept;
UPDATE employees SET dept_id = CASE dept_id WHEN 1 THEN 2 ELSE 1 END WHERE id = 6;
SELECT * FROM transfer_report ORDER BY id;` },
      { label: '觸發器擋下高於主管的月薪（可重複執行）', sql: sql`DROP TRIGGER IF EXISTS salary_under_manager;
CREATE TRIGGER salary_under_manager
BEFORE INSERT ON employees
FOR EACH ROW
WHEN NEW.salary > (SELECT salary FROM employees WHERE id = NEW.manager_id)
BEGIN
  SELECT RAISE(ABORT, '薪水不能高於直屬主管');
END;
SELECT name, sql FROM sqlite_schema WHERE type = 'trigger';` },
    ],
    examples: [
      {
        id: 'view-dept-summary', title: '把常用的統計查詢包成檢視表', dataset: 'company',
        description: '`dept_summary` 封裝了部門合併員工、分組統計的查詢。之後查它就像查一張表：這裡只取位在台北的部門，依薪資總額由高到低排列。',
        sql: sql`CREATE VIEW dept_summary AS
SELECT d.id, d.name AS dept, d.location,
  COUNT(e.id) AS headcount,
  COALESCE(SUM(e.salary), 0) AS payroll
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id, d.name, d.location;
SELECT dept, headcount, payroll
FROM dept_summary
WHERE location = '台北'
ORDER BY payroll DESC;`,
        result: { columns: ['dept', 'headcount', 'payroll'], rows: [
          ['研發部', 5, 365000],
          ['行政部', 3, 251000],
        ] },
      },
      {
        id: 'view-limit-columns', title: '用檢視表隱藏月薪', dataset: 'company',
        description: '`staff_public` 只露出編號、姓名、部門名稱與到職日，沒有月薪與主管。這裡列出 2023 年以後到職的員工。',
        sql: sql`CREATE VIEW staff_public AS
SELECT e.id, e.name, d.name AS dept, e.hired_on
FROM employees e
JOIN departments d ON d.id = e.dept_id;
SELECT name, dept, hired_on
FROM staff_public
WHERE hired_on >= '2023-01-01'
ORDER BY hired_on;`,
        result: { columns: ['name', 'dept', 'hired_on'], rows: [
          ['劉建宏', '業務部', '2023-10-02'],
          ['黃淑芬', '研發部', '2024-01-08'],
          ['周怡君', '業務部', '2024-06-03'],
          ['許文彬', '行政部', '2025-02-17'],
        ] },
      },
      {
        id: 'view-vs-snapshot', title: '檢視表是活的，複製的表是快照', dataset: 'company',
        description: '同一個查詢，一份存成檢視表，一份用 `CREATE TABLE … AS` 複製成表。新增一位業務部員工後，只有檢視表看得到。',
        sql: sql`CREATE VIEW headcount_view AS
SELECT dept_id, COUNT(*) AS n FROM employees GROUP BY dept_id;
CREATE TABLE headcount_copy AS
SELECT dept_id, COUNT(*) AS n FROM employees GROUP BY dept_id;
INSERT INTO employees (name, dept_id, manager_id, salary, hired_on)
VALUES ('孫立德', 2, 7, 50000, '2026-11-02');
SELECT v.dept_id, v.n AS view_n, c.n AS copy_n
FROM headcount_view v
JOIN headcount_copy c ON c.dept_id = v.dept_id
ORDER BY v.dept_id;`,
        result: { columns: ['dept_id', 'view_n', 'copy_n'], rows: [
          [1, 5, 5],
          [2, 5, 4],
          [3, 3, 3],
        ] },
      },
      {
        id: 'refresh-summary', title: '用表模擬具體化檢視表，以及它怎麼過時', dataset: 'company',
        description: '建立統計表 `dept_stats` 並用 DELETE 加 INSERT … SELECT 填入結果（一次「更新」）。之後行政部加薪，統計表沒有跟著變；最後的檢查查詢比對存下的值與實際的值。',
        sql: sql`CREATE TABLE dept_stats (
  dept_id INTEGER PRIMARY KEY,
  headcount INTEGER NOT NULL,
  payroll INTEGER NOT NULL
);
DELETE FROM dept_stats;
INSERT INTO dept_stats
SELECT d.id, COUNT(e.id), COALESCE(SUM(e.salary), 0)
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id;
UPDATE employees SET salary = salary + 5000 WHERE dept_id = 3;
SELECT s.dept_id, s.payroll AS stored,
  (SELECT COALESCE(SUM(salary), 0) FROM employees e WHERE e.dept_id = s.dept_id) AS actual
FROM dept_stats s
ORDER BY s.dept_id;`,
        result: { columns: ['dept_id', 'stored', 'actual'], rows: [
          [1, 365000, 365000],
          [2, 259000, 259000],
          [3, 251000, 266000],
          [4, 0, 0],
        ] },
      },
      {
        id: 'audit-transfer', title: 'AFTER UPDATE 觸發器：記錄部門調動', dataset: 'company',
        description: '部門真的改變時，觸發器在 `transfer_log` 寫一筆紀錄。三人被 UPDATE，但蔡佩君本來就在業務部，只留下兩筆；`changes()` 只計算 UPDATE 本身改的 3 列。',
        sql: sql`CREATE TABLE transfer_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  from_dept INTEGER NOT NULL,
  to_dept INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER log_transfer
AFTER UPDATE OF dept_id ON employees
FOR EACH ROW
WHEN NEW.dept_id <> OLD.dept_id
BEGIN
  INSERT INTO transfer_log (emp_id, from_dept, to_dept)
  VALUES (OLD.id, OLD.dept_id, NEW.dept_id);
END;
UPDATE employees SET dept_id = 2 WHERE id IN (5, 6, 8);
SELECT changes() AS updated, id, emp_id, from_dept, to_dept
FROM transfer_log
ORDER BY id;`,
        result: { columns: ['updated', 'id', 'emp_id', 'from_dept', 'to_dept'], rows: [
          [3, 1, 5, 1, 2],
          [3, 2, 6, 1, 2],
        ] },
      },
      {
        id: 'trigger-stats', title: '用觸發器讓統計表隨時是最新的', dataset: 'company',
        description: '三個觸發器分別處理新增、刪除與調動部門。經過三種修改後，存下的人數 `stored` 與即時計算的 `actual` 一致。',
        sql: sql`CREATE TABLE dept_headcount (
  dept_id INTEGER PRIMARY KEY,
  n INTEGER NOT NULL
);
INSERT INTO dept_headcount
SELECT d.id, (SELECT COUNT(*) FROM employees e WHERE e.dept_id = d.id)
FROM departments d;
CREATE TRIGGER headcount_insert AFTER INSERT ON employees
BEGIN
  UPDATE dept_headcount SET n = n + 1 WHERE dept_id = NEW.dept_id;
END;
CREATE TRIGGER headcount_delete AFTER DELETE ON employees
BEGIN
  UPDATE dept_headcount SET n = n - 1 WHERE dept_id = OLD.dept_id;
END;
CREATE TRIGGER headcount_move AFTER UPDATE OF dept_id ON employees
BEGIN
  UPDATE dept_headcount SET n = n - 1 WHERE dept_id = OLD.dept_id;
  UPDATE dept_headcount SET n = n + 1 WHERE dept_id = NEW.dept_id;
END;
INSERT INTO employees (name, dept_id, manager_id, salary, hired_on)
VALUES ('孫立德', 4, 1, 70000, '2026-11-02');
DELETE FROM employees WHERE id = 11;
UPDATE employees SET dept_id = 4 WHERE id = 10;
SELECT d.name, h.n AS stored,
  (SELECT COUNT(*) FROM employees e WHERE e.dept_id = h.dept_id) AS actual
FROM dept_headcount h
JOIN departments d ON d.id = h.dept_id
ORDER BY h.dept_id;`,
        result: { columns: ['name', 'stored', 'actual'], rows: [
          ['研發部', 5, 5],
          ['業務部', 4, 4],
          ['行政部', 1, 1],
          ['法務部', 2, 2],
        ] },
      },
      {
        id: 'guard-manager-salary', title: 'BEFORE INSERT 與 RAISE(ABORT)：跨列的規則', dataset: 'company',
        description: '新進員工的月薪若高於直屬主管，觸發器用 RAISE(ABORT, …) 拒絕。這位新人的月薪 60000 不高於吳承翰的 85000，新增成功。',
        sql: sql`CREATE TRIGGER salary_under_manager
BEFORE INSERT ON employees
FOR EACH ROW
WHEN NEW.salary > (SELECT salary FROM employees WHERE id = NEW.manager_id)
BEGIN
  SELECT RAISE(ABORT, '薪水不能高於直屬主管');
END;
INSERT INTO employees (name, dept_id, manager_id, salary, hired_on)
VALUES ('何明哲', 2, 7, 60000, '2026-11-02');
SELECT id, name, manager_id, salary
FROM employees
WHERE hired_on >= '2026-01-01';`,
        result: { columns: ['id', 'name', 'manager_id', 'salary'], rows: [
          [13, '何明哲', 7, 60000],
        ] },
      },
      {
        id: 'instead-of-view', title: 'INSTEAD OF：讓檢視表可以改姓名', dataset: 'company',
        description: '對 `staff_public` 改姓名時，觸發器改的是 `employees`。`changes()` 不計入 INSTEAD OF 觸發器做的修改，所以是 0。',
        sql: sql`CREATE VIEW staff_public AS
SELECT e.id, e.name, d.name AS dept, e.hired_on
FROM employees e
JOIN departments d ON d.id = e.dept_id;
CREATE TRIGGER staff_public_rename
INSTEAD OF UPDATE OF name ON staff_public
FOR EACH ROW
BEGIN
  UPDATE employees SET name = NEW.name WHERE id = OLD.id;
END;
UPDATE staff_public SET name = '王俊杰' WHERE id = 3;
SELECT changes() AS counted, id, name, dept
FROM staff_public
WHERE id = 3;`,
        result: { columns: ['counted', 'id', 'name', 'dept'], rows: [
          [0, 3, '王俊杰', '研發部'],
        ] },
      },
      {
        id: 'transfer-report', title: '檢視表加觸發器：自動記錄異動的報表', dataset: 'company',
        description: '稽核表與觸發器負責記錄，檢視表 `transfer_report` 把編號換成員工與部門名稱。之後的三次調動自動出現在報表裡。',
        sql: sql`CREATE TABLE transfer_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  from_dept INTEGER NOT NULL,
  to_dept INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER log_transfer
AFTER UPDATE OF dept_id ON employees
FOR EACH ROW
WHEN NEW.dept_id <> OLD.dept_id
BEGIN
  INSERT INTO transfer_log (emp_id, from_dept, to_dept)
  VALUES (OLD.id, OLD.dept_id, NEW.dept_id);
END;
CREATE VIEW transfer_report AS
SELECT l.id, e.name, f.name AS from_dept, t.name AS to_dept, l.logged_at
FROM transfer_log l
LEFT JOIN employees e ON e.id = l.emp_id
JOIN departments f ON f.id = l.from_dept
JOIN departments t ON t.id = l.to_dept;
UPDATE employees SET dept_id = 4 WHERE id = 10;
UPDATE employees SET dept_id = 4 WHERE manager_id = 10;
UPDATE employees SET dept_id = 2 WHERE id = 6;
SELECT id, name, from_dept, to_dept
FROM transfer_report
ORDER BY id;`,
        result: { columns: ['id', 'name', 'from_dept', 'to_dept'], rows: [
          [1, '鄭美玲', '行政部', '法務部'],
          [2, '許文彬', '行政部', '法務部'],
          [3, '黃淑芬', '研發部', '業務部'],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-staff-directory', title: '不含月薪的員工通訊錄檢視表',
        statement: '在 `company` 資料上建立檢視表 `staff_directory`，當作全公司都能看的員工通訊錄：每位員工一列，欄位依序為 `id`（員工編號）、`name`（姓名）、`dept_name`（部門名稱）、`manager_name`（直屬主管的姓名，沒有主管的人是 NULL）。不能包含月薪或其他欄位。它必須是檢視表（`CREATE VIEW`），之後新增或修改員工時，查詢它就看得到最新的資料。檢查時會列出它的欄位名稱、確認它是檢視表，再列出所有資料列；隱藏的檢查還會新增一位員工、修改姓名之後再查一次。',
        dataset: 'company', hidden: ['company-b'], ordered: true, columnNames: true,
        starter: sql`CREATE VIEW staff_directory AS
SELECT ...
FROM employees e
...;`,
        hints: [
          '部門名稱在 `departments`：`employees.dept_id` 對到 `departments.id`。主管的姓名也在 `employees` 裡，所以把 `employees` 再合併一次（DB05 的自我合併），例如別名 `m`，條件是 `m.id = e.manager_id`。',
          '林志明沒有主管（`manager_id` 是 NULL）。用 `JOIN` 合併主管會讓他從通訊錄消失，要用 `LEFT JOIN`。',
          '用 `AS` 取欄位名稱：`d.name AS dept_name`、`m.name AS manager_name`。只列出這四欄，不要寫 `e.*`。',
        ],
        solution: sql`CREATE VIEW staff_directory AS
SELECT e.id, e.name, d.name AS dept_name, m.name AS manager_name
FROM employees e
JOIN departments d ON d.id = e.dept_id
LEFT JOIN employees m ON m.id = e.manager_id;`,
        alternatives: [
          sql`CREATE VIEW staff_directory (id, name, dept_name, manager_name) AS
SELECT e.id, e.name,
  (SELECT d.name FROM departments d WHERE d.id = e.dept_id),
  (SELECT m.name FROM employees m WHERE m.id = e.manager_id)
FROM employees e;`,
          sql`DROP VIEW IF EXISTS staff_directory;
CREATE VIEW staff_directory AS
WITH managers AS (SELECT id, name FROM employees)
SELECT e.id, e.name, d.name AS dept_name, mg.name AS manager_name
FROM employees e
LEFT JOIN managers mg ON mg.id = e.manager_id
JOIN departments d ON e.dept_id = d.id
ORDER BY e.id;`,
        ],
        mistakes: [
          { sql: sql`CREATE VIEW staff_directory AS
SELECT e.id, e.name, d.name AS dept_name, m.name AS manager_name
FROM employees e
JOIN departments d ON d.id = e.dept_id
JOIN employees m ON m.id = e.manager_id;`, why: '主管用 `JOIN` 合併：林志明的 `manager_id` 是 NULL，找不到配對的主管，整列被丟掉，通訊錄少了最高主管。沒有配對也要保留左邊的列，要用 `LEFT JOIN`。' },
          { sql: sql`CREATE VIEW staff_directory AS
SELECT e.id, e.name, d.name AS dept_name, m.name AS manager_name, e.salary
FROM employees e
JOIN departments d ON d.id = e.dept_id
LEFT JOIN employees m ON m.id = e.manager_id;`, why: '多放了 `e.salary`：檢視表有五個欄位，月薪也露了出來，「檢視表的欄位」檢查就不符。限制可見欄位的意義在於只列出需要的欄位。' },
          { sql: sql`CREATE TABLE staff_directory AS
SELECT e.id, e.name, d.name AS dept_name, m.name AS manager_name
FROM employees e
JOIN departments d ON d.id = e.dept_id
LEFT JOIN employees m ON m.id = e.manager_id;`, why: '`CREATE TABLE … AS` 建的是一張複製出來的表，不是檢視表：現在的內容雖然一樣，之後新增員工或改名，它都不會跟著變。「是不是檢視表」的檢查會看到 `table`。' },
        ],
        probes: [
          { label: '檢視表的欄位', sql: sql`SELECT name FROM pragma_table_info('staff_directory') ORDER BY cid;` },
          { label: '是不是檢視表', sql: sql`SELECT type FROM sqlite_schema WHERE name = 'staff_directory';` },
          { label: '列出通訊錄', sql: sql`SELECT * FROM staff_directory ORDER BY id;` },
          { label: '新增一位員工到編號最大的部門', sql: sql`INSERT INTO employees (name, dept_id, manager_id, salary, hired_on)
SELECT '新同事', MAX(id), (SELECT MIN(id) FROM employees), 50000, '2026-11-01' FROM departments;`, hidden: true },
          { label: '最高主管改名', sql: sql`UPDATE employees SET name = name || '（總經理）' WHERE manager_id IS NULL;`, hidden: true },
          { label: '再列出通訊錄', sql: sql`SELECT * FROM staff_directory ORDER BY id;`, hidden: true },
        ],
      },
      {
        id: 'ex-salary-audit', title: '調薪稽核紀錄觸發器',
        statement: '在 `company` 資料上替月薪的異動做稽核紀錄。一、建立表 `salary_log`，至少有這幾個欄位：`id`（整數主鍵，自動編號）、`emp_id`（員工編號）、`old_salary`（調整前的月薪）、`new_salary`（調整後的月薪）；想多加欄位（例如記錄時間）也可以。二、建立觸發器 `log_salary_change`：員工的 `salary` 被 `UPDATE` 之後，每一位月薪「真的改變」的員工新增一筆紀錄，加薪、減薪都要記；月薪沒有變（例如 `SET salary = salary`）或只改了其他欄位時，不留紀錄。檢查時會執行幾個 `UPDATE`，再依 `id` 的順序列出 `salary_log` 的 `emp_id`、`old_salary`、`new_salary`。',
        dataset: 'company', hidden: ['company-b'], ordered: true, columnNames: true,
        starter: sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY,
  ...
);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
FOR EACH ROW
...
BEGIN
  ...
END;`,
        hints: [
          '觸發器裡用 `OLD.salary` 取調整前的值、`NEW.salary` 取調整後的值，員工編號是 `OLD.id`（`UPDATE` 時也可以寫 `NEW.id`）。本體寫在 `BEGIN … END;` 之間，裡面的 `INSERT` 也要以分號結尾。',
          '`UPDATE OF salary` 只要 `SET` 裡出現 `salary` 就會觸發，就算值沒變。加上 `WHEN NEW.salary <> OLD.salary`，只在真的改變時寫紀錄。',
          '減薪也是異動：條件要寫「不相等」，不是「變大」。',
        ],
        solution: sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  old_salary INTEGER NOT NULL,
  new_salary INTEGER NOT NULL
);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary <> OLD.salary
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  VALUES (OLD.id, OLD.salary, NEW.salary);
END;`,
        alternatives: [
          sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  old_salary INTEGER NOT NULL,
  new_salary INTEGER NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER log_salary_change
AFTER UPDATE ON employees
WHEN NEW.salary IS NOT OLD.salary
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  VALUES (NEW.id, OLD.salary, NEW.salary);
END;`,
          sql`CREATE TABLE salary_log (id INTEGER PRIMARY KEY, emp_id INTEGER, old_salary INTEGER, new_salary INTEGER);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  SELECT OLD.id, OLD.salary, NEW.salary
  WHERE NEW.salary <> OLD.salary;
END;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  old_salary INTEGER NOT NULL,
  new_salary INTEGER NOT NULL
);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
FOR EACH ROW
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  VALUES (OLD.id, OLD.salary, NEW.salary);
END;`, why: '少了 `WHEN`：`SET salary = salary` 雖然沒有改變任何值，`UPDATE OF salary` 仍然逐列觸發，研發部 5 人各留下一筆月薪沒變的紀錄（例如陳雅惠「從 98000 改成 98000」）。' },
          { sql: sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  old_salary INTEGER NOT NULL,
  new_salary INTEGER NOT NULL
);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary <> OLD.salary
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  VALUES (OLD.id, NEW.salary, OLD.salary);
END;`, why: '`NEW` 與 `OLD` 放反了：`old_salary` 記到調整後的值，`new_salary` 記到調整前的值，紀錄看起來像每個人都被減薪。`OLD` 是修改前的列，`NEW` 是修改後的列。' },
          { sql: sql`CREATE TABLE salary_log (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  old_salary INTEGER NOT NULL,
  new_salary INTEGER NOT NULL
);
CREATE TRIGGER log_salary_change
AFTER UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary > OLD.salary
BEGIN
  INSERT INTO salary_log (emp_id, old_salary, new_salary)
  VALUES (OLD.id, OLD.salary, NEW.salary);
END;`, why: '條件寫成「變大」，只記錄加薪：可見的檢查剛好都是加薪或沒變，所以通過；隱藏的檢查有減薪，減薪的紀錄全部漏掉。稽核要記的是「改變」，條件是 `<>`。' },
        ],
        probes: [
          { label: '業務部每人加薪 2000', sql: sql`UPDATE employees SET salary = salary + 2000 WHERE dept_id = 2;` },
          { label: '研發部的月薪寫回原值', sql: sql`UPDATE employees SET salary = salary WHERE dept_id = 1;` },
          { label: '只改最高主管的姓名', sql: sql`UPDATE employees SET name = name || '（代理）' WHERE manager_id IS NULL;` },
          { label: '列出稽核紀錄', sql: sql`SELECT emp_id, old_salary, new_salary FROM salary_log ORDER BY id;` },
          { label: '月薪高於 80000 的人減薪 1000', sql: sql`UPDATE employees SET salary = salary - 1000 WHERE salary > 80000;`, hidden: true },
          { label: '只有月薪低於 60000 的人調整', sql: sql`UPDATE employees SET salary = CASE WHEN salary < 60000 THEN salary + 500 ELSE salary END;`, hidden: true },
          { label: '同一人調整兩次（第一次）', sql: sql`UPDATE employees SET salary = 60000 WHERE id = (SELECT MAX(id) FROM employees);`, hidden: true },
          { label: '同一人調整兩次（第二次）', sql: sql`UPDATE employees SET salary = 61000 WHERE id = (SELECT MAX(id) FROM employees);`, hidden: true },
          { label: '再列出稽核紀錄', sql: sql`SELECT emp_id, old_salary, new_salary FROM salary_log ORDER BY id;`, hidden: true },
          { label: '員工的月薪', sql: sql`SELECT id, salary FROM employees ORDER BY id;`, hidden: true },
        ],
      },
      {
        id: 'ex-salary-guard', title: '用 RAISE(ABORT) 把關調薪',
        statement: '在 `company` 資料上建立觸發器 `check_salary_change`，在員工的 `salary` 被 `UPDATE` 時把關兩條規則：一、不能減薪（新月薪低於原月薪）；二、一次加薪不能超過原月薪的 20%（剛好 20% 可以）。違反任一條時，用 `RAISE(ABORT, …)` 拒絕整個 `UPDATE`（訊息自訂）；沒有違反的修改照常執行，月薪不變或只改其他欄位也都可以。檢查時會執行合法與不合法的調薪，確認哪些被接受、哪些被拒絕，再列出所有員工的 `id` 與 `salary`。',
        dataset: 'company', hidden: ['company-b'], ordered: true, columnNames: true,
        starter: sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
WHEN ...
BEGIN
  SELECT RAISE(ABORT, '...');
END;`,
        hints: [
          '兩條規則都要比較 `OLD.salary` 與 `NEW.salary`，這是 `CHECK` 做不到的，因為 `CHECK` 只看得到修改後的那一列。',
          '違規的條件是 `NEW.salary < OLD.salary OR NEW.salary > OLD.salary * 1.2`。剛好加薪 20% 時 `NEW.salary` 等於 `OLD.salary * 1.2`，不能被擋，所以用 `>` 而不是 `>=`；想避開小數，也可以寫成 `NEW.salary * 5 > OLD.salary * 6`。',
          '`RAISE(IGNORE)` 不會報錯，只會悄悄略過違規的那一列，檢查會發現「應該被拒絕」的修改被接受了。拒絕要用 `RAISE(ABORT, \'訊息\')`。',
        ],
        solution: sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary < OLD.salary OR NEW.salary * 5 > OLD.salary * 6
BEGIN
  SELECT RAISE(ABORT, '調薪不符規定：不能減薪，一次加薪不能超過 20%');
END;`,
        alternatives: [
          sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
WHEN NEW.salary < OLD.salary
BEGIN
  SELECT RAISE(ABORT, '不能減薪');
END;
CREATE TRIGGER check_salary_cap
BEFORE UPDATE OF salary ON employees
WHEN NEW.salary > OLD.salary * 1.2
BEGIN
  SELECT RAISE(ABORT, '一次加薪不能超過 20%');
END;`,
          sql`CREATE TRIGGER check_salary_change
AFTER UPDATE ON employees
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.salary < OLD.salary THEN RAISE(ABORT, '不能減薪')
    WHEN NEW.salary * 5 > OLD.salary * 6 THEN RAISE(ABORT, '一次加薪不能超過 20%')
  END;
END;`,
        ],
        mistakes: [
          { sql: sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary < OLD.salary
BEGIN
  SELECT RAISE(ABORT, '不能減薪');
END;`, why: '只寫了「不能減薪」，忘了加薪的上限：業務部每人加薪 30% 應該被拒絕，卻被接受了。' },
          { sql: sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary < OLD.salary OR NEW.salary * 5 >= OLD.salary * 6
BEGIN
  SELECT RAISE(ABORT, '調薪不符規定');
END;`, why: '上限用了 `>=`：剛好加薪 20% 也被拒絕，但題目說剛好 20% 可以。可見的檢查沒有剛好 20% 的情況，隱藏的檢查有，這種邊界值（F05）要特別測。' },
          { sql: sql`CREATE TRIGGER check_salary_change
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
WHEN NEW.salary < OLD.salary OR NEW.salary * 5 > OLD.salary * 6
BEGIN
  SELECT RAISE(IGNORE);
END;`, why: '`RAISE(IGNORE)` 不報錯，只是略過違規的列：減薪的 `UPDATE` 「成功」執行、只是什麼都沒改，呼叫的程式以為調薪完成了。題目要求拒絕，必須用 `RAISE(ABORT, …)`。' },
        ],
        probes: [
          { label: '研發部每人加薪 10%（應被接受）', sql: sql`UPDATE employees SET salary = salary + salary / 10 WHERE dept_id = 1;` },
          { label: '編號最大的員工減薪 1000（應被拒絕）', sql: sql`UPDATE employees SET salary = salary - 1000 WHERE id = (SELECT MAX(id) FROM employees);` },
          { label: '業務部每人加薪 30%（應被拒絕）', sql: sql`UPDATE employees SET salary = salary * 13 / 10 WHERE dept_id = 2;` },
          { label: '列出月薪', sql: sql`SELECT id, salary FROM employees ORDER BY id;` },
          { label: '最高主管剛好加薪 20%', sql: sql`UPDATE employees SET salary = salary * 6 / 5 WHERE manager_id IS NULL;`, hidden: true },
          { label: '再加 20% 又多 1 元', sql: sql`UPDATE employees SET salary = salary * 6 / 5 + 1 WHERE manager_id IS NULL;`, hidden: true },
          { label: '月薪不變', sql: sql`UPDATE employees SET salary = salary;`, hidden: true },
          { label: '一列減薪、其他人加薪 100', sql: sql`UPDATE employees SET salary = CASE WHEN id = (SELECT MAX(id) FROM employees) THEN salary - 1 ELSE salary + 100 END;`, hidden: true },
          { label: '只改姓名', sql: sql`UPDATE employees SET name = name || '＊' WHERE dept_id = 3;`, hidden: true },
          { label: '再列出月薪', sql: sql`SELECT id, salary FROM employees ORDER BY id;`, hidden: true },
        ],
      },
    ],
  },
};
