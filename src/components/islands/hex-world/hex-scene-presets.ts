import type { HexSceneOptions } from './hex-world-scene';

/**
 * D.3-1 named scene presets: how a hex world is rendered, kept apart from which world is rendered (tiles, GLB
 * layouts, forests and nature come from the world layout) and from the explorer's UI. One renderer, one preset
 * per use, instead of each explorer combining its own switches.
 */
export type HexScenePreset = Omit<HexSceneOptions, 'glbLayouts' | 'forests' | 'nature'>;

/**
 * The accepted D.2c look (natural terrain, sea and nature, compact labels, content framing) with the D.2c-2
 * rendering budget: static shadow map and the tree LOD threshold (device pixels per world unit, KNOWN_ISSUES P1-24).
 * Never loads the measurement probe.
 */
const production = {
  ocean: 'natural', terrain: 'natural', anchorStyle: 'compact', rocks: true, lighting: 'contrast',
  routes: 'merged', hitProxies: true, targetPads: true, labels: 'compact', cameraFit: 'content',
  shadows: 'static', treeLod: 24,
} as const satisfies HexScenePreset;

export const SCENE_PRESETS = {
  production,
  /** The production look plus the measurement and review probe: the hidden test page /islands/hex/scale/37. */
  lab: { ...production, perfProbe: true },
  /** The 19-tile scale reference, as first prototyped. */
  scale19: { ocean: 'continuous', anchorStyle: 'compact', rocks: true, lighting: 'contrast', perfProbe: true },
  /** The A2 preview (/islands/hex): the scene defaults. */
  a2Preview: {},
} as const satisfies Record<string, HexScenePreset>;
