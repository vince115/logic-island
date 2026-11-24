'use client';

import { useMemo, useState } from 'react';
import { distinctValues, labelNames, seriesCount } from '@/lib/devops/sampling';
import type { Trace } from '@/lib/devops/traces';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D5: a cardinality calculator. A metric made from the spans (for example a request counter) gets one series per
 * combination of its labels' values, so the most series it can have is the product of each label's distinct values. The
 * learner picks labels from the traces and may add one more with a count of their own (user_id with 50,000 users) to
 * see the product jump. The product is exact (a bigint).
 */

const n0 = (x: number | bigint) => x.toLocaleString('en-US');

export function CardinalityCalculator({ id, traces, initial }: { id: string; traces: readonly Trace[]; initial?: readonly string[] }) {
  const labels = useMemo(() => labelNames(traces).map(name => ({ name, count: distinctValues(traces, name) })), [traces]);
  const [chosen, setChosen] = useState<string[]>(() => [...initial ?? ['service', 'name', 'status']]);
  const [extraName, setExtraName] = useState('user_id');
  const [extraCount, setExtraCount] = useState('');
  const picked = labels.filter(l => chosen.includes(l.name));
  const toggle = (name: string) => setChosen(old => old.includes(name) ? old.filter(x => x !== name) : [...old, name]);
  const countText = extraCount.normalize('NFKC').replace(/[,\s]/g, '');
  const issues = [
    ...countText && !/^[1-9]\d{0,8}$/.test(countText) ? ['「不同值的個數」要填 1 到 999,999,999 的整數。'] : [],
    ...countText && !extraName.trim() ? ['假設的標籤需要名稱。'] : [],
  ];
  const base = seriesCount(picked.map(l => l.count));
  const extra = !issues.length && countText ? { name: extraName.trim(), count: Number(countText) } : undefined;
  const formula = (xs: number[]) => xs.length ? xs.map(n0).join(' × ') : '（沒有標籤）1';
  const aria = { 'aria-invalid': issues.length ? true : undefined, 'aria-describedby': issues.length ? `${id}-card-issues` : undefined } as const;
  return <>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>span 的標籤與不同值的個數（勾選要放進指標的標籤）</caption>
      <thead><tr><th scope="col">計入</th><th scope="col">標籤</th><th scope="col">不同值的個數</th></tr></thead>
      <tbody>{labels.map(l => <tr key={l.name} data-current={chosen.includes(l.name) ? '' : undefined}>
        <td><input type="checkbox" checked={chosen.includes(l.name)} onChange={() => toggle(l.name)} aria-label={`計入標籤 ${l.name}`}/></td>
        <th scope="row">{l.name}</th><td>{n0(l.count)}</td>
      </tr>)}</tbody>
    </table></div>
    <div className={styles.controls}>
      <label htmlFor={`${id}-extra-name`}>假設再加一個標籤：名稱</label>
      <input id={`${id}-extra-name`} className={styles.input} value={extraName} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={e => setExtraName(e.target.value)} {...aria}/>
      <label htmlFor={`${id}-extra-count`}>不同值的個數（空白表示不加）</label>
      <input id={`${id}-extra-count`} className={styles.input} value={extraCount} inputMode="numeric" spellCheck={false} autoComplete="off" placeholder="例如 50000"
        onChange={e => setExtraCount(e.target.value)} {...aria}/>
    </div>
    {issues.length > 0 && <ul id={`${id}-card-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    <p className={styles.facts} aria-live="polite">
      {`可能的序列數（${picked.map(l => l.name).join('、') || '沒有標籤'}）：${formula(picked.map(l => l.count))} = ${n0(base)} 條。`}
      {extra ? `加上 ${extra.name}（${n0(extra.count)} 個值）：${n0(base)} × ${n0(extra.count)} = ${n0(base * BigInt(extra.count))} 條，是原本的 ${n0(extra.count)} 倍。` : ''}
    </p>
  </>;
}
