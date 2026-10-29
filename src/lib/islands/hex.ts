/** Flat-top hexagon math on axial (q, r) coordinates. */
export interface Axial { q: number; r: number }
/** Edge index 0–5; edge `d` is shared with the neighbor in direction `d`. */
export type HexEdge = 0 | 1 | 2 | 3 | 4 | 5;

export const HEX_EDGES: readonly HexEdge[] = [0, 1, 2, 3, 4, 5];
// Flat-top neighbors seen from above (+y, north = -z): edge 0 faces -30°, then counter-clockwise in 60° steps.
const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export const hexKey = ({ q, r }: Axial) => `${q},${r}`;
export const addAxial = (a: Axial, b: Axial, times = 1): Axial => ({ q: a.q + b.q * times, r: a.r + b.r * times });
export const hexDirection = (edge: HexEdge) => DIRECTIONS[edge];
export const hexNeighbor = (hex: Axial, edge: HexEdge) => addAxial(hex, DIRECTIONS[edge]);
export const oppositeEdge = (edge: HexEdge) => ((edge + 3) % 6) as HexEdge;
export const hexDistance = (a: Axial, b: Axial) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** All hexes within `radius` of `center`; radius 1 is the 7-tile prototype cluster. */
export function hexSpiral(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) result.push(addAxial(center, { q, r }));
  }
  return result;
}

/** World x/z of a hex center; `size` is the circumradius (center to corner). */
export function hexToWorld({ q, r }: Axial, size: number): [number, number] {
  return [size * 1.5 * q, size * Math.sqrt(3) * (r + q / 2)];
}
/** Corner `i` sits at angle 60°·i from +x, so corners 0 and 3 point east and west (flat-top). */
export function hexCorner(center: Axial, size: number, i: number): [number, number] {
  const [x, z] = hexToWorld(center, size);
  const angle = (Math.PI / 3) * i;
  return [x + size * Math.cos(angle), z - size * Math.sin(angle)];
}
/** The two corners bounding edge `edge` (corners at 60°·(edge-1) and 60°·edge). */
export function hexEdgeCorners(hex: Axial, edge: HexEdge, size: number): [[number, number], [number, number]] {
  return [hexCorner(hex, size, (edge + 5) % 6), hexCorner(hex, size, edge)];
}
/** Midpoint of edge `edge`: halfway to that neighbor's center, at the inner radius. */
export function hexEdgeMidpoint(hex: Axial, edge: HexEdge, size: number): [number, number] {
  const [x, z] = hexToWorld(hex, size), [nx, nz] = hexToWorld(hexNeighbor(hex, edge), size);
  return [(x + nx) / 2, (z + nz) / 2];
}
