import { describe, expect, it } from 'vitest';
import { islandsHomeWorld } from '../src/lib/islands/islands-world';
import { world } from '../src/content/world';
import { getIslandRecord, isUnlocked, islandRecords, meetsCondition, worldPages, type ProgressView } from '../src/content/world/records';
import { validateIslandLinks } from '../src/content/world/validate';
import type { WorldConfig } from '../src/content/world/types';

// Phase F.0: the data-driven island configuration (entry points, links, unlock rules) and its read helpers.
const clone = (): WorldConfig => structuredClone(world);
const island = (w: WorldConfig, id: string) => w.islands.find(i => i.id === id)!;
const progress = (ids: string[]): ProgressView => ({ lessonCompleted: id => ids.includes(id) });
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

describe('island configuration (F.0)', () => {
  it('passes every entry point, link and unlock rule', () => {
    expect(validateIslandLinks(world, worldPages())).toEqual([]);
  });

  it('opens the existing islands where the site already goes, and gives planned islands no way in', () => {
    expect(island(world, 'foundations').entryPoints.map(e => e.target)).toEqual(['/curriculum#island-foundations', '/curriculum/programs-and-algorithms']);
    expect(island(world, 'labs').entryPoints.map(e => e.target)).toEqual(['/learn']);
    for (const i of world.islands.filter(i => i.status === 'planned')) {
      expect(i.entryPoints, i.id).toEqual([]);
      expect(i.links, i.id).toEqual([]);
    }
  });

  it('declares the same bridges the home map draws, and no others', () => {
    const declared = world.islands.flatMap(i => i.links.filter(l => l.kind === 'bridge').map(l => `${i.id}-${l.to}`)).sort();
    expect(declared).toEqual(islandsHomeWorld.world.bridges.map(b => `${b.from.islandId}-${b.to.islandId}`).sort());
  });

  it('derives each island’s lessons, required islands and activities from the curriculum', () => {
    expect(getIslandRecord('foundations')?.counts).toEqual({ lessons: 20, complete: 20, planned: 0 });
    expect(getIslandRecord('foundations')?.prerequisites).toEqual([]);
    expect(getIslandRecord('algorithms')?.prerequisites).toEqual(['foundations', 'structures']);
    expect(getIslandRecord('large-language-models')?.counts).toEqual({ lessons: 25, complete: 0, planned: 25 });
    const db = getIslandRecord('databases')!;
    // F.1d: all 20 database lessons are written, so the island is complete (derived, not declared).
    expect(db.status).toBe('complete');
    expect(db.counts).toEqual({ lessons: 20, complete: 20, planned: 0 });
    expect(getIslandRecord('databases')?.activities).toContain('sql-playground');
    // The agent island leans on LLM and engineering islands, not on Machine Learning or Deep Learning.
    expect(getIslandRecord('ai-agents')?.prerequisites).not.toContain('machine-learning');
    expect(getIslandRecord('ai-agents')?.prerequisites).not.toContain('deep-learning');
    expect(getIslandRecord('labs')).toMatchObject({ counts: { lessons: 0, complete: 0, planned: 0 }, prerequisites: [] });
    expect(islandRecords.reduce((n, r) => n + r.counts.lessons, 0)).toBe(320);
  });

  it('evaluates unlock rules against progress it is given, and never locks a subject island', () => {
    const f = ids('F', 20);
    expect(meetsCondition({ completedLessons: ['F01', 'F02'] }, progress(['F01']))).toBe(false);
    expect(meetsCondition({ completedLessons: ['F01', 'F02'] }, progress(['F01', 'F02']))).toBe(true);
    expect(meetsCondition({ completedIslands: ['foundations'] }, progress(f))).toBe(true);
    expect(meetsCondition({ completedIslands: ['foundations'] }, progress(f.slice(1)))).toBe(false);
    // A planned island cannot be completed, whatever the progress says; the database island can since F.1d.
    expect(meetsCondition({ completedIslands: ['networks'] }, progress(ids('CN', 20)))).toBe(false);
    expect(meetsCondition({ completedIslands: ['databases'] }, progress(ids('DB', 20)))).toBe(true);
    expect(meetsCondition({ completedIslands: ['databases'] }, progress(ids('DB', 19)))).toBe(false);
    expect(meetsCondition({ any: [{ completedLessons: ['A20'] }, { all: [{ completedLessons: ['F01'] }, { completedIslands: ['foundations'] }] }] }, progress(f))).toBe(true);
    for (const i of world.islands) expect(isUnlocked(i, progress([])), i.id).toBe(true);
  });

  it('catches a way into a planned island, a bridge to one, a missing page and a locked subject island', () => {
    const entry = clone(); island(entry, 'networks').entryPoints = [{ id: 'syllabus', label: '課綱', target: '/curriculum#island-networks' }];
    expect(validateIslandLinks(entry, worldPages()).join('\n')).toMatch(/networks: a planned island has no entry point/);
    expect(validateIslandLinks(entry, worldPages()).join('\n')).toMatch(/leads to \/curriculum#island-networks, which does not exist/);
    const bridge = clone(); island(bridge, 'algorithms').links.push({ to: 'programming-languages', kind: 'bridge' });
    expect(validateIslandLinks(bridge, worldPages()).join('\n')).toMatch(/bridge to programming-languages: planned islands are not on the map/);
    const page = clone(); island(page, 'structures').entryPoints.push({ id: 'pl', label: 'PL', target: '/curriculum/programming-paradigms' });
    expect(validateIslandLinks(page, worldPages()).join('\n')).toMatch(/programming-paradigms, which does not exist/);
    const locked = clone(); island(locked, 'structures').unlock = { completedIslands: ['foundations'] };
    expect(validateIslandLinks(locked, worldPages()).join('\n')).toMatch(/structures: subject islands are never locked/);
    const unknown = clone(); island(unknown, 'labs').unlock = { completedLessons: ['F99' as 'F01'] };
    expect(validateIslandLinks(unknown, worldPages()).join('\n')).toMatch(/labs: unlock names unknown lesson F99/);
  });
});
