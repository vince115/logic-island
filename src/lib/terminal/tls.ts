import { physicalPath, type FsState } from './fs';
import { accountsOf, loginGroups } from './accounts';
import { fields, MONTHS, parseTime, type Seconds } from './clock';
import { clockOf } from './processes';
import { readPath } from './shell';
import { base64, sha256, unbase64 } from './ssh';

/*
 * Engine stage E13 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §11): certificates without cryptography. A certificate is a
 * record — subject and SANs, issuer, serial, validity on the fixed clock, key type, the subject key identifier (a hash of
 * the key's seed) and the authority key identifier of its issuer — stored in a PEM file whose base64 body is that record
 * as JSON (documented as not DER, like E7's keys: the file looks like a certificate and breaks like one when edited, but it
 * cannot be used anywhere else). A private key is a PEM file naming its seed; it matches a certificate when the hash of the
 * seed is the certificate's key identifier. Chains are built and checked like OpenSSL's verifier: the issuer of a
 * certificate is a certificate whose subject is its issuer name and whose key identifier is its authority key identifier,
 * looked up in the trust store first and then among the certificates the server sent; a trust anchor must be in the trust
 * store; times are checked top-down on the machine's clock. Nothing here is random.
 */

export type KeyType = 'rsa2048' | 'rsa4096' | 'ec256' | 'ec384';
export const KEY_TYPES: readonly KeyType[] = ['rsa2048', 'rsa4096', 'ec256', 'ec384'];
/** A distinguished name, in order (C, O, CN…). */
export type Dn = readonly (readonly [string, string])[];
export interface Cert {
  serial: string;
  subject: Dn;
  issuer: Dn;
  notBefore: Seconds;
  notAfter: Seconds;
  key: KeyType;
  /** Subject key identifier: 20 bytes of hex (a hash of the key's seed). */
  ski: string;
  /** Authority key identifier: the issuer's ski (none on a root). */
  aki?: string;
  /** DNS names of the subjectAltName extension. */
  sans: readonly string[];
  ca: boolean;
}
export interface PrivateKey { type: KeyType; seed: string }

const MARK = 'LISIM-X509 ', KEY_MARK = 'LISIM-KEY ';
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string) => new TextEncoder().encode(text);
export const skiOf = (seed: string) => hex(sha256(utf8(`key:${seed}`)).slice(0, 20));

/** SHA-1 (FIPS 180-4), pure: only for `openssl x509 -fingerprint`, whose default digest it is. */
export function sha1(data: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const total = Math.ceil((data.length + 9) / 64) * 64, m = new Uint8Array(total);
  m.set(data);
  m[data.length] = 0x80;
  const view = new DataView(m.buffer), bits = data.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);
  const w = new Array<number>(80), rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0;
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    [a, b, c, d, e].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
  }
  const out = new Uint8Array(20);
  h.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
  return out;
}

// ------------------------------------------------------------------------------------------------------------- PEM

const wrap = (b64: string) => b64.match(/.{1,64}/g)!.join('\n');
const body = (c: Cert) => MARK + JSON.stringify({ v: 3, serial: c.serial, subject: c.subject, issuer: c.issuer, notBefore: c.notBefore, notAfter: c.notAfter, key: c.key, ski: c.ski, aki: c.aki ?? null, sans: c.sans, ca: c.ca });
/** The certificate as a PEM block (with its final newline). */
export const certPem = (c: Cert) => `-----BEGIN CERTIFICATE-----\n${wrap(base64(utf8(body(c))))}\n-----END CERTIFICATE-----\n`;
export const keyPem = (k: PrivateKey) => `-----BEGIN PRIVATE KEY-----\n${wrap(base64(utf8(KEY_MARK + JSON.stringify({ type: k.type, seed: k.seed }))))}\n-----END PRIVATE KEY-----\n`;
/** The "DER" bytes of a certificate (what fingerprints hash). */
export const certBytes = (c: Cert) => utf8(body(c));

const isDn = (x: unknown): x is Dn => Array.isArray(x) && x.every(p => Array.isArray(p) && p.length === 2 && p.every(s => typeof s === 'string'));
function decodeCert(b64: string): Cert | undefined {
  const bytes = unbase64(b64);
  if (!bytes) return undefined;
  const text = new TextDecoder().decode(bytes);
  if (!text.startsWith(MARK)) return undefined;
  try {
    const o = JSON.parse(text.slice(MARK.length)) as Record<string, unknown>;
    if (typeof o.serial !== 'string' || !isDn(o.subject) || !isDn(o.issuer) || typeof o.notBefore !== 'number' || typeof o.notAfter !== 'number' || !KEY_TYPES.includes(o.key as KeyType)
      || typeof o.ski !== 'string' || !Array.isArray(o.sans) || typeof o.ca !== 'boolean') return undefined;
    return { serial: o.serial, subject: o.subject, issuer: o.issuer, notBefore: o.notBefore, notAfter: o.notAfter, key: o.key as KeyType, ski: o.ski, ...typeof o.aki === 'string' ? { aki: o.aki } : {},
      sans: (o.sans as unknown[]).filter((s): s is string => typeof s === 'string'), ca: o.ca };
  } catch { return undefined; }
}
/** Every PEM block of a text, in order: certificates and keys (a block that does not decode is `bad`). */
export function pemBlocks(text: string): ({ kind: 'cert'; cert: Cert } | { kind: 'key'; key: PrivateKey } | { kind: 'bad'; label: string })[] {
  const out: ({ kind: 'cert'; cert: Cert } | { kind: 'key'; key: PrivateKey } | { kind: 'bad'; label: string })[] = [];
  for (const m of text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----\r?\n([\s\S]*?)-----END \1-----/g)) {
    if (m[1] === 'CERTIFICATE') { const c = decodeCert(m[2]); out.push(c ? { kind: 'cert', cert: c } : { kind: 'bad', label: m[1] }); continue; }
    if (/PRIVATE KEY$/.test(m[1])) {
      const bytes = unbase64(m[2]), t = bytes ? new TextDecoder().decode(bytes) : '';
      try {
        const o = t.startsWith(KEY_MARK) ? JSON.parse(t.slice(KEY_MARK.length)) as Record<string, unknown> : undefined;
        if (o && KEY_TYPES.includes(o.type as KeyType) && typeof o.seed === 'string') { out.push({ kind: 'key', key: { type: o.type as KeyType, seed: o.seed } }); continue; }
      } catch { /* not ours */ }
      out.push({ kind: 'bad', label: m[1] });
      continue;
    }
    out.push({ kind: 'bad', label: m[1] });
  }
  return out;
}
export const certsIn = (text: string): Cert[] => pemBlocks(text).flatMap(b => b.kind === 'cert' ? [b.cert] : []);
export const keyIn = (text: string): PrivateKey | undefined => pemBlocks(text).flatMap(b => b.kind === 'key' ? [b.key] : [])[0];
export const keyMatches = (k: PrivateKey, c: Cert) => skiOf(k.seed) === c.ski && k.type === c.key;

// ------------------------------------------------------------------------------------------------------ text forms

/** OpenSSL's one-line form: C = US, O = Let's Encrypt, CN = R11. */
export const dnText = (dn: Dn) => dn.map(([k, v]) => `${k} = ${/[,+;<>"=]/.test(v) ? `"${v}"` : v}`).join(', ');
/** curl's form: C=US; O=Let's Encrypt; CN=R11. */
export const dnCurl = (dn: Dn) => dn.map(([k, v]) => `${k}=${v}`).join('; ');
export const cnOf = (dn: Dn) => [...dn].reverse().find(([k]) => k === 'CN')?.[1];
const sameDn = (a: Dn, b: Dn) => dnText(a) === dnText(b);
/** ASN1_TIME_print: Nov  1 09:00:00 2026 GMT. */
export function asn1Time(t: Seconds): string {
  const f = fields(t), two = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[f.month]} ${String(f.day).padStart(2)} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} ${f.year} GMT`;
}
/** A certificate's serial as openssl prints it (-serial: upper case without colons). */
export const serialText = (c: Cert) => c.serial.toUpperCase();
export const keyBits: Record<KeyType, [string, number, number]> = { rsa2048: ['RSA', 2048, 112], rsa4096: ['RSA', 4096, 152], ec256: ['EC/prime256v1', 256, 128], ec384: ['EC/secp384r1', 384, 192] };
export const sigAlg = (issuerKey: KeyType) => issuerKey.startsWith('rsa') ? 'sha256WithRSAEncryption' : issuerKey === 'ec384' ? 'ecdsa-with-SHA384' : 'ecdsa-with-SHA256';

/** Whether a DNS name matches a certificate's names (SANs; the CN only without SANs); *.x matches exactly one label. */
export function nameMatches(c: Cert, name: string): string | undefined {
  const host = name.toLowerCase().replace(/\.$/, ''), names = c.sans.length ? c.sans : [cnOf(c.subject) ?? ''];
  return names.find(n => {
    const p = n.toLowerCase();
    if (p.startsWith('*.')) { const rest = host.slice(host.indexOf('.') + 1); return host.includes('.') && host.indexOf('.') > 0 && rest === p.slice(2); }
    return p === host;
  });
}

// ----------------------------------------------------------------------------------------------- built-in authorities

const LE_ROOT_DN: Dn = [['C', 'US'], ['O', 'Internet Security Research Group'], ['CN', 'ISRG Root X1']];
const LE_R11_DN: Dn = [['C', 'US'], ['O', "Let's Encrypt"], ['CN', 'R11']];
const ROOT_SEED = 'builtin/isrg-root-x1', R11_SEED = 'builtin/le-r11';
/** ISRG Root X1 and Let's Encrypt's R11 (the simulation's only public CA; the dates are the real ones). Built on first use. */
let builtins: Readonly<Record<string, Cert>> | undefined;
export function builtin(): Readonly<Record<string, Cert>> {
  return builtins ??= {
    'isrg-root-x1': {
      serial: '8210cfb0d240e3594463e0bb63828b00', subject: LE_ROOT_DN, issuer: LE_ROOT_DN, notBefore: parseTime('2015-06-04 11:04:38')!, notAfter: parseTime('2035-06-04 11:04:38')!,
      key: 'rsa4096', ski: skiOf(ROOT_SEED), sans: [], ca: true,
    },
    'lets-encrypt-r11': {
      serial: '8a7d3e13d62f30ef2386bd29076b34f8', subject: LE_R11_DN, issuer: LE_ROOT_DN, notBefore: parseTime('2024-03-13 00:00:00')!, notAfter: parseTime('2027-03-12 23:59:59')!,
      key: 'rsa2048', ski: skiOf(R11_SEED), aki: skiOf(ROOT_SEED), sans: [], ca: true,
    },
  };
}
export const leIssuer = () => builtin()['lets-encrypt-r11'];
export const TRUST_BUNDLE = '/etc/ssl/certs/ca-certificates.crt';
export const TRUST_DIR = '/etc/ssl/certs';

/** A serial like a CA's: 18 bytes from a seed, the first byte below 0x80 (positive). */
export function serialFrom(seed: string): string {
  const d = sha256(utf8(`serial:${seed}`));
  d[0] = 0x03 + (d[0] % 4);
  return hex(d.slice(0, 18));
}

// --------------------------------------------------------------------------------------------------- verification

export const VERIFY_TEXT: Readonly<Record<number, string>> = {
  0: 'ok', 9: 'certificate is not yet valid', 10: 'certificate has expired', 18: 'self-signed certificate', 19: 'self-signed certificate in certificate chain',
  20: 'unable to get local issuer certificate', 21: 'unable to verify the first certificate', 62: 'hostname mismatch',
};
/** One call of OpenSSL's verify callback: the certificate at a depth, and the error (0 when it is fine). */
export interface VerifyEvent { depth: number; cert: Cert; error: number }
export interface Verified { chain: Cert[]; events: VerifyEvent[]; /** The first error (what aborts a handshake that verifies the peer). */ first: number; /** The last error (s_client's Verify return code). */ last: number }

const selfIssued = (c: Cert) => sameDn(c.subject, c.issuer) && (!c.aki || c.aki === c.ski);
const issues = (issuer: Cert, c: Cert) => sameDn(issuer.subject, c.issuer) && (!c.aki || c.aki === issuer.ski);
const same = (a: Cert, b: Cert) => a.ski === b.ski && sameDn(a.subject, b.subject) && a.serial === b.serial;

/**
 * OpenSSL's verify_chain without signatures: build the chain from the leaf (issuers from the trust store first, then from
 * the untrusted certificates), then the host name (62, only when asked), then each certificate's times from the top down.
 * Every callback is an event, so s_client can print them and curl can stop at the first error.
 */
export function verifyChain(served: readonly Cert[], trusted: readonly Cert[], now: Seconds, host?: string): Verified {
  const chain: Cert[] = [served[0]], events: VerifyEvent[] = [];
  const untrusted = served.slice(1);
  let anchored = false;
  while (chain.length < 10) {
    const cur = chain.at(-1)!;
    if (trusted.some(t => same(t, cur)) && selfIssued(cur)) { anchored = true; break; }
    if (selfIssued(cur)) break;
    const up = trusted.find(t => issues(t, cur)) ?? untrusted.find(u => issues(u, cur) && !chain.includes(u));
    if (!up) break;
    chain.push(up);
    if (trusted.some(t => same(t, up)) && selfIssued(up)) { anchored = true; break; }
  }
  const top = chain.at(-1)!, n = chain.length - 1;
  if (!anchored) {
    if (selfIssued(top)) events.push({ depth: n, cert: top, error: n === 0 ? 18 : 19 });
    else events.push({ depth: n, cert: top, error: 20 });
  }
  if (host !== undefined && !nameMatches(chain[0], host)) events.push({ depth: 0, cert: chain[0], error: 62 });
  // internal_verify: a top that is not self-issued is only checked for its issuer when it is the leaf (21).
  let start = n;
  if (!selfIssued(top)) { if (n === 0) events.push({ depth: 0, cert: top, error: 21 }); else start = n - 1; }
  for (let d = start; d >= 0; d--) {
    const c = chain[d];
    if (c.notBefore > now) events.push({ depth: d, cert: c, error: 9 });
    if (c.notAfter < now) events.push({ depth: d, cert: c, error: 10 });
    events.push({ depth: d, cert: c, error: 0 });
  }
  const errors = events.filter(e => e.error);
  return { chain, events, first: errors[0]?.error ?? 0, last: errors.at(-1)?.error ?? 0 };
}

/** The certificates of the machine's trust store (or of a CAfile), as root reads them. */
export function trustOf(state: FsState, file = TRUST_BUNDLE): Cert[] {
  const r = readAs(state, 'root', file);
  return 'text' in r ? certsIn(r.text) : [];
}
/** A file's text as `user` may read it. */
export function readAs(state: FsState, user: string, path: string): { text: string } | { error: 'ENOENT' | 'EACCES' | 'EISDIR' | 'ENOTDIR' | 'ELOOP' } {
  const acc = accountsOf(state), view = { ...state, user, groups: user === state.user ? state.groups ?? loginGroups(acc, user) : loginGroups(acc, user), cwd: '/' };
  const r = readPath(view, path);
  if ('error' in r) return { error: r.error === 'NOINPUT' ? 'ENOENT' : r.error };
  return { text: r.text };
}
export const exists = (state: FsState, path: string) => state.nodes.has(physicalPath(state.nodes, path, true));

/** What a TLS server presents: the chain from its certificate file and whether its key file matches the leaf. */
export interface Presented { chain: Cert[]; keyOk: boolean }
/** E13: a listener's certificate and key files read as root (the responders read them on each connection). */
export function presentedBy(state: FsState, certificate: string, key: string): Presented | { error: string } {
  const c = readAs(state, 'root', certificate);
  if ('error' in c) return { error: `${certificate}: ${c.error}` };
  const chain = certsIn(c.text);
  if (!chain.length) return { error: `${certificate}: no certificate` };
  const k = readAs(state, 'root', key), pk = 'text' in k ? keyIn(k.text) : undefined;
  return { chain, keyOk: !!pk && keyMatches(pk, chain[0]) };
}

/** The 9 lines curl 8.5 (OpenSSL 3) prints for a TLS 1.3 handshake up to the server's certificate, and those after it. */
export function curlHandshake(caFile: string): { before: string[]; after: (chain: readonly Cert[]) => string[] } {
  return {
    before: ['* ALPN: curl offers h2,http/1.1', '* TLSv1.3 (OUT), TLS handshake, Client hello (1):', `*  CAfile: ${caFile}`, `*  CApath: ${TRUST_DIR}`,
      '* TLSv1.3 (IN), TLS handshake, Server hello (2):', '* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):', '* TLSv1.3 (IN), TLS handshake, Certificate (11):'],
    after: chain => ['* TLSv1.3 (IN), TLS handshake, CERT verify (15):', '* TLSv1.3 (IN), TLS handshake, Finished (20):', '* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):',
      '* TLSv1.3 (OUT), TLS handshake, Finished (20):', `* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / ${chain[0].key.startsWith('rsa') ? 'RSASSA-PSS' : 'id-ecPublicKey'}`,
      '* ALPN: server accepted http/1.1'],
  };
}
/** The TLS alert OpenSSL sends when verification fails. */
export const alertFor = (error: number) => error === 10 ? 'certificate expired (557)' : error === 9 ? 'bad certificate (554)' : 'unknown CA (560)';

/** The machine's clock (certificates are checked on it). */
export const nowOf = (state: FsState) => clockOf(state).now;
