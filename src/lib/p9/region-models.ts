import { VEGETATION_ASSET, glbAssets, type GlbAssetId } from '@/lib/islands/asset-registry';
import { regionScene, type SceneId } from './region-scene';

/**
 * P9.8a: the GLB files a P9 region page's map loads, as it loads them (hex-world-scene.tsx with the region's scene
 * options): each island layout's building set (HexGlbBuildings), and the tree set when the map has trees (HexForest
 * draws them from the vegetation GLB: the layout's natural trees, or else trees grown in its forest patches). The
 * world overview preloads exactly these when it flies to the region, so the page finds them parsed and draws its first
 * frame with every building and tree. One region at a time; the miniatures on the overview load no GLB.
 */
export function regionModelUrls(id: SceneId): string[] {
  const { layout } = regionScene(id).region, assets = new Set<GlbAssetId>(layout.glb.map(g => g.asset));
  if ((layout.natural ? layout.natural.trees.length : layout.forests.length) > 0) assets.add(VEGETATION_ASSET);
  return [...assets].map(asset => glbAssets[asset].url);
}
