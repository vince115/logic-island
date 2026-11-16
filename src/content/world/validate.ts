import { LESSON_PREFIXES, formatLessonId, parseLessonId } from './lesson-id';
import { ISLAND_STATUSES, REGION_IDS, type WorldConfig } from './types';

/*
 * Phase F.0 checks on the world configuration, in the style of validateCurriculum: a list of problems, empty when valid.
 * Multi-archipelago v2 (P1a): structural rules only. How many regions, islands and lessons there are follows from the
 * data (each island's lessonCount is its spec, compared with the lessons it holds); the totals are pinned once, on
 * purpose, by the taxonomy contract in tests/world.test.ts and docs/planning/ISLAND_TAXONOMY.md.
 */

/** An architecture rule, not a size: the Interactive Lab Island is the one shared tool island. */
export const TOOL_ISLANDS = 1;
const KEBAB = /^[a-z]+(?:-[a-z]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** A lesson as the world sees it: its ID, island and content status. */
export interface WorldLesson { lessonId: string; islandId: string; lessonStatus: 'complete' | 'planned' }

/** Regions, islands, codes, prefixes, counts, and every lesson ID read with its whole prefix. */
export function validateWorld(world: WorldConfig, lessons: readonly WorldLesson[]): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const unique = (what: string, values: readonly (string | undefined)[]) => {
    const seen = new Set<string>();
    for (const v of values) if (v !== undefined) { if (seen.has(v)) fail(what, `duplicate ${v}`); seen.add(v); }
  };

  if (!SEMVER.test(world.version)) fail('world', `version ${world.version} is not semver`);
  if ([...world.regions.map(r => r.id)].sort().join() !== [...REGION_IDS].sort().join()) fail('regions', `expected one entry per region: ${REGION_IDS.join(', ')}`);
  unique('region id', world.regions.map(r => r.id));
  unique('region order', world.regions.map(r => String(r.order)));
  for (const region of world.regions) {
    if (!Number.isInteger(region.order) || region.order < 1) fail(region.id, 'order must be a positive integer');
    for (const field of ['name', 'nameEn'] as const) if (!region[field].trim()) fail(region.id, `empty ${field}`);
    if (region.summary !== undefined && !region.summary.trim()) fail(region.id, 'empty summary');
  }

  const subjects = world.islands.filter(i => i.kind === 'subject'), tools = world.islands.filter(i => i.kind === 'tool');
  if (tools.length !== TOOL_ISLANDS) fail('islands', `expected ${TOOL_ISLANDS} tool island, got ${tools.length}`);
  unique('island id', world.islands.map(i => i.id));
  unique('island code', world.islands.map(i => i.code));
  unique('lesson prefix', world.islands.map(i => i.lessonPrefix));
  unique('accent', world.islands.map(i => i.theme.accent.toLowerCase()));
  const prefixes = subjects.map(i => i.lessonPrefix).sort().join();
  if (prefixes !== [...LESSON_PREFIXES].sort().join()) fail('islands', `subject islands must use each lesson prefix once (${LESSON_PREFIXES.join(', ')})`);

  for (const region of REGION_IDS) {
    const inRegion = subjects.filter(i => i.regionId === region);
    if (!inRegion.length) fail(region, 'a region holds at least one subject island');
    const orders = inRegion.map(i => i.order).sort((a, b) => (a ?? 0) - (b ?? 0)).join();
    if (orders !== inRegion.map((_, n) => n + 1).join()) fail(region, 'island order must be 1..n without gaps');
  }

  // Navigation groups: whole islands of the same region, each island in at most one group.
  for (const region of world.regions) {
    const grouped = new Set<string>();
    unique(`${region.id} group id`, (region.groups ?? []).map(g => g.id));
    for (const group of region.groups ?? []) {
      const at = `${region.id}/${group.id}`;
      if (!KEBAB.test(group.id)) fail(at, 'group id is not kebab-case');
      if (!group.label.trim()) fail(at, 'empty label');
      if (!group.islandIds.length) fail(at, 'a group holds at least one island');
      for (const id of group.islandIds) {
        const island = subjects.find(i => i.id === id);
        if (!island) fail(at, `unknown subject island ${id}`);
        else if (island.regionId !== region.id) fail(at, `${id} belongs to ${island.regionId}, not ${region.id}`);
        if (grouped.has(id)) fail(at, `${id} is in more than one group`);
        grouped.add(id);
      }
    }
  }

  for (const island of world.islands) {
    const at = island.id;
    if (!KEBAB.test(at)) fail(at, 'id is not kebab-case');
    if (!SEMVER.test(island.version)) fail(at, `version ${island.version} is not semver`);
    if (!ISLAND_STATUSES.includes(island.status)) fail(at, `unknown status ${island.status}`);
    if (!HEX.test(island.theme.accent)) fail(at, `accent ${island.theme.accent} is not #rrggbb`);
    for (const field of ['name', 'nameEn', 'description'] as const) if (!island[field].trim()) fail(at, `empty ${field}`);
    if (island.kind === 'subject') {
      if (!island.regionId || !REGION_IDS.includes(island.regionId)) fail(at, 'a subject island needs a region');
      if (!island.lessonPrefix) fail(at, 'a subject island needs a lesson prefix');
      if (!Number.isInteger(island.lessonCount) || island.lessonCount < 1 || island.lessonCount > 29) fail(at, 'lessonCount must be 1..29');
      if (island.labs) fail(at, 'only a tool island offers labs');
    } else {
      // The lab island is shared: no region, no number, no lessons (ISLAND_TAXONOMY §4).
      if (island.regionId || island.order !== undefined || island.lessonPrefix || island.lessonCount !== 0) fail(at, 'a tool island has no region, order, prefix or lessons');
      if (island.status === 'complete') fail(at, 'a tool island is available or planned, never complete');
    }
  }

  // Every lesson ID, by its whole prefix: on the island of that prefix, numbered 01..lessonCount in order.
  const islandByPrefix = new Map(subjects.map(i => [i.lessonPrefix, i]));
  for (const lesson of lessons) {
    const parsed = parseLessonId(lesson.lessonId);
    if (!parsed) { fail(lesson.lessonId, 'not a lesson ID'); continue; }
    const island = islandByPrefix.get(parsed.prefix);
    if (island?.id !== lesson.islandId) fail(lesson.lessonId, `prefix ${parsed.prefix} belongs to ${island?.id}, not ${lesson.islandId}`);
  }
  unique('lessonId', lessons.map(l => l.lessonId));
  // The data is its own spec: the lessons are exactly what the islands' lesson counts declare.
  const declared = subjects.reduce((sum, i) => sum + i.lessonCount, 0);
  if (lessons.length !== declared) fail('lessons', `the islands declare ${declared} lessons, the catalog holds ${lessons.length}`);
  for (const island of subjects) {
    const own = lessons.filter(l => l.islandId === island.id);
    const expected = Array.from({ length: island.lessonCount }, (_, n) => formatLessonId(island.lessonPrefix!, n + 1));
    if (own.map(l => l.lessonId).join() !== expected.join()) fail(island.id, `lessons must be ${expected[0]}..${expected.at(-1)} in order`);
    // The island's status follows from its lessons' content status.
    const complete = own.filter(l => l.lessonStatus === 'complete').length;
    const status = complete === 0 ? 'planned' : complete === own.length ? 'complete' : 'available';
    if (own.length && island.status !== status) fail(island.id, `status is ${island.status} but its lessons make it ${status}`);
  }
  return problems;
}

/** The routes an entry point may lead to: pages that exist (complete lessons, the labs) and the catalog's island anchors. */
export interface WorldPages { routes: ReadonlySet<string>; lessonIds: ReadonlySet<string> }

/**
 * Entry points, links and unlock rules: planned islands have no way in and no bridge (nothing to open, not on the
 * map); every target exists; subject islands are never locked; conditions name existing lessons and islands.
 */
export function validateIslandLinks(world: WorldConfig, pages: WorldPages): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const islands = new Map(world.islands.map(i => [i.id, i]));
  const conditionRefs = (c: NonNullable<WorldConfig['islands'][number]['unlock']>, at: string): void => {
    if ('completedLessons' in c) { for (const id of c.completedLessons) if (!pages.lessonIds.has(id)) fail(at, `unlock names unknown lesson ${id}`); }
    else if ('completedIslands' in c) { for (const id of c.completedIslands) if (!islands.has(id)) fail(at, `unlock names unknown island ${id}`); }
    else for (const part of 'all' in c ? c.all : c.any) conditionRefs(part, at);
  };
  for (const island of world.islands) {
    const at = island.id;
    if (island.status === 'planned' && island.entryPoints.length) fail(at, 'a planned island has no entry point');
    if (new Set(island.entryPoints.map(e => e.id)).size !== island.entryPoints.length) fail(at, 'duplicate entry point id');
    for (const entry of island.entryPoints) {
      if (!entry.label.trim()) fail(at, `entry point ${entry.id} has no label`);
      if (!pages.routes.has(entry.target)) fail(at, `entry point ${entry.id} leads to ${entry.target}, which does not exist`);
    }
    for (const link of island.links) {
      const to = islands.get(link.to);
      if (!to) { fail(at, `link to unknown island ${link.to}`); continue; }
      if (to.id === at) fail(at, 'links to itself');
      if (link.kind === 'bridge' && (island.status === 'planned' || to.status === 'planned')) fail(at, `bridge to ${link.to}: planned islands are not on the map`);
    }
    if (island.unlock) {
      if (island.kind === 'subject') fail(at, 'subject islands are never locked');
      conditionRefs(island.unlock, at);
    }
  }
  return problems;
}
