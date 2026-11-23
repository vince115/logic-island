import { useId } from 'react';
import type { Incident } from '@/lib/devops/incident';
import { SIGNAL_LABEL, type MetricSeries } from '@/lib/devops/series';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D3: one series of a monitoring dashboard as an SVG line chart (incident windows shaded, the selected rule's
 * threshold dashed, its window value as a second line, the selected minute marked) and the same numbers as a table,
 * ten minutes to a row. No chart library.
 */

const CW = 600, CH = 130, PL = 40, PR = 8, PT = 8, PB = 18;
const n0 = (x: number) => x.toLocaleString('en-US');

export function SeriesChart({ series, values, incidents, minute, threshold, overlay, overlayLabel }: {
  series: MetricSeries; values: readonly number[]; incidents: readonly Incident[]; minute: number;
  /** The selected rule's threshold, when it watches this series. */
  threshold?: number;
  /** The rule's window value each minute (avg, max or min), when it has a window. */
  overlay?: readonly (number | undefined)[]; overlayLabel?: string;
}) {
  const id = useId();
  const n = values.length, w = (CW - PL - PR) / n;
  const top = Math.max(1, ...values, threshold ?? 0);
  const x = (t: number) => PL + (t + 0.5) * w;
  const y = (v: number) => CH - PB - v / top * (CH - PT - PB);
  const path = (vs: readonly (number | undefined)[]) => vs.map((v, t) => v === undefined ? '' : `${vs[t - 1] === undefined ? 'M' : 'L'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const every = Math.ceil(n / 12 / 10) * 10 || 1;
  const max = Math.max(...values);
  const title = `「${series.label}」（${SIGNAL_LABEL[series.signal]}，單位 ${series.unit}）每分鐘的值，最大 ${n0(max)}（第 ${values.indexOf(max)} 分鐘）`
    + `${incidents.length ? `；底色是 ${incidents.length} 次事故的期間` : ''}${threshold !== undefined ? `；虛線是告警門檻 ${n0(threshold)}` : ''}。數字見下方表格`;
  return <svg className={styles.chart} viewBox={`0 0 ${CW} ${CH}`} role="img" aria-labelledby={`${id}-t`} data-series={series.id}>
    <title id={`${id}-t`}>{title}</title>
    {incidents.map(i => <rect key={i.id} x={PL + i.start * w} y={PT} width={(i.end - i.start) * w} height={CH - PT - PB} className={styles.incident}/>)}
    <rect x={PL + minute * w} y={PT} width={Math.max(1, w)} height={CH - PT - PB} className={styles.cursor}/>
    <line x1={PL} x2={CW - PR} y1={y(0)} y2={y(0)} className={styles.grid}/>
    <text x={PL - 4} y={y(0) + 3} textAnchor="end" className={styles.tick}>0</text>
    <text x={PL - 4} y={y(top) + 8} textAnchor="end" className={styles.tick}>{n0(top)}</text>
    {threshold !== undefined && <line x1={PL} x2={CW - PR} y1={y(threshold)} y2={y(threshold)} className={styles.threshold} data-threshold={threshold}/>}
    <path d={path(values)} className={styles.line}/>
    {overlay && <path d={path(overlay)} className={styles.overlay}><title>{overlayLabel}</title></path>}
    {Array.from({ length: Math.ceil(n / every) }, (_, k) => k * every).map(t => <text key={t} x={x(t)} y={CH - 5} textAnchor="middle" className={styles.tick}>{t}</text>)}
    <desc>{`縱軸單位：${series.unit}；橫軸：第幾分鐘`}</desc>
  </svg>;
}

/** The series' values as a table, ten minutes to a row (the chart's text version). */
export function SeriesTable({ series, values, minute }: { series: MetricSeries; values: readonly number[]; minute: number }) {
  const rows = Array.from({ length: Math.ceil(values.length / 10) }, (_, r) => values.slice(r * 10, r * 10 + 10));
  return <details className={base.details}><summary>「{series.label}」的數值表</summary>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>「{series.label}」每分鐘的值（{series.unit}，圖的文字版，每列 10 分鐘）</caption>
      <thead><tr><th scope="col">分鐘</th>{Array.from({ length: 10 }, (_, k) => <th key={k} scope="col">+{k}</th>)}</tr></thead>
      <tbody>{rows.map((row, r) => <tr key={r} data-current={Math.floor(minute / 10) === r ? '' : undefined}>
        <th scope="row">{r * 10}–{r * 10 + row.length - 1}</th>
        {row.map((v, k) => <td key={k} data-at={r * 10 + k === minute ? '' : undefined}>{n0(v)}</td>)}
      </tr>)}</tbody>
    </table></div>
  </details>;
}
