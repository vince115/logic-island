import type { TerminalFile } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX02 The Terminal and Shell Basics (LNX-1). A terminal lesson on the files profile (engine stage E1): one small
 * development machine, lab-02, logged in as the user mei and, in a second session, as root (the # prompt). The
 * transcripts show the prompt, options and arguments (with quotes), man and --help, and the common error messages; the
 * exercises find an option with --help, list hidden files (an output check with a variant), fix a mistyped command and
 * write a file with > and >>. Every transcript output is what the engine prints (checked by terminalContentProblems).
 */

const FILES: TerminalFile[] = [
  { path: '/etc', kind: 'dir', mode: 0o755, owner: 'root' },
  { path: '/etc/hostname', kind: 'file', mode: 0o644, owner: 'root', content: 'lab-02\n' },
  { path: '/home', kind: 'dir', mode: 0o755, owner: 'root' },
  { path: '/home/mei', kind: 'dir', mode: 0o755, owner: 'mei' },
  { path: '/home/mei/.profile', kind: 'file', mode: 0o644, owner: 'mei', content: 'umask 022\n' },
  { path: '/home/mei/docs', kind: 'dir', mode: 0o755, owner: 'mei' },
  { path: '/home/mei/docs/draft.txt', kind: 'file', mode: 0o644, owner: 'mei', content: '週報第一版\n' },
  { path: '/home/mei/notes.txt', kind: 'file', mode: 0o644, owner: 'mei', content: '買咖啡豆\n整理 projects\n' },
  { path: '/home/mei/projects', kind: 'dir', mode: 0o755, owner: 'mei' },
  { path: '/home/mei/projects/site', kind: 'dir', mode: 0o755, owner: 'mei' },
  { path: '/home/mei/projects/site/.gitignore', kind: 'file', mode: 0o644, owner: 'mei', content: 'node_modules/\n' },
  { path: '/home/mei/projects/site/index.html', kind: 'file', mode: 0o644, owner: 'mei', content: '<h1>lab-02</h1>\n' },
  { path: '/home/mei/projects/site/style.css', kind: 'file', mode: 0o644, owner: 'mei', content: 'body { margin: 0; }\n' },
  { path: '/root', kind: 'dir', mode: 0o700, owner: 'root' },
  { path: '/root/install.log', kind: 'file', mode: 0o600, owner: 'root', content: 'base system installed\n' },
];

/** What the simulator appends to "command not found": the commands of the files profile. */
const NOT_FOUND_TAIL = '（模擬環境支援：pwd、ls、cd、mkdir、touch、cat、cp、mv、rm、ln、readlink、chmod、echo、du、df、uname、hostname、whoami、man、clear、help）';

export const LNX02: LessonContent = {
  lessonId: 'LNX02',
  motivation: '伺服器、雲端主機與容器大多沒有圖形介面，管理它們的方法就是在終端機裡輸入指令。看懂提示字元告訴你的「我是誰、在哪一台機器、在哪個目錄」，知道一行指令如何被 Shell 拆成指令名稱、選項與參數，會用 `man` 與 `--help` 自己查出需要的選項，並且能從錯誤訊息看出打錯了什麼，之後每一堂 Linux 課的操作才會有把握。',
  sections: [
    {
      id: 'terminal-shell-console', title: '終端機、Shell 與主控台',
      blocks: [
        { type: 'p', text: '打開「終端機」視窗輸入 `ls`，其實有好幾個角色在合作。終端機只負責顯示文字與送出你按的鍵；真正讀懂那一行文字、找到程式並執行它的是 Shell；而主控台指的是直接接在電腦上的那組螢幕與鍵盤。這三個詞常被混用，但分清楚之後，很多現象就容易理解，例如同一個終端機視窗可以執行不同的 Shell。' },
        {
          type: 'table', head: ['名稱', '是什麼', '例子'],
          rows: [
            ['終端機（terminal）', '顯示文字、把鍵盤輸入送出去的程式或裝置；它本身不懂指令的意思。今天用的多半是模擬早期實體終端機的程式（terminal emulator）', 'GNOME Terminal、macOS 的「終端機」、Windows Terminal；早期是 DEC VT100 這類實體終端機'],
            ['Shell', '讀取你輸入的一行文字，拆成一個個字、展開萬用字元、處理 `>` 這類重新導向，再找到指令並執行。Shell 本身也是一個程式', 'bash（GNU 專案的 Shell，1989 年發布，多數 Linux 發行版的預設）、zsh、fish'],
            ['主控台（console）', '直接接在電腦上的螢幕與鍵盤。Linux 在上面提供好幾個虛擬主控台（virtual console，也叫 tty），不需要圖形介面就能登入', '機房伺服器接的螢幕；桌面系統可用 Ctrl+Alt+F3 這類按鍵切換，編號依發行版而定'],
            ['指令（command）', 'Shell 執行的對象：一個程式檔，或 Shell 自己內建的功能', '`ls`、`mkdir`、`cat` 是程式；`cd`、`help` 是 Shell 的內建指令'],
          ],
        },
        { type: 'p', text: '一行指令的旅程是：你在終端機打字並按 Enter → 終端機把這一行交給 Shell → Shell 拆解這一行，執行指令 → 指令的輸出交回終端機顯示，Shell 再印出新的提示字元等你輸入。透過 SSH 連到遠端伺服器時，你本機的終端機顯示的是遠端主機上那個 Shell 的輸出，所以提示字元會變成遠端的主機名稱。' },
        { type: 'callout', tone: 'note', title: '本課的模擬終端機', text: '頁面上的終端機是模擬器：它在瀏覽器裡模擬一台小機器，只認得一張固定的指令表（輸入 `help` 可以看到），不會執行任何真實的程式。不在表上的指令一律是 command not found，訊息後面會附上可用的指令。' },
      ],
    },
    {
      id: 'prompt', title: '提示字元：我是誰、在哪裡',
      blocks: [
        { type: 'p', text: 'Shell 準備好接收下一個指令時，會印出一段提示字元（prompt）。本課機器上 mei 的提示字元是 `mei@lab-02:~$`，它把三件最常需要確認的事放在眼前：' },
        {
          type: 'table', head: ['部分', '例子', '意思'],
          rows: [
            ['@ 前面：使用者名稱', '`mei`、`root`', '目前登入的帳號；也可以用 `whoami` 查'],
            ['@ 後面：主機名稱', '`lab-02`', '這台機器的名稱，可以用 `hostname` 查；同時連著好幾台伺服器時，靠它分辨指令會在哪一台執行'],
            [': 後面：目前位置', '`~`、`~/projects/site`、`/etc`', '目前的工作目錄。`~` 代表家目錄（mei 的家目錄是 `/home/mei`），完整路徑用 `pwd` 查'],
            ['結尾的符號', '`$` 或 `#`', '`$` 是一般使用者，`#` 是 root（系統管理員），提醒你現在的指令沒有權限限制'],
          ],
        },
        { type: 'example', id: 'lnx02-prompt' },
        { type: 'p', text: '注意 `cd projects/site` 沒有印出任何東西，變化只出現在下一個提示字元：位置從 `~` 變成 `~/projects/site`。不加參數的 `cd` 回到家目錄。最後 mei 想看 `/root`，那是 root 的家目錄，權限只允許 root 讀取，所以被拒絕。同一台機器用 root 登入時，提示字元的結尾換成 `#`：' },
        { type: 'example', id: 'lnx02-root' },
        { type: 'callout', tone: 'warning', title: '不要把 $ 一起打進去', text: '教學文件常寫成 `$ ls -l` 或 `# hostname`，前面的 `$`、`#` 是提示字元，表示「以一般使用者／以 root 執行」，不是指令的一部分。把它一起輸入會變成執行名為 `$` 的指令而失敗。看到 `#` 開頭的步驟，也要先確認自己真的需要 root 權限。' },
        { type: 'callout', tone: 'tip', title: '提示字元可以長得不一樣', text: '提示字元的格式由 Shell 的設定決定（bash 是 `PS1` 這個變數），所以不同機器可能不同：有些只顯示目錄名稱，macOS 預設的 zsh 以 `%` 結尾。不論長怎樣，`whoami`、`hostname`、`pwd` 三個指令都能確認同樣的資訊。' },
      ],
    },
    {
      id: 'command-structure', title: '指令、選項與參數',
      blocks: [
        { type: 'p', text: 'Shell 先用空白把一行切成一個個字（word）。第一個字是指令名稱；之後以 `-` 開頭的字是選項（option），改變指令的做法；其餘的字是參數（argument，說明頁裡常叫 operand），也就是指令要處理的對象，多半是檔案或目錄的路徑。例如 `ls -a projects/site`：指令是 `ls`，選項 `-a` 要它連隱藏項目一起列出，參數 `projects/site` 是要列出的目錄。' },
        {
          type: 'table', head: ['寫法', '例子', '說明'],
          rows: [
            ['短選項', '`ls -l`、`ls -a`', '一個 `-` 加一個字母'],
            ['合寫的短選項', '`ls -la` 等於 `ls -l -a`', '大多數指令允許把短選項串在一起，順序通常不影響結果'],
            ['長選項', '`ls --all`、`mkdir --parents`', '兩個 `-` 加完整的英文字，較好讀；需要值時寫成 `--width=80`（GNU 工具的慣例）'],
            ['參數', '`ls projects/site docs`', '指令要處理的對象，可以給好幾個；沒有給時，指令有自己的預設（`ls` 列出目前的目錄）'],
            ['`--`', '`rm -- -old.txt`', '表示選項到此為止，後面的字都是參數；用來處理以 `-` 開頭的檔名'],
          ],
        },
        { type: 'example', id: 'lnx02-args' },
        { type: 'p', text: '`ls -l -a` 與 `ls -la` 印出完全相同的結果，因為合寫只是省略寫法。以 `.` 開頭的名稱是隱藏項目，只有加上 `-a` 才會列出；`.` 代表目錄本身，`..` 代表上一層。GNU 工具大多同時提供兩種寫法，例如 `ls --all` 就等於 `ls -a`；模擬環境支援常用的長選項，不認得的會印出 `unrecognized option`。' },
        { type: 'callout', tone: 'warning', title: '空白會把參數切開', text: '`mkdir my notes` 不會建立名為「my notes」的目錄，而是建立 `my` 與 `notes` 兩個目錄：Shell 在空白處切開，`mkdir` 收到的是兩個參數。名稱裡有空白時要用引號包起來，`mkdir "my report"` 或 `mkdir \'my report\'` 都只傳出一個參數，引號本身不會成為名稱的一部分。引號裡的 `>`、`*` 也只是普通字元；在真實的 bash 裡，雙引號中的 `$` 仍有特殊意義（之後介紹變數時會用到），單引號則完全照字面。另外，指令與檔名都區分大小寫，`LS` 和 `ls` 是不同的名稱。' },
      ],
    },
    {
      id: 'man-and-help', title: '用 man 與 --help 查詢用法',
      blocks: [
        { type: 'p', text: '沒有人背得出每個指令的每個選項。熟練的人和新手的差別，在於知道去哪裡查、看得懂查到的東西。Linux 上有兩個隨手可用的來源：' },
        {
          type: 'table', head: ['方法', '印出什麼', '什麼時候用'],
          rows: [
            ['`指令 --help`', '簡短的用法：用法一行、一句說明、選項清單', '想快速確認某個選項的字母'],
            ['`man 指令`', '完整的說明頁（manual page），分成 NAME、SYNOPSIS、DESCRIPTION、OPTIONS 等段落', '想了解指令的完整行為與每個選項'],
            ['`help 內建指令`（bash）', 'Shell 內建指令的說明', '查 `cd` 這類內建指令；許多發行版沒有替它們準備 man 頁。本模擬環境的 `help` 則列出所有可用的指令'],
          ],
        },
        { type: 'p', text: 'SYNOPSIS（用法摘要）有固定的讀法：方括號 `[ ]` 裡的東西可以省略；`…` 表示前一項可以重複，給好幾個；中文或斜體的字（例如「目錄」「路徑」）要換成你實際的值，不是照抄。所以 `mkdir [-p] 目錄…` 的意思是：`-p` 可加可不加，至少要給一個目錄名稱，也可以一次給好幾個。標題的 `MKDIR(1)` 表示它在說明手冊的第 1 節（一般使用者的指令）；第 5 節是設定檔的格式，第 8 節是系統管理指令，例如 `man 5 passwd` 查的是 `/etc/passwd` 的格式。' },
        { type: 'example', id: 'lnx02-help' },
        {
          type: 'list', ordered: true,
          items: [
            '先用 `指令 --help` 看選項清單，找描述中符合需求的關鍵字（例如「隱藏」「中間的目錄」）。',
            '不夠清楚時再看 `man 指令` 的 DESCRIPTION，了解選項的細節與限制。',
            '先在不重要的目標上試用，例如自己剛建立的目錄。',
            '用 `ls`、`cat` 或 `pwd` 確認結果，而不是只看指令有沒有印出錯誤。',
          ],
        },
        { type: 'callout', tone: 'tip', title: '真實的 man 會分頁', text: '在真實的系統上，`man` 用分頁程式（通常是 less）顯示說明頁：空白鍵往下一頁，輸入 `/` 加關鍵字搜尋，按 `q` 離開。模擬環境把整頁一次印出。`No manual entry for vim` 在模擬環境表示它沒有這個指令；在真實系統上通常表示沒有安裝那個程式或它的說明頁。' },
      ],
    },
    {
      id: 'reading-errors', title: '讀懂錯誤訊息',
      blocks: [
        { type: 'p', text: '錯誤訊息幾乎都遵循「誰在抱怨: 對什麼: 原因」的格式。開頭是 `bash:` 的，是 Shell 自己發出的，代表指令根本沒有執行（找不到指令，或是內建指令 `cd` 出錯）；開頭是指令名稱的（`ls:`、`cp:`），代表指令已經執行，是它對你給的選項或參數有意見。讀訊息時先看最後的原因，再看出問題的是哪個字。' },
        { type: 'example', id: 'lnx02-errors' },
        {
          type: 'table', head: ['訊息', '誰印的', '原因與修正'],
          rows: [
            ['`bash: LS: command not found`', 'Shell', '找不到這個名稱的指令：檢查拼字與大小寫，或這台機器沒有安裝它'],
            ['`ls: invalid option -- \'z\'`', 'ls', '用了 ls 不認得的選項：用 `ls --help` 確認正確的字母'],
            ['`mkdir: missing operand`', 'mkdir', '少了參數：mkdir 至少要一個目錄名稱'],
            ['`cp: missing destination file operand after \'notes.txt\'`', 'cp', '只給了來源，少了目的地：`cp 來源 目的地`'],
            ['`cat: note.txt: No such file or directory`', 'cat', '路徑不存在：檢查拼字，用 `pwd` 與 `ls` 確認目前位置有哪些檔案（這裡應該是 notes.txt）'],
            ['`bash: cd: notes.txt: Not a directory`', 'Shell 的內建指令 cd', '這個路徑是檔案，不是目錄'],
            ['`ls: cannot open directory \'/root\': Permission denied`', 'ls', '目錄存在，但權限不允許你讀取'],
          ],
        },
        { type: 'callout', tone: 'note', title: '和真實系統的小差異', text: 'GNU 工具在 invalid option 與 missing operand 之後，還會多印一行 `Try \'ls --help\' for more information.`，正是提醒你去查用法（上面的範例也印出了這一行）。模擬環境的 command not found 後面附上可用的指令，真實的 bash 不會，有些發行版則會建議可以安裝哪個套件。' },
      ],
    },
    {
      id: 'history-and-redirect', title: '指令歷史與把輸出寫進檔案',
      blocks: [
        { type: 'p', text: '打錯一個字不必整行重打。在本課的終端機練習裡，按 ↑ 會叫回上一個指令，再按一次叫回更早的，↓ 往回走；叫回之後修改打錯的地方再按 Enter 就好。真實的 bash 會把歷史存在家目錄的 `.bash_history`，用 `history` 列出全部、Ctrl+R 搜尋，按 Tab 還能補完指令與檔名；這幾項模擬環境沒有。' },
        { type: 'p', text: '指令的輸出平常印在終端機上。在指令後面加上 `> 檔案`，Shell 會在執行指令之前打開那個檔案，把輸出寫進去，畫面上就不會出現；`>>` 則把輸出接在檔案最後。這是 Shell 做的事，指令本身不知道輸出去了哪裡，所以 `>` 與檔名不算指令的參數。' },
        {
          type: 'table', head: ['寫法', '檔案不存在時', '檔案已經存在時'],
          rows: [
            ['`echo 文字 > 檔案`', '建立檔案並寫入', '先清空，原本的內容消失，再寫入'],
            ['`echo 文字 >> 檔案`', '建立檔案並寫入', '接在原本的內容後面'],
          ],
        },
        { type: 'callout', tone: 'warning', title: '> 會直接覆蓋', text: '`>` 不會詢問，也不會備份：對一個已有內容的檔案用 `>`，原本的內容就消失了。要加一行紀錄時用 `>>`。另外，寫在引號裡的 `>` 只是文字，`echo "a > b.txt"` 會在畫面上印出 `a > b.txt`，不會建立任何檔案。真實的 bash 能重新導向任何指令的輸出（例如把 `ls -a` 的結果存成檔案）；本模擬環境目前只有 `echo` 支援 `>` 與 `>>`。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-who-parses', prompt: '在 Ubuntu 打開終端機視窗，輸入 `ls -l` 再按 Enter。哪一個程式負責把這一行拆成指令名稱與選項，再去執行 `ls`？',
      options: [
        '終端機，因為文字是打在它的視窗裡',
        'Shell（例如 bash）',
        'Linux 核心直接讀取鍵盤輸入並解讀',
        '`ls` 自己讀取整行文字再拆開',
      ],
      answer: 1,
      explanation: '拆解一行指令、找到並執行程式是 Shell 的工作，所以答案是 Shell。終端機只負責顯示文字與送出按鍵，不懂指令的意思；核心負責執行程式與管理硬體，不解讀指令文字；`ls` 收到的是 Shell 已經拆好的參數，看不到原本的整行。',
    },
    {
      id: 'q-prompt', prompt: '提示字元是 `root@db-03:/var/log#`。下列敘述何者正確？',
      options: [
        '登入的使用者是 db-03，主機名稱是 root',
        '目前位置是 root 的家目錄',
        '結尾的 `#` 表示這一行是註解，指令不會執行',
        '登入的是 root，主機是 db-03，目前位置是 `/var/log`',
      ],
      answer: 3,
      explanation: '提示字元的格式是「使用者@主機:目前位置」加結尾符號，所以是 root 在 db-03 的 `/var/log`。第一個選項把使用者與主機顛倒了；目前位置寫的是 `/var/log`，不是 `~`（root 的家目錄 `/root`）；提示字元結尾的 `#` 代表 root 身分，不是註解。',
    },
    {
      id: 'q-structure', prompt: '在 `ls -la /etc` 這行指令裡，`-la` 與 `/etc` 分別是什麼？',
      options: [
        '`-la` 是短選項 `-l` 與 `-a` 合寫，`/etc` 是參數（要列出的目錄）',
        '`-la` 是一個名為 la 的長選項，`/etc` 是這個選項的值',
        '`-la` 是參數，`/etc` 是選項',
        '`ls -la` 合起來才是指令名稱，`/etc` 是選項',
      ],
      answer: 0,
      explanation: '一個 `-` 後面接多個字母是把短選項合寫，`ls -la` 等於 `ls -l -a`；`/etc` 不以 `-` 開頭，是參數。長選項要用兩個 `-`（例如 `--all`）；以 `-` 開頭的字是選項而不是參數；指令名稱只有第一個字 `ls`，`/etc` 也不是選項。',
    },
    {
      id: 'q-missing-operand', prompt: '輸入 `mkdir` 後看到 `mkdir: missing operand`，最可能的原因是什麼？',
      options: [
        '這台機器沒有安裝 mkdir',
        '目前的目錄沒有寫入權限',
        '少了要建立的目錄名稱',
        '用了 mkdir 不認得的選項',
      ],
      answer: 2,
      explanation: 'operand 是參數，missing operand 表示少了 mkdir 需要的目錄名稱。訊息以 `mkdir:` 開頭，代表指令已經執行，所以不是沒安裝（那會是 bash 的 command not found）；權限不足的訊息是 Permission denied；不認得的選項是 invalid option。',
    },
    {
      id: 'q-not-found', prompt: '輸入 `Ls -l` 得到 `bash: Ls: command not found`。這則訊息是誰印的？原因是什麼？',
      options: [
        '`ls` 印的，因為 `-l` 選項打錯了',
        '`bash` 印的，因為名稱區分大小寫，找不到名為 `Ls` 的指令',
        '`bash` 印的，因為目前的目錄沒有任何檔案',
        '終端機印的，因為鍵盤的大寫鎖定沒有關',
      ],
      answer: 1,
      explanation: '訊息以 `bash:` 開頭，是 Shell 找不到名為 `Ls` 的指令，因為指令名稱區分大小寫，`Ls` 不是 `ls`。`ls` 根本沒有執行，所以不是它對選項的抱怨；空目錄不會造成 command not found；終端機不檢查指令，它只顯示 Shell 的訊息。',
    },
    {
      id: 'q-spaces', prompt: '在一個空目錄執行 `mkdir weekly report` 之後，會多出幾個目錄？',
      options: [
        '兩個：`weekly` 與 `report`',
        '一個：名稱是 `weekly report`',
        '零個：mkdir 一次只接受一個參數，會印出錯誤',
        '一個：`weekly`，`report` 被當成選項',
      ],
      answer: 0,
      explanation: 'Shell 在空白處切開，mkdir 收到 `weekly` 與 `report` 兩個參數，各建立一個目錄。要建立含空白的名稱必須加引號，例如 `mkdir "weekly report"`；mkdir 的用法 `mkdir [-p] 目錄…` 允許好幾個參數；`report` 不以 `-` 開頭，不是選項。',
    },
    {
      id: 'q-synopsis', prompt: '`man ls` 的 SYNOPSIS 寫著 `ls [-l] [-a] [-h] [-d] [路徑]…`。這代表什麼？',
      options: [
        '四個選項都必須寫，只有路徑可以省略',
        '選項與路徑都必須依照這個順序全部寫出',
        '`…` 表示 ls 會在輸出的最後印出省略號',
        '方括號裡的都可以省略，`…` 表示路徑可以給好幾個',
      ],
      answer: 3,
      explanation: 'SYNOPSIS 的方括號表示可以省略，`…` 表示前一項可以重複，所以 `ls` 單獨執行也可以，也能一次列出好幾個路徑。方括號正好表示選項不是必須的；它也不要求全部寫出或固定順序；`…` 是用法的記號，和輸出無關。',
    },
    {
      id: 'q-redirect', prompt: '`log.txt` 原本有三行。執行 `echo done > log.txt` 之後，`log.txt` 的內容是什麼？',
      options: [
        '原本的三行，再加上一行 `done`',
        '原本的三行不變，`done` 只印在畫面上',
        '只剩一行 `done`',
        '原本的三行，再加上一行 `done > log.txt`',
      ],
      answer: 2,
      explanation: '`>` 由 Shell 處理：先清空 `log.txt`，再把 echo 的輸出 `done` 寫進去，所以只剩一行。接在最後的是 `>>`；有了 `>`，輸出就寫進檔案而不印在畫面上；`>` 與檔名沒有加引號，不會成為 echo 要印的文字。',
    },
  ],
  terminal: {
    machines: [
      { id: 'lab', title: '開發機 lab-02（以 mei 登入）', user: 'mei', host: 'lab-02', cwd: '/home/mei', profile: 'files', files: FILES },
      { id: 'lab-root', title: '開發機 lab-02（以 root 登入）', user: 'root', host: 'lab-02', cwd: '/root', profile: 'files', files: FILES },
    ],
    examples: [
      {
        id: 'lnx02-prompt', title: '提示字元跟著你移動', machine: 'lab',
        description: '用 `whoami`、`hostname`、`pwd` 確認提示字元上的資訊，`cd` 之後看提示字元裡的位置怎麼變；mei 讀不到 root 的家目錄。',
        steps: [
          { command: 'whoami', output: 'mei' },
          { command: 'hostname', output: 'lab-02' },
          { command: 'pwd', output: '/home/mei' },
          { command: 'cd projects/site', output: '' },
          { command: 'pwd', output: '/home/mei/projects/site' },
          { command: 'cd', output: '' },
          { command: 'ls /root', output: "ls: cannot open directory '/root': Permission denied" },
        ],
      },
      {
        id: 'lnx02-root', title: 'root 的提示字元以 # 結尾', machine: 'lab-root',
        description: '同一台機器以 root 登入：提示字元結尾是 `#`，家目錄是 `/root`，而且讀得到 mei 讀不到的檔案。',
        steps: [
          { command: 'whoami', output: 'root' },
          { command: 'pwd', output: '/root' },
          { command: 'ls', output: 'install.log' },
          { command: 'cd /etc', output: '' },
          { command: 'cat hostname', output: 'lab-02' },
        ],
      },
      {
        id: 'lnx02-args', title: '選項、參數與引號', machine: 'lab',
        description: '同一個 `ls` 加上不同的選項；`-l -a` 與 `-la` 結果相同。沒有引號時空白把參數切開，有引號時整段是一個參數。',
        steps: [
          { command: 'ls projects/site', output: 'index.html  style.css' },
          { command: 'ls -a projects/site', output: '.  ..  .gitignore  index.html  style.css' },
          { command: 'ls -l -a projects/site', output: 'drwxr-xr-x mei     mei      4096 .\ndrwxr-xr-x mei     mei      4096 ..\n-rw-r--r-- mei     mei        14 .gitignore\n-rw-r--r-- mei     mei        16 index.html\n-rw-r--r-- mei     mei        20 style.css' },
          { command: 'ls -la projects/site', output: 'drwxr-xr-x mei     mei      4096 .\ndrwxr-xr-x mei     mei      4096 ..\n-rw-r--r-- mei     mei        14 .gitignore\n-rw-r--r-- mei     mei        16 index.html\n-rw-r--r-- mei     mei        20 style.css' },
          { command: 'mkdir my notes', output: '' },
          { command: 'ls', output: 'docs/  my/  notes/  notes.txt  projects/' },
          { command: 'mkdir "my report"', output: '' },
          { command: 'ls', output: 'docs/  my/  my report/  notes/  notes.txt  projects/' },
        ],
      },
      {
        id: 'lnx02-help', title: '查出指令的用法', machine: 'lab',
        description: '`ls --help` 印出簡短的選項清單，`man mkdir` 印出分段的說明頁；沒有說明頁的名稱會得到 No manual entry。',
        steps: [
          { command: 'ls --help', output: '用法：ls [-l] [-a] [-h] [-d] [路徑]…\n列出目錄的內容。\n沒有指定路徑時列出目前的目錄；目錄名稱後面加上 /，符號連結加上 @。\n-l 的欄位：權限、擁有者、群組、大小（位元組）、名稱；連結顯示成「名稱 -> 目標」。\n\n  -l    詳細資料\n  -a    也列出以 . 開頭的隱藏項目，以及 . 與 ..\n  -h    和 -l 一起使用：大小以 K、M、G 表示\n  -d    列出目錄本身，而不是目錄的內容' },
          { command: 'man mkdir', output: 'MKDIR(1)        User Commands        MKDIR(1)\n\nNAME\n       mkdir - 建立目錄\n\nSYNOPSIS\n       mkdir [-p] 目錄…\n\nDESCRIPTION\n       新目錄的權限是 rwxr-xr-x（755）。\n\nOPTIONS\n       -p     一併建立中間的目錄；目錄已經存在時不算錯誤' },
          { command: 'man vim', output: 'No manual entry for vim' },
        ],
      },
      {
        id: 'lnx02-errors', title: '六種常見的錯誤訊息', machine: 'lab',
        description: '打錯大小寫、少了參數、不認得的選項、打錯檔名、把檔案當目錄、少了目的地：看每則訊息開頭是誰、最後的原因是什麼。',
        steps: [
          { command: 'LS', output: `bash: LS: command not found${NOT_FOUND_TAIL}` },
          { command: 'mkdir', output: "mkdir: missing operand\nTry 'mkdir --help' for more information." },
          { command: 'ls -z', output: "ls: invalid option -- 'z'\nTry 'ls --help' for more information." },
          { command: 'cat note.txt', output: 'cat: note.txt: No such file or directory' },
          { command: 'cd notes.txt', output: 'bash: cd: notes.txt: Not a directory' },
          { command: 'cp notes.txt', output: "cp: missing destination file operand after 'notes.txt'\nTry 'cp --help' for more information." },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx02-parents', title: '查出 mkdir 的選項', machine: 'lab',
        statement: '在 `projects` 底下建立 `blog/drafts/2026` 三層目錄（`projects/blog` 目前還不存在）。先用 `mkdir --help` 或 `man mkdir` 找出讓 mkdir 一併建立中間目錄的選項，再用一個指令完成。',
        checks: [
          { kind: 'exists', path: '/home/mei/projects/blog/drafts/2026', type: 'dir' },
          { kind: 'unchanged', path: '/home/mei/projects/site' },
        ],
        solution: ['mkdir -p projects/blog/drafts/2026'],
        mistakes: [
          { commands: ['mkdir projects/blog/drafts/2026'], why: '沒有加選項時，mkdir 只建立最後一層，中間的 `projects/blog` 不存在，所以印出 No such file or directory。' },
          { commands: ['mkdir -r projects/blog/drafts/2026'], why: '猜了一個選項：mkdir 沒有 `-r`，印出 invalid option，什麼都沒建立。應該先查 `mkdir --help`。' },
          { commands: ['mkdir projects/blog drafts 2026'], why: '用空白隔開了路徑：mkdir 收到三個參數，在家目錄另外建立了 `drafts` 與 `2026`，而不是一層包一層。' },
        ],
        hints: [
          '執行 `mkdir --help`，在選項清單裡找提到「中間的目錄」的那一個。',
          '路徑的每一層用 `/` 隔開，整段是一個參數，中間不能有空白。',
        ],
        explanation: '`mkdir --help` 列出 `-p`：一併建立中間的目錄，而且目錄已存在時不算錯誤。所以 `mkdir -p projects/blog/drafts/2026` 一次建立 `blog`、`drafts` 與 `2026`。在真實的 GNU mkdir 上，它的長選項寫法是 `--parents`。完成後可以用 `ls projects/blog/drafts` 確認。',
      },
      {
        id: 'lnx02-hidden', title: '找出隱藏的設定檔', machine: 'lab',
        statement: '`projects/site` 裡有名稱以 `.` 開頭的設定檔，平常的 `ls` 看不到。用 `ls --help` 找出列出隱藏項目的選項，以短格式（不加 `-l`）列出 `projects/site` 裡的所有項目。',
        checks: [{ kind: 'output' }],
        solution: ['ls -a projects/site'],
        variants: [
          { label: '多了一個 .env 設定檔的網站', files: [{ path: '/home/mei/projects/site/.env', kind: 'file', mode: 0o600, owner: 'mei', content: 'PORT=8080\n' }] },
        ],
        mistakes: [
          { commands: ['ls projects/site'], why: '沒有加選項，以 `.` 開頭的 `.gitignore` 不會出現。' },
          { commands: ['ls -a'], why: '選項對了，但少了參數，列出的是目前的目錄（家目錄），不是 `projects/site`。' },
          { commands: ['ls -la projects/site'], why: '題目要短格式；`-l` 會改成每行一個項目的詳細格式。' },
        ],
        hints: [
          '`ls --help` 的選項清單裡，哪一個提到「以 . 開頭的隱藏項目」？',
          '指令的結構是 `ls 選項 路徑`。',
        ],
        explanation: '`-a`（all）讓 ls 也列出以 `.` 開頭的項目，連同代表目錄本身的 `.` 與上一層的 `..`。`ls -a projects/site` 或先 `cd projects/site` 再 `ls -a` 都會印出相同的結果；換成多了 `.env` 的網站時，輸出也跟著多一個名稱，所以直接打出答案是行不通的。',
      },
      {
        id: 'lnx02-fix-typo', title: '修正打錯的指令', machine: 'lab',
        statement: '同事想把 `docs/draft.txt` 改名為 `docs/final.txt`，先後輸入了 `mv docs/draft.txt` 與 `vm docs/draft.txt docs/final.txt`，兩次都失敗了。讀懂這兩則錯誤訊息（可以自己執行一次看看），再輸入正確的指令完成改名。',
        checks: [
          { kind: 'absent', path: '/home/mei/docs/draft.txt' },
          { kind: 'content', path: '/home/mei/docs/final.txt', content: '週報第一版\n' },
        ],
        solution: ['mv docs/draft.txt docs/final.txt'],
        mistakes: [
          { commands: ['mv docs/draft.txt'], why: '`mv: missing destination file operand`：只給了來源，少了新的名稱。' },
          { commands: ['vm docs/draft.txt docs/final.txt'], why: '`bash: vm: command not found`：參數都對，但指令名稱的字母順序打反了，Shell 找不到 `vm`。' },
          { commands: ['cp docs/draft.txt docs/final.txt'], why: '`cp` 是複製，`draft.txt` 仍然留著；改名要用 `mv`。' },
          { commands: ['mv docs/draft.txt final.txt'], why: '目的地少了 `docs/`，檔案被搬到家目錄並改名，而不是留在 `docs` 裡。' },
        ],
        hints: [
          '第一則訊息以 `mv:` 開頭，表示 mv 有執行，是在抱怨少了什麼？',
          '第二則訊息以 `bash:` 開頭，表示指令名稱本身有問題。可以按 ↑ 叫回指令再修改。',
        ],
        explanation: '`mv: missing destination file operand after \'docs/draft.txt\'` 說 mv 少了目的地；`bash: vm: command not found` 說 Shell 不認得 `vm` 這個名稱。把兩者合起來修正：指令名稱是 `mv`，來源 `docs/draft.txt`，目的地 `docs/final.txt`。目的地和來源在同一個目錄、只是名稱不同，mv 就是改名。',
      },
      {
        id: 'lnx02-redirect', title: '把文字寫進檔案', machine: 'lab',
        statement: '用 `echo` 與 `>` 在家目錄建立 `todo.txt`，第一行是 `備份 projects`；再用 `>>` 加上第二行 `更新 notes.txt`。完成後用 `cat todo.txt` 確認。',
        checks: [
          { kind: 'content', path: '/home/mei/todo.txt', content: '備份 projects\n更新 notes.txt\n' },
          { kind: 'unchanged', path: '/home/mei/notes.txt' },
        ],
        solution: ['echo 備份 projects > todo.txt', 'echo 更新 notes.txt >> todo.txt'],
        mistakes: [
          { commands: ['echo 備份 projects', 'echo 更新 notes.txt'], why: '沒有重新導向，文字只印在畫面上，沒有建立檔案。' },
          { commands: ['echo 備份 projects > todo.txt', 'echo 更新 notes.txt > todo.txt'], why: '第二次也用了 `>`，先清空了檔案，只剩第二行。' },
          { commands: ['echo "備份 projects > todo.txt"', 'echo "更新 notes.txt >> todo.txt"'], why: '`>` 寫在引號裡只是普通文字，echo 把整段印在畫面上，沒有寫入檔案。' },
        ],
        hints: [
          '`>` 與檔名寫在要印的文字後面，而且不要放進引號裡。',
          '第二行要接在後面，用 `>>`；用 `>` 會先清空檔案。',
        ],
        explanation: '`echo 備份 projects > todo.txt` 由 Shell 建立 `todo.txt` 並把 echo 的輸出寫進去；`echo 更新 notes.txt >> todo.txt` 把第二行接在後面。echo 用一個空白連接它收到的參數，每次寫入的最後都有換行，所以檔案剛好是兩行。',
      },
    ],
  },
};
