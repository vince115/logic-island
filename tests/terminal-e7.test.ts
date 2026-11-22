import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { curriculum } from '@/content/curriculum';
import { terminalFromBlueprint } from '@/content/curriculum/lessons';
import { validateContent, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { tcpHandshake, previewExercises } from '@/content/network/preview-scenes';
import { type FsState } from '@/lib/terminal/fs';
import { LATER_MANUAL } from '@/lib/terminal/manual';
import { base64, fingerprintOf, keyPair, randomart, readPrivateKey, readPublicKey, readSshdConfig, sha256, unbase64 } from '@/lib/terminal/ssh';
import { E7_COMMANDS, prompt, REMOTE_PROFILE, run, SERVICES_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, variantMachine, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { installKeyExercise, keyOnlyExercise, keysMachine, LEARNER_KEY, remoteContent, sshMachine, WEB_KEY, webRemote } from './support/terminal-fixture';

/*
 * Engine stage E7 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §15): the remote profile — other machines of the lesson
 * reached with ssh, deterministic ed25519 keys in OpenSSH's formats, known_hosts and the host key questions, key and
 * password authentication as the remote sshd's applied options allow (StrictModes, PermitRootLogin, AllowUsers), the
 * first-value-wins sshd_config with Include, sshd -t and reload, ssh-copy-id, ssh-keyscan, scp, interactive sessions,
 * the lesson data and checks, and an LNX12 lesson that carries terminal content beside network scenes.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; prompt: string }[] = [];
  for (const cmd of commands) {
    const before = prompt(state), r = run(state, cmd, REMOTE_PROFILE);
    state = r.state;
    log.push({ prompt: before, out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const remote = (s: FsState) => s.net!.hosts[0].state;
const file = (s: FsState, path: string) => s.nodes.get(path);
const TRUSTED = '-o StrictHostKeyChecking=accept-new';
const withRemote = (patch: Partial<typeof webRemote>, base: TerminalMachine = keysMachine): TerminalMachine => ({ ...base, remotes: [{ ...base.remotes![0], ...patch }] });
const extraFiles = (files: typeof webRemote.files, base: TerminalMachine = keysMachine) => withRemote({ files: [...base.remotes![0].files, ...files] }, base);

describe('the remote profile', () => {
  it('is the services profile plus ssh, keys and exit; the profiles below refuse them', () => {
    expect([...REMOTE_PROFILE.commands].sort()).toEqual([...SERVICES_PROFILE.commands, ...E7_COMMANDS].sort());
    expect(REMOTE_PROFILE.features).toEqual([...SERVICES_PROFILE.features!, 'remote']);
    expect(profileOf(sshMachine)).toBe(REMOTE_PROFILE);
    for (const cmd of E7_COMMANDS) {
      expect(run(machineState(sshMachine), `${cmd} x`, SERVICES_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd.replace(/[[\]]/g, '\\$&')}: command not found`));
      expect(session(sshMachine, `${cmd} --help`).last.out[0], cmd).toBe(`用法：${LATER_MANUAL[cmd].usage}`);
    }
    // The remote profile still refuses ; and variables (the interpreter is E8).
    expect(session(sshMachine, 'echo a; echo b').last.err[0]).toMatch(/^此模擬器不支援指令串接/);
  });
});

describe('keys', () => {
  it('hashes with SHA-256 and encodes base64 like OpenSSL and OpenSSH', () => {
    for (const text of ['', 'abc', 'x'.repeat(200)]) expect(base64(sha256(new TextEncoder().encode(text)))).toBe(createHash('sha256').update(text).digest('base64'));
    expect(Array.from(unbase64('AAEC/w==')!)).toEqual([0, 1, 2, 255]);
    expect(unbase64('not base64!')).toBeUndefined();
  });
  it('makes well-formed, deterministic ed25519 key files from a seed', () => {
    const k = keyPair('seed', 'me@here');
    expect(k).toEqual(keyPair('seed', 'me@here'));
    expect(k.publicLine).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} me@here$/);
    expect(k.fingerprint).toBe(`SHA256:${createHash('sha256').update(Buffer.from(k.publicLine.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '')}`);
    expect(k.privateText).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----\n(b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ[^\n]*)\n([A-Za-z0-9+/=]{1,70}\n)*-----END OPENSSH PRIVATE KEY-----\n$/);
    expect(k.privateText.split('\n').slice(1, -2).every(l => l.length <= 70)).toBe(true);
    const back = readPrivateKey(k.privateText)!;
    expect([fingerprintOf(back.blob), back.encrypted, back.comment]).toEqual([k.fingerprint, false, 'me@here']);
    expect(readPrivateKey(keyPair('seed', 'x', 'secret').privateText)).toMatchObject({ encrypted: true });
    expect(readPrivateKey(k.privateText.replace('b3BlbnNz', 'XXXXXXXX'))).toBeUndefined();
    expect(readPublicKey(`web-02 ${k.publicLine}`)!.comment).toBe('me@here');
    expect(keyPair('other', 'me@here').fingerprint).not.toBe(k.fingerprint);
  });
  it('draws OpenSSH\'s randomart frame', () => {
    const art = randomart(sha256(keyPair('seed', '').blob));
    expect(art[0]).toBe('+--[ED25519 256]--+');
    expect(art.at(-1)).toBe('+----[SHA256]-----+');
    expect(art).toHaveLength(11);
    expect(art.slice(1, -1).every(l => /^\|.{17}\|$/.test(l))).toBe(true);
    expect(art.join('')).toContain('S');
    expect(art.join('')).toContain('E');
  });
  it('ssh-keygen writes 600/644 files into a 700 ~/.ssh, refuses to overwrite and needs -N', () => {
    const { state, log } = session(sshMachine, 'ssh-keygen -t ed25519 -N \'\'', 'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N \'\'', 'ssh-keygen -f k2', 'ssh-keygen -t rsa -f k3 -N x');
    expect(log[0].out.slice(0, 7)).toEqual(['Generating public/private ed25519 key pair.', 'Enter file in which to save the key (/home/learner/.ssh/id_ed25519): ', "Created directory '/home/learner/.ssh'.",
      'Your identification has been saved in /home/learner/.ssh/id_ed25519', 'Your public key has been saved in /home/learner/.ssh/id_ed25519.pub', 'The key fingerprint is:',
      `${keyPair('ops-key:learner:/home/learner/.ssh/id_ed25519', '').fingerprint} learner@ops-01`]);
    expect(log[0].out.slice(-11)[0]).toBe('+--[ED25519 256]--+');
    expect([file(state, '/home/learner/.ssh')!.mode, file(state, '/home/learner/.ssh/id_ed25519')!.mode, file(state, '/home/learner/.ssh/id_ed25519.pub')!.mode]).toEqual([0o700, 0o600, 0o644]);
    expect(file(state, '/home/learner/.ssh/id_ed25519.pub')!.content).toBe(`${LEARNER_KEY.publicLine}\n`);
    expect(log[1].out.at(-1)).toBe('/home/learner/.ssh/id_ed25519 already exists.');
    expect(log[1].err).toEqual(['Overwrite (y/n)? （模擬環境沒有鍵盤輸入：不覆寫；要重新產生請先刪除舊的金鑰檔）']);
    expect(log[2].err[0]).toMatch(/^Enter passphrase \(empty for no passphrase\): （模擬環境沒有鍵盤輸入/);
    expect(log[3].err[0]).toMatch(/只產生 ed25519 金鑰/);
    expect(session(keysMachine, 'ssh-keygen -l -f ~/.ssh/id_ed25519', 'ssh-keygen -l -f ~/.ssh/known_hosts').log.map(l => l.out)).toEqual([
      [`256 ${LEARNER_KEY.fingerprint} learner@ops-01 (ED25519)`], [`256 ${WEB_KEY.fingerprint} web-02 (ED25519)`]]);
  });
});

describe('host keys', () => {
  it('asks on the first connection (and, without a keyboard, fails); accept-new and ssh-keyscan add the key', () => {
    const { state, log } = session(sshMachine, 'ssh web-02 hostname', 'echo $?', `ssh ${TRUSTED} alice@web-02 hostname`, 'ssh alice@web-02 hostname', 'ls -ld ~/.ssh');
    expect(log[0].err).toEqual([
      "The authenticity of host 'web-02 (10.0.0.12)' can't be established.", `ED25519 key fingerprint is ${WEB_KEY.fingerprint}.`, 'This key is not known by any other names.',
      'Are you sure you want to continue connecting (yes/no/[fingerprint])? （模擬環境沒有鍵盤輸入：先確認指紋，再用 ssh -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts）',
      'Host key verification failed.']);
    expect(log[1].out).toEqual(['255']);
    expect(log[2].err[0]).toBe("Warning: Permanently added 'web-02' (ED25519) to the list of known hosts.");
    expect(log[2].out).toEqual(['web-02']);
    expect(log[3].err).toEqual(["alice@web-02's password: （模擬環境代為輸入課程提供的密碼）"]);
    expect(log[4].out[0]).toMatch(/^drwx------ learner learner/);
    expect(file(state, '/home/learner/.ssh/known_hosts')!.content).toBe(`web-02 ${WEB_KEY.publicLine.split(' ').slice(0, 2).join(' ')}\n`);
    // By address it is another name; StrictHostKeyChecking=yes never adds; BatchMode does not ask.
    expect(session(sshMachine, 'ssh -o StrictHostKeyChecking=yes 10.0.0.12 true').last.err).toEqual(['No ED25519 host key is known for 10.0.0.12 and you have requested strict checking.', 'Host key verification failed.']);
    expect(session(sshMachine, 'ssh -o BatchMode=yes web true').last.err).toEqual(['Host key verification failed.']);
    const scan = session(sshMachine, 'mkdir -m 700 ~/.ssh', 'mkdir ~/.ssh', 'ssh-keyscan web-02 >> ~/.ssh/known_hosts', 'ssh -o BatchMode=yes alice@web-02 true');
    expect(scan.log[2].err).toEqual(['# web-02:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5']);
    expect(scan.log[3].err).toEqual(['alice@web-02: Permission denied (publickey,password).']);
    expect(session(sshMachine, 'ssh-keyscan nowhere').last.err).toEqual(['getaddrinfo nowhere: Name or service not known']);
  });
  it('warns that the remote host identification has changed, and ssh-keygen -R removes the old key', () => {
    const changed = variantMachine(keysMachine, { label: 'reinstalled', files: [], remotes: [{ ...keysMachine.remotes![0], hostKey: 'reinstalled' }] });
    const { state, log } = session(changed, 'ssh alice@web-02 true', 'ssh-keygen -R web-02', `ssh ${TRUSTED} alice@web-02 hostname`, 'echo $?');
    expect(log[0].err[1]).toBe('@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @');
    expect(log[0].err).toContain("  ssh-keygen -f '/home/learner/.ssh/known_hosts' -R 'web-02'");
    expect(log[0].err).toContain('Offending ED25519 key in /home/learner/.ssh/known_hosts:1');
    expect(log[0].err.slice(-2)).toEqual(['Host key for web-02 has changed and you have requested strict checking.', 'Host key verification failed.']);
    expect(log[1].out).toEqual(['# Host web-02 found: line 1', '/home/learner/.ssh/known_hosts updated.', 'Original contents retained as /home/learner/.ssh/known_hosts.old']);
    expect(log[3].out).toEqual(['0']);
    expect(file(state, '/home/learner/.ssh/known_hosts.old')!.content).toContain(WEB_KEY.publicLine.split(' ')[1]);
    // StrictHostKeyChecking=no connects anyway but turns passwords off.
    const no = session(changed, 'ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no alice@web-02 true').last.err;
    expect(no).toContain('Password authentication is disabled to avoid man-in-the-middle attacks.');
    expect(no.at(-1)).toBe('alice@web-02: Permission denied (publickey,password).');
  });
});

describe('authentication', () => {
  it('logs in with a key, journals it, and never asks for the password', () => {
    const { state, log } = session(keysMachine, 'ssh -o BatchMode=yes alice@web-02 whoami', 'ssh alice@web-02 sudo journalctl -u ssh -o cat');
    expect(log[0]).toMatchObject({ out: ['alice'], err: [] });
    expect(log[1].out).toEqual([`Accepted publickey for alice from 10.0.0.10 port 50001 ssh2: ED25519 ${LEARNER_KEY.fingerprint}`,
      `Accepted publickey for alice from 10.0.0.10 port 50002 ssh2: ED25519 ${LEARNER_KEY.fingerprint}`]);
    expect(state.net!.connections).toBe(2);
  });
  it('refuses a private key others can read, an encrypted key without an agent, and a broken one', () => {
    expect(session(keysMachine, 'chmod 644 ~/.ssh/id_ed25519', 'ssh -o BatchMode=yes alice@web-02 true').last.err).toEqual([
      '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @', '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
      "Permissions 0644 for '/home/learner/.ssh/id_ed25519' are too open.", 'It is required that your private key files are NOT accessible by others.', 'This private key will be ignored.',
      'Load key "/home/learner/.ssh/id_ed25519": bad permissions', 'alice@web-02: Permission denied (publickey,password).']);
    expect(session(keysMachine, 'echo broken > ~/.ssh/id_ed25519', 'ssh -o BatchMode=yes alice@web-02 true').last.err[0]).toBe('Load key "/home/learner/.ssh/id_ed25519": invalid format');
    expect(session(keysMachine, 'ssh -i nokey -o BatchMode=yes alice@web-02 true').last.err[0]).toBe('Warning: Identity file /home/learner/nokey not accessible: No such file or directory.');
    const enc = session(keysMachine, "ssh-keygen -q -t ed25519 -f ~/.ssh/locked -N secret", 'ssh -i ~/.ssh/locked -o BatchMode=yes alice@web-02 true').last.err;
    expect(enc[0]).toMatch(/^Enter passphrase for key '\/home\/learner\/\.ssh\/locked': （模擬環境沒有鍵盤輸入/);
  });
  it('StrictModes: a group-writable ~/.ssh or authorized_keys makes sshd refuse the key', () => {
    const loose = extraFiles([]).remotes![0].files.map(f => f.path === '/home/alice/.ssh' ? { ...f, mode: 0o775 } : f);
    const s = session(withRemote({ files: loose }), 'ssh -o BatchMode=yes alice@web-02 true', 'ssh alice@web-02 "chmod 700 .ssh"', 'ssh -o BatchMode=yes alice@web-02 hostname', 'echo $?');
    expect(s.log[0].err).toEqual(['alice@web-02: Permission denied (publickey,password).']);
    expect(s.log[3].out).toEqual(['0']);
    expect(remote(s.state).journal!.map(e => e.message)).toContain('Authentication refused: bad ownership or modes for directory /home/alice/.ssh');
    const file660 = withRemote({ files: keysMachine.remotes![0].files.map(f => f.path === '/home/alice/.ssh/authorized_keys' ? { ...f, mode: 0o660 } : f) });
    expect(remote(session(file660, 'ssh -o BatchMode=yes alice@web-02 true').state).journal!.at(-2)!.message).toBe('Authentication refused: bad ownership or modes for file /home/alice/.ssh/authorized_keys');
  });
  it('passwords: only when the lesson gives one; root follows PermitRootLogin; invalid users and AllowUsers are refused', () => {
    const bob = withRemote({ accounts: { users: [{ name: 'alice', uid: 1001 }, { name: 'bob', uid: 1002 }], groups: [{ name: 'sudo', members: ['alice'] }] } });
    expect(session(bob, 'ssh bob@web-02 true').last.err).toEqual(["bob@web-02's password: （模擬環境：課程沒有提供這個帳號的密碼）", 'bob@web-02: Permission denied (publickey,password).']);
    const r = session(withRemote({ passwords: ['alice', 'root'] }), 'ssh root@web-02 true', 'ssh carol@web-02 true', 'ssh alice@web-02 sudo journalctl -u ssh -o cat');
    expect(r.log[0].err.at(-1)).toBe('root@web-02: Permission denied (publickey,password).');
    expect(r.log[2].out).toContain('Failed password for root from 10.0.0.10 port 50001 ssh2');
    expect(r.log[2].out).toContain('Invalid user carol from 10.0.0.10 port 50002');
    const allow = extraFiles([{ path: '/etc/ssh/sshd_config.d/20-allow.conf', kind: 'file', mode: 0o644, owner: 'root', content: 'AllowUsers bob\n' }]);
    expect(session(allow, 'ssh -o BatchMode=yes alice@web-02 true').last.err).toEqual(['alice@web-02: Permission denied (publickey,password).']);
  });
});

describe('sshd_config', () => {
  it('takes the first value of a keyword, Include files where it stands, and accepts known keywords', () => {
    const nodes = (text: string, extra: [string, string][] = []) => new Map<string, never>([['/etc/ssh/sshd_config', { kind: 'file', mode: 0o644, owner: 'root', content: text }] as never,
      ...extra.map(([p, c]) => [p, { kind: 'file', mode: 0o644, owner: 'root', content: c }] as never)]);
    expect(readSshdConfig(nodes('PasswordAuthentication no\nPasswordAuthentication yes\n')).options.passwordAuthentication).toBe(false);
    expect(readSshdConfig(nodes('Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication no\n', [['/etc/ssh/sshd_config.d/50-cloud-init.conf', 'PasswordAuthentication yes\n']])).options.passwordAuthentication).toBe(true);
    expect(readSshdConfig(nodes('passwordauthentication=no\nPort 2222\nPermitRootLogin without-password\nX11Forwarding yes\nMatch User bob\n  PasswordAuthentication yes\n')).options)
      .toMatchObject({ passwordAuthentication: false, port: 2222, permitRootLogin: 'prohibit-password' });
    expect(readSshdConfig(nodes('PasswordAuthentcation no\nFoo bar\n')).errors).toEqual(['/etc/ssh/sshd_config: line 1: Bad configuration option: PasswordAuthentcation',
      '/etc/ssh/sshd_config: line 2: Bad configuration option: Foo', '/etc/ssh/sshd_config: terminating, 2 bad configuration options']);
    expect(readSshdConfig(nodes('PermitRootLogin maybe\n')).errors).toEqual(['/etc/ssh/sshd_config line 1: unsupported option "maybe".']);
  });
  it('applies only after reload; sshd -t refuses a bad file and reload keeps the old options', () => {
    const s = session(keysMachine, 'ssh alice@web-02 "echo PasswordAuthentication no | sudo tee /etc/ssh/sshd_config.d/10-keys.conf"', 'ssh -o PubkeyAuthentication=no alice@web-02 hostname',
      'ssh alice@web-02 sudo systemctl reload ssh', 'ssh -o PubkeyAuthentication=no alice@web-02 hostname',
      'ssh alice@web-02 "echo PermitRootLogin maybe | sudo tee /etc/ssh/sshd_config.d/05-bad.conf"', 'ssh alice@web-02 sudo sshd -t', 'ssh alice@web-02 sudo systemctl reload sshd', 'echo $?', 'ssh alice@web-02 sshd -t');
    expect(s.log[1]).toMatchObject({ out: ['web-02'], err: ["alice@web-02's password: （模擬環境代為輸入課程提供的密碼）"] });
    expect(s.log[3].err).toEqual(['alice@web-02: Permission denied (publickey).']);
    expect(s.log[5].err).toEqual(['/etc/ssh/sshd_config.d/05-bad.conf line 1: unsupported option "maybe".']);
    expect(s.log[6].err).toEqual(['Job for ssh.service failed because the control process exited with error code.', 'See "systemctl status ssh.service" and "journalctl -xeu ssh.service" for details.']);
    expect(s.log[7].out).toEqual(['1']);
    expect(s.log[8].err).toEqual(['sshd: no hostkeys available -- exiting.']);
    expect(remote(s.state).sshd!.applied.passwordAuthentication).toBe(false);
    expect(session(keysMachine, 'ssh alice@web-02 sudo sshd -T').last.out).toEqual(['port 22', 'permitrootlogin without-password', 'pubkeyauthentication yes', 'passwordauthentication yes',
      'kbdinteractiveauthentication no', 'strictmodes yes', 'authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2']);
    expect(session(keysMachine, 'sshd -t').last.err[0]).toMatch(/^sshd: 這台機器沒有 OpenSSH 伺服器/);
  });
  it('a stopped sshd or another port refuses connections', () => {
    expect(session(withRemote({ sshd: false }), 'ssh alice@web-02 true').last.err).toEqual(['ssh: connect to host web-02 port 22: Connection refused']);
    expect(session(keysMachine, 'ssh -p 2222 alice@web-02 true').last.err).toEqual(['ssh: connect to host web-02 port 2222: Connection refused']);
    expect(session(keysMachine, 'ssh nowhere true').last.err).toEqual(['ssh: Could not resolve hostname nowhere: Name or service not known']);
  });
});

describe('remote commands and sessions', () => {
  it('runs a command on the remote shell with its exit status and standard input', () => {
    const s = session(keysMachine, 'ssh alice@web-02 "ls /nope"', 'echo $?', 'echo hello | ssh alice@web-02 "tee greeting.txt"', 'ssh alice@web-02 cat greeting.txt', 'ssh alice@web-02 cat notes.txt | wc -l');
    expect(s.log[0].err).toEqual(["ls: cannot access '/nope': No such file or directory"]);
    expect(s.log[1].out).toEqual(['2']);
    expect(s.log[3].out).toEqual(['hello']);
    expect(s.log[4].out).toEqual(['1']);
    expect(file(remote(s.state), '/home/alice/greeting.txt')).toMatchObject({ owner: 'alice', content: 'hello\n' });
    // Without -t there is no terminal on the remote side: ls prints one plain name per line.
    expect(session(keysMachine, 'ssh alice@web-02 ls -a').last.out).toEqual(['.', '..', '.ssh', 'notes.txt']);
  });
  it('opens an interactive session: the remote prompt, its motd, exit back with logout', () => {
    const s = session(keysMachine, 'ssh alice@web-02', 'pwd', 'touch made-here', 'ssh web-02 true', 'exit 3', 'echo $?', 'exit');
    expect(s.log[0].out).toEqual(['web-02: production web server']);
    expect(s.log.map(l => l.prompt)).toEqual(['learner@keys-01:~$', 'alice@web-02:~$', 'alice@web-02:~$', 'alice@web-02:~$', 'alice@web-02:~$', 'learner@keys-01:~$', 'learner@keys-01:~$']);
    expect(s.log[1].out).toEqual(['/home/alice']);
    expect(s.log[3].err[0]).toMatch(/^ssh: 模擬環境不支援從遠端主機再用 ssh 連線/);
    expect(s.log[4]).toMatchObject({ out: ['logout'], err: ['Connection to web-02 closed.'] });
    expect(s.log[5].out).toEqual(['3']);
    expect(s.log[6].err[0]).toMatch(/^exit：模擬環境不會關閉這個終端機/);
    expect(file(remote(s.state), '/home/alice/made-here')).toBeDefined();
    expect(file(s.state, '/home/learner/made-here')).toBeUndefined();
    expect(session(keysMachine, 'ssh alice@web-02 | cat').last.err[0]).toMatch(/互動式 ssh 只能單獨在提示字元使用/);
  });
  it('ssh-copy-id installs the key once with umask 077, and fails when passwords are off', () => {
    const s = session(sshMachine, "ssh-keygen -q -t ed25519 -f ~/.ssh/id_ed25519 -N ''", `ssh-copy-id ${TRUSTED} alice@web-02`, 'ssh-copy-id alice@web-02');
    expect(s.log[1].err).toEqual(['/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "/home/learner/.ssh/id_ed25519.pub"',
      '/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed', "Warning: Permanently added 'web-02' (ED25519) to the list of known hosts.",
      '/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys', "alice@web-02's password: （模擬環境代為輸入課程提供的密碼）"]);
    expect(s.log[1].out).toEqual(['', 'Number of key(s) added: 1', '', `Now try logging into the machine, with: "ssh 'alice@web-02'"`, 'and check to make sure that only the key(s) you wanted were added.', '']);
    expect(s.log[2].err.slice(2)).toEqual(['/usr/bin/ssh-copy-id: WARNING: All keys were skipped because they already exist on the remote system.', '\t\t(if you think this is a mistake, you may want to use -f option)', '']);
    expect(file(remote(s.state), '/home/alice/.ssh')!.mode).toBe(0o700);
    expect(file(remote(s.state), '/home/alice/.ssh/authorized_keys')).toMatchObject({ mode: 0o600, owner: 'alice' });
    const off = extraFiles([{ path: '/etc/ssh/sshd_config.d/01-off.conf', kind: 'file', mode: 0o644, owner: 'root', content: 'PasswordAuthentication no\n' }], { ...sshMachine, files: keysMachine.files.filter(f => !f.path.endsWith('id_ed25519') && !f.path.endsWith('.pub')) });
    const r = session(off, "ssh-keygen -q -t ed25519 -f ~/.ssh/new -N ''", 'ssh-copy-id -i ~/.ssh/new alice@web-02', 'echo $?');
    expect(r.log[1].err.at(-1)).toBe('alice@web-02: Permission denied (publickey).');
    expect(r.log[2].out).toEqual(['1']);
    expect(session(sshMachine, 'ssh-copy-id alice@web-02').last.err).toEqual(['/usr/bin/ssh-copy-id: ERROR: No identities found']);
  });
  it('scp copies a file each way as each side\'s user', () => {
    const s = session(keysMachine, 'echo report > r.txt', 'scp r.txt alice@web-02:', 'scp alice@web-02:notes.txt .', 'cat notes.txt', 'scp alice@web-02:/etc/shadow .', 'scp r.txt alice@web-02:/etc/');
    expect(file(remote(s.state), '/home/alice/r.txt')).toMatchObject({ owner: 'alice', content: 'report\n' });
    expect(s.log[3].out).toEqual(['deploy at 18:00']);
    expect(s.log[4].err).toEqual(['scp: /etc/shadow: Permission denied']);
    expect(s.log[5].err).toEqual(['scp: /etc/: Permission denied']);
  });
});

describe('lesson data', () => {
  it('validates the E7 content and checks logins, known hosts and remote files', () => {
    expect(terminalContentProblems(remoteContent())).toEqual([]);
    const c = remoteContent();
    expect(checkTerminalExercise(installKeyExercise, c.machines, []).results.map(r => r.message)).toEqual([
      'alice 應該可以用金鑰登入 web-02，但本機沒有可用的私鑰（~/.ssh/id_ed25519 不存在、權限太寬或格式不對）', 'web-02 上的 /home/alice/.ssh/authorized_keys 的權限應該是 600，但它不存在']);
    expect(checkTerminalExercise(keyOnlyExercise, c.machines, keyOnlyExercise.mistakes[1].commands).results[0].message).toBe('alice 應該不能用密碼登入 web-02，但仍然可以這樣登入');
  });
  it('reports bad remote data', () => {
    const problems = (m: TerminalMachine) => machineProblems(m).join('\n');
    expect(problems({ ...keysMachine, profile: 'services' })).toMatch(/remotes, address and keySeed need the remote profile \(engine stage E7\)/);
    expect(problems(withRemote({ address: '10.0.0.999' }))).toMatch(/remote web-02: address 10\.0\.0\.999 is not an IPv4 address/);
    expect(problems(withRemote({ host: 'keys-01' }))).toMatch(/the name or address keys-01 is used twice/);
    expect(problems(withRemote({ passwords: ['nobody2'] }))).toMatch(/password for nobody2, who is not a user/);
    expect(problems(extraFiles([{ path: '/etc/ssh/sshd_config.d/x.conf', kind: 'file', mode: 0o644, owner: 'root', content: 'Bogus yes\n' }]))).toMatch(/sshd_config: \/etc\/ssh\/sshd_config\.d\/x\.conf: line 1: Bad configuration option: Bogus/);
    expect(problems(withRemote({ files: [{ path: '/home/x/y', kind: 'file', mode: 0o644, owner: 'root' }] }))).toMatch(/remote web-02: file \/home\/x\/y: its parent folder is not listed/);
    const content = (edit: (c: TerminalLessonContent) => void) => { const c = remoteContent(); edit(c); return terminalContentProblems(c).join('\n'); };
    expect(content(c => { c.exercises[0].checks = [{ kind: 'ssh', host: 'db-01', user: 'alice', method: 'publickey', allowed: true }]; })).toMatch(/an ssh check needs a remote machine named db-01/);
    expect(content(c => { c.exercises[0].checks = [{ kind: 'exists', path: '/x', host: 'db-01' }]; })).toMatch(/a check on host db-01 needs a remote machine of that name/);
    // E7: a reference solution may print information on standard error, but must succeed.
    expect(content(c => { c.exercises[0].solution = ['ssh web-02 true', ...c.exercises[0].solution]; })).toMatch(/the solution's command ssh web-02 true fails with status 255/);
  });
  it('lets an LNX12 lesson carry terminal machines beside network scenes', () => {
    const outline = terminalFromBlueprint('LNX12', '用金鑰登入遠端主機（測試用大綱）。', 60);
    const meta: LessonMeta = {
      lessonId: 'LNX12', islandId: 'linux-systems', slug: outline.slug, title: outline.title, summary: outline.summary, learningObjectives: outline.objectives, difficulty: outline.difficulty,
      estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites, concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
      lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
    };
    expect(meta).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    const section = (id: string, example: string) => ({ id, title: id, blocks: [{ type: 'p' as const, text: 'SSH 先驗證主機，再驗證使用者。' }, { type: 'example' as const, id: example }] });
    const content: LessonContent = {
      lessonId: 'LNX12', motivation: '遠端管理伺服器時，金鑰比密碼安全。', examples: [], exercises: [],
      sections: [section('s1', 'first-connect'), section('s2', 'keygen'), section('s3', 'key-login'), section('s4', tcpHandshake.id)],
      quiz: [1, 2, 3, 4].map(n => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['主機金鑰', '使用者金鑰'], answer: n % 2, explanation: 'known_hosts 記錄主機金鑰，authorized_keys 記錄使用者的公鑰。' })),
      terminal: remoteContent(), network: { scenes: [tcpHandshake], exercises: [previewExercises[1]] },
    };
    expect(validateContent(meta, content, curriculum.visualizations)).toEqual([]);
    const { network: _n, ...withoutNetwork } = content;
    void _n;
    expect(validateContent(meta, withoutNetwork, curriculum.visualizations)).toContain('LNX12: the network-protocol capability needs its content');
  });
});
