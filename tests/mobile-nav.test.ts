import { describe, expect, it } from 'vitest';
import { DESTINATIONS, PATTERNS, TOUCH_TEXT, nextTab, touchVerdict, trapFocus } from '@/lib/mobile-nav';

/* R8.3: the Mobile Navigation Simulator's model — the four patterns and the keyboard and touch rules they follow. */
describe('mobile navigation simulator model', () => {
  it('compares the four patterns, each with when to use it, its trade-offs and its accessibility notes', () => {
    expect(PATTERNS.map(p => p.label)).toEqual(['Bottom Navigation', 'Navigation Drawer', 'Tabs', 'Hamburger Menu']);
    for (const p of PATTERNS) {
      expect(p.when, p.id).not.toBe('');
      expect(p.strengths.length, p.id).toBeGreaterThan(0);
      expect(p.cautions.length, p.id).toBeGreaterThan(0);
      expect(p.a11y.length, p.id).toBeGreaterThanOrEqual(3);
    }
    expect(DESTINATIONS).toHaveLength(4);
  });

  it('moves through a tab list with the arrows (wrapping), Home and End', () => {
    expect([nextTab(0, 'ArrowRight', 3), nextTab(2, 'ArrowRight', 3), nextTab(0, 'ArrowLeft', 3)]).toEqual([1, 0, 2]);
    expect([nextTab(1, 'Home', 3), nextTab(1, 'End', 3), nextTab(1, 'a', 3), nextTab(0, 'ArrowRight', 0)]).toEqual([0, 2, 1, 0]);
  });

  it('keeps focus inside a modal drawer: Tab wraps forward, Shift+Tab backward', () => {
    expect([trapFocus(3, 4, false), trapFocus(0, 4, true), trapFocus(1, 4, false), trapFocus(-1, 4, false), trapFocus(-1, 4, true)]).toEqual([0, 3, 2, 0, 3]);
    expect(trapFocus(0, 0, false)).toBe(-1);
  });

  it('judges touch targets by the smallest side of the smallest target', () => {
    expect(touchVerdict([{ width: 64, height: 56 }, { width: 48, height: 52 }])).toEqual({ min: 48, level: 'recommended' });
    expect(touchVerdict([{ width: 80, height: 32 }])).toEqual({ min: 32, level: 'minimum' });
    expect(touchVerdict([{ width: 20.5, height: 60 }])).toEqual({ min: 20, level: 'fail' });
    expect(touchVerdict([])).toEqual({ min: 0, level: 'none' });
    expect(Object.keys(TOUCH_TEXT)).toEqual(['recommended', 'minimum', 'fail', 'none']);
  });
});
