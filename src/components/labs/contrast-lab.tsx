'use client';

import { useId, useState, type CSSProperties } from 'react';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { checkContrast, formatRatio, parseHex, suggestText, THRESHOLDS, toHex, type Rgb } from '@/lib/contrast';
import styles from './contrast-lab.module.css';

/*
 * Multi-archipelago v2 (P4): 色彩與無障礙實驗室, the Experiment and Build steps. Everything runs in the browser from the
 * learner's two colors; nothing is sent anywhere. Native inputs (color pickers, text fields, a range and a checkbox)
 * carry the keyboard and screen-reader support; the verdict is a table plus one aria-live sentence.
 */

const PRESETS: { label: string; text: string; background: string }[] = [
  { label: '淺灰字在白底（常見錯誤）', text: '#9e9e9e', background: '#ffffff' },
  { label: '中灰字在白底（剛好通過 AA）', text: '#767676', background: '#ffffff' },
  { label: '藍色連結在深色背景', text: '#4285f4', background: '#1e1e1e' },
  { label: '白字在品牌橘按鈕', text: '#ffffff', background: '#f29900' },
  { label: '深色文字在淺黃提示', text: '#3e2723', background: '#fff8e1' },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && !parseHex(draft);
  return <div className={styles.field}>
    <label htmlFor={`${id}-text`}>{label}</label>
    <div className={styles.colorRow}>
      <input type="color" aria-label={`${label}（色彩選擇器）`} value={value} onChange={e => { setDraft(null); onChange(e.target.value); }}/>
      <input id={`${id}-text`} type="text" inputMode="text" spellCheck={false} autoComplete="off" value={draft ?? value} aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={e => { const v = e.target.value; setDraft(v); const rgb = parseHex(v); if (rgb) onChange(toHex(rgb)); }}
        onBlur={() => setDraft(null)}/>
    </div>
    {invalid && <small id={`${id}-error`} className={styles.error}>請輸入 #rgb 或 #rrggbb，例如 #3949ab</small>}
  </div>;
}

const Verdict = ({ pass }: { pass: boolean }) => pass
  ? <span className={styles.pass}><Check size={14} aria-hidden/>通過</span>
  : <span className={styles.fail}><X size={14} aria-hidden/>未通過</span>;

export function ContrastLab() {
  const [text, setText] = useState('#9e9e9e');
  const [background, setBackground] = useState('#ffffff');
  const [size, setSize] = useState(16);
  const [bold, setBold] = useState(false);
  const fg = parseHex(text)!, bg = parseHex(background)!;
  const result = checkContrast(fg, bg, size, bold);
  const target = result.large ? THRESHOLDS.large : THRESHOLDS.normal;
  // Cheap (at most 200 ratio checks), so computed on each render rather than memoised.
  const fixAA = suggestText(fg, bg, target.AA), fixAAA = suggestText(fg, bg, target.AAA);
  const ratio = formatRatio(result.ratio);
  const sizeName = result.large ? '大型文字' : '一般文字';
  const summary = `對比率 ${ratio}：1。目前是${sizeName}（${size}px${bold ? '、粗體' : ''}），AA ${result.AA ? '通過' : '未通過'}，AAA ${result.AAA ? '通過' : '未通過'}。`;
  const css = (rgb: Rgb) => `color: ${toHex(rgb)};\nbackground-color: ${background};`;

  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="contrast-experiment">
      <h2 id="contrast-experiment"><span>02 · Experiment</span>調整顏色與字級</h2>
      <div className={styles.controls}>
        <ColorField label="文字顏色" value={text} onChange={setText}/>
        <button type="button" className={styles.swap} onClick={() => { setText(background); setBackground(text); }} aria-label="交換文字與背景顏色">
          <ArrowLeftRight size={16} aria-hidden/>交換
        </button>
        <ColorField label="背景顏色" value={background} onChange={setBackground}/>
        <div className={styles.field}>
          <label htmlFor="contrast-size">字級：{size}px</label>
          <input id="contrast-size" type="range" min={12} max={40} step={1} value={size} onChange={e => setSize(Number(e.target.value))}/>
        </div>
        <label className={styles.check}><input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)}/>粗體</label>
      </div>
      <div className={styles.presets} role="group" aria-label="範例配色">
        {PRESETS.map(p => <button key={p.label} type="button" onClick={() => { setText(p.text); setBackground(p.background); }}
          style={{ '--preset-fg': p.text, '--preset-bg': p.background } as CSSProperties}><span aria-hidden>Aa</span>{p.label}</button>)}
      </div>
      <div className={styles.preview} style={{ color: text, background }} aria-label="即時預覽">
        <p style={{ fontSize: size, fontWeight: bold ? 700 : 400 }}>目前字級的文字：清楚的對比讓每個人都讀得到。</p>
        <p className={styles.small}>14px 說明文字：密碼至少 8 個字元。</p>
        <p className={styles.large}>24px 標題文字</p>
        <span className={styles.ui} style={{ borderColor: text }}>按鈕外框（非文字元件）</span>
      </div>
    </section>

    <section className={styles.panel} aria-labelledby="contrast-result">
      <h2 id="contrast-result"><span>結果</span>WCAG 2.2 對比判定</h2>
      <p className={styles.ratio}><strong>{ratio}</strong><span>：1</span></p>
      <p className={styles.summary} aria-live="polite">{summary}</p>
      <table className={styles.table}>
        <caption className="visually-hidden">各種文字與元件的 WCAG 對比門檻與結果</caption>
        <thead><tr><th scope="col">項目</th><th scope="col">AA</th><th scope="col">AAA</th></tr></thead>
        <tbody>
          <tr data-current={!result.large || undefined}><th scope="row">一般文字<small>小於 24px，或粗體小於 18.66px</small></th>
            <td>{THRESHOLDS.normal.AA}：1 <Verdict pass={result.normal.AA}/></td><td>{THRESHOLDS.normal.AAA}：1 <Verdict pass={result.normal.AAA}/></td></tr>
          <tr data-current={result.large || undefined}><th scope="row">大型文字<small>24px 以上，或粗體 18.66px 以上</small></th>
            <td>{THRESHOLDS.large.AA}：1 <Verdict pass={result.largeText.AA}/></td><td>{THRESHOLDS.large.AAA}：1 <Verdict pass={result.largeText.AAA}/></td></tr>
          <tr><th scope="row">非文字元件<small>圖示、輸入框外框、焦點樣式（1.4.11）</small></th>
            <td>{THRESHOLDS.nonText}：1 <Verdict pass={result.nonText}/></td><td>—</td></tr>
        </tbody>
      </table>
    </section>

    <section className={styles.panel} aria-labelledby="contrast-build">
      <h2 id="contrast-build"><span>03 · Build</span>修正並寫成 CSS</h2>
      <p className={styles.note}>保持背景與色相不變，只把文字顏色往黑或白調整到剛好通過（以{sizeName}的門檻計算）。</p>
      <div className={styles.fixes}>
        {[{ level: 'AA', rgb: fixAA }, { level: 'AAA', rgb: fixAAA }].map(({ level, rgb }) => <div key={level} className={styles.fix}>
          <h3>{level}（{level === 'AA' ? target.AA : target.AAA}：1）</h3>
          {rgb ? <>
            <div className={styles.swatch} style={{ color: toHex(rgb), background }}>Aa {toHex(rgb)}</div>
            <pre className={styles.code}><code>{css(rgb)}</code></pre>
            {toHex(rgb) !== text ? <button type="button" onClick={() => setText(toHex(rgb))}>套用 {toHex(rgb)}</button> : <p className={styles.note}>目前的顏色已經通過。</p>}
          </> : <p className={styles.note}>這個背景上，同色相的文字達不到 {level}；請改變背景或色相。</p>}
        </div>)}
      </div>
    </section>
  </div>;
}
