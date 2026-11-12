import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum';
import { examStatus, papersOfExam, trialBank } from '@/content/trials';
import { courseTree, islandPreviews, isDisabled, isGroup, labTree, lessonPlace, OVERVIEW_PREVIEW, type NavNode } from '@/lib/nav/site-nav';
import { examTree } from '@/lib/nav/exam-nav';
import { isOpen, parseNav } from '@/components/nav/nav-store';

/* 2026-11-12 unified navigation: every tree is built from the real data, every link has a page, nothing is invented. */
const leaves = (nodes: NavNode[]): NavNode[] => nodes.flatMap(n => isGroup(n) ? leaves(n.children) : [n]);
const hrefs = (nodes: NavNode[]) => leaves(nodes).flatMap(n => 'href' in n ? [n.href] : []);

describe('course tree', () => {
  it('island → level → lesson, every lesson exactly once, in recommended order', () => {
    const tree = courseTree();
    expect(tree.map(g => g.id)).toEqual(['c:foundations', 'c:structures', 'c:algorithms', 'c:databases']);
    expect(hrefs(tree).sort()).toEqual(lessons.map(l => `/curriculum/${l.slug}`).sort());
    for (const island of tree) for (const level of island.children) {
      expect(isGroup(level)).toBe(true);
      const ids = leaves([level]).map(n => (n as { lessonId: string }).lessonId);
      expect(ids).toEqual(lessons.filter(l => ids.includes(l.lessonId)).map(l => l.lessonId));
      expect(new Set(ids.map(id => lessons.find(l => l.lessonId === id)!.difficulty)).size).toBe(1);
    }
  });
  it('a lesson knows its island and level for the breadcrumb', () => {
    expect(lessonPlace('F01')).toMatchObject({ island: { name: '基礎程式島' }, level: '入門', islandHref: '/curriculum#island-foundations' });
    expect(lessonPlace('X99')).toBeUndefined();
  });
});

describe('lab tree', () => {
  it('lists the six labs by category', () => {
    expect(hrefs(labTree()).sort()).toEqual(courses.map(c => `/learn/${c.slug}`).sort());
  });
});

describe('exam tree', () => {
  it('links only exams with a paper, and every paper of them; others are shown as not open', () => {
    const tree = examTree(), all = leaves(tree);
    const examNodes = tree.flatMap(f => f.children);
    expect(examNodes.map(n => n.id.slice(2)).sort()).toEqual(trialBank.exams.map(e => e.id).sort());
    for (const exam of trialBank.exams) {
      const node = examNodes.find(n => n.id === `e:${exam.id}`)!;
      if (examStatus(exam.id) === 'available') {
        expect(isGroup(node)).toBe(true);
        expect(hrefs([node])).toEqual(expect.arrayContaining([`/trials/${exam.id}`, ...papersOfExam(exam.id).map(p => `/trials/${exam.id}/${p.id}`)]));
      } else expect(isDisabled(node)).toBe(true);
    }
    expect(all.filter(n => 'href' in n)).toHaveLength(trialBank.exams.filter(e => examStatus(e.id) === 'available').reduce((n, e) => n + 1 + papersOfExam(e.id).length, 0));
  });
});

describe('island previews', () => {
  it('use the screenshots taken from the 3D map and open the map on that island', () => {
    const previews = islandPreviews();
    expect(Object.keys(previews).sort()).toEqual(['algorithms', 'databases', 'foundations', 'labs', 'structures']);
    for (const p of [...Object.values(previews), OVERVIEW_PREVIEW]) {
      expect(existsSync(`public${p.image}`), p.image).toBe(true);
      expect(p.mapHref).toBe(p.id === 'overview' ? '/' : `/?island=${p.id}`);
    }
    expect(previews.labs.lessonIds).toBeUndefined();
    expect(previews.foundations.lessonIds).toHaveLength(lessons.filter(l => l.islandId === 'foundations').length);
  });
});

describe('sidebar state', () => {
  it('reads only well-formed stored state', () => {
    expect(parseNav(null)).toEqual({ open: [], closed: [] });
    expect(parseNav('not json')).toEqual({ open: [], closed: [] });
    expect(parseNav('{"open":["a",3],"closed":["b"],"collapsed":true}')).toEqual({ open: ['a'], closed: ['b'], collapsed: true });
  });
  it('opens the way to the current page unless the learner closed it, and what they opened', () => {
    const s = { open: ['x'], closed: ['p'] };
    expect(isOpen(s, 'x', false)).toBe(true);
    expect(isOpen(s, 'q', true)).toBe(true);
    expect(isOpen(s, 'p', true)).toBe(false);
    expect(isOpen(s, 'q', false)).toBe(false);
  });
});
