import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { EDGE_PROFILE, NGINX_PROFILE, run, TLS_PROFILE, type ShellProfile } from '@/lib/terminal/shell';
import { machineProblems, machineState, type TerminalFile, type TerminalMachine, type TerminalRemote } from '@/lib/terminal/lesson';
import { acmeMachine, EXAMPLE_COM, nginxMachine } from './support/web-fixture';
import { app01, app02 } from './support/edge-fixture';

/*
 * SRV-5 fixes (docs/curriculum/SRV0_SERVER_CAPABILITY.md §29): certbot's CA resolves names through public DNS only (never
 * the server's /etc/hosts); nginx on the lesson's own machine, reached through a CDN edge (or from any remote), proxies to
 * its upstreams as for a local request; and the time an origin waits is counted once through the edge.
 */
function session(profile: ShellProfile, from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const home = [dir('/home'), dir('/home/learner', 'learner')];
const sudo = { groups: [{ name: 'sudo', members: ['learner'] }] };

// ------------------------------------------------------------------------------------------------- certbot and DNS

describe('certbot\'s CA looks names up in public DNS only', () => {
  const HOSTS_LINE = 'echo "203.0.113.10 shop.example.net" | sudo tee -a /etc/hosts > /dev/null';
  const order = (name: string) => `sudo certbot certonly --webroot -w /var/www/blog -d ${name} --agree-tos -m ops@example.net -n`;
  it('a name only in this server\'s /etc/hosts fails with NXDOMAIN although the server itself reaches it', () => {
    const s = session(TLS_PROFILE, acmeMachine, HOSTS_LINE, 'curl -s http://shop.example.net/', order('shop.example.net'), 'echo $?').log;
    expect(s[1].out).toEqual(['<h1>blog</h1>']);
    expect(s[2].err.slice(0, 5)).toEqual(['', 'Certbot failed to authenticate some domains (authenticator: webroot). The Certificate Authority reported these problems:',
      '  Domain: shop.example.net', '  Type:   dns', '  Detail: DNS problem: NXDOMAIN looking up A for shop.example.net - check that a DNS record exists for this domain']);
    expect(s[3].out).toEqual(['1']);
  });
  it('a public record passes, and a hosts line pointing the public name elsewhere does not change what the CA sees', () => {
    expect(session(TLS_PROFILE, acmeMachine, order('blog.example.net')).last.out).toContain('Successfully received certificate.');
    const pinned = session(TLS_PROFILE, acmeMachine, 'echo "10.9.9.9 blog.example.net" | sudo tee -a /etc/hosts > /dev/null', 'curl -sS -m 1 http://blog.example.net/', order('blog.example.net')).log;
    expect(pinned[1].err[0]).toMatch(/^curl: \((7|28)\)/);
    expect(pinned[2].out).toContain('Successfully received certificate.');
  });
  it('certbot --nginx looks names up the same way', () => {
    const zone = EXAMPLE_COM.replace('shop IN A 10.0.0.10\nwww.shop IN A 10.0.0.10\n', '');
    const hostsOnly: TerminalMachine = { ...nginxMachine, internet: [{ zone: 'example.com', text: zone }] };
    const r = session(NGINX_PROFILE, hostsOnly, 'echo "10.0.0.10 shop.example.com" | sudo tee -a /etc/hosts > /dev/null', 'sudo certbot --nginx -d shop.example.com').last;
    expect(r.err).toContain('  Detail: DNS problem: NXDOMAIN looking up A for shop.example.com - check that a DNS record exists for this domain');
    expect(session(NGINX_PROFILE, nginxMachine, 'sudo certbot --nginx -d shop.example.com').last.out).toContain('Successfully received certificate.');
  });
});

// ----------------------------------------------------------------------------------------- nginx behind the CDN edge

const LB_SITE = `upstream backend {
    server 10.0.0.21:8080;
    server 10.0.0.22:8080;
}

server {
    listen 80 default_server;
    server_name www.example.com;

    location / {
        proxy_pass http://backend;
        add_header X-Upstream $upstream_addr;
    }
    location /dead/ {
        proxy_pass http://10.0.0.99:8080;
        proxy_connect_timeout 5s;
    }
}
`;
const nginxFiles = [dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/lb', LB_SITE), dir('/etc/nginx/sites-enabled'),
  link('/etc/nginx/sites-enabled/lb', '/etc/nginx/sites-available/lb')];
/** A CDN edge whose origin is the nginx at `origin` (nothing is cached: every request reaches nginx). */
const edgeTo = (origin: string): TerminalRemote => ({
  host: 'edge-01', address: '10.0.0.60', hostKey: 'edge-key', latency: 4, files: [],
  processes: [{ pid: 910, user: 'root', command: '/usr/local/bin/edged', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'edge' }] }],
  responders: [{ id: 'edge', cdn: { origin }, routes: [] }],
});
/** laptop (the root) runs nginx itself; the edge and two application servers are remotes. */
const laptopNginx: TerminalMachine = {
  id: 'laptop-nginx', title: 'laptop（nginx 在本機）', user: 'learner', cwd: '/home/learner', host: 'laptop', address: '10.0.0.5', profile: 'edge', nginx: true, accounts: sudo,
  latency: 2, files: [...home, ...nginxFiles], remotes: [edgeTo('10.0.0.5'), app01, app02],
};
/** The nginx host is the root; the request comes back to it through the edge. */
const webRoot: TerminalMachine = { ...laptopNginx, id: 'web-root', title: 'web-01（nginx 在本機）', host: 'web-01', remotes: [edgeTo('web-01'), app01, app02] };
/** laptop (the root) only runs curl; nginx is on the remote web-01. */
const webRemote: TerminalRemote = { host: 'web-01', address: '10.0.0.5', hostKey: 'web-key', latency: 2, nginx: true, files: nginxFiles };
const laptopRemote: TerminalMachine = {
  id: 'laptop-remote', title: 'laptop（nginx 在 web-01）', user: 'learner', cwd: '/home/learner', host: 'laptop', profile: 'edge', accounts: sudo, latency: 2,
  files: home, remotes: [edgeTo('web-01'), webRemote, app01, app02],
};

const EDGE = '--resolve www.example.com:80:10.0.0.60', LOCAL = '--resolve www.example.com:80:10.0.0.5';
const up = (via: string) => `curl -s -w " %{http_code} %header{x-upstream} %header{x-cache}\\n" ${via} http://www.example.com/`;

describe('nginx reached through the CDN edge proxies as for a local request', () => {
  it('the fixtures are valid edge machines', () => {
    for (const m of [laptopNginx, webRoot, laptopRemote]) expect(machineProblems(m), m.id).toEqual([]);
  });
  it('laptop as root, the edge, nginx on the root, two application servers', () => {
    const local = session(EDGE_PROFILE, laptopNginx, up(LOCAL), up(LOCAL)).log.map(l => l.out.join(''));
    expect(local).toEqual(['app-01 200 10.0.0.21:8080 ', 'app-02 200 10.0.0.22:8080 ']);
    const viaEdge = session(EDGE_PROFILE, laptopNginx, up(EDGE), up(EDGE), 'sudo tail -n 2 /var/log/nginx/access.log');
    expect(viaEdge.log.slice(0, 2).map(l => l.out.join(''))).toEqual(['app-01 200 10.0.0.21:8080 MISS', 'app-02 200 10.0.0.22:8080 MISS']);
    // nginx on the laptop logged both requests, from the edge.
    expect(viaEdge.last.out.map(l => l.split(' ')[0])).toEqual(['10.0.0.60', '10.0.0.60']);
  });
  it('the nginx host is the root and the request comes through the edge', () => {
    const viaEdge = session(EDGE_PROFILE, webRoot, up(EDGE), up(EDGE), up(LOCAL)).log.map(l => l.out.join(''));
    expect(viaEdge).toEqual(['app-01 200 10.0.0.21:8080 MISS', 'app-02 200 10.0.0.22:8080 MISS', 'app-01 200 10.0.0.21:8080 ']);
  });
  it('nginx on a remote machine, through the edge and directly', () => {
    const s = session(EDGE_PROFILE, laptopRemote, up(EDGE), up(EDGE), up(LOCAL)).log.map(l => l.out.join(''));
    expect(s).toEqual(['app-01 200 10.0.0.21:8080 MISS', 'app-02 200 10.0.0.22:8080 MISS', 'app-01 200 10.0.0.21:8080 ']);
  });
});

describe('an upstream\'s wait is counted once through the edge', () => {
  const total = (via: string) => `curl -s -o /dev/null -w "%{http_code} %{time_starttransfer} %{time_total}" ${via} http://www.example.com/dead/`;
  // Round trips in seconds (§24.1: the sum of both latencies; the machine's own address 0.04 ms). A new connection costs
  // two of them before the first byte (the TCP handshake and the request).
  const rtt = (a: number, b: number) => (a + b) / 1000;
  it('proxy_connect_timeout 5s against a dropped upstream: 5 s plus the round trips, directly and through the edge', () => {
    const cases: [TerminalMachine, number][] = [[laptopRemote, rtt(2, 2)], [laptopNginx, 0.04 / 1000]];
    for (const [m, direct] of cases) {
      const [d, e] = session(EDGE_PROFILE, m, total(LOCAL), total(EDGE)).log.map(l => l.out[0].split(' '));
      expect([d[0], e[0]], m.id).toEqual(['504', '504']);
      expect(Number(d[1]), m.id).toBeCloseTo(5 + 2 * direct + 0.00005 + 0.000012, 6);
      // Through the edge: the origin's time, client ⇄ edge twice and edge ⇄ origin twice (once each before: 10.0 s).
      expect(Number(e[1]), m.id).toBeCloseTo(Number(d[1]) - 2 * direct + 2 * rtt(2, 4) + rtt(4, 2), 6);
      expect(Number(e[2]) - Number(e[1]), m.id).toBeCloseTo(Number(d[2]) - Number(d[1]), 5);
      expect(Number(e[2]), m.id).toBeLessThan(5.1);
    }
  });
  it('a slow application behind the edge: its delay once, and a cached answer has no delay at all', () => {
    const slow: TerminalRemote = { ...app01, host: 'slow-01', address: '10.0.0.31', latency: 1,
      processes: [{ pid: 900, user: 'root', command: '/usr/local/bin/appd', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'app' }] }], responders: [{ id: 'app', routes: [{ path: '/*', body: 'slow\n', delay: 3, headers: [['Cache-Control', 'max-age=60']] }] }] };
    const m: TerminalMachine = { ...laptopRemote, remotes: [edgeTo('slow-01'), slow] };
    const t = (via: string) => `curl -s -o /dev/null -w "%{time_starttransfer} %header{x-cache}" ${via} http://www.example.com/`;
    const [direct, miss, hit] = session(EDGE_PROFILE, m, t('--resolve www.example.com:80:10.0.0.31'), t(EDGE), t(EDGE)).log.map(l => l.out[0].split(' '));
    expect(Number(direct[0])).toBeCloseTo(3 + 2 * rtt(2, 1) + 0.00005 + 0.000012, 6);
    expect(miss[1]).toBe('MISS');
    expect(Number(miss[0])).toBeCloseTo(Number(direct[0]) - 2 * rtt(2, 1) + 2 * rtt(2, 4) + rtt(4, 1), 6);
    expect(hit[1]).toBe('HIT');
    expect(Number(hit[0])).toBeCloseTo(2 * rtt(2, 4) + 0.00005 + 0.000012, 6);
  });
});
