import type { ErAttribute, ErModel, ErRelationship } from './model';

/*
 * Phase F.1b: where an ER diagram's boxes and lines go (crow's foot / IE notation). Entities sit on a grid, either at
 * the cell a lesson gives them or in reading order (up to three per row); relationships are straight lines between box
 * edges, parallel lines when two entities share several relationships, and a loop for an entity related to itself.
 * Pure geometry: the drawing is src/components/curriculum/er-diagram.tsx.
 */

export interface Point { x: number; y: number }
export interface BoxLayout { id: string; x: number; y: number; width: number; height: number }
export interface EdgeLayout {
  relationship: ErRelationship;
  /** Where the line meets A's and B's box, and the unit direction pointing away from each box along the line. */
  a: Point; b: Point; aOut: Point; bOut: Point;
  /** The label's centre; a loop is drawn through `loop` instead of a straight line. */
  label: Point; loop?: Point[];
}
export interface DiagramLayout { width: number; height: number; boxes: Map<string, BoxLayout>; edges: EdgeLayout[] }

export const HEADER = 30, LINE = 19, PAD = 10;
const GAP_X = 150, GAP_Y = 96, MARGIN = 24;
/** Rough text width at the diagram's 13px font: CJK characters are about square, Latin ones about half. */
export const textWidth = (text: string) => [...text].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 13 : 7.4), 0);
export const attributeText = (a: ErAttribute) => a.multivalued ? `{${a.name}}` : a.name;

export function layoutDiagram(model: ErModel, at: Readonly<Record<string, readonly [number, number]>> = {}): DiagramLayout {
  const size = new Map(model.entities.map(e => {
    const widest = Math.max(textWidth(e.name), ...e.attributes.map(a => textWidth(attributeText(a)) + (a.key ? 26 : 0)));
    return [e.id, { width: Math.max(110, Math.ceil(widest) + 2 * PAD + 6), height: HEADER + Math.max(1, e.attributes.length) * LINE + PAD }];
  }));
  const columns = Math.min(3, Math.max(1, model.entities.length));
  const cell = (i: number, id: string) => at[id] ?? [i % columns, Math.floor(i / columns)] as const;
  const cells = model.entities.map((e, i) => ({ id: e.id, cell: cell(i, e.id) }));
  const colWidth = Math.max(...[...size.values()].map(s => s.width), 110) + GAP_X;
  const rowHeight = Math.max(...[...size.values()].map(s => s.height), 60) + GAP_Y;
  const boxes = new Map<string, BoxLayout>();
  for (const { id, cell: [col, row] } of cells) {
    const s = size.get(id)!;
    boxes.set(id, { id, x: MARGIN + col * colWidth + (colWidth - GAP_X - s.width) / 2 + 40, y: MARGIN + 20 + row * rowHeight, ...s });
  }

  const edges: EdgeLayout[] = [];
  const pairs = new Map<string, number>();
  for (const r of model.relationships) {
    const A = boxes.get(r.a), B = boxes.get(r.b);
    if (!A || !B) continue;
    if (r.a === r.b) { edges.push(selfLoop(r, A, edges.filter(e => e.relationship.a === r.a && e.relationship.b === r.a).length)); continue; }
    const pair = [r.a, r.b].sort().join('|'), nth = pairs.get(pair) ?? 0;
    pairs.set(pair, nth + 1);
    const total = model.relationships.filter(x => x.a !== x.b && [x.a, x.b].sort().join('|') === pair).length;
    const offset = (nth - (total - 1) / 2) * 34;
    const ca = centre(A), cb = centre(B);
    const u = unit({ x: cb.x - ca.x, y: cb.y - ca.y }), n = { x: -u.y, y: u.x };
    const shift = (p: Point) => ({ x: p.x + n.x * offset, y: p.y + n.y * offset });
    const a = edgePoint(A, shift(ca), u), b = edgePoint(B, shift(cb), { x: -u.x, y: -u.y });
    edges.push({ relationship: r, a, b, aOut: u, bOut: { x: -u.x, y: -u.y }, label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  const right = Math.max(...[...boxes.values()].map(b => b.x + b.width), 200) + MARGIN + 60;
  const bottom = Math.max(...[...boxes.values()].map(b => b.y + b.height), 80) + MARGIN + 20;
  return { width: Math.ceil(right), height: Math.ceil(bottom), boxes, edges };
}

const centre = (b: BoxLayout): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const unit = (v: Point): Point => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

/** Where a ray from `from` (inside the box) in direction `u` leaves the box. */
function edgePoint(box: BoxLayout, from: Point, u: Point): Point {
  const tx = u.x > 0 ? (box.x + box.width - from.x) / u.x : u.x < 0 ? (box.x - from.x) / u.x : Infinity;
  const ty = u.y > 0 ? (box.y + box.height - from.y) / u.y : u.y < 0 ? (box.y - from.y) / u.y : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: from.x + u.x * t, y: from.y + u.y * t };
}

/** A loop off the box's right side: out from the upper part, back into the lower part. */
function selfLoop(r: ErRelationship, box: BoxLayout, nth: number): EdgeLayout {
  const x = box.x + box.width, reach = 56 + nth * 28;
  const a = { x, y: box.y + box.height * 0.3 }, b = { x, y: box.y + box.height * 0.75 };
  return { relationship: r, a, b, aOut: { x: 1, y: 0 }, bOut: { x: 1, y: 0 }, label: { x: x + reach + 4, y: (a.y + b.y) / 2 },
    loop: [a, { x: x + reach, y: a.y }, { x: x + reach, y: b.y }, b] };
}
