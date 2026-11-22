import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX13 Bash Scripting (LNX-4). A terminal lesson on the scripting profile (engine stage E8): a script file and its
 * shebang, running it with chmod u+x and ./script.sh versus bash script.sh (and why script.sh alone is not found),
 * variables and quoting ("$var" with spaces), the positional parameters $0 $1 $# "$@", command substitution and
 * arithmetic, exit status as the condition of if, test / [ ] / [[ ]] for files, strings and integers, for and while
 * loops, case, functions with local and return, reading input with read, and robust scripts: set -euo pipefail with what
 * each part does and its caveats (conditions, && and ||, ((n++)), local x=$(...), SIGPIPE), set -x, error messages on
 * standard error and a non-zero exit. The simulated terminal reads one line at a time, so script files are written with
 * printf '%s\n' at the prompt; the text explains here-documents and editors for real machines. One tools host for the
 * transcripts and one small machine per exercise; host names, users and files are made up. Every transcript output was
 * produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const lines = (...rows: string[]) => rows.map(r => `${r}\n`).join('');
/** A script file written at the prompt: printf repeats '%s\n' for every argument, one line each (no line may contain '). */
const writeScript = (path: string, rows: string[]) => `printf '%s\\n' ${rows.map(r => `'${r}'`).join(' ')} > ${path}`;
const HOME = '/home/learner';
const BASE = [dir('/home', 'root'), dir(HOME)];

// ---------------------------------------------------------------------------------------------------- transcripts
const HELLO = lines(
  '#!/bin/bash',
  '# hello.sh：第一支指令稿',
  'echo "Hello from $(hostname)"',
  'echo "Today is $(date +%F); this is $0"',
);
const ARGS = lines(
  '#!/bin/bash',
  'echo "\\$0=$0  \\$#=$#  \\$1=$1"',
  'echo "quoted:"',
  'for f in "$@"; do echo "  [$f]"; done',
  'echo "unquoted:"',
  'for f in $@; do echo "  [$f]"; done',
);
const INVENTORY_LIST = lines(
  '# host     role',
  'web-01     web',
  'web-02     web',
  'db-01      db',
  'cache-01   redis',
);
const INVENTORY = lines(
  '#!/bin/bash',
  'set -euo pipefail',
  '',
  '# 依角色說明一台主機；不認得的角色回傳 1',
  'describe() {',
  '  local host=$1 role=$2',
  '  case "$role" in',
  '    web|api) echo "$host: 前端服務" ;;',
  '    db)      echo "$host: 資料庫，備份前先停止寫入" ;;',
  '    *)       echo "$host: 不認得的角色 $role" >&2; return 1 ;;',
  '  esac',
  '}',
  '',
  'list=${1:-inventory.txt}',
  'if [[ ! -f "$list" ]]; then',
  '  echo "inventory: 找不到清單 $list" >&2',
  '  exit 1',
  'fi',
  '',
  'ok=0',
  'bad=0',
  'while read -r host role; do',
  '  [[ -z "$host" || "$host" == "#"* ]] && continue',
  '  if describe "$host" "$role"; then',
  '    ok=$((ok + 1))',
  '  else',
  '    bad=$((bad + 1))',
  '  fi',
  'done < "$list"',
  'echo "完成：$ok 台已分類，$bad 台無法分類"',
  'if (( bad > 0 )); then',
  '  exit 3',
  'fi',
);
const GREET = lines(
  '#!/bin/bash',
  'read -r -p "Your name? " name',
  'echo "Hi, ${name:-stranger}!"',
);
const CLEAN = (strict: boolean) => lines(
  '#!/bin/bash',
  ...strict ? ['set -euo pipefail'] : [],
  '# 清掉 build/tmp 裡的舊日誌',
  'cd "$HOME/build/tmp"',
  'rm -f *.log',
  'echo "cleaned $(pwd)"',
);

/**
 * The transcripts' machine: a tools host with a first script (not executable yet), a script that prints its arguments,
 * an inventory script with a function, case and a while-read loop, a script that reads a name, two cleanup scripts (one
 * with set -euo pipefail) whose target folder does not exist, two logs in the home folder and reports with spaces in names.
 */
const toolsHost: TerminalMachine = {
  id: 'tools', title: '維運工具主機 tools-01', user: 'learner', host: 'tools-01', cwd: HOME, profile: 'scripting',
  files: [
    ...BASE,
    file(`${HOME}/args.sh`, ARGS, 'learner', 0o755),
    dir(`${HOME}/build`),
    file(`${HOME}/clean-loose.sh`, CLEAN(false), 'learner', 0o755),
    file(`${HOME}/clean-strict.sh`, CLEAN(true), 'learner', 0o755),
    file(`${HOME}/deploy.log`, lines('2026-11-21 23:10 deploy v2.4.0 ok')),
    file(`${HOME}/error.log`, lines('2026-11-22 03:12 disk usage 91%')),
    file(`${HOME}/greet.sh`, GREET, 'learner', 0o755),
    file(`${HOME}/hello.sh`, HELLO),
    file(`${HOME}/inventory.sh`, INVENTORY, 'learner', 0o755),
    file(`${HOME}/inventory.txt`, INVENTORY_LIST),
    dir(`${HOME}/reports`),
    file(`${HOME}/reports/notes.md`, lines('# 會議紀錄')),
    file(`${HOME}/reports/q3 summary.txt`, lines('Q3 revenue up 4%')),
    file(`${HOME}/reports/q4.txt`, lines('Q4 plan draft')),
  ],
};

// ---------------------------------------------------------------------------------------------------- exercise 1: backup
/** Exercise 1: a file server with a small web site to back up and an empty backups folder. */
const backupHost: TerminalMachine = {
  id: 'bk', title: '檔案伺服器 files-02', user: 'learner', host: 'files-02', cwd: HOME, profile: 'scripting',
  files: [
    ...BASE,
    dir(`${HOME}/backups`),
    dir(`${HOME}/site`),
    file(`${HOME}/site/about.html`, lines('<h1>About us</h1>')),
    dir(`${HOME}/site/css`),
    file(`${HOME}/site/css/style.css`, lines('h1 { color: teal; }')),
    file(`${HOME}/site/index.html`, lines('<h1>Welcome</h1>')),
  ],
};
const BACKUP_LINES = [
  '#!/bin/bash',
  'set -euo pipefail',
  'if [[ ! -d "$1" ]]; then',
  '  echo "backup: no such directory: $1" >&2',
  '  exit 1',
  'fi',
  'dest="$HOME/backups/$1-$(date +%F)"',
  'cp -r "$1" "$dest"',
  'echo "saved $dest"',
];
const BACKUP_CHECK = './backup.sh sitee; echo "exit=$?"; ./backup.sh site && ls backups/*';

// ---------------------------------------------------------------------------------------------------- exercise 2: levels
const APP_LOG = lines(
  'INFO  server started on :8080',
  'INFO  user alice logged in',
  'WARN  slow query took 2300 ms',
  'ERROR payment gateway timeout',
  'INFO  retrying after ERROR in payment',
  'WARN  disk usage 85%',
  'INFO  user bob logged in',
  'ERROR payment gateway timeout',
);
const QUIET_LOG = lines(
  'INFO  server started on :8080',
  'WARN  certificate expires in 20 days',
  'INFO  user carol logged in',
  'INFO  nightly report sent',
  'INFO  no ERROR seen since restart',
);
/** Exercise 2: a log host with an application log whose levels start each line. */
const logHost: TerminalMachine = {
  id: 'logs', title: '日誌主機 log-03', user: 'learner', host: 'log-03', cwd: HOME, profile: 'scripting',
  files: [...BASE, file(`${HOME}/app.log`, APP_LOG)],
};
const LEVELS_LINES = [
  '#!/bin/bash',
  'set -euo pipefail',
  'if [[ $# -ne 1 ]]; then',
  '  echo "usage: levels.sh LOGFILE" >&2',
  '  exit 2',
  'fi',
  'for level in ERROR WARN INFO; do',
  '  n=$(grep -c "^$level " "$1" || true)',
  '  echo "$level $n"',
  'done',
];
const LEVELS_CHECK = './levels.sh; ./levels.sh app.log';

// ---------------------------------------------------------------------------------------------------- exercise 3: spaces
const ARCHIVE_BUGGY = lines(
  '#!/bin/bash',
  'set -euo pipefail',
  '# 把 inbox 裡的 .txt 移到 archive，並印出每個檔案',
  'for f in $(ls inbox/*.txt); do',
  '  mv $f archive/',
  '  echo "moved $f"',
  'done',
);
const ARCHIVE_LINES = ['#!/bin/bash', 'set -euo pipefail', 'for f in inbox/*.txt; do', '  mv "$f" archive/', '  echo "moved $f"', 'done'];
/** Exercise 3: a shared folder host whose archive script breaks on the first file name with a space. */
const shareHost: TerminalMachine = {
  id: 'share', title: '共用資料夾主機 share-01', user: 'learner', host: 'share-01', cwd: HOME, profile: 'scripting',
  files: [
    ...BASE,
    dir(`${HOME}/archive`),
    file(`${HOME}/archive.sh`, ARCHIVE_BUGGY, 'learner', 0o755),
    dir(`${HOME}/inbox`),
    file(`${HOME}/inbox/meeting notes.txt`, lines('週會：下週二上線')),
    file(`${HOME}/inbox/q4 plan.txt`, lines('Q4：完成備份自動化')),
    file(`${HOME}/inbox/scan.pdf`, lines('%PDF-1.7')),
    file(`${HOME}/inbox/todo.txt`, lines('更新憑證')),
  ],
};

// ---------------------------------------------------------------------------------------------------- exercise 4: pipefail
const ORDERS = (rows: string[]) => lines(...rows);
/** Exercise 4: an ETL host where today's orders file arrives in data/ and the report goes to out/. */
const etlHost: TerminalMachine = {
  id: 'etl', title: '資料轉檔主機 etl-02', user: 'learner', host: 'etl-02', cwd: HOME, profile: 'scripting', now: '2026-11-22 10:00:00',
  files: [
    ...BASE,
    dir(`${HOME}/data`),
    file(`${HOME}/data/orders-2026-11-22.csv`, ORDERS(['1001,alice,320', '1002,bob,150', '1003,alice,90', '1004,carol,410', '1005,bob,75'])),
    dir(`${HOME}/out`),
  ],
};
const EXPORT_LINES = [
  '#!/bin/bash',
  'set -euo pipefail',
  'src="data/orders-$(date +%F).csv"',
  'cut -d, -f2 "$src" | sort | uniq -c > out/customers.txt',
  'touch out/READY',
  'echo "exported $(wc -l < out/customers.txt) customers from $src"',
];
const EXPORT_CHECK = './export.sh; echo "exit=$?"; ls out';

export const LNX13: LessonContent = {
  lessonId: 'LNX13',
  motivation: '每天早上登入伺服器，依序打同樣的十幾個指令備份網站、清掉暫存檔、數一數日誌裡的錯誤：做久了一定會打錯一次，而且換了值班的人就沒人記得順序。把這些指令寫成 Bash Script，就能每次以同樣的方式執行、交給同事、放進版本控制，之後再交給 cron 或 systemd timer 自動執行（LNX14）。但指令稿也會放大錯誤：一個沒加引號的變數遇到含空白的檔名就拆成兩半，一個失敗的 `cd` 之後，`rm` 照樣在錯誤的目錄執行。本課在一台維運主機上，從 shebang 與執行權限開始，依序學會變數與引號、位置參數、命令替換與算術、以結束碼為基礎的條件判斷、迴圈、case 與函式，最後用 `set -euo pipefail`、`set -x` 與清楚的錯誤訊息，寫出遇到錯誤就停下來的可靠指令稿。',
  sections: [
    {
      id: 'lnx13-s-file', title: '指令稿檔案、shebang 與執行方式',
      blocks: [
        { type: 'p', text: 'Bash Script（指令稿）就是把平常在提示字元輸入的指令，依序寫進一個文字檔，再交給 bash 一行一行讀取執行。提示字元上能用的一切，指令稿裡都能用；反過來，本課在提示字元示範的變數、if 與 for，也可以直接寫進指令稿。檔名的 `.sh` 只是給人看的慣例，Linux 不靠副檔名決定怎麼執行檔案。' },
        { type: 'p', text: '第一行的 `#!/bin/bash` 稱為 shebang。以 `./hello.sh` 執行檔案時，核心看到檔案開頭是 `#!`，就執行後面寫的直譯器，並把檔案的路徑當成參數交給它，所以 `./hello.sh` 實際上是 `/bin/bash ./hello.sh`。也常見 `#!/usr/bin/env bash`，它在 PATH 裡找 bash，適合 bash 不在 /bin 的系統。注意 `#!/bin/sh` 不一定是 bash：Debian 與 Ubuntu 的 /bin/sh 是較精簡的 dash，不支援本課的 `[[ ]]`、`(( ))` 等 bash 語法，用了這些語法就要寫 `#!/bin/bash`。用 Windows 編輯器存檔、行尾變成 CRLF 時，第一行會變成 `/bin/bash` 加上一個看不見的 `\\r`，執行時出現 `bad interpreter: No such file or directory`。' },
        { type: 'table', head: ['執行方式', '需要的權限', 'shebang', '說明'], rows: [
          ['`./hello.sh`', '讀取（r）與執行（x）', '使用', '在子行程執行；`$0` 是 `./hello.sh`'],
          ['`bash hello.sh`', '只要讀取（r）', '不使用（第一行只是註解）', '明確指定由 bash 執行；`$0` 是 `hello.sh`'],
          ['`hello.sh`（不加路徑）', '讀取與執行', '使用', 'bash 只在 PATH 的目錄裡找指令，目前目錄不在 PATH 裡（安全的預設），所以是 command not found；要這樣執行，得把檔案放進 PATH 裡的目錄，例如 `/usr/local/bin`'],
          ['`source hello.sh` 或 `. hello.sh`', '只要讀取', '不使用', '在目前的 Shell 裡執行，裡面設定的變數與 `cd` 會留下來，常用來載入設定檔'],
        ] },
        { type: 'p', text: '新建立的檔案通常是 `-rw-r--r--`（644），沒有任何人能執行它。`chmod u+x hello.sh` 只替擁有者加上 x，結果是 `-rwxr--r--`（744）；`chmod +x` 沒有指定對象，擁有者、群組與其他人都會加上 x（umask 遮掉的位元除外），通常得到 755。只有自己要執行的指令稿，用 `u+x` 就夠了。' },
        { type: 'p', text: '在真實的機器上，指令稿用 nano 或 vim 這類編輯器撰寫，或在提示字元用 here-document 一次寫進多行：輸入 `cat > hello.sh <<\'EOF\'` 後逐行輸入內容，最後單獨一行 `EOF` 結束；`EOF` 加上引號，內容裡的 `$` 才會原樣寫進檔案，而不是在寫入的當下就被展開。本課模擬的終端機一次只讀一行，所以用 `printf \'%s\\n\' \'第一行\' \'第二行\' … > 檔案` 寫出整個檔案：printf 對每個參數重複使用 `%s\\n` 這個格式，每個參數就成為一行；每一行用單引號包住，裡面的 `$`、雙引號與空白都會照字面寫入。寫好之後用 `cat` 檢查內容，用 `bash -n 檔案` 只檢查語法而不執行。' },
        { type: 'example', id: 'lnx13-first' },
        { type: 'callout', tone: 'tip', title: '註解與第一行', text: '`#` 開頭的行是註解，bash 不執行；shebang 也是以 `#` 開頭，所以用 `bash hello.sh` 執行時它就只是一行註解。在指令稿開頭用註解寫下用途、用法與需要的權限，下一個維護的人（包括幾個月後的你）會感謝你。' },
      ],
    },
    {
      id: 'lnx13-s-vars', title: '變數、引號與位置參數',
      blocks: [
        { type: 'p', text: '設定變數寫成 `名稱=值`，等號兩邊不能有空白：`count = 3` 會被當成執行一個叫 count 的指令，參數是 `=` 與 `3`，結果是 command not found。讀取時寫 `$名稱` 或 `${名稱}`，後面緊接著字母或數字時要用大括號，例如 `${name}_old`。Bash 的變數都是字串；`export` 過的變數才會傳給子行程（環境變數）。慣例上指令稿自己的變數用小寫，環境變數（PATH、HOME）用大寫，避免不小心蓋掉它們。' },
        { type: 'table', head: ['寫法', '`$` 與 `$( )` 會展開嗎', '依空白拆成多個字嗎', '萬用字元會展開嗎'], rows: [
          ['單引號 `\'$file\'`', '不會，完全照字面', '不會', '不會'],
          ['雙引號 `"$file"`', '會', '不會，結果永遠是一個字', '不會'],
          ['沒有引號 `$file`', '會', '會，依 IFS（空白、Tab、換行）拆開', '會'],
        ] },
        { type: 'p', text: '沒有引號的變數，展開之後還會經過拆字與萬用字元展開，這是指令稿最常見的錯誤來源：值是 `reports/q3 summary.txt` 時，`ls -l $file` 讓 ls 收到 `reports/q3` 與 `summary.txt` 兩個參數；值是空字串時，參數乾脆消失。規則很簡單：除非你明確想要拆字，每次使用變數都寫成 `"$file"`。' },
        { type: 'p', text: '執行指令稿時寫在後面的參數，稱為位置參數。`./backup.sh site` 的 `site` 在指令稿裡是 `$1`；它們只在這一次執行中有效：' },
        { type: 'table', head: ['參數', '意義'], rows: [
          ['`$0`', '指令稿的名稱，照輸入的寫法（`./args.sh` 或 `args.sh`）'],
          ['`$1`…`$9`、`${10}`', '第 1 到第 9 個參數，第 10 個起要加大括號'],
          ['`$#`', '參數的個數'],
          ['`"$@"`', '所有參數，每個參數各自是一個字（含空白的參數不會被拆開），轉交參數時幾乎都用它'],
          ['`"$*"`', '所有參數用空白接成一個字串'],
          ['`$?`', '上一個指令的結束碼'],
        ] },
        { type: 'p', text: '命令替換 `$(指令)` 把指令的輸出（去掉結尾的換行）放進字串，例如 `n=$(ls reports | wc -l)`；舊的寫法是反引號，`$( )` 比較容易巢狀，也不容易和單引號看錯。算術展開 `$(( ))` 做整數運算：`$((n * 10))`、`$((i + 1))`，括號裡的變數名稱可以不加 `$`；bash 只有整數，沒有小數。參數展開還能順便處理字串：`${file##*/}` 去掉最後一個 `/` 之前的部分（取出檔名），`${file%.txt}` 去掉結尾的 .txt，`${1:-inventory.txt}` 在沒有參數時使用預設值。' },
        { type: 'example', id: 'lnx13-vars' },
        { type: 'callout', tone: 'warning', title: '賦值時的引號不會跟著變數走', text: '常見的誤解是：「`file="q3 summary.txt"` 已經加了引號，之後就安全了。」賦值時的引號只決定存進去的值；之後每一次使用 `$file`，沒有引號就會重新依空白拆開。同樣地，`for f in $@` 會把 `"q3 summary.txt"` 拆成兩個字，要寫成 `for f in "$@"`。' },
      ],
    },
    {
      id: 'lnx13-s-test', title: '結束碼與條件：if、test、[ ] 與 [[ ]]',
      blocks: [
        { type: 'p', text: '每個指令結束時都會回報一個 0 到 255 的結束碼：0 代表成功，其他數字代表各種失敗（LNX08）。Bash 的條件判斷沒有另外的布林型別，`if 指令; then … fi` 就是執行那個指令，結束碼是 0 時走 then，否則走 else。所以任何指令都可以當條件：`if cp a b; then`、`if grep ERROR app.log > /dev/null; then`（真實系統常寫 `grep -q`，模擬環境的 grep 沒有 -q）。`&&` 在前一個成功時才執行下一個，`||` 在前一個失敗時才執行，`!` 把成功與失敗反過來。' },
        { type: 'p', text: '要比較檔案、字串或數字時，用專門回報結束碼的指令：`test` 與它的另一個名字 `[`（最後一個參數必須是 `]`，而且每個部分之間都要有空白，`[$a -gt 3]` 是錯的）。bash 另外有關鍵字 `[[ ]]`，裡面的變數不會被拆字，也多了樣式比對；整數運算用 `(( ))`，例如 `(( i <= 3 ))`。' },
        { type: 'table', head: ['種類', '寫法', '成立的條件'], rows: [
          ['檔案', '`-e 路徑`、`-f 路徑`、`-d 路徑`', '存在、是一般檔案、是目錄'],
          ['檔案', '`-r`、`-w`、`-x`、`-s`', '目前的使用者可讀、可寫、可執行；檔案大小不是 0'],
          ['字串', '`"$a" = "$b"`、`"$a" != "$b"`', '相同、不同（`[ ]` 裡建議用 POSIX 的 `=`，`==` 是 bash 的擴充；`[[ ]]` 兩者都可以）'],
          ['字串', '`-z "$a"`、`-n "$a"`', '是空字串、不是空字串'],
          ['整數', '`-eq -ne -lt -le -gt -ge`', '等於、不等於、小於、小於等於、大於、大於等於'],
          ['只有 `[[ ]]`', '`$host == "#"*`、`$a =~ ^[0-9]+$`', '右邊是萬用字元樣式（加引號的部分照字面）、延伸正規表示式'],
          ['只有 `[[ ]]`', '`&&`、`||`、`( )`', '在條件裡組合；`[ ]` 要寫成兩個 `[ ]` 用 `&&` 連接'],
        ] },
        { type: 'p', text: '`[ ]` 是普通的指令，參數在交給它之前就經過展開：`$missing` 是空的而且沒有引號時，`test $missing = yes` 只收到 `= yes` 兩個參數，於是回報 `unary operator expected`。`[[ ]]` 是 bash 的語法，不拆字，所以同樣的寫法只是不成立而已。寫 `[ ]` 時一律替變數加上引號；寫 bash 指令稿時，`[[ ]]` 通常比較不容易出錯。下面的紀錄也示範了 for 與 while 迴圈，下一節再詳細說明。' },
        { type: 'example', id: 'lnx13-test' },
        { type: 'callout', tone: 'warning', title: '`>` 與 `<` 不是數字比較', text: '`[ $a > $b ]` 看起來在比較 10 與 9，其實 `>` 是重新導向：它建立了一個名為 9 的空檔案，`[` 只收到 `10` 一個參數，而非空字串一律成立，所以不論數字多少都「成立」。`[[ $a < $b ]]` 則是字串的排序比較，`10` 排在 `9` 前面，所以也成立。比較整數請用 `-gt`、`-lt`，或 `(( a > b ))`。' },
      ],
    },
    {
      id: 'lnx13-s-loops', title: '迴圈、case 與讀取輸入',
      blocks: [
        { type: 'p', text: '`for 變數 in 清單; do … done` 對清單裡的每個字執行一次。清單可以是直接寫出的字（`for level in ERROR WARN INFO`）、萬用字元（`for f in reports/*.txt`，每個檔名都是完整的一個字，即使含有空白）或 `"$@"`；也可以寫成 C 語言風格的 `for (( i = 1; i <= 3; i++ ))`。`while 條件; do … done` 在條件成立時重複執行，`until` 則在條件成立之前重複；`break` 跳出迴圈，`continue` 直接進入下一輪。' },
        { type: 'table', head: ['想做的事', '寫法'], rows: [
          ['處理一批檔案', '`for f in logs/*.log; do … "$f" …; done`'],
          ['處理每個參數', '`for arg in "$@"; do … done`'],
          ['逐行讀取檔案', '`while IFS= read -r line; do … done < 檔案`'],
          ['把每行拆成欄位', '`while read -r host role; do … done < 檔案`'],
          ['數到某個數字', '`for (( i = 1; i <= 5; i++ )); do … done`'],
        ] },
        { type: 'p', text: '讀取輸入用內建指令 `read`：它從標準輸入讀一行，依 IFS 拆開後放進變數，最後一個變數拿到剩下的全部。`-r` 讓反斜線保持原樣（幾乎都要加），`IFS=` 讓行首與行尾的空白保留下來。逐行處理檔案要用 `while read`，不要寫 `for line in $(cat 檔案)`：後者依空白拆字，一行裡的每個字都會變成一輪。`read -p "提示" 變數` 會先印出提示，但只在輸入來自終端機時才顯示；放進排程或管線的指令稿沒有人可以回答，所以輸入最好來自參數或檔案。模擬環境沒有鍵盤，要提供輸入時用 `<` 檔案、管線或 here-string `<<< "文字"`。' },
        { type: 'p', text: '`case` 用萬用字元樣式比對一個值，比一長串 `if … elif` 清楚：`case "$role" in web|api) … ;; db) … ;; *) … ;; esac`。每個分支以 `樣式)` 開頭、以 `;;` 結束，`|` 表示「或」，`*)` 接住其他所有的值；第一個符合的分支執行後就結束整個 case。' },
      ],
    },
    {
      id: 'lnx13-s-func', title: '函式：local 與 return',
      blocks: [
        { type: 'p', text: '函式寫成 `名稱() { …; }`，定義之後就能像指令一樣呼叫，也能接參數：在函式裡，`$1`、`$2`、`$#`、`"$@"` 是呼叫時給函式的參數，`$0` 仍是指令稿的名稱。函式必須先定義，才能在後面呼叫，所以指令稿通常把函式放在前面。' },
        { type: 'p', text: '函式裡設定的變數預設是全域的，會改到指令稿其他地方的同名變數；用 `local host=$1` 宣告的變數只存在於這次呼叫。`return N` 結束函式並設定它的結束碼（0 到 255），沒有寫 N 時是最後一個指令的結束碼。return 傳回的是成功或失敗，不是資料：要把結果交給呼叫者，在函式裡 `echo` 出來，呼叫時用 `結果=$(函式 參數)` 接住。' },
        { type: 'p', text: '下面的 inventory.sh 把前面的元件組合起來：`describe` 函式用 local 保存參數，以 case 依角色印出說明，不認得的角色把訊息寫到標準錯誤並 `return 1`；主程式用 `${1:-inventory.txt}` 給清單一個預設值，`[[ ! -f "$list" ]]` 檢查清單是否存在，`while read -r host role` 逐行讀取，跳過空行與 `#` 開頭的註解，再依函式的結束碼分別計數；最後有無法分類的主機時以結束碼 3 結束，讓呼叫它的人（或排程）知道有狀況。greet.sh 則示範 read 從 here-string 與管線讀取輸入。' },
        { type: 'example', id: 'lnx13-control' },
        { type: 'callout', tone: 'tip', title: '`local x=$(指令)` 會吃掉結束碼', text: '`local x=$(指令)` 這一行的結束碼是 local 自己的（幾乎總是 0），命令替換失敗也看不出來，`set -e` 也不會被觸發。需要檢查時分成兩行：先 `local x`，再 `x=$(指令)`，這時賦值的結束碼就是命令替換的結束碼。' },
      ],
    },
    {
      id: 'lnx13-s-strict', title: '遇到錯誤就停止：set -euo pipefail、set -x 與錯誤訊息',
      blocks: [
        { type: 'p', text: 'Bash 預設遇到失敗的指令會印出錯誤，然後繼續執行下一行。clean-loose.sh 要進入 `build/tmp` 刪除舊日誌，但那個目錄不存在：`cd` 失敗後，`rm -f *.log` 照樣在原來的目錄執行，刪掉了家目錄的日誌，最後還以 0 結束、印出 cleaned。在指令稿開頭加上 `set -euo pipefail`，同樣的錯誤就會讓它在 cd 那一行停止：' },
        { type: 'table', head: ['選項', '全名', '作用', '擋下的錯誤'], rows: [
          ['`-e`', 'errexit', '一個沒有被測試的指令（或管線）失敗時，指令稿立刻以它的結束碼結束', 'cd 失敗後仍在錯誤的目錄繼續做事'],
          ['`-u`', 'nounset', '使用沒有設定的變數是錯誤（`$@`、`$*` 與 `${x:-預設}` 這類有預設值的寫法除外）', '打錯的變數名稱展開成空字串，`rm -rf "$buildir/cache"` 變成刪除 /cache'],
          ['`-o pipefail`', 'pipefail', '管線的結束碼改為最右邊失敗的那一段；全部成功才是 0', '`cut 不存在的檔案 | sort` 的失敗被最後一段的成功蓋過'],
          ['`-x`', 'xtrace', '執行每個指令之前，先在標準錯誤印出展開後的樣子（`+ 指令`）', '除錯用，不是保護；也可用 `bash -x 指令稿` 只開這一次'],
        ] },
        { type: 'p', text: '`set -e` 有幾個一定要知道的例外，它們都照 bash 的規則：當成條件的指令不會觸發它，包括 `if`、`elif`、`while`、`until` 的條件、`&&` 與 `||` 串列中最後一個以外的指令，以及 `!` 開頭的管線；在這些位置呼叫的函式，裡面的每個指令也都不會觸發。沒有 pipefail 時，管線只看最後一段。`$( )` 裡面預設不繼承 -e，但 `x=$(指令)` 這種單純的賦值會以命令替換的結束碼為準，而 `local x=$(指令)` 不會（上一節）。另一方面，有些「沒有錯」的情況也會讓指令稿結束：`(( n++ ))` 在 n 是 0 時運算結果是 0，結束碼是 1；`grep` 沒有找到符合的行時結束碼是 1，`n=$(grep -c ERROR app.log)` 在沒有錯誤的日子就讓指令稿中途結束，需要時寫成 `|| true`。所以 -e 是安全網，不是錯誤處理：重要的步驟仍要自己檢查並給出清楚的訊息。' },
        { type: 'p', text: 'pipefail 也有一個常見的副作用：下游提早結束時（例如 `指令 | head -n 1` 讀完一行就結束），上游再寫入會收到 SIGPIPE，以 141（128 + 13）結束，在 pipefail 下整條管線就算失敗。-u 則要求選擇性的參數寫成 `${1:-}` 或 `${1:-預設}`，否則沒有給參數時就是錯誤。' },
        { type: 'p', text: '自己偵測到的錯誤，要用一致的方式回報：訊息寫到標準錯誤（`echo "backup: no such directory: $1" >&2`），讓它不會混進正常的輸出或管線，再以非零的結束碼結束。慣例上 0 是成功、1 是一般錯誤、2 是用法錯誤（參數不對時印出 usage）；126、127 與 128 + N 已經被 Shell 用來表示無法執行、找不到指令與被訊號結束，自己的指令稿不要拿來用。除錯時用 `bash -x 指令稿` 或在一段程式前後寫 `set -x` 與 `set +x`，看每個指令展開後實際執行的樣子。寫完的指令稿也可以交給 ShellCheck 這類靜態檢查工具，它能找出沒加引號的變數等常見問題。' },
        { type: 'example', id: 'lnx13-strict' },
        { type: 'callout', tone: 'warning', title: '加了 set -e 不代表指令稿就安全了', text: '常見的誤解是：「開頭寫了 `set -e`，任何錯誤都會讓指令稿停下來。」實際上它在 if 與 while 的條件、`&&`／`||` 的前段與 `!` 之後都不生效，沒有 pipefail 時管線前段的失敗也看不到，`local x=$(…)` 會吃掉結束碼；反過來，`(( n++ ))` 或沒找到東西的 grep 又可能讓它在不該停的地方停下來。寫 `set -euo pipefail` 是好的起點，但仍要替變數加引號、在動手之前檢查輸入，並在失敗時印出清楚的訊息。另外要記得：在互動式的提示字元上輸入 `set -e`，下一個失敗的指令會讓整個 Shell 結束（真實的終端機會關閉），所以只在指令稿裡使用它。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx13-q1', prompt: '`./deploy.sh` 印出 `bash: ./deploy.sh: Permission denied`，但 `bash deploy.sh` 可以正常執行。最可能的原因是？',
      options: ['第一行沒有寫 shebang', '目前目錄不在 PATH 裡', '檔案沒有執行權限 x；`bash deploy.sh` 只需要讀取權限', '指令稿裡有語法錯誤'],
      answer: 2,
      explanation: '`./deploy.sh` 要由核心直接執行檔案，需要 x 權限；`bash deploy.sh` 是執行 bash，再由 bash 讀取檔案，所以只要 r。沒有 shebang 時錯誤不是 Permission denied；寫了 `./` 就不經過 PATH；語法錯誤在兩種執行方式下都會出現，而且訊息是 syntax error。',
    },
    {
      id: 'lnx13-q2', prompt: '`file="q3 summary.txt"` 之後執行 `rm $file`（沒有引號）。會發生什麼事？',
      options: ['rm 收到 `q3` 與 `summary.txt` 兩個參數，去刪除這兩個名稱的檔案，`q3 summary.txt` 本身不受影響', '正確刪除 `q3 summary.txt`，因為賦值時已經加了引號', 'bash 回報語法錯誤，什麼都不執行', 'rm 收到包含引號字元的名稱 `"q3 summary.txt"`'],
      answer: 0,
      explanation: '沒有引號的 `$file` 展開後依空白拆字，rm 收到兩個參數；如果剛好有叫 q3 或 summary.txt 的檔案，它們會被刪掉。賦值時的引號只決定存進去的值，不會跟著變數走；這不是語法錯誤；引號也不是值的一部分。正確的寫法是 `rm "$file"`。',
    },
    {
      id: 'lnx13-q3', prompt: '執行 `./copy.sh "my file.txt" b.txt`。在指令稿裡，下列哪一項正確？',
      options: ['`$#` 是 3，因為第一個參數裡的空白把它分成兩個', '`$#` 是 2，而且不加引號的 `$@` 也會保持兩個參數', '`$0` 是 `my file.txt`', '`$#` 是 2；`"$@"` 展開成 `my file.txt` 與 `b.txt` 兩個字'],
      answer: 3,
      explanation: '引號在呼叫時就決定了參數的界線，所以有兩個參數，`$#` 是 2；`"$@"` 讓每個參數各自成為一個字。不加引號的 `$@` 會再依空白拆開，得到 my、file.txt、b.txt 三個字；`$0` 是指令稿自己的名稱 `./copy.sh`，第一個參數是 `$1`。',
    },
    {
      id: 'lnx13-q4', prompt: '`a=10; b=9; [ $a > $b ] && echo yes` 的結果是？',
      options: ['印出 yes，因為 10 大於 9', '印出 yes，但 `>` 是重新導向：建立了名為 9 的空檔案，`[` 只測試 `10` 是不是非空字串', '什麼都不印，因為 `[ ]` 比較的是字串，10 排在 9 前面', 'bash 回報語法錯誤'],
      answer: 1,
      explanation: '在 `[ ]` 裡，沒有引號的 `>` 仍是 Shell 的重新導向，所以 `[ 10 ]` 的輸出被導向一個叫 9 的檔案；只有一個參數的 test 在它不是空字串時成立，所以印出 yes，而且換成 `[ 1 > 9 ]` 也一樣。這和數字大小無關，也不是字串比較或語法錯誤；比較整數要用 `-gt` 或 `(( a > b ))`。',
    },
    {
      id: 'lnx13-q5', prompt: '指令稿開頭寫了 `set -e`。下列哪一種失敗不會讓指令稿結束？',
      options: ['單獨一行的 `cp a.txt /nonexistent/` 失敗了', '`x=$(false)`', '`count=0` 之後執行 `(( count++ ))`', '`if grep ERROR app.log > /dev/null; then … fi` 裡的 grep 沒有找到任何一行'],
      answer: 3,
      explanation: '`if` 的條件本來就是用來測試成功或失敗，set -e 不會因為它而結束指令稿。單獨一行的 cp 失敗會觸發 -e；單純的賦值以命令替換的結束碼為準，`x=$(false)` 也會結束；`(( count++ ))` 的運算結果是遞增前的 0，結束碼是 1，同樣讓指令稿結束。',
    },
    {
      id: 'lnx13-q6', prompt: '指令稿只有 `set -e`，沒有 pipefail。`cut -d, -f2 missing.csv | sort > out.txt` 中的檔案不存在時，會怎樣？',
      options: ['管線的結束碼是最後一段 sort 的 0，指令稿繼續執行，out.txt 是空的', '指令稿在這一行停止，結束碼是 1', 'cut 的錯誤被 sort 吞掉，畫面上看不到任何錯誤訊息', 'bash 會自動重試這條管線'],
      answer: 0,
      explanation: '沒有 pipefail 時，管線的結束碼只看最後一段；sort 讀到空的輸入照樣成功，所以 -e 沒有被觸發，後面的步驟繼續處理空的 out.txt。要在這裡停止，需要 `set -o pipefail`。cut 的錯誤寫到標準錯誤，仍然會出現在畫面上；bash 不會重試任何指令。',
    },
    {
      id: 'lnx13-q7', prompt: '想寫一個函式，把計算出的行數交給呼叫它的地方使用。正確的作法是？',
      options: ['在函式裡 `return 行數`，呼叫之後讀 `$?`', '在函式裡 `exit 行數`', '在函式裡 `echo` 出行數，呼叫時用 `n=$(函式 參數)` 接住', '把結果指定給 `$1`'],
      answer: 2,
      explanation: '函式的輸出可以用命令替換接住，這是 Bash 函式傳回資料的標準方式。return 只設定 0 到 255 的結束碼，用來表示成功或失敗，超過 255 的數字會被取 256 的餘數；exit 會結束整個指令稿，而不只是函式；位置參數不能用 `1=…` 這種賦值改變（只能用 `set --` 整組替換），呼叫者也看不到函式裡的位置參數。',
    },
  ],
  terminal: {
    machines: [toolsHost, backupHost, logHost, shareHost, etlHost],
    examples: [
      {
        id: 'lnx13-first', title: '第一支指令稿：shebang 與執行權限', description: '沒有 x 權限時 `./hello.sh` 被拒絕（結束碼 126），`bash hello.sh` 只需要讀取權限；`chmod u+x` 之後可以直接執行，`$0` 是輸入的路徑。', machine: 'tools',
        steps: [
          { command: 'cat hello.sh', output: '#!/bin/bash\n# hello.sh：第一支指令稿\necho "Hello from $(hostname)"\necho "Today is $(date +%F); this is $0"' },
          { command: './hello.sh', output: 'bash: ./hello.sh: Permission denied' },
          { command: 'bash hello.sh', output: 'Hello from tools-01\nToday is 2026-11-22; this is hello.sh' },
          { command: 'chmod u+x hello.sh', output: '' },
          { command: 'ls -l hello.sh', output: '-rwxr--r-- learner learner   114 hello.sh' },
          { command: './hello.sh', output: 'Hello from tools-01\nToday is 2026-11-22; this is ./hello.sh' },
          { command: 'echo $?', output: '0' },
        ],
      },
      {
        id: 'lnx13-vars', title: '變數、引號與位置參數', description: '沒有引號的 `$file` 被拆成兩個參數；單引號照字面、雙引號展開；`$( )` 與 `$(( ))`；args.sh 比較 `"$@"` 與不加引號的 `$@`。', machine: 'tools',
        steps: [
          { command: 'file="reports/q3 summary.txt"', output: '' },
          { command: 'ls -l $file', output: 'ls: cannot access \'reports/q3\': No such file or directory\nls: cannot access \'summary.txt\': No such file or directory' },
          { command: 'ls -l "$file"', output: '-rw-r--r-- learner learner    17 reports/q3 summary.txt' },
          { command: 'echo \'$file\' "$file"', output: '$file reports/q3 summary.txt' },
          { command: 'echo "${file##*/}"', output: 'q3 summary.txt' },
          { command: 'n=$(ls reports | wc -l)', output: '' },
          { command: 'echo "$n reports, $((n * 10)) minutes to read"', output: '3 reports, 30 minutes to read' },
          { command: 'cat args.sh', output: '#!/bin/bash\necho "\\$0=$0  \\$#=$#  \\$1=$1"\necho "quoted:"\nfor f in "$@"; do echo "  [$f]"; done\necho "unquoted:"\nfor f in $@; do echo "  [$f]"; done' },
          { command: './args.sh "q3 summary.txt" q4.txt', output: '$0=./args.sh  $#=2  $1=q3 summary.txt\nquoted:\n  [q3 summary.txt]\n  [q4.txt]\nunquoted:\n  [q3]\n  [summary.txt]\n  [q4.txt]' },
        ],
      },
      {
        id: 'lnx13-test', title: '結束碼、test、[ ] 與 [[ ]]', description: '`$?` 與 if；`-gt` 是整數比較，`[[ < ]]` 是字串比較，`[ > ]` 其實建立了檔案 9；沒有引號的空變數讓 test 出錯；for 與 while 迴圈。', machine: 'tools',
        steps: [
          { command: 'ls reports/q5.txt; echo "status $?"', output: 'ls: cannot access \'reports/q5.txt\': No such file or directory\nstatus 2' },
          { command: 'if [ -f reports/q4.txt ]; then echo "q4 is ready"; else echo "q4 is missing"; fi', output: 'q4 is ready' },
          { command: 'a=10; b=9; [ "$a" -gt "$b" ] && echo "$a > $b as integers"', output: '10 > 9 as integers' },
          { command: '[[ $a < $b ]] && echo "$a sorts before $b as strings"', output: '10 sorts before 9 as strings' },
          { command: '[ $a > $b ] && echo "looks true"; ls -l 9', output: 'looks true\n-rw-r--r-- learner learner     0 9' },
          { command: 'test $missing = yes', output: 'bash: test: =: unary operator expected' },
          { command: '[[ $missing == yes ]] || echo "no match, no error"', output: 'no match, no error' },
          { command: 'for f in reports/*.txt; do echo "[$f]"; done', output: '[reports/q3 summary.txt]\n[reports/q4.txt]' },
          { command: 'i=1; while (( i <= 3 )); do echo "round $i"; i=$((i + 1)); done', output: 'round 1\nround 2\nround 3' },
        ],
      },
      {
        id: 'lnx13-control', title: '函式、case 與 while read', description: 'inventory.sh 以函式與 case 分類每一台主機，不認得的角色寫到標準錯誤並 return 1，最後以結束碼 3 回報；清單不存在時結束碼是 1；greet.sh 從 here-string 與管線讀取名字。', machine: 'tools',
        steps: [
          { command: 'cat inventory.txt', output: '# host     role\nweb-01     web\nweb-02     web\ndb-01      db\ncache-01   redis' },
          { command: 'cat inventory.sh', output: '#!/bin/bash\nset -euo pipefail\n\n# 依角色說明一台主機；不認得的角色回傳 1\ndescribe() {\n  local host=$1 role=$2\n  case "$role" in\n    web|api) echo "$host: 前端服務" ;;\n    db)      echo "$host: 資料庫，備份前先停止寫入" ;;\n    *)       echo "$host: 不認得的角色 $role" >&2; return 1 ;;\n  esac\n}\n\nlist=${1:-inventory.txt}\nif [[ ! -f "$list" ]]; then\n  echo "inventory: 找不到清單 $list" >&2\n  exit 1\nfi\n\nok=0\nbad=0\nwhile read -r host role; do\n  [[ -z "$host" || "$host" == "#"* ]] && continue\n  if describe "$host" "$role"; then\n    ok=$((ok + 1))\n  else\n    bad=$((bad + 1))\n  fi\ndone < "$list"\necho "完成：$ok 台已分類，$bad 台無法分類"\nif (( bad > 0 )); then\n  exit 3\nfi' },
          { command: './inventory.sh', output: 'web-01: 前端服務\nweb-02: 前端服務\ndb-01: 資料庫，備份前先停止寫入\ncache-01: 不認得的角色 redis\n完成：3 台已分類，1 台無法分類' },
          { command: 'echo $?', output: '3' },
          { command: './inventory.sh hosts.txt; echo "exit=$?"', output: 'inventory: 找不到清單 hosts.txt\nexit=1' },
          { command: 'cat greet.sh', output: '#!/bin/bash\nread -r -p "Your name? " name\necho "Hi, ${name:-stranger}!"' },
          { command: './greet.sh <<< "Ann"', output: 'Hi, Ann!' },
          { command: 'echo "Bob" | ./greet.sh', output: 'Hi, Bob!' },
        ],
      },
      {
        id: 'lnx13-strict', title: 'set -euo pipefail、bash -x 與 set -u', description: 'clean-strict.sh 在 cd 失敗時停止，日誌還在；bash -x 印出每一步；沒有 set 的 clean-loose.sh 在錯誤的目錄刪掉日誌；set -u 擋下打錯的變數；pipefail 讓管線前段的失敗算數；`(( n++ ))` 在 set -e 下讓指令稿結束。', machine: 'tools',
        steps: [
          { command: 'cat clean-strict.sh', output: '#!/bin/bash\nset -euo pipefail\n# 清掉 build/tmp 裡的舊日誌\ncd "$HOME/build/tmp"\nrm -f *.log\necho "cleaned $(pwd)"' },
          { command: './clean-strict.sh; echo "exit=$?"', output: './clean-strict.sh: line 4: cd: /home/learner/build/tmp: No such file or directory\nexit=1' },
          { command: 'ls *.log', output: 'deploy.log  error.log' },
          { command: 'bash -x clean-strict.sh', output: '+ set -euo pipefail\n+ cd /home/learner/build/tmp\nclean-strict.sh: line 4: cd: /home/learner/build/tmp: No such file or directory' },
          { command: './clean-loose.sh; echo "exit=$?"', output: './clean-loose.sh: line 3: cd: /home/learner/build/tmp: No such file or directory\ncleaned /home/learner\nexit=0' },
          { command: 'ls *.log', output: 'ls: cannot access \'*.log\': No such file or directory' },
          { command: 'echo "cleaning $buildir/cache"', output: 'cleaning /cache' },
          { command: 'set -u; echo "cleaning $buildir/cache"', output: 'bash: buildir: unbound variable' },
          { command: 'cut -d, -f2 sales.csv | sort | wc -l; echo "status $?"', output: 'cut: sales.csv: No such file or directory\n0\nstatus 0' },
          { command: 'set -o pipefail; cut -d, -f2 sales.csv | sort | wc -l; echo "status $?"', output: 'cut: sales.csv: No such file or directory\n0\nstatus 1' },
          { command: 'bash -c \'set -e; n=0; ((n++)); echo "n=$n"\'; echo "exit=$?"', output: 'exit=1' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx13-backup', title: '有日期的備份指令稿', machine: 'bk',
        statement: 'files-02 上要每天備份網站目錄 `site`。請寫 `/home/learner/backup.sh`：第一行 `#!/bin/bash`，第二行 `set -euo pipefail`；它接受一個參數，是家目錄裡要備份的目錄名稱。參數不是存在的目錄時，在標準錯誤印出 `backup: no such directory: 參數` 並以結束碼 1 結束；否則用 `cp -r` 把它複製到 `$HOME/backups/目錄名稱-日期`（日期用 `date +%F` 取得，例如 site-2026-11-22），再印出 `saved 目的地的完整路徑`。來源不能被改動。權限只替擁有者加上執行（`chmod u+x`，結果是 `-rwxr--r--`）。最後用這一行檢查：`' + BACKUP_CHECK + '`（模擬的終端機一次讀一行，可以用 `printf \'%s\\n\' \'第一行\' \'第二行\' … > backup.sh` 寫出整個檔案）。',
        checks: [
          { kind: 'mode', path: `${HOME}/backup.sh`, mode: 0o744 },
          { kind: 'unchanged', path: `${HOME}/site` },
          { kind: 'output' },
        ],
        solution: [writeScript('backup.sh', BACKUP_LINES), 'chmod u+x backup.sh', 'ls -l backup.sh', BACKUP_CHECK],
        mistakes: [
          { commands: [writeScript('backup.sh', BACKUP_LINES.filter((_, i) => i < 2 || i > 5)), 'chmod u+x backup.sh', BACKUP_CHECK], why: '沒有先檢查來源：打錯的 sitee 直接交給 cp，印出的是 cp 自己的 `cannot stat` 訊息，而不是指令稿約定的 `backup: no such directory`；在複製之前先檢查，才能給出清楚的訊息，也不會先做了一半的工作。' },
          { commands: [writeScript('backup.sh', BACKUP_LINES.map(l => l.replace('$(date +%F)', '2026-11-22'))), 'chmod u+x backup.sh', BACKUP_CHECK], why: '把今天的日期直接寫進指令稿：今天看起來正確，明天執行時仍然寫到 site-2026-11-22，蓋掉昨天的備份。日期要在執行時用 `$(date +%F)` 取得。' },
          { commands: [writeScript('backup.sh', BACKUP_LINES.filter(l => l !== '  exit 1')), 'chmod u+x backup.sh', BACKUP_CHECK], why: '印了錯誤訊息卻沒有 `exit 1`：指令稿繼續往下執行，cp 再失敗一次、多印一行錯誤。偵測到錯誤之後要明確地以非零的結束碼結束。' },
          { commands: [writeScript('backup.sh', BACKUP_LINES.map(l => l.replace('cp -r', 'mv'))), 'chmod u+x backup.sh', BACKUP_CHECK], why: '用 mv 把網站整個搬進 backups：備份有了，原本的 site 卻不見了，網站因此停擺。備份要複製（`cp -r`），不能搬走來源。' },
          { commands: [writeScript('backup.sh', BACKUP_LINES), 'chmod +x backup.sh', BACKUP_CHECK], why: '`chmod +x` 替擁有者、群組與其他人都加上執行權限（`-rwxr-xr-x`）；題目只要擁有者能執行，用 `chmod u+x`。' },
        ],
        variants: [
          { label: '隔天執行', files: [], now: '2026-11-23 10:00:00' },
          { label: '網站多了一頁', files: [file(`${HOME}/site/news.html`, lines('<h1>News</h1>'))] },
        ],
        hints: [
          '`[[ ! -d "$1" ]]` 在參數不是存在的目錄時成立；錯誤訊息用 `>&2` 送到標準錯誤，接著 `exit 1`。',
          '`dest="$HOME/backups/$1-$(date +%F)"`：命令替換在執行的那一刻取得日期。',
          '寫好之後用 `cat backup.sh` 確認內容，`chmod u+x backup.sh` 之後 `ls -l` 應該是 `-rwxr--r--`。',
        ],
        explanation: '指令稿先處理錯誤的輸入：`[[ ! -d "$1" ]]` 成立時把訊息寫到標準錯誤並 `exit 1`，所以 `./backup.sh sitee` 印出約定的訊息，`$?` 是 1；接著用 `$(date +%F)` 組出今天的目的地，`cp -r "$1" "$dest"` 複製整個目錄，最後印出路徑。`$1` 與 `$dest` 都加上引號，目錄名稱有空白也不會被拆開；`set -euo pipefail` 讓 cp 失敗（例如磁碟滿了）時不會再印出 saved。隔天執行時目的地自動變成 site-2026-11-23，這就是不能把日期寫死的原因。',
      },
      {
        id: 'lnx13-levels', title: '計算日誌的等級', machine: 'logs',
        statement: 'log-03 的 `app.log` 每一行以等級開頭（`ERROR`、`WARN`、`INFO`，後面接空白）。請寫 `/home/learner/levels.sh`：第一行 `#!/bin/bash`，第二行 `set -euo pipefail`；沒有剛好一個參數時，在標準錯誤印出 `usage: levels.sh LOGFILE` 並以結束碼 2 結束；否則依序印出 `ERROR 數量`、`WARN 數量`、`INFO 數量` 三行，只計算以該等級開頭的行（訊息內容裡提到 ERROR 的不算）。用 `chmod +x` 讓它可以執行，最後用這一行檢查：`' + LEVELS_CHECK + '`。',
        checks: [
          { kind: 'mode', path: `${HOME}/levels.sh`, mode: 0o755 },
          { kind: 'output' },
        ],
        solution: [writeScript('levels.sh', LEVELS_LINES), 'chmod +x levels.sh', LEVELS_CHECK],
        mistakes: [
          { commands: [writeScript('levels.sh', LEVELS_LINES.map(l => l.replace(' || true', ''))), 'chmod +x levels.sh', LEVELS_CHECK], why: '`grep -c` 找不到任何一行時印出 0，但結束碼是 1；在 `set -e` 下，`n=$(grep -c …)` 這個賦值以命令替換的結束碼為準，指令稿就在沒有 ERROR 的那一天中途結束。加上 `|| true`（或改用不會失敗的計數方式）。' },
          { commands: [writeScript('levels.sh', LEVELS_LINES.map(l => l.replace('"^$level "', '"$level"'))), 'chmod +x levels.sh', LEVELS_CHECK], why: '樣式沒有 `^` 錨定行首，`INFO  retrying after ERROR in payment` 也被算成 ERROR；要用 `"^$level "` 只比對行首的等級。' },
          { commands: [writeScript('levels.sh', LEVELS_LINES.filter((_, i) => i < 2 || i > 5)), 'chmod +x levels.sh', LEVELS_CHECK], why: '沒有檢查參數個數：不給參數時，`set -u` 讓 `$1` 成為未設定的變數錯誤，使用者看到的是內部的錯誤，而不是告訴他怎麼用的 usage 訊息與結束碼 2。' },
          { commands: [writeScript('levels.sh', ['#!/bin/bash', 'echo "ERROR 2"', 'echo "WARN 2"', 'echo "INFO 4"']), 'chmod +x levels.sh', LEVELS_CHECK], why: '把今天數出來的結果直接印出來：換一份日誌，數字就錯了。指令稿要真的去數 `$1` 指定的檔案。' },
        ],
        variants: [{ label: '平靜的一天', files: [file(`${HOME}/app.log`, QUIET_LOG)] }],
        hints: [
          '`if [[ $# -ne 1 ]]; then … fi` 檢查參數個數；usage 印到標準錯誤（`>&2`），再 `exit 2`。',
          '`for level in ERROR WARN INFO; do … done` 依序處理三個等級，`grep -c "^$level " "$1"` 數出以它開頭的行。',
          '想一想沒有任何 ERROR 的日誌：`grep -c` 的結束碼是多少？在 `set -e` 下會發生什麼事？',
        ],
        explanation: '`$#` 是參數個數，不是 1 就印 usage 並以 2 結束（慣例上 2 代表用法錯誤）。迴圈裡 `n=$(grep -c "^$level " "$1" || true)`：`^` 錨定行首，雙引號讓 `$level` 展開，也讓含空白的檔名保持一個參數；`grep -c` 沒有找到時結束碼是 1，`|| true` 讓這個「沒有找到」不被 `set -e` 當成錯誤。在平靜的一天，這一行讓指令稿照常印出 `ERROR 0`，而不是無聲無息地中途結束。',
      },
      {
        id: 'lnx13-spaces', title: '修好遇到空白就壞掉的指令稿', machine: 'share',
        statement: 'share-01 的 `archive.sh` 要把 `inbox` 裡每個 `.txt` 檔移到 `archive`，並對每個檔案印出 `moved inbox/檔名`；其他檔案（例如 `scan.pdf`）留在原處。但 inbox 裡有檔名含空白的檔案，它一執行就失敗。先 `cat archive.sh` 看看哪裡錯了，再改寫這個指令稿（保留 `#!/bin/bash` 與 `set -euo pipefail`），然後執行 `./archive.sh` 完成搬移。',
        checks: [
          { kind: 'absent', path: `${HOME}/inbox/meeting notes.txt` },
          { kind: 'exists', path: `${HOME}/archive/meeting notes.txt`, type: 'file' },
          { kind: 'absent', path: `${HOME}/inbox/final report v2.txt` },
          { kind: 'exists', path: `${HOME}/inbox/scan.pdf`, type: 'file' },
          { kind: 'output' },
        ],
        solution: ['cat archive.sh', writeScript('archive.sh', ARCHIVE_LINES), './archive.sh'],
        mistakes: [
          { commands: [writeScript('archive.sh', ARCHIVE_LINES.map(l => l.replace('inbox/*.txt', '$(ls inbox/*.txt)'))), './archive.sh'], why: '只替 mv 的參數加上引號不夠：`$(ls inbox/*.txt)` 沒有加引號，它的輸出在 for 之前就依空白被拆成 inbox/meeting、notes.txt…，`mv "inbox/meeting"` 找不到檔案。直接用萬用字元 `inbox/*.txt`，每個檔名都是完整的一個字。' },
          { commands: [writeScript('archive.sh', ARCHIVE_LINES.map(l => l.replace('"$f"', '$f'))), './archive.sh'], why: '改用萬用字元是對的，但 `mv $f archive/` 沒有引號：`$f` 的值 `inbox/meeting notes.txt` 展開後又被拆成兩個參數，mv 去找 inbox/meeting 與 notes.txt。' },
          { commands: [writeScript('archive.sh', ARCHIVE_LINES.map(l => l.replace('inbox/*.txt', '"$(ls inbox/*.txt)"'))), './archive.sh'], why: '把整個 `"$(ls …)"` 加上引號，三個檔名變成一個包含換行的字，迴圈只跑一次，mv 找不到這個奇怪的名稱。不要解析 ls 的輸出。' },
          { commands: ['mv "inbox/meeting notes.txt" "inbox/q4 plan.txt" inbox/todo.txt archive/'], why: '手動搬了今天的三個檔案，指令稿卻還是壞的：明天 inbox 多了 `final report v2.txt`，它不會被搬走。' },
          { commands: [writeScript('archive.sh', ARCHIVE_LINES.map(l => l.replace('inbox/*.txt', 'inbox/*'))), './archive.sh'], why: '萬用字元寫成 `inbox/*`，連 scan.pdf 也被搬走了；題目只搬 `.txt` 檔。' },
        ],
        variants: [{ label: '多了一份檔名有空白的報告', files: [file(`${HOME}/inbox/final report v2.txt`, lines('年度報告第二版'))] }],
        hints: [
          '`$(ls inbox/*.txt)` 的輸出會依空白被拆開；萬用字元 `inbox/*.txt` 展開的每個檔名則是完整的一個字。',
          '迴圈變數用到的每個地方都加上雙引號：`"$f"`。',
          '`set -e` 讓舊版在第一個 mv 失敗時就停下來，所以檔案都還在原處；如果做了別的嘗試，可以按「重設」重新開始。',
        ],
        explanation: '舊版有兩個錯誤：`for f in $(ls inbox/*.txt)` 把 ls 的輸出依空白拆字，`meeting notes.txt` 變成兩個字；`mv $f archive/` 沒有引號，即使 `$f` 是完整的檔名，展開時也會再被拆開。正確的寫法是讓 Shell 的萬用字元產生檔名（`for f in inbox/*.txt`），並在每次使用時寫成 `"$f"`。`set -euo pipefail` 讓舊版在第一個錯誤就停止，沒有搬到一半；新版在多了 `final report v2.txt` 的那一天一樣正確。',
      },
      {
        id: 'lnx13-pipefail', title: '管線失敗時就停止', machine: 'etl',
        statement: 'etl-02 每天會收到當天的訂單檔 `data/orders-日期.csv`（日期是 `date +%F`，欄位是 `訂單編號,客戶,金額`）。請寫 `/home/learner/export.sh`：第一行 `#!/bin/bash`，第二行 `set -euo pipefail`；以 `cut -d, -f2 檔案 | sort | uniq -c` 算出每位客戶的訂單數，寫到 `out/customers.txt`；接著 `touch out/READY` 通知下游可以取用；最後印出 `exported 行數 customers from 檔案路徑`（行數是 `out/customers.txt` 的行數，可用 `$(wc -l < out/customers.txt)`）。當天的檔案還沒送到時，指令稿必須在管線失敗的那一步就停止，不能建立 READY。用 `chmod u+x` 讓它可以執行，最後用這一行檢查：`' + EXPORT_CHECK + '`。',
        checks: [
          { kind: 'unchanged', path: `${HOME}/data` },
          { kind: 'output' },
        ],
        solution: [writeScript('export.sh', EXPORT_LINES), 'chmod u+x export.sh', EXPORT_CHECK],
        mistakes: [
          { commands: [writeScript('export.sh', EXPORT_LINES.map(l => l.replace('set -euo pipefail', 'set -eu'))), 'chmod u+x export.sh', EXPORT_CHECK], why: '少了 pipefail：管線的結束碼只看最後一段 `uniq -c`，它成功了，所以 cut 找不到檔案也不算失敗；`set -e` 沒有被觸發，指令稿建立了 READY，下游拿到一份空的報表。' },
          { commands: [writeScript('export.sh', EXPORT_LINES.map(l => l.replace('set -euo pipefail', 'set -uo pipefail'))), 'chmod u+x export.sh', EXPORT_CHECK], why: '有 pipefail 卻沒有 -e：管線確實回報了失敗，但沒有人理會這個結束碼，指令稿照樣往下執行、建立 READY，最後以 0 結束。' },
          { commands: [writeScript('export.sh', EXPORT_LINES.map(l => l.replace('$(date +%F)', '2026-11-22'))), 'chmod u+x export.sh', EXPORT_CHECK], why: '檔名的日期寫死了：明天它仍然讀取今天的檔案，把舊資料再匯出一次，還建立了 READY。' },
        ],
        variants: [
          { label: '今天的檔案還沒送到', files: [], now: '2026-11-23 10:00:00' },
          { label: '另一天的訂單', files: [file(`${HOME}/data/orders-2026-11-24.csv`, ORDERS(['2001,dave,120', '2002,erin,60', '2003,alice,300', '2004,frank,45', '2005,erin,80', '2006,bob,210']))], now: '2026-11-24 10:00:00' },
        ],
        hints: [
          '`src="data/orders-$(date +%F).csv"` 在執行時算出今天的檔名。',
          '沒有 pipefail 時，管線的結束碼是最後一段的；要讓前面的 cut 失敗也算數，需要 `set -o pipefail`。',
          '-e 才會讓失敗的指令結束指令稿；兩者都要，所以寫成 `set -euo pipefail`。',
        ],
        explanation: '`set -o pipefail` 讓管線的結束碼成為最右邊失敗的那一段（這裡是 cut 的 1），`set -e` 再讓這個失敗結束指令稿，所以當天的檔案不存在時，`touch out/READY` 與最後的訊息都不會執行，`echo "exit=$?"` 印出 1，下游看不到 READY 就不會取用。注意 `out/customers.txt` 仍然存在（重新導向在 cut 執行之前就建立了它），只是內容是空的：這正是要用 READY 這種「完成標記」，或先寫到暫存檔再 `mv` 過去的原因。',
      },
    ],
  },
};
