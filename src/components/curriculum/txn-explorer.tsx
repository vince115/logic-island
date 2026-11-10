'use client';

import { useId, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw, X, Zap } from 'lucide-react';
import { recoverAfter, runTimeline, type LogRecord } from '@/lib/txn/recovery';
import { ANOMALIES, ANOMALY_TEXT, describeOp, MODEL_LEVELS, runSchedule, type Anomaly, type Level, type Model } from '@/lib/txn/schedule';
import { checkTxAnswer, expectedAnswer, type TxAnswer } from '@/lib/txn/check';
import type { ScheduleExample, TimelineExample, TxExercise } from '@/content/curriculum/schema';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1c transaction-timeline activity (DB14, DB15). Everything shown is computed by src/lib/txn: the learner steps
 * through a timeline (and can crash it after any step), or runs an interleaved schedule under a chosen model and
 * isolation level. Exercises compare the learner's answer with the engines' result. Nothing is saved or sent.
 */

const values = (v: Record<string, number>) => Object.entries(v).map(([k, n]) => `${k} = ${n}`).join('，');
const logText = (r: LogRecord) => r.kind === 'update' ? `T${r.tx} ${r.item}: ${r.before} → ${r.after}` : `${r.kind === 'begin' ? 'BEGIN' : r.kind === 'commit' ? 'COMMIT' : 'ABORT'} T${r.tx}`;
export const MODEL_TEXT: Record<Model, string> = { locking: '鎖（嚴格兩階段鎖）', mvcc: 'MVCC 快照（PostgreSQL 式）' };

/** DB14: one session's steps with the write-ahead log; crash after any step and see what recovery keeps. */
export function TimelineExplorer({ example }: { example: TimelineExample }) {
  const states = runTimeline(example.script);
  const [at, setAt] = useState(0);
  const [crashed, setCrashed] = useState<number>();
  const state = states[at], recovery = crashed !== undefined ? recoverAfter(example.script, crashed) : undefined;
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <div className={styles.tableScroll}><table className={styles.timeline}>
        <caption className={base.muted}>時間軸（目前在第 {at} 步）</caption>
        <thead><tr><th scope="col">步</th><th scope="col">敘述與結果</th></tr></thead>
        <tbody>{states.slice(1).map(s => <tr key={s.step} data-current={s.step === at} data-future={s.step > at}>
          <th scope="row">{s.step}</th><td data-result={s.outcome}>{s.text}</td></tr>)}</tbody>
      </table></div>
      <div className={base.vizControls}>
        <button type="button" onClick={() => { setAt(a => Math.max(0, a - 1)); setCrashed(undefined); }} disabled={at === 0}><ChevronLeft size={14} aria-hidden/>上一步</button>
        <button type="button" onClick={() => { setAt(a => Math.min(states.length - 1, a + 1)); setCrashed(undefined); }} disabled={at === states.length - 1}>下一步<ChevronRight size={14} aria-hidden/></button>
        <button type="button" className={base.primaryButton} onClick={() => setCrashed(at)}><Zap size={14} aria-hidden/>在第 {at} 步之後當機</button>
        <button type="button" onClick={() => { setAt(0); setCrashed(undefined); }}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      <div className={styles.stateGrid} aria-live="polite">
        <div><strong>其他連線看到的（已提交）</strong><br/>{values(state.committed)}</div>
        <div><strong>交易內的值</strong><br/>{state.working ? `T${state.open}：${values(state.working)}` : '沒有進行中的交易'}</div>
        <div><strong>日誌（先寫日誌，再改資料）</strong><br/>{state.log.length ? state.log.map(logText).join('；') : '（空）'}</div>
        {recovery && <div><strong>當機後復原</strong><br/>重做：{recovery.redone.map(t => `T${t}`).join('、') || '無'}；捨棄：{recovery.discarded.map(t => `T${t}`).join('、') || '無'}<br/>復原後：{values(recovery.state)}</div>}
      </div>
    </div>
  </div>;
}

/** DB15: two transactions interleaved; switch the model and level and step through what happens. */
export function ScheduleExplorer({ example }: { example: ScheduleExample }) {
  const id = useId();
  const [model, setModel] = useState<Model>(example.model);
  const [level, setLevel] = useState<Level>(example.level);
  const [shown, setShown] = useState(Infinity);
  const result = runSchedule(example.schedule, model, MODEL_LEVELS[model].includes(level) ? level : MODEL_LEVELS[model].at(-1)!);
  const txNames = [...new Set(example.schedule.steps.map(s => s.tx))];
  const upTo = Math.min(shown, result.events.length);
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <div className={styles.builder}>
      <div className={styles.row}>
        <label htmlFor={`${id}-model`}>並行控制</label>
        <select id={`${id}-model`} value={model} onChange={e => { const m = e.target.value as Model; setModel(m); if (!MODEL_LEVELS[m].includes(level)) setLevel(MODEL_LEVELS[m][MODEL_LEVELS[m].length - 1]); setShown(Infinity); }}>
          {(Object.keys(MODEL_TEXT) as Model[]).map(m => <option key={m} value={m}>{MODEL_TEXT[m]}</option>)}
        </select>
        <label htmlFor={`${id}-level`}>隔離等級</label>
        <select id={`${id}-level`} value={level} onChange={e => { setLevel(e.target.value as Level); setShown(Infinity); }}>
          {MODEL_LEVELS[model].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <p className={styles.help}>排程（交錯的順序）：{example.schedule.steps.map(s => `${s.tx} ${describeOp(s)}`).join(' → ')}；初始值：{values(example.schedule.items)}</p>
      <div className={styles.tableScroll}><table className={styles.timeline}>
        <caption className={base.muted}>實際執行（等待的步驟會晚一點才執行）</caption>
        <thead><tr><th scope="col">時間</th>{txNames.map(t => <th key={t} scope="col">{t}</th>)}</tr></thead>
        <tbody>{result.events.map((e, i) => <tr key={i} data-current={i === upTo - 1} data-future={i >= upTo}>
          <th scope="row">{e.time}</th>{txNames.map(t => <td key={t} data-result={t === e.tx ? e.result : undefined}>{t === e.tx ? e.text : ''}</td>)}</tr>)}</tbody>
      </table></div>
      <div className={base.vizControls}>
        <button type="button" onClick={() => setShown(Math.max(1, upTo - 1))} disabled={upTo <= 1}><ChevronLeft size={14} aria-hidden/>上一步</button>
        <button type="button" onClick={() => setShown(upTo + 1)} disabled={upTo >= result.events.length}>下一步<ChevronRight size={14} aria-hidden/></button>
        <button type="button" onClick={() => setShown(Infinity)}>顯示全部</button>
        <button type="button" onClick={() => { setModel(example.model); setLevel(example.level); setShown(Infinity); }}><RotateCcw size={14} aria-hidden/>重設</button>
      </div>
      {upTo >= result.events.length && <div className={styles.stateGrid} aria-live="polite">
        <div><strong>結果</strong><br/>{Object.entries(result.outcome).map(([t, o]) => `${t} ${o === 'committed' ? '已提交' : o === 'aborted' ? '已中止' : '未結束'}`).join('，')}<br/>最後的值：{values(result.final)}</div>
        <div><strong>發生的異常</strong><br/>{result.anomalies.length ? result.anomalies.map(a => `${ANOMALY_TEXT[a.kind]}：${a.text}`).join('；') : '沒有'}</div>
      </div>}
    </div>
  </div>;
}

/** A transaction exercise: enter values, pick anomalies or a level; checked against the engines' result. */
export function TxExerciseBox({ exercise }: { exercise: TxExercise }) {
  const id = useId();
  const expected = expectedAnswer(exercise);
  const items = exercise.task === 'recovery' || exercise.task === 'final' ? Object.keys(expected as Record<string, number>) : [];
  const [nums, setNums] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Anomaly[]>([]);
  const [level, setLevel] = useState<string>('');
  const [result, setResult] = useState<{ ok: boolean; messages: string[] }>();
  const answer = (): TxAnswer => exercise.task === 'anomalies' ? picked
    : exercise.task === 'level' ? (level as Level | 'none')
    : Object.fromEntries(items.map(k => [k, nums[k]?.trim() === '' || nums[k] === undefined ? NaN : Number(nums[k])]));
  const reset = () => { setNums({}); setPicked([]); setLevel(''); setResult(undefined); };
  return <div className={styles.builder}>
    {items.length > 0 && <div className={styles.row}>{items.map(k => <label key={k}>{k} =
      <input className={styles.numInput} inputMode="numeric" value={nums[k] ?? ''} onChange={e => { setNums(n => ({ ...n, [k]: e.target.value })); setResult(undefined); }} aria-label={`${k} 的值`}/></label>)}</div>}
    {exercise.task === 'anomalies' && <fieldset className={styles.picker}><legend>會發生哪些異常？（可複選；都沒有就不勾）</legend>
      {ANOMALIES.map(a => <label key={a}><input type="checkbox" checked={picked.includes(a)} onChange={e => { setPicked(p => e.target.checked ? [...p, a] : p.filter(x => x !== a)); setResult(undefined); }}/>{ANOMALY_TEXT[a]}</label>)}
    </fieldset>}
    {exercise.task === 'level' && <div className={styles.row}>
      <label htmlFor={`${id}-level`}>最弱、但足夠的隔離等級（{MODEL_TEXT[exercise.model]}）</label>
      <select id={`${id}-level`} value={level} onChange={e => { setLevel(e.target.value); setResult(undefined); }}>
        <option value="">請選擇</option>{MODEL_LEVELS[exercise.model].map(l => <option key={l} value={l}>{l}</option>)}<option value="none">都擋不住</option>
      </select>
    </div>}
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={() => setResult(checkTxAnswer(exercise, answer()))}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={styles.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={styles.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
    </>}</div>
  </div>;
}
