import type { Course } from '@/content/courses';

export type Vec3 = [number, number, number];
export type IslandModelId = 'beacon-workshop' | 'data-harbor' | 'algorithm-observatory';
export interface IslandBounds { min: Vec3; max: Vec3 }
export type GlbAssetId = 'basics-island-v2.1';
/** A target is a clickable node with meshes; an anchor only positions an HTML label. */
export type GlbNodeKind = 'target' | 'anchor';
export type GlbTargetAction = { type: 'route'; href: '/learn' } | { type: 'info'; title: string; text: string };
/** Keyed by node name: one interaction_id can belong to both a target and its anchor. */
export type GlbSemanticNode =
  | { node: string; kind: 'target'; role: string; interactionId: string; action: GlbTargetAction; anchor: string }
  | { node: string; kind: 'anchor'; role: string; interactionId: string; label?: string };
export type GlbTargetNode = Extract<GlbSemanticNode, { kind: 'target' }>;
export interface GlbAsset {
  source: 'glb';
  url: `/models/${string}.glb`;
  /** Tracked here because the GLB root asset_id was not bumped for v2.1. */
  version: string;
  sha256: string;
  bytes: number;
  root: string;
  scale: number;
  fallback: IslandModelId;
  nodes: readonly GlbSemanticNode[];
}
export interface IslandDefinition {
  id: string;
  name: string;
  englishName: string;
  description: string;
  landmark: string;
  modelId: IslandModelId;
  position: Vec3;
  bounds: IslandBounds;
  accent: string;
  courseSlugs: Course['slug'][];
  /** Renders this GLB instead of `modelId`; `modelId` stays as the fallback. Remove to roll back. */
  glbAssetId?: GlbAssetId;
  catalogEntry?: { href: '/learn'; label: string };
}
export interface LearningLink { slug: Course['slug']; title: string; subtitle: string }
export interface LearningIsland extends IslandDefinition { lessons: LearningLink[] }
