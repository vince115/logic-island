'use client';

import { useId, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { buildTree, range, search, validateInput, MAX_KEYS, MAX_ORDER, MIN_ORDER } from '@/lib/bplus/tree';
import type { BPlusExample } from '@/content/curriculum/schema';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1c query-plan activity, part one (DB11): a B+ tree built from the lesson's keys, or the learner's own, drawn
 * level by level with the leaf chain. Searching a key marks the root-to-leaf path; a range query marks that path and
 * the leaves walked along the chain. Everything is computed by src/lib/bplus/tree.ts; the text below the tree says the
 * same thing as the marks.
 */

const parse = (text: string) => text.split(/[\s,，、]+/).filter(Boolean).map(Number);

export function BPlusExplorer({ example }: { example: BPlusExample }) {
  const id = useId();
  const [keysText, setKeysText] = useState(example.keys.join(', '));
  const [order, setOrder] = useState(example.order);
  const [query, setQuery] = useState<{ kind: 'search'; key: number } | { kind: 'range'; lo: number; hi: number } | undefined>(
    example.range ? { kind: 'range', lo: example.range[0], hi: example.range[1] } : example.search !== undefined ? { kind: 'search', key: example.search } : undefined);
  const [lo, setLo] = useState(String(example.range?.[0] ?? example.search ?? ''));
  const [hi, setHi] = useState(String(example.range?.[1] ?? ''));
  const keys = parse(keysText), problem = validateInput(order, keys);
  const [shown, setShown] = useState({ order: example.order, keys: example.keys });
  const tree = buildTree(shown.order, shown.keys);
  const result = query?.kind === 'search' ? { ...search(tree, query.key), leaves: [] as string[], keys: [] as number[] }
    : query?.kind === 'range' ? { ...range(tree, query.lo, query.hi), found: undefined } : undefined;
  const levels = Array.from({ length: tree.height }, (_, d) => tree.nodes.filter(n => n.level === d));
  const visited = new Set([...(result?.path ?? []), ...(result?.leaves ?? [])]);
  const reset = () => { setKeysText(example.keys.join(', ')); setOrder(example.order); setShown({ order: example.order, keys: example.keys }); setQuery(undefined); setLo(''); setHi(''); };
  const run = () => {
    const a = Number(lo), b = hi.trim() === '' ? undefined : Number(hi);
    if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) return;
    setQuery(b === undefined ? { kind: 'search', key: a } : { kind: 'range', lo: Math.min(a, b), hi: Math.max(a, b) });
  };
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <div className={styles.row}>
        <label htmlFor={`${id}-keys`}>依序插入的鍵</label>
        <input id={`${id}-keys`} className={styles.wideInput} value={keysText} onChange={e => setKeysText(e.target.value)} aria-describedby={`${id}-rule`}/>
        <label htmlFor={`${id}-order`}>階數</label>
        <select id={`${id}-order`} value={order} onChange={e => setOrder(Number(e.target.value))}>
          {Array.from({ length: MAX_ORDER - MIN_ORDER + 1 }, (_, i) => MIN_ORDER + i).map(m => <option key={m} value={m}>{m}（每個節點最多 {m - 1} 個鍵）</option>)}
        </select>
        <button type="button" disabled={!!problem} onClick={() => { setShown({ order, keys }); setQuery(undefined); }}>重新建樹</button>
      </div>
      <p id={`${id}-rule`} className={problem ? styles.feedback : styles.help}>{problem ?? `0 到 999 的整數，以逗號或空白分隔，最多 ${MAX_KEYS} 個；重複的鍵只插入一次。`}</p>
      <div className={styles.row}>
        <label htmlFor={`${id}-lo`}>找鍵（或範圍下限）</label>
        <input id={`${id}-lo`} className={styles.numInput} inputMode="numeric" value={lo} onChange={e => setLo(e.target.value)}/>
        <label htmlFor={`${id}-hi`}>範圍上限（可空白）</label>
        <input id={`${id}-hi`} className={styles.numInput} inputMode="numeric" value={hi} onChange={e => setHi(e.target.value)}/>
        <button type="button" className={base.primaryButton} onClick={run}><Search size={14} aria-hidden/>搜尋</button>
        <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      <div className={styles.treeScroll}>
        <ol className={styles.tree} aria-label={`B+ 樹（階數 ${tree.order}，${tree.keyCount} 個鍵，高度 ${tree.height}）`}>
          {levels.map((level, d) => <li key={d}>
            <span className={styles.treeLevel}>{d === 0 ? '根' : d === tree.height - 1 ? '葉' : `第 ${d} 層`}</span>
            <ol className={styles.treeRow}>{level.map(n => <li key={n.id} className={styles.treeNode} data-leaf={n.leaf} data-visited={visited.has(n.id)}
              aria-label={`${n.leaf ? '葉節點' : '內部節點'} ${n.keys.join('、') || '（空）'}${visited.has(n.id) ? '，查詢經過' : ''}`}>
              {n.keys.length ? n.keys.map(k => <span key={k} data-hit={result?.keys.includes(k) || (query?.kind === 'search' && query.key === k && n.leaf)}>{k}</span>) : <span>空</span>}
              {n.next && <span className={styles.treeNext} aria-hidden>→</span>}
            </li>)}</ol>
          </li>)}
        </ol>
      </div>
      <p className={styles.row} aria-live="polite">{!query ? `共 ${tree.keyCount} 個鍵、${tree.nodes.length} 個節點、高度 ${tree.height}：找任何一個鍵都只經過 ${tree.height} 個節點。` : query.kind === 'search'
        ? `找 ${query.key}：經過 ${result!.path.length} 個節點（${result!.path.join(' → ')}），${result!.found ? '在葉節點找到' : '葉節點裡沒有，可以確定不存在'}。全表掃描則要看過 ${tree.keyCount} 個鍵。`
        : `範圍 ${query.lo}～${query.hi}：先往下走 ${result!.path.length} 個節點到第一個葉節點，再沿著葉節點鏈走過 ${result!.leaves.length} 個葉節點，找到 ${result!.keys.length} 個鍵（${result!.keys.join('、') || '無'}）。`}</p>
    </div>
  </div>;
}
