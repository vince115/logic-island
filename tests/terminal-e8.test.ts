import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { LATER_MANUAL } from '@/lib/terminal/manual';
import { parseProgram, scriptCommandNames, SCRIPT_LIMITS } from '@/lib/terminal/script';
import { E8_COMMANDS, REMOTE_PROFILE, run, SCRIPTING_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { countExercise, deployExercise, keysMachine, scriptContent, scriptMachine } from './support/terminal-fixture';

/*
 * Engine stage E8 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §16): the scripting profile — the bounded Bash
 * interpreter, at the prompt and for script files: parsing and bash's syntax errors, expansions and field splitting,
 * control structures and functions, set -e / -u / -o pipefail / -x with bash's semantics, redirections of builtins and
 * compound commands, here-documents, running scripts (shebang, permissions, PATH, sudo, child vs source), the limits,
 * and the lesson data.
 */
const f = (path: string, content: string, mode = 0o644, owner = 'learner') => ({ path, kind: 'file' as const, mode, owner, content });
const machine = (...files: ReturnType<typeof f>[]): TerminalMachine => ({ ...scriptMachine, files: [...scriptMachine.files, ...files] });
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, SCRIPTING_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const out = (...commands: string[]) => session(scriptMachine, ...commands).last.out;
const err = (...commands: string[]) => session(scriptMachine, ...commands).last.err;
/** Runs a script file's text with bash and returns its output, errors and status. */
function script(text: string, args = '', ...files: ReturnType<typeof f>[]) {
  const s = session(machine(f('/home/learner/t.sh', text, 0o755), ...files), `./t.sh ${args}`.trim(), 'echo $?');
  return { out: s.log[0].out, err: s.log[0].err, status: Number(s.log[1].out[0]), state: s.state };
}

describe('the scripting profile', () => {
  it('is the remote profile plus bash, sh, test, [, printf, true and false; the prompt is the interpreter', () => {
    expect([...SCRIPTING_PROFILE.commands].sort()).toEqual([...REMOTE_PROFILE.commands, ...E8_COMMANDS].sort());
    expect(SCRIPTING_PROFILE.features).toEqual([...REMOTE_PROFILE.features!, 'scripting']);
    expect(profileOf(scriptMachine)).toBe(SCRIPTING_PROFILE);
    for (const cmd of ['bash', 'sh', 'printf']) expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${LATER_MANUAL[cmd as 'bash'].usage}`);
    expect(out('man test')[3]).toBe('       test - 檢查條件（Shell 的內建指令）');
    expect(out('x=5; echo "$x" && false || echo fallback; echo $?')).toEqual(['5', 'fallback', '0']);
    // Below, ; and variables stay refused and scripts are not interpreted.
    expect(run(machineState({ ...scriptMachine, profile: 'remote' }), 'x=5; echo $x', REMOTE_PROFILE).lines[0].text).toMatch(/^此模擬器不支援指令串接/);
    expect(run(machineState({ ...scriptMachine, profile: 'remote' }), 'bash deploy.sh', REMOTE_PROFILE).lines[0].text).toMatch(/^bash: bash: command not found/);
    // The same plain commands print the same thing as below.
    expect(out('ls logs', 'ls -l logs | wc -l', 'cat nope 2>&1 | head -1')).toEqual(["cat: nope: No such file or directory"]);
    expect(out('sleep 300 &')).toEqual(['[1] 1']);
    expect(session(scriptMachine, 'clear').last).toEqual({ out: [], err: [] });
  });
  it('keeps variables, functions and options between lines', () => {
    expect(out('name=web; greet() { echo "hi $1 from $name"; }', 'greet you', 'echo $?')).toEqual(['0']);
    const s = session(scriptMachine, 'name=web; greet() { echo "hi $1 from $name"; }', 'greet you', 'set -u', 'echo $missing; echo not-reached', 'echo $?');
    expect(s.log[1].out).toEqual(['hi you from web']);
    expect(s.log[3]).toEqual({ out: [], err: ['bash: missing: unbound variable'] });
    expect(s.log[4].out).toEqual(['1']);
    expect(s.state.shell!.funcs.greet).toBeDefined();
  });
});

describe('parsing', () => {
  it('reports bash\'s syntax errors; a line with one runs nothing', () => {
    expect(err('if; then')).toEqual(["bash: syntax error near unexpected token `;'"]);
    expect(err('echo a; fi')).toEqual(["bash: syntax error near unexpected token `fi'"]);
    expect(err('for x in a b; do echo $x')).toEqual(['bash: syntax error: unexpected end of file']);
    expect(err('echo "open')).toEqual(['bash: unexpected EOF while looking for matching `"\'']);
    expect(err('arr=(1 2)')).toEqual(['bash: arr=(…)：模擬環境的 Bash 不支援陣列']);
    expect(session(scriptMachine, 'echo a; fi', 'echo $?').last.out).toEqual(['2']);
  });
  it('runs a script\'s commands before its syntax error (bash reads as it goes); bash -n only checks', () => {
    const r = script('#!/bin/bash\necho first\nif true; then\n  echo inside\nfi\nfi\necho never\n');
    expect(r).toMatchObject({ out: ['first', 'inside'], err: ["./t.sh: line 6: syntax error near unexpected token `fi'"], status: 2 });
    expect(session(machine(f('/home/learner/t.sh', 'echo hi\nfi\n')), 'bash -n t.sh').last).toEqual({ out: [], err: ["t.sh: line 2: syntax error near unexpected token `fi'"] });
    expect(parseProgram('a=1\nb=2\n').items).toHaveLength(2);
    expect(scriptCommandNames('ls; x=$(grep a f | sort); for i in 1; do sudo systemctl restart x; done')).toEqual(['ls', 'grep', 'sort', 'sudo', 'systemctl']);
  });
});

describe('expansions', () => {
  it('quotes, field splitting and "$@"', () => {
    expect(out('x="a  b"; printf "<%s>" $x "$x"; echo')).toEqual(['<a><b><a  b>']);
    expect(out("echo '$HOME' \"$HOME\" \\$HOME ~")).toEqual(['$HOME /home/learner $HOME /home/learner']);
    expect(out('set -- "one two" three; for a in "$@"; do echo "[$a]"; done; echo $#')).toEqual(['[one two]', '[three]', '2']);
    expect(out('set -- "one two" three; for a in $@; do echo "[$a]"; done')).toEqual(['[one]', '[two]', '[three]']);
    expect(out('e=; for a in $e; do echo got; done; echo "[$e]"')).toEqual(['[]']);
    expect(out('IFS=, read -r a b c <<< "x,,z"; echo "$a|$b|$c"')).toEqual(['x||z']);
    expect(out('line="  a  b  "; read -r one rest <<< "$line"; echo "[$one][$rest]"')).toEqual(['[a][b]']);
  });
  it('parameters: defaults, length, prefixes, suffixes, replacement; ${x:?} stops', () => {
    expect(out('f=backup.tar.gz; echo ${f%.*} ${f%%.*} ${f#*.} ${f##*.} ${#f} ${f/tar/zip} ${u:-def} ${u-x}')).toEqual(['backup.tar backup tar.gz gz 13 backup.zip.gz def x']);
    expect(out('d=/var/log/app.log; echo ${d##*/} ${d%/*}; x=; echo ${x:-empty} ${x-unset} ${x:+set}; : ${y:=7}; echo $y')).toEqual(['app.log /var/log', 'empty', '7']);
    expect(err('echo "${1:?usage: give a name}"; echo after')).toEqual(['bash: 1: usage: give a name']);
    expect(err('echo ${a[0]}')).toEqual(['bash: ${a[…]}：模擬環境的 Bash 不支援陣列']);
  });
  it('command substitution and arithmetic', () => {
    expect(out('x=$(printf "a\\n\\n\\n"); echo "[$x]"; echo "$(echo `echo nested`)"')).toEqual(['[a]', 'nested']);
    expect(out('i=7; echo $((i * 2 + 1)) $((i / 2)) $((i % 4)) $((2 ** 10)) $((i > 3 && i < 9)) $(( i++ )) $i $((-7 / 2)) $((0x1f)) $((010))')).toEqual(['15 3 3 1024 1 7 8 -3 31 8']);
    expect(err('echo $((08 + 1))')).toEqual(['bash: 08: value too great for base (error token is "08")']);
    expect(err('echo $((1 / 0))')).toEqual(['bash: 1 / 0: division by 0 (error token is "0")']);
    expect(out('(( 3 > 2 )) && echo yes; (( 0 )) || echo zero; n=3; (( n += 2 )); echo $n')).toEqual(['yes', 'zero', '5']);
  });
  it('globs expand in for lists and for builtins; quoted patterns stay literal', () => {
    expect(out('for f in logs/*.log; do echo "$f"; done; for f in "logs/*.log"; do echo "$f"; done')).toEqual(['logs/app.log', 'logs/db.log', 'logs/*.log']);
    expect(out('for f in *.zip; do echo "$f"; done')).toEqual(['*.zip']);
  });
});

describe('control structures and functions', () => {
  it('if, [[ ]], test, case, loops, break and continue', () => {
    expect(out('x=5; if [ "$x" -gt 9 ]; then echo big; elif [[ $x == [0-9] ]]; then echo digit; else echo other; fi')).toEqual(['digit']);
    expect(out('[[ release-2.1 =~ ^release-([0-9]+)\\.([0-9]+)$ ]] && echo match; [[ -f deploy.sh && ! -x deploy.sh ]] && echo not-exec')).toEqual(['match', 'not-exec']);
    expect(err('[ 1 -lt x ]')).toEqual(['bash: [: x: integer expression expected']);
    expect(err('[ -z')).toEqual(["bash: [: missing `]'"]);
    expect(out('for n in a bc def; do case $n in a|b) echo one;; ??) echo two;; *) echo many;; esac; done')).toEqual(['one', 'two', 'many']);
    expect(out('for ((i=0; i<5; i++)); do (( i == 1 )) && continue; (( i == 3 )) && break; echo $i; done')).toEqual(['0', '2']);
    expect(out('n=0; until [ $n -ge 3 ]; do n=$((n+1)); done; echo $n; while false; do :; done; echo $?')).toEqual(['3', '0']);
    expect(out('for i in 1 2; do for j in a b; do [ $j = b ] && continue 2; echo $i$j; done; done')).toEqual(['1a', '2a']);
  });
  it('functions: arguments, local, return, recursion with a nesting limit', () => {
    expect(out('f() { local x=in; echo "$1 $# $x"; return 4; }; x=out; f a b; echo "$? $x"')).toEqual(['a 2 in', '4 out']);
    expect(script('#!/bin/bash\nfact() { local n=$1; if (( n <= 1 )); then echo 1; return; fi; echo $(( n * $(fact $((n - 1))) )); }\nfact "$1"\n', '6').out).toEqual(['720']);
    expect(script('#!/bin/bash\nf() { f; }\nf\necho after\n')).toMatchObject({ err: [`./t.sh: line 2: f: maximum function nesting level exceeded (${SCRIPT_LIMITS.depth})`], status: 1, out: [] });
    expect(err('return')).toEqual(["bash: return: can only `return' from a function or sourced script"]);
  });
  it('stops runaway loops and long output with clear messages', () => {
    expect(session(scriptMachine, 'while true; do :; done', 'echo $?').log.map(l => [l.out, l.err])).toEqual([[[], [`bash: 模擬環境：執行超過 ${SCRIPT_LIMITS.steps} 步，已停止（可能是沒有結束的迴圈）`]], [['124'], []]]);
    const many = out('for ((i=0; i<3000; i++)); do echo "line number $i of a long output"; done');
    expect(many.length).toBeLessThan(700);
    expect(err('for ((i=0; i<3000; i++)); do echo "line number $i of a long output"; done').at(-1)).toMatch(/輸出超過 20000 個字元/);
  });
});

describe('set -e, -u, -o pipefail and -x', () => {
  it('set -e stops at an untested failure only', () => {
    const r = script('#!/bin/bash\nset -e\nif false; then :; fi\nfalse || echo handled\n! false\nfalse && echo no\necho before\nls /missing\necho never\n');
    expect(r).toMatchObject({ out: ['handled', 'before'], err: ["ls: cannot access '/missing': No such file or directory"], status: 2 });
    expect(script('#!/bin/bash\nset -e\nf() { false; echo still; }\nf || echo caller\n').out).toEqual(['still']);
    expect(script('#!/bin/bash\nset -e\nx=$(false)\necho never\n').status).toBe(1);
    expect(script('#!/bin/bash\nset -e\necho $(false) ok\n').out).toEqual(['ok']);
  });
  it('set -u, pipefail and xtrace', () => {
    expect(script('#!/bin/bash\nset -u\necho "${1:-none}"\necho "$1"\necho never\n')).toMatchObject({ out: ['none'], err: ['./t.sh: line 4: 1: unbound variable'], status: 1 });
    expect(script('#!/bin/bash\nset -eo pipefail\ngrep x /missing | sort\necho never\n')).toMatchObject({ out: [], status: 2 });
    expect(script('#!/bin/bash\ngrep x /missing | sort\necho "status $?"\n').out).toEqual(['status 0']);
    expect(script('#!/bin/bash\nset -x\nname="a b"\necho "$name" > /dev/null\n').err).toEqual(["+ name='a b'", "+ echo 'a b'"]);
    expect(out('set -o')).toEqual(['errexit        \toff', 'nounset        \toff', 'pipefail       \toff', 'xtrace         \toff']);
  });
});

describe('redirections and input', () => {
  it('redirects builtins, groups and loops; here-documents and here-strings', () => {
    const s = session(scriptMachine, '{ echo out; echo err >&2; } > both.log 2>&1', 'cat both.log', 'for i in 1 2; do echo $i; done > nums', 'cat nums',
      'name=Ann; cat <<EOF\nhi $name\n$(echo sub)\nEOF', "cat <<'EOF'\nraw $name\nEOF", 'read -r w < nums; echo "[$w]"', 'wc -l <<< "one"');
    expect(s.log[1].out).toEqual(['out', 'err']);
    expect(s.log[3].out).toEqual(['1', '2']);
    expect(s.log[4].out).toEqual(['hi Ann', 'sub']);
    expect(s.log[5].out).toEqual(['raw $name']);
    expect(s.log[6].out).toEqual(['[1]']);
    expect(s.log[7].out).toEqual(['1']);
  });
  it('read: from a file, a pipe (a subshell: its variables are lost) or nothing', () => {
    expect(out('while read -r line; do echo "<$line>"; done < logs/app.log')).toEqual(['<start>', '<warn: disk 91%>', '<stop>']);
    expect(out('n=0; cat logs/app.log | while read -r l; do n=$((n+1)); done; echo $n')).toEqual(['0']);
    expect(err('read x')).toEqual(['bash: read: 模擬環境沒有鍵盤輸入：請用 < 檔案、管線（|）或 <<< 提供輸入']);
  });
  it('exec > file sends the rest of a script\'s output there', () => {
    expect(script('#!/bin/bash\nexec >> run.log 2>&1\necho one\nls /nope\n').state.nodes.get('/home/learner/run.log')!.content).toBe("one\nls: cannot access '/nope': No such file or directory\n");
  });
  it('refuses what it does not support with a message', () => {
    expect(err('trap "rm -f x" EXIT')).toEqual(['bash: trap: 模擬環境的 Bash 不支援 trap']);
    expect(err('echo hi 9> x')).toEqual(['bash: 模擬環境的重新導向只支援描述子 0、1、2']);
  });
});

describe('running scripts', () => {
  it('needs a shebang, x to run by path and r to be read; explains other interpreters and CRLF', () => {
    const m = machine(f('/home/learner/py', '#!/usr/bin/python3\nprint(1)\n', 0o755), f('/home/learner/crlf.sh', '#!/bin/bash\r\necho hi\r\n', 0o755),
      f('/home/learner/plain', 'echo hi\n', 0o755), f('/home/learner/secret.sh', '#!/bin/bash\necho hi\n', 0o311));
    const s = session(m, './deploy.sh prod', 'echo $?', './py', './crlf.sh', './plain', './secret.sh', 'echo $?', 'bash nope.sh', 'echo $?');
    expect(s.log.map(l => l.err[0] ?? l.out[0])).toEqual([
      'bash: ./deploy.sh: Permission denied', '126', 'bash: ./py: /usr/bin/python3: bad interpreter: No such file or directory', 'bash: ./crlf.sh: /bin/bash^M: bad interpreter: No such file or directory',
      'bash: ./plain: 模擬環境只直譯以 #!/bin/bash 或 #!/bin/sh 開頭的指令稿（這個檔案沒有 #!，可能是程式檔）', 'bash: ./secret.sh: Permission denied', '126', 'bash: nope.sh: No such file or directory', '127']);
  });
  it('passes $0 and arguments, returns the exit status, and runs as a child (source runs in the shell)', () => {
    const r = script('#!/bin/bash\necho "$0 $# $1"\nshift\necho "$*"\ncd /tmp 2>/dev/null || cd /\nx=changed\nexit 7\n', '"a b" c');
    expect(r).toMatchObject({ out: ['./t.sh 2 a b', 'c'], status: 7 });
    const s = session(machine(f('/home/learner/t.sh', 'cd /\nx=changed\n', 0o755)), 'x=orig', 'bash t.sh', 'echo "$x $PWD"', 'source t.sh', 'echo "$x $PWD"');
    expect([s.log[2].out, s.log[4].out]).toEqual([['orig /home/learner'], ['changed /']]);
    expect(out('export GREETING=hi; bash -c \'echo "$GREETING from $0"\' inner')).toEqual(['hi from inner']);
  });
  it('finds scripts in PATH, runs them with sudo as root, and runs a oneshot service\'s script', () => {
    const m: TerminalMachine = { ...machine(), accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
      files: [...machine().files, { path: '/usr', kind: 'dir', mode: 0o755, owner: 'root' }, { path: '/usr/local', kind: 'dir', mode: 0o755, owner: 'root' },
        { path: '/usr/local/bin', kind: 'dir', mode: 0o755, owner: 'root' }, f('/usr/local/bin/whoru', '#!/bin/sh\necho "$0 runs as $(whoami)"\n', 0o755, 'root')] };
    expect(session(m, 'whoru', 'sudo whoru', 'PATH=/bin whoru').log.map(l => l.out[0] ?? l.err[0])).toEqual(['/usr/local/bin/whoru runs as learner', '/usr/local/bin/whoru runs as root',
      expect.stringMatching(/^bash: whoru: command not found/)]);
  });
  it('runs on the remote machine during an ssh session; quoting decides which shell expands', () => {
    const s = session({ ...keysMachine, profile: 'scripting' }, 'ssh alice@web-02', 'x=$(hostname); echo "on $x"', 'exit 4', 'echo $?',
      "ssh alice@web-02 'for i in 1 2; do echo \"$i $(hostname)\"; done'", 'ssh alice@web-02 "echo $(hostname)"');
    expect(s.log.map(l => l.out)).toEqual([['web-02: production web server'], ['on web-02'], ['logout'], ['4'], ['1 web-02', '2 web-02'], ['keys-01']]);
  });
  it('limits how deeply scripts call scripts', () => {
    expect(script('#!/bin/bash\n./t.sh\n').err.at(-1)).toBe(`./t.sh: 模擬環境的指令稿最多巢狀 ${SCRIPT_LIMITS.scripts} 層`);
  });
});

describe('lesson data', () => {
  it('validates the E8 content and checks the deploy exercise', () => {
    expect(terminalContentProblems(scriptContent())).toEqual([]);
    expect(checkTerminalExercise(deployExercise, [scriptMachine], deployExercise.solution).ok).toBe(true);
    expect(checkTerminalExercise(countExercise, [scriptMachine], ['echo "app.log: 3"; echo "db.log: 1"']).ok).toBe(false);
  });
  it('reports a script (or a line) that runs a command outside the profile', () => {
    expect(machineProblems(machine(f('/home/learner/c.sh', '#!/bin/bash\ncrontab -l\n'))).join('\n')).toMatch(/file \/home\/learner\/c\.sh: the script runs crontab, which is not in the scripting profile/);
    const c: TerminalLessonContent = scriptContent();
    c.examples[1].steps[0].command = 'ls; crontab -l';
    expect(terminalContentProblems(c).join('\n')).toMatch(/example loop: crontab is not in the scripting profile of machine dev/);
  });
});
