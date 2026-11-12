import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB04 彙總函式與 GROUP BY. SQL lesson (Phase F.1a): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB04: LessonContent = {
  lessonId: 'DB04',
  motivation: '到目前為止，你的查詢都是「挑出某些列、某些欄位」：結果的每一列都對應到表裡的一列。可是真正要回答的問題常常是統計：一共有幾筆選課？每門課平均幾分？哪幾門課的平均超過 80 分？每班有幾個人？這些問題要把很多列壓縮成一個數字，或是先分成幾組、每組各算一個數字。彙總函式（aggregate function）負責「壓縮」，`GROUP BY` 負責「分組」，`HAVING` 負責「分組之後再篩選」。學會它們，你就能用一個查詢寫出報表裡最常見的「每個類別的平均，只列出超過門檻者」；也會知道兩個容易讓數字悄悄算錯的陷阱：NULL 會被 `COUNT(欄位)` 與 `AVG` 略過，以及 `WHERE` 與 `HAVING` 篩選的時機不同。這些正是 D09 用 map「依鍵計數」的想法，只是改由資料庫替你做。',
  sections: [
    {
      id: 'aggregate-functions', title: '彙總函式：把很多列算成一個值',
      blocks: [
        { type: 'p', text: 'DB03 的查詢結果和表的列是一對一的：`WHERE` 留下幾列，結果就有幾列。彙總函式不一樣，它讀進一整組列，只吐出一個值。SQL 標準的五個基本彙總函式如下，最後一欄是對整張 `enrollments`（14 筆選課，其中 2 筆還沒有成績）算出來的結果：' },
        { type: 'table', head: ['函式', '算什麼', '遇到 NULL', '整張 enrollments'], rows: [
          ['`COUNT(*)`', '列數', '每一列都算，不看任何欄位的值', '14'],
          ['`COUNT(score)`', '`score` 不是 NULL 的列數', '略過', '12'],
          ['`SUM(score)`', '總和', '略過；沒有任何非 NULL 的值時結果是 NULL', '967'],
          ['`AVG(score)`', '平均：非 NULL 值的總和 ÷ 非 NULL 值的個數', '略過，分母也不算它們', '967 ÷ 12 ≈ 80.58'],
          ['`MIN(score)`、`MAX(score)`', '最小值、最大值', '略過', '58、95'],
        ] },
        { type: 'p', text: '彙總函式作用在 `WHERE` 留下來的列上。下面只看微積分（MA101）：它有 3 筆選課，張家豪 58 分、王小明 78 分、黃雅婷還沒有成績。注意 `AVG(score)` 是 136 ÷ 2 = 68，不是 136 ÷ 3：' },
        { type: 'example', id: 'ma101-stats' },
        { type: 'p', text: '沒有 `GROUP BY` 時，整個 `WHERE` 的結果就是「一組」，所以不管有幾列，結果都剛好一列。結果的欄位名稱就是運算式的文字（例如 `COUNT(*)`）。想要好讀的名稱，在運算式後面寫 `AS 名稱` 取別名（alias），例如 `COUNT(score) AS scored`；別名只改結果欄位的名稱，不改計算。本課後面的查詢都會這樣命名。' },
        { type: 'callout', tone: 'note', title: '沒有任何列時的彙總', text: '藝術欣賞（AR101）沒有人選。在練習場執行預設查詢「空集合的彙總：AR101」，結果仍然有一列：`COUNT(*)` 是 0，`SUM`、`AVG`、`MAX` 都是 NULL。計數「沒有東西」是 0 很合理，但「沒有東西的平均或最大值」不存在，所以是 NULL。程式讀取這種結果時要記得處理 NULL。' },
      ],
    },
    {
      id: 'null-in-aggregates', title: 'NULL 的影響：COUNT(*)、COUNT(欄位) 與 AVG',
      blocks: [
        { type: 'p', text: '`COUNT` 有三種寫法，差別全在 NULL 與重複：`COUNT(*)` 數列數；`COUNT(score)` 只數 `score` 有值的列；`COUNT(DISTINCT student_id)` 先去掉 NULL 與重複，再數有幾個不同的值。`AVG` 也只看有值的列。下面把它們放在一起，再和「把 NULL 當成 0」的平均比較：' },
        { type: 'example', id: 'null-effects' },
        { type: 'list', items: [
          '`COUNT(*)` = 14：選課表有 14 列。',
          '`COUNT(score)` = 12：陳志豪的 CS102 與黃雅婷的 MA101 還沒有成績，不算。',
          '`COUNT(DISTINCT student_id)` = 7：14 筆選課來自 7 位不同的學生（蔡宜蓁沒有選課）。它和 DB03 的 `SELECT DISTINCT student_id` 是一對：後者列出這 7 個值，前者只回答「幾個」。',
          '`avg_scored` = 80.6：`AVG(score)` 是 967 ÷ 12，兩筆 NULL 不在分母裡。',
          '`avg_null_as_zero` = 69.1：`COALESCE(score, 0)` 回傳第一個不是 NULL 的參數，也就是把 NULL 換成 0，於是變成 967 ÷ 14。',
        ] },
        { type: 'p', text: '兩個平均哪個對？看 NULL 在資料裡代表什麼。本資料集的 NULL 是「尚未評分」，也就是未知，不是 0 分；把它當 0 會讓還沒改考卷的課程平均被拉低，所以「已評分的平均」用 `AVG(score)` 才對。如果規則是「缺考以 0 分計」，才應該寫 `AVG(COALESCE(score, 0))`。重點是：這個決定要你自己做，`AVG` 預設一定略過 NULL。' },
        { type: 'callout', tone: 'warning', title: '自己算平均的兩個陷阱', text: '有人用 `SUM(score) / COUNT(*)` 自己算平均，會一次踩到兩個坑。第一，分母 `COUNT(*)` 把沒有成績的列也算進去，等於把 NULL 當 0。第二，SQLite 裡整數除以整數是整數除法：MA101 的 `SUM(score) / COUNT(*)` 是 136 / 3 = 45，小數直接被丟掉（PostgreSQL 也一樣）。真的要自己算，至少寫成 `SUM(score) * 1.0 / COUNT(score)`。通常直接用 `AVG` 最不容易錯。' },
        { type: 'callout', tone: 'tip', title: 'AVG 回傳浮點數，呈現時再四捨五入', text: 'SQLite 的 `AVG` 一律回傳浮點數（real），即使結果剛好是整數，所以常看到 80.58333333333333 這種長小數。呈現時用 `ROUND(AVG(score), 1)` 四捨五入到小數 1 位。但 `ROUND` 會改變值，比較門檻時（例如 `HAVING AVG(score) >= 80`）用未四捨五入的平均，才不會讓 79.96 被當成 80。' },
      ],
    },
    {
      id: 'group-by', title: 'GROUP BY：依鍵分組，每組算一次',
      blocks: [
        { type: 'p', text: '「每門課有幾筆選課」就是 D09 的依鍵計數。當時你用 map 一列一列處理：鍵是要分類的東西，值是目前的次數，Python 寫成 `count[k] = count.get(k, 0) + 1`。對 `enrollments` 做同樣的事，鍵就是 `course_id`。`GROUP BY course_id` 讓 DBMS 替你做這件事：把 `course_id` 相同的列放進同一組，再對每一組各算一次彙總函式，每組變成結果的一列。' },
        { type: 'table', head: ['D09 用 map 計數', 'SQL 分組查詢'], rows: [
          ['鍵：`k = row.course_id`', '`GROUP BY course_id`'],
          ['值：次數 `count[k] += 1`', '`COUNT(*)`'],
          ['平均：每個鍵同時累加總和與個數，最後相除', '`AVG(score)`（並自動略過 NULL）'],
          ['只有出現過的鍵才在 map 裡', '只有出現過的 `course_id` 才有一組'],
          ['輸出前要自己排序', '要順序就寫 `ORDER BY`'],
        ] },
        { type: 'p', text: '14 筆選課依 `course_id` 分成 4 組：CS101 4 筆、CS102 3 筆、DB101 4 筆、MA101 3 筆。每一組各算人數、已評分人數、平均、最低與最高分：' },
        { type: 'example', id: 'per-course-stats' },
        { type: 'p', text: 'CS102 的 `enrolled` 是 3、`scored` 是 2，平均 83 是 (90 + 76) ÷ 2：同一個查詢裡，`COUNT(*)` 和 `COUNT(score)` 可以不一樣，這正是本課要你看懂的差別。藝術欣賞（AR101）沒有出現，因為它在 `enrollments` 裡一列都沒有，自然組不成一組，就像 D09 的 map 裡不會有沒出現過的鍵。要列出「選課人數 0」的課程，得把 `courses` 一起帶進來，這要等 DB05 的 `LEFT JOIN`。' },
        { type: 'p', text: '`GROUP BY` 也可以寫好幾個欄位，這時「鍵」是欄位值的組合，像 D09 用 tuple `(grade, class)` 當鍵。`students` 有 3 個年級、3 個班，最多 9 種組合，但實際上只有 7 種出現，所以結果是 7 列：' },
        { type: 'example', id: 'class-grade-counts' },
        { type: 'callout', tone: 'note', title: '分組的順序與文字排序', text: '不寫 `ORDER BY` 時，分組結果的順序沒有保證：SQLite 常常剛好依分組欄位排好，那只是它目前的分組做法造成的，不是規則，換個查詢或加了索引就可能不同。上例用 `ORDER BY grade, class` 固定順序；文字依字元編碼比較，丙（U+4E19）＜ 乙（U+4E59）＜ 甲（U+7532），所以排出來是乙、甲而不是天干的甲、乙、丙。' },
        { type: 'callout', tone: 'note', title: 'NULL 自成一組', text: '`WHERE teacher = NULL` 找不到任何列（DB03），但分組時所有 NULL 會被放進同一組。試試 `SELECT teacher, COUNT(*) FROM courses GROUP BY teacher;`：藝術欣賞沒有老師，結果多出一列 `teacher` 為 NULL、計數 1 的組。' },
      ],
    },
    {
      id: 'select-rule', title: 'SELECT 的欄位：不是分組欄位，就要彙總',
      blocks: [
        { type: 'p', text: '分組之後，每一組只會變成一列，所以 `SELECT` 裡的每個欄位在每一組都必須只有一個值。只有兩種欄位保證如此：分組欄位本身（同一組的 `course_id` 都一樣），以及彙總函式（把整組算成一個值）。像 `score` 這種組內各列不同的欄位，CS101 那一組有 92、85、67、81 四個值，結果只有一格，該放哪一個？' },
        { type: 'p', text: '標準 SQL 的答案是：不能這樣寫。PostgreSQL、以預設設定執行的 MySQL 5.7 以後版本等多數 DBMS 都會直接報錯（例外是該欄位由分組欄位唯一決定，例如依主鍵分組時的其他欄位）。SQLite 則很寬鬆，接受這種「裸欄位」（bare column），從組內某一列取值，但哪一列沒有定義。執行預設查詢「危險：沒有彙總的欄位」，你會看到每門課配上某一筆的成績，CS102 甚至顯示 NULL，雖然它明明有 90 和 76 兩個成績。' },
        { type: 'table', head: ['寫法', 'SQLite', '標準 SQL／PostgreSQL', '建議'], rows: [
          ['`SELECT course_id, COUNT(*) FROM enrollments GROUP BY course_id`', '正確', '正確', '每個欄位不是分組欄位就是彙總'],
          ['`SELECT course_id, score FROM enrollments GROUP BY course_id`', '可以執行，`score` 取組內某一列', '錯誤', '想清楚要哪個值：`MAX(score)`？`AVG(score)`？或把 `score` 加進 `GROUP BY`'],
          ['`SELECT COUNT(*), course_id FROM enrollments`（沒有 `GROUP BY`）', '可以執行，一列 14 和某一個課程代號', '錯誤', '去掉 `course_id`，或加上 `GROUP BY course_id`'],
          ['`SELECT course_id, student_id, MAX(score) FROM enrollments GROUP BY course_id`', '可以執行，`student_id` 取自最高分那一列（SQLite 特例）', '錯誤', '只在 SQLite 有效；同分時也只會給一位'],
        ] },
        { type: 'callout', tone: 'warning', title: '裸欄位的風險：不報錯，但答案可能是錯的', text: '裸欄位最危險的地方是它看起來很正常：有欄位、有值、不報錯。可是那個值只是 SQLite 剛好讀到的某一列，資料一變、查詢一改或換一套 DBMS，結果就可能不同，甚至直接無法執行。寫分組查詢時逐一檢查 `SELECT`（以及 `ORDER BY`）裡的每個欄位：它是分組欄位嗎？不是的話，有包在彙總函式裡嗎？' },
        { type: 'callout', tone: 'note', title: 'SQLite 的 MIN／MAX 特例', text: 'SQLite 文件保證一個特例：查詢裡剛好只有一個 `MIN` 或 `MAX` 彙總時，裸欄位取自擁有那個最小或最大值的列，所以上表最後一列會得到每門課最高分的學生。這是 SQLite 的擴充：其他 DBMS 會報錯，要改用子查詢；而且同分時只會挑一列。本課的練習一律不用裸欄位。' },
      ],
    },
    {
      id: 'having', title: 'HAVING：分組之後再篩選',
      blocks: [
        { type: 'p', text: '「哪些課至少有 2 筆 80 分以上的成績？」這個問題有兩層篩選。「80 分以上」是對每一列的條件，要在分組前把其他列丟掉，寫在 `WHERE`；「至少 2 筆」是對每一組的條件，只有分組並算出 `COUNT(*)` 之後才知道，寫在 `HAVING`：' },
        { type: 'example', id: 'where-then-having' },
        { type: 'p', text: '一步一步追：`WHERE score >= 80` 留下 7 列（92、85、88、90、81、95、84，NULL 不滿足比較，也被排除）；`GROUP BY` 把它們分成 CS101 3 列、CS102 1 列、DB101 3 列，MA101 沒有任何一列通過，連一組都沒有；`HAVING COUNT(*) >= 2` 丟掉 CS102；最後 `SELECT` 算出每組的欄位，`ORDER BY` 排序。注意 `COUNT(*)` 數的是通過 `WHERE` 的列：`WHERE` 改變的是彙總函式的輸入。' },
        { type: 'p', text: '一個 `SELECT` 敘述的子句雖然照 `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT` 的順序寫，概念上卻依下面的邏輯順序執行（DBMS 實際怎麼做可以不同，但結果必須和這個順序一致）：' },
        { type: 'list', ordered: true, items: [
          '`FROM`：決定資料來源（一張表，或 DB02 的逗號合併）。',
          '`WHERE`：逐列篩選。這時還沒有分組，所以不能用彙總函式。',
          '`GROUP BY`：把剩下的列分組。',
          '`HAVING`：逐組篩選，可以用彙總函式。',
          '`SELECT`：算出每組（或每列）要輸出的欄位，別名在這裡才產生。',
          '`ORDER BY`：排序，可以用 `SELECT` 的別名，也可以用彙總函式。',
          '`LIMIT`：最後才裁切列數。',
        ] },
        { type: 'table', head: ['', '`WHERE`', '`HAVING`'], rows: [
          ['篩選的對象', '每一列', '每一組'],
          ['執行時機', '分組之前', '分組並算完彙總之後'],
          ['能不能用彙總函式', '不能：`WHERE AVG(score) > 80` 會得到 `misuse of aggregate`', '可以，這正是它的用途'],
          ['對彙總結果的影響', '改變彙總的輸入（哪些列被算進去）', '不改變任何組的數值，只決定哪些組留下'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把組的條件寫進 WHERE', text: '在練習場試試 `SELECT course_id FROM enrollments WHERE AVG(score) >= 80 GROUP BY course_id;`，會得到 `misuse of aggregate: AVG()`：`WHERE` 執行時還沒有組，也就沒有平均可算。反過來的錯誤更隱蔽：想要「平均至少 75 分的課程」卻寫成 `WHERE score >= 75`，查詢照樣執行，但算的是「75 分以上那些成績的平均」，低分全被提前丟掉，每門課的平均都被灌高。' },
        { type: 'callout', tone: 'tip', title: '分組欄位的條件放 WHERE', text: '條件只用到分組欄位時，例如「只看 CS 開頭的課」，寫成 `WHERE course_id LIKE \'CS%\'` 或 `HAVING course_id LIKE \'CS%\'` 結果相同，因為整組要嘛全部通過、要嘛全部不通過。放在 `WHERE` 比較好：先丟掉不要的列，要分組的資料就少了。只有用到彙總結果的條件才非得放 `HAVING`。' },
        { type: 'callout', tone: 'note', title: 'HAVING 裡能不能用別名', text: '依邏輯順序，`HAVING` 在 `SELECT` 之前，所以標準 SQL 與 PostgreSQL 不允許在 `HAVING` 使用 `SELECT` 的別名，要把彙總再寫一次：`HAVING AVG(score) >= 80`。SQLite 與 MySQL 比較寬鬆，接受 `HAVING avg_score >= 80`。為了可攜性，本課在 `HAVING` 一律寫出彙總函式；`ORDER BY` 在 `SELECT` 之後，各家都可以用別名。' },
      ],
    },
    {
      id: 'recipe', title: '寫出「每類平均且超過門檻」的分組查詢',
      blocks: [
        { type: 'p', text: '把本課串起來，遇到「每個○○的△△，只列出□□的」這類需求，照下面的順序想：' },
        { type: 'list', ordered: true, items: [
          '一組是什麼？「每個○○」就是 `GROUP BY` 的欄位，也是結果的一列代表什麼。',
          '哪些列根本不該算？寫進 `WHERE`，它會在分組前生效。',
          '每組要算什麼？選彙總函式，並想清楚 NULL：`COUNT(*)` 還是 `COUNT(欄位)`？`AVG` 略過 NULL 是不是你要的意思？',
          '哪些組要留下？用到彙總結果的條件寫進 `HAVING`，用未四捨五入的值比較。',
          '怎麼呈現？`ROUND` 處理小數、`AS` 取欄位名稱、`ORDER BY` 排序並加上平手規則（例如再依鍵排序），讓順序在任何資料上都唯一。',
          '最後檢查 `SELECT` 與 `ORDER BY` 的每個欄位：不是分組欄位，就要包在彙總函式裡。',
        ] },
        { type: 'p', text: '例：「每位老師的課程中，已評分成績平均至少 80 分者，列出老師、選課筆數、已評分筆數與平均（小數 1 位），依平均由高到低」。一組是一位老師，但老師在 `courses`、成績在 `enrollments`，所以先用 DB02 的逗號合併 `FROM courses, enrollments WHERE courses.id = enrollments.course_id`，再 `GROUP BY courses.teacher`，`HAVING AVG(enrollments.score) >= 80`，`ORDER BY avg_score DESC, courses.teacher`。執行預設查詢「每位老師的平均（逗號合併）」：周老師教 CS101 與 CS102，共 7 筆選課、6 筆有成績，平均 (325 + 166) ÷ 6 ≈ 81.8；鄭老師 85；許老師 68 被 `HAVING` 篩掉。藝術欣賞沒有人選，它的 NULL 老師在合併時就沒有配對，所以不會出現 NULL 組。' },
        { type: 'callout', tone: 'tip', title: '先不加 HAVING 看一次', text: '寫分組查詢時，先把 `HAVING` 拿掉執行一次，看看每一組算出來的數字對不對（可以和手算比對），確認之後再加上 `HAVING`。結果少了某一組時，就能分辨是被 `WHERE` 丟光了列、根本沒有那個鍵，還是被 `HAVING` 篩掉。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-count-star-vs-column', prompt: '資料結構（CS102）有三筆選課：陳志豪（NULL）、林怡君 90、吳承恩 76。下面的查詢回傳什麼？',
      code: { language: 'SQL', text: sql`SELECT COUNT(*), COUNT(score)
FROM enrollments
WHERE course_id = 'CS102';` },
      options: ['3 與 3', '2 與 2', '3 與 2', '3 與 NULL'],
      answer: 2, explanation: '`COUNT(*)` 數列數，三列都算，是 3；`COUNT(score)` 只數 `score` 不是 NULL 的列，陳志豪還沒有成績，所以是 2。「3 與 3」是以為 `COUNT(欄位)` 也會算 NULL；「2 與 2」是以為 `COUNT(*)` 也會略過 NULL，但它根本不看欄位值；`COUNT` 永遠回傳整數，就算全部都是 NULL 也是 0，不會是 NULL。',
    },
    {
      id: 'q-avg-null', prompt: '微積分（MA101）的成績是 78、58 與 NULL（尚未評分）。`SELECT AVG(score) FROM enrollments WHERE course_id = \'MA101\';` 的結果是多少？',
      options: ['45.333…（NULL 當成 0）', 'NULL（只要有一個 NULL，平均就是 NULL）', '136（總和）', '68'],
      answer: 3, explanation: '`AVG` 略過 NULL，分母只算有值的 2 列：(78 + 58) ÷ 2 = 68。45.333… 是把 NULL 當成 0 的 `AVG(COALESCE(score, 0))`，要明確寫出來才會這樣算；「一個 NULL 就讓結果變 NULL」是 `78 + NULL` 這種一般運算的規則，彙總函式不是這樣；136 是 `SUM(score)`，不是平均。',
    },
    {
      id: 'q-where-aggregate', prompt: '想找出平均成績至少 80 分的課程。下列哪一個查詢會因為語法規則而執行失敗？',
      options: [
        '`SELECT course_id FROM enrollments WHERE AVG(score) >= 80 GROUP BY course_id;`',
        '`SELECT course_id FROM enrollments GROUP BY course_id HAVING AVG(score) >= 80;`',
        '`SELECT course_id, AVG(score) FROM enrollments GROUP BY course_id HAVING AVG(score) >= 80;`',
        '`SELECT course_id FROM enrollments WHERE score >= 80 GROUP BY course_id;`',
      ],
      answer: 0, explanation: '`WHERE` 在分組之前逐列執行，那時還沒有組，也就沒有平均可算，SQLite 回報 `misuse of aggregate: AVG()`。第二、三個查詢正確：組的條件放 `HAVING`，`HAVING` 的彙總不一定要出現在 `SELECT` 裡。最後一個可以執行，但意思錯了：它列出「至少有一筆 80 分以上成績」的課程，而不是平均至少 80 分的課程。',
    },
    {
      id: 'q-logical-order', prompt: '下列哪一個是 `SELECT` 敘述各子句的邏輯執行順序？',
      options: [
        '`SELECT` → `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `ORDER BY`',
        '`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`',
        '`FROM` → `GROUP BY` → `WHERE` → `HAVING` → `SELECT` → `ORDER BY`',
        '`FROM` → `WHERE` → `GROUP BY` → `SELECT` → `HAVING` → `ORDER BY`',
      ],
      answer: 1, explanation: '先決定來源（`FROM`），逐列篩選（`WHERE`），分組（`GROUP BY`），逐組篩選（`HAVING`），再算輸出欄位（`SELECT`），最後排序（`ORDER BY`）。第一個是書寫順序，不是執行順序；把 `GROUP BY` 放在 `WHERE` 前面，就沒辦法在分組前丟掉不要的列；把 `HAVING` 放在 `SELECT` 之後也不對：`HAVING` 在 `SELECT` 之前執行，所以標準 SQL 不允許在 `HAVING` 使用 `SELECT` 的別名。',
    },
    {
      id: 'q-two-column-groups', prompt: '`students` 有 3 個年級（10、11、12）、3 個班（甲、乙、丙），共 8 位學生，實際出現的（年級, 班級）組合有 7 種。下面的查詢回傳幾列？',
      code: { language: 'SQL', text: sql`SELECT grade, class, COUNT(*)
FROM students
GROUP BY grade, class;` },
      options: ['3', '7', '8', '9'],
      answer: 1, explanation: '依兩個欄位分組時，鍵是 (grade, class) 的組合，每個實際出現的組合是一組，所以是 7 列（10 年級甲班有 2 人，算同一組）。3 是只依年級或只依班級分組；8 是以為每位學生一列，忘了同組會合併；9 是 3 × 3 的所有可能組合，但沒有出現在資料裡的組合不會憑空產生一組。',
    },
    {
      id: 'q-bare-column', prompt: '關於下面這個查詢，哪一個說法正確？',
      code: { language: 'SQL', text: sql`SELECT course_id, score
FROM enrollments
GROUP BY course_id;` },
      options: [
        '它在任何 DBMS 都會報錯',
        '`score` 會顯示每門課所有成績的總和',
        'SQLite 會執行它，`score` 取自組內某一列，哪一列沒有保證；PostgreSQL 會報錯',
        'SQLite 會為每筆選課各輸出一列',
      ],
      answer: 2, explanation: '`score` 既不是分組欄位也沒有彙總，每組卻只有一格可放。標準 SQL 與 PostgreSQL 拒絕執行；SQLite 接受這種裸欄位，從組內某一列取值，結果可能不是你以為的值（練習場上 CS102 就顯示 NULL）。所以「任何 DBMS 都報錯」不對；SQLite 不會自動幫你加總，要總和就寫 `SUM(score)`；有 `GROUP BY` 時每組只輸出一列，不會每筆選課一列。',
    },
    {
      id: 'q-empty-aggregate', prompt: '藝術欣賞（AR101）沒有任何選課紀錄。下面的查詢回傳什麼？',
      code: { language: 'SQL', text: sql`SELECT COUNT(*), MAX(score)
FROM enrollments
WHERE course_id = 'AR101';` },
      options: ['一列：0 與 0', '沒有任何列', '一列：NULL 與 NULL', '一列：0 與 NULL'],
      answer: 3, explanation: '沒有 `GROUP BY` 時，整個 `WHERE` 結果是一組，即使一列都沒有，也會輸出一列。計數沒有東西是 0；沒有任何值的最大值不存在，所以 `MAX` 是 NULL。「0 與 0」把不存在的最大值當成 0；「沒有任何列」是加了 `GROUP BY course_id` 才會發生的情況，因為那時一組都沒有；`COUNT` 不會回傳 NULL。',
    },
  ],
  sql: {
    dataset: 'school',
    presets: [
      { label: '選課（enrollments）', sql: 'SELECT * FROM enrollments;' },
      { label: '每門課的人數與平均', sql: sql`SELECT course_id, COUNT(*) AS enrolled, COUNT(score) AS scored,
  ROUND(AVG(score), 1) AS avg_score
FROM enrollments
GROUP BY course_id
ORDER BY course_id;` },
      { label: '每班人數與有 email 的人數', sql: sql`SELECT class, COUNT(*) AS students, COUNT(email) AS with_email
FROM students
GROUP BY class
ORDER BY class;` },
      { label: '空集合的彙總：AR101', sql: sql`SELECT COUNT(*), SUM(score), AVG(score), MAX(score)
FROM enrollments
WHERE course_id = 'AR101';` },
      { label: '危險：沒有彙總的欄位', sql: sql`SELECT course_id, score
FROM enrollments
GROUP BY course_id;` },
      { label: '每位老師的平均（逗號合併）', sql: sql`SELECT courses.teacher, COUNT(*) AS enrolled,
  COUNT(enrollments.score) AS scored,
  ROUND(AVG(enrollments.score), 1) AS avg_score
FROM courses, enrollments
WHERE courses.id = enrollments.course_id
GROUP BY courses.teacher
HAVING AVG(enrollments.score) >= 80
ORDER BY avg_score DESC, courses.teacher;` },
    ],
    examples: [
      {
        id: 'ma101-stats', title: '五個彙總函式：微積分的成績統計', dataset: 'school',
        description: 'WHERE 先留下 MA101 的 3 筆選課，彙總函式再把它們算成一列；NULL 被 SUM、AVG、MIN、MAX 略過。',
        sql: sql`SELECT COUNT(*), SUM(score), AVG(score), MIN(score), MAX(score)
FROM enrollments
WHERE course_id = 'MA101';`,
        result: { columns: ['COUNT(*)', 'SUM(score)', 'AVG(score)', 'MIN(score)', 'MAX(score)'], rows: [[3, 136, 68, 58, 78]] },
      },
      {
        id: 'null-effects', title: 'NULL 對 COUNT 與 AVG 的影響', dataset: 'school',
        description: '三種 COUNT 與兩種平均：AVG 略過 NULL（967 ÷ 12），把 NULL 換成 0 後變成 967 ÷ 14。',
        sql: sql`SELECT COUNT(*), COUNT(score), COUNT(DISTINCT student_id),
  ROUND(AVG(score), 1) AS avg_scored,
  ROUND(AVG(COALESCE(score, 0)), 1) AS avg_null_as_zero
FROM enrollments;`,
        result: { columns: ['COUNT(*)', 'COUNT(score)', 'COUNT(DISTINCT student_id)', 'avg_scored', 'avg_null_as_zero'], rows: [[14, 12, 7, 80.6, 69.1]] },
      },
      {
        id: 'per-course-stats', title: 'GROUP BY：每門課的統計', dataset: 'school',
        description: '依 course_id 分成 4 組，每組各算一次彙總；CS102 與 MA101 各有一筆 NULL，所以 enrolled 與 scored 不同。',
        sql: sql`SELECT course_id, COUNT(*) AS enrolled, COUNT(score) AS scored,
  ROUND(AVG(score), 1) AS avg_score, MIN(score) AS low, MAX(score) AS high
FROM enrollments
GROUP BY course_id
ORDER BY course_id;`,
        result: { columns: ['course_id', 'enrolled', 'scored', 'avg_score', 'low', 'high'], rows: [
          ['CS101', 4, 4, 81.3, 67, 92],
          ['CS102', 3, 2, 83, 76, 90],
          ['DB101', 4, 4, 85, 73, 95],
          ['MA101', 3, 2, 68, 58, 78],
        ] },
      },
      {
        id: 'class-grade-counts', title: '依兩個欄位分組：每個年級、每班的人數', dataset: 'school',
        description: '鍵是 (grade, class) 的組合；9 種可能組合中只有 7 種出現在資料裡，所以結果是 7 列。',
        sql: sql`SELECT grade, class, COUNT(*) AS students
FROM students
GROUP BY grade, class
ORDER BY grade, class;`,
        result: { columns: ['grade', 'class', 'students'], rows: [
          [10, '乙', 1], [10, '甲', 2],
          [11, '丙', 1], [11, '乙', 1], [11, '甲', 1],
          [12, '丙', 1], [12, '乙', 1],
        ] },
      },
      {
        id: 'where-then-having', title: 'WHERE 篩列、HAVING 篩組', dataset: 'school',
        description: '先留下 80 分以上的成績（列的條件），分組計數後，只留下至少 2 筆的課程（組的條件）。',
        sql: sql`SELECT course_id, COUNT(*) AS high_scores
FROM enrollments
WHERE score >= 80
GROUP BY course_id
HAVING COUNT(*) >= 2
ORDER BY course_id;`,
        result: { columns: ['course_id', 'high_scores'], rows: [['CS101', 3], ['DB101', 3]] },
      },
    ],
    exercises: [
      {
        id: 'ex-course-counts', title: '每門課的選課人數與已評分人數',
        statement: '對 `enrollments` 依課程分組，列出每門有人選的課程：課程代號 `course_id`、選課筆數 `enrolled`（不論有沒有成績）、已評分筆數 `scored`（`score` 不是 NULL 的筆數）。欄位依序為 `course_id`、`enrolled`、`scored`，依 `course_id` 由小到大排列。',
        dataset: 'school', hidden: ['school-b'], ordered: true, columnNames: true,
        starter: sql`SELECT course_id, ... AS enrolled, ... AS scored
FROM enrollments
GROUP BY ...
ORDER BY course_id;`,
        hints: [
          '「每門課」就是 `GROUP BY course_id`。',
          '兩個計數只差在 NULL：一個數列數，一個數 `score` 有值的列。',
          '不要用 `WHERE score IS NOT NULL`：它會在分組前就把沒有成績的列丟掉，`enrolled` 也會跟著變少。',
        ],
        solution: sql`SELECT course_id, COUNT(*) AS enrolled, COUNT(score) AS scored
FROM enrollments
GROUP BY course_id
ORDER BY course_id;`,
        alternatives: [
          sql`SELECT course_id, COUNT(DISTINCT student_id) AS enrolled,
  COUNT(score) AS scored
FROM enrollments
GROUP BY course_id
ORDER BY course_id;`,
        ],
        mistakes: [
          { sql: sql`SELECT course_id, COUNT(score) AS enrolled, COUNT(score) AS scored
FROM enrollments
GROUP BY course_id
ORDER BY course_id;`, why: '`enrolled` 用了 `COUNT(score)`，沒有成績的選課就不算了：CS102 有 3 筆選課，卻只數到 2。' },
          { sql: sql`SELECT course_id, COUNT(*) AS enrolled, COUNT(*) AS scored
FROM enrollments
GROUP BY course_id
ORDER BY course_id;`, why: '`COUNT(*)` 不看欄位值，NULL 成績也算進 `scored`，於是兩欄永遠相等。' },
          { sql: sql`SELECT course_id, COUNT(*) AS enrolled, COUNT(score) AS scored
FROM enrollments
WHERE score IS NOT NULL
GROUP BY course_id
ORDER BY course_id;`, why: '`WHERE` 在分組前執行，先丟掉了沒有成績的列，所以 `enrolled` 也少算了：`WHERE` 改變的是彙總的輸入。' },
        ],
      },
      {
        id: 'ex-courses-above-75', title: '已評分平均至少 75 分的課程',
        statement: '找出已評分成績的平均（不把 NULL 當 0）至少 75 分的課程。欄位依序為課程代號 `course_id`、已評分筆數 `scored`、平均成績 `avg_score`（用 `ROUND(…, 1)` 四捨五入到小數 1 位；判斷門檻時用未四捨五入的平均）。依 `avg_score` 由高到低排列，相同時依 `course_id` 由小到大。',
        dataset: 'school', hidden: ['school-b'], ordered: true, columnNames: true,
        starter: sql`SELECT course_id, ... AS scored, ROUND(..., 1) AS avg_score
FROM enrollments
GROUP BY course_id
...
ORDER BY ...;`,
        hints: [
          '`AVG(score)` 本來就只算有成績的列；`scored` 也只數有成績的列，用 `COUNT(score)`。',
          '「平均至少 75 分」是對每一組的條件，要等分組算出平均之後才知道，寫在 `HAVING AVG(score) >= 75`。',
          '`ORDER BY avg_score DESC, course_id`：第二個鍵是平手規則，讓順序在任何資料上都唯一。',
        ],
        solution: sql`SELECT course_id, COUNT(score) AS scored, ROUND(AVG(score), 1) AS avg_score
FROM enrollments
GROUP BY course_id
HAVING AVG(score) >= 75
ORDER BY avg_score DESC, course_id;`,
        alternatives: [
          sql`SELECT course_id, COUNT(*) AS scored, ROUND(AVG(score), 1) AS avg_score
FROM enrollments
WHERE score IS NOT NULL
GROUP BY course_id
HAVING SUM(score) >= 75 * COUNT(*)
ORDER BY avg_score DESC, course_id;`,
        ],
        mistakes: [
          { sql: sql`SELECT course_id, COUNT(score) AS scored, ROUND(AVG(score), 1) AS avg_score
FROM enrollments
WHERE score >= 75
GROUP BY course_id
ORDER BY avg_score DESC, course_id;`, why: '把組的條件寫成列的條件：`WHERE score >= 75` 先丟掉低分，算的是「75 分以上成績的平均」，每門課的平均都被灌高，人數也變少。' },
          { sql: sql`SELECT course_id, COUNT(*) AS scored, ROUND(SUM(score) * 1.0 / COUNT(*), 1) AS avg_score
FROM enrollments
GROUP BY course_id
HAVING SUM(score) * 1.0 / COUNT(*) >= 75
ORDER BY avg_score DESC, course_id;`, why: '分母用了 `COUNT(*)`，等於把尚未評分的 NULL 當成 0 分：CS102 的平均從 83 掉到 55.3，被篩掉了；`scored` 也把沒有成績的列算進去。' },
          { sql: sql`SELECT course_id, COUNT(score) AS scored, ROUND(AVG(score), 1) AS avg_score
FROM enrollments
WHERE AVG(score) >= 75
GROUP BY course_id
ORDER BY avg_score DESC, course_id;`, why: '`WHERE` 不能用彙總函式，會得到 `misuse of aggregate: AVG()`：`WHERE` 執行時還沒有分組，也就沒有平均。' },
        ],
      },
      {
        id: 'ex-students-two-passes', title: '至少兩門及格的學生',
        statement: '成績至少 60 分算及格（NULL 不算及格）。列出及格課程數至少 2 門的學生：學號 `student_id` 與及格課程數 `passed`，欄位依序為 `student_id`、`passed`，順序不拘。',
        dataset: 'school', hidden: ['school-b'], ordered: false, columnNames: true,
        hints: [
          '這題有兩層條件：「及格」是對每一筆選課（列），「至少 2 門」是對每位學生（組）。',
          '先用 `WHERE score >= 60` 只留下及格的選課，再 `GROUP BY student_id`，這時 `COUNT(*)` 就是及格的門數。',
          '「至少 60 分」包含剛好 60 分，所以是 `>=`。最後用 `HAVING COUNT(*) >= 2` 篩選學生。',
        ],
        solution: sql`SELECT student_id, COUNT(*) AS passed
FROM enrollments
WHERE score >= 60
GROUP BY student_id
HAVING COUNT(*) >= 2;`,
        alternatives: [
          sql`SELECT student_id, COUNT(CASE WHEN score >= 60 THEN 1 END) AS passed
FROM enrollments
GROUP BY student_id
HAVING COUNT(CASE WHEN score >= 60 THEN 1 END) >= 2;`,
        ],
        mistakes: [
          { sql: sql`SELECT student_id, COUNT(*) AS passed
FROM enrollments
GROUP BY student_id
HAVING COUNT(*) >= 2;`, why: '少了列的條件，數的是選課門數而不是及格門數：不及格（58 分）或尚未評分的選課也被算進去。' },
          { sql: sql`SELECT student_id, COUNT(score) AS passed
FROM enrollments
GROUP BY student_id
HAVING COUNT(score) >= 2;`, why: '`COUNT(score)` 只排除了 NULL，沒有排除不及格的成績：張家豪 58 分與 81 分，被算成 2 門及格。' },
          { sql: sql`SELECT student_id, COUNT(*) AS passed
FROM enrollments
WHERE score > 60
GROUP BY student_id
HAVING COUNT(*) >= 2;`, why: '「至少 60 分」包含 60 分，`> 60` 把剛好 60 分的及格成績排除了；在另一組資料上就會少一位學生。' },
        ],
      },
    ],
  },
};
