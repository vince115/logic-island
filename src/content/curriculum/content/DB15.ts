import type { LessonContent } from '../schema';

const sql = String.raw;

/** The `stock` table the SQL examples and presets create first (on the shop dataset); every one can be run again. */
const stockTable = sql`DROP TABLE IF EXISTS stock;
CREATE TABLE stock (
  product_id INTEGER PRIMARY KEY REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO stock (product_id, qty) VALUES (1, 8), (2, 15), (3, 5), (4, 0), (5, 12);
`;

/**
 * DB15 隔離等級與並行控制. SQL lesson with the transaction-timeline activity (Phase F.1c): SQL runs in
 * tests/curriculum-sql.test.ts; schedules and exercise answers are computed by src/lib/txn (tests/curriculum-db.test.ts).
 */
export const DB15: LessonContent = {
  lessonId: 'DB15',
  motivation: 'DB14 把一筆轉帳包成交易，保證它要嘛全部完成、要嘛完全沒發生。可是真正的系統同時有很多連線：兩位店員同時賣出最後幾件庫存，報表正在加總時有人新增訂單，一筆提款還沒提交、另一個查詢就讀到了它的中間值。每一筆交易單獨看都正確，交錯在一起卻可能出錯：庫存少扣、報表前後兜不攏、讀到後來被撤銷的資料。ACID 裡的 I（隔離性）處理的就是這件事，資料庫提供的工具是隔離等級：等級越高，擋住的異常越多，代價是更多等待、死結或被中止後重試。本課用時間軸模擬器把兩筆（或三筆）交易逐步交錯，親手重現髒讀、不可重複讀、幻讀與遺失更新；切換鎖（兩階段鎖）與 MVCC 快照兩種並行控制和不同的隔離等級，看每一步誰在等、誰被中止、最後留下什麼值。最後用 `SELECT … FOR UPDATE`、原子更新與樂觀鎖修好應用程式最常寫出的並發錯誤：先讀再寫造成的遺失更新。學完後，你能看著一條交錯的時間軸說出會發生哪種異常，並選出夠用而不過度的隔離等級。',
  sections: [
    {
      id: 'interleaving', title: '並行交易與排程：怎麼讀時間軸',
      blocks: [
        { type: 'p', text: '資料庫同時服務很多連線。為了不讓大家排隊，它會讓多筆交易的步驟交錯執行；交錯之後實際的執行順序稱為排程（schedule）。把交易一筆接一筆完整執行的排程稱為序列排程，它一定不會互相干擾。一個交錯的排程，如果結果和某一個序列排程相同，就稱為可序列化（serializable）：這是隔離性的黃金標準。問題是，並不是每一種交錯都可序列化，而為了確保可序列化，資料庫必須讓某些步驟等待，或中止某些交易。' },
        { type: 'p', text: '本課的模擬器把每筆交易簡化成幾種步驟。右欄是對應的 SQL（第 7 節的範例會建立 `stock` 表），只是幫助理解，模擬器不執行 SQL：' },
        { type: 'table', head: ['模擬器的步驟', '意思', '對應的 SQL（示意）'], rows: [
          ['讀 A（存入 s）', '讀一列的值，並記在應用程式的變數 s', '`SELECT qty FROM stock WHERE product_id = 3`'],
          ['寫 A = 4', '把一列改成固定的值', '`UPDATE stock SET qty = 4 WHERE product_id = 3`'],
          ['寫 A = s − 3', '用先前讀到的值，在程式裡算出新值再寫回', '程式算好 s − 3，再送出 `UPDATE stock SET qty = ? WHERE product_id = 3`'],
          ['COUNT(值 ≥ 10)', '數有幾列符合條件：一次「依條件」的讀取', '`SELECT COUNT(*) FROM stock WHERE qty >= 10`'],
          ['新增 D = 20', '新增一列', '`INSERT INTO … VALUES (…)`'],
          ['COMMIT／ROLLBACK', '提交或撤銷整筆交易', '`COMMIT`／`ROLLBACK`'],
        ] },
        { type: 'p', text: '每個例子都有兩個選單：「並行控制」選鎖或 MVCC，「隔離等級」選等級。「排程」那一行列出各步驟原本交錯的順序；下面的表格是實際執行的結果：每一列是一個時間點，每筆交易一欄。被擋住的步驟先顯示「等待」，等擋住它的交易結束才真正執行，所以實際順序可能和排程不同；被中止的交易，之後的步驟顯示「略過」。表格最後列出每筆交易是提交還是中止、最後已提交的值，以及模擬器偵測到的異常。可以用「上一步」「下一步」逐步看。' },
        { type: 'callout', tone: 'note', title: '模擬器是教學模型', text: '兩種模型都是簡化過的教學模型，不是任何產品的實作。「鎖」模型用嚴格兩階段鎖實作四種隔離等級，這是教科書解釋隔離等級的方式；「MVCC 快照」模型仿照 PostgreSQL 的快照規則，只提供 READ COMMITTED 與 REPEATABLE READ。每一列只有一個整數值，沒有索引、沒有逾時。真實產品的行為在第 3、6 節分別說明，並註明是哪一個產品。' },
      ],
    },
    {
      id: 'anomalies', title: '四種異常：在時間軸上重現',
      blocks: [
        { type: 'p', text: '下面四個排程各重現一種異常。每個例子先用「會出錯」的模型與等級開啟；看完結果後，切到更高的等級或另一個模型，觀察它怎麼被擋下。' },
        { type: 'p', text: '髒讀（dirty read）：讀到別的交易還沒提交的值。如果那筆交易後來 `ROLLBACK`，讀到的值就從來沒有真正存在過。' },
        { type: 'example', id: 'sch-dirty-read' },
        { type: 'p', text: '在 READ UNCOMMITTED 下，T2 讀到 400，而 T1 隨後撤銷，帳戶其實從來沒有只剩 400。切到 READ COMMITTED：T2 的讀取要等 T1 釋放寫入的鎖，T1 撤銷之後才讀到 1000。改用 MVCC 模型：T2 不必等，直接讀到最後提交的版本 1000。' },
        { type: 'p', text: '不可重複讀（non-repeatable read）：同一筆交易兩次讀同一列，中間別的交易修改並提交了它，兩次讀到不同的值。' },
        { type: 'example', id: 'sch-non-repeatable' },
        { type: 'p', text: 'READ COMMITTED 下 T1 先讀到 2490、再讀到 1990。每次讀到的都是已提交的值，沒有髒讀，但同一筆交易裡前後不一致：顧客看到的價格和實際結帳的價格不同。切到 REPEATABLE READ：T1 讀取時拿到的共享鎖保留到交易結束，T2 的寫入要等 T1 提交後才執行，T1 兩次都讀到 2490，最後 price 仍是 1990。MVCC 的 REPEATABLE READ 則讓 T2 照常寫入並提交，T1 一直讀自己的快照，兩次都是 2490。' },
        { type: 'p', text: '幻讀（phantom）：同一個條件查詢兩次，中間別的交易新增了符合條件的列並提交，第二次多出一列。和不可重複讀的差別在於：變動的不是你讀過的列，而是一列你沒讀過、當時甚至還不存在的列，所以只鎖住讀過的列擋不住它。' },
        { type: 'example', id: 'sch-phantom' },
        { type: 'p', text: 'REPEATABLE READ 下，T1 已經鎖住它數到的 A 與 C，但 D 是新的一列，不在任何鎖之內，所以第二次 COUNT 從 2 變成 3。切到 SERIALIZABLE：T1 的 COUNT 也鎖住「值 ≥ 500」這個範圍，T2 的新增要等 T1 提交，T1 兩次都數到 2。MVCC 的 REPEATABLE READ 也看不到 D：它是在 T1 的快照之後才提交的。' },
        { type: 'p', text: '遺失更新（lost update）：兩筆交易都「先讀、再依讀到的值寫回」，後寫的一方用的是過時的值，蓋掉了先提交的更新。' },
        { type: 'example', id: 'sch-lost-update' },
        { type: 'p', text: 'READ COMMITTED 下兩筆都讀到 10，T1 寫入 7 並提交，T2 接著寫入 10 − 2 = 8：一共賣出 5 件，庫存卻只少 2 件，T1 的扣除不見了。兩筆交易都沒有讀到未提交的資料，每一次讀取都合法，問題出在「讀」與「寫」之間的空檔。切到 REPEATABLE READ：兩筆都持有 stock 的共享鎖，T1 要寫入得等 T2 放鎖，T2 要寫入也得等 T1，互相等待形成死結，T2 被中止，最後 stock = 7（第 5 節細談死結）。MVCC 的 REPEATABLE READ 同樣中止 T2，但原因不同：T1 在 T2 的快照之後提交了 stock（第 6 節）。' },
        { type: 'callout', tone: 'tip', title: '分辨四種異常的四個問題', text: '讀到的值提交了沒有？（髒讀）同一列讀兩次，值一樣嗎？（不可重複讀）同一個條件查兩次，列數一樣嗎？（幻讀）寫回的值是不是用已經過時的讀取算出來的？（遺失更新）' },
      ],
    },
    {
      id: 'levels', title: 'SQL 標準的四種隔離等級',
      blocks: [
        { type: 'p', text: 'SQL 標準（自 SQL-92 起）用「禁止哪些現象」來定義隔離等級：它列出髒讀、不可重複讀、幻讀三種現象，等級每升一級就多禁止一種；SERIALIZABLE 還要求執行的結果等同某個序列排程。下表的前三欄是標準的定義，最後一欄不是標準的內容，而是本課鎖模型的結果：' },
        { type: 'table', head: ['隔離等級', '髒讀', '不可重複讀', '幻讀', '遺失更新（本課鎖模型）'], rows: [
          ['READ UNCOMMITTED', '可能', '可能', '可能', '可能'],
          ['READ COMMITTED', '不會', '可能', '可能', '可能'],
          ['REPEATABLE READ', '不會', '不會', '可能', '不會（其中一筆被中止）'],
          ['SERIALIZABLE', '不會', '不會', '不會', '不會（其中一筆被中止）'],
        ] },
        { type: 'list', items: [
          '遺失更新不是標準列出的現象。標準只用三種讀取現象定義等級；1995 年 Berenson 等人的論文〈A Critique of ANSI SQL Isolation Levels〉指出這樣的定義漏掉了遺失更新等情況。所以「哪個等級擋得住遺失更新」要看實作：本課鎖模型的 REPEATABLE READ 擋得住（代價是死結），READ COMMITTED 擋不住。',
          '標準規定的是「至少要禁止什麼」，產品可以做得更嚴格。例如 PostgreSQL 的 REPEATABLE READ 也不會出現幻讀。',
          '標準把 SERIALIZABLE 當成預設等級，但產品的預設常常比較低：PostgreSQL 預設 READ COMMITTED，MySQL 的 InnoDB 預設 REPEATABLE READ。不知道預設是什麼，就不知道你的程式擋住了哪些異常。',
          '標準的設定語法是 `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`。PostgreSQL 也可以寫 `BEGIN ISOLATION LEVEL REPEATABLE READ;`，MySQL 可以用 `SET SESSION TRANSACTION ISOLATION LEVEL …` 設定整條連線。各產品對設定何時生效的規定不同，使用前要查該產品的文件。',
        ] },
        { type: 'callout', tone: 'warning', title: 'SQLite 沒有這四個選項', text: 'SQLite 沒有 `SET TRANSACTION ISOLATION LEVEL`。它讓整個資料庫同一時間只有一個寫入交易（把寫入排成一個接一個），不同連線之間的交易因此是可序列化的；在 WAL 模式下，讀取的交易看到它開始讀取那一刻的快照，不會被寫入擋住。`BEGIN IMMEDIATE` 讓交易一開始就取得寫入權，而不是等到第一次寫入才去搶。本課的 SQL 練習場只有一條連線，看不到並行的效果，所以並行交給模擬器。' },
      ],
    },
    {
      id: 'locking', title: '鎖與兩階段鎖',
      blocks: [
        { type: 'p', text: '實作隔離的第一種做法是鎖。最基本的兩種鎖：共享鎖（S 鎖，shared）給讀取，排他鎖（X 鎖，exclusive）給寫入。同一列可以同時有很多把 S 鎖，但 X 鎖和任何別人的鎖都不相容，要等對方放開：' },
        { type: 'table', head: ['這一列目前', '想拿 S 鎖（讀）', '想拿 X 鎖（寫）'], rows: [
          ['沒有人持有鎖', '可以', '可以'],
          ['別人持有 S 鎖', '可以', '等待'],
          ['別人持有 X 鎖', '等待', '等待'],
        ] },
        { type: 'p', text: '只有鎖還不夠。如果 T1 讀完 A 立刻放鎖，之後才去鎖 B，別的交易就能在中間改掉 A，結果不一定可序列化。兩階段鎖（two-phase locking，2PL）規定每筆交易分成兩個階段：成長階段只能取得鎖；一旦釋放了任何一把鎖，就進入縮減階段，之後不能再取得新的鎖。可以證明，所有交易都遵守 2PL 時，排程一定是（衝突）可序列化的。實務上多用嚴格兩階段鎖（strict 2PL）：X 鎖一律保留到 `COMMIT` 或 `ROLLBACK`，別人就不會讀到或覆寫未提交的資料，撤銷時也不會牽連別人。' },
        { type: 'p', text: '本課的鎖模型讓寫入都遵守嚴格 2PL，再用「讀取的鎖保留多久」區分四種等級：' },
        { type: 'table', head: ['等級（鎖模型）', '讀取', '寫入', '在模擬器裡擋住的異常'], rows: [
          ['READ UNCOMMITTED', '不加鎖，可能讀到未提交的值', 'X 鎖保留到交易結束', '沒有（但寫入之間仍會互相等待）'],
          ['READ COMMITTED', '加 S 鎖，讀完立刻放', '同上', '髒讀'],
          ['REPEATABLE READ', 'S 鎖保留到交易結束', '同上', '髒讀、不可重複讀、遺失更新'],
          ['SERIALIZABLE', '同上，另外鎖住 COUNT 的條件範圍，符合條件的新增要等', '同上', '再加上幻讀'],
        ] },
        { type: 'p', text: 'READ COMMITTED 讀完就放鎖，之後還會再拿別的鎖，嚴格說已經不符合 2PL，這正是它允許不可重複讀的原因。SERIALIZABLE 的範圍鎖（述詞鎖）用來擋幻讀：要擋的是「還不存在的列」，鎖不到一列，只能鎖住條件。真實系統常用索引上的範圍鎖達成，例如 MySQL InnoDB 的 next-key lock，鎖住索引紀錄以及它前面的間隙。' },
        { type: 'callout', tone: 'note', title: '鎖的代價', text: '鎖保留得越久、範圍越大，等待就越多，同時能完成的交易越少；兩筆交易互相等待時還會形成死結。把第 2 節的幻讀例子切到 SERIALIZABLE，看看 T2 的新增等了多久。' },
      ],
    },
    {
      id: 'deadlock', title: '死結與死結偵測',
      blocks: [
        { type: 'p', text: '當 T1 在等 T2 放鎖，T2 也在等 T1，兩邊都不會前進，這就是死結（deadlock）。資料庫用等待圖（wait-for graph）偵測：每個「T1 等 T2」畫一條 T1 → T2 的邊，圖中出現環就是死結。唯一的解法是中止環上的某一筆交易（稱為犧牲者），撤銷它的修改、釋放它的鎖。下面是兩筆方向相反的轉帳：' },
        { type: 'example', id: 'sch-deadlock' },
        { type: 'p', text: 'READ COMMITTED 下，T1 已經寫了 A、T2 已經寫了 B，兩把都是保留到交易結束的 X 鎖。T1 要讀 B，得等 T2；接著 T2 要讀 A，如果讓它等 T1，就形成 T1 → T2 → T1 的環，所以模擬器中止 T2。T2 對 B 的修改被撤銷、鎖被釋放，T1 才讀到 B = 300 並完成轉帳：最後 A = 400、B = 400，總額 800 不變。T2 的轉帳沒有發生，應用程式要重試。' },
        { type: 'p', text: '把模型切到 MVCC：讀取不用等，但兩筆交易寫同一列時仍然要等，所以死結照樣發生，只是改在寫入的步驟。再切回鎖模型的 READ UNCOMMITTED：T1 讀到 T2 未提交的 B = 250，T2 被中止後，T1 仍然照 250 + 100 寫入 350，最後 A = 400、B = 350，總額少了 50。這就是髒讀的實際後果。' },
        { type: 'list', items: [
          '模擬器選「提出等待、因而造成環的那一筆」當犧牲者。真實系統各有規則：PostgreSQL 在等待超過 `deadlock_timeout`（預設 1 秒）後才檢查死結，並中止其中一筆，文件說明哪一筆被中止很難預測；MySQL InnoDB 偏好回滾較小的交易（依新增、修改、刪除的列數判斷）。',
          '犧牲者會收到錯誤（PostgreSQL 的 SQLSTATE 是 `40P01`），整筆交易已經撤銷。正確的處理是從 `BEGIN` 開始重試整筆交易，而不是只重送最後一個敘述。',
          '預防勝於偵測：讓所有交易以固定的順序取得鎖（例如轉帳一律先鎖帳號較小的那一列），等待就不會繞成環。PL14 執行緒與同步談互斥鎖時用的是同一個道理。',
        ] },
        { type: 'callout', tone: 'tip', title: '提高隔離等級不會消除死結', text: '等級越高，鎖保留得越久、範圍越大，死結只會更多。死結要靠固定的取鎖順序、縮短交易（不要在交易中等使用者輸入）以及重試來處理。' },
      ],
    },
    {
      id: 'mvcc', title: 'MVCC：每筆交易讀自己的快照',
      blocks: [
        { type: 'p', text: '第二種做法是多版本並行控制（MVCC，multiversion concurrency control）：寫入時不覆蓋舊值，而是新增一個版本，記下是哪一筆交易寫的、何時提交。讀取時依「快照」挑版本：只看快照建立之前已經提交的版本，再加上自己寫的。於是讀取不必等寫入，寫入也不必等讀取；只有兩筆交易要寫同一列時，後到的仍要等前一筆結束。' },
        { type: 'table', head: ['等級（MVCC 模型）', '快照何時建立', '效果'], rows: [
          ['READ COMMITTED', '每個敘述各自建立', '不會髒讀；同一筆交易的兩個敘述可能看到不同的已提交資料（不可重複讀、幻讀），也擋不住遺失更新'],
          ['REPEATABLE READ', '交易的第一個敘述建立，之後一直沿用', '整筆交易看到同一個時間點，沒有不可重複讀與幻讀；要寫入別人在快照之後提交過的列時，交易被中止（先更新者勝）'],
        ] },
        { type: 'example', id: 'sch-first-updater' },
        { type: 'p', text: 'T1 與 T2 都讀到 seats = 3。T2 先賣出一張並提交，seats 變成 2。T1 再讀一次仍然是 3（它的快照），可重複讀成立；但 T1 若照 3 − 1 = 2 寫回，就會蓋掉 T2 賣出的那一張。模擬器在 T1 寫入時發現「seats 在 T1 的快照之後被別人提交過」，直接中止 T1：先更新者勝（first-updater-wins）。最後 seats = 2，只有 T2 的那一張成立，T1 必須重試。切到 READ COMMITTED：T1 第二次讀到 2（不可重複讀），然後照第一次的 3 寫入 2，賣出兩張票卻只扣一張（遺失更新）。切到鎖模型的 REPEATABLE READ，兩筆都持有 seats 的共享鎖，結果變成死結，被中止的是 T1。' },
        { type: 'p', text: '真實產品的做法（只列本課確定的部分）：' },
        { type: 'list', items: [
          'PostgreSQL 用 MVCC。可以要求 READ UNCOMMITTED，但行為和 READ COMMITTED 相同。REPEATABLE READ 是快照隔離（snapshot isolation），比標準要求的更強，不會出現幻讀；更新同一列時若遇到快照之後的並行更新，回報 serialization failure（SQLSTATE `40001`），要重試整筆交易。SERIALIZABLE 用可序列化快照隔離（SSI，serializable snapshot isolation）偵測可能破壞可序列化的讀寫相依，並中止其中一筆交易。',
          'MySQL InnoDB 預設 REPEATABLE READ。一般的 `SELECT` 讀的是交易中第一次讀取時建立的快照（一致性讀取）；但 `UPDATE`、`DELETE` 與 `SELECT … FOR UPDATE` 讀的是最新已提交的列並加鎖，不會像 PostgreSQL 那樣因並行更新而中止。所以在 InnoDB 裡，「先用一般的 `SELECT` 讀、再用程式算好的值 `UPDATE`」仍可能遺失更新，要用第 7 節的方法。',
          'SQLite：寫入一個接一個進行（第 3 節）；WAL 模式下的讀取看到開始讀取那一刻的快照。',
        ] },
        { type: 'callout', tone: 'warning', title: '本課 MVCC 模型的限制', text: '模型只提供 READ COMMITTED 與 REPEATABLE READ：沒有模擬 SERIALIZABLE（PostgreSQL 的 SSI）；READ UNCOMMITTED 在 PostgreSQL 等同 READ COMMITTED，所以也沒有列出。快照隔離還有一種本模型不模擬、也不會偵測的異常：寫入偏斜（write skew）。例如醫院規定至少要有一位醫師值班，兩位值班醫師同時查到「還有另一位在班」，各自把自己改成下班；兩筆交易寫的是不同的列，先更新者勝不會觸發，兩筆都提交後就沒有人值班了。PostgreSQL 的 SERIALIZABLE 能擋下它，REPEATABLE READ 不能。' },
      ],
    },
    {
      id: 'fix-lost-update', title: '修正遺失更新：悲觀鎖、原子更新與樂觀鎖',
      blocks: [
        { type: 'p', text: '遺失更新是應用程式最常寫出的並發錯誤，因為「先 `SELECT`、在程式裡計算、再 `UPDATE`」是很自然的寫法；在常見的預設等級（PostgreSQL 的 READ COMMITTED、MySQL InnoDB 的 REPEATABLE READ）下，它都可能發生。練習場只有一條連線，但可以依序執行兩位店員的敘述，看到同樣的結果。下面先建立庫存表 `stock`（每項商品的庫存量 `qty` 與版本號 `version`），兩位店員都讀到 27 吋螢幕（`product_id = 3`）的庫存是 5，各賣出 1 件與 2 件，再各自寫回算好的值：' },
        { type: 'example', id: 'sql-blind-overwrite' },
        { type: 'p', text: '賣出 3 件，庫存應該是 2，卻是 3：後寫的店員乙用過時的 5 算出 3，蓋掉了店員甲的 4。有三種修法。' },
        { type: 'p', text: '第一種是悲觀鎖：讀的時候就鎖住要改的列。PostgreSQL 與 MySQL 寫成 `SELECT qty FROM stock WHERE product_id = 3 FOR UPDATE;`，這一列被加上寫入用的鎖直到交易結束；另一筆交易也對這一列執行 `FOR UPDATE` 或 `UPDATE` 時，必須等前一筆結束（一般的 `SELECT` 在 MVCC 下仍讀舊版本，不受影響）。在 PostgreSQL 的 READ COMMITTED 與 MySQL InnoDB 下，等完之後讀到的是對方提交後的新值。如果第 2 節遺失更新例子裡的兩次讀取都用 `FOR UPDATE`，T2 會等 T1 提交、讀到 7，再寫回 5。SQLite 沒有這個語法（在練習場執行會得到 `near "FOR": syntax error`）；在 SQLite 裡，通常用 `BEGIN IMMEDIATE` 一開始就取得整個資料庫的寫入權。' },
        { type: 'p', text: '第二種是原子更新：不要把值讀到程式裡算，而是讓資料庫在同一個敘述裡讀和寫，並把檢查寫進 `WHERE`。下面連續扣三次 2 件：' },
        { type: 'example', id: 'sql-atomic-update' },
        { type: 'p', text: '前兩次成功（5 → 3 → 1），第三次 `qty >= 2` 不成立，沒有任何一列被修改，庫存不會變成負數。`changes()` 是 SQLite 的函式（DB07），應用程式用它（或其他 DBMS 回報的影響列數）判斷有沒有扣成功。並行時，PostgreSQL 的 READ COMMITTED 遇到別人正在修改的列，會等對方結束，再用最新提交的值重新檢查 `WHERE` 並計算新值，所以不會遺失更新；在 REPEATABLE READ 下，如果對方提交了修改，則回報 serialization failure，要重試整筆交易。' },
        { type: 'p', text: '第三種是樂觀鎖（optimistic locking）：不事先加鎖，假設衝突很少。每一列多一個版本號 `version`，更新時同時檢查版本沒變，並把版本加 1；如果版本已經被別人改過，`WHERE` 就找不到列：' },
        { type: 'example', id: 'sql-optimistic' },
        { type: 'p', text: '店員甲帶著版本 1 更新成功，qty 變成 4、版本變成 2；店員乙也帶著版本 1，`WHERE … AND version = 1` 找不到列，`changes()` 是 0。應用程式看到 0 就知道資料被別人改過：重新讀取最新的 qty 與 version、重新計算，再試一次，或告訴使用者「資料已被修改」。檢查和寫入在同一個 `UPDATE` 裡完成，不必在使用者思考時一直持有鎖，很適合畫面會停留很久的編輯，例如後台修改商品資料。' },
        { type: 'table', head: ['做法', '怎麼做', '適合', '代價'], rows: [
          ['悲觀鎖', '`SELECT … FOR UPDATE` 先鎖再讀（PostgreSQL、MySQL）', '衝突頻繁、交易很短', '等待，可能死結'],
          ['原子更新', '`UPDATE stock SET qty = qty - 2 WHERE … AND qty >= 2`', '新值能在一個敘述裡算出來', '複雜的邏輯寫不進一個敘述'],
          ['樂觀鎖', '`version` 欄位、`WHERE … AND version = ?`、檢查影響列數', '衝突很少、讀到寫之間隔很久', '衝突時要重試或請使用者重做'],
          ['提高隔離等級', '使用會中止衝突交易的等級，失敗就重試', '同時要擋好幾種異常', '中止與重試變多；效果依產品而定'],
        ] },
      ],
    },
    {
      id: 'choose-level', title: '選擇夠用的隔離等級',
      blocks: [
        { type: 'p', text: '看著一條時間軸選等級，可以照這個順序想：' },
        { type: 'list', ordered: true, items: [
          '找出每筆交易讀了什麼、根據讀到的值寫了什麼。只讀的報表和「先讀再寫」的扣庫存，風險不同。',
          '找出別的交易可能在中間做什麼：寫了還沒提交就被讀到（髒讀）、改了你讀過的列（不可重複讀、遺失更新）、新增了符合你條件的列（幻讀）。',
          '判斷哪些異常真的會造成錯誤。只看一眼的概略數字也許能容忍不可重複讀；扣庫存不能容忍遺失更新。',
          '選能擋住這些異常的最弱等級，並確認你用的產品在這個等級的實際行為：同樣叫 REPEATABLE READ，本課的鎖模型、PostgreSQL 與 MySQL InnoDB 擋住的異常並不相同。',
          '為中止做準備：死結的犧牲者與 serialization failure 都要整筆重試。',
        ] },
        { type: 'p', text: '把第 2 節的四個排程各自需要的最弱等級排在一起（由模擬器算出），兩個模型只有幻讀不同：' },
        { type: 'table', head: ['排程（第 2 節）', '鎖模型：最弱足夠的等級', 'MVCC 模型：最弱足夠的等級'], rows: [
          ['髒讀：讀到後來被撤銷的提款', 'READ COMMITTED', 'READ COMMITTED'],
          ['不可重複讀：結帳時價格變了', 'REPEATABLE READ', 'REPEATABLE READ'],
          ['幻讀：報表多出一列', 'SERIALIZABLE', 'REPEATABLE READ'],
          ['遺失更新：兩位店員同時扣庫存', 'REPEATABLE READ（一筆被中止）', 'REPEATABLE READ（一筆被中止）'],
        ] },
        { type: 'callout', tone: 'tip', title: '「最弱但足夠」', text: '等級越高，等待、死結與中止越多，不需要的保證是有成本的。但只要有一種會造成錯誤的異常可能發生，就一定要擋住：不能賭交錯的時間點剛好錯開，並行錯誤平常測不出來，上線後在流量高峰才出現。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-locking-wait', prompt: '鎖模型、READ COMMITTED：T1 執行「寫 A = 400」，還沒提交；接著 T2 執行「讀 A」。T2 的讀取會怎樣？',
      options: [
        '立刻讀到 400',
        '立刻讀到原本已提交的值',
        '等到 T1 提交或撤銷之後才讀',
        'T2 因為死結被中止',
      ],
      answer: 2, explanation: 'READ COMMITTED 的讀取要拿 S 鎖，和 T1 保留到交易結束的 X 鎖不相容，所以 T2 要等 T1 結束。立刻讀到 400 是 READ UNCOMMITTED 的行為（髒讀）；不等待、直接讀到舊的已提交值是 MVCC 模型的行為。這裡只有 T2 等 T1，T1 並沒有在等 T2，等待圖沒有環，不是死結。',
    },
    {
      id: 'q-name-anomaly', prompt: '報表交易 T1 執行 `SELECT COUNT(*) FROM stock WHERE qty >= 10`，得到 2；這時 T2 新增一列 qty 為 20 的庫存並提交；T1 再執行同一個查詢，得到 3。這是哪一種異常？在本課的鎖模型裡，最弱哪一個等級擋得住？',
      options: [
        '不可重複讀；REPEATABLE READ',
        '幻讀；SERIALIZABLE',
        '幻讀；REPEATABLE READ',
        '髒讀；READ COMMITTED',
      ],
      answer: 1, explanation: '多出來的是一列 T1 從沒讀過、查詢時還不存在的列，所以是幻讀，不是不可重複讀（那是同一列的值改變）。鎖模型的 REPEATABLE READ 只鎖住讀過的列，擋不住新增的列；要 SERIALIZABLE 鎖住條件範圍，T2 的新增才會等待。REPEATABLE READ 在 MVCC 模型（以及 PostgreSQL）裡擋得住幻讀，但題目問的是鎖模型。T2 已經提交才被讀到，不是髒讀。',
    },
    {
      id: 'q-mvcc-read', prompt: 'MVCC 模型、READ COMMITTED：price 原本是 2490。T2 執行「寫 price = 1990」但還沒提交，這時 T1 讀 price。結果是？',
      options: [
        'T1 不必等待，讀到 2490',
        'T1 讀到 1990，這是髒讀',
        'T1 要等 T2 結束才能讀',
        'T1 讀到 2490，而 T2 的寫入因此被中止',
      ],
      answer: 0, explanation: 'MVCC 的讀取依快照挑版本：T2 的 1990 還沒提交，不在任何人的快照裡，所以 T1 讀到最後提交的 2490，而且不必等待。讀到 1990 只會發生在鎖模型的 READ UNCOMMITTED；要等 T2 是鎖模型 READ COMMITTED 的行為。讀取不會讓別人的寫入被中止，T2 之後照常提交。',
    },
    {
      id: 'q-2pl', prompt: '下面是交易 T1 取得與釋放鎖的順序（S 是共享鎖、X 是排他鎖）。哪一個違反兩階段鎖（2PL）？',
      options: [
        'S(A)、S(B)、X(C)，然後放 A、放 B、放 C',
        'X(A)、X(B)，到 COMMIT 時一起釋放',
        'S(A)、X(B)、放 A，到 COMMIT 時才放 B',
        'S(A)、放 A、X(B)、放 B',
      ],
      answer: 3, explanation: '2PL 只要求一件事：釋放任何一把鎖之後，就不能再取得新的鎖。最後一個先放了 A 才去拿 B 的 X 鎖，違反規則；READ COMMITTED「讀完就放鎖」正是這種情形，所以它允許不可重複讀。其餘三個都是先把鎖拿齊、再開始放：第一個是一般的 2PL；第二個把鎖留到交易結束，是嚴格 2PL；第三個在拿到 B 之後才放 A，也符合 2PL，而且 X 鎖留到 COMMIT，同樣是嚴格 2PL。',
    },
    {
      id: 'q-optimistic', prompt: '店員乙在畫面上讀到 27 吋螢幕 qty = 5、version = 1，賣出 2 件後送出下面兩個敘述。在這之前，店員甲已經用同樣的寫法把它改成 qty = 4、version = 2。`changes()` 回傳什麼？應用程式接著該怎麼做？',
      code: { language: 'SQL', text: 'UPDATE stock\nSET qty = 3, version = version + 1\nWHERE product_id = 3 AND version = 1;\nSELECT changes();' },
      options: [
        '0；重新讀取最新的 qty 與 version，重新計算後再試',
        '1；更新成功，庫存變成 3',
        '0；再送一次同一個敘述，直到它成功為止',
        '敘述失敗並回報錯誤，因為違反了約束',
      ],
      answer: 0, explanation: '版本已經是 2，`WHERE … AND version = 1` 找不到列，`UPDATE` 正常執行但改了 0 列，所以 `changes()` 是 0：這就是樂觀鎖偵測到的衝突，要依最新的 qty = 4 重新計算（4 − 2 = 2）並帶上版本 2 再試。回傳 1、庫存變成 3 是沒有版本檢查時的遺失更新。原封不動重送，版本永遠對不上，永遠是 0。找不到列不是錯誤，也沒有違反任何約束。',
    },
    {
      id: 'q-deadlock-fix', prompt: 'T1 把 A 的錢轉給 B（先改 A 再改 B），T2 同時把 B 的錢轉給 A（先改 B 再改 A），兩筆偶爾發生死結。哪一個改法能避免死結，又不破壞轉帳的正確性？',
      options: [
        '把隔離等級提高到 SERIALIZABLE',
        '改用 READ UNCOMMITTED，讀取就不必等待',
        '在改完轉出帳戶之後先 COMMIT，再改轉入帳戶',
        '兩種轉帳都依帳號順序修改：一律先改帳號較小的那一列',
      ],
      answer: 3, explanation: '死結來自兩筆交易以相反的順序取得鎖；固定順序後，後到的一筆只會在第一列就等待，不會形成環。提高等級只會讓鎖更多、更久，死結不會變少。READ UNCOMMITTED 的寫入仍要拿 X 鎖，兩筆互相等待的寫入照樣死結（在模擬器的轉帳例子切到 READ UNCOMMITTED，還會多出髒讀）。在中間 COMMIT 把一筆轉帳拆成兩筆交易，失去原子性：兩次之間當機或失敗，錢就憑空少了。',
    },
    {
      id: 'q-snapshot-conflict', prompt: 'MVCC 模型、REPEATABLE READ：stock = 10。T1 與 T2 都讀 stock（存入 s）；T1 寫入 stock = s − 3 並提交；然後 T2 寫入 stock = s − 2。結果是？',
      options: [
        'T2 寫入成功，stock = 8，T1 的扣除不見了',
        'T2 等 T1 結束後寫入，stock = 5',
        'T2 被中止，stock = 7，T2 要重試',
        'T1 與 T2 都被中止，stock = 10',
      ],
      answer: 2, explanation: 'T2 的快照是在它第一次讀取時建立的；T1 在那之後提交了 stock，T2 再寫同一列就違反「先更新者勝」，被中止，留下 T1 的 7。stock = 8 是 READ COMMITTED 的遺失更新。stock = 5 需要 T2 讀到 T1 提交後的 7，但 T2 的變數 s 早就是 10，寫入也不會重新讀取。T1 先提交，已經生效，不會因為後來的衝突被撤銷。',
    },
  ],
  sql: {
    dataset: 'shop',
    presets: [
      { label: '建立庫存表 stock（可重複執行）', sql: stockTable + sql`SELECT s.product_id, p.name, s.qty, s.version
FROM stock s
JOIN products p ON p.id = s.product_id
ORDER BY s.product_id;` },
      { label: '樂觀鎖：版本相符，更新成功', sql: stockTable + sql`UPDATE stock
SET qty = 4, version = version + 1
WHERE product_id = 3 AND version = 1;
SELECT changes() AS updated, qty, version FROM stock WHERE product_id = 3;` },
      { label: '樂觀鎖：版本過期，changes() 是 0', sql: stockTable + sql`UPDATE stock SET qty = 4, version = version + 1 WHERE product_id = 3 AND version = 1;
UPDATE stock SET qty = 3, version = version + 1 WHERE product_id = 3 AND version = 1;
SELECT changes() AS updated, qty, version FROM stock WHERE product_id = 3;` },
      { label: '原子更新：庫存不足就不扣', sql: stockTable + sql`UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
SELECT changes() AS updated, qty FROM stock WHERE product_id = 3;` },
      { label: '一條連線裡的交易：ROLLBACK 撤銷修改', sql: stockTable + sql`BEGIN;
UPDATE stock SET qty = qty - 1, version = version + 1 WHERE product_id = 1;
SELECT qty, version FROM stock WHERE product_id = 1;
ROLLBACK;
SELECT qty, version FROM stock WHERE product_id = 1;` },
    ],
    examples: [
      {
        id: 'sql-blind-overwrite', title: '兩位店員各自寫回算好的值', dataset: 'shop',
        description: '店員甲與店員乙都讀到 qty = 5。甲賣出 1 件，寫回 4；乙賣出 2 件，寫回 3。最後與應有的庫存比較。',
        sql: stockTable + sql`UPDATE stock SET qty = 4 WHERE product_id = 3;
UPDATE stock SET qty = 3 WHERE product_id = 3;
SELECT qty, 5 - 1 - 2 AS expected
FROM stock
WHERE product_id = 3;`,
        result: { columns: ['qty', 'expected'], rows: [[3, 2]] },
      },
      {
        id: 'sql-atomic-update', title: '原子更新：在 WHERE 裡檢查庫存', dataset: 'shop',
        description: '每次扣 2 件，只有庫存還夠時才扣。最後一次是否成功，看 `changes()`。',
        sql: stockTable + sql`UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
UPDATE stock SET qty = qty - 2 WHERE product_id = 3 AND qty >= 2;
SELECT changes() AS updated, qty
FROM stock
WHERE product_id = 3;`,
        result: { columns: ['updated', 'qty'], rows: [[0, 1]] },
      },
      {
        id: 'sql-optimistic', title: '樂觀鎖：用版本號偵測衝突', dataset: 'shop',
        description: '兩位店員都讀到 qty = 5、version = 1。店員甲先送出更新，店員乙帶著同一個舊版本號再送出。',
        sql: stockTable + sql`UPDATE stock
SET qty = 4, version = version + 1
WHERE product_id = 3 AND version = 1;
UPDATE stock
SET qty = 3, version = version + 1
WHERE product_id = 3 AND version = 1;
SELECT changes() AS updated, qty, version
FROM stock
WHERE product_id = 3;`,
        result: { columns: ['updated', 'qty', 'version'], rows: [[0, 4, 2]] },
      },
    ],
    exercises: [],
  },
  transactions: {
    timelines: [],
    schedules: [
      {
        id: 'sch-dirty-read', title: '髒讀：讀到後來被撤銷的提款',
        description: '帳戶 A 原本有 1000。T1 提款 600，先寫入 400，之後因為驗證失敗而 ROLLBACK；T2 在中間讀 A。預設是鎖模型的 READ UNCOMMITTED。改成 READ COMMITTED，或改用 MVCC 模型，比較 T2 讀到的值與有沒有等待。',
        model: 'locking', level: 'READ UNCOMMITTED',
        schedule: { items: { A: 1000 }, steps: [
          { tx: 'T1', op: 'write', item: 'A', value: 400 },
          { tx: 'T2', op: 'read', item: 'A' },
          { tx: 'T1', op: 'abort' },
          { tx: 'T2', op: 'commit' },
        ] },
      },
      {
        id: 'sch-non-repeatable', title: '不可重複讀：結帳時價格變了',
        description: 'T1 是結帳流程：先讀商品價格 price 顯示給顧客，顧客確認後再讀一次。T2 在中間把價格從 2490 改成 1990 並提交。預設是鎖模型的 READ COMMITTED。',
        model: 'locking', level: 'READ COMMITTED',
        schedule: { items: { price: 2490 }, steps: [
          { tx: 'T1', op: 'read', item: 'price' },
          { tx: 'T2', op: 'write', item: 'price', value: 1990 },
          { tx: 'T2', op: 'commit' },
          { tx: 'T1', op: 'read', item: 'price' },
          { tx: 'T1', op: 'commit' },
        ] },
      },
      {
        id: 'sch-phantom', title: '幻讀：報表多出一列',
        description: '三筆訂單的金額是 A = 600、B = 300、C = 800。T1 兩次數「金額 ≥ 500 的訂單」有幾筆；T2 在中間新增一筆 900 元的訂單 D 並提交。預設是鎖模型的 REPEATABLE READ。',
        model: 'locking', level: 'REPEATABLE READ',
        schedule: { items: { A: 600, B: 300, C: 800 }, steps: [
          { tx: 'T1', op: 'count', min: 500 },
          { tx: 'T2', op: 'insert', item: 'D', value: 900 },
          { tx: 'T2', op: 'commit' },
          { tx: 'T1', op: 'count', min: 500 },
          { tx: 'T1', op: 'commit' },
        ] },
      },
      {
        id: 'sch-lost-update', title: '遺失更新：兩位店員同時扣庫存',
        description: '庫存 stock = 10。T1 賣出 3 件、T2 賣出 2 件，兩筆都是先讀庫存存入 s，再寫回 s 減去賣出的數量；正確的結果是 5。預設是鎖模型的 READ COMMITTED。',
        model: 'locking', level: 'READ COMMITTED',
        schedule: { items: { stock: 10 }, steps: [
          { tx: 'T1', op: 'read', item: 'stock', into: 's' },
          { tx: 'T2', op: 'read', item: 'stock', into: 's' },
          { tx: 'T1', op: 'write', item: 'stock', value: { from: 's', delta: -3 } },
          { tx: 'T1', op: 'commit' },
          { tx: 'T2', op: 'write', item: 'stock', value: { from: 's', delta: -2 } },
          { tx: 'T2', op: 'commit' },
        ] },
      },
      {
        id: 'sch-deadlock', title: '死結：方向相反的兩筆轉帳',
        description: 'A = 500、B = 300。T1 從 A 轉 100 到 B，T2 從 B 轉 50 到 A，兩筆都先處理轉出的帳戶。預設是鎖模型的 READ COMMITTED。',
        model: 'locking', level: 'READ COMMITTED',
        schedule: { items: { A: 500, B: 300 }, steps: [
          { tx: 'T1', op: 'read', item: 'A', into: 'a' },
          { tx: 'T1', op: 'write', item: 'A', value: { from: 'a', delta: -100 } },
          { tx: 'T2', op: 'read', item: 'B', into: 'b' },
          { tx: 'T2', op: 'write', item: 'B', value: { from: 'b', delta: -50 } },
          { tx: 'T1', op: 'read', item: 'B', into: 'b' },
          { tx: 'T2', op: 'read', item: 'A', into: 'a' },
          { tx: 'T1', op: 'write', item: 'B', value: { from: 'b', delta: 100 } },
          { tx: 'T1', op: 'commit' },
          { tx: 'T2', op: 'write', item: 'A', value: { from: 'a', delta: 50 } },
          { tx: 'T2', op: 'commit' },
        ] },
      },
      {
        id: 'sch-first-updater', title: '快照與先更新者勝',
        description: '音樂會剩 seats = 3 張票。T1 與 T2 都先讀 seats；T2 賣出一張並提交；T1 再讀一次，然後照第一次讀到的值寫回。預設是 MVCC 模型的 REPEATABLE READ。',
        model: 'mvcc', level: 'REPEATABLE READ',
        schedule: { items: { seats: 3 }, steps: [
          { tx: 'T1', op: 'read', item: 'seats', into: 's' },
          { tx: 'T2', op: 'read', item: 'seats', into: 's' },
          { tx: 'T2', op: 'write', item: 'seats', value: { from: 's', delta: -1 } },
          { tx: 'T2', op: 'commit' },
          { tx: 'T1', op: 'read', item: 'seats', into: 'again' },
          { tx: 'T1', op: 'write', item: 'seats', value: { from: 's', delta: -1 } },
          { tx: 'T1', op: 'commit' },
        ] },
      },
    ],
    exercises: [
      {
        id: 'ex-mvcc-anomalies', title: 'MVCC 的 READ COMMITTED 會發生哪些異常',
        task: 'anomalies', model: 'mvcc', level: 'READ COMMITTED',
        statement: '模型：MVCC 快照；等級：READ COMMITTED。商品價格 price 原本是 2490。排程依序是：1. T1 讀 price；2. T2 寫 price = 1990；3. T1 讀 price；4. T2 COMMIT；5. T1 讀 price；6. T1 COMMIT。這個排程實際發生了哪些異常？（都沒有就不勾。）',
        schedule: { items: { price: 2490 }, steps: [
          { tx: 'T1', op: 'read', item: 'price' },
          { tx: 'T2', op: 'write', item: 'price', value: 1990 },
          { tx: 'T1', op: 'read', item: 'price' },
          { tx: 'T2', op: 'commit' },
          { tx: 'T1', op: 'read', item: 'price' },
          { tx: 'T1', op: 'commit' },
        ] },
        hints: [
          'MVCC 的讀取不會等待，每一次讀取各自挑一個版本；READ COMMITTED 每個敘述建立新的快照，只看得到已經提交的版本。',
          '依序寫下 T1 三次讀到的值，再對照定義：有沒有讀到未提交的值？同一列前後讀到的一樣嗎？',
          '遺失更新需要「先讀、再依讀到的值寫回」，幻讀需要同一個條件查詢兩次：這個排程裡有這些步驟嗎？',
        ],
        explanation: 'T1 三次讀到 2490、2490、1990。第 3 步時 T2 還沒提交，MVCC 讓 T1 讀最後提交的版本 2490，不必等待，也不是髒讀；第 5 步時 T2 已經提交，新的快照看到 1990，和第一次不同：不可重複讀。T1 沒有寫入，也沒有 COUNT，所以沒有遺失更新與幻讀。對照：鎖模型的 READ COMMITTED 下，第 3 步要等 T2 提交後才讀到 1990；改成 MVCC 的 REPEATABLE READ，三次都讀到 2490，沒有任何異常。',
        mistakes: [
          { answer: ['dirty-read', 'non-repeatable-read'], why: '把「T2 寫入之後才讀」當成髒讀。第 3 步時 T2 雖然還沒提交，但 MVCC 讀的是最後提交的版本 2490，不是 T2 的 1990；只有鎖模型的 READ UNCOMMITTED 才會讀到 1990。' },
          { answer: [], why: '以為 MVCC 什麼都擋得住。READ COMMITTED 每個敘述都建立新的快照，第 5 步時 T2 已經提交，T1 讀到 1990，和第一次的 2490 不同。' },
          { answer: ['phantom'], why: '把不可重複讀和幻讀混在一起：幻讀是同一個條件查詢多出（或少了）列；這裡是同一列 price 的值變了，是不可重複讀。' },
        ],
      },
      {
        id: 'ex-seat-deadlock', title: '訂位交易互相等待：最後的值',
        task: 'final', model: 'locking', level: 'REPEATABLE READ',
        statement: '模型：鎖（嚴格兩階段鎖）；等級：REPEATABLE READ。音樂會剩 seats = 5 個座位，會員點數 points = 100。排程依序是：1. T1 讀 seats（存入 s）；2. T2 讀 seats（存入 s）；3. T2 寫 points = 120；4. T1 寫 seats = s − 1；5. T2 寫 seats = s − 2；6. T1 COMMIT；7. T2 COMMIT。最後已提交的 seats 與 points 各是多少？',
        schedule: { items: { seats: 5, points: 100 }, steps: [
          { tx: 'T1', op: 'read', item: 'seats', into: 's' },
          { tx: 'T2', op: 'read', item: 'seats', into: 's' },
          { tx: 'T2', op: 'write', item: 'points', value: 120 },
          { tx: 'T1', op: 'write', item: 'seats', value: { from: 's', delta: -1 } },
          { tx: 'T2', op: 'write', item: 'seats', value: { from: 's', delta: -2 } },
          { tx: 'T1', op: 'commit' },
          { tx: 'T2', op: 'commit' },
        ] },
        hints: [
          'REPEATABLE READ 下，讀取的 S 鎖保留到交易結束。第 4 步 T1 要拿 seats 的 X 鎖：還有誰持有 seats 的 S 鎖？',
          '第 5 步 T2 也要 seats 的 X 鎖，而 T1 正在等 T2。畫出等待圖，看有沒有環；模擬器會中止提出這個等待的交易。',
          '被中止的交易，它做過的所有修改都會撤銷，包括和座位無關的那一個。',
        ],
        explanation: '第 4 步 T1 要寫 seats，但 T2 也持有 seats 的 S 鎖，T1 開始等 T2。第 5 步 T2 要寫 seats，得等 T1 放開 S 鎖，形成 T1 → T2 → T1 的環，T2 被選為犧牲者並中止：它在第 3 步寫的 points = 120 一起撤銷，鎖也釋放。T1 接著寫入 seats = 5 − 1 = 4 並提交；第 7 步時 T2 已經結束，略過。最後 seats = 4、points = 100。沒有遺失更新，但 T2 的訂位與點數都沒有成立，應用程式要重試整筆交易。對照：在 READ COMMITTED 下讀完就放鎖，T2 等 T1 提交後照舊值寫入 5 − 2 = 3，最後 seats = 3、points = 120，T1 的訂位被蓋掉了。',
        mistakes: [
          { answer: { seats: 3, points: 120 }, why: '這是 READ COMMITTED 的結果：讀完就放鎖，T2 等 T1 提交後照舊值 5 寫入 3，蓋掉 T1 的訂位。REPEATABLE READ 的 S 鎖保留到交易結束，兩筆會互相等待。' },
          { answer: { seats: 2, points: 120 }, why: '把兩筆當成依序執行、都成功：5 − 1 − 2 = 2。但 T2 的新值是用它第 2 步讀到的 5 算的，而且兩筆在這個排程裡互相等待，其中一筆會被中止。' },
          { answer: { seats: 4, points: 120 }, why: '找對了犧牲者，卻忘了中止會撤銷整筆交易：T2 在第 3 步寫的 points = 120 也要回到 100。' },
        ],
      },
      {
        id: 'ex-report-level', title: '月底報表需要哪個等級',
        task: 'level', model: 'locking', anomalies: ['non-repeatable-read', 'phantom'],
        statement: '模型：鎖（嚴格兩階段鎖）。月底報表交易 T1 要兩次看到一致的資料。帳戶餘額 A = 1200、B = 700、C = 1500。排程依序是：1. T1 COUNT（餘額 ≥ 1000）；2. T1 讀 A；3. T2 新增帳戶 D = 1800；4. T2 COMMIT；5. T3 寫 A = 1100；6. T3 COMMIT；7. T1 COUNT（餘額 ≥ 1000）；8. T1 讀 A；9. T1 COMMIT。要讓這個排程裡既不發生不可重複讀、也不發生幻讀，最弱需要哪一個隔離等級？',
        schedule: { items: { A: 1200, B: 700, C: 1500 }, steps: [
          { tx: 'T1', op: 'count', min: 1000 },
          { tx: 'T1', op: 'read', item: 'A' },
          { tx: 'T2', op: 'insert', item: 'D', value: 1800 },
          { tx: 'T2', op: 'commit' },
          { tx: 'T3', op: 'write', item: 'A', value: 1100 },
          { tx: 'T3', op: 'commit' },
          { tx: 'T1', op: 'count', min: 1000 },
          { tx: 'T1', op: 'read', item: 'A' },
          { tx: 'T1', op: 'commit' },
        ] },
        hints: [
          '先在 READ COMMITTED 下推一次：T1 第 7、8 步看到的，和第 1、2 步一樣嗎？',
          'REPEATABLE READ 保留 T1 讀過的列（A 與 C）的 S 鎖：T3 寫 A 要等誰？T2 新增的 D 是 T1 讀過的列嗎？',
          '要擋住「還不存在的列」，鎖住列不夠，要鎖住 COUNT 的條件範圍。',
        ],
        explanation: 'READ COMMITTED 下兩種異常都發生：COUNT 從 2 變成 3（D 是新列），A 從 1200 變成 1100。REPEATABLE READ 保留 T1 對 A、C 的 S 鎖，T3 的寫入要等 T1 提交，所以 A 兩次都是 1200；但 D 是新的一列，不在任何鎖之內，T2 照樣新增並提交，COUNT 仍從 2 變成 3。SERIALIZABLE 另外鎖住 COUNT 的條件範圍，T2 的新增與 T3 的寫入都等到 T1 提交後才執行，T1 兩次都看到 2 與 1200。所以最弱需要 SERIALIZABLE。換成 MVCC 模型，REPEATABLE READ 的快照就同時擋住兩者。',
        mistakes: [
          { answer: 'REPEATABLE READ', why: '只擋住了不可重複讀：T3 對 A 的寫入要等，但 D 是 T2 新增的列，T1 沒有鎖住它，第 7 步的 COUNT 仍從 2 變成 3。（在 MVCC 模型或 PostgreSQL 裡 REPEATABLE READ 就夠，但本題是鎖模型。）' },
          { answer: 'READ COMMITTED', why: 'READ COMMITTED 只保證不讀到未提交的值；T2、T3 都在 T1 的兩次讀取之間提交，兩種異常都會發生。' },
          { answer: 'none', why: '以為還不存在的列鎖不住。SERIALIZABLE 鎖的是 COUNT 的條件範圍（述詞鎖），新增符合條件的列也要等待。' },
        ],
      },
    ],
  },
};
