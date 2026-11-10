'use client';

import { useId, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { buildModel, checkRoles, MULTIPLICITIES, MULTIPLICITY_TEXT, ROLE_TEXT, type ErRole, type ErRoleKind, type ErTermResult, type Multiplicity } from '@/lib/er/model';
import type { ErExercise } from '@/content/curriculum/schema';
import { ErDiagram } from './er-diagram';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1b erd-builder: the learner reads a scenario and gives each term a role (entity, attribute of something,
 * relationship between two entities with how many on each side, or not modeled). The diagram is drawn from those
 * choices as they are made; "檢查" compares them with the reference by meaning (src/lib/er/model.ts). Nothing is saved
 * or sent anywhere; ER exercises do not count toward progress, like every exercise.
 */

type Roles = Record<string, ErRole | undefined>;

export function ErBuilder({ exercise }: { exercise: Pick<ErExercise, 'id' | 'terms' | 'answer' | 'accept' | 'termHints'> }) {
  const id = useId();
  const [roles, setRoles] = useState<Roles>({});
  const [results, setResults] = useState<ErTermResult[]>();
  const label = (termId: string) => exercise.terms.find(t => t.id === termId)?.label ?? termId;
  const entities = exercise.terms.filter(t => roles[t.id]?.role === 'entity');
  const owners = exercise.terms.filter(t => roles[t.id]?.role === 'entity' || roles[t.id]?.role === 'relationship');

  const set = (termId: string, role: ErRole | undefined) => { setRoles(r => ({ ...r, [termId]: role })); setResults(undefined); };
  /** A new role starts from sensible defaults (the first entities as owner and ends, "0 or many" both ways). */
  function choose(termId: string, kind: ErRoleKind | '') {
    const [first, second] = entities.filter(t => t.id !== termId).map(t => t.id);
    if (kind === '') set(termId, undefined);
    else if (kind === 'attribute') set(termId, { role: 'attribute', of: owners.find(t => t.id !== termId)?.id ?? '' });
    else if (kind === 'relationship') set(termId, { role: 'relationship', a: first ?? '', b: second ?? first ?? '', aToB: '0..N', bToA: '0..N' });
    else set(termId, { role: kind });
  }
  const update = <K extends ErRoleKind>(termId: string, patch: Partial<Extract<ErRole, { role: K }>>) =>
    set(termId, { ...roles[termId], ...patch } as ErRole);

  const model = buildModel(exercise.terms, roles);
  const byTerm = new Map(results?.map(r => [r.id, r]));
  const passed = results?.every(r => r.ok);
  return <div className={styles.builder}>
    <ul className={styles.terms} aria-label="情境中的詞語">
      {exercise.terms.map(term => {
        const role = roles[term.id], result = byTerm.get(term.id), f = `${id}-${term.id}`;
        return <li key={term.id}><fieldset className={styles.term} data-ok={result ? result.ok : undefined}>
          <legend>{term.label}</legend>
          <div className={styles.row}>
            <label htmlFor={`${f}-role`}>角色</label>
            <select id={`${f}-role`} value={role?.role ?? ''} onChange={e => choose(term.id, e.target.value as ErRoleKind | '')}>
              <option value="">請選擇</option>
              {(Object.keys(ROLE_TEXT) as ErRoleKind[]).map(k => <option key={k} value={k}>{ROLE_TEXT[k]}</option>)}
            </select>
          </div>
          {role?.role === 'entity' && <div className={styles.row}>
            <label><input type="checkbox" checked={!!role.weak} onChange={e => update<'entity'>(term.id, { weak: e.target.checked })}/>弱實體（要靠擁有者才能識別）</label>
          </div>}
          {role?.role === 'attribute' && <div className={styles.row}>
            <label htmlFor={`${f}-of`}>屬於</label>
            <select id={`${f}-of`} value={role.of} onChange={e => update<'attribute'>(term.id, { of: e.target.value })}>
              {!owners.some(o => o.id === role.of) && <option value={role.of}>（先標出實體或關係）</option>}
              {owners.filter(o => o.id !== term.id).map(o => <option key={o.id} value={o.id}>{o.label}（{ROLE_TEXT[roles[o.id]!.role]}）</option>)}
            </select>
            <label><input type="checkbox" checked={!!role.key} onChange={e => update<'attribute'>(term.id, { key: e.target.checked })}/>鍵</label>
            <label><input type="checkbox" checked={!!role.multivalued} onChange={e => update<'attribute'>(term.id, { multivalued: e.target.checked })}/>多值</label>
          </div>}
          {role?.role === 'relationship' && <>
            <div className={styles.row}>
              <label htmlFor={`${f}-a`}>連接</label>
              <select id={`${f}-a`} value={role.a} onChange={e => update<'relationship'>(term.id, { a: e.target.value })} aria-label={`${term.label}：第一個實體`}>
                {!entities.some(t => t.id === role.a) && <option value={role.a}>（先標出實體）</option>}
                {entities.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <span aria-hidden>與</span>
              <select value={role.b} onChange={e => update<'relationship'>(term.id, { b: e.target.value })} aria-label={`${term.label}：第二個實體`}>
                {!entities.some(t => t.id === role.b) && <option value={role.b}>（先標出實體）</option>}
                {entities.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {([['aToB', role.a, role.b], ['bToA', role.b, role.a]] as const).map(([side, from, to]) => <div key={side} className={styles.row}>
              <label htmlFor={`${f}-${side}`}>每個{label(from) || '？'}對應</label>
              <select id={`${f}-${side}`} value={role[side]} onChange={e => update<'relationship'>(term.id, { [side]: e.target.value as Multiplicity })}>
                {MULTIPLICITIES.map(m => <option key={m} value={m}>{MULTIPLICITY_TEXT[m]}（{m}）</option>)}
              </select>
              <span>{label(to) || '？'}</span>
            </div>)}
            <div className={styles.row}>
              <label><input type="checkbox" checked={!!role.identifying} onChange={e => update<'relationship'>(term.id, { identifying: e.target.checked })}/>識別關係（弱實體靠它識別）</label>
            </div>
          </>}
          {result && !result.ok && <p className={styles.feedback}>{result.message}</p>}
        </fieldset></li>;
      })}
    </ul>
    <ErDiagram model={model} title="你的 ER 圖"/>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={() => setResults(checkRoles(exercise.terms, exercise.answer, roles, exercise.termHints, exercise.accept))}>
        <Check size={14} aria-hidden/>檢查 ER 模型</button>
      <button type="button" onClick={() => { setRoles({}); setResults(undefined); }}><RotateCcw size={14} aria-hidden/>全部清除</button>
    </div>
    <div aria-live="polite">
      {results && <p className={styles.verdict} data-ok={passed}>{passed
        ? <><Check size={16} aria-hidden/>全部正確：每個詞語的角色、所屬與兩端數量都和參考模型一致。</>
        : <><X size={16} aria-hidden/>還有 {results.filter(r => !r.ok).length} 個詞語不對（已在上方標出原因）。</>}</p>}
    </div>
  </div>;
}
