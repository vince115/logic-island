'use client';

import { useId, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { conditionIssues, conditionText, ruleValueNumber, ruleValueText, SEVERITY_LABEL, STATE_LABEL, type AlertCondition, type AlertResult } from '@/lib/devops/alerts';
import { evaluateOn, seriesOf, type Dashboard } from '@/lib/devops/dashboard';
import { alertPlanAnswer, parseAlertPlan } from '@/lib/devops/dashboard-check';
import { SIGNAL_LABEL, seriesValues } from '@/lib/devops/series';
import type { DashboardExplorer } from '@/lib/devops/types';
import { AlertRuleFields } from './alert-rule-fields';
import { AlertSummary, AlertTables, StateLegend, StateStrip } from './alert-results';
import { SeriesChart, SeriesTable } from './dashboard-chart';
import { IncidentTimeline } from './incident-timeline';
import { Rich } from './rich';
import { Stepper } from './visualizations';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 devops-explorer stage D3 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10), the monitoring-dashboard activity:
 * the dashboard's series as line charts with tables, an alert-rule editor whose evaluation redraws the threshold, the
 * per-minute state strip and the results, a minute stepper that describes the minute (aria-live), and the incident
 * timelines. Everything is computed in the browser from the lesson's data by src/lib/devops; nothing is random.
 */

const ILLUSTRATIVE = '示意資料：由課程撰寫或以固定的種子產生的教學資料，不是任何真實服務或監控產品的數據；告警的規則（等待、觸發、恢復）是本課程自己的模型。';

/** The fields the editor starts with: the lesson's first rule, or a rule on the first series at its maximum. */
function initialFields(d: Dashboard): Record<string, string> {
  if (d.rules?.length) return alertPlanAnswer(d.rules[0]);
  const s = d.series[0];
  return alertPlanAnswer({ series: s.id, op: '>', threshold: Math.max(...seriesValues(s, d.minutes)), forMinutes: 0 });
}

function minuteText(d: Dashboard, t: number, rule: AlertCondition | undefined, r: AlertResult | undefined): string {
  const parts = [`第 ${t} 分鐘：${d.series.map(s => `${s.label} ${seriesValues(s, d.minutes)[t].toLocaleString('en-US')} ${s.unit}`).join('、')}。`];
  if (rule && r) {
    const v = r.values[t];
    parts.push(rule.window ? `規則的值（${rule.window.minutes} 分鐘的視窗）${v ? ruleValueText(v) : '還沒有（視窗未滿）'}，` : '');
    parts.push(`條件${r.holds[t] ? '成立' : '不成立'}，告警狀態：${STATE_LABEL[r.states[t]]}。`);
  }
  const active = (d.incidents ?? []).filter(i => t >= i.start && t < i.end);
  parts.push(active.length ? `事故「${active.map(i => i.label).join('、')}」進行中。` : '沒有進行中的事故。');
  return parts.join('');
}

export function MonitoringDashboardView({ explorer }: { explorer: DashboardExplorer }) {
  const id = useId();
  const d = explorer.dashboard;
  const series = useMemo(() => d.series.map(s => ({ s, values: seriesValues(s, d.minutes) })), [d]);
  const [fields, setFields] = useState(() => initialFields(d));
  const [chosen, setChosen] = useState(d.rules?.length ? d.rules[0].id : '');
  const [minute, setMinute] = useState(0);
  const parsed = parseAlertPlan(fields);
  const issues = parsed.rule ? conditionIssues(parsed.rule, d.series, d.minutes).map(i => i.zh) : parsed.messages;
  const rule = issues.length ? undefined : parsed.rule;
  // At most a few thousand comparisons: evaluated on every render.
  const result = rule ? evaluateOn(d, rule) : undefined;
  const at = Math.min(minute, d.minutes - 1);
  const lessonRule = d.rules?.find(r => r.id === chosen);
  const set = (k: string, v: string) => { setFields(f => ({ ...f, [k]: v })); setChosen(''); };
  const choose = (ruleId: string) => { const r = d.rules?.find(x => x.id === ruleId); setChosen(ruleId); if (r) setFields(alertPlanAnswer(r)); };
  const reset = () => { setFields(initialFields(d)); setChosen(d.rules?.length ? d.rules[0].id : ''); setMinute(0); };
  return <div className={base.example} data-devops-explorer="dashboard">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <p className={styles.facts}>服務「{d.service}」的 {d.minutes} 分鐘（第 0–{d.minutes - 1} 分鐘），每分鐘一個整數值；{series.map(({ s }) => `${s.label}（${SIGNAL_LABEL[s.signal]}）`).join('、')}。
      {d.incidents?.length ? `事故：${d.incidents.map(i => `「${i.label}」第 ${i.start}–${i.end - 1} 分鐘`).join('、')}。` : '這段時間沒有事故。'}</p>
    {series.map(({ s, values }) => <section key={s.id} aria-label={s.label}>
      <p className={styles.chartTitle}>{s.label}（{s.unit}）<small className={base.muted}> {SIGNAL_LABEL[s.signal]}</small></p>
      <SeriesChart series={s} values={values} incidents={d.incidents ?? []} minute={at}
        threshold={rule?.series === s.id ? rule.threshold : undefined}
        overlay={rule?.series === s.id && rule.window && result ? result.values.map(v => v && ruleValueNumber(v)) : undefined}
        overlayLabel={rule?.window ? `${rule.window.minutes} 分鐘的視窗值` : undefined}/>
      <SeriesTable series={s} values={values} minute={at}/>
    </section>)}
    <ul className={styles.legend}>
      <li><span className={`${styles.swatch} ${styles.to}`}/>每分鐘的值</li>
      <li><span className={`${styles.swatch} ${styles.incidentSwatch}`}/>事故期間（底色）</li>
      <li>虛線：告警門檻；細虛線：視窗的平均、最大值或最小值</li>
    </ul>
    <p className={styles.subhead}>告警規則</p>
    {d.rules?.length ? <div className={styles.controls}>
      <label htmlFor={`${id}-rule`}>課程的規則</label>
      <select id={`${id}-rule`} className={styles.select} value={chosen} onChange={e => choose(e.target.value)}>
        {d.rules.map(r => <option key={r.id} value={r.id}>{r.label}（{SEVERITY_LABEL[r.severity]}）</option>)}
        <option value="">自訂（下方的設定）</option>
      </select>
    </div> : null}
    <AlertRuleFields id={id} values={fields} set={set} series={d.series} invalid={issues.length > 0} describedBy={`${id}-issues`}/>
    <div className={base.vizControls}><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>恢復課程的規則</button></div>
    {issues.length > 0 && <ul id={`${id}-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {rule && result && <>
      <div aria-live="polite">
        <p className={styles.facts}><strong>規則</strong>：{conditionText(rule, seriesOf(d, rule.series))}{lessonRule ? `（${lessonRule.label}，${SEVERITY_LABEL[lessonRule.severity]}）` : ''}。</p>
        <AlertSummary result={result}/>
      </div>
      <p className={styles.chartTitle}>告警狀態</p>
      <StateStrip result={result} incidents={d.incidents ?? []} minute={at}/>
      <StateLegend/>
    </>}
    <Stepper at={at} count={d.minutes} set={setMinute} unit="分鐘" label={(m, count) => `第 ${m} 分鐘（共 ${count} 分鐘）`}/>
    <div className={styles.note} aria-live="polite"><p>{minuteText(d, at, rule, result)}</p></div>
    {result && <AlertTables result={result}/>}
    <IncidentTimeline dashboard={d}/>
  </div>;
}
