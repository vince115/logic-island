import { describe, expect, it } from 'vitest';
import { checkContrast, contrastRatio, formatRatio, isLargeText, luminance, parseHex, suggestText, toHex, type Rgb } from '@/lib/contrast';

// Multi-archipelago v2 (P4): the WCAG 2.x contrast math behind 色彩與無障礙實驗室.
const rgb = (hex: string) => parseHex(hex)!;

describe('colors', () => {
  it('parses #rgb and #rrggbb, with or without #, and nothing else', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('1a2B3c')).toEqual([26, 43, 60]);
    for (const bad of ['', '#ff', '#ggg', 'rgb(0,0,0)', '#12345', '#1234567']) expect(parseHex(bad), bad).toBeUndefined();
    expect(toHex([26, 43, 60])).toBe('#1a2b3c');
  });
});

describe('WCAG contrast', () => {
  it('matches the definition: luminance 0 and 1, ratio 21 for black on white, 1 for a color on itself', () => {
    expect(luminance(rgb('#000'))).toBe(0);
    expect(luminance(rgb('#fff'))).toBeCloseTo(1, 10);
    expect(contrastRatio(rgb('#000'), rgb('#fff'))).toBeCloseTo(21, 10);
    expect(contrastRatio(rgb('#3949ab'), rgb('#3949ab'))).toBe(1);
    // Symmetric: which color is the text does not matter.
    expect(contrastRatio(rgb('#767676'), rgb('#fff'))).toBe(contrastRatio(rgb('#fff'), rgb('#767676')));
  });

  it('gives the reference values: #767676 passes AA on white, #777777 does not', () => {
    expect(contrastRatio(rgb('#767676'), rgb('#fff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(rgb('#777777'), rgb('#fff'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(rgb('#595959'), rgb('#fff'))).toBeCloseTo(7.0, 1);
    expect(checkContrast(rgb('#767676'), rgb('#fff'), 16, false)).toMatchObject({ large: false, AA: true, AAA: false });
    expect(checkContrast(rgb('#777777'), rgb('#fff'), 16, false)).toMatchObject({ AA: false, nonText: true });
  });

  it('applies the large-text thresholds at 24px, or 18.66px bold', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(18, true)).toBe(false);
    // #949494 on white is about 3.03: large text passes AA, normal text does not.
    const grey = checkContrast(rgb('#949494'), rgb('#fff'), 24, false);
    expect(grey).toMatchObject({ large: true, AA: true, AAA: false, normal: { AA: false, AAA: false }, largeText: { AA: true, AAA: false } });
  });

  it('never shows a failing ratio rounded up to a passing one', () => {
    expect(formatRatio(4.4999)).toBe('4.49');
    expect(formatRatio(21)).toBe('21.00');
    const almost = checkContrast(rgb('#777777'), rgb('#fff'), 16, false);
    expect(Number(formatRatio(almost.ratio)) >= 4.5).toBe(almost.AA);
  });

  it('suggests the closest passing text color in the same hue, unchanged when it already passes', () => {
    const bg = rgb('#ffffff'), text = rgb('#9e9e9e');
    const fixed = suggestText(text, bg, 4.5)!;
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(fixed)).toBeLessThan(luminance(text));
    expect(suggestText(rgb('#000'), bg, 4.5)).toEqual([0, 0, 0]);
    // On a dark background the text gets lighter.
    const dark = rgb('#1e1e1e'), dim = rgb('#555555') as Rgb;
    expect(luminance(suggestText(dim, dark, 7)!)).toBeGreaterThan(luminance(dim));
  });
});
