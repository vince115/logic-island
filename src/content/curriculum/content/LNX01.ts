import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * Three simulated machines (profile files) that run three distribution families: a web server on Ubuntu 24.04 LTS
 * (x86_64), a database server on Rocky Linux 9.4, a RHEL rebuild (aarch64), and a developer laptop on Fedora Workstation
 * 41. The host names, the user and the sizes are made up; the /etc/os-release fields, kernel releases and default file
 * systems follow what those releases ship (shortened to the lines the lesson reads). Real `uname -a` also prints the
 * kernel's build time (and on many systems the processor and hardware platform); the simulator leaves them out.
 */
const dir = (path: string, owner = 'root'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const etc = (path: string, content: string): TerminalFile => ({ path, kind: 'file', mode: 0o644, owner: 'root', content });

const UBUNTU_2404 = [
  'PRETTY_NAME="Ubuntu 24.04.1 LTS"', 'NAME="Ubuntu"', 'VERSION_ID="24.04"', 'VERSION="24.04.1 LTS (Noble Numbat)"',
  'VERSION_CODENAME=noble', 'ID=ubuntu', 'ID_LIKE=debian', 'UBUNTU_CODENAME=noble',
].join('\n') + '\n';
const UBUNTU_2204 = [
  'PRETTY_NAME="Ubuntu 22.04.4 LTS"', 'NAME="Ubuntu"', 'VERSION_ID="22.04"', 'VERSION="22.04.4 LTS (Jammy Jellyfish)"',
  'VERSION_CODENAME=jammy', 'ID=ubuntu', 'ID_LIKE=debian', 'UBUNTU_CODENAME=jammy',
].join('\n') + '\n';
const ROCKY_94 = [
  'NAME="Rocky Linux"', 'VERSION="9.4 (Blue Onyx)"', 'ID="rocky"', 'ID_LIKE="rhel centos fedora"', 'VERSION_ID="9.4"',
  'PLATFORM_ID="platform:el9"', 'PRETTY_NAME="Rocky Linux 9.4 (Blue Onyx)"', 'SUPPORT_END="2032-05-31"',
].join('\n') + '\n';
const FEDORA_41 = [
  'NAME="Fedora Linux"', 'VERSION="41 (Workstation Edition)"', 'ID=fedora', 'VERSION_ID=41', 'PLATFORM_ID="platform:f41"',
  'PRETTY_NAME="Fedora Linux 41 (Workstation Edition)"', 'VARIANT="Workstation Edition"', 'VARIANT_ID=workstation',
].join('\n') + '\n';

/** A web server: Ubuntu Server 24.04 LTS on x86_64, the site's files on their own disk under /srv. */
const web: TerminalMachine = {
  id: 'web', title: '網站伺服器 web-01（Ubuntu Server）', user: 'learner', host: 'web-01', cwd: '/home/learner', profile: 'files',
  system: { release: '6.8.0-45-generic', version: '#45-Ubuntu SMP PREEMPT_DYNAMIC', machine: 'x86_64' },
  mounts: [
    { path: '/', device: '/dev/vda1', type: 'ext4', size: 40470732, used: 6291456 },
    { path: '/srv', device: '/dev/vdb1', type: 'ext4', size: 102626232, used: 18874368 },
  ],
  files: [
    dir('/etc'), etc('/etc/hostname', 'web-01\n'), etc('/etc/os-release', UBUNTU_2404),
    dir('/home'), dir('/home/learner', 'learner'),
    dir('/srv'), dir('/srv/www'), etc('/srv/www/index.html', '<h1>web-01</h1>\n'),
  ],
};

/** A database server: Rocky Linux 9.4 (a RHEL rebuild) on an ARM (aarch64) cloud instance, XFS everywhere. */
const db: TerminalMachine = {
  id: 'db', title: '資料庫伺服器 db-02（Rocky Linux）', user: 'learner', host: 'db-02', cwd: '/home/learner', profile: 'files',
  system: { release: '5.14.0-427.13.1.el9_4.aarch64', version: '#1 SMP PREEMPT_DYNAMIC', machine: 'aarch64' },
  mounts: [
    { path: '/', device: '/dev/mapper/rl-root', type: 'xfs', size: 36628480, used: 3355443 },
    { path: '/boot', device: '/dev/vda2', type: 'xfs', size: 983040, used: 262144 },
    { path: '/var/lib/pgsql', device: '/dev/vdb1', type: 'xfs', size: 209612800, used: 64487424 },
  ],
  files: [
    dir('/boot'),
    dir('/etc'), etc('/etc/hostname', 'db-02\n'), etc('/etc/os-release', ROCKY_94),
    etc('/etc/redhat-release', 'Rocky Linux release 9.4 (Blue Onyx)\n'),
    dir('/home'), dir('/home/learner', 'learner'),
    dir('/var'), dir('/var/lib'), { path: '/var/lib/pgsql', kind: 'dir', mode: 0o700, owner: 'postgres' },
  ],
};

/** A developer's laptop: Fedora Workstation 41 with a desktop; / and /home are Btrfs subvolumes of one partition. */
const laptop: TerminalMachine = {
  id: 'laptop', title: '開發用筆電 dev-laptop（Fedora Workstation）', user: 'learner', host: 'dev-laptop', cwd: '/home/learner', profile: 'files',
  system: { release: '6.11.4-301.fc41.x86_64', version: '#1 SMP PREEMPT_DYNAMIC', machine: 'x86_64' },
  mounts: [
    { path: '/', device: '/dev/nvme0n1p3', type: 'btrfs', size: 498073600, used: 73400320 },
    { path: '/boot', device: '/dev/nvme0n1p2', type: 'ext4', size: 999320, used: 301056 },
    { path: '/boot/efi', device: '/dev/nvme0n1p1', type: 'vfat', size: 614400, used: 19456 },
    { path: '/home', device: '/dev/nvme0n1p3', type: 'btrfs', size: 498073600, used: 73400320 },
  ],
  files: [
    dir('/boot'), dir('/boot/efi'),
    dir('/etc'), etc('/etc/hostname', 'dev-laptop\n'), etc('/etc/os-release', FEDORA_41),
    etc('/etc/fedora-release', 'Fedora release 41 (Forty One)\n'),
    dir('/home'), dir('/home/learner', 'learner'),
    dir('/home/learner/Documents', 'learner'), dir('/home/learner/Downloads', 'learner'), dir('/home/learner/projects', 'learner'),
  ],
};


const ROCKY_95 = ROCKY_94.replaceAll('9.4', '9.5');
const home = (path: string) => `/home/learner/${path}`;

export const LNX01: LessonContent = {
  lessonId: 'LNX01',
  motivation: '你剛加入一個維運團隊，拿到三台機器的帳號：一台網站伺服器、一台資料庫伺服器，還有同事的開發筆電。三台都叫「Linux」，可是套件要用 apt 還是 dnf 裝、說明文件要看哪一版、系統還有幾年安全更新，答案全都不同。在動手修改任何設定之前，第一件事是弄清楚眼前是哪一台、跑的是哪個發行版與版本。本課先釐清 Linux 這個詞到底指哪一層：核心、使用者空間、Shell 與 GNU 工具各自的角色；再認識發行版與兩大家族 Debian／Ubuntu 和 RHEL 系的取捨、LTS 版本與支援週期，以及伺服器與桌面系統的差別；最後用 `uname -a`、`hostname`、`cat /etc/os-release` 與 `df -h` 在模擬的機器上辨認系統，並依用途替一台伺服器選出合適的發行版與版本。',
  sections: [
    {
      id: 'kernel-user-space', title: '核心與使用者空間：Linux 指的是哪一層',
      blocks: [
        { type: 'p', text: '作業系統的中心是核心（kernel）。它是開機後最先載入、一直留在記憶體裡的程式，唯一能直接操作硬體：決定哪個行程何時用 CPU（排程）、分配與保護記憶體、透過驅動程式控制磁碟與網路卡、把磁碟上的位元組組織成檔案系統，並提供網路協定堆疊。嚴格來說，Linux 這個名字指的就是核心：1991 年 8 月，芬蘭的學生 Linus Torvalds 公開宣布他正在寫一個自由的作業系統核心，後來以 GPL 第 2 版授權釋出，至今仍由他領導、全世界的開發者共同維護。' },
        { type: 'p', text: '核心以外的程式都在使用者空間（user space）執行：Shell、`ls` 與 `cat` 這些指令、網頁伺服器、資料庫、桌面環境都是。CPU 本身有權限等級，核心在特權模式執行；使用者空間的程式不能直接碰硬體或別的程式的記憶體，要讀檔案、開網路連線或啟動新程式，都得透過系統呼叫（system call）請核心代勞。這道邊界讓一個程式當掉時只會結束它自己，不會拖垮整台機器；反過來，核心或驅動程式出錯，整台機器都可能停擺（kernel panic）。' },
        { type: 'table', head: ['層次', '例子', '做什麼'], rows: [
          ['硬體', 'CPU、記憶體、磁碟、網路卡', '真正執行指令與存放資料'],
          ['核心（kernel space）', '排程器、記憶體管理、檔案系統、驅動程式、網路堆疊', '唯一能直接操作硬體；以系統呼叫提供服務'],
          ['系統函式庫', 'glibc（或 musl）', '把 open、read、fork 等系統呼叫包成程式可以呼叫的函式'],
          ['使用者空間程式', 'bash、ls、cat、nginx、PostgreSQL、桌面環境', '以一般權限執行；需要硬體資源時都經過核心'],
        ] },
        { type: 'p', text: 'Shell 是使用者空間裡專門替人讀指令的程式，常見的是 bash。你在終端機輸入 `ls`，Shell 先把這一行拆成字，找到 `ls` 這個程式，再用系統呼叫請核心建立新行程來執行它；`ls` 要讀目錄時，又用系統呼叫請核心讀磁碟，最後把結果印回終端機。所以核心、Shell 與發行版的關係是：核心管硬體，Shell 是你和系統對話的介面，發行版則把核心、Shell 與成千上萬個程式挑選、編譯、打包成一套能安裝的作業系統。下一節的 `uname` 回報的都是核心的資訊，不是發行版的。' },
      ],
    },
    {
      id: 'gnu-linux', title: 'GNU／Linux：核心加上工具才是作業系統',
      blocks: [
        { type: 'p', text: '只有核心還不能用：沒有 Shell 就沒辦法下指令，沒有編譯器就沒辦法建置程式，沒有 C 函式庫大多數程式根本跑不起來。這些工具很多來自 GNU 專案：Richard Stallman 在 1983 年宣布要寫一套完全自由、與 Unix 相容的作業系統，到 1990 年代初已經完成編譯器 GCC、Shell bash、基本指令集 coreutils（`ls`、`cp`、`cat`……）與 C 函式庫 glibc，但自己的核心 GNU Hurd 還沒有準備好。Linux 核心剛好補上這個缺口，兩者合起來才是一套完整、自由的作業系統。' },
        { type: 'p', text: '因此自由軟體基金會（FSF）主張把整套系統稱為 GNU／Linux，強調使用者空間的大部分來自 GNU；日常口語則多半直接說 Linux。這不只是名稱之爭，也提醒我們核心和使用者空間可以分開替換：Debian 的發行版名稱就是「Debian GNU/Linux」；Android 用的是 Linux 核心，但使用者空間是 Google 自己的（C 函式庫是 Bionic），幾乎沒有 GNU 工具；容器常用的 Alpine Linux 則用 musl 與 BusyBox 取代 glibc 與 coreutils，所以映像檔很小。本課的模擬機器都是 GNU 工具組成的系統，`uname -o` 印出的 GNU/Linux 就是這個稱呼。' },
        { type: 'table', head: ['組成', '來源', '在模擬機器上看得到的地方'], rows: [
          ['核心', 'Linux（Linus Torvalds 與社群）', '`uname -s` 印出 Linux，`uname -r` 印出核心版本'],
          ['Shell', 'GNU bash', '提示字元 `learner@web-01:~$` 後面讀你指令的程式'],
          ['基本指令', 'GNU coreutils', '`ls`、`cat`、`df`、`uname` 都屬於它'],
          ['C 函式庫', 'GNU glibc', '幾乎每個程式都呼叫它的函式，再由它向核心發出系統呼叫'],
        ] },
      ],
    },
    {
      id: 'identify-machine', title: '辨認一台機器：uname、hostname、os-release 與 df',
      blocks: [
        { type: 'p', text: '登入一台陌生的機器，先問四個問題：核心是什麼版本、這台叫什麼名字、裝的是哪個發行版與版本、磁碟怎麼掛載與還剩多少空間。四個問題各有一個指令回答，而且都只是讀取資訊，不會改變系統，在正式環境也可以放心執行。' },
        { type: 'table', head: ['問題', '指令', '印出的內容'], rows: [
          ['核心與硬體架構', '`uname -a`', '依序是核心名稱（-s）、主機名稱（-n）、核心版本（-r）、建置資訊（-v）、硬體架構（-m）、作業系統（-o）'],
          ['這台機器叫什麼', '`hostname`', '主機名稱，也就是提示字元 @ 後面那一段'],
          ['哪個發行版、哪一版', '`cat /etc/os-release`', '`NAME`、`VERSION_ID`、`PRETTY_NAME`、`ID`、`ID_LIKE` 等欄位'],
          ['掛載與空間', '`df -h`', '每個檔案系統的裝置、大小、已用、可用、使用率與掛載點'],
        ] },
        { type: 'p', text: '下面在網站伺服器 web-01 上依序執行前三個指令。`uname -a` 的 `6.8.0-45-generic` 是核心版本：6.8 是上游 Linux 的版本，`-45` 是 Ubuntu 自己的修訂編號，`generic` 是 Ubuntu 通用的核心類型；`#45-Ubuntu` 也透露它是 Ubuntu 打包的核心。真正的系統還會印出核心的建置時間，許多系統也會多印處理器與硬體平台兩欄，模擬環境把它們省略了。' },
        { type: 'example', id: 'lnx01-web-identity' },
        { type: 'p', text: '`/etc/os-release` 是 systemd 專案提出、現在幾乎所有主流發行版都提供的標準檔案（在很多系統上它是指向 `/usr/lib/os-release` 的連結）。每一行是 `欄位=值`：`PRETTY_NAME` 給人讀，`ID` 與 `VERSION_ID` 給程式判斷，`ID_LIKE` 說明它和哪些發行版相近，所以 Ubuntu 寫 `ID_LIKE=debian`，安裝腳本看到它就知道可以照 Debian 的方式處理；`VERSION_CODENAME=noble` 是這一版的代號（Noble Numbat）。' },
        { type: 'callout', tone: 'tip', title: '動手之前先確認身分', text: '要在伺服器上做任何修改之前，先執行 `hostname` 確認自己登入的是正確的機器，再看 `/etc/os-release` 決定該查哪一個發行版的文件。同時開著好幾個終端機視窗時，在錯的那一台重新啟動服務或刪除檔案，是很常見的事故原因。' },
      ],
    },
    {
      id: 'distributions', title: '發行版與家族：Debian／Ubuntu 與 RHEL 系',
      blocks: [
        { type: 'p', text: '發行版（distribution）是把 Linux 核心和使用者空間的程式挑選、設定、編譯好，打包成一套可以安裝與更新的作業系統。不同發行版的核心大同小異，差別在於：用哪一種套件格式與套件管理器、預設裝了哪些程式與設定、多久出一個新版本、每個版本支援多久，以及有沒有公司提供付費支援。由同一個源頭衍生、共用套件格式的發行版稱為一個家族，學會其中一個，換到同家族的其他成員幾乎不用重學。' },
        { type: 'table', head: ['家族', '代表', '套件格式與工具', '特色'], rows: [
          ['Debian 系', 'Debian、Ubuntu、Linux Mint', '`.deb`；dpkg、apt', 'Debian 由 Ian Murdock 在 1993 年創立，由社群維護；Ubuntu 由 Canonical 公司在 2004 年以 Debian 為基礎推出，有固定的發行節奏與商業支援'],
          ['Red Hat 系', 'RHEL、Fedora、CentOS Stream、Rocky Linux、AlmaLinux', '`.rpm`；rpm、dnf', 'RHEL 是 Red Hat 的商業發行版；Fedora 是社群的上游，新技術先在這裡出現；Rocky Linux 與 AlmaLinux 是社群重建、以和 RHEL 相容為目標的免費發行版'],
          ['SUSE 系', 'SUSE Linux Enterprise、openSUSE', '`.rpm`；zypper', 'SUSE 是 1992 年在德國創立的公司，同樣分成企業版與社群版'],
          ['獨立發展', 'Arch Linux、Alpine Linux', 'pacman；apk', 'Arch 持續滾動更新、沒有版本號；Alpine 以 musl 與 BusyBox 求小，常用在容器映像'],
        ] },
        { type: 'p', text: 'RHEL 系的版圖在 2020 年底有過一次大變動：Red Hat 宣布 CentOS Linux 8 提前在 2021 年底結束，改以 CentOS Stream 為主。CentOS Stream 位在 Fedora 與 RHEL 之間，內容比 RHEL 的下一個小版本略早一步，不再是 RHEL 釋出後的重建版。原本靠免費 CentOS 跑伺服器的使用者，因此轉向 Rocky Linux、AlmaLinux 等新的重建版，或改用 RHEL 本身、Ubuntu LTS 等其他發行版；CentOS Linux 7 也在 2024 年 6 月 30 日結束支援。' },
        { type: 'p', text: '下面是資料庫伺服器 db-02，它跑的是 Rocky Linux 9.4。核心版本 `5.14.0-427.13.1.el9_4.aarch64` 裡的 `el9_4` 表示 Enterprise Linux 9.4，結尾的 `aarch64` 是 64 位元 ARM 架構（雲端常見的 ARM 主機），和 web-01 的 `x86_64` 不同。RHEL 系除了 `/etc/os-release`，還保留一行式的 `/etc/redhat-release`，`ID_LIKE="rhel centos fedora"` 說明它和誰相近：' },
        { type: 'example', id: 'lnx01-db-identity' },
        { type: 'table', head: ['比較項目', 'Debian／Ubuntu', 'RHEL 系（RHEL、Rocky、Alma）'], rows: [
          ['安裝軟體', '`apt install nginx`', '`dnf install nginx`'],
          ['套件數量', 'Debian 與 Ubuntu 的套件庫非常大，第三方軟體多半提供 `.deb`', '基本套件庫較精簡，常要另外啟用 EPEL 等額外套件庫'],
          ['付費支援', 'Ubuntu 有 Canonical 的訂閱服務；Debian 由社群支援', 'RHEL 需要 Red Hat 訂閱；Rocky 與 Alma 免費，靠社群或第三方支援'],
          ['商業軟體認證', '雲端與容器生態系支援完整', '許多企業軟體（資料庫、ERP）以 RHEL 為主要的認證平台'],
          ['預設檔案系統', 'Ubuntu 預設 ext4', 'RHEL 系預設 XFS'],
        ] },
      ],
    },
    {
      id: 'lts-lifecycle', title: 'LTS 版本與支援週期',
      blocks: [
        { type: 'p', text: '發行版的每一個版本都有支援期限：期限內會持續收到安全修補與錯誤修正，過期之後就不再更新，新發現的漏洞也不會修。伺服器通常要穩定跑好幾年，所以多數發行版提供長期支援版（LTS，Long Term Support）或企業版：一個版本固定好主要軟體的版本，往後只修補錯誤與安全問題、不做破壞相容性的升級。代價是軟體比較舊；想要最新功能的版本，支援期就短，必須常常升級大版本。' },
        { type: 'table', head: ['發行版', '版本節奏', '一個版本的支援期'], rows: [
          ['Ubuntu LTS', '每兩年的 4 月一版，版本號是年份與月份：24.04 表示 2024 年 4 月', '標準支援 5 年；付費的 Ubuntu Pro 可延長安全維護'],
          ['Ubuntu 非 LTS 版', '每 6 個月一版（例如 24.10）', '約 9 個月'],
          ['Debian stable', '大約每兩年一版，每版有代號（例如 bookworm）', '約 3 年完整安全支援，之後由 Debian LTS 延長到約 5 年'],
          ['RHEL 與其重建版', '大版本約每 3 年一版，小版本約每 6 個月一版', '大版本約 10 年；Rocky 9 的 `SUPPORT_END` 是 2032-05-31'],
          ['Fedora', '約每 6 個月一版', '約 13 個月，所以每年至少要升級一次大版本'],
          ['Arch Linux', '持續滾動更新，沒有版本', '只支援最新狀態，隨時更新'],
        ] },
        { type: 'p', text: '版本號也要看懂規則：Ubuntu 的 24.04.1 是 24.04 的第一個小改版（point release），更新了安裝映像與累積的修補，不是新的大版本；Rocky Linux 9.4 是 9 這個大版本的第 4 個小版本，從 9.4 更新到 9.5 只要照常更新套件，從 8 升到 9 才是大版本升級，通常要重新安裝或做完整的升級規劃。' },
        { type: 'callout', tone: 'warning', title: '核心版本不等於發行版版本', text: 'Ubuntu 24.04 的核心不是 24.04 版，而是 6.8；Rocky Linux 9.4 的核心是 5.14，看起來比 Fedora 41 的 6.11 舊很多，但這不代表它沒有修補。企業版在整個大版本期間固定核心的版本號，把安全修補與部分新功能移植（backport）回 5.14。所以判斷一台機器是否還在支援期，要看 `/etc/os-release` 的發行版與版本，而不是拿 `uname -r` 和最新的上游核心比大小。' },
        { type: 'callout', tone: 'warning', title: 'LTS 也會到期', text: 'LTS 是「長期」，不是「永久」。支援結束之後系統照樣能開機、服務照樣能跑，看不出任何異狀，但新漏洞從此不會修補。部署時就要記下版本的支援期限，在期限前排好升級或遷移；CentOS Linux 7 在 2024 年 6 月 30 日結束支援時，仍有不少伺服器還沒有搬走。' },
      ],
    },
    {
      id: 'server-desktop-choice', title: '伺服器與桌面：依用途選擇發行版與版本',
      blocks: [
        { type: 'p', text: '伺服器與桌面用的是同一個 Linux 核心，取捨卻不同。伺服器通常沒有螢幕與圖形介面，透過 SSH 遠端管理，看重的是穩定、可預期的更新與長的支援期，資料常放在獨立的磁碟或分割區，滿了也不會拖垮整個系統；桌面要有圖形環境（例如 GNOME 或 KDE Plasma）、新硬體的驅動、較新的應用程式與瀏覽器，能接受比較頻繁的升級。同一個發行版也常分出伺服器版與桌面版，例如 Ubuntu Server 與 Ubuntu Desktop、Fedora Server 與 Fedora Workstation。' },
        { type: 'p', text: '同事的開發筆電跑 Fedora Workstation 41：`VARIANT="Workstation Edition"` 說明它是桌面版，家目錄有 Documents、Downloads 這些桌面環境建立的資料夾。`df -h` 裡 `/` 與 `/home` 是同一個分割區 `/dev/nvme0n1p3`，大小與用量完全相同，因為 Fedora Workstation 預設使用 Btrfs，把它們做成同一個檔案系統裡的兩個子磁碟區（subvolume）。' },
        { type: 'example', id: 'lnx01-laptop' },
        { type: 'p', text: '資料庫伺服器則把資料放在獨立的磁碟上：`df -hT` 的 `-T` 多印出檔案系統類型，三個掛載點都是 RHEL 系預設的 XFS；`/var/lib/pgsql` 是 PostgreSQL 的資料目錄，掛在專用的 `/dev/vdb1`，指定路徑時 `df` 只列出包含它的那個檔案系統。' },
        { type: 'example', id: 'lnx01-server-disks' },
        { type: 'p', text: '選擇發行版與版本時，依序回答幾個問題：這台機器要服務多久，選的版本支援期要涵蓋它；團隊熟悉 apt 還是 dnf，出事時誰能修；要跑的商業軟體認證了哪些平台；是否需要付費的廠商支援；硬體是 x86_64 還是 aarch64。下表是幾個常見情境：' },
        { type: 'table', head: ['用途', '常見的選擇', '理由'], rows: [
          ['一般的網站或 API 伺服器', 'Ubuntu LTS 或 Debian stable', '支援期長、套件與教學資源多，雲端主機都有現成的映像'],
          ['企業的資料庫或商業軟體', 'RHEL，或 Rocky Linux、AlmaLinux', '約 10 年的支援期，廠商通常以 RHEL 認證軟體；需要付費支援時用 RHEL'],
          ['開發者的桌機或筆電', 'Fedora Workstation 或 Ubuntu Desktop', '桌面環境、新的開發工具與硬體驅動'],
          ['容器映像', 'Alpine，或 Debian／Ubuntu 的精簡映像', '映像小、下載快；需要 glibc 相容時選 Debian 系'],
          ['學習與追新', 'Arch Linux 或 Fedora', '軟體最新，但要常更新、自己處理變動'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx01-q1', prompt: '「Linux」這個名字嚴格來說指的是哪一部分？',
      options: ['包含桌面、瀏覽器與辦公軟體的整套系統', '管理硬體、行程與記憶體的作業系統核心', '讓使用者輸入指令的 Shell，例如 `bash`', '安裝與更新軟體的套件管理器'],
      answer: 1,
      explanation: 'Linux 是 Linus Torvalds 在 1991 年開始寫的核心，負責排程、記憶體、驅動程式與檔案系統。整套系統是發行版把核心加上使用者空間程式組成的；`bash` 是 GNU 專案的 Shell，屬於使用者空間；套件管理器（apt、dnf）是發行版提供的工具，都不是 Linux 這個名字本身指的東西。',
    },
    {
      id: 'lnx01-q2', prompt: '下列哪一個在核心空間（kernel space）執行？',
      options: ['`bash` 這個 Shell', '`ls`、`cat` 這些指令', '磁碟與網路卡的驅動程式', 'PostgreSQL 資料庫伺服器'],
      answer: 2,
      explanation: '驅動程式是核心的一部分，在特權模式直接操作硬體。`bash`、`ls`、`cat` 與 PostgreSQL 都是使用者空間的程式，以一般權限執行，要讀檔案或用網路時必須透過系統呼叫請核心代勞，所以它們當掉不會拖垮核心。',
    },
    {
      id: 'lnx01-q3', prompt: '想知道一台機器裝的是哪個發行版、哪一個版本，最直接的指令是哪一個？',
      options: ['`cat /etc/os-release`', '`uname -r`', '`hostname`', '`df -h`'],
      answer: 0,
      explanation: '`/etc/os-release` 是各大發行版共同提供的檔案，`NAME`、`VERSION_ID`、`PRETTY_NAME` 直接寫出發行版與版本。`uname -r` 只印出核心版本，Ubuntu 24.04 的核心是 6.8，看不出發行版；`hostname` 只是機器的名字；`df -h` 列出掛載與空間，都回答不了這個問題。',
    },
    {
      id: 'lnx01-q4', prompt: '`uname -r` 印出 `5.14.0-427.13.1.el9_4.aarch64`，可以得到哪個結論？',
      options: ['這台機器的發行版是 5.14 版', '這是 Ubuntu 的核心，因為 Ubuntu 的版本號以 5 開頭', '這台機器是 x86_64 架構的一般 PC', '核心是 Enterprise Linux 9.4 打包的版本，跑在 64 位元 ARM 硬體上'],
      answer: 3,
      explanation: '`el9_4` 表示 Enterprise Linux 9.4（RHEL 9.4 與其重建版），`aarch64` 是 64 位元 ARM 架構。5.14 是核心版本，不是發行版版本；Ubuntu 的核心字串長得像 `6.8.0-45-generic`，沒有 el9；x86_64 的機器結尾會是 `x86_64`，不是 `aarch64`。',
    },
    {
      id: 'lnx01-q5', prompt: '下列哪一組發行版屬於同一個家族，都使用 `.rpm` 套件與 `dnf`？',
      options: ['Debian、Ubuntu、Linux Mint', 'Fedora、RHEL、Rocky Linux', 'Arch Linux、Alpine Linux', 'Ubuntu、Rocky Linux'],
      answer: 1,
      explanation: 'Fedora 是 Red Hat 系的社群上游，RHEL 是商業版，Rocky Linux 是和 RHEL 相容的重建版，三者都用 `.rpm` 與 `dnf`。Debian、Ubuntu、Linux Mint 是 Debian 系，用 `.deb` 與 apt；Arch 用 pacman、Alpine 用 apk，兩者各自獨立；Ubuntu 和 Rocky Linux 分屬兩個家族。',
    },
    {
      id: 'lnx01-q6', prompt: '關於 Ubuntu 24.04 LTS，哪一個敘述正確？',
      options: ['它是 Ubuntu 的第 24 個大版本、第 4 次修訂', '它使用的 Linux 核心版本是 24.04', 'LTS 表示永遠會有安全更新，不必規劃升級', '它在 2024 年 4 月發布，標準支援 5 年，之後可以付費延長安全維護'],
      answer: 3,
      explanation: 'Ubuntu 的版本號是年份與月份，24.04 就是 2024 年 4 月；LTS 每兩年一版，標準支援 5 年，Ubuntu Pro 可以付費延長。它不是第 24 個版本；它的核心是 6.8，和發行版版本號無關；LTS 是長期而不是永久，到期後就不再修補漏洞，必須事先規劃升級。',
    },
    {
      id: 'lnx01-q7', prompt: '一套內部系統預計在伺服器上跑 6 年，團隊不想每年升級大版本。下列哪個選擇最合適？',
      options: ['RHEL 9 或 Rocky Linux 9 這類長期支援的版本', 'Fedora Workstation 的最新版', 'Ubuntu 的非 LTS 版本，例如 24.10', '持續滾動更新、沒有版本號的 Arch Linux'],
      answer: 0,
      explanation: 'RHEL 9 系列的支援到 2032 年，涵蓋 6 年的服務期，期間只需要套用修補與小版本更新。Fedora 每版約 13 個月就到期，而且是桌面版；Ubuntu 非 LTS 版只支援約 9 個月；Arch 隨時滾動更新，適合追新，不適合要求長期穩定的伺服器。',
    },
    {
      id: 'lnx01-q8', prompt: '為什麼有人主張把整套系統稱為「GNU／Linux」？',
      options: ['因為 Linux 核心是 GNU 專案在 1983 年寫成的', '因為只有 GNU 認證的發行版才能用在伺服器上', '因為常見系統的使用者空間工具，例如 `bash`、`coreutils` 與 `glibc`，來自 GNU 專案', '因為 GNU 是發行 Linux 的公司名稱'],
      answer: 2,
      explanation: 'GNU 專案從 1983 年開始寫自由的 Unix 相容系統，提供了 Shell、基本指令、編譯器與 C 函式庫，Linux 核心補上它缺少的核心，FSF 因此主張兩者並稱。核心是 Linus Torvalds 在 1991 年開始寫的，不是 GNU 專案；GNU 不是公司，也沒有替伺服器發行版做認證。',
    },
  ],
  terminal: {
    machines: [web, db, laptop],
    examples: [
      {
        id: 'lnx01-web-identity', title: '這台伺服器是什麼系統', machine: 'web',
        description: '在 web-01 上用 `uname -a` 看核心與硬體架構，`hostname` 確認名字，`cat /etc/os-release` 看發行版與版本。',
        steps: [
          { command: 'uname -a', output: 'Linux web-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' },
          { command: 'hostname', output: 'web-01' },
          { command: 'cat /etc/os-release', output: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nUBUNTU_CODENAME=noble' },
        ],
      },
      {
        id: 'lnx01-db-identity', title: 'RHEL 系的資料庫伺服器', machine: 'db',
        description: '在 db-02 上分開看核心版本與硬體架構，再讀 RHEL 系一行式的 `/etc/redhat-release` 與完整的 `/etc/os-release`。',
        steps: [
          { command: 'uname -r', output: '5.14.0-427.13.1.el9_4.aarch64' },
          { command: 'uname -m', output: 'aarch64' },
          { command: 'ls /etc', output: 'hostname  os-release  redhat-release' },
          { command: 'cat /etc/redhat-release', output: 'Rocky Linux release 9.4 (Blue Onyx)' },
          { command: 'cat /etc/os-release', output: 'NAME="Rocky Linux"\nVERSION="9.4 (Blue Onyx)"\nID="rocky"\nID_LIKE="rhel centos fedora"\nVERSION_ID="9.4"\nPLATFORM_ID="platform:el9"\nPRETTY_NAME="Rocky Linux 9.4 (Blue Onyx)"\nSUPPORT_END="2032-05-31"' },
        ],
      },
      {
        id: 'lnx01-laptop', title: '桌面系統的筆電', machine: 'laptop',
        description: '在 dev-laptop 上看核心、發行版的版本與版別（Workstation Edition），以及家目錄與 Btrfs 的掛載方式。',
        steps: [
          { command: 'uname -sr', output: 'Linux 6.11.4-301.fc41.x86_64' },
          { command: 'cat /etc/os-release', output: 'NAME="Fedora Linux"\nVERSION="41 (Workstation Edition)"\nID=fedora\nVERSION_ID=41\nPLATFORM_ID="platform:f41"\nPRETTY_NAME="Fedora Linux 41 (Workstation Edition)"\nVARIANT="Workstation Edition"\nVARIANT_ID=workstation' },
          { command: 'ls', output: 'Documents/  Downloads/  projects/' },
          { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p3  475G   70G  405G  15% /\n/dev/nvme0n1p2  976M  294M  682M  31% /boot\n/dev/nvme0n1p1  600M   19M  581M   4% /boot/efi\n/dev/nvme0n1p3  475G   70G  405G  15% /home' },
        ],
      },
      {
        id: 'lnx01-server-disks', title: '伺服器的掛載與空間', machine: 'db',
        description: '`df -hT` 多列出檔案系統類型；指定 `/var/lib/pgsql` 時只列出資料庫專用的那顆磁碟。',
        steps: [
          { command: 'df -hT', output: 'Filesystem          Type  Size  Used Avail Use% Mounted on\n/dev/mapper/rl-root xfs    35G  3.2G   32G  10% /\n/dev/vda2           xfs   960M  256M  704M  27% /boot\n/dev/vdb1           xfs   200G   62G  139G  31% /var/lib/pgsql' },
          { command: 'df -h /var/lib/pgsql', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vdb1       200G   62G  139G  31% /var/lib/pgsql' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx01-which-release', title: '網站伺服器跑的是哪一版', machine: 'web',
        statement: '主管問：web-01 跑的是哪個發行版、哪一個版本？用一個指令印出這台機器記錄發行版身分的檔案（`/etc` 底下的 `os-release`），從 `PRETTY_NAME` 與 `VERSION_ID` 找出答案。',
        checks: [{ kind: 'output' }],
        solution: ['cat /etc/os-release'],
        variants: [{ label: '另一台還在 Ubuntu 22.04 的網站伺服器', files: [etc('/etc/os-release', UBUNTU_2204)] }],
        mistakes: [
          { commands: ['uname -a'], why: '`uname` 只回報核心的資訊，6.8.0-45-generic 是核心版本，看不出發行版是哪一版。' },
          { commands: ['cat os-release'], why: '相對路徑從目前位置（家目錄）算起，家目錄裡沒有 os-release，要寫完整的 `/etc/os-release`。' },
          { commands: ['echo PRETTY_NAME="Ubuntu 24.04.1 LTS"'], why: '直接打出看到的答案：換到另一台還在 22.04 的伺服器就不對了。' },
        ],
        hints: ['發行版的身分寫在 `/etc/os-release`，`cat` 可以印出檔案的內容。', '從家目錄出發，要用以 `/` 開頭的絕對路徑。'],
        explanation: '`cat /etc/os-release` 印出整份檔案：`PRETTY_NAME="Ubuntu 24.04.1 LTS"` 是給人讀的名稱，`VERSION_ID="24.04"` 是版本。同一個指令在另一台機器上會印出那台的版本，這正是先讀檔案、不憑記憶回答的原因。',
      },
      {
        id: 'lnx01-inventory', title: '替資料庫伺服器建立資產紀錄', machine: 'db',
        statement: '在 db-02 的家目錄建立 `inventory` 目錄，並寫入 `inventory/db-02.txt`：第一行是 `/etc/os-release` 裡 `ID` 的值（不含引號），第二行是 `uname -m` 印出的硬體架構。',
        checks: [
          { kind: 'exists', path: home('inventory'), type: 'dir' },
          { kind: 'content', path: home('inventory/db-02.txt'), content: 'rocky\naarch64\n' },
        ],
        solution: ['cat /etc/os-release', 'uname -m', 'mkdir inventory', 'echo rocky > inventory/db-02.txt', 'echo aarch64 >> inventory/db-02.txt'],
        mistakes: [
          { commands: ['mkdir inventory', 'echo rocky > inventory/db-02.txt', 'echo aarch64 > inventory/db-02.txt'], why: '第二次也用 `>`，會把檔案整個覆寫，第一行的 rocky 就不見了；附加一行要用 `>>`。' },
          { commands: ['mkdir inventory', 'echo rocky > inventory/db-02.txt', 'echo x86_64 >> inventory/db-02.txt'], why: '憑印象以為伺服器都是 x86_64，沒有執行 `uname -m` 確認；這台是 aarch64（64 位元 ARM）。' },
          { commands: ['mkdir inventory', 'echo Rocky Linux > inventory/db-02.txt', 'echo aarch64 >> inventory/db-02.txt'], why: '寫成了 `NAME` 的值；`ID` 是給程式判斷用的小寫識別字 rocky。' },
          { commands: ['echo rocky > inventory/db-02.txt', 'echo aarch64 >> inventory/db-02.txt'], why: '`inventory` 目錄還不存在，`>` 不會自動建立目錄，兩個指令都失敗。' },
        ],
        hints: ['先 `cat /etc/os-release` 找到 `ID` 那一行，再用 `uname -m` 看架構。', '`echo 文字 > 檔案` 寫入（覆寫），`echo 文字 >> 檔案` 附加在最後。'],
        explanation: '`ID="rocky"` 的值是 rocky，`uname -m` 印出 aarch64。`mkdir inventory` 建立目錄後，第一行用 `>` 建立檔案，第二行用 `>>` 附加，檔案內容就是兩行。資產紀錄裡寫 `ID` 而不是 `PRETTY_NAME`，是因為它固定、小寫、沒有空白，之後用程式比對比較可靠。',
      },
      {
        id: 'lnx01-rhel-release', title: 'RHEL 系的一行版本', machine: 'db',
        statement: 'RHEL 系的發行版在 `/etc/redhat-release` 裡用一行寫出發行版與版本。在 db-02 上用一個指令印出這一行。',
        checks: [{ kind: 'output' }],
        solution: ['cat /etc/redhat-release'],
        variants: [{ label: '已經更新到 9.5 的 db-02', files: [etc('/etc/redhat-release', 'Rocky Linux release 9.5 (Blue Onyx)\n'), etc('/etc/os-release', ROCKY_95)] }],
        mistakes: [
          { commands: ['uname -r'], why: '印出的是核心版本 5.14.0-427.13.1.el9_4.aarch64，不是發行版的版本行。' },
          { commands: ['cat /etc/os-release'], why: '這會印出整份 os-release 的多個欄位，題目要的是 `/etc/redhat-release` 那一行。' },
          { commands: ['echo Rocky Linux release 9.4 (Blue Onyx)'], why: '直接打出看到的答案：機器更新到 9.5 之後就不對了。' },
        ],
        hints: ['檔案的完整路徑是 `/etc/redhat-release`。'],
        explanation: '`cat /etc/redhat-release` 印出 `Rocky Linux release 9.4 (Blue Onyx)`。小版本更新（9.4 到 9.5）之後，這一行與 `/etc/os-release` 都會跟著改，但大版本 9 與代號 Blue Onyx 不變。Debian 系沒有這個檔案，所以跨發行版的腳本應該讀 `/etc/os-release`。',
      },
    ],
  },
};
