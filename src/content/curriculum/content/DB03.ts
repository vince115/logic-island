import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB03 Querying with SELECT. SQL lesson (Phase F.1a): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB03: LessonContent = {
  lessonId: 'DB03',
  motivation: '前兩課你已經會用 `SELECT … FROM` 取出整張表，也用 `WHERE class = \'乙\'` 預覽過篩選。真實的需求很少這麼單純：「CS 開頭的課裡，不及格或還沒評分的紀錄」、「學分最多的前三門課，同分照代碼排」、「第 2 頁的學生名單」。這一課把一個查詢補齊成完整的形狀：在 `SELECT` 清單裡算出新欄位並取別名，用比較運算、`AND`／`OR`／`NOT`、`IN`、`BETWEEN`、`LIKE` 寫出精確的條件，用 `ORDER BY`、`LIMIT`、`DISTINCT` 排序並裁切結果。你也會遇到 SQL 最常讓人出錯的地方：NULL。條件碰到 NULL 時答案不是真也不是假，而是「未知」，F06 學過的布林邏輯在這裡多了第三個值；不懂這一點，`score < 60` 就會悄悄漏掉還沒評分的學生。學完後，你能把一段文字需求拆成「哪張表、留下哪些列、要哪些欄位、怎麼排、要幾筆」，寫出結果正確而且穩定的查詢。',
  sections: [
    {
      id: 'select-list', title: 'SELECT 清單：欄位、運算式與別名',
      blocks: [
        { type: 'p', text: 'DB01 說過，`SELECT` 後面列出結果要有哪些欄位、順序為何。清單裡不只能寫欄位名稱，也能寫運算式：每一列都會算一次，算出的值成為結果的一欄。運算式的欄位預設以運算式本身命名（例如 `credits * 18`），用 `AS` 取一個別名（alias）就好讀多了。下面假設每學分一學期上 18 小時，算出每門課的時數：' },
        { type: 'example', id: 'course-hours' },
        { type: 'list', items: [
          '算術運算 `+`、`-`、`*`、`/`、`%` 都能用。兩個整數相除是整數除法：`5 / 2` 得到 2，要小數就寫 `5 / 2.0`（得到 2.5）。',
          '文字用 `||` 串接，這是標準 SQL 的寫法：`name || \'（\' || class || \'班）\'`。MySQL 預設把 `||` 當成「或」，要改用 `CONCAT()`。',
          '`AS` 可以省略（`credits * 18 hours` 也行），但寫出來比較清楚，不容易和「少打一個逗號」混淆：`SELECT title credits FROM courses` 其實是把 `title` 取別名為 `credits`，結果只有一欄。',
          '別名只改結果的欄位名稱，不會改動表裡的資料，也不會新增欄位到表中。',
          '算術運算或 `||` 的任何一個運算元是 NULL，結果就是 NULL：沒有成績的紀錄，`score + 5` 仍然是 NULL。',
        ] },
      ],
    },
    {
      id: 'where-logic', title: 'WHERE：比較運算與 AND、OR、NOT',
      blocks: [
        { type: 'p', text: '`WHERE` 對 `FROM` 取來的每一列算一次條件，只留下條件為真的列。最基本的條件是比較運算：' },
        { type: 'table', head: ['運算子', '意思', '例子'], rows: [
          ['`=`', '等於（標準 SQL 只用一個等號）', '`class = \'甲\'`'],
          ['`<>` 或 `!=`', '不等於；`<>` 是標準寫法，SQLite 也接受 `!=`', '`course_id <> \'CS101\'`'],
          ['`<`、`<=`、`>`、`>=`', '小於、小於等於、大於、大於等於', '`score >= 60`'],
        ] },
        { type: 'p', text: '多個條件用 `AND`（且）、`OR`（或）、`NOT`（非）組合，意思和 F06 的 `&&`、`||`、`!` 相同。優先順序也相同：`NOT` 最高，其次 `AND`，最後 `OR`。要找「甲班或乙班，而且是 11 年級以上」，「或」的部分必須加括號：' },
        { type: 'example', id: 'class-and-grade' },
        { type: 'callout', tone: 'warning', title: '少了括號，條件就變了', text: '寫成 `WHERE class = \'甲\' OR class = \'乙\' AND grade >= 11`，`AND` 先結合，DBMS 讀成 `class = \'甲\' OR (class = \'乙\' AND grade >= 11)`：甲班不論年級全部入選，結果多了 10 年級的王小明與李佳穎，共 5 列。在練習場兩種都跑一次比較看看。混用 `AND` 與 `OR` 時，一律用括號寫出你要的分組。' },
        { type: 'p', text: 'F06 的德摩根定律在 SQL 照樣成立：`NOT (class = \'甲\' OR grade = 10)` 和 `class <> \'甲\' AND grade <> 10` 結果相同，都是「不是甲班，而且也不是 10 年級」。' },
        { type: 'callout', tone: 'note', title: 'SQL 不保證短路求值的順序', text: 'F06 的程式語言保證 `&&` 從左算到右，所以可以用左邊的條件「保護」右邊。標準 SQL 沒有規定 `AND` 兩邊誰先算，DBMS 的最佳化器可以重排條件。SQL 的條件應該寫成「不論先算哪一邊，結果都對」。' },
      ],
    },
    {
      id: 'in-between-like', title: 'IN、BETWEEN 與 LIKE',
      blocks: [
        { type: 'p', text: '三種常見條件有專用的寫法，比一長串 `OR` 或兩個比較更好讀：' },
        { type: 'list', items: [
          '`IN`：值等於清單中任一個。`class IN (\'甲\', \'乙\')` 等於 `class = \'甲\' OR class = \'乙\'`，上一節的條件可以寫成 `class IN (\'甲\', \'乙\') AND grade >= 11`，連括號都省了。`NOT IN` 是「不等於清單中的每一個」。',
          '`BETWEEN a AND b`：包含兩端點的範圍，等於 `x >= a AND x <= b`。`score BETWEEN 80 AND 90` 會包含 80 與 90；小的值要寫在前面，`BETWEEN 90 AND 80` 一列都不會符合。`NOT BETWEEN` 是範圍以外。',
          '`LIKE`：文字樣式比對。`%` 代表任意長度（包括 0 個）的任意字元，`_` 剛好代表一個字元；一個中文字也算一個字元，所以 `title LIKE \'_料%\'` 會找到「資料結構」與「資料庫概論」。`NOT LIKE` 則相反。',
        ] },
        { type: 'p', text: '找出 email 以 `ji` 開頭的學生：' },
        { type: 'example', id: 'like-email' },
        { type: 'callout', tone: 'warning', title: 'SQLite 的 LIKE 不分英文大小寫', text: '在 SQLite 裡 `email LIKE \'JI%\'` 也會找到這兩位：SQLite 的 `LIKE` 對 ASCII 英文字母不分大小寫（對 `é`、`É` 這類非 ASCII 字母則會區分）。PostgreSQL 的 `LIKE` 區分大小寫，不分大小寫要改用它特有的 `ILIKE`。`=` 則區分大小寫：要比對「完全相同」的值就用 `=`，不要用沒有萬用字元的 `LIKE`。' },
        { type: 'p', text: '要比對字面上的 `%` 或 `_`，用 `ESCAPE` 指定跳脫字元，例如 `LIKE \'%!_%\' ESCAPE \'!\'` 找出含有底線的文字。另外注意：陳志豪與黃雅婷的 email 是 NULL，他們既不在 `LIKE \'ji%\'` 的結果裡，也不在 `NOT LIKE \'ji%\'` 的結果裡。下一節說明為什麼。' },
      ],
    },
    {
      id: 'null-logic', title: 'NULL 與三值邏輯',
      blocks: [
        { type: 'p', text: 'NULL 表示「沒有值」或「未知」。拿一個未知的值去比較，答案也只能是未知：還沒評分的成績，是不是低於 60？不知道。所以 SQL 的條件有三個可能的值：TRUE、FALSE 與 UNKNOWN，這叫三值邏輯（three-valued logic）。`score < 60`、`score = 90`、`score <> 90`，甚至 `NULL = NULL`，只要有一邊是 NULL，結果都是 UNKNOWN。F06 的布林運算多了這個值以後是這樣：' },
        { type: 'table', head: ['p', 'q', 'p AND q', 'p OR q'], rows: [
          ['TRUE', 'UNKNOWN', 'UNKNOWN', 'TRUE'],
          ['FALSE', 'UNKNOWN', 'FALSE', 'UNKNOWN'],
          ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
        ] },
        { type: 'p', text: '規則很好記：結果已經確定的就確定（`FALSE AND` 任何值都是 FALSE，`TRUE OR` 任何值都是 TRUE），否則就是 UNKNOWN；`NOT UNKNOWN` 仍是 UNKNOWN。關鍵在最後一步：`WHERE` 只留下條件為 TRUE 的列，FALSE 和 UNKNOWN 都被丟掉。後果是：' },
        { type: 'list', items: [
          '`WHERE score < 60` 不會回傳還沒評分的紀錄，`WHERE score <> 90` 也不會：14 筆選課紀錄裡，`<> 90` 只回傳 11 筆，90 分那筆和 2 筆 NULL 都不在裡面。',
          '`WHERE score < 60 OR score >= 60` 看起來涵蓋所有情況，結果卻只有 12 筆：對 NULL 而言兩邊都是 UNKNOWN。「不是真就是假」在 SQL 不成立。',
          '`NOT (score >= 60)` 也不會撈出 NULL：`NOT UNKNOWN` 還是 UNKNOWN。',
          '`WHERE email = NULL` 永遠是 0 列，因為任何值和 NULL 比較都是 UNKNOWN。判斷 NULL 要用 `IS NULL`、`IS NOT NULL`，它們只回答 TRUE 或 FALSE。',
        ] },
        { type: 'p', text: '所以需求包含「沒有值」的列時，要把 NULL 明確寫進條件。例如「不是周老師教的課」，藝術欣賞還沒有指定老師，當然也不是周老師教的；只寫 `teacher <> \'周老師\'` 會漏掉它（在練習場試試，只有 2 列），要加上 `OR teacher IS NULL`：' },
        { type: 'example', id: 'null-teacher' },
        { type: 'callout', tone: 'warning', title: 'NOT IN 的清單裡有 NULL，結果是 0 列', text: '`x NOT IN (a, b)` 等於 `x <> a AND x <> b`。清單裡只要有一個 NULL，`x <> NULL` 就是 UNKNOWN，整個 `AND` 不可能是 TRUE：`WHERE teacher NOT IN (\'周老師\', NULL)` 一列都不會回傳。`IN` 的清單有 NULL 則較無害：`x IN (1, NULL)` 在 x 是 1 時仍為 TRUE。之後的課程用子查詢產生清單時，這個陷阱最常出現，因為清單裡有沒有 NULL 不容易一眼看出。' },
        { type: 'callout', tone: 'note', title: '把 NULL 當成一般值來比較', text: '標準 SQL 的 `a IS DISTINCT FROM b` 把兩個 NULL 視為相同、把 NULL 和非 NULL 視為不同，永遠只回答 TRUE 或 FALSE；SQLite 3.39 起支援這個寫法，也一直支援意思相同的 `a IS NOT b`。`teacher IS DISTINCT FROM \'周老師\'` 和上面的例子結果相同。`COALESCE(score, 0)` 則在 score 是 NULL 時改用 0，但只有在「未評分當 0 分」符合需求時才這樣寫。' },
      ],
    },
    {
      id: 'order-by', title: 'ORDER BY：排序與 NULL 的位置',
      blocks: [
        { type: 'p', text: '沒有 `ORDER BY` 時，SQL 不保證列的順序，同一個查詢換一份資料、建了索引或換了 DBMS，順序都可能不同。需要順序就寫 `ORDER BY`：' },
        { type: 'list', items: [
          '`ASC` 遞增（預設，可省略），`DESC` 遞減。方向是每個排序鍵各自指定的：`ORDER BY credits DESC, id` 是「學分由多到少，學分相同時代碼由小到大」，`id` 不會跟著變成遞減。',
          '可以寫好幾個排序鍵：先比第一個，相同時才比第二個，依此類推。',
          '可以用 `SELECT` 清單裡的別名排序，例如 `ORDER BY hours DESC`。',
          '文字依字元的編碼大小比較（SQLite 預設的 `BINARY` 定序）。中文不是依筆畫、注音或天干順序：丙是 U+4E19、乙是 U+4E59、甲是 U+7532，所以 `ORDER BY class` 得到丙、乙、甲。',
        ] },
        { type: 'p', text: 'NULL 排在哪裡沒有寫進標準，由各 DBMS 決定：' },
        { type: 'table', head: ['DBMS', '`ORDER BY score`（遞增）', '`ORDER BY score DESC`'], rows: [
          ['SQLite、MySQL、SQL Server', 'NULL 在最前面（視為最小）', 'NULL 在最後面'],
          ['PostgreSQL、Oracle', 'NULL 在最後面（視為最大）', 'NULL 在最前面'],
        ] },
        { type: 'p', text: '要明確指定時寫 `ORDER BY score NULLS LAST` 或 `NULLS FIRST`；PostgreSQL、Oracle 與 SQLite 3.30 起都支援。在練習場執行 `SELECT * FROM enrollments ORDER BY score;`，最前面兩列就是還沒評分的紀錄。' },
      ],
    },
    {
      id: 'limit-offset', title: 'LIMIT 與 OFFSET：前 N 名與分頁',
      blocks: [
        { type: 'p', text: '`LIMIT n` 只取前 n 列，`OFFSET m` 先跳過 m 列。「前 N 名」一定要先用 `ORDER BY` 定出順序，否則「前」沒有意義，只是 DBMS 剛好先讀到的 n 列。下面列出年級最高的 3 位學生：' },
        { type: 'example', id: 'top-grade' },
        { type: 'p', text: '注意第二個排序鍵 `id`。12 年級只有吳承恩與蔡宜蓁，第 3 名要從 3 位 11 年級學生裡選，如果只寫 `ORDER BY grade DESC`，選中誰沒有保證，今天是林怡君，明天可能是黃雅婷。加上一個不會重複的次要排序鍵（通常是主鍵），排序就是全序（total order），結果每次都一樣。' },
        { type: 'list', items: [
          '分頁：每頁 k 列的第 p 頁是 `LIMIT k OFFSET (p - 1) * k`。上例改成 `LIMIT 3 OFFSET 3` 就是第 2 頁（張家豪、黃雅婷、王小明）。分頁同樣需要全序，否則同一列可能在兩頁都出現，或哪一頁都看不到。',
          '標準 SQL 的寫法是 `OFFSET 3 ROWS FETCH FIRST 3 ROWS ONLY`，PostgreSQL、Oracle、SQL Server 支援；SQLite 不支援，只有 `LIMIT`。PostgreSQL 與 MySQL 也有 `LIMIT`，SQL Server 另有 `SELECT TOP 3`。',
        ] },
        { type: 'callout', tone: 'warning', title: '`LIMIT 3, 2` 的第一個數字是 OFFSET', text: 'SQLite 和 MySQL 接受 `LIMIT 3, 2` 這種逗號寫法，意思是「跳過 3 列、取 2 列」，等於 `LIMIT 2 OFFSET 3`，和直覺的順序相反。請用 `LIMIT … OFFSET …`，一眼就看得出哪個是哪個。' },
      ],
    },
    {
      id: 'distinct-and-evaluation-order', title: 'DISTINCT 與子句的邏輯執行順序',
      blocks: [
        { type: 'p', text: 'DB02 說過，SQL 的結果是多重集合，`SELECT DISTINCT` 才會去掉重複的列。`DISTINCT` 看的是整列：`SELECT DISTINCT class FROM students` 得到 3 列，`SELECT DISTINCT class, grade FROM students` 則是「班級與年級的組合」，得到 7 列（甲班 10 年級有王小明與李佳穎兩位，只算一列；甲班 11 年級是另一列）。比較特別的是，`DISTINCT` 把所有 NULL 視為相同：`SELECT DISTINCT teacher FROM courses` 只有一列 NULL。這和 `NULL = NULL` 是 UNKNOWN 不同，是「判斷是否重複」時的專門規則。' },
        { type: 'p', text: '一個完整的查詢寫的順序和 DBMS 邏輯上處理的順序不同。照邏輯順序想，很多規則就自然了：' },
        { type: 'table', head: ['邏輯順序', '子句', '這一步做什麼'], rows: [
          ['1', '`FROM`', '決定從哪張表取列'],
          ['2', '`WHERE`', '對每一列算條件，只留下 TRUE 的列'],
          ['3', '`SELECT`', '算出每一列要輸出的欄位與運算式，取別名'],
          ['4', '`DISTINCT`', '去掉完全相同的列'],
          ['5', '`ORDER BY`', '排序；這時別名已經存在，所以可以用'],
          ['6', '`LIMIT` / `OFFSET`', '最後才裁切，所以「前 N 名」是排好序以後的前 N 列'],
        ] },
        { type: 'p', text: '因為 `WHERE` 在 `SELECT` 之前，標準 SQL 不允許在 `WHERE` 使用 `SELECT` 清單的別名：`SELECT title, credits * 18 AS hours FROM courses WHERE hours > 50` 在 PostgreSQL 會回報欄位 hours 不存在，要寫成 `WHERE credits * 18 > 50`。SQLite 比較寬鬆，這個查詢在練習場可以執行，但它不是可攜的寫法，不要依賴。' },
        { type: 'p', text: '把文字需求變成查詢時，照這個順序一步步問：' },
        { type: 'list', ordered: true, items: [
          '資料在哪張表？（`FROM`）',
          '要留下哪些列？把每個條件寫成比較，想清楚「且」還是「或」，再問一次：欄位是 NULL 的列該不該出現？（`WHERE`）',
          '要哪些欄位、什麼順序、需不需要計算或別名？會不會有重複的列要去掉？（`SELECT`、`DISTINCT`）',
          '需不需要排序？排序鍵相同的列怎麼排？（`ORDER BY`，加上次要排序鍵）',
          '只要前幾筆或某一頁嗎？（`LIMIT`、`OFFSET`）',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-not-equal-null', prompt: '`school` 的 `enrollments` 有 14 筆紀錄：一筆 90 分，兩筆還沒評分（score 是 NULL），其餘都是其他分數。下面的查詢回傳幾列？',
      code: { language: 'SQL', text: 'SELECT student_id, course_id FROM enrollments WHERE score <> 90;' },
      options: ['13 列：只有 90 分那一列被排除', '14 列：`<>` 不會排除任何列', '11 列：90 分那一列與兩筆 NULL 都不在結果中', '12 列：只有兩筆 NULL 被排除'],
      answer: 2, explanation: '90 分那列的條件是 FALSE；兩筆 NULL 的 `NULL <> 90` 是 UNKNOWN，`WHERE` 只留下 TRUE，所以它們也被丟掉，剩 14 − 1 − 2 = 11 列。13 列是把 NULL 當成「不等於 90」；14 列忽略了 90 分那列確實不符合；12 列是只排除了 NULL，卻忘了 90 分那列本身也不符合。要連 NULL 一起列出，得寫 `score <> 90 OR score IS NULL`。',
    },
    {
      id: 'q-precedence', prompt: 'DBMS 會把下面的條件理解成哪一個？',
      code: { language: 'SQL', text: 'SELECT name FROM students\nWHERE class = \'甲\' OR class = \'乙\' AND grade >= 11;' },
      options: ['`(class = \'甲\' OR class = \'乙\') AND grade >= 11`', '`class = \'甲\' OR (class = \'乙\' AND grade >= 11)`', '語法錯誤，混用 AND 與 OR 一定要加括號', '依寫的順序由左到右：先算 OR，再算 AND'],
      answer: 1, explanation: '`AND` 的優先順序高於 `OR`（和 F06 的 `&&`、`||` 一樣），所以 `class = \'乙\' AND grade >= 11` 先結合，甲班學生不論年級都會入選。第一個選項是多數人「想要」的意思，但必須自己加括號才會這樣算；不加括號並不是語法錯誤，DBMS 照優先順序執行，這正是它危險的地方；SQL 也不是單純由左到右算。',
    },
    {
      id: 'q-between', prompt: '`WHERE score BETWEEN 60 AND 80` 和下面哪個條件意思相同？',
      options: ['`WHERE score > 60 AND score < 80`', '`WHERE score >= 60 AND score < 80`', '`WHERE score >= 60 OR score <= 80`', '`WHERE score >= 60 AND score <= 80`'],
      answer: 3, explanation: '`BETWEEN` 包含兩個端點，60 分與 80 分都符合。第一個選項排除了兩端，第二個排除了 80；第三個用了 `OR`，任何一個數字不是 ≥ 60 就是 ≤ 80，所以每個有分數的列都會符合，完全不是範圍。另外記得 `BETWEEN` 小的值在前，`BETWEEN 80 AND 60` 一列都不符合。',
    },
    {
      id: 'q-like-case', prompt: '在練習場（SQLite）的 `school` 資料上執行下面的查詢，結果是什麼？（資料裡的 email 都是小寫，例如林怡君是 `yijun@example.edu`、蔡宜蓁是 `yizhen@example.edu`）',
      code: { language: 'SQL', text: 'SELECT name FROM students WHERE email LIKE \'Y%\';' },
      options: ['林怡君與蔡宜蓁 2 列：SQLite 的 LIKE 對英文字母不分大小寫', '0 列：資料裡的 email 都是小寫', '出現錯誤：LIKE 的樣式必須是小寫', '6 列：`%` 符合任何有 email 的學生'],
      answer: 0, explanation: 'SQLite 的 `LIKE` 對 ASCII 英文字母不分大小寫，`\'Y%\'` 和 `\'y%\'` 效果相同，找到 email 以 y 開頭的 2 位學生。「0 列」是 PostgreSQL 的結果：它的 `LIKE` 區分大小寫，所以寫可攜的 SQL 時不要依賴這一點。樣式用大寫完全合法，不會出錯；`%` 前面還有 `Y`，所以只符合以 y 開頭的 email，不是全部 6 位有 email 的學生。',
    },
    {
      id: 'q-top-ties', prompt: '`school` 的課程學分為：微積分 4，程式設計（CS101）、資料結構（CS102）、資料庫概論（DB101）都是 3，藝術欣賞 2。下面查詢結果的第 2 列是哪門課？',
      code: { language: 'SQL', text: 'SELECT id, title FROM courses\nORDER BY credits DESC\nLIMIT 2;' },
      options: ['一定是 CS101，因為它的代碼最小', '一定是藝術欣賞', 'CS101、CS102、DB101 都有可能：三門課同為 3 學分，沒有次要排序鍵時 SQL 不保證誰在前', '出現錯誤：LIMIT 必須搭配 OFFSET'],
      answer: 2, explanation: '第 1 列一定是 4 學分的微積分，第 2 列要從三門 3 學分的課裡選，而排序鍵相同的列誰先誰後沒有保證。即使練習場現在剛好給 CS101，也不能依賴，要寫 `ORDER BY credits DESC, id` 才「一定是 CS101」。藝術欣賞只有 2 學分，排在最後；`OFFSET` 可以省略，省略就是從第一列開始。',
    },
    {
      id: 'q-not-in-null', prompt: '下面的查詢在 `school` 上回傳什麼？（周老師教程式設計與資料結構，資料庫概論是鄭老師、微積分是許老師，藝術欣賞的 teacher 是 NULL）',
      code: { language: 'SQL', text: 'SELECT title FROM courses\nWHERE teacher NOT IN (\'周老師\', NULL);' },
      options: ['資料庫概論、微積分、藝術欣賞', '0 列', '資料庫概論、微積分', '出現錯誤：IN 的清單不能有 NULL'],
      answer: 1, explanation: '`NOT IN (\'周老師\', NULL)` 等於 `teacher <> \'周老師\' AND teacher <> NULL`。`teacher <> NULL` 對每一列都是 UNKNOWN，所以整個條件最好也只是 UNKNOWN，沒有任何一列是 TRUE，結果 0 列。若清單裡沒有 NULL，結果才會是「資料庫概論、微積分」（藝術欣賞的 teacher 是 NULL，仍被排除）；要三門課都出現，得寫 `teacher <> \'周老師\' OR teacher IS NULL`。清單裡放 NULL 是合法語法，不會報錯。',
    },
    {
      id: 'q-null-sort', prompt: '在練習場（SQLite）的 `school` 資料上執行下面的查詢，會得到哪兩筆紀錄？（最低分是 58 與 67，另有兩筆 score 是 NULL）',
      code: { language: 'SQL', text: 'SELECT student_id, course_id, score FROM enrollments\nORDER BY score\nLIMIT 2;' },
      options: ['58 分與 67 分那兩筆：最低的兩個分數', '出現錯誤：有 NULL 的欄位不能排序', '95 分與 92 分那兩筆：最高的兩個分數', '兩筆 score 是 NULL 的紀錄：SQLite 在遞增排序時把 NULL 排在最前面'],
      answer: 3, explanation: 'SQLite 把 NULL 當成比任何值都小，遞增排序時 NULL 在最前面，`LIMIT 2` 就取到兩筆未評分的紀錄。要找「最低分的兩筆」，得先用 `WHERE score IS NOT NULL` 去掉 NULL（或寫 `ORDER BY score NULLS LAST`），才會是 58 與 67。有 NULL 的欄位可以正常排序，不會出錯；95、92 是遞減排序 `DESC` 的結果。在 PostgreSQL 預設 NULL 排在遞增的最後面，結果又不同，所以不要依賴預設位置。',
    },
  ],
  sql: {
    dataset: 'school',
    presets: [
      { label: '所有選課紀錄', sql: sql`SELECT * FROM enrollments;` },
      { label: '尚未評分', sql: sql`SELECT * FROM enrollments WHERE score IS NULL;` },
      { label: '80～90 分（含端點）', sql: sql`SELECT student_id, course_id, score
FROM enrollments
WHERE score BETWEEN 80 AND 90
ORDER BY score DESC, student_id, course_id;` },
      { label: '甲、乙班 11 年級以上', sql: sql`SELECT name, class, grade
FROM students
WHERE class IN ('甲', '乙') AND grade >= 11;` },
      { label: '成績排序（NULL 在哪）', sql: sql`SELECT student_id, course_id, score
FROM enrollments
ORDER BY score DESC, student_id, course_id;` },
      { label: 'NULL 的三值邏輯', sql: sql`SELECT NULL = NULL, NULL IS NULL, 1 IN (1, NULL), 2 NOT IN (1, NULL), NULL AND 0, NULL OR 1;` },
    ],
    examples: [
      {
        id: 'course-hours', title: '運算式與別名：每門課的時數', dataset: 'school',
        description: '`credits * 18` 對每一列各算一次；`AS hours` 讓這一欄叫 hours，而不是 `credits * 18`。',
        sql: sql`SELECT title, credits, credits * 18 AS hours
FROM courses;`,
        result: { columns: ['title', 'credits', 'hours'], rows: [
          ['程式設計', 3, 54], ['資料結構', 3, 54], ['資料庫概論', 3, 54], ['微積分', 4, 72], ['藝術欣賞', 2, 36],
        ] },
      },
      {
        id: 'class-and-grade', title: '用括號分組：甲班或乙班，且 11 年級以上', dataset: 'school',
        description: '括號讓 `OR` 先結合，再和 `grade >= 11` 做 `AND`；10 年級的學生全部被排除。',
        sql: sql`SELECT name, class, grade
FROM students
WHERE (class = '甲' OR class = '乙') AND grade >= 11;`,
        result: { columns: ['name', 'class', 'grade'], rows: [['林怡君', '乙', 11], ['張家豪', '甲', 11], ['蔡宜蓁', '乙', 12]] },
      },
      {
        id: 'like-email', title: 'LIKE：email 以 ji 開頭', dataset: 'school',
        description: '`\'ji%\'` 表示「以 ji 開頭，後面接任意字元」。email 是 NULL 的兩位學生，`LIKE` 的結果是 UNKNOWN，不會出現。',
        sql: sql`SELECT name, email
FROM students
WHERE email LIKE 'ji%';`,
        result: { columns: ['name', 'email'], rows: [['李佳穎', 'jiaying@example.edu'], ['張家豪', 'jiahao@example.edu']] },
      },
      {
        id: 'null-teacher', title: '把 NULL 寫進條件：不是周老師教的課', dataset: 'school',
        description: '只寫 `teacher <> \'周老師\'` 時，藝術欣賞的條件是 UNKNOWN 而被丟掉；加上 `OR teacher IS NULL` 它才會出現。',
        sql: sql`SELECT id, title, teacher
FROM courses
WHERE teacher <> '周老師' OR teacher IS NULL;`,
        result: { columns: ['id', 'title', 'teacher'], rows: [['DB101', '資料庫概論', '鄭老師'], ['MA101', '微積分', '許老師'], ['AR101', '藝術欣賞', null]] },
      },
      {
        id: 'top-grade', title: '前 N 名：年級最高的 3 位學生', dataset: 'school',
        description: '先依年級遞減排序，同年級再依 id 遞增，最後才取前 3 列；有了 `id` 這個次要排序鍵，第 3 名一定是林怡君。',
        sql: sql`SELECT id, name, grade
FROM students
ORDER BY grade DESC, id
LIMIT 3;`,
        result: { columns: ['id', 'name', 'grade'], rows: [[7, '吳承恩', 12], [8, '蔡宜蓁', 12], [4, '林怡君', 11]] },
      },
    ],
    exercises: [
      {
        id: 'ex-cs-attention', title: '程式類課程中需要關心的紀錄', dataset: 'school', hidden: ['school-b'], ordered: false,
        statement: '從 `enrollments` 找出課程代碼以 `CS` 開頭，而且成績低於 70 分或還沒評分（score 是 NULL）的選課紀錄。欄位依序為 `student_id`、`course_id`、`score`，列的順序不拘。不要把課程代碼一個個寫死：換一份資料，CS 開頭的課可能不同。',
        starter: 'SELECT student_id, course_id, score\nFROM enrollments\nWHERE ',
        hints: [
          '「以 CS 開頭」用 `course_id LIKE \'CS%\'`。',
          '「低於 70 分或還沒評分」是兩個條件的 `OR`；判斷 NULL 要用 `IS NULL`，不能用 `= NULL`。',
          '這個 `OR` 要和課程條件做 `AND`，記得用括號把 `OR` 的兩邊包起來。',
        ],
        solution: sql`SELECT student_id, course_id, score
FROM enrollments
WHERE course_id LIKE 'CS%' AND (score < 70 OR score IS NULL);`,
        alternatives: [
          sql`SELECT student_id, course_id, score
FROM enrollments
WHERE (score IS NULL OR score < 70) AND course_id LIKE 'CS%';`,
          sql`SELECT student_id, course_id, score
FROM enrollments
WHERE course_id LIKE 'CS%' AND COALESCE(score, 0) < 70;`,
        ],
        mistakes: [
          { sql: sql`SELECT student_id, course_id, score
FROM enrollments
WHERE course_id LIKE 'CS%' AND (score < 70 OR score = NULL);`, why: '`score = NULL` 永遠是 UNKNOWN，不會是 TRUE，所以還沒評分的紀錄（例如陳志豪的資料結構）被漏掉了。判斷 NULL 要寫 `score IS NULL`。' },
          { sql: sql`SELECT student_id, course_id, score
FROM enrollments
WHERE course_id LIKE 'CS%' AND score < 70 OR score IS NULL;`, why: '少了括號：`AND` 先結合，條件變成「(CS 開頭且低於 70) 或 (任何一門還沒評分的課)」，連 MA101 這類非 CS 課程的未評分紀錄也被選進來。' },
          { sql: sql`SELECT student_id, course_id, score
FROM enrollments
WHERE course_id LIKE 'CS%' AND NOT score >= 70;`, why: '「不是 70 分以上」看似包含了沒有成績的情況，但對 NULL 而言 `score >= 70` 是 UNKNOWN，`NOT UNKNOWN` 仍是 UNKNOWN，未評分的紀錄還是被丟掉。' },
        ],
      },
      {
        id: 'ex-top-credits', title: '學分最多的前 3 門課與時數', dataset: 'school', hidden: ['school-b'], ordered: true, columnNames: true,
        statement: '列出學分最多的前 3 門課。欄位依序為 `id`、`title`、`hours`，其中 `hours` 是學分乘以 18（每學分 18 小時），欄位名稱必須是 `hours`。依學分由多到少排列，學分相同時依課程代碼 `id` 由小到大排列，順序會被檢查。',
        starter: 'SELECT id, title, \nFROM courses\n',
        hints: [
          '時數是運算式 `credits * 18`，用 `AS hours` 取別名。',
          '`ORDER BY` 要有兩個排序鍵：先 `credits DESC`，再 `id`（遞增）。好幾門課學分相同，只靠 `credits` 排序，第 2、3 名是誰沒有保證。',
          '`LIMIT 3` 寫在 `ORDER BY` 後面：先排好，再取前 3 列。',
        ],
        solution: sql`SELECT id, title, credits * 18 AS hours
FROM courses
ORDER BY credits DESC, id
LIMIT 3;`,
        alternatives: [
          sql`SELECT id, title, credits * 18 AS hours
FROM courses
ORDER BY hours DESC, id ASC
LIMIT 3 OFFSET 0;`,
        ],
        mistakes: [
          { sql: sql`SELECT id, title, credits * 18
FROM courses
ORDER BY credits DESC, id
LIMIT 3;`, why: '列與順序都對，但沒有取別名，第三欄的名稱是 `credits * 18`，題目要求欄位名稱是 `hours`。' },
          { sql: sql`SELECT id, title, credits * 18 AS hours
FROM courses
ORDER BY credits DESC, title
LIMIT 3;`, why: '次要排序鍵用錯了：題目要同學分時依 `id` 排。用課名排序時，文字依字元編碼比較，「資料庫概論」排在「資料結構」前面，第 3 名就從 CS102 變成 DB101。' },
          { sql: sql`SELECT id, title, credits * 18 AS hours
FROM courses
ORDER BY credits, id
LIMIT 3;`, why: '`credits` 沒有寫 `DESC`，預設是遞增，取到的是學分最少的 3 門課。' },
        ],
      },
      {
        id: 'ex-email-groups', title: '有 email 的學生分布在哪些班級與年級', dataset: 'school', hidden: ['school-b'], ordered: false,
        statement: '找出有登記 email（email 不是 NULL）的學生分布在哪些「班級與年級」組合，每個組合只出現一次。欄位依序為 `class`、`grade`，列的順序不拘。',
        hints: [
          '條件是 email「有值」：`email IS NOT NULL`。',
          '同一班、同一年級可能有好幾位學生，用 `SELECT DISTINCT class, grade` 讓每個組合只留一列。',
        ],
        solution: sql`SELECT DISTINCT class, grade
FROM students
WHERE email IS NOT NULL;`,
        alternatives: [
          sql`SELECT DISTINCT class, grade
FROM students
WHERE NOT (email IS NULL);`,
          sql`SELECT DISTINCT class, grade
FROM students
WHERE email LIKE '%';`,
        ],
        mistakes: [
          { sql: sql`SELECT DISTINCT class, grade
FROM students
WHERE email <> NULL;`, why: '和 NULL 比較的結果永遠是 UNKNOWN，`WHERE` 一列都不留，得到 0 列。「不是 NULL」要寫 `email IS NOT NULL`。' },
          { sql: sql`SELECT class, grade
FROM students
WHERE email IS NOT NULL;`, why: '少了 `DISTINCT`：甲班 10 年級的王小明與李佳穎都有 email，這個組合出現了兩次。' },
          { sql: sql`SELECT DISTINCT class, grade
FROM students;`, why: '忘了 email 的條件：陳志豪（乙班 10 年級）與黃雅婷（丙班 11 年級）沒有 email，他們的組合不該出現，結果多了 2 列。' },
        ],
      },
    ],
  },
};
