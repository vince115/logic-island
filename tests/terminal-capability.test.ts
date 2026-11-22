import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { terminalFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, LESSON_CAPABILITIES, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import { initialState } from '@/lib/terminal/fs';
import { run } from '@/lib/terminal/shell';
import { terminalContent } from './support/terminal-fixture';

/*
 * LNX-0: the terminal capability and the linux-systems island prepared for authoring. A synthetic Linux lesson built
 * from the blueprint validates with machines, transcripts and exercises; terminal content needs the terminal capability
 * and the reverse; no existing capability or published lesson changes; nothing of the island is published until it joins
 * ISLAND_IDS with its first written lesson. The lab's shell keeps refusing pipes.
 */
const outline = terminalFromBlueprint('LNX01', '在一台模擬的伺服器上看看檔案與權限（測試用大綱）。', 40);
const meta: LessonMeta = {
  lessonId: 'LNX01', islandId: 'linux-systems', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: [], visualizationType: outline.visualization,
  lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
};
const section = (id: string, example?: string) => ({ id, title: id, blocks: [
  { type: 'p' as const, text: 'Linux 把一切都放在一棵從 / 開始的目錄樹上；每個檔案都有擁有者、群組與三組權限，Shell 依你是誰決定能不能讀、寫或執行。' },
  ...example ? [{ type: 'example' as const, id: example }] : []] });
const question = (n: number) => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['擁有者', '群組', '其他人'], answer: n % 3,
  explanation: '權限依序檢查：是擁有者就看擁有者的位元，在檔案的群組裡就看群組的位元，否則看其他人的位元。' });
const content = (): LessonContent => ({
  lessonId: 'LNX01', motivation: '在伺服器上工作之前，先學會看懂自己在哪裡、檔案屬於誰、誰能讀寫。',
  sections: [section('s1', 'tour'), section('s2', 'groups'), section('s3', 'modes')], examples: [], exercises: [],
  quiz: [1, 2, 3, 4].map(question), terminal: terminalContent(),
});
const swap = (id: string, patch: Partial<LessonMeta>) => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === id ? { ...l, ...patch } : l) }).join('\n');

describe('the terminal capability', () => {
  it('validates a Linux lesson built from the blueprint with machines, transcripts and exercises', () => {
    expect(meta).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualizationType: 'none' });
    expect(LESSON_CAPABILITIES).toContain('terminal');
    expect(LESSON_ACTIVITIES).toContain('terminal-sim');
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
  });
  it('counts transcripts as examples and terminal exercises as exercises, and reports their problems with the lesson id', () => {
    const few = content(); few.terminal!.examples.pop(); few.sections[2] = section('s3');
    expect(validateContent(meta, few, curriculum.visualizations)).toContain('LNX01: needs at least 3 examples');
    const none = content(); none.terminal!.exercises = [];
    expect(validateContent(meta, none, curriculum.visualizations)).toContain('LNX01: needs at least one exercise');
    const bad = content(); bad.terminal!.examples[0].steps[0].output = '/root';
    bad.terminal!.exercises[0].hints = [];
    bad.sections = bad.sections.slice(1).concat(section('s4'));
    const problems = validateContent(meta, bad, curriculum.visualizations).join('\n');
    expect(problems).toMatch(/LNX01: example tour: step 1 \(pwd\) prints "\/home\/learner", not "\/root"/);
    expect(problems).toMatch(/LNX01: exercise backup needs a statement and hints/);
    expect(problems).toMatch(/LNX01: example tour is never shown/);
  });
  it('remembers a replay per terminal content object, and replays a changed copy again (SRV-3)', () => {
    const good = content();
    expect(validateContent(meta, good, curriculum.visualizations)).toEqual([]);
    expect(validateContent(meta, good, curriculum.visualizations)).toEqual([]);
    const changed = structuredClone(good);
    changed.terminal!.examples[0].steps[0].output = '/root';
    expect(validateContent(meta, changed, curriculum.visualizations).join('\n')).toMatch(/LNX01: example tour: step 1 \(pwd\) prints "\/home\/learner", not "\/root"/);
    expect(validateContent(meta, good, curriculum.visualizations)).toEqual([]);
  });
  it('maps the blueprint activities: terminal-sim stays, the overview uses the terminal, SSH adds network scenes, the capstone its stages', () => {
    expect(terminalFromBlueprint('LNX04', 's', 50)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'], visualization: 'none', blueprintId: 'LNX04' });
    expect(terminalFromBlueprint('LNX01', 's', 40)).toMatchObject({ activity: 'terminal-sim', capabilities: ['terminal'] });
    expect(terminalFromBlueprint('LNX12', 's', 60)).toMatchObject({ activity: 'network-sequence', capabilities: ['terminal', 'network-protocol'], visualization: 'none' });
    expect(terminalFromBlueprint('LNX15', 's', 120)).toMatchObject({ activity: 'challenge-stages', capabilities: ['terminal', 'visualization'], visualization: 'challenge-stages' });
    expect(() => terminalFromBlueprint('CN01', 's', 40)).toThrow(/not a Linux systems lesson/);
  });
});

describe('isolation from the other capabilities', () => {
  it('ties terminal content to the terminal capability, both ways', () => {
    const db16 = lessons.find(l => l.lessonId === 'DB16')!;
    expect(validateContent(db16, { ...curriculum.contents.DB16!, terminal: terminalContent() }, curriculum.visualizations))
      .toContain('DB16: has terminal content without the terminal capability');
    const { terminal: _, ...without } = content();
    void _;
    expect(validateContent(meta, without, curriculum.visualizations)).toContain('LNX01: the terminal capability needs its content');
    expect(validateContent({ ...meta, capabilities: ['network-protocol'], activity: 'packet-journey' }, content(), curriculum.visualizations))
      .toContain('LNX01: has terminal content without the terminal capability');
  });
  it('ties terminal-sim to the terminal capability', () => {
    expect(swap('DB16', { activity: 'terminal-sim' })).toMatch(/DB16: activity terminal-sim needs the terminal capability/);
    expect(swap('CN03', { activity: 'terminal-sim' })).toMatch(/CN03: activity terminal-sim needs the terminal capability/);
  });
  it('keeps every other lesson as it was and the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
    // LNX-1: only the Linux systems island's lessons use the terminal capability.
    for (const l of lessons) {
      // SRV-1: the network and servers island uses the terminal capability too.
      const linux = l.islandId === 'linux-systems' || l.islandId === 'network-servers';
      expect(l.capabilities.includes('terminal'), l.lessonId).toBe(linux);
      // LNX-4: LNX12 (SSH) pairs its terminal machines with a network-protocol scene, so its activity is network-sequence.
      // LNX-5: the capstone LNX15 is a challenge-stages lesson.
      expect(l.activity === 'terminal-sim', l.lessonId).toBe(linux && !['LNX12', 'LNX15', 'SRV02', 'SRV03', 'SRV04', 'SRV05', 'SRV06', 'SRV07', 'SRV08', 'SRV10', 'SRV11', 'SRV14'].includes(l.lessonId));
      expect(!!curriculum.contents[l.lessonId]?.terminal, l.lessonId).toBe(linux);
    }
  });
  it('leaves the lab\'s shell refusing pipes, command lists and variables', () => {
    for (const line of ['ls | cat', 'pwd; ls', 'echo $HOME']) {
      const r = run(initialState(), line);
      expect(r.lines, line).toEqual([{ text: '此模擬器不支援管線、指令串接、變數與背景執行（| ; && $ `）；一次輸入一個指令。', kind: 'err' }]);
      expect(r.state, line).toEqual(initialState());
    }
  });
});

describe('the linux-systems island: prepared in LNX-0, written in batches from LNX-1', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('linux-systems');
    expect(ISLAND_PREFIX['linux-systems']).toBe('LNX');
    expect(ISLAND_IDS).toContain('linux-systems');
    const written = lessons.filter(l => l.islandId === 'linux-systems');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `LNX${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(4);
    expect(UNITS['linux-systems'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    expect(lessonsOfIsland('linux-systems')).toHaveLength(15);
    expect(lessonsOfIsland('linux-systems').slice(written.length).every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('linux-systems')).toMatchObject({ status: written.length < 15 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('accepts the synthetic Linux lesson only in its own place', () => {
    // LNX01 is written: a second lesson with the same id is refused.
    expect(validateCurriculum({ ...curriculum, lessons: [...lessons, meta], contents: { ...curriculum.contents, LNX01: content() } }).join('\n')).not.toBe('');
  });
});
