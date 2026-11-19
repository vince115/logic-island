import type { Course } from '@/content/courses';
import type { GlbAssetId } from './asset-registry';
import type { IslandInteractionSpec } from './interactions';

export type Vec3 = [number, number, number];
export type IslandModelId = 'beacon-workshop' | 'data-harbor' | 'algorithm-observatory';
export interface IslandBounds { min: Vec3; max: Vec3 }
/** P9 S1: the ids of the runtime GLBs are the keys of the asset registry (asset-registry.ts); adding an asset adds its id. */
export type { GlbAssetId };
/** A target is a clickable node with meshes; an anchor only positions an HTML label. */
export type GlbNodeKind = 'target' | 'anchor';
/**
 * Keyed by node name: one interaction_id can belong to both a target and its anchor. P9 S1: a node says what it is in
 * the file (name, role, interaction id, anchor); what a click on it does and what its label reads belong to the
 * island's interaction spec (interactions.ts), looked up by `interactionId`.
 */
export type GlbSemanticNode =
  | { node: string; kind: 'target'; role: string; interactionId: string; anchor: string }
  | { node: string; kind: 'anchor'; role: string; interactionId: string };
export type GlbTargetNode = Extract<GlbSemanticNode, { kind: 'target' }>;
/** A circle a node keeps clear around its pivot, in map units at the asset's scale: [x, z, radius]. */
export type GlbFootprint = readonly [x: number, z: number, radius: number];
export interface GlbAsset {
  source: 'glb';
  /** P9 S1: the island of the world registry this asset belongs to; one asset per island. */
  islandId: string;
  url: `/models/${string}.glb`;
  /** Tracked here because the GLB root asset_id was not bumped for v2.1. */
  version: string;
  sha256: string;
  bytes: number;
  root: string;
  scale: number;
  fallback: IslandModelId;
  nodes: readonly GlbSemanticNode[];
  /**
   * P9 S1: rough footprints of the nodes that stand on a hex map, by node name, so trees, rocks and plaza features
   * keep clear of them. Unit tests check them against the file's real footprints.
   */
  footprints?: Readonly<Record<string, readonly GlbFootprint[]>>;
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
  /**
   * P9 S1: what the island's targets do on this page, resolved and validated on the server from the island registry
   * (src/lib/world/island-registry.ts). Pages that pass none show the home map's set (island-interactions.ts).
   */
  interactions?: IslandInteractionSpec;
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
  /** P8.2 (D4): a planned island's outline on its region's 2D overview (topics only; no lesson page exists yet). */
  outlineHref?: `/regions/${string}`;
}
