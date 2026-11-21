'use client';

import { useId, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { checkNetworkAnswer, LAYER_MODELS, layerInfo, NETWORK_FIELDS, NODE_KIND_LABELS, type NetworkScene, type ProtocolHeader } from '@/lib/network/model';
import type { NetworkExercise } from '@/content/curriculum/schema';
import { Rich } from './rich';
import { Stepper } from './visualizations';
import base from './curriculum.module.css';
import activities from './db-activities.module.css';
import styles from './network-protocol.module.css';

/*
 * CN-0 network-protocol capability: one fixed scene (src/lib/network/model.ts) drawn three ways at the same step. The
 * sequence lists every message in order as an arrow between the nodes' columns (on a phone, as text); the packet shows
 * the current message's headers nested from the outermost layer to the payload; the node tables are those after the
 * message. Steps move with the shared stepper (buttons, arrow keys, Home / End) or by choosing a message; the step's
 * explanation is announced (aria-live). Nothing animates when the learner prefers reduced motion.
 */
export function NetworkSceneView({ scene }: { scene: NetworkScene }) {
  const [at, setAt] = useState(0);
  const id = useId();
  const node = (nodeId: string) => scene.nodes.find(n => n.id === nodeId)!;
  const column = (nodeId: string) => scene.nodes.findIndex(n => n.id === nodeId);
  const message = scene.messages[at];
  const route = (m: NetworkScene['messages'][number]) => `${node(m.from).label} → ${node(m.to).label}`;
  return <div className={base.example} data-network-scene={scene.id}>
    <h3>{scene.title}</h3>
    <p className={base.muted}><Rich text={scene.description}/></p>
    <div className={styles.sequenceScroll}>
      <div className={styles.sequence} style={{ '--nodes': scene.nodes.length } as React.CSSProperties}>
        <ol className={styles.nodes} aria-label="網路中的節點">{scene.nodes.map(n => <li key={n.id}>
          <strong>{n.label}</strong><span>{NODE_KIND_LABELS[n.kind]}</span>{n.addresses?.map(a => <small key={a}>{a}</small>)}</li>)}</ol>
        <ol className={styles.messages} aria-label={`訊息順序（共 ${scene.messages.length} 則）`}>{scene.messages.map((m, i) => {
          const from = column(m.from), to = column(m.to);
          return <li key={m.id} data-state={i < at ? 'done' : i === at ? 'current' : 'next'}>
            <button type="button" className={styles.messageButton} onClick={() => setAt(i)} aria-current={i === at ? 'step' : undefined}>
              <span className={styles.arrow} aria-hidden data-dir={from < to ? 'right' : 'left'} data-lost={m.lost || undefined}
                style={{ gridColumn: `${Math.min(from, to) + 1} / ${Math.max(from, to) + 2}`, '--span': Math.abs(to - from) + 1 } as React.CSSProperties}><span>{m.label}</span></span>
              <span className={styles.messageText}>{i + 1}. {route(m)}：{m.label}{m.lost ? '（遺失）' : ''}</span>
            </button>
          </li>;
        })}</ol>
      </div>
    </div>
    <Stepper at={at} count={scene.messages.length} set={setAt}/>
    <div className={styles.note} aria-live="polite" id={`${id}-note`}>
      <p className={styles.noteTitle}>步驟 {at + 1}／{scene.messages.length}：{route(message)}（{message.label}{message.lost ? '，遺失' : ''}）</p>
      <p><Rich text={message.note}/></p>
    </div>
    <div className={styles.panels}>
      <section className={styles.packet} aria-label={`這則訊息的各層標頭（${LAYER_MODELS[scene.model].name}，由外到內）`}>
        <h4>封包：由外到內（{LAYER_MODELS[scene.model].name}）</h4>
        <Encapsulation scene={scene} headers={message.headers} payload={message.payload}/>
      </section>
      {message.tables?.map(t => <div key={`${t.node}-${t.name}`} className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>{node(t.node).label}：{t.name}（這一步之後）</caption>
          <thead><tr>{t.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{t.rows.map((row, r) => <tr key={r} data-changed={t.changed?.includes(r) || undefined}>
            {row.map((cell, c) => c === 0 ? <th key={c} scope="row">{cell}{t.changed?.includes(r) ? <span className={styles.changed}>（這一步新增或更新）</span> : null}</th> : <td key={c}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>)}
    </div>
  </div>;
}

/** The headers from the outermost (lowest) layer in, each wrapping the next, and the payload innermost. */
function Encapsulation({ scene, headers, payload }: { scene: NetworkScene; headers: ProtocolHeader[]; payload?: string }) {
  const wrap = (i: number): React.ReactNode => {
    if (i < 0) return payload ? <div className={styles.payload}><span className={styles.layerName}>資料（payload）</span><code>{payload}</code></div> : null;
    const h = headers[i], layer = layerInfo(scene.model, h.layer);
    return <div className={styles.layer} data-layer={h.layer}>
      <p className={styles.layerName}>{layer?.name}（{layer?.en}）· {h.protocol}</p>
      <dl className={styles.fields}>{h.fields.map(f => <div key={f.name}><dt>{f.name}</dt><dd>{f.value}</dd></div>)}</dl>
      {wrap(i - 1)}
    </div>;
  };
  return <>{wrap(headers.length - 1)}</>;
}

export function NetworkExerciseBox({ exercise, scenes }: { exercise: NetworkExercise; scenes: NetworkScene[] }) {
  const fields = NETWORK_FIELDS[exercise.task];
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; messages: string[] }>();
  const name = useId();
  const set = (k: string, v: string) => { setValues(old => ({ ...old, [k]: v })); setResult(undefined); };
  const model = exercise.task === 'layer' ? scenes.find(s => s.id === exercise.scene)?.model : undefined;
  return <div className={activities.builder}>
    {exercise.task === 'firewall' ? <>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>用來檢查規則的封包（依序判斷，第一條符合的規則決定）</caption>
        <thead><tr>{['封包', '協定', '來源', '目的', '目的埠', '連線狀態'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{exercise.packets.map(p => <tr key={p.label}><th scope="row">{p.label}</th><td>{p.protocol}</td><td>{p.src}</td><td>{p.dst}</td><td>{p.port ?? '—'}</td><td>{p.state === 'established' ? '已建立' : '新連線'}</td></tr>)}</tbody>
      </table></div>
      <label className={styles.rulesLabel}>{fields.rules}
        <textarea className={styles.rules} rows={7} value={values.rules ?? ''} spellCheck={false} autoCapitalize="off"
          placeholder={'default deny\nallow tcp from any to 203.0.113.10 port 443'} onChange={e => set('rules', e.target.value)}/></label>
    </>
      : model ? <fieldset className={styles.choices}><legend>{fields.layer}</legend>
      {LAYER_MODELS[model].layers.map(l => <label key={l.id}><input type="radio" name={name} value={l.id} checked={values.layer === l.id} onChange={() => set('layer', l.id)}/>{l.name}（{l.en}）</label>)}
    </fieldset>
      : <div className={activities.row}>{Object.entries(fields).map(([k, label]) => <label key={k}>{label}
        <input className={styles.textInput} value={values[k] ?? ''} spellCheck={false} autoCapitalize="off" onChange={e => set(k, e.target.value)}/></label>)}</div>}
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={() => setResult(checkNetworkAnswer(exercise, scenes, values))}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={() => { setValues({}); setResult(undefined); }}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={activities.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={activities.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
    </>}</div>
  </div>;
}
