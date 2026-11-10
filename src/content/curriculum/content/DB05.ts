import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB05 Multi-Table Queries with JOIN. SQL lesson (Phase F.1a): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB05: LessonContent = {
  lessonId: 'DB05',
  motivation: '真實的資料庫很少把所有東西塞進一張表：訂單只記顧客編號和商品編號，顧客姓名在 `customers`，單價在 `products`。要回答「誰買了什麼、花了多少錢」，就得把幾張表依外鍵接起來，這就是 `JOIN`。DB02 已經用 `FROM a, b WHERE …` 做過合併，本課換成專門的 `JOIN … ON` 語法，並往前多走幾步：用表別名把三張表的訂單報表寫得清楚；用 `LEFT JOIN` 把「沒有訂單的顧客」也留在結果裡，並說得出結果中每個 NULL 是從哪裡來的；用 `RIGHT`、`FULL OUTER JOIN` 比較未配對資料列的去留；把同一張表接上自己，查出每位顧客的推薦人；最後學會從列數一眼看出「漏了合併條件」的笛卡兒積錯誤。這個錯誤不會報錯，只會悄悄給你好幾倍的錯誤資料，報表一旦拿去做決策就很難收拾。',
  sections: [
    {
      id: 'join-on', title: '從逗號到 JOIN … ON',
      blocks: [
        { type: 'p', text: 'DB02 把合併寫成「`FROM` 列出兩張表，`WHERE` 寫外鍵等於主鍵」。同一件事用 SQL-92 的 `JOIN` 語法寫，合併條件改放在 `ON` 後面。兩種寫法對照：' },
        { type: 'table', head: ['寫法', 'SQL', '條件放在哪裡'], rows: [
          ['逗號（DB02）', '`SELECT … FROM orders, customers WHERE orders.customer_id = customers.id AND customers.city = \'台北\'`', '合併條件與篩選條件都擠在 `WHERE`'],
          ['`JOIN … ON`', '`SELECT … FROM orders JOIN customers ON orders.customer_id = customers.id WHERE customers.city = \'台北\'`', '合併條件在 `ON`，篩選條件在 `WHERE`'],
        ] },
        { type: 'p', text: '`JOIN` 是 `INNER JOIN`（內部合併）的簡寫：只留下兩邊配得上的列。對內部合併來說，兩種寫法的結果完全相同，條件放 `ON` 或 `WHERE` 也一樣。那為什麼還要學 `ON`？第一，每個 `JOIN` 緊跟著自己的條件，加入第三、第四張表時，哪張表還沒接上條件一眼就看得出來；第二，`WHERE` 只剩真正的篩選條件，讀查詢的人不必自己分辨哪些是「接表」、哪些是「挑資料」；第三，下一節以後的外部合併（`LEFT JOIN` 等）只能用 `ON` 表達，而且條件放在 `ON` 或 `WHERE` 會得到不同的結果。' },
        { type: 'p', text: '內部合併只留配得上的列，所以沒有下過訂單的李淑芬、從來沒賣出的筆電支架都不會出現在 `orders JOIN customers` 或 `orders JOIN products` 的結果裡。這通常正是你要的，但不是每次都是，第 3 節會處理「也要列出沒配對的」的情況。' },
        { type: 'callout', tone: 'warning', title: '兩張表都有的欄位要寫表名', text: '`orders` 和 `customers` 都有 `id`。在練習場執行 `SELECT id, name FROM orders JOIN customers ON customer_id = customers.id;`，SQLite 會回報 `ambiguous column name: id`：它不知道你要訂單編號還是顧客編號，所以拒絕猜。改成 `orders.id` 或 `customers.id` 就能執行。只有一張表有的欄位（例如 `quantity`）可以不寫前綴，但多表查詢裡全部加上前綴最清楚，日後別人在另一張表加了同名欄位，查詢也不會突然壞掉。' },
        { type: 'callout', tone: 'note', title: 'USING 與同名欄位', text: '兩張表的連接欄位同名時，標準 SQL 還可以寫 `JOIN … USING (欄位)`。本課的外鍵叫 `customer_id`、主鍵叫 `id`，名稱不同，所以一律寫 `ON`。千萬不要因為兩張表都有 `id` 就寫 `orders JOIN customers USING (id)`：那是拿訂單編號去配顧客編號，查詢能執行、列數看起來也正常，但每一列都配錯了。' },
      ],
    },
    {
      id: 'three-tables-aliases', title: '三張表的訂單報表與表別名',
      blocks: [
        { type: 'p', text: '訂單報表要顧客姓名、商品名稱、數量與金額，資料分散在三張表：`orders` 在中間，用兩個外鍵分別指向 `customers` 與 `products`。每多接一張表就多寫一個 `JOIN … ON`，條件說明新加入的表要怎麼接上已經在場的表。合併 n 張表需要 n − 1 個合併條件，這裡是 2 個：' },
        { type: 'example', id: 'order-report' },
        { type: 'p', text: '`FROM orders o` 裡的 `o` 是表別名（table alias），也可以寫成 `FROM orders AS o`。別名只在這一個查詢裡有效，好處是 `o.quantity * p.price` 比 `orders.quantity * products.price` 短得多，而且自我合併（第 6 節）非用不可。注意一旦給了別名，這個查詢裡就要用別名稱呼那張表：`SELECT customers.name FROM customers AS c;` 會得到 `no such column: customers.name`。（Oracle 不接受表別名前的 `AS`，只能寫 `orders o`；SQLite、PostgreSQL 兩種都可以。）' },
        { type: 'p', text: '`AS customer`、`AS amount` 則是欄位別名，替結果的欄位取名，和表別名是兩回事。`o.quantity * p.price` 能算，是因為合併後的每一列同時帶著那筆訂單的數量和那項商品的單價：可以把 `FROM … JOIN …` 想成先組出一張很寬的表，`WHERE` 再從中篩選列，最後 `SELECT` 挑出（或算出）要的欄位，`ORDER BY` 排序。這是邏輯上的順序，DBMS 實際上會選更快的做法，但結果一定和這個順序算出來的一樣。' },
        { type: 'callout', tone: 'tip', title: '接表的順序', text: '內部合併滿足交換律與結合律：`customers JOIN orders JOIN products` 和 `orders JOIN customers JOIN products` 結果相同（欄位清單寫明時連欄位順序都一樣）。習慣上從「一列代表一件事」的那張表開始寫：報表是一列一筆訂單，就從 `orders` 開始，再把它需要的名稱一張一張接上。外部合併就不能隨便換順序了，下一節會看到。' },
      ],
    },
    {
      id: 'left-join', title: 'LEFT JOIN：保留沒配對的列與 NULL 的來源',
      blocks: [
        { type: 'p', text: '想要「每位顧客和他的訂單」，內部合併會漏掉李淑芬，因為 `orders` 裡沒有任何一列的 `customer_id` 是 5。左外部合併 `LEFT JOIN`（完整寫法 `LEFT OUTER JOIN`）保證左邊那張表的每一列都至少出現一次：有配對的照常接上；完全沒有配對的，也輸出一列，右表的欄位全部補 NULL。' },
        { type: 'example', id: 'left-join-customers' },
        { type: 'p', text: '結果是 8 筆配對加上李淑芬一列，共 9 列。在 LEFT JOIN 的結果裡看到 NULL，它有兩種可能的來源，報表要解釋清楚就得分得出來：' },
        { type: 'list', items: [
          '沒有配對：左表這一列在右表找不到任何符合 `ON` 的列，LEFT JOIN 把右表的所有欄位都補成 NULL。李淑芬那列的 `order_id`、`ordered_on` 就是這樣來的。',
          '資料本來就是 NULL：有配對，但右表那一欄存的值就是 NULL。例如在 `school` 資料上把學生 LEFT JOIN 選課，陳志豪的 CS102 那列 `score` 是 NULL，因為那門課還沒評分，不是因為沒配對。',
          '分辨方法：看右表的主鍵、`NOT NULL` 欄位或連接欄位。有配對時它們一定有值，所以 `o.id IS NULL` 一定代表「沒有配對」；只看一個允許 NULL 的欄位（像 `score`）就分不出來。',
        ] },
        { type: 'p', text: '外部合併最常見的錯誤，是把右表的條件寫進 `WHERE`。假設要「每位顧客 9 月 15 日（含）之後的訂單，沒有的也要列出」，比較兩種寫法：' },
        { type: 'table', head: ['顧客', '條件放 ON：`LEFT JOIN orders o ON c.id = o.customer_id AND o.ordered_on >= \'2026-09-15\'`', '條件放 WHERE：`LEFT JOIN orders o ON c.id = o.customer_id WHERE o.ordered_on >= \'2026-09-15\'`'], rows: [
          ['陳美玲', '訂單 8（2026-09-28）', '訂單 8（2026-09-28）'],
          ['林建宏', '訂單 7（2026-09-20）', '訂單 7（2026-09-20）'],
          ['王雅雯', 'NULL（她的訂單都在 9 月 15 日之前）', '整列消失'],
          ['張志明', '訂單 6（2026-09-15）', '訂單 6（2026-09-15）'],
          ['李淑芬', 'NULL（沒有訂單）', '整列消失'],
        ] },
        { type: 'p', text: '`ON` 決定「哪些右表列算配對」；在 LEFT JOIN 裡，配不到只會讓右表欄位變成 NULL，左表的列不會因此消失，所以得到 5 列。`WHERE` 則是在合併完成之後才篩選：王雅雯與李淑芬那兩列的 `o.ordered_on` 是 NULL，`NULL >= \'2026-09-15\'` 的結果是未知（不是真），整列被濾掉，只剩 3 列，和內部合併一模一樣。經驗法則：外部合併時，篩選右表的條件放 `ON`；篩選左表的條件放 `WHERE`。反過來把左表條件放進 `ON`（例如 `ON c.id = o.customer_id AND c.city = \'台北\'`）也不會濾掉任何顧客，只會讓非台北的顧客配不到訂單、補上 NULL。兩種寫法都可以在練習場試試。' },
        { type: 'callout', tone: 'warning', title: 'LEFT JOIN 後面接內部合併', text: '要算每位顧客的消費金額，需要再接 `products` 取單價。如果寫成 `customers c LEFT JOIN orders o ON … JOIN products p ON o.product_id = p.id`，李淑芬那列的 `o.product_id` 是 NULL，配不到任何商品，就被第二個內部合併丟掉了，前面的 LEFT JOIN 白做。整條鏈上，凡是接在「可能補 NULL 的表」後面的合併，也要用 `LEFT JOIN`。' },
        { type: 'callout', tone: 'tip', title: '配合分組：COUNT(o.id) 而不是 COUNT(*)', text: '練習場的預設查詢「每位顧客的消費總額」把 LEFT JOIN 和 `GROUP BY c.id, c.name` 一起用。李淑芬那一組只有一列補 NULL 的列，所以 `COUNT(*)` 是 1，`COUNT(o.id)` 只數非 NULL 的值，才是正確的 0；`SUM(o.quantity * p.price)` 則是 NULL，報表上想顯示 0 可以寫 `COALESCE(SUM(…), 0)`。' },
      ],
    },
    {
      id: 'anti-join', title: '找出「沒有」的資料：反合併',
      blocks: [
        { type: 'p', text: '「哪些學生一門課都沒選？」DB02 用差集 `EXCEPT` 回答過，但結果只能是一個學號欄位。LEFT JOIN 加上 `IS NULL` 是另一種常見寫法，叫做反合併（anti-join）：先讓每位學生都至少出現一次，再只留下「沒有配對」的那些列，左表的任何欄位都可以一起輸出。這個例子用 `school` 資料：' },
        { type: 'example', id: 'anti-join-students' },
        { type: 'p', text: '這是唯一一個「右表條件放在 `WHERE`」反而正確的情況：`WHERE e.student_id IS NULL` 正是要挑出合併後右表欄位被補成 NULL 的列。檢查的欄位要選上一節說的「有配對就一定有值」的欄位：連接欄位 `e.student_id`、主鍵或 `NOT NULL` 欄位都可以。如果改寫成 `WHERE e.score IS NULL`，結果會多出陳志豪（CS102）與黃雅婷（MA101）兩列，因為他們有選課，只是那門課還沒評分。在練習場切換到學校資料時可以親手比對。' },
        { type: 'p', text: '反合併和內部合併的差別在於一個是「找配得到的」，一個是「找配不到的」。直接用內部合併再寫 `WHERE e.student_id IS NULL` 永遠是空的：內部合併根本不會產生沒配對的列。之後的子查詢課程還會介紹 `NOT EXISTS` 寫法，它表達的是同一件事。' },
      ],
    },
    {
      id: 'right-full', title: 'RIGHT JOIN 與 FULL OUTER JOIN',
      blocks: [
        { type: 'p', text: '右外部合併 `RIGHT JOIN` 保留右邊那張表的每一列，未配對時補 NULL 的是左表的欄位。`A RIGHT JOIN B ON 條件` 和 `B LEFT JOIN A ON 條件` 選出的資料列完全相同（只有 `SELECT *` 的欄位順序不同），所以很多團隊統一只寫 LEFT JOIN：把「要全部保留的表」寫在前面，從左往右讀就知道以誰為主。全外部合併 `FULL OUTER JOIN`（可簡寫 `FULL JOIN`）兩邊都保留：配得上的接起來，左邊沒配對的補右表 NULL，右邊沒配對的補左表 NULL。用練習場資料數一數列數：' },
        { type: 'table', head: ['FROM 子句', 'INNER', 'LEFT', 'RIGHT', 'FULL'], rows: [
          ['`customers c ⋯ JOIN orders o ON c.id = o.customer_id`', '8', '9（多了李淑芬）', '8', '9'],
          ['`orders o ⋯ JOIN products p ON o.product_id = p.id`', '8', '8', '9（多了筆電支架）', '9'],
        ] },
        { type: 'p', text: '為什麼 `customers RIGHT JOIN orders` 和內部合併一樣是 8 列？因為 `orders.customer_id` 是 `NOT NULL` 的外鍵，參考完整性保證每筆訂單都配得到顧客，右邊沒有「未配對」的列可以保留。同理，`orders LEFT JOIN products` 也等於內部合併。外部合併只在「那一邊真的可能有未配對的列」時才有差別，所以寫之前先想：哪一邊可能有沒配對的資料？' },
        { type: 'p', text: '要同時看到「沒下單的顧客」和「沒賣出的商品」，就需要兩邊都保留。下面先用 LEFT JOIN 保留所有顧客，再用 FULL OUTER JOIN 接上商品，讓沒人買的商品也出現：' },
        { type: 'example', id: 'full-outer' },
        { type: 'p', text: '第一列的顧客是 NULL：筆電支架沒有任何訂單，FULL OUTER JOIN 保留它並把左邊的欄位補 NULL。第二列是李淑芬，來自前面的 LEFT JOIN，商品與數量是 NULL。這兩列的 `o.id` 都是 NULL，SQLite 在遞增排序時把 NULL 排在最前面，所以它們排在開頭；再加上 `c.id` 才讓這兩列的順序固定。' },
        { type: 'callout', tone: 'note', title: '各家 DBMS 的支援', text: 'SQLite 從 3.39.0 版（2022 年）起才支援 `RIGHT JOIN` 與 `FULL OUTER JOIN`，更舊的版本會回報不支援；本練習場執行 SQLite 3.49.1，可以用 `SELECT sqlite_version();` 確認。PostgreSQL、SQL Server、Oracle 都支援三種外部合併；MySQL 支援 LEFT 與 RIGHT，但沒有 `FULL OUTER JOIN`，常見的替代做法是把 LEFT JOIN 與 RIGHT JOIN 的結果用 `UNION` 合起來。' },
      ],
    },
    {
      id: 'self-join', title: '自我合併：顧客與推薦人',
      blocks: [
        { type: 'p', text: '`customers.referred_by` 是指向 `customers.id` 的外鍵：推薦人也是顧客，存在同一張表裡。要把每位顧客和推薦人的姓名放在同一列，就得讓 `customers` 在 `FROM` 出現兩次，扮演兩個角色：`c` 是被推薦的顧客，`r` 是推薦人。這就是自我合併（self join），表別名在這裡不是方便，而是必要：沒有別名，`name`、`id` 都無從分辨是哪一個角色的，SQLite 只會回報 `ambiguous column name`。' },
        { type: 'example', id: 'self-join-referrer' },
        { type: 'p', text: '條件 `c.referred_by = r.id` 讀作「c 的推薦人是 r」。方向很重要：寫成 `r.referred_by = c.id` 變成「r 是由 c 推薦的」，同樣能執行，但每一列的意義反過來了，陳美玲會因為推薦了兩個人而出現兩次。另外，內部合併的結果只有 3 列：陳美玲和李淑芬的 `referred_by` 是 NULL，`NULL = r.id` 對任何一列都不成立，所以她們不見了。要列出所有顧客、沒有推薦人的顯示 NULL，就要換成 LEFT JOIN，這是本課的練習之一。' },
        { type: 'p', text: '自我合併在階層或關係資料裡很常見：員工與主管、分類與上層分類、課程與先修課程。它和兩張不同表的合併沒有任何差別，只是兩個別名剛好指向同一張表。' },
      ],
    },
    {
      id: 'cartesian', title: '笛卡兒積錯誤：漏掉或寫錯的合併條件',
      blocks: [
        { type: 'p', text: 'DB02 說過，合併就是在笛卡兒積上做選擇。合併條件一旦漏掉，或寫成永遠成立的條件，選擇就沒有作用，剩下的就是乘積本身：列數等於各表列數相乘。在練習場資料上（8 筆訂單、5 位顧客、5 項商品）比較：' },
        { type: 'table', head: ['寫法', '列數', '發生了什麼'], rows: [
          ['`FROM orders o JOIN customers c ON o.customer_id = c.id JOIN products p ON o.product_id = p.id`', '8', '正確：一筆訂單一列'],
          ['`… JOIN products p ON o.customer_id = c.id`', '40', '複製上一行忘了改：這個條件在前一步已經成立，對每項商品都是真，8 × 5'],
          ['`… JOIN products p`（沒有 ON）', '40', 'SQLite 允許省略 `ON`，等於 `CROSS JOIN`，8 × 5'],
          ['`FROM customers, orders, products`（沒有 WHERE）', '200', '三張表的完整乘積，5 × 8 × 5'],
        ] },
        { type: 'p', text: '這類錯誤不會有任何錯誤訊息，結果看起來也像一份正常的報表，只是金額加總會變成好幾倍。養成以下的檢查習慣：' },
        { type: 'list', ordered: true, items: [
          '先估計列數：「一列一筆訂單」的報表就應該是 `orders` 的列數（加了篩選就更少），用 `SELECT COUNT(*)` 驗證。',
          '列數剛好是某幾張表列數的乘積（40 = 8 × 5、200 = 5 × 8 × 5），幾乎可以確定漏了條件。',
          '應該唯一的值重複出現：報表裡同一個訂單編號 `o.id` 出現了 5 次，表示每筆訂單和每項商品都配了一次。',
          '數條件：n 張表需要 n − 1 個合併條件，而且每個 `ON` 都要用到這一行新加入的那張表（`JOIN products p ON …` 卻沒提到 `p`，一定有問題）。',
          '列數正確不代表條件正確：`ON o.product_id = c.id` 或 `USING (id)` 這種「接錯欄位」的條件，列數可能剛好合理，每列卻配錯了。拿幾列和原始表對照，確認外鍵接到的是它真正指向的主鍵。',
        ] },
        { type: 'callout', tone: 'note', title: '需要乘積時就寫明 CROSS JOIN', text: '標準 SQL 和 PostgreSQL 規定 `JOIN` 一定要有 `ON` 或 `USING`（`NATURAL JOIN` 除外），省略會是語法錯誤；SQLite 則放行，當成乘積。有時你真的需要乘積，例如列出「每位顧客 × 每項商品」的所有組合當作推薦矩陣的底稿（5 × 5 = 25 列），這時寫 `FROM customers c CROSS JOIN products p`，讓讀的人知道這是刻意的，而不是忘了條件。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-left-count', prompt: '`customers` 有 5 位顧客、`orders` 有 8 筆訂單，每筆訂單都屬於一位顧客，只有李淑芬沒有訂單。下面的查詢回傳幾列？',
      code: { language: 'SQL', text: 'SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON c.id = o.customer_id;' },
      options: ['5', '8', '9', '40'],
      answer: 2, explanation: 'LEFT JOIN 先照常輸出所有配對（8 筆訂單各配到一位顧客，8 列），再替沒有配對的左表列補一列（李淑芬，訂單欄位是 NULL），共 9 列。5 是誤以為 LEFT JOIN 每位顧客只輸出一列，但有 3 筆訂單的陳美玲會出現 3 次；8 是內部合併的結果，漏了李淑芬；40 是沒有合併條件的笛卡兒積 5 × 8。',
    },
    {
      id: 'q-where-vs-on', prompt: '這個查詢想列出「每位顧客 9 月 15 日（含）之後的訂單，沒有的也要列出」。在練習場資料上（只有陳美玲、林建宏、張志明在那之後下過單）它回傳幾列？',
      code: { language: 'SQL', text: 'SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON c.id = o.customer_id\nWHERE o.ordered_on >= \'2026-09-15\';' },
      options: [
        '5 列：LEFT JOIN 保證每位顧客至少出現一次',
        '9 列：WHERE 對 LEFT JOIN 補上的列沒有作用',
        '0 列：日期存成文字，不能用 >= 比較',
        '3 列：WHERE 在合併之後才篩選，未配對與日期太早的列都被濾掉，等於內部合併',
      ],
      answer: 3, explanation: '`WHERE` 是對合併後的結果篩選：李淑芬那列的 `o.ordered_on` 是 NULL，比較結果是未知，被濾掉；王雅雯雖然有配對，但兩筆訂單都在 9 月 15 日之前，也全被濾掉，只剩 3 列。要得到 5 列，條件得移到 `ON`：`ON c.id = o.customer_id AND o.ordered_on >= \'2026-09-15\'`，LEFT JOIN 的保證只對 `ON` 有效，`WHERE` 不受它保護。9 列是沒有任何篩選時的列數；`YYYY-MM-DD` 格式的文字依字典順序比較，剛好就是日期順序，所以 `>=` 可以正常比較。',
    },
    {
      id: 'q-null-source', prompt: '在 `school` 資料上執行下面的查詢，結果中有 (陳志豪, CS102, NULL) 和 (蔡宜蓁, NULL, NULL) 兩列。哪一個敘述正確？',
      code: { language: 'SQL', text: 'SELECT s.name, e.course_id, e.score\nFROM students s\nLEFT JOIN enrollments e ON s.id = e.student_id;' },
      options: [
        '陳志豪那列的 NULL 是選課表裡存的（還沒評分）；蔡宜蓁那列的 NULL 是 LEFT JOIN 補的（她沒有任何選課）',
        '兩列的 NULL 都是 LEFT JOIN 補上的，因為它們都沒有配對',
        '兩列的 NULL 都是資料表裡存的，LEFT JOIN 不會產生新的 NULL',
        '要找出沒有選課的學生，應該加上 `WHERE e.score IS NULL`',
      ],
      answer: 0, explanation: '陳志豪有配對（他選了 CS102，所以 `course_id` 有值），只是 `score` 本來就存 NULL；蔡宜蓁沒有任何選課，LEFT JOIN 把右表的所有欄位都補成 NULL，連 `NOT NULL` 的 `course_id` 也是 NULL。因此「兩列都是補的」與「LEFT JOIN 不產生 NULL」都錯。要找沒有選課的學生，應該檢查有配對就一定有值的欄位（如 `e.student_id`、`e.course_id`）；檢查 `e.score IS NULL` 會把陳志豪、黃雅婷這些「有選課但未評分」的人也算進去。',
    },
    {
      id: 'q-cartesian', prompt: '練習場有 8 筆訂單、5 位顧客、5 項商品。下面的查詢把第一個 `ON` 複製到第二行後忘了修改，它回傳的數字是多少？',
      code: { language: 'SQL', text: 'SELECT COUNT(*)\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nJOIN products p ON o.customer_id = c.id;' },
      options: ['8', '18', '200', '40'],
      answer: 3, explanation: '前兩張表正確合併成 8 列；第二個 `ON` 根本沒提到 `p`，而 `o.customer_id = c.id` 對這 8 列都已經成立，所以每一列和 5 項商品都配一次，8 × 5 = 40，這就是笛卡兒積錯誤。8 是條件正確時的列數；18 是把列數相加，但乘積是相乘；200 是三張表完全沒有條件時的 5 × 8 × 5，這裡第一個條件仍然有作用。',
    },
    {
      id: 'q-right-equiv', prompt: '下面哪一個查詢和 `SELECT p.name, o.id FROM orders o RIGHT JOIN products p ON o.product_id = p.id;` 回傳相同的資料列（不計順序）？',
      options: [
        '`SELECT p.name, o.id FROM orders o LEFT JOIN products p ON o.product_id = p.id;`',
        '`SELECT p.name, o.id FROM products p LEFT JOIN orders o ON o.product_id = p.id;`',
        '`SELECT p.name, o.id FROM products p JOIN orders o ON o.product_id = p.id;`',
        '`SELECT p.name, o.id FROM products p RIGHT JOIN orders o ON o.product_id = p.id;`',
      ],
      answer: 1, explanation: '`A RIGHT JOIN B` 等於 `B LEFT JOIN A`：要保留的都是 `products` 的每一列，所以結果都是 8 筆訂單加上沒賣出的筆電支架（`o.id` 為 NULL），共 9 列。只改關鍵字不換表（`orders o LEFT JOIN products p`）變成保留每筆訂單，筆電支架就不見了；內部合併同樣沒有筆電支架；`products p RIGHT JOIN orders o` 保留的是訂單，而每筆訂單都配得到商品，結果等於內部合併的 8 列。',
    },
    {
      id: 'q-self-join', prompt: '要列出每位顧客的姓名和他的推薦人姓名（沒有推薦人的顯示 NULL），空格應該填什麼？',
      code: { language: 'SQL', text: 'SELECT c.name AS customer, r.name AS referrer\nFROM customers c\nLEFT JOIN customers r ON ____;' },
      options: ['`r.referred_by = c.id`', '`c.id = r.id`', '`c.referred_by = r.id`', '`c.referred_by = r.referred_by`'],
      answer: 2, explanation: '`c.referred_by` 存的是 c 的推薦人的編號，要等於推薦人那一列的主鍵 `r.id`，讀作「c 的推薦人是 r」。`r.referred_by = c.id` 方向反了，找的是「c 推薦了誰」，陳美玲會配到她推薦的兩個人；`c.id = r.id` 讓每位顧客配到自己，referrer 欄位就是自己的姓名；`c.referred_by = r.referred_by` 配的是「推薦人相同的顧客」（包括自己），意義完全不同。',
    },
    {
      id: 'q-ambiguous', prompt: '在練習場執行下面的查詢，會發生什麼事？',
      code: { language: 'SQL', text: 'SELECT id, name, quantity\nFROM orders\nJOIN customers ON customer_id = customers.id;' },
      options: [
        '回傳訂單編號，因為 `orders` 寫在前面',
        '回傳顧客編號，因為 `ON` 裡寫了 `customers.id`',
        '執行失敗：`ambiguous column name: id`',
        '變成笛卡兒積，因為 `customer_id` 沒有寫表名',
      ],
      answer: 2, explanation: '`orders` 和 `customers` 都有 `id`，SQLite 不會依表的順序或 `ON` 的寫法去猜，而是直接報錯，要你寫成 `orders.id` 或 `customers.id`。`name` 只在 `customers`、`quantity` 與 `customer_id` 只在 `orders`，不寫表名也不會有歧義，所以合併條件本身沒有問題，不會變成乘積。',
    },
  ],
  sql: {
    dataset: 'shop',
    presets: [
      { label: '三張表：訂單明細', sql: sql`SELECT o.id, c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
ORDER BY o.id;` },
      { label: 'LEFT JOIN：每位顧客與訂單', sql: sql`SELECT c.name, o.id AS order_id, o.ordered_on
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
ORDER BY c.id, o.id;` },
      { label: '條件放在 ON（試著移到 WHERE）', sql: sql`SELECT c.name, o.id AS order_id, o.ordered_on
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id AND o.ordered_on >= '2026-09-15'
ORDER BY c.id;` },
      { label: '每位顧客的消費總額（LEFT JOIN + GROUP BY）', sql: sql`SELECT c.name, COUNT(o.id) AS order_count, SUM(o.quantity * p.price) AS total
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
LEFT JOIN products p ON o.product_id = p.id
GROUP BY c.id, c.name
ORDER BY total DESC;` },
      { label: 'FULL OUTER JOIN：沒下單的顧客與沒賣出的商品', sql: sql`SELECT c.name AS customer, p.name AS product, o.quantity
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
FULL OUTER JOIN products p ON o.product_id = p.id
ORDER BY o.id, c.id;` },
      { label: '漏了條件：笛卡兒積有幾列', sql: sql`SELECT COUNT(*)
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.customer_id = c.id;` },
    ],
    examples: [
      {
        id: 'order-report', title: '三張表的訂單報表', dataset: 'shop',
        description: '從 orders 出發，依兩個外鍵接上 customers 與 products：兩個 JOIN、兩個 ON，一筆訂單一列。金額用同一列上的數量乘單價算出。',
        sql: sql`SELECT o.id, c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
ORDER BY o.id;`,
        result: { columns: ['id', 'customer', 'product', 'quantity', 'amount'], rows: [
          [1, '陳美玲', '機械鍵盤', 1, 2490],
          [2, '陳美玲', '無線滑鼠', 2, 1780],
          [3, '林建宏', '27 吋螢幕', 1, 6990],
          [4, '王雅雯', '無線滑鼠', 1, 890],
          [5, '王雅雯', 'USB-C 集線器', 3, 3870],
          [6, '張志明', '機械鍵盤', 2, 4980],
          [7, '林建宏', 'USB-C 集線器', 1, 1290],
          [8, '陳美玲', '27 吋螢幕', 1, 6990],
        ] },
      },
      {
        id: 'left-join-customers', title: 'LEFT JOIN：每位顧客與他的訂單', dataset: 'shop',
        description: '左表 customers 的每一列都保留：有訂單的照常配對，沒有訂單的李淑芬也輸出一列，右表欄位補 NULL。',
        sql: sql`SELECT c.name, o.id AS order_id, o.ordered_on
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
ORDER BY c.id, o.id;`,
        result: { columns: ['name', 'order_id', 'ordered_on'], rows: [
          ['陳美玲', 1, '2026-09-01'],
          ['陳美玲', 2, '2026-09-03'],
          ['陳美玲', 8, '2026-09-28'],
          ['林建宏', 3, '2026-09-05'],
          ['林建宏', 7, '2026-09-20'],
          ['王雅雯', 4, '2026-09-10'],
          ['王雅雯', 5, '2026-09-12'],
          ['張志明', 6, '2026-09-15'],
          ['李淑芬', null, null],
        ] },
      },
      {
        id: 'anti-join-students', title: '反合併：沒有選課的學生', dataset: 'school',
        description: 'LEFT JOIN 讓每位學生至少出現一次，WHERE e.student_id IS NULL 只留下沒有配對的列。和 DB02 的 EXCEPT 不同，可以順便輸出姓名。',
        sql: sql`SELECT s.id, s.name
FROM students s
LEFT JOIN enrollments e ON s.id = e.student_id
WHERE e.student_id IS NULL;`,
        result: { columns: ['id', 'name'], rows: [[8, '蔡宜蓁']] },
      },
      {
        id: 'full-outer', title: 'FULL OUTER JOIN：兩邊沒配對的都留下', dataset: 'shop',
        description: '先 LEFT JOIN 保留所有顧客，再 FULL OUTER JOIN 商品，讓沒賣出的筆電支架也出現。8 筆訂單加上兩列只有一邊有值的列，共 10 列。',
        sql: sql`SELECT c.name AS customer, p.name AS product, o.quantity
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
FULL OUTER JOIN products p ON o.product_id = p.id
ORDER BY o.id, c.id;`,
        result: { columns: ['customer', 'product', 'quantity'], rows: [
          [null, '筆電支架', null],
          ['李淑芬', null, null],
          ['陳美玲', '機械鍵盤', 1],
          ['陳美玲', '無線滑鼠', 2],
          ['林建宏', '27 吋螢幕', 1],
          ['王雅雯', '無線滑鼠', 1],
          ['王雅雯', 'USB-C 集線器', 3],
          ['張志明', '機械鍵盤', 2],
          ['林建宏', 'USB-C 集線器', 1],
          ['陳美玲', '27 吋螢幕', 1],
        ] },
      },
      {
        id: 'self-join-referrer', title: '自我合併：被推薦的顧客與推薦人', dataset: 'shop',
        description: 'customers 出現兩次：c 是顧客，r 是推薦人，條件 c.referred_by = r.id。內部合併只留下有推薦人的 3 位顧客。',
        sql: sql`SELECT c.name AS customer, r.name AS referrer
FROM customers c
JOIN customers r ON c.referred_by = r.id
ORDER BY c.id;`,
        result: { columns: ['customer', 'referrer'], rows: [
          ['林建宏', '陳美玲'],
          ['王雅雯', '陳美玲'],
          ['張志明', '林建宏'],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-taipei-orders', title: '三張表的報表：台北顧客的訂單',
        statement: '列出住在台北的顧客的每一筆訂單。結果欄位依序為 `customer`（顧客姓名）、`product`（商品名稱）、`quantity`（數量）、`amount`（金額 = 數量 × 單價）。依金額由高到低排列，金額相同時依訂單編號由小到大。',
        dataset: 'shop', hidden: ['shop-b'], ordered: true, columnNames: true,
        starter: sql`SELECT c.name AS customer, p.name AS product, o.quantity, ... AS amount
FROM orders o
JOIN customers c ON ...
JOIN products p ON ...
WHERE ...
ORDER BY ...;`,
        hints: [
          '三張表需要兩個合併條件：`o.customer_id = c.id` 和 `o.product_id = p.id`，各自寫在接上那張表的 `ON` 後面。',
          '「住在台北」是篩選顧客的條件，放在 `WHERE c.city = \'台北\'`；這是內部合併，放在 `ON` 也會得到同樣的結果。',
          '排序要寫兩層：`ORDER BY amount DESC, o.id`。`amount` 是欄位別名，在 `ORDER BY` 裡可以直接使用。',
        ],
        solution: sql`SELECT c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE c.city = '台北'
ORDER BY amount DESC, o.id;`,
        alternatives: [
          sql`SELECT c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM customers c
JOIN orders o ON c.id = o.customer_id AND c.city = '台北'
JOIN products p ON p.id = o.product_id
ORDER BY o.quantity * p.price DESC, o.id ASC;`,
          sql`SELECT customers.name AS customer, products.name AS product, orders.quantity,
  orders.quantity * products.price AS amount
FROM orders, customers, products
WHERE orders.customer_id = customers.id
  AND orders.product_id = products.id
  AND customers.city = '台北'
ORDER BY amount DESC, orders.id;`,
        ],
        mistakes: [
          { sql: sql`SELECT c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.customer_id = c.id
WHERE c.city = '台北'
ORDER BY amount DESC, o.id;`, why: '第二個 `ON` 是從第一行複製來的，沒有提到 `p`：它對每項商品都成立，每筆台北訂單都和所有商品配了一次（笛卡兒積），列數變成好幾倍，商品名稱也大多是錯的。' },
          { sql: sql`SELECT c.name AS customer, p.name AS product, o.quantity, p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE c.city = '台北'
ORDER BY amount DESC, o.id;`, why: '金額是數量乘單價，只寫 `p.price` 是單價。買了 2 個滑鼠、3 個集線器的訂單金額就錯了，排序也跟著不同。' },
          { sql: sql`SELECT c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price AS amount
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE c.city = '台北'
ORDER BY amount, o.id;`, why: '`ORDER BY amount` 預設是遞增（由低到高），題目要的是由高到低，要寫 `DESC`。' },
        ],
      },
      {
        id: 'ex-no-orders', title: '反合併：沒有下過訂單的顧客',
        statement: '找出一筆訂單都沒有的顧客。結果欄位依序為顧客編號 `id`、姓名 `name`，順序不拘。請用 `LEFT JOIN` 寫出反合併。',
        dataset: 'shop', hidden: ['shop-b'], ordered: false, columnNames: true,
        starter: sql`SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON ...
WHERE ...;`,
        hints: [
          '以顧客為主：`customers c LEFT JOIN orders o ON c.id = o.customer_id`，沒有訂單的顧客也會出現一列，訂單欄位是 NULL。',
          '只留下沒有配對的列：檢查一個「有配對就一定有值」的訂單欄位，例如主鍵 `o.id`。',
          '`IS NULL` 的條件要放在 `WHERE`（合併之後篩選）；放進 `ON` 只會讓所有顧客都配不到訂單，一個也不會被濾掉。',
        ],
        solution: sql`SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
WHERE o.id IS NULL;`,
        alternatives: [
          sql`SELECT c.id, c.name
FROM orders o
RIGHT JOIN customers c ON o.customer_id = c.id
WHERE o.customer_id IS NULL;`,
          sql`SELECT id, name FROM customers
EXCEPT
SELECT c.id, c.name
FROM customers c
JOIN orders o ON c.id = o.customer_id;`,
        ],
        mistakes: [
          { sql: sql`SELECT c.id, c.name
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.id IS NULL;`, why: '內部合併只產生配得上的列，每一列的 `o.id` 都有值，結果永遠是空的。要先用 LEFT JOIN 讓沒有訂單的顧客出現，才找得到他們。' },
          { sql: sql`SELECT c.id, c.name
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id AND o.id IS NULL;`, why: '`IS NULL` 放進 `ON` 只是讓任何訂單都配不上；LEFT JOIN 仍然保留每一位顧客，所以所有顧客都出現了。篩選「沒有配對」要在合併之後，用 `WHERE`。' },
          { sql: sql`SELECT DISTINCT c.id, c.name
FROM customers c
JOIN orders o ON c.id <> o.customer_id;`, why: '`<>` 的意思是「至少有一筆訂單不是他的」，幾乎每位顧客都滿足，有訂單的顧客也會出現。「一筆都沒有」要用反合併或差集表達。' },
        ],
      },
      {
        id: 'ex-referrers', title: '自我合併：每位顧客的推薦人',
        statement: '列出所有顧客的姓名與推薦人的姓名；沒有推薦人的顧客也要列出，推薦人顯示 NULL。結果欄位依序為 `customer`（顧客姓名）、`referrer`（推薦人姓名），依顧客編號由小到大排列。',
        dataset: 'shop', hidden: ['shop-b'], ordered: true, columnNames: true,
        starter: sql`SELECT c.name AS customer, r.name AS referrer
FROM customers c
... customers r ON ...
ORDER BY ...;`,
        hints: [
          '同一張表要出現兩次，各給一個別名：`c` 是顧客，`r` 是推薦人。',
          '「c 的推薦人是 r」寫成 `c.referred_by = r.id`，方向不要寫反。',
          '沒有推薦人的顧客 `referred_by` 是 NULL，內部合併會把他們丟掉，所以要用 `LEFT JOIN`；最後 `ORDER BY c.id`。',
        ],
        solution: sql`SELECT c.name AS customer, r.name AS referrer
FROM customers c
LEFT JOIN customers r ON c.referred_by = r.id
ORDER BY c.id;`,
        alternatives: [
          sql`SELECT c.name AS customer, r.name AS referrer
FROM customers r
RIGHT JOIN customers c ON r.id = c.referred_by
ORDER BY c.id;`,
        ],
        mistakes: [
          { sql: sql`SELECT c.name AS customer, r.name AS referrer
FROM customers c
JOIN customers r ON c.referred_by = r.id
ORDER BY c.id;`, why: '內部合併只留下有推薦人的顧客：`referred_by` 是 NULL 的顧客配不到任何人，整列消失。題目要求列出所有顧客，要用 `LEFT JOIN`。' },
          { sql: sql`SELECT c.name AS customer, r.name AS referrer
FROM customers c
LEFT JOIN customers r ON r.referred_by = c.id
ORDER BY c.id;`, why: '條件方向反了：`r.referred_by = c.id` 找的是「c 推薦了誰」，推薦過兩個人的顧客會出現兩次，沒推薦過人的則顯示 NULL，和「c 的推薦人」完全不同。' },
          { sql: sql`SELECT name AS customer, name AS referrer
FROM customers
LEFT JOIN customers ON referred_by = id
ORDER BY id;`, why: '同一張表出現兩次卻沒有別名，`name`、`id` 都分不出是哪一個角色的，SQLite 回報 `ambiguous column name`。自我合併一定要用表別名。' },
        ],
      },
    ],
  },
};
