import type { LessonContent } from '../schema';

const sql = String.raw;

/** The accounts every SQL example and preset of DB14 starts from (empty database). */
const accounts = sql`CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  balance INTEGER NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts (id, owner, balance) VALUES
  (1, '小安', 1000),
  (2, '阿哲', 500),
  (3, '小美', 0);`;

/** The same, re-runnable in the playground (the presets start from the initial balances). */
const fresh = sql`DROP TABLE IF EXISTS accounts;
${accounts}`;

/** The exercise's starting tables (in the learner's own SQL, since the exercise runs on the empty database). */
const exerciseTables = sql`CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  balance INTEGER NOT NULL CHECK (balance >= 0)
);
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES accounts(id),
  to_id INTEGER NOT NULL REFERENCES accounts(id),
  amount INTEGER NOT NULL CHECK (amount > 0)
);
INSERT INTO accounts (id, owner, balance) VALUES
  (1, '小安', 1000),
  (2, '阿哲', 100),
  (3, '小美', 0);`;

/** DB14 Transactions and ACID. SQL + transaction-timeline lesson (Phase F.1c): SQL runs in tests/curriculum-sql.test.ts, timelines and exercises in tests/curriculum-db.test.ts. */
export const DB14: LessonContent = {
  lessonId: 'DB14',
  motivation: '一筆轉帳在資料庫裡至少是兩個 `UPDATE`：小安的帳戶減 300，阿哲的帳戶加 300。DB07 說過，一個敘述是全有或全無的；可是兩個敘述之間呢？程式在第一個 `UPDATE` 之後當掉、主機停電、第二個敘述違反了約束，錢就憑空少了 300 元，而且沒有人會發現。交易（transaction）把好幾個敘述包成一個單位：要嘛全部生效，要嘛全部不算，而且一旦回報「提交成功」，就算下一秒停電也不會消失。本課先在 SQL 練習場用 `BEGIN`、`COMMIT`、`ROLLBACK` 真正執行轉帳，看清楚沒有 `BEGIN` 的敘述為什麼「復原不了」，以及交易中途出錯時 SQLite 與 PostgreSQL 的不同反應；接著用轉帳把 ACID 四個字母各自對應到會出的錯；再用交易時間軸模擬器在任一步之後按下「當機」，看 write-ahead log 怎麼決定哪些修改留下、哪些消失；最後用 `SAVEPOINT` 只撤銷交易的後半段。學完之後，給你一條交易的時間軸和一個失敗或當機的時間點，你能說出資料會變成什麼。',
  sections: [
    {
      id: 'why-transactions', title: '為什麼需要交易：兩個 UPDATE 之間',
      blocks: [
        { type: 'p', text: '本課的帳戶表 `accounts` 有三個帳戶：小安 1000 元、阿哲 500 元、小美 0 元，餘額由 `CHECK (balance >= 0)` 保證不會是負數。小安轉 300 元給阿哲，寫成 SQL 是：' },
        { type: 'list', ordered: true, items: [
          '`UPDATE accounts SET balance = balance - 300 WHERE id = 1;`（小安扣款）',
          '`UPDATE accounts SET balance = balance + 300 WHERE id = 2;`（阿哲入帳）',
        ] },
        { type: 'p', text: '每個敘述各自都是正確的，問題出在兩者之間。下表是兩個敘述之間可能發生的事，以及沒有交易時的結果：' },
        { type: 'table', head: ['兩個敘述之間發生了', '沒有交易時的結果', '交易保證的結果'], rows: [
          ['程式在第 1 步之後出例外、被關掉', '小安少了 300，阿哲沒收到：錢消失了', '第 1 步也不算：兩人的餘額都不變'],
          ['第 2 步被拒絕（例如阿哲的帳戶已凍結，違反某個約束）', '同上，而且程式若沒處理錯誤，沒人知道', '程式下 `ROLLBACK`，整筆轉帳撤銷'],
          ['主機在第 1 步之後停電', '重開機後，小安的扣款可能已經寫進磁碟', '重開機後的復原程序撤銷第 1 步'],
          ['另一個連線剛好在兩步之間計算全行存款總額', '總額少了 300 元', '其他連線看不到做到一半的轉帳（隔離性）'],
          ['轉帳完成、回報成功，下一秒停電', '最後幾筆修改可能還在記憶體裡，隨著停電消失', '回報成功之前，修改已經寫入日誌：重開機後還在'],
        ] },
        { type: 'p', text: '交易（transaction）是資料庫工作的一個邏輯單位：一組讀寫，要嘛全部生效（提交，commit），要嘛全部不算（復原，rollback，也稱回滾）。前四列都靠「全部不算」解決，最後一列靠「提交了就不會消失」。這兩個承諾，加上約束與並行控制，就是第 4 節的 ACID。' },
        { type: 'callout', tone: 'note', title: '你其實一直在用交易', text: 'DB07 說一個 `INSERT` 的三列若有一列違反 `CHECK`，三列都不會新增：那是因為每個敘述本身就在一筆交易裡執行。沒有寫 `BEGIN` 時，SQLite 與 PostgreSQL 都處在自動提交（autocommit）模式：每個敘述自己就是一筆交易，執行成功就立刻提交。本課要做的，是把好幾個敘述放進同一筆交易。' },
      ],
    },
    {
      id: 'begin-commit-rollback', title: 'BEGIN、COMMIT、ROLLBACK 與自動提交',
      blocks: [
        { type: 'p', text: '`BEGIN;` 開始一筆交易，之後的敘述都屬於它；`COMMIT;` 提交，所有修改一起生效；`ROLLBACK;` 放棄，所有修改一起消失。下面的範例在空白資料庫建立帳戶表，然後在一筆交易裡完成轉帳：' },
        { type: 'example', id: 'sql-transfer-commit' },
        { type: 'p', text: '提交之後，小安 700、阿哲 800，三人的總額仍然是 1500。交易進行中也可以查詢：同一個連線看得到自己還沒提交的修改。下一個範例在兩個 `UPDATE` 之後先查一次，再 `ROLLBACK`：' },
        { type: 'example', id: 'sql-rollback' },
        { type: 'p', text: '在練習場執行這個範例，會看到兩個查詢結果：第一個在交易裡，是 700 和 800；第二個在 `ROLLBACK` 之後，回到 1000 和 500。範例方塊只顯示最後一個查詢。DB07 提醒過，`UPDATE` 忘了寫 `WHERE` 沒有「復原」可按；在交易裡，`ROLLBACK` 就是那個按鈕，前提是你還沒 `COMMIT`。' },
        { type: 'p', text: '`ROLLBACK` 只撤銷這筆交易的修改。`BEGIN` 之前的敘述是在自動提交模式下執行的，每一個執行完就已經提交，任何 `ROLLBACK` 都撤銷不了它：' },
        { type: 'example', id: 'sql-autocommit' },
        { type: 'p', text: '30 元手續費在 `BEGIN` 之前，已經自己提交，所以小安是 970 元；交易裡的 500 元轉帳被撤銷，小美仍是 0 元。如果沒有寫 `BEGIN` 就直接 `ROLLBACK`，SQLite 回報 `cannot rollback - no transaction is active`：沒有進行中的交易可以放棄，前面的修改都早已提交。' },
        { type: 'table', head: ['敘述', 'SQLite', '標準 SQL 與其他 DBMS'], rows: [
          ['開始交易', '`BEGIN;` 或 `BEGIN TRANSACTION;`；`START TRANSACTION` 是語法錯誤', '標準寫法是 `START TRANSACTION`；PostgreSQL、MySQL 兩種寫法都接受，SQL Server 用 `BEGIN TRANSACTION`'],
          ['提交', '`COMMIT;`，`END;` 是同義字', '`COMMIT;`（`COMMIT WORK` 也是標準寫法）'],
          ['放棄', '`ROLLBACK;`', '`ROLLBACK;`'],
          ['交易中再 `BEGIN`', '錯誤：`cannot start a transaction within a transaction`', 'PostgreSQL 只發出警告，交易照常進行'],
          ['沒有交易時 `COMMIT`', '錯誤：`cannot commit - no transaction is active`', 'PostgreSQL 只發出警告'],
        ] },
        { type: 'callout', tone: 'tip', title: '練習場是同一個連線', text: '練習場每次執行都用同一個資料庫連線，所以交易可以跨越好幾次執行：先執行 `BEGIN;` 和一個 `UPDATE`，看看結果，下一次再決定 `COMMIT;` 或 `ROLLBACK;`（預設查詢「交易還沒結束」就是這樣）。如果出現 `cannot start a transaction within a transaction`，表示前一次留下了沒結束的交易，先執行 `ROLLBACK;`。按「重設資料」會換一個全新的資料庫，進行中的交易也一起消失。' },
        { type: 'callout', tone: 'note', title: '程式語言的函式庫可能改變預設', text: '自動提交是資料庫這一端的預設，連線用的函式庫可以改變它。Java 的 JDBC 連線預設自動提交，要呼叫 `setAutoCommit(false)` 才會把好幾個敘述放進同一筆交易；Python 內建的 `sqlite3` 模組在預設設定下，會在 `INSERT`、`UPDATE`、`DELETE` 之前自動送出 `BEGIN`，所以忘了呼叫 `commit()`，連線關閉時修改就不見了。用任何函式庫之前，先查清楚它的預設是哪一種。' },
        { type: 'callout', tone: 'note', title: 'CREATE TABLE 也能復原嗎？', text: 'SQLite 與 PostgreSQL 的 DDL 也在交易裡：在練習場執行 `BEGIN; CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1); ROLLBACK;`，之後 `SELECT COUNT(*) FROM sqlite_schema WHERE name = \'t\';` 是 0，表和資料一起消失。MySQL 則不同：`CREATE TABLE`、`ALTER TABLE`、`DROP TABLE` 等敘述會先隱含提交目前的交易，無法和其他修改一起復原。' },
      ],
    },
    {
      id: 'errors', title: '交易中途出錯：SQLite 與 PostgreSQL 不一樣',
      blocks: [
        { type: 'p', text: '交易裡的一個敘述失敗了（違反 `CHECK`、外鍵、`UNIQUE`），會發生什麼？失敗的那個敘述一定完全沒有效果（敘述的原子性），差別在於交易本身：' },
        { type: 'table', head: ['', 'SQLite', 'PostgreSQL'], rows: [
          ['失敗的敘述', '沒有效果', '沒有效果'],
          ['交易', '仍然開著，前面成功的敘述也還在', '整筆交易被標成失敗'],
          ['之後的敘述', '照常執行', '一律被拒絕：`current transaction is aborted, commands ignored until end of transaction block`'],
          ['之後送出 `COMMIT`', '提交前面成功的敘述', '實際執行的是 `ROLLBACK`，什麼都沒有提交'],
        ] },
        { type: 'p', text: '在 SQLite 裡，決定權在程式：錯誤之後該 `ROLLBACK` 還是繼續，要程式自己判斷。下面的時間軸是本課的交易時間軸模擬器：按「下一步」逐步執行，「其他連線看到的」是已提交的值，「交易內的值」是這筆交易自己看到的值，另外還列出日誌（第 5 節說明）。模擬器在這裡依照 SQLite 的行為：被 `CHECK` 拒絕的敘述不改任何資料，交易仍開著。' },
        { type: 'example', id: 'tl-autocommit-reject' },
        { type: 'p', text: '第 1 步沒有 `BEGIN`，是一筆自動提交的交易（T1），立刻生效。第 4 步讓 A 變成 −150，被拒絕；這時 B 的 +600 還在交易內，程式在第 5 步 `ROLLBACK`，入帳一起撤銷。第 6 到 9 步是金額正確的第二次嘗試。注意交易編號：T1 是第 1 步的自動提交交易，被撤銷的是 T2，提交的是 T3。' },
        { type: 'p', text: '如果程式沒有檢查錯誤，照樣送出 `COMMIT` 呢？' },
        { type: 'example', id: 'tl-commit-after-error' },
        { type: 'p', text: 'B 的 +600 被提交了，A 的扣款卻從來沒有成功：兩人的總額從 700 變成 1300。資料庫沒有違反任何約束，每一列都合法，錯的是程式。在練習場也能重現：建立帳戶表後一次執行 `BEGIN; UPDATE accounts SET balance = balance + 2000 WHERE id = 2; UPDATE accounts SET balance = balance - 2000 WHERE id = 1; COMMIT;`，第三個敘述被 `CHECK` 拒絕，練習場在第一個錯誤就停下，`COMMIT` 根本沒有執行，交易還開著，阿哲的 +2000 也還在交易裡。這時再執行 `COMMIT;`，就提交了半筆轉帳；執行 `ROLLBACK;` 才是對的。' },
        { type: 'callout', tone: 'warning', title: '程式的固定寫法：出錯就 ROLLBACK', text: '應用程式裡的交易幾乎都長這樣：`BEGIN`；依序執行每個敘述；任何一個出錯就 `ROLLBACK` 並回報失敗；全部成功才 `COMMIT`。在 PostgreSQL 上漏了錯誤處理，最壞是整筆交易白做；在 SQLite 上，卻可能提交半筆轉帳。' },
        { type: 'callout', tone: 'note', title: 'SQLite 也有自動撤銷整筆交易的情況', text: '少數錯誤（例如磁碟已滿、記憶體不足）可能讓 SQLite 自動撤銷整筆交易。也可以在敘述裡指定衝突處理：`UPDATE OR ROLLBACK accounts SET …` 違反約束時，SQLite 會撤銷整筆交易，之後的 `COMMIT` 得到 `cannot commit - no transaction is active`。`OR ROLLBACK` 是 SQLite 特有的語法。' },
      ],
    },
    {
      id: 'acid', title: '用一筆轉帳說明 ACID',
      blocks: [
        { type: 'p', text: '交易的四個保證合稱 ACID。每一個都可以用「轉帳出了什麼錯」來理解，也各有負責的機制：' },
        { type: 'table', head: ['性質', '在轉帳裡的意思', '沒有它會看到', '靠什麼做到'], rows: [
          ['原子性（Atomicity）', '扣款與入帳要嘛都生效，要嘛都不算', '只扣款、沒入帳：錢消失', '`ROLLBACK`；當機後依日誌撤銷未提交的修改'],
          ['一致性（Consistency）', '交易前後都滿足所有規則：餘額不是負數，總額不變', '餘額變成負數，或總額憑空多出 600', '資料庫檢查宣告過的約束；沒有宣告的規則（總額不變）靠交易本身寫對'],
          ['隔離性（Isolation）', '同時進行的交易互不干擾，看不到別人做到一半的轉帳', '計算總額時剛好讀到扣了款、還沒入帳的狀態', '鎖或多版本（MVCC）等並行控制，程度由隔離等級決定'],
          ['持久性（Durability）', '回報「提交成功」之後，停電、當機都不會讓轉帳消失', '使用者看到成功，重開機後轉帳不見了', 'COMMIT 回報成功之前，先把日誌寫到磁碟'],
        ] },
        { type: 'p', text: '一致性和其他三個不太一樣。資料庫只能檢查你宣告過的約束：`CHECK (balance >= 0)` 擋得住負的餘額，但「轉帳前後總額不變」沒有寫成約束，第 3 節錯誤之後照樣 `COMMIT` 的程式就破壞了它，資料庫卻照單全收。所以一致性是資料庫與程式一起負責的：資料庫提供原子性、隔離性與約束，程式負責每筆交易本身把資料從一個正確的狀態帶到另一個正確的狀態。' },
        { type: 'p', text: '隔離性在練習場看不到，因為練習場只有一個連線。時間軸模擬器的「其他連線看到的（已提交）」就是隔離的效果：交易內的值在 `COMMIT` 之前，別的連線一律看不到。兩筆交易同時讀寫同一筆資料時可能出現哪些異常、各種隔離等級擋住哪些，是 DB15（隔離等級與並行控制）的主題；並行程式裡競爭條件的一般概念，則屬於 PL13 的並行模型。' },
        { type: 'callout', tone: 'note', title: 'SQLite 的隔離方式', text: 'SQLite 同一時間只允許一個寫入交易，另一個想寫入的連線必須等待，或得到 `SQLITE_BUSY` 錯誤。`BEGIN` 預設是 `BEGIN DEFERRED`：等到第一次讀寫才取得鎖；`BEGIN IMMEDIATE` 一開始就取得寫入權，避免交易做到一半才發現別的連線正在寫。在第 6 節的 WAL 模式下，讀取的連線與寫入的連線互不阻擋。' },
        { type: 'callout', tone: 'tip', title: '一起提交的不只是你寫的敘述', text: 'DB07 的外鍵動作（`ON DELETE CASCADE` 連帶刪除的子列），以及 DB13 介紹的觸發器所做的修改，都屬於觸發它們的那個敘述所在的交易：交易提交它們就留下，交易復原它們也一起消失。' },
      ],
    },
    {
      id: 'wal', title: 'write-ahead log：當機之後怎麼復原',
      blocks: [
        { type: 'p', text: 'DBMS 修改資料時，資料頁（儲存資料的固定大小區塊）先在記憶體裡改，什麼時候寫回磁碟上的資料檔，由 DBMS 決定。當機時，記憶體裡的東西全部消失，磁碟上的資料檔可能是新舊混雜的：有些已提交的修改還沒寫進去，有些未提交的修改反而已經寫進去了。決定「哪些算數」的，是另一個檔案：日誌（log）。' },
        { type: 'p', text: '每次修改，DBMS 都在日誌尾端追加一筆紀錄：哪一筆交易、改了哪一項、舊值、新值；交易開始、提交、放棄也各有一筆紀錄。write-ahead log（WAL，預寫式日誌）的「預寫」指兩條規則：' },
        { type: 'list', ordered: true, items: [
          '一筆修改的日誌紀錄，必須在它描述的資料頁寫入磁碟之前，先寫到磁碟。所以資料檔裡出現的任何修改，日誌裡都有它的舊值，必要時可以撤銷（原子性）。',
          '`COMMIT` 回報成功之前，這筆交易的所有日誌紀錄，包括 COMMIT 紀錄本身，都必須強制寫到磁碟（例如呼叫 `fsync`），不能只停在作業系統的快取裡。所以回報成功的交易，日誌裡一定有完整的紀錄，可以重做（持久性）。',
        ] },
        { type: 'p', text: '有了這兩條，資料頁本身什麼時候寫回都可以：提交時不必把散在各處的資料頁一一寫回磁碟，只要把日誌尾端循序寫出去，這比隨機寫入資料頁快得多。當機後的復原程序讀日誌：有 COMMIT 紀錄的交易，用新值重做（redo）；沒有 COMMIT 紀錄的交易，用舊值撤銷（undo）已經寫進資料檔的修改。' },
        { type: 'example', id: 'tl-transfer-crash' },
        { type: 'p', text: '先一路按到第 8 步，看日誌怎麼長出來，再按「重設」，分別在第 3、4、7 步之後按「當機」：' },
        { type: 'table', head: ['在這一步之後當機', '日誌裡的 COMMIT', '復原後', '原因'], rows: [
          ['第 3 步', '沒有', 'A = 1000，B = 500，C = 0', 'T1 的兩筆修改都在日誌裡，但沒有 COMMIT 紀錄：整筆捨棄'],
          ['第 4 步', 'T1', 'A = 700，B = 800，C = 0', 'COMMIT 紀錄已寫入，T1 重做；就算資料頁一頁都還沒寫回也一樣'],
          ['第 7 步', 'T1', 'A = 700，B = 800，C = 0', 'T2 只差 COMMIT，仍然整筆捨棄：差一步也是沒提交'],
          ['第 8 步', 'T1、T2', 'A = 700，B = 600，C = 200', '兩筆都已提交'],
        ] },
        { type: 'p', text: '判斷的關鍵只有一個：當機的那一刻，這筆交易的 COMMIT 紀錄在不在日誌裡。`COMMIT` 寫進日誌的那一瞬間，就是交易從「全部不算」變成「全部算數」的分界點。' },
        { type: 'callout', tone: 'warning', title: '模擬器是教學模型', text: '本課的模擬器只示範 WAL 的概念，不是任何一個產品的檔案格式：它把資料檔當成一開始的值，當機後只看日誌，依序重做有 COMMIT 紀錄的交易、捨棄其他交易，結果和「重做已提交、撤銷未提交」相同。真正的 DBMS 會定期做檢查點（checkpoint），把記憶體裡的資料頁寫回資料檔並在日誌留下記號，復原時從最近的檢查點開始，不必重放整份日誌；日誌紀錄的內容與格式也各家不同。' },
        { type: 'callout', tone: 'note', title: '為了速度而放寬持久性', text: '強制寫入磁碟很慢，所以有些系統允許放寬第 2 條規則。例如 PostgreSQL 的 `synchronous_commit = off`：`COMMIT` 不等日誌寫到磁碟就回報成功。當機時最後幾筆「已回報成功」的交易可能遺失，但資料庫仍然一致，就像那幾筆交易被乾淨地撤銷一樣，不會出現半筆轉帳。這是用持久性換速度，原子性不受影響。' },
      ],
    },
    {
      id: 'sqlite-journal', title: 'SQLite 的做法：rollback journal 與 WAL 模式',
      blocks: [
        { type: 'p', text: 'SQLite 有兩種主要的日誌方式，由 `PRAGMA journal_mode` 設定，以下說的都是 SQLite 的行為。兩者記錄的單位都是整個資料頁，而不是「哪一列改了什麼」。' },
        { type: 'table', head: ['', 'rollback journal（預設的 DELETE 模式）', 'WAL 模式（`PRAGMA journal_mode = WAL`）'], rows: [
          ['寫入時', '修改資料頁之前，先把它原本的內容複製到另一個檔案 `資料庫檔名-journal`，再直接改資料庫檔', '資料庫檔不動，修改過的資料頁追加到 `資料庫檔名-wal` 檔的尾端'],
          ['日誌裡存的是', '舊內容（用來撤銷）', '新內容（用來重做）'],
          ['提交的那一刻', '資料庫檔寫好後，刪除 journal 檔', '在 wal 檔寫入一筆帶有提交記號的頁'],
          ['當機後', '下次開啟時發現遺留的 journal 檔（hot journal），把舊內容寫回資料庫檔，撤銷未完成的交易', '只採用 wal 檔裡最後一個提交記號之前的頁，之後的忽略'],
          ['讀取', '讀資料庫檔', '先找 wal 檔裡最新的版本，找不到再讀資料庫檔'],
          ['之後', '沒有額外工作', '檢查點把 wal 檔的頁寫回資料庫檔（預設在 wal 檔累積約 1000 頁時自動執行）'],
        ] },
        { type: 'p', text: '兩種模式都達成原子性與持久性，只是方向相反：rollback journal 是先保存舊內容、再改資料檔的撤銷日誌；WAL 模式是資料檔先不動、把新內容寫在日誌裡的重做日誌，比較接近第 5 節的 write-ahead log。WAL 模式通常寫入較快，而且讀取與寫入互不阻擋；代價是多了 wal 檔與檢查點，所有連線也必須在同一台電腦上。持久性的強弱另外由 `PRAGMA synchronous` 決定：SQLite 文件說明，在 WAL 模式下設為 `NORMAL` 時，每次提交不再強制寫入磁碟，停電後最後提交的幾筆交易可能被撤銷，但資料庫不會損壞。' },
        { type: 'example', id: 'sql-journal-mode' },
        { type: 'p', text: '練習場執行的也是 SQLite，日誌模式是預設的 `delete`。不過它的資料庫放在這個頁面的記憶體裡（sql.js 的虛擬檔案系統），重新整理頁面就全部消失：在這裡可以觀察交易的原子性，持久性則無從談起。當機與復原請用時間軸模擬器觀察。' },
      ],
    },
    {
      id: 'savepoints', title: 'SAVEPOINT：只撤銷交易的後半段',
      blocks: [
        { type: 'p', text: '`ROLLBACK` 撤銷整筆交易。有時只想撤銷最後幾步，例如一批轉帳做到一半，發現最後一筆金額打錯：前面的轉帳都沒問題，不想重來。儲存點（savepoint）就是交易中途的記號：' },
        { type: 'table', head: ['敘述', '作用', '交易'], rows: [
          ['`SAVEPOINT s1;`', '在目前的位置做一個名為 `s1` 的記號', '繼續'],
          ['`ROLLBACK TO s1;`', '撤銷 `s1` 之後的所有修改；`s1` 之後建立的儲存點一併取消，`s1` 本身保留，可以再退回一次', '仍然開著'],
          ['`RELEASE s1;`', '移除 `s1`（以及它之後的儲存點），修改全部保留', '仍然開著：RELEASE 不是提交'],
          ['`COMMIT;` 或 `ROLLBACK;`', '結束整筆交易，所有儲存點跟著消失', '結束'],
        ] },
        { type: 'p', text: '下面的範例：小安轉 300 給阿哲之後做記號 `gift`；阿哲原本要轉 500 給小美，發現金額打錯，退回 `gift`，改轉 200，最後提交：' },
        { type: 'example', id: 'sql-savepoint' },
        { type: 'p', text: '`ROLLBACK TO gift` 撤銷了 500 元那兩步，但記號之前的 300 元轉帳還在；交易沒有結束，所以之後的 200 元轉帳和前面的修改一起提交：小安 700、阿哲 600、小美 200。同樣的過程在時間軸上看，還能在任一步之後當機：' },
        { type: 'example', id: 'tl-savepoint' },
        { type: 'p', text: '第 7 步的 `ROLLBACK TO` 在日誌裡追加兩筆反向的修改（C 從 500 改回 0、B 從 300 改回 800），所以日誌一路往後寫，從不刪掉前面的紀錄；真正的 DBMS 也會把撤銷動作記進日誌。試著在第 10 步（`RELEASE`）之後當機：A、B、C 全部回到 1000、500、0。儲存點只是交易內部的記號，交易沒有提交，記號前後的修改都一樣不算。' },
        { type: 'callout', tone: 'note', title: '儲存點與交易之外：SQLite 和 PostgreSQL 不同', text: '在 SQLite 裡，沒有 `BEGIN` 就執行 `SAVEPOINT`，會開始一筆新交易，`RELEASE` 這個最外層的儲存點時就提交它，所以 `SAVEPOINT` 加 `RELEASE` 可以代替 `BEGIN` 加 `COMMIT`。PostgreSQL 則規定 `SAVEPOINT` 只能在交易裡使用，否則是錯誤；本課的模擬器也把交易之外的 `SAVEPOINT` 當成錯誤。兩者的 `ROLLBACK TO` 都保留被退回的儲存點，`ROLLBACK TO` 一個不存在的名稱都是錯誤（SQLite：`no such savepoint`）。' },
        { type: 'callout', tone: 'tip', title: 'PostgreSQL 的錯誤處理靠儲存點', text: '第 3 節說，PostgreSQL 的交易一出錯就整筆失敗。如果某一步允許失敗（例如批次匯入時略過格式錯誤的那一列），做法是在那一步之前 `SAVEPOINT`，出錯時 `ROLLBACK TO` 那個儲存點：交易回到可以繼續的狀態，前面的修改保留。很多程式庫的「巢狀交易」就是用儲存點實作的。' },
      ],
    },
    {
      id: 'predict', title: '在時間軸上判斷資料會變成什麼',
      blocks: [
        { type: 'p', text: '給你一條時間軸和一個失敗或當機的時間點，依下面的步驟推算資料：' },
        { type: 'list', ordered: true, items: [
          '劃出每筆交易的範圍：`BEGIN` 到 `COMMIT` 或 `ROLLBACK`。範圍之外的每個修改敘述，各自是一筆自動提交的交易，執行完就已經提交。',
          '刪掉被拒絕的敘述（違反 `CHECK` 等約束）：它們沒有改任何資料。在 SQLite 裡交易仍開著，接著看程式送出的是 `ROLLBACK` 還是 `COMMIT`。',
          '處理儲存點：`ROLLBACK TO s` 刪掉同一筆交易裡 `s` 之後的修改；`RELEASE` 什麼都不刪，也什麼都不提交。',
          '找出時間點之前已經 `COMMIT` 的交易：只有它們的修改留下，依發生順序套用到初始值上。',
          '其他交易，不論是 `ROLLBACK`、做到一半當機、只差 `COMMIT`，還是已經 `RELEASE` 過儲存點，全部當成沒發生。',
        ] },
        { type: 'table', head: ['情況', '留下的修改'], rows: [
          ['自動提交的敘述，之後有人 `ROLLBACK`', '留下：它早就提交了'],
          ['交易裡被 `CHECK` 拒絕的敘述', '從來沒有生效'],
          ['錯誤之後程式照樣 `COMMIT`（SQLite）', '錯誤之前成功的敘述被提交'],
          ['錯誤之後程式照樣 `COMMIT`（PostgreSQL）', '什麼都沒留下：`COMMIT` 實際上是 `ROLLBACK`'],
          ['`ROLLBACK TO s` 之後再 `COMMIT`', '`s` 之前的修改與 `ROLLBACK TO` 之後的修改'],
          ['`COMMIT` 之前當機', '這筆交易的修改都不留下'],
          ['`COMMIT` 之後當機', '全部留下，就算資料頁還沒寫回資料檔'],
        ] },
        { type: 'callout', tone: 'tip', title: '先預測，再按當機', text: '在第 3、5、7 節的時間軸上，挑一個步驟，先在紙上算出復原後的值，再按「在第 k 步之後當機」對答案。下面的兩個練習也用同樣的模擬器計算答案。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-autocommit-rollback', prompt: '帳戶 1 有 1000 元、帳戶 2 有 500 元。在 SQLite 依序執行下面的敘述，最後的查詢得到什麼？',
      code: { language: 'SQL', text: 'UPDATE accounts SET balance = balance - 100 WHERE id = 1;\nBEGIN;\nUPDATE accounts SET balance = balance - 300 WHERE id = 1;\nUPDATE accounts SET balance = balance + 300 WHERE id = 2;\nROLLBACK;\nSELECT id, balance FROM accounts ORDER BY id;' },
      options: ['(1, 1000)、(2, 500)', '(1, 600)、(2, 800)', '(1, 900)、(2, 500)', '(1, 700)、(2, 800)'],
      answer: 2, explanation: '第一個 `UPDATE` 在 `BEGIN` 之前，是自動提交的獨立交易，執行完就提交了，`ROLLBACK` 撤銷不了它；`ROLLBACK` 只撤銷 `BEGIN` 之後的兩個 `UPDATE`。所以帳戶 1 是 900、帳戶 2 是 500。(1, 1000) 是以為 `ROLLBACK` 連 `BEGIN` 之前的修改也撤銷；(1, 600)、(2, 800) 是忽略了 `ROLLBACK`；(1, 700)、(2, 800) 則是把兩者都弄反：撤銷了已提交的手續費，卻保留了被放棄的轉帳。',
    },
    {
      id: 'q-error-then-commit', prompt: '`accounts` 有 `CHECK (balance >= 0)`，帳戶 1 有 1000 元、帳戶 2 有 500 元。在練習場一次執行下面四個敘述，第三個敘述被 `CHECK` 拒絕。接著再單獨執行一次 `COMMIT;`，兩個帳戶的餘額是多少？',
      code: { language: 'SQL', text: 'BEGIN;\nUPDATE accounts SET balance = balance + 2000 WHERE id = 2;\nUPDATE accounts SET balance = balance - 2000 WHERE id = 1;\nCOMMIT;' },
      options: [
        '帳戶 1 是 1000、帳戶 2 是 500：出錯時整筆交易已經自動撤銷',
        '帳戶 1 是 1000、帳戶 2 是 2500',
        '帳戶 1 是 −1000、帳戶 2 是 2500',
        '第二次的 `COMMIT` 被拒絕：沒有進行中的交易，餘額是 1000 與 500',
      ],
      answer: 1, explanation: '練習場遇到第一個錯誤就停下，所以第一次的 `COMMIT` 根本沒有執行。在 SQLite 裡，被 `CHECK` 拒絕的只有那一個敘述，交易仍然開著，帳戶 2 的 +2000 還在交易裡；第二次的 `COMMIT` 就把它提交了：帳戶 2 變成 2500，帳戶 1 不變，總額多出 2000 元。「整筆自動撤銷」是 PostgreSQL 的想法（在 PostgreSQL，這個 `COMMIT` 實際上會 `ROLLBACK`），不是 SQLite。−1000 不可能：被拒絕的敘述完全沒有效果。「沒有進行中的交易」要在交易已經被 `COMMIT` 或 `ROLLBACK` 結束之後才會發生。',
    },
    {
      id: 'q-recovery-log', prompt: '一開始 A = 1000、B = 500、C = 0。當機時，日誌裡依序有：`BEGIN T1`；T1 A：1000 → 700；T1 B：500 → 800；`COMMIT T1`；`BEGIN T2`；T2 B：800 → 600；T2 C：0 → 200。另外，當機前資料檔裡已經寫入了 B = 600 的資料頁，A = 700 的資料頁卻還沒寫入。復原之後是什麼？',
      options: [
        'A = 700，B = 800，C = 0',
        'A = 1000，B = 600，C = 0',
        'A = 700，B = 600，C = 200',
        'A = 1000，B = 500，C = 0',
      ],
      answer: 0, explanation: '日誌決定一切：T1 有 COMMIT 紀錄，用新值重做，A = 700 雖然還沒寫進資料檔也會補上；T2 沒有 COMMIT 紀錄，用日誌裡的舊值把已經寫進資料檔的 B = 600 撤銷回 800，C 維持 0。「A = 1000，B = 600」是相信了當機時的資料檔；「A = 700，B = 600，C = 200」把沒提交的 T2 也重做了；「全部回到初始值」則忘了 T1 已經提交，持久性保證它不會消失。',
    },
    {
      id: 'q-async-commit', prompt: '為了加快速度，資料庫被設定成 `COMMIT` 不等日誌寫到磁碟就回報成功（例如 PostgreSQL 的 `synchronous_commit = off`）。突然停電再重開機後，最可能出現什麼情況？',
      options: [
        '可能出現只扣款、沒入帳的半筆轉帳',
        '沒有影響：COMMIT 回報成功就代表資料已經寫進資料檔',
        '`CHECK` 約束失效，餘額可能變成負數',
        '最後幾筆已回報成功的交易可能不見，但不會出現只做一半的轉帳',
      ],
      answer: 3, explanation: '放寬的是第 2 條規則（COMMIT 前強制寫入日誌），受影響的是持久性：還沒寫到磁碟的 COMMIT 紀錄隨著停電消失，那幾筆交易在復原時被當成沒提交、整筆捨棄。原子性仍由日誌保證，所以不會有半筆轉帳。「回報成功就已寫進資料檔」把回報成功和寫入磁碟混為一談，即使正常設定，資料頁也常常在提交之後才寫回。約束是每個敘述執行時就檢查的，和日誌寫入的時機無關。',
    },
    {
      id: 'q-savepoint', prompt: '帳戶 1、2、3 分別有 1000、500、0 元。在 SQLite 執行下面的敘述，最後的查詢得到什麼？',
      code: { language: 'SQL', text: 'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nSAVEPOINT a;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nSAVEPOINT b;\nUPDATE accounts SET balance = balance + 100 WHERE id = 3;\nROLLBACK TO a;\nUPDATE accounts SET balance = balance + 100 WHERE id = 3;\nCOMMIT;\nSELECT id, balance FROM accounts ORDER BY id;' },
      options: [
        '(1, 900)、(2, 600)、(3, 100)',
        '(1, 1000)、(2, 500)、(3, 100)',
        '(1, 900)、(2, 500)、(3, 100)',
        '(1, 900)、(2, 600)、(3, 200)',
      ],
      answer: 2, explanation: '`ROLLBACK TO a` 撤銷 `a` 之後的所有修改：帳戶 2 的 +100 與帳戶 3 的 +100 都撤銷，儲存點 `b` 也一起取消；`a` 之前帳戶 1 的 −100 保留，交易仍開著，之後帳戶 3 的 +100 和它一起提交。(2, 600) 是只退回到最近的儲存點 `b`；(1, 1000) 是把 `ROLLBACK TO` 當成撤銷整筆交易；(3, 200) 是完全忽略了 `ROLLBACK TO`。',
    },
    {
      id: 'q-pg-vs-sqlite', prompt: '帳戶 2 有 500 元、帳戶 3 有 0 元，`CHECK (balance >= 0)`。一支程式逐一送出下面每個敘述，遇到錯誤也照樣送出下一個。第三個敘述違反 `CHECK`。分別在 SQLite 與 PostgreSQL 上執行，結束後帳戶 2、3 的餘額會變嗎？',
      code: { language: 'SQL', text: 'BEGIN;\nUPDATE accounts SET balance = balance + 300 WHERE id = 2;\nUPDATE accounts SET balance = balance - 9999 WHERE id = 3;\nUPDATE accounts SET balance = balance + 50 WHERE id = 3;\nCOMMIT;' },
      options: [
        '兩者都不變：交易裡有敘述失敗，整筆交易都不算',
        'SQLite：帳戶 2 是 800、帳戶 3 是 50；PostgreSQL：都不變',
        '兩者都是帳戶 2 為 800、帳戶 3 為 50',
        'SQLite：都不變；PostgreSQL：帳戶 2 是 800、帳戶 3 是 50',
      ],
      answer: 1, explanation: 'SQLite 只讓失敗的那個敘述沒有效果，交易仍開著，第四個敘述照常執行，`COMMIT` 把 +300 與 +50 一起提交。PostgreSQL 在錯誤之後把整筆交易標成失敗：第四個敘述被拒絕（`current transaction is aborted`），`COMMIT` 實際執行的是 `ROLLBACK`，兩個帳戶都不變。「兩者都不變」與「兩者相同」都忽略了兩個系統的差異；最後一個選項則把兩者的行為對調了。',
    },
    {
      id: 'q-wal-rule', prompt: 'write-ahead log 的第一條規則是：修改的日誌紀錄必須比它描述的資料頁先寫到磁碟。如果某個系統違反這條規則，先把資料頁寫回資料檔、稍後才寫日誌，在兩者之間當機，會出現什麼問題？',
      options: [
        '資料檔裡可能留下一筆未提交交易的修改，日誌裡卻沒有它的舊值，復原程序無法把它撤銷',
        '已經回報成功的交易可能在重開機後不見',
        '沒有問題：復原時重做日誌裡的修改就好',
        '日誌會被重複套用兩次，餘額加倍',
      ],
      answer: 0, explanation: '第一條規則保護的是原子性：資料檔裡出現的任何修改，日誌裡都要有舊值，未提交的交易才撤銷得掉。違反它時，那筆修改的紀錄還不在日誌裡，復原程序根本不知道要撤銷它。「已提交的交易不見」是違反第二條規則（COMMIT 前強制寫入日誌）的後果。「重做就好」只處理了已提交的交易，未提交的修改仍然留在資料檔。日誌紀錄存的是新值，重做是把資料設成新值，不是再加一次，所以不會加倍。',
    },
  ],
  sql: {
    dataset: 'empty',
    presets: [
      { label: '建立帳戶表（回到初始餘額）', sql: sql`${fresh}
SELECT id, owner, balance FROM accounts ORDER BY id;` },
      { label: '轉帳：BEGIN … COMMIT', sql: sql`${fresh}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
COMMIT;
SELECT id, owner, balance FROM accounts ORDER BY id;` },
      { label: '改變主意：ROLLBACK', sql: sql`${fresh}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
SELECT id, owner, balance FROM accounts ORDER BY id;
ROLLBACK;
SELECT id, owner, balance FROM accounts ORDER BY id;` },
      { label: '交易還沒結束：下一次再 COMMIT 或 ROLLBACK', sql: sql`${fresh}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
SELECT id, owner, balance FROM accounts ORDER BY id;
-- 交易還開著：接著自己執行 COMMIT; 或 ROLLBACK;
-- 也可以先試 UPDATE accounts SET balance = balance - 5000 WHERE id = 1;` },
      { label: '儲存點：SAVEPOINT 與 ROLLBACK TO', sql: sql`${fresh}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
SAVEPOINT gift;
UPDATE accounts SET balance = balance - 500 WHERE id = 2;
UPDATE accounts SET balance = balance + 500 WHERE id = 3;
ROLLBACK TO gift;
COMMIT;
SELECT id, owner, balance FROM accounts ORDER BY id;` },
      { label: '日誌設定：journal_mode 與 synchronous', sql: sql`PRAGMA journal_mode;
PRAGMA synchronous;` },
    ],
    examples: [
      {
        id: 'sql-transfer-commit', title: '轉帳：BEGIN … COMMIT', dataset: 'empty',
        description: '空白資料庫。建立三個帳戶，在一筆交易裡從小安轉 300 元給阿哲，提交後查詢；`total` 是三人的總額。',
        sql: sql`${accounts}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
COMMIT;
SELECT id, owner, balance, (SELECT SUM(balance) FROM accounts) AS total
FROM accounts
ORDER BY id;`,
        result: { columns: ['id', 'owner', 'balance', 'total'], rows: [
          [1, '小安', 700, 1500],
          [2, '阿哲', 800, 1500],
          [3, '小美', 0, 1500],
        ] },
      },
      {
        id: 'sql-rollback', title: 'ROLLBACK：交易裡看得到，放棄後全部消失', dataset: 'empty',
        description: '空白資料庫。交易裡的查詢看到 700 與 800；`ROLLBACK` 之後，最後的查詢回到初始餘額。',
        sql: sql`${accounts}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
SELECT id, balance FROM accounts ORDER BY id;
ROLLBACK;
SELECT id, balance FROM accounts ORDER BY id;`,
        result: { columns: ['id', 'balance'], rows: [[1, 1000], [2, 500], [3, 0]] },
      },
      {
        id: 'sql-autocommit', title: '自動提交的敘述撤銷不了', dataset: 'empty',
        description: '空白資料庫。30 元手續費在 `BEGIN` 之前，自己就是一筆已提交的交易；`ROLLBACK` 只撤銷交易裡的 500 元轉帳。',
        sql: sql`${accounts}
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 3;
ROLLBACK;
SELECT id, owner, balance FROM accounts ORDER BY id;`,
        result: { columns: ['id', 'owner', 'balance'], rows: [
          [1, '小安', 970],
          [2, '阿哲', 500],
          [3, '小美', 0],
        ] },
      },
      {
        id: 'sql-journal-mode', title: '查看 SQLite 的日誌模式', dataset: 'empty',
        description: '`PRAGMA journal_mode` 是 SQLite 的設定，回傳目前的日誌模式；練習場的資料庫用預設的 rollback journal（DELETE 模式）。',
        sql: sql`PRAGMA journal_mode;`,
        result: { columns: ['journal_mode'], rows: [['delete']] },
      },
      {
        id: 'sql-savepoint', title: 'SAVEPOINT 與 ROLLBACK TO：只撤銷打錯的那一段', dataset: 'empty',
        description: '空白資料庫。300 元轉帳之後做記號 `gift`；500 元轉帳打錯了，退回記號後改轉 200 元，再一起提交。',
        sql: sql`${accounts}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
SAVEPOINT gift;
UPDATE accounts SET balance = balance - 500 WHERE id = 2;
UPDATE accounts SET balance = balance + 500 WHERE id = 3;
ROLLBACK TO gift;
UPDATE accounts SET balance = balance - 200 WHERE id = 2;
UPDATE accounts SET balance = balance + 200 WHERE id = 3;
RELEASE gift;
COMMIT;
SELECT id, owner, balance FROM accounts ORDER BY id;`,
        result: { columns: ['id', 'owner', 'balance'], rows: [
          [1, '小安', 700],
          [2, '阿哲', 600],
          [3, '小美', 200],
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-transfer-sql', title: '在一筆交易裡完成兩筆轉帳',
        statement: '空白資料庫。起始程式已經建立帳戶表 `accounts`（`id`、`owner`、`balance`，餘額不能是負數）與轉帳紀錄表 `transfers`（`id`、`from_id`、`to_id`、`amount`），並新增三個帳戶：1 號小安 1000 元、2 號阿哲 100 元、3 號小美 0 元。請在起始程式後面，用一筆交易依序完成：一、小安轉 300 元給阿哲；二、阿哲轉 350 元給小美。每筆轉帳都要更新兩個帳戶的 `balance`，並在 `transfers` 新增一列紀錄（`from_id`、`to_id`、`amount`），最後提交。檢查時會在你的 SQL 之後開始另一筆交易、列出餘額與轉帳紀錄、再放棄這筆檢查用的交易；還有隱藏的檢查。',
        dataset: 'empty', hidden: ['empty'], ordered: false,
        // F.1d: crash consistency — two autocommit transfers end in the same state but can stop half way.
        atomic: { probe: 'SELECT id, balance FROM accounts ORDER BY id' },
        starter: sql`${exerciseTables}
-- 在這裡寫你的交易
`,
        hints: [
          '骨架是 `BEGIN;`、四個 `UPDATE` 與兩個 `INSERT INTO transfers (from_id, to_id, amount) VALUES (…);`、`COMMIT;`。轉出是 `balance = balance - 金額`，轉入是 `balance = balance + 金額`。',
          '阿哲一開始只有 100 元，要先收到小安的 300 元才轉得出 350 元；順序反了，`CHECK (balance >= 0)` 會拒絕阿哲的扣款。',
          '練習場遇到錯誤就停下，錯誤之後的 `COMMIT` 不會執行，交易會一直開著。檢查第一個敘述就是 `BEGIN;`：你的交易沒有結束，它就會被拒絕。',
        ],
        solution: sql`${exerciseTables}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);
COMMIT;`,
        alternatives: [
          sql`${exerciseTables}
BEGIN TRANSACTION;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300), (2, 3, 350);
END TRANSACTION;`,
          sql`${exerciseTables}
SAVEPOINT payday;
UPDATE accounts
SET balance = balance + CASE id WHEN 1 THEN -300 WHEN 2 THEN 300 - 350 WHEN 3 THEN 350 END
WHERE id IN (1, 2, 3);
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);
RELEASE payday;`,
        ],
        mistakes: [
          { sql: sql`${exerciseTables}
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);`, why: '沒有 `BEGIN`／`COMMIT`：每個敘述自動提交，正常執行時最後的餘額一模一樣，但當機測試會抓到：如果在第一筆扣款之後就當機，小安已經少了 300 元、阿哲卻沒有收到，這正是交易要防止的半筆轉帳。' },
          { sql: sql`${exerciseTables}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);`, why: '少了 `COMMIT`：在同一個連線裡查，餘額看起來都對，但交易還開著。檢查的 `BEGIN;` 因此被拒絕（`cannot start a transaction within a transaction`）；連線一斷，這些修改全部消失，其他連線也從來沒看到過。' },
          { sql: sql`${exerciseTables}
BEGIN;
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);
ROLLBACK;`, why: '結尾寫成 `ROLLBACK`：交易裡的修改全部撤銷，餘額回到 1000、100、0，`transfers` 也是空的。`ROLLBACK` 是放棄，`COMMIT` 才是提交。' },
          { sql: sql`${exerciseTables}
BEGIN;
UPDATE accounts SET balance = balance - 350 WHERE id = 2;
UPDATE accounts SET balance = balance + 350 WHERE id = 3;
INSERT INTO transfers (from_id, to_id, amount) VALUES (2, 3, 350);
UPDATE accounts SET balance = balance - 300 WHERE id = 1;
UPDATE accounts SET balance = balance + 300 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 300);
COMMIT;`, why: '先做阿哲轉給小美：阿哲只有 100 元，扣 350 會變成 −250，被 `CHECK` 拒絕。練習場在這個錯誤停下，後面的 `COMMIT` 沒有執行，交易還開著；要先 `ROLLBACK`，再依正確的順序重做。' },
        ],
        probes: [
          { label: '開始另一筆交易（只有你的交易已經結束才可以）', sql: sql`BEGIN;` },
          { label: '列出餘額', sql: sql`SELECT id, owner, balance FROM accounts ORDER BY id;` },
          { label: '列出轉帳紀錄', sql: sql`SELECT from_id, to_id, amount FROM transfers ORDER BY id;` },
          { label: '放棄檢查用的交易', sql: sql`ROLLBACK;` },
          { label: '放棄之後的餘額', sql: sql`SELECT id, owner, balance FROM accounts ORDER BY id;`, hidden: true },
          { label: '總額', sql: sql`SELECT SUM(balance) FROM accounts;`, hidden: true },
          { label: '轉帳筆數', sql: sql`SELECT COUNT(*) FROM transfers;`, hidden: true },
          { label: '餘額不足的扣款', sql: sql`UPDATE accounts SET balance = balance - 100 WHERE id = 2;`, hidden: true },
        ],
      },
    ],
  },
  transactions: {
    timelines: [
      {
        id: 'tl-autocommit-reject', title: '自動提交與被拒絕的扣款',
        description: '一開始 A = 500、B = 200，餘額不能低於 0。第 1 步沒有 `BEGIN`，自己就是一筆交易；第 4 步因為餘額不足被拒絕，程式在第 5 步 `ROLLBACK`，第 6 到 9 步用正確的金額重做。',
        script: { items: { A: 500, B: 200 }, min: 0, steps: [
          { op: 'update', item: 'A', delta: -50, note: '手續費' },
          { op: 'begin' },
          { op: 'update', item: 'B', delta: 600, note: '先入帳' },
          { op: 'update', item: 'A', delta: -600, note: '扣款' },
          { op: 'rollback' },
          { op: 'begin' },
          { op: 'update', item: 'A', delta: -400 },
          { op: 'update', item: 'B', delta: 400 },
          { op: 'commit' },
        ] },
      },
      {
        id: 'tl-commit-after-error', title: '錯誤之後照樣 COMMIT：提交了半筆轉帳',
        description: '和上一條時間軸相同的轉帳，但程式沒有檢查第 3 步的錯誤，直接送出 `COMMIT`。模擬器依照 SQLite 的行為：交易仍開著，`COMMIT` 提交了成功的那一半。',
        script: { items: { A: 500, B: 200 }, min: 0, steps: [
          { op: 'begin' },
          { op: 'update', item: 'B', delta: 600, note: '先入帳' },
          { op: 'update', item: 'A', delta: -600, note: '扣款' },
          { op: 'commit' },
        ] },
      },
      {
        id: 'tl-transfer-crash', title: '兩筆轉帳與當機',
        description: 'A、B、C 是小安、阿哲、小美的帳戶。T1：A 轉 300 給 B；T2：B 轉 200 給 C。在任一步之後按「當機」，看復原程序依日誌保留什麼。',
        script: { items: { A: 1000, B: 500, C: 0 }, min: 0, steps: [
          { op: 'begin' },
          { op: 'update', item: 'A', delta: -300 },
          { op: 'update', item: 'B', delta: 300 },
          { op: 'commit' },
          { op: 'begin' },
          { op: 'update', item: 'B', delta: -200 },
          { op: 'update', item: 'C', delta: 200 },
          { op: 'commit' },
        ] },
      },
      {
        id: 'tl-savepoint', title: '儲存點與當機',
        description: 'A 是小安、B 是阿哲、C 是小美，和上面的 SQL 範例相同：第 6 步的 500 元打錯了，第 7 步退回儲存點 `s1`，再改轉 200 元。注意第 10 步的 `RELEASE` 之後當機會怎樣。',
        script: { items: { A: 1000, B: 500, C: 0 }, min: 0, steps: [
          { op: 'begin' },
          { op: 'update', item: 'A', delta: -300 },
          { op: 'update', item: 'B', delta: 300 },
          { op: 'savepoint', name: 's1' },
          { op: 'update', item: 'B', delta: -500 },
          { op: 'update', item: 'C', delta: 500, note: '金額打錯' },
          { op: 'rollback-to', name: 's1' },
          { op: 'update', item: 'B', delta: -200 },
          { op: 'update', item: 'C', delta: 200 },
          { op: 'release', name: 's1' },
          { op: 'commit' },
        ] },
      },
    ],
    schedules: [],
    exercises: [
      {
        id: 'ex-crash-autocommit', title: '當機之後：自動提交、被拒絕的敘述與沒提交的交易',
        task: 'recovery', crashAfter: 9,
        script: { items: { A: 800, B: 300, C: 100 }, min: 0, steps: [
          { op: 'update', item: 'A', delta: -50, note: '手續費' },
          { op: 'begin' },
          { op: 'update', item: 'A', delta: -200 },
          { op: 'update', item: 'B', delta: 200 },
          { op: 'commit' },
          { op: 'begin' },
          { op: 'update', item: 'B', delta: -600 },
          { op: 'update', item: 'B', delta: -300 },
          { op: 'update', item: 'C', delta: 300 },
          { op: 'commit' },
        ] },
        statement: '一開始 A = 800、B = 300、C = 100，餘額不能低於 0（`CHECK`）。時間軸：1. A −50（手續費，沒有 `BEGIN`）；2. `BEGIN`；3. A −200；4. B +200；5. `COMMIT`；6. `BEGIN`；7. B −600；8. B −300；9. C +300；10. `COMMIT`。系統在第 9 步之後、第 10 步之前當機。復原之後，A、B、C 各是多少？',
        hints: [
          '先劃出交易：第 1 步自己是一筆自動提交的交易；第 2 到 5 步是一筆；第 6 步開始的是另一筆。',
          '第 7 步執行時 B 是多少？扣 600 之後會不會低於 0？被拒絕的敘述沒有改任何資料。',
          '當機時日誌裡有哪些交易的 COMMIT 紀錄？只有它們的修改會留下。',
        ],
        explanation: '第 1 步是自動提交的交易，A 變成 750，已經提交。第 2 到 5 步的交易提交了：A 550、B 500。第 6 步開始的交易裡，第 7 步讓 B 變成 −100，被 `CHECK` 拒絕、沒有效果；第 8、9 步成功，但第 10 步的 `COMMIT` 還沒執行就當機了，日誌裡沒有它的 COMMIT 紀錄，整筆捨棄。答案：A = 550、B = 500、C = 100。',
        mistakes: [
          { answer: { A: 600, B: 500, C: 100 }, why: '把第 1 步的手續費也撤銷了：它在 `BEGIN` 之外，是自動提交的獨立交易，執行完就提交了，當機也不會消失。' },
          { answer: { A: 550, B: 200, C: 400 }, why: '保留了最後一筆交易的修改：第 8、9 步雖然成功，但交易沒有 `COMMIT`，當機後一律捨棄。' },
          { answer: { A: 800, B: 300, C: 100 }, why: '把所有修改都當成消失了：第 1 步與第 2 到 5 步的交易都已經提交，日誌裡有它們的 COMMIT 紀錄，復原時會重做。' },
        ],
      },
      {
        id: 'ex-crash-savepoint', title: '當機之後：儲存點、ROLLBACK TO 與 RELEASE',
        task: 'recovery', crashAfter: 17,
        script: { items: { A: 900, B: 100, C: 50 }, min: 0, steps: [
          { op: 'begin' },
          { op: 'update', item: 'A', delta: -200 },
          { op: 'update', item: 'B', delta: 200 },
          { op: 'savepoint', name: 's1' },
          { op: 'update', item: 'B', delta: -250 },
          { op: 'update', item: 'C', delta: 250 },
          { op: 'savepoint', name: 's2' },
          { op: 'update', item: 'A', delta: -100 },
          { op: 'rollback-to', name: 's1' },
          { op: 'update', item: 'C', delta: 100 },
          { op: 'update', item: 'A', delta: -100 },
          { op: 'commit' },
          { op: 'begin' },
          { op: 'update', item: 'C', delta: -50 },
          { op: 'savepoint', name: 's3' },
          { op: 'update', item: 'B', delta: 50 },
          { op: 'release', name: 's3' },
          { op: 'commit' },
        ] },
        statement: '一開始 A = 900、B = 100、C = 50，餘額不能低於 0。時間軸：1. `BEGIN`；2. A −200；3. B +200；4. `SAVEPOINT s1`；5. B −250；6. C +250；7. `SAVEPOINT s2`；8. A −100；9. `ROLLBACK TO s1`；10. C +100；11. A −100；12. `COMMIT`；13. `BEGIN`；14. C −50；15. `SAVEPOINT s3`；16. B +50；17. `RELEASE s3`；18. `COMMIT`。系統在第 17 步之後、第 18 步之前當機。復原之後，A、B、C 各是多少？',
        hints: [
          '`ROLLBACK TO s1` 撤銷的是 `s1` 之後的所有修改，不只是最近一個儲存點 `s2` 之後的；`s1` 之前的修改保留，交易仍開著。',
          '`RELEASE` 只是移除儲存點，修改還在交易裡，並沒有提交。',
          '當機時，哪幾筆交易的 COMMIT 紀錄已經在日誌裡？',
        ],
        explanation: '第一筆交易：第 2、3 步之後 A 700、B 300；第 9 步的 `ROLLBACK TO s1` 撤銷第 5、6、8 步（`s2` 也一併取消）；再加上第 10、11 步，提交時 A = 600、B = 300、C = 150。第二筆交易在第 17 步 `RELEASE s3` 之後當機，`RELEASE` 不是提交，日誌裡沒有它的 COMMIT 紀錄，第 14、16 步都捨棄。答案：A = 600、B = 300、C = 150。',
        mistakes: [
          { answer: { A: 600, B: 50, C: 400 }, why: '只撤銷到最近的儲存點 `s2`（只撤銷了第 8 步）：`ROLLBACK TO s1` 回到的是 `s1`，第 5、6 步的修改也一起撤銷，`s2` 跟著取消。' },
          { answer: { A: 800, B: 100, C: 150 }, why: '把 `ROLLBACK TO s1` 當成撤銷整筆交易：`s1` 之前的第 2、3 步不受影響，交易也沒有結束，它們和第 10、11 步一起在第 12 步提交。' },
          { answer: { A: 600, B: 350, C: 100 }, why: '把 `RELEASE s3` 當成提交：`RELEASE` 只移除儲存點，第二筆交易直到當機都沒有 `COMMIT`，第 14、16 步全部捨棄。' },
        ],
      },
    ],
  },
};
