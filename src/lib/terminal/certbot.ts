import { baseName, childrenOf, physicalPath, type FsNode, type FsState } from './fs';
import { DAY, isoText, type Seconds } from './clock';
import { clockOf } from './processes';
import { dnsValues } from './dns';
import { reach, type NetIo, type NetResult } from './sockets';
import { findResponder, fileReader, parseUrl, respond, tlsServer, upstreamOf, type Request, type Response } from './http';
import { masterOf, nginxServe, plainOnTls, readerOf, testConfig, applyConfig, NGINX_CONF, parseConfig, ConfError, type Dir } from './nginx';
import { certPem, certsIn, keyPem, leIssuer, serialFrom, skiOf, readAs, type Cert, type KeyType } from './tls';
import { base64, sha256 } from './ssh';

/*
 * Engine stage E13 (SRV0_SERVER_CAPABILITY.md §11.4): certbot 2.9.0 against a simulated Let's Encrypt. The HTTP-01
 * challenge is what really happens on the wire: certbot writes the token file under the webroot (or, with --nginx, lets
 * nginx answer it), and the CA — from the internet, so through the authoritative DNS data without this machine's
 * /etc/hosts or resolver cache — fetches http://name/.well-known/acme-challenge/TOKEN on port 80 (following redirects, also
 * to https without checking the certificate) and compares the body with the key authorization. Its problems are
 * Let's Encrypt's (dns, connection, unauthorized). A certificate it issues chains to R11 and ISRG Root X1, lives for the
 * lesson's lifetime (default 90 days), and is saved as certbot does: archive/NAME/cert1.pem…, live/NAME/*.pem links, and
 * renewal/NAME.conf, which `certbot renew` reads (due 30 days before expiry, --dry-run simulates every one).
 */

export const CERTBOT_VERSION = '2.9.0';
const LE = '/etc/letsencrypt', CA_ADDRESS = '66.133.109.36', ACCOUNT_ID = 'a2f7c3d1e9b84a6f8c0d5e7b1a3c9f42';
const DASHES = '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -';
const LIVE_README = 'This directory contains your keys and certificates.\n\n`privkey.pem`  : the private key for your certificate.\n`fullchain.pem`: the certificate file used in most server software.\n`chain.pem`    : used for OCSP stapling in Nginx >=1.3.7.\n`cert.pem`     : will break many server configurations, and should not be used\n                 without reading further documentation (see link below).\n\nWARNING: DO NOT MOVE OR RENAME THESE FILES!\n         Certbot expects these files to remain in this location in order\n         to function properly!\n\nWe recommend not moving these files. For more information, see the Certbot\nUser Guide at https://certbot.eff.org/docs/using.html#where-are-my-certificates.\n';
export const OPTIONS_SSL_NGINX = '# This file contains important security parameters. If you modify this file\n# manually, Certbot will be unable to automatically provide future security\n# updates. Instead, Certbot will print and log an error message with a path to\n# the up-to-date file that you will need to refer to when manually updating\n# this file. Contents are based on https://ssl-config.mozilla.org\n\nssl_session_cache shared:le_nginx_SSL:10m;\nssl_session_timeout 1440m;\nssl_session_tickets off;\n\nssl_protocols TLSv1.2 TLSv1.3;\nssl_prefer_server_ciphers off;\n\nssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384";\n';
const DHPARAMS = '-----BEGIN DH PARAMETERS-----\nMIIBCAKCAQEA//////////+t+FRYortKmq/cViAnPTzx2LnFg84tNpWp4TZBFGQz\n+8yTnc4kmz75fS/jY2MMddj2gbICrsRhetPfHtXV/WVhJDP1H18GbtCFY2VVPe0a\n87VXE15/V8k1mE8McODmi3fipona8+/och3xWKE2rec1MKzKT0g6eXq8CrGCsyT7\nYdEIqUuyyOP7uWrat2DX9GgdT0Kj3jlN9K5W7edjcrsZCwenyO4KbXCeAvzhzffi\n7MA0BM0oNC9hkXL+nOmFg/+OTxIy7vKBg8P+OxtMb61zO7X8vC7CIAXFjvGDfRaD\nssbzSibBsu/6iGtCOGEoXJf//////////wIBAg==\n-----END DH PARAMETERS-----\n';

/** What certbot runs: the shell for deploy hooks (as root). */
export interface CertbotIo extends NetIo { hook?: (state: FsState, command: string) => { state: FsState; status: number } }

// --------------------------------------------------------------------------------------------------------- files

/** The files of a certificate lineage (version n): archive copies, live links, the renewal configuration. */
interface Lineage { name: string; domains: string[]; version: number; authenticator: 'webroot' | 'nginx'; webroot: Record<string, string>; hook?: string; keyType: KeyType }
const dirNode = (mode: number): FsNode => ({ kind: 'dir', mode, owner: 'root' });
const fileNode = (content: string, mode = 0o644): FsNode => ({ kind: 'file', mode, owner: 'root', content });
function ensureDirs(nodes: Map<string, FsNode>, path: string, mode = 0o755) {
  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) { const p = `/${parts.slice(0, i).join('/')}`; if (!nodes.has(p)) nodes.set(p, dirNode(mode)); }
}
/** The leaf Let's Encrypt issues: CN = the first name, SANs = all of them (sorted), ECDSA by default, backdated an hour. */
export function acmeCert(name: string, domains: readonly string[], version: number, issued: Seconds, lifetime: number, keyType: KeyType, seed: string): Cert {
  const notBefore = issued - 3600;
  return {
    serial: serialFrom(`${seed}/${name}/${version}`), subject: [['CN', domains[0]]], issuer: leIssuer().subject, notBefore, notAfter: notBefore + lifetime * DAY - 1,
    key: keyType, ski: skiOf(`${seed}/${name}/${version}`), aki: leIssuer().ski, sans: [...domains].sort(), ca: false,
  };
}
function renewalConf(l: Lineage): string {
  const webroots = Object.entries(l.webroot);
  return [`# renew_before_expiry = 30 days`, `version = ${CERTBOT_VERSION}`, `archive_dir = ${LE}/archive/${l.name}`, `cert = ${LE}/live/${l.name}/cert.pem`,
    `privkey = ${LE}/live/${l.name}/privkey.pem`, `chain = ${LE}/live/${l.name}/chain.pem`, `fullchain = ${LE}/live/${l.name}/fullchain.pem`, '',
    '# Options used in the renewal process', '[renewalparams]', `account = ${ACCOUNT_ID}`, `authenticator = ${l.authenticator}`,
    ...l.authenticator === 'nginx' ? ['installer = nginx'] : [`webroot_path = ${[...new Set(Object.values(l.webroot))].join(', ')},`],
    'server = https://acme-v02.api.letsencrypt.org/directory', `key_type = ${l.keyType.startsWith('ec') ? 'ecdsa' : 'rsa'}`, ...l.hook ? [`renew_hook = ${l.hook}`] : [],
    ...l.authenticator === 'webroot' && webroots.length ? ['[[webroot_map]]', ...webroots.map(([d, w]) => `${d} = ${w}`)] : [], ''].join('\n');
}
/** Writes version n of a lineage (and its links and renewal file); returns the leaf. */
export function writeLineage(nodes: Map<string, FsNode>, l: Lineage, issued: Seconds, lifetime: number, seed: string): Cert {
  const leaf = acmeCert(l.name, l.domains, l.version, issued, lifetime, l.keyType, seed);
  ensureDirs(nodes, LE);
  if (!nodes.has(`${LE}/archive`)) nodes.set(`${LE}/archive`, dirNode(0o700));
  if (!nodes.has(`${LE}/live`)) nodes.set(`${LE}/live`, dirNode(0o700));
  ensureDirs(nodes, `${LE}/renewal`);
  ensureDirs(nodes, `${LE}/archive/${l.name}`);
  ensureDirs(nodes, `${LE}/live/${l.name}`);
  const a = `${LE}/archive/${l.name}`, n = l.version, chain = certPem(leIssuer());
  nodes.set(`${a}/cert${n}.pem`, fileNode(certPem(leaf)));
  nodes.set(`${a}/chain${n}.pem`, fileNode(chain));
  nodes.set(`${a}/fullchain${n}.pem`, fileNode(certPem(leaf) + chain));
  nodes.set(`${a}/privkey${n}.pem`, fileNode(keyPem({ type: l.keyType, seed: `${seed}/${l.name}/${l.version}` }), 0o600));
  for (const f of ['cert', 'chain', 'fullchain', 'privkey']) nodes.set(`${LE}/live/${l.name}/${f}.pem`, { kind: 'link', mode: 0o777, owner: 'root', target: `../../archive/${l.name}/${f}${n}.pem` });
  if (!nodes.has(`${LE}/live/${l.name}/README`)) nodes.set(`${LE}/live/${l.name}/README`, fileNode(LIVE_README));
  if (!nodes.has(`${LE}/live/README`)) nodes.set(`${LE}/live/README`, fileNode(LIVE_README));
  nodes.set(`${LE}/renewal/${l.name}.conf`, fileNode(renewalConf(l)));
  return leaf;
}
/** The lineages of the renewal folder, read back (domains from the current certificate). */
function lineagesOf(state: FsState): { l: Lineage; leaf?: Cert }[] {
  const dir = `${LE}/renewal`, out: { l: Lineage; leaf?: Cert }[] = [];
  if (state.nodes.get(dir)?.kind !== 'dir') return out;
  for (const path of childrenOf(state.nodes, dir).filter(p => p.endsWith('.conf')).sort()) {
    const name = baseName(path).slice(0, -5), text = state.nodes.get(path)?.content ?? '';
    const get = (k: string) => new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm').exec(text)?.[1]?.trim();
    const certText = readAs(state, 'root', `${LE}/live/${name}/cert.pem`), leaf = 'text' in certText ? certsIn(certText.text)[0] : undefined;
    const version = Number(/cert(\d+)\.pem$/.exec(state.nodes.get(`${LE}/live/${name}/cert.pem`)?.target ?? '')?.[1] ?? 1);
    const webroot: Record<string, string> = {};
    const map = text.split('[[webroot_map]]')[1] ?? '';
    for (const m of map.matchAll(/^(\S+)\s*=\s*(\S+)\s*$/gm)) webroot[m[1]] = m[2];
    const def = get('webroot_path')?.replace(/,$/, '').split(',')[0]?.trim();
    const domains = leaf ? [cnOfLeaf(leaf), ...leaf.sans.filter(s => s !== cnOfLeaf(leaf))] : Object.keys(webroot);
    if (def) for (const d of domains) webroot[d] ??= def;
    out.push({ l: { name, domains, version, authenticator: get('authenticator') === 'nginx' ? 'nginx' : 'webroot', webroot, ...get('renew_hook') ? { hook: get('renew_hook') } : {}, keyType: get('key_type') === 'rsa' ? 'rsa2048' : 'ec256' }, ...leaf ? { leaf } : {} });
  }
  return out;
}
const cnOfLeaf = (c: Cert) => c.subject.find(([k]) => k === 'CN')?.[1] ?? c.sans[0];

// ---------------------------------------------------------------------------------------------- the CA's validation

type Problem = { domain: string; type: 'dns' | 'connection' | 'unauthorized'; detail: string };
/** The token of an order (deterministic) and its key authorization (token.thumbprint of the account key). */
const tokenOf = (seed: string) => base64(sha256(new TextEncoder().encode(`acme-token/${seed}`)), false).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 43);
const thumbprint = () => base64(sha256(new TextEncoder().encode(`acme-account/${ACCOUNT_ID}`)), false).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 43);
/** One GET as the CA makes it (its own address, no certificate checks, nothing kept). */
function caGet(state: FsState, address: string, url: string): Response | 'refused' | 'timeout' | 'garbage' {
  const u = parseUrl(url);
  if ('code' in u) return 'garbage';
  const reached = reach(state, address, u.port);
  if (reached.result !== 'ok') return reached.result;
  const req: Request = { method: 'GET', path: u.path, headers: [['Host', u.host], ['User-Agent', "Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"], ['Accept', '*/*']] };
  const now = clockOf(reached.host).now, https = u.scheme === 'https';
  if (https && 'plain' in tlsServer(reached, address, u.host)) return 'garbage';
  if (reached.socket.nginx && reached.host.nginx?.applied) {
    const x = { address, port: u.port, https, client: CA_ADDRESS, req, now };
    return !https && reached.socket.ssl ? plainOnTls(reached.host, x) : nginxServe(reached.host, { ...x, upstream: upstreamOf(() => state, () => {}, reached.at) }).res;
  }
  const r = findResponder(reached.host, reached.socket);
  if (!r) return 'garbage';
  return respond(r.r, req, now, fileReader(reached.host));
}
/** HTTP-01 for one name: DNS as the internet sees it, port 80, redirects followed (at most 10), the body compared. */
function validate(state: FsState, domain: string, token: string): Problem | null {
  const fresh: FsState = state.dns ? { ...state, dns: { ...state.dns, cache: [] } } : state;
  const a = dnsValues(fresh, domain, 'A');
  if (a.rcode === 'NXDOMAIN') return { domain, type: 'dns', detail: `DNS problem: NXDOMAIN looking up A for ${domain} - check that a DNS record exists for this domain` };
  if (a.rcode !== 'NOERROR') return { domain, type: 'dns', detail: `DNS problem: SERVFAIL looking up A for ${domain} - the domain's nameservers may be malfunctioning` };
  if (!a.values.length) return { domain, type: 'dns', detail: `DNS problem: looking up A for ${domain}: no valid A records found for ${domain}` };
  const address = a.values[0], first = `http://${domain}/.well-known/acme-challenge/${token}`;
  let url = first;
  for (let hop = 0; hop <= 10; hop++) {
    const u = parseUrl(url) as Exclude<ReturnType<typeof parseUrl>, { code: number }>;
    const target = u.host === domain ? address : dnsValues(fresh, u.host, 'A').values[0] ?? address;
    const r = caGet(state, target, url);
    if (r === 'timeout') return { domain, type: 'connection', detail: `${target}: Fetching ${url}: Timeout during connect (likely firewall problem)` };
    if (r === 'refused') return { domain, type: 'connection', detail: `${target}: Fetching ${url}: Connection refused` };
    if (r === 'garbage') return { domain, type: 'connection', detail: `${target}: Fetching ${url}: Connection reset by peer` };
    const location = r.headers.find(([k]) => k.toLowerCase() === 'location')?.[1];
    if (r.status >= 300 && r.status < 400 && location) { url = /^https?:\/\//.test(location) ? location : `${u.scheme}://${u.host}${location.startsWith('/') ? '' : '/'}${location}`; continue; }
    if (r.status !== 200) return { domain, type: 'unauthorized', detail: `${address}: Invalid response from ${first}: ${r.status}` };
    const expected = `${token}.${thumbprint()}`;
    if (r.body.trim() !== expected) return { domain, type: 'unauthorized', detail: `${address}: Invalid response from ${first}: ${JSON.stringify(r.body.slice(0, 60))}` };
    return null;
  }
  return { domain, type: 'connection', detail: `${address}: Fetching ${first}: Too many redirects` };
}

// ---------------------------------------------------------------------------------------------------- the command

interface Opts { sub: string; domains: string[]; webroot: Record<string, string>; authenticator?: 'webroot' | 'nginx'; nginx: boolean; dryRun: boolean; force: boolean; certName?: string; quiet: boolean; hook?: string; agree: boolean; email: boolean; keyType: KeyType; noninteractive: boolean }
function options(args: readonly string[], io: NetIo): Opts | { status: number } {
  const o: Opts = { sub: '', domains: [], webroot: {}, nginx: false, dryRun: false, force: false, quiet: false, agree: false, email: false, keyType: 'ec256', noninteractive: false };
  let currentRoot: string | undefined;
  const bad = (msg: string) => { io.err('usage: '); io.err('  certbot [SUBCOMMAND] [options] [-d DOMAIN] [-d DOMAIN] ...'); io.err(''); io.err(`certbot: error: ${msg}`); return { status: 2 }; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i], [flag, inline] = a.startsWith('--') ? a.split(/=(.*)/s, 2) as [string, string | undefined] : [a, undefined];
    const value = () => inline ?? args[++i];
    switch (flag) {
      case 'certonly': case 'renew': case 'certificates': case 'run': case 'delete': if (o.sub) return bad(`unrecognized arguments: ${a}`); o.sub = a; break;
      case '--webroot': o.authenticator = 'webroot'; break;
      case '--nginx': o.nginx = true; o.authenticator = 'nginx'; break;
      case '-w': case '--webroot-path': { const v = value(); if (!v) return bad(`argument ${flag}: expected one argument`); currentRoot = v; break; }
      case '-d': case '--domains': case '--domain': {
        const v = value();
        if (!v) return bad(`argument ${flag}: expected one argument`);
        for (const d of v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) { if (!o.domains.includes(d)) o.domains.push(d); if (currentRoot) o.webroot[d] = currentRoot; }
        break;
      }
      case '-n': case '--non-interactive': case '--noninteractive': o.noninteractive = true; break;
      case '--agree-tos': o.agree = true; break;
      case '-m': case '--email': value(); o.email = true; break;
      case '--register-unsafely-without-email': o.email = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--force-renewal': case '--renew-by-default': o.force = true; break;
      case '--keep-until-expiring': case '--keep': case '--expand': case '--redirect': case '--no-eff-email': break;
      case '--cert-name': o.certName = value(); break;
      case '-q': case '--quiet': o.quiet = true; break;
      case '--deploy-hook': case '--renew-hook': o.hook = value(); break;
      case '--key-type': { const v = value(); o.keyType = v === 'rsa' ? 'rsa2048' : 'ec256'; break; }
      case '--staging': case '--test-cert': io.err('certbot：模擬環境只有正式的 Let\'s Encrypt（測試請用 --dry-run）'); return { status: 1 };
      case '--apache': case '--standalone': case '--manual': io.err(`certbot：模擬環境只支援 --webroot 與 --nginx（${flag} 不支援）`); return { status: 1 };
      default: return bad(`unrecognized arguments: ${a}`);
    }
  }
  if (!o.sub) o.sub = 'run';
  return o;
}

/**
 * certbot certonly --webroot -w DIR -d name… | --nginx -d name… | certificates | renew [--dry-run] [--force-renewal]:
 * certbot 2.9's console messages. Only root may run it (the lock in /var/log/letsencrypt).
 */
export function certbot(state0: FsState, args: readonly string[], io: CertbotIo): NetResult {
  let state = state0;
  if (!state.tls) { io.err("Command 'certbot' not found, but can be installed with:"); io.err(''); io.err('sudo apt install certbot'); return { state, status: 127 }; }
  const parsed = options(args, io);
  if ('status' in parsed) return { state, status: parsed.status };
  const o = parsed;
  if (io.user !== 'root') {
    io.err('The following error was encountered:');
    io.err("[Errno 13] Permission denied: '/var/log/letsencrypt/.certbot.lock'");
    io.err('Either run as root, or set --config-dir, --work-dir, and --logs-dir to writeable paths.');
    return { state, status: 1 };
  }
  const say = (l: string) => { if (!o.quiet) io.out(`${l}\n`); };
  const now = clockOf(state).now, lifetime = state.tls.lifetime;
  say('Saving debug log to /var/log/letsencrypt/letsencrypt.log');
  if (o.sub === 'certificates') return certificates(state, say, now);
  if (o.sub === 'delete') { io.err('certbot：模擬環境不支援 delete（要停用憑證，從 nginx 的設定拿掉它即可）'); return { state, status: 1 }; }
  if (o.sub === 'renew') return renew(state, o, io, say, now, lifetime);
  if (o.sub === 'run' && !o.nginx) { io.err('certbot：模擬環境沒有互動輸入；certbot 不加子指令時請用 --nginx（取得並安裝憑證），或用 certonly --webroot -w 目錄 -d 網域'); return { state, status: 1 }; }
  if (!o.domains.length) { io.err('certbot：模擬環境沒有互動輸入：請用 -d 指定網域（例如 -d www.example.org）'); return { state, status: 1 }; }
  if (!o.authenticator) { io.err('certbot：模擬環境沒有互動輸入：請指定驗證方式 --webroot -w 目錄 或 --nginx'); return { state, status: 1 }; }
  if (o.authenticator === 'webroot') {
    const missing = o.domains.find(d => !o.webroot[d]);
    if (missing) { io.err(`certbot：模擬環境沒有互動輸入：請在 -d ${missing} 之前用 -w 指定它的 webroot 目錄`); return { state, status: 1 }; }
  }
  if (o.nginx && !masterOf(state)) {
    io.err('Error while running nginx -c /etc/nginx/nginx.conf -t.');
    io.err('');
    io.err('nginx: [error] open() "/run/nginx.pid" failed (2: No such file or directory)');
    io.err('The nginx plugin is not working; there may be problems with your existing configuration.');
    return { state, status: 1 };
  }
  if (!state.nodes.has(`${LE}/accounts`)) {
    if (!o.agree || !o.email) { io.err('certbot：模擬環境沒有互動輸入：第一次使用請加上 --agree-tos 與 -m 信箱（或 --register-unsafely-without-email）'); return { state, status: 1 }; }
    const nodes = new Map(state.nodes);
    ensureDirs(nodes, `${LE}/accounts/acme-v02.api.letsencrypt.org/directory/${ACCOUNT_ID}`);
    nodes.set(`${LE}/accounts`, dirNode(0o700));
    nodes.set(`${LE}/accounts/acme-v02.api.letsencrypt.org/directory/${ACCOUNT_ID}/regr.json`, fileNode(`{"body": {}, "uri": "https://acme-v02.api.letsencrypt.org/acme/acct/${parseInt(ACCOUNT_ID.slice(0, 8), 16)}"}\n`));
    state = { ...state, nodes };
    say('Account registered.');
  }
  const name = o.certName ?? o.domains[0];
  const existing = lineagesOf(state).find(x => x.l.name === name);
  const due = (leaf?: Cert) => !leaf || leaf.notAfter - now < 30 * DAY;
  if (existing && !o.force && !o.dryRun && !due(existing.leaf) && [...existing.l.domains].sort().join() === [...o.domains].sort().join()) {
    say('Certificate not yet due for renewal'); say(''); say(DASHES); say('Certificate not yet due for renewal; no action taken.'); say(DASHES);
    return { state, status: 0 };
  }
  // Fix (E15 batch): an existing lineage with the same names is renewed, as certbot says so.
  const renewing = !!existing && [...existing.l.domains].sort().join() === [...o.domains].sort().join();
  say(`${renewing ? (o.dryRun ? 'Simulating renewal of an existing certificate' : 'Renewing an existing certificate') : o.dryRun ? 'Simulating a certificate request' : 'Requesting a certificate'} for ${joinDomains(o.domains)}`);
  const lineage: Lineage = { name, domains: o.domains, version: (existing?.l.version ?? 0) + 1, authenticator: o.authenticator, webroot: o.webroot, ...o.hook ? { hook: o.hook } : {}, keyType: o.keyType };
  const v = challenge(state, lineage);
  state = v.state;
  if (v.problems.length) { problems(io, lineage.authenticator, v.problems); io.err('Some challenges have failed.'); askHelp(io); return { state, status: 1 }; }
  if (o.dryRun) { say('The dry run was successful.'); return { state, status: 0 }; }
  const nodes = new Map(state.nodes);
  const leaf = writeLineage(nodes, lineage, now, lifetime, `${state.host ?? 'logic-island'}/${state.tls!.orders}`);
  state = { ...state, nodes };
  say('');
  say('Successfully received certificate.');
  say(`Certificate is saved at: ${LE}/live/${name}/fullchain.pem`);
  say(`Key is saved at:         ${LE}/live/${name}/privkey.pem`);
  say(`This certificate expires on ${isoText(leaf.notAfter).slice(0, 10)}.`);
  say('These files will be updated when the certificate renews.');
  say('Certbot has set up a scheduled task to automatically renew this certificate in the background.');
  if (o.nginx) {
    const d = deployNginx(state, lineage, say, io);
    state = d.state;
    if (d.status) return { state, status: d.status };
  }
  if (lineage.hook) state = runHook(state, lineage.hook, io, say);
  say('');
  say(DASHES);
  say('If you like Certbot, please consider supporting our work by:');
  say(' * Donating to ISRG / Let\'s Encrypt:   https://letsencrypt.org/donate');
  say(' * Donating to EFF:                    https://eff.org/donate-le');
  say(DASHES);
  return { state, status: 0 };
}
const joinDomains = (d: readonly string[]) => d.length === 1 ? d[0] : `${d.slice(0, -1).join(', ')} and ${d.at(-1)}`;
function problems(io: NetIo, authenticator: string, list: readonly Problem[]) {
  io.err('');
  io.err(`Certbot failed to authenticate some domains (authenticator: ${authenticator}). The Certificate Authority reported these problems:`);
  for (const p of list) { io.err(`  Domain: ${p.domain}`); io.err(`  Type:   ${p.type}`); io.err(`  Detail: ${p.detail}`); io.err(''); }
  io.err(authenticator === 'webroot'
    ? 'Hint: The Certificate Authority failed to download the temporary challenge files created by Certbot. Ensure that the listed domains serve their content from the provided --webroot-path/-w and that files created there can be downloaded from the internet.'
    : 'Hint: The Certificate Authority failed to verify the temporary nginx configuration changes made by Certbot. Ensure the listed domains point to this nginx server and that it is accessible from the internet.');
  io.err('');
}
const askHelp = (io: NetIo) => io.err('Ask for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details.');

/**
 * The HTTP-01 challenges of an order: with --webroot the token files are written under each webroot (folders created as
 * needed, everything removed afterwards); with --nginx nginx answers the token itself for a server block of this machine.
 */
function challenge(state0: FsState, l: Lineage): { state: FsState; problems: Problem[] } {
  let state: FsState = { ...state0, tls: { ...state0.tls!, orders: state0.tls!.orders + 1 } };
  const out: Problem[] = [];
  for (const d of l.domains) {
    const token = tokenOf(`${state.host ?? ''}/${state.tls!.orders}/${d}`);
    if (l.authenticator === 'nginx') {
      const fresh: FsState = state.dns ? { ...state, dns: { ...state.dns, cache: [] } } : state;
      const a = dnsValues(fresh, d, 'A');
      if (a.rcode === 'NXDOMAIN') { out.push({ domain: d, type: 'dns', detail: `DNS problem: NXDOMAIN looking up A for ${d} - check that a DNS record exists for this domain` }); continue; }
      const r = a.values[0] ? reach(state, a.values[0], 80) : { result: 'timeout' as const };
      if (r.result === 'timeout') { out.push({ domain: d, type: 'connection', detail: `${a.values[0] ?? d}: Fetching http://${d}/.well-known/acme-challenge/${token}: Timeout during connect (likely firewall problem)` }); continue; }
      if (r.result === 'refused') { out.push({ domain: d, type: 'connection', detail: `${a.values[0]}: Fetching http://${d}/.well-known/acme-challenge/${token}: Connection refused` }); continue; }
      if (r.at !== 'self' || !r.socket.nginx) out.push({ domain: d, type: 'unauthorized', detail: `${a.values[0]}: Invalid response from http://${d}/.well-known/acme-challenge/${token}: 404` });
      continue;
    }
    const root = l.webroot[d];
    const w = state.nodes.get(physicalPath(state.nodes, root, true));
    if (w?.kind !== 'dir') { out.push({ domain: d, type: 'unauthorized', detail: `模擬環境：--webroot-path ${root} 不存在或不是目錄` }); continue; }
    const nodes = new Map(state.nodes), real = physicalPath(nodes, root, true), made: string[] = [];
    for (const p of [`${real}/.well-known`, `${real}/.well-known/acme-challenge`]) if (!nodes.has(p)) { nodes.set(p, dirNode(0o755)); made.push(p); }
    const file = `${real}/.well-known/acme-challenge/${token}`;
    nodes.set(file, fileNode(`${token}.${thumbprint()}`));
    const p = validate({ ...state, nodes }, d, token);
    nodes.delete(file);
    for (const m of made.reverse()) if (!childrenOf(nodes, m).length) nodes.delete(m);
    state = { ...state, nodes };
    if (p) out.push(p);
  }
  return { state, problems: out };
}

/** certbot --nginx: the server block for the name gets the certificate (listen 443 ssl…), its port 80 a redirect block; nginx reloads. */
function deployNginx(state0: FsState, l: Lineage, say: (l: string) => void, io: NetIo): { state: FsState; status: number } {
  let state = state0;
  say('');
  say('Deploying certificate');
  let parsed;
  try { parsed = parseConfig(readerOf(state), NGINX_CONF); } catch (e) { if (e instanceof ConfError) { io.err(`nginx: [emerg] ${e.message}`); return { state, status: 1 }; } throw e; }
  const nodes = new Map(state.nodes);
  if (!nodes.has(`${LE}/options-ssl-nginx.conf`)) nodes.set(`${LE}/options-ssl-nginx.conf`, fileNode(OPTIONS_SSL_NGINX));
  if (!nodes.has(`${LE}/ssl-dhparams.pem`)) nodes.set(`${LE}/ssl-dhparams.pem`, fileNode(DHPARAMS));
  // Fix (E15 batch): the names of one server block get the TLS lines once and share one redirect block.
  const http = parsed.main.find(x => x.name === 'http')?.block ?? [];
  const groups: { srv: Dir; names: string[] }[] = [];
  for (const d of l.domains) {
    const srv = http.find(s => s.name === 'server' && (s.block ?? []).some(x => x.name === 'server_name' && x.args.some(a => a.toLowerCase() === d)));
    if (!srv) {
      io.err(`Could not install certificate`);
      io.err('');
      io.err(`Could not automatically find a matching server block for ${d}. Set the \`server_name\` directive to use the Nginx installer.`);
      askHelp(io);
      return { state: { ...state, nodes }, status: 1 };
    }
    const g = groups.find(x => x.srv === srv);
    if (g) g.names.push(d); else groups.push({ srv, names: [d] });
  }
  // Later blocks of a file first, so the line numbers of the earlier ones stay right.
  for (const g of [...groups].sort((a, b) => a.srv.file === b.srv.file ? b.srv.line - a.srv.line : 0)) {
    if (!(g.srv.block ?? []).some(x => x.name === 'ssl_certificate')) {
      const real = physicalPath(nodes, g.srv.file, true), text = nodes.get(real)?.content ?? '';
      nodes.set(real, { ...nodes.get(real)!, content: installInto(text, g.srv.line, l.name, g.names) });
    }
  }
  for (const d of l.domains) say(`Successfully deployed certificate for ${d} to ${groups.find(g => g.names.includes(d))!.srv.file}`);
  state = { ...state, nodes };
  say(`Congratulations! You have successfully enabled HTTPS on ${l.domains.map(d => `https://${d}`).join(' and ')}`);
  const t = testConfig(state);
  if ('conf' in t) state = applyConfig(state, t.conf);
  return { state, status: 0 };
}
/** The text edit certbot's nginx installer makes: listen 80 lines move to a new redirect block, the TLS lines go in. */
function installInto(text: string, line: number, name: string, domains: readonly string[]): string {
  const lines = text.split('\n');
  const start = line - 1;
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    const code = lines[i].replace(/#.*/, '');
    for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } } }
    if (end >= 0) break;
  }
  if (end < 0) return text;
  const indent = /^(\s*)/.exec(lines.slice(start + 1, end).find(l => l.trim()) ?? '    ')?.[1] ?? '    ';
  const moved: string[] = [], body: string[] = [];
  for (let i = start + 1; i < end; i++) {
    if (/^\s*listen\s+(\[::\]:)?(80|[\d.]+:80)(\s+default_server)?\s*;/.test(lines[i]) && !/\bssl\b/.test(lines[i])) moved.push(lines[i].trim()); else body.push(lines[i]);
  }
  const managed = [`${indent}listen 443 ssl; # managed by Certbot`, `${indent}ssl_certificate ${LE}/live/${name}/fullchain.pem; # managed by Certbot`,
    `${indent}ssl_certificate_key ${LE}/live/${name}/privkey.pem; # managed by Certbot`, `${indent}include ${LE}/options-ssl-nginx.conf; # managed by Certbot`,
    `${indent}ssl_dhparam ${LE}/ssl-dhparams.pem; # managed by Certbot`, ''];
  // certbot adds each name's if at the top of the redirect block: the last name comes first.
  const redirect = ['server {', ...[...domains].reverse().flatMap(d => [`    if ($host = ${d}) {`, '        return 301 https://$host$request_uri;', '    } # managed by Certbot', '', '']),
    ...(moved.length ? moved : ['listen 80;']).map(l => `    ${l}`), `    server_name ${domains.join(' ')};`, '    return 404; # managed by Certbot', '', '', '}'];
  return [...lines.slice(0, start + 1), ...body, '', ...managed, lines[end], ...redirect, ...lines.slice(end + 1)].join('\n');
}

/** The executable scripts of /etc/letsencrypt/renewal-hooks/deploy, by name (certbot skips names ending in ~). */
function deployHooks(state: FsState): string[] {
  const dir = `${LE}/renewal-hooks/deploy`;
  if (state.nodes.get(dir)?.kind !== 'dir') return [];
  return childrenOf(state.nodes, dir).filter(p => { const n = state.nodes.get(p); return n?.kind === 'file' && (n.mode & 0o111) !== 0 && !p.endsWith('~'); }).sort();
}
function runHook(state: FsState, hook: string, io: CertbotIo, say: (l: string) => void): FsState {
  say(`Running deploy-hook command: ${hook}`);
  if (!io.hook) return state;
  const r = io.hook(state, hook);
  if (r.status) io.err(`Hook 'deploy-hook' reported error code ${r.status}`);
  return r.state;
}

/** certbot certificates: every lineage with its serial, key type, names, expiry (VALID: N days / INVALID: EXPIRED) and paths. */
function certificates(state: FsState, say: (l: string) => void, now: Seconds): NetResult {
  const all = lineagesOf(state);
  say('');
  say(DASHES);
  if (!all.length) { say('No certificates found.'); say(DASHES); return { state, status: 0 }; }
  say('Found the following certs:');
  for (const { l, leaf } of all) {
    say(`  Certificate Name: ${l.name}`);
    if (leaf) {
      say(`    Serial Number: ${leaf.serial.replace(/^0+/, '')}`);
      say(`    Key Type: ${leaf.key.startsWith('ec') ? 'ECDSA' : 'RSA'}`);
      say(`    Domains: ${l.domains.join(' ')}`);
      const left = Math.floor((leaf.notAfter - now) / DAY);
      say(`    Expiry Date: ${isoText(leaf.notAfter)}+00:00 (${leaf.notAfter < now ? 'INVALID: EXPIRED' : `VALID: ${left} day${left === 1 ? '' : 's'}`})`);
    }
    say(`    Certificate Path: ${LE}/live/${l.name}/fullchain.pem`);
    say(`    Private Key Path: ${LE}/live/${l.name}/privkey.pem`);
  }
  say(DASHES);
  return { state, status: 0 };
}

/** certbot renew: each lineage due within 30 days (or all with --force-renewal; --dry-run simulates every one). */
function renew(state0: FsState, o: Opts, io: CertbotIo, say: (l: string) => void, now: Seconds, lifetime: number): NetResult {
  let state = state0;
  const all = lineagesOf(state);
  if (!all.length) { say(''); say('No simulated renewals were attempted.'.replace('simulated ', o.dryRun ? 'simulated ' : '')); return { state, status: 0 }; }
  const renewed: string[] = [], failed: string[] = [], skipped: { l: Lineage; leaf?: Cert }[] = [];
  for (const x of all) {
    say('');
    say(DASHES);
    say(`Processing ${LE}/renewal/${x.l.name}.conf`);
    say(DASHES);
    const due = !x.leaf || x.leaf.notAfter - now < 30 * DAY;
    if (!due && !o.force && !o.dryRun) { say('Certificate not yet due for renewal'); skipped.push(x); continue; }
    if (!due && o.dryRun && !o.force) say('Certificate not due for renewal, but simulating renewal for dry run');
    say(`${o.dryRun ? 'Simulating renewal of an existing certificate' : 'Renewing an existing certificate'} for ${joinDomains(x.l.domains)}`);
    if (x.l.authenticator === 'nginx' && !masterOf(state)) {
      io.err('Error while running nginx -c /etc/nginx/nginx.conf -t.');
      failed.push(x.l.name);
      continue;
    }
    const v = challenge(state, x.l);
    state = v.state;
    if (v.problems.length) {
      problems(io, x.l.authenticator, v.problems);
      io.err(`Failed to renew certificate ${x.l.name} with error: Some challenges have failed.`);
      failed.push(x.l.name);
      continue;
    }
    // Fix (E15 batch): renew --deploy-hook runs (and is saved as renew_hook); the scripts of renewal-hooks/deploy run first.
    const hook = o.hook ?? x.l.hook, dirHooks = deployHooks(state);
    if (!o.dryRun) {
      const nodes = new Map(state.nodes);
      writeLineage(nodes, { ...x.l, version: x.l.version + 1, ...hook ? { hook } : {} }, now, lifetime, `${state.host ?? 'logic-island'}/${state.tls!.orders}`);
      state = { ...state, nodes };
      // The nginx installer reloads nginx; with webroot only a deploy hook does.
      if (x.l.authenticator === 'nginx') { const t = testConfig(state); if ('conf' in t) state = applyConfig(state, t.conf); }
      for (const h of dirHooks) state = runHook(state, h, io, say);
      if (hook && !dirHooks.includes(hook)) state = runHook(state, hook, io, say);
    } else for (const h of [...dirHooks, ...hook && !dirHooks.includes(hook) ? [hook] : []]) say(`Dry run: skipping deploy hook command: ${h}`);
    renewed.push(x.l.name);
  }
  say('');
  say(DASHES);
  const sim = o.dryRun ? 'simulated ' : '';
  if (skipped.length && !renewed.length && !failed.length) {
    say('The following certificates are not due for renewal yet:');
    for (const s of skipped) say(`  ${LE}/live/${s.l.name}/fullchain.pem expires on ${s.leaf ? isoText(s.leaf.notAfter).slice(0, 10) : '?'} (skipped)`);
    say('No renewals were attempted.');
    say(DASHES);
    return { state, status: 0 };
  }
  if (skipped.length) { say('The following certificates are not due for renewal yet:'); for (const s of skipped) say(`  ${LE}/live/${s.l.name}/fullchain.pem expires on ${s.leaf ? isoText(s.leaf.notAfter).slice(0, 10) : '?'} (skipped)`); }
  if (renewed.length) { say(failed.length ? `The following ${sim}renewals succeeded:` : `Congratulations, all ${sim}renewals succeeded:`); for (const n of renewed) say(`  ${LE}/live/${n}/fullchain.pem (success)`); }
  if (failed.length) {
    io.err(renewed.length ? `The following ${sim}renewals failed:` : `All ${sim}renewals failed. The following certificates could not be renewed:`);
    for (const n of failed) io.err(`  ${LE}/live/${n}/fullchain.pem (failure)`);
  }
  say(DASHES);
  if (failed.length) { io.err(`${failed.length} renew failure(s), 0 parse failure(s)`); askHelp(io); return { state, status: 1 }; }
  return { state, status: 0 };
}

/** E13 (lesson data): the files certbot would have left for an earlier certificate (machine.certbot.certificates). */
export function certbotFiles(host: string, lifetime: number, list: readonly { domains: string[]; webroot?: string; nginx?: boolean; issued: Seconds; hook?: string }[]): Map<string, FsNode> {
  const nodes = new Map<string, FsNode>();
  list.forEach((c, i) => {
    const name = c.domains[0];
    writeLineage(nodes, { name, domains: c.domains, version: 1, authenticator: c.nginx ? 'nginx' : 'webroot', webroot: c.nginx ? {} : Object.fromEntries(c.domains.map(d => [d, c.webroot ?? '/var/www/html'])), ...c.hook ? { hook: c.hook } : {}, keyType: 'ec256' },
      c.issued, lifetime, `${host}/lesson-${i}`);
  });
  return nodes;
}
