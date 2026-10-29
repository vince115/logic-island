import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glbAssets, assetRegistry } from '@/lib/islands/asset-registry';
import { islands } from '@/lib/islands/data';
import { buildGlb, deriveRuntimeGlb, parseGlb, sha256, stripToolFlags } from '../scripts/assets/derive-runtime-glb.mjs';

type GltfNode = { name: string; children?: number[]; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extras?: Record<string, unknown> };
type Contract = Record<string, { parent: string | null; matrix: number[] }>;

const asset = glbAssets['basics-island-v2.1'];
const bytes = new Uint8Array(readFileSync(`public${asset.url}`));
const { json } = parseGlb(bytes);
const nodes: GltfNode[] = json.nodes;
const byName = new Map(nodes.map((node, index) => [node.name, index]));
const parentOf = new Map<number, number>();
nodes.forEach((node, index) => node.children?.forEach(child => parentOf.set(child, index)));
const provenance = JSON.parse(readFileSync('docs/assets/basics-island-v2.1.provenance.json', 'utf8'));
// Verbatim copy of the vault's v2_Node_Contract.json (SHA-256 d197dfed…), Blender Z-up world matrices.
const contract: Contract = JSON.parse(readFileSync('docs/assets/basics-island.node-contract.json', 'utf8'));

function worldTranslation(index: number) {
  const t = [0, 0, 0];
  for (let i: number | undefined = index; i !== undefined; i = parentOf.get(i)) {
    (nodes[i].translation ?? [0, 0, 0]).forEach((v, axis) => { t[axis] += v; });
  }
  return t;
}
function hasMesh(index: number): boolean {
  return nodes[index].mesh !== undefined || (nodes[index].children ?? []).some(hasMesh);
}

describe('runtime GLB provenance', () => {
  it('matches the registry and provenance record', () => {
    expect(bytes.byteLength).toBe(asset.bytes);
    expect(sha256(bytes)).toBe(asset.sha256);
    expect(provenance.output).toEqual({ path: `public${asset.url}`, sha256: asset.sha256, bytes: asset.bytes });
    expect(provenance.version).toBe(asset.version);
  });

  it('contains no tool flags and keeps the source BIN chunk', () => {
    expect(new TextDecoder().decode(bytes)).not.toContain('blendermcp');
    expect(json.scenes[0].extras).toBeUndefined();
    expect(sha256(parseGlb(bytes).binChunk)).toBe(provenance.bin_chunk_sha256);
  });

  it('is a fixed point of the derive step', () => {
    const again = deriveRuntimeGlb(bytes);
    expect(again.removed).toEqual([]);
    expect(sha256(again.bytes)).toBe(asset.sha256);
  });

  it('passed the Khronos glTF validator without errors or warnings', () => {
    const report = JSON.parse(readFileSync('docs/assets/basics-island-v2.1.validation.json', 'utf8'));
    expect(report.issues).toMatchObject({ numErrors: 0, numWarnings: 0 });
    expect(report.info).toMatchObject({ drawCallCount: 24, totalTriangleCount: 9800, materialCount: 2 });
  });
});

describe('node contract', () => {
  it('keeps all 43 contract nodes with their parents and world positions', () => {
    expect(Object.keys(contract)).toHaveLength(43);
    for (const [name, { parent, matrix }] of Object.entries(contract)) {
      const index = byName.get(name);
      expect(index, name).toBeDefined();
      const actualParent = parentOf.has(index!) ? nodes[parentOf.get(index!)!].name : null;
      expect(actualParent, name).toBe(parent);
      // Blender (x, y, z) Z-up becomes glTF (x, z, -y) Y-up.
      const expected = [matrix[3], matrix[11], -matrix[7]];
      worldTranslation(index!).forEach((v, axis) => expect(v, `${name}[${axis}]`).toBeCloseTo(expected[axis], 5));
    }
  });

  it('adds only the three v2.1 nodes and no rotation or scale', () => {
    expect(nodes.filter(n => !(n.name in contract)).map(n => n.name).sort())
      .toEqual(['Central_Low_Planting', 'Dock_START_Marker', 'Workshop_Code_Slash']);
    expect(nodes.filter(n => n.rotation || n.scale || n.matrix)).toEqual([]);
  });

  it('has a single root whose asset_id was not bumped', () => {
    expect(json.scenes[0].nodes.map((i: number) => nodes[i].name)).toEqual([asset.root]);
    expect(nodes[byName.get(asset.root)!].extras).toMatchObject({ role: 'island', asset_id: 'logiclab-basics-island-v2' });
  });
});

describe('semantic nodes', () => {
  it('match the GLB extras by node name', () => {
    for (const entry of asset.nodes) {
      const index = byName.get(entry.node);
      expect(index, entry.node).toBeDefined();
      expect(nodes[index!].extras).toMatchObject({ role: entry.role, interaction_id: entry.interactionId });
    }
  });

  it('separate clickable targets from label-only anchors', () => {
    for (const entry of asset.nodes) {
      expect(hasMesh(byName.get(entry.node)!), entry.node).toBe(entry.kind === 'target');
    }
  });

  it('cover every interaction_id in the GLB and do not treat it as unique', () => {
    const tagged = nodes.filter(n => n.extras?.interaction_id).map(n => n.name).sort();
    expect(asset.nodes.map(n => n.node).sort()).toEqual(tagged);
    expect(new Set(asset.nodes.map(n => n.node)).size).toBe(asset.nodes.length);
    expect(asset.nodes.filter(n => n.interactionId === 'learn')).toHaveLength(2);
  });
});

describe('island models', () => {
  it('switch only the foundations island to the GLB and keep its geometry as fallback', () => {
    const foundations = islands.find(i => i.id === 'foundations');
    expect(foundations?.glbAssetId).toBe('basics-island-v2.1');
    expect(foundations?.modelId).toBe(asset.fallback);
    for (const island of islands) expect(assetRegistry[island.modelId].source).toBe('original-geometry');
    expect(assetRegistry[asset.fallback].source).toBe('original-geometry');
  });

  it('leave the other two islands unchanged', () => {
    const others = islands.filter(i => i.id !== 'foundations')
      .map(({ id, modelId, position, bounds, glbAssetId }) => ({ id, modelId, position, bounds, glbAssetId }));
    expect(others).toEqual([
      { id: 'structures', modelId: 'data-harbor', position: [0.1, 0.15, -4.6], bounds: { min: [-3.6, -2, -2.9], max: [3.6, 4.2, 3.3] }, glbAssetId: undefined },
      { id: 'algorithms', modelId: 'algorithm-observatory', position: [6.5, -0.05, 1.1], bounds: { min: [-3.4, -1.9, -2.9], max: [3.4, 4.8, 2.9] }, glbAssetId: undefined },
    ]);
  });
});

describe('derive helpers', () => {
  it('strips nested tool flags and drops emptied extras', () => {
    const doc = { scenes: [{ extras: { blendermcp_server_running: 1 } }], nodes: [{ extras: { role: 'x', blendermcp_x: true } }] };
    expect(stripToolFlags(doc)).toEqual(['/scenes/0/extras/blendermcp_server_running', '/nodes/0/extras/blendermcp_x']);
    expect(doc).toEqual({ scenes: [{}], nodes: [{ extras: { role: 'x' } }] });
  });

  it('round-trips a GLB with 4-byte aligned chunks', () => {
    const { json: parsed, binChunk } = parseGlb(bytes);
    const rebuilt = buildGlb(parsed, binChunk);
    expect(sha256(rebuilt)).toBe(asset.sha256);
    expect(new DataView(rebuilt.buffer).getUint32(12, true) % 4).toBe(0);
  });
});
