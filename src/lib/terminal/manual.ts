import type { CommandName } from './shell';

/*
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): the short, fixed manual of every command, printed by
 * `man 指令` and `指令 --help` in a profile that has them. It describes what the simulator does (its options, not every
 * option of the real tool). Section headings follow real manual pages (NAME, SYNOPSIS…); the text is Traditional Chinese.
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

export const MANUAL: Record<CommandName, ManualEntry> = {
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

const optionLines = (options: [string, string][], indent: string, width: number) => options.map(([flag, text]) => `${indent}${flag.padEnd(width)}${text}`);

/** What `指令 --help` prints. */
export function helpPage(cmd: CommandName): string[] {
  const e = MANUAL[cmd];
  return [`用法：${e.usage}`, `${e.summary}。`, ...e.description, ...(e.options.length ? ['', ...optionLines(e.options, '  ', 6)] : [])];
}

/** What `man 指令` prints. */
export function manualPage(cmd: CommandName): string[] {
  const e = MANUAL[cmd], title = `${cmd.toUpperCase()}(1)`, indent = ' '.repeat(7);
  return [
    `${title}        User Commands        ${title}`, '',
    'NAME', `${indent}${cmd} - ${e.summary}`, '',
    'SYNOPSIS', `${indent}${e.usage}`, '',
    'DESCRIPTION', ...e.description.map(l => indent + l),
    ...(e.options.length ? ['', 'OPTIONS', ...optionLines(e.options, indent, 7)] : []),
  ];
}
