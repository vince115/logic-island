import { BufferGeometry, Float32BufferAttribute, Vector3, type BufferAttribute } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';

/**
 * D.2c-2 tree LOD: a low-detail copy of a GLB tree for distant views, built at runtime so the GLB stays untouched.
 * Small or hollow-shaped parts (trunk, branches) are kept triangle for triangle. Each larger, nearly convex part
 * (a canopy blob, a cone layer) becomes the convex hull of its outermost points in 12 directions, scaled about its
 * center to keep its volume, and each new face takes the color of the original face that points the same way.
 */
export const TREE_LOD = {
  /** Parts with at most this many triangles are kept as they are. */
  keep: 30,
  /** Parts filling less than this share of their own convex hull (a fork of branches) are kept too. */
  convex: 0.7,
  /** Hull scale limits, in case a part is not closed and its volume cannot be trusted. */
  scale: [1, 1.25],
} as const;

// Icosahedron with one vertex straight up: top, two rings of five, bottom. A cone layer gets its apex and a
// ten-point rim; a round blob gets an icosahedron.
const DIRECTIONS: Vector3[] = (() => {
  const out = [new Vector3(0, 1, 0), new Vector3(0, -1, 0)], y = Math.sin(Math.atan(0.5)), r = Math.cos(Math.atan(0.5));
  for (let i = 0; i < 5; i++) {
    out.push(new Vector3(r * Math.cos(i * 2 * Math.PI / 5), y, r * Math.sin(i * 2 * Math.PI / 5)));
    out.push(new Vector3(r * Math.cos((i + .5) * 2 * Math.PI / 5), -y, r * Math.sin((i + .5) * 2 * Math.PI / 5)));
  }
  return out;
})();

type Triangle = [number, number, number];

/** Triangles grouped into connected parts (vertices at the same position count as shared). */
export function treeParts(geometry: BufferGeometry): Triangle[][] {
  const position = geometry.getAttribute('position') as BufferAttribute, index = geometry.getIndex();
  const count = index ? index.count : position.count, vertex = (i: number) => index ? index.getX(i) : i;
  const ids = new Map<string, number>(), parent: number[] = [];
  const idOf = (v: number) => {
    const key = [position.getX(v), position.getY(v), position.getZ(v)].map(x => Math.round(x * 1e4)).join(',');
    let id = ids.get(key);
    if (id === undefined) { id = parent.length; ids.set(key, id); parent.push(id); }
    return id;
  };
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const triangles: Triangle[] = [];
  for (let i = 0; i < count; i += 3) {
    const t: Triangle = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const [a, b, c] = t.map(v => find(idOf(v)));
    parent[b] = a; parent[find(c)] = a;
    triangles.push(t);
  }
  const parts = new Map<number, Triangle[]>();
  for (const t of triangles) {
    const root = find(idOf(t[0]));
    if (!parts.has(root)) parts.set(root, []);
    parts.get(root)!.push(t);
  }
  return [...parts.values()];
}

/** Signed volume of a closed triangle list about `center` (positive for outward-facing triangles). */
function volume(points: Vector3[][], center: Vector3) {
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  return points.reduce((sum, [p, q, r]) => sum + a.subVectors(p, center).dot(b.subVectors(q, center).cross(c.subVectors(r, center))) / 6, 0);
}

const hullFaces = (points: Vector3[]) => new ConvexHull().setFromPoints(points).faces.map(face => {
  const corners: Vector3[] = [];
  let edge = face.edge;
  do { corners.push(edge.head().point.clone()); edge = edge.next; } while (edge !== face.edge);
  return { corners, normal: face.normal.clone() };
});
const centerOf = (points: Vector3[]) => points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);

/** The parts the LOD keeps as they are, and the canopy parts it replaces by hulls. */
export function lodParts(geometry: BufferGeometry): { kept: Triangle[][]; hulled: Triangle[][] } {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const at = (v: number) => new Vector3(position.getX(v), position.getY(v), position.getZ(v));
  const kept: Triangle[][] = [], hulled: Triangle[][] = [];
  for (const part of treeParts(geometry)) {
    if (part.length <= TREE_LOD.keep) { kept.push(part); continue; }
    const points = [...new Set(part.flat())].map(at), center = centerOf(points);
    const fill = Math.abs(volume(part.map(t => t.map(at)), center)) / volume(hullFaces(points).map(f => f.corners), center);
    (fill >= TREE_LOD.convex ? hulled : kept).push(part);
  }
  return { kept, hulled };
}

/** The low-detail copy of one tree geometry: position, normal and color, not indexed. */
export function simplifyTree(geometry: BufferGeometry): BufferGeometry {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  const color = geometry.getAttribute('color') as BufferAttribute | undefined;
  const at = (v: number) => new Vector3(position.getX(v), position.getY(v), position.getZ(v));
  const colorOf = (v: number): [number, number, number] => color ? [color.getX(v), color.getY(v), color.getZ(v)] : [1, 1, 1];
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const push = (p: Vector3, n: Vector3, c: [number, number, number]) => { positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); colors.push(...c); };
  const { kept, hulled } = lodParts(geometry);
  for (const t of kept.flat()) for (const v of t) {
    const n = normal ? new Vector3(normal.getX(v), normal.getY(v), normal.getZ(v)) : new Vector3(0, 1, 0);
    push(at(v), n, colorOf(v));
  }
  for (const part of hulled) {
    const points = [...new Set(part.flat())].map(at), center = centerOf(points);
    const support = [...new Set(DIRECTIONS.map(d => points.reduce((best, p) => p.clone().sub(center).dot(d) > best.clone().sub(center).dot(d) ? p : best)))];
    const faces = hullFaces(support);
    const original = volume(part.map(t => t.map(at)), center), reduced = volume(faces.map(f => f.corners), center);
    const scale = Math.min(TREE_LOD.scale[1], Math.max(TREE_LOD.scale[0], Math.cbrt(Math.abs(original) / Math.max(reduced, 1e-9)) || 1));
    // Original faces with their outward direction and mean color, to paint the new faces.
    const painted = part.map(t => {
      const [p, q, r] = t.map(at), mid = p.clone().add(q).add(r).divideScalar(3);
      const cs = t.map(colorOf);
      return { direction: mid.sub(center).normalize(), color: [0, 1, 2].map(k => (cs[0][k] + cs[1][k] + cs[2][k]) / 3) as [number, number, number] };
    });
    for (const face of faces) {
      const c = painted.reduce((best, f) => f.direction.dot(face.normal) > best.direction.dot(face.normal) ? f : best).color;
      for (const p of face.corners) push(p.sub(center).multiplyScalar(scale).add(center), face.normal, c);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  if (color) out.setAttribute('color', new Float32BufferAttribute(colors, 3));
  out.computeBoundingSphere();
  return out;
}
