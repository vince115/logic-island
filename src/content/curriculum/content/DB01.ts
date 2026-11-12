import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB01 資料庫與 DBMS 概念. SQL lesson (Phase F.1a): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB01: LessonContent = {
  lessonId: 'DB01',
  motivation: '幾乎每個應用程式都要「記住」東西：學校的學生與成績、商店的訂單、社群網站的貼文。前面的課程裡，資料放在陣列（F11）或對照表（D09）裡，程式一結束就消失；寫進檔案（F03）可以留下來，但只要兩個人同時修改、程式寫到一半當機、有人只該看到一部分資料，或老闆臨時想問一個新問題，這些麻煩都得自己處理，而且很難處理對。資料庫管理系統（DBMS）就是把這些共通的麻煩一次解決的軟體：它負責儲存與查詢，讓很多人同時使用而不互相覆蓋，當機後恢復到一致的狀態，並控管誰能看、誰能改。這一課建立整座資料庫應用島都會用到的觀念：資料庫與 DBMS、綱要與實例、資料獨立性、關聯式與 NoSQL 的差別，以及 SQL 這種「說要什麼、不說怎麼做」的語言；最後在頁面上的 SQL 練習場執行你的第一個查詢，學會讀懂它回傳的結果表。',
  sections: [
    {
      id: 'why-dbms', title: '用檔案和陣列存資料會遇到什麼問題',
      blocks: [
        { type: 'p', text: '想像學校用一個文字檔記錄選課，每行一筆，例如 `王小明,甲,CS101,程式設計,周老師,92`。程式用 F03 學過的方式逐行讀入，存進陣列（F11）或以學號為鍵的 map（D09），再用迴圈處理。只有一個人、幾十筆資料時，這樣完全可行。但資料一多、用的人一多，下面這些問題一個接一個出現：' },
        { type: 'list', items: [
          '重複與不一致：「周老師」在他每一門課的每一筆選課紀錄裡都寫一次，這叫冗餘（redundancy）。哪天要更正老師的名字，只要漏改一行，檔案裡就同時存在兩種說法，沒有人知道哪一個才對。',
          '同時寫入：教務處兩位職員同時打開檔案，各改一筆再存檔。後存檔的人寫回的是他打開時的舊內容加上自己的修改，先存檔那個人的修改就整個不見了，這叫遺失更新（lost update）。',
          '寫到一半當機：程式正在把整個檔案重寫一遍時停電，檔案可能只寫了前半段。舊資料已被覆蓋、新資料又沒寫完，資料就壞了。',
          '權限：作業系統的檔案權限通常只能整份給或整份不給。想讓導師看到自己班的成績、學生只看到自己的成績，用一個檔案很難做到。',
          '找資料：每想問一個新問題（「乙班有誰」「誰還沒有成績」），就要再寫一個迴圈，把所有資料從頭掃到尾。資料有一百萬筆時，每次都從頭找就太慢了。',
          '程式和格式綁死：欄位的順序、用逗號分隔，都寫死在每一支讀這個檔案的程式裡。多加一個欄位，所有程式都得跟著改。',
        ] },
        { type: 'p', text: '這些不是某個應用程式特有的問題，而是所有「長期保存、多人共用」資料的程式都會遇到的。與其讓每個程式各自寫一遍（還很容易寫錯），不如交給一套專門的軟體處理：這就是資料庫管理系統。' },
        { type: 'table', head: ['問題', '自己用檔案或陣列處理', '交給 DBMS'], rows: [
          ['重複與不一致', '只能靠自己小心，別漏改', '把資料拆成幾張表、每件事只記一次（DB10 正規化），再用約束（constraint）擋掉不合法的資料'],
          ['同時寫入', '自己寫鎖定檔案的程式碼，很容易出錯', '並行控制（concurrency control）：多人同時操作也不會互相覆蓋（DB15）'],
          ['寫到一半當機', '自己先寫暫存檔再改名，處理各種失敗情況', '交易（transaction）與日誌：一組修改要嘛全部生效、要嘛完全沒發生，當機後自動復原（DB14）'],
          ['誰能看什麼', '只能整個檔案給或不給', '權限控管：可以細到哪個使用者能讀或改哪張表（DB17）'],
          ['找資料', '每個新問題寫一個新迴圈，從頭掃描', '用 SQL 描述想要的結果，DBMS 自己挑最快的做法，例如使用索引（DB11）'],
          ['程式和格式綁死', '改格式就要改所有程式', '資料獨立性：儲存方式或表的結構改變時，程式可以不必跟著改（本課後面說明）'],
        ] },
      ],
    },
    {
      id: 'database-and-dbms', title: '資料庫、DBMS 與它提供的功能',
      blocks: [
        { type: 'p', text: '資料庫（database）是一群彼此相關、有組織、長期保存的資料，例如一所學校的學生、課程與選課紀錄。資料庫管理系統（Database Management System，DBMS）是用來定義、建立、查詢、修改並保護資料庫的軟體。應用程式不再自己讀寫資料檔，而是把要求交給 DBMS，由 DBMS 去碰真正的資料。資料庫、DBMS 再加上使用它的應用程式，合稱資料庫系統。' },
        { type: 'p', text: '常見的 DBMS 有 PostgreSQL、MySQL、Microsoft SQL Server、Oracle Database 與 SQLite。它們的功能大致相同：' },
        { type: 'list', items: [
          '定義資料：用 `CREATE TABLE` 等敘述宣告有哪些表、每張表有哪些欄位與型別、哪些規則必須遵守。',
          '查詢與修改：用 SQL 查詢（`SELECT`）、新增（`INSERT`）、修改（`UPDATE`）、刪除（`DELETE`）資料；DBMS 內的查詢最佳化器（query optimizer）決定怎麼執行最快。',
          '完整性（integrity）：約束讓不合法的資料進不來，例如主鍵不能重複、`NOT NULL` 欄位必須有值、外鍵（foreign key）必須指向真的存在的資料列。',
          '並行控制：很多使用者同時讀寫時，結果和「一個接一個做」一樣合理，不會出現遺失更新。',
          '復原（recovery）：DBMS 先把修改記進日誌（log），所以一組修改中途當機時，重新啟動後能回到修改前或修改完成的狀態，不會停在一半。',
          '權限（authorization）：伺服器型的 DBMS 有使用者帳號，用 `GRANT`／`REVOKE` 指定誰能讀或改哪些資料。',
        ] },
        { type: 'callout', tone: 'note', title: '練習場裡的 DBMS：SQLite', text: '本頁的 SQL 練習場使用 SQLite 3.49。SQLite 是嵌入式（embedded）DBMS：它是一個函式庫，直接放進應用程式裡執行，不需要另外架設資料庫伺服器，整個資料庫通常就是一個檔案，手機 App 與瀏覽器內部都大量使用它。練習場透過 sql.js 把 SQLite 編譯成 WebAssembly，在這個瀏覽器分頁裡執行，資料庫放在記憶體中：不連線、不上傳，你改了資料也只影響這個分頁，按「重設資料」就回到原始狀態。SQLite 有交易與復原，也允許多個讀取者同時讀取（同一時間只有一個寫入者）；但它沒有使用者帳號，也沒有 `GRANT`／`REVOKE`，權限靠作業系統的檔案權限。' },
        { type: 'callout', tone: 'tip', title: '親手看約束擋下錯誤資料', text: '練習場已開啟外鍵檢查（SQLite 預設是關閉的，練習場先執行了 `PRAGMA foreign_keys = ON;`）。試著執行 `INSERT INTO enrollments VALUES (99, \'CS101\', 80);`：學號 99 的學生不存在，DBMS 會拒絕並回報 `FOREIGN KEY constraint failed`。用檔案存資料時，這筆錯誤的選課紀錄會被默默寫進去。之後按「重設資料」即可。' },
      ],
    },
    {
      id: 'schema-and-instance', title: '資料、綱要與實例',
      blocks: [
        { type: 'p', text: '同一個資料庫可以分成兩個層次來看。綱要（schema）描述資料的結構：有哪些表、每張表有哪些欄位、各是什麼型別、有哪些約束。實例（instance，也叫資料庫狀態）則是某一個時刻資料庫裡實際存放的資料。綱要在設計時決定，很少改變；實例則隨著每次新增、修改、刪除不停變化。' },
        { type: 'p', text: '練習場的 `school` 資料庫有三張表：學生 `students`、課程 `courses`、選課 `enrollments`。它們的綱要就是建立它們的 `CREATE TABLE` 敘述。DBMS 把綱要本身也存成資料，放在系統目錄（system catalog，也叫資料字典）裡；SQLite 的系統目錄是一張名為 `sqlite_schema` 的表（舊名 `sqlite_master`，兩個名字都能用），可以像查一般的表一樣查詢它：' },
        { type: 'example', id: 'schema-catalog' },
        { type: 'p', text: '讀這三段綱要：`students` 的 `id` 是主鍵（`PRIMARY KEY`，每列唯一）；`name`、`class`、`grade` 標了 `NOT NULL`，一定要有值；`email` 沒有標，所以可以是 NULL（沒有值）。`enrollments` 的 `student_id` 與 `course_id` 用 `REFERENCES` 指向另外兩張表，這就是外鍵；兩者合起來是主鍵，表示同一位學生不會重複選同一門課。DB02 會正式介紹鍵，DB07 會教你自己寫 `CREATE TABLE`。' },
        { type: 'p', text: '而下面這張表，是 `students` 現在的實例：8 列資料。明天新來一位轉學生，實例就多一列，但綱要不變。' },
        { type: 'example', id: 'all-students' },
        { type: 'table', head: ['比較', '綱要（schema）', '實例（instance）'], rows: [
          ['是什麼', '資料的結構與規則', '某個時刻實際存放的資料'],
          ['在 school 裡', '`CREATE TABLE students (id INTEGER PRIMARY KEY, …)`', '`(1, \'王小明\', \'甲\', 10, \'ming@example.edu\')` 等 8 列'],
          ['多久改變一次', '很少，改了要小心（DB07 的 `ALTER TABLE`）', '隨時：每次 `INSERT`、`UPDATE`、`DELETE`'],
          ['用程式來比喻', '陣列的宣告 `int scores[5];`：型別與大小', '陣列此刻裝的值 `{92, 85, 67, 90, 58}`'],
        ] },
        { type: 'callout', tone: 'warning', title: '「schema」在不同 DBMS 有第二個意思', text: '本課的綱要指「資料的結構描述」，這是資料庫理論的用法。PostgreSQL、SQL Server 等系統另外把「schema」當成資料庫裡用來分組的命名空間（例如 PostgreSQL 預設的 `public`）。看文件時從上下文判斷是哪一個意思。' },
      ],
    },
    {
      id: 'data-independence', title: '資料獨立性：改變底層，不必改程式',
      blocks: [
        { type: 'p', text: '回想第一節的「程式和格式綁死」。DBMS 用分層來解決它，常見的說法是三層綱要架構（ANSI/SPARC）：最底下是內部層（internal level，資料實際怎麼存在磁碟上：檔案格式、索引、排列方式），中間是概念層（conceptual level，有哪些表與欄位，也就是上一節的綱要），最上面是外部層（external level，個別使用者或應用程式看到的樣子，例如只給導師看自己班級的檢視表 VIEW，DB13）。每一層只依賴下一層提供的介面，所以改了某一層，上面的層可以不受影響，這就是資料獨立性（data independence）。' },
        { type: 'list', items: [
          '實體資料獨立性（physical data independence）：改變內部層（加一個索引、換一種儲存結構、把資料檔搬到另一顆硬碟），概念層的表和所有查詢都不必改。',
          '邏輯資料獨立性（logical data independence）：改變概念層（例如替 `students` 加一個 `phone` 欄位、把一張表拆成兩張），外部層與應用程式可以不必改。它比實體獨立性難做到：加欄位通常沒問題，但把表拆開或改名，就需要用檢視表替舊程式保留原來的樣子。',
        ] },
        { type: 'p', text: '下面的例子先替 `students` 的 `class` 欄位建立索引（index，像書末的索引，讓 DBMS 不必逐列掃描就能找到乙班的學生，DB11 會細談），再執行查詢。查詢的寫法一個字都沒改，結果也和沒有索引時完全一樣；改變的只有 DBMS「怎麼找」，這就是實體資料獨立性。' },
        { type: 'example', id: 'index-same-result' },
        { type: 'callout', tone: 'tip', title: '看見 DBMS 換了做法', text: '在練習場先執行 `EXPLAIN QUERY PLAN SELECT name, grade FROM students WHERE class = \'乙\';`，`detail` 欄位會是 `SCAN students`（逐列掃描）。接著執行 `CREATE INDEX idx_students_class ON students(class);`，再執行同一個 `EXPLAIN QUERY PLAN`，就會變成 `SEARCH students USING INDEX idx_students_class (class=?)`。`EXPLAIN QUERY PLAN` 是 SQLite 的寫法，其他 DBMS 多用 `EXPLAIN`，DB12 會教你讀查詢計畫。同一個索引不能建兩次，再執行一次 `CREATE INDEX` 會出錯，按「重設資料」即可重來。' },
        { type: 'p', text: '對照用陣列寫的程式：如果你把「學生陣列」改成「以班級為鍵的 map」來加快查詢，每一個用到它的迴圈都得重寫。有了 DBMS，加速是 DBMS 內部的事，應用程式送出的 SQL 不必改。' },
        { type: 'callout', tone: 'warning', title: '`SELECT *` 會削弱邏輯獨立性', text: '`SELECT *` 回傳表此刻的所有欄位。若 `students` 加了 `phone` 欄位，`SELECT * FROM students` 的結果就多一欄，依「第 5 欄是 email」寫的程式可能因此出錯；明確寫出 `SELECT name, email FROM students` 則結果不變。在練習場探索資料時用 `*` 很方便，寫進應用程式的查詢最好列出需要的欄位。' },
      ],
    },
    {
      id: 'relational-and-nosql', title: '關聯式與 NoSQL',
      blocks: [
        { type: 'p', text: '1970 年 E. F. Codd 提出關聯式模型（relational model）：所有資料都放在表裡，每張表由列（row，一筆資料）與欄（column，一種屬性）組成，表與表之間用鍵的值互相參照，而不是用指標連結。`school` 的三張表就是關聯式的：選課紀錄不直接「指向」學生，而是記下學號 `student_id`，需要時再依學號組合起來（DB05 的 JOIN）。關聯式資料庫用 SQL 操作，至今仍是最常用的一種。' },
        { type: 'p', text: 'NoSQL 是「非關聯式資料庫」的統稱（常被解讀為 Not only SQL），包含好幾種很不一樣的資料模型：鍵值資料庫（像一個超大的 D09 map）、文件資料庫（每筆資料是一份 JSON 之類的文件）、寬欄資料庫與圖形資料庫。它們通常為了特定的資料形狀或分散到多台機器而設計。兩者是不同的取捨，不是新舊之分：' },
        { type: 'table', head: ['面向', '關聯式資料庫', 'NoSQL 資料庫'], rows: [
          ['資料的樣子', '表（列與欄），每張表有固定的綱要', '依類型而定：鍵值對、文件、寬欄、圖；綱要通常比較彈性，常由應用程式自己約定'],
          ['資料之間的關係', '用鍵連結，查詢時用 JOIN 組合', '常把相關資料直接放在同一份文件裡，或由應用程式自己組合'],
          ['查詢語言', '標準化的 SQL，各家大致相通', '多半各有自己的 API 或查詢語言'],
          ['交易與一致性', '跨多列、多表的交易是基本功能', '各系統差異很大：有的只保證單筆資料的修改，有的也支援交易（DB18）'],
          ['代表系統', 'PostgreSQL、MySQL、SQL Server、Oracle、SQLite', 'Redis（鍵值）、MongoDB（文件）、Cassandra（寬欄）、Neo4j（圖）'],
        ] },
        { type: 'p', text: '怎麼選？資料有清楚的結構、彼此關係很多、正確性很重要（學籍、成績、訂單、帳務）時，關聯式資料庫通常是穩當的起點。資料形狀變化大、幾乎只靠一個鍵存取、或需要特殊的查詢方式（例如在社群關係圖上找朋友的朋友）時，才考慮對應的 NoSQL。本島前面的課程都用關聯式資料庫，DB18 再回來比較 NoSQL 的資料模型。' },
      ],
    },
    {
      id: 'sql-declarative', title: 'SQL：說要什麼，不說怎麼做',
      blocks: [
        { type: 'p', text: 'SQL（Structured Query Language）源自 1970 年代 IBM 的研究，1986 年成為 ANSI 標準，之後也成為 ISO 標準，幾乎所有關聯式 DBMS 都支援它。它是宣告式（declarative）語言：你描述「想要什麼結果」，而不是「一步一步怎麼找」。' },
        { type: 'p', text: '比較一下。若學生存在兩個陣列 `names` 與 `cls` 裡，要印出乙班學生的姓名，你得寫出完整的步驟：`for (int i = 0; i < n; i++) if (cls[i] == "乙") cout << names[i];`，從第 0 個開始、逐一比較、印出。用 SQL 只要說出條件：`SELECT name FROM students WHERE class = \'乙\';`。要逐列掃描還是用索引、從哪裡開始找，都交給 DBMS 的查詢最佳化器決定；上一節的索引例子正是這樣：做法變了，你寫的 SQL 不必變。' },
        { type: 'p', text: '最基本的查詢只有兩個部分：`SELECT` 後面列出要哪些欄位，`FROM` 後面寫從哪張表拿。`*` 表示「全部欄位，依表的順序」。下面只取姓名與班級，欄位的順序就是你在 `SELECT` 後面寫的順序：' },
        { type: 'example', id: 'choose-columns' },
        { type: 'p', text: '先預告一下 `WHERE`：它寫在 `FROM` 後面，只留下條件成立的列。這裡用最簡單的「欄位 = 值」，文字值要用單引號括起來。`WHERE` 的其他寫法（大於、小於、`AND`、`OR`）與排序 `ORDER BY`，在 DB03 正式介紹。' },
        { type: 'example', id: 'where-preview' },
        { type: 'list', items: [
          '關鍵字不分大小寫：`select` 與 `SELECT` 一樣。本課程把關鍵字寫成大寫、表名與欄位名寫成小寫，比較好讀。SQLite 的表名與欄位名（英文字母）也不分大小寫。',
          '文字值區分大小寫，而且要用單引號：`\'DB101\'` 與 `\'db101\'` 是不同的值。',
          '一個敘述以分號 `;` 結尾；練習場一次可以執行多個敘述，會依序顯示每個查詢的結果。',
          '邏輯上 DBMS 先看 `FROM`（哪張表），再看 `WHERE`（留下哪些列），最後才看 `SELECT`（取哪些欄位），雖然寫的時候 `SELECT` 在最前面。',
        ] },
        { type: 'callout', tone: 'warning', title: '單引號是值，雙引號是名稱', text: '標準 SQL 裡，單引號 `\'周老師\'` 是文字值，雙引號 `"title"` 是欄位或表的名稱（識別字）。忘了引號寫成 `WHERE teacher = 周老師`，DBMS 會把 `周老師` 當成欄位名稱，回報 `no such column: 周老師`。SQLite 為了相容舊程式，遇到找不到對應欄位的雙引號名稱時，會退而把它當成文字值，所以 `WHERE teacher = "周老師"` 在 SQLite 碰巧能執行，但在 PostgreSQL 等系統會出錯。請一律用單引號寫文字值。' },
        { type: 'p', text: 'SQL 的敘述常依用途分成幾類：定義綱要的 DDL（Data Definition Language：`CREATE`、`ALTER`、`DROP`），存取資料的 DML（Data Manipulation Language：`SELECT`、`INSERT`、`UPDATE`、`DELETE`，有時把 `SELECT` 另稱為 DQL），管理權限的 DCL（`GRANT`、`REVOKE`），以及控制交易的 `COMMIT`、`ROLLBACK`。這一課只用 `SELECT`。' },
      ],
    },
    {
      id: 'first-query', title: '執行第一個查詢，讀懂結果表',
      blocks: [
        { type: 'p', text: '頁面下方是 SQL 練習場，已經載入 `school` 資料庫。照著做一次：' },
        { type: 'list', ordered: true, items: [
          '展開「資料表」，看看三張表各有哪些欄位，哪些欄位可以是 NULL。',
          '在編輯區輸入 `SELECT * FROM courses;`，或按「所有課程」這個預設查詢，把它載入編輯區。',
          '按「執行」，或按 Ctrl＋Enter（Mac：⌘＋Enter）。',
          '讀結果表：標題寫著「查詢結果：5 列」，表頭是 `id`、`title`、`credits`、`teacher` 四個欄位，下面每一列是一門課。',
          '故意打錯一次：`SELECT * FROM course;` 會出現 `no such table: course`，`SELECT titel FROM courses;` 會出現 `no such column: titel`。錯誤訊息會告訴你是表名還是欄位名寫錯了。',
        ] },
        { type: 'p', text: '讀結果表時注意這幾件事：' },
        { type: 'list', items: [
          '欄位：表頭就是 `SELECT` 後面列出的欄位，順序相同；用 `*` 時是表本身的欄位順序。',
          '列：每一列是一筆符合條件的資料。標題的「N 列」就是列數（row count），沒有任何列符合時會顯示 0 列，這不是錯誤，只是沒有符合的資料。',
          'NULL：表示「沒有值」或「未知」，例如沒有登記 email 的學生、還沒有指定老師的「藝術欣賞」。NULL 不是空字串 `\'\'`，也不是 0；練習場在格子裡寫出 NULL。比較 NULL 有特別的規則，DB03 會講。',
          '順序：沒有寫 `ORDER BY` 時，SQL 不保證列的順序。現在看到的順序剛好是資料存放的順序，但不要依賴它；需要特定順序時要明確寫出來（DB03）。',
          '`SELECT` 只是讀取：查詢多少次都不會改變資料。結果本身也是一張表，之後的課程會在結果上再查詢。',
        ] },
        { type: 'callout', tone: 'note', title: '練習場的限制', text: '每次執行最多 20 個敘述，每個結果最多顯示 200 列，執行超過 3 秒會被停止。`school` 的資料很少，這一課的查詢都不會碰到這些限制。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-concurrency', prompt: '教務處兩位職員同時打開同一個成績檔，各自修改一位學生的成績後存檔，結果先存檔那位職員的修改不見了。DBMS 的哪一項功能專門解決這種問題？',
      options: ['並行控制：讓多人同時修改也不會互相覆蓋', '資料獨立性：改變儲存方式時不必修改程式', '綱要：事先宣告每個欄位的型別', '權限控管：限制誰可以讀或改資料'],
      answer: 0, explanation: '這是遺失更新（lost update）：後存檔的人寫回的是舊內容加上自己的修改，蓋掉了別人的修改。並行控制保證多人同時操作的結果合理、不會互相覆蓋。資料獨立性處理的是「底層改變時程式不必改」；綱要描述資料的結構，不管誰先寫入；權限控管決定誰能改，但兩位職員本來就都有權修改，問題出在同時修改。',
    },
    {
      id: 'q-schema-instance', prompt: '下面哪一項屬於 `school` 資料庫的綱要，而不是實例？',
      options: ['`students` 目前有 8 列資料', '王小明的 email 是 `ming@example.edu`', '`students` 的 `email` 欄位是 TEXT 型別，而且可以是 NULL', '陳志豪的 email 是 NULL'],
      answer: 2, explanation: '綱要描述結構與規則：有哪些欄位、型別、能不能是 NULL，寫在 `CREATE TABLE` 裡。其他三項都是某個時刻實際存放的資料，屬於實例：列數會隨新增刪除改變，王小明的 email 可能被更新，陳志豪的 email 是 NULL 也只是現在還沒登記，之後可以補上；而「email 可以是 NULL」這條規則不會因為某一列的值而改變。',
    },
    {
      id: 'q-independence', prompt: '資料庫管理員替 `courses` 的 `teacher` 欄位建立了索引。原本應用程式送出的下面這個查詢會怎樣？',
      code: { language: 'SQL', text: 'SELECT title FROM courses WHERE teacher = \'周老師\';' },
      options: ['必須改寫成使用索引的語法，否則會出錯', '不必改寫，結果相同，DBMS 可能改用索引而更快', '不必改寫，但結果的列可能變少', '必須先重新建立 courses 表，查詢才看得到索引'],
      answer: 1, explanation: '索引屬於內部層（資料怎麼存、怎麼找），查詢只描述想要的結果。DBMS 會自己決定要不要用索引，結果完全相同，這就是實體資料獨立性。SQL 沒有「必須指定索引」的規定，所以不會出錯；索引不會改變資料，結果的列不會變少；建立索引也不需要重建表。',
    },
    {
      id: 'q-declarative', prompt: '說 SQL 是「宣告式」語言，最準確的意思是什麼？',
      options: ['SQL 的關鍵字一定要寫成大寫', 'SQL 只能宣告表，不能查詢資料', 'SQL 會依照你寫的順序逐列比較，所以要自己安排最快的步驟', '你描述想要的結果，怎麼找到它由 DBMS 決定'],
      answer: 3, explanation: '宣告式指的是只說「要什麼」：哪張表、哪些欄位、符合什麼條件；要逐列掃描還是用索引，由 DBMS 的查詢最佳化器決定。關鍵字不分大小寫，大寫只是慣例；SQL 當然能查詢，`SELECT` 就是；「自己安排步驟、逐列比較」正是用陣列加迴圈的命令式寫法，和宣告式相反。',
    },
    {
      id: 'q-read-result', prompt: '在練習場的 `school` 資料上執行下面的查詢，結果表長什麼樣子？（丙班有黃雅婷與吳承恩，黃雅婷沒有登記 email）',
      code: { language: 'SQL', text: 'SELECT name, email FROM students WHERE class = \'丙\';' },
      options: ['2 個欄位、2 列，其中黃雅婷那一列的 email 是 NULL', '5 個欄位、2 列，因為 students 有 5 個欄位', '2 個欄位、1 列，email 是 NULL 的列不會出現', '2 個欄位、8 列，WHERE 只會把不符合的列變成 NULL'],
      answer: 0, explanation: '結果只有 `SELECT` 列出的兩個欄位 `name`、`email`，不是表的全部 5 個欄位。`WHERE class = \'丙\'` 留下丙班的 2 位學生；條件看的是 class，email 是 NULL 不影響這一列被選上，它只是在 email 欄顯示 NULL。`WHERE` 會把不符合的列整列去掉，而不是把值改成 NULL，所以不會有 8 列。',
    },
    {
      id: 'q-quotes', prompt: '執行下面的查詢會發生什麼事？',
      code: { language: 'SQL', text: 'SELECT title FROM courses WHERE teacher = 周老師;' },
      options: ['回傳周老師教的兩門課', '回傳 0 列，因為沒有一列的 teacher 等於這個值', '出現錯誤 `no such column: 周老師`，因為沒有引號的名字會被當成欄位名稱', '出現錯誤 `no such table: courses`'],
      answer: 2, explanation: '文字值必須用單引號寫成 `\'周老師\'`。沒有引號時，DBMS 把 `周老師` 當成識別字（欄位名稱），而 `courses` 沒有這個欄位，所以在開始執行前就報錯，根本不會回傳結果，也就不是 0 列。`courses` 這張表確實存在，所以不會是 `no such table`。',
    },
    {
      id: 'q-nosql', prompt: '關於關聯式資料庫與 NoSQL，下面哪一個說法最正確？',
      options: ['NoSQL 比關聯式資料庫新，所以新專案都應該用 NoSQL', 'NoSQL 是多種非關聯式資料模型的統稱，例如鍵值、文件、圖；適不適合要看資料的形狀與需求', '關聯式資料庫不能同時讓多個人使用', 'NoSQL 資料庫一律不支援交易'],
      answer: 1, explanation: 'NoSQL 涵蓋鍵值、文件、寬欄、圖等不同模型，各有適合的資料形狀，選擇要看需求而不是新舊：結構清楚、關係多、正確性重要的資料（成績、訂單）用關聯式通常很合適。關聯式 DBMS 正是以支援多人同時使用（並行控制）為基本功能；「一律不支援交易」也不對，有些 NoSQL 系統支援交易，有些只保證單筆資料。',
    },
  ],
  sql: {
    dataset: 'school',
    presets: [
      { label: '所有學生', sql: sql`SELECT * FROM students;` },
      { label: '所有課程', sql: sql`SELECT * FROM courses;` },
      { label: '所有選課紀錄', sql: sql`SELECT * FROM enrollments;` },
      { label: '學生姓名與 email', sql: sql`SELECT name, email FROM students;` },
      { label: '甲班學生', sql: sql`SELECT name, grade FROM students WHERE class = '甲';` },
      { label: '查看綱要', sql: sql`SELECT name, sql FROM sqlite_schema WHERE type = 'table';` },
    ],
    examples: [
      {
        id: 'schema-catalog', title: '查詢系統目錄裡的綱要', dataset: 'school',
        description: '`sqlite_schema` 是 SQLite 的系統目錄，每列描述資料庫裡的一個物件；`type = \'table\'` 只留下表，`sql` 欄位存的就是建立它的 `CREATE TABLE` 原文。',
        sql: sql`SELECT name, sql FROM sqlite_schema WHERE type = 'table';`,
        result: { columns: ['name', 'sql'], rows: [
          ['students', 'CREATE TABLE students (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  class TEXT NOT NULL,\n  grade INTEGER NOT NULL,\n  email TEXT\n)'],
          ['courses', 'CREATE TABLE courses (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  credits INTEGER NOT NULL,\n  teacher TEXT\n)'],
          ['enrollments', 'CREATE TABLE enrollments (\n  student_id INTEGER NOT NULL REFERENCES students(id),\n  course_id TEXT NOT NULL REFERENCES courses(id),\n  score INTEGER,\n  PRIMARY KEY (student_id, course_id)\n)'],
        ] },
      },
      {
        id: 'all-students', title: '一張表的實例：所有學生', dataset: 'school',
        description: '`*` 取出全部欄位，依表的欄位順序。陳志豪與黃雅婷沒有登記 email，所以是 NULL。',
        sql: sql`SELECT * FROM students;`,
        result: { columns: ['id', 'name', 'class', 'grade', 'email'], rows: [
          [1, '王小明', '甲', 10, 'ming@example.edu'],
          [2, '李佳穎', '甲', 10, 'jiaying@example.edu'],
          [3, '陳志豪', '乙', 10, null],
          [4, '林怡君', '乙', 11, 'yijun@example.edu'],
          [5, '張家豪', '甲', 11, 'jiahao@example.edu'],
          [6, '黃雅婷', '丙', 11, null],
          [7, '吳承恩', '丙', 12, 'chengen@example.edu'],
          [8, '蔡宜蓁', '乙', 12, 'yizhen@example.edu'],
        ] },
      },
      {
        id: 'index-same-result', title: '建立索引後，同一個查詢、同樣的結果', dataset: 'school',
        description: '第一個敘述建立索引（屬於內部層），第二個敘述是原本的查詢，一個字都沒改。結果和沒有索引時相同，DBMS 只是改用索引來找。',
        sql: sql`CREATE INDEX idx_students_class ON students(class);
SELECT name, grade FROM students WHERE class = '乙';`,
        result: { columns: ['name', 'grade'], rows: [['陳志豪', 10], ['林怡君', 11], ['蔡宜蓁', 12]] },
      },
      {
        id: 'choose-columns', title: '只取需要的欄位', dataset: 'school',
        description: '`SELECT` 後面列出的欄位決定結果有哪些欄、順序為何；列數仍是 8，因為沒有任何條件。',
        sql: sql`SELECT name, class FROM students;`,
        result: { columns: ['name', 'class'], rows: [
          ['王小明', '甲'], ['李佳穎', '甲'], ['陳志豪', '乙'], ['林怡君', '乙'],
          ['張家豪', '甲'], ['黃雅婷', '丙'], ['吳承恩', '丙'], ['蔡宜蓁', '乙'],
        ] },
      },
      {
        id: 'where-preview', title: '預告 WHERE：只留下乙班', dataset: 'school',
        description: '`WHERE class = \'乙\'` 只留下 class 等於「乙」的列，結果剩 3 列；文字值用單引號括起來。',
        sql: sql`SELECT name, grade FROM students WHERE class = '乙';`,
        result: { columns: ['name', 'grade'], rows: [['陳志豪', 10], ['林怡君', 11], ['蔡宜蓁', 12]] },
      },
    ],
    exercises: [
      {
        id: 'ex-course-columns', title: '依指定順序取出欄位', dataset: 'school', hidden: ['school-b'], ordered: false,
        statement: '列出所有課程的課名、授課老師與學分，欄位依序為 `title`、`teacher`、`credits`（和表本身的欄位順序不同）。列的順序不拘；還沒有指定老師的課，teacher 會是 NULL，照樣列出。',
        starter: 'SELECT ',
        hints: [
          '資料在 `courses` 表；`SELECT` 後面依題目要求的順序寫欄位，用逗號分隔。',
          '不要用 `*`：它會依表的順序回傳全部 4 個欄位（包括 `id`）。',
        ],
        solution: sql`SELECT title, teacher, credits FROM courses;`,
        alternatives: [
          sql`SELECT courses.title, courses.teacher, courses.credits FROM courses;`,
          sql`SELECT "title", "teacher", "credits" FROM courses;`,
        ],
        mistakes: [
          { sql: sql`SELECT * FROM courses;`, why: '`*` 回傳表的全部 4 個欄位（多了 `id`），順序也是表本身的 `id, title, credits, teacher`，不是題目要的 3 個欄位。' },
          { sql: sql`SELECT title, credits, teacher FROM courses;`, why: '欄位齊全但順序錯了：結果的欄位順序就是 `SELECT` 後面寫的順序，第 2 欄應該是老師，這裡卻是學分。' },
        ],
      },
      {
        id: 'ex-class-a', title: '甲班學生的聯絡方式', dataset: 'school', hidden: ['school-b'], ordered: false,
        statement: '列出 `class` 為「甲」的所有學生，欄位依序為 `name`、`email`。列的順序不拘；沒有 email 的學生也要列出（email 是 NULL）。',
        starter: 'SELECT name, email\nFROM students\nWHERE ',
        hints: [
          '用 `WHERE class = …` 只留下甲班；文字值要加單引號。',
          '條件看的是 `class`，不要寫成學生的 `id`：換一份資料，甲班的學生就不同了。',
        ],
        solution: sql`SELECT name, email FROM students WHERE class = '甲';`,
        alternatives: [
          sql`SELECT students.name, students.email FROM students WHERE students.class = '甲';`,
          sql`SELECT name, email FROM students WHERE '甲' = class;`,
        ],
        mistakes: [
          { sql: sql`SELECT name, email FROM students WHERE class = 甲;`, why: '少了單引號，`甲` 被當成欄位名稱，出現錯誤 `no such column: 甲`。文字值要寫成 `\'甲\'`。' },
          { sql: sql`SELECT name, email FROM students;`, why: '忘了 `WHERE`，所有班級的學生都被列出來，列數比預期多。' },
          { sql: sql`SELECT * FROM students WHERE class = '甲';`, why: '列對了，但 `*` 回傳全部 5 個欄位；題目只要 `name`、`email` 兩欄。' },
        ],
      },
      {
        id: 'ex-db101-scores', title: '資料庫概論的成績', dataset: 'school', hidden: ['school-b'], ordered: false,
        statement: '從選課紀錄 `enrollments` 列出課程代碼為 `DB101` 的每一筆紀錄，欄位依序為 `student_id`、`score`。列的順序不拘；還沒有評分的紀錄 score 是 NULL，也要列出。',
        hints: [
          '課程代碼存在 `enrollments.course_id`，條件寫成 `course_id = \'DB101\'`。',
          '文字值區分大小寫：`\'DB101\'` 和 `\'db101\'` 是不同的值。',
          '只要兩個欄位，不需要 `course_id`（每一列都一樣是 DB101）。',
        ],
        solution: sql`SELECT student_id, score FROM enrollments WHERE course_id = 'DB101';`,
        alternatives: [
          sql`SELECT enrollments.student_id, enrollments.score FROM enrollments WHERE enrollments.course_id = 'DB101';`,
          sql`SELECT student_id, score FROM enrollments WHERE 'DB101' = course_id;`,
        ],
        mistakes: [
          { sql: sql`SELECT student_id, score FROM enrollments WHERE course_id = 'db101';`, why: '文字比較區分大小寫，資料裡存的是大寫的 `DB101`，所以一列都不符合，得到 0 列。' },
          { sql: sql`SELECT student_id, course_id, score FROM enrollments WHERE course_id = 'DB101';`, why: '多了 `course_id` 欄位：結果有 3 個欄位，題目只要 `student_id`、`score` 兩欄。' },
        ],
      },
    ],
  },
};
