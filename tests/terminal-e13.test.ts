import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { E13_COMMANDS, HTTP_PROFILE, run, TLS_PROFILE } from '@/lib/terminal/shell';
import { builtin, certPem, certsIn, keyIn, keyMatches, keyPem, nameMatches, sha1, skiOf, verifyChain, type Cert } from '@/lib/terminal/tls';
import { callbackLines } from '@/lib/terminal/openssl';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { httpMachine } from './support/server-fixture';
import { acmeMachine, tlsClient, tlsServer } from './support/web-fixture';

/*
 * Engine stage E13 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §11): the tls profile — certificates as simulated PEM files,
 * OpenSSL's chain building and verify errors (0, 10, 18, 20, 21, 62), openssl x509/s_client/verify, curl's HTTPS with the
 * trust store (60 and -k), certbot's ACME HTTP-01 flow with its files, renewal window, dry run, timer and hooks, and the
 * lesson data and the cert check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, TLS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const cli = (...commands: string[]) => session(tlsClient, ...commands).last;
/** web-03's certificate files on a machine of its own (the learner reads them there). */
const web03: TerminalMachine = { id: 'web-03', title: 'web-03', user: 'learner', cwd: '/home/learner', host: 'web-03', profile: 'tls', certificates: tlsServer.certificates,
  files: [{ path: '/home', kind: 'dir', mode: 0o755, owner: 'root' }, { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' }] };
const on03 = (...commands: string[]) => session(web03, ...commands).last;
const code = (from: TerminalMachine, ...commands: string[]) => session(from, ...commands, 'echo $?').last.out[0];
const SSL_HELP = ['More details here: https://curl.se/docs/sslcerts.html', '', 'curl failed to verify the legitimacy of the server and therefore could not',
  'establish a secure connection to it. To learn more about this situation and', 'how to fix it, please visit the web page mentioned above.'];
const DASH = '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -';
const ROOT = 'C = US, O = Internet Security Research Group, CN = ISRG Root X1', R11 = "C = US, O = Let's Encrypt, CN = R11";

describe('the tls profile', () => {
  it('is the http profile plus openssl and certbot; the http profile refuses them', () => {
    expect([...TLS_PROFILE.commands].sort()).toEqual([...HTTP_PROFILE.commands, ...E13_COMMANDS].sort());
    expect(TLS_PROFILE.features).toEqual([...HTTP_PROFILE.features!, 'tls']);
    expect(profileOf(tlsClient)).toBe(TLS_PROFILE);
    for (const cmd of E13_COMMANDS) {
      expect(run(machineState(httpMachine), `${cmd} version`, HTTP_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(cli(`${cmd} --help`).out[0], cmd).toBe(`用法：${SERVER_MANUAL[cmd].usage}`);
    }
  });
  it('leaves http machines as they were (no trust store) and keeps E12\'s HTTPS stop there', () => {
    expect(machineState(httpMachine).nodes.has('/etc/ssl/certs/ca-certificates.crt')).toBe(false);
    const http = run(machineState({ ...tlsClient, profile: 'http', remotes: [{ ...tlsServer, certificates: undefined, processes: [{ pid: 900, user: 'root', command: 'shopd', listen: [{ port: 443, http: 'shop' }] }] }] }), 'curl https://shop.example.org/', HTTP_PROFILE);
    expect(http.lines.map(l => l.text)).toEqual(['curl: (35) 模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP']);
    expect(machineProblems({ ...httpMachine, certificates: [{ id: 'x', cn: 'x' }] }).join('\n')).toMatch(/certificates, trust, certbot, listen\.tls and a route root need the tls profile \(engine stage E13\)/);
    expect(machineProblems({ ...tlsClient, nginx: true }).join('\n')).toMatch(/nginx needs the nginx profile \(engine stage E14\)/);
  });
});

describe('certificates', () => {
  const now = Date.UTC(2026, 10, 22, 10) / 1000;
  const leaf = (patch: Partial<Cert> = {}): Cert => ({ serial: '01', subject: [['CN', 'a.example']], issuer: builtin()['lets-encrypt-r11'].subject, notBefore: now - 86400, notAfter: now + 86400,
    key: 'ec256', ski: skiOf('a'), aki: builtin()['lets-encrypt-r11'].ski, sans: ['a.example', '*.b.example'], ca: false, ...patch });
  it('round-trips through PEM, matches keys by their key identifier, and hashes like SHA-1', () => {
    const c = leaf();
    expect(certPem(c)).toMatch(/^-----BEGIN CERTIFICATE-----\n([A-Za-z0-9+/=]{64}\n)+[A-Za-z0-9+/=]{1,64}\n-----END CERTIFICATE-----\n$/);
    expect(certsIn(`junk\n${certPem(c)}${certPem(builtin()['lets-encrypt-r11'])}`)).toEqual([c, builtin()['lets-encrypt-r11']]);
    expect(keyMatches(keyIn(keyPem({ type: 'ec256', seed: 'a' }))!, c)).toBe(true);
    expect(keyMatches(keyIn(keyPem({ type: 'ec256', seed: 'b' }))!, c)).toBe(false);
    expect(Array.from(sha1(new TextEncoder().encode('abc')), b => b.toString(16).padStart(2, '0')).join('')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect([nameMatches(c, 'A.EXAMPLE'), nameMatches(c, 'x.b.example'), nameMatches(c, 'b.example'), nameMatches(c, 'y.x.b.example')]).toEqual(['a.example', '*.b.example', undefined, undefined]);
  });
  it('builds chains like OpenSSL: 0, 20 and 21 for a missing intermediate, 10 for expiry, 18 self-signed, 62 for the name', () => {
    const trust = [builtin()['isrg-root-x1']], r11 = builtin()['lets-encrypt-r11'];
    expect(verifyChain([leaf(), r11], trust, now)).toMatchObject({ first: 0, last: 0, chain: [leaf(), r11, trust[0]] });
    const bare = verifyChain([leaf()], trust, now);
    expect(bare.events.map(e => [e.depth, e.error])).toEqual([[0, 20], [0, 21], [0, 0]]);
    expect(callbackLines(bare.events)).toEqual(['depth=0 CN = a.example', 'verify error:num=20:unable to get local issuer certificate', 'verify return:1',
      'depth=0 CN = a.example', 'verify error:num=21:unable to verify the first certificate', 'verify return:1', 'depth=0 CN = a.example', 'verify return:1']);
    const old = verifyChain([leaf({ notAfter: now - 1 }), r11], trust, now);
    expect(old).toMatchObject({ first: 10, last: 10 });
    expect(callbackLines(old.events).slice(-7)).toEqual(['depth=0 CN = a.example', 'verify error:num=10:certificate has expired', 'notAfter=Nov 22 09:59:59 2026 GMT', 'verify return:1',
      'depth=0 CN = a.example', 'notAfter=Nov 22 09:59:59 2026 GMT', 'verify return:1']);
    const self = leaf({ issuer: [['CN', 'a.example']], aki: undefined });
    expect(verifyChain([self], trust, now)).toMatchObject({ first: 18 });
    expect(verifyChain([self], [...trust, self], now)).toMatchObject({ first: 0 });
    expect(verifyChain([leaf(), r11], trust, now, 'c.example')).toMatchObject({ first: 62, last: 62 });
  });
});

describe('openssl', () => {
  it('x509 prints the fields in the order asked, -checkend sets the status, and reads a pipe', () => {
    expect(on03('openssl x509 -in /etc/ssl/shop/fullchain.pem -noout -subject -issuer -dates -serial -ext subjectAltName').out).toEqual(['subject=CN = shop.example.org', `issuer=${R11}`, 'notBefore=Nov  1 09:00:00 2026 GMT', 'notAfter=Jan 30 08:59:59 2027 GMT',
      expect.stringMatching(/^serial=0[3-6][0-9A-F]{34}$/), 'X509v3 Subject Alternative Name:', '    DNS:shop.example.org, DNS:www.shop.example.org']);
    expect(cli('openssl x509 -in /etc/ssl/certs/ca-certificates.crt -noout -enddate -fingerprint -sha256').out).toEqual(['notAfter=Jun  4 11:04:38 2035 GMT', expect.stringMatching(/^sha256 Fingerprint=([0-9A-F]{2}:){31}[0-9A-F]{2}$/)]);
    expect(cli('openssl x509 -in /etc/ssl/certs/ca-certificates.crt -noout -fingerprint').out[0]).toMatch(/^SHA1 Fingerprint=([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
    expect(code(tlsClient, 'openssl x509 -in /etc/ssl/certs/ca-certificates.crt -noout -checkend 86400')).toBe('0');
    expect(cli('openssl s_client -connect old.example.org:9443 2>/dev/null | openssl x509 -noout -enddate -checkend 0').out).toEqual(['notAfter=Oct 29 23:59:59 2026 GMT', 'Certificate will expire']);
    expect(session(tlsClient, 'openssl s_client -connect old.example.org:9443 2>/dev/null | openssl x509 -noout -checkend 0', 'echo $?').last.out).toEqual(['1']);
    expect(cli('openssl x509 -in nope.pem -noout -subject').err).toEqual(['Could not open file or uri for loading certificate from nope.pem', 'Unable to load certificate']);
    expect(cli('openssl x509 -in /etc/hostname -noout -subject').err[0]).toMatch(/^Could not (open file or uri for loading|read) certificate/);
    expect(cli('openssl x509 -noout -subject').err[0]).toMatch(/模擬環境沒有鍵盤輸入/);
    expect(cli('openssl x509 -text -in x').err[0]).toMatch(/不印 -text/);
    expect(cli('openssl genrsa 2048').err).toEqual(["Invalid command 'genrsa'; type \"help\" for a list.", '模擬環境的 openssl 只支援 x509、s_client、verify 與 version']);
  });
  it('s_client shows the chain and OpenSSL\'s verdict: ok, an incomplete chain, an expired leaf, a name checked only when asked', () => {
    const ok = cli('openssl s_client -connect shop.example.org:443 -servername shop.example.org');
    expect(ok.err).toEqual([`depth=2 ${ROOT}`, 'verify return:1', `depth=1 ${R11}`, 'verify return:1', 'depth=0 CN = shop.example.org', 'verify return:1', 'DONE']);
    expect(ok.out.slice(0, 11)).toEqual(['CONNECTED(00000003)', '---', 'Certificate chain', ' 0 s:CN = shop.example.org', `   i:${R11}`, '   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: RSA-SHA256',
      '   v:NotBefore: Nov  1 09:00:00 2026 GMT; NotAfter: Jan 30 08:59:59 2027 GMT', ` 1 s:${R11}`, `   i:${ROOT}`, '   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256',
      '   v:NotBefore: Mar 13 00:00:00 2024 GMT; NotAfter: Mar 12 23:59:59 2027 GMT']);
    expect(ok.out).toEqual(expect.arrayContaining(['Server certificate', 'subject=CN = shop.example.org', 'Verification: OK', 'Verify return code: 0 (ok)']));
    const bare = cli('openssl s_client -connect bare.example.org:8443');
    expect(bare.err.slice(0, 3)).toEqual(['depth=0 CN = bare.example.org', 'verify error:num=20:unable to get local issuer certificate', 'verify return:1']);
    expect(bare.out).toEqual(expect.arrayContaining(['Verification error: unable to verify the first certificate', 'Verify return code: 21 (unable to verify the first certificate)']));
    expect(cli('openssl s_client -connect old.example.org:9443').out).toContain('Verify return code: 10 (certificate has expired)');
    expect(cli('openssl s_client -connect shop.example.org:443 -servername shop.example.org -verify_hostname wrong.example.org').out).toContain('Verify return code: 62 (hostname mismatch)');
    expect(cli('openssl s_client -connect plain.example.org:80')).toMatchObject({ err: ['error:0A00010B:SSL routines::wrong version number'] });
    expect(cli('openssl s_client -connect shop.example.org:444').err).toEqual(['connect:errno=111']);
    expect(cli('openssl s_client -connect nope.example.org:443').err[0]).toBe('BIO_lookup_ex:system lib:Name or service not known');
  });
  it('verify checks the first certificate of a file; intermediates come with -untrusted; trusting an internal CA with -CAfile', () => {
    const on = (cmd: string) => on03(cmd);
    expect(on('openssl verify /etc/ssl/shop/fullchain.pem')).toEqual({ out: [], err: ['CN = shop.example.org', 'error 20 at 0 depth lookup: unable to get local issuer certificate', 'error /etc/ssl/shop/fullchain.pem: verification failed'] });
    expect(on('openssl verify -untrusted /etc/ssl/shop/fullchain.pem /etc/ssl/shop/fullchain.pem').out).toEqual(['/etc/ssl/shop/fullchain.pem: OK']);
    expect(on('openssl verify -untrusted /etc/ssl/shop/fullchain.pem /etc/ssl/old/fullchain.pem').err.slice(0, 2)).toEqual(['CN = old.example.org', 'error 10 at 0 depth lookup: certificate has expired']);
    expect(on('openssl verify /etc/ssl/intranet/fullchain.pem').err[1]).toBe('error 20 at 0 depth lookup: unable to get local issuer certificate');
    expect(on('openssl verify -CAfile /etc/ssl/internal/ca.pem /etc/ssl/intranet/fullchain.pem').out).toEqual(['/etc/ssl/intranet/fullchain.pem: OK']);
    expect(code(web03, 'openssl verify /etc/ssl/shop/fullchain.pem')).toBe('2');
  });
});

describe('HTTPS in curl', () => {
  it('-v shows curl 8.5\'s TLS lines and the server certificate, then HTTP on the encrypted connection', () => {
    const v = cli('curl -v https://www.shop.example.org/');
    expect(v.out).toEqual(['shop']);
    expect(v.err.slice(0, 26)).toEqual(['*   Trying 10.0.0.12:443...', '* Connected to www.shop.example.org (10.0.0.12) port 443', '* ALPN: curl offers h2,http/1.1',
      '* TLSv1.3 (OUT), TLS handshake, Client hello (1):', '*  CAfile: /etc/ssl/certs/ca-certificates.crt', '*  CApath: /etc/ssl/certs', '* TLSv1.3 (IN), TLS handshake, Server hello (2):',
      '* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):', '* TLSv1.3 (IN), TLS handshake, Certificate (11):', '* TLSv1.3 (IN), TLS handshake, CERT verify (15):',
      '* TLSv1.3 (IN), TLS handshake, Finished (20):', '* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):', '* TLSv1.3 (OUT), TLS handshake, Finished (20):',
      '* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey', '* ALPN: server accepted http/1.1', '* Server certificate:', '*  subject: CN=shop.example.org',
      '*  start date: Nov  1 09:00:00 2026 GMT', '*  expire date: Jan 30 08:59:59 2027 GMT', '*  subjectAltName: host "www.shop.example.org" matched cert\'s "www.shop.example.org"',
      "*  issuer: C=US; O=Let's Encrypt; CN=R11", '*  SSL certificate verify ok.', '*   Certificate level 0: Public key type EC/prime256v1 (256/128 Bits/secBits), signed using sha256WithRSAEncryption',
      '*   Certificate level 1: Public key type RSA (2048/112 Bits/secBits), signed using sha256WithRSAEncryption', '> GET / HTTP/1.1', '> Host: www.shop.example.org']);
    expect(v.err).toEqual(expect.arrayContaining(['>', '* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):', '< Strict-Transport-Security: max-age=63072000']));
    expect(cli('curl -sv https://shop.example.org/ https://shop.example.org/').err.filter(l => l.includes('Newsession') || l.includes('Re-using'))).toEqual(['* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):',
      '* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):', '* Re-using existing connection with host shop.example.org']);
  });
  it('fails with 60 for an incomplete chain, an expiry, another name; -k goes on; --cacert trusts an internal CA', () => {
    expect(cli('curl https://bare.example.org:8443/').err).toEqual(['curl: (60) SSL certificate problem: unable to get local issuer certificate', ...SSL_HELP]);
    expect(cli('curl https://old.example.org:9443/').err[0]).toBe('curl: (60) SSL certificate problem: certificate has expired');
    expect(cli('curl -v https://old.example.org:9443/').err.slice(8, 12)).toEqual(['* TLSv1.3 (IN), TLS handshake, Certificate (11):', '* TLSv1.3 (OUT), TLS alert, certificate expired (557)',
      '* SSL certificate problem: certificate has expired', '* Closing connection']);
    const other = cli('curl -v https://bare.example.org:443/');
    expect(other.err).toEqual(expect.arrayContaining(['*  subjectAltName does not match bare.example.org', "* SSL: no alternative certificate subject name matches target host name 'bare.example.org'",
      "curl: (60) SSL: no alternative certificate subject name matches target host name 'bare.example.org'"]));
    expect(code(tlsClient, 'curl -s https://old.example.org:9443/')).toBe('60');
    const k = cli('curl -kv https://old.example.org:9443/');
    expect(k.out).toEqual(['shop']);
    expect(k.err).toContain('*  SSL certificate verify result: certificate has expired (10), continuing anyway.');
    expect(cli('curl -s https://intranet.example.org:10443/').out).toEqual([]);
    const ca = on03('cat /etc/ssl/internal/ca.pem').out.join('\n');
    const withCa = session({ ...tlsClient, files: [...tlsClient.files, { path: '/home/learner/ca.pem', kind: 'file', mode: 0o644, owner: 'learner', content: `${ca}\n` }] }, 'curl -sv --cacert ca.pem https://intranet.example.org:10443/').last;
    expect(withCa.out).toEqual(['shop']);
    expect(withCa.err).toContain('*  CAfile: ca.pem');
    const trusted: TerminalMachine = { ...tlsClient, certificates: [], trust: ['internal-ca'] };
    expect(session(trusted, 'curl -s https://intranet.example.org:10443/').last.out).toEqual(['shop']);
  });
  it('-v --cacert names the file; a plain port gives 35 (wrong version number); plain HTTP to a TLS responder is an empty reply', () => {
    expect(cli('curl -sS https://plain.example.org:80/').err).toEqual(['curl: (35) OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number']);
    expect(cli('curl -sS http://shop.example.org:443/').err).toEqual(['curl: (52) Empty reply from server']);
    expect(cli('curl -sS --cacert missing.pem https://shop.example.org/').err).toEqual(['curl: (77) error setting certificate file: missing.pem']);
  });
});

describe('certbot (ACME HTTP-01)', () => {
  const issue = 'sudo certbot certonly --webroot -w /var/www/blog -d blog.example.net --agree-tos -m ops@example.net -n';
  it('validates through DNS and port 80, saves the lineage as certbot does and cleans the webroot up', () => {
    const s = session(acmeMachine, issue, 'sudo ls -l /etc/letsencrypt/live/blog.example.net', 'sudo ls -l /etc/letsencrypt/archive/blog.example.net', 'ls -a /var/www/blog');
    expect(s.log[0].out).toEqual(['Saving debug log to /var/log/letsencrypt/letsencrypt.log', 'Account registered.', 'Requesting a certificate for blog.example.net', '', 'Successfully received certificate.',
      'Certificate is saved at: /etc/letsencrypt/live/blog.example.net/fullchain.pem', 'Key is saved at:         /etc/letsencrypt/live/blog.example.net/privkey.pem',
      'This certificate expires on 2027-02-20.', 'These files will be updated when the certificate renews.', 'Certbot has set up a scheduled task to automatically renew this certificate in the background.',
      '', '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', 'If you like Certbot, please consider supporting our work by:',
      " * Donating to ISRG / Let's Encrypt:   https://letsencrypt.org/donate", ' * Donating to EFF:                    https://eff.org/donate-le', '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -']);
    expect(s.log[1].out.map(l => l.replace(/\s+/g, ' '))).toEqual(['-rw-r--r-- root root 692 README', 'lrwxrwxrwx root root 40 cert.pem -> ../../archive/blog.example.net/cert1.pem',
      'lrwxrwxrwx root root 41 chain.pem -> ../../archive/blog.example.net/chain1.pem', 'lrwxrwxrwx root root 45 fullchain.pem -> ../../archive/blog.example.net/fullchain1.pem',
      'lrwxrwxrwx root root 43 privkey.pem -> ../../archive/blog.example.net/privkey1.pem']);
    expect(s.log[2].out.filter(l => l.includes('privkey1'))[0]).toMatch(/^-rw------- root/);
    expect(s.log[3].out).toEqual(['.  ..  index.html']);
    const cert = session(s.state, 'sudo openssl x509 -in /etc/letsencrypt/live/blog.example.net/fullchain.pem -noout -issuer -dates', 'curl -s http://blog.example.net/').log;
    expect(cert[0].out).toEqual([`issuer=${R11}`, 'notBefore=Nov 22 09:00:00 2026 GMT', 'notAfter=Feb 20 08:59:59 2027 GMT']);
    expect(session(s.state, 'sudo certbot certificates').last.out.slice(3)).toEqual(['Found the following certs:', '  Certificate Name: blog.example.net', expect.stringMatching(/^ {4}Serial Number: [0-9a-f]+$/), '    Key Type: ECDSA',
      '    Domains: blog.example.net', '    Expiry Date: 2027-02-20 08:59:59+00:00 (VALID: 89 days)', '    Certificate Path: /etc/letsencrypt/live/blog.example.net/fullchain.pem',
      '    Private Key Path: /etc/letsencrypt/live/blog.example.net/privkey.pem', '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -']);
  });
  it('reports Let\'s Encrypt\'s problems: NXDOMAIN, an address with no machine, a webroot the server does not serve', () => {
    const r = session(acmeMachine, 'sudo certbot certonly --webroot -w /var/www/blog -d nope.example.net -d down.example.net --agree-tos --register-unsafely-without-email').last;
    expect(r.err.slice(0, 9)).toEqual(['', 'Certbot failed to authenticate some domains (authenticator: webroot). The Certificate Authority reported these problems:', '  Domain: nope.example.net', '  Type:   dns',
      '  Detail: DNS problem: NXDOMAIN looking up A for nope.example.net - check that a DNS record exists for this domain', '', '  Domain: down.example.net', '  Type:   connection',
      expect.stringMatching(/^ {2}Detail: 10\.0\.0\.77: Fetching http:\/\/down\.example\.net\/\.well-known\/acme-challenge\/[A-Za-z0-9_-]{43}: Timeout during connect \(likely firewall problem\)$/)]);
    expect(r.err.slice(-2)).toEqual(['Some challenges have failed.', expect.stringMatching(/^Ask for help/)]);
    const wrong = session({ ...acmeMachine, files: [...acmeMachine.files, { path: '/var/www/html', kind: 'dir', mode: 0o755, owner: 'root' }] },
      'sudo certbot certonly --webroot -w /var/www/html -d blog.example.net --agree-tos -m a@b.c').last.err;
    expect(wrong[4]).toMatch(/^ {2}Detail: 203\.0\.113\.10: Invalid response from http:\/\/blog\.example\.net\/\.well-known\/acme-challenge\/[A-Za-z0-9_-]{43}: 404$/);
    expect(code(acmeMachine, 'sudo certbot certonly --webroot -w /var/www/blog -d nope.example.net --agree-tos -m a@b.c')).toBe('1');
    expect(session(acmeMachine, 'certbot certificates').last.err).toEqual(['The following error was encountered:', "[Errno 13] Permission denied: '/var/log/letsencrypt/.certbot.lock'",
      'Either run as root, or set --config-dir, --work-dir, and --logs-dir to writeable paths.']);
    expect(session(tlsClient, 'sudo certbot certificates').last.err).toEqual(["Command 'certbot' not found, but can be installed with:", '', 'sudo apt install certbot']);
  });
  it('renews only within 30 days of expiry (or with --force-renewal); --dry-run simulates every certificate without writing', () => {
    const s = session(acmeMachine, issue).state;
    const renew = session(s, 'sudo certbot renew').last.out;
    expect(renew.slice(1)).toEqual(['', DASH, 'Processing /etc/letsencrypt/renewal/blog.example.net.conf', DASH, 'Certificate not yet due for renewal', '', DASH,
      'The following certificates are not due for renewal yet:', '  /etc/letsencrypt/live/blog.example.net/fullchain.pem expires on 2027-02-20 (skipped)', 'No renewals were attempted.', DASH]);
    const dry = session(s, 'sudo certbot renew --dry-run', 'sudo readlink /etc/letsencrypt/live/blog.example.net/cert.pem').log;
    expect(dry[0].out).toEqual(expect.arrayContaining(['Certificate not due for renewal, but simulating renewal for dry run', 'Simulating renewal of an existing certificate for blog.example.net',
      'Congratulations, all simulated renewals succeeded:', '  /etc/letsencrypt/live/blog.example.net/fullchain.pem (success)']));
    expect(dry[1].out).toEqual(['../../archive/blog.example.net/cert1.pem']);
    const forced = session(s, 'sudo certbot renew --force-renewal', 'sudo readlink /etc/letsencrypt/live/blog.example.net/cert.pem').log;
    expect(forced[0].out).toEqual(expect.arrayContaining(['Renewing an existing certificate for blog.example.net', 'Congratulations, all renewals succeeded:']));
    expect(forced[1].out).toEqual(['../../archive/blog.example.net/cert2.pem']);
    // 70 days later the certificate is inside the window: the timer's service renews it.
    const later: TerminalMachine = { ...acmeMachine, now: '2027-01-31 10:00:00', certbot: { lifetime: 90, account: true, certificates: [{ domains: ['blog.example.net'], webroot: '/var/www/blog', issued: '2026-11-22 10:00:00' }] } };
    const due = session(later, 'sudo certbot certificates', 'sudo systemctl start certbot.service', 'sudo readlink /etc/letsencrypt/live/blog.example.net/cert.pem', 'sudo journalctl -u certbot -n 3').log;
    expect(due[0].out).toContain('    Expiry Date: 2027-02-20 08:59:59+00:00 (VALID: 19 days)');
    expect(due[2].out).toEqual(['../../archive/blog.example.net/cert2.pem']);
    expect(due[3].out.at(-1)).toMatch(/systemd\[1\]: Finished certbot\.service - Certbot\.$/);
  });
  it('installs certbot.timer (enabled, twice a day) and runs a deploy hook after an issuance', () => {
    expect(session(acmeMachine, 'systemctl list-timers').last.out[1]).toMatch(/^Sun 2026-11-22 12:00:00 UTC 2h 0min\s+- +- +certbot\.timer certbot\.service$/);
    expect(session(acmeMachine, 'systemctl cat certbot.timer').last.out).toContain('OnCalendar=*-*-* 00,12:00:00');
    const hooked = session(acmeMachine, `${issue} --deploy-hook 'touch /var/www/blog/renewed'`, 'ls /var/www/blog', 'sudo grep renew_hook /etc/letsencrypt/renewal/blog.example.net.conf').log;
    expect(hooked[0].out).toContain('Running deploy-hook command: touch /var/www/blog/renewed');
    expect(hooked[1].out).toEqual(['index.html  renewed']);
    expect(hooked[2].out).toEqual(['renew_hook = touch /var/www/blog/renewed']);
  });
});

describe('lesson data', () => {
  const ex: TerminalExercise = {
    id: 'issue', title: '取得部落格的憑證', machine: 'web-04', statement: '用 webroot 方式替 blog.example.net 取得憑證。',
    checks: [{ kind: 'cert', path: '/etc/letsencrypt/live/blog.example.net/fullchain.pem', name: 'blog.example.net', issuer: 'R11', expiresAfter: '2027-01-01 00:00:00', valid: 'blog.example.net' }],
    solution: ['sudo certbot certonly --webroot -w /var/www/blog -d blog.example.net --agree-tos -m ops@example.net -n'],
    mistakes: [{ commands: ['sudo certbot certonly --webroot -w /var/www/blog -d nope.example.net --agree-tos -m ops@example.net -n'], why: '名稱沒有 DNS 記錄' }],
    hints: ['certbot certonly --webroot'], explanation: 'HTTP-01 由 CA 從網際網路取回 token。',
  };
  it('validates certificates, trust and certbot data; the cert check reads the file after the commands', () => {
    expect(machineProblems(tlsClient)).toEqual([]);
    expect(machineProblems(acmeMachine)).toEqual([]);
    expect(terminalContentProblems({ machines: [acmeMachine], examples: [], exercises: [ex] })).toEqual([]);
    expect(checkTerminalExercise(ex, [acmeMachine], []).results[0].message).toMatch(/的憑證應該涵蓋 blog\.example\.net.*，但這個檔案不存在$/);
    const bad = (patch: Partial<TerminalMachine>) => machineProblems({ ...tlsClient, ...patch }).join('\n');
    expect(bad({ certificates: [{ id: 'leaf', cn: 'x.example', issuer: 'nope' }] })).toMatch(/certificate leaf: unknown issuer nope/);
    expect(bad({ certificates: [{ id: 'a', cn: 'a.example' }, { id: 'b', cn: 'b.example', issuer: 'a' }] })).toMatch(/certificate b: its issuer a is not a CA/);
    expect(bad({ trust: ['shop'] })).toMatch(/trust shop: not a CA certificate of the lesson/);
    expect(bad({ certificates: [{ id: 'shop', cn: 'dup.example' }] })).toMatch(/certificate shop: the id is used twice/);
    expect(bad({ certbot: { lifetime: 0 } })).toMatch(/certbot lifetime must be 1\.\.3650 days/);
    const c = { machines: [tlsClient], examples: [], exercises: [{ ...ex, machine: 'cli-02', checks: [{ kind: 'http' as const, url: 'https://shop.example.org/', status: 200 }], solution: ['true'], mistakes: [{ commands: ['true'], why: 'x' }] }] };
    expect(checkTerminalExercise(c.exercises[0], [tlsClient], []).ok).toBe(true);
    expect(checkTerminalExercise({ ...c.exercises[0], checks: [{ kind: 'http', url: 'https://old.example.org:9443/' }] }, [tlsClient], []).results[0].message).toMatch(/憑證驗證失敗：certificate has expired$/);
    expect(terminalContentProblems({ machines: [httpMachine], examples: [], exercises: [{ ...ex, machine: 'cli-01', checks: [{ kind: 'cert', path: '/x' }] }] }).join('\n')).toMatch(/a cert check needs a tls machine/);
  });
});
