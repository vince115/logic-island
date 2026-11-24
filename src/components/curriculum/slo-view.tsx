'use client';

import { useId, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { STATE_LABEL, SEVERITY_LABEL } from '@/lib/devops/alerts';
import { burnConditionText, burnTenths, evaluateBurn, windowSums, type BurnResult } from '@/lib/devops/burn';
import { durationText } from '@/lib/devops/history';
import { budgetEvents, budgetTimeline, burnIssues, meetsTarget, n0, periodMinutes, permyriadText, sliText, sliThousandths, sloEvents, sumOf, tenthsText,
  windowTotalOf, type BurnCondition, type SloScenario } from '@/lib/devops/slo';
import { burnAnswer, inMinutes, parseBurnPlan } from '@/lib/devops/slo-check';
import type { SloExplorer } from '@/lib/devops/types';
import { AlertSummary, AlertTables, StateLegend, StateStrip } from './alert-results';
import { BucketTable, BudgetChart, bucketText, SliChart } from './budget-chart';
import { BurnFields, BurnWindowsTable, SlaTable } from './burn-form';
import { Rich } from './rich';
import { Stepper } from './visualizations';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 devops-explorer stage D6 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.6), part of the monitoring-dashboard
 * activity: an SLO's facts and error budget, each bucket's SLI against the objective and the remaining budget (SVG with
 * one table of the same numbers), a bucket stepper that describes the bucket (aria-live), the burn rate per window at the
 * selected bucket, a burn-rate alert form whose evaluation reuses D3's state strip and tables, and the SLA credit table.
 * Everything is computed in the browser from the lesson's data by src/lib/devops; nothing is random.
 */

const ILLUSTRATIVE = '示意資料：由課程撰寫或以固定的種子產生的教學資料，不是任何真實服務或監控產品的數據；SLI、錯誤預算與消耗率告警的算法是本課程自己的模型。';
const DEFAULT_ALERT: BurnCondition = { longMinutes: 60, shortMinutes: 5, factorTenths: 144 };

/** The fields the form starts with: the scenario's first alert, or 1 h / 5 min at 14.4 (whole buckets: 1 h / 1 h on hourly data). */
function initialFields(s: SloScenario): Record<string, string> {
  if (s.alerts?.length) return burnAnswer(s.alerts[0]);
  const fit = (m: number) => Math.min(periodMinutes(s), Math.max(s.bucketMinutes, m));
  return burnAnswer({ ...DEFAULT_ALERT, longMinutes: fit(60), shortMinutes: fit(5) });
}

function bucketSummary(s: SloScenario, t: number, e: ReturnType<typeof sloEvents>, rows: ReturnType<typeof budgetTimeline>, rule?: BurnCondition, r?: BurnResult): string {
  const parts = [`${bucketText(s, t)}：全部 ${n0(e.total[t])} 個事件、好的 ${n0(e.good[t])} 個、壞的 ${n0(e.bad[t])} 個，SLI ${sliText(sliThousandths(e.good[t], e.total[t]))}。`,
    `到這裡累計 ${n0(rows[t].consumed)} 個壞事件，用掉預算的 ${tenthsText(rows[t].consumedTenths)}%，剩 ${tenthsText(rows[t].remainingTenths)}%。`];
  if (rule && r) {
    const rate = (m: number) => { const w = windowSums(s, e, t, m); return w ? tenthsText(burnTenths(w, s.objective.targetPermyriad)) : '（視窗未滿）'; };
    parts.push(`消耗率：${durationText(rule.longMinutes)} ${rate(rule.longMinutes)}、${durationText(rule.shortMinutes)} ${rate(rule.shortMinutes)}；告警狀態：${STATE_LABEL[r.states[t]]}。`);
  }
  const active = (s.incidents ?? []).filter(i => t >= i.start && t < i.end);
  parts.push(active.length ? `事故「${active.map(i => i.label).join('、')}」進行中。` : '沒有進行中的事故。');
  return parts.join('');
}

export function SloExplorerView({ explorer }: { explorer: SloExplorer }) {
  const id = useId();
  const s = explorer.slo, o = s.objective;
  const e = useMemo(() => sloEvents(s), [s]);
  const rows = useMemo(() => budgetTimeline(s, e), [s, e]);
  const [fields, setFields] = useState(() => initialFields(s));
  const [chosen, setChosen] = useState(s.alerts?.length ? s.alerts[0].id : '');
  const [bucket, setBucket] = useState(0);
  const parsed = parseBurnPlan(fields);
  const issues = parsed.condition ? burnIssues(parsed.condition, s).map(i => i.zh) : parsed.messages;
  const rule = issues.length ? undefined : parsed.condition;
  const result = rule ? evaluateBurn(s, rule, e) : undefined;
  const at = Math.min(bucket, s.buckets - 1);
  const lessonRule = s.alerts?.find(r => r.id === chosen);
  const set = (k: string, v: string) => { setFields(f => ({ ...f, [k]: v })); setChosen(''); };
  const choose = (ruleId: string) => { const r = s.alerts?.find(x => x.id === ruleId); setChosen(ruleId); if (r) setFields(burnAnswer(r)); };
  const reset = () => { setFields(initialFields(s)); setChosen(s.alerts?.length ? s.alerts[0].id : ''); setBucket(0); };
  const total = sumOf(e.total), good = sumOf(e.good), budget = budgetEvents(s, e), end = rows[rows.length - 1];
  const windows = [...new Set([...(s.alerts ?? []).flatMap(r => [r.longMinutes, r.shortMinutes]), ...rule ? [rule.longMinutes, rule.shortMinutes] : []])].sort((a, b) => b - a);
  return <div className={base.example} data-devops-explorer="slo">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <dl className={styles.metrics} aria-label="SLO 與錯誤預算">
      <div><dt>SLO</dt><dd>{permyriadText(o.targetPermyriad)}<small>{durationText(o.windowMinutes)}的視窗；好事件：{s.sli}</small></dd></div>
      <div><dt>SLI（整段期間）</dt><dd>{sliText(sliThousandths(good, total))}<small>{n0(good)} ÷ {n0(total)}，{meetsTarget(good, total, o.targetPermyriad) ? '達成' : '未達成'}目標</small></dd></div>
      <div><dt>錯誤預算</dt><dd>{n0(budget)} 個事件<small>⌊{n0(windowTotalOf(s, e))} × {permyriadText(10000 - o.targetPermyriad)}⌋{o.windowTotal !== undefined ? '（整個視窗預計的事件數）' : ''}</small></dd></div>
      <div><dt>期間結束時</dt><dd>剩 {tenthsText(end.remainingTenths)}%<small>用掉 {n0(end.consumed)} 個（{tenthsText(end.consumedTenths)}%）</small></dd></div>
    </dl>
    <p className={styles.facts}>服務「{s.service}」的 {s.buckets} 個時段，每段 {s.bucketMinutes} 分鐘（共 {durationText(periodMinutes(s))}{periodMinutes(s) < o.windowMinutes ? `，是 ${durationText(o.windowMinutes)}視窗的開頭` : ''}）。
      {s.incidents?.length ? `事故：${s.incidents.map(i => `「${i.label}」${bucketText(s, i.start)}到${bucketText(s, i.end - 1)}`).join('、')}。` : '這段時間沒有宣告的事故。'}</p>
    <p className={styles.chartTitle}>每個時段的 SLI 與目標</p>
    <SliChart s={s} e={e} minute={at}/>
    <p className={styles.chartTitle}>剩下的錯誤預算</p>
    <BudgetChart s={s} rows={rows} minute={at}/>
    <ul className={styles.legend}>
      <li><span className={`${styles.swatch} ${styles.to}`}/>每個時段的值</li>
      <li><span className={`${styles.swatch} ${styles.incidentSwatch}`}/>事故期間（底色）</li>
      <li>虛線：SLO 目標；實線：預算 0%</li>
    </ul>
    <BucketTable s={s} e={e} rows={rows} minute={at}/>
    <Stepper at={at} count={s.buckets} set={setBucket} unit="時段" label={(t, count) => `${bucketText(s, t)}（第 ${t + 1}／${count} 個時段）`}/>
    <div className={styles.note} aria-live="polite"><p>{bucketSummary(s, at, e, rows, rule, result)}</p></div>
    {windows.length > 0 && <BurnWindowsTable s={s} e={e} at={at} windows={windows} factorTenths={rule?.factorTenths}/>}
    <p className={styles.subhead}>消耗率告警（長、短兩個視窗）</p>
    {s.alerts?.length ? <div className={styles.controls}>
      <label htmlFor={`${id}-rule`}>課程的告警</label>
      <select id={`${id}-rule`} className={styles.select} value={chosen} onChange={ev => choose(ev.target.value)}>
        {s.alerts.map(r => <option key={r.id} value={r.id}>{r.label}（{SEVERITY_LABEL[r.severity]}）</option>)}
        <option value="">自訂（下方的設定）</option>
      </select>
    </div> : null}
    <BurnFields id={id} values={fields} set={set} invalid={issues.length > 0} describedBy={`${id}-issues`}/>
    <div className={base.vizControls}><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>恢復課程的告警</button></div>
    {issues.length > 0 && <ul id={`${id}-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {rule && result && <>
      <div aria-live="polite">
        <p className={styles.facts}><strong>告警</strong>：{burnConditionText(rule)}{lessonRule ? `（${lessonRule.label}，${SEVERITY_LABEL[lessonRule.severity]}）` : ''}。</p>
        <AlertSummary result={inMinutes(result, s.bucketMinutes)}/>
      </div>
      <p className={styles.chartTitle}>告警狀態（每個時段）</p>
      <StateStrip result={result} incidents={s.incidents ?? []} minute={at}/>
      <StateLegend/>
      <AlertTables result={result} bucketMinutes={s.bucketMinutes}/>
    </>}
    {s.sla && <><p className={styles.subhead}>SLA 與補償</p><SlaTable s={s} e={e}/></>}
  </div>;
}
