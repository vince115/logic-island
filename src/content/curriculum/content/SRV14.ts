/*
 * SRV14 Networks and Servers Capstone: Run an HTTPS Site (SRV-5, challenge-stages). The island's capstone on the
 * diagnostics profile (engine stage E19, which includes E10–E18): one coffee shop's site, tidecoffee.example, built and run
 * through six stages, each a terminal exercise checked on the machines: (1) DNS and the certificate — ns1's zone still points
 * the apex at the old host and www's CNAME lacks its trailing dot; fix, bump the serial, named-checkzone, rndc reload, then
 * certbot --nginx for both names (SRV02, SRV04); (2) nginx terminates TLS and proxies to an upstream of two app servers on
 * the private network (max_fails, fail_timeout, a backup maintenance page) with Host, X-Real-IP, X-Forwarded-For and
 * X-Forwarded-Proto, checked through the app's echo route and with one app server down (SRV06–SRV08); (3) ufw on web-01 (80
 * and 443 public, 22 only from the bastion's private address) and on the app servers (8080 only from web-01), rules before
 * enabling, everything managed through ssh -J (SRV09, SRV10); (4) Cache-Control per resource on the origin, one purge of a
 * stale page through a fictional generic purge API, a HIT at the CDN edge (SRV11); (5) one request traced from the laptop
 * through DNS, the edge, nginx and the app server (dig, mtr, curl -v and -w, the access log, X-Forwarded-For), reported as
 * one curl -w line checked on three variants (SRV03, SRV12); (6) a planted fault: app-02's ufw was rebuilt with web-01's
 * public address, so nginx's connections to it time out and are retried on app-01 (slow 200s, hidden by max_fails), found
 * with the SRV13 method and fixed at the cause (SRV13, SRV09). Each stage's machine is the site at that moment. The shop,
 * host names (.example, RFC 2606), users, the CDN and its API, and the addresses (RFC 5737, RFC 1918) are made up. Engine
 * notes: a CDN edge in front of nginx on the exercise's own machine cannot reach that nginx's upstreams, so from stage 4 the
 * learner works from the laptop with web-01 as a remote; through the edge, curl's time_* count an upstream wait twice, so
 * timings are only shown from web-01 itself. Every transcript output was produced by replaying it on the engine.
 */

import type { TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...group ? { group } : {} });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });

const HOME = '/home/learner';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-20 06:00:00' };
const SITE = 'tidecoffee.example';
const WWW = `www.${SITE}`;
const W = `https://${WWW}`;
const WEB_IP = '203.0.113.40', WEB_LAN = '10.20.0.10';
const BASTION_IP = '203.0.113.41', BASTION_LAN = '10.20.0.5';
const APP1 = '10.20.0.21', APP2 = '10.20.0.22';
const NS1_IP = '198.51.100.53', OLD_IP = '198.51.100.99';
const LAPTOP_IP = '198.51.100.77';
const EDGE_IP = '192.0.2.80', CDN_API_IP = '192.0.2.10';
const CDN_ZONE = 'edgecdn.example', CDN_NAME = `tidecoffee.${CDN_ZONE}`;
const SITE_PATH = '/etc/nginx/sites-available/tidecoffee';
const DOCROOT = '/var/www/tidecoffee';
const ZONE_PATH = `/etc/bind/db.${SITE}`;

// ---- keys: learner's key on web-01 (stage 1) and on the laptop (stages 3, 5, 6) --------------------------------------
const WEB_KEY = keyPair(`srv14-web:learner:${HOME}/.ssh/id_ed25519`, 'learner@web-01');
const NB_KEY = keyPair(`srv14-nb:learner:${HOME}/.ssh/id_ed25519`, 'learner@ops-nb');
const known = (hosts: [string, string][]) => hosts.map(([name, seed]) => `${name} ${hostKey(seed, name).publicLine.split(' ').slice(0, 2).join(' ')}\n`).join('');
const sshHome = (key: ReturnType<typeof keyPair>, knownHosts: string): TerminalFile[] => [
  dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700),
  file(`${HOME}/.ssh/id_ed25519`, key.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${key.publicLine}\n`, 'learner'),
  file(`${HOME}/.ssh/known_hosts`, knownHosts, 'learner'),
];
const authorized = (key: ReturnType<typeof keyPair>): TerminalFile[] => [
  dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/authorized_keys`, `${key.publicLine}\n`, 'learner', 0o600),
];
const ADMIN = { users: [{ name: 'learner', uid: 1000 }], groups: [{ name: 'sudo', members: ['learner'] }] };

// ---- DNS: the zone on ns1 as the previous host left it ---------------------------------------------------------------
const zone = (apex: string, serial: string, www: string) => `$ORIGIN ${SITE}.
$TTL 3600
@       IN  SOA ns1.${SITE}. hostmaster.${SITE}. (
            ${serial} ; serial
            3600       ; refresh
            900        ; retry
            1209600    ; expire
            300 )      ; negative TTL
        IN  NS   ns1.${SITE}.
        IN  A    ${apex}
ns1     IN  A    ${NS1_IP}
${www}`;
const ZONE_OLD = zone(OLD_IP, '2026111801', `www     IN  CNAME ${SITE}\n`);
const NAMED_LOCAL = `zone "${SITE}" {\n\ttype master;\n\tfile "${ZONE_PATH}";\n};\n`;
const ns1: TerminalRemote = {
  host: 'ns1', title: 'ns1（tidecoffee.example 的權威 DNS）', address: NS1_IP, hostKey: 'srv14-ns1', named: true, accounts: ADMIN,
  interfaces: [{ name: 'eth0', address: `${NS1_IP}/24` }],
  files: [...authorized(WEB_KEY), dir('/etc'), dir('/etc/bind'), file('/etc/bind/named.conf.local', NAMED_LOCAL, 'root', 0o644, 'bind'), file(ZONE_PATH, ZONE_OLD, 'root', 0o644, 'bind')],
};

// ---- web-01: nginx in front of the shop ------------------------------------------------------------------------------
const PAGE = '<!doctype html>\n<html lang="zh-Hant">\n<head><meta charset="utf-8"><title>潮汐咖啡</title>\n<link rel="stylesheet" href="/assets/app.5d41c2e8.css"></head>\n<body><h1>潮汐咖啡｜新網站即將開幕</h1></body>\n</html>\n';
const CSS = 'body{font-family:sans-serif;color:#2b2b2b}\n';
const SITE_HTTP = `server {
    listen 80;
    server_name ${SITE} ${WWW};
    root ${DOCROOT};
    index index.html;

    location /assets/ {
        try_files $uri =404;
    }
    location / {
        try_files $uri $uri/ =404;
    }
}
`;
const webBase = (site: string): TerminalFile[] => [
  dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file(SITE_PATH, site), dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/tidecoffee', SITE_PATH),
  dir('/var'), dir('/var/www'), dir(DOCROOT), file(`${DOCROOT}/index.html`, PAGE), dir(`${DOCROOT}/assets`), file(`${DOCROOT}/assets/app.5d41c2e8.css`, CSS),
];
const WEB_IFACES = [{ name: 'eth0', address: `${WEB_IP}/24` }, { name: 'eth1', address: `${WEB_LAN}/24` }];

/** Stage 1: web-01 the day the domain moves to it: nginx serves the placeholder on port 80; ns1 still points at the old host. */
const dnsStage: TerminalMachine = {
  id: 'srv14-dns', title: 'web-01（網域搬家當天）', user: 'learner', cwd: HOME, host: 'web-01', profile: 'diagnostics', ...CLOCK,
  address: WEB_IP, interfaces: WEB_IFACES, keySeed: 'srv14-web', nginx: true, certbot: { account: true }, accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [...sshHome(WEB_KEY, known([['ns1', 'srv14-ns1']])), ...webBase(SITE_HTTP)],
  remotes: [ns1],
};

// ---- stage 2: the shop moves onto two app servers on the private network ------------------------------------------------
const LE = `/etc/letsencrypt/live/${SITE}`;
/** web-01's site after stage 1, tidied by hand: http redirects to https; / still serves the placeholder from disk. */
const tlsSite = (pages: string[]) => `server {
    listen 80;
    server_name ${SITE} ${WWW};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ${SITE} ${WWW};
    ssl_certificate ${LE}/fullchain.pem;
    ssl_certificate_key ${LE}/privkey.pem;
    root ${DOCROOT};
    index index.html;

    location /assets/ {
        try_files $uri =404;
    }
    location / {
${pages.map(l => `        ${l}\n`).join('')}    }
}
`;
const SITE_TLS = tlsSite(['try_files $uri $uri/ =404;']);
const ISSUED = '2026-11-21 09:40:00';
const CERTBOT = { account: true, certificates: [{ domains: [SITE, WWW], nginx: true, issued: ISSUED }] };
/** The public zone (served by ns1) as the rest of the internet sees it; from stage 4 www is a CNAME at the CDN. */
const publicZone = (www: string) => `$ORIGIN ${SITE}.
$TTL 3600
@       IN  SOA ns1.${SITE}. hostmaster.${SITE}. ( 2026112201 3600 900 1209600 300 )
        IN  NS   ns1.${SITE}.
        IN  A    ${WEB_IP}
ns1     IN  A    ${NS1_IP}
origin  IN  A    ${WEB_IP}
www     IN  CNAME ${www}
`;
const SHOP_PAGE = (css: string) => `<!doctype html>\n<html lang="zh-Hant">\n<head><meta charset="utf-8"><title>潮汐咖啡</title>\n<link rel="stylesheet" href="/assets/${css}"></head>\n<body><h1>潮汐咖啡｜本週烘焙</h1></body>\n</html>\n`;
const CSS_V1 = 'app.5d41c2e8.css';
/** The shop (gunicorn on 8080): pages, a JSON API that must never be cached, and /api/echo, which returns the request it received. */
const GUNICORN = '/srv/tide-shop/venv/bin/gunicorn';
const SHOP_CMD = `${GUNICORN} --bind 0.0.0.0:8080 shop.wsgi`;
const SHOP_UNIT = `[Unit]\nDescription=Tide Coffee shop (gunicorn)\nAfter=network.target\n\n[Service]\nUser=tide\nExecStart=${SHOP_CMD}\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n`;
const WANTS = '/etc/systemd/system/multi-user.target.wants';
const SHOP_FILES: TerminalFile[] = [
  dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/tide-shop.service', SHOP_UNIT), dir(WANTS), link(`${WANTS}/tide-shop.service`, '/etc/systemd/system/tide-shop.service'),
  dir('/srv'), dir('/srv/tide-shop', 'tide'), dir('/srv/tide-shop/venv', 'tide'), dir('/srv/tide-shop/venv/bin', 'tide'), file(GUNICORN, '', 'tide', 0o755),
];
const LISTEN_8080 = [{ port: 8080, fd: 5, http: 'shop' }];
const app = (host: string, address: string, extra: Partial<TerminalRemote> = {}, css = CSS_V1): TerminalRemote => ({
  host, title: `應用伺服器 ${host}`, address, hostKey: `srv14-${host}`, accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'tide', uid: 998, home: '/srv/tide-shop', shell: '/usr/sbin/nologin' }], groups: [{ name: 'sudo', members: ['learner'] }] },
  interfaces: [{ name: 'eth0', address: `${address}/24` }],
  processes: [{ pid: 1020, user: 'tide', command: SHOP_CMD, stat: 'Ss', unit: 'tide-shop', start: CLOCK.boot, listen: LISTEN_8080 }],
  programs: [{ path: GUNICORN, title: SHOP_CMD, listen: LISTEN_8080 }],
  responders: [{ id: 'shop', server: 'gunicorn', routes: [
    { path: '/api/echo', echo: true, headers: [['X-Served-By', host]] },
    { path: '/api/*', body: '{"beans":[{"sku":"guji-200","name":"衣索比亞 古吉","stock":42}]}\n', type: 'application/json', headers: [['Cache-Control', 'no-store'], ['X-Served-By', host]] },
    { path: '/*', body: SHOP_PAGE(css), headers: [['X-Served-By', host]] },
  ] }],
  ...extra,
  files: [...extra.files ?? [], ...SHOP_FILES],
});
const stoppedApp = (host: string, address: string): TerminalRemote => ({ ...app(host, address), processes: [], services: [{ unit: 'tide-shop', active: 'failed', since: '2026-11-22 09:55:00', pid: 1020, status: 1 }] });
const SORRY = '/usr/local/bin/sorry-page';
/** On web-01: a tiny server that answers every request with the maintenance page (nginx's backup). */
const sorry = { pid: 905, user: 'www-data', command: `${SORRY} --listen 127.0.0.1:8090`, stat: 'Ss', start: CLOCK.boot, listen: [{ address: '127.0.0.1', port: 8090, fd: 4, http: 'sorry' }] };
const SORRY_RESPONDER = { id: 'sorry', routes: [{ path: '/*', status: 503, body: '<h1>潮汐咖啡：系統維護中，請稍後再試</h1>\n', headers: [['Retry-After', '120']] as [string, string][] }] };
const webFiles = (site: string, extra: TerminalFile[] = []): TerminalFile[] => [
  ...webBase(site), dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'), file(SORRY, '', 'root', 0o755), ...extra,
];
const proxyStage: TerminalMachine = {
  id: 'srv14-proxy', title: 'web-01（接上兩台應用伺服器之前）', user: 'learner', cwd: HOME, host: 'web-01', profile: 'diagnostics', ...CLOCK,
  address: WEB_IP, interfaces: WEB_IFACES, nginx: true, certbot: CERTBOT, accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  internet: [{ zone: SITE, text: publicZone(`${SITE}.`) }],
  files: [dir('/home'), dir(HOME, 'learner', 0o750), ...webFiles(SITE_TLS)],
  processes: [sorry], responders: [SORRY_RESPONDER],
  remotes: [app('app-01', APP1), app('app-02', APP2)],
};

// ---- stage 3: the admin's laptop, the bastion and the three servers --------------------------------------------------------
const UPSTREAM_LINES = ['upstream tide_app {', `    server ${APP1}:8080 max_fails=3 fail_timeout=30s;`, `    server ${APP2}:8080 max_fails=3 fail_timeout=30s;`, '    server 127.0.0.1:8090 backup;', '}'];
const UPSTREAM_PATH = '/etc/nginx/conf.d/tide-upstream.conf';
const UPSTREAM = UPSTREAM_LINES.map(l => `${l}\n`).join('');
const PROXY_LINES = ['proxy_pass http://tide_app;', 'proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
  'proxy_set_header X-Forwarded-Proto $scheme;', 'proxy_connect_timeout 5s;'];
const SNIPPET_PATH = '/etc/nginx/snippets/tide-proxy.conf';
const SNIPPET = PROXY_LINES.map(l => `${l}\n`).join('');
const INCLUDE = 'include snippets/tide-proxy.conf;';
/** web-01's site once it proxies to the app servers (stage 2 done). */
const SITE_PROXY = tlsSite([INCLUDE]);
const proxiedWebFiles = (site = SITE_PROXY, extra: TerminalFile[] = []) =>
  webFiles(site, [dir('/etc/nginx/conf.d'), file(UPSTREAM_PATH, UPSTREAM), dir('/etc/nginx/snippets'), file(SNIPPET_PATH, SNIPPET), ...extra]);
const NB = 'ops-nb';
const nbHosts = `127.0.0.1 localhost\n127.0.1.1 ${NB}\n${BASTION_IP} bastion\n${WEB_IP} web-01\n\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n`;
const NB_KNOWN = known([['bastion', 'srv14-bastion'], ['web-01', 'srv14-web-01'], ['app-01', 'srv14-app-01'], ['app-02', 'srv14-app-02']]);
const bastion: TerminalRemote = {
  host: 'bastion', title: '跳板機 bastion', address: BASTION_IP, hostKey: 'srv14-bastion', accounts: ADMIN,
  interfaces: [{ name: 'eth0', address: `${BASTION_IP}/24` }, { name: 'eth1', address: `${BASTION_LAN}/24` }],
  files: authorized(NB_KEY), firewall: { enabled: true, rules: ['allow OpenSSH'] },
};
/** web-01 as a remote of the laptop (its LAN address is the one the other servers know). */
const webRemote = (extra: Partial<TerminalRemote> = {}): TerminalRemote => ({
  host: 'web-01', title: '網頁伺服器 web-01', address: WEB_LAN, hostKey: 'srv14-web-01', accounts: ADMIN, interfaces: WEB_IFACES,
  nginx: true, certbot: CERTBOT, files: [...authorized(NB_KEY), ...proxiedWebFiles()], processes: [sorry], responders: [SORRY_RESPONDER],
  ...extra,
});
const privateApp = (host: string, address: string, extra: Partial<TerminalRemote> = {}, css?: string): TerminalRemote =>
  app(host, address, { files: authorized(NB_KEY), reachableFrom: ['bastion', 'web-01'], ...extra }, css);
const laptop = (id: string, title: string, remotes: TerminalRemote[], extra: Partial<TerminalMachine> = {}): TerminalMachine => ({
  id, title, user: 'learner', cwd: HOME, host: NB, profile: 'diagnostics', ...CLOCK, address: LAPTOP_IP, interfaces: [{ name: 'eth0', address: `${LAPTOP_IP}/24` }],
  keySeed: 'srv14-nb', latency: 8, files: [...sshHome(NB_KEY, NB_KNOWN), file('/etc/hosts', nbHosts)].sort((a, b) => a.path.split('/').length - b.path.split('/').length), remotes, ...extra,
});
const firewallStage = laptop('srv14-firewall', 'ops-nb（三台伺服器都還沒有防火牆）', [bastion, webRemote(), privateApp('app-01', APP1), privateApp('app-02', APP2)],
  { internet: [{ zone: SITE, text: publicZone(`${SITE}.`) }] });

// ---- stage 4: the CDN in front of web-01 -----------------------------------------------------------------------------
const CSS_V2 = 'app.9b1f7c3a.css';
const CSS2 = 'body{font-family:sans-serif;color:#1f2a30}\n.roast{color:#8a4b2a}\n';
const CDN_TOKEN = 'tide-demo-4k2p';
const cdnZone = `$ORIGIN ${CDN_ZONE}.
$TTL 300
@          IN  SOA ns1.${CDN_ZONE}. noc.${CDN_ZONE}. ( 2026110101 3600 900 1209600 60 )
           IN  NS  ns1.${CDN_ZONE}.
ns1        IN  A   192.0.2.53
api        IN  A   ${CDN_API_IP}
tidecoffee IN  A   ${EDGE_IP}
`;
const PUBLIC_DNS = [{ zone: SITE, text: publicZone(`${CDN_NAME}.`) }, { zone: CDN_ZONE, text: cdnZone }];
/** The edge's certificate for the shop's names (the CDN terminates TLS near the customers). */
const edgeCert = (id: string) => ({ id, cn: WWW, sans: [WWW], issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 08:00:00', path: `/etc/edge/certs/${WWW}.pem`, chain: ['lets-encrypt-r11'], key: `/etc/edge/private/${WWW}.key` });
/** A CDN edge near the customers: it fetches from web-01 over https and keeps what the origin allows (1 hour when the origin says nothing). */
const edge = (certId: string, cache: { url: string; body: string; cachedAt: string; ttl: number; type?: string; headers?: [string, string][] }[] = []): TerminalRemote => ({
  host: 'edge-tpe1', title: 'CDN 邊緣節點 edge-tpe1', address: EDGE_IP, hostKey: 'srv14-edge', latency: 2, files: [],
  certificates: [edgeCert(certId)],
  processes: [{ pid: 1310, user: 'root', command: '/usr/local/bin/edged', stat: 'Ss', listen: [{ port: 443, fd: 6, http: 'edge', tls: { certificate: `/etc/edge/certs/${WWW}.pem`, key: `/etc/edge/private/${WWW}.key` } }] }],
  responders: [{ id: 'edge', cdn: { origin: WEB_IP, scheme: 'https', defaultTtl: 3600 }, routes: [] }],
  ...cache.length ? { cdnCache: [{ responder: 'edge', entries: cache }] } : {},
});
const cdnApi = (certId: string): TerminalRemote => ({
  host: 'cdn-api', title: 'CDN 的清除 API（虛構）', address: CDN_API_IP, hostKey: 'srv14-cdn-api', files: [],
  certificates: [{ id: certId, cn: `api.${CDN_ZONE}`, issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 08:00:00', path: '/etc/api/cert.pem', chain: ['lets-encrypt-r11'], key: '/etc/api/key.pem' }],
  processes: [{ pid: 1320, user: 'root', command: '/usr/local/bin/cdn-apid', stat: 'Ss', listen: [{ port: 443, fd: 6, http: 'api', tls: { certificate: '/etc/api/cert.pem', key: '/etc/api/key.pem' } }] }],
  responders: [{ id: 'api', server: 'cdn-api', routes: [{ path: '/purge', methods: ['POST'], purge: { edges: ['edge-tpe1'], token: CDN_TOKEN } }] }],
});
const WEB_UFW = { enabled: true, rules: ['allow 80,443/tcp', `allow from ${BASTION_LAN} to any port 22 proto tcp`] };
const APP_UFW = { enabled: true, rules: [`allow from ${BASTION_LAN} to any port 22 proto tcp`, `allow from ${WEB_LAN} to any port 8080 proto tcp`] };
/** web-01's site on the morning of stage 4: /api/ has its own location; assets expire after 7 days; pages say nothing. */
const cdnSite = (assets: string[], pages: string[]) => tlsSite([...pages, INCLUDE]).replace(
  '    location /assets/ {\n        try_files $uri =404;\n    }\n',
  `    location /assets/ {\n        try_files $uri =404;\n${assets.map(l => `        ${l}\n`).join('')}    }\n    location /api/ {\n        ${INCLUDE}\n    }\n`);
const SITE_CDN = cdnSite(['expires 7d;'], []);
const STALE_PAGE = SHOP_PAGE(CSS_V1);
const STALE_CACHE = [
  { url: `${W}/`, body: STALE_PAGE, cachedAt: '2026-11-22 09:30:00', ttl: 3600 },
  { url: `${W}/assets/${CSS_V1}`, body: CSS, type: 'text/css', headers: [['Cache-Control', 'max-age=604800']] as [string, string][], cachedAt: '2026-11-21 10:12:00', ttl: 604800 },
];
/** web-01 as the CDN's origin (from stage 4): ufw from stage 3, the new release's asset on disk. */
const originWeb = (site: string, extra: Partial<TerminalRemote> = {}) => webRemote({
  firewall: WEB_UFW, files: [...authorized(NB_KEY), ...proxiedWebFiles(site, [file(`${DOCROOT}/assets/${CSS_V2}`, CSS2)])], ...extra,
});
const appBehind = (host: string, address: string, extra: Partial<TerminalRemote> = {}) => privateApp(host, address, { firewall: APP_UFW, ...extra }, CSS_V2);
const cdnStage = laptop('srv14-cdn', 'ops-nb（網站放到 CDN 後面、新版部署之後）', [
  bastion, originWeb(SITE_CDN), edge('srv14-cdn-edge', STALE_CACHE), cdnApi('srv14-cdn-api'), appBehind('app-01', APP1), appBehind('app-02', APP2),
], { internet: PUBLIC_DNS, files: [...sshHome(NB_KEY, NB_KNOWN), file('/etc/hosts', nbHosts), file(`${HOME}/.cdn-token`, `${CDN_TOKEN}\n`, 'learner', 0o600)].sort((a, b) => a.path.split('/').length - b.path.split('/').length) });

// ---- stages 5 and 6: the site as it runs, traced and then broken -------------------------------------------------------
/** The site after stage 4: assets for a year, pages revalidated every time, /api/ left to the app's no-store. */
const SITE_LIVE = cdnSite(['add_header Cache-Control "public, max-age=31536000, immutable";'], ['add_header Cache-Control "no-cache";']);
/** From stage 5 the upstream uses least_conn (checkout requests take long): nginx picks the server with fewer active connections. */
const UPSTREAM_LC = ['upstream tide_app {', '    least_conn;', ...UPSTREAM_LINES.slice(1)].map(l => `${l}\n`).join('');
const conns = (a: number, b: number) => [{ upstream: 'tide_app', server: `${APP1}:8080`, connections: a }, { upstream: 'tide_app', server: `${APP2}:8080`, connections: b }];
const liveWeb = (connections: [number, number], extra: Partial<TerminalRemote> = {}, site = SITE_LIVE, logs: TerminalFile[] = []) => originWeb(site, {
  files: [...authorized(NB_KEY), ...proxiedWebFiles(site, [file(`${DOCROOT}/assets/${CSS_V2}`, CSS2), ...logs]).map(f => f.path === UPSTREAM_PATH ? file(UPSTREAM_PATH, UPSTREAM_LC) : f)],
  upstreamConnections: conns(...connections), ...extra,
});
/** The way from the laptop to the edge, as mtr shows it (the ISP's routers, an exchange, the CDN's network). */
const PATHS = [{ hops: [
  { address: '198.51.100.1', rtt: 0.6 }, { address: '100.64.12.1', name: 'bras1.isp.example', rtt: 3.4 }, { address: '203.0.113.129', name: 'core2.isp.example', rtt: 5.1 },
  { address: '192.0.2.33', name: 'ix-tpe.cdn.example', rtt: 6.2 }, { address: EDGE_IP, name: CDN_NAME, rtt: 6.9 },
] }];
const traceStage = laptop('srv14-trace', 'ops-nb（追蹤一個請求）', [
  bastion, liveWeb([12, 4]), edge('srv14-trace-edge'), appBehind('app-01', APP1), appBehind('app-02', APP2),
], { internet: PUBLIC_DNS, paths: PATHS });

// ---- stage 6: the planted fault: app-02's firewall was rebuilt with web-01's public address ----------------------------
const FAULT_UFW = { enabled: true, rules: [`allow from ${BASTION_LAN} to any port 22 proto tcp`, `allow from ${WEB_IP} to any port 8080 proto tcp`] };
const sudoLine = (time: string, pid: number, command: string) => ({ time, id: 'sudo', pid, priority: 5, message: `mei : TTY=pts/0 ; PWD=/home/mei ; USER=root ; COMMAND=${command}` });
const APP2_JOURNAL = [
  { time: '2026-11-22 09:11:40', unit: 'ssh', id: 'sshd', pid: 2410, priority: 6, message: `Accepted publickey for mei from ${BASTION_LAN} port 51022 ssh2: ED25519 SHA256:Tq4wZ8pXk2mR7sV1cN5yHb3dLf6gJ0aUe9oKiWzQ1rE` },
  sudoLine('2026-11-22 09:12:05', 2431, '/usr/sbin/ufw --force reset'),
  sudoLine('2026-11-22 09:12:31', 2440, `/usr/sbin/ufw allow from ${BASTION_LAN} to any port 22 proto tcp`),
  sudoLine('2026-11-22 09:12:48', 2446, `/usr/sbin/ufw allow from ${WEB_IP} to any port 8080 proto tcp`),
  sudoLine('2026-11-22 09:12:55', 2449, '/usr/sbin/ufw --force enable'),
];
const faultApp2 = () => appBehind('app-02', APP2, { firewall: FAULT_UFW, journal: APP2_JOURNAL,
  accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'mei', uid: 1001 }, { name: 'tide', uid: 998, home: '/srv/tide-shop', shell: '/usr/sbin/nologin' }], groups: [{ name: 'sudo', members: ['learner', 'mei'] }] } });
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
/** One combined-format line of web-01's access.log: every request comes from the edge's address. */
const hit = (time: string, path: string, status: number, bytes: number, ua: string) => `${EDGE_IP} - - [22/Nov/2026:${time} +0000] "GET ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"\n`;
const timedOut = (time: string, n: number, path: string) =>
  `2026/11/22 ${time} [error] 813#813: *${n} upstream timed out (110: Connection timed out) while connecting to upstream, client: ${EDGE_IP}, server: ${SITE}, request: "GET ${path} HTTP/1.1", upstream: "http://${APP2}:8080${path}", host: "${WWW}"\n`;
const FAULT_ACCESS = [
  hit('09:10:12', '/', 200, 215, CHROME), hit('09:11:30', '/beans/guji', 200, 215, IPHONE), hit('09:13:07', '/', 200, 215, IPHONE), hit('09:13:45', '/beans/guji', 200, 215, CHROME),
  hit('09:14:20', '/', 200, 215, CHROME), hit('09:31:08', '/api/beans', 200, 71, IPHONE), hit('09:44:56', '/', 200, 215, CHROME), hit('09:52:26', '/beans/guji', 200, 215, IPHONE),
].join('');
const FAULT_ERROR = [timedOut('09:13:07', 1902, '/'), timedOut('09:13:45', 1911, '/beans/guji'), timedOut('09:14:20', 1920, '/'), timedOut('09:44:56', 2147, '/')].join('');
const LOGS = [dir('/var/log'), dir('/var/log/nginx', 'root', 0o755, 'adm'), file('/var/log/nginx/access.log', FAULT_ACCESS, 'www-data', 0o640, 'adm'), file('/var/log/nginx/error.log', FAULT_ERROR, 'www-data', 0o640, 'adm')];
const faultStage = laptop('srv14-fault', 'ops-nb（顧客說網站時快時慢）', [
  bastion, liveWeb([9, 9], {}, SITE_LIVE, LOGS), edge('srv14-fault-edge'), appBehind('app-01', APP1), faultApp2(),
], { internet: PUBLIC_DNS, paths: PATHS });

// ---- exercises -----------------------------------------------------------------------------------------------------
/** Writes a file with printf '%s\n' and sudo tee (the simulated machines have no editor); each line is one single-quoted word. */
const printfTee = (rows: string[], path: string) => `printf '%s\\n' ${rows.map(r => `'${r}'`).join(' ')} | sudo tee ${path} > /dev/null`;
const swap = (list: string[], from: string, to: string) => list.map(c => c === from ? to : c);
const without = (list: string[], ...drop: string[]) => list.filter(c => !drop.includes(c));

// Stage 1: DNS, then the certificate.
const FIX_ZONE = `ssh ns1 "sudo sed -i 's/${OLD_IP}/${WEB_IP}/; s/2026111801/2026112201/; s/CNAME ${SITE}$/CNAME ${SITE}./' ${ZONE_PATH}"`;
const CHECKZONE = `ssh ns1 named-checkzone ${SITE} ${ZONE_PATH}`;
const RELOAD_ZONE = `ssh ns1 sudo rndc reload ${SITE}`;
const CERTBOT_NGINX = `sudo certbot --nginx -d ${SITE} -d ${WWW}`;
const DNS_SOLUTION = [`dig @ns1 ${SITE} +short`, `dig @ns1 ${WWW} +short`, `ssh ns1 cat ${ZONE_PATH}`, FIX_ZONE, CHECKZONE, RELOAD_ZONE,
  `dig @ns1 ${WWW} +short`, CERTBOT_NGINX, 'sudo resolvectl flush-caches', `curl -sI ${W}/`];

// Stage 2: the upstream, the proxy headers, then the site.
const SED_PROXY = `sudo sed -i 's|try_files $uri $uri/ =404;|${INCLUDE}|' ${SITE_PATH}`;
const PROXY_SOLUTION = [`curl -s http://${APP1}:8080/api/echo`, printfTee(UPSTREAM_LINES, UPSTREAM_PATH), printfTee(PROXY_LINES, SNIPPET_PATH), SED_PROXY,
  'sudo nginx -t', 'sudo systemctl reload nginx', `curl -s ${W}/api/echo`];
const swapProxy = (from: string, to: string) => swap(PROXY_SOLUTION, printfTee(PROXY_LINES, SNIPPET_PATH), printfTee(PROXY_LINES.map(l => l === from ? to : l).filter(Boolean), SNIPPET_PATH));

// Stage 3: rules first, then enable; the app servers only through the bastion.
const J = (host: string, command: string) => `ssh -J bastion ${host} ${command}`;
const FROM_BASTION = `sudo ufw allow from ${BASTION_LAN} to any port 22 proto tcp`;
const FROM_WEB = `sudo ufw allow from ${WEB_LAN} to any port 8080 proto tcp`;
const ENABLE = 'sudo ufw --force enable';
const WEB_RULES = [J('web-01', 'sudo ufw allow 80,443/tcp'), J('web-01', FROM_BASTION), J('web-01', ENABLE)];
const appRules = (host: string) => [J(host, FROM_BASTION), J(host, FROM_WEB), J(host, ENABLE)];
const FIREWALL_SOLUTION = [J('web-01', 'sudo ss -tlnp'), ...WEB_RULES, ...appRules('app-01'), ...appRules('app-02'), J('web-01', 'sudo ufw status verbose'),
  `ssh bastion nc -zv -w 3 web-01 22`, J('web-01', 'nc -zv -w 3 app-01 8080'), `curl -s -o /dev/null -w '%{http_code}\\n' ${W}/`];

// Stage 4: the headers on the origin, one purge, then the edge.
const CACHE_SED = `sudo sed -i 's|expires 7d;|add_header Cache-Control "public, max-age=31536000, immutable";|; s|location / {|location / {\\n        add_header Cache-Control "no-cache";|' ${SITE_PATH}`;
const PURGE = (url: string) => `curl -s -X POST -H "Authorization: Bearer $(cat ~/.cdn-token)" https://api.${CDN_ZONE}/purge -d 'url=${url}'`;
const ASSET = `${W}/assets/${CSS_V2}`;
const CDN_SOLUTION = [`curl -sI ${W}/`, `curl -s --resolve ${WWW}:443:${WEB_IP} ${W}/ | grep stylesheet`, 'ssh -J bastion web-01', CACHE_SED, 'sudo nginx -t', 'sudo systemctl reload nginx', 'exit',
  PURGE(`${W}/`), `curl -sI ${ASSET}`, `curl -sI ${ASSET}`, `curl -sI ${W}/`];

// Stage 5: one request, hop by hop.
const REPORT = `curl -s -o /dev/null -w '%{remote_ip} %header{x-cache} %header{x-served-by}\\n' ${W}/beans/guji`;
const TRACE_SOLUTION = [`dig +short ${WWW}`, `curl -sI ${W}/beans/guji`, J('web-01', 'sudo tail -n 1 /var/log/nginx/access.log'), REPORT];

// Stage 6: find the hop, fix the rule.
/** Six requests from web-01 itself, past the CDN (--resolve to 127.0.0.1): status, time and which app server answered. */
const ORIGIN_LOOP = J('web-01', `"for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} %{time_total}s %header{x-served-by}\\n' --resolve ${WWW}:443:127.0.0.1 ${W}/; done"`);
const WRONG_RULE = `sudo ufw delete allow from ${WEB_IP} to any port 8080 proto tcp`;
const FAULT_SOLUTION = [ORIGIN_LOOP, J('web-01', 'sudo tail -n 2 /var/log/nginx/error.log'), J('web-01', 'ping -c 2 app-02'), J('app-02', 'sudo ufw status numbered'),
  J('app-02', 'sudo journalctl --since 09:00 --until 09:30'), J('app-02', WRONG_RULE), J('app-02', FROM_WEB), J('web-01', 'nc -zv -w 3 app-02 8080'), 'sleep 31', ORIGIN_LOOP];

const QUIZ: LessonContent['quiz'] = [
  {
    id: 'srv14-q1', prompt: '區域檔裡寫著 `www IN CNAME tidecoffee.example`（沒有結尾的句點），`named-checkzone` 印出 OK。`dig @ns1 www.tidecoffee.example` 會得到什麼？',
    options: ['`tidecoffee.example.`：BIND 會自動補上結尾的句點', 'SERVFAIL：區域無法載入', '`tidecoffee.example.tidecoffee.example.`：沒有結尾句點的名稱會接上原點', '`www.tidecoffee.example.`：CNAME 指向自己'],
    answer: 2,
    explanation: '區域檔裡沒有結尾句點的名稱都是相對名稱，會接上 $ORIGIN，所以目標變成 tidecoffee.example.tidecoffee.example.，查下去是 NXDOMAIN。BIND 不會猜你的意思補上句點；這一行的語法完全合法，區域照常載入，所以不是 SERVFAIL；它也沒有指向自己。',
  },
  {
    id: 'srv14-q2', prompt: '應用程式收到 `remote_addr: 10.20.0.10`、`X-Real-IP: 192.0.2.80`、`X-Forwarded-For: 198.51.100.77, 192.0.2.80`。web-01 的 nginx 用 `$proxy_add_x_forwarded_for`，前面只有 CDN 的邊緣節點（192.0.2.80）。顧客的位址是哪一個？',
    options: ['198.51.100.77：由右往左讀，192.0.2.80 是 nginx 依連線加上的邊緣節點，它左邊那個是邊緣節點加上的用戶端', '10.20.0.10：remote_addr 一定是用戶端', '192.0.2.80：X-Real-IP 就是顧客的位址', '永遠取 X-Forwarded-For 最左邊的值，不必管有幾個代理'],
    answer: 0,
    explanation: '每一個代理把它看到的連線位址接在最後面：邊緣節點接上顧客 198.51.100.77，nginx 再接上邊緣節點 192.0.2.80。10.20.0.10 是 nginx 連到應用程式時的私有位址；X-Real-IP 是 nginx 看到的用戶端，也就是邊緣節點；最左邊的值可能是用戶端自己送來的偽造值，只能從右邊一路讀到第一個不是信任代理加上的位址。',
  },
  {
    id: 'srv14-q3', prompt: '你在 `ssh web-01` 的工作階段裡，還沒加任何規則就執行了 `sudo ufw --force enable`（預設拒絕連入）。接下來會怎樣？',
    options: ['ufw 偵測到 SSH 工作階段，自動允許 22 埠', '沒有規則時 ufw 拒絕啟用', 'ufw 立刻中斷目前的工作階段並自動還原設定', '目前的工作階段由狀態追蹤放行而繼續，但之後的新 ssh 連線（包括經由跳板機）都會逾時，關掉這個工作階段就進不來了'],
    answer: 3,
    explanation: '已經建立的連線被 ufw 的狀態追蹤規則放行，所以眼前看起來一切正常；新的連線卻被預設的拒絕擋下而逾時。`--force` 只是跳過確認，ufw 不會替你開 22，也不會拒絕啟用或自動還原。正確的做法是先加規則、再啟用，並在關掉這個工作階段之前另開新連線測試。',
  },
  {
    id: 'srv14-q4', prompt: 'bastion 有公開位址 203.0.113.41 與私有位址 10.20.0.5。web-01 的 ufw 只有 `allow from 203.0.113.41 to any port 22 proto tcp`，從 bastion `ssh web-01`（10.20.0.10）會怎樣？',
    options: ['成功：規則寫的是 bastion 的位址', '逾時：bastion 連到 10.20.0.10 走私有網段，來源位址是 10.20.0.5，不符合這條規則', 'Connection refused：ufw 預設以 REJECT 回應', '成功：ufw 依主機名稱判斷來源'],
    answer: 1,
    explanation: '有兩張網卡的主機連到某個網段時，來源是面向那個網段的介面位址，所以 web-01 看到的是 10.20.0.10 網段上的 10.20.0.5，規則不符合，封包被預設的 deny 丟棄而逾時。ufw 的預設原則是 deny（丟棄），不是 reject，所以不是 refused；ufw 的規則比對的是位址，不是主機名稱。',
  },
  {
    id: 'srv14-q5', prompt: '你把來源的首頁改成 `Cache-Control: no-cache` 並 reload 了，但經過 CDN 的首頁仍然是舊的，回應有 `Age: 1800`、`X-Cache: HIT`。原因與處理是什麼？',
    options: ['nginx 的 reload 沒有生效，要改用 restart', '顧客的瀏覽器快取了舊頁面，請顧客清除瀏覽器快取', '邊緣節點會一直用已經存下的副本到它的期限，來源的新標頭只影響之後存下的回應；這一次用清除 API 清掉舊的首頁', 'no-cache 的意思是「快取越久越好」，應該改成 no-store'],
    answer: 2,
    explanation: 'X-Cache: HIT 與 Age 1800 表示這是邊緣節點 30 分鐘前存下的副本，它依存下時的期限繼續回答，不會因為來源改了標頭而失效，所以要清除一次。reload 已經生效（繞過 CDN 直接問來源就看得到新標頭）；HIT 是邊緣節點的標頭，問題不在瀏覽器；no-cache 是「每次使用前要確認」，對 HTML 正是合適的設定。',
  },
  {
    id: 'srv14-q6', prompt: '部署會產生 `index.html` 與含雜湊的 `/assets/app.9b1f7c3a.css`。哪一組 Cache-Control 最適合？',
    options: ['樣式表 `public, max-age=31536000, immutable`，HTML `no-cache`', '兩者都 `public, max-age=86400`', '兩者都 `no-store`，確保永遠是新的', '樣式表 `no-cache`，HTML `public, max-age=31536000, immutable`'],
    answer: 0,
    explanation: '雜湊檔名的內容一變名字就變，同一個網址永遠是同一份內容，可以存一年並標成 immutable；HTML 要每次確認，部署之後才會立刻引用新的檔名。兩者都存一天，部署之後顧客最多一天拿到舊的 HTML；都 no-store 讓每個資源都回源，CDN 失去作用；反過來設定，則 HTML 被鎖在舊版一年。',
  },
  {
    id: 'srv14-q7', prompt: '網站時快時慢，access.log 全是 200，error.log 有 `upstream timed out (110: Connection timed out) while connecting to upstream, … upstream: "http://10.20.0.22:8080/"`，ping 10.20.0.22 有回應。下一步最應該做什麼？',
    options: ['把 proxy_read_timeout 調長到 300 秒', '重新啟動 web-01 的 nginx', '在 upstream 把 10.20.0.22 永久標成 down，事故就結束了', '從 web-01 測 10.20.0.22 的 8080（`nc -zv -w 3`），再看那台主機的防火牆規則與最近的變更'],
    answer: 3,
    explanation: 'while connecting 表示連線根本沒有建立，ping 通表示主機在線上，所以要驗證的假設是「8080 的封包被丟掉」：從 web-01 測埠，再看 app-02 的 ufw 與 journal。read timeout 和連不上無關；nginx 沒有壞，重新啟動只會中斷連線；標成 down 只是把一半的容量拿掉、藏起症狀，原因還在。',
  },
  {
    id: 'srv14-q8', prompt: '兩台後端中有一台的 8080 被防火牆丟棄，upstream 是 `max_fails=3 fail_timeout=30s`、`proxy_connect_timeout 5s`。為什麼顧客拿到的是偶爾慢 5 秒的 200，而不是 504？',
    options: ['nginx 會把 504 改寫成 200，避免顧客看到錯誤', 'proxy_next_upstream 的預設（error timeout）讓 nginx 在連線逾時後改送另一台；30 秒內失敗 3 次後暫停送給它，過了 fail_timeout 再試一次', '防火牆丟棄的封包會自動轉到另一台後端', 'CDN 在逾時之後改送給另一個來源'],
    answer: 1,
    explanation: '連線逾時算是可以重試的失敗，nginx 等滿 5 秒後把同一個請求送給另一台，所以顧客拿到 200、只是慢了 5 秒；max_fails 讓它在 fail_timeout 期間跳過那台，之後再試，於是時快時慢。只有所有後端都失敗才會是 504（本課有 backup 時是維護頁面）。nginx 不會改寫狀態碼；防火牆的丟棄不會轉送封包；這個 CDN 只有一個來源。',
  },
];

const exercises: TerminalExercise[] = [
  {
    id: 'srv14-dns-cert', title: '第一關：DNS 指向新主機，再取得憑證', machine: 'srv14-dns',
    statement: '潮汐咖啡的網域今天從舊的虛擬主機（198.51.100.99）搬到 web-01（203.0.113.40）。你在 web-01 上：nginx 已經在 80 埠服務暫時的首頁，certbot 也已經註冊了帳號。網域的權威 DNS 是 ns1，區域檔是 `/etc/bind/db.tidecoffee.example`；`ssh ns1` 可以用金鑰登入，learner 在那裡可以用 sudo。請：(1) 讓 `tidecoffee.example` 的 A 記錄指向 203.0.113.40；(2) 修好 `www.tidecoffee.example`：它應該是指向 `tidecoffee.example.` 的 CNAME；(3) 依慣例把 SOA 的 serial 改成 `2026112201`；(4) 檢查區域檔，再讓 named 重新載入；(5) 用 `certbot --nginx` 取得同時涵蓋這兩個名稱的憑證並裝進 nginx（http 要轉到 https）。最後從 web-01 確認 `https://www.tidecoffee.example/` 回 200。web-01 自己的解析器若已經快取了舊的答案，可以用 `sudo resolvectl flush-caches` 清掉。',
    checks: [
      { kind: 'dns', name: SITE, type: 'A', values: [WEB_IP], server: 'ns1' },
      { kind: 'dns', name: WWW, type: 'CNAME', values: [`${SITE}.`], server: 'ns1' },
      { kind: 'dns', name: SITE, type: 'SOA', values: [`ns1.${SITE}. hostmaster.${SITE}. 2026112201 3600 900 1209600 300`], server: 'ns1' },
      { kind: 'cert', path: `${LE}/fullchain.pem`, name: WWW, issuer: 'R11', valid: WWW },
      { kind: 'cert', path: `${LE}/fullchain.pem`, name: SITE, valid: SITE },
      { kind: 'nginx', server: WWW, port: 443, ssl: true },
      { kind: 'http', url: `${W}/`, status: 200, body: '潮汐咖啡' },
      { kind: 'http', url: `http://${SITE}/`, status: 301, header: ['Location', `https://${SITE}/`] },
    ],
    solution: DNS_SOLUTION,
    mistakes: [
      { commands: [CERTBOT_NGINX],
        why: '還沒修 DNS 就申請：CA 從網際網路的 DNS 查名稱，tidecoffee.example 仍指向舊主機 198.51.100.99，連線逾時；www 指向不存在的 tidecoffee.example.tidecoffee.example.，得到 NXDOMAIN。certbot 失敗，什麼也沒有安裝。Let\'s Encrypt 對連續失敗的驗證有次數限制，所以先用 dig 確認 DNS 再申請。' },
      { commands: [FIX_ZONE, CHECKZONE, CERTBOT_NGINX],
        why: '區域檔改好了、`named-checkzone` 也是 OK，但沒有 `rndc reload`：named 仍在回答啟動時載入的舊資料，CA 查到的還是舊位址，certbot 照樣失敗。' },
      { commands: [`ssh ns1 "sudo sed -i 's/${OLD_IP}/${WEB_IP}/; s/2026111801/2026112201/' ${ZONE_PATH}"`, RELOAD_ZONE, CERTBOT_NGINX],
        why: '只改了 A 記錄：www 那一行的 `tidecoffee.example` 沒有結尾的句點，會接上原點變成 tidecoffee.example.tidecoffee.example.。CA 查 www 得到 NXDOMAIN，同一張憑證的兩個名稱有一個驗證失敗，整張都不會簽發。' },
      { commands: [`ssh ns1 "sudo sed -i 's/${OLD_IP}/${WEB_IP}/; s/CNAME ${SITE}$/CNAME ${SITE}./' ${ZONE_PATH}"`, CHECKZONE, RELOAD_ZONE, CERTBOT_NGINX, 'sudo resolvectl flush-caches', `curl -sI ${W}/`],
        why: '記錄與憑證都對了，但 serial 還是 2026111801：這一台 named 依檔案重新載入，看不出差別；次要 DNS 伺服器卻是依 serial 有沒有變大來決定要不要重新取得區域，serial 不變，它們就一直回答舊的位址。' },
      { commands: [FIX_ZONE, RELOAD_ZONE, `sudo certbot --nginx -d ${SITE}`, 'sudo resolvectl flush-caches'],
        why: '只申請了 tidecoffee.example：憑證的 SAN 沒有 www.tidecoffee.example，瀏覽器與 curl 連 https://www.tidecoffee.example/ 時名稱不符而拒絕連線。每個要用 https 的名稱都要寫一個 `-d`。' },
    ],
    hints: [
      '先問權威伺服器：`dig @ns1 tidecoffee.example +short`、`dig @ns1 www.tidecoffee.example +short`，再用 `ssh ns1 cat /etc/bind/db.tidecoffee.example` 看區域檔。www 那一行少了什麼？',
      '整段遠端指令用雙引號包起來，裡面的單引號才會原封不動送到 ns1：`ssh ns1 "sudo sed -i \'s/舊/新/; s/…/…/\' /etc/bind/db.tidecoffee.example"`。',
      '`ssh ns1 named-checkzone tidecoffee.example /etc/bind/db.tidecoffee.example` 印出 OK 之後，`ssh ns1 sudo rndc reload tidecoffee.example`，再用 `dig @ns1` 確認。',
      'DNS 對了才 `sudo certbot --nginx -d tidecoffee.example -d www.tidecoffee.example`；之前在 web-01 查過的舊答案要 `sudo resolvectl flush-caches`。',
    ],
    explanation: '`dig @ns1` 直接問權威伺服器，看到兩個問題：網域本身的 A 記錄還是舊主機 198.51.100.99，而 www 的 CNAME 少了結尾的句點，目標變成 tidecoffee.example.tidecoffee.example.。在 ns1 上用一個 sed 改位址、改 serial、補上句點，`named-checkzone` 印出 `loaded serial 2026112201` 與 OK 之後 `rndc reload`，`dig @ns1 www.tidecoffee.example +short` 就是 tidecoffee.example. 與 203.0.113.40。這時才申請憑證：CA 經由網際網路的 DNS 找到 web-01，向它的 80 埠取回 HTTP-01 的 token（`--nginx` 讓 nginx 暫時回答它），簽發涵蓋兩個名稱的憑證，再把 `listen 443 ssl`、憑證路徑與 http 轉 https 的區塊寫進網站設定並 reload。web-01 的解析器在修好之前查過的答案還在快取裡（TTL 3600 秒），清掉快取之後，`curl -sI https://www.tidecoffee.example/` 驗證憑證成功、回 200。',
  },
  {
    id: 'srv14-proxy', title: '第二關：nginx 終止 TLS，把請求交給兩台應用伺服器', machine: 'srv14-proxy',
    statement: '接著把商店接上兩台應用伺服器 app-01（10.20.0.21）與 app-02（10.20.0.22）：gunicorn 在 8080 埠，只有私有位址。web-01 上還有一個只綁 127.0.0.1:8090 的維護頁面程式。請：(1) 寫 `/etc/nginx/conf.d/tide-upstream.conf`，內容依序是這 5 行：`upstream tide_app {`、`    server 10.20.0.21:8080 max_fails=3 fail_timeout=30s;`、`    server 10.20.0.22:8080 max_fails=3 fail_timeout=30s;`、`    server 127.0.0.1:8090 backup;`、`}`（server 行的前面是 4 個空格）；(2) 讓 443 的 server 區塊中 `location /` 的請求交給 `tide_app`，並送出 `Host`（`$host`）、`X-Real-IP`（`$remote_addr`）、`X-Forwarded-For`（`$proxy_add_x_forwarded_for`）、`X-Forwarded-Proto`（`$scheme`）四個標頭，連線逾時設為 5 秒（`proxy_connect_timeout 5s;`）；`/assets/` 仍由 web-01 直接讀檔；(3) 檢查設定後不中斷地套用。應用程式的 `/api/echo` 會把它收到的請求原樣傳回，可以用來確認標頭。檢查時，也會在 app-01 當機的情況下重新執行你的指令。',
    checks: [
      { kind: 'content', path: UPSTREAM_PATH, content: UPSTREAM },
      { kind: 'nginx', test: true },
      { kind: 'http', url: `${W}/`, status: 200, body: '本週烘焙' },
      { kind: 'http', url: `${W}/api/echo`, status: 200, body: `Host: ${WWW}` },
      { kind: 'http', url: `${W}/api/echo`, body: `X-Real-IP: ${WEB_IP}` },
      { kind: 'http', url: `${W}/api/echo`, body: `X-Forwarded-For: ${LAPTOP_IP}, ${WEB_IP}`, requestHeaders: [['X-Forwarded-For', LAPTOP_IP]] },
      { kind: 'http', url: `${W}/api/echo`, body: 'X-Forwarded-Proto: https' },
      { kind: 'http', url: `${W}/assets/${CSS_V1}`, status: 200, header: ['Content-Type', 'text/css'] },
    ],
    solution: PROXY_SOLUTION,
    variants: [{ label: 'app-01 剛好當機（gunicorn 沒有在執行）', files: [], remotes: [stoppedApp('app-01', APP1)] }],
    mistakes: [
      { commands: swap(PROXY_SOLUTION, printfTee(PROXY_LINES, SNIPPET_PATH), printfTee(['proxy_pass http://tide_app;'], SNIPPET_PATH)),
        why: '只有 proxy_pass：nginx 預設送出 `Host: tide_app`（proxy_pass 裡的名稱），應用程式不知道顧客要的是哪個網域，也看不到顧客的位址與原本的 https；echo 裡只剩 remote_addr 10.20.0.10。' },
      { commands: swapProxy('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-For $remote_addr;'),
        why: '用 `$remote_addr` 設定 X-Forwarded-For，會丟掉前面的代理已經記下的位址：請求先經過 CDN 時，應用程式只看到 CDN 的位址。`$proxy_add_x_forwarded_for` 是把 `$remote_addr` 接在收到的值後面。' },
      { commands: without(PROXY_SOLUTION, 'sudo systemctl reload nginx'),
        why: '檔案改好了、`nginx -t` 也通過，但沒有 reload：執行中的 nginx 仍用舊的設定，`/` 還是暫時首頁，`/api/echo` 是 404。' },
      { commands: swap(PROXY_SOLUTION, printfTee(UPSTREAM_LINES, UPSTREAM_PATH), printfTee(['upstream tide_app {', `    server ${APP1}:8080;`, `    server ${APP2}:8080;`, '}'], UPSTREAM_PATH)),
        why: 'upstream 沒有 backup，又用預設的 max_fails=1、fail_timeout=10s：兩台都停擺時顧客看到 nginx 的 502 錯誤頁而不是維護頁面，而一次偶發的失敗就讓一台伺服器被跳過 10 秒。內容和題目要求的不同。' },
    ],
    hints: [
      '先看應用程式直接收到什麼：`curl -s http://10.20.0.21:8080/api/echo`。',
      '`printf \'%s\\n\' \'第一行\' \'第二行\' … | sudo tee 檔案 > /dev/null`：每個單引號括起來的字是一行，可以用來寫 upstream 檔。',
      '把 proxy_pass、四個 proxy_set_header 與 proxy_connect_timeout 寫在 `/etc/nginx/snippets/tide-proxy.conf`，再用 `sudo sed -i \'s|try_files $uri $uri/ =404;|include snippets/tide-proxy.conf;|\' /etc/nginx/sites-available/tidecoffee` 換掉 location / 裡的那一行。',
      '`sudo nginx -t` 通過才 `sudo systemctl reload nginx`，再 `curl -s https://www.tidecoffee.example/api/echo`。',
    ],
    explanation: 'upstream 區塊放在 conf.d（Ubuntu 的 nginx.conf 在 http 層 include 它），兩台應用伺服器各自 `max_fails=3 fail_timeout=30s`：30 秒內失敗 3 次就暫停送過去 30 秒；`backup` 的維護頁面只在兩台都不能用時才接手。location / 的 proxy_pass 與標頭放在一個 snippet，之後別的 location 也能 include 同一份。reload 之後 echo 顯示應用程式收到的請求：remote_addr 是 web-01 的私有位址 10.20.0.10（連線是 nginx 發起的），Host 是顧客要的網域，X-Real-IP 與 X-Forwarded-For 帶著用戶端的位址，X-Forwarded-Proto 是 https，請求行是 HTTP/1.0（nginx 對後端的預設版本）。TLS 在 nginx 終止，內網那一段是明文的 http；app-01 當機時，nginx 在 Connection refused 之後立刻改送 app-02，顧客仍然拿到 200。',
  },
  {
    id: 'srv14-firewall', title: '第三關：防火牆與跳板機', machine: 'srv14-firewall',
    statement: '三台伺服器都還沒有防火牆，web-01 的 22 埠對整個網際網路開放。你在自己的筆電 ops-nb 上；跳板機 bastion（公開位址 203.0.113.41、私有位址 10.20.0.5）已經有 ufw，只開 OpenSSH。app-01 與 app-02 只有私有位址，筆電連不到，要用 `ssh -J bastion 主機` 經由跳板機登入（金鑰與 known_hosts 都已經設定，learner 在每一台都可以用 sudo）。請用 ufw 完成：(1) web-01：預設拒絕連入，只對外開放 80 與 443，22 埠只接受 bastion 的私有位址 10.20.0.5；(2) app-01、app-02：8080 只接受 web-01 的私有位址 10.20.0.10，22 只接受 10.20.0.5；(3) 三台都啟用 ufw，過程中不能把自己鎖在外面。',
    checks: [
      { kind: 'firewall', host: 'web-01', enabled: true, incoming: 'deny' },
      { kind: 'reach', to: WEB_IP, port: 443, result: 'succeeded' },
      { kind: 'reach', to: WEB_IP, port: 80, result: 'succeeded' },
      { kind: 'reach', to: WEB_IP, port: 22, result: 'timeout' },
      { kind: 'reach', from: 'bastion', to: 'web-01', port: 22, result: 'succeeded' },
      { kind: 'firewall', host: 'app-01', enabled: true, incoming: 'deny' },
      { kind: 'firewall', host: 'app-02', enabled: true, incoming: 'deny' },
      { kind: 'reach', from: 'web-01', to: 'app-01', port: 8080, result: 'succeeded' },
      { kind: 'reach', from: 'web-01', to: 'app-02', port: 8080, result: 'succeeded' },
      { kind: 'reach', from: 'bastion', to: 'app-01', port: 8080, result: 'timeout' },
      { kind: 'reach', from: 'bastion', to: 'app-02', port: 8080, result: 'timeout' },
      { kind: 'reach', from: 'bastion', to: 'app-01', port: 22, result: 'succeeded' },
      { kind: 'reach', from: 'bastion', to: 'app-02', port: 22, result: 'succeeded' },
      { kind: 'reach', from: 'web-01', to: 'app-01', port: 22, result: 'timeout' },
    ],
    solution: FIREWALL_SOLUTION,
    mistakes: [
      { commands: [J('web-01', ENABLE), J('web-01', 'sudo ufw allow 80,443/tcp'), J('web-01', FROM_BASTION), ...appRules('app-01'), ...appRules('app-02')],
        why: '先啟用才加規則：預設拒絕連入立刻生效，下一個 `ssh -J bastion web-01` 的新連線在 22 埠逾時（`channel 0: open failed: connect failed: Connection timed out`），之後的規則都送不上去，網站的 80 與 443 也一起被擋。真實世界只能從雲端主控台救回來。' },
      { commands: [J('web-01', 'sudo ufw allow 80,443/tcp'), J('web-01', 'sudo ufw allow 22/tcp'), J('web-01', ENABLE), ...appRules('app-01'), ...appRules('app-02')],
        why: '`allow 22/tcp` 沒有限制來源：web-01 的 22 埠仍然對整個網際網路開放，跳板機形同虛設。' },
      { commands: [J('web-01', 'sudo ufw allow 80,443/tcp'), J('web-01', `sudo ufw allow from ${BASTION_IP} to any port 22 proto tcp`), J('web-01', ENABLE), ...appRules('app-01'), ...appRules('app-02')],
        why: '允許的是 bastion 的公開位址：bastion 連到 web-01 的 10.20.0.10 時走私有介面，來源是 10.20.0.5，這條規則不符合。啟用之後，連經由跳板機也進不去 web-01。' },
      { commands: [...WEB_RULES, ...['app-01', 'app-02'].flatMap(h => [J(h, FROM_BASTION), J(h, 'sudo ufw allow 8080/tcp'), J(h, ENABLE)])],
        why: '`allow 8080/tcp` 讓私有網段裡的每一台（包括 bastion）都能直接連到應用程式、繞過 nginx；需要連 8080 的只有 web-01。' },
      { commands: [...WEB_RULES, ...['app-01', 'app-02'].flatMap(h => [J(h, FROM_WEB), J(h, ENABLE)])],
        why: '應用伺服器只開了 8080 就啟用：預設拒絕把 bastion 的 22 也擋下了，下一次要維護 app-01、app-02 時就進不去。' },
    ],
    hints: [
      '先盤點：`ssh -J bastion web-01 sudo ss -tlnp` 列出 web-01 上監聽的程式與位址。',
      '規則先加，最後才啟用；遠端指令沒有鍵盤回答確認，用 `sudo ufw --force enable`。例如 `ssh -J bastion web-01 sudo ufw allow from 10.20.0.5 to any port 22 proto tcp`。',
      'bastion 連到內網時用的是私有介面，來源位址是 10.20.0.5，不是 203.0.113.41；web-01 連應用伺服器時的來源是 10.20.0.10。',
      '驗證：`ssh bastion nc -zv -w 3 web-01 22`、`ssh -J bastion web-01 nc -zv -w 3 app-01 8080`，以及從筆電 `curl -s -o /dev/null -w \'%{http_code}\\n\' https://www.tidecoffee.example/`。',
    ],
    explanation: '`ss -tlnp` 顯示 web-01 對外的是 sshd 的 22 與 nginx 的 80、443，維護頁面只綁 127.0.0.1。每台都先加規則、最後才 `ufw --force enable`：web-01 開放 80,443/tcp，22 只給 10.20.0.5；應用伺服器的 8080 只給 10.20.0.10、22 只給 10.20.0.5。ufw 的預設是拒絕連入、允許連出，所以 web-01 連 app 的 8080、bastion 連各台的 22 都是被允許的新連線，回程封包由狀態追蹤放行。之後從筆電直接連 web-01 的 22 會逾時，管理只剩一條路：筆電 → bastion 的 22 → 內網的 22；顧客仍然只看得到 80 與 443。私有網段（筆電路由不到 10.20.0.0/24）是第一層，每台主機自己的 ufw 是第二層：就算有人進了內網的某一台，也不能直接連到應用程式。',
  },
  {
    id: 'srv14-cdn', title: '第四關：快取標頭與 CDN 邊緣節點', machine: 'srv14-cdn',
    statement: '網站放到 CDN 後面一週了：`www.tidecoffee.example` 是指向 CDN 的 CNAME，邊緣節點 edge-tpe1（192.0.2.80）以 https 向來源 web-01 取資料；來源沒有給 Cache-Control 時，這家 CDN 的設定是存 1 小時。今天 09:40 部署了新版（樣式表換成 `app.9b1f7c3a.css`），顧客卻還是看到舊的頁面。請修正 web-01 的 `/etc/nginx/sites-available/tidecoffee`（`ssh -J bastion web-01`）：`/assets/` 底下含雜湊的檔案回 `Cache-Control: public, max-age=31536000, immutable`（取代原本的 `expires 7d;`）；`location /` 的頁面回 `Cache-Control: no-cache`；`/api/` 維持應用程式自己的 `no-store`，不要在 nginx 加上任何 Cache-Control。檢查設定後套用，再用 CDN 的清除 API 清掉邊緣節點上舊的首頁：這是虛構的通用 API，`POST https://api.edgecdn.example/purge`，以 `-H "Authorization: Bearer 權杖"` 與 `-d \'url=網址\'` 送出，權杖在 `~/.cdn-token`。邊緣節點在修改之前存下的副本保留舊的標頭，如果你在修改前經過 CDN 取過新的樣式表，它也要清除。最後從筆電確認新的樣式表在邊緣節點是 HIT。',
    checks: [
      { kind: 'nginx', host: 'web-01', test: true },
      { kind: 'cache', url: ASSET, status: 'HIT', headers: [['Cache-Control', 'public, max-age=31536000, immutable']] },
      { kind: 'http', url: `${W}/`, status: 200, header: ['Cache-Control', 'no-cache'], body: CSS_V2 },
      { kind: 'cache', url: `${W}/`, status: 'MISS' },
      { kind: 'http', url: `${W}/api/beans`, status: 200, header: ['Cache-Control', 'no-store'] },
    ],
    solution: CDN_SOLUTION,
    mistakes: [
      { commands: [PURGE(`${W}/`), `curl -sI ${ASSET}`, `curl -sI ${ASSET}`],
        why: '只清除、不修標頭：這次顧客拿到了新的首頁，但它仍然沒有 Cache-Control，又被邊緣節點存 1 小時，下一次部署會再發生一樣的事；樣式表也還是 7 天的 max-age。' },
      { commands: without(CDN_SOLUTION, PURGE(`${W}/`)),
        why: '標頭修好了，但邊緣節點在 09:30 存下的首頁要到 10:30 才過期，在那之前顧客拿到的仍是引用舊樣式表的舊頁面：來源的新標頭不會改變已經存下的副本。' },
      { commands: [`curl -sI ${ASSET}`, ...without(CDN_SOLUTION, `curl -sI ${W}/`)],
        why: '修改之前就經過 CDN 取了新的樣式表：邊緣節點存下的是當時 `max-age=604800` 的回應，之後的 HIT 帶著的仍是舊的 Cache-Control。這個網址也要清除，或者修好之後才第一次取它。' },
      { commands: swap(CDN_SOLUTION, CACHE_SED, `sudo sed -i 's|expires 7d;|expires max;|; s|location / {|location / {\\n        add_header Cache-Control "no-cache";|' ${SITE_PATH}`),
        why: '`expires max` 送出 `Cache-Control: max-age=315360000`（10 年）與 2037 年的 Expires，沒有 immutable：和題目要的標頭不同。immutable 讓支援它的瀏覽器在新鮮期間內，連使用者重新整理都不必再向伺服器確認。' },
      { commands: without(CDN_SOLUTION, 'sudo systemctl reload nginx'),
        why: '設定檔改好了卻沒有 reload：nginx 仍送出舊的標頭，清除之後首頁被重新取回時依然沒有 Cache-Control，又被存了 1 小時。' },
    ],
    hints: [
      '`curl -sI https://www.tidecoffee.example/` 看 Age 與 X-Cache；`curl -s --resolve www.tidecoffee.example:443:203.0.113.40 https://www.tidecoffee.example/` 繞過 CDN 直接問來源。',
      '`ssh -J bastion web-01` 登入後，`sudo sed -i \'s|expires 7d;|add_header Cache-Control "public, max-age=31536000, immutable";|\' 檔案`；要在 `location / {` 的下一行加入指令，可以寫 `s|location / {|location / {\\n        add_header …;|`。',
      '`sudo nginx -t`、`sudo systemctl reload nginx`、`exit`，回到筆電再 `curl -s -X POST -H "Authorization: Bearer $(cat ~/.cdn-token)" https://api.edgecdn.example/purge -d \'url=https://www.tidecoffee.example/\'`。',
      '新的樣式表連續取兩次：第一次 MISS（回源並存下），第二次 HIT。',
    ],
    explanation: '邊緣節點的首頁是 09:30 存的（Age 1800、X-Cache HIT），引用的是舊的 app.5d41c2e8.css；繞過 CDN 直接問 web-01，首頁已經是新版。原因是首頁沒有 Cache-Control，CDN 依自己的預設存了 1 小時。修法是讓每一種資源說清楚自己能存多久：含雜湊的檔名內容永遠不變，`public, max-age=31536000, immutable`；HTML 要每次確認，`no-cache`；/api/ 是每位顧客自己的資料，維持應用程式的 `no-store`，所以 add_header 只加在 /assets/ 與 / 兩個 location（加在 server 層會被 /api/ 繼承）。reload 之後，用清除 API 清掉舊的首頁一次：新的標頭只影響之後存下的回應。新的樣式表第一次是 MISS、第二次 HIT；首頁因為 no-cache 不會存在邊緣節點（真實的 CDN 可能存下並每次向來源確認，本課的邊緣節點直接不存，結果同樣是每次都拿到最新的 HTML），之後的部署不再需要清除。',
  },
  {
    id: 'srv14-trace', title: '第五關：追蹤一個請求', machine: 'srv14-trace',
    statement: '從筆電追蹤一位顧客的請求 `https://www.tidecoffee.example/beans/guji`：名稱解析到哪個位址、邊緣節點是從快取回答還是回源、回源之後 nginx 把它交給哪一台應用伺服器。可以用 dig、mtr、`curl -v`、`curl -I`，也可以經由跳板機看 web-01 的 access.log 與 upstream 設定。最後執行的指令要用 curl 的 `-w` 印出一行報告：`邊緣節點的位址 X-Cache 的值 X-Served-By 的值`，三欄以一個空格分隔（`%{remote_ip}`、`%header{x-cache}`、`%header{x-served-by}`），不要印出內容。檢查時會在另外三種情況下重新執行你的指令（nginx 選了另一台、邊緣節點已經存著這一頁、筆電的 /etc/hosts 不一樣），所以報告必須是真的量出來的。不要修改任何設定。',
    checks: [{ kind: 'output', fromCommand: '^curl ' }, { kind: 'unchanged', path: SITE_PATH, host: 'web-01' }],
    solution: TRACE_SOLUTION,
    variants: [
      { label: '另一個時刻：app-01 進行中的連線比較少', files: [], remotes: [liveWeb([3, 15])] },
      { label: '邊緣節點已經存著這一頁（頁面還能被快取的時候存下的）', files: [], remotes: [edge('srv14-trace-edge', [{ url: `${W}/beans/guji`, body: SHOP_PAGE(CSS_V2), cachedAt: '2026-11-22 09:58:00', ttl: 300, headers: [['X-Served-By', 'app-01']] }])] },
      { label: '另一台筆電：/etc/hosts 還留著搬家時測試用的記錄', files: [file('/etc/hosts', nbHosts.replace(`${WEB_IP} web-01\n`, `${WEB_IP} web-01\n${WEB_IP} ${WWW}\n`))] },
    ],
    mistakes: [
      { commands: ["echo '192.0.2.80 MISS app-02'"],
        why: '直接打出答案：檢查會在另外三種情況下重新執行，報告只能從真正的請求量出來。' },
      { commands: [REPORT.replace('/beans/guji', '/api/echo')],
        why: '追蹤了另一個網址：/api/ 的回應是 no-store，邊緣節點從來不存它；要追的是 /beans/guji 這一頁，邊緣節點已經存著它的時候，它的報告是 HIT。' },
      { commands: [REPORT.replace('curl -s ', `curl -s --resolve ${WWW}:443:${WEB_IP} `)],
        why: '用 `--resolve` 直接連到 web-01，跳過了 CDN：報告的位址不是顧客連到的邊緣節點，也少了邊緣節點的決定（沒有 X-Cache）。' },
    ],
    hints: [
      '`dig +short www.tidecoffee.example` 看 CNAME 最後指到哪個位址；`curl -sI https://www.tidecoffee.example/beans/guji` 看 X-Cache 與 X-Served-By。',
      '`ssh -J bastion web-01 cat /etc/nginx/conf.d/tide-upstream.conf`：least_conn 依進行中的連線數選擇後端，不是輪流。',
      '`curl -s -o /dev/null -w \'%{remote_ip} %header{x-cache} %header{x-served-by}\\n\' https://www.tidecoffee.example/beans/guji`。',
    ],
    explanation: '報告的三欄各是一個環節的決定：DNS 把 www 經由 CNAME 解析成邊緣節點的 192.0.2.80（`%{remote_ip}`）；邊緣節點的快取裡沒有這一頁（頁面是 no-cache），於是回源，X-Cache 是 MISS；web-01 的 nginx 用 least_conn，在 app-01 與 app-02 中選了進行中連線較少的 app-02，應用程式在回應加上 X-Served-By。換一個時刻，app-01 的連線較少，同一個指令就報告 app-01；邊緣節點已經存著這一頁時是 HIT，nginx 與應用伺服器根本沒有收到請求，X-Served-By 是存下那一刻回答它的伺服器；筆電的 /etc/hosts 把 www 寫死成 web-01 的位址時，請求繞過了 CDN，報告的位址變成 203.0.113.40，X-Cache 是空的。web-01 的 access.log 裡，這個請求的用戶端是邊緣節點的 192.0.2.80，顧客自己的位址只在 X-Forwarded-For 裡。',
  },
  {
    id: 'srv14-fault', title: '第六關：時快時慢的網站', machine: 'srv14-fault',
    statement: '10:00，客服轉來好幾則訊息：「網站時快時慢，有時候要等好幾秒才出現」，但每一頁最後都有出來。用故障排除的方法找出原因，修好原因而不是症狀：不要修改 web-01 的 nginx 設定（upstream 檔、網站設定、snippet 都不改），不要關掉任何防火牆；app-02 的 8080 仍然只能讓 web-01 的私有位址 10.20.0.10 連，錯誤的規則要移除。',
    checks: [
      { kind: 'reach', from: 'web-01', to: 'app-02', port: 8080, result: 'succeeded' },
      { kind: 'reach', from: 'bastion', to: 'app-02', port: 8080, result: 'timeout' },
      { kind: 'firewall', host: 'app-02', enabled: true, incoming: 'deny' },
      { kind: 'firewall', host: 'app-02', rule: `allow from ${WEB_IP} to any port 8080 proto tcp`, absent: true },
      { kind: 'unchanged', path: UPSTREAM_PATH, host: 'web-01' },
      { kind: 'unchanged', path: SITE_PATH, host: 'web-01' },
      { kind: 'unchanged', path: SNIPPET_PATH, host: 'web-01' },
      { kind: 'http', url: `${W}/`, status: 200, body: '本週烘焙' },
    ],
    solution: FAULT_SOLUTION,
    mistakes: [
      { commands: [J('web-01', `"sudo sed -i 's/${APP2}:8080 max_fails=3 fail_timeout=30s/${APP2}:8080 down/' ${UPSTREAM_PATH}"`), J('web-01', 'sudo systemctl reload nginx')],
        why: '把 app-02 標成 down：慢的請求消失了，但只是把故障藏起來，網站從兩台變成一台在撐，防火牆的錯誤還在；也違反了不改 nginx 設定的要求。' },
      { commands: [J('app-02', 'sudo ufw disable')],
        why: '關掉 app-02 的防火牆：web-01 連得上了，但 app-02 的每一個埠也同時對整個私有網段開放，違反限制。' },
      { commands: [J('app-02', 'sudo ufw allow 8080/tcp')],
        why: '`allow 8080/tcp` 沒有限制來源：bastion 與私有網段的其他主機也能直接連到應用程式，錯誤的規則也還在。' },
      { commands: [J('app-02', 'sudo systemctl restart tide-shop')],
        why: '重新啟動 gunicorn：應用程式本身沒有問題（ping 得到 app-02，在 app-02 上服務正常），封包在到達它之前就被 ufw 丟掉了。' },
      { commands: [J('app-02', FROM_WEB)],
        why: '補上了正確的規則，但允許 203.0.113.40 的那一條還留著：它不會讓任何連線成功（web-01 從私有網段連過來），只會讓下一個讀規則的人以為它有用途。修好原因也包括清掉錯誤的設定。' },
      { commands: [J('web-01', `"sudo sed -i 's/proxy_connect_timeout 5s;/proxy_connect_timeout 1s;/' ${SNIPPET_PATH}"`), J('web-01', 'sudo systemctl reload nginx')],
        why: '把 proxy_connect_timeout 改成 1 秒：顧客等的時間變短了，但每個送到 app-02 的請求仍然先失敗一次，原因完全沒有動，還改了不該改的 nginx 設定。' },
    ],
    hints: [
      '先量症狀，而且一次只看一段：經由跳板機在 web-01 上用 `curl --resolve www.tidecoffee.example:443:127.0.0.1` 繞過 CDN，連續請求幾次並印出 `%{time_total}` 與 X-Served-By；再看 `/var/log/nginx/error.log`。',
      'error.log 寫的是 while connecting 還是 while reading？upstream 是哪一台？`ssh -J bastion web-01 ping -c 2 app-02` 有回應，`ssh -J bastion web-01 nc -zv -w 3 app-02 8080` 呢？',
      '`ssh -J bastion app-02 sudo ufw status numbered` 看規則，`ssh -J bastion app-02 sudo journalctl --since 09:00 --until 09:30` 看那段時間誰做了什麼。',
      '`ssh -J bastion app-02 sudo ufw delete allow from 203.0.113.40 to any port 8080 proto tcp`，再允許 10.20.0.10；被 max_fails 暫停的 app-02 要等超過 fail_timeout 的 30 秒（例如 `sleep 31`）才會再被選到。',
    ],
    explanation: '從 web-01 繞過 CDN 量，每隔一個請求就慢 5 秒，最後都是 app-01 回答；error.log 寫著 `upstream timed out (110: Connection timed out) while connecting to upstream`，upstream 是 10.20.0.22:8080，第一筆在 09:13:07。nginx 連不上 app-02，等滿 proxy_connect_timeout 的 5 秒，再依 proxy_next_upstream 的預設（error timeout）改送 app-01，所以顧客拿到 200，只是慢了 5 秒；30 秒內失敗 3 次之後 max_fails 讓 nginx 暫停送給 app-02，要等 fail_timeout 過了才再試一次，這就是「時快時慢」。ping 有回應、8080 卻逾時，問題縮小到 app-02 上丟掉 8080 封包的防火牆；`ufw status` 顯示 8080 只允許 203.0.113.40，journal 記著 mei 在 09:12 重設並重建了 app-02 的 ufw，用的是 web-01 的公開位址，而 web-01 從私有網段的 10.20.0.10 連過去。刪掉錯的規則、允許 10.20.0.10 之後，nc 成功；等超過 fail_timeout 的 30 秒，app-02 回到輪替，請求又在兩台之間交替、每次都在毫秒內完成。最後寫下時間線：09:12:55 啟用新規則、09:13:07 第一筆逾時、10:00 回報、修正的時間與方法，以及「改防火牆之後從 web-01 測一次 8080」這個之後要加進檢查清單的項目。',
  },
];

export const SRV14: LessonContent = {
  lessonId: 'SRV14',
  motivation: '潮汐咖啡是一家網路咖啡豆店，網站今天要從便宜的虛擬主機搬到自己的伺服器。這座島的每一堂課都只看一個環節：DNS、憑證、nginx、反向代理、負載平衡、防火牆、跳板機、CDN、診斷與故障排除。但顧客按下網址的那一刻，這些環節是一起運作的：名稱要先解析對，TLS 要有涵蓋這個名稱的憑證，CDN 決定要不要回源，nginx 決定交給哪一台應用伺服器，防火牆決定封包能不能通過，任何一段出錯，顧客看到的都只是「網站壞了」或「網站好慢」。這堂綜合專題把整座島接成一個網站的上線過程：六個關卡依序完成 DNS 與憑證、反向代理與負載平衡、防火牆與跳板機、CDN 與快取，再從顧客那一端追蹤一個請求經過的每一段，最後排除一個預先埋好、只壞了路徑中一小段的故障。每一關都要在模擬的機器上動手，並且從顧客那一端驗證結果。',
  sections: [
    {
      id: 'srv14-s-overview', title: '潮汐咖啡的網站：一個請求經過的路',
      blocks: [
        { type: 'p', text: '情境：網域 tidecoffee.example 與 www.tidecoffee.example。網頁伺服器 web-01 有公開位址 203.0.113.40 與私有位址 10.20.0.10，跑 nginx；兩台應用伺服器 app-01（10.20.0.21）與 app-02（10.20.0.22）只有私有位址，gunicorn 監聽 8080；跳板機 bastion（公開 203.0.113.41、私有 10.20.0.5）是管理內網唯一的入口；權威 DNS 是 ns1（198.51.100.53）；上線之後網站放在一家 CDN 後面，邊緣節點 edge-tpe1 的位址是 192.0.2.80。你平常在自己的筆電 ops-nb（198.51.100.77）上工作。模擬的時鐘固定在 2026-11-22 10:00（UTC），只有 `sleep` 會讓它前進。每一關的機器是網站在那一關開始時的樣子，所以前一關做錯了，不影響下一關。' },
        { type: 'p', text: '整堂課的主軸是下面這張表：一個顧客的請求從輸入網址到拿到頁面，依序經過的環節，每一段做了什麼決定、加上了什麼，以及從哪裡看得到它。前五關把這條路一段一段建起來，第五關沿著它追蹤一個請求，第六關在其中一段埋了故障。' },
        { type: 'table', head: ['環節', '在哪裡', '決定或加上了什麼', '從哪裡看得到', '對應的課'], rows: [
          ['1. 名稱解析', '顧客的解析器、ns1、CDN 的 DNS', 'www 是 CNAME，指到 tidecoffee.edgecdn.example，最後得到 192.0.2.80', '`dig`、`curl -v` 的 Trying', '網域與 DNS 記錄管理'],
          ['2. 邊緣節點', 'edge-tpe1', '以 www 的憑證終止 TLS；依 Cache-Control 決定 HIT 或回源；回源時加上 X-Forwarded-For（顧客的位址），回應加上 Age、X-Cache', '`curl -v` 的 Server certificate、X-Cache、Age', 'CDN 與快取設定'],
          ['3. 主機防火牆', 'web-01 的 ufw', '只讓 80、443 進來；22 只接受跳板機', '`ufw status`、`nc -zv`', '伺服器防火牆：ufw 與 nftables'],
          ['4. 網頁伺服器', 'web-01 的 nginx', '再次終止 TLS（來源自己的憑證）；依 location 決定讀檔或代理；在 upstream 中選一台；接上 X-Forwarded-For，加上 X-Real-IP、X-Forwarded-Proto；寫 access.log 與 error.log', 'access.log、error.log、`nginx -T`', 'Nginx 設定入門、反向代理、負載平衡'],
          ['5. 私有網段', 'app 的 ufw', '8080 只接受 web-01 的 10.20.0.10', '從 web-01 `nc -zv`', '伺服器防火牆：ufw 與 nftables'],
          ['6. 應用程式', 'app-01、app-02 的 gunicorn', '產生頁面與 API，在回應加上 X-Served-By；API 是 no-store', '`/api/echo`、X-Served-By', '網頁伺服器架構'],
        ] },
        { type: 'p', text: '管理員走的是另一條路：筆電 → bastion 的 22 埠 → 內網主機的 22 埠（`ssh -J bastion 主機`），這是「SSH 通道與跳板機」的內容。六個關卡如下：' },
        { type: 'table', head: ['關卡', '要做的事', '交出的成果', '用到的課'], rows: [
          ['1. DNS 與憑證', '修正 A 與 CNAME 記錄、reload、用 certbot --nginx 申請並安裝憑證', '解析到 web-01 的兩個名稱、http 轉 https', 'SRV02、SRV04'],
          ['2. 反向代理與負載平衡', 'upstream 兩台應用伺服器（max_fails、backup）、轉送標頭', 'TLS 在 nginx 終止，請求分給兩台', 'SRV06、SRV07、SRV08'],
          ['3. 防火牆與跳板機', '三台主機的 ufw：先加規則再啟用，22 只給跳板機', '最小暴露的網路', 'SRV09、SRV10'],
          ['4. CDN 與快取', '依資源設定 Cache-Control、清除一次舊的首頁、確認邊緣節點 HIT', '部署之後顧客立刻拿到新版', 'SRV11'],
          ['5. 追蹤一個請求', 'dig、mtr、curl -v／-w、access.log，逐段記下每個環節的決定', '一行可以重現的報告', 'SRV03、SRV12'],
          ['6. 埋好的故障', '依症狀、假設、一次一個改變找出壞掉的那一段，修好原因', '恢復正常的網站與時間線', 'SRV13、SRV09'],
        ] },
        { type: 'callout', tone: 'tip', title: '一次一段，每一段都從顧客那一端驗證', text: '每一關都照同樣的節奏：先看現況（dig、curl -I、ufw status、nginx -T），只改一件事，立刻驗證；驗證的位置要選對：DNS 的修改用 `dig @權威伺服器` 確認，防火牆從「應該連得到」與「應該連不到」的兩台主機各測一次，網站本身則經由公開的名稱、https、CDN 從顧客那一端確認。在自己那台機器上通了，不代表顧客那一端也通。' },
      ],
    },
    {
      id: 'srv14-s-dns-cert', title: '第一關：DNS 與憑證',
      blocks: [
        { type: 'p', text: '順序是先 DNS、再憑證。Let\'s Encrypt 的 HTTP-01 驗證由 CA 從網際網路進行：它用公開的 DNS 查出名稱的位址，連到那個位址的 80 埠，取回 certbot 放好的 token。所以名稱還指向舊主機時申請，一定失敗；在自己伺服器的 `/etc/hosts` 寫上新位址也沒有用，因為 CA 根本不讀它。下面是搬家當天的樣子：' },
        { type: 'example', id: 'srv14-ex-dns' },
        { type: 'p', text: '兩個問題都在區域檔裡。網域本身（@）的 A 記錄還是舊主機；www 那一行寫成 `www IN CNAME tidecoffee.example`，沒有結尾的句點，BIND 會把原點接上去，目標變成 tidecoffee.example.tidecoffee.example.，語法完全正確、`named-checkzone` 也不會抱怨，只有實際查詢才發現。修正時同時把 SOA 的 serial 加大（慣例是 `YYYYMMDDnn`），次要伺服器才知道區域變了；改完先 `named-checkzone`，再 `rndc reload`，然後用 `dig @ns1` 直接問 named 確認。網域本身不能是 CNAME（它已經有 SOA 與 NS），所以 @ 用 A 記錄，www 才用 CNAME。' },
        { type: 'table', head: ['步驟', '指令（在 web-01 上）', '確認什麼'], rows: [
          ['1. 看權威資料', '`dig @ns1 tidecoffee.example +short`、`dig @ns1 www.tidecoffee.example +short`', '權威伺服器現在回答什麼，不經過任何快取'],
          ['2. 修改區域檔', '`ssh ns1 "sudo sed -i \'…\' /etc/bind/db.tidecoffee.example"`', 'A 記錄、CNAME 的結尾句點、serial'],
          ['3. 檢查與載入', '`ssh ns1 named-checkzone …`、`ssh ns1 sudo rndc reload tidecoffee.example`', '`loaded serial` 與 OK、`zone reload queued`'],
          ['4. 申請並安裝憑證', '`sudo certbot --nginx -d tidecoffee.example -d www.tidecoffee.example`', '兩個名稱都通過 HTTP-01，nginx 多了 443 與轉址'],
          ['5. 從用戶端驗證', '`sudo resolvectl flush-caches`、`curl -sI https://www.tidecoffee.example/`', '憑證鏈驗證成功、狀態 200'],
        ] },
        { type: 'p', text: '`certbot --nginx` 做三件事：暫時讓 nginx 回答 token、取得憑證，再修改 `server_name` 含這些名稱的 server 區塊：加上 `listen 443 ssl` 與 fullchain.pem、privkey.pem 的路徑，原本的 80 埠改成轉到 https 的區塊，最後 reload。一張憑證可以有多個名稱（SAN），每個名稱都要寫一個 `-d`，而且每個都要通過驗證。憑證 90 天到期，certbot.timer 會自動更新，以 nginx 方式取得的憑證在更新後自動 reload nginx（細節在「TLS 憑證實務：申請、安裝與更新」）。' },
        { type: 'callout', tone: 'warning', title: '修好 DNS 之後，自己這台還是查到舊的', text: 'web-01 的解析器在你修好之前查過 tidecoffee.example，記錄的 TTL 是 3600 秒，修好之後它還會繼續回答舊的位址一小時；顧客的解析器也一樣。這不是 DNS 沒改好：`dig @ns1` 直接問權威伺服器才是真相。自己的機器可以 `sudo resolvectl flush-caches`，顧客的快取只能等 TTL 過期，所以搬家前一天先把 TTL 調低，是「網域與 DNS 記錄管理」教過的做法。' },
      ],
    },
    {
      id: 'srv14-s-proxy', title: '第二關：反向代理與負載平衡',
      blocks: [
        { type: 'p', text: 'nginx 在 web-01 上終止 TLS：顧客到 web-01 這一段是 https，web-01 到應用伺服器這一段走私有網段的 http。應用伺服器只有私有位址，網際網路連不到它們，它們只需要處理 HTTP。nginx 的兩個工作是選一台後端，並把顧客的資訊轉交給它，因為從應用程式看來，連線是 nginx 發起的：' },
        { type: 'table', head: ['設定', '作用', '少了它會怎樣'], rows: [
          ['`proxy_pass http://tide_app;`', '交給名為 tide_app 的 upstream', '—'],
          ['`proxy_set_header Host $host;`', '送出顧客要的網域', 'nginx 預設送 `Host: tide_app`，應用程式產生的連結與判斷都錯'],
          ['`proxy_set_header X-Real-IP $remote_addr;`', 'nginx 看到的用戶端位址', '應用程式只看到 10.20.0.10'],
          ['`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`', '把 $remote_addr 接在收到的 X-Forwarded-For 後面', '用 $remote_addr 會丟掉前面代理（例如 CDN）記下的位址'],
          ['`proxy_set_header X-Forwarded-Proto $scheme;`', '原本是 http 還是 https', '應用程式以為顧客用 http，產生 http 的連結或轉址迴圈'],
          ['`proxy_connect_timeout 5s;`', '連後端最多等 5 秒', '預設 60 秒：一台後端的封包被丟掉時，顧客要等一分鐘才換到另一台'],
        ] },
        { type: 'p', text: 'upstream 寫在 `/etc/nginx/conf.d/tide-upstream.conf`，兩台後端都是 `max_fails=3 fail_timeout=30s`：30 秒內失敗 3 次，nginx 就在接下來的 30 秒不再送給它（被動健康檢查；預設是 max_fails=1、fail_timeout=10s）。`server 127.0.0.1:8090 backup;` 是 web-01 上的維護頁面，只有兩台主要的後端都不能用時才會收到請求，顧客看到的是「系統維護中」而不是 nginx 的 502 錯誤頁。一台後端失敗時，nginx 依 `proxy_next_upstream` 的預設（error timeout）改送下一台，顧客仍然拿到 200。' },
        { type: 'p', text: 'proxy_pass 與五個 proxy 指令放在 `/etc/nginx/snippets/tide-proxy.conf`，location 裡只寫 `include snippets/tide-proxy.conf;`。這樣第四關替 /api/ 多開一個 location 時，同一份設定不必再抄一次，也不會漏掉其中一個標頭。改完一律先 `sudo nginx -t`，再 `sudo systemctl reload nginx`：reload 在新設定通過檢查後才換上新的 worker，正在進行的連線不會中斷。' },
        { type: 'callout', tone: 'warning', title: 'X-Forwarded-For 的最左邊不一定是顧客', text: '任何用戶端都可以自己送一個 X-Forwarded-For，`$proxy_add_x_forwarded_for` 會把它保留下來，再接上真正的連線位址。所以讀這個標頭要從右邊往左讀：最右邊是你的 nginx 依連線加上的位址，往左每一個都是由一個你信任的代理（這裡是 CDN 的邊緣節點）加上的；遇到第一個不是你信任的代理加上的位址就停，那就是顧客，再往左的值都可能是偽造的。' },
      ],
    },
    {
      id: 'srv14-s-firewall', title: '第三關：防火牆與跳板機',
      blocks: [
        { type: 'p', text: '最小暴露的原則：每台主機只對需要的來源開放需要的埠。先列出規劃，再照表設定：' },
        { type: 'table', head: ['主機', '允許的連入', '來源', '理由'], rows: [
          ['bastion', '22/tcp', '任何地方（只接受金鑰）', '唯一對外的管理入口'],
          ['web-01', '80、443/tcp', '任何地方', '顧客（之後是 CDN）的請求'],
          ['web-01', '22/tcp', '10.20.0.5（bastion 的私有位址）', '只能經由跳板機管理'],
          ['app-01、app-02', '8080/tcp', '10.20.0.10（web-01 的私有位址）', '只有 nginx 需要連應用程式'],
          ['app-01、app-02', '22/tcp', '10.20.0.5', '經由跳板機管理'],
        ] },
        { type: 'p', text: '來源位址要寫對：一台有兩張網卡的主機連到另一個網段時，用的是面向那個網段的介面位址。bastion 連 web-01 的 10.20.0.10 走私有網段，來源是 10.20.0.5；寫成它的公開位址 203.0.113.41，規則永遠不會符合。ufw 的預設是拒絕連入、允許連出，回程的封包由狀態追蹤放行，所以只要寫連入的規則。' },
        { type: 'p', text: '應用伺服器在筆電的網路上根本不存在，要用 `ssh -J bastion app-01`：ssh 先登入 bastion，由 bastion 連到 app-01 的 22 埠，再以筆電上的金鑰與 known_hosts 登入 app-01，私鑰不必放到跳板機上。遠端指令有一個常見的陷阱：ssh 把命令列剩下的參數以空白接起來，交給遠端的 shell 重新解讀，所以 `ssh web-01 sudo ufw allow \'Nginx Full\'` 到了遠端變成 `ufw allow Nginx Full`，引號不見了，ufw 把它當成兩個字而失敗。需要引號時，整段遠端指令再用一層雙引號包起來。' },
        { type: 'list', ordered: true, items: [
          '盤點：`ssh -J bastion web-01 sudo ss -tlnp`，看哪些程式在哪個位址監聽。',
          '先加允許的規則：`sudo ufw allow 80,443/tcp`、`sudo ufw allow from 10.20.0.5 to any port 22 proto tcp`。',
          '最後才啟用：在 ssh 的工作階段裡 ufw 會先問 `Command may disrupt existing ssh connections`，遠端指令沒有鍵盤，用 `sudo ufw --force enable`。',
          '從應該連得到與應該連不到的地方各測一次：`ssh bastion nc -zv -w 3 web-01 22` 成功，筆電的 `nc -zv -w 3 web-01 22` 逾時，筆電的 https 仍然是 200。',
        ] },
        { type: 'callout', tone: 'warning', title: '開著的工作階段不代表進得去', text: '啟用 ufw 時，已經建立的 SSH 連線由狀態追蹤放行，所以眼前的工作階段一切正常，很容易以為設定沒問題。真正的考驗是下一個新連線：如果還沒允許 22，或允許了錯的來源位址，新的 ssh 會逾時，經由跳板機也一樣。啟用之前先加規則，啟用之後另開一個新的連線測試，確認成功之前不要關掉原本的工作階段；雲端主機的主控台是最後的退路。' },
      ],
    },
    {
      id: 'srv14-s-cdn', title: '第四關：CDN 與快取',
      blocks: [
        { type: 'p', text: '網站放到 CDN 後面之後，www 是指向 CDN 的 CNAME，顧客連到離他近的邊緣節點。邊緣節點用「Host 加路徑」找副本：還新鮮就直接回答（X-Cache: HIT），否則向來源 web-01 取（MISS）並依來源的 Cache-Control 決定能存多久；來源什麼都沒說時，就看 CDN 自己的預設。今天 09:40 部署了新版，顧客卻還看到舊的頁面：' },
        { type: 'example', id: 'srv14-ex-stale' },
        { type: 'p', text: '首頁沒有 Cache-Control，CDN 的預設讓它在邊緣節點存 1 小時；而這份舊首頁引用的是舊的樣式表。正確的做法是讓每一種資源說清楚自己能存多久（「CDN 與快取設定」）：' },
        { type: 'table', head: ['資源', 'Cache-Control', '理由'], rows: [
          ['含雜湊的檔名（`/assets/app.9b1f7c3a.css`）', '`public, max-age=31536000, immutable`', '內容一變檔名就變，同一個網址永遠是同一份內容，可以存一年；immutable 讓支援它的瀏覽器在這段期間連重新整理都不必確認'],
          ['HTML（`/`、`/beans/…`）', '`no-cache`', '可以存，但每次使用前都要向來源確認；部署之後顧客立刻拿到引用新檔名的 HTML'],
          ['個人化的 API（`/api/…`）', '`no-store`（應用程式送出）', '每位顧客自己的資料，任何共用快取都不能存'],
        ] },
        { type: 'p', text: '在 nginx 裡，add_header 寫在 /assets/ 與 / 這兩個 location：寫在 server 層會被沒有自己 add_header 的 /api/ 繼承，API 的回應就會多出一個 Cache-Control。`expires 7d;` 要換掉，否則它會另外送出一個 7 天的 Cache-Control。改完 `nginx -t`、reload，再用 CDN 的清除 API 清掉邊緣節點上那份舊首頁一次：來源的新標頭只影響之後存下的回應，已經存下的副本會一直用到它自己的期限。本課的清除 API 是虛構的通用 API，真實的 CDN 各有自己的 API 與權限設定，概念相同。' },
        { type: 'p', text: '之後的部署就不需要清除了：先上傳新的資源檔（新的檔名），最後才換 HTML；HTML 是 no-cache，顧客下一次就拿到新版，新版引用的新檔名第一次是 MISS，之後都是 HIT。舊的資源檔要在伺服器上多留一段時間，因為還開著舊頁面的瀏覽器仍會用到它們。' },
        { type: 'callout', tone: 'note', title: '本課的邊緣節點不存 no-cache 的回應', text: 'RFC 9111 的 no-cache 允許快取存下回應，只是每次使用前都要向來源確認（帶著 ETag 或 Last-Modified 的條件式請求，來源回 304 就能沿用）。有些 CDN 會這樣做，有些乾脆不存；本課模擬的邊緣節點屬於後者，所以首頁的 X-Cache 一直是 MISS。兩種做法對顧客的結果相同：每一次都拿到來源目前的 HTML。' },
      ],
    },
    {
      id: 'srv14-s-trace', title: '第五關：追蹤一個請求',
      blocks: [
        { type: 'p', text: '網站上線之後，請求追蹤（追蹤一個請求）是最常用的技能：顧客說某一頁很慢或內容不對時，你要能說出這個請求在每一個環節發生了什麼。從顧客那一端開始，名稱解析、路徑與 TLS：' },
        { type: 'example', id: 'srv14-ex-path' },
        { type: 'p', text: 'dig 顯示 www 經由 CNAME 解析成 CDN 的 192.0.2.80，兩筆記錄各有自己的 TTL（CDN 的 300 秒短得多，方便它調整節點）。mtr 列出筆電到邊緣節點的每一跳與延遲，延遲沒有在某一跳突然增加、也沒有遺失。curl -v 的 Trying 是 DNS 的結果；Server certificate 是邊緣節點送出的憑證：TLS 在邊緣節點終止，邊緣節點再用另一條 TLS 連線向 web-01 取資料。回應標頭來自三個地方：Server 是 nginx 換上的，X-Served-By 是應用程式加的，Age 與 X-Cache 是邊緣節點加的。' },
        { type: 'example', id: 'srv14-ex-hops' },
        { type: 'p', text: '`curl -w` 把時間分開：time_namelookup 是 DNS，time_connect 減去它是到邊緣節點的一個來回，time_appconnect 再加上 TLS 交握，time_starttransfer 包含伺服器那一端的所有時間（邊緣節點回源、nginx 到應用伺服器、應用程式的處理）。本課的時間是模擬的模型，用來比較各段的大小，不是真實網路的量測。/api/echo 讓你看到應用程式實際收到的請求：remote_addr 是 web-01 的私有位址，X-Real-IP 是邊緣節點（nginx 看到的用戶端），X-Forwarded-For 是「顧客, 邊緣節點」，前一個是邊緣節點加的，後一個是 nginx 加的。' },
        { type: 'table', head: ['要回答的問題', '看哪裡'], rows: [
          ['名稱解析到哪裡？', '`dig`、`curl -v` 的 Trying、`curl -w \'%{remote_ip}\'`'],
          ['邊緣節點從快取回答還是回源？', 'X-Cache、Age'],
          ['nginx 收到了嗎？用戶端是誰？', 'web-01 的 access.log：放在 CDN 後面時，第一欄是邊緣節點的位址'],
          ['交給哪一台後端？失敗過嗎？', 'X-Served-By、error.log 的 `upstream:`（只有失敗時才寫）、`$upstream_addr`'],
          ['顧客的真實位址？', '應用程式收到的 X-Forwarded-For，由右往左讀'],
        ] },
        { type: 'p', text: 'access.log 的第一欄是 nginx 看到的用戶端，放在 CDN 後面之後永遠是邊緣節點的位址。真實的 nginx 可以用 realip 模組（`set_real_ip_from` 列出 CDN 的網段、`real_ip_header X-Forwarded-For`、`real_ip_recursive on`）把 $remote_addr 換回顧客的位址，再寫進日誌；`log_format` 也可以把 `$upstream_addr`、`$upstream_cache_status` 與 X-Forwarded-For 寫進每一行。本課模擬的 nginx 只有 combined 格式、沒有 realip 模組，所以這兩件事只在課文說明，後端的選擇從應用程式的 X-Served-By 與 error.log 看。' },
      ],
    },
    {
      id: 'srv14-s-fault', title: '第六關：埋好的故障',
      blocks: [
        { type: 'p', text: '最後一關只有症狀：「網站時快時慢，有時候要等好幾秒」，每一頁最後都有出來。照「伺服器故障排除方法」的步驟：先把症狀描述清楚，再依便宜又可能的順序提出並驗證假設，一次只改一件事，修好之後從顧客那一端確認，最後寫下時間線。只壞了一小段的故障最需要方法，因為大部分的請求都是好的：' },
        { type: 'example', id: 'srv14-ex-symptom' },
        { type: 'p', text: '縮小範圍的順序：error.log 從 09:13:07 起有 `upstream timed out (110: Connection timed out) while connecting to upstream`，upstream 都是 10.20.0.22:8080，所以是 nginx「連不上」app-02，不是 app-02「回得慢」（那會是 while reading response header）。在 web-01 上繞過 CDN（`--resolve` 到 127.0.0.1）量，排除了 CDN 那一段：每隔一個請求就慢 5 秒，正好是 proxy_connect_timeout。ping app-02 有回應，主機在線上；8080 卻逾時，而 app-01 的 8080 正常：封包在到達 app-02 的應用程式之前就被丟掉了。下一步是看 app-02 的防火牆規則，以及 09:13 之前那段時間誰在 app-02 上做了什麼。' },
        { type: 'p', text: '為什麼是「時快時慢」而不是錯誤頁？nginx 等滿 5 秒連不上 app-02，依 proxy_next_upstream 的預設改送 app-01，顧客拿到 200，只是慢了 5 秒；30 秒內失敗 3 次之後，max_fails 讓 nginx 暫停送給 app-02，接下來的請求都很快，fail_timeout 過了又試一次、又慢一次。負載平衡與被動健康檢查把一台壞掉的後端藏了起來：顧客感覺只是偶爾慢，網站其實一直只有一台在撐。只有兩台都連不上時，顧客才會看到 backup 的維護頁面。' },
        { type: 'table', head: ['做法', '效果', '是修原因嗎'], rows: [
          ['把 app-02 標成 `down`', '慢的請求消失', '不是：故障被藏起來，容量少了一半'],
          ['把 proxy_connect_timeout 改小', '顧客等得比較短', '不是：每個送到 app-02 的請求仍然先失敗'],
          ['`ufw disable` 或 `ufw allow 8080/tcp`', 'web-01 連得上了', '不是：app-02 的 8080 對整個內網開放'],
          ['重新啟動應用程式或 nginx', '沒有效果', '不是：兩者都沒有壞'],
          ['刪掉錯誤的規則、只允許 10.20.0.10 連 8080', 'web-01 連得上，其他主機仍連不到', '是'],
        ] },
        { type: 'callout', tone: 'warning', title: '症狀消失不等於修好了', text: '把壞掉的後端從 upstream 拿掉、把逾時調短，網站看起來立刻恢復了，事故單也可以關掉，但原因還在：下一次有人改 app-01 的防火牆，兩台都連不上，顧客就只剩維護頁面可看。修好的標準是「原因被消除，而且從顧客那一端看不出差別」：這裡是 web-01 能從私有位址連到 app-02 的 8080、其他主機仍然連不到，等 fail_timeout 過了之後，請求又平均分給兩台，每一次都在毫秒內完成。' },
        { type: 'p', text: '最後寫下時間線，例如：09:12:55 mei 在 app-02 啟用重建的 ufw（8080 只允許 web-01 的公開位址）；09:13:07 error.log 出現第一筆連不上 app-02 的逾時；10:00 客服回報時快時慢；接著依序量測、找到 app-02 的規則、刪除錯誤的規則並改為允許 10.20.0.10，從 web-01 確認 8080 與回應時間（每一步都記下時間）；之後的改進：修改防火牆之後，從實際會連進來的主機測一次（`nc -zv`），並把每台主機允許的來源寫進第三關那張規劃表，讓重建規則的人有正確的依據。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '架設 HTTPS 網站並追蹤請求：六個關卡',
    stages: [
      { title: 'DNS 與憑證', concepts: ['SRV02', 'SRV04'], goal: '讓網域與 www 經由 ns1 解析到 web-01，再用 certbot --nginx 取得涵蓋兩個名稱的憑證。', detail: 'dig @ns1 直接問權威伺服器；@ 用 A、www 用 CNAME，完整名稱要有結尾的句點；serial 加大、named-checkzone 之後 rndc reload；CA 從網際網路的 DNS 驗證，DNS 對了才申請；舊答案在解析器裡要等 TTL 或 flush-caches。' },
      { title: '反向代理與負載平衡', concepts: ['SRV06', 'SRV07', 'SRV08'], goal: 'nginx 終止 TLS，把請求交給兩台私有網段的應用伺服器，並送出轉送標頭。', detail: 'upstream 的 max_fails=3 fail_timeout=30s 與 backup 的維護頁面；Host、X-Real-IP、$proxy_add_x_forwarded_for、X-Forwarded-Proto；proxy_connect_timeout 5s；nginx -t 之後 reload；/api/echo 驗證應用程式收到的請求。' },
      { title: '防火牆與跳板機', concepts: ['SRV09', 'SRV10'], goal: 'web-01 只開 80、443，22 只給 bastion；應用伺服器的 8080 只給 web-01；管理只經由 ssh -J。', detail: '先加規則再 ufw --force enable；來源位址是面向那個網段的介面（10.20.0.5、10.20.0.10）；遠端指令的引號要再包一層；從應該連得到與連不到的主機各測一次，新連線成功之前不要關掉舊的工作階段。' },
      { title: 'CDN 與快取', concepts: ['SRV11'], goal: '雜湊檔名存一年、HTML no-cache、API no-store，清除一次舊的首頁，確認新的樣式表在邊緣節點 HIT。', detail: '來源沒有 Cache-Control 時 CDN 用自己的預設；add_header 寫在 location，避免被 /api/ 繼承；新標頭不影響已經存下的副本；之後以版本化的檔名部署，不再需要清除。' },
      { title: '追蹤一個請求', concepts: ['SRV03', 'SRV12'], goal: '從顧客那一端說出一個請求在 DNS、邊緣節點、nginx、應用伺服器各發生了什麼。', detail: 'dig 的 CNAME 鏈、mtr 的路徑、curl -v 的憑證與標頭、curl -w 的時間與 %header{}；access.log 的用戶端是邊緣節點，顧客在 X-Forwarded-For 裡由右往左讀；least_conn 依進行中的連線數選擇後端。' },
      { title: '埋好的故障', concepts: ['SRV13', 'SRV09'], goal: '找出「時快時慢」的原因並修好原因：app-02 的防火牆允許了 web-01 的公開位址。', detail: 'error.log 的 while connecting 與 upstream；繞過 CDN 在 web-01 上量；ping 通、8080 逾時；ufw status 與 journal 的 sudo 紀錄；刪掉錯的規則、允許 10.20.0.10；不要用 down 或調逾時藏起症狀；寫下時間線。' },
    ],
  },
  quiz: QUIZ,
  terminal: {
    machines: [dnsStage, proxyStage, firewallStage, cdnStage, traceStage, faultStage],
    examples: [
      {
        id: 'srv14-ex-dns', title: '搬家當天：DNS 還指向舊主機，certbot 失敗', machine: 'srv14-dns',
        description: '直接問權威伺服器 ns1：網域本身的 A 記錄還是舊主機，www 的 CNAME 少了結尾的句點；這時申請憑證，CA 對一個名稱連線逾時、對另一個得到 NXDOMAIN。',
        steps: [
          { command: "dig @ns1 tidecoffee.example +short", output: "198.51.100.99" },
          { command: "dig @ns1 www.tidecoffee.example +noall +answer", output: "www.tidecoffee.example.\t3600\tIN\tCNAME\ttidecoffee.example.tidecoffee.example." },
          { command: "ssh ns1 tail -n 3 /etc/bind/db.tidecoffee.example", output: "        IN  A    198.51.100.99\nns1     IN  A    198.51.100.53\nwww     IN  CNAME tidecoffee.example" },
          { command: "sudo certbot --nginx -d tidecoffee.example -d www.tidecoffee.example", output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for tidecoffee.example and www.tidecoffee.example\n\nCertbot failed to authenticate some domains (authenticator: nginx). The Certificate Authority reported these problems:\n  Domain: tidecoffee.example\n  Type:   connection\n  Detail: 198.51.100.99: Fetching http://tidecoffee.example/.well-known/acme-challenge/-QK9NNmTuKC94RnIz6pQBfJUXXkEb3SObEBsktQj2iQ: Timeout during connect (likely firewall problem)\n\n  Domain: www.tidecoffee.example\n  Type:   dns\n  Detail: DNS problem: NXDOMAIN looking up A for www.tidecoffee.example - check that a DNS record exists for this domain\n\nHint: The Certificate Authority failed to verify the temporary nginx configuration changes made by Certbot. Ensure the listed domains point to this nginx server and that it is accessible from the internet.\n\nSome challenges have failed.\nAsk for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details." },
        ],
      },
      {
        id: 'srv14-ex-path', title: '從顧客那一端看：DNS、路徑與邊緣節點', machine: 'srv14-trace',
        description: 'www 是指向 CDN 的 CNAME；mtr 列出從筆電到邊緣節點的每一跳；curl -v 顯示 TLS 在邊緣節點以 www 的憑證完成，回應帶著 nginx 的 Server、應用程式的 X-Served-By 與邊緣節點的 Age、X-Cache。',
        steps: [
          { command: "dig www.tidecoffee.example +noall +answer", output: "www.tidecoffee.example.\t3600\tIN\tCNAME\ttidecoffee.edgecdn.example.\ntidecoffee.edgecdn.example. 300\tIN\tA\t192.0.2.80" },
          { command: "mtr -rwc 5 www.tidecoffee.example", output: "Start: 2026-11-22T10:00:00+0000\nHOST: ops-nb                     Loss%   Snt   Last   Avg  Best  Wrst StDev\n  1.|-- _gateway                    0.0%     5    0.6   0.6   0.6   0.6   0.0\n  2.|-- bras1.isp.example           0.0%     5    3.4   3.4   3.3   3.4   0.1\n  3.|-- core2.isp.example           0.0%     5    5.0   5.0   5.0   5.2   0.1\n  4.|-- ix-tpe.cdn.example          0.0%     5    6.2   6.3   6.0   6.4   0.1\n  5.|-- tidecoffee.edgecdn.example  0.0%     5    7.0   7.0   6.7   7.1   0.1" },
          { command: "curl -v https://www.tidecoffee.example/api/beans", output: "*   Trying 192.0.2.80:443...\n* Connected to www.tidecoffee.example (192.0.2.80) port 443\n* ALPN: curl offers h2,http/1.1\n* TLSv1.3 (OUT), TLS handshake, Client hello (1):\n*  CAfile: /etc/ssl/certs/ca-certificates.crt\n*  CApath: /etc/ssl/certs\n* TLSv1.3 (IN), TLS handshake, Server hello (2):\n* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):\n* TLSv1.3 (IN), TLS handshake, Certificate (11):\n* TLSv1.3 (IN), TLS handshake, CERT verify (15):\n* TLSv1.3 (IN), TLS handshake, Finished (20):\n* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):\n* TLSv1.3 (OUT), TLS handshake, Finished (20):\n* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / RSASSA-PSS\n* ALPN: server accepted http/1.1\n* Server certificate:\n*  subject: CN=www.tidecoffee.example\n*  start date: Nov  1 08:00:00 2026 GMT\n*  expire date: Jan 30 07:59:59 2027 GMT\n*  subjectAltName: host \"www.tidecoffee.example\" matched cert's \"www.tidecoffee.example\"\n*  issuer: C=US; O=Let's Encrypt; CN=R11\n*  SSL certificate verify ok.\n*   Certificate level 0: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption\n*   Certificate level 1: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption\n> GET /api/beans HTTP/1.1\n> Host: www.tidecoffee.example\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):\n* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):\n< HTTP/1.1 200 OK\n< Server: nginx/1.24.0 (Ubuntu)\n< Date: Sun, 22 Nov 2026 10:00:00 GMT\n< Content-Type: application/json\n< Content-Length: 71\n< Cache-Control: no-store\n< X-Served-By: app-02\n< Connection: keep-alive\n< Age: 0\n< X-Cache: MISS\n<\n{\"beans\":[{\"sku\":\"guji-200\",\"name\":\"衣索比亞 古吉\",\"stock\":42}]}\n* Connection #0 to host www.tidecoffee.example left intact" },
        ],
      },
      {
        id: 'srv14-ex-hops', title: '每一個環節加上了什麼', machine: 'srv14-trace',
        description: 'curl -w 把時間分給 DNS、連線、TLS 與伺服器；/api/echo 顯示應用程式收到的請求（X-Forwarded-For 由邊緣節點與 nginx 各接上一個位址）；web-01 的 access.log 記錄的用戶端是邊緣節點；upstream 用 least_conn。',
        steps: [
          { command: "curl -s -o /dev/null -w 'dns %{time_namelookup}  connect %{time_connect}  tls %{time_appconnect}  first byte %{time_starttransfer}  total %{time_total}\\n' https://www.tidecoffee.example/api/beans", output: "dns 0.024300  connect 0.031200  tls 0.040200  first byte 0.049900  total 0.049981" },
          { command: "curl -s https://www.tidecoffee.example/api/echo", output: "remote_addr: 10.20.0.10\nGET /api/echo HTTP/1.0\nHost: www.tidecoffee.example\nX-Real-IP: 192.0.2.80\nX-Forwarded-For: 198.51.100.77, 192.0.2.80\nX-Forwarded-Proto: https\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*" },
          { command: "ssh -J bastion web-01 sudo tail -n 2 /var/log/nginx/access.log", output: "192.0.2.80 - - [22/Nov/2026:10:00:00 +0000] \"GET /api/beans HTTP/1.1\" 200 71 \"-\" \"curl/8.5.0\"\n192.0.2.80 - - [22/Nov/2026:10:00:00 +0000] \"GET /api/echo HTTP/1.1\" 200 219 \"-\" \"curl/8.5.0\"" },
          { command: "ssh -J bastion web-01 cat /etc/nginx/conf.d/tide-upstream.conf", output: "upstream tide_app {\n    least_conn;\n    server 10.20.0.21:8080 max_fails=3 fail_timeout=30s;\n    server 10.20.0.22:8080 max_fails=3 fail_timeout=30s;\n    server 127.0.0.1:8090 backup;\n}" },
        ],
      },
      {
        id: 'srv14-ex-stale', title: '邊緣節點上的舊首頁', machine: 'srv14-cdn',
        description: '邊緣節點從 09:30 起回答同一份首頁（Age 1800），它引用舊的樣式表；用 --resolve 繞過 CDN 直接問 web-01，首頁已經是新版，樣式表的 Cache-Control 只有 7 天。',
        steps: [
          { command: "curl -sI https://www.tidecoffee.example/", output: "HTTP/1.1 200 OK\nDate: Sun, 22 Nov 2026 09:30:00 GMT\nContent-Type: text/html\nContent-Length: 215\nConnection: keep-alive\nAge: 1800\nX-Cache: HIT\n" },
          { command: "curl -s https://www.tidecoffee.example/ | grep stylesheet", output: "<link rel=\"stylesheet\" href=\"/assets/app.5d41c2e8.css\"></head>" },
          { command: "curl -s --resolve www.tidecoffee.example:443:203.0.113.40 https://www.tidecoffee.example/ | grep stylesheet", output: "<link rel=\"stylesheet\" href=\"/assets/app.9b1f7c3a.css\"></head>" },
          { command: "curl -s --resolve www.tidecoffee.example:443:203.0.113.40 -o /dev/null -w '%header{cache-control}\\n' https://www.tidecoffee.example/assets/app.9b1f7c3a.css", output: "max-age=604800" },
        ],
      },
      {
        id: 'srv14-ex-symptom', title: '時快時慢：一段一段縮小範圍', machine: 'srv14-fault',
        description: '從 09:13 起 error.log 有 4 筆連不上 app-02 的逾時；在 web-01 上繞過 CDN 連續請求，每隔一個就慢 5 秒、最後都由 app-01 回答；app-02 ping 得到，8080 卻逾時，app-01 的 8080 正常。',
        steps: [
          { command: "ssh -J bastion web-01 \"sudo grep -c 'while connecting to upstream' /var/log/nginx/error.log\"", output: "4" },
          { command: "ssh -J bastion web-01 sudo head -n 1 /var/log/nginx/error.log", output: "2026/11/22 09:13:07 [error] 813#813: *1902 upstream timed out (110: Connection timed out) while connecting to upstream, client: 192.0.2.80, server: tidecoffee.example, request: \"GET / HTTP/1.1\", upstream: \"http://10.20.0.22:8080/\", host: \"www.tidecoffee.example\"" },
          { command: "ssh -J bastion web-01 \"for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} %{time_total}s %header{x-served-by}\\n' --resolve www.tidecoffee.example:443:127.0.0.1 https://www.tidecoffee.example/; done\"", output: "200 0.002864s app-01\n200 5.002864s app-01\n200 0.002864s app-01\n200 5.002864s app-01\n200 0.002864s app-01\n200 5.002864s app-01" },
          { command: "ssh -J bastion web-01 ping -c 2 app-02", output: "PING app-02 (10.20.0.22) 56(84) bytes of data.\n64 bytes from app-02 (10.20.0.22): icmp_seq=1 ttl=64 time=0.505 ms\n64 bytes from app-02 (10.20.0.22): icmp_seq=2 ttl=64 time=0.506 ms\n\n--- app-02 ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss, time 1001ms\nrtt min/avg/max/mdev = 0.505/0.506/0.506/0.001 ms" },
          { command: "ssh -J bastion web-01 nc -zv -w 3 app-02 8080", output: "nc: connect to app-02 (10.20.0.22) port 8080 (tcp) timed out: Operation now in progress" },
          { command: "ssh -J bastion web-01 nc -zv -w 3 app-01 8080", output: "Connection to app-01 (10.20.0.21) 8080 port [tcp/http-alt] succeeded!" },
        ],
      },
    ],
    exercises,
  },
};
