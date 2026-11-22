import type { TerminalFile, TerminalJournalEntry, TerminalMachine, TerminalProcess, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * SRV01 Server Networking Essentials: IPs, Ports and Sockets (SRV-1, terminal-sim). A terminal lesson on the sockets
 * profile (engine stage E10): public, private (RFC 1918), loopback and documentation addresses, NAT in brief (and the
 * cloud's one-to-one NAT that ip addr does not show), interfaces and routes with ip -br addr, ip addr, ip route and
 * ip route get; ports, their ranges and the common service ports with /etc/services and getent services; a socket as
 * protocol, address and port, LISTEN versus ESTAB (and TIME-WAIT), binding 127.0.0.1, an interface address or 0.0.0.0
 * and who can reach each (0.0.0.0 is not "the internet" without NAT and firewalls in the picture); who listens with
 * ss -tlnp (sudo for other users' processes) and lsof -i; and reachability with nc -zv: succeeded, refused, timed out.
 * Machines: shop-01 (public eth0, private eth1, nginx, PostgreSQL, Redis and an app on 127.0.0.1, node exporter on
 * 9100) for the transcripts and the first exercise; ops-01 with api-02 (an application run by hand on 127.0.0.1 while
 * its service failed for a missing configuration file) for rebinding and for a private address; app-03 with two
 * dependencies (one configured at a wrong address, one whose service is stopped) for refused versus timed out. The
 * engine binds a program's declared sockets, so the rebinding exercise starts the service (whose program binds 0.0.0.0
 * once its configuration file exists) after stopping the instance run by hand, rather than re-reading a changed address.
 * Host names, users, programs and files are made up; public addresses come from RFC 5737. Every transcript output was
 * produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const exe = (path: string): TerminalFile => file(path, '', 'root', 0o755);
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00' };
const WANTS = '/etc/systemd/system/multi-user.target.wants';
const systemd = (time: string, unit: string, priority: number, message: string): TerminalJournalEntry => ({ time, unit, id: 'systemd', pid: 1, priority, message });

// ---- shop-01: the transcripts' server (public eth0, private eth1) and exercise 1 ----------------------------------------
const shopBase = (rest: TerminalProcess[]): TerminalProcess[] => [
  { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --system --deserialize=31', stat: 'Ss' },
  { pid: 650, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', listen: [{ port: 22, fd: 3, backlog: 128 }] },
  { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', listen: [{ port: 80, fd: 6, backlog: 511 }, { port: 443, fd: 7, backlog: 511 }] },
  { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
  { pid: 814, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
  { pid: 900, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf', stat: 'Ss', listen: [{ port: 5432, address: '127.0.0.1', fd: 6, backlog: 200 }] },
  { pid: 930, user: 'redis', command: '/usr/bin/redis-server 127.0.0.1:6379', stat: 'Ssl', listen: [{ port: 6379, address: '127.0.0.1', fd: 6, backlog: 511 }] },
  { pid: 1020, user: 'shop', command: 'node /srv/shop/server.js', stat: 'Ssl', listen: [{ port: 3000, address: '127.0.0.1', fd: 21, backlog: 511 }] },
  { pid: 1100, user: 'root', command: 'sshd: learner [priv]', stat: 'Ss', start: '2026-11-22 09:40:00' },
  { pid: 1140, ppid: 1100, user: 'learner', command: 'sshd: learner@pts/0', stat: 'S', start: '2026-11-22 09:40:00' },
  { pid: 1150, ppid: 1140, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', start: '2026-11-22 09:40:00' },
  { pid: 1180, ppid: 1150, user: 'learner', command: 'python3 -m http.server 8000', stat: 'S', tty: 'pts/0', start: '2026-11-22 09:45:00', listen: [{ port: 8000, fd: 3, backlog: 5 }] },
  ...rest,
];
const NODE_EXPORTER: TerminalProcess = { pid: 960, user: 'prometheus', command: '/usr/bin/prometheus-node-exporter', stat: 'Ssl', listen: [{ port: 9100, fd: 3 }] };
const backupRemote: TerminalRemote = { host: 'backup-01', title: '備份主機 backup-01', address: '10.20.0.31', hostKey: 'srv01-backup-01', files: [] };
const shop: TerminalMachine = {
  id: 'srv01-shop', title: '網店伺服器 shop-01', user: 'learner', host: 'shop-01', cwd: HOME, profile: 'sockets', ...CLOCK,
  interfaces: [{ name: 'eth0', address: '203.0.113.10/24' }, { name: 'eth1', address: '10.20.0.11/24' }], gateway: '203.0.113.1', address: '10.20.0.11',
  accounts: {
    users: [
      { name: 'postgres', uid: 114, home: '/var/lib/postgresql', comment: 'PostgreSQL administrator' },
      { name: 'redis', uid: 115, home: '/var/lib/redis', shell: NOLOGIN },
      { name: 'prometheus', uid: 116, home: '/var/lib/prometheus', shell: NOLOGIN },
      { name: 'shop', uid: 995, home: '/srv/shop', shell: NOLOGIN },
      { name: 'mei', uid: 1001 },
    ],
    groups: [{ name: 'sudo', members: ['learner'] }],
  },
  files: [dir('/etc'), dir('/home'), dir(HOME, 'learner'), dir('/home/mei', 'mei'), dir('/srv'), dir('/srv/shop', 'shop')],
  processes: shopBase([NODE_EXPORTER]),
  connections: [
    { local: '10.20.0.11:22', peer: '10.20.0.5:51234', pid: 1100, fd: 4 },
    { local: '203.0.113.10:443', peer: '198.51.100.23:50412', pid: 813, fd: 12 },
    { local: '203.0.113.10:443', peer: '192.0.2.77:61022', pid: 814, fd: 14 },
    { local: '203.0.113.10:80', peer: '198.51.100.23:50398', state: 'TIME-WAIT' },
  ],
  remotes: [backupRemote],
};
/** Exercise 1's variant: another day, the port is held by an HTTP server mei started by hand (node-exporter is not installed). */
const MEI_9100: TerminalProcess[] = shopBase([
  { pid: 1302, user: 'mei', command: '-bash', stat: 'Ss', tty: 'pts/1', start: '2026-11-22 09:20:00' },
  { pid: 1311, ppid: 1302, user: 'mei', command: 'python3 -m http.server 9100', stat: 'S', tty: 'pts/1', start: '2026-11-22 09:21:00', listen: [{ port: 9100, fd: 3, backlog: 5 }] },
]);

// ---- ops-01 and api-02: exercises 2 and 3 (another host, keys already set up) -----------------------------------------
const OPS_KEY = keyPair(`srv01-ops:learner:${HOME}/.ssh/id_ed25519`, 'learner@ops-01');
const known = (host: string, seed: string) => `${host} ${hostKey(seed, host).publicLine.split(' ').slice(0, 2).join(' ')}\n`;
const learnerOn = (key: { publicLine: string }) => [dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/authorized_keys`, `${key.publicLine}\n`, 'learner', 0o600)];
const keysOf = (key: { publicLine: string; privateText: string }, knownHosts: string) => [
  dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/id_ed25519`, key.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${key.publicLine}\n`, 'learner'),
  file(`${HOME}/.ssh/known_hosts`, knownHosts, 'learner'),
];
const INVENTORY_UNIT = '[Unit]\nDescription=Inventory API\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/inventory --config /etc/inventory/inventory.conf\nUser=inventory\n\n[Install]\nWantedBy=multi-user.target\n';
const INVENTORY_README = 'inventory：倉儲的庫存 API（HTTP）。\n\n設定檔用 --config 指定，一行一個設定，例如：\n  listen = 位址:埠\n\n沒有指定設定檔時，程式只監聽 127.0.0.1:8080，方便在本機測試。\n指定的設定檔不存在時，程式印出錯誤並結束。\n';
/** api-02: public eth0, private eth1 (or other names and addresses in the variant). mei runs inventory by hand; the service failed at boot. */
const apiRemote = (ifaces: { name: string; address: string }[], address: string): TerminalRemote => ({
  host: 'api-02', title: '倉儲 API 主機 api-02', address, hostKey: 'srv01-api-02', interfaces: ifaces,
  accounts: {
    users: [{ name: 'learner', uid: 1000 }, { name: 'mei', uid: 1001 }, { name: 'inventory', uid: 996, home: '/var/lib/inventory', shell: NOLOGIN }],
    groups: [{ name: 'sudo', members: ['learner'] }],
  },
  files: [
    ...learnerOn(OPS_KEY), dir('/home/mei', 'mei', 0o750), dir('/etc'), dir('/etc/inventory'), dir('/etc/systemd'), dir('/etc/systemd/system'),
    file('/etc/systemd/system/inventory.service', INVENTORY_UNIT), dir(WANTS), link(`${WANTS}/inventory.service`, '/etc/systemd/system/inventory.service'),
    dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'), exe('/usr/local/bin/inventory'), dir('/usr/share'), dir('/usr/share/doc'), dir('/usr/share/doc/inventory'),
    file('/usr/share/doc/inventory/README', INVENTORY_README), dir('/var'), dir('/var/lib'), dir('/var/lib/inventory', 'inventory', 0o750),
  ],
  processes: [
    { pid: 1290, user: 'mei', command: '-bash', stat: 'Ss', tty: 'pts/1', start: '2026-11-22 09:10:00' },
    { pid: 1320, ppid: 1290, user: 'mei', command: '/usr/local/bin/inventory', stat: 'Sl', tty: 'pts/1', start: '2026-11-22 09:12:00', listen: [{ port: 8080, address: '127.0.0.1', fd: 3 }] },
  ],
  services: [{ unit: 'inventory', active: 'failed', since: '2026-11-22 08:00:06', pid: 640, status: 1 }],
  programs: [{ path: '/usr/local/bin/inventory', fail: { message: 'open /etc/inventory/inventory.conf: no such file or directory', unless: '/etc/inventory/inventory.conf' }, listen: [{ port: 8080, fd: 3 }] }],
  journal: [
    systemd('2026-11-22 08:00:06', 'inventory', 6, 'Started inventory.service - Inventory API.'),
    { time: '2026-11-22 08:00:06', unit: 'inventory', id: 'inventory', pid: 640, priority: 3, message: 'open /etc/inventory/inventory.conf: no such file or directory' },
    systemd('2026-11-22 08:00:06', 'inventory', 5, 'inventory.service: Main process exited, code=exited, status=1/FAILURE'),
    systemd('2026-11-22 08:00:06', 'inventory', 4, "inventory.service: Failed with result 'exit-code'."),
  ],
});
const API_IFACES = [{ name: 'eth0', address: '198.51.100.21/24' }, { name: 'eth1', address: '10.30.0.21/24' }];
const API_OTHER = [{ name: 'ens5', address: '192.0.2.21/24' }, { name: 'ens6', address: '192.168.50.21/24' }];
const ops: TerminalMachine = {
  id: 'srv01-ops', title: '管理工作站 ops-01', user: 'learner', host: 'ops-01', cwd: HOME, profile: 'sockets', ...CLOCK,
  address: '10.30.0.5', keySeed: 'srv01-ops',
  files: [dir('/etc'), dir('/home'), dir(HOME, 'learner', 0o750), ...keysOf(OPS_KEY, known('api-02', 'srv01-api-02'))],
  remotes: [apiRemote(API_IFACES, '10.30.0.21')],
};
/** Exercises 2 and 3: the same host name with other interface names and addresses (its private one is a 192.168 address). */
const API_MOVED: TerminalVariant = { label: '網卡名稱與位址都不同的 api-02', files: [], remotes: [apiRemote(API_OTHER, '192.168.50.21')] };

// ---- app-03: exercise 4 (one dependency at a wrong address, one whose service is stopped) ---------------------------------
const APP_KEY = keyPair(`srv01-app:learner:${HOME}/.ssh/id_ed25519`, 'learner@app-03');
const SHOP_ENV = 'ORDERS_API=10.30.2.40:8081\nCACHE=10.30.2.65:6379\n';
const SHOP_ENV_FIXED = 'ORDERS_API=10.30.2.40:8081\nCACHE=10.30.2.56:6379\n';
const ORDERS_UNIT = '[Unit]\nDescription=Orders API\nAfter=network.target\n\n[Service]\nExecStart=/opt/orders/bin/orders-api --port 8081\nUser=orders\n\n[Install]\nWantedBy=multi-user.target\n';
const cacheRemote: TerminalRemote = {
  host: 'cache-01', title: '快取主機 cache-01', address: '10.30.2.56', hostKey: 'srv01-cache-01',
  accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'redis', uid: 115, home: '/var/lib/redis', shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: learnerOn(APP_KEY),
  processes: [{ pid: 930, user: 'redis', command: '/usr/bin/redis-server 0.0.0.0:6379', stat: 'Ssl', listen: [{ port: 6379, fd: 6, backlog: 511 }] }],
};
const ordersRemote: TerminalRemote = {
  host: 'orders-01', title: '訂單主機 orders-01', address: '10.30.2.40', hostKey: 'srv01-orders-01',
  accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'orders', uid: 995, home: '/opt/orders', shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [
    ...learnerOn(APP_KEY), dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/orders-api.service', ORDERS_UNIT), dir(WANTS),
    link(`${WANTS}/orders-api.service`, '/etc/systemd/system/orders-api.service'), dir('/opt'), dir('/opt/orders'), dir('/opt/orders/bin'), exe('/opt/orders/bin/orders-api'),
  ],
  services: [{ unit: 'orders-api', active: 'inactive', since: '2026-11-22 02:00:00' }],
  programs: [{ path: '/opt/orders/bin/orders-api', listen: [{ port: 8081, fd: 7 }] }],
  journal: [
    systemd('2026-11-22 02:00:00', 'orders-api', 6, 'Stopping orders-api.service - Orders API...'),
    systemd('2026-11-22 02:00:00', 'orders-api', 6, 'orders-api.service: Deactivated successfully.'),
    systemd('2026-11-22 02:00:00', 'orders-api', 6, 'Stopped orders-api.service - Orders API.'),
  ],
};
const app: TerminalMachine = {
  id: 'srv01-app', title: '網店應用主機 app-03', user: 'learner', host: 'app-03', cwd: HOME, profile: 'sockets', now: CLOCK.now, boot: '2026-11-19 06:00:00',
  interfaces: [{ name: 'eth0', address: '10.30.1.13/24' }], gateway: '10.30.1.1', address: '10.30.1.13', keySeed: 'srv01-app',
  accounts: { users: [{ name: 'shop', uid: 995, home: '/srv/shop', shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [
    dir('/etc'), dir('/etc/shop'), file('/etc/shop/shop.env', SHOP_ENV), dir('/home'), dir(HOME, 'learner', 0o750),
    ...keysOf(APP_KEY, known('cache-01', 'srv01-cache-01') + known('orders-01', 'srv01-orders-01')), dir('/srv'), dir('/srv/shop', 'shop'),
  ],
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --system --deserialize=31', stat: 'Ss' },
    { pid: 1020, user: 'shop', command: 'node /srv/shop/server.js', stat: 'Ssl', listen: [{ port: 3000, fd: 21, backlog: 511 }] }],
  remotes: [cacheRemote, ordersRemote],
};


/** Exercise 1: the output of `sudo ss -tlnp sport = :9100` on shop-01 as typed by hand (the variant shows another process). */
const TYPED_9100 = 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\\nLISTEN 0      4096         0.0.0.0:9100      0.0.0.0:*    users:(("prometheus-node",pid=960,fd=3))';
const INVENTORY_CONF = 'listen = 0.0.0.0:8080\n';
const WRITE_CONF = `echo '${INVENTORY_CONF.trim()}' | sudo tee /etc/inventory/inventory.conf`;
/** RFC 1918: 10.0.0.0/8, 172.16.0.0/12 (172.16–172.31) and 192.168.0.0/16, after the space ip -br puts before an address. */
const PRIVATE_GREP = "grep -E ' (10|172\\.(1[6-9]|2[0-9]|3[01])|192\\.168)\\.'";
const fixEnv = (text: string) => `printf '${text.replace(/\n/g, '\\n')}' | sudo tee /etc/shop/shop.env`;

export const SRV01: LessonContent = {
  lessonId: 'SRV01',
  motivation: '伺服器上的程式跑起來了，不代表別人連得到。網站打不開、應用程式連不上資料庫、同事說「我在伺服器上測試是好的」，這些狀況幾乎都能拆成同樣幾個問題：位址對不對、埠對不對、那個埠上有沒有程式在監聽，以及它監聽的是哪一個位址。本課在一台同時有公有與私有位址的網店伺服器上，先認識公有、私有與迴路位址和 NAT，用 `ip` 看懂介面與路由；再從常見服務埠與 `/etc/services` 認識連接埠，把 socket 理解為「協定加上位址與埠」，分清綁定 127.0.0.1 與 0.0.0.0 的差別；最後用 `ss`、`lsof` 找出誰在監聽，從另一台主機用 `nc` 測試，依 succeeded、refused、timed out 判斷問題出在位址、埠還是服務。',
  sections: [
    {
      id: 'srv01-s-ip', title: 'IP 位址：公有、私有與迴路',
      blocks: [
        { type: 'p', text: 'IPv4 位址是 32 位元的數字，寫成四個 0–255 的十進位數，例如 `10.20.0.11`。後面常接的 `/24` 是前綴長度：前 24 位元是網段（10.20.0），剩下的 8 位元區分網段裡的主機，所以 `10.20.0.0/24` 涵蓋 10.20.0.0 到 10.20.0.255。同一個網段裡的主機直接互相送封包；要去其他網段，就把封包交給預設閘道（路由器）轉送。' },
        { type: 'p', text: '位址依用途分成幾類。公有 IP 在整個網際網路上唯一，由網路服務供應商或雲端業者分配，網際網路上的路由器知道怎麼把封包送到它；私有 IP 是 RFC 1918 保留給內部網路的三個範圍，每個組織、每個家庭都可以重複使用，網際網路上的路由器不轉送以它們為目的地的封包。下表是管理伺服器最常遇到的範圍：' },
        { type: 'table', head: ['範圍', '類別', '說明'], rows: [
          ['`10.0.0.0/8`', '私有（RFC 1918）', '約 1677 萬個位址，雲端的虛擬網路與企業內網常用'],
          ['`172.16.0.0/12`', '私有（RFC 1918）', '172.16.0.0–172.31.255.255；`172.32.0.1` 已經不是私有位址'],
          ['`192.168.0.0/16`', '私有（RFC 1918）', '家用與小型辦公室的路由器最常用'],
          ['`127.0.0.0/8`', '迴路（loopback）', '送往這裡的封包不會離開本機；`127.0.0.1` 就是 localhost'],
          ['`100.64.0.0/10`', '電信業者共用位址（RFC 6598）', '給電信業者的 carrier-grade NAT 使用，不是公有位址，也不屬於 RFC 1918'],
          ['`169.254.0.0/16`', '鏈路本地（link-local）', '沒有取得位址時自動設定；許多雲端平台的中繼資料服務在 `169.254.169.254`'],
          ['`192.0.2.0/24`、`198.51.100.0/24`、`203.0.113.0/24`', '文件範例用（RFC 5737）', '保留給文件與教材，不會分配給真實主機；本課的「公有位址」都取自這三段'],
        ] },
        { type: 'p', text: '既然私有位址不會被轉送，家裡的筆電（例如 192.168.1.20）怎麼上網？靠的是路由器的 NAT（Network Address Translation，網路位址轉換）：封包出去時，路由器把來源的私有位址與埠換成自己的公有位址與一個埠，記下這組對應，回應回來時再換回去，所以網站看到的來源是路由器的公有位址。反方向就不行了：外面的主機主動連進來時，路由器不知道要交給哪一台內部主機，除非管理員設定了連接埠轉送（port forwarding）。這就是「服務只有私有位址時，網際網路連不到它」的原因。' },
        { type: 'p', text: '雲端主機常見另一種安排：虛擬機器的網卡上只有私有位址，公有 IP 由雲端業者的網路以一對一的 NAT 對應過來。這種主機用 `ip addr` 只看得到私有位址，找不到自己的公有 IP，這是正常的；公有位址要到雲端的主控台或中繼資料服務查詢。本課的 shop-01 則把兩種位址都直接放在網卡上：eth0 接網際網路，eth1 接內部網路。' },
      ],
    },
    {
      id: 'srv01-s-iface', title: '網路介面與 ip 指令',
      blocks: [
        { type: 'p', text: '介面（interface）是主機連到網路的出入口。每台 Linux 都有迴路介面 `lo`（127.0.0.1）；實體或虛擬的網卡依驅動與位置命名，傳統的名稱是 `eth0`、`eth1`，較新的系統常見 `ens5`、`enp0s3` 這類依硬體位置產生的名稱。一個介面可以有多個位址，一台主機也可以有多個介面，每個位址都屬於一個網段。查看介面用 iproute2 套件的 `ip` 指令（模擬環境只能查看，不能修改）：' },
        { type: 'table', head: ['指令', '看什麼'], rows: [
          ['`ip -br addr`', '每個介面一行：名稱、狀態（UP、DOWN；lo 是 UNKNOWN）、位址與前綴；加 `-4` 只列 IPv4'],
          ['`ip addr show eth1`', '單一介面的完整資料：MAC 位址（`link/ether`）、IPv4 位址（`inet`）與廣播位址（`brd`）、IPv6 位址（`inet6`）'],
          ['`ip route`', '路由表：`default via 閘道 dev 介面` 是預設路由，`… proto kernel scope link src …` 是介面所在的網段'],
          ['`ip route get 位址`', '核心連到這個位址時會經過哪個閘道、從哪個介面出去、用哪個本機位址當來源'],
        ] },
        { type: 'p', text: '下面的紀錄在 shop-01 上執行。`ip -br addr` 一眼看出 eth0 的 203.0.113.10 是公有位址、eth1 的 10.20.0.11 是私有位址；每個介面還有一個 `fe80::` 開頭的 IPv6 鏈路本地位址，通常由核心依 MAC 位址自動產生。`ip route` 的預設路由走 eth0，所以連往網際網路的封包從公有介面出去；`ip route get 10.20.0.31`（備份主機）沒有 via，表示目的地就在同一個網段，直接從 eth1 送達，來源位址是 10.20.0.11。' },
        { type: 'example', id: 'srv01-addr' },
        { type: 'callout', tone: 'note', title: 'ifconfig 與 netstat', text: '許多舊教材用 `ifconfig` 看位址、用 `netstat` 看連線。它們屬於 net-tools 套件，很多新安裝的發行版預設已經不裝；iproute2 的 `ip` 與 `ss` 是目前的標準工具，資訊也比較完整。在別人的伺服器上看到 `ifconfig: command not found` 時，改用 `ip addr` 即可。' },
      ],
    },
    {
      id: 'srv01-s-port', title: '連接埠與常見服務埠',
      blocks: [
        { type: 'p', text: 'IP 位址把封包送到主機，連接埠（port）再把它交給主機上的某個程式。埠號是 16 位元的數字，範圍 0–65535（0 保留不用），TCP 與 UDP 各有一套、互不相干：TCP 53 與 UDP 53 是兩個不同的埠。IANA 把埠號分成三段：' },
        { type: 'table', head: ['範圍', '名稱', '說明'], rows: [
          ['0–1023', 'well-known（系統埠）', 'SSH、HTTP、HTTPS 等標準服務；在 Linux 上，綁定這個範圍需要 root 或 `CAP_NET_BIND_SERVICE` 能力'],
          ['1024–49151', 'registered（登記埠）', '向 IANA 登記的應用程式，例如 PostgreSQL 的 5432、Redis 的 6379；一般使用者也能綁定'],
          ['49152–65535', 'dynamic（動態埠）', '給用戶端臨時使用。Linux 實際分配給連出連線的範圍另外設定，預設是 32768–60999（`net.ipv4.ip_local_port_range`）'],
        ] },
        { type: 'p', text: '用戶端連線時，自己這一端也需要一個埠，由核心從臨時埠的範圍挑一個沒用到的，例如之後的紀錄裡 10.20.0.5 連到 shop-01 的 SSH，用的就是 51234；伺服器則固定在約定好的埠上等待。下面這些常見服務埠值得記熟：' },
        { type: 'table', head: ['埠', '協定', '服務', '/etc/services 的名稱'], rows: [
          ['22', 'TCP', 'SSH 遠端登入', 'ssh'],
          ['25', 'TCP', 'SMTP，郵件伺服器之間的傳遞', 'smtp'],
          ['53', 'UDP 與 TCP', 'DNS 查詢', 'domain'],
          ['80', 'TCP', 'HTTP', 'http'],
          ['443', 'TCP（HTTP/3 用 UDP）', 'HTTPS', 'https'],
          ['587', 'TCP', '郵件用戶端寄信（submission）', 'submission'],
          ['3306', 'TCP', 'MySQL、MariaDB', 'mysql'],
          ['5432', 'TCP', 'PostgreSQL', 'postgresql'],
          ['6379', 'TCP', 'Redis', 'redis'],
          ['8080', 'TCP', 'HTTP 的替代埠，常給開發或內部服務使用', 'http-alt'],
        ] },
        { type: 'p', text: '`/etc/services` 是名稱與埠號的對照表，`getent services` 依它查詢（可以給名稱或埠號），`ss`、`lsof` 也用它把埠號顯示成名稱。它只是一份命名表：服務實際在哪個埠監聽，由服務自己的設定決定；把 SSH 改到 2222，`/etc/services` 裡的 ssh 仍然寫著 22。表中沒有登記的埠（例如 3000、8000）就只能顯示數字。' },
        { type: 'example', id: 'srv01-ports' },
        { type: 'callout', tone: 'tip', title: '排查時加 -n', text: '`ss -tl` 顯示 `0.0.0.0:http`，`ss -tln` 顯示 `0.0.0.0:80`。名稱好讀，但排查時要和設定檔裡的數字比對，名稱還可能讓你以為「http 埠上一定是網頁伺服器」。習慣上加 `-n`，一律看數字。' },
      ],
    },
    {
      id: 'srv01-s-socket', title: 'Socket：協定、位址與埠',
      blocks: [
        { type: 'p', text: '程式透過 socket 使用網路。伺服器程式建立一個 socket，綁定（bind）到「協定、本機位址、本機埠」，再開始監聽（listen）；ss 把這種 socket 顯示為 LISTEN，本課說的監聽埠就是它。用戶端連上來時，核心為這條連線產生一個新的 socket，狀態是 ESTAB（established）。一條 TCP 連線由協定加上四個值識別：本機位址、本機埠、對方位址、對方埠。所以 shop-01 的 443 埠可以同時有許多條連線，只要對方的位址或埠不同，就是不同的連線。' },
        { type: 'table', head: ['ss 的狀態', '意義'], rows: [
          ['LISTEN', 'TCP 的監聽 socket，等待新的連線；Peer 欄是 `0.0.0.0:*`（任何對方）'],
          ['UNCONN', 'UDP 的 socket。UDP 沒有連線，綁定之後就顯示為 UNCONN（例如 DNS 的 53）'],
          ['ESTAB', '已經建立的 TCP 連線，雙方可以互相傳資料'],
          ['TIME-WAIT', '先關閉連線的一方保留這組位址與埠一段時間（Linux 是 60 秒），避免延遲的封包被當成新連線的資料；它已經不屬於任何行程'],
          ['SYN-SENT', '用戶端送出連線請求、還在等回應；一直停在這裡通常表示對方沒有回應'],
        ] },
        { type: 'p', text: '綁定時的本機位址決定了誰連得到這個服務。`0.0.0.0` 代表「這台主機的每一個 IPv4 位址」，送到任何一個位址的連線都會被接受；`127.0.0.1` 只在迴路介面上，只有同一台主機上的程式連 127.0.0.1 才連得到；也可以綁定某一個介面的位址，例如只在內部網路提供服務的 `10.20.0.11`。以 shop-01 為例（目前沒有防火牆）：' },
        { type: 'table', head: ['綁定的位址', '本機連 127.0.0.1', '本機連 10.20.0.11', '內部網路的其他主機連 10.20.0.11', '網際網路連 203.0.113.10'], rows: [
          ['127.0.0.1', '成功', '拒絕', '拒絕', '拒絕'],
          ['10.20.0.11', '拒絕', '成功', '成功', '拒絕'],
          ['0.0.0.0', '成功', '成功', '成功', '成功'],
        ] },
        { type: 'p', text: '注意第一列的第二格：即使在同一台主機上，連自己的 10.20.0.11 也連不到只綁 127.0.0.1 的服務，因為目的位址不同。資料庫與快取常常刻意只綁 127.0.0.1：PostgreSQL 的 `listen_addresses` 預設是 localhost，Redis 預設的設定檔只綁定 127.0.0.1 與 IPv6 的 ::1，Ubuntu 的 MySQL 套件設定 `bind-address = 127.0.0.1`。shop-01 上的 PostgreSQL、Redis 與網店程式（3000）都只綁 127.0.0.1，網際網路只能經過綁在 0.0.0.0 的 nginx（80、443）進來，再由 nginx 轉給本機的 3000，這是很常見的安排。' },
        { type: 'p', text: 'IPv6 有對應的寫法：`::` 是所有 IPv6 位址，`::1` 是迴路。真實的 Ubuntu 上，sshd 與 nginx 通常同時監聽 0.0.0.0 與 `[::]`，ss 也會多出 `[::]:22` 這類的列；模擬環境只模擬 IPv4，所以只看得到 0.0.0.0 的那一列。' },
        { type: 'callout', tone: 'warning', title: '0.0.0.0 不等於「全世界都連得到」，也不等於安全', text: '綁定 0.0.0.0 只表示這台主機的每個位址都接受連線。外面能不能真的連到，還要看兩件事：主機有哪些位址（只有私有位址的主機，網際網路要經過 NAT 與連接埠轉送才進得來），以及途中有沒有防火牆擋下（主機上的 ufw、nftables，雲端的安全群組）。反過來，像 shop-01 這樣網卡上直接有公有位址、又沒有防火牆的主機，綁 0.0.0.0 的資料庫就真的對整個網際網路開放。正確的做法是把「綁哪個位址」和「防火牆允許誰」一起決定：資料庫只綁 127.0.0.1 或私有位址，防火牆只讓應用主機連進來（防火牆在本島的 SRV09 介紹）。' },
      ],
    },
    {
      id: 'srv01-s-ss', title: '誰在監聽：ss 與 lsof',
      blocks: [
        { type: 'p', text: '`ss`（socket statistics）列出核心裡的 socket，是查「這台主機上有哪些服務在監聽」的第一個指令。最常用的組合是 `ss -tlnp`，每個選項的意思如下：' },
        { type: 'table', head: ['選項', '意思'], rows: [
          ['`-t`、`-u`', '只列 TCP、UDP 的 socket（兩個都給就兩種都列，並多一欄 Netid）'],
          ['`-l`', '只列監聽中的 socket；不加時只列已建立的連線，`-a` 兩種都列'],
          ['`-n`', '埠號顯示數字，不換成 /etc/services 的名稱'],
          ['`-p`', '列出持有 socket 的行程：名稱、PID 與檔案描述子（fd）'],
          ['`sport = :埠`', '過濾條件：只列本機埠是這個埠的 socket（`dport` 比對對方的埠）'],
        ] },
        { type: 'p', text: '讀 `ss -tln` 的每一列，先看 Local Address:Port：位址是 0.0.0.0、127.0.0.1 還是某個介面位址，決定了誰連得到它。監聽中的 socket，Send-Q 是等待被接受的連線佇列上限（backlog），Recv-Q 是目前排隊的連線數，平常是 0。Process 欄由 `-p` 產生：`users:(("nginx",pid=814,fd=6),…)` 表示 nginx 的三個行程都持有這個 socket，因為 worker 是 master 產生的子行程，繼承了 master 開好的 socket。' },
        { type: 'p', text: '`-p` 有權限的限制：一般使用者只看得到自己行程的資訊，別人的行程那一格是空的；要看全部就用 `sudo ss -tlnp`。從埠號反查行程的另一個工具是 `lsof -i`：`lsof -i :5432` 列出用到 5432 的行程與使用者，`-P` 不把埠換成名稱、`-n` 不把位址換成主機名稱、`-sTCP:LISTEN` 只列監聽中的。它同樣只列出你有權限查看的行程，沒有符合時什麼都不印、結束碼是 1。' },
        { type: 'example', id: 'srv01-listen' },
        { type: 'callout', tone: 'warning', title: 'ss 沒加 sudo，Process 欄空白不代表沒有程式', text: '紀錄中不加 sudo 的 `ss -tlnp`，22、80、5432 等列的 Process 欄都是空的，只有 learner 自己的 python3 有資料。這不是「沒有程式」或「核心自己在聽」：socket 在 LISTEN，就一定有行程持有它，只是你沒有權限看別人的行程。同樣地，沒有 sudo 的 `lsof -i :5432` 什麼都不印，很容易被誤讀成「5432 沒有人在用」。查行程時，一律用 `sudo ss -tlnp` 或 `sudo lsof -i`。' },
        { type: 'p', text: '`ss -tn`（不加 `-l`）列出已建立的連線：紀錄中 10.20.0.5 從內部網路以 SSH 連到 eth1 的 10.20.0.11，兩個網際網路上的用戶端連到 eth0 的 443；80 埠的那一列是 TIME-WAIT，連線已經結束，所以沒有行程。' },
      ],
    },
    {
      id: 'srv01-s-nc', title: '測試連線：nc 與三種結果',
      blocks: [
        { type: 'p', text: '確認伺服器上有程式在監聽之後，下一步是從用戶端的角度測試。`nc -zv 主機 埠` 嘗試建立一條 TCP 連線，成功就立刻關閉、不傳任何資料（`-z`），並印出結果（`-v`）；`-w 秒數` 設定等待的上限，不加時要等核心自己放棄，在 Linux 上可能長達兩分鐘。結果只有幾種，每一種都指向不同的地方：' },
        { type: 'table', head: ['nc 的訊息', '代表什麼', '接下來查什麼'], rows: [
          ['`Connection to … succeeded!`', 'TCP 三向交握完成：位址上有主機，那個位址與埠上有程式在監聽', '網路這一層沒有問題；應用程式仍然失敗時，查通訊協定、帳號密碼、TLS 等應用層的設定'],
          ['`Connection refused`', '封包到了主機，但那個位址與埠沒有 socket 在監聽，主機的核心回覆 RST（防火牆的 REJECT 規則也會造成這個結果）', '到伺服器上用 `sudo ss -tlnp` 確認：服務有沒有在執行、埠號對不對、是不是只綁了 127.0.0.1'],
          ['`Connection timed out`（加 `-w` 時是 `timed out: Operation now in progress`）', '完全沒有回應：那個位址沒有機器、機器關機、路由不通，或途中的防火牆把封包丟掉', '核對位址（設定檔或 DNS 是否打錯）、主機是否開機、防火牆與雲端的安全群組'],
          ['`Name or service not known`', '名稱解析失敗，連線根本還沒開始', '名稱是否拼錯、`/etc/hosts` 與 DNS（SRV02）'],
        ] },
        { type: 'p', text: '位址就在同一個網段卻沒有機器時，Linux 也可能在幾秒後回報 `No route to host`，意思和逾時相近：那個位址沒有機器回應。refused 與 timed out 的差別是排查的關鍵：refused 表示「主機在，但門沒開」，問題在服務或埠；timed out 表示「找不到門」，問題在位址、路由或防火牆。下面的紀錄從 shop-01 測試自己與備份主機 backup-01，最後一個位址是一台已經沒有回應的外部主機。' },
        { type: 'example', id: 'srv01-reach' },
        { type: 'callout', tone: 'warning', title: '只在伺服器上測試，等於沒有測試可達性', text: '在伺服器上執行 `nc -zv 127.0.0.1 8080` 成功，只證明程式在執行、而且綁了 127.0.0.1，完全不能說明別台主機連得到；同事說「我在伺服器上測試是好的」，常常就是這個情況。可達性一定要從真正的用戶端（至少是同一個網路的另一台主機）測試，用的位址、名稱與埠也要和用戶端的設定一樣。' },
        { type: 'p', text: '把以上整理成排查的順序，就能判斷連線失敗是 IP、埠還是服務的問題：' },
        { type: 'list', ordered: true, items: [
          '在用戶端核對設定檔裡的位址與埠，並確認名稱解析出的位址是對的（`getent hosts 名稱`）。',
          '在用戶端執行 `nc -zv -w 3 位址 埠`：逾時，先查位址、主機與防火牆；被拒絕，到伺服器上查服務。',
          '在伺服器上執行 `sudo ss -tlnp`：服務有沒有在監聽？埠號和用戶端用的一致嗎？綁定的是 127.0.0.1、0.0.0.0 還是某個介面位址？',
          '修好之後，回到用戶端再測一次，看到 succeeded 才算完成。',
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'srv01-q1', prompt: '下列哪一個是 RFC 1918 的私有位址？',
      options: ['`172.32.10.5`', '`172.20.10.5`', '`192.0.2.10`', '`100.64.1.5`'],
      answer: 1,
      explanation: '172.16.0.0/12 涵蓋 172.16.0.0 到 172.31.255.255，所以 172.20.10.5 是私有位址。172.32.10.5 已經超出這個範圍；192.0.2.10 屬於 RFC 5737 的文件範例位址；100.64.1.5 屬於 RFC 6598 給電信業者 NAT 使用的共用位址，兩者都不是 RFC 1918 的私有位址。',
    },
    {
      id: 'srv01-q2', prompt: 'api-02 上的服務綁定 `127.0.0.1:8080`，沒有防火牆。從另一台主機執行 `nc -zv api-02 8080`，會得到什麼結果？',
      options: ['`succeeded!`，因為服務正在執行', '`Connection timed out`', '`Name or service not known`', '`Connection refused`'],
      answer: 3,
      explanation: '封包送到了 api-02 的網卡位址，但那個位址的 8080 沒有 socket（服務只綁 127.0.0.1），核心回覆 RST，所以是 Connection refused。只有 api-02 自己連 127.0.0.1 才會成功；逾時表示完全沒有回應，這裡主機明明在；名稱解析失敗則和綁定無關。',
    },
    {
      id: 'srv01-q3', prompt: 'learner 執行 `ss -tlnp`，`127.0.0.1:5432` 那一列的 Process 欄是空的。最合理的解讀是什麼？',
      options: ['learner 沒有權限查看別人的行程，改用 `sudo ss -tlnp` 就會看到持有它的行程', '5432 其實沒有程式在監聽，那一列是核心保留的', '那個程式已經當掉，只剩下 socket', '綁在 127.0.0.1 的 socket 本來就不顯示行程'],
      answer: 0,
      explanation: '`-p` 只能顯示你有權限查看的行程，別人的行程那一格是空的；加上 sudo 就會看到 postgres。socket 處於 LISTEN 一定有行程持有它，核心不會替程式保留監聽中的埠；程式結束時它的 socket 也跟著關閉；顯示與否和綁定的位址無關。',
    },
    {
      id: 'srv01-q4', prompt: 'app-03 執行 `nc -zv -w 3 10.30.2.65 6379`，得到 `timed out: Operation now in progress`。下一步最該做什麼？',
      options: ['登入 10.30.2.65，重新啟動 Redis', '把 Redis 改成綁定 0.0.0.0', '先核對位址：確認 10.30.2.65 是否真的是快取主機，以及途中有沒有防火牆丟棄封包', '改用其他埠，因為 6379 不是 Redis 的埠'],
      answer: 2,
      explanation: '逾時表示完全沒有回應：位址上沒有機器、主機關機、路由不通或防火牆丟棄封包，所以先核對位址與防火牆。服務沒在執行或只綁 127.0.0.1 時，主機會回 RST，得到的是 Connection refused 而不是逾時；6379 正是 Redis 的預設埠。',
    },
    {
      id: 'srv01-q5', prompt: '`sudo ss -tln` 顯示 `0.0.0.0:5432`。這代表什麼？',
      options: ['網際網路上任何人都一定連得到這個資料庫', '只接受來源位址是 0.0.0.0 的連線', '這台主機的任何一個 IPv4 位址都接受連線；外面實際連不連得到，還要看主機有哪些位址、NAT 與防火牆', '資料庫還在啟動，等所有介面設定好才會真正監聽'],
      answer: 2,
      explanation: '0.0.0.0 是「本機所有 IPv4 位址」，不是來源位址的限制，也不代表啟動未完成。它也不保證全世界都連得到：只有私有位址的主機要經過 NAT 與轉送，防火牆也可能擋下。但若主機有公有位址又沒有防火牆，資料庫就真的對網際網路開放了。',
    },
    {
      id: 'srv01-q6', prompt: '下列哪一組服務與預設埠全部正確？',
      options: ['SSH 22、HTTPS 443、PostgreSQL 5432', 'SSH 23、HTTPS 443、MySQL 5432', 'SSH 22、HTTP 8080、Redis 3306', 'SMTP 25、HTTPS 80、PostgreSQL 5432'],
      answer: 0,
      explanation: 'SSH 是 22、HTTPS 是 443、PostgreSQL 是 5432。23 是 telnet，MySQL 是 3306；HTTP 的標準埠是 80（8080 是替代埠），Redis 是 6379 而不是 3306；SMTP 25 正確，但 HTTPS 是 443，80 是 HTTP。',
    },
    {
      id: 'srv01-q7', prompt: '家裡的筆電 192.168.1.20 透過家用路由器連上一個網站，網站看到的來源位址是什麼？',
      options: ['192.168.1.20', '127.0.0.1', '路由器在家裡這一側的位址 192.168.1.1', '路由器對外的公有位址，因為 NAT 把來源的私有位址換掉了'],
      answer: 3,
      explanation: '路由器做 NAT：封包出去時把來源的私有位址與埠換成自己對外的公有位址與埠，回應再依記錄換回去，所以網站看到的是路由器的公有位址。192.168.1.20 與 192.168.1.1 都是私有位址，網際網路上無法回送；127.0.0.1 是筆電自己的迴路位址，從不出現在網路上。',
    },
    {
      id: 'srv01-q8', prompt: '`ss -tn` 顯示 shop-01 的 `203.0.113.10:443` 同時有兩條 ESTAB 連線。它們為什麼能共用同一個本機埠？',
      options: ['nginx 的兩個 worker 各自綁定了一次 443', '一條 TCP 連線由協定加上本機位址、本機埠、對方位址、對方埠識別，對方不同就是不同的連線', '第二條連線其實在排隊，等第一條結束才會傳資料', '443 是 well-known 埠，核心特別允許重複使用'],
      answer: 1,
      explanation: '監聽的 socket 只有一個，每條已建立的連線各有自己的 socket，以協定與四個值（本機位址與埠、對方位址與埠）區分，所以同一個本機埠可以有許多條連線。worker 是繼承 master 的同一個監聽 socket，不是各自綁定；ESTAB 的連線都能同時傳資料；well-known 埠沒有特別的重複使用規則。',
    },
  ],
  terminal: {
    machines: [shop, ops, app],
    examples: [
      {
        id: 'srv01-addr', title: 'shop-01 的介面、位址與路由', machine: 'srv01-shop',
        description: 'shop-01 有兩個介面：eth0 是公有位址 203.0.113.10，eth1 是私有位址 10.20.0.11。`ip route` 列出兩個直連的網段與走 eth0 的預設閘道；`ip route get` 說出連到備份主機與網際網路上的位址時，各走哪個介面、用哪個來源位址。',
        steps: [
          { command: 'ip -br addr', output: 'lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0             UP             203.0.113.10/24 fe80::5054:ff:fe0a:b824/64\neth1             UP             10.20.0.11/24 fe80::5054:ff:fedc:7a76/64' },
          { command: 'ip addr show eth1', output: '3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 52:54:00:dc:7a:76 brd ff:ff:ff:ff:ff:ff\n    inet 10.20.0.11/24 brd 10.20.0.255 scope global eth1\n       valid_lft forever preferred_lft forever\n    inet6 fe80::5054:ff:fedc:7a76/64 scope link\n       valid_lft forever preferred_lft forever' },
          { command: 'ip route', output: 'default via 203.0.113.1 dev eth0 proto static\n203.0.113.0/24 dev eth0 proto kernel scope link src 203.0.113.10\n10.20.0.0/24 dev eth1 proto kernel scope link src 10.20.0.11' },
          { command: 'ip route get 10.20.0.31', output: '10.20.0.31 dev eth1 src 10.20.0.11 uid 1000\n    cache' },
          { command: 'ip route get 8.8.8.8', output: '8.8.8.8 via 203.0.113.1 dev eth0 src 203.0.113.10 uid 1000\n    cache' },
        ],
      },
      {
        id: 'srv01-ports', title: '服務名稱與埠號的對照', machine: 'srv01-shop',
        description: '`getent services` 依 `/etc/services` 把服務名稱換成埠號，反過來也可以；3000 沒有登記名稱，所以什麼都不印、結束碼是 2。`ss -tl` 不加 `-n` 時，有登記的埠號會顯示成名稱。',
        steps: [
          { command: 'getent services ssh https postgresql', output: 'ssh                   22/tcp\nhttps                 443/tcp\npostgresql            5432/tcp postgres' },
          { command: 'getent services 6379', output: 'redis                 6379/tcp' },
          { command: 'getent services 3000', output: '' },
          { command: 'echo $?', output: '2' },
          { command: 'grep -w 5432 /etc/services', output: 'postgresql\t5432/tcp\t\tpostgres\t# PostgreSQL Database' },
          { command: 'ss -tl', output: 'State  Recv-Q Send-Q Local Address:Port       Peer Address:Port Process\nLISTEN 0      128          0.0.0.0:ssh             0.0.0.0:*\nLISTEN 0      4096      127.0.0.53:domain          0.0.0.0:*\nLISTEN 0      4096      127.0.0.54:domain          0.0.0.0:*\nLISTEN 0      511          0.0.0.0:http            0.0.0.0:*\nLISTEN 0      511          0.0.0.0:https           0.0.0.0:*\nLISTEN 0      511        127.0.0.1:3000            0.0.0.0:*\nLISTEN 0      200        127.0.0.1:postgresql      0.0.0.0:*\nLISTEN 0      511        127.0.0.1:redis           0.0.0.0:*\nLISTEN 0      5            0.0.0.0:8000            0.0.0.0:*\nLISTEN 0      4096         0.0.0.0:9100            0.0.0.0:*' },
        ],
      },
      {
        id: 'srv01-listen', title: '誰在監聽：ss 與 lsof', machine: 'srv01-shop',
        description: '不加 sudo 的 `ss -tlnp`，Process 欄只出現 learner 自己的 python3；加上 sudo 才看到每個 socket 屬於哪個行程，nginx 的 master 與兩個 worker 共用 80 與 443。`lsof -i :5432` 從埠號找行程（同樣要 sudo），`ss -tn` 列出已經建立的連線。',
        steps: [
          { command: 'ss -tlnp', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128          0.0.0.0:22        0.0.0.0:*\nLISTEN 0      4096      127.0.0.53:53        0.0.0.0:*\nLISTEN 0      4096      127.0.0.54:53        0.0.0.0:*\nLISTEN 0      511          0.0.0.0:80        0.0.0.0:*\nLISTEN 0      511          0.0.0.0:443       0.0.0.0:*\nLISTEN 0      511        127.0.0.1:3000      0.0.0.0:*\nLISTEN 0      200        127.0.0.1:5432      0.0.0.0:*\nLISTEN 0      511        127.0.0.1:6379      0.0.0.0:*\nLISTEN 0      5            0.0.0.0:8000      0.0.0.0:*    users:(("python3",pid=1180,fd=3))\nLISTEN 0      4096         0.0.0.0:9100      0.0.0.0:*' },
          { command: 'sudo ss -tlnp', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=650,fd=3))\nLISTEN 0      4096      127.0.0.53:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=14))\nLISTEN 0      4096      127.0.0.54:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=16))\nLISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=814,fd=6),("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))\nLISTEN 0      511          0.0.0.0:443       0.0.0.0:*    users:(("nginx",pid=814,fd=7),("nginx",pid=813,fd=7),("nginx",pid=812,fd=7))\nLISTEN 0      511        127.0.0.1:3000      0.0.0.0:*    users:(("node",pid=1020,fd=21))\nLISTEN 0      200        127.0.0.1:5432      0.0.0.0:*    users:(("postgres",pid=900,fd=6))\nLISTEN 0      511        127.0.0.1:6379      0.0.0.0:*    users:(("redis-server",pid=930,fd=6))\nLISTEN 0      5            0.0.0.0:8000      0.0.0.0:*    users:(("python3",pid=1180,fd=3))\nLISTEN 0      4096         0.0.0.0:9100      0.0.0.0:*    users:(("prometheus-node",pid=960,fd=3))' },
          { command: 'lsof -i :5432', output: '' },
          { command: 'echo $?', output: '1' },
          { command: 'sudo lsof -i :5432', output: 'COMMAND  PID     USER FD TYPE DEVICE SIZE/OFF NODE NAME\npostgres 900 postgres 6u IPv4  14804      0t0  TCP localhost:postgresql (LISTEN)' },
          { command: 'ss -tn', output: 'State     Recv-Q Send-Q Local Address:Port  Peer Address:Port  Process\nESTAB     0      0         10.20.0.11:22       10.20.0.5:51234\nTIME-WAIT 0      0       203.0.113.10:80   198.51.100.23:50398\nESTAB     0      0       203.0.113.10:443     192.0.2.77:61022\nESTAB     0      0       203.0.113.10:443  198.51.100.23:50412' },
        ],
      },
      {
        id: 'srv01-reach', title: 'nc 的三種結果', machine: 'srv01-shop',
        description: 'PostgreSQL 綁在 127.0.0.1：從本機連 127.0.0.1 成功，連自己的私有位址 10.20.0.11 就被拒絕；綁在 0.0.0.0 的 8000 連 10.20.0.11 也成功。backup-01 的 22 埠有 sshd 在監聽，5432 沒有程式而被拒絕；192.0.2.80 完全沒有回應，`-w 3` 等了三秒後放棄。',
        steps: [
          { command: 'nc -zv 127.0.0.1 5432', output: 'Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!' },
          { command: 'nc -zv 10.20.0.11 5432', output: 'nc: connect to 10.20.0.11 port 5432 (tcp) failed: Connection refused' },
          { command: 'nc -zv 10.20.0.11 8000', output: 'Connection to 10.20.0.11 8000 port [tcp/*] succeeded!' },
          { command: 'nc -zv backup-01 22', output: 'Connection to backup-01 (10.20.0.31) 22 port [tcp/ssh] succeeded!' },
          { command: 'nc -zv backup-01 5432', output: 'nc: connect to backup-01 (10.20.0.31) port 5432 (tcp) failed: Connection refused' },
          { command: 'nc -zv -w 3 192.0.2.80 443', output: 'nc: connect to 192.0.2.80 port 443 (tcp) timed out: Operation now in progress' },
          { command: 'echo $?', output: '1' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv01-port-owner', title: '找出監聽 9100 的程式', machine: 'srv01-shop',
        statement: '安全掃描回報 shop-01 的 TCP 9100 在所有位址上開著，但沒有人記得那是什麼服務。請找出是哪個程式在監聽：用 `ss` 列出監聽中的 TCP socket，埠以數字顯示並附上持有它的行程，再用過濾條件 `sport = :9100` 只印出標題與那一列。先不要停止任何程式。檢查時，你的指令也會在另一天（9100 由別的程式占用）的 shop-01 上重新執行一次。',
        checks: [{ kind: 'output' }, { kind: 'listen', port: 9100 }],
        solution: ['sudo ss -tlnp', 'sudo ss -tlnp sport = :9100'],
        mistakes: [
          { commands: ['ss -tlnp sport = :9100'], why: '沒有 sudo：9100 不是 learner 的行程，Process 欄是空的，看不出是誰在監聽。' },
          { commands: ['sudo ss -tln sport = :9100'], why: '少了 `-p`，只看得到位址與埠，沒有列出持有 socket 的行程。' },
          { commands: [`echo -e '${TYPED_9100}'`], why: '直接打出今天看到的結果：另一天占用 9100 的是別的程式，打出來的文字就不對了。' },
        ],
        variants: [{ label: '9100 由 mei 手動啟動的程式占用的另一天', files: [], processes: MEI_9100 }],
        hints: [
          '`-t` TCP、`-l` 監聽中、`-n` 數字、`-p` 行程，可以合寫成 `-tlnp`。',
          '9100 的程式不屬於 learner，不加 sudo 時 Process 欄會是空的。',
          '過濾條件寫在選項後面：`sport = :9100`。',
        ],
        explanation: '`sudo ss -tlnp sport = :9100` 印出標題與 `0.0.0.0:9100` 那一列，Process 欄是 `users:(("prometheus-node",pid=960,fd=3))`：Prometheus 的 node exporter，提供主機的監控數據，綁在 0.0.0.0，所以網際網路也掃得到它。另一天同一行指令印出的是 mei 手動執行的 python3。找到程式之後，下一步是決定它該不該對外：只給內部的監控主機抓取的話，就改綁私有位址或用防火牆限制來源。',
      },
      {
        id: 'srv01-rebind', title: '讓 inventory 從另一台主機連得到', machine: 'srv01-ops',
        statement: '倉儲團隊回報：從辦公網路連不到 api-02 的庫存 API（TCP 8080），但同事 mei 說她在 api-02 上測試是好的。你在 ops-01 上，可以用 `ssh api-02` 登入（金鑰已經設定好，你在 api-02 有 sudo；mei 同意結束她手動執行的測試程式）。請讓 `inventory.service` 依設定檔 `/etc/inventory/inventory.conf` 在 0.0.0.0:8080 監聽，設定檔的內容只有一行 `listen = 0.0.0.0:8080`；程式的說明在 `/usr/share/doc/inventory/README`。服務順利執行後，回到 ops-01 用 `nc -zv api-02 8080` 確認從另一台主機連得到。檢查時，你的指令也會在網卡名稱與位址都不同的另一台 api-02 上重新執行一次。',
        checks: [
          { kind: 'content', host: 'api-02', path: '/etc/inventory/inventory.conf', content: INVENTORY_CONF },
          { kind: 'listen', host: 'api-02', port: 8080, address: '0.0.0.0', process: 'inventory' },
          { kind: 'output' },
        ],
        solution: ['ssh api-02', 'sudo ss -tlnp sport = :8080', WRITE_CONF, 'sudo kill 1320', 'sudo systemctl start inventory', 'sudo ss -tlnp sport = :8080', 'exit', 'nc -zv api-02 8080'],
        mistakes: [
          { commands: ['ssh api-02', 'nc -zv 127.0.0.1 8080', 'exit'], why: '只在 api-02 上連 127.0.0.1：mei 手動執行的程式綁在 127.0.0.1，當然成功，但這只證明程式在執行；從 ops-01 連 api-02 仍然被拒絕，什麼都沒有改變。' },
          { commands: ['ssh api-02', WRITE_CONF, 'sudo systemctl start inventory', 'exit', 'nc -zv api-02 8080'], why: 'mei 的程式還占著 127.0.0.1:8080，服務要綁 0.0.0.0:8080 時失敗（Address already in use），inventory.service 仍是 failed，從 ops-01 仍然被拒絕。' },
          { commands: ['ssh api-02', 'sudo kill 1320', 'sudo systemctl start inventory', 'exit', 'nc -zv api-02 8080'], why: '沒有建立設定檔：服務啟動時找不到 /etc/inventory/inventory.conf 就結束，8080 上沒有任何程式了。' },
          { commands: ['ssh api-02', 'sudo kill 1320', WRITE_CONF, 'systemctl start inventory', 'exit', 'nc -zv api-02 8080'], why: '啟動服務沒有加 sudo：systemctl 回報 Interactive authentication required，服務沒有啟動。' },
        ],
        variants: [API_MOVED],
        hints: [
          '先在 ops-01 執行 `nc -zv api-02 8080`，再登入 api-02 用 `sudo ss -tlnp sport = :8080` 看是誰、綁在哪個位址。',
          '`systemctl status inventory` 的日誌說明了服務為什麼失敗；設定檔可以用 `echo … | sudo tee 檔案` 寫入。',
          '同一個埠已經有程式綁在 127.0.0.1 時，服務綁不了 0.0.0.0 的同一個埠：先結束 mei 的程式（PID 在 ss 的 Process 欄），再 `sudo systemctl start inventory`。',
          '最後 `exit` 回到 ops-01，從這台主機測試。',
        ],
        explanation: '從 ops-01 測試是 Connection refused：主機在，但它的網卡位址上 8080 沒有程式。在 api-02 上，`sudo ss -tlnp` 顯示 8080 只綁在 127.0.0.1，屬於 mei 手動執行的 inventory（沒有設定檔時的預設），這就是 mei 在本機測試成功、其他主機卻被拒絕的原因；正式的 inventory.service 則因為缺少設定檔而失敗。寫好 `listen = 0.0.0.0:8080`、結束占用 8080 的手動程式、啟動服務之後，ss 顯示 `0.0.0.0:8080`，回到 ops-01 的 `nc -zv api-02 8080` 才是 succeeded。上線前還要用防火牆限制只有辦公網路能連，而不是讓所有位址都能連進來。',
      },
      {
        id: 'srv01-private-addr', title: '找出 api-02 的私有位址', machine: 'srv01-ops',
        statement: 'api-02 有一個公有位址與一個私有位址。請在 ops-01 上用一行指令，經由 `ssh api-02` 取得 `ip -4 -br addr` 的輸出，再用 grep 只留下位址屬於私有網段（RFC 1918 的三個範圍）的那一行。檢查時，你的指令也會在另一台 api-02 上重新執行一次，那台的網卡名稱與位址都不同，私有位址也可能落在另一個 RFC 1918 範圍，所以要依網段挑選，而不是比對你看到的位址或介面名稱。',
        checks: [{ kind: 'output' }],
        solution: ['ssh api-02 ip -4 -br addr', `ssh api-02 ip -4 -br addr | ${PRIVATE_GREP}`],
        mistakes: [
          { commands: ['ssh api-02 ip -4 -br addr show eth1'], why: '直接指定看到的介面名稱：另一台 api-02 的網卡叫 ens5 與 ens6，沒有 eth1。' },
          { commands: ['ssh api-02 ip -4 -br addr | grep 10.30.0.21'], why: '比對今天看到的位址：另一台 api-02 的私有位址不是這個。' },
          { commands: ["ssh api-02 ip -4 -br addr | grep -E ' (10|172|192)\\.'"], why: '`192.` 開頭不一定是私有位址：另一台 api-02 的公有位址 192.0.2.21 也被選進來了；私有的是 192.168.0.0/16。' },
          { commands: [`ip -4 -br addr | ${PRIVATE_GREP}`], why: '沒有經過 ssh，印出的是 ops-01 自己的私有位址，不是 api-02 的。' },
        ],
        variants: [API_MOVED],
        hints: [
          '`ssh 主機 指令` 在遠端執行指令，輸出回到本機，可以直接接管線交給 grep。',
          'RFC 1918 的範圍是 10.0.0.0/8、172.16.0.0/12（172.16 到 172.31）與 192.168.0.0/16。',
          '`ip -br` 的位址前面有空白，`grep -E` 的樣式可以寫成以空白開頭、再接三個範圍之一與一個句點。',
        ],
        explanation: "`ssh api-02 ip -4 -br addr | grep -E ' (10|172\\.(1[6-9]|2[0-9]|3[01])|192\\.168)\\.'` 只留下位址屬於 RFC 1918 的那一行：今天是 eth1 的 10.30.0.21/24，另一台是 ens6 的 192.168.50.21/24。樣式開頭的空白確保比對的是位址的開頭（不會在 198.51.100.21 的中間找到 10.）；`192\\.168\\.` 排除了同樣以 192 開頭的公有位址 192.0.2.21。私有位址只在內部網路有意義，所以內部的服務（資料庫、監控）應該使用它，對外的服務才用公有位址。",
      },
      {
        id: 'srv01-diagnose', title: '被拒絕還是逾時：修好兩個相依服務', machine: 'srv01-app',
        statement: 'app-03 上的網店程式從今天凌晨起連不到兩個相依服務，位址寫在 `/etc/shop/shop.env`：`ORDERS_API` 是 orders-01 上的訂單 API，`CACHE` 是 cache-01 上的 Redis。請在 app-03 上用 `nc -zv -w 3` 逐一測試這兩個位址與埠，依結果判斷問題出在位址還是服務並修好：如果是位址錯了，就把設定檔裡那一行改成 `getent hosts` 查到的正確 IP（其他內容不變，仍然寫成 IP:埠）；如果主機有回應、只是沒有程式在監聽，就登入那台主機（`ssh 主機`，金鑰已設定好，你在兩台主機都有 sudo）把服務啟動起來。最後再用 `nc -zv` 確認兩個都連得到。',
        checks: [
          { kind: 'content', path: '/etc/shop/shop.env', content: SHOP_ENV_FIXED },
          { kind: 'listen', host: 'orders-01', port: 8081, process: 'orders-api' },
        ],
        solution: ['cat /etc/shop/shop.env', 'getent hosts cache-01 orders-01', fixEnv(SHOP_ENV_FIXED), 'ssh orders-01 sudo systemctl start orders-api', 'nc -zv 10.30.2.56 6379', 'nc -zv 10.30.2.40 8081'],
        mistakes: [
          { commands: [fixEnv(SHOP_ENV_FIXED)], why: '只修正了快取的位址：訂單 API 是 Connection refused，表示 orders-01 在、但 8081 沒有程式在監聽，服務還停著。' },
          { commands: ['ssh orders-01 sudo systemctl start orders-api'], why: '只啟動了訂單 API：快取是逾時，10.30.2.65 上根本沒有機器回應，設定檔裡的位址仍然是錯的。' },
          { commands: [fixEnv('ORDERS_API=10.30.2.41:8081\nCACHE=10.30.2.56:6379\n')], why: '把被拒絕當成位址錯誤：refused 表示 10.30.2.40 有回應，位址是對的；問題在 orders-01 上的服務沒有執行。' },
          { commands: [fixEnv(SHOP_ENV_FIXED), 'ssh orders-01 systemctl start orders-api'], why: '在 orders-01 上啟動服務沒有加 sudo，systemctl 回報 Interactive authentication required，服務仍然停著。' },
        ],
        hints: [
          '`cat /etc/shop/shop.env` 看設定，再對每一行執行 `nc -zv -w 3 位址 埠`。',
          'timed out：那個位址沒有機器回應，用 `getent hosts cache-01` 核對；refused：主機在，但那個埠沒有程式。',
          '寫回設定檔可以用 `printf \'…\\n…\\n\' | sudo tee /etc/shop/shop.env`；在另一台主機執行一個指令可以用 `ssh 主機 sudo systemctl start 服務`。',
        ],
        explanation: '`nc -zv -w 3 10.30.2.65 6379` 逾時：完全沒有回應，代表那個位址上沒有機器。`getent hosts cache-01` 顯示快取主機是 10.30.2.56，設定檔把 56 打成了 65，改正之後 `nc -zv 10.30.2.56 6379` 成功。`nc -zv -w 3 10.30.2.40 8081` 則是 Connection refused：orders-01 回覆了，只是 8081 上沒有程式；`systemctl status orders-api` 顯示它在凌晨 2 點被停止後就沒有再啟動，`sudo systemctl start orders-api` 之後 8081 有程式在監聽，連線就成功了。同樣是「連不上」，逾時要查位址、主機與防火牆，被拒絕要查服務與埠。',
      },
    ],
  },
};
