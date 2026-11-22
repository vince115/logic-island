import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX06 Users and Groups (LNX-2). A terminal lesson on the users profile (engine stage E3): users, groups, UID and GID
 * (root 0, system accounts below 1000, ordinary users from 1000, as login.defs sets them), the fields of /etc/passwd and
 * /etc/group and why the hashes live in /etc/shadow, primary and supplementary groups, useradd (-m, -s, -G, -r) and
 * groupadd, usermod -aG versus the -G that drops every other group, why a new group needs a new login (newgrp), root
 * versus sudo, and service accounts with a nologin shell. One application server for the transcripts and one small
 * machine per exercise; host names, users and files are made up. Every transcript output was produced by replaying it
 * on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...(group ? { group } : {}) });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...(group ? { group } : {}) });
const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
/** /etc with the skeleton every useradd -m copies into a new home. */
const ETC = [dir('/etc'), dir('/etc/skel'), file('/etc/skel/.bashrc', '# ~/.bashrc\nalias ll="ls -l"\n')];
const LOGIN_DEFS = '# /etc/login.defs（節錄）\nUID_MIN                  1000\nUID_MAX                 60000\n#SYS_UID_MIN              100\n#SYS_UID_MAX              999\nGID_MIN                  1000\nGID_MAX                 60000\n';

/** The transcripts' server: learner (adm, sudo), mei in devs, the intern kai, and Redis running as its own account. */
const appMachine: TerminalMachine = {
  id: 'app', title: '應用程式主機 app-03', user: 'learner', host: 'app-03', cwd: HOME, profile: 'users',
  accounts: {
    users: [
      { name: 'mei', uid: 1001, comment: 'Mei Lin' },
      { name: 'kai', uid: 1002, comment: 'Kai Wu' },
      { name: 'redis', uid: 112, home: '/var/lib/redis', shell: NOLOGIN },
    ],
    groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }, { name: 'devs', gid: 1100, members: ['mei'] }],
  },
  files: [
    ...ETC,
    file('/etc/login.defs', LOGIN_DEFS),
    dir('/home'),
    dir(HOME, 'learner', 0o750),
    dir('/home/mei', 'mei', 0o750),
    file('/home/mei/notes.txt', '下週換 Redis 密碼\n', 'mei', 0o640),
    dir('/home/kai', 'kai', 0o750),
    dir('/srv'),
    dir('/srv/app', 'root', 0o775, 'devs'),
    file('/srv/app/release.txt', 'v1.4.2\n', 'mei', 0o664, 'devs'),
    dir('/var'),
    dir('/var/lib'),
    dir('/var/lib/redis', 'redis', 0o750),
    file('/var/lib/redis/dump.rdb', 'REDIS0011\n', 'redis', 0o660),
  ],
};

/** Exercise 1: a deployment host whose site folder belongs to the web group. */
const ciMachine: TerminalMachine = {
  id: 'ci', title: '部署主機 ci-01', user: 'learner', host: 'ci-01', cwd: HOME, profile: 'users',
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'web', gid: 1100 }] },
  files: [
    ...ETC,
    dir('/home'),
    dir(HOME, 'learner', 0o750),
    dir('/srv'),
    dir('/srv/site', 'root', 0o775, 'web'),
    file('/srv/site/index.html', '<h1>ci-01</h1>\n', 'root', 0o664, 'web'),
  ],
};

/** Exercise 2: nina works in devs and now also helps the testers in qa. */
const devMachine: TerminalMachine = {
  id: 'dev', title: '開發主機 dev-02', user: 'learner', host: 'dev-02', cwd: HOME, profile: 'users',
  accounts: {
    users: [{ name: 'nina', uid: 1001, comment: 'Nina Ho' }],
    groups: [{ name: 'sudo', members: ['learner'] }, { name: 'devs', gid: 1100, members: ['nina'] }, { name: 'qa', gid: 1101 }],
  },
  files: [
    dir('/home'),
    dir(HOME, 'learner', 0o750),
    dir('/home/nina', 'nina', 0o750),
    dir('/srv'),
    dir('/srv/dev', 'root', 0o770, 'devs'),
    file('/srv/dev/roadmap.txt', '12 月：結帳流程改版\n', 'nina', 0o660, 'devs'),
    dir('/srv/qa', 'root', 0o770, 'qa'),
    file('/srv/qa/test-plan.txt', '結帳流程：12 個測試案例\n', 'root', 0o660, 'qa'),
  ],
};

/** Exercise 3: application logs that only root and the adm group may read. */
const logMachine: TerminalMachine = {
  id: 'log', title: '日誌主機 log-01', user: 'learner', host: 'log-01', cwd: HOME, profile: 'users',
  accounts: { groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }] },
  files: [
    ...ETC,
    dir('/home'),
    dir(HOME, 'learner', 0o750),
    dir('/var'),
    dir('/var/log'),
    dir('/var/log/app', 'root', 0o750, 'adm'),
    file('/var/log/app/app.log', '2026-11-22 09:00:01 INFO server started\n2026-11-22 09:14:52 WARN slow query 1.8s\n', 'root', 0o640, 'adm'),
  ],
};

/** Exercise 4: an upload folder written by the web server (www-data) and, by hand, by others. */
const UPLOADS = '/srv/shop/uploads';
const shopMachine: TerminalMachine = {
  id: 'shop', title: '網路商店 web-07', user: 'learner', host: 'web-07', cwd: HOME, profile: 'users',
  accounts: { users: [{ name: 'deploy', uid: 1001 }] },
  files: [
    dir('/home'),
    dir(HOME, 'learner', 0o750),
    dir('/home/deploy', 'deploy', 0o750),
    dir('/srv'),
    dir('/srv/shop'),
    dir(UPLOADS, 'www-data', 0o755, 'www-data'),
    file(`${UPLOADS}/avatar-17.png`, 'PNG avatar 17\n', 'www-data', 0o644, 'www-data'),
    file(`${UPLOADS}/banner-sale.jpg`, 'JPEG banner\n', 'deploy', 0o644),
    file(`${UPLOADS}/invoice-0042.pdf`, '%PDF-1.7 invoice 0042\n', 'www-data', 0o644, 'www-data'),
    file(`${UPLOADS}/size-chart.pdf`, '%PDF-1.7 size chart\n', 'deploy', 0o644),
  ],
};

export const LNX06: LessonContent = {
  lessonId: 'LNX06',
  motivation: '團隊來了一位新同事、網站要多一個部署帳號、新主機要裝一套 Redis：每一件事都從「誰可以做什麼」開始。Linux 用使用者與群組回答這個問題：每個程式都以某個使用者的身分執行，每個檔案都屬於某個使用者與某個群組，權限檢查看的就是這些身分。帳號開錯了，輕則新同事打不開共用目錄，重則一個被入侵的網站程式就能讀遍整台主機。本課在模擬主機 app-03 上看懂帳號存在哪裡，用 useradd、usermod 與 groupadd 建立與調整帳號，分清 root 與 sudo，並說明為什麼每個服務都該有自己的帳號。',
  sections: [
    {
      id: 'lnx06-s-ids', title: '使用者、群組與 UID／GID',
      blocks: [
        { type: 'p', text: 'Linux 是多使用者系統：同一台主機上可以同時有好幾個人登入，背景還有許多服務在執行。每個使用者有一個名稱和一個數字 UID（user ID），每個群組有一個名稱和一個數字 GID（group ID）。核心只認數字：行程帶著 UID 與 GID 執行，檔案系統也以 UID、GID 記錄每個檔案的擁有者與群組；名稱是給人看的，由 `ls -l`、`id` 這些工具查表換成文字。' },
        { type: 'p', text: '每個使用者有一個主要群組（primary group），他建立的新檔案預設屬於這個群組；此外可以加入任意多個附加群組（supplementary group），用來共用目錄或取得某種能力，例如 Ubuntu 上 `sudo` 群組的成員可以使用 sudo、`adm` 群組的成員可以讀系統日誌。Debian、Ubuntu、RHEL 建立使用者時，預設會同時建立一個同名、只有他一個人的群組當作主要群組（user private group），所以 mei 的主要群組通常就叫 `mei`。' },
        { type: 'table', head: ['UID', '用途', '例子'], rows: [
          ['0', 'root，系統管理者；核心對 UID 0 幾乎不做權限檢查', 'root'],
          ['1–999', '系統帳號：作業系統與套件為服務建立的帳號（Debian 上 0–99 由基本系統固定分配，100–999 在安裝套件時動態分配）', 'daemon（1）、www-data（33）、redis（112）'],
          ['1000–60000', '一般使用者：人類的帳號，第一個建立的通常是 1000', 'learner（1000）、mei（1001）'],
          ['65534', 'nobody：刻意不擁有任何檔案的身分', 'nobody'],
        ] },
        { type: 'p', text: '這些界線是常見的預設，不是核心的規定。它們寫在 `/etc/login.defs`：`UID_MIN`、`UID_MAX` 是一般使用者的範圍，`SYS_UID_MIN`、`SYS_UID_MAX` 是系統帳號的範圍（群組是對應的 `GID_MIN` 等設定），`useradd` 依此挑選新的號碼。Debian 的檔案把 `SYS_UID_MIN`、`SYS_UID_MAX` 註解掉，表示使用內建的 100 與 999。Debian、Ubuntu 與 RHEL 7 之後的系統都從 1000 開始分配一般使用者；更早的紅帽系統是從 500 開始，在舊主機上看到 UID 500 的人類帳號並不奇怪。' },
        { type: 'p', text: '`id` 印出目前工作階段的 UID、主要群組（gid）與所有群組（groups）；後面加上名稱就改查那個使用者。`-u`、`-g`、`-G` 只印其中一種號碼，再加 `-n` 改印名稱。`groups` 只列出群組名稱，`whoami` 只印使用者名稱。下面的紀錄在 app-03 上查自己、同事 mei、服務帳號 redis 與 root，最後看 login.defs 裡的範圍。' },
        { type: 'example', id: 'lnx06-who' },
        { type: 'callout', tone: 'note', title: '名稱可以換，號碼才是身分', text: '檔案記錄的是 UID，不是名稱。刪除一個帳號後再用同一個 UID 建立另一個人，新帳號就會「繼承」舊帳號留下的所有檔案；反過來，兩台主機上同名的使用者如果 UID 不同，透過 NFS 共用或從備份還原檔案時，擁有者就會對不上。在多台主機之間共用檔案時，同一個人的 UID 要保持一致。' },
      ],
    },
    {
      id: 'lnx06-s-files', title: '帳號資料：/etc/passwd、/etc/group 與 /etc/shadow',
      blocks: [
        { type: 'p', text: '使用者的資料存在 `/etc/passwd`，一行一個帳號，七個欄位以 `:` 分隔。名稱雖然叫 passwd，裡面早就沒有密碼了：第二欄的 `x` 表示密碼存在 `/etc/shadow`。' },
        { type: 'table', head: ['欄', '內容', 'mei 的那一行'], rows: [
          ['1', '使用者名稱', '`mei`'],
          ['2', '密碼欄；`x` 表示請看 /etc/shadow', '`x`'],
          ['3', 'UID', '`1001`'],
          ['4', '主要群組的 GID', '`1001`'],
          ['5', '說明（GECOS 欄），通常放全名', '`Mei Lin`'],
          ['6', '家目錄', '`/home/mei`'],
          ['7', '登入 shell', '`/bin/bash`'],
        ] },
        { type: 'p', text: '`/etc/group` 一行一個群組，四個欄位：群組名稱、密碼欄（`x`，群組密碼很少使用）、GID，以及以逗號分隔的成員清單。最後一欄只列出把它當作附加群組的人：主要群組記在 /etc/passwd 的第四欄，所以 `mei` 這個群組那一行的成員是空的。想知道某人完整的群組，請用 `id 名稱` 或 `groups 名稱`，它們會把兩個檔案的資料合起來。' },
        { type: 'p', text: '為什麼密碼要另外放？`/etc/passwd` 必須讓每個人都能讀：`ls -l` 要把 UID 換成名稱、`id` 要查群組、登入程式要找家目錄與 shell，所以它的權限是 644。早期的 Unix 把密碼雜湊放在第二欄，任何使用者都能把雜湊複製回去，離線慢慢猜。shadow 機制把雜湊與密碼期限搬到 `/etc/shadow`，只有 root 與 `shadow` 群組讀得到（Debian、Ubuntu 是 640 root:shadow）。shadow 的第二欄是 `!` 或 `*` 時，表示這個帳號不能用密碼登入；模擬環境的帳號都沒有密碼，所以只會看到這兩種。' },
        { type: 'example', id: 'lnx06-passwd' },
        { type: 'callout', tone: 'warning', title: '不要用編輯器直接加帳號', text: '常見的誤會是「帳號就是 /etc/passwd 的一行，用編輯器加一行就好」。手動編輯很容易打錯欄位、忘了 /etc/shadow 與 /etc/group 也要一起改，其他程式同時修改時還會互相覆蓋；少一個冒號就可能讓帳號無法登入。請用 `useradd`、`usermod`、`groupadd`：它們會先鎖定檔案、檢查名稱與號碼，再一次更新所有相關的檔案；真的要手動修改時，用會鎖定檔案並檢查格式的 `vipw` 與 `vigr`。模擬環境的帳號檔是由帳號資料產生的，直接寫進去的內容會在下一次帳號變更時被覆寫。' },
      ],
    },
    {
      id: 'lnx06-s-useradd', title: '建立帳號：useradd 與 groupadd',
      blocks: [
        { type: 'p', text: '`useradd` 建立使用者，只有 root 能執行；一般使用者會看到 `Permission denied` 與無法鎖定 /etc/passwd 的訊息，所以平常寫成 `sudo useradd …`。它的預設值常讓人意外：在 Debian 與 Ubuntu 上，不加 `-m` 就不會建立家目錄（/etc/passwd 裡仍然寫著 /home/名稱），登入 shell 預設是 `/bin/sh`。RHEL、Fedora 的 login.defs 設定了 `CREATE_HOME yes`，預設就會建立家目錄；寫在腳本裡時把選項明確寫出來，在每個發行版上結果都一樣。' },
        { type: 'table', head: ['選項', '作用'], rows: [
          ['`-m`', '建立家目錄，並從 `/etc/skel` 複製預設的設定檔（例如 `.bashrc`）'],
          ['`-s /bin/bash`', '指定登入 shell'],
          ['`-G devs,ops`', '附加群組，以逗號分隔，群組必須已經存在'],
          ['`-g 群組`', '指定主要群組（不加時建立一個同名的私人群組）'],
          ['`-r`', '系統帳號：UID 從 999 往下找第一個空號，而且不建立家目錄'],
          ['`-c "Mei Lin"`', '說明欄'],
          ['`-u 1500`', '指定 UID（不加時是一般使用者中最大的號碼加一）'],
        ] },
        { type: 'p', text: '`groupadd 名稱` 建立群組，GID 同樣依 login.defs 的範圍挑選，`-r` 建立系統群組。下面的紀錄先示範沒有 sudo 時的錯誤，再替新同事 ben 建立有家目錄、使用 bash、加入 devs 的帳號：`sudo ls -la` 看得到從 /etc/skel 複製來的 `.bashrc`，以及 Ubuntu 21.04 起預設的 750 家目錄（擁有者與同群組以外的人進不去）。最後建立一個群組 ops，以及一個給監控程式用的系統帳號 exporter，它的 UID 是 999。' },
        { type: 'example', id: 'lnx06-create' },
        { type: 'callout', tone: 'tip', title: 'Debian 的 adduser', text: 'Debian 與 Ubuntu 另外提供 `adduser`，它是互動式的包裝程式：會建立家目錄、詢問全名並要求設定密碼，適合手動建立人類使用者。`useradd` 是各發行版都有的底層工具，行為完全由選項決定，適合寫進腳本與自動化設定。模擬環境只支援 `useradd`，設定密碼的 `passwd` 也不在模擬範圍內。' },
      ],
    },
    {
      id: 'lnx06-s-usermod', title: '修改群組：usermod -aG 與重新登入',
      blocks: [
        { type: 'p', text: '`usermod` 修改已經存在的帳號，選項大多和 useradd 相同：`-s` 改 shell、`-c` 改說明、`-g` 改主要群組、`-G` 設定附加群組。最常做的事是把人加進一個群組，正確的寫法是 `sudo usermod -aG 群組 使用者`：`-a`（append）表示把清單附加到原有的附加群組後面。' },
        { type: 'p', text: '`-G` 單獨使用的意思是「附加群組就是這份清單」，清單以外的附加群組全部移除。這是管理者最常犯的錯之一：想把自己加進 devs 群組，打成 `usermod -G devs learner`，結果把自己從 sudo 群組移除了。`-a` 只能和 `-G` 一起使用。' },
        { type: 'table', head: ['指令', 'mei 原本的附加群組', '執行之後'], rows: [
          ['`usermod -aG ops mei`', 'devs', 'devs、ops'],
          ['`usermod -G ops mei`', 'devs', '只剩 ops，離開了 devs'],
          ['`usermod -G devs,ops mei`', 'devs', 'devs、ops（完整列出每一個群組也可以）'],
          ['`usermod -g ops mei`', 'devs', '主要群組換成 ops，附加群組仍是 devs'],
        ] },
        { type: 'p', text: '群組加好了，`id` 卻還看不到它，這也是正常的。登入時，系統讀一次帳號資料，把群組清單交給登入的 Shell，之後從這個 Shell 啟動的每個程式都繼承同一份清單；`usermod` 只改了帳號資料，不會改到已經在執行的行程。所以 `id learner`（查帳號資料）已經有 devs，`id`（看目前的工作階段）還沒有，寫入 devs 的目錄也仍然被拒絕。登出再登入就會生效；不想登出時，`newgrp devs` 會啟動一個以 devs 為主要群組、重新讀取群組清單的新 Shell，在裡面建立的檔案也會屬於 devs。' },
        { type: 'example', id: 'lnx06-groups' },
        { type: 'callout', tone: 'warning', title: '少了 -a，就少了 sudo', text: '`sudo usermod -G devs learner` 不會印出任何錯誤，這個工作階段的 sudo 也還能用（群組清單在登入時就決定了），所以當下完全看不出問題。等到下一次登入，learner 已經不在 sudo 群組裡，sudo 只會回答 not in the sudoers file，要靠其他管理者或救援模式才修得回來。修改群組之後，立刻用 `id 使用者` 檢查完整的清單，而不是只看新群組有沒有出現；發現少了 sudo 時，趁還開著的工作階段用 `sudo usermod -aG sudo learner` 加回去。' },
      ],
    },
    {
      id: 'lnx06-s-sudo', title: 'root 與 sudo',
      blocks: [
        { type: 'p', text: 'root（UID 0）是系統的管理者：可以讀寫任何檔案、修改任何帳號、停止任何服務。也正因如此，平常不該以 root 的身分工作：打錯一個路徑、執行一個有問題的腳本，就可能毀掉整台主機。Ubuntu 預設鎖住 root 的密碼，不能直接以 root 登入，管理工作都透過 `sudo` 完成。' },
        { type: 'p', text: '`sudo 指令` 以 root 的身分執行一個指令，`sudo -u 使用者 指令` 則以指定的使用者執行。誰可以使用 sudo 由 `/etc/sudoers` 決定（要用會先檢查語法的 `visudo` 編輯）。發行版的預設規則讓某個群組的成員可以執行任何指令：Debian、Ubuntu 是 `sudo` 群組，RHEL、Fedora 是 `wheel` 群組，所以「給某人管理權限」通常就是把他加進這個群組。sudo 要求的是你自己的密碼，不是 root 的密碼；每一次使用都會寫進系統日誌（Debian、Ubuntu 是 `/var/log/auth.log`），事後查得到誰在什麼時候執行了什麼。' },
        { type: 'p', text: '不在 sudoers 裡的人執行 sudo，會看到 `使用者 is not in the sudoers file.  This incident will be reported.`，指令不會執行，這次嘗試也會被記錄下來。模擬環境不詢問密碼，也不支援 `su` 與編輯 sudoers；判斷的規則就是上面的預設：root 本身，或工作階段的群組裡有 sudo 或 wheel。' },
        { type: 'p', text: '有兩件事 sudo 做不到。第一，`cd`、`umask` 這類 Shell 的內建指令不是獨立的程式，sudo 找不到它們（`sudo: cd: command not found`）。第二，重新導向是你自己的 Shell 在啟動 sudo 之前處理的：`sudo echo x > /etc/motd` 裡開啟 /etc/motd 的是一般使用者，所以仍然是 Permission denied。要以 root 寫檔，就讓 root 執行的程式自己開檔，常見的寫法是 `echo x | sudo tee /etc/motd`（`tee` 把輸入寫進檔案，同時印在畫面上）。' },
        { type: 'example', id: 'lnx06-sudo' },
        { type: 'table', head: ['做法', '輸入誰的密碼', '留下的紀錄', '風險'], rows: [
          ['直接以 root 登入工作', 'root 的', '只知道「root」做了事', '每個指令都有最高權限，打錯就是整台主機的錯'],
          ['`sudo 指令`', '自己的', '哪個使用者在何時執行了哪個指令', '只有需要的那一個指令以 root 執行'],
          ['`sudo -u 服務帳號 指令`', '自己的', '同上', '以服務的權限試試它能讀寫什麼'],
        ] },
      ],
    },
    {
      id: 'lnx06-s-service', title: '服務帳號：每個服務一個沒有特權的帳號',
      blocks: [
        { type: 'p', text: '網站伺服器、資料庫、快取這些服務長時間在背景執行，而且大多直接面對網路，是最常被攻擊的部分。如果服務以 root 執行，任何一個漏洞都等於把整台主機交出去。所以慣例是替每個服務建立專屬的服務帳號，只讓它擁有工作需要的檔案，這就是最小權限原則：在 Debian、Ubuntu 上，nginx 與 Apache 處理請求的工作行程以 `www-data` 執行，PostgreSQL 以 `postgres`、Redis 以 `redis` 執行。' },
        { type: 'p', text: '服務帳號有幾個共同的特徵：UID 在系統帳號的範圍（1000 以下），以 `useradd -r` 建立；登入 shell 是 `/usr/sbin/nologin`，有人想用它登入時只會看到 `This account is currently not available.` 然後被斷線；通常沒有 /home 底下的家目錄，資料放在 `/var/lib/服務名稱` 這類位置，而且只有它自己能讀寫。每個服務各用一個帳號，Redis 被入侵時，攻擊者也碰不到資料庫的檔案。' },
        { type: 'p', text: '上一段紀錄的最後幾步就在驗證這件事：`grep nologin` 列出所有不能登入的帳號；以 `sudo -u redis` 執行時，讀得到 redis 自己的 `/var/lib/redis`，卻讀不到 mei 的筆記，也不能在 `/srv/app` 建立檔案。之後學 systemd 時會看到，服務的設定檔以 `User=` 與 `Group=` 指定它以哪個帳號執行。' },
        { type: 'table', head: ['做法', '服務被入侵時'], rows: [
          ['以 root 執行', '攻擊者就是 root：讀得到 /etc/shadow、能新增帳號、植入開機後門，整台主機都不能再信任'],
          ['所有服務共用一個帳號', '攻擊者拿到每一個服務的檔案，例如從網站一路讀到資料庫的資料'],
          ['每個服務一個系統帳號，shell 是 nologin', '攻擊者只拿到這個服務自己的檔案；這個帳號不能登入，也不在 sudo 群組'],
        ] },
        { type: 'callout', tone: 'tip', title: '服務需要更多權限時，給剛好的群組', text: '服務帳號不需要、也不應該加入 sudo 或 wheel：這兩個群組等於 root 權限，最小權限就失去了意義。服務需要讀某個資源時，加入剛好能讀它的群組；例如在 Debian、Ubuntu 上，`/var/log` 底下許多日誌屬於 `adm` 群組，日誌轉送程式加入 adm 就讀得到，卻仍然不能修改系統。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx06-q1', prompt: '`/etc/passwd` 裡有一行 `mei:x:1001:1001:Mei Lin:/home/mei:/bin/bash`。第三欄的 `1001` 是什麼？',
      options: ['登入 shell 的版本', '主要群組的 GID', '使用者的 UID', '密碼雜湊的長度'],
      answer: 2,
      explanation: '七個欄位依序是名稱、密碼欄、UID、GID、說明、家目錄與 shell，所以第三欄是 UID。主要群組的 GID 在第四欄（這裡剛好也是 1001，因為 useradd 建立私人群組時，號碼沒被占用就讓 GID 等於 UID）；shell 在最後一欄，而且只是路徑，沒有版本；密碼雜湊不在 passwd 裡，第二欄的 x 表示它存在 /etc/shadow。',
    },
    {
      id: 'lnx06-q2', prompt: '為什麼現代 Linux 把密碼雜湊放在 `/etc/shadow`，而不是 `/etc/passwd`？',
      options: [
        '`/etc/passwd` 必須讓每個人都能讀（例如 `ls -l` 要把 UID 換成名稱），雜湊放在只有 root 與 shadow 群組能讀的檔案，才不會被一般使用者拿去離線破解',
        '因為 `/etc/passwd` 只能存放 1000 以上的帳號',
        '因為 `/etc/shadow` 會把密碼以明文保存，登入比較快',
        '因為 `/etc/passwd` 第二欄的 `x` 表示帳號已經被刪除',
      ],
      answer: 0,
      explanation: '許多程式需要查名稱與 UID 的對應，所以 /etc/passwd 一定是所有人可讀的 644；把雜湊搬到權限 640（root:shadow）的 /etc/shadow，一般使用者就拿不到。/etc/passwd 存放所有帳號，包括 root 與系統帳號；shadow 存的是雜湊，從來不是明文；第二欄的 x 只是「密碼請看 shadow」，帳號並沒有被刪除。',
    },
    {
      id: 'lnx06-q3', prompt: 'mei 目前的附加群組是 devs 與 ops。管理者執行 `sudo usermod -G qa mei` 之後，mei 的附加群組是什麼？',
      options: ['devs、ops、qa', '沒有變化：`-G` 一定要和 `-a` 一起用，否則是錯誤', '主要群組變成 qa，附加群組仍是 devs、ops', '只剩 qa：mei 離開了 devs 與 ops'],
      answer: 3,
      explanation: '沒有 -a 的 -G 表示「附加群組就是這份清單」，所以 devs 與 ops 都被移除，只剩 qa，而且沒有任何錯誤訊息。要保留原來的群組必須寫 -aG；反過來 -a 才需要搭配 -G，-G 單獨使用是合法的；改主要群組的是小寫的 -g，不是 -G。',
    },
    {
      id: 'lnx06-q4', prompt: 'learner 剛執行 `sudo usermod -aG devs learner`，接著執行 `id`，輸出裡卻沒有 devs。最可能的原因是什麼？',
      options: [
        '`usermod` 失敗了，要再執行一次',
        '群組清單在登入時決定，目前的工作階段還是舊的清單；重新登入或執行 `newgrp devs` 之後才會出現',
        '`id` 只會顯示主要群組',
        'devs 群組不存在，`usermod` 自動略過了它',
      ],
      answer: 1,
      explanation: 'usermod 只修改帳號資料，已經在執行的 Shell 仍帶著登入時的群組清單；`id learner` 查的是資料，已經看得到 devs。usermod 成功時本來就不印任何訊息，再執行一次也不會改變工作階段；`id` 會列出所有群組，不只主要群組；群組不存在時 usermod 會印出 group does not exist 並且不做任何修改，不會默默略過。',
    },
    {
      id: 'lnx06-q5', prompt: '在 Ubuntu 的預設設定下，關於 UID 哪一句正確？',
      options: [
        'root 是 0；系統帳號在 1000 以下；一般使用者從 1000 開始，這些範圍由 `/etc/login.defs` 設定',
        '一般使用者從 0 開始編號，root 是最後一個',
        'UID 是由使用者名稱算出來的雜湊值，所以同名的帳號 UID 一定相同',
        '系統帳號的 UID 都大於 60000，避免和一般使用者衝突',
      ],
      answer: 0,
      explanation: 'UID 0 永遠是 root；Ubuntu 的 login.defs 讓一般使用者從 UID_MIN 1000 開始，系統帳號使用 100–999（0–99 由基本系統固定分配）。0 是 root 專用，不會分給一般使用者；UID 是 useradd 依序挑選的號碼，和名稱無關，兩台主機上的同名帳號可能有不同的 UID；60000 以上不是系統帳號的範圍，65534 是特別的 nobody。',
    },
    {
      id: 'lnx06-q6', prompt: '為什麼 Redis 這類服務要以自己的帳號 `redis`（shell 是 `/usr/sbin/nologin`）執行，而不是以 root 執行？',
      options: [
        '因為 root 不能監聽網路連接埠',
        '因為 nologin 讓服務執行得比較快',
        '因為只有 UID 小於 1000 的帳號才能在背景執行',
        '服務被入侵時，攻擊者只拿到這個沒有特權、不能登入的帳號，碰不到其他使用者的檔案與系統設定',
      ],
      answer: 3,
      explanation: '這是最小權限原則：服務帳號只擁有自己的資料目錄，就算服務有漏洞，損害也限制在那個帳號能碰到的範圍；nologin 讓沒有人能用它登入互動式的 Shell。root 什麼連接埠都能監聽，連 1024 以下的特權連接埠也可以；shell 和服務的速度無關；任何 UID 的程式都可以在背景執行，系統帳號的範圍只是慣例。',
    },
    {
      id: 'lnx06-q7', prompt: '實習生 kai 不在 sudo 群組裡。他在 Ubuntu 上執行 `sudo cat /etc/shadow` 會怎樣？',
      options: [
        '以 root 的身分印出 /etc/shadow',
        '印出 `kai is not in the sudoers file.  This incident will be reported.`，指令不會執行',
        '要求輸入 root 的密碼，輸入正確就執行',
        '自動把 kai 加進 sudo 群組再執行',
      ],
      answer: 1,
      explanation: '能不能用 sudo 由 sudoers 決定，Ubuntu 的預設規則只允許 sudo 群組的成員，所以 kai 被拒絕，這次嘗試還會被記錄。只有 sudoers 允許的人才能以 root 執行指令；sudo 要的是使用者自己的密碼，不是 root 的密碼，而且密碼也不能讓不在 sudoers 的人通過；sudo 從不修改帳號或群組。',
    },
    {
      id: 'lnx06-q8', prompt: 'learner 在 sudo 群組裡，執行 `sudo echo hi > /etc/motd` 卻得到 Permission denied。原因是什麼？',
      options: [
        '`echo` 不能透過 sudo 執行',
        '/etc/motd 不存在，所以無法寫入',
        '重新導向由 learner 自己的 Shell 在啟動 sudo 之前處理，開檔的是一般使用者；要改寫成 `echo hi | sudo tee /etc/motd`',
        'sudo 的權限只在一天的上班時間內有效',
      ],
      answer: 2,
      explanation: '`>` 是 Shell 的功能，Shell 先以 learner 的身分開啟 /etc/motd，失敗後 sudo 根本沒有執行；改用 tee 時，開檔的是以 root 執行的 tee。echo 是一般的指令，sudo echo 可以執行，只是對寫檔沒有幫助；檔案不存在時重新導向會建立它，只要目錄可寫，這裡失敗是因為 /etc 只有 root 能寫；sudoers 的預設規則沒有時間限制。',
    },
  ],
  terminal: {
    machines: [appMachine, ciMachine, devMachine, logMachine, shopMachine],
    examples: [
      {
        id: 'lnx06-who', title: '我是誰、屬於哪些群組', machine: 'app',
        description: '`id` 看目前的工作階段，`id 名稱` 查別人；`-u`、`-Gn` 只印一種資料；服務帳號 redis 的 UID 小於 1000，root 是 0；一般與系統帳號的範圍寫在 /etc/login.defs。',
        steps: [
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),4(adm),27(sudo)' },
          { command: 'groups', output: 'learner adm sudo' },
          { command: 'id mei', output: 'uid=1001(mei) gid=1001(mei) groups=1001(mei),1100(devs)' },
          { command: 'id -u mei', output: '1001' },
          { command: 'id -Gn mei', output: 'mei devs' },
          { command: 'id redis', output: 'uid=112(redis) gid=112(redis) groups=112(redis)' },
          { command: 'id root', output: 'uid=0(root) gid=0(root) groups=0(root)' },
          { command: 'grep _MIN /etc/login.defs', output: 'UID_MIN                  1000\n#SYS_UID_MIN              100\nGID_MIN                  1000' },
        ],
      },
      {
        id: 'lnx06-passwd', title: '讀帳號檔', machine: 'app',
        description: '/etc/passwd 七個欄位，`cut` 取出名稱、UID、GID 與 shell；/etc/group 的最後一欄是附加成員；/etc/shadow 只有 root 與 shadow 群組能讀。',
        steps: [
          { command: 'grep mei /etc/passwd', output: 'mei:x:1001:1001:Mei Lin:/home/mei:/bin/bash' },
          { command: 'cut -d : -f 1,3,4,7 /etc/passwd', output: 'root:0:0:/bin/bash\ndaemon:1:1:/usr/sbin/nologin\nbin:2:2:/usr/sbin/nologin\nsys:3:3:/usr/sbin/nologin\nwww-data:33:33:/usr/sbin/nologin\nnobody:65534:65534:/usr/sbin/nologin\nlearner:1000:1000:/bin/bash\nmei:1001:1001:/bin/bash\nkai:1002:1002:/bin/bash\nredis:112:112:/usr/sbin/nologin' },
          { command: 'grep devs /etc/group', output: 'devs:x:1100:mei' },
          { command: 'grep sudo /etc/group', output: 'sudo:x:27:learner' },
          { command: 'ls -l /etc', output: '-rw-r--r-- root    root      201 group\n-rw-r--r-- root    root      210 login.defs\n-rw-r--r-- root    root      448 passwd\n-rw-r----- root    shadow    268 shadow\ndrwxr-xr-x root    root     4096 skel/' },
          { command: 'cat /etc/shadow', output: 'cat: /etc/shadow: Permission denied' },
          { command: 'sudo grep mei /etc/shadow', output: 'mei:!:20000:0:99999:7:::' },
        ],
      },
      {
        id: 'lnx06-create', title: '建立使用者、群組與系統帳號', machine: 'app',
        description: '沒有 sudo 時 useradd 被拒絕；`-m -s -G` 建立有家目錄、使用 bash、加入 devs 的 ben；groupadd 建立 ops；`-r` 建立 UID 小於 1000、沒有家目錄的系統帳號。',
        steps: [
          { command: 'useradd ben', output: 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.' },
          { command: 'sudo useradd -m -s /bin/bash -G devs ben', output: '' },
          { command: 'id ben', output: 'uid=1003(ben) gid=1003(ben) groups=1003(ben),1100(devs)' },
          { command: 'grep ben /etc/passwd', output: 'ben:x:1003:1003::/home/ben:/bin/bash' },
          { command: 'sudo ls -la /home/ben', output: 'drwxr-x--- ben     ben      4096 .\ndrwxr-xr-x root    root     4096 ..\n-rw-r--r-- ben     ben        29 .bashrc' },
          { command: 'sudo groupadd ops', output: '' },
          { command: 'grep ops /etc/group', output: 'ops:x:1101:' },
          { command: 'sudo useradd -r -s /usr/sbin/nologin exporter', output: '' },
          { command: 'grep exporter /etc/passwd', output: 'exporter:x:999:999::/home/exporter:/usr/sbin/nologin' },
          { command: 'ls /home', output: 'ben/  kai/  learner/  mei/' },
        ],
      },
      {
        id: 'lnx06-groups', title: '-aG 與 -G，以及 newgrp', machine: 'app',
        description: '`-aG` 把 ops 附加給 mei；`-G` 單獨使用讓她離開 devs，再用 `-aG` 加回來。learner 加入 devs 之後，`id` 要等 `newgrp devs` 才看得到它，寫入 devs 的檔案也要等到那時候。',
        steps: [
          { command: 'sudo groupadd ops', output: '' },
          { command: 'sudo usermod -aG ops mei', output: '' },
          { command: 'id mei', output: 'uid=1001(mei) gid=1001(mei) groups=1001(mei),1100(devs),1101(ops)' },
          { command: 'sudo usermod -G ops mei', output: '' },
          { command: 'id mei', output: 'uid=1001(mei) gid=1001(mei) groups=1001(mei),1101(ops)' },
          { command: 'grep devs /etc/group', output: 'devs:x:1100:' },
          { command: 'sudo usermod -aG devs mei', output: '' },
          { command: 'groups mei', output: 'mei : mei devs ops' },
          { command: 'echo v1.5.0 > /srv/app/release.txt', output: 'bash: /srv/app/release.txt: Permission denied' },
          { command: 'sudo usermod -aG devs learner', output: '' },
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),4(adm),27(sudo)' },
          { command: 'id learner', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),4(adm),27(sudo),1100(devs)' },
          { command: 'newgrp devs', output: '' },
          { command: 'id', output: 'uid=1000(learner) gid=1100(devs) groups=1100(devs),1000(learner),4(adm),27(sudo)' },
          { command: 'echo v1.5.0 > /srv/app/release.txt', output: '' },
          { command: 'cat /srv/app/release.txt', output: 'v1.5.0' },
        ],
      },
      {
        id: 'lnx06-sudo', title: 'sudo 能做與不能做的事', machine: 'app',
        description: 'sudo 以 root 或 `-u` 指定的使用者執行；不在 sudo 群組的 kai 被拒絕；內建指令與重新導向不會變成 root 的；最後以服務帳號 redis 的身分看它能碰到什麼。',
        steps: [
          { command: 'sudo whoami', output: 'root' },
          { command: 'sudo -u kai whoami', output: 'kai' },
          { command: 'sudo -u kai sudo whoami', output: 'kai is not in the sudoers file.  This incident will be reported.' },
          { command: 'sudo cd /root', output: 'sudo: cd: command not found' },
          { command: 'sudo echo maintenance > /etc/motd', output: 'bash: /etc/motd: Permission denied' },
          { command: 'echo \'maintenance tonight\' | sudo tee /etc/motd', output: 'maintenance tonight' },
          { command: 'ls -l /etc/motd', output: '-rw-r--r-- root    root       20 /etc/motd' },
          { command: 'grep nologin /etc/passwd | cut -d : -f 1', output: 'daemon\nbin\nsys\nwww-data\nnobody\nredis' },
          { command: 'sudo -u redis ls /var/lib/redis', output: 'dump.rdb' },
          { command: 'sudo -u redis cat /home/mei/notes.txt', output: 'cat: /home/mei/notes.txt: Permission denied' },
          { command: 'sudo -u redis touch /srv/app/x', output: 'touch: cannot touch \'/srv/app/x\': Permission denied' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx06-deploy', title: '建立部署帳號', machine: 'ci',
        statement: '自動部署要用專屬的使用者 `deploy` 登入 ci-01，把網站檔案放進 `/srv/site`（屬於 `web` 群組，群組可寫）。請建立 `deploy`：要有家目錄 `/home/deploy`（之後放 SSH 金鑰與部署腳本）、登入 shell 是 `/bin/bash`、主要群組維持它自己的私人群組 `deploy`，並把它加入附加群組 `web`。',
        checks: [
          { kind: 'user', name: 'deploy', group: 'deploy', groups: ['web'], shell: '/bin/bash', home: '/home/deploy' },
          { kind: 'exists', path: '/home/deploy', type: 'dir' },
          { kind: 'owner', path: '/home/deploy', owner: 'deploy', group: 'deploy' },
        ],
        solution: ['sudo useradd -m -s /bin/bash -G web deploy', 'id deploy', 'sudo ls -la /home/deploy'],
        mistakes: [
          { commands: ['sudo useradd -G web deploy'], why: 'Debian、Ubuntu 的 useradd 不加 `-m` 就不建立家目錄，登入 shell 也是預設的 /bin/sh。' },
          { commands: ['sudo useradd -m -G web deploy'], why: '家目錄有了，但沒有 `-s /bin/bash`，登入 shell 是預設的 /bin/sh。' },
          { commands: ['sudo useradd -m -s /bin/bash deploy'], why: '沒有 `-G web`，deploy 不在 web 群組裡，寫不進 /srv/site。' },
          { commands: ['sudo useradd -m -s /bin/bash -g web deploy'], why: '小寫的 `-g` 把 web 設成主要群組，也不會建立 deploy 群組；題目要的是附加群組，要用大寫的 `-G`。' },
          { commands: ['useradd -m -s /bin/bash -G web deploy'], why: '建立帳號需要 root：沒有 sudo 只會得到 Permission denied，什麼都沒有建立。' },
        ],
        hints: [
          '建立帳號要 root，所以指令以 `sudo useradd` 開頭。',
          '`-m` 建立家目錄、`-s` 指定 shell、`-G` 指定附加群組；不加 `-g` 時，useradd 會建立同名的私人群組當主要群組。',
          '建好之後用 `id deploy` 確認群組。',
        ],
        explanation: '`sudo useradd -m -s /bin/bash -G web deploy` 一次完成：建立 UID 1001 的 deploy 與同名的私人群組，從 /etc/skel 複製出 750 的家目錄，shell 設為 bash，並把 web 列為附加群組。`id deploy` 應該印出 groups=1001(deploy),1100(web)。少了 -m 或 -s 時，Debian 系的預設值（沒有家目錄、/bin/sh）會悄悄生效；把 -G 打成 -g 則是換掉了主要群組。',
      },
      {
        id: 'lnx06-join-qa', title: '多加入一個群組', machine: 'dev',
        statement: 'nina 原本在 `devs` 群組裡，靠它讀寫 `/srv/dev`。這個月她也要支援測試，需要讀寫 `/srv/qa`（屬於 `qa` 群組）。請讓 nina 加入 `qa`，而且不能失去 `devs`，主要群組維持 `nina`。',
        checks: [{ kind: 'user', name: 'nina', group: 'nina', groups: ['devs', 'qa'] }],
        solution: ['id nina', 'sudo usermod -aG qa nina', 'id nina'],
        mistakes: [
          { commands: ['sudo usermod -G qa nina'], why: '沒有 `-a` 的 `-G` 把附加群組換成只有 qa，nina 離開了 devs，下次登入就打不開 /srv/dev。' },
          { commands: ['sudo usermod -g qa nina'], why: '小寫的 `-g` 換掉的是主要群組，nina 之後建立的每個檔案都會屬於 qa；要加的是附加群組。' },
          { commands: ['sudo usermod -a qa nina'], why: '`-a` 只能和 `-G` 一起使用，usermod 只印出錯誤，什麼都沒有改。' },
          { commands: ['sudo usermod -aG qa learner'], why: '加進 qa 的是 learner 自己，不是 nina。' },
          { commands: ['usermod -aG qa nina'], why: '修改帳號需要 root：沒有 sudo 只會得到 Permission denied。' },
        ],
        hints: [
          '先用 `id nina` 看她現在有哪些群組。',
          '`usermod` 的 `-a` 表示附加，要和 `-G` 一起使用：`-aG 群組 使用者`。',
        ],
        explanation: '`sudo usermod -aG qa nina` 把 qa 附加到 nina 原有的附加群組後面，`id nina` 會印出 groups=1001(nina),1100(devs),1101(qa)。nina 要等下一次登入（或在她的 Shell 裡執行 `newgrp qa`）才真的帶著 qa 的權限；改完立刻用 `id nina` 看完整清單，就能發現漏打 -a 造成的群組遺失。',
      },
      {
        id: 'lnx06-logship', title: '替日誌轉送服務建立帳號', machine: 'log',
        statement: '這台主機要執行日誌轉送服務 `logship`，它只需要讀取 `/var/log/app`（屬於 `adm` 群組，群組可讀）。請替它建立系統帳號 `logship`：用 useradd 建立系統帳號的選項，讓它自動分配 1000 以下的 UID（從 999 往下第一個空號）；登入 shell 是 `/usr/sbin/nologin`；不建立家目錄；加入附加群組 `adm`，但不能有 sudo 權限。建好後可以用 `sudo -u logship` 讀讀看日誌。',
        checks: [
          { kind: 'user', name: 'logship', uid: 999, shell: '/usr/sbin/nologin', groups: ['adm'], notGroups: ['sudo'] },
          { kind: 'absent', path: '/home/logship' },
        ],
        solution: ['sudo useradd -r -s /usr/sbin/nologin -G adm logship', 'id logship', 'sudo -u logship cat /var/log/app/app.log'],
        mistakes: [
          { commands: ['sudo useradd -s /usr/sbin/nologin -G adm logship'], why: '沒有 `-r`，logship 拿到一般使用者的 UID 1001，看起來就像一個人類帳號。' },
          { commands: ['sudo useradd -r -G adm logship'], why: '沒有 `-s`，shell 是預設的 /bin/sh，服務帳號變成可以登入的帳號。' },
          { commands: ['sudo useradd -r -m -s /usr/sbin/nologin -G adm logship'], why: '`-m` 建立了服務用不到的 /home/logship。' },
          { commands: ['sudo useradd -r -s /usr/sbin/nologin logship'], why: '沒有加入 adm，logship 讀不到 /var/log/app。' },
          { commands: ['sudo useradd -r -s /usr/sbin/nologin -G adm,sudo logship'], why: '加入 sudo 群組等於給服務 root 權限，違反最小權限原則；它只需要 adm。' },
        ],
        hints: [
          '系統帳號用 `-r`，不能登入的 shell 用 `-s /usr/sbin/nologin`。',
          '`-r` 本來就不建立家目錄，不要加 `-m`。',
          '讀日誌靠的是 adm 群組：`-G adm`。',
        ],
        explanation: '`sudo useradd -r -s /usr/sbin/nologin -G adm logship` 建立 UID 999 的系統帳號與同名群組，沒有家目錄、不能登入，只多了讀日誌所需的 adm 群組。`sudo -u logship cat /var/log/app/app.log` 以它的身分讀得到日誌，因為 /var/log/app 與 app.log 都讓 adm 群組讀取；它卻不能修改日誌，也不能使用 sudo。這就是服務帳號的目標：剛好夠用的權限。',
      },
      {
        id: 'lnx06-uploads', title: '找出不是網站程式寫入的檔案', machine: 'shop',
        statement: '網路商店的網站程式以 `www-data` 執行，顧客上傳的檔案都由它寫進 `/srv/shop/uploads`，所以這些檔案的擁有者都是 www-data。有人用其他帳號手動放了檔案進去，要另外檢查。請用一行指令，印出 uploads 裡擁有者不是 www-data 的項目（`ls -l` 的那幾行，順序照 `ls -l`）。',
        checks: [{ kind: 'output' }],
        solution: ['ls -l /srv/shop/uploads | grep -v www-data'],
        variants: [
          { label: '隔天的 uploads', files: [
            file(`${UPLOADS}/banner-sale.jpg`, 'JPEG banner\n', 'www-data', 0o644, 'www-data'),
            file(`${UPLOADS}/promo-winter.jpg`, 'JPEG winter promotion\n', 'deploy', 0o644),
          ] },
          { label: 'root 也放過檔案', files: [
            file(`${UPLOADS}/maintenance.html`, '<h1>維護中</h1>\n', 'root', 0o644),
          ] },
        ],
        mistakes: [
          { commands: ['ls -l /srv/shop/uploads'], why: '列出了所有檔案，www-data 寫入的也在裡面。' },
          { commands: ['ls -l /srv/shop/uploads | grep www-data'], why: '`grep` 選出的是含有 www-data 的行，正好相反；不含的要加 `-v`。' },
          { commands: ['ls /srv/shop/uploads | grep -v www-data'], why: '沒有 `-l` 就沒有擁有者欄，每個檔名都不含 www-data，結果是全部的檔名。' },
          { commands: ['ls -l /srv/shop/uploads | grep deploy'], why: '只找了 deploy：換成 root 也放過檔案的那一天，root 的檔案就漏掉了；題目要的是所有不屬於 www-data 的。' },
          { commands: ['echo "-rw-r--r-- deploy  deploy     12 banner-sale.jpg"'], why: '直接打出答案：換一天的 uploads 就不對了。' },
        ],
        hints: [
          '`ls -l` 的第三欄是擁有者。',
          '把 `ls -l` 的輸出用 `|` 交給 `grep`；`grep -v` 選出不符合的行。',
        ],
        explanation: '`ls -l` 每一行都有擁有者與群組欄，`grep -v www-data` 留下不含 www-data 的行，也就是其他帳號放進來的檔案。服務帳號的好處在這裡也看得到：網站程式寫入的每個檔案都帶著 www-data 的身分，和人手動放的檔案一眼就能分開；如果網站以 root 或部署者的帳號執行，就分不出來了。',
      },
    ],
  },
};
