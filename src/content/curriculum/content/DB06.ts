import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB06 Subqueries, CTEs, and Window Functions. SQL lesson (Phase F.1b): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB06: LessonContent = {
  lessonId: 'DB06',
  motivation: '到 DB05 為止，每個查詢都是「一步」：從幾張表取列、篩選、分組、排序。可是很多真實的問題要分好幾步才答得出來：「誰的月薪高於全公司平均？」得先算出平均，再拿每個人去比；「哪個部門一個員工都沒有？」要問的是「存不存在」；「每個部門薪資前三名」要先在部門內排名，再挑出前幾名；「這位主管底下一共管幾個人？」要沿著主管關係一層一層往下找，而且事先不知道有幾層。本課用公司人事資料（部門與員工，員工記著直屬主管）學會四種把查詢拆成小步的工具：子查詢把一個查詢的結果當成值、清單或表來用；`EXISTS` 回答「有沒有」，並避開 `NOT IN` 遇到 NULL 時整個結果消失的陷阱；`WITH` 替每一步取名字，遞迴 CTE 能走完任意深度的階層；視窗函式在不合併資料列的情況下算出排名與累計值。學完後你能寫出「每個部門薪資前三名」這類報表，並說得出同分時「前三名」到底是幾個人。',
  sections: [
    {
      id: 'scalar-subquery', title: '子查詢：把查詢的結果當成一個值',
      blocks: [
        { type: 'p', text: '全公司的平均月薪用 DB04 的 `SELECT AVG(salary) FROM employees` 就算得出來（72916.67）。可是「列出月薪高於全公司平均的員工」不能寫成 `WHERE salary > AVG(salary)`：`WHERE` 逐列篩選時還沒有任何彙總結果，SQLite 會回報 `misuse of aggregate function AVG()`。解法是把「算平均」寫成另一個查詢，用括號包起來放進條件裡。寫在另一個敘述裡的查詢叫子查詢（subquery），包住它的叫外層查詢：' },
        { type: 'example', id: 'above-company-avg' },
        { type: 'p', text: '括號裡的查詢自己就能執行，結果剛好一列一欄，所以可以當成一個值來比較。這種子查詢叫純量子查詢（scalar subquery）。子查詢依「回傳的形狀」分成幾種，形狀決定它能放在哪裡：' },
        { type: 'table', head: ['子查詢回傳', '名稱', '放在哪裡', '本課的例子'], rows: [
          ['一個值（一列一欄）', '純量子查詢', '`SELECT` 的欄位、`WHERE` 的比較，任何需要一個值的地方', '`salary > (SELECT AVG(salary) FROM employees)`'],
          ['一欄、任意多列', '清單子查詢', '`IN`、`NOT IN` 的右邊', '`dept_id IN (SELECT id FROM departments WHERE location = \'台北\')`'],
          ['任意列（只看有沒有列）', '`EXISTS` 子查詢', '`EXISTS`、`NOT EXISTS`', '`NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.id)`'],
          ['一張表', '衍生表（derived table）', '`FROM`、`JOIN`，像一張表一樣使用', '`JOIN (SELECT dept_id, AVG(salary) AS avg_salary FROM employees GROUP BY dept_id) AS a`'],
        ] },
        { type: 'callout', tone: 'warning', title: '純量子查詢回傳零列或很多列', text: '純量子查詢一列都沒有時，值是 NULL，這是標準 SQL 的規則。回傳超過一列時，標準 SQL 規定是錯誤，PostgreSQL 會回報 `more than one row returned by a subquery used as an expression`；SQLite 卻不報錯，直接取第一列。在練習場執行 `SELECT name, salary FROM employees WHERE salary = (SELECT salary FROM employees WHERE dept_id = 1);`：研發部有 5 個月薪，SQLite 只拿第一列的 98000 去比，結果只有陳雅惠，看起來很正常，其實是錯的。沒有 `ORDER BY` 時「第一列」是哪一列也沒有保證。子查詢可能回傳多個值時，要改用 `IN`。' },
      ],
    },
    {
      id: 'in-exists', title: 'IN、EXISTS 與 NOT IN 的 NULL 陷阱',
      blocks: [
        { type: 'p', text: '子查詢回傳一整欄時，用 `IN` 問「這個值在不在清單裡」。「在台北的部門工作的員工」：先查出台北部門的編號清單（研發部 1、行政部 3），再挑出 `dept_id` 在清單裡的員工：' },
        { type: 'example', id: 'taipei-employees' },
        { type: 'p', text: '`EXISTS (子查詢)` 只問一件事：子查詢至少有一列嗎？有就是真，沒有就是假，列的內容完全不看，所以習慣寫 `SELECT 1`（寫 `SELECT *` 結果也一樣）。`NOT EXISTS` 則是「一列都沒有」。要問「這個部門有沒有員工」，子查詢必須知道外層現在是哪個部門，所以條件裡用到外層的 `d.id`，這種子查詢叫相關子查詢，下一節細談。法務部是唯一沒有員工的部門：' },
        { type: 'example', id: 'dept-without-staff' },
        { type: 'p', text: '同一件事也可以寫成 `WHERE id NOT IN (SELECT dept_id FROM employees)`，在這裡結果相同，因為 `dept_id` 是 `NOT NULL`。但清單裡只要有一個 NULL，`NOT IN` 就會出事。`x NOT IN (a, b, NULL)` 的意思是 `x <> a AND x <> b AND x <> NULL`，最後一項和 NULL 比較，結果是未知（DB03 的三值邏輯），整個條件因此不可能是真：' },
        { type: 'table', head: ['運算式', '結果', '原因'], rows: [
          ['`3 NOT IN (1, 2)`', '真（SQLite 顯示 1）', '3 和清單裡每個值都不同'],
          ['`2 NOT IN (1, 2, NULL)`', '假（SQLite 顯示 0）', '2 = 2，確定在清單裡'],
          ['`3 NOT IN (1, 2, NULL)`', '未知（NULL）', '3 <> NULL 是未知，無法確定 3 不在清單裡'],
          ['`3 IN (1, 2, NULL)`', '未知（NULL）', '3 不等於 1、2，和 NULL 比較又是未知'],
        ] },
        { type: 'p', text: '`WHERE` 只留下條件為真的列，所以「未知」等於被濾掉。下面用 `shop` 資料示範：`customers.referred_by` 記著推薦人，陳美玲與李淑芬沒有推薦人，存的是 NULL。「沒有推薦過任何人的顧客」其實有王雅雯、張志明、李淑芬 3 位，三種寫法卻得到不同的答案：' },
        { type: 'example', id: 'not-in-null' },
        { type: 'p', text: '`not_in` 是 0：子查詢的清單裡有 NULL，每位顧客的 `NOT IN` 都是假或未知。`not_in_filtered` 在子查詢裡先用 `WHERE referred_by IS NOT NULL` 去掉 NULL，答案就對了。`not_exists` 問的是「有沒有人的 `referred_by` 等於我的 `id`」，NULL 不等於任何值，只是配不上而已，不會讓整個條件變成未知，所以不必特別處理。這是標準 SQL 三值邏輯的結果，每一套 DBMS 都一樣，不是 SQLite 的怪癖。' },
        { type: 'callout', tone: 'tip', title: '「找出沒有……的」優先用 NOT EXISTS', text: '`company` 的 `employees.manager_id` 也有 NULL：最高主管林志明沒有主管。所以 `WHERE id NOT IN (SELECT manager_id FROM employees)` 想找「沒有部屬的員工」會得到 0 列，本課的第一個練習就是要你寫對它。經驗法則：子查詢的欄位允許 NULL 時，用 `NOT EXISTS`，或在子查詢裡加上 `IS NOT NULL`；`IN` 不受影響，因為只要找到一個相等的值就是真。' },
        { type: 'callout', tone: 'note', title: 'SQLite 不支援 ALL 與 ANY', text: '標準 SQL 還有 `salary > ALL (子查詢)`、`salary = ANY (子查詢)` 這類比較，PostgreSQL、MySQL 都支援；SQLite 不支援，會回報語法錯誤。在 SQLite 改寫成 `salary > (SELECT MAX(salary) FROM …)`（子查詢至少有一列、而且沒有 NULL 時，兩者結果相同）或 `IN`。' },
      ],
    },
    {
      id: 'correlated', title: '相關子查詢：對外層的每一列各算一次',
      blocks: [
        { type: 'p', text: '第 1 節的 `(SELECT AVG(salary) FROM employees)` 和外層無關，單獨執行也有結果，叫非相關子查詢：概念上只要算一次，答案對每一列都一樣。如果要比的是「自己部門的平均」，每位員工要比的值就不同了：研發部的人比 73000，業務部的人比 64750。子查詢的條件必須用到外層那一列的 `e.dept_id`：' },
        { type: 'example', id: 'above-dept-avg' },
        { type: 'p', text: '子查詢裡的 `e.dept_id` 指向外層查詢正在檢查的那一列，所以這是相關子查詢（correlated subquery）。它無法單獨執行：在練習場只執行括號裡的 `SELECT AVG(x.salary) FROM employees x WHERE x.dept_id = e.dept_id;`，會得到 `no such column: e.dept_id`。它的意義可以這樣理解：外層每讀到一列，就把那一列的值代進子查詢算一次，再用結果判斷這一列要不要留下：' },
        { type: 'table', head: ['外層這一列', '代入後的子查詢', '子查詢結果', '`e.salary > 結果`'], rows: [
          ['陳雅惠，研發部，98000', '`… WHERE x.dept_id = 1`', '73000', '真，留下'],
          ['王俊傑，研發部，72000', '`… WHERE x.dept_id = 1`', '73000', '假，濾掉'],
          ['吳承翰，業務部，85000', '`… WHERE x.dept_id = 2`', '64750', '真，留下'],
          ['鄭美玲，行政部，54000', '`… WHERE x.dept_id = 3`', '83666.67', '假，濾掉'],
        ] },
        { type: 'p', text: '內外兩層都用 `employees`，所以一定要給不同的別名（`e` 與 `x`），否則分不清是哪一層的欄位。SQL 解析沒寫表名的欄位時，會先找最內層的 `FROM`，找不到才往外層找。這條規則造成一個很難發現的錯誤：在子查詢裡寫 `WHERE r.manager_id = id`，`id` 會被當成內層的 `r.id`，而不是外層的 `e.id`。查詢照常執行，但子查詢和外層的關聯悄悄斷了，算出來的是另一件事。相關子查詢裡，外層的欄位一律寫上外層的別名。' },
        { type: 'callout', tone: 'note', title: '「每列算一次」是意義，不是執行方式', text: '上表描述的是相關子查詢的結果「等於」什麼，不是 DBMS 一定這樣執行。最佳化器可能把它改寫成合併、把相同參數的結果暫存起來，或照字面逐列執行；同一個查詢在不同 DBMS、不同版本、有沒有索引時做法都可能不同。所以不要背「相關子查詢一定慢」或「JOIN 一定比較快」，在意效能時看執行計畫（SQLite 用 `EXPLAIN QUERY PLAN`）並實際量測。' },
      ],
    },
    {
      id: 'subquery-vs-join', title: '同一個需求：子查詢與 JOIN 兩種寫法',
      blocks: [
        { type: 'p', text: '很多需求既可以寫成子查詢，也可以寫成 DB05 的 `JOIN`。上一節「高於部門平均」的 JOIN 寫法，是先用衍生表算出每個部門的平均（一個部門一列），再把它當成一張表接上員工：' },
        { type: 'example', id: 'above-dept-avg-join' },
        { type: 'p', text: '結果和相關子查詢完全相同。衍生表 `a` 裡的 `AVG(salary)` 要取別名 `avg_salary`，外層才能用 `a.avg_salary` 指名它。標準 SQL 與 MySQL 規定衍生表一定要有別名；SQLite 允許省略，但省略之後就沒辦法寫 `a.欄位`，所以一律寫上。下表比較四個需求的兩種寫法：' },
        { type: 'table', head: ['需求', '子查詢寫法', 'JOIN 寫法', '差別'], rows: [
          ['在台北部門工作的員工', '`WHERE e.dept_id IN (SELECT id FROM departments WHERE location = \'台北\')`', '`JOIN departments d ON d.id = e.dept_id WHERE d.location = \'台北\'`', '結果相同，因為每位員工只屬於一個部門；JOIN 版可以順便輸出部門名稱'],
          ['有部屬的主管', '`WHERE EXISTS (SELECT 1 FROM employees e WHERE e.manager_id = m.id)`：5 列', '`JOIN employees e ON e.manager_id = m.id`：11 列，要加 `DISTINCT` 才剩 5 列', '一對多的合併會讓「一」那邊重複：陳雅惠有 3 位部屬就出現 3 次；`EXISTS` 只問有沒有，不會重複'],
          ['沒有員工的部門', '`WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.id)`', '`LEFT JOIN employees e ON e.dept_id = d.id WHERE e.id IS NULL`（DB05 的反合併）', '兩者都不受 NULL 影響；改寫成 `NOT IN` 時要注意子查詢的欄位有沒有 NULL'],
          ['高於部門平均的員工', '相關子查詢 `e.salary > (SELECT AVG(x.salary) … WHERE x.dept_id = e.dept_id)`', '接上衍生表 `JOIN (SELECT dept_id, AVG(salary) AS avg_salary … GROUP BY dept_id) AS a`', '衍生表版本的平均算一次就能同時用在條件與輸出欄位'],
        ] },
        { type: 'p', text: '哪一種比較好讀，看問題怎麼說：' },
        { type: 'list', items: [
          '問題是「有沒有」「是不是其中之一」，結果只要外層那張表的欄位：用 `EXISTS`／`IN`，讀起來就是問題本身，也不會因為一對多而重複。',
          '結果要用到另一張表的欄位（部門名稱、平均值）：用 `JOIN`，子查詢的值出了括號就看不到了。',
          '要比的是一個彙總值（全公司平均、部門最高薪）：純量子查詢最直接；同一個彙總要在好幾個地方用，改成衍生表或下一節的 CTE，只寫一次。',
          '「沒有」的問題：`NOT EXISTS` 或 LEFT JOIN 反合併；寫 `NOT IN` 前先確認子查詢的欄位不會有 NULL。',
        ] },
        { type: 'callout', tone: 'tip', title: '兩種都寫，互相驗證', text: '寫完一個重要的查詢，用另一種寫法再寫一次，在練習場比對結果。兩者不同時通常就抓到錯了：JOIN 版列數比較多，多半是一對多造成的重複；`NOT IN` 版是空的，多半是 NULL。本課練習的參考解答也都附了不同寫法。' },
      ],
    },
    {
      id: 'cte', title: 'WITH：替中間結果取名字',
      blocks: [
        { type: 'p', text: '衍生表一多，查詢就得從最裡面的括號往外讀。CTE（common table expression，通用資料表運算式）把中間步驟搬到最前面：`WITH 名稱 AS (查詢)` 定義一個暫時、有名字的結果，後面的主查詢就把它當成一張表使用。它只在這一個敘述裡有效，不會在資料庫裡留下任何表。好幾個 CTE 用逗號隔開，後面的可以使用前面的：' },
        { type: 'example', id: 'cte-dept-stats' },
        { type: 'p', text: '由上往下讀就是解題步驟：`dept_stats` 算出每個部門的人數與平均月薪；`company_avg` 算出全公司平均；主查詢把兩者接起來，只留下平均高於全公司平均的部門。研發部的 73000 只比全公司平均 72916.67 高一點點，也留下了；業務部 64750 被篩掉。同樣的查詢寫成巢狀的衍生表也可以，但讀的人得先找到最裡面的括號。' },
        { type: 'p', text: 'CTE 也能和 DB05 的外部合併搭配。要列出每個部門的人數，連沒有員工的法務部也要列出 0，就以 `departments` 為主，LEFT JOIN 一個先分好組的 CTE。先分組再合併，每個部門剛好配到一列統計，不會有一對多的重複：' },
        { type: 'example', id: 'cte-headcount' },
        { type: 'p', text: '法務部在 `dept_stats` 裡沒有列，LEFT JOIN 替它補上 NULL：`COALESCE(s.headcount, 0)` 把人數換成 0，最高薪則保持 NULL（不存在的值）。這和 DB05 說的「NULL 從哪裡來」是同一件事。' },
        { type: 'callout', tone: 'note', title: '各 DBMS 的 CTE', text: '`WITH` 是標準 SQL，SQLite、PostgreSQL、SQL Server、Oracle 都支援，MySQL 從 8.0 起支援。CTE 會先算成一份暫存結果，還是像衍生表一樣併進主查詢一起最佳化，各家做法不同；SQLite 可以寫 `WITH s AS MATERIALIZED (…)` 或 `AS NOT MATERIALIZED` 提示它。因此不要假設改寫成 CTE 一定變快或變慢，CTE 的主要價值是可讀性。' },
      ],
    },
    {
      id: 'recursive-cte', title: '遞迴 CTE：沿著主管鏈一層一層走',
      blocks: [
        { type: 'p', text: '`employees.manager_id` 指向同一張表的 `id`，和 DB05 的推薦人一樣是自我參照。一個自我合併只能往下走一層（找出直屬部屬），兩個自我合併走兩層，可是「底下所有的人」有幾層事先不知道。遞迴 CTE 讓一個 CTE 使用它自己，一層一層展開，直到沒有新的列為止。先看最小的例子，產生 1 到 5：' },
        { type: 'example', id: 'recursive-counter' },
        { type: 'p', text: '遞迴 CTE 由 `UNION ALL` 分成兩部分：前面是起點（anchor），後面是遞迴部分，它的 `FROM` 裡用到 CTE 自己的名字。概念上的執行步驟：' },
        { type: 'list', ordered: true, items: [
          '執行起點：得到 1。這些列放進結果，也成為「上一批」。',
          '執行遞迴部分，其中的 `n` 只代表上一批的列：從 1 算出 2。新的列加進結果，成為新的上一批。',
          '重複第 2 步：2 → 3 → 4 → 5。',
          '上一批是 5 時，`WHERE x < 5` 不成立，遞迴部分沒有產生任何列，遞迴結束。',
        ] },
        { type: 'p', text: '組織圖用的是同樣的結構。起點是沒有主管的人（`manager_id IS NULL`），層級 1；遞迴部分找出「主管在上一批裡」的員工，層級加 1，並把姓名接在主管的路徑後面。`||` 是字串串接：' },
        { type: 'example', id: 'org-chart' },
        { type: 'p', text: '一批一批看：第 1 批是林志明；第 2 批是直屬於他的陳雅惠、吳承翰、鄭美玲；第 3 批是 7 位直屬於第 2 批的人；第 4 批只有直屬於王俊傑的黃淑芬；第 5 批要找直屬於黃淑芬的人，沒有，遞迴結束，共 4 層。這裡的終止條件來自資料本身：組織是一棵有限、沒有循環的樹，走到最底層自然停下。`ORDER BY path` 依路徑文字排序，每位主管的路徑是部屬路徑的開頭，所以每個人都排在自己整個團隊的前面，讀起來就像一張樹狀圖。' },
        { type: 'callout', tone: 'warning', title: '一定要有終止條件', text: '把計數例子的 `WHERE x < 5` 拿掉，遞迴部分永遠會產生新的列。練習場最多讀取 200 列，讀到第 200 列就停止，所以你會看到 1 到 200；換成其他工具，它可能一直執行到被中斷或記憶體用完。如果外層還要排序或彙總（`ORDER BY`、`COUNT`），必須先讀完整個遞迴才能輸出第一列，200 列的上限就幫不上忙，只能等練習場約 3 秒的時間限制把它停下。資料若有循環（A 是 B 的主管、B 又是 A 的主管），組織圖查詢也會無限展開，這時在遞迴部分加上保險條件，例如 `WHERE c.level < 20`。' },
        { type: 'callout', tone: 'note', title: 'RECURSIVE 關鍵字與字串串接', text: '標準 SQL 寫成 `WITH RECURSIVE`，PostgreSQL、MySQL 都要求寫出 `RECURSIVE`。SQLite 接受它，而且省略也能執行遞迴 CTE（可以在練習場試試），但寫出來讀的人才知道這是遞迴，也比較好移植；SQL Server 則是直接用 `WITH`，不寫 `RECURSIVE`。`||` 是標準 SQL 的字串串接，SQLite、PostgreSQL 都支援；MySQL 預設不把 `||` 當成串接，SQL Server 用 `+`，兩者都可以改用 `CONCAT()` 函式。' },
      ],
    },
    {
      id: 'window-ranking', title: '視窗函式：保留每一列的排名',
      blocks: [
        { type: 'p', text: '`GROUP BY` 把一組列壓成一列；視窗函式（window function）也對一組相關的列計算，但不壓縮，每一列都留著，旁邊多一個算出來的值。寫法是 `函式 OVER (PARTITION BY … ORDER BY …)`：`PARTITION BY` 把列分成幾個分割（像 `GROUP BY` 分組，但不合併），`OVER` 裡的 `ORDER BY` 決定分割內的順序，用在排名與累計上，和整個查詢最後的 `ORDER BY` 是兩回事。對照兩個查詢：' },
        { type: 'table', head: ['查詢', '列數', '每一列是什麼'], rows: [
          ['`SELECT dept_id, AVG(salary) FROM employees GROUP BY dept_id`', '3', '一個部門一列，個別員工看不到了'],
          ['`SELECT dept_id, name, AVG(salary) OVER (PARTITION BY dept_id) FROM employees`', '12', '一位員工一列，旁邊附上他所屬部門的平均'],
        ] },
        { type: 'p', text: '第二個查詢裡 `name` 不必是分組欄位，因為沒有任何列被合併。排名是視窗函式最常見的用途，三個排名函式只在「同分」時有差別。`company` 的研發部有兩人同為 72000、業務部有兩人同為 61000，把三種排名放在一起：' },
        { type: 'example', id: 'rank-compare' },
        { type: 'table', head: ['研發部月薪', '`ROW_NUMBER()`', '`RANK()`', '`DENSE_RANK()`'], rows: [
          ['98000', '1', '1', '1'],
          ['72000', '2', '2', '2'],
          ['72000', '3', '2', '2'],
          ['65000', '4', '4', '3'],
          ['58000', '5', '5', '4'],
        ] },
        { type: 'list', items: [
          '`ROW_NUMBER()`：從 1 開始逐列編號，同分也給不同號碼。同分的人誰先誰後由 `OVER` 裡的 `ORDER BY` 決定，只寫 `ORDER BY e.salary DESC` 時沒有定義；例子加上 `e.id` 當平手規則，順序才固定。',
          '`RANK()`：同分同名次，後面的名次跳過被占掉的號碼（1、2、2、4），就像運動比賽的名次：65000 前面有 3 個人，所以是第 4 名。',
          '`DENSE_RANK()`：同分同名次，下一個不同的值只加 1、不跳號（1、2、2、3），名次等於「第幾高的薪資等級」。',
        ] },
        { type: 'callout', tone: 'tip', title: '「前三名」先問：同分怎麼算？', text: '「每個部門薪資前三名」在研發部至少有三種合理的意思：剛好三個人（`ROW_NUMBER() <= 3`，同分的人誰被排除要另訂規則）、名次不超過 3（`RANK() <= 3`，同分全收，研發部是 98000 與兩位 72000，共 3 人）、前三個薪資等級（`DENSE_RANK() <= 3`，研發部 4 人，多了 65000 的李冠宇）。改成「前兩名」差別更明顯：`ROW_NUMBER() <= 2` 只有 2 人，其中一位 72000 被任意排除；`RANK() <= 2` 有 3 人。寫報表前先和提出需求的人確認規則，再選函式。' },
        { type: 'callout', tone: 'note', title: '各 DBMS 的視窗函式', text: '視窗函式是標準 SQL，PostgreSQL、SQL Server、Oracle 都支援；SQLite 從 3.25.0 版（2018 年）起支援，MySQL 從 8.0 起支援，更舊的版本會回報語法錯誤。本練習場執行 SQLite 3.49.1，可以用 `SELECT sqlite_version();` 確認。' },
      ],
    },
    {
      id: 'window-filter-running', title: '篩選視窗結果與累計值',
      blocks: [
        { type: 'p', text: '有了名次，自然想寫 `WHERE RANK() OVER (…) <= 3`，但 SQLite 會回報 `misuse of window function RANK()`。原因是 DB04 的邏輯順序：`WHERE` 在分組與 `SELECT` 之前執行，而視窗函式是在 `WHERE`、`GROUP BY`、`HAVING` 都做完之後，才對剩下的列計算，篩選時名次根本還不存在。SQLite 允許 `WHERE` 使用 `SELECT` 的別名（這是 SQLite 的擴充，標準 SQL 不允許），但別名指向視窗函式時同樣不行，會得到 `misuse of aliased window function`；放進 `HAVING` 也一樣。正確做法是分兩步：先在 CTE（或衍生表）裡算出名次，再由外層查詢用 `WHERE` 篩選。下面找出每個部門最近到職的一位員工：' },
        { type: 'example', id: 'latest-hire' },
        { type: 'p', text: '`ROW_NUMBER()` 依到職日由新到舊編號，`rn = 1` 就是最新的一位；加上 `e.id` 當平手規則，即使兩人同一天到職，每個部門也一定只挑出一位。這個需求也能寫成相關子查詢：`WHERE e.hired_on = (SELECT MAX(x.hired_on) FROM employees x WHERE x.dept_id = e.dept_id)`，在這份資料上結果相同，但同一天到職的兩人會一起出現。要「每組前 N 名」時，視窗函式寫法只要把 `rn = 1` 改成 `rn <= N`，或換成 `RANK`、`DENSE_RANK`，比相關子查詢容易調整。' },
        { type: 'p', text: '彙總函式也可以當視窗函式用，`OVER` 裡有 `ORDER BY` 時算的是累計值：分割從頭到目前這一列的總和。下面依到職日累計每個部門的月薪總額，看出部門的人事成本是怎麼一路長上來的：' },
        { type: 'example', id: 'running-payroll' },
        { type: 'p', text: '每個部門第一位到職者的累計值就是自己的月薪，之後每多一人就加上他的月薪；每個部門最後一列的累計值（研發部 365000、業務部 259000、行政部 251000）就是部門月薪總額，和 `GROUP BY dept_id` 的 `SUM(salary)` 相同，差別是每一步都看得到。換到下一個部門時，`PARTITION BY` 讓累計從 0 重新開始。' },
        { type: 'callout', tone: 'warning', title: '同值的列會一起累計', text: '`OVER` 裡有 `ORDER BY` 時，標準 SQL 預設的累計範圍是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`：從分割開頭到「所有和目前這列排序值相同的列」。到職日都不同，所以看不出來；若改成依月薪排序 `SUM(salary) OVER (PARTITION BY dept_id ORDER BY salary DESC)`，研發部兩位 72000 的累計值都是 242000，而不是 170000、242000。要一列一列累加，寫明 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`，並加上平手規則固定順序。`OVER` 裡沒有 `ORDER BY` 時，則是整個分割的總和，每一列都一樣。' },
        { type: 'list', ordered: true, items: [
          '先決定同分規則，選函式：剛好 N 個用 `ROW_NUMBER`（加平手規則），同分全收用 `RANK`，前 N 個不同的值用 `DENSE_RANK`。',
          '`PARTITION BY` 寫「每個○○」的○○，`OVER` 裡的 `ORDER BY` 寫排名依據與方向。',
          '在 CTE 裡算出名次，外層 `WHERE` 篩選名次。',
          '最後的 `ORDER BY` 寫完整的排序（例如部門、名次、員工編號），讓順序在任何資料上都唯一。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-not-in-null', prompt: '在 `company` 資料上，最高主管林志明的 `manager_id` 是 NULL。下面的查詢想找出「沒有任何部屬的員工」，它回傳幾列？',
      code: { language: 'SQL', text: 'SELECT name\nFROM employees\nWHERE id NOT IN (SELECT manager_id FROM employees);' },
      options: [
        '7 列：沒有任何人把他們當主管的 7 位員工',
        '0 列：子查詢的清單裡有 NULL，每一列的 `NOT IN` 都是假或未知',
        '5 列：有部屬的 5 位主管',
        '執行失敗：清單子查詢不能含有 NULL',
      ],
      answer: 1, explanation: '`id NOT IN (…, NULL)` 等於 `id <> … AND id <> NULL`，和 NULL 比較是未知，所以對沒有部屬的人結果是未知、對主管結果是假，沒有一列是真，結果是空的。7 列是本來想要的答案，要改寫成 `NOT EXISTS`，或在子查詢加上 `WHERE manager_id IS NOT NULL` 才得到；5 列是 `IN`（不是 `NOT IN`）的結果；清單含 NULL 不會報錯，正因為不報錯，這個陷阱才危險。',
    },
    {
      id: 'q-rank-ties', prompt: '業務部的月薪是 85000、61000、61000、52000。下面的查詢中，月薪 52000 的周怡君三個欄位分別是多少？',
      code: { language: 'SQL', text: 'SELECT name, salary,\n  ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num,\n  RANK() OVER (ORDER BY salary DESC) AS rnk,\n  DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rnk\nFROM employees\nWHERE dept_id = 2;' },
      options: [
        '`row_num` 4、`rnk` 3、`dense_rnk` 3',
        '`row_num` 4、`rnk` 4、`dense_rnk` 4',
        '`row_num` 4、`rnk` 4、`dense_rnk` 3',
        '`row_num` 3、`rnk` 3、`dense_rnk` 3',
      ],
      answer: 2, explanation: '`ROW_NUMBER` 逐列編號，周怡君是第 4 列；`RANK` 同分同名次並跳號，兩位 61000 占了第 2、3 名的位置，下一名是 4；`DENSE_RANK` 不跳號，61000 是第 2 個薪資等級，52000 是第 3 個。`rnk` 3 是把 `RANK` 當成不跳號；`dense_rnk` 4 是把 `DENSE_RANK` 當成跳號；`row_num` 3 是誤以為同分的兩人共用一個列號，但 `ROW_NUMBER` 永遠不重複。',
    },
    {
      id: 'q-window-filter', prompt: '要列出每個部門月薪最高的人（同薪的都要列出），哪一個查詢能正確執行並得到答案？',
      options: [
        '`SELECT name FROM employees WHERE RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) = 1;`',
        '`SELECT name, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS r FROM employees WHERE r = 1;`',
        '`SELECT name, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS r FROM employees GROUP BY dept_id HAVING r = 1;`',
        '`WITH t AS (SELECT name, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS r FROM employees) SELECT name FROM t WHERE r = 1;`',
      ],
      answer: 3, explanation: '視窗函式在 `WHERE`、`GROUP BY`、`HAVING` 之後才計算，所以要先在 CTE 裡算出名次，再由外層的 `WHERE` 篩選。直接寫在 `WHERE` 會得到 `misuse of window function RANK()`；SQLite 雖然允許 `WHERE` 用別名，但別名指向視窗函式時同樣報錯（`misuse of aliased window function r`）；放進 `HAVING` 也是同一個錯誤，而且 `GROUP BY dept_id` 會把每個部門壓成一列，根本不是要的結果。',
    },
    {
      id: 'q-correlation-scope', prompt: '這個查詢想找出沒有部屬的員工，在 `company` 上卻回傳了全部 12 位員工。原因是什麼？',
      code: { language: 'SQL', text: 'SELECT e.name\nFROM employees e\nWHERE NOT EXISTS (\n  SELECT 1 FROM employees r WHERE r.manager_id = id\n);' },
      options: [
        '子查詢裡沒寫表名的 `id` 先在內層找到 `r.id`，條件變成「r 是自己的主管」，永遠不成立，子查詢和外層失去關聯，`NOT EXISTS` 對每一列都是真',
        '`EXISTS` 的子查詢必須寫 `SELECT *`，寫 `SELECT 1` 時永遠沒有列',
        '`manager_id` 有 NULL，`NOT EXISTS` 遇到 NULL 就對每一列都回傳真',
        'SQLite 不支援相關子查詢，子查詢只執行一次，結果套用到每一列',
      ],
      answer: 0, explanation: '沒寫表名的欄位會先在最內層的 `FROM` 尋找，`r` 也有 `id`，所以 `id` 是 `r.id`。沒有人是自己的主管，子查詢永遠是空的，`NOT EXISTS` 永遠是真。改成 `r.manager_id = e.id` 就對了，結果是 7 位。`EXISTS` 不看子查詢的欄位，`SELECT 1` 和 `SELECT *` 結果相同；NULL 只會讓那一列配不上，不會讓 `NOT EXISTS` 變成真，這正是它比 `NOT IN` 安全的原因；SQLite 支援相關子查詢，本課的例子都在練習場執行過。',
    },
    {
      id: 'q-recursive-stop', prompt: '在練習場執行下面的查詢，會發生什麼事？',
      code: { language: 'SQL', text: 'WITH RECURSIVE n(x) AS (\n  SELECT 1\n  UNION ALL\n  SELECT x + 1 FROM n\n)\nSELECT x FROM n;' },
      options: [
        '只回傳 1：遞迴部分沒有 `WHERE`，所以不會執行',
        '語法錯誤：遞迴 CTE 的遞迴部分一定要有 `WHERE`',
        '遞迴沒有終止條件，會不斷產生新的列；練習場讀到 200 列就停止讀取，所以顯示 1 到 200',
        '回傳 1 到 5：SQLite 預設最多遞迴 5 層',
      ],
      answer: 2, explanation: '遞迴部分每次都從上一批算出一列新的值，永遠不會「沒有新列」，所以遞迴不會自己停止。練習場最多讀 200 列，讀到上限就停止，畫面上是 1 到 200；在沒有這種上限的工具裡會一直執行。`WHERE` 不是語法上的必要條件，少了它查詢照樣能執行，這正是危險的地方；也沒有「預設 5 層」這種限制，本課例子的 5 是 `WHERE x < 5` 寫出來的。',
    },
    {
      id: 'q-join-duplicates', prompt: '`company` 有 12 位員工，除了林志明，每個人都有一位直屬主管；有部屬的主管共 5 位。查詢甲與乙各回傳幾列？',
      code: { language: 'SQL', text: '-- 甲\nSELECT m.name\nFROM employees m\nJOIN employees e ON e.manager_id = m.id;\n\n-- 乙\nSELECT m.name\nFROM employees m\nWHERE EXISTS (SELECT 1 FROM employees e WHERE e.manager_id = m.id);' },
      options: [
        '甲 11 列、乙 5 列',
        '甲 5 列、乙 5 列',
        '甲 12 列、乙 5 列',
        '甲 11 列、乙 11 列',
      ],
      answer: 0, explanation: '甲是一對多的合併：每位有主管的員工產生一列（11 列），主管有幾位部屬就重複幾次，例如陳雅惠出現 3 次；要得到 5 列得加 `DISTINCT`。乙的 `EXISTS` 只問「至少有一位部屬嗎」，每位主管最多出現一次，所以是 5 列。12 是把沒有主管的林志明也算成一列，但內部合併不會產生沒有配對的列；乙也不會是 11，`EXISTS` 不會因為配對很多而重複輸出外層的列。',
    },
    {
      id: 'q-partition-vs-group', prompt: '下面的查詢在 `company` 上回傳幾列？（4 個部門，其中法務部沒有員工；12 位員工）',
      code: { language: 'SQL', text: 'SELECT dept_id, name,\n  AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg\nFROM employees;' },
      options: [
        '3 列：每個有員工的部門一列',
        '4 列：每個部門一列，法務部的平均是 NULL',
        '執行失敗：`name` 不是分組欄位，也沒有包在彙總函式裡',
        '12 列：每位員工一列，`dept_avg` 是他所屬部門的平均月薪',
      ],
      answer: 3, explanation: '視窗函式不合併列：`PARTITION BY dept_id` 只決定每一列的平均要拿哪些列來算，12 位員工仍然各占一列，同部門的人 `dept_avg` 相同（研發部 73000）。3 列是 `GROUP BY dept_id` 的結果；4 列需要以 `departments` 為主做 LEFT JOIN，這裡只從 `employees` 讀；DB04「不是分組欄位就要彙總」的規則只適用於 `GROUP BY`，這個查詢沒有分組，所以 `name` 完全合法。',
    },
  ],
  sql: {
    dataset: 'company',
    presets: [
      { label: '純量子查詢：高於全公司平均', sql: sql`SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees)
ORDER BY salary DESC;` },
      { label: '相關子查詢：高於部門平均', sql: sql`SELECT e.name, e.dept_id, e.salary,
  (SELECT ROUND(AVG(x.salary)) FROM employees x WHERE x.dept_id = e.dept_id) AS dept_avg
FROM employees e
WHERE e.salary > (SELECT AVG(x.salary) FROM employees x WHERE x.dept_id = e.dept_id)
ORDER BY e.id;` },
      { label: 'NOT EXISTS：沒有員工的部門', sql: sql`SELECT d.id, d.name
FROM departments d
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.id);` },
      { label: '遞迴 CTE：組織圖', sql: sql`WITH RECURSIVE chain(id, name, level, path) AS (
  SELECT id, name, 1, name
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, c.level + 1, c.path || ' > ' || e.name
  FROM employees e
  JOIN chain c ON e.manager_id = c.id
)
SELECT id, name, level, path
FROM chain
ORDER BY path;` },
      { label: '三種排名並排', sql: sql`SELECT d.name AS department, e.name, e.salary,
  ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC, e.id) AS row_num,
  RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS dense_rnk
FROM employees e
JOIN departments d ON d.id = e.dept_id
ORDER BY e.dept_id, e.salary DESC, e.id;` },
      { label: '累計值：依到職日累計部門月薪', sql: sql`SELECT dept_id, name, hired_on, salary,
  SUM(salary) OVER (PARTITION BY dept_id ORDER BY hired_on) AS running_payroll
FROM employees
ORDER BY dept_id, hired_on;` },
    ],
    examples: [
      {
        id: 'above-company-avg', title: '純量子查詢：月薪高於全公司平均', dataset: 'company',
        description: '括號裡的子查詢算出全公司平均月薪（72916.67），外層再拿每位員工的月薪和這個值比較。兩位 72000 的員工差一點點，沒有通過。',
        sql: sql`SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees)
ORDER BY salary DESC;`,
        result: { columns: ['name', 'salary'], rows: [
          ['林志明', 150000],
          ['陳雅惠', 98000],
          ['吳承翰', 85000],
        ] },
      },
      {
        id: 'taipei-employees', title: 'IN：在台北部門工作的員工', dataset: 'company',
        description: '子查詢回傳台北部門的編號清單（1、3），外層留下 dept_id 在清單裡的員工：研發部 5 人與行政部 3 人。',
        sql: sql`SELECT e.name, e.dept_id
FROM employees e
WHERE e.dept_id IN (SELECT id FROM departments WHERE location = '台北')
ORDER BY e.id;`,
        result: { columns: ['name', 'dept_id'], rows: [
          ['林志明', 3],
          ['陳雅惠', 1],
          ['王俊傑', 1],
          ['張家瑜', 1],
          ['李冠宇', 1],
          ['黃淑芬', 1],
          ['鄭美玲', 3],
          ['許文彬', 3],
        ] },
      },
      {
        id: 'dept-without-staff', title: 'NOT EXISTS：沒有員工的部門', dataset: 'company',
        description: '對每個部門 d，子查詢找「dept_id 等於 d.id 的員工」；一位都找不到時 NOT EXISTS 為真。只有法務部符合。',
        sql: sql`SELECT d.id, d.name
FROM departments d
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.id);`,
        result: { columns: ['id', 'name'], rows: [[4, '法務部']] },
      },
      {
        id: 'not-in-null', title: 'NOT IN 遇上 NULL：三種寫法比一比', dataset: 'shop',
        description: '「沒有推薦過任何人的顧客」有 3 位。referred_by 裡有 NULL，直接用 NOT IN 得到 0；先去掉 NULL，或改用 NOT EXISTS，才得到 3。',
        sql: sql`SELECT
  (SELECT COUNT(*) FROM customers
    WHERE id NOT IN (SELECT referred_by FROM customers)) AS not_in,
  (SELECT COUNT(*) FROM customers
    WHERE id NOT IN (SELECT referred_by FROM customers WHERE referred_by IS NOT NULL)) AS not_in_filtered,
  (SELECT COUNT(*) FROM customers c
    WHERE NOT EXISTS (SELECT 1 FROM customers r WHERE r.referred_by = c.id)) AS not_exists;`,
        result: { columns: ['not_in', 'not_in_filtered', 'not_exists'], rows: [[0, 3, 3]] },
      },
      {
        id: 'above-dept-avg', title: '相關子查詢：月薪高於自己部門的平均', dataset: 'company',
        description: '子查詢用到外層的 e.dept_id，所以每位員工比的是自己部門的平均。同一個相關子查詢也放在 SELECT 裡，把部門平均（四捨五入）一起列出。',
        sql: sql`SELECT e.name, e.dept_id, e.salary,
  (SELECT ROUND(AVG(x.salary)) FROM employees x WHERE x.dept_id = e.dept_id) AS dept_avg
FROM employees e
WHERE e.salary > (SELECT AVG(x.salary) FROM employees x WHERE x.dept_id = e.dept_id)
ORDER BY e.id;`,
        result: { columns: ['name', 'dept_id', 'salary', 'dept_avg'], rows: [
          ['林志明', 3, 150000, 83667],
          ['陳雅惠', 1, 98000, 73000],
          ['吳承翰', 2, 85000, 64750],
        ] },
      },
      {
        id: 'above-dept-avg-join', title: '同一個需求的 JOIN 寫法：接上衍生表', dataset: 'company',
        description: 'FROM 裡的子查詢先算出每個部門的平均（3 列），取別名 a 後當成一張表和員工合併，條件與輸出都用 a.avg_salary。結果和相關子查詢相同。',
        sql: sql`SELECT e.name, e.dept_id, e.salary, ROUND(a.avg_salary) AS dept_avg
FROM employees e
JOIN (SELECT dept_id, AVG(salary) AS avg_salary
      FROM employees
      GROUP BY dept_id) AS a
  ON a.dept_id = e.dept_id
WHERE e.salary > a.avg_salary
ORDER BY e.id;`,
        result: { columns: ['name', 'dept_id', 'salary', 'dept_avg'], rows: [
          ['林志明', 3, 150000, 83667],
          ['陳雅惠', 1, 98000, 73000],
          ['吳承翰', 2, 85000, 64750],
        ] },
      },
      {
        id: 'cte-dept-stats', title: 'WITH：兩個步驟，各有名字', dataset: 'company',
        description: 'dept_stats 算每個部門的人數與平均，company_avg 算全公司平均，主查詢只留下平均高於全公司平均的部門。',
        sql: sql`WITH dept_stats AS (
  SELECT dept_id, COUNT(*) AS headcount, AVG(salary) AS avg_salary
  FROM employees
  GROUP BY dept_id
),
company_avg AS (
  SELECT AVG(salary) AS avg_salary FROM employees
)
SELECT d.name, s.headcount, ROUND(s.avg_salary) AS avg_salary
FROM dept_stats s
JOIN departments d ON d.id = s.dept_id
WHERE s.avg_salary > (SELECT avg_salary FROM company_avg)
ORDER BY s.avg_salary DESC;`,
        result: { columns: ['name', 'headcount', 'avg_salary'], rows: [
          ['行政部', 3, 83667],
          ['研發部', 5, 73000],
        ] },
      },
      {
        id: 'cte-headcount', title: 'CTE 加 LEFT JOIN：每個部門的人數（含 0 人）', dataset: 'company',
        description: '先在 CTE 裡依部門分組，再以 departments 為主 LEFT JOIN，沒有員工的法務部也留下：人數用 COALESCE 換成 0，最高薪是 NULL。',
        sql: sql`WITH dept_stats AS (
  SELECT dept_id, COUNT(*) AS headcount, MAX(salary) AS top_salary
  FROM employees
  GROUP BY dept_id
)
SELECT d.name, COALESCE(s.headcount, 0) AS headcount, s.top_salary
FROM departments d
LEFT JOIN dept_stats s ON s.dept_id = d.id
ORDER BY d.id;`,
        result: { columns: ['name', 'headcount', 'top_salary'], rows: [
          ['研發部', 5, 98000],
          ['業務部', 4, 85000],
          ['行政部', 3, 150000],
          ['法務部', 0, null],
        ] },
      },
      {
        id: 'recursive-counter', title: '遞迴 CTE 的骨架：產生 1 到 5', dataset: 'company',
        description: '起點產生 1；遞迴部分從上一批的 x 算出 x + 1；x 到 5 時 WHERE x < 5 不成立，沒有新的列，遞迴結束。這個查詢不讀任何資料表。',
        sql: sql`WITH RECURSIVE n(x) AS (
  SELECT 1
  UNION ALL
  SELECT x + 1 FROM n WHERE x < 5
)
SELECT x FROM n;`,
        result: { columns: ['x'], rows: [[1], [2], [3], [4], [5]] },
      },
      {
        id: 'org-chart', title: '遞迴 CTE：組織圖的層級與主管鏈', dataset: 'company',
        description: '起點是沒有主管的林志明；每一輪找出主管在上一批裡的員工，層級加 1、路徑接上自己的姓名。依路徑排序，每位主管排在自己團隊的前面。',
        sql: sql`WITH RECURSIVE chain(id, name, level, path) AS (
  SELECT id, name, 1, name
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, c.level + 1, c.path || ' > ' || e.name
  FROM employees e
  JOIN chain c ON e.manager_id = c.id
)
SELECT id, name, level, path
FROM chain
ORDER BY path;`,
        result: { columns: ['id', 'name', 'level', 'path'], rows: [
          [1, '林志明', 1, '林志明'],
          [7, '吳承翰', 2, '林志明 > 吳承翰'],
          [9, '劉建宏', 3, '林志明 > 吳承翰 > 劉建宏'],
          [12, '周怡君', 3, '林志明 > 吳承翰 > 周怡君'],
          [8, '蔡佩君', 3, '林志明 > 吳承翰 > 蔡佩君'],
          [10, '鄭美玲', 2, '林志明 > 鄭美玲'],
          [11, '許文彬', 3, '林志明 > 鄭美玲 > 許文彬'],
          [2, '陳雅惠', 2, '林志明 > 陳雅惠'],
          [4, '張家瑜', 3, '林志明 > 陳雅惠 > 張家瑜'],
          [5, '李冠宇', 3, '林志明 > 陳雅惠 > 李冠宇'],
          [3, '王俊傑', 3, '林志明 > 陳雅惠 > 王俊傑'],
          [6, '黃淑芬', 4, '林志明 > 陳雅惠 > 王俊傑 > 黃淑芬'],
        ] },
      },
      {
        id: 'rank-compare', title: 'ROW_NUMBER、RANK、DENSE_RANK 並排', dataset: 'company',
        description: '三個排名都依部門分割、依月薪由高到低。同分（研發部兩位 72000、業務部兩位 61000）時三者不同；ROW_NUMBER 另外加上員工編號當平手規則。',
        sql: sql`SELECT d.name AS department, e.name, e.salary,
  ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC, e.id) AS row_num,
  RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rnk,
  DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS dense_rnk
FROM employees e
JOIN departments d ON d.id = e.dept_id
ORDER BY e.dept_id, e.salary DESC, e.id;`,
        result: { columns: ['department', 'name', 'salary', 'row_num', 'rnk', 'dense_rnk'], rows: [
          ['研發部', '陳雅惠', 98000, 1, 1, 1],
          ['研發部', '王俊傑', 72000, 2, 2, 2],
          ['研發部', '張家瑜', 72000, 3, 2, 2],
          ['研發部', '李冠宇', 65000, 4, 4, 3],
          ['研發部', '黃淑芬', 58000, 5, 5, 4],
          ['業務部', '吳承翰', 85000, 1, 1, 1],
          ['業務部', '蔡佩君', 61000, 2, 2, 2],
          ['業務部', '劉建宏', 61000, 3, 2, 2],
          ['業務部', '周怡君', 52000, 4, 4, 3],
          ['行政部', '林志明', 150000, 1, 1, 1],
          ['行政部', '鄭美玲', 54000, 2, 2, 2],
          ['行政部', '許文彬', 47000, 3, 3, 3],
        ] },
      },
      {
        id: 'latest-hire', title: '先排名、再篩選：每個部門最近到職的人', dataset: 'company',
        description: 'CTE 裡用 ROW_NUMBER 依到職日由新到舊編號，外層 WHERE rn = 1 只留下每個部門的第一位。視窗函式不能直接寫在 WHERE。',
        sql: sql`WITH ranked AS (
  SELECT d.name AS department, e.name, e.hired_on,
    ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.hired_on DESC, e.id) AS rn
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT department, name, hired_on
FROM ranked
WHERE rn = 1
ORDER BY hired_on DESC;`,
        result: { columns: ['department', 'name', 'hired_on'], rows: [
          ['行政部', '許文彬', '2025-02-17'],
          ['業務部', '周怡君', '2024-06-03'],
          ['研發部', '黃淑芬', '2024-01-08'],
        ] },
      },
      {
        id: 'running-payroll', title: '累計值：依到職日累計部門月薪總額', dataset: 'company',
        description: 'SUM 當視窗函式用，OVER 裡依到職日排序，算出每個部門從第一位員工到這一位的月薪總和；換部門時重新累計。',
        sql: sql`SELECT dept_id, name, hired_on, salary,
  SUM(salary) OVER (PARTITION BY dept_id ORDER BY hired_on) AS running_payroll
FROM employees
ORDER BY dept_id, hired_on;`,
        result: { columns: ['dept_id', 'name', 'hired_on', 'salary', 'running_payroll'], rows: [
          [1, '陳雅惠', '2016-05-16', 98000, 98000],
          [1, '王俊傑', '2019-08-01', 72000, 170000],
          [1, '張家瑜', '2020-03-02', 72000, 242000],
          [1, '李冠宇', '2022-07-11', 65000, 307000],
          [1, '黃淑芬', '2024-01-08', 58000, 365000],
          [2, '吳承翰', '2017-09-18', 85000, 85000],
          [2, '蔡佩君', '2021-04-12', 61000, 146000],
          [2, '劉建宏', '2023-10-02', 61000, 207000],
          [2, '周怡君', '2024-06-03', 52000, 259000],
          [3, '林志明', '2012-02-01', 150000, 150000],
          [3, '鄭美玲', '2018-11-05', 54000, 204000],
          [3, '許文彬', '2025-02-17', 47000, 251000],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-no-reports', title: 'NOT EXISTS：沒有直屬部屬的員工',
        statement: '找出沒有任何直屬部屬的員工，也就是沒有任何一位員工的 `manager_id` 指向他。結果欄位依序為員工編號 `id`、姓名 `name`、所屬部門名稱 `department`，順序不拘。請用子查詢寫（`NOT EXISTS` 或 `NOT IN`），寫完再想想 `LEFT JOIN` 反合併的寫法。',
        dataset: 'company', hidden: ['company-b'], ordered: false, columnNames: true,
        starter: sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE NOT EXISTS (
  SELECT 1 FROM employees r WHERE ...
);`,
        hints: [
          '「沒有人的主管是 e」：子查詢找 `manager_id` 等於外層 `e.id` 的員工，一位都找不到時 `NOT EXISTS` 為真。',
          '子查詢裡的外層欄位一定要寫外層的別名：寫成 `r.manager_id = id` 時，`id` 會被當成內層的 `r.id`。',
          '如果用 `NOT IN (SELECT manager_id FROM employees)`，最高主管的 `manager_id` 是 NULL，結果會變成 0 列；要在子查詢裡加上 `WHERE manager_id IS NOT NULL`。',
        ],
        solution: sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE NOT EXISTS (
  SELECT 1 FROM employees r WHERE r.manager_id = e.id
);`,
        alternatives: [
          sql`SELECT id, name,
  (SELECT d.name FROM departments d WHERE d.id = employees.dept_id) AS department
FROM employees
WHERE id NOT IN (SELECT manager_id FROM employees WHERE manager_id IS NOT NULL);`,
          sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
LEFT JOIN employees r ON r.manager_id = e.id
WHERE r.id IS NULL;`,
        ],
        mistakes: [
          { sql: sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE e.id NOT IN (SELECT manager_id FROM employees);`, why: '子查詢的清單裡有最高主管的 NULL：`e.id NOT IN (…, NULL)` 對每一列都是假或未知，結果是 0 列。改用 `NOT EXISTS`，或在子查詢加上 `WHERE manager_id IS NOT NULL`。' },
          { sql: sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE NOT EXISTS (
  SELECT 1 FROM employees r WHERE r.manager_id = id
);`, why: '子查詢裡的 `id` 沒寫表名，被解析成內層的 `r.id`：條件變成「r 是自己的主管」，永遠不成立，所以每位員工都通過，主管也被列出來了。外層的欄位要寫成 `e.id`。' },
          { sql: sql`SELECT e.id, e.name, d.name AS department
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE NOT EXISTS (
  SELECT 1 FROM employees m WHERE m.id = e.manager_id
);`, why: '方向反了：`m.id = e.manager_id` 找的是 e 的主管，`NOT EXISTS` 留下的是「沒有主管」的最高主管，而不是「沒有部屬」的員工。要找的是「有沒有人的 `manager_id` 是 e」。' },
        ],
      },
      {
        id: 'ex-top3-per-dept', title: '視窗函式：每個部門薪資前三名',
        statement: '列出每個部門薪資前三名的員工。名次這樣算：在同一部門內依月薪由高到低排，月薪相同的人名次相同，下一個不同的月薪名次只加 1、不跳號（例如 98000、72000、72000、65000 的名次是 1、2、2、3）；列出名次為 1、2、3 的所有員工，同分的人全部列出。結果欄位依序為 `department`（部門名稱）、`name`（員工姓名）、`salary`（月薪）、`salary_rank`（名次），依部門編號、名次、員工編號由小到大排列。沒有員工的部門不列出。',
        dataset: 'company', hidden: ['company-b'], ordered: true, columnNames: true,
        starter: sql`WITH ranked AS (
  SELECT d.id AS dept_id, d.name AS department, e.id, e.name, e.salary,
    ... OVER (PARTITION BY ... ORDER BY ...) AS salary_rank
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT department, name, salary, salary_rank
FROM ranked
WHERE ...
ORDER BY ...;`,
        hints: [
          '同分同名次、不跳號是 `DENSE_RANK()`；`RANK()` 會跳號（1、2、2、4），`ROW_NUMBER()` 則同分也給不同號碼。',
          '「在同一部門內」是 `PARTITION BY e.dept_id`，「月薪由高到低」是 `OVER` 裡的 `ORDER BY e.salary DESC`。',
          '視窗函式不能寫在 `WHERE`：先在 CTE 裡算出 `salary_rank`，外層再 `WHERE salary_rank <= 3`，最後 `ORDER BY dept_id, salary_rank, id`。',
        ],
        solution: sql`WITH ranked AS (
  SELECT d.id AS dept_id, d.name AS department, e.id, e.name, e.salary,
    DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS salary_rank
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT department, name, salary, salary_rank
FROM ranked
WHERE salary_rank <= 3
ORDER BY dept_id, salary_rank, id;`,
        alternatives: [
          sql`SELECT department, name, salary, salary_rank
FROM (
  SELECT e.dept_id, e.id, d.name AS department, e.name, e.salary,
    DENSE_RANK() OVER (PARTITION BY d.id ORDER BY e.salary DESC) AS salary_rank
  FROM departments d
  JOIN employees e ON e.dept_id = d.id
) AS ranked
WHERE salary_rank <= 3
ORDER BY dept_id, salary_rank, id;`,
          sql`SELECT d.name AS department, e.name, e.salary,
  (SELECT COUNT(DISTINCT x.salary) FROM employees x
    WHERE x.dept_id = e.dept_id AND x.salary > e.salary) + 1 AS salary_rank
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE (SELECT COUNT(DISTINCT x.salary) FROM employees x
    WHERE x.dept_id = e.dept_id AND x.salary > e.salary) < 3
ORDER BY d.id, salary_rank, e.id;`,
        ],
        mistakes: [
          { sql: sql`WITH ranked AS (
  SELECT d.id AS dept_id, d.name AS department, e.id, e.name, e.salary,
    RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS salary_rank
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT department, name, salary, salary_rank
FROM ranked
WHERE salary_rank <= 3
ORDER BY dept_id, salary_rank, id;`, why: '`RANK()` 在同分後跳號：研發部是 1、2、2、4，月薪 65000 的人名次是 4 而被濾掉。題目規定不跳號（他應該是第 3 名），要用 `DENSE_RANK()`。' },
          { sql: sql`WITH ranked AS (
  SELECT d.id AS dept_id, d.name AS department, e.id, e.name, e.salary,
    DENSE_RANK() OVER (ORDER BY e.salary DESC) AS salary_rank
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT department, name, salary, salary_rank
FROM ranked
WHERE salary_rank <= 3
ORDER BY dept_id, salary_rank, id;`, why: '少了 `PARTITION BY`，名次變成全公司一起排：只剩全公司月薪最高的三個等級，大部分部門的人都不見了。「每個部門」要寫 `PARTITION BY e.dept_id`。' },
          { sql: sql`SELECT d.name AS department, e.name, e.salary,
  DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS salary_rank
FROM employees e
JOIN departments d ON d.id = e.dept_id
WHERE DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) <= 3
ORDER BY d.id, salary_rank, e.id;`, why: '視窗函式在 `WHERE` 之後才計算，不能用來篩選，SQLite 回報 `misuse of window function DENSE_RANK()`。先在 CTE 或衍生表裡算出名次，再由外層的 `WHERE` 篩選。' },
        ],
      },
      {
        id: 'ex-team-size', title: '遞迴 CTE：每位主管底下的總人數',
        statement: '計算每位主管底下的部屬總數，直接與間接部屬都算（部屬的部屬、再下一層，全部都算）。只列出至少有一位部屬的員工。結果欄位依序為 `name`（主管姓名）、`team_size`（部屬總數），依 `team_size` 由大到小排列，相同時依員工編號由小到大。',
        dataset: 'company', hidden: ['company-b'], ordered: true, columnNames: true,
        starter: sql`WITH RECURSIVE under(boss_id, emp_id) AS (
  SELECT manager_id, id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT ...
  FROM under u
  JOIN employees e ON ...
)
SELECT b.name, COUNT(*) AS team_size
FROM under u
JOIN employees b ON b.id = u.boss_id
GROUP BY b.id, b.name
ORDER BY ...;`,
        hints: [
          '把「主管與他底下的某個人」當成一列 `(boss_id, emp_id)`。起點是直屬關係：每位有主管的員工產生 `(manager_id, id)`。',
          '遞迴部分往下一層：已知 `emp_id` 在 boss 底下，那麼直屬於 `emp_id` 的人也在 boss 底下，條件是 `e.manager_id = u.emp_id`，新的一列是 `(u.boss_id, e.id)`。走到沒有部屬的人時找不到新列，遞迴自然結束。',
          '最後依 `boss_id` 分組數列數，接上 `employees` 取主管姓名，`ORDER BY team_size DESC, b.id`。',
        ],
        solution: sql`WITH RECURSIVE under(boss_id, emp_id) AS (
  SELECT manager_id, id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT u.boss_id, e.id
  FROM under u
  JOIN employees e ON e.manager_id = u.emp_id
)
SELECT b.name, COUNT(*) AS team_size
FROM under u
JOIN employees b ON b.id = u.boss_id
GROUP BY b.id, b.name
ORDER BY team_size DESC, b.id;`,
        alternatives: [
          sql`WITH RECURSIVE up(emp_id, boss_id) AS (
  SELECT id, manager_id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT u.emp_id, m.manager_id
  FROM up u
  JOIN employees m ON m.id = u.boss_id
  WHERE m.manager_id IS NOT NULL
)
SELECT b.name, COUNT(*) AS team_size
FROM up u
JOIN employees b ON b.id = u.boss_id
GROUP BY b.id, b.name
ORDER BY team_size DESC, b.id;`,
          sql`WITH RECURSIVE tree(root_id, member_id) AS (
  SELECT id, id FROM employees
  UNION ALL
  SELECT t.root_id, e.id
  FROM tree t
  JOIN employees e ON e.manager_id = t.member_id
)
SELECT r.name, COUNT(*) - 1 AS team_size
FROM tree t
JOIN employees r ON r.id = t.root_id
GROUP BY r.id, r.name
HAVING COUNT(*) > 1
ORDER BY team_size DESC, r.id;`,
        ],
        mistakes: [
          { sql: sql`SELECT m.name, COUNT(*) AS team_size
FROM employees e
JOIN employees m ON m.id = e.manager_id
GROUP BY m.id, m.name
ORDER BY team_size DESC, m.id;`, why: '一個自我合併只找得到直屬部屬：最高主管只算到 3 人，部屬的部屬都沒算進去。層數不固定時要用遞迴 CTE 一層一層往下走。' },
          { sql: sql`WITH RECURSIVE under(boss_id, emp_id) AS (
  SELECT id, id FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT u.boss_id, e.id
  FROM under u
  JOIN employees e ON e.manager_id = u.emp_id
)
SELECT b.name, COUNT(*) - 1 AS team_size
FROM under u
JOIN employees b ON b.id = u.boss_id
GROUP BY b.id, b.name
ORDER BY team_size DESC, b.id;`, why: '照抄組織圖的起點 `manager_id IS NULL`，整個遞迴只從最高主管出發，`boss_id` 一路都是他，所以結果只有一列。每位主管都要當一次起點：從所有直屬關係出發。' },
          { sql: sql`WITH RECURSIVE tree(root_id, member_id) AS (
  SELECT id, id FROM employees
  UNION ALL
  SELECT t.root_id, e.id
  FROM tree t
  JOIN employees e ON e.manager_id = t.member_id
)
SELECT r.name, COUNT(*) AS team_size
FROM tree t
JOIN employees r ON r.id = t.root_id
GROUP BY r.id, r.name
HAVING COUNT(*) > 1
ORDER BY team_size DESC, r.id;`, why: '起點 `(id, id)` 把每個人自己也放進了自己的團隊，`COUNT(*)` 多算了主管本人，每個數字都多 1。要寫 `COUNT(*) - 1`，或從直屬關係開始遞迴。' },
        ],
      },
    ],
  },
};
