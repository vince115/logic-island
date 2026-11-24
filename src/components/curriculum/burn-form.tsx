'use client';

import { Fragment } from 'react';
import { burnTenths, burnsAtLeast, factorText, hoursLeftTenths, windowSums } from '@/lib/devops/burn';
import { durationText } from '@/lib/devops/history';
import { BURN_FIELDS, type BurnFieldKey } from '@/lib/devops/slo-check';
import { budgetTimeline, n0, permyriadText, slaCredit, sliText, sliThousandths, tenthsText, type SloEvents, type SloScenario } from '@/lib/devops/slo';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D6: the burn-rate alert's controls (long window, short window, factor), shared by the SLO explorer and the
 * burn-alert exercise (the values are the learner's text, read by src/lib/devops/slo-check.ts; when they cannot be read
 * every control is aria-invalid and points at the role="alert" list), the burn-rate table per window at a bucket, and
 * the SLA credit table with the band the period falls in marked.
 */

export function BurnFields({ id, values, set, invalid, describedBy }: {
  id: string; values: Record<string, string>; set: (key: string, value: string) => void; invalid?: boolean; describedBy?: string;
}) {
  const aria = { 'aria-invalid': invalid ? true : undefined, 'aria-describedby': invalid ? describedBy : undefined } as const;
  return <div className={styles.controls}>
    {(Object.keys(BURN_FIELDS) as BurnFieldKey[]).map(k => <Fragment key={k}>
      <label htmlFor={`${id}-${k}`}>{BURN_FIELDS[k]}</label>
      <input id={`${id}-${k}`} className={styles.input} value={values[k] ?? ''} inputMode={k === 'factor' ? 'decimal' : 'numeric'} spellCheck={false} autoComplete="off"
        placeholder={k === 'long' ? '例如 60' : k === 'short' ? '例如 5' : '例如 14.4'} onChange={e => set(k, e.target.value)} {...aria}/>
    </Fragment>)}
  </div>;
}

/** Each window's bad and total events, error rate, burn rate (and whether it reaches the factor) and hours left at bucket t. */
export function BurnWindowsTable({ s, e, at, windows, factorTenths }: { s: SloScenario; e: SloEvents; at: number; windows: readonly number[]; factorTenths?: number }) {
  const target = s.objective.targetPermyriad, usedUp = budgetTimeline(s, e)[at].remaining <= 0;
  return <div className={styles.tableWrap}><table className={styles.table}>
    <caption>各視窗在這個時段結束時的消耗率（目標 {permyriadText(target)}，允許的壞事件比例 {permyriadText(10000 - target)}）</caption>
    <thead><tr><th scope="col">視窗</th><th scope="col">壞事件</th><th scope="col">全部事件</th><th scope="col">錯誤率</th><th scope="col">消耗率</th><th scope="col">預算還能撐</th></tr></thead>
    <tbody>{windows.map(m => {
      const w = windowSums(s, e, at, m);
      if (!w) return <tr key={m}><th scope="row">{durationText(m)}</th><td colSpan={5}>視窗還沒滿（需要 {m / s.bucketMinutes} 個時段）</td></tr>;
      const hit = factorTenths !== undefined && burnsAtLeast(w, target, factorTenths), h = hoursLeftTenths(s, at, m, e);
      return <tr key={m}><th scope="row">{durationText(m)}</th><td>{n0(w.bad)}</td><td>{n0(w.total)}</td>
        <td>{sliText(w.total ? sliThousandths(w.bad, w.total) : undefined)}</td>
        <td data-bad={hit ? '' : undefined}>{tenthsText(burnTenths(w, target))}{factorTenths === undefined ? '' : hit ? `（≥ ${factorText(factorTenths)}）` : `（< ${factorText(factorTenths)}）`}</td>
        <td>{usedUp ? '已用完' : h === undefined ? '這個速率不會用完' : `${tenthsText(h)} 小時`}</td></tr>;
    })}</tbody>
  </table></div>;
}

/** The SLA's credit bands; the band the SLI over the period falls in is marked. */
export function SlaTable({ s, e }: { s: SloScenario; e: SloEvents }) {
  const sla = s.sla!, good = e.good.reduce((a, b) => a + b, 0), total = e.total.reduce((a, b) => a + b, 0);
  const { band, percent } = slaCredit(sla, good, total), c = sla.credits;
  return <>
    <p className={styles.facts} aria-live="polite">這段期間的可用度（SLI）是 {sliText(sliThousandths(good, total))}；SLA 承諾 {permyriadText(sla.targetPermyriad)}，
      {band < 0 ? '有達到，不需要補償。' : `落在「低於 ${permyriadText(c[band].belowPermyriad)}」這一段，補償帳單的 ${percent}%。`}</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>SLA 的補償表（依整段期間的可用度）</caption>
      <thead><tr><th scope="col">可用度</th><th scope="col">補償</th></tr></thead>
      <tbody>
        <tr data-current={band < 0 ? '' : undefined}><th scope="row">{permyriadText(sla.targetPermyriad)} 以上</th><td>0%{band < 0 ? '（這段期間）' : ''}</td></tr>
        {c.map((x, k) => <tr key={x.belowPermyriad} data-current={band === k ? '' : undefined}>
          <th scope="row">{k + 1 < c.length ? `${permyriadText(c[k + 1].belowPermyriad)} 以上、` : ''}低於 {permyriadText(x.belowPermyriad)}</th>
          <td>{x.creditPercent}%{band === k ? '（這段期間）' : ''}</td></tr>)}
      </tbody>
    </table></div>
  </>;
}
