import type { TerminalFile, TerminalMachine, TerminalPackages } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX09 Package Management (LNX-3). A terminal lesson on the packages profile (engine stage E5): what a package and a
 * package manager are, repositories and the local package index (apt update refreshes the index, apt upgrade installs
 * newer versions), dependencies and automatically installed packages, install / remove / purge / autoremove (the rc
 * state keeps configuration files until purge), apt show, apt policy and apt list --upgradable, holding a version with
 * apt-mark, and a server update strategy (security updates, unattended-upgrades, staging, maintenance windows, kernel
 * updates that need a reboot). dnf on RHEL-family systems is compared in the text only. Three Ubuntu 24.04 machines: a
 * new host whose lists were never fetched, a web server with a NodeSource repository and an old kernel, and a test host
 * with Apache and nginx. Host names, users and package choices are made up; versions follow the noble naming. Every
 * transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content = '', owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const bin = (path: string): TerminalFile => file(path, '', 'root', 0o755);
const HOME = '/home/learner';

const ARCHIVE = 'http://archive.ubuntu.com/ubuntu', SECURITY = 'http://security.ubuntu.com/ubuntu', NODESOURCE = 'https://deb.nodesource.com/node_20.x';
const COMPONENTS = ['main', 'restricted', 'universe', 'multiverse'];
const UBUNTU_SOURCES = `Types: deb
URIs: ${ARCHIVE}
Suites: noble noble-updates noble-backports
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: ${SECURITY}
Suites: noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;
const NODESOURCE_SOURCES = `Types: deb
URIs: ${NODESOURCE}
Suites: nodistro
Components: main
Signed-By: /etc/apt/keyrings/nodesource.gpg
`;
const UBUNTU_REPOS: TerminalPackages['repositories'] = [
  { name: 'noble', url: ARCHIVE, suite: 'noble', components: COMPONENTS },
  { name: 'noble-updates', url: ARCHIVE, suite: 'noble-updates', components: COMPONENTS },
  { name: 'noble-backports', url: ARCHIVE, suite: 'noble-backports', components: COMPONENTS },
  { name: 'noble-security', url: SECURITY, suite: 'noble-security', components: COMPONENTS },
];

/** The base of every machine: learner's home, the apt sources and the Ubuntu archive key. */
const baseFiles = (extraSources: TerminalFile[] = []): TerminalFile[] => [
  dir('/etc'),
  dir('/etc/apt'),
  dir('/etc/apt/keyrings'),
  ...extraSources.filter(f => f.path.startsWith('/etc/apt/keyrings/')),
  dir('/etc/apt/sources.list.d'),
  file('/etc/apt/sources.list.d/ubuntu.sources', UBUNTU_SOURCES),
  ...extraSources.filter(f => f.path.startsWith('/etc/apt/sources.list.d/')),
  dir('/home'),
  dir(HOME, 'learner', 0o750),
  dir('/usr'),
  dir('/usr/bin'),
  dir('/usr/sbin'),
  dir('/usr/share'),
  dir('/usr/share/keyrings'),
  file('/usr/share/keyrings/ubuntu-archive-keyring.gpg'),
];

type Available = TerminalPackages['available'][number];
/** One version of a package in each of the named repositories (security: an update from noble-security). */
const versions = (repos: string[], pkg: Omit<Available, 'repo'>): Available[] => repos.map(repo => ({ ...pkg, repo, ...repo === 'noble-security' ? { security: true } : {} }));

const OPENSSL_OLD = '3.0.13-0ubuntu3', OPENSSL_NEW = '3.0.13-0ubuntu3.5';
const CURL_OLD = '8.5.0-2ubuntu10', CURL_NEW = '8.5.0-2ubuntu10.6';
const NGINX_OLD = '1.24.0-2ubuntu7', NGINX_NEW = '1.24.0-2ubuntu7.1';
const NODE_OLD = '20.17.0-1nodesource1', NODE_NEW = '20.18.1-1nodesource1';
const NGINX_CONF = 'user www-data;\nworker_processes auto;\npid /run/nginx.pid;\n';
const APACHE_CONF = 'ServerRoot "/etc/apache2"\nTimeout 300\nKeepAlive On\nIncludeOptional sites-enabled/*.conf\n';
const PORTS_CONF = 'Listen 80\n';

const opensslPackages = [
  ...versions(['noble'], { name: 'openssl', version: OPENSSL_OLD, section: 'utils', description: 'Secure Sockets Layer toolkit - cryptographic utility', depends: ['libssl3t64'], files: [{ path: '/usr/bin/openssl', kind: 'file', mode: 0o755 }] }),
  ...versions(['noble-updates', 'noble-security'], { name: 'openssl', version: OPENSSL_NEW, section: 'utils', description: 'Secure Sockets Layer toolkit - cryptographic utility', depends: ['libssl3t64'], files: [{ path: '/usr/bin/openssl', kind: 'file', mode: 0o755 }] }),
  ...versions(['noble'], { name: 'libssl3t64', version: OPENSSL_OLD, section: 'libs', description: 'Secure Sockets Layer toolkit - shared libraries' }),
  ...versions(['noble-updates', 'noble-security'], { name: 'libssl3t64', version: OPENSSL_NEW, section: 'libs', description: 'Secure Sockets Layer toolkit - shared libraries' }),
];
const curlPackages = [
  ...versions(['noble'], { name: 'curl', version: CURL_OLD, section: 'web', description: 'command line tool for transferring data with URL syntax', depends: ['libcurl4t64'], files: [{ path: '/usr/bin/curl', kind: 'file', mode: 0o755 }] }),
  ...versions(['noble-updates'], { name: 'curl', version: CURL_NEW, section: 'web', description: 'command line tool for transferring data with URL syntax', depends: ['libcurl4t64'], files: [{ path: '/usr/bin/curl', kind: 'file', mode: 0o755 }] }),
  ...versions(['noble'], { name: 'libcurl4t64', version: CURL_OLD, section: 'libs', description: 'easy-to-use client-side URL transfer library (OpenSSL flavour)' }),
  ...versions(['noble-updates'], { name: 'libcurl4t64', version: CURL_NEW, section: 'libs', description: 'easy-to-use client-side URL transfer library (OpenSSL flavour)' }),
];
const nginxPackages = (repos: { old: string[]; new: string[] }) => [
  ...versions(repos.old, { name: 'nginx', version: NGINX_OLD, section: 'httpd', description: 'small, powerful, scalable web/proxy server', depends: ['nginx-common'], files: [{ path: '/usr/sbin/nginx', kind: 'file', mode: 0o755 }] }),
  ...versions(repos.old, { name: 'nginx-common', version: NGINX_OLD, arch: 'all', section: 'httpd', description: 'small, powerful, scalable web/proxy server - common files',
    files: [{ path: '/etc/nginx', kind: 'dir', mode: 0o755 }, { path: '/etc/nginx/nginx.conf', kind: 'file', mode: 0o644, content: NGINX_CONF }] }),
  ...versions(repos.new, { name: 'nginx', version: NGINX_NEW, section: 'httpd', description: 'small, powerful, scalable web/proxy server', depends: ['nginx-common'], files: [{ path: '/usr/sbin/nginx', kind: 'file', mode: 0o755 }] }),
  ...versions(repos.new, { name: 'nginx-common', version: NGINX_NEW, arch: 'all', section: 'httpd', description: 'small, powerful, scalable web/proxy server - common files',
    files: [{ path: '/etc/nginx', kind: 'dir', mode: 0o755 }, { path: '/etc/nginx/nginx.conf', kind: 'file', mode: 0o644, content: NGINX_CONF }] }),
];

/**
 * The transcripts' first machine and exercises 1 and 3: a freshly installed application host whose package lists were
 * never fetched (apt sees no package until apt update). openssl and curl have updates waiting; jq needs two libraries.
 */
const appHost: TerminalMachine = {
  id: 'app', title: '新的應用程式主機 app-03', user: 'learner', host: 'app-03', cwd: HOME, profile: 'packages',
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [...baseFiles(), bin('/usr/bin/curl'), bin('/usr/bin/openssl')],
  packages: {
    stale: true,
    repositories: UBUNTU_REPOS,
    available: [
      ...opensslPackages,
      ...curlPackages,
      ...versions(['noble'], { name: 'jq', version: '1.7.1-3build1', section: 'utils', description: 'lightweight and flexible command-line JSON processor', depends: ['libjq1'], files: [{ path: '/usr/bin/jq', kind: 'file', mode: 0o755 }] }),
      ...versions(['noble'], { name: 'libjq1', version: '1.7.1-3build1', section: 'libs', description: 'lightweight and flexible command-line JSON processor - shared library', depends: ['libonig5'] }),
      ...versions(['noble'], { name: 'libonig5', version: '6.9.9-1build1', section: 'libs', description: 'regular expressions library' }),
      ...versions(['noble'], { name: 'tree', version: '2.1.1-2ubuntu3', component: 'universe', section: 'utils', description: 'displays an indented directory tree, in color', files: [{ path: '/usr/bin/tree', kind: 'file', mode: 0o755 }] }),
    ],
    installed: [
      { name: 'curl', version: CURL_OLD },
      { name: 'libcurl4t64', version: CURL_OLD, auto: true },
      { name: 'libssl3t64', version: OPENSSL_OLD, auto: true },
      { name: 'openssl', version: OPENSSL_OLD },
    ],
  },
};

/**
 * The web server of the transcripts and exercise 4: nginx in front of a Node.js application from the NodeSource
 * repository, still on the release kernel 6.8.0-31. Six packages can be upgraded, a new kernel among them.
 */
const webHost: TerminalMachine = {
  id: 'web', title: '正式網站主機 web-05', user: 'learner', host: 'web-05', cwd: HOME, profile: 'packages',
  system: { release: '6.8.0-31-generic', version: '#31-Ubuntu SMP PREEMPT_DYNAMIC' },
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [
    dir('/boot'),
    file('/boot/vmlinuz-6.8.0-31-generic'),
    ...baseFiles([file('/etc/apt/keyrings/nodesource.gpg'), file('/etc/apt/sources.list.d/nodesource.sources', NODESOURCE_SOURCES)]),
    dir('/etc/nginx'),
    file('/etc/nginx/nginx.conf', NGINX_CONF),
    bin('/usr/bin/curl'), bin('/usr/bin/node'), bin('/usr/bin/openssl'), bin('/usr/sbin/nginx'),
  ],
  packages: {
    repositories: [...UBUNTU_REPOS, { name: 'nodesource', url: NODESOURCE, suite: 'nodistro', components: ['main'] }],
    available: [
      ...opensslPackages,
      ...curlPackages,
      ...nginxPackages({ old: ['noble'], new: ['noble-updates', 'noble-security'] }),
      ...versions(['noble'], { name: 'nodejs', version: '18.19.1+dfsg-6ubuntu5', component: 'universe', section: 'javascript', description: 'evented I/O for V8 javascript - runtime executable', files: [{ path: '/usr/bin/node', kind: 'file', mode: 0o755 }] }),
      ...versions(['nodesource'], { name: 'nodejs', version: NODE_OLD, section: 'web', description: 'Node.js event-based server-side javascript engine', files: [{ path: '/usr/bin/node', kind: 'file', mode: 0o755 }] }),
      ...versions(['nodesource'], { name: 'nodejs', version: NODE_NEW, section: 'web', description: 'Node.js event-based server-side javascript engine', files: [{ path: '/usr/bin/node', kind: 'file', mode: 0o755 }] }),
      ...versions(['noble'], { name: 'linux-image-generic', version: '6.8.0-31.31', section: 'kernel', description: 'Generic Linux kernel image', depends: ['linux-image-6.8.0-31-generic'] }),
      ...versions(['noble-updates', 'noble-security'], { name: 'linux-image-generic', version: '6.8.0-49.49', section: 'kernel', description: 'Generic Linux kernel image', depends: ['linux-image-6.8.0-49-generic'] }),
      ...versions(['noble'], { name: 'linux-image-6.8.0-31-generic', version: '6.8.0-31.31', section: 'kernel', description: 'Signed kernel image generic', files: [{ path: '/boot/vmlinuz-6.8.0-31-generic', kind: 'file', mode: 0o644 }] }),
      ...versions(['noble-updates', 'noble-security'], { name: 'linux-image-6.8.0-49-generic', version: '6.8.0-49.49', section: 'kernel', description: 'Signed kernel image generic', files: [{ path: '/boot/vmlinuz-6.8.0-49-generic', kind: 'file', mode: 0o644 }] }),
      ...versions(['noble'], { name: 'htop', version: '3.3.0-4build1', section: 'utils', description: 'interactive processes viewer', depends: ['libnl-3-200', 'libnl-genl-3-200'], files: [{ path: '/usr/bin/htop', kind: 'file', mode: 0o755 }] }),
      ...versions(['noble'], { name: 'libnl-3-200', version: '3.7.0-0.3build1', section: 'libs', description: 'library for dealing with netlink sockets' }),
      ...versions(['noble'], { name: 'libnl-genl-3-200', version: '3.7.0-0.3build1', section: 'libs', description: 'library for dealing with netlink sockets - generic netlink', depends: ['libnl-3-200'] }),
    ],
    installed: [
      { name: 'curl', version: CURL_NEW },
      { name: 'libcurl4t64', version: CURL_NEW, auto: true },
      { name: 'libssl3t64', version: OPENSSL_OLD, auto: true },
      { name: 'linux-image-6.8.0-31-generic', version: '6.8.0-31.31', auto: true },
      { name: 'linux-image-generic', version: '6.8.0-31.31' },
      { name: 'nginx', version: NGINX_OLD },
      { name: 'nginx-common', version: NGINX_OLD, auto: true },
      { name: 'nodejs', version: NODE_OLD },
      { name: 'openssl', version: OPENSSL_OLD },
    ],
  },
};

/** The removal transcript and exercise 2: a test host where Apache and nginx were compared; Apache is to go. */
const testHost: TerminalMachine = {
  id: 'test', title: '測試主機 test-02', user: 'learner', host: 'test-02', cwd: HOME, profile: 'packages',
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [
    ...baseFiles(),
    dir('/etc/apache2'),
    file('/etc/apache2/apache2.conf', APACHE_CONF),
    file('/etc/apache2/ports.conf', PORTS_CONF),
    dir('/etc/nginx'),
    file('/etc/nginx/nginx.conf', NGINX_CONF),
    bin('/usr/bin/ab'), bin('/usr/bin/htpasswd'), bin('/usr/sbin/apache2'), bin('/usr/sbin/nginx'),
  ],
  packages: {
    repositories: UBUNTU_REPOS,
    available: [
      ...nginxPackages({ old: ['noble'], new: [] }),
      ...versions(['noble'], { name: 'apache2', version: '2.4.58-1ubuntu8', section: 'httpd', description: 'Apache HTTP Server', depends: ['apache2-bin', 'apache2-data', 'apache2-utils'],
        files: [{ path: '/etc/apache2', kind: 'dir', mode: 0o755 }, { path: '/etc/apache2/apache2.conf', kind: 'file', mode: 0o644, content: APACHE_CONF }, { path: '/etc/apache2/ports.conf', kind: 'file', mode: 0o644, content: PORTS_CONF }] }),
      ...versions(['noble'], { name: 'apache2-bin', version: '2.4.58-1ubuntu8', section: 'httpd', description: 'Apache HTTP Server (modules and other binary files)', files: [{ path: '/usr/sbin/apache2', kind: 'file', mode: 0o755 }] }),
      ...versions(['noble'], { name: 'apache2-data', version: '2.4.58-1ubuntu8', arch: 'all', section: 'httpd', description: 'Apache HTTP Server (common files)' }),
      ...versions(['noble'], { name: 'apache2-utils', version: '2.4.58-1ubuntu8', section: 'httpd', description: 'Apache HTTP Server (utility programs for web servers)',
        files: [{ path: '/usr/bin/ab', kind: 'file', mode: 0o755 }, { path: '/usr/bin/htpasswd', kind: 'file', mode: 0o755 }] }),
    ],
    installed: [
      { name: 'apache2', version: '2.4.58-1ubuntu8' },
      { name: 'apache2-bin', version: '2.4.58-1ubuntu8', auto: true },
      { name: 'apache2-data', version: '2.4.58-1ubuntu8', auto: true },
      { name: 'apache2-utils', version: '2.4.58-1ubuntu8', auto: true },
      { name: 'nginx', version: NGINX_OLD },
      { name: 'nginx-common', version: NGINX_OLD, auto: true },
    ],
  },
};

export const LNX09: LessonContent = {
  lessonId: 'LNX09',
  motivation: '一台新伺服器上線，第一件事往往是裝軟體：部署腳本要 jq、維運要 htop、網站要 nginx。之後的每一週，則是面對「4 packages can be upgraded」：哪些是 OpenSSL 的安全修補，哪些會把應用程式依賴的 Node.js 換成還沒測過的版本？套件管理器讓安裝、升級與移除變成可重複、可追蹤的指令，但它有幾個經典的陷阱：以為 `apt update` 會升級軟體、remove 之後設定檔還留著、鎖定版本後就忘了解除、升級核心卻沒有重新開機。這些在正式環境裡的代價都不小。本課在三台模擬的 Ubuntu 24.04 主機上用 apt 安裝、查詢、升級、鎖定與移除套件，弄懂套件庫、相依性與版本之間的關係，對照 RHEL 系的 dnf，最後規劃一套伺服器的安全更新策略。',
  sections: [
    {
      id: 'lnx09-s-what', title: '套件與套件管理器：apt 與 dnf',
      blocks: [
        { type: 'p', text: '套件（package）是一個封裝好的檔案：裡面是程式要安裝到系統上的檔案（執行檔、程式庫、預設設定、說明文件），再加上一份描述資料，寫明名稱、版本、適用的 CPU 架構、依賴哪些其他套件，以及安裝與移除時要執行的維護腳本。Debian 與 Ubuntu 的套件是 `.deb` 檔，RHEL、Rocky Linux、AlmaLinux 與 Fedora 的是 `.rpm` 檔。' },
        { type: 'p', text: '套件管理器做的事，是替整台機器記帳：每個安裝過的套件是哪個版本、放了哪些檔案、是你要求安裝的還是為了別的套件才裝的。有了這本帳，才能可靠地升級（知道要換掉哪些檔案）、移除（知道該刪掉什麼）與查詢（某個檔案屬於哪個套件）。從原始碼編譯或手動複製執行檔的軟體沒有這本帳，日後的安全更新只能靠人記得。套件管理分成兩層：' },
        { type: 'table', head: ['層次', 'Debian／Ubuntu', 'RHEL／Fedora', '負責的事'], rows: [
          ['套件格式', '`.deb`', '`.rpm`', '檔案加上描述資料與維護腳本'],
          ['底層工具', '`dpkg`', '`rpm`', '安裝、移除一個已經在手上的套件檔，記錄到資料庫（dpkg 的是 `/var/lib/dpkg/status`）；不會自己去下載缺少的相依套件'],
          ['高階工具', '`apt`（以及給腳本用的 `apt-get`、`apt-cache`）', '`dnf`（舊版是 `yum`）', '從套件庫下載、解析相依性、算出要安裝與移除什麼，再交給底層工具執行'],
        ] },
        { type: 'p', text: '`apt` 是給人互動使用的指令，輸出會隨版本調整；撰寫腳本時建議改用介面穩定的 `apt-get` 與 `apt-cache`。這也是為什麼把 `apt` 的輸出接到管線或檔案時，它會先在標準錯誤印出 `WARNING: apt does not have a stable CLI interface.`。兩大家族的高階工具觀念相同，指令大多一一對應：' },
        { type: 'table', head: ['工作', 'apt（Debian／Ubuntu）', 'dnf（RHEL／Fedora）'], rows: [
          ['更新套件清單', '`apt update`，要自己執行', '中繼資料過期時自動重新下載；`dnf makecache` 手動更新，`dnf check-update` 列出可以更新的套件'],
          ['安裝', '`apt install 套件`', '`dnf install 套件`'],
          ['移除', '`apt remove`（保留設定檔）、`apt purge`（連設定檔刪除）', '`dnf remove`，沒有 purge 的區分；被修改過的設定檔通常另存為 `.rpmsave`'],
          ['移除不再需要的相依套件', '`apt autoremove`', '`dnf autoremove`'],
          ['升級', '`apt upgrade`', '`dnf upgrade`'],
          ['查詢', '`apt show`、`apt policy`、`apt list --upgradable`', '`dnf info`、`dnf list --showduplicates`、`dnf check-update`'],
          ['鎖定版本', '`apt-mark hold 套件`', '`dnf versionlock add 套件`（需要先安裝 versionlock 外掛），或在設定中以 `exclude=` 排除'],
          ['只套用安全更新', '`unattended-upgrades`（自動）', '`dnf upgrade --security`；自動化用 `dnf-automatic`'],
        ] },
        { type: 'p', text: '本課的終端機模擬 Ubuntu 24.04 的 apt 與 dpkg：套件庫、版本與相依性都是固定的資料，不會真的連上網路下載。dnf 只在課文中對照，換到 RHEL 系的機器時，把上表的指令換過去，觀念完全通用。' },
      ],
    },
    {
      id: 'lnx09-s-repo', title: '套件庫與套件清單：apt update 不是 apt upgrade',
      blocks: [
        { type: 'p', text: '套件庫（repository）是提供套件的伺服器，除了套件檔，還有一份索引：每個套件有哪些版本、依賴什麼，以及一個經過簽章的 `InRelease` 檔，讓 apt 驗證索引真的來自發行版。Ubuntu 的套件庫依用途分成幾個 suite，每個 suite 再依授權與支援方式分成 component：' },
        { type: 'table', head: ['名稱', '內容'], rows: [
          ['`noble`', 'Ubuntu 24.04 發行時的版本，之後不再變動'],
          ['`noble-updates`', '發行後的錯誤修正，也包含安全修正'],
          ['`noble-security`', '安全修正，由 `security.ubuntu.com` 提供'],
          ['`noble-backports`', '從較新版本移植回來的新功能（預設優先順序較低，不會自動升級過去）'],
          ['`main`、`restricted`', 'Canonical 支援的自由軟體；需要專有授權的驅動程式'],
          ['`universe`、`multiverse`', '社群維護的自由軟體；授權有限制的軟體'],
        ] },
        { type: 'p', text: '要用哪些套件庫寫在設定檔裡：Ubuntu 24.04 改用 deb822 格式的 `/etc/apt/sources.list.d/ubuntu.sources`，舊版本則是 `/etc/apt/sources.list` 裡一行一個的 `deb` 設定。第三方套件庫（例如 NodeSource 提供的 Node.js）另外放一個 `.sources` 或 `.list` 檔，並以 `Signed-By:` 指定它的簽章金鑰。加入套件庫等於讓對方可以替你的伺服器提供任何套件，包括取代系統內建的版本，所以只加入真正信任的來源。' },
        { type: 'p', text: 'apt 不會每次都上網查詢。它把每個套件庫的索引下載到本機的 `/var/lib/apt/lists/`，之後 `apt install`、`apt list`、`apt policy` 都只看這份本機清單。所以兩個名字很像的指令，做的是完全不同的事：' },
        { type: 'table', head: ['指令', '做什麼', '改變已安裝的軟體嗎'], rows: [
          ['`sudo apt update`', '從每個套件庫下載最新的索引，更新本機的套件清單，最後告訴你有幾個套件可以升級', '不會'],
          ['`sudo apt upgrade`', '比較每個已安裝套件的版本與清單中的候選版本，下載並安裝較新的版本', '會'],
          ['`apt list --upgradable`', '列出清單認為可以升級的套件與版本', '不會，也不需要 root'],
        ] },
        { type: 'p', text: '候選版本（Candidate）是啟用的套件庫中版本最高的那一個；版本依 Debian 的規則比較，例如 `3.0.13-0ubuntu3.5` 比 `3.0.13-0ubuntu3` 新。下面的紀錄在一台剛安裝好、從沒執行過 `apt update` 的主機 app-03 上進行：設定檔裡寫了四個 suite，但本機清單是空的。' },
        { type: 'example', id: 'lnx09-index' },
        { type: 'p', text: '讀這段紀錄：`E: Unable to locate package tree` 並不表示 Ubuntu 沒有 tree，而是本機清單還沒有任何內容。第一次 `apt policy openssl` 的候選版本是 `(none)`，表中只有 `/var/lib/dpkg/status`（優先順序 100，代表「已經安裝在這台機器上」）；`apt update` 從每個套件庫抓回索引（第一次是 `Get:`，清單已經是最新時是 `Hit:`）之後，候選版本變成 `3.0.13-0ubuntu3.5`，同時出現在 noble-updates 與 noble-security（優先順序 500）。但 `Installed:` 仍是舊版本，`apt list --installed` 也只把它們標記為 `upgradable to`：到這裡為止，沒有任何軟體被升級。' },
        { type: 'callout', tone: 'warning', title: 'apt update 不會升級任何軟體', text: '最常見的誤會是以為 `sudo apt update` 就是「更新系統」。它只更新套件清單，所有已安裝的程式都還是原來的版本，安全漏洞也還在。反過來，從不執行 `apt update` 的機器，`apt upgrade` 只會拿過期的清單比較，看不到新的修補，在全新的主機或容器裡甚至會出現 `Unable to locate package`。正確的順序永遠是先 `sudo apt update`，再 `sudo apt upgrade` 或 `sudo apt install`。' },
      ],
    },
    {
      id: 'lnx09-s-deps', title: '相依性：為什麼 apt 多裝了幾個套件',
      blocks: [
        { type: 'p', text: '很少有程式能獨立運作。套件在描述資料中宣告相依性（Depends），通常是它需要的共用程式庫：htop 要讀取網路與行程資訊，所以依賴 netlink 的兩個程式庫 libnl-3-200 與 libnl-genl-3-200。安裝時 apt 從你要求的套件出發，一路找出所有還沒安裝的相依套件，排出安裝順序（被依賴的先裝），再交給 dpkg。這就是安裝計畫裡幾段文字的意思：' },
        { type: 'table', head: ['apt 的輸出', '意思'], rows: [
          ['`The following additional packages will be installed:`', '你沒有指名、但為了相依性必須一起安裝的套件'],
          ['`The following NEW packages will be installed:`', '這次會新安裝的全部套件（你要的加上額外的）'],
          ['`0 upgraded, 3 newly installed, 0 to remove and 6 not upgraded.`', '升級、新安裝與移除的數量；最後的「not upgraded」是可以升級、但這個指令不會動到的套件'],
          ['`Do you want to continue? [Y/n]`', '計畫超出你的要求（多裝、移除、降版）時，apt 先詢問；`-y` 表示預先同意'],
        ] },
        { type: 'p', text: '套件管理器還會記住每個套件是怎麼來的：你指名安裝的是手動安裝（manual），為了相依性帶進來的是自動安裝（automatic）。`apt list --installed` 以 `[installed,automatic]` 標示，`apt show` 的 `APT-Manual-Installed:` 也看得到。這個標記決定了之後的 `apt autoremove` 會不會把它清掉；`sudo apt-mark manual 套件` 與 `sudo apt-mark auto 套件` 可以修改它。下面在 web-05 上安裝 htop：模擬環境沒有鍵盤，沒有 `-y` 時就像在詢問時直接按下 Ctrl+D，apt 中止（Abort）。' },
        { type: 'example', id: 'lnx09-install' },
        { type: 'p', text: '真實的 Debian 套件還有幾種較弱的關係：Recommends（預設也會一起安裝，`--no-install-recommends` 可以跳過，常用於精簡的容器映像）、Suggests（只是建議，不會自動安裝），以及 Conflicts、Breaks（不能同時存在的套件），相依性也可以附帶版本條件（例如 `libc6 (>= 2.34)`）。模擬環境只處理 Depends，而且沒有版本條件。真實的 `apt show` 也會多出 Maintainer、Installed-Size、Download-Size、Homepage 等欄位。' },
        { type: 'callout', tone: 'tip', title: '「you have held broken packages」不一定跟 hold 有關', text: '相依套件找不到或版本兜不攏時，apt 印出 unmet dependencies 的段落，最後一行常是 `E: Unable to correct problems, you have held broken packages.`。這句話出現在任何無法解決相依性的情況，不代表你真的鎖定了什麼。請往上讀 `Depends: … but it is not installable` 那幾行：通常是少了某個套件庫、套件庫清單過期，或混用了不同發行版的套件庫。' },
      ],
    },
    {
      id: 'lnx09-s-remove', title: '移除套件：remove、purge 與 autoremove',
      blocks: [
        { type: 'p', text: '套件放在 `/etc` 底下的檔案是設定檔（conffiles），dpkg 對它們特別小心：升級時不會悄悄蓋掉你改過的設定，移除時也預設保留。所以移除套件有三個指令，差別就在設定檔與相依套件：' },
        { type: 'table', head: ['指令', '移除程式檔', '刪除設定檔', '之後 `dpkg -l` 顯示'], rows: [
          ['`sudo apt remove 套件`', '是', '否，留在 /etc', '`rc`（removed，config-files 仍在）'],
          ['`sudo apt purge 套件`', '是', '是', '不再列出'],
          ['`sudo apt autoremove`', '移除「自動安裝、而且已沒有手動安裝的套件需要」的套件', '否（加 `--purge` 才刪除）', '有設定檔的變成 `rc`'],
        ] },
        { type: 'p', text: '保留設定檔是刻意的設計：暫時移除、日後重新安裝的服務會帶回你原本的設定。代價是 `remove` 之後，`/etc` 底下仍留著舊的設定與裡面的帳號、路徑甚至密碼。另外要注意，purge 只保證刪除套件登記的設定檔；資料庫的資料目錄、網站內容、程式執行後產生的檔案是否刪除，要看各套件的維護腳本，常見的作法是保留或先詢問。移除時，依賴被移除套件的其他套件也會一起被移除，所以按下同意之前，務必看清楚 `The following packages will be REMOVED:` 的清單。' },
        { type: 'p', text: '下面在測試主機 test-02 上移除 nginx。nginx-common 是當初自動安裝的相依套件，移除 nginx 之後，apt 提示它已經沒有人需要；`autoremove` 移除它，卻因為設定檔還在而留下 `rc`；最後 `purge` 才把 `/etc/nginx` 清掉（purge 一個 rc 狀態的套件只會刪除設定檔）。' },
        { type: 'example', id: 'lnx09-remove' },
        { type: 'p', text: '`dpkg -l` 每列開頭的兩個字母是「期望的狀態」與「目前的狀態」：`ii` 是要安裝、已安裝；`rc` 是要移除、只剩設定檔；`hi` 是被鎖定（hold）、已安裝。定期找出 `rc` 的套件再 purge，可以避免伺服器上堆積沒人記得的舊設定。' },
        { type: 'callout', tone: 'warning', title: '用 rm 刪設定檔不等於 purge', text: '手動 `sudo rm -r /etc/apache2` 看起來達到了 purge 的效果，但 dpkg 的資料庫仍記得 apache2 處於 `rc` 狀態，套件管理器與檔案系統從此對不上。真實的 dpkg 還把「設定檔被刪除」視為管理員刻意的修改：之後重新安裝同一個套件，通常不會補回被你刪掉的設定檔，服務可能因此啟動失敗（模擬環境沒有模擬這個細節）。要清除設定，請用 `apt purge`；想恢復成套件的預設設定，也是先 purge 再重新安裝。' },
      ],
    },
    {
      id: 'lnx09-s-hold', title: '查詢版本與版本鎖定：apt policy 與 apt-mark hold',
      blocks: [
        { type: 'p', text: '升級之前，先知道會發生什麼事。下列指令都只讀取資料，不需要 root：' },
        { type: 'table', head: ['指令', '回答的問題'], rows: [
          ['`apt list --upgradable`', '哪些套件可以升級，從哪個版本到哪個版本、來自哪個套件庫'],
          ['`apt list --installed`', '裝了哪些套件，哪些是自動安裝、哪些可以升級'],
          ['`apt show 套件`', '候選版本的說明、相依套件、來源套件庫'],
          ['`apt policy 套件`', '已安裝與候選版本，以及每個版本由哪些套件庫提供'],
          ['`dpkg -l [樣式]`、`dpkg -L 套件`', '套件的狀態（ii／rc／hi）；套件安裝了哪些檔案'],
          ['`apt-mark showhold`', '目前被鎖定的套件'],
        ] },
        { type: 'p', text: '`apt policy` 的 Version table 由新到舊列出每個版本，`***` 標示已安裝的那一個，數字是優先順序：一般套件庫是 500，`/var/lib/dpkg/status` 的 100 代表本機已安裝。優先順序相同時，版本較高的就是候選版本，所以 web-05 上 NodeSource 提供的 20.x 勝過 Ubuntu universe 裡的 18.19.1。要指定某個版本可以寫 `sudo apt install nodejs=20.17.0-1nodesource1`；要長期改變偏好，則是在 `/etc/apt/preferences.d/` 設定 pinning，屬於進階用法。' },
        { type: 'p', text: '版本鎖定（hold）是更直接的工具。`sudo apt-mark hold 套件` 讓 apt 保留這個套件目前的版本：`apt upgrade` 把它列在 `The following packages have been kept back:`，其他套件照常升級；明確的 `apt install` 若會改變它，加上 `-y` 也會被拒絕，除非另外加上 `--allow-change-held-packages`。`dpkg -l` 以 `hi` 標示，`sudo apt-mark unhold 套件` 解除。常見的理由是應用程式只在某個版本的執行環境或資料庫上驗證過，必須等測試環境確認後再升級。' },
        { type: 'example', id: 'lnx09-hold' },
        { type: 'callout', tone: 'warning', title: '鎖定是暫時的，不是永久的', text: '被鎖定的套件不會收到任何更新，包括安全更新：鎖定 openssl 兩年，就等於讓這兩年公開的漏洞都留在伺服器上。版本差距越拉越大，日後一次升級的風險也越高，其他套件若需要它的新版本，還會跟著被擋下（kept back）。每一次 hold 都應該記下原因、負責人與預計解除的時間，並定期用 `apt-mark showhold` 檢查；能用測試環境驗證新版本時，就盡快 unhold 並升級。' },
      ],
    },
    {
      id: 'lnx09-s-security', title: '安全更新與伺服器的更新策略',
      blocks: [
        { type: 'p', text: 'Ubuntu LTS 的安全更新通常不換成上游的新版本，而是由安全團隊把修補移植到同一個版本上，所以 OpenSSL 從 `3.0.13-0ubuntu3` 變成 `3.0.13-0ubuntu3.5`：上游版本號 3.0.13 不變，只有 Ubuntu 的修訂號增加。這讓穩定版本可以放心地持續套用安全更新，而不必擔心行為大幅改變。安全更新發布在 `noble-security`，並以 Ubuntu Security Notices（USN）公告受影響的套件與漏洞編號（CVE）。' },
        { type: 'p', text: '安全更新的價值在於快。Ubuntu 伺服器版預設安裝並啟用 `unattended-upgrades`：systemd 的計時器每天更新套件清單，並自動安裝來自 security 套件庫的更新，紀錄寫在 `/var/log/unattended-upgrades/`；預設設定（`/etc/apt/apt.conf.d/50unattended-upgrades`）只允許安全更新，也不會自動重新開機。RHEL 系的對應工具是 `dnf-automatic`，可以設定成只套用安全更新。模擬環境不執行這些背景服務，本課以手動的 `apt upgrade` 示範。' },
        { type: 'p', text: '有些更新裝好了還不算生效。核心升級會安裝一個新的核心套件（例如 linux-image-6.8.0-49-generic），和舊核心並存在 `/boot`，但正在執行的仍是開機時載入的那一個，必須重新開機才會換上；Ubuntu 在需要重新開機時會建立 `/var/run/reboot-required`，RHEL 系可以用 `needs-restarting -r` 檢查。同樣地，OpenSSL 這類共用程式庫更新後，已經在執行的服務仍使用記憶體中的舊程式庫，要重新啟動服務才會載入新版（Ubuntu 伺服器版常見的 needrestart 工具會在升級後列出需要重新啟動的服務）。下面的紀錄在 web-05 上不加思索地整批升級：' },
        { type: 'example', id: 'lnx09-kernel' },
        { type: 'p', text: '升級成功了，但仔細看清單：nodejs 也從 20.17 跳到 20.18，而應用程式還沒在新版上測試過；新核心已經裝好，`uname -r` 卻仍是 6.8.0-31-generic，核心的修補在重新開機前都沒有生效。正式伺服器的更新需要一套策略：' },
        { type: 'list', ordered: true, items: [
          '盤點：`sudo apt update` 後用 `apt list --upgradable` 列出變動，對照安全公告，分出安全更新與一般更新。',
          '安全更新自動化：讓 unattended-upgrades 每天套用 security 套件庫的修補，並監看它的紀錄。',
          '其他更新先進測試環境（staging）：在與正式環境相同版本的機器上升級，跑過應用程式的測試，再排進正式環境。',
          '在維護時段升級：事先公告，先備份或建立快照，準備好回復的方法（例如舊版本仍在套件庫時以 `apt install 套件=舊版本` 降版）。',
          '升級後驗證：檢查服務狀態，需要時重新啟動服務或重新開機；多台機器分批進行，不要同時重新開機整個叢集。',
          '暫時不能升級的套件用 `apt-mark hold` 鎖定，記下原因與解除的期限，不讓鎖定變成永久。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx09-q1', prompt: '在一台新主機上執行 `sudo apt update`，最後一行是 `4 packages can be upgraded.`。這時系統上的軟體是什麼狀態？',
      options: ['四個套件已經升級完成，只差重新開機', '沒有任何套件改變；apt 只下載了套件庫最新的索引，所以才知道有四個套件可以升級', '四個套件已經下載好，下次開機時自動安裝', '四個舊版本的套件已被移除，要用 `apt install` 重新安裝'],
      answer: 1,
      explanation: '`apt update` 只更新本機的套件清單（`/var/lib/apt/lists/`），比較後告訴你有幾個套件可以升級，已安裝的軟體一個都沒變；要真的升級得執行 `apt upgrade`。它沒有升級任何東西，所以談不上重新開機；也不會預先下載、排程到開機時安裝；更不會移除任何套件。',
    },
    {
      id: 'lnx09-q2', prompt: '`sudo apt install jq` 的計畫中出現 `The following additional packages will be installed: libjq1 libonig5`。為什麼？',
      options: ['apt 順便安裝熱門的推薦套件，用 `-y` 就可以拒絕', '這兩個套件有安全更新，apt 趁機一起安裝', 'jq 的安裝檔太大，被拆成三個套件下載', 'jq 依賴 libjq1，libjq1 又依賴 libonig5；apt 把缺少的相依套件一起安裝，並標記為自動安裝'],
      answer: 3,
      explanation: '套件宣告了相依性（Depends），apt 從 jq 出發找出所有還沒安裝的相依套件，列為 additional packages 一起安裝，並標記為 automatic。`-y` 是預先同意，不是拒絕；這兩個是新安裝的程式庫，與安全更新無關；套件也不會因為大小被拆開，它們是各自獨立、可被其他程式共用的套件。',
    },
    {
      id: 'lnx09-q3', prompt: '執行 `sudo apt remove -y nginx-common` 之後，`dpkg -l` 顯示 `rc  nginx-common`。這代表什麼？',
      options: ['程式檔已移除，但 `/etc` 底下的設定檔還在；`sudo apt purge nginx-common` 才會刪除它們', '移除失敗，nginx 還在執行，必須先停止服務', '套件被鎖定（hold），所以不能移除', '套件已經完全刪除，`rc` 是 removed completely 的縮寫'],
      answer: 0,
      explanation: '`rc` 的 r 表示期望的狀態是移除，c 表示目前只剩設定檔（config-files）；`remove` 刻意保留設定檔，`purge` 才會刪除。移除失敗不會顯示成 rc；被鎖定的套件顯示為 `hi`；rc 恰好表示「沒有完全刪除」，完全刪除的套件不會出現在 `dpkg -l` 裡。',
    },
    {
      id: 'lnx09-q4', prompt: '在 RHEL 9 上，對應 Ubuntu 的 `sudo apt-mark hold nginx` 的做法是哪一個？',
      options: ['`sudo dnf hold nginx`', '`dnf check-update nginx`', '`sudo dnf versionlock add nginx`（需要先安裝 versionlock 外掛），或在 dnf 設定中用 `exclude=` 排除它', '`sudo dnf mark install nginx`'],
      answer: 2,
      explanation: 'dnf 以 versionlock 外掛鎖定版本，`dnf versionlock add` 之後的升級會保留該版本；也可以在設定檔用 `exclude=` 讓 dnf 完全忽略這個套件。dnf 沒有 `hold` 子指令；`dnf check-update` 只列出可以更新的套件，不會鎖定；`dnf mark install` 是把套件標記為使用者安裝，相當於 `apt-mark manual`，與鎖定無關。',
    },
    {
      id: 'lnx09-q5', prompt: '執行 `sudo apt-mark hold nodejs` 之後，再執行 `sudo apt upgrade -y`，結果是？',
      options: ['apt 拒絕執行，必須先 `apt-mark unhold nodejs` 才能升級任何套件', 'nodejs 仍被升級，因為 hold 只對 `apt install` 有效', 'nodejs 被移除，因為它無法升級到新版', 'nodejs 列在 kept back、保留目前的版本，其他可以升級的套件照常升級'],
      answer: 3,
      explanation: 'hold 讓 apt 在升級時保留該套件，`apt upgrade` 把它列在 `The following packages have been kept back:`，其餘套件照常升級。hold 不會擋住整個升級；它對 `apt upgrade` 與 `apt install` 都有效（後者加 `-y` 會直接報錯）；apt 也不會因為套件被鎖定就把它移除。',
    },
    {
      id: 'lnx09-q6', prompt: '團隊兩年前在正式伺服器上執行 `sudo apt-mark hold openssl`，之後就忘了這件事。最主要的風險是什麼？',
      options: ['這兩年 openssl 的安全更新都沒有套用，已公開的漏洞一直留在伺服器上', 'hold 只維持一年，到期後 openssl 會被自動移除', 'hold 讓 `apt update` 無法下載任何套件清單', '沒有風險，被鎖定的版本不會再出現新的漏洞'],
      answer: 0,
      explanation: '被鎖定的套件不會收到任何更新，安全修補也一樣，而 OpenSSL 這類套件的漏洞會被公開並被利用；版本差距拉大後，日後升級也更困難。hold 沒有期限，也不會導致套件被移除；它不影響 `apt update` 下載清單；漏洞是在舊程式碼中被發現的，鎖定版本不會讓它變安全。',
    },
    {
      id: 'lnx09-q7', prompt: '`sudo apt upgrade -y` 安裝了 linux-image-6.8.0-49-generic，但 `uname -r` 仍然印出 `6.8.0-31-generic`。為什麼？',
      options: ['升級失敗了，要再執行一次 `apt upgrade`', '`uname -r` 讀的是套件清單，要先執行 `apt update`', '新核心已經裝進 /boot，但正在執行的仍是開機時載入的舊核心，重新開機後才會換上', '新核心必須用 `apt-mark hold` 標記之後才會生效'],
      answer: 2,
      explanation: '核心套件只是把新核心安裝到 /boot，與舊核心並存；正在執行的核心要到重新開機才會換掉，Ubuntu 會建立 `/var/run/reboot-required` 提醒。升級其實成功了，再執行一次也不會改變 `uname -r`；`uname` 回報的是正在執行的核心，與套件清單無關；hold 是阻止升級，不會讓任何東西生效。',
    },
    {
      id: 'lnx09-q8', prompt: '下列哪一個是正式伺服器比較合理的更新策略？',
      options: ['每天直接在正式環境執行 `sudo apt upgrade -y`，出問題再處理', '安全更新由 unattended-upgrades 自動套用；其他更新先在測試環境驗證，再於維護時段升級，並視需要重新啟動服務或重新開機', '為了穩定，把所有套件都 `apt-mark hold`，永遠不升級', '每天執行 `sudo apt update`，系統就會保持在最新狀態'],
      answer: 1,
      explanation: '安全修補要快，所以交給 unattended-upgrades 自動套用；可能改變行為的一般更新先在 staging 驗證，再於維護時段升級並處理重新開機。直接在正式環境整批升級，會把未經測試的新版本（例如 Node.js）帶進正式環境；全部鎖定等於放棄安全更新；`apt update` 只更新清單，不會升級任何東西。',
    },
  ],
  terminal: {
    machines: [appHost, webHost, testHost],
    examples: [
      {
        id: 'lnx09-index', title: '先有清單，才找得到套件', machine: 'app',
        description: '新主機從沒下載過套件清單：apt 找不到 tree，也不知道 openssl 有新版；`sudo apt update` 之後候選版本出現了，已安裝的版本卻完全沒變。',
        steps: [
          { command: 'cat /etc/apt/sources.list.d/ubuntu.sources', output: 'Types: deb\nURIs: http://archive.ubuntu.com/ubuntu\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu\nSuites: noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' },
          { command: 'sudo apt install tree', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nE: Unable to locate package tree' },
          { command: 'apt policy openssl', output: 'openssl:\n  Installed: 3.0.13-0ubuntu3\n  Candidate: (none)\n  Version table:\n *** 3.0.13-0ubuntu3 100\n        100 /var/lib/dpkg/status' },
          { command: 'sudo apt update', output: 'Get:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease\nGet:3 http://archive.ubuntu.com/ubuntu noble-backports InRelease\nGet:4 http://security.ubuntu.com/ubuntu noble-security InRelease\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n4 packages can be upgraded. Run \'apt list --upgradable\' to see them.' },
          { command: 'apt policy openssl', output: 'openssl:\n  Installed: 3.0.13-0ubuntu3\n  Candidate: 3.0.13-0ubuntu3.5\n  Version table:\n     3.0.13-0ubuntu3.5 500\n        500 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages\n        500 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages\n *** 3.0.13-0ubuntu3 500\n        500 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\n        100 /var/lib/dpkg/status' },
          { command: 'apt list --installed', output: 'Listing... Done\ncurl/noble,now 8.5.0-2ubuntu10 amd64 [installed,upgradable to: 8.5.0-2ubuntu10.6]\nlibcurl4t64/noble,now 8.5.0-2ubuntu10 amd64 [installed,automatic,upgradable to: 8.5.0-2ubuntu10.6]\nlibssl3t64/noble,now 3.0.13-0ubuntu3 amd64 [installed,automatic,upgradable to: 3.0.13-0ubuntu3.5]\nopenssl/noble,now 3.0.13-0ubuntu3 amd64 [installed,upgradable to: 3.0.13-0ubuntu3.5]' },
        ],
      },
      {
        id: 'lnx09-install', title: '安裝與相依性', machine: 'web',
        description: '`htop` 需要兩個 netlink 程式庫：沒有 `-y` 時 apt 列出計畫、詢問後中止，加上 `-y` 才安裝；兩個相依套件被標記為自動安裝。',
        steps: [
          { command: 'sudo apt install htop', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following additional packages will be installed:\n  libnl-3-200 libnl-genl-3-200\nThe following NEW packages will be installed:\n  htop libnl-3-200 libnl-genl-3-200\n0 upgraded, 3 newly installed, 0 to remove and 6 not upgraded.\nDo you want to continue? [Y/n] Abort.' },
          { command: 'sudo apt install -y htop', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following additional packages will be installed:\n  libnl-3-200 libnl-genl-3-200\nThe following NEW packages will be installed:\n  htop libnl-3-200 libnl-genl-3-200\n0 upgraded, 3 newly installed, 0 to remove and 6 not upgraded.\nSelecting previously unselected package libnl-3-200.\nPreparing to unpack .../libnl-3-200_3.7.0-0.3build1_amd64.deb ...\nUnpacking libnl-3-200 (3.7.0-0.3build1) ...\nSelecting previously unselected package libnl-genl-3-200.\nPreparing to unpack .../libnl-genl-3-200_3.7.0-0.3build1_amd64.deb ...\nUnpacking libnl-genl-3-200 (3.7.0-0.3build1) ...\nSelecting previously unselected package htop.\nPreparing to unpack .../htop_3.3.0-4build1_amd64.deb ...\nUnpacking htop (3.3.0-4build1) ...\nSetting up libnl-3-200 (3.7.0-0.3build1) ...\nSetting up libnl-genl-3-200 (3.7.0-0.3build1) ...\nSetting up htop (3.3.0-4build1) ...' },
          { command: 'apt show htop', output: 'Package: htop\nVersion: 3.3.0-4build1\nPriority: optional\nSection: utils\nDepends: libnl-3-200, libnl-genl-3-200\nAPT-Manual-Installed: yes\nAPT-Sources: http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\nDescription: interactive processes viewer\n' },
          { command: 'apt list --installed \'libnl*\'', output: 'Listing... Done\nlibnl-3-200/noble,now 3.7.0-0.3build1 amd64 [installed,automatic]\nlibnl-genl-3-200/noble,now 3.7.0-0.3build1 amd64 [installed,automatic]' },
          { command: 'ls -l /usr/bin/htop', output: '-rwxr-xr-x root    root        0 /usr/bin/htop' },
        ],
      },
      {
        id: 'lnx09-remove', title: 'remove、autoremove 與 purge', machine: 'test',
        description: '`remove` 移除 nginx 並提示 nginx-common 已沒有人需要；`autoremove` 移除它卻留下設定檔（`rc`）；`purge` 才刪除 `/etc/nginx`。',
        steps: [
          { command: 'sudo apt remove -y nginx', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following packages were automatically installed and are no longer required:\n  nginx-common\nUse \'sudo apt autoremove\' to remove it.\nThe following packages will be REMOVED:\n  nginx\n0 upgraded, 0 newly installed, 1 to remove and 0 not upgraded.\nRemoving nginx (1.24.0-2ubuntu7) ...' },
          { command: 'sudo apt autoremove -y', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following packages will be REMOVED:\n  nginx-common\n0 upgraded, 0 newly installed, 1 to remove and 0 not upgraded.\nRemoving nginx-common (1.24.0-2ubuntu7) ...' },
          { command: 'dpkg -l \'nginx*\'', output: 'Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version         Architecture Description\n+++-==============-===============-============-=========================================================\nrc  nginx-common   1.24.0-2ubuntu7 all          small, powerful, scalable web/proxy server - common files' },
          { command: 'ls /etc/nginx', output: 'nginx.conf' },
          { command: 'sudo apt purge -y nginx-common', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following packages will be REMOVED:\n  nginx-common*\n0 upgraded, 0 newly installed, 1 to remove and 0 not upgraded.\nPurging configuration files for nginx-common (1.24.0-2ubuntu7) ...' },
          { command: 'ls /etc/nginx', output: 'ls: cannot access \'/etc/nginx\': No such file or directory' },
        ],
      },
      {
        id: 'lnx09-hold', title: '查詢可升級的套件，鎖定一個版本', machine: 'web',
        description: '`apt list --upgradable` 與 `apt policy` 看出可升級的版本與來源；鎖定 nginx 之後，連明確的 `apt install -y nginx` 都被擋下，`dpkg -l` 顯示 `hi`。',
        steps: [
          { command: 'apt list --upgradable', output: 'Listing... Done\nlibssl3t64/noble-updates,noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3]\nlinux-image-generic/noble-updates,noble-security 6.8.0-49.49 amd64 [upgradable from: 6.8.0-31.31]\nnginx/noble-updates,noble-security 1.24.0-2ubuntu7.1 amd64 [upgradable from: 1.24.0-2ubuntu7]\nnginx-common/noble-updates,noble-security 1.24.0-2ubuntu7.1 all [upgradable from: 1.24.0-2ubuntu7]\nnodejs/nodistro 20.18.1-1nodesource1 amd64 [upgradable from: 20.17.0-1nodesource1]\nopenssl/noble-updates,noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3]' },
          { command: 'apt policy nodejs', output: 'nodejs:\n  Installed: 20.17.0-1nodesource1\n  Candidate: 20.18.1-1nodesource1\n  Version table:\n     20.18.1-1nodesource1 500\n        500 https://deb.nodesource.com/node_20.x nodistro/main amd64 Packages\n *** 20.17.0-1nodesource1 500\n        500 https://deb.nodesource.com/node_20.x nodistro/main amd64 Packages\n        100 /var/lib/dpkg/status\n     18.19.1+dfsg-6ubuntu5 500\n        500 http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages' },
          { command: 'sudo apt-mark hold nginx', output: 'nginx set on hold.' },
          { command: 'apt-mark showhold', output: 'nginx' },
          { command: 'sudo apt install -y nginx', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following held packages will be changed:\n  nginx\nThe following packages will be upgraded:\n  nginx\n1 upgraded, 0 newly installed, 0 to remove and 5 not upgraded.\nE: Held packages were changed and -y was used without --allow-change-held-packages.' },
          { command: 'dpkg -l nginx', output: 'Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version         Architecture Description\n+++-==============-===============-============-==========================================\nhi  nginx          1.24.0-2ubuntu7 amd64        small, powerful, scalable web/proxy server' },
          { command: 'sudo apt-mark unhold nginx', output: 'Canceled hold on nginx.' },
        ],
      },
      {
        id: 'lnx09-kernel', title: '整批升級與新的核心', machine: 'web',
        description: '沒有鎖定任何套件的整批升級：連 nodejs 也換成新版；新核心裝進 /boot，`uname -r` 仍是開機時載入的舊核心。',
        steps: [
          { command: 'sudo apt upgrade -y', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nCalculating upgrade... Done\nThe following NEW packages will be installed:\n  linux-image-6.8.0-49-generic\nThe following packages will be upgraded:\n  libssl3t64 linux-image-generic nginx nginx-common nodejs openssl\n6 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.\nPreparing to unpack .../libssl3t64_3.0.13-0ubuntu3.5_amd64.deb ...\nUnpacking libssl3t64 (3.0.13-0ubuntu3.5) over (3.0.13-0ubuntu3) ...\nSelecting previously unselected package linux-image-6.8.0-49-generic.\nPreparing to unpack .../linux-image-6.8.0-49-generic_6.8.0-49.49_amd64.deb ...\nUnpacking linux-image-6.8.0-49-generic (6.8.0-49.49) ...\nPreparing to unpack .../linux-image-generic_6.8.0-49.49_amd64.deb ...\nUnpacking linux-image-generic (6.8.0-49.49) over (6.8.0-31.31) ...\nPreparing to unpack .../nginx_1.24.0-2ubuntu7.1_amd64.deb ...\nUnpacking nginx (1.24.0-2ubuntu7.1) over (1.24.0-2ubuntu7) ...\nPreparing to unpack .../nginx-common_1.24.0-2ubuntu7.1_all.deb ...\nUnpacking nginx-common (1.24.0-2ubuntu7.1) over (1.24.0-2ubuntu7) ...\nPreparing to unpack .../nodejs_20.18.1-1nodesource1_amd64.deb ...\nUnpacking nodejs (20.18.1-1nodesource1) over (20.17.0-1nodesource1) ...\nPreparing to unpack .../openssl_3.0.13-0ubuntu3.5_amd64.deb ...\nUnpacking openssl (3.0.13-0ubuntu3.5) over (3.0.13-0ubuntu3) ...\nSetting up libssl3t64 (3.0.13-0ubuntu3.5) ...\nSetting up linux-image-6.8.0-49-generic (6.8.0-49.49) ...\nSetting up linux-image-generic (6.8.0-49.49) ...\nSetting up nginx (1.24.0-2ubuntu7.1) ...\nSetting up nginx-common (1.24.0-2ubuntu7.1) ...\nSetting up nodejs (20.18.1-1nodesource1) ...\nSetting up openssl (3.0.13-0ubuntu3.5) ...' },
          { command: 'uname -r', output: '6.8.0-31-generic' },
          { command: 'ls /boot', output: 'vmlinuz-6.8.0-31-generic  vmlinuz-6.8.0-49-generic' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx09-jq', title: '在新主機上安裝 jq', machine: 'app',
        statement: 'app-03 是剛裝好的主機，從來沒有執行過 `apt update`。部署腳本需要命令列的 JSON 工具 `jq`：請用 apt 安裝它（learner 在 sudo 群組裡），連同它需要的程式庫一起裝好，讓 `/usr/bin/jq` 出現在系統上。',
        checks: [
          { kind: 'package', name: 'jq' },
          { kind: 'package', name: 'libjq1' },
          { kind: 'package', name: 'libonig5' },
          { kind: 'exists', path: '/usr/bin/jq', type: 'file' },
        ],
        solution: ['sudo apt update', 'sudo apt install -y jq', 'apt list --installed \'*jq*\''],
        mistakes: [
          { commands: ['apt install -y jq'], why: '安裝會改變系統，需要 root：沒有 sudo 的 apt 拿不到 dpkg 的鎖定檔（`/var/lib/dpkg/lock-frontend`），印出 Permission denied 與 are you root?，什麼都沒有安裝。' },
          { commands: ['sudo apt install -y jq'], why: '這台主機的套件清單從來沒有下載過，apt 不知道任何套件庫裡有 jq，所以是 `E: Unable to locate package jq`；要先 `sudo apt update`。' },
          { commands: ['sudo apt update', 'sudo apt install jq'], why: 'jq 需要另外安裝 libjq1 與 libonig5，apt 列出計畫後詢問 `Do you want to continue? [Y/n]`；模擬環境沒有鍵盤，視同沒有回答而中止（Abort）。加上 `-y` 表示同意。' },
          { commands: ['sudo apt update', 'sudo apt upgrade -y'], why: '`apt upgrade` 只升級已經安裝的套件，不會安裝新的 jq。' },
        ],
        hints: [
          '`apt install` 找不到套件時，先想想 apt 的套件清單是從哪裡來的。',
          '新主機上的第一步是 `sudo apt update`，下載每個套件庫的索引。',
          'apt 會詢問是否安裝額外的相依套件；在模擬環境中用 `sudo apt install -y jq` 直接同意。',
        ],
        explanation: '`apt install` 只在本機的套件清單中找套件，而這台主機的清單是空的，所以要先 `sudo apt update` 從套件庫下載索引。之後 `sudo apt install -y jq` 解析相依性：jq 需要 libjq1，libjq1 又需要 libonig5，apt 把兩個程式庫列在 additional packages 並一起安裝，標記為自動安裝（`[installed,automatic]`）。少了 sudo 拿不到 dpkg 的鎖定；少了 `-y` 則停在詢問。',
      },
      {
        id: 'lnx09-purge', title: '把 Apache 移除乾淨', machine: 'test',
        statement: '測試主機 test-02 決定只留 nginx。請把 `apache2` 完全移除：套件本身與它在 `/etc/apache2` 的設定檔都不要留下，當初為了它自動安裝的 `apache2-bin`、`apache2-data`、`apache2-utils` 也一併移除。nginx 與它的設定不要動。',
        checks: [
          { kind: 'package', name: 'apache2', absent: true, purged: true },
          { kind: 'package', name: 'apache2-bin', absent: true },
          { kind: 'package', name: 'apache2-data', absent: true },
          { kind: 'package', name: 'apache2-utils', absent: true },
          { kind: 'absent', path: '/etc/apache2' },
          { kind: 'package', name: 'nginx' },
          { kind: 'unchanged', path: '/etc/nginx' },
        ],
        solution: ['sudo apt purge -y apache2', 'sudo apt autoremove -y', 'dpkg -l'],
        mistakes: [
          { commands: ['sudo apt remove -y apache2', 'sudo apt autoremove -y'], why: '`remove` 保留設定檔：apache2 變成 `rc` 狀態，`/etc/apache2` 仍在。要連設定一起刪除得用 `purge`。' },
          { commands: ['sudo apt purge -y apache2'], why: 'apache2 與設定檔都刪除了，但 apache2-bin、apache2-data、apache2-utils 是自動安裝的相依套件，仍然留在系統上；apt 已提示用 `sudo apt autoremove` 移除它們。' },
          { commands: ['sudo apt remove -y apache2', 'sudo rm -r /etc/apache2', 'sudo apt autoremove -y'], why: '手動刪掉目錄不等於 purge：dpkg 的資料庫仍記得 apache2 處於 `rc`（設定檔殘留）狀態，套件管理器與檔案系統對不上。' },
          { commands: ['sudo apt purge apache2', 'sudo apt autoremove'], why: '移除套件一律會詢問是否繼續；沒有 `-y`，模擬環境沒有鍵盤可以回答，兩個指令都中止了。' },
          { commands: ['apt purge -y apache2', 'apt autoremove -y'], why: '移除套件需要 root，沒有 sudo 只會得到無法取得 dpkg 鎖定的錯誤。' },
        ],
        hints: [
          '`apt remove` 與 `apt purge` 的差別就在 `/etc` 底下的設定檔。',
          '移除 apache2 之後，apt 會告訴你哪些自動安裝的套件已經沒有人需要。',
          '`sudo apt purge -y apache2`，再 `sudo apt autoremove -y`。',
        ],
        explanation: '`apt purge` 移除套件並刪除它的設定檔，所以 apache2 不會留下 `rc` 紀錄，`/etc/apache2` 也消失。apache2-bin、apache2-data、apache2-utils 是安裝 apache2 時自動帶進來的，現在沒有任何手動安裝的套件需要它們，`apt autoremove` 把它們移除（它們沒有設定檔，所以不會留下 rc；有設定檔的話可以用 `apt autoremove --purge`）。一次寫出全部四個名稱的 `sudo apt purge -y apache2 apache2-bin apache2-data apache2-utils` 也正確。nginx-common 仍被 nginx 需要，autoremove 不會碰它。',
      },
      {
        id: 'lnx09-report', title: '回報哪些套件可以升級', machine: 'app',
        statement: '主管要在維護時段前看到 app-03 上「有哪些套件可以升級、從哪個版本到哪個版本」。這台主機從沒更新過套件清單。請讓終端機印出可升級套件的清單（`apt` 的格式），只回報，不要升級任何套件。',
        checks: [
          { kind: 'output' },
          { kind: 'package', name: 'openssl', version: '3.0.13-0ubuntu3' },
          { kind: 'package', name: 'curl', version: '8.5.0-2ubuntu10' },
        ],
        solution: ['sudo apt update', 'apt list --upgradable'],
        mistakes: [
          { commands: ['apt list --upgradable'], why: '套件清單從來沒有下載過，apt 不知道套件庫裡有更新的版本，只印出 `Listing... Done`；要先 `sudo apt update`。' },
          { commands: ['sudo apt update'], why: '`apt update` 只說「4 packages can be upgraded」，沒有列出是哪些套件與版本；它提示的下一步是 `apt list --upgradable`。' },
          { commands: ['sudo apt update', 'sudo apt upgrade -y', 'apt list --upgradable'], why: '題目只要回報，這裡卻把套件都升級了，清單因此變成空的。' },
          { commands: ['sudo apt update', 'apt list --installed'], why: '`--installed` 列出所有已安裝的套件（每行標記 upgradable to），不是只列可以升級的那些，格式也不同。' },
        ],
        variants: [
          { label: '另一台 arm64 主機', files: [], host: 'app-04', system: { machine: 'aarch64' } },
        ],
        hints: [
          '新主機要先 `sudo apt update`，apt 才知道套件庫裡有哪些新版本。',
          '`apt update` 最後一行告訴你下一步該執行什麼。',
          '`apt list --upgradable` 只讀資料，不需要 sudo。',
        ],
        explanation: '`sudo apt update` 從每個套件庫下載索引，之後 apt 才能比較「已安裝的版本」與「候選版本」。`apt list --upgradable` 每一行是 `名稱/套件庫 新版本 架構 [upgradable from: 舊版本]`，正好是維護前要看的內容，而且不改變系統。直接打出清單的文字不會通過：在另一台 arm64 主機上，同樣的指令印出的架構欄不同。',
      },
      {
        id: 'lnx09-hold-upgrade', title: '鎖定 Node.js，升級其他套件', machine: 'web',
        statement: 'web-05 上的應用程式只在 Node.js 20.17 上測試過，新版還沒在測試環境驗證。請讓 `nodejs` 維持目前的版本 `20.17.0-1nodesource1`，並在之後的升級中也保持鎖定；其他所有可以升級的套件（包括 openssl 的安全更新、nginx 與核心）都升級到最新版。',
        checks: [
          { kind: 'package', name: 'nodejs', version: NODE_OLD, held: true },
          { kind: 'package', name: 'openssl', version: OPENSSL_NEW },
          { kind: 'package', name: 'libssl3t64', version: OPENSSL_NEW },
          { kind: 'package', name: 'nginx', version: NGINX_NEW },
          { kind: 'package', name: 'linux-image-generic', version: '6.8.0-49.49' },
        ],
        solution: ['apt list --upgradable', 'sudo apt-mark hold nodejs', 'sudo apt upgrade -y', 'apt-mark showhold'],
        mistakes: [
          { commands: ['sudo apt upgrade -y'], why: '沒有鎖定，nodejs 也跟著升級到 20.18.1。' },
          { commands: ['sudo apt-mark hold nodejs', 'sudo apt update'], why: '`apt update` 只更新套件清單，什麼都沒有升級；升級要用 `apt upgrade`。' },
          { commands: ['apt-mark hold nodejs', 'sudo apt upgrade -y'], why: '沒有 sudo 的 `apt-mark hold` 失敗了（requires superuser privilege），nodejs 沒有被鎖定，接著就被升級。' },
          { commands: ['sudo apt-mark hold nodejs', 'sudo apt upgrade'], why: '升級會詢問是否繼續；沒有 `-y`，模擬環境沒有鍵盤可以回答，所以中止，openssl 等套件都沒有升級。' },
          { commands: ['sudo apt upgrade -y', 'sudo apt-mark hold nodejs'], why: '順序反了：先升級時 nodejs 已經變成 20.18.1，之後才鎖定，鎖住的是新版本。' },
        ],
        hints: [
          '先用 `apt list --upgradable` 看清楚哪些套件會變動。',
          '`sudo apt-mark hold 套件` 讓 apt 的升級保留它目前的版本（kept back）。',
          '鎖定要在升級之前；升級用 `sudo apt upgrade -y`。',
        ],
        explanation: '`sudo apt-mark hold nodejs` 在 dpkg 的資料中把 nodejs 標記為 hold，之後的 `apt upgrade` 把它列在 `The following packages have been kept back:`，其他五個套件照常升級，新的核心套件 linux-image-6.8.0-49-generic 也一起安裝。`apt-mark showhold` 可以確認目前鎖定了哪些套件。等新版 Node.js 在測試環境驗證過，記得 `sudo apt-mark unhold nodejs`，不要讓鎖定變成永久。',
      },
    ],
  },
};
