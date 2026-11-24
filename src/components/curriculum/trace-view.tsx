'use client';

import { useId, useMemo, useState } from 'react';
import { LEVEL_LABEL, tsText } from '@/lib/devops/logs';
import { analysisOf, nearestRank } from '@/lib/devops/trace-query';
import { tracesOf, type Trace } from '@/lib/devops/traces';
import { linkedRecords } from '@/lib/devops/traces-check';
import type { DevopsLessonContent, TracesExplorer } from '@/lib/devops/types';
import { CardinalityCalculator } from './trace-cardinality';
import { TraceWaterfall } from './trace-waterfall';
import { SamplingExplorer } from './sampling-form';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 devops-explorer stage D5 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.5), part of the monitoring-dashboard
 * activity: distributed traces. A trace picker (the lesson's traces, then generated ones with errors and the slowest), a
 * waterfall with its table, the log records that carry the trace's id and the dashboard's exemplars (when the lesson
 * links them), a sampling panel and a cardinality calculator. Everything is computed in the browser from the lesson's
 * data by src/lib/devops (the bulk traces from a fixed seed), so the server render and the browser agree.
 */

const ILLUSTRATIVE = '示意資料：由課程撰寫或以固定的種子產生的教學追蹤，不是任何真實服務、追蹤系統或 SDK 的資料；自身時間、關鍵路徑、取樣與基數的規則是本課程自己的模型。';
const n0 = (x: number) => x.toLocaleString('en-US');
const optionText = (t: Trace) => `${t.id.slice(0, 8)}… ${t.root.service}：${t.root.name}，${n0(t.duration)} ms${t.error ? '，有錯誤' : ''}`;

/** The picker's groups: the lesson's traces, generated ones with an error (20 at most), the 10 slowest generated ones. */
function pickerGroups(traces: readonly Trace[]): { label: string; traces: Trace[] }[] {
  const written = traces.filter(t => !t.generated), generated = traces.filter(t => t.generated);
  const errors = generated.filter(t => t.error).slice(0, 20);
  const slowest = [...generated].sort((a, b) => b.duration - a.duration).filter(t => !errors.includes(t)).slice(0, 10);
  return [{ label: '課程寫的追蹤', traces: written }, { label: '產生的追蹤：有錯誤的', traces: errors }, { label: '產生的追蹤：最慢的', traces: slowest }].filter(g => g.traces.length);
}

export function TracesExplorerView({ explorer, content }: { explorer: TracesExplorer; content: DevopsLessonContent }) {
  const id = useId();
  const set = explorer.traces;
  const traces = useMemo(() => tracesOf(set), [set]);
  const groups = useMemo(() => pickerGroups(traces), [traces]);
  const [picked, setPicked] = useState(groups[0].traces[0].id);
  const [span, setSpan] = useState(0);
  const trace = traces.find(t => t.id === picked) ?? traces[0];
  const listed = groups.some(g => g.traces.includes(trace));
  const choose = (traceId: string) => { setPicked(traceId); setSpan(0); };
  const durations = traces.map(t => t.duration), spans = traces.reduce((n, t) => n + t.spans.length, 0);
  const linked = linkedRecords(explorer, content, trace.id);
  const dashboard = explorer.links?.dashboard ? content.dashboards?.find(d => d.id === explorer.links!.dashboard)?.dashboard : undefined;
  const seriesLabel = (sid: string) => dashboard?.series.find(s => s.id === sid)?.label ?? sid;
  return <div className={base.example} data-devops-explorer="traces">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <p className={styles.facts}>{`${n0(traces.length)} 個追蹤、${n0(spans)} 個 span；有錯誤的追蹤 ${n0(traces.filter(t => t.error).length)} 個；`
      + `追蹤時間 p50 ${n0(nearestRank(durations, 50))} ms、p95 ${n0(nearestRank(durations, 95))} ms、p99 ${n0(nearestRank(durations, 99))} ms（最近排名法）。`}
      {set.generate ? `其中 ${n0(set.generate.count)} 個是以固定種子依呼叫結構產生的。` : ''}
      {set.perDay ? `正式環境每天約 ${n0(set.perDay)} 個請求（追蹤）。` : ''}</p>
    <p className={styles.subhead}>選一個追蹤</p>
    <div className={styles.controls}>
      <label htmlFor={`${id}-trace`}>追蹤（trace id 的前 8 碼、入口與時間）</label>
      <select id={`${id}-trace`} className={styles.select} value={trace.id} onChange={e => choose(e.target.value)}>
        {groups.map(g => <optgroup key={g.label} label={g.label}>{g.traces.map(t => <option key={t.id} value={t.id}>{optionText(t)}</option>)}</optgroup>)}
        {!listed && <optgroup label="由範例或日誌選取"><option value={trace.id}>{optionText(trace)}</option></optgroup>}
      </select>
    </div>
    <p className={styles.facts}>trace id：<code>{trace.id}</code></p>
    <TraceWaterfall analysis={analysisOf(trace)} selected={Math.min(span, trace.spans.length - 1)} setSelected={setSpan}/>
    {set.exemplars?.length ? <>
      <p className={styles.subhead}>儀表板的範例追蹤（exemplar）</p>
      <ul className={styles.checkList}>{set.exemplars.map(e => <li key={`${e.series}-${e.minute}`}>
        第 {e.minute} 分鐘「{seriesLabel(e.series)}」：<button type="button" className={styles.linkButton} onClick={() => choose(e.trace)} aria-pressed={e.trace === trace.id}>
          開啟追蹤 {e.trace.slice(0, 8)}…</button></li>)}</ul>
    </> : null}
    {linked && <>
      <p className={styles.subhead}>帶著這個 trace id 的日誌</p>
      {linked.records.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <caption>{linked.field} = {trace.id.slice(0, 8)}… 的紀錄（{linked.records.length} 筆，依時間）</caption>
        <thead><tr><th scope="col">#</th><th scope="col">時間</th><th scope="col">服務</th><th scope="col">等級</th><th scope="col">訊息</th></tr></thead>
        <tbody>{linked.records.map(r => <tr key={r.n}><th scope="row">{r.n}</th><td>{tsText(r.ts)}</td><td>{r.service}</td>
          <td data-level={r.level}>{LEVEL_LABEL[r.level]}（{r.level}）</td><td className={styles.wrap}>{r.message}</td></tr>)}</tbody>
      </table></div> : <p className={styles.facts}>沒有日誌紀錄帶著這個 trace id（{linked.field}）。</p>}
    </>}
    <p className={styles.subhead}>取樣：要保留哪些追蹤</p>
    <SamplingExplorer id={id} traces={traces} perDay={set.perDay}/>
    <p className={styles.subhead}>基數：一個指標會有幾條序列</p>
    <CardinalityCalculator id={id} traces={traces} initial={explorer.labels}/>
  </div>;
}
