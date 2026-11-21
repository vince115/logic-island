import { describe, expect, it } from 'vitest';
import { can, initialState, LIMITS, type FsNode } from '@/lib/terminal/fs';
import { COMMANDS, LAB_PROFILE, prompt, run, type ShellProfile } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, replay, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalLessonContent } from '@/lib/terminal/lesson';
import { backupExercise, reportExercise, terminalContent, webMachine } from './support/terminal-fixture';

/*
 * LNX-0: the terminal lesson data (src/lib/terminal/lesson.ts) and the engine changes under it. Machines are built from
 * data; transcripts replay to exactly their stated output; an exercise's reference solution passes every check on its
 * machine and on every variant, the untouched machine and every typical mistake fail, and an output check cannot be
 * passed by typing the answer. The validator reports each kind of bad data. The engine's defaults keep the lab as it was.
 */
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = terminalContent(); edit(c); return terminalContentProblems(c).join('\n'); };

describe('the engine under the lessons', () => {
  it('uses the group bits only for a member of the node\'s group, and with the defaults behaves as before', () => {
    const team: FsNode = { kind: 'dir', mode: 0o775, owner: 'root', group: 'devs' };
    expect(can(team, 'learner', 'w', ['learner', 'devs'])).toBe(true);
    expect(can(team, 'learner', 'w', ['learner'])).toBe(false);
    expect(can(team, 'learner', 'w')).toBe(false);
    // A node without a group is in its owner's group: the group bits never apply to anyone else by default.
    expect(can({ kind: 'file', mode: 0o070, owner: 'root' }, 'learner', 'r')).toBe(false);
    expect(can({ kind: 'file', mode: 0o640, owner: 'root', group: 'adm' }, 'learner', 'r', ['learner', 'devs'])).toBe(false);
  });
  it('shows the machine\'s host in the prompt, logic-island by default, and # for root', () => {
    expect(prompt(machineState(webMachine))).toBe('learner@web-01:~$');
    expect(prompt(initialState())).toBe('learner@logic-island:~$');
    expect(prompt({ ...machineState(webMachine), user: 'root', home: '/root', cwd: '/etc' })).toBe('root@web-01:/etc#');
  });
  it('runs only a profile\'s commands; the lab profile is the whole table and the default', () => {
    expect(LAB_PROFILE.commands).toEqual(COMMANDS);
    const plain = run(initialState(), 'help'), lab = run(initialState(), 'help', LAB_PROFILE);
    expect(plain).toEqual(lab);
    expect(plain.lines.at(-1)!.text).toBe('  whoami、clear、help');
    const narrow: ShellProfile = { id: 'narrow', commands: ['pwd', 'ls', 'help'] };
    expect(run(initialState(), 'rm -r tmp', narrow).lines).toEqual([{ text: 'bash: rm: command not found（模擬環境支援：pwd、ls、help）', kind: 'err' }]);
    expect(run(initialState(), 'rm -r tmp', narrow).state.nodes.has('/home/learner/tmp')).toBe(true);
    expect(run(initialState(), 'help', narrow).lines.map(l => l.text.trim().split(/\s+/)[0])).toEqual(['可用的指令（模擬環境，不會執行真實的', 'pwd', 'ls', 'help']);
  });
  it('keeps a file\'s group when it is overwritten and gives a copy to the user', () => {
    let s = machineState({ ...webMachine, files: [...webMachine.files, { path: '/srv/team/a.txt', kind: 'file', mode: 0o664, owner: 'root', group: 'devs', content: 'a\n' }] });
    s = run(s, 'echo b > /srv/team/a.txt').state;
    expect(s.nodes.get('/srv/team/a.txt')).toEqual({ kind: 'file', mode: 0o664, owner: 'root', group: 'devs', content: 'b\n' });
    s = run(s, 'cp /srv/team/a.txt copy.txt').state;
    expect(s.nodes.get('/home/learner/copy.txt')).toEqual({ kind: 'file', mode: 0o664, owner: 'learner', content: 'b\n' });
    expect(run(s, 'ls -l /srv/team').lines[0].text).toBe('-rw-rw-r-- root    devs        2 a.txt');
  });
});

describe('machines and replay', () => {
  it('builds a machine with / and its files, and replays commands with every prompt and output', () => {
    const s = machineState(webMachine);
    expect(s.nodes.size).toBe(webMachine.files.length + 1);
    expect(s).toMatchObject({ cwd: '/home/learner', user: 'learner', home: '/home/learner', host: 'web-01', groups: ['learner', 'devs'] });
    const { state, steps } = replay(webMachine, ['cd reports', 'cat today.txt', 'cat /var/log/app.log']);
    expect(steps.map(x => [x.prompt, x.output])).toEqual([['learner@web-01:~$', ''], ['learner@web-01:~/reports$', '3 errors'], ['learner@web-01:~/reports$', 'cat: /var/log/app.log: Permission denied']]);
    expect(state.cwd).toBe('/home/learner/reports');
    expect(machineState(webMachine).cwd).toBe('/home/learner');
  });
  it('lays a variant\'s files over the machine', () => {
    const v = variantMachine(webMachine, reportExercise.variants![0]);
    expect(machineState(v).nodes.get('/home/learner/reports/today.txt')!.content).toBe('0 errors\n');
    expect(v.files).toHaveLength(webMachine.files.length);
  });
  it('accepts the reference content', () => {
    expect(terminalContentProblems(terminalContent())).toEqual([]);
  });
});

describe('exercises are checked by what the commands did', () => {
  it('passes the solution and any other correct sequence, and names each check', () => {
    const { machines } = terminalContent();
    expect(checkTerminalExercise(backupExercise, machines, backupExercise.solution).ok).toBe(true);
    const other = checkTerminalExercise(backupExercise, machines, ['mkdir -p ~/backup', 'cd backup', 'cp ../notes.txt .', 'chmod go-r notes.txt', 'ls -l']);
    expect(other.ok).toBe(true);
    expect(other.results.map(r => r.message)).toEqual(['/home/learner/backup 應該存在（目錄）', '/home/learner/backup/notes.txt 的內容應該符合題目',
      '/home/learner/backup/notes.txt 的權限應該是 600', '/home/learner/notes.txt 應該維持原樣']);
  });
  it('fails the untouched machine and each typical mistake, saying why', () => {
    const { machines } = terminalContent();
    expect(checkTerminalExercise(backupExercise, machines, []).ok).toBe(false);
    for (const m of backupExercise.mistakes) expect(checkTerminalExercise(backupExercise, machines, m.commands).ok, m.why).toBe(false);
    const moved = checkTerminalExercise(backupExercise, machines, backupExercise.mistakes[1].commands);
    expect(moved.results.find(r => !r.ok)!.message).toBe('/home/learner/notes.txt 應該維持原樣，但它被改動了');
    const open = checkTerminalExercise(backupExercise, machines, backupExercise.mistakes[0].commands);
    expect(open.results.find(r => !r.ok)!.message).toBe('/home/learner/backup/notes.txt 的權限應該是 600，但目前是 644');
  });
  it('replays an output answer on every variant, so a typed-in answer fails', () => {
    const { machines } = terminalContent();
    expect(checkTerminalExercise(reportExercise, machines, ['ls', 'cat reports/today.txt']).ok).toBe(true);
    expect(checkTerminalExercise(reportExercise, machines, ['cd reports', 'cat today.txt']).ok).toBe(true);
    const typed = checkTerminalExercise(reportExercise, machines, ['echo 3 errors']);
    expect(typed.ok).toBe(false);
    expect(typed.results[0].message).toMatch(/換成「另一天的報告」的機器重新執行時/);
  });
  it('checks absence, the working directory and owners', () => {
    const { machines } = terminalContent();
    const ex = { ...backupExercise, checks: [{ kind: 'absent', path: '/home/learner/reports' }, { kind: 'cwd', path: '/srv/team' },
      { kind: 'owner', path: '/srv/team/plan.txt', owner: 'learner', group: 'learner' }] as TerminalCheck[] };
    expect(checkTerminalExercise(ex, machines, ['rm -r reports', 'cd /srv/team', 'touch plan.txt']).ok).toBe(true);
    const r = checkTerminalExercise(ex, machines, ['cd /srv']).results.map(x => x.message);
    expect(r).toEqual(['/home/learner/reports 應該不存在，但它還在', '目前位置應該是 /srv/team，但目前在 /srv', '/srv/team/plan.txt 的擁有者應該是 learner、群組是 learner，但它不存在']);
  });
});

describe('the validator reports bad data', () => {
  it('rejects machines that cannot be built', () => {
    const file = (path: string, extra: object = {}) => ({ path, kind: 'file' as const, mode: 0o644, owner: 'learner', ...extra });
    const cases: [(c: TerminalLessonContent) => void, RegExp][] = [
      [c => { c.machines.push(structuredClone(c.machines[0])); }, /machine web: duplicate id/],
      [c => { c.machines[0].user = 'Bad User'; }, /invalid user Bad User/],
      [c => { c.machines[0].host = 'web_01!'; }, /invalid host web_01!/],
      [c => { c.machines[0].files.push(file('/home/learner//x')); }, /file \/home\/learner\/\/x: not an absolute, normalized path/],
      [c => { c.machines[0].files.push(file('notes.txt')); }, /file notes.txt: not an absolute, normalized path/],
      [c => { c.machines[0].files.push(file('/home/learner/../x')); }, /not an absolute, normalized path/],
      [c => { c.machines[0].files.push(file('/home/learner/notes.txt')); }, /file \/home\/learner\/notes.txt: listed twice/],
      [c => { c.machines[0].files.push(file('/opt/app/run.sh')); }, /file \/opt\/app\/run.sh: its parent folder is not listed before it/],
      [c => { c.machines[0].files.push(file('/home/learner/notes.txt/x')); }, /its parent folder is not listed/],
      [c => { c.machines[0].files.push({ ...file('/home/learner/latest'), kind: 'link', target: '/home/learner/notes.txt' }); }, /symbolic links need engine stage E1/],
      [c => { c.machines[0].files.push(file('/home/learner/a', { mode: 0o1000 })); }, /file \/home\/learner\/a: mode must be 0..0777/],
      [c => { c.machines[0].files.push(file('/home/learner/b', { mode: 4.5 })); }, /mode must be 0..0777/],
      [c => { c.machines[0].files.push(file('/home/learner/c', { owner: 'Root!' })); }, /invalid owner or group/],
      [c => { c.machines[0].files.push({ path: '/home/learner/d', kind: 'dir', mode: 0o755, owner: 'learner', content: 'x' }); }, /only a file has content/],
      [c => { c.machines[0].files.push(file('/home/learner/e', { content: 'x'.repeat(LIMITS.fileLength + 1) })); }, /content longer than/],
      [c => { c.machines[0].files.push(file(`/home/learner/${'n'.repeat(LIMITS.nameLength + 1)}`)); }, /name too long or too deep/],
      [c => { c.machines[0].cwd = '/home/learner/notes.txt'; }, /the working directory \/home\/learner\/notes.txt is not a folder/],
      [c => { c.machines[0].home = '/home/nobody'; }, /the home \/home\/nobody is not a folder/],
      [c => { c.machines[0].files.push(...Array.from({ length: LIMITS.nodes }, (_, i) => file(`/home/learner/f${i}`))); }, /more than 400 nodes/],
      [c => { c.machines = []; }, /needs 1..8 machines/],
    ];
    for (const [edit, expected] of cases) expect(problems(edit), String(expected)).toMatch(expected);
  });
  it('rejects examples that do not replay to exactly their output', () => {
    expect(problems(c => { c.examples[0].machine = 'nowhere'; })).toMatch(/example tour: unknown machine nowhere/);
    expect(problems(c => { c.examples[0].steps[1].output = 'notes.txt reports/'; })).toMatch(/example tour: step 2 \(ls\) prints "notes.txt  reports\/", not "notes.txt reports\/"/);
    expect(problems(c => { c.examples[1].steps[2].output = 'started'; })).toMatch(/example groups: step 3 \(cat \/var\/log\/app.log\) prints "cat: \/var\/log\/app.log: Permission denied"/);
    expect(problems(c => { c.examples[0].steps[0].command = '  '; })).toMatch(/example tour: an empty command/);
    expect(problems(c => { c.examples[0].steps[0].command = 'x'.repeat(LIMITS.input + 1); })).toMatch(/example tour: a command longer than 500/);
    expect(problems(c => { c.examples[0].steps = []; })).toMatch(/example tour: needs 1..30 steps/);
  });
  it('rejects exercises whose solution, start, mistakes or output check do not prove anything', () => {
    expect(problems(c => { c.exercises[0].machine = 'nowhere'; })).toMatch(/exercise backup: unknown machine nowhere/);
    expect(problems(c => { c.exercises[0].solution = ['mkdir backup', 'cp notes.txt backup/']; })).toMatch(/exercise backup: the solution fails: \/home\/learner\/backup\/notes.txt 的權限應該是 600，但目前是 644/);
    expect(problems(c => { c.exercises[0].solution.push('cat missing.txt'); })).toMatch(/exercise backup: the solution's command cat missing.txt prints an error: cat: missing.txt: No such file or directory/);
    expect(problems(c => { c.exercises[0].checks = [{ kind: 'absent', path: '/home/learner/tmp' }]; })).toMatch(/exercise backup: the machine passes before any command/);
    expect(problems(c => { c.exercises[0].mistakes.push({ commands: ['mkdir backup', 'cp notes.txt backup/', 'chmod 600 backup/notes.txt'], why: '其實是正解' }); }))
      .toMatch(/exercise backup: the typical mistake "其實是正解" passes the check/);
    expect(problems(c => { c.exercises[0].mistakes = []; })).toMatch(/exercise backup: needs at least one typical mistake/);
    expect(problems(c => { c.exercises[0].checks = []; })).toMatch(/exercise backup: needs at least one check/);
    expect(problems(c => { c.exercises[0].checks.push({ kind: 'exists', path: 'backup' }); })).toMatch(/exercise backup: check path backup is not absolute and normalized/);
    expect(problems(c => { c.exercises[0].checks.push({ kind: 'mode', path: '/home/learner/backup', mode: 0o7777 }); })).toMatch(/check mode must be 0..0777/);
    expect(problems(c => { c.exercises[0].checks.push({ kind: 'size' } as unknown as TerminalCheck); })).toMatch(/unknown check size/);
    expect(problems(c => { c.exercises[0].solution = []; })).toMatch(/the solution needs 1..30 commands/);
    expect(problems(c => { c.exercises[0].explanation = ' '; })).toMatch(/exercise backup: needs a title and an explanation/);
  });
  it('requires an output check to have a variant that prints something else, and a solution that prints', () => {
    expect(problems(c => { delete c.exercises[1].variants; })).toMatch(/exercise report: an output check needs a variant whose reference output differs/);
    expect(problems(c => { c.exercises[1].variants![0].files[0].content = '3 errors\n'; })).toMatch(/an output check needs a variant whose reference output differs/);
    expect(problems(c => { c.exercises[1].solution = ['cat reports/today.txt', 'cd reports']; c.exercises[1].mistakes = [{ commands: ['pwd'], why: 'x' }]; }))
      .toMatch(/exercise report: an output check needs a solution whose last command prints something/);
    expect(problems(c => { c.exercises[1].variants![0].files.push({ path: '/nowhere/x', kind: 'file', mode: 0o644, owner: 'learner' }); }))
      .toMatch(/exercise report: variant 另一天的報告: machine web: file \/nowhere\/x: its parent folder is not listed before it/);
    expect(problems(c => { c.exercises[1].variants![0].label = ''; })).toMatch(/exercise report: a variant needs a label/);
  });
  it('checks a machine on its own as well', () => {
    expect(machineProblems(webMachine)).toEqual([]);
    expect(machineProblems({ ...webMachine, groups: ['Devs'] })).toEqual(['machine web: invalid group Devs']);
  });
});
