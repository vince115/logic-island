import type { CommandName, FilesCommand, ShellFeature } from './shell';

/*
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): the short, fixed manual of every command, printed by
 * `man 指令` and `指令 --help` in a profile that has them. It describes what the simulator does (its options, not every
 * option of the real tool). Section headings follow real manual pages (NAME, SYNOPSIS…); the text is Traditional Chinese.
 *
 * MANUAL covers the files profile's commands; engine stages E2 and E3 (§10, §11) add STREAM_MANUAL and USER_MANUAL, and
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

/** The pages a feature changes: cat reads standard input and echo has -n with pipes; chmod has -R with accounts. */
const FEATURE_MANUAL: [ShellFeature, CommandName, ManualEntry][] = [
  ['pipes', 'cat', { usage: 'cat [-n] [檔案]…', summary: '顯示檔案內容', description: ['依序印出每個檔案；沒有檔案（或檔名是 -）時讀標準輸入。'], options: [['-n', '在每一行前面加上行號']] }],
  ['pipes', 'echo', { usage: 'echo [-n] [-e] [文字]…', summary: '輸出一行文字', description: ['把文字印到標準輸出；要寫入檔案請用重新導向 > 或 >>。echo 不認得 --help，會把它當成文字印出。'], options: [['-n', '最後不換行'], ['-e', '解讀 \\n 與 \\t']] }],
  ['accounts', 'chmod', { ...MANUAL.chmod, usage: 'chmod [-R] 模式 路徑…', options: [['-R', '包含目錄裡的一切']] }],
];

/** The manual of a command in a profile with these features. */
export function manualEntry(cmd: CommandName, features: Iterable<ShellFeature> = []): ManualEntry {
  const have = new Set(features);
  const special = FEATURE_MANUAL.find(([f, c]) => c === cmd && have.has(f));
  if (special) return special[2];
  return (MANUAL as Partial<Record<CommandName, ManualEntry>>)[cmd] ?? (STREAM_MANUAL as Partial<Record<CommandName, ManualEntry>>)[cmd] ?? (USER_MANUAL as Record<string, ManualEntry>)[cmd];
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
