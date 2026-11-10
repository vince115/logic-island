'use client';

import { useId, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { planRestore, simulateReplication } from '@/lib/ops/sim';
import { checkOpsAnswer, OPS_FIELDS } from '@/lib/ops/check';
import type { BackupExample, OpsExercise, ReplicationExample } from '@/content/curriculum/schema';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1d architecture-diagram activity (DB19): the system drawn as boxes (client, application, primary, replica,
 * backup storage) with the scenario's numbers on its arrows, and the learner's controls: replication mode, lag and
 * failover time; backup failure time and log archiving. Everything below the diagram is computed by src/lib/ops/sim.ts.
 */

/** The architecture: client → app → primary ⇢ replica, primary → backup storage; the replica serves some reads. */
function Topology({ lag, mode, backup }: { lag?: number; mode?: 'async' | 'sync'; backup?: string }) {
  const box = (x: number, y: number, label: string, sub?: string) => <g>
    <rect x={x} y={y} width={120} height={44} rx={6} className={styles.topoBox}/>
    <text x={x + 60} y={y + (sub ? 18 : 26)} textAnchor="middle" className={styles.erName}>{label}</text>
    {sub && <text x={x + 60} y={y + 35} textAnchor="middle" className={styles.erAttr}>{sub}</text>}
  </g>;
  const arrow = (x1: number, y1: number, x2: number, y2: number, label?: string, dashed?: boolean) => <g>
    <path d={`M${x1},${y1} L${x2},${y2}`} className={dashed ? styles.topoDashed : styles.erLine} markerEnd="url(#topo-arrow)"/>
    {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className={styles.erLabel}>{label}</text>}
  </g>;
  return <div className={styles.erScroll}>
    <svg viewBox="0 0 640 200" width={640} height={200} role="img" className={styles.erSvg}
      aria-label={`系統架構：用戶端 → 應用程式 → 主資料庫${mode ? `，${mode === 'async' ? `非同步複寫到複本（延遲 ${lag} 秒）` : '同步複寫到複本'}` : ''}${backup ? `；${backup}` : ''}`}>
      <defs><marker id="topo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className={styles.topoHead}/></marker></defs>
      {box(10, 20, '用戶端')}{box(180, 20, '應用程式')}{box(350, 20, '主資料庫', '讀寫')}
      {mode && box(510, 20, '複本', '唯讀')}{backup && box(350, 140, '備份儲存', backup.length > 10 ? undefined : backup)}
      {arrow(130, 42, 178, 42)}{arrow(300, 42, 348, 42, '寫入')}
      {mode && arrow(470, 42, 508, 42, mode === 'async' ? `${lag}s` : '同步', mode === 'async')}
      {mode && <path d="M240,64 Q400,120 570,66" className={styles.topoDashed} markerEnd="url(#topo-arrow)"/>}
      {mode && <text x={400} y={112} textAnchor="middle" className={styles.erLabel}>部分讀取</text>}
      {backup && arrow(410, 66, 410, 138, '備份')}
    </svg>
  </div>;
}

export function ReplicationExplorer({ example }: { example: ReplicationExample }) {
  const id = useId(), base0 = example.scenario;
  const [mode, setMode] = useState(base0.mode);
  const [lag, setLag] = useState(base0.lag);
  const [failover, setFailover] = useState(base0.failoverAt !== undefined);
  const scenario = { ...base0, mode, lag, ...(failover ? {} : { failoverAt: undefined }) };
  const r = simulateReplication(scenario);
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <Topology lag={lag} mode={mode}/>
      <div className={styles.row}>
        <label htmlFor={`${id}-mode`}>複寫方式</label>
        <select id={`${id}-mode`} value={mode} onChange={e => setMode(e.target.value as 'async' | 'sync')}><option value="async">非同步</option><option value="sync">同步</option></select>
        <label htmlFor={`${id}-lag`}>延遲（秒）</label>
        <input id={`${id}-lag`} type="range" min={0} max={10} value={lag} onChange={e => setLag(Number(e.target.value))} disabled={mode === 'sync'} aria-valuetext={`${lag} 秒`}/>
        <span>{mode === 'sync' ? '同步：提交要等複本收到' : `${lag} 秒`}</span>
        {base0.failoverAt !== undefined && <label><input type="checkbox" checked={failover} onChange={e => setFailover(e.target.checked)}/>第 {base0.failoverAt} 秒主機故障、切換到複本</label>}
        <button type="button" onClick={() => { setMode(base0.mode); setLag(base0.lag); setFailover(base0.failoverAt !== undefined); }}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      <p className={styles.help}>寫入：{base0.writes.map(w => `第 ${w.at} 秒 ${w.key} = ${w.value}`).join('；')}（初始 {Object.entries(base0.initial).map(([k, v]) => `${k} = ${v}`).join('、')}）</p>
      <div className={styles.tableScroll} aria-live="polite"><table className={styles.timeline}>
        <thead><tr><th scope="col">讀取</th><th scope="col">時間</th><th scope="col">讀哪裡</th><th scope="col">讀到</th><th scope="col">主機上的值</th></tr></thead>
        <tbody>{r.reads.map(x => <tr key={x.label}><th scope="row">{x.label}</th><td>{x.at}s</td><td>{x.from === 'primary' ? '主資料庫' : '複本'}</td>
          <td data-result={x.stale ? 'wait' : undefined}>{x.key} = {x.value}{x.stale ? '（過時）' : ''}</td><td>{x.primaryValue}</td></tr>)}</tbody>
      </table></div>
      {r.afterFailover && <p className={styles.row} aria-live="polite">切換後的新主機：{Object.entries(r.afterFailover).map(([k, v]) => `${k} = ${v}`).join('、')}；
        {r.lost.length ? `遺失 ${r.lost.length} 筆已提交的寫入（${r.lost.map(w => `第 ${w.at} 秒 ${w.key} = ${w.value}`).join('；')}）` : '沒有遺失已提交的寫入'}</p>}
    </div>
  </div>;
}

export function BackupPlanner({ example }: { example: BackupExample }) {
  const id = useId();
  const [failureAt, setFailureAt] = useState(example.failureAt);
  const [logs, setLogs] = useState(!!example.plan.logEvery);
  const logEvery = example.plan.logEvery ?? 5;
  const plan = { ...example.plan, ...(logs ? { logEvery } : { logEvery: undefined }) };
  const r = planRestore(plan, failureAt);
  const end = Math.max(...example.plan.fullAt, ...example.plan.incrementalAt, example.failureAt) + 120;
  const at = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <Topology backup={logs ? `完整＋增量＋日誌（每 ${logEvery} 分）` : '完整＋增量'}/>
      <div className={styles.row}>
        <label htmlFor={`${id}-fail`}>故障時間</label>
        <input id={`${id}-fail`} type="range" min={0} max={end} value={failureAt} onChange={e => setFailureAt(Number(e.target.value))} aria-valuetext={at(failureAt)}/>
        <span>{at(failureAt)}（第 {failureAt} 分鐘）</span>
        <label><input type="checkbox" checked={logs} onChange={e => setLogs(e.target.checked)}/>持續封存日誌（每 {logEvery} 分鐘）</label>
        <button type="button" onClick={() => { setFailureAt(example.failureAt); setLogs(!!example.plan.logEvery); }}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      <p className={styles.help}>完整備份：{example.plan.fullAt.map(at).join('、')}；增量備份：{example.plan.incrementalAt.map(at).join('、') || '無'}</p>
      <div aria-live="polite">{r ? <div className={styles.stateGrid}>
        <div><strong>還原步驟</strong><br/>{r.steps.map(s => s.kind === 'log' ? `重播日誌 ${at(s.from)}～${at(s.to)}` : `${s.kind === 'full' ? '完整備份' : '增量備份'} ${at(s.at)}`).join(' → ')}</div>
        <div><strong>能還原到</strong><br/>{at(r.recoveryPoint)}；遺失 {r.dataLoss} 分鐘的資料（實際 RPO）</div>
        <div><strong>還原時間估計</strong><br/>約 {r.restoreMinutes} 分鐘（RTO 還要加上偵測故障與切換的時間）</div>
      </div> : <p className={styles.feedback}>故障前還沒有任何完整備份：無法還原。</p>}</div>
    </div>
  </div>;
}

export function OpsExerciseBox({ exercise }: { exercise: OpsExercise }) {
  const fields = OPS_FIELDS[exercise.task];
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; messages: string[] }>();
  const check = () => setResult(checkOpsAnswer(exercise, Object.fromEntries(Object.keys(fields).map(k => [k, values[k]?.trim() ? Number(values[k]) : NaN]))));
  return <div className={styles.builder}>
    <div className={styles.row}>{Object.entries(fields).map(([k, label]) => <label key={k}>{label}
      <input className={styles.numInput} inputMode="numeric" value={values[k] ?? ''} onChange={e => { setValues(v => ({ ...v, [k]: e.target.value })); setResult(undefined); }}/></label>)}</div>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={check}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={() => { setValues({}); setResult(undefined); }}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={styles.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={styles.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
    </>}</div>
  </div>;
}
