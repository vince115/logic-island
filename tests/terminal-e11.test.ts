import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { canonicalIPv6, loadZone, parseTtl, rrText, zoneAnswer } from '@/lib/terminal/dns';
import { DNS_PROFILE, E11_COMMANDS, run, SOCKETS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, variantMachine, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { dnsExercise, dnsMachine, nsLocal, nsRemote, sockMachine, ZONE } from './support/server-fixture';

/*
 * Engine stage E11 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §7): the dns profile — zone files (a BIND master file subset)
 * checked and loaded by named, rndc reload and systemctl, authoritative answers, the stub resolver on 127.0.0.53 with a
 * cache whose TTLs run down on the fixed clock, /etc/hosts before DNS for glibc's lookups (not for dig), dig's and host's
 * layouts, ssh resolving through DNS from this rank up, and the lesson data and the dns check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, DNS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const ws = (...commands: string[]) => session(dnsMachine, ...commands).last;
const ns = (...commands: string[]) => session(nsLocal, ...commands).last;
const T = '\t';

describe('the dns profile', () => {
  it('is the sockets profile plus dig, host, named-checkzone, rndc and resolvectl; the sockets profile refuses them', () => {
    expect([...DNS_PROFILE.commands].sort()).toEqual([...SOCKETS_PROFILE.commands, ...E11_COMMANDS].sort());
    expect(DNS_PROFILE.features).toEqual([...SOCKETS_PROFILE.features!, 'dns']);
    expect(profileOf(dnsMachine)).toBe(DNS_PROFILE);
    for (const cmd of E11_COMMANDS) {
      expect(run(machineState(sockMachine), `${cmd} x`, SOCKETS_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(ws(`${cmd} --help`).out[0], cmd).toBe(`用法：${SERVER_MANUAL[cmd].usage}`);
    }
    // Below the dns profile, a name is found by /etc/hosts and the lesson's names, never by DNS.
    expect(machineState(sockMachine).nodes.has('/etc/resolv.conf')).toBe(false);
    expect(machineState(dnsMachine).nodes.get('/etc/resolv.conf')!.content).toContain('nameserver 127.0.0.53');
  });
});

describe('zone files', () => {
  it('parse $ORIGIN, $TTL, @, relative names, parentheses and comments; TTL units; canonical IPv6', () => {
    const z = loadZone('example.com', ZONE, 'db').zone!;
    expect(z.serial).toBe(2026112201);
    expect(z.negativeTtl).toBe(300);
    expect(z.records.map(r => `${r.name} ${r.ttl} ${r.type} ${r.data}`)).toEqual([
      'example.com. 3600 SOA ns1.example.com. hostmaster.example.com. 2026112201 3600 900 1209600 300', 'example.com. 3600 NS ns1.example.com.', 'example.com. 3600 A 203.0.113.10',
      'example.com. 3600 MX 10 mail.example.com.', 'example.com. 3600 TXT "v=spf1 mx -all"', 'ns1.example.com. 3600 A 10.0.0.53', 'mail.example.com. 3600 A 203.0.113.25',
      'www.example.com. 300 CNAME example.com.', 'cdn.example.com. 3600 CNAME edge.cdn.example.net.', 'v6.example.com. 3600 AAAA 2001:db8::10']);
    expect([parseTtl('1h30m'), parseTtl('1d'), parseTtl('1w'), parseTtl('x')]).toEqual([5400, 86400, 604800, undefined]);
    expect([canonicalIPv6('2001:DB8:0:0:1:0:0:1'), canonicalIPv6('::1'), canonicalIPv6('fe80::0:0:1'), canonicalIPv6('1::2::3'), canonicalIPv6('2001:db8::g')]).toEqual(['2001:db8::1:0:0:1', '::1', 'fe80::1', undefined, undefined]);
  });
  it('a name without its final dot is relative to the origin (the classic mistake)', () => {
    const z = loadZone('example.com', `${ZONE}shop IN CNAME example.com\n`, 'db').zone!;
    expect(z.records.at(-1)).toMatchObject({ name: 'shop.example.com.', data: 'example.com.example.com.' });
  });
  it('reports what BIND reports and refuses to load', () => {
    const bad = (extra: string) => loadZone('example.com', ZONE + extra, '/etc/bind/db.example.com');
    expect(bad('x IN A 10.0.0.300\n').messages).toEqual(["dns_rdata_fromtext: /etc/bind/db.example.com:18: near '10.0.0.300': bad dotted quad",
      'zone example.com/IN: loading from master file /etc/bind/db.example.com failed: bad dotted quad', 'zone example.com/IN: not loaded due to errors.']);
    expect(bad('www IN A 203.0.113.11\n').messages[0]).toBe('/etc/bind/db.example.com:18: www.example.com: CNAME and other data');
    expect(bad('@ IN NS ns2.example.com.\n').messages.slice(-2)).toEqual(["zone example.com/IN: NS 'ns2.example.com' has no address records (A or AAAA)", 'zone example.com/IN: not loaded due to errors.']);
    expect(bad('x IN PTR y.\n').failure).toMatch(/只支援 SOA、NS、A、AAAA、CNAME、MX、TXT/);
    expect(bad('x IN FOO y\n').failure).toBe("unknown RR type 'FOO'");
    expect(bad('a.other.org. IN A 192.0.2.1\n')).toMatchObject({ messages: ['/etc/bind/db.example.com:18: ignoring out-of-zone data (a.other.org)', 'zone example.com/IN: loaded serial 2026112201'] });
    expect(loadZone('example.com', '$TTL 300\n@ IN NS ns1\nns1 IN A 10.0.0.53\n', 'db').messages).toEqual(['zone example.com/IN: has 0 SOA records', 'zone example.com/IN: not loaded due to errors.']);
    expect(loadZone('example.com', '@ IN SOA ns1 h 1 2 3 4 5 )\n', 'db').failure).toBe('unbalanced parentheses');
    expect(bad('@ IN MX 20 mx2\n').messages).toContain("zone example.com/IN: example.com/MX 'mx2.example.com' has no address records (A or AAAA)");
  });
  it('answers authoritatively: in-zone CNAMEs followed, NODATA and NXDOMAIN with the SOA at the negative TTL', () => {
    const z = loadZone('example.com', ZONE, 'db').zone!;
    expect(zoneAnswer(z, 'www.example.com.', 'A').answer.map(r => r.type)).toEqual(['CNAME', 'A']);
    expect(zoneAnswer(z, 'mail.example.com.', 'AAAA')).toMatchObject({ rcode: 'NOERROR', answer: [], authority: [{ type: 'SOA', ttl: 300 }] });
    expect(zoneAnswer(z, 'nope.example.com.', 'A')).toMatchObject({ rcode: 'NXDOMAIN', authority: [{ type: 'SOA' }] });
  });
});

describe('named-checkzone, rndc and named', () => {
  it('named-checkzone prints the load and OK, or the errors and exit 1', () => {
    expect(ns('named-checkzone example.com /etc/bind/db.example.com').out).toEqual(['zone example.com/IN: loaded serial 2026112201', 'OK']);
    expect(ns("echo 'bad IN A 1.2.3.400' | sudo tee -a /etc/bind/db.example.com", 'named-checkzone example.com /etc/bind/db.example.com', 'echo $?').out).toEqual(['1']);
    expect(ns('named-checkzone example.com /etc/bind/none').out).toEqual(['zone example.com/IN: loading from master file /etc/bind/none failed: file not found', 'zone example.com/IN: not loaded due to errors.']);
  });
  it('named serves what it loaded: an edited zone file changes nothing until rndc reload; a failed reload keeps the old zone', () => {
    const add = "echo 'api IN A 203.0.113.30' | sudo tee -a /etc/bind/db.example.com";
    expect(ns(add, 'dig @127.0.0.1 api.example.com +short').out).toEqual([]);
    expect(ns(add, 'sudo rndc reload example.com').out).toEqual(['zone reload queued']);
    expect(ns(add, 'sudo rndc reload example.com', 'dig @127.0.0.1 api.example.com +short').out).toEqual(['203.0.113.30']);
    expect(ns('sudo rndc reload example.com').out).toEqual(['zone reload up-to-date']);
    expect(ns('sudo rndc reload').out).toEqual(['server reload successful']);
    const broken = ns(add, 'sudo rndc reload', "echo 'x IN A 1.2.3.400' | sudo tee -a /etc/bind/db.example.com", 'sudo rndc reload example.com');
    expect(broken.err).toEqual(["rndc: 'reload' failed: bad dotted quad"]);
    expect(ns(add, 'sudo rndc reload', "echo 'x IN A 1.2.3.400' | sudo tee -a /etc/bind/db.example.com", 'sudo rndc reload example.com', 'dig @127.0.0.1 api.example.com +short').out).toEqual(['203.0.113.30']);
    expect(ns('rndc reload').err).toEqual(['rndc: neither /etc/bind/rndc.conf nor /etc/bind/rndc.key was found']);
    expect(ns('sudo rndc reload other.org').err).toEqual(["rndc: 'reload' failed: not found", "no matching zone 'other.org' in any view"]);
    expect(ns('sudo rndc status').err[0]).toMatch(/只支援 reload/);
  });
  it('systemctl reload named reloads; a restart with a broken zone answers SERVFAIL; a stopped named refuses rndc', () => {
    expect(ns("echo 'api IN A 203.0.113.30' | sudo tee -a /etc/bind/db.example.com", 'sudo systemctl reload named', 'dig @127.0.0.1 api.example.com +short').out).toEqual(['203.0.113.30']);
    const s = session(nsLocal, "echo 'x IN A 1.2.3.400' | sudo tee -a /etc/bind/db.example.com", 'sudo systemctl restart named', 'dig @127.0.0.1 example.com');
    expect(s.last.out).toContain(';; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: ' + s.last.out.find(l => l.includes('SERVFAIL'))!.split('id: ')[1]);
    expect(session(nsLocal, "echo 'x IN A 1.2.3.400' | sudo tee -a /etc/bind/db.example.com", 'sudo systemctl restart named', 'sudo journalctl -u named -n 3 -o cat').last.out)
      .toEqual(['zone example.com/IN: not loaded due to errors.', 'all zones loaded', 'running']);
    expect(ns('sudo systemctl stop named', 'sudo rndc reload').err).toEqual(['rndc: connect failed: 127.0.0.1#953: connection refused']);
    expect(ns('sudo systemctl stop named', 'dig @127.0.0.1 example.com +short').err[0]).toBe(';; communications error to 127.0.0.1#53: connection refused');
    expect(machineState({ ...nsLocal, named: 'stopped' }).processes!.some(p => p.command.includes('named'))).toBe(false);
  });
});

describe('dig and host', () => {
  it('dig @server: BIND 9.18\'s layout, the authoritative flags and the warning, columns at 24, 32, 40 and 48', () => {
    const out = ws('dig @ns1 www.example.com').out;
    const id = out[5].split('id: ')[1];
    expect(out).toEqual(['', '; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> @ns1 www.example.com', '; (1 server found)', ';; global options: +cmd', ';; Got answer:',
      `;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: ${id}`, ';; flags: qr aa rd; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1', ';; WARNING: recursion requested but not available', '',
      ';; OPT PSEUDOSECTION:', '; EDNS: version: 0, flags:; udp: 1232', ';; QUESTION SECTION:', `;www.example.com.${T}${T}IN${T}A`, '', ';; ANSWER SECTION:',
      `www.example.com.${T}300${T}IN${T}CNAME${T}example.com.`, `example.com.${T}${T}3600${T}IN${T}A${T}203.0.113.10`, '', ';; Query time: 0 msec', ';; SERVER: 10.0.0.53#53(10.0.0.53) (UDP)',
      ';; WHEN: Sun Nov 22 10:00:00 UTC 2026', ';; MSG SIZE  rcvd: 74', '']);
    expect(rrText({ name: 'a-very-long-owner-name.example.com.', ttl: 60, type: 'A', data: '192.0.2.1' })).toBe(`a-very-long-owner-name.example.com. 60 IN A${T}192.0.2.1`);
    expect(rrText({ name: 'example.com.', type: 'A' }, true)).toBe(`;example.com.${T}${T}${T}IN${T}A`);
  });
  it('+short, +noall +answer, types, NXDOMAIN with the SOA, REFUSED off the server\'s zones, unreachable servers', () => {
    expect(ws('dig @ns1 example.com MX +short').out).toEqual(['10 mail.example.com.']);
    expect(ws('dig @ns1 example.com TXT +noall +answer').out).toEqual([`example.com.${T}${T}3600${T}IN${T}TXT${T}"v=spf1 mx -all"`]);
    expect(ws('dig @ns1 -t AAAA v6.example.com +short').out).toEqual(['2001:db8::10']);
    const nx = ws('dig @ns1 nope.example.com').out;
    expect(nx.find(l => l.includes('status:'))).toMatch(/status: NXDOMAIN/);
    expect(nx).toContain(`example.com.${T}${T}300${T}IN${T}SOA${T}ns1.example.com. hostmaster.example.com. 2026112201 3600 900 1209600 300`);
    const refused = ws('dig @ns1 example.org').out;
    expect(refused.find(l => l.includes('status:'))).toMatch(/status: REFUSED/);
    expect(refused).toContain(';; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1');
    const gone = ws('dig @10.0.0.99 example.com');
    expect(gone.err).toEqual(Array(3).fill(';; communications error to 10.0.0.99#53: timed out'));
    expect(gone.out).toEqual(['', '; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> @10.0.0.99 example.com', '; (1 server found)', ';; global options: +cmd', ';; no servers could be reached', '']);
    expect(session(dnsMachine, 'dig @10.0.0.99 example.com', 'echo $?').last.out).toEqual(['9']);
    expect(ws('dig @nowhere example.com').err).toEqual(["dig: couldn't get address for 'nowhere': not found"]);
    expect(ws('dig example.com +bogus').err[0]).toBe('Invalid option: +bogus');
  });
  it('host: one sentence per record; NXDOMAIN exits 1; a server prints its block first', () => {
    expect(ws('host www.example.com ns1').out).toEqual(['Using domain server:', 'Name: ns1', 'Address: 10.0.0.53#53', 'Aliases:', '', 'www.example.com is an alias for example.com.',
      'example.com has address 203.0.113.10', 'example.com mail is handled by 10 mail.example.com.']);
    expect(ws('host -t TXT example.com ns1').out.at(-1)).toBe('example.com descriptive text "v=spf1 mx -all"');
    expect(ws('host -t MX mail.example.com ns1').out.at(-1)).toBe('mail.example.com has no MX record');
    expect(session(dnsMachine, 'host nope.example.com', 'echo $?').log.map(l => l.out)).toEqual([['Host nope.example.com not found: 3(NXDOMAIN)'], ['1']]);
  });
});

describe('the resolver and its cache', () => {
  it('answers from the cache with the TTL left: ttl − (now − cachedAt); the authoritative server already has the new address', () => {
    expect(ws('dig example.com +noall +answer').out).toEqual([`example.com.${T}${T}2400${T}IN${T}A${T}198.51.100.99`]);
    expect(ws('dig @ns1 example.com +short').out).toEqual(['203.0.113.10']);
    expect(ws('dig example.com').out).toContain(';; Query time: 0 msec');
    const later = variantMachine(dnsMachine, { label: '十分鐘後', files: [], now: '2026-11-22 10:10:00' });
    expect(session(later, 'dig example.com +noall +answer').last.out).toEqual([`example.com.${T}${T}1800${T}IN${T}A${T}198.51.100.99`]);
  });
  it('a negative answer is cached too (the SOA at the TTL left); an expired entry is asked again and cached at now', () => {
    expect(ws('dig gone.example.com').out).toContain(`example.com.${T}${T}180${T}IN${T}SOA${T}ns1.example.com. hostmaster.example.com. 2026112201 3600 900 1209600 300`);
    const s = session(dnsMachine, 'dig old.example.com +noall +answer');
    expect(s.last.out).toEqual([]);
    expect(s.state.dns!.cache.find(e => e.name === 'old.example.com.')).toMatchObject({ negative: 'NXDOMAIN', ttl: 300, cachedAt: machineState(dnsMachine).clock!.now });
    // www is not cached: the answer (the CNAME and, in the same zone, the new A) is fetched, cached at now and replaces the old A.
    const fresh = session(dnsMachine, 'dig www.example.com +noall +answer', 'dig example.com +noall +answer');
    expect(fresh.log.map(l => l.out)).toEqual([[`www.example.com.${T}300${T}IN${T}CNAME${T}example.com.`, `example.com.${T}${T}3600${T}IN${T}A${T}203.0.113.10`],
      [`example.com.${T}${T}3600${T}IN${T}A${T}203.0.113.10`]]);
    expect(session(dnsMachine, 'dig www.example.com', 'dig www.example.com').log.map(l => l.out.find(x => x.startsWith(';; Query time')))).toEqual([';; Query time: 24 msec', ';; Query time: 0 msec']);
    expect(ws('dig cdn.example.com').out).toContain(';; Query time: 24 msec');
  });
  it('resolvectl flush-caches (root) forgets the old address; CNAMEs are chased across zones', () => {
    expect(ws('sudo resolvectl flush-caches', 'dig example.com +short').out).toEqual(['203.0.113.10']);
    expect(ws('resolvectl flush-caches').err).toEqual(['Failed to flush caches: Interactive authentication required.']);
    expect(ws('dig cdn.example.com +short').out).toEqual(['edge.cdn.example.net.', '192.0.2.80']);
  });
  it('/etc/hosts comes first for glibc (getent, curl, ssh) and for resolved (TTL 0), never for a DNS server', () => {
    expect(ws('getent hosts ns1').out).toEqual(['10.0.0.53       ns1']);
    expect(ws('dig ns1 +noall +answer').out).toEqual([`ns1.${T}${T}${T}0${T}IN${T}A${T}10.0.0.53`]);
    expect(ws('dig @ns1 ns1 +short').out).toEqual([]);
    expect(ws('getent hosts www.example.com').out).toEqual(['198.51.100.99   example.com www.example.com']);
  });
  it('a zone whose server is down answers SERVFAIL; glibc then fails temporarily', () => {
    const down: TerminalMachine = { ...dnsMachine, dnsCache: [], remotes: [{ ...nsRemote, named: 'stopped' }] };
    expect(session(down, 'dig mail.example.com').last.out.find(l => l.includes('status:'))).toMatch(/status: SERVFAIL/);
    expect(session(down, 'nc -zv mail.example.com 25').last.err).toEqual(['nc: getaddrinfo for host "mail.example.com" port 25: Temporary failure in name resolution']);
  });
  it('ssh looks names up through DNS from this profile up: unknown names, and addresses no machine has', () => {
    expect(ws('ssh -o BatchMode=yes nope.example.com true').err).toEqual(['ssh: Could not resolve hostname nope.example.com: Name or service not known']);
    expect(ws('ssh -o BatchMode=yes edge.cdn.example.net true').err).toEqual(['ssh: connect to host edge.cdn.example.net port 22: Connection timed out']);
    expect(ws('ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ns1 true').err[0]).toBe("Warning: Permanently added 'ns1' (ED25519) to the list of known hosts.");
  });
});

describe('lesson data', () => {
  const content = (): TerminalLessonContent => ({
    machines: [nsLocal, dnsMachine],
    examples: [{ id: 'short', title: '+short', description: '只印資料。', machine: 'ws-01', steps: [{ command: 'dig @ns1 www.example.com +short', output: 'example.com.\n203.0.113.10' }] }],
    exercises: [dnsExercise],
  });
  it('validates the E11 content; the dns check reads the answers after the commands', () => {
    expect(terminalContentProblems(content())).toEqual([]);
    expect(checkTerminalExercise(dnsExercise, [nsLocal], dnsExercise.mistakes[0].commands).results[0].message).toBe('本機解析器查到的 api.example.com 的 A 記錄應該是 203.0.113.30，但查詢的結果是 NXDOMAIN');
    const auth = { ...dnsExercise, machine: 'ws-01', checks: [{ kind: 'dns' as const, name: 'example.com', values: ['203.0.113.10'], server: 'ns1' }, { kind: 'dns' as const, name: 'example.com', values: ['198.51.100.99'] }] };
    expect(checkTerminalExercise(auth, [dnsMachine], []).ok).toBe(true);
  });
  it('reports bad DNS data', () => {
    const p = (patch: Partial<TerminalMachine>) => machineProblems({ ...dnsMachine, ...patch }).join('\n');
    expect(machineProblems({ ...sockMachine, named: true }).join('\n')).toMatch(/named, dnsCache and internet need the dns profile \(engine stage E11\)/);
    expect(p({ dnsCache: [{ name: 'x.example.com', type: 'A', ttl: 60, cachedAt: '2026-11-22 11:00:00', data: ['1.2.3.4'] }] })).toMatch(/cachedAt must be a time YYYY-MM-DD HH:MM:SS not after now/);
    expect(p({ dnsCache: [{ name: 'x.example.com', type: 'A', ttl: 60, cachedAt: '2026-11-22 09:00:00' }] })).toMatch(/needs data/);
    expect(p({ internet: [{ zone: 'bad.org', text: '@ IN A 1.2.3.4\n' }] })).toMatch(/internet zone bad\.org: .*no TTL specified/);
    const c = content();
    c.exercises[0] = { ...dnsExercise, checks: [{ kind: 'dns', name: 'api.example.com', server: 'ns9' }] };
    expect(terminalContentProblems(c).join('\n')).toMatch(/a dns check needs a dns machine/);
  });
});
