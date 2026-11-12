'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { HlLines } from '@/lib/highlight/kinds';
import { Highlighted } from '@/components/highlighted';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { compare, PLAYGROUND_LIMIT, TRY_IT_LIMIT, type Comparison, type Mark, type Playground as PlaygroundConfig, type TraceKind, type TraceStep, type TreeNode, type TryIt as TryItConfig, type VisualizationConfig } from '@/content/curriculum/schema';
import { bfsSteps, binarySearchSteps, bubbleSortSteps, dfsSteps, dijkstraSteps, insertionSortSteps, knapsackSteps, linearSearchSteps, lowerBoundSteps, mergeSortSteps, minWindowSteps, prefixSumSteps, quickSortSteps, selectionSortSteps, twoSumSteps } from '@/content/curriculum/simulate-algorithms';
import { bstSteps, containerSteps, dsuForest, dsuSteps, dynamicArraySteps, hashSteps, heapSteps, linkedListSteps } from '@/content/curriculum/simulate';
import { Rich } from './rich';
import styles from './curriculum.module.css';

type Of<K> = Extract<VisualizationConfig, { kind: K }>;
const MARKS: Record<Mark, string> = { read: '讀取', write: '寫入', bad: '越界', removed: '已移除', visited: '已拜訪', found: '找到', current: '目前', pending: '待處理' };

/** Step buttons shared by the step-through visualizations; every button says what it does. */
function Stepper({ at, count, set, unit = '步驟' }: { at: number; count: number; set: (n: number) => void; unit?: string }) {
  // With focus on any of the buttons, the arrow keys step too (Home / End jump to the first / last step).
  const key = (e: KeyboardEvent) => {
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: count - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    set(Math.min(count - 1, Math.max(0, to)));
  };
  return <div className={styles.vizControls} role="group" aria-label={`${unit}控制（方向鍵也可以切換）`} onKeyDown={key}>
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
  // A bad mark outside the array is an out-of-bounds access (explained below it); inside it is a refused move or value.
  const outsideCell = (at: number | [number, number]) => typeof at === 'number' ? at < 0 || at >= (rows[0]?.length ?? 0)
    : at[0] < 0 || at[0] >= rows.length || at[1] < 0 || at[1] >= (rows[at[0]]?.length ?? 0);
  const bad = array.marks?.filter(m => m.kind === 'bad' && outsideCell(m.at)) ?? [];
  const unused = !grid && array.capacity !== undefined ? Math.max(0, array.capacity - rows[0].length) : 0;
  const n = rows[0]?.length ?? 0;
  // Named indices under their cells; −1 and n (just outside the array) are listed after it.
  const named = (c: number) => Object.entries(array.pointers ?? {}).filter(([, p]) => p === c).map(([k]) => k);
  const outside = Object.entries(array.pointers ?? {}).filter(([, p]) => p !== null && (p < 0 || p >= n));
  const inRange = (c: number) => !!array.range && c >= array.range.from && c <= array.range.to;
  return <figure className={styles.cells} aria-label={`${array.name}${grid ? '（二維）' : ''}`}>
    <figcaption><code>{array.name}</code>{grid ? `：${rows.length} 列 × ${rows[0]?.length ?? 0} 行` : `：長度 ${n}`}{array.capacity !== undefined ? `、容量 ${array.capacity}` : ''}
      {array.range ? `；${array.range.label}：${array.range.from > array.range.to ? '空的' : `索引 ${array.range.from}～${array.range.to}`}` : ''}</figcaption>
    <table>
      {grid && <thead><tr><th scope="col"><span className={styles.srOnly}>列＼行</span></th>{rows[0]?.map((_, c) => <th key={c} scope="col">{array.colLabels?.[c] ?? c}</th>)}</tr></thead>}
      <tbody>{rows.map((row, r) => <tr key={r}>
        {grid && <th scope="row">{array.rowLabels?.[r] ?? r}</th>}
        {row.map((cell, c) => { const m = mark(r, c), names = grid ? [] : named(c); return <td key={c} data-mark={m} data-range={!grid && inRange(c) ? 'true' : undefined}>
          <span className={styles.cellValue}>{cell === '' ? ' ' : cell}</span>
          {!grid && <span className={styles.cellIndex}>{array.colLabels?.[c] ?? c}</span>}
          {m && <span className={styles.cellMark}>{m === 'bad' ? '不可行' : MARKS[m]}</span>}
          {names.length ? <span className={styles.cellPointer}>↑{names.join('、')}</span> : null}
        </td>; })}
        {Array.from({ length: unused }, (_, k) => <td key={`u${k}`} data-unused="true"><span className={styles.cellValue}> </span>
          <span className={styles.cellIndex}>{rows[0].length + k}</span><span className={styles.cellMark}>未使用</span></td>)}
      </tr>)}</tbody>
    </table>
    {outside.length ? <p className={styles.dsSets}>{outside.map(([k, p]) => `${k} = ${p}（${p! < 0 ? '在陣列左邊之外' : '在陣列尾端之後'}）`).join('；')}</p> : null}
    {bad.map((m, i) => <p key={i} className={styles.badIndex}>越界：索引 {Array.isArray(m.at) ? `[${m.at.join('][')}]` : m.at} 不在 {grid ? `0～${rows.length - 1} 列、0～${(rows[0]?.length ?? 1) - 1} 行` : rows[0].length ? `0～${rows[0].length - 1}` : '（陣列是空的）'} 之內</p>)}
  </figure>;
}

/**
 * The step-by-step trace shared by the variable, loop, array, function-call and recursion visualizations: the code
 * with the line just run, and beside it whichever panels the step carries (loops, call stack, variables with any
 * mismatch against what was expected, arrays, output).
 */
export function Trace({ config, tokens }: { config: Extract<VisualizationConfig, { kind: TraceKind }>; tokens?: HlLines }) {
  const [at, setAt] = useState(0);
  const step = config.steps[at];
  const lines = config.code.split('\n');
  const frames = step.frames ?? [];
  // Trees, graphs and hash tables need the full width: the code then goes above the state instead of beside it.
  const stacked = config.steps.some(s => s.tree || s.graph || s.dsu || s.buckets || s.table || (s.arrays?.length ?? 0) > 1 || s.arrays?.some(a => Array.isArray(a.cells[0])));
  return <div className={styles.viz}>
    <div className={styles.vizGrid} data-stacked={stacked ? 'true' : undefined}>
      <pre className={styles.vizCode} aria-label={`${config.language} 程式`}><code>{lines.map((line, i) =>
        <span key={i} className={styles.vizLine} data-current={i + 1 === step.line ? 'true' : undefined} aria-current={i + 1 === step.line ? 'step' : undefined}>
          <span className={styles.lineNo} aria-hidden>{i + 1}</span><Highlighted text={line} pieces={tokens?.[i]}/>{'\n'}</span>)}</code></pre>
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
        <DsPanels step={step}/>
        {step.output !== undefined || config.steps.some(s => s.output !== undefined) ? <div className={styles.vizOutput}><span>輸出</span><pre>{step.output ?? ''}</pre></div> : null}
      </div>
    </div>
    <p className={styles.vizNote} aria-live="polite">第 {step.line} 行：<Rich text={step.note}/></p>
    <Stepper at={at} count={config.steps.length} set={setAt}/>
    {config.playground && <Playground config={config.playground}/>}
    {config.tryIt && <TryIt config={config.tryIt}/>}
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

// ---- E.3 data-structure panels -------------------------------------------------------------------------------------
const ENDS = { stack: ['底部', '頂端'], queue: ['前端', '尾端'], deque: ['前端', '尾端'] } as const;
const KINDS = { stack: '堆疊', queue: '佇列', deque: '雙端佇列' } as const;

/** Every data-structure panel a step carries: containers, linked list, hash buckets, tree, graph, union-find. */
function DsPanels({ step }: { step: TraceStep }) {
  return <>
    {step.containers?.map(c => <Container key={c.name} c={c}/>)}
    {step.list && <List list={step.list}/>}
    {step.buckets && <Buckets b={step.buckets}/>}
    {step.tree && <TreeView tree={step.tree}/>}
    {step.graph && <GraphView graph={step.graph}/>}
    {step.dsu && <Dsu dsu={step.dsu}/>}
    {step.table && <StepTable table={step.table}/>}
  </>;
}

/** A labelled table; a marked row or cell also says its mark in words. */
function StepTable({ table }: { table: NonNullable<TraceStep['table']> }) {
  const mark = (r: number, c?: number) => table.marks?.find(m => m.row === r && (m.col === undefined || m.col === c))?.kind;
  return <div className={styles.dsScroll}><table className={`${styles.vars} ${styles.stepTable}`}>
    <caption>{table.name}</caption>
    <thead><tr>{table.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, r) => { const rowMark = table.marks?.find(m => m.row === r && m.col === undefined)?.kind;
      return <tr key={r} data-mark={rowMark}>{row.map((cell, c) => { const m = mark(r, c);
        return c === 0 ? <th key={c} scope="row">{cell}{rowMark ? <span className={styles.cellMark}>{MARKS[rowMark]}</span> : null}</th>
          : <td key={c} data-mark={m !== rowMark ? m : undefined}>{cell}{m && m !== rowMark ? `（${MARKS[m]}）` : ''}</td>; })}</tr>; })}</tbody>
  </table></div>;
}

function Container({ c }: { c: NonNullable<TraceStep['containers']>[number] }) {
  const [first, last] = ENDS[c.kind];
  return <figure className={styles.cells}>
    <figcaption><code>{c.name}</code>：{KINDS[c.kind]}，{c.items.length} 個元素（由{first}到{last}）</figcaption>
    {c.items.length ? <ol className={styles.dsRow}>{c.items.map((item, i) => {
      const m = c.marks?.find(x => x.at === i)?.kind;
      return <li key={i} data-mark={m}>
        <span className={styles.cellValue}>{item}</span>
        <span className={styles.cellIndex}>{[i === 0 ? first : '', i === c.items.length - 1 ? last : ''].filter(Boolean).join('／') || ' '}</span>
        {m && <span className={styles.cellMark}>{MARKS[m]}</span>}
      </li>;
    })}</ol> : <p className={styles.dsEmpty}>（空的）</p>}
    {c.underflow && <p className={styles.badIndex}>Underflow：{KINDS[c.kind]}是空的，這個操作沒有元素可用。</p>}
  </figure>;
}

function List({ list }: { list: NonNullable<TraceStep['list']> }) {
  const at = (i: number | null) => Object.entries(list.pointers ?? {}).filter(([, p]) => p === i).map(([name]) => name);
  const nulls = at(null);
  return <figure className={styles.cells}>
    <figcaption><code>{list.name}</code>：單向鏈結串列，{list.nodes.length} 個節點（從 head 沿 next 走）</figcaption>
    <ol className={styles.dsRow} data-linked="true">
      {list.nodes.map((node, i) => {
        const m = list.marks?.find(x => x.at === i)?.kind, names = at(i);
        return <li key={i} data-mark={m}>
          <span className={styles.cellValue}>{node}</span>
          <span className={styles.cellIndex}>{names.length ? names.join('、') : ' '}</span>
          {m && <span className={styles.cellMark}>{MARKS[m]}</span>}
          <span className={styles.srOnly}>，next 指向{i + 1 < list.nodes.length ? ` ${list.nodes[i + 1]}` : ' null'}</span>
        </li>;
      })}
      <li data-null="true"><span className={styles.cellValue}>null</span><span className={styles.cellIndex}>{nulls.length ? `${nulls.join('、')} = null` : '結尾'}</span></li>
    </ol>
  </figure>;
}

function Buckets({ b }: { b: NonNullable<TraceStep['buckets']> }) {
  return <figure className={styles.cells}>
    <figcaption><code>{b.name}</code>：{b.buckets.length} 個桶（每個桶是一條串列）</figcaption>
    <table className={styles.bucketTable}><tbody>{b.buckets.map((chain, i) => {
      const row = b.marks?.filter(m => m.bucket === i) ?? [];
      const rowMark = row.find(m => m.index === undefined)?.kind;
      return <tr key={i} data-mark={row.length ? rowMark ?? 'read' : undefined}>
        <th scope="row">桶 {i}{rowMark && <span className={styles.cellMark}>{MARKS[rowMark]}</span>}</th>
        <td>{chain.length ? <ol className={styles.chain}>{chain.map((item, j) => {
          const m = row.find(x => x.index === j)?.kind;
          return <li key={j} data-mark={m}><code>{item}</code>{m && <span className={styles.cellMark}>{MARKS[m]}</span>}</li>;
        })}</ol> : <span className={styles.dsEmpty}>（空）</span>}</td>
      </tr>;
    })}</tbody></table>
  </figure>;
}

const SLOT = 46, LEVEL = 58, R = 17;
/** Positions for a tree or forest: binary trees by inorder rank, general trees with parents centred over children. */
function layout(nodes: TreeNode[], roots: string[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const pos = new Map<string, { x: number; y: number }>();
  let slot = 0, depth = 0;
  const place = (id: string, d: number): number => {
    const n = byId.get(id)!;
    depth = Math.max(depth, d);
    let x: number;
    if (n.children) {
      const xs = n.children.map(c => place(c, d + 1));
      x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : slot++;
    } else {
      if (n.left) place(n.left, d + 1);
      x = slot++;
      if (n.right) place(n.right, d + 1);
    }
    pos.set(id, { x, y: d });
    return x;
  };
  for (const r of roots) place(r, 0);
  return { pos, width: Math.max(1, slot) * SLOT + 8, height: (depth + 1) * LEVEL + 10 };
}
const at = (p: { x: number; y: number }) => ({ cx: p.x * SLOT + SLOT / 2 + 4, cy: p.y * LEVEL + R + 6 });

/** A tree or forest drawn in SVG (inside its own scrolling box), with the same structure as a text outline. */
function TreeView({ tree }: { tree: NonNullable<TraceStep['tree']> }) {
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const mark = (id: string) => tree.marks?.find(m => m.id === id)?.kind;
  const { pos, width, height } = layout(tree.nodes, tree.roots);
  const kids = (n: TreeNode) => n.children ?? [n.left, n.right].filter((c): c is string => !!c);
  const outline = (id: string, role = ''): ReactNode => {
    const n = byId.get(id)!, m = mark(id);
    const sub: [string, string][] = n.children ? n.children.map(c => [c, '']) : ([[n.left, '左'], [n.right, '右']] as const).flatMap(([c, side]) => c ? [[c, side] as [string, string]] : []);
    return <li key={id}>{role && `${role}：`}{n.label}{m ? `（${MARKS[m]}）` : ''}{!kids(n).length ? '，葉子' : ''}
      {sub.length ? <ul>{sub.map(([c, side]) => outline(c, side))}</ul> : null}</li>;
  };
  return <figure className={styles.cells}>
    <figcaption><code>{tree.name}</code>：{tree.nodes.length ? `${tree.nodes.length} 個節點${tree.roots.length > 1 ? `，${tree.roots.length} 棵樹` : ''}` : '空的'}</figcaption>
    {tree.nodes.length ? <div className={styles.dsScroll}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={styles.dsSvg}>
        {tree.nodes.flatMap(n => kids(n).map(c => { const a = at(pos.get(n.id)!), b = at(pos.get(c)!); return <line key={`${n.id}-${c}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}/>; }))}
        {tree.nodes.map(n => { const p = at(pos.get(n.id)!), m = mark(n.id); return <g key={n.id} data-mark={m}>
          <circle cx={p.cx} cy={p.cy} r={R}/>
          <text x={p.cx} y={p.cy + 4} textAnchor="middle">{n.label}</text>
          {m && <text x={p.cx} y={p.cy + R + 11} textAnchor="middle" className={styles.svgMark}>{MARKS[m]}</text>}
        </g>; })}
      </svg>
    </div> : null}
    <ul className={styles.srOnly} aria-label={`${tree.name}的結構`}>{tree.roots.map(r => outline(r, '根'))}</ul>
  </figure>;
}

/** A graph drawn on a circle, plus its adjacency list and matrix as text (which is also its text alternative). */
function GraphView({ graph }: { graph: NonNullable<TraceStep['graph']> }) {
  const n = graph.nodes.length, size = 240, c = size / 2, r = n > 1 ? 88 : 0;
  const p = new Map(graph.nodes.map((v, i) => [v, { x: c + r * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n), y: c + r * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / n) }]));
  const nodeMark = (v: string) => graph.marks?.find(m => m.node === v)?.kind;
  const edgeMark = (i: number) => graph.marks?.find(m => m.edge === i)?.kind;
  const weighted = graph.edges.some(e => e.weight !== undefined);
  const adj = (v: string) => graph.edges.flatMap((e, i) => e.from === v ? [{ to: e.to, e, i }] : !graph.directed && e.to === v ? [{ to: e.from, e, i }] : []);
  const cell = (a: string, b: string) => {
    const i = graph.edges.findIndex(e => (e.from === a && e.to === b) || (!graph.directed && e.from === b && e.to === a));
    return { i, text: i < 0 ? (weighted ? '—' : '0') : String(graph.edges[i].weight ?? 1) };
  };
  return <figure className={styles.cells}>
    <figcaption><code>{graph.name}</code>：{graph.directed ? '有向' : '無向'}{weighted ? '加權' : ''}圖，{n} 個頂點、{graph.edges.length} 條邊</figcaption>
    <div className={styles.graphGrid}>
      <div className={styles.dsScroll}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={styles.dsSvg}>
          <defs><marker id="ds-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>
          {graph.edges.map((e, i) => {
            const a = p.get(e.from)!, b = p.get(e.to)!, len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len, m = edgeMark(i);
            return <g key={i} data-mark={m}>
              <line x1={a.x + ux * R} y1={a.y + uy * R} x2={b.x - ux * (R + 2)} y2={b.y - uy * (R + 2)} markerEnd={graph.directed ? 'url(#ds-arrow)' : undefined}/>
              {e.weight !== undefined && <text x={(a.x + b.x) / 2 - uy * 10} y={(a.y + b.y) / 2 + ux * 10 + 4} textAnchor="middle" className={styles.svgWeight}>{e.weight}</text>}
            </g>;
          })}
          {graph.nodes.map(v => { const q = p.get(v)!, m = nodeMark(v); return <g key={v} data-mark={m}>
            <circle cx={q.x} cy={q.y} r={R}/>
            <text x={q.x} y={q.y + 4} textAnchor="middle">{v}</text>
            {m && <text x={q.x} y={q.y + R + 11} textAnchor="middle" className={styles.svgMark}>{MARKS[m]}</text>}
          </g>; })}
        </svg>
      </div>
      <div className={styles.graphText}>
        {graph.show.includes('list') && <div>
          <h5>鄰接串列（adjacency list）</h5>
          <ul className={styles.adjList}>{graph.nodes.map(v => { const m = nodeMark(v); return <li key={v} data-mark={m}>
            <code>{v}</code>{m ? `（${MARKS[m]}）` : ''} → {adj(v).length ? adj(v).map(({ to, e, i }, k) => <span key={k} data-mark={edgeMark(i)}>{k > 0 && '、'}<code>{to}{e.weight !== undefined ? `(${e.weight})` : ''}</code></span>) : '（沒有鄰居）'}
          </li>; })}</ul>
        </div>}
        {graph.show.includes('matrix') && <div className={styles.dsScroll}>
          <h5>鄰接矩陣（adjacency matrix）{weighted ? '：數字是權重，— 表示沒有邊' : '：1 表示有邊'}</h5>
          <table className={styles.matrix}>
            <thead><tr><th scope="col"><span className={styles.srOnly}>從＼到</span></th>{graph.nodes.map(v => <th key={v} scope="col">{v}</th>)}</tr></thead>
            <tbody>{graph.nodes.map(a => <tr key={a}><th scope="row">{a}</th>{graph.nodes.map(b => { const x = cell(a, b), m = x.i >= 0 ? edgeMark(x.i) : undefined; return <td key={b} data-mark={m}>{x.text}{m && <span className={styles.srOnly}>（{MARKS[m]}）</span>}</td>; })}</tr>)}</tbody>
          </table>
        </div>}
      </div>
    </div>
  </figure>;
}

function Dsu({ dsu }: { dsu: NonNullable<TraceStep['dsu']> }) {
  const forest = dsuForest(dsu.parent);
  const root = (i: number) => { while (dsu.parent[i] !== i) i = dsu.parent[i]; return i; };
  const sets = new Map<number, number[]>();
  dsu.parent.forEach((_, i) => sets.set(root(i), [...(sets.get(root(i)) ?? []), i]));
  const mark = (i: number) => dsu.marks?.find(m => m.at === i)?.kind;
  return <>
    <figure className={styles.cells}>
      <figcaption>並查集：{dsu.parent.length} 個元素，{sets.size} 個集合</figcaption>
      <table>
        <thead><tr><th scope="row">元素</th>{dsu.parent.map((_, i) => <th key={i} scope="col">{i}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">parent</th>{dsu.parent.map((p, i) => { const m = mark(i); return <td key={i} data-mark={m}><span className={styles.cellValue}>{p}</span>{p === i && <span className={styles.cellIndex}>根</span>}{m && <span className={styles.cellMark}>{MARKS[m]}</span>}</td>; })}</tr>
          <tr><th scope="row">size</th>{dsu.size.map((z, i) => <td key={i}>{dsu.parent[i] === i ? z : '—'}</td>)}</tr>
        </tbody>
      </table>
      <p className={styles.dsSets}>集合：{[...sets.values()].map(s => `{${s.join(', ')}}`).join('、')}（size 只對根有意義）</p>
    </figure>
    <TreeView tree={{ name: '並查集的森林（每個元素畫在它的 parent 下面）', nodes: forest.nodes, roots: forest.roots, marks: (dsu.marks ?? []).map(m => ({ id: `d${m.at}`, kind: m.kind })) }}/>
  </>;
}

// ---- playground ----------------------------------------------------------------------------------------------------
type Arg = 'value' | 'index' | 'a' | 'b';
type PgOp = { op: string; value: number; index: number; a: number; b: number };
const PG: Record<PlaygroundConfig['structure'], { title: string; ops: { op: string; args: Arg[]; grows?: boolean }[] }> = {
  stack: { title: '堆疊', ops: [{ op: 'push', args: ['value'], grows: true }, { op: 'pop', args: [] }, { op: 'top', args: [] }] },
  queue: { title: '佇列', ops: [{ op: 'push', args: ['value'], grows: true }, { op: 'pop', args: [] }, { op: 'front', args: [] }] },
  deque: { title: '雙端佇列', ops: [{ op: 'push_front', args: ['value'], grows: true }, { op: 'push_back', args: ['value'], grows: true }, { op: 'pop_front', args: [] }, { op: 'pop_back', args: [] }] },
  'dynamic-array': { title: '動態陣列', ops: [{ op: 'push_back', args: ['value'], grows: true }, { op: 'insert', args: ['index', 'value'], grows: true }, { op: 'erase', args: ['index'] }, { op: 'get', args: ['index'] }] },
  list: { title: '單向鏈結串列', ops: [{ op: 'push_front', args: ['value'], grows: true }, { op: 'push_back', args: ['value'], grows: true }, { op: 'find', args: ['value'] }, { op: 'remove', args: ['value'] }] },
  'hash-set': { title: '雜湊集合', ops: [{ op: 'add', args: ['value'], grows: true }, { op: 'contains', args: ['value'] }, { op: 'remove', args: ['value'] }] },
  bst: { title: '二元搜尋樹', ops: [{ op: 'insert', args: ['value'], grows: true }, { op: 'search', args: ['value'] }, { op: 'remove', args: ['value'] }] },
  heap: { title: '最小堆積', ops: [{ op: 'push', args: ['value'], grows: true }, { op: 'pop', args: [] }, { op: 'top', args: [] }] },
  dsu: { title: '並查集', ops: [{ op: 'union', args: ['a', 'b'] }, { op: 'find', args: ['a'] }, { op: 'connected', args: ['a', 'b'] }] },
};
const ARG_LABEL: Record<Arg, string> = { value: '值', index: '索引', a: 'a', b: 'b' };

/** Runs the structure's simulator over the learner's operations (line numbers do not apply here). */
function simulate(config: PlaygroundConfig, ops: PgOp[]): TraceStep[] {
  const line = 1;
  switch (config.structure) {
    case 'stack': case 'queue': case 'deque':
      return containerSteps(PG[config.structure].title, config.structure, ops.map(o => ({ line, op: o.op, value: String(o.value) }) as Parameters<typeof containerSteps>[2][number]));
    case 'dynamic-array': return dynamicArraySteps('a', ops.map(o => ({ line, op: o.op, index: o.index, value: String(o.value) }) as Parameters<typeof dynamicArraySteps>[1][number]));
    case 'list': return linkedListSteps('list', ops.map(o => ({ line, op: o.op, value: String(o.value) }) as Parameters<typeof linkedListSteps>[1][number]));
    case 'hash-set': return hashSteps('集合', config.buckets ?? 7, 'set', ops.map(o => ({ line, op: o.op, key: o.value }) as Parameters<typeof hashSteps>[3][number]));
    case 'bst': return bstSteps('BST', ops.map(o => ({ line, op: o.op, value: o.value }) as Parameters<typeof bstSteps>[1][number]));
    case 'heap': return heapSteps('heap', ops.map(o => ({ line, op: o.op, value: o.value }) as Parameters<typeof heapSteps>[1][number]));
    case 'dsu': return dsuSteps(config.size ?? 6, ops.map(o => ({ line, op: o.op, a: o.a, b: o.b }) as Parameters<typeof dsuSteps>[1][number]));
  }
}
/** The empty structure, before any operation. */
function emptyStep(config: PlaygroundConfig): TraceStep {
  const base = { line: 1, note: '還沒有任何操作。' };
  switch (config.structure) {
    case 'stack': case 'queue': case 'deque': return { ...base, containers: [{ name: PG[config.structure].title, kind: config.structure, items: [] }] };
    case 'dynamic-array': return { ...base, arrays: [{ name: 'a', cells: [], capacity: 1 }], vars: { size: '0', capacity: '1' } };
    case 'list': return { ...base, list: { name: 'list', nodes: [], pointers: { head: null } } };
    case 'hash-set': return { ...base, buckets: { name: '集合', buckets: Array.from({ length: config.buckets ?? 7 }, () => []) } };
    case 'bst': return { ...base, tree: { name: 'BST', nodes: [], roots: [] } };
    case 'heap': return { ...base, arrays: [{ name: 'heap', cells: [] }], tree: { name: 'heap（以樹呈現）', nodes: [], roots: [] } };
    case 'dsu': { const n = config.size ?? 6; return { ...base, dsu: { parent: Array.from({ length: n }, (_, i) => i), size: Array(n).fill(1) } }; }
  }
}
const sizeOf = (s: TraceStep) => s.containers?.[0]?.items.length ?? s.list?.nodes.length ?? s.buckets?.buckets.flat().length ?? s.arrays?.[0]?.cells.length ?? s.tree?.nodes.length ?? 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.round(v) : lo));

/**
 * Try it yourself: the learner runs operations with their own values on the lesson's structure. Values are integers
 * 0–99, there are at most PLAYGROUND_LIMIT elements, and every operation shows the steps it took.
 */
function Playground({ config }: { config: PlaygroundConfig }) {
  const [ops, setOps] = useState<PgOp[]>([]);
  const [args, setArgs] = useState({ value: 5, index: 0, a: 0, b: 1 });
  const all = ops.length ? simulate(config, ops) : [];
  const before = ops.length > 1 ? simulate(config, ops.slice(0, -1)).length : 0;
  const latest = all.slice(before);
  const state = all.at(-1) ?? emptyStep(config);
  const full = sizeOf(state) >= PLAYGROUND_LIMIT;
  const n = config.size ?? 6;
  const range: Record<Arg, [number, number]> = { value: [0, 99], index: [0, PLAYGROUND_LIMIT], a: [0, n - 1], b: [0, n - 1] };
  const used = new Set(PG[config.structure].ops.flatMap(o => o.args));
  const id = `pg-${config.structure}`;
  return <section className={styles.playground} aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>自己試試：{PG[config.structure].title}</h4>
    <p className={styles.muted}>{used.has('a') ? `輸入 0～${n - 1} 的元素編號（共 ${n} 個元素）` : `輸入 0～99 的整數，最多 ${PLAYGROUND_LIMIT} 個元素`}，再按操作；每個操作都用和上面相同的規則執行。</p>
    <div className={styles.branchInput}>
      {(['value', 'index', 'a', 'b'] as Arg[]).filter(a => used.has(a)).map(a => <span key={a} className={styles.pgArg}>
        <label htmlFor={`${id}-${a}`}>{ARG_LABEL[a]}</label>
        <input id={`${id}-${a}`} type="number" min={range[a][0]} max={range[a][1]} step={1} value={args[a]}
          onChange={e => { if (e.target.value !== '') setArgs({ ...args, [a]: clamp(Number(e.target.value), ...range[a]) }); }}/>
      </span>)}
    </div>
    <div className={styles.vizControls}>
      {PG[config.structure].ops.map(o => <button key={o.op} type="button" disabled={(o.grows && full) || ops.length >= 40}
        onClick={() => setOps([...ops, { op: o.op, ...args }])}>{o.op}{o.args.length ? `(${o.args.map(a => args[a]).join(', ')})` : ''}</button>)}
      <button type="button" onClick={() => setOps(ops.slice(0, -1))} disabled={!ops.length}><ChevronLeft size={14} aria-hidden/>復原上一個操作</button>
      <button type="button" onClick={() => setOps([])} disabled={!ops.length}><RotateCcw size={14} aria-hidden/>清空</button>
    </div>
    {full && <p className={styles.muted}>已達 {PLAYGROUND_LIMIT} 個元素的上限，請先移除元素。</p>}
    <div aria-live="polite">
      {latest.length ? <ol className={styles.pgLog} aria-label="這個操作的過程">{latest.map((s, i) => <li key={i}><Rich text={s.note}/></li>)}</ol> : <p className={styles.vizNote}>{state.note}</p>}
    </div>
    <div className={styles.vizState}>
      {state.arrays?.map(a => <Cells key={a.name} array={a}/>)}
      <DsPanels step={state}/>
      {state.vars && <table className={styles.vars}><caption>結果</caption><tbody>{Object.entries(state.vars).map(([k, v]) => <tr key={k}><th scope="row"><code>{k}</code></th><td><code>{v}</code></td></tr>)}</tbody></table>}
    </div>
  </section>;
}

// ---- try it: an algorithm on the learner's own input -----------------------------------------------------------------
const ALGO_NAMES: Record<TryItConfig['algorithm'], string> = {
  'linear-search': '線性搜尋', 'binary-search': '二分搜尋', 'lower-bound': 'lower bound', 'bubble-sort': '氣泡排序', 'selection-sort': '選擇排序',
  'insertion-sort': '插入排序', 'merge-sort': '合併排序', 'quick-sort': '快速排序', 'two-sum': '雙指標配對', 'min-window': '最短視窗', 'prefix-sum': '前綴和',
  bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', knapsack: '0/1 背包',
};
type ArrayTry = Extract<TryItConfig, { initial: number[] }>;
/** Parses and checks the learner's numbers; returns the steps, or the reason the input is rejected. */
function runArray(config: ArrayTry, text: string, target: number): TraceStep[] | string {
  const tokens = text.trim().split(/[\s,，]+/).filter(Boolean);
  if (!tokens.length || tokens.length > TRY_IT_LIMIT) return `請輸入 1～${TRY_IT_LIMIT} 個整數，以逗號或空白分隔。`;
  if (tokens.some(t => !/^-?\d{1,2}$/.test(t))) return '每個數都必須是 −99 到 99 的整數。';
  const a = tokens.map(Number);
  const sorted = a.every((v, i) => !i || a[i - 1] <= v);
  switch (config.algorithm) {
    case 'linear-search': return linearSearchSteps(a, target);
    case 'binary-search': return sorted ? binarySearchSteps(a, target) : '二分搜尋需要由小到大排好的資料。';
    case 'lower-bound': return sorted ? lowerBoundSteps(a, target) : 'lower bound 需要由小到大排好的資料。';
    case 'bubble-sort': return bubbleSortSteps(a);
    case 'selection-sort': return selectionSortSteps(a);
    case 'insertion-sort': return insertionSortSteps(a);
    case 'merge-sort': return mergeSortSteps(a);
    case 'quick-sort': return quickSortSteps(a);
    case 'two-sum': return sorted ? twoSumSteps(a, target) : '雙指標配對需要由小到大排好的資料。';
    case 'min-window': return a.some(v => v < 0) ? '這個滑動視窗只適用於非負整數：有負數時，擴大視窗不一定讓和變大。' : target < 1 ? '目標和必須是正整數。' : minWindowSteps(a, target);
    case 'prefix-sum': return prefixSumSteps(a, [[0, a.length - 1]]);
  }
}
const needsTarget = (a: TryItConfig['algorithm']) => ['linear-search', 'binary-search', 'lower-bound', 'two-sum', 'min-window'].includes(a);

/** One step of an algorithm, without code: the panels, the explanation and the stepper. */
function StepView({ steps, label }: { steps: TraceStep[]; label: string }) {
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  return <div aria-label={label} role="group">
    <div className={styles.vizState}>
      {step.vars && <table className={styles.vars}><caption>變數</caption><tbody>{Object.entries(step.vars).map(([k, v]) => <tr key={k}><th scope="row"><code>{k}</code></th><td><code>{v}</code></td></tr>)}</tbody></table>}
      {step.arrays?.map(a => <Cells key={a.name} array={a}/>)}
      <DsPanels step={step}/>
      {step.output !== undefined && <div className={styles.vizOutput}><span>輸出</span><pre>{step.output}</pre></div>}
    </div>
    <p className={styles.vizNote} aria-live="polite"><Rich text={step.note}/></p>
    <Stepper at={Math.min(at, steps.length - 1)} count={steps.length} set={setAt}/>
  </div>;
}

/** Try it: the lesson's algorithm on the learner's own (validated, range-limited) input. */
function TryIt({ config }: { config: TryItConfig }) {
  const id = `try-${config.algorithm}`;
  const [text, setText] = useState('initial' in config ? config.initial.join(', ') : '');
  const [target, setTarget] = useState('initial' in config ? config.target ?? 0 : 0);
  const [start, setStart] = useState('nodes' in config ? config.start : '');
  const [capacity, setCapacity] = useState('items' in config ? config.capacity : 0);
  const [run, setRun] = useState(0);
  let steps: TraceStep[] | string;
  if ('initial' in config) steps = runArray(config, text, target);
  else if ('nodes' in config) steps = config.algorithm === 'bfs' ? bfsSteps(config.nodes, config.edges, config.directed, start)
    : config.algorithm === 'dfs' ? dfsSteps(config.nodes, config.edges, config.directed, start) : dijkstraSteps(config.nodes, config.edges, config.directed, start);
  else steps = knapsackSteps(config.items, capacity);
  const changed = () => setRun(r => r + 1);
  return <section className={styles.playground} aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>自己試試：{ALGO_NAMES[config.algorithm]}</h4>
    <div className={styles.branchInput}>
      {'initial' in config && <span className={styles.pgArg}><label htmlFor={`${id}-data`}>資料</label>
        <input id={`${id}-data`} className={styles.tryData} value={text} maxLength={60} onChange={e => { setText(e.target.value); changed(); }}/></span>}
      {'initial' in config && needsTarget(config.algorithm) && <span className={styles.pgArg}><label htmlFor={`${id}-target`}>{config.algorithm === 'min-window' ? '目標和' : '目標'}</label>
        <input id={`${id}-target`} type="number" min={-999} max={999} value={target} onChange={e => { if (e.target.value !== '') { setTarget(clamp(Number(e.target.value), -999, 999)); changed(); } }}/></span>}
      {'nodes' in config && <span className={styles.pgArg}><label htmlFor={`${id}-start`}>起點</label>
        <select id={`${id}-start`} value={start} onChange={e => { setStart(e.target.value); changed(); }}>{config.nodes.map(n => <option key={n} value={n}>{n}</option>)}</select></span>}
      {'items' in config && <span className={styles.pgArg}><label htmlFor={`${id}-cap`}>背包容量（0～12）</label>
        <input id={`${id}-cap`} type="number" min={0} max={12} value={capacity} onChange={e => { if (e.target.value !== '') { setCapacity(clamp(Number(e.target.value), 0, 12)); changed(); } }}/></span>}
    </div>
    {'initial' in config && <p className={styles.muted}>最多 {TRY_IT_LIMIT} 個 −99～99 的整數{['binary-search', 'lower-bound', 'two-sum'].includes(config.algorithm) ? '，必須由小到大排好' : ''}{config.algorithm === 'min-window' ? '，必須是非負整數' : ''}。修改後從第一步重新開始。</p>}
    {typeof steps === 'string' ? <p className={styles.badIndex} role="alert">{steps}</p> : <StepView key={run} steps={steps} label={`${ALGO_NAMES[config.algorithm]}的步驟`}/>}
  </section>;
}

// ---- structure comparison ------------------------------------------------------------------------------------------
/** Pick the operations a problem needs and see each structure's cost for them, and which structures fit them all. */
export function DsComparison({ config }: { config: Of<'ds-comparison'> }) {
  const [picked, setPicked] = useState<string[]>(config.operations.slice(0, 2).map(o => o.id));
  const ops = config.operations.filter(o => picked.includes(o.id));
  const fit = config.structures.filter(s => ops.every(o => s.costs[o.id].good));
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter(p => p !== id) : [...picked, id]);
  const words = config.wording ?? { caption: '每種結構做這些操作的時間複雜度（一般情況）', subject: '結構', good: '適合', poor: '較慢' };
  return <div className={styles.viz}>
    <fieldset className={styles.opPicker}>
      <legend>這個問題需要哪些操作？（可複選）</legend>
      {config.operations.map(o => <label key={o.id}><input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)}/>{o.label}</label>)}
    </fieldset>
    {ops.length ? <div className={styles.dsScroll}><table className={`${styles.vars} ${styles.dsTable}`}>
      <caption>{words.caption}</caption>
      <thead><tr><th scope="col">{words.subject}</th>{ops.map(o => <th key={o.id} scope="col">{o.label}</th>)}<th scope="col">結論</th></tr></thead>
      <tbody>{config.structures.map(s => {
        const slow = ops.filter(o => !s.costs[o.id].good);
        return <tr key={s.name} data-fit={slow.length ? undefined : 'true'}>
          <th scope="row">{s.name}<small className={styles.dsNote}><Rich text={s.note}/></small></th>
          {ops.map(o => <td key={o.id} data-good={String(s.costs[o.id].good)}>{config.wording ? <Rich text={s.costs[o.id].cost}/> : <code>{s.costs[o.id].cost}</code>} {s.costs[o.id].good ? words.good : words.poor}</td>)}
          <td>{slow.length ? `${words.poor}：${slow.map(o => o.label).join('、')}` : `全部${words.good}`}</td>
        </tr>;
      })}</tbody>
    </table></div> : null}
    <p className={styles.vizNote} aria-live="polite">{!ops.length ? '請至少選一項操作。'
      : fit.length ? `這些操作都${words.good}的${words.subject}：${fit.map(s => s.name).join('、')}。`
      : `沒有一種${words.subject}在所有選取的操作上都${words.good}：要依哪個操作最頻繁來取捨，或組合兩種${words.subject}。`}</p>
  </div>;
}
