import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { E14_COMMANDS, NGINX_PROFILE, run, SOCKETS_PROFILE, TLS_PROFILE } from '@/lib/terminal/shell';
import { findLocation, parseConfig, readerOf, testConfig, type Loc } from '@/lib/terminal/nginx';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalFile, type TerminalMachine } from '@/lib/terminal/lesson';
import { sockMachine } from './support/server-fixture';
import { acmeMachine, nginxMachine, SHOP_SITE } from './support/web-fixture';

/*
 * Engine stage E14 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §12): the nginx profile — Ubuntu's nginx package, the
 * configuration parser and nginx -t's messages (file:line), location matching in nginx's documented order, add_header
 * inheritance, static files (200, 301, 403, 404, alias, permissions as www-data), the combined access log and the error
 * log, reload keeping the old configuration, a failed restart taking the site down, server_name selection, TLS from the
 * configuration, certbot --nginx, and the nginx check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, NGINX_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const web = (...commands: string[]) => session(nginxMachine, ...commands).last;
const status = (path: string, host = 'shop.example.com') => web(`curl -s -o /dev/null -w "%{http_code}" http://${host}${path}`).out[0];
const file = (path: string, content: string, mode = 0o644, owner = 'root'): TerminalFile => ({ path, kind: 'file', mode, owner, content });
/** The nginx machine with one more site (its file in sites-available, linked from sites-enabled). */
const withSite = (name: string, text: string, extra: TerminalFile[] = []): TerminalMachine => ({
  ...nginxMachine, files: [...nginxMachine.files, file(`/etc/nginx/sites-available/${name}`, text), { path: `/etc/nginx/sites-enabled/${name}`, kind: 'link', mode: 0o777, owner: 'root', target: `/etc/nginx/sites-available/${name}` }, ...extra],
});
const OK = ['nginx: the configuration file /etc/nginx/nginx.conf syntax is ok', 'nginx: configuration file /etc/nginx/nginx.conf test is successful'];
const failed = (msg: string) => [`nginx: [emerg] ${msg}`, 'nginx: configuration file /etc/nginx/nginx.conf test failed'];

describe('the nginx profile', () => {
  it('is the tls profile plus nginx; the tls profile refuses it; the fake nginx of lower profiles is unchanged', () => {
    expect([...NGINX_PROFILE.commands].sort()).toEqual([...TLS_PROFILE.commands, ...E14_COMMANDS].sort());
    expect(NGINX_PROFILE.features).toEqual([...TLS_PROFILE.features!, 'nginx']);
    expect(profileOf(nginxMachine)).toBe(NGINX_PROFILE);
    expect(run(machineState(acmeMachine), 'nginx -t', TLS_PROFILE).lines[0].text).toMatch(/^bash: nginx: command not found/);
    expect(web('nginx --help').out[0]).toBe(`用法：${SERVER_MANUAL.nginx.usage}`);
    // A sockets machine's nginx is still a process that declares its own socket (LNX10–LNX15, SRV01).
    expect(run(machineState(sockMachine), 'sudo ss -tlnp sport = :80', SOCKETS_PROFILE).lines.map(l => l.text)[1]).toMatch(/0\.0\.0\.0:80 .*users:\(\("nginx",pid=814,fd=6\),\("nginx",pid=813,fd=6\),\("nginx",pid=812,fd=6\)\)/);
  });
  it('installs Ubuntu\'s package: nginx.conf, the default site and its welcome page, the logs, a master with workers', () => {
    const plain: TerminalMachine = { id: 'n', title: 'n', user: 'learner', cwd: '/home/learner', profile: 'nginx', nginx: true, files: [{ path: '/home', kind: 'dir', mode: 0o755, owner: 'root' }, { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' }] };
    expect(machineProblems(plain)).toEqual([]);
    const s = session(plain, 'readlink /etc/nginx/sites-enabled/default', 'curl -sI http://localhost/', 'curl -s http://127.0.0.1/ | grep h1', 'ps -o user,pid,ppid,cmd -C nginx', 'ls -l /var/log/nginx').log;
    expect(s[0].out).toEqual(['/etc/nginx/sites-available/default']);
    expect(s[1].out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html', 'Content-Length: 615', 'Connection: keep-alive', '']);
    expect(s[2].out).toEqual(['<h1>Welcome to nginx!</h1>']);
    expect(s[4].out.map(l => l.replace(/\s+/g, ' '))).toEqual([expect.stringMatching(/^-rw-r----- www-data adm [1-9]\d* access\.log$/), '-rw-r----- www-data adm 0 error.log']);
    expect(machineState({ ...plain, nginx: 'stopped' }).nginx?.applied).toBeUndefined();
  });
});

describe('the configuration parser and nginx -t', () => {
  const t = (text: string) => session(withSite('x', text), 'sudo nginx -t').last.err;
  it('reports nginx\'s messages with file and line', () => {
    expect(web('sudo nginx -t')).toEqual({ out: [], err: OK });
    expect(t('server {\n  listen 80;\n  servr_name x;\n}\n')).toEqual(failed('unknown directive "servr_name" in /etc/nginx/sites-enabled/x:3'));
    expect(t('server {\n  root /var/www\n  index index.html;\n}\n')).toEqual(failed('invalid number of arguments in "root" directive in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  listen 80\n  root /var/www;\n}\n')).toEqual(failed('invalid parameter "root" in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  root /var/www\n}\n')).toEqual(failed('unexpected "}" in /etc/nginx/sites-enabled/x:3'));
    expect(t('server {\n  listen 80;\n')).toEqual(failed('unexpected end of file, expecting "}" in /etc/nginx/sites-enabled/x:2'));
    expect(t('listen 80;\n')).toEqual(failed('"listen" directive is not allowed here in /etc/nginx/sites-enabled/x:1'));
    expect(t('server {\n  root /a;\n  root /b;\n}\n')).toEqual(failed('"root" directive is duplicate in /etc/nginx/sites-enabled/x:3'));
    expect(t('server {\n  location / {\n    root /a;\n    alias /b/;\n  }\n}\n')).toEqual(failed('"alias" directive is duplicate, "root" directive was specified earlier in /etc/nginx/sites-enabled/x:4'));
    expect(t('server {\n  listen 70000;\n}\n')).toEqual(failed('invalid port in "70000" of the "listen" directive in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  listen 8o;\n}\n')).toEqual(failed('host not found in "8o" of the "listen" directive in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  listen 80 default_server;\n}\nserver {\n  listen 80 default_server;\n}\n')).toEqual(failed('a duplicate default server for 0.0.0.0:80 in /etc/nginx/sites-enabled/x:5'));
    expect(t('server {\n  include /etc/nginx/snippets/missing.conf;\n}\n')).toEqual(failed('open() "/etc/nginx/snippets/missing.conf" failed (2: No such file or directory) in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  sendfile maybe;\n}\n')).toEqual(failed('invalid value "maybe" in "sendfile" directive, it must be "on" or "off" in /etc/nginx/sites-enabled/x:2'));
    expect(t('server {\n  return 302 /$nope;\n}\n')).toEqual(failed('unknown "nope" variable'));
    expect(t('server {\n  location / {\n    proxy_pass http://127.0.0.1:3000;\n  }\n}\n')[0]).toBe('nginx: [emerg] 模擬環境："proxy_pass" 是反向代理的設定，在引擎階段 E15 才模擬 in /etc/nginx/sites-enabled/x:3');
    expect(t('server {\n  listen 80;\n  server_name shop.example.com;\n}\n')).toEqual(['nginx: [warn] conflicting server name "shop.example.com" on 0.0.0.0:80, ignored', ...OK]);
  });
  it('fails on a sites-enabled link whose file was removed, on a missing log folder, an unknown user, and without events', () => {
    const dangling = session(nginxMachine, 'sudo rm /etc/nginx/sites-available/shop', 'sudo nginx -t').last.err;
    expect(dangling).toEqual(failed('open() "/etc/nginx/sites-enabled/shop" failed (2: No such file or directory) in /etc/nginx/nginx.conf:50'));
    expect(t('server {\n  access_log /var/log/shop/access.log;\n}\n')).toEqual(failed('open() "/var/log/shop/access.log" failed (2: No such file or directory)'));
    const own = { ...nginxMachine, nginx: 'stopped' as const, files: [...nginxMachine.files, file('/etc/nginx/nginx.conf', 'user nginx;\nevents {}\n')] };
    expect(session(own, 'sudo nginx -t').last.err).toEqual(failed('getpwnam("nginx") failed in /etc/nginx/nginx.conf:1'));
    const reader = readerOf(machineState({ ...nginxMachine, files: [...nginxMachine.files, file('/etc/nginx/other.conf', 'http {}\n')] }));
    expect(() => parseConfig(reader, '/etc/nginx/other.conf')).toThrow('no "events" section in configuration');
  });
  it('an ordinary user\'s test fails on the error log and the pid file (Ubuntu); -T prints every file read, in order', () => {
    expect(web('nginx -t').err).toEqual(['nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)',
      '2026/11/22 10:00:00 [warn] 814#814: the "user" directive makes sense only if the master process runs with super-user privileges, ignored in /etc/nginx/nginx.conf:1',
      'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok', '2026/11/22 10:00:00 [emerg] 814#814: open() "/run/nginx.pid" failed (13: Permission denied)',
      'nginx: configuration file /etc/nginx/nginx.conf test failed']);
    const dump = web('sudo nginx -T');
    expect(dump.out.filter(l => l.startsWith('# configuration file'))).toEqual(['# configuration file /etc/nginx/nginx.conf:', '# configuration file /etc/nginx/mime.types:', '# configuration file /etc/nginx/sites-enabled/shop:']);
    expect(dump.err).toEqual(OK);
  });
});

describe('location matching (nginx\'s documented order)', () => {
  const locs = (text: string): Loc[] => {
    const st = machineState(withSite('docs', `server {\n listen 8080;\n${text}\n}\n`));
    const t = testConfig(st);
    if ('error' in t) throw new Error(t.error);
    return t.conf.servers.find(s => s.listens.some(l => l.port === 8080))!.locs;
  };
  it('chooses = first, the longest prefix, ^~ stops the regexes, regexes in order, else the remembered prefix', () => {
    // The example of http://nginx.org/en/docs/http/ngx_http_core_module.html#location.
    const l = locs('location = / { return 200 A; }\nlocation / { return 200 B; }\nlocation /documents/ { return 200 C; }\nlocation ^~ /images/ { return 200 D; }\nlocation ~* \\.(gif|jpg|jpeg)$ { return 200 E; }');
    const which = (uri: string) => findLocation(l, uri)?.loc.dirs[0].args[1];
    expect(['/', '/index.html', '/documents/document.html', '/images/1.gif', '/documents/1.jpg'].map(which)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const order = locs('location ~ /a { return 200 first; }\nlocation ~ /a/b { return 200 second; }\nlocation /a/b/c { return 200 prefix; }');
    expect(findLocation(order, '/a/b/c')?.loc.dirs[0].args[1]).toBe('first');
    const nested = locs('location /a/ { location ~ \\.txt$ { return 200 inner; } return 200 outer; }\nlocation ~ \\.txt$ { return 200 outer-regex; }');
    expect([findLocation(nested, '/a/x.txt')?.loc.dirs[0].args[1], findLocation(nested, '/b/x.txt')?.loc.dirs[0].args[1], findLocation(nested, '/a/x')?.loc.dirs.at(-1)?.args[1]]).toEqual(['inner', 'outer-regex', 'outer']);
  });
  it('serves through the same order on the running server', () => {
    expect(web('curl -sI http://shop.example.com/static/pic.png').out).toEqual(expect.arrayContaining(['Content-Type: image/png', 'Cache-Control: max-age=86400']));
    expect(web('curl -sI http://shop.example.com/static/pic.png').out).not.toContain('X-Image: yes');
    expect(web('curl -sI http://shop.example.com/logo.png').out).toEqual(expect.arrayContaining(['Content-Type: image/png', 'X-Image: yes']));
    expect(web('curl -si http://shop.example.com/healthz').out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: application/octet-stream',
      'Content-Length: 3', 'Connection: keep-alive', 'Cache-Control: no-store', '', 'ok']);
  });
});

describe('static files, headers and logs', () => {
  it('200, 301 for a folder without its slash, 403 without an index or for www-data, 404, alias, deny', () => {
    expect(['/', '/about', '/about/', '/empty/', '/secret/', '/draft.html', '/nothing', '/files/report.txt', '/private/x', '/old/a'].map(p => status(p))).toEqual(
      ['200', '301', '200', '403', '403', '403', '404', '200', '403', '301']);
    expect(web('curl -sI http://shop.example.com/about').out).toEqual(['HTTP/1.1 301 Moved Permanently', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html',
      'Content-Length: 171', 'Location: http://shop.example.com/about/', 'Connection: keep-alive', 'X-Site: shop', '']);
    expect(web('curl -s -X POST http://shop.example.com/index.html -o /dev/null -w "%{http_code}"').out).toEqual(['405']);
  });
  it('add_header: a level with its own add_header replaces the parent\'s; only for 2xx/3xx unless always', () => {
    const h = (path: string) => web(`curl -sI http://shop.example.com${path}`).out.filter(l => /^(X-|Cache-Control)/.test(l));
    expect(h('/')).toEqual(['X-Site: shop']);
    expect(h('/healthz')).toEqual(['Cache-Control: no-store']);
    expect(h('/nothing')).toEqual([]);
    const always = withSite('a', 'server {\n listen 8081;\n add_header X-Frame-Options DENY always;\n location / { return 404; }\n}\n');
    expect(session(always, 'curl -sI http://localhost:8081/').last.out).toContain('X-Frame-Options: DENY');
  });
  it('writes combined access-log lines and error-log lines (try_files does not log a missing file; the static module does)', () => {
    const s = session(nginxMachine, 'curl -s http://shop.example.com/ -A "Mozilla/5.0"', 'curl -s -o /dev/null http://shop.example.com/nothing', 'curl -s -o /dev/null http://shop.example.com/files/none.txt',
      'curl -s -o /dev/null http://shop.example.com/empty/', 'sudo cat /var/log/nginx/shop.access.log', 'sudo cat /var/log/nginx/shop.error.log').log;
    expect(s[4].out).toEqual(['10.0.0.10 - - [22/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 14 "-" "Mozilla/5.0"', '10.0.0.10 - - [22/Nov/2026:10:00:00 +0000] "GET /nothing HTTP/1.1" 404 155 "-" "curl/8.5.0"',
      '10.0.0.10 - - [22/Nov/2026:10:00:00 +0000] "GET /files/none.txt HTTP/1.1" 404 155 "-" "curl/8.5.0"', '10.0.0.10 - - [22/Nov/2026:10:00:00 +0000] "GET /empty/ HTTP/1.1" 403 155 "-" "curl/8.5.0"']);
    expect(s[5].out).toEqual(['2026/11/22 10:00:00 [error] 813#813: *3 open() "/srv/files/none.txt" failed (2: No such file or directory), client: 10.0.0.10, server: shop.example.com, request: "GET /files/none.txt HTTP/1.1", host: "shop.example.com"',
      '2026/11/22 10:00:00 [error] 813#813: *4 directory index of "/var/www/shop/empty/" is forbidden, client: 10.0.0.10, server: shop.example.com, request: "GET /empty/ HTTP/1.1", host: "shop.example.com"']);
    // Local time in the machine's zone.
    expect(session({ ...nginxMachine, timezone: 'Asia/Taipei' }, 'curl -s -o /dev/null http://shop.example.com/', 'sudo tail -n 1 /var/log/nginx/shop.access.log').last.out[0]).toMatch(/\[22\/Nov\/2026:18:00:00 \+0800\]/);
  });
});

describe('server selection', () => {
  const sites = withSite('names', ['server { listen 8080 default_server; server_name _; return 200 default; }', 'server { listen 8080; server_name www.example.com; return 200 exact; }',
    'server { listen 8080; server_name *.example.com; return 200 star; }', 'server { listen 8080; server_name mail.*; return 200 tail; }',
    'server { listen 8080; server_name ~^(?<sub>\\w+)\\.example\\.org$; return 200 "regex $sub"; }', ''].join('\n'));
  it('exact, the longest leading wildcard, the trailing wildcard, the first regex, else the default server', () => {
    const get = (host: string) => session(sites, `curl -s -H "Host: ${host}" http://localhost:8080/`).last.out[0];
    expect(['www.example.com', 'a.b.example.com', 'mail.example.net', 'api.example.org', 'unknown.test'].map(get)).toEqual(['exact', 'star', 'tail', 'regex api', 'default']);
  });
});

describe('reload, restart and the running configuration', () => {
  const blog = ['echo "server { listen 80; server_name blog.example.com; return 200 blog; }" | sudo tee /etc/nginx/sites-available/blog', 'sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/'];
  it('a change does nothing until reload; reload starts new workers', () => {
    const s = session(nginxMachine, ...blog, 'curl -s http://blog.example.com/', 'sudo systemctl reload nginx', 'curl -s http://blog.example.com/', 'ps -ef | grep "nginx: worker"').log;
    expect(s[2].out).toEqual(['<h1>Shop</h1>']);
    expect(s[4].out).toEqual(['blog']);
    expect(s[5].out[0]).toMatch(/^www-data +814 +812 .*nginx: worker process$/);
    expect(session(nginxMachine, ...blog, 'sudo nginx -s reload', 'curl -s http://blog.example.com/').last.out).toEqual(['blog']);
  });
  it('a failing reload keeps the old configuration; a failing restart takes the site down', () => {
    const bad = 'echo "server { servr_name x; }" | sudo tee /etc/nginx/sites-enabled/bad';
    const r = session(nginxMachine, bad, 'sudo systemctl reload nginx', 'systemctl is-active nginx', 'curl -s http://shop.example.com/').log;
    expect(r[1].err).toEqual(['Job for nginx.service failed because the control process exited with error code.', 'See "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.']);
    expect([r[2].out, r[3].out]).toEqual([['active'], ['<h1>Shop</h1>']]);
    expect(session(nginxMachine, bad, 'sudo nginx -s reload').last.err).toEqual(['nginx: [emerg] unknown directive "servr_name" in /etc/nginx/sites-enabled/bad:1']);
    const down = session(nginxMachine, bad, 'sudo systemctl restart nginx', 'systemctl is-active nginx', 'curl -sS http://shop.example.com/', 'sudo journalctl -u nginx -n 4 -o cat').log;
    expect(down[2].out).toEqual(['failed']);
    expect(down[3].err).toEqual(["curl: (7) Failed to connect to shop.example.com port 80 after 0 ms: Couldn't connect to server"]);
    expect(down[4].out).toEqual(['nginx: configuration file /etc/nginx/nginx.conf test failed', 'nginx.service: Control process exited, code=exited, status=1/FAILURE',
      "nginx.service: Failed with result 'exit-code'.", 'Failed to start nginx.service - A high performance web server and a reverse proxy server.']);
  });
  it('a port another program holds makes the start fail with bind() errors', () => {
    const busy: TerminalMachine = { ...nginxMachine, nginx: 'stopped', processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { pid: 700, user: 'root', command: 'apache2 -k start', listen: [{ port: 80 }] }] };
    const s = session(busy, 'sudo systemctl start nginx', 'sudo journalctl -u nginx -o cat -n 5').log;
    expect(s[0].err[0]).toBe('Job for nginx.service failed because the control process exited with error code.');
    expect(s[1].out).toEqual(['nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)', 'nginx: [emerg] still could not bind()', 'nginx.service: Control process exited, code=exited, status=1/FAILURE',
      "nginx.service: Failed with result 'exit-code'.", 'Failed to start nginx.service - A high performance web server and a reverse proxy server.']);
  });
});

describe('TLS from the configuration and certbot --nginx', () => {
  it('ssl listen needs a certificate; a key that does not match fails the test', () => {
    const t = (text: string, extra: TerminalMachine['certificates'] = []) => session({ ...withSite('tls', text), certificates: extra }, 'sudo nginx -t').last.err;
    expect(t('server {\n listen 443 ssl;\n}\n')).toEqual(failed('no "ssl_certificate" is defined for the "listen ... ssl" directive in /etc/nginx/sites-enabled/tls:2'));
    expect(t('server {\n listen 443 ssl;\n ssl_certificate /etc/ssl/x.pem;\n ssl_certificate_key /etc/ssl/x.key;\n}\n')[0]).toMatch(/^nginx: \[emerg\] cannot load certificate "\/etc\/ssl\/x\.pem": BIO_new_file\(\) failed/);
    const certs = [{ id: 'a', cn: 'shop.example.com', path: '/etc/ssl/a.pem', key: '/etc/ssl/a.key' }, { id: 'b', cn: 'shop.example.com', path: '/etc/ssl/b.pem', key: '/etc/ssl/b.key' }];
    expect(t('server {\n listen 443 ssl;\n ssl_certificate /etc/ssl/a.pem;\n ssl_certificate_key /etc/ssl/b.key;\n}\n', certs)).toEqual(failed('SSL_CTX_use_PrivateKey("/etc/ssl/b.key") failed (SSL: error:05800074:x509 certificate routines::key values mismatch)'));
  });
  it('certbot --nginx obtains the certificate, edits the server block, adds the redirect and reloads', () => {
    const s = session(nginxMachine, 'sudo certbot --nginx -d shop.example.com', 'sudo nginx -t', 'curl -sI http://shop.example.com/about', 'curl -s https://shop.example.com/', 'curl -s http://shop.example.com:443/', 'grep -c "managed by Certbot" /etc/nginx/sites-available/shop').log;
    expect(s[0].out).toEqual(expect.arrayContaining(['Deploying certificate', 'Successfully deployed certificate for shop.example.com to /etc/nginx/sites-enabled/shop',
      'Congratulations! You have successfully enabled HTTPS on https://shop.example.com']));
    expect(s[1].err).toEqual(OK);
    expect(s[2].out).toEqual(expect.arrayContaining(['HTTP/1.1 301 Moved Permanently', 'Location: https://shop.example.com/about']));
    expect(s[3].out).toEqual(['<h1>Shop</h1>']);
    expect(s[4].out[1]).toBe('<head><title>400 The plain HTTP request was sent to HTTPS port</title></head>');
    expect(s[5].out).toEqual(['7']);
    expect(session(nginxMachine, 'sudo certbot --nginx -d blog.example.com').last.err).toContain('Could not automatically find a matching server block for blog.example.com. Set the `server_name` directive to use the Nginx installer.');
  });
  it('a renewed webroot certificate is served only after nginx reloads', () => {
    const conf = 'server {\n listen 443 ssl;\n server_name shop.example.com;\n ssl_certificate /etc/letsencrypt/live/shop.example.com/fullchain.pem;\n ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;\n return 200 ok;\n}\n';
    const m: TerminalMachine = { ...withSite('tls', conf), now: '2027-02-10 10:00:00', certbot: { account: true, certificates: [{ domains: ['shop.example.com'], webroot: '/var/www/shop', issued: '2026-11-22 10:00:00' }] } };
    const end = 'openssl s_client -connect shop.example.com:443 2>/dev/null | openssl x509 -noout -enddate';
    const s = session(m, end, 'sudo certbot renew', end, 'sudo systemctl reload nginx', end).log;
    expect(s[0].out).toEqual(['notAfter=Feb 20 08:59:59 2027 GMT']);
    expect(s[1].out).toContain('Congratulations, all renewals succeeded:');
    expect(s[2].out).toEqual(['notAfter=Feb 20 08:59:59 2027 GMT']);
    expect(s[4].out).toEqual(['notAfter=May 11 08:59:59 2027 GMT']);
  });
});

describe('lesson data', () => {
  const ex: TerminalExercise = {
    id: 'blog', title: '新增部落格網站', machine: 'web-05', statement: '新增 blog.example.com 的 server 區塊（根目錄 /var/www/blog）並套用。',
    checks: [{ kind: 'nginx', test: true, server: 'blog.example.com', root: '/var/www/blog', port: 80 }],
    solution: ['echo "server { listen 80; server_name blog.example.com; root /var/www/blog; }" | sudo tee /etc/nginx/sites-available/blog', 'sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/', 'sudo nginx -t', 'sudo systemctl reload nginx'],
    mistakes: [{ commands: ['echo "server { listen 80; server_name blog.example.com; root /var/www/blog; }" | sudo tee /etc/nginx/sites-available/blog', 'sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/'], why: '沒有 reload' },
      { commands: ['echo "server { listen 80; server_name blog.example.com; root /var/www/blog }" | sudo tee /etc/nginx/sites-enabled/blog', 'sudo systemctl reload nginx'], why: '少了分號' }],
    hints: ['nginx -t'], explanation: '設定要 reload 才會套用。',
  };
  it('validates the nginx machine; the nginx check reads the applied configuration', () => {
    expect(machineProblems(nginxMachine)).toEqual([]);
    expect(terminalContentProblems({ machines: [nginxMachine], examples: [{ id: 'e', title: 't', description: 'd', machine: 'web-05', steps: [{ command: 'curl -s http://shop.example.com/healthz', output: 'ok' }] }], exercises: [ex] })).toEqual([]);
    expect(checkTerminalExercise(ex, [nginxMachine], ex.mistakes[0].commands).results[0].message).toMatch(/但執行中的設定沒有 server_name blog\.example\.com（80 埠）的 server 區塊（改了設定要 reload）$/);
    expect(checkTerminalExercise(ex, [nginxMachine], ex.mistakes[1].commands).results[0].message).toMatch(/但nginx -t 失敗：unexpected "}" in \/etc\/nginx\/sites-enabled\/blog:1$/);
    expect(machineProblems(withSite('bad', 'server { servr_name x; }')).join('\n')).toMatch(/nginx: true needs a configuration that passes nginx -t: unknown directive "servr_name"/);
    expect(machineProblems({ ...nginxMachine, processes: [{ pid: 5, user: 'root', command: 'x', listen: [{ port: 81, nginx: true }] }] }).join('\n')).toMatch(/listen\.nginx and listen\.ssl are set by the engine/);
    expect(terminalContentProblems({ machines: [acmeMachine], examples: [], exercises: [{ ...ex, machine: 'web-04' }] }).join('\n')).toMatch(/an nginx check needs an nginx machine/);
  });
  it('SHOP_SITE is what the fixture serves', () => { expect(SHOP_SITE).toContain('try_files $uri $uri/ =404;'); });
});

describe('signals', () => {
  it('SIGHUP to the master reloads (new workers, the new configuration); the workers ignore it', () => {
    const blog = ['echo "server { listen 80; server_name blog.example.com; return 200 blog; }" | sudo tee /etc/nginx/sites-enabled/blog'];
    expect(session(nginxMachine, ...blog, 'sudo kill -HUP 812', 'curl -s http://blog.example.com/').last.out).toEqual(['blog']);
    expect(session(nginxMachine, ...blog, 'sudo pkill -HUP nginx', 'pgrep -l nginx', 'curl -s http://blog.example.com/').log.slice(-2).map(l => l.out)).toEqual([['812 nginx', '814 nginx'], ['blog']]);
    expect(session(nginxMachine, ...blog, 'kill -HUP 812', 'curl -s http://blog.example.com/').last.out).toEqual(['<h1>Shop</h1>']);
    expect(session(nginxMachine, 'sudo kill 812', 'systemctl is-active nginx').last.out).toEqual(['inactive']);
  });
});
