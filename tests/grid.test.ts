import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID, GRID_PRESETS, describeGrid, gridCss, normalizeGrid, parsePlacement, parseTracks } from '@/lib/grid';

/* R8.1: the CSS Grid Playground's model — what it accepts, the CSS it writes and how it reads the grid. */
describe('css grid playground model', () => {
  it('accepts the track lists the lessons use, normalized', () => {
    for (const [input, out] of [
      ['1fr 1fr', '1fr 1fr'], ['repeat(3,1fr)', 'repeat(3, 1fr)'], ['200px  1fr', '200px 1fr'], ['auto 1fr auto', 'auto 1fr auto'],
      ['repeat( auto-fill , minmax(120px,1fr) )', 'repeat(auto-fill, minmax(120px, 1fr))'], ['minmax(100px, 30%) 2fr', 'minmax(100px, 30%) 2fr'],
      ['repeat(2, 1fr 2fr)', 'repeat(2, 1fr 2fr)'], ['10rem max-content', '10rem max-content'],
    ] as const) expect(parseTracks(input), input).toBe(out);
  });

  it('refuses anything else, so a typo or an injection never reaches the preview', () => {
    for (const bad of ['', '1fr;color:red', 'calc(100% - 1px)', 'repeat(0, 1fr)', 'repeat(auto-fill, 1fr) repeat(auto-fit, 1fr)', '1 fr', 'url(x)', 'subgrid', 'x'.repeat(130)])
      expect(parseTracks(bad), bad).toBeUndefined();
  });

  it('accepts line numbers, spans and start / end for grid-column and grid-row', () => {
    for (const [input, out] of [['1 / 3', '1 / 3'], ['1/-1', '1 / -1'], ['span 2', 'span 2'], ['2 / span 3', '2 / span 3'], ['auto', ''], ['', ''], ['3', '3']] as const)
      expect(parsePlacement(input), input).toBe(out);
    for (const bad of ['0', 'span 0', '1 / 2 / 3', 'a', '1;', 'span']) expect(parsePlacement(bad), bad).toBeUndefined();
  });

  it('writes only what differs from the defaults, one gap when both are equal', () => {
    expect(gridCss(DEFAULT_GRID)).toBe('.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 12px;\n}');
    expect(gridCss({ ...DEFAULT_GRID, rowGap: 8, columnGap: 24, justifyItems: 'center', alignItems: 'end', rows: '100px auto' })).toBe(
      '.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-template-rows: 100px auto;\n  row-gap: 8px;\n  column-gap: 24px;\n  justify-items: center;\n  align-items: end;\n}');
    expect(gridCss({ ...DEFAULT_GRID, rowGap: 0, columnGap: 0, placements: { 2: { column: 'span 2', row: '' } } })).toBe(
      '.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n}\n\n.item:nth-child(2) {\n  grid-column: span 2;\n}');
  });

  it('keeps the state inside its limits and drops placements it cannot apply', () => {
    const s = normalizeGrid({ ...DEFAULT_GRID, items: 40, rowGap: 99, columnGap: -1, columns: 'oops',
      placements: { 3: { column: '1 / 3', row: 'bad' }, 20: { column: 'span 2', row: '' }, 4: { column: '', row: '' } } });
    expect(s).toMatchObject({ items: 12, rowGap: 48, columnGap: 0, columns: 'repeat(3, 1fr)', placements: { 3: { column: '1 / 3', row: '' } } });
  });

  it('reads the grid in words, including automatic columns and placements', () => {
    expect(describeGrid(DEFAULT_GRID)[0]).toContain('fr 是「剩餘空間的份數」');
    const gallery = describeGrid(GRID_PRESETS.find(p => p.id === 'gallery')!.state);
    expect(gallery[0]).toBe('欄數隨容器寬度自動決定（fill）：放得下幾欄就排幾欄。');
    expect(gallery.at(-1)).toBe('第 1 個項目：欄跨 2 格，列跨 2 格。');
    expect(describeGrid({ ...DEFAULT_GRID, placements: { 1: { column: '1 / -1', row: '' } } }).at(-1)).toBe('第 1 個項目：欄從第 1 條線到第 -1 條線。');
  });

  it('has the four presets, each a valid state', () => {
    expect(GRID_PRESETS.map(p => p.label)).toEqual(['2 Columns', '3 Columns', 'Dashboard', 'Gallery']);
    for (const p of GRID_PRESETS) expect(normalizeGrid(p.state), p.id).toEqual(p.state);
  });
});
