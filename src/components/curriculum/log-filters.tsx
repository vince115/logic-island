'use client';

import { RotateCcw } from 'lucide-react';
import { FIELD_OPS, type FieldOp, type LogFilter } from '@/lib/devops/log-query';
import { LEVEL_LABEL, LOG_LEVELS, parseTs, type LogLevel } from '@/lib/devops/logs';
import base from './curriculum.module.css';
import styles from './devops-explorer.module.css';

/*
 * CICD-0 D4: the log viewer's filter, as controls only (no query language): a service, the lowest level, one field
 * condition and a time range. The values are the learner's text; readFilter turns them into a LogFilter or says what
 * cannot be read (the controls are then aria-invalid and point at the role="alert" list).
 */

export type FilterFields = { service: string; level: string; field: string; op: string; value: string; from: string; to: string };
export const EMPTY_FILTER: FilterFields = { service: '', level: '', field: '', op: '=', value: '', from: '', to: '' };

const OP_TEXT: Record<FieldOp, string> = { '=': '= 等於', '!=': '!= 不等於', '>': '> 大於', '>=': '>= 大於或等於', '<': '< 小於', '<=': '<= 小於或等於' };

/** The filter the fields describe, or what cannot be read. */
export function readFilter(f: FilterFields): { filter?: LogFilter; issues: string[] } {
  const issues: string[] = [], filter: LogFilter = {};
  if (f.service) filter.service = f.service;
  if (f.level) filter.minLevel = f.level as LogLevel;
  if (f.field) {
    const op = f.op as FieldOp, raw = f.value.normalize('NFKC').trim();
    if (!raw) issues.push(`還沒有填「${f.field}」要比較的值。`);
    else if (op !== '=' && op !== '!=') {
      if (!/^-?\d+$/.test(raw)) issues.push(`「${op}」只能和整數比較。`);
      else filter.fields = [{ name: f.field, op, value: Number(raw) }];
    } else filter.fields = [{ name: f.field, op, value: raw }];
  }
  const time = (text: string, label: string) => {
    if (!text.trim()) return undefined;
    const s = parseTs(text);
    if (s === undefined) issues.push(`「${label}」要寫成秒數或「分:秒」（例如 12:05）。`);
    return s;
  };
  const from = time(f.from, '從'), to = time(f.to, '到（不含）');
  if (from !== undefined) filter.from = from;
  if (to !== undefined) filter.to = to;
  if (from !== undefined && to !== undefined && from >= to) issues.push('時間範圍的「從」要早於「到」。');
  return issues.length ? { issues } : { filter, issues };
}

export function LogFilterFields({ id, values, set, services, fields, invalid, describedBy, reset }: {
  id: string; values: FilterFields; set: (key: keyof FilterFields, value: string) => void;
  services: readonly string[]; fields: readonly string[]; invalid: boolean; describedBy: string; reset: () => void;
}) {
  const aria = { 'aria-invalid': invalid ? true : undefined, 'aria-describedby': invalid ? describedBy : undefined } as const;
  return <>
    <div className={styles.controls}>
      <label htmlFor={`${id}-service`}>服務</label>
      <select id={`${id}-service`} className={styles.select} value={values.service} onChange={e => set('service', e.target.value)}>
        <option value="">全部的服務</option>
        {services.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <label htmlFor={`${id}-level`}>最低等級</label>
      <select id={`${id}-level`} className={styles.select} value={values.level} onChange={e => set('level', e.target.value)}>
        <option value="">全部的等級</option>
        {LOG_LEVELS.slice(1).map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}（{l}）以上</option>)}
      </select>
      <label htmlFor={`${id}-field`}>欄位</label>
      <select id={`${id}-field`} className={styles.select} value={values.field} onChange={e => set('field', e.target.value)}>
        <option value="">（不依欄位篩選）</option>
        {fields.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <label htmlFor={`${id}-op`}>比較</label>
      <select id={`${id}-op`} className={styles.select} value={values.op} disabled={!values.field} onChange={e => set('op', e.target.value)}>
        {FIELD_OPS.map(op => <option key={op} value={op}>{OP_TEXT[op]}</option>)}
      </select>
      <label htmlFor={`${id}-value`}>值</label>
      <input id={`${id}-value`} className={styles.input} value={values.value} disabled={!values.field} spellCheck={false} autoCapitalize="off" autoComplete="off"
        placeholder={values.field ? '例如 500 或 req-7f3a' : '先選欄位'} onChange={e => set('value', e.target.value)} {...aria}/>
      <label htmlFor={`${id}-from`}>從（秒或 分:秒）</label>
      <input id={`${id}-from`} className={styles.input} value={values.from} inputMode="numeric" spellCheck={false} autoComplete="off" placeholder="例如 0:00"
        onChange={e => set('from', e.target.value)} {...aria}/>
      <label htmlFor={`${id}-to`}>到（不含）</label>
      <input id={`${id}-to`} className={styles.input} value={values.to} inputMode="numeric" spellCheck={false} autoComplete="off" placeholder="例如 15:00"
        onChange={e => set('to', e.target.value)} {...aria}/>
    </div>
    <div className={base.vizControls}><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>清除篩選</button></div>
  </>;
}
