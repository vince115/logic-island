'use client';

import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { evaluateSampling, percentText, type SamplingResult } from '@/lib/devops/sampling';
import { parseSamplingPlan, SAMPLING_FIELDS, samplingAnswer } from '@/lib/devops/sampling-check';
import { nearestRank } from '@/lib/devops/trace-query';
import type { Trace } from '@/lib/devops/traces';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D5: the sampling controls (head ratio, tail on or off, keep errors, keep slower than, the rest's ratio), shared
 * by the trace explorer and the sampling-plan exercise, and the results table. The values are the learner's text
 * (src/lib/devops/sampling-check.ts reads them); when they cannot be read the controls are aria-invalid and point at a
 * role="alert" list, and no results are shown.
 */

const n0 = (x: number) => x.toLocaleString('en-US');
const share = (k: number, n: number) => n ? `${percentText(Math.round(k * 1000 / n))}%` : '—';

export function SamplingFields({ id, values, set, invalid, describedBy }: {
  id: string; values: Record<string, string>; set: (key: string, value: string) => void; invalid?: boolean; describedBy?: string;
}) {
  const aria = { 'aria-invalid': invalid ? true : undefined, 'aria-describedby': invalid ? describedBy : undefined } as const;
  const off = (values.tail ?? 'off') !== 'on';
  const input = (k: 'head' | 'slower' | 'rest', placeholder: string, disabled = false) => <input id={`${id}-${k}`} className={styles.input} value={disabled ? '' : values[k] ?? ''}
    disabled={disabled} inputMode="decimal" spellCheck={false} autoComplete="off" placeholder={disabled ? '不用尾端取樣' : placeholder} onChange={e => set(k, e.target.value)} {...aria}/>;
  return <div className={styles.controls}>
    <label htmlFor={`${id}-head`}>{SAMPLING_FIELDS.head}</label>{input('head', '例如 10 或 0.5')}
    <label htmlFor={`${id}-tail`}>{SAMPLING_FIELDS.tail}</label>
    <select id={`${id}-tail`} className={styles.select} value={off ? 'off' : 'on'} onChange={e => set('tail', e.target.value)}>
      <option value="off">不用（只有頭部取樣）</option><option value="on">使用（在追蹤完成後再決定）</option>
    </select>
    <label htmlFor={`${id}-errors`}>{SAMPLING_FIELDS.errors}</label>
    <select id={`${id}-errors`} className={styles.select} value={off ? 'no' : values.errors ?? 'no'} disabled={off} onChange={e => set('errors', e.target.value)}>
      <option value="no">不特別保留</option><option value="yes">全部保留</option>
    </select>
    <label htmlFor={`${id}-slower`}>{SAMPLING_FIELDS.slower}</label>{input('slower', '例如 1000', off)}
    <label htmlFor={`${id}-rest`}>{SAMPLING_FIELDS.rest}</label>{input('rest', '例如 5', off)}
  </div>;
}

/** How many traces, error traces, slow traces and spans the policy keeps, and why. */
export function SamplingResults({ result, caption, tail: tailUsed }: { result: SamplingResult; caption: string; tail: boolean }) {
  const r = result, d = r.decisions;
  const headDropped = d.filter(x => !x.head).length, tail = d.filter(x => x.head && x.tail !== undefined);
  const why = (k: string) => tail.filter(x => x.tail === k).length;
  return <>
    <p className={styles.facts} aria-live="polite">{`保留 ${n0(r.kept)}／${n0(r.traces)} 個追蹤（${share(r.kept, r.traces)}），有錯誤的 ${n0(r.keptErrors)}／${n0(r.errorTraces)} 個`}
      {r.slow ? `，慢於 ${n0(r.slow.threshold)} ms 的 ${n0(r.slow.kept)}／${n0(r.slow.total)} 個` : ''}
      {r.keptSpansPerDay !== undefined ? `；估計每天保留 ${n0(r.keptSpansPerDay)} 個 span。` : '。'}</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>{caption}</caption>
      <thead><tr><th scope="col">項目</th><th scope="col">全部</th><th scope="col">保留</th><th scope="col">保留的比例</th></tr></thead>
      <tbody>
        <tr><th scope="row">追蹤</th><td>{n0(r.traces)}</td><td>{n0(r.kept)}</td><td>{share(r.kept, r.traces)}</td></tr>
        <tr><th scope="row">有錯誤的追蹤</th><td>{n0(r.errorTraces)}</td><td data-bad={r.keptErrors < r.errorTraces ? '' : undefined}>{n0(r.keptErrors)}</td><td>{share(r.keptErrors, r.errorTraces)}</td></tr>
        {r.slow && <tr><th scope="row">慢於 {n0(r.slow.threshold)} ms 的追蹤</th><td>{n0(r.slow.total)}</td><td data-bad={r.slow.kept < r.slow.total ? '' : undefined}>{n0(r.slow.kept)}</td><td>{share(r.slow.kept, r.slow.total)}</td></tr>}
        <tr><th scope="row">span</th><td>{n0(r.spans)}</td><td>{n0(r.keptSpans)}</td><td>{share(r.keptSpans, r.spans)}</td></tr>
        {r.spansPerDay !== undefined && <tr><th scope="row">每天的 span（估計）</th><td>{n0(r.spansPerDay)}</td><td>{n0(r.keptSpansPerDay!)}</td><td>{share(r.keptSpans, r.spans)}</td></tr>}
      </tbody>
    </table></div>
    <p className={styles.facts}>{`頭部取樣丟掉 ${n0(headDropped)} 個追蹤`}{tailUsed
      ? `；尾端取樣在頭部留下的 ${n0(d.length - headDropped)} 個之中，因為有錯誤保留 ${n0(why('error'))} 個、因為慢保留 ${n0(why('slow'))} 個、依比例保留 ${n0(why('ratio'))} 個，丟掉 ${n0(d.length - headDropped - tail.length)} 個。`
      : '；沒有尾端取樣。'}</p>
  </>;
}

/** The explorer's sampling panel: the controls, a threshold that counts as slow, and the results on the trace set. */
export function SamplingExplorer({ id, traces, perDay }: { id: string; traces: readonly Trace[]; perDay?: number }) {
  const initial = useMemo(() => ({ ...samplingAnswer({ headPermille: 100 }), watch: String(nearestRank(traces.map(t => t.duration), 95)) }), [traces]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const set = (k: string, v: string) => setValues(old => ({ ...old, [k]: v }));
  const { policy, messages } = parseSamplingPlan(values);
  const watch = values.watch?.normalize('NFKC').trim().replace(/(?:ms|毫秒)$/i, '').trim() ?? '';
  const watchOk = /^\d+$/.test(watch);
  const issues = [...messages, ...watchOk ? [] : ['「列為慢的門檻」要填整數的毫秒數。']];
  const result = policy && watchOk ? evaluateSampling(traces, policy, perDay, Number(watch)) : undefined;
  return <>
    <SamplingFields id={id} values={values} set={set} invalid={messages.length > 0} describedBy={`${id}-sampling-issues`}/>
    <div className={styles.controls}>
      <label htmlFor={`${id}-watch`}>列為慢的門檻（ms，預設是 p95）</label>
      <input id={`${id}-watch`} className={styles.input} value={values.watch ?? ''} inputMode="numeric" spellCheck={false} autoComplete="off" onChange={e => set('watch', e.target.value)}
        aria-invalid={watchOk ? undefined : true} aria-describedby={watchOk ? undefined : `${id}-sampling-issues`}/>
    </div>
    <div className={base.vizControls}><button type="button" onClick={() => setValues(initial)}><RotateCcw size={14} aria-hidden/>恢復預設（頭部 10%）</button></div>
    {issues.length > 0 && <ul id={`${id}-sampling-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {result && <SamplingResults result={result} caption="取樣的結果（課程的追蹤）" tail={!!policy?.tail}/>}
  </>;
}
