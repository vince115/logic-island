import { describe, expect, it } from 'vitest';
import { lessons } from '../src/content/curriculum';
import { catalogLessons } from '../src/content/world/catalog';
import { islands as curriculumIslands } from '../src/content/curriculum/registry';
import { databaseIsland, islands as mapIslands, labIsland } from '../src/lib/islands/data';
import { getIsland, islandOfLesson, islandsInRegion, labIslandConfig, orderedRegions, regionStatus, subjectIslands, taxonomy, world } from '../src/content/world';
import { LESSON_PREFIXES, formatLessonId, isLessonId, parseLessonId } from '../src/content/world/lesson-id';
import planning from '../src/content/world/planning-data.json';
import { validateWorld, type WorldLesson } from '../src/content/world/validate';
import type { WorldConfig } from '../src/content/world/types';

// Phase F.0: regions, islands and lesson IDs of the whole plan (src/content/world), with the 60 lessons unchanged.
const ALL: WorldLesson[] = catalogLessons;
const DECLARED = subjectIslands.reduce((n, i) => n + i.lessonCount, 0);
const DB_OPEN = lessons.filter(l => l.islandId === 'databases').length;
const clone = (): WorldConfig => structuredClone(world);

describe('lesson IDs (F.0)', () => {
  it('reads an ID with its whole prefix, never its first letter', () => {
    expect(parseLessonId('DB01')).toEqual({ prefix: 'DB', number: 1 });
    expect(parseLessonId('DL01')).toEqual({ prefix: 'DL', number: 1 });
    expect(parseLessonId('AIF01')).toEqual({ prefix: 'AIF', number: 1 });
    expect(parseLessonId('AG01')).toEqual({ prefix: 'AG', number: 1 });
    expect(parseLessonId('D01')).toEqual({ prefix: 'D', number: 1 });
    expect(parseLessonId('A01')).toEqual({ prefix: 'A', number: 1 });
    expect(parseLessonId('ML25')).toEqual({ prefix: 'ML', number: 25 });
    expect(islandOfLesson('DB01')?.id).toBe('databases');
    expect(islandOfLesson('DL01')?.id).toBe('deep-learning');
    expect(islandOfLesson('AIF01')?.id).toBe('ai-foundations');
    expect(islandOfLesson('AG01')?.id).toBe('ai-agents');
    expect(islandOfLesson('D01')?.id).toBe('structures');
    expect(islandOfLesson('A01')?.id).toBe('algorithms');
    // Multi-archipelago v2: the new prefixes share first letters with old ones and still resolve by the whole prefix.
    expect(parseLessonId('FE01')).toEqual({ prefix: 'FE', number: 1 });
    expect(parseLessonId('DSY01')).toEqual({ prefix: 'DSY', number: 1 });
    expect(islandOfLesson('FE01')?.id).toBe('frontend');
    expect(islandOfLesson('F01')?.id).toBe('foundations');
    expect(islandOfLesson('DSY12')?.id).toBe('design-systems');
    expect(islandOfLesson('UI10')?.id).toBe('ui-design');
    expect(islandOfLesson('UX01')?.id).toBe('ux-research');
    expect(islandOfLesson('IXD14')?.id).toBe('interaction-design');
    expect(islandOfLesson('WEB01')?.id).toBe('web-foundations');
    expect(islandOfLesson('RWD12')?.id).toBe('responsive-design');
    expect(islandOfLesson('MOB13')?.id).toBe('mobile-apps');
    for (const id of ['FE1', 'F1E01', 'DSY', 'UIX01', 'WE01']) expect(parseLessonId(id), id).toBeUndefined();
  });

  it('rejects anything that is not exactly a prefix and two digits', () => {
    for (const id of ['', 'D1', 'DB001', 'X01', 'F00', 'db01', 'DBB01', 'D01 ', 'AIF', '01', 'DSA01', 'DS01', 'AL01'])
      expect(parseLessonId(id), id).toBeUndefined();
    expect(isLessonId('OPS20')).toBe(true);
    expect(formatLessonId('LLM', 7)).toBe('LLM07');
  });

  it('resolves every ID of the plan to its own island', () => {
    expect(ALL).toHaveLength(DECLARED);
    expect(new Set(ALL.map(l => l.lessonId)).size).toBe(DECLARED);
    for (const lesson of ALL) expect(islandOfLesson(lesson.lessonId)?.id, lesson.lessonId).toBe(lesson.islandId);
  });
});

describe('world registry (F.0)', () => {
  it('passes every rule', () => {
    expect(validateWorld(world, ALL)).toEqual([]);
  });

  /*
   * Multi-archipelago v2 (P1a): the taxonomy contract. The validator no longer knows any total; this is the one place
   * that pins them, together with docs/planning/ISLAND_TAXONOMY.md §1. Change both on purpose, with the approval that
   * changed the plan named in the commit.
   */
  it('pins the approved taxonomy: regions in order, their islands and planned lessons', () => {
    // 2026-11-12 (D2, D3): design and web join with 4 islands each; 23 subject islands, 431 planned lessons.
    expect(taxonomy()).toEqual([
      { region: 'cs', islands: 8, lessons: 160 },
      { region: 'ai', islands: 7, lessons: 160 },
      { region: 'design', islands: 4, lessons: 56 },
      { region: 'web', islands: 4, lessons: 55 },
    ]);
    expect(subjectIslands).toHaveLength(23);
    expect(DECLARED).toBe(431);
    expect(islandsInRegion('design').map(i => [i.code, i.lessonCount])).toEqual([['UI', 15], ['UX', 15], ['IXD', 14], ['DSY', 12]]);
    expect(islandsInRegion('web').map(i => [i.code, i.lessonCount])).toEqual([['WEB', 15], ['FE', 15], ['RWD', 12], ['MOB', 13]]);
  });

  it('names the regions as approved and groups the seven AI islands without splitting one (multi-archipelago v2)', () => {
    expect(orderedRegions.map(r => [r.id, r.name])).toEqual([
      ['cs', '程式與資訊群島'], ['ai', 'AI 人工智慧群島'], ['design', '數位設計群島'], ['web', '網頁與應用開發群島']]);
    const groups = orderedRegions.find(r => r.id === 'ai')!.groups!;
    expect(groups.map(g => g.label)).toEqual(['AI 原理與模型', '生成式 AI 與大型語言模型', 'AI 應用與系統工程']);
    expect(groups.flatMap(g => g.islandIds).sort()).toEqual(islandsInRegion('ai').map(i => i.id).sort());
    expect(islandsInRegion('ai').map(i => i.code)).toEqual(['AIF', 'ML', 'DL', 'LLM', 'GEN', 'AG', 'OPS']);
  });

  it('keeps the CS and AI islands, their codes and lesson counts, and 1 shared lab island', () => {
    expect(orderedRegions.map(r => r.id).slice(0, 2)).toEqual(['cs', 'ai']);
    expect(islandsInRegion('cs').map(i => i.code)).toEqual(['F', 'DS', 'AL', 'PL', 'DB', 'CN', 'SA', 'MIS']);
    expect(islandsInRegion('ai').map(i => i.code)).toEqual(['AIF', 'ML', 'DL', 'LLM', 'GEN', 'AG', 'OPS']);
    expect(islandsInRegion('ai').map(i => i.lessonCount)).toEqual([20, 25, 25, 25, 20, 25, 20]);
    expect(subjectIslands.map(i => i.lessonPrefix).sort()).toEqual([...LESSON_PREFIXES].sort());
    expect(labIslandConfig).toMatchObject({ kind: 'tool', lessonCount: 0, status: 'available', code: 'LAB' });
    expect(labIslandConfig.regionId).toBeUndefined();
    expect(labIslandConfig.order).toBeUndefined();
    expect(labIslandConfig.labs).toEqual(['array', 'stack', 'queue', 'binary-search', 'bubble-sort', 'bfs']);
  });

  it('marks the three existing islands and the database island (written to the end in F.1d) complete, and the other nineteen planned', () => {
    expect(subjectIslands.filter(i => i.status === 'complete').map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'databases']);
    expect(subjectIslands.filter(i => i.status === 'available').map(i => i.id)).toEqual([]);
    expect(subjectIslands.filter(i => i.status === 'planned')).toHaveLength(19);
    expect(regionStatus('design')).toBe('planned');
    expect(regionStatus('web')).toBe('planned');
    for (const island of subjectIslands.filter(i => i.status === 'planned')) expect(island.entryPoints, island.id).toEqual([]);
    expect(getIsland('databases')?.entryPoints.map(e => e.target)).toEqual(['/curriculum#island-databases', '/curriculum/database-concepts']);
    expect(DB_OPEN).toBeGreaterThan(0);
  });

  it('takes the planned islands from the planning data and keeps the existing islands as the map shows them', () => {
    for (const [id, island] of Object.entries(planning.islands))
      expect(getIsland(id), id).toMatchObject({ code: island.code, regionId: island.regionId, name: island.name, nameEn: island.nameEn, description: island.description });
    for (const island of [...mapIslands, labIsland, databaseIsland]) {
      expect(getIsland(island.id)?.name, island.id).toBe(island.name);
      expect(getIsland(island.id)?.theme, island.id).toEqual({ accent: island.accent, landmark: island.landmark });
    }
  });

  it('gives the curriculum the same three islands as before, then the database island (F.1a)', () => {
    expect(curriculumIslands.map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'databases']);
    expect(curriculumIslands[3]).toMatchObject({ name: '資料庫應用島', englishName: 'Database Applications', summary: planning.islands.databases.description });
    expect(curriculumIslands.slice(0, 3)).toEqual([
      { id: 'foundations', name: '基礎程式島', englishName: 'Programming Fundamentals', summary: '從第一支程式到遞迴與複雜度：變數、輸入輸出、條件、迴圈、陣列、字串與函式。' },
      { id: 'structures', name: '資料結構島', englishName: 'Data Structures', summary: '資料怎麼放，決定程式能多快：陣列、鏈結串列、堆疊、佇列、雜湊、樹、堆積與圖。' },
      { id: 'algorithms', name: '演算法島', englishName: 'Algorithms', summary: '從分析到設計：搜尋、排序、雙指標、遞迴、貪心、圖論與動態規劃，最後對應 APCS 實作題型。' },
    ]);
  });

  it('catches a lesson filed under the island of a shorter prefix', () => {
    const moved = ALL.map(l => l.lessonId === 'DB01' ? { ...l, islandId: 'structures' } : l);
    expect(validateWorld(world, moved).join('\n')).toMatch(/DB01: prefix DB belongs to databases, not structures/);
    const dl = ALL.map(l => l.lessonId === 'DL01' ? { ...l, lessonId: 'D21' } : l);
    expect(validateWorld(world, dl).join('\n')).toMatch(/deep-learning: lessons must be DL01..DL25/);
  });

  it('catches wrong counts, duplicate codes, a numbered lab island and a status its lessons contradict', () => {
    const fewer = clone(); fewer.islands = fewer.islands.filter(i => i.id !== 'ai-agents');
    expect(validateWorld(fewer, ALL).join('\n')).toMatch(/subject islands must use each lesson prefix once/);
    expect(validateWorld(fewer, ALL).join('\n')).toMatch(/AG01: prefix AG belongs to undefined, not ai-agents/);
    const dup = clone(); dup.islands.find(i => i.id === 'databases')!.code = 'DS';
    expect(validateWorld(dup, ALL).join('\n')).toMatch(/island code: duplicate DS/);
    const numbered = clone(); numbered.islands.find(i => i.kind === 'tool')!.order = 9;
    expect(validateWorld(numbered, ALL).join('\n')).toMatch(/labs: a tool island has no region, order, prefix or lessons/);
    const status = clone(); status.islands.find(i => i.id === 'ai-agents')!.status = 'complete';
    expect(validateWorld(status, ALL).join('\n')).toMatch(/ai-agents: status is complete but its lessons make it planned/);
    const db = clone(); db.islands.find(i => i.id === 'databases')!.status = 'available';
    expect(validateWorld(db, ALL).join('\n')).toMatch(/databases: status is available but its lessons make it complete/);
    const count = clone(); count.islands.find(i => i.id === 'machine-learning')!.lessonCount = 20;
    expect(validateWorld(count, ALL).join('\n')).toMatch(/machine-learning: lessons must be ML01..ML20 in order/);
    expect(validateWorld(count, ALL).join('\n')).toMatch(new RegExp(`the islands declare ${DECLARED - 5} lessons, the catalog holds ${DECLARED}`));
  });

  it('orders regions by their declared order, never by their ID (multi-archipelago v2)', () => {
    expect(orderedRegions.map(r => r.order)).toEqual([...orderedRegions.map(r => r.order)].sort((a, b) => a - b));
    expect(catalogLessons[0].lessonId).toBe('F01');
    const swapped = clone(); swapped.regions.find(r => r.id === 'ai')!.order = 1;
    expect(validateWorld(swapped, ALL).join('\n')).toMatch(/region order: duplicate 1/);
    const zero = clone(); zero.regions[0].order = 0;
    expect(validateWorld(zero, ALL).join('\n')).toMatch(/cs: order must be a positive integer/);
    const missing = clone(); missing.regions = missing.regions.filter(r => r.id !== 'ai');
    expect(validateWorld(missing, ALL).join('\n')).toMatch(/expected one entry per region/);
  });

  it('derives a region\'s status from its islands', () => {
    expect(regionStatus('cs')).toBe('available');
    expect(regionStatus('ai')).toBe('planned');
  });

  it('checks navigation groups: whole islands of their own region, each in one group at most', () => {
    const ok = clone(); ok.regions.find(r => r.id === 'ai')!.groups = [{ id: 'core', label: '原理', islandIds: ['ai-foundations', 'machine-learning'] }];
    expect(validateWorld(ok, ALL)).toEqual([]);
    const cross = clone(); cross.regions.find(r => r.id === 'ai')!.groups = [{ id: 'core', label: '原理', islandIds: ['foundations'] }];
    expect(validateWorld(cross, ALL).join('\n')).toMatch(/ai\/core: foundations belongs to cs, not ai/);
    const twice = clone(); twice.regions.find(r => r.id === 'ai')!.groups = [
      { id: 'a', label: 'A', islandIds: ['ai-agents'] }, { id: 'b', label: 'B', islandIds: ['ai-agents'] }];
    expect(validateWorld(twice, ALL).join('\n')).toMatch(/ai\/b: ai-agents is in more than one group/);
    const unknown = clone(); unknown.regions.find(r => r.id === 'ai')!.groups = [{ id: 'Bad Id', label: '', islandIds: ['nowhere'] }];
    const problems = validateWorld(unknown, ALL).join('\n');
    expect(problems).toMatch(/group id is not kebab-case/);
    expect(problems).toMatch(/empty label/);
    expect(problems).toMatch(/unknown subject island nowhere/);
  });
});
