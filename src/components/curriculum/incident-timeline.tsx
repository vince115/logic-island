import type { Dashboard } from '@/lib/devops/dashboard';
import { EVENT_LABEL, incidentTimes, severityOf, type Incident, type SeverityMatrix } from '@/lib/devops/incident';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D3: the incidents of a dashboard as text: each one's recorded events in time order, the times computed from
 * them (detect, acknowledge, mitigate, recover) and its severity from the lesson's matrix, with the matrix as a table
 * whose matching cell is marked. Everything here is already text, so it is its own equivalent.
 */

const dur = (x: number | undefined) => x === undefined ? '—' : `${x} 分鐘`;

function Matrix({ m, incident }: { m: SeverityMatrix; incident: Incident }) {
  const sev = severityOf(incident, m);
  return <div className={styles.tableWrap}><table className={styles.table}>
    <caption>嚴重等級矩陣（「{incident.label}」落在標記的格子）</caption>
    <thead><tr><th scope="col">影響的使用者＼持續時間</th>{m.columns.map(c => <th key={c.label} scope="col">{c.label}</th>)}</tr></thead>
    <tbody>{m.rows.map((r, i) => <tr key={r.label}><th scope="row">{r.label}</th>
      {m.columns.map((c, j) => <td key={c.label} data-at={sev && sev.row === i && sev.column === j ? '' : undefined}>{m.levels[i][j]}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function IncidentTimeline({ dashboard }: { dashboard: Dashboard }) {
  const incidents = (dashboard.incidents ?? []).filter(i => i.events?.length || i.usersPercent !== undefined);
  if (!incidents.length) return null;
  return <>{incidents.map(i => {
    const t = incidentTimes(i), sev = dashboard.severity && severityOf(i, dashboard.severity);
    return <section key={i.id} aria-label={`事故時間線：${i.label}`}>
      <p className={styles.chartTitle}>事故時間線：{i.label}</p>
      <p className={styles.facts}>使用者受影響的期間：第 {i.start}–{i.end - 1} 分鐘（第 {i.end} 分鐘恢復）{i.usersPercent !== undefined ? `，約 ${i.usersPercent}% 的使用者受影響` : ''}{sev ? `；嚴重等級 ${sev.level}` : ''}。</p>
      {i.events?.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <caption>「{i.label}」的事件（依時間）</caption>
        <thead><tr><th scope="col">分鐘</th><th scope="col">事件</th><th scope="col">說明</th></tr></thead>
        <tbody>
          <tr><th scope="row">{i.start}</th><td>開始影響使用者</td><td>—</td></tr>
          {i.events.map((e, k) => <tr key={k}><th scope="row">{e.at}</th><td>{EVENT_LABEL[e.kind]}</td><td className={styles.wrap}>{e.text}</td></tr>)}
        </tbody>
      </table></div> : null}
      <dl className={styles.metrics} aria-label={`「${i.label}」的時間`}>
        <div><dt>偵測時間</dt><dd>{dur(t.detect)}<small>偵測到 − 開始</small></dd></div>
        <div><dt>確認時間</dt><dd>{dur(t.acknowledge)}<small>確認接手 − 偵測到</small></dd></div>
        <div><dt>止血時間</dt><dd>{dur(t.mitigate)}<small>止血 − 開始</small></dd></div>
        <div><dt>恢復時間</dt><dd>{dur(t.recover)}<small>恢復 − 開始（影響的期間）</small></dd></div>
      </dl>
      {dashboard.severity && i.usersPercent !== undefined && <Matrix m={dashboard.severity} incident={i}/>}
    </section>;
  })}</>;
}
