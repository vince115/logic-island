import type { CommandName, FilesCommand, ShellFeature } from './shell';

/*
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): the short, fixed manual of every command, printed by
 * `man 指令` and `指令 --help` in a profile that has them. It describes what the simulator does (its options, not every
 * option of the real tool). Section headings follow real manual pages (NAME, SYNOPSIS…); the text is Traditional Chinese.
 *
 * MANUAL covers the files profile's commands; engine stages E2 and E3 (§10, §11) add STREAM_MANUAL and USER_MANUAL (E4–E6:
 * SYSTEM_MANUAL), and
 * FEATURE_MANUAL replaces the pages of cat, echo (pipes) and chmod (accounts) where those profiles change the command.
 */

export interface ManualEntry {
  /** The synopsis, e.g. ls [-l] [-a] [-h] [-d] [路徑]… */
  usage: string;
  /** What it does, in a few words (the NAME line). */
  summary: string;
  /** More about it, one line each. */
  description: string[];
  /** Each option and what it does. */
  options: [string, string][];
}

export const MANUAL: Record<FilesCommand, ManualEntry> = {
  pwd: { usage: 'pwd', summary: '顯示目前所在的目錄', description: ['印出目前工作目錄的絕對路徑。'], options: [] },
  ls: {
    usage: 'ls [-l] [-a] [-h] [-d] [路徑]…', summary: '列出目錄的內容',
    description: ['沒有指定路徑時列出目前的目錄；目錄名稱後面加上 /，符號連結加上 @。', '-l 的欄位：權限、擁有者、群組、大小（位元組）、名稱；連結顯示成「名稱 -> 目標」。'],
    options: [['-l', '詳細資料'], ['-a', '也列出以 . 開頭的隱藏項目，以及 . 與 ..'], ['-h', '和 -l 一起使用：大小以 K、M、G 表示'], ['-d', '列出目錄本身，而不是目錄的內容']],
  },
  cd: { usage: 'cd [路徑]', summary: '切換目前的目錄（Shell 的內建指令）', description: ['沒有路徑時回到家目錄；~ 是家目錄，.. 是上一層，. 是目前的目錄。'], options: [] },
  mkdir: { usage: 'mkdir [-p] 目錄…', summary: '建立目錄', description: ['新目錄的權限是 rwxr-xr-x（755）。'], options: [['-p', '一併建立中間的目錄；目錄已經存在時不算錯誤']] },
  touch: { usage: 'touch 檔案…', summary: '建立空檔案', description: ['檔案不存在時建立空檔案；已經存在時不改變內容（模擬環境沒有時間戳記）。'], options: [] },
  cat: { usage: 'cat 檔案…', summary: '顯示檔案內容', description: ['依序印出每個檔案的內容；模擬環境沒有標準輸入，必須指定檔案。'], options: [] },
  cp: {
    usage: 'cp [-r] 來源… 目的地', summary: '複製檔案與目錄',
    description: ['目的地是已存在的目錄時，複製到目錄裡並沿用原來的名稱；有多個來源時，目的地必須是目錄。', '複製出來的檔案屬於你；不加 -r 時，來源若是符號連結，會複製它指向的檔案。'],
    options: [['-r', '複製目錄與其中的一切（符號連結照原樣複製）']],
  },
  mv: { usage: 'mv 來源… 目的地', summary: '移動或改名', description: ['目的地是已存在的目錄時，移到目錄裡；有多個來源時，目的地必須是目錄。移動符號連結只會移動連結本身。'], options: [] },
  rm: {
    usage: 'rm [-r] [-f] 路徑…', summary: '刪除檔案與目錄',
    description: ['刪除無法復原。刪除符號連結只會刪除連結本身，不會刪除它指向的檔案。'],
    options: [['-r', '刪除目錄與其中的一切'], ['-f', '路徑不存在時不顯示錯誤']],
  },
  chmod: { usage: 'chmod 模式 路徑…', summary: '修改權限', description: ['模式可以是八進位（644、755）或符號（u+x、go-w、a=r）；只有擁有者與 root 能修改。'], options: [] },
  echo: { usage: 'echo [文字]… [> 檔案 | >> 檔案]', summary: '輸出一行文字', description: ['> 覆寫檔案，>> 附加到檔案最後。echo 不認得 --help，會把它當成文字印出。'], options: [] },
  whoami: { usage: 'whoami', summary: '顯示目前的使用者名稱', description: ['印出登入的使用者。'], options: [] },
  clear: { usage: 'clear', summary: '清除畫面', description: ['清除終端機上已經印出的文字。'], options: [] },
  help: { usage: 'help', summary: '列出可用的指令（Shell 的內建指令）', description: ['列出這個模擬環境可以使用的指令與簡短說明。'], options: [] },
  uname: {
    usage: 'uname [-a] [-s] [-n] [-r] [-v] [-m] [-o]', summary: '顯示核心與系統資訊',
    description: ['沒有選項時等於 -s。多個欄位固定依 -s -n -r -v -m -o 的順序印在同一行。'],
    options: [['-a', '全部欄位'], ['-s', '核心名稱'], ['-n', '主機名稱'], ['-r', '核心版本（release）'], ['-v', '核心的建置資訊'], ['-m', '硬體架構'], ['-o', '作業系統名稱']],
  },
  hostname: { usage: 'hostname', summary: '顯示主機名稱', description: ['只有 root 能用 hostname 新名稱 修改主機名稱。'], options: [] },
  man: { usage: 'man 指令…', summary: '顯示指令的說明頁', description: ['說明頁分成 NAME、SYNOPSIS、DESCRIPTION、OPTIONS 等段落；簡短的用法也可以用 指令 --help 查看。'], options: [] },
  df: {
    usage: 'df [-h] [-T] [路徑]…', summary: '顯示檔案系統的空間用量',
    description: ['每個掛載點一行：裝置、大小、已用、可用、使用率與掛載位置；指定路徑時只列出它所在的檔案系統。', '沒有 -h 時大小以 1K 區塊為單位。'],
    options: [['-h', '以 K、M、G 表示大小'], ['-T', '加上檔案系統的類型']],
  },
  du: {
    usage: 'du [-s] [-h] [-a] [路徑]…', summary: '估計目錄占用的空間',
    description: ['列出每個子目錄的用量（以 1K 區塊為單位），最後是路徑本身的總和。', '每個目錄占 4K；檔案依大小進位到 4K 的倍數；符號連結不占空間，也不會被跟隨。'],
    options: [['-s', '只顯示每個路徑的總和'], ['-h', '以 K、M、G 表示大小'], ['-a', '也列出檔案']],
  },
  ln: {
    usage: 'ln -s [-f] 目標 [連結名稱]', summary: '建立符號連結',
    description: ['連結裡存的是目標的文字，不會檢查目標是否存在；相對的目標從連結所在的目錄算起。', '模擬環境只支援符號連結（-s），不支援硬連結。'],
    options: [['-s', '建立符號連結'], ['-f', '連結名稱已經存在時先刪除它']],
  },
  readlink: { usage: 'readlink [-f] 路徑…', summary: '顯示符號連結指向的目標', description: ['路徑不是符號連結時不印出任何東西。'], options: [['-f', '跟隨所有連結，印出最後的完整路徑']] },
};

/** E2: the text and stream commands. */
export const STREAM_MANUAL: Record<'less' | 'head' | 'tail' | 'grep' | 'sort' | 'uniq' | 'wc' | 'cut' | 'tr' | 'tee', ManualEntry> = {
  less: { usage: 'less 檔案…', summary: '一頁一頁地顯示檔案', description: ['真正的 less 可以上下捲動；模擬環境沒有分頁，一次印出全部內容（和 cat 相同）。', '沒有檔案時讀標準輸入，例如 grep error app.log | less。'], options: [] },
  head: {
    usage: 'head [-n 行數] [-c 位元組] [檔案]…', summary: '顯示檔案的開頭',
    description: ['預設顯示前 10 行；有多個檔案時，每個檔案前面加上 ==> 名稱 <==。沒有檔案時讀標準輸入。', '-5 等於 -n 5；-n -3 顯示「除了最後 3 行」的全部。'],
    options: [['-n N', '顯示前 N 行'], ['-c N', '顯示前 N 個位元組'], ['-v', '一個檔案也加上名稱']],
  },
  tail: {
    usage: 'tail [-n 行數] [-c 位元組] [檔案]…', summary: '顯示檔案的結尾',
    description: ['預設顯示最後 10 行；-n +N 從第 N 行顯示到最後（例如 -n +2 略過標題列）。沒有檔案時讀標準輸入。', '模擬環境不支援 -f（檔案不會繼續增加內容）。'],
    options: [['-n N', '顯示最後 N 行；+N 從第 N 行開始'], ['-c N', '顯示最後 N 個位元組'], ['-v', '一個檔案也加上名稱']],
  },
  grep: {
    usage: 'grep [-i] [-v] [-n] [-c] [-l] [-w] [-x] [-r] [-E] [-F] 樣式 [檔案]…', summary: '印出符合樣式的行',
    description: [
      '樣式是基本正規表示式：. 任一字元、* 前一項重複 0 次以上、^ 行首、$ 行尾、[abc] 與 [a-z] 其中一個字元、[^…] 以外的字元、\\ 讓特殊字元變成普通字元。',
      '-E 再加上 + ? | ( ) {n,m}；-F 把樣式當成一般文字。有多個檔案時，每行前面加上檔名。沒有檔案時讀標準輸入。',
    ],
    options: [['-i', '不分大小寫'], ['-v', '印出不符合的行'], ['-n', '加上行號'], ['-c', '只印出符合的行數'], ['-l', '只印出有符合的檔名'], ['-w', '整個字相符'],
      ['-x', '整行相符'], ['-r', '搜尋目錄裡的所有檔案'], ['-E', '延伸正規表示式'], ['-F', '固定字串'], ['-e 樣式', '指定樣式（可以重複）']],
  },
  sort: {
    usage: 'sort [-n] [-r] [-u] [-f] [-t 字元] [-k 欄[,欄]] [檔案]…', summary: '排序各行',
    description: ['依字元的編碼排序（C.UTF-8：大寫字母排在小寫之前）。比較的欄位相同時，再比較整行。', '-k 2 從第 2 欄比到行尾，-k 2,2 只比第 2 欄；沒有 -t 時，欄位以空白分隔。'],
    options: [['-n', '依數值排序'], ['-r', '反過來排'], ['-u', '相同的只留一行'], ['-f', '不分大小寫'], ['-t C', '以字元 C 分隔欄位'], ['-k N', '依第 N 欄排序（可加 n、r，例如 -k 2,2n）']],
  },
  uniq: {
    usage: 'uniq [-c] [-d] [-u] [-i] [檔案]', summary: '合併相鄰的重複行',
    description: ['只比較相鄰的行，所以通常先 sort 再 uniq。沒有檔案時讀標準輸入。'],
    options: [['-c', '在每行前面加上次數'], ['-d', '只印出有重複的行'], ['-u', '只印出沒有重複的行'], ['-i', '不分大小寫']],
  },
  wc: {
    usage: 'wc [-l] [-w] [-m] [-c] [檔案]…', summary: '計算行數、字數與大小',
    description: ['預設依序印出行數、字數、位元組數；有多個檔案時最後加上 total。', '行數是換行字元的個數；中文字一個字元占 3 個位元組（-m 與 -c 的差別）。'],
    options: [['-l', '行數'], ['-w', '字數（以空白分隔）'], ['-m', '字元數'], ['-c', '位元組數']],
  },
  cut: {
    usage: 'cut -f 欄位 [-d 字元] [-s] | -c 位置 [檔案]…', summary: '取出每行的部分內容',
    description: ['欄位與位置寫成 1、1,3、2-4、3-、-2。-f 預設以 Tab 分隔；沒有分隔字元的行整行印出（-s 則略過）。', '模擬環境的 -c 以字元計算；GNU 的 -c 其實以位元組計算，只在非英文的文字時有差別。'],
    options: [['-f 清單', '取出欄位'], ['-d C', '以字元 C 分隔欄位'], ['-c 清單', '取出字元'], ['-b 清單', '取出位元組'], ['-s', '略過沒有分隔字元的行']],
  },
  tr: {
    usage: 'tr [-d] [-s] 集合1 [集合2]', summary: '轉換或刪除字元',
    description: ['只讀標準輸入（例如 cat a.txt | tr a-z A-Z），不接受檔名。集合可以寫 a-z、\\n，或 [:lower:]、[:upper:]、[:digit:]、[:space:] 等類別。', '集合2 比較短時，以最後一個字元補齊。'],
    options: [['-d', '刪除集合1 的字元'], ['-s', '把連續重複的字元壓成一個']],
  },
  tee: {
    usage: 'tee [-a] 檔案…', summary: '把標準輸入同時印出並寫入檔案',
    description: ['常見用法：echo 設定 | sudo tee /etc/檔案 —— 寫入檔案的是 tee，所以權限看執行 tee 的人；sudo echo 設定 > /etc/檔案 則會失敗，因為 > 是你自己的 Shell 處理的。'],
    options: [['-a', '附加到檔案最後，不覆寫']],
  },
};

/** E3: users, groups, ownership and sudo. */
export const USER_MANUAL: Record<'id' | 'groups' | 'useradd' | 'usermod' | 'groupadd' | 'newgrp' | 'sudo' | 'chown' | 'chgrp' | 'umask', ManualEntry> = {
  id: {
    usage: 'id [-u] [-g] [-G] [-n] [使用者]', summary: '顯示使用者與群組的編號',
    description: ['沒有使用者時顯示目前工作階段的身分：群組是登入時的群組，剛加入的群組要重新登入（或 newgrp）才會出現。', '指定使用者時讀 /etc/passwd 與 /etc/group，也就是下一次登入會得到的群組。'],
    options: [['-u', '只印出 UID'], ['-g', '只印出主要群組的 GID'], ['-G', '印出所有群組的 GID'], ['-n', '和 -u、-g、-G 一起使用：印出名稱']],
  },
  groups: { usage: 'groups [使用者]…', summary: '顯示所屬的群組', description: ['沒有使用者時顯示目前工作階段的群組；指定使用者時以「名稱 : 群組…」的格式顯示 /etc/group 裡的群組。'], options: [] },
  useradd: {
    usage: 'useradd [-m] [-s shell] [-G 群組,…] [-g 群組] [-u UID] [-c 說明] [-d 家目錄] [-r] 名稱', summary: '建立使用者（需要 root）',
    description: [
      '新增一行到 /etc/passwd，並建立同名的群組（使用者私人群組）。UID 從 1000 之後的第一個空號開始；-r 建立系統帳號，從 999 往下找。',
      '不加 -m 不會建立家目錄；預設的 shell 是 /bin/sh。服務帳號通常寫成 useradd -r -s /usr/sbin/nologin 名稱。',
    ],
    options: [['-m', '建立家目錄（權限 750，複製 /etc/skel 的檔案）'], ['-s', '登入的 shell'], ['-G', '附加群組，以逗號分隔'], ['-g', '主要群組（不另外建立私人群組）'],
      ['-u', '指定 UID'], ['-c', '說明（例如全名）'], ['-d', '家目錄的路徑'], ['-r', '系統帳號']],
  },
  usermod: {
    usage: 'usermod [-a] [-G 群組,…] [-g 群組] [-s shell] [-c 說明] [-d 家目錄] 使用者', summary: '修改使用者（需要 root）',
    description: ['-aG 把使用者「加入」群組；只寫 -G 會把附加群組「換成」清單裡的群組，使用者會離開其他群組（例如 sudo）。', '群組的變更在下一次登入時生效。'],
    options: [['-a', '和 -G 一起使用：附加，不取代'], ['-G', '附加群組'], ['-g', '主要群組'], ['-s', '登入的 shell'], ['-c', '說明'], ['-d', '家目錄的路徑（不搬移檔案）']],
  },
  groupadd: { usage: 'groupadd [-r] [-g GID] 名稱', summary: '建立群組（需要 root）', description: ['新增一行到 /etc/group；GID 從 1000 之後的第一個空號開始，-r 從 999 往下找。'], options: [['-r', '系統群組'], ['-g', '指定 GID']] },
  newgrp: { usage: 'newgrp [群組]', summary: '以另一個群組身分繼續', description: ['重新讀取 /etc/group，讓剛加入的群組在這個工作階段生效，並把指定的群組當成主要群組（新檔案屬於它）。只能切換到自己所屬的群組。'], options: [] },
  sudo: {
    usage: 'sudo [-u 使用者] 指令 [參數]…', summary: '以 root 或其他使用者的身分執行指令',
    description: [
      '只有 root 與 sudo（Debian、Ubuntu）或 wheel（Red Hat 系）群組的成員可以使用；模擬環境不詢問密碼。',
      '重新導向（> 檔案）由你自己的 Shell 處理，不會變成 root；要以 root 寫入檔案請用 指令 | sudo tee 檔案。cd、umask 是 Shell 的內建指令，不能用 sudo 執行。',
    ],
    options: [['-u', '以指定的使用者執行']],
  },
  chown: {
    usage: 'chown [-R] 使用者[:群組] 路徑…', summary: '修改擁有者與群組',
    description: ['只有 root 能把檔案交給別人；檔案的擁有者只能把群組改成自己所屬的群組。使用者: （冒號後面空白）表示使用者的主要群組，:群組 只改群組。'],
    options: [['-R', '包含目錄裡的一切']],
  },
  chgrp: { usage: 'chgrp [-R] 群組 路徑…', summary: '修改群組', description: ['root 可以改成任何群組；檔案的擁有者只能改成自己所屬的群組。'], options: [['-R', '包含目錄裡的一切']] },
  umask: {
    usage: 'umask [-S] [模式]', summary: '顯示或設定權限遮罩（Shell 的內建指令）',
    description: ['新檔案的權限是 666 去掉遮罩，新目錄是 777 去掉遮罩：umask 022 → 檔案 644、目錄 755；umask 027 → 640、750。', '設定只在這個工作階段有效。'],
    options: [['-S', '以 u=rwx,g=rx,o=rx 的形式顯示']],
  },
};

/** E4–E6: processes, packages, systemd and the journal. */
export const SYSTEM_MANUAL: Record<'ps' | 'top' | 'kill' | 'pgrep' | 'pidof' | 'pkill' | 'sleep' | 'jobs' | 'fg' | 'bg' | 'date' | 'uptime' | 'apt' | 'apt-mark' | 'dpkg' | 'systemctl' | 'journalctl', ManualEntry> = {
  ps: {
    usage: 'ps [aux | -ef] [-u 使用者] [-p PID,…] [-o 欄位,…] [--sort=-%cpu]', summary: '列出行程',
    description: [
      '不加選項時只列出這個終端機（pts/0）上自己的行程。aux 列出所有人的所有行程（USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND）；-ef 是 Unix 格式（UID PID PPID C STIME TTY TIME CMD）。',
      'STAT 的第一個字母：R 執行中、S 睡眠、D 不可中斷、T 停止、Z 殭屍、I 閒置的核心執行緒；s 是工作階段的領導者，+ 在前景。這一行的指令（ps 自己、管線裡的 grep）也會出現在清單裡。',
    ],
    options: [['aux', '所有使用者的所有行程（BSD 格式）'], ['-e', '所有行程'], ['-f', '完整格式（含 PPID）'], ['-u', '指定使用者'], ['-p', '指定 PID'], ['-o', '自訂欄位：pid,ppid,user,%cpu,%mem,vsz,rss,tty,stat,ni,time,comm,args,cmd'], ['--sort', '排序；- 表示由大到小，例如 --sort=-%mem']],
  },
  top: {
    usage: 'top -b -n 1 [-o 欄位] [-u 使用者] [-c]', summary: '行程的即時排行（模擬環境：一次的快照）',
    description: ['真正的 top 每隔幾秒更新畫面；模擬環境只支援批次模式的一次快照。第一行是時間、開機多久、使用者數與平均負載（1、5、15 分鐘），接著是行程數、CPU 與記憶體的摘要。', '預設依 %CPU 由大到小排序。'],
    options: [['-b', '批次模式'], ['-n 1', '只輸出一次'], ['-o', '排序的欄位：%CPU、%MEM、PID、RES、TIME+'], ['-u', '只看某個使用者'], ['-c', 'COMMAND 顯示完整的指令']],
  },
  kill: {
    usage: 'kill [-s 訊號 | -訊號] PID|%工作…  或  kill -l [訊號]', summary: '送訊號給行程（Shell 的內建指令）',
    description: [
      '預設送 SIGTERM（15）：請程式自己結束，程式可以先清理，也可以忽略。SIGKILL（9）由核心直接結束行程，不能被攔截或忽略，所以留到最後才用。SIGHUP（1）常讓服務重新讀取設定；SIGINT（2）等於按 Ctrl+C；SIGSTOP 與 SIGCONT 暫停與繼續。',
      '只能對自己的行程送訊號（root 例外），否則是 Operation not permitted。PID 1 與核心執行緒不受影響。',
    ],
    options: [['-9', '等於 -KILL、-SIGKILL'], ['-s', '以名稱或數字指定訊號'], ['-l', '列出訊號；kill -l 9 印出 KILL']],
  },
  pgrep: { usage: 'pgrep [-l] [-a] [-f] [-x] [-u 使用者] 樣式', summary: '依名稱找出行程的 PID', description: ['樣式是延伸正規表示式，比對行程名稱；-f 比對整個指令。找不到時結束碼是 1。pgrep 不會找到自己。'], options: [['-l', '加上名稱'], ['-a', '加上完整的指令'], ['-f', '比對完整的指令'], ['-x', '整個名稱相同'], ['-u', '只找某個使用者的行程'], ['-n', '只要最新的'], ['-o', '只要最舊的']] },
  pidof: { usage: 'pidof 程式…', summary: '列出程式的 PID', description: ['名稱必須完全相同；PID 由新到舊印在同一行。找不到時結束碼是 1。'], options: [] },
  pkill: { usage: 'pkill [-訊號] [-f] [-x] [-u 使用者] 樣式', summary: '依名稱送訊號', description: ['和 pgrep 一樣比對名稱，然後送訊號（預設 SIGTERM）。不會印出任何東西；沒有符合的行程時結束碼是 1。'], options: [['-f', '比對完整的指令'], ['-x', '整個名稱相同'], ['-u', '只送給某個使用者的行程']] },
  sleep: { usage: 'sleep 秒數[smhd]', summary: '等待一段時間', description: ['模擬環境的時鐘不會前進，所以 sleep 立刻結束（結束碼 0）。sleep 300 & 把它放到背景，成為一個背景工作，可以用 jobs、fg、bg 與 kill %1 練習。'], options: [] },
  jobs: { usage: 'jobs [-l]', summary: '列出背景工作（Shell 的內建指令）', description: ['[1]+ 是目前的工作（fg、bg 不指定時用它），[2]- 是前一個。Running 表示在背景執行，Stopped 表示被暫停。'], options: [['-l', '加上 PID']] },
  fg: { usage: 'fg [%工作]', summary: '把工作移到前景（Shell 的內建指令）', description: ['真正的終端機會等它結束；模擬環境的時鐘不動，所以 sleep 立刻結束。'], options: [] },
  bg: { usage: 'bg [%工作]', summary: '讓停止的工作在背景繼續（Shell 的內建指令）', description: ['工作被 SIGSTOP（或 Ctrl+Z）暫停後，bg 讓它在背景繼續執行。'], options: [] },
  date: { usage: 'date', summary: '顯示日期與時間', description: ['模擬的機器有固定的「現在」（UTC），日誌、ps 與 systemctl 的時間都以它計算。'], options: [] },
  uptime: { usage: 'uptime', summary: '開機多久與平均負載', description: ['平均負載是過去 1、5、15 分鐘裡等待 CPU 的行程數平均；長期高於 CPU 核心數，表示 CPU 不夠用。'], options: [] },
  apt: {
    usage: 'apt [-y] update|install|remove|purge|autoremove|upgrade|list|show|policy [套件…]', summary: '套件管理（Debian、Ubuntu）',
    description: [
      'update 更新套件清單（不安裝任何東西）；install 安裝並自動安裝相依的套件；remove 移除（保留 /etc 的設定檔），purge 連設定檔一起刪除；upgrade 升級所有可升級的套件（被 hold 的除外）。',
      '變更需要 root（sudo）。apt 安裝額外的相依套件、移除或升級時會詢問 Do you want to continue? [Y/n]；模擬環境沒有鍵盤，請加 -y。套件名稱=版本 可以指定版本。',
    ],
    options: [['-y', '自動回答 yes'], ['--installed', '和 list 一起：只列已安裝的'], ['--upgradable', '和 list 一起：只列可以升級的'], ['--allow-downgrades', '允許降版'], ['--allow-change-held-packages', '允許變更被 hold 的套件']],
  },
  'apt-mark': { usage: 'apt-mark hold|unhold|showhold|auto|manual [套件…]', summary: '標記套件', description: ['hold 讓套件停在目前的版本（apt upgrade 會保留它，顯示 kept back）；unhold 解除；showhold 列出被 hold 的套件。auto／manual 標記是否為自動安裝（autoremove 只移除自動安裝且不再需要的套件）。'], options: [] },
  dpkg: { usage: 'dpkg -l [樣式…] | -L 套件 | -s 套件', summary: '查看 dpkg 的套件資料庫', description: ['-l 每行開頭兩個字母：ii 已安裝、hi 已安裝並被 hold、rc 已移除但設定檔還在。-L 列出套件安裝的檔案；-s 顯示狀態。模擬環境不安裝 .deb 檔案（dpkg -i）。'], options: [['-l', '列出套件'], ['-L', '列出套件的檔案'], ['-s', '套件的狀態']] },
  systemctl: {
    usage: 'systemctl start|stop|restart|reload|status|enable|disable|is-active|is-enabled|daemon-reload|cat|reset-failed|list-units|list-unit-files [服務…]', summary: '管理 systemd 的服務',
    description: [
      'start、stop、restart 立刻改變服務的狀態；enable、disable 只決定開機時是否啟動（在 multi-user.target.wants 建立或刪除連結），enable --now 兩件事一起做。變更需要 root。',
      '修改 unit 檔之後要執行 daemon-reload，systemd 才會讀到新的內容；否則 status 與 start 會提醒，而且仍用舊的設定。status 的結束碼：0 執行中、3 沒有執行、4 沒有這個服務。',
    ],
    options: [['--now', '和 enable、disable 一起：同時啟動或停止'], ['--all', '和 list-units 一起：也列出沒有執行的'], ['--failed', '只列出失敗的服務'], ['--type=service', '只列服務（模擬環境只有服務）']],
  },
  journalctl: {
    usage: 'journalctl [-u 服務] [-p 等級] [--since 時間] [--until 時間] [-n 行數] [-r] [-k] [-g 樣式] [--no-pager]', summary: '查詢 systemd 的 journal 日誌',
    description: [
      '等級（-p）：0 emerg、1 alert、2 crit、3 err、4 warning、5 notice、6 info、7 debug；-p err 顯示 err 與更嚴重的。時間可以寫 "2026-11-22 09:00"、09:30、today、yesterday、"1 hour ago"、-30min，以機器固定的「現在」計算。',
      '一般使用者要在 adm 或 systemd-journal 群組才看得到系統的日誌。模擬環境的日誌不會再增加，所以不支援 -f。',
    ],
    options: [['-u', '只看某個服務'], ['-p', '只看某個等級以上'], ['--since', '從某個時間開始'], ['--until', '到某個時間為止'], ['-n', '最後 N 筆'], ['-r', '新的在前'], ['-k', '只看核心訊息'], ['-g', '訊息符合樣式'], ['-o', '格式：short、short-iso、cat']],
  },
};

/** E7–E9 (§15–§17): SSH, the Bash interpreter's commands and scheduling. */
export const LATER_MANUAL: Record<'ssh' | 'ssh-keygen' | 'ssh-copy-id' | 'ssh-keyscan' | 'scp' | 'sshd' | 'exit' | 'bash' | 'sh' | 'test' | '[' | 'printf' | 'true' | 'false'
  | 'crontab' | 'cron-next' | 'cron-run' | 'flock' | 'timedatectl' | 'systemd-analyze', ManualEntry> = {
  ssh: {
    usage: 'ssh [-i 私鑰] [-p 連接埠] [-o 選項] [使用者@]主機 [指令…]', summary: '以 SSH 登入遠端主機，或在遠端執行一個指令',
    description: [
      '第一次連線時先核對主機指紋（known_hosts）；模擬環境沒有鍵盤，請用 -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts。',
      '先試金鑰（-i 或 ~/.ssh/id_ed25519），再試密碼（只有課程提供密碼的帳號）；伺服器依它「上次啟動或 reload 時」的 sshd_config 決定接受哪些方式。',
      '沒有指令時開啟互動式的工作階段，提示字元換成遠端主機，exit 回到本機；有指令時只在遠端執行它並回傳結束碼。',
    ],
    options: [['-i 檔案', '使用的私鑰'], ['-p N', '連接埠'], ['-o 選項', 'StrictHostKeyChecking=accept-new、BatchMode=yes、PasswordAuthentication=no、PubkeyAuthentication=no'], ['-q', '不印警告']],
  },
  'ssh-keygen': {
    usage: "ssh-keygen -t ed25519 [-f 檔案] -N '' [-C 說明] | -l -f 檔案 | -R 主機 | -F 主機", summary: '產生金鑰、顯示指紋、管理 known_hosts',
    description: ['產生的私鑰權限是 600、公鑰 644；模擬環境的金鑰由種子算出（格式與指紋的算法和 OpenSSH 相同，但不是真的金鑰）。', '模擬環境沒有鍵盤：密語要用 -N 指定（-N \'\' 是沒有密語）。'],
    options: [['-t', '金鑰類型（只支援 ed25519）'], ['-f', '私鑰的檔名（公鑰是加上 .pub）'], ['-N', '密語'], ['-C', '說明（預設 使用者@主機）'], ['-l', '顯示指紋'], ['-R', '從 known_hosts 移除主機'], ['-F', '在 known_hosts 找主機']],
  },
  'ssh-copy-id': {
    usage: 'ssh-copy-id [-i 公鑰] [-p 連接埠] 使用者@主機', summary: '把公鑰加到遠端使用者的 ~/.ssh/authorized_keys',
    description: ['先試著用這把金鑰登入（已經裝過就略過），否則以密碼登入後附加公鑰；新建的 ~/.ssh 是 700、authorized_keys 是 600。', '伺服器不接受密碼登入時無法使用（這時要用其他已經能登入的方式放公鑰）。'],
    options: [['-i', '公鑰檔（預設 ~/.ssh/id_ed25519.pub）']],
  },
  'ssh-keyscan': { usage: 'ssh-keyscan [-p 連接埠] 主機…', summary: '取得主機的公鑰', description: ['輸出 known_hosts 格式的一行，可以 >> ~/.ssh/known_hosts；加入之前應該用其他管道核對指紋（ssh-keygen -l -f）。'], options: [['-p', '連接埠'], ['-t', '金鑰類型']] },
  scp: { usage: 'scp [-i 私鑰] [-P 連接埠] 來源… [使用者@]主機:路徑（或反過來）', summary: '透過 SSH 複製檔案', description: ['認證與 ssh 相同；遠端的相對路徑從使用者的家目錄算起。模擬環境只複製檔案（不支援 -r），也不印進度。'], options: [['-i', '私鑰'], ['-P', '連接埠（大寫）']] },
  sshd: { usage: 'sshd -t | -T', summary: 'OpenSSH 伺服器', description: ['-t 檢查 /etc/ssh/sshd_config（含 Include 的檔案）的語法；-T 印出生效的設定。同一個設定寫兩次時，第一個生效。', '修改設定後要 sudo systemctl reload ssh 才會套用（reload 前會先執行 sshd -t，設定錯誤時不套用）。'], options: [['-t', '檢查設定'], ['-T', '印出設定']] },
  exit: { usage: 'exit [N]', summary: '結束 Shell（Shell 的內建指令）', description: ['在 ssh 的遠端工作階段中離開並回到本機；在指令稿中結束指令稿，結束碼是 N（預設是上一個指令的結束碼）。'], options: [] },
  bash: {
    usage: 'bash [-n] [-x] [-e] [-u] [-o pipefail] 指令稿 [參數…] | bash -c 指令', summary: '執行 Bash 指令稿（模擬環境的有界直譯器）',
    description: ['支援變數與參數、引號、$( )、$(( ))、if、for、while、case、函式、[[ ]] 與 set -euo pipefail；陣列、trap、行程替換不支援。', '執行步數、函式層數、指令稿層數與輸出長度都有上限。'],
    options: [['-n', '只檢查語法'], ['-x', '印出執行的每個指令'], ['-e', '指令失敗就停止'], ['-u', '使用未設定的變數就停止'], ['-c', '執行字串中的指令']],
  },
  sh: { usage: 'sh 指令稿 [參數…] | sh -c 指令', summary: '以 sh 執行指令稿', description: ['Ubuntu 的 sh 是 dash；模擬環境以同一個直譯器執行（不檢查 dash 不支援的 Bash 寫法）。'], options: [] },
  test: { usage: 'test 條件', summary: '檢查條件（Shell 的內建指令）', description: ['條件成立時結束碼是 0，否則 1，寫錯時 2。-e -f -d -r -w -x -s 檢查檔案，-z -n 檢查字串，= != 比較字串，-eq -ne -lt -le -gt -ge 比較整數，! 是「不」。'], options: [] },
  '[': { usage: '[ 條件 ]', summary: '檢查條件（和 test 相同，最後要有 ]）', description: ['[ 與 ] 的前後都要有空白；變數請加雙引號，例如 [ -z "$name" ]。'], options: [] },
  printf: { usage: 'printf 格式 [參數…]', summary: '依格式輸出（Shell 的內建指令）', description: ['%s 字串、%d 整數、%5.2f 小數、%-10s 靠左；\\n 換行。參數比格式多時重複使用格式。'], options: [] },
  true: { usage: 'true', summary: '什麼都不做，結束碼 0', description: ['常用在 while true 迴圈。'], options: [] },
  false: { usage: 'false', summary: '什麼都不做，結束碼 1', description: ['常用來測試 set -e 與 ||。'], options: [] },
  crontab: {
    usage: 'crontab [-u 使用者] 檔案 | -l | -r', summary: '安裝、列出或刪除使用者的 crontab',
    description: ['每行是「分 時 日 月 週 指令」（或 @daily 等），檔案最後一行也要換行；安裝前先檢查語法。', 'crontab 檔案 會「取代」整份 crontab。模擬環境沒有編輯器，不支援 -e。'],
    options: [['-l', '列出'], ['-r', '刪除'], ['-u', '指定使用者（需要 root）']],
  },
  'cron-next': {
    usage: "cron-next [-n 次數] '分 時 日 月 週' | cron-next -l", summary: '（模擬環境的教學輔助，不是真實的指令）列出接下來的執行時間',
    description: ['依機器固定的時間與時區計算；-l 列出這台機器所有的排程工作與下一次執行的時間。真實系統可以用 systemd-analyze calendar 或線上的 cron 解析工具。'],
    options: [['-n', '列出幾次（預設 5）'], ['-l', '列出所有工作']],
  },
  'cron-run': {
    usage: 'cron-run', summary: '（模擬環境的教學輔助，不是真實的指令）執行下一批到期的工作',
    description: ['以 cron 的方式執行：工作的使用者、家目錄、SHELL=/bin/sh、PATH=/usr/bin:/bin 與 crontab 的變數；輸出寄給使用者（有郵件伺服器時）或被捨棄。機器的時鐘不前進。'],
    options: [],
  },
  flock: { usage: 'flock [-n] [-w 秒] [-E 結束碼] 鎖檔 指令… | flock [-n] 鎖檔 -c 指令', summary: '取得檔案鎖再執行指令，避免同一個工作重疊執行', description: ['鎖被其他行程持有時，-n 立刻放棄（結束碼 1）；沒有 -n 會一直等待。'], options: [['-n', '拿不到鎖就放棄'], ['-w', '最多等待幾秒'], ['-E', '拿不到鎖時的結束碼'], ['-c', '以 sh -c 執行指令']] },
  timedatectl: { usage: 'timedatectl [status | show | list-timezones]', summary: '顯示時間與時區', description: ['Local time 是時區的時間，Universal time 是 UTC。模擬環境的時間與時區由課程設定，不能修改。'], options: [] },
  'systemd-analyze': {
    usage: 'systemd-analyze calendar [--iterations=N] 運算式…', summary: '解析 OnCalendar= 的時間運算式',
    description: ['印出正規化的寫法與接下來的觸發時間（依機器的時區），例如 systemd-analyze calendar "Mon..Fri *-*-* 02:00"。'],
    options: [['--iterations=N', '列出 N 次']],
  },
};

/** E10–E12 (SRV0_SERVER_CAPABILITY.md §6–§8): the network commands of the sockets, dns and http profiles. */
export const SERVER_MANUAL: Record<'ss' | 'lsof' | 'nc' | 'ip' | 'getent' | 'dig' | 'host' | 'named-checkzone' | 'rndc' | 'resolvectl' | 'curl' | 'openssl' | 'certbot' | 'nginx' | 'ufw' | 'nft', ManualEntry> = {
  ss: {
    usage: 'ss [-t] [-u] [-l] [-a] [-n] [-p] [-4] [-H] [sport = :埠 | dport = :埠]', summary: '列出 socket（取代 netstat）',
    description: ['預設只列出已建立的連線；-l 只列監聽中的 socket，-a 兩者都列。UDP 先列，再列 TCP。', '-p 的 users:((…)) 只顯示你能查看的行程：一般使用者只看到自己的，要看 root 或別人的行程請用 sudo。', 'Local Address 是 0.0.0.0 表示接受每個位址的連線；127.0.0.1 只接受本機自己的連線。'],
    options: [['-t', 'TCP'], ['-u', 'UDP'], ['-l', '監聽中的 socket'], ['-a', '全部'], ['-n', '連接埠以數字顯示（不查 /etc/services）'], ['-p', '顯示使用 socket 的行程'], ['-H', '不印標題列']],
  },
  lsof: {
    usage: 'lsof -i [4][tcp|udp][:埠] [-n] [-P] [-sTCP:LISTEN]', summary: '列出開啟網路 socket 的行程',
    description: ['依 PID 排序；一般使用者只看到自己的行程，sudo lsof -i 才看得到全部。找不到時不印任何東西，結束碼 1。', 'NAME 欄的 * 表示所有位址；預設把埠換成 /etc/services 的名稱、位址換成 /etc/hosts 的名稱。'],
    options: [['-i', '網路 socket（可加 :埠、tcp、udp）'], ['-n', '位址不換成名稱'], ['-P', '連接埠不換成名稱'], ['-s', '依狀態過濾，例如 -sTCP:LISTEN']],
  },
  nc: {
    usage: 'nc -z [-v] [-n] [-w 秒] 主機 埠[-埠]', summary: '檢查能不能連到主機的 TCP 連接埠（netcat）',
    description: ['succeeded：有程式在監聽；Connection refused：主機在，但那個位址與埠沒有程式在監聽；timed out：沒有機器回應這個位址。', '模擬環境沒有鍵盤輸入，只支援 -z 的連接埠檢查。'],
    options: [['-z', '只檢查能否連線'], ['-v', '印出結果'], ['-n', '不查名稱（主機必須是位址）'], ['-w', '連線逾時的秒數']],
  },
  ip: {
    usage: 'ip [-4] [-br] address|link|route [show [dev 介面]] | ip route get 位址', summary: '顯示網路介面、位址與路由（iproute2）',
    description: ['lo 是本機的迴路介面（127.0.0.1/8）；inet 是 IPv4 位址與前綴長度，brd 是廣播位址。', 'ip route 的 default via 是預設閘道；ip route get 位址 顯示送到該位址會走哪個介面與閘道。模擬環境只能查看，不能修改。'],
    options: [['-4', '只顯示 IPv4'], ['-br', '一個介面一行的簡短格式']],
  },
  getent: {
    usage: 'getent hosts [名稱|位址…] | getent services [名稱|埠…]', summary: '依系統的設定查詢名稱資料庫',
    description: ['hosts 依 /etc/hosts、再依 DNS（引擎階段 E11 起）找名稱，和 ssh、curl 找主機的方式相同；先找 IPv6 再找 IPv4。', 'services 查 /etc/services 的服務名稱與連接埠。找不到時結束碼 2。'],
    options: [],
  },
  dig: {
    usage: 'dig [@伺服器] 名稱 [類型] [+short] [+noall +answer] [+norecurse]', summary: '查詢 DNS 記錄',
    description: ['沒有 @ 時問 /etc/resolv.conf 的 nameserver（Ubuntu 是本機的 127.0.0.53）；@伺服器 直接問那台 DNS 伺服器。', 'dig 不讀 /etc/hosts（本機的 127.0.0.53 會）。ANSWER 的第二欄是 TTL：經過快取時是剩下的秒數。', '支援的類型：A、AAAA、CNAME、MX、TXT、NS、SOA。'],
    options: [['+short', '只印資料'], ['+noall', '關閉所有段落'], ['+answer', '印出 ANSWER 段落'], ['+norecurse', '不要求遞迴']],
  },
  host: {
    usage: 'host [-t 類型] 名稱 [伺服器]', summary: '以簡短的句子查詢 DNS',
    description: ['不指定類型時查 A、AAAA 與 MX；名稱不存在時印 not found: 3(NXDOMAIN)，結束碼 1。'],
    options: [['-t', '記錄類型']],
  },
  'named-checkzone': {
    usage: 'named-checkzone [-q] 區域 檔案', summary: '檢查 BIND 的區域檔',
    description: ['和 named 載入時相同的檢查：語法、SOA 與 NS、CNAME 不能和其他記錄同名、NS 與 MX 指向的名稱要有位址。通過時印 loaded serial 與 OK。', '沒有結尾句點的名稱會接上 $ORIGIN（www.example.com 會變成 www.example.com.example.com.）。'],
    options: [['-q', '不印訊息，只看結束碼']],
  },
  rndc: {
    usage: 'rndc reload [區域]', summary: '控制執行中的 named',
    description: ['named 只在啟動或 reload 時讀取區域檔：改了檔案之後要 sudo rndc reload（或 sudo systemctl reload named）。載入失敗的區域保留舊的資料。'],
    options: [],
  },
  resolvectl: {
    usage: 'resolvectl flush-caches', summary: '控制本機的解析器 systemd-resolved',
    description: ['flush-caches 清除快取：之後的查詢重新向權威伺服器取得最新的記錄。模擬環境只支援 flush-caches。'],
    options: [],
  },
  curl: {
    usage: 'curl [-v] [-s] [-I] [-i] [-L] [-f] [-o 檔案] [-w 格式] [-H 標頭] [-X 方法] [-d 資料] [--resolve 主機:埠:位址] 網址…', summary: '送出 HTTP 請求並顯示回應',
    description: ['-v 印出連線（*）、送出的請求（>）與收到的回應標頭（<）；-I 只送 HEAD 並印出回應標頭；-L 跟隨重新導向。', '-w 可用 %{http_code}、%{url_effective}、%{redirect_url}、%{num_redirects}、%{content_type}、%{size_download}、%{remote_ip}、%header{名稱} 等。', 'https:// 的 TLS 在引擎階段 E13 才模擬。模擬環境不印進度表。'],
    options: [['-v', '詳細過程'], ['-s', '安靜（不印錯誤，加 -S 仍印）'], ['-I', '只要標頭（HEAD）'], ['-i', '輸出也包含回應標頭'], ['-L', '跟隨重新導向'], ['-o', '把內容寫入檔案'], ['-w', '結束後印出指定的資訊'], ['-H', '加上請求標頭'], ['-X', '請求方法'], ['-d', '以 POST 送出資料']],
  },
  openssl: {
    usage: 'openssl x509 [-in 檔案] -noout [-subject] [-issuer] [-dates] [-ext subjectAltName] [-checkend 秒] [-fingerprint [-sha256]] | s_client -connect 主機:埠 [-servername 名稱] | verify [-CAfile 檔案] [-untrusted 檔案] 憑證', summary: '查看與驗證 TLS 憑證（OpenSSL 3.0）',
    description: ['x509 讀出憑證的欄位；沒有 -in 時讀標準輸入（openssl s_client … | openssl x509 -noout -dates）。-checkend N：N 秒內到期時印 Certificate will expire、結束碼 1。',
      's_client 連到伺服器，印出它送來的憑證鏈（Certificate chain）與驗證結果（Verify return code：0 ok、10 過期、20／21 鏈不完整、62 名稱不符，名稱要用 -verify_hostname 才檢查）。模擬環境的輸出是精簡過的摘要，結束時就像標準輸入是空的（DONE）。',
      'verify 用信任庫（/etc/ssl/certs/ca-certificates.crt，與 -CAfile）驗證檔案中的第一張憑證；中繼憑證要用 -untrusted 提供。',
      '模擬環境的憑證不是真的 DER，PEM 的內容是課程資料（改動就會壞掉）；也不提供 req、genrsa 等產生金鑰的子指令。'],
    options: [['x509', '查看憑證'], ['s_client', '以 TLS 連到伺服器'], ['verify', '驗證憑證鏈'], ['version', '版本']],
  },
  certbot: {
    usage: 'certbot certonly --webroot -w 目錄 -d 網域… | certbot --nginx -d 網域… | certbot certificates | certbot renew [--dry-run] [--force-renewal]', summary: '向 Let\'s Encrypt 取得、安裝與更新憑證（ACME）',
    description: ['HTTP-01 驗證：certbot 把 token 檔放在 目錄/.well-known/acme-challenge/，CA 從網際網路（權威 DNS，不看本機的 /etc/hosts 與快取）連到 http://網域/ 的 80 埠取回它。',
      '憑證存在 /etc/letsencrypt/live/網域/（fullchain.pem、privkey.pem…）；renew 只更新 30 天內到期的憑證，--dry-run 模擬更新每一張（不寫入）。certbot.timer 每天兩次執行 certbot -q renew。',
      '--webroot 只取得憑證，網頁伺服器要自己 reload 才會用新的憑證（或用 --deploy-hook）；--nginx 會修改 server 區塊並 reload nginx。需要 root。'],
    options: [['--webroot -w', '以檔案驗證，-w 是網站的根目錄'], ['--nginx', '由 nginx 驗證並安裝'], ['-d', '網域（可多個）'], ['--dry-run', '只模擬，不寫入'], ['--deploy-hook', '取得新憑證後執行的指令'], ['-q', '安靜']],
  },
  nginx: {
    usage: 'nginx -t | -T | -s reload|stop|quit | -v', summary: 'nginx 網頁伺服器的控制程式',
    description: ['-t 檢查設定（/etc/nginx/nginx.conf 與 include 的檔案）；-T 檢查並印出全部設定。修改設定之後先 nginx -t，再 systemctl reload nginx（或 nginx -s reload）才會生效。',
      'reload 失敗時 nginx 繼續用舊的設定；restart 失敗則 nginx 停止，網站中斷。一般使用者執行 nginx -t 會因為 log 與 pid 檔失敗，請用 sudo。',
      '模擬環境：proxy_pass 與 upstream 在引擎階段 E15 才模擬；log_format、map、set 不支援，if 只支援 return 與 rewrite。'],
    options: [['-t', '檢查設定'], ['-T', '檢查並印出設定'], ['-s', '送訊號給執行中的 nginx（reload、stop、quit、reopen）'], ['-q', '檢查時只印錯誤'], ['-c', '指定設定檔']],
  },
  ufw: {
    usage: 'ufw status [verbose|numbered] | default deny|allow|reject incoming|outgoing | allow|deny|reject|limit 規則 | delete 編號|規則 | [--force] enable | disable | reload | app list|info 名稱', summary: 'Ubuntu 的主機防火牆（Uncomplicated Firewall）',
    description: ['規則依順序比對，第一個符合的決定；都不符合時用預設原則（deny 丟棄封包：對方逾時；reject 回絕：對方立刻得到 Connection refused）。已建立的連線（狀態追蹤）與 lo 一律放行。',
      '規則的寫法：ufw allow 22/tcp、ufw allow OpenSSH、ufw allow \'Nginx Full\'、ufw allow from 10.0.0.0/24 to any port 22 proto tcp、ufw limit ssh。啟用前先允許 SSH，否則新的 SSH 連線會被擋在外面。',
      '在 SSH 工作階段中 enable 會先詢問；模擬環境沒有鍵盤，請用 sudo ufw --force enable（或 echo y | sudo ufw enable）。需要 root。'],
    options: [['status', '狀態與規則（numbered 加上編號，verbose 加上預設原則）'], ['default', '預設原則'], ['allow', '允許'], ['deny', '丟棄'], ['reject', '回絕'], ['limit', '限制連線頻率（30 秒內 6 次）'], ['delete', '刪除規則'], ['insert', '插入到第 N 條'], ['enable', '啟用（開機時也啟用）'], ['disable', '停用']],
  },
  nft: {
    usage: 'nft [-a] list ruleset | add table inet filter | add chain inet filter input \'{ type filter hook input priority 0; policy drop; }\' | add rule inet filter input 條件 動作 | delete rule inet filter input handle N | -f 檔案', summary: 'nftables：Linux 核心的封包過濾規則',
    description: ['input 鏈的規則依順序比對：ct state established,related accept（狀態追蹤）、iif lo accept、ip saddr 10.0.0.0/24 tcp dport 22 accept、tcp dport { 80, 443 } accept；都不符合時用鏈的 policy（drop 丟棄）。',
      '先加 ct state established,related accept 再把 policy 改成 drop，否則連目前的 SSH 工作階段也會被切斷。sudo nft -f /etc/nftables.conf 一次載入整份設定。',
      '模擬環境支援 inet／ip 表的 input 與 output 鏈；jump、set、named counter 等不支援。'],
    options: [['-a', '列出 handle（刪除規則時要用）'], ['-f', '從檔案載入'], ['-c', '只檢查檔案的語法']],
  },
};

/** The pages a feature changes: cat reads standard input and echo has -n with pipes; chmod has -R with accounts. */
const FEATURE_MANUAL: [ShellFeature, CommandName, ManualEntry][] = [
  ['pipes', 'cat', { usage: 'cat [-n] [檔案]…', summary: '顯示檔案內容', description: ['依序印出每個檔案；沒有檔案（或檔名是 -）時讀標準輸入。'], options: [['-n', '在每一行前面加上行號']] }],
  ['pipes', 'echo', { usage: 'echo [-n] [-e] [文字]…', summary: '輸出一行文字', description: ['把文字印到標準輸出；要寫入檔案請用重新導向 > 或 >>。echo 不認得 --help，會把它當成文字印出。'], options: [['-n', '最後不換行'], ['-e', '解讀 \\n 與 \\t']] }],
  ['accounts', 'chmod', { ...MANUAL.chmod, usage: 'chmod [-R] 模式 路徑…', options: [['-R', '包含目錄裡的一切']] }],
  ['tls', 'curl', {
    usage: 'curl [-v] [-s] [-k] [-I] [-i] [-L] [-f] [-o 檔案] [-w 格式] [-H 標頭] [-X 方法] [-d 資料] [--cacert 檔案] [--resolve 主機:埠:位址] 網址…', summary: '送出 HTTP／HTTPS 請求並顯示回應',
    description: ['-v 印出連線與 TLS 交握（*）、送出的請求（>）與收到的回應標頭（<）；-I 只送 HEAD；-L 跟隨重新導向。',
      'https:// 依信任庫（/etc/ssl/certs/ca-certificates.crt，或 --cacert）驗證憑證鏈與名稱：失敗時是錯誤 60；-k 不驗證（只用來除錯）。模擬環境不印進度表。'],
    options: [['-v', '詳細過程'], ['-s', '安靜（不印錯誤，加 -S 仍印）'], ['-k', '不驗證伺服器的憑證'], ['-I', '只要標頭（HEAD）'], ['-i', '輸出也包含回應標頭'], ['-L', '跟隨重新導向'], ['-o', '把第一個網址的內容寫入檔案'], ['-w', '結束後印出指定的資訊'], ['-H', '加上或取代請求標頭'], ['-X', '請求方法'], ['-d', '以 POST 送出資料']],
  }],
  ['proxy', 'nginx', {
    ...SERVER_MANUAL.nginx,
    description: ['-t 檢查設定（/etc/nginx/nginx.conf 與 include 的檔案）；-T 檢查並印出全部設定。修改設定之後先 nginx -t，再 systemctl reload nginx（或 nginx -s reload）才會生效。',
      'reload 失敗時 nginx 繼續用舊的設定；restart 失敗則 nginx 停止，網站中斷。一般使用者執行 nginx -t 會因為 log 與 pid 檔失敗，請用 sudo。',
      '反向代理：proxy_pass、proxy_set_header、upstream（round robin、least_conn、ip_hash、backup、max_fails）；後端拒絕連線是 502，逾時是 504，原因寫在 error.log。模擬環境不支援 log_format 與 set，map 只支援精確值、~正規表示式與 default。'],
  }],
  ['tunnels', 'ssh', {
    usage: 'ssh [-i 私鑰] [-p 連接埠] [-o 選項] [-F 設定檔] [-J 跳板機] [-L [位址:]埠:主機:埠] [-R [位址:]埠:主機:埠] [-f] [-N] [-g] [使用者@]主機 [指令…]', summary: '以 SSH 登入遠端主機、執行指令、建立通道',
    description: [
      '第一次連線時先核對主機指紋（known_hosts）；模擬環境沒有鍵盤，請用 -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts（跳板機不會沿用命令列的 -o，和 OpenSSH 相同）。',
      '~/.ssh/config 的 Host 區塊可以設定 HostName、User、Port、IdentityFile、ProxyJump、LocalForward；命令列的選項優先，同一個設定第一個出現的值生效。',
      '-J 跳板機：經由跳板機連到只有它連得到的主機。-L 本機埠:主機:埠：在本機（127.0.0.1）監聽，連線由伺服器那一端連到主機:埠；-R 遠端埠:主機:埠：在伺服器監聽，連線回到本機這一端。通道要配合 -f -N 在背景執行，kill 那個 ssh 就關閉。',
    ],
    options: [['-J 主機', '經由跳板機（ProxyJump）'], ['-L 規格', '本機轉送'], ['-R 規格', '遠端轉送'], ['-f', '登入後在背景執行'], ['-N', '不執行遠端指令（只建立通道）'], ['-g', '本機轉送也接受其他主機的連線'], ['-F 檔案', '另一個設定檔']],
  }],
  ['scripting', 'date', { usage: 'date [-u] [+格式]', summary: '顯示機器的時間（固定不動）', description: ['+%F 是 2026-11-22、+%H:%M 是時與分、+%s 是 1970 年起的秒數；有時區的機器顯示當地時間，-u 顯示 UTC，TZ=時區 date 換時區顯示。'], options: [['-u', '顯示 UTC']] }],
];

/** The manual of a command in a profile with these features. */
export function manualEntry(cmd: CommandName, features: Iterable<ShellFeature> = []): ManualEntry {
  const have = new Set(features);
  const special = FEATURE_MANUAL.find(([f, c]) => c === cmd && have.has(f));
  if (special) return special[2];
  return (MANUAL as Partial<Record<CommandName, ManualEntry>>)[cmd] ?? (STREAM_MANUAL as Partial<Record<CommandName, ManualEntry>>)[cmd] ?? (USER_MANUAL as Partial<Record<CommandName, ManualEntry>>)[cmd]
    ?? (SYSTEM_MANUAL as Partial<Record<string, ManualEntry>>)[cmd] ?? (LATER_MANUAL as Partial<Record<string, ManualEntry>>)[cmd] ?? (SERVER_MANUAL as Record<string, ManualEntry>)[cmd];
}

const optionLines = (options: [string, string][], indent: string, width: number) => options.map(([flag, text]) => `${indent}${flag.padEnd(width)}${text}`);

/** What `指令 --help` prints. */
export function helpPage(cmd: CommandName, features?: Iterable<ShellFeature>): string[] {
  const e = manualEntry(cmd, features);
  return [`用法：${e.usage}`, `${e.summary}。`, ...e.description, ...(e.options.length ? ['', ...optionLines(e.options, '  ', 6)] : [])];
}

/** What `man 指令` prints. */
export function manualPage(cmd: CommandName, features?: Iterable<ShellFeature>): string[] {
  const e = manualEntry(cmd, features), title = `${cmd.toUpperCase()}(1)`, indent = ' '.repeat(7);
  return [
    `${title}        User Commands        ${title}`, '',
    'NAME', `${indent}${cmd} - ${e.summary}`, '',
    'SYNOPSIS', `${indent}${e.usage}`, '',
    'DESCRIPTION', ...e.description.map(l => indent + l),
    ...(e.options.length ? ['', 'OPTIONS', ...optionLines(e.options, indent, 7)] : []),
  ];
}
