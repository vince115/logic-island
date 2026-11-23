'use client';

import { useId, useMemo, useState } from 'react';
import { fieldNames, filterRecords, lineFormat } from '@/lib/devops/log-query';
import { correlationFieldOf, LEVEL_LABEL, LOG_LEVELS, logRecords, tsText } from '@/lib/devops/logs';
import type { LogsExplorer } from '@/lib/devops/types';
import { EMPTY_FILTER, LogFilterFields, readFilter, type FilterFields } from './log-filters';
import { MaskingEditor } from './log-masking';
import { GroupTable, LogResults, TraceView } from './log-tables';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 devops-explorer stage D4 (docs/curriculum/CICD0_DEVOPS_CAPABILITY.md §10.4), part of the monitoring-dashboard
 * activity: a centralized log viewer. Filters are controls (no query language); the matching records are a paged table,
 * with group counts beside them; a request is followed across services by its correlation id; masking rules are applied
 * to the lesson's records. Everything is text and tables, computed in the browser from the lesson's data by
 * src/lib/devops (the bulk traffic from a fixed seed), so the server render and the browser agree.
 */

const ILLUSTRATIVE = '示意資料：由課程撰寫或以固定的種子產生的教學日誌，不是任何真實服務或日誌產品的資料；篩選、分組與遮蔽的規則是本課程自己的模型。';
const FORMAT_LABEL = { json: '結構化（JSON）', logfmt: '結構化（key=value）', text: '非結構化（純文字）' } as const;

export function LogViewer({ explorer }: { explorer: LogsExplorer }) {
  const id = useId();
  const set0 = explorer.logs;
  const records = useMemo(() => logRecords(set0), [set0]);
  const services = useMemo(() => [...new Set(records.map(r => r.service))].sort(), [records]);
  const fields = useMemo(() => fieldNames(records), [records]);
  const cf = correlationFieldOf(set0);
  const [values, setValues] = useState<FilterFields>(EMPTY_FILTER);
  const [page, setPage] = useState(0);
  const { filter, issues } = readFilter(values);
  // At most a few thousand records: filtered on every render.
  const hits = filter ? filterRecords(records, filter) : [];
  const set = (k: keyof FilterFields, v: string) => { setValues(old => ({ ...old, [k]: v })); setPage(0); };
  const first = records[0], last = records[records.length - 1];
  const levels = LOG_LEVELS.map(l => `${LEVEL_LABEL[l]} ${records.filter(r => r.level === l).length}`).join('、');
  return <div className={base.example} data-devops-explorer="logs">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <p className={styles.facts}>{`${records.length.toLocaleString('en-US')} 筆紀錄，從 ${tsText(first.ts)} 到 ${tsText(last.ts)}（時間是從開始算起的分:秒）；服務：${services.join('、')}；等級：${levels}。`}
      {set0.traffic ? `其中 ${set0.traffic.count.toLocaleString('en-US')} 筆是以固定種子產生的一般流量。` : ''}</p>
    <p className={styles.subhead}>篩選</p>
    <LogFilterFields id={id} values={values} set={set} services={services} fields={fields} invalid={issues.length > 0} describedBy={`${id}-filter-issues`}
      reset={() => { setValues(EMPTY_FILTER); setPage(0); }}/>
    {issues.length > 0 && <ul id={`${id}-filter-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {filter && <>
      <LogResults records={hits} page={page} setPage={setPage} total={records.length}/>
      <p className={styles.subhead}>分組計數</p>
      <GroupTable id={id} records={hits} fields={fields}/>
    </>}
    <p className={styles.subhead}>以關聯 ID 追蹤一個請求</p>
    <TraceView id={id} records={records} field={cf}/>
    {set0.raw?.length ? <>
      <p className={styles.subhead}>原始的日誌行</p>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>程式直接印出的日誌行</caption>
        <thead><tr><th scope="col">行</th><th scope="col">內容</th></tr></thead>
        <tbody>{set0.raw.map(l => <tr key={l.id}><th scope="row">{l.id}</th><td className={styles.wrap}><code>{l.text}</code></td></tr>)}</tbody>
      </table></div>
      <details className={base.details}><summary>解析的結果（每一行是不是結構化的）</summary>
        <ul>{set0.raw.map(l => { const f = lineFormat(l.text); return <li key={l.id}>{l.id}：{FORMAT_LABEL[f.kind]}{f.fields ? `，${f.fields} 個欄位` : '，只能用文字搜尋'}</li>; })}</ul>
      </details>
    </> : null}
    <p className={styles.subhead}>遮蔽敏感資料</p>
    <MaskingEditor id={id} records={records} raw={set0.raw ?? []} initial={explorer.masking ?? []} checks={explorer.checks}/>
  </div>;
}
