import type { LessonContent } from '../schema';

const sql = String.raw;

/**
 * DB09 Mapping ER Diagrams to Relational Schemas. Database lesson (Phase F.1b, activity erd-builder): ER diagrams beside
 * the DDL they map to; SQL examples and probe exercises on the empty dataset run in tests/curriculum-sql.test.ts.
 */
export const DB09: LessonContent = {
  lessonId: 'DB09',
  motivation: 'DB08 把需求畫成了 ER 圖，但 ER 圖不能執行：要讓資料真的存得進去、查得出來，還得把它轉成一組 `CREATE TABLE`。這一步不是自由發揮，而是有一套規則：實體變成資料表、一對多在「多」的那一邊放外鍵、多對多另建中介表、弱實體用擁有者的鍵加上部分鍵當複合主鍵、多值屬性拆成另一張表、一對一用 `UNIQUE` 的外鍵。每條規則背後都有理由，弄錯了不會有錯誤訊息，只會讓資料庫悄悄接受錯的資料：同一位學生重複加入同一個社團、一位員工同時當兩個部門的主管、刪掉大樓後教室還留著。本課一邊看 ER 圖，一邊寫出對應的 DDL，再用插入、刪除與 `JOIN` 查詢實際檢查：該接受的資料接受、該拒絕的資料拒絕、需求要的報表查得出來。學完後，你畫的 ER 圖就能變成一份可以執行、而且經得起檢查的資料庫綱要。',
  sections: [
    {
      id: 'entities-to-tables', title: '實體與屬性：資料表與欄位',
      blocks: [
        { type: 'p', text: '從 ER 圖到關聯綱要（schema mapping）的第一步最直接：每個一般實體（強實體）變成一張資料表，它的屬性變成欄位，鍵屬性變成主鍵。其餘的 ER 元素各有固定的轉換方式，本課依序介紹，先看全貌：' },
        { type: 'table', head: ['ER 圖中的元素', '轉換成', '本課'], rows: [
          ['強實體', '一張資料表；鍵屬性成為 `PRIMARY KEY`', '本節'],
          ['簡單屬性', '一個欄位；必填的加 `NOT NULL`', '本節'],
          ['複合屬性（地址 = 縣市 + 路段 + 門牌）', '拆成幾個欄位，不存成一整串文字', '本節'],
          ['衍生屬性（由生日算出的年齡）', '通常不存，查詢時再算', '本節'],
          ['一對多關係', '在「多」那一邊的表加外鍵', '第 2 節'],
          ['多對多關係（含關係上的屬性）', '另建中介表，主鍵通常是兩個外鍵組成的複合主鍵', '第 3 節'],
          ['弱實體與識別關係', '一張表，主鍵 = 擁有者的鍵 + 部分鍵', '第 4 節'],
          ['多值屬性', '另建一張表，一個值一列', '第 5 節'],
          ['一對一關係', '合併成一張表，或外鍵加 `UNIQUE`', '第 5 節'],
        ] },
        { type: 'p', text: '先看一個最小的圖書館：出版社出版書。「出版社」與「書」都是有自己鍵的強實體，各自變成一張表；英文欄位名稱是寫 SQL 時用的名字，對照圖上的屬性即可。' },
        { type: 'example', id: 'er-publisher-book' },
        { type: 'example', id: 'sql-books-schema' },
        { type: 'p', text: '`pragma_table_info(\'books\')` 是 SQLite 的表值函式，列出 SQLite 實際存下的欄位定義：`notnull` 是 1 表示宣告了 `NOT NULL`，`pk` 不是 0 表示屬於主鍵（數字是它在主鍵中的位置）。圖上「書」的三個屬性變成 `isbn`、`title`、`year` 三個欄位，ISBN 是鍵，所以 `isbn` 是主鍵；書名必填，出版年可以不知道，所以只有 `title` 加了 `NOT NULL`。第四個欄位 `publisher_id` 不是「書」的屬性，而是「出版」這個關係轉換來的外鍵，下一節說明它為什麼放在這裡。' },
        { type: 'callout', tone: 'warning', title: 'SQLite：主鍵欄位不一定禁止 NULL', text: '標準 SQL 規定主鍵欄位不能是 NULL。SQLite 為了相容舊版，在一般資料表裡只有 `INTEGER PRIMARY KEY` 會拒絕 NULL，其他主鍵欄位（包括 `TEXT PRIMARY KEY` 與複合主鍵）都接受 NULL，而且可以有好幾列都是 NULL。`WITHOUT ROWID` 與 `STRICT` 資料表則會強制主鍵不為 NULL。所以本課在 SQLite 上一律把 `NOT NULL` 寫出來：`isbn TEXT PRIMARY KEY NOT NULL`。在 PostgreSQL 等遵守標準的 DBMS 上，多寫的 `NOT NULL` 也不會有害。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的彈性型別', text: '`year INTEGER` 在 SQLite 裡只是型別親和性（type affinity）：放進 `\'2021\'` 會轉成整數 2021，但放進 `\'abc\'` 也會被接受，存成文字（DB07 介紹過）。PostgreSQL 等 DBMS 會直接拒絕把 `\'abc\'` 放進整數欄位；SQLite 要嚴格檢查型別就得用 `STRICT` 資料表或 `CHECK` 約束。唯一的例外是 `INTEGER PRIMARY KEY`：它只能存整數，放文字會得到 `datatype mismatch`。' },
      ],
    },
    {
      id: 'one-to-many', title: '一對多：外鍵放在「多」的一邊',
      blocks: [
        { type: 'p', text: '「出版」是一對多：一家出版社出版零或多本書，每本書恰好由一家出版社出版。規則是把外鍵放在「多」的那一邊，也就是 `books`：每本書只有一家出版社，所以一個 `publisher_id` 欄位剛好放得下。反過來把外鍵放在 `publishers` 就放不下了：一家出版社有很多本書，一個欄位只能存一個值，只好存一串書號，那是第 5 節要避免的「把清單塞進一欄」。' },
        { type: 'p', text: '參與限制決定外鍵能不能是 NULL。圖上書那一端是「恰好一個」（1..1，全部參與），每本書一定有出版社，所以寫成 `publisher_id INTEGER NOT NULL REFERENCES publishers(id)`。如果需求是「自費出版的書可以沒有出版社」（0..1），就拿掉 `NOT NULL`，用 NULL 表示沒有。另一端的最小值（「每家出版社至少出版一本書」這種 1..N）則無法單靠欄位約束表達，通常交給應用程式檢查。' },
        { type: 'example', id: 'sql-publisher-join' },
        { type: 'p', text: '寫完 DDL，馬上用需求查詢驗證：「每家出版社出版了幾本書」沿著外鍵 `b.publisher_id = p.id` 一個 `JOIN` 就查得出來。新芽出版社還沒有書，要用 `LEFT JOIN` 才會出現，並且數 `COUNT(b.isbn)` 而不是 `COUNT(*)`，才會得到 0，這是 DB05 的寫法。查詢寫得順，就是外鍵放對位置的好跡象；如果某個需求得拆字串或比對清單才查得出來，通常是少了一張表或外鍵放錯了邊。' },
        { type: 'callout', tone: 'tip', title: '外鍵的刪除動作也是設計的一部分', text: '`publisher_id` 沒有寫 `ON DELETE`，預設是 `NO ACTION`：出版社還有書時，刪除它會被拒絕（`FOREIGN KEY constraint failed`）。這通常正是想要的，書不該因為出版社資料被刪就消失。寫成 `ON DELETE CASCADE` 會連書一起刪掉，只適合「子表的資料離開父表就沒有意義」的情況，例如第 4 節的弱實體。各種外鍵動作的細節在 DB07。' },
      ],
    },
    {
      id: 'many-to-many', title: '多對多：中介表與複合主鍵',
      blocks: [
        { type: 'p', text: '一本書可以有好幾位作者，一位作者也可以寫好幾本書。這時外鍵放在哪一邊都放不下：放在 `books` 只能記一位作者，放在 `authors` 只能記一本書。多對多關係要另建一張中介表（junction table，也叫關聯表），它的每一列代表「一個配對」：哪本書、哪位作者。中介表有兩個外鍵，分別參考兩邊的主鍵；它的主鍵通常就是這兩個外鍵組成的複合主鍵 `PRIMARY KEY (isbn, author_id)`，意思是同一位作者在同一本書只能登記一次。' },
        { type: 'p', text: '關係上的屬性也放進中介表。圖上「撰寫」帶著「順序」（第一作者、第二作者）：順序既不是書的屬性（一本書有好幾個作者順序），也不是作者的屬性（同一位作者在不同書排的順序不同），它屬於「這本書與這位作者」這個配對，所以是 `book_authors.position`。' },
        { type: 'example', id: 'er-author-book' },
        { type: 'example', id: 'sql-book-authors' },
        { type: 'p', text: '驗證查詢從中介表出發，兩個 `JOIN` 各自沿著一個外鍵接回書與作者，三張表兩個合併條件。結果中《資料庫入門》出現兩次（兩位作者），林雅文也出現兩次（兩本書），這正是多對多。中介表的約束各自擋下一種錯誤資料：' },
        { type: 'list', items: [
          '`PRIMARY KEY (isbn, author_id)`：同一對重複登記會被拒絕（`UNIQUE constraint failed`）。只把 `isbn` 設成主鍵則錯得更嚴重：每本書只能有一位作者，多對多退化成一對多。',
          '兩個 `REFERENCES`：不存在的書或作者會被拒絕。少寫一個，那一邊就可能指向不存在的資料（懸空的外鍵）。',
          '`NOT NULL`：配對的兩端都要有值；`position` 是需求要記錄的屬性，也設為必填。',
          '需要的話還可以加 `UNIQUE (isbn, position)`，讓同一本書不會有兩位「第一作者」：這是中介表的另一個候選鍵。',
        ] },
        { type: 'callout', tone: 'warning', title: '同一對會重複發生時，配對當主鍵就錯了', text: '「讀者借閱複本」看起來也是多對多，但同一位讀者這個月借過、下個月可以再借同一本。如果中介表的主鍵是 (讀者, 複本)，第二次借閱就會被拒絕。關係記錄的是會重複發生的事件時，要讓事件本身成為實體，有自己的鍵（例如 `loans.id`），第 7 節會這樣設計。判斷方法：問「同一對可以出現兩次嗎？」可以的話，配對就不是鍵。' },
      ],
    },
    {
      id: 'weak-entity', title: '弱實體：擁有者的鍵加上部分鍵',
      blocks: [
        { type: 'p', text: '圖書館的一本書可以有好幾本實體複本，館員用「第 1 本、第 2 本」稱呼它們。「第 1 本」單獨說不出是哪一本，要加上是哪本書才能識別，所以「複本」是弱實體：它的部分鍵（複本序號）只在同一本書裡唯一，要和擁有者「書」的鍵合起來才是完整的鍵。轉換規則：弱實體變成一張表，擁有者的主鍵放進來當外鍵，主鍵是「擁有者的鍵 + 部分鍵」組成的複合主鍵。' },
        { type: 'example', id: 'er-book-copy' },
        { type: 'example', id: 'sql-copies-cascade' },
        { type: 'p', text: '`PRIMARY KEY (isbn, copy_no)` 讓 `copy_no` 可以在不同的書重複：刪除之後剩下的《SQL 練習簿》第 1 本與《演算法圖解》第 1 本都是 `copy_no` 1，互不衝突；同一本書的第 1 本則只能有一列。弱實體依存於擁有者而存在，書從館藏移除，它的複本也沒有意義，所以外鍵寫 `ON DELETE CASCADE`：刪除《資料庫入門》時，它的 3 本複本一起被刪除，結果只剩 3 列。沒有寫 CASCADE 的話，這個 `DELETE` 會被拒絕，必須先刪複本。' },
        { type: 'callout', tone: 'warning', title: '只拿部分鍵當主鍵', text: '把複本表寫成 `copy_no INTEGER PRIMARY KEY` 是最常見的錯誤：整個館只能有一本「第 1 本」，第二本書的第 1 本就會被拒絕。反過來只拿 `isbn` 當主鍵，則每本書只能有一本複本。弱實體的主鍵一定是兩部分合起來。' },
        { type: 'callout', tone: 'note', title: '參考弱實體要用複合外鍵', text: '別的表要指向某一本複本時，必須同時給 `isbn` 與 `copy_no`，寫成表層級的複合外鍵：`FOREIGN KEY (isbn, copy_no) REFERENCES copies (isbn, copy_no)`。兩個欄位分開各寫一個 `REFERENCES` 是不行的：`copy_no` 單獨不是 `copies` 的鍵。SQLite 會接受這種 `CREATE TABLE`，但之後在這張表新增資料時回報 `foreign key mismatch`。' },
      ],
    },
    {
      id: 'multivalued-one-to-one', title: '多值屬性與一對一關係',
      blocks: [
        { type: 'p', text: '圖上讀者的「電話」加了大括號 `{電話}`：一位讀者可以留好幾支電話，這是多值屬性。關聯表的每個欄位只放一個值，所以多值屬性要拆成另一張表 `reader_phones`，一支電話一列，外鍵 `reader_id` 指回讀者，主鍵 `(reader_id, phone)` 防止同一支電話重複登記給同一人。它的形狀和弱實體的表一樣：依存於讀者，所以也用 `ON DELETE CASCADE`。' },
        { type: 'example', id: 'er-reader-card' },
        { type: 'example', id: 'sql-reader-phones' },
        { type: 'p', text: '為什麼不直接在 `readers` 放一個 `phones TEXT` 欄位，存 `\'0900-000-101,0900-000-102\'`？因為資料庫看不懂這串文字裡有幾個值：不能對每支電話加約束、不能用 `JOIN` 查「這支電話是誰的」、用 `LIKE \'%101%\'` 搜尋會配到恰好含有這段數字的其他號碼，要算每人有幾支電話還得自己拆字串。改成 `phone1`、`phone2` 兩個欄位也不好：第三支電話放不下，找一支電話要寫 `phone1 = … OR phone2 = …`。DB10 會把這種問題歸到第一正規形式。' },
        { type: 'p', text: '「持有」是一對一：每張借書證恰好屬於一位讀者（1..1），每位讀者最多一張證（0..1，有些讀者還沒辦）。一對一有好幾種正確的轉換，選哪一種看參與限制：' },
        { type: 'table', head: ['做法', '綱要', '什麼時候適合'], rows: [
          ['外鍵放在借書證，加 `UNIQUE`', '`library_cards.reader_id INTEGER NOT NULL UNIQUE`', '借書證這一端是全部參與：每張證一定有主人，外鍵可以 `NOT NULL`，不會有 NULL。本課採用這個做法'],
          ['外鍵放在讀者，加 `UNIQUE`', '`readers.card_no TEXT UNIQUE`（允許 NULL）', '同樣正確，但沒有證的讀者都要存 NULL，也表達不出「每張證都有主人」。讀者那一端也是全部參與時，兩邊就沒有差別'],
          ['合併成一張表', '`readers` 直接加 `card_no`、`issued_on`', '兩邊都全部參與（每位讀者一定有證），而且一起建立、一起刪除時最簡單；否則沒有證的讀者在這些欄位都是 NULL'],
        ] },
        { type: 'p', text: '原則：外鍵放在全部參與（最小值是 1）的那一邊，這樣它可以宣告 `NOT NULL`；再加上 `UNIQUE`，同一位讀者就不能有第二張證。少了 `UNIQUE`，同樣的表其實是一對多（一位讀者可以有很多張證）。' },
        { type: 'example', id: 'sql-library-card' },
        { type: 'p', text: '吳佩珊沒有借書證，在 `LEFT JOIN` 的結果裡卡號與發證日是 NULL。在練習場執行「多值屬性與一對一：電話與借書證」預設查詢後，再執行 `INSERT INTO library_cards (card_no, reader_id, issued_on) VALUES (\'C0003\', 1, \'2026-10-01\');`，會得到 `UNIQUE constraint failed: library_cards.reader_id`：陳怡君已經有一張證了。如果需求改成「遺失可以補發，而且要保留舊證紀錄」，一位讀者就可能有很多張證，關係變成一對多，那時就該拿掉 `UNIQUE`。基數來自需求，不是來自習慣。' },
        { type: 'callout', tone: 'note', title: 'UNIQUE 與 NULL', text: '在 SQLite 與 PostgreSQL 中，`UNIQUE` 欄位可以有好幾列是 NULL：NULL 不等於任何值，也不等於另一個 NULL，所以不算重複。不是每個 DBMS 都一樣，例如 SQL Server 的 `UNIQUE` 約束只容許一個 NULL。上面的第二種做法（`readers.card_no UNIQUE` 允許 NULL）在 SQLite 上可以讓很多位讀者都沒有證。' },
      ],
    },
    {
      id: 'natural-surrogate', title: '自然鍵還是代理鍵',
      blocks: [
        { type: 'p', text: '本課的書用 ISBN 當主鍵，出版社、作者與讀者則用流水號 `id`。ISBN 是自然鍵（natural key）：它在現實世界本來就有意義、能識別一本書；`id` 是代理鍵（surrogate key）：系統產生、本身沒有意義的編號，只用來識別資料列。兩者都是正確的選擇，各有代價，不是哪一個一定比較好：' },
        { type: 'table', head: ['考量', '自然鍵（ISBN、學號）', '代理鍵（`id INTEGER PRIMARY KEY`）'], rows: [
          ['防止重複登記', '主鍵本身就擋下同一本書登記兩次', '只保證 `id` 不重複；同一家出版社可以用兩個 `id` 登記兩次，要另外對名稱加 `UNIQUE`'],
          ['值會不會改變', '現實中的識別碼可能改（電話、Email 尤其常改），參考它的外鍵都得跟著改', '不會改，參考它的表永遠不必更新'],
          ['一定有值嗎', '不一定：舊書與自印本可能沒有 ISBN', '系統產生，一定有'],
          ['讀資料時', '外鍵值本身看得懂（`book_authors` 裡就是 ISBN）', '要 `JOIN` 回去才知道 `id` 指的是誰'],
          ['大小', '可能是長字串，複合鍵更長，每個參考它的表都要存一份', '一個整數'],
        ] },
        { type: 'p', text: '實務上常見的折衷是兩者並用：主鍵用代理鍵，真正能識別資料的自然屬性再加 `UNIQUE`，例如 `publishers` 的 `id` 加上 `name TEXT NOT NULL UNIQUE`。中介表也一樣有兩種寫法：兩個外鍵組成的複合主鍵（第 3 節），或代理鍵 `id` 加上 `UNIQUE (isbn, author_id)`。後者的 `UNIQUE` 不能省，否則同一對可以重複登記，這是練習一會檢查的錯誤。弱實體若有自己的全館唯一編號（例如每本複本貼上條碼），也可以改用條碼當主鍵，`(isbn, copy_no)` 改成 `UNIQUE`。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的 INTEGER PRIMARY KEY', text: '在 SQLite 中，型別恰好寫成 `INTEGER` 的單欄主鍵是 rowid（每列內部編號）的別名：新增時不給值，SQLite 會自動編號，通常是目前最大值加 1，所以刪掉最大的那列之後，它的編號可能被下一列重用；加上 `AUTOINCREMENT` 則保證編號不重用。寫成 `INT PRIMARY KEY` 就不是 rowid 別名，不會自動編號，還會接受 NULL。其他 DBMS 有各自的寫法，例如 PostgreSQL 的 `GENERATED ALWAYS AS IDENTITY`（標準 SQL 的識別欄位）與 MySQL 的 `AUTO_INCREMENT`。' },
      ],
    },
    {
      id: 'verify', title: '寫完 DDL 之後：用需求查詢驗證設計',
      blocks: [
        { type: 'p', text: '最後把借閱加進來。依第 3 節的提醒，借閱會重複發生，所以畫成實體「借閱」，有自己的鍵；它和讀者、複本各是一對多。轉換時，「借閱」變成 `loans` 表，兩個一對多各在 `loans` 放一個外鍵；其中指向弱實體「複本」的是複合外鍵 `(isbn, copy_no)`。需求是「列出目前還沒歸還的借閱：誰借了哪本書的第幾本」：' },
        { type: 'example', id: 'er-library-loans' },
        { type: 'example', id: 'sql-loans-verify' },
        { type: 'p', text: '陳怡君兩次借了同一本複本（10 月 1 日借、15 日還，20 日又借），因為每次借閱有自己的 `id`，兩筆都存得下。接 `copies` 時要兩個條件都寫：`c.isbn = l.isbn AND c.copy_no = l.copy_no`，只寫 `c.copy_no = l.copy_no` 會把每本書的「第 1 本」都配上。`loans` 本身帶著 `isbn`，所以只要書名的話也可以直接接 `books`；這裡經過 `copies` 是為了取得複本的狀態。寫完任何一份綱要，都可以照這份清單檢查：' },
        { type: 'list', ordered: true, items: [
          '把需求查詢一個一個寫出來：每個都應該能沿著外鍵用 `JOIN` 查到，不必拆字串或比對清單。',
          '插入應該被接受的資料，再故意插入應該被拒絕的資料：重複的鍵、不存在的外鍵、必填欄位是 NULL，確認每一筆都被拒絕。本課練習的「檢查敘述」就是這樣檢查你的綱要。',
          '刪除父表的一列，看子表的變化是不是需求要的（被拒絕、一起刪除，或設成 NULL）。',
          '用 `SELECT name, type, "notnull", pk FROM pragma_table_info(\'loans\');` 與 `SELECT * FROM pragma_foreign_key_list(\'loans\');` 看 SQLite 實際存下的定義，確認主鍵、`NOT NULL` 與外鍵動作都和設計一致。',
          '確認外鍵真的會被檢查：SQLite 預設不檢查外鍵，每個連線都要執行 `PRAGMA foreign_keys = ON;`。練習場已經打開（執行 `PRAGMA foreign_keys;` 會得到 1）；自己的程式忘了打開，所有 `REFERENCES` 都不會擋下任何資料。PostgreSQL 等 DBMS 則是宣告了就檢查。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-fk-side', prompt: '需求：「每位顧客可以有零或多筆訂單，每筆訂單恰好屬於一位顧客。」哪一種綱要最能表達這個一對多關係？',
      options: [
        '`customers` 加一欄 `order_ids TEXT`，存這位顧客所有訂單編號，用逗號分隔',
        '`orders` 加一欄 `customer_id INTEGER NOT NULL REFERENCES customers(id)`',
        '`customers` 加一欄 `order_id INTEGER REFERENCES orders(id)`',
        '另建中介表 `customer_orders(customer_id, order_id)`，主鍵是 `(customer_id, order_id)`',
      ],
      answer: 1, explanation: '一對多的外鍵放在「多」的一邊：每筆訂單只有一位顧客，`orders.customer_id` 一個欄位剛好放得下；訂單一端是全部參與，所以加 `NOT NULL`。`order_ids TEXT` 把清單塞進一欄，資料庫無法檢查其中的編號，也不能用 JOIN 查詢；`customers.order_id` 只能存一筆訂單，有兩筆訂單的顧客就放不下；中介表能存，但它是多對多的做法，擋不住「一筆訂單配給兩位顧客」，也不能保證每筆訂單都有顧客。',
    },
    {
      id: 'q-junction-pk', prompt: '學生可以選很多門課，一門課有很多學生。下面的中介表執行到最後一個 INSERT 時會發生什麼事？',
      code: { language: 'SQL', text: 'CREATE TABLE enrollments (\n  student_id INTEGER NOT NULL REFERENCES students(id),\n  course_id TEXT NOT NULL REFERENCES courses(id),\n  PRIMARY KEY (student_id)\n);\nINSERT INTO enrollments VALUES (1, \'CS101\');\nINSERT INTO enrollments VALUES (1, \'MA101\');' },
      options: [
        '兩列都存進去：學生 1 選了兩門課',
        '只有第二列被保留，它覆蓋了第一列',
        '被拒絕：主鍵只有 `student_id`，學生 1 已經有一列了，這個綱要讓每位學生只能選一門課',
        '被拒絕：`course_id` 是文字，不能當外鍵',
      ],
      answer: 2, explanation: '主鍵只有 `student_id`，代表每位學生在這張表最多一列，第二個 INSERT 違反主鍵（`UNIQUE constraint failed: enrollments.student_id`），多對多退化成一對多。中介表的主鍵要是兩個外鍵合起來：`PRIMARY KEY (student_id, course_id)`。INSERT 不會覆蓋舊資料，違反約束就整句被拒絕；外鍵可以是文字，只要型別和它參考的主鍵相符。（假設 `students` 與 `courses` 已有對應的資料列。）',
    },
    {
      id: 'q-weak-delete', prompt: '教室是大樓的弱實體。執行下面的 DDL 與資料後，最後的 `DELETE` 會怎樣？',
      code: { language: 'SQL', text: 'CREATE TABLE buildings (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);\nCREATE TABLE rooms (\n  building_code TEXT NOT NULL REFERENCES buildings(code),\n  room_no TEXT NOT NULL,\n  PRIMARY KEY (building_code, room_no)\n);\nINSERT INTO buildings VALUES (\'A\', \'行政大樓\');\nINSERT INTO rooms VALUES (\'A\', \'101\'), (\'A\', \'102\');\nDELETE FROM buildings WHERE code = \'A\';' },
      options: [
        '被拒絕：外鍵沒有寫刪除動作，預設是 NO ACTION，還有教室參考這棟大樓',
        '大樓與它的兩間教室都被刪除',
        '大樓被刪除，兩間教室留著，`building_code` 指向不存在的大樓',
        '大樓被刪除，兩間教室的 `building_code` 變成 NULL',
      ],
      answer: 0, explanation: '沒有寫 `ON DELETE` 的外鍵預設是 `NO ACTION`（練習場打開了外鍵檢查）：還有子表的列參考它時，刪除父表的列會得到 `FOREIGN KEY constraint failed`。要讓教室跟著大樓一起刪除，外鍵要寫 `ON DELETE CASCADE`；設成 NULL 要寫 `ON DELETE SET NULL`，而且這裡 `building_code` 是 `NOT NULL`，也做不到；留下懸空的教室正是外鍵要防止的事。',
    },
    {
      id: 'q-sqlite-null-pk', prompt: '在 SQLite（一般資料表）執行下面的敘述，最後的查詢回傳多少？',
      code: { language: 'SQL', text: 'CREATE TABLE rooms (\n  building_code TEXT,\n  room_no TEXT,\n  PRIMARY KEY (building_code, room_no)\n);\nINSERT INTO rooms VALUES (\'A\', NULL);\nINSERT INTO rooms VALUES (\'A\', NULL);\nSELECT COUNT(*) FROM rooms;' },
      options: ['0：主鍵欄位不能是 NULL，兩個 INSERT 都被拒絕', '1：第二列和第一列的主鍵相同，被拒絕', '執行到 `CREATE TABLE` 就失敗', '2'],
      answer: 3, explanation: 'SQLite 為了相容舊版，一般資料表中除了 `INTEGER PRIMARY KEY` 以外的主鍵欄位都接受 NULL；而且 NULL 不等於另一個 NULL，兩列不算重複，所以兩列都存進去，結果是 2。標準 SQL（以及 PostgreSQL）會拒絕兩個 INSERT，這才是「0」的推理；在 SQLite 上要得到這個行為，得把欄位寫成 `NOT NULL`，或使用 `WITHOUT ROWID`、`STRICT` 資料表。`CREATE TABLE` 本身沒有問題。',
    },
    {
      id: 'q-one-to-one', prompt: '需求：「每個部門恰好有一位主管，主管是員工；一位員工最多管理一個部門，大多數員工不管理部門。」哪一種設計最好？',
      options: [
        '`departments.manager_id INTEGER NOT NULL UNIQUE REFERENCES employees(id)`',
        '`employees.managed_department_id INTEGER UNIQUE REFERENCES departments(id)`',
        '`departments.manager_id INTEGER NOT NULL REFERENCES employees(id)`（不加 `UNIQUE`）',
        '把部門的欄位併入 `employees`，每位員工一列，不是主管的人部門欄位留 NULL',
      ],
      answer: 0, explanation: '部門這一端是全部參與（每個部門一定有主管），外鍵放在 `departments` 就能宣告 `NOT NULL`，再加 `UNIQUE` 讓一位員工不能管理兩個部門。放在 `employees` 也能表達一對一，但大多數員工都要存 NULL，而且無法要求每個部門都有主管；不加 `UNIQUE` 時同一位員工可以當好幾個部門的主管，變成一對多；併成一張表會讓大多數員工的部門欄位都是 NULL，換主管時部門資料還得從一位員工的列搬到另一位員工的列。',
    },
    {
      id: 'q-text-list', prompt: '把書的多值屬性「關鍵字」存成一欄文字。下面的查詢想找出關鍵字有 `SQL` 的書，它回傳幾列？',
      code: { language: 'SQL', text: 'CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, keywords TEXT);\nINSERT INTO books VALUES\n  (\'9789570000011\', \'資料庫入門\', \'資料庫,SQL\'),\n  (\'9789570000042\', \'文件資料庫實務\', \'NoSQL,雲端\'),\n  (\'9789570000035\', \'演算法圖解\', \'演算法\');\nSELECT title FROM books WHERE keywords LIKE \'%SQL%\';' },
      options: ['3', '1', '2', '0'],
      answer: 2, explanation: '`LIKE \'%SQL%\'` 比對的是字串中有沒有這三個字母，`\'NoSQL,雲端\'` 也包含 `SQL`，所以《資料庫入門》與《文件資料庫實務》都被選出，共 2 列，其中一列是錯的。資料庫看不出逗號分隔的是幾個值。正確的設計是多值屬性另建一張表 `book_keywords(isbn, keyword)`，一個關鍵字一列，查詢寫 `WHERE keyword = \'SQL\'`，比對整個值，結果才是 1 列。',
    },
    {
      id: 'q-repeat-loans', prompt: '借閱紀錄表寫成 `loans(reader_id, isbn, copy_no, borrowed_on, returned_on)`，主鍵是 `(reader_id, isbn, copy_no)`。陳怡君還書後，下個月想再借同一本複本，會發生什麼事？怎麼修正？',
      options: [
        '可以借：主鍵只檢查還沒歸還的借閱',
        '被拒絕；修正方法是加上 `UNIQUE (isbn, copy_no)`',
        '被拒絕；修正方法是把主鍵改成 `(reader_id)`',
        '被拒絕，因為同一對已經存在；修正方法是讓每次借閱有自己的鍵，例如 `id INTEGER PRIMARY KEY`，外鍵照樣保留',
      ],
      answer: 3, explanation: '主鍵規定 (讀者, 書, 複本) 只能出現一次，不管舊的那筆是否已經歸還，所以第二次借閱違反主鍵。借閱是會重複發生的事件，要讓每次借閱有自己的鍵（代理鍵 `id`，或把 `borrowed_on` 也放進主鍵）。`UNIQUE (isbn, copy_no)` 讓每本複本一輩子只能被借一次；主鍵改成 `(reader_id)` 則讓每位讀者一輩子只能借一次，兩者都更糟。主鍵不會只檢查部分資料列。',
    },
  ],
  sql: {
    dataset: 'empty',
    // Every preset drops the tables it recreates, and every table that references them, children first, so the presets
    // can be run again and in any order on the same playground database.
    presets: [
      { label: '一對多：出版社與書（可重複執行）', sql: sql`DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS copies;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS publishers;
CREATE TABLE publishers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE books (
  isbn TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  publisher_id INTEGER NOT NULL REFERENCES publishers(id)
);
INSERT INTO publishers (id, name) VALUES (1, '海風出版'), (2, '山嵐書屋'), (3, '新芽出版社');
INSERT INTO books (isbn, title, year, publisher_id) VALUES
  ('9789570000011', '資料庫入門', 2021, 1),
  ('9789570000028', 'SQL 練習簿', 2023, 1),
  ('9789570000035', '演算法圖解', 2022, 2);
SELECT p.name, COUNT(b.isbn) AS books
FROM publishers p
LEFT JOIN books b ON b.publisher_id = p.id
GROUP BY p.id, p.name
ORDER BY p.id;` },
      { label: '多對多：書與作者的中介表', sql: sql`DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS copies;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS authors;
DROP TABLE IF EXISTS books;
CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE book_authors (
  isbn TEXT NOT NULL REFERENCES books(isbn),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (isbn, author_id)
);
INSERT INTO books (isbn, title) VALUES
  ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿'), ('9789570000035', '演算法圖解');
INSERT INTO authors (id, name) VALUES (1, '林雅文'), (2, '周志遠'), (3, '許文華');
INSERT INTO book_authors (isbn, author_id, position) VALUES
  ('9789570000011', 1, 1), ('9789570000011', 2, 2),
  ('9789570000028', 2, 1),
  ('9789570000035', 3, 1), ('9789570000035', 1, 2);
-- 試試重複登記同一對：INSERT INTO book_authors VALUES ('9789570000011', 1, 3);
SELECT b.title, a.name, ba.position
FROM book_authors ba
JOIN books b ON b.isbn = ba.isbn
JOIN authors a ON a.id = ba.author_id
ORDER BY ba.isbn, ba.position;` },
      { label: '弱實體：複本與 ON DELETE CASCADE', sql: sql`DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS copies;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS books;
CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE copies (
  isbn TEXT NOT NULL REFERENCES books(isbn) ON DELETE CASCADE,
  copy_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在架',
  PRIMARY KEY (isbn, copy_no)
);
INSERT INTO books (isbn, title) VALUES
  ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿'), ('9789570000035', '演算法圖解');
INSERT INTO copies (isbn, copy_no, status) VALUES
  ('9789570000011', 1, '在架'), ('9789570000011', 2, '借出'), ('9789570000011', 3, '在架'),
  ('9789570000028', 1, '借出'), ('9789570000028', 2, '在架'),
  ('9789570000035', 1, '在架');
SELECT COUNT(*) AS copies_before FROM copies;
DELETE FROM books WHERE isbn = '9789570000011';
SELECT b.title, c.copy_no, c.status
FROM copies c
JOIN books b ON b.isbn = c.isbn
ORDER BY c.isbn, c.copy_no;` },
      { label: '多值屬性與一對一：電話與借書證', sql: sql`DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS library_cards;
DROP TABLE IF EXISTS reader_phones;
DROP TABLE IF EXISTS readers;
CREATE TABLE readers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE reader_phones (
  reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  PRIMARY KEY (reader_id, phone)
);
CREATE TABLE library_cards (
  card_no TEXT PRIMARY KEY NOT NULL,
  reader_id INTEGER NOT NULL UNIQUE REFERENCES readers(id),
  issued_on TEXT NOT NULL
);
INSERT INTO readers (id, name) VALUES (1, '陳怡君'), (2, '黃柏翰'), (3, '吳佩珊');
INSERT INTO reader_phones (reader_id, phone) VALUES
  (1, '0900-000-101'), (1, '0900-000-102'), (2, '0900-000-201');
INSERT INTO library_cards (card_no, reader_id, issued_on) VALUES
  ('C0001', 1, '2026-09-01'), ('C0002', 2, '2026-09-05');
-- 試試第二張證：INSERT INTO library_cards VALUES ('C0003', 1, '2026-10-01');
SELECT r.name, c.card_no, COUNT(p.phone) AS phones
FROM readers r
LEFT JOIN library_cards c ON c.reader_id = r.id
LEFT JOIN reader_phones p ON p.reader_id = r.id
GROUP BY r.id, r.name, c.card_no
ORDER BY r.id;` },
      { label: '借閱：複合外鍵與需求查詢', sql: sql`DROP TABLE IF EXISTS loans;
DROP TABLE IF EXISTS library_cards;
DROP TABLE IF EXISTS reader_phones;
DROP TABLE IF EXISTS readers;
DROP TABLE IF EXISTS copies;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS books;
CREATE TABLE readers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE copies (
  isbn TEXT NOT NULL REFERENCES books(isbn) ON DELETE CASCADE,
  copy_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在架',
  PRIMARY KEY (isbn, copy_no)
);
CREATE TABLE loans (
  id INTEGER PRIMARY KEY,
  reader_id INTEGER NOT NULL REFERENCES readers(id),
  isbn TEXT NOT NULL,
  copy_no INTEGER NOT NULL,
  borrowed_on TEXT NOT NULL,
  returned_on TEXT,
  FOREIGN KEY (isbn, copy_no) REFERENCES copies (isbn, copy_no)
);
INSERT INTO readers (id, name) VALUES (1, '陳怡君'), (2, '黃柏翰');
INSERT INTO books (isbn, title) VALUES ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿');
INSERT INTO copies (isbn, copy_no, status) VALUES
  ('9789570000011', 1, '借出'), ('9789570000011', 2, '在架'), ('9789570000028', 1, '借出');
INSERT INTO loans (id, reader_id, isbn, copy_no, borrowed_on, returned_on) VALUES
  (1, 1, '9789570000011', 1, '2026-10-01', '2026-10-15'),
  (2, 2, '9789570000011', 2, '2026-10-02', '2026-10-09'),
  (3, 1, '9789570000011', 1, '2026-10-20', NULL),
  (4, 2, '9789570000028', 1, '2026-10-22', NULL);
SELECT r.name, b.title, l.copy_no, l.borrowed_on
FROM loans l
JOIN readers r ON r.id = l.reader_id
JOIN books b ON b.isbn = l.isbn
WHERE l.returned_on IS NULL
ORDER BY l.borrowed_on;` },
      { label: '檢查綱要：表的定義與外鍵', sql: sql`PRAGMA foreign_keys;
SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name;
SELECT * FROM pragma_foreign_key_list('loans');` },
    ],
    examples: [
      {
        id: 'sql-books-schema', title: '實體變成資料表：pragma_table_info 看欄位定義', dataset: 'empty',
        description: '「出版社」與「書」各成一張表，鍵屬性成為主鍵；最後一句列出 SQLite 實際存下的 books 欄位：型別、是否 NOT NULL、是否屬於主鍵。',
        sql: sql`CREATE TABLE publishers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE books (
  isbn TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  publisher_id INTEGER NOT NULL REFERENCES publishers(id)
);
SELECT name, type, "notnull", pk FROM pragma_table_info('books');`,
        result: { columns: ['name', 'type', 'notnull', 'pk'], rows: [
          ['isbn', 'TEXT', 1, 1],
          ['title', 'TEXT', 1, 0],
          ['year', 'INTEGER', 0, 0],
          ['publisher_id', 'INTEGER', 1, 0],
        ] },
      },
      {
        id: 'sql-publisher-join', title: '一對多：外鍵在書，用 LEFT JOIN 驗證', dataset: 'empty',
        description: 'publisher_id 放在「多」的一邊（books），並且 NOT NULL。需求查詢「每家出版社出版幾本書」沿著外鍵一個 LEFT JOIN 就查得出來，還沒有書的出版社是 0。',
        sql: sql`CREATE TABLE publishers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE books (
  isbn TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  publisher_id INTEGER NOT NULL REFERENCES publishers(id)
);
INSERT INTO publishers (id, name) VALUES (1, '海風出版'), (2, '山嵐書屋'), (3, '新芽出版社');
INSERT INTO books (isbn, title, year, publisher_id) VALUES
  ('9789570000011', '資料庫入門', 2021, 1),
  ('9789570000028', 'SQL 練習簿', 2023, 1),
  ('9789570000035', '演算法圖解', 2022, 2);
SELECT p.name, COUNT(b.isbn) AS books
FROM publishers p
LEFT JOIN books b ON b.publisher_id = p.id
GROUP BY p.id, p.name
ORDER BY p.id;`,
        result: { columns: ['name', 'books'], rows: [
          ['海風出版', 2],
          ['山嵐書屋', 1],
          ['新芽出版社', 0],
        ] },
      },
      {
        id: 'sql-book-authors', title: '多對多：中介表 book_authors', dataset: 'empty',
        description: '中介表有兩個外鍵，主鍵是兩者合起來；關係上的屬性「順序」成為 position 欄位。驗證查詢從中介表出發，兩個 JOIN 接回書與作者。',
        sql: sql`CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE book_authors (
  isbn TEXT NOT NULL REFERENCES books(isbn),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (isbn, author_id)
);
INSERT INTO books (isbn, title) VALUES
  ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿'), ('9789570000035', '演算法圖解');
INSERT INTO authors (id, name) VALUES (1, '林雅文'), (2, '周志遠'), (3, '許文華');
INSERT INTO book_authors (isbn, author_id, position) VALUES
  ('9789570000011', 1, 1), ('9789570000011', 2, 2),
  ('9789570000028', 2, 1),
  ('9789570000035', 3, 1), ('9789570000035', 1, 2);
SELECT b.title, a.name, ba.position
FROM book_authors ba
JOIN books b ON b.isbn = ba.isbn
JOIN authors a ON a.id = ba.author_id
ORDER BY ba.isbn, ba.position;`,
        result: { columns: ['title', 'name', 'position'], rows: [
          ['資料庫入門', '林雅文', 1],
          ['資料庫入門', '周志遠', 2],
          ['SQL 練習簿', '周志遠', 1],
          ['演算法圖解', '許文華', 1],
          ['演算法圖解', '林雅文', 2],
        ] },
      },
      {
        id: 'sql-copies-cascade', title: '弱實體：複合主鍵與 ON DELETE CASCADE', dataset: 'empty',
        description: 'copies 的主鍵是書的 ISBN 加上複本序號。刪除《資料庫入門》時，它的 3 本複本一起被刪除，剩下兩本書的 3 本複本。',
        sql: sql`CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE copies (
  isbn TEXT NOT NULL REFERENCES books(isbn) ON DELETE CASCADE,
  copy_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在架',
  PRIMARY KEY (isbn, copy_no)
);
INSERT INTO books (isbn, title) VALUES
  ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿'), ('9789570000035', '演算法圖解');
INSERT INTO copies (isbn, copy_no, status) VALUES
  ('9789570000011', 1, '在架'), ('9789570000011', 2, '借出'), ('9789570000011', 3, '在架'),
  ('9789570000028', 1, '借出'), ('9789570000028', 2, '在架'),
  ('9789570000035', 1, '在架');
DELETE FROM books WHERE isbn = '9789570000011';
SELECT b.title, c.copy_no, c.status
FROM copies c
JOIN books b ON b.isbn = c.isbn
ORDER BY c.isbn, c.copy_no;`,
        result: { columns: ['title', 'copy_no', 'status'], rows: [
          ['SQL 練習簿', 1, '借出'],
          ['SQL 練習簿', 2, '在架'],
          ['演算法圖解', 1, '在架'],
        ] },
      },
      {
        id: 'sql-reader-phones', title: '多值屬性：一支電話一列', dataset: 'empty',
        description: '{電話} 拆成 reader_phones 表，主鍵 (reader_id, phone)。每位讀者有幾支電話用 LEFT JOIN 加 COUNT 就算得出來，沒留電話的讀者是 0。',
        sql: sql`CREATE TABLE readers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE reader_phones (
  reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  PRIMARY KEY (reader_id, phone)
);
INSERT INTO readers (id, name) VALUES (1, '陳怡君'), (2, '黃柏翰'), (3, '吳佩珊');
INSERT INTO reader_phones (reader_id, phone) VALUES
  (1, '0900-000-101'), (1, '0900-000-102'), (2, '0900-000-201');
SELECT r.name, COUNT(p.phone) AS phones
FROM readers r
LEFT JOIN reader_phones p ON p.reader_id = r.id
GROUP BY r.id, r.name
ORDER BY r.id;`,
        result: { columns: ['name', 'phones'], rows: [
          ['陳怡君', 2],
          ['黃柏翰', 1],
          ['吳佩珊', 0],
        ] },
      },
      {
        id: 'sql-library-card', title: '一對一：外鍵 NOT NULL UNIQUE 放在借書證', dataset: 'empty',
        description: '借書證這一端全部參與，外鍵 reader_id 放在 library_cards 並宣告 NOT NULL；UNIQUE 讓一位讀者最多一張證。LEFT JOIN 列出每位讀者與他的證。',
        sql: sql`CREATE TABLE readers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE library_cards (
  card_no TEXT PRIMARY KEY NOT NULL,
  reader_id INTEGER NOT NULL UNIQUE REFERENCES readers(id),
  issued_on TEXT NOT NULL
);
INSERT INTO readers (id, name) VALUES (1, '陳怡君'), (2, '黃柏翰'), (3, '吳佩珊');
INSERT INTO library_cards (card_no, reader_id, issued_on) VALUES
  ('C0001', 1, '2026-09-01'), ('C0002', 2, '2026-09-05');
SELECT r.name, c.card_no, c.issued_on
FROM readers r
LEFT JOIN library_cards c ON c.reader_id = r.id
ORDER BY r.id;`,
        result: { columns: ['name', 'card_no', 'issued_on'], rows: [
          ['陳怡君', 'C0001', '2026-09-01'],
          ['黃柏翰', 'C0002', '2026-09-05'],
          ['吳佩珊', null, null],
        ] },
      },
      {
        id: 'sql-loans-verify', title: '借閱：代理鍵、複合外鍵與需求查詢', dataset: 'empty',
        description: '每次借閱有自己的 id，所以同一位讀者可以再借同一本複本；(isbn, copy_no) 是指向弱實體 copies 的複合外鍵。需求查詢：目前還沒歸還的借閱。',
        sql: sql`CREATE TABLE readers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books (isbn TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL);
CREATE TABLE copies (
  isbn TEXT NOT NULL REFERENCES books(isbn) ON DELETE CASCADE,
  copy_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在架',
  PRIMARY KEY (isbn, copy_no)
);
CREATE TABLE loans (
  id INTEGER PRIMARY KEY,
  reader_id INTEGER NOT NULL REFERENCES readers(id),
  isbn TEXT NOT NULL,
  copy_no INTEGER NOT NULL,
  borrowed_on TEXT NOT NULL,
  returned_on TEXT,
  FOREIGN KEY (isbn, copy_no) REFERENCES copies (isbn, copy_no)
);
INSERT INTO readers (id, name) VALUES (1, '陳怡君'), (2, '黃柏翰');
INSERT INTO books (isbn, title) VALUES ('9789570000011', '資料庫入門'), ('9789570000028', 'SQL 練習簿');
INSERT INTO copies (isbn, copy_no, status) VALUES
  ('9789570000011', 1, '借出'), ('9789570000011', 2, '在架'), ('9789570000028', 1, '借出');
INSERT INTO loans (id, reader_id, isbn, copy_no, borrowed_on, returned_on) VALUES
  (1, 1, '9789570000011', 1, '2026-10-01', '2026-10-15'),
  (2, 2, '9789570000011', 2, '2026-10-02', '2026-10-09'),
  (3, 1, '9789570000011', 1, '2026-10-20', NULL),
  (4, 2, '9789570000028', 1, '2026-10-22', NULL);
SELECT r.name, b.title, l.copy_no, c.status, l.borrowed_on
FROM loans l
JOIN readers r ON r.id = l.reader_id
JOIN copies c ON c.isbn = l.isbn AND c.copy_no = l.copy_no
JOIN books b ON b.isbn = c.isbn
WHERE l.returned_on IS NULL
ORDER BY l.borrowed_on;`,
        result: { columns: ['name', 'title', 'copy_no', 'status', 'borrowed_on'], rows: [
          ['陳怡君', '資料庫入門', 1, '借出', '2026-10-20'],
          ['黃柏翰', 'SQL 練習簿', 1, '借出', '2026-10-22'],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-club-memberships', title: '多對多：學生與社團（關係上有屬性）',
        statement: '學生可以參加多個社團，每個社團有多位學生，而且要記錄每位學生加入每個社團的日期。建立三張表：`students(id, name)` 與 `clubs(id, name)`，`id` 都是整數主鍵、`name` 必填；中介表 `memberships(student_id, club_id, joined_on)`，三個欄位都必填，`student_id` 參考 `students(id)`、`club_id` 參考 `clubs(id)`，同一位學生不能重複加入同一個社團。下方的檢查敘述會在你的 SQL 之後執行；隱藏的檢查還會插入其他應該被拒絕的資料。',
        dataset: 'empty', hidden: ['empty'], ordered: false,
        starter: sql`CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE clubs (
  ...
);
CREATE TABLE memberships (
  ...
);`,
        hints: [
          '多對多不能把外鍵放在 `students` 或 `clubs`：每一列 `memberships` 代表一個配對，所以它有兩個外鍵，各用 `REFERENCES` 指向一邊的主鍵。',
          '「同一位學生不能重複加入同一個社團」說的是配對不能重複：`PRIMARY KEY (student_id, club_id)`。只拿 `student_id` 當主鍵，學生就只能參加一個社團。',
          '加入日期是關係上的屬性，放在中介表的 `joined_on`，記得三個欄位都加 `NOT NULL`（SQLite 的複合主鍵不會自動禁止 NULL）。',
        ],
        solution: sql`CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE clubs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE memberships (
  student_id INTEGER NOT NULL REFERENCES students(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  joined_on TEXT NOT NULL,
  PRIMARY KEY (student_id, club_id)
);`,
        alternatives: [
          sql`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  club_id INTEGER NOT NULL,
  joined_on TEXT NOT NULL,
  UNIQUE (student_id, club_id),
  FOREIGN KEY (student_id) REFERENCES students (id),
  FOREIGN KEY (club_id) REFERENCES clubs (id)
);`,
          sql`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  joined_on TEXT NOT NULL,
  PRIMARY KEY (club_id, student_id)
) WITHOUT ROWID;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  joined_on TEXT NOT NULL
);`, why: '主鍵只有 `student_id`：每位學生在 `memberships` 只能有一列，也就是只能參加一個社團，林小雨加入第二個社團就被拒絕。多對多的中介表，主鍵要是兩個外鍵合起來。' },
          { sql: sql`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  joined_on TEXT NOT NULL
);`, why: '加了代理鍵 `id` 卻忘了 `UNIQUE (student_id, club_id)`：`id` 每次都不同，同一位學生重複加入同一個社團也會被接受。用代理鍵時，原本的配對仍然要宣告成唯一。' },
          { sql: sql`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  student_id INTEGER NOT NULL REFERENCES students(id),
  club_id INTEGER NOT NULL,
  joined_on TEXT NOT NULL,
  PRIMARY KEY (student_id, club_id)
);`, why: '只有 `student_id` 寫了 `REFERENCES`，`club_id` 只是一個整數：可以加入一個不存在的社團（例如 99），資料庫不會發現。可見的檢查都通過，隱藏的檢查會插入這種懸空的外鍵。中介表的兩個外鍵都要宣告。' },
        ],
        probes: [
          { label: '新增兩位學生', sql: sql`INSERT INTO students (id, name) VALUES (1, '林小雨'), (2, '張大山');` },
          { label: '新增兩個社團', sql: sql`INSERT INTO clubs (id, name) VALUES (10, '資訊社'), (20, '吉他社');` },
          { label: '一位學生參加兩個社團、一個社團有兩位學生（應被接受）', sql: sql`INSERT INTO memberships (student_id, club_id, joined_on) VALUES (1, 10, '2026-09-01'), (1, 20, '2026-09-08'), (2, 10, '2026-09-03');` },
          { label: '同一位學生重複加入同一個社團（應被拒絕）', sql: sql`INSERT INTO memberships (student_id, club_id, joined_on) VALUES (1, 10, '2026-10-01');` },
          { label: '需求查詢：誰參加了哪個社團', sql: sql`SELECT s.name AS student, c.name AS club, m.joined_on FROM memberships m JOIN students s ON s.id = m.student_id JOIN clubs c ON c.id = m.club_id ORDER BY m.student_id, m.club_id;` },
          { label: '加入不存在的社團', sql: sql`INSERT INTO memberships (student_id, club_id, joined_on) VALUES (2, 99, '2026-09-10');`, hidden: true },
          { label: '不存在的學生加入社團', sql: sql`INSERT INTO memberships (student_id, club_id, joined_on) VALUES (9, 20, '2026-09-10');`, hidden: true },
          { label: '沒有加入日期', sql: sql`INSERT INTO memberships (student_id, club_id, joined_on) VALUES (2, 20, NULL);`, hidden: true },
          { label: '社團成員總數', sql: sql`SELECT COUNT(*) FROM memberships;`, hidden: true },
        ],
      },
      {
        id: 'ex-building-rooms', title: '弱實體：大樓與教室',
        statement: '校園有多棟大樓，每間教室屬於一棟大樓；教室號碼只在同一棟大樓內唯一（A 棟和 B 棟都可以有 101）。大樓拆除（刪除）時，它的教室也一起刪除。建立兩張表：`buildings(code, name)`，`code` 是文字主鍵（例如 `\'A\'`），`name` 必填；`rooms(building_code, room_no, seats)`，`building_code` 參考 `buildings(code)`，`room_no` 是文字（例如 `\'101\'`），`seats` 是整數座位數。請自己決定 `rooms` 的主鍵、刪除動作與哪些欄位不可為 NULL（主鍵欄位都不可為 NULL）。',
        dataset: 'empty', hidden: ['empty'], ordered: false,
        starter: sql`CREATE TABLE buildings (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE rooms (
  building_code TEXT ...,
  room_no TEXT ...,
  seats INTEGER,
  ...
);`,
        hints: [
          '教室號碼只在同一棟大樓內唯一，所以「教室」是弱實體：主鍵是擁有者的鍵加上部分鍵，`PRIMARY KEY (building_code, room_no)`。',
          '大樓刪除時教室一起刪除：外鍵寫成 `REFERENCES buildings(code) ON DELETE CASCADE`。沒有寫刪除動作時，預設的 `NO ACTION` 會拒絕刪除還有教室的大樓。',
          'SQLite 一般資料表的複合主鍵會接受 NULL：在 `building_code` 和 `room_no` 加上 `NOT NULL`（或改用 `WITHOUT ROWID` 資料表）。',
        ],
        solution: sql`CREATE TABLE buildings (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE rooms (
  building_code TEXT NOT NULL REFERENCES buildings(code) ON DELETE CASCADE,
  room_no TEXT NOT NULL,
  seats INTEGER,
  PRIMARY KEY (building_code, room_no)
);`,
        alternatives: [
          sql`CREATE TABLE buildings (code TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE rooms (
  building_code TEXT,
  room_no TEXT,
  seats INTEGER,
  PRIMARY KEY (building_code, room_no),
  FOREIGN KEY (building_code) REFERENCES buildings (code) ON DELETE CASCADE
) WITHOUT ROWID;`,
          sql`CREATE TABLE buildings (code TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE rooms (
  building_code TEXT REFERENCES buildings(code) ON DELETE CASCADE ON UPDATE CASCADE,
  room_no TEXT,
  seats INTEGER CHECK (seats > 0),
  PRIMARY KEY (building_code, room_no)
) STRICT;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE buildings (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
CREATE TABLE rooms (
  building_code TEXT NOT NULL REFERENCES buildings(code) ON DELETE CASCADE,
  room_no TEXT PRIMARY KEY NOT NULL,
  seats INTEGER
);`, why: '只拿部分鍵 `room_no` 當主鍵：全校只能有一間 101，B 棟的 101 被拒絕。教室號碼只在同一棟大樓內唯一，主鍵要是 `(building_code, room_no)`。' },
          { sql: sql`CREATE TABLE buildings (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
CREATE TABLE rooms (
  building_code TEXT NOT NULL REFERENCES buildings(code),
  room_no TEXT NOT NULL,
  seats INTEGER,
  PRIMARY KEY (building_code, room_no)
);`, why: '主鍵正確，但外鍵沒有寫 `ON DELETE CASCADE`：預設的 `NO ACTION` 會拒絕刪除還有教室的 A 棟。弱實體依存於擁有者，題目要求大樓刪除時教室一起刪除。' },
          { sql: sql`CREATE TABLE buildings (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);
CREATE TABLE rooms (
  building_code TEXT REFERENCES buildings(code) ON DELETE CASCADE,
  room_no TEXT,
  seats INTEGER,
  PRIMARY KEY (building_code, room_no)
);`, why: '照著標準 SQL「主鍵自動不為 NULL」的習慣省略了 `NOT NULL`，可見的檢查都會通過；但在 SQLite 的一般資料表裡，複合主鍵的欄位接受 NULL，隱藏的檢查插入沒有教室號碼的教室時會被接受。要寫 `NOT NULL`，或用 `WITHOUT ROWID`／`STRICT` 資料表。' },
        ],
        probes: [
          { label: '新增 A、B 兩棟大樓', sql: sql`INSERT INTO buildings (code, name) VALUES ('A', '行政大樓'), ('B', '理學大樓');` },
          { label: 'A 棟兩間教室、B 棟也有 101（應被接受）', sql: sql`INSERT INTO rooms (building_code, room_no, seats) VALUES ('A', '101', 40), ('A', '102', 30), ('B', '101', 60);` },
          { label: 'A 棟第二間 101（應被拒絕）', sql: sql`INSERT INTO rooms (building_code, room_no, seats) VALUES ('A', '101', 50);` },
          { label: '刪除 A 棟（應被接受）', sql: sql`DELETE FROM buildings WHERE code = 'A';` },
          { label: '剩下的教室', sql: sql`SELECT building_code, room_no, seats FROM rooms ORDER BY building_code, room_no;` },
          { label: '沒有教室號碼的教室', sql: sql`INSERT INTO rooms (building_code, room_no, seats) VALUES ('B', NULL, 20);`, hidden: true },
          { label: '不存在的大樓', sql: sql`INSERT INTO rooms (building_code, room_no, seats) VALUES ('C', '201', 20);`, hidden: true },
          { label: '教室總數', sql: sql`SELECT COUNT(*) FROM rooms;`, hidden: true },
        ],
      },
      {
        id: 'ex-department-manager', title: '一對一：部門與主管',
        statement: '每個部門恰好有一位主管，主管是公司的員工；一位員工最多管理一個部門，大多數員工不管理任何部門。依參與限制，外鍵放在部門：建立 `employees(id, name)`，`id` 是整數主鍵、`name` 必填；`departments(id, name, manager_id)`，`id` 是整數主鍵、`name` 必填，`manager_id` 參考 `employees(id)`。請用約束表達「每個部門一定有主管」與「同一位員工不能當兩個部門的主管」。',
        dataset: 'empty', hidden: ['empty'], ordered: false,
        starter: sql`CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER ...
);`,
        hints: [
          '外鍵放在全部參與的部門這一端：每個部門一定有主管，所以 `manager_id` 可以（也應該）宣告 `NOT NULL`。',
          '一對一和一對多的差別在於外鍵能不能重複：加上 `UNIQUE`，同一位員工就只能出現在一個部門的 `manager_id`。',
          '把三件事寫在同一個欄位上：`manager_id INTEGER NOT NULL UNIQUE REFERENCES employees(id)`；也可以寫成表層級的 `UNIQUE (manager_id)` 與 `FOREIGN KEY`。',
        ],
        solution: sql`CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER NOT NULL UNIQUE REFERENCES employees(id)
);`,
        alternatives: [
          sql`CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER NOT NULL REFERENCES employees
);
CREATE UNIQUE INDEX one_department_per_manager ON departments (manager_id);`,
          sql`CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER NOT NULL,
  UNIQUE (manager_id),
  FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE RESTRICT
);`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER NOT NULL REFERENCES employees(id)
);`, why: '少了 `UNIQUE`：同一位員工可以出現在好幾個部門的 `manager_id`，王小明同時當研發部和財務部的主管也會被接受。這張表表達的是一對多，不是一對一。' },
          { sql: sql`CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  managed_department_id INTEGER UNIQUE
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);`, why: '外鍵放錯了邊：放在 `employees`，大多數員工的 `managed_department_id` 都是 NULL，而且「每個部門一定有主管」完全表達不出來，部門可以沒有任何主管。外鍵應該放在全部參與的部門這一端，也就是題目指定的 `departments.manager_id`。' },
          { sql: sql`CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER UNIQUE REFERENCES employees(id)
);`, why: '`UNIQUE` 與外鍵都對，可見的檢查也都通過，但少了 `NOT NULL`：沒有主管的部門會被接受（而且 `UNIQUE` 允許很多列都是 NULL）。「每個部門恰好一位主管」的「恰好」就是 `NOT NULL`，隱藏的檢查會插入沒有主管的部門。' },
        ],
        probes: [
          { label: '新增三位員工', sql: sql`INSERT INTO employees (id, name) VALUES (1, '王小明'), (2, '李佳玲'), (3, '陳建志');` },
          { label: '研發部由王小明、業務部由李佳玲管理（應被接受）', sql: sql`INSERT INTO departments (id, name, manager_id) VALUES (10, '研發部', 1), (20, '業務部', 2);` },
          { label: '王小明再管理財務部（應被拒絕）', sql: sql`INSERT INTO departments (id, name, manager_id) VALUES (30, '財務部', 1);` },
          { label: '需求查詢：每個部門與主管', sql: sql`SELECT d.name AS department, e.name AS manager FROM departments d JOIN employees e ON e.id = d.manager_id ORDER BY d.id;` },
          { label: '沒有主管的部門', sql: sql`INSERT INTO departments (id, name, manager_id) VALUES (40, '法務部', NULL);`, hidden: true },
          { label: '主管不是員工', sql: sql`INSERT INTO departments (id, name, manager_id) VALUES (50, '行銷部', 9);`, hidden: true },
          { label: '陳建志管理客服部', sql: sql`INSERT INTO departments (id, name, manager_id) VALUES (60, '客服部', 3);`, hidden: true },
          { label: '部門總數', sql: sql`SELECT COUNT(*) FROM departments;`, hidden: true },
        ],
      },
    ],
  },
  er: {
    diagrams: [
      {
        id: 'er-publisher-book', title: 'ER 圖：出版社出版書',
        description: '兩個強實體各有自己的鍵。「出版」是一對多：每本書恰好一家出版社，一家出版社出版零或多本書。',
        model: {
          entities: [
            { id: 'publisher', name: '出版社', attributes: [{ name: '出版社編號', key: true }, { name: '名稱' }] },
            { id: 'book', name: '書', attributes: [{ name: 'ISBN', key: true }, { name: '書名' }, { name: '出版年' }] },
          ],
          relationships: [{ id: 'publishes', name: '出版', a: 'publisher', b: 'book', aToB: '0..N', bToA: '1..1' }],
        },
        at: { publisher: [0, 0], book: [1, 0] },
      },
      {
        id: 'er-author-book', title: 'ER 圖：作者撰寫書（多對多，關係上有屬性）',
        description: '每本書有一或多位作者，每位作者寫一或多本書。「順序」屬於「這本書與這位作者」的配對，畫在關係上。',
        model: {
          entities: [
            { id: 'author', name: '作者', attributes: [{ name: '作者編號', key: true }, { name: '姓名' }] },
            { id: 'book', name: '書', attributes: [{ name: 'ISBN', key: true }, { name: '書名' }] },
          ],
          relationships: [{ id: 'writes', name: '撰寫', a: 'author', b: 'book', aToB: '1..N', bToA: '1..N', attributes: [{ name: '順序' }] }],
        },
        at: { author: [0, 0], book: [1, 0] },
      },
      {
        id: 'er-book-copy', title: 'ER 圖：書擁有複本（弱實體）',
        description: '「複本」是弱實體（雙框），複本序號是部分鍵（PK*），只在同一本書裡唯一；「擁有」是識別關係（粗線）。每本書至少一本複本，每本複本恰好屬於一本書。',
        model: {
          entities: [
            { id: 'book', name: '書', attributes: [{ name: 'ISBN', key: true }, { name: '書名' }] },
            { id: 'copy', name: '複本', weak: true, attributes: [{ name: '複本序號', key: true }, { name: '狀態' }] },
          ],
          relationships: [{ id: 'owns', name: '擁有', a: 'book', b: 'copy', aToB: '1..N', bToA: '1..1', identifying: true }],
        },
        at: { book: [0, 0], copy: [1, 0] },
      },
      {
        id: 'er-reader-card', title: 'ER 圖：讀者的電話與借書證',
        description: '{電話} 是多值屬性：一位讀者可以留好幾支電話。「持有」是一對一：每張借書證恰好屬於一位讀者，每位讀者最多一張證。',
        model: {
          entities: [
            { id: 'reader', name: '讀者', attributes: [{ name: '讀者編號', key: true }, { name: '姓名' }, { name: '電話', multivalued: true }] },
            { id: 'card', name: '借書證', attributes: [{ name: '卡號', key: true }, { name: '發證日' }] },
          ],
          relationships: [{ id: 'holds', name: '持有', a: 'reader', b: 'card', aToB: '0..1', bToA: '1..1' }],
        },
        at: { reader: [0, 0], card: [1, 0] },
      },
      {
        id: 'er-library-loans', title: 'ER 圖：借閱成為實體',
        description: '借閱會重複發生（同一位讀者可以再借同一本複本），所以畫成有自己鍵的實體。每筆借閱恰好一位讀者、恰好一本複本；讀者與複本都可以有零或多筆借閱。',
        model: {
          entities: [
            { id: 'book', name: '書', attributes: [{ name: 'ISBN', key: true }, { name: '書名' }] },
            { id: 'copy', name: '複本', weak: true, attributes: [{ name: '複本序號', key: true }, { name: '狀態' }] },
            { id: 'reader', name: '讀者', attributes: [{ name: '讀者編號', key: true }, { name: '姓名' }] },
            { id: 'loan', name: '借閱', attributes: [{ name: '借閱編號', key: true }, { name: '借出日' }, { name: '歸還日' }] },
          ],
          relationships: [
            { id: 'owns', name: '擁有', a: 'book', b: 'copy', aToB: '1..N', bToA: '1..1', identifying: true },
            { id: 'lent', name: '出借', a: 'copy', b: 'loan', aToB: '0..N', bToA: '1..1' },
            { id: 'borrows', name: '辦理', a: 'reader', b: 'loan', aToB: '0..N', bToA: '1..1' },
          ],
        },
        at: { book: [0, 0], copy: [1, 0], reader: [0, 1], loan: [1, 1] },
      },
    ],
    exercises: [],
  },
};
