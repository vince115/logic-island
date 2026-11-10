import { analyzeDecomposition, showFd, showSet, type DecompositionAnalysis, type RelationAnalysis } from '@/lib/normalization/fd';
import type { NfRelation, NfStepsExample } from '@/content/curriculum/schema';
import { Rich } from './rich';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1b normalization-steps, the part without state: a relation with its dependencies, and a worked normalization
 * whose keys, normal forms, losslessness and kept dependencies are all computed by src/lib/normalization/fd.ts (the
 * lesson only names the parts). Rendered on the server for examples and reused by the workbench.
 */

export function RelationHeader({ relation }: { relation: NfRelation }) {
  return <>
    <p className={styles.row}><strong>{relation.name}</strong>（{relation.attributes.join(', ')}）</p>
    {relation.labels && <p className={base.muted}>{relation.attributes.map(a => `${a}：${relation.labels![a] ?? ''}`).join('；')}</p>}
    <ul className={styles.fds} aria-label="函數相依">{relation.fds.map(fd => <li key={showFd(fd)}>{showFd(fd)}</li>)}</ul>
    {relation.sample && <div className={base.tableWrap}><table className={base.table}>
      <caption className={base.muted}>範例資料（{relation.sample.length} 列）</caption>
      <thead><tr>{relation.attributes.map(a => <th key={a} scope="col">{a}</th>)}</tr></thead>
      <tbody>{relation.sample.map((row, r) => <tr key={r}>{row.map((v, c) => <td key={c}>{v === null ? 'NULL' : String(v)}</td>)}</tr>)}</tbody>
    </table></div>}
  </>;
}

export function PartAnalysis({ name, part }: { name: string; part: RelationAnalysis }) {
  return <div className={styles.part}>
    <strong>{name}（{part.attributes.join(', ')}）</strong>
    <ul className={styles.analysis}>
      <li>候選鍵：{part.keys.map(showSet).join('、')}</li>
      <li>成立的相依：{part.fds.length ? part.fds.map(showFd).join('；') : '只有平凡相依'}</li>
      <li>最高正規形式：<span className={styles.badge} data-ok={part.form === 'BCNF'}>{part.form}</span>{part.violation && <>，未達 {part.violation.form}：{part.violation.reason}</>}</li>
    </ul>
  </div>;
}

/** Whether the whole decomposition keeps the data (lossless) and the rules (dependencies). */
export function DecompositionSummary({ analysis }: { analysis: DecompositionAnalysis }) {
  return <p className={styles.row}>
    <span className={styles.badge} data-ok={analysis.lossless}>{analysis.lossless ? '無損分解' : '有損：合併回來會多出資料列'}</span>
    <span className={styles.badge} data-ok={!analysis.lost.length}>{analysis.lost.length ? `無法在單表檢查：${analysis.lost.map(showFd).join('；')}` : '保留所有函數相依'}</span>
    {analysis.missing.length > 0 && <span className={styles.badge} data-ok={false}>遺漏：{analysis.missing.join('、')}</span>}
  </p>;
}

export function NfStepsView({ example }: { example: NfStepsExample }) {
  const { relation } = example;
  return <div className={base.example}>
    <h3>{example.title}</h3>
    <p className={base.muted}><Rich text={example.description}/></p>
    <RelationHeader relation={relation}/>
    <ol className={styles.steps}>{example.steps.map(step => {
      const analysis = analyzeDecomposition(relation.attributes, step.parts.map(p => p.attributes), relation.fds);
      return <li key={step.title} className={styles.step}>
        <h4>{step.title}</h4>
        <p><Rich text={step.note}/></p>
        <ul className={styles.parts}>{step.parts.map((p, i) => <li key={p.name}><PartAnalysis name={p.name} part={analysis.parts[i]}/></li>)}</ul>
        {step.parts.length > 1 && <DecompositionSummary analysis={analysis}/>}
      </li>;
    })}</ol>
  </div>;
}
