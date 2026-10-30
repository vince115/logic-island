import { hexKey, type Axial } from './hex';
import { A, assembleLayout, inList, shape, tiles, type WorldLayout } from './hex-layout';
import { islandsWorld } from './islands-world';

/**
 * Island Scale & World Composition Prototype (D.2b follow-up). Two candidate scales for the foundations island,
 * 19 and 37 tiles, each with the other two islands enlarged to match so the whole world composition can be judged.
 * Only /islands/hex/scale/* reads this. Since D.3-1 the 37-tile world is the production candidate in
 * `islands-world.ts`; this module keeps the 19-tile reference and pairs it with that world.
 */
export type ScaleVariant = '19' | '37';
export const SCALE_VARIANTS: readonly ScaleVariant[] = ['19', '37'];

export interface ScalePrototype extends WorldLayout { variant: ScaleVariant }

const F19 = shape(2, [A(0, 2), A(2, -2)], [A(0, -3), A(-3, 1)]);
const F19_HILLS: Record<string, number> = { '-2,0': .45, '-1,-1': .45, '-3,1': .9 };
// (-2, 1) stays open grass: it borders the workshop, and trees there would brush its wall.
const F19_FOREST = [A(-2, 2), A(-1, 2), A(1, -2)];
const f19 = tiles(A(0, 0), F19, t => {
  const k = hexKey(t);
  if (k === '0,0') return { terrain: 'plaza' };
  // South-east beach for the dock, two tiles from the workshop.
  if (k === '1,1') return { terrain: 'shore', height: -.55 };
  if (k === '0,-3') return { terrain: 'grass', height: .5 };
  if (k === '0,-2') return { terrain: 'grass', height: .25 };
  // Hills keep grass on top; only the highest step is bare stone.
  if (k in F19_HILLS) return { terrain: F19_HILLS[k] >= .9 ? 'stone' : 'grass', height: F19_HILLS[k] };
  if (inList(F19_FOREST)(t)) return { terrain: 'forest' };
  return { terrain: ['1,0', '2,0', '0,1'].includes(k) ? 'meadow' : 'grass' };
});
const S19 = shape(2, [A(2, 0), A(-2, 2), A(0, -2)], []), S19_FOREST: Axial[] = [A(1, -2), A(2, -1)];
const A19 = shape(2, [A(-2, 0), A(1, 1), A(2, -2)], []), A19_FOREST: Axial[] = [A(1, 0), A(0, 2)];

const scale19: WorldLayout = assembleLayout({
  foundations: {
    tiles: f19, forest: F19_FOREST, buildingTiles: [A(0, -3), A(-1, 1), A(-1, 0), A(1, 1)],
    // A lookout road climbs to the tile below the lighthouse; the dock road drops to the low shore.
    spurs: [{ id: 'foundations-dock', tile: A(1, 1), edge: 5 }, { id: 'foundations-lighthouse', tile: A(0, -2) }],
  },
  structures: { center: A(6, -3), shape: S19, forest: S19_FOREST },
  algorithms: { center: A(5, 3), shape: A19, forest: A19_FOREST },
  bridges: [
    { id: 'foundations-structures', kind: 'wood', from: { islandId: 'foundations', tile: A(2, -1), edge: 1 }, to: { islandId: 'structures', tile: A(4, -3), edge: 4 } },
    { id: 'structures-algorithms', kind: 'stone', from: { islandId: 'structures', tile: A(5, -1), edge: 5 }, to: { islandId: 'algorithms', tile: A(5, 1), edge: 2 } },
  ],
  glb: {
    label: { tile: A(0, 1), height: 2.2 },
    placements: [
      { node: 'Landmark_Lighthouse', tile: A(0, -3), offset: [0, -.15] },
      { node: 'Building_Workshop', tile: A(-1, 1), across: 2 },
      { node: 'Dock_Entry', tile: A(1, 1), edge: 5 },
    ],
  },
  natural: false,
});

export const scalePrototypes: Record<ScaleVariant, ScalePrototype> = { '19': { variant: '19', ...scale19 }, '37': { variant: '37', ...islandsWorld } };
