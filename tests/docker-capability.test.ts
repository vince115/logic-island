import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
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
 * five blueprint activities; a synthetic DKR04 lesson (a Docker host, transcripts and two exercises) validates; it is
 * refused while the island is prepared; nothing is published and the other islands' mappings are unchanged.
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
  it('is refused while the island is prepared for authoring', () => {
    const problems = validateCurriculum({ ...curriculum, lessons: [...lessons, meta], contents: { ...curriculum.contents, DKR04: content() } }).join('\n');
    expect(problems).toContain('docker-containers is prepared for authoring, not a curriculum island yet');
  });
});

describe('the docker-containers island: prepared in DKR-0', () => {
  it('is prepared with its prefix and no units, lessons or pages; its 15 outlines stay planned', () => {
    expect(PREPARED_ISLAND_IDS).toEqual(['docker-containers']);
    expect(ISLAND_IDS).not.toContain('docker-containers');
    expect(ISLAND_PREFIX['docker-containers']).toBe('DKR');
    expect(UNITS['docker-containers']).toEqual([]);
    expect(lessons.filter(l => l.islandId === 'docker-containers')).toEqual([]);
    const planned = lessonsOfIsland('docker-containers');
    expect(planned.map(l => l.lessonId)).toEqual(Array.from({ length: 15 }, (_, i) => `DKR${String(i + 1).padStart(2, '0')}`));
    expect(planned.every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('docker-containers')).toMatchObject({ status: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});
