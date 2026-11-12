'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Circle, RotateCcw, Eraser } from 'lucide-react';
import { baseName, childrenOf, HOME, initialState, LIMITS, modeString, type FsState } from '@/lib/terminal/fs';
import { prompt, run, type Line } from '@/lib/terminal/shell';
import { TERMINAL_TASKS } from '@/lib/terminal/tasks';
import styles from './terminal-lab.module.css';

/*
 * P7: Linux Terminal Simulator, the Visualize and Code steps. Every command runs in src/lib/terminal on a file system
 * held in this component's state: nothing is sent anywhere, nothing touches the host, and a reset (or leaving the page)
 * restores the starting machine. The output is a log region (role="log", polite) and the tree beside it is the text
 * equivalent of where things are.
 */

interface Entry { id: number; prompt?: string; text: string; kind: Line['kind'] | 'cmd' }
const MAX_LOG = 300, MAX_HISTORY = 50;
const QUICK = ['pwd', 'ls -l', 'cat README.txt', 'help'];
const WELCOME: Entry[] = [{ id: 0, text: '輸入 help 查看指令，或從下方的練習任務開始。這是模擬環境，不會執行真實的 Shell。', kind: 'out' }];

/** The learner's home as an indented text tree, folders first, with modes; the current folder is marked. */
function tree(state: FsState): string[] {
  const lines: string[] = [];
  const walk = (path: string, depth: number) => {
    const node = state.nodes.get(path)!;
    const here = path === state.cwd ? '  ← 目前位置' : '';
    lines.push(`${'  '.repeat(depth)}${modeString(node)} ${depth ? baseName(path) : '~'}${node.kind === 'dir' && depth ? '/' : ''}${here}`);
    if (node.kind !== 'dir') return;
    const kids = childrenOf(state.nodes, path);
    for (const kid of [...kids.filter(k => state.nodes.get(k)!.kind === 'dir'), ...kids.filter(k => state.nodes.get(k)!.kind === 'file')]) walk(kid, depth + 1);
  };
  walk(HOME, 0);
  return lines;
}

export function TerminalLab() {
  const [fs, setFs] = useState(initialState);
  const [log, setLog] = useState<Entry[]>(WELCOME);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const nextId = useRef(1), screen = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);

  useEffect(() => { screen.current?.scrollTo({ top: screen.current.scrollHeight }); }, [log]);

  const done = TERMINAL_TASKS.filter(t => t.done(fs));

  // The latest file system, updated at once, so two commands sent before a re-render (a double click) both apply.
  const current = useRef(fs);

  function execute(command: string) {
    const from = current.current;
    const before = new Set(TERMINAL_TASKS.filter(t => t.done(from)).map(t => t.id));
    const result = run(from, command);
    const echo: Entry = { id: nextId.current++, prompt: prompt(from), text: command, kind: 'cmd' };
    const printed = result.lines.map(l => ({ id: nextId.current++, text: l.text, kind: l.kind }));
    setLog(lines => result.clear ? [] : [...lines, echo, ...printed].slice(-MAX_LOG));
    current.current = result.state;
    setFs(result.state);
    if (command.trim()) setHistory(h => [...h.filter(c => c !== command), command].slice(-MAX_HISTORY));
    setCursor(null);
    const finished = TERMINAL_TASKS.filter(t => t.done(result.state) && !before.has(t.id));
    setAnnounce(finished.length ? `完成任務：${finished.map(t => t.title).join('、')}` : '');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    execute(input);
    setInput('');
  }

  function recall(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();
    const at = e.key === 'ArrowUp' ? Math.max(0, (cursor ?? history.length) - 1) : (cursor ?? history.length) + 1;
    if (at >= history.length) { setCursor(null); setInput(''); return; }
    setCursor(at); setInput(history[at]);
  }

  function reset() {
    current.current = initialState();
    setFs(current.current); setLog(WELCOME); setHistory([]); setCursor(null); setInput('');
    setAnnounce('已重設模擬環境，所有檔案回到最初的樣子。');
    field.current?.focus();
  }

  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="terminal-code">
      <h2 id="terminal-code"><span>02 · Visualize ／ 03 · Code</span>模擬終端機</h2>
      <div className={styles.workspace}>
        <div className={styles.terminal}>
          <div ref={screen} className={styles.screen} role="log" aria-live="polite" aria-label="終端機輸出">
            {log.map(entry => <div key={entry.id} className={styles.line} data-kind={entry.kind}>
              {entry.prompt && <span className={styles.prompt}>{entry.prompt} </span>}{entry.text || ' '}
            </div>)}
          </div>
          <form className={styles.inputRow} onSubmit={submit}>
            <label htmlFor="terminal-input" className={styles.prompt}>{prompt(fs)}</label>
            <input ref={field} id="terminal-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={recall}
              maxLength={LIMITS.input} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
              aria-label={`輸入指令（目前位置 ${prompt(fs).split(":")[1].slice(0, -1)}）`} aria-describedby="terminal-help"/>
            <button type="submit">執行</button>
          </form>
        </div>
        <aside className={styles.side} aria-labelledby="terminal-tree">
          <h3 id="terminal-tree">家目錄（{fs.cwd === HOME ? '~' : fs.cwd}）</h3>
          <pre className={styles.tree} aria-label="家目錄的檔案樹，含權限與目前位置">{tree(fs).join('\n')}</pre>
        </aside>
      </div>
      <p id="terminal-help" className={styles.help}>按 Enter 執行，↑／↓ 叫回之前的指令。支援 pwd、ls、cd、mkdir、touch、cat、echo、cp、mv、rm、chmod；不支援管線與真實程式。</p>
      <div className={styles.actions}>
        <div role="group" aria-label="常用指令" className={styles.quick}>
          {QUICK.map(q => <button key={q} type="button" onClick={() => execute(q)}><code>{q}</code></button>)}
        </div>
        <button type="button" onClick={() => setLog([])}><Eraser size={15} aria-hidden/>清除畫面</button>
        <button type="button" onClick={reset}><RotateCcw size={15} aria-hidden/>重設環境</button>
      </div>
      <p className="visually-hidden" aria-live="polite">{announce}</p>
    </section>

    <section className={styles.panel} aria-labelledby="terminal-tasks">
      <h2 id="terminal-tasks"><span>練習任務</span>完成 {done.length}／{TERMINAL_TASKS.length}</h2>
      <ol className={styles.tasks}>
        {TERMINAL_TASKS.map(task => {
          const ok = done.includes(task);
          return <li key={task.id} data-done={ok || undefined}>
            {ok ? <Check size={16} aria-hidden className={styles.ok}/> : <Circle size={16} aria-hidden/>}
            <div>
              <strong>{task.title}<span className="visually-hidden">{ok ? '（已完成）' : '（未完成）'}</span></strong>
              <p>{task.goal}</p>
              <details><summary>提示</summary><p>{task.hint}</p></details>
            </div>
          </li>;
        })}
      </ol>
    </section>
  </div>;
}
