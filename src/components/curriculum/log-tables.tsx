'use client';

import { useState } from 'react';
import { roundHalfUp } from '@/lib/devops/history';
import { groupCounts, sharedIds, traceOf, type GroupBy } from '@/lib/devops/log-query';
import { LEVEL_LABEL, tsText, type LogRecord } from '@/lib/devops/logs';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D4: the log viewer's tables: the matching records a page at a time (a fixed page size, so the pages are the same
 * on the server and in the browser), the group counts, and a request followed across services by its correlation id.
 */

export const PAGE_SIZE = 20;
const n0 = (x: number) => x.toLocaleString('en-US');
export const fieldsText = (r: Pick<LogRecord, 'fields'>) => Object.entries(r.fields).map(([k, v]) => `${k}=${v}`).join(' ');
const Level = ({ r }: { r: LogRecord }) => <td data-level={r.level}>{LEVEL_LABEL[r.level]}（{r.level}）</td>;

/** The records that match, PAGE_SIZE to a page, with buttons to move between pages. */
export function LogResults({ records, page, setPage, total }: { records: readonly LogRecord[]; page: number; setPage: (p: number) => void; total: number }) {
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE)), at = Math.min(page, pages - 1);
  const rows = records.slice(at * PAGE_SIZE, at * PAGE_SIZE + PAGE_SIZE);
  return <>
    <p className={styles.facts} aria-live="polite">符合的紀錄 {n0(records.length)} 筆（共 {n0(total)} 筆）；
      {records.length ? `第 ${at + 1}／${pages} 頁，第 ${n0(at * PAGE_SIZE + 1)}–${n0(at * PAGE_SIZE + rows.length)} 筆。` : '沒有符合的紀錄。'}</p>
    {records.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
      <caption>符合篩選的紀錄（依時間，每頁 {PAGE_SIZE} 筆）</caption>
      <thead><tr><th scope="col">#</th><th scope="col">時間</th><th scope="col">服務</th><th scope="col">主機</th><th scope="col">等級</th><th scope="col">訊息</th><th scope="col">欄位</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.n}>
        <th scope="row">{r.n}</th><td>{tsText(r.ts)}</td><td>{r.service}</td><td>{r.host}</td><Level r={r}/>
        <td className={styles.wrap}>{r.message}</td><td className={styles.wrap}><code>{fieldsText(r)}</code></td>
      </tr>)}</tbody>
    </table></div>}
    {pages > 1 && <div className={base.vizControls} role="group" aria-label="換頁">
      <button type="button" disabled={at === 0} onClick={() => setPage(0)}>第一頁</button>
      <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)}>上一頁</button>
      <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>下一頁</button>
      <button type="button" disabled={at >= pages - 1} onClick={() => setPage(pages - 1)}>最後一頁</button>
    </div>}
  </>;
}

/** How many matching records each service, level, host or field value has. */
export function GroupTable({ id, records, fields }: { id: string; records: readonly LogRecord[]; fields: readonly string[] }) {
  const [by, setBy] = useState<GroupBy>('service');
  const { groups, missing } = groupCounts(records, by);
  const shown = groups.slice(0, 30);
  const pct = (n: number) => records.length ? `${roundHalfUp(n * 100, records.length)}%` : '—';
  return <>
    <div className={styles.controls}>
      <label htmlFor={`${id}-group`}>分組依據</label>
      <select id={`${id}-group`} className={styles.select} value={by} onChange={e => setBy(e.target.value)}>
        <option value="service">服務</option><option value="level">等級</option><option value="host">主機</option>
        {fields.map(f => <option key={f} value={f}>欄位 {f}</option>)}
      </select>
    </div>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>符合篩選的紀錄依{by === 'service' ? '服務' : by === 'level' ? '等級' : by === 'host' ? '主機' : `欄位 ${by}`}分組（筆數多的在前{groups.length > shown.length ? `，只列前 ${shown.length} 組，共 ${groups.length} 組` : ''}）</caption>
      <thead><tr><th scope="col">值</th><th scope="col">筆數</th><th scope="col">比例</th></tr></thead>
      <tbody>{shown.map(g => <tr key={g.key}><th scope="row">{by === 'level' && g.key in LEVEL_LABEL ? `${LEVEL_LABEL[g.key as keyof typeof LEVEL_LABEL]}（${g.key}）` : g.key}</th><td>{n0(g.count)}</td><td>{pct(g.count)}</td></tr>)}
        {missing > 0 && <tr><th scope="row">（沒有這個欄位）</th><td>{n0(missing)}</td><td>{pct(missing)}</td></tr>}
        {!records.length && <tr><td colSpan={3}>沒有符合的紀錄。</td></tr>}</tbody>
    </table></div>
  </>;
}

/** A request followed by its correlation id across services, with the seconds between records. */
export function TraceView({ id, records, field }: { id: string; records: readonly LogRecord[]; field: string }) {
  const ids = sharedIds(records, field);
  const [chosen, setChosen] = useState(ids[0] ?? '');
  const t = chosen ? traceOf(records, field, chosen) : undefined;
  if (!ids.length) return <p className={styles.facts}>沒有出現在兩筆以上紀錄的 {field}。</p>;
  return <>
    <div className={styles.controls}>
      <label htmlFor={`${id}-trace`}>{field}（關聯 ID）</label>
      <select id={`${id}-trace`} className={styles.select} value={chosen} onChange={e => setChosen(e.target.value)}>
        {ids.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
    {t && <>
      <p className={styles.facts} aria-live="polite">{field} = {t.id}：{t.steps.length} 筆紀錄，經過的服務依序是 {t.services.join(' → ')}；從第一筆到最後一筆 {t.elapsed} 秒
        {t.firstError ? `；第一個錯誤在 ${t.firstError.service}（${tsText(t.firstError.ts)}）` : '；沒有錯誤'}。</p>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>{field} = {t.id} 的紀錄（依時間；Δ 是和前一筆相差的秒數）</caption>
        <thead><tr><th scope="col">#</th><th scope="col">時間</th><th scope="col">Δ（秒）</th><th scope="col">距第一筆（秒）</th><th scope="col">服務</th><th scope="col">主機</th><th scope="col">等級</th><th scope="col">訊息</th></tr></thead>
        <tbody>{t.steps.map((s, i) => <tr key={s.record.n}>
          <th scope="row">{s.record.n}</th><td>{tsText(s.record.ts)}</td><td>{i ? `+${s.delta}` : '—'}</td><td>{s.since}</td>
          <td>{s.record.service}</td><td>{s.record.host}</td><Level r={s.record}/><td className={styles.wrap}>{s.record.message}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </>;
}
