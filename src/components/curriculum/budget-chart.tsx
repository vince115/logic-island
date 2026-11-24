import { useId } from 'react';
import { clockText } from '@/lib/devops/history';
import type { Incident } from '@/lib/devops/incident';
import { n0, permyriadText, sliText, sliThousandths, tenthsText, type BudgetRow, type SloEvents, type SloScenario } from '@/lib/devops/slo';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D6: an SLO scenario's two charts (each bucket's SLI against the objective, and the remaining error budget over
 * time) as SVG without a chart library, and the same numbers as one table, a row per bucket. Incidents are shaded, the
 * selected bucket is marked.
 */

const CW = 600, CH = 130, PL = 48, PR = 8, PT = 8, PB = 18;

/** A bucket as text: 「第 35 分鐘」, 「第 35–39 分鐘」, 「第 120–179 分鐘（第 1 天 02:00）」. */
export function bucketText(s: Pick<SloScenario, 'bucketMinutes'>, t: number): string {
  const a = t * s.bucketMinutes, b = a + s.bucketMinutes - 1;
  return s.bucketMinutes === 1 ? `第 ${a} 分鐘` : `第 ${n0(a)}–${n0(b)} 分鐘${s.bucketMinutes === 60 ? `（${clockText(a)}）` : ''}`;
}

function Frame({ n, incidents, minute, children, title, desc }: { n: number; incidents: readonly Incident[]; minute: number; children: React.ReactNode; title: string; desc: string }) {
  const id = useId(), w = (CW - PL - PR) / n;
  return <svg className={styles.chart} viewBox={`0 0 ${CW} ${CH}`} role="img" aria-labelledby={`${id}-t`}>
    <title id={`${id}-t`}>{title}</title>
    {incidents.map(i => <rect key={i.id} x={PL + i.start * w} y={PT} width={(i.end - i.start) * w} height={CH - PT - PB} className={styles.incident}/>)}
    <rect x={PL + minute * w} y={PT} width={Math.max(1, w)} height={CH - PT - PB} className={styles.cursor}/>
    {children}
    <desc>{desc}</desc>
  </svg>;
}
const xOf = (t: number, n: number) => PL + (t + 0.5) * (CW - PL - PR) / n;
const scale = (lo: number, hi: number) => (v: number) => CH - PB - (v - lo) / (hi - lo || 1) * (CH - PT - PB);
const pathOf = (vs: readonly (number | undefined)[], n: number, y: (v: number) => number) =>
  vs.map((v, t) => v === undefined ? '' : `${t === 0 || vs[t - 1] === undefined ? 'M' : 'L'}${xOf(t, n).toFixed(1)},${y(v).toFixed(1)}`).join('');

/** Each bucket's SLI (good ÷ total, a dashed line at the objective). */
export function SliChart({ s, e, minute }: { s: SloScenario; e: SloEvents; minute: number }) {
  const n = s.buckets, target = s.objective.targetPermyriad * 10;
  const sli = e.total.map((x, t) => sliThousandths(e.good[t], x));
  const known = sli.filter((v): v is number => v !== undefined), low = Math.min(target, ...known);
  const lo = Math.max(0, Math.floor(100000 - (100000 - low) * 1.25)), y = scale(lo, 100000);
  const worst = known.length ? Math.min(...known) : undefined, below = sli.filter(v => v !== undefined && v < target).length;
  const title = `每個時段的 SLI（好事件 ÷ 全部事件）${worst === undefined ? '' : `，最低 ${sliText(worst)}（${bucketText(s, sli.indexOf(worst))}）`}；虛線是目標 ${permyriadText(s.objective.targetPermyriad)}，${below} 個時段低於目標`
    + `${s.incidents?.length ? `；底色是 ${s.incidents.length} 次事故` : ''}。數字見下方表格`;
  return <Frame n={n} incidents={s.incidents ?? []} minute={minute} title={title} desc="縱軸：SLI（%）；橫軸：時段">
    <line x1={PL} x2={CW - PR} y1={y(target)} y2={y(target)} className={styles.threshold} data-threshold={target}/>
    <text x={PL - 4} y={y(100000) + 8} textAnchor="end" className={styles.tick}>100%</text>
    <text x={PL - 4} y={y(lo) + 3} textAnchor="end" className={styles.tick}>{(lo / 1000).toFixed(1)}%</text>
    <path d={pathOf(sli, n, y)} className={styles.line}/>
  </Frame>;
}

/** The remaining error budget (%) after each bucket, with the zero line. */
export function BudgetChart({ s, rows, minute }: { s: SloScenario; rows: readonly BudgetRow[]; minute: number }) {
  const n = s.buckets, lo = Math.min(0, ...rows.map(r => r.remainingTenths)), y = scale(lo, 1000);
  const out = rows.findIndex(r => r.remaining <= 0), end = rows[rows.length - 1];
  const title = `每個時段之後剩下的錯誤預算（%），最後剩 ${tenthsText(end.remainingTenths)}%`
    + `${out < 0 ? '，沒有用完' : `，在${bucketText(s, out)}用完`}；實線是 0%。數字見下方表格`;
  return <Frame n={n} incidents={s.incidents ?? []} minute={minute} title={title} desc="縱軸：剩下的錯誤預算（%）；橫軸：時段">
    <line x1={PL} x2={CW - PR} y1={y(0)} y2={y(0)} className={styles.grid}/>
    <text x={PL - 4} y={y(1000) + 8} textAnchor="end" className={styles.tick}>100%</text>
    <text x={PL - 4} y={y(0) + 3} textAnchor="end" className={styles.tick}>0%</text>
    {lo < 0 && <text x={PL - 4} y={y(lo) - 2} textAnchor="end" className={styles.tick}>{tenthsText(lo)}%</text>}
    <path d={pathOf(rows.map(r => r.remainingTenths), n, y)} className={styles.line}/>
  </Frame>;
}

/** Both charts' numbers, a row per bucket (the selected one marked). */
export function BucketTable({ s, e, rows, minute }: { s: SloScenario; e: SloEvents; rows: readonly BudgetRow[]; minute: number }) {
  return <details className={base.details}><summary>每個時段的數值表（兩張圖的文字版）</summary>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>每個時段的事件、SLI 與錯誤預算（{s.buckets} 個時段，每段 {s.bucketMinutes} 分鐘）</caption>
      <thead><tr><th scope="col">時段</th><th scope="col">全部</th><th scope="col">好</th><th scope="col">壞</th><th scope="col">SLI</th>
        <th scope="col">累計的壞事件</th><th scope="col">剩下的預算</th></tr></thead>
      <tbody>{rows.map((r, t) => <tr key={t} data-current={t === minute ? '' : undefined}>
        <th scope="row">{bucketText(s, t)}</th><td>{n0(e.total[t])}</td><td>{n0(e.good[t])}</td><td>{n0(r.bad)}</td>
        <td data-bad={e.total[t] && e.good[t] * 10000 < s.objective.targetPermyriad * e.total[t] ? '' : undefined}>{sliText(sliThousandths(e.good[t], e.total[t]))}</td>
        <td>{n0(r.consumed)}</td><td data-bad={r.remaining <= 0 ? '' : undefined}>{n0(r.remaining)}（{tenthsText(r.remainingTenths)}%）</td>
      </tr>)}</tbody>
    </table></div>
  </details>;
}
