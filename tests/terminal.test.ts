import { describe, expect, it } from 'vitest';
import { HOME, initialState, LIMITS, modeString, resolvePath, type FsState } from '@/lib/terminal/fs';
import { applyMode, prompt, run, tokenize } from '@/lib/terminal/shell';
import { TERMINAL_TASKS } from '@/lib/terminal/tasks';

// P7: the Linux Terminal Simulator's file system, interpreter and tasks (docs/planning/P7_SYSTEMS_LABS.md).
function session(...commands: string[]) {
  let state = initialState();
  const log: { cmd: string; out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd);
    state = r.state;
    log.push({ cmd, out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const exists = (s: FsState, p: string) => s.nodes.has(p);

describe('paths', () => {
  it('resolves ~, ., .. and never climbs above /', () => {
    const s = { cwd: `${HOME}/scripts`, home: HOME };
    expect(resolvePath(s, '..')).toBe(HOME);
    expect(resolvePath(s, '~/a/./b/../c')).toBe(`${HOME}/a/c`);
    expect(resolvePath(s, '/../../etc//hostname')).toBe('/etc/hostname');
    expect(resolvePath(s, 'deploy.sh')).toBe(`${HOME}/scripts/deploy.sh`);
  });
  it('shows the prompt relative to home', () => {
    expect(prompt(initialState())).toBe('learner@logic-island:~$');
    expect(prompt(session('cd /etc').state)).toBe('learner@logic-island:/etc$');
    expect(prompt(session('cd scripts').state)).toBe('learner@logic-island:~/scripts$');
  });
});

describe('tokenizer', () => {
  it('splits on spaces, keeps quoted text together and separates redirects', () => {
    expect(tokenize('echo  "hello world"  \'a b\'')).toEqual({ words: ['echo', 'hello world', 'a b'] });
    expect(tokenize('echo hi>a.txt')).toEqual({ words: ['echo', 'hi', '>', 'a.txt'] });
    expect(tokenize('echo hi >> a.txt')).toEqual({ words: ['echo', 'hi', '>>', 'a.txt'] });
    expect(tokenize('echo "x > y"')).toEqual({ words: ['echo', 'x > y'] });
    expect(tokenize('echo "open')).toHaveProperty('error');
  });
});

describe('commands', () => {
  it('pwd, cd and ls', () => {
    expect(session('pwd').last.out).toEqual([HOME]);
    expect(session('cd /var/log', 'pwd').last.out).toEqual(['/var/log']);
    expect(session('cd /etc', 'cd', 'pwd').last.out).toEqual([HOME]);
    expect(session('ls').last.out).toEqual(['README.txt  scripts/  secret.txt  tmp/']);
    expect(session('ls -la scripts').last.out).toEqual([
      'drwxr-xr-x learner learner  4096 .',
      'drwxr-xr-x learner learner  4096 ..',
      '-rw-r--r-- learner learner    32 deploy.sh',
    ]);
    expect(session('cd nope').last.err).toEqual(['bash: cd: nope: No such file or directory']);
    expect(session('cd README.txt').last.err).toEqual(['bash: cd: README.txt: Not a directory']);
    expect(session('ls -z').last.err).toEqual(["ls: invalid option -- 'z'"]);
  });

  it('mkdir, touch, echo and cat', () => {
    const { state, last } = session('mkdir -p a/b/c', 'touch a/b/c/x.txt', 'echo hello > a/b/c/x.txt', 'echo world >> a/b/c/x.txt', 'cat a/b/c/x.txt');
    expect(last.out).toEqual(['hello', 'world']);
    expect(state.nodes.get(`${HOME}/a/b/c`)).toMatchObject({ kind: 'dir', mode: 0o755, owner: 'learner' });
    expect(session('mkdir scripts').last.err).toEqual(["mkdir: cannot create directory 'scripts': File exists"]);
    expect(session('mkdir x/y').last.err).toEqual(["mkdir: cannot create directory 'x/y': No such file or directory"]);
    expect(session('cat scripts').last.err).toEqual(['cat: scripts: Is a directory']);
    expect(session('cat missing.txt').last.err).toEqual(['cat: missing.txt: No such file or directory']);
  });

  it('cp, mv and rm', () => {
    const copied = session('cp README.txt copy.txt', 'cp -r scripts tools', 'cp scripts nope');
    expect(exists(copied.state, `${HOME}/copy.txt`) && exists(copied.state, `${HOME}/tools/deploy.sh`)).toBe(true);
    expect(copied.last.err).toEqual(["cp: -r not specified; omitting directory 'scripts'"]);
    expect(session('cp -r scripts scripts/inner').last.err[0]).toMatch(/into itself/);

    const moved = session('mkdir box', 'mv README.txt box', 'mv box/README.txt box/readme.md');
    expect([...moved.state.nodes.keys()].filter(p => p.startsWith(`${HOME}/box`))).toEqual([`${HOME}/box`, `${HOME}/box/readme.md`]);
    expect(exists(moved.state, `${HOME}/README.txt`)).toBe(false);

    expect(session('rm tmp').last.err).toEqual(["rm: cannot remove 'tmp': Is a directory"]);
    const removed = session('rm -r tmp');
    expect([...removed.state.nodes.keys()].some(p => p.startsWith(`${HOME}/tmp`))).toBe(false);
    expect(session('rm -f nothing').last.err).toEqual([]);
    expect(session('rm nothing').last.err).toEqual(["rm: cannot remove 'nothing': No such file or directory"]);
  });

  it('refuses the dangerous removals', () => {
    expect(session('rm -rf /').last.err).toEqual(["rm: it is dangerous to operate recursively on '/'"]);
    expect(session('rm -r .').last.err[0]).toMatch(/refusing to remove '\.' or '\.\.'/);
    expect(session('cd scripts', 'rm -r ~/scripts').last.err[0]).toMatch(/目前所在的目錄/);
    expect(session('rm -rf /').state.nodes.size).toBe(initialState().nodes.size);
  });

  it('chmod with octal and symbolic modes', () => {
    expect(applyMode(0o644, 'u+x')).toBe(0o744);
    expect(applyMode(0o777, 'go-w')).toBe(0o755);
    expect(applyMode(0o000, 'a=r')).toBe(0o444);
    expect(applyMode(0o644, '+x')).toBe(0o755);
    expect(applyMode(0o644, 'u=rw,go=')).toBe(0o600);
    expect(applyMode(0o644, '600')).toBe(0o600);
    for (const bad of ['u+z', '9', 'x+r', '']) expect(applyMode(0o644, bad), bad).toBeUndefined();
    const s = session('chmod 600 secret.txt', 'ls -l secret.txt');
    expect(s.last.out[0]).toMatch(/^-rw------- learner/);
    expect(modeString({ kind: 'dir', mode: 0o750, owner: 'x' })).toBe('drwxr-x---');
    expect(session('chmod 777 /etc/hostname').last.err).toEqual(["chmod: changing permissions of '/etc/hostname': Operation not permitted"]);
    expect(session('chmod abc secret.txt').last.err).toEqual(["chmod: invalid mode: 'abc'"]);
  });
});

describe('permissions (the learner is not root)', () => {
  it('cannot read root-only files or write into root-owned folders', () => {
    expect(session('cat /etc/shadow').last.err).toEqual(['cat: /etc/shadow: Permission denied']);
    expect(session('cat /etc/hostname').last.out).toEqual(['logic-island']);
    expect(session('touch /etc/evil').last.err).toEqual(["touch: cannot touch '/etc/evil': Permission denied"]);
    expect(session('rm /etc/hostname').last.err).toEqual(["rm: cannot remove '/etc/hostname': Permission denied"]);
    expect(session('touch /tmp/ok').state.nodes.has('/tmp/ok')).toBe(true);
  });

  it('follows the owner bits after chmod', () => {
    expect(session('chmod 000 secret.txt', 'cat secret.txt').last.err).toEqual(['cat: secret.txt: Permission denied']);
    expect(session('chmod u-w secret.txt', 'echo x > secret.txt').last.err).toEqual(['bash: secret.txt: Permission denied']);
    expect(session('chmod u-x scripts', 'cd scripts').last.err).toEqual(['bash: cd: scripts: Permission denied']);
    expect(session('chmod u-x scripts', 'cat scripts/deploy.sh').last.err).toEqual(['cat: scripts/deploy.sh: Permission denied']);
    expect(session('chmod u-r scripts', 'ls scripts').last.err).toEqual(["ls: cannot open directory 'scripts': Permission denied"]);
    expect(session('chmod u-w scripts', 'rm scripts/deploy.sh').last.err).toEqual(["rm: cannot remove 'scripts/deploy.sh': Permission denied"]);
  });
});

describe('safety boundary', () => {
  it('runs nothing but the table: unknown commands, pipes, chains and substitutions are refused', () => {
    expect(session('sudo rm -rf /').last.err[0]).toMatch(/^bash: sudo: command not found/);
    for (const input of ['ls | grep a', 'ls; rm -r tmp', 'ls && rm -r tmp', 'echo $(whoami)', 'echo `id`', 'cat < README.txt', 'sleep 1 &']) {
      const s = session(input);
      expect(s.last.err[0], input).toMatch(/不支援/);
      expect(s.state.nodes.size, input).toBe(initialState().nodes.size);
    }
    expect(session('echo "a | b; c"').last.out).toEqual(['a | b; c']);
  });

  it('keeps every input, name, file and tree within the limits', () => {
    expect(session('echo ' + 'x'.repeat(LIMITS.input)).last.err[0]).toMatch(/輸入太長/);
    expect(session(`touch ${'n'.repeat(LIMITS.nameLength + 1)}`).last.err[0]).toMatch(/File name too long/);
    let state = initialState();
    for (let i = 0; i < LIMITS.nodes; i++) state = run(state, `touch f${i}`).state;
    expect(state.nodes.size).toBe(LIMITS.nodes);
    expect(run(state, 'touch one-more').lines[0].text).toMatch(/No space left on device/);
    let big = initialState();
    for (let i = 0; i < 12; i++) big = run(big, `echo ${'y'.repeat(400)} >> big.txt`).state;
    expect(big.nodes.get(`${HOME}/big.txt`)!.content!.length).toBeLessThanOrEqual(LIMITS.fileLength);
  });

  it('never changes the state it was given', () => {
    const start = initialState(), before = JSON.stringify([...start.nodes]);
    run(start, 'rm -r tmp'); run(start, 'mkdir x'); run(start, 'chmod 000 secret.txt'); run(start, 'mv scripts s2');
    expect(JSON.stringify([...start.nodes])).toBe(before);
    expect(start.cwd).toBe(HOME);
  });
});

describe('tasks', () => {
  it('start undone and are reached by a sequence of ordinary commands', () => {
    const start = initialState();
    expect(TERMINAL_TASKS.filter(t => t.done(start))).toEqual([]);
    const { state } = session('mkdir projects', 'cd projects', 'echo "第一份筆記" > notes.txt', 'mkdir ~/backup', 'cp notes.txt ~/backup',
      'mv ~/backup/notes.txt ~/backup/notes-2026.txt', 'cd ~', 'chmod u+x scripts/deploy.sh', 'chmod 600 secret.txt', 'rm -r tmp');
    expect(TERMINAL_TASKS.filter(t => !t.done(state)).map(t => t.id)).toEqual([]);
    expect(new Set(TERMINAL_TASKS.map(t => t.id)).size).toBe(TERMINAL_TASKS.length);
  });

  it('checks the result, not the command: chmod 744 counts like u+x, and a wider mode does not', () => {
    expect(TERMINAL_TASKS.find(t => t.id === 'executable-script')!.done(session('chmod 744 scripts/deploy.sh').state)).toBe(true);
    expect(TERMINAL_TASKS.find(t => t.id === 'executable-script')!.done(session('chmod +x scripts/deploy.sh').state)).toBe(false);
  });
});
