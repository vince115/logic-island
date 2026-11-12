import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENE_PRESETS } from '@/components/islands/hex-world/hex-scene-presets';

// D.3-1: named scene presets, and production code kept apart from the prototype data and the measurement probe.
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
const sources = files('src').map(path => ({ path, text: readFileSync(path, 'utf8') }));

describe('scene presets (D.3-1)', () => {
  it('production carries the accepted D.2c look and budget, and never the measurement probe', () => {
    expect(SCENE_PRESETS.production).toMatchObject({ terrain: 'natural', ocean: 'natural', shadows: 'static', treeLod: 24, hover: true });
    expect('perfProbe' in SCENE_PRESETS.production).toBe(false);
  });

  it('D.3-5c/D.3-6d: production carries the free camera (with Auto Orbit) and the times of day from the lab', () => {
    expect(SCENE_PRESETS.production).toMatchObject({ camera: 'free', timeOfDay: true, lighting: 'contrast' });
  });

  it('the lab preset is production plus the probe, nothing else (D.3-5c/D.3-6d: the candidate took its camera and times of day)', () => {
    const { perfProbe, ...rest } = SCENE_PRESETS.lab;
    expect(perfProbe).toBe(true);
    expect(rest).toEqual(SCENE_PRESETS.production);
    // The 19-tile reference and the A2 preview stay as they were: fixed camera, noon.
    for (const name of ['scale19', 'a2Preview'] as const) {
      expect('camera' in SCENE_PRESETS[name], name).toBe(false);
      expect('timeOfDay' in SCENE_PRESETS[name], name).toBe(false);
    }
  });

  it('only the scale prototype pages import the prototype module', () => {
    const importers = sources.filter(s => /from '[^']*hex-scale-prototype'/.test(s.text)).map(s => s.path).sort();
    expect(importers).toEqual(['src/app/islands/hex/scale/[variant]/page.tsx', 'src/components/islands/hex-world/hex-scale-explorer.tsx']);
  });

  it('the probe is only ever loaded lazily, so a scene without `perfProbe` never downloads it', () => {
    expect(sources.filter(s => /from '[^']*hex-perf-probe'/.test(s.text))).toEqual([]);
    expect(sources.filter(s => s.text.includes("import('./hex-perf-probe')")).map(s => s.path)).toEqual(['src/components/islands/hex-world/hex-world-scene.tsx']);
  });
});
