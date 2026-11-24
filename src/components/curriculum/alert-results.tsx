import { useId } from 'react';
import { STATE_LABEL, type AlertRun, type AlertState } from '@/lib/devops/alerts';
import type { Incident } from '@/lib/devops/incident';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D3: what a rule's evaluation shows: the totals (notifications, false alerts, missed incidents), a per-minute
 * state strip (SVG) with the state changes as a table, and the incidents and firing intervals as tables.
 */

const SW = 600, SH = 44, SL = 40, SR = 8;
const STATE_CLASS: Record<AlertState, string> = { inactive: styles.stInactive, pending: styles.stPending, firing: styles.stFiring, resolved: styles.stResolved };

/** Runs of the same state: [first minute, last minute, state]. */
export function stateRuns(states: readonly AlertState[]): [number, number, AlertState][] {
  const runs: [number, number, AlertState][] = [];
  states.forEach((s, t) => { const last = runs[runs.length - 1]; if (last && last[2] === s) last[1] = t; else runs.push([t, t, s]); });
  return runs;
}
const spanText = (a: number, b: number) => a === b ? `第 ${a} 分鐘` : `第 ${a}–${b} 分鐘`;

export function AlertSummary({ result }: { result: AlertRun }) {
  return <dl className={styles.metrics} aria-label="告警規則的結果">
    <div><dt>通知</dt><dd>{result.notifications} 次<small>每次進入觸發中發一次</small></dd></div>
    <div><dt>誤報</dt><dd>{result.falseAlerts} 次<small>觸發期間沒有和任何事故重疊</small></dd></div>
    <div><dt>偵測到的事故</dt><dd>{result.detected} 個<small>漏掉 {result.missed} 個</small></dd></div>
    <div><dt>觸發中的分鐘</dt><dd>{result.firingMinutes} 分鐘<small>{result.firstFiring === undefined ? '從未觸發' : `第一次在第 ${result.firstFiring} 分鐘`}</small></dd></div>
  </dl>;
}

export function StateStrip({ result, incidents, minute }: { result: AlertRun; incidents: readonly Incident[]; minute: number }) {
  const id = useId();
  const n = result.states.length, w = (SW - SL - SR) / n;
  return <svg className={styles.chart} viewBox={`0 0 ${SW} ${SH}`} role="img" aria-labelledby={`${id}-t`}>
    <title id={`${id}-t`}>{`每分鐘的告警狀態：觸發 ${result.notifications} 次、共 ${result.firingMinutes} 分鐘；上方的橫條是事故的期間。狀態的變化見下方表格`}</title>
    {incidents.map(i => <rect key={i.id} x={SL + i.start * w} y={2} width={(i.end - i.start) * w} height={5} className={styles.failure}/>)}
    {result.states.map((s, t) => <rect key={t} x={SL + t * w} y={10} width={Math.max(0.5, w)} height={26} className={STATE_CLASS[s]} data-state={s}/>)}
    <rect x={SL + minute * w - 0.5} y={8} width={Math.max(1, w) + 1} height={30} className={styles.strip}/>
    <text x={SL - 4} y={27} textAnchor="end" className={styles.tick}>狀態</text>
  </svg>;
}

export function StateLegend() {
  return <ul className={styles.legend}>
    {(Object.keys(STATE_LABEL) as AlertState[]).map(s => <li key={s}><span className={`${styles.swatch} ${STATE_CLASS[s]}`}/>{STATE_LABEL[s]}</li>)}
    <li><span className={`${styles.swatch} ${styles.dropped}`}/>事故期間</li>
  </ul>;
}

/**
 * The incidents, the firing intervals and the state changes as tables. D6 runs the state machine per bucket: with
 * `bucketMinutes` (default 1) every step t is written as the minutes of its bucket.
 */
export function AlertTables({ result, bucketMinutes: b = 1 }: { result: AlertRun; bucketMinutes?: number }) {
  const span = (x: number, y: number) => spanText(x * b, (y + 1) * b - 1);
  return <>
    {result.incidents.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
      <caption>每個事故：第一次觸發與偵測延遲</caption>
      <thead><tr><th scope="col">事故</th><th scope="col">開始</th><th scope="col">第一次觸發</th><th scope="col">偵測延遲</th></tr></thead>
      <tbody>{result.incidents.map(i => <tr key={i.id}><th scope="row">{i.label}</th><td>第 {i.start * b} 分鐘</td>
        <td data-bad={i.detectedAt === undefined ? '' : undefined}>{i.detectedAt === undefined ? '沒有觸發（漏掉）' : `第 ${i.detectedAt * b} 分鐘`}</td>
        <td>{i.delay === undefined ? '—' : `${i.delay * b} 分鐘`}</td></tr>)}</tbody>
    </table></div>}
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>觸發的期間（每一列是一次通知）</caption>
      <thead><tr><th scope="col">#</th><th scope="col">觸發期間</th><th scope="col">對應的事故</th></tr></thead>
      <tbody>{result.intervals.length ? result.intervals.map((iv, k) => <tr key={iv.start}><th scope="row">{k + 1}</th>
        <td>{iv.open ? `第 ${iv.start * b} 分鐘起，到最後仍在觸發` : `${span(iv.start, iv.end - 1)}（第 ${iv.end * b} 分鐘恢復）`}</td>
        <td data-bad={iv.incident ? undefined : ''}>{iv.incident ? result.incidents.find(i => i.id === iv.incident)!.label : '誤報'}</td></tr>)
        : <tr><td colSpan={3}>這條規則沒有觸發。</td></tr>}</tbody>
    </table></div>
    <details className={base.details}><summary>狀態的變化（狀態列的文字版）</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>每段相同狀態的分鐘</caption>
        <thead><tr><th scope="col">分鐘</th><th scope="col">狀態</th></tr></thead>
        <tbody>{stateRuns(result.states).map(([x, y, s]) => <tr key={x}><th scope="row">{span(x, y)}</th><td>{STATE_LABEL[s]}</td></tr>)}</tbody>
      </table></div>
    </details>
  </>;
}
