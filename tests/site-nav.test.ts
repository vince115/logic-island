import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum';
import { examStatus, papersOfExam, trialBank } from '@/content/trials';
import { courseTree, islandPreviews, isDisabled, isGroup, labTree, lessonPlace, OVERVIEW_PREVIEW, type NavNode } from '@/lib/nav/site-nav';
import { CONTENT_STATUS_LABELS, catalogLessons, contentStatusOf } from '@/content/world/catalog';
import { examTree } from '@/lib/nav/exam-nav';
import { isOpen, parseNav } from '@/components/nav/nav-store';

/* 2026-11-12 unified navigation: every tree is built from the real data, every link has a page, nothing is invented. */
const leaves = (nodes: NavNode[]): NavNode[] => nodes.flatMap(n => isGroup(n) ? leaves(n.children) : [n]);
const hrefs = (nodes: NavNode[]) => leaves(nodes).flatMap(n => 'href' in n ? [n.href] : []);

describe('course tree', () => {
  // Multi-archipelago v2 (P2): region → (AI navigation group) → island → level → lesson.
  const tree = courseTree();
  const islandsOf = (nodes: NavNode[]): NavNode[] => nodes.flatMap(n => isGroup(n) && n.kind === 'island' ? [n] : isGroup(n) ? islandsOf(n.children) : []);

  it('starts at the five regions in their order, with the AI islands under their three groups', () => {
    expect(tree.map(g => [g.id, g.label])).toEqual([['c:r:cs', '程式與資訊群島'], ['c:r:ai', 'AI 人工智慧群島'], ['c:r:design', '數位設計群島'], ['c:r:web', '網頁與應用開發群島'],
      ['c:r:sys', '系統與雲端工程群島']]);
    expect(tree.map(g => islandsOf([g]).length)).toEqual([8, 7, 4, 4, 6]);
    const ai = tree[1];
    expect(ai.children.map(n => n.label)).toEqual(['AI 原理與模型', '生成式 AI 與大型語言模型', 'AI 應用與系統工程']);
    expect(islandsOf(ai.children).map(n => n.id)).toEqual(['c:ai-foundations', 'c:machine-learning', 'c:deep-learning', 'c:large-language-models', 'c:generative-ai', 'c:ai-agents', 'c:ai-engineering']);
    // The written islands keep their group ids, so a learner's remembered open/closed state still applies.
    expect(islandsOf([tree[0]]).map(n => n.id).slice(0, 3)).toEqual(['c:foundations', 'c:structures', 'c:algorithms']);
  });

  it('links every published lesson exactly once, by level and in recommended order', () => {
    expect(hrefs(tree).sort()).toEqual(lessons.map(l => `/curriculum/${l.slug}`).sort());
    for (const island of islandsOf(tree)) for (const level of (island as { children: NavNode[] }).children.filter(isGroup)) {
      const ids = leaves([level]).map(n => (n as { lessonId: string }).lessonId);
      expect(ids).toEqual(lessons.filter(l => ids.includes(l.lessonId)).map(l => l.lessonId));
      expect(new Set(ids.map(id => lessons.find(l => l.lessonId === id)!.difficulty)).size).toBe(1);
    }
  });

  it('shows every planned lesson as 規劃中 and never links one (no 404 from the sidebar)', () => {
    const all = leaves(tree), planned = catalogLessons.filter(l => l.lessonStatus !== 'complete');
    expect(all).toHaveLength(catalogLessons.length);
    const disabled = all.filter(isDisabled);
    expect(disabled.map(n => n.code).sort()).toEqual(planned.map(l => l.lessonId).sort());
    for (const n of disabled) { expect(n.disabled).toBe('規劃中'); expect(n).not.toHaveProperty('href'); }
  });

  it('a lesson knows its region, island and level for the breadcrumb', () => {
    expect(lessonPlace('F01')).toMatchObject({ region: { id: 'cs', name: '程式與資訊群島' }, regionHref: '/curriculum#region-cs', island: { name: '基礎程式島' }, level: '入門', islandHref: '/curriculum#island-foundations' });
    expect(lessonPlace('X99')).toBeUndefined();
  });
});

describe('content status (multi-archipelago v2)', () => {
  it('separates what is built (published, in development, planned) from what a learner did', () => {
    expect(contentStatusOf({ lessonId: 'F01', lessonStatus: 'complete' })).toBe('published');
    expect(contentStatusOf({ lessonId: 'UI10', lessonStatus: 'planned' })).toBe('planned');
    // A lesson the curriculum holds but has not completed is being written, still without a page.
    expect(contentStatusOf({ lessonId: 'F01', lessonStatus: 'planned' })).toBe('in-development');
    expect(CONTENT_STATUS_LABELS).toEqual({ planned: '規劃中', 'in-development': '製作中', published: '已開放' });
    expect(catalogLessons.filter(l => contentStatusOf(l) === 'published')).toHaveLength(lessons.length);
  });
});

describe('lab tree', () => {
  it('lists every lab by learning domain: the six algorithm labs, the implemented tool labs, planned ones without a link', () => {
    const tree = labTree();
    expect(tree.map(g => g.label)).toEqual(['資料結構', '演算法', 'UI／UX', '網頁設計', '行動裝置設計', 'AI', '系統與雲端']);
    expect(hrefs(tree).sort()).toEqual([...courses.map(c => `/learn/${c.slug}`), '/learn/color-contrast'].sort());
    expect(leaves(tree).filter(isDisabled).map(n => n.label)).toContain('Responsive Layout Playground');
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
    // Each card says which level its picture stands for, so the lab island's picture is never read as a subject island.
    expect(previews.labs.level).toBe('tool');
    expect(previews.foundations).toMatchObject({ level: 'island', region: '程式與資訊群島' });
    expect(OVERVIEW_PREVIEW.level).toBe('world');
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
