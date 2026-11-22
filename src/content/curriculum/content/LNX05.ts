import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX05 Text Processing, Pipes and Redirection (LNX-2). A terminal lesson on the streams profile (engine stage E2):
 * cat, less, head and tail; grep (-i -n -v -c -w and a little of the basic regular expressions: . ^ $ and brackets);
 * pipes as a way to compose small tools (wc, cut), sort and uniq (why uniq needs sorted input, the
 * sort | uniq -c | sort -rn frequency table); standard output versus standard error and the redirections > >> 2> 2>&1 <
 * and /dev/null, including sort f > f emptying the file (the shell truncates before the command runs). One web server
 * for the transcripts (an access log, an app log, a user CSV, a root-only payment log) and a batch server for the first
 * exercise; host names, users, addresses (documentation ranges) and files are made up. Every transcript output was
 * produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';
const lines = (...rows: string[]) => rows.map(r => `${r}\n`).join('');

/** A web server's access log in the common log format: address, -, -, [time zone], "method path protocol", status, bytes. */
const ACCESS_LOG = lines(
  '203.0.113.7 - - [22/Nov/2026:10:01:02 +0800] "GET / HTTP/1.1" 200 5120',
  '203.0.113.7 - - [22/Nov/2026:10:01:03 +0800] "GET /static/app.css HTTP/1.1" 200 2048',
  '198.51.100.23 - - [22/Nov/2026:10:01:09 +0800] "POST /login HTTP/1.1" 401 512',
  '198.51.100.23 - - [22/Nov/2026:10:01:12 +0800] "POST /login HTTP/1.1" 401 512',
  '192.0.2.44 - - [22/Nov/2026:10:02:30 +0800] "GET /wp-login.php HTTP/1.1" 404 196',
  '203.0.113.7 - - [22/Nov/2026:10:02:41 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '198.51.100.23 - - [22/Nov/2026:10:03:05 +0800] "POST /login HTTP/1.1" 200 640',
  '203.0.113.70 - - [22/Nov/2026:10:03:18 +0800] "GET / HTTP/1.1" 200 5120',
  '203.0.113.7 - - [22/Nov/2026:10:04:00 +0800] "GET /api/orders HTTP/1.1" 500 87',
  '192.0.2.44 - - [22/Nov/2026:10:04:12 +0800] "GET /admin HTTP/1.1" 404 196',
  '203.0.113.70 - - [22/Nov/2026:10:05:27 +0800] "GET /favicon.ico HTTP/1.1" 404 196',
  '203.0.113.7 - - [22/Nov/2026:10:06:45 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '198.51.100.23 - - [22/Nov/2026:10:07:02 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '192.0.2.44 - - [22/Nov/2026:10:07:30 +0800] "GET /.env HTTP/1.1" 404 196',
);

/** The next day's access log (exercise 2's variant): another ranking of paths. */
const ACCESS_LOG_NEXT_DAY = lines(
  '192.0.2.44 - - [23/Nov/2026:09:00:01 +0800] "GET /login HTTP/1.1" 200 640',
  '192.0.2.44 - - [23/Nov/2026:09:00:05 +0800] "POST /login HTTP/1.1" 302 0',
  '203.0.113.7 - - [23/Nov/2026:09:01:11 +0800] "GET /search HTTP/1.1" 200 3301',
  '198.51.100.23 - - [23/Nov/2026:09:01:40 +0800] "GET /login HTTP/1.1" 200 640',
  '203.0.113.7 - - [23/Nov/2026:09:02:02 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '198.51.100.23 - - [23/Nov/2026:09:02:15 +0800] "POST /login HTTP/1.1" 401 512',
  '203.0.113.7 - - [23/Nov/2026:09:03:30 +0800] "GET /search HTTP/1.1" 200 2950',
  '192.0.2.44 - - [23/Nov/2026:09:04:00 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '198.51.100.23 - - [23/Nov/2026:09:04:41 +0800] "POST /login HTTP/1.1" 401 512',
  '203.0.113.70 - - [23/Nov/2026:09:05:12 +0800] "GET /api/orders HTTP/1.1" 200 734',
  '198.51.100.23 - - [23/Nov/2026:09:06:00 +0800] "GET / HTTP/1.1" 200 5120',
);

/** The web application's own log: date, time, level (INFO, WARN, ERROR), component and message. */
const APP_LOG = lines(
  '2026-11-22 09:00:01 INFO  api: server started on port 8080',
  '2026-11-22 09:12:44 WARN  db: slow query took 1200 ms',
  '2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms',
  '2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500',
  '2026-11-22 10:15:31 INFO  api: payment callback received',
  '2026-11-22 10:20:00 WARN  api: payment gateway slow (3100 ms)',
  '2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry',
  '2026-11-22 11:00:00 INFO  mail: queue flushed',
);

/** Exercise 1: a batch server's worker log, whose hourly summaries mention ERRORS. */
const WORKER_LOG = lines(
  '2026-11-22 01:00:00 INFO  worker: nightly jobs started',
  '2026-11-22 01:02:13 ERROR job 17: invoice export failed: disk full',
  '2026-11-22 01:05:40 WARN  job 18: retrying upload (1/3)',
  '2026-11-22 01:06:02 ERROR job 18: upload failed after 3 tries',
  '2026-11-22 01:30:00 INFO  summary: 2 ERRORS so far',
  '2026-11-22 02:11:09 ERROR job 25: report template missing',
  '2026-11-22 03:00:00 INFO  summary: 3 ERRORS so far',
  '2026-11-22 03:00:05 INFO  worker: nightly jobs finished',
);
const WORKER_LOG_NEXT_NIGHT = lines(
  '2026-11-23 01:00:00 INFO  worker: nightly jobs started',
  '2026-11-23 01:15:22 ERROR job 31: database locked',
  '2026-11-23 01:15:30 ERROR job 31: database locked',
  '2026-11-23 01:40:00 INFO  summary: 2 ERRORS so far',
  '2026-11-23 02:05:47 WARN  job 33: slow response from mail server',
  '2026-11-23 02:44:10 ERROR job 34: mail server refused connection',
  '2026-11-23 03:12:00 ERROR job 36: invoice export failed: disk full',
  '2026-11-23 03:30:00 INFO  summary: 4 ERRORS so far',
  '2026-11-23 03:30:04 INFO  worker: nightly jobs finished',
);

/** The transcripts' web server (and exercises 2 and 3): logs, a user list, a report folder and a payment log only root may read. */
const webServer: TerminalMachine = {
  id: 'web', title: '網站伺服器 web-07', user: 'learner', host: 'web-07', cwd: HOME, profile: 'streams',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    dir(`${HOME}/logs`),
    file(`${HOME}/logs/access.log`, ACCESS_LOG),
    file(`${HOME}/logs/app.log`, APP_LOG),
    dir(`${HOME}/reports`),
    file(`${HOME}/reports/summary.txt`, '# web-07 每日摘要 2026-11-22\n'),
    file(`${HOME}/users.csv`, lines(
      'id,name,dept,shell',
      '1001,ann,ops,/bin/bash',
      '1002,joanna,dev,/bin/zsh',
      '1003,bo,dev,/bin/bash',
      '1004,anna,ops,/bin/bash',
      '1005,cy,qa,/bin/sh',
      '1006,dee,dev,/bin/bash',
      '1007,ed,ops,/usr/sbin/nologin',
      '1008,fay,dev,/bin/bash',
    )),
    dir('/var', 'root'),
    dir('/var/log', 'root'),
    file('/var/log/payment.log', '2026-11-22 10:20:00 ERROR payment: card gateway unreachable\n', 'root', 0o600),
  ],
};

/** Exercise 1: the batch server with last night's worker log. */
const batchServer: TerminalMachine = {
  id: 'batch', title: '批次主機 batch-03', user: 'learner', host: 'batch-03', cwd: HOME, profile: 'streams',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    file(`${HOME}/worker.log`, WORKER_LOG),
  ],
};

export const LNX05: LessonContent = {
  lessonId: 'LNX05',
  motivation: '網站半夜出錯，主管想知道：今天有幾筆錯誤？是誰一直在嘗試登入？哪個網址被打得最多？答案都在伺服器的日誌裡，但日誌動輒上萬行，伺服器上也沒有試算表可以開。Linux 的做法是把幾個各做一件小事的工具接起來：`grep` 挑出需要的行，`cut` 取出需要的欄，`sort` 與 `uniq` 排序、計數，`head` 只留前幾名，一行指令就把上萬行濃縮成一個答案。本課學會這些工具，用管線 `|` 把它們串起來，再用重新導向把結果和錯誤分別存進檔案，並避開幾個會悄悄弄錯答案、甚至清空檔案的陷阱。',
  sections: [
    {
      id: 'lnx05-s-view', title: '看檔案的內容：cat、less、head、tail',
      blocks: [
        { type: 'p', text: '`cat`（concatenate）把檔案的內容原封不動地印出來，給它好幾個檔案就依序接在一起印，這也是它名字的由來；`cat -n` 在每一行前面加上行號。它適合看短短幾行的設定檔，用在上萬行的日誌上，畫面會一路捲過去，真正想看的部分早就捲走了。' },
        { type: 'p', text: '`less` 是分頁器（pager）：一次顯示一個畫面，空白鍵往下一頁、`b` 往上一頁、`/` 加文字搜尋、`n` 跳到下一個符合處、`G` 跳到結尾、`q` 離開。它不必先把整個檔案讀進來，打開很大的日誌也很快，`man` 顯示說明時用的通常也是它。模擬環境沒有互動的全螢幕畫面，`less` 會直接印出全部內容，效果和 `cat` 一樣。' },
        { type: 'p', text: '只想看開頭或結尾時用 `head` 與 `tail`，兩者預設都是 10 行，`-n 3` 改成 3 行。日誌的新內容寫在最後面，所以 `tail` 最常用；CSV 的第一行是欄位名稱，`head -n 1` 看欄位，`tail -n +2`（注意加號）則是「從第 2 行開始到結尾」，正好略過標題列。真實系統的 `tail -f` 會停在檔案結尾，持續印出新寫入的行，按 Ctrl+C 結束；模擬環境的檔案不會自己長大，所以不支援 `-f`。' },
        { type: 'table', head: ['指令', '印出什麼', '適合的情況'], rows: [
          ['`cat f`', '整個檔案', '短檔案，或把檔案交給下一個工具'],
          ['`cat -n f`', '整個檔案，加上行號', '要指出「第幾行」的時候'],
          ['`less f`', '一次一個畫面，可以搜尋（模擬環境直接印出全部）', '長檔案、慢慢讀'],
          ['`head -n 3 f`', '前 3 行（預設 10 行）', '看欄位名稱、檔案的格式'],
          ['`tail -n 2 f`', '最後 2 行（預設 10 行）', '看日誌最新的事件'],
          ['`tail -n +2 f`', '從第 2 行到結尾', '略過 CSV 的標題列'],
        ] },
        { type: 'p', text: '下面的紀錄在網站伺服器 web-07 上先看存取日誌（access log）的前三行，每一行是一次 HTTP 請求：來源位址、請求的時間、方法與路徑、狀態碼和回應的位元組數。接著看應用程式日誌的最後兩行、使用者清單的欄位名稱與內容。' },
        { type: 'example', id: 'lnx05-view' },
        { type: 'callout', tone: 'tip', title: '在正式的伺服器上，先 head／tail，再決定要不要 cat', text: '對一個不知道多大的日誌直接 `cat`，可能讓終端機捲上好幾分鐘，經由遠端連線時還會拖慢操作。先用 `ls -lh` 看大小，再用 `head`、`tail -n 50` 或 `less` 看需要的部分；要找特定的內容，下一節的 `grep` 比用眼睛捲動可靠得多。' },
      ],
    },
    {
      id: 'lnx05-s-grep', title: '用 grep 搜尋文字',
      blocks: [
        { type: 'p', text: '`grep 樣式 檔案` 印出檔案裡含有樣式的每一行，沒有符合的行就什麼都不印。名字來自早期編輯器 ed 的指令 `g/re/p`：對全部的行（global）找出符合正規表示式（regular expression）的，印出來（print）。預設區分大小寫，而且只要行裡「某一段」符合就算，不管它是不是一個完整的字。' },
        { type: 'table', head: ['選項', '意思', '例子'], rows: [
          ['`-i`', '不分大小寫（ignore case）', '`grep -i timeout` 也符合 Timeout、TIMEOUT'],
          ['`-n`', '在每行前面加上行號', '`3:2026-11-22 09:30:02 ERROR ...`'],
          ['`-v`', '反過來，印出不符合的行（invert）', '`grep -v INFO` 只留 WARN 與 ERROR'],
          ['`-c`', '只印符合的行數（count），不印內容', '`grep -c ERROR app.log` 印出 `3`'],
          ['`-w`', '樣式必須是完整的字：前後不能緊接字母、數字或底線', '`grep -w ann` 不符合 joanna、anna'],
        ] },
        { type: 'p', text: '選項可以分開寫，也可以合寫：`grep -i -n timeout` 和 `grep -in timeout` 相同。要注意 `-c` 算的是「有符合的行數」，一行裡出現兩次也只算一行。' },
        { type: 'p', text: '樣式是正規表示式，大部分字元代表自己，少數字元有特別的意思。本課只用最基本的幾個：' },
        { type: 'table', head: ['寫法', '符合', '例子'], rows: [
          ['`.`', '任何一個字元', '`a.n` 符合 ann、aen，也符合 a-n'],
          ['`^`（放在開頭）', '行的開頭', '`^2026-11-22 10` 只符合 10 點開頭的行'],
          ['`$`（放在結尾）', '行的結尾', '`bash$` 只符合以 bash 結尾的行'],
          ['`[0-9]`、`[abc]`', '方括號裡的任何一個字元，`-` 表示範圍', '` 40[0-9] ` 符合狀態碼 400–409'],
          ['`[^0-9]`', '方括號裡以 `^` 開頭：不是這些字元的任何一個字元', '`[^0-9]` 符合字母、空白、標點'],
        ] },
        { type: 'p', text: '樣式含有空白、`*`、方括號或 `^` 時，請用單引號把整個樣式包起來，例如 `grep \' 404 \' logs/access.log`。沒有引號時，空白會把樣式切成兩個參數，方括號與 `*` 還可能先被 Shell 當成萬用字元展開成檔名，`grep` 收到的就不是你寫的樣式了。下面的紀錄依序示範大小寫、行號、反向、行首與方括號，最後兩組比較加不加 `-w` 的差別。' },
        { type: 'example', id: 'lnx05-grep' },
        { type: 'callout', tone: 'warning', title: 'grep 找的是「一段文字」，不是「一個字」', text: '常見的誤會是以為 `grep ann users.csv` 只會找到使用者 ann，其實 joanna 與 anna 都含有 ann，三行全部符合；`grep -c ERROR` 也會把「2 ERRORS so far」這類訊息算進去。IP 位址更容易出錯：`grep 203.0.113.7` 同時符合 203.0.113.70，而且樣式裡的 `.` 是「任何一個字元」，連 203x0y113z7 也算。加上 `-w` 要求前後不是字母、數字或底線，才是「完整的一個字」；要把點當成字面的點，可以再加 `-F`（整個樣式當作一般文字）。數字的結果看起來合理時最危險，因為沒有人會懷疑它。' },
      ],
    },
    {
      id: 'lnx05-s-pipes', title: '管線：把小工具接起來',
      blocks: [
        { type: 'p', text: '管線 `|` 把左邊指令的標準輸出（原本要印到螢幕上的文字）直接接到右邊指令的標準輸入，資料一邊產生一邊流過去，不需要中間檔案。`grep ERROR logs/app.log | wc -l` 就是先挑出錯誤的行，再數有幾行。一行可以接好幾段，每一段都只負責一件事。' },
        { type: 'p', text: '這是 Unix 從 1970 年代就有的設計。1973 年，Ken Thompson 依 Doug McIlroy 的提議把管線加進 Unix；McIlroy 後來把這套做法歸納成幾句常被引用的話，大意是：寫只做一件事、而且把它做好的程式；寫能彼此合作的程式；寫處理文字串流的程式，因為文字是通用的介面。`grep` 不必會計數，`wc` 不必會搜尋，接起來就能回答「有幾筆錯誤」；換一個問題，只要換掉其中一段。' },
        { type: 'p', text: '能放在管線中間的工具稱為過濾器（filter）：沒有給檔名時，它們從標準輸入讀資料，處理後寫到標準輸出。本課的 `cat`、`head`、`tail`、`grep`、`sort`、`uniq`、`wc`、`cut` 都是。這裡先認識兩個常和 `grep` 搭配的：' },
        { type: 'table', head: ['工具', '常用寫法', '作用'], rows: [
          ['`wc`', '`wc -l`、`wc -w`、`wc -c`', '計算行數、字數、位元組數；不加選項三個都印。讀標準輸入時不知道檔名，所以只印數字'],
          ['`cut`', '`cut -d , -f 2,3`', '以 `-d` 指定的單一字元分欄，取出第 2、3 欄；`-f 2-4` 是範圍；不加 `-d` 時以 Tab 分欄'],
          ['`cut`', '`cut -c 1-10`', '取出每行第 1 到第 10 個字元'],
        ] },
        { type: 'p', text: '存取日誌以空白分欄：第 1 欄是來源位址，第 7 欄是路徑，第 9 欄是狀態碼，第 10 欄是位元組數（時間 `[22/Nov/2026:10:01:02 +0800]` 中間有空白，所以占了第 4、5 兩欄）。`cut` 把每一個分隔字元都當成一次分欄，兩個連續的空白之間會多出一個空的欄位，所以它適合格式整齊的資料；欄位之間空白數不固定時，真實系統常改用 `awk`（模擬環境沒有提供）。' },
        { type: 'example', id: 'lnx05-pipe' },
        { type: 'p', text: '注意第二步與第三步：`wc -l logs/access.log` 印出 `14 logs/access.log`，`cat logs/access.log | wc -l` 只印 `14`，因為 `wc` 從管線讀到的只是一串文字，不知道它來自哪個檔案。寫進報告或交給下一個指令時，只有數字的版本通常比較好用。' },
        { type: 'callout', tone: 'note', title: '不必每條管線都從 cat 開始', text: '`cat f | grep x` 和 `grep x f` 的結果相同，後者少啟動一個程式，也讓 `grep` 知道檔名（加 `-n`、處理多個檔案時有用）。會讀檔案的工具就直接給它檔名，`cat` 留給「把好幾個檔案接起來」或真的需要時再用。' },
      ],
    },
    {
      id: 'lnx05-s-sort', title: '排序、去重與計數：sort 與 uniq',
      blocks: [
        { type: 'p', text: '`sort` 把行排好順序。預設逐字元比較（模擬環境依字元碼，大寫排在小寫前面；真實系統的順序還會受語系設定 locale 影響），所以數字會被當成文字：`87` 排在 `734` 後面，因為第一個字元 8 比 7 大。加 `-n` 依數值排序，`-r` 反過來（由大到小），`-u` 只留下重複行中的一行，`-t , -k 3` 以逗號分欄、依第 3 欄排序。' },
        { type: 'p', text: '`uniq` 把連續重複的行合併成一行，`-c` 在每行前面加上它重複了幾次，`-d` 只印有重複的行。關鍵在「連續」：`uniq` 一次只拿目前這一行和上一行比較，不記得更早出現過什麼。`ops、dev、ops` 交給 `uniq` 會原樣留下三行，因為兩個 ops 不相鄰。所以 `uniq` 幾乎總是接在 `sort` 後面：排序讓相同的行聚在一起，`uniq` 才合併得了。只要去重、不要次數時，`sort -u` 一步就能做到。' },
        { type: 'p', text: '把它們接起來，就是日誌分析最常見的「次數排行榜」：' },
        { type: 'table', head: ['段落', '做什麼', '輸出的樣子'], rows: [
          ['`cut -d \' \' -f 1 logs/access.log`', '每個請求取出來源位址', '一行一個位址，依請求的順序，有重複'],
          ['`| sort`', '讓相同的位址相鄰', '相同的位址排在一起'],
          ['`| uniq -c`', '合併並計數', '`      5 203.0.113.7`：次數在前，依位址排序'],
          ['`| sort -rn`', '依次數由大到小排序', '最常出現的排第一'],
          ['`| head -n 2`', '只留前兩名', '前兩行'],
        ] },
        { type: 'p', text: '`uniq -c` 的次數靠右對齊、前面有空白，`sort -n` 會略過開頭的空白、讀出數字來比較；`-r` 讓最大的排第一。下面的紀錄先在使用者清單上看到 `uniq` 沒有先排序的結果，再比較文字與數值的排序，最後一段一段建出存取日誌的位址排行。' },
        { type: 'example', id: 'lnx05-count' },
        { type: 'callout', tone: 'warning', title: '忘了 sort，uniq -c 的次數就是錯的', text: '`cut -d \' \' -f 1 logs/access.log | uniq -c` 不會報任何錯，只是把同一個位址拆成好幾段分開計數：連續出現的兩次算成「2」，之後再出現又從「1」重新算起。接上 `sort -rn | head` 之後看起來仍是一份像樣的排行榜，數字卻全部偏小，第一名也可能換人。凡是看到 `uniq`，先確認它前面有沒有 `sort`。' },
      ],
    },
    {
      id: 'lnx05-s-redirect', title: '標準輸出、標準錯誤與重新導向',
      blocks: [
        { type: 'p', text: '每個程式啟動時都有三個標準的資料流，以檔案描述子（file descriptor）的編號稱呼：0 是標準輸入（stdin），1 是標準輸出（stdout），2 是標準錯誤（stderr）。在終端機裡三者都接到螢幕和鍵盤，所以平常分不出輸出和錯誤。把兩者分開的用意是：輸出是要交給下一個工具或存起來的資料，錯誤是給人看的訊息，不該混進資料裡。管線只接標準輸出，所以 `cat logs/app.log /var/log/payment.log | wc -l` 的錯誤訊息仍然出現在螢幕上，不會被 `wc` 算進去。' },
        { type: 'p', text: '重新導向由 Shell 處理：執行指令之前，Shell 先依照 `>`、`2>` 這些符號把資料流改接到檔案，指令本身不知道它的輸出去了哪裡。' },
        { type: 'table', head: ['寫法', '意思', '檔案已經存在時'], rows: [
          ['`指令 > f`', '標準輸出寫進 f', '先清空（截斷）再寫'],
          ['`指令 >> f`', '標準輸出接在 f 的結尾（append）', '保留原內容'],
          ['`指令 2> f`', '標準錯誤寫進 f', '先清空再寫'],
          ['`指令 2>> f`', '標準錯誤接在 f 的結尾', '保留原內容'],
          ['`指令 > f 2>&1`', '輸出寫進 f，錯誤也跟著寫進 f', '先清空再寫'],
          ['`指令 2> /dev/null`', '丟掉錯誤訊息', '（/dev/null 是特殊的裝置檔，寫進去的都會消失）'],
          ['`指令 < f`', '標準輸入改從 f 讀', '—'],
        ] },
        { type: 'p', text: '`2>&1` 的意思是「讓描述子 2 指向描述子 1 此刻指向的地方」，而 Shell 由左至右處理重新導向，所以順序有差別：`> f 2>&1` 先把輸出接到 f，再讓錯誤跟過去，兩者都進 f；`2>&1 > f` 先讓錯誤指向輸出「當時」的位置（螢幕），之後才把輸出改接到 f，錯誤仍然印在螢幕上。`/dev/null` 是真實系統上的一個特殊裝置檔，寫入的資料一律丟棄、讀它立刻得到檔案結尾；模擬環境沒有裝置檔，只把重新導向到 `/dev/null` 當成丟棄，所以 `ls /dev/null` 會說找不到。' },
        { type: 'example', id: 'lnx05-redirect' },
        { type: 'p', text: '紀錄的前六步顯示 `>` 與 `>>` 的差別：第二次的 `>` 先清空了 `errors.txt`，三行錯誤被兩行警告取代；`>>` 才是接在後面。`wc -l < users.csv` 從標準輸入讀，所以和管線一樣只印數字。之後的幾步把同一個 `cat` 的輸出與錯誤分到不同的地方，再用 `2>&1` 合在一起，並看到順序寫反時錯誤仍然留在螢幕上。' },
        { type: 'callout', tone: 'warning', title: 'sort f > f 會把 f 清空', text: '想把檔案排序後存回原檔而寫 `sort users.csv > users.csv`，結果是一個空檔案：Shell 在執行 `sort` 之前就先處理 `>`，把 users.csv 截斷成 0 個位元組，`sort` 開始讀的時候檔案已經是空的。整個過程沒有任何錯誤訊息；`cat f | sort > f` 在真實系統上通常也會得到空檔案（取決於哪一段先執行，模擬環境一律先截斷）。正確的做法是先寫到另一個檔案，確認內容後再 `mv` 回去：`sort users.csv > users.sorted`、`mv users.sorted users.csv`。真實的 GNU sort 另有 `sort -o users.csv users.csv`，它會讀完全部輸入才開啟輸出檔，所以可以安全地寫回原檔（模擬環境的 sort 不支援 `-o`）。同理，想「加上」內容卻打成 `>`，原本的內容就消失了；bash 的 `set -o noclobber` 可以讓 `>` 拒絕覆寫已經存在的檔案。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx05-q1', prompt: '`depts.txt` 依序有四行：`ops`、`dev`、`ops`、`dev`（沒有排序）。`uniq -c depts.txt` 會印出什麼？',
      options: ['兩行：`2 dev` 與 `2 ops`', '兩行：`2 ops` 與 `2 dev`', '錯誤：uniq 的輸入必須先排序', '四行，每一行的次數都是 1'],
      answer: 3,
      explanation: '`uniq` 只合併「相鄰」的重複行，這四行沒有任何兩行相鄰又相同，所以四行都留下、次數都是 1。要得到每個部門兩次，必須先 `sort` 讓相同的行聚在一起；`uniq` 不檢查輸入有沒有排序，也就不會報錯，只會安靜地給出偏小的次數。「2 dev 與 2 ops」是先排序之後才會有的結果；「2 ops 與 2 dev」則是誤以為 uniq 會記得所有出現過的行。',
    },
    {
      id: 'lnx05-q2', prompt: '日誌裡有些 INFO 行的訊息是 `3 ERRORS so far`。要算出等級是 ERROR 的行數，哪一個指令最合適？',
      options: ['`grep -c ERROR app.log`', '`grep -cw ERROR app.log`', '`grep -ci error app.log`', '`grep -cv ERROR app.log`'],
      answer: 1,
      explanation: '`-w` 要求 ERROR 前後不能緊接字母、數字或底線，所以 ERRORS 不算，`-c` 再印出符合的行數。沒有 `-w` 時，ERRORS 裡含有 ERROR，那幾行 INFO 也被算進去；`-i` 不分大小寫，只會符合更多行；`-v` 反過來數「不含 ERROR」的行。',
    },
    {
      id: 'lnx05-q3', prompt: '執行 `sort users.csv > users.csv` 之後，`users.csv` 會是什麼？',
      options: ['空檔案', '排序好的內容', '原本的內容，沒有改變', '原本的內容後面再接上排序好的內容'],
      answer: 0,
      explanation: 'Shell 在執行 `sort` 之前先處理 `>`，把 users.csv 截斷成空檔，`sort` 讀到的是空的輸入，寫回去的也就是空的。它不會得到排序好的內容，原本的內容也已經被截斷了；`>` 是覆寫，不會接在後面，接在後面的是 `>>`。安全的做法是寫到另一個檔案再 `mv`，或用 GNU sort 的 `-o`。',
    },
    {
      id: 'lnx05-q4', prompt: '執行 `cat a.txt missing.txt > out.txt` 之後，螢幕上仍然出現 `cat: missing.txt: No such file or directory`。為什麼？',
      options: ['`>` 只在指令沒有任何錯誤時才寫入檔案', '錯誤訊息寫在標準錯誤，`>` 只重新導向標準輸出', 'out.txt 的權限不允許寫入錯誤訊息', '`cat` 遇到錯誤時會關掉重新導向'],
      answer: 1,
      explanation: '`>` 只改變描述子 1（標準輸出）的去向，錯誤訊息寫在描述子 2（標準錯誤），仍然接在螢幕上；要一起存進檔案得加 `2>&1`，或用 `2>` 另存。a.txt 的內容照樣寫進了 out.txt，所以不是「有錯就不寫」；檔案的權限對兩種訊息是一樣的；`cat` 不知道也不控制 Shell 的重新導向。',
    },
    {
      id: 'lnx05-q5', prompt: '哪一行會把 `ls /etc /nope` 的輸出與錯誤訊息都寫進 `list.txt`？',
      options: ['`ls /etc /nope 2>&1 > list.txt`', '`ls /etc /nope 2> list.txt`', '`ls /etc /nope > list.txt 2>&1`', '`ls /etc /nope | list.txt`'],
      answer: 2,
      explanation: 'Shell 由左至右處理：`> list.txt` 先把輸出接到檔案，`2>&1` 再讓錯誤指向輸出此刻的位置，也就是同一個檔案。順序反過來時，錯誤在輸出改接之前就指向了螢幕，仍會印出來；`2>` 只存錯誤，`/etc` 的清單會印在螢幕上；`|` 的右邊必須是指令，不是檔名，Shell 會找不到叫 list.txt 的指令。',
    },
    {
      id: 'lnx05-q6', prompt: '要從存取日誌找出請求次數最多的 3 個位址，哪一條管線正確？（第 1 欄是位址）',
      options: ['`cut -d \' \' -f 1 access.log | uniq -c | sort -rn | head -n 3`', '`cut -d \' \' -f 1 access.log | sort -rn | uniq -c | head -n 3`', '`cut -d \' \' -f 1 access.log | sort | uniq -c | sort -n | head -n 3`', '`cut -d \' \' -f 1 access.log | sort | uniq -c | sort -rn | head -n 3`'],
      answer: 3,
      explanation: '先 `sort` 讓相同的位址相鄰，`uniq -c` 才能正確計數，再以 `sort -rn` 依次數由大到小排序，`head -n 3` 留下前三名。少了第一個 `sort`，同一個位址會被拆開計數；把 `sort -rn` 放在 `uniq -c` 之前，次數雖然算對了，順序卻是依位址排的，前三行不一定是次數最多的；`sort -n` 由小到大，前三行是次數最少的。',
    },
    {
      id: 'lnx05-q7', prompt: '依序執行 `echo a > f.txt`、`echo b >> f.txt`、`echo c > f.txt` 之後，`cat f.txt` 會印出什麼？',
      options: ['`a`、`b`、`c` 三行', '只有 `c`', '`a` 與 `c` 兩行', '`b` 與 `c` 兩行'],
      answer: 1,
      explanation: '第一個指令寫入 a，第二個以 `>>` 接上 b，但第三個用的是 `>`，Shell 先把檔案清空才寫入 c，前面的 a 與 b 都不見了。只有每一次都用 `>>` 才會得到三行；`>` 不會只清掉部分內容，所以不可能留下 a 或 b 其中一行。',
    },
    {
      id: 'lnx05-q8', prompt: '`users.csv` 有 9 行，第一行是欄位名稱。`tail -n +2 users.csv` 會印出什麼？',
      options: ['最後 2 行', '前 2 行', '第 2 行到第 9 行，也就是略過標題列', '只有第 2 行'],
      answer: 2,
      explanation: '`tail -n +N` 的加號表示「從第 N 行開始印到結尾」，所以印出第 2 到第 9 行，正好略過標題。沒有加號的 `tail -n 2` 才是最後 2 行；前 2 行是 `head -n 2`；`tail` 沒有只印某一行的選項，要只取第 2 行可以接 `head -n 1`。',
    },
  ],
  terminal: {
    machines: [webServer, batchServer],
    examples: [
      {
        id: 'lnx05-view', title: '看檔案的開頭、結尾與全部', machine: 'web',
        description: '`head` 與 `tail` 只看開頭或結尾，`tail -n +2` 略過 CSV 的標題列；`cat -n` 加上行號；模擬環境的 `less` 直接印出全部，`tail -f` 不支援。',
        steps: [
          { command: 'head -n 3 logs/access.log', output: '203.0.113.7 - - [22/Nov/2026:10:01:02 +0800] "GET / HTTP/1.1" 200 5120\n203.0.113.7 - - [22/Nov/2026:10:01:03 +0800] "GET /static/app.css HTTP/1.1" 200 2048\n198.51.100.23 - - [22/Nov/2026:10:01:09 +0800] "POST /login HTTP/1.1" 401 512' },
          { command: 'tail -n 2 logs/app.log', output: '2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry\n2026-11-22 11:00:00 INFO  mail: queue flushed' },
          { command: 'head -n 1 users.csv', output: 'id,name,dept,shell' },
          { command: 'tail -n +2 users.csv', output: '1001,ann,ops,/bin/bash\n1002,joanna,dev,/bin/zsh\n1003,bo,dev,/bin/bash\n1004,anna,ops,/bin/bash\n1005,cy,qa,/bin/sh\n1006,dee,dev,/bin/bash\n1007,ed,ops,/usr/sbin/nologin\n1008,fay,dev,/bin/bash' },
          { command: 'cat -n logs/app.log', output: '     1\t2026-11-22 09:00:01 INFO  api: server started on port 8080\n     2\t2026-11-22 09:12:44 WARN  db: slow query took 1200 ms\n     3\t2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms\n     4\t2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500\n     5\t2026-11-22 10:15:31 INFO  api: payment callback received\n     6\t2026-11-22 10:20:00 WARN  api: payment gateway slow (3100 ms)\n     7\t2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry\n     8\t2026-11-22 11:00:00 INFO  mail: queue flushed' },
          { command: 'less users.csv', output: 'id,name,dept,shell\n1001,ann,ops,/bin/bash\n1002,joanna,dev,/bin/zsh\n1003,bo,dev,/bin/bash\n1004,anna,ops,/bin/bash\n1005,cy,qa,/bin/sh\n1006,dee,dev,/bin/bash\n1007,ed,ops,/usr/sbin/nologin\n1008,fay,dev,/bin/bash' },
          { command: 'tail -f logs/app.log', output: 'tail: 模擬環境不支援 -f：檔案不會繼續增加內容' },
        ],
      },
      {
        id: 'lnx05-grep', title: '用 grep 找出需要的行', machine: 'web',
        description: '`grep` 印出含有樣式的行：`-c` 只印行數、`-i` 不分大小寫、`-n` 加行號、`-v` 反向；`^` 與方括號縮小範圍；`-w` 讓 ann 不再符合 joanna，讓 203.0.113.7 不再符合 203.0.113.70。',
        steps: [
          { command: 'grep ERROR logs/app.log', output: '2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms\n2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500\n2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry' },
          { command: 'grep -c ERROR logs/app.log', output: '3' },
          { command: 'grep timeout logs/app.log', output: '2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms' },
          { command: 'grep -i -n timeout logs/app.log', output: '3:2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms\n7:2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry' },
          { command: 'grep -v INFO logs/app.log', output: '2026-11-22 09:12:44 WARN  db: slow query took 1200 ms\n2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms\n2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500\n2026-11-22 10:20:00 WARN  api: payment gateway slow (3100 ms)\n2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry' },
          { command: "grep '^2026-11-22 10' logs/app.log", output: '2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500\n2026-11-22 10:15:31 INFO  api: payment callback received\n2026-11-22 10:20:00 WARN  api: payment gateway slow (3100 ms)\n2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry' },
          { command: "grep -c ' 40[0-9] ' logs/access.log", output: '6' },
          { command: 'grep ann users.csv', output: '1001,ann,ops,/bin/bash\n1002,joanna,dev,/bin/zsh\n1004,anna,ops,/bin/bash' },
          { command: 'grep -w ann users.csv', output: '1001,ann,ops,/bin/bash' },
          { command: 'grep -c 203.0.113.7 logs/access.log', output: '7' },
          { command: 'grep -c -w 203.0.113.7 logs/access.log', output: '5' },
        ],
      },
      {
        id: 'lnx05-pipe', title: '用管線把小工具接起來', machine: 'web',
        description: '`wc` 數行數、字數與位元組數，從管線讀時只印數字；`cut` 依分隔字元取出需要的欄位，和 `grep`、`head` 接成一條管線。',
        steps: [
          { command: 'wc logs/app.log', output: '  8  67 468 logs/app.log' },
          { command: 'wc -l logs/access.log', output: '14 logs/access.log' },
          { command: 'cat logs/access.log | wc -l', output: '14' },
          { command: 'grep ERROR logs/app.log | wc -l', output: '3' },
          { command: "cut -d ' ' -f 1 logs/access.log | head -n 4", output: '203.0.113.7\n203.0.113.7\n198.51.100.23\n198.51.100.23' },
          { command: "cut -d ' ' -f 7,9 logs/access.log | head -n 4", output: '/ 200\n/static/app.css 200\n/login 401\n/login 401' },
          { command: "grep ' 404 ' logs/access.log | cut -d ' ' -f 1,7", output: '192.0.2.44 /wp-login.php\n192.0.2.44 /admin\n203.0.113.70 /favicon.ico\n192.0.2.44 /.env' },
          { command: 'cut -d , -f 2,3 users.csv | head -n 4', output: 'name,dept\nann,ops\njoanna,dev\nbo,dev' },
        ],
      },
      {
        id: 'lnx05-count', title: '排序、去重與計數', machine: 'web',
        description: '沒有排序的 `uniq` 留下了不相鄰的重複；`sort -u` 與 `sort -n -u` 比較文字與數值的順序；最後一段一段建出位址的次數排行。',
        steps: [
          { command: 'tail -n +2 users.csv | cut -d , -f 3', output: 'ops\ndev\ndev\nops\nqa\ndev\nops\ndev' },
          { command: 'tail -n +2 users.csv | cut -d , -f 3 | uniq', output: 'ops\ndev\nops\nqa\ndev\nops\ndev' },
          { command: 'tail -n +2 users.csv | cut -d , -f 3 | sort | uniq', output: 'dev\nops\nqa' },
          { command: 'tail -n +2 users.csv | cut -d , -f 3 | sort | uniq -c', output: '      4 dev\n      3 ops\n      1 qa' },
          { command: "cut -d ' ' -f 10 logs/access.log | sort -u", output: '196\n2048\n512\n5120\n640\n734\n87' },
          { command: "cut -d ' ' -f 10 logs/access.log | sort -n -u", output: '87\n196\n512\n640\n734\n2048\n5120' },
          { command: "cut -d ' ' -f 1 logs/access.log | sort | uniq -c", output: '      3 192.0.2.44\n      4 198.51.100.23\n      5 203.0.113.7\n      2 203.0.113.70' },
          { command: "cut -d ' ' -f 1 logs/access.log | sort | uniq -c | sort -rn", output: '      5 203.0.113.7\n      4 198.51.100.23\n      3 192.0.2.44\n      2 203.0.113.70' },
          { command: "cut -d ' ' -f 1 logs/access.log | sort | uniq -c | sort -rn | head -n 2", output: '      5 203.0.113.7\n      4 198.51.100.23' },
        ],
      },
      {
        id: 'lnx05-redirect', title: '輸出、錯誤與重新導向', machine: 'web',
        description: '`>` 覆寫、`>>` 接在後面、`<` 從檔案讀；錯誤不走管線也不跟著 `>`，`2>` 另存、`2>&1` 合併（順序有差）、`2> /dev/null` 丟棄；最後 `sort users.csv > users.csv` 把檔案清空。',
        steps: [
          { command: 'grep ERROR logs/app.log > reports/errors.txt', output: '' },
          { command: 'wc -l reports/errors.txt', output: '3 reports/errors.txt' },
          { command: 'grep WARN logs/app.log > reports/errors.txt', output: '' },
          { command: 'wc -l reports/errors.txt', output: '2 reports/errors.txt' },
          { command: 'grep ERROR logs/app.log >> reports/errors.txt', output: '' },
          { command: 'wc -l reports/errors.txt', output: '5 reports/errors.txt' },
          { command: 'wc -l < users.csv', output: '9' },
          { command: 'cat logs/app.log /var/log/payment.log | wc -l', output: 'cat: /var/log/payment.log: Permission denied\n8' },
          { command: 'cat logs/app.log /var/log/payment.log > all.txt', output: 'cat: /var/log/payment.log: Permission denied' },
          { command: 'cat logs/app.log /var/log/payment.log > all.txt 2> cat-errors.txt', output: '' },
          { command: 'cat cat-errors.txt', output: 'cat: /var/log/payment.log: Permission denied' },
          { command: 'cat logs/app.log /var/log/payment.log > all.txt 2>&1', output: '' },
          { command: 'tail -n 1 all.txt', output: 'cat: /var/log/payment.log: Permission denied' },
          { command: 'cat logs/app.log /var/log/payment.log 2>&1 > all.txt', output: 'cat: /var/log/payment.log: Permission denied' },
          { command: 'cat /var/log/payment.log 2> /dev/null', output: '' },
          { command: 'sort users.csv > users.csv', output: '' },
          { command: 'wc -c users.csv', output: '0 users.csv' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx05-count-errors', title: '昨晚有幾筆錯誤', machine: 'batch',
        statement: '批次主機的 `worker.log` 記錄了昨晚每個工作的結果，每行依序是日期、時間、等級（INFO、WARN 或 ERROR）與訊息。請用一行指令印出等級是 ERROR 的行數，只要一個數字。注意：每小時的摘要（INFO）也會提到 ERRORS，它們不是錯誤。檢查時，你的指令也會在另一個晚上的日誌上重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ['head -n 5 worker.log', 'grep -c -w ERROR worker.log'],
        variants: [{ label: '隔天晚上的日誌', files: [file(`${HOME}/worker.log`, WORKER_LOG_NEXT_NIGHT)] }],
        mistakes: [
          { commands: ['grep -c ERROR worker.log'], why: '沒有 `-w`：摘要行的 ERRORS 也含有 ERROR，兩行 INFO 被算了進去，數字偏大。' },
          { commands: ['echo 3'], why: '直接打出今天的答案：換成另一個晚上的日誌，錯誤的筆數就不一樣了。' },
          { commands: ['grep -w ERROR worker.log'], why: '印出的是那幾行錯誤本身，不是行數；要加 `-c`，或接 `| wc -l`。' },
          { commands: ['grep -v INFO worker.log | wc -l'], why: '`-v INFO` 去掉了 INFO，留下的卻還有 WARN 的行；要數的是 ERROR，就直接找 ERROR。' },
        ],
        hints: [
          '先用 `head` 看幾行，確認等級在哪裡、摘要行長什麼樣子。',
          '`grep -c` 只印符合的行數。',
          'ERRORS 也含有 ERROR；哪個選項要求符合的必須是完整的一個字？',
        ],
        explanation: '`grep -c -w ERROR worker.log` 只算 ERROR 是完整一個字的行：摘要行的 ERRORS 後面緊接著字母 S，不符合 `-w`。這份日誌印出 3，隔天的日誌印出 4，所以直接打出數字無法通過。`grep -w ERROR worker.log | wc -l` 是同樣正確的另一種寫法：`wc` 從管線讀，只印數字。',
      },
      {
        id: 'lnx05-top-paths', title: '最熱門的三個網址', machine: 'web',
        statement: '請用一行管線，從 `logs/access.log` 印出被請求最多次的 3 個路徑與各自的次數：使用 `uniq -c` 的格式（次數在前），由多到少排列，只要三行。路徑是以空白分隔的第 7 欄。檢查時，你的指令也會在隔天的日誌上重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ["cut -d ' ' -f 7 logs/access.log | head -n 3", "cut -d ' ' -f 7 logs/access.log | sort | uniq -c | sort -rn | head -n 3"],
        variants: [{ label: '隔天的存取日誌', files: [file(`${HOME}/logs/access.log`, ACCESS_LOG_NEXT_DAY)] }],
        mistakes: [
          { commands: ["cut -d ' ' -f 7 logs/access.log | uniq -c | sort -rn | head -n 3"], why: '`uniq` 前面沒有 `sort`：只有相鄰的相同路徑會合併，同一個路徑被拆成好幾段分開計數，次數偏小。' },
          { commands: ["cut -d ' ' -f 7 logs/access.log | sort | uniq -c | sort -n | head -n 3"], why: '`sort -n` 由小到大排列，前三行是請求最少的路徑；要加 `-r`。' },
          { commands: ['echo "      4 /api/orders"'], why: '直接打出答案：隔天的日誌排名不同，而且題目要三行。' },
          { commands: ["cut -d ' ' -f 6 logs/access.log | sort | uniq -c | sort -rn | head -n 3"], why: '第 6 欄是 `"GET` 或 `"POST`（方法），不是路徑；時間裡的空白占了兩欄，路徑在第 7 欄。' },
        ],
        hints: [
          '先用 `cut -d \' \' -f 7 logs/access.log | head -n 3` 確認取出來的真的是路徑。',
          '`uniq -c` 只合併相鄰的行，所以它前面要先 `sort`。',
          '`uniq -c` 之後再依次數由大到小排序（`sort -rn`），最後用 `head -n 3` 留下前三名。',
        ],
        explanation: '`cut` 取出每個請求的路徑，`sort` 讓相同的路徑相鄰，`uniq -c` 合併並計數，`sort -rn` 依次數由大到小，`head -n 3` 留下前三行。這一天是 /api/orders 4 次、/login 3 次、/ 2 次；隔天變成 /login 第一。同一條管線把第 7 欄換成第 1 欄就是位址排行，換成第 9 欄就是狀態碼統計。',
      },
      {
        id: 'lnx05-save-report', title: '把錯誤加進每日摘要', machine: 'web',
        statement: '`reports/summary.txt` 已經有一行標題，請保留它。用一個 `grep` 同時搜尋 `logs/app.log` 與 `/var/log/payment.log` 裡含有 ERROR 的行，把找到的行接在 `reports/summary.txt` 的標題後面（多個檔案時 grep 會在每行前面加上檔名，這正是我們要的；請在家目錄執行，前綴才會是 `logs/app.log:`）；讀不到檔案的錯誤訊息則另外存進 `reports/errors.txt`，不能混進摘要，也不要印在螢幕上。',
        checks: [
          { kind: 'content', path: `${HOME}/reports/summary.txt`, content: lines(
            '# web-07 每日摘要 2026-11-22',
            'logs/app.log:2026-11-22 09:30:02 ERROR db: connection timeout after 5000 ms',
            'logs/app.log:2026-11-22 10:04:00 ERROR api: GET /api/orders failed with status 500',
            'logs/app.log:2026-11-22 10:42:09 ERROR mail: SMTP Timeout, will retry',
          ) },
          { kind: 'content', path: `${HOME}/reports/errors.txt`, content: 'grep: /var/log/payment.log: Permission denied\n' },
          { kind: 'unchanged', path: `${HOME}/logs` },
        ],
        solution: ['grep ERROR logs/app.log /var/log/payment.log >> reports/summary.txt 2> reports/errors.txt', 'cat reports/summary.txt reports/errors.txt'],
        mistakes: [
          { commands: ['grep ERROR logs/app.log /var/log/payment.log > reports/summary.txt 2> reports/errors.txt'], why: '`>` 先把 summary.txt 清空，原本的標題不見了；要接在後面得用 `>>`。' },
          { commands: ['grep ERROR logs/app.log /var/log/payment.log >> reports/summary.txt 2>&1'], why: '`2>&1` 讓錯誤也跟著輸出寫進摘要，摘要裡混進了 Permission denied，errors.txt 也沒有建立。' },
          { commands: ['grep ERROR logs/app.log /var/log/payment.log >> reports/summary.txt'], why: '錯誤沒有重新導向，仍然印在螢幕上，errors.txt 不存在。' },
          { commands: ['grep ERROR logs/app.log /var/log/payment.log >> reports/summary.txt 2> /dev/null'], why: '`/dev/null` 把錯誤丟掉了，事後沒有紀錄可以查；題目要存進 errors.txt。' },
        ],
        hints: [
          '`>` 會先清空檔案，`>>` 才會接在後面。',
          '錯誤訊息走標準錯誤（描述子 2），用 `2> 檔案` 另外存起來。',
          '同一個指令可以同時寫 `>>` 與 `2>`，各管各的資料流。',
        ],
        explanation: '`>>` 把 grep 的標準輸出接在摘要的標題後面，`2>` 把標準錯誤（`/var/log/payment.log` 只有 root 能讀，所以是 Permission denied）另外寫進 errors.txt，兩個資料流各去各的地方，螢幕上什麼都不印。用 `>` 會先清掉標題；用 `2>&1` 會讓錯誤混進摘要；丟進 `/dev/null` 則失去了「有一個檔案沒有讀到」的線索，摘要看起來完整，其實少了付款系統的錯誤。',
      },
    ],
  },
};
