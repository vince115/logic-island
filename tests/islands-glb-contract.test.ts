import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glbAssets } from '@/lib/islands/asset-registry';
import { checkGlbContract, resolveTarget } from '@/lib/islands/glb-contract';

const asset = glbAssets['basics-island-v2.1'];
let scene: Object3D;

// Parses the committed runtime GLB with the same loader R3F uses; no WebGL is needed.
beforeAll(async () => {
  const bytes = readFileSync(`public${asset.url}`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene = gltf.scene;
});
const node = (name: string) => {
  const found = scene.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};
const firstMesh = (name: string) => {
  let mesh: Object3D | undefined;
  node(name).traverse(o => { if (!mesh && (o as Object3D & { isMesh?: boolean }).isMesh) mesh = o; });
  if (!mesh) throw new Error(`no mesh under ${name}`);
  return mesh;
};

describe('GLB contract', () => {
  it('holds for the runtime GLB as three loads it', () => {
    expect(checkGlbContract(scene, asset)).toEqual({ ok: true });
  });

  it('fails when a required node is renamed', () => {
    const copy = scene.clone(true);
    copy.getObjectByName('Anchor_Lighthouse')!.name = 'Anchor_Lighthouse_old';
    const result = checkGlbContract(copy, asset);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('Anchor_Lighthouse: expected 1, found 0');
  });

  it('fails when interaction_id or role metadata drifts', () => {
    const copy = scene.clone(true);
    copy.getObjectByName('Building_Workshop')!.userData.interaction_id = 'workshop';
    copy.getObjectByName('Dock_Entry')!.userData.role = 'dock';
    const result = checkGlbContract(copy, asset);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual(['Building_Workshop: interaction_id workshop', 'Dock_Entry: role dock']);
  });

  it('fails when an anchor gains a mesh or the root is missing', () => {
    const copy = scene.clone(true);
    copy.getObjectByName('Anchor_Entry')!.add(firstMesh('Tree_001').clone());
    expect(checkGlbContract(copy, asset)).toMatchObject({ ok: false, problems: ['Anchor_Entry: anchor mesh mismatch'] });
    const rootless = scene.clone(true);
    rootless.getObjectByName(asset.root)!.name = 'Other_Root';
    expect(checkGlbContract(rootless, asset).ok).toBe(false);
  });
});

describe('interaction targets', () => {
  it('route the workshop to /learn from any of its meshes', () => {
    for (const mesh of ['Workshop_Architecture', 'Workshop_Code_Slash']) {
      expect(resolveTarget(node(mesh), asset)).toMatchObject({ node: 'Building_Workshop', action: { type: 'route', href: '/learn' } });
    }
  });

  it('show info for the lighthouse and the dock', () => {
    expect(resolveTarget(node('Lighthouse_Structure'), asset)).toMatchObject({ node: 'Landmark_Lighthouse', action: { type: 'info' } });
    expect(resolveTarget(node('Light_Lantern'), asset)).toMatchObject({ node: 'Landmark_Lighthouse' });
    expect(resolveTarget(node('Dock_START_Marker'), asset)).toMatchObject({ node: 'Dock_Entry', action: { type: 'info' } });
  });

  it('ignore anchors, route_exit and untagged meshes', () => {
    for (const name of ['Anchor_Workshop', 'Anchor_Lighthouse', 'Anchor_Entry', 'Anchor_Route_Exit', 'Tree_001_CanopyTrunk', 'CliffRock', 'Coastal_Ramp']) {
      expect(resolveTarget(node(name), asset), name).toBeNull();
    }
  });

  it('identify targets by node name even though interaction_id repeats', () => {
    // Anchor_Workshop shares interaction_id "learn" with Building_Workshop but is not a target.
    expect(node('Anchor_Workshop').userData.interaction_id).toBe(node('Building_Workshop').userData.interaction_id);
    expect(resolveTarget(node('Anchor_Workshop'), asset)).toBeNull();
  });
});
