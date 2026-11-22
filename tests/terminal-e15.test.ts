import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { E14_COMMANDS, NGINX_PROFILE, PROXY_PROFILE, run } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, type TerminalExercise, type TerminalFile, type TerminalMachine } from '@/lib/terminal/lesson';
import { freshPeers, ipHashPeer, pickPeer, type UpServer, type Upstream } from '@/lib/terminal/proxy';
import { websocketAccept } from '@/lib/terminal/http';
import { proxyMachine } from './support/edge-fixture';

/*
 * Engine stage E15 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §16): the proxy profile — nginx's proxy_pass with its URI
 * rules, the headers it sends upstream (proxy_set_header, $proxy_add_x_forwarded_for, HTTP/1.0 and Connection: close by
 * default), WebSocket upgrades, 502/504 with nginx's error-log lines, upstream blocks (round robin with weights, least_conn,
 * ip_hash, backup, down, max_fails), map, the lesson data that comes with it and the boundary with the nginx profile.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, PROXY_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const file = (path: string, content: string, mode = 0o644, owner = 'root'): TerminalFile => ({ path, kind: 'file', mode, owner, content });
/** The proxy machine with its site replaced. */
const withSite = (text: string): TerminalMachine => ({ ...proxyMachine, files: proxyMachine.files.map(f => f.path === '/etc/nginx/sites-available/app' ? file(f.path, text) : f) });
const site = (locations: string, upstreams = '') => `${upstreams}server {\n    listen 80 default_server;\n${locations}}\n`;
const app = (...commands: string[]) => session(proxyMachine, ...commands);

describe('the proxy profile', () => {
  it('is the nginx profile plus proxying (no new commands); the nginx profile still refuses proxy_pass', () => {
    expect([...PROXY_PROFILE.commands].sort()).toEqual([...NGINX_PROFILE.commands].sort());
    expect(PROXY_PROFILE.features).toEqual([...NGINX_PROFILE.features!, 'proxy']);
    expect(NGINX_PROFILE.commands).toEqual(expect.arrayContaining([...E14_COMMANDS]));
    expect(profileOf(proxyMachine)).toBe(PROXY_PROFILE);
    expect(machineProblems(proxyMachine)).toEqual([]);
    expect(app('sudo nginx -t').last.err).toEqual(['nginx: the configuration file /etc/nginx/nginx.conf syntax is ok', 'nginx: configuration file /etc/nginx/nginx.conf test is successful']);
    // The same machine on the nginx profile: the E14 refusal, and it cannot be a lesson machine.
    const below: TerminalMachine = { ...proxyMachine, profile: 'nginx', remotes: [], responders: [{ id: 'node', routes: [{ path: '/*', body: 'x' }] }] };
    expect(run(machineState(below), 'sudo nginx -t', NGINX_PROFILE).lines[0].text).toBe('nginx: [emerg] 模擬環境："upstream" 是反向代理的設定，在引擎階段 E15 才模擬 in /etc/nginx/sites-enabled/app:1');
    expect(machineProblems(below)).toEqual([expect.stringContaining('nginx: true needs a configuration that passes nginx -t')]);
    expect(machineProblems({ ...below, nginx: 'stopped', responders: proxyMachine.responders })).toEqual(['machine web-06: upstreamConnections and a responder\'s echo, websocket and delay need the proxy profile (engine stage E15)']);
  });
});

describe('proxy_pass: the URI and the headers sent upstream', () => {
  it('passes the request URI unchanged without a URI part, and sends Host $proxy_host, Connection: close and HTTP/1.0 by default', () => {
    expect(app('curl -s "http://localhost/plain/a%20b?x=1&y=2"').last.out).toEqual([
      'remote_addr: 127.0.0.1', 'GET /plain/a%20b?x=1&y=2 HTTP/1.0', 'Host: 127.0.0.1:3000', 'Connection: close', 'User-Agent: curl/8.5.0', 'Accept: */*']);
  });
  it('replaces the location prefix with the URI part (the trailing slash matters)', () => {
    const s = withSite(site('    location /api/ { proxy_pass http://127.0.0.1:3000/; }\n    location /v1api/ { proxy_pass http://127.0.0.1:3000/v1; }\n    location = /exact { proxy_pass http://127.0.0.1:3000/other; }\n'));
    const r = session(s, 'curl -s http://localhost/api/users?id=7', 'curl -s http://localhost/v1api/users', 'curl -s http://localhost/exact').log;
    expect(r[0].out[1]).toBe('GET /users?id=7 HTTP/1.0');
    expect(r[1].out[1]).toBe('GET /v1users HTTP/1.0');
    expect(r[2].out[1]).toBe('GET /other HTTP/1.0');
  });
  it('sends proxy_set_header first (Host $host, X-Real-IP, X-Forwarded-For appended to the client\'s, X-Forwarded-Proto), then the client\'s other headers', () => {
    expect(app('curl -s -H "X-Forwarded-For: 203.0.113.9" -A probe/1 http://localhost/hello').last.out).toEqual([
      'remote_addr: 127.0.0.1', 'GET /hello HTTP/1.0', 'Host: localhost', 'X-Real-IP: 127.0.0.1', 'X-Forwarded-For: 203.0.113.9, 127.0.0.1', 'X-Forwarded-Proto: http', 'Connection: close',
      'User-Agent: probe/1', 'Accept: */*']);
  });
  it('rewrites the upstream\'s redirect (proxy_redirect default) and keeps its Content-Length for HEAD', () => {
    expect(app('curl -sI http://localhost/login').last.out).toEqual(['HTTP/1.1 302 Moved Temporarily', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html',
      'Content-Length: 104', 'Location: http://localhost/account', 'Connection: keep-alive', '']);
    const off = withSite(site('    location / { proxy_pass http://127.0.0.1:3000; proxy_redirect off; }\n'));
    expect(session(off, 'curl -s -o /dev/null -w "%{redirect_url}" http://localhost/login').last.out).toEqual(['http://127.0.0.1:3000/account']);
  });
});

describe('WebSocket', () => {
  const upgrade = '-H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13"';
  it('computes RFC 6455\'s accept value', () => {
    expect(websocketAccept('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });
  it('switches protocols through nginx with proxy_http_version 1.1 and the Upgrade and Connection headers', () => {
    expect(app(`curl -si ${upgrade} http://localhost/ws`).last.out).toEqual(['HTTP/1.1 101 Switching Protocols', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT',
      'Connection: upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=', '']);
  });
  it('gets 426 without them: nginx speaks HTTP/1.0 upstream and drops Upgrade', () => {
    const r = app(`curl -si ${upgrade} http://localhost/ws-bare`).last.out;
    expect(r[0]).toBe('HTTP/1.1 426 Upgrade Required');
    expect(r.at(-1)).toBe('Upgrade Required');
  });
  it('works with the map of nginx\'s documentation ($connection_upgrade)', () => {
    const m = withSite(`map $http_upgrade $connection_upgrade {\n    default upgrade;\n    '' close;\n}\n${site('    location /ws {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection $connection_upgrade;\n    }\n')}`);
    expect(session(m, `curl -si ${upgrade} http://localhost/ws`).last.out[0]).toBe('HTTP/1.1 101 Switching Protocols');
    expect(session(m, 'curl -s -o /dev/null -w "%{http_code}" http://localhost/ws').last.out).toEqual(['426']);
  });
});

describe('502 and 504', () => {
  it('answers 502 when the upstream refuses, 504 when it is too slow, and writes nginx\'s error-log lines', () => {
    const r = app('curl -s -o /dev/null -w "%{http_code}\\n" http://localhost/down/x', 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost/slow', 'sudo cat /var/log/nginx/error.log', 'sudo tail -2 /var/log/nginx/access.log').log;
    expect(r[0].out).toEqual(['502']);
    expect(r[1].out).toEqual(['504']);
    expect(r[2].out).toEqual([
      '2026/11/22 10:00:00 [error] 813#813: *1 connect() failed (111: Connection refused) while connecting to upstream, client: 127.0.0.1, server: app.example.com, request: "GET /down/x HTTP/1.1", upstream: "http://127.0.0.1:3999/x", host: "localhost"',
      '2026/11/22 10:00:00 [error] 813#813: *2 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 127.0.0.1, server: app.example.com, request: "GET /slow HTTP/1.1", upstream: "http://127.0.0.1:3000/slow", host: "localhost"']);
    expect(r[3].out).toEqual(['127.0.0.1 - - [22/Nov/2026:10:00:00 +0000] "GET /down/x HTTP/1.1" 502 159 "-" "curl/8.5.0"', '127.0.0.1 - - [22/Nov/2026:10:00:00 +0000] "GET /slow HTTP/1.1" 504 169 "-" "curl/8.5.0"']);
  });
  it('times out connecting to an address no machine has, and a listener that is not HTTP closes the connection', () => {
    const s = withSite(site('    location /void { proxy_pass http://10.0.0.99:8080; proxy_connect_timeout 3s; }\n    location /ssh { proxy_pass http://10.0.0.21:22; }\n'));
    const r = session(s, 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost/void', 'curl -s -o /dev/null -w "%{http_code}\\n" http://localhost/ssh', 'sudo cat /var/log/nginx/error.log').log;
    expect([r[0].out, r[1].out]).toEqual([['504'], ['502']]);
    expect(r[2].out.map(l => l.replace(/, client.*/, ''))).toEqual(['2026/11/22 10:00:00 [error] 813#813: *1 upstream timed out (110: Connection timed out) while connecting to upstream',
      '2026/11/22 10:00:00 [error] 813#813: *2 upstream prematurely closed connection while reading response header from upstream']);
  });
  it('a slow answer within proxy_read_timeout arrives, unless curl -m gives up first', () => {
    const s = withSite(site('    location / { proxy_pass http://127.0.0.1:3000; }\n'));
    expect(session(s, 'curl -s http://localhost/slow').last.out).toEqual(['slow']);
    expect(session(s, 'curl -sS -m 5 http://localhost/slow').last.err).toEqual(['curl: (28) Operation timed out after 5000 milliseconds with 0 bytes received']);
  });
});

describe('upstream blocks', () => {
  const lb = (block: string) => withSite(site('    location / { proxy_pass http://backend; add_header X-Upstream $upstream_addr always; add_header X-Status $upstream_status always; }\n', `upstream backend {\n${block}}\n`));
  const who = (m: TerminalMachine, n: number) => session(m, ...Array.from({ length: n }, () => 'curl -s http://localhost/')).log.map(l => l.out[0]);
  it('round robin follows nginx\'s smooth weighted order', () => {
    expect(who(proxyMachine, 4).length).toBe(4);
    expect(app('curl -s http://localhost/api/', 'curl -s http://localhost/api/', 'curl -s http://localhost/api/').log.map(l => l.out[0])).toEqual(['app-01', 'app-02', 'app-01']);
    expect(who(lb('    server 10.0.0.21:8080 weight=3;\n    server 10.0.0.22:8080;\n'), 4)).toEqual(['app-01', 'app-01', 'app-02', 'app-01']);
    expect(who(lb('    server 10.0.0.21:8080 weight=5;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080;\n'), 7)).toEqual(['app-01', 'app-01', 'app-02', 'app-01', 'app-03', 'app-01', 'app-01']);
  });
  it('least_conn reads the declared active connections (connections per weight)', () => {
    const m: TerminalMachine = { ...lb('    least_conn;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080;\n'),
      upstreamConnections: [{ upstream: 'backend', server: '10.0.0.21:8080', connections: 12 }, { upstream: 'backend', server: '10.0.0.22:8080', connections: 3 }, { upstream: 'backend', server: '10.0.0.23:8080', connections: 7 }] };
    expect(machineProblems(m)).toEqual([]);
    expect(who(m, 3)).toEqual(['app-02', 'app-02', 'app-02']);
    const weighted: TerminalMachine = { ...lb('    least_conn;\n    server 10.0.0.21:8080 weight=3;\n    server 10.0.0.22:8080;\n'),
      upstreamConnections: [{ upstream: 'backend', server: '10.0.0.21:8080', connections: 8 }, { upstream: 'backend', server: '10.0.0.22:8080', connections: 3 }] };
    expect(who(weighted, 2)).toEqual(['app-01', 'app-01']);
    // Equal: round robin among the tied servers.
    expect(who(lb('    least_conn;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n'), 3)).toEqual(['app-01', 'app-02', 'app-01']);
  });
  it('ip_hash hashes the first three octets of the client (nginx\'s formula) and keeps a client on one server', () => {
    const servers = (n: number): UpServer[] => Array.from({ length: n }, (_, i) => ({ text: `s${i}`, address: `10.0.0.${21 + i}`, port: 8080, weight: 1, maxFails: 1, failTimeout: 10, backup: false, down: false }));
    // 89 → (89·113 + 127) mod 6271 = 3913 → 3199 → 4040; 4040 mod 2 = 0, 4040 mod 3 = 2.
    expect(ipHashPeer(servers(2), freshPeers(servers(2)), new Set(), '127.0.0.1')).toBe(0);
    expect(ipHashPeer(servers(3), freshPeers(servers(3)), new Set(), '127.0.0.1')).toBe(2);
    expect(ipHashPeer(servers(3), freshPeers(servers(3)), new Set(), '127.0.0.99')).toBe(2);
    expect(who(lb('    ip_hash;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080;\n'), 3)).toEqual(['app-03', 'app-03', 'app-03']);
    // A server marked down: the hash goes on (5510 mod 3 = 2 again, then 4957 mod 3 = 1).
    expect(who(lb('    ip_hash;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080 down;\n'), 2)).toEqual(['app-02', 'app-02']);
  });
  it('tries the next server on errors, marks a failed one (max_fails) until a reload, and uses backup servers last', () => {
    const m = lb('    server 10.0.0.29:8080;\n    server 127.0.0.1:3999 max_fails=2;\n    server 10.0.0.23:8080 backup;\n');
    const r = session(m, 'curl -si http://localhost/', 'curl -si http://localhost/', 'sudo cat /var/log/nginx/error.log', 'sudo systemctl reload nginx', 'curl -si http://localhost/').log;
    const header = (out: string[], name: string) => out.find(l => l.startsWith(`${name}: `))?.slice(name.length + 2);
    expect(r[0].out.at(-1)).toBe('app-03');
    expect(header(r[0].out, 'X-Upstream')).toBe('10.0.0.29:8080, 127.0.0.1:3999, 10.0.0.23:8080');
    expect(header(r[0].out, 'X-Status')).toBe('504, 502, 200');
    // The first is down (max_fails=1), the second has failed once of two: it is tried again.
    expect(header(r[1].out, 'X-Upstream')).toBe('127.0.0.1:3999, 10.0.0.23:8080');
    expect(r[2].out.map(l => l.replace(/^.*\*\d+ /, '').replace(/, client.*upstream: /, ' → '))).toEqual([
      'upstream timed out (110: Connection timed out) while connecting to upstream → "http://10.0.0.29:8080/", host: "localhost"',
      'connect() failed (111: Connection refused) while connecting to upstream → "http://127.0.0.1:3999/", host: "localhost"',
      'connect() failed (111: Connection refused) while connecting to upstream → "http://127.0.0.1:3999/", host: "localhost"']);
    expect(header(r[4].out, 'X-Upstream')).toBe('10.0.0.29:8080, 127.0.0.1:3999, 10.0.0.23:8080');
  });
  it('answers 502 "no live upstreams" when every server is down', () => {
    const r = session(lb('    server 10.0.0.21:8080 down;\n    server 10.0.0.22:8080 down;\n'), 'curl -s -o /dev/null -w "%{http_code}" http://localhost/x', 'sudo cat /var/log/nginx/error.log').log;
    expect(r[0].out).toEqual(['502']);
    expect(r[1].out).toEqual(['2026/11/22 10:00:00 [error] 813#813: *1 no live upstreams while connecting to upstream, client: 127.0.0.1, server: , request: "GET /x HTTP/1.1", upstream: "http://backend/x", host: "localhost"']);
  });
  it('picks peers like nginx in pure form too (backup only when the primaries are gone)', () => {
    const up: Upstream = { name: 'b', method: 'round-robin', file: 'f', line: 1, servers: [
      { text: 'a', address: '10.0.0.1', port: 80, weight: 1, maxFails: 1, failTimeout: 10, backup: false, down: true },
      { text: 'c', address: '10.0.0.3', port: 80, weight: 1, maxFails: 1, failTimeout: 10, backup: true, down: false }] };
    const peers = { primary: freshPeers([up.servers[0]]), backup: freshPeers([up.servers[1]]) };
    expect(pickPeer(up, peers, new Set(), '127.0.0.1', () => 0)).toBe(1);
  });
});

describe('the configuration test of the proxy module', () => {
  const t = (text: string) => session(withSite(text), 'sudo nginx -t').last.err[0];
  it('reports nginx\'s messages', () => {
    expect(t(site('    location / { proxy_pass 127.0.0.1:3000; }\n'))).toBe('nginx: [emerg] invalid URL prefix in "127.0.0.1:3000" in /etc/nginx/sites-enabled/app:3');
    expect(t(site('    location / { proxy_pass http://app.internal:3000; }\n'))).toBe('nginx: [emerg] host not found in upstream "app.internal:3000" in /etc/nginx/sites-enabled/app:3');
    expect(t(site('    location ~ \\.php$ { proxy_pass http://127.0.0.1:3000/; }\n'))).toBe('nginx: [emerg] "proxy_pass" cannot have URI part in location given by regular expression, or inside named location, or inside "if" statement, or inside "limit_except" block in /etc/nginx/sites-enabled/app:3');
    expect(t(site('    location / { proxy_pass http://backend:8080; }\n', 'upstream backend {\n    server 10.0.0.21:8080;\n}\n'))).toBe('nginx: [emerg] upstream "backend" may not have port 8080 in /etc/nginx/sites-enabled/app:6');
    expect(t(site('', 'upstream backend {\n}\n'))).toBe('nginx: [emerg] no servers are inside upstream in /etc/nginx/sites-enabled/app:1');
    expect(t(site('', 'upstream b {\n    server 10.0.0.21;\n}\nupstream b {\n    server 10.0.0.22;\n}\n'))).toBe('nginx: [emerg] duplicate upstream "b" in /etc/nginx/sites-enabled/app:4');
    expect(t(site('', 'upstream b {\n    ip_hash;\n    server 10.0.0.21 backup;\n}\n'))).toBe('nginx: [emerg] invalid parameter "backup" in /etc/nginx/sites-enabled/app:3');
    expect(t(site('', 'upstream b {\n    server 10.0.0.21 weight=0;\n}\n'))).toBe('nginx: [emerg] invalid parameter "weight=0" in /etc/nginx/sites-enabled/app:2');
    expect(t(site('    location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 2.0; }\n'))).toBe('nginx: [emerg] invalid value "2.0" in "proxy_http_version" directive, it must be "1.0" or "1.1" in /etc/nginx/sites-enabled/app:3');
    expect(t(site('    location / { proxy_pass http://127.0.0.1:3000; proxy_read_timeout soon; }\n'))).toBe('nginx: [emerg] "proxy_read_timeout" directive invalid value in /etc/nginx/sites-enabled/app:3');
    expect(t(site('    location / { proxy_set_header X-Id $nope; proxy_pass http://127.0.0.1:3000; }\n'))).toBe('nginx: [emerg] unknown "nope" variable');
    expect(t(site('    location / { fastcgi_pass 127.0.0.1:9000; }\n'))).toBe('nginx: [emerg] 模擬環境只模擬 HTTP 的反向代理（proxy_pass）；"fastcgi_pass" 不支援 in /etc/nginx/sites-enabled/app:3');
    expect(t(site('', 'upstream b {\n    hash $request_uri;\n    server 10.0.0.21;\n}\n'))).toBe('nginx: [emerg] 模擬環境的 upstream 支援 round robin、least_conn 與 ip_hash（"hash" 不支援） in /etc/nginx/sites-enabled/app:2');
    expect(t(site('    set $x 1;\n'))).toBe('nginx: [emerg] 模擬環境不支援 set in /etc/nginx/sites-enabled/app:3');
  });
  it('resolves upstream names with /etc/hosts when it loads the configuration (the lesson\'s machines are there)', () => {
    const s = withSite(site('    location / { proxy_pass http://app-02:8080; }\n'));
    expect(session(s, 'curl -s http://localhost/').last.out).toEqual(['app-02']);
    // A reload is needed for a changed site, as for everything else nginx reads.
    const r = session(s, `echo '${site('    location / { proxy_pass http://app-03:8080; }\n').replace(/\n/g, ' ')}' | sudo tee /etc/nginx/sites-available/app > /dev/null`, 'curl -s http://localhost/', 'sudo nginx -s reload', 'curl -s http://localhost/').log;
    expect([r[1].out, r[3].out]).toEqual([['app-02'], ['app-03']]);
  });
});

describe('lesson data and checks', () => {
  it('validates upstream connections and the responders\' echo, websocket and delay', () => {
    const bad: TerminalMachine = { ...proxyMachine, upstreamConnections: [{ upstream: 'backend', server: 'app-01', connections: -1 }], responders: [{ id: 'node', delay: 9999, routes: [{ path: '/', echo: true, websocket: true }] }] };
    expect(machineProblems(bad)).toEqual([
      'machine web-06: upstreamConnections backend app-01: needs an upstream name, a server a.b.c.d:port and 0..100000 connections',
      'machine web-06: responder node: delay must be 0..3600 seconds', 'machine web-06: responder node route /: echo and websocket are true (one of them)']);
  });
  it('checks what the application receives through the proxy with an http check', () => {
    const machine = withSite(site('    location / { proxy_pass http://127.0.0.1:3000; }\n'));
    const x: TerminalExercise = {
      id: 'xff', title: 'xff', machine: machine.id, statement: '', explanation: 'x', hints: [], mistakes: [],
      checks: [{ kind: 'http', url: 'http://localhost/', body: 'X-Forwarded-For: 127.0.0.1' }],
      solution: [`echo '${site('location / { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }').replace(/\n/g, ' ')}' | sudo tee /etc/nginx/sites-available/app > /dev/null`, 'sudo systemctl reload nginx'],
    };
    expect(checkTerminalExercise(x, [machine], []).ok).toBe(false);
    expect(checkTerminalExercise(x, [machine], x.solution).ok).toBe(true);
  });
});
