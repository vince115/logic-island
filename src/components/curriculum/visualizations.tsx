'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { compare, type Comparison, type TraceKind, type TraceStep, type VisualizationConfig } from '@/content/curriculum/schema';
import styles from './curriculum.module.css';

type Of<K> = Extract<VisualizationConfig, { kind: K }>;
const MARKS = { read: '讀取', write: '寫入', bad: '越界' } as const;

/** Step buttons shared by the step-through visualizations; every button says what it does. */
function Stepper({ at, count, set, unit = '步驟' }: { at: number; count: number; set: (n: number) => void; unit?: string }) {
  return <div className={styles.vizControls}>
    <button type="button" onClick={() => set(0)} disabled={at === 0}><RotateCcw size={14} aria-hidden/>重來</button>
    <button type="button" onClick={() => set(at - 1)} disabled={at === 0}><ChevronLeft size={14} aria-hidden/>上一步</button>
    <span className={styles.stepCount}>{unit} {at + 1}／{count}</span>
    <button type="button" onClick={() => set(at + 1)} disabled={at === count - 1}>下一步<ChevronRight size={14} aria-hidden/></button>
  </div>;
}

function Cells({ array }: { array: NonNullable<TraceStep['arrays']>[number] }) {
  const grid = Array.isArray(array.cells[0]);
  const rows = (grid ? array.cells : [array.cells]) as string[][];
  const mark = (r: number, c: number) => array.marks?.find(m => typeof m.at === 'number' ? !grid && m.at === c : m.at[0] === r && m.at[1] === c)?.kind;
  const bad = array.marks?.filter(m => m.kind === 'bad') ?? [];
  return <figure className={styles.cells} aria-label={`${array.name}${grid ? '（二維）' : ''}`}>
    <figcaption><code>{array.name}</code>{grid ? `：${rows.length} 列 × ${rows[0]?.length ?? 0} 行` : `：長度 ${rows[0].length}`}</figcaption>
    <table>
      {grid && <thead><tr><th scope="col"><span className={styles.srOnly}>列＼行</span></th>{rows[0]?.map((_, c) => <th key={c} scope="col">{c}</th>)}</tr></thead>}
      <tbody>{rows.map((row, r) => <tr key={r}>
        {grid && <th scope="row">{r}</th>}
        {row.map((cell, c) => { const m = mark(r, c); return <td key={c} data-mark={m}>
          <span className={styles.cellValue}>{cell === '' ? ' ' : cell}</span>
          {!grid && <span className={styles.cellIndex}>{c}</span>}
          {m && <span className={styles.cellMark}>{MARKS[m]}</span>}
        </td>; })}
      </tr>)}</tbody>
    </table>
    {bad.map((m, i) => <p key={i} className={styles.badIndex}>越界：索引 {Array.isArray(m.at) ? `[${m.at.join('][')}]` : m.at} 不在 {grid ? `0～${rows.length - 1} 列、0～${(rows[0]?.length ?? 1) - 1} 行` : `0～${rows[0].length - 1}`} 之內</p>)}
  </figure>;
}

/**
 * The step-by-step trace shared by the variable, loop, array, function-call and recursion visualizations: the code
 * with the line just run, and beside it whichever panels the step carries (loops, call stack, variables with any
 * mismatch against what was expected, arrays, output).
 */
export function Trace({ config }: { config: Extract<VisualizationConfig, { kind: TraceKind }> }) {
  const [at, setAt] = useState(0);
  const step = config.steps[at];
  const lines = config.code.split('\n');
  const frames = step.frames ?? [];
  return <div className={styles.viz}>
    <div className={styles.vizGrid}>
      <pre className={styles.vizCode} aria-label={`${config.language} 程式`}><code>{lines.map((line, i) =>
        <span key={i} className={styles.vizLine} data-current={i + 1 === step.line ? 'true' : undefined} aria-current={i + 1 === step.line ? 'step' : undefined}>
          <span className={styles.lineNo} aria-hidden>{i + 1}</span>{line || ' '}{'\n'}</span>)}</code></pre>
      <div className={styles.vizState}>
        {step.loops?.length ? <div className={styles.panel}>
          <h4>迴圈</h4>
          <ul className={styles.loops}>{step.loops.map(loop => <li key={loop.label}>
            <code>{loop.label}</code> 第 {loop.iteration} 輪 · 條件 <code>{loop.condition}</code>
            <strong data-holds={loop.holds === null ? undefined : String(loop.holds)}>{loop.holds === null ? '（未檢查）' : loop.holds ? '成立，繼續' : '不成立，結束迴圈'}</strong>
          </li>)}</ul>
        </div> : null}
        {frames.length ? <div className={styles.panel}>
          <h4>呼叫堆疊（{frames.length} 層，最上面正在執行）</h4>
          <ol className={styles.frames} reversed>{[...frames].reverse().map((frame, i) => <li key={frames.length - i} data-active={i === 0 ? 'true' : undefined}>
            <span className={styles.frameName}><code>{frame.name}</code>{i === 0 ? '（執行中）' : '（等待中）'}{frame.returns !== undefined ? ` → 回傳 ${frame.returns}` : ''}</span>
            {Object.keys(frame.vars).length ? <span className={styles.frameVars}>{Object.entries(frame.vars).map(([k, v]) => <code key={k}>{k} = {v}</code>)}</span> : <span className={styles.frameVars}>（沒有區域變數）</span>}
          </li>)}</ol>
        </div> : null}
        {step.vars && <table className={styles.vars}>
          <caption>變數</caption>
          <thead><tr><th scope="col">名稱</th><th scope="col">值</th>{step.expected && <th scope="col">預期</th>}</tr></thead>
          <tbody>{Object.entries(step.vars).map(([name, value]) => {
            const want = step.expected?.[name];
            return <tr key={name} data-mismatch={want !== undefined && want !== value ? 'true' : undefined}>
              <th scope="row"><code>{name}</code></th><td><code>{value}</code></td>
              {step.expected && <td>{want === undefined ? '—' : want === value ? <span>相符</span> : <strong>應為 <code>{want}</code></strong>}</td>}
            </tr>;
          })}</tbody>
        </table>}
        {step.arrays?.map(array => <Cells key={array.name} array={array}/>)}
        {step.output !== undefined || config.steps.some(s => s.output !== undefined) ? <div className={styles.vizOutput}><span>輸出</span><pre>{step.output ?? ''}</pre></div> : null}
      </div>
    </div>
    <p className={styles.vizNote} aria-live="polite">第 {step.line} 行：{step.note}</p>
    <Stepper at={at} count={config.steps.length} set={setAt}/>
  </div>;
}

const describe = (variable: string, c: Comparison) => `${variable}${c.mod ? ` % ${c.mod}` : ''} ${c.op} ${c.value}`;

/**
 * Conditional branch: pick a value and see each condition of an if / else if chain checked from the top, which one is
 * taken first, the ones never checked after it, and inside a compound condition which parts short-circuit.
 */
export function ConditionalBranch({ config }: { config: Of<'conditional-branch'> }) {
  const [value, setValue] = useState(config.initial);
  // Each branch: its comparisons in order, each true, false or skipped (short-circuit), and whether it holds.
  const checks = config.branches.map(b => {
    const parts: { text: string; result: boolean | null; join: '||' | '&&' }[] = [];
    let anyOk = true, allOk = true;
    if (b.when.any?.length) {
      anyOk = false;
      for (const c of b.when.any) { const r = anyOk ? null : compare(value, c); parts.push({ text: describe(config.variable, c), result: r, join: '||' }); if (r) anyOk = true; }
    }
    if (b.when.all?.length) {
      for (const c of b.when.all) { const r = anyOk && allOk ? compare(value, c) : null; parts.push({ text: describe(config.variable, c), result: r, join: '&&' }); if (r === false) allOk = false; }
    }
    return { parts, holds: anyOk && allOk };
  });
  const taken = checks.findIndex(c => c.holds);
  const result = taken < 0 ? config.otherwise : config.branches[taken].result;
  const state = (i: number) => taken >= 0 && i > taken ? 'skipped' : i === taken ? 'taken' : 'false';
  const set = (v: number) => setValue(Math.min(config.max, Math.max(config.min, Math.round(v))));
  const compound = config.branches.some(b => (b.when.any?.length ?? 0) + (b.when.all?.length ?? 0) > 1);
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
        {compound && state(i) !== 'skipped' && checks[i].parts.length > 1 && <span className={styles.parts}>{checks[i].parts.map((p, j) =>
          <span key={j}>{j > 0 && <code>{p.join}</code>} <code>{p.text}</code>：{p.result === null ? '短路，未計算' : p.result ? 'true' : 'false'}</span>)}</span>}
      </li>)}
      <li data-state={taken < 0 ? 'taken' : 'skipped'}><code>else</code><span>{taken < 0 ? `執行 → ${config.otherwise}` : '不執行'}</span></li>
    </ol>
    <p className={styles.vizNote} aria-live="polite">{config.variable} = {value} 時，{taken < 0 ? '所有條件都不成立，執行 else' : `第 ${taken + 1} 個條件最先成立`}，輸出 <strong>{result}</strong>。</p>
  </div>;
}

const COUNT: Record<Of<'complexity'>['models'][number]['model'], (n: number) => number> = {
  '1': () => 1, 'log n': n => Math.max(1, Math.ceil(Math.log2(n))), n: n => n, 'n log n': n => n * Math.max(1, Math.ceil(Math.log2(n))), 'n^2': n => n * n,
};
const LABEL = { '1': 'O(1)', 'log n': 'O(log n)', n: 'O(n)', 'n log n': 'O(n log n)', 'n^2': 'O(n²)' } as const;

/**
 * Complexity: counted basic operations of model programs for an input size n. An illustrative model, not a timed
 * benchmark: real time also depends on the machine, the language and the constant factors.
 */
export function Complexity({ config }: { config: Of<'complexity'> }) {
  const [n, setN] = useState(config.initial);
  const counts = config.models.map(m => ({ ...m, count: COUNT[m.model](n) }));
  const top = Math.max(...counts.map(c => c.count));
  const set = (v: number) => setN(Math.min(config.max, Math.max(config.min, Math.round(v))));
  return <div className={styles.viz}>
    <p className={styles.modelNote} role="note">示意模型：下面是「基本操作的次數」，由公式計算，不是實際執行時間的量測。</p>
    <div className={styles.branchInput}>
      <label htmlFor="complexity-n">輸入大小 <code>n</code> =</label>
      <input id="complexity-n" type="number" min={config.min} max={config.max} value={n} onChange={e => { if (e.target.value !== '') set(Number(e.target.value)); }}/>
      <input type="range" aria-label="輸入大小 n" min={config.min} max={config.max} value={n} onChange={e => set(Number(e.target.value))}/>
    </div>
    <ul className={styles.models}>{counts.map(c => <li key={c.model}>
      <span className={styles.modelName}>{LABEL[c.model]}</span>
      <span className={styles.modelBar} aria-hidden><span style={{ width: `${Math.max(0.5, c.count / top * 100)}%` }}/></span>
      <span className={styles.modelCount}>{c.count.toLocaleString('en-US')} 次</span>
      <span className={styles.modelExample}>{c.example}</span>
    </li>)}</ul>
    <p className={styles.vizNote} aria-live="polite">n = {n.toLocaleString('en-US')} 時，最多的是 {LABEL[counts.reduce((a, b) => b.count > a.count ? b : a).model]}：{top.toLocaleString('en-US')} 次{counts.length > 1 ? `，是最少的 ${Math.round(top / Math.min(...counts.map(c => c.count))).toLocaleString('en-US')} 倍` : ''}。</p>
  </div>;
}

/** Final challenge: the problem in stages, each saying what it does and which lessons it uses. */
export function ChallengeStages({ config, titles }: { config: Of<'challenge-stages'>; titles: Record<string, string> }) {
  const [at, setAt] = useState(0);
  const stage = config.stages[at];
  return <div className={styles.viz}>
    <ol className={styles.stageList}>{config.stages.map((s, i) => <li key={s.title} data-state={i < at ? 'done' : i === at ? 'current' : 'next'}>
      <span>{i < at ? '✓ 完成' : i === at ? '▶ 目前' : '待做'}</span>{s.title}</li>)}</ol>
    <div className={styles.stageBody} aria-live="polite">
      <h4>階段 {at + 1}：{stage.title}</h4>
      <p><strong>目標：</strong>{stage.goal}</p>
      <p>{stage.detail}</p>
      <p className={styles.concepts}><span>用到的課程</span>{stage.concepts.map(id => <span key={id} className={styles.chip}>{id} {titles[id]}</span>)}</p>
    </div>
    <Stepper at={at} count={config.stages.length} set={setAt} unit="階段"/>
  </div>;
}
