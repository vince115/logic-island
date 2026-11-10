import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB10 正規化. SQL lesson with the normalization-steps activity (Phase F.1b): SQL runs in tests/curriculum-sql.test.ts, normalization in tests/curriculum-db.test.ts. */
export const DB10: LessonContent = {
  lessonId: 'DB10',
  motivation: '一張「什麼都記」的修課紀錄表用起來很方便：一列就有學生姓名、主修系所、系辦公室、課名和授課老師，查詢連 `JOIN` 都不用寫。代價是同一件事被抄了很多遍：「資訊工程系的辦公室在 E301」寫了好幾次，只要有一次寫錯或漏改，資料庫就同時相信兩個答案。正規化（normalization）是一套有理論根據的拆表方法：先說清楚資料必須遵守的規則（函數相依），再用這些規則判斷一張表重複在哪裡、會出現哪些插入、更新、刪除異常，然後一步一步拆到 2NF、3NF 或 BCNF，並確認拆開的表合併回來一列不多、一列不少，原本的規則也都還檢查得到。DB09 從 ER 圖轉出的綱要通常已經很接近 3NF；本課給你一把尺，檢查任何一張表（包括別人留下的、從試算表匯入的）設計得好不好，也讓你判斷什麼時候值得為了查詢速度，刻意把資料再存一份。',
  sections: [
    {
      id: 'anomalies', title: '一張表裝太多：插入、更新、刪除異常',
      blocks: [
        { type: 'p', text: '本課練習場的資料只有一張表 `course_records`：9 筆修課紀錄，主鍵是 `(student_id, course_id)`。每一列記的是「某位學生修了某門課、得到幾分」，但同一列還順便帶著三種別的事實：這位學生叫什麼、主修哪個系；那個系的辦公室在哪裡；那門課叫什麼、誰教。於是「CS101 是周老師教的程式設計」抄了 3 次，「DB101 是鄭老師教的資料庫概論」抄了 4 次，資訊工程系的辦公室抄了 4 次。這種重複會造成三種典型的毛病，稱為資料異常（anomaly）：' },
        { type: 'table', head: ['異常', '在 course_records 上的例子', '根源'], rows: [
          ['更新異常', '資訊工程系辦公室搬家，要改 4 列；漏改一列，資料就互相矛盾。資料裡陳志豪 DB101 那一列已經被記成 E302，其他列是 E301', '同一個事實存了很多份'],
          ['插入異常', '新開一門 AI101、還沒有人選，就無法記下它的課名與老師：主鍵 `student_id` 不能是空的', '課程的事實只能依附在選課紀錄上'],
          ['刪除異常', '林怡君退掉她的兩門課，「電機工程系在 B105」也跟著從資料庫消失', '不相干的事實被綁在同一列'],
        ] },
        { type: 'p', text: '先看更新異常。假設系辦公室搬到 E401，負責的程式只改了王小明的紀錄：' },
        { type: 'example', id: 'update-anomaly' },
        { type: 'p', text: '同一個系現在有三個答案：E301、E302、E401，問「資訊工程系的辦公室在哪」得看你剛好讀到哪一列。正確的改法是把這個系的每一列都改掉，SQLite 的 `changes()` 告訴我們這需要動 4 列：' },
        { type: 'example', id: 'update-every-row' },
        { type: 'p', text: '這次資料一致了，但問題沒有消失：一個系有 1000 名修課紀錄就要改 1000 列，而且任何一段忘了寫對 `WHERE` 的程式都會再製造矛盾。資料庫沒有辦法擋下這種錯誤，因為對這張表來說，每一列各自都是合法的。' },
        { type: 'callout', tone: 'note', title: 'changes() 是 SQLite 的函式', text: '`changes()` 回傳最近一個 `INSERT`、`UPDATE` 或 `DELETE` 改了幾列，這是 SQLite 提供的函式，不是標準 SQL。其他 DBMS 各有自己的方式，例如 PostgreSQL 在執行結果回報 `UPDATE 4`，MySQL 有 `ROW_COUNT()`。' },
        { type: 'p', text: '插入異常可以在練習場自己試：執行 `INSERT INTO course_records (course_id, course_title, instructor) VALUES (\'AI101\', \'人工智慧\', \'江老師\');`，SQLite 回報 `NOT NULL constraint failed: course_records.student_id`。實體完整性（DB02）要求主鍵有值，這張表也把 `student_id` 宣告成 `NOT NULL`。硬塞一個假學生（例如學號 0）雖然存得進去，卻會讓「有幾位學生」「平均成績」之類的查詢全部算錯。' },
        { type: 'p', text: '最後是刪除異常。林怡君是唯一主修電機工程的學生：' },
        { type: 'example', id: 'delete-anomaly' },
        { type: 'p', text: '電機工程系和它的辦公室 B105 從結果中消失了。她修過的課倒是還在：李佳穎也修微積分（MA101），程式設計（CS101）也還有別人修，所以課程資料這次逃過一劫。哪些事實會跟著刪掉，取決於資料剛好長什麼樣子，這正是設計有問題的訊號。' },
        { type: 'callout', tone: 'tip', title: '三種異常，同一個病根', text: '三種異常都來自同一件事：一張表同時記錄了好幾種彼此獨立的事實。解法是讓每個事實只存一次，也就是把表拆開。問題在於怎麼拆才對、怎麼知道拆完沒有弄丟資料，這需要先把「事實之間的規則」寫清楚：函數相依。' },
      ],
    },
    {
      id: 'functional-dependency', title: '函數相依：從規則來，用資料檢驗',
      blocks: [
        { type: 'p', text: '函數相依（functional dependency，FD）`X → Y` 的意思是：任何兩列只要 `X` 的值相同，`Y` 的值就一定相同。讀作「X 決定 Y」或「Y 函數相依於 X」。例如 `student_id → student_name` 表示同一個學號只能對應一個姓名。`X` 與 `Y` 都可以是好幾個屬性；`Y` 包含在 `X` 裡的相依（例如 `{student_id, course_id} → course_id`）一定成立，稱為平凡（trivial）相依，沒有資訊量。`course_records` 依學校的規定有這些相依：' },
        { type: 'table', head: ['函數相依', '來自哪條規定'], rows: [
          ['`student_id → student_name, major`', '每位學生有一個姓名、一個主修系所'],
          ['`major → major_office`', '每個系只有一間系辦公室'],
          ['`course_id → course_title, instructor`', '每門課有一個課名，由一位老師授課'],
          ['`{student_id, course_id} → score`', '每位學生的每門課只有一個成績'],
        ] },
        { type: 'p', text: '規則可以拿資料來檢驗。`X → Y` 被違反，等於「某個 `X` 值的那一組列裡，出現了兩種以上不同的 `Y`」，用 DB04 的分組就能寫出來：`GROUP BY X HAVING COUNT(DISTINCT Y) > 1`。檢查 `major → major_office`：' },
        { type: 'example', id: 'fd-check-office' },
        { type: 'p', text: '資訊工程這一組有兩種辦公室，規則被違反了。注意判斷的方向：學校規定每個系只有一間系辦，所以錯的是資料（第 1 節的更新異常留下的痕跡），不是規則。一次檢查好幾條相依，可以把每條的違規組數用 `UNION ALL` 接起來；每一段的 `FROM (…) AS v` 是 DB06 介紹的 FROM 子查詢，先找出違規的組，外層再數有幾組：' },
        { type: 'example', id: 'fd-scan' },
        { type: 'callout', tone: 'warning', title: '資料只能推翻相依，不能證明相依', text: '上面的結果裡，`instructor → course_id`（每位老師只教一門課）與 `student_name → student_id`（姓名不重複）都是 0 組違規，但它們不是規則：下學期周老師可能多開一門課，新生裡也可能有人和王小明同名。9 列資料剛好沒有反例，什麼也證明不了；只要一個反例就能推翻一條相依。函數相依要從需求與業務規則來（DB08 的 ER 圖裡，實體的鍵與「多對一」關係就是相依的來源），用 SQL 檢查的用途是找出違反已知規則的髒資料，或對一條「以為成立」的規則提出懷疑，而不是從資料「發現」規則。' },
        { type: 'p', text: '還有一個細節：`COUNT(DISTINCT y)` 會略過 NULL（DB04），所以如果 `Y` 可能是 NULL，「一列有值、一列是 NULL」不會被這個查詢算成違規。`course_records` 的 `major_office` 宣告為 `NOT NULL`，這裡沒有這個問題；檢查允許 NULL 的欄位時要另外處理。' },
      ],
    },
    {
      id: 'closure-keys', title: '屬性閉包與候選鍵',
      blocks: [
        { type: 'p', text: '有了函數相依，就能算出一組屬性「一共決定了什麼」。屬性閉包（closure）`X⁺` 的算法：從 `X` 開始，只要某條相依的左邊全部已經在集合裡，就把它的右邊加進來，重複到沒有東西可加為止。如果 `X⁺` 包含了表的全部屬性，`X` 就是超鍵；不能再拿掉任何屬性的超鍵就是候選鍵（DB02）。出現在某個候選鍵裡的屬性稱為鍵屬性（prime attribute），其餘的是非鍵屬性。在 `course_records` 上算幾個閉包：' },
        { type: 'table', head: ['X', 'X⁺', '結論'], rows: [
          ['`{student_id}`', '`student_id, student_name, major, major_office`（經由 `major → major_office` 加入系辦）', '不是超鍵：決定不了課程與成績'],
          ['`{course_id}`', '`course_id, course_title, instructor`', '不是超鍵'],
          ['`{student_id, course_id}`', '全部 8 個屬性（最後由 `{student_id, course_id} → score` 加入成績）', '超鍵；拿掉任何一個就不是超鍵，所以是候選鍵'],
          ['`{student_id, course_id, major}`', '全部 8 個屬性', '超鍵，但不是最小的：`major` 是多餘的'],
        ] },
        { type: 'p', text: '找出全部候選鍵有個捷徑：沒有出現在任何相依右邊的屬性，沒有別的屬性能決定它，所以它一定在每個候選鍵裡。這裡的 `student_id` 與 `course_id` 就是，而它們合起來已經是超鍵，因此 `course_records` 只有一個候選鍵 `{student_id, course_id}`：鍵屬性是這兩個，其餘 6 個都是非鍵屬性。如果必備的屬性還不夠，就一個一個加入其他屬性試，並跳過已經包含某個候選鍵的組合。' },
        { type: 'p', text: '頁面下方的「正規化工作台」載入了 `course_records` 和它的 4 條相依。在「屬性閉包」勾選幾個屬性，就能看到閉包和它是不是超鍵、是不是候選鍵；後面幾節拆表時，也可以在「分解與檢查」自己試不同的拆法。' },
        { type: 'callout', tone: 'note', title: '工作台算的是你給的規則', text: '工作台的閉包、候選鍵與正規形式，都是從列出的函數相依推算出來的，不看範例資料。相依寫漏了或寫錯了，算出來的結論也跟著錯，所以第 2 節「相依從規則來」是後面所有步驟的基礎。' },
      ],
    },
    {
      id: 'first-normal-form', title: '1NF：每一格只放一個值',
      blocks: [
        { type: 'p', text: '第一正規形式（1NF）要求每個屬性的值都是不可再分的單一值（原子值），沒有「一格放一串清單」或「同一種資料開好幾個欄位」的重複群組。關聯模型本來就假設每一格是一個值，工作台與後面的 2NF、3NF、BCNF 判斷也都以 1NF 為前提。常見的非 1NF 設計：' },
        { type: 'table', head: ['設計', '長相', '問題'], rows: [
          ['一格放清單', '`courses` 欄位存 `\'CS101, DB101\'`', '找修 CS101 的人要寫 `LIKE \'%CS101%\'`，連 `CS1010` 也會被找到；無法對單一課程設外鍵；退一門課得改字串'],
          ['重複群組欄位', '`course1`、`course2`、`course3` 三個欄位', '第四門課沒地方放；每個查詢要把三個欄位都比一次；大部分格子是 NULL'],
          ['1NF 的做法', '一列一筆修課：`(student_id, course_id, …)`', '每一格一個值，可以設主鍵 `(student_id, course_id)` 與指向課程的外鍵'],
        ] },
        { type: 'p', text: '`course_records` 每一格都只有一個值，所以它已經符合 1NF，卻仍然充滿第 1 節的異常。1NF 只是起點：它解決「一格裡有好幾個值」，解決不了「同一個事實存在好幾列」，那是 2NF 以後的工作。' },
        { type: 'callout', tone: 'note', title: '「原子」看用途而定', text: '一個值算不算原子，取決於你會不會單獨使用它的一部分。完整地址如果只拿來印在信封上，存成一格就好；如果要依城市統計，城市就該是獨立的欄位。有些 DBMS 提供陣列或 JSON 型別的欄位（例如 PostgreSQL 的陣列型別），把清單存進一格在技術上做得到，但清單裡的項目就無法像一般欄位那樣設外鍵或用 `JOIN` 處理，傳統的正規化分析也不涵蓋它們。' },
      ],
    },
    {
      id: 'second-third-nf', title: '2NF 與 3NF：一步一步拆開',
      blocks: [
        { type: 'p', text: '兩個正規形式的定義（以下都假設已符合 1NF，並且看的是所有候選鍵，不只主鍵）：' },
        { type: 'list', items: [
          '第二正規形式（2NF）：沒有任何非鍵屬性部分相依於候選鍵，也就是非鍵屬性不能只相依於某個候選鍵的一部分。只有組合鍵才可能違反：候選鍵全是單一屬性的表一定符合 2NF。`course_records` 的 `student_name` 只相依於鍵的一部分 `student_id`，所以它只到 1NF。',
          '第三正規形式（3NF）：表中每個非平凡的相依 `X → A`，要嘛 `X` 是超鍵，要嘛 `A` 是鍵屬性。最常見的違規是遞移相依：鍵決定一個非鍵屬性，那個非鍵屬性又決定另一個非鍵屬性，例如 `student_id → major → major_office`。',
        ] },
        { type: 'p', text: '有個常被引用的口訣（William Kent）可以幫忙記：非鍵屬性要相依於鍵、整個鍵，而且只相依於鍵。「整個鍵」是 2NF，「只相依於鍵」是 3NF。下面把 `course_records` 一步一步拆開；每一步每張表的候選鍵、成立的相依、最高正規形式，以及整個分解是否無損、是否保留相依，都是頁面依規則算出來的：' },
        { type: 'example', id: 'nf-records' },
        { type: 'p', text: '每一步的拆法都一樣：挑一條造成違規的相依 `X → Y`，把 `X` 與 `Y` 搬到一張以 `X` 為鍵的新表，原本的表拿掉 `Y`、留下 `X`。留下的 `X` 就是兩張表之間的連結，日後成為指向新表主鍵的外鍵。每一步消除了哪些異常：' },
        { type: 'table', head: ['步驟', '去掉的相依', '消除的異常'], rows: [
          ['原始表 → 2NF', '部分相依：`student_id → student_name, major, major_office` 與 `course_id → course_title, instructor`', '課名、老師、學生姓名不再每筆選課抄一次（更新異常）；新課程沒人選也能存進 `courses`（插入異常）；學生退掉所有課，學生資料仍留在 `students`（刪除異常）'],
          ['2NF → 3NF', '遞移相依：`student_id → major → major_office`', '系辦公室只記一次，搬家改一列（更新異常）；還沒有學生的新系所也能登記（插入異常）；林怡君離開後，電機工程系的辦公室仍在 `majors`（刪除異常）'],
        ] },
        { type: 'callout', tone: 'tip', title: '拆完後的自我檢查', text: '每張表應該只描述一種東西（學生、系所、課程、修課），而且每個非鍵欄位都在回答「關於這張表的鍵」的問題：`majors` 的 `major_office` 回答「這個系的辦公室在哪」，不再回答「這位學生的系辦在哪」。如果某個欄位其實在描述另一個欄位，它就該搬去另一張表。' },
      ],
    },
    {
      id: 'lossless', title: '無損分解與相依保留：用 SQL 驗證',
      blocks: [
        { type: 'p', text: '拆表有兩個條件必須守住。第一是無損（lossless）：把拆開的表合併回來，要剛好得到原本的資料列。合併回來的列不會比原本少（每一列的各個部分都在），問題出在會多：如果共同欄位不足以判斷哪幾列原本屬於一起，合併就會產生原本沒有的假資料列。「有損」指的是失去了「誰和誰是同一列」的資訊，雖然列數反而變多。兩張表的分解有個簡單判準：共同欄位必須是其中一張表的超鍵（共同欄位決定其中一邊的全部欄位）。三張以上時，頁面用追逐法（chase）判斷。' },
        { type: 'p', text: '先看一個錯誤的拆法：只因為兩邊都有 `major`，就用 `major` 把表切成「學生」與「修課」兩半。`major` 不是任何一邊的鍵：' },
        { type: 'example', id: 'lossy-join' },
        { type: 'p', text: '合併回來有 16 列，其中 7 列是原本沒有的：例如王小明被配上了陳志豪的修課與成績，因為他們同系。接下來照第 5 節的 3NF 拆法建四張表，再合併回來和原表比對。`EXCEPT` 是差集：左邊有、右邊沒有的列。兩個方向都是 0，加上列數相同，就代表一列不多、一列不少：' },
        { type: 'example', id: 'lossless-join' },
        { type: 'p', text: '注意第一行先把資訊工程系的辦公室統一成 E301。拿掉這一行再執行（練習場的預設查詢「不先修正資料就拆表」），`majors` 會有 4 列（資訊工程出現兩次），合併回來變成 13 列，多出 4 列。無損是在「資料遵守函數相依」的前提下才成立的；髒資料違反了 `major → major_office`，拆表時就現形了。實務上的順序是：先用第 2 節的查詢找出並修正違規的資料，再拆表，並在 `majors` 設主鍵，讓同一個系不可能再出現第二間辦公室。' },
        { type: 'p', text: '第二個條件是保留相依（dependency preservation）：每條函數相依都能在某一張表內檢查，不必先合併。上面的 3NF 結果裡，四條相依剛好是四張表的主鍵：`students` 的 `student_id`、`majors` 的 `major`、`courses` 的 `course_id`、`enrollments` 的 `(student_id, course_id)`，主鍵的唯一性就保證了它們，資料庫會直接拒絕違規的資料。如果一條相依的屬性被拆到兩張表，就只能靠合併查詢、觸發器或應用程式去檢查，第 7 節會看到這種情況。' },
        { type: 'callout', tone: 'note', title: 'CREATE TABLE … AS 與 EXCEPT', text: '`CREATE TABLE 新表 AS SELECT …` 用查詢結果建立新表，很適合在練習場示範拆表；但在 SQLite 中這樣建出的表沒有主鍵、外鍵等任何約束，正式的設計要用 DB07、DB09 的 `CREATE TABLE` 寫出主鍵與外鍵。`EXCEPT` 是標準 SQL 的集合運算，會去除重複的列；SQLite 不支援 `EXCEPT ALL`，所以範例另外比對了列數。' },
      ],
    },
    {
      id: 'bcnf', title: 'BCNF：3NF 還不夠的時候',
      blocks: [
        { type: 'p', text: 'Boyce–Codd 正規形式（BCNF）的條件更簡單也更嚴格：每個非平凡的相依 `X → A`，`X` 都必須是超鍵。和 3NF 相比，它拿掉了「`A` 是鍵屬性就可以」這個例外。兩者只在一種情況下不同：有好幾個彼此重疊的候選鍵。經典例子是學生、課程與授課老師：一門課可以有好幾位老師各開一班，每位老師只教一門課，每位學生的每門課只跟一位老師上。' },
        { type: 'example', id: 'nf-bcnf' },
        { type: 'p', text: '`study` 有兩個候選鍵 `{student, course}` 與 `{student, instructor}`，三個屬性全是鍵屬性，所以 `instructor → course` 雖然左邊不是超鍵，仍然符合 3NF；但它不符合 BCNF，而且確實有重複：「鄭老師教資料庫」在他的每位學生那一列都記一次。依 `instructor → course` 拆成 `teaches(instructor, course)` 與 `takes(student, instructor)` 後兩張表都是 BCNF，共同欄位 `instructor` 是 `teaches` 的鍵，所以無損；代價是 `{student, course} → instructor` 跨了兩張表，任何一張表的鍵都擋不住違規：' },
        { type: 'example', id: 'bcnf-lost-fd' },
        { type: 'p', text: '兩次 `INSERT INTO takes` 都被接受了：每一筆在 `takes` 裡都不重複，外鍵也都對。合併之後才看得出李佳穎的資料庫有兩位老師，違反了「一門課只跟一位老師上」。要擋下它，就得靠觸發器或應用程式在寫入前做合併查詢。步驟 3 的另一種拆法 `(student, course)` 與 `(course, instructor)` 更糟：共同欄位 `course` 不是任何一邊的鍵，是有損分解。' },
        { type: 'table', head: ['', '3NF', 'BCNF'], rows: [
          ['條件', '每個非平凡 `X → A`：`X` 是超鍵，或 `A` 是鍵屬性', '每個非平凡 `X → A`：`X` 是超鍵'],
          ['分解方法', '合成法：由相依的最小覆蓋，每組相依建一張表；若沒有任何表包含候選鍵，再加一張', '反覆挑一條違規的 `X → Y`，拆成 `X ∪ Y` 與「原表去掉 `Y`」'],
          ['無損', '一定做得到', '一定做得到'],
          ['保留所有相依', '一定做得到', '不一定，例如本節的 `study`'],
          ['剩下的重複', '可能留下少量（如 `study` 的「鄭老師教資料庫」）', '函數相依造成的重複都消除了'],
        ] },
        { type: 'p', text: '實務上這個兩難不常出現：只有一個候選鍵的表只要符合 3NF，就一定也符合 BCNF（第 5 節拆出來的四張表就是這樣）。真的遇到時有兩種選擇：留在 3NF，讓每條規則都能用鍵直接擋住，接受少量重複；或拆到 BCNF，再用觸發器或程式檢查那條跨表的規則。兩種都合理，重點是知道自己選了哪一種、代價是什麼。' },
      ],
    },
    {
      id: 'denormalization', title: '反正規化：刻意的重複',
      blocks: [
        { type: 'p', text: '正規化保護的是寫入的正確性：每個事實只存一次，改一處就好。代價落在讀取：要看到完整的報表，得把好幾張表合併起來。反正規化（denormalization）是在已經正規化的設計上，為了讓某些特定的讀取更簡單或更快，刻意多存一份重複或推算出來的資料。它和「從來沒有正規化」不一樣：你清楚知道哪裡重複、它該等於什麼、由誰負責保持一致。常見的形式：' },
        { type: 'list', items: [
          '預先算好的統計值：每門課的選課人數、每張訂單的總金額，讓讀取不必每次都 `COUNT` 或 `SUM`。',
          '複製欄位以省去合併：在常用的報表表裡直接放系所名稱或課名。',
          '專門給報表或分析用的彙總表、資料倉儲：讀取遠多於寫入，通常定期批次重建。',
        ] },
        { type: 'p', text: '代價是第 1 節的異常回來了。下面在修課表旁邊建一張 `course_stats` 存選課人數，之後新增一筆選課卻沒有同步更新它：' },
        { type: 'example', id: 'stale-summary' },
        { type: 'p', text: 'MA101 存的是 2，實際已經是 3。之後每一個新增、刪除選課的地方都必須記得同步：在同一個交易裡一起更新（交易在之後的課程介紹），用觸發器讓資料庫自動更新，或接受短暫的不一致、定期批次重算（報表上註明「資料截至昨晚」）。重複的資料一般也很難只靠 `UNIQUE`、`CHECK` 這類單表約束保證一致，寫入的工作量和儲存空間也會增加。' },
        { type: 'list', ordered: true, items: [
          '先做出正規化的設計（3NF 或 BCNF），這是資料正確的基礎。',
          '找到真的太慢或太複雜的查詢，先試加索引或改寫查詢。',
          '還是不夠，才針對那一個查詢反正規化，並寫下重複的資料該等於什麼、由誰在什麼時候維護。',
          '準備一個檢查查詢（像第 2 節的 `GROUP BY … HAVING`，或像範例那樣比對存的值與實際值），定期找出不一致。',
        ] },
        { type: 'callout', tone: 'note', title: '不是每個看起來重複的欄位都是反正規化', text: '訂單明細裡存的「下單時的成交價」不是 `products` 定價的重複：定價會改，成交價不會，它是另一個事實，相依於那一筆訂單明細。另一個常見的替代做法是檢視表（view），例如第 6 節的 `joined`：它提供方便的寬表，卻不多存一份資料，所以沒有異常；但 SQLite 的檢視表每次查詢都重新計算，本身不會更快。有些 DBMS 提供會實際存下結果的實體化檢視表，例如 PostgreSQL 的 `CREATE MATERIALIZED VIEW`，需要用 `REFRESH MATERIALIZED VIEW` 更新，這其實就是由資料庫管理的反正規化；SQLite 沒有這個功能。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-delete-anomaly', prompt: '在練習場的 `course_records` 上，林怡君（學號 4）退掉了她修的 CS101 與 MA101，執行下面的敘述。除了她自己的兩筆修課紀錄，資料庫還失去了什麼資訊？',
      code: { language: 'SQL', text: 'DELETE FROM course_records WHERE student_id = 4;' },
      options: [
        '什麼都沒有失去：其他資料都還記在別的列裡',
        '微積分（MA101）的課名與授課老師',
        '電機工程系的辦公室在 B105 這件事',
        '敘述會失敗：主鍵的一部分不能刪除',
      ],
      answer: 2, explanation: '林怡君是唯一主修電機工程的學生，這個系和辦公室 B105 只記在她的兩列裡，刪掉之後就消失了，這是刪除異常。MA101 還有李佳穎那一列，CS101 也還有王小明、陳志豪，所以課程資料沒有失去；「什麼都沒失去」忽略了系所資料只依附在她的列上。`DELETE` 刪的是整列，和主鍵無關，敘述會正常執行並刪除 2 列。',
    },
    {
      id: 'q-update-anomaly', prompt: '練習場的資料裡，資訊工程系的 4 列中有 3 列記 E301、1 列記 E302（陳志豪的 DB101）。執行下面兩個敘述後，最後的查詢回傳多少？',
      code: { language: 'SQL', text: 'UPDATE course_records SET major_office = \'E401\' WHERE student_id = 1;\nSELECT COUNT(DISTINCT major_office)\nFROM course_records\nWHERE major = \'資訊工程\';' },
      options: ['2', '3', '1', '4'],
      answer: 1, explanation: '`WHERE student_id = 1` 只改了王小明的 2 列，變成 E401；陳志豪的兩列仍是 E301 與 E302，所以同一個系出現 E301、E302、E401 三種辦公室，這是更新異常。1 是以為整個系都改好了，那要寫 `WHERE major = \'資訊工程\'`（會改 4 列）；2 是沒注意到原本就有一列 E302；4 是誤把列數當成不同值的個數，`COUNT(DISTINCT …)` 只數不同的值。',
    },
    {
      id: 'q-fd-evidence', prompt: '在練習場資料上執行下面的查詢，結果是 0 列。根據這個結果，哪一個結論正確？',
      code: { language: 'SQL', text: 'SELECT instructor\nFROM course_records\nGROUP BY instructor\nHAVING COUNT(DISTINCT course_id) > 1;' },
      options: [
        '`instructor → course_id` 是這張表的函數相依，可以用它來分解',
        '`course_id → instructor` 因此不成立',
        '查詢寫錯了：`HAVING` 裡不能用 `COUNT(DISTINCT …)`',
        '目前的資料沒有違反 `instructor → course_id`，但這證明不了它是規則；要看學校是否允許一位老師教好幾門課',
      ],
      answer: 3, explanation: '0 列表示 9 筆資料裡每位老師剛好只教一門課，也就是沒有反例；但資料只能推翻相依，不能證明相依，下學期加一門課就可能出現反例，所以不能拿它來分解。這個查詢檢查的是 `instructor → course_id`，和反方向的 `course_id → instructor` 是兩條不同的相依，它的結果對後者什麼也沒說。`HAVING COUNT(DISTINCT course_id) > 1` 是合法的寫法，查詢能正常執行。',
    },
    {
      id: 'q-second-nf', prompt: '關聯 `grades(student_id, course_id, course_title, score)` 的函數相依是 `{student_id, course_id} → score` 與 `course_id → course_title`。它最高符合哪一個正規形式？',
      options: [
        '1NF：`course_title` 只相依於候選鍵的一部分 `course_id`，是部分相依',
        '2NF：`course_id → course_title` 是遞移相依，違反的是 3NF',
        '3NF：`course_id` 是鍵屬性，所以 `course_id → course_title` 不算違規',
        'BCNF：每個相依的左邊都包含主鍵的欄位',
      ],
      answer: 0, explanation: '唯一的候選鍵是 `{student_id, course_id}`，非鍵屬性 `course_title` 只相依於它的一部分，違反 2NF，所以只到 1NF。這不是遞移相依：遞移相依的中間屬性是非鍵屬性，而這裡的左邊是鍵的一部分。3NF 的例外看的是右邊 `A` 是否為鍵屬性，`course_title` 不是，左邊是不是鍵屬性無關。BCNF 要求左邊是超鍵，「包含主鍵的某個欄位」不夠。',
    },
    {
      id: 'q-bcnf', prompt: '關聯 `study(student, course, instructor)` 有兩條相依：`{student, course} → instructor`（每位學生的每門課只跟一位老師）與 `instructor → course`（每位老師只教一門課）。哪一個敘述正確？',
      options: [
        '只到 2NF：`instructor → course` 是遞移相依',
        '符合 BCNF：它有兩個候選鍵，每個相依都和鍵有關',
        '符合 3NF 但不符合 BCNF：`instructor` 不是超鍵，但 `course` 是鍵屬性',
        '只到 1NF：`course` 部分相依於候選鍵 `{student, instructor}`',
      ],
      answer: 2, explanation: '候選鍵是 `{student, course}` 與 `{student, instructor}`，三個屬性都是鍵屬性。`instructor → course` 的左邊不是超鍵，所以違反 BCNF；但右邊 `course` 是鍵屬性，3NF 允許，所以最高是 3NF。2NF 與 3NF 的部分相依、遞移相依都只看非鍵屬性，`course` 是鍵屬性，不算違規，所以「只到 1NF」「只到 2NF」都錯。有兩個候選鍵本身不代表符合 BCNF，BCNF 要求每個相依的左邊都是超鍵。',
    },
    {
      id: 'q-lossless', prompt: '`course_records` 有第 2 節列出的 4 條相依。下面把它拆成兩張表的哪一種方式是無損分解？',
      options: [
        '`(student_id, student_name, major, major_office)` 與 `(major, course_id, course_title, instructor, score)`',
        '`(student_id, student_name, major, major_office)` 與 `(student_id, course_id, course_title, instructor, score)`',
        '`(student_id, student_name, major)` 與 `(major_office, course_id, course_title, instructor, score)`',
        '`(student_id, course_id, score)` 與 `(student_name, major, major_office, course_id, course_title, instructor)`',
      ],
      answer: 1, explanation: '兩張表的分解，共同欄位必須是其中一邊的超鍵。第二種的共同欄位是 `student_id`，它決定第一張表的全部欄位，所以無損（不過第二張表仍有 `course_id → course_title` 的部分相依，只到 1NF：無損不等於已經正規化）。第一種的共同欄位 `major` 不是任何一邊的鍵，合併會把同系學生的修課互相配錯，就像第 6 節的範例；第三種兩邊沒有共同欄位，合併等於笛卡兒積；第四種的共同欄位 `course_id` 決定不了學生的資料，學生和修課之間的連結斷了。',
    },
    {
      id: 'q-denormalization', prompt: '為了讓課程列表不必每次都數選課人數，設計者在 `courses` 加了一個欄位 `enrolled_count`，存每門課目前的選課人數。哪一個敘述正確？',
      options: [
        '只要把 `enrolled_count` 宣告為 `NOT NULL`，它就不可能和實際人數不一致',
        '這樣的表不符合 3NF，所以 DBMS 會拒絕建立它',
        '反正規化就是刪掉外鍵，讓合併變快',
        '讀取變簡單了，代價是每次新增或刪除選課都要同步更新它（同一個交易、觸發器或定期重算），否則會出現更新異常',
      ],
      answer: 3, explanation: '`enrolled_count` 是可以從選課表算出來的重複資料，這就是反正規化：讀取時省下 `COUNT`，但它和選課表必須保持一致，忘了同步就像第 8 節範例的 MA101，存 2、實際 3。`NOT NULL` 只保證有值，不保證值是對的；DBMS 不檢查正規形式，正規化是設計者的判斷，不是資料庫的限制；反正規化是刻意多存重複資料，和刪除外鍵無關。',
    },
  ],
  sql: {
    dataset: 'registrar',
    presets: [
      { label: '整張修課紀錄表', sql: sql`SELECT *
FROM course_records
ORDER BY student_id, course_id;` },
      { label: '檢驗 major → major_office', sql: sql`SELECT major, COUNT(DISTINCT major_office) AS offices, MIN(major_office) AS min_office, MAX(major_office) AS max_office
FROM course_records
GROUP BY major
HAVING COUNT(DISTINCT major_office) > 1;` },
      { label: '更新異常：只改一位學生的列', sql: sql`UPDATE course_records SET major_office = 'E401' WHERE student_id = 1;
SELECT major_office, COUNT(*) AS row_count
FROM course_records
WHERE major = '資訊工程'
GROUP BY major_office
ORDER BY major_office;` },
      { label: '刪除異常：林怡君退掉所有課', sql: sql`DELETE FROM course_records WHERE student_id = 4;
SELECT DISTINCT major, major_office
FROM course_records
ORDER BY major, major_office;` },
      { label: '不先修正資料就拆表', sql: sql`CREATE TABLE students AS SELECT DISTINCT student_id, student_name, major FROM course_records;
CREATE TABLE majors AS SELECT DISTINCT major, major_office FROM course_records;
CREATE TABLE courses AS SELECT DISTINCT course_id, course_title, instructor FROM course_records;
CREATE TABLE enrollments AS SELECT student_id, course_id, score FROM course_records;
CREATE VIEW joined AS
SELECT s.student_id, s.student_name, s.major, m.major_office, c.course_id, c.course_title, c.instructor, e.score
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN majors m ON m.major = s.major
JOIN courses c ON c.course_id = e.course_id;
SELECT
  (SELECT COUNT(*) FROM majors) AS major_rows,
  (SELECT COUNT(*) FROM joined) AS joined_rows,
  (SELECT COUNT(*) FROM (SELECT * FROM joined EXCEPT SELECT * FROM course_records) AS d) AS extra_rows;` },
    ],
    examples: [
      {
        id: 'update-anomaly', title: '更新異常：只改了一部分的列', dataset: 'registrar',
        description: '系辦公室搬到 E401，卻只改了王小明的兩列。之後再數資訊工程系各種辦公室出現的列數。',
        sql: sql`UPDATE course_records SET major_office = 'E401' WHERE student_id = 1;
SELECT major_office, COUNT(*) AS row_count
FROM course_records
WHERE major = '資訊工程'
GROUP BY major_office
ORDER BY major_office;`,
        result: { columns: ['major_office', 'row_count'], rows: [['E301', 1], ['E302', 1], ['E401', 2]] },
      },
      {
        id: 'update-every-row', title: '正確的更新要動每一份複本', dataset: 'registrar',
        description: '依系所更新才能讓資料一致；SQLite 的 changes() 回報這個 UPDATE 改了幾列。',
        sql: sql`UPDATE course_records SET major_office = 'E401' WHERE major = '資訊工程';
SELECT changes() AS rows_changed;`,
        result: { columns: ['rows_changed'], rows: [[4]] },
      },
      {
        id: 'delete-anomaly', title: '刪除異常：退課帶走了系所資料', dataset: 'registrar',
        description: '刪除林怡君的修課紀錄後，列出資料庫裡還知道的系所與辦公室。',
        sql: sql`DELETE FROM course_records WHERE student_id = 4;
SELECT DISTINCT major, major_office
FROM course_records
ORDER BY major, major_office;`,
        result: { columns: ['major', 'major_office'], rows: [['資訊工程', 'E301'], ['資訊工程', 'E302'], ['資訊管理', 'M210']] },
      },
      {
        id: 'fd-check-office', title: '用資料檢驗 major → major_office', dataset: 'registrar',
        description: '依 major 分組，留下出現兩種以上辦公室的系所：每一列都是一個違反規則的系。',
        sql: sql`SELECT major, COUNT(DISTINCT major_office) AS offices, MIN(major_office) AS min_office, MAX(major_office) AS max_office
FROM course_records
GROUP BY major
HAVING COUNT(DISTINCT major_office) > 1;`,
        result: { columns: ['major', 'offices', 'min_office', 'max_office'], rows: [['資訊工程', 2, 'E301', 'E302']] },
      },
      {
        id: 'fd-scan', title: '一次檢驗好幾條相依', dataset: 'registrar',
        description: '每一段找出違反一條相依的組，再數有幾組。0 只代表這些資料沒有反例，不代表規則成立。',
        sql: sql`SELECT 'student_id → student_name' AS fd, COUNT(*) AS violations
FROM (SELECT student_id FROM course_records GROUP BY student_id HAVING COUNT(DISTINCT student_name) > 1) AS v
UNION ALL
SELECT 'major → major_office', COUNT(*)
FROM (SELECT major FROM course_records GROUP BY major HAVING COUNT(DISTINCT major_office) > 1) AS v
UNION ALL
SELECT 'course_id → instructor', COUNT(*)
FROM (SELECT course_id FROM course_records GROUP BY course_id HAVING COUNT(DISTINCT instructor) > 1) AS v
UNION ALL
SELECT 'instructor → course_id', COUNT(*)
FROM (SELECT instructor FROM course_records GROUP BY instructor HAVING COUNT(DISTINCT course_id) > 1) AS v
UNION ALL
SELECT 'student_name → student_id', COUNT(*)
FROM (SELECT student_name FROM course_records GROUP BY student_name HAVING COUNT(DISTINCT student_id) > 1) AS v;`,
        result: { columns: ['fd', 'violations'], rows: [
          ['student_id → student_name', 0],
          ['major → major_office', 1],
          ['course_id → instructor', 0],
          ['instructor → course_id', 0],
          ['student_name → student_id', 0],
        ] },
      },
      {
        id: 'lossy-join', title: '有損分解：用不是鍵的欄位切開', dataset: 'registrar',
        description: '依 major 把表切成學生與修課兩半再合併回來：major 不是任何一邊的鍵，同系的學生與修課被互相配對。',
        sql: sql`CREATE TABLE student_part AS SELECT DISTINCT student_id, student_name, major FROM course_records;
CREATE TABLE course_part AS SELECT DISTINCT major, course_id, course_title, instructor, score FROM course_records;
CREATE VIEW joined AS
SELECT s.student_id, s.student_name, s.major, c.course_id, c.course_title, c.instructor, c.score
FROM student_part s
JOIN course_part c ON s.major = c.major;
SELECT
  (SELECT COUNT(*) FROM course_records) AS original_rows,
  (SELECT COUNT(*) FROM joined) AS joined_rows,
  (SELECT COUNT(*) FROM (SELECT * FROM joined
    EXCEPT SELECT student_id, student_name, major, course_id, course_title, instructor, score FROM course_records) AS d) AS extra_rows;`,
        result: { columns: ['original_rows', 'joined_rows', 'extra_rows'], rows: [[9, 16, 7]] },
      },
      {
        id: 'lossless-join', title: '無損分解：拆成 3NF 再合併回來比對', dataset: 'registrar',
        description: '先修正資訊工程系的辦公室，再建四張 3NF 的表，合併成檢視表 joined，用 EXCEPT 從兩個方向和原表比對。',
        sql: sql`UPDATE course_records SET major_office = 'E301' WHERE major = '資訊工程';
CREATE TABLE students AS SELECT DISTINCT student_id, student_name, major FROM course_records;
CREATE TABLE majors AS SELECT DISTINCT major, major_office FROM course_records;
CREATE TABLE courses AS SELECT DISTINCT course_id, course_title, instructor FROM course_records;
CREATE TABLE enrollments AS SELECT student_id, course_id, score FROM course_records;
CREATE VIEW joined AS
SELECT s.student_id, s.student_name, s.major, m.major_office, c.course_id, c.course_title, c.instructor, e.score
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN majors m ON m.major = s.major
JOIN courses c ON c.course_id = e.course_id;
SELECT
  (SELECT COUNT(*) FROM majors) AS major_rows,
  (SELECT COUNT(*) FROM joined) AS joined_rows,
  (SELECT COUNT(*) FROM (SELECT * FROM joined EXCEPT SELECT * FROM course_records) AS d) AS extra_rows,
  (SELECT COUNT(*) FROM (SELECT * FROM course_records EXCEPT SELECT * FROM joined) AS d) AS missing_rows;`,
        result: { columns: ['major_rows', 'joined_rows', 'extra_rows', 'missing_rows'], rows: [[3, 9, 0, 0]] },
      },
      {
        id: 'bcnf-lost-fd', title: 'BCNF 分解後擋不住的規則', dataset: 'empty',
        description: 'teaches 與 takes 是 study 的 BCNF 分解。李佳穎再選鄭老師，兩張表都接受；合併後才看出她的資料庫有兩位老師。',
        sql: sql`CREATE TABLE teaches (
  instructor TEXT PRIMARY KEY,
  course TEXT NOT NULL
);
CREATE TABLE takes (
  student TEXT NOT NULL,
  instructor TEXT NOT NULL REFERENCES teaches(instructor),
  PRIMARY KEY (student, instructor)
);
INSERT INTO teaches VALUES ('鄭老師', '資料庫'), ('林老師', '資料庫'), ('周老師', '程式設計');
INSERT INTO takes VALUES ('王小明', '鄭老師'), ('王小明', '周老師'), ('李佳穎', '林老師'), ('陳志豪', '鄭老師');
INSERT INTO takes VALUES ('李佳穎', '鄭老師');
SELECT k.student, t.course, COUNT(*) AS instructors
FROM takes k
JOIN teaches t ON t.instructor = k.instructor
GROUP BY k.student, t.course
HAVING COUNT(*) > 1;`,
        result: { columns: ['student', 'course', 'instructors'], rows: [['李佳穎', '資料庫', 2]] },
      },
      {
        id: 'stale-summary', title: '反正規化的代價：過期的統計值', dataset: 'registrar',
        description: '把各課選課人數預先存進 course_stats，之後新增一筆選課卻沒有同步更新，再比對存的值與實際人數。',
        sql: sql`CREATE TABLE enrollments AS SELECT student_id, course_id, score FROM course_records;
CREATE TABLE course_stats AS SELECT course_id, COUNT(*) AS enrolled FROM enrollments GROUP BY course_id;
INSERT INTO enrollments VALUES (5, 'MA101', NULL);
SELECT s.course_id, s.enrolled AS stored,
  (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = s.course_id) AS actual
FROM course_stats s
ORDER BY s.course_id;`,
        result: { columns: ['course_id', 'stored', 'actual'], rows: [['CS101', 3, 3], ['DB101', 4, 4], ['MA101', 2, 3]] },
      },
    ],
    exercises: [
      {
        id: 'ex-office-violations', title: '找出違反 major → major_office 的系所',
        statement: '學校規定每個系只有一間系辦公室（`major → major_office`）。找出 `course_records` 中違反這條規則的系所。結果欄位依序為 `major`（系所）、`offices`（這個系在資料中出現了幾種不同的辦公室），依 `major` 排序。答案也會在另一組資料上檢查，那裡違規的系所不一樣。',
        dataset: 'registrar', hidden: ['registrar-b'], ordered: true, columnNames: true,
        starter: sql`SELECT major, ... AS offices
FROM course_records
GROUP BY ...
HAVING ...
ORDER BY major;`,
        hints: [
          '檢查 `X → Y` 就是依 `X` 分組：這裡是 `GROUP BY major`。',
          '一組裡出現兩種以上不同的辦公室就是違規：`COUNT(DISTINCT major_office) > 1`。對分組的條件要放在 `HAVING`，不是 `WHERE`。',
          '不要寫死系所名稱：在另一組資料上，違規的是別的系。',
        ],
        solution: sql`SELECT major, COUNT(DISTINCT major_office) AS offices
FROM course_records
GROUP BY major
HAVING COUNT(DISTINCT major_office) > 1
ORDER BY major;`,
        alternatives: [
          sql`SELECT major, COUNT(*) AS offices
FROM (SELECT DISTINCT major, major_office FROM course_records) AS pairs
GROUP BY major
HAVING COUNT(*) > 1
ORDER BY major;`,
          sql`SELECT major, COUNT(DISTINCT major_office) AS offices
FROM course_records
GROUP BY major
HAVING MIN(major_office) <> MAX(major_office)
ORDER BY major;`,
        ],
        mistakes: [
          { sql: sql`SELECT major, COUNT(major_office) AS offices
FROM course_records
GROUP BY major
HAVING COUNT(major_office) > 1
ORDER BY major;`, why: '少了 `DISTINCT`：`COUNT(major_office)` 數的是列數，不是不同辦公室的個數。只要一個系有兩筆以上修課紀錄就會被列出來，連完全一致的電機工程、資訊管理也算成違規。' },
          { sql: sql`SELECT major_office, COUNT(DISTINCT major) AS majors
FROM course_records
GROUP BY major_office
HAVING COUNT(DISTINCT major) > 1;`, why: '方向反了：這是在檢查 `major_office → major`（一間辦公室只屬於一個系），不是題目的 `major → major_office`。兩條是不同的相依，這裡的結果是 0 列。' },
          { sql: sql`SELECT major, COUNT(DISTINCT major_office) AS offices
FROM course_records
WHERE major = '資訊工程'
GROUP BY major
ORDER BY major;`, why: '把看到的答案寫死了：在練習場資料上剛好正確，但在另一組資料上違規的是資訊管理與電機工程，這個查詢仍只回傳資訊工程。條件要寫成對每一組都成立的 `HAVING COUNT(DISTINCT major_office) > 1`。' },
        ],
      },
    ],
  },
  normalization: {
    explorer: {
      title: '修課紀錄 course_records',
      name: 'course_records',
      attributes: ['student_id', 'student_name', 'major', 'major_office', 'course_id', 'course_title', 'instructor', 'score'],
      fds: [
        { lhs: ['student_id'], rhs: ['student_name', 'major'] },
        { lhs: ['major'], rhs: ['major_office'] },
        { lhs: ['course_id'], rhs: ['course_title', 'instructor'] },
        { lhs: ['student_id', 'course_id'], rhs: ['score'] },
      ],
      labels: { student_id: '學號', student_name: '學生姓名', major: '主修系所', major_office: '系辦公室', course_id: '課號', course_title: '課名', instructor: '授課教師', score: '成績' },
      sample: [
        [1, '王小明', '資訊工程', 'E301', 'CS101', '程式設計', '周老師', 92],
        [1, '王小明', '資訊工程', 'E301', 'DB101', '資料庫概論', '鄭老師', 88],
        [2, '李佳穎', '資訊管理', 'M210', 'DB101', '資料庫概論', '鄭老師', 79],
        [2, '李佳穎', '資訊管理', 'M210', 'MA101', '微積分', '許老師', 65],
        [3, '陳志豪', '資訊工程', 'E301', 'CS101', '程式設計', '周老師', 74],
        [3, '陳志豪', '資訊工程', 'E302', 'DB101', '資料庫概論', '鄭老師', null],
        [4, '林怡君', '電機工程', 'B105', 'CS101', '程式設計', '周老師', 81],
        [4, '林怡君', '電機工程', 'B105', 'MA101', '微積分', '許老師', 90],
        [5, '張家豪', '資訊管理', 'M210', 'DB101', '資料庫概論', '鄭老師', 70],
      ],
    },
    examples: [
      {
        id: 'nf-records', title: 'course_records：從 1NF 拆到 3NF',
        description: '同一張修課紀錄表，先去掉部分相依（2NF），再去掉遞移相依（3NF）。每張表的分析都是由函數相依算出來的。',
        relation: {
          name: 'course_records',
          attributes: ['student_id', 'student_name', 'major', 'major_office', 'course_id', 'course_title', 'instructor', 'score'],
          fds: [
            { lhs: ['student_id'], rhs: ['student_name', 'major'] },
            { lhs: ['major'], rhs: ['major_office'] },
            { lhs: ['course_id'], rhs: ['course_title', 'instructor'] },
            { lhs: ['student_id', 'course_id'], rhs: ['score'] },
          ],
        },
        steps: [
          {
            title: '原始的表：只到 1NF',
            note: '唯一的候選鍵是 `{student_id, course_id}`。學生的姓名、主修與系辦只相依於 `student_id`，課名與老師只相依於 `course_id`，都是部分相依，所以只到 1NF。三種異常都出在這裡。',
            parts: [{ name: 'course_records', attributes: ['student_id', 'student_name', 'major', 'major_office', 'course_id', 'course_title', 'instructor', 'score'] }],
          },
          {
            title: '2NF：把部分相依搬出去',
            note: '依 `student_id → …` 與 `course_id → …` 拆出 `students` 與 `courses`，`enrollments` 只留鍵與成績。三張表都沒有部分相依，合併回來無損；但 `students` 還有 `student_id → major → major_office` 的遞移相依，所以只到 2NF：系辦公室仍然每位學生記一次。',
            parts: [
              { name: 'students', attributes: ['student_id', 'student_name', 'major', 'major_office'] },
              { name: 'courses', attributes: ['course_id', 'course_title', 'instructor'] },
              { name: 'enrollments', attributes: ['student_id', 'course_id', 'score'] },
            ],
          },
          {
            title: '3NF：把遞移相依搬出去',
            note: '依 `major → major_office` 再拆出 `majors`，`students` 只留 `major` 當連結。四張表都符合 3NF（而且都是 BCNF），分解無損，四條相依各自由一張表的鍵保證。',
            parts: [
              { name: 'students', attributes: ['student_id', 'student_name', 'major'] },
              { name: 'majors', attributes: ['major', 'major_office'] },
              { name: 'courses', attributes: ['course_id', 'course_title', 'instructor'] },
              { name: 'enrollments', attributes: ['student_id', 'course_id', 'score'] },
            ],
          },
        ],
      },
      {
        id: 'nf-bcnf', title: 'study：符合 3NF，卻不符合 BCNF',
        description: '一門課可以有好幾位老師各開一班；每位老師只教一門課；每位學生的每門課只跟一位老師上。',
        relation: {
          name: 'study',
          attributes: ['student', 'course', 'instructor'],
          fds: [
            { lhs: ['student', 'course'], rhs: ['instructor'] },
            { lhs: ['instructor'], rhs: ['course'] },
          ],
          labels: { student: '學生', course: '課程', instructor: '授課教師' },
          sample: [
            ['王小明', '資料庫', '鄭老師'],
            ['王小明', '程式設計', '周老師'],
            ['李佳穎', '資料庫', '林老師'],
            ['陳志豪', '資料庫', '鄭老師'],
          ],
        },
        steps: [
          {
            title: '原始的表：3NF，但不是 BCNF',
            note: '候選鍵有 `{student, course}` 與 `{student, instructor}` 兩個，三個屬性都是鍵屬性。`instructor → course` 的左邊不是超鍵，但右邊是鍵屬性，3NF 允許、BCNF 不允許。範例資料裡「鄭老師教資料庫」記了兩次。',
            parts: [{ name: 'study', attributes: ['student', 'course', 'instructor'] }],
          },
          {
            title: 'BCNF 分解：依 instructor → course 拆開',
            note: '兩張表都是 BCNF，共同欄位 `instructor` 是 `teaches` 的鍵，所以無損。代價是 `{student, course} → instructor` 跨了兩張表，無法在單一張表內檢查。',
            parts: [
              { name: 'teaches', attributes: ['instructor', 'course'] },
              { name: 'takes', attributes: ['student', 'instructor'] },
            ],
          },
          {
            title: '對照：另一種拆法是有損的',
            note: '改用 `course` 當共同欄位：它不是任何一邊的鍵，合併時王小明的資料庫會同時配上鄭老師與林老師，這是有損分解，同樣也失去了 `{student, course} → instructor`。',
            parts: [
              { name: 'student_course', attributes: ['student', 'course'] },
              { name: 'course_instructor', attributes: ['course', 'instructor'] },
            ],
          },
        ],
      },
    ],
    exercises: [
      {
        id: 'ex-exam-keys', task: 'keys', all: true, title: '期末考排程的候選鍵',
        statement: '期末考排程表 `exams` 依照這些規則安排：每門課只有一場期末考，在一個時段、一間教室，由一位監考老師負責（`course_id → course_title, slot, room, proctor`）；同一時段同一間教室只排一場考試（`{slot, room} → course_id`）；同一時段一位監考老師只監考一場（`{slot, proctor} → course_id`）。找出這張表全部的候選鍵，每個候選鍵加成一組。',
        relation: {
          name: 'exams',
          attributes: ['course_id', 'course_title', 'slot', 'room', 'proctor'],
          fds: [
            { lhs: ['course_id'], rhs: ['course_title', 'slot', 'room', 'proctor'] },
            { lhs: ['slot', 'room'], rhs: ['course_id'] },
            { lhs: ['slot', 'proctor'], rhs: ['course_id'] },
          ],
          labels: { course_id: '課號', course_title: '課名', slot: '考試時段', room: '教室', proctor: '監考老師' },
          sample: [
            ['CS101', '程式設計', '6/23 上午', 'E201', '周老師'],
            ['DB101', '資料庫概論', '6/23 上午', 'E202', '鄭老師'],
            ['MA101', '微積分', '6/23 下午', 'E201', '周老師'],
            ['PH101', '物理', '6/24 上午', 'E201', '江老師'],
          ],
        },
        hints: [
          '先算單一屬性的閉包：`course_id⁺` 包含全部屬性嗎？`slot⁺`、`room⁺` 呢？',
          '再試兩個屬性的組合，跳過已經包含候選鍵的組合（那些是超鍵，但不是最小的）。從 `{slot, room}` 出發，套用 `{slot, room} → course_id` 之後，還能套用哪一條？',
          '範例資料可以幫你排除答案：周老師在 E201 監考了兩場，所以 `{room, proctor}` 不可能是鍵。',
        ],
        solution: [['course_id'], ['slot', 'room'], ['slot', 'proctor']],
        mistakes: [
          { keys: [['course_id']], why: '`course_id` 是候選鍵，但不是唯一的一個：`{slot, room}` 經由 `{slot, room} → course_id` 再決定其他所有屬性，`{slot, proctor}` 也一樣。主鍵只能選一個，候選鍵卻可以有好幾個。' },
          { keys: [['course_id'], ['slot', 'room', 'proctor']], why: '`{slot, room, proctor}` 是超鍵，但不是最小的：拿掉 `proctor` 剩下的 `{slot, room}` 仍然決定所有屬性。候選鍵要求不能再拿掉任何屬性。' },
          { keys: [['course_id'], ['slot', 'room'], ['room', 'proctor']], why: '`{room, proctor}` 不是超鍵：沒有任何相依的左邊只用到這兩個屬性，它的閉包只有自己。範例資料裡周老師在 E201 監考了兩場，同一組 `(room, proctor)` 對應兩門課。漏掉的是 `{slot, proctor}`。' },
        ],
        explanation: '`exams` 有三個候選鍵：`{course_id}`、`{slot, room}`、`{slot, proctor}`，所以 `course_id`、`slot`、`room`、`proctor` 都是鍵屬性，只有 `course_title` 是非鍵屬性。每條相依的左邊都是超鍵，這張表已經符合 BCNF：有好幾個候選鍵本身不是問題。建表時選一個當主鍵（例如 `course_id`），其他兩個宣告成 `UNIQUE (slot, room)` 與 `UNIQUE (slot, proctor)`，三條排程規則就都由資料庫直接擋住。',
      },
      {
        id: 'ex-orders-3nf', task: 'decompose', target: '3NF', preserve: true, title: '把訂單明細表分解到 3NF',
        statement: '下面這張訂單明細表 `order_lines` 每一列是一張訂單裡的一項商品，顧客與商品的資料一再重複。`unit_price` 是商品目前的定價。把它分解到 3NF：每張表都要符合 3NF，分解必須無損，而且每條函數相依都要能在某一張表內檢查。',
        relation: {
          name: 'order_lines',
          attributes: ['order_id', 'order_date', 'customer_id', 'customer_name', 'customer_city', 'product_id', 'product_name', 'unit_price', 'quantity'],
          fds: [
            { lhs: ['order_id'], rhs: ['order_date', 'customer_id'] },
            { lhs: ['customer_id'], rhs: ['customer_name', 'customer_city'] },
            { lhs: ['product_id'], rhs: ['product_name', 'unit_price'] },
            { lhs: ['order_id', 'product_id'], rhs: ['quantity'] },
          ],
          labels: { order_id: '訂單編號', order_date: '下單日期', customer_id: '顧客編號', customer_name: '顧客姓名', customer_city: '顧客城市', product_id: '商品編號', product_name: '商品名稱', unit_price: '定價', quantity: '數量' },
          sample: [
            [1, '2026-09-01', 1, '陳美玲', '台北', 'P1', '機械鍵盤', 2490, 1],
            [2, '2026-09-03', 1, '陳美玲', '台北', 'P2', '無線滑鼠', 890, 2],
            [2, '2026-09-03', 1, '陳美玲', '台北', 'P1', '機械鍵盤', 2490, 1],
            [3, '2026-09-05', 2, '林建宏', '台中', 'P3', '27 吋螢幕', 6990, 1],
            [4, '2026-09-10', 3, '王雅雯', '台北', 'P2', '無線滑鼠', 890, 1],
          ],
        },
        hints: [
          '先找候選鍵：哪些屬性不出現在任何相依的右邊？它們一定在每個候選鍵裡。',
          '先處理部分相依（2NF）：只靠 `order_id` 或只靠 `product_id` 就能決定的屬性，各自搬到以它為鍵的表。',
          '再處理遞移相依（3NF）：`order_id → customer_id → customer_name` 中間的 `customer_id` 不是鍵。顧客資料要放進以 `customer_id` 為鍵的表，訂單表只留 `customer_id` 當連結。',
        ],
        solution: [
          { name: 'orders', attributes: ['order_id', 'order_date', 'customer_id'] },
          { name: 'customers', attributes: ['customer_id', 'customer_name', 'customer_city'] },
          { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
          { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
        ],
        alternatives: [
          [
            { name: 'orders', attributes: ['order_id', 'order_date', 'customer_id'] },
            { name: 'customer_names', attributes: ['customer_id', 'customer_name'] },
            { name: 'customer_cities', attributes: ['customer_id', 'customer_city'] },
            { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
            { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
          ],
        ],
        mistakes: [
          { parts: [
            { name: 'orders', attributes: ['order_id', 'order_date', 'customer_id', 'customer_name', 'customer_city'] },
            { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
            { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
          ], why: '`orders` 裡還留著 `customer_name`、`customer_city`：它們經由 `customer_id` 遞移相依於 `order_id`，這張表只到 2NF。陳美玲每下一張訂單，她的姓名和城市就再抄一次，改城市時又可能漏改。' },
          { parts: [
            { name: 'customers', attributes: ['customer_id', 'customer_name', 'customer_city'] },
            { name: 'orders', attributes: ['order_id', 'order_date'] },
            { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
            { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
          ], why: '`orders` 沒有 `customer_id`，`customers` 和其他表沒有任何共同欄位：合併不回「哪張訂單是哪位顧客下的」，這是有損分解，`order_id → customer_id` 也無處可查。' },
          { parts: [
            { name: 'orders', attributes: ['order_id', 'order_date', 'customer_id'] },
            { name: 'order_customers', attributes: ['order_id', 'customer_name', 'customer_city'] },
            { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
            { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
          ], why: '把顧客姓名和城市跟著訂單存：每張表單獨看都符合 BCNF，分解也無損，但 `customer_id → customer_name, customer_city` 跨了兩張表，無法在單一張表內檢查。同一位顧客的兩張訂單可以記成不同城市，重複與更新異常其實還在。' },
          { parts: [
            { name: 'orders', attributes: ['order_id', 'order_date', 'customer_id'] },
            { name: 'customers', attributes: ['customer_id', 'customer_name', 'customer_city'] },
            { name: 'products', attributes: ['product_id', 'product_name', 'unit_price'] },
            { name: 'order_items', attributes: ['order_id', 'product_id', 'quantity'] },
            { name: 'order_customer', attributes: ['order_id', 'customer_id'] },
          ], why: '多出來的 `order_customer(order_id, customer_id)` 完全包含在 `orders` 裡：它只是把同一件事再存一份，又多了一處需要同步的地方。' },
        ],
        explanation: '唯一的候選鍵是 `{order_id, product_id}`（兩者都不出現在任何相依的右邊）。第一步去掉部分相依：只相依於 `order_id` 的下單日期與顧客、只相依於 `product_id` 的商品名稱與定價各自搬出去，商品資料只存一次（消除更新異常），還沒賣出的新商品也能登記（消除插入異常），刪掉某商品唯一的一筆明細也不會失去商品資料（消除刪除異常）。第二步去掉遞移相依 `order_id → customer_id → customer_name, customer_city`：顧客資料只存一次，沒下過單的顧客也能登記，刪掉顧客唯一的一張訂單也不會失去顧客。結果的四張表都是 BCNF，每次拆開的共同欄位都是新表的鍵，所以無損；四條相依剛好是四張表的主鍵，全部保留。把顧客再拆成姓名與城市兩張表也正確，只是多了一次合併，沒有任何好處。',
      },
    ],
  },
};
