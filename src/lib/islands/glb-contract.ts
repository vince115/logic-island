import type { GlbAsset, GlbTargetNode } from './types';

/** The subset of three's Object3D the contract needs; keeps this module free of three. */
export interface SceneNode {
  name: string;
  parent: SceneNode | null;
  children: SceneNode[];
  userData: Record<string, unknown>;
  isMesh?: boolean;
}
export type ContractResult = { ok: true } | { ok: false; problems: string[] };

function collect(root: SceneNode) {
  const byName = new Map<string, SceneNode[]>();
  const visit = (node: SceneNode) => {
    byName.set(node.name, [...(byName.get(node.name) ?? []), node]);
    node.children.forEach(visit);
  };
  visit(root);
  return byName;
}
function hasMesh(node: SceneNode): boolean {
  return Boolean(node.isMesh) || node.children.some(hasMesh);
}

/**
 * Checks the loaded scene against the registry by node name. Any problem means the
 * caller must render the fallback geometry instead of a partially working GLB.
 */
export function checkGlbContract(scene: SceneNode, asset: GlbAsset): ContractResult {
  const problems: string[] = [];
  const byName = collect(scene);
  const roots = byName.get(asset.root) ?? [];
  if (roots.length !== 1) problems.push(`root ${asset.root}: expected 1, found ${roots.length}`);
  const inRoot = (node: SceneNode) => {
    for (let n: SceneNode | null = node; n; n = n.parent) if (n === roots[0]) return true;
    return false;
  };
  const anchors = new Set(asset.nodes.filter(n => n.kind === 'anchor').map(n => n.node));
  for (const entry of asset.nodes) {
    const found = byName.get(entry.node) ?? [];
    if (found.length !== 1) { problems.push(`${entry.node}: expected 1, found ${found.length}`); continue; }
    const [node] = found;
    if (!inRoot(node)) problems.push(`${entry.node}: outside ${asset.root}`);
    if (node.userData.role !== entry.role) problems.push(`${entry.node}: role ${String(node.userData.role)}`);
    if (node.userData.interaction_id !== entry.interactionId) problems.push(`${entry.node}: interaction_id ${String(node.userData.interaction_id)}`);
    if (hasMesh(node) !== (entry.kind === 'target')) problems.push(`${entry.node}: ${entry.kind} mesh mismatch`);
    if (entry.kind === 'target' && !anchors.has(entry.anchor)) problems.push(`${entry.node}: unknown anchor ${entry.anchor}`);
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}

/**
 * Walks up from the hit mesh to the nearest registered target node. Anchors and
 * untagged meshes (terrain, trees) resolve to null.
 */
export function resolveTarget(hit: SceneNode | null, asset: GlbAsset): GlbTargetNode | null {
  const targets = new Map(asset.nodes.flatMap(n => n.kind === 'target' ? [[n.node, n] as const] : []));
  for (let node = hit; node && node.name !== asset.root; node = node.parent) {
    const target = targets.get(node.name);
    if (target) return target;
  }
  return null;
}
