import { describe, expect, it } from 'vitest';
import { easeInOut, flightView, flyTarget } from '@/lib/p9/world-fly';
import { HOME_VIEW, MAX_ZOOM, project } from '@/lib/p9/world-view';

const stage = { width: 1440, height: 936 }, inset = 360;

describe('P9.5 world fly-to', () => {
  const box = { x0: 300, y0: 150, x1: 600, y1: 400 };
  it('ends with the region filling the middle of the free stage, within the zoom limits', () => {
    const v = flyTarget(box, stage, inset);
    expect(v.k).toBeGreaterThan(1); expect(v.k).toBeLessThanOrEqual(MAX_ZOOM);
    const [x, y] = project(v, stage, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    expect(x).toBeCloseTo((stage.width - inset) / 2); expect(y).toBeCloseTo(stage.height / 2);
  });
  it('starts where the view is and ends at the target, eased, zooming monotonically', () => {
    const to = flyTarget(box, stage, inset);
    expect(flightView(HOME_VIEW, to, 0, stage, inset)).toMatchObject({ k: 1 });
    const end = flightView(HOME_VIEW, to, 1, stage, inset);
    expect(end.k).toBeCloseTo(to.k); expect(end.dx).toBeCloseTo(to.dx); expect(end.dy).toBeCloseTo(to.dy);
    let k = 1;
    for (let t = .05; t <= 1; t += .05) { const v = flightView(HOME_VIEW, to, t, stage, inset); expect(v.k).toBeGreaterThanOrEqual(k - 1e-9); k = v.k; }
    expect(easeInOut(0)).toBe(0); expect(easeInOut(1)).toBe(1); expect(easeInOut(.5)).toBeCloseTo(.5);
  });
});
