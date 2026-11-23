'use client';

import { Fragment, useId, useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { blanksOf, checkDevopsAnswer, constraintTexts, outcomeText, parsePlan, PLAN_FIELDS, planAnswer, scenarioFor, simulatePlan } from '@/lib/devops/check';
import { clockText, doraMetrics, durationText, failureStart, MINUTES_PER_DAY } from '@/lib/devops/history';
import { simulateRollout, STRATEGY_KINDS, STRATEGY_LABEL, strategyIssues, strategyText, type MinuteRow, type RolloutResult, type RolloutScenario, type Strategy, type StrategyKind } from '@/lib/devops/rollout';
import type { AlertResult } from '@/lib/devops/alerts';
import { alertConstraintTexts, dashboardById, evaluatePlan } from '@/lib/devops/dashboard-check';
import { evaluateRedact } from '@/lib/devops/logs-check';
import type { DevopsExercise, DevopsLessonContent, HistoryExplorer, RolloutExplorer } from '@/lib/devops/types';
import { AlertRuleFields } from './alert-rule-fields';
import { MaskRulesField } from './log-masking';
import { Rich } from './rich';
import { Stepper } from './visualizations';
import base from './curriculum.module.css';
import activities from './db-activities.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 devops-explorer (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §8): the deployment history with its DORA metrics
 * (D1) and the rollout simulator (D2, the deployment-simulator activity), and the exercise box (the D3 dashboard is in
 * dashboard-view.tsx, the D4 log viewer in log-viewer.tsx). Everything is computed in
 * the browser from the lesson's data by src/lib/devops; there is no randomness, so the server render and the browser
 * agree. Each chart is an SVG with a title and a table holding the same numbers; every control is a labelled form
 * control, and the minute stepper answers the arrow keys.
 */

const ILLUSTRATIVE = '示意資料：由課程撰寫的教學模型，用來說明原理，不是任何真實團隊、服務或產品的數據。';
const n0 = (x: number) => x.toLocaleString('en-US');
/** D4's queries: their exercises answer times in m:ss or seconds, not minutes. */
const LOG_TASKS: readonly string[] = ['logs', 'correlate', 'retention', 'log-format'];

// ---- D1: deployment history ---------------------------------------------------------------------------------------
const HW = 600, HH = 120, HP = 16;

export function DeploymentHistoryView({ explorer }: { explorer: HistoryExplorer }) {
  const id = useId();
  const h = explorer.history;
  const m = useMemo(() => doraMetrics(h), [h]);
  const [selected, setSelected] = useState(0);
  const d = h.deployments[selected];
  const span = h.days * MINUTES_PER_DAY;
  const x = (minute: number) => HP + minute / span * (HW - 2 * HP);
  const every = Math.max(1, Math.ceil(h.days / 14));
  const leadOf = (c: number) => d.deployedAt - c;
  const mid = m.leadTimes.length % 2 ? [m.leadTimes.length >> 1] : [(m.leadTimes.length >> 1) - 1, m.leadTimes.length >> 1];
  return <div className={base.example} data-devops-explorer="history">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <p className={styles.facts}>服務「{h.service}」在 {h.days} 天內的部署紀錄（時間從第 1 天 00:00 起算，單位是分鐘）。</p>
    <dl className={styles.metrics} aria-label="DORA 指標">
      <div><dt>部署頻率</dt><dd>每週 {(m.perWeekTenths / 10).toFixed(1)} 次<small>{m.deployments} 次 × 7 ÷ {h.days} 天；有部署的日子 {m.deployDays} 天</small></dd></div>
      <div><dt>變更前置時間（中位數）</dt><dd>{m.leadTimeMedian === undefined ? '—' : durationText(m.leadTimeMedian)}<small>{m.leadTimes.length} 個變更，從提交到上線</small></dd></div>
      <div><dt>變更失敗率</dt><dd>{m.changeFailPercent}%<small>{m.failed} 次造成故障 ÷ {m.deployments} 次部署</small></dd></div>
      <div><dt>失敗部署復原時間（中位數）</dt><dd>{m.recoveryMedian === undefined ? '—' : durationText(m.recoveryMedian)}<small>{m.failed ? `偵測時間中位數 ${durationText(m.detectMedian!)}` : '沒有失敗的部署'}</small></dd></div>
    </dl>
    <p className={styles.chartTitle}>部署時間軸</p>
    <svg className={styles.chart} viewBox={`0 0 ${HW} ${HH}`} role="img" aria-labelledby={`${id}-chart-title`}>
      <title id={`${id}-chart-title`}>{`部署時間軸：${h.days} 天內 ${m.deployments} 次部署，其中 ${m.failed} 次造成故障；選取的是 ${d.id}。逐筆資料見下方表格`}</title>
      {Array.from({ length: h.days + 1 }, (_, day) => <g key={day}>
        <line x1={x(day * MINUTES_PER_DAY)} x2={x(day * MINUTES_PER_DAY)} y1={20} y2={HH - 22} className={styles.grid}/>
        {day < h.days && day % every === 0 && <text x={x(day * MINUTES_PER_DAY) + 2} y={HH - 8} className={styles.tick}>{day + 1}</text>}
      </g>)}
      {d.commitAt.map((c, i) => <line key={i} x1={x(c)} y1={36} x2={x(d.deployedAt)} y2={58} className={styles.commit}/>)}
      {d.commitAt.map((c, i) => <circle key={`c${i}`} cx={x(c)} cy={36} r={3} className={styles.to}/>)}
      {h.deployments.map((dep, i) => <g key={dep.id} data-failed={dep.failure ? '' : undefined} data-selected={i === selected ? '' : undefined}>
        {dep.failure && <rect x={x(failureStart(dep))} y={72} width={Math.max(2, x(dep.failure.restoredAt) - x(failureStart(dep)))} height={8} className={styles.failure}/>}
        {dep.failure ? <rect x={x(dep.deployedAt) - 5} y={53} width={10} height={10} className={styles.deploy}/> : <circle cx={x(dep.deployedAt)} cy={58} r={5} className={styles.deploy}/>}
      </g>)}
    </svg>
    <ul className={styles.legend}>
      <li><span className={`${styles.swatch} ${styles.to}`}/>部署（圓點）與選取部署的變更（線的起點是提交時間）</li>
      <li><span className={`${styles.swatch} ${styles.dropped}`}/>造成故障的部署（方塊）與故障持續的時間（橫條）</li>
      <li>橫軸：第幾天</li>
    </ul>
    <div className={styles.controls}>
      <label htmlFor={`${id}-sel`}>選擇一次部署</label>
      <select id={`${id}-sel`} className={styles.select} value={selected} onChange={e => setSelected(Number(e.target.value))}>
        {h.deployments.map((dep, i) => <option key={dep.id} value={i}>{dep.id}（{clockText(dep.deployedAt)}{dep.failure ? '，造成故障' : ''}）</option>)}
      </select>
    </div>
    <div className={styles.note} aria-live="polite">
      <p>部署 {d.id} 在{clockText(d.deployedAt)}上線，包含 {d.commitAt.length} 個變更，前置時間 {d.commitAt.map(c => durationText(leadOf(c))).join('、')}。</p>
      <p>{d.failure ? `造成故障：${clockText(failureStart(d))}開始，${durationText(d.failure.detectedAt - failureStart(d))}後偵測到，${durationText(d.failure.restoredAt - failureStart(d))}後恢復服務。` : '沒有造成故障。'}</p>
    </div>
    {m.leadTimes.length > 0 && <p className={styles.sorted}>前置時間由小到大（分鐘）：{m.leadTimes.map((t, i) => <span key={i}>{i ? '、' : ''}{mid.includes(i) ? <mark>{t}</mark> : t}</span>)}；
      {mid.length === 1 ? `共 ${m.leadTimes.length} 個，正中間的是中位數 ${m.leadTimeMedian}。` : `共 ${m.leadTimes.length} 個（偶數），中位數是中間兩個的平均，四捨五入到整數分鐘：${m.leadTimeMedian}。`}</p>}
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>部署紀錄（時間軸的文字版）</caption>
      <thead><tr><th scope="col">部署</th><th scope="col">上線時間</th><th scope="col">變更數</th><th scope="col">各變更的前置時間（分鐘）</th><th scope="col">結果</th><th scope="col">偵測（分鐘）</th><th scope="col">復原（分鐘）</th></tr></thead>
      <tbody>{h.deployments.map((dep, i) => <tr key={dep.id} data-current={i === selected ? '' : undefined}>
        <th scope="row">{dep.id}</th><td>{clockText(dep.deployedAt)}</td><td>{dep.commitAt.length}</td><td>{dep.commitAt.map(c => dep.deployedAt - c).join('、')}</td>
        <td data-bad={dep.failure ? '' : undefined}>{dep.failure ? '造成故障' : '正常'}</td>
        <td>{dep.failure ? dep.failure.detectedAt - failureStart(dep) : '—'}</td><td>{dep.failure ? dep.failure.restoredAt - failureStart(dep) : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

// ---- D2: rollout simulator ----------------------------------------------------------------------------------------
const DEFAULT_PARAMS: Record<Exclude<StrategyKind, 'recreate'>, Record<string, string>> = {
  rolling: { maxSurge: '1', maxUnavailable: '0' },
  'blue-green': { verifyMinutes: '1', keepBlueMinutes: '3' },
  canary: { steps: '10/2, 50/2, 100/2' },
};
const initialParams = (st: Strategy): Record<StrategyKind, Record<string, string>> =>
  ({ recreate: {}, ...DEFAULT_PARAMS, ...(st.kind !== 'recreate' ? { [st.kind]: planAnswer(st) } : {}) });
/** The learner's strategy, or why it cannot be simulated. */
function readStrategy(kind: StrategyKind, params: Record<string, string>, instances: number): { strategy?: Strategy; issues: string[] } {
  if (kind === 'recreate') return { strategy: { kind }, issues: [] };
  const { strategy, messages } = parsePlan(kind, params);
  if (!strategy) return { issues: messages };
  const issues = strategyIssues(strategy, instances).map(i => i.zh);
  return issues.length ? { issues } : { strategy, issues };
}

const CW = 600, CH = 120, PL = 34, PR = 8, PT = 8, PB = 18;
type Segment = { value: number; className: string };
/** One stacked bar per minute; the selected minute is shaded. */
function StackedChart({ title, rows, max, segments, minute, target, unit }: {
  title: string; rows: MinuteRow[]; max: number; segments: (r: MinuteRow) => Segment[]; minute: number; target?: number; unit: string;
}) {
  const id = useId();
  const w = (CW - PL - PR) / rows.length, top = Math.max(1, max);
  const y = (v: number) => CH - PB - v / top * (CH - PT - PB);
  const every = Math.max(1, Math.ceil(rows.length / 12));
  return <svg className={styles.chart} viewBox={`0 0 ${CW} ${CH}`} role="img" aria-labelledby={`${id}-t`}>
    <title id={`${id}-t`}>{title}</title>
    <rect x={PL + minute * w} y={PT} width={w} height={CH - PT - PB} className={styles.cursor}/>
    <line x1={PL} x2={CW - PR} y1={y(0)} y2={y(0)} className={styles.grid}/>
    <text x={PL - 4} y={y(0) + 3} textAnchor="end" className={styles.tick}>0</text>
    <text x={PL - 4} y={y(top) + 8} textAnchor="end" className={styles.tick}>{n0(top)}</text>
    {target !== undefined && target !== top && <><line x1={PL} x2={CW - PR} y1={y(target)} y2={y(target)} className={styles.target}/>
      <text x={PL - 4} y={y(target) + 3} textAnchor="end" className={styles.tick}>{n0(target)}</text></>}
    {rows.map(r => {
      let at = 0;
      return <g key={r.minute}>{segments(r).filter(s => s.value > 0).map((s, i) => {
        const y0 = y(at + s.value), hgt = y(at) - y0;
        at += s.value;
        return <rect key={i} x={PL + r.minute * w + 0.5} y={y0} width={Math.max(0.5, w - 1)} height={hgt} className={s.className}/>;
      })}</g>;
    })}
    {rows.filter(r => r.minute % every === 0).map(r => <text key={r.minute} x={PL + r.minute * w + w / 2} y={CH - 5} textAnchor="middle" className={styles.tick}>{r.minute}</text>)}
    <desc>{`縱軸單位：${unit}；橫軸：第幾分鐘`}</desc>
  </svg>;
}

function minuteText(r: MinuteRow, s: RolloutScenario): string {
  const pool = (label: string, p: MinuteRow['instances']['from']) => p.ready + p.starting ? `${label} ${p.ready + p.starting} 個（就緒 ${p.ready}${p.starting ? `、啟動中 ${p.starting}` : ''}）` : `${label} 0 個`;
  const parts = [
    `第 ${r.minute} 分鐘：執行中 ${r.running} 個——${pool(s.from.label, r.instances.from)}、${pool(s.to.label, r.instances.to)}。`,
    `${r.weight !== undefined ? `路由把 ${r.weight}% 的流量給 ${s.to.label}；` : ''}${n0(r.requests)} 個請求中 ${s.from.label} 承接 ${n0(r.served.from)}、${s.to.label} 承接 ${n0(r.served.to)}${r.dropped ? `，丟棄 ${n0(r.dropped)}` : ''}；錯誤 ${s.from.label} ${r.errors.from}、${s.to.label} ${r.errors.to}。`,
  ];
  if (r.incompatible.from || r.incompatible.to) parts.push(`資料庫缺少${[r.incompatible.from ? s.from.label : '', r.incompatible.to ? s.to.label : ''].filter(Boolean).join('、')}需要的欄位，它承接的請求全部失敗。`);
  if (Object.keys(r.exposure).length) parts.push(`功能旗標開放：${Object.entries(r.exposure).map(([k, v]) => `${s.flags!.find(f => f.id === k)!.label} ${v}%`).join('、')}。`);
  if (r.events.length) parts.push(`這一分鐘：${r.events.join('；')}。`);
  return parts.join('');
}

export function RolloutSimulatorView({ explorer }: { explorer: RolloutExplorer }) {
  const id = useId();
  const s0 = explorer.scenario, N = s0.fleet.instances;
  const [kind, setKind] = useState<StrategyKind>(s0.strategy.kind);
  const [params, setParams] = useState(() => initialParams(s0.strategy));
  const [gateOn, setGateOn] = useState(!!s0.gate);
  const [minute, setMinute] = useState(0);
  const read = readStrategy(kind, params[kind], N);
  // A few thousand integer operations: simulated on every render, no cache needed.
  const result: RolloutResult | undefined = read.strategy ? simulateRollout(scenarioFor(s0, read.strategy, gateOn ? undefined : null)) : undefined;
  const at = Math.min(minute, s0.minutes - 1);
  const reset = () => { setKind(s0.strategy.kind); setParams(initialParams(s0.strategy)); setGateOn(!!s0.gate); setMinute(0); };
  const set = (k: string, v: string) => setParams(p => ({ ...p, [kind]: { ...p[kind], [k]: v } }));
  const fields = kind === 'recreate' ? {} : { rolling: { maxSurge: 'maxSurge（個數或 %）', maxUnavailable: 'maxUnavailable（個數或 %）' },
    'blue-green': { verifyMinutes: '切換前驗證（分鐘）', keepBlueMinutes: '切換後保留藍色（分鐘）' }, canary: { steps: '步驟（流量%/觀察分鐘）' } }[kind];
  const v = (x: typeof s0.from) => `${x.label}：錯誤率 ${x.errorPermille}‰、p95 ${x.p95Ms} ms、啟動 ${x.startSeconds} 秒${x.requires?.length ? `、需要欄位 ${x.requires.join('、')}` : ''}`;
  const gateText = s0.gate ? `${s0.gate.metric === 'error-rate' ? `新版本錯誤率 ≤ ${s0.gate.max}‰` : `新版本 p95 ≤ ${s0.gate.max} ms`}，至少 ${n0(s0.gate.minRequests)} 個請求` : '';
  const row = result?.rows[at];
  return <div className={base.example} data-devops-explorer="rollout">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}以整分鐘為單位逐步模擬，規則見課程說明，不代表任何調度系統或負載平衡器的實際行為。</p>
    <p className={styles.facts}>{N} 個執行個體，每個每分鐘最多承接 {n0(s0.fleet.capacityRpm)} 個請求；服務每分鐘收到 {n0(s0.fleet.rpm)} 個請求。{v(s0.from)}；{v(s0.to)}。</p>
    {(s0.migrations?.length || s0.flags?.length) ? <ul className={styles.facts}>
      {s0.schema && <li>資料庫一開始的欄位：{s0.schema.join('、') || '（無）'}</li>}
      {s0.migrations?.map((m, i) => <li key={i}>第 {m.at} 分鐘{m.kind === 'expand' ? '擴充（expand）：新增' : '收縮（contract）：刪除'}欄位 {m.columns.join('、')}</li>)}
      {s0.flags?.map(f => <li key={f.id}>功能旗標「{f.label}」在 {f.version} 的程式裡，走新功能的請求錯誤率 {f.errorPermille}‰；開放比例：{f.exposure.map(e => `第 ${e.at} 分鐘 ${e.percent}%`).join('、')}</li>)}
    </ul> : null}
    <div className={styles.controls}>
      <label htmlFor={`${id}-kind`}>部署策略</label>
      <select id={`${id}-kind`} className={styles.select} value={kind} onChange={e => { setKind(e.target.value as StrategyKind); setMinute(0); }}>
        {STRATEGY_KINDS.map(k => <option key={k} value={k}>{STRATEGY_LABEL[k]}</option>)}
      </select>
      {Object.entries(fields).map(([k, label]) => <Fragment key={k}>
        <label htmlFor={`${id}-${k}`}>{label}</label>
        <input id={`${id}-${k}`} className={styles.input} value={params[kind][k] ?? ''} inputMode={k === 'steps' ? 'text' : 'numeric'} spellCheck={false} autoComplete="off"
          aria-invalid={read.issues.length ? true : undefined} aria-describedby={read.issues.length ? `${id}-issues` : undefined} onChange={e => set(k, e.target.value)}/>
      </Fragment>)}
      {s0.gate && <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={gateOn} onChange={e => setGateOn(e.target.checked)}/>
        啟用閘門（{gateText}；只用於金絲雀與藍綠）</label>}
    </div>
    <div className={base.vizControls}><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>恢復課程的設定</button></div>
    {read.issues.length > 0 && <ul id={`${id}-issues`} className={styles.issues} role="alert">{read.issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {result && row && <>
      <div aria-live="polite">
        <p className={styles.facts}><strong>{strategyText(read.strategy!)}</strong>：{result.outcome === 'completed' ? `第 ${result.completedAt} 分鐘完成` : result.outcome === 'rolled-back' ? `第 ${result.rolledBackAt} 分鐘回滾${result.abortedStep ? `（第 ${result.abortedStep} 步的閘門未通過）` : ''}` : `${s0.minutes} 分鐘內沒有完成`}
          {result.switchAt !== undefined ? `；第 ${result.switchAt} 分鐘切換流量` : ''}{result.rolling ? `；maxSurge = ${result.rolling.surge} 個、maxUnavailable = ${result.rolling.unavailable} 個` : ''}。</p>
        <dl className={styles.metrics} aria-label="整段時間的總計">
          <div><dt>錯誤的請求</dt><dd>{n0(result.totals.errors)}<small>{s0.from.label} {n0(result.totals.errorsBy.from)}、{s0.to.label} {n0(result.totals.errorsBy.to)}</small></dd></div>
          <div><dt>丟棄的請求</dt><dd>{n0(result.totals.dropped)}<small>{result.totals.droppedMinutes} 分鐘容量不足或沒有可用的執行個體</small></dd></div>
          <div><dt>同時執行的尖峰</dt><dd>{result.totals.peakInstances} 個<small>平常是 {N} 個</small></dd></div>
          <div><dt>額外的執行個體分鐘</dt><dd>{n0(result.totals.extraInstanceMinutes)}<small>超過 {N} 個的部分逐分鐘加總</small></dd></div>
        </dl>
      </div>
      <p className={styles.chartTitle}>執行個體</p>
      <StackedChart title={`每分鐘執行中的執行個體（${s0.from.label} 與 ${s0.to.label}，就緒與啟動中）；虛線是平常的 ${N} 個，尖峰 ${result.totals.peakInstances} 個。數字見下方表格`}
        rows={result.rows} minute={at} unit="個" max={Math.max(N, result.totals.peakInstances)} target={N}
        segments={r => [{ value: r.instances.from.ready, className: styles.from }, { value: r.instances.from.starting, className: `${styles.from} ${styles.starting}` },
          { value: r.instances.to.ready, className: styles.to }, { value: r.instances.to.starting, className: `${styles.to} ${styles.starting}` }]}/>
      <p className={styles.chartTitle}>請求</p>
      <StackedChart title={`每分鐘的請求：${s0.from.label} 承接、${s0.to.label} 承接與丟棄；共丟棄 ${n0(result.totals.dropped)} 個。數字見下方表格`}
        rows={result.rows} minute={at} unit="個請求" max={s0.fleet.rpm}
        segments={r => [{ value: r.served.from, className: styles.from }, { value: r.served.to, className: styles.to }, { value: r.dropped, className: styles.dropped }]}/>
      <p className={styles.chartTitle}>錯誤</p>
      <StackedChart title={`每分鐘的錯誤請求（${s0.from.label} 與 ${s0.to.label}）；共 ${n0(result.totals.errors)} 個。數字見下方表格`}
        rows={result.rows} minute={at} unit="個錯誤" max={Math.max(...result.rows.map(r => r.errors.from + r.errors.to))}
        segments={r => [{ value: r.errors.from, className: styles.from }, { value: r.errors.to, className: styles.to }]}/>
      <ul className={styles.legend}>
        <li><span className={`${styles.swatch} ${styles.from}`}/>{s0.from.label}（舊版本）</li>
        <li><span className={`${styles.swatch} ${styles.to}`}/>{s0.to.label}（新版本）</li>
        <li><span className={`${styles.swatch} ${styles.starting}`}/>啟動中（還不承接請求）</li>
        <li><span className={`${styles.swatch} ${styles.dropped}`}/>丟棄的請求</li>
      </ul>
      <Stepper at={at} count={s0.minutes} set={setMinute} unit="分鐘" label={(m, count) => `第 ${m} 分鐘（共 ${count} 分鐘）`}/>
      <div className={styles.note} aria-live="polite"><p>{minuteText(row, s0)}</p></div>
      {result.gates.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
        <caption>閘門的判定（新版本在觀察期間的請求）</caption>
        <thead><tr><th scope="col">階段</th><th scope="col">觀察期間（分鐘）</th><th scope="col">請求</th><th scope="col">錯誤</th><th scope="col">錯誤率</th><th scope="col">p95</th><th scope="col">判定</th></tr></thead>
        <tbody>{result.gates.map(g => <tr key={g.step}><th scope="row">{g.step ? `第 ${g.step} 步` : '切換後觀察'}</th><td>{g.from}–{g.to}</td><td>{n0(g.requests)}</td><td>{g.errors}</td><td>{g.permille}‰</td><td>{g.p95Ms} ms</td>
          <td data-bad={g.verdict !== 'pass' ? '' : undefined}>{g.verdict === 'pass' ? '通過' : g.verdict === 'fail' ? '未通過' : '樣本不足（視同未通過）'}</td></tr>)}</tbody>
      </table></div>}
      <details className={base.details}><summary>逐分鐘的表格（三張圖的文字版）</summary>
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption>每分鐘的執行個體、請求、錯誤與事件</caption>
          <thead><tr><th scope="col">分鐘</th><th scope="col">{s0.from.label} 執行（就緒）</th><th scope="col">{s0.to.label} 執行（就緒）</th><th scope="col">{s0.to.label} 流量</th>
            <th scope="col">{s0.from.label} 承接</th><th scope="col">{s0.to.label} 承接</th><th scope="col">丟棄</th><th scope="col">{s0.from.label} 錯誤</th><th scope="col">{s0.to.label} 錯誤</th><th scope="col">事件</th></tr></thead>
          <tbody>{result.rows.map(r => <tr key={r.minute} data-current={r.minute === at ? '' : undefined}>
            <th scope="row">{r.minute}</th>
            <td>{r.instances.from.ready + r.instances.from.starting}（{r.instances.from.ready}）</td><td>{r.instances.to.ready + r.instances.to.starting}（{r.instances.to.ready}）</td>
            <td>{r.weight !== undefined ? `${r.weight}%` : '依就緒數'}</td><td>{n0(r.served.from)}</td><td>{n0(r.served.to)}</td>
            <td data-bad={r.dropped ? '' : undefined}>{n0(r.dropped)}</td><td data-bad={r.incompatible.from ? '' : undefined}>{r.errors.from}</td><td data-bad={r.incompatible.to ? '' : undefined}>{r.errors.to}</td>
            <td className={styles.wrap}>{r.events.join('；') || '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </>}
  </div>;
}

// ---- exercises ----------------------------------------------------------------------------------------------------
export function DevopsExerciseBox({ exercise, content }: { exercise: DevopsExercise; content: DevopsLessonContent }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; messages: string[]; plan?: RolloutResult; alert?: AlertResult; masked?: number }>();
  const set = (k: string, v: string) => { setValues(old => ({ ...old, [k]: v })); setResult(undefined); };
  const input = (key: string, numeric: boolean) => <input id={`${id}-${key}`} className={styles.input} value={values[key] ?? ''}
    inputMode={numeric ? 'decimal' : 'text'} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={e => set(key, e.target.value)}/>;
  const check = () => {
    const r = checkDevopsAnswer(exercise, content, values);
    let plan: RolloutResult | undefined;
    if (exercise.kind === 'rollout-plan') {
      const { strategy } = parsePlan(exercise.plan.strategy, values);
      const n = content.rollouts?.find(x => x.id === exercise.plan.rollout)?.scenario.fleet.instances ?? 0;
      if (strategy && !strategyIssues(strategy, n).length) plan = simulatePlan(exercise.plan, content, strategy);
    }
    setResult({ ...r, plan, ...exercise.kind === 'alert-rule' ? { alert: evaluatePlan(exercise.plan, content, values) } : {},
      ...exercise.kind === 'redact' ? { masked: evaluateRedact(exercise.redact, content, values).outcome?.masked } : {} });
  };
  return <div className={activities.builder}>
    {exercise.kind === 'choice' ? <fieldset className={styles.radios}>
      <legend>選擇答案</legend>
      {exercise.options.map((o, i) => <label key={o.value}><input type="radio" name={`${id}-choice`} checked={values.choice === String(i)} onChange={() => set('choice', String(i))}/><Rich text={o.label}/></label>)}
    </fieldset>
      : exercise.kind === 'table' ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">要填的值</th><th scope="col">你的答案</th></tr></thead>
        <tbody>{exercise.blanks.map(b => <tr key={b.id}><th scope="row"><label htmlFor={`${id}-${b.id}`}><Rich text={b.label}/></label></th><td>{input(b.id, false)}</td></tr>)}</tbody>
      </table></div>
      : exercise.kind === 'rollout-plan' ? <>
        <p className={styles.facts}>條件：{constraintTexts(exercise.plan.constraints).join('；')}。</p>
        <div className={styles.controls}>{Object.entries(PLAN_FIELDS[exercise.plan.strategy]).map(([k, label]) => <Fragment key={k}>
          <label htmlFor={`${id}-${k}`}>{label}</label>{input(k, k !== 'steps')}</Fragment>)}</div>
      </>
      : exercise.kind === 'alert-rule' ? <>
        <p className={styles.facts}>條件：{alertConstraintTexts(exercise.plan.constraints).join('；')}。</p>
        <AlertRuleFields id={id} values={values} set={set} series={dashboardById(content, exercise.plan.dashboard).series}/>
      </>
      : exercise.kind === 'redact' ? <>
        <p className={styles.facts}>必須隱藏：{exercise.redact.mustHide.map(v => `「${v}」`).join('、')}；必須保留：{exercise.redact.mustKeep.map(v => `「${v}」`).join('、') || '—'}。</p>
        <MaskRulesField id={id} value={values.rules ?? ''} set={v => set('rules', v)}/>
      </>
      : <div className={activities.row}><label htmlFor={`${id}-value`}><Rich text={exercise.blank.label}/></label>{input('value', exercise.kind === 'number')}</div>}
    <p className={base.muted}>{exercise.kind === 'rollout-plan' ? '按「檢查」時，用你的參數把這次部署重新模擬一次，再檢查每個條件；符合條件的設定都會通過。'
      : exercise.kind === 'alert-rule' ? '按「檢查」時，用你的規則把儀表板的每一分鐘重新評估一次，再檢查每個條件；符合條件的規則都會通過。'
      : exercise.kind === 'redact' ? '按「檢查」時，把你的規則套用到課程的日誌，檢查必須隱藏的值都看不到、必須保留的值一個都沒有被遮掉；符合的規則都會通過。'
      : exercise.kind === 'choice' ? '' : blanksOf(exercise).some(b => LOG_TASKS.includes(b.query.task))
        ? '數字照題目要的單位填（可以加上單位，例如 5 秒、13.5 GB）；日誌的時間寫成「分:秒」或秒數，服務的順序用逗號或 → 分開。'
        : '數字照題目要的單位填（可以加上單位，例如 120 分鐘、40%）；時間一律換算成分鐘。'}</p>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={check}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={() => { setValues({}); setResult(undefined); }}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={activities.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={activities.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
      {result.alert && <p className={styles.facts}>你的規則評估的結果：通知 {result.alert.notifications} 次、誤報 {result.alert.falseAlerts} 次、漏掉 {result.alert.missed} 個事故；偵測延遲 {result.alert.incidents.map(i => `${i.label} ${i.delay === undefined ? '漏掉' : `${i.delay} 分鐘`}`).join('、') || '—'}。</p>}
      {result.masked !== undefined && <p className={styles.facts}>你的規則改動了 {result.masked} 個值（訊息、欄位或原始行）。</p>}
      {result.plan && <p className={styles.facts}>你的設定模擬的結果：{outcomeText(result.plan.outcome)}{result.plan.completedAt !== undefined ? `（第 ${result.plan.completedAt} 分鐘）` : ''}；錯誤 {result.plan.totals.errors}、丟棄 {result.plan.totals.dropped}、尖峰 {result.plan.totals.peakInstances} 個、額外的執行個體分鐘 {result.plan.totals.extraInstanceMinutes}。</p>}
    </>}</div>
  </div>;
}
