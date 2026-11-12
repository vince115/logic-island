import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Multi-archipelago v2 (P1a): the contract for every dynamic route's static params, in the default build and in a build
 * with both feature flags (LOGIC_ISLAND_TRIALS=1, LOGIC_ISLAND_REGIONAL_WORLD=1). Adding regions, islands or planned
 * lessons must not add a page: a planned lesson has no /curriculum page, a region without a 3D layout has no /world
 * page. When a change is meant to add or remove routes (a lesson is written, a region gets a map), update the snapshot
 * on purpose and say why in the commit.
 */

const PAGES = {
  'curriculum/[slug]': () => import('../src/app/curriculum/[slug]/page'),
  'learn/[slug]': () => import('../src/app/learn/[slug]/page'),
  // R6: the four region overviews.
  'regions/[region]': () => import('../src/app/regions/[region]/page'),
  'world/[region]': () => import('../src/app/world/[region]/page'),
  'trials/[exam]': () => import('../src/app/trials/[exam]/page'),
  'trials/[exam]/[paper]': () => import('../src/app/trials/[exam]/[paper]/page'),
  'trials/[exam]/[paper]/result': () => import('../src/app/trials/[exam]/[paper]/result/page'),
  'islands/hex/scale/[variant]': () => import('../src/app/islands/hex/scale/[variant]/page'),
} as const;

async function routes() {
  const out: Record<string, string[]> = {};
  for (const [route, load] of Object.entries(PAGES)) {
    const page = await load() as { generateStaticParams: () => Record<string, string>[] | Promise<Record<string, string>[]> };
    out[route] = (await page.generateStaticParams()).map(p => Object.values(p).join('/')).sort();
  }
  return out;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('route contract (multi-archipelago v2)', () => {
  it('generates the same pages in the default build', async () => {
    vi.stubEnv('LOGIC_ISLAND_TRIALS', '');
    vi.stubEnv('LOGIC_ISLAND_REGIONAL_WORLD', '');
    expect(await routes()).toMatchSnapshot();
  });

  it('generates the same pages with both feature flags on', async () => {
    vi.stubEnv('LOGIC_ISLAND_TRIALS', '1');
    vi.stubEnv('LOGIC_ISLAND_REGIONAL_WORLD', '1');
    expect(await routes()).toMatchSnapshot();
  });
});

// R6: a dynamic route left out of PAGES escapes the contract (it happened once: /regions/[region] first passed unseen).
describe('route contract coverage', () => {
  it('lists every dynamic page of src/app', () => {
    const app = path.join(__dirname, '../src/app'), found: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name === 'page.tsx' && /\[/.test(path.relative(app, dir))) found.push(path.relative(app, dir).split(path.sep).join('/'));
    } };
    walk(app);
    expect(found.sort()).toEqual(Object.keys(PAGES).sort());
  });
});
