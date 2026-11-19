import { glbAssetOfIsland, glbAssets } from '@/lib/islands/asset-registry';
import { infoOnly, routeHref, routeIsWellFormed, type IslandInteractionSpec } from '@/lib/islands/interactions';
import { ISLAND_INTERACTIONS } from '@/lib/islands/island-interactions';
import { getIsland } from '@/content/world';
import { getCatalogLessonBySlug } from '@/content/world/catalog';
import { worldPages } from '@/content/world/records';

/*
 * P9 S1: island interactions checked against what really exists. The specs themselves are plain data
 * (src/lib/islands/island-interactions.ts); this module, on the server, holds them to the world registry and the
 * catalog: a route must lead to a page that exists and is published, on the island that owns the target, and a
 * planned island offers information only. The region pages read their islands' interactions through
 * `islandInteractions`, which throws on any problem, so a broken route fails the build instead of reaching a page.
 */

export interface InteractionRules {
  /**
   * The home map's set (HOME_MAP_INTERACTIONS): there the foundations island is the site's guide and its workshop
   * leads to /learn. Everywhere else only the tool island leads there.
   */
  homeMap?: boolean;
}

/** Every rule a spec breaks; an empty list means every target is safe to show. */
export function validateInteractionSpec(spec: IslandInteractionSpec, { homeMap = false }: InteractionRules = {}): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`${spec.islandId}: ${what}`);
  const island = getIsland(spec.islandId);
  if (!island) return [`${spec.islandId}: not an island of the world registry`];
  const ids = spec.targets.map(t => t.interactionId);
  if (new Set(ids).size !== ids.length) fail('two targets share an interaction id');
  const pages = worldPages().routes;
  for (const target of spec.targets) {
    const at = `target ${target.interactionId}`;
    if (!target.label.trim()) fail(`${at} has no label`);
    const action = target.action;
    if (action.type === 'info') { if (!action.title.trim() || !action.text.trim()) fail(`${at} has an empty info`); continue; }
    const route = action.to;
    if (!routeIsWellFormed(route)) { fail(`${at} has a malformed route`); continue; }
    // A planned island has nothing published: no route at all, whatever it points at.
    if (island.status === 'planned') { fail(`${at} is a route, but the island is planned (info only)`); continue; }
    if (!pages.has(routeHref(route))) fail(`${at} leads to ${routeHref(route)}, which does not exist`);
    if (route.kind === 'labs') {
      if (island.kind !== 'tool' && !(homeMap && island.id === 'foundations')) fail(`${at} leads to /learn, which belongs to the tool island`);
    } else if (route.islandId !== spec.islandId) fail(`${at} leads to ${route.islandId}'s content`);
    else if (route.kind === 'lesson') {
      const lesson = getCatalogLessonBySlug(route.slug);
      if (!lesson || lesson.islandId !== spec.islandId) fail(`${at}: ${route.slug} is not a lesson of this island`);
      else if (lesson.lessonStatus !== 'complete') fail(`${at}: lesson ${route.slug} is not published`);
    }
  }
  // An island with a GLB: its targets and its interactions are the same set, joined by interaction id.
  const assetId = glbAssetOfIsland(spec.islandId);
  if (assetId) {
    const nodes = glbAssets[assetId].nodes.filter(n => n.kind === 'target').map(n => n.interactionId as string);
    for (const id of nodes) if (!ids.includes(id)) fail(`GLB target ${id} has no interaction`);
    for (const id of ids) if (!nodes.includes(id)) fail(`interaction ${id} names no target of ${assetId}`);
  }
  return problems;
}

/**
 * An island's interactions as a region page may show them: the registry's spec, valid (or the build stops here), with
 * a planned island cut down to its `info` targets. Undefined when the island has no targets yet.
 */
export function islandInteractions(islandId: string): IslandInteractionSpec | undefined {
  const spec = ISLAND_INTERACTIONS[islandId];
  if (!spec) return undefined;
  const problems = validateInteractionSpec(spec);
  if (problems.length) throw new Error(`Island interactions are invalid:\n${problems.join('\n')}`);
  return getIsland(islandId)?.status === 'planned' ? infoOnly(spec) : spec;
}
