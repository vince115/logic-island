import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '@/content/world/types';
import { catalogLessons, getCatalogLesson } from '@/content/world/catalog';
import { islandOfLesson } from '@/content/world';
import { getLearningPath } from '@/content/world/paths';
import { isRegionId, pathRegion, regionEntries, regionHref, regionOverview } from '@/lib/world/region-overview';

/* R6 (2026-11-12): the region overviews (/regions/<id>) are read from the registry; nothing planned reads as learnable. */
describe('region overview', () => {
  it('AI 人工智慧群島: seven islands under its three groups, 160 outlined lessons; AIF open since AIF-1, the rest planned', () => {
    const ai = regionOverview('ai');
    expect(ai).toMatchObject({ name: 'AI 人工智慧群島', status: 'available', islandCount: 7, lessonCount: 160, published: 15, ungrouped: [] });
    expect(ai.groups.map(g => [g.label, g.islands.map(i => i.code)])).toEqual([
      ['AI 原理與模型', ['AIF', 'ML', 'DL']], ['生成式 AI 與大型語言模型', ['LLM', 'GEN']], ['AI 應用與系統工程', ['AG', 'OPS']]]);
    for (const island of ai.groups.flatMap(g => g.islands)) {
      if (island.code === 'AIF') { expect(island.status).toBe('available'); expect(island.href).toBe('/curriculum#island-ai-foundations'); }
      else { expect(island.status, island.code).toBe('planned'); expect(island).not.toHaveProperty('href'); }
    }
    // A region whose islands are all outlines (the design region) still reads as planned, with no links.
    const design = regionOverview('design');
    expect(design).toMatchObject({ status: 'planned', published: 0 });
    for (const island of [...design.groups.flatMap(g => g.islands), ...design.ungrouped]) { expect(island.status).toBe('planned'); expect(island).not.toHaveProperty('href'); }
  });

  it('links an island only when it has published lessons, and only to its syllabus', () => {
    for (const id of REGION_IDS) for (const island of [...regionOverview(id).groups.flatMap(g => g.islands), ...regionOverview(id).ungrouped]) {
      if (island.published) expect(island.href).toBe(`/curriculum#island-${island.id}`);
      else expect(island.href).toBeUndefined();
    }
    const cs = regionOverview('cs');
    // 80 lessons, then PL01–PL20 (course production batches 1–5) and CN01–CN20 (CN-1 to CN-5): PL and CN link to their syllabus like the other open islands.
    expect(cs).toMatchObject({ status: 'available', islandCount: 8, lessonCount: 160, published: 120 });
    expect(cs.ungrouped.filter(i => i.href).map(i => i.code)).toEqual(['F', 'DS', 'AL', 'PL', 'DB', 'CN']);
  });

  it('counts agree with the catalog for every region (520 lessons, 80 open; P6 adds sys)', () => {
    const all = REGION_IDS.map(regionOverview);
    expect(all.reduce((n, o) => n + o.lessonCount, 0)).toBe(catalogLessons.length);
    expect(all.reduce((n, o) => n + o.published, 0)).toBe(catalogLessons.filter(l => l.lessonStatus === 'complete').length);
    expect(all.map(o => [o.id, o.islandCount, o.lessonCount])).toEqual([['cs', 8, 160], ['ai', 7, 160], ['design', 4, 56], ['web', 4, 55], ['sys', 6, 89]]);
  });

  it('places each learning path in the region of most of its targets: E, F and J lead through the AI islands', () => {
    expect(regionOverview('ai').paths.map(p => p.id)).toEqual(['E-ai-research', 'F-ai-application-engineering', 'J-ai-architecture']);
    const j = regionOverview('ai').paths.find(p => p.id === 'J-ai-architecture')!;
    // Its open lessons are its CS prerequisites (CN-1 to CN-4 opened CN01, CN05, CN09, CN12, CN13, CN14, CN18) and, since
    // AIF-1, AIF01 and AIF03; most of its AI lessons are still planned, so it is not learnable.
    expect(j).toMatchObject({ title: 'AI 架構', lessonCount: 66, publishedLessons: 20, learnable: false });
    expect(getLearningPath('J-ai-architecture')!.lessons.filter(l => getCatalogLesson(l)?.lessonStatus === 'complete').every(l => ['cs', 'ai'].includes(islandOfLesson(l)?.regionId ?? ''))).toBe(true);
    expect(pathRegion(['F01', 'DS01', 'LLM01'])).toBe('cs');
    // R7: the design and web regions each have their own path.
    expect(regionOverview('design').paths.map(p => p.id)).toEqual(['H-product-design']);
    expect(regionOverview('web').paths.map(p => [p.id, p.lessonCount, p.publishedLessons])).toEqual([['G-frontend-engineering', 62, 7]]);
    expect(pathRegion([])).toBeUndefined();
  });

  it('entries for the home page and /curriculum: every region in order, each to its own overview', () => {
    expect(regionEntries().map(r => [r.id, r.href, r.status])).toEqual([['cs', '/regions/cs', 'available'], ['ai', '/regions/ai', 'available'], ['design', '/regions/design', 'planned'], ['web', '/regions/web', 'planned'], ['sys', '/regions/sys', 'planned']]);
    expect(regionHref('ai')).toBe('/regions/ai');
    expect(isRegionId('ai')).toBe(true);
    expect(isRegionId('labs')).toBe(false);
  });
});
