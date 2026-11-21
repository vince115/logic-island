import { afterEach, describe, expect, it, vi } from 'vitest';
import { curriculum, getLessonBySlug, islands, lessons } from '@/content/curriculum';
import { networkFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { catalogLessons, lessonsOfIsland } from '@/content/world/catalog';
import { getIsland } from '@/content/world';
import { previewExercises, previewScenes } from '@/content/network/preview-scenes';
import { networkPreviewEnabled } from '@/lib/network/preview';

/*
 * CN-0: the network-protocol capability and the networks island prepared for authoring. A network lesson validates with
 * scenes and exercises; the database lessons' protocol-sequence capability keeps its meaning; nothing of the networks
 * island is published until it joins ISLAND_IDS with its first written lesson.
 */
afterEach(() => { vi.unstubAllEnvs(); });

const cn01 = networkFromBlueprint('CN01', '固定網路情境上的分層模型練習（測試用大綱）。', 45);
const meta: LessonMeta = {
  lessonId: 'CN01', islandId: 'networks', slug: cn01.slug, title: cn01.title, summary: cn01.summary, learningObjectives: cn01.objectives,
  difficulty: cn01.difficulty, estimatedMinutes: cn01.minutes, prerequisites: cn01.prerequisites, concepts: cn01.concepts, apcsRelevance: cn01.apcs,
  supportedLanguages: [], visualizationType: cn01.visualization, lessonStatus: 'complete', version: '1.0.0', capabilities: cn01.capabilities, activity: cn01.activity,
};
const section = (id: string, scene?: string) => ({ id, title: id, blocks: [{ type: 'p' as const, text: '分層讓每一層只處理自己的工作：應用層的資料往下交給傳輸層加上連接埠，再交給網路層加上 IP 位址，最後由鏈結層包成訊框送上線路。' },
  ...scene ? [{ type: 'example' as const, id: scene }] : []] });
const question = (n: number) => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['傳輸層', '網路層', '鏈結層'], answer: n % 3, explanation: '依每一層負責的工作判斷：連接埠屬於傳輸層，IP 位址屬於網路層，MAC 位址屬於鏈結層。' });
const content = (): LessonContent => ({
  lessonId: 'CN01', motivation: '看懂一個請求如何被一層一層包起來，才能在網路出問題時知道該看哪一層。',
  sections: previewScenes.map((s, i) => section(`s${i}`, s.id)), examples: [], exercises: [],
  quiz: [1, 2, 3, 4].map(question), network: { scenes: structuredClone(previewScenes), exercises: structuredClone(previewExercises) },
});

describe('the network-protocol capability', () => {
  it('validates a network lesson built from the blueprint with the reference scenes and exercises', () => {
    expect(meta).toMatchObject({ activity: 'packet-journey', capabilities: ['network-protocol'], visualizationType: 'none' });
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
  });
  it('rejects a lesson without exercises, an exercise the scenes cannot answer and a typical mistake that passes', () => {
    const none = content(); none.network!.exercises = [];
    expect(validateContent(meta, none, curriculum.visualizations)).toContain('CN01: needs at least one exercise');
    const bad = content();
    bad.network!.exercises[0] = { ...bad.network!.exercises[0], task: 'field', scene: 'preview-http-router', message: 'req-2', layer: 'network', field: 'Flow Label' } as never;
    bad.network!.exercises[2].mistakes = [{ answer: { network: '192.0.2.128', broadcast: '192.0.2.191', hosts: '62' }, why: '其實是正解' }];
    const problems = validateContent(meta, bad, curriculum.visualizations).join('\n');
    expect(problems).toMatch(/exercise preview-ttl: no field Flow Label/);
    expect(problems).toMatch(/exercise preview-subnet: the typical mistake "其實是正解" passes the check/);
  });
  it('reports an inconsistent scene and a scene no section shows', () => {
    const c = content();
    c.network!.scenes[0].messages[0].from = 'nowhere';
    c.sections = c.sections.slice(1).concat(section('extra'));
    const problems = validateContent(meta, c, curriculum.visualizations).join('\n');
    expect(problems).toMatch(/scene preview-http-router: message req-1 names an unknown node/);
    expect(problems).toMatch(/example preview-http-router is never shown/);
  });
  it('maps the blueprint activities: packet-journey stays, protocol-sequence becomes network-sequence, unbuilt ones show scenes, the capstone adds its stages', () => {
    expect(networkFromBlueprint('CN09', 's', 50)).toMatchObject({ activity: 'network-sequence', capabilities: ['network-protocol'] });
    expect(networkFromBlueprint('CN03', 's', 50)).toMatchObject({ activity: 'packet-journey', visualization: 'none' });
    expect(networkFromBlueprint('CN05', 's', 50)).toMatchObject({ activity: 'packet-journey' });
    expect(networkFromBlueprint('CN20', 's', 120)).toMatchObject({ activity: 'challenge-stages', visualization: 'challenge-stages', capabilities: ['network-protocol', 'visualization'] });
    expect(() => networkFromBlueprint('PL01', 's', 50)).toThrow(/not a network lesson/);
  });
});

describe('isolation from the database capabilities', () => {
  it('keeps protocol-sequence for the SQL round trips: network content needs network-protocol and SQL sequences need protocol-sequence', () => {
    const db16 = lessons.find(l => l.lessonId === 'DB16')!;
    expect(db16.capabilities).toContain('protocol-sequence');
    expect(db16.capabilities).not.toContain('network-protocol');
    const withNetwork = { ...curriculum.contents.DB16!, network: { scenes: previewScenes, exercises: previewExercises } };
    expect(validateContent(db16, withNetwork, curriculum.visualizations)).toContain('DB16: has network-protocol content without the network-protocol capability');
    const withSequences = { ...content(), sequences: curriculum.contents.DB16!.sequences };
    expect(validateContent(meta, withSequences, curriculum.visualizations)).toContain('CN01: has protocol-sequence content without the protocol-sequence capability');
  });
  it('ties each activity to its own capability', () => {
    const swap = (id: string, activity: LessonMeta['activity']) => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === id ? { ...l, activity } : l) }).join('\n');
    expect(swap('DB16', 'network-sequence')).toMatch(/DB16: activity network-sequence needs the network-protocol capability/);
    expect(swap('DB16', 'packet-journey')).toMatch(/DB16: activity packet-journey needs the network-protocol capability/);
  });
  it('leaves every database lesson and the whole curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
    for (const l of lessons.filter(x => x.islandId === 'databases')) expect(l.capabilities, l.lessonId).not.toContain('network-protocol');
  });
});

describe('the networks island: prepared in CN-0, written in batches from CN-1', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('networks');
    expect(ISLAND_PREFIX.networks).toBe('CN');
    expect(ISLAND_IDS).toContain('networks');
    expect(islands.map(i => i.id)).toEqual([...ISLAND_IDS]);
    const written = lessons.filter(l => l.islandId === 'networks');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `CN${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(5);
    for (const l of lessonsOfIsland('networks').slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    expect(lessonsOfIsland('networks')).toHaveLength(20);
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('networks')).toMatchObject({ status: written.length < 20 ? 'available' : 'complete', mapState: 'planned' });
    expect(catalogLessons.filter(l => l.lessonStatus === 'complete')).toHaveLength(lessons.length);
  });
  it('rejects a lesson of an island that is not a curriculum island yet', () => {
    const outside = { ...meta, lessonId: 'CN99', islandId: 'systems-analysis' } as unknown as LessonMeta;
    const early = validateCurriculum({ ...curriculum, lessons: [...lessons, outside] }).join('\n');
    expect(early).toMatch(/systems-analysis is prepared for authoring, not a curriculum island yet/);
  });
});

describe('the preview page flag', () => {
  it('is off by default, on with LOGIC_ISLAND_NETWORK_PREVIEW=1, and never on in Vercel Production', () => {
    vi.stubEnv('LOGIC_ISLAND_NETWORK_PREVIEW', '');
    expect(networkPreviewEnabled()).toBe(false);
    vi.stubEnv('LOGIC_ISLAND_NETWORK_PREVIEW', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(networkPreviewEnabled()).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(networkPreviewEnabled()).toBe(false);
  });
});
