import { describe, expect, it } from 'vitest';
import { HOME_VIEW, MAX_ZOOM, MIN_ZOOM, clampView, isHome, panBy, project, wheelFactor, zoomAt } from '@/lib/p9/world-view';

const stage = { width: 1000, height: 800 };

describe('P9.4 world view (zoom and pan)', () => {
  it('at rest draws every point where the framing puts it', () => {
    expect(project(HOME_VIEW, stage, 123, 456)).toEqual([123, 456]);
    expect(isHome(HOME_VIEW)).toBe(true);
  });

  it('zooms about the given point: the point under the cursor stays put', () => {
    const v = zoomAt(HOME_VIEW, stage, 2, 300, 200);
    expect(v.k).toBe(2);
    const [x, y] = project(v, stage, 300, 200);
    expect(x).toBeCloseTo(300); expect(y).toBeCloseTo(200);
    // Zooming back out by the same factor at the same point returns home.
    const back = zoomAt(v, stage, .5, 300, 200);
    expect(isHome(back)).toBe(true);
  });

  it('keeps the zoom within its limits and the world in sight', () => {
    expect(zoomAt(HOME_VIEW, stage, 100, 500, 400).k).toBe(MAX_ZOOM);
    expect(zoomAt(HOME_VIEW, stage, .01, 500, 400).k).toBe(MIN_ZOOM);
    const far = panBy(HOME_VIEW, stage, 5000, -5000);
    const [cx, cy] = project(far, stage, 500, 400);
    expect(cx).toBeLessThanOrEqual(900); expect(cx).toBeGreaterThanOrEqual(100);
    expect(cy).toBeLessThanOrEqual(720); expect(cy).toBeGreaterThanOrEqual(80);
    expect(clampView({ k: 9, dx: 0, dy: 0 }, stage).k).toBe(MAX_ZOOM);
  });

  it('pans by the pointer\'s travel', () => {
    const v = panBy({ k: 2, dx: 0, dy: 0 }, stage, 40, -30);
    expect(v).toEqual({ k: 2, dx: 40, dy: -30 });
  });

  it('turns a wheel notch into a gentle step, and up zooms in', () => {
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelFactor(100, 0)).toBeLessThan(1);
    expect(wheelFactor(-100, 0)).toBeLessThan(1.2);
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48, 0));
  });
});
