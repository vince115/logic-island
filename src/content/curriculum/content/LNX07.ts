import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX07 Linux File Permissions and chmod (LNX-2). A terminal lesson on the users profile (engine stage E3): reading the
 * mode string of ls -l, what r, w and x mean for files and for directories (x to enter, w on the directory to create and
 * delete names), the owner → group → other rule where only the first matching class counts, chmod in octal and symbolic
 * form, who may run chown and chgrp, and umask for new files and directories. setuid, setgid and the sticky bit are in
 * the text only: the engine's modes are 0–777. One shared team machine for the transcripts and one small machine per
 * exercise; host names, users, groups and files are made up. Every transcript output was produced by replaying it on the
 * engine.
 */

const dir = (path: string, owner: string, mode: number, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...(group ? { group } : {}) });
const file = (path: string, content: string, owner: string, mode: number, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...(group ? { group } : {}) });
const HOME = '/home/learner';

/**
 * The transcripts' machine: a shared development host. learner is in sudo and webteam, mei in webteam, kai in qa. The
 * team's site folder is webteam's, a hand-off folder can be entered but not listed, and a drop folder is writable by the
 * team.
 */
const devHost: TerminalMachine = {
  id: 'dev', title: '團隊開發機 dev-03', user: 'learner', host: 'dev-03', cwd: HOME, profile: 'users',
  accounts: {
    users: [{ name: 'mei', uid: 1001, comment: 'Mei Lin' }, { name: 'kai', uid: 1002, comment: 'Kai Wu' }],
    groups: [{ name: 'sudo', members: ['learner'] }, { name: 'webteam', gid: 1100, members: ['learner', 'mei'] }, { name: 'qa', gid: 1101, members: ['kai'] }],
  },
  files: [
    dir('/home', 'root', 0o755),
    dir(HOME, 'learner', 0o750),
    file(`${HOME}/deploy.sh`, '#!/bin/bash\necho "deploying site"\n', 'learner', 0o644),
    file(`${HOME}/memo.txt`, '週五前更新網站首頁\n', 'learner', 0o044),
    file(`${HOME}/notes.txt`, '測試站的帳號下週停用\n', 'learner', 0o600),
    dir('/home/mei', 'mei', 0o750),
    dir('/home/kai', 'kai', 0o750),
    dir('/srv', 'root', 0o755),
    dir('/srv/drop', 'root', 0o775, 'webteam'),
    file('/srv/drop/old-build.log', 'build 41 failed\n', 'mei', 0o644),
    dir('/srv/handoff', 'root', 0o711),
    file('/srv/handoff/readme.txt', '交接文件放在 /srv/site\n', 'root', 0o644),
    dir('/srv/site', 'root', 0o775, 'webteam'),
    file('/srv/site/config.ini', 'db_host=10.0.0.5\n', 'mei', 0o640, 'webteam'),
    file('/srv/site/index.html', '<h1>Team site</h1>\n', 'mei', 0o664, 'webteam'),
    file('/srv/site/staging.txt', '測試站暫停更新\n', 'mei', 0o604, 'webteam'),
  ],
};

/** Exercise 1: a build host with two scripts in the home folder, both 644. */
const buildHost: TerminalMachine = {
  id: 'build', title: '建置主機 build-02', user: 'learner', host: 'build-02', cwd: HOME, profile: 'users',
  files: [
    dir('/home', 'root', 0o755),
    dir(HOME, 'learner', 0o750),
    file(`${HOME}/backup.sh`, '#!/bin/bash\necho "backing up"\n', 'learner', 0o644),
    file(`${HOME}/deploy.sh`, '#!/bin/bash\necho "deploying build"\n', 'learner', 0o644),
  ],
};

/** Exercise 2: a report folder learner created (still in learner's private group) that the analytics team should share. */
const reportHost: TerminalMachine = {
  id: 'report', title: '分析伺服器 data-05', user: 'learner', host: 'data-05', cwd: HOME, profile: 'users',
  accounts: {
    users: [{ name: 'yuna', uid: 1001, comment: 'Yuna Ho' }, { name: 'tom', uid: 1002, comment: 'Tom Lee' }],
    groups: [{ name: 'analytics', gid: 1200, members: ['learner', 'yuna'] }],
  },
  files: [
    dir('/home', 'root', 0o755),
    dir(HOME, 'learner', 0o750),
    dir('/srv', 'root', 0o755),
    dir('/srv/q4-report', 'learner', 0o755),
    file('/srv/q4-report/sales.csv', 'month,amount\n10,1200\n11,1350\n12,1810\n', 'learner', 0o644),
    file('/srv/q4-report/summary.md', '# Q4\n第四季營收成長 51%\n', 'learner', 0o644),
  ],
};

/** Exercise 3: an app's settings file that only its owner can read; ren is in webops and needs to read it. */
const appHost: TerminalMachine = {
  id: 'app', title: '應用伺服器 app-11', user: 'learner', host: 'app-11', cwd: '/srv/app', profile: 'users',
  accounts: {
    users: [{ name: 'ren', uid: 1001, comment: 'Ren Sato' }, { name: 'guest', uid: 1002, comment: 'Guest' }],
    groups: [{ name: 'sudo', members: ['learner'] }, { name: 'webops', gid: 1300, members: ['learner', 'ren'] }],
  },
  files: [
    dir('/home', 'root', 0o755),
    dir(HOME, 'learner', 0o750),
    dir('/srv', 'root', 0o755),
    dir('/srv/app', 'root', 0o755, 'webops'),
    file('/srv/app/settings.json', '{"port": 8080, "log": "info"}\n', 'learner', 0o600, 'webops'),
  ],
};

/** Exercise 4: an audit host where the session's umask is still the default 022. */
const auditHost: TerminalMachine = {
  id: 'audit', title: '稽核主機 audit-01', user: 'learner', host: 'audit-01', cwd: HOME, profile: 'users',
  files: [
    dir('/home', 'root', 0o755),
    dir(HOME, 'learner', 0o750),
  ],
};

export const LNX07: LessonContent = {
  lessonId: 'LNX07',
  motivation: '「Permission denied」是 Linux 新手最常看到的錯誤，也是最常被錯誤「修好」的錯誤：一行 `chmod 777` 讓訊息消失，同時讓機器上的每一個帳號都能讀、改、甚至執行那個檔案。在多人共用的伺服器上，權限決定了誰看得到資料庫的密碼、誰能改掉網站首頁、誰能刪掉同事的工作成果。本課在一台團隊共用的開發機上，學會讀懂 `ls -l` 開頭的十個字元、r／w／x 對檔案與對目錄的不同意義，以及系統依「擁有者 → 群組 → 其他人」判斷存取的規則；再用 chmod 的八進位與符號寫法、chown、chgrp 與 umask，給檔案與目錄剛好夠用的最小權限，並能說出每一次 Permission denied 的真正原因。',
  sections: [
    {
      id: 'lnx07-s-read', title: '讀懂 ls -l 的權限欄',
      blocks: [
        { type: 'p', text: '`ls -l` 每一行開頭的十個字元就是權限。第 1 個字元是檔案類型；後面九個字元分成三組，每組三個，依序是擁有者（user，u）、群組（group，g）與其他人（others，o）的權限。每一組固定依 r（讀）、w（寫）、x（執行）的順序排列，有這個權限就印出字母，沒有就印 `-`。權限欄後面是擁有者與群組：每個檔案和目錄都恰好屬於一個使用者與一個群組，這兩欄決定了你屬於三組中的哪一組。' },
        { type: 'table', head: ['位置', '在 `-rw-r-----` 中', '意義'], rows: [
          ['第 1 個字元', '`-`', '檔案類型：`-` 一般檔案、`d` 目錄、`l` 符號連結；真實系統的 /dev 裡還有 `c`、`b`（字元裝置與區塊裝置），另有 `p`（具名管線）與 `s`（socket）'],
          ['第 2–4 個字元', '`rw-`', '擁有者（u）：可以讀、可以寫、不能執行'],
          ['第 5–7 個字元', '`r--`', '群組（g）：只能讀'],
          ['第 8–10 個字元', '`---`', '其他人（o）：什麼都不行'],
        ] },
        { type: 'p', text: '模擬環境的 `ls -l` 依序印出權限、擁有者、群組、大小（位元組）與名稱；真實系統在權限後面還有一欄連結數，在大小後面還有修改時間，例如 `-rw-r----- 1 root shadow 1024 Nov 22 09:00 /etc/shadow`。`ls -l 目錄` 列出的是目錄裡的項目，想看目錄本身要加 `-d`：`ls -ld /srv/site`。判斷權限一定要同時知道兩件事：檔案屬於誰，以及你是誰、屬於哪些群組，所以下面的紀錄先用 `id` 確認自己的身分，再看幾個檔案。' },
        { type: 'example', id: 'lnx07-read' },
        { type: 'p', text: '讀出來是這樣：`/etc/shadow` 是 `-rw-r----- root shadow`，root 可讀寫、shadow 群組只能讀、其他人什麼都不行，所以 learner 讀不到密碼雜湊。`/srv/site` 是 `drwxrwxr-x root webteam`，一個目錄，root 與 webteam 群組的成員都可以在裡面建立檔案，其他人只能進入與列出。`notes.txt` 是 `rw-------`，只有 learner 自己能讀寫。' },
      ],
    },
    {
      id: 'lnx07-s-rwx', title: 'r、w、x 對檔案與目錄的意義不同',
      blocks: [
        { type: 'p', text: '對一般檔案，三個字母的意思很直覺：讀內容、改內容、把它當成程式執行。目錄則是一張「名稱 → 檔案」的清單，r、w、x 都是對這張清單的操作，意義因此不同。很多 Permission denied 的困惑，都來自把目錄的權限當成檔案的權限來讀。' },
        { type: 'table', head: ['權限', '對檔案', '對目錄'], rows: [
          ['r', '讀取內容（`cat`、`cp` 的來源）', '列出裡面有哪些名稱（`ls`）'],
          ['w', '修改、覆寫、清空內容（`>`、`>>`）', '在裡面建立、刪除、改名項目（`touch`、`rm`、`mv`）；要和 x 一起才有效'],
          ['x', '當成程式執行；腳本還需要 r，因為直譯器要讀它', '進入與穿越：`cd` 進去，或以路徑存取裡面的檔案'],
        ] },
        { type: 'p', text: '由這張表可以推出幾件事。第一，路徑上的每一層目錄都需要 x：`/srv/site/config.ini` 要求 `/`、`/srv`、`/srv/site` 三層都能穿越，少一層就是 Permission denied，和檔案本身的權限無關。第二，只有 x 沒有 r 的目錄（例如 `drwx--x--x`），知道檔名就能讀裡面的檔案，卻列不出有哪些檔案。第三，只有 r 沒有 x 的目錄，真實系統列得出名稱，卻看不到每個項目的屬性，也打不開它們。第四，也是最常被誤解的：刪除或改名一個檔案改變的是目錄的清單，不是檔案本身，所以需要的是所在目錄的 w 與 x，檔案自己的權限完全不參與。' },
        { type: 'p', text: '下面的紀錄先看 `/srv/handoff`：其他人只有 x，所以 `ls` 被拒絕，直接讀已知檔名的檔案卻可以。接著在 webteam 可寫的 `/srv/drop` 裡，learner 不能寫 mei 的日誌（learner 不是 mei，也不在 mei 群組裡，套用的是其他人的 `r--`），卻能把它刪掉。' },
        { type: 'example', id: 'lnx07-dirs' },
        { type: 'callout', tone: 'warning', title: '檔案唯讀，不代表刪不掉', text: '常見的誤會是把檔案設成 `444`（`r--r--r--`）就能防止別人刪除或替換它。只要對方對所在的目錄有 w 與 x，就能刪掉或改名這個檔案，再放一個同名的新檔案取代它。真實的 `rm` 遇到自己不能寫的檔案時會先詢問（`remove write-protected regular file?`），但那只是提醒，回答 y 或加上 `-f` 就照刪不誤。要保護檔案不被刪除，該管的是目錄的權限；至於 /tmp 這種人人都可寫的目錄，靠的是最後一節介紹的 sticky 位元。' },
      ],
    },
    {
      id: 'lnx07-s-order', title: '判斷存取：擁有者 → 群組 → 其他人，只看第一個符合的',
      blocks: [
        { type: 'p', text: '程式要讀、寫或執行一個檔案時，核心依序問三個問題，而且只採用第一個答案是「是」的那一組權限：' },
        { type: 'list', ordered: true, items: [
          '你是這個檔案的擁有者嗎？是 → 只看擁有者那三個字元，判斷結束。',
          '不是擁有者，但你所屬的群組（`id` 列出的那些）包含檔案的群組嗎？是 → 只看群組那三個字元，判斷結束。',
          '兩者都不是 → 看其他人那三個字元。',
        ] },
        { type: 'p', text: '關鍵在「只看第一個符合的」：三組權限不會加總，也不會替你挑最寬鬆的一組。所以擁有者的權限可以比其他人還少，`----r--r--` 的擁有者讀不到自己的檔案，其他人卻可以；群組成員也可能比陌生人還少，`-rw----r--` 的群組成員讀不到，其他人可以。這種設定很少是故意的，但看懂它，才能解釋「為什麼別人都可以，偏偏我不行」。root 是例外：核心不替 root 檢查讀寫權限；只有執行一般檔案時，root 仍需要三組中至少一組有 x。' },
        { type: 'p', text: '下表是 dev-03 上的推理。learner 屬於 learner、sudo 與 webteam 群組，mei 屬於 mei 與 webteam，kai 屬於 kai 與 qa；表中假設路徑上的每一層目錄都允許穿越（`/srv` 與 `/srv/site` 對所有人都有 x）。' },
        { type: 'table', head: ['使用者', '檔案', '套用哪一組', '能讀嗎', '能寫嗎', '能執行嗎'], rows: [
          ['mei', '`-rw----r-- mei webteam staging.txt`', '擁有者 `rw-`', '可以', '可以', '不行'],
          ['learner', '同一個 staging.txt', '群組 `---`（learner 在 webteam）', '不行', '不行', '不行'],
          ['kai', '同一個 staging.txt', '其他人 `r--`', '可以', '不行', '不行'],
          ['learner', '`-rw-r----- mei webteam config.ini`', '群組 `r--`', '可以', '不行', '不行'],
          ['kai', '同一個 config.ini', '其他人 `---`', '不行', '不行', '不行'],
          ['learner', '`----r--r-- learner learner memo.txt`', '擁有者 `---`', '不行', '不行', '不行'],
          ['root', '任何一個檔案', '不檢查讀寫', '可以', '可以', '至少一組有 x 才行'],
        ] },
        { type: 'p', text: '紀錄中用 `sudo -u 使用者 指令` 以別人的身分執行一個指令，親眼確認表中的判斷：同一個 staging.txt，擁有者 mei 與其他人 kai 都讀得到，在群組裡的 learner 反而被拒絕。最後 learner 以擁有者的身分修好自己的 memo.txt：擁有者隨時可以用 chmod 改回自己的權限。' },
        { type: 'example', id: 'lnx07-order' },
        { type: 'callout', tone: 'tip', title: '遇到 Permission denied 時依序檢查', text: '一、`id`：我是誰、屬於哪些群組（剛被加入群組的帳號，要重新登入或用 `newgrp` 之後才生效）。二、`ls -ld`：路徑上的每一層目錄，我都有 x 嗎？三、`ls -l` 檔案：我是擁有者、群組成員還是其他人，套用的那一組有沒有需要的字母？四、只替真正需要的那一組，加上缺少的那一個權限；多數情況下該改的是群組，而不是把其他人打開。' },
      ],
    },
    {
      id: 'lnx07-s-chmod', title: 'chmod：八進位與符號兩種寫法',
      blocks: [
        { type: 'p', text: '只有檔案的擁有者與 root 能用 `chmod` 改權限；在檔案的群組裡、甚至對檔案有寫入權限都不夠，否則印出 `Operation not permitted`。`chmod` 有兩種寫法。八進位權限把每一組的三個位元相加成一個數字，r=4、w=2、x=1，三組依序寫成三位數，一次設定全部九個位元：`rw-` 是 4+2=6，`r-x` 是 4+1=5，`---` 是 0，所以 `rw-r-----` 是 640。' },
        { type: 'table', head: ['八進位', '權限字串', '常見用途'], rows: [
          ['644', '`rw-r--r--`', '一般文件：自己可以改，大家都能讀'],
          ['600', '`rw-------`', '私密檔案：SSH 私鑰、含密碼的設定檔'],
          ['640', '`rw-r-----`', '群組可讀的設定與日誌，其他人看不到'],
          ['660', '`rw-rw----`', '群組共同編輯的檔案'],
          ['755', '`rwxr-xr-x`', '程式、腳本，以及大家都能進入與列出的目錄'],
          ['750', '`rwxr-x---`', '只給自己與群組使用的目錄或程式'],
          ['700', '`rwx------`', '只有自己能用的腳本或目錄'],
          ['770', '`rwxrwx---`', '群組成員都能在裡面建立與刪除檔案的共用目錄'],
        ] },
        { type: 'p', text: '符號寫法只改你指定的部分，格式是「對象、運算、權限」。對象是 `u`、`g`、`o`，或代表三組的 `a`；運算 `+` 是加上、`-` 是拿掉、`=` 是設成剛好這些（`o=` 表示其他人什麼都沒有）；多個子句用逗號連接，中間不能有空白。不寫對象時（例如 `chmod +x`），GNU chmod 當成 `a`，但不會加上 umask 遮掉的位元。' },
        { type: 'table', head: ['指令', '從 `rw-r--r--`（644）開始的結果'], rows: [
          ['`chmod u+x f`', '`rwxr--r--`（744）'],
          ['`chmod g+w,o= f`', '`rw-rw----`（660）'],
          ['`chmod go-r f`', '`rw-------`（600）'],
          ['`chmod a+x f`', '`rwxr-xr-x`（755）'],
          ['`chmod u=rwx,g=rx,o= f`', '`rwxr-x---`（750）'],
        ] },
        { type: 'p', text: '兩種寫法各有用處：八進位適合「我知道最後要什麼」，三個數字就是完整的答案；符號適合「只改一點，其他保持原樣」，不管檔案原本是什麼，`chmod u+x` 都只加上擁有者的執行權限。下面的紀錄兩種都用，最後示範對別人的檔案執行 `chmod` 與寫錯模式時的錯誤。' },
        { type: 'example', id: 'lnx07-chmod' },
        { type: 'callout', tone: 'warning', title: 'chmod 777 不是修好，是把門拆掉', text: '遇到 Permission denied 時，`chmod 777` 總是能讓錯誤消失，因為它讓每一個帳號都能讀、寫、執行，包括被入侵的網站程式與任何登入這台機器的人；設定檔被竄改、密碼被讀走、腳本被植入指令，常常就從這裡開始。正確的作法是先找出被拒絕的是誰、套用的是哪一組，只替那一組補上缺少的那一個權限：讀不到就加 r，而且通常加在群組上。對目錄執行 `chmod -R 777` 更糟，它還讓底下所有的資料檔都變成可執行。' },
      ],
    },
    {
      id: 'lnx07-s-owner', title: 'chown、chgrp 與 umask：新檔案屬於誰、權限多少',
      blocks: [
        { type: 'p', text: '改擁有者用 `chown 使用者[:群組] 路徑`，只改群組用 `chgrp 群組 路徑`（也可以寫成 `chown :群組 路徑`）；`chown mei: f` 表示改成 mei 與 mei 的主要群組。兩者都有 `-R`，連同目錄底下的一切一起改。誰可以做哪件事，是 Linux 的固定規則：' },
        { type: 'table', head: ['動作', '誰可以'], rows: [
          ['改權限（`chmod`）', '檔案的擁有者與 root'],
          ['改擁有者（`chown mei f`）', '只有 root；一般使用者連「把自己的檔案送給別人」都不行，否則就能把檔案塞到別人名下、躲過磁碟配額'],
          ['改群組（`chgrp webteam f`、`chown :webteam f`）', '檔案的擁有者可以改成自己所屬的任何一個群組；改成自己不屬於的群組要 root'],
          ['讀取或修改內容', '依前面的 r／w 規則判斷，和能不能 chmod 無關'],
        ] },
        { type: 'p', text: '新檔案的權限則不是 chmod 決定的。建立檔案的程式會要求一個模式（一般檔案通常是 666、目錄是 777），核心再拿掉 umask 裡的位元。umask 是遮罩，列出「要拿掉」的權限，不是新檔案的權限：022 拿掉群組與其他人的 w，所以新檔案是 644、新目錄是 755；027 再拿掉其他人的全部，得到 640 與 750；077 只留給自己，得到 600 與 700。這是按位元「去掉」，不是減法：666 去掉 027 是 640，不是 637，因為 666 本來就沒有 x 可以拿掉。這也是為什麼新檔案永遠不會自動帶有執行權限，寫好的腳本總要再 `chmod u+x`。' },
        { type: 'table', head: ['umask', '新檔案', '新目錄', '適合的情況'], rows: [
          ['022', '644 `rw-r--r--`', '755 `rwxr-xr-x`', '常見的預設：大家都能讀'],
          ['002', '664 `rw-rw-r--`', '775 `rwxrwxr-x`', '群組協作；部分發行版替使用者私人群組的帳號預設這個值'],
          ['027', '640 `rw-r-----`', '750 `rwxr-x---`', '群組可讀，其他人看不到'],
          ['077', '600 `rw-------`', '700 `rwx------`', '只有自己'],
        ] },
        { type: 'p', text: '`umask` 不加參數印出目前的值（`0022`），`umask -S` 改以「保留的權限」顯示（`u=rwx,g=rx,o=rx`）；`umask 027` 或 `umask u=rwx,g=rx,o=` 設定它。umask 屬於目前的 Shell 工作階段：只影響之後建立的檔案，已經存在的檔案不變，登出後也就恢復原值，要長期生效得寫進 `~/.bashrc` 之類的啟動檔。下面的紀錄在 dev-03 上比較兩種 umask 建立的檔案，再把報告交給團隊：`chgrp` 到自己所屬的 webteam 可以，到不屬於的 qa 不行；`chown` 給 mei 則一定要 root。' },
        { type: 'example', id: 'lnx07-owner-umask' },
      ],
    },
    {
      id: 'lnx07-s-special', title: '特殊權限位元：setuid、setgid 與 sticky',
      blocks: [
        { type: 'p', text: '除了九個 rwx 位元，Linux 的模式還有三個特殊位元，以八進位寫在最前面的第四位數：setuid 是 4、setgid 是 2、sticky 是 1，所以 `chmod 1777 /tmp` 就是 rwxrwxrwx 再加上 sticky。它們顯示在 x 的位置：那一組也有 x 時是小寫的 `s` 或 `t`，沒有 x 時是大寫的 `S` 或 `T`。模擬環境的模式只有九個位元（0–777），不支援這三個位元，本節只認識它們，不在終端機裡操作。' },
        { type: 'table', head: ['位元', '八進位', '在 ls -l 中', '作用', '常見的例子'], rows: [
          ['setuid', '4000', '`-rwsr-xr-x`', '執行檔以檔案擁有者的身分執行，而不是以執行它的人', '`/usr/bin/passwd`（4755，root 擁有），一般使用者才能更新只有 root 能寫的密碼檔'],
          ['setgid', '2000', '`drwxrwsr-x`', '用在目錄：裡面新建的檔案屬於目錄的群組，而不是建立者的主要群組；用在執行檔：以檔案的群組執行', '團隊共用目錄（2775）'],
          ['sticky', '1000', '`drwxrwxrwt`', '用在目錄：只有檔案的擁有者、目錄的擁有者或 root 能刪除或改名裡面的項目', '`/tmp`（1777）'],
        ] },
        { type: 'p', text: 'sticky 位元正好補上第二節的漏洞：/tmp 人人都可寫，沒有 sticky 的話任何人都能刪掉別人的暫存檔。setgid 目錄讓共用目錄裡的新檔案自動屬於團隊的群組，搭配 umask 002 就不必每次手動 chgrp。setuid 程式以別人的身分執行，一個漏洞就可能被拿來取得 root 權限，所以管理員會定期清查（真實系統可以用 `find / -perm -4000` 列出它們），也不會替自己寫的腳本加上這個位元。' },
        { type: 'p', text: '把本課串起來，給檔案與目錄最小必要權限的流程是：' },
        { type: 'list', ordered: true, items: [
          '先問誰需要什麼：只有自己、整個團隊、還是所有人；要讀、要改、還是要執行或進入。',
          '決定擁有者與群組：共用的資料交給團隊的群組（`chgrp`），不要用「其他人」代替群組。',
          '用八進位一次設好檔案與目錄（例如 640／750、660／770），或用符號只補上缺少的那一個位元。',
          '用 `sudo -u 使用者` 以對方的身分試一次，確認該通的通、不該通的不通。',
          '新檔案的預設不合用時調整 umask，而不是事後一個一個 chmod。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx07-q1', prompt: '`ls -l` 顯示 `drwxr-x--- mei webteam 4096 site`。learner 不是 mei，但在 webteam 群組裡。learner 對 `site` 能做什麼？',
      options: ['可以列出、進入，也可以在裡面建立與刪除檔案', '什麼都不能做，因為其他人是 `---`', '可以列出內容與進入，但不能在裡面建立或刪除檔案', '只能進入，不能列出內容'],
      answer: 2,
      explanation: 'learner 不是擁有者但在 webteam 裡，所以只看群組那一組 `r-x`：r 讓他列出名稱、x 讓他進入；沒有 w，就不能建立、刪除或改名裡面的項目。第一個選項是擁有者 `rwx` 的能力；其他人的 `---` 輪不到群組成員，因為核心只看第一個符合的那一組；只能進入、不能列出是 `--x` 的情況。',
    },
    {
      id: 'lnx07-q2', prompt: '哪一個權限字串等於八進位的 `640`？',
      options: ['`rw-r-----`', '`rw-r--r--`', '`rwxr-----`', '`r--rw----`'],
      answer: 0,
      explanation: '每一位數是一組 r=4、w=2、x=1 的和：6=4+2 是 `rw-`，4 是 `r--`，0 是 `---`，所以 640 是 `rw-r-----`。`rw-r--r--` 是 644，其他人也能讀；`rwxr-----` 是 740，擁有者多了 x；`r--rw----` 是 460，把前兩組的數字對調了。',
    },
    {
      id: 'lnx07-q3', prompt: '`memo.txt` 是 `----r--r-- learner learner`。learner 自己執行 `cat memo.txt` 會怎樣？',
      options: ['讀得到，因為擁有者永遠可以讀自己的檔案', '讀得到，因為群組與其他人都有 r，三組會合併計算', '讀不到，而且 learner 再也無法改回權限', '讀不到，因為 learner 是擁有者，只看擁有者那一組 `---`'],
      answer: 3,
      explanation: '核心依擁有者 → 群組 → 其他人的順序，只用第一個符合的那一組；learner 是擁有者，就只看 `---`，所以被拒絕，即使群組與其他人都能讀。擁有者沒有自動的讀取權限，三組也不會合併計算；不過擁有者隨時可以 `chmod u+r memo.txt` 改回來，因為能不能 chmod 看的是擁有權，不是 rwx。',
    },
    {
      id: 'lnx07-q4', prompt: '`/srv/drop` 是 `drwxrwxr-x root webteam`，裡面的 `old.log` 是 `-r--r--r-- mei mei`。learner 在 webteam 群組裡，執行 `rm -f /srv/drop/old.log` 的結果是？',
      options: ['Permission denied，因為 learner 不能寫 old.log', '刪除成功，因為刪除修改的是目錄，learner 對 /srv/drop 有 w 與 x', 'Permission denied，因為只有檔案的擁有者 mei 能刪除它', '只清空 old.log 的內容，檔案本身留著'],
      answer: 1,
      explanation: '刪除是從目錄的清單中移除一個名稱，需要的是所在目錄的 w 與 x；learner 透過 webteam 對 /srv/drop 有 `rwx`，所以刪除成功，old.log 自己的權限不參與。檔案唯讀擋不住刪除；「只有擁有者能刪除」是 sticky 位元的規則，這個目錄沒有設定；`rm` 移除的是名稱，不會只清空內容。',
    },
    {
      id: 'lnx07-q5', prompt: '檔案目前是 `rw-rw-r--`（664），執行 `chmod g-w,o= f` 之後是？',
      options: ['`rw-r-----`（640）', '`rw-------`（600）', '`rw-rw----`（660）', '`rw-r--r--`（644）'],
      answer: 0,
      explanation: '`g-w` 拿掉群組的 w，`rw-` 變成 `r--`；`o=` 把其他人設成什麼都沒有，`r--` 變成 `---`；擁有者不受影響，結果是 640。600 是連群組的 r 也拿掉了；660 是只做了 `o=`；644 是只做了 `g-w`。',
    },
    {
      id: 'lnx07-q6', prompt: '執行 `umask 027` 之後，`touch a.txt` 與 `mkdir d` 建立的權限分別是？',
      options: ['`rw-r--r--` 與 `rwxr-xr-x`', '`rwxr-x---` 與 `rwxr-x---`', '`rw-r-----` 與 `rwxr-x---`', '`rw--wxrwx` 與 `rwxr-x---`'],
      answer: 2,
      explanation: '新檔案從 666、新目錄從 777 開始，再去掉 umask 的位元：666 去掉 027 是 640（`rw-r-----`），777 去掉 027 是 750（`rwxr-x---`）。644 與 755 是預設 umask 022 的結果；新檔案不會自動帶有 x，所以不會是 750；`rw--wxrwx` 是 637，把 umask 當成減法算出來的，但 umask 是按位元拿掉，666 本來就沒有 x 可拿。',
    },
    {
      id: 'lnx07-q7', prompt: 'learner 不是 root，屬於 learner 與 webteam 群組；`report.txt` 是 `-rw-r----- learner learner`。下列哪個指令會成功？',
      options: ['`chown mei report.txt`', '`chgrp qa report.txt`', '`chmod 640 /srv/site/index.html`（它的擁有者是 mei）', '`chgrp webteam report.txt`'],
      answer: 3,
      explanation: '檔案的擁有者可以把群組改成自己所屬的群組，所以 `chgrp webteam report.txt` 成功。改擁有者只有 root 能做，即使是自己的檔案；learner 不屬於 qa，不能把群組改成它；`chmod` 只有擁有者與 root 能執行，index.html 的擁有者是 mei，所以得到 Operation not permitted。',
    },
    {
      id: 'lnx07-q8', prompt: '在真實系統上，`ls -ld /tmp` 顯示 `drwxrwxrwt`。結尾的 `t` 代表什麼？',
      options: ['這是暫存目錄，系統會定期清空它', 'sticky 位元：人人可以在裡面建立檔案，但只有檔案的擁有者、目錄的擁有者或 root 能刪除或改名它們', '其他人只能讀取，不能寫入', '裡面的程式以目錄擁有者 root 的身分執行'],
      answer: 1,
      explanation: '最後一個位置的 `t` 表示其他人有 x，而且設定了 sticky 位元（八進位 1777）；沒有它的話，人人可寫的 /tmp 讓任何人都能刪掉別人的檔案。定期清理 /tmp 是系統服務的設定（例如 systemd-tmpfiles），和這個字母無關；`t` 出現在 x 的位置，其他人仍然有 rwx；以檔案擁有者身分執行的是 setuid（`s`），而且用在執行檔上。',
    },
  ],
  terminal: {
    machines: [devHost, buildHost, reportHost, appHost, auditHost],
    examples: [
      {
        id: 'lnx07-read', title: '先看自己是誰，再讀權限', machine: 'dev',
        description: '`id` 列出 learner 的群組；`ls -l` 讀出每個檔案的類型、三組權限、擁有者與群組；`ls -ld` 看目錄本身。',
        steps: [
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),1100(webteam)' },
          { command: 'ls -l', output: '-rw-r--r-- learner learner    34 deploy.sh\n----r--r-- learner learner    28 memo.txt\n-rw------- learner learner    31 notes.txt' },
          { command: 'ls -l /srv/site', output: '-rw-r----- mei     webteam    17 config.ini\n-rw-rw-r-- mei     webteam    19 index.html\n-rw----r-- mei     webteam    22 staging.txt' },
          { command: 'ls -ld /srv/site', output: 'drwxrwxr-x root    webteam  4096 /srv/site/' },
          { command: 'ls -l /etc/shadow', output: '-rw-r----- root    shadow    241 /etc/shadow' },
          { command: 'cat /etc/shadow', output: 'cat: /etc/shadow: Permission denied' },
        ],
      },
      {
        id: 'lnx07-dirs', title: '目錄的 x 與 w', machine: 'dev',
        description: '只有 x 的目錄列不出內容，卻能讀已知檔名的檔案；在可寫的目錄裡，寫不了的檔案照樣刪得掉。',
        steps: [
          { command: 'ls -ld /srv/handoff', output: 'drwx--x--x root    root     4096 /srv/handoff/' },
          { command: 'ls /srv/handoff', output: 'ls: cannot open directory \'/srv/handoff\': Permission denied' },
          { command: 'cat /srv/handoff/readme.txt', output: '交接文件放在 /srv/site' },
          { command: 'ls -ld /srv/drop', output: 'drwxrwxr-x root    webteam  4096 /srv/drop/' },
          { command: 'ls -l /srv/drop', output: '-rw-r--r-- mei     mei        16 old-build.log' },
          { command: 'echo retry >> /srv/drop/old-build.log', output: 'bash: /srv/drop/old-build.log: Permission denied' },
          { command: 'rm -f /srv/drop/old-build.log', output: '' },
          { command: 'ls /srv/drop', output: '' },
        ],
      },
      {
        id: 'lnx07-order', title: '只看第一個符合的那一組', machine: 'dev',
        description: '群組權限比其他人少的 staging.txt：擁有者與其他人都讀得到，群組裡的 learner 被拒絕；擁有者權限是 `---` 的 memo.txt，由擁有者自己改回來。',
        steps: [
          { command: 'ls -l /srv/site/staging.txt', output: '-rw----r-- mei     webteam    22 /srv/site/staging.txt' },
          { command: 'cat /srv/site/staging.txt', output: 'cat: /srv/site/staging.txt: Permission denied' },
          { command: 'sudo -u mei cat /srv/site/staging.txt', output: '測試站暫停更新' },
          { command: 'id kai', output: 'uid=1002(kai) gid=1002(kai) groups=1002(kai),1101(qa)' },
          { command: 'sudo -u kai cat /srv/site/staging.txt', output: '測試站暫停更新' },
          { command: 'sudo -u kai cat /srv/site/config.ini', output: 'cat: /srv/site/config.ini: Permission denied' },
          { command: 'ls -l memo.txt', output: '----r--r-- learner learner    28 memo.txt' },
          { command: 'cat memo.txt', output: 'cat: memo.txt: Permission denied' },
          { command: 'chmod u+rw memo.txt', output: '' },
          { command: 'cat memo.txt', output: '週五前更新網站首頁' },
        ],
      },
      {
        id: 'lnx07-chmod', title: '八進位與符號寫法', machine: 'dev',
        description: '`u+x` 只替擁有者加上執行權限；設成 `755` 之後，`g-x,o=` 收回群組的 x 與其他人的一切；`700` 一次設定全部九個位元。別人的檔案改不了，寫錯的模式會被拒絕。',
        steps: [
          { command: 'ls -l deploy.sh', output: '-rw-r--r-- learner learner    34 deploy.sh' },
          { command: 'chmod u+x deploy.sh', output: '' },
          { command: 'ls -l deploy.sh', output: '-rwxr--r-- learner learner    34 deploy.sh' },
          { command: 'chmod 755 deploy.sh', output: '' },
          { command: 'chmod g-x,o= deploy.sh', output: '' },
          { command: 'ls -l deploy.sh', output: '-rwxr----- learner learner    34 deploy.sh' },
          { command: 'chmod 700 deploy.sh', output: '' },
          { command: 'ls -l deploy.sh', output: '-rwx------ learner learner    34 deploy.sh' },
          { command: 'chmod 640 /srv/site/index.html', output: 'chmod: changing permissions of \'/srv/site/index.html\': Operation not permitted' },
          { command: 'chmod u+z deploy.sh', output: 'chmod: invalid mode: \'u+z\'\nTry \'chmod --help\' for more information.' },
        ],
      },
      {
        id: 'lnx07-owner-umask', title: 'umask、chgrp 與 chown', machine: 'dev',
        description: '預設 umask 022 建立 644 的檔案與 755 的目錄，改成 027 之後是 640 與 750；再把報告的群組改成 webteam，擁有者則要 root 才能改。',
        steps: [
          { command: 'umask', output: '0022' },
          { command: 'touch draft.txt', output: '' },
          { command: 'mkdir drafts', output: '' },
          { command: 'umask 027', output: '' },
          { command: 'umask -S', output: 'u=rwx,g=rx,o=' },
          { command: 'touch report.txt', output: '' },
          { command: 'mkdir reports', output: '' },
          { command: 'ls -ld draft.txt drafts report.txt reports', output: '-rw-r--r-- learner learner     0 draft.txt\ndrwxr-xr-x learner learner  4096 drafts/\n-rw-r----- learner learner     0 report.txt\ndrwxr-x--- learner learner  4096 reports/' },
          { command: 'chgrp qa report.txt', output: 'chgrp: changing group of \'report.txt\': Operation not permitted' },
          { command: 'chgrp webteam report.txt', output: '' },
          { command: 'chown mei report.txt', output: 'chown: changing ownership of \'report.txt\': Operation not permitted' },
          { command: 'sudo chown mei:webteam report.txt', output: '' },
          { command: 'ls -l report.txt', output: '-rw-r----- mei     webteam     0 report.txt' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx07-exec', title: '只讓擁有者執行腳本', machine: 'build',
        statement: '家目錄的 `deploy.sh` 目前是 `rw-r--r--`。請讓擁有者（learner）可以執行它，群組與其他人仍然不能執行；其他權限保持原樣（大家仍可讀，只有擁有者能寫）。`backup.sh` 不要改動。',
        checks: [
          { kind: 'mode', path: `${HOME}/deploy.sh`, mode: 0o744 },
          { kind: 'unchanged', path: `${HOME}/backup.sh` },
        ],
        solution: ['ls -l deploy.sh', 'chmod u+x deploy.sh', 'ls -l deploy.sh'],
        mistakes: [
          { commands: ['chmod +x deploy.sh'], why: '沒有寫對象的 `+x` 等於 `a+x`，群組與其他人也能執行了（755）；要寫 `u+x`。' },
          { commands: ['chmod 777 deploy.sh'], why: '每個人都能執行，還能修改這個部署腳本，任何帳號都可以在裡面塞進自己的指令。' },
          { commands: ['chmod u=x deploy.sh'], why: '`=` 是「設成剛好這些」：擁有者只剩 x，連讀寫都沒有了（144），bash 也讀不到腳本而無法執行。' },
          { commands: ['chmod 700 deploy.sh'], why: '擁有者可以執行了，但群組與其他人原本的讀取權限也被拿掉；題目要其他權限保持原樣，應該是 744。' },
          { commands: ['chmod u+x *.sh'], why: '萬用字元也選到了 `backup.sh`，它不應該被改動。' },
        ],
        hints: [
          '先 `ls -l deploy.sh` 看清楚現在的三組權限。',
          '符號寫法只改你指定的那一組：對象 `u`、運算 `+`、權限 `x`。',
          '用八進位的話，`rwxr--r--` 是 7、4、4。',
        ],
        explanation: '`chmod u+x deploy.sh` 只在擁有者那一組加上 x，群組與其他人的 `r--` 保持不變，結果是 `rwxr--r--`（744），等同於 `chmod 744 deploy.sh`。不寫對象的 `+x` 會替三組都加上執行權限；`=` 會把整組換掉；`700` 則多拿掉了別人的讀取權限。',
      },
      {
        id: 'lnx07-shared', title: '設定團隊共用目錄', machine: 'report',
        statement: 'learner 建立的 `/srv/q4-report` 要交給 analytics 團隊共用（learner 與 yuna 都在 analytics 群組，tom 不在）。請讓目錄與其中的兩個檔案都屬於 `analytics` 群組（擁有者仍是 learner）；目錄設成 `rwxrwx---`，讓成員能進入、列出、建立與刪除檔案；兩個檔案設成 `rw-rw----`，成員可以讀寫但不能執行。不是成員的人（其他人）什麼都不能做。',
        checks: [
          { kind: 'owner', path: '/srv/q4-report', owner: 'learner', group: 'analytics' },
          { kind: 'owner', path: '/srv/q4-report/sales.csv', owner: 'learner', group: 'analytics' },
          { kind: 'owner', path: '/srv/q4-report/summary.md', owner: 'learner', group: 'analytics' },
          { kind: 'mode', path: '/srv/q4-report', mode: 0o770 },
          { kind: 'mode', path: '/srv/q4-report/sales.csv', mode: 0o660 },
          { kind: 'mode', path: '/srv/q4-report/summary.md', mode: 0o660 },
        ],
        solution: ['id', 'chgrp -R analytics /srv/q4-report', 'chmod -R g+w,o= /srv/q4-report', 'ls -ld /srv/q4-report', 'ls -l /srv/q4-report'],
        mistakes: [
          { commands: ['chmod -R 777 /srv/q4-report'], why: '其他人（包括 tom）也能讀寫刪除，而且群組仍是 learner 的私人群組，yuna 是以「其他人」的身分進來的。' },
          { commands: ['chmod -R g+w,o= /srv/q4-report'], why: '權限對了，但群組仍是 learner：yuna 不在這個群組，對她而言套用的是其他人的 `---`，什麼都不能做。' },
          { commands: ['chgrp -R analytics /srv/q4-report', 'chmod -R 770 /srv/q4-report'], why: '目錄對了，但兩個資料檔也變成 `rwxrwx---`，多了不需要的執行權限。' },
          { commands: ['chgrp -R analytics /srv/q4-report', 'chmod -R 660 /srv/q4-report'], why: '目錄沒有 x，成員無法進入，連 learner 自己也打不開裡面的檔案；目錄需要 `rwxrwx---`。' },
          { commands: ['chgrp analytics /srv/q4-report', 'chmod -R g+w,o= /srv/q4-report'], why: '沒有 `-R` 的 chgrp 只改了目錄本身，兩個檔案仍屬於 learner 群組。' },
        ],
        hints: [
          '先用 `id` 確認 learner 在 analytics 群組裡：擁有者只能把群組改成自己所屬的群組。',
          '`chgrp -R` 連同目錄底下的檔案一起改群組。',
          '目錄與檔案需要的權限不同；`chmod -R g+w,o=` 只補上群組的 w、收回其他人的一切，原本的 x 留在目錄上，檔案仍然沒有 x。',
        ],
        explanation: '`chgrp -R analytics /srv/q4-report` 讓目錄與檔案都屬於 analytics（learner 是擁有者，也是 analytics 的成員，所以不需要 root）。原本目錄是 755、檔案是 644，`chmod -R g+w,o=` 替群組加上 w、把其他人設成什麼都沒有，目錄成為 770、檔案成為 660。也可以分開寫 `chmod 770 /srv/q4-report` 與 `chmod 660 /srv/q4-report/*`。只改權限不改群組，yuna 仍是「其他人」；對整個目錄用同一個八進位值，則不是讓檔案多了 x，就是讓目錄少了 x。',
      },
      {
        id: 'lnx07-denied', title: '修好 Permission denied，而不是 chmod 777', machine: 'app',
        statement: '隊友 ren 在 webops 群組裡，執行 `sudo -u ren cat /srv/app/settings.json` 時得到 Permission denied。設定檔的擁有者是你（learner），群組是 webops。請只讓 webops 的成員多出讀取權限：擁有者維持可讀寫，其他人仍然什麼都不能做，任何人都不能多出寫入或執行；擁有者與群組也不要改。最後執行 `sudo -u ren cat /srv/app/settings.json`，確認 ren 讀得到。',
        checks: [
          { kind: 'mode', path: '/srv/app/settings.json', mode: 0o640 },
          { kind: 'owner', path: '/srv/app/settings.json', owner: 'learner', group: 'webops' },
          { kind: 'output' },
        ],
        solution: ['ls -l /srv/app/settings.json', 'id ren', 'chmod g+r /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'],
        mistakes: [
          { commands: ['chmod 777 /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'], why: 'ren 讀得到了，但 guest 和其他每個帳號也能讀、改這份設定，還能把它當成程式執行。' },
          { commands: ['chmod o+r /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'], why: 'ren 是 webops 的成員，套用的是群組那一組，不是其他人；群組仍是 `---`，所以 ren 依然被拒絕，反而讓 guest 讀得到了。' },
          { commands: ['chmod 644 /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'], why: 'ren 讀得到了，但其他人也能讀；題目要其他人什麼都不能做。' },
          { commands: ['chmod g+rw /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'], why: '群組多了寫入權限（660），ren 能改設定；題目只要讀取。' },
          { commands: ['sudo chown ren /srv/app/settings.json', 'sudo -u ren cat /srv/app/settings.json'], why: '把檔案送給 ren 確實讓他讀得到，但擁有者變了，learner 反而成了群組成員，只剩群組的 `---`。' },
        ],
        variants: [
          { label: '另一份設定檔', files: [file('/srv/app/settings.json', '{"port": 9090, "log": "debug", "cache": true}\n', 'learner', 0o600, 'webops')] },
        ],
        hints: [
          '用 `ls -l /srv/app/settings.json` 與 `id ren` 判斷 ren 套用的是哪一組權限。',
          'ren 不是擁有者，但在檔案的群組裡，所以只看群組那三個字元。',
          '只替群組加上 r：`chmod g+r`，或用八進位寫出 `rw-r-----`。',
        ],
        explanation: '檔案原本是 `rw------- learner webops`。ren 不是擁有者，但在 webops 裡，核心只看群組的 `---`，所以被拒絕；就算其他人有 r 也輪不到他。`chmod g+r` 讓權限成為 `rw-r-----`（640），ren 讀得到，guest 仍然不行。`chmod o+r` 加錯了組；`777`、`644` 與 `g+rw` 都給了不需要的權限；`chown` 則改掉了不該改的擁有者。',
      },
      {
        id: 'lnx07-umask', title: '讓新檔案預設是 640', machine: 'audit',
        statement: '稽核資料不能讓其他人看到。請設定這個工作階段的 umask，讓之後建立的檔案是 `rw-r-----`（640）、目錄是 `rwxr-x---`（750）；然後在家目錄建立目錄 `audit`，再在裡面建立空檔案 `audit/today.log`。不要事後用 chmod 修改它們。',
        checks: [
          { kind: 'umask', umask: 0o027 },
          { kind: 'mode', path: `${HOME}/audit`, mode: 0o750 },
          { kind: 'mode', path: `${HOME}/audit/today.log`, mode: 0o640 },
        ],
        solution: ['umask', 'umask 027', 'mkdir audit', 'touch audit/today.log', 'ls -ld audit audit/today.log'],
        mistakes: [
          { commands: ['umask 640', 'mkdir audit', 'touch audit/today.log'], why: 'umask 是要拿掉的位元，不是想要的權限：`umask 640` 讓新目錄成為 `--x-wxrwx`，learner 連在裡面建立檔案都不行。' },
          { commands: ['umask 037', 'mkdir audit', 'touch audit/today.log'], why: '檔案確實是 640，但目錄是 740：群組有 r 沒有 x，成員能看到檔名卻進不去。' },
          { commands: ['umask 077', 'mkdir audit', 'touch audit/today.log'], why: '連群組的讀取權限也拿掉了，檔案是 600、目錄是 700。' },
          { commands: ['mkdir audit', 'touch audit/today.log', 'chmod 750 audit', 'chmod 640 audit/today.log'], why: '這兩個項目對了，但 umask 仍是 022，之後的新檔案還是 644，其他人看得到。' },
        ],
        hints: [
          '新檔案從 666、新目錄從 777 開始，再拿掉 umask 裡的位元。',
          '要拿掉的是：群組的 w（2），以及其他人的 r、w、x（7）。',
          'umask 要在建立檔案之前設定。',
        ],
        explanation: '`umask 027` 拿掉群組的 w 與其他人的全部：檔案 666 去掉 027 是 640，目錄 777 去掉 027 是 750。符號寫法 `umask u=rwx,g=rx,o=` 描述的是要保留的權限，效果相同。`umask 640` 把遮罩當成權限寫，結果幾乎相反；`037` 讓目錄少了群組的 x；事後 chmod 只修好眼前兩個項目，不改變之後的預設。',
      },
    ],
  },
};
