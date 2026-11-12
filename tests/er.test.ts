import { describe, expect, it } from 'vitest';
import { buildModel, cardinality, checkRoles, describeRelationship, validateModel, validateRoles, type ErRole, type ErTerm } from '../src/lib/er/model';
import { layoutDiagram } from '../src/lib/er/layout';

// Phase F.1b: the ER engine behind the erd-builder activity (DB08, DB09).
const terms: ErTerm[] = [
  { id: 'reader', label: '讀者' }, { id: 'card', label: '借書證號' }, { id: 'phone', label: '電話' },
  { id: 'book', label: '書' }, { id: 'isbn', label: 'ISBN' }, { id: 'borrow', label: '借閱' }, { id: 'due', label: '到期日' },
  { id: 'copy', label: '館藏複本' }, { id: 'copyNo', label: '複本序號' }, { id: 'has', label: '擁有' }, { id: 'library', label: '圖書館' },
];
const answer: Record<string, ErRole> = {
  reader: { role: 'entity' }, card: { role: 'attribute', of: 'reader', key: true }, phone: { role: 'attribute', of: 'reader', multivalued: true },
  book: { role: 'entity' }, isbn: { role: 'attribute', of: 'book', key: true },
  copy: { role: 'entity', weak: true }, copyNo: { role: 'attribute', of: 'copy', key: true },
  has: { role: 'relationship', a: 'book', b: 'copy', aToB: '1..N', bToA: '1..1', identifying: true },
  borrow: { role: 'relationship', a: 'reader', b: 'copy', aToB: '0..N', bToA: '0..1' }, due: { role: 'attribute', of: 'borrow' },
  library: { role: 'none' },
};

describe('ER engine (F.1b)', () => {
  it('builds the model the roles describe, with relationship attributes', () => {
    const model = buildModel(terms, answer);
    expect(model.entities.map(e => e.name)).toEqual(['讀者', '書', '館藏複本']);
    expect(model.entities[0].attributes).toEqual([{ name: '借書證號', key: true }, { name: '電話', multivalued: true }]);
    expect(model.relationships.find(r => r.id === 'borrow')).toMatchObject({ a: 'reader', b: 'copy', attributes: [{ name: '到期日' }] });
    expect(validateModel(model)).toEqual([]);
    expect(validateRoles(terms, answer)).toEqual([]);
    expect(cardinality({ aToB: '0..N', bToA: '0..1' })).toBe('1:N');
    expect(cardinality({ aToB: '1..1', bToA: '0..N' })).toBe('N:1');
    expect(cardinality({ aToB: '0..N', bToA: '1..N' })).toBe('M:N');
    expect(describeRelationship(model.relationships.find(r => r.id === 'borrow')!, id => model.entities.find(e => e.id === id)!.name)).toBe('讀者「借閱」館藏複本：每個讀者對應零或多個館藏複本，每個館藏複本對應零或一個讀者（讀者對館藏複本為 1:N）');
    // While the learner is still choosing, half-made attributes and relationships are left out.
    expect(buildModel(terms, { reader: { role: 'entity' }, borrow: { role: 'relationship', a: 'reader', b: '', aToB: '0..N', bToA: '0..1' } }).relationships).toEqual([]);
  });

  it('accepts the same model drawn the other way round, and explains what differs without giving the answer', () => {
    const ok = (roles: Record<string, ErRole>) => checkRoles(terms, answer, roles).every(r => r.ok);
    expect(ok(answer)).toBe(true);
    expect(ok({ ...answer, borrow: { role: 'relationship', a: 'copy', b: 'reader', aToB: '0..1', bToA: '0..N' } })).toBe(true);
    const flipped = checkRoles(terms, answer, { ...answer, borrow: { role: 'relationship', a: 'copy', b: 'reader', aToB: '0..N', bToA: '0..1' } }, { borrow: '同一本複本同時能被幾個人借走？' });
    expect(flipped.find(r => r.id === 'borrow')).toMatchObject({ ok: false, message: expect.stringMatching(/「借閱」連接的實體正確.*提示：同一本複本/) });
    expect(checkRoles(terms, answer, { ...answer, copy: { role: 'entity' } }).find(r => r.id === 'copy')?.message).toMatch(/能不能單靠自己的屬性區分/);
    expect(checkRoles(terms, answer, { ...answer, phone: { role: 'attribute', of: 'reader' } }).find(r => r.id === 'phone')?.message).toMatch(/多值/);
    expect(checkRoles(terms, answer, { ...answer, library: { role: 'entity' } }).find(r => r.id === 'library')?.message).toMatch(/角色不對/);
    expect(checkRoles(terms, answer, { ...answer, isbn: undefined }).find(r => r.id === 'isbn')?.message).toMatch(/還沒有選擇/);
    // An accepted alternative role passes.
    expect(checkRoles(terms, answer, { ...answer, library: { role: 'entity' } }, {}, { library: [{ role: 'entity' }] }).every(r => r.ok)).toBe(true);
  });

  it('reads a relationship of an entity with itself either way', () => {
    const t: ErTerm[] = [{ id: 'emp', label: '員工' }, { id: 'no', label: '員工編號' }, { id: 'manage', label: '管理' }];
    const a: Record<string, ErRole> = { emp: { role: 'entity' }, no: { role: 'attribute', of: 'emp', key: true }, manage: { role: 'relationship', a: 'emp', b: 'emp', aToB: '0..N', bToA: '0..1' } };
    expect(checkRoles(t, a, { ...a, manage: { role: 'relationship', a: 'emp', b: 'emp', aToB: '0..1', bToA: '0..N' } }).every(r => r.ok)).toBe(true);
    expect(checkRoles(t, a, { ...a, manage: { role: 'relationship', a: 'emp', b: 'emp', aToB: '0..N', bToA: '0..N' } }).every(r => r.ok)).toBe(false);
    const layout = layoutDiagram(buildModel(t, a));
    expect(layout.edges[0].loop).toHaveLength(4);
  });

  it('finds structural problems in a reference model', () => {
    expect(validateRoles(terms, { ...answer, card: { role: 'attribute', of: 'reader' } })).toContain('reader: an entity needs a key (a weak entity: its partial key)');
    expect(validateRoles(terms, { ...answer, has: { role: 'relationship', a: 'book', b: 'copy', aToB: '1..N', bToA: '1..1' } })).toContain('copy: a weak entity needs an identifying relationship');
    expect(validateRoles(terms, { ...answer, due: { role: 'attribute', of: 'library' } })).toContain('due: owner library is not an entity or relationship');
  });

  it('lays out boxes without overlap and starts every line on a box edge', () => {
    const model = buildModel(terms, answer), layout = layoutDiagram(model);
    const boxes = [...layout.boxes.values()];
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1))
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    const onEdge = (p: { x: number; y: number }, id: string) => { const b = layout.boxes.get(id)!; const near = (u: number, v: number) => Math.abs(u - v) < 0.01;
      return (near(p.x, b.x) || near(p.x, b.x + b.width)) && p.y >= b.y - 0.01 && p.y <= b.y + b.height + 0.01 || (near(p.y, b.y) || near(p.y, b.y + b.height)) && p.x >= b.x - 0.01 && p.x <= b.x + b.width + 0.01; };
    for (const e of layout.edges) { expect(onEdge(e.a, e.relationship.a)).toBe(true); expect(onEdge(e.b, e.relationship.b)).toBe(true); }
    for (const b of boxes) { expect(b.x + b.width).toBeLessThanOrEqual(layout.width); expect(b.y + b.height).toBeLessThanOrEqual(layout.height); }
    // A lesson can place entities on chosen grid cells.
    expect(layoutDiagram(model, { reader: [0, 1], book: [1, 0], copy: [1, 1] }).boxes.get('reader')!.y).toBeGreaterThan(layoutDiagram(model, { reader: [0, 1], book: [1, 0], copy: [1, 1] }).boxes.get('book')!.y);
  });
});
