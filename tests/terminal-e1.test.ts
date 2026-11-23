import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM, humanSize, initialState, LIMITS, MAX_LINK_HOPS, physicalPath, type FsNode, type FsState } from '@/lib/terminal/fs';
import { expandGlob, hasMagic, matchName, type GlobIo } from '@/lib/terminal/glob';
import { MANUAL } from '@/lib/terminal/manual';
import { ACTIONS_PROFILE, ARTIFACTS_PROFILE, CLUSTER_PROFILE, PROBES_PROFILE, WORKLOADS_PROFILE, COMMANDS, DEPLOY_HOSTS_PROFILE, ENVIRONMENTS_PROFILE, COMPOSE_PROFILE, CONTAINERS_PROFILE, DIAGNOSTICS_PROFILE, DNS_PROFILE, EDGE_PROFILE, E1_COMMANDS, FILES_PROFILE, FIREWALL_PROFILE, FORGE_PROFILE, GIT_PROFILE, HTTP_PROFILE, IMAGES_PROFILE, LAB_PROFILE, NGINX_PROFILE, PACKAGES_PROFILE, PROCESSES_PROFILE, PROFILES, PROXY_PROFILE, REMOTE_PROFILE, run, RUNTIME_PROFILE, SCHEDULING_PROFILE, SCRIPTING_PROFILE, SERVICES_PROFILE, SOCKETS_PROFILE, STORAGE_NET_PROFILE, STREAMS_PROFILE, TLS_PROFILE, tokenize, TUNNELS_PROFILE, USERS_PROFILE, WORKFLOWS_PROFILE } from '@/lib/terminal/shell';
import {
  checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, type TerminalLessonContent, type TerminalMachine,
} from '@/lib/terminal/lesson';
import { machineTree } from '@/components/curriculum/terminal-lesson';
import { archiveExercise, filesContent, filesMachine, linkExercise, readAllExercise, terminalContent, webMachine } from './support/terminal-fixture';

/*
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): the files profile. uname, hostname, man and --help,
 * df and du, globs, symbolic links (ln -s, readlink, every command following them with a hop limit), multi-source cp/mv,
 * ls -h and -d. The lab profile (and run() without a profile) keeps refusing all of it; lesson machines opt in with
 * profile: 'files', and the validator checks the new machine fields.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; lines: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, FILES_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), lines: r.lines.map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const srv = (...commands: string[]) => session(filesMachine, ...commands);
const lab = (command: string) => run(initialState(), command);
const link = (path: string, target: string) => ({ path, kind: 'link' as const, mode: 0o777, owner: 'learner', target });
const withFiles = (...files: TerminalMachine['files']): TerminalMachine => ({ ...filesMachine, files: [...filesMachine.files, ...files] });
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = filesContent(); edit(c); return terminalContentProblems(c).join('\n'); };

describe('profiles', () => {
  it('adds the E1 commands and features in their own profile only', () => {
    expect(LAB_PROFILE).toEqual({ id: 'lab', commands: COMMANDS });
    expect([...FILES_PROFILE.commands].sort()).toEqual([...COMMANDS, ...E1_COMMANDS].sort());
    expect(FILES_PROFILE.features).toEqual(['glob', 'help-option', 'multi-source', 'ls-extra']);
    expect(PROFILES).toEqual({ lab: LAB_PROFILE, files: FILES_PROFILE, streams: STREAMS_PROFILE, users: USERS_PROFILE, processes: PROCESSES_PROFILE, packages: PACKAGES_PROFILE, services: SERVICES_PROFILE,
      remote: REMOTE_PROFILE, scripting: SCRIPTING_PROFILE, scheduling: SCHEDULING_PROFILE, sockets: SOCKETS_PROFILE, dns: DNS_PROFILE, http: HTTP_PROFILE, tls: TLS_PROFILE, nginx: NGINX_PROFILE,
      proxy: PROXY_PROFILE, firewall: FIREWALL_PROFILE, tunnels: TUNNELS_PROFILE, edge: EDGE_PROFILE, diagnostics: DIAGNOSTICS_PROFILE, containers: CONTAINERS_PROFILE,
      images: IMAGES_PROFILE, 'storage-net': STORAGE_NET_PROFILE, compose: COMPOSE_PROFILE, runtime: RUNTIME_PROFILE, git: GIT_PROFILE, forge: FORGE_PROFILE, workflows: WORKFLOWS_PROFILE, actions: ACTIONS_PROFILE, artifacts: ARTIFACTS_PROFILE, environments: ENVIRONMENTS_PROFILE, 'deploy-hosts': DEPLOY_HOSTS_PROFILE, cluster: CLUSTER_PROFILE, probes: PROBES_PROFILE, workloads: WORKLOADS_PROFILE });
  });
  it('keeps the lab refusing every E1 command, glob, option and form', () => {
    for (const cmd of ['uname -a', 'hostname', 'man ls', 'df -h', 'du -s .', 'ln -s README.txt r', 'readlink r']) {
      const r = lab(cmd);
      expect(r.lines, cmd).toEqual([{ text: `bash: ${cmd.split(' ')[0]}: command not found（模擬環境支援：${COMMANDS.join('、')}）`, kind: 'err' }]);
      expect(r.state.nodes, cmd).toEqual(initialState().nodes);
    }
    expect(lab('ls *.txt').lines).toEqual([{ text: "ls: cannot access '*.txt': No such file or directory", kind: 'err' }]);
    expect(lab('echo t?p [st]*').lines).toEqual([{ text: 't?p [st]*', kind: 'out' }]);
    expect(lab('ls -lh').lines).toEqual([{ text: "ls: invalid option -- 'h'", kind: 'err' }]);
    expect(lab('ls -d tmp').lines).toEqual([{ text: "ls: invalid option -- 'd'", kind: 'err' }]);
    expect(lab('ls --help').lines[0].text).toMatch(/^ls: invalid option/);
    expect(lab('cp README.txt secret.txt tmp').lines).toEqual([{ text: 'cp: 模擬環境一次只處理一個來源', kind: 'err' }]);
    expect(lab('cp').lines).toEqual([{ text: 'cp: missing destination file operand', kind: 'err' }]);
    const help = lab('help').lines.map(l => l.text).join('\n');
    expect(help).not.toMatch(/uname|萬用字元|ln -s|來源…/);
    expect(lab('ls tmp README.txt').lines.map(l => l.text)).toEqual(['tmp:', 'cache-1.log  cache-2.log', 'README.txt']);
  });
  it('gives the same lab results with or without links in the code path (no state has links)', () => {
    expect(run(initialState(), 'ls -la', LAB_PROFILE)).toEqual(run(initialState(), 'ls -la'));
    expect(physicalPath(initialState().nodes, '/home/learner/tmp/cache-1.log', true)).toBe('/home/learner/tmp/cache-1.log');
  });
  it('selects a lesson machine\'s profile: lab by default, files when it says so', () => {
    expect(profileOf(webMachine)).toBe(LAB_PROFILE);
    expect(profileOf(filesMachine)).toBe(FILES_PROFILE);
    expect(replay(filesMachine, ['hostname']).steps[0].output).toBe('srv-01');
    expect(replay(webMachine, ['hostname']).steps[0].output).toMatch(/^bash: hostname: command not found/);
    expect(replay(machineState(filesMachine), ['hostname']).steps[0].output).toMatch(/command not found/);
    expect(checkTerminalExercise(linkExercise, [filesMachine], linkExercise.solution).ok).toBe(true);
    expect(checkTerminalExercise(linkExercise, [filesMachine], linkExercise.solution, LAB_PROFILE).ok).toBe(false);
  });
});

describe('uname and hostname', () => {
  it('prints the machine\'s fields in uname\'s fixed order', () => {
    expect(srv('uname').last.out).toEqual(['Linux']);
    expect(srv('uname -a').last.out).toEqual(['Linux srv-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux']);
    expect(srv('uname -mr').last.out).toEqual(['6.8.0-45-generic x86_64']);
    expect(srv('uname -o -s -n').last.out).toEqual(['Linux srv-01 GNU/Linux']);
    expect(srv('uname -v').last.out).toEqual(['#45-Ubuntu SMP PREEMPT_DYNAMIC']);
    expect(srv('uname -p').last.err).toEqual(["uname: invalid option -- 'p'", "Try 'uname --help' for more information."]);
    expect(srv('uname now').last.err).toEqual(["uname: extra operand 'now'", "Try 'uname --help' for more information."]);
    expect(session(initialState(), 'uname -a').last.out).toEqual([`Linux logic-island ${DEFAULT_SYSTEM.release} ${DEFAULT_SYSTEM.version} x86_64 GNU/Linux`]);
  });
  it('prints the host name; only root may change it', () => {
    expect(srv('hostname').last.out).toEqual(['srv-01']);
    expect(session(initialState(), 'hostname').last.out).toEqual(['logic-island']);
    expect(srv('hostname web-02').last.err).toEqual(['hostname: you must be root to change the host name']);
    const root = { ...machineState(filesMachine), user: 'root', home: '/root' };
    const renamed = session(root, 'hostname web-02', 'hostname', 'uname -n');
    expect(renamed.log.map(l => l.out)).toEqual([[], ['web-02'], ['web-02']]);
    expect(session(root, 'hostname Bad_Name!').last.err).toEqual(['hostname: the specified hostname is invalid']);
  });
});

describe('man and --help', () => {
  it('has a short manual for every command of the profile', () => {
    expect(Object.keys(MANUAL).sort()).toEqual([...FILES_PROFILE.commands].sort());
    for (const cmd of FILES_PROFILE.commands) {
      const page = srv(`man ${cmd}`).last;
      expect(page.err, cmd).toEqual([]);
      expect(page.out[0], cmd).toBe(`${cmd.toUpperCase()}(1)        User Commands        ${cmd.toUpperCase()}(1)`);
      expect(page.out, cmd).toContain(`       ${cmd} - ${MANUAL[cmd].summary}`);
      expect(page.out, cmd).toContain('SYNOPSIS');
      if (cmd === 'echo') continue;
      const help = srv(`${cmd} --help`).last;
      expect(help.out[0], cmd).toBe(`用法：${MANUAL[cmd].usage}`);
      expect(help.out[1], cmd).toBe(`${MANUAL[cmd].summary}。`);
    }
  });
  it('prints the GNU messages for no page and unknown pages, and --help anywhere before --', () => {
    expect(srv('man').last.err).toEqual(['What manual page do you want?', "For example, try 'man man'."]);
    expect(srv('man sudo').last.err).toEqual(['No manual entry for sudo']);
    expect(srv('man grep ls').last.lines[0]).toBe('No manual entry for grep');
    expect(srv('man pwd cd').last.out.filter(l => /\(1\)/.test(l))).toHaveLength(2);
    expect(srv('ls -l --help').last.out[0]).toBe('用法：ls [-l] [-a] [-h] [-d] [路徑]…');
    expect(srv('echo --help').last.out).toEqual(['--help']);
    expect(srv('rm -- --help').last.err).toEqual(["rm: cannot remove '--help': No such file or directory"]);
    expect(srv('sudo --help').last.err[0]).toMatch(/^bash: sudo: command not found（模擬環境支援：pwd、ls/);
  });
  it('lists the E1 commands and globs in help', () => {
    const help = srv('help').last.out.join('\n');
    for (const cmd of E1_COMMANDS) expect(help, cmd).toMatch(new RegExp(`^  ${cmd} `, 'm'));
    expect(help).toMatch(/cp \[-r\] 來源… 目的地/);
    expect(help).toMatch(/萬用字元/);
  });
});

describe('df and du', () => {
  it('prints the declared mount table in GNU df\'s columns', () => {
    expect(srv('df').last.out).toEqual([
      'Filesystem     1K-blocks    Used Available Use% Mounted on',
      '/dev/sda1       20509264 4823500  15685764  24% /',
      '/dev/sdb1      104806400 1048576 103757824   2% /srv',
    ]);
    expect(srv('df -h').last.out).toEqual([
      'Filesystem      Size  Used Avail Use% Mounted on',
      '/dev/sda1        20G  4.7G   15G  24% /',
      '/dev/sdb1       100G  1.0G   99G   2% /srv',
    ]);
    expect(srv('df -hT').last.out).toEqual([
      'Filesystem     Type  Size  Used Avail Use% Mounted on',
      '/dev/sda1      ext4   20G  4.7G   15G  24% /',
      '/dev/sdb1      xfs   100G  1.0G   99G   2% /srv',
    ]);
  });
  it('finds the file system of each path, and reports missing paths and machines without mounts', () => {
    const r = srv('df -h /srv/data ~ /nope');
    expect(r.last.lines).toEqual(['df: /nope: No such file or directory', 'Filesystem      Size  Used Avail Use% Mounted on',
      '/dev/sdb1       100G  1.0G   99G   2% /srv', '/dev/sda1        20G  4.7G   15G  24% /']);
    expect(srv('df /nope').last.lines).toEqual(['df: /nope: No such file or directory']);
    expect(session(initialState(), 'df').last.err).toEqual(['df: no file systems processed']);
    expect(srv('df -i').last.err).toEqual(["df: invalid option -- 'i'", "Try 'df --help' for more information."]);
    const tiny = { ...machineState(filesMachine), mounts: [{ path: '/', device: 'tmpfs', type: 'tmpfs', size: 0, used: 0 }, { path: '/srv', device: 'x', type: 'ext4', size: 3, used: 1 }] };
    expect(session(tiny, 'df').last.out).toEqual(['Filesystem     1K-blocks  Used Available Use% Mounted on', 'tmpfs                  0     0         0    - /', 'x                      3     1         2  34% /srv']);
  });
  it('rounds sizes up the GNU way', () => {
    expect([0, 1, 1023, 1024, 1536, 4096, 10 * 1024 - 1, 10 * 1024, 12288, 1048064, 1048576, 1024 ** 3 * 4.6].map(humanSize))
      .toEqual(['0', '1', '1023', '1.0K', '1.5K', '4.0K', '10K', '10K', '12K', '1.0M', '1.0M', '4.6G']);
  });
  it('counts 4K for a folder, a file\'s size in whole 4K blocks, nothing for a link', () => {
    // ~: the folder 4 + .bashrc 4 + logs 20 + reports 8 + the link latest 0.
    expect(srv('du').last.out).toEqual(['20\t./logs', '8\t./reports', '36\t.']);
    expect(srv('du logs').last.out).toEqual(['20\tlogs']);
    expect(srv('du -a logs/').last.out).toEqual(['4\tlogs/app-1.log', '4\tlogs/app-2.log', '8\tlogs/web.log', '20\tlogs/']);
    expect(srv('du -sh . /srv').last.out).toEqual(['36K\t.', '8.0K\t/srv']);
    expect(srv('du -h latest reports/today.txt').last.out).toEqual(['0\tlatest', '4.0K\treports/today.txt']);
    const sized = session(machineState(withFiles({ path: '/srv/data/a', kind: 'file', mode: 0o644, owner: 'learner', content: 'x'.repeat(4000) },
      { path: '/srv/data/b', kind: 'file', mode: 0o644, owner: 'learner', content: '' }, { path: '/srv/data/c', kind: 'file', mode: 0o644, owner: 'learner', content: 'é'.repeat(2049) })), 'du -a /srv/data');
    expect(sized.last.out).toEqual(['4\t/srv/data/a', '0\t/srv/data/b', '8\t/srv/data/c', '16\t/srv/data']);
  });
  it('reports what it cannot read or access, and refuses -s with -a', () => {
    expect(srv('chmod 300 logs', 'du logs').last.lines).toEqual(["du: cannot read directory 'logs': Permission denied", '4\tlogs']);
    expect(srv('du nope').last.err).toEqual(["du: cannot access 'nope': No such file or directory"]);
    expect(srv('du -sa').last.err).toEqual(['du: cannot both summarize and show all entries', "Try 'du --help' for more information."]);
  });
});

describe('globs', () => {
  const home = srv('touch .hidden a.txt b.txt c.md ab.txt', 'mkdir -p d1/inner d2', 'touch d1/x.txt d2/y.txt').state;
  const at = (...commands: string[]) => session(home, ...commands);
  it('expands * ? and brackets, sorted, in every argument', () => {
    expect(at('echo *.txt').last.out).toEqual(['a.txt ab.txt b.txt']);
    expect(at('echo ?.txt').last.out).toEqual(['a.txt b.txt']);
    expect(at('echo [ab].txt').last.out).toEqual(['a.txt b.txt']);
    expect(at('echo [a-b]?.txt [c-z]*').last.out).toEqual(['ab.txt c.md d1 d2 latest logs reports']);
    expect(at('echo [!a]*.txt [^ab]*').last.out).toEqual(['b.txt c.md d1 d2 latest logs reports']);
    expect(at('echo */*.txt').last.out).toEqual(['d1/x.txt d2/y.txt reports/today.txt']);
    expect(at('echo d*/').last.out).toEqual(['d1/ d2/']);
    expect(at('echo ~/d?/*').last.out).toEqual(['/home/learner/d1/inner /home/learner/d1/x.txt /home/learner/d2/y.txt']);
    expect(at('echo /home/learner/logs/app-?.log').last.out).toEqual(['/home/learner/logs/app-1.log /home/learner/logs/app-2.log']);
    expect(at('cat logs/app*').last.out).toEqual(['app started', 'app stopped']);
    expect(at('rm *.txt', 'ls').last.out).toEqual(['c.md  d1/  d2/  latest@  logs/  reports/']);
  });
  it('hides dotfiles unless the pattern starts with a dot, and never matches . or ..', () => {
    expect(at('echo *').last.out[0]).not.toMatch(/hidden|bashrc/);
    expect(at('echo .*').last.out).toEqual(['.bashrc .hidden']);
    expect(at('echo .h*').last.out).toEqual(['.hidden']);
    expect(at('echo ?hidden').last.out).toEqual(['?hidden']);
  });
  it('keeps a pattern that matches nothing, quoted characters and unclosed brackets literal', () => {
    expect(at('ls *.zip').last.err).toEqual(["ls: cannot access '*.zip': No such file or directory"]);
    expect(at('echo "*.txt" \'?.txt\' "a"*.txt').last.out).toEqual(['*.txt ?.txt a.txt ab.txt']);
    expect(at('echo a[ [z-a]* x]').last.out).toEqual(['a[ [z-a]* x]']);
    expect(at('touch "[ab].txt"', 'echo \\[*').last.out).toEqual(['\\[*']);
    expect(at('touch "[ab].txt"', 'ls "[ab].txt"').last.out).toEqual(['[ab].txt']);
  });
  it('does not expand the command name or a redirection\'s file, and needs a readable folder', () => {
    expect(at('*.txt').last.err[0]).toMatch(/^bash: \*\.txt: command not found/);
    const written = at('echo hi > *.log');
    expect(written.state.nodes.get('/home/learner/*.log')).toMatchObject({ kind: 'file', content: 'hi\n' });
    expect(at('chmod 300 d1', 'echo d1/*').last.out).toEqual(['d1/*']);
  });
  it('matches names on their own (pure helpers)', () => {
    expect(hasMagic('a\\*b')).toBe(false);
    expect(hasMagic('a[b')).toBe(true);
    expect(matchName('*', '.x')).toBe(false);
    expect(matchName('\\.*', '.x')).toBe(true);
    expect(matchName('[]a]', ']')).toBe(true);
    expect(matchName('[a-]', '-')).toBe(true);
    expect(matchName('?', '測')).toBe(true);
    const io: GlobIo = { list: p => p === '' ? ['b', 'a', 'c'] : null, exists: () => true, isDir: () => false };
    expect(expandGlob('*', '/home', io)).toEqual(['a', 'b', 'c']);
    expect(expandGlob('*/', '/home', io)).toEqual([]);
    expect(tokenize('echo "*" *')).toEqual({ words: ['echo', '*', '*'] });
  });
});

describe('symbolic links', () => {
  it('creates links with ln -s and shows them in ls', () => {
    const made = srv('ln -s /srv/data data', 'ln -s logs/web.log', 'ls', 'ls -l data web.log', 'ls -lh latest');
    expect(made.log[2].out).toEqual(['data@  latest@  logs/  reports/  web.log@']);
    expect(made.log[3].out).toEqual(['lrwxrwxrwx learner learner     9 data -> /srv/data', 'lrwxrwxrwx learner learner    12 web.log -> logs/web.log']);
    expect(made.last.out).toEqual(['lrwxrwxrwx learner learner    17 latest -> reports/today.txt']);
    expect(made.state.nodes.get('/home/learner/data')).toEqual({ kind: 'link', mode: 0o777, owner: 'learner', target: '/srv/data' });
    expect(srv('ln -s /etc/os-release reports', 'ls -l reports').last.out).toEqual(['lrwxrwxrwx learner learner    15 os-release -> /etc/os-release', '-rw-r--r-- learner learner     9 today.txt']);
    expect(srv('ln -s reports/today.txt reports').last.err).toEqual(["ln: failed to create symbolic link 'reports/today.txt': File exists"]);
  });
  it('reports ln\'s errors and replaces with -f', () => {
    expect(srv('ln -s notes latest').last.err).toEqual(["ln: failed to create symbolic link 'latest': File exists"]);
    expect(srv('ln -s reports/today.txt').state.nodes.get('/home/learner/today.txt')).toMatchObject({ kind: 'link', target: 'reports/today.txt' });
    expect(srv('ln -s reports/today.txt', 'ln -s reports/today.txt').last.err).toEqual(["ln: failed to create symbolic link './today.txt': File exists"]);
    expect(srv('ln -sf logs/web.log latest', 'readlink latest').last.out).toEqual(['logs/web.log']);
    expect(srv('ln -sf x logs').state.nodes.get('/home/learner/logs/x')).toMatchObject({ kind: 'link', target: 'x' });
    expect(srv('ln -s x /etc/x').last.err).toEqual(["ln: failed to create symbolic link '/etc/x': Permission denied"]);
    expect(srv('ln -s x nowhere/x').last.err).toEqual(["ln: failed to create symbolic link 'nowhere/x': No such file or directory"]);
    expect(srv('ln -s a b c').last.err).toEqual(["ln: target 'c' is not a directory"]);
    expect(srv('ln -s').last.err).toEqual(['ln: missing file operand', "Try 'ln --help' for more information."]);
    expect(srv('ln -s "" e').last.err).toEqual(["ln: failed to create symbolic link 'e': No such file or directory"]);
    expect(srv('ln logs/web.log hard').last.err[0]).toMatch(/^ln: 模擬環境只支援符號連結/);
    expect(srv('ln -s a b logs', 'ls logs').last.out).toEqual(['a@  app-1.log  app-2.log  b@  web.log']);
  });
  it('follows links in cat, cd, ls, echo, touch and chmod; readlink shows them', () => {
    expect(srv('cat latest').last.out).toEqual(['3 errors']);
    const moved = srv('ln -s /srv/data data', 'cd data', 'pwd', 'touch x', 'ls /srv/data', 'cd ..', 'pwd');
    expect(moved.log.map(l => l.out)).toEqual([[], [], ['/home/learner/data'], [], ['x'], [], ['/home/learner']]);
    expect(srv('ln -s /srv/data data', 'ls data', 'ls -l data', 'ls -l data/').log.slice(1).map(l => l.lines))
      .toEqual([[], ['lrwxrwxrwx learner learner     9 data -> /srv/data'], []]);
    expect(srv('echo "4 errors" >> latest', 'cat reports/today.txt').last.out).toEqual(['3 errors', '4 errors']);
    expect(srv('chmod 600 latest', 'ls -l reports/today.txt latest').last.out).toEqual(['lrwxrwxrwx learner learner    17 latest -> reports/today.txt', '-rw------- learner learner     9 reports/today.txt']);
    expect(srv('readlink latest logs', 'readlink -f latest').log.map(l => l.out)).toEqual([['reports/today.txt'], ['/home/learner/reports/today.txt']]);
    expect(srv('ls -l latest/').last.err).toEqual(["ls: cannot access 'latest/': Not a directory"]);
  });
  it('handles dangling links and loops', () => {
    const s = srv('ln -s missing.txt dangling', 'ln -s loop loop', 'ls -l dangling', 'cat dangling', 'cat loop', 'cd loop', 'chmod 600 dangling', 'ls dangling loop');
    expect(s.log.slice(2).map(l => l.lines)).toEqual([
      ['lrwxrwxrwx learner learner    11 dangling -> missing.txt'],
      ['cat: dangling: No such file or directory'],
      ['cat: loop: Too many levels of symbolic links'],
      ['bash: cd: loop: Too many levels of symbolic links'],
      ["chmod: cannot operate on dangling symlink 'dangling'"],
      ['dangling@  loop@'],
    ]);
    const created = srv('ln -s missing.txt dangling', 'echo hi > dangling', 'cat missing.txt', 'ln -s other.txt d2', 'touch d2');
    expect(created.log[2].out).toEqual(['hi']);
    expect(created.state.nodes.get('/home/learner/other.txt')).toMatchObject({ kind: 'file', content: '' });
  });
  it('follows at most MAX_LINK_HOPS links in one path', () => {
    const chain = (n: number) => Array.from({ length: n }, (_, i) => link(`/srv/data/l${i}`, i === n - 1 ? '/home/learner/reports/today.txt' : `l${i + 1}`));
    expect(session(machineState(withFiles(...chain(MAX_LINK_HOPS))), 'cat /srv/data/l0').last.out).toEqual(['3 errors']);
    expect(session(machineState(withFiles(...chain(MAX_LINK_HOPS + 1))), 'cat /srv/data/l0').last.err).toEqual(['cat: /srv/data/l0: Too many levels of symbolic links']);
  });
  it('removes and moves the link itself, never what it points to', () => {
    const removed = srv('rm latest');
    expect(removed.state.nodes.has('/home/learner/latest')).toBe(false);
    expect(removed.state.nodes.get('/home/learner/reports/today.txt')).toMatchObject({ content: '3 errors\n' });
    const dir = srv('ln -s /srv/data data', 'rm data', 'ls /srv');
    expect(dir.log[1].err).toEqual([]);
    expect(dir.last.out).toEqual(['data/']);
    const inside = srv('mkdir box', 'ln -s ../reports box/r', 'rm -r box');
    expect(inside.state.nodes.has('/home/learner/reports/today.txt')).toBe(true);
    const moved = srv('mv latest newest', 'ls -l newest', 'cat newest');
    expect(moved.log.slice(1).map(l => l.out)).toEqual([['lrwxrwxrwx learner learner    17 newest -> reports/today.txt'], ['3 errors']]);
  });
  it('copies what a link points to, or the link itself with -r', () => {
    const copied = srv('cp latest copy.txt', 'cp -r latest kept', 'ls -l copy.txt kept');
    expect(copied.last.out).toEqual(['-rw-r--r-- learner learner     9 copy.txt', 'lrwxrwxrwx learner learner    17 kept -> reports/today.txt']);
    expect(srv('mkdir box', 'ln -s ../reports box/r', 'cp -r box box2', 'ls -l box2').last.out).toEqual(['lrwxrwxrwx learner learner    10 r -> ../reports']);
    expect(srv('ln -s /srv/data data', 'cp latest data', 'ls /srv/data').last.out).toEqual(['latest']);
  });
  it('keeps the working directory checks on the real path', () => {
    expect(srv('ln -s /srv/data data', 'cd data', 'rm -r /srv/data').last.err[0]).toMatch(/目前所在的目錄在它裡面/);
    expect(srv('ln -s /srv/data data', 'mkdir -p data/sub', 'ls /srv/data').last.out).toEqual(['sub/']);
  });
});

describe('cp and mv with several sources, ls -d and -h', () => {
  it('copies and moves several sources into a folder', () => {
    const s = srv('mkdir archive', 'cp logs/app-1.log logs/app-2.log archive', 'mv logs/web.log reports/today.txt archive/', 'ls archive logs reports');
    expect(s.log.every(l => !l.err.length)).toBe(true);
    expect(s.last.out).toEqual(['archive:', 'app-1.log  app-2.log  today.txt  web.log', '', 'logs:', 'app-1.log  app-2.log', '', 'reports:']);
    expect(srv('mkdir a', 'cp -r logs reports a', 'ls a').last.out).toEqual(['logs/  reports/']);
  });
  it('prints GNU\'s messages, and continues after one source fails', () => {
    expect(srv('cp logs/app-1.log logs/app-2.log notes').last.err).toEqual(["cp: target 'notes' is not a directory"]);
    expect(srv('mv logs/app-1.log logs/app-2.log reports/today.txt').last.err).toEqual(["mv: target 'reports/today.txt' is not a directory"]);
    expect(srv('cp a b /etc/hidden/').last.err).toEqual(["cp: target '/etc/hidden/' is not a directory"]);
    expect(srv('chmod 600 reports', 'cp latest notes.txt reports/x').last.err).toEqual(["cp: failed to access 'reports/x': Permission denied"]);
    expect(srv('cp').last.err).toEqual(['cp: missing file operand', "Try 'cp --help' for more information."]);
    expect(srv('mv logs').last.err).toEqual(["mv: missing destination file operand after 'logs'", "Try 'mv --help' for more information."]);
    const partly = srv('mkdir box', 'cp logs/app-1.log nope.txt logs box', 'ls box');
    expect(partly.log[1].err).toEqual(["cp: cannot stat 'nope.txt': No such file or directory", "cp: -r not specified; omitting directory 'logs'"]);
    expect(partly.last.out).toEqual(['app-1.log']);
  });
  it('lists operands the GNU way: errors, then files together, then each folder', () => {
    expect(srv('ls reports notes.txt latest logs/web.log').last.lines).toEqual(["ls: cannot access 'notes.txt': No such file or directory",
      'latest@  logs/web.log', '', 'reports:', 'today.txt']);
    expect(srv('ls -d logs reports .').last.out).toEqual(['.  logs/  reports/']);
    expect(srv('ls -ld logs').last.out).toEqual(['drwxr-xr-x learner learner  4096 logs/']);
    expect(srv('ls -lh logs').last.out).toEqual(['-rw-r--r-- learner learner    12 app-1.log', '-rw-r--r-- learner learner    12 app-2.log', '-rw-r--r-- learner learner  5.3K web.log']);
    expect(srv('ls -d */').last.out).toEqual(['logs/  reports/']);
  });
});

describe('purity and limits', () => {
  it('never changes the state it was given', () => {
    const start = machineState(filesMachine), before = JSON.stringify([...start.nodes]);
    for (const c of ['ln -s a b', 'rm latest', 'mv logs/* reports', 'cp -r logs l2', 'echo x > latest', 'chmod 600 latest']) run(start, c, FILES_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(before);
  });
  it('keeps links within the node limit', () => {
    let state = machineState(filesMachine);
    for (let i = state.nodes.size; i < LIMITS.nodes; i++) state = run(state, `ln -s x l${i}`, FILES_PROFILE).state;
    expect(state.nodes.size).toBe(LIMITS.nodes);
    expect(run(state, 'ln -s x one-more', FILES_PROFILE).lines[0].text).toBe("ln: failed to create symbolic link 'one-more': No space left on device");
  });
});

describe('lesson machines on the files profile', () => {
  it('accepts the E1 content and shows links in the machine tree', () => {
    expect(terminalContentProblems(filesContent())).toEqual([]);
    expect(machineProblems(filesMachine)).toEqual([]);
    const node: FsNode | undefined = machineState(filesMachine).nodes.get('/home/learner/latest');
    expect(node).toEqual({ kind: 'link', mode: 0o777, owner: 'learner', target: 'reports/today.txt' });
    expect(machineTree(machineState(filesMachine))).toContain('lrwxrwxrwx learner:learner        latest -> reports/today.txt');
    expect(machineState(filesMachine)).toMatchObject({ system: filesMachine.system, mounts: filesMachine.mounts });
  });
  it('checks links, globs and multi-source moves by their result', () => {
    const { machines } = filesContent();
    expect(checkTerminalExercise(linkExercise, machines, ['cd ~', 'ln -s /home/learner/reports/today.txt current']).results[0].message)
      .toBe('/home/learner/current 應該是指向 reports/today.txt 的符號連結');
    const wrong = checkTerminalExercise(linkExercise, machines, ['ln -s today.txt current']);
    expect(wrong.results[0].message).toBe('/home/learner/current 應該是指向 reports/today.txt 的符號連結，但它指向 today.txt');
    expect(checkTerminalExercise(linkExercise, machines, ['cp latest current']).results[0].message).toMatch(/但它是檔案$/);
    expect(checkTerminalExercise(linkExercise, machines, []).results[0].message).toMatch(/但它不存在$/);
    expect(checkTerminalExercise(archiveExercise, machines, ['mkdir archive', 'mv logs/app-1.log logs/app-2.log archive']).ok).toBe(true);
    expect(checkTerminalExercise(archiveExercise, machines, ['mkdir archive', 'mv logs/*.log archive']).results.at(-1)!.ok).toBe(false);
    expect(checkTerminalExercise(readAllExercise, machines, ['cd logs', 'cat app-?.log']).ok).toBe(true);
    expect(checkTerminalExercise(readAllExercise, machines, ['echo app started', 'echo app stopped']).ok).toBe(false);
  });
  it('rejects links, system information and mounts on a lab machine', () => {
    const lab = (patch: Partial<TerminalMachine>) => machineProblems({ ...webMachine, ...patch }).join('\n');
    expect(lab({ files: [...webMachine.files, link('/home/learner/l', 'notes.txt')] })).toMatch(/symbolic links need engine stage E1 \(ln -s\): give the machine profile 'files'/);
    expect(lab({ system: { release: '6.8.0' } })).toMatch(/system information needs the files profile/);
    expect(lab({ mounts: [{ path: '/', device: '/dev/sda1', type: 'ext4', size: 10, used: 1 }] })).toMatch(/mounts need the files profile/);
    expect(lab({ profile: 'lab' })).toBe('');
    expect(lab({ profile: 'pipes' as never })).toMatch(/unknown profile pipes/);
  });
  it('reports bad links, system fields and mounts', () => {
    const cases: [(c: TerminalLessonContent) => void, RegExp][] = [
      [c => { c.machines[0].files.push({ ...link('/home/learner/x', 'y'), mode: 0o755 }); }, /file \/home\/learner\/x: a link's mode is always 0777/],
      [c => { c.machines[0].files.push(link('/home/learner/x', '')); }, /file \/home\/learner\/x: a link needs a target of 1..500 characters on one line/],
      [c => { c.machines[0].files.push(link('/home/learner/x', 'a\nb')); }, /a link needs a target/],
      [c => { c.machines[0].files.push({ ...link('/home/learner/x', 'y'), content: 'z' }); }, /only a file has content/],
      [c => { c.machines[0].files.push(link('/home/learner/latest/x', 'y')); }, /its parent folder is not listed/],
      [c => { c.machines[0].system = { kernel: '' }; }, /system kernel must be 1..64 printable ASCII characters/],
      [c => { c.machines[0].system = { release: ' 6.8' }; }, /system release must be/],
      [c => { c.machines[0].system = { os: 'Linux\n' }; }, /system os must be/],
      [c => { c.machines[0].system = { arch: 'x86' } as never; }, /unknown system field arch/],
      [c => { c.machines[0].mounts = [{ path: '/srv', device: 'd', type: 'ext4', size: 1, used: 0 }]; }, /the mounts need one on \//],
      [c => { c.machines[0].mounts!.push({ path: '/mnt', device: 'd', type: 'ext4', size: 1, used: 0 }); }, /mount \/mnt: not a folder of the machine/],
      [c => { c.machines[0].mounts!.push({ ...c.machines[0].mounts![1] }); }, /mount \/srv: listed twice/],
      [c => { c.machines[0].mounts![1].device = 'my disk'; }, /mount \/srv: the device needs 1..64 characters without spaces/],
      [c => { c.machines[0].mounts![1].type = 'EXT4'; }, /mount \/srv: invalid type EXT4/],
      [c => { c.machines[0].mounts![1].used = c.machines[0].mounts![1].size + 1; }, /mount \/srv: size and used must be whole 1K blocks/],
      [c => { c.machines[0].mounts![1].size = 1.5; }, /size and used must be whole/],
      [c => { c.machines[0].mounts![1].size = 2 ** 37; }, /size and used must be whole/],
      [c => { c.machines[0].mounts = Array.from({ length: 9 }, (_, i) => ({ path: '/', device: `d${i}`, type: 'ext4', size: 1, used: 0 })); }, /at most 8 mounts/],
      [c => { c.exercises[0].checks.push({ kind: 'link', path: '/home/learner/x', target: '' }); }, /exercise current: a link check needs a target/],
    ];
    for (const [edit, expected] of cases) expect(problems(edit), String(expected)).toMatch(expected);
  });
  it('rejects an E1 command on a machine whose profile lacks it, but lets an example show a typo', () => {
    const c = terminalContent();
    c.examples[0].steps.push({ command: 'uname -a', output: `bash: uname: command not found（模擬環境支援：${COMMANDS.join('、')}）` });
    expect(terminalContentProblems(c).join('\n')).toMatch(/example tour: uname is not in the lab profile of machine web/);
    const typo = terminalContent();
    typo.examples[0].steps.push({ command: 'sl', output: `bash: sl: command not found（模擬環境支援：${COMMANDS.join('、')}）` });
    expect(terminalContentProblems(typo)).toEqual([]);
    const mistake = terminalContent();
    mistake.exercises[0].mistakes.push({ commands: ['ln -s notes.txt backup'], why: '連結不是備份' });
    expect(terminalContentProblems(mistake).join('\n')).toMatch(/exercise backup: ln is not in the lab profile of machine web/);
    expect(problems(c => { c.examples[1].steps[0].output = '20G'; })).toMatch(/example disk: step 1 \(df -h\) prints/);
  });
});
