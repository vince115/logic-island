'use client';

import { useState } from 'react';
import { DEFAULT_GRID, GRID_LIMITS, GRID_PRESETS, ITEM_ALIGN, describeGrid, gridCss, normalizeGrid, parsePlacement, parseTracks, type GridState } from '@/lib/grid';
import { CopyCss } from './copy-css';
import styles from './playground.module.css';

/*
 * R8.1 (2026-11-16): CSS Grid Playground. The preview is a real grid container. Track lists and placements are typed:
 * each field keeps the learner's text, and only a value the model accepts (src/lib/grid.ts) reaches the preview; an
 * invalid one is marked aria-invalid with the reason beside it, so the layout never jumps on a half-typed value.
 */

const TRACK_HINTS = ['1fr 1fr', 'repeat(3, 1fr)', '200px 1fr', '1fr 2fr 1fr', 'repeat(auto-fill, minmax(120px, 1fr))', 'auto 1fr auto'];
const PLACE_HINTS = ['span 2', '1 / 3', '1 / -1', '2 / span 2'];
const TRACK_ERROR = '看不懂這個值：可用 px、fr、%、rem、auto、minmax()、repeat()，例如 repeat(3, 1fr)。';
const PLACE_ERROR = '格式是線號、span n，或「起 / 迄」，例如 1 / 3、span 2、1 / -1。';

function TrackField({ id, label, value, onValid }: { id: string; label: string; value: string; onValid: (v: string) => void }) {
  const [draft, setDraft] = useState(value), [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setDraft(value); }
  const invalid = parseTracks(draft) === undefined;
  return <label className={`${styles.field} ${styles.wide}`}><code>{label}</code>
    <input type="text" value={draft} list={`${id}-hints`} spellCheck={false} autoCapitalize="off" aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={e => { setDraft(e.target.value); const v = parseTracks(e.target.value); if (v) onValid(v); }}/>
    <datalist id={`${id}-hints`}>{TRACK_HINTS.map(h => <option key={h} value={h}/>)}</datalist>
    {invalid && <span id={`${id}-error`} className={styles.error}>{TRACK_ERROR}</span>}
  </label>;
}

function PlaceField({ id, label, value, onValid }: { id: string; label: string; value: string; onValid: (v: string) => void }) {
  const [draft, setDraft] = useState(value), [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setDraft(value); }
  const invalid = parsePlacement(draft) === undefined;
  return <label className={styles.field}><code>{label}</code>
    <input type="text" value={draft} placeholder="auto" list={`${id}-hints`} spellCheck={false} autoCapitalize="off" aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={e => { setDraft(e.target.value); const v = parsePlacement(e.target.value); if (v !== undefined) onValid(v); }}/>
    <datalist id={`${id}-hints`}>{PLACE_HINTS.map(h => <option key={h} value={h}/>)}</datalist>
    {invalid && <span id={`${id}-error`} className={styles.error}>{PLACE_ERROR}</span>}
  </label>;
}

export function GridLab() {
  const [state, setState] = useState<GridState>(DEFAULT_GRID);
  const [linked, setLinked] = useState(true), [selected, setSelected] = useState(1);
  const s = normalizeGrid(state), set = (patch: Partial<GridState>) => setState(prev => normalizeGrid({ ...prev, ...patch }));
  const item = Math.min(selected, s.items), place = s.placements[item] ?? { column: '', row: '' };
  const placeItem = (patch: Partial<typeof place>) => set({ placements: { ...s.placements, [item]: { ...place, ...patch } } });
  const css = gridCss(s);
  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="grid-experiment">
      <h2 id="grid-experiment"><span>02 · Experiment</span>設定格線與項目</h2>
      <div className={styles.controls}>
        <TrackField id="grid-columns" label="grid-template-columns" value={s.columns} onValid={columns => set({ columns })}/>
        <TrackField id="grid-rows" label="grid-template-rows" value={s.rows} onValid={rows => set({ rows })}/>
        <label className={styles.field}><code>{linked ? 'gap' : 'row-gap'}</code> {s.rowGap}px
          <input type="range" min={GRID_LIMITS.gap[0]} max={GRID_LIMITS.gap[1]} step={4} value={s.rowGap}
            onChange={e => { const v = Number(e.target.value); set(linked ? { rowGap: v, columnGap: v } : { rowGap: v }); }}/>
        </label>
        {!linked && <label className={styles.field}><code>column-gap</code> {s.columnGap}px
          <input type="range" min={GRID_LIMITS.gap[0]} max={GRID_LIMITS.gap[1]} step={4} value={s.columnGap} onChange={e => set({ columnGap: Number(e.target.value) })}/>
        </label>}
        <label className={styles.check}><input type="checkbox" checked={!linked} onChange={e => { setLinked(!e.target.checked); if (!e.target.checked) set({ columnGap: s.rowGap }); }}/>列與欄分開設定間距</label>
        <label className={styles.field}><code>justify-items</code>
          <select value={s.justifyItems} onChange={e => set({ justifyItems: e.target.value as GridState['justifyItems'] })}>{ITEM_ALIGN.map(o => <option key={o}>{o}</option>)}</select>
        </label>
        <label className={styles.field}><code>align-items</code>
          <select value={s.alignItems} onChange={e => set({ alignItems: e.target.value as GridState['alignItems'] })}>{ITEM_ALIGN.map(o => <option key={o}>{o}</option>)}</select>
        </label>
        <label className={styles.field}>項目數量 {s.items}
          <input type="range" min={GRID_LIMITS.items[0]} max={GRID_LIMITS.items[1]} value={s.items} onChange={e => set({ items: Number(e.target.value) })}/>
        </label>
      </div>
      <fieldset className={styles.placement}>
        <legend>指定項目位置</legend>
        <label className={styles.field}>項目
          <select value={item} onChange={e => setSelected(Number(e.target.value))}>
            {Array.from({ length: s.items }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 個{s.placements[i + 1] ? '（已指定）' : ''}</option>)}
          </select>
        </label>
        <PlaceField key={`c${item}`} id="grid-column" label="grid-column" value={place.column} onValid={column => placeItem({ column })}/>
        <PlaceField key={`r${item}`} id="grid-row" label="grid-row" value={place.row} onValid={row => placeItem({ row })}/>
      </fieldset>
      <div className={styles.presets} role="group" aria-label="常見版面">
        {GRID_PRESETS.map(p => <button key={p.id} type="button" onClick={() => { setState(p.state); setLinked(p.state.rowGap === p.state.columnGap); setSelected(1); }}>{p.label}</button>)}
        <button type="button" onClick={() => { setState(DEFAULT_GRID); setLinked(true); setSelected(1); }}>重設</button>
      </div>
      <div className={styles.stage}>
        <div className={styles.gridContainer} data-testid="grid-preview" role="img" aria-label="CSS Grid 預覽"
          style={{ gridTemplateColumns: s.columns, gridTemplateRows: s.rows, rowGap: s.rowGap, columnGap: s.columnGap, justifyItems: s.justifyItems, alignItems: s.alignItems }}>
          {Array.from({ length: s.items }, (_, i) => {
            const p = s.placements[i + 1];
            return <div key={i} className={styles.item} data-grow={p ? true : undefined} data-selected={item === i + 1 || undefined}
              style={p ? { gridColumn: p.column || undefined, gridRow: p.row || undefined } : undefined}>{i + 1}</div>;
          })}
        </div>
      </div>
    </section>
    <section className={styles.panel} aria-labelledby="grid-reading">
      <h2 id="grid-reading"><span>結果</span>這個格線在做什麼</h2>
      <ul className={styles.reading} aria-live="polite">{describeGrid(s).map(line => <li key={line}>{line}</li>)}</ul>
    </section>
    <section className={styles.panel} aria-labelledby="grid-build">
      <h2 id="grid-build"><span>03 · Build</span>寫成 CSS</h2>
      <div className={styles.codeHead}><p className={styles.note}>只列出和預設值不同的屬性；指定位置的項目用 :nth-child 寫出。</p><CopyCss css={css}/></div>
      <pre className={styles.code}><code>{css}</code></pre>
    </section>
  </div>;
}
