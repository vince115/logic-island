import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENE_PRESETS, sceneOptions } from '@/components/islands/hex-world/hex-scene-presets';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { islandsWorld } from '@/lib/islands/islands-world';

// D.3-3 preflight: /islands/candidate is the future /islands on the shared renderer; /islands/legacy is today's /islands.
const read = (path: string) => readFileSync(path, 'utf8');
const imports = (path: string) => [...read(path).matchAll(/from '([^']+)'/g)].map(match => match[1]);

describe('/islands routes (D.3-3 preflight)', () => {
  it('the candidate draws the production world with the production preset: the lab exactly, minus the probe', () => {
    const candidate = sceneOptions(islandsWorld, SCENE_PRESETS.production);
    // D.3-5c/D.3-6d: the free camera, Auto Orbit and the times of day, tried in the lab first, are the candidate's too.
    const { perfProbe, ...lab } = sceneOptions(scalePrototypes['37'], SCENE_PRESETS.lab);
    expect(perfProbe).toBe(true);
    expect(candidate).toMatchObject({ camera: 'free', timeOfDay: true });
    expect('perfProbe' in candidate).toBe(false);
    expect(lab).toEqual(candidate);
    expect(candidate).toMatchObject({ glbLayouts: islandsWorld.glb, forests: islandsWorld.forests, nature: islandsWorld.natural, hover: true });
  });

  it('the candidate page renders only the shared hex explorer, through the production explorer', () => {
    expect(imports('src/app/islands/candidate/page.tsx')).toContain('@/components/islands/hex-world/islands-world-explorer');
    expect(imports('src/app/islands/candidate/page.tsx').filter(path => /islands-explorer$/.test(path))).toEqual([]);
    expect(imports('src/components/islands/hex-world/islands-world-explorer.tsx')).toEqual(expect.arrayContaining(['@/lib/islands/islands-world', './hex-scene-presets']));
    expect(read('src/components/islands/hex-world/islands-world-explorer.tsx')).toContain('SCENE_PRESETS.production');
  });

  it('/islands keeps the isometric explorer, and /islands/legacy is that same page, kept out of search indexes', () => {
    expect(imports('src/app/islands/page.tsx')).toContain('@/components/islands/islands-explorer');
    expect(imports('src/app/islands/page.tsx').filter(path => path.includes('hex-world'))).toEqual([]);
    const legacy = read('src/app/islands/legacy/page.tsx');
    expect(legacy).toContain("export { default } from '../page';");
    expect(legacy).toContain('robots:{index:false,follow:false}');
  });
});
