import type { TerminalFile, TerminalJournalEntry, TerminalMachine, TerminalProcess, TerminalRemote } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * SRV09 Server Firewalls with ufw and nftables (SRV-3, terminal-sim). A terminal lesson on the firewall profile (engine
 * stage E16): what a host firewall does and where it sits beside a cloud security group; ufw's default deny incoming and
 * allow outgoing, allow rules by port, protocol and application profile (OpenSSH, Nginx Full), source restriction and
 * limit for ssh, first-match rule order with status numbered, insert and delete (and the IPv6 copies); drop versus reject
 * as another host sees them (timed out versus refused, with nc and curl); connection tracking, why an open ssh session
 * survives ufw enable while a new one is dropped, and the lock-out it causes; and the same policy read in nftables
 * (nft list ruleset, a minimal input chain with ct state established,related and iif lo, the loopback pitfall, nft -c -f).
 * Machines: the admin workstation ops-ws (10.0.0.5, in the admin network 10.0.0.0/24) with two remotes, the web server
 * web-01 (public eth0 203.0.113.10, private eth1 10.0.0.30; nginx on 80 and 443, sshd on 22) and probe-01 (198.51.100.23,
 * a VM on the internet the team tests from). Four starting states of web-01: before any firewall, ufw live (with a stopped
 * report service on 8080), ufw with a wrong rule opened while testing MySQL, and nftables written by hand without
 * established and loopback rules. Host names, users and files are made up; public addresses come from RFC 5737. Every
 * transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const exe = (path: string): TerminalFile => file(path, '', 'root', 0o755);
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00' };
const WANTS = '/etc/systemd/system/multi-user.target.wants';
const SUDO = { groups: [{ name: 'sudo', members: ['learner'] }] };
const systemd = (time: string, unit: string, priority: number, message: string): TerminalJournalEntry => ({ time, unit, id: 'systemd', pid: 1, priority, message });

/** The web server's public address (eth0) and the probe on the internet. */
const PUBLIC = '203.0.113.10';
const PROBE = '198.51.100.23';

// ---- keys: learner on ops-ws logs in to web-01 and probe-01 with a key; both host keys are already known ------------------
const OPS_KEY = keyPair(`srv09-ops:learner:${HOME}/.ssh/id_ed25519`, 'learner@ops-ws');
const known = (host: string, seed: string) => `${host} ${hostKey(seed, host).publicLine.split(' ').slice(0, 2).join(' ')}\n`;
const learnerOn = [dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/authorized_keys`, `${OPS_KEY.publicLine}\n`, 'learner', 0o600)];
const opsFiles: TerminalFile[] = [
  dir('/etc'), dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700),
  file(`${HOME}/.ssh/id_ed25519`, OPS_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${OPS_KEY.publicLine}\n`, 'learner'),
  file(`${HOME}/.ssh/known_hosts`, known('web-01', 'srv09-web-01') + known('probe-01', 'srv09-probe-01'), 'learner'),
];

// ---- web-01: nginx on 80 and 443 for books.example.net, sshd on 22 --------------------------------------------------------
const SITE = `server {
    listen 80;
    listen 443 ssl;
    server_name books.example.net www.books.example.net;
    ssl_certificate /etc/ssl/books/fullchain.pem;
    ssl_certificate_key /etc/ssl/books/privkey.pem;
    root /var/www/books;
    index index.html;
}
`;
const REPORT_UNIT = '[Unit]\nDescription=Report UI (internal sales reports)\nAfter=network.target\n\n[Service]\nExecStart=/opt/report-ui/bin/report-ui --listen 0.0.0.0:8080\nUser=report\n\n[Install]\nWantedBy=multi-user.target\n';
const webFiles = (extra: TerminalFile[] = []): TerminalFile[] => [
  ...learnerOn, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/books', SITE),
  dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/books', '/etc/nginx/sites-available/books'),
  dir('/var'), dir('/var/www'), dir('/var/www/books'), file('/var/www/books/index.html', '<h1>Harbor Books</h1>\n'),
  ...extra,
];
type WebParts = Pick<TerminalRemote, 'firewall' | 'processes' | 'services' | 'programs' | 'journal' | 'responders'> & { files?: TerminalFile[]; users?: { name: string; uid: number; home?: string; shell?: string }[] };
const web = (id: string, parts: WebParts = {}): TerminalRemote => ({
  host: 'web-01', title: '網站伺服器 web-01', address: '10.0.0.30', hostKey: 'srv09-web-01', nginx: true,
  interfaces: [{ name: 'eth0', address: `${PUBLIC}/24` }, { name: 'eth1', address: '10.0.0.30/24' }],
  accounts: { users: [{ name: 'learner', uid: 1000 }, ...parts.users ?? []], groups: SUDO.groups },
  certificates: [{ id: `srv09-books-${id}`, cn: 'books.example.net', sans: ['books.example.net', 'www.books.example.net'], issuer: 'lets-encrypt-r11', chain: ['lets-encrypt-r11'],
    path: '/etc/ssl/books/fullchain.pem', key: '/etc/ssl/books/privkey.pem' }],
  files: webFiles(parts.files),
  ...parts.firewall ? { firewall: parts.firewall } : {}, ...parts.processes ? { processes: parts.processes } : {},
  ...parts.services ? { services: parts.services } : {}, ...parts.programs ? { programs: parts.programs } : {}, ...parts.journal ? { journal: parts.journal } : {},
  ...parts.responders ? { responders: parts.responders } : {},
});
const probe: TerminalRemote = {
  host: 'probe-01', title: '外部測試機 probe-01（網際網路上的 VM）', address: PROBE, hostKey: 'srv09-probe-01',
  accounts: { users: [{ name: 'learner', uid: 1000 }] }, files: learnerOn,
};
const ops = (id: string, title: string, server: TerminalRemote): TerminalMachine => ({
  id, title, user: 'learner', host: 'ops-ws', cwd: HOME, profile: 'firewall', ...CLOCK, address: '10.0.0.5', keySeed: 'srv09-ops',
  accounts: SUDO, files: opsFiles, remotes: [server, probe],
});

/** The rules a careful admin left on web-01 (ssh only from the admin network, the web to everyone). */
const LIVE_RULES = ['allow from 10.0.0.0/24 to any port 22 proto tcp', "allow 'Nginx Full'"];

// 1. Before any firewall: ufw inactive (examples 1 and 2, exercise 1).
const fresh = ops('srv09-ops', 'ops-ws（web-01 還沒有防火牆）', web('fresh'));

// 2. ufw live; the internal report UI on 8080 was stopped by last night's upgrade and never allowed (examples 3 and 4, exercise 2).
const REPORT_PROGRAM = '/opt/report-ui/bin/report-ui';
const live = ops('srv09-live', 'ops-ws（web-01 的 ufw 已啟用）', web('live', {
  firewall: { enabled: true, rules: LIVE_RULES },
  users: [{ name: 'report', uid: 996, home: '/opt/report-ui', shell: NOLOGIN }],
  files: [dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/report-ui.service', REPORT_UNIT), dir(WANTS),
    link(`${WANTS}/report-ui.service`, '/etc/systemd/system/report-ui.service'), dir('/opt'), dir('/opt/report-ui'), dir('/opt/report-ui/bin'), exe(REPORT_PROGRAM)],
  services: [{ unit: 'report-ui', active: 'inactive', since: '2026-11-22 03:12:40' }],
  programs: [{ path: REPORT_PROGRAM, listen: [{ port: 8080, fd: 7, http: 'report' }] }],
  responders: [{ id: 'report', server: 'report-ui/2.3', routes: [{ path: '/*', body: 'Harbor Books sales reports\n', type: 'text/plain' }] }],
  journal: [
    systemd('2026-11-22 03:12:40', 'report-ui', 6, 'Stopping report-ui.service - Report UI (internal sales reports)...'),
    systemd('2026-11-22 03:12:40', 'report-ui', 6, 'report-ui.service: Deactivated successfully.'),
    systemd('2026-11-22 03:12:40', 'report-ui', 6, 'Stopped report-ui.service - Report UI (internal sales reports).'),
  ],
}));

// 3. A MySQL test left 3306 open to everyone (exercise 3); the variant has other rules around it at the same numbers.
const MYSQL: TerminalProcess = { pid: 1050, user: 'mysql', command: '/usr/sbin/mysqld', stat: 'Ssl', listen: [{ port: 3306, fd: 23, backlog: 151 }] };
const mysqlUser = [{ name: 'mysql', uid: 113, home: '/nonexistent', shell: '/bin/false' }];
const MESSY_RULES = ['allow from 10.0.0.0/24 to any port 22 proto tcp', "allow 'Nginx Full'", 'allow 3306/tcp', 'allow from 10.0.0.0/24 to any port 9100 proto tcp', 'allow 443/udp'];
const OTHER_RULES = ['limit from 10.0.0.0/24 to any port 22 proto tcp', "allow 'Nginx HTTPS'", 'allow 3306/tcp', 'allow from 10.0.0.0/24 to any port 5432 proto tcp', 'allow 8443/tcp'];
const messyWeb = (rules: string[]) => web('messy', { firewall: { enabled: true, rules }, users: mysqlUser, processes: [MYSQL] });
const messy = ops('srv09-messy', 'ops-ws（web-01 有一條測試時留下的規則）', messyWeb(MESSY_RULES));

// 4. nftables written by hand (ufw not used): policy drop, no established and no loopback rule; Redis on 127.0.0.1 (exercise 4).
const NFT_BROKEN = `table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;
    ip saddr 10.0.0.0/24 tcp dport 22 accept
    tcp dport { 80, 443 } accept
  }
}
`;
const REDIS: TerminalProcess = { pid: 930, user: 'redis', command: '/usr/bin/redis-server 127.0.0.1:6379', stat: 'Ssl', listen: [{ port: 6379, address: '127.0.0.1', fd: 6, backlog: 511 }] };
const nft = ops('srv09-nft', 'ops-ws（web-01 改用 nftables）', web('nft', {
  firewall: { nftables: NFT_BROKEN }, users: [{ name: 'redis', uid: 115, home: '/var/lib/redis', shell: NOLOGIN }], processes: [REDIS],
  files: [file('/etc/nftables.conf', `#!/usr/sbin/nft -f\n\nflush ruleset\n\n${NFT_BROKEN}`, 'root', 0o755)],
}));

/** Exercise 4: the fixed /etc/nftables.conf, written with printf (the shell turns \n into new lines). */
const NFT_FIXED = '#!/usr/sbin/nft -f\n\nflush ruleset\n\ntable inet filter {\n  chain input {\n    type filter hook input priority filter; policy drop;\n    ct state established,related accept\n    iif lo accept\n    ip saddr 10.0.0.0/24 tcp dport 22 accept\n    tcp dport { 80, 443 } accept\n  }\n}\n';
const writeNft = (text: string) => `printf '${text.replace(/\n/g, '\\n')}' | sudo tee /etc/nftables.conf > /dev/null`;

export const SRV09: LessonContent = {
  lessonId: 'SRV09',
  motivation: '網站上線那天，web-01 每個監聽中的埠都對整個網際網路敞開：nginx 的 80 與 443 本來就要開，但 22 埠的 SSH 也一樣，幾分鐘之內就會有掃描程式來猜密碼；哪天有人為了測試讓 MySQL 綁在 0.0.0.0，資料庫也跟著曝光。主機防火牆讓伺服器自己決定「誰可以連到哪個埠」：預設拒絕所有連入，只為必要的服務寫允許規則，管理用的 SSH 只開放給管理網段。這一課在一台有公有與私有介面的網站伺服器上，用 Ubuntu 的 ufw 建立這樣的原則，弄懂規則的順序與編號，從網際網路上的另一台主機分辨丟棄（逾時）與拒絕（Connection refused），理解狀態追蹤為什麼讓開著的 SSH 工作階段不會斷、卻救不了新的連線，學會在啟用防火牆之前避免把自己鎖在外面，最後用 nftables 讀懂並修正同一套原則。',
  sections: [
    {
      id: 'srv09-s-role', title: '主機防火牆在哪裡、做什麼',
      blocks: [
        { type: 'p', text: '封包進到 Linux 主機之後，核心的 netfilter 框架在幾個固定的位置（hook）讓規則檢查它：送給本機程式的封包經過 input，本機程式送出的經過 output，只是路過（主機當路由器時）的經過 forward。主機防火牆就是掛在這些位置的規則：每個新的連線依序比對規則，第一條符合的規則決定放行（accept）、丟棄（drop）或拒絕（reject），都不符合時採用預設原則。它和 SRV01 談的綁定位址是兩道不同的關卡：防火牆在封包送到程式之前就做決定，所以程式綁在 0.0.0.0，防火牆仍然可以只讓某些來源連進來。' },
        { type: 'p', text: 'Ubuntu 上常見三個名字，其實是同一套核心機制的不同操作方式：' },
        { type: 'table', head: ['工具', '是什麼', '本課的用法'], rows: [
          ['`nftables`（指令 `nft`）', '目前核心的封包過濾框架與它的指令；規則寫成表（table）、鏈（chain）與規則', '後半段：讀懂與修正手寫的規則集'],
          ['`iptables`', '較舊的指令；較新的 Ubuntu 上它預設以 nf_tables 為後端（iptables-nft），寫進去的規則一樣由核心的 nftables 執行', '舊的教學與腳本仍常見；本課不使用'],
          ['`ufw`（Uncomplicated Firewall）', 'Ubuntu 的前端：用 `ufw allow 22/tcp` 這類簡單的句子產生 iptables 規則，並內建迴路介面與狀態追蹤等基本規則', '前半段：一般伺服器的日常管理'],
        ] },
        { type: 'p', text: '一台機器只選一種管理方式。ufw 維護它自己的那一組規則，你另外用 nft 加的規則和它同時存在、各自判斷，封包被誰擋下就很難看出來；在 ufw 啟用的真實機器上執行 `sudo nft list ruleset`，會看到 ufw 經由 iptables-nft 產生的大量 `ufw-` 開頭的鏈（模擬環境不列出它們）。' },
        { type: 'p', text: '雲端的安全群組（security group）是另一層：它在雲端業者的虛擬網路裡、封包到達虛擬機器之前就過濾。以 AWS 的安全群組為例，它只能寫允許規則、預設不允許任何連入，而且是有狀態的（允許的連線，回應自動放行）。兩者不互相取代：被安全群組擋掉的封包根本到不了主機，主機上的 ufw 看不到也記不到；主機防火牆則跟著機器走，換了平台，或安全群組被別人放寬時，它照樣生效。兩層一起用，就是縱深防禦（defense in depth）。' },
        { type: 'table', head: ['關卡', '在哪裡過濾', '誰管理', '被擋時用戶端看到'], rows: [
          ['雲端安全群組', '雲端的虛擬網路，封包到達虛擬機器之前', '雲端主控台或基礎設施程式碼', '通常是逾時（不回覆任何封包）'],
          ['主機防火牆（ufw、nftables）', '主機核心的 netfilter', '主機上的 root', '依規則：丟棄是逾時，拒絕是 Connection refused'],
          ['服務的綁定位址', '程式的 socket', '服務自己的設定', '只綁 127.0.0.1 時，其他主機得到 Connection refused'],
        ] },
        { type: 'p', text: '本課的三台主機。ops-ws 與 web-01 的私有介面在同一個管理網段，probe-01 代表網際網路上的任何一台主機：' },
        { type: 'table', head: ['主機', '位址', '角色'], rows: [
          ['ops-ws', '10.0.0.5（管理網段 10.0.0.0/24）', '你的管理員工作站；用金鑰 ssh 到另外兩台，在這裡 `web-01` 這個名稱對應 10.0.0.30'],
          ['web-01', 'eth0 `203.0.113.10`（公有）、eth1 `10.0.0.30`（私有）', '網站伺服器：nginx 在 80 與 443、sshd 在 22；你在這台有 sudo'],
          ['probe-01', '`198.51.100.23`', '團隊在網際網路上租的一台 VM，用來從外面測試 web-01 的公有位址'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'ufw 與 nft 的規則決定課程機器之間的 TCP 連線。IPv6 的判斷、UDP 的連線、`limit` 的頻率限制、ufw 寫在 `/etc/ufw` 的規則檔、ufw.service 與 nftables.service 都不模擬；雲端的安全群組只在課文說明。' },
      ],
    },
    {
      id: 'srv09-s-ufw', title: 'ufw：預設拒絕與允許規則',
      blocks: [
        { type: 'p', text: 'ufw 的出發點是預設原則。Ubuntu 的預設是拒絕連入（deny incoming）、允許連出（allow outgoing）、不轉送（routed disabled）。預設拒絕的意思是「沒有規則明確允許的連入都不要」：伺服器上有幾個程式在監聽都沒關係，只有寫了允許規則的埠對外開放；之後有人裝了新服務，它也不會意外曝光。允許連出讓伺服器照常更新套件、查詢 DNS、呼叫外部的 API。預設原則用 `sudo ufw default deny incoming` 這種寫法修改；除了 `ufw version` 這類說明，ufw 的指令（包括查看 status）都要 root 權限。' },
        { type: 'p', text: '允許規則可以依連接埠、協定或應用程式設定檔來寫：' },
        { type: 'table', head: ['寫法', '意思'], rows: [
          ['`sudo ufw allow 80/tcp`', 'TCP 80，任何來源'],
          ['`sudo ufw allow 22`', '沒有寫協定：TCP 與 UDP 的 22 都放行，通常比需要的多'],
          ['`sudo ufw allow 80,443/tcp`', '多個埠一定要寫協定，否則 `ERROR: Must specify \'tcp\' or \'udp\' with multiple ports`'],
          ['`sudo ufw allow 6000:6007/tcp`', '連續的埠範圍'],
          ['`sudo ufw allow OpenSSH`', '應用程式設定檔：openssh-server 套件放在 `/etc/ufw/applications.d` 的定義，等於 22/tcp'],
          ['`sudo ufw allow \'Nginx Full\'`', 'nginx 套件的設定檔，等於 80,443/tcp（名稱有空白要加引號）；另有 `Nginx HTTP`（80）與 `Nginx HTTPS`（443）'],
          ['`sudo ufw deny 23/tcp`、`sudo ufw reject 23/tcp`', '明確丟棄或拒絕（兩者的差別見「丟棄與拒絕」一節）'],
        ] },
        { type: 'p', text: '設定檔的好處是名稱說明了用途：`sudo ufw app list` 列出已安裝的設定檔，`sudo ufw app info 名稱` 顯示它包含哪些埠。沒有指定 IPv4 位址的規則會同時加一份 IPv6 的副本（輸出的 `Rules updated (v6)`），因為伺服器的 IPv6 位址也是一個入口。' },
        { type: 'p', text: '規則可以在啟用之前先加好：停用時 `sudo ufw status` 只印 `Status: inactive`，`sudo ufw show added` 列出已經加入的規則。啟用用 `sudo ufw enable`，之後開機也會自動啟用。在 SSH 工作階段裡，ufw 會先警告可能中斷現有的 SSH 連線、要你回答 y；模擬環境沒有鍵盤，用 `echo y | sudo ufw enable` 或 `sudo ufw --force enable` 回答。下面是第一次在 web-01 上設定 ufw 的紀錄，採用常見的入門設定：開放 OpenSSH 與 Nginx Full。' },
        { type: 'example', id: 'srv09-ufw-first' },
        { type: 'p', text: '`status verbose` 的 Default 那一行確認了預設原則；動作欄的 `ALLOW IN` 表示連入方向，From 欄的 Anywhere 表示任何來源。這份設定讓網站正常運作，但 22 埠仍然對整個網際網路開放，「來源限制」一節會把它收緊。' },
      ],
    },
    {
      id: 'srv09-s-lockout', title: '狀態追蹤與避免把自己鎖在外面',
      blocks: [
        { type: 'p', text: '防火牆不只看單一封包，也記得連線。核心的連線追蹤（conntrack）為每條連線記錄狀態：建立連線的第一個 SYN 是 new，交握之後雙方往來的封包是 established，和既有連線相關的（例如回報這條連線錯誤的 ICMP 訊息）是 related。有狀態的防火牆只需要對 new 的封包做決定，之後屬於同一條連線的封包直接放行；所以允許連入 443 不必另外寫「允許回應送出去」，允許連出也不必為每個回應寫連入規則。這就是狀態追蹤。' },
        { type: 'p', text: 'ufw 在使用者規則之前先放一組自己的規則（before rules）：放行迴路介面 lo、放行 established 與 related 的封包，以及一些必要的 ICMP。這帶來一個常被誤解的結果：在 SSH 工作階段中啟用 ufw 時，眼前這條連線已經是 established，所以不會斷；但規則裡如果沒有允許 22，下一次新的 ssh 連線就被預設原則丟棄。下面的紀錄重現這個情況：' },
        { type: 'example', id: 'srv09-lockout' },
        { type: 'p', text: '啟用之後 `hostname` 照常回答，看起來一切正常；離開之後再連就逾時了，80 埠卻照常服務。真實的情況通常更糟：要到下次登入才發現，這時唯一的入口是雲端主控台的序列主控台（serial console）或機房的實體終端機。' },
        { type: 'callout', tone: 'warning', title: '「沒有斷線」不代表設定正確', text: '在 SSH 工作階段中啟用防火牆後，工作階段還能用，只證明了狀態追蹤放行既有的連線，不代表新的連線進得來。正確的驗證是另外開一個新的連線（`ssh web-01 hostname`，或從管理網段 `nc -zv web-01 22`），而且在新連線成功之前，不要關掉原本的工作階段。' },
        { type: 'p', text: '避免把自己鎖在外面的順序：' },
        { type: 'list', ordered: true, items: [
          '先加允許 SSH 的規則（只給管理網段更好，見下一節），用 `sudo ufw show added` 確認它在清單上。',
          '再啟用：`echo y | sudo ufw enable`。',
          '保留原本的工作階段，從管理員的機器開新的連線測試：`ssh web-01 hostname` 或 `nc -zv web-01 22`。',
          '新的連線成功之後才離開；失敗時用還開著的工作階段修正規則，或 `sudo ufw disable` 回到原狀。',
          '雲端主機另外確認安全群組也允許管理網段連 22，並知道序列主控台在哪裡，作為最後的退路。',
        ] },
        { type: 'p', text: '遠端修改防火牆時，另一個常見的保險是定時還原：先用 at 或 systemd-run 排一個幾分鐘後執行的 `ufw disable`，確認新的規則沒問題再取消它；萬一真的鎖在外面，幾分鐘後防火牆會自己停用。' },
      ],
    },
    {
      id: 'srv09-s-source', title: '來源限制、limit 與規則順序',
      blocks: [
        { type: 'p', text: '管理用的埠不需要對全世界開放。來源限制用 ufw 的完整寫法：`sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp` 只讓管理網段 10.0.0.0/24 連到本機任何位址的 TCP 22；`to any` 也可以換成某個本機位址，例如只開放私有介面的 10.0.0.30。指定了 IPv4 來源的規則只有 IPv4 一份（只印 `Rules updated`），`sudo ufw status` 的 From 欄顯示 `10.0.0.0/24`。' },
        { type: 'table', head: ['寫法', '效果'], rows: [
          ['`sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp`', '只有管理網段能連 SSH'],
          ['`sudo ufw allow from 10.0.0.0/24 to any port 9100 proto tcp`', '監控程式的埠只給內部的監控主機'],
          ['`sudo ufw allow in on eth1 to any port 5432 proto tcp`', '只接受從私有介面 eth1 進來的連線'],
          ['`sudo ufw deny from 198.51.100.23`', '某個來源的所有連入都丟棄'],
          ['`sudo ufw limit from 10.0.0.0/24 to any port 22 proto tcp`', '放行，但同一個來源連線太頻繁時拒絕它'],
        ] },
        { type: 'p', text: '`limit` 是 ufw 為 SSH 這類登入服務設計的動作：允許連線，但同一個來源位址在 30 秒內發起 6 次以上的連線時拒絕它，讓暴力猜密碼的程式慢下來（模擬環境的 limit 等同 allow，不計算頻率）。它不能取代金鑰登入與停用密碼登入（LNX12），只是多一道減速。' },
        { type: 'p', text: '規則的順序很重要：ufw 依序比對使用者的規則，第一條符合的就決定結果，後面的不再看；都不符合才用預設原則。新規則預設加在最後面，所以想封鎖某個來源時，排在 Nginx Full 允許規則後面的 deny，對 80 與 443 永遠輪不到它。`sudo ufw status numbered` 印出每條規則的編號，`sudo ufw insert 編號 規則` 插入到指定的位置，`sudo ufw delete 編號` 依編號刪除（會先問 y/n）。下面的紀錄在 ufw 已啟用的 web-01 上（22 只給管理網段、Nginx Full 給所有人），試著封鎖 probe-01：' },
        { type: 'example', id: 'srv09-order' },
        { type: 'p', text: '第一次的 deny 排在第 3 條，probe-01 連 443 時先符合第 2 條的 Nginx Full，照樣成功；刪掉它、用 `insert 1` 放到最前面之後，probe-01 的封包在第一條就被丟棄。注意編號也包含 IPv6 的副本（`(v6)` 那幾行排在所有 IPv4 規則後面），而且每刪一條，後面的編號就往前移一號。要刪好幾條時先看清楚、從編號大的刪起，或改用依內容刪除的 `sudo ufw delete allow 3306/tcp`，它一次刪掉 IPv4 與 IPv6 兩份。' },
      ],
    },
    {
      id: 'srv09-s-drop', title: '丟棄與拒絕：從另一台主機看',
      blocks: [
        { type: 'p', text: '被擋下的封包有兩種處理方式，從用戶端看起來完全不同：' },
        { type: 'table', head: ['情況', '主機做什麼', '`nc -zv` 看到', '`curl` 看到'], rows: [
          ['丟棄（ufw 的 deny、nft 的 drop）', '默默丟掉 SYN，不回任何封包；用戶端重送 SYN 直到放棄', '`Connection timed out`（`-w 3` 時三秒後 `timed out: Operation now in progress`）', '有 `--connect-timeout 5` 時 `(28) … Timeout was reached`，沒有時要等兩分鐘左右'],
          ['拒絕（ufw 的 reject、nft 的 reject）', '回覆 TCP RST 或 ICMP 錯誤', '`Connection refused`', '`(7) … after 0 ms: Couldn\'t connect to server`'],
          ['放行，但沒有程式在監聽', '核心回覆 RST', '`Connection refused`', '`(7) … after 0 ms`'],
          ['放行，而且有程式在監聽', '交給程式處理', '`succeeded!`', '正常的 HTTP 回應'],
        ] },
        { type: 'p', text: '所以從用戶端看：逾時代表封包在路上被吃掉了（防火牆丟棄、主機不存在或路由不通）；refused 代表主機回覆了，可能是 reject 規則，也可能是那個埠沒有程式在監聽（SRV01 的情況）；成功代表防火牆與服務都通了。下面從 probe-01 測試 ufw 已啟用的 web-01，中途把預設原則暫時改成 reject 比較，最後再改回 deny：' },
        { type: 'example', id: 'srv09-drop-reject' },
        { type: 'p', text: '22 埠只允許管理網段，8080 沒有任何規則，probe-01 的 SYN 都被預設原則丟棄：nc 等滿三秒、curl 等滿五秒才放棄。預設原則改成 reject 之後，同樣的連線立刻得到 refused。拒絕讓合法的用戶端馬上知道不必再等；丟棄則不透露主機與埠是否存在，也讓掃描變慢。對網際網路的預設通常用丟棄（ufw 的預設就是 deny），內部網路有時用拒絕，讓設定錯誤的程式快速失敗。' },
        { type: 'p', text: '排查「連不到」時把兩邊的資訊合起來：用戶端的 nc 或 curl 說是逾時還是 refused；伺服器上 `sudo ufw status` 說有沒有允許規則，`sudo ss -tlnp` 說有沒有程式在監聽、綁在哪個位址。逾時就先查防火牆（包括雲端的安全群組）；refused 而規則明明放行時，查服務有沒有執行、綁的位址對不對。修好一層之後，結果常常從逾時變成 refused：這代表防火牆通了，輪到服務。' },
        { type: 'callout', tone: 'tip', title: '不要用停用防火牆來修問題', text: '`sudo ufw disable` 之後連得上，只證明了問題在防火牆，卻讓整台機器失去保護。正確的修正是加一條範圍剛好的允許規則：只開那個埠、那個協定，能限制來源就限制來源。' },
      ],
    },
    {
      id: 'srv09-s-nft', title: '用 nftables 讀同一套原則',
      blocks: [
        { type: 'p', text: 'nftables 的規則集（ruleset）由表組成。表有一個家族：`ip` 只處理 IPv4、`ip6` 只處理 IPv6、`inet` 兩者都處理。表裡有鏈，掛在 hook 上的叫基礎鏈（base chain），第一行宣告 `type filter hook input priority filter; policy drop;`：filter 類型、掛在 input、優先順序 filter（數值 0）、沒有規則做出判決時的原則是 drop。規則由上往下比對，第一個做出判決（accept、drop、reject）的規則決定結果。`sudo nft list ruleset` 列出核心裡現在的全部規則，加上 `-a` 另外印出每條規則的 handle，刪除時用 `sudo nft delete rule inet filter input handle 編號`。' },
        { type: 'p', text: '和 ufw 不同，nft 不會替你加任何基本規則。一條最小而完整的 input 鏈至少要有這些：' },
        { type: 'table', head: ['規則', '為什麼需要'], rows: [
          ['`policy drop`', '預設拒絕：沒有規則放行的連入都丟棄'],
          ['`ct state established,related accept`', '狀態追蹤：放行既有連線的封包。沒有它，伺服器自己連出去（apt、DNS、外部的 API）的回應封包從 input 進來時會被 policy drop 丟掉；在 SSH 工作階段中改規則時，眼前的連線也要靠它'],
          ['`iif lo accept`', '放行迴路介面：本機程式連 127.0.0.1（nginx 到應用程式、應用程式到 Redis）的封包同樣經過 input 鏈'],
          ['`ip saddr 10.0.0.0/24 tcp dport 22 accept`', 'SSH 只給管理網段'],
          ['`tcp dport { 80, 443 } accept`', '網站對所有人開放；`{ }` 是集合'],
        ] },
        { type: 'p', text: 'ufw 的 before rules 永遠放行 lo，所以用 ufw 的人很少想到它；自己寫 nft 規則、把 policy 設成 drop 卻沒有 `iif lo accept` 時，本機連 127.0.0.1 的服務也會逾時，症狀是網站程式突然連不上本機的 Redis 或資料庫。下面的 web-01 改用 nftables 管理（ufw 沒有啟用），規則集是同事手寫的：' },
        { type: 'example', id: 'srv09-nft-read' },
        { type: 'p', text: '連 127.0.0.1:80 成功，只是因為 `tcp dport { 80, 443 } accept` 不管封包從哪個介面進來都放行；Redis 的 6379 沒有任何規則，連本機自己連都被 policy drop 丟棄。這份規則集也沒有 `ct state established,related accept`，伺服器連出去的回應同樣會被丟掉。`-a` 的 handle 是 nft 為每條規則編的號碼，和 ufw 的編號不同，刪掉一條不會讓其他規則的 handle 改變。' },
        { type: 'p', text: '修改規則集最安全的方式是寫成檔案、一次載入。`/etc/nftables.conf` 以 `flush ruleset` 開頭（先清空，避免同樣的規則重複加入），接著是完整的表與鏈；`sudo nft -c -f 檔案` 只檢查不套用，`sudo nft -f 檔案` 把整個檔案當成一次交易套用：有錯時完全不變，成功時新舊規則之間沒有空窗。Debian 與 Ubuntu 的 nftables.service 在開機時載入這個檔案（要先 `sudo systemctl enable nftables`）。相反地，在 SSH 工作階段中用 `nft add chain … policy drop;` 一條一條建立時，鏈一建立就開始丟封包，下一條放行的規則還來不及加，工作階段就斷了。' },
        { type: 'callout', tone: 'warning', title: '本機連本機也要經過防火牆', text: '很多人以為防火牆只管外面進來的連線。實際上送往 127.0.0.1 的封包同樣經過 netfilter 的 output 與 input，只是介面是 lo；policy drop 而沒有 `iif lo accept` 時，本機的服務彼此也連不上。ufw 替你放行了 lo，手寫 nft 時要自己加。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'srv09-q1', prompt: 'web-01 剛用 `echo y | sudo ufw enable` 啟用 ufw，還沒有加任何規則，預設原則也沒有改過。nginx 在 0.0.0.0:443 監聽。另一台主機連 web-01 的 443 會得到什麼？',
      options: ['`succeeded!`，因為 nginx 正在監聽', '逾時，因為預設的連入原則是 deny，SYN 被丟棄', '`Connection refused`，因為 ufw 的預設原則是 reject', '要看預設的連出原則是什麼'],
      answer: 1,
      explanation: 'Ubuntu 上 ufw 的預設是 deny incoming：沒有規則允許的新連線被默默丟棄，用戶端等到逾時。程式在監聽不代表連得進來，防火牆在封包送到程式之前就決定了；預設是 deny 而不是 reject，所以不會立刻 refused；連出原則只管這台機器自己發起的連線，和別人連進來無關。',
    },
    {
      id: 'srv09-q2', prompt: '要讓只有管理網段 10.0.0.0/24 能用 SSH 連到伺服器，下列哪一個 ufw 指令正確？',
      options: ['`sudo ufw allow OpenSSH`', '`sudo ufw allow 22`', '`sudo ufw deny from 10.0.0.0/24 to any port 22`', '`sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp`'],
      answer: 3,
      explanation: '完整寫法的 from 指定來源網段、port 與 proto 指定 TCP 22，其他來源落到預設的 deny。`allow OpenSSH` 與 `allow 22` 都沒有限制來源，任何人都能連（後者還多開了 UDP 22）；deny from 10.0.0.0/24 反而把管理網段擋在外面。',
    },
    {
      id: 'srv09-q3', prompt: '你透過 SSH 登入 web-01，只執行了 `sudo ufw allow \'Nginx Full\'` 與 `echo y | sudo ufw enable`。接下來會發生什麼事？',
      options: ['目前的工作階段繼續可用，但離開之後新的 ssh 連線會逾時', '目前的工作階段立刻凍結，因為 22 埠沒有被允許', 'ufw 發現 SSH 沒有被允許，拒絕啟用', '一切正常，因為 ufw 永遠允許 22 埠'],
      answer: 0,
      explanation: 'ufw 的 before rules 放行 established 的封包，開著的工作階段是既有連線，所以不會斷；新的 ssh 連線是 new 的封包，沒有規則允許 22，被預設原則丟棄而逾時。ufw 只會警告可能中斷 SSH，不會檢查你有沒有允許它，也沒有自動放行 22 的規則。',
    },
    {
      id: 'srv09-q4', prompt: '從 ops-ws 連 web-01 的 8080 一開始是逾時；管理員在 web-01 加了允許管理網段連 8080 的規則之後，變成 `Connection refused`。最合理的下一步是什麼？',
      options: ['把那條規則改成 `reject`，讓錯誤更明確', '再加一條 `sudo ufw allow 8080`，因為規則沒有生效', '在 web-01 上用 `sudo ss -tlnp` 與 `systemctl status` 確認 8080 有沒有程式在監聽', '停用 ufw 再試一次'],
      answer: 2,
      explanation: '從逾時變成 refused，表示封包已經通過防火牆、主機回覆了 RST：那個埠沒有程式在監聽，或程式只綁在 127.0.0.1，下一步是查服務。改成 reject 會讓連線被防火牆拒絕，離目標更遠；規則已經生效，再加一條沒有意義；停用防火牆只會讓整台機器失去保護，服務仍然沒有在監聽。',
    },
    {
      id: 'srv09-q5', prompt: '`sudo ufw status numbered` 顯示：[1] 22/tcp ALLOW IN 10.0.0.0/24、[2] Nginx Full ALLOW IN Anywhere、[3] Anywhere DENY IN 198.51.100.23。198.51.100.23 連這台伺服器的 443 會怎樣？',
      options: ['被第 3 條丟棄', '成功：第 2 條先符合，第 3 條不會被比對到', '`Connection refused`', '被第 1 條擋下，因為它不在管理網段'],
      answer: 1,
      explanation: 'ufw 依序比對，第一條符合的規則決定結果：443 屬於 Nginx Full，第 2 條就放行了，排在後面的 deny 永遠輪不到。要封鎖這個來源，得用 `sudo ufw insert 1 deny from 198.51.100.23` 放到前面；deny 是丟棄而不是拒絕，所以也不會出現 refused；第 1 條只比對 22 埠，和 443 無關。',
    },
    {
      id: 'srv09-q6', prompt: '手寫的 nft input 鏈是 `policy drop`，只放行 22、80 與 443，沒有 `ct state established,related accept`。在這台伺服器上執行 `sudo apt update` 會怎樣？',
      options: ['連線送出去了，但回應封包經過 input 時被丟棄，最後逾時失敗', '正常，因為 input 鏈只管別人主動連進來的連線', '正常，因為 `tcp dport { 80, 443 } accept` 也放行了套件伺服器的回應', 'nft 拒絕載入沒有 ct state 規則的規則集'],
      answer: 0,
      explanation: '伺服器連出去的連線，回應封包是從外面進來的，同樣經過 input 鏈；它們的目的埠是本機隨機的埠，不是 80 或 443，沒有任何規則符合，就被 policy drop 丟掉。input 鏈管的是所有送給本機的封包，不只是新連線；nft 不檢查規則集的內容是否合理，照樣會載入。',
    },
    {
      id: 'srv09-q7', prompt: '同一台伺服器（policy drop、沒有 `iif lo accept`）上，網站程式連 `127.0.0.1:6379` 的 Redis 逾時。最好的修正是什麼？',
      options: ['讓 Redis 改綁 0.0.0.0', '加一條 `tcp dport 6379 accept`', '把 policy 改成 accept', '加一條 `iif lo accept`，policy 維持 drop'],
      answer: 3,
      explanation: '送往 127.0.0.1 的封包從迴路介面 lo 經過 input 鏈，放行整個 lo 才能讓本機的每個服務彼此連線，又不影響外面的流量。Redis 改綁 0.0.0.0 不會讓封包通過防火牆，反而讓它暴露在其他介面上；只放行 6379 會讓任何介面進來的 6379 都通過，其他本機服務仍然不通；policy accept 等於拿掉預設拒絕。',
    },
    {
      id: 'srv09-q8', prompt: '雲端主機的安全群組已經只允許管理網段連 22、所有人連 80 與 443。主機上還需要設定 ufw 嗎？',
      options: ['不需要，兩者做的事完全相同', '不需要，安全群組的規則會自動同步成 ufw 的規則', '最好兩者都設：安全群組在封包到達主機前過濾，主機防火牆跟著機器走，在安全群組被放寬或設錯時仍然有效', '需要，而且要刪掉安全群組，避免兩層規則衝突'],
      answer: 2,
      explanation: '兩層在不同的位置過濾，互為備援，這是縱深防禦。安全群組在雲端的網路裡，主機防火牆在主機的核心裡，兩者不會互相同步；它們也不衝突，封包必須兩層都放行才進得來，所以沒有理由刪掉任何一層。',
    },
  ],
  terminal: {
    machines: [fresh, live, messy, nft],
    examples: [
      {
        id: 'srv09-ufw-first', title: '第一次在 web-01 上設定 ufw', machine: 'srv09-ops',
        description: '從 ops-ws 登入還沒有防火牆的 web-01。先看有哪些應用程式設定檔與 Nginx Full 包含的埠，加入 OpenSSH 與 Nginx Full，用 `show added` 確認；在 SSH 工作階段中 `ufw enable` 會先問 y/n，沒有回答就 Aborted，以 `echo y` 回答後才啟用。`status verbose` 顯示預設原則，以及每條規則的 IPv4 與 IPv6 兩份。',
        steps: [
          { command: 'ssh web-01', output: '' },
          { command: 'sudo ufw status', output: 'Status: inactive' },
          { command: 'sudo ufw app list', output: 'Available applications:\n  Nginx Full\n  Nginx HTTP\n  Nginx HTTPS\n  OpenSSH' },
          { command: "sudo ufw app info 'Nginx Full'", output: 'Profile: Nginx Full\nTitle: Web Server (Nginx, HTTP + HTTPS)\n\nDescription: Small, but very powerful and efficient web server\n\nPorts:\n  80,443/tcp' },
          { command: 'sudo ufw allow OpenSSH', output: 'Rules updated\nRules updated (v6)' },
          { command: "sudo ufw allow 'Nginx Full'", output: 'Rules updated\nRules updated (v6)' },
          { command: 'sudo ufw show added', output: 'Added user rules (see \'ufw status\' for running firewall):\nufw allow OpenSSH\nufw allow \'Nginx Full\'' },
          { command: 'sudo ufw enable', output: 'Command may disrupt existing ssh connections. Proceed with operation (y|n)? \n（模擬環境沒有鍵盤輸入：確認不會把自己鎖在外面之後，用 sudo ufw --force … 或 echo y | sudo ufw … 回答 y）\nAborted' },
          { command: 'echo y | sudo ufw enable', output: 'Command may disrupt existing ssh connections. Proceed with operation (y|n)? Firewall is active and enabled on system startup' },
          { command: 'sudo ufw status verbose', output: 'Status: active\nLogging: on (low)\nDefault: deny (incoming), allow (outgoing), disabled (routed)\nNew profiles: skip\n\nTo                         Action      From\n--                         ------      ----\nOpenSSH                    ALLOW IN    Anywhere\nNginx Full                 ALLOW IN    Anywhere\nOpenSSH (v6)               ALLOW IN    Anywhere (v6)\nNginx Full (v6)            ALLOW IN    Anywhere (v6)\n' },
          { command: 'exit', output: 'logout\nConnection to web-01 closed.' },
        ],
      },
      {
        id: 'srv09-lockout', title: '把自己鎖在外面', machine: 'srv09-ops',
        description: '同一台還沒有防火牆的 web-01，這次只允許 Nginx Full 就啟用。開著的工作階段靠狀態追蹤繼續運作（`hostname` 照常回答），離開之後新的 ssh 連線被預設原則丟棄而逾時；80 埠仍然正常。',
        steps: [
          { command: 'ssh web-01', output: '' },
          { command: "sudo ufw allow 'Nginx Full'", output: 'Rules updated\nRules updated (v6)' },
          { command: 'echo y | sudo ufw enable', output: 'Command may disrupt existing ssh connections. Proceed with operation (y|n)? Firewall is active and enabled on system startup' },
          { command: 'hostname', output: 'web-01' },
          { command: 'exit', output: 'logout\nConnection to web-01 closed.' },
          { command: 'ssh web-01 hostname', output: 'ssh: connect to host web-01 port 22: Connection timed out' },
          { command: 'nc -zv web-01 80', output: 'Connection to web-01 (10.0.0.30) 80 port [tcp/http] succeeded!' },
        ],
      },
      {
        id: 'srv09-order', title: '規則的順序：第一條符合的決定結果', machine: 'srv09-live',
        description: 'ufw 已啟用的 web-01：22 只給管理網段，Nginx Full 給所有人。附加在最後的 deny 擋不住 probe-01 的 443，因為第 2 條的 Nginx Full 先符合；依編號刪除會先要求確認，經由 ssh 執行時要用 `--force`；用 `insert 1` 放到最前面之後，probe-01 的連線被丟棄。',
        steps: [
          { command: `ssh web-01 sudo ufw deny from ${PROBE}`, output: 'Rules updated' },
          { command: `ssh probe-01 nc -zv ${PUBLIC} 443`, output: 'Connection to 203.0.113.10 443 port [tcp/https] succeeded!' },
          { command: 'ssh web-01 sudo ufw status numbered', output: 'Status: active\n\n     To                         Action      From\n     --                         ------      ----\n[ 1] 22/tcp                     ALLOW IN    10.0.0.0/24\n[ 2] Nginx Full                 ALLOW IN    Anywhere\n[ 3] Anywhere                   DENY IN     198.51.100.23\n[ 4] Nginx Full (v6)            ALLOW IN    Anywhere (v6)\n' },
          { command: 'ssh web-01 sudo ufw delete 3', output: 'Deleting:\n deny from 198.51.100.23 to any\nProceed with operation (y|n)? \n（模擬環境沒有鍵盤輸入：確認不會把自己鎖在外面之後，用 sudo ufw --force … 或 echo y | sudo ufw … 回答 y）\nAborted' },
          { command: 'ssh web-01 sudo ufw --force delete 3', output: 'Rule deleted' },
          { command: `ssh web-01 sudo ufw insert 1 deny from ${PROBE}`, output: 'Rule inserted' },
          { command: `ssh probe-01 nc -zv -w 3 ${PUBLIC} 443`, output: 'nc: connect to 203.0.113.10 port 443 (tcp) timed out: Operation now in progress' },
          { command: 'ssh web-01 sudo ufw status numbered', output: 'Status: active\n\n     To                         Action      From\n     --                         ------      ----\n[ 1] Anywhere                   DENY IN     198.51.100.23\n[ 2] 22/tcp                     ALLOW IN    10.0.0.0/24\n[ 3] Nginx Full                 ALLOW IN    Anywhere\n[ 4] Nginx Full (v6)            ALLOW IN    Anywhere (v6)\n' },
        ],
      },
      {
        id: 'srv09-drop-reject', title: '丟棄與拒絕：從 probe-01 看', machine: 'srv09-live',
        description: '從網際網路上的 probe-01 連 web-01 的公有位址：443 有規則放行而成功；22（只給管理網段）與 8080（沒有規則）被預設的 deny 丟棄，nc 與 curl 都等到逾時。把預設原則暫時改成 reject，同樣的連線立刻得到 refused，curl 是錯誤 7；最後改回 deny。',
        steps: [
          { command: `ssh probe-01 nc -zv ${PUBLIC} 443`, output: 'Connection to 203.0.113.10 443 port [tcp/https] succeeded!' },
          { command: `ssh probe-01 nc -zv -w 3 ${PUBLIC} 22`, output: 'nc: connect to 203.0.113.10 port 22 (tcp) timed out: Operation now in progress' },
          { command: `ssh probe-01 curl -sS --connect-timeout 5 http://${PUBLIC}:8080/`, output: 'curl: (28) Failed to connect to 203.0.113.10 port 8080 after 5000 ms: Timeout was reached' },
          { command: 'ssh web-01 sudo ufw default reject incoming', output: 'Default incoming policy changed to \'reject\'\n(be sure to update your rules accordingly)' },
          { command: `ssh probe-01 nc -zv ${PUBLIC} 22`, output: 'nc: connect to 203.0.113.10 port 22 (tcp) failed: Connection refused' },
          { command: `ssh probe-01 curl -sS http://${PUBLIC}:8080/`, output: 'curl: (7) Failed to connect to 203.0.113.10 port 8080 after 0 ms: Couldn\'t connect to server' },
          { command: 'ssh web-01 sudo ufw default deny incoming', output: 'Default incoming policy changed to \'deny\'\n(be sure to update your rules accordingly)' },
        ],
      },
      {
        id: 'srv09-nft-read', title: '讀同事手寫的 nftables 規則集', machine: 'srv09-nft',
        description: '這台 web-01 不用 ufw，規則由 `/etc/nftables.conf` 載入。`nft list ruleset` 顯示 inet 家族的 filter 表與 policy drop 的 input 鏈；本機連 127.0.0.1:80 因為有放行 80 的規則而成功，連 Redis 的 6379 卻逾時：沒有 `iif lo accept`。`-a` 印出每條規則的 handle。',
        steps: [
          { command: 'ssh web-01', output: '' },
          { command: 'sudo ufw status', output: 'Status: inactive' },
          { command: 'sudo nft list ruleset', output: 'table inet filter {\n\tchain input {\n\t\ttype filter hook input priority filter; policy drop;\n\t\tip saddr 10.0.0.0/24 tcp dport 22 accept\n\t\ttcp dport { 80, 443 } accept\n\t}\n}' },
          { command: 'nc -zv 127.0.0.1 80', output: 'Connection to 127.0.0.1 80 port [tcp/http] succeeded!' },
          { command: 'nc -zv -w 3 127.0.0.1 6379', output: 'nc: connect to 127.0.0.1 port 6379 (tcp) timed out: Operation now in progress' },
          { command: 'sudo nft -a list chain inet filter input', output: 'table inet filter { # handle 1\n\tchain input { # handle 1\n\t\ttype filter hook input priority filter; policy drop;\n\t\tip saddr 10.0.0.0/24 tcp dport 22 accept # handle 2\n\t\ttcp dport { 80, 443 } accept # handle 3\n\t}\n}' },
          { command: 'exit', output: 'logout\nConnection to web-01 closed.' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv09-secure-web', title: '替 web-01 設定只開放必要服務的防火牆', machine: 'srv09-ops',
        statement: 'web-01 還沒有啟用任何防火牆，所有監聽中的埠都對網際網路開放。請在 ops-ws 上用 `ssh web-01` 登入（金鑰已經設定好，你在 web-01 有 sudo），用 ufw 建立這個原則：預設拒絕連入；80 與 443 對所有人開放；22 只允許管理網段 10.0.0.0/24；然後啟用防火牆。過程中不能把自己鎖在外面：啟用之後，從 ops-ws 開新的 ssh 連線必須仍然成功；網際網路上的 probe-01 連 web-01 的公有位址 203.0.113.10 時，80 與 443 成功、22 逾時。',
        checks: [
          { kind: 'firewall', host: 'web-01', enabled: true, incoming: 'deny' },
          { kind: 'reach', to: 'web-01', port: 22, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 80, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 443, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 22, result: 'timeout' },
        ],
        solution: ['ssh web-01', 'sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp', "sudo ufw allow 'Nginx Full'", 'sudo ufw show added', 'echo y | sudo ufw enable', 'sudo ufw status verbose', 'exit',
          'ssh web-01 hostname', `ssh probe-01 nc -zv ${PUBLIC} 443`],
        mistakes: [
          { commands: ['ssh web-01', "sudo ufw allow 'Nginx Full'", 'echo y | sudo ufw enable', 'exit'], why: '沒有允許 SSH 就啟用：啟用時開著的工作階段靠狀態追蹤沒有斷，離開之後從 ops-ws 新開的 ssh 卻被預設原則丟棄而逾時，你被鎖在外面了。' },
          { commands: ['ssh web-01', 'sudo ufw allow OpenSSH', "sudo ufw allow 'Nginx Full'", 'echo y | sudo ufw enable', 'exit'], why: '`allow OpenSSH` 讓 22 對任何來源開放：probe-01 從網際網路連 22 也成功，沒有做到只給管理網段。' },
          { commands: ['ssh web-01', 'sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp', 'sudo ufw allow 80/tcp', 'echo y | sudo ufw enable', 'exit'], why: '`allow 80/tcp` 只開了 HTTP，忘了 443：probe-01 連 HTTPS 逾時，網站的 https:// 打不開。' },
          { commands: ['ssh web-01', 'sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp', "sudo ufw allow 'Nginx Full'", 'sudo ufw enable', 'exit'], why: '在 SSH 工作階段中直接 `sudo ufw enable`：ufw 問要不要繼續，沒有人回答就 Aborted，防火牆仍然沒有啟用，22 依舊對整個網際網路開放。' },
        ],
        hints: [
          '`sudo ufw app list` 看有哪些應用程式設定檔；`Nginx Full` 一次包含 80 與 443。',
          '來源限制的寫法是 `sudo ufw allow from 網段 to any port 埠 proto tcp`。',
          '先加規則、用 `sudo ufw show added` 確認，再啟用；在 SSH 工作階段中用 `echo y | sudo ufw enable` 回答確認。',
          '離開之後用 `ssh web-01 hostname` 開新的連線測試，再用 `ssh probe-01 nc -zv -w 3 203.0.113.10 22` 從外面確認 22 已經關上。',
        ],
        explanation: '先 `sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp` 讓管理網段保有 SSH，再 `sudo ufw allow \'Nginx Full\'` 開放 80 與 443（也可以寫成 `allow 80,443/tcp`），用 `sudo ufw show added` 確認兩條都在，最後才 `echo y | sudo ufw enable`。預設的連入原則本來就是 deny，所以來自網際網路的 22 與其他沒有規則的埠都被丟棄；`status verbose` 顯示 22/tcp 的來源是 10.0.0.0/24（只有 IPv4 一份），Nginx Full 有 IPv4 與 IPv6 兩份。啟用時開著的工作階段靠狀態追蹤存活，不能當成證據；真正的證據是離開之後 `ssh web-01 hostname` 仍然成功，而 probe-01 連 203.0.113.10 的 22 逾時、443 成功。想再加一層時，可以把 22 的 allow 換成 `limit`，讓同一個來源短時間內的大量連線被拒絕。',
      },
      {
        id: 'srv09-report-8080', title: '找出報表後台連不上的原因並正確修好', machine: 'srv09-live',
        statement: 'web-01 的 ufw 已經啟用。業務部門的報表後台 report-ui 在 web-01 的 TCP 8080 提供網頁，只給管理網段 10.0.0.0/24 使用；今天早上從 ops-ws 開 `http://web-01:8080/` 一直等到逾時。請從 ops-ws 診斷（例如先 `curl -sS --connect-timeout 5 http://web-01:8080/` 看是逾時還是被拒絕，再用 `ssh web-01 …` 在伺服器上查防火牆、監聽中的埠與服務），然後修好：從 ops-ws 要連得上 8080；網際網路上的 probe-01 連 203.0.113.10:8080 仍然要逾時；ufw 保持啟用，預設仍是拒絕連入。',
        checks: [
          { kind: 'reach', to: 'web-01', port: 8080, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 8080, result: 'timeout' },
          { kind: 'firewall', host: 'web-01', enabled: true, incoming: 'deny' },
          { kind: 'listen', host: 'web-01', port: 8080, process: 'report-ui' },
        ],
        solution: ['ssh web-01 sudo ufw status', 'ssh web-01 sudo ss -tlnp sport = :8080', 'ssh web-01 sudo ufw allow from 10.0.0.0/24 to any port 8080 proto tcp', 'ssh web-01 sudo systemctl start report-ui',
          'ssh web-01 sudo ss -tlnp sport = :8080', 'curl -sS http://web-01:8080/'],
        mistakes: [
          { commands: ['ssh web-01 sudo systemctl start report-ui'], why: '只啟動了服務：report-ui 現在在 8080 監聽，但 ufw 沒有允許 8080，ops-ws 的連線仍被預設原則丟棄而逾時。' },
          { commands: ['ssh web-01 sudo ufw allow from 10.0.0.0/24 to any port 8080 proto tcp'], why: '只加了防火牆規則：封包通過了，但 report-ui 還停著，8080 沒有程式在監聽，ops-ws 得到 Connection refused。' },
          { commands: ['ssh web-01 sudo ufw allow 8080/tcp', 'ssh web-01 sudo systemctl start report-ui'], why: '`allow 8080/tcp` 沒有限制來源：ops-ws 連得上了，但報表後台也對整個網際網路開放，probe-01 連 8080 成功。' },
          { commands: ['ssh web-01 sudo ufw disable', 'ssh web-01 sudo systemctl start report-ui'], why: '`ufw disable` 讓 8080 連得上，代價是整台伺服器失去防火牆：probe-01 連 8080 也成功了，22 與其他埠也一樣。' },
        ],
        hints: [
          '先在 ops-ws 上 curl 一次：逾時表示封包被丟棄，用 `ssh web-01 sudo ufw status` 看有沒有允許 8080 的規則。',
          '只給一個網段的允許規則：`sudo ufw allow from 10.0.0.0/24 to any port 8080 proto tcp`。',
          '加了規則之後再 curl 一次：變成 `(7) … Couldn\'t connect to server` 時，防火牆已經通了，換查服務：`ssh web-01 sudo ss -tlnp sport = :8080`、`ssh web-01 systemctl status report-ui`。',
          '啟動服務要 sudo：`ssh web-01 sudo systemctl start report-ui`。',
        ],
        explanation: 'ops-ws 的 curl 是 `(28) … Timeout was reached`：封包沒有得到任何回應。`sudo ufw status` 只有 22（管理網段）與 Nginx Full，8080 落到預設的 deny 而被丟棄；`sudo ss -tlnp sport = :8080` 只印出標題，表示同時也沒有程式在監聽——逾時只說明第一道關卡擋住了，後面還有沒有問題要一層一層看。加上 `sudo ufw allow from 10.0.0.0/24 to any port 8080 proto tcp` 之後，curl 變成 `(7) … after 0 ms`：主機回覆了 RST，防火牆已經放行，輪到服務。`systemctl status report-ui` 顯示 `inactive (dead) since … 03:12:40`，服務凌晨就被停止了，`sudo systemctl start report-ui` 之後 curl 拿到報表頁面。因為規則限制了來源，probe-01 連 8080 仍然逾時。',
      },
      {
        id: 'srv09-delete-number', title: '依編號刪除測試時留下的規則', machine: 'srv09-messy',
        statement: '同事為了測試，在 web-01 上執行過 `sudo ufw allow 3306/tcp`，讓 MySQL 對整個網際網路開放，之後忘了刪。請從 ops-ws 用 `ssh web-01 sudo ufw status numbered` 找出這條規則（IPv4 與 IPv6 各一條），依編號把兩條都刪掉，其他規則保持原樣，最後再執行一次 `ssh web-01 sudo ufw status numbered` 印出結果。經由 ssh 執行的指令沒有鍵盤可以回答 y，刪除時用 `sudo ufw --force delete 編號`。檢查時，你的指令也會在另一份規則清單上重新執行一次（其他規則不同，3306 的兩條仍在相同的編號）。',
        checks: [
          { kind: 'output' },
          { kind: 'firewall', host: 'web-01', rule: 'allow 3306/tcp', absent: true },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 3306, result: 'timeout' },
        ],
        solution: ['ssh web-01 sudo ufw status numbered', 'ssh web-01 sudo ufw --force delete 7', 'ssh web-01 sudo ufw --force delete 3', 'ssh web-01 sudo ufw status numbered'],
        mistakes: [
          { commands: ['ssh web-01 sudo ufw --force delete 3', 'ssh web-01 sudo ufw --force delete 7', 'ssh web-01 sudo ufw status numbered'], why: '先刪 3 再刪 7：刪掉第 3 條之後，原本第 7 條的 3306/tcp (v6) 變成第 6 條，第 7 條是 443/udp (v6)，結果刪錯了規則，3306 的 IPv6 副本還在。' },
          { commands: ['ssh web-01 sudo ufw --force delete 3', 'ssh web-01 sudo ufw --force delete 3', 'ssh web-01 sudo ufw status numbered'], why: '連續刪兩次第 3 條，以為第二次會刪到 v6 副本：第一次刪掉之後，第 3 條變成 9100/tcp，監控的規則被誤刪，3306 的 v6 副本還在。' },
          { commands: ['ssh web-01 sudo ufw --force delete 3', 'ssh web-01 sudo ufw status numbered'], why: '只刪了 IPv4 的那一條：3306/tcp (v6) 還在，伺服器的 IPv6 位址上 MySQL 仍然對外開放。' },
        ],
        variants: [{ label: '其他規則不同、3306 仍在第 3 與第 7 條的 web-01', files: [], remotes: [messyWeb(OTHER_RULES)] }],
        hints: [
          '`status numbered` 先列 IPv4 的規則，再列 `(v6)` 的副本；3306/tcp 出現兩次。',
          '刪掉一條之後，後面的編號都會往前移一號。',
          '從編號大的那條（v6）刪起，前面的編號就不會變；刪完再看一次 `status numbered`。',
        ],
        explanation: '`status numbered` 顯示 3306/tcp 是第 3 條、3306/tcp (v6) 是第 7 條。每刪一條，後面的編號就往前移，所以先 `sudo ufw --force delete 7` 再 `sudo ufw --force delete 3`，兩條都正確刪除，其他規則與順序不變；另一份清單的 3306 也在第 3 與第 7 條，同樣的指令印出它自己的結果。不必計算編號的寫法是依內容刪除：`sudo ufw delete allow 3306/tcp` 一次刪掉 IPv4 與 IPv6 兩條。刪除之後，probe-01 連 3306 被預設的 deny 丟棄；mysqld 仍然綁在 0.0.0.0，更好的做法是同時讓它只綁 127.0.0.1 或私有位址（SRV01），兩道關卡都設好。',
      },
      {
        id: 'srv09-nft-fix', title: '修正手寫的 nftables 規則集', machine: 'srv09-nft',
        statement: 'web-01 改用 nftables 管理（ufw 沒有啟用），開機時載入 `/etc/nftables.conf`。同事寫的規則集預設丟棄，只放行管理網段的 22 與所有人的 80、443，卻少了兩條基本規則：網站程式連本機 127.0.0.1:6379 的 Redis 逾時，伺服器自己連出去的回應也會被丟掉。請從 ops-ws 登入 web-01，改寫 `/etc/nftables.conf`：保留 `flush ruleset`、`policy drop` 與原本的兩條放行規則，加上放行既有連線（`ct state established,related accept`）與迴路介面（`iif lo accept`）的規則，先用 `sudo nft -c -f` 檢查，再用 `sudo nft -f` 載入。檔案可以用 `printf \'…\\n…\' | sudo tee /etc/nftables.conf > /dev/null` 一次寫入。',
        checks: [
          { kind: 'firewall', host: 'web-01', nftPolicy: 'drop', nftRule: 'ct state established,related accept' },
          { kind: 'firewall', host: 'web-01', nftRule: 'iif "lo" accept' },
          { kind: 'reach', from: 'web-01', to: '127.0.0.1', port: 6379, result: 'succeeded' },
          { kind: 'reach', to: 'web-01', port: 22, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 443, result: 'succeeded' },
          { kind: 'reach', from: 'probe-01', to: PUBLIC, port: 22, result: 'timeout' },
        ],
        solution: ['ssh web-01', 'sudo nft list ruleset', writeNft(NFT_FIXED), 'sudo nft -c -f /etc/nftables.conf', 'sudo nft -f /etc/nftables.conf', 'sudo nft list ruleset', 'nc -zv 127.0.0.1 6379', 'exit', 'nc -zv web-01 22'],
        mistakes: [
          { commands: ['ssh web-01', writeNft(NFT_FIXED.replace('policy drop', 'policy accept')), 'sudo nft -f /etc/nftables.conf', 'exit'], why: 'policy 改成 accept：127.0.0.1 與既有連線當然都通了，但沒有被規則放行的連入也全部放行，probe-01 從網際網路連 22 成功，預設拒絕不見了。' },
          { commands: ['ssh web-01', writeNft(NFT_FIXED.replace('    ct state established,related accept\n', '')), 'sudo nft -f /etc/nftables.conf', 'exit'], why: '少了 `ct state established,related accept`：本機連 Redis 好了，但伺服器自己連出去（apt、DNS、外部的 API）的回應仍然會被 policy drop 丟掉。' },
          { commands: ['ssh web-01', writeNft(NFT_FIXED.replace('iif lo accept', 'tcp dport 6379 accept')), 'sudo nft -f /etc/nftables.conf', 'exit'], why: '用 `tcp dport 6379 accept` 代替 `iif lo accept`：Redis 剛好連得上，可是任何介面進來的 6379 都被放行，本機其他連 127.0.0.1 的服務仍會逾時；該放行的是整個迴路介面。' },
          { commands: ['ssh web-01', writeNft(NFT_FIXED), 'sudo nft -c -f /etc/nftables.conf', 'exit'], why: '只用 `nft -c -f` 檢查了檔案，沒有用 `nft -f` 載入：核心裡仍是舊的規則集，Redis 照樣逾時。' },
          { commands: ['ssh web-01', 'sudo nft flush ruleset', 'sudo nft add table inet filter', "sudo nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'",
            'sudo nft add rule inet filter input ct state established,related accept', 'sudo nft add rule inet filter input iif lo accept'], why: '在工作階段中一條一條重建：`add chain … policy drop;` 一執行，鏈裡還沒有任何放行規則，這個 SSH 工作階段的封包立刻被丟棄而斷線，後面的指令其實在 ops-ws 上執行；web-01 只剩一條空的 drop 鏈，22、80、443 都進不去了。' },
        ],
        hints: [
          '`cat /etc/nftables.conf` 與 `sudo nft list ruleset` 先看現在的內容。',
          '兩條新規則寫在 input 鏈裡、原本的放行規則前面，一行一條。',
          'printf 的 `\\n` 會變成換行；寫完用 `cat /etc/nftables.conf` 檢查，`sudo nft -c -f /etc/nftables.conf` 沒有輸出代表語法正確。',
          '不要在工作階段中用 `nft add chain … policy drop;` 一條一條重建：鏈一建立就開始丟封包。',
        ],
        explanation: 'policy drop 的鏈只放行明確寫出的流量。`ct state established,related accept` 讓既有連線的封包通過，伺服器自己發起的連線（例如 apt 連到套件伺服器的 443）的回應才進得來；`iif lo accept` 放行迴路介面，本機程式彼此的連線（網站程式到 127.0.0.1:6379）不再被丟棄。寫成以 `flush ruleset` 開頭的檔案，先 `sudo nft -c -f` 檢查、再 `sudo nft -f` 一次套用，舊規則集到新規則集之間沒有空窗；新的規則集裡有放行管理網段 22 的規則，工作階段也就不會斷。`sudo nft list ruleset` 顯示的 `iif "lo"` 是 nft 印出介面名稱時加上的引號。',
      },
    ],
  },
};
