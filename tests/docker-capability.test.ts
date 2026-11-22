import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '@/content/curriculum';
import { dockerFromBlueprint, serverFromBlueprint, terminalFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import planning from '@/content/world/planning-data.json';
import type { TerminalLessonContent } from '@/lib/terminal/lesson';
import { cleanupExercise, dockLab, publishExercise } from './support/docker-fixture';
import { validateTerminalLessonsFirst } from './support/terminal-replays';

/*
 * DKR-0 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md): the docker-containers island prepared for authoring on the existing
 * terminal capability (engine stage E20, the containers profile) and network-protocol scenes. dockerFromBlueprint maps the
 * five blueprint activities; a synthetic DKR04 lesson (a Docker host, transcripts and two exercises) validates; the other
 * islands' mappings are unchanged. DKR-1 publishes the island (DKR01–DKR04), between linux-systems and network-servers.
 * DKR-1 dropped the test that a synthetic DKR04 was refused while the island was prepared: no island is prepared any more,
 * so it cannot be built; network-capability.test.ts keeps the refusal of a lesson outside the curriculum islands.
 */
const outline = dockerFromBlueprint('DKR04', '用 docker run、ps、logs、exec 與 -p 管理容器（測試用大綱）。', 55);
const meta: LessonMeta = {
  lessonId: 'DKR04' as LessonMeta['lessonId'], islandId: 'docker-containers', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
  lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
};
const terminal = (): TerminalLessonContent => ({
  machines: [dockLab],
  examples: [
    { id: 'images', title: '本機的 Image', description: 'docker images 列出已經拉下來的 Image。', machine: 'dock-01', steps: [{ command: 'docker images', output:
      'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnginx        latest    6b80bc54ac19   2 weeks ago   192MB\nubuntu       24.04     1ab7d251cec8   5 weeks ago   78.1MB\nalpine       3.21      62550e7b9f25   6 weeks ago   7.83MB' }] },
    { id: 'ps', title: '所有容器', description: '-a 也列出停止的容器。', machine: 'dock-01', steps: [{ command: 'docker ps -a', output:
      'CONTAINER ID   IMAGE         COMMAND                  CREATED             STATUS                     PORTS     NAMES\n3e875839f1d9   alpine:3.21   "sleep infinity"         3 minutes ago       Up 3 minutes                         worker\n6d2f14683c9e   nginx         "/docker-entrypoint.…"   About an hour ago   Exited (0) 5 minutes ago             old-web' }] },
    { id: 'once', title: '執行一次就結束', description: '--rm 讓容器結束後自動刪除。', machine: 'dock-01', steps: [{ command: 'docker run --rm alpine:3.21 echo hello', output: 'hello' }, { command: 'docker ps -aq | wc -l', output: '2' }] },
  ],
  exercises: [publishExercise, cleanupExercise],
});
const section = (id: string, example: string) => ({ id, title: id, blocks: [{ type: 'p' as const, text: 'Image 是唯讀的範本，Container 是由它建立、有自己可寫層的執行個體。' }, { type: 'example' as const, id: example }] });
const content = (): LessonContent => ({
  lessonId: 'DKR04' as LessonContent['lessonId'], motivation: '同一個 Image 可以啟動很多個容器；學會 run、ps、logs 與 -p，就能在任何主機上跑起服務。', examples: [], exercises: [],
  sections: [section('s1', 'images'), section('s2', 'ps'), section('s3', 'once')],
  quiz: [1, 2, 3, 4].map(n => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['docker ps -a', 'docker ps'], answer: n % 2, explanation: 'docker ps 只列出執行中的容器，-a 也列出停止的。' })),
  terminal: terminal(),
});

validateTerminalLessonsFirst();

describe('dockerFromBlueprint', () => {
  it('maps the five blueprint activities onto the terminal capability (no new capability or activity)', () => {
    for (const id of ['DKR03', 'DKR04', 'DKR05', 'DKR06', 'DKR07', 'DKR08', 'DKR09', 'DKR10', 'DKR13', 'DKR14'])
      expect(dockerFromBlueprint(id, 's', 55), id).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: id });
    for (const id of ['DKR01', 'DKR02', 'DKR11']) expect(dockerFromBlueprint(id, 's', 45), id).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' });
    expect(dockerFromBlueprint('DKR12', 's', 50)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'] });
    expect(dockerFromBlueprint('DKR15', 's', 120)).toMatchObject({ activity: 'challenge-stages', capabilities: ['terminal', 'visualization'], visualization: 'challenge-stages' });
    const b = planning.plannedLessons.find(l => l.lessonId === 'DKR04')!;
    expect(dockerFromBlueprint('DKR04', 's', 55)).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites });
  });
  it('keeps the Linux and server mappings and their errors; each island maps only its own lessons', () => {
    expect(terminalFromBlueprint('LNX12', 's', 60)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(serverFromBlueprint('SRV05', 's', 50)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'] });
    expect(() => dockerFromBlueprint('SRV01', 's', 40)).toThrow(/not a Docker containers lesson/);
    expect(() => dockerFromBlueprint('LNX01', 's', 40)).toThrow(/not a Docker containers lesson/);
    expect(() => serverFromBlueprint('DKR03', 's', 40)).toThrow(/not a network and servers lesson/);
    expect(() => terminalFromBlueprint('DKR03', 's', 40)).toThrow(/not a Linux systems lesson/);
  });
});

describe('a synthetic DKR04 lesson', () => {
  it('validates with a Docker host, replayed transcripts and two exercises', () => {
    expect(meta).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualizationType: 'none' });
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
    const { terminal: _t, ...withoutTerminal } = content();
    void _t;
    expect(validateContent(meta, withoutTerminal, curriculum.visualizations).join('\n')).toContain('terminal');
  });
});

describe('the docker-containers island: prepared in DKR-0, published from DKR-1', () => {
  it('is a curriculum island between linux-systems and network-servers with its first lessons written in id order and in its unit; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('docker-containers');
    expect(ISLAND_IDS).toContain('docker-containers');
    expect(ISLAND_IDS.indexOf('docker-containers')).toBe(ISLAND_IDS.indexOf('linux-systems') + 1);
    expect(ISLAND_IDS.indexOf('network-servers')).toBe(ISLAND_IDS.indexOf('docker-containers') + 1);
    expect(ISLAND_PREFIX['docker-containers']).toBe('DKR');
    const written = lessons.filter(l => l.islandId === 'docker-containers');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `DKR${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(4);
    // DKR-1: one unit, DKR01–DKR04.
    expect(UNITS['docker-containers'][0]).toMatchObject({ title: '容器與 Docker 入門', lessonIds: ['DKR01', 'DKR02', 'DKR03', 'DKR04'] });
    expect(UNITS['docker-containers'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    // Every written lesson has its terminal content and its page; the architecture overviews add a network scene.
    for (const l of written) {
      expect(curriculum.contents[l.lessonId]?.terminal, l.lessonId).toBeDefined();
      expect(getLessonBySlug(l.slug)?.lessonId, l.slug).toBe(l.lessonId);
    }
    expect(written.slice(0, 4).map(l => [l.lessonId, l.capabilities, l.activity, !!curriculum.contents[l.lessonId]?.network])).toEqual([
      ['DKR01', ['terminal', 'network-protocol'], 'network-sequence', true],
      ['DKR02', ['terminal', 'network-protocol'], 'network-sequence', true],
      ['DKR03', ['terminal'], 'terminal-sim', false],
      ['DKR04', ['terminal'], 'terminal-sim', false],
    ]);
    const outline = lessonsOfIsland('docker-containers');
    expect(outline.map(l => l.lessonId)).toEqual(Array.from({ length: 15 }, (_, i) => `DKR${String(i + 1).padStart(2, '0')}`));
    expect(outline.slice(0, written.length).every(l => l.lessonStatus === 'complete' && l.href === `/curriculum/${l.slug}`)).toBe(true);
    for (const l of outline.slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('docker-containers')).toMatchObject({ status: written.length < 15 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});
