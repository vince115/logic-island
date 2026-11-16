import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGlb } from '../scripts/assets/derive-runtime-glb.mjs';
import { assetRegistry, glbAssets } from '@/lib/islands/asset-registry';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { GLB_CONTRACT, PLANNED_GLB_ASSETS, registryProblems, validateGlbEntry, validateNodeBounds } from '@/lib/islands/glb-island-contract';
import { REGION_LAYOUTS, regionLayout } from '@/lib/islands/regions/region-layouts';
import { islandsInRegion } from '@/content/world';

/*
 * M3.1 GLB contract (no Blender work): the accepted v2.1 GLB passes the island contract read straight from its file
 * (read only; the file is not changed), the registry entry fits it, and the two approved prototypes (DB, LLM) are
 * declared with contract-conforming node names before any file exists.
 */
type Gltf = { nodes: { name: string; mesh?: number; children?: number[]; translation?: number[]; extras?: Record<string, unknown> }[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]; accessors: { min: number[]; max: number[] }[] };
const v21 = glbAssets['basics-island-v2.1'];
const gltf = parseGlb(readFileSync(`public${v21.url}`)).json as Gltf;

/** A node's bounds in its own space: its meshes and its children's, children offset by their translation. */
function localBounds(index: number) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (i: number, offset: number[]) => {
    const node = gltf.nodes[i];
    if (node.mesh !== undefined) for (const p of gltf.meshes[node.mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      for (let d = 0; d < 3; d++) { min[d] = Math.min(min[d], a.min[d] + offset[d]); max[d] = Math.max(max[d], a.max[d] + offset[d]); }
    }
    for (const c of node.children ?? []) { const t = gltf.nodes[c].translation ?? [0, 0, 0]; walk(c, offset.map((o, d) => o + t[d])); }
  };
  walk(index, [0, 0, 0]);
  return { min, max };
}

describe('island GLB contract (M3.1)', () => {
  it('the registry\'s runtime GLBs fit the contract: scale, root, target and anchor names, entry and route exit', () => {
    expect(registryProblems()).toEqual([]);
    expect(v21.scale).toBe(GLB_CONTRACT.scale);
  });

  it('v2.1 from its file: pivots at the base inside the footprint, heights and footprints within the contract', () => {
    const targets = v21.nodes.filter(n => n.kind === 'target');
    const bounds = Object.fromEntries(targets.map(t => [t.node, localBounds(gltf.nodes.findIndex(n => n.name === t.node))]));
    for (const t of targets) expect(validateNodeBounds(t.node, bounds[t.node]), t.node).toEqual([]);
    // The numbers the contract was taken from, so a change to the file or the contract shows here.
    expect(bounds.Landmark_Lighthouse.max[1]).toBeCloseTo(4.36, 2);
    expect(bounds.Building_Workshop.max[1]).toBeCloseTo(3.23, 2);
    expect(bounds.Dock_Entry.min[1]).toBeLessThan(0);
  });

  it('v2.1 from its file: every registry node exists once with matching extras; Anchor_Entry and Anchor_Route_Exit are there', () => {
    for (const entry of v21.nodes) {
      const found = gltf.nodes.filter(n => n.name === entry.node);
      expect(found, entry.node).toHaveLength(1);
      expect(found[0].extras?.role, entry.node).toBe(entry.role);
      expect(found[0].extras?.interaction_id, entry.node).toBe(entry.interactionId);
    }
    for (const name of GLB_CONTRACT.requiredAnchors) expect(gltf.nodes.some(n => n.name === name), name).toBe(true);
    expect(gltf.nodes.some(n => n.name === v21.root)).toBe(true);
  });

  it('the contract rejects what it should: wrong scale, names, missing anchors, a floating pivot, an oversized landmark', () => {
    const bad = validateGlbEntry('bad', { root: 'BasicsRoot', scale: 1, nodes: [
      { node: 'Tower', kind: 'target', role: 'x', interactionId: 'x', anchor: 'Anchor_Tower', action: { type: 'info', title: '', text: '' } },
    ] });
    expect(bad).toEqual(expect.arrayContaining([expect.stringMatching(/scale/), expect.stringMatching(/root/), expect.stringMatching(/target Tower/),
      expect.stringMatching(/no anchor/), expect.stringMatching(/no Anchor_Entry/), expect.stringMatching(/no Anchor_Route_Exit/)]));
    expect(validateNodeBounds('Landmark_Float', { min: [-1, .4, -1], max: [1, 3, 1] })).toEqual([expect.stringMatching(/lowest point/)]);
    expect(validateNodeBounds('Landmark_Tall', { min: [-1, 0, -1], max: [1, 6, 1] })).toEqual([expect.stringMatching(/tall/)]);
    expect(validateNodeBounds('Building_Off', { min: [.5, 0, .5], max: [2, 2, 2] })).toEqual([expect.stringMatching(/pivot outside/)]);
  });

  it('the DB and LLM prototypes are declared to the contract, on islands of the region maps, with no file yet', () => {
    for (const [id, asset] of Object.entries(PLANNED_GLB_ASSETS)) {
      expect(validateGlbEntry(id, asset), id).toEqual([]);
      expect(id in glbAssets, `${id} has no runtime GLB yet`).toBe(false);
      const region = islandsInRegion('cs').some(i => i.id === asset.islandId) ? 'cs' : 'ai';
      expect(regionLayout(region).layout.world.settlements.some(s => s.islandId === asset.islandId), asset.islandId).toBe(true);
    }
    // DB keeps the node names its Transitional Art already uses (the fallback while the GLB loads or fails).
    expect(PLANNED_GLB_ASSETS['databases-island'].nodes.filter(n => n.kind === 'target').map(n => n.node)).toEqual(DATABASE_LANDMARKS.map(l => l.node));
  });

  it('asset registry integration: a fallback for every GLB, files under /models with a checksum', () => {
    for (const [id, asset] of Object.entries(glbAssets)) {
      expect(asset.fallback in assetRegistry, id).toBe(true);
      expect(asset.url).toMatch(/^\/models\/islands\/[a-z0-9.-]+\.glb$/);
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The region maps only place GLBs the registry has.
    for (const region of Object.values(REGION_LAYOUTS)) for (const layout of region.layout.glb) expect(layout.asset in glbAssets).toBe(true);
  });
});
