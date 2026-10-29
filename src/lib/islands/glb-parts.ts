import { Box3, Vector3, type Object3D } from 'three';
import type { GlbAsset, Vec3 } from './types';

export interface GlbPart {
  node: string;
  /** Deep clone of the node with its pivot at the origin; names and userData are kept. */
  object: Object3D;
  /** The target's anchor relative to the node pivot, in GLB units, or null for untagged parts. */
  anchor: { node: string; offset: Vec3 } | null;
  /** Local bounds around the pivot, in GLB units. */
  bounds: { min: Vec3; max: Vec3 };
}

/**
 * Lifts whole subtrees out of a loaded GLB scene so they can stand on hex tiles. Anchors stay in
 * the Anchors group, so each target's anchor is re-expressed relative to its own pivot.
 */
export function extractGlbParts(scene: Object3D, asset: GlbAsset, nodes: readonly string[]): { parts: GlbPart[]; missing: string[] } {
  scene.updateMatrixWorld(true);
  const parts: GlbPart[] = [], missing: string[] = [];
  for (const name of nodes) {
    const node = scene.getObjectByName(name);
    if (!node) { missing.push(name); continue; }
    const pivot = node.getWorldPosition(new Vector3());
    const target = asset.nodes.find(n => n.node === name && n.kind === 'target');
    let anchor: GlbPart['anchor'] = null;
    if (target?.kind === 'target') {
      const anchorNode = scene.getObjectByName(target.anchor);
      if (!anchorNode) { missing.push(target.anchor); continue; }
      anchor = { node: target.anchor, offset: anchorNode.getWorldPosition(new Vector3()).sub(pivot).toArray() as Vec3 };
    }
    const object = node.clone(true);
    object.position.set(0, 0, 0);
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    parts.push({ node: name, object, anchor, bounds: { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 } });
  }
  return { parts, missing };
}
