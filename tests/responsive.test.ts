import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAKPOINTS, DEVICES, activeQueries, clampWidth, describeResponsive, normalizeBreakpoints, responsiveCss, responsiveDocument, tierAt } from '@/lib/responsive';

/* R8.2: the Responsive Layout Simulator's model — a mobile-first sheet and which of its queries apply at a width. */
describe('responsive layout simulator model', () => {
  it('applies a mobile-first sheet: md from its breakpoint up, lg from its breakpoint up', () => {
    expect(DEVICES.map(d => [d.label, tierAt(d.width, DEFAULT_BREAKPOINTS)])).toEqual([['Mobile', 'base'], ['Tablet', 'md'], ['Desktop', 'lg']]);
    // min-width is inclusive: exactly at the breakpoint the query applies, one pixel below it does not.
    expect([767, 768, 1023, 1024].map(w => tierAt(w, DEFAULT_BREAKPOINTS))).toEqual(['base', 'md', 'md', 'lg']);
    expect(activeQueries(375, DEFAULT_BREAKPOINTS)).toEqual([]);
    expect(activeQueries(1280, DEFAULT_BREAKPOINTS)).toEqual([768, 1024]);
  });

  it('writes base rules first and one min-width query per breakpoint, with the chosen values', () => {
    const css = responsiveCss('cards', { md: 600, lg: 1100 });
    expect(css.indexOf('@media (min-width: 600px)')).toBeGreaterThan(css.indexOf('.cards {'));
    expect(css.indexOf('@media (min-width: 1100px)')).toBeGreaterThan(css.indexOf('@media (min-width: 600px)'));
    expect(css).not.toMatch(/max-width/);
    expect(css).toContain('    grid-template-columns: repeat(4, 1fr);');
    expect(responsiveCss('page', DEFAULT_BREAKPOINTS)).toContain('grid-template-areas: "header header header" "nav main aside" "footer footer footer";');
  });

  it('keeps the breakpoints usable: inside their limits and at least 120px apart', () => {
    expect(normalizeBreakpoints({ md: 200, lg: 300 })).toEqual({ md: 480, lg: 640 });
    expect(normalizeBreakpoints({ md: 900, lg: 950 })).toEqual({ md: 900, lg: 1020 });
    expect(normalizeBreakpoints({ md: 5000, lg: 9000 })).toEqual({ md: 960, lg: 1360 });
    expect([clampWidth(100), clampWidth(9999), clampWidth(Number.NaN)]).toEqual([320, 1440, 320]);
  });

  it('puts exactly the shown CSS in the demo page, after the theme', () => {
    const doc = responsiveDocument('page', DEFAULT_BREAKPOINTS), css = responsiveCss('page', DEFAULT_BREAKPOINTS);
    expect(doc).toContain(`<style>${css}</style>`);
    expect(doc).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(doc).not.toMatch(/<script/i);
  });

  it('says which rules apply and how far the next breakpoint is', () => {
    expect(describeResponsive('page', 375, DEFAULT_BREAKPOINTS)).toEqual(['視窗寬度 375px：手機（基本樣式）。套用的規則：只有基本樣式。', '所有區塊由上往下排成一欄，卡片一欄。', '再寬 393px 會進入平板版面。']);
    expect(describeResponsive('cards', 800, DEFAULT_BREAKPOINTS).at(-1)).toBe('再寬 224px 會進入桌機版面；窄 33px 會回到手機版面。');
    expect(describeResponsive('cards', 1280, DEFAULT_BREAKPOINTS)[0]).toContain('min-width: 768px ＋ min-width: 1024px');
  });
});
