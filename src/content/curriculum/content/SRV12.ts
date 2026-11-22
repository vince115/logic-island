import { captureText, type CapPacket } from '@/lib/terminal/diag';
import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * SRV12 Network Diagnostic Tools (SRV-4, terminal-sim). A terminal lesson on the diagnostics profile (engine stage E19):
 * a bottom-up method for "it does not connect" — the local interface and route (ip -br addr, ip route, ip route get);
 * the name (getent hosts against dig and dig @ns1; systemd-resolved answers /etc/hosts entries too, with TTL 0; reading
 * dig's status, flags, TTL and SERVER); the host (ping, ICMP filtered by nftables while the service answers, Destination
 * Host Unreachable on the local network); the path (traceroute's silent hop, mtr --report's loss at one router versus
 * loss that persists to the end, UDP probes dropped by ufw and -I); the port (nc -zv succeeded / refused / timed out,
 * ss -tlnp on the server); the application (curl -v, curl -w's time_namelookup, time_connect, time_starttransfer and
 * time_total); and the wire (tcpdump -r: a full handshake, SYN answered by RST, SYN retransmitted without an answer).
 * Machines: the workstation ws-01 (10.0.0.10) with ns1 (BIND for corp.example), app-01 (nginx on 8080 in front of node
 * on 127.0.0.1:3000, ufw), db-01 (PostgreSQL, nft without ICMP), wiki-01, reports-01 (a slow /daily) and declared paths
 * to a partner on the internet; the exercises add a stale /etc/hosts line, nginx listening on 127.0.0.1:8080 only, a
 * capture of failed connections to a payment service (variants: RST, and a handshake answered by 503) and the slow
 * report (variant: the server far away). The simulated resolver always answers in 24 ms, so a slow resolver is text
 * only. Host names, users, addresses (RFC 1918, RFC 6598, RFC 5737, the reserved .example names) and files are made up. Every
 * transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const HOME = '/home/learner';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-22 06:00:00' };
const SUDO = { groups: [{ name: 'sudo', members: ['learner'] }] };

const APP = '10.0.2.21', DB = '10.0.2.30', WIKI = '10.0.2.41', WIKI_OLD = '10.0.2.40', REPORTS = '10.0.2.50', PAY = '10.0.2.60', DNS_SERVER = '10.0.0.2';
const PARTNER_API = '192.0.2.80', PARTNER_FILES = '192.0.2.90';

/** The company's internal zone and a partner's zone, as the DNS servers have them. */
const CORP_ZONE = `$ORIGIN corp.example.
$TTL 300
@        IN  SOA  ns1.corp.example. hostmaster.corp.example. ( 2026112201 3600 900 1209600 300 )
@        IN  NS   ns1.corp.example.
ns1      IN  A    ${DNS_SERVER}
app-01   IN  A    ${APP}
db-01    IN  A    ${DB}
wiki     IN  A    ${WIKI}
reports  IN  A    ${REPORTS}
pay      IN  A    ${PAY}
`;
const PARTNER_ZONE = `$ORIGIN partner.example.
$TTL 3600
@        IN  SOA  ns1.partner.example. hostmaster.partner.example. ( 2026111501 7200 900 1209600 3600 )
@        IN  NS   ns1.partner.example.
ns1      IN  A    192.0.2.53
api      IN  A    ${PARTNER_API}
files    IN  A    ${PARTNER_FILES}
`;
const INTERNET = [{ zone: 'partner.example', text: PARTNER_ZONE }];
const NAMED_LOCAL = 'zone "corp.example" {\n\ttype master;\n\tfile "/etc/bind/db.corp.example";\n};\n';
/** ns1: the office's DNS server (BIND), authoritative for corp.example. */
const nsRemote: TerminalRemote = {
  host: 'ns1', title: '內部 DNS 伺服器 ns1', address: DNS_SERVER, hostKey: 'srv12-ns1', named: true,
  files: [dir('/etc'), dir('/etc/bind'), file('/etc/bind/named.conf.local', NAMED_LOCAL, 'root', 0o644), file('/etc/bind/db.corp.example', CORP_ZONE, 'root', 0o644)],
};

// ---- keys: learner on ws-01 logs in to app-01 with a key; its host key is already known ---------------------------
const WS_KEY = keyPair(`srv12-ws:learner:${HOME}/.ssh/id_ed25519`, 'learner@ws-01');
const known = (host: string, seed: string) => `${host} ${hostKey(seed, host).publicLine.split(' ').slice(0, 2).join(' ')}\n`;
const learnerOn = [dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/authorized_keys`, `${WS_KEY.publicLine}\n`, 'learner', 0o600)];
const wsHome = [
  dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700),
  file(`${HOME}/.ssh/id_ed25519`, WS_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${WS_KEY.publicLine}\n`, 'learner'),
  file(`${HOME}/.ssh/known_hosts`, known('app-01', 'srv12-app-01'), 'learner'),
];

// ---- app-01: nginx on 8080 in front of the inventory API (node on 127.0.0.1:3000), ufw for the office network ------
const siteOf = (listen: string) => `server {
    listen ${listen};
    server_name app-01 app-01.corp.example;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`;
const appRemote = (listen: string): TerminalRemote => ({
  host: 'app-01', title: '應用程式伺服器 app-01', address: APP, hostKey: 'srv12-app-01', nginx: true,
  accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'inventory', uid: 995, home: '/srv/inventory', shell: '/usr/sbin/nologin' }], groups: SUDO.groups },
  files: [...learnerOn, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/inventory', siteOf(listen)),
    dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/inventory', '/etc/nginx/sites-available/inventory'), dir('/srv'), dir('/srv/inventory', 'inventory')],
  processes: [{ pid: 1010, user: 'inventory', command: 'node /srv/inventory/server.js', stat: 'Ssl', listen: [{ port: 3000, address: '127.0.0.1', fd: 19, backlog: 511, http: 'inventory' }] }],
  responders: [{ id: 'inventory', server: 'node', routes: [
    { path: '/health', body: 'inventory ok\n', type: 'text/plain' },
    { path: '/items', body: '[{"sku":"A-100","qty":42}]\n', type: 'application/json' },
  ] }],
  firewall: { enabled: true, rules: ['allow from 10.0.0.0/24 to any port 22 proto tcp', 'allow from 10.0.0.0/24 to any port 8080 proto tcp'] },
});

// ---- db-01: PostgreSQL behind an nft ruleset that answers no ping -------------------------------------------------
const DB_RULES = `table inet filter {
  chain input {
    type filter hook input priority filter; policy drop;
    ct state established,related accept
    iif lo accept
    ip saddr 10.0.0.0/16 tcp dport { 22, 5432 } accept
  }
}
`;
const dbRemote: TerminalRemote = {
  host: 'db-01', title: '資料庫 db-01', address: DB, hostKey: 'srv12-db-01', files: [],
  accounts: { users: [{ name: 'postgres', uid: 113, home: '/var/lib/postgresql', shell: '/bin/bash' }] },
  processes: [{ pid: 900, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', stat: 'Ss', listen: [{ port: 5432, fd: 6, backlog: 200 }] }],
  firewall: { nftables: DB_RULES },
};

// ---- the wiki and the reports server -------------------------------------------------------------------------------
const webd = (pid: number, http: string) => [{ pid, user: 'www-data', command: '/usr/local/bin/webd', stat: 'Ss', listen: [{ port: 80, fd: 5, http }] }];
const wikiRemote: TerminalRemote = {
  host: 'wiki-01', title: '內部 wiki wiki-01', address: WIKI, hostKey: 'srv12-wiki-01', files: [],
  processes: webd(920, 'wiki'),
  responders: [{ id: 'wiki', server: 'nginx/1.24.0 (Ubuntu)', routes: [{ path: '/*', body: '<h1>Corp Wiki</h1>\n' }] }],
};
const reportsRemote = (delay: number, latency: number): TerminalRemote => ({
  host: 'reports-01', title: '報表伺服器 reports-01', address: REPORTS, hostKey: 'srv12-reports-01', files: [], latency,
  processes: webd(930, 'reports'),
  responders: [{ id: 'reports', server: 'reportd/3.1', routes: [
    { path: '/daily', body: 'date,orders,revenue\n2026-11-21,1284,90213\n', type: 'text/csv', delay },
    { path: '/*', body: 'reports\n', type: 'text/plain' },
  ] }],
});

// ---- the paths to the partner: a router that does not answer, one that rate-limits ICMP, and loss that persists --------
const PATHS = [
  { hops: [{ address: '10.0.0.1', rtt: 0.4 }, { address: '100.64.0.1', rtt: 2.9 }, { address: '203.0.113.9', rtt: 0, silent: true as const },
    { address: '198.51.100.7', name: 'edge1.transit.example', rtt: 8.8, loss: 40 }, { address: '192.0.2.1', name: 'gw.partner.example', rtt: 10.3 },
    { address: PARTNER_API, name: 'api.partner.example', rtt: 10.7 }] },
  { hops: [{ address: '10.0.0.1', rtt: 0.4 }, { address: '100.64.0.1', rtt: 2.9 }, { address: '198.51.100.7', name: 'edge1.transit.example', rtt: 8.8 },
    { address: '198.51.100.30', name: 'core3.transit.example', rtt: 9.6, loss: 30 }, { address: '192.0.2.1', name: 'gw.partner.example', rtt: 10.4, loss: 30 },
    { address: PARTNER_FILES, name: 'files.partner.example', rtt: 10.9, loss: 30 }] },
];

type WsParts = { files?: TerminalFile[]; remotes?: TerminalRemote[]; captures?: TerminalMachine['captures'] };
const ws = (id: string, title: string, parts: WsParts = {}): TerminalMachine => ({
  id, title, user: 'learner', host: 'ws-01', cwd: HOME, profile: 'diagnostics', ...CLOCK, keySeed: 'srv12-ws', latency: 0.3,
  accounts: SUDO, files: [dir('/etc'), ...wsHome, ...parts.files ?? []], internet: INTERNET, paths: PATHS,
  remotes: parts.remotes ?? [appRemote('8080'), dbRemote, wikiRemote, reportsRemote(1.8, 0.25), nsRemote],
  ...parts.captures ? { captures: parts.captures } : {},
});

/** The transcripts' capture: a request that worked, a closed port (RST) and a port a firewall drops (SYN retransmitted). */
const OFFICE: CapPacket[] = [
  { t: 0, proto: 'tcp', src: '10.0.0.10:52110', dst: `${APP}:8080`, flags: 'S', seq: 1204331001, win: 64240 },
  { t: 0.00055, proto: 'tcp', src: `${APP}:8080`, dst: '10.0.0.10:52110', flags: 'S.', seq: 3390012211, ack: 1204331002, win: 65160 },
  { t: 0.0006, proto: 'tcp', src: '10.0.0.10:52110', dst: `${APP}:8080`, flags: '.', win: 502 },
  { t: 0.00065, proto: 'tcp', src: '10.0.0.10:52110', dst: `${APP}:8080`, flags: 'P.', win: 502, payload: 'GET /items HTTP/1.1\nHost: app-01:8080\nUser-Agent: curl/8.5.0\nAccept: */*\n\n' },
  { t: 0.0012, proto: 'tcp', src: `${APP}:8080`, dst: '10.0.0.10:52110', flags: '.', win: 509 },
  { t: 0.0031, proto: 'tcp', src: `${APP}:8080`, dst: '10.0.0.10:52110', flags: 'P.', win: 509, payload: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nContent-Type: application/json\nContent-Length: 27\n\n[{"sku":"A-100","qty":42}]\n' },
  { t: 0.0032, proto: 'tcp', src: '10.0.0.10:52110', dst: `${APP}:8080`, flags: 'F.', win: 502 },
  { t: 0.0037, proto: 'tcp', src: `${APP}:8080`, dst: '10.0.0.10:52110', flags: 'F.', win: 509 },
  { t: 0.0038, proto: 'tcp', src: '10.0.0.10:52110', dst: `${APP}:8080`, flags: '.', win: 502 },
  { t: 2.5, proto: 'tcp', src: '10.0.0.10:47316', dst: `${WIKI}:8080`, flags: 'S', seq: 551902377, win: 64240 },
  { t: 2.50055, proto: 'tcp', src: `${WIKI}:8080`, dst: '10.0.0.10:47316', flags: 'R.', seq: 0, ack: 551902378, win: 0 },
  { t: 5, proto: 'tcp', src: '10.0.0.10:39940', dst: `${DB}:6432`, flags: 'S', seq: 2760114093, win: 64240 },
  { t: 6.0213, proto: 'tcp', src: '10.0.0.10:39940', dst: `${DB}:6432`, flags: 'S', seq: 2760114093, win: 64240 },
  { t: 8.0693, proto: 'tcp', src: '10.0.0.10:39940', dst: `${DB}:6432`, flags: 'S', seq: 2760114093, win: 64240 },
];
const base = ws('srv12-ws', '工作站 ws-01', { captures: [{ path: '/var/tmp/office.pcap', start: '2026-11-22 09:30:12', packets: OFFICE }] });

// ---- exercise 1: a line left in /etc/hosts from before the wiki moved ------------------------------------------------
const hostsFile = (wikiLine: string) => `127.0.0.1 localhost
127.0.1.1 ws-01
10.0.2.21 app-01
10.0.2.30 db-01
10.0.2.50 reports-01
10.0.0.2 ns1
10.0.0.50 printer-3f
10.0.2.70 build.corp.example build
${wikiLine}
# The following lines are desirable for IPv6 capable hosts
::1 localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`;
const staleHosts = ws('srv12-hosts', '工作站 ws-01（/etc/hosts 有一行舊的記錄）', { files: [file('/etc/hosts', hostsFile(`${WIKI_OLD} wiki.corp.example wiki   # temporary, while DNS was being moved\n`))] });

// ---- exercise 2: nginx on app-01 listens on 127.0.0.1:8080 only --------------------------------------------------------
const loopback = ws('srv12-bind', '工作站 ws-01（app-01 的 nginx 只聽 127.0.0.1）', { remotes: [appRemote('127.0.0.1:8080'), dbRemote, wikiRemote, reportsRemote(1.8, 0.25), nsRemote] });

// ---- exercise 3: a capture of the checkout's connection attempts to pay-01 ------------------------------------------------
const C = '10.0.0.10';
const NOISE: CapPacket[] = [
  { t: 0, proto: 'tcp', src: `${C}:50122`, dst: `${APP}:22`, flags: 'P.', seq: 81201, ack: 66012, win: 501, length: 36 },
  { t: 0.0006, proto: 'tcp', src: `${APP}:22`, dst: `${C}:50122`, flags: 'P.', seq: 66012, ack: 81237, win: 501, length: 36 },
];
const dnsPay: CapPacket[] = [
  { t: 0.1, proto: 'udp', src: `${C}:48211`, dst: `${DNS_SERVER}:53`, dns: { id: 30561, name: 'pay.corp.example' } },
  { t: 0.1009, proto: 'udp', src: `${DNS_SERVER}:53`, dst: `${C}:48211`, dns: { id: 30561, name: 'pay.corp.example', answers: [`A ${PAY}`], response: true } },
];
const syn = (t: number, port: number, seq: number): CapPacket => ({ t, proto: 'tcp', src: `${C}:${port}`, dst: `${PAY}:8080`, flags: 'S', seq, win: 64240 });
const DROPPED: CapPacket[] = [...NOISE, ...dnsPay, syn(0.1012, 41702, 3011560001), syn(1.1356, 41702, 3011560001), syn(3.1836, 41702, 3011560001),
  { t: 4.2, proto: 'udp', src: `${C}:48213`, dst: `${DNS_SERVER}:53`, dns: { id: 30562, name: 'pay.corp.example' } },
  { t: 4.2008, proto: 'udp', src: `${DNS_SERVER}:53`, dst: `${C}:48213`, dns: { id: 30562, name: 'pay.corp.example', answers: [`A ${PAY}`], response: true } },
  syn(7.3116, 41702, 3011560001)];
const REFUSED: CapPacket[] = [...NOISE, ...dnsPay, syn(0.1012, 41702, 3011560001),
  { t: 0.1016, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41702`, flags: 'R.', seq: 0, ack: 3011560002, win: 0 },
  syn(1.1031, 41706, 1840022917), { t: 1.1035, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41706`, flags: 'R.', seq: 0, ack: 1840022918, win: 0 }];
const ANSWERED: CapPacket[] = [...NOISE, ...dnsPay, syn(0.1012, 41702, 3011560001),
  { t: 0.1016, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41702`, flags: 'S.', seq: 922101377, ack: 3011560002, win: 65160 },
  { t: 0.1017, proto: 'tcp', src: `${C}:41702`, dst: `${PAY}:8080`, flags: '.', win: 502 },
  { t: 0.1018, proto: 'tcp', src: `${C}:41702`, dst: `${PAY}:8080`, flags: 'P.', win: 502, payload: 'POST /v1/charges HTTP/1.1\nHost: pay.corp.example:8080\nContent-Length: 0\n\n' },
  { t: 0.1022, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41702`, flags: '.', win: 509 },
  { t: 0.1301, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41702`, flags: 'P.', win: 509, payload: 'HTTP/1.1 503 Service Unavailable\nContent-Length: 0\n\n' },
  { t: 0.1303, proto: 'tcp', src: `${C}:41702`, dst: `${PAY}:8080`, flags: 'F.', win: 502 },
  { t: 0.1306, proto: 'tcp', src: `${PAY}:8080`, dst: `${C}:41702`, flags: 'F.', win: 509 },
  { t: 0.1307, proto: 'tcp', src: `${C}:41702`, dst: `${PAY}:8080`, flags: '.', win: 502 }];
const PCAP = '/var/tmp/pay-8080.pcap', PCAP_START = '2026-11-22 09:41:07';
const pcapFile = (packets: CapPacket[]) => file(PCAP, captureText({ start: Date.parse(`${PCAP_START.replace(' ', 'T')}Z`) / 1000, packets }));
const payCapture = ws('srv12-pcap', '工作站 ws-01（結帳服務的擷取檔）', { captures: [{ path: PCAP, start: PCAP_START, packets: DROPPED }] });

// ---- exercise 4: the daily report is slow --------------------------------------------------------------------------------
const slow = ws('srv12-slow', '工作站 ws-01（報表很慢）');


/** curl's timing line (the format the lesson uses everywhere). */
const W = "-w 'dns=%{time_namelookup} connect=%{time_connect} start=%{time_starttransfer} total=%{time_total}\\n'";
const timing = (url: string) => `curl -s -o /dev/null ${W} ${url}`;
const REPORT_URL = 'http://reports.corp.example/daily';
const FIX_HOSTS = "sudo sed -i '/^10\\.0\\.2\\.40 /d' /etc/hosts";
const FIX_LISTEN = "sudo sed -i 's/listen 127.0.0.1:8080;/listen 8080;/' /etc/nginx/sites-available/inventory";

export const SRV12: LessonContent = {
  lessonId: 'SRV12',
  motivation: '「網站連不上」「API 一直逾時」「只有我打不開」是維運工作裡最常收到、也最模糊的回報。同一句「連不上」，背後可能是工作站沒有路由、名稱解析到舊的位址、防火牆丟掉了封包、服務只綁在 127.0.0.1，或伺服器其實有回應、只是回得很慢。憑感覺重開服務、停用防火牆，常常只是把問題藏起來。這一課練習一套由下而上的方法：從本機的介面與路由開始，依序確認名稱、主機、路徑、連接埠、應用程式，最後在需要時看封包本身；每一步用最合適的工具（ip、dig、ping、traceroute 與 mtr、nc 與 ss、curl、tcpdump）回答一個明確的問題，讀懂它的輸出，直到找出「連不上」發生在哪一層。',
  sections: [
    {
      id: 'srv12-s-method', title: '由下而上：把「連不上」拆成七個問題',
      blocks: [
        { type: 'p', text: '每一層都依賴它下面的層：名稱解析要靠網路送出查詢，HTTP 要先有 TCP 連線，TCP 連線要有路由能把封包送到對方。所以排查時由下往上問，每一步只回答一個問題，答案確定了才往上一層。這樣做的好處是不會在錯的地方花時間：名稱解析到舊的位址時，再怎麼檢查應用程式的設定都沒有用。反過來，用戶端的錯誤訊息本身常常已經指出是哪一層（`Could not resolve host` 是名稱、`Connection refused` 是埠），這時可以直接從那一層開始，但仍要確認它下面的層真的沒有問題。' },
        { type: 'table', head: ['步驟', '要回答的問題', '工具', '正常的樣子', '異常時代表什麼'], rows: [
          ['1 本機', '介面有位址嗎？往目的地的路由走哪裡？', '`ip -br addr`、`ip route`、`ip route get 位址`', '介面 UP、有位址；有 `default via` 閘道', '沒有位址或路由（`Network is unreachable`）：先修本機的網路設定'],
          ['2 名稱', '名稱解析成哪個位址？和 DNS 一致嗎？', '`getent hosts`、`dig`、`dig @伺服器`', '得到預期的位址', 'NXDOMAIN、SERVFAIL，或程式拿到的位址和 DNS 不同（`/etc/hosts`）'],
          ['3 主機', '主機有回應嗎？來回要多久？', '`ping -c 次數`', '有回覆、time 合理', '沒有回覆不一定是主機關機：ICMP 可能被防火牆擋掉'],
          ['4 路徑', '封包在哪一段被丟掉或變慢？', '`traceroute`、`mtr --report`', '每一跳都有回應、終點沒有遺失', '從某一跳開始、一路到終點都有遺失或都不回應'],
          ['5 埠', '那個埠有程式在聽嗎？封包到得了嗎？', '`nc -zv`（用戶端）、`ss -tlnp`（伺服器）', '`succeeded!`；LISTEN 在 0.0.0.0 或對外的位址', '`Connection refused`（主機回了 RST）、`timed out`（封包被丟棄）'],
          ['6 應用程式', '服務回了什麼？時間花在哪一段？', '`curl -v`、`curl -w`', '預期的狀態碼與內容、時間合理', '4xx／5xx，或某一段時間特別長'],
          ['7 線路上', '封包實際上怎麼來回？', '`tcpdump`（讀擷取檔用 `-r`）', '三向交握之後有請求與回應', 'SYN 沒有 SYN-ACK、對方回 RST'],
        ] },
        { type: 'p', text: '這七步不是每次都要全部做完，而是一張依序檢查的清單：用 `ip route get` 確認路由，用 `getent hosts` 確認程式拿到的位址，用 `nc -zv` 確認埠，三個指令就能排除大部分的情況。每一步都把結論記下來（例如「名稱 OK：10.0.2.21；埠 refused」），要找網路團隊或服務的負責人時，這份紀錄就是最有用的回報。' },
        { type: 'p', text: '本課的機器都在公司內網。你的工作站 ws-01 在辦公室網段，伺服器在另一個網段，往那裡的封包要經過閘道 10.0.0.1：' },
        { type: 'table', head: ['主機', '位址', '角色'], rows: [
          ['ws-01', '`10.0.0.10`（10.0.0.0/24）', '你的工作站；用金鑰 ssh 到 app-01，你在 app-01 有 sudo'],
          ['ns1', '`10.0.0.2`', '內部的 DNS 伺服器（BIND），管理 `corp.example` 區域'],
          ['app-01', '`10.0.2.21`', '倉儲 API：nginx 在 8080 轉給本機 127.0.0.1:3000 的 node 程式；ufw 只允許辦公室網段連 22 與 8080'],
          ['db-01', '`10.0.2.30`', 'PostgreSQL；nftables 只放行 22 與 5432，不回應 ping'],
          ['wiki-01、reports-01', '`10.0.2.41`、`10.0.2.50`', '內部 wiki 與報表伺服器'],
          ['api.partner.example、files.partner.example', '`192.0.2.80`、`192.0.2.90`', '合作廠商在網際網路上的服務，經過 ISP 與轉送業者的路由器'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '來回時間由課程宣告的延遲算出，網際網路上的路徑也由課程宣告，每次執行的結果都一樣；ping 與 traceroute 不會讓時鐘前進。`tcpdump` 只能用 `-r` 讀課程準備好的擷取檔（模擬的檔案格式，不是真正的 pcap），不能即時擷取。IPv6、反向 DNS（PTR）與 mtr 的全螢幕介面都不模擬。' },
      ],
    },
    {
      id: 'srv12-s-local', title: '第一、二步：本機的網路與名稱解析',
      blocks: [
        { type: 'p', text: '最底層的問題是「這台機器能不能把封包送出去」。`ip -br addr` 一行列出一個介面：狀態要是 UP、要有位址與前綴長度。`ip route` 列出路由表：`default via 10.0.0.1` 是預設閘道，`10.0.0.0/24 dev eth0 … scope link` 表示同一個網段直接送。`ip route get 位址` 回答更精確的問題：往這個位址的封包從哪個介面、經過哪個閘道、用哪個來源位址送出。目的地在另一個網段時會看到 `via 閘道`；沒有任何路由時是 `RTNETLINK answers: Network is unreachable`，那就不必往上查了。' },
        { type: 'p', text: '第二層是名稱。curl、ssh、nc、ping 這些程式都經由 glibc 解析名稱：依 `/etc/nsswitch.conf` 的 `hosts:` 設定，通常先查 `/etc/hosts`，找不到才問 `/etc/resolv.conf` 的 nameserver。Ubuntu 的 nameserver 是 `127.0.0.53`，也就是本機的 systemd-resolved，它再去問網路上真正的 DNS 伺服器並快取答案。`getent hosts 名稱` 走的正是這條路，所以它印出的就是程式實際拿到的位址。' },
        { type: 'p', text: '`dig` 則是自己組一個 DNS 查詢送給伺服器，本身不讀 `/etc/hosts`。不過不指定伺服器時，它問的是 127.0.0.53，而 systemd-resolved 預設也會用 `/etc/hosts` 的內容回答（`ReadEtcHosts=yes`），TTL 是 0。想知道 DNS 伺服器本身的資料，要用 `dig @ns1 名稱` 直接問它。下面在 ws-01 上依序檢查本機、路由與名稱：' },
        { type: 'example', id: 'srv12-local' },
        { type: 'p', text: '往 10.0.2.21 的封包經過閘道 10.0.0.1，ns1 在同一個網段則直接送。`dig` 的完整輸出可以這樣讀：' },
        { type: 'table', head: ['欄位', '這次的值', '意思'], rows: [
          ['`status`', '`NOERROR`', '查詢成功。`NXDOMAIN` 是名稱不存在，`SERVFAIL` 是伺服器無法取得答案（例如權威伺服器出問題），`REFUSED` 是伺服器不願意回答（例如不替你遞迴查詢）'],
          ['`flags`', '`qr rd ra`', 'qr：這是回應；rd：要求遞迴；ra：伺服器提供遞迴。權威伺服器直接回答時會有 `aa`'],
          ['ANSWER SECTION', '`wiki.corp.example. 300 IN A 10.0.2.41`', '名稱、剩餘的 TTL（秒）、類別、記錄類型、資料。從快取回答時 TTL 會往下數'],
          ['`Query time`', '`24 msec`', '這次花的時間；解析器必須向外查詢時較久，從快取回答接近 0'],
          ['`SERVER`', '`127.0.0.53#53`', '回答的是誰：本機的 systemd-resolved，不是 ns1 本身'],
        ] },
        { type: 'p', text: '`dig +noall +answer app-01` 的 TTL 是 0、名稱沒有網域：這筆答案來自 `/etc/hosts`，不是 DNS。直接問 ns1 時，`app-01.corp.example` 得到同樣的位址；只有短名稱 `app-01` 時，ns1 回 `REFUSED`，因為它只管 corp.example，不替別人遞迴查詢（回應裡的 `WARNING: recursion requested but not available` 也說明了這點）。' },
        { type: 'callout', tone: 'warning', title: '`dig` 查到的不一定是 DNS 的資料', text: '常見的誤解是「dig 一定繞過 /etc/hosts」。dig 本身不讀它，但它預設問的 systemd-resolved 會讀，所以 `/etc/hosts` 裡的舊記錄會讓 `dig 名稱` 與 `getent hosts` 一起給出錯的位址，看起來像是 DNS 錯了。要分辨，比較 `getent hosts 名稱` 與 `dig @DNS伺服器 名稱`：兩者不同，而且 TTL 是 0 時，答案來自 `/etc/hosts`。' },
      ],
    },
    {
      id: 'srv12-s-reach', title: '第三、四步：ping、traceroute 與 mtr',
      blocks: [
        { type: 'p', text: '`ping` 送出 ICMP echo request，對方回 echo reply。每一行的 `icmp_seq` 是序號，`ttl` 是回覆封包剩下的存活時間：Linux 送出時是 64，每經過一個路由器減 1，所以同一個網段的 ns1 是 64，經過閘道的 app-01 是 63；`time` 是來回時間。最後的統計列出送出與收到的數目、遺失率，以及最短、平均、最長與標準差（mdev）。模擬環境沒有 Ctrl-C，一定要用 `-c` 指定次數。' },
        { type: 'example', id: 'srv12-ping' },
        { type: 'p', text: 'db-01 的 nftables 沒有放行 ICMP，所以 ping 全部遺失，但同一台主機的 5432 埠立刻連上了。10.0.0.99 在同一個網段，卻沒有機器回應 ARP 查詢，所以核心自己回報 `Destination Host Unreachable`（來源是自己的位址 10.0.0.10）：這才真的代表那個位址上沒有主機。' },
        { type: 'callout', tone: 'warning', title: 'ping 不通不代表主機關機', text: '很多伺服器、雲端的安全群組與企業防火牆都會丟掉 ICMP，ping 全部遺失時，主機與服務可能完全正常。要判斷主機在不在，直接測你要用的服務（`nc -zv 主機 埠`）。反過來，ping 得通也只證明 ICMP 到得了，不代表那個埠開著、服務正常。' },
        { type: 'p', text: '`traceroute` 找出到目的地經過的路由器：它送出存活時間（TTL）是 1、2、3…的探測封包，每個讓 TTL 減到 0 的路由器回一個 ICMP time exceeded，就露出了自己的位址；每一跳送 3 個探測，印出各自的來回時間，沒有回應的印 `*`。Linux 的 traceroute 預設送 UDP 到 33434 以上的埠，目的地回 port unreachable 表示到了；`-I` 改用 ICMP echo，`-T` 改用 TCP SYN（需要 root）。`mtr --report`（`-r`）把同樣的探測反覆送出，最後列出每一跳的遺失率（Loss%）、送出數（Snt）、最後一次（Last）、平均、最好、最差的來回時間與標準差；`-w` 不截斷名稱，`-c` 指定次數。' },
        { type: 'example', id: 'srv12-path' },
        { type: 'p', text: '讀這些輸出的關鍵是「遺失有沒有延續到終點」。路由器轉送別人的封包靠專門的硬體，自己產生 ICMP 回覆卻要用 CPU，而且通常有限速，所以中間某一跳不回應或有遺失、之後的跳卻都正常時，它只是不愛回答，封包其實順利通過了。真正的遺失會從某一跳開始，一直延續到終點：' },
        { type: 'table', head: ['看到的', '意思', '要不要處理'], rows: [
          ['中間一跳 `* * *` 或 `???`，之後的跳正常', '那個路由器不回應探測（設定或限速）', '不用：轉送正常'],
          ['中間一跳 Loss% 40.0，之後的跳 0.0%', '那個路由器限制自己產生 ICMP 的速度', '不用'],
          ['從第 4 跳起每一跳都是 30.0%，包括終點', '第 3、4 跳之間或第 4 跳開始真的掉封包', '要：把 mtr 報告交給負責那一段的網路團隊或 ISP'],
          ['某一跳之後全部 `* * *`，到 30 跳都沒有終點', '封包在那裡被丟棄，或目的地的防火牆丟掉了探測', '換 `-I` 或 `-T -p 埠` 再試；能連上服務就不是路由的問題'],
          ['來回時間在某一跳突然變大，之後都維持', '那一段的距離或壅塞（例如跨洋線路）', '看是否符合地理距離；只有中間一跳變大而後面正常，同樣是 ICMP 回覆慢'],
        ] },
        { type: 'p', text: '`traceroute -m 4 app-01` 從第 2 跳起都是星號，因為 app-01 的 ufw 預設拒絕連入，丟掉了 UDP 探測；改用 `-I` 的 ICMP（ufw 放行 echo request）就看到了終點。這也是 mtr 的報告要附上「用了哪一種探測」的理由。網路是雙向的，去程與回程可能走不同的路徑；要回報給 ISP 時，最好也附上從對方往你這裡的 mtr。' },
      ],
    },
    {
      id: 'srv12-s-app', title: '第五、六步：埠、服務與應用程式',
      blocks: [
        { type: 'p', text: '到了第五步，問題變成「那個埠有程式在聽嗎、封包到得了嗎」。從用戶端用 `nc -zv 主機 埠` 測：`succeeded!` 表示 TCP 三向交握完成；`Connection refused` 表示主機回了 RST，可能是沒有程式在那個位址與埠監聽，也可能是 reject 規則；`timed out` 表示 SYN 沒有得到任何回應，通常是防火牆丟棄或路由不通。在伺服器上用 `sudo ss -tlnp` 看監聽中的 socket：Local Address 是 `0.0.0.0:8080` 表示所有位址都收，`127.0.0.1:8080` 表示只有本機連得到，從其他主機連就是 refused（SRV01）。' },
        { type: 'p', text: '第六步看應用程式本身。`curl -v` 把每個階段都印出來：`Trying` 是開始連線、`Connected` 是交握完成、`>` 開頭是送出的請求、`<` 開頭是回應的狀態行與標頭。`curl -w` 則在傳輸結束時印出指定的變數，其中的時間都是從開始到那個時間點的累計秒數：' },
        { type: 'table', head: ['變數', '到哪個時間點', '用減法看出'], rows: [
          ['`%{time_namelookup}`', '名稱解析完成', '本身就是 DNS 的時間'],
          ['`%{time_connect}`', 'TCP 交握完成', '`connect − namelookup` 約是一個來回'],
          ['`%{time_appconnect}`', 'TLS 交握完成（http:// 是 0）', '`appconnect − connect` 是 TLS 的時間'],
          ['`%{time_starttransfer}`', '收到回應的第一個位元組', '`start − connect`（或 `− appconnect`）主要是伺服器處理請求的時間'],
          ['`%{time_total}`', '整個傳輸結束', '`total − start` 是傳送內容的時間，內容大或頻寬小時才明顯'],
        ] },
        { type: 'example', id: 'srv12-app' },
        { type: 'p', text: '同一個 API 用三種方式指定主機，差別只在 namelookup：完整名稱要經過解析器查詢（24 ms），`app-01` 在 `/etc/hosts` 裡（0.18 ms），直接寫位址幾乎不花時間。connect 比 namelookup 多出約 0.55 ms，正是 ws-01 到 app-01 的一個來回；start 再多一個來回加上伺服器的處理時間。最後兩個 nc 對照了兩種失敗：app-01 的 9000 沒有允許規則，ufw 丟掉 SYN，三秒後逾時；wiki-01 的 8080 沒有程式在監聽，主機立刻回 RST。' },
        { type: 'p', text: '`curl -w` 是分辨「慢在哪裡」最直接的工具：' },
        { type: 'list', items: [
          'namelookup 特別大：DNS 慢。解析器沒有回應時，glibc 預設每次等 5 秒才重試或換下一個 nameserver，所以 5 秒出頭的 namelookup 是典型的症狀；接著用 `dig` 看 Query time，用 `dig @各個伺服器` 找出慢的那一台。',
          'connect − namelookup 特別大：網路遠或壅塞；剛好是 1 秒、3 秒左右時，是第一個 SYN 遺失後的重送（Linux 的初始重送逾時是 1 秒，之後每次加倍）。',
          'start − connect 特別大：伺服器收到請求之後很久才回答，問題在應用程式或它依賴的資料庫，不是網路。',
          'total − start 特別大：回應的內容很大，或下載頻寬不足。',
        ] },
        { type: 'callout', tone: 'note', title: '模擬的時間模型', text: '模擬環境的 `curl -w` 由課程宣告的延遲與伺服器的處理時間算出，用來比較各段的比例，不是真實的量測。模擬的解析器一律在 24 ms 內回答（和 dig 的 Query time 一致），所以本課看不到 DNS 逾時造成的 5 秒；在真實的機器上遇到時，請用上面的方法判斷。' },
      ],
    },
    {
      id: 'srv12-s-wire', title: '第七步：用 tcpdump 看線路上的封包',
      blocks: [
        { type: 'p', text: '前面每一步看起來都正常、問題卻還在，或用戶端與伺服器各說各話時，就看封包本身。實務上用 root 在介面上擷取並存檔，例如 `sudo tcpdump -i eth0 -nn -w /tmp/pay.pcap host 10.0.2.60 and port 8080`，重現問題之後按 Ctrl-C 停止，再用 `tcpdump -r` 或 Wireshark 讀。擷取一定要加過濾條件，否則忙碌的伺服器幾秒就寫出大量資料，也可能錄到不相關的敏感內容。模擬環境不能即時擷取，本課讀準備好的擷取檔。' },
        { type: 'p', text: '每一行是一個封包：時間、`IP 來源.埠 > 目的.埠`、TCP 旗標、序號、確認號、視窗大小與資料長度。`-nn` 讓位址與埠都以數字顯示，本課讀擷取檔時一律加上它。交握的 SYN 與 SYN-ACK 印出絕對序號，之後的封包印相對於交握的序號，所以第一段資料是 `seq 1:80`、確認號是 `ack 1`。常見的旗標：' },
        { type: 'table', head: ['旗標', '意思'], rows: [
          ['`[S]`', 'SYN：用戶端要求建立連線'],
          ['`[S.]`', 'SYN-ACK：伺服器同意（`.` 是 ACK）'],
          ['`[.]`', '單純的 ACK'],
          ['`[P.]`', '帶資料（PSH 加 ACK），HTTP 的埠會在行尾印出第一行，例如 `HTTP: GET /items HTTP/1.1`'],
          ['`[F.]`', 'FIN：這一方的資料送完了，準備關閉'],
          ['`[R]`、`[R.]`', 'RST：立刻中斷，或拒絕這個連線要求'],
        ] },
        { type: 'example', id: 'srv12-wire' },
        { type: 'p', text: '同一個擷取檔裡有三種典型的結果：' },
        { type: 'table', head: ['看到的', '代表', '下一步'], rows: [
          ['SYN → SYN-ACK → ACK，接著請求與回應', '網路與連接埠都通，連線建立了', '問題在應用程式：看回應的狀態碼與內容、伺服器的日誌'],
          ['SYN → RST（幾百微秒內）', '封包到了主機，主機拒絕：那個埠沒有程式在監聽，或防火牆的 reject 規則', '在伺服器上 `ss -tlnp` 與檢查防火牆'],
          ['只有 SYN，約 1、3、7 秒後重送，沒有任何回覆', '封包在路上或在目的地被丟棄：防火牆的 drop、路由不通、主機不存在', '查防火牆（主機與雲端）與路由；在伺服器那一端擷取，看 SYN 有沒有到'],
        ] },
        { type: 'p', text: '過濾條件可以組合：`host 位址`、`net 網段`、`port 埠`（可加 `src` 或 `dst`，以及 `tcp`、`udp`、`icmp`），用 `and`、`or`、`not` 連接。組合條件時加上括號並用單引號包起來（例如 `\'host 10.0.2.41 and (port 80 or port 8080)\'`），不要依賴運算的優先順序，也避免 Shell 解讀括號。`-c N` 只印前 N 個封包，`-A` 印出資料本身（HTTP 的內容看得到，HTTPS 只是加密的位元組），`-w 檔案` 把符合的封包另存一份。' },
        { type: 'callout', tone: 'tip', title: '兩端各擷取一次', text: '只在用戶端擷取時，「SYN 沒有回覆」無法分辨是封包沒送到，還是伺服器收到了卻沒有回。伺服器那一端也擷取：SYN 有到而沒有 SYN-ACK 送出，問題在伺服器的防火牆或服務；SYN 根本沒有到，問題在中間的網路或雲端的安全群組。' },
      ],
    },
    {
      id: 'srv12-s-choose', title: '依問題選工具',
      blocks: [
        { type: 'p', text: '把前面的方法反過來用：先看用戶端給了什麼錯誤或症狀，選最能回答它的工具，再往下確認。下表是常見的起點：' },
        { type: 'table', head: ['症狀', '先用', '理由'], rows: [
          ['`curl: (6) Could not resolve host`', '`getent hosts`、`dig`、`dig @DNS伺服器`', '還沒開始連線就失敗了，是名稱這一層'],
          ['用位址連得上，用名稱連不上（或連到舊主機）', '`getent hosts` 對照 `dig @DNS伺服器`', '程式拿到的位址和 DNS 不同，通常是 `/etc/hosts` 或快取'],
          ['`Connection refused`、curl 的 `(7) … after 0 ms`', '伺服器上 `sudo ss -tlnp`', '主機回了 RST：服務沒在聽、綁錯位址，或 reject 規則'],
          ['逾時：`timed out`、`(28)`、`after 127000 ms`', '`nc -zv -w 3`、`traceroute -T -p 埠`、伺服器的 `ufw status`／`nft list ruleset`', 'SYN 沒有回應：防火牆丟棄或路由不通'],
          ['連得上但很慢', '`curl -w`', '分出 DNS、連線、伺服器處理與傳輸各花多少時間'],
          ['時好時壞、偶爾很慢', '`mtr --report -c 100`', '多送一些探測，看遺失是否延續到終點'],
          ['用戶端說送了，伺服器說沒收到', '兩端的 `tcpdump`', '線路上的封包是最後的證據'],
        ] },
        { type: 'p', text: '每次只改一件事，改完用同一個指令重測，確認結果真的改變了。結果從「逾時」變成「refused」是好消息：代表封包已經通過防火牆，輪到服務這一層。修好之後，記得把排查時為了測試而開的東西（臨時的防火牆規則、`/etc/hosts` 的記錄、擷取檔）收回來，它們常常就是下一次「連不上」的原因。' },
        { type: 'callout', tone: 'warning', title: '「我這裡可以」不能證明服務正常', text: '在伺服器上 `curl 127.0.0.1:8080` 成功，只證明服務在本機的迴路介面上有回應；它沒有經過網路、沒有經過防火牆的連入規則，也沒有用到用戶端的名稱解析。驗證修正時，要從出問題的那台用戶端、用使用者實際用的網址重測。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'srv12-q1', prompt: '`ping -c 3 db-01` 顯示 `3 packets transmitted, 0 received, 100% packet loss`，接著 `nc -zv db-01 5432` 顯示 `succeeded!`。最合理的結論是什麼？',
      options: ['db-01 已經關機，nc 的結果是快取', 'db-01 與工作站之間的路由不通', 'db-01 正常運作，只是它的防火牆丟掉了 ICMP echo request', '5432 埠被別的主機搶走了'],
      answer: 2,
      explanation: 'nc 的 succeeded 表示 TCP 三向交握真的完成了，主機與 5432 的服務都在；ping 全部遺失只代表 ICMP 沒有得到回覆，最常見的原因是防火牆不放行 ICMP。nc 每次都重新連線，沒有快取；路由不通時 TCP 也連不上；同一個位址與埠不會被另一台主機占用。',
    },
    {
      id: 'srv12-q2', prompt: '`mtr --report` 到合作廠商的報告中，第 4 跳的 Loss% 是 40.0%，第 5、6 跳（包括終點）都是 0.0%。該怎麼解讀？',
      options: ['第 4 跳的路由器限制了自己回覆 ICMP 的速度，轉送正常，不需要處理', '第 4 跳在掉封包，要立刻通知那一段的網路業者', '終點的伺服器有 40% 的請求失敗', 'mtr 的探測數太少，報告沒有意義'],
      answer: 0,
      explanation: '經過第 4 跳的封包到第 5、6 跳都沒有遺失，表示轉送沒有問題；只有那個路由器自己產生的回覆少了，這是對 ICMP 回覆的限速或較低的優先順序。真正的遺失會一路延續到終點；終點 0% 表示伺服器的探測都有回應；10 次雖然不多，但「後面的跳沒有遺失」這個結論不受影響。',
    },
    {
      id: 'srv12-q3', prompt: '`traceroute api.partner.example` 的第 3 跳是 `* * *`，第 4 到第 6 跳（包括終點）都有正常的時間。這代表什麼？',
      options: ['封包在第 3 跳被丟掉了，所以後面的結果不可信', '第 3 跳之後的路由器都是假的', '需要用 root 執行 traceroute 才看得到第 3 跳', '第 3 跳的路由器不回應探測，但它照常轉送封包'],
      answer: 3,
      explanation: '能看到第 4 跳之後的回應，表示 TTL 較大的探測都通過了第 3 跳，它只是不送 time exceeded（設定成不回應或被限速）。後面的跳是真的回覆，不是假的；預設的 UDP 探測不需要 root，只有 `-T` 的 TCP 探測需要。',
    },
    {
      id: 'srv12-q4', prompt: '在 ws-01 上，`getent hosts wiki.corp.example` 印出 10.0.2.40，`dig +noall +answer wiki.corp.example` 印出 `wiki.corp.example. 0 IN A 10.0.2.40`，`dig @ns1 +short wiki.corp.example` 卻印出 10.0.2.41。最可能的原因是什麼？',
      options: ['ns1 的區域檔還沒有 reload', 'ws-01 的 `/etc/hosts` 有一行 10.0.2.40 的舊記錄', '本機解析器的快取還沒過期，等 TTL 到了就好', 'wiki 伺服器同時有兩個位址'],
      answer: 1,
      explanation: 'glibc 先查 `/etc/hosts`，而 `dig` 預設問的 systemd-resolved 也會用 `/etc/hosts` 回答，TTL 是 0，所以兩者一起給出舊位址；直接問 ns1 才看到 DNS 的真正資料。ns1 回答的已經是新位址，所以不是沒有 reload；快取的答案會帶著從 300 往下數的剩餘 TTL，不會是 0；wiki 若有兩個位址，dig @ns1 會把兩個都列出。',
    },
    {
      id: 'srv12-q5', prompt: '`tcpdump -nn -r pay.pcap port 8080` 只有四行，都是 `10.0.0.10.41702 > 10.0.2.60.8080: Flags [S]`，時間分別在開始、約 1 秒、3 秒與 7 秒後。這表示什麼？',
      options: ['連線成功了，只是 tcpdump 沒有錄到回應', 'pay 主機回了 RST，拒絕連線', '用戶端送出的 SYN 沒有得到任何回覆，在路上或在目的地被丟棄', '用戶端的 DNS 查詢失敗了'],
      answer: 2,
      explanation: '同一個來源埠與序號的 SYN 依 1、2、4 秒的間隔重送，是 TCP 沒有收到 SYN-ACK 時的行為，常見的原因是防火牆的 drop、路由不通或主機不存在。成功的連線會有 SYN-ACK 與之後的資料；被拒絕會在 SYN 之後立刻看到 `[R.]`；SYN 已經送往 10.0.2.60，表示名稱解析成功了。',
    },
    {
      id: 'srv12-q6', prompt: '`curl -s -o /dev/null -w \'dns=%{time_namelookup} connect=%{time_connect} start=%{time_starttransfer} total=%{time_total}\\n\'` 印出 `dns=0.024300 connect=0.024850 start=1.825450 total=1.825530`。時間主要花在哪裡？',
      options: ['伺服器收到請求之後的處理（應用程式或它依賴的服務）', 'DNS 查詢', 'TCP 交握，網路太遠', '下載回應的內容'],
      answer: 0,
      explanation: 'start − connect 約 1.8 秒，是從送出請求到收到第一個位元組的時間，扣掉一個來回之後幾乎都是伺服器的處理。DNS 只花 24 ms；connect − dns 約 0.55 ms，是區網的一個來回；total − start 只有 0.08 ms，內容很小。',
    },
    {
      id: 'srv12-q7', prompt: '從 ws-01 執行 `nc -zv app-01 8080` 得到 `Connection refused`；在 app-01 上 `curl http://127.0.0.1:8080/` 正常，`sudo ss -tlnp` 顯示 nginx 監聽 `127.0.0.1:8080`。問題在哪裡？',
      options: ['app-01 的 ufw 丟掉了 8080 的封包', '服務只綁在迴路位址 127.0.0.1，其他主機的連線沒有程式接收', 'ws-01 的 DNS 把 app-01 解析錯了', 'node 程式綁在 127.0.0.1:3000，應該改成 0.0.0.0'],
      answer: 1,
      explanation: '監聽 127.0.0.1 的 socket 只接收送往迴路位址的連線，從其他主機送到 10.0.2.21:8080 的 SYN 沒有程式接收，核心回 RST，就是 refused。防火牆丟棄會是逾時而不是 refused；nc 印出的位址是 10.0.2.21，名稱沒有解析錯；node 在 nginx 後面，只需要讓同一台的 nginx 連到，綁 127.0.0.1 正是正確的做法。',
    },
    {
      id: 'srv12-q8', prompt: '使用者說「什麼網站都打不開」。你在他的機器上執行 `ip route get 10.0.2.21`，得到 `RTNETLINK answers: Network is unreachable`。下一步應該做什麼？',
      options: ['用 `dig` 檢查 DNS 伺服器', '用 `mtr` 找出哪一跳在掉封包', '請服務的負責人檢查伺服器的防火牆', '檢查這台機器的介面位址與預設路由（`ip -br addr`、`ip route`）'],
      answer: 3,
      explanation: '核心找不到任何路由，封包根本送不出這台機器，問題在最底層：介面沒有位址、沒有預設閘道，或網路線、Wi-Fi 沒有連上。在這之上的 DNS、路徑與伺服器的防火牆都還輪不到；mtr 也一樣需要路由才送得出探測。',
    },
  ],
  terminal: {
    machines: [base, staleHosts, loopback, payCapture, slow],
    examples: [
      {
        id: 'srv12-local', title: '本機的介面、路由與名稱解析', machine: 'srv12-ws',
        description: '在 ws-01 上由下而上：介面與位址、路由表、往 app-01 與 ns1 的路由，接著看名稱。`dig` 的完整輸出來自本機的 systemd-resolved；`app-01` 的答案 TTL 是 0，來自 `/etc/hosts`；直接問 ns1 時，完整名稱有權威的答案（`+short` 只印資料），短名稱則被拒絕。',
        steps: [
          { command: 'ip -br addr', output: "lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0             UP             10.0.0.10/24 fe80::5054:ff:fea0:f46e/64" },
          { command: 'ip route', output: "default via 10.0.0.1 dev eth0 proto static\n10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.10" },
          { command: 'ip route get 10.0.2.21', output: "10.0.2.21 via 10.0.0.1 dev eth0 src 10.0.0.10 uid 1000\n    cache" },
          { command: 'ip route get 10.0.0.2', output: "10.0.0.2 dev eth0 src 10.0.0.10 uid 1000\n    cache" },
          { command: 'dig wiki.corp.example', output: "\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> wiki.corp.example\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 51502\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; QUESTION SECTION:\n;wiki.corp.example.\t\tIN\tA\n\n;; ANSWER SECTION:\nwiki.corp.example.\t300\tIN\tA\t10.0.2.41\n\n;; Query time: 24 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Sun Nov 22 10:00:00 UTC 2026\n;; MSG SIZE  rcvd: 62\n" },
          { command: 'getent hosts app-01', output: "10.0.2.21       app-01" },
          { command: 'dig +noall +answer app-01', output: "app-01.\t\t\t0\tIN\tA\t10.0.2.21" },
          { command: 'dig @ns1 +short app-01.corp.example', output: "10.0.2.21" },
          { command: 'dig @ns1 app-01', output: "\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> @ns1 app-01\n; (1 server found)\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 7351\n;; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1\n;; WARNING: recursion requested but not available\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 1232\n;; QUESTION SECTION:\n;app-01.\t\t\tIN\tA\n\n;; Query time: 0 msec\n;; SERVER: 10.0.0.2#53(10.0.0.2) (UDP)\n;; WHEN: Sun Nov 22 10:00:00 UTC 2026\n;; MSG SIZE  rcvd: 35\n" },
        ],
      },
      {
        id: 'srv12-ping', title: 'ping 能說明什麼、不能說明什麼', machine: 'srv12-ws',
        description: 'app-01 經過一個路由器，回覆的 ttl 是 63。db-01 的防火牆丟掉 ICMP，ping 全部遺失、結束碼 1，但 5432 埠一連就通。同一個網段裡沒有機器的 10.0.0.99，由本機回報 Destination Host Unreachable。',
        steps: [
          { command: 'ping -c 3 app-01', output: "PING app-01 (10.0.2.21) 56(84) bytes of data.\n64 bytes from app-01 (10.0.2.21): icmp_seq=1 ttl=63 time=0.559 ms\n64 bytes from app-01 (10.0.2.21): icmp_seq=2 ttl=63 time=0.545 ms\n64 bytes from app-01 (10.0.2.21): icmp_seq=3 ttl=63 time=0.566 ms\n\n--- app-01 ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss, time 2002ms\nrtt min/avg/max/mdev = 0.545/0.557/0.566/0.009 ms" },
          { command: 'ping -c 3 db-01', output: "PING db-01 (10.0.2.30) 56(84) bytes of data.\n\n--- db-01 ping statistics ---\n3 packets transmitted, 0 received, 100% packet loss, time 2002ms" },
          { command: 'echo $?', output: "1" },
          { command: 'nc -zv db-01 5432', output: "Connection to db-01 (10.0.2.30) 5432 port [tcp/postgresql] succeeded!" },
          { command: 'ping -c 2 10.0.0.99', output: "PING 10.0.0.99 (10.0.0.99) 56(84) bytes of data.\nFrom 10.0.0.10 icmp_seq=1 Destination Host Unreachable\nFrom 10.0.0.10 icmp_seq=2 Destination Host Unreachable\n\n--- 10.0.0.99 ping statistics ---\n2 packets transmitted, 0 received, +2 errors, 100% packet loss, time 1001ms\npipe 2" },
        ],
      },
      {
        id: 'srv12-path', title: 'traceroute 與 mtr：遺失有沒有延續到終點', machine: 'srv12-ws',
        description: '到合作廠商 API 的路徑：第 3 跳不回應、第 4 跳偶爾不回應，但之後的跳與終點都正常。mtr 的報告證實第 4 跳的 40% 只屬於它自己。到檔案伺服器的路徑則從第 4 跳起每一跳都遺失 30%，一路到終點。最後對照 app-01：預設的 UDP 探測被 ufw 丟掉，`-I` 的 ICMP 探測到得了。',
        steps: [
          { command: 'traceroute api.partner.example', output: "traceroute to api.partner.example (192.0.2.80), 30 hops max, 60 byte packets\n 1  _gateway (10.0.0.1)  0.404 ms  0.409 ms  0.403 ms\n 2  100.64.0.1 (100.64.0.1)  2.885 ms  2.899 ms  2.888 ms\n 3  * * *\n 4  edge1.transit.example (198.51.100.7)  8.651 ms  9.024 ms *\n 5  gw.partner.example (192.0.2.1)  10.001 ms  10.090 ms  10.377 ms\n 6  api.partner.example (192.0.2.80)  10.812 ms  10.863 ms  10.535 ms" },
          { command: 'mtr -rw -c 10 api.partner.example', output: "Start: 2026-11-22T10:00:00+0000\nHOST: ws-01                 Loss%   Snt   Last   Avg  Best  Wrst StDev\n  1.|-- _gateway               0.0%    10    0.4   0.4   0.4   0.4   0.0\n  2.|-- 100.64.0.1             0.0%    10    2.8   2.9   2.8   3.0   0.0\n  3.|-- ???                   100.0    10    0.0   0.0   0.0   0.0   0.0\n  4.|-- edge1.transit.example 40.0%    10    8.8   8.9   8.7   9.0   0.1\n  5.|-- gw.partner.example     0.0%    10   10.3  10.3  10.1  10.6   0.2\n  6.|-- api.partner.example    0.0%    10   10.9  10.8  10.4  10.9   0.2" },
          { command: 'mtr -rw -c 10 files.partner.example', output: "Start: 2026-11-22T10:00:00+0000\nHOST: ws-01                 Loss%   Snt   Last   Avg  Best  Wrst StDev\n  1.|-- _gateway               0.0%    10    0.4   0.4   0.4   0.4   0.0\n  2.|-- 100.64.0.1             0.0%    10    2.8   2.9   2.8   3.0   0.0\n  3.|-- edge1.transit.example  0.0%    10    8.8   8.8   8.6   9.0   0.2\n  4.|-- core3.transit.example 30.0%    10    9.7   9.6   9.3   9.7   0.1\n  5.|-- gw.partner.example    30.0%    10   10.4  10.4  10.2  10.7   0.2\n  6.|-- files.partner.example 30.0%    10   11.1  10.9  10.6  11.1   0.2" },
          { command: 'traceroute -m 4 app-01', output: "traceroute to app-01 (10.0.2.21), 4 hops max, 60 byte packets\n 1  _gateway (10.0.0.1)  0.354 ms  0.358 ms  0.353 ms\n 2  * * *\n 3  * * *\n 4  * * *" },
          { command: 'traceroute -I app-01', output: "traceroute to app-01 (10.0.2.21), 30 hops max, 60 byte packets\n 1  _gateway (10.0.0.1)  0.354 ms  0.358 ms  0.353 ms\n 2  app-01 (10.0.2.21)  0.538 ms  0.566 ms  0.548 ms" },
        ],
      },
      {
        id: 'srv12-app', title: '埠與應用程式：nc、ss、curl -v 與 curl -w', machine: 'srv12-ws',
        description: '8080 連得上；在 app-01 上 `ss` 顯示 nginx 監聽 0.0.0.0:8080。`curl -v` 顯示連線、請求與回應的每一步。同一個 API 以完整名稱、`/etc/hosts` 的短名稱與位址各量一次時間，差別在名稱解析。最後兩個 nc 對照丟棄（逾時）與沒有程式監聽（refused）。',
        steps: [
          { command: 'nc -zv app-01 8080', output: "Connection to app-01 (10.0.2.21) 8080 port [tcp/http-alt] succeeded!" },
          { command: 'ssh app-01 sudo ss -tlnp sport = :8080', output: "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      511          0.0.0.0:8080      0.0.0.0:*    users:((\"nginx\",pid=813,fd=6),(\"nginx\",pid=812,fd=6))" },
          { command: 'curl -v http://app-01:8080/items', output: "*   Trying 10.0.2.21:8080...\n* Connected to app-01 (10.0.2.21) port 8080\n> GET /items HTTP/1.1\n> Host: app-01:8080\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n< HTTP/1.1 200 OK\n< Server: nginx/1.24.0 (Ubuntu)\n< Date: Sun, 22 Nov 2026 10:00:00 GMT\n< Content-Type: application/json\n< Content-Length: 27\n< Connection: keep-alive\n<\n[{\"sku\":\"A-100\",\"qty\":42}]\n* Connection #0 to host app-01 left intact" },
          { command: timing('http://app-01.corp.example:8080/items'), output: "dns=0.024300 connect=0.024850 start=0.025490 total=0.025570" },
          { command: timing('http://app-01:8080/items'), output: "dns=0.000180 connect=0.000730 start=0.001370 total=0.001450" },
          { command: timing('http://10.0.2.21:8080/items'), output: "dns=0.000012 connect=0.000562 start=0.001202 total=0.001282" },
          { command: 'nc -zv -w 3 app-01 9000', output: "nc: connect to app-01 (10.0.2.21) port 9000 (tcp) timed out: Operation now in progress" },
          { command: 'nc -zv wiki-01 8080', output: "nc: connect to wiki-01 (10.0.2.41) port 8080 (tcp) failed: Connection refused" },
        ],
      },
      {
        id: 'srv12-wire', title: '讀擷取檔：交握、RST 與沒有回應的 SYN', machine: 'srv12-ws',
        description: '`/var/tmp/office.pcap` 是 ws-01 上的一段擷取。對 app-01 的 8080：完整的三向交握、HTTP 請求與回應、FIN 關閉；`-A` 印出資料本身。對 wiki-01 的 8080：SYN 立刻得到 RST。對 db-01 的 6432：SYN 在 1 秒與 3 秒後重送，始終沒有回覆。沒有 `-n` 時，位址依 `/etc/hosts` 換成名稱。',
        steps: [
          { command: 'tcpdump -nn -r /var/tmp/office.pcap port 8080 and host 10.0.2.21', output: "reading from file /var/tmp/office.pcap, link-type EN10MB (Ethernet), snapshot length 262144\n09:30:12.000000 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [S], seq 1204331001, win 64240, length 0\n09:30:12.000550 IP 10.0.2.21.8080 > 10.0.0.10.52110: Flags [S.], seq 3390012211, ack 1204331002, win 65160, length 0\n09:30:12.000600 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [.], ack 1, win 502, length 0\n09:30:12.000650 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [P.], seq 1:80, ack 1, win 502, length 79: HTTP: GET /items HTTP/1.1\n09:30:12.001200 IP 10.0.2.21.8080 > 10.0.0.10.52110: Flags [.], ack 80, win 509, length 0\n09:30:12.003100 IP 10.0.2.21.8080 > 10.0.0.10.52110: Flags [P.], seq 1:131, ack 80, win 509, length 130: HTTP: HTTP/1.1 200 OK\n09:30:12.003200 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [F.], seq 80, ack 131, win 502, length 0\n09:30:12.003700 IP 10.0.2.21.8080 > 10.0.0.10.52110: Flags [F.], seq 131, ack 81, win 509, length 0\n09:30:12.003800 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [.], ack 132, win 502, length 0" },
          { command: 'tcpdump -nn -A -c 4 -r /var/tmp/office.pcap port 8080 and host 10.0.2.21', output: "reading from file /var/tmp/office.pcap, link-type EN10MB (Ethernet), snapshot length 262144\n09:30:12.000000 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [S], seq 1204331001, win 64240, length 0\n09:30:12.000550 IP 10.0.2.21.8080 > 10.0.0.10.52110: Flags [S.], seq 3390012211, ack 1204331002, win 65160, length 0\n09:30:12.000600 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [.], ack 1, win 502, length 0\n09:30:12.000650 IP 10.0.0.10.52110 > 10.0.2.21.8080: Flags [P.], seq 1:80, ack 1, win 502, length 79: HTTP: GET /items HTTP/1.1\nGET /items HTTP/1.1\nHost: app-01:8080\nUser-Agent: curl/8.5.0\nAccept: */*\n" },
          { command: 'tcpdump -nn -r /var/tmp/office.pcap host 10.0.2.41', output: "reading from file /var/tmp/office.pcap, link-type EN10MB (Ethernet), snapshot length 262144\n09:30:14.500000 IP 10.0.0.10.47316 > 10.0.2.41.8080: Flags [S], seq 551902377, win 64240, length 0\n09:30:14.500550 IP 10.0.2.41.8080 > 10.0.0.10.47316: Flags [R.], seq 0, ack 551902378, win 0, length 0" },
          { command: 'tcpdump -r /var/tmp/office.pcap host db-01', output: "reading from file /var/tmp/office.pcap, link-type EN10MB (Ethernet), snapshot length 262144\n09:30:17.000000 IP 10.0.0.10.39940 > db-01.6432: Flags [S], seq 2760114093, win 64240, length 0\n09:30:18.021300 IP 10.0.0.10.39940 > db-01.6432: Flags [S], seq 2760114093, win 64240, length 0\n09:30:20.069300 IP 10.0.0.10.39940 > db-01.6432: Flags [S], seq 2760114093, win 64240, length 0" },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv12-hosts-fix', title: '同事都打得開 wiki，只有你的工作站不行', machine: 'srv12-hosts',
        statement: '公司的 wiki（`http://wiki.corp.example/`）上週搬到了新主機，同事都打得開，只有 ws-01 一直等到逾時。請由下而上找出問題在哪一層（例如比較 `getent hosts`、`dig` 與 `dig @ns1` 的答案），然後修好：ws-01 上用這個網址要拿到 wiki 的首頁；`/etc/hosts` 裡其他的記錄都要保留，特別是只寫在這個檔案裡的 `build.corp.example` 與 `printer-3f`。你在 ws-01 有 sudo。',
        checks: [
          { kind: 'http', url: 'http://wiki.corp.example/', status: 200, body: 'Corp Wiki' },
          { kind: 'dns', name: 'wiki.corp.example', values: ['10.0.2.41'] },
          { kind: 'dns', name: 'build.corp.example', values: ['10.0.2.70'] },
          { kind: 'dns', name: 'printer-3f', values: ['10.0.0.50'] },
        ],
        solution: ['getent hosts wiki.corp.example', 'dig @ns1 +short wiki.corp.example', 'grep -n wiki /etc/hosts', FIX_HOSTS, 'getent hosts wiki.corp.example', 'curl -sS http://wiki.corp.example/'],
        mistakes: [
          { commands: ["echo '10.0.2.41 wiki.corp.example' | sudo tee -a /etc/hosts"], why: '把正確的位址附加在檔案最後：`/etc/hosts` 由上往下找，第一個符合的記錄生效，排在前面的 10.0.2.40 仍然勝出，wiki 照樣逾時。' },
          { commands: ['sudo resolvectl flush-caches'], why: '清除解析器的快取沒有用：錯的位址不是快取，而是 `/etc/hosts` 裡寫死的記錄，每次查詢都會再讀到它。' },
          { commands: ["sudo sed -i '/corp\\.example/d' /etc/hosts"], why: '樣式太寬：舊的 wiki 記錄刪掉了，只寫在這個檔案裡的 `build.corp.example` 也一起被刪，建置伺服器的名稱從此解析不到。' },
          { commands: ["echo '10.0.2.41 wiki.corp.example' | sudo tee /etc/hosts"], why: '`tee` 沒有 `-a` 時整個檔案被覆寫，只剩一行：wiki 好了，但 localhost、printer-3f、build.corp.example 等記錄全部不見了。' },
        ],
        hints: [
          '先確認程式拿到的位址：`getent hosts wiki.corp.example`；再直接問 DNS 伺服器：`dig @ns1 +short wiki.corp.example`。',
          '兩者不同時，答案來自哪裡？`grep -n wiki /etc/hosts` 看看。',
          '只刪掉那一行：`sudo sed -i \'/^10\\.0\\.2\\.40 /d\' /etc/hosts`（點要跳脫，樣式要精確到不會刪到別行）。',
          '修完用 `getent hosts` 與 `curl -sS http://wiki.corp.example/` 從 ws-01 重測。',
        ],
        explanation: 'curl 逾時，所以先往下查名稱：`getent hosts` 給出 10.0.2.40，`dig @ns1` 卻是 10.0.2.41。程式拿到的位址和 DNS 不同，答案來自 `/etc/hosts`：第 9 行是 wiki 搬家期間暫時加上的記錄（`dig wiki.corp.example` 也會給出 10.0.2.40，因為 systemd-resolved 同樣讀 `/etc/hosts`，TTL 是 0）。舊主機已經不在了，所以連線逾時，ping 也沒有回應。用 `sudo sed -i \'/^10\\.0\\.2\\.40 /d\' /etc/hosts` 只刪掉那一行之後，名稱回到 DNS 的 10.0.2.41，其他只寫在這個檔案裡的記錄都還在。修完的驗證要從 ws-01、用使用者的網址做。臨時加進 `/etc/hosts` 的記錄最好加上註解與日期，事情結束就移除；這種被遺忘的記錄是「只有我連不上」最常見的原因之一。',
      },
      {
        id: 'srv12-bind-fix', title: 'app-01 的 API 只有它自己連得到', machine: 'srv12-bind',
        statement: '倉儲 API 在 app-01 的 8080 提供服務：nginx 收下請求，轉給同一台 127.0.0.1:3000 的 node 程式。昨天有人改過 nginx 的設定之後，ws-01 呼叫 `http://app-01:8080/health` 就失敗了，但在 app-01 上 `curl http://127.0.0.1:8080/health` 正常。請由下而上找出問題在哪一層並修好：ws-01 要拿到 `inventory ok`；node 程式維持只聽 127.0.0.1:3000（它不需要對外）；app-01 的 ufw 保持啟用、預設拒絕連入。你可以用 `ssh app-01` 登入，在那裡有 sudo。',
        checks: [
          { kind: 'http', url: 'http://app-01:8080/health', status: 200, body: 'inventory ok' },
          { kind: 'reach', to: 'app-01', port: 8080, result: 'succeeded' },
          { kind: 'listen', host: 'app-01', port: 3000, address: '127.0.0.1', process: 'node' },
          { kind: 'firewall', host: 'app-01', enabled: true, incoming: 'deny' },
        ],
        solution: ['ping -c 2 app-01', 'ssh app-01', 'sudo ss -tlnp', 'sudo ufw status', FIX_LISTEN, 'sudo nginx -t', 'sudo systemctl reload nginx', 'sudo ss -tlnp sport = :8080', 'exit', 'curl -sS http://app-01:8080/health'],
        mistakes: [
          { commands: ['ssh app-01', FIX_LISTEN, 'sudo nginx -t', 'exit'], why: '改了設定檔、也測試過，卻沒有 reload：nginx 仍用啟動時讀到的設定，8080 還是只綁在 127.0.0.1，ws-01 照樣得到 refused。' },
          { commands: ['ssh app-01 sudo ufw allow 8080/tcp'], why: '問題不在防火牆：ufw 本來就允許辦公室網段連 8080，而且 refused 表示封包已經到了主機。多加這條規則只讓 8080 對所有來源開放，nginx 仍然只聽 127.0.0.1。' },
          { commands: ['ssh app-01 sudo systemctl restart nginx'], why: '重新啟動不會改變設定：nginx 重新讀到同一個 `listen 127.0.0.1:8080;`，綁定的位址完全一樣。' },
          { commands: ['ssh app-01', 'sudo ufw disable', 'exit'], why: '停用防火牆什麼也沒修好：連線仍是 refused（nginx 沒有在 10.0.2.21:8080 監聽），整台主機卻失去了保護。' },
        ],
        hints: [
          '先在 ws-01 上 `nc -zv app-01 8080`：refused 還是逾時？兩者指向不同的層。',
          'refused 表示主機回了 RST。登入 app-01，用 `sudo ss -tlnp` 看 8080 綁在哪個位址。',
          '綁定的位址來自 nginx 的 `listen`：看 `/etc/nginx/sites-enabled/inventory`，用 `sudo sed -i` 把 `listen 127.0.0.1:8080;` 改成 `listen 8080;`。',
          '先 `sudo nginx -t`，再 `sudo systemctl reload nginx`，最後回到 ws-01 用 curl 重測。',
        ],
        explanation: 'ping app-01 有回應，路由與主機都沒問題；`nc -zv app-01 8080` 是 `Connection refused`，表示 SYN 到了主機、主機回了 RST，問題在埠這一層，不是防火牆（ufw 的 status 也顯示 8080 已允許辦公室網段）。`sudo ss -tlnp` 顯示 nginx 監聽 `127.0.0.1:8080`：只有送往迴路位址的連線會被接收，這也是為什麼在 app-01 上 curl 127.0.0.1 正常。原因是站台設定的 `listen 127.0.0.1:8080;`。把它改成 `listen 8080;`（等於 0.0.0.0:8080；也可以寫成 `listen 10.0.2.21:8080;` 只綁內網位址），`nginx -t` 通過後 `systemctl reload nginx` 套用，`ss` 就顯示 `0.0.0.0:8080`，ws-01 拿到 `inventory ok`。node 綁在 127.0.0.1:3000 是正確的設計：它只需要讓同一台的 nginx 連到，不必、也不該對外。',
      },
      {
        id: 'srv12-pcap-read', title: '從擷取檔判斷：被丟棄、被拒絕，還是連上了', machine: 'srv12-pcap',
        statement: '結帳服務呼叫 `pay.corp.example:8080` 失敗，同事在 ws-01 上擷取了出問題那段時間的封包，存成 `/var/tmp/pay-8080.pcap`。檔案裡還有 DNS 查詢與一條 SSH 連線的封包。請用 tcpdump 讀它，最後用 `tcpdump -nn -r /var/tmp/pay-8080.pcap` 加上過濾條件，只印出 ws-01 與 pay（10.0.2.60）的 8080 之間的 TCP 封包，並從結果判斷問題在哪一層。檢查時，你的指令也會在另外兩次擷取上重新執行（pay 那一端的反應不同），所以要印出擷取的內容，不能自己打出答案。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?tcpdump ' }],
        solution: ['tcpdump -nn -r /var/tmp/pay-8080.pcap', 'tcpdump -nn -r /var/tmp/pay-8080.pcap tcp port 8080'],
        mistakes: [
          { commands: ['tcpdump -nn -r /var/tmp/pay-8080.pcap'], why: '沒有過濾條件：SSH 與 DNS 的封包混在一起，沒有只印出和 pay 的 8080 有關的封包。' },
          { commands: ['tcpdump -r /var/tmp/pay-8080.pcap tcp port 8080'], why: '少了 `-nn`：埠被換成 /etc/services 的名稱 `http-alt`，和要求的數字格式不同。' },
          { commands: ['tcpdump -nn -r /var/tmp/pay-8080.pcap src host 10.0.2.60'], why: '只看 pay 送回來的封包：在封包被丟棄的情況下什麼都看不到，也就看不出用戶端的 SYN 一再重送；判斷要看兩個方向。' },
        ],
        variants: [
          { label: '另一次擷取：pay 回覆 RST', files: [pcapFile(REFUSED)] },
          { label: '另一次擷取：交握成功，應用程式回 503', files: [pcapFile(ANSWERED)] },
        ],
        hints: [
          '先 `tcpdump -nn -r /var/tmp/pay-8080.pcap` 看全部：哪些是 SSH（22）、哪些是 DNS（53）、哪些是 8080？',
          '只要 8080 的 TCP 封包：過濾條件 `tcp port 8080`（或 `host 10.0.2.60 and port 8080`）。',
          '看 SYN 之後對方回了什麼：`[S.]`、`[R.]`，還是什麼都沒有、只有重送的 `[S]`？',
        ],
        explanation: '這份擷取裡，DNS 正常回答了 10.0.2.60，接著用戶端送出 SYN，在約 1 秒、3 秒與 7 秒後以同一個序號重送，pay 從來沒有回覆：SYN 在路上或在 pay 那一端被丟棄，該查的是 pay 的防火牆（主機的 ufw／nftables 與雲端的安全群組）與路由，而不是應用程式。另外兩次擷取各代表一層：SYN 之後立刻收到 `[R.]`，表示封包到了主機但被拒絕，要在 pay 上用 `ss -tlnp` 看 8080 有沒有程式在聽；交握完成、送出 `POST /v1/charges` 之後收到 `HTTP/1.1 503 Service Unavailable`，表示網路與埠都正常，問題在支付服務本身。不論哪一種，結論都來自封包的兩個方向，所以過濾條件要包含雙方，而不是只看其中一邊。',
      },
      {
        id: 'srv12-slow-timing', title: '報表很慢：時間花在哪一段', machine: 'srv12-slow',
        statement: '業務反映每天早上開 `http://reports.corp.example/daily` 都要等，但其他網站都很快。請先確認基本的連線，再用 curl 的 `-w` 量測時間：最後執行 `curl -s -o /dev/null -w \'dns=%{time_namelookup} connect=%{time_connect} start=%{time_starttransfer} total=%{time_total}\\n\' 網址`，網址用業務實際使用的這一個（名稱要經過 DNS），然後判斷時間主要花在 DNS、連線還是伺服器。檢查時，你的指令也會在另一個情況下重新執行（報表伺服器搬到了遠端機房）。',
        checks: [{ kind: 'output', fromCommand: '^curl ' }],
        solution: ['ping -c 3 reports.corp.example', timing(REPORT_URL)],
        mistakes: [
          { commands: [timing('http://reports-01/daily')], why: '用了 `/etc/hosts` 裡的短名稱：名稱解析的時間和業務實際經過 DNS 的情況不同，量到的不是使用者遇到的那一段。' },
          { commands: ['curl -s http://reports.corp.example/daily'], why: '沒有 `-w`：只印出報表的內容，看不到各個階段花了多少時間。' },
          { commands: ['ping -c 4 reports.corp.example'], why: 'ping 只量到網路的來回時間，看不到 DNS 與伺服器處理請求的時間；而且答案必須來自 curl 的量測。' },
        ],
        variants: [{ label: '報表伺服器搬到遠端機房的 reports-01', files: [], remotes: [reportsRemote(0.15, 85)] }],
        hints: [
          '`ping -c 3 reports.corp.example` 先確認名稱與主機都沒問題、來回時間正常。',
          '`-o /dev/null` 丟掉內容、`-s` 不印進度，`-w` 的格式照題目抄，`\\n` 讓結果自成一行。',
          '用減法：start − connect 大是伺服器慢，connect − dns 大是網路遠，dns 大是名稱解析慢。',
        ],
        explanation: 'ping 的來回時間不到 1 ms，網路沒有問題。curl -w 印出 `dns=0.024300 connect=0.024850 start=1.825450 total=1.825530`：DNS 24 ms、連線只多 0.55 ms，從連線完成到收到第一個位元組卻花了 1.8 秒，時間幾乎都在伺服器產生報表，該找的是報表程式或它的資料庫查詢。另一個情況下，報表伺服器搬到遠端機房：connect 比 dns 多出約 85 ms，start 又多了一個 85 ms 的來回與 0.15 秒的處理，這時主要慢在距離，改善的方向是把服務放近一點或減少來回的次數（例如重用連線）。用使用者實際的網址量測很重要：換成 `/etc/hosts` 的短名稱，DNS 那一段就不見了，萬一慢的正是 DNS，你會完全看不到。',
      },
    ],
  },
};
