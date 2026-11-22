import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { errorPage, httpDate, parseUrl, respond, type Responder } from '@/lib/terminal/http';
import { DNS_PROFILE, E12_COMMANDS, HTTP_PROFILE, run } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { dnsMachine, httpExercise, httpMachine, webRemote } from './support/server-fixture';

/*
 * Engine stage E12 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §8): the http profile — responders (routes, redirects,
 * nginx-like headers and error pages), curl's options, its -v layout, connection reuse and keep-alive, redirects with -L
 * and --max-redirs, -w, -o, the error codes of each failing step, HTTPS stopping at E13, and the lesson data and the
 * http check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, HTTP_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const cli = (...commands: string[]) => session(httpMachine, ...commands).last;
const code = (command: string) => session(httpMachine, command, 'echo $?').last.out[0];
const HEAD = (status: string, length: number, ...more: string[]) => [`< HTTP/1.1 ${status}`, '< Server: nginx/1.24.0 (Ubuntu)', '< Date: Sun, 22 Nov 2026 10:00:00 GMT', '< Content-Type: text/html',
  `< Content-Length: ${length}`, '< Connection: keep-alive', ...more.map(m => `< ${m}`), '<'];
const REQUEST = (path: string, host: string) => [`> GET ${path} HTTP/1.1`, `> Host: ${host}`, '> User-Agent: curl/8.5.0', '> Accept: */*', '>'];

describe('the http profile', () => {
  it('is the dns profile plus curl; the dns profile refuses it', () => {
    expect([...HTTP_PROFILE.commands].sort()).toEqual([...DNS_PROFILE.commands, ...E12_COMMANDS].sort());
    expect(HTTP_PROFILE.features).toEqual([...DNS_PROFILE.features!, 'http']);
    expect(profileOf(httpMachine)).toBe(HTTP_PROFILE);
    expect(run(machineState(dnsMachine), 'curl http://example.com/', DNS_PROFILE).lines[0].text).toMatch(/^bash: curl: command not found/);
    expect(cli('curl --help').out[0]).toBe(`用法：${SERVER_MANUAL.curl.usage}`);
  });
});

describe('responders', () => {
  const site: Responder = webRemote.responders![0];
  const get = (path: string, host = 'www.example.org', method = 'GET') => respond(site, { method, path, headers: [['Host', host]] }, 0);
  it('the first route whose path (exact or prefix*) and Host match; 405 for another method; 404 otherwise', () => {
    expect(get('/')).toMatchObject({ status: 200, body: '<h1>Welcome</h1>\n' });
    expect(get('/', 'example.org')).toMatchObject({ status: 301, headers: expect.arrayContaining([['Location', 'http://www.example.org/']]) });
    expect(get('/static/a/b.css?v=2')).toMatchObject({ status: 200, body: 'body{}\n' });
    expect(get('/form')).toMatchObject({ status: 405, reason: 'Not Allowed', body: errorPage(405, 'nginx/1.24.0 (Ubuntu)') });
    expect(get('/form', 'www.example.org', 'POST')).toMatchObject({ status: 201, reason: 'Created' });
    expect(get('/nothing')).toMatchObject({ status: 404, reason: 'Not Found' });
    expect(get('/', 'x', 'HEAD')).toMatchObject({ status: 200, body: '', headers: expect.arrayContaining([['Content-Length', '17']]) });
  });
  it('builds nginx\'s headers from the fixed clock and its error pages', () => {
    expect(get('/new').headers).toEqual([['Server', 'nginx/1.24.0 (Ubuntu)'], ['Date', 'Thu, 01 Jan 1970 00:00:00 GMT'], ['Content-Type', 'text/html'], ['Content-Length', '9'], ['Connection', 'keep-alive'], ['Cache-Control', 'max-age=60']]);
    expect(httpDate(Date.UTC(2026, 10, 22, 10) / 1000)).toBe('Sun, 22 Nov 2026 10:00:00 GMT');
    expect(errorPage(301, 'nginx/1.24.0 (Ubuntu)')).toBe('<html>\n<head><title>301 Moved Permanently</title></head>\n<body>\n<center><h1>301 Moved Permanently</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\n</body>\n</html>\n');
    expect(respond({ id: 'x', routes: [{ path: '/', status: 302, redirect: '/a' }] }, { method: 'GET', path: '/', headers: [] }, 0).reason).toBe('Found');
    expect(parseUrl('example.org:8080/a?b=1')).toEqual({ scheme: 'http', host: 'example.org', port: 8080, path: '/a?b=1' });
    expect(parseUrl('ftp://x/')).toEqual({ code: 1, message: 'Protocol "ftp" not supported' });
  });
});

describe('curl', () => {
  it('prints the body; -v shows the connection (*), the request (>) and the response headers (<)', () => {
    expect(cli('curl http://example.org/api/health')).toEqual({ out: ['{"ok":true}'], err: [] });
    expect(cli('curl -v http://www.example.org/')).toEqual({
      out: ['<h1>Welcome</h1>'],
      err: ['*   Trying 10.0.0.12:80...', '* Connected to www.example.org (10.0.0.12) port 80', ...REQUEST('/', 'www.example.org'), ...HEAD('200 OK', 17), '* Connection #0 to host www.example.org left intact'],
    });
  });
  it('-I sends HEAD and prints the headers; -i adds them before the body', () => {
    expect(cli('curl -I http://www.example.org/new').out).toEqual(['HTTP/1.1 200 OK', 'Server: nginx/1.24.0 (Ubuntu)', 'Date: Sun, 22 Nov 2026 10:00:00 GMT', 'Content-Type: text/html', 'Content-Length: 9',
      'Connection: keep-alive', 'Cache-Control: max-age=60', '']);
    expect(cli('curl -i http://www.example.org/form').out.slice(0, 1).concat(cli('curl -i http://www.example.org/form').out.slice(-2))).toEqual(['HTTP/1.1 405 Not Allowed', '</body>', '</html>']);
  });
  it('-L follows redirects without writing their bodies; connections are reused per host; --max-redirs stops a loop', () => {
    const follow = cli('curl -L -v http://example.org/');
    expect(follow.out).toEqual(['<h1>Welcome</h1>']);
    expect(follow.err).toEqual(['*   Trying 10.0.0.12:80...', '* Connected to example.org (10.0.0.12) port 80', ...REQUEST('/', 'example.org'), ...HEAD('301 Moved Permanently', 171, 'Location: http://www.example.org/'),
      '* Connection #0 to host example.org left intact', "* Issue another request to this URL: 'http://www.example.org/'", '*   Trying 10.0.0.12:80...', '* Connected to www.example.org (10.0.0.12) port 80',
      ...REQUEST('/', 'www.example.org'), ...HEAD('200 OK', 17), '* Connection #1 to host www.example.org left intact']);
    const same = cli('curl -sLv http://www.example.org/old').err;
    expect(same).toContain('* Re-using existing connection with host www.example.org');
    expect(same.filter(l => l.startsWith('*   Trying'))).toHaveLength(1);
    expect(cli('curl -L http://www.example.org/loop --max-redirs 3')).toEqual({ out: [], err: ['curl: (47) Maximum (3) redirects followed'] });
    expect(code('curl -sL --max-redirs 3 http://www.example.org/loop')).toBe('47');
  });
  it('keep-alive: two URLs share one connection; Connection: close makes curl connect again', () => {
    const two = cli('curl -v http://www.example.org/ http://www.example.org/new').err;
    expect(two.filter(l => l.startsWith('*'))).toEqual(['*   Trying 10.0.0.12:80...', '* Connected to www.example.org (10.0.0.12) port 80', '* Connection #0 to host www.example.org left intact',
      '* Re-using existing connection with host www.example.org', '* Connection #0 to host www.example.org left intact']);
    const legacy = cli('curl -v http://legacy.example.org:8080/ http://legacy.example.org:8080/').err;
    expect(legacy.filter(l => l.startsWith('*'))).toEqual(['*   Trying 10.0.0.12:8080...', '* Connected to legacy.example.org (10.0.0.12) port 8080', '* Closing connection',
      '*   Trying 10.0.0.12:8080...', '* Connected to legacy.example.org (10.0.0.12) port 8080', '* Closing connection']);
    expect(legacy).toContain('< Connection: close');
    expect(legacy).toContain('> Host: legacy.example.org:8080');
  });
  it('-w prints write-out variables after the transfer, -o writes the body to a file', () => {
    expect(cli('curl -sL -w "%{http_code} %{num_redirects} %{url_effective}\\n" -o /dev/null http://www.example.org/old').out).toEqual(['200 1 http://www.example.org/new']);
    expect(cli('curl -s -o /dev/null -w "%{http_code} %{redirect_url}\\n" http://www.example.org/old').out).toEqual(['301 http://www.example.org/new']);
    expect(cli("curl -s -o /dev/null -w '%{content_type} %{size_download} %{remote_ip}:%{remote_port} %{method} %header{cache-control}\\n' http://www.example.org/new").out)
      .toEqual(['text/html 9 10.0.0.12:80 GET max-age=60']);
    expect(cli('curl -s -o /dev/null -w "%{time_total}\\n" http://www.example.org/').err[0]).toMatch(/模擬環境不提供時間與速度/);
    const saved = session(httpMachine, 'curl -s -o page.html http://www.example.org/', 'cat page.html', 'ls -l page.html');
    expect(saved.log.map(l => l.out)).toEqual([[], ['<h1>Welcome</h1>'], ['-rw-r--r-- learner learner    17 page.html']]);
    expect(cli('curl -o /etc/page.html http://www.example.org/').err).toEqual(['Warning: Failed to open the file /etc/page.html: Permission denied', 'curl: (23) Failure writing output to destination']);
  });
  it('POST with -d (and the note for -X POST); custom headers and --resolve reach a virtual host', () => {
    const post = cli('curl -X POST -d a=1 -v http://www.example.org/form');
    expect(post.err[0]).toBe('Note: Unnecessary use of -X or --request, POST is already inferred.');
    expect(post.err).toEqual(expect.arrayContaining(['> POST /form HTTP/1.1', '> Content-Length: 3', '> Content-Type: application/x-www-form-urlencoded', '< HTTP/1.1 201 Created']));
    expect(post.out).toEqual(['created']);
    const vhost = cli('curl --resolve www.example.org:80:10.0.0.12 -H "Host: example.org" -sI http://www.example.org/');
    expect(vhost.out.slice(0, 1).concat(vhost.out.filter(l => l.startsWith('Location')))).toEqual(['HTTP/1.1 301 Moved Permanently', 'Location: http://www.example.org/']);
    expect(cli('curl -v --resolve www.example.org:80:10.0.0.12 http://www.example.org/').err.slice(0, 2)).toEqual(['* Added www.example.org:80:10.0.0.12 to DNS cache', '* Hostname www.example.org was found in DNS cache']);
  });
  it('fails at each step with curl\'s code: 6 name, 7 refused or unreachable, 28 timeout, 52 not HTTP, 1 HTTP/0.9, 22 with -f, 2 usage', () => {
    expect(cli('curl http://nope.example.org/').err).toEqual(['curl: (6) Could not resolve host: nope.example.org']);
    expect(cli('curl http://www.example.org:81/').err).toEqual(["curl: (7) Failed to connect to www.example.org port 81 after 0 ms: Couldn't connect to server"]);
    expect(cli('curl http://ghost.example.org/').err).toEqual(["curl: (7) Failed to connect to ghost.example.org port 80 after 127000 ms: Couldn't connect to server"]);
    expect(cli('curl --connect-timeout 5 http://ghost.example.org/').err).toEqual(['curl: (28) Failed to connect to ghost.example.org port 80 after 5000 ms: Timeout was reached']);
    expect(cli('curl http://10.0.0.12:22/').err).toEqual(['curl: (1) Received HTTP/0.9 when not allowed']);
    expect(cli('curl -f http://www.example.org/x')).toEqual({ out: [], err: ['curl: (22) The requested URL returned error: 404'] });
    expect([code('curl http://nope.example.org/'), code('curl -f http://www.example.org/x'), code('curl -s http://www.example.org/x'), code('curl')]).toEqual(['6', '22', '0', '2']);
    expect(cli('curl -s http://nope.example.org/').err).toEqual([]);
    expect(cli('curl -sS http://nope.example.org/').err).toEqual(['curl: (6) Could not resolve host: nope.example.org']);
    expect(cli('curl --bogus http://x/').err).toEqual(['curl: option --bogus: is unknown', "curl: try 'curl --help' or 'curl --manual' for more information"]);
    expect(cli('curl').err).toEqual(['curl: no URL specified!', "curl: try 'curl --help' or 'curl --manual' for more information"]);
  });
  it('HTTPS connects, then stops: TLS is engine stage E13', () => {
    const tls = cli('curl -v https://www.example.org/');
    expect(tls.err).toEqual(['*   Trying 10.0.0.12:443...', '* Connected to www.example.org (10.0.0.12) port 443', 'curl: (35) 模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP', '* Closing connection']);
    expect(code('curl -s https://www.example.org/')).toBe('35');
    // Nothing listening is a TCP failure before any TLS.
    expect(cli('curl https://www.example.org:8443/').err).toEqual(["curl: (7) Failed to connect to www.example.org port 8443 after 0 ms: Couldn't connect to server"]);
  });
});

describe('lesson data', () => {
  const content = (): TerminalLessonContent => ({
    machines: [httpMachine],
    examples: [{ id: 'code', title: '只看狀態碼', description: '-w 的 http_code。', machine: 'cli-01', steps: [{ command: 'curl -s -o /dev/null -w "%{http_code}\\n" http://www.example.org/nothing', output: '404' }] }],
    exercises: [httpExercise],
  });
  it('validates the E12 content; the http check sends a GET after the commands', () => {
    expect(terminalContentProblems(content())).toEqual([]);
    expect(checkTerminalExercise(httpExercise, [httpMachine], httpExercise.mistakes[0].commands).results.map(r => r.ok)).toEqual([false, true]);
    const http = (check: Partial<{ url: string; status: number; header: [string, string]; body: string; host: string }>) => checkTerminalExercise({ ...httpExercise, checks: [{ kind: 'http', url: 'http://www.example.org/', ...check }] }, [httpMachine], []);
    expect(http({ status: 200, body: 'Welcome' }).ok).toBe(true);
    expect(http({ url: 'http://example.org/', status: 200 }).results[0].message).toBe('GET http://example.org/ 應該回應狀態碼 200，但狀態碼是 301');
    expect(http({ url: 'http://example.org/', header: ['Location', 'http://www.example.org/'] }).ok).toBe(true);
    expect(http({ url: 'http://www.example.org:81/', status: 200 }).results[0].message).toMatch(/81 埠沒有程式在監聽/);
    expect(http({ url: 'http://127.0.0.1:8080/', status: 200, host: 'web-02' }).ok).toBe(true);
  });
  it('reports bad responders and listeners', () => {
    const p = (patch: Partial<typeof webRemote>) => machineProblems({ ...httpMachine, remotes: [{ ...webRemote, ...patch }] }).join('\n');
    expect(machineProblems({ ...dnsMachine, responders: [] }).join('\n')).toMatch(/responders and listen\.http need the http profile \(engine stage E12\)/);
    expect(p({ processes: [{ pid: 812, user: 'root', command: 'nginx', listen: [{ port: 80, http: 'nope' }] }] })).toMatch(/http needs a TCP listener and a responder with the id nope/);
    expect(p({ responders: [{ id: 'site', routes: [{ path: 'no-slash' }] }, { id: 'legacy', routes: [{ path: '/', status: 999 }] }] })).toMatch(/route no-slash: the path must start with \/[\s\S]*route \/: status must be 100\.\.599/);
    expect(p({ responders: [{ id: 'site', routes: [{ path: '/', redirect: '/x', status: 200 }] }, webRemote.responders![1]] })).toMatch(/a redirect needs a one-line location and a 3xx status/);
    const c = content();
    c.exercises[0] = { ...httpExercise, checks: [{ kind: 'http', url: 'https://www.example.org/' }] };
    expect(terminalContentProblems(c).join('\n')).toMatch(/an http check needs an http machine/);
  });
});

describe('E12 fidelity fixes (SRV0_SERVER_CAPABILITY.md §8.3)', () => {
  it('-H \'User-Agent: …\' and -H \'Accept: …\' replace curl\'s own header (after the defaults, like curl); an empty value removes it', () => {
    const lines = (cmd: string) => cli(cmd).err.filter(l => l.startsWith('> '));
    expect(lines('curl -sv -H "Accept: application/json" http://www.example.org/')).toEqual(['> GET / HTTP/1.1', '> Host: www.example.org', '> User-Agent: curl/8.5.0', '> Accept: application/json']);
    expect(lines('curl -sv -H "User-Agent: probe/1" -H "X-Id: 7" http://www.example.org/')).toEqual(['> GET / HTTP/1.1', '> Host: www.example.org', '> Accept: */*', '> User-Agent: probe/1', '> X-Id: 7']);
    expect(lines('curl -sv -H "Accept:" http://www.example.org/')).toEqual(['> GET / HTTP/1.1', '> Host: www.example.org', '> User-Agent: curl/8.5.0']);
    expect(lines('curl -sv -A probe/2 http://www.example.org/')).toEqual(['> GET / HTTP/1.1', '> Host: www.example.org', '> User-Agent: probe/2', '> Accept: */*']);
    expect(lines('curl -sv -d "{}" -H "Content-Type: application/json" http://www.example.org/form')).toEqual(['> POST /form HTTP/1.1', '> Host: www.example.org', '> User-Agent: curl/8.5.0',
      '> Accept: */*', '> Content-Type: application/json', '> Content-Length: 2']);
  });
  it('-o writes the first URL only; the later ones go to standard output', () => {
    const s = session(httpMachine, 'curl -s -o first.html http://www.example.org/ http://www.example.org/new', 'cat first.html');
    expect(s.log.map(l => l.out)).toEqual([['new page'], ['<h1>Welcome</h1>']]);
  });
  it('a 204 has neither a body nor a Content-Length', () => {
    const r = respond({ id: 'x', server: 'nginx/1.24.0 (Ubuntu)', routes: [{ path: '/', status: 204, body: 'ignored' }] }, { method: 'GET', path: '/', headers: [] }, 0);
    expect(r).toMatchObject({ status: 204, reason: 'No Content', body: '' });
    expect(r.headers.map(([k]) => k)).toEqual(['Server', 'Date', 'Content-Type', 'Connection']);
  });
});
