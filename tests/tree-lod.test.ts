import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Vector3, type BufferGeometry, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAssets } from '@/lib/islands/asset-registry';
import { TREE_NODES } from '@/lib/islands/hex-scale-prototype';
import { lodParts, simplifyTree, treeParts } from '@/lib/islands/tree-lod';

// D.2c-2: the distant-view trees are built from the GLB's own trees at runtime and must stay close to them.
const geometries: BufferGeometry[] = [];
beforeAll(async () => {
  const bytes = readFileSync(`public${glbAssets['basics-island-v2.1'].url}`);
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  for (const name of TREE_NODES) geometries.push((scene.getObjectByName(name) as Mesh).geometry);
});
const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const box = (g: BufferGeometry) => new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
/** Mean color weighted by face area, roughly what the tree shows from a distance. */
const meanColor = (g: BufferGeometry) => {
  const p = g.getAttribute('position'), c = g.getAttribute('color'), index = g.getIndex(), sum = new Vector3();
  const v = (i: number) => index ? index.getX(i) : i, at = (i: number) => new Vector3(p.getX(v(i)), p.getY(v(i)), p.getZ(v(i)));
  let total = 0;
  for (let i = 0; i < (index ? index.count : p.count); i += 3) {
    const area = at(i + 1).sub(at(i)).cross(at(i + 2).sub(at(i))).length() / 2;
    for (let k = 0; k < 3; k++) sum.add(new Vector3(c.getX(v(i + k)), c.getY(v(i + k)), c.getZ(v(i + k))).multiplyScalar(area / 3));
    total += area;
  }
  return sum.divideScalar(total);
};

describe('D.2c-2 tree LOD', () => {
  it('replaces exactly the three canopy parts of each GLB tree (blobs or cone layers), never the trunk or branches', () => {
    for (const [k, g] of geometries.entries()) {
      expect(treeParts(g).flat(), TREE_NODES[k]).toHaveLength(triangles(g));
      const { kept, hulled } = lodParts(g);
      expect(hulled, TREE_NODES[k]).toHaveLength(3);
      // Kept parts are the trunk and the branches: bark brown, not canopy green.
      const color = g.getAttribute('color');
      for (const t of kept.flat()) expect(color.getX(t[0]), TREE_NODES[k]).toBeGreaterThan(color.getY(t[0]));
    }
  });

  it('draws at most half the triangles of the broadleaf trees and about 60% of the conifers', () => {
    for (const [k, g] of geometries.entries()) {
      const ratio = triangles(simplifyTree(g)) / triangles(g);
      expect(ratio, TREE_NODES[k]).toBeLessThan(triangles(g) > 200 ? 0.5 : 0.65);
    }
  });

  it('keeps the outline and the colors: bounds within 6% of the tree size, area-weighted color within 0.03', () => {
    for (const [k, g] of geometries.entries()) {
      const a = box(g), b = box(simplifyTree(g)), size = a.getSize(new Vector3()).length();
      expect(a.min.distanceTo(b.min) / size, TREE_NODES[k]).toBeLessThan(0.06);
      expect(a.max.distanceTo(b.max) / size, TREE_NODES[k]).toBeLessThan(0.06);
      expect(meanColor(simplifyTree(g)).distanceTo(meanColor(g)), TREE_NODES[k]).toBeLessThan(0.03);
    }
  });

  it('keeps trunks and branches triangle for triangle', () => {
    const g = geometries[0], lod = simplifyTree(g), p = lod.getAttribute('position');
    const kept = lodParts(g).kept.flat();
    const src = g.getAttribute('position'), positions = new Set<string>();
    for (let i = 0; i < p.count; i++) positions.add([p.getX(i), p.getY(i), p.getZ(i)].map(x => x.toFixed(5)).join());
    for (const t of kept) for (const v of t) expect(positions.has([src.getX(v), src.getY(v), src.getZ(v)].map(x => x.toFixed(5)).join())).toBe(true);
  });
});
