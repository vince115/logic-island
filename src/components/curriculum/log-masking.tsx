'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { fieldNames } from '@/lib/devops/log-query';
import { jsonLine, type LogRecord } from '@/lib/devops/logs';
import { parseMaskRules, PATTERNS, redactLine, redactOutcome, redactRecord } from '@/lib/devops/redact';
import { REDACT_FIELD } from '@/lib/devops/logs-check';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D4: masking sensitive data. MaskRulesField is the rules' text box (one rule a line), shared by the explorer and
 * the redact exercise; MaskingEditor applies the rules to the lesson's records and raw lines and shows the redacted JSON
 * lines and what the rules did (and, when the lesson names them, the values that must be hidden or kept).
 */

export function MaskRulesField({ id, value, set, invalid, describedBy }: { id: string; value: string; set: (v: string) => void; invalid?: boolean; describedBy?: string }) {
  return <div className={styles.rulesField}>
    <label htmlFor={`${id}-rules`}>{REDACT_FIELD.rules}</label>
    <textarea id={`${id}-rules`} className={styles.rules} value={value} rows={4} spellCheck={false} autoCapitalize="off" autoComplete="off"
      aria-invalid={invalid ? true : undefined} aria-describedby={invalid ? describedBy : `${id}-patterns`} onChange={e => set(e.target.value)}/>
    <ul id={`${id}-patterns`} className={styles.patterns} aria-label="可以用的樣式">
      {Object.entries(PATTERNS).map(([k, p]) => <li key={k}><code>pattern {k}</code>：{p.label}</li>)}
      <li><code>field 欄位名稱</code>：整個欄位的值換成 ***</li>
    </ul>
  </div>;
}

export function MaskingEditor({ id, records, raw, initial, checks }: {
  id: string; records: readonly LogRecord[]; raw: readonly { id: string; text: string }[]; initial: readonly string[];
  checks?: { mustHide: string[]; mustKeep: string[] };
}) {
  const [text, setText] = useState(initial.join('\n'));
  const { rules, issues } = parseMaskRules(text, fieldNames(records));
  // The lesson's own records (not the generated traffic) are where its sensitive values are; they are few.
  const written = records.filter(r => !r.generated);
  const outcome = issues.length ? undefined : redactOutcome(written, raw, rules, checks?.mustHide ?? [], checks?.mustKeep ?? []);
  const after = outcome ? [...written.map(r => jsonLine(redactRecord(r, rules))), ...raw.map(l => redactLine(l.text, rules))] : [];
  return <>
    <MaskRulesField id={id} value={text} set={setText} invalid={issues.length > 0} describedBy={`${id}-mask-issues`}/>
    <div className={base.vizControls}><button type="button" onClick={() => setText(initial.join('\n'))}><RotateCcw size={14} aria-hidden/>恢復課程的規則</button></div>
    {issues.length > 0 && <ul id={`${id}-mask-issues`} className={styles.issues} role="alert">{issues.map(m => <li key={m}>{m}</li>)}</ul>}
    {outcome && <>
      <div aria-live="polite">
        <p className={styles.facts}>{rules.length ? `${rules.length} 條規則改動了 ${outcome.masked} 個值（訊息、欄位或原始行）。` : '還沒有規則：日誌原樣送出。'}</p>
        {checks && <ul className={styles.checkList} aria-label="遮蔽的結果">
          {checks.mustHide.map(v => { const leak = outcome.leaks.find(l => l.value === v);
            return <li key={`h-${v}`} data-bad={leak ? '' : undefined}>必須隱藏「{v}」：{leak ? `仍看得到（${leak.where}）` : '已隱藏'}</li>; })}
          {checks.mustKeep.map(v => { const lost = outcome.lost.find(l => l.value === v);
            return <li key={`k-${v}`} data-bad={lost ? '' : undefined}>必須保留「{v}」：{lost ? `被遮掉了（剩 ${lost.after}／${lost.before} 次）` : '仍保留'}</li>; })}
        </ul>}
      </div>
      <details className={base.details}><summary>遮蔽後的日誌（課程寫的 {written.length} 筆紀錄{raw.length ? `與 ${raw.length} 行原始行` : ''}，JSON Lines）</summary>
        <pre className={styles.jsonLines} tabIndex={0} aria-label="遮蔽後的日誌">{after.join('\n')}</pre>
      </details>
    </>}
  </>;
}
