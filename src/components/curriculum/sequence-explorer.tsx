'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { SqlSession, TimeoutError } from '@/lib/sql/client';
import type { SequenceRun } from '@/lib/sql/sequence';
import type { SequenceExample } from '@/content/curriculum/schema';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1d protocol-sequence activity (DB16): the round trips between the application and the database for one task,
 * one strategy at a time (N+1 lazy loading, one JOIN, a batched IN). The SQL really runs in the browser's SQLite (a Web
 * Worker, a fresh copy of the dataset per run), so the number of round trips and rows shown are measured.
 */

const show = (v: unknown) => v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v);

export function SequenceExplorer({ example }: { example: SequenceExample }) {
  const session = useRef<SqlSession | null>(null);
  useEffect(() => () => session.current?.dispose(), []);
  const [chosen, setChosen] = useState<number>();
  const [runs, setRuns] = useState<Record<number, SequenceRun & { elapsedMs: number }>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function run(i: number) {
    setChosen(i); setProblem('');
    if (runs[i]) return;
    setBusy(true);
    try {
      const r = await (session.current ??= new SqlSession()).sequence(example.dataset, example.strategies[i]);
      setRuns(all => ({ ...all, [i]: r }));
    } catch (e) { setProblem(e instanceof TimeoutError ? '執行逾時，已停止。' : `無法執行：${String(e)}`); }
    finally { setBusy(false); }
  }
  const current = chosen !== undefined ? runs[chosen] : undefined;
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <div className={base.vizControls} role="group" aria-label="資料存取的做法">
        {example.strategies.map((s, i) => <button key={s.label} type="button" className={chosen === i ? base.primaryButton : undefined} aria-pressed={chosen === i}
          onClick={() => run(i)} disabled={busy}><Play size={14} aria-hidden/>{s.label}</button>)}
        <button type="button" onClick={() => { setChosen(undefined); setRuns({}); setProblem(''); }}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      {Object.keys(runs).length > 1 && <p className={styles.help}>已執行的做法：{Object.entries(runs).map(([i, r]) => `${example.strategies[Number(i)].label} ${r.trips.length} 次往返、共 ${r.rows} 列`).join('；')}</p>}
      <div aria-live="polite">
        {problem && <p className={styles.feedback}>{problem}</p>}
        {chosen !== undefined && current && <>
          <p className={styles.row}><strong>{example.strategies[chosen].label}</strong>：{current.trips.length} 次往返（應用程式 ↔ 資料庫），共取回 {current.rows} 列。</p>
          <p className={base.muted}><Rich text={example.strategies[chosen].note}/></p>
          <ol className={styles.sequence} aria-label={`${example.strategies[chosen].label} 的往返`}>{current.trips.map((t, i) => <li key={i}>
            <span className={styles.seqArrow}>應用程式 → 資料庫</span><code>{t.sql}</code>{t.params.length > 0 && <span className={styles.help}>參數：{t.params.map(show).join(', ')}</span>}
            <span className={styles.seqArrow}>資料庫 → 應用程式</span><span>{'error' in t.result ? `錯誤：${t.result.error}` : `${t.result.rows.length} 列`}</span>
          </li>)}</ol>
          <p className={styles.help}>在你的瀏覽器裡約 {Math.round(current.elapsedMs)} 毫秒（同一台電腦的記憶體資料庫；真正的應用程式每次往返還要加上網路延遲）。</p>
        </>}
      </div>
    </div>
  </div>;
}
