'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { baseName, childrenOf, groupOf, LIMITS, modeString, type FsState } from '@/lib/terminal/fs';
import { prompt, run, type Line } from '@/lib/terminal/shell';
import { activeState } from '@/lib/terminal/ssh';
import { checkTerminalExercise, machineState, profileOf, replay, TERMINAL_LIMITS, type TerminalExample, type TerminalExercise, type TerminalMachine, type TerminalVerdict } from '@/lib/terminal/lesson';
import { shownText } from './pre-text';
import { Rich } from './rich';
import base from './curriculum.module.css';
import activities from './db-activities.module.css';
import styles from './terminal-lesson.module.css';

/*
 * LNX-0 terminal capability (src/lib/terminal/lesson.ts). An example is a fixed transcript (prompt, command, output)
 * replayed on its machine, beside a text tree of that machine. An exercise is an embedded console on its own machine:
 * the commands run in the browser in the simulated shell (nothing is sent anywhere, nothing touches the host); Check
 * replays everything typed since the last reset on the exercise's machine (and its variants) and announces the result of
 * each check; Reset restores the machine. Nothing animates, so there is nothing to reduce for prefers-reduced-motion.
 */

/** Every node of the machine as an indented text tree, folders first, with mode and owner:group (E1: a link as name -> target); the working directory is marked. */
export function machineTree(state: FsState): string[] {
  const rows: [string, string][] = [];
  const walk = (path: string, depth: number) => {
    const node = state.nodes.get(path)!;
    const name = path === '/' ? '/' : `${baseName(path)}${node.kind === 'dir' ? '/' : node.kind === 'link' ? ` -> ${node.target ?? ''}` : ''}`;
    rows.push([`${modeString(node)} ${node.owner}:${groupOf(node)}`, `${'  '.repeat(depth)}${name}${path === state.cwd ? '  ← 目前位置' : ''}`]);
    if (node.kind !== 'dir') return;
    const kids = childrenOf(state.nodes, path);
    // Folders first, then files and (E1) symbolic links.
    for (const kid of [...kids.filter(k => state.nodes.get(k)!.kind === 'dir'), ...kids.filter(k => state.nodes.get(k)!.kind !== 'dir')]) walk(kid, depth + 1);
  };
  walk('/', 0);
  const width = Math.max(...rows.map(([meta]) => meta.length));
  return rows.map(([meta, name]) => `${meta.padEnd(width)}  ${name}`);
}

export function TerminalExampleView({ example, machine }: { example: TerminalExample; machine: TerminalMachine }) {
  const { steps } = replay(machine, example.steps.map(s => s.command));
  return <div className={base.example} data-terminal-example={example.id}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.split}>
      <figure className={styles.figure}>
        <figcaption>終端機紀錄（{machine.title}）</figcaption>
        <pre className={styles.transcript}>{example.steps.map((s, i) => <span key={i}>
          <span className={styles.prompt}>{shownText(steps[i].prompt)}</span> <span className={styles.command}>{shownText(s.command)}</span>{'\n'}
          {s.output ? <span className={styles.output}>{shownText(s.output)}{'\n'}</span> : null}
        </span>)}</pre>
      </figure>
      <figure className={styles.figure}>
        <figcaption>執行前的檔案（權限、擁有者:群組）</figcaption>
        <pre className={styles.tree}>{shownText(machineTree(machineState(machine)).join('\n'))}</pre>
      </figure>
    </div>
  </div>;
}

/** A reference solution's commands, one per line after a $ (the prompt is left out: it depends on where each runs). */
export function TerminalCommands({ commands }: { commands: string[] }) {
  return <pre className={styles.transcript}>{commands.map((c, i) => <span key={i}>
    <span className={styles.prompt} aria-hidden>$</span> <span className={styles.command}>{shownText(c)}</span>{'\n'}
  </span>)}</pre>;
}

interface Entry { id: number; prompt?: string; text: string; kind: Line['kind'] | 'cmd' }
const MAX_LOG = 300, MAX_HISTORY = 50;
const WELCOME = '這是模擬的終端機，不是真實的 Shell。輸入指令後按 Enter 執行；完成後按「檢查」。';

export function TerminalExerciseBox({ exercise, machines }: { exercise: TerminalExercise; machines: TerminalMachine[] }) {
  const machine = machines.find(m => m.id === exercise.machine)!;
  const id = useId();
  const [fs, setFs] = useState(() => machineState(machine));
  const [log, setLog] = useState<Entry[]>([{ id: 0, text: WELCOME, kind: 'out' }]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<TerminalVerdict>();
  const [announce, setAnnounce] = useState('');
  const nextId = useRef(1), screen = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);
  // The latest state and every command since the last reset, updated at once (two commands before a re-render both apply).
  const current = useRef(fs), executed = useRef<string[]>([]);

  useEffect(() => { const el = screen.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);

  function execute(command: string) {
    if (executed.current.length >= TERMINAL_LIMITS.session) {
      setLog(lines => [...lines, { id: nextId.current++, text: `這個練習最多執行 ${TERMINAL_LIMITS.session} 個指令，請按「重設」重新開始。`, kind: 'err' as const }].slice(-MAX_LOG));
      return;
    }
    // E1: the console runs the machine's profile (the lab's commands unless the machine says files).
    const from = current.current, result = run(from, command, profileOf(machine));
    executed.current = [...executed.current, command];
    const echo: Entry = { id: nextId.current++, prompt: prompt(from), text: command, kind: 'cmd' };
    const printed = result.lines.map(l => ({ id: nextId.current++, text: l.text, kind: l.kind }));
    setLog(lines => result.clear ? [] : [...lines, echo, ...printed].slice(-MAX_LOG));
    current.current = result.state;
    setFs(result.state);
    if (command.trim()) setHistory(h => [...h.filter(c => c !== command), command].slice(-MAX_HISTORY));
    setCursor(null);
    setVerdict(undefined);
    setAnnounce('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    execute(input);
    setInput('');
  }

  function recall(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !history.length) return;
    e.preventDefault();
    const at = e.key === 'ArrowUp' ? Math.max(0, (cursor ?? history.length) - 1) : (cursor ?? history.length) + 1;
    if (at >= history.length) { setCursor(null); setInput(''); return; }
    setCursor(at); setInput(history[at]);
  }

  function check() {
    setVerdict(checkTerminalExercise(exercise, machines, executed.current));
    setAnnounce('');
  }

  function reset() {
    current.current = machineState(machine);
    executed.current = [];
    setFs(current.current); setLog([{ id: nextId.current++, text: WELCOME, kind: 'out' }]); setCursor(null); setInput(''); setVerdict(undefined);
    setAnnounce('已重設：機器回到練習開始時的樣子，之前的指令不再計入檢查。');
    field.current?.focus();
  }

  const where = prompt(fs).slice(prompt(fs).indexOf(':') + 1, -1);
  return <div className={activities.builder} data-terminal-exercise={exercise.id}>
    <div className={styles.terminal}>
      <div ref={screen} className={styles.screen} role="log" aria-live="polite" aria-label={`${exercise.title}：終端機輸出`}>
        {log.map(entry => <div key={entry.id} className={styles.line} data-kind={entry.kind}>
          {entry.prompt && <span className={styles.prompt}>{entry.prompt} </span>}{entry.text || ' '}
        </div>)}
      </div>
      <form className={styles.inputRow} onSubmit={submit}>
        <label htmlFor={`${id}-input`} className={styles.prompt}>{prompt(fs)}</label>
        <input ref={field} id={`${id}-input`} value={input} onChange={e => setInput(e.target.value)} onKeyDown={recall}
          maxLength={LIMITS.input} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
          aria-label={`指令（目前位置 ${where}）`} aria-describedby={`${id}-help`}/>
        <button type="submit">執行</button>
      </form>
    </div>
    <p id={`${id}-help`} className={styles.help}>按 Enter 執行，↑／↓ 叫回之前的指令。「檢查」會把重設之後輸入的所有指令重新執行一次，只看結果，不看寫法。</p>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={check}><Check size={14} aria-hidden/>檢查</button>
      <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>重設</button>
    </div>
    <details className={styles.current}>
      <summary>目前的檔案（權限、擁有者:群組）</summary>
      {/* E7: during an ssh session, the remote machine's files. */}
      <pre className={styles.tree}>{shownText(machineTree(activeState(fs)).join('\n'))}</pre>
    </details>
    <div aria-live="polite">
      {announce && <p className={styles.help}>{announce}</p>}
      {verdict && <>
        <p className={activities.verdict} data-ok={verdict.ok}>{verdict.ok ? <><Check size={16} aria-hidden/>全部通過。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
        <ul className={styles.checks}>{verdict.results.map((r, i) => <li key={i} data-ok={r.ok}>
          {r.ok ? <Check size={14} aria-hidden/> : <X size={14} aria-hidden/>}<span>{r.ok ? '通過' : '未通過'}：{r.message}</span>
        </li>)}</ul>
      </>}
    </div>
  </div>;
}
