import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getIsland, worldIslands } from '@/content/world';
import { catalogLessons } from '@/content/world/catalog';
import { worldPages } from '@/content/world/records';
import { GLB_ASSET_IDS, VEGETATION_ASSET, glbAssetOfIsland, glbAssets } from '@/lib/islands/asset-registry';
import { validateGlbEntry } from '@/lib/islands/glb-island-contract';
import { TREE_NODES } from '@/lib/islands/hex-nature-data';
import { ROUTE_HINTS, infoOnly, interactionOf, routeHref, routeIsWellFormed, targetLabel, type IslandInteractionSpec, type IslandRoute } from '@/lib/islands/interactions';
import { HOME_MAP_INTERACTIONS, ISLAND_INTERACTIONS, pageInteractions } from '@/lib/islands/island-interactions';
import { REGION_LAYOUTS } from '@/lib/islands/regions/region-layouts';
import { islandInteractions, validateInteractionSpec } from '@/lib/world/island-interactions';
import { regionIslands } from '@/lib/world/learning-islands';
import { REGION_IDS } from '@/content/world/types';

/*
 * P9 S1: the GLB Asset Registry and the island interaction specs. An asset says what is in its file; an island's
 * interaction spec says what its targets do; the server holds every route to a page that exists and is published.
 */

describe('GLB asset registry (P9 S1)', () => {
  it('every asset is one island\'s, passes the contract, and matches its file byte for byte', () => {
    expect(GLB_ASSET_IDS.length).toBeGreaterThan(0);
    for (const id of GLB_ASSET_IDS) {
      const asset = glbAssets[id];
      expect(validateGlbEntry(id, asset), id).toEqual([]);
      expect(getIsland(asset.islandId), `${id}: island ${asset.islandId}`).toBeDefined();
      const path = `public${asset.url}`;
      expect(existsSync(path), path).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, id).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), id).toBe(asset.sha256);
    }
    // One asset per island: the island's id finds it, and no two assets claim the same island.
    const owners = GLB_ASSET_IDS.map(id => glbAssets[id].islandId);
    expect(new Set(owners).size).toBe(owners.length);
    for (const id of GLB_ASSET_IDS) expect(glbAssetOfIsland(glbAssets[id].islandId)).toBe(id);
    expect(glbAssetOfIsland('structures')).toBeUndefined();
  });

  it('a region map places an asset only on the island that owns it, and footprints name nodes of the asset', () => {
    for (const region of Object.values(REGION_LAYOUTS)) for (const layout of region.layout.glb) expect(glbAssets[layout.asset].islandId, layout.islandId).toBe(layout.islandId);
    for (const id of GLB_ASSET_IDS) {
      const asset = glbAssets[id], targets: string[] = asset.nodes.filter(n => n.kind === 'target').map(n => n.node);
      for (const node of Object.keys(asset.footprints ?? {})) expect(targets, `${id} footprint ${node}`).toContain(node);
    }
  });

  it('the shared trees come from a registered asset whose file has every tree node', () => {
    const bytes = readFileSync(`public${glbAssets[VEGETATION_ASSET].url}`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as { nodes: { name: string }[] };
    for (const name of TREE_NODES) expect(json.nodes.some(n => n.name === name), name).toBe(true);
  });
});

describe('typed island routes (P9 S1)', () => {
  it('build only the three site-internal shapes and refuse anything else', () => {
    expect(routeHref({ kind: 'labs' })).toBe('/learn');
    expect(routeHref({ kind: 'syllabus', islandId: 'foundations' })).toBe('/curriculum#island-foundations');
    expect(routeHref({ kind: 'lesson', islandId: 'foundations', slug: 'programs-and-algorithms' })).toBe('/curriculum/programs-and-algorithms');
    const bad: IslandRoute[] = [
      { kind: 'syllabus', islandId: '../trials' }, { kind: 'syllabus', islandId: 'a b' }, { kind: 'syllabus', islandId: '' },
      { kind: 'lesson', islandId: 'foundations', slug: '//evil.example' }, { kind: 'lesson', islandId: 'foundations', slug: 'x?y=1' }, { kind: 'lesson', islandId: 'foundations', slug: 'A' },
    ];
    for (const route of bad) { expect(routeIsWellFormed(route), JSON.stringify(route)).toBe(false); expect(() => routeHref(route)).toThrow(); }
    expect(Object.keys(ROUTE_HINTS).sort()).toEqual(['labs', 'lesson', 'syllabus']);
  });

  it('labels: a route target reads its name and where it leads, an info target its name', () => {
    const spec = ISLAND_INTERACTIONS.foundations;
    expect(targetLabel(interactionOf(spec, 'learn')!)).toBe('工坊 · 課綱');
    expect(targetLabel(interactionOf(spec, 'lighthouse')!)).toBe('燈塔');
    expect(targetLabel(interactionOf(HOME_MAP_INTERACTIONS.foundations, 'learn')!)).toBe('工坊 · 學習路線');
    expect(interactionOf(spec, 'route_exit')).toBeUndefined();
    expect(interactionOf(undefined, 'learn')).toBeUndefined();
  });
});

describe('island interaction specs (P9 S1)', () => {
  const pages = worldPages().routes;

  it('every spec of the registry is valid against the world registry and the catalog', () => {
    for (const [id, spec] of Object.entries(ISLAND_INTERACTIONS)) {
      expect(spec.islandId).toBe(id);
      expect(validateInteractionSpec(spec), id).toEqual([]);
      expect(() => islandInteractions(id)).not.toThrow();
    }
    expect(islandInteractions('structures')).toBeUndefined();
  });

  it('S0 decision 4: the foundations workshop leads to its own syllabus, which exists and is published; the hub keeps /learn', () => {
    const workshop = interactionOf(islandInteractions('foundations'), 'learn')!.action;
    expect(workshop).toEqual({ type: 'route', to: { kind: 'syllabus', islandId: 'foundations' } });
    const href = routeHref((workshop as { to: IslandRoute }).to);
    expect(href).toBe('/curriculum#island-foundations');
    expect(pages.has(href)).toBe(true);
    // The anchor is the island's own entry point in the world registry, and the island has all 20 lessons published.
    expect(getIsland('foundations')!.entryPoints.map(e => e.target)).toContain(href);
    expect(catalogLessons.filter(l => l.islandId === 'foundations' && l.lessonStatus === 'complete')).toHaveLength(20);
    expect(interactionOf(islandInteractions('labs'), 'labs')!.action).toEqual({ type: 'route', to: { kind: 'labs' } });
    expect(getIsland('labs')!.kind).toBe('tool');
    // No subject island of the registry leads to /learn.
    for (const [id, spec] of Object.entries(ISLAND_INTERACTIONS)) if (getIsland(id)!.kind === 'subject')
      for (const t of spec.targets) expect(t.action.type === 'route' && t.action.to.kind === 'labs', `${id} ${t.interactionId}`).toBe(false);
  });

  it('the home map\'s set differs from the registry only in the foundations workshop, and is valid as the home map\'s', () => {
    expect(Object.keys(HOME_MAP_INTERACTIONS).sort()).toEqual(Object.keys(ISLAND_INTERACTIONS).sort());
    for (const [id, spec] of Object.entries(HOME_MAP_INTERACTIONS)) {
      expect(validateInteractionSpec(spec, { homeMap: true }), id).toEqual([]);
      const own = ISLAND_INTERACTIONS[id];
      const changed = spec.targets.filter((t, i) => JSON.stringify(t) !== JSON.stringify(own.targets[i])).map(t => `${id}.${t.interactionId}`);
      expect(changed).toEqual(id === 'foundations' ? ['foundations.learn'] : []);
    }
    // Outside the home map the same spec is refused: /learn belongs to the tool island.
    expect(validateInteractionSpec(HOME_MAP_INTERACTIONS.foundations)).toEqual([expect.stringMatching(/belongs to the tool island/)]);
  });

  it('validation refuses what it should', () => {
    const base = ISLAND_INTERACTIONS.foundations;
    const withLearn = (to: IslandRoute, islandId = 'foundations'): IslandInteractionSpec => ({ islandId, targets: base.targets.map(t => t.interactionId === 'learn' ? { ...t, action: { type: 'route', to } } : t) });
    expect(validateInteractionSpec(withLearn({ kind: 'syllabus', islandId: 'structures' }))).toEqual([expect.stringMatching(/leads to structures's content/)]);
    expect(validateInteractionSpec(withLearn({ kind: 'lesson', islandId: 'foundations', slug: 'no-such-lesson' }))).toEqual(expect.arrayContaining([expect.stringMatching(/does not exist/)]));
    expect(validateInteractionSpec(withLearn({ kind: 'syllabus', islandId: '../x' }))).toEqual([expect.stringMatching(/malformed/)]);
    expect(validateInteractionSpec({ islandId: 'no-such-island', targets: [] })).toEqual([expect.stringMatching(/not an island/)]);
    expect(validateInteractionSpec({ ...base, targets: base.targets.slice(1) })).toEqual([expect.stringMatching(/GLB target learn has no interaction/)]);
    expect(validateInteractionSpec({ ...base, targets: [...base.targets, { interactionId: 'ghost', label: '幽靈', action: { type: 'info', title: 'x', text: 'y' } }] })).toEqual([expect.stringMatching(/names no target/)]);
    // A lesson of another island, and an unpublished lesson of a planned island.
    const otherLesson = catalogLessons.find(l => l.islandId === 'structures' && l.lessonStatus === 'complete')!;
    expect(validateInteractionSpec(withLearn({ kind: 'lesson', islandId: 'foundations', slug: otherLesson.slug }))).toEqual([expect.stringMatching(/not a lesson of this island/)]);
    const own = catalogLessons.find(l => l.islandId === 'foundations' && l.lessonStatus === 'complete')!;
    expect(validateInteractionSpec(withLearn({ kind: 'lesson', islandId: 'foundations', slug: own.slug }))).toEqual([]);
  });

  it('a planned island offers information only: routes are refused by validation and dropped by the page', () => {
    const planned = worldIslands.filter(i => i.status === 'planned');
    // 29 subject islands: F, DS, AL, DB, PL, CN, AIF and LNX complete, SRV open since SRV-1, the other 20 planned.
    expect(planned.length).toBe(20);
    for (const island of planned) {
      const routed: IslandInteractionSpec = { islandId: island.id, targets: [
        { interactionId: 'gate', label: '入口', action: { type: 'route', to: { kind: 'syllabus', islandId: island.id } } },
        { interactionId: 'sign', label: '告示', action: { type: 'info', title: island.name, text: '規劃中' } },
      ] };
      expect(validateInteractionSpec(routed), island.id).toEqual([expect.stringMatching(/planned \(info only\)/)]);
      expect(infoOnly(routed).targets.map(t => t.interactionId)).toEqual(['sign']);
      expect(pageInteractions({ id: island.id, interactions: routed, planned: { lessonCount: island.lessonCount } })!.targets.map(t => t.action.type)).toEqual(['info']);
      // Nothing in the registry gives a planned island a route today.
      for (const t of ISLAND_INTERACTIONS[island.id]?.targets ?? []) expect(t.action.type, `${island.id} ${t.interactionId}`).toBe('info');
    }
  });

  it('region pages hand every island the registry\'s interactions; planned islands get none with a route', () => {
    for (const region of REGION_IDS) for (const island of regionIslands(region)) {
      expect(island.interactions).toEqual(islandInteractions(island.id));
      const shown = pageInteractions(island);
      for (const t of shown?.targets ?? []) if (t.action.type === 'route') {
        expect(island.planned, `${island.id} ${t.interactionId}`).toBeUndefined();
        expect(pages.has(routeHref(t.action.to)), `${island.id} ${t.interactionId}`).toBe(true);
      }
    }
    // The home map passes no interactions of its own, so it shows the home set: the workshop still leads to /learn there.
    expect(interactionOf(pageInteractions({ id: 'foundations' }), 'learn')!.action).toEqual({ type: 'route', to: { kind: 'labs' } });
    expect(interactionOf(pageInteractions(regionIslands('cs').find(i => i.id === 'foundations')!), 'learn')!.action).toEqual({ type: 'route', to: { kind: 'syllabus', islandId: 'foundations' } });
  });
});
