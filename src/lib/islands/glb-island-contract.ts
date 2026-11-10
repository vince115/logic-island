import { glbAssets } from './asset-registry';
import { DATABASE_LANDMARKS } from './database-island';
import type { GlbAsset, GlbSemanticNode } from './types';

/*
 * M3.1 GLB Scale and Interaction Anchor Contract (docs/planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md §6), shared by the
 * CS and AI islands: what every island GLB must satisfy before it joins the asset registry. Numbers come from the
 * accepted basics-island v2.1 (measured from its GLB, see tests/glb-island-contract.test.ts), not from new assumptions.
 * Contract only: no Blender work starts from here; the planned assets below have no file yet. At run time the loaded
 * scene is still checked against its registry entry by `checkGlbContract` (glb-contract.ts, Phase D.1); these rules
 * are the authoring side that a new asset must pass before it gets an entry.
 */
export const GLB_CONTRACT = {
  /** Every island GLB is modeled at v2.1's size and placed at this scale. */
  scale: 0.6,
  root: /^Island_[A-Z][A-Za-z0-9]*_Root$/,
  /** Clickable nodes: a landmark, a building with an entrance, a plaza, a dock. */
  target: /^(Landmark|Building|Plaza|Dock)_[A-Z][A-Za-z0-9]*$/,
  anchor: /^Anchor_[A-Z][A-Za-z0-9_]*$/,
  /** Every island has a way in from its dock and a way out toward the next island or region. */
  requiredAnchors: ['Anchor_Entry', 'Anchor_Route_Exit'],
  /**
   * Pivot and size in GLB units (before `scale`). Landmarks and buildings stand on their pivot: the lowest point at
   * y 0 (± `groundTolerance`) and the pivot inside their footprint. A dock's pivot is its shore end and it may reach
   * below the water. Heights: v2.1's lighthouse (4.36) bounds a landmark, its workshop (3.23) a building; a plaza is
   * flat. A footprint is at most two hexes across (the workshop stands across two tiles).
   */
  groundTolerance: 0.05,
  maxHeight: { Landmark: 4.4, Building: 3.3, Plaza: 0.5, Dock: 2.6 },
  maxFootprint: 2 * 1.25 * 2 / 0.6,
} as const;

export type NodeKind = keyof typeof GLB_CONTRACT.maxHeight;
export const nodeKind = (name: string) => name.split('_')[0] as NodeKind;

/** Contract rules that need only the registry entry (names, anchors, interaction ids); every problem found. */
export function validateGlbEntry(id: string, asset: Pick<GlbAsset, 'root' | 'scale' | 'nodes'>): string[] {
  const problems: string[] = [];
  if (asset.scale !== GLB_CONTRACT.scale) problems.push(`${id}: scale ${asset.scale}, contract ${GLB_CONTRACT.scale}`);
  if (!GLB_CONTRACT.root.test(asset.root)) problems.push(`${id}: root ${asset.root} is not Island_<Name>_Root`);
  const nodes = asset.nodes as readonly GlbSemanticNode[];
  const anchors = nodes.filter(n => n.kind === 'anchor'), targets = nodes.filter(n => n.kind === 'target');
  for (const n of targets) {
    if (!GLB_CONTRACT.target.test(n.node)) problems.push(`${id}: target ${n.node} is not Landmark_/Building_/Plaza_/Dock_`);
    const anchor = anchors.find(a => a.node === n.anchor);
    if (!anchor) problems.push(`${id}: ${n.node} has no anchor ${n.anchor}`);
    else if (anchor.interactionId !== n.interactionId) problems.push(`${id}: ${n.node} and ${anchor.node} differ in interaction id`);
  }
  for (const n of anchors) if (!GLB_CONTRACT.anchor.test(n.node)) problems.push(`${id}: anchor ${n.node} is not Anchor_<Name>`);
  for (const name of GLB_CONTRACT.requiredAnchors) if (!anchors.some(a => a.node === name)) problems.push(`${id}: no ${name}`);
  const ids = targets.map(t => t.interactionId);
  if (new Set(ids).size !== ids.length) problems.push(`${id}: two targets share an interaction id`);
  return problems;
}

/** Contract rules on a node's local bounds (GLB units, from the file); every problem found. */
export function validateNodeBounds(node: string, bounds: { min: number[]; max: number[] }): string[] {
  const kind = nodeKind(node), problems: string[] = [];
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
  if (kind !== 'Dock') {
    if (Math.abs(y0) > GLB_CONTRACT.groundTolerance) problems.push(`${node}: lowest point y ${y0}, should stand on its pivot`);
    if (!(x0 <= 0 && x1 >= 0 && z0 <= 0 && z1 >= 0)) problems.push(`${node}: pivot outside its footprint`);
  }
  if (y1 - Math.min(0, y0) > GLB_CONTRACT.maxHeight[kind] && kind !== 'Dock') problems.push(`${node}: ${(y1 - y0).toFixed(2)} tall, contract ≤ ${GLB_CONTRACT.maxHeight[kind]}`);
  if (Math.max(x1 - x0, z1 - z0) > GLB_CONTRACT.maxFootprint) problems.push(`${node}: footprint ${Math.max(x1 - x0, z1 - z0).toFixed(2)}, contract ≤ ${GLB_CONTRACT.maxFootprint.toFixed(2)}`);
  return problems;
}

/*
 * The representative prototypes approved for M3.2 (DB and LLM), declared ahead of their files so the map, the
 * fallback and the tests agree on their node names. No `url` or `sha256` until a GLB exists and is accepted; until
 * then the islands keep their Transitional Art (DB) or mist (LLM).
 */
const entry = (interactionId: string, label: string) => [
  { node: `Anchor_${label}`, kind: 'anchor' as const, role: interactionId, interactionId },
];
export const PLANNED_GLB_ASSETS = {
  'databases-island': {
    islandId: 'databases', root: 'Island_Databases_Root', scale: GLB_CONTRACT.scale,
    nodes: [
      ...DATABASE_LANDMARKS.flatMap(({ node }) => {
        const name = node.split('_')[1], interactionId = name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
        return [{ node, kind: 'target' as const, role: 'learning_landmark', interactionId, anchor: `Anchor_${name}`,
          action: { type: 'info' as const, title: node, text: node } }, ...entry(interactionId, name)];
      }),
      ...entry('entry', 'Entry'), ...entry('route_exit', 'Route_Exit'),
    ],
  },
  'llm-island': {
    islandId: 'large-language-models', root: 'Island_LanguageModels_Root', scale: GLB_CONTRACT.scale,
    // ARCHIPELAGO_GLB_ART_DIRECTION §4: the symbol library, the tokenization workshop, the stepped Transformer tower.
    nodes: [
      ...(['Building_SymbolLibrary', 'Building_TokenizationWorkshop', 'Landmark_TransformerTower'] as const).flatMap(node => {
        const name = node.split('_')[1], interactionId = name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());
        return [{ node, kind: 'target' as const, role: 'learning_landmark', interactionId, anchor: `Anchor_${name}`,
          action: { type: 'info' as const, title: node, text: node } }, ...entry(interactionId, name)];
      }),
      ...entry('entry', 'Entry'), ...entry('route_exit', 'Route_Exit'),
    ],
  },
} as const;

/** Every runtime GLB in the registry, checked against the contract (names and anchors; tests add the file's bounds). */
export const registryProblems = () => Object.entries(glbAssets).flatMap(([id, asset]) => validateGlbEntry(id, asset));
