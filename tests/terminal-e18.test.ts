import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { EDGE_PROFILE, PROXY_PROFILE, run, TUNNELS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalFile, type TerminalMachine } from '@/lib/terminal/lesson';
import { md5, storable } from '@/lib/terminal/cache';
import { CACHE_SITE, cacheMachine, cdnLaptop, edge01, origin } from './support/cdn-fixture';
import { proxyMachine } from './support/edge-fixture';

/*
 * Engine stage E18 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §23): the edge profile — time that passes with sleep, nginx's
 * proxy_cache ($upstream_cache_status MISS, HIT, EXPIRED, BYPASS, STALE, UPDATING, REVALIDATED; Cache-Control, Set-Cookie,
 * Vary; cache files and their purge), expires, Last-Modified and ETag with 304, a CDN edge (Age, X-Cache) and its purge
 * API, fail_timeout passing, curl -w's timers, the lesson data and the cache check, and the boundary with tunnels.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, EDGE_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const shop = (...commands: string[]) => session(cacheMachine, ...commands);
const status = (path: string, extra = '') => `curl -s -o /dev/null ${extra} -w "%{http_code} %header{x-cache-status}\\n" http://localhost${path}`.replace('  ', ' ');
const EDGE = '--resolve www.example.com:80:10.0.0.60';
const cdn = (...commands: string[]) => session(cdnLaptop, ...commands);
const xcache = (path: string) => `curl -s -o /dev/null -w "%{http_code} %header{x-cache} %header{age}\\n" ${EDGE} http://www.example.com${path}`;

describe('the edge profile', () => {
  it('is the tunnels profile plus caching and time (no new commands); below it nothing moves', () => {
    expect([...EDGE_PROFILE.commands].sort()).toEqual([...TUNNELS_PROFILE.commands].sort());
    expect(EDGE_PROFILE.features).toEqual([...TUNNELS_PROFILE.features!, 'edge']);
    expect(profileOf(cacheMachine)).toBe(EDGE_PROFILE);
    expect(machineProblems(cacheMachine)).toEqual([]);
    expect(machineProblems(cdnLaptop)).toEqual([]);
    // sleep moves every machine's clock from the edge profile up only.
    expect(cdn('sleep 90', 'date', xcache('/app.css')).log.slice(1).map(l => l.out[0])).toEqual(['Sun Nov 22 10:01:30 UTC 2026', '200 HIT 7290']);
    const below = { ...proxyMachine, profile: 'proxy' as const };
    let s = machineState(below);
    for (const c of ['sleep 90', 'date']) s = run(s, c, PROXY_PROFILE).state;
    expect(run(s, 'date', PROXY_PROFILE).lines[0].text).toBe('Sun Nov 22 10:00:00 UTC 2026');
    expect(run(machineState(below), 'curl -s -o /dev/null -w "%{time_total}" http://localhost/', PROXY_PROFILE).lines[0].text).toMatch(/^curl: 模擬環境不提供時間與速度的 --write-out 變數/);
    expect(run(machineState(below), 'sleep --help', PROXY_PROFILE).lines.join('')).not.toContain('edge');
    // The proxy profile does not know proxy_cache (E15 is unchanged); the edge fields need the edge profile.
    const proxySite: TerminalMachine = { ...cacheMachine, profile: 'proxy', nginx: 'stopped', files: cacheMachine.files.filter(f => !f.mtime) };
    expect(run(machineState(proxySite), 'sudo nginx -t', PROXY_PROFILE).lines[0].text).toBe('nginx: [emerg] unknown directive "proxy_cache_path" in /etc/nginx/sites-enabled/shop:1');
    expect(machineProblems({ ...cdnLaptop, profile: 'tunnels' }).join('\n')).toContain('latency, cdnCache, a responder\'s cdn, a route\'s etag, lastModified and purge, and a file\'s mtime need the edge profile (engine stage E18)');
  });
  it('sleep adds its operands up (s, m, h, d), a background sleep does not move the clock, and help says what sleep does', () => {
    expect(cdn('sleep 1m 30', 'date').last.out).toEqual(['Sun Nov 22 10:01:30 UTC 2026']);
    expect(cdn('sleep 300 &', 'date').last.out).toEqual(['Sun Nov 22 10:00:00 UTC 2026']);
    expect(cdn('sleep 400d').last.err).toEqual(['sleep：模擬環境一次最多前進 366 天']);
    expect(cdn('sleep --help').last.out[2]).toMatch(/^從 edge 階段起，sleep 讓模擬的時鐘前進/);
  });
});

describe('nginx proxy_cache', () => {
  it('MISS, then HIT until proxy_cache_valid or max-age runs out (EXPIRED); a bypass header goes to the upstream', () => {
    const r = shop(status('/app.css'), status('/app.css'), 'sleep 59', status('/app.css'), 'sleep 2', status('/app.css'), status('/app.css', '-H "X-Nocache: 1"'), status('/news'), 'sleep 10', status('/news')).log;
    expect([0, 1, 3, 5, 6, 7, 9].map(i => r[i].out[0])).toEqual(['200 MISS', '200 HIT', '200 HIT', '200 EXPIRED', '200 BYPASS', '200 MISS', '200 EXPIRED']);
  });
  it('the cached response keeps the upstream\'s headers; nginx sends its own Date', () => {
    const r = shop('curl -sI http://localhost/app.css', 'sleep 30', 'curl -sI http://localhost/app.css').log;
    expect(r[2].out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:30 GMT', 'Content-Type: text/css', 'Content-Length: 17', 'Connection: keep-alive',
      'Cache-Control: max-age=60', 'ETag: "0039f1580d218c9f"', 'X-Cache-Status: HIT', '']);
  });
  it('does not keep what Set-Cookie, Cache-Control: private or no-store forbid; Vary keys the variants', () => {
    const r = shop(status('/account'), status('/account'), status('/private'), status('/private'), status('/vary', '-H "Accept-Encoding: gzip"'), status('/vary', '-H "Accept-Encoding: gzip"'), status('/vary')).log;
    expect(r.map(l => l.out[0])).toEqual(['200 MISS', '200 MISS', '200 MISS', '200 MISS', '200 MISS', '200 HIT', '200 MISS']);
    expect(storable({ status: 200, reason: 'OK', headers: [['Cache-Control', 'no-store']], body: '', close: false }, 0)).toEqual({ store: false, why: 'Cache-Control: no-store' });
    expect(storable({ status: 200, reason: 'OK', headers: [['Cache-Control', 'max-age=0, s-maxage=120']], body: '', close: false }, 0)).toEqual({ store: true, ttl: 120 });
    expect(storable({ status: 200, reason: 'OK', headers: [['Date', 'Sun, 22 Nov 2026 10:00:00 GMT'], ['Expires', 'Sun, 22 Nov 2026 11:00:00 GMT']], body: '', close: false }, 0)).toEqual({ store: true, ttl: 3600 });
  });
  it('writes the cache files under levels=1:2 with the MD5 of the key; deleting them (as root) is the purge', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    const key = 'http127.0.0.1:3000/app.css', h = md5(key);
    const r = shop(status('/app.css'), 'sudo grep -r "KEY:" /var/cache/nginx/app', 'sudo ls -l /var/cache/nginx', 'sudo rm -rf /var/cache/nginx/app/*', status('/app.css'),
      "sudo bash -c 'rm -rf /var/cache/nginx/app/*'", status('/app.css')).log;
    expect(r[1].out).toEqual([`/var/cache/nginx/app/${h.slice(-1)}/${h.slice(-3, -1)}/${h}:KEY: ${key}`]);
    expect(r[2].out.at(-1)).toBe('drwx------ www-data www-data  4096 app/');
    // The learner's shell expands the * before sudo: it cannot read the folder, so nothing is removed (as on a real server).
    expect(r[4].out).toEqual(['200 HIT']);
    expect(r[6].out).toEqual(['200 MISS']);
  });
  it('serves the stale copy when the upstream is down (proxy_cache_use_stale error), and STALE / UPDATING with a background update', () => {
    const r = shop(status('/app.css'), 'sleep 61', 'sudo kill 950', status('/app.css'), status('/news'), 'sudo tail -n 1 /var/log/nginx/error.log').log;
    expect(r[3].out).toEqual(['200 STALE']);
    expect(r[4].out).toEqual(['502 MISS']);
    expect(r[5].out[0]).toContain('connect() failed (111: Connection refused) while connecting to upstream');
    // /bg/ takes 3 s at the upstream: the refresh is ready 3 s after the stale answer; meanwhile UPDATING.
    const bg = shop(status('/bg/r'), 'sleep 6', 'curl -s -o /dev/null -w "%header{x-cache-status} %{time_total}\\n" http://localhost/bg/r', 'sleep 1', status('/bg/r'), 'sleep 2', status('/bg/r')).log;
    expect([0, 2, 4, 6].map(i => bg[i].out[0])).toEqual(['200 MISS', 'STALE 0.000390', '200 UPDATING', '200 HIT']);
  });
  it('revalidates with the stored ETag (REVALIDATED) and stores only after proxy_cache_min_uses requests; expires replaces the upstream\'s Cache-Control', () => {
    const r = shop(status('/reval/p'), 'sleep 6', 'curl -si http://localhost/reval/p', status('/reval/p'), status('/long/a'), status('/long/a'), 'curl -sI http://localhost/long/a').log;
    expect(r[2].out.slice(-4)).toEqual(['ETag: "v1"', 'X-Cache-Status: REVALIDATED', '', 'price list']);
    expect(r[3].out).toEqual(['200 HIT']);
    expect([r[4].out[0], r[5].out[0]]).toEqual(['200 MISS', '200 MISS']);
    expect(r[6].out.slice(5)).toEqual(['Connection: keep-alive', 'Expires: Tue, 22 Dec 2026 10:00:06 GMT', 'Cache-Control: max-age=2592000', 'X-Cache-Status: HIT', '']);
  });
  it('drops entries not used for `inactive` (the cache manager)', () => {
    expect(shop(status('/app.css'), 'sleep 601', 'sudo kill 950', status('/app.css')).last.out).toEqual(['502 MISS']);
  });
  it('checks proxy_cache_path and proxy_cache as nginx does', () => {
    const withSite = (text: string): TerminalMachine => ({ ...cacheMachine, nginx: 'stopped', files: cacheMachine.files.map(f => f.path === '/etc/nginx/sites-available/shop' ? file(f.path, text) : f) });
    const t = (text: string) => session(withSite(text), 'sudo nginx -t').last.err[0];
    expect(t(CACHE_SITE.replace('keys_zone=app:10m', 'keys_zone=app:10m levels=1:3'))).toBe('nginx: [emerg] invalid "levels" "1:3" in /etc/nginx/sites-enabled/shop:1');
    expect(t(CACHE_SITE.replace(' keys_zone=app:10m', ''))).toBe('nginx: [emerg] "proxy_cache_path" must have "keys_zone" parameter in /etc/nginx/sites-enabled/shop:1');
    expect(t(CACHE_SITE.replace('/var/cache/nginx/app', '/srv/none/app'))).toBe('nginx: [emerg] mkdir() "/srv/none/app" failed (2: No such file or directory)');
    expect(t(CACHE_SITE.replace('proxy_cache app;', 'proxy_cache static;'))).toBe('nginx: [emerg] "proxy_cache" zone "static" is unknown in /etc/nginx/sites-enabled/shop:14');
    expect(t(CACHE_SITE.replace('proxy_cache_valid 200 10s;', 'proxy_cache_valid 200 ten;'))).toBe('nginx: [emerg] invalid time value "ten" in "proxy_cache_valid" directive in /etc/nginx/sites-enabled/shop:15');
    expect(t(CACHE_SITE.replace('expires 1h;', 'expires soon;'))).toBe('nginx: [emerg] invalid value "soon" in /etc/nginx/sites-enabled/shop:9');
  });
});

describe('static files: Last-Modified, ETag, expires and 304', () => {
  it('sends the validators and answers a matching conditional request with 304 (if_modified_since exact)', () => {
    const r = shop('curl -sI http://localhost/static/logo.svg', 'curl -sI -H \'If-None-Match: "6afffe00-7"\' http://localhost/static/logo.svg',
      'curl -s -o /dev/null -w "%{http_code}" -H "If-Modified-Since: Fri, 20 Nov 2026 08:00:01 GMT" http://localhost/static/logo.svg').log;
    expect(r[0].out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: image/svg+xml', 'Content-Length: 7',
      'Last-Modified: Fri, 20 Nov 2026 08:00:00 GMT', 'Connection: keep-alive', 'ETag: "6afffe00-7"', 'Expires: Sun, 22 Nov 2026 11:00:00 GMT', 'Cache-Control: max-age=3600', 'X-Static: yes', 'Accept-Ranges: bytes', '']);
    expect(r[1].out).toEqual(['HTTP/1.1 304 Not Modified', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Last-Modified: Fri, 20 Nov 2026 08:00:00 GMT',
      'Connection: keep-alive', 'ETag: "6afffe00-7"', 'Expires: Sun, 22 Nov 2026 11:00:00 GMT', 'Cache-Control: max-age=3600', 'X-Static: yes', '']);
    expect(r[2].out).toEqual(['200']);
  });
  it('a file changed (or touched) now gets a new Last-Modified and ETag', () => {
    const r = shop('sleep 60', "echo '<svg></svg>' | sudo tee /srv/static/static/logo.svg > /dev/null", 'curl -sI http://localhost/static/logo.svg', 'sleep 60', 'sudo touch /srv/static/static/logo.svg', 'curl -sI http://localhost/static/logo.svg').log;
    expect(r[2].out.slice(5, 8)).toEqual(['Last-Modified: Sun, 22 Nov 2026 10:01:00 GMT', 'Connection: keep-alive', 'ETag: "6b02bd5c-c"']);
    expect(r[5].out[5]).toBe('Last-Modified: Sun, 22 Nov 2026 10:02:00 GMT');
  });
});

describe('the CDN edge', () => {
  it('answers from its cache with Age and X-Cache: HIT, keeping the origin\'s Date; a miss goes to the origin', () => {
    const r = cdn(`curl -sI ${EDGE} http://www.example.com/app.css`, xcache('/app.v2.css'), xcache('/app.v2.css'), 'sleep 100', xcache('/app.v2.css')).log;
    expect(r[0].out).toEqual(['HTTP/1.1 200 OK', 'Date: Sun, 22 Nov 2026 08:00:00 GMT', 'Content-Type: text/css', 'Content-Length: 16', 'Cache-Control: public, max-age=86400', 'Connection: keep-alive',
      'Age: 7200', 'X-Cache: HIT', '']);
    expect([r[1], r[2], r[4]].map(l => l.out[0])).toEqual(['200 MISS 0', '200 HIT 0', '200 HIT 100']);
  });
  it('follows the origin\'s Cache-Control (no-store, s-maxage), its default TTL for the rest, and conditional requests', () => {
    const r = cdn(xcache('/api/cart'), xcache('/api/cart'), xcache('/shared'), xcache('/shared'), 'sleep 121', xcache('/shared'), xcache('/logo.png'), xcache('/logo.png'),
      `curl -s -o /dev/null -w "%{http_code}" -H 'If-None-Match: "9319f20146705f98"' ${EDGE} http://www.example.com/index.html`, `curl -s -o /dev/null -w "%{http_code}" -H 'If-None-Match: "9319f20146705f98"' ${EDGE} http://www.example.com/index.html`).log;
    expect(r.filter((_, i) => i !== 4).map(l => l.out[0])).toEqual(['200 MISS 0', '200 MISS 0', '200 MISS 0', '200 HIT 0', '200 MISS 0', '200 MISS 0', '200 HIT 0', '304', '304']);
  });
  it('the purge API (a fictional generic one) needs its token and removes the URL from the edge', () => {
    const r = cdn('curl -s -X POST http://cdn-api/purge -d "url=http://www.example.com/app.css"', 'curl -s -X POST -H "Authorization: Bearer demo-token" http://cdn-api/purge',
      'curl -s -X POST -H "Authorization: Bearer demo-token" http://cdn-api/purge -d "url=http://www.example.com/app.css"', `curl -s ${EDGE} -o /dev/null -w "%{http_code} %header{x-cache}" http://www.example.com/app.css`,
      `curl -s ${EDGE} http://www.example.com/app.v2.css`, 'curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" http://cdn-api/purge -d \'{"all":true}\'').log;
    expect(r.map(l => l.out[0])).toEqual(['{"error":"unauthorized"}', '{"error":"missing url"}', '{"status":"ok","purged":1}', '404 MISS', 'body{color:#000}', '{"status":"ok","purged":2}']);
  });
});

describe('time', () => {
  it('curl -w\'s timers come from the latencies: a name, the connection (one round trip), the first byte (the origin behind the edge)', () => {
    const r = cdn(`curl -s -o /dev/null -w "%{time_namelookup} %{time_connect} %{time_appconnect} %{time_pretransfer} %{time_starttransfer} %{time_total} %{speed_download}" ${EDGE} http://www.example.com/app.v2.css`,
      `curl -s -o /dev/null -w "%{time_connect} %{time_starttransfer}" ${EDGE} http://www.example.com/app.v2.css`, 'curl -s -o /dev/null -w "%{time_namelookup} %{time_connect} %{time_total}" http://origin-01/app.v2.css').log;
    expect(r[0].out).toEqual(['0.000012 0.006012 0.000000 0.006062 0.076062 0.076142 223']);
    expect(r[1].out).toEqual(['0.006012 0.012062']);
    expect(r[2].out).toEqual(['0.000180 0.062180 0.124310']);
  });
  it('fail_timeout passes with the clock: a failed upstream server is tried again (below the edge profile, only a reload does that)', () => {
    const site = 'upstream backend {\n    server 10.0.0.21:8080 max_fails=1 fail_timeout=30s;\n    server 10.0.0.22:8080;\n}\nserver {\n    listen 80 default_server;\n    location / { proxy_pass http://backend; add_header X-Upstream $upstream_addr; }\n}\n';
    const m: TerminalMachine = { ...proxyMachine, profile: 'edge', files: proxyMachine.files.map(f => f.path === '/etc/nginx/sites-available/app' ? file(f.path, site) : f),
      remotes: proxyMachine.remotes!.map(x => x.host === 'app-01' ? { ...x, processes: [] } : x) };
    const up = 'curl -s -o /dev/null -w "%header{x-upstream}\\n" http://localhost/';
    // After fail_timeout the server is usable again, with its effective weight recovering (nginx's smooth round robin), so it is tried again on the next turn.
    const r = session(m, up, up, up, 'sleep 31', up, up, up).log;
    expect(r.map(l => l.out[0])).toEqual(['10.0.0.21:8080, 10.0.0.22:8080', '10.0.0.22:8080', '10.0.0.22:8080', undefined, '10.0.0.22:8080', '10.0.0.22:8080', '10.0.0.21:8080, 10.0.0.22:8080']);
    const below: TerminalMachine = { ...m, profile: 'tunnels' };
    let st = machineState(below);
    for (const c of [up, 'sleep 31', up, up, up, up]) st = run(st, c, TUNNELS_PROFILE).state;
    expect(run(st, up, TUNNELS_PROFILE).lines[0].text).toBe('10.0.0.22:8080');
  });
});

describe('lesson data and checks', () => {
  it('validates the edge fields', () => {
    const bad = (m: Partial<TerminalMachine>) => machineProblems({ ...cdnLaptop, ...m }).join('\n');
    expect(bad({ latency: -1 })).toContain('latency must be 0..1000 ms');
    expect(bad({ remotes: [{ ...edge01, responders: [{ id: 'edge', cdn: { origin: 'origin 01' }, routes: [] }] }, origin] })).toContain('cdn needs an origin');
    expect(bad({ remotes: [{ ...edge01, cdnCache: [{ responder: 'nope', entries: [] }] }, origin] })).toContain('cdnCache nope: not a cdn responder of the machine');
    expect(bad({ remotes: [edge01, { ...origin, responders: [{ id: 'origin', routes: [{ path: '/x', etag: 'v1' as unknown as true }] }] }] })).toContain('etag is true or a quoted entity tag');
    expect(bad({ remotes: [edge01, { ...origin, responders: [{ id: 'origin', routes: [{ path: '/purge', purge: { edges: ['nowhere'] } }] }] }] })).toContain('purge needs 1..8 edges, machines of the lesson');
    expect(machineProblems({ ...cacheMachine, files: [...cacheMachine.files, { ...file('/home/learner/a', 'x', 'learner'), mtime: '2027-01-01 00:00:00' }] }).join('\n')).toContain('mtime is for files, a time YYYY-MM-DD HH:MM:SS not after now');
  });
  it('the cache check reads what the next GET would get; http checks may send headers and require more of them', () => {
    const x: TerminalExercise = {
      id: 'warm', title: '暖快取', machine: 'web-cache', statement: '讓 /app.css 進入快取。', checks: [{ kind: 'cache', url: 'http://localhost/app.css', status: 'HIT', headers: [['Cache-Control', 'max-age=60']] }],
      solution: ['curl -s -o /dev/null http://localhost/app.css'], mistakes: [{ commands: ['curl -s -o /dev/null http://localhost/account'], why: '別的網址' }], hints: ['curl'], explanation: '第一次 MISS 之後就在快取裡。',
    };
    expect(terminalContentProblems({ machines: [cacheMachine], examples: [], exercises: [x] })).toEqual([]);
    expect(checkTerminalExercise(x, [cacheMachine], []).results[0].message).toBe('再 GET 一次 http://localhost/app.css 時，快取的狀態是 HIT、標頭 Cache-Control: max-age=60，但快取的狀態是 MISS');
    const conditional: TerminalExercise = { ...x, id: 'cond', checks: [{ kind: 'http', url: 'http://localhost/static/logo.svg', status: 304, requestHeaders: [['If-Modified-Since', 'Sun, 22 Nov 2026 10:00:00 GMT']], headers: [['ETag', '"6b02bd20-6"']] }],
      solution: ["echo '<svg>' | sudo tee /srv/static/static/logo.svg"], mistakes: [{ commands: ['true'], why: '沒有改檔案' }] };
    expect(terminalContentProblems({ machines: [cacheMachine], examples: [], exercises: [conditional] })).toEqual([]);
    const low: TerminalMachine = { ...proxyMachine, profile: 'tunnels' };
    expect(terminalContentProblems({ machines: [low], examples: [], exercises: [{ ...conditional, machine: 'web-06' }, { ...x, machine: 'web-06' }] }).join('\n'))
      .toMatch(/headers and requestHeaders of an http check need an edge machine[\s\S]*a cache check needs an edge machine/);
  });
});
