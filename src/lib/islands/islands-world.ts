import { hexEdgeMidpoint, hexKey, hexToWorld } from './hex';
import { A, assembleLayout, inList, lighthouseFront, shape, tiles, workshopDoor, type WorldLayout } from './hex-layout';

/**
 * The world map candidate for production (D.3-1): the 37-tile foundations island accepted in D.2c-1 and D.2c-2,
 * and the other two islands as hex settlements with placeholder landmarks. Moved here unchanged from the scale
 * prototype; `tests/world-data.test.ts` pins every computed output.
 */

const F37 = shape(3, [A(0, 3), A(-1, 3), A(3, -1)], [A(0, -4), A(1, -4), A(-4, 1)]);
// D.2c-1: the west hill is one mass on few levels, so neighbors share a surface instead of forming a stair
// of hex plates: a 0.6 terrace (level with the lighthouse headland), a 1.2 shoulder and a 1.8 rock summit
// on (-4, 1) that reads from the overview. (-1, -1) joins the 0.3 step of the lighthouse path. The D.2b
// refinement used 0.3 steps up to 0.9.
const F37_HILLS: Record<string, number> = {
  '-1,-1': .3, '-2,0': .6, '-2,1': .6, '-3,1': .6, '-1,-2': .6, '-2,-1': 1.2, '-3,0': 1.2, '-4,1': 1.8,
};
// (-1, 2) stays a clearing: the dock road runs through it to the south-west cove. D.2c-1 grows the
// south-west wood up the hill flank (-2, 1), (-3, 1), the north wood onto (1, -2), and plants a grove
// on (2, -1) behind the workshop so its roof stands against dark trees.
const F37_FOREST = [A(-3, 2), A(-3, 3), A(-2, 2), A(-2, 1), A(-3, 1), A(1, -3), A(2, -3), A(1, -2), A(2, -1)];
const f37 = tiles(A(0, 0), F37, t => {
  const k = hexKey(t);
  if (k === '0,0') return { terrain: 'plaza' };
  // South-west cove (dock) and a low south beach.
  if (['-2,3', '0,2', '1,2'].includes(k)) return { terrain: 'shore', height: -.55 };
  if (['0,-4', '1,-4', '0,-3'].includes(k)) return { terrain: 'grass', height: .6 };
  if (k === '0,-2') return { terrain: 'grass', height: .3 };
  const height = F37_HILLS[k];
  if (inList(F37_FOREST)(t)) return { terrain: 'forest', height };
  if (height !== undefined) return { terrain: height >= 1.5 ? 'stone' : 'grass', height };
  return { terrain: ['1,0', '1,1', '2,0', '2,1', '3,0'].includes(k) ? 'meadow' : 'grass' };
});
/**
 * D.2c-1: grass coast tiles facing the camera that get a strip of beach at the foot of their cliff, so
 * the south and east coast alternates cliff, beach and cove instead of one even wall. Rendering only.
 */
const F37_CLIFF_BEACHES = [A(2, 1), A(3, 0), A(-1, 2), A(3, -2)];

const S37 = shape(2, [], [A(3, -3), A(3, -2), A(2, 1), A(-1, 3), A(-3, 2), A(0, -3)]), S37_FOREST = [A(1, -2), A(2, -2), A(3, -3), A(2, -1), A(0, -3)];
const A37 = shape(2, [], [A(3, -1), A(3, -3), A(1, -3), A(-2, 3), A(1, 2), A(-3, 1)]), A37_FOREST = [A(2, 0), A(1, 1), A(1, 2), A(3, -1)];

const LIGHTHOUSE_OFFSET: [number, number] = [0, -.15];
// The workshop stands across (1, 0) and (2, 0) facing +z; its road leaves the plaza south, turns east across the
// meadow and runs straight north between the porch posts to the door.
const workshop = workshopDoor(hexEdgeMidpoint(A(1, 0), 0, 1.25));
// D.2c-1: the lookout road continues across the level headland to the lighthouse's door side.
const [lx, lz] = hexToWorld(A(0, -4), 1.25), lighthouse = lighthouseFront([lx + LIGHTHOUSE_OFFSET[0], lz + LIGHTHOUSE_OFFSET[1]]);

export const islandsWorld: WorldLayout = assembleLayout({
  foundations: {
    tiles: f37, cliffBeaches: F37_CLIFF_BEACHES, forest: F37_FOREST, buildingTiles: [A(0, -4), A(1, 0), A(2, 0), A(-2, 3)],
    // A lookout road climbs to the lighthouse headland; the dock road drops to the low shore.
    spurs: [{ id: 'foundations-dock', tile: A(-2, 3), edge: 5 }, { id: 'foundations-lighthouse', tile: A(0, -3), approach: [lighthouse] },
      { id: 'foundations-workshop', tile: A(1, 1), via: [A(0, 1)], approach: [workshop.front, workshop.door] }],
  },
  structures: { center: A(8, -8), shape: S37, forest: S37_FOREST },
  algorithms: { center: A(10, -2), shape: A37, forest: A37_FOREST },
  // Ports chosen so the lighthouse, dock and bridges each get their own coast (see the design log).
  bridges: [
    { id: 'foundations-structures', kind: 'wood', from: { islandId: 'foundations', tile: A(3, -3), edge: 1 }, to: { islandId: 'structures', tile: A(6, -6), edge: 4 } },
    { id: 'structures-algorithms', kind: 'stone', from: { islandId: 'structures', tile: A(10, -7), edge: 5 }, to: { islandId: 'algorithms', tile: A(10, -4), edge: 2 } },
  ],
  glb: {
    label: { tile: A(0, 1), height: 2.2 },
    // Scale stays 0.6; the island grows around the buildings instead.
    placements: [
      { node: 'Landmark_Lighthouse', tile: A(0, -4), offset: LIGHTHOUSE_OFFSET },
      // Across (1, 0) and (2, 0) east of the plaza, door facing the meadow so a road can reach it.
      { node: 'Building_Workshop', tile: A(1, 0), across: 0 },
      { node: 'Dock_Entry', tile: A(-2, 3), edge: 5 },
    ],
  },
  natural: true,
});
