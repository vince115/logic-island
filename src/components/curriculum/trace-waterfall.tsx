'use client';

import { useRef, type KeyboardEvent } from 'react';
import { spanLabel, type TraceAnalysis } from '@/lib/devops/trace-query';
import { SPAN_KIND_LABEL, STATUS_LABEL } from '@/lib/devops/traces';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D5: one trace as a waterfall (CSS bars on a shared time axis, one row per span, indented by depth; error spans
 * and the critical path's segments marked) and the same numbers as a table. Each row's label is a button: the arrow keys
 * (and Home / End) move between spans, and the selected span is described in an aria-live summary.
 */

const n0 = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${Math.max(0, Math.min(100, x)).toFixed(3)}%`;

export function spanSummary(a: TraceAnalysis, i: number): string {
  const r = a.rows[i], s = r.span;
  return `第 ${i + 1}／${a.rows.length} 個 span：${spanLabel(s)}（${SPAN_KIND_LABEL[s.kind]}，${STATUS_LABEL[s.status]}），從 ${n0(s.start)} ms 到 ${n0(s.end)} ms，持續 ${n0(s.duration)} ms，`
    + `自身時間 ${n0(r.self)} ms；${r.onPath ? `在關鍵路徑上（其中 ${n0(r.critical)} ms 是它自己的時間）` : '不在關鍵路徑上'}。`;
}

export function TraceWaterfall({ analysis, selected, setSelected }: { analysis: TraceAnalysis; selected: number; setSelected: (i: number) => void }) {
  const t = analysis.trace, span = Math.max(1, t.duration);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const x = (ms: number) => (ms - t.start) / span * 100;
  const segs = (i: number) => analysis.segments.filter(g => g.span === analysis.rows[i].span && g.to > g.from);
  const move = (e: KeyboardEvent) => {
    const to = { ArrowUp: selected - 1, ArrowDown: selected + 1, ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: analysis.rows.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(analysis.rows.length - 1, to));
    setSelected(i);
    buttons.current[i]?.focus();
  };
  const b = analysis.bottleneck;
  return <>
    <p className={styles.facts}>{`這個追蹤有 ${analysis.rows.length} 個 span，從 ${n0(t.start)} ms 到 ${n0(t.end)} ms，共 ${n0(t.duration)} ms`}
      {t.error ? '，其中有錯誤的 span' : '，沒有錯誤'}{`。關鍵路徑依序經過 ${analysis.pathServices.join(' → ')}；各服務在關鍵路徑上的時間：`}
      {analysis.byService.map(x => `${x.service} ${n0(x.ms)} ms`).join('、')}{b ? `；瓶頸是 ${b.service}。` : '；沒有單一的瓶頸（時間相同）。'}</p>
    <p className={styles.facts} aria-live="polite">{spanSummary(analysis, selected)}</p>
    <ul className={styles.legend} aria-label="圖例">
      <li><span className={`${styles.swatch} ${styles.to}`}/>span 的期間</li>
      <li><span className={`${styles.swatch} ${styles.dropped}`}/>狀態是錯誤的 span</li>
      <li><span className={`${styles.swatch} ${styles.pathSwatch}`}/>關鍵路徑上屬於它自己的時間</li>
    </ul>
    <ol className={styles.waterfall} aria-label="瀑布圖（每列一個 span；用方向鍵或 Home、End 切換）" onKeyDown={move}>
      {analysis.rows.map((r, i) => <li key={r.span.id} className={styles.wfRow} data-selected={i === selected ? '' : undefined}>
        <button type="button" ref={el => { buttons.current[i] = el; }} className={styles.wfLabel} aria-pressed={i === selected} tabIndex={i === selected ? 0 : -1}
          style={{ paddingLeft: `calc(${r.span.depth * 0.8}em + 6px)` }} onClick={() => setSelected(i)}>
          {spanLabel(r.span)}<small>{n0(r.span.duration)} ms</small>
        </button>
        <span className={styles.track} aria-hidden>
          <span className={styles.bar} data-error={r.span.status === 'error' ? '' : undefined} style={{ left: pct(x(r.span.start)), width: pct(Math.max(0.4, r.span.duration / span * 100)) }}/>
          {segs(i).map(g => <span key={g.from} className={styles.pathSeg} style={{ left: pct(x(g.from)), width: pct((g.to - g.from) / span * 100) }}/>)}
        </span>
      </li>)}
    </ol>
    <p className={styles.wfAxis} aria-hidden><span>{n0(t.start)} ms</span><span>{n0(t.start + Math.round(t.duration / 2))} ms</span><span>{n0(t.end)} ms</span></p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>每個 span 的時間（瀑布圖的文字版，時間是從追蹤開始算起的毫秒）</caption>
      <thead><tr><th scope="col">#</th><th scope="col">span（服務：操作）</th><th scope="col">種類</th><th scope="col">狀態</th><th scope="col">開始</th><th scope="col">持續</th>
        <th scope="col">自身時間</th><th scope="col">關鍵路徑</th></tr></thead>
      <tbody>{analysis.rows.map((r, i) => <tr key={r.span.id} data-current={i === selected ? '' : undefined}>
        <th scope="row">{i + 1}</th><td>{'　'.repeat(r.span.depth)}{spanLabel(r.span)}</td><td>{SPAN_KIND_LABEL[r.span.kind]}</td>
        <td data-bad={r.span.status === 'error' ? '' : undefined}>{STATUS_LABEL[r.span.status]}</td>
        <td>{n0(r.span.start)}</td><td>{n0(r.span.duration)}</td><td>{n0(r.self)}</td>
        <td>{r.onPath ? `在路徑上（自己 ${n0(r.critical)} ms）` : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
