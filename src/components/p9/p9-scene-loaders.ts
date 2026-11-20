import { regionModelUrls } from '@/lib/p9/region-models';
import type { SceneId } from '@/lib/p9/region-scene';

/*
 * P9.8a: what a P9 region page's scene needs, loaded ahead by the world overview (p9-world-scene.tsx) and read by the
 * region page (p9-region-explorer.tsx). Both import only this file; the modules it loads stay in their own chunks,
 * so neither page's own script grows.
 */
type Landscapes = typeof import('./p9-landscapes');
let landscapes: Landscapes | undefined;

/** The planned islands' landscapes (landmark buildings): loads the module once and keeps it for loadedLandscapes. */
export const loadLandscapes = () => import('./p9-landscapes').then(module => (landscapes = module));
/** The landscapes module if it has loaded (on this page or the one before it), else undefined. */
export const loadedLandscapes = () => landscapes;

const modelsFor = new Set<SceneId>();
/**
 * The region's GLB buildings and trees, once per region per page load: the list (region-models.ts) is worked out here,
 * where the region data already is, and only drei's loader (p9-region-models.ts) comes in a chunk of its own. If that
 * chunk cannot load, the region may try again on the next flight; the region page loads its models itself either way.
 */
export function preloadRegionModels(id: SceneId) {
  if (modelsFor.has(id)) return;
  modelsFor.add(id);
  const urls = regionModelUrls(id);
  import('./p9-region-models').then(module => module.preloadModels(urls), () => { modelsFor.delete(id); });
}
