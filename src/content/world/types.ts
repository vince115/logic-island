import type { AlgorithmId } from '@/lib/engine';
import type { AnyLessonId, LessonPrefix } from './lesson-id';

/*
 * Phase F.0 world configuration (docs/planning/ISLAND_CONFIG_DESIGN.md): regions and islands as static data. Four kinds
 * of data stay apart: this static configuration, the curriculum (src/content/curriculum and the planned-lesson
 * metadata), the learner's progress (src/lib/progress.ts, localStorage) and the 3D world's runtime state (React state).
 * Nothing here holds progress; unlock conditions are rules, evaluated against progress at runtime.
 */

// Multi-archipelago v2 (P1b): design and web join; P6: sys (Systems & Cloud Engineering). The order of this list is not
// the display order (Region.order is).
export const REGION_IDS = ['cs', 'ai', 'design', 'web', 'sys'] as const;
export type RegionId = typeof REGION_IDS[number];
/**
 * Multi-archipelago v2: a navigation group inside a region (the AI region's three themes). Whole islands only, each in
 * at most one group of its own region; groups never change lesson IDs, routes or the 3D map.
 */
export interface RegionGroup { id: string; label: string; islandIds: string[] }
/** `order` is the explicit display order of the regions (sidebar, catalog, world); never inferred from the ID. */
export interface Region {
  id: RegionId; name: string; nameEn: string; order: number; groups?: RegionGroup[];
  /** P6: a short description of the region's field, shown on /curriculum when present. */
  summary?: string;
}

/** subject: has lessons and a region. tool: shared across subjects (the Interactive Lab Island), no lessons, no number. */
export type IslandKind = 'subject' | 'tool';

/**
 * Content status: whether the island's lessons are built, never whether a learner finished them (that is progress).
 * complete: every lesson is complete. available: some lessons (or, for a tool island, its labs) can be used.
 * planned: outline only; nothing on it can be opened.
 */
export const ISLAND_STATUSES = ['complete', 'available', 'planned'] as const;
export type IslandStatus = typeof ISLAND_STATUSES[number];

/** A route into an island's content: /curriculum/<slug>, /curriculum#island-<id>, /learn or /learn/<slug>. */
export interface EntryPoint { id: string; label: string; target: string }

/** bridge: drawn between the islands on a map. recommended-next: a suggested next island, shown as a hint. */
export interface IslandLink { to: string; kind: 'bridge' | 'recommended-next' }

/** A rule over progress; only reward or challenge islands may use one, subject islands are never locked. */
export type Condition =
  | { completedLessons: AnyLessonId[] }
  | { completedIslands: string[] }
  | { all: Condition[] }
  | { any: Condition[] };

export interface IslandConfig {
  /** Stable kebab-case ID; the existing three match the curriculum's IslandId and the 3D map. */
  id: string;
  kind: IslandKind;
  /** Subject islands only. */
  regionId?: RegionId;
  /** Display code (F, DS, AL, DB…); not always the lesson prefix (DS → D, AL → A). */
  code: string;
  /** Subject number within the region, 1..n; tool islands have none. */
  order?: number;
  name: string;
  nameEn: string;
  description: string;
  /** Subject islands only. */
  lessonPrefix?: LessonPrefix;
  lessonCount: number;
  status: IslandStatus;
  theme: { accent: string; landmark?: string };
  entryPoints: EntryPoint[];
  links: IslandLink[];
  unlock?: Condition;
  /** The interactive labs (src/content/courses.ts) a tool island offers. */
  labs?: readonly AlgorithmId[];
  /** Semver of this configuration entry. */
  version: string;
}

export interface WorldConfig { version: string; regions: Region[]; islands: IslandConfig[] }
