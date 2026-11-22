import { describe, expect, it } from 'vitest';
import { initialState, LIMITS, type FsState } from '@/lib/terminal/fs';
import { compilePattern, getopt } from '@/lib/terminal/text';
import { MANUAL, STREAM_MANUAL } from '@/lib/terminal/manual';
import { commandNames, E2_COMMANDS, FILES_PROFILE, LAB_PROFILE, run, STREAMS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineState, profileOf, replay, terminalContentProblems, variantMachine, type TerminalMachine } from '@/lib/terminal/lesson';
import { filesContent, filesMachine, streamsContent, streamsMachine, topIpExercise, todoExercise } from './support/terminal-fixture';

/*
 * Engine stage E2 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §10): the streams profile — pipelines, redirection,
 * standard input and the text commands — and the fidelity fixes of the files profile (long options, GNU's Try line,
 * tilde expansion, cp/mv into a folder that does not exist, variants with their own host and uname fields). The lab
 * keeps refusing every pipe and the files profile keeps refusing pipes.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; lines: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, STREAMS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), lines: r.lines.map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const logs = (...commands: string[]) => session(streamsMachine, ...commands);
const out = (...commands: string[]) => logs(...commands).last.out;
const err = (...commands: string[]) => logs(...commands).last.err;
const content = (s: FsState, path: string) => s.nodes.get(path)?.content;
const H = '/home/learner';
const TRY = (cmd: string) => `Try '${cmd} --help' for more information.`;
const files = (...commands: string[]) => {
  let state = machineState(filesMachine);
  let last = { out: [] as string[], err: [] as string[] };
  for (const c of commands) {
    const r = run(state, c, FILES_PROFILE);
    state = r.state;
    last = { out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) };
  }
  return { state, ...last };
};

describe('the streams profile', () => {
  it('is the files profile plus the E2 commands and the pipes feature', () => {
    expect([...STREAMS_PROFILE.commands].sort()).toEqual([...FILES_PROFILE.commands, ...E2_COMMANDS].sort());
    expect(STREAMS_PROFILE.features).toEqual([...FILES_PROFILE.features, 'pipes']);
    expect(profileOf(streamsMachine)).toBe(STREAMS_PROFILE);
    expect(Object.keys(STREAM_MANUAL).sort()).toEqual([...E2_COMMANDS].sort());
  });
  it('leaves the lab and the files profile refusing pipes, redirection of input and the E2 commands', () => {
    const lab = run(initialState(), 'ls | cat');
    expect(lab.lines).toEqual([{ text: '此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。', kind: 'err' }]);
    for (const line of ['ls | head', 'cat < notes.txt', 'ls 2>&1']) expect(files(line).err[0], line).toMatch(/^此模擬器不支援管線/);
    for (const cmd of E2_COMMANDS) {
      expect(run(initialState(), `${cmd} x`).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(files(`${cmd} x`).err[0], cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
    }
    expect(run(initialState(), 'cat').lines[0].text).toBe('cat: 模擬環境沒有標準輸入，請指定檔案，例如 cat README.txt');
  });
  it('still refuses command lists, variables, substitution, background jobs and here-documents', () => {
    for (const line of ['ls; pwd', 'ls && pwd', 'ls || pwd', 'echo $HOME', 'echo `id`', 'sleep 1 &', 'cat <<EOF', 'ls >& f']) {
      const r = logs(line);
      expect(r.last.err, line).toEqual(['此模擬器不支援指令串接、變數、命令替換與背景執行（; && || $ ` &）；管線（|）與重新導向（> >> < 2> 2>&1）可以使用。']);
      expect(r.state.nodes, line).toEqual(machineState(streamsMachine).nodes);
    }
    expect(out('echo "a | b > c; d"')).toEqual(['a | b > c; d']);
  });
  it('prints bash\'s syntax errors and runs nothing', () => {
    expect(err('| wc')).toEqual(['bash: syntax error near unexpected token `|\'']);
    expect(err('ls | | wc')).toEqual(['bash: syntax error near unexpected token `|\'']);
    expect(err('ls |')).toEqual(['bash: syntax error: unexpected end of file']);
    expect(err('ls >')).toEqual(['bash: syntax error near unexpected token `newline\'']);
    expect(err('ls > | wc')).toEqual(['bash: syntax error near unexpected token `|\'']);
    expect(err('ls 2> > x')).toEqual(['bash: syntax error near unexpected token `>\'']);
    expect(logs('echo hi > a.txt |').state.nodes.has(`${H}/a.txt`)).toBe(false);
  });
});

describe('pipelines', () => {
  it('feeds each stage\'s standard output to the next, through three and more stages', () => {
    expect(out("cut -d ' ' -f 1 access.log | sort | uniq -c | sort -rn | head -n 2")).toEqual(['      3 203.0.113.7', '      2 198.51.100.2']);
    expect(out('cat access.log | grep login | grep -v 500 | wc -l')).toEqual(['2']);
    expect(out('ls | sort -r | head -n 2 | tr a-z A-Z')).toEqual(['STAFF.CSV', 'REPORTS']);
  });
  it('sends standard error to the terminal, in stage order, unless redirected', () => {
    expect(logs('cat nope.txt notes.txt | wc -l').last.lines).toEqual(['cat: nope.txt: No such file or directory', '3']);
    expect(logs('cat nope.txt notes.txt 2>&1 | wc -l').last.lines).toEqual(['4']);
    expect(logs('cat nope.txt | cat missing.txt').last.lines).toEqual(['cat: nope.txt: No such file or directory', 'cat: missing.txt: No such file or directory']);
  });
  it('runs a stage of a longer pipeline in a subshell: cd there does not move the session', () => {
    const r = logs('mkdir box | cd box', 'pwd');
    expect(r.state.cwd).toBe(H);
    expect(r.state.nodes.get(`${H}/box`)).toMatchObject({ kind: 'dir' });
    expect(logs('cd reports', 'pwd').last.out).toEqual([`${H}/reports`]);
  });
  it('lists one plain name per line when ls does not write to the terminal', () => {
    expect(out('ls | cat')).toEqual(['access.log', 'notes.txt', 'reports', 'staff.csv']);
    expect(out('ls')).toEqual(['access.log  notes.txt  reports/  staff.csv']);
    expect(out('ls -l reports notes.txt | cat')).toEqual(['-rw-r--r-- learner learner    48 notes.txt', '', 'reports:']);
    const saved = logs('ls > list.txt');
    expect(content(saved.state, `${H}/list.txt`)).toBe('access.log\nlist.txt\nnotes.txt\nreports\nstaff.csv\n');
  });
  it('refuses more than LIMITS.stages stages and cuts output over LIMITS.output characters', () => {
    expect(err(Array.from({ length: LIMITS.stages + 1 }, () => 'cat').join(' | ').replace(/^cat/, 'cat notes.txt'))).toEqual([`此模擬器的管線最多 ${LIMITS.stages} 段`]);
    expect(out(Array.from({ length: LIMITS.stages }, () => 'cat').join(' | ').replace(/^cat/, 'cat notes.txt'))).toHaveLength(3);
    const big = { ...machineState(streamsMachine), nodes: new Map([...machineState(streamsMachine).nodes, ...Array.from({ length: 8 }, (_, i) =>
      [`${H}/big${i}`, { kind: 'file' as const, mode: 0o644, owner: 'learner', content: 'x'.repeat(3999) + '\n' }] as const)]) };
    const r = session(big, 'cat big0 big1 big2 big3 big4 big5 big6 big7');
    expect(r.last.out.join('\n').length).toBeLessThanOrEqual(LIMITS.output);
    expect(r.last.err).toEqual([`（模擬環境：輸出超過 ${LIMITS.output} 個字元，其餘省略）`]);
    expect(session(big, 'cat big0 big1 big2 big3 big4 big5 big6 big7 | wc -l').last.out).toEqual(['5']);
  });
});

describe('redirection', () => {
  it('> truncates or creates, >> appends, < reads, on any command', () => {
    const s = logs('grep TODO notes.txt > todo.txt', 'echo more >> todo.txt', 'wc -l < todo.txt', 'sort -r < todo.txt > sorted.txt', 'head -n 1 sorted.txt');
    expect(content(s.state, `${H}/todo.txt`)).toBe('TODO: rotate logs\nTODO: renew cert\nmore\n');
    expect(s.log[2].out).toEqual(['3']);
    expect(s.last.out).toEqual(['more']);
    expect(s.state.nodes.get(`${H}/todo.txt`)).toEqual({ kind: 'file', mode: 0o644, owner: 'learner', content: 'TODO: rotate logs\nTODO: renew cert\nmore\n' });
    expect(logs('> empty.txt').state.nodes.get(`${H}/empty.txt`)).toMatchObject({ kind: 'file', content: '' });
    expect(content(logs('echo a > notes.txt').state, `${H}/notes.txt`)).toBe('a\n');
  });
  it('separates and combines the error stream: 2>, 2>>, 2>&1 in both orders, >&2', () => {
    const s = logs('cat nope.txt notes.txt > out.txt 2> err.txt', 'cat nope.txt 2>> err.txt', 'cat err.txt');
    expect(s.log[0].lines).toEqual([]);
    expect(content(s.state, `${H}/out.txt`)).toBe('TODO: rotate logs\ndone: backup\nTODO: renew cert\n');
    expect(s.last.out).toEqual(['cat: nope.txt: No such file or directory', 'cat: nope.txt: No such file or directory']);
    // > f 2>&1: both into f, in order; 2>&1 > f: errors still on the terminal (bash's left-to-right rule).
    const both = logs('cat nope.txt notes.txt > all.txt 2>&1');
    expect(both.last.lines).toEqual([]);
    expect(content(both.state, `${H}/all.txt`)).toBe('cat: nope.txt: No such file or directory\nTODO: rotate logs\ndone: backup\nTODO: renew cert\n');
    const order = logs('cat nope.txt notes.txt 2>&1 > all.txt');
    expect(order.last.lines).toEqual(['cat: nope.txt: No such file or directory']);
    expect(content(order.state, `${H}/all.txt`)).toBe('TODO: rotate logs\ndone: backup\nTODO: renew cert\n');
    expect(logs('echo oops >&2').last.err).toEqual(['oops']);
    expect(logs('echo oops >&2 2> e.txt').last.err).toEqual(['oops']);
    expect(content(logs('echo oops 2> e.txt >&2').state, `${H}/e.txt`)).toBe('oops\n');
  });
  it('discards into /dev/null', () => {
    expect(logs('cat nope.txt notes.txt 2> /dev/null').last.lines).toEqual(['TODO: rotate logs', 'done: backup', 'TODO: renew cert']);
    expect(logs('cat nope.txt notes.txt > /dev/null').last.lines).toEqual(['cat: nope.txt: No such file or directory']);
    expect(logs('cat nope.txt notes.txt > /dev/null 2>&1').last.lines).toEqual([]);
    expect(out('wc -c < /dev/null')).toEqual(['0']);
    expect(out('cat /dev/null | wc -l')).toEqual(['0']);
    expect(logs('ls > /dev/null').state.nodes).toEqual(machineState(streamsMachine).nodes);
  });
  it('fails like bash on folders, missing folders, permissions and missing input, and skips the command', () => {
    expect(err('echo hi > reports')).toEqual(['bash: reports: Is a directory']);
    expect(err('echo hi > nowhere/x.txt')).toEqual(['bash: nowhere/x.txt: No such file or directory']);
    expect(err('echo hi > /var/log/new.log')).toEqual(['bash: /var/log/new.log: Permission denied']);
    expect(err('echo hi >> /var/log/auth.log')).toEqual(['bash: /var/log/auth.log: Permission denied']);
    expect(err('wc -l < nope.txt')).toEqual(['bash: nope.txt: No such file or directory']);
    expect(err('cat < /var/log/auth.log')).toEqual(['bash: /var/log/auth.log: Permission denied']);
    const skipped = logs('mkdir made > /var/log/x');
    expect(skipped.state.nodes.has(`${H}/made`)).toBe(false);
    // The message goes where standard error points at that moment.
    expect(logs('ls 2> /dev/null > /var/log/x').last.lines).toEqual([]);
    expect(content(logs('ls 2> e.txt > /var/log/x').state, `${H}/e.txt`)).toBe('bash: /var/log/x: Permission denied\n');
    expect(logs('chmod 444 notes.txt', 'echo x > notes.txt').last.err).toEqual(['bash: notes.txt: Permission denied']);
  });
  it('truncates before the command runs, even at the end of a pipeline', () => {
    expect(content(logs('sort notes.txt > notes.txt').state, `${H}/notes.txt`)).toBe('');
    expect(content(logs('cat notes.txt | sort > notes.txt').state, `${H}/notes.txt`)).toBe('');
    expect(content(logs('sort notes.txt > sorted.txt').state, `${H}/sorted.txt`)).toBe('TODO: renew cert\nTODO: rotate logs\ndone: backup\n');
  });
  it('expands ~ in a redirection, not globs, and keeps files within LIMITS.fileLength', () => {
    expect(logs('echo hi > ~/r.txt').state.nodes.has(`${H}/r.txt`)).toBe(true);
    expect(logs('echo hi > *.log').state.nodes.has(`${H}/*.log`)).toBe(true);
    const full = logs(`echo ${'x'.repeat(450)} > big.txt`, ...Array.from({ length: 9 }, () => `cat big.txt big.txt >> big2.txt`));
    expect(full.last.err).toEqual([`bash: big2.txt: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）`]);
    expect(content(full.state, `${H}/big2.txt`)!.length).toBeLessThanOrEqual(LIMITS.fileLength);
  });
});

describe('the reading commands', () => {
  it('cat: files, standard input, - and -n', () => {
    expect(out('echo hi | cat')).toEqual(['hi']);
    expect(out('echo hi | cat notes.txt - notes.txt')).toHaveLength(7);
    expect(out('cat -n notes.txt')).toEqual(['     1\tTODO: rotate logs', '     2\tdone: backup', '     3\tTODO: renew cert']);
    expect(err('cat')).toEqual(['cat: 模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入']);
    expect(err('cat reports')).toEqual(['cat: reports: Is a directory']);
    expect(err('cat -z notes.txt')).toEqual(["cat: invalid option -- 'z'", TRY('cat')]);
    // Without a newline at the end, the next file continues the line, as with GNU cat.
    expect(out('echo -n ab > a.txt', 'cat a.txt a.txt')).toEqual(['abab']);
  });
  it('less: like cat without paging, less\'s own messages', () => {
    expect(out('less notes.txt')).toEqual(['TODO: rotate logs', 'done: backup', 'TODO: renew cert']);
    expect(out('grep TODO notes.txt | less')).toEqual(['TODO: rotate logs', 'TODO: renew cert']);
    expect(err('less')).toEqual(['Missing filename ("less --help" for help)']);
    expect(err('less nope')).toEqual(['nope: No such file or directory']);
    expect(err('less reports')).toEqual(['reports is a directory']);
  });
  it('head and tail: -n N, -N, -n +N, -n -N, -c, several files with headers', () => {
    expect(out('head -n 2 access.log')).toEqual(['203.0.113.7 GET /index.html 200', '198.51.100.2 GET /login 401']);
    expect(out('head -2 staff.csv')).toEqual(['name,dept,age', 'ann,ops,34']);
    expect(out('head -n -4 staff.csv')).toEqual(['name,dept,age']);
    expect(out('head notes.txt')).toHaveLength(3);
    expect(out('tail -n 1 notes.txt')).toEqual(['TODO: renew cert']);
    expect(out('tail -1 notes.txt')).toEqual(['TODO: renew cert']);
    expect(out('tail -n +4 staff.csv')).toEqual(['cy,dev,41', 'dee,ops,25']);
    expect(out('head -c 4 notes.txt')).toEqual(['TODO']);
    expect(out('tail -c 5 notes.txt')).toEqual(['cert']);
    expect(out('head -n 1 notes.txt staff.csv')).toEqual(['==> notes.txt <==', 'TODO: rotate logs', '', '==> staff.csv <==', 'name,dept,age']);
    expect(out('echo x | head -v -n 1')).toEqual(['==> standard input <==', 'x']);
    expect(err('head -n x notes.txt')).toEqual(["head: invalid number of lines: 'x'"]);
    expect(err('head -n')).toEqual(["head: option requires an argument -- 'n'", TRY('head')]);
    expect(err('tail nope.txt')).toEqual(["tail: cannot open 'nope.txt' for reading: No such file or directory"]);
    expect(err('head reports')).toEqual(["head: error reading 'reports': Is a directory"]);
    expect(err('tail -f notes.txt')).toEqual(['tail: 模擬環境不支援 -f：檔案不會繼續增加內容']);
    expect(out('head --lines=1 notes.txt')).toEqual(['TODO: rotate logs']);
  });
  it('grep: -i -n -v -c -w -x -l -E -F -e, file prefixes and errors', () => {
    expect(out('grep todo notes.txt')).toEqual([]);
    expect(out('grep -i todo notes.txt')).toEqual(['TODO: rotate logs', 'TODO: renew cert']);
    expect(out('grep -n login access.log')).toEqual(['2:198.51.100.2 GET /login 401', '4:192.0.2.9 POST /login 500', '5:198.51.100.2 GET /login 401']);
    expect(out('grep -v GET access.log')).toEqual(['192.0.2.9 POST /login 500']);
    expect(out('grep -c 203.0.113.7 access.log')).toEqual(['3']);
    expect(out('grep -c TODO notes.txt staff.csv')).toEqual(['notes.txt:2', 'staff.csv:0']);
    expect(out('grep -l TODO notes.txt staff.csv access.log')).toEqual(['notes.txt']);
    expect(out('grep dep staff.csv')).toEqual(['name,dept,age']);
    expect(out('grep -w dep staff.csv')).toEqual([]);
    expect(out('grep -w dev staff.csv')).toEqual(['bo,dev,28', 'cy,dev,41']);
    expect(out('grep -x "done: backup" notes.txt')).toEqual(['done: backup']);
    expect(out('grep -E "40[14]" access.log')).toEqual(['198.51.100.2 GET /login 401', '198.51.100.2 GET /login 401', '203.0.113.7 GET /missing 404']);
    expect(out('grep -E "POST|missing" access.log')).toHaveLength(2);
    expect(out('grep -F 0.2. access.log')).toEqual(['192.0.2.9 POST /login 500']);
    expect(out('grep -e TODO -e done notes.txt')).toHaveLength(3);
    expect(out('grep -h TODO notes.txt notes.txt')).toEqual(['TODO: rotate logs', 'TODO: renew cert', 'TODO: rotate logs', 'TODO: renew cert']);
    expect(out('grep -H done notes.txt')).toEqual(['notes.txt:done: backup']);
    expect(out('cat notes.txt | grep -c TODO')).toEqual(['2']);
    expect(out('cat notes.txt | grep done - staff.csv')).toEqual(['(standard input):done: backup']);
    expect(err('grep')).toEqual(['Usage: grep [OPTION]... PATTERNS [FILE]...', TRY('grep')]);
    expect(logs('grep x nope.txt notes.txt').last.lines).toEqual(['grep: nope.txt: No such file or directory']);
    expect(err('grep x reports')).toEqual(['grep: reports: Is a directory']);
    expect(err('grep x /var/log/auth.log')).toEqual(['grep: /var/log/auth.log: Permission denied']);
    expect(err('grep "[a" notes.txt')).toEqual(['grep: Unmatched [, [^, [:, [., or [=']);
    expect(err('grep -E "(a" notes.txt')).toEqual(['grep: Unmatched ( or \\(']);
  });
  it('grep: basic regular expressions — anchors, ., *, brackets, classes, escapes', () => {
    expect(out('grep "^TODO" notes.txt')).toHaveLength(2);
    expect(out('grep "logs$" notes.txt')).toEqual(['TODO: rotate logs']);
    expect(out('grep "r.n" notes.txt')).toEqual(['TODO: renew cert']);
    expect(out('grep "0\\.2\\." access.log')).toEqual(['192.0.2.9 POST /login 500']);
    expect(out('grep "[[:digit:]][[:digit:]]$" staff.csv')).toHaveLength(4);
    expect(out('grep "^[^,]*,ops" staff.csv')).toEqual(['ann,ops,34', 'dee,ops,25']);
    expect(out('grep "a*n," staff.csv')).toHaveLength(1);
    expect(out('grep "*" notes.txt')).toEqual([]);
    expect(out('grep "40\\{2\\}\\|500" access.log')).toEqual(['192.0.2.9 POST /login 500']);
  });
  it('grep -r: folders recursively, sorted, with names; unreadable files reported', () => {
    const s = logs('mkdir -p logs/old', 'echo "TODO: a" > logs/a.txt', 'echo "TODO: b" > logs/old/b.txt');
    expect(session(s.state, 'grep -r TODO logs').last.out).toEqual(['logs/a.txt:TODO: a', 'logs/old/b.txt:TODO: b']);
    expect(session(s.state, 'cd logs', 'grep -r TODO').last.out).toEqual(['a.txt:TODO: a', 'old/b.txt:TODO: b']);
    expect(session(s.state, 'cd logs', 'grep -r TODO .').last.out).toEqual(['./a.txt:TODO: a', './old/b.txt:TODO: b']);
    expect(session(s.state, 'grep -rc TODO logs/a.txt').last.out).toEqual(['1']);
    expect(logs('grep -r root /var').last.lines).toEqual(['grep: /var/log/auth.log: Permission denied']);
  });
  it('sort: text in code point order, -n, -r, -u, -f, -t, -k (with key flags), and the last-resort compare', () => {
    const s = logs('echo -e "b\\na\\nB\\n10\\n9\\n10" > s.txt').state;
    expect(session(s, 'sort s.txt').last.out).toEqual(['10', '10', '9', 'B', 'a', 'b']);
    expect(session(s, 'sort -n s.txt').last.out).toEqual(['B', 'a', 'b', '9', '10', '10']);
    expect(session(s, 'sort -rn s.txt').last.out).toEqual(['10', '10', '9', 'b', 'a', 'B']);
    expect(session(s, 'sort -u s.txt').last.out).toEqual(['10', '9', 'B', 'a', 'b']);
    // -f folds case; equal keys fall back to the whole line (B before b); -u keeps the first of them in input order.
    expect(session(s, 'sort -f s.txt').last.out).toEqual(['10', '10', '9', 'a', 'B', 'b']);
    expect(session(s, 'sort -fu s.txt').last.out).toEqual(['10', '9', 'a', 'b']);
    expect(out('tail -n +2 staff.csv | sort -t , -k 3 -n')).toEqual(['dee,ops,25', 'bo,dev,28', 'ann,ops,34', 'cy,dev,41']);
    expect(out('tail -n +2 staff.csv | sort -t , -k 2,2 -k 3,3nr')).toEqual(['cy,dev,41', 'bo,dev,28', 'ann,ops,34', 'dee,ops,25']);
    expect(out("sort -k 4 access.log | cut -d ' ' -f 4 | uniq")).toEqual(['200', '401', '404', '500']);
    expect(out('sort notes.txt staff.csv | head -n 2')).toEqual(['TODO: renew cert', 'TODO: rotate logs']);
    expect(err('sort -t ab staff.csv')).toEqual(["sort: multi-character tab 'ab'"]);
    expect(err('sort -k x staff.csv')).toEqual(["sort: invalid number at field start: invalid count at start of 'x'"]);
    expect(logs('sort notes.txt nope.txt').last.lines).toEqual(['sort: open failed: nope.txt: No such file or directory']);
    expect(err('sort reports')).toEqual(['sort: read failed: reports: Is a directory']);
  });
  it('uniq: adjacent lines only, -c in GNU\'s width, -d, -u, -i', () => {
    const s = logs('echo -e "a\\na\\nb\\na\\nA" > u.txt').state;
    expect(session(s, 'uniq u.txt').last.out).toEqual(['a', 'b', 'a', 'A']);
    expect(session(s, 'uniq -c u.txt').last.out).toEqual(['      2 a', '      1 b', '      1 a', '      1 A']);
    expect(session(s, 'sort u.txt | uniq -c').last.out).toEqual(['      1 A', '      3 a', '      1 b']);
    expect(session(s, 'uniq -d u.txt').last.out).toEqual(['a']);
    expect(session(s, 'uniq -u u.txt').last.out).toEqual(['b', 'a', 'A']);
    expect(session(s, 'uniq -ic u.txt').last.out).toEqual(['      2 a', '      1 b', '      2 a']);
    expect(err('uniq a b c')).toEqual(["uniq: extra operand 'c'", TRY('uniq')]);
    expect(err('uniq nope')).toEqual(['uniq: nope: No such file or directory']);
  });
  it('wc: GNU\'s columns for files, standard input, one count and totals', () => {
    expect(out('wc notes.txt')).toEqual([' 3  8 48 notes.txt']);
    expect(out('wc -l notes.txt')).toEqual(['3 notes.txt']);
    expect(out('wc -lw notes.txt')).toEqual([' 3  8 notes.txt']);
    expect(out('cat notes.txt | wc')).toEqual(['      3       8      48']);
    expect(out('cat notes.txt | wc -l')).toEqual(['3']);
    expect(out('wc < notes.txt')).toEqual([' 3  8 48']);
    // The width is the digits of the regular files' total size (48 + 60 bytes: 3).
    expect(out('wc -l notes.txt staff.csv')).toEqual(['  3 notes.txt', '  5 staff.csv', '  8 total']);
    expect(out('echo 測試 | wc -m -c')).toEqual(['      3       7']);
    expect(out('echo -n abc | wc -l')).toEqual(['0']);
    expect(logs('wc -l nope.txt notes.txt').last.lines).toEqual(['wc: nope.txt: No such file or directory', '3 notes.txt', '3 total']);
    expect(logs('wc reports').last.lines).toEqual(['wc: reports: Is a directory', '      0       0       0 reports']);
  });
  it('cut: -f with -d and -s, -c, -b, lists, and GNU\'s errors', () => {
    expect(out('cut -d , -f 1,3 staff.csv | head -n 2')).toEqual(['name,age', 'ann,34']);
    expect(out('cut -d, -f2- staff.csv | tail -n 1')).toEqual(['ops,25']);
    expect(out('cut -d , -f -2 staff.csv | tail -n 1')).toEqual(['dee,ops']);
    expect(out('cut -d , -f 2 notes.txt')).toEqual(['TODO: rotate logs', 'done: backup', 'TODO: renew cert']);
    expect(out('cut -d : -s -f 2 notes.txt')).toEqual([' rotate logs', ' backup', ' renew cert']);
    expect(out('cut -c 1-4 notes.txt')).toEqual(['TODO', 'done', 'TODO']);
    expect(out('echo 測試資料 | cut -c 2-3')).toEqual(['試資']);
    expect(out('echo abc | cut -b 2')).toEqual(['b']);
    expect(out('echo "a\\tb" | cut -f 2')).toEqual(['a\\tb']);
    expect(out('echo -e "a\\tb" | cut -f 2')).toEqual(['b']);
    expect(err('cut staff.csv')).toEqual(['cut: you must specify a list of bytes, characters, or fields', TRY('cut')]);
    expect(err('cut -d ab -f 1 staff.csv')).toEqual(['cut: the delimiter must be a single character', TRY('cut')]);
    expect(err('cut -f 0 staff.csv')).toEqual(['cut: fields are numbered from 1', TRY('cut')]);
    expect(err('cut -f 3-1 staff.csv')).toEqual(['cut: invalid decreasing range', TRY('cut')]);
    expect(err('cut -c 1 -d , staff.csv')).toEqual(['cut: an input delimiter may be specified only when operating on fields', TRY('cut')]);
    expect(err('cut -f x staff.csv')).toEqual(["cut: invalid field value 'x'", TRY('cut')]);
  });
  it('tr: sets, ranges, classes, -d and -s, standard input only', () => {
    expect(out('echo hello | tr a-z A-Z')).toEqual(['HELLO']);
    expect(out('echo hello | tr [:lower:] [:upper:]')).toEqual(['HELLO']);
    expect(out('echo hello | tr el ip')).toEqual(['hippo']);
    expect(out('echo hello | tr a-y b')).toEqual(['bbbbb']);
    expect(out('echo "a,b,c" | tr , "\\n"')).toEqual(['a', 'b', 'c']);
    expect(out('echo hello world | tr -d lo')).toEqual(['he wrd']);
    expect(out('echo "a   b  c" | tr -s " "')).toEqual(['a b c']);
    expect(out('echo 2026-11-22 | tr -d [:digit:]')).toEqual(['--']);
    expect(err('tr')).toEqual(['tr: missing operand', TRY('tr')]);
    expect(err('echo x | tr a')).toEqual(["tr: missing operand after 'a'", 'Two strings must be given when translating.', TRY('tr')]);
    expect(err('tr a b notes.txt')).toEqual(["tr: extra operand 'notes.txt'", TRY('tr')]);
    expect(err('echo x | tr z-a b')).toEqual(["tr: range-endpoints of 'z-a' are in reverse collating sequence order"]);
    expect(err('tr a b')).toEqual(['tr: 模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入']);
  });
  it('tee: prints and writes, -a appends, with the user\'s permissions', () => {
    const s = logs('grep TODO notes.txt | tee todo.txt | wc -l', 'echo more | tee -a todo.txt copy.txt');
    expect(s.log[0].out).toEqual(['2']);
    expect(content(s.state, `${H}/todo.txt`)).toBe('TODO: rotate logs\nTODO: renew cert\nmore\n');
    expect(content(s.state, `${H}/copy.txt`)).toBe('more\n');
    expect(logs('echo x | tee /var/log/x reports/x').last.lines).toEqual(['tee: /var/log/x: Permission denied', 'x']);
    expect(err('tee x')).toEqual(['tee: 模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入']);
  });
  it('echo: -n without a newline, -e for \\n and \\t, other words as they are', () => {
    expect(content(logs('echo -n hi > a.txt').state, `${H}/a.txt`)).toBe('hi');
    expect(out('echo -e "a\\tb"')).toEqual(['a\tb']);
    expect(out('echo -x hi')).toEqual(['-x hi']);
    expect(out('echo --help')).toEqual(['--help']);
  });
  it('has a manual page and --help for every E2 command, and help lists them', () => {
    for (const cmd of E2_COMMANDS) {
      expect(out(`man ${cmd}`)[0], cmd).toBe(`${cmd.toUpperCase()}(1)        User Commands        ${cmd.toUpperCase()}(1)`);
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${STREAM_MANUAL[cmd].usage}`);
    }
    expect(out('cat --help')[0]).toBe('用法：cat [-n] [檔案]…');
    expect(run(machineState(filesMachine), 'cat --help', FILES_PROFILE).lines[0].text).toBe(`用法：${MANUAL.cat.usage}`);
    const help = out('help').join('\n');
    for (const cmd of E2_COMMANDS) expect(help, cmd).toMatch(new RegExp(`^  ${cmd} `, 'm'));
    expect(help).toMatch(/管線與重新導向/);
  });
});

describe('purity', () => {
  it('never changes the state it was given', () => {
    const start = machineState(streamsMachine), before = JSON.stringify([...start.nodes]);
    for (const c of ['sort notes.txt > notes.txt', 'echo x | tee a b', 'cat notes.txt | sort > notes.txt', 'rm notes.txt | cat', '> x']) run(start, c, STREAMS_PROFILE);
    expect(JSON.stringify([...start.nodes])).toBe(before);
  });
});

describe('the pure helpers', () => {
  it('getopt permutes, combines, takes values and long options like GNU', () => {
    expect(getopt(['-nk2', 'f', '-t,', '--reverse'], 'nrk:t:', { reverse: 'r' })).toEqual({ flags: new Map([['n', ['']], ['k', ['2']], ['t', [',']], ['r', ['']]]), operands: ['f'] });
    expect(getopt(['--lines=5', '-', '--', '-x'], 'n:', { lines: 'n' })).toEqual({ flags: new Map([['n', ['5']]]), operands: ['-', '-x'] });
    expect(getopt(['-q'], 'n')).toEqual({ error: "invalid option -- 'q'" });
    expect(getopt(['--all'], 'n')).toEqual({ error: "unrecognized option '--all'" });
    expect(getopt(['-k'], 'k:')).toEqual({ error: "option requires an argument -- 'k'" });
  });
  it('compiles grep patterns to the documented subset', () => {
    const test = (p: string, ere: boolean, s: string) => { const c = compilePattern(p, ere); return 'source' in c && new RegExp(c.source, 'u').test(s); };
    expect(test('a.c', false, 'abc')).toBe(true);
    expect(test('a+', false, 'a+')).toBe(true);
    expect(test('a+', true, 'aaa')).toBe(true);
    expect(test('a\\+', false, 'aaa')).toBe(true);
    expect(test('^*', false, '*x')).toBe(true);
    expect(test('a^b', false, 'a^b')).toBe(true);
    expect(test('a$b', false, 'a$b')).toBe(true);
    expect(test('[]a]', false, ']')).toBe(true);
    expect(test('[a-]', false, '-')).toBe(true);
    expect(test('\\w\\s', false, 'x y')).toBe(true);
    expect(test('a{2}', true, 'aa')).toBe(true);
    expect(test('a{2}', false, 'a{2}')).toBe(true);
    expect(compilePattern('\\1', false)).toEqual({ error: '模擬環境不支援反向參照（\\1）' });
    expect(compilePattern('[z-a]', false)).toEqual({ error: 'Invalid range end' });
    expect(compilePattern('[[:word:]]', false)).toEqual({ error: 'Invalid character class name' });
    expect(compilePattern('a\\', false)).toEqual({ error: 'Trailing backslash' });
  });
  it('names every command of a line for the validator', () => {
    expect(commandNames('cat a | sort -n | uniq -c > out.txt')).toEqual(['cat', 'sort', 'uniq']);
    expect(commandNames('sudo -u alice grep x f | wc -l')).toEqual(['sudo', 'grep', 'wc']);
    // A refused line falls back to its first word, as before E2.
    expect(commandNames('ls; pwd')).toEqual(['ls;']);
  });
});

describe('fidelity fixes of the files profile (and above)', () => {
  it('1: long options as GNU names them, and unrecognized ones', () => {
    expect(files('ls --all reports').out).toEqual(['.  ..  today.txt']);
    expect(files('mkdir --parents a/b', 'ls a').out).toEqual(['b/']);
    expect(files('du --summarize --human-readable logs').out).toEqual(['20K\tlogs']);
    expect(files('ls --color').err).toEqual(["ls: unrecognized option '--color'", TRY('ls')]);
    expect(files('rm --interactive x').err).toEqual(["rm: unrecognized option '--interactive'", TRY('rm')]);
    expect(run(initialState(), 'ls --all').lines).toEqual([{ text: "ls: invalid option -- '-'", kind: 'err' }]);
  });
  it('2: GNU\'s Try line after usage errors (not in the lab)', () => {
    expect(files('mkdir').err).toEqual(['mkdir: missing operand', TRY('mkdir')]);
    expect(files('touch').err).toEqual(['touch: missing file operand', TRY('touch')]);
    expect(files('rm').err).toEqual(['rm: missing operand', TRY('rm')]);
    expect(files('chmod 644').err).toEqual(["chmod: missing operand after '644'", TRY('chmod')]);
    expect(files('chmod abc latest').err).toEqual(["chmod: invalid mode: 'abc'", TRY('chmod')]);
    expect(files('readlink').err).toEqual(['readlink: missing operand', TRY('readlink')]);
    expect(files('whoami me').err).toEqual(["whoami: extra operand 'me'", TRY('whoami')]);
    expect(files('man -k ls').err).toEqual(["man: invalid option -- 'k'", "Try 'man --help' or 'man --usage' for more information."]);
    expect(run(initialState(), 'mkdir').lines).toEqual([{ text: 'mkdir: missing operand', kind: 'err' }]);
    expect(run(initialState(), 'ls -z').lines).toEqual([{ text: "ls: invalid option -- 'z'", kind: 'err' }]);
  });
  it('3: ~, ~/path and ~user are expanded before the command runs', () => {
    expect(files('du ~/logs').out).toEqual(['20\t/home/learner/logs']);
    expect(files('du -s ~').out).toEqual(['36\t/home/learner']);
    expect(files('echo ~ ~/x ~root "~" x~').out).toEqual(['/home/learner /home/learner/x /root ~ x~']);
    expect(files('echo ~nobody').out).toEqual(['~nobody']);
    expect(files('cat ~/nope').err).toEqual(['cat: /home/learner/nope: No such file or directory']);
    expect(files('ls ~/logs/app-?.log').out).toEqual(['/home/learner/logs/app-1.log  /home/learner/logs/app-2.log']);
    expect(run(initialState(), 'echo ~').lines).toEqual([{ text: '~', kind: 'out' }]);
  });
  it('4: cp and mv of a file into a folder written with / that is not there fail like GNU', () => {
    const mv = files('mv logs/app-1.log nodir/');
    expect(mv.err).toEqual(["mv: cannot move 'logs/app-1.log' to 'nodir/': Not a directory"]);
    expect(mv.state.nodes.has('/home/learner/nodir')).toBe(false);
    expect(files('cp logs/app-1.log nodir/').err).toEqual(["cp: cannot create regular file 'nodir/': Not a directory"]);
    expect(files('cp logs/app-1.log .bashrc/').err).toEqual(["cp: failed to access '.bashrc/': Not a directory"]);
    expect(files('mv logs moved/', 'ls moved').out).toEqual(['app-1.log  app-2.log  web.log']);
    expect(files('mv logs/app-1.log reports/', 'ls reports').out).toEqual(['app-1.log  today.txt']);
    expect(run(initialState(), 'mv README.txt nodir/').state.nodes.has('/home/learner/nodir')).toBe(true);
  });
  it('5: a variant may change the host name and uname fields, so output checks can use them', () => {
    const c = filesContent();
    c.exercises.push({
      id: 'which-host', title: '哪一台', machine: 'srv', statement: '印出主機名稱與核心版本。', checks: [{ kind: 'output' }],
      solution: ['uname -nr'], variants: [{ label: '另一台', files: [], host: 'srv-02', system: { release: '6.1.0-13-amd64' } }],
      mistakes: [{ commands: ['echo srv-01 6.8.0-45-generic'], why: '直接打出答案。' }], hints: ['uname -n -r'], explanation: 'uname -nr',
    });
    expect(terminalContentProblems(c)).toEqual([]);
    const v = variantMachine(filesMachine, c.exercises.at(-1)!.variants![0]);
    expect(v).toMatchObject({ host: 'srv-02', system: { release: '6.1.0-13-amd64', machine: 'x86_64' } });
    expect(replay(v, ['uname -nr', 'hostname']).steps.map(s => s.output)).toEqual(['srv-02 6.1.0-13-amd64', 'srv-02']);
    expect(checkTerminalExercise(c.exercises.at(-1)!, c.machines, ['echo srv-01 6.8.0-45-generic']).ok).toBe(false);
    expect(checkTerminalExercise(c.exercises.at(-1)!, c.machines, ['uname -n -r']).ok).toBe(true);
    const bad = filesContent();
    bad.exercises[2].variants!.push({ label: '壞的', files: [], host: 'Bad_Host' });
    expect(terminalContentProblems(bad).join('\n')).toMatch(/variant 壞的: machine srv: invalid host Bad_Host/);
    const lab = filesContent();
    lab.machines[0] = { ...lab.machines[0], profile: undefined, system: undefined, mounts: undefined, files: lab.machines[0].files.filter(f => f.kind !== 'link') };
    lab.exercises = [{ ...lab.exercises[2], variants: [{ label: 'x', files: [], system: { release: '1' } }] }];
    expect(terminalContentProblems(lab).join('\n')).toMatch(/variant x: machine srv: system information needs the files profile/);
  });
});

describe('lesson machines on the streams profile', () => {
  it('accepts the E2 content: transcripts replay, solutions pass, mistakes fail', () => {
    expect(terminalContentProblems(streamsContent())).toEqual([]);
    const { machines } = streamsContent();
    expect(checkTerminalExercise(topIpExercise, machines, ["cut -d ' ' -f1 access.log | sort | uniq -c | sort -nr | head -1"]).ok).toBe(true);
    expect(checkTerminalExercise(topIpExercise, machines, ['echo "      3 203.0.113.7"']).results[0].message).toMatch(/換成「另一天的日誌」的機器重新執行時/);
    expect(checkTerminalExercise(todoExercise, machines, ['grep "^TODO" notes.txt > reports/todo.txt']).ok).toBe(true);
    expect(checkTerminalExercise(todoExercise, machines, ['grep TODO notes.txt | tee reports/todo.txt']).ok).toBe(true);
    expect(checkTerminalExercise(todoExercise, machines, ['cd reports', 'grep TODO ../notes.txt >> todo.txt']).ok).toBe(true);
  });
  it('rejects an E2 command in any stage on a machine whose profile lacks it', () => {
    const c = filesContent();
    c.examples[0].steps.push({ command: 'ls | grep x', output: '此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。' });
    expect(terminalContentProblems(c).join('\n')).toMatch(/example system: grep is not in the files profile of machine srv/);
    const head = filesContent();
    head.exercises[0].mistakes.push({ commands: ['head latest'], why: 'x' });
    expect(terminalContentProblems(head).join('\n')).toMatch(/exercise current: head is not in the files profile of machine srv/);
    expect(profileOf({ profile: 'streams' })).toBe(STREAMS_PROFILE);
    expect(replay(streamsMachine, ['ls | wc -l'], LAB_PROFILE).steps[0].output).toMatch(/^此模擬器不支援管線/);
  });
});
