import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hexGlbSettlements } from '@/lib/islands/hex-buildings';
import { naturalTerrains, seaGrid } from '@/lib/islands/hex-natural-scene';
import { bridgeParts, roadParts } from '@/lib/islands/hex-route-parts';
import { coastFoam, coastRocks, forestInstances, shallowHexes } from '@/lib/islands/hex-nature-data';
import { scalePrototypes } from '@/lib/islands/hex-scale-prototype';
import { islandsWorld } from '@/lib/islands/islands-world';
import { buildSettlementTerrain, roadProfiles } from '@/lib/islands/hex-terrain';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';

/**
 * D.3-0: fingerprints of every computed world output, taken at 42b32bc (D.2c-2). D.3 moves this code between
 * modules; none of these may change unless the world itself is meant to change, in which case the commit
 * updates the fingerprint and says why.
 */
// T.3J: numbers are rounded to 1e-6 first. The first GitHub CI run (Linux x64) computed some trigonometry one unit in
// the last place apart from macOS arm64, where the fingerprints were taken; a world change is far larger than 1e-6.
const stable = (_key: string, v: unknown) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v;
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value, stable)).digest('hex').slice(0, 16);
/** World, roads, A2 terrain and route parts, in the key order the D.2b/D.2c checks used (the order changes the hash). */
const full = (world: HexWorld) => ({
  world, roads: roadProfiles(world), terrain: world.settlements.map(s => buildSettlementTerrain(world, s)),
  roadParts: roadParts(world), bridgeParts: bridgeParts(world),
});

describe('world data fingerprints (D.3-0)', () => {
  it('T.3J: the rounding hides last-bit noise only; moving any one number by 1e-5 changes the fingerprint', () => {
    const data = JSON.parse(JSON.stringify(islandsWorld.natural)) as unknown;
    const floats: number[] = [];
    JSON.stringify(data, (_k, v) => { if (typeof v === 'number' && !Number.isInteger(v)) floats.push(v); return v; });
    expect(floats.length).toBeGreaterThan(100);
    const nudge = (at: number, by: number) => { let i = 0; return JSON.parse(JSON.stringify(data), (_k, v) => typeof v === 'number' && !Number.isInteger(v) && i++ === at ? v + by : v); };
    const base = fingerprint(data);
    for (const at of [0, Math.floor(floats.length / 2), floats.length - 1]) {
      expect(fingerprint(nudge(at, 1e-5)), `number ${at}`).not.toBe(base);
      expect(fingerprint(nudge(at, Math.abs(floats[at]) * 2 ** -52)), `number ${at}`).toBe(base);
    }
  });

  it('A2 preview world (/islands/hex)', () => {
    expect(fingerprint(full(hexWorld))).toBe('80953dfc6e6476ce');
    expect(fingerprint(hexGlbSettlements)).toBe('03b72b60ef89015e');
  });

  it('19-tile prototype', () => {
    const p = scalePrototypes['19'];
    expect(fingerprint({
      ...full(p.world), glb: p.glb, forests: p.forests, trees: forestInstances(p.world, p.forests), rocks: coastRocks(p.world), foam: coastFoam(p.world),
      shallow: [shallowHexes(p.world, 1), shallowHexes(p.world, 2)],
    // 2026-11-01: the structures–algorithms stone bridge slopes between its ports (0.55 and 1.25) instead of lying level
    // at their average; only that bridge's parts changed (was 890e0a90cd62a87f).
    })).toBe('6b13f8589b12a458');
  });

  it('37-tile world (D.2c-1 layout and nature, the D.3 production candidate)', () => {
    const p = islandsWorld;
    // D.3-1: the scale prototype's 37-tile variant is the production world itself.
    expect(fingerprint({ ...scalePrototypes['37'], variant: undefined })).toBe(fingerprint(p));
    expect(fingerprint(p.world)).toBe('20a880c9e412947e');
    expect(fingerprint(p.glb)).toBe('f34b217050267a21');
    // T.3J: the nature placement hashes with fract(sin(·) × 43758.5453), which turns a last-bit difference of sin
    // between platforms into a different placement, so each platform keeps its own exact value (taken at cb5ac56; the
    // linux-x64 one from GitHub Actions run 42829136596). A world change changes both; a new platform must add its own.
    const NATURAL: Record<string, string> = { 'darwin-arm64': '63188173624e0fcd', 'linux-x64': '6c5895f2b08d3974' };
    expect(NATURAL[`${process.platform}-${process.arch}`], `no natural fingerprint for ${process.platform}-${process.arch}`).toBeDefined();
    expect(fingerprint(p.natural)).toBe(NATURAL[`${process.platform}-${process.arch}`]);
    expect(fingerprint(naturalTerrains(p.world))).toBe('0142d9efea22ef4f');
    expect(fingerprint(seaGrid(p.world))).toBe('8d7d1c7994621db9');
    expect(fingerprint(roadProfiles(p.world))).toBe('0209a3f6b59f88ea');
    expect(fingerprint(roadParts(p.world, p.natural?.roadWidths))).toBe('a96bb5411f3efaab');
    expect(fingerprint({ forests: p.forests, zones: p.zones, bridgeParts: bridgeParts(p.world) })).toBe('438b3860e71ef3da'); // 2026-11-01 sloped bridge (was 0756fecc03c63294)
  });
});
