import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';

/*
 * Synthetic machines for engine stages E18–E19 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §23–§25), only for tests: a
 * caching reverse proxy in front of a local application and static files (edge: proxy_cache, expires, validators); a
 * laptop, a CDN edge, its origin far away and a fictional purge API (edge: the CDN); a laptop with declared paths, a web
 * server behind ufw, a database server behind nft and a packet capture (diagnostics).
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644, mtime?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...mtime ? { mtime } : {} });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const home = [dir('/home'), dir('/home/learner', 'learner')];
const sudo = { groups: [{ name: 'sudo', members: ['learner'] }] };

// ------------------------------------------------------------------------------------------------- E18 proxy_cache

export const CACHE_SITE = `proxy_cache_path /var/cache/nginx/app levels=1:2 keys_zone=app:10m max_size=100m inactive=10m use_temp_path=off;

server {
    listen 80 default_server;
    server_name shop.example.com;
    root /srv/static;

    location /static/ {
        expires 1h;
        add_header X-Static yes;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache app;
        proxy_cache_valid 200 10s;
        proxy_cache_use_stale error timeout updating http_500;
        proxy_cache_bypass $http_x_nocache;
        add_header X-Cache-Status $upstream_cache_status always;
    }
    location /bg/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache app;
        proxy_cache_use_stale updating;
        proxy_cache_background_update on;
        proxy_cache_lock on;
        add_header X-Cache-Status $upstream_cache_status;
    }
    location /reval/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache app;
        proxy_cache_revalidate on;
        add_header X-Cache-Status $upstream_cache_status;
    }
    location /long/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache app;
        proxy_cache_key $scheme$host$request_uri;
        proxy_cache_min_uses 2;
        expires 30d;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
`;
export const cacheMachine: TerminalMachine = {
  id: 'web-cache', title: 'web-08（快取的反向代理）', user: 'learner', cwd: '/home/learner', host: 'web-08', profile: 'edge', nginx: true, accounts: sudo,
  files: [...home, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/shop', CACHE_SITE), dir('/etc/nginx/sites-enabled'),
    link('/etc/nginx/sites-enabled/shop', '/etc/nginx/sites-available/shop'), dir('/var'), dir('/var/cache'), dir('/var/cache/nginx'),
    dir('/srv'), dir('/srv/static'), dir('/srv/static/static'), file('/srv/static/static/logo.svg', '<svg/>\n', 'root', 0o644, '2026-11-20 08:00:00')],
  processes: [{ pid: 950, user: 'learner', command: 'node /srv/app/server.js', stat: 'Sl', listen: [{ address: '127.0.0.1', port: 3000, fd: 18, http: 'app' }] }],
  responders: [{
    id: 'app', server: 'node', routes: [
      { path: '/app.css', body: 'body{color:#333}\n', type: 'text/css', headers: [['Cache-Control', 'max-age=60']], etag: true },
      { path: '/news', body: 'news v1\n', type: 'text/plain' },
      { path: '/account', body: 'hello alice\n', type: 'text/plain', headers: [['Set-Cookie', 'sid=1; HttpOnly']] },
      { path: '/private', body: 'mine\n', type: 'text/plain', headers: [['Cache-Control', 'private, max-age=60']] },
      { path: '/vary', body: 'gzip or not\n', type: 'text/plain', headers: [['Cache-Control', 'max-age=60'], ['Vary', 'Accept-Encoding']] },
      { path: '/bg/*', body: 'report\n', type: 'text/plain', headers: [['Cache-Control', 'max-age=5']], delay: 3 },
      { path: '/reval/*', body: 'price list\n', type: 'text/plain', headers: [['Cache-Control', 'max-age=5']], etag: '"v1"' },
      { path: '/long/*', body: 'archive\n', type: 'text/plain', headers: [['Cache-Control', 'max-age=600']] },
      { path: '/*', body: 'app\n', type: 'text/plain' },
    ],
  }],
};

// --------------------------------------------------------------------------------------------------------- E18 CDN

export const origin: TerminalRemote = {
  host: 'origin-01', address: '10.0.0.30', hostKey: 'origin-key', latency: 60, files: [],
  processes: [{ pid: 900, user: 'root', command: '/usr/local/bin/origind', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'origin' }] }],
  responders: [{
    id: 'origin', server: 'origind/1.0', routes: [
      { path: '/app.v2.css', body: 'body{color:#000}\n', type: 'text/css', headers: [['Cache-Control', 'public, max-age=31536000, immutable']] },
      { path: '/index.html', body: '<h1>v2</h1>\n', headers: [['Cache-Control', 'public, max-age=30']], etag: true, lastModified: '2026-11-22 09:00:00' },
      { path: '/api/cart', body: '{"items":3}\n', type: 'application/json', headers: [['Cache-Control', 'no-store']] },
      { path: '/shared', body: 'shared\n', type: 'text/plain', headers: [['Cache-Control', 'max-age=0, s-maxage=120']] },
      { path: '/logo.png', body: 'PNG\n', type: 'image/png' },
    ],
  }],
};
export const edge01: TerminalRemote = {
  host: 'edge-01', address: '10.0.0.60', hostKey: 'edge-key', latency: 4, files: [],
  processes: [{ pid: 910, user: 'root', command: '/usr/local/bin/edged', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'edge' }] }],
  responders: [{ id: 'edge', cdn: { origin: 'origin-01', defaultTtl: 3600 }, routes: [] }],
  cdnCache: [{ responder: 'edge', entries: [{ url: 'http://www.example.com/app.css', body: 'body{color:red}\n', type: 'text/css', headers: [['Cache-Control', 'public, max-age=86400']], cachedAt: '2026-11-22 08:00:00', ttl: 86400 }] }],
};
export const cdnApi: TerminalRemote = {
  host: 'cdn-api', address: '10.0.0.70', hostKey: 'api-key', files: [],
  processes: [{ pid: 920, user: 'root', command: '/usr/local/bin/apid', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'api' }] }],
  responders: [{ id: 'api', server: 'cdn-api', routes: [{ path: '/purge', methods: ['POST'], purge: { edges: ['edge-01'], token: 'demo-token' } }] }],
};
export const cdnLaptop: TerminalMachine = {
  id: 'cdn-laptop', title: 'laptop（經由 CDN 看網站）', user: 'learner', cwd: '/home/learner', host: 'laptop', profile: 'edge', accounts: sudo, latency: 2,
  files: home, remotes: [edge01, origin, cdnApi],
};

// --------------------------------------------------------------------------------------------------- E19 diagnostics

/** A capture of curl http://web-01/ and of the DNS query before it (web-01 is 10.0.0.12). */
export const WEB_CAPTURE = [
  { t: 0, proto: 'udp' as const, src: '10.0.0.10:41234', dst: '10.0.0.53:53', dns: { id: 4660, name: 'web-01.example.com' } },
  { t: 0.000812, proto: 'udp' as const, src: '10.0.0.53:53', dst: '10.0.0.10:41234', dns: { id: 4660, name: 'web-01.example.com', answers: ['A 10.0.0.12'], response: true } },
  { t: 0.001, proto: 'tcp' as const, src: '10.0.0.10:51234', dst: '10.0.0.12:80', flags: 'S', seq: 1000 },
  { t: 0.0014, proto: 'tcp' as const, src: '10.0.0.12:80', dst: '10.0.0.10:51234', flags: 'S.', seq: 5000 },
  { t: 0.0015, proto: 'tcp' as const, src: '10.0.0.10:51234', dst: '10.0.0.12:80', flags: '.' },
  { t: 0.0016, proto: 'tcp' as const, src: '10.0.0.10:51234', dst: '10.0.0.12:80', flags: 'P.', payload: 'GET / HTTP/1.1\nHost: web-01\nUser-Agent: curl/8.5.0\nAccept: */*\n\n' },
  { t: 0.0021, proto: 'tcp' as const, src: '10.0.0.12:80', dst: '10.0.0.10:51234', flags: '.' },
  { t: 0.0025, proto: 'tcp' as const, src: '10.0.0.12:80', dst: '10.0.0.10:51234', flags: 'P.', payload: 'HTTP/1.1 200 OK\nContent-Length: 3\n\nok\n' },
  { t: 0.0026, proto: 'tcp' as const, src: '10.0.0.10:51234', dst: '10.0.0.12:80', flags: 'F.' },
  { t: 0.0029, proto: 'tcp' as const, src: '10.0.0.12:80', dst: '10.0.0.10:51234', flags: 'F.' },
  { t: 0.003, proto: 'tcp' as const, src: '10.0.0.10:51234', dst: '10.0.0.12:80', flags: '.' },
  { t: 1.5, proto: 'icmp' as const, src: '10.0.0.10', dst: '10.0.0.12', icmp: 'echo-request' as const, id: 7, icmpSeq: 1 },
  { t: 1.5004, proto: 'icmp' as const, src: '10.0.0.12', dst: '10.0.0.10', icmp: 'echo-reply' as const, id: 7, icmpSeq: 1 },
  { t: 2, proto: 'tcp' as const, src: '10.0.0.10:51240', dst: '10.0.1.20:5432', flags: 'S', seq: 777 },
  { t: 2.0003, proto: 'tcp' as const, src: '10.0.1.20:5432', dst: '10.0.0.10:51240', flags: 'R.', seq: 0, ack: 778 },
];
export const webServer: TerminalRemote = {
  host: 'web-01', address: '10.0.0.12', hostKey: 'web-key', files: [], latency: 0.2,
  processes: [{ pid: 930, user: 'root', command: '/usr/local/bin/webd', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'web' }] }],
  responders: [{ id: 'web', routes: [{ path: '/*', body: 'ok\n', type: 'text/plain' }] }],
  firewall: { enabled: true, rules: ['allow OpenSSH', 'allow 80/tcp'] },
};
export const dbServer: TerminalRemote = {
  host: 'db-01', address: '10.0.1.20', hostKey: 'db-key', files: [], interfaces: [{ name: 'eth0', address: '10.0.1.20/24' }],
  processes: [{ pid: 940, user: 'root', command: '/usr/local/bin/dbd', stat: 'Ss', listen: [{ port: 5432, fd: 5 }] }],
  firewall: { nftables: 'table inet filter {\n  chain input {\n    type filter hook input priority 0; policy drop;\n    ct state established,related accept\n    tcp dport 22 accept\n  }\n}\n' },
};
export const diagLaptop: TerminalMachine = {
  id: 'diag-laptop', title: 'laptop（網路診斷）', user: 'learner', cwd: '/home/learner', host: 'laptop', profile: 'diagnostics', accounts: sudo, latency: 0.3,
  files: [...home, file('/home/learner/access.log', 'GET /a 200\nGET /b 404\nPOST /c 500\nGET /d 200\n', 'learner')],
  paths: [
    { hops: [{ address: '10.0.0.1', rtt: 0.4 }, { address: '100.64.0.1', rtt: 3.2 }, { address: '203.0.113.9', rtt: 0, silent: true }, { address: '198.51.100.7', name: 'core1.transit.example', rtt: 9.8, loss: 30 }, { address: '93.184.216.34', name: 'www.example.com', rtt: 11.6 }] },
    { hops: [{ address: '10.0.0.1', rtt: 0.4 }, { address: '100.64.0.1', rtt: 3.1 }, { address: '192.0.2.50', rtt: 25, loss: 20 }, { address: '192.0.2.80', name: 'api.example.net', rtt: 27, loss: 20 }] },
  ],
  captures: [{ path: '/var/tmp/web.pcap', start: '2026-11-22 09:59:00', packets: WEB_CAPTURE }],
  remotes: [webServer, dbServer],
};
