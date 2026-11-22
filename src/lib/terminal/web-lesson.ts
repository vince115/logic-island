import { resolvePath, type FsState } from './fs';
import { DAY, DEFAULT_NOW, parseTime } from './clock';
import { commOf } from './processes';
import { applyConfig, masterOf, NGINX_MASTER, servedRoot, testConfig } from './nginx';
import { certbotFiles } from './certbot';
import {
  builtin, certPem, certsIn, KEY_TYPES, keyPem, nameMatches, nowOf, readAs, serialFrom, skiOf, trustOf, TRUST_BUNDLE, VERIFY_TEXT, verifyChain, cnOf, type Cert, type Dn, type KeyType,
} from './tls';
import type { TerminalFile, TerminalMachine, TerminalProcess, TerminalService } from './lesson';
import type { Program } from './services';

/*
 * Engine stages E13–E14 as lesson data (docs/curriculum/SRV0_SERVER_CAPABILITY.md §13). A tls machine gets Ubuntu's trust
 * store (/etc/ssl/certs/ca-certificates.crt with the simulation's public root and the lesson's own trusted CAs), the
 * lesson's certificates written as PEM files (each issued by another certificate of the lesson, by Let's Encrypt's R11,
 * or self-signed), and with `certbot` the certbot package (/etc/letsencrypt, certbot.service and an enabled certbot.timer,
 * earlier certificates as certbot leaves them). An nginx machine with `nginx` gets the nginx package as Ubuntu installs
 * it (nginx.conf, mime.types, the default site, /var/www/html, /var/log/nginx, nginx.service) and, when it runs, a master
 * process whose sockets and workers come from the parsed configuration. Each field is allowed only from its own profile up.
 */

/** E13: a certificate of the lesson, written as PEM at path (followed by the chain ids' certificates) with its key at key. */
export interface TerminalCertificate {
  /** Unique in the lesson (the local machine and every remote); other certificates name it as issuer, machines in trust. */
  id: string;
  path?: string;
  key?: string;
  chain?: string[];
  cn: string;
  sans?: string[];
  org?: string;
  /** Another certificate of the lesson, 'lets-encrypt-r11' or 'isrg-root-x1'; default self-signed. */
  issuer?: string;
  /** UTC; default 30 days before now. */
  notBefore?: string;
  /** UTC; default notBefore + days − 1 second. */
  notAfter?: string;
  /** Default 90 (3650 for a CA). */
  days?: number;
  keyType?: KeyType;
  ca?: boolean;
  serial?: string;
}
/** E13: certbot on the machine: the CA's lifetime (days), its timer, an existing ACME account, earlier certificates. */
export interface TerminalCertbot { lifetime?: number; timer?: boolean; account?: boolean; certificates?: { domains: string[]; webroot?: string; nginx?: boolean; issued: string; hook?: string }[] }
export interface WebLevels { tls: boolean; nginx: boolean }

export type WebCheck =
  /** E13: the certificate file (as root): names it covers, when it expires, its issuer's CN, and whether its chain verifies for a name on the machine. */
  | { kind: 'cert'; path: string; host?: string; name?: string; expiresAfter?: string; expiresBefore?: string; issuer?: string; valid?: string }
  /** E14: nginx -t passes (test true) or fails; the applied configuration has a server_name serving root (port, ssl). */
  | { kind: 'nginx'; host?: string; test?: boolean; server?: string; root?: string; port?: number; ssl?: boolean };

const NGINX_CONF_TEXT = `user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
\tworker_connections 768;
\t# multi_accept on;
}

http {

\t##
\t# Basic Settings
\t##

\tsendfile on;
\ttcp_nopush on;
\ttypes_hash_max_size 2048;
\t# server_tokens off;

\tinclude /etc/nginx/mime.types;
\tdefault_type application/octet-stream;

\t##
\t# SSL Settings
\t##

\tssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
\tssl_prefer_server_ciphers on;

\t##
\t# Logging Settings
\t##

\taccess_log /var/log/nginx/access.log;

\t##
\t# Gzip Settings
\t##

\tgzip on;

\t##
\t# Virtual Host Configs
\t##

\tinclude /etc/nginx/conf.d/*.conf;
\tinclude /etc/nginx/sites-enabled/*;
}
`;
const MIME_TYPES = `
types {
    text/html                                        html htm shtml;
    text/css                                         css;
    text/xml                                         xml;
    image/gif                                        gif;
    image/jpeg                                       jpeg jpg;
    application/javascript                           js;
    text/plain                                       txt;
    image/png                                        png;
    image/svg+xml                                    svg svgz;
    image/webp                                       webp;
    image/x-icon                                     ico;
    font/woff2                                       woff2;
    application/json                                 json;
    application/pdf                                  pdf;
    application/zip                                  zip;
    application/octet-stream                         bin exe dll;
    audio/mpeg                                       mp3;
    video/mp4                                        mp4;
}
`;
const DEFAULT_SITE = `##
# You should look at the following URL's in order to grasp a solid understanding
# of Nginx configuration files in order to fully unleash the power of Nginx.
# https://www.nginx.com/resources/wiki/start/
##

# Default server configuration
#
server {
\tlisten 80 default_server;
\tlisten [::]:80 default_server;

\troot /var/www/html;

\t# Add index.php to the list if you are using PHP
\tindex index.html index.htm index.nginx-debian.html;

\tserver_name _;

\tlocation / {
\t\t# First attempt to serve request as file, then
\t\t# as directory, then fall back to displaying a 404.
\t\ttry_files $uri $uri/ =404;
\t}
}
`;
export const NGINX_WELCOME = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`;
const NGINX_UNIT = `[Unit]
Description=A high performance web server and a reverse proxy server
Documentation=man:nginx(8)
After=network-online.target remote-fs.target nss-lookup.target
Wants=network-online.target

[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t -q -g 'daemon on; master_process on;'
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'
ExecReload=/usr/sbin/nginx -g 'daemon on; master_process on;' -s reload
ExecStop=-/sbin/start-stop-daemon --quiet --stop --retry QUIT/5 --pidfile /run/nginx.pid
TimeoutStopSec=5
KillMode=mixed

[Install]
WantedBy=multi-user.target
`;
const CERTBOT_SERVICE = `[Unit]
Description=Certbot
Documentation=file:///usr/share/doc/python-certbot-doc/html/index.html
Documentation=https://certbot.eff.org/docs

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot -q renew
PrivateTmp=true
`;
const CERTBOT_TIMER = `[Unit]
Description=Run certbot twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=43200
Persistent=true

[Install]
WantedBy=timers.target
`;

/** The certificates a machine may refer to: its own, the lesson's other machines' (issuers), and the built-in CAs. */
export const certPool = (m: Pick<TerminalMachine, 'certificates' | 'issuers' | 'remotes'>): TerminalCertificate[] =>
  [...m.certificates ?? [], ...m.issuers ?? [], ...(m.remotes ?? []).flatMap(r => r.certificates ?? [])];

/** The certificates of the lesson as records (each built once, issuers first); undefined for an unknown or cyclic issuer. */
export function buildCerts(pool: readonly TerminalCertificate[], now: number): Map<string, Cert> {
  const out = new Map<string, Cert>(Object.entries(builtin()));
  const visiting = new Set<string>();
  const build = (id: string): Cert | undefined => {
    if (out.has(id)) return out.get(id);
    const d = pool.find(c => c.id === id);
    if (!d || visiting.has(id)) return undefined;
    visiting.add(id);
    const issuer = d.issuer ? build(d.issuer) : undefined;
    visiting.delete(id);
    if (d.issuer && !issuer) return undefined;
    const subject: Dn = [...d.org ? [['O', d.org] as const] : [], ['CN', d.cn]];
    const notBefore = d.notBefore !== undefined ? parseTime(d.notBefore) ?? now : now - 30 * DAY;
    const notAfter = d.notAfter !== undefined ? parseTime(d.notAfter) ?? now : notBefore + (d.days ?? (d.ca ? 3650 : 90)) * DAY - 1;
    const seed = `lesson/${d.id}`;
    const c: Cert = {
      serial: d.serial?.toLowerCase() ?? serialFrom(seed), subject, issuer: issuer ? issuer.subject : subject, notBefore, notAfter, key: d.keyType ?? 'rsa2048', ski: skiOf(seed),
      ...issuer ? { aki: issuer.ski } : {}, sans: d.sans ?? (d.ca ? [] : [d.cn]), ca: !!d.ca,
    };
    out.set(id, c);
    return c;
  };
  for (const d of pool) build(d.id);
  return out;
}

/**
 * A tls (nginx) machine with what Ubuntu has unless the lesson lists it: the trust store, the lesson's certificate files,
 * certbot and nginx. Idempotent like expandServer; a listed path is never generated again.
 */
export function expandWeb(m: TerminalMachine, lv: WebLevels, add: { file(f: TerminalFile): void; dir(path: string, mode?: number, group?: string): void; listed(path: string): boolean },
  procs: TerminalProcess[], programs: Program[], services: TerminalService[], pidFrom: (want: number) => number): void {
  if (!lv.tls) return;
  const now = parseTime(m.now ?? DEFAULT_NOW) ?? 0, certs = buildCerts(certPool(m), now);
  const parents = (path: string) => { const parts = path.split('/').filter(Boolean); for (let i = 1; i < parts.length; i++) add.dir(`/${parts.slice(0, i).join('/')}`); };
  const file = (path: string, content: string, mode = 0o644, owner = 'root', group?: string) => { parents(path); add.file({ path, kind: 'file', mode, owner, ...group ? { group } : {}, content }); };
  const link = (path: string, target: string) => { parents(path); add.file({ path, kind: 'link', mode: 0o777, owner: 'root', target }); };
  // The trust store: the public root and the lesson's trusted CAs.
  add.dir('/etc'); add.dir('/etc/ssl'); add.dir('/etc/ssl/certs'); add.dir('/etc/ssl/private', 0o700);
  const trusted = [builtin()['isrg-root-x1'], ...(m.trust ?? []).map(id => certs.get(id)).filter((c): c is Cert => !!c)];
  file(TRUST_BUNDLE, trusted.map(certPem).join(''));
  for (const d of m.certificates ?? []) {
    const c = certs.get(d.id);
    if (!c) continue;
    if (d.path) file(d.path, [c, ...(d.chain ?? []).map(id => certs.get(id)).filter((x): x is Cert => !!x)].map(certPem).join(''));
    if (d.key) file(d.key, keyPem({ type: c.key, seed: `lesson/${d.id}` }), 0o600);
  }
  if (m.certbot) {
    add.dir('/usr'); add.dir('/usr/bin');
    file('/usr/bin/certbot', '', 0o755);
    add.dir('/etc/letsencrypt'); add.dir('/etc/letsencrypt/live', 0o700); add.dir('/etc/letsencrypt/archive', 0o700); add.dir('/etc/letsencrypt/renewal');
    add.dir('/etc/letsencrypt/renewal-hooks'); add.dir('/etc/letsencrypt/renewal-hooks/deploy');
    add.dir('/var'); add.dir('/var/log'); add.dir('/var/log/letsencrypt', 0o700);
    if (m.certbot.account) {
      add.dir('/etc/letsencrypt/accounts', 0o700); add.dir('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org'); add.dir('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory');
      file('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/a2f7c3d1e9b84a6f8c0d5e7b1a3c9f42/regr.json', '{"body": {}, "uri": "https://acme-v02.api.letsencrypt.org/acme/acct/2734146513"}\n');
    }
    const lineage = certbotFiles(m.host ?? m.id, m.certbot.lifetime ?? 90, (m.certbot.certificates ?? []).map(c => ({ ...c, issued: parseTime(c.issued) ?? now })));
    for (const [path, node] of [...lineage].sort(([a], [b]) => a < b ? -1 : 1)) {
      if (node.kind === 'dir') add.dir(path, node.mode);
      else if (node.kind === 'link') link(path, node.target ?? '');
      else file(path, node.content ?? '', node.mode);
    }
    add.dir('/usr/lib'); add.dir('/usr/lib/systemd'); add.dir('/usr/lib/systemd/system');
    file('/usr/lib/systemd/system/certbot.service', CERTBOT_SERVICE);
    file('/usr/lib/systemd/system/certbot.timer', CERTBOT_TIMER);
    if (m.certbot.timer !== false) link('/etc/systemd/system/timers.target.wants/certbot.timer', '/usr/lib/systemd/system/certbot.timer');
  }
  if (!lv.nginx || m.nginx === undefined) return;
  ['/etc/nginx', '/etc/nginx/conf.d', '/etc/nginx/modules-enabled', '/etc/nginx/sites-available', '/etc/nginx/sites-enabled', '/etc/nginx/snippets'].forEach(d => add.dir(d));
  file('/etc/nginx/nginx.conf', NGINX_CONF_TEXT);
  file('/etc/nginx/mime.types', MIME_TYPES);
  file('/etc/nginx/sites-available/default', DEFAULT_SITE);
  // The default site is enabled unless the lesson lists its own sites-enabled entries.
  if (!(m.files.some(f => f.path.startsWith('/etc/nginx/sites-enabled/')))) link('/etc/nginx/sites-enabled/default', '/etc/nginx/sites-available/default');
  add.dir('/var'); add.dir('/var/www'); add.dir('/var/www/html');
  file('/var/www/html/index.nginx-debian.html', NGINX_WELCOME);
  add.dir('/var/log'); add.dir('/var/log/nginx', 0o755, 'adm');
  file('/var/log/nginx/access.log', '', 0o640, 'www-data', 'adm');
  file('/var/log/nginx/error.log', '', 0o640, 'www-data', 'adm');
  add.dir('/usr'); add.dir('/usr/sbin');
  file('/usr/sbin/nginx', '', 0o755);
  add.dir('/usr/lib'); add.dir('/usr/lib/systemd'); add.dir('/usr/lib/systemd/system');
  file('/usr/lib/systemd/system/nginx.service', NGINX_UNIT);
  link('/etc/systemd/system/multi-user.target.wants/nginx.service', '/usr/lib/systemd/system/nginx.service');
  if (!programs.some(p => p.path === '/usr/sbin/nginx')) programs.push({ path: '/usr/sbin/nginx', title: NGINX_MASTER, rss: 9856, vsz: 55316, hup: 'reload' });
  if (procs.some(p => commOf(p.command) === 'nginx') || services.some(s => s.unit === 'nginx.service')) return;
  if (m.nginx === 'stopped') services.push({ unit: 'nginx.service', active: 'inactive' });
  else procs.push({ pid: pidFrom(812), user: 'root', command: NGINX_MASTER, stat: 'Ss', rss: 9856, vsz: 55316, unit: 'nginx.service', hup: 'reload' });
}

/** The E13–E14 parts of a machine's state: certbot's settings, nginx's applied configuration (when it runs). */
export function webState(m: TerminalMachine, state: FsState, lv: WebLevels): FsState {
  if (!lv.tls) return state;
  let next = m.certbot ? { ...state, tls: { lifetime: m.certbot.lifetime ?? 90, orders: 0 } } : state;
  if (lv.nginx && m.nginx !== undefined) {
    next = { ...next, nginx: { connections: 0 } };
    if (masterOf(next)) { const t = testConfig(next); if ('conf' in t) next = applyConfig(next, t.conf, true); }
  }
  return next;
}

const LINE = (max: number) => (t: unknown) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const normalized = (path: unknown) => typeof path === 'string' && path.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, path) === path;
const DNS_NAME = /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** E13–E14: the problems of a machine's TLS, certbot and nginx data (pool: the lesson's certificates). */
export function webProblems(m: TerminalMachine, lv: WebLevels): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const listens = [...(m.processes ?? []).flatMap(p => p.listen ?? []), ...(m.programs ?? []).flatMap(p => p.listen ?? [])];
  const routes = (m.responders ?? []).flatMap(r => r.routes);
  if (!lv.tls && (m.certificates !== undefined || m.trust !== undefined || m.certbot !== undefined || listens.some(l => l.tls !== undefined) || routes.some(r => r.root !== undefined)))
    fail('certificates, trust, certbot, listen.tls and a route root need the tls profile (engine stage E13)');
  if (!lv.nginx && m.nginx !== undefined) fail('nginx needs the nginx profile (engine stage E14)');
  if (listens.some(l => l.nginx !== undefined || l.ssl !== undefined)) fail('listen.nginx and listen.ssl are set by the engine (from the nginx configuration), not by lessons');
  if (problems.length || !lv.tls) return problems;
  const pool = certPool(m), own = m.certificates ?? [];
  if (own.length > 12) fail('at most 12 certificates');
  const ids = new Set<string>([...Object.keys(builtin()), ...pool.map(d => d.id)]);
  for (const d of own) if (d.id in builtin() || pool.filter(p => p.id === d.id).length > 1) fail(`certificate ${d.id}: the id is used twice in the lesson (or is a built-in CA)`);
  const now = parseTime(m.now ?? DEFAULT_NOW) ?? 0, built = buildCerts(pool, now);
  for (const d of own) {
    const at = `certificate ${d.id}`;
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(d.id)) fail(`${at}: needs an id of a-z, 0-9 and -`);
    if (!LINE(253)(d.cn)) fail(`${at}: cn needs 1..253 characters on one line`);
    if ((d.sans ?? []).some(s => !DNS_NAME.test(s)) || (d.sans ?? []).length > 20) fail(`${at}: sans must be at most 20 DNS names (a wildcard *.x is allowed)`);
    if (d.org !== undefined && !LINE(64)(d.org)) fail(`${at}: org needs 1..64 characters on one line`);
    for (const p of [d.path, d.key]) if (p !== undefined && !normalized(p)) fail(`${at}: ${p} is not an absolute, normalized path`);
    if (d.key !== undefined && d.key === d.path) fail(`${at}: the key and the certificate need different files`);
    if (d.issuer !== undefined && (d.issuer === d.id || !ids.has(d.issuer))) fail(`${at}: unknown issuer ${d.issuer}`);
    else if (d.issuer !== undefined && !built.get(d.issuer)?.ca) fail(`${at}: its issuer ${d.issuer} is not a CA (ca: true)`);
    if (!built.has(d.id) && d.issuer !== undefined && ids.has(d.issuer)) fail(`${at}: its issuers form a cycle`);
    for (const c of d.chain ?? []) if (!ids.has(c)) fail(`${at}: unknown chain certificate ${c}`);
    if (d.notBefore !== undefined && parseTime(d.notBefore) === undefined) fail(`${at}: notBefore must be YYYY-MM-DD HH:MM:SS`);
    if (d.notAfter !== undefined && parseTime(d.notAfter) === undefined) fail(`${at}: notAfter must be YYYY-MM-DD HH:MM:SS`);
    const c = built.get(d.id);
    if (c && c.notAfter <= c.notBefore) fail(`${at}: notAfter must be after notBefore`);
    if (d.days !== undefined && !whole(d.days, 1, 36500)) fail(`${at}: days must be 1..36500`);
    if (d.keyType !== undefined && !KEY_TYPES.includes(d.keyType)) fail(`${at}: keyType must be one of ${KEY_TYPES.join(', ')}`);
    if (d.serial !== undefined && !/^([0-9a-fA-F]{2}){1,20}$/.test(d.serial)) fail(`${at}: serial must be 1..20 bytes of hex`);
  }
  for (const t of m.trust ?? []) if (!ids.has(t) || !built.get(t)?.ca) fail(`trust ${t}: not a CA certificate of the lesson`);
  if (m.certbot) {
    const cb = m.certbot;
    if (cb.lifetime !== undefined && !whole(cb.lifetime, 1, 3650)) fail('certbot lifetime must be 1..3650 days');
    if ((cb.certificates ?? []).length > 4) fail('at most 4 certbot certificates');
    for (const c of cb.certificates ?? []) {
      const at = `certbot certificate ${c.domains?.[0] ?? '?'}`, t = parseTime(c.issued ?? '');
      if (!Array.isArray(c.domains) || !c.domains.length || c.domains.some(d => !DNS_NAME.test(d) || d.startsWith('*'))) fail(`${at}: needs domains (DNS names without wildcards)`);
      if (t === undefined || t > now) fail(`${at}: issued must be a time YYYY-MM-DD HH:MM:SS not after now`);
      if (c.webroot !== undefined && !normalized(c.webroot)) fail(`${at}: webroot must be an absolute, normalized path`);
      if (c.hook !== undefined && !LINE(200)(c.hook)) fail(`${at}: hook needs one line`);
    }
  }
  for (const l of listens) if (l.tls && (!normalized(l.tls.certificate) || !normalized(l.tls.key) || l.http === undefined)) fail(`listen ${l.port}: tls needs absolute certificate and key paths and an http responder`);
  for (const r of routes) if (r.root !== undefined && !normalized(r.root)) fail(`route ${r.path}: root must be an absolute, normalized path`);
  if (m.nginx !== undefined && m.nginx !== true && m.nginx !== 'stopped') fail('nginx must be true or stopped');
  return problems;
}

/** E13–E14: the problems of a state built from a valid machine (certificates the responders serve, nginx's configuration). */
export function webStateProblems(m: TerminalMachine, state: FsState, lv: WebLevels): string[] {
  const problems: string[] = [];
  if (!lv.tls) return problems;
  for (const p of m.processes ?? []) for (const l of p.listen ?? []) {
    if (!l.tls) continue;
    const c = readAs(state, 'root', l.tls.certificate), k = readAs(state, 'root', l.tls.key);
    if (!('text' in c) || !certsIn(c.text).length || !('text' in k)) problems.push(`process ${p.pid} listen ${l.port}: tls needs a certificate file and a key file on the machine`);
  }
  if (lv.nginx && m.nginx === true && !state.nginx?.applied) {
    const t = testConfig(state);
    problems.push(`nginx: true needs a configuration that passes nginx -t: ${'error' in t ? t.error : 'it does not start'}`);
  }
  return problems;
}

/** E13–E14: the problems of a check (lv: what the exercise's machine has; known: whether a host is a remote). */
export function webCheckProblems(c: WebCheck, lv: WebLevels, known: (host: string) => boolean): string | null {
  switch (c.kind) {
    case 'cert':
      if (!lv.tls || !normalized(c.path) || (c.host !== undefined && !known(c.host)) || [c.expiresAfter, c.expiresBefore].some(t => t !== undefined && parseTime(t) === undefined)
        || [c.name, c.valid].some(n => n !== undefined && !DNS_NAME.test(n)))
        return 'a cert check needs a tls machine (engine stage E13), an absolute path, a known host, times YYYY-MM-DD HH:MM:SS and DNS names';
      return null;
    case 'nginx':
      if (!lv.nginx || (c.host !== undefined && !known(c.host)) || (c.root !== undefined && !normalized(c.root)) || (c.port !== undefined && !whole(c.port, 1, 65535))
        || ((c.root !== undefined || c.port !== undefined || c.ssl !== undefined) && c.server === undefined) || (c.test === undefined && c.server === undefined))
        return 'an nginx check needs an nginx machine (engine stage E14), a known host, test or a server (root, port and ssl need a server)';
      return null;
  }
}

export function describeWebCheck(c: WebCheck): string {
  const on = (h?: string) => h ? `${h} 上` : '';
  switch (c.kind) {
    case 'cert': {
      const parts = [c.name ? `涵蓋 ${c.name}` : '', c.issuer ? `由 ${c.issuer} 簽發` : '', c.expiresAfter ? `在 ${c.expiresAfter} 之後才到期` : '', c.expiresBefore ? `在 ${c.expiresBefore} 之前到期` : '',
        c.valid ? `憑證鏈對 ${c.valid} 驗證成功` : ''].filter(Boolean);
      return `${on(c.host)}${c.path} 的憑證應該${parts.join('、') || '存在'}`;
    }
    case 'nginx': {
      const parts = [c.test === true ? 'nginx 的設定應該通過 nginx -t' : c.test === false ? 'nginx 的設定應該無法通過 nginx -t' : '',
        c.server ? `執行中的 nginx 應該有 server_name ${c.server} 的 server 區塊${c.port || c.ssl ? `（${[c.port ? `${c.port} 埠` : '', c.ssl ? 'TLS' : ''].filter(Boolean).join('、')}）` : ''}${c.root ? `，根目錄是 ${c.root}` : ''}` : ''].filter(Boolean);
      return `${on(c.host)}${parts.join('，')}`;
    }
  }
}

/** E13–E14 (lesson checks): why the check fails on the state after the commands (null: it holds). */
export function webFailure(c: WebCheck, end: FsState, hostState: (host: string) => FsState | undefined): string | null {
  const s = c.host ? hostState(c.host) : end;
  if (!s) return `沒有 ${c.host} 這台主機`;
  switch (c.kind) {
    case 'cert': {
      const r = readAs(s, 'root', c.path);
      if ('error' in r) return '這個檔案不存在';
      const chain = certsIn(r.text);
      if (!chain.length) return '檔案裡沒有憑證';
      const leaf = chain[0];
      if (c.name && !nameMatches(leaf, c.name)) return `它涵蓋的名稱是 ${(leaf.sans.length ? leaf.sans : [cnOf(leaf.subject) ?? '']).join('、')}`;
      if (c.issuer && cnOf(leaf.issuer) !== c.issuer) return `簽發者是 ${cnOf(leaf.issuer)}`;
      if (c.expiresAfter && !(leaf.notAfter > parseTime(c.expiresAfter)!)) return '它到期得太早';
      if (c.expiresBefore && !(leaf.notAfter < parseTime(c.expiresBefore)!)) return '它到期得太晚';
      if (c.valid) {
        const v = verifyChain(chain, trustOf(s), nowOf(s), c.valid);
        if (v.first) return `驗證失敗：${VERIFY_TEXT[v.first]}`;
      }
      return null;
    }
    case 'nginx': {
      if (c.test !== undefined) {
        const t = testConfig(s);
        if (c.test && 'error' in t) return `nginx -t 失敗：${t.error}`;
        if (!c.test && 'conf' in t) return 'nginx -t 仍然通過';
      }
      if (c.server !== undefined) {
        if (!masterOf(s) || !s.nginx?.applied) return 'nginx 沒有在執行';
        const r = servedRoot(s.nginx.applied, c.server, c.port);
        if (!r) return `執行中的設定沒有 server_name ${c.server}${c.port ? `（${c.port} 埠）` : ' '}的 server 區塊（改了設定要 reload）`;
        if (c.root !== undefined && r.root !== c.root) return `它的根目錄是 ${r.root}`;
        if (c.ssl !== undefined && r.ssl !== c.ssl) return c.ssl ? '它沒有 TLS（listen … ssl）' : '它有 TLS';
      }
      return null;
    }
  }
}
