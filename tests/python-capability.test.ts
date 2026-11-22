import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { pythonFromBlueprint } from '@/content/curriculum/lessons';
import { hasProgramCode, ISLAND_IDS, ISLAND_PREFIX, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { publishProblems } from '@/lib/curriculum/publish-gate';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import { runProcess } from './support/run-program';

/*
 * AIF-0: the python-code capability (a program lesson in Python only, for the AI islands whose blueprint exercises are
 * code-python) and the ai-foundations island prepared for authoring. program-code keeps requiring C++, Java and Python;
 * no published lesson changes. Python lessons use the standard library only and print the same output whatever the
 * hash seed (sets and dicts of strings change order between processes otherwise).
 */
const outline = pythonFromBlueprint('AIF04', '在固定的小地圖上以 BFS、DFS 與 UCS 搜尋路徑（測試用大綱）。', 60, 'tree-traversal');
const meta: LessonMeta = {
  lessonId: 'AIF04' as LessonMeta['lessonId'], islandId: 'ai-foundations', slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: ['Python'], visualizationType: 'none', lessonStatus: 'complete',
  version: '1.0.0', capabilities: outline.capabilities,
};
const PY = { Python: 'from collections import deque\nq = deque([1, 2])\nprint(q.popleft())' };
const content = (): LessonContent => ({
  lessonId: meta.lessonId, motivation: '在一張小地圖上找路，看搜尋策略怎麼決定先展開哪個狀態，以及代價怎麼累積。',
  sections: [1, 2, 3].map(n => ({ id: `s${n}`, title: `第 ${n} 段`, blocks: [
    { type: 'p' as const, text: '廣度優先搜尋一層一層展開狀態空間，用佇列保存邊界；深度優先搜尋用堆疊，一路往深處走；統一代價搜尋依路徑代價決定下一個展開的節點，保證找到代價最小的解。' },
    { type: 'example' as const, id: `e${n}` }] })),
  examples: [1, 2, 3].map(n => ({ id: `e${n}`, title: `範例 ${n}`, description: '佇列的先進先出。', code: { ...PY }, output: '1' })),
  quiz: [0, 1, 2, 3].map(n => ({ id: `q${n}`, prompt: `第 ${n} 題`, options: ['佇列', '堆疊', '優先佇列'], answer: n % 3,
    explanation: 'BFS 用佇列先進先出，DFS 用堆疊後進先出，UCS 用依代價排序的優先佇列。' })),
  exercises: [{ id: 'x1', title: '練習', statement: '讀入兩個整數，印出它們的和。', inputFormat: '一行兩個整數', outputFormat: '一個整數', constraints: ['0 ≤ a, b ≤ 100'],
    samples: [{ kind: 'normal', input: '1 2\n', output: '3\n', note: '範例' }], tests: [{ kind: 'normal', input: '3 4\n', output: '7\n', note: '一般情況' }, { kind: 'edge', input: '0 0\n', output: '0\n', note: '最小值' }], errorPolicy: '輸入保證是一行兩個合法的整數。', hints: ['用 split 拆開兩個數。'],
    solution: { Python: 'a, b = map(int, input().split())\nprint(a + b)' }, judge: 'none' }],
});

describe('the python-code capability', () => {
  it('builds Python-only outlines from the blueprint and validates a lesson with Python code', () => {
    expect(outline).toMatchObject({ capabilities: ['python-code'], visualization: 'tree-traversal', blueprintId: 'AIF04' });
    expect(hasProgramCode(meta)).toBe(true);
    expect(validateContent(meta, content(), curriculum.visualizations)).toEqual([]);
    expect(() => pythonFromBlueprint('CN01', 's', 40, 'none')).toThrow(/not an AI foundations lesson/);
  });
  it('rejects code in another language, a snippet or trace in another language', () => {
    const cpp = content(); cpp.examples[0].code = { ...PY, 'C++': 'int main() {}' } as never;
    expect(validateContent(meta, cpp, curriculum.visualizations)).toContain('AIF04: example e1 has code in a language the lesson does not offer');
    const quiz = content(); quiz.quiz[0].code = { language: 'Java', text: 'class A {}' };
    expect(validateContent(meta, quiz, curriculum.visualizations)).toContain('AIF04: quiz q0 shows Java, which this lesson does not teach');
    const trace = content(); trace.visualization = { kind: 'tree-traversal', title: 't', language: 'C++', code: 'x', steps: [] };
    expect(validateContent(meta, trace, curriculum.visualizations).join('\n')).toMatch(/traces C\+\+, which this lesson does not teach/);
  });
  it('requires Python only and stands alone; program-code keeps requiring C++, Java and Python', () => {
    const swap = (patch: Partial<LessonMeta>, id = 'A14') => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === id ? { ...l, ...patch } : l) }).join('\n');
    expect(swap({ capabilities: ['python-code'], supportedLanguages: ['C++', 'Java', 'Python'] })).toMatch(/A14: a python-code lesson offers Python only/);
    expect(swap({ capabilities: ['python-code'], supportedLanguages: ['Python', 'JavaScript'] })).toMatch(/A14: a python-code lesson offers Python only/);
    expect(swap({ capabilities: ['python-code', 'visualization'], supportedLanguages: ['Python'] })).toMatch(/A14: python-code stands alone/);
    expect(swap({ supportedLanguages: ['Python'] })).toMatch(/A14: supportedLanguages must include C\+\+, Java, Python/);
  });
  it('keeps every other lesson as it was and the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
    for (const l of lessons) {
      // AIF-1: only the AI foundations island's lessons are python-code.
      expect(l.capabilities.includes('python-code'), l.lessonId).toBe(l.islandId === 'ai-foundations');
      if (l.capabilities.includes('program-code')) expect(l.supportedLanguages.slice(0, 3), l.lessonId).toEqual(['C++', 'Java', 'Python']);
      const c = curriculum.contents[l.lessonId];
      if (c) expect(publishProblems(l, c), l.lessonId).toEqual([]);
    }
  });
});

describe('the ai-foundations island: prepared in AIF-0, written in batches from AIF-1', () => {
  it('is a curriculum island with its first lessons written in id order; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('ai-foundations');
    expect(ISLAND_PREFIX['ai-foundations']).toBe('AIF');
    expect(ISLAND_IDS).toContain('ai-foundations');
    const written = lessons.filter(l => l.islandId === 'ai-foundations');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `AIF${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(5);
    expect(lessonsOfIsland('ai-foundations').slice(written.length).every(l => l.lessonStatus === 'planned' && !l.href)).toBe(true);
    expect(getIsland('ai-foundations')).toMatchObject({ status: written.length < 20 ? 'available' : 'complete', mapState: 'planned' });
  });
});

/** The Python code of every python-code lesson: examples, solutions, starters and the trace. */
const pythonLessons = lessons.filter(l => l.capabilities.includes('python-code')).map(l => l.lessonId);
const pythonCode = (lessonId: string) => [lessonId].flatMap(id => lessons.filter(l => l.lessonId === id)).flatMap(l => {
  const c = curriculum.contents[l.lessonId]!;
  return [...c.examples.map(e => [`${l.lessonId} ${e.id}`, e.code.Python, e.stdin ?? ''] as const),
    ...c.exercises.flatMap(x => [[`${l.lessonId} ${x.id}`, x.solution.Python, x.tests[0]?.input ?? ''] as const, ...x.starter ? [[`${l.lessonId} ${x.id} starter`, x.starter.Python, ''] as const] : []])];
});
function runPython(code: string, stdin: string, seed: string) {
  const dir = mkdtempSync(join(tmpdir(), 'logic-island-py-'));
  try { writeFileSync(join(dir, 'main.py'), code); return runProcess('python3', [join(dir, 'main.py')], stdin, undefined, { PYTHONHASHSEED: seed }).stdout; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const stdlib = (() => {
  try { return new Set(runProcess('python3', ['-c', 'import sys; print("\\n".join(sorted(sys.stdlib_module_names)))']).stdout.split('\n').filter(Boolean)); }
  catch { return undefined; }
})();
const imported = (code: string) => [...code.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm)]
  .flatMap(m => m[1] ? [m[1]] : m[2].split(',')).map(m => m.trim().split('.')[0]);

describe('Python lessons are deterministic and use the standard library only', () => {
  it.skipIf(!stdlib)('the checks themselves catch an order that depends on the hash seed and a third-party import', () => {
    const unordered = 'print(list({"alpha", "beta", "gamma", "delta", "epsilon"}))';
    const outputs = new Set(['0', '1', '2', '3'].map(seed => runPython(unordered, '', seed)));
    expect(outputs.size, 'string set order changes with PYTHONHASHSEED').toBeGreaterThan(1);
    expect(new Set(['0', '1'].map(seed => runPython(`print(sorted(${unordered.slice(6, -1)}))`, '', seed))).size).toBe(1);
    expect(imported('import numpy as np\nfrom collections import deque\nimport heapq, math').filter(m => !stdlib!.has(m))).toEqual(['numpy']);
  });
  // AIF-2 (2026-11-22): one test per program (example, solution or starter), so each run gets the usual time however
  // many Python lessons there are.
  const programs = pythonLessons.flatMap(pythonCode);
  it.skipIf(!stdlib).each(programs)('%s prints the same output under two hash seeds and imports only the standard library', (at, code, stdin) => {
    expect(imported(code).filter(m => !stdlib!.has(m)), at).toEqual([]);
    expect(runPython(code, stdin, '0'), at).toBe(runPython(code, stdin, '1'));
  });
  it('covers every python-code lesson', () => {
    expect(pythonLessons.length).toBeGreaterThanOrEqual(5);
    for (const id of pythonLessons) expect(programs.filter(([at]) => at.startsWith(`${id} `)).length, id).toBeGreaterThan(0);
  });
});
