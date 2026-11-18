// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, waitFor } from '@testing-library/react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * P1-37: the review tools of the world pages (`/world?without=<link ids>`, `/world/<region>?stress=glb`) exist only in
 * a build the server marked as a review build (LOGIC_ISLAND_WORLD_REVIEW=1, never a Vercel Production build). The
 * decision is made while the pages are prerendered and handed down as a prop: these tests hold the three places it
 * could go wrong: the flag itself, what the server pages pass, and what the client components do with an address that
 * asks for a review tool when the server said no.
 */

const captured = vi.hoisted(() => ({ scene: [] as Record<string, unknown>[], explorer: [] as Record<string, unknown>[], search: '' }));
// The overview loads its scene through next/dynamic: the stand-in records the props the scene would get.
vi.mock('next/dynamic', () => ({ default: () => (props: Record<string, unknown>) => { captured.scene.push(props); return null; } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/world/cs',
  useSearchParams: () => new URLSearchParams(captured.search),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
// The region map itself (WebGL) is not under test: the stand-in records what the explorer asks it to draw.
vi.mock('@/components/islands/hex-world/hex-world-explorer', () => ({ HexWorldExplorer: (props: Record<string, unknown>) => { captured.explorer.push(props); return null; } }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); captured.scene.length = 0; captured.explorer.length = 0; captured.search = ''; window.history.replaceState(null, '', '/'); });

/** The first element of a given component in what a server page returned. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, type); if (hit) return hit; } return null; }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  return node.type === type ? node : find(node.props.children as ReactNode, type);
}
const releaseBuild = () => { vi.stubEnv('LOGIC_ISLAND_REGIONAL_WORLD', '1'); vi.stubEnv('LOGIC_ISLAND_TRIALS', ''); vi.stubEnv('LOGIC_ISLAND_WORLD_REVIEW', ''); vi.stubEnv('VERCEL_ENV', ''); };

describe('P1-37 the review flag', () => {
  it('is off by default, on only for exactly 1, and never on in a Vercel Production build', async () => {
    const { worldReviewEnabled } = await import('@/lib/world/flag');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('LOGIC_ISLAND_WORLD_REVIEW', '');
    expect(worldReviewEnabled()).toBe(false);
    for (const value of ['true', 'on', '0', ' 1']) { vi.stubEnv('LOGIC_ISLAND_WORLD_REVIEW', value); expect(worldReviewEnabled(), value).toBe(false); }
    vi.stubEnv('LOGIC_ISLAND_WORLD_REVIEW', '1');
    expect(worldReviewEnabled()).toBe(true);
    for (const env of ['preview', 'development']) { vi.stubEnv('VERCEL_ENV', env); expect(worldReviewEnabled(), env).toBe(true); }
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(worldReviewEnabled(), 'a variable set in Production by mistake').toBe(false);
  });

  it('does not depend on the world flag, and the world flag does not turn it on', async () => {
    const { regionalWorldEnabled, worldReviewEnabled } = await import('@/lib/world/flag');
    releaseBuild();
    expect([regionalWorldEnabled(), worldReviewEnabled()]).toEqual([true, false]);
  });

  it('is read in one place, by the two server pages only: no client component reads the environment', () => {
    const src = path.join(__dirname, '../src'), files: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
    walk(src);
    const rel = (p: string) => path.relative(src, p).split(path.sep).join('/');
    const text = (p: string) => readFileSync(p, 'utf8');
    expect(files.filter(p => text(p).includes('LOGIC_ISLAND_WORLD_REVIEW') && /process\.env\.LOGIC_ISLAND_WORLD_REVIEW/.test(text(p))).map(rel)).toEqual(['lib/world/flag.ts']);
    const callers = files.filter(p => /worldReviewEnabled\(\)/.test(text(p)) && rel(p) !== 'lib/world/flag.ts');
    expect(callers.map(rel).sort()).toEqual(['app/world/[region]/page.tsx', 'app/world/page.tsx']);
    for (const p of callers) expect(text(p), rel(p)).not.toMatch(/^\s*['"]use client['"]/);
  });
});

describe('P1-37 what the server pages hand to the client', () => {
  it('the release build (world flag on, nothing else): review is false on /world and on every region', async () => {
    releaseBuild();
    const { default: WorldPage } = await import('../src/app/world/page');
    const { WorldOverview } = await import('@/components/world/world-overview');
    expect(find(WorldPage(), WorldOverview)?.props.review).toBe(false);
    const { default: RegionPage, generateStaticParams } = await import('../src/app/world/[region]/page');
    const { RegionalWorldExplorer } = await import('@/components/world/regional-world-explorer');
    const regions = generateStaticParams().map(p => p.region);
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) expect(find(await RegionPage({ params: Promise.resolve({ region }) }), RegionalWorldExplorer)?.props.review, region).toBe(false);
  });

  it('a review build: review is true; the same variable in a Vercel Production build: false', async () => {
    releaseBuild();
    vi.stubEnv('LOGIC_ISLAND_WORLD_REVIEW', '1');
    const { default: WorldPage } = await import('../src/app/world/page');
    const { WorldOverview } = await import('@/components/world/world-overview');
    const { default: RegionPage } = await import('../src/app/world/[region]/page');
    const { RegionalWorldExplorer } = await import('@/components/world/regional-world-explorer');
    const read = async () => [find(WorldPage(), WorldOverview)?.props.review, find(await RegionPage({ params: Promise.resolve({ region: 'cs' }) }), RegionalWorldExplorer)?.props.review];
    expect(await read()).toEqual([true, true]);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await read()).toEqual([false, false]);
  });
});

describe('P1-37 what the client does with the address', () => {
  const overview = async (review: boolean | undefined) => {
    const { WorldOverview } = await import('@/components/world/world-overview');
    const { hubSummary, regionSummaries } = await import('@/lib/world/learning-islands');
    window.history.replaceState(null, '', '/world?without=sys-cs,cs-ai,hub-cs');
    render(<WorldOverview regions={regionSummaries()} hub={hubSummary()} {...(review === undefined ? {} : { review })}/>);
    // The address is read in an effect: give it the chance to run before looking at what the scene got.
    await waitFor(() => expect(captured.scene.length).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 20));
    return captured.scene.map(p => p.without);
  };

  it('/world?without=…: every bridge is drawn when the server said no (and when it said nothing)', async () => {
    expect(new Set(await overview(false))).toEqual(new Set(['']));
    cleanup(); captured.scene.length = 0;
    expect(new Set(await overview(undefined))).toEqual(new Set(['']));
  });

  it('/world?without=…: the named bridges are left out in a review build', async () => {
    expect((await overview(true)).at(-1)).toBe('sys-cs,cs-ai,hub-cs');
  });

  const region = async (review: boolean | undefined, search: string) => {
    const { RegionalWorldExplorer } = await import('@/components/world/regional-world-explorer');
    const { hubSummary, regionIslands } = await import('@/lib/world/learning-islands');
    captured.search = search;
    render(<RegionalWorldExplorer regionId="cs" regionName="程式與資訊群島" regionNameEn="Computer Science" islands={regionIslands('cs')} hub={hubSummary().lab} {...(review === undefined ? {} : { review })}/>);
    const props = captured.explorer.at(-1) as { options: { glbLayouts?: unknown[] }; copy: { section: string } };
    return { models: props.options.glbLayouts?.length ?? 0, section: props.copy.section };
  };

  it('/world/cs?stress=glb: the map is the ordinary one when the server said no (and when it said nothing)', async () => {
    const plain = await region(false, '');
    expect(plain.section).toBe('程式與資訊群島地圖');
    for (const review of [false, undefined]) { cleanup(); expect(await region(review, 'stress=glb'), String(review)).toEqual(plain); }
  });

  it('/world/cs?stress=glb: the stand-in models are added, and named, in a review build', async () => {
    const plain = await region(true, '');
    cleanup();
    const stressed = await region(true, 'stress=glb');
    expect(stressed.models).toBeGreaterThan(plain.models);
    expect(stressed.section).toBe('程式與資訊群島地圖（效能測試替身）');
  });
});
