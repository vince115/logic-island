/*
 * Phase F.1b ER modeling engine (DB08, DB09): an entity–relationship model, built from the role the learner gives each
 * term of a scenario (entity, attribute, relationship or not modeled), and compared with the reference model by
 * meaning, not by wording: a relationship drawn the other way round with its multiplicities swapped is the same
 * relationship. Pure functions, shared by the erd-builder activity and the tests.
 */

/** How many of the other side one instance relates to: at least (0 or 1) .. at most (1 or many). */
export const MULTIPLICITIES = ['0..1', '1..1', '0..N', '1..N'] as const;
export type Multiplicity = typeof MULTIPLICITIES[number];
export const MULTIPLICITY_TEXT: Record<Multiplicity, string> = { '0..1': '零或一個', '1..1': '恰好一個', '0..N': '零或多個', '1..N': '一或多個' };
const many = (m: Multiplicity) => m.endsWith('N');

export interface ErAttribute { name: string; key?: boolean; multivalued?: boolean }
export interface ErEntity { id: string; name: string; weak?: boolean; attributes: ErAttribute[] }
/** Each A relates to `aToB` B's; each B relates to `bToA` A's. Identifying: it gives a weak entity its identity. */
export interface ErRelationship { id: string; name: string; a: string; b: string; aToB: Multiplicity; bToA: Multiplicity; identifying?: boolean; attributes?: ErAttribute[] }
export interface ErModel { entities: ErEntity[]; relationships: ErRelationship[] }

/** 1:1, 1:N or M:N, read from the maxima (the side with "many" is the N side). */
export function cardinality(r: Pick<ErRelationship, 'aToB' | 'bToA'>): '1:1' | '1:N' | 'N:1' | 'M:N' {
  return many(r.aToB) ? (many(r.bToA) ? 'M:N' : '1:N') : many(r.bToA) ? 'N:1' : '1:1';
}

/** One sentence per relationship, for the text version of a diagram. */
export function describeRelationship(r: ErRelationship, names: (id: string) => string): string {
  return `${names(r.a)}「${r.name}」${names(r.b)}：每個${names(r.a)}對應${MULTIPLICITY_TEXT[r.aToB]}${names(r.b)}，每個${names(r.b)}對應${MULTIPLICITY_TEXT[r.bToA]}${names(r.a)}（${names(r.a)}對${names(r.b)}為 ${cardinality(r)}）`;
}

// ---- the learner's choices --------------------------------------------------------------------------------------
export type ErRole =
  | { role: 'entity'; weak?: boolean }
  | { role: 'attribute'; of: string; key?: boolean; multivalued?: boolean }
  | { role: 'relationship'; a: string; b: string; aToB: Multiplicity; bToA: Multiplicity; identifying?: boolean }
  | { role: 'none' };
export type ErRoleKind = ErRole['role'];
export const ROLE_TEXT: Record<ErRoleKind, string> = { entity: '實體', attribute: '屬性', relationship: '關係', none: '不需要建模' };
export interface ErTerm { id: string; label: string }

/**
 * The model a set of roles describes. Attributes of an unknown owner and relationships whose ends are not entities are
 * left out (the builder only offers valid owners and ends, so this happens only while the learner is still choosing).
 */
export function buildModel(terms: readonly ErTerm[], roles: Readonly<Record<string, ErRole | undefined>>): ErModel {
  const label = new Map(terms.map(t => [t.id, t.label]));
  const isEntity = (id: string) => roles[id]?.role === 'entity';
  const attributesOf = (owner: string) => terms.flatMap(t => {
    const r = roles[t.id];
    return r?.role === 'attribute' && r.of === owner ? [{ name: t.label, ...(r.key ? { key: true } : {}), ...(r.multivalued ? { multivalued: true } : {}) }] : [];
  });
  return {
    entities: terms.filter(t => isEntity(t.id)).map(t => {
      const r = roles[t.id] as Extract<ErRole, { role: 'entity' }>;
      return { id: t.id, name: t.label, ...(r.weak ? { weak: true } : {}), attributes: attributesOf(t.id) };
    }),
    relationships: terms.flatMap(t => {
      const r = roles[t.id];
      if (r?.role !== 'relationship' || !isEntity(r.a) || !isEntity(r.b)) return [];
      const attributes = attributesOf(t.id);
      return [{ id: t.id, name: label.get(t.id)!, a: r.a, b: r.b, aToB: r.aToB, bToA: r.bToA,
        ...(r.identifying ? { identifying: true } : {}), ...(attributes.length ? { attributes } : {}) }];
    }),
  };
}

// ---- checking -----------------------------------------------------------------------------------------------------
export interface ErTermResult { id: string; ok: boolean; message?: string }

type RelationshipRole = Extract<ErRole, { role: 'relationship' }>;
/**
 * The learner's relationship in the reference's orientation (a ↔ b swapped means swapping the multiplicities too). A
 * relationship of an entity with itself fits either way, so both readings are returned.
 */
function aligned(learner: RelationshipRole, reference: RelationshipRole): RelationshipRole[] {
  const swapped = { ...learner, a: learner.b, b: learner.a, aToB: learner.bToA, bToA: learner.aToB };
  return [learner, swapped].filter(r => r.a === reference.a && r.b === reference.b);
}

/**
 * Term by term: right role, and for an attribute the right owner, key and multivalued marks; for a relationship the
 * right two entities and both multiplicities; for an entity whether it is weak. `accept` lists other roles a term may
 * reasonably have. Messages say what is wrong without giving the answer; `hints` add the lesson's own guidance.
 */
export function checkRoles(terms: readonly ErTerm[], answer: Readonly<Record<string, ErRole>>, learner: Readonly<Record<string, ErRole | undefined>>,
  hints: Readonly<Record<string, string>> = {}, accept: Readonly<Record<string, ErRole[]>> = {}): ErTermResult[] {
  const label = (id: string) => terms.find(t => t.id === id)?.label ?? id;
  return terms.map(({ id, label: name }) => {
    const mine = learner[id];
    const wrong = (what: string) => ({ id, ok: false, message: `「${name}」${what}${hints[id] ? `提示：${hints[id]}` : ''}` });
    if (!mine) return wrong('還沒有選擇角色。');
    const results = [answer[id], ...(accept[id] ?? [])].map(reference => compareRole(mine, reference, label));
    return results.includes(undefined) ? { id, ok: true } : wrong(results[0]!);
  });
}

/** undefined when the roles match; otherwise what differs. */
function compareRole(mine: ErRole, reference: ErRole, label: (id: string) => string): string | undefined {
  if (mine.role !== reference.role) return `的角色不對：它不是「${ROLE_TEXT[mine.role]}」。`;
  switch (reference.role) {
    case 'entity':
      return !!(mine as typeof reference).weak !== !!reference.weak ? (reference.weak ? '是實體沒錯，但它能不能單靠自己的屬性區分彼此？' : '是實體沒錯，但它有自己的鍵，不是弱實體。') : undefined;
    case 'attribute': {
      const m = mine as typeof reference;
      if (m.of !== reference.of) return `是屬性沒錯，但它不是「${label(m.of)}」的屬性。`;
      if (!!m.key !== !!reference.key) return reference.key ? '是屬性沒錯，但它能唯一識別所屬的實體（或在弱實體中區分同一擁有者的各筆資料），要標成鍵。' : '是屬性沒錯，但它不能唯一識別所屬的實體，不是鍵。';
      if (!!m.multivalued !== !!reference.multivalued) return reference.multivalued ? '是屬性沒錯，但一筆資料可以有好幾個值（多值屬性）。' : '是屬性沒錯，但一筆資料只有一個值，不是多值屬性。';
      return undefined;
    }
    case 'relationship': {
      const readings = aligned(mine as typeof reference, reference);
      if (!readings.length) return '是關係沒錯，但連接的兩個實體不對。';
      const m = readings.find(r => r.aToB === reference.aToB && r.bToA === reference.bToA) ?? readings[0];
      if (m.aToB !== reference.aToB || m.bToA !== reference.bToA) {
        const side = m.aToB !== reference.aToB ? [reference.a, reference.b] : [reference.b, reference.a];
        return `連接的實體正確，但「每個${label(side[0])}對應幾個${label(side[1])}」不對：想想最少幾個、最多幾個。`;
      }
      if (!!m.identifying !== !!reference.identifying) return reference.identifying ? '兩端都對，但弱實體要靠這個關係才能識別，它是識別關係。' : '兩端都對，但它不是識別關係（兩邊都能單獨識別）。';
      return undefined;
    }
    case 'none': return undefined;
  }
}

/** The structural rules of a reference model (tested for every lesson): owners and ends exist, every entity has a key. */
export function validateRoles(terms: readonly ErTerm[], answer: Readonly<Record<string, ErRole>>): string[] {
  const problems: string[] = [];
  const role = (id: string) => answer[id]?.role;
  if (new Set(terms.map(t => t.id)).size !== terms.length) problems.push('duplicate term id');
  for (const t of terms) {
    const r = answer[t.id];
    if (!r) { problems.push(`${t.id}: no role`); continue; }
    if (r.role === 'attribute' && role(r.of) !== 'entity' && role(r.of) !== 'relationship') problems.push(`${t.id}: owner ${r.of} is not an entity or relationship`);
    if (r.role === 'relationship' && (role(r.a) !== 'entity' || role(r.b) !== 'entity')) problems.push(`${t.id}: ends must be entities`);
    if (r.role === 'entity' && !terms.some(a => { const x = answer[a.id]; return x?.role === 'attribute' && x.of === t.id && x.key; }))
      problems.push(`${t.id}: an entity needs a key (a weak entity: its partial key)`);
    if (r.role === 'entity' && r.weak && !terms.some(x => { const y = answer[x.id]; return y?.role === 'relationship' && y.identifying && (y.a === t.id || y.b === t.id); }))
      problems.push(`${t.id}: a weak entity needs an identifying relationship`);
  }
  for (const id of Object.keys(answer)) if (!terms.some(t => t.id === id)) problems.push(`${id}: role for an unknown term`);
  return problems;
}

/** Structural rules of a drawn model (examples): unique ids, relationship ends exist, every entity has a key. */
export function validateModel(model: ErModel): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const x of [...model.entities, ...model.relationships]) { if (ids.has(x.id)) problems.push(`duplicate id ${x.id}`); ids.add(x.id); }
  const entities = new Set(model.entities.map(e => e.id));
  for (const r of model.relationships) if (!entities.has(r.a) || !entities.has(r.b)) problems.push(`${r.id}: unknown end`);
  for (const e of model.entities) if (!e.attributes.some(a => a.key)) problems.push(`${e.id}: needs a key`);
  return problems;
}
