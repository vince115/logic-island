import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';

/*
 * Synthetic machines for engine stages E10–E12 (docs/curriculum/SRV0_SERVER_CAPABILITY.md), only for tests: a server with
 * public and private interfaces, nginx (master and workers), PostgreSQL on 127.0.0.1, sshd and a learner's dev server
 * (sockets); a workstation whose resolver has a cache, an authoritative ns1 running BIND and the internet's zones (dns);
 * a client, a web server with responders and a legacy server without keep-alive (http).
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const home = [dir('/home'), dir('/home/learner', 'learner')];

// ------------------------------------------------------------------------------------------------------- E10 sockets

export const dbRemote: TerminalRemote = {
  host: 'db-01', address: '10.0.0.20', hostKey: 'db-01-key', files: [],
  accounts: { users: [{ name: 'postgres', uid: 114, comment: 'PostgreSQL administrator', home: '/var/lib/postgresql', shell: '/bin/bash' }] },
  processes: [{ pid: 900, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', listen: [{ port: 5432, address: '127.0.0.1', fd: 6, backlog: 200 }] }],
};
export const appRemote: TerminalRemote = {
  host: 'app-01', address: '10.0.0.30', hostKey: 'app-01-key', files: [],
  processes: [{ pid: 950, user: 'root', command: 'node /srv/app/server.js', listen: [{ port: 3000, fd: 18 }] }],
};

export const sockMachine: TerminalMachine = {
  id: 'web-01', title: 'web-01（公開的網頁伺服器）', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'sockets',
  interfaces: [{ name: 'eth0', address: '203.0.113.10/24' }, { name: 'eth1', address: '10.0.0.10/24' }], gateway: '203.0.113.1', address: '10.0.0.10',
  files: [...home, dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/web2.service', '[Unit]\nDescription=Second web server\n\n[Service]\nExecStart=/usr/local/bin/web2\n\n[Install]\nWantedBy=multi-user.target\n'),
    dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'), file('/usr/local/bin/web2', '', 'root', 0o755)],
  accounts: { users: [{ name: 'learner', group: 'learner' }, { name: 'postgres', uid: 114, home: '/var/lib/postgresql', shell: '/bin/bash' }], groups: [{ name: 'sudo', members: ['learner'] }] },
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' },
    { pid: 700, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', listen: [{ port: 22, fd: 3, backlog: 128 }] },
    { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', listen: [{ port: 80, fd: 6, backlog: 511 }] },
    { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
    { pid: 814, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
    { pid: 900, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', stat: 'Ss', listen: [{ port: 5432, address: '127.0.0.1', fd: 6, backlog: 200 }] },
    { pid: 1150, user: 'learner', command: 'python3 -m http.server 8000', stat: 'S', tty: 'pts/0', listen: [{ port: 8000, fd: 3, backlog: 5 }] },
  ],
  services: [], programs: [{ path: '/usr/local/bin/web2', listen: [{ port: 80, fd: 6 }] }],
  connections: [{ local: '10.0.0.10:22', peer: '10.0.0.5:51234', pid: 700, fd: 4 }, { local: '203.0.113.10:80', peer: '198.51.100.7:40112', state: 'TIME-WAIT' }],
  remotes: [dbRemote, appRemote],
};

// ---------------------------------------------------------------------------------------------------------- E11 dns

export const ZONE = `$ORIGIN example.com.
$TTL 3600
@       IN  SOA ns1.example.com. hostmaster.example.com. (
            2026112201 ; serial
            3600       ; refresh
            900        ; retry
            1209600    ; expire
            300 )      ; negative TTL
        IN  NS   ns1.example.com.
        IN  A    203.0.113.10
        IN  MX   10 mail.example.com.
        IN  TXT  "v=spf1 mx -all"
ns1     IN  A    10.0.0.53
mail    IN  A    203.0.113.25
www 300 IN  CNAME example.com.
cdn     IN  CNAME edge.cdn.example.net.
v6      IN  AAAA 2001:db8:0:0:0:0:0:10
`;
export const CDN_ZONE = '$ORIGIN cdn.example.net.\n$TTL 60\n@ IN SOA ns.cdn.example.net. ops.cdn.example.net. 7 3600 600 86400 60\n@ IN NS ns.cdn.example.net.\nns IN A 192.0.2.53\nedge IN A 192.0.2.80\n';
export const nsRemote: TerminalRemote = {
  host: 'ns1', address: '10.0.0.53', hostKey: 'ns1-key', named: true,
  files: [dir('/etc'), dir('/etc/bind', 'root'), file('/etc/bind/named.conf.local', 'zone "example.com" {\n\ttype master;\n\tfile "/etc/bind/db.example.com";\n};\n', 'root', 0o644, 'bind'),
    file('/etc/bind/db.example.com', ZONE, 'root', 0o644, 'bind')],
};
export const dnsMachine: TerminalMachine = {
  id: 'ws-01', title: 'ws-01（管理用的工作站）', user: 'learner', cwd: '/home/learner', host: 'ws-01', profile: 'dns', files: home,
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  remotes: [nsRemote], internet: [{ zone: 'cdn.example.net', text: CDN_ZONE }],
  dnsCache: [
    { name: 'example.com', type: 'A', ttl: 3600, cachedAt: '2026-11-22 09:40:00', data: ['198.51.100.99'] },
    { name: 'gone.example.com', type: 'A', ttl: 300, cachedAt: '2026-11-22 09:58:00', negative: 'NXDOMAIN', soa: 'example.com. ns1.example.com. hostmaster.example.com. 2026112201 3600 900 1209600 300' },
    { name: 'old.example.com', type: 'A', ttl: 60, cachedAt: '2026-11-22 09:00:00', data: ['192.0.2.1'] },
  ],
};

// --------------------------------------------------------------------------------------------------------- E12 http

export const SITE_ZONE = '$ORIGIN example.org.\n$TTL 300\n@ IN SOA ns.example.org. admin.example.org. 1 3600 600 86400 300\n@ IN NS ns.example.org.\nns IN A 192.0.2.53\n@ IN A 10.0.0.12\nwww IN CNAME example.org.\nlegacy IN A 10.0.0.12\nghost IN A 10.0.0.99\n';
export const webRemote: TerminalRemote = {
  host: 'web-02', address: '10.0.0.12', hostKey: 'web-02-key', files: [],
  processes: [
    { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', listen: [{ port: 80, fd: 6, backlog: 511, http: 'site' }, { port: 443, fd: 7, backlog: 511, http: 'site' }] },
    { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
    { pid: 990, user: 'www-data', command: '/usr/bin/legacy-httpd', stat: 'S', listen: [{ port: 8080, fd: 4, http: 'legacy' }] },
  ],
  responders: [
    {
      id: 'site', server: 'nginx/1.24.0 (Ubuntu)', routes: [
        { path: '/', host: 'example.org', redirect: 'http://www.example.org/' },
        { path: '/', body: '<h1>Welcome</h1>\n' },
        { path: '/old', redirect: '/new' },
        { path: '/new', body: 'new page\n', headers: [['Cache-Control', 'max-age=60']] },
        { path: '/loop', status: 302, redirect: '/loop' },
        { path: '/api/health', type: 'application/json', body: '{"ok":true}\n' },
        { path: '/form', methods: ['POST'], status: 201, body: 'created\n' },
        { path: '/static/*', type: 'text/css', body: 'body{}\n' },
      ],
    },
    { id: 'legacy', server: 'legacy/0.9', keepAlive: false, routes: [{ path: '/', body: 'old\n' }] },
  ],
};
export const httpMachine: TerminalMachine = {
  id: 'cli-01', title: 'cli-01（用 curl 觀察的用戶端）', user: 'learner', cwd: '/home/learner', host: 'cli-01', profile: 'http', files: home,
  remotes: [webRemote], internet: [{ zone: 'example.org', text: SITE_ZONE }],
};

// ------------------------------------------------------------------------------------------------- lesson content

export const listenExercise: TerminalExercise = {
  id: 'free-80', title: '讓第二個網頁伺服器啟動', machine: 'web-01',
  statement: 'web2.service 啟動失敗。找出占用 80 埠的程式，停止它（nginx 的 master 是 PID 812），再啟動 web2.service。',
  checks: [{ kind: 'listen', port: 80, process: 'web2' }, { kind: 'service', unit: 'web2.service', active: 'active' }],
  solution: ['sudo ss -tlnp sport = :80', 'sudo kill 812', 'sudo systemctl start web2'],
  mistakes: [{ commands: ['sudo systemctl start web2'], why: '80 埠仍被 nginx 占用' }],
  hints: ['sudo ss -tlnp 會列出監聽中的程式。'], explanation: '同一個位址與埠只能有一個 socket 監聽；先停止 nginx，web2 才能 bind 80 埠。',
};
export const nsLocal: TerminalMachine = {
  id: 'ns-01', title: 'ns-01（自己管理的 DNS 伺服器）', user: 'learner', cwd: '/home/learner', host: 'ns-01', profile: 'dns', address: '10.0.0.53', named: true,
  files: [...home, dir('/etc'), dir('/etc/bind'), file('/etc/bind/named.conf.local', 'zone "example.com" {\n\ttype master;\n\tfile "/etc/bind/db.example.com";\n};\n', 'root', 0o644, 'bind'),
    file('/etc/bind/db.example.com', ZONE, 'root', 0o644, 'bind')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
};
export const dnsExercise: TerminalExercise = {
  id: 'add-api', title: '新增 api 的 A 記錄', machine: 'ns-01',
  statement: '在區域檔加上 api.example.com 指向 203.0.113.30 的 A 記錄，並讓 named 載入它。',
  checks: [{ kind: 'dns', name: 'api.example.com', type: 'A', values: ['203.0.113.30'] }],
  solution: ["echo 'api IN A 203.0.113.30' | sudo tee -a /etc/bind/db.example.com", 'sudo named-checkzone example.com /etc/bind/db.example.com', 'sudo rndc reload example.com'],
  mistakes: [{ commands: ["echo 'api IN A 203.0.113.30' | sudo tee -a /etc/bind/db.example.com"], why: '改了檔案但沒有 rndc reload' }],
  hints: ['改完區域檔要 rndc reload。'], explanation: 'named 只在啟動或 reload 時讀取區域檔。',
};
export const httpExercise: TerminalExercise = {
  id: 'save-health', title: '把健康檢查的結果存下來', machine: 'cli-01',
  statement: '用 curl 取得 http://example.org/api/health 的內容並存到 ~/health.json。',
  checks: [{ kind: 'content', path: '/home/learner/health.json', content: '{"ok":true}\n' }, { kind: 'http', url: 'http://example.org/api/health', status: 200, header: ['Content-Type', 'application/json'] }],
  solution: ['curl -s -o health.json http://example.org/api/health'],
  mistakes: [{ commands: ['curl -s http://example.org/api/health'], why: '只印出內容，沒有存檔' }],
  hints: ['-o 檔案 把內容寫入檔案。'], explanation: '-o 把回應的內容寫入檔案；-s 不印錯誤與進度。',
};
export const serverContent = (): TerminalLessonContent => ({
  machines: [sockMachine, httpMachine],
  examples: [
    { id: 'listening', title: '誰在監聽', description: '列出監聽中的 TCP 埠。', machine: 'web-01', steps: [] },
    { id: 'health', title: 'curl 健康檢查', description: '只看狀態碼。', machine: 'cli-01', steps: [] },
    { id: 'redirect', title: '重新導向', description: '看 Location 標頭。', machine: 'cli-01', steps: [] },
  ],
  exercises: [listenExercise, httpExercise],
});
