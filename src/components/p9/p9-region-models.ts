import { useGLTF } from '@react-three/drei';

/**
 * P9.8a: fetches and parses GLB files into drei's loader cache (the one useGLTF reads), with the region page's own
 * arguments (no Draco, no Meshopt), so the page's first render finds them ready instead of drawing placeholders and
 * swapping them. Loaded on demand (p9-scene-loaders.ts) with the region's list (src/lib/p9/region-models.ts).
 * A file that fails to load is cached as failed, exactly as when the page loads it itself: its island shows the
 * placeholder buildings (HexGlbBuildings' fallback) and the page works as before.
 */
export function preloadModels(urls: string[]) {
  for (const url of urls) useGLTF.preload(url, false, false);
}
