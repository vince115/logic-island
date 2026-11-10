import type { LessonContent } from '../schema';

const sql = String.raw;

/** DB17 SQL Injection and Database Security. SQL lesson (Phase F.1d): SQL in tests/curriculum-sql.test.ts, driver code in tests/curriculum-driver.test.ts. */
export const DB17: LessonContent = {
  lessonId: 'DB17',
  motivation: '一個登入表單只有兩個輸入框，背後是一句 `SELECT … WHERE username = \'…\' AND password_hash = \'…\'`。如果程式把使用者打的字直接拼進這句 SQL，輸入框就不再只是「資料」：一個單引號可以提早結束字串，`--` 可以把後面的密碼檢查變成註解，`OR 1=1` 可以讓條件永遠成立，`UNION` 可以把別的表的內容一起帶出來。這就是 SQL injection：攻擊者不用知道密碼，只要讓輸入改變查詢的「意思」。它是最早被廣泛記錄、到今天仍常見的漏洞之一，因為它只需要一行偷懶的字串拼接。本課先在練習場親手看見一個登入查詢怎麼被繞過，再用參數化查詢把它修好，並看懂為什麼「自己把引號跳脫掉」不可靠、ORM 哪些 API 安全、哪些是危險的出口。修好查詢只是第一道防線：資料庫帳號應該只拿到工作需要的權限（`GRANT`／`REVOKE` 與角色），密碼要用加鹽、刻意放慢的雜湊函式保存，敏感欄位要加密，重要的異動要留下稽核紀錄。這樣即使某一道防線失守，損害也被限制在最小的範圍裡。',
  sections: [
    {
      id: 'how-injection-works', title: '輸入怎麼變成 SQL 的一部分',
      blocks: [
        { type: 'p', text: '本課的練習場是帳號資料 `auth`：`users` 有 5 個帳號，alice 是管理員（`role = \'admin\'`），carol 已停用（`active = 0`）；`password_hash` 存的是密碼雜湊，這裡都是示範用的假值。`login_log` 記錄每次登入嘗試，`user_id` 是 NULL 的那一筆是有人用不存在的帳號登入。' },
        { type: 'p', text: '前一課（程式串接資料庫與 ORM）看過應用程式怎麼送出 SQL。假設登入程式先把使用者輸入的密碼算成雜湊，再用字串拼接組出查詢：`"SELECT id, username, role FROM users WHERE username = \'" + 帳號 + "\' AND password_hash = \'" + 雜湊 + "\' AND active = 1"`，查到一列就算登入成功。帳號輸入 `alice`，組出來的是一句正常的查詢。可是如果輸入 `alice\' --`：' },
        { type: 'example', id: 'inject-comment' },
        { type: 'p', text: '程式以為自己在拼一個「值」，資料庫看到的卻是一段新的 SQL。三個小工具就能改寫查詢的語意：' },
        { type: 'table', head: ['輸入裡的', '在 SQL 裡的作用', '這個例子'], rows: [
          ['單引號 `\'`', '提早結束程式替值準備的字串，之後的字都被當成 SQL', '`alice\'` 讓字串在 alice 之後就結束'],
          ['註解 `--`', '從這裡到行尾都是註解，程式拼在後面的條件消失了（`/* … */` 是另一種註解）', '`AND password_hash = … AND active = 1` 全部失效'],
          ['`OR 條件`', 'AND 比 OR 先結合（DB03），加一個永遠成立的 `OR` 就能讓整個 WHERE 成立', '`\' OR 1=1 --` 讓每一列都符合'],
        ] },
        { type: 'example', id: 'inject-or' },
        { type: 'callout', tone: 'warning', title: '不知道任何帳號也能登入', text: '登入程式通常只拿查詢結果的第一列。上面的查詢傳回全部 5 列（連停用的 carol 也在內），第一列是 alice，而 alice 正好是管理員：攻擊者不需要知道任何帳號或密碼，就以管理員身分登入了。把 `OR 1=1` 換成 `OR active = 0`，拿到的就是本來不能登入的停用帳號。' },
      ],
    },
    {
      id: 'attack-shapes', title: 'UNION 洩漏與手工跳脫的極限',
      blocks: [
        { type: 'p', text: '繞過登入只是開始。只要查詢結果會顯示在頁面上，攻擊者就能用 `UNION`（DB02 的聯集）接上自己的 `SELECT`，把別的表的內容混進結果。條件是兩邊的欄位數相同（SQLite 不檢查型別，其他 DBMS 還要求對應欄位的型別相容）：搜尋頁的查詢有 `username`、`role` 兩欄，攻擊者就挑兩欄來接。下面是搜尋框輸入 `zzz\' UNION SELECT username, password_hash FROM users --` 之後拼出的查詢，`zzz` 讓原本的搜尋沒有結果，只剩偷來的資料：' },
        { type: 'example', id: 'inject-union' },
        { type: 'p', text: '「欄位數要一樣」也擋不住人：攻擊者可以一欄一欄試，欄位數不對時 SQLite 回報 `SELECTs to the left and right of UNION do not have the same number of result columns`，對了就成功。表名與欄名也不必猜，SQLite 的系統目錄 `sqlite_schema` 就有每張表的 `CREATE TABLE` 原文，輸入 `zzz\' UNION SELECT name, sql FROM sqlite_schema --` 就能列出整個綱要（其他 DBMS 有 `information_schema` 等系統目錄）。' },
        { type: 'p', text: '直覺的防法是「把輸入裡的單引號都換成兩個單引號」（SQL 字串裡 `\'\'` 代表一個單引號）。帳號輸入 `alice\' --` 會變成 `\'alice\'\' --\'`，整段都是字串的內容，查詢找不到這個帳號。可是這只保護「放在引號裡」的值。如果程式用帳號編號查詢，拼成 `WHERE id = ` 加上輸入，數字本來就不加引號，攻擊者也不需要任何引號：' },
        { type: 'example', id: 'inject-numeric' },
        { type: 'p', text: '手工跳脫還有其他漏洞，這也是為什麼不要自己寫跳脫函式：' },
        { type: 'list', items: [
          '每種 DBMS 的字串規則不同。MySQL 預設把字串裡的反斜線當成跳脫字元（開啟 `NO_BACKSLASH_ESCAPES` 才不會），SQLite 與 PostgreSQL（`standard_conforming_strings` 預設開啟）則不會。只會把 `\'` 變成 `\'\'` 的函式拿到 MySQL 上，輸入 `\\\' OR 1=1 -- ` 會變成 `\\\'\' OR 1=1 -- `：`\\\'` 是一個被跳脫的引號，接著的 `\'` 就結束了字串。',
          '只要有一處忘了跳脫，整個系統就有漏洞；一個程式有上百個查詢時，「每一處都記得」並不實際。',
          '二階注入（second-order injection）：值第一次被安全地存進資料庫，例如使用者名稱 `x\' OR \'1\'=\'1`；之後另一段程式從資料庫讀出它，以為「這是自己的資料」而拼進另一句 SQL，漏洞才發作。',
          '看不到結果也能攻擊。盲注（blind injection）只觀察頁面「有沒有結果」或回應花了多久，一次問一個是非題，慢慢把資料猜出來；把資料庫的錯誤訊息原文顯示給使用者，則等於直接告訴攻擊者查詢長什麼樣子。',
        ] },
        { type: 'callout', tone: 'note', title: '一次執行好幾個敘述（驅動程式的差異）', text: '輸入 `\'; DROP TABLE users; --` 想在同一次呼叫裡多執行一個敘述，成不成功取決於驅動程式的函式。實測 Python 的 `sqlite3`：`execute()` 一次只接受一個敘述，否則丟出 `ProgrammingError: You can only execute one statement at a time.`；但 `executescript()` 會執行整串。Node.js 的 `node:sqlite`：`prepare()` 只編譯第一個敘述，其餘被忽略；`exec()` 會執行整串。練習場也一次執行好幾個敘述。不論如何，`SELECT` 本身就能洩漏資料、繞過登入，限制敘述個數不是防禦。' },
      ],
    },
    {
      id: 'parameterized', title: '參數化查詢：值永遠只是值',
      blocks: [
        { type: 'p', text: '根本的修法是不要把值放進 SQL 文字。參數化查詢（parameterized query，也稱 prepared statement）的 SQL 文字是固定的，值的位置寫 `?`（佔位符號），值另外交給驅動程式綁定（bind）。SQLite 先把 `SELECT … WHERE username = ? AND password_hash = ?` 編譯好，查詢的結構在這一刻就決定了；之後綁定的值只會被當成「要比較的資料」，裡面有引號、`--`、`OR` 都只是字元。下面的程式用同樣的四組輸入，比較拼接與參數化兩種寫法：' },
        { type: 'example', id: 'login-concat-vs-param' },
        { type: 'p', text: '在練習場親手驗證一次，這也是本課的目標：' },
        { type: 'list', ordered: true, items: [
          '按「被繞過的登入（拼接出的 SQL）」執行，得到 alice：這是程式把 `alice\' --` 拼進去之後，資料庫實際收到的查詢。',
          '按「參數化登入」，在參數框依序填兩行：`alice\' --` 與 `guess`。結果是 0 列：資料庫找的是名字就叫 `alice\' --` 的帳號。',
          '參數改成 `alice` 與 `scrypt$9f2c1a77e0b4`（alice 的雜湊），結果是 alice 那一列；改填 `carol` 與她的雜湊 `scrypt$7b3e9d04c6f2`，結果是 0 列，因為 `active = 1` 這個條件還在，停用的帳號登入不了。',
        ] },
        { type: 'p', text: '不同的驅動程式用不同的佔位符號，但原則相同：SQL 文字裡只有佔位符號，值放在另一個引數。' },
        { type: 'table', head: ['驅動程式', '佔位符號', '要注意的'], rows: [
          ['SQLite（Python `sqlite3`、`node:sqlite`）、JDBC', '`?`；SQLite 也接受具名的 `:name`', 'JDBC 用 `PreparedStatement` 的 `setString(1, …)`，不要用 `Statement` 拼字串'],
          ['PostgreSQL 的 node-postgres', '`$1`、`$2`…', '值放在 `query(文字, [值…])` 的第二個引數'],
          ['Python 的 psycopg（PostgreSQL）', '`%s`', '`cur.execute("… = %s", (name,))` 是參數化；`cur.execute("… = %s" % name)` 是 Python 的字串格式化，等於拼接'],
        ] },
        { type: 'callout', tone: 'warning', title: '只有「值」能參數化', text: '佔位符號只能代表一個值，不能代表表名、欄名、`ASC`／`DESC` 或任何關鍵字。讓使用者選排序欄位時，寫 `ORDER BY ?` 再綁定 `username` 不會報錯，但 `?` 被當成一個常數字串，每一列的排序鍵都一樣，結果沒有依名稱排序。這類「結構」要用白名單：程式裡列出允許的選項，例如 `{"name": "username", "newest": "id DESC"}`，只接受清單裡的鍵，再把對應的固定文字放進 SQL；其他輸入一律拒絕。' },
        { type: 'p', text: '`LIKE` 搜尋是另一個陷阱。`WHERE username LIKE \'%\' || ? || \'%\'` 已經參數化，不會被注入，但值裡的 `%`、`_` 仍是萬用字元：使用者輸入 `_` 會配對到每一個至少一個字元的名稱，輸入 `%` 也一樣，搜尋框變成「列出全部」，在大表上還可能拖慢資料庫。要讓它們當普通字元，先跳脫再比對，並用 `ESCAPE` 指定跳脫字元：' },
        { type: 'table', head: ['做法', '寫法', '說明'], rows: [
          ['在 SQL 裡跳脫', '`username LIKE \'%\' || replace(replace(replace(?, \'\\\', \'\\\\\'), \'%\', \'\\%\'), \'_\', \'\\_\') || \'%\' ESCAPE \'\\\'`', '先把跳脫字元 `\\` 自己變成 `\\\\`，再把 `%`、`_` 前面加上 `\\`；順序不能顛倒，否則剛加上的 `\\` 又被重複跳脫'],
          ['在程式裡跳脫', '程式算出 `\'%\' + 跳脫後的關鍵字 + \'%\'`，SQL 寫 `username LIKE ? ESCAPE \'\\\'`', '跳脫規則相同，只是換到程式裡做；參數就是完整的樣式（pattern）'],
          ['不用 LIKE', '`instr(lower(username), lower(?)) > 0`', '`instr` 找的是一般的子字串，沒有萬用字元（SQLite 的函式）；`lower` 讓英文字母不分大小寫'],
        ] },
        { type: 'callout', tone: 'note', title: 'LIKE 與大小寫（SQLite）', text: 'SQLite 的 `LIKE` 預設對英文字母不分大小寫（`\'ALICE\' LIKE \'%al%\'` 成立），其他字元則要完全相同；`lower()` 也只轉換英文字母。PostgreSQL 的 `LIKE` 分大小寫，不分大小寫要用 `ILIKE`。SQLite 的 `ESCAPE` 只接受一個字元；本課用反斜線，因為它在 SQLite 的字串裡不是特殊字元，`\'\\\'` 就是一個反斜線。' },
      ],
    },
    {
      id: 'orm-safe-api', title: 'ORM 與查詢產生器：安全的 API 與危險的出口',
      blocks: [
        { type: 'p', text: '前一課介紹的 ORM 與查詢產生器（query builder）用程式語言的物件與方法描述查詢，再由函式庫產生參數化的 SQL，所以一般的查詢天生就安全。危險在於每一套 ORM 都提供「直接寫 SQL」的出口，給 ORM 表達不了的查詢用；出口本身沒有問題，問題是在出口裡拼接字串。下表是常見函式庫的寫法（示意，網站未執行；本課的程式範例只用驅動程式）：' },
        { type: 'table', head: ['函式庫', '安全的寫法', '有漏洞的寫法'], rows: [
          ['SQLAlchemy（Python）', '`select(User).where(User.username == name)`；需要原生 SQL 時 `text("SELECT … WHERE username = :name")` 並傳入 `{"name": name}`', '`text(f"SELECT … WHERE username = \'{name}\'")`：f-string 在送出前就把值拼進文字'],
          ['Django（Python）', '`User.objects.filter(username=name)`；`User.objects.raw("SELECT … WHERE username = %s", [name])`', '`User.objects.raw(f"SELECT … WHERE username = \'{name}\'")`'],
          ['JPA／Hibernate（Java）', '`em.createQuery("SELECT u FROM User u WHERE u.username = :name", User.class).setParameter("name", name)`', '`em.createQuery("SELECT u FROM User u WHERE u.username = \'" + name + "\'")`：JPQL 一樣會被注入'],
          ['Prisma（JavaScript）', '`prisma.user.findMany({ where: { username: name } })`；`$queryRaw` 搭配標籤模板（tagged template），`${name}` 會變成參數', '`$queryRawUnsafe(…)` 接受一整段字串：把 `name` 拼進去就有漏洞'],
        ] },
        { type: 'p', text: '辨認的規則和驅動程式一樣：看最後送到資料庫的 SQL 文字裡，有沒有可能出現使用者輸入的一部分。字串拼接、f-string、樣板字串、`%` 格式化、`String.format` 都是拼接；「先拼好再傳給一個安全的函式」也一樣不安全，因為傳進去的已經是被改寫過的 SQL。ORM 的排序、篩選欄位如果來自使用者（例如 `order_by(使用者給的欄名)`），一樣要用白名單。' },
        { type: 'callout', tone: 'tip', title: '程式碼審查時找什麼', text: '搜尋 `execute(`、`raw(`、`text(`、`query(`、`createQuery(`、`Unsafe` 這些出口，檢查每一個呼叫的第一個引數是不是固定的字串常數。不是常數的，就要說得出每一段文字從哪裡來，而且沒有一段來自使用者。' },
      ],
    },
    {
      id: 'least-privilege', title: '最小權限：GRANT、REVOKE 與角色',
      blocks: [
        { type: 'p', text: '參數化查詢擋住注入，但程式還可能有別的漏洞，帳號密碼也可能外洩。最小權限原則（principle of least privilege）是第二道防線：每個帳號只拿到工作需要的權限，這樣就算攻擊成功，能做的事也有限。如果登入服務連上資料庫的帳號只能讀 `users`、新增 `login_log`，攻擊者就無法 `DROP TABLE`，也改不了任何人的角色。' },
        { type: 'p', text: '有使用者帳號的 DBMS 用 `GRANT` 授予權限、`REVOKE` 收回權限；權限可以給個別帳號，也可以給角色（role），再把角色授予帳號，人員異動時只要調整角色成員。下表是 PostgreSQL 的寫法（SQLite 沒有使用者帳號，這段在練習場無法執行）：' },
        { type: 'table', head: ['PostgreSQL 敘述', '作用'], rows: [
          ['`CREATE ROLE app_read NOLOGIN;`', '建立一個不能登入的角色，當作權限的群組'],
          ['`GRANT SELECT ON user_directory TO app_read;`', '讓角色可以讀檢視表 `user_directory`。PostgreSQL 的檢視表預設以擁有者的權限讀取底下的表，所以不必給 `users` 本身的權限'],
          ['`CREATE ROLE login_svc LOGIN PASSWORD \'…\';`', '建立登入服務用的帳號（`CREATE USER` 等於 `CREATE ROLE … LOGIN`）；密碼放在祕密管理工具，不寫進程式碼'],
          ['`GRANT SELECT ON users TO login_svc;`', '登入服務需要讀帳號與雜湊，但沒有 `UPDATE`、`DELETE` 或 DDL 權限'],
          ['`GRANT app_read TO login_svc;`', '把角色授予帳號，`login_svc` 也取得 `app_read` 的權限'],
          ['`GRANT SELECT (id, username, role, active), UPDATE (active) ON users TO support;`', '欄位層級的權限：客服看得到帳號卻看不到 `password_hash`，也只能改 `active`'],
          ['`REVOKE UPDATE (active) ON users FROM support;`', '收回權限，之後 `support` 的 `UPDATE` 會被拒絕（permission denied）'],
          ['`GRANT SELECT ON users TO auditor WITH GRANT OPTION;`', '`WITH GRANT OPTION` 讓對方可以再轉授權限給別人，非必要不用'],
        ] },
        { type: 'p', text: 'PostgreSQL 新建的表只有擁有者（與超級使用者）能用，其他帳號要明確授權（除非事先用 `ALTER DEFAULT PRIVILEGES` 設定了預設權限）。實務上會把帳號依用途分開：建表、改綱要（migration）的帳號只在部署時使用；應用程式平常連線的帳號只有需要的 `SELECT`、`INSERT`、`UPDATE`、`DELETE`；報表與分析用唯讀帳號，最好連到唯讀的複本。PostgreSQL 還有列層級安全（row-level security，`CREATE POLICY`），限制一個帳號只看得到某些資料列。MySQL 的帳號寫成 `\'名稱\'@\'來源主機\'`，例如 `GRANT SELECT ON app.users TO \'report\'@\'10.0.0.%\';`，MySQL 8.0 起也支援角色。' },
        { type: 'p', text: 'SQLite 的資料庫是一個檔案，沒有帳號，也沒有 `GRANT`：能開啟檔案的程式就能讀寫每一張表。最小權限的想法仍然適用，只是落在別的地方。第一，用檢視表只露出需要的欄位與列（DB13），程式的唯讀部分只查檢視表：' },
        { type: 'example', id: 'view-directory' },
        { type: 'list', items: [
          '唯讀連線：只需要讀的程式以唯讀模式開啟檔案，例如 Python 的 `sqlite3.connect(\'file:app.db?mode=ro\', uri=True)`、Node.js 的 `new DatabaseSync(\'app.db\', { readOnly: true })`，任何寫入都得到 `attempt to write a readonly database`。',
          '`PRAGMA query_only = ON;` 讓目前這個連線拒絕所有修改（在練習場執行它之後再 `UPDATE`，會得到同樣的錯誤；`PRAGMA query_only = OFF;` 或「重設資料」恢復）。它防的是自己的程式寫錯，不是攻擊者：同一個連線也能把它關掉。',
          '檔案權限：資料庫檔與同一目錄裡的 `-wal`、`-shm`、`-journal` 檔只讓執行應用程式的作業系統帳號讀寫（例如 `chmod 600`），網頁伺服器不能直接提供下載。',
          '授權回呼：SQLite 的 C 介面可以註冊授權回呼（authorizer），對每個要讀寫的表與欄位決定允許或拒絕；Python 的 `sqlite3` 以 `set_authorizer()` 提供。',
        ] },
      ],
    },
    {
      id: 'password-hashing', title: '密碼雜湊：存「驗證得了」而不是「讀得回來」',
      blocks: [
        { type: 'p', text: '資料庫有一天可能被整份偷走：一個注入漏洞、一份外流的備份就夠了。密碼不能存明文，也不該「加密」存放，因為能解密就表示金鑰就在附近，偷得到資料的人往往也偷得到金鑰。登入時只需要「驗證」密碼對不對，所以存的是單向的雜湊值：從密碼算雜湊很容易，從雜湊算回密碼則沒有捷徑，只能一個一個猜。好的密碼雜湊有三個要素：' },
        { type: 'list', items: [
          '鹽（salt）：每個帳號一段隨機產生的值，和密碼一起算雜湊，並和雜湊存在一起。兩個人用同一個密碼，存的值也不同，攻擊者無法用預先算好的「密碼→雜湊」對照表一次破解所有人，只能逐一猜。',
          '刻意變慢：SHA-256、MD5 這類一般的雜湊函式設計得很快，攻擊者每秒能試極多個密碼。密碼要用專門的函式，例如 Argon2id、scrypt、bcrypt、PBKDF2，它們用可調的成本參數讓每次計算變慢（scrypt 與 Argon2 還需要大量記憶體），一次登入察覺不到，大量猜測則代價很高。',
          '固定時間的比較：驗證時用 Python 的 `hmac.compare_digest()`、Node.js 的 `crypto.timingSafeEqual()` 比較雜湊，比較所花的時間不會因為前面幾個位元組相同而改變。',
        ] },
        { type: 'p', text: '下面用標準函式庫的 scrypt（Python 的 `hashlib.scrypt`、Node.js 的 `crypto.scryptSync`，參數相同時結果相同）註冊兩個帳號，再用參數化查詢取出雜湊驗證登入。存的格式「`scrypt$鹽$雜湊`」是本課自訂的；實際的函式庫各有格式，通常也把成本參數一起記下，日後才能調高。為了讓輸出每次都一樣，範例用固定的鹽，這只能用在示範：實際系統每次都用 `os.urandom(16)` 或 `crypto.randomBytes(16)` 產生新的隨機鹽。' },
        { type: 'example', id: 'password-scrypt' },
        { type: 'p', text: 'alice 與 bob 的密碼相同，因為鹽不同，存下的雜湊完全不同。驗證時程式只用帳號名稱查詢（參數化），取出鹽與雜湊，把輸入的密碼用同一個鹽再算一次比較；帶鹽的雜湊無法在 SQL 的 `WHERE` 裡直接比對，因為得先取出那個帳號的鹽。三種存法的比較：' },
        { type: 'table', head: ['存法', '資料庫被偷走時'], rows: [
          ['明文，或可解密的加密', '密碼直接外洩，金鑰在附近就等於明文；而且很多人在別的網站用同一組密碼'],
          ['不加鹽的 SHA-256', '同密碼同雜湊，一眼看出誰用一樣的密碼；常見密碼查表即得，猜測也非常快'],
          ['每個帳號隨機的鹽＋scrypt／Argon2id 等慢速雜湊', '只能逐一帳號、逐一密碼地猜，每猜一次都要付出設定的成本；弱密碼仍可能被猜中，所以還需要密碼長度規則與登入次數限制'],
        ] },
        { type: 'callout', tone: 'note', title: '標準函式庫有什麼', text: 'Python 的 `hashlib` 有 `scrypt()`（需要以 OpenSSL 1.1 以上建置的 Python）與 `pbkdf2_hmac()`；Node.js 的 `crypto` 有 `scryptSync()` 與 `pbkdf2Sync()`。Java 的標準函式庫有 PBKDF2（`SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")`），沒有 scrypt。bcrypt 與 Argon2 在 Python 要用第三方套件（例如 `bcrypt`、`argon2-cffi`）。成本參數要依目前的硬體與資安建議調整，例如參考 OWASP 的密碼儲存建議，不要沿用多年前的數字。' },
      ],
    },
    {
      id: 'encryption-audit', title: '敏感欄位加密與稽核',
      blocks: [
        { type: 'p', text: '有些資料需要「讀得回來」：身分證字號、電話、地址。它們不能用雜湊，可以加密保存。加密發生在哪一層，決定它擋得住什麼：' },
        { type: 'table', head: ['做法', '擋得住', '擋不住'], rows: [
          ['磁碟或整個資料庫檔加密（例如商用 DBMS 的透明資料加密 TDE；SQLite 本身不加密，要用 SQLite Encryption Extension 或 SQLCipher 這類延伸版本）', '硬碟、檔案或備份被拿走', 'SQL injection：資料庫替任何合法的查詢解密，攻擊者透過應用程式拿到的是明文'],
          ['應用程式在寫入前加密欄位（例如 AES-GCM），金鑰放在金鑰管理服務或祕密管理工具', '資料庫被整份偷走、管理員或報表帳號直接查表', '應用程式本身被攻破、金鑰外洩；加密後的欄位也無法用 `WHERE`、`ORDER BY` 依內容查詢'],
          ['資料庫函式加密（例如 PostgreSQL 的 `pgcrypto` 延伸套件的 `pgp_sym_encrypt`）', '只讀到資料表的人', '金鑰會出現在 SQL 敘述與可能的查詢紀錄裡，要小心管理'],
        ] },
        { type: 'p', text: '最好的保護是根本不存：不需要的欄位不要收集，需要的只保留必要的部分（例如只存卡號末四碼），並記得備份、匯出檔與紀錄檔裡也有同樣的資料。' },
        { type: 'p', text: '稽核（audit）回答「誰在什麼時候做了什麼」，讓異常可以被發現、被追查。DB13 用觸發器寫稽核紀錄，同樣的做法可以記錄安全事件，例如密碼被更改。注意紀錄只記「發生了什麼事」，不要把雜湊或密碼本身複製進紀錄：' },
        { type: 'example', id: 'audit-password-change' },
        { type: 'p', text: '登入紀錄本身也是稽核資料。依帳號統計失敗次數，可以看出有人在猜密碼，或用不存在的帳號試探；實際系統會據此限制嘗試次數或暫時鎖定。' },
        { type: 'example', id: 'failed-logins' },
        { type: 'list', items: [
          '稽核紀錄要能防竄改：只能新增，不能修改或刪除（可以用觸發器擋下，見練習），並複製到攻擊者不容易碰到的地方，例如另一台紀錄伺服器。',
          'SQLite 沒有帳號，「是誰」要由應用程式寫入（例如目前登入者的 id）；有帳號的 DBMS 可以記錄資料庫帳號，PostgreSQL 另有 pgAudit 延伸套件記錄敘述層級的稽核。',
          '登入失敗時一律回應「帳號或密碼錯誤」，不要分別說「帳號不存在」或「密碼錯誤」，否則等於替攻擊者確認哪些帳號存在。',
        ] },
        { type: 'callout', tone: 'tip', title: '多道防線', text: '本課的做法各自擋一種失誤：參數化查詢讓輸入改不了查詢；最小權限讓被攻破的帳號做不了多少事；慢速加鹽雜湊讓被偷的密碼很難還原；欄位加密讓被偷的資料讀不懂；稽核讓事情發生後找得到。沒有一項是萬無一失的，所以要一起使用。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-predict-bypass', prompt: '登入程式用字串拼接組出下面的查詢：帳號框輸入的是 `x\' OR active = 0 --`，密碼算出的雜湊是 `guess`。在 `auth` 上執行，結果是什麼？',
      code: { language: 'SQL', text: 'SELECT id, username, role\nFROM users\nWHERE username = \'x\' OR active = 0 --\' AND password_hash = \'guess\' AND active = 1;' },
      options: [
        '0 列：沒有帳號叫 x，而且 `active = 1` 會排除停用的帳號',
        '1 列：已停用的 carol',
        '5 列：`OR` 讓每一列都符合',
        '語法錯誤：引號沒有成對',
      ],
      answer: 1, explanation: '`--` 把同一行後面的 `AND password_hash = … AND active = 1` 都變成註解，實際的條件只剩 `username = \'x\' OR active = 0`，符合的是停用的 carol。以為是 0 列，是沒看到 `active = 1` 已經在註解裡；5 列是把 `active = 0` 當成永遠成立（那是 `OR 1=1`）；也沒有語法錯誤，輸入的單引號正好結束了程式準備的字串，多出來的那個引號在註解裡。',
    },
    {
      id: 'q-escape-numeric', prompt: '程式在拼接之前，把輸入裡的每個單引號都換成兩個單引號，再拼成 `SELECT username, role FROM users WHERE id = ` 加上輸入。哪一個輸入仍能讓 `auth` 的查詢傳回所有帳號？',
      options: [
        '`1\' OR \'1\'=\'1`',
        '`bob\' --`',
        '`0 OR 1=1`',
        '`2 -- \'`',
      ],
      answer: 2, explanation: '數字不加引號，`0 OR 1=1` 不含任何引號，跳脫函式什麼都沒改，拼出 `WHERE id = 0 OR 1=1`，5 列全部傳回。`1\' OR \'1\'=\'1` 被換成 `1\'\' OR \'\'1\'\'=\'\'1`，`bob\' --` 變成 `bob\'\' --`，兩者在 SQLite 都是語法錯誤（`near "\'\'": syntax error`），不會傳回資料；`2 -- \'` 只是 `WHERE id = 2` 加一段註解，查到 bob 一列。跳脫引號只保護放在引號裡的值，參數化查詢才不分值的種類。',
    },
    {
      id: 'q-union-columns', prompt: '搜尋頁拼出 `SELECT username, role FROM users WHERE username LIKE \'%` ＋ 輸入 ＋ `%\'`，並把結果顯示在頁面上。在 `auth` 上，哪一個輸入能在沒有錯誤的情況下讓頁面顯示密碼雜湊？',
      options: [
        '`\' UNION SELECT password_hash FROM users --`',
        '`\' UNION SELECT * FROM users --`',
        '`\' OR 1=1 --`',
        '`\' UNION SELECT username, password_hash FROM users --`',
      ],
      answer: 3, explanation: '原查詢有 2 欄，`UNION` 的另一邊也要 2 欄：`username, password_hash` 符合，雜湊出現在 `role` 那一欄。只選 1 欄或用 `*`（`users` 有 5 欄）都會得到 `SELECTs to the left and right of UNION do not have the same number of result columns`；`OR 1=1` 列出所有帳號，但頁面上只有 `username` 與 `role`，看不到雜湊。',
    },
    {
      id: 'q-order-by-param', prompt: '為了避免注入，程式把使用者選的排序欄位也參數化：執行下面的查詢並綁定值 `\'username\'`。在 SQLite 上結果是什麼？',
      code: { language: 'SQL', text: 'SELECT username FROM users ORDER BY ?;' },
      options: [
        '依 `username` 由小到大排序',
        '錯誤：`ORDER BY` 不能使用參數',
        '依第一個欄位排序，因為 `?` 被當成欄位編號',
        '沒有錯誤，但不會依 `username` 排序：`?` 是一個常數字串，每一列的排序鍵都相同',
      ],
      answer: 3, explanation: '佔位符號只能代表值，綁進去的 `\'username\'` 是一段文字，不是欄名；每一列都用同一個常數排序，等於沒有指定順序，SQLite 也不報錯，所以這種錯誤很難發現。它不是欄位編號：只有直接寫在 SQL 裡的整數（例如 `ORDER BY 1`）才代表欄位位置。正確做法是白名單：程式把允許的選項對應到固定的欄名文字。',
    },
    {
      id: 'q-like-wildcard', prompt: '搜尋框的查詢已經參數化。使用者在搜尋框輸入 `_`（一個底線），在 `auth` 上會傳回幾列？（沒有任何帳號名稱含底線。）',
      code: { language: 'SQL', text: 'SELECT username FROM users\nWHERE username LIKE \'%\' || ? || \'%\';' },
      options: [
        '0 列，沒有名稱含底線',
        '5 列，每個帳號都符合',
        '錯誤，`_` 必須跳脫',
        '1 列，只有名稱最短的 bob',
      ],
      answer: 1, explanation: '參數化擋住了注入，但值仍然是 `LIKE` 的樣式：`_` 代表任一個字元，`%_%` 配對所有至少一個字元的名稱，5 個帳號全部符合。以為是 0 列，是把 `_` 當成普通字元，要那樣就得先跳脫並加上 `ESCAPE`；`LIKE` 的樣式裡出現 `_` 不是錯誤；`_` 也不是「最短」的意思，它只要求那個位置有一個字元。',
    },
    {
      id: 'q-least-privilege', prompt: '客服後台要能查看帳號的 `id`、`username`、`role`、`active`，並能停用或啟用帳號（只改 `active`），但不能看到密碼雜湊。在 PostgreSQL 上，哪一個授權最符合最小權限？',
      options: [
        '`GRANT SELECT, UPDATE ON users TO support;`',
        '`GRANT SELECT (id, username, role, active), UPDATE (active) ON users TO support;`',
        '`GRANT ALL PRIVILEGES ON users TO support WITH GRANT OPTION;`',
        '`GRANT SELECT (id, username, role, active) ON users TO support;`',
      ],
      answer: 1, explanation: '欄位層級的 `SELECT` 讓客服讀得到需要的四欄、讀不到 `password_hash`；`UPDATE (active)` 只能改 `active`，`UPDATE users SET active = 0 WHERE id = 3` 用到的 `id` 也在可讀的欄位裡。整張表的 `SELECT, UPDATE` 讓客服看到雜湊、還能把自己改成管理員；`ALL PRIVILEGES … WITH GRANT OPTION` 連刪除與轉授權限都給了；只給 `SELECT` 則停用帳號時會被拒絕，權限不夠完成工作。',
    },
    {
      id: 'q-password-storage', prompt: '一個網站的資料庫備份外流了。下面四種存密碼的方式，哪一種讓攻擊者最難從備份還原使用者的密碼？',
      options: [
        '用 AES 加密密碼，金鑰寫在應用程式的設定檔裡',
        '存 SHA-256(密碼)，所有帳號用同一個算法、不加鹽',
        '每個帳號產生隨機的鹽，存 scrypt(密碼, 鹽) 與鹽',
        '存明文，但資料庫只有管理員帳號能讀',
      ],
      answer: 2, explanation: '隨機的鹽讓同樣的密碼得到不同的雜湊，查表無效、只能逐一帳號猜；scrypt 刻意變慢又需要記憶體，每猜一次都有代價。AES 加密可以解密，設定檔常和備份一起外流，拿到金鑰就等於明文；不加鹽的 SHA-256 一眼看出誰用相同密碼，常見密碼查表即得，計算又極快；明文的權限設定在備份外流時毫無作用，備份裡就是明文。',
    },
  ],
  sql: {
    dataset: 'auth',
    params: true,
    presets: [
      { label: '被繞過的登入（拼接出的 SQL）', sql: sql`SELECT id, username, role
FROM users
WHERE username = 'alice' --' AND password_hash = 'guess' AND active = 1;` },
      { label: '參數化登入（參數框填帳號與雜湊兩行）', sql: sql`SELECT id, username, role
FROM users
WHERE username = ? AND password_hash = ? AND active = 1;` },
      { label: 'UNION 帶出雜湊（拼接出的 SQL）', sql: sql`SELECT username, role FROM users
WHERE username LIKE '%zzz' UNION SELECT username, password_hash FROM users --%' ORDER BY username;` },
      { label: '安全的搜尋（參數框填關鍵字）', sql: sql`SELECT username, role
FROM users
WHERE username LIKE
  '%' || replace(replace(replace(IFNULL(?, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ESCAPE '\'
ORDER BY username;` },
      { label: '只露出安全欄位的檢視表（可重複執行）', sql: sql`DROP VIEW IF EXISTS user_directory;
CREATE VIEW user_directory AS
SELECT id, username, role
FROM users
WHERE active = 1;
SELECT * FROM user_directory ORDER BY id;` },
      { label: '登入失敗統計', sql: sql`SELECT COALESCE(u.username, '（不存在的帳號）') AS account,
  SUM(l.ok = 0) AS failures
FROM login_log l
LEFT JOIN users u ON u.id = l.user_id
GROUP BY l.user_id
ORDER BY failures DESC, account;` },
    ],
    examples: [
      {
        id: 'inject-comment', title: '註解讓密碼檢查消失', dataset: 'auth',
        description: '帳號輸入 `alice\' --`、密碼隨便打，程式拼出的就是下面這句。輸入裡的單引號結束了帳號字串，`--` 把後面的密碼與啟用檢查變成註解，資料庫只檢查帳號名稱，傳回 alice。',
        sql: sql`SELECT id, username, role
FROM users
WHERE username = 'alice' --' AND password_hash = 'guess' AND active = 1;`,
        result: { columns: ['id', 'username', 'role'], rows: [[1, 'alice', 'admin']] },
      },
      {
        id: 'inject-or', title: 'OR 1=1：不需要知道任何帳號', dataset: 'auth',
        description: '帳號輸入 `\' OR 1=1 --`。條件變成「帳號是空字串，或 1=1」，每一列都符合，連已停用的 carol 也被傳回。',
        sql: sql`SELECT id, username, role
FROM users
WHERE username = '' OR 1=1 --' AND password_hash = 'guess' AND active = 1;`,
        result: { columns: ['id', 'username', 'role'], rows: [[1, 'alice', 'admin'], [2, 'bob', 'member'], [3, 'carol', 'member'], [4, 'dave', 'member'], [5, 'eve', 'member']] },
      },
      {
        id: 'inject-union', title: 'UNION 把密碼雜湊帶到搜尋結果裡', dataset: 'auth',
        description: '搜尋頁拼出 `… WHERE username LIKE \'%` ＋ 關鍵字 ＋ `%\' ORDER BY username`。關鍵字 `zzz\' UNION SELECT username, password_hash FROM users --` 接上第二個查詢，雜湊出現在原本顯示角色的欄位；程式原本的 `ORDER BY` 也在註解裡。',
        sql: sql`SELECT username, role FROM users
WHERE username LIKE '%zzz' UNION SELECT username, password_hash FROM users --%' ORDER BY username;`,
        result: { columns: ['username', 'role'], rows: [['alice', 'scrypt$9f2c1a77e0b4'], ['bob', 'scrypt$41d8e3c2a915'], ['carol', 'scrypt$7b3e9d04c6f2'], ['dave', 'scrypt$c58a12f9e3d7'], ['eve', 'scrypt$0e6f4b8d2a13']] },
      },
      {
        id: 'inject-numeric', title: '數字欄位不需要引號就能注入', dataset: 'auth',
        description: '程式把帳號編號拼在 `WHERE id = ` 後面，並把單引號都跳脫掉。輸入 `2 UNION SELECT username, password_hash FROM users` 一個引號都沒有，跳脫函式毫無作用：除了 bob 本來的那一列，每個帳號的雜湊都被帶出來。',
        sql: sql`SELECT username, role
FROM users
WHERE id = 2 UNION SELECT username, password_hash FROM users;`,
        result: { columns: ['username', 'role'], rows: [['alice', 'scrypt$9f2c1a77e0b4'], ['bob', 'member'], ['bob', 'scrypt$41d8e3c2a915'], ['carol', 'scrypt$7b3e9d04c6f2'], ['dave', 'scrypt$c58a12f9e3d7'], ['eve', 'scrypt$0e6f4b8d2a13']] },
      },
      {
        id: 'view-directory', title: '檢視表只露出需要的欄位與列', dataset: 'auth',
        description: '`user_directory` 只有啟用中的帳號，而且沒有 `password_hash`。程式中只需要列出帳號的部分改查這個檢視表；在有帳號的 DBMS 上，再只把檢視表的 `SELECT` 權限授予那個程式的帳號。',
        sql: sql`CREATE VIEW user_directory AS
SELECT id, username, role
FROM users
WHERE active = 1;
SELECT * FROM user_directory ORDER BY id;`,
        result: { columns: ['id', 'username', 'role'], rows: [[1, 'alice', 'admin'], [2, 'bob', 'member'], [4, 'dave', 'member'], [5, 'eve', 'member']] },
      },
      {
        id: 'audit-password-change', title: '觸發器記錄密碼被更改', dataset: 'auth',
        description: 'bob 換了密碼，留下一筆 `password_changed`；dave 的 `SET password_hash = password_hash` 值沒有變，`WHEN` 不成立，不留紀錄。紀錄裡沒有任何雜湊。`at` 欄的預設值是執行當下的 UTC 時間，每次不同，所以查詢沒有列出它。',
        sql: sql`CREATE TABLE security_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER log_password_change
AFTER UPDATE OF password_hash ON users
FOR EACH ROW
WHEN NEW.password_hash <> OLD.password_hash
BEGIN
  INSERT INTO security_events (user_id, event)
  VALUES (OLD.id, 'password_changed');
END;
UPDATE users SET password_hash = 'scrypt$5d0e7c3a9b21' WHERE username = 'bob';
UPDATE users SET password_hash = password_hash WHERE username = 'dave';
SELECT e.id, u.username, e.event
FROM security_events e
JOIN users u ON u.id = e.user_id
ORDER BY e.id;`,
        result: { columns: ['id', 'username', 'event'], rows: [[1, 'bob', 'password_changed']] },
      },
      {
        id: 'failed-logins', title: '從登入紀錄看出異常', dataset: 'auth',
        description: '依帳號統計失敗與成功的次數。`LEFT JOIN` 保留了 `user_id` 是 NULL 的那一筆（有人用不存在的帳號嘗試），`GROUP BY l.user_id` 把它歸成一組。`SUM(l.ok = 0)` 數的是失敗次數：比較的結果是 1 或 0。',
        sql: sql`SELECT COALESCE(u.username, '（不存在的帳號）') AS account,
  SUM(l.ok = 0) AS failures,
  SUM(l.ok = 1) AS successes,
  MAX(l.at) AS last_attempt
FROM login_log l
LEFT JOIN users u ON u.id = l.user_id
GROUP BY l.user_id
ORDER BY failures DESC, account;`,
        result: { columns: ['account', 'failures', 'successes', 'last_attempt'], rows: [
          ['bob', 1, 1, '2026-10-01 09:06'], ['carol', 1, 0, '2026-10-02 10:00'], ['（不存在的帳號）', 1, 0, '2026-10-01 09:30'],
          ['alice', 0, 1, '2026-10-01 09:00'], ['dave', 0, 1, '2026-10-02 11:15']] },
      },
    ],
    exercises: [
      {
        id: 'ex-login-param', title: '把登入查詢改成參數化',
        statement: '寫出登入程式要送出的參數化查詢：第一個 `?` 是使用者輸入的帳號名稱，第二個 `?` 是程式算好的密碼雜湊。只有在帳號名稱與雜湊都符合、而且帳號是啟用中（`active = 1`）時，才傳回那一個帳號的 `id`、`username`、`role`（依這個順序、用這些欄名）；否則不傳回任何列。檢查時會以多組參數執行你的查詢，包括惡意輸入；SQL 裡不要寫死任何帳號或雜湊。',
        dataset: 'auth', hidden: ['auth-b'], ordered: false, columnNames: true,
        starter: sql`SELECT id, username, role
FROM users
WHERE ...;`,
        hints: [
          '值的位置寫 `?`，不加引號：`username = ?`。加了引號的 `\'?\'` 是一個內容為問號的字串，不是佔位符號。',
          '參數依出現的順序綁定：第一個 `?` 拿到帳號名稱，第二個拿到雜湊，所以先寫帳號的條件。',
          '三個條件都要成立，用 `AND` 連接；停用的帳號即使帳號與雜湊都對，也不能登入。',
        ],
        solution: sql`SELECT id, username, role
FROM users
WHERE username = ? AND password_hash = ? AND active = 1;`,
        alternatives: [
          sql`SELECT id, username, role
FROM users
WHERE (username, password_hash) = (?, ?)
  AND active = 1;`,
          sql`SELECT u.id, u.username, u.role
FROM users AS u
WHERE u.active = 1
  AND u.username = ?
  AND u.password_hash = ?;`,
        ],
        mistakes: [
          { sql: sql`SELECT id, username, role
FROM users
WHERE username = 'alice' --' AND password_hash = ? AND active = 1;`, why: '這是把攻擊輸入拼進去之後的文字，不是修正：`--` 之後的 `?` 在註解裡，查詢根本沒有參數，不論輸入什麼都傳回 alice。在「alice 與錯的雜湊」這組參數就不該登入成功。' },
          { sql: sql`SELECT id, username, role
FROM users
WHERE username = ? OR password_hash = ? AND active = 1;`, why: '`AND` 比 `OR` 先結合，這個條件是「帳號符合，或（雜湊符合且啟用）」：只要帳號名稱對，密碼錯也能登入（「alice 與錯的雜湊」傳回 alice），停用的 carol 也能登入。參數化擋得住注入，擋不住自己寫錯的邏輯。' },
          { sql: sql`SELECT id, username, role
FROM users
WHERE username = ? AND password_hash = ?;`, why: '少了 `active = 1`：停用的 carol 用正確的雜湊仍然登入成功。' },
        ],
        paramSets: [
          { label: 'alice 與正確的雜湊', values: ['alice', 'scrypt$9f2c1a77e0b4'] },
          { label: 'alice 與錯的雜湊', values: ['alice', 'scrypt$000000000000'] },
          { label: "惡意輸入 alice' --", values: ["alice' --", 'guess'] },
          { label: "惡意輸入 ' OR '1'='1", values: ["' OR '1'='1", "' OR '1'='1"] },
          { label: '停用的 carol 與她的雜湊', values: ['carol', 'scrypt$7b3e9d04c6f2'] },
          { label: 'bob 與正確的雜湊', values: ['bob', 'scrypt$41d8e3c2a915'], hidden: true },
          { label: '管理員 admin 與正確的雜湊', values: ['admin', 'scrypt$aa01bb02cc03'], hidden: true },
          { label: '停用的 grace 與她的雜湊', values: ['grace', 'scrypt$1a2b3c4d5e6f'], hidden: true },
          { label: 'frank 與別人的雜湊', values: ['frank', 'scrypt$aa01bb02cc03'], hidden: true },
          { label: "惡意輸入 admin' --", values: ["admin' --", 'guess'], hidden: true },
        ],
      },
      {
        id: 'ex-safe-search', title: '萬用字元不會失控的搜尋',
        statement: '搜尋框的關鍵字是查詢唯一的參數 `?`。列出 `username` 含有關鍵字的帳號的 `username`、`role`（依這個順序、用這些欄名），依 `username` 由小到大排列。規則：一、英文字母不分大小寫；二、關鍵字裡的 `%` 與 `_` 是普通字元，例如輸入 `_` 只找名稱真的含底線的帳號；三、關鍵字是 NULL（搜尋框沒填）時列出所有帳號。檢查時會以多組參數執行，包括萬用字元與惡意輸入。',
        dataset: 'auth', hidden: ['auth-b'], ordered: true, columnNames: true,
        starter: sql`SELECT username, role
FROM users
WHERE username LIKE ...
ORDER BY username;`,
        hints: [
          '`IFNULL(?, \'\')` 把 NULL 換成空字串；`\'%\' || \'\' || \'%\'` 是 `%%`，配對所有名稱。',
          '用 `replace()` 在 `%` 與 `_` 前面加上跳脫字元，並在 `LIKE` 後面寫 `ESCAPE \'\\\'`；跳脫字元本身要最先處理：`replace(x, \'\\\', \'\\\\\')`。',
          '也可以不用 `LIKE`：`instr(lower(username), lower(…)) > 0` 找的是一般的子字串，沒有萬用字元。',
        ],
        solution: sql`SELECT username, role
FROM users
WHERE username LIKE
  '%' || replace(replace(replace(IFNULL(?, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ESCAPE '\'
ORDER BY username;`,
        alternatives: [
          sql`SELECT username, role
FROM users
WHERE instr(lower(username), lower(IFNULL(?, ''))) > 0
ORDER BY username;`,
          sql`SELECT username, role
FROM users
WHERE username LIKE
  '%' || replace(replace(replace(COALESCE(?, ''), '!', '!!'), '%', '!%'), '_', '!_') || '%'
  ESCAPE '!'
ORDER BY username;`,
        ],
        mistakes: [
          { sql: sql`SELECT username, role
FROM users
WHERE username LIKE '%a%'
ORDER BY username;`, why: '把關鍵字寫死成 `a`：查詢沒有參數，不論搜尋什麼都傳回同樣三個帳號，在關鍵字 `E` 這組就錯了。' },
          { sql: sql`SELECT username, role
FROM users
WHERE username LIKE '%' || IFNULL(?, '') || '%'
ORDER BY username;`, why: '已經參數化，不會被注入，但沒有跳脫萬用字元：關鍵字 `%` 變成 `%%%`，每個帳號都符合，搜尋框成了「列出全部」。' },
          { sql: sql`SELECT username, role
FROM users
WHERE username LIKE
  '%' || replace(replace(replace(?, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ESCAPE '\'
ORDER BY username;`, why: '沒有處理 NULL：`\'%\' || NULL` 的結果是 NULL，`LIKE NULL` 不成立（DB03），搜尋框沒填時一個帳號都查不到，規則三要求列出全部。' },
        ],
        paramSets: [
          { label: '關鍵字 a', values: ['a'] },
          { label: '大寫的 E', values: ['E'] },
          { label: '萬用字元 %', values: ['%'] },
          { label: "惡意輸入 ' OR '1'='1", values: ["' OR '1'='1"] },
          { label: '沒填（NULL）', values: [null] },
          { label: '萬用字元 _', values: ['_'], hidden: true },
          { label: '關鍵字 AD', values: ['AD'], hidden: true },
          { label: "惡意輸入 %' OR 1=1 --", values: ["%' OR 1=1 --"], hidden: true },
          { label: '空字串', values: [''], hidden: true },
        ],
      },
      {
        id: 'ex-privilege-audit', title: '權限異動稽核，而且紀錄不能竄改',
        statement: '在 `auth` 上做三件事。一、建立稽核表 `privilege_audit`，欄位有 `id`（整數主鍵，自動編號）、`user_id`、`old_role`、`new_role`、`old_active`、`new_active`。二、建立觸發器：`users` 的 `role` 或 `active` 被 `UPDATE` 而且值真的改變時（任一個改變就算），新增一筆紀錄，`user_id` 是那個帳號的 `id`，其他四欄是修改前後的 `role` 與 `active`（沒改變的那一個也照記）；只改 `password_hash` 或 `username`，或改完值沒有變，都不留紀錄。三、稽核紀錄只能新增：對 `privilege_audit` 的 `UPDATE` 與 `DELETE` 都要被拒絕（用觸發器與 `RAISE(ABORT, …)`，訊息自訂）。檢查時會執行幾個修改，依 `id` 列出紀錄的 `user_id`、`old_role`、`new_role`、`old_active`、`new_active`，再嘗試修改與刪除紀錄。',
        dataset: 'auth', hidden: ['auth-b'], ordered: true, columnNames: true,
        starter: sql`CREATE TABLE privilege_audit (
  id INTEGER PRIMARY KEY,
  ...
);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role, active ON users
FOR EACH ROW
WHEN ...
BEGIN
  ...
END;
CREATE TRIGGER no_audit_update
BEFORE UPDATE ON privilege_audit
BEGIN
  ...
END;`,
        hints: [
          '`AFTER UPDATE OF role, active` 只要 `SET` 裡有其中一欄就觸發；值有沒有變要用 `WHEN NEW.role <> OLD.role OR NEW.active <> OLD.active` 判斷，兩個改變之間是「或」。',
          '一個觸發器只對應一種事件：擋 `UPDATE` 與擋 `DELETE` 要各建一個 `BEFORE` 觸發器，本體是 `SELECT RAISE(ABORT, \'稽核紀錄不能修改\');`。',
          '`RAISE(ABORT, …)` 讓整個敘述失敗並撤銷它已做的修改，所以 `DELETE FROM privilege_audit;` 一列都刪不掉。',
        ],
        solution: sql`CREATE TABLE privilege_audit (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  old_role TEXT NOT NULL,
  new_role TEXT NOT NULL,
  old_active INTEGER NOT NULL,
  new_active INTEGER NOT NULL
);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role, active ON users
FOR EACH ROW
WHEN NEW.role <> OLD.role OR NEW.active <> OLD.active
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  VALUES (OLD.id, OLD.role, NEW.role, OLD.active, NEW.active);
END;
CREATE TRIGGER no_audit_update
BEFORE UPDATE ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, '稽核紀錄不能修改');
END;
CREATE TRIGGER no_audit_delete
BEFORE DELETE ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, '稽核紀錄不能刪除');
END;`,
        alternatives: [
          sql`CREATE TABLE privilege_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  old_role TEXT,
  new_role TEXT,
  old_active INTEGER,
  new_active INTEGER,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER audit_privileges
AFTER UPDATE ON users
WHEN NEW.role IS NOT OLD.role OR NEW.active IS NOT OLD.active
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  VALUES (NEW.id, OLD.role, NEW.role, OLD.active, NEW.active);
END;
CREATE TRIGGER audit_append_only_u
BEFORE UPDATE OF user_id, old_role, new_role, old_active, new_active, id ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, 'append only');
END;
CREATE TRIGGER audit_append_only_d
BEFORE DELETE ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, 'append only');
END;`,
          sql`CREATE TABLE privilege_audit (id INTEGER PRIMARY KEY, user_id INTEGER, old_role TEXT, new_role TEXT, old_active INTEGER, new_active INTEGER);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role, active ON users
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  SELECT OLD.id, OLD.role, NEW.role, OLD.active, NEW.active
  WHERE NEW.role <> OLD.role OR NEW.active <> OLD.active;
END;
CREATE TRIGGER no_audit_delete
AFTER DELETE ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, '稽核紀錄不能刪除');
END;
CREATE TRIGGER no_audit_update
AFTER UPDATE ON privilege_audit
BEGIN
  SELECT RAISE(ABORT, '稽核紀錄不能修改');
END;`,
        ],
        mistakes: [
          { sql: sql`CREATE TABLE privilege_audit (id INTEGER PRIMARY KEY, user_id INTEGER, old_role TEXT, new_role TEXT, old_active INTEGER, new_active INTEGER);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role, active ON users
WHEN NEW.role <> OLD.role AND NEW.active <> OLD.active
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  VALUES (OLD.id, OLD.role, NEW.role, OLD.active, NEW.active);
END;
CREATE TRIGGER no_audit_update BEFORE UPDATE ON privilege_audit BEGIN SELECT RAISE(ABORT, 'no'); END;
CREATE TRIGGER no_audit_delete BEFORE DELETE ON privilege_audit BEGIN SELECT RAISE(ABORT, 'no'); END;`, why: '條件寫成 `AND`：只有角色與啟用狀態「同時」改變才記錄。把一般會員升成管理員（只改 `role`）這種最該稽核的異動反而沒有紀錄。' },
          { sql: sql`CREATE TABLE privilege_audit (id INTEGER PRIMARY KEY, user_id INTEGER, old_role TEXT, new_role TEXT, old_active INTEGER, new_active INTEGER);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role ON users
WHEN NEW.role <> OLD.role
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  VALUES (OLD.id, OLD.role, NEW.role, OLD.active, NEW.active);
END;
CREATE TRIGGER no_audit_update BEFORE UPDATE ON privilege_audit BEGIN SELECT RAISE(ABORT, 'no'); END;
CREATE TRIGGER no_audit_delete BEFORE DELETE ON privilege_audit BEGIN SELECT RAISE(ABORT, 'no'); END;`, why: '`UPDATE OF role` 只看 `role`：只改 `active` 的 `UPDATE`（停用帳號）根本不會觸發，停用紀錄全部漏掉。' },
          { sql: sql`CREATE TABLE privilege_audit (id INTEGER PRIMARY KEY, user_id INTEGER, old_role TEXT, new_role TEXT, old_active INTEGER, new_active INTEGER);
CREATE TRIGGER audit_privileges
AFTER UPDATE OF role, active ON users
WHEN NEW.role <> OLD.role OR NEW.active <> OLD.active
BEGIN
  INSERT INTO privilege_audit (user_id, old_role, new_role, old_active, new_active)
  VALUES (OLD.id, OLD.role, NEW.role, OLD.active, NEW.active);
END;`, why: '紀錄寫對了，但沒有保護：`DELETE FROM privilege_audit;` 被接受，取得權限的攻擊者可以先把自己升為管理員，再刪掉證據。' },
        ],
        probes: [
          { label: '最後一位啟用中的會員升為管理員', sql: sql`UPDATE users SET role = 'admin' WHERE id = (SELECT MAX(id) FROM users WHERE role = 'member' AND active = 1);` },
          { label: '停用其餘啟用中的會員', sql: sql`UPDATE users SET active = 0 WHERE role = 'member' AND active = 1;` },
          { label: '只改密碼雜湊', sql: sql`UPDATE users SET password_hash = 'scrypt$000000000000' WHERE active = 1;` },
          { label: '角色與啟用狀態寫回原值', sql: sql`UPDATE users SET role = role, active = active;` },
          { label: '列出稽核紀錄', sql: sql`SELECT user_id, old_role, new_role, old_active, new_active FROM privilege_audit ORDER BY id;` },
          { label: '竄改紀錄', sql: sql`UPDATE privilege_audit SET new_role = 'member';` },
          { label: '刪除紀錄', sql: sql`DELETE FROM privilege_audit;` },
          { label: '紀錄筆數', sql: sql`SELECT COUNT(*) FROM privilege_audit;` },
          { label: '編號最小的帳號同時改角色與狀態', sql: sql`UPDATE users SET role = CASE role WHEN 'admin' THEN 'member' ELSE 'admin' END, active = 1 - active WHERE id = (SELECT MIN(id) FROM users);`, hidden: true },
          { label: '停用所有管理員', sql: sql`UPDATE users SET active = 0 WHERE role = 'admin';`, hidden: true },
          { label: '只改帳號名稱', sql: sql`UPDATE users SET username = username || '_old' WHERE active = 0;`, hidden: true },
          { label: '再列出稽核紀錄', sql: sql`SELECT user_id, old_role, new_role, old_active, new_active FROM privilege_audit ORDER BY id;`, hidden: true },
          { label: '刪除一筆紀錄', sql: sql`DELETE FROM privilege_audit WHERE id = (SELECT MAX(id) FROM privilege_audit);`, hidden: true },
        ],
      },
    ],
  },
  driverCode: {
    examples: [
      {
        id: 'login-concat-vs-param', title: '同一個登入功能：拼接與參數化',
        description: '`login_unsafe` 把輸入拼進 SQL 文字，`login_safe` 用 `?` 加上另外傳入的值。正常登入與密碼錯誤時兩者結果相同，差別只在惡意輸入：拼接的版本讓 `alice\' --` 與 `\' OR 1=1 --` 都登入成功（後者拿到第一列，也就是管理員 alice），參數化的版本把它們當成不存在的帳號名稱。最後印出的是拼接版本收到 `\' OR 1=1 --` 時實際送出的 SQL。',
        code: {
          Python: String.raw`import sqlite3

db = sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL
);
INSERT INTO users VALUES
  (1, 'alice', 'scrypt$9f2c1a77e0b4', 'admin', 1),
  (2, 'bob', 'scrypt$41d8e3c2a915', 'member', 1),
  (3, 'carol', 'scrypt$7b3e9d04c6f2', 'member', 0);
""")

def login_unsafe(username, password_hash):
    # 有漏洞：把輸入直接拼進 SQL 文字
    sql = ("SELECT username, role FROM users WHERE username = '" + username
           + "' AND password_hash = '" + password_hash + "' AND active = 1")
    return sql, db.execute(sql).fetchone()

def login_safe(username, password_hash):
    # 修正：SQL 文字固定，值由驅動程式另外綁定到 ?
    sql = 'SELECT username, role FROM users WHERE username = ? AND password_hash = ? AND active = 1'
    return db.execute(sql, (username, password_hash)).fetchone()

def show(row):
    return f'登入成功 {row[0]} ({row[1]})' if row else '登入失敗'

attempts = [('alice', 'scrypt$9f2c1a77e0b4'), ('alice', 'guess'), ("alice' --", 'guess'), ("' OR 1=1 --", 'guess')]
for username, password_hash in attempts:
    sql, row = login_unsafe(username, password_hash)
    print(f'輸入 {username} / {password_hash}')
    print(f'  拼接：{show(row)}')
    print(f'  參數化：{show(login_safe(username, password_hash))}')
print('最後一次拼接出的 SQL：')
print(sql)
`,
          JavaScript: String.raw`const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(` + '`' + String.raw`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL
);
INSERT INTO users VALUES
  (1, 'alice', 'scrypt$9f2c1a77e0b4', 'admin', 1),
  (2, 'bob', 'scrypt$41d8e3c2a915', 'member', 1),
  (3, 'carol', 'scrypt$7b3e9d04c6f2', 'member', 0);
` + '`' + String.raw`);

function loginUnsafe(username, passwordHash) {
  // 有漏洞：把輸入直接拼進 SQL 文字
  const sql = "SELECT username, role FROM users WHERE username = '" + username
    + "' AND password_hash = '" + passwordHash + "' AND active = 1";
  return [sql, db.prepare(sql).get()];
}

function loginSafe(username, passwordHash) {
  // 修正：SQL 文字固定，值由驅動程式另外綁定到 ?
  const sql = 'SELECT username, role FROM users WHERE username = ? AND password_hash = ? AND active = 1';
  return db.prepare(sql).get(username, passwordHash);
}

const show = row => row ? ` + '`登入成功 ${row.username} (${row.role})`' + String.raw` : '登入失敗';

const attempts = [['alice', 'scrypt$9f2c1a77e0b4'], ['alice', 'guess'], ["alice' --", 'guess'], ["' OR 1=1 --", 'guess']];
let sql;
for (const [username, passwordHash] of attempts) {
  let row;
  [sql, row] = loginUnsafe(username, passwordHash);
  console.log(` + '`輸入 ${username} / ${passwordHash}`' + String.raw`);
  console.log(` + '`  拼接：${show(row)}`' + String.raw`);
  console.log(` + '`  參數化：${show(loginSafe(username, passwordHash))}`' + String.raw`);
}
console.log('最後一次拼接出的 SQL：');
console.log(sql);
`,
          Java: String.raw`import java.sql.*;

public class Main {
    static Connection db;
    static String lastSql;

    // 有漏洞：把輸入直接拼進 SQL 文字
    static String loginUnsafe(String username, String passwordHash) throws SQLException {
        lastSql = "SELECT username, role FROM users WHERE username = '" + username
            + "' AND password_hash = '" + passwordHash + "' AND active = 1";
        try (Statement st = db.createStatement(); ResultSet rs = st.executeQuery(lastSql)) {
            return show(rs);
        }
    }

    // 修正：SQL 文字固定，值由驅動程式另外綁定到 ?
    static String loginSafe(String username, String passwordHash) throws SQLException {
        String sql = "SELECT username, role FROM users WHERE username = ? AND password_hash = ? AND active = 1";
        try (PreparedStatement ps = db.prepareStatement(sql)) {
            ps.setString(1, username);
            ps.setString(2, passwordHash);
            try (ResultSet rs = ps.executeQuery()) {
                return show(rs);
            }
        }
    }

    static String show(ResultSet rs) throws SQLException {
        return rs.next() ? "登入成功 " + rs.getString("username") + " (" + rs.getString("role") + ")" : "登入失敗";
    }

    public static void main(String[] args) throws SQLException {
        db = DriverManager.getConnection("jdbc:sqlite::memory:");
        try (Statement st = db.createStatement()) {
            st.executeUpdate("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, "
                + "password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL)");
            st.executeUpdate("INSERT INTO users VALUES (1, 'alice', 'scrypt$9f2c1a77e0b4', 'admin', 1), "
                + "(2, 'bob', 'scrypt$41d8e3c2a915', 'member', 1), (3, 'carol', 'scrypt$7b3e9d04c6f2', 'member', 0)");
        }
        String[][] attempts = { { "alice", "scrypt$9f2c1a77e0b4" }, { "alice", "guess" }, { "alice' --", "guess" }, { "' OR 1=1 --", "guess" } };
        for (String[] a : attempts) {
            String unsafe = loginUnsafe(a[0], a[1]);
            System.out.println("輸入 " + a[0] + " / " + a[1]);
            System.out.println("  拼接：" + unsafe);
            System.out.println("  參數化：" + loginSafe(a[0], a[1]));
        }
        System.out.println("最後一次拼接出的 SQL：");
        System.out.println(lastSql);
        db.close();
    }
}
`,
        },
        output: `輸入 alice / scrypt$9f2c1a77e0b4
  拼接：登入成功 alice (admin)
  參數化：登入成功 alice (admin)
輸入 alice / guess
  拼接：登入失敗
  參數化：登入失敗
輸入 alice' -- / guess
  拼接：登入成功 alice (admin)
  參數化：登入失敗
輸入 ' OR 1=1 -- / guess
  拼接：登入成功 alice (admin)
  參數化：登入失敗
最後一次拼接出的 SQL：
SELECT username, role FROM users WHERE username = '' OR 1=1 --' AND password_hash = 'guess' AND active = 1`,
      },
      {
        id: 'password-scrypt', title: '用 scrypt 加鹽雜湊保存密碼並驗證登入',
        description: '註冊時算出 `scrypt$鹽$雜湊` 存進 `users`；登入時用參數化查詢依帳號名稱取出它，用同一個鹽重算再以固定時間比較。範例用固定的鹽只是為了讓輸出每次相同（實際每個帳號都要用新的隨機鹽）。輸出只印雜湊的最後 16 個十六進位字元。Java 的標準函式庫沒有 scrypt（有 PBKDF2），所以這個範例只有 Python 與 JavaScript。',
        code: {
          Python: String.raw`import hashlib
import hmac
import sqlite3

def scrypt(password, salt):
    # scrypt 的參數：N = 2**14、r = 8、p = 1，輸出 32 位元組
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)

def hash_password(password, salt):
    # 實際系統每個帳號用 os.urandom(16) 產生隨機的鹽；這裡用固定的鹽，輸出才每次相同
    return 'scrypt$' + salt.hex() + '$' + scrypt(password, salt).hex()

def verify(password, stored):
    _, salt_hex, key_hex = stored.split('$')
    key = scrypt(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(key, bytes.fromhex(key_hex))  # 比較時間不因內容而不同

db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)')
demo_salts = {'alice': b'demo-salt-alice!', 'bob': b'demo-salt-bob!!!'}
for name in ['alice', 'bob']:
    db.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)',
               (name, hash_password('correct horse', demo_salts[name])))

for name, stored in db.execute('SELECT username, password_hash FROM users ORDER BY id'):
    print(f'{name}: {stored[:7]}…{stored[-16:]}（共 {len(stored)} 字元）')

def login(username, password):
    row = db.execute('SELECT password_hash FROM users WHERE username = ?', (username,)).fetchone()
    return row is not None and verify(password, row[0])

for username, password in [('alice', 'correct horse'), ('alice', 'Correct horse'), ("alice' --", 'x')]:
    print(f'{username} / {password} -> {"成功" if login(username, password) else "失敗"}')
`,
          JavaScript: String.raw`const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

// scrypt 的參數：N = 2**14、r = 8、p = 1，輸出 32 位元組
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 32, { N: 2 ** 14, r: 8, p: 1 });

// 實際系統每個帳號用 crypto.randomBytes(16) 產生隨機的鹽；這裡用固定的鹽，輸出才每次相同
const hashPassword = (password, salt) => 'scrypt$' + salt.toString('hex') + '$' + scrypt(password, salt).toString('hex');

function verify(password, stored) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = scrypt(password, Buffer.from(saltHex, 'hex'));
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));  // 比較時間不因內容而不同
}

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)');
const demoSalts = { alice: Buffer.from('demo-salt-alice!'), bob: Buffer.from('demo-salt-bob!!!') };
const insert = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
for (const name of ['alice', 'bob']) insert.run(name, hashPassword('correct horse', demoSalts[name]));

for (const { username, password_hash: stored } of db.prepare('SELECT username, password_hash FROM users ORDER BY id').all())
  console.log(` + '`${username}: ${stored.slice(0, 7)}…${stored.slice(-16)}（共 ${stored.length} 字元）`' + String.raw`);

function login(username, password) {
  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username);
  return row !== undefined && verify(password, row.password_hash);
}

for (const [username, password] of [['alice', 'correct horse'], ['alice', 'Correct horse'], ["alice' --", 'x']])
  console.log(` + '`${username} / ${password} -> ${login(username, password) ? \'成功\' : \'失敗\'}`' + String.raw`);
`,
        },
        output: `alice: scrypt$…b025f06a2787db63（共 104 字元）
bob: scrypt$…3cfa9145a6b4fc3e（共 104 字元）
alice / correct horse -> 成功
alice / Correct horse -> 失敗
alice' -- / x -> 失敗`,
      },
    ],
  },
};
