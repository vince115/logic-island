/*
 * P9 S1 (Island Visual Standard): what an island's interaction targets do, as typed data apart from its GLB. A GLB
 * asset names its clickable nodes and their anchors (asset-registry.ts); what a click does belongs to the island and
 * to how far its content is published, so the same contract serves all 29 islands. Pure and client-safe: no
 * registry, catalog or renderer is imported here. Whether a route really exists and is published is checked on the
 * server (src/lib/world/island-registry.ts) and in unit tests, never trusted from this file alone.
 */

/**
 * Where a target may lead, inside the site only:
 *   labs      /learn, the shared Interactive Lab Island (the hub);
 *   syllabus  /curriculum#island-<islandId>, an island's own syllabus;
 *   lesson    /curriculum/<slug>, one published lesson of the island.
 * There is no free-form href: a route is one of these shapes or it does not type-check.
 */
export type IslandRoute =
  | { kind: 'labs' }
  | { kind: 'syllabus'; islandId: string }
  | { kind: 'lesson'; islandId: string; slug: string };
export type IslandHref = '/learn' | `/curriculum#island-${string}` | `/curriculum/${string}`;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Whether a route's ids are plain kebab-case, so the href built from them cannot leave the site or its section. */
export const routeIsWellFormed = (route: IslandRoute) =>
  route.kind === 'labs' || (KEBAB.test(route.islandId) && (route.kind === 'syllabus' || KEBAB.test(route.slug)));

export function routeHref(route: IslandRoute): IslandHref {
  if (!routeIsWellFormed(route)) throw new Error(`Malformed island route ${JSON.stringify(route)}`);
  return route.kind === 'labs' ? '/learn' : route.kind === 'syllabus' ? `/curriculum#island-${route.islandId}` : `/curriculum/${route.slug}`;
}
/** The short word beside a route target's name (its button and, in the long form, its map label). */
export const ROUTE_HINTS: Record<IslandRoute['kind'], string> = { labs: '學習路線', syllabus: '課綱', lesson: '課程' };

export type IslandAction = { type: 'route'; to: IslandRoute } | { type: 'info'; title: string; text: string };
/**
 * One target of an island: `interactionId` is the GLB's `interaction_id` (shared by the target node and its anchor),
 * `label` the place's name on the map and in the HTML list.
 */
export interface InteractionTarget { interactionId: string; label: string; action: IslandAction }
export interface IslandInteractionSpec { islandId: string; targets: readonly InteractionTarget[] }

export const interactionOf = (spec: IslandInteractionSpec | undefined, interactionId: string) =>
  spec?.targets.find(t => t.interactionId === interactionId);
/** A target's long label: its name, and for a route the hint of where it leads (工坊 · 課綱). */
export const targetLabel = (target: InteractionTarget) =>
  target.action.type === 'route' ? `${target.label} · ${ROUTE_HINTS[target.action.to.kind]}` : target.label;

/**
 * What a planned island may offer: information only. A route on an island with no published lesson would lead to a
 * page that does not exist, so it is dropped here as well as rejected by the registry's validation.
 */
export const infoOnly = (spec: IslandInteractionSpec): IslandInteractionSpec =>
  spec.targets.every(t => t.action.type === 'info') ? spec : { ...spec, targets: spec.targets.filter(t => t.action.type === 'info') };
