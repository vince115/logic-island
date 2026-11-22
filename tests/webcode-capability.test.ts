import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { mobileFromBlueprint, responsiveFromBlueprint, webFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, LESSON_CAPABILITIES, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { publishProblems } from '@/lib/curriculum/publish-gate';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import { validateTerminalLessonsFirst } from './support/terminal-replays';
import { webContent } from './support/webcode-fixture';

/*
 * WEB-0: the web-code capability and the web-foundations island (prepared for authoring in WEB-0, a curriculum island
 * since WEB-1). A synthetic web lesson built from the blueprint validates with pages and exercises; web-code content
 * needs the web-code capability and the reverse; no other capability or island's lesson changes. Whether pages behave as stated is tests/webcode-runner.test.ts and tests/curriculum-webcode.test.ts.
 */
const outline = webFromBlueprint('WEB02', '寫出結構正確的 HTML 文件並用語意元素安排內容（測試用大綱）。', 45);
const meta: LessonMeta = {
  lessonId: 'WEB02', islandId: 'web-foundations', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
  lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
};
const section = (id: string, example?: string) => ({ id, title: id, blocks: [
  { type: 'p' as const, text: '一份 HTML 文件由文件結構（doctype、html、head、body）與內容組成；語意元素說明每一塊內容是什麼，標題層級排出大綱，地標區域讓人快速找到主要內容。' },
  ...example ? [{ type: 'example' as const, id: example }] : []] });
const question = (n: number) => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['header', 'main', 'footer'], answer: n % 3,
  explanation: '`main` 放頁面獨有的主要內容，一頁只有一個；`header` 與 `footer` 分別是開頭與結尾的地標區域。',
  ...(n === 1 ? { code: { language: 'HTML' as const, text: '<main>\n  <h1>標題</h1>\n</main>' } } : {}) });
const content = (): LessonContent => ({
  lessonId: 'WEB02', motivation: '結構正確、語意清楚的 HTML，是樣式、互動與無障礙的共同基礎。',
  sections: [section('s1', 'structure'), section('s2', 'styled'), section('s3', 'counter')], examples: [], exercises: [],
  quiz: [1, 2, 3, 4].map(question), webCode: webContent(),
});
const swap = (id: string, patch: Partial<LessonMeta>) => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === id ? { ...l, ...patch } : l) }).join('\n');

// This file validates the whole curriculum several times: replay each terminal lesson once first (see the helper).
validateTerminalLessonsFirst();

describe('the web-code capability', () => {
  it('validates a web lesson built from the blueprint with pages and exercises, and it passes the publish gate', () => {
    expect(meta).toMatchObject({ activity: 'dom-explorer', capabilities: ['web-code'], visualizationType: 'none' });
    expect(LESSON_CAPABILITIES).toContain('web-code');
    expect(LESSON_ACTIVITIES).toContain('dom-explorer');
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
    expect(publishProblems(meta, content())).toEqual([]);
  });
  it('counts pages as examples and web exercises as exercises, and reports their problems with the lesson id', () => {
    const few = content(); few.webCode!.examples.pop(); few.sections[2] = section('s3');
    expect(validateContent(meta, few, curriculum.visualizations)).toContain('WEB02: needs at least 3 examples');
    const none = content(); none.webCode!.exercises = [];
    expect(validateContent(meta, none, curriculum.visualizations)).toContain('WEB02: needs at least one exercise');
    const bad = content();
    bad.webCode!.examples[0].observe = [{ do: 'click', selector: 'h1' }];
    bad.webCode!.exercises[0].hints = [];
    bad.webCode!.exercises[1].solution = bad.webCode!.exercises[1].starter;
    bad.sections = bad.sections.slice(1).concat(section('s4'));
    const problems = validateContent(meta, bad, curriculum.visualizations).join('\n');
    expect(problems).toMatch(/WEB02: example structure needs at least one check/);
    expect(problems).toMatch(/WEB02: exercise heading needs a statement and hints/);
    expect(problems).toMatch(/WEB02: exercise badge: the solution is the starter/);
    expect(problems).toMatch(/WEB02: example structure is never shown/);
  });
  it('lets a web lesson\'s quiz show HTML, CSS and JavaScript snippets, and nothing else', () => {
    for (const language of ['HTML', 'CSS', 'JavaScript'] as const) {
      const c = content(); c.quiz[0].code = { language, text: 'x' };
      expect(validateContent(meta, c, curriculum.visualizations), language).toEqual([]);
    }
    for (const language of ['SQL', 'Python'] as const) {
      const c = content(); c.quiz[0].code = { language, text: 'x' };
      expect(validateContent(meta, c, curriculum.visualizations), language).toContain('WEB02: quiz q1: a web-code lesson shows HTML, CSS, JavaScript snippets only');
    }
    // Other lessons without program code keep showing SQL only.
    const db01 = lessons.find(l => l.lessonId === 'DB01')!, c = structuredClone(curriculum.contents.DB01!);
    c.quiz[0].code = { language: 'HTML', text: '<p>x</p>' };
    expect(validateContent(db01, c, curriculum.visualizations)).toContain(`DB01: quiz ${c.quiz[0].id}: a database lesson shows SQL snippets only`);
  });
  it('maps the blueprint activities: dom-explorer stays, the other activities use pages, the capstone adds its stages', () => {
    expect(webFromBlueprint('WEB05', 's', 50)).toMatchObject({ activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none', blueprintId: 'WEB05' });
    // WEB-4: WEB11 (fetch) is taught on pages with a pretend server, like the others.
    for (const id of ['WEB01', 'WEB10', 'WEB11', 'WEB12', 'WEB13', 'WEB14']) expect(webFromBlueprint(id, 's', 40), id).toMatchObject({ activity: 'dom-explorer', capabilities: ['web-code'], visualization: 'none' });
    expect(webFromBlueprint('WEB15', 's', 120)).toMatchObject({ activity: 'challenge-stages', capabilities: ['web-code', 'visualization'], visualization: 'challenge-stages' });
    expect(() => webFromBlueprint('CN01', 's', 40)).toThrow(/not a web foundations lesson/);
    // The outline is the blueprint's: title, objectives and prerequisites cannot drift.
    expect(webFromBlueprint('WEB08', 's', 50)).toMatchObject({ title: 'JavaScript 與 DOM：選取與修改', prerequisites: ['WEB02', 'F13'] });
  });
});

describe('isolation from the other capabilities', () => {
  it('ties web-code content to the web-code capability, both ways', () => {
    const db16 = lessons.find(l => l.lessonId === 'DB16')!;
    expect(validateContent(db16, { ...curriculum.contents.DB16!, webCode: webContent() }, curriculum.visualizations))
      .toContain('DB16: has web-code content without the web-code capability');
    const { webCode: _, ...without } = content();
    void _;
    expect(validateContent(meta, without, curriculum.visualizations)).toContain('WEB02: the web-code capability needs its content');
    expect(validateContent({ ...meta, capabilities: ['network-protocol'], activity: 'packet-journey' }, content(), curriculum.visualizations))
      .toContain('WEB02: has web-code content without the web-code capability');
  });
  it('ties dom-explorer to the web-code capability', () => {
    expect(swap('DB16', { activity: 'dom-explorer' })).toMatch(/DB16: activity dom-explorer needs the web-code capability/);
    expect(swap('LNX03', { activity: 'dom-explorer' })).toMatch(/LNX03: activity dom-explorer needs the web-code capability/);
  });
  it('keeps every other lesson as it was and the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
    // WEB-1: only the web foundations island's lessons use the web-code capability; RWD-1: and the responsive design island's.
    for (const l of lessons) {
      const web = l.islandId === 'web-foundations' || l.islandId === 'responsive-design' || l.islandId === 'mobile-apps';
      expect(l.capabilities.includes('web-code'), l.lessonId).toBe(web);
      // WEB15 is the capstone: its activity is challenge-stages.
      expect(l.activity === 'dom-explorer', l.lessonId).toBe(web && l.lessonId !== 'WEB15' && l.lessonId !== 'RWD12' && l.lessonId !== 'MOB13');
      expect(!!curriculum.contents[l.lessonId]?.webCode, l.lessonId).toBe(web);
    }
  });
});

describe('the web-foundations island: prepared in WEB-0, written in batches from WEB-1', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('web-foundations');
    expect(ISLAND_PREFIX['web-foundations']).toBe('WEB');
    expect(ISLAND_IDS).toContain('web-foundations');
    const written = lessons.filter(l => l.islandId === 'web-foundations');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `WEB${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(4);
    expect(UNITS['web-foundations'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    expect(lessonsOfIsland('web-foundations')).toHaveLength(15);
    expect(lessonsOfIsland('web-foundations').slice(written.length).every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('web-foundations')).toMatchObject({ status: written.length < 15 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('accepts the synthetic web lesson only in its own place', () => {
    // WEB02 is written: a second lesson with the same id is refused.
    expect(validateCurriculum({ ...curriculum, lessons: [...lessons, meta], contents: { ...curriculum.contents, WEB02: content() } }).join('\n')).not.toBe('');
  });
});

describe('the responsive-design island: written in batches from RWD-1 on the web-code capability', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('responsive-design');
    expect(ISLAND_PREFIX['responsive-design']).toBe('RWD');
    expect(ISLAND_IDS).toContain('responsive-design');
    const written = lessons.filter(l => l.islandId === 'responsive-design');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `RWD${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(4);
    expect(UNITS['responsive-design'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    expect(lessonsOfIsland('responsive-design')).toHaveLength(12);
    expect(lessonsOfIsland('responsive-design').slice(written.length).every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('responsive-design')).toMatchObject({ status: written.length < 12 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('reads every outline of the island from the blueprint: pages in a lesson, the capstone in stages', () => {
    const shapes = Array.from({ length: 12 }, (_, i) => responsiveFromBlueprint(`RWD${String(i + 1).padStart(2, '0')}`, '測試用大綱。', 45));
    expect(shapes.slice(0, 11).every(o => o.activity === 'dom-explorer' && o.capabilities.join() === 'web-code' && o.visualization === 'none')).toBe(true);
    expect([shapes[11].activity, shapes[11].capabilities, shapes[11].visualization]).toEqual(['challenge-stages', ['web-code', 'visualization'], 'challenge-stages']);
    expect(shapes[0].prerequisites).toEqual(['WEB06']);
    // An island's builder takes only its own lessons.
    expect(() => responsiveFromBlueprint('WEB06', 'x', 45)).toThrow(/WEB06 is not a responsive design lesson/);
    expect(() => webFromBlueprint('RWD01', 'x', 45)).toThrow(/RWD01 is not a web foundations lesson/);
  });
  it('uses the width features in every lesson: a preview with widths and an exercise checked after a resize', () => {
    for (const l of lessons.filter(l => l.islandId === 'responsive-design')) {
      const web = curriculum.contents[l.lessonId]!.webCode!;
      expect([...web.examples, ...web.exercises].some(x => x.widths?.length), `${l.lessonId} widths`).toBe(true);
      expect(web.exercises.some(x => x.steps.some(s => 'do' in s && s.do === 'resize')), `${l.lessonId} resize`).toBe(true);
    }
  });
});

describe('the mobile-apps island: written in batches from MOB-1 on the web-code capability', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(ISLAND_PREFIX['mobile-apps']).toBe('MOB');
    expect(ISLAND_IDS).toContain('mobile-apps');
    const written = lessons.filter(l => l.islandId === 'mobile-apps');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `MOB${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(4);
    expect(UNITS['mobile-apps'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    expect(lessonsOfIsland('mobile-apps')).toHaveLength(13);
    expect(lessonsOfIsland('mobile-apps').slice(written.length).every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('mobile-apps')).toMatchObject({ status: written.length < 13 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('reads every outline of the island from the blueprint: analysis lessons are taught on pages too, the capstone in stages', () => {
    const shapes = Array.from({ length: 13 }, (_, i) => mobileFromBlueprint(`MOB${String(i + 1).padStart(2, '0')}`, '測試用大綱。', 45));
    expect(shapes.slice(0, 12).every(o => o.activity === 'dom-explorer' && o.capabilities.join() === 'web-code' && o.visualization === 'none')).toBe(true);
    expect([shapes[12].activity, shapes[12].capabilities]).toEqual(['challenge-stages', ['web-code', 'visualization']]);
    expect(() => mobileFromBlueprint('RWD01', 'x', 45)).toThrow(/RWD01 is not a mobile apps lesson/);
    expect(() => responsiveFromBlueprint('MOB01', 'x', 45)).toThrow(/MOB01 is not a responsive design lesson/);
  });
  it('lays its pages out for a phone: every lesson has an exercise checked in a 360 by 640 viewport', () => {
    for (const l of lessons.filter(l => l.islandId === 'mobile-apps')) {
      const web = curriculum.contents[l.lessonId]!.webCode!;
      expect(web.exercises.some(x => x.viewport?.width === 360 && x.viewport.height === 640), l.lessonId).toBe(true);
    }
  });
});
