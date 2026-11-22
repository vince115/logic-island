import type { TerminalFile, TerminalMachine, TerminalProcess } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX08 Processes and Signals (LNX-3). A terminal lesson on the processes profile (engine stage E4): programs and
 * processes, PID and PPID, reading ps aux / ps -ef and top -b -n 1 to find what uses the CPU and the memory, foreground
 * and background jobs (sleep &, jobs, fg, bg; Ctrl+C and Ctrl+Z in the text), signals (SIGTERM first, SIGKILL last,
 * SIGHUP to reload, SIGINT), who may signal whom, and exit status with $?. One e-commerce web server: nginx, PostgreSQL,
 * a runaway monthly report started by cron under the report account, and an export job of the learner's whose
 * shutdown hangs (it ignores SIGTERM). The clock is fixed, so sleep and fg return at once. Host, users, programs and
 * numbers are made up; every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner: string, mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner: string, mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

/** web-07 at 10:00: nginx and PostgreSQL serve the shop; cron's monthly report has run for two hours. */
const PROCESSES: TerminalProcess[] = [
  { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 12800, vsz: 168200, time: 11 },
  { pid: 2, ppid: 0, user: 'root', command: '[kthreadd]', stat: 'S' },
  { pid: 640, user: 'root', command: '/usr/sbin/cron -f', stat: 'Ss', rss: 2900, vsz: 6800, time: 1 },
  { pid: 702, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', rss: 8100, vsz: 12000 },
  { pid: 820, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', rss: 6100, vsz: 55400, time: 3, hup: 'reload' },
  { pid: 821, ppid: 820, user: 'www-data', command: 'nginx: worker process', stat: 'S', cpu: 0.6, rss: 9800, vsz: 57200, time: 95 },
  { pid: 822, ppid: 820, user: 'www-data', command: 'nginx: worker process', stat: 'S', cpu: 0.5, rss: 9700, vsz: 57200, time: 92 },
  { pid: 905, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf', stat: 'Ss', rss: 31000, vsz: 1342000, time: 40, hup: 'reload' },
  { pid: 931, ppid: 905, user: 'postgres', command: 'postgres: 16/main: checkpointer', stat: 'Ss', rss: 140000, vsz: 1342200, time: 12 },
  { pid: 1490, ppid: 905, user: 'postgres', command: 'postgres: 16/main: shop shop 127.0.0.1(51234) idle', stat: 'Ss', cpu: 0.3, rss: 96000, vsz: 1345000, time: 210 },
  { pid: 1731, user: 'learner', command: '/bin/sh /opt/exporter/run.sh', stat: 'S', rss: 1600, vsz: 2800, start: '2026-11-22 06:00:00' },
  { pid: 1733, ppid: 1731, user: 'learner', command: 'java -Xmx512m -jar /opt/exporter/exporter.jar --daily', stat: 'Sl', cpu: 1.2, rss: 310000, vsz: 3710000, start: '2026-11-22 06:00:00', time: 260, term: 'ignore' },
  { pid: 1838, ppid: 702, user: 'learner', command: 'sshd: learner@pts/0', stat: 'S', rss: 7200, vsz: 17800, start: '2026-11-22 09:52:00' },
  { pid: 1840, ppid: 1838, user: 'learner', command: '-bash', stat: 'Ss', rss: 5200, vsz: 9000, tty: 'pts/0', start: '2026-11-22 09:52:00', term: 'ignore' },
  { pid: 2238, ppid: 640, user: 'root', command: '/usr/sbin/CRON -f', stat: 'S', rss: 3500, vsz: 9700, start: '2026-11-22 08:00:00' },
  { pid: 2240, ppid: 2238, user: 'report', command: 'python3 /opt/reports/build_report.py --month 2026-10', stat: 'R', cpu: 98.7, rss: 184320, vsz: 402000, start: '2026-11-22 08:00:01', time: 7085 },
  { pid: 2246, ppid: 905, user: 'postgres', command: 'postgres: 16/main: report shop [local] SELECT', stat: 'Rs', cpu: 21.5, rss: 1258496, vsz: 2608000, start: '2026-11-22 08:00:02', time: 1520 },
];
/** The same machine at another moment: the report job leaks memory and holds more than its database backend. */
const LEAKING_REPORT = PROCESSES.map(p => p.pid === 2240 ? { ...p, rss: 2359296, vsz: 2580000 } : p.pid === 2246 ? { ...p, rss: 412000, vsz: 1760000 } : p);
/** Early in the month: no report is running, logrotate compresses yesterday's access log, and the exporter has grown. */
const NO_REPORT: TerminalProcess[] = [
  ...PROCESSES.filter(p => p.pid < 2238).map(p => p.pid === 1733 ? { ...p, rss: 1650000 } : p),
  { pid: 3010, user: 'root', command: '/usr/sbin/logrotate /etc/logrotate.conf', stat: 'S', rss: 3100, vsz: 8200, start: '2026-11-22 09:59:00' },
  { pid: 3012, ppid: 3010, user: 'root', command: 'gzip -9 /var/log/nginx/access.log.1', stat: 'R', cpu: 93.4, rss: 2048, vsz: 4600, start: '2026-11-22 09:59:00', time: 56 },
];
/** The web server has crashed: no nginx process is left. */
const NGINX_DOWN = PROCESSES.filter(p => p.pid < 820 || p.pid > 822);

const webHost: TerminalMachine = {
  id: 'web', title: '電商網站伺服器 web-07', user: 'learner', host: 'web-07', cwd: '/home/learner', profile: 'processes',
  now: '2026-11-22 10:00:00', boot: '2026-11-18 03:12:00', load: [1.42, 1.18, 0.77], cpus: 2, memory: { total: 4096, cache: 1024 },
  accounts: {
    users: [
      { name: 'postgres', uid: 114, home: '/var/lib/postgresql', shell: '/bin/bash', comment: 'PostgreSQL administrator' },
      { name: 'report', uid: 999, home: '/opt/reports', shell: '/usr/sbin/nologin', comment: 'Monthly reports' },
    ],
    groups: [{ name: 'sudo', members: ['learner'] }],
  },
  files: [
    dir('/home', 'root'),
    dir('/home/learner', 'learner', 0o750),
    dir('/opt', 'root'),
    dir('/opt/exporter', 'learner'),
    file('/opt/exporter/run.sh', '#!/bin/sh\njava -Xmx512m -jar /opt/exporter/exporter.jar --daily\n', 'learner', 0o755),
    dir('/opt/reports', 'report'),
    file('/opt/reports/build_report.py', 'import psycopg\n', 'report', 0o755),
    dir('/var', 'root'),
    dir('/var/log', 'root'),
    dir('/var/log/reports', 'report'),
    file('/var/log/reports/2026-10.log', '2026-11-22 08:00:01 start month=2026-10\n2026-11-22 08:00:02 query orders: 1832004 rows\n2026-11-22 08:31:40 WARN query timeout, retrying\n2026-11-22 09:02:15 WARN query timeout, retrying\n', 'report'),
  ],
  processes: PROCESSES,
};

export const LNX08: LessonContent = {
  lessonId: 'LNX08',
  motivation: '早上十點，電商網站突然變慢，客服的電話一通接著一通。登入伺服器之後，你要在幾分鐘內回答三個問題：是哪一個程式把 CPU 或記憶體吃光了？它屬於誰、是誰把它叫起來的？怎樣讓它停下來，又不弄壞資料、不誤殺資料庫？這些都是行程管理的日常。本課在一台跑著 nginx、PostgreSQL、一個失控的月報程式與一個「叫不停」的匯出程式的伺服器上，學會分辨程式與行程、讀懂 PID 與 PPID，用 `ps` 與 `top` 找出耗用資源的行程，用前景與背景管理自己的工作，用 `kill` 依序送出 SIGTERM 與 SIGKILL，並從結束碼 `$?` 判斷每一個指令到底成功了沒有。',
  sections: [
    {
      id: 'lnx08-s-process', title: '程式與行程：PID、PPID 與行程樹',
      blocks: [
        { type: 'p', text: '程式（program）是放在磁碟上的檔案，例如 `/usr/sbin/nginx`；行程（process）是程式被執行之後、正在記憶體裡跑的那一份。同一個程式可以同時有很多個行程：nginx 有一個 master 與數個 worker，PostgreSQL 替每一個連線開一個後端行程。每個行程都有自己的記憶體、開啟的檔案、執行身分（屬於哪個使用者）與狀態；核心替它取一個號碼，叫做 PID（process ID）。PID 只在行程存在時有意義，行程結束後號碼會在之後被重新使用，所以「PID 2240」只代表此刻的那一個行程。' },
        { type: 'p', text: '行程不會憑空出現，一定是由另一個行程建立的（fork 之後 exec 新的程式）。建立它的那一個是父行程，它的號碼記在 PPID（parent PID）。順著 PPID 往上找，每一條路最後都會到 PID 1：開機時核心啟動的第一個使用者空間行程，在多數現代發行版上是 systemd（這台機器顯示為 `/sbin/init`）。父行程先結束時，留下的子行程變成孤兒，由 PID 1 收養，所以它們的 PPID 會變成 1。方括號裡的名稱（例如 `[kthreadd]`）是核心執行緒，不是一般的程式。真實系統的每個行程在 `/proc/PID/` 底下都有一個目錄，`ps` 與 `top` 讀的就是那裡的資料。' },
        { type: 'table', head: ['名詞', '意義', '在 web-07 上的例子'], rows: [
          ['程式', '磁碟上的可執行檔', '`/usr/sbin/nginx`、`/usr/lib/postgresql/16/bin/postgres`'],
          ['行程', '程式正在執行的一份，有自己的 PID、使用者與狀態', '820（nginx master）、821 與 822（nginx worker）'],
          ['PID', '核心給行程的號碼，同一時間不重複', '2240 是月報程式'],
          ['PPID', '父行程的 PID', '2240 的父行程是 2238（cron 為這次排程開的 CRON）'],
          ['PID 1', '第一個使用者空間行程，收養孤兒', '`/sbin/init`'],
        ] },
        { type: 'p', text: '`ps` 不加選項只列出目前終端機上自己的行程；`ps -f -u learner` 以完整格式列出 learner 的所有行程，其中有 PPID 欄；`ps -o 欄位,… -p PID,…` 只看指定的行程與欄位。下面的紀錄從自己的 Shell 開始，再順著 PPID 看出月報程式是 cron 叫起來的，最後看到一個 nginx 程式對應三個行程。注意 `ps` 也會列出它自己，因為執行中的 `ps` 也是一個行程。' },
        { type: 'example', id: 'lnx08-tree' },
        { type: 'p', text: '紀錄裡有兩條值得記下來的鏈：`-bash`（1840）的父行程是 `sshd: learner@pts/0`（1838），也就是 SSH 連線；月報 `python3`（2240）屬於 report 帳號，父行程是 root 的 `CRON`（2238），再往上是 cron 常駐程式（640）。知道父子關係，才能判斷「要停的是哪一個」：停掉父行程，子行程通常只是換成 PID 1 收養，照樣在跑。' },
      ],
    },
    {
      id: 'lnx08-s-ps', title: 'ps 與 top：讀懂欄位，找出耗用資源的行程',
      blocks: [
        { type: 'p', text: '`ps` 有兩套歷史留下來的寫法。`ps aux` 是 BSD 寫法（選項前面沒有 `-`）：a 是所有使用者、x 是包含沒有終端機的行程、u 是以使用者為主的欄位。`ps -ef` 是 UNIX 寫法：`-e` 是每一個行程、`-f` 是完整格式，多了 PPID。兩者列出的行程相同，只是欄位不同；混用時要小心，`ps -aux` 與 `ps aux` 的意義並不一樣。' },
        { type: 'table', head: ['欄位', '意義', '判讀重點'], rows: [
          ['USER／UID', '行程的執行身分', '決定誰可以送訊號給它'],
          ['PID、PPID', '行程與父行程的號碼', 'PPID 只有 `ps -ef` 或 `-o ppid` 才有'],
          ['%CPU', 'CPU 使用率', '`ps` 的值是行程整段生命期的平均（CPU 時間 ÷ 執行了多久），`top` 才是最近一段時間'],
          ['%MEM', 'RSS 占實體記憶體的比例', '找記憶體用量看這欄或 RSS'],
          ['VSZ', '虛擬記憶體大小（KiB），包含只是映射、還沒真正使用的部分', '通常遠大於實際用量，不適合拿來找吃記憶體的行程'],
          ['RSS', '常駐記憶體（KiB），此刻真的在實體記憶體裡的部分', '包含共用的函式庫與共享記憶體，所以全部加總會多算'],
          ['TTY', '所在的終端機，`?` 表示沒有', '常駐服務與排程工作都是 `?`'],
          ['STAT', '狀態字母加旗標', '見下表'],
          ['START／STIME', '開始時間', '當天啟動的顯示時:分，更早的顯示月日（例如 Nov21），不是同一年的只顯示年份'],
          ['TIME', '累計用掉的 CPU 時間', '月報程式兩小時用了 118 分鐘，幾乎一直在算'],
          ['COMMAND／CMD', '完整的指令列', '`ps -o comm` 只顯示程式名稱'],
        ] },
        { type: 'table', head: ['STAT', '意義'], rows: [
          ['R', '正在執行或排隊等 CPU'],
          ['S', '可中斷的睡眠：在等事件（網路、計時器、輸入），大部分行程大部分時間都是 S'],
          ['D', '不可中斷的睡眠：通常在等磁碟或網路檔案系統的 I/O，連 SIGKILL 都要等 I/O 回來才生效'],
          ['T', '被停止（Ctrl+Z、SIGSTOP）'],
          ['Z', '殭屍：已經結束、等父行程讀取結束碼；它不占 CPU 與記憶體，`kill` 也無法再結束它'],
          ['I', '閒置的核心執行緒'],
          ['旗標', '`s` 是 session 的帶頭行程、`l` 是多執行緒、`+` 在前景的行程群組、`<` 高優先、`N` 低優先'],
        ] },
        { type: 'p', text: '找出耗用資源的行程，最常用的是排序再取前幾行：`ps aux --sort=-%cpu | head` 依 %CPU 由大到小（`-` 表示遞減），`ps aux --sort=-%mem | head` 依記憶體；只要幾個欄位時用 `ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu`。`top` 平常是每幾秒更新一次的全螢幕畫面（按 `P` 依 CPU、`M` 依記憶體排序，`q` 離開）；寫進紀錄或腳本時用批次模式 `top -b -n 1`，只印一次快照。`top` 的前五行是整台機器的摘要：開機多久、平均負載、各狀態的行程數、CPU 時間的分配（us 使用者、sy 核心、id 閒置、wa 等 I/O）與記憶體。平均負載是過去 1、5、15 分鐘平均有多少個行程在執行或等待，要和 CPU 數比較：web-07 有 2 顆 CPU，1.42 表示還沒滿載，但正在上升。' },
        { type: 'example', id: 'lnx08-hogs' },
        { type: 'p', text: '兩次排序得到不同的答案：CPU 最忙的是月報程式（2240，98.7%），記憶體最多的卻是 PostgreSQL 替月報查詢開的後端（2246，30.0%），它在記憶體裡排序上百萬筆訂單。如果改看 VSZ，排第一的會是 java（3710000 KiB），但它的 RSS 只有三百多 MiB。先決定要找的是 CPU 還是記憶體，再選對欄位排序。' },
        { type: 'callout', tone: 'warning', title: 'ps 的 %CPU 不是「現在」的使用率', text: '常見的誤會是把 `ps` 的 %CPU 當成即時數字。procps 的 `ps` 算的是 CPU 時間除以行程已經執行的時間，是整段生命期的平均：一個跑了三天、剛剛才卡進無窮迴圈的行程，`ps` 可能只顯示 3%。要看此刻誰最忙，用 `top`（或 `top -b -n 1`），它比較的是兩次取樣之間的 CPU 時間；多核心的機器上，`top` 裡單一行程超過 100% 也是正常的。同理，`ps -o time` 的 TIME 是累計值，看的是「總共算了多久」，不是「現在多忙」。' },
      ],
    },
    {
      id: 'lnx08-s-jobs', title: '前景與背景：sleep &、jobs、fg、bg',
      blocks: [
        { type: 'p', text: '在 Shell 輸入一個指令，它預設在前景執行：Shell 等它結束才顯示下一個提示字元，鍵盤輸入也交給它。指令後面加上 `&` 就放到背景：Shell 立刻印出 `[工作編號] PID`，接著回到提示字元，讓你繼續做別的事。這些由目前 Shell 啟動、還沒結束的指令叫做工作（job），以 `%1`、`%2` 指稱，和 PID 是兩套不同的號碼。' },
        { type: 'table', head: ['操作', '作用'], rows: [
          ['`指令 &`', '在背景啟動，印出 `[1] 2247`（工作 1，PID 2247）'],
          ['`jobs`、`jobs -l`', '列出這個 Shell 的工作與狀態；`+` 是目前的工作、`-` 是前一個；`-l` 多印 PID'],
          ['`fg %1`', '把工作 1 拉回前景，Shell 等它結束'],
          ['`bg %1`', '讓被停止的工作 1 在背景繼續執行'],
          ['Ctrl+C', '對前景的行程送 SIGINT，通常讓它結束'],
          ['Ctrl+Z', '對前景的行程送 SIGTSTP，讓它暫停（狀態變成 T），Shell 印出 `Stopped`；之後用 `fg` 或 `bg` 繼續'],
          ['`kill %1`', '對工作 1 送 SIGTERM；`kill 1` 則是對 PID 1 送訊號，兩者完全不同'],
        ] },
        { type: 'p', text: '典型的情境是：啟動一個很久的指令後才發現忘了加 `&`，先按 Ctrl+Z 暫停它，再輸入 `bg` 讓它在背景繼續，終端機就空出來了。背景工作仍然屬於這個 Shell：終端機斷線時，Shell 收到 SIGHUP，會再轉送給它的工作，它們也就跟著結束。要在登出後繼續跑，常見的作法是 `nohup` 或 tmux 之類的終端機多工程式，長期執行的服務則交給 systemd（之後的課）。' },
        { type: 'p', text: '模擬環境沒有鍵盤訊號，所以下面用 `kill -TSTP %1` 代替 Ctrl+Z；背景執行只支援 `sleep`，而且時鐘不會前進，`fg` 拉回前景的 sleep 會立刻結束。紀錄同時開兩個背景工作，暫停其中一個、再讓它在背景繼續，最後以 `kill %1` 結束它，Shell 會印出 bash 的工作通知 `Terminated`。' },
        { type: 'example', id: 'lnx08-jobs' },
      ],
    },
    {
      id: 'lnx08-s-signals', title: 'kill 與訊號：先 SIGTERM，最後才 SIGKILL',
      blocks: [
        { type: 'p', text: '`kill` 這個名字有誤導性：它做的事是「送訊號」。訊號是核心送給行程的一個小通知，只有一個號碼，沒有內容。行程可以為大部分訊號安裝自己的處理程式（handler）：收到 SIGTERM 時先把資料寫完、刪掉暫存檔與鎖定檔、關閉資料庫連線再結束，也可以選擇忽略它。只有 SIGKILL 與 SIGSTOP 由核心直接執行，程式攔不到也忽略不了。`kill -l` 列出所有訊號，`kill -l 15` 把號碼換成名稱。' },
        { type: 'table', head: ['訊號', '號碼', '誰會送、效果', '程式能攔截嗎'], rows: [
          ['SIGHUP', '1', '終端機斷線時送給 Shell 與它的工作；許多常駐程式（nginx、PostgreSQL、sshd）把它當成「重新讀取設定」', '可以'],
          ['SIGINT', '2', '在終端機按 Ctrl+C', '可以'],
          ['SIGKILL', '9', '`kill -9`：核心立刻結束行程，不給任何收尾的機會', '不行'],
          ['SIGTERM', '15', '`kill` 的預設：禮貌地請行程結束；systemd 停止服務時也先送它', '可以'],
          ['SIGCONT', '18', '讓被停止的行程繼續', '可以，但行程一定會先被喚醒'],
          ['SIGSTOP', '19', '`kill -STOP`：暫停行程', '不行'],
          ['SIGTSTP', '20', '在終端機按 Ctrl+Z：暫停前景的行程', '可以'],
        ] },
        { type: 'p', text: '訊號可以寫成號碼、名稱或加上 SIG 的名稱：`kill -9 PID`、`kill -KILL PID`、`kill -s SIGKILL PID` 都一樣；不寫訊號時送的是 SIGTERM。`pgrep 樣式` 依名稱找 PID（`-a` 連指令列一起印、`-f` 比對整個指令列），`pkill 樣式` 依名稱送訊號，`pidof 名稱` 印出同名行程的 PID。用 `pkill` 前先用 `pgrep -a` 看看會選到哪些行程，名稱比對很容易選到不只一個。' },
        { type: 'p', text: '誰可以送訊號也有規則：一般使用者只能送給自己的行程，送給別人的會得到 `Operation not permitted`；root 可以送給任何行程，所以處理 report 或 postgres 帳號的行程要用 `sudo kill`。PID 1 是例外中的例外：核心只把 init 自己有處理的訊號交給它，`sudo kill -9 1` 什麼事也不會發生（如果 init 真的結束了，系統會直接 kernel panic）。下面的紀錄先讓 nginx 重新讀取設定：送給 root 的 master 行程要 sudo，送完 PID 不變，代表它是重新載入，不是重新啟動；接著用兩個背景的 sleep 比較 SIGTERM 與 SIGKILL 的工作通知。' },
        { type: 'example', id: 'lnx08-signals' },
        { type: 'p', text: '為什麼要先 SIGTERM？因為 SIGKILL 跳過了所有收尾：寫到一半的檔案留在半成品的狀態、緩衝區裡還沒寫出的資料直接消失、鎖定檔與 PID 檔留在磁碟上（下次啟動時程式可能以為自己還在跑而拒絕啟動）、正在進行的資料庫交易被中斷。正確的順序是：先 `kill PID`（SIGTERM），等幾秒、用 `ps -p PID` 或 `pgrep` 確認；還在的話才 `kill -9 PID`。systemd 停止服務也是同一套規則：先送 SIGTERM，等待 TimeoutStopSec（預設 90 秒）之後才送 SIGKILL。由 systemd 管理的服務應該用 `systemctl stop` 停止，否則設定了自動重啟的服務會被立刻叫回來。' },
        { type: 'callout', tone: 'warning', title: 'kill -9 不是第一招，kill 1 也不是 kill %1', text: '把 `kill -9` 當成預設的習慣，等於每次都拔插頭：程式來不及收尾，資料毀損與殘留的鎖定檔常常比原本的問題更難處理。另一個常見的失誤是把工作編號當成 PID：想結束背景工作 1 卻打成 `kill -9 1`，那是送給 PID 1（init），一般使用者得到 `Operation not permitted`，加了 sudo 也不會有作用，但工作 1 一樣還在。更危險的是 `kill -9 -1`：PID 寫成 -1 表示「我能送訊號的每一個行程」，會一口氣結束自己的所有行程，用 root 執行時幾乎是整台機器。' },
      ],
    },
    {
      id: 'lnx08-s-status', title: '結束碼與 $?：指令到底成功了沒有',
      blocks: [
        { type: 'p', text: '每個行程結束時都會留下一個 0 到 255 的結束碼（exit status），交給父行程。慣例是 0 代表成功，非 0 代表某種失敗；至於每個非 0 的數字代表什麼，由各個程式自己在說明文件中定義。Shell 把上一個指令的結束碼放在特殊參數 `$?`，用 `echo $?` 就能看到。`$?` 每執行一個指令就被覆蓋一次，連 `echo $?` 自己也會把它重設為 0，所以要在想檢查的指令之後立刻讀。管線的結束碼是最後一段的結束碼。' },
        { type: 'table', head: ['結束碼', '意義', '例子'], rows: [
          ['0', '成功', '`grep` 找到至少一行；`ps -p` 找到行程；`kill` 送達'],
          ['1', '一般的失敗', '`grep` 沒有找到任何一行；`ps -p` 找不到行程；`kill` 被拒絕'],
          ['2', '用法錯誤或嚴重的錯誤', '`grep` 讀不到檔案；`ls` 存取不到指定的路徑；bash 內建指令的用法錯誤'],
          ['126', '找到了，但無法執行', '檔案沒有執行權限'],
          ['127', '找不到指令', '指令打錯，例如 `pgerp`'],
          ['128＋N', '被訊號 N 結束', '130 是 Ctrl+C（SIGINT），137 是 SIGKILL，143 是 SIGTERM；`kill -l 137` 可以換算'],
        ] },
        { type: 'p', text: '`grep` 是最好的例子：它的結束碼把三種情況分開，0 是有找到、1 是沒找到、2 是發生錯誤。這讓「沒找到」與「檔案根本不存在」可以被區分：`grep -c FATAL` 印出 0 而且結束碼是 1，代表確實讀了檔案、裡面沒有 FATAL；結束碼 2 則代表答案不可信。監控腳本與排程工作就是靠結束碼決定要不要告警，`if`、`&&`、`||` 判斷的也是它（模擬環境不支援這些串接，但 `$?` 可以直接讀）。' },
        { type: 'example', id: 'lnx08-status' },
        { type: 'callout', tone: 'tip', title: '用 pgrep 檢查行程，而不是 ps | grep', text: '`ps aux | grep nginx` 幾乎一定會找到至少一行：`grep nginx` 自己。這一行的 PID 在你讀到時早已結束，對它 `kill` 只會得到 No such process；用它的結束碼判斷「nginx 有沒有在跑」也幾乎總是得到 0。`pgrep -x nginx` 只比對程式名稱、不會選到自己，找不到時結束碼是 1，適合寫進檢查。一定要用 grep 時，可以寫成 `grep \'[n]ginx\'`：樣式仍然比對 nginx，但 grep 自己的指令列裡是 `[n]ginx`，不會符合。' },
      ],
    },
    {
      id: 'lnx08-s-safe', title: '安全地結束一個行程：完整的流程',
      blocks: [
        { type: 'p', text: '把前面的內容串起來，在正式環境結束一個行程時，依序做這幾件事：' },
        { type: 'list', ordered: true, items: [
          '找：用 `top -b -n 1` 或 `ps aux --sort=-%cpu | head`（記憶體則是 `--sort=-%mem`）找出可疑的行程，記下 PID。',
          '確認：用 `ps -o pid,ppid,user,stat,etime,cmd -p PID` 之類的指令看清楚它是誰的、誰叫起來的、在做什麼；不要對 `ps | grep` 的 grep 那一行或它的父行程下手。',
          '想清楚影響：它是不是某個服務的一部分（例如資料庫的後端）？由 systemd 管理的服務改用 `systemctl`；排程工作要知道下次何時會再被叫起來。',
          '先禮貌：`kill PID`（SIGTERM），別人的行程用 `sudo kill PID`。',
          '確認結果：等幾秒後 `ps -p PID` 或 `pgrep -a 名稱`，用 `echo $?` 看它是否還在（1 表示找不到了）。',
          '最後手段：還在的話才 `kill -9 PID`，並在事後檢查它留下的暫存檔、鎖定檔與資料。',
        ] },
        { type: 'p', text: '這台伺服器上的兩個問題剛好對應兩種情況。月報程式屬於 report 帳號，CPU 吃滿是因為查詢一直逾時重試，它會正常回應 SIGTERM，所以用 `sudo kill` 送出 SIGTERM 就夠了；停掉它的父行程 CRON 沒有用，月報只會被 PID 1 收養繼續跑。匯出程式是 learner 自己的 java，它攔截了 SIGTERM 卻在收尾時卡住，SIGTERM 之後仍然存在，這時才輪到 SIGKILL。下面的練習就是這兩件事，以及找出最吃記憶體的行程、讀出檢查指令的結束碼。' },
        { type: 'callout', tone: 'tip', title: '一個 PID，三種「它還在嗎」的寫法', text: '`ps -p 2240`：找到時印出一列，找不到時只印標題，結束碼分別是 0 與 1。`pgrep -a build_report`：印出符合的 PID 與指令列，沒有就什麼都不印、結束碼 1。`kill -0 2240`：不送任何訊號，只檢查行程存在而且你有權限送訊號給它。三者都能接著用 `echo $?` 讀結果。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx08-q1', prompt: '`/usr/sbin/nginx` 只有一個檔案，`pgrep -a nginx` 卻列出 820、821、822 三個 PID。下列哪個說法正確？',
      options: ['nginx 被安裝了三次，每個 PID 對應一個執行檔', '其中兩個是 `pgrep` 自己的行程', '一個程式可以同時有多個行程：820 是 master，821 與 822 是它建立的 worker', 'PID 是程式的編號，同一個程式的 PID 一定相同'],
      answer: 2,
      explanation: '程式是磁碟上的檔案，行程是它正在執行的一份；nginx 的 master（820）再建立兩個 worker（PPID 是 820），所以一個程式有三個行程。並沒有安裝三次；`pgrep` 不會列出自己；PID 是核心給每個行程的號碼，同一個程式的不同行程 PID 各不相同。',
    },
    {
      id: 'lnx08-q2', prompt: '想找出「此刻實際占用最多記憶體」的行程，`ps aux` 的哪個欄位最適合拿來排序？',
      options: ['RSS（或由它算出的 %MEM）', 'VSZ', 'TIME', '%CPU'],
      answer: 0,
      explanation: 'RSS 是行程此刻在實體記憶體裡的大小，%MEM 是它占總記憶體的比例，所以用 `--sort=-rss` 或 `--sort=-%mem`。VSZ 包含只是映射、還沒使用的虛擬記憶體，java 這類程式的 VSZ 常常大得多卻用得不多；TIME 是累計的 CPU 時間；%CPU 是 CPU 使用率，和記憶體無關。',
    },
    {
      id: 'lnx08-q3', prompt: '不加任何選項執行 `kill 2240`，送出的是哪個訊號？',
      options: ['SIGKILL（9）', 'SIGHUP（1）', 'SIGINT（2）', 'SIGTERM（15）'],
      answer: 3,
      explanation: '`kill` 不指定訊號時送 SIGTERM（15），禮貌地請行程結束，程式可以先收尾。SIGKILL 要明確寫 `kill -9`；SIGHUP 是斷線或請常駐程式重新讀取設定，要寫 `kill -HUP`；SIGINT 是按 Ctrl+C 時終端機送出的訊號，也要寫 `kill -INT`。',
    },
    {
      id: 'lnx08-q4', prompt: '為什麼結束一個行程時，應該先送 SIGTERM，確認沒有用之後才送 SIGKILL？',
      options: ['SIGTERM 比較快，SIGKILL 要等好幾秒才生效', 'SIGKILL 由核心直接執行、程式攔不到，沒有機會把資料寫完、刪除鎖定檔與暫存檔；SIGTERM 讓程式自己收尾', 'SIGKILL 只有 root 能送，一般使用者只能用 SIGTERM', 'SIGTERM 結束行程之後會自動重新啟動它'],
      answer: 1,
      explanation: '程式可以攔截 SIGTERM 並先收尾；SIGKILL 無法攔截或忽略，行程立刻消失，留下寫到一半的資料、鎖定檔與 PID 檔。SIGKILL 並不慢，反而是立即的；一般使用者也能對自己的行程送 SIGKILL；SIGTERM 只是請它結束，不會重新啟動任何東西（自動重啟是 systemd 之類的管理程式做的）。',
    },
    {
      id: 'lnx08-q5', prompt: 'learner 執行 `kill 2240`，得到 `bash: kill: (2240) - Operation not permitted`。`ps` 顯示 2240 的 USER 是 report。原因與處理方式是？',
      options: ['行程正在忙，稍後再試一次就會成功', '一般使用者只能送訊號給自己的行程；確認應該停止後，用 `sudo kill 2240`', 'SIGTERM 被忽略了，要改用 `kill -9 2240`', 'PID 打錯了，這個行程不存在'],
      answer: 1,
      explanation: '送訊號的權限規則是：行程的擁有者或 root。2240 屬於 report，learner 不是擁有者，所以被拒絕，要以 root 身分（`sudo kill`）送出。行程忙不忙和權限無關；`kill -9` 一樣會被拒絕，因為問題不在訊號；行程不存在時的訊息是 No such process，不是 Operation not permitted。',
    },
    {
      id: 'lnx08-q6', prompt: '`grep -c FATAL /var/log/reports/2026-10.log` 印出 `0`。接著執行 `echo $?` 會印出什麼？',
      options: ['`0`，因為 grep 成功執行了', '`2`，因為發生了錯誤', '`127`，因為找不到 FATAL', '`1`，因為沒有任何一行符合'],
      answer: 3,
      explanation: 'grep 的結束碼把三種情況分開：有找到是 0、沒找到是 1、錯誤是 2。檔案讀得到但沒有 FATAL，所以是 1，即使 `-c` 印出了 0。0 只在至少一行符合時出現；2 是檔案不存在或讀不到之類的錯誤；127 是 Shell 找不到指令，和樣式有沒有符合無關。',
    },
    {
      id: 'lnx08-q7', prompt: '你在前景執行一個很久的指令，按下 Ctrl+Z 之後它暫停了。想讓它在背景繼續執行、同時拿回提示字元，應該輸入？',
      options: ['`bg`', '`fg`', '`kill -9 %1`', '再按一次 Ctrl+C'],
      answer: 0,
      explanation: 'Ctrl+Z 送出 SIGTSTP 讓前景的工作暫停，`bg` 讓它在背景繼續執行，提示字元仍然屬於你。`fg` 會把它拉回前景、Shell 又要等它結束；`kill -9 %1` 直接結束這個工作，工作就白做了；Ctrl+C 對前景的行程送 SIGINT，而這時前景是 Shell 自己，不會讓暫停的工作繼續。',
    },
    {
      id: 'lnx08-q8', prompt: '`sleep 600 &` 印出 `[1] 2247`。learner 想結束這個背景工作，卻輸入了 `kill -9 1`。結果是？',
      options: ['工作 1 被 SIGKILL 結束', '系統立刻重新開機', '`Operation not permitted`：`1` 是 PID 1（init，屬於 root），工作編號要寫成 `%1`，sleep 仍在執行', '結束 learner 自己的所有行程'],
      answer: 2,
      explanation: '`kill` 的參數不加 `%` 時是 PID，`1` 指的是 init；它屬於 root，一般使用者送訊號會被拒絕，工作 1 毫髮無傷。要結束工作應寫 `kill %1` 或 `kill 2247`。就算用 sudo，核心也不會把 SIGKILL 交給 init，系統不會重新開機；「結束自己所有的行程」是 `kill -9 -1`（PID 寫成 -1）的效果。',
    },
  ],
  terminal: {
    machines: [webHost],
    examples: [
      {
        id: 'lnx08-tree', title: '行程表與父子關係', machine: 'web',
        description: '`ps` 只看自己的終端機；`ps -f -u learner` 加上 PPID；`-o` 與 `-p` 順著 PPID 看出月報是 cron 叫起來的，一個 nginx 程式則有三個行程。',
        steps: [
          { command: 'ps', output: '    PID TTY          TIME CMD\n   1840 pts/0    00:00:00 bash\n   2247 pts/0    00:00:00 ps' },
          { command: 'ps -f -u learner', output: 'UID          PID    PPID  C STIME TTY          TIME CMD\nlearner     1731       1  0 06:00 ?        00:00:00 /bin/sh /opt/exporter/run.sh\nlearner     1733    1731  1 06:00 ?        00:04:20 java -Xmx512m -jar /opt/exporter/exporter.jar --daily\nlearner     1838     702  0 09:52 ?        00:00:00 sshd: learner@pts/0\nlearner     1840    1838  0 09:52 pts/0    00:00:00 -bash\nlearner     2247    1840  0 10:00 pts/0    00:00:00 ps -f -u learner' },
          { command: 'ps -o pid,ppid,user,cmd -p 640,2238,2240', output: '    PID    PPID USER     CMD\n    640       1 root     /usr/sbin/cron -f\n   2238     640 root     /usr/sbin/CRON -f\n   2240    2238 report   python3 /opt/reports/build_report.py --month 2026-10' },
          { command: 'pgrep -a nginx', output: '820 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\n821 nginx: worker process\n822 nginx: worker process' },
          { command: 'ps -o pid,ppid,user,cmd -p 820,821,822', output: '    PID    PPID USER     CMD\n    820       1 root     nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\n    821     820 www-data nginx: worker process\n    822     820 www-data nginx: worker process' },
        ],
      },
      {
        id: 'lnx08-hogs', title: '誰在吃 CPU 與記憶體', machine: 'web',
        description: '`uptime` 看平均負載；依 %CPU 與 %MEM 排序的 `ps aux` 找到兩個不同的行程；`top -b -n 1` 印出整台機器的摘要與最忙的行程。',
        steps: [
          { command: 'uptime', output: ' 10:00:00 up 4 days,  6:48,  1 user,  load average: 1.42, 1.18, 0.77' },
          { command: 'ps aux --sort=-%cpu | head -n 4', output: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nreport      2240 98.7  4.4 402000 184320 ?        R    08:00 118:05 python3 /opt/reports/build_report.py --month 2026-10\npostgres    2246 21.5 30.0 2608000 1258496 ?        Rs   08:00  25:20 postgres: 16/main: report shop [local] SELECT\nlearner     1733  1.2  7.4 3710000 310000 ?        Sl   06:00   4:20 java -Xmx512m -jar /opt/exporter/exporter.jar --daily' },
          { command: 'ps aux --sort=-%mem | head -n 4', output: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\npostgres    2246 21.5 30.0 2608000 1258496 ?        Rs   08:00  25:20 postgres: 16/main: report shop [local] SELECT\nlearner     1733  1.2  7.4 3710000 310000 ?        Sl   06:00   4:20 java -Xmx512m -jar /opt/exporter/exporter.jar --daily\nreport      2240 98.7  4.4 402000 184320 ?        R    08:00 118:05 python3 /opt/reports/build_report.py --month 2026-10' },
          { command: 'top -b -n 1 | head -n 10', output: 'top - 10:00:00 up 4 days,  6:48,  1 user,  load average: 1.42, 1.18, 0.77\nTasks:  17 total,   2 running,  15 sleeping,   0 stopped,   0 zombie\n%Cpu(s): 61.4 us,  0.0 sy,  0.0 ni, 38.6 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st\nMiB Mem :   4096.0 total,   1034.2 free,   2037.8 used,   1024.0 buff/cache\nMiB Swap:      0.0 total,      0.0 free,      0.0 used.   2058.2 avail Mem\n\n    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n   2240 report    20   0  402000 184320      0 R  98.7   4.4 118:05.00 python3\n   2246 postgres  20   0 2608000 1258496      0 R  21.5  30.0  25:20.00 postgres\n   1733 learner   20   0 3710000 310000      0 S   1.2   7.4   4:20.00 java' },
        ],
      },
      {
        id: 'lnx08-jobs', title: '前景與背景工作', machine: 'web',
        description: '兩個背景的 sleep；`kill -TSTP` 代替 Ctrl+Z 暫停工作 1，`bg` 讓它在背景繼續，`fg` 把工作 2 拉回前景，最後 `kill %1` 結束工作 1。',
        steps: [
          { command: 'sleep 600 &', output: '[1] 2247' },
          { command: 'sleep 900 &', output: '[2] 2248' },
          { command: 'jobs', output: '[1]-  Running                 sleep 600 &\n[2]+  Running                 sleep 900 &' },
          { command: 'kill -TSTP %1', output: '[1]-  Stopped                 sleep 600' },
          { command: 'jobs', output: '[1]-  Stopped                 sleep 600\n[2]+  Running                 sleep 900 &' },
          { command: 'bg %1', output: '[1]- sleep 600 &' },
          { command: 'jobs -l', output: '[1]-  2247 Running                 sleep 600 &\n[2]+  2248 Running                 sleep 900 &' },
          { command: 'fg %2', output: 'sleep 900' },
          { command: 'jobs', output: '[1]+  Running                 sleep 600 &' },
          { command: 'kill %1', output: '[1]+  Terminated              sleep 600' },
          { command: 'jobs', output: '' },
        ],
      },
      {
        id: 'lnx08-signals', title: '送出訊號', machine: 'web',
        description: '`kill -l` 列出訊號；送 SIGHUP 給 root 的 nginx master 需要 sudo，送完 PID 不變；背景的 sleep 分別被 SIGTERM 與 SIGKILL 結束，bash 的通知不同。',
        steps: [
          { command: 'kill -l', output: ' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM\n16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP\n21) SIGTTIN\t22) SIGTTOU\t23) SIGURG\t24) SIGXCPU\t25) SIGXFSZ\n26) SIGVTALRM\t27) SIGPROF\t28) SIGWINCH\t29) SIGIO\t30) SIGPWR\n31) SIGSYS' },
          { command: 'kill -l 15', output: 'TERM' },
          { command: 'kill -HUP 820', output: 'bash: kill: (820) - Operation not permitted' },
          { command: 'sudo kill -HUP 820', output: '' },
          { command: 'pgrep -a nginx', output: '820 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\n821 nginx: worker process\n822 nginx: worker process' },
          { command: 'sleep 300 &', output: '[1] 2247' },
          { command: 'kill %1', output: '[1]+  Terminated              sleep 300' },
          { command: 'sleep 300 &', output: '[1] 2248' },
          { command: 'kill -9 %1', output: '[1]+  Killed                  sleep 300' },
        ],
      },
      {
        id: 'lnx08-status', title: '讀出結束碼', machine: 'web',
        description: 'grep 的 0、1、2；`ps -p` 找不到行程時的 1；`echo $?` 自己也會把 `$?` 重設為 0；`kill -l` 把 137、143 換回訊號名稱。',
        steps: [
          { command: 'grep -c timeout /var/log/reports/2026-10.log', output: '2' },
          { command: 'echo $?', output: '0' },
          { command: 'grep -c FATAL /var/log/reports/2026-10.log', output: '0' },
          { command: 'echo $?', output: '1' },
          { command: 'grep FATAL /var/log/reports/2026-09.log', output: 'grep: /var/log/reports/2026-09.log: No such file or directory' },
          { command: 'echo $?', output: '2' },
          { command: 'ps -p 4242', output: '    PID TTY          TIME CMD' },
          { command: 'echo $?', output: '1' },
          { command: 'echo $?', output: '0' },
          { command: 'kill -l 137', output: 'KILL' },
          { command: 'kill -l 143', output: 'TERM' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx08-report', title: '停下失控的月報程式', machine: 'web',
        statement: '網站變慢了。找出把 CPU 吃滿的行程（它是 report 帳號的月報程式，正在不斷重試逾時的查詢），先用 SIGTERM 請它結束，確認它已經不在了。nginx、PostgreSQL 與 learner 的匯出程式（java）都不能受到影響。',
        checks: [
          { kind: 'process', pid: 2240, absent: true },
          { kind: 'process', pid: 820, user: 'root' },
          { kind: 'process', pid: 905, user: 'postgres' },
          { kind: 'process', pid: 1733 },
        ],
        solution: ['ps aux --sort=-%cpu | head -n 3', 'ps -o pid,ppid,user,cmd -p 2240', 'sudo kill 2240', 'ps -p 2240'],
        mistakes: [
          { commands: ['kill 2240'], why: '2240 屬於 report 帳號，一般使用者只能送訊號給自己的行程：`Operation not permitted`，月報仍在執行。要用 `sudo kill 2240`。' },
          { commands: ['sudo kill 2238'], why: '2238 是父行程 CRON，不是月報本身。父行程結束後，月報（2240）被 PID 1 收養，照樣吃滿 CPU。' },
          { commands: ['ps aux | grep build_report', 'sudo kill 2248'], why: '2248 是 `grep build_report` 那一行，也就是 grep 自己；它在你讀到結果時早已結束，所以是 No such process，真正的月報沒有收到任何訊號。' },
          { commands: ['sudo pkill postgres'], why: '資料庫也很忙，但它是整個網站的資料庫：所有 postgres 行程都被停掉，網站完全無法下單，而失控的月報（2240）仍在執行。' },
        ],
        hints: [
          '`ps aux --sort=-%cpu | head -n 3` 把最忙的行程排在最前面，記下它的 PID 與 USER。',
          'USER 不是你自己時，要用 sudo 才能送訊號。',
          '`kill` 不加訊號就是 SIGTERM；送完用 `ps -p PID` 確認，只剩標題列就表示它已經結束。',
        ],
        explanation: '依 %CPU 排序後，最上面的是 report 的 `python3 /opt/reports/build_report.py`（PID 2240，98.7%）。它屬於 report，所以 learner 要用 `sudo kill 2240`；不加訊號送出的是 SIGTERM，月報程式會正常回應並結束，`ps -p 2240` 只剩標題列。`sudo kill -9 2240` 也能讓它消失，檢查只看結果，同樣會通過；但 SIGKILL 跳過了程式的收尾（關閉資料庫連線、刪除寫到一半的報表檔），只有在 SIGTERM 無效時才用。停掉父行程 CRON、對 grep 那一行下手，或把資料庫一起停掉，都沒有解決問題。',
      },
      {
        id: 'lnx08-exporter', title: '叫不停的匯出程式', machine: 'web',
        statement: 'learner 早上啟動的匯出程式（`java … exporter.jar`）已經沒有用了，請讓它結束。依正確的順序：先送 SIGTERM，確認它是否還在，必要時才升級。由 `run.sh` 啟動的外層 Shell 可以留著，但其他人的行程（nginx、PostgreSQL、月報）都不要動。',
        checks: [
          { kind: 'process', pid: 1733, absent: true },
          { kind: 'process', pid: 820 },
          { kind: 'process', pid: 905 },
          { kind: 'process', pid: 2240, user: 'report' },
        ],
        solution: ['pgrep -a java', 'kill 1733', 'ps -p 1733 -o pid,stat,cmd', 'kill -9 1733', 'ps -p 1733'],
        mistakes: [
          { commands: ['kill 1733'], why: '這個 java 程式攔截了 SIGTERM，卻在收尾時卡住，所以它還在。確認 `ps -p 1733` 仍有這一列之後，下一步是 `kill -9 1733`。' },
          { commands: ['pkill java'], why: '`pkill` 預設送的也是 SIGTERM，同樣被這個程式攔下來，java 仍在執行。' },
          { commands: ['kill -9 1731'], why: '1731 是外層的 `/bin/sh /opt/exporter/run.sh`，java 的父行程。殺掉父行程之後，java 被 PID 1 收養，照樣在跑。' },
          { commands: ['sudo kill -9 1'], why: '`1` 是 PID 1（init），不是工作編號 `%1`，也不是 java。核心不會把 SIGKILL 交給 init，所以什麼都沒發生，匯出程式仍在。' },
        ],
        hints: [
          '`pgrep -a java` 找出 PID；它屬於 learner，所以不需要 sudo。',
          '先 `kill PID`，再用 `ps -p PID` 看看它是否還在。',
          'SIGTERM 無效時，SIGKILL（`kill -9`）是最後手段，程式無法攔截。',
        ],
        explanation: '`pgrep -a java` 找到 1733。`kill 1733` 送出 SIGTERM，但 `ps -p 1733` 顯示它還在：這個程式自己處理 SIGTERM，收尾時卡住了。確認之後才 `kill -9 1733`，SIGKILL 由核心直接結束行程，`ps -p 1733` 只剩標題列。直接從 `kill -9` 開始也會得到相同的結果、通過檢查，但正確的習慣是先給程式收尾的機會：多數程式對 SIGTERM 的反應都正常，只有確認無效時才升級。殺掉父行程 run.sh、或把 `1` 當成工作編號，都碰不到 java。',
      },
      {
        id: 'lnx08-memory', title: '誰占用最多記憶體', machine: 'web',
        statement: '印出此刻占用最多實體記憶體（RSS）的行程的 PID。最後印出的那一行要和 `ps -eo pid` 的一列格式相同：只有 PID 一欄（含前面的空白），沒有標題。換到另一個時刻，你的指令也要印出當時的答案。',
        checks: [{ kind: 'output' }],
        solution: ['ps -eo pid,user,rss,comm --sort=-rss | head -n 4', 'ps -eo pid --sort=-rss | head -n 2 | tail -n 1'],
        variants: [
          { label: '月報程式記憶體外洩的時候', files: [], processes: LEAKING_REPORT },
          { label: '月初、沒有月報的時候', files: [], processes: NO_REPORT },
        ],
        mistakes: [
          { commands: ['echo "   2246"'], why: '直接打出現在看到的答案：換一個時刻，最吃記憶體的行程就不同了。' },
          { commands: ['ps -eo pid --sort=-%cpu | head -n 2 | tail -n 1'], why: '這是 CPU 最忙的月報程式（2240），不是記憶體最多的；CPU 與記憶體的排行不一定相同。' },
          { commands: ['ps -eo pid --sort=-vsz | head -n 2 | tail -n 1'], why: 'VSZ 是虛擬記憶體，包含只是映射、沒有真正使用的部分；java 的 VSZ 最大，實際占用卻遠少於 PostgreSQL 的後端。' },
          { commands: ['ps -eo pid --sort=rss | head -n 2 | tail -n 1'], why: '沒有 `-` 是由小到大排序，選到的是幾乎不用記憶體的核心執行緒。' },
          { commands: ['ps -eo pid --sort=-rss | head -n 1'], why: '第一行是標題 `PID`，還要再往下一行。' },
        ],
        hints: [
          '`ps -eo pid --sort=-rss` 只印 PID 一欄，依 RSS 由大到小排序（`--sort=-%mem` 的順序相同）。',
          '`head -n 2` 留下標題與第一列，`tail -n 1` 再只留下最後一行。',
        ],
        explanation: '`ps -eo pid --sort=-rss` 列出每個行程的 PID，依常駐記憶體由大到小排序；`head -n 2 | tail -n 1` 跳過標題、只留下第一名。此刻的答案是 PostgreSQL 替月報查詢開的後端（2246），月報外洩時換成 2240，月初則是長大了的 java（1733）。依 %CPU 排序找到的是最忙、不是最大的行程；VSZ 會被只映射不使用的記憶體灌大；少了 `-` 則是由小排到大。',
      },
      {
        id: 'lnx08-health', title: '讀出健康檢查的結束碼', machine: 'web',
        statement: '監控腳本靠結束碼判斷網站伺服器是否還在。請用 `pgrep` 檢查有沒有名稱剛好是 `nginx` 的行程，緊接著印出這個檢查的結束碼（0 表示有、1 表示沒有）。你的指令在 nginx 當掉的時候也必須印出正確的結束碼。',
        checks: [{ kind: 'output' }],
        solution: ['pgrep -x nginx', 'echo $?'],
        variants: [{ label: 'nginx 當掉的時候', files: [], processes: NGINX_DOWN }],
        mistakes: [
          { commands: ['echo 0'], why: '直接打出現在的答案：nginx 當掉的時候，正確的結束碼是 1。' },
          { commands: ['echo $?'], why: '還沒有執行任何檢查，`$?` 是之前的結束碼（0），和 nginx 在不在無關。' },
          { commands: ['ps aux | grep nginx', 'echo $?'], why: '`grep nginx` 永遠會選到它自己那一行，所以結束碼一直是 0，nginx 當掉時也一樣。' },
          { commands: ['pgrep -x nginx', 'date', 'echo $?'], why: '`$?` 只記得上一個指令：中間的 `date` 成功了，`$?` 已經被它覆蓋成 0。' },
        ],
        hints: [
          '`pgrep -x nginx` 只比對名稱剛好是 nginx 的行程，找到時結束碼 0、找不到時 1。',
          '`$?` 是上一個指令的結束碼，要在檢查之後立刻讀。',
        ],
        explanation: '`pgrep -x nginx` 找到 820、821、822，結束碼 0；nginx 當掉時什麼都不印，結束碼 1。緊接著的 `echo $?` 印出這個數字（`pidof nginx` 也有同樣的 0／1）。`ps aux | grep nginx` 會選到 grep 自己，永遠成功；中間多執行任何一個指令，`$?` 就變成那個指令的結束碼。',
      },
    ],
  },
};
