import { describe, expect, it } from 'vitest';
import { DEFAULT_FLEX, FLEX_PRESETS, describeFlex, flexCss, normalize } from '@/lib/flexbox';

/* R7: the Flexbox Playground's model — the CSS it shows and how it reads the two axes. */
describe('flexbox playground model', () => {
  it('writes only what differs from the defaults', () => {
    expect(flexCss(DEFAULT_FLEX)).toBe('.container {\n  display: flex;\n  gap: 12px;\n}');
    expect(flexCss({ ...DEFAULT_FLEX, gap: 0 })).toBe('.container {\n  display: flex;\n}');
    expect(flexCss({ ...DEFAULT_FLEX, direction: 'column', justify: 'center', align: 'center', wrap: 'wrap', gap: 8, grow: 2 })).toBe(
      '.container {\n  display: flex;\n  flex-direction: column;\n  flex-wrap: wrap;\n  justify-content: center;\n  align-items: center;\n  gap: 8px;\n}\n\n.item:nth-child(2) {\n  flex-grow: 1;\n}');
  });

  it('keeps every value inside the lab limits', () => {
    expect(normalize({ ...DEFAULT_FLEX, items: 20, gap: -5, grow: 3 })).toMatchObject({ items: 8, gap: 0, grow: 3 });
    expect(normalize({ ...DEFAULT_FLEX, items: 2, grow: 5 }).grow).toBe(0);
    expect(normalize({ ...DEFAULT_FLEX, items: Number.NaN }).items).toBe(1);
  });

  it('names the main and cross axes for each direction', () => {
    expect(describeFlex(DEFAULT_FLEX)[0]).toBe('主軸是水平方向，由左往右；交錯軸是垂直方向。');
    expect(describeFlex({ ...DEFAULT_FLEX, direction: 'column-reverse' })[0]).toBe('主軸是垂直方向，由下往上；交錯軸是水平方向。');
    expect(describeFlex({ ...DEFAULT_FLEX, wrap: 'wrap' })[3]).toContain('下一行');
    // A growing item leaves no free space for justify-content to share out.
    expect(describeFlex({ ...DEFAULT_FLEX, grow: 1, justify: 'center' }).at(-1)).toContain('justify-content 不再有剩餘空間');
  });

  it('has presets for the layouts the lessons use, each a valid state', () => {
    expect(FLEX_PRESETS.map(p => p.id)).toEqual(['center', 'navbar', 'cards', 'sidebar', 'stack']);
    for (const p of FLEX_PRESETS) expect(normalize(p.state)).toEqual(p.state);
  });
});
