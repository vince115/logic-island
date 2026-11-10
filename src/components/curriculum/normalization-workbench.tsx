'use client';

import { useId, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { analyzeDecomposition, candidateKeys, closure, isSuperkey, showSet, type Attr } from '@/lib/normalization/fd';
import { checkDecomposition, checkKeys, type NfCheck } from '@/lib/normalization/check';
import type { NfExercise, NfRelation } from '@/content/curriculum/schema';
import { DecompositionSummary, PartAnalysis } from './normalization-view';
import base from './curriculum.module.css';
import styles from './db-activities.module.css';

/*
 * Phase F.1b normalization-steps, the interactive part: an attribute closure calculator and a decomposition workbench
 * (every part analysed as it is edited), and the DB10 exercises (candidate keys, decomposing to a normal form), checked
 * by meaning (src/lib/normalization/check.ts). Nothing is saved or sent anywhere.
 */

/** Checkboxes for a set of attributes, kept in the relation's order. */
function AttributePicker({ legend, attributes, value, onChange }: { legend: string; attributes: Attr[]; value: Attr[]; onChange: (v: Attr[]) => void }) {
  return <fieldset className={styles.picker}>
    <legend>{legend}</legend>
    {attributes.map(a => <label key={a}><input type="checkbox" checked={value.includes(a)}
      onChange={e => onChange(attributes.filter(x => x === a ? e.target.checked : value.includes(x)))}/>{a}</label>)}
  </fieldset>;
}

/** A list of attribute sets the learner edits: decomposition parts, or candidate keys. */
function SetsEditor({ noun, attributes, sets, onChange, analysis }: { noun: string; attributes: Attr[]; sets: Attr[][]; onChange: (s: Attr[][]) => void; analysis?: (i: number) => React.ReactNode }) {
  return <>
    <ol className={styles.parts}>{sets.map((set, i) => <li key={i} className={styles.part}>
      <AttributePicker legend={`${noun} ${i + 1}`} attributes={attributes} value={set} onChange={v => onChange(sets.map((s, j) => j === i ? v : s))}/>
      <div className={styles.row}><button type="button" onClick={() => onChange(sets.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden/>刪除{noun} {i + 1}</button></div>
      {analysis?.(i)}
    </li>)}</ol>
    <div className={base.vizControls}><button type="button" onClick={() => onChange([...sets, []])}><Plus size={14} aria-hidden/>新增{noun}</button></div>
  </>;
}

/** The lesson's own relation to explore freely: closures, keys, and any decomposition with its analysis. */
export function NfExplorer({ relation }: { relation: NfRelation }) {
  const [chosen, setChosen] = useState<Attr[]>([]);
  const [parts, setParts] = useState<Attr[][]>([relation.attributes]);
  const reach = closure(chosen, relation.fds), keys = candidateKeys(relation.attributes, relation.fds);
  const superkey = chosen.length > 0 && isSuperkey(chosen, relation.attributes, relation.fds);
  const minimal = superkey && keys.some(k => k.length === chosen.length && k.every(a => chosen.includes(a)));
  const filled = parts.filter(p => p.length);
  const analysis = filled.length ? analyzeDecomposition(relation.attributes, filled, relation.fds) : undefined;
  return <div className={styles.builder}>
    <h3>1. 屬性閉包</h3>
    <AttributePicker legend="選幾個屬性，看它們決定了什麼" attributes={relation.attributes} value={chosen} onChange={setChosen}/>
    <p className={styles.row} aria-live="polite">{chosen.length ? <>
      <span>{showSet(chosen)}⁺ = {showSet(relation.attributes.filter(a => reach.has(a)))}</span>
      <span className={styles.badge} data-ok={superkey}>{minimal ? '候選鍵' : superkey ? '超鍵（但不是最小）' : '不是超鍵'}</span>
    </> : '還沒有選擇屬性。'}</p>
    <h3>2. 分解與檢查</h3>
    <p className={base.muted}>每張表勾選它要保留的屬性；下面會即時算出每張表的候選鍵、成立的相依與最高正規形式，以及整個分解是否無損、是否保留所有相依。</p>
    <SetsEditor noun="表" attributes={relation.attributes} sets={parts} onChange={setParts}
      analysis={i => {
        if (!parts[i].length || !analysis) return null;
        const at = filled.indexOf(parts[i]);
        return at >= 0 ? <PartAnalysis name={`表 ${i + 1}`} part={analysis.parts[at]}/> : null;
      }}/>
    <div aria-live="polite">{analysis && filled.length > 1 && <DecompositionSummary analysis={analysis}/>}</div>
    <div className={base.vizControls}><button type="button" onClick={() => { setChosen([]); setParts([relation.attributes]); }}><RotateCcw size={14} aria-hidden/>回到原始的表</button></div>
  </div>;
}

/** One DB10 exercise: enter the candidate keys, or a decomposition; checked when the learner asks. */
export function NfExerciseBox({ exercise }: { exercise: NfExercise }) {
  const id = useId();
  const { relation } = exercise;
  const [sets, setSets] = useState<Attr[][]>(exercise.task === 'keys' ? [[]] : [[], []]);
  const [result, setResult] = useState<NfCheck>();
  const check = () => setResult(exercise.task === 'keys'
    ? checkKeys(relation.attributes, relation.fds, sets.filter(s => s.length), exercise.all)
    : checkDecomposition(relation.attributes, relation.fds, sets, exercise.target, exercise.preserve));
  return <div className={styles.builder} id={`${id}-box`}>
    <SetsEditor noun={exercise.task === 'keys' ? '候選鍵' : '表'} attributes={relation.attributes} sets={sets} onChange={s => { setSets(s); setResult(undefined); }}/>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={check}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={() => { setSets(exercise.task === 'keys' ? [[]] : [[], []]); setResult(undefined); }}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={styles.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確：每個條件都符合。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={styles.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
    </>}</div>
  </div>;
}
