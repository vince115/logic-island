import { baseName, can, groupsOf, joinPath, parentOf, physicalPath, resolvePath, type FsNode, type FsState } from './fs';
import { accountsOf, findUser, loginGroups } from './accounts';
import { clockOf, nextPid } from './processes';
import { matchName } from './glob';
import { getopt } from './text';
import { ERRNO, maskOf, readPath, runInput, walk, type Line, type RunResult, type ShellProfile } from './shell';
import { MAX_JOURNAL } from './services';

/*
 * Engine stage E7 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §15): SSH between the machines of one lesson. Nothing
 * touches a network: a remote host is a whole simulated machine (its own users, files, systemd and journal) kept inside
 * the local state, and "connecting" is a pure function of both machines' files — the local user's keys and known_hosts,
 * the remote sshd's configuration (as it was applied at the last start or reload) and the remote user's authorized_keys.
 *
 * Keys are fake but well formed: an ed25519 key's 32 public bytes come from SHA-256 of a seed (the machine's key seed, the
 * user and the path), the files follow the OpenSSH formats (the private key is a real openssh-key-v1 structure, the
 * public key line and the fingerprint are computed with SHA-256 like ssh-keygen does, the randomart is the drunken
 * bishop), so any edit of a key file breaks it exactly where it would break a real one. There is no keyboard: a password
 * prompt is answered by the simulation when the lesson gave the account's password, and a host key question is not
 * answered at all (use -o StrictHostKeyChecking=accept-new or ssh-keyscan, which are real and non-interactive).
 */

// ------------------------------------------------------------------------------------------------ SHA-256 and base64

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
/** SHA-256 (FIPS 180-4), pure. */
export function sha256(data: Uint8Array): Uint8Array {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const total = Math.ceil((data.length + 9) / 64) * 64, m = new Uint8Array(total);
  m.set(data);
  m[data.length] = 0x80;
  const view = new DataView(m.buffer), bits = data.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);
  const w = new Array<number>(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
  }
  const out = new Uint8Array(32);
  h.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
  return out;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes: Uint8Array, pad = true): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0), left = bytes.length - i;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (left > 1 ? B64[(n >> 6) & 63] : pad ? '=' : '') + (left > 2 ? B64[n & 63] : pad ? '=' : '');
  }
  return out;
}
export function unbase64(text: string): Uint8Array | undefined {
  const clean = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4) return undefined;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map(j => clean[i + j] === '=' ? 0 : B64.indexOf(clean[i + j]));
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    bytes.push((n >> 16) & 255);
    if (clean[i + 2] !== '=') bytes.push((n >> 8) & 255);
    if (clean[i + 3] !== '=') bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}
const utf8 = (text: string): Uint8Array => new Uint8Array(new TextEncoder().encode(text));
const concat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; };
const sshString = (b: Uint8Array | string) => { const bytes = typeof b === 'string' ? utf8(b) : b; return concat(u32(bytes.length), bytes); };
/** n pseudo-random bytes derived from a seed (SHA-256 in counter mode): the same seed always gives the same bytes. */
function derived(seed: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i * 32 < n; i++) out.set(sha256(utf8(`${seed}#${i}`)).slice(0, Math.min(32, n - i * 32)), i * 32);
  return out;
}

// ------------------------------------------------------------------------------------------------------------- keys

export const KEY_TYPE = 'ssh-ed25519';
export const SSH_VERSION = 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5';
/** The public key blob of an ed25519 key: string "ssh-ed25519", string key (32 bytes). */
const blobOf = (key: Uint8Array) => concat(sshString(KEY_TYPE), sshString(key));
/** SHA256:… as ssh-keygen -l prints it (unpadded base64 of the blob's SHA-256). */
export const fingerprintOf = (blob: Uint8Array) => `SHA256:${base64(sha256(blob), false)}`;

/** A key pair from a seed: the public key line (ssh-ed25519 AAAA… comment), the private key file and the fingerprint. */
export function keyPair(seed: string, comment: string, passphrase = ''): { publicLine: string; privateText: string; fingerprint: string; blob: Uint8Array } {
  const priv = derived(`${seed}:private`, 32), pub = derived(`${seed}:public`, 32), blob = blobOf(pub), check = derived(`${seed}:check`, 4);
  const encrypted = passphrase !== '', block = encrypted ? 16 : 8;
  let section: Uint8Array = concat(check, check, sshString(KEY_TYPE), sshString(pub), sshString(concat(priv, pub)), sshString(comment));
  const padding: number[] = [];
  for (let i = 1; (section.length + padding.length) % block; i++) padding.push(i);
  section = concat(section, new Uint8Array(padding));
  // An encrypted key's section looks like noise (aes256-ctr with a bcrypt key; the simulation never decrypts it).
  if (encrypted) section = derived(`${seed}:${passphrase}:cipher`, section.length);
  const kdf = encrypted ? concat(sshString(derived(`${seed}:salt`, 16)), u32(16)) : new Uint8Array(0);
  const body = concat(utf8('openssh-key-v1\0'), sshString(encrypted ? 'aes256-ctr' : 'none'), sshString(encrypted ? 'bcrypt' : 'none'), sshString(kdf), u32(1), sshString(blob), sshString(section));
  const lines = base64(body).match(/.{1,70}/g) ?? [];
  return {
    publicLine: `${KEY_TYPE} ${base64(blob)}${comment ? ` ${comment}` : ''}`,
    privateText: `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`,
    fingerprint: fingerprintOf(blob), blob,
  };
}

/** Reads an OpenSSH private key file: its public blob, whether it has a passphrase and its comment; undefined when it is not one. */
export function readPrivateKey(text: string): { blob: Uint8Array; encrypted: boolean; comment: string } | undefined {
  const m = /^-----BEGIN OPENSSH PRIVATE KEY-----\n([\s\S]*?)\n?-----END OPENSSH PRIVATE KEY-----\n?$/.exec(text.trim() + '\n');
  const body = m && unbase64(m[1]);
  if (!body) return undefined;
  let at = 0;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const take = (n: number) => { if (at + n > body.length) throw new Error('short'); const b = body.slice(at, at + n); at += n; return b; };
  const str = () => take(view.getUint32((take(4), at - 4)));
  const text8 = (b: Uint8Array) => new TextDecoder().decode(b);
  try {
    if (text8(take(15)) !== 'openssh-key-v1\0') return undefined;
    const cipher = text8(str()), kdf = text8(str());
    str();
    if (view.getUint32((take(4), at - 4)) !== 1) return undefined;
    const blob = str(), section = str();
    if (!publicKeyOf(blob)) return undefined;
    if (cipher !== 'none' || kdf !== 'none') return { blob, encrypted: true, comment: '' };
    // The comment of an unencrypted key: after two check ints, the type, the public and the private key.
    const sv = new DataView(section.buffer, section.byteOffset, section.byteLength);
    let p = 8;
    const s = () => { const n = sv.getUint32(p); const b = section.slice(p + 4, p + 4 + n); p += 4 + n; return b; };
    s(); s(); s();
    return { blob, encrypted: false, comment: text8(s()) };
  } catch {
    return undefined;
  }
}
/** The 32 key bytes of an ssh-ed25519 blob, or undefined. */
function publicKeyOf(blob: Uint8Array): Uint8Array | undefined {
  const head = sshString(KEY_TYPE);
  if (blob.length !== head.length + 4 + 32 || head.some((b, i) => blob[i] !== b)) return undefined;
  return new DataView(blob.buffer, blob.byteOffset).getUint32(head.length) === 32 ? blob.slice(head.length + 4) : undefined;
}
/** One public key line (as in id_ed25519.pub, authorized_keys or after the host names of known_hosts): its blob and comment. */
export function readPublicKey(line: string): { blob: Uint8Array; comment: string } | undefined {
  const words = line.trim().split(/\s+/), at = words.indexOf(KEY_TYPE);
  const blob = at >= 0 ? unbase64(words[at + 1] ?? '') : undefined;
  return blob && publicKeyOf(blob) ? { blob, comment: words.slice(at + 2).join(' ') } : undefined;
}
const sameBlob = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** OpenSSH's randomart of a fingerprint (the "drunken bishop", sshkey.c). */
export function randomart(digest: Uint8Array): string[] {
  const W = 17, Hh = 9, chars = ' .o+=*BOX@%&#/^SE', len = chars.length - 1;
  const field = Array.from({ length: W }, () => new Array<number>(Hh).fill(0));
  let x = 8, y = 4;
  for (const byte of digest) {
    let input = byte;
    for (let b = 0; b < 4; b++) {
      x = Math.min(Math.max(x + (input & 1 ? 1 : -1), 0), W - 1);
      y = Math.min(Math.max(y + (input & 2 ? 1 : -1), 0), Hh - 1);
      if (field[x][y] < len - 2) field[x][y]++;
      input >>= 2;
    }
  }
  field[8][4] = len - 1;
  field[x][y] = len;
  const title = '[ED25519 256]', hash = '[SHA256]';
  const bar = (t: string) => { const left = Math.floor((W - t.length) / 2); return `+${'-'.repeat(left)}${t}${'-'.repeat(W - left - t.length)}+`; };
  return [bar(title), ...Array.from({ length: Hh }, (_, row) => `|${field.map(col => chars[col[row]]).join('')}|`), bar(hash)];
}

// ------------------------------------------------------------------------------------------------------ sshd_config

/** What sshd enforces (the subset the simulation models). */
export interface SshdOptions {
  port: number;
  permitRootLogin: 'yes' | 'no' | 'prohibit-password' | 'forced-commands-only';
  passwordAuthentication: boolean;
  pubkeyAuthentication: boolean;
  kbdInteractiveAuthentication: boolean;
  strictModes: boolean;
  authorizedKeysFiles: string[];
  allowUsers?: string[];
  denyUsers?: string[];
}
/** A remote machine's sshd: its host key, and the options it runs with (read at start and at each reload, not on every edit). */
export interface SshdState { publicLine: string; fingerprint: string; applied: SshdOptions }
export const DEFAULT_SSHD: SshdOptions = {
  port: 22, permitRootLogin: 'prohibit-password', passwordAuthentication: true, pubkeyAuthentication: true, kbdInteractiveAuthentication: true, strictModes: true,
  authorizedKeysFiles: ['.ssh/authorized_keys', '.ssh/authorized_keys2'],
};
export const SSHD_CONFIG = '/etc/ssh/sshd_config';
/** Ubuntu 24.04's /etc/ssh/sshd_config, shortened (the comments of the settings lessons change are kept). */
export const DEFAULT_SSHD_CONFIG = [
  '# This is the sshd server system-wide configuration file.  See', '# sshd_config(5) for more information.', '',
  'Include /etc/ssh/sshd_config.d/*.conf', '', '#Port 22', '', '# Authentication:', '', '#PermitRootLogin prohibit-password', '#StrictModes yes', '',
  '#PubkeyAuthentication yes', '', '#AuthorizedKeysFile	.ssh/authorized_keys .ssh/authorized_keys2', '',
  '# To disable tunneled clear text passwords, change to no here!', '#PasswordAuthentication yes', '#PermitEmptyPasswords no', '',
  'KbdInteractiveAuthentication no', '', 'UsePAM yes', '', 'X11Forwarding yes', 'PrintMotd no', '', 'AcceptEnv LANG LC_*', '',
  'Subsystem	sftp	/usr/lib/openssh/sftp-server', '',
].join('\n');
/** The service unit the simulation gives a remote machine (Ubuntu's, without the keys systemd's subset does not parse). */
export const SSH_UNIT = '[Unit]\nDescription=OpenBSD Secure Shell server\nAfter=network.target\n\n[Service]\nExecStartPre=/usr/sbin/sshd -t\nExecStart=/usr/sbin/sshd -D\nExecReload=/usr/sbin/sshd -t\nExecReload=/bin/kill -HUP $MAINPID\nKillMode=process\nRestart=on-failure\nType=notify\n\n[Install]\nWantedBy=multi-user.target\nAlias=sshd.service\n';

const FLAGS: Readonly<Record<string, keyof SshdOptions>> = {
  passwordauthentication: 'passwordAuthentication', pubkeyauthentication: 'pubkeyAuthentication', kbdinteractiveauthentication: 'kbdInteractiveAuthentication',
  challengeresponseauthentication: 'kbdInteractiveAuthentication', strictmodes: 'strictModes',
};
/** Keywords sshd accepts that change nothing in the simulation. */
const ACCEPTED = ['acceptenv', 'addressfamily', 'allowagentforwarding', 'allowgroups', 'allowtcpforwarding', 'banner', 'ciphers', 'clientalivecountmax', 'clientaliveinterval',
  'compression', 'denygroups', 'gatewayports', 'hostbasedauthentication', 'hostkey', 'ignorerhosts', 'kexalgorithms', 'listenaddress', 'loglevel', 'logingracetime', 'macs',
  'maxauthtries', 'maxsessions', 'maxstartups', 'permitemptypasswords', 'permittty', 'permittunnel', 'permituserenvironment', 'pidfile', 'printlastlog', 'printmotd',
  'subsystem', 'syslogfacility', 'tcpkeepalive', 'usedns', 'usepam', 'x11displayoffset', 'x11forwarding', 'x11uselocalhost', 'authenticationmethods'];

/**
 * sshd's reading of /etc/ssh/sshd_config (and its Include files): keywords are case-insensitive, `keyword value` or
 * `keyword=value`, and the FIRST value of a keyword wins (so an Include at the top overrides what comes later, as in
 * Ubuntu's cloud images). A Match block is accepted but its settings are not modelled (everything after it is skipped).
 * errors are sshd -t's messages; fatal is set when sshd would stop at once.
 */
export function readSshdConfig(nodes: ReadonlyMap<string, FsNode>): { options: SshdOptions; errors: string[]; missing?: true } {
  const options: SshdOptions = { ...DEFAULT_SSHD, authorizedKeysFiles: [...DEFAULT_SSHD.authorizedKeysFiles] }, errors: string[] = [], seen = new Set<string>();
  const fileText = (path: string) => { const n = nodes.get(physicalPath(nodes, path, true)); return n?.kind === 'file' ? n.content ?? '' : undefined; };
  if (fileText(SSHD_CONFIG) === undefined) return { options, errors: [`${SSHD_CONFIG}: No such file or directory`], missing: true };
  let bad = 0, inMatch = false, fatal = false;
  const read = (path: string, depth: number) => {
    const text = fileText(path);
    if (text === undefined || depth > 16 || fatal) return;
    text.split('\n').forEach((raw, i) => {
      if (fatal) return;
      const line = raw.trim(), at = i + 1;
      if (!line || line.startsWith('#')) return;
      const m = /^(\S+?)(?:\s*=\s*|\s+)(.*)$/.exec(line) ?? [line, line, ''];
      const key = m[1].toLowerCase(), value = m[2].trim(), args = value.split(/\s+/).filter(Boolean);
      const once = !seen.has(key) && !inMatch;
      if (key === 'match') { inMatch = true; return; }
      if (key === 'include') {
        for (const pattern of args) {
          const full = pattern.startsWith('/') ? pattern : `/etc/ssh/${pattern}`, dir = parentOf(full), part = baseName(full);
          const names = [...nodes.keys()].filter(p => parentOf(p) === dir && p !== dir && matchName(part, baseName(p))).sort();
          names.forEach(p => read(p, depth + 1));
        }
        return;
      }
      const flag = FLAGS[key];
      if (flag) {
        if (!['yes', 'no'].includes(args[0] ?? '')) { errors.push(`${path} line ${at}: unsupported option "${args[0] ?? ''}".`); fatal = true; return; }
        if (once) (options as unknown as Record<string, unknown>)[flag] = args[0] === 'yes';
      } else if (key === 'permitrootlogin') {
        const v = args[0] === 'without-password' ? 'prohibit-password' : args[0];
        if (!['yes', 'no', 'prohibit-password', 'forced-commands-only'].includes(v ?? '')) { errors.push(`${path} line ${at}: unsupported option "${args[0] ?? ''}".`); fatal = true; return; }
        if (once) options.permitRootLogin = v as SshdOptions['permitRootLogin'];
      } else if (key === 'port') {
        const n = Number(args[0]);
        if (!/^\d+$/.test(args[0] ?? '') || n < 1 || n > 65535) { errors.push(`${path} line ${at}: Badly formatted port number.`); fatal = true; return; }
        if (once) options.port = n;
      } else if (key === 'authorizedkeysfile') {
        if (once && args.length) options.authorizedKeysFiles = args;
      } else if (key === 'allowusers' || key === 'denyusers') {
        // These accumulate, unlike the other keywords.
        if (!inMatch) { const list = key === 'allowusers' ? 'allowUsers' : 'denyUsers'; options[list] = [...options[list] ?? [], ...args]; }
      } else if (!ACCEPTED.includes(key)) {
        errors.push(`${path}: line ${at}: Bad configuration option: ${m[1]}`);
        bad++;
        return;
      }
      seen.add(key);
    });
  };
  read(SSHD_CONFIG, 0);
  if (bad && !fatal) errors.push(`${SSHD_CONFIG}: terminating, ${bad} bad configuration options`);
  return { options, errors };
}

/** sshd -T: the effective settings, lowercase, in sshd's order (only the modelled ones). */
function effective(o: SshdOptions): string[] {
  return [
    `port ${o.port}`, `permitrootlogin ${o.permitRootLogin === 'prohibit-password' ? 'without-password' : o.permitRootLogin}`, `pubkeyauthentication ${o.pubkeyAuthentication ? 'yes' : 'no'}`,
    `passwordauthentication ${o.passwordAuthentication ? 'yes' : 'no'}`, `kbdinteractiveauthentication ${o.kbdInteractiveAuthentication ? 'yes' : 'no'}`,
    `strictmodes ${o.strictModes ? 'yes' : 'no'}`, `authorizedkeysfile ${o.authorizedKeysFiles.join(' ')}`,
    ...o.allowUsers ? [`allowusers ${o.allowUsers.join(' ')}`] : [], ...o.denyUsers ? [`denyusers ${o.denyUsers.join(' ')}`] : [],
  ];
}

// ---------------------------------------------------------------------------------------------------------- network

/** A machine of the lesson's network reachable with ssh: its names, address, the passwords the lesson gave, and its whole state. */
export interface RemoteHost { host: string; address: string; aliases: readonly string[]; passwords: readonly string[]; state: FsState }
/** The local machine's address, its key seed (ssh-keygen) and the other machines. connections numbers the source ports. */
export interface Network { address: string; seed: string; hosts: readonly RemoteHost[]; connections: number }

/** The state commands run on: the remote machine during an interactive ssh session, else the state itself. */
export function activeState(state: FsState): FsState {
  const at = state.session && state.net ? findHost(state.net, state.session.host) : -1;
  return at >= 0 ? state.net!.hosts[at].state : state;
}
const findHost = (net: Network, name: string) => net.hosts.findIndex(h => h.host === name || h.address === name || h.aliases.includes(name));
const withHost = (state: FsState, at: number, remote: FsState): FsState => ({ ...state, net: { ...state.net!, hosts: state.net!.hosts.map((h, i) => i === at ? { ...h, state: remote } : h) } });

/** A remote state with a user logged in: home and working directory, login groups, a fresh shell. */
function loggedIn(remote: FsState, user: string): { state: FsState; homeMissing: boolean } {
  const acc = accountsOf(remote), u = findUser(acc, user)!, home = u.home;
  const exists = remote.nodes.get(physicalPath(remote.nodes, home, true))?.kind === 'dir';
  const { shell: _s, login: _l, logout: _o, ...rest } = remote;
  void _s; void _l; void _o;
  return { state: { ...rest, user, home, cwd: exists ? home : '/', groups: loginGroups(acc, user), umask: 0o022, status: 0 }, homeMissing: !exists };
}

/**
 * E7: a line typed during an interactive ssh session runs on the remote machine; exit (or the interpreter's exit) ends the
 * session with "logout" and "Connection to … closed.", and $? on the local machine is its status.
 */
export function remoteRun(state: FsState, input: string, profile: ShellProfile): RunResult {
  const session = state.session!, at = findHost(state.net!, session.host);
  if (at < 0) { const { session: _s, ...rest } = state; void _s; return { state: rest, lines: [{ text: `Connection to ${session.name} closed.`, kind: 'err' }] }; }
  const r = runInput(state.net!.hosts[at].state, input, profile);
  if (r.state.logout === undefined) return { ...r, state: withHost(state, at, r.state) };
  const { logout, login: _l, ...remote } = r.state;
  void _l;
  const { session: _s, ...local } = withHost(state, at, remote);
  void _s;
  return { state: { ...local, ...state.status !== undefined ? { status: logout } : {} }, lines: [...r.lines, { text: 'logout', kind: 'out' }, { text: `Connection to ${session.name} closed.`, kind: 'err' }] };
}

/** What the ssh family writes, as whom, and whether it may open an interactive session (alone on the line, on a terminal). */
export interface RemoteIo { out(data: string): void; err(line: string): void; user: string; tty: boolean; stdin: string | null; profile: ShellProfile; alone: boolean }

/** ssh's client options (-o and their command-line forms). */
interface Client { port?: number; identities: string[]; strict: 'ask' | 'yes' | 'no' | 'accept-new'; password: boolean; pubkey: boolean; batch: boolean; quiet: boolean; user?: string }
const CLIENT_OPTIONS = ['stricthostkeychecking', 'passwordauthentication', 'pubkeyauthentication', 'batchmode', 'port', 'user', 'identityfile', 'identitiesonly', 'loglevel', 'connecttimeout'];
function clientOption(c: Client, text: string): string | null {
  const m = /^([A-Za-z]+)(?:\s*=\s*|\s+)(\S+)$/.exec(text.trim());
  if (!m) return `command-line line 0: Bad configuration option: ${text}`;
  const key = m[1].toLowerCase(), value = m[2], v = value.toLowerCase();
  if (!CLIENT_OPTIONS.includes(key)) return `command-line line 0: Bad configuration option: ${m[1].toLowerCase()}`;
  const yesNo = () => { if (v !== 'yes' && v !== 'no') return `command-line line 0: unsupported option "${value}".`; return null; };
  switch (key) {
    case 'stricthostkeychecking': {
      const s = v === 'off' ? 'no' : v === 'on' ? 'yes' : v;
      if (!['ask', 'yes', 'no', 'accept-new'].includes(s)) return `command-line line 0: unsupported option "${value}".`;
      c.strict = s as Client['strict']; return null;
    }
    case 'passwordauthentication': { const e = yesNo(); if (!e) c.password = v === 'yes'; return e; }
    case 'pubkeyauthentication': { const e = yesNo(); if (!e) c.pubkey = v === 'yes'; return e; }
    case 'batchmode': { const e = yesNo(); if (!e) c.batch = v === 'yes'; return e; }
    case 'port': c.port = Number(value); return /^\d+$/.test(value) ? null : `command-line line 0: Badly formatted port number.`;
    case 'user': c.user = value; return null;
    case 'identityfile': c.identities.push(value); return null;
    case 'loglevel': if (v === 'quiet' || v === 'error') c.quiet = true; return null;
    default: return null;
  }
}

/** The text of a file as `who` may read it (permissions apply), or why not. */
function readAs(state: FsState, who: string, path: string): { text: string; node: FsNode; path: string } | { error: string } {
  const acc = accountsOf(state), view = { ...state, user: who, groups: who === state.user ? groupsOf(state) : loginGroups(acc, who) };
  const r = readPath(view, path);
  if ('error' in r) return { error: r.error === 'NOINPUT' ? 'ENOENT' : r.error };
  const real = physicalPath(state.nodes, resolvePath(state, path), true);
  return { text: r.text, node: state.nodes.get(real)!, path: real };
}
/** Appends to (or creates) a file as `who` would: a new file is 666 masked by `umask`; with `folderToo` a missing folder is created with `folderMode` (ssh and ssh-keygen make ~/.ssh 700). */
function appendAs(state: FsState, who: string, path: string, data: string, umask: number, folderToo = false, folderMode = 0o700): FsState | { error: string } {
  const nodes = new Map(state.nodes), acc = accountsOf(state);
  const groups = who === state.user ? groupsOf(state) : loginGroups(acc, who);
  const primary = groupsOf({ user: who, groups })[0];
  const own = (n: FsNode): FsNode => ({ ...n, owner: who, ...primary !== who ? { group: primary } : {} });
  const view = { ...state, nodes, user: who, groups };
  const folder = parentOf(path);
  if (folderToo && !nodes.has(physicalPath(nodes, folder, true))) {
    const up = walk(view, parentOf(folder));
    if ('error' in up || up.node?.kind !== 'dir' || !can(up.node, who, 'w', groups)) return { error: 'EACCES' };
    nodes.set(joinPath(up.path, baseName(folder)), own({ kind: 'dir', mode: folderMode, owner: who }));
  }
  const w = walk(view, physicalPath(nodes, path));
  if ('error' in w) return w;
  if (w.node) {
    if (w.node.kind !== 'file') return { error: 'EISDIR' };
    if (!can(w.node, who, 'w', groups)) return { error: 'EACCES' };
    nodes.set(w.path, { ...w.node, content: (w.node.content ?? '') + data });
  } else {
    const p = walk(view, parentOf(w.path));
    if ('error' in p) return p;
    if (p.node?.kind !== 'dir') return { error: 'ENOENT' };
    if (!can(p.node, who, 'w', groups) || !can(p.node, who, 'x', groups)) return { error: 'EACCES' };
    nodes.set(w.path, own({ kind: 'file', mode: 0o666 & ~umask, owner: who, content: data }));
  }
  return { ...state, nodes };
}
function journal(remote: FsState, message: string, pid: number): FsState {
  const entry = { time: clockOf(remote).now, unit: 'ssh.service', id: 'sshd', pid, priority: 6, message };
  return remote.journal ? { ...remote, journal: [...remote.journal, entry].slice(-MAX_JOURNAL) } : remote;
}
const sshdRunning = (remote: FsState) => !remote.services || remote.services.runtime['ssh.service']?.active === 'active';

/** A known_hosts line's host field for a name and port: name, or [name]:port off port 22. */
const hostField = (name: string, port: number) => port === 22 ? name : `[${name}]:${port}`;
interface KnownHost { line: number; key: Uint8Array }
function knownHosts(text: string, field: string): KnownHost[] {
  const out: KnownHost[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('|')) return;
    const [hosts, ...rest] = line.split(/\s+/), key = readPublicKey(rest.join(' '));
    if (key && hosts.split(',').includes(field)) out.push({ line: i + 1, key: key.blob });
  });
  return out;
}

type Auth = 'publickey' | 'password';
interface Connection { at: number; user: string; name: string; remote: FsState }
type Connected = { state: FsState; conn?: Connection; status: number; failedAt?: 'host' | 'auth' };

/**
 * The client side of a connection: the host by name, alias or address, sshd running on the port, the host key against the
 * local user's known_hosts, then authentication as the remote sshd's applied options allow. Prints what ssh prints on
 * standard error; returns the new local state (known_hosts, the remote journal) and the connection, or the exit status.
 */
function connect(state: FsState, dest: string, c: Client, io: RemoteIo, only?: Auth[]): Connected {
  const net = state.net;
  const userAt = dest.lastIndexOf('@'), name = userAt >= 0 ? dest.slice(userAt + 1) : dest, user = userAt >= 0 ? dest.slice(0, userAt) : c.user ?? io.user;
  const at = net ? findHost(net, name) : -1;
  if (!net || at < 0) { io.err(`ssh: Could not resolve hostname ${name}: Name or service not known`); return { state, status: 255, failedAt: 'host' }; }
  const host = net.hosts[at], sshd = host.state.sshd, port = c.port ?? 22;
  if (!sshd || !sshdRunning(host.state) || sshd.applied.port !== port) { io.err(`ssh: connect to host ${name} port ${port}: Connection refused`); return { state, status: 255, failedAt: 'host' }; }
  let local = state;
  const say = (line: string) => { if (!c.quiet) io.err(line); };
  // 1. The host key.
  const khPath = `${state.home}/.ssh/known_hosts`, field = hostField(name, port);
  const kh = readAs(local, io.user, khPath), hostKey = readPublicKey(sshd.publicLine)!.blob;
  const known = 'error' in kh ? [] : knownHosts(kh.text, field);
  let trusted = known.some(k => sameBlob(k.key, hostKey));
  let noPasswords = false;
  if (!trusted && known.length) {
    ['@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
      'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!', 'Someone could be eavesdropping on you right now (man-in-the-middle attack)!', 'It is also possible that a host key has just been changed.',
      'The fingerprint for the ED25519 key sent by the remote host is', `${sshd.fingerprint}.`, 'Please contact your system administrator.',
      `Add correct host key in ${khPath} to get rid of this message.`, `Offending ED25519 key in ${khPath}:${known[0].line}`, '  remove with:',
      `  ssh-keygen -f '${khPath}' -R '${field}'`].forEach(l => io.err(l));
    if (c.strict !== 'no') { io.err(`Host key for ${field} has changed and you have requested strict checking.`); io.err('Host key verification failed.'); return { state, status: 255, failedAt: 'host' }; }
    ['Password authentication is disabled to avoid man-in-the-middle attacks.', 'Keyboard-interactive authentication is disabled to avoid man-in-the-middle attacks.',
      'UpdateHostkeys is disabled because the host key is not trusted.'].forEach(l => io.err(l));
    noPasswords = true;
    trusted = true;
  }
  if (!trusted) {
    if (c.strict === 'yes') { io.err(`No ED25519 host key is known for ${field} and you have requested strict checking.`); io.err('Host key verification failed.'); return { state, status: 255, failedAt: 'host' }; }
    if (c.strict === 'ask') {
      if (!c.batch) {
        io.err(`The authenticity of host '${field} (${host.address})' can't be established.`);
        io.err(`ED25519 key fingerprint is ${sshd.fingerprint}.`);
        io.err('This key is not known by any other names.');
        io.err('Are you sure you want to continue connecting (yes/no/[fingerprint])? （模擬環境沒有鍵盤輸入：先確認指紋，再用 ssh -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts）');
      }
      io.err('Host key verification failed.');
      return { state, status: 255, failedAt: 'host' };
    }
    const added = appendAs(local, io.user, khPath, `${'error' in kh || !kh.text || kh.text.endsWith('\n') ? '' : '\n'}${field} ${sshd.publicLine.split(' ').slice(0, 2).join(' ')}\n`, maskOf(state), true);
    if ('error' in added) io.err(`Failed to add the host to the list of known hosts (${khPath}).`);
    else { local = added; say(`Warning: Permanently added '${field}' (ED25519) to the list of known hosts.`); }
  }
  // 2. Authentication.
  const remoteBefore = host.state, o = sshd.applied, account = findUser(accountsOf(remoteBefore), user);
  const conns = net.connections + 1, sport = 50000 + conns, pid = nextPid(remoteBefore);
  let remote: FsState = { ...remoteBefore, lastPid: pid };
  const from = `from ${net.address} port ${sport}`;
  const done = (ok: boolean, how?: string): Connected => {
    if (how) remote = journal(remote, how, pid);
    const placed = withHost(local, at, remote), next = { ...placed, net: { ...placed.net!, connections: conns } };
    if (ok) return { state: next, conn: { at, user, name, remote }, status: 0 };
    const methods = [o.pubkeyAuthentication ? 'publickey' : '', o.passwordAuthentication ? 'password' : '', o.kbdInteractiveAuthentication ? 'keyboard-interactive' : ''].filter(Boolean);
    io.err(`${user}@${name}: Permission denied (${methods.join(',') || 'none'}).`);
    return { state: next, status: 255, failedAt: 'auth' };
  };
  const allowedUser = !!account && (!o.allowUsers || o.allowUsers.includes(user)) && !o.denyUsers?.includes(user);
  if (!account) remote = journal(remote, `Invalid user ${user} ${from}`, pid);
  else if (!allowedUser) remote = journal(remote, `User ${user} ${from} not allowed because ${o.denyUsers?.includes(user) ? 'listed in DenyUsers' : 'not listed in AllowUsers'}`, pid);
  const rootBlocks = (how: Auth) => user === 'root' && (o.permitRootLogin === 'no' || (how === 'password' && o.permitRootLogin !== 'yes'));
  // Public keys: the client's identities, then the server's authorized_keys (StrictModes first).
  if (c.pubkey && o.pubkeyAuthentication && (!only || only.includes('publickey'))) {
    for (const key of identities(local, io.user, c, io)) {
      if (!allowedUser || rootBlocks('publickey')) continue;
      const why = authorizedProblem(remote, user, key, o);
      if (why === null) {
        return done(true, `Accepted publickey for ${user} ${from} ssh2: ED25519 ${fingerprintOf(key)}`);
      }
      if (why) remote = journal(remote, why, pid);
    }
  }
  // Passwords: only when the client and the server allow them, the account has a password and the lesson gave it.
  const passwords = (o.passwordAuthentication || o.kbdInteractiveAuthentication) && c.password && !c.batch && !noPasswords && (!only || only.includes('password'));
  if (passwords) {
    if (!host.passwords.includes(user) || !allowedUser) {
      io.err(`${user}@${name}'s password: （模擬環境：課程沒有提供這個帳號的密碼）`);
      return done(false, `Connection closed by ${allowedUser ? 'authenticating' : 'invalid'} user ${user} ${net.address} port ${sport} [preauth]`);
    }
    io.err(`${user}@${name}'s password: （模擬環境代為輸入課程提供的密碼）`);
    if (rootBlocks('password')) return done(false, `Failed password for root ${from} ssh2`);
    return done(true, `Accepted password for ${user} ${from} ssh2`);
  }
  return done(false, account ? `Connection closed by authenticating user ${user} ${net.address} port ${sport} [preauth]` : undefined);
}

/** The client's usable keys (-i files, else ~/.ssh/id_ed25519), with ssh's warnings for files it cannot use. */
function identities(state: FsState, user: string, c: Client, io: RemoteIo): Uint8Array[] {
  const files = c.identities.length ? c.identities.map(f => resolvePath(state, f)) : [`${state.home}/.ssh/id_ed25519`];
  const keys: Uint8Array[] = [];
  for (const file of files) {
    const r = readAs(state, user, file);
    if ('error' in r) {
      if (c.identities.length) io.err(r.error === 'ENOENT' ? `Warning: Identity file ${file} not accessible: No such file or directory.` : `Load key "${file}": Permission denied`);
      continue;
    }
    if (r.node.owner === user && r.node.mode & 0o077) {
      ['@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
        `Permissions 0${(r.node.mode & 0o777).toString(8)} for '${file}' are too open.`, 'It is required that your private key files are NOT accessible by others.',
        'This private key will be ignored.', `Load key "${file}": bad permissions`].forEach(l => io.err(l));
      continue;
    }
    const key = readPrivateKey(r.text);
    if (!key) { io.err(`Load key "${file}": invalid format`); continue; }
    if (key.encrypted) { io.err(`Enter passphrase for key '${file}': （模擬環境沒有鍵盤輸入，也沒有 ssh-agent：有密語的金鑰無法使用）`); continue; }
    keys.push(key.blob);
  }
  return keys;
}

/**
 * Whether sshd accepts a key for a user: null when an authorized_keys file lists it; undefined when none does; else the
 * line sshd logs when StrictModes refuses (the file or a folder up to the home is not the user's or root's, or is
 * writable by the group or others).
 */
function authorizedProblem(remote: FsState, user: string, key: Uint8Array, o: SshdOptions): string | null | undefined {
  const u = findUser(accountsOf(remote), user)!;
  for (const pattern of o.authorizedKeysFiles) {
    const expanded = pattern.replace(/%h/g, u.home).replace(/%u/g, user).replace(/%%/g, '%');
    const path = expanded.startsWith('/') ? expanded : `${u.home}/${expanded}`;
    const real = physicalPath(remote.nodes, resolvePath({ cwd: '/', home: u.home }, path), true), node = remote.nodes.get(real);
    if (node?.kind !== 'file') continue;
    if (o.strictModes) {
      const bad = (n: FsNode) => (n.owner !== user && n.owner !== 'root') || (n.mode & 0o022) !== 0;
      if (bad(node)) return `Authentication refused: bad ownership or modes for file ${real}`;
      for (let dir = parentOf(real); ; dir = parentOf(dir)) {
        const d = remote.nodes.get(dir);
        if (d && bad(d)) return `Authentication refused: bad ownership or modes for directory ${dir}`;
        if (dir === u.home || dir === '/') break;
      }
    }
    for (const line of (node.content ?? '').split('\n')) {
      const k = readPublicKey(line);
      if (k && !line.trim().startsWith('#') && sameBlob(k.blob, key)) return null;
    }
  }
  return undefined;
}

/**
 * E7 (lesson checks): whether `user` could log in to `host` with this method from the state now: publickey with the local
 * user's ~/.ssh/id_ed25519, password as the server's applied options allow (whatever the password). Null when it holds,
 * else why not (in words).
 */
export function loginProblem(state: FsState, host: string, user: string, method: Auth): string | null {
  const at = state.net ? findHost(state.net, host) : -1;
  if (at < 0) return '沒有這台主機';
  const remote = state.net!.hosts[at].state, o = remote.sshd?.applied;
  if (!o || !sshdRunning(remote)) return 'sshd 沒有在執行';
  const account = findUser(accountsOf(remote), user);
  if (!account) return `遠端沒有使用者 ${user}`;
  if ((o.allowUsers && !o.allowUsers.includes(user)) || o.denyUsers?.includes(user)) return 'AllowUsers／DenyUsers 不允許這個使用者';
  if (user === 'root' && (o.permitRootLogin === 'no' || (method === 'password' && o.permitRootLogin !== 'yes'))) return `PermitRootLogin 是 ${o.permitRootLogin}`;
  if (method === 'password') return o.passwordAuthentication || o.kbdInteractiveAuthentication ? null : 'sshd 不接受密碼登入';
  if (!o.pubkeyAuthentication) return 'sshd 不接受金鑰登入';
  const silent: RemoteIo = { out: () => {}, err: () => {}, user: state.user, tty: false, stdin: null, profile: { id: 'check', commands: [] }, alone: false };
  const keys = identities(state, state.user, { identities: [], strict: 'ask', password: false, pubkey: true, batch: true, quiet: true }, silent);
  if (!keys.length) return '本機沒有可用的私鑰（~/.ssh/id_ed25519 不存在、權限太寬或格式不對）';
  const why = authorizedProblem(remote, user, keys[0], o);
  return why === null ? null : why ?? 'authorized_keys 裡沒有這把公鑰';
}
/** E7 (lesson checks): whether the local user's known_hosts has the host's current key under this name. */
export function knownHostProblem(state: FsState, host: string): string | null {
  const at = state.net ? findHost(state.net, host) : -1;
  if (at < 0) return '沒有這台主機';
  const sshd = state.net!.hosts[at].state.sshd, kh = readAs(state, state.user, `${state.home}/.ssh/known_hosts`);
  if (!sshd || 'error' in kh) return 'known_hosts 不存在';
  const known = knownHosts(kh.text, hostField(host, sshd.applied.port)), key = readPublicKey(sshd.publicLine)!.blob;
  if (!known.length) return 'known_hosts 沒有這台主機';
  return known.some(k => sameBlob(k.key, key)) ? null : 'known_hosts 裡是舊的（不同的）主機金鑰';
}
/** E7: a remote host's state by name, alias or address (lesson checks on remote files). */
export function hostState(state: FsState, host: string): FsState | undefined {
  const at = state.net ? findHost(state.net, host) : -1;
  return at < 0 ? undefined : state.net!.hosts[at].state;
}

// --------------------------------------------------------------------------------------------------------- commands

/** ssh, ssh-keygen, ssh-copy-id, ssh-keyscan, scp and sshd. */
export function remoteCommand(cmd: string, state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  switch (cmd) {
    case 'ssh': return ssh(state, args, io);
    case 'ssh-keygen': return keygen(state, args, io);
    case 'ssh-copy-id': return copyId(state, args, io);
    case 'ssh-keyscan': return keyscan(state, args, io);
    case 'scp': return scp(state, args, io);
    default: return sshd(state, args, io);
  }
}

/** Parses ssh's options; the destination and the command words come back as operands (options stop at the destination). */
function clientArgs(args: readonly string[], valueFlags: string, boolFlags: string, io: RemoteIo, cmd = 'ssh'): { c: Client; rest: string[] } | null {
  const c: Client = { identities: [], strict: 'ask', password: true, pubkey: true, batch: false, quiet: false };
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (!a.startsWith('-') || a === '-') break;
    const f = a[1];
    if (valueFlags.includes(f)) {
      const value = a.length > 2 ? a.slice(2) : args[++i];
      if (value === undefined) { io.err(`${cmd}: option requires an argument -- ${f}`); return null; }
      if (f === 'i') c.identities.push(value);
      else if (f === 'p' || f === 'P') c.port = Number(value);
      else if (f === 'l') c.user = value;
      else if (f === 'o') { const e = clientOption(c, value); if (e) { io.err(e); return null; } }
      continue;
    }
    for (const g of a.slice(1)) {
      if (!boolFlags.includes(g)) { io.err(`${cmd}: unknown option -- ${g}`); return null; }
      if (g === 'q') c.quiet = true;
    }
  }
  return { c, rest: args.slice(i) };
}

function ssh(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  if (state.sshd && !state.net) { io.err('ssh: 模擬環境不支援從遠端主機再用 ssh 連線到別台主機（請先 exit 回到本機）'); return { state, status: 255 }; }
  const parsed = clientArgs(args, 'ilop', '46AaCfGgKkMNnqsTtVvXxYy', io);
  if (!parsed) { io.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-i identity_file] [-l login_name] [-o option] [-p port] destination [command [argument ...]]'); return { state, status: 255 }; }
  const { c, rest } = parsed;
  if (!rest.length) { io.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-i identity_file] [-l login_name] [-o option] [-p port] destination [command [argument ...]]'); return { state, status: 255 }; }
  const [dest, ...command] = rest;
  if (!command.length && !(io.alone && io.tty && io.stdin === null) && io.stdin === null) { io.err('ssh: 模擬環境的互動式 ssh 只能單獨在提示字元使用；要在遠端執行指令請寫成 ssh 主機 指令'); return { state, status: 255 }; }
  const r = connect(state, dest, c, io);
  if (!r.conn) return r;
  const { conn } = r, login = loggedIn(conn.remote, conn.user);
  if (login.homeMissing) io.err(`Could not chdir to home directory ${findUser(accountsOf(conn.remote), conn.user)!.home}: No such file or directory`);
  const say = (l: Line) => l.kind === 'out' ? io.out(`${l.text}\n`) : io.err(l.text);
  const host = r.state.net!.hosts[conn.at].host;
  if (!command.length && io.stdin === null) {
    // An interactive session: the next lines run on the remote machine until exit.
    const motd = login.state.nodes.get('/etc/motd');
    if (motd?.kind === 'file' && motd.content) io.out(motd.content.endsWith('\n') ? motd.content : `${motd.content}\n`);
    return { state: { ...withHost(r.state, conn.at, { ...login.state, login: state.host ?? 'logic-island' }), session: { host, name: conn.name } }, status: 0 };
  }
  // A command (its words joined, as ssh does) or, without one, the lines of standard input, run by the remote shell.
  let remote = login.state, status = 0;
  const lines = command.length ? [command.join(' ')] : (io.stdin ?? '').split('\n').filter(l => l.trim());
  if (!command.length) io.err('Pseudo-terminal will not be allocated because stdin is not a terminal.');
  for (const line of lines) {
    // Without -t a remote command has no terminal (ls prints one name per line).
    const x = runInput(remote, line, io.profile, command.length ? io.stdin : null, false);
    x.lines.forEach(say);
    remote = x.state;
    status = remote.status ?? 0;
    if (remote.logout !== undefined) { status = remote.logout; break; }
  }
  const { logout: _o, login: _l, ...kept } = remote;
  void _o; void _l;
  return { state: withHost(r.state, conn.at, kept), status };
}

function keygen(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  const o = getopt(args, 't:b:f:N:C:qlR:F:', {});
  if ('error' in o) { io.err(`ssh-keygen: ${o.error.replace(/^invalid option -- '(.)'$/, 'unknown option -- $1')}`); io.err('usage: ssh-keygen [-q] [-t ed25519] [-f output_keyfile] [-N new_passphrase] [-C comment]'); return { state, status: 1 }; }
  const one = (f: string) => o.flags.get(f)?.at(-1), say = (l: string) => { if (!o.flags.has('q')) io.out(`${l}\n`); };
  const home = state.home, kh = one('f') ?? `${home}/.ssh/known_hosts`;
  if (o.flags.has('R') || o.flags.has('F')) {
    const host = one('R') ?? one('F')!, r = readAs(state, io.user, kh);
    if ('error' in r) { io.err(`Cannot stat ${kh}: ${ERRNO[r.error as keyof typeof ERRNO] ?? r.error}`); return { state, status: 255 }; }
    const lines = r.text.split('\n'), hits = lines.map((l, i) => ({ l, i })).filter(({ l }) => !l.startsWith('#') && l.trim() && l.split(/\s+/)[0].split(',').includes(host));
    if (o.flags.has('F')) {
      if (!hits.length) return { state, status: 1 };
      for (const { l, i } of hits) { io.out(`# Host ${host} found: line ${i + 1} \n`); io.out(`${l}\n`); }
      return { state, status: 0 };
    }
    if (!hits.length) { io.err(`Host ${host} not found in ${kh}`); return { state, status: 0 }; }
    for (const { i } of hits) io.out(`# Host ${host} found: line ${i + 1}\n`);
    const kept = lines.filter((_, i) => !hits.some(h => h.i === i)).join('\n');
    const nodes = new Map(state.nodes), node = r.node;
    nodes.set(r.path, { ...node, content: kept });
    const old = `${r.path}.old`, oldNode = nodes.get(old);
    nodes.set(old, oldNode?.kind === 'file' ? { ...oldNode, content: r.text } : { ...node, content: r.text });
    io.out(`${kh} updated.\n`);
    io.out(`Original contents retained as ${kh}.old\n`);
    return { state: { ...state, nodes }, status: 0 };
  }
  if (o.flags.has('l')) {
    const file = one('f');
    if (!file) { io.err('ssh-keygen: 模擬環境：請用 -f 指定金鑰檔，例如 ssh-keygen -l -f ~/.ssh/id_ed25519.pub'); return { state, status: 1 }; }
    let r = readAs(state, io.user, file);
    if ('error' in r) { io.err(`${file}: ${ERRNO[r.error as keyof typeof ERRNO] ?? r.error}`); return { state, status: 1 }; }
    const priv = readPrivateKey(r.text);
    if (priv?.encrypted) { const pub = readAs(state, io.user, `${file}.pub`); if (!('error' in pub)) r = pub; }
    // A public key file, authorized_keys or known_hosts: one line per key (known_hosts shows the host names as the comment).
    const keys = priv && !priv.encrypted ? [{ blob: priv.blob, comment: priv.comment }] : r.text.split('\n').flatMap(line => {
      const k = readPublicKey(line), words = line.trim().split(/\s+/), at = words.indexOf(KEY_TYPE);
      return k && !line.trim().startsWith('#') ? [{ blob: k.blob, comment: k.comment || (at > 0 ? words.slice(0, at).join(' ') : '') }] : [];
    });
    if (!keys.length) { io.err(`${file} is not a key file.`); return { state, status: 255 }; }
    for (const k of keys) io.out(`256 ${fingerprintOf(k.blob)} ${k.comment || 'no comment'} (ED25519)\n`);
    return { state, status: 0 };
  }
  const type = one('t') ?? 'ed25519';
  if (type !== 'ed25519') { io.err(`ssh-keygen: 模擬環境只產生 ed25519 金鑰（請用 -t ed25519；-t ${type} 不支援）`); return { state, status: 1 }; }
  say('Generating public/private ed25519 key pair.');
  const sshDir = `${home}/.ssh`, given = one('f'), file = given ?? `${sshDir}/id_ed25519`;
  if (given === undefined) say(`Enter file in which to save the key (${file}): `);
  let next = state;
  if (!state.nodes.has(physicalPath(state.nodes, sshDir, true))) {
    const made = appendAs(state, io.user, `${sshDir}/.keep`, '', 0o077, true);
    if ('error' in made) { io.err(`Could not create directory '${sshDir}': Permission denied`); }
    else { const nodes = new Map(made.nodes); nodes.delete(physicalPath(nodes, `${sshDir}/.keep`)); next = { ...made, nodes }; say(`Created directory '${sshDir}'.`); }
  }
  const path = resolvePath(state, file);
  if (next.nodes.has(physicalPath(next.nodes, path, true))) {
    io.out(`${file} already exists.\n`);
    io.err('Overwrite (y/n)? （模擬環境沒有鍵盤輸入：不覆寫；要重新產生請先刪除舊的金鑰檔）');
    return { state: next, status: 1 };
  }
  const passphrase = one('N');
  if (passphrase === undefined) { io.err("Enter passphrase (empty for no passphrase): （模擬環境沒有鍵盤輸入：請用 -N '' 或 -N 密語 指定）"); return { state: next, status: 1 }; }
  const comment = one('C') ?? `${io.user}@${state.host ?? 'logic-island'}`;
  const key = keyPair(`${state.net?.seed ?? state.host ?? 'logic-island'}:${io.user}:${path}`, comment, passphrase);
  const priv = writeKey(next, io.user, path, key.privateText, 0o600);
  if ('error' in priv) { io.err(`Saving key "${file}" failed: ${ERRNO[priv.error as keyof typeof ERRNO] ?? priv.error}`); return { state: next, status: 1 }; }
  const pub = writeKey(priv, io.user, `${path}.pub`, `${key.publicLine}\n`, 0o644);
  if ('error' in pub) { io.err(`Unable to save public key to ${file}.pub: ${pub.error}`); return { state: priv, status: 1 }; }
  say(`Your identification has been saved in ${file}`);
  say(`Your public key has been saved in ${file}.pub`);
  say('The key fingerprint is:');
  say(`${key.fingerprint} ${comment}`);
  say("The key's randomart image is:");
  randomart(sha256(key.blob)).forEach(say);
  return { state: pub, status: 0 };
}
/** Writes a new key file with exactly this mode (ssh-keygen ignores the umask for its files). */
function writeKey(state: FsState, user: string, path: string, text: string, mode: number): FsState | { error: string } {
  const r = appendAs(state, user, path, text, 0);
  if ('error' in r) return r;
  const real = physicalPath(r.nodes, path, true), nodes = new Map(r.nodes);
  nodes.set(real, { ...nodes.get(real)!, mode });
  return { ...r, nodes };
}

function copyId(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  const PRE = '/usr/bin/ssh-copy-id';
  const parsed = clientArgs(args, 'ipo', 'fnq', io, 'ssh-copy-id');
  if (!parsed || parsed.rest.length !== 1) { io.err(`Usage: ${PRE} [-h|-?|-f|-n|-s|-x] [-i [identity_file]] [-p port] [-F alternative ssh_config file] [-t target_path] [[-o <ssh -o options>] ...] [user@]hostname`); return { state, status: 1 }; }
  const { c, rest: [dest] } = parsed, given = c.identities.at(-1);
  const file = given ? (given.endsWith('.pub') ? given : `${given}.pub`) : `${state.home}/.ssh/id_ed25519.pub`;
  const r = readAs(state, io.user, file), key = 'error' in r ? undefined : readPublicKey(r.text);
  if (!key) { io.err(given ? `${PRE}: ERROR: failed to open ID file '${file.replace(/\.pub$/, '')}': No such file` : `${PRE}: ERROR: No identities found`); return { state, status: 1 }; }
  io.err(`${PRE}: INFO: Source of key(s) to be installed: "${file}"`);
  io.err(`${PRE}: INFO: attempting to log in with the new key(s), to filter out any that are already installed`);
  // First the new key alone (a key already installed needs no password); its own "Permission denied" is not shown.
  const probe = connect(state, dest, { ...c, identities: [file.replace(/\.pub$/, '')], password: false }, { ...io, err: l => { if (!/: Permission denied \(/.test(l)) io.err(l); } }, ['publickey']);
  if (probe.failedAt === 'host') return { state: probe.state, status: 1 };
  if (probe.conn) {
    io.err(`${PRE}: WARNING: All keys were skipped because they already exist on the remote system.`);
    io.err('\t\t(if you think this is a mistake, you may want to use -f option)');
    io.err('');
    return { state: probe.state, status: 0 };
  }
  io.err(`${PRE}: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys`);
  const login = connect(probe.state, dest, { ...c, pubkey: false, quiet: true }, io, ['password']);
  if (!login.conn) return { state: login.state, status: 1 };
  // umask 077; mkdir -p .ssh; cat >> .ssh/authorized_keys (as the remote user).
  const { conn } = login, u = findUser(accountsOf(conn.remote), conn.user)!;
  const ak = `${u.home}/.ssh/authorized_keys`, old = conn.remote.nodes.get(physicalPath(conn.remote.nodes, ak, true));
  const sep = old?.kind === 'file' && old.content && !old.content.endsWith('\n') ? '\n' : '';
  const remote = appendAs(conn.remote, conn.user, ak, `${sep}${'error' in r ? '' : r.text.split('\n')[0]}\n`, 0o077, true);
  if ('error' in remote) { io.err(`${PRE}: ERROR: ${ak}: ${ERRNO[remote.error as keyof typeof ERRNO] ?? remote.error}`); return { state: login.state, status: 1 }; }
  io.out('\nNumber of key(s) added: 1\n\n');
  io.out(`Now try logging into the machine, with: "ssh '${dest}'"\n`);
  io.out('and check to make sure that only the key(s) you wanted were added.\n\n');
  return { state: withHost(login.state, conn.at, remote), status: 0 };
}

function keyscan(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  const o = getopt(args, 't:p:', {});
  if ('error' in o || !o.operands.length) { io.err('usage: ssh-keyscan [-46cDHqv] [-f file] [-O option] [-p port] [-T timeout] [-t type] [host | addrlist namelist]'); return { state, status: 1 }; }
  const port = Number(o.flags.get('p')?.at(-1) ?? 22), type = o.flags.get('t')?.at(-1);
  let status = 0;
  for (const name of o.operands) {
    const at = state.net ? findHost(state.net, name) : -1, host = at >= 0 ? state.net!.hosts[at] : undefined;
    if (!host) { io.err(`getaddrinfo ${name}: Name or service not known`); status = 1; continue; }
    if (!host.state.sshd || !sshdRunning(host.state) || host.state.sshd.applied.port !== port) { status = 1; continue; }
    io.err(`# ${name}:${port} ${SSH_VERSION}`);
    if (type && !type.split(',').includes('ed25519')) continue;
    io.out(`${hostField(name, port)} ${host.state.sshd.publicLine.split(' ').slice(0, 2).join(' ')}\n`);
  }
  return { state, status };
}

/** scp: one side is [user@]host:path; files only (no -r), no progress meter (as with -q). */
function scp(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  const parsed = clientArgs(args, 'iPo', 'q346BCpv', io, 'scp');
  const usage = () => io.err('usage: scp [-346ABCOpqRrsTv] [-c cipher] [-D sftp_server_path] [-F ssh_config] [-i identity_file] [-J destination] [-l limit] [-o ssh_option] [-P port] [-S program] [-X sftp_option] source ... target');
  if (!parsed || parsed.rest.length < 2) { usage(); return { state, status: 1 }; }
  const { c, rest } = parsed;
  const spec = (s: string) => { const m = /^([^/:]+):(.*)$/.exec(s); return m ? { dest: m[1], path: m[2] } : undefined; };
  const target = rest.at(-1)!, sources = rest.slice(0, -1), to = spec(target), froms = sources.map(spec);
  if ((to && froms.some(Boolean)) || (!to && froms.some(f => !f) && froms.some(Boolean))) { io.err('scp: 模擬環境的 scp 只在本機與一台遠端主機之間複製'); return { state, status: 1 }; }
  if (!to && !froms.some(Boolean)) { io.err('scp: 模擬環境：至少一邊要寫成 主機:路徑（本機之間請用 cp）'); return { state, status: 1 }; }
  const dest = to?.dest ?? froms[0]!.dest;
  if (froms.some(f => f && f.dest !== dest)) { io.err('scp: 模擬環境的 scp 一次只連一台主機'); return { state, status: 1 }; }
  const r = connect(state, dest, c, io);
  if (!r.conn) return { state: r.state, status: 1 };
  const login = loggedIn(r.conn.remote, r.conn.user).state;
  let local = r.state, remote = login, status = 0;
  for (let i = 0; i < sources.length; i++) {
    const fromRemote = !!froms[i], srcPath = froms[i]?.path ?? sources[i];
    const reader = fromRemote ? remote : local, readerUser = fromRemote ? r.conn.user : io.user;
    const got = readAs(reader, readerUser, srcPath || '.');
    if ('error' in got) { io.err(`scp: ${srcPath}: ${got.error === 'EISDIR' ? 'not a regular file' : ERRNO[got.error as keyof typeof ERRNO] ?? got.error}`); status = 1; continue; }
    const writer = fromRemote ? local : remote, writerUser = fromRemote ? io.user : r.conn.user, raw = to ? to.path || '.' : target;
    const full = resolvePath(writer, raw), isDir = writer.nodes.get(physicalPath(writer.nodes, full, true))?.kind === 'dir';
    const path = isDir ? joinPath(physicalPath(writer.nodes, full, true), baseName(got.path)) : full;
    const existing = writer.nodes.get(physicalPath(writer.nodes, path, true));
    let base = writer;
    if (existing?.kind === 'file') { const nodes = new Map(writer.nodes); nodes.set(physicalPath(nodes, path, true), { ...existing, content: '' }); base = { ...writer, nodes }; }
    const written = appendAs(base, writerUser, path, got.text, (~got.node.mode & 0o777) | maskOf(writer));
    if ('error' in written) { io.err(`scp: ${raw}: ${ERRNO[written.error as keyof typeof ERRNO] ?? written.error}`); status = 1; continue; }
    if (fromRemote) local = written; else remote = written;
  }
  const { shell: _s, ...kept } = remote;
  void _s;
  return { state: withHost(local, r.conn.at, kept), status };
}

/** sshd -t (check the configuration) and -T (print the effective settings); both need root (the host keys). */
function sshd(state: FsState, args: readonly string[], io: RemoteIo): { state: FsState; status: number } {
  if (!state.sshd) { io.err('sshd: 這台機器沒有 OpenSSH 伺服器（模擬環境：只有課程宣告的遠端主機執行 sshd）'); return { state, status: 1 }; }
  if (args.length !== 1 || (args[0] !== '-t' && args[0] !== '-T')) { io.err('sshd: 模擬環境的 sshd 由 systemd 管理（systemctl status ssh）；只支援 sshd -t 與 sshd -T'); return { state, status: 1 }; }
  if (io.user !== 'root') { io.err('sshd: no hostkeys available -- exiting.'); return { state, status: 1 }; }
  const r = readSshdConfig(state.nodes);
  r.errors.forEach(e => io.err(e));
  if (r.errors.length) return { state, status: 255 };
  if (args[0] === '-T') effective(r.options).forEach(l => io.out(`${l}\n`));
  return { state, status: 0 };
}

/**
 * E7: systemctl start|restart|reload ssh on a machine with sshd: the unit's ExecStartPre=/ExecReload= sshd -t refuses a
 * bad configuration (the job fails and the old options stay); otherwise sshd reads the files again. Called before
 * systemctl runs (a refusal is the whole answer) and after it succeeds (the new options apply).
 */
export function sshdControl(state: FsState, args: readonly string[], user: string, phase: 'before' | 'after', status = 0): { state: FsState; refused?: Line[] } {
  const verb = args.find(a => !a.startsWith('-')), units = args.filter(a => !a.startsWith('-')).slice(1);
  if (!state.sshd || !verb || !['start', 'restart', 'reload', 'try-restart', 'reload-or-restart'].includes(verb) || !units.some(u => /^sshd?(\.service)?$/.test(u))) return { state };
  if (user !== 'root') return { state };
  const r = readSshdConfig(state.nodes), now = clockOf(state).now, unit = 'ssh.service';
  const log = (s: FsState, id: string, priority: number, message: string, pid?: number): FsState => s.journal ? { ...s, journal: [...s.journal, { time: now, unit, id, ...pid ? { pid } : {}, priority, message }].slice(-MAX_JOURNAL) } : s;
  if (phase === 'before') {
    if (!r.errors.length) return { state };
    const pid = nextPid(state);
    let next: FsState = { ...state, lastPid: pid };
    for (const e of r.errors) next = log(next, 'sshd', 3, e, pid);
    next = log(next, 'systemd', 3, `${unit}: Control process exited, code=exited, status=255/EXCEPTION`, 1);
    next = log(next, 'systemd', 4, `${unit}: Failed with result 'exit-code'.`, 1);
    return { state: next, refused: [
      { text: `Job for ${unit} failed because the control process exited with error code.`, kind: 'err' },
      { text: `See "systemctl status ${unit}" and "journalctl -xeu ${unit}" for details.`, kind: 'err' },
    ] };
  }
  if (status !== 0) return { state };
  const main = state.services?.runtime[unit]?.main;
  let next: FsState = { ...state, sshd: { ...state.sshd, applied: r.options } };
  if (verb === 'reload') next = log(next, 'sshd', 6, 'Received SIGHUP; restarting.', main);
  next = log(next, 'sshd', 6, `Server listening on 0.0.0.0 port ${r.options.port}.`, main);
  return { state: next };
}

/** E7: what the lesson validator needs to build a remote's sshd (its key from a seed). */
export function hostKey(seed: string, host: string): { publicLine: string; fingerprint: string } {
  const k = keyPair(`host:${seed}`, `root@${host}`);
  return { publicLine: k.publicLine, fingerprint: k.fingerprint };
}
