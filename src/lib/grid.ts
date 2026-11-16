/*
 * R8.1 (2026-11-16): the model of the CSS Grid Playground (/learn/css-grid-playground). The container's tracks, gaps
 * and item alignment, the item count and where chosen items are placed; from them the CSS the learner would write and
 * a plain-language reading. Track lists and placements are typed by the learner, so each is checked against a small
 * grammar before it reaches the preview: an invalid value is reported and never applied.
 */

export const ITEM_ALIGN = ['stretch', 'start', 'center', 'end'] as const;
export type ItemAlign = (typeof ITEM_ALIGN)[number];

export interface Placement { column: string; row: string }
export interface GridState {
  columns: string; rows: string;
  /** px, 0–48. */
  rowGap: number; columnGap: number;
  justifyItems: ItemAlign; alignItems: ItemAlign;
  /** 1–12 items. */
  items: number;
  /** 1-based item → its grid-column / grid-row ('' = auto). */
  placements: Record<number, Placement>;
}

export const GRID_LIMITS = { gap: [0, 48], items: [1, 12] } as const;
export const DEFAULT_GRID: GridState = { columns: 'repeat(3, 1fr)', rows: 'auto', rowGap: 12, columnGap: 12, justifyItems: 'stretch', alignItems: 'stretch', items: 6, placements: {} };

/** Track sizes the playground accepts (a subset of CSS that covers what the lessons teach). */
const SIZE = String.raw`(?:\d+(?:\.\d+)?(?:px|fr|%|rem|em)|auto|min-content|max-content)`;
const MINMAX = String.raw`minmax\(\s*${SIZE}\s*,\s*${SIZE}\s*\)`;
const TRACK = String.raw`(?:${SIZE}|${MINMAX})`;
const REPEAT = String.raw`repeat\(\s*(?:[1-9]\d?|auto-fill|auto-fit)\s*,\s*${TRACK}(?:\s+${TRACK})*\s*\)`;
const TRACK_LIST = new RegExp(String.raw`^(?:${REPEAT}|${TRACK})(?:\s+(?:${REPEAT}|${TRACK}))*$`);
/** auto, span n, a line number (negative counts from the end), or start / end with either. */
const LINE = String.raw`(?:-?[1-9]\d?|span\s+[1-9]\d?)`;
const PLACEMENT = new RegExp(String.raw`^(?:auto|${LINE}(?:\s*\/\s*${LINE})?)$`);

const tidy = (v: string) => v.trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ').replace(/\s*\/\s*/g, ' / ');

/** A track list the playground can apply, normalized; undefined if it is not one. */
export function parseTracks(value: string): string | undefined {
  const v = tidy(value);
  if (!v || v.length > 120) return undefined;
  // auto-fill / auto-fit need a fixed or minmax size, and only one such repeat per list (as in CSS).
  if ((v.match(/auto-(?:fill|fit)/g) ?? []).length > 1) return undefined;
  return TRACK_LIST.test(v) ? v : undefined;
}

/** A grid-column / grid-row value, normalized ('' for auto); undefined if it is not one. */
export function parsePlacement(value: string): string | undefined {
  const v = tidy(value);
  if (!v || v === 'auto') return '';
  return PLACEMENT.test(v) ? v : undefined;
}

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

/** Keeps a state inside the limits; placements of items that no longer exist, or that are invalid, are dropped. */
export function normalizeGrid(s: GridState): GridState {
  const items = clamp(s.items, GRID_LIMITS.items);
  const placements: Record<number, Placement> = {};
  for (const [k, p] of Object.entries(s.placements)) {
    const i = Number(k), column = parsePlacement(p.column) ?? '', row = parsePlacement(p.row) ?? '';
    if (i >= 1 && i <= items && (column || row)) placements[i] = { column, row };
  }
  return { ...s, columns: parseTracks(s.columns) ?? DEFAULT_GRID.columns, rows: parseTracks(s.rows) ?? 'auto',
    rowGap: clamp(s.rowGap, GRID_LIMITS.gap), columnGap: clamp(s.columnGap, GRID_LIMITS.gap), items, placements };
}

/** The CSS for the container and each placed item; defaults are left out, and equal gaps are written as one `gap`. */
export function gridCss(input: GridState): string {
  const s = normalizeGrid(input), lines = ['.container {', '  display: grid;', `  grid-template-columns: ${s.columns};`];
  if (s.rows !== 'auto') lines.push(`  grid-template-rows: ${s.rows};`);
  if (s.rowGap === s.columnGap) { if (s.rowGap) lines.push(`  gap: ${s.rowGap}px;`); }
  else { if (s.rowGap) lines.push(`  row-gap: ${s.rowGap}px;`); if (s.columnGap) lines.push(`  column-gap: ${s.columnGap}px;`); }
  if (s.justifyItems !== 'stretch') lines.push(`  justify-items: ${s.justifyItems};`);
  if (s.alignItems !== 'stretch') lines.push(`  align-items: ${s.alignItems};`);
  lines.push('}');
  for (const [i, p] of Object.entries(s.placements).sort(([a], [b]) => Number(a) - Number(b))) {
    lines.push('', `.item:nth-child(${i}) {`);
    if (p.column) lines.push(`  grid-column: ${p.column};`);
    if (p.row) lines.push(`  grid-row: ${p.row};`);
    lines.push('}');
  }
  return lines.join('\n');
}

const ALIGN_TEXT: Record<ItemAlign, string> = { stretch: '拉滿整個格子', start: '靠格子的起點', center: '在格子裡置中', end: '靠格子的終點' };
function placementText(i: number, p: Placement) {
  const part = (axis: string, v: string) => !v ? '' : v.startsWith('span') ? `${axis}跨 ${v.replace('span ', '')} 格` : v.includes('/') ? `${axis}從第 ${v.replace(' / ', ' 條線到第 ')} 條線` : `${axis}從第 ${v} 條線開始`;
  return `第 ${i} 個項目：${[part('欄', p.column), part('列', p.row)].filter(Boolean).join('，')}。`;
}

/** A reading of the grid in words. */
export function describeGrid(input: GridState): string[] {
  const s = normalizeGrid(input), auto = /auto-(fill|fit)/.exec(s.columns)?.[1];
  const out = [
    auto ? `欄數隨容器寬度自動決定（${auto}）：放得下幾欄就排幾欄。` : `欄：${s.columns}。fr 是「剩餘空間的份數」，px 是固定寬度。`,
    s.rows === 'auto' ? '列沒有指定：依內容自動長出需要的列（隱式格線）。' : `列：${s.rows}；超出的項目會放進自動產生的列。`,
    s.rowGap === s.columnGap ? `格線間距 ${s.rowGap}px。` : `列間距 ${s.rowGap}px、欄間距 ${s.columnGap}px。`,
    `justify-items: ${s.justifyItems} → 水平方向${ALIGN_TEXT[s.justifyItems]}；align-items: ${s.alignItems} → 垂直方向${ALIGN_TEXT[s.alignItems]}。`,
  ];
  for (const [i, p] of Object.entries(s.placements)) out.push(placementText(Number(i), p));
  return out;
}

export const GRID_PRESETS: { id: string; label: string; state: GridState }[] = [
  { id: 'two', label: '2 Columns', state: { ...DEFAULT_GRID, columns: '1fr 1fr', items: 4 } },
  { id: 'three', label: '3 Columns', state: { ...DEFAULT_GRID, columns: 'repeat(3, 1fr)', items: 6 } },
  { id: 'dashboard', label: 'Dashboard', state: { ...DEFAULT_GRID, columns: '160px 1fr 1fr', rows: 'auto 1fr 1fr', items: 6, rowGap: 12, columnGap: 12,
    placements: { 1: { column: '1 / -1', row: '' }, 2: { column: '', row: '2 / 4' } } } },
  { id: 'gallery', label: 'Gallery', state: { ...DEFAULT_GRID, columns: 'repeat(auto-fill, minmax(90px, 1fr))', items: 9, rowGap: 8, columnGap: 8,
    placements: { 1: { column: 'span 2', row: 'span 2' } } } },
];
