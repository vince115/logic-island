import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hexGlbSettlements } from '@/lib/islands/hex-buildings';
import { naturalTerrains, seaGrid } from '@/lib/islands/hex-natural-scene';
import { bridgeParts, roadParts } from '@/lib/islands/hex-route-parts';
import { coastFoam, coastRocks, forestInstances, scalePrototypes, shallowHexes } from '@/lib/islands/hex-scale-prototype';
import { buildSettlementTerrain, roadProfiles } from '@/lib/islands/hex-terrain';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';

/**
 * D.3-0: fingerprints of every computed world output, taken at 42b32bc (D.2c-2). D.3 moves this code between
 * modules; none of these may change unless the world itself is meant to change, in which case the commit
 * updates the fingerprint and says why.
 */
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
/** World, roads, A2 terrain and route parts, in the key order the D.2b/D.2c checks used (the order changes the hash). */
const full = (world: HexWorld) => ({
  world, roads: roadProfiles(world), terrain: world.settlements.map(s => buildSettlementTerrain(world, s)),
  roadParts: roadParts(world), bridgeParts: bridgeParts(world),
});

describe('world data fingerprints (D.3-0)', () => {
  it('A2 preview world (/islands/hex)', () => {
    expect(fingerprint(full(hexWorld))).toBe('ea7a097403a952fb');
    expect(fingerprint(hexGlbSettlements)).toBe('03b72b60ef89015e');
  });

  it('19-tile prototype', () => {
    const p = scalePrototypes['19'];
    expect(fingerprint({
      ...full(p.world), glb: p.glb, forests: p.forests, trees: forestInstances(p.world, p.forests), rocks: coastRocks(p.world), foam: coastFoam(p.world),
      shallow: [shallowHexes(p.world, 1), shallowHexes(p.world, 2)],
    })).toBe('890e0a90cd62a87f');
  });

  it('37-tile world (D.2c-1 layout and nature, the D.3 production candidate)', () => {
    const p = scalePrototypes['37'];
    expect(fingerprint(p.world)).toBe('3742df3b903b4a77');
    expect(fingerprint(p.glb)).toBe('f34b217050267a21');
    expect(fingerprint(p.natural)).toBe('0c22934387995a06');
    expect(fingerprint(naturalTerrains(p.world))).toBe('af6be255bfe52e9e');
    expect(fingerprint(seaGrid(p.world))).toBe('d513a7eaa86651a2');
    expect(fingerprint(roadProfiles(p.world))).toBe('be16037eafd9c04a');
    expect(fingerprint(roadParts(p.world, p.natural?.roadWidths))).toBe('4f289253822f9a56');
    expect(fingerprint({ forests: p.forests, zones: p.zones, bridgeParts: bridgeParts(p.world) })).toBe('0756fecc03c63294');
  });
});
