'use client';

import { useEffect, useRef, useState } from 'react';
import { BREAKPOINT_LIMITS, DEFAULT_BREAKPOINTS, DEVICES, LAYOUTS, TIER_LABELS, VIEWPORT, activeQueries, clampWidth, describeResponsive, normalizeBreakpoints, responsiveCss, responsiveDocument, tierAt, type Breakpoints, type LayoutId } from '@/lib/responsive';
import { CopyCss } from './copy-css';
import styles from './playground.module.css';

/*
 * R8.2 (2026-11-16): Responsive Layout Simulator. The demo page lives in a sandboxed iframe (no scripts) whose width
 * is the chosen viewport in real CSS pixels, so its media queries are evaluated by the browser as on a device that
 * wide — not a picture scaled down. When that width is wider than the space here, the frame is drawn smaller with a
 * transform; its layout is still computed at the full width, and the page itself never scrolls sideways.
 */

const FRAME_HEIGHT = 520;
const pct = (w: number) => `${((w - VIEWPORT.min) / (VIEWPORT.max - VIEWPORT.min)) * 100}%`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null), [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ResponsiveLab() {
  const [layout, setLayout] = useState<LayoutId>('page');
  const [width, setWidthRaw] = useState(375);
  const [bp, setBp] = useState<Breakpoints>(DEFAULT_BREAKPOINTS);
  const [stageRef, available] = useWidth<HTMLDivElement>();
  const b = normalizeBreakpoints(bp), w = clampWidth(width), tier = tierAt(w, b), active = activeQueries(w, b);
  const setWidth = (v: number) => setWidthRaw(clampWidth(v));
  const scale = available > 0 && w > available ? available / w : 1, css = responsiveCss(layout, b);
  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="rwd-experiment">
      <h2 id="rwd-experiment"><span>02 · Experiment</span>改變視窗寬度與斷點</h2>
      <div className={styles.presets} role="group" aria-label="示範版型">
        {LAYOUTS.map(l => <button key={l.id} type="button" aria-pressed={layout === l.id} onClick={() => setLayout(l.id)}>{l.label}</button>)}
      </div>
      <p className={styles.note}>{LAYOUTS.find(l => l.id === layout)!.summary}</p>
      <div className={styles.presets} role="group" aria-label="裝置寬度">
        {DEVICES.map(d => <button key={d.id} type="button" aria-pressed={w === d.width} onClick={() => setWidth(d.width)}>{d.label} · {d.width}px</button>)}
      </div>
      <div className={styles.controls}>
        <label className={`${styles.field} ${styles.wide}`}>視窗寬度 {w}px
          <input type="range" min={VIEWPORT.min} max={VIEWPORT.max} step={1} value={w} onChange={e => setWidth(Number(e.target.value))}/>
        </label>
        <label className={styles.field}>自訂寬度（px）
          <input type="number" inputMode="numeric" min={VIEWPORT.min} max={VIEWPORT.max} value={w} onChange={e => setWidthRaw(Number(e.target.value))} onBlur={() => setWidth(width)}/>
        </label>
        <label className={styles.field}><code>平板斷點 md</code> {b.md}px
          <input type="range" min={BREAKPOINT_LIMITS.md[0]} max={BREAKPOINT_LIMITS.md[1]} step={8} value={b.md} onChange={e => setBp(normalizeBreakpoints({ ...b, md: Number(e.target.value) }))}/>
        </label>
        <label className={styles.field}><code>桌機斷點 lg</code> {b.lg}px
          <input type="range" min={BREAKPOINT_LIMITS.lg[0]} max={BREAKPOINT_LIMITS.lg[1]} step={8} value={b.lg} onChange={e => setBp(normalizeBreakpoints({ ...b, lg: Number(e.target.value) }))}/>
        </label>
      </div>
      <div className={styles.ruler} role="img" aria-label={`寬度尺：${VIEWPORT.min} 到 ${VIEWPORT.max}px，斷點 ${b.md}px 與 ${b.lg}px，目前 ${w}px（${TIER_LABELS[tier]}）`}>
        <span className={styles.tierBand} data-tier="base" style={{ left: 0, width: pct(b.md) }}>手機</span>
        <span className={styles.tierBand} data-tier="md" style={{ left: pct(b.md), width: `calc(${pct(b.lg)} - ${pct(b.md)})` }}>平板</span>
        <span className={styles.tierBand} data-tier="lg" style={{ left: pct(b.lg), right: 0 }}>桌機</span>
        <span className={styles.tick} style={{ left: pct(b.md) }}>{b.md}</span>
        <span className={styles.tick} style={{ left: pct(b.lg) }}>{b.lg}</span>
        <span className={styles.marker} data-testid="rwd-marker" style={{ left: pct(w) }}/>
      </div>
      <div ref={stageRef} className={styles.frameStage}>
        <div style={{ width: w * scale, height: FRAME_HEIGHT * scale }}>
          <iframe title={`版面預覽：寬 ${w}px（${TIER_LABELS[tier]}）`} data-testid="rwd-frame" sandbox="" srcDoc={responsiveDocument(layout, b)}
            className={styles.frame} style={{ width: w, height: FRAME_HEIGHT, transform: scale < 1 ? `scale(${scale})` : undefined }}/>
        </div>
      </div>
      <p className={styles.note} aria-live="polite">{scale < 1 ? `預覽以 ${Math.round(scale * 100)}% 顯示；版面仍以 ${w}px 的實際寬度計算。` : `預覽為實際大小（${w}px）。`}</p>
    </section>
    <section className={styles.panel} aria-labelledby="rwd-reading">
      <h2 id="rwd-reading"><span>結果</span>這個寬度套用了什麼</h2>
      <ul className={styles.reading} aria-live="polite">{describeResponsive(layout, w, b).map(line => <li key={line}>{line}</li>)}</ul>
      <ul className={styles.queries} aria-label="媒體查詢">
        {[b.md, b.lg].map(q => <li key={q} data-active={active.includes(q) || undefined}><code>@media (min-width: {q}px)</code>{active.includes(q) ? '套用中' : '未套用'}</li>)}
      </ul>
    </section>
    <section className={styles.panel} aria-labelledby="rwd-build">
      <h2 id="rwd-build"><span>03 · Build</span>Mobile-first CSS</h2>
      <div className={styles.codeHead}><p className={styles.note}>先寫手機的基本樣式，再用 min-width 逐步加上較寬螢幕的規則。預覽框裡套用的就是這段 CSS。</p><CopyCss css={css}/></div>
      <pre className={styles.code}><code>{css}</code></pre>
    </section>
  </div>;
}
