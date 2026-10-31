import type { Language } from '@/content/courses';
import type { AlgorithmId } from '@/lib/engine';

/*
 * Phase E curriculum: the shape of the 60 lessons and of a lesson's full content, and the checks every lesson must
 * pass (validateCurriculum). Lesson data lives in lessons.ts and content/*.ts; components only render it.
 * See docs/curriculum/LESSON_CONTENT_SCHEMA.md.
 */

export const LANGUAGES = ['C++', 'Python', 'Java'] as const satisfies readonly Language[];
export const ISLAND_IDS = ['foundations', 'structures', 'algorithms'] as const;
export type IslandId = typeof ISLAND_IDS[number];
/** F = 基礎程式島, D = 資料結構島, A = 演算法島, then a two-digit position (F01..F20). */
export type LessonId = `${'F' | 'D' | 'A'}${string}`;
export const ISLAND_PREFIX: Record<IslandId, 'F' | 'D' | 'A'> = { foundations: 'F', structures: 'D', algorithms: 'A' };

/**
 * Beginner: one new idea on top of its prerequisites, short programs. Intermediate: combines several ideas, multi-step
 * programs, first complexity reasoning. Advanced: designs an algorithm or argues why it is correct and fast enough.
 */
export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type Difficulty = typeof DIFFICULTIES[number];

/**
 * How a lesson relates to APCS (大學程式設計先修檢測). Only the kind of question it prepares for, never an official
 * question number, level or score promise. 'none' stands alone.
 */
export const APCS_RELEVANCE = ['concept', 'implementation', 'foundation', 'none'] as const;
export type ApcsRelevance = typeof APCS_RELEVANCE[number];

/** complete: full content, quiz and exercise. planned: outline only (metadata), shown as planned, never as a lesson. */
export const LESSON_STATUSES = ['complete', 'planned'] as const;
export type LessonStatus = typeof LESSON_STATUSES[number];

export const VISUALIZATION_TYPES = [
  'variable-state', 'conditional-branch', 'loop-execution', 'array-index', 'stack-queue', 'tree-traversal', 'sorting-steps',
  'graph-traversal', 'linked-list', 'hash-table', 'heap', 'disjoint-set', 'recursion-tree', 'dp-table',
  'function-call', 'recursion-trace', 'complexity', 'challenge-stages', 'ds-comparison', 'none',
] as const;
/** The visualization kinds drawn by the shared step-by-step trace (code, variables, loops, arrays, call stack). */
export const TRACE_KINDS = [
  'variable-state', 'loop-execution', 'array-index', 'function-call', 'recursion-trace',
  'stack-queue', 'linked-list', 'hash-table', 'tree-traversal', 'heap', 'graph-traversal', 'disjoint-set',
] as const;
export type TraceKind = typeof TRACE_KINDS[number];
export type VisualizationType = typeof VISUALIZATION_TYPES[number];

export interface LessonMeta {
  lessonId: LessonId;
  islandId: IslandId;
  slug: string;
  title: string;
  summary: string;
  learningObjectives: string[];
  difficulty: Difficulty;
  estimatedMinutes: number;
  /** Lesson IDs; each must come earlier in the recommended order (so nothing is locked behind itself). */
  prerequisites: LessonId[];
  concepts: string[];
  apcsRelevance: ApcsRelevance[];
  supportedLanguages: Language[];
  visualizationType: VisualizationType;
  lessonStatus: LessonStatus;
  /** Semver of the lesson's content: 0.x for an outline, 1.0.0 and up once complete. */
  version: string;
  /** Existing interactive labs (src/content/courses.ts) that already cover part of this lesson. */
  labs?: AlgorithmId[];
}

// ---- lesson content --------------------------------------------------------------------------------------------
/** Text may hold `inline code` between backticks. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'callout'; tone: 'tip' | 'warning' | 'note'; title: string; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'example'; id: string };

export interface Section { id: string; title: string; blocks: Block[] }

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  code: Record<Language, string>;
  /** Standard input the example is run with, if it reads any. */
  stdin?: string;
  /** Expected standard output (trimmed), the same in every language unless `outputByLanguage` says otherwise. */
  output: string;
  outputByLanguage?: Partial<Record<Language, string>>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  code?: { language: Language; text: string };
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
}

export interface TestCase { kind: 'normal' | 'edge' | 'error'; input: string; output: string; note: string }

export interface Exercise {
  id: string;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  samples: TestCase[];
  /** Run against the reference solutions by tests/curriculum-code.test.ts. */
  tests: TestCase[];
  /** Why there is no error case, when the input is guaranteed valid. */
  errorPolicy?: string;
  hints: string[];
  /** Code the learner starts from, e.g. input already read before the I/O lesson. */
  starter?: Record<Language, string>;
  solution: Record<Language, string>;
  /** There is no online judge in E.1: exercises show tests, they never grade code. */
  judge: 'none';
}

/** One step of a variable-state trace: the line just run, the variables after it and anything printed so far. */
/**
 * One step of a trace: the line just run and the state after it. Every panel is optional, so one shape serves the
 * variable, loop, array, function-call and recursion visualizations (E.2).
 */
export interface TraceStep {
  line: number;
  note: string;
  vars?: Record<string, string>;
  /** Everything printed so far. */
  output?: string;
  /** What the variables should hold here (debugging: a mismatch is shown in words). */
  expected?: Record<string, string>;
  /** Loops that are running, outermost first: which round, and the condition just checked. */
  loops?: { label: string; iteration: number; condition: string; holds: boolean | null }[];
  /** Arrays or strings as cells (2D as rows), with the cells this step reads, writes or tries out of bounds. */
  arrays?: { name: string; cells: string[] | string[][]; marks?: { at: number | [number, number]; kind: Mark }[];
    /** A dynamic array's capacity: cells from cells.length up to it are allocated but unused. */
    capacity?: number }[];
  /** The call stack, oldest first; the last frame is running. */
  frames?: { name: string; vars: Record<string, string>; returns?: string }[];
  /** E.3: stacks, queues and deques, items from bottom/front to top/back. */
  containers?: { name: string; kind: 'stack' | 'queue' | 'deque'; items: string[]; marks?: { at: number; kind: Mark }[]; underflow?: boolean }[];
  /** A singly linked list from head; named pointers point at a node position, or null. */
  list?: { name: string; nodes: string[]; marks?: { at: number; kind: Mark }[]; pointers?: Record<string, number | null> };
  /** A hash table with separate chaining: one chain per bucket. */
  buckets?: { name: string; buckets: string[][]; marks?: { bucket: number; index?: number; kind: Mark }[] };
  /** A tree or forest: binary nodes use left/right, general nodes use children. */
  tree?: { name: string; nodes: TreeNode[]; roots: string[]; marks?: { id: string; kind: Mark }[] };
  graph?: { name: string; nodes: string[]; edges: { from: string; to: string; weight?: number }[]; directed: boolean;
    marks?: { node?: string; edge?: number; kind: Mark }[]; show: ('list' | 'matrix')[] };
  /** Union-find: parent and size per element (the forest is drawn from parent). */
  dsu?: { parent: number[]; size: number[]; marks?: { at: number; kind: Mark }[] };
}
/** How a step marks a cell, node or edge; every mark is also written out in words. */
export type Mark = 'read' | 'write' | 'bad' | 'removed' | 'visited' | 'found' | 'current';
export interface TreeNode { id: string; label: string; left?: string | null; right?: string | null; children?: string[] }
/** Compares the value, or the value modulo `mod` (no eval). */
export type Comparison = { op: '<' | '<=' | '>' | '>=' | '==' | '!='; value: number; mod?: number };
export interface Branch { label: string; when: { any?: Comparison[]; all?: Comparison[] }; result: string }

export type ComplexityModel = '1' | 'log n' | 'n' | 'n log n' | 'n^2';
export interface ChallengeStage { title: string; concepts: LessonId[]; goal: string; detail: string }

export type VisualizationConfig =
  | { kind: TraceKind; title: string; language: Language; code: string; steps: TraceStep[]; playground?: Playground }
  | { kind: 'conditional-branch'; title: string; variable: string; min: number; max: number; initial: number; branches: Branch[]; otherwise: string }
  /** Counted operations of model programs for an input size (an illustrative model, not measured time). */
  | { kind: 'complexity'; title: string; min: number; max: number; initial: number; models: { model: ComplexityModel; example: string }[] }
  /** A multi-part problem walked through stage by stage, each naming the lessons it uses. */
  | { kind: 'challenge-stages'; title: string; stages: ChallengeStage[] }
  /** Structures against operations: the learner picks the operations a problem needs and sees which structures fit. */
  | { kind: 'ds-comparison'; title: string; operations: { id: string; label: string }[]; structures: DsProfile[] };
/**
 * E.3: a structure the learner can operate on with their own values (integers 0–99, at most PLAYGROUND_LIMIT
 * elements), run by the same simulators as the lesson's steps (src/content/curriculum/simulate.ts).
 */
export type Playground = { structure: 'stack' | 'queue' | 'deque' | 'dynamic-array' | 'list' | 'hash-set' | 'bst' | 'heap' | 'dsu'; buckets?: number; size?: number };
export const PLAYGROUND_LIMIT = 10;
/** One structure's cost per operation (Big-O text) and whether it is a good fit for it. */
export interface DsProfile { name: string; note: string; costs: Record<string, { cost: string; good: boolean }> }

export interface LessonContent {
  lessonId: LessonId;
  /** Why the topic is worth learning: what it lets the learner do. */
  motivation: string;
  sections: Section[];
  examples: CodeExample[];
  quiz: QuizQuestion[];
  exercises: Exercise[];
  visualization?: VisualizationConfig;
}

export interface IslandMeta { id: IslandId; name: string; englishName: string; summary: string }

// ---- validation ------------------------------------------------------------------------------------------------
export interface Curriculum {
  islands: IslandMeta[];
  lessons: LessonMeta[];
  contents: Partial<Record<LessonId, LessonContent>>;
  visualizations: Record<VisualizationType, { status: 'implemented' | 'planned' | 'not-available' }>;
  labs: readonly string[];
}

export const LESSONS_PER_ISLAND = 20;
export const MIN_OBJECTIVES = 3;
export const MIN_QUIZ = 4;
export const MIN_EXAMPLES = 3;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Every rule the curriculum must keep, as a list of problems (empty when valid): schema, unique IDs and slugs, 20
 * lessons per island in ID order, prerequisites that exist and come earlier (so there is no cycle and every lesson
 * can be reached), the same three languages everywhere, references to visualizations, labs and examples, and content
 * that is complete exactly when the lesson says so.
 */
export function validateCurriculum({ islands, lessons, contents, visualizations, labs }: Curriculum): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const order = new Map(lessons.map((lesson, index) => [lesson.lessonId, index]));
  const seen = { ids: new Set<string>(), slugs: new Set<string>() };

  if (islands.map(i => i.id).join() !== ISLAND_IDS.join()) fail('islands', `expected ${ISLAND_IDS.join(', ')}`);
  if (lessons.length !== ISLAND_IDS.length * LESSONS_PER_ISLAND) fail('lessons', `expected ${ISLAND_IDS.length * LESSONS_PER_ISLAND}, got ${lessons.length}`);
  for (const island of ISLAND_IDS) {
    const ids = lessons.filter(l => l.islandId === island).map(l => l.lessonId);
    const expected = Array.from({ length: LESSONS_PER_ISLAND }, (_, i) => `${ISLAND_PREFIX[island]}${String(i + 1).padStart(2, '0')}`);
    if (ids.join() !== expected.join()) fail(island, `lessons must be ${expected[0]}..${expected.at(-1)} in order`);
  }

  for (const lesson of lessons) {
    const at = lesson.lessonId;
    if (seen.ids.has(at)) fail(at, 'duplicate lessonId');
    seen.ids.add(at);
    if (seen.slugs.has(lesson.slug)) fail(at, `duplicate slug ${lesson.slug}`);
    seen.slugs.add(lesson.slug);
    if (!SLUG.test(lesson.slug)) fail(at, `slug ${lesson.slug} is not kebab-case`);
    if (!at.startsWith(ISLAND_PREFIX[lesson.islandId])) fail(at, `does not belong to ${lesson.islandId}`);
    for (const [field, value] of [['title', lesson.title], ['summary', lesson.summary]] as const) if (!value.trim()) fail(at, `empty ${field}`);
    if (lesson.learningObjectives.length < MIN_OBJECTIVES) fail(at, `needs at least ${MIN_OBJECTIVES} learning objectives`);
    if (!lesson.concepts.length) fail(at, 'needs concepts');
    if (!DIFFICULTIES.includes(lesson.difficulty)) fail(at, `unknown difficulty ${lesson.difficulty}`);
    if (!Number.isInteger(lesson.estimatedMinutes) || lesson.estimatedMinutes < 10 || lesson.estimatedMinutes > 120) fail(at, 'estimatedMinutes must be 10..120');
    if (!lesson.apcsRelevance.length || lesson.apcsRelevance.some(r => !APCS_RELEVANCE.includes(r))) fail(at, 'invalid apcsRelevance');
    if (lesson.apcsRelevance.includes('none') && lesson.apcsRelevance.length > 1) fail(at, "apcsRelevance 'none' must stand alone");
    if ([...lesson.supportedLanguages].sort().join() !== [...LANGUAGES].sort().join()) fail(at, `supportedLanguages must be ${LANGUAGES.join(', ')}`);
    if (!(lesson.visualizationType in visualizations)) fail(at, `unknown visualization ${lesson.visualizationType}`);
    if (!LESSON_STATUSES.includes(lesson.lessonStatus)) fail(at, `unknown status ${lesson.lessonStatus}`);
    if (!SEMVER.test(lesson.version)) fail(at, `version ${lesson.version} is not semver`);
    for (const lab of lesson.labs ?? []) if (!labs.includes(lab)) fail(at, `unknown lab ${lab}`);
    for (const prerequisite of lesson.prerequisites) {
      if (!order.has(prerequisite)) fail(at, `unknown prerequisite ${prerequisite}`);
      else if (order.get(prerequisite)! >= order.get(at)!) fail(at, `prerequisite ${prerequisite} does not come earlier`);
    }
    if (new Set(lesson.prerequisites).size !== lesson.prerequisites.length) fail(at, 'repeated prerequisite');

    const content = contents[at];
    if (lesson.lessonStatus === 'planned') {
      if (content) fail(at, 'planned lesson has content (mark it complete or remove it)');
      if (!lesson.version.startsWith('0.')) fail(at, 'a planned lesson is version 0.x');
      continue;
    }
    if (!content) { fail(at, 'complete lesson has no content'); continue; }
    if (lesson.version.startsWith('0.')) fail(at, 'a complete lesson is version 1.0.0 or later');
    problems.push(...validateContent(lesson, content, visualizations));
  }
  for (const id of Object.keys(contents)) if (!order.has(id as LessonId)) fail(id, 'content for an unknown lesson');
  return problems;
}

/** The checks on one complete lesson's content. */
export function validateContent(lesson: LessonMeta, content: LessonContent, visualizations: Curriculum['visualizations']): string[] {
  const problems: string[] = [];
  const at = lesson.lessonId;
  const fail = (what: string) => problems.push(`${at}: ${what}`);
  const full = (code: Partial<Record<Language, string>> | undefined) => lesson.supportedLanguages.every(l => code?.[l]?.trim());
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) fail(`duplicate id ${id}`); ids.add(id); };

  if (content.lessonId !== at) fail(`content is for ${content.lessonId}`);
  if (content.sections.length < 3) fail('needs at least 3 sections');
  const examples = new Set(content.examples.map(e => e.id));
  for (const section of content.sections) {
    unique(section.id);
    if (!section.blocks.length) fail(`section ${section.id} is empty`);
    for (const block of section.blocks) {
      if (block.type === 'example' && !examples.has(block.id)) fail(`section ${section.id} shows unknown example ${block.id}`);
      if (block.type === 'table' && block.rows.some(row => row.length !== block.head.length)) fail(`section ${section.id} has a ragged table`);
    }
  }
  if (!content.motivation?.trim()) fail('needs a motivation');
  if (content.examples.length < MIN_EXAMPLES) fail(`needs at least ${MIN_EXAMPLES} code examples`);
  for (const example of content.examples) {
    unique(example.id);
    if (!full(example.code)) fail(`example ${example.id} is missing a language`);
    if (!example.output.trim()) fail(`example ${example.id} has no expected output`);
    if (!content.sections.some(s => s.blocks.some(b => b.type === 'example' && b.id === example.id))) fail(`example ${example.id} is never shown`);
  }
  if (content.quiz.length < MIN_QUIZ) fail(`needs at least ${MIN_QUIZ} quiz questions`);
  for (const question of content.quiz) {
    unique(question.id);
    if (question.options.length < 2 || new Set(question.options).size !== question.options.length) fail(`quiz ${question.id} needs distinct options`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) fail(`quiz ${question.id} answer out of range`);
    if (!question.explanation.trim()) fail(`quiz ${question.id} has no explanation`);
  }
  if (!content.exercises.length) fail('needs at least one exercise');
  for (const exercise of content.exercises) {
    unique(exercise.id);
    if (!full(exercise.solution)) fail(`exercise ${exercise.id} is missing a reference solution`);
    if (exercise.starter && !full(exercise.starter)) fail(`exercise ${exercise.id} starter is missing a language`);
    if (!exercise.samples.length) fail(`exercise ${exercise.id} has no sample`);
    for (const kind of ['normal', 'edge'] as const) if (!exercise.tests.some(t => t.kind === kind)) fail(`exercise ${exercise.id} has no ${kind} test`);
    if (!exercise.tests.some(t => t.kind === 'error') && !exercise.errorPolicy?.trim()) fail(`exercise ${exercise.id} needs an error test or an errorPolicy`);
    if (exercise.judge !== 'none') fail(`exercise ${exercise.id} claims a judge`);
  }
  const type = lesson.visualizationType;
  if (type !== 'none') {
    if (visualizations[type]?.status !== 'implemented') fail(`complete lesson uses visualization ${type}, which is not implemented`);
    if (content.visualization?.kind !== type) fail(`visualization config must be ${type}`);
  } else if (content.visualization) fail('visualization config without a visualization type');
  const viz = content.visualization;
  if (viz && (TRACE_KINDS as readonly string[]).includes(viz.kind) && 'steps' in viz) problems.push(...validateTrace(at, viz.kind as TraceKind, viz.code, viz.steps));
  if (viz && 'playground' in viz && viz.playground) {
    const { structure, buckets, size } = viz.playground;
    if (structure === 'hash-set' && !(buckets && buckets >= 2 && buckets <= 13)) fail('a hash-set playground needs 2–13 buckets');
    if (structure === 'dsu' && !(size && size >= 2 && size <= PLAYGROUND_LIMIT)) fail(`a union-find playground needs 2–${PLAYGROUND_LIMIT} elements`);
  }
  if (viz?.kind === 'conditional-branch' && (!viz.branches.length || viz.initial < viz.min || viz.initial > viz.max)) fail('conditional-branch needs branches and an initial value in range');
  if (viz?.kind === 'complexity' && (viz.models.length < 2 || viz.min < 1 || viz.initial < viz.min || viz.initial > viz.max)) fail('complexity needs two models and an input size in range');
  if (viz?.kind === 'ds-comparison') {
    if (viz.operations.length < 2 || viz.structures.length < 2) fail('ds-comparison needs at least two operations and two structures');
    for (const st of viz.structures) for (const op of viz.operations) if (!st.costs[op.id]) fail(`ds-comparison: ${st.name} has no cost for ${op.id}`);
  }
  if (viz?.kind === 'challenge-stages') {
    if (viz.stages.length < 2) fail('challenge-stages needs at least two stages');
    for (const stage of viz.stages) for (const id of stage.concepts) if (!/^[FDA]\d{2}$/.test(id)) fail(`challenge stage ${stage.title} names unknown lesson ${id}`);
  }
  return problems;
}

/** Whether a comparison holds (the conditional-branch visualization, no eval). */
export function compare(raw: number, { op, value: other, mod }: Comparison): boolean {
  // Mathematical modulo, so a negative value behaves like Python's % (the lessons say which language they mean).
  const value = mod ? ((raw % mod) + mod) % mod : raw;
  switch (op) {
    case '<': return value < other;
    case '<=': return value <= other;
    case '>': return value > other;
    case '>=': return value >= other;
    case '==': return value === other;
    case '!=': return value !== other;
  }
}
/** Whether a branch is taken: any of `any` and all of `all` (an empty side does not block). */
export const branchTaken = (value: number, { when }: Branch) =>
  (!when.any?.length || when.any.some(c => compare(value, c))) && (!when.all?.length || when.all.every(c => compare(value, c)));

/** A trace's steps point at its code, and each kind carries the panel it is about. */
export function validateTrace(at: string, kind: TraceKind, code: string, steps: TraceStep[]): string[] {
  const problems: string[] = [];
  const lines = code.split('\n').length;
  if (!steps.length || steps.some(s => s.line < 1 || s.line > lines)) problems.push(`${at}: ${kind} steps must point at lines of its code`);
  const needs = { 'variable-state': (s: TraceStep) => !!s.vars, 'loop-execution': (s: TraceStep) => !!s.loops?.length, 'array-index': (s: TraceStep) => !!s.arrays?.length,
    'function-call': (s: TraceStep) => !!s.frames?.length, 'recursion-trace': (s: TraceStep) => (s.frames?.length ?? 0) > 1,
    'stack-queue': (s: TraceStep) => !!s.containers?.length, 'linked-list': (s: TraceStep) => !!s.list, 'hash-table': (s: TraceStep) => !!s.buckets,
    'tree-traversal': (s: TraceStep) => !!s.tree, heap: (s: TraceStep) => !!s.tree && !!s.arrays?.length, 'graph-traversal': (s: TraceStep) => !!s.graph,
    'disjoint-set': (s: TraceStep) => !!s.dsu }[kind];
  if (!steps.some(needs)) problems.push(`${at}: ${kind} trace never shows its panel`);
  for (const [i, step] of steps.entries()) {
    const at_ = `${at}: step ${i + 1}`;
    for (const c of step.containers ?? []) for (const m of c.marks ?? []) if (m.kind !== 'bad' && m.kind !== 'removed' && (m.at < 0 || m.at >= c.items.length)) problems.push(`${at_} marks outside ${c.name}`);
    if (step.list) {
      const n = step.list.nodes.length;
      for (const m of step.list.marks ?? []) if (m.kind !== 'removed' && (m.at < 0 || m.at >= n)) problems.push(`${at_} marks outside list ${step.list.name}`);
      for (const [name, p] of Object.entries(step.list.pointers ?? {})) if (p !== null && (p < 0 || p >= n)) problems.push(`${at_} pointer ${name} is outside the list`);
    }
    if (step.buckets) for (const m of step.buckets.marks ?? []) {
      const chain = step.buckets.buckets[m.bucket];
      if (!chain || (m.index !== undefined && m.kind !== 'removed' && (m.index < 0 || m.index >= chain.length))) problems.push(`${at_} marks outside the buckets`);
    }
    if (step.tree) {
      const ids = new Set(step.tree.nodes.map(n => n.id));
      if (ids.size !== step.tree.nodes.length) problems.push(`${at_} repeats a tree node id`);
      for (const n of step.tree.nodes) for (const child of [n.left, n.right, ...(n.children ?? [])]) if (child && !ids.has(child)) problems.push(`${at_} tree node ${n.id} points at missing ${child}`);
      for (const r of step.tree.roots) if (!ids.has(r)) problems.push(`${at_} tree root ${r} is missing`);
      for (const m of step.tree.marks ?? []) if (m.kind !== 'removed' && !ids.has(m.id)) problems.push(`${at_} marks missing tree node ${m.id}`);
    }
    if (step.graph) {
      const ids = new Set(step.graph.nodes);
      for (const e of step.graph.edges) if (!ids.has(e.from) || !ids.has(e.to)) problems.push(`${at_} graph edge ${e.from}-${e.to} uses a missing node`);
      for (const m of step.graph.marks ?? []) if ((m.node && !ids.has(m.node)) || (m.edge !== undefined && !step.graph.edges[m.edge])) problems.push(`${at_} marks a missing graph node or edge`);
    }
    if (step.dsu) {
      const n = step.dsu.parent.length;
      if (step.dsu.size.length !== n || step.dsu.parent.some(p => p < 0 || p >= n)) problems.push(`${at_} has an invalid union-find parent array`);
      for (const m of step.dsu.marks ?? []) if (m.at < 0 || m.at >= n) problems.push(`${at_} marks outside the union-find`);
    }
  }
  for (const [i, step] of steps.entries()) for (const array of step.arrays ?? []) {
    const rows = array.cells.length, grid = Array.isArray(array.cells[0]);
    for (const mark of array.marks ?? []) {
      if (mark.kind === 'bad') continue;
      const inside = typeof mark.at === 'number' ? !grid && mark.at >= 0 && mark.at < rows
        : grid && mark.at[0] >= 0 && mark.at[0] < rows && mark.at[1] >= 0 && mark.at[1] < (array.cells[mark.at[0]] as string[]).length;
      if (!inside) problems.push(`${at}: step ${i + 1} marks a cell outside ${array.name} without calling it out of bounds`);
    }
  }
  return problems;
}
