import { describe, expect, it } from 'vitest';
import { islandsInRegion } from '@/content/world';
import type { RegionId } from '@/content/world/types';
import { hexKey } from '@/lib/islands/hex';
import { regionScene } from '@/lib/p9/region-scene';
import { landmarkIslands, landmarkPieces } from '@/components/p9/landmarks';
import { landscapePieceCount } from '@/components/p9/p9-landscapes';

/*
 * P9.3: every island of a finished region has landmarks of its own, on sites of its own island that no bridge lands
 * on, with a main building tall enough to read from the world overview and a lighter world level of detail.
 */
const FINISHED: RegionId[] = ['cs'];
/** 基礎程式島 is drawn from its GLB, not from the landmark kit. */
const GLB_ISLANDS = ['foundations'];

describe('P9.3 island landmarks', () => {
  for (const region of FINISHED) {
    it(`${region}: every island has its own landmarks on its own clear sites`, () => {
      const scene = regionScene(region), { world } = scene.region.layout;
      const ids = islandsInRegion(region).map(i => i.id).filter(id => !GLB_ISLANDS.includes(id));
      for (const id of ids) {
        expect(landmarkIslands(), id).toContain(id);
        const site = scene.landscapes.find(l => l.islandId === id);
        expect(site, `${id} has sites`).toBeDefined();
        const settlement = world.settlements.find(s => s.islandId === id)!;
        const ports = new Set(world.bridges.flatMap(b => [b.from, b.to]).filter(p => p.islandId === id).map(p => hexKey(p.tile)));
        for (const t of site!.tiles) {
          expect(settlement.tiles.some(u => hexKey(u) === hexKey(t)), `${id} ${hexKey(t)} on its island`).toBe(true);
          expect(ports.has(hexKey(t)), `${id} ${hexKey(t)} is a bridge landing`).toBe(false);
        }
        const pieces = landmarkPieces(id, '#4285f4');
        const used = new Set(pieces.map(p => p.tile));
        expect(Math.max(...used), `${id} uses only its ${site!.tiles.length} sites`).toBeLessThan(site!.tiles.length);
        // The main landmark (tile 0) reads from afar: its highest piece stands at least a metre above the ground.
        const top = Math.max(...pieces.filter(p => p.tile === 0).map(p => { p.geometry.computeBoundingBox(); return p.at[1] + p.geometry.boundingBox!.max.y * (p.scale?.[1] ?? 1); }));
        expect(top, `${id} main landmark height`).toBeGreaterThan(1);
        // Something glows at night, and the world's level of detail is lighter but keeps most of it.
        expect(pieces.some(p => p.glow), `${id} has lit windows`).toBe(true);
        expect(landscapePieceCount(id, 'world'), id).toBeLessThanOrEqual(landscapePieceCount(id, 'region'));
        pieces.forEach(p => p.geometry.dispose());
      }
    });
  }
});
