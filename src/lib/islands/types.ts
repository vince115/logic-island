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
  /**
   * M3.1 (regional world prototype): an island of the plan with no written lesson (registry status `planned`). Its label,
   * list entry and panel say「規劃中」with the planned number of lessons, and it offers no lesson link or progress.
   */
  planned?: { lessonCount: number };
}
export interface LearningLink { slug: Course['slug']; title: string; subtitle: string }
/** 2026-11-01: a subject unit of the island's curriculum lessons (src/content/curriculum/units.ts). */
export interface LearningUnit { title: string; summary: string; lessons: { id: string; slug: string; title: string }[] }
/** 2026-11-01: a group of /learn labs (by course category), listed by 互動實驗島. */
export interface LabGroup { title: string; labs: LearningLink[] }
/**
 * Shown when the island is chosen (home page): `units`, the island's curriculum by subject; or `labGroups`, the labs
 * of 互動實驗島.
 */
export interface LearningIsland extends IslandDefinition {
  lessons: LearningLink[]; units?: LearningUnit[]; labGroups?: LabGroup[];
  /**
   * Phase F.2: how many of the island's lessons are written (content, not the learner's progress), shown beside the
   * learner's own progress; and where its full syllabus is. Islands without them keep「查看完整課綱」→ /curriculum.
   */
  published?: { open: number; total: number }; curriculumHref?: `/curriculum#${string}`;
}
