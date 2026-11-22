'use client';

import { useId, useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { crossEntropy, decode, encode, logLoss, perplexity, tokenCost, trainBpe, utf8, vocabulary } from '@/lib/llm/bpe';
import { labelOf, nearest, project, type Metric } from '@/lib/llm/embedding';
import { blanksOf, checkLlmAnswer, shapeOf, type EmbeddingExplorer, type LlmExercise, type SamplingExplorer, type TokenizerExplorer } from '@/lib/llm/lesson';
import { isSeed, MAX_SEED } from '@/lib/llm/prng';
import { distribution, generate, TEMPERATURE_MAX, type DecodeSettings } from '@/lib/llm/sampling';
import { Rich } from './rich';
import { Stepper } from './visualizations';
import base from './curriculum.module.css';
import activities from './db-activities.module.css';
import styles from './llm-explorer.module.css';

/*
 * LLM-0 llm-explorer capability (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md §6): the token, sampling and
 * embedding explorers and the exercise box. Everything is computed from the lesson's own data (src/lib/llm) in the
 * browser; the only randomness is the seeded generator, so the server render and the browser agree. Every explorer says
 * that its data is illustrative (示意資料).
 */

const ILLUSTRATIVE = '示意資料：數值由課程撰寫，用來說明原理，不是任何真實模型的輸出。';
/** How a token is shown: a space as ␣ and a line break as ↵, so token edges are visible. */
const shown = (text: string) => text.replace(/ /g, '␣').replace(/\n/g, '↵');
const percent = (p: number) => `${(p * 100).toFixed(1)}%`;
const fixed = (x: number, digits = 3) => x.toFixed(digits);
const hexBytes = (bytes: readonly number[]) => bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

// ---- token-explorer -----------------------------------------------------------------------------------------------
export function TokenExplorerView({ explorer }: { explorer: TokenizerExplorer }) {
  const id = useId();
  const [text, setText] = useState(explorer.text);
  const encoding = useMemo(() => encode(explorer.table, text), [explorer.table, text]);
  const [at, setAt] = useState(encoding.steps.length);
  const [showBytes, setShowBytes] = useState(false);
  const vocab = vocabulary(explorer.table);
  const change = (next: string) => { setText(next); setAt(encode(explorer.table, next).steps.length); };
  const step = Math.min(at, encoding.steps.length);
  const ids = step === 0 ? encoding.start : encoding.steps[step - 1].ids;
  const current = step > 0 ? encoding.steps[step - 1] : undefined;
  const chars = [...text];
  const roundTrip = decode(explorer.table, encoding.ids);
  const presets = [explorer.text, ...explorer.presets ?? []].filter((p, i, all) => all.indexOf(p) === i);
  return <div className={base.example} data-llm-explorer="token">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <label className={styles.field} htmlFor={`${id}-text`}>要斷詞的文字</label>
    <textarea id={`${id}-text`} className={styles.textArea} rows={2} value={text} spellCheck={false} autoCapitalize="off" onChange={e => change(e.target.value)}/>
    <div className={styles.presets} role="group" aria-label="範例文字">
      {presets.map(p => <button key={p} type="button" onClick={() => change(p)} aria-pressed={p === text}>{shown(p)}</button>)}
    </div>
    <p className={styles.counts}>字元 {chars.length} 個 · UTF-8 位元組 {encoding.bytes} 個 · token {encoding.ids.length} 個（合併 {encoding.steps.length} 步）</p>
    <ol className={styles.tokens} aria-label={`第 ${step} 步之後的 token（共 ${ids.length} 個）`}>
      {ids.map((tokenId, i) => {
        const token = vocab.tokens[tokenId];
        return <li key={i} className={styles.token} data-tone={i % 6} data-special={token.special || undefined} data-new={current?.merged === tokenId || undefined}>
          <span className={styles.tokenText}>{shown(token.spelling)}</span>
          <span className={styles.tokenId}>ID {tokenId}</span>
          {showBytes && <span className={styles.tokenBytes}>{token.special ? '特殊 token' : hexBytes(token.bytes)}</span>}
        </li>;
      })}
    </ol>
    <label className={styles.check}><input type="checkbox" checked={showBytes} onChange={e => setShowBytes(e.target.checked)}/>顯示每個 token 的位元組（十六進位）</label>
    <Stepper at={step} count={encoding.steps.length + 1} set={setAt} unit="合併"/>
    <div className={styles.note} aria-live="polite">
      {current
        ? <p>第 {step} 步：套用第 {current.rank} 條規則（ID {current.merged}）<code>{shown(vocab.tokens[current.left].spelling)}</code> ＋ <code>{shown(vocab.tokens[current.right].spelling)}</code> → <code>{shown(vocab.tokens[current.merged].spelling)}</code>，合併 {current.count} 處，剩 {ids.length} 個 token。</p>
        : <p>還沒有合併：每個位元組是一個 token（特殊 token 除外），共 {ids.length} 個。{encoding.steps.length ? '按「下一步」依規則順序合併。' : '沒有任何合併規則用得上。'}</p>}
    </div>
    <p className={styles.counts}>token ID：<code className={styles.ids}>{encoding.ids.join(' ')}</code></p>
    <p className={styles.counts}>解碼回文字：<code className={styles.ids}>{shown(roundTrip)}</code>{roundTrip === text ? '（與原文相同）' : ''}</p>
    {explorer.pricePer1k !== undefined && <p className={styles.counts}>以每 1,000 個 token {explorer.pricePer1k} 元（示意價格）估算：{encoding.ids.length} × {explorer.pricePer1k} ÷ 1,000 = {+tokenCost(encoding.ids.length, explorer.pricePer1k).toPrecision(12)} 元</p>}
    <details className={base.details}><summary>每個字元的 UTF-8 位元組（{chars.length} 個字元）</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">字元</th><th scope="col">位元組（十六進位）</th><th scope="col">個數</th></tr></thead>
        <tbody>{chars.map((c, i) => <tr key={i}><th scope="row">{shown(c)}</th><td><code>{hexBytes(utf8(c))}</code></td><td>{utf8(c).length}</td></tr>)}</tbody>
      </table></div>
    </details>
    <details className={base.details}><summary>合併規則（{explorer.table.merges.length} 條）與特殊 token</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">順序</th><th scope="col">合併</th><th scope="col">新 token 的 ID</th></tr></thead>
        <tbody>{vocab.tokens.filter(t => t.rank !== undefined).map(t => <tr key={t.id}>
          <th scope="row">{t.rank}</th><td><code>{shown(explorer.table.merges[t.rank!][0])}</code> ＋ <code>{shown(explorer.table.merges[t.rank!][1])}</code> → <code>{shown(t.spelling)}</code></td><td>{t.id}</td></tr>)}
          {vocab.tokens.filter(t => t.special).map(t => <tr key={t.id}><th scope="row">特殊</th><td><code>{t.spelling}</code>（不拆開、不合併）</td><td>{t.id}</td></tr>)}</tbody>
      </table></div>
      <p className={base.muted}>詞彙表：ID 0–255 是 256 種位元組，256 起依序是合併規則做出的 token，最後是特殊 token；共 {vocab.tokens.length} 個。</p>
    </details>
    {explorer.training && <TrainingView explorer={explorer}/>}
    {explorer.scoring?.length ? <ScoringView explorer={explorer}/> : null}
  </div>;
}

function TrainingView({ explorer }: { explorer: TokenizerExplorer }) {
  const { steps } = trainBpe(explorer.training!.corpus, explorer.table.merges.length, { minCount: explorer.training!.minCount, pretokenize: explorer.table.pretokenize });
  return <details className={base.details}><summary>合併規則從哪裡來：在語料上訓練</summary>
    <p>語料：<code className={styles.ids}>{shown(explorer.training!.corpus)}</code></p>
    <p className={base.muted}>每一輪數出所有相鄰 token 組合出現的次數，合併次數最多的一組；次數相同時，選在語料中最先出現的一組。</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th scope="col">輪次</th><th scope="col">合併</th><th scope="col">出現次數</th></tr></thead>
      <tbody>{steps.map(s => <tr key={s.rank}><th scope="row">{s.rank}</th><td><code>{shown(s.left)}</code> ＋ <code>{shown(s.right)}</code> → <code>{shown(s.merged)}</code></td><td>{s.count}</td></tr>)}</tbody>
    </table></div>
  </details>;
}

function ScoringView({ explorer }: { explorer: TokenizerExplorer }) {
  const vocab = vocabulary(explorer.table);
  return <details className={base.details}><summary>每個 token 的機率、交叉熵與困惑度</summary>
    {explorer.scoring!.map(s => {
      const ids = encode(explorer.table, s.text).ids;
      return <div key={s.id} className={styles.tableWrap}><table className={styles.table}>
        <caption>{s.label}：<code>{shown(s.text)}</code>（示意資料）</caption>
        <thead><tr><th scope="col">token</th><th scope="col">機率 p</th><th scope="col">−log₂ p（位元）</th></tr></thead>
        <tbody>{ids.map((tokenId, i) => <tr key={i}><th scope="row"><code>{shown(vocab.tokens[tokenId].spelling)}</code></th><td>{s.probabilities[i]}</td><td>{fixed(logLoss(s.probabilities[i]))}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">平均</th><td colSpan={2}>交叉熵 {fixed(crossEntropy(s.probabilities))} 位元 · 困惑度 {fixed(perplexity(s.probabilities))}</td></tr></tfoot>
      </table></div>;
    })}
  </details>;
}

// ---- sampling-explorer --------------------------------------------------------------------------------------------
const contextLabel = (context: string[]) => context.length ? context.join(' ') : '（其他任何上文）';

export function SamplingExplorerView({ explorer }: { explorer: SamplingExplorer }) {
  const id = useId();
  const defaults = explorer.settings;
  const [temperature, setTemperature] = useState(defaults.temperature);
  const [topK, setTopK] = useState(defaults.topK ?? 0);
  const [topP, setTopP] = useState(defaults.topP ?? 1);
  const [seedText, setSeedText] = useState(String(defaults.seed));
  const [context, setContext] = useState(0);
  const [at, setAt] = useState(0);
  const seedOk = seedText.trim() !== '' && isSeed(Number(seedText.trim()));
  const [seed, setSeed] = useState(defaults.seed);
  const settings: DecodeSettings = { temperature, topK, topP };
  const gen = useMemo(() => generate(explorer.model, explorer.prompt, { temperature, topK, topP }, seed, explorer.maxSteps), [explorer, temperature, topK, topP, seed]);
  const ctx = explorer.model.contexts[context];
  const rows = distribution(ctx.candidates, settings);
  const shownAt = Math.min(at, gen.steps.length);
  const step = shownAt > 0 ? gen.steps[shownAt - 1] : undefined;
  const reset = () => { setTemperature(defaults.temperature); setTopK(defaults.topK ?? 0); setTopP(defaults.topP ?? 1); setSeedText(String(defaults.seed)); setSeed(defaults.seed); setAt(0); };
  const greedy = temperature === 0;
  return <div className={base.example} data-llm-explorer="sampling">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{ILLUSTRATIVE}</p>
    <div className={styles.controls}>
      <span><label htmlFor={`${id}-t`}>temperature</label>：<output htmlFor={`${id}-t`}>{fixed(temperature, 1)}</output>{greedy ? '（greedy）' : ''}</span>
      <input id={`${id}-t`} type="range" min={0} max={TEMPERATURE_MAX} step={0.1} value={temperature} onChange={e => setTemperature(Number(e.target.value))}/>
      <label htmlFor={`${id}-k`}>top-k（0 = 不限制）</label>
      <input id={`${id}-k`} className={styles.numberInput} type="number" min={0} step={1} value={topK} onChange={e => setTopK(Math.max(0, Math.floor(Number(e.target.value) || 0)))}/>
      <span><label htmlFor={`${id}-p`}>top-p</label>：<output htmlFor={`${id}-p`}>{fixed(topP, 2)}</output>{topP === 1 ? '（不限制）' : ''}</span>
      <input id={`${id}-p`} type="range" min={0.05} max={1} step={0.05} value={topP} onChange={e => setTopP(Number(e.target.value))}/>
      <label htmlFor={`${id}-s`}>亂數種子（0–{MAX_SEED}）</label>
      <input id={`${id}-s`} className={styles.numberInput} inputMode="numeric" value={seedText} aria-invalid={!seedOk || undefined} aria-describedby={`${id}-s-note`}
        onChange={e => { setSeedText(e.target.value); const n = Number(e.target.value.trim()); if (e.target.value.trim() !== '' && isSeed(n)) setSeed(n); }}/>
      <span id={`${id}-s-note`} className={`${base.muted} ${styles.controlNote}`}>{seedOk ? '同一個種子每次都抽到同一串亂數。' : `種子要是 0 到 ${MAX_SEED} 的整數；目前仍使用 ${seed}。`}</span>
    </div>
    <div className={base.vizControls}><button type="button" onClick={reset}><RotateCcw size={14} aria-hidden/>恢復預設設定</button></div>

    <h4 className={styles.subhead}>下一個 token 的機率</h4>
    <label className={styles.field} htmlFor={`${id}-c`}>上文</label>
    <select id={`${id}-c`} className={styles.select} value={context} onChange={e => setContext(Number(e.target.value))}>
      {explorer.model.contexts.map((c, i) => <option key={i} value={i}>{contextLabel(c.context)}</option>)}
    </select>
    <ol className={styles.bars} aria-label={`「${contextLabel(ctx.context)}」之後的候選 token（依機率排序）`}>
      {rows.map(r => <li key={r.token} data-kept={r.kept}>
        <span className={styles.barToken}>{shown(r.token)}</span>
        <span className={styles.barTrack} aria-hidden><span className={styles.barFill} style={{ width: `${r.probability * 100}%` }}/><span className={styles.barBase} style={{ left: `${r.base * 100}%` }}/></span>
        <span className={styles.barText}>{r.kept ? percent(r.probability) : r.cut === 'greedy' ? '不選（greedy）' : `刪去（${r.cut}）`}<small>原始 {percent(r.base)}{temperature !== 1 && !greedy ? ` · 調溫後 ${percent(r.scaled)}` : ''}</small></span>
      </li>)}
    </ol>
    <p className={base.muted}>長條是 temperature、top-k、top-p 之後重新正規化的機率；細線標出原始機率（temperature = 1）。</p>

    <h4 className={styles.subhead}>逐步生成</h4>
    <ol className={styles.tokens} aria-label={`目前的文字（提示 ${explorer.prompt.length} 個 token，已生成 ${shownAt} 個）`}>
      {gen.tokens.slice(0, explorer.prompt.length + shownAt).map((t, i) => <li key={i} className={styles.token} data-tone={i % 6} data-prompt={i < explorer.prompt.length || undefined} data-new={i === explorer.prompt.length + shownAt - 1 && shownAt > 0 || undefined}>
        <span className={styles.tokenText}>{shown(t)}</span><span className={styles.tokenId}>{i < explorer.prompt.length ? '提示' : `第 ${i - explorer.prompt.length + 1} 個`}</span></li>)}
    </ol>
    <Stepper at={shownAt} count={gen.steps.length + 1} set={setAt} unit="生成"/>
    <div className={styles.note} aria-live="polite">
      {step ? <>
        <p>第 {shownAt} 個 token：上文「{contextLabel(step.context)}」，{step.u === undefined ? `temperature 0 直接選機率最高的「${step.token}」` : `抽到 u = ${fixed(step.u, 4)}，選中「${shown(step.token)}」`}。</p>
        {step.u !== undefined && <p className={base.muted}>依機率由大到小累加：{step.rows.filter(r => r.kept).reduce<{ from: number; parts: string[] }>((acc, r) => ({ from: acc.from + r.probability, parts: [...acc.parts, `${shown(r.token)} [${fixed(acc.from)}, ${fixed(acc.from + r.probability)})`] }), { from: 0, parts: [] }).parts.join('、')}；u 落在哪一段就選哪一個。</p>}
      </> : <p>從提示「{explorer.prompt.join(' ')}」開始，按「下一步」一次生成一個 token（最多 {explorer.maxSteps} 個）。</p>}
      {shownAt === gen.steps.length && shownAt > 0 && <p className={base.muted}>{gen.stop === 'end' ? '生成了結束 token，停止。' : gen.stop === 'no-context' ? '錄好的資料裡沒有這個上文，停止。' : `已達 ${explorer.maxSteps} 個 token 的上限。`}</p>}
    </div>
  </div>;
}

// ---- embedding-space ----------------------------------------------------------------------------------------------
const W = 320, H = 240, PAD = 36;

export function EmbeddingSpaceView({ explorer }: { explorer: EmbeddingExplorer }) {
  const id = useId();
  const { space } = explorer;
  const queries = space.kind === 'document' ? space.queries ?? [] : [];
  const all = [...space.items, ...queries], isQuery = new Set(queries.map(q => q.id));
  const [selected, setSelected] = useState(queries[0]?.id ?? space.items[0].id);
  const [metric, setMetric] = useState<Metric>('cosine');
  const projection = project(space);
  const ranked = nearest(space, selected, space.items.length, metric);
  const close = new Set(ranked.slice(0, Math.min(3, ranked.length)).map(n => n.id));
  const points = Object.values(projection.points);
  const [minX, maxX] = [Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[0]))];
  const [minY, maxY] = [Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[1]))];
  const sx = (x: number) => PAD + (maxX > minX ? (x - minX) / (maxX - minX) : .5) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (maxY > minY ? (y - minY) / (maxY - minY) : .5) * (H - 2 * PAD);
  const target = all.find(i => i.id === selected)!;
  const kindText = space.kind === 'token' ? 'token embedding 表：模型裡每個 token ID 對應的一列向量' : '文件 embedding：embedding 模型為一整句話算出的一個向量';
  const dims = space.dimensions ?? target.vector.map((_, i) => `第 ${i + 1} 維`);
  return <div className={base.example} data-llm-explorer="embedding">
    <h3>{explorer.title}</h3>
    <p className={base.muted}><Rich text={explorer.description}/></p>
    <p className={styles.illustrative}>{kindText}。{ILLUSTRATIVE}</p>
    <div className={styles.controls}>
      <label htmlFor={`${id}-sel`}>比較對象</label>
      <select id={`${id}-sel`} className={styles.select} value={selected} onChange={e => setSelected(e.target.value)}>
        {queries.length > 0 && <optgroup label="查詢">{queries.map(q => <option key={q.id} value={q.id}>{labelOf(q)}</option>)}</optgroup>}
        <optgroup label={space.kind === 'token' ? 'token' : '文件'}>{space.items.map(i => <option key={i.id} value={i.id}>{labelOf(i)}</option>)}</optgroup>
      </select>
      <fieldset className={styles.radios}><legend>相似度</legend>
        <label><input type="radio" name={`${id}-metric`} checked={metric === 'cosine'} onChange={() => setMetric('cosine')}/>餘弦相似度</label>
        <label><input type="radio" name={`${id}-metric`} checked={metric === 'dot'} onChange={() => setMetric('dot')}/>內積</label>
      </fieldset>
    </div>
    <svg className={styles.scatter} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-plot-title`}>
      <title id={`${id}-plot-title`}>{`${explorer.title}的 2D 投影（PCA）：選取「${labelOf(target)}」，最相近的是 ${ranked.slice(0, 3).map(n => `「${n.label}」`).join('、')}；座標見下方表格`}</title>
      <line x1={PAD / 2} x2={W - PAD / 2} y1={sy(0)} y2={sy(0)} className={styles.axis}/>
      <line x1={sx(0)} x2={sx(0)} y1={PAD / 2} y2={H - PAD / 2} className={styles.axis}/>
      {[...close].map(n => <line key={n} x1={sx(projection.points[selected][0])} y1={sy(projection.points[selected][1])} x2={sx(projection.points[n][0])} y2={sy(projection.points[n][1])} className={styles.link}/>)}
      {all.map(item => {
        const [x, y] = projection.points[item.id];
        const role = item.id === selected ? 'selected' : close.has(item.id) ? 'near' : isQuery.has(item.id) ? 'query' : 'item';
        return <g key={item.id} data-role={role}>
          {isQuery.has(item.id) ? <rect x={sx(x) - 5} y={sy(y) - 5} width={10} height={10} className={styles.point}/> : <circle cx={sx(x)} cy={sy(y)} r={5} className={styles.point}/>}
          <text x={sx(x)} y={sy(y) - 9} textAnchor="middle" className={styles.pointLabel}>{labelOf(item).length > 8 ? `${labelOf(item).slice(0, 8)}…` : labelOf(item)}</text>
        </g>;
      })}
    </svg>
    <p className={base.muted}>PCA 第一軸保留 {percent(projection.explained[0])} 的變異，第二軸 {percent(projection.explained[1])}；投影會失去其他維度的資訊，判斷相似要看下表的數值。圓點是{space.kind === 'token' ? ' token' : '文件'}，方塊是查詢。</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>和「{labelOf(target)}」的{metric === 'cosine' ? '餘弦相似度' : '內積'}（由高到低）</caption>
      <thead><tr><th scope="col">名次</th><th scope="col">{space.kind === 'token' ? 'token' : '文件'}</th><th scope="col">{metric === 'cosine' ? '餘弦相似度' : '內積'}</th></tr></thead>
      <tbody>{ranked.map((n, i) => <tr key={n.id} data-near={close.has(n.id) || undefined}><td>{i + 1}</td><th scope="row">{n.label}</th><td>{fixed(n.score)}</td></tr>)}</tbody>
    </table></div>
    <details className={base.details}><summary>向量與 2D 座標（散布圖的文字版）</summary>
      <div className={styles.tableWrap}><table className={styles.table}>
        <caption>每個向量的各維度數值與投影後的座標</caption>
        <thead><tr><th scope="col">{space.kind === 'token' ? 'token' : '文件'}</th>{space.kind === 'token' && <th scope="col">token ID</th>}{dims.map(d => <th key={d} scope="col">{d}</th>)}<th scope="col">x</th><th scope="col">y</th></tr></thead>
        <tbody>{all.map(item => <tr key={item.id}><th scope="row">{labelOf(item)}{isQuery.has(item.id) ? '（查詢）' : ''}</th>
          {space.kind === 'token' && <td>{'tokenId' in item ? item.tokenId ?? '—' : '—'}</td>}
          {item.vector.map((x, i) => <td key={i}>{x}</td>)}<td>{fixed(projection.points[item.id][0])}</td><td>{fixed(projection.points[item.id][1])}</td></tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}

// ---- exercises ----------------------------------------------------------------------------------------------------
export function LlmExerciseBox({ exercise }: { exercise: LlmExercise }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; messages: string[] }>();
  const set = (k: string, v: string) => { setValues(old => ({ ...old, [k]: v })); setResult(undefined); };
  const input = (key: string, numeric: boolean) => <input id={`${id}-${key}`} className={styles.answerInput} value={values[key] ?? ''}
    inputMode={numeric ? 'decimal' : 'text'} spellCheck={false} autoCapitalize="off" autoComplete="off" onChange={e => set(key, e.target.value)}/>;
  return <div className={activities.builder}>
    {exercise.kind === 'choice' ? <fieldset className={styles.radios} data-column>
      <legend>選擇答案</legend>
      {exercise.options.map((o, i) => <label key={o}><input type="radio" name={`${id}-choice`} checked={values.choice === String(i)} onChange={() => set('choice', String(i))}/><Rich text={o}/></label>)}
    </fieldset>
      : exercise.kind === 'table' ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">要填的值</th><th scope="col">你的答案</th></tr></thead>
        <tbody>{exercise.blanks.map(b => <tr key={b.id}><th scope="row"><label htmlFor={`${id}-${b.id}`}><Rich text={b.label}/></label></th><td>{input(b.id, typeof b.answer === 'number')}</td></tr>)}</tbody>
      </table></div>
      : <div className={activities.row}><label htmlFor={`${id}-value`}><Rich text={exercise.blank.label}/></label>{input('value', exercise.kind === 'number')}</div>}
    <p className={base.muted}>{exercise.kind === 'number' || (exercise.kind === 'table' && exercise.blanks.some(b => typeof b.answer === 'number'))
      ? '數值答案容許小小的誤差（題目會說四捨五入到哪一位）；也可以寫百分比，例如 25%。' : ''}{blanksOf(exercise).some(b => shapeOf(b.query).type === 'list') ? '清單的每一項用 | 分開（token ID 也可以用空白分開），token 裡的空白要寫成 ␣（例如 ␣low；low 與 ␣low 是不同的 token），換行寫成 ↵。' : ''}</p>
    <div className={base.vizControls}>
      <button type="button" className={base.primaryButton} onClick={() => setResult(checkLlmAnswer(exercise, values))}><Check size={14} aria-hidden/>檢查答案</button>
      <button type="button" onClick={() => { setValues({}); setResult(undefined); }}><RotateCcw size={14} aria-hidden/>清除</button>
    </div>
    <div aria-live="polite">{result && <>
      <p className={activities.verdict} data-ok={result.ok}>{result.ok ? <><Check size={16} aria-hidden/>正確。</> : <><X size={16} aria-hidden/>還沒通過：</>}</p>
      {!result.ok && <ul className={activities.results}>{result.messages.map(m => <li key={m}>{m}</li>)}</ul>}
    </>}</div>
  </div>;
}
