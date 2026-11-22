import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { DNS_PROFILE, NGINX_PROFILE, PROCESSES_PROFILE, run, STREAMS_PROFILE, TLS_PROFILE, type ShellProfile } from '@/lib/terminal/shell';
import { machineState, type TerminalFile, type TerminalMachine } from '@/lib/terminal/lesson';
import { acmeMachine, nginxMachine } from './support/web-fixture';
import { dnsMachine } from './support/server-fixture';

/*
 * The fixes of the SRV-3 batch that lesson writers asked for (docs/curriculum/SRV0_SERVER_CAPABILITY.md §20), each from the
 * profile where its command exists: certbot (--nginx with several names, deploy hooks run by certbot.service, renew
 * --deploy-hook, the renewal-hooks/deploy scripts, certonly renewing a due lineage, the signature algorithm of a leaf whose
 * issuer is not sent), dig with several names, grep -o and context lines, tr -c, pgrep -c and ps -C.
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
const file = (path: string, content: string, mode = 0o644, owner = 'root'): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const streams: TerminalMachine = {
  id: 'text', title: 'text', user: 'learner', cwd: '/home/learner', profile: 'streams',
  files: [dir('/home'), dir('/home/learner', 'learner'), file('/home/learner/log.txt', 'GET /a 200\nGET /b 404\nPOST /c 500\nGET /d 200\nGET /e 503\nGET /f 200\n', 0o644, 'learner')],
};

describe('certbot', () => {
  it('--nginx with several names writes the TLS lines once and one redirect block for them', () => {
    const r = session(NGINX_PROFILE, nginxMachine, 'sudo certbot --nginx -d shop.example.com -d www.shop.example.com', 'cat /etc/nginx/sites-available/shop', 'sudo nginx -t', 'curl -s https://www.shop.example.com/healthz').log;
    const text = r[1].out;
    expect(text.filter(l => l.includes('listen 443 ssl'))).toEqual(['    listen 443 ssl; # managed by Certbot']);
    expect(text.filter(l => l === 'server {')).toHaveLength(2);
    expect(text.slice(text.lastIndexOf('server {'))).toEqual(['server {', '    if ($host = www.shop.example.com) {', '        return 301 https://$host$request_uri;', '    } # managed by Certbot', '', '',
      '    if ($host = shop.example.com) {', '        return 301 https://$host$request_uri;', '    } # managed by Certbot', '', '', '    listen 80;', '    server_name shop.example.com www.shop.example.com;',
      '    return 404; # managed by Certbot', '', '', '}']);
    expect(r[2].err.at(-1)).toBe('nginx: configuration file /etc/nginx/nginx.conf test is successful');
    expect(r[3].out).toEqual(['ok']);
  });
  const SITE = 'server {\n    listen 80;\n    server_name shop.example.com;\n    root /var/www/shop;\n}\nserver {\n    listen 443 ssl;\n    server_name shop.example.com;\n    ssl_certificate /etc/letsencrypt/live/shop.example.com/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;\n    root /var/www/shop;\n}\n';
  const later = (hook?: string, extra: TerminalFile[] = []): TerminalMachine => ({
    ...nginxMachine, now: '2027-01-31 10:00:00', timezone: 'UTC',
    files: [...nginxMachine.files.filter(f => !f.path.includes('sites-')), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/tls', SITE), dir('/etc/nginx/sites-enabled'),
      { path: '/etc/nginx/sites-enabled/tls', kind: 'link', mode: 0o777, owner: 'root', target: '/etc/nginx/sites-available/tls' }, ...extra],
    certbot: { lifetime: 90, account: true, certificates: [{ domains: ['shop.example.com'], webroot: '/var/www/shop', issued: '2026-11-22 10:00:00', ...hook ? { hook } : {} }] },
  });
  const expiry = 'echo | openssl s_client -connect shop.example.com:443 -servername shop.example.com 2>/dev/null | openssl x509 -noout -enddate';
  it('a deploy hook run by certbot.service keeps what it did (systemctl reload nginx: the new certificate is served)', () => {
    const r = session(NGINX_PROFILE, later('systemctl reload nginx'), expiry, 'sudo systemctl start certbot.service', expiry, 'sudo journalctl -n 8 --no-pager').log;
    expect(r[0].out).toEqual(['notAfter=Feb 20 08:59:59 2027 GMT']);
    expect(r[2].out).toEqual(['notAfter=May  1 08:59:59 2027 GMT']);
    expect(r[3].out.join('\n')).toMatch(/Reloading nginx\.service[\s\S]*Finished certbot\.service - Certbot\./);
    // Without a hook the webroot certificate is renewed but nginx still sends the old one (reload needed).
    expect(session(NGINX_PROFILE, later(), 'sudo systemctl start certbot.service', expiry).last.out).toEqual(['notAfter=Feb 20 08:59:59 2027 GMT']);
  });
  it('renew --deploy-hook runs the command and saves it; the scripts of renewal-hooks/deploy run first', () => {
    const hooks = [dir('/etc/letsencrypt'), dir('/etc/letsencrypt/renewal-hooks'), dir('/etc/letsencrypt/renewal-hooks/deploy'), file('/etc/letsencrypt/renewal-hooks/deploy/10-mark', '#!/bin/sh\ntouch /var/www/shop/dir-hook\n', 0o755),
      file('/etc/letsencrypt/renewal-hooks/deploy/README.txt', 'not executable\n')];
    const r = session(NGINX_PROFILE, later(undefined, hooks), 'sudo certbot renew --deploy-hook "touch /var/www/shop/cli-hook"', 'ls /var/www/shop', 'sudo grep renew_hook /etc/letsencrypt/renewal/shop.example.com.conf',
      'sudo certbot renew --dry-run').log;
    expect(r[0].out).toEqual(expect.arrayContaining(['Renewing an existing certificate for shop.example.com', 'Running deploy-hook command: /etc/letsencrypt/renewal-hooks/deploy/10-mark', 'Running deploy-hook command: touch /var/www/shop/cli-hook']));
    expect(r[0].out.indexOf('Running deploy-hook command: /etc/letsencrypt/renewal-hooks/deploy/10-mark')).toBeLessThan(r[0].out.indexOf('Running deploy-hook command: touch /var/www/shop/cli-hook'));
    expect(r[1].out[0].split(/\s+/)).toEqual(expect.arrayContaining(['cli-hook', 'dir-hook']));
    expect(r[2].out).toEqual(['renew_hook = touch /var/www/shop/cli-hook']);
    expect(r[3].out).toEqual(expect.arrayContaining(['Dry run: skipping deploy hook command: /etc/letsencrypt/renewal-hooks/deploy/10-mark', 'Dry run: skipping deploy hook command: touch /var/www/shop/cli-hook']));
  });
  it('certonly on a lineage that is due says it renews it', () => {
    const due: TerminalMachine = { ...acmeMachine, now: '2027-01-31 10:00:00', certbot: { lifetime: 90, account: true, certificates: [{ domains: ['blog.example.net'], webroot: '/var/www/blog', issued: '2026-11-22 10:00:00' }] } };
    expect(session(TLS_PROFILE, due, 'sudo certbot certonly --webroot -w /var/www/blog -d blog.example.net').last.out[1]).toBe('Renewing an existing certificate for blog.example.net');
    expect(session(TLS_PROFILE, acmeMachine, 'sudo certbot certonly --agree-tos -m a@example.net --webroot -w /var/www/blog -d blog.example.net').last.out[2]).toBe('Requesting a certificate for blog.example.net');
  });
  it('a leaf sent without its issuer still shows the issuer\'s signature algorithm (R11 signs with RSA)', () => {
    const leafOnly = later(undefined, [file('/etc/nginx/sites-available/tls', SITE.replace('fullchain.pem', 'cert.pem'))]);
    const r = session(NGINX_PROFILE, { ...leafOnly, files: leafOnly.files.filter((f, i, all) => all.findIndex(g => g.path === f.path) === i || f.content?.includes('cert.pem')) },
      'echo | openssl s_client -connect shop.example.com:443 -servername shop.example.com 2>/dev/null | grep sigalg').last.out;
    expect(r).toEqual(['   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: RSA-SHA256']);
  });
});

describe('dig with several names', () => {
  it('answers every name (+short), each name with the type written after it', () => {
    expect(session(DNS_PROFILE, dnsMachine, 'dig +short cdn.example.com mail.example.com').last.out).toEqual(['edge.cdn.example.net.', '192.0.2.80', '203.0.113.25']);
    expect(session(DNS_PROFILE, dnsMachine, 'dig +short example.com MX example.com NS').last.out).toEqual(['10 mail.example.com.', 'ns1.example.com.']);
    // Several names with the full layout: the header line once.
    expect(session(DNS_PROFILE, dnsMachine, 'dig mail.example.com ns1.example.com').last.out.filter(l => l.startsWith('; <<>> DiG'))).toHaveLength(1);
  });
});

describe('text tools', () => {
  const t = (...commands: string[]) => session(STREAMS_PROFILE, streams, ...commands).last;
  it('grep -o prints each match; -A, -B and -C print context lines', () => {
    expect(t('grep -o " [0-9]*$" log.txt').out).toEqual([' 200', ' 404', ' 500', ' 200', ' 503', ' 200']);
    expect(t('grep -oE "[45][0-9]{2}" log.txt').out).toEqual(['404', '500', '503']);
    expect(t('grep -n -o "/[a-z]" log.txt').out.slice(0, 2)).toEqual(['1:/a', '2:/b']);
    expect(t('grep -A1 404 log.txt').out).toEqual(['GET /b 404', 'POST /c 500']);
    expect(t('grep -n -B1 503 log.txt').out).toEqual(['4-GET /d 200', '5:GET /e 503']);
    expect(t('grep -C1 -e 404 -e 503 log.txt').out).toEqual(['GET /a 200', 'GET /b 404', 'POST /c 500', 'GET /d 200', 'GET /e 503', 'GET /f 200']);
    expect(t('grep -A0 -e 404 -e 503 log.txt').out).toEqual(['GET /b 404', '--', 'GET /e 503']);
    expect(t('grep -A x 404 log.txt').err).toEqual(['grep: x: invalid context length argument']);
  });
  it('tr -c complements the first set (-cd keeps only it)', () => {
    expect(t('echo "a1-b2 c3" | tr -cd "0-9\\n"').out).toEqual(['123']);
    expect(t('echo "a1-b2" | tr -c "a-z\\n" "_"').out).toEqual(['a__b_']);
  });
  it('pgrep -c counts and ps -C selects by name', () => {
    const procs: TerminalMachine = { ...streams, profile: 'processes', processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx', stat: 'Ss' },
      { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S' }, { pid: 900, user: 'learner', command: 'python3 app.py', stat: 'S' }] };
    const r = session(PROCESSES_PROFILE, procs, 'pgrep -c nginx', 'pgrep -c nothing', 'ps -o pid,user,cmd -C nginx').log;
    expect(r[0].out).toEqual(['2']);
    expect(r[1].out).toEqual(['0']);
    expect(r[2].out).toEqual(['    PID USER     CMD', '    812 root     nginx: master process /usr/sbin/nginx', '    813 www-data nginx: worker process']);
  });
});
