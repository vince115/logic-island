import { resolvePath, type FsState } from './fs';
import { reach, type NetIo, type NetResult } from './sockets';
import {
  asn1Time, certBytes, certPem, certsIn, dnText, keyBits, nowOf, readAs, serialText, sha1, trustOf, VERIFY_TEXT, verifyChain, type Cert, type VerifyEvent,
} from './tls';
import { sha256 } from './ssh';
import { tlsServer } from './http';

/*
 * Engine stage E13 (SRV0_SERVER_CAPABILITY.md §11.3): openssl 3.0.13 as on Ubuntu 24.04, the parts a server administrator
 * reads certificates with — x509 (subject, issuer, dates, SANs, -checkend, fingerprints), s_client (the chain a server
 * sends and OpenSSL's verdict, as if its standard input were empty) and verify. OpenSSL's error-stack lines (with memory
 * addresses and source file names) are left out of the messages; the first line of each message is OpenSSL's own.
 */

export const OPENSSL_VERSION = 'OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)';
const fingerprint = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
const sigName = (issuer: Cert['key']) => issuer.startsWith('rsa') ? 'RSA-SHA256' : issuer === 'ec384' ? 'ecdsa-with-SHA384' : 'ecdsa-with-SHA256';
const pkeyName = (c: Cert) => c.key.startsWith('rsa') ? 'rsaEncryption' : 'id-ecPublicKey';

/** Reads the certificates of a file (as the user) or of standard input: OpenSSL's messages when it cannot. */
function load(state: FsState, io: NetIo, file: string | undefined, what = 'certificate'): Cert[] | null {
  if (file === undefined) {
    if (io.stdin === null || io.stdin === undefined) { io.err(`模擬環境沒有鍵盤輸入：請用 -in 檔案，或從管線送入憑證（openssl s_client … | openssl x509 …）`); return null; }
    const certs = certsIn(io.stdin);
    if (!certs.length) { io.err(`Could not read ${what} from <stdin>`); io.err(`Unable to load ${what}`); return null; }
    return certs;
  }
  const r = readAs(state, io.user, resolvePath(state, file));
  if ('error' in r) { io.err(`Could not open file or uri for loading ${what} from ${file}`); io.err(`Unable to load ${what}`); return null; }
  const certs = certsIn(r.text);
  if (!certs.length) { io.err(`Could not read ${what} from ${file}`); io.err(`Unable to load ${what}`); return null; }
  return certs;
}

/** openssl x509 [-in f] [-noout] [-subject] [-issuer] [-dates] [-startdate] [-enddate] [-serial] [-ext names] [-fingerprint [-sha1|-sha256]] [-checkend N]. */
function x509(state: FsState, args: readonly string[], io: NetIo): number {
  let file: string | undefined, noout = false, checkend: number | undefined, digest = 'SHA1';
  const order: { what: string; arg?: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i].replace(/^--/, '-');
    const value = () => args[++i];
    switch (a) {
      case '-in': file = value(); if (file === undefined) { io.err('x509: Option -in needs a value'); io.err('x509: Use -help for summary.'); return 1; } break;
      case '-noout': noout = true; break;
      case '-subject': case '-issuer': case '-dates': case '-startdate': case '-enddate': case '-serial': case '-fingerprint': order.push({ what: a.slice(1) }); break;
      case '-ext': { const v = value(); if (v === undefined) { io.err('x509: Option -ext needs a value'); io.err('x509: Use -help for summary.'); return 1; } order.push({ what: 'ext', arg: v }); break; }
      case '-sha1': digest = 'SHA1'; break;
      case '-sha256': digest = 'sha256'; break;
      case '-checkend': {
        const v = value();
        if (!/^\d+$/.test(v ?? '')) { io.err(`x509: Non-numeric value "${v ?? ''}" for option -checkend`); io.err('x509: Use -help for summary.'); return 1; }
        checkend = Number(v); break;
      }
      case '-inform': if (!/^pem$/i.test(value() ?? '')) { io.err('x509: 模擬環境的憑證都是 PEM 格式（-inform PEM）'); return 1; } break;
      case '-nameopt': value(); break;
      case '-text': io.err('x509: 模擬環境不印 -text 的完整內容；請用 -subject、-issuer、-dates、-ext subjectAltName、-serial、-fingerprint'); return 1;
      default: io.err(`x509: Unknown option: ${args[i]}`); io.err('x509: Use -help for summary.'); return 1;
    }
  }
  const certs = load(state, io, file);
  if (!certs) return 1;
  const c = certs[0], say = (l: string) => io.out(`${l}\n`);
  for (const o of order) {
    switch (o.what) {
      case 'subject': say(`subject=${dnText(c.subject)}`); break;
      case 'issuer': say(`issuer=${dnText(c.issuer)}`); break;
      case 'dates': say(`notBefore=${asn1Time(c.notBefore)}`); say(`notAfter=${asn1Time(c.notAfter)}`); break;
      case 'startdate': say(`notBefore=${asn1Time(c.notBefore)}`); break;
      case 'enddate': say(`notAfter=${asn1Time(c.notAfter)}`); break;
      case 'serial': say(`serial=${serialText(c)}`); break;
      case 'fingerprint': say(`${digest} Fingerprint=${fingerprint(digest === 'SHA1' ? sha1(certBytes(c)) : sha256(certBytes(c)))}`); break;
      case 'ext':
        for (const name of o.arg!.split(',').map(s => s.trim())) {
          if (name === 'subjectAltName') { if (c.sans.length) { say('X509v3 Subject Alternative Name:'); say(`    ${c.sans.map(s => `DNS:${s}`).join(', ')}`); } }
          else if (name === 'basicConstraints') { say('X509v3 Basic Constraints: critical'); say(`    CA:${c.ca ? 'TRUE' : 'FALSE'}`); }
          else { io.err(`x509: 模擬環境的 -ext 只支援 subjectAltName 與 basicConstraints（${name}）`); return 1; }
        }
        break;
    }
  }
  let status = 0;
  if (checkend !== undefined) {
    const expires = c.notAfter < nowOf(state) + checkend;
    say(expires ? 'Certificate will expire' : 'Certificate will not expire');
    status = expires ? 1 : 0;
  }
  if (!noout) io.out(certPem(c));
  return status;
}

/** openssl verify [-CAfile f] [-untrusted f] cert…: OK, or each error of OpenSSL's callback (expiry and self-signed go on). */
function verify(state: FsState, args: readonly string[], io: NetIo): number {
  let caFile: string | undefined, untrustedFile: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-CAfile') { caFile = args[++i]; continue; }
    if (a === '-untrusted') { untrustedFile = args[++i]; continue; }
    if (a.startsWith('-')) { io.err(`verify: Unknown option: ${a}`); io.err('verify: Use -help for summary.'); return 1; }
    files.push(a);
  }
  const trusted = [...trustOf(state)];
  if (caFile !== undefined) { const ca = load(state, io, caFile, 'certificates'); if (!ca) return 2; trusted.push(...ca); }
  let untrusted: Cert[] = [];
  if (untrustedFile !== undefined) { const u = load(state, io, untrustedFile, 'certificates'); if (!u) return 2; untrusted = u; }
  if (!files.length) { io.err('模擬環境沒有鍵盤輸入：請指定要驗證的憑證檔'); return 2; }
  let status = 0;
  for (const f of files) {
    const certs = load(state, io, f);
    if (!certs) { io.err(`error ${f}: verification failed`); status = 2; continue; }
    const v = verifyChain([certs[0], ...untrusted], trusted, nowOf(state));
    let failed = false;
    for (const e of v.events.filter(x => x.error)) {
      io.err(dnText(e.cert.subject));
      io.err(`error ${e.error} at ${e.depth} depth lookup: ${VERIFY_TEXT[e.error]}`);
      failed = true;
      if (e.error !== 10 && e.error !== 18) break;
    }
    if (failed) { io.err(`error ${f}: verification failed`); status = 2; } else io.out(`${f}: OK\n`);
  }
  return status;
}

/** The lines OpenSSL's s_client callback prints for each event (the error persists into the next callbacks, as in s_cb.c). */
export function callbackLines(events: readonly VerifyEvent[]): string[] {
  const out: string[] = [];
  let err = 0;
  for (const e of events) {
    out.push(`depth=${e.depth} ${dnText(e.cert.subject)}`);
    if (e.error) { err = e.error; out.push(`verify error:num=${e.error}:${VERIFY_TEXT[e.error]}`); }
    if (err === 10) out.push(`notAfter=${asn1Time(e.cert.notAfter)}`);
    if (err === 9) out.push(`notBefore=${asn1Time(e.cert.notBefore)}`);
    out.push('verify return:1');
  }
  return out;
}

/**
 * openssl s_client -connect host:port [-servername name] [-verify_hostname name] [-CAfile f] [-showcerts]: connects, prints
 * the verify callback's lines (standard error), the chain the server sent and the verdict, then ends as if its standard
 * input were empty (DONE). Without -servername the SNI is the -connect host when it is a name, as in OpenSSL 1.1.1 and later.
 */
function sClient(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let connect: string | undefined, sni: string | undefined, host: string | undefined, caFile: string | undefined, showcerts = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-connect') connect = args[++i];
    else if (a === '-servername') sni = args[++i];
    else if (a === '-verify_hostname') host = args[++i];
    else if (a === '-CAfile') caFile = args[++i];
    else if (a === '-showcerts') showcerts = true;
    else if (a === '-noservername') sni = '';
    else if (a === '-brief' || a === '-quiet') { io.err(`s_client: 模擬環境不支援 ${a}；s_client 的輸出已經是精簡過的摘要`); return { state: state0, status: 1 }; }
    else { io.err(`s_client: Unknown option: ${a}`); io.err('s_client: Use -help for summary.'); return { state: state0, status: 1 }; }
  }
  const m = /^([^:\s]+):(\d+)$/.exec(connect ?? '');
  if (!m) { io.err('s_client: 模擬環境需要 -connect 主機:埠（例如 -connect www.example.org:443）'); return { state: state0, status: 1 }; }
  const name = m[1].toLowerCase(), port = Number(m[2]);
  let state = state0;
  const looked = io.resolve(state, name, 4);
  state = looked.state;
  if ('error' in looked) { io.err(`BIO_lookup_ex:system lib:${looked.error === 'notfound' ? 'Name or service not known' : 'Temporary failure in name resolution'}`); io.err('connect:errno=0'); return { state, status: 1 }; }
  const reached = reach(state, looked.found.address, port);
  if (reached.result !== 'ok') { io.err(`connect:errno=${reached.result === 'refused' ? 111 : 110}`); return { state, status: 1 }; }
  io.out('CONNECTED(00000003)\n');
  const server = tlsServer(reached, looked.found.address, sni === undefined ? (/^\d+\.\d+\.\d+\.\d+$/.test(name) ? '' : name) : sni);
  const say = (l: string) => io.out(`${l}\n`);
  if ('plain' in server || 'error' in server) {
    io.err('error:0A00010B:SSL routines::wrong version number');
    say('---'); say('no peer certificate available'); say('---'); say('No client certificate CA names sent'); say('---');
    say('SSL handshake has read 5 bytes and written 299 bytes'); say('Verification: OK'); say('---'); say('New, (NONE), Cipher is (NONE)'); say('---');
    return { state, status: 1 };
  }
  const trusted = [...trustOf(state)];
  if (caFile !== undefined) { const ca = load(state, io, caFile, 'certificates'); if (!ca) return { state, status: 1 }; trusted.push(...ca); }
  const sent = server.chain, v = verifyChain(sent, trusted, nowOf(state), host);
  callbackLines(v.events).forEach(l => io.err(l));
  say('---');
  say('Certificate chain');
  sent.forEach((c, i) => {
    const issuerKey = sent[i + 1]?.key ?? trusted.find(t => dnText(t.subject) === dnText(c.issuer))?.key ?? c.key;
    say(` ${i} s:${dnText(c.subject)}`);
    say(`   i:${dnText(c.issuer)}`);
    say(`   a:PKEY: ${pkeyName(c)}, ${keyBits[c.key][1]} (bit); sigalg: ${sigName(issuerKey)}`);
    say(`   v:NotBefore: ${asn1Time(c.notBefore)}; NotAfter: ${asn1Time(c.notAfter)}`);
    if (showcerts) io.out(certPem(c));
  });
  say('---');
  if (!showcerts) { say('Server certificate'); io.out(certPem(sent[0])); }
  say(`subject=${dnText(sent[0].subject)}`);
  say(`issuer=${dnText(sent[0].issuer)}`);
  say('---');
  const read = sent.reduce((n, c) => n + certBytes(c).length, 1024);
  say(`SSL handshake has read ${read} bytes and written 393 bytes`);
  say(v.last ? `Verification error: ${VERIFY_TEXT[v.last]}` : 'Verification: OK');
  say('---');
  say('New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384');
  say(`Server public key is ${keyBits[sent[0].key][1]} bit`);
  say(`Verify return code: ${v.last} (${VERIFY_TEXT[v.last]})`);
  say('---');
  io.err('DONE');
  return { state, status: 0 };
}

/** openssl x509 | s_client | verify | version. */
export function openssl(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'x509': return { state, status: x509(state, rest, io) };
    case 'verify': return { state, status: verify(state, rest, io) };
    case 's_client': return sClient(state, rest, io);
    case 'version': io.out(`${OPENSSL_VERSION}\n`); return { state, status: 0 };
    case undefined: io.err('模擬環境沒有 openssl 的互動模式：請輸入子指令，例如 openssl x509 -in cert.pem -noout -dates'); return { state, status: 1 };
    default:
      io.err(`Invalid command '${sub}'; type "help" for a list.`);
      io.err('模擬環境的 openssl 只支援 x509、s_client、verify 與 version');
      return { state, status: 1 };
  }
}
