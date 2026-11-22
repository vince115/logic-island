import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX04 Working with Files and Directories (LNX-1). A terminal lesson on the files profile (engine stage E1): mkdir -p
 * and touch, cp and mv (rename versus move, several sources into a folder, silent overwrites), rm (-r, -f, no undo),
 * globs (* ? [...]) and hidden files, symbolic links with ln -s and readlink (hard links in the text only: the engine
 * does not support them). One workstation for the transcripts and one small machine per exercise; host names, users and
 * files are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';

/** The transcripts' workstation: a home with notes, photos, rotated logs, hidden settings, and a shared handbook in /srv. */
const workstation: TerminalMachine = {
  id: 'ws', title: '工作站 ws-14', user: 'learner', host: 'ws-14', cwd: HOME, profile: 'files',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    file(`${HOME}/.bashrc`, 'export EDITOR=nano\n'),
    dir(`${HOME}/.cache`, 'learner', 0o700),
    file(`${HOME}/notes.txt`, '週五前交報告\n'),
    file(`${HOME}/todo.txt`, '續約網域\n'),
    dir(`${HOME}/photos`),
    file(`${HOME}/photos/cover.jpg`, 'JPEG cover\n'),
    file(`${HOME}/photos/img-1.jpg`, 'JPEG 1\n'),
    file(`${HOME}/photos/img-10.jpg`, 'JPEG 10\n'),
    file(`${HOME}/photos/img-2.jpg`, 'JPEG 2\n'),
    file(`${HOME}/photos/img-2.png`, 'PNG 2\n'),
    dir(`${HOME}/logs`),
    file(`${HOME}/logs/app.log`, 'server started\n'),
    file(`${HOME}/logs/app.log.1`, 'server stopped\n'),
    file(`${HOME}/logs/app.log.2`, 'disk almost full\n'),
    dir('/srv', 'root'),
    dir('/srv/shared', 'root'),
    dir('/srv/shared/handbook', 'root'),
    file('/srv/shared/handbook/rules.txt', '刪除之前先備份\n', 'root'),
  ],
};

/** Exercise 1: a messy downloads folder (two photos, two invoices, a manual, a readme and a hidden state file). */
const laptop: TerminalMachine = {
  id: 'dl', title: '筆電 laptop-08', user: 'learner', host: 'laptop-08', cwd: HOME, profile: 'files',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    dir(`${HOME}/downloads`),
    file(`${HOME}/downloads/.download-state`, 'last=manual.pdf\n'),
    file(`${HOME}/downloads/beach-01.jpg`, 'JPEG beach 01\n'),
    file(`${HOME}/downloads/beach-02.jpg`, 'JPEG beach 02\n'),
    file(`${HOME}/downloads/invoice-2026-10.pdf`, 'PDF invoice October\n'),
    file(`${HOME}/downloads/invoice-2026-11.pdf`, 'PDF invoice November\n'),
    file(`${HOME}/downloads/manual.pdf`, 'PDF router manual\n'),
    file(`${HOME}/downloads/readme.txt`, '下載的檔案先放這裡\n'),
  ],
};

/** Exercise 2: daily backup reports and a latest link that still points to yesterday's. */
const opsMachine: TerminalMachine = {
  id: 'ops', title: '維運主機 ops-02', user: 'learner', host: 'ops-02', cwd: HOME, profile: 'files',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    dir(`${HOME}/reports`),
    file(`${HOME}/reports/2026-11-20.txt`, '2026-11-20 備份成功\n'),
    file(`${HOME}/reports/2026-11-21.txt`, '2026-11-21 備份成功\n'),
    file(`${HOME}/reports/2026-11-22.txt`, '2026-11-22 備份失敗：磁碟已滿\n'),
    { path: `${HOME}/latest`, kind: 'link', mode: 0o777, owner: 'learner', target: 'reports/2026-11-21.txt' },
  ],
};

/** Exercise 3: a web site folder with a build output, temporary files (one hidden) and files that look similar but stay. */
const webMachine: TerminalMachine = {
  id: 'site', title: '網站主機 web-05', user: 'learner', host: 'web-05', cwd: HOME, profile: 'files',
  files: [
    dir('/home', 'root'),
    dir(HOME),
    dir(`${HOME}/site`),
    file(`${HOME}/site/.gitignore`, 'build/\n*.tmp\n'),
    file(`${HOME}/site/.session.tmp`, 'session=42\n'),
    dir(`${HOME}/site/build`),
    file(`${HOME}/site/build/app.js`, 'console.log("hi");\n'),
    file(`${HOME}/site/build/index.html`, '<h1>Hi</h1>\n'),
    file(`${HOME}/site/draft.tmp`, '草稿\n'),
    file(`${HOME}/site/index.html`, '<h1>Hi</h1>\n'),
    file(`${HOME}/site/style.css`, 'h1 { color: teal; }\n'),
    file(`${HOME}/site/tmp-notes.txt`, '下次改版要做的事\n'),
    file(`${HOME}/site/upload.tmp`, 'partial upload\n'),
  ],
};

export const LNX04: LessonContent = {
  lessonId: 'LNX04',
  motivation: '整理檔案是在 Linux 上最常做的事：下載資料夾越堆越亂、新專案需要一組目錄、舊的日誌要清掉。圖形介面裡用滑鼠拖拉就好，伺服器上卻只有終端機。一行指令可以一次處理上百個檔案，也可以一次刪錯上百個檔案，而且沒有資源回收筒可以撿回來。本課學會每天都會用到的 mkdir、touch、cp、mv、rm，用萬用字元一次挑出一批檔案，弄清楚隱藏檔為什麼常被漏掉、符號連結和硬連結差在哪裡，最後把「先列出、再刪除」練成習慣。',
  sections: [
    {
      id: 'lnx04-s-create', title: '建立目錄與檔案：mkdir 與 touch',
      blocks: [
        { type: 'p', text: '`mkdir`（make directory）建立目錄，一次可以給好幾個名稱：`mkdir docs tests` 建立兩個目錄。它只建立路徑的最後一段，前面的每一層都必須已經存在；`mkdir project/src` 在 `project` 還不存在時會失敗，什麼都不建立。加上 `-p`（parents）就會沿著路徑把缺少的每一層都建好，而且目錄已經存在時也不算錯誤，所以 `mkdir -p` 可以放心地重複執行。' },
        { type: 'p', text: '`touch` 建立空檔案，同樣可以一次給好幾個。檔案已經存在時，`touch` 不會改動內容：在真實系統上它會把檔案的修改時間更新成現在，這也是它名字的由來（「碰一下」）。模擬環境的 `ls -l` 沒有時間欄，所以看不出這個變化。' },
        { type: 'table', head: ['指令', '作用', '目標已經存在時'], rows: [
          ['`mkdir logs`', '建立一個目錄（父目錄必須存在）', '錯誤：`File exists`'],
          ['`mkdir -p a/b/c`', '建立整條路徑上缺少的目錄', '不報錯，什麼都不改'],
          ['`touch a.txt b.txt`', '建立空檔案', '內容不變（真實系統更新修改時間）'],
        ] },
        { type: 'p', text: '下面在家目錄建立一個小專案：先看到沒有 `-p` 時的錯誤，再一次建好三層目錄，最後用 `touch` 放進兩個空檔案。`ls` 給兩個目錄時，會分別加上 `目錄:` 標題列出。' },
        { type: 'example', id: 'lnx04-create' },
        { type: 'callout', tone: 'tip', title: '檔名裡不要放空白', text: 'Shell 用空白分隔參數，所以 `touch my notes.txt` 會建立 `my` 與 `notes.txt` 兩個檔案。真的需要空白時要加引號：`touch "my notes.txt"`，之後每次用到它也都要加引號。習慣上用 `-` 或 `_` 連接單字（`my-notes.txt`），也避免中文標點與大小寫混用，打指令與寫腳本都比較不會出錯。' },
      ],
    },
    {
      id: 'lnx04-s-copy-move', title: '複製、改名與搬移：cp 與 mv',
      blocks: [
        { type: 'p', text: '`cp 來源 目的地` 複製檔案。目的地是已經存在的目錄時，複本放進那個目錄並保留原來的檔名；否則目的地就是複本的新檔名。複製目錄要加 `-r`（recursive，遞迴），把目錄和底下的一切都複製過去；沒有 `-r` 時 `cp` 會略過目錄並印出提醒。' },
        { type: 'p', text: '`mv` 用同一種寫法做兩件事：目的地是已經存在的目錄時，把來源搬進去；不是的話，就是把來源改成這個新名稱（也可以同時換到別的目錄）。在同一個檔案系統裡，`mv` 只修改目錄裡的名稱，不複製資料，所以搬一個很大的檔案也是一瞬間；`cp` 則真的讀出資料再寫一份新的。兩個指令都可以一次給好幾個來源，這時最後一個參數必須是目錄。' },
        { type: 'table', head: ['指令', '目的地 X 是現有目錄', 'X 不存在', 'X 是現有檔案'], rows: [
          ['`cp a.txt X`', '複製成 `X/a.txt`', '複製成新檔 `X`', '用 a.txt 的內容覆寫 X'],
          ['`mv a.txt X`', '搬成 `X/a.txt`', '把 a.txt 改名為 `X`', 'a.txt 改名為 X，原本的 X 消失'],
          ['`cp -r dir X`', '複製成 `X/dir`', '複製成新目錄 `X`', '錯誤：不能用目錄覆寫檔案'],
          ['`cp a b X`、`mv a b X`', '兩個都放進 X', '錯誤：`target \'X\' is not a directory`', '同樣的錯誤'],
        ] },
        { type: 'p', text: '下面的紀錄先備份一個檔案、複製整個 `photos` 目錄，再把兩個檔案一次搬進新的 `archive` 目錄，接著在目錄裡改名。最後兩步示範一件容易忽略的事：目的地已經有同名檔案時，`cp` 不會先問你。' },
        { type: 'example', id: 'lnx04-copy-move' },
        { type: 'callout', tone: 'warning', title: '「mv 到 backup」不一定是搬進目錄', text: '常見的誤會是以為 `mv a.txt backup` 一定會把 a.txt 放進 backup 目錄。如果 backup 還不存在，a.txt 只是被改名成一個叫 backup 的檔案；接著再 `mv b.txt backup`，b.txt 會覆寫掉這個檔案，a.txt 的內容就不見了，整個過程沒有任何錯誤訊息。所以要先 `mkdir backup`，或用 `ls -d backup` 確認它是目錄。`cp` 與 `mv` 覆寫現有檔案時都不會詢問；真實的 GNU 版本有 `-i`（覆寫前詢問）與 `-n`（不覆寫）可用，模擬環境沒有互動輸入，不提供這兩個選項。' },
      ],
    },
    {
      id: 'lnx04-s-globs', title: '萬用字元：一次挑出一批檔案',
      blocks: [
        { type: 'p', text: '萬用字元（glob）是由 Shell 處理的：執行指令之前，Shell 先把 `*.jpg` 這樣的樣式換成目前所有符合的檔名，排好順序，再當成一串參數交給指令。所以 `ls`、`cp`、`mv`、`rm`，甚至 `echo` 收到的都只是普通的檔名，指令本身不知道你用了萬用字元。這也表示同一個樣式交給 `ls` 和交給 `rm`，得到的清單完全相同。' },
        { type: 'table', head: ['樣式', '符合', '在 photos 裡的例子'], rows: [
          ['`*`', '任意多個字元（包括零個）', '`*.jpg` → cover.jpg、img-1.jpg、img-10.jpg、img-2.jpg'],
          ['`?`', '剛好一個字元', '`img-?.jpg` → img-1.jpg、img-2.jpg'],
          ['`[12]`、`[0-9]`', '方括號裡列出的其中一個字元，`-` 表示範圍', '`img-[12].*` → img-1.jpg、img-2.jpg、img-2.png'],
          ['`[!i]`', '不是方括號裡的任何一個字元（也可以寫 `[^i]`）', '`[!i]*` → cover.jpg'],
        ] },
        { type: 'p', text: '展開的結果依字元碼排序，不是依數字大小：`img-10.jpg` 排在 `img-2.jpg` 前面，因為逐字比較到 `1` 與 `2` 時就分出先後；`img-1.jpg` 又排在 `img-10.jpg` 前面，因為 `.` 的字元碼比 `0` 小。需要數字順序時，檔名請補零（img-01、img-02、img-10）。' },
        { type: 'p', text: '沒有任何檔名符合時，bash 預設把樣式原封不動地交給指令，所以 `ls photos/*.gif` 的錯誤訊息裡還看得到星號。想比對字面上的 `*` 或 `?`，就把它放進引號：`"*.jpg"` 不會展開。下面的紀錄也用 `echo *` 直接看 Shell 把星號換成了什麼，以及 `ls -a` 和 `.*` 才看得到的隱藏檔（下一節說明）。' },
        { type: 'example', id: 'lnx04-globs' },
      ],
    },
    {
      id: 'lnx04-s-hidden', title: '隱藏檔：為什麼 * 看不到它們',
      blocks: [
        { type: 'p', text: '名稱以 `.` 開頭的檔案或目錄就是隱藏檔，這只是一個慣例，不是權限，也沒有任何保護作用。設定檔大多這樣命名，例如 `.bashrc`、`.profile`、`.ssh`、`.config`，免得每次 `ls` 都被一大堆設定淹沒。`ls` 預設不列出它們，加上 `-a`（all）才會出現，連同代表目前目錄的 `.` 與上一層的 `..`。' },
        { type: 'p', text: '萬用字元也遵守同一個慣例：`*`、`?` 與方括號都不會符合名稱開頭的 `.`，所以 `echo *` 看不到 `.bashrc`，`rm *.tmp` 也不會刪掉 `.session.tmp`。要選到隱藏檔，樣式的那一段本身就要以 `.` 開頭，例如 `.*` 或 `.*.tmp`。bash 5.2 起 `.*` 不會符合 `.` 與 `..`（`globskipdots` 選項，預設開啟）；較舊的 bash 會符合，這是 `rm -r .*` 在舊系統上特別危險的原因之一。GNU `rm` 會拒絕刪除 `.` 與 `..`，但不要把安全寄託在這上面。' },
        { type: 'table', head: ['樣式', '會選到 .bashrc 嗎', '說明'], rows: [
          ['`*`', '不會', '`*` 不符合開頭的 `.`'],
          ['`.*`', '會', '所有隱藏檔；bash 5.2 起不含 `.` 與 `..`'],
          ['`*rc`', '不會', '開頭的 `.` 仍然要明確寫出'],
          ['`.b*`', '會', '以 `.b` 開頭的隱藏檔'],
        ] },
        { type: 'callout', tone: 'warning', title: '隱藏不等於受保護，也不等於清乾淨了', text: '以 `.` 開頭只是讓 `ls` 和 `*` 略過它，任何有權限的人一樣能讀寫。反過來，`rm *` 之後用 `ls` 看起來目錄已經空了，其實 `.env`、`.session.tmp` 之類的隱藏檔還在；要確認一個目錄真的空了，請用 `ls -a`。想一併刪除隱藏檔時，寫出具體的樣式（例如 `.*.tmp`），不要用 `.*` 一網打盡，否則 `.gitignore` 這種需要保留的設定也會一起不見。' },
      ],
    },
    {
      id: 'lnx04-s-remove', title: '刪除：rm 沒有資源回收筒',
      blocks: [
        { type: 'p', text: '`rm` 刪除檔案（和符號連結）；刪除目錄要加 `-r`，它會連同目錄底下的一切一起刪除；`-f`（force）讓 `rm` 遇到不存在的檔案時不印任何訊息，真實系統上也不會再詢問唯讀的檔案。兩者常合寫成 `rm -rf`。' },
        { type: 'p', text: '圖形介面的「刪除」通常只是搬到資源回收筒，`rm` 不是。它把名稱從目錄中移除，當檔案已經沒有任何名稱、也沒有程式開著它時，資料所占的空間就交還給檔案系統，隨時可能被新資料覆蓋。Linux 沒有「取消刪除」的指令，能救回資料的只有事先做好的備份。' },
        { type: 'table', head: ['指令', '刪除什麼', '目標不存在', '目標是目錄'], rows: [
          ['`rm f`', '檔案或符號連結', '錯誤：`No such file or directory`', '錯誤：`Is a directory`'],
          ['`rm -r d`', '目錄與底下全部', '錯誤', '刪除'],
          ['`rm -f f`', '檔案或符號連結', '什麼都不印', '錯誤：`Is a directory`'],
          ['`rm -rf d`', '一切', '什麼都不印', '刪除，不給任何警告'],
        ] },
        { type: 'p', text: '下面的紀錄先用 `ls` 確認萬用字元會選到哪些舊日誌，再把同一個樣式交給 `rm`；接著看 `rm` 遇到目錄、不存在的檔案時的反應，以及 `-f` 如何把錯誤藏起來。' },
        { type: 'example', id: 'lnx04-remove' },
        { type: 'callout', tone: 'warning', title: '多一個空白，意思就完全不同', text: '想刪除所有暫存檔而打成 `rm -r * .tmp`（星號後面多了一個空白）：Shell 把 `*` 展開成目錄裡每一個非隱藏的檔案與目錄，`rm -r` 就把它們全部刪掉，最後再抱怨找不到 `.tmp`。指令沒有問題，是你給它的清單錯了，而 `rm` 不會替你確認。這類錯誤的共同點是：執行之前沒有看過萬用字元到底展開成什麼。' },
        { type: 'p', text: '安全刪除的習慣：' },
        { type: 'list', ordered: true, items: [
          '先用 `pwd` 確認自己在哪裡：相對路徑和 `*` 永遠從目前位置算起，在錯的目錄執行正確的指令一樣會刪錯。',
          '先用 `ls`（或 `echo`）跑一次同樣的樣式，確認清單正是要刪的檔案，再把 `ls` 換成 `rm`，其餘一個字都不改。',
          '樣式越具體越好：`*.tmp` 比 `*tmp*` 安全，後者連 `tmp-notes.txt` 也會選到。',
          '重要的資料先備份，或先 `mv` 到一個暫存目錄，確認沒有問題再刪除那個目錄。',
          '少用 `-f`：它讓打錯的路徑也不報錯，你就不知道哪裡和預期不同。真實系統的 `rm -i` 會逐一詢問，模擬環境沒有互動輸入，所以不支援。',
        ] },
      ],
    },
    {
      id: 'lnx04-s-links', title: '連結：符號連結與硬連結',
      blocks: [
        { type: 'p', text: '符號連結（symbolic link，常簡稱 symlink）是一個特殊的小檔案，內容是另一個路徑。開啟連結時，系統沿著這個路徑走到目標，所以 `cat`、`cd` 等指令用起來就像直接用目標一樣。建立的寫法是 `ln -s 目標 連結名稱`，順序和 `cp` 一樣：先寫已經存在的東西，再寫新名稱。`ls -l` 的連結列以 `l` 開頭，顯示成 `名稱 -> 目標`；模擬環境的短格式在連結名稱後面加 `@`。`readlink 連結` 印出連結存的目標文字，`readlink -f` 則跟隨到底，印出最後的完整路徑。' },
        { type: 'p', text: '相對的目標是從連結所在的目錄算起，不是從你執行 `ln` 的位置。在家目錄執行 `ln -s reports/today.txt latest`，連結存的是 `reports/today.txt`，從家目錄出發找得到；整個目錄一起搬家時，相對連結仍然有效。絕對路徑的目標（例如 `/srv/shared/handbook`）則不管連結放在哪裡都指向同一個地方。' },
        { type: 'p', text: '目標被改名或刪除之後，連結本身還在，只是指向一個不存在的路徑，稱為懸空連結（dangling link），讀它會得到 `No such file or directory`。`rm 連結` 只刪除連結，不會碰到它指向的東西。名稱已經存在時 `ln -s` 會失敗（`File exists`），加上 `-f` 先刪除舊的再建立：`ln -sf` 常用來把 `latest`、`current` 這類「指向最新版本」的連結換到新的目標。' },
        { type: 'example', id: 'lnx04-links' },
        { type: 'p', text: '硬連結（`ln` 不加 `-s`）是另一回事。Linux 的檔案系統把一個檔案的資料與屬性（擁有者、權限、大小）存在 inode 裡，目錄裡的每一項只是「名稱 → inode 編號」的對應。硬連結就是再加一個指向同一個 inode 的名稱：兩個名稱地位完全相同，沒有誰是本尊。模擬的檔案系統以路徑記錄每個檔案，沒有 inode，因此不支援硬連結，在模擬環境執行不加 `-s` 的 `ln` 會印出說明。下表以概念比較兩種連結：' },
        { type: 'table', head: ['項目', '符號連結（ln -s）', '硬連結（ln）'], rows: [
          ['存的是什麼', '目標的路徑文字', '同一個 inode 的另一個名稱'],
          ['目標被刪除或改名', '變成懸空連結，讀不到資料', '另一個名稱照樣讀得到，直到最後一個名稱被刪除，資料才釋放'],
          ['跨檔案系統', '可以', '不行：inode 編號只在同一個檔案系統內有意義'],
          ['指向目錄', '可以', '一般不允許，以免目錄樹出現迴圈'],
          ['在 ls -l 中', '以 `l` 開頭，顯示 `名稱 -> 目標`', '看起來就是一般檔案；真實系統的連結數欄大於 1'],
        ] },
        { type: 'callout', tone: 'note', title: '在真實系統上觀察硬連結', text: '真實系統的 `ls -l` 在權限後面有一欄連結數，`ls -i` 會在名稱前印出 inode 編號：兩個硬連結的 inode 編號相同、連結數是 2，刪除其中一個名稱後連結數變回 1。模擬環境的 `ls -l` 省略連結數與時間欄，也沒有 `-i` 選項。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx04-q1', prompt: '目前目錄裡沒有 `site`。執行 `mkdir -p site/css/fonts` 之後會怎樣？',
      options: ['錯誤：`site` 不存在，所以什麼都沒有建立', '只在目前的目錄建立 `fonts`', '依序建立 `site`、`site/css` 與 `site/css/fonts` 三個目錄', '建立一個名稱就叫 `site/css/fonts` 的目錄'],
      answer: 2,
      explanation: '`-p` 會沿著路徑建立每一層缺少的目錄，所以三層都建好，已存在的層也不算錯誤。只有不加 `-p` 才會因為父目錄不存在而失敗；`mkdir` 建立的是路徑指定的位置，不會把最後一段搬到目前目錄；Linux 的檔名不能含有 `/`，斜線一定是目錄之間的分隔，不可能是單一名稱的一部分。',
    },
    {
      id: 'lnx04-q2', prompt: '目錄裡有 `.env`、`app.py`、`app.pyc`、`apple.txt`、`map.py`。`ls app*` 會列出哪些？',
      options: ['`app.py`、`app.pyc`、`apple.txt`', '`app.py`、`app.pyc`', '`.env`、`app.py`、`app.pyc`、`apple.txt`', '`app.py`、`app.pyc`、`apple.txt`、`map.py`'],
      answer: 0,
      explanation: '`app*` 符合所有以 app 開頭的名稱，`*` 可以是零個或任意多個字元，所以 `apple.txt` 也符合。只列 `app.py` 與 `app.pyc` 是把 `*` 誤當成只代表副檔名；`.env` 不以 app 開頭，而且隱藏檔不會被不以 `.` 開頭的樣式選到；`map.py` 的開頭是 m，雖然名稱裡有 ap，`app*` 要求名稱從 app 開始。',
    },
    {
      id: 'lnx04-q3', prompt: '目前目錄有 `report.txt`，沒有 `backup`。執行 `mv report.txt backup` 的結果是什麼？',
      options: ['錯誤：`backup` 不存在', '自動建立 `backup` 目錄並把 `report.txt` 搬進去', '複製出一個叫 `backup` 的檔案，`report.txt` 保留', '`report.txt` 被改名為 `backup`'],
      answer: 3,
      explanation: '`mv` 的目的地不是現有的目錄時，它就是來源的新名稱，所以這是一次改名，而且不會有任何訊息。`mv` 不會因為目的地不存在而報錯，也不會自動建立目錄；`mv` 不保留來源，留下原檔的是 `cp`。要搬進目錄，必須先 `mkdir backup`。',
    },
    {
      id: 'lnx04-q4', prompt: '要刪除目前目錄所有的 `.log` 檔，哪一個做法最能避免誤刪？',
      options: ['改用 `rm -f *.log`，避免錯誤訊息打斷', '先執行 `ls *.log` 確認清單，再把 `ls` 換成 `rm`', '直接 `rm -r *`，需要的檔案再從資源回收筒找回來', '用 `rm .*` 一起清掉隱藏的日誌'],
      answer: 1,
      explanation: 'Shell 對 `ls *.log` 和 `rm *.log` 展開出完全相同的清單，先看清楚再刪是成本最低的保險。`-f` 只是把錯誤藏起來，打錯也不會提醒你；`rm` 沒有資源回收筒，`rm -r *` 會刪掉目錄裡所有非隱藏的東西而且無法還原；`.*` 符合所有隱藏檔（例如 `.bashrc`），不只是日誌。',
    },
    {
      id: 'lnx04-q5', prompt: '`photos` 裡有 `img-1.jpg`、`img-2.jpg`、`img-10.jpg`、`img-2.png`。`ls photos/img-?.jpg` 會列出哪些？',
      options: ['`img-1.jpg`、`img-10.jpg`、`img-2.jpg`', '`img-1.jpg`、`img-2.jpg`、`img-2.png`', '`img-1.jpg`、`img-2.jpg`', '只有 `img-10.jpg`'],
      answer: 2,
      explanation: '`?` 剛好符合一個字元：`img-10.jpg` 在 `img-` 與 `.jpg` 之間有兩個字元，不符合；`img-2.png` 的結尾不是 `.jpg`。第一個選項是 `img-*.jpg` 的結果，第二個是 `img-?.*` 的結果，只有 `img-10.jpg` 則是 `img-??.jpg` 的結果。',
    },
    {
      id: 'lnx04-q6', prompt: '`latest` 是指向 `reports/today.txt` 的符號連結。執行 `rm latest` 之後會怎樣？',
      options: ['`latest` 與 `reports/today.txt` 都被刪除', '只刪除 `latest`，`reports/today.txt` 不受影響', '錯誤：刪除連結要加 `-r`', '`reports/today.txt` 被刪除，`latest` 變成懸空連結'],
      answer: 1,
      explanation: '`rm` 作用在連結本身，只把 `latest` 這個名稱移除，目標檔案完全不受影響。它不會連同目標一起刪除，更不會只刪目標而留下連結；連結不是目錄，所以不需要 `-r`。',
    },
    {
      id: 'lnx04-q7', prompt: '關於硬連結（`ln` 不加 `-s`），下列哪一句正確？',
      options: ['它存的是目標的路徑，目標被刪除後就讀不到資料', '它可以指向另一個檔案系統上的檔案', '它常用來替目錄建立第二個名稱', '刪除原本的名稱之後，另一個名稱仍然讀得到同樣的資料'],
      answer: 3,
      explanation: '硬連結和原本的名稱指向同一個 inode，資料要等最後一個名稱被刪除才釋放，所以另一個名稱照樣讀得到。存路徑、目標刪除就失效的是符號連結；inode 編號只在同一個檔案系統內有意義，硬連結不能跨檔案系統；一般系統不允許替目錄建立硬連結，以免目錄樹出現迴圈，替目錄建立別名要用符號連結。',
    },
    {
      id: 'lnx04-q8', prompt: '`notes` 是一個檔案，不是目錄。執行 `cp a.txt b.txt notes` 會怎樣？',
      options: ['印出 `cp: target \'notes\' is not a directory`，什麼都不複製', '把 `a.txt` 與 `b.txt` 的內容合併寫進 `notes`', '先用 `a.txt` 覆寫 `notes`，再用 `b.txt` 覆寫一次', '自動把 `notes` 換成目錄，再放進兩個檔案'],
      answer: 0,
      explanation: '有多個來源時，最後一個參數必須是現有的目錄，`cp` 在複製任何東西之前就檢查並報錯。`cp` 從不合併檔案內容；它也不會逐一覆寫，因為根本沒有開始複製；`cp` 不會把現有的檔案換成目錄，也不會自動建立目錄。',
    },
  ],
  terminal: {
    machines: [workstation, laptop, opsMachine, webMachine],
    examples: [
      {
        id: 'lnx04-create', title: '建立專案目錄', machine: 'ws',
        description: '`mkdir` 在父目錄不存在時失敗，`mkdir -p` 一次建好每一層；目錄已存在時，只有不加 `-p` 才報錯；`touch` 一次建立兩個空檔案。',
        steps: [
          { command: 'mkdir project/src', output: 'mkdir: cannot create directory \'project/src\': No such file or directory' },
          { command: 'mkdir -p project/src/utils', output: '' },
          { command: 'mkdir project', output: 'mkdir: cannot create directory \'project\': File exists' },
          { command: 'mkdir -p project', output: '' },
          { command: 'touch project/README.md project/src/main.py', output: '' },
          { command: 'ls project project/src', output: 'project:\nREADME.md  src/\n\nproject/src:\nmain.py  utils/' },
          { command: 'ls -l project/src', output: '-rw-r--r-- learner learner     0 main.py\ndrwxr-xr-x learner learner  4096 utils/' },
        ],
      },
      {
        id: 'lnx04-copy-move', title: '複製、搬移與改名', machine: 'ws',
        description: '`cp` 複製目錄要加 `-r`；`mv` 一次把兩個檔案搬進目錄，再在目錄裡改名；最後 `cp` 悄悄覆寫了同名檔案。',
        steps: [
          { command: 'cp notes.txt notes.bak', output: '' },
          { command: 'cp photos photos-backup', output: 'cp: -r not specified; omitting directory \'photos\'' },
          { command: 'cp -r photos photos-backup', output: '' },
          { command: 'ls photos-backup', output: 'cover.jpg  img-1.jpg  img-10.jpg  img-2.jpg  img-2.png' },
          { command: 'mkdir archive', output: '' },
          { command: 'mv notes.bak todo.txt archive', output: '' },
          { command: 'mv archive/notes.bak archive/notes-old.txt', output: '' },
          { command: 'ls archive', output: 'notes-old.txt  todo.txt' },
          { command: 'cat archive/todo.txt', output: '續約網域' },
          { command: 'cp notes.txt archive/todo.txt', output: '' },
          { command: 'cat archive/todo.txt', output: '週五前交報告' },
        ],
      },
      {
        id: 'lnx04-globs', title: '萬用字元與隱藏檔', machine: 'ws',
        description: '`*`、`?`、方括號依字元碼排序展開；沒有符合時樣式原樣保留；引號讓星號失去作用；`*` 不包含隱藏檔，`.*` 才會選到。',
        steps: [
          { command: 'ls photos', output: 'cover.jpg  img-1.jpg  img-10.jpg  img-2.jpg  img-2.png' },
          { command: 'ls photos/*.jpg', output: 'photos/cover.jpg  photos/img-1.jpg  photos/img-10.jpg  photos/img-2.jpg' },
          { command: 'ls photos/img-?.jpg', output: 'photos/img-1.jpg  photos/img-2.jpg' },
          { command: 'ls photos/img-[12].*', output: 'photos/img-1.jpg  photos/img-2.jpg  photos/img-2.png' },
          { command: 'ls photos/[!i]*', output: 'photos/cover.jpg' },
          { command: 'ls photos/*.gif', output: 'ls: cannot access \'photos/*.gif\': No such file or directory' },
          { command: 'ls "photos/*.jpg"', output: 'ls: cannot access \'photos/*.jpg\': No such file or directory' },
          { command: 'echo *', output: 'logs notes.txt photos todo.txt' },
          { command: 'ls -a', output: '.  ..  .bashrc  .cache/  logs/  notes.txt  photos/  todo.txt' },
          { command: 'echo .*', output: '.bashrc .cache' },
        ],
      },
      {
        id: 'lnx04-remove', title: '先列出，再刪除', machine: 'ws',
        description: '用 `ls` 確認樣式選到的舊日誌，再把同一個樣式交給 `rm`；`rm` 刪目錄要 `-r`；`-f` 讓不存在的檔案不再報錯。',
        steps: [
          { command: 'ls logs', output: 'app.log  app.log.1  app.log.2' },
          { command: 'ls logs/app.log.*', output: 'logs/app.log.1  logs/app.log.2' },
          { command: 'rm logs/app.log.*', output: '' },
          { command: 'ls logs', output: 'app.log' },
          { command: 'rm photos', output: 'rm: cannot remove \'photos\': Is a directory' },
          { command: 'rm -r photos', output: '' },
          { command: 'ls photos', output: 'ls: cannot access \'photos\': No such file or directory' },
          { command: 'rm old.txt', output: 'rm: cannot remove \'old.txt\': No such file or directory' },
          { command: 'rm -f old.txt', output: '' },
        ],
      },
      {
        id: 'lnx04-links', title: '符號連結與懸空連結', machine: 'ws',
        description: '用絕對路徑連到共用的手冊目錄，`readlink` 讀出目標；連到 `todo.txt` 的連結在檔案改名後懸空；`rm` 只刪除連結本身。',
        steps: [
          { command: 'ln -s /srv/shared/handbook handbook', output: '' },
          { command: 'ls -l handbook', output: 'lrwxrwxrwx learner learner    20 handbook -> /srv/shared/handbook' },
          { command: 'cat handbook/rules.txt', output: '刪除之前先備份' },
          { command: 'readlink handbook', output: '/srv/shared/handbook' },
          { command: 'ln -s todo.txt plan', output: '' },
          { command: 'cat plan', output: '續約網域' },
          { command: 'ln -s notes.txt plan', output: 'ln: failed to create symbolic link \'plan\': File exists' },
          { command: 'mv todo.txt done.txt', output: '' },
          { command: 'cat plan', output: 'cat: plan: No such file or directory' },
          { command: 'readlink plan', output: 'todo.txt' },
          { command: 'ls', output: 'done.txt  handbook@  logs/  notes.txt  photos/  plan@' },
          { command: 'rm handbook plan', output: '' },
          { command: 'ls /srv/shared/handbook', output: 'rules.txt' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx04-organise', title: '整理下載資料夾', machine: 'dl',
        statement: '`downloads` 裡堆了照片、帳單與其他檔案。請在 `downloads` 裡建立 `photos` 與 `invoices` 兩個目錄，把所有 `.jpg` 搬進 `photos`、所有以 `invoice-` 開頭的 PDF 搬進 `invoices`。`manual.pdf`、`readme.txt` 與隱藏檔 `.download-state` 要留在原處，內容不變。請用萬用字元，一次搬移一整批。',
        checks: [
          { kind: 'exists', path: `${HOME}/downloads/photos/beach-01.jpg`, type: 'file' },
          { kind: 'exists', path: `${HOME}/downloads/photos/beach-02.jpg`, type: 'file' },
          { kind: 'exists', path: `${HOME}/downloads/invoices/invoice-2026-10.pdf`, type: 'file' },
          { kind: 'exists', path: `${HOME}/downloads/invoices/invoice-2026-11.pdf`, type: 'file' },
          { kind: 'absent', path: `${HOME}/downloads/beach-01.jpg` },
          { kind: 'absent', path: `${HOME}/downloads/beach-02.jpg` },
          { kind: 'absent', path: `${HOME}/downloads/invoice-2026-10.pdf` },
          { kind: 'absent', path: `${HOME}/downloads/invoice-2026-11.pdf` },
          { kind: 'unchanged', path: `${HOME}/downloads/manual.pdf` },
          { kind: 'unchanged', path: `${HOME}/downloads/readme.txt` },
          { kind: 'unchanged', path: `${HOME}/downloads/.download-state` },
        ],
        solution: ['cd downloads', 'mkdir photos invoices', 'ls *.jpg invoice-*.pdf', 'mv *.jpg photos', 'mv invoice-*.pdf invoices'],
        mistakes: [
          { commands: ['cd downloads', 'mkdir photos invoices', 'mv *.jpg photos', 'mv *.pdf invoices'], why: '`*.pdf` 也選到了 `manual.pdf`，它被一起搬進 `invoices`；帳單的樣式要寫成 `invoice-*.pdf`。' },
          { commands: ['cd downloads', 'mv beach-01.jpg photos', 'mv beach-02.jpg photos', 'mkdir invoices', 'mv invoice-*.pdf invoices'], why: '沒有先建立 `photos`：第一個 `mv` 把 beach-01.jpg 改名成檔案 `photos`，第二個 `mv` 再用 beach-02.jpg 覆寫它，beach-01.jpg 的內容就此消失，而且沒有任何錯誤訊息。' },
          { commands: ['cd downloads', 'mkdir photos invoices', 'cp *.jpg photos', 'cp invoice-*.pdf invoices'], why: '`cp` 會留下原檔，下載資料夾還是一樣亂；整理要用 `mv`。' },
          { commands: ['cd downloads', 'mv *.jpg photos', 'mkdir photos invoices', 'mv invoice-*.pdf invoices'], why: '順序錯了：搬照片時 `photos` 還不存在，兩個來源搬到不是目錄的地方會失敗（`target \'photos\' is not a directory`），照片根本沒有搬動。' },
        ],
        hints: [
          '先 `cd downloads`，之後的樣式都相對於這個目錄。`mkdir` 可以一次建立兩個目錄。',
          '搬移之前用 `ls *.jpg invoice-*.pdf` 看看兩個樣式各選到哪些檔案，確認 `manual.pdf` 不在裡面。',
          '`mv` 收到多個來源時，最後一個參數必須是已經存在的目錄。',
        ],
        explanation: 'Shell 先把 `*.jpg` 展開成 beach-01.jpg 與 beach-02.jpg、把 `invoice-*.pdf` 展開成兩張帳單，`mv` 收到多個來源，就把它們搬進最後一個參數指定的目錄。`*.pdf` 太寬，會連 `manual.pdf` 一起搬走；目錄沒有先建立時，單一來源的 `mv` 變成改名，多個來源則直接報錯。`.download-state` 以 `.` 開頭，`*` 不會選到它，所以它自然留在原處。',
      },
      {
        id: 'lnx04-latest', title: '把 latest 換到今天的報告', machine: 'ops',
        statement: '家目錄的 `latest` 是符號連結，目前還指向 11 月 21 日的報告。請讓它改為指向 `reports/2026-11-22.txt`（仍然要是符號連結，相對或絕對的目標都可以），而且 `reports` 裡的每一份報告都不能被改動。',
        checks: [
          { kind: 'link', path: `${HOME}/latest`, target: 'reports/2026-11-22.txt' },
          { kind: 'unchanged', path: `${HOME}/reports` },
        ],
        solution: ['ls -l latest', 'ln -sf reports/2026-11-22.txt latest', 'readlink latest'],
        mistakes: [
          { commands: ['ln -s reports/2026-11-22.txt latest'], why: '`latest` 已經存在，`ln -s` 回報 `File exists` 而不做任何事；要加 `-f`，或先 `rm latest`。' },
          { commands: ['cp reports/2026-11-22.txt latest'], why: '不加 `-r` 的 `cp` 會跟著連結走，把 11 月 22 日的內容寫進連結指向的 2026-11-21.txt，昨天的報告被覆寫了，`latest` 卻還指向 21 日。' },
          { commands: ['rm latest', 'ln -s 2026-11-22.txt latest'], why: '相對的目標從連結所在的家目錄算起，家目錄裡沒有 2026-11-22.txt，新的連結是懸空的；要寫 `reports/2026-11-22.txt`。' },
          { commands: ['rm reports/2026-11-21.txt', 'ln -sf reports/2026-11-22.txt latest'], why: '連結換對了，卻刪掉了 21 日的報告；要換的只是連結，報告都要保留。' },
        ],
        hints: [
          '先用 `ls -l latest` 或 `readlink latest` 看它現在指向哪裡。',
          '`ln -s 目標 連結名稱`；名稱已經存在時要加 `-f` 取代它。',
          '相對的目標從連結所在的目錄算起，連結在家目錄，所以目標要包含 `reports/`。',
        ],
        explanation: '`ln -sf reports/2026-11-22.txt latest` 先刪除舊的 `latest` 連結，再建立一個指向新報告的連結，報告本身一個位元都沒有改動；`readlink latest` 印出 `reports/2026-11-22.txt` 確認結果。用 `cp` 寫進連結會穿過連結覆寫目標，這正是符號連結和一般檔案最容易混淆的地方。',
      },
      {
        id: 'lnx04-cleanup', title: '清理網站目錄', machine: 'site',
        statement: '`site` 要發布了。請刪除整個 `build` 目錄，以及 `site` 裡所有以 `.tmp` 結尾的檔案（包括隱藏的暫存檔）。其他檔案都要保留，尤其是名稱看起來很像的 `tmp-notes.txt` 與設定檔 `.gitignore`。刪除之前，先用 `ls -a` 或 `echo` 確認萬用字元會選到哪些檔案。',
        checks: [
          { kind: 'absent', path: `${HOME}/site/build` },
          { kind: 'absent', path: `${HOME}/site/draft.tmp` },
          { kind: 'absent', path: `${HOME}/site/upload.tmp` },
          { kind: 'absent', path: `${HOME}/site/.session.tmp` },
          { kind: 'unchanged', path: `${HOME}/site/index.html` },
          { kind: 'unchanged', path: `${HOME}/site/style.css` },
          { kind: 'unchanged', path: `${HOME}/site/tmp-notes.txt` },
          { kind: 'unchanged', path: `${HOME}/site/.gitignore` },
        ],
        solution: ['cd site', 'ls -a', 'echo *.tmp .*.tmp', 'rm -r build', 'rm *.tmp .*.tmp'],
        mistakes: [
          { commands: ['cd site', 'rm -r build', 'rm *tmp*'], why: '`*tmp*` 太寬，把要保留的 `tmp-notes.txt` 也刪了；而且它不會選到以 `.` 開頭的 `.session.tmp`。' },
          { commands: ['cd site', 'rm -r build', 'rm *.tmp'], why: '`*` 不符合開頭的 `.`，隱藏的 `.session.tmp` 還在；`ls` 看起來乾淨了，`ls -a` 才看得到它。' },
          { commands: ['cd site', 'rm -r build', 'rm *.tmp .*'], why: '`.*` 選到所有隱藏檔，連要保留的 `.gitignore` 也一起刪掉了。' },
          { commands: ['cd site', 'rm build', 'rm *.tmp .*.tmp'], why: '`rm` 刪除目錄要加 `-r`，`build` 還在（`Is a directory`）。' },
          { commands: ['rm -rf site'], why: '整個 `site` 都刪掉了，要發布的網頁也不見了；`rm -rf` 不會再問一次。' },
        ],
        hints: [
          '先 `cd site`，再用 `ls -a` 看清楚有哪些檔案，包括隱藏檔。',
          '`echo *.tmp .*.tmp` 會印出 Shell 展開後的清單，確認沒有 `tmp-notes.txt` 與 `.gitignore`。',
          '刪除目錄要 `rm -r`；同一個 `rm` 可以接好幾個樣式。',
        ],
        explanation: '`*.tmp` 選到 draft.tmp 與 upload.tmp，`.*.tmp` 才選到隱藏的 .session.tmp，兩個樣式都要求名稱以 `.tmp` 結尾，所以 `tmp-notes.txt` 與 `.gitignore` 不受影響。先用 `echo` 或 `ls` 跑一次同樣的樣式，等於免費預覽 `rm` 會收到的清單；`rm` 沒有復原，這一步就是唯一的保險。',
      },
    ],
  },
};
