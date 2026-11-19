/*
 * R8.2 (2026-11-16): the model of the Responsive Layout Simulator (/learn/responsive-layout). A mobile-first layout
 * and its two breakpoints; from them the CSS (base rules, then one min-width media query per breakpoint) and the demo
 * page it styles. The lab renders that page in an iframe whose real width is the chosen viewport, so the media queries
 * are evaluated by the browser exactly as on a device that wide; the CSS shown and the CSS in the frame are one string.
 */

export const VIEWPORT = { min: 320, max: 1440 } as const;
export const DEVICES = [
  { id: 'mobile', label: 'Mobile', width: 375 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'desktop', label: 'Desktop', width: 1280 },
] as const;

export interface Breakpoints { md: number; lg: number }
export const DEFAULT_BREAKPOINTS: Breakpoints = { md: 768, lg: 1024 };
export const BREAKPOINT_LIMITS = { md: [480, 960], lg: [640, 1360] } as const;
/** The smallest step between the two breakpoints, so each tier keeps a usable range. */
export const MIN_TIER = 120;

export type LayoutId = 'page' | 'cards';
export const LAYOUTS: { id: LayoutId; label: string; summary: string }[] = [
  { id: 'page', label: '頁面版型', summary: '頁首、導覽、主內容、側欄、頁尾：手機一欄堆疊，平板兩欄，桌機三欄。' },
  { id: 'cards', label: '卡片列表', summary: '同一組卡片：手機一欄、平板兩欄、桌機四欄，字級也隨之調整。' },
];

export type Tier = 'base' | 'md' | 'lg';
export const TIER_LABELS: Record<Tier, string> = { base: '手機（基本樣式）', md: '平板', lg: '桌機' };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
export const clampWidth = (w: number) => clamp(w, VIEWPORT.min, VIEWPORT.max);

/** Keeps md and lg inside their limits with lg at least MIN_TIER above md (md moves first; lg follows it). */
export function normalizeBreakpoints(b: Breakpoints): Breakpoints {
  const md = clamp(b.md, ...BREAKPOINT_LIMITS.md);
  return { md, lg: clamp(Math.max(b.lg, md + MIN_TIER), BREAKPOINT_LIMITS.lg[0], BREAKPOINT_LIMITS.lg[1]) };
}

/** Which media queries apply at a width: a mobile-first sheet adds md at width ≥ md and lg at width ≥ lg. */
export function tierAt(width: number, b: Breakpoints): Tier {
  const w = clampWidth(width), { md, lg } = normalizeBreakpoints(b);
  return w >= lg ? 'lg' : w >= md ? 'md' : 'base';
}
export const activeQueries = (width: number, b: Breakpoints) => {
  const t = tierAt(width, b), n = normalizeBreakpoints(b);
  return [...(t !== 'base' ? [n.md] : []), ...(t === 'lg' ? [n.lg] : [])];
};

const LAYOUT_CSS: Record<LayoutId, { base: string[]; md: string[]; lg: string[] }> = {
  page: {
    base: [
      '.page {', '  display: grid;', '  grid-template-columns: 1fr;', '  gap: 12px;', '}',
      '.nav ul { display: flex; flex-direction: column; gap: 4px; }',
      '.cards {', '  display: grid;', '  grid-template-columns: 1fr;', '  gap: 12px;', '}',
    ],
    md: [
      '.page {', '  grid-template-columns: 180px 1fr;', '  grid-template-areas: "header header" "nav main" "nav aside" "footer footer";', '}',
      '.header { grid-area: header; } .nav { grid-area: nav; } .main { grid-area: main; } .aside { grid-area: aside; } .footer { grid-area: footer; }',
      '.cards { grid-template-columns: repeat(2, 1fr); }',
    ],
    lg: [
      '.page {', '  grid-template-columns: 200px 1fr 240px;', '  grid-template-areas: "header header header" "nav main aside" "footer footer footer";', '}',
      '.cards { grid-template-columns: repeat(3, 1fr); }',
    ],
  },
  cards: {
    base: ['.cards {', '  display: grid;', '  grid-template-columns: 1fr;', '  gap: 12px;', '}', '.card h2 { font-size: 18px; }'],
    md: ['.cards { grid-template-columns: repeat(2, 1fr); }', '.card h2 { font-size: 20px; }'],
    lg: ['.cards {', '  grid-template-columns: repeat(4, 1fr);', '  gap: 20px;', '}', '.card h2 { font-size: 22px; }'],
  },
};

const indent = (lines: string[]) => lines.map(l => `  ${l}`);

/** The layout CSS the learner reads (and the frame applies): base rules, then one min-width query per breakpoint. */
export function responsiveCss(layout: LayoutId, b: Breakpoints): string {
  const { md, lg } = normalizeBreakpoints(b), css = LAYOUT_CSS[layout];
  return [
    '/* 基本樣式：手機（沒有媒體查詢，所有寬度都套用） */', ...css.base, '',
    `/* 平板：寬度 ≥ ${md}px 時加上 */`, `@media (min-width: ${md}px) {`, ...indent(css.md), '}', '',
    `/* 桌機：寬度 ≥ ${lg}px 時再加上 */`, `@media (min-width: ${lg}px) {`, ...indent(css.lg), '}',
  ].join('\n');
}

/** Look only (colours, type, spacing): not part of the lesson, so it is not shown with the layout CSS. */
const THEME = `*{box-sizing:border-box}body{margin:0;padding:12px;font:15px/1.5 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#1d2b42;background:#f8faff}
.page>*,.card{border-radius:8px;padding:12px;background:#fff;border:1px solid #d5deeb}.header{background:#2f5fb3;color:#fff;border:0}.footer{background:#e5edf9}
.nav ul{list-style:none;margin:0;padding:0}.nav a{color:#1d4ea3}h1,h2,p{margin:0}h1{font-size:18px}.card h2{font-size:18px;margin-bottom:4px}.aside{background:#eef6ef}
.cards{margin-top:12px}.tier{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;background:#fff;color:#1d4ea3;font-size:13px;font-weight:700}`;

const CARDS = (n: number) => Array.from({ length: n }, (_, i) => `<article class="card"><h2>卡片 ${i + 1}</h2><p>隨可用寬度重新排列。</p></article>`).join('');
const BODY: Record<LayoutId, string> = {
  page: `<div class="page"><header class="header"><h1>網站標題</h1></header><nav class="nav" aria-label="示範導覽"><ul><li><a href="#a">首頁</a></li><li><a href="#b">課程</a></li><li><a href="#c">關於</a></li></ul></nav><main class="main"><h2>主內容</h2><div class="cards">${CARDS(3)}</div></main><aside class="aside"><h2>側欄</h2><p>相關連結</p></aside><footer class="footer"><p>頁尾</p></footer></div>`,
  cards: `<div class="cards">${CARDS(8)}</div>`,
};

/** The demo page for the frame: the theme, then the layout CSS exactly as shown. */
export function responsiveDocument(layout: LayoutId, b: Breakpoints): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${THEME}</style><style>${responsiveCss(layout, b)}</style></head><body>${BODY[layout]}</body></html>`;
}

/** What the layout is doing at this width, in words. */
export function describeResponsive(layout: LayoutId, width: number, b: Breakpoints): string[] {
  const w = clampWidth(width), n = normalizeBreakpoints(b), t = tierAt(w, n);
  const applies = t === 'base' ? '只有基本樣式' : t === 'md' ? `基本樣式＋ min-width: ${n.md}px` : `基本樣式＋ min-width: ${n.md}px ＋ min-width: ${n.lg}px`;
  const shape: Record<LayoutId, Record<Tier, string>> = {
    page: { base: '所有區塊由上往下排成一欄，卡片一欄。', md: '導覽在左、主內容與側欄在右（兩欄），卡片兩欄。', lg: '導覽、主內容、側欄並排（三欄），卡片三欄。' },
    cards: { base: '卡片一欄，標題 18px。', md: '卡片兩欄，標題 20px。', lg: '卡片四欄、間距加大，標題 22px。' },
  };
  const next = t === 'base' ? `再寬 ${n.md - w}px 會進入平板版面。` : t === 'md' ? `再寬 ${n.lg - w}px 會進入桌機版面；窄 ${w - n.md + 1}px 會回到手機版面。` : `窄 ${w - n.lg + 1}px 會回到平板版面。`;
  return [`視窗寬度 ${w}px：${TIER_LABELS[t]}。套用的規則：${applies}。`, shape[layout][t], next];
}
