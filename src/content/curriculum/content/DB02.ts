import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB02 The Relational Model: Tables, Keys, and Relational Algebra. SQL lesson (Phase F.1a): examples and exercises run in tests/curriculum-sql.test.ts. */
export const DB02: LessonContent = {
  lessonId: 'DB02',
  motivation: '上一課你已經對一張表下過 SELECT，但「表」到底是什麼？為什麼每張表都要有主鍵？為什麼選課紀錄不能指向一位不存在的學生？關聯式模型（relational model）就是這些問題背後的數學：一張表是一個「關聯」，也就是元組的集合；鍵保證每一列都找得到、不會重複；外鍵把表和表連起來，並由 DBMS 守住參考完整性。關聯代數（relational algebra）則把查詢拆成選擇、投影、乘積、合併這幾個基本運算，每個運算的結果又是一張表，可以一路組合下去。學會用關聯代數「先在紙上算出結果」，你就能在寫 SQL 之前預測答案，在結果不對時知道是哪一步出錯，也能看懂後面 JOIN、子查詢與正規化各課在說什麼。',
  sections: [
    {
      id: 'relation-terms', title: '關聯、屬性、值域與元組',
      blocks: [
        { type: 'p', text: '在關聯式模型裡，一張表叫做關聯（relation）。表頭的每個欄位是一個屬性（attribute），每個屬性有一個值域（domain），也就是它允許出現的值的集合；表裡的每一列是一個元組（tuple），對每個屬性各給一個值。屬性的個數叫做關聯的度（degree），元組的個數叫做基數（cardinality）。用練習場的 `students` 表來對照：' },
        { type: 'table', head: ['術語', '在 students 表上', '說明'], rows: [
          ['關聯（relation）', '`students` 這張表', '關聯名稱加上屬性清單就是它的綱要：`students(id, name, class, grade, email)`'],
          ['屬性（attribute）', '`id`、`name`、`class`、`grade`、`email`', '欄位；在關聯中用名稱而不是位置來辨認'],
          ['值域（domain）', '`grade` 只能是 10、11、12；`class` 是 甲、乙、丙', '每個屬性允許的值；資料型別只是值域的粗略近似'],
          ['元組（tuple）', '`(1, 王小明, 甲, 10, ming@example.edu)`', '一列資料'],
          ['度（degree）', '5', '屬性的個數，綱要決定，不隨資料變'],
          ['基數（cardinality）', '8', '元組的個數，新增或刪除資料就會變'],
        ] },
        { type: 'p', text: '綱要（schema）是不常變的「形狀」，實例（instance）是某個時刻的實際資料：今天 `students` 的基數是 8，明天新生入學就變成 10，但度仍是 5。等一下談鍵的時候，這個區分非常重要。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的型別與值域', text: '標準 SQL 的欄位型別會擋下不屬於值域的值。SQLite 預設採用型別親和性（type affinity）：`grade` 宣告為 `INTEGER`，你還是可以存入文字 `\'abc\'`，SQLite 會照樣存成文字（除非表宣告為 `STRICT`）。要真正限制值域，可以加上 `CHECK (grade BETWEEN 10 AND 12)` 這類約束。' },
      ],
    },
    {
      id: 'relation-is-a-set', title: '關聯是元組的集合，SQL 的表是多重集合',
      blocks: [
        { type: 'p', text: '在 D08 學過，集合（set）只存不重複的元素，也沒有「第幾個」的順序。關聯正是元組的集合，所以有兩個直接的推論：同一個關聯裡不會有兩個完全相同的元組；元組之間沒有先後順序，「第一列」沒有意義。屬性之間也沒有順序，因為我們用名稱辨認它們。' },
        { type: 'p', text: '實際的 SQL 為了效率與實用，在這兩點上跟理論不同：' },
        { type: 'table', head: ['', '關聯（理論）', 'SQL 的表與查詢結果'], rows: [
          ['重複的列', '不可能出現', '允許：查詢結果預設保留重複，要去重得寫 `SELECT DISTINCT`；表沒有主鍵或唯一約束時，表本身也可以存兩列一模一樣的資料'],
          ['列的順序', '沒有順序', '也沒有保證的順序：同一個查詢在不同時間、不同 DBMS 可能用不同順序回傳，需要順序就寫 `ORDER BY`（DB03）'],
          ['欄位的順序', '沒有順序，用名稱辨認', '有順序：`SELECT *` 依建表時的欄位順序輸出'],
        ] },
        { type: 'p', text: '這種「允許重複的集合」叫做多重集合（multiset，也叫 bag）。所以把關聯代數翻成 SQL 時要特別留意：代數的運算結果一定沒有重複，SQL 只有在你要求時才去重。' },
        { type: 'callout', tone: 'warning', title: '常見誤會：練習場的順序就是表的順序', text: '練習場裡 `SELECT * FROM students;` 看起來總是照 id 排好，那只是 SQLite 目前的存放與讀取方式剛好如此，不是 SQL 的保證。換一個查詢條件、加了索引或換一套 DBMS，順序都可能改變。凡是答案需要順序，就明確寫出 `ORDER BY`。' },
      ],
    },
    {
      id: 'keys', title: '超鍵、候選鍵與主鍵',
      blocks: [
        { type: 'p', text: '既然關聯裡沒有重複的元組，就一定存在某些屬性組合，能唯一決定一個元組。能唯一辨認每個元組的屬性集合叫做超鍵（superkey）。超鍵可能帶有多餘的屬性：`{id}` 是 `students` 的超鍵，`{id, name}`、`{id, class, email}` 也都是，因為只要含有 `id` 就不會重複。' },
        { type: 'p', text: '去掉任何一個屬性就不再唯一的超鍵，也就是「最小的」超鍵，叫做候選鍵（candidate key）。一個關聯可以有好幾個候選鍵，設計者從中選一個作為主鍵（primary key），用來代表這個元組，其他表要參照它時也用主鍵。' },
        { type: 'table', head: ['屬性集合', '超鍵？', '候選鍵？', '理由'], rows: [
          ['`students {id}`', '是', '是', '學號由學校指派，不會重複；只有一個屬性，無法再縮小'],
          ['`students {id, name}`', '是', '否', '含有 `id` 所以唯一，但去掉 `name` 仍唯一，不是最小'],
          ['`students {name}`', '否', '否', '現在 8 個名字剛好不同，但同名同姓完全可能，學校不能保證'],
          ['`students {email}`', '否', '否', '有兩位學生的 email 是 NULL，也沒有唯一約束擋住重複'],
          ['`enrollments {student_id}`', '否', '否', '王小明（1）選了兩門課，出現兩次'],
          ['`enrollments {student_id, course_id}`', '是', '是', '同一位學生同一門課只會有一筆；拿掉任何一個都會重複'],
          ['`enrollments {student_id, course_id, score}`', '是', '否', '多了 `score`，不是最小'],
        ] },
        { type: 'p', text: '`enrollments` 的主鍵 `(student_id, course_id)` 由兩個屬性組成，叫做複合主鍵（composite primary key）。它表達的業務規則是：一位學生同一門課只能選一次。在練習場試試 `INSERT INTO enrollments VALUES (1, \'CS101\', 50);`，會看到 `UNIQUE constraint failed: enrollments.student_id, enrollments.course_id`，因為 (1, CS101) 已經存在。' },
        { type: 'callout', tone: 'warning', title: '鍵是綱要的約束，不是資料剛好的樣子', text: '判斷一組屬性是不是鍵，要問「所有可能的合法資料裡都不會重複嗎」，而不是「現在這 8 列有沒有重複」。`name` 在目前的實例裡沒有重複，仍然不是鍵；`email` 除了可能重複，還可能是 NULL（未知），未知的值無法用來辨認一個人，所以也不適合當鍵。' },
      ],
    },
    {
      id: 'foreign-keys-integrity', title: '外鍵、實體完整性與參考完整性',
      blocks: [
        { type: 'p', text: '外鍵（foreign key）是一張表裡的屬性（或屬性組合），它的值必須是另一張表（被參照表）某個主鍵的值。`enrollments` 有兩個外鍵：`student_id` 參照 `students.id`，`course_id` 參照 `courses.id`。在建表敘述裡寫成 `student_id INTEGER NOT NULL REFERENCES students(id)`。所以 `enrollments` 就是學生與課程之間「多對多」關係的橋樑：一位學生可以選多門課，一門課也可以有多位學生。' },
        { type: 'p', text: 'DBMS 依鍵守住兩條完整性規則：' },
        { type: 'list', items: [
          '實體完整性（entity integrity）：主鍵的任何屬性都不能是 NULL。主鍵是用來辨認元組的，如果主鍵是「未知」，這一列就無法被辨認、也無法被參照。',
          '參考完整性（referential integrity）：外鍵的值要嘛是 NULL（若該欄允許 NULL），要嘛一定等於被參照表中某一列的主鍵值。不能出現「指向不存在的學生」的選課紀錄。',
        ] },
        { type: 'p', text: '練習場已經開啟外鍵檢查，你可以親手撞一下這些規則（做完按「重設資料」回到原狀）：' },
        { type: 'list', ordered: true, items: [
          '`INSERT INTO enrollments VALUES (99, \'CS101\', 80);`：沒有學號 99 的學生，得到 `FOREIGN KEY constraint failed`。',
          '`DELETE FROM students WHERE id = 1;`：王小明還有兩筆選課參照他，刪掉會留下「孤兒」紀錄，同樣失敗。',
          '`DELETE FROM students WHERE id = 8;`：蔡宜蓁沒有選課，沒有人參照她，刪除成功。',
          '`INSERT INTO enrollments VALUES (NULL, \'CS101\', 50);`：主鍵欄位是 NULL，得到 `NOT NULL constraint failed`。',
        ] },
        { type: 'p', text: '刪除被參照的列預設會被拒絕（`NO ACTION`）。建表時也可以改成 `ON DELETE CASCADE`（連帶刪掉參照它的列）或 `ON DELETE SET NULL`，這些設計選擇留到後面的課程。預設查詢「enrollments 的外鍵」執行 `PRAGMA foreign_key_list(enrollments);`，會列出 `enrollments` 的兩個外鍵，以及它們的 `on_delete` 動作。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的兩個特例', text: '第一，SQLite 為了相容舊版，預設不檢查外鍵，每個連線都要先執行 `PRAGMA foreign_keys = ON;`，練習場已經替你開好；其他 DBMS（如 PostgreSQL）一律檢查。第二，標準 SQL 規定主鍵自動不可為 NULL，但 SQLite 對非 `INTEGER PRIMARY KEY` 的主鍵（例如 `courses.id TEXT PRIMARY KEY`）因歷史原因允許 NULL，除非另外宣告 `NOT NULL`；`enrollments` 的兩個主鍵欄位都寫了 `NOT NULL`，所以守得住。而 `students.id INTEGER PRIMARY KEY` 是 SQLite 的 rowid 別名，插入 NULL 時會自動配一個新的編號。' },
      ],
    },
    {
      id: 'selection-projection', title: '選擇 σ 與投影 π',
      blocks: [
        { type: 'p', text: '關聯代數的每個運算都吃進一或兩個關聯、吐出一個新的關聯，所以可以一層層組合。最基本的兩個是選擇與投影：' },
        { type: 'list', items: [
          '選擇（selection）`σ_{條件}(R)`：留下 R 中滿足條件的元組，屬性不變。它「橫著切」表，對應 SQL 的 `WHERE`。',
          '投影（projection）`π_{屬性清單}(R)`：只留下指定的屬性，並去掉因此產生的重複元組。它「直著切」表，對應 SQL `SELECT` 後面的欄位清單；因為代數結果是集合，要寫成 `SELECT DISTINCT` 才完全等價。',
        ] },
        { type: 'p', text: '手算 `σ_{class=\'甲\'}(students)`：逐列檢查 `class`，留下 1、2、5 三列，五個屬性都保留。翻成 SQL 就是 `WHERE class = \'甲\'`：' },
        { type: 'example', id: 'select-class' },
        { type: 'p', text: '手算 `π_{grade}(students)`：先把每列只留 `grade`，得到 10、10、10、11、11、11、12、12 共 8 個值，再去掉重複，結果只剩 3 個元組。若 SQL 只寫 `SELECT grade FROM students;`，你會拿到 8 列，因為 SQL 不會主動去重；加上 `DISTINCT` 才和代數一致：' },
        { type: 'example', id: 'project-grade' },
        { type: 'p', text: '運算可以組合。`π_{class}(σ_{grade=10}(students))` 由內往外算：先選出 10 年級的 1、2、3 號（班級為 甲、甲、乙），再投影到 `class` 並去重，得到 {甲, 乙} 兩個元組。對應的 SQL 是 `SELECT DISTINCT class FROM students WHERE grade = 10;`：SQL 先做 `FROM` 與 `WHERE`（選擇），最後才做 `SELECT`（投影），順序和代數式由內往外一致。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：先投影再選擇', text: '`σ_{grade=10}(π_{class}(students))` 是錯的：投影之後已經沒有 `grade` 屬性，條件無從判斷。手算時先確認「條件用到的屬性還在不在」。同理，SQL 的 `WHERE` 可以用沒出現在 `SELECT` 清單裡的欄位，正是因為選擇在投影之前發生。' },
      ],
    },
    {
      id: 'product-join', title: '笛卡兒積 × 與合併 ⋈',
      blocks: [
        { type: 'p', text: '要同時用到兩張表，先從笛卡兒積（Cartesian product）`R × S` 開始：把 R 的每個元組和 S 的每個元組都配成一對，度是兩者相加，基數是兩者相乘。`students × courses` 有 5 + 4 = 9 個屬性、8 × 5 = 40 個元組。SQL 在 `FROM` 後面用逗號列出多張表，就是乘積：' },
        { type: 'example', id: 'product-count' },
        { type: 'p', text: '乘積裡大部分的配對沒有意義（王小明配上他沒選的課）。再用選擇留下「外鍵等於主鍵」的配對，就是合併（join）：`R ⋈_{條件} S = σ_{條件}(R × S)`。用小資料手算一次。令 A = `π_{id,name}(σ_{id≤2}(students))`，B = `σ_{course_id=\'DB101\'}(enrollments)`，A 有 2 個元組、B 有 4 個，A × B 有 8 個：' },
        { type: 'table', head: ['A.id', 'A.name', 'B.student_id', 'B.course_id', 'B.score', 'A.id = B.student_id？'], rows: [
          ['1', '王小明', '2', 'DB101', '88', '否'],
          ['1', '王小明', '4', 'DB101', '73', '否'],
          ['1', '王小明', '6', 'DB101', '95', '否'],
          ['1', '王小明', '7', 'DB101', '84', '否'],
          ['2', '李佳穎', '2', 'DB101', '88', '是'],
          ['2', '李佳穎', '4', 'DB101', '73', '否'],
          ['2', '李佳穎', '6', 'DB101', '95', '否'],
          ['2', '李佳穎', '7', 'DB101', '84', '否'],
        ] },
        { type: 'p', text: '`A ⋈_{A.id = B.student_id} B` 只剩一個元組 (2, 李佳穎, 2, DB101, 88)。在完整的表上做同樣的事，`π_{name, course_id, score}(σ_{course_id=\'DB101\'}(students ⋈_{students.id = enrollments.student_id} enrollments))` 翻成 SQL 是「`FROM` 兩張表、`WHERE` 寫合併條件與選擇條件」。兩張表都有的欄位名稱要寫成 `表名.欄位` 才不會有歧義：' },
        { type: 'example', id: 'join-db101' },
        { type: 'p', text: '條件是等號的合併叫做等值合併（equijoin）；教科書還有自然合併（natural join）`R ⋈ S`，自動以同名屬性相等為條件並只保留一份。本資料集的外鍵叫 `student_id`、主鍵叫 `id`，名稱不同，所以這裡一律寫出條件。DB05 會介紹專門的 `JOIN … ON` 語法，它和這裡的寫法結果相同，但把合併條件和篩選條件分開寫，比較不容易漏。' },
        { type: 'callout', tone: 'warning', title: '最常見的錯誤：漏了合併條件', text: '三張表合併要兩個條件（`students.id = enrollments.student_id` 和 `enrollments.course_id = courses.id`）。漏掉任何一個，就是對那張表做了笛卡兒積：每一筆選課都和 5 門課全配一次，結果列數暴增、內容全錯，而且 SQL 不會報錯。看到結果列數比預期多好幾倍，先檢查合併條件。經驗法則：合併 n 張表至少需要 n − 1 個合併條件。' },
      ],
    },
    {
      id: 'union-difference', title: '聯集 ∪、差集 − 與手算流程',
      blocks: [
        { type: 'p', text: '既然關聯是集合，集合運算也適用，但兩邊必須相容（union-compatible）：度相同，對應的屬性值域相同。`R ∪ S` 是出現在任一邊的元組，`R − S` 是在 R 中但不在 S 中的元組（還有交集 `R ∩ S`）。SQL 分別寫成 `UNION`、`EXCEPT`（Oracle 傳統上寫成 `MINUS`）與 `INTERSECT`，三者預設都會去重，和代數一致；`UNION ALL` 則保留重複。標準 SQL 也有 `EXCEPT ALL`、`INTERSECT ALL`，但 SQLite 不支援。' },
        { type: 'p', text: '差集很適合回答「沒有」的問題。哪些學生一門課都沒選？`π_{id}(students) − π_{student_id}(enrollments)`：左邊是 1 到 8，右邊是出現在選課表裡的 1 到 7，相減只剩 8。兩邊都只有一個整數屬性，所以是相容的：' },
        { type: 'example', id: 'no-enrollment' },
        { type: 'p', text: '反過來 `π_{student_id}(enrollments) − π_{id}(students)` 一定是空的：參考完整性保證每個 `student_id` 都對應到一位學生。這也是一個好用的檢查：在沒有外鍵約束的系統裡，這個查詢能找出孤兒紀錄。' },
        { type: 'p', text: '本課的練習都照同一個流程做：' },
        { type: 'list', ordered: true, items: [
          '讀懂代數式，由內往外標出每一步的輸入與輸出關聯。',
          '在紙上手算每一步的結果（需要時先只看相關的幾列），寫下最後的元組與個數。',
          '翻成 SQL：`×` 與 `⋈` 變成 `FROM` 的多張表加 `WHERE` 的合併條件，`σ` 變成 `WHERE` 的條件，`π` 變成 `SELECT DISTINCT` 的欄位清單，`−` 變成 `EXCEPT`。',
          '執行並和手算結果比對；不一樣時，回頭逐步找是哪個運算算錯或翻錯。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-degree-cardinality', prompt: '練習場的 `enrollments` 表有 `student_id`、`course_id`、`score` 三個欄位，目前有 14 筆選課紀錄。它的度與基數各是多少？',
      options: ['度 14、基數 3', '度 3、基數 14', '度 2、基數 14（主鍵有兩個屬性）', '度 3、基數 8（有 8 位學生）'],
      answer: 1, explanation: '度是屬性個數 3，基數是元組個數 14。「度 14、基數 3」把兩者弄反了；度算的是全部屬性，不只主鍵的屬性，所以不是 2；基數是這張表自己的元組數，跟 `students` 有幾位學生無關（何況只有 7 位學生出現在選課表裡）。',
    },
    {
      id: 'q-candidate-key', prompt: '下列哪一個是 `enrollments(student_id, course_id, score)` 的候選鍵？',
      options: ['`{student_id}`', '`{course_id, score}`', '`{student_id, course_id, score}`', '`{student_id, course_id}`'],
      answer: 3, explanation: '同一位學生同一門課只有一筆，所以 `{student_id, course_id}` 唯一，而且拿掉任何一個都會重複，是最小的超鍵，也就是候選鍵（本表就選它當主鍵）。`{student_id}` 不唯一：學生 1 選了兩門課。`{course_id, score}` 不保證唯一：同一門課兩人同分，或兩人都還沒有成績（NULL）就分不出來。`{student_id, course_id, score}` 是超鍵，但多了 `score`，不是最小，所以不是候選鍵。',
    },
    {
      id: 'q-project-select', prompt: '對練習場的資料手算 `π_{class}(σ_{grade=10}(students))`，結果有幾個元組？（10 年級：王小明 甲、李佳穎 甲、陳志豪 乙）',
      code: { language: 'SQL', text: 'SELECT DISTINCT class\nFROM students\nWHERE grade = 10;' },
      options: ['2', '3', '1', '8'],
      answer: 0, explanation: '選擇留下 3 位 10 年級學生，投影到 `class` 得到 甲、甲、乙，關聯代數的投影會去掉重複，剩 {甲, 乙} 兩個元組，對應的 SQL 要寫 `DISTINCT`。答 3 是忘了投影會去重（等於沒寫 `DISTINCT` 的 SQL）；答 1 是把「班級種類」誤算成只有甲；答 8 是既沒做選擇也沒去重，把每位學生都算了一次。',
    },
    {
      id: 'q-product-size', prompt: '`students` 有 8 列、`enrollments` 有 14 列。下面的查詢回傳的數字是多少？',
      code: { language: 'SQL', text: 'SELECT COUNT(*)\nFROM students, enrollments;' },
      options: ['14', '22', '112', '8'],
      answer: 2, explanation: '`FROM` 列出兩張表又沒有 `WHERE`，就是笛卡兒積：每位學生和每筆選課都配一次，8 × 14 = 112。14 是加上合併條件 `students.id = enrollments.student_id` 之後的列數（每筆選課剛好配到一位學生）；22 是把兩邊的基數相加，但乘積是度相加、基數相乘；8 是誤以為結果只看第一張表。',
    },
    {
      id: 'q-referential', prompt: '在練習場的資料上（外鍵檢查已開啟），下列哪一個敘述會因為違反參考完整性而失敗？',
      options: [
        '`INSERT INTO enrollments VALUES (2, \'CS101\', 70);`',
        '`INSERT INTO enrollments VALUES (8, \'AR101\', NULL);`',
        '`INSERT INTO enrollments VALUES (9, \'CS101\', 70);`',
        '`DELETE FROM enrollments WHERE student_id = 1;`',
      ],
      answer: 2, explanation: '沒有學號 9 的學生，外鍵 `student_id` 指向不存在的列，得到 `FOREIGN KEY constraint failed`。(2, CS101) 也會失敗，但原因是主鍵重複（李佳穎已經選了 CS101），屬於主鍵的唯一性，不是參考完整性。(8, AR101, NULL) 完全合法：學生 8 與課程 AR101 都存在，`score` 允許 NULL。刪除選課紀錄只是移除「參照者」，不會留下孤兒，所以一定成功。',
    },
    {
      id: 'q-delete-parent', prompt: '下列哪一個 `DELETE` 會失敗？（提示：CS102 有三位學生選修，AR101 沒有人選。）',
      options: [
        '`DELETE FROM courses WHERE id = \'AR101\';`',
        '`DELETE FROM courses WHERE id = \'CS102\';`',
        '`DELETE FROM students WHERE id = 8;`',
        '`DELETE FROM enrollments WHERE course_id = \'CS102\';`',
      ],
      answer: 1, explanation: 'CS102 還有選課紀錄參照它，外鍵的刪除動作是預設的 `NO ACTION`，刪掉會讓那些紀錄指向不存在的課程，所以失敗。AR101 和學生 8 都沒有被參照，可以刪除。刪除 `enrollments` 的列是刪除參照者本身，永遠不違反參考完整性；先刪完 CS102 的選課，再刪 CS102 這門課就會成功。',
    },
    {
      id: 'q-email-key', prompt: '`students` 目前 6 個非 NULL 的 email 都不相同。為什麼 `email` 仍然不適合當主鍵？',
      options: [
        '因為 email 是文字，主鍵只能是整數',
        '因為主鍵必須是表的第一個欄位',
        '因為一張表只能有一個鍵，而 `id` 已經是了',
        '因為有學生的 email 是 NULL，而且綱要沒有保證它永遠不重複',
      ],
      answer: 3, explanation: '主鍵不可為 NULL（實體完整性），而陳志豪與黃雅婷的 email 是 NULL；目前不重複只是這份實例剛好如此，綱要沒有唯一約束，將來可能出現兩人共用一個信箱。文字當主鍵完全可以，`courses.id` 就是 `TEXT`；主鍵不必是第一個欄位，關聯的屬性本來就沒有順序；一張表可以有好幾個候選鍵，只是只選一個當主鍵。',
    },
  ],
  sql: {
    dataset: 'school',
    presets: [
      { label: '學生（students）', sql: 'SELECT * FROM students;' },
      { label: '課程（courses）', sql: 'SELECT * FROM courses;' },
      { label: '選課（enrollments）', sql: 'SELECT * FROM enrollments;' },
      { label: 'enrollments 的外鍵', sql: 'PRAGMA foreign_key_list(enrollments);' },
      { label: '合併：誰選了什麼課', sql: sql`SELECT students.name, courses.title, enrollments.score
FROM students, enrollments, courses
WHERE students.id = enrollments.student_id
  AND enrollments.course_id = courses.id;` },
    ],
    examples: [
      {
        id: 'select-class', title: '選擇：σ_{class=\'甲\'}(students)', dataset: 'school',
        description: '選擇只挑元組、不動屬性：WHERE 留下甲班的三位學生，五個欄位都保留。',
        sql: sql`SELECT *
FROM students
WHERE class = '甲';`,
        result: { columns: ['id', 'name', 'class', 'grade', 'email'], rows: [
          [1, '王小明', '甲', 10, 'ming@example.edu'],
          [2, '李佳穎', '甲', 10, 'jiaying@example.edu'],
          [5, '張家豪', '甲', 11, 'jiahao@example.edu'],
        ] },
      },
      {
        id: 'project-grade', title: '投影：π_{grade}(students)', dataset: 'school',
        description: '投影只留指定的屬性並去掉重複；SQL 要寫 DISTINCT，否則會得到 8 列。',
        sql: sql`SELECT DISTINCT grade
FROM students;`,
        result: { columns: ['grade'], rows: [[10], [11], [12]] },
      },
      {
        id: 'product-count', title: '笛卡兒積：students × courses 的基數', dataset: 'school',
        description: 'FROM 列出兩張表而沒有條件，就是乘積：8 位學生 × 5 門課 = 40 個配對。',
        sql: sql`SELECT COUNT(*)
FROM students, courses;`,
        result: { columns: ['COUNT(*)'], rows: [[40]] },
      },
      {
        id: 'join-db101', title: '合併：選修 DB101 的學生與成績', dataset: 'school',
        description: '合併 = 乘積再選擇：外鍵 enrollments.student_id 必須等於主鍵 students.id，再加上 course_id 的條件，最後投影三個欄位。',
        sql: sql`SELECT students.name, enrollments.course_id, enrollments.score
FROM students, enrollments
WHERE students.id = enrollments.student_id
  AND enrollments.course_id = 'DB101';`,
        result: { columns: ['name', 'course_id', 'score'], rows: [
          ['李佳穎', 'DB101', 88],
          ['林怡君', 'DB101', 73],
          ['黃雅婷', 'DB101', 95],
          ['吳承恩', 'DB101', 84],
        ] },
      },
      {
        id: 'no-enrollment', title: '差集：沒有選課的學生', dataset: 'school',
        description: 'π_{id}(students) − π_{student_id}(enrollments)：兩邊都是一個整數屬性，可以相減，EXCEPT 的結果和代數一樣沒有重複。',
        sql: sql`SELECT id FROM students
EXCEPT
SELECT student_id FROM enrollments;`,
        result: { columns: ['id'], rows: [[8]] },
      },
    ],
    exercises: [
      {
        id: 'ex-high-score-courses', title: '投影要去重：有人考到 80 分以上的課程',
        statement: '把關聯代數式 `π_{course_id}(σ_{score≥80}(enrollments))` 翻成 SQL。先在紙上算出結果有幾個元組，再執行比對。結果只有一個欄位 `course_id`，每門課只出現一次，順序不拘。',
        dataset: 'school', hidden: ['school-b'], ordered: false, columnNames: true,
        starter: sql`SELECT course_id
FROM enrollments
WHERE ...;`,
        hints: [
          '先做內層的選擇：`σ_{score≥80}` 對應 `WHERE score >= 80`。成績是 NULL 的列不滿足條件，會被排除。',
          '再做外層的投影：只留 `course_id`。手算時同一門課會出現好幾次，代數的投影會把它們合成一個。',
          '代數的投影會去重，SQL 不會：記得 `SELECT DISTINCT`。',
        ],
        solution: sql`SELECT DISTINCT course_id
FROM enrollments
WHERE score >= 80;`,
        alternatives: [
          sql`SELECT course_id
FROM enrollments
WHERE score >= 80
GROUP BY course_id;`,
          sql`SELECT id AS course_id
FROM courses
WHERE id IN (SELECT course_id FROM enrollments WHERE score >= 80);`,
        ],
        mistakes: [
          { sql: sql`SELECT course_id
FROM enrollments
WHERE score >= 80;`, why: '少了 `DISTINCT`：SQL 的結果是多重集合，CS101 和 DB101 各出現三次，和代數投影的結果（每門課一個元組）不同。' },
          { sql: sql`SELECT DISTINCT course_id, score
FROM enrollments
WHERE score >= 80;`, why: '投影的屬性清單只有 `course_id`，多帶了 `score` 就是另一個關聯：度變成 2，同一門課也因分數不同而出現多次。' },
        ],
      },
      {
        id: 'ex-low-score-join', title: '三張表的合併：成績低於 70 分的學生與課程',
        statement: '把下面的代數式翻成 SQL：`π_{name, title}(σ_{score<70}(students ⋈_{students.id = enrollments.student_id} enrollments ⋈_{enrollments.course_id = courses.id} courses))`。不要用 `JOIN` 語法（DB05 才介紹），改用 `FROM` 列出三張表、`WHERE` 寫出合併與選擇條件。先手算有幾列再執行。結果欄位依序為學生姓名 `name`、課程名稱 `title`，順序不拘。',
        dataset: 'school', hidden: ['school-b'], ordered: false, columnNames: true,
        starter: sql`SELECT name, title
FROM students, enrollments, courses
WHERE ...;`,
        hints: [
          '合併三張表需要兩個合併條件：學生接上選課（`students.id = enrollments.student_id`），選課接上課程（`enrollments.course_id = courses.id`）。',
          '選擇條件 `score < 70` 用 `AND` 接在合併條件後面；NULL 成績不滿足 `< 70`，不會出現。',
          '手算：先在 `enrollments` 找出成績低於 70 的列，再分別查出學生姓名與課程名稱。',
        ],
        solution: sql`SELECT name, title
FROM students, enrollments, courses
WHERE students.id = enrollments.student_id
  AND enrollments.course_id = courses.id
  AND score < 70;`,
        alternatives: [
          sql`SELECT name, title
FROM (SELECT *
      FROM students, enrollments
      WHERE students.id = enrollments.student_id
        AND score < 70) AS low, courses
WHERE low.course_id = courses.id;`,
        ],
        mistakes: [
          { sql: sql`SELECT name, title
FROM students, enrollments, courses
WHERE students.id = enrollments.student_id
  AND score < 70;`, why: '漏了 `enrollments.course_id = courses.id`：每筆低分選課都和所有課程配了一次（笛卡兒積），列數變成好幾倍，課程名稱也大多是錯的。' },
          { sql: sql`SELECT name, course_id
FROM students, enrollments
WHERE students.id = enrollments.student_id
  AND score < 70;`, why: '投影的是 `title`（課程名稱），不是外鍵 `course_id`。外鍵只是指向課程的編號，要拿到名稱就得再合併 `courses`。' },
        ],
      },
      {
        id: 'ex-unused-courses', title: '差集：沒有人選的課程',
        statement: '把 `π_{id}(courses) − π_{course_id}(enrollments)` 翻成 SQL，找出沒有任何選課紀錄的課程代號。先想清楚兩邊為什麼是相容的、結果應該有幾個元組。結果只有一個欄位 `id`，順序不拘。',
        dataset: 'school', hidden: ['school-b'], ordered: false, columnNames: true,
        hints: [
          '左邊是所有課程代號，右邊是出現在選課表的課程代號，兩邊都是一個文字屬性，可以相減。',
          '集合差在 SQL 寫成 `EXCEPT`，放在兩個 `SELECT` 之間。',
          '想想順序：`A − B` 和 `B − A` 不一樣。因為參考完整性，選課表裡的課程代號一定都在 `courses` 裡。',
        ],
        solution: sql`SELECT id FROM courses
EXCEPT
SELECT course_id FROM enrollments;`,
        alternatives: [
          sql`SELECT id
FROM courses
WHERE id NOT IN (SELECT course_id FROM enrollments);`,
        ],
        mistakes: [
          { sql: sql`SELECT course_id FROM enrollments
EXCEPT
SELECT id FROM courses;`, why: '減的方向反了：這是「在選課表裡但不在課程表裡」的代號，參考完整性保證它一定是空的。' },
          { sql: sql`SELECT DISTINCT courses.id
FROM courses, enrollments
WHERE courses.id <> enrollments.course_id;`, why: '在乘積上用 `<>` 只代表「至少有一筆選課不是這門課」，幾乎每門課都滿足，所以有人選的課也會出現。「沒有任何一筆」要用差集表達。' },
        ],
      },
    ],
  },
};
