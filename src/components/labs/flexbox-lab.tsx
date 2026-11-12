'use client';

import { useState } from 'react';
import { ALIGN, DEFAULT_FLEX, FLEX_DIRECTIONS, FLEX_PRESETS, JUSTIFY, LIMITS, WRAP, describeFlex, flexCss, normalize, type FlexState } from '@/lib/flexbox';
import styles from './flexbox-lab.module.css';

/*
 * R7 (2026-11-12): Flexbox Playground. Native selects and range inputs carry keyboard and screen-reader support; the
 * preview is a real flex container, so what the learner sees is what the browser does with the CSS shown beside it.
 * The reading of the axes is announced with aria-live. Container width can be narrowed to see wrapping happen.
 */

const SELECTS = [
  { key: 'direction', label: 'flex-direction', options: FLEX_DIRECTIONS },
  { key: 'justify', label: 'justify-content', options: JUSTIFY },
  { key: 'align', label: 'align-items', options: ALIGN },
  { key: 'wrap', label: 'flex-wrap', options: WRAP },
] as const;

export function FlexboxLab() {
  const [state, setState] = useState<FlexState>(DEFAULT_FLEX);
  const [width, setWidth] = useState(100);
  const s = normalize(state), set = (patch: Partial<FlexState>) => setState(prev => normalize({ ...prev, ...patch }));
  const column = s.direction.startsWith('column');
  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="flex-experiment">
      <h2 id="flex-experiment"><span>02 · Experiment</span>調整容器與項目</h2>
      <div className={styles.controls}>
        {SELECTS.map(c => <label key={c.key} className={styles.field}><code>{c.label}</code>
          <select value={s[c.key]} onChange={e => set({ [c.key]: e.target.value } as Partial<FlexState>)}>
            {c.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>)}
        <label className={styles.field}><code>gap</code> {s.gap}px
          <input type="range" min={LIMITS.gap[0]} max={LIMITS.gap[1]} step={4} value={s.gap} onChange={e => set({ gap: Number(e.target.value) })}/>
        </label>
        <label className={styles.field}>項目數量 {s.items}
          <input type="range" min={LIMITS.items[0]} max={LIMITS.items[1]} value={s.items} onChange={e => set({ items: Number(e.target.value) })}/>
        </label>
        <label className={styles.field}>flex-grow: 1 的項目
          <select value={s.grow} onChange={e => set({ grow: Number(e.target.value) })}>
            <option value={0}>無</option>
            {Array.from({ length: s.items }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 個</option>)}
          </select>
        </label>
        <label className={styles.field}>容器寬度 {width}%
          <input type="range" min={30} max={100} step={5} value={width} onChange={e => setWidth(Number(e.target.value))}/>
        </label>
      </div>
      <div className={styles.presets} role="group" aria-label="常見版面">
        {FLEX_PRESETS.map(p => <button key={p.id} type="button" onClick={() => setState(p.state)}>{p.label}</button>)}
        <button type="button" onClick={() => { setState(DEFAULT_FLEX); setWidth(100); }}>重設</button>
      </div>
      <div className={styles.stage}>
        <div className={styles.container} data-testid="flex-preview" aria-label="Flexbox 預覽" role="img"
          style={{ width: `${width}%`, flexDirection: s.direction, justifyContent: s.justify, alignItems: s.align, flexWrap: s.wrap, gap: s.gap, minHeight: column ? 260 : 150 }}>
          {Array.from({ length: s.items }, (_, i) => <div key={i} className={styles.item} data-grow={s.grow === i + 1 || undefined}
            style={{ flexGrow: s.grow === i + 1 ? 1 : 0, ...(s.align === 'baseline' ? { paddingTop: 6 + (i % 3) * 10 } : {}) }}>{i + 1}</div>)}
        </div>
      </div>
    </section>
    <section className={styles.panel} aria-labelledby="flex-reading">
      <h2 id="flex-reading"><span>結果</span>這個版面在做什麼</h2>
      <ul className={styles.reading} aria-live="polite">{describeFlex(s).map(line => <li key={line}>{line}</li>)}</ul>
    </section>
    <section className={styles.panel} aria-labelledby="flex-build">
      <h2 id="flex-build"><span>03 · Build</span>寫成 CSS</h2>
      <p className={styles.note}>只列出和預設值不同的屬性；複製到你的樣式表即可得到同樣的排列。</p>
      <pre className={styles.code}><code>{flexCss(s)}</code></pre>
    </section>
  </div>;
}
