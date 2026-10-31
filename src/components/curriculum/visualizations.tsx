'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { branchTaken, type VisualizationConfig } from '@/content/curriculum/schema';
import styles from './curriculum.module.css';

type Of<K> = Extract<VisualizationConfig, { kind: K }>;

/** Variable state: step through a short program; each step shows the line just run, the variables and the output. */
export function VariableState({ config }: { config: Of<'variable-state'> }) {
  const [at, setAt] = useState(0);
  const step = config.steps[at];
  const lines = config.code.split('\n');
  const last = config.steps.length - 1;
  return <div className={styles.viz}>
    <div className={styles.vizGrid}>
      <pre className={styles.vizCode} aria-label={`${config.language} 程式`}><code>{lines.map((line, i) =>
        <span key={i} className={styles.vizLine} data-current={i + 1 === step.line ? 'true' : undefined} aria-current={i + 1 === step.line ? 'step' : undefined}>
          <span className={styles.lineNo} aria-hidden>{i + 1}</span>{line || ' '}{'\n'}</span>)}</code></pre>
      <div className={styles.vizState}>
        <table className={styles.vars}>
          <caption>變數</caption>
          <thead><tr><th scope="col">名稱</th><th scope="col">值</th></tr></thead>
          <tbody>{Object.entries(step.vars).map(([name, value]) => <tr key={name}><th scope="row"><code>{name}</code></th><td><code>{value}</code></td></tr>)}</tbody>
        </table>
        <div className={styles.vizOutput}><span>輸出</span><pre>{step.output ?? ''}</pre></div>
      </div>
    </div>
    <p className={styles.vizNote} aria-live="polite">第 {step.line} 行：{step.note}</p>
    <div className={styles.vizControls}>
      <button type="button" onClick={() => setAt(0)} disabled={at === 0}><RotateCcw size={14} aria-hidden/>重來</button>
      <button type="button" onClick={() => setAt(a => a - 1)} disabled={at === 0}><ChevronLeft size={14} aria-hidden/>上一步</button>
      <span className={styles.stepCount}>步驟 {at + 1}／{config.steps.length}</span>
      <button type="button" onClick={() => setAt(a => a + 1)} disabled={at === last}>下一步<ChevronRight size={14} aria-hidden/></button>
    </div>
  </div>;
}

/**
 * Conditional branch: pick a value and see each condition of an if / else if chain checked from the top, which one is
 * taken first, and the ones never checked after it.
 */
export function ConditionalBranch({ config }: { config: Of<'conditional-branch'> }) {
  const [value, setValue] = useState(config.initial);
  const taken = config.branches.findIndex(b => branchTaken(value, b));
  const result = taken < 0 ? config.otherwise : config.branches[taken].result;
  const state = (i: number) => taken >= 0 && i > taken ? 'skipped' : i === taken ? 'taken' : 'false';
  const set = (v: number) => setValue(Math.min(config.max, Math.max(config.min, Math.round(v))));
  return <div className={styles.viz}>
    <div className={styles.branchInput}>
      <label htmlFor="branch-value"><code>{config.variable}</code> =</label>
      <input id="branch-value" type="number" min={config.min} max={config.max} value={value} onChange={e => { if (e.target.value !== '') set(Number(e.target.value)); }}/>
      <input type="range" aria-label={`${config.variable} 的值`} min={config.min} max={config.max} value={value} onChange={e => set(Number(e.target.value))}/>
    </div>
    <ol className={styles.branches}>
      {config.branches.map((b, i) => <li key={b.label} data-state={state(i)}>
        <code>{i === 0 ? 'if' : 'else if'} ({b.label})</code>
        <span>{state(i) === 'taken' ? `成立 → ${b.result}` : state(i) === 'skipped' ? '不再檢查' : '不成立'}</span>
      </li>)}
      <li data-state={taken < 0 ? 'taken' : 'skipped'}><code>else</code><span>{taken < 0 ? `執行 → ${config.otherwise}` : '不執行'}</span></li>
    </ol>
    <p className={styles.vizNote} aria-live="polite">{config.variable} = {value} 時，{taken < 0 ? '所有條件都不成立，執行 else' : `第 ${taken + 1} 個條件最先成立`}，輸出 <strong>{result}</strong>。</p>
  </div>;
}
