import { getIsland } from '@/content/world';
import { catalogLessons, getCatalogLesson } from '@/content/world/catalog';
import type { RegionId } from '@/content/world/types';

/*
 * P8.2: which islands are related, derived from the curriculum and never declared for the map. Two islands are related
 * when a lesson of one names a lesson of the other as a prerequisite (required) or as recommended reading.
 *
 * P8.3: a tool for drawing and reviewing a layout, not an input to one. The relations were the reason for where the
 * islands of the design, web and sys maps stand and for which regions the world's bridges join; those layouts are now
 * stored data (regions/region-layouts.ts, regions/world-map.ts), which import nothing from here. Adding a lesson or a
 * prerequisite changes what this module reports and moves no island and no bridge; `bridgeCoverage` says how a stored
 * layout compares with today's relations, for whoever reviews it next. Server-side: it reads the whole catalog.
 */
export interface IslandRelation { a: string; b: string; required: number; recommended: number }

/** Every related pair of islands, each once (a < b), with how many lesson links of each kind stand behind it. */
export function islandRelations(): IslandRelation[] {
  const pairs = new Map<string, IslandRelation>();
  for (const lesson of catalogLessons) for (const [kind, ids] of [['required', lesson.prerequisites], ['recommended', lesson.recommended]] as const) for (const id of ids) {
    const other = getCatalogLesson(id)?.islandId;
    if (!other || other === lesson.islandId) continue;
    const [a, b] = [lesson.islandId, other].sort(), key = `${a} ${b}`;
    const pair = pairs.get(key) ?? { a, b, required: 0, recommended: 0 };
    pair[kind]++;
    pairs.set(key, pair);
  }
  return [...pairs.values()];
}
const weight = (r: IslandRelation) => r.required + r.recommended;
/** The related pairs inside one region, strongest first. */
export const relationsInRegion = (region: RegionId) => islandRelations().filter(r => getIsland(r.a)?.regionId === region && getIsland(r.b)?.regionId === region)
  .sort((x, y) => weight(y) - weight(x) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
/** How strongly two regions are related: the lesson links between their islands, strongest first. */
export function regionRelations(): { a: RegionId; b: RegionId; links: number }[] {
  const pairs = new Map<string, { a: RegionId; b: RegionId; links: number }>();
  for (const r of islandRelations()) {
    const ra = getIsland(r.a)?.regionId, rb = getIsland(r.b)?.regionId;
    if (!ra || !rb || ra === rb) continue;
    const [a, b] = [ra, rb].sort() as [RegionId, RegionId], pair = pairs.get(`${a} ${b}`) ?? { a, b, links: 0 };
    pair.links += weight(r);
    pairs.set(`${a} ${b}`, pair);
  }
  return [...pairs.values()].sort((x, y) => y.links - x.links);
}

/**
 * P8.3: how a layout's bridges compare with a set of relations, as a report and never as a rule: the related pairs
 * that have a bridge, those that have none, and the bridges that join a pair that is not related. Pairs are `a — b`
 * with a < b.
 */
export function bridgeCoverage(relations: readonly Pick<IslandRelation, 'a' | 'b'>[], bridges: readonly (readonly [string, string])[]) {
  const key = (a: string, b: string) => [a, b].sort().join(' — ');
  const related = new Set(relations.map(r => key(r.a, r.b))), built = new Set(bridges.map(([a, b]) => key(a, b)));
  return { bridged: [...related].filter(k => built.has(k)), unbridged: [...related].filter(k => !built.has(k)), unrelated: [...built].filter(k => !related.has(k)) };
}
