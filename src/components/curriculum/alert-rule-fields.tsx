'use client';

import { ALERT_OPS } from '@/lib/devops/alerts';
import { AGG_CHOICES, ALERT_FIELDS } from '@/lib/devops/dashboard-check';
import type { MetricSeries } from '@/lib/devops/series';
import { SIGNAL_LABEL } from '@/lib/devops/series';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D3: the controls of an alert rule (series, comparison, threshold, window, for), shared by the dashboard
 * explorer and the alert-rule exercise. The values are the learner's text (src/lib/devops/dashboard-check.ts reads
 * them); every control is a labelled form control, and `invalid` marks them all with aria-invalid and points at the
 * error list.
 */

const OP_TEXT: Record<string, string> = { '>': '> 大於', '>=': '>= 大於或等於', '<': '< 小於', '<=': '<= 小於或等於' };

export function AlertRuleFields({ id, values, set, series, invalid, describedBy }: {
  id: string; values: Record<string, string>; set: (key: string, value: string) => void; series: readonly MetricSeries[];
  invalid?: boolean; describedBy?: string;
}) {
  const aria = { 'aria-invalid': invalid ? true : undefined, 'aria-describedby': invalid ? describedBy : undefined } as const;
  const windowOff = (values.agg ?? 'none') === 'none';
  return <div className={styles.controls}>
    <label htmlFor={`${id}-series`}>{ALERT_FIELDS.series}</label>
    <select id={`${id}-series`} className={styles.select} value={values.series ?? ''} onChange={e => set('series', e.target.value)} {...aria}>
      <option value="">（請選擇）</option>
      {series.map(s => <option key={s.id} value={s.id}>{s.label}（{s.unit}，{SIGNAL_LABEL[s.signal]}）</option>)}
    </select>
    <label htmlFor={`${id}-op`}>{ALERT_FIELDS.op}</label>
    <select id={`${id}-op`} className={styles.select} value={values.op ?? ''} onChange={e => set('op', e.target.value)} {...aria}>
      <option value="">（請選擇）</option>
      {ALERT_OPS.map(op => <option key={op} value={op}>{OP_TEXT[op]}</option>)}
    </select>
    <label htmlFor={`${id}-threshold`}>{ALERT_FIELDS.threshold}</label>
    <input id={`${id}-threshold`} className={styles.input} value={values.threshold ?? ''} inputMode="numeric" spellCheck={false} autoComplete="off"
      onChange={e => set('threshold', e.target.value)} {...aria}/>
    <label htmlFor={`${id}-agg`}>{ALERT_FIELDS.agg}</label>
    <select id={`${id}-agg`} className={styles.select} value={values.agg ?? 'none'} onChange={e => set('agg', e.target.value)} {...aria}>
      {Object.entries(AGG_CHOICES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
    <label htmlFor={`${id}-window`}>{ALERT_FIELDS.window}</label>
    <input id={`${id}-window`} className={styles.input} value={windowOff ? '' : values.window ?? ''} disabled={windowOff} inputMode="numeric" spellCheck={false}
      autoComplete="off" placeholder={windowOff ? '不用視窗' : undefined} onChange={e => set('window', e.target.value)} {...aria}/>
    <label htmlFor={`${id}-for`}>{ALERT_FIELDS.for}</label>
    <input id={`${id}-for`} className={styles.input} value={values.for ?? ''} inputMode="numeric" spellCheck={false} autoComplete="off"
      onChange={e => set('for', e.target.value)} {...aria}/>
  </div>;
}
