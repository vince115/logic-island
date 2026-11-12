/*
 * R7 (2026-11-12): the model of the Flexbox Playground (/learn/flexbox-playground). A container's flex properties, the
 * item count and one item that may grow; from them the CSS the learner would write and a plain-language reading of the
 * two axes. Pure, so the lab, its tests and any lesson can share it.
 */

export const FLEX_DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'] as const;
export const JUSTIFY = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] as const;
export const ALIGN = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] as const;
export const WRAP = ['nowrap', 'wrap', 'wrap-reverse'] as const;

export type FlexDirection = (typeof FLEX_DIRECTIONS)[number];
export type Justify = (typeof JUSTIFY)[number];
export type Align = (typeof ALIGN)[number];
export type Wrap = (typeof WRAP)[number];

export interface FlexState {
  direction: FlexDirection; justify: Justify; align: Align; wrap: Wrap;
  /** px, 0–48. */
  gap: number;
  /** 1–8 items. */
  items: number;
  /** 0 = none; otherwise the 1-based item that takes `flex-grow: 1`. */
  grow: number;
}

export const LIMITS = { gap: [0, 48], items: [1, 8] } as const;
export const DEFAULT_FLEX: FlexState = { direction: 'row', justify: 'flex-start', align: 'stretch', wrap: 'nowrap', gap: 12, items: 4, grow: 0 };

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

/** Keeps a state inside the lab's limits (a grown item that no longer exists is dropped). */
export function normalize(s: FlexState): FlexState {
  const items = clamp(s.items, LIMITS.items), gap = clamp(s.gap, LIMITS.gap);
  return { ...s, items, gap, grow: s.grow >= 1 && s.grow <= items ? Math.round(s.grow) : 0 };
}

/** The CSS for the container and, when one item grows, for that item. Default values are left out, as one would. */
export function flexCss(input: FlexState): string {
  const s = normalize(input), lines = ['.container {', '  display: flex;'];
  if (s.direction !== 'row') lines.push(`  flex-direction: ${s.direction};`);
  if (s.wrap !== 'nowrap') lines.push(`  flex-wrap: ${s.wrap};`);
  if (s.justify !== 'flex-start') lines.push(`  justify-content: ${s.justify};`);
  if (s.align !== 'stretch') lines.push(`  align-items: ${s.align};`);
  if (s.gap) lines.push(`  gap: ${s.gap}px;`);
  lines.push('}');
  if (s.grow) lines.push('', `.item:nth-child(${s.grow}) {`, '  flex-grow: 1;', '}');
  return lines.join('\n');
}

const isColumn = (d: FlexDirection) => d.startsWith('column');
const JUSTIFY_TEXT: Record<Justify, string> = {
  'flex-start': '從主軸起點排起', center: '在主軸上置中', 'flex-end': '靠主軸終點',
  'space-between': '頭尾貼齊、剩餘空間平分在項目之間', 'space-around': '每個項目兩側各分到一半的間距', 'space-evenly': '所有間距（含頭尾）一樣大',
};
const ALIGN_TEXT: Record<Align, string> = {
  stretch: '拉長到填滿交錯軸', 'flex-start': '靠交錯軸起點', center: '在交錯軸上置中', 'flex-end': '靠交錯軸終點', baseline: '依文字基線對齊',
};

/** A reading of the layout in words: which way each axis runs and what each property does along it. */
export function describeFlex(input: FlexState): string[] {
  const s = normalize(input), column = isColumn(s.direction), reverse = s.direction.endsWith('reverse');
  const main = column ? (reverse ? '由下往上' : '由上往下') : (reverse ? '由右往左' : '由左往右');
  const out = [
    `主軸是${column ? '垂直' : '水平'}方向，${main}；交錯軸是${column ? '水平' : '垂直'}方向。`,
    `justify-content: ${s.justify} → ${JUSTIFY_TEXT[s.justify]}。`,
    `align-items: ${s.align} → ${ALIGN_TEXT[s.align]}。`,
    s.wrap === 'nowrap' ? '不換行：空間不夠時項目會被壓縮。' : `可換行（${s.wrap}）：空間不夠時排到${s.wrap === 'wrap' ? '下一' : '上一'}${column ? '欄' : '行'}。`,
  ];
  if (s.grow) out.push(`第 ${s.grow} 個項目 flex-grow: 1，吃掉主軸上剩下的空間${s.justify !== 'flex-start' ? '，所以 justify-content 不再有剩餘空間可以分配' : ''}。`);
  return out;
}

/** Ready-made layouts the lessons point to. */
export const FLEX_PRESETS: { id: string; label: string; state: FlexState }[] = [
  { id: 'center', label: '完全置中', state: { ...DEFAULT_FLEX, items: 1, justify: 'center', align: 'center' } },
  { id: 'navbar', label: '導覽列（兩端對齊）', state: { ...DEFAULT_FLEX, items: 4, justify: 'space-between', align: 'center' } },
  { id: 'cards', label: '卡片換行', state: { ...DEFAULT_FLEX, items: 7, wrap: 'wrap', gap: 16 } },
  { id: 'sidebar', label: '固定側欄＋彈性內容', state: { ...DEFAULT_FLEX, items: 2, grow: 2, gap: 16 } },
  { id: 'stack', label: '垂直堆疊', state: { ...DEFAULT_FLEX, direction: 'column', items: 3, gap: 8 } },
];
