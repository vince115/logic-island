import { describe, expect, it } from 'vitest';
import { catalogLessons, lessonsOfIsland } from '../src/content/world/catalog';
import { lessonNavigation } from '../src/content/world/navigation';
import { lessons } from '../src/content/curriculum';

// Phase F.1b: previous / next stay inside an island; other islands are reached through paths, bridges and the catalog.
describe('lesson navigation (F.1b)', () => {
  it('never crosses islands, and links only lessons that can be opened', () => {
    for (const lesson of lessons.filter(l => l.lessonStatus === 'complete')) {
      const nav = lessonNavigation(lesson.lessonId);
      for (const other of [nav.previous, nav.next]) if (other) {
        expect(other.islandId, lesson.lessonId).toBe(lesson.islandId);
        expect(other.lessonStatus, lesson.lessonId).toBe('complete');
        expect(other.href, lesson.lessonId).toBeDefined();
      }
      if (nav.plannedNext) {
        expect(nav.plannedNext.islandId).toBe(lesson.islandId);
        expect(nav.plannedNext.href).toBeUndefined();
      }
      expect(nav.islandEnd).toBe(!nav.next);
      for (const p of nav.paths) if (p.next) expect(p.next.lessonStatus).toBe('complete');
    }
  });

  it('ends each complete island at its last lesson: no next lesson, the bridges and paths offered instead', () => {
    // Phase F.2: the structures island's bridge to 資料庫應用島 (the home map draws it) is offered at D20 too.
    for (const [last, first, ...bridge] of [['F20', 'F01', 'structures'], ['D20', 'D01', 'algorithms', 'databases'], ['A20', 'A01', 'labs']]) {
      const nav = lessonNavigation(last);
      expect(nav).toMatchObject({ next: undefined, plannedNext: undefined, islandEnd: true, islandComplete: true });
      expect(nav.bridges.map(b => b.id)).toEqual(bridge);
      expect(lessonNavigation(first).previous).toBeUndefined();
    }
    // A20 is the last lesson of path A: there is nothing after it on that path.
    expect(lessonNavigation('A20').paths).toEqual([expect.objectContaining({ id: 'A-apcs-cs-foundations', last: true, next: undefined })]);
    // F20 → D01 is not "the next lesson" any more, but path A still leads there, named as the path's next step.
    expect(lessonNavigation('F20').paths[0].next?.lessonId).toBe('D01');
  });

  it('ends the database island at DB20, now that all 20 lessons are written (F.1d): no next lesson, no other island\'s first lesson', () => {
    const island = lessonsOfIsland('databases');
    expect(island.map(l => l.lessonStatus)).toEqual(Array(20).fill('complete'));
    const nav = lessonNavigation('DB20');
    expect(nav).toMatchObject({ next: undefined, plannedNext: undefined, islandEnd: true, islandComplete: true });
    expect(nav.previous?.lessonId).toBe('DB19');
    expect(lessonNavigation('DB19').next?.lessonId).toBe('DB20');
    expect(lessonNavigation('DB01').previous).toBeUndefined();
    expect(catalogLessons.filter(l => l.islandId === 'databases' && l.href)).toHaveLength(20);
    // Other islands are offered only as bridges or a path's next step, never as "the next lesson".
    for (const b of nav.bridges) expect(b.href).toBeDefined();
    for (const p of nav.paths) if (p.next) expect(p.next.lessonStatus).toBe('complete');
  });

  it('names a planned next lesson without a link (F.1b) and ends a fully written island (PL, batches 1–5)', () => {
    // PL01 leads on to PL02; PL20, written last, ends the island with every lesson open.
    expect(lessonNavigation('PL01').next).toMatchObject({ lessonId: 'PL02', lessonStatus: 'complete', href: '/curriculum/object-oriented-programming' });
    const pl = catalogLessons.filter(l => l.islandId === 'programming-languages');
    expect(pl.every(l => l.lessonStatus === 'complete')).toBe(true);
    expect(lessonNavigation('PL20')).toMatchObject({ next: undefined, plannedNext: undefined, islandEnd: true, islandComplete: true });
    // An outline lesson followed by another outline names it without a link (whichever pair is still planned).
    const at = catalogLessons.findIndex((l, i, all) => l.lessonStatus === 'planned' && all[i + 1]?.islandId === l.islandId && all[i + 1].lessonStatus === 'planned');
    expect(at, 'the catalog still has two outline lessons in a row').toBeGreaterThanOrEqual(0);
    const nav = lessonNavigation(catalogLessons[at].lessonId);
    expect(nav).toMatchObject({ next: undefined, islandEnd: true, islandComplete: false });
    expect(nav.plannedNext).toMatchObject({ lessonId: catalogLessons[at + 1].lessonId, lessonStatus: 'planned' });
    expect(nav.plannedNext?.href).toBeUndefined();
  });
});
