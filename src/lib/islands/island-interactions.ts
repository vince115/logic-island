import { infoOnly, type IslandInteractionSpec } from './interactions';

/*
 * P9 S1: the interaction spec of each island that has targets, keyed by island id. One entry per island, written
 * here and nowhere else; an island without an entry has no targets yet. Rules (checked against the world registry and
 * the catalog in tests/island-registry.test.ts and at build time by src/lib/world/island-registry.ts):
 *   - a syllabus or lesson route names the island itself and something published;
 *   - only the tool island (互動實驗島, the hub) leads to /learn;
 *   - a planned island has `info` targets only.
 */
const lighthouse = { interactionId: 'lighthouse', label: '燈塔', action: { type: 'info', title: '燈塔', text: '基礎程式島的地標，提醒你學習從理解開始。' } } as const;
const dock = { interactionId: 'entry', label: '碼頭', action: { type: 'info', title: '碼頭', text: '群島的入口，從這裡出發前往其他島嶼。' } } as const;

export const ISLAND_INTERACTIONS: Readonly<Record<string, IslandInteractionSpec>> = {
  // S0 decision 4 (2026-11-19): the workshop is the way into the island's own syllabus (F01–F20), not into /learn.
  foundations: { islandId: 'foundations', targets: [
    { interactionId: 'learn', label: '工坊', action: { type: 'route', to: { kind: 'syllabus', islandId: 'foundations' } } }, lighthouse, dock,
  ] },
  // The hub: the shared tool island keeps /learn. It has no GLB yet, so this is its entry in lists and on the overview.
  labs: { islandId: 'labs', targets: [{ interactionId: 'labs', label: '實驗穹頂', action: { type: 'route', to: { kind: 'labs' } } }] },
};

/*
 * The maps that were approved before the regional world (the home page's five-island map, /islands and its previews)
 * show the foundations island as the site's guide, with its workshop leading to /learn. S0 decision 6 keeps the home
 * page as it is until the home switch is decided, so those pages keep this one difference; a page that passes no
 * interactions of its own gets these. Remove this constant (and its use) when the home page takes the regional world.
 */
export const HOME_MAP_INTERACTIONS: Readonly<Record<string, IslandInteractionSpec>> = {
  ...ISLAND_INTERACTIONS,
  foundations: { islandId: 'foundations', targets: [
    { interactionId: 'learn', label: '工坊', action: { type: 'route', to: { kind: 'labs' } } }, lighthouse, dock,
  ] },
};

/**
 * What an island's targets do on the page that draws it: the page's own spec when it passed one (region pages, from
 * the island registry), else the home map's. A planned island keeps `info` targets only, whatever it was given.
 */
export function pageInteractions(island: { id: string; interactions?: IslandInteractionSpec; planned?: unknown }): IslandInteractionSpec | undefined {
  const spec = island.interactions ?? HOME_MAP_INTERACTIONS[island.id];
  return spec && island.planned ? infoOnly(spec) : spec;
}
