/*
 * Multi-archipelago v2 (P4): WCAG 2.x contrast, as pure functions for the 色彩與無障礙實驗室 (/learn/color-contrast).
 * Relative luminance and contrast ratio follow WCAG 2.2 §1.4.3's definitions (sRGB, linearised per channel with the
 * 0.04045 threshold of IEC 61966-2-1). Thresholds compare the exact ratio: 4.499 is not 4.5, and the display never
 * rounds a failing ratio up to a passing one.
 */

export type Rgb = readonly [number, number, number];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** #rgb or #rrggbb (case-insensitive, # optional) → 0–255 channels; anything else is undefined. */
export function parseHex(input: string): Rgb | undefined {
  const m = HEX.exec(input.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}
export const toHex = (rgb: Rgb) => `#${rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/** Relative luminance, 0 (black) to 1 (white). */
export const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
/** (L1 + 0.05) / (L2 + 0.05) with L1 the lighter: 1 to 21, the same whichever color is the text. */
export function contrastRatio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Two decimals, rounded down, so a ratio shown as 4.50 always passes 4.5. */
export const formatRatio = (ratio: number) => (Math.floor(ratio * 100) / 100).toFixed(2);

/**
 * Large text in WCAG: at least 18pt (24 CSS px) regular, or 14pt (about 18.66 CSS px) bold. Large text needs 3:1 (AA)
 * and 4.5:1 (AAA); other text needs 4.5:1 (AA) and 7:1 (AAA).
 */
export const isLargeText = (px: number, bold: boolean) => px >= 24 || (bold && px >= 18.66);
export const THRESHOLDS = { normal: { AA: 4.5, AAA: 7 }, large: { AA: 3, AAA: 4.5 }, nonText: 3 } as const;

export interface ContrastResult {
  ratio: number;
  large: boolean;
  /** For the text size given. */
  AA: boolean; AAA: boolean;
  /** Both sizes, for the comparison table. */
  normal: { AA: boolean; AAA: boolean };
  largeText: { AA: boolean; AAA: boolean };
  /** WCAG 1.4.11: icons, borders and focus rings against what is next to them. */
  nonText: boolean;
}
export function checkContrast(text: Rgb, background: Rgb, px: number, bold: boolean): ContrastResult {
  const ratio = contrastRatio(text, background), large = isLargeText(px, bold);
  const normal = { AA: ratio >= THRESHOLDS.normal.AA, AAA: ratio >= THRESHOLDS.normal.AAA };
  const largeText = { AA: ratio >= THRESHOLDS.large.AA, AAA: ratio >= THRESHOLDS.large.AAA };
  const own = large ? largeText : normal;
  return { ratio, large, AA: own.AA, AAA: own.AAA, normal, largeText, nonText: ratio >= THRESHOLDS.nonText };
}

/**
 * The closest text color that reaches `target` against the background: the same hue mixed toward black or white, in
 * small steps, whichever direction reaches the target with less change. Undefined when neither can (never for 4.5 or 7,
 * since black or white always reaches at least 4.58 against any background).
 */
export function suggestText(text: Rgb, background: Rgb, target: number): Rgb | undefined {
  if (contrastRatio(text, background) >= target) return text;
  const mix = (to: number, t: number) => text.map(c => Math.round(c + (to - c) * t)) as unknown as Rgb;
  const candidates: { rgb: Rgb; t: number }[] = [];
  for (const to of [0, 255]) {
    for (let step = 1; step <= 100; step++) {
      const rgb = mix(to, step / 100);
      if (contrastRatio(rgb, background) >= target) { candidates.push({ rgb, t: step }); break; }
    }
  }
  return candidates.sort((a, b) => a.t - b.t)[0]?.rgb;
}
