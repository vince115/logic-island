import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { serverFromBlueprint, terminalFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import planning from '@/content/world/planning-data.json';
import { tcpHandshake, previewExercises } from '@/content/network/preview-scenes';
import type { TerminalLessonContent } from '@/lib/terminal/lesson';
import { dnsExercise, nsLocal } from './support/server-fixture';

/*
 * SRV-0 (docs/curriculum/SRV0_SERVER_CAPABILITY.md): the network-servers island prepared for authoring on the existing
 * terminal and network-protocol capabilities. serverFromBlueprint maps the six blueprint activities; a synthetic SRV02
 * lesson (machines, one network scene, one network exercise) validates; it is refused while the island is prepared; the
 * database island's architecture-diagram content (content.ops) is refused on a server lesson; nothing is published.
 */
const outline = serverFromBlueprint('SRV02', '在自己的 DNS 伺服器上新增記錄，並用 dig 驗證（測試用大綱）。', 50);
const meta: LessonMeta = {
  lessonId: 'SRV02' as LessonMeta['lessonId'], islandId: 'network-servers', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
  lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
};
const terminal = (): TerminalLessonContent => ({
  machines: [nsLocal],
  examples: [
    { id: 'check-zone', title: '檢查區域檔', description: '載入前先檢查。', machine: 'ns-01', steps: [{ command: 'named-checkzone example.com /etc/bind/db.example.com', output: 'zone example.com/IN: loaded serial 2026112201\nOK' }] },
    { id: 'ask-ns', title: '直接問權威伺服器', description: '+short 只印資料。', machine: 'ns-01', steps: [{ command: 'dig @127.0.0.1 www.example.com +short', output: 'example.com.\n203.0.113.10' }] },
    { id: 'mx', title: '郵件交換', description: 'MX 有優先順序。', machine: 'ns-01', steps: [{ command: 'host -t MX example.com', output: 'example.com mail is handled by 10 mail.example.com.' }] },
  ],
  exercises: [dnsExercise],
});
const section = (id: string, example: string) => ({ id, title: id, blocks: [{ type: 'p' as const, text: '權威伺服器保存區域的資料；解析器替用戶端查詢並快取答案，快取的時間由 TTL 決定。' }, { type: 'example' as const, id: example }] });
const content = (): LessonContent => ({
  lessonId: 'SRV02' as LessonContent['lessonId'], motivation: '網站搬家時，DNS 記錄與 TTL 決定使用者多久之後才會連到新的伺服器。', examples: [], exercises: [],
  sections: [section('s1', 'check-zone'), section('s2', 'ask-ns'), section('s3', 'mx'), section('s4', tcpHandshake.id)],
  quiz: [1, 2, 3, 4].map(n => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['TTL', 'serial'], answer: n % 2, explanation: 'TTL 決定快取保存多久；serial 讓次要伺服器知道區域變了。' })),
  terminal: terminal(), network: { scenes: [tcpHandshake], exercises: [previewExercises[1]] },
});

describe('serverFromBlueprint', () => {
  it('maps the six blueprint activities onto the terminal capability (no new capability or activity)', () => {
    expect(serverFromBlueprint('SRV01', 's', 45)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: 'SRV01' });
    for (const id of ['SRV02', 'SRV03', 'SRV04', 'SRV06', 'SRV07', 'SRV08', 'SRV11']) expect(serverFromBlueprint(id, 's', 50), id).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(serverFromBlueprint('SRV05', 's', 50)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(serverFromBlueprint('SRV10', 's', 60)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(serverFromBlueprint('SRV09', 's', 50)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'] });
    expect(serverFromBlueprint('SRV13', 's', 60)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'] });
    expect(serverFromBlueprint('SRV14', 's', 120)).toMatchObject({ activity: 'challenge-stages', capabilities: ['terminal', 'visualization'], visualization: 'challenge-stages' });
    const b = planning.plannedLessons.find(l => l.lessonId === 'SRV03')!;
    expect(serverFromBlueprint('SRV03', 's', 50)).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites });
  });
  it('keeps the Linux mapping and its error; each island maps only its own lessons', () => {
    expect(terminalFromBlueprint('LNX12', 's', 60)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(() => terminalFromBlueprint('SRV01', 's', 40)).toThrow(/not a Linux systems lesson/);
    expect(() => serverFromBlueprint('LNX01', 's', 40)).toThrow(/not a network and servers lesson/);
    expect(() => serverFromBlueprint('CN01', 's', 40)).toThrow(/not a network and servers lesson/);
  });
});

describe('a synthetic SRV02 lesson', () => {
  it('validates with machines, transcripts, a terminal exercise, a network scene and a network exercise', () => {
    expect(meta).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualizationType: 'none' });
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
    const { network: _n, ...withoutNetwork } = content();
    void _n;
    expect(validateContent(meta, withoutNetwork, curriculum.visualizations)).toContain('SRV02: the network-protocol capability needs its content');
  });
  it('is refused while the island is only prepared for authoring', () => {
    const problems = validateCurriculum({ ...curriculum, lessons: [...lessons, meta], contents: { ...curriculum.contents, SRV02: content() } }).join('\n');
    expect(problems).toMatch(/network-servers is prepared for authoring, not a curriculum island yet/);
  });
  it('refuses the database island\'s architecture-diagram content (content.ops) on a server lesson', () => {
    const withOps = { ...content(), ops: { backups: [], replication: [], exercises: [] } } as unknown as LessonContent;
    expect(validateContent(meta, withOps, curriculum.visualizations)).toContain('SRV02: has architecture-diagram content without the architecture-diagram capability');
  });
});

describe('the network-servers island: prepared in SRV-0', () => {
  it('is registered for authoring: prefix SRV, no units, no lesson, 14 planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).toContain('network-servers');
    expect(ISLAND_IDS).not.toContain('network-servers');
    expect(ISLAND_PREFIX['network-servers']).toBe('SRV');
    expect(UNITS['network-servers']).toEqual([]);
    expect(lessons.some(l => l.islandId === 'network-servers')).toBe(false);
    const planned = lessonsOfIsland('network-servers');
    expect(planned.map(l => l.lessonId)).toEqual(Array.from({ length: 14 }, (_, i) => `SRV${String(i + 1).padStart(2, '0')}`));
    expect(planned.every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('network-servers')).toMatchObject({ mapState: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});
