import { DATASETS, type DatasetId } from '@/lib/sql/datasets';
import type { SqlTable } from '@/lib/sql/engine';
import styles from './sql.module.css';

/** A query result as a real table (headers, NULL written out), scrolling sideways on phones. No state: server or client. */
export function SqlResultTable({ table, caption, truncated }: { table: SqlTable; caption: string; truncated?: boolean }) {
  return <div className={styles.resultWrap}>
    <table className={styles.result}>
      <caption>{caption}：{table.rows.length} 列{truncated ? '（只顯示前面的資料列）' : ''}</caption>
      <thead><tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
      <tbody>{table.rows.length
        ? table.rows.map((row, r) => <tr key={r}>{row.map((v, c) => v === null
          ? <td key={c} className={styles.null}>NULL</td>
          : <td key={c} data-type={typeof v}>{String(v)}</td>)}</tr>)
        : <tr><td colSpan={Math.max(1, table.columns.length)} className={styles.empty}>沒有符合的資料列（0 列）</td></tr>}</tbody>
    </table>
  </div>;
}

/** The tables of a dataset, so the learner knows what to query. */
export function DatasetSchema({ dataset }: { dataset: DatasetId }) {
  const data = DATASETS[dataset];
  return <details className={styles.schema}>
    <summary>資料表：{data.title}（{data.tables.map(t => t.name).join('、')}）</summary>
    <p className={styles.help}>{data.description}</p>
    <div className={styles.schemaTables}>{data.tables.map(t => <div key={t.name}>
      <strong><code>{t.name}</code>（{t.label}）</strong>
      <ul>{t.columns.map(c => <li key={c.name}><code>{c.name}</code> <span>{c.type}</span>{c.note ? ` · ${c.note}` : ''}</li>)}</ul>
    </div>)}</div>
  </details>;
}
