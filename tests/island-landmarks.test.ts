import { describe, expect, it } from 'vitest';
import { islandsInRegion, getIsland } from '@/content/world';
import { REGION_IDS } from '@/content/world/types';
import { ISLAND_INTERACTIONS } from '@/lib/islands/island-interactions';
import { ISLAND_LANDMARKS, islandLandmarks } from '@/lib/islands/island-landmarks';
import { regionScene } from '@/lib/p9/region-scene';
import { landmarkPieces } from '@/components/p9/landmarks';

/*
 * P9.4 Phase D: the landmark registry and the drawn landmarks agree, and a landmark never leads anywhere the island's
 * own interaction spec does not.
 */
describe('island landmark registry', () => {
  const islands = REGION_IDS.flatMap(r => islandsInRegion(r).map(i => ({ region: r, id: i.id }))).filter(i => i.id !== 'foundations');

  it('has every subject island but 基礎程式島 (GLB), and nothing else', () => {
    expect(Object.keys(ISLAND_LANDMARKS).sort()).toEqual(islands.map(i => i.id).sort());
  });

  it('names one landmark for each site an island\'s pieces stand on, site 0 its main one, ids unique on the island', () => {
    for (const { region, id } of islands) {
      const landmarks = islandLandmarks(id), sites = regionScene(region).landscapes.find(l => l.islandId === id)!.tiles;
      const used = [...new Set(landmarkPieces(id, '#000').map(p => p.tile))].sort((a, b) => a - b);
      expect(landmarks.map(l => l.site).sort((a, b) => a - b), id).toEqual(used);
      expect(landmarks.some(l => l.site === 0), id).toBe(true);
      expect(new Set(landmarks.map(l => l.landmarkId)).size, id).toBe(landmarks.length);
      for (const l of landmarks) expect(l.site, `${id} ${l.landmarkId}`).toBeLessThan(sites.length);
    }
  });

  it('lists each landmark in the scene definition on its own site, so the World and the Region read the same', () => {
    for (const { region, id } of islands) {
      const scene = regionScene(region), sites = scene.landscapes.find(l => l.islandId === id)!.tiles;
      for (const l of islandLandmarks(id)) {
        const listed = scene.landmarks.find(m => m.islandId === id && m.id === l.landmarkId);
        expect(listed, `${id} ${l.landmarkId}`).toBeDefined();
        expect(listed!.tile, `${id} ${l.landmarkId}`).toEqual(sites[l.site]);
      }
    }
  });

  it('only leads where the island\'s interaction spec does; planned islands lead nowhere', () => {
    for (const { id } of islands) for (const l of islandLandmarks(id)) {
      if (!l.interactionId) continue;
      const target = ISLAND_INTERACTIONS[id]?.targets.find(t => t.interactionId === l.interactionId);
      expect(target, `${id} ${l.landmarkId}`).toBeDefined();
      if (getIsland(id)?.status === 'planned') expect(target!.action.type, `${id} ${l.landmarkId}`).toBe('info');
    }
  });
});
