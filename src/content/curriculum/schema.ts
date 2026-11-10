import type { Language } from '@/content/courses';
import type { AlgorithmId } from '@/lib/engine';
import { parseLessonId, type AnyLessonId, type LessonNumber } from '@/content/world/lesson-id';
import { DATASET_IDS, type DatasetId } from '@/lib/sql/datasets';
import type { SqlCheckSpec, SqlProbe, SqlTable } from '@/lib/sql/engine';
import type { ErModel, ErRole, ErTerm } from '@/lib/er/model';
import type { FD, NormalForm } from '@/lib/normalization/fd';
import type { PlanRequirement } from '@/lib/sql/plan';
import type { TimelineScript } from '@/lib/txn/recovery';
import { MODEL_LEVELS, type Anomaly, type Level, type Model, type Schedule } from '@/lib/txn/schedule';
import type { TxAnswer, TxTask } from '@/lib/txn/check';
import type { SequenceStrategy } from '@/lib/sql/sequence';
import type { BackupPlan, ReplicationScenario } from '@/lib/ops/sim';
import type { OpsTask } from '@/lib/ops/check';
import type { SqlValue } from '@/lib/sql/engine';

/*
 * Phase E curriculum: the shape of the 60 lessons and of a lesson's full content, and the checks every lesson must
 * pass (validateCurriculum). Lesson data lives in lessons.ts and content/*.ts; components only render it.
 * See docs/curriculum/LESSON_CONTENT_SCHEMA.md.
 */

// 2026-11-02: tabs and lists show the languages in this order (was C++, Python, Java). Every lesson has all three.
export const LANGUAGES = ['C++', 'Java', 'Python'] as const satisfies readonly Language[];
/**
 * 2026-11-02 (JavaScript pilot, F05): a lesson may also offer JavaScript, run with Node.js. Only lessons that list it in
 * `supportedLanguages` show its tab, and then every example and reference solution must have it.
 */
export type LessonLanguage = Language | 'JavaScript';
export const OPTIONAL_LANGUAGES = ['JavaScript'] as const satisfies readonly LessonLanguage[];
/** Tab order on a lesson page. */
export const LESSON_LANGUAGES: readonly LessonLanguage[] = [...LANGUAGES, ...OPTIONAL_LANGUAGES];
/** Code in the three languages every lesson has, plus JavaScript where the lesson offers it. */
export type LessonCode = Record<Language, string> & Partial<Record<'JavaScript', string>>;
/** Phase F.1a: the database island joins with its first lessons (DB01–DB05); the rest of its 20 are planned in src/content/world. */
export const ISLAND_IDS = ['foundations', 'structures', 'algorithms', 'databases'] as const;
export type IslandId = typeof ISLAND_IDS[number];
/**
 * F = 基礎程式島, D = 資料結構島, A = 演算法島, then a two-digit position (F01..F20). Phase F.0: the number is two digits in
 * the type too (it was any string, so DB01 or AG01 type-checked as a D or A lesson); IDs of every island, planned ones
 * included, are AnyLessonId in src/content/world/lesson-id.ts and are always parsed with their whole prefix.
 */
export type LessonId = `${'F' | 'D' | 'A' | 'DB'}${LessonNumber}`;
export const ISLAND_PREFIX: Record<IslandId, 'F' | 'D' | 'A' | 'DB'> = { foundations: 'F', structures: 'D', algorithms: 'A', databases: 'DB' };

/**
 * Phase F.1a: a lesson taught in a query language instead of the four programming languages. A SQL lesson has no program
 * tabs (`supportedLanguages` is empty), and its examples and exercises are SQL (`content.sql`), run in the SQL playground.
 */
export const QUERY_LANGUAGES = ['SQL'] as const;
export type QueryLanguage = typeof QUERY_LANGUAGES[number];
/**
 * Interactive activities a lesson can carry besides its visualization type (src/content/world/activities.ts). A lesson
 * with an activity is a database lesson: no program tabs; Phase F.1b adds the ER builder and the normalization steps.
 */
export const LESSON_ACTIVITIES = ['sql-playground', 'erd-builder', 'normalization-steps', 'query-plan', 'transaction-timeline',
  'protocol-sequence', 'architecture-diagram', 'ds-comparison', 'challenge-stages'] as const;
export type LessonActivity = typeof LESSON_ACTIVITIES[number];

/**
 * Phase F.1b: what a lesson is taught and practised with, declared on every lesson, never inferred from a field that is
 * missing. program-code: examples and exercises in the program languages (`supportedLanguages`, `content.examples`);
 * sql: SQL examples, the SQL playground and SQL exercises (`queryLanguage: 'SQL'`, `content.sql`); er-diagram: ER diagrams
 * and the ER builder (`content.er`); normalization: worked normalization, the workbench and its exercises
 * (`content.normalization`). A lesson declares every capability it uses (DB09: sql and er-diagram; DB10: sql and
 * normalization), since each needs its own content, page part and checks; program-code stands alone. New kinds of
 * lesson (UML, networks, AI) add a capability here instead of being told apart by what they lack. Phase F.1c adds
 * query-plan (B+ trees, EXPLAIN QUERY PLAN and plan requirements; with sql) and transaction-timeline (`content.transactions`).
 * Phase F.1d adds driver-code (application code in Python and JavaScript, run by the tests, and Java, compiled:
 * `content.driverCode`), protocol-sequence (the round trips an application makes: `content.sequences`),
 * architecture-diagram (backup, replication and failover simulations: `content.ops`) and visualization (one of the
 * shared visualizations, ds-comparison or challenge-stages: `content.visualization`).
 */
export const LESSON_CAPABILITIES = ['program-code', 'sql', 'er-diagram', 'normalization', 'query-plan', 'transaction-timeline',
  'driver-code', 'protocol-sequence', 'architecture-diagram', 'visualization'] as const;
export type LessonCapability = typeof LESSON_CAPABILITIES[number];
export const hasCapability = (lesson: Pick<LessonMeta, 'capabilities'>, capability: LessonCapability) => lesson.capabilities.includes(capability);
/** The activity each database capability's lessons may name (the blueprint's `activity`). */
const CAPABILITY_ACTIVITY: Record<LessonActivity, LessonCapability> = { 'sql-playground': 'sql', 'erd-builder': 'er-diagram', 'normalization-steps': 'normalization',
  'query-plan': 'query-plan', 'transaction-timeline': 'transaction-timeline', 'protocol-sequence': 'protocol-sequence',
  'architecture-diagram': 'architecture-diagram', 'ds-comparison': 'visualization', 'challenge-stages': 'visualization' };
/** The shared visualizations a database lesson may show (with the visualization capability). */
export const DATABASE_VISUALIZATIONS = ['ds-comparison', 'challenge-stages'] as const;

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
  'function-call', 'recursion-trace', 'complexity', 'challenge-stages', 'ds-comparison', 'greedy-choice', 'none',
] as const;
/** The visualization kinds drawn by the shared step-by-step trace (code, variables, loops, arrays, call stack). */
export const TRACE_KINDS = [
  'variable-state', 'loop-execution', 'array-index', 'function-call', 'recursion-trace',
  'stack-queue', 'linked-list', 'hash-table', 'tree-traversal', 'heap', 'graph-traversal', 'disjoint-set',
  'sorting-steps', 'recursion-tree', 'dp-table', 'greedy-choice',
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
  supportedLanguages: LessonLanguage[];
  visualizationType: VisualizationType;
  lessonStatus: LessonStatus;
  /** Semver of the lesson's content: 0.x for an outline, 1.0.0 and up once complete. */
  version: string;
  /** Existing interactive labs (src/content/courses.ts) that already cover part of this lesson. */
  labs?: AlgorithmId[];
  /** Phase F.1a: SQL lessons only. */
  queryLanguage?: QueryLanguage;
  /** Optional reading that helps (the blueprint's `recommended`); never required, never locked. */
  /** F.1c: may name a lesson of an island the curriculum does not have yet (DB15 → PL14); the catalog checks those. */
  recommended?: AnyLessonId[];
  /** An activity other than the visualization, e.g. the SQL playground. */
  activity?: LessonActivity;
  /** Phase F.1b: what the lesson is taught and practised with (LESSON_CAPABILITIES). */
  capabilities: LessonCapability[];
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
  code: LessonCode;
  /** Standard input the example is run with, if it reads any. */
  stdin?: string;
  /** Expected standard output (trimmed), the same in every language unless `outputByLanguage` says otherwise. */
  output: string;
  outputByLanguage?: Partial<Record<LessonLanguage, string>>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  code?: { language: Language | QueryLanguage; text: string };
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
  starter?: LessonCode;
  solution: LessonCode;
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
    capacity?: number;
    /** E.4: named indices (lo, mid, hi, i, j, left, right…); −1 and cells.length mean just outside the array. */
    pointers?: Record<string, number | null>;
    /** E.4: the cells still in play (a search range, a window, a partition), from..to inclusive; to = from − 1 is empty. */
    range?: { from: number; to: number; label: string };
    /** E.4: headers for a 2D table (a DP table's states), instead of the bare indices. */
    rowLabels?: string[]; colLabels?: string[] }[];
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
  /** E.4: a labelled table (distances and parents, greedy candidates, queries), with marked rows or cells. */
  table?: { name: string; head: string[]; rows: string[][]; marks?: { row: number; col?: number; kind: Mark }[] };
  /** Union-find: parent and size per element (the forest is drawn from parent). */
  dsu?: { parent: number[]; size: number[]; marks?: { at: number; kind: Mark }[] };
}
/** How a step marks a cell, node or edge; every mark is also written out in words. */
export type Mark = 'read' | 'write' | 'bad' | 'removed' | 'visited' | 'found' | 'current' | 'pending';
export interface TreeNode { id: string; label: string; left?: string | null; right?: string | null; children?: string[] }
/** Compares the value, or the value modulo `mod` (no eval). */
export type Comparison = { op: '<' | '<=' | '>' | '>=' | '==' | '!='; value: number; mod?: number };
export interface Branch { label: string; when: { any?: Comparison[]; all?: Comparison[] }; result: string }

export type ComplexityModel = '1' | 'log n' | 'n' | 'n log n' | 'n^2';
export interface ChallengeStage { title: string; concepts: LessonId[]; goal: string; detail: string }

export type VisualizationConfig =
  | { kind: TraceKind; title: string; language: Language; code: string; steps: TraceStep[]; playground?: Playground; tryIt?: TryIt }
  | { kind: 'conditional-branch'; title: string; variable: string; min: number; max: number; initial: number; branches: Branch[]; otherwise: string }
  /** Counted operations of model programs for an input size (an illustrative model, not measured time). */
  | { kind: 'complexity'; title: string; min: number; max: number; initial: number; models: { model: ComplexityModel; example: string }[] }
  /** A multi-part problem walked through stage by stage, each naming the lessons it uses. */
  | { kind: 'challenge-stages'; title: string; stages: ChallengeStage[] }
  /** Structures against operations: the learner picks the operations a problem needs and sees which structures fit. */
  | { kind: 'ds-comparison'; title: string; operations: { id: string; label: string }[]; structures: DsProfile[]; wording?: DsWording };
/**
 * E.3: a structure the learner can operate on with their own values (integers 0–99, at most PLAYGROUND_LIMIT
 * elements), run by the same simulators as the lesson's steps (src/content/curriculum/simulate.ts).
 */
export type Playground = { structure: 'stack' | 'queue' | 'deque' | 'dynamic-array' | 'list' | 'hash-set' | 'bst' | 'heap' | 'dsu'; buckets?: number; size?: number };
export const PLAYGROUND_LIMIT = 10;
/**
 * E.4: run the lesson's algorithm on the learner's own input (validated: at most TRY_IT_LIMIT integers in −99..99,
 * sorted where the algorithm requires it, non-negative for windows), stepping through the real steps of
 * src/content/curriculum/simulate-algorithms.ts.
 */
export type TryIt =
  | { algorithm: 'linear-search' | 'binary-search' | 'lower-bound' | 'bubble-sort' | 'selection-sort' | 'insertion-sort' | 'merge-sort' | 'quick-sort' | 'two-sum' | 'min-window' | 'prefix-sum';
      initial: number[]; target?: number }
  | { algorithm: 'bfs' | 'dfs' | 'dijkstra'; nodes: string[]; edges: { from: string; to: string; weight?: number }[]; directed: boolean; start: string }
  | { algorithm: 'knapsack'; items: { name: string; weight: number; value: number }[]; capacity: number };
export const TRY_IT_LIMIT = 10;
/** One structure's cost per operation (Big-O text) and whether it is a good fit for it. */
export interface DsProfile { name: string; note: string; costs: Record<string, { cost: string; good: boolean }> }
/**
 * Phase F.1d: the comparison's words when its costs are not time complexities (DB18 compares data models in prose).
 * Without it the table speaks of structures and their complexity in the usual case, and a cost is shown as code.
 */
export interface DsWording { caption: string; subject: string; good: string; poor: string }

/** Phase F.1a: a SQL example, run on a dataset; its result is checked by tests/curriculum-sql.test.ts. */
export interface SqlExample { id: string; title: string; description: string; dataset: DatasetId; sql: string; result: SqlTable }

/**
 * A SQL exercise. The learner's query and `solution` run on fresh copies of `dataset` (shown) and of each `hidden`
 * dataset, and the results are compared (src/lib/sql/engine.ts checkSql), so any query with the right result passes.
 * Phase F.1b: an exercise that defines tables or changes data has `probes`: statements run afterwards whose outcomes
 * (result, accepted or rejected) are compared instead.
 */
export interface SqlExercise {
  id: string;
  title: string;
  statement: string;
  dataset: DatasetId;
  /** Datasets the answer is also checked on; their expected rows are never shown. */
  hidden: DatasetId[];
  /** The task asks for an order (ORDER BY), so row order counts. */
  ordered: boolean;
  /** The task names the columns, so names count too (case-insensitive). */
  columnNames?: boolean;
  starter?: string;
  hints: string[];
  solution: string;
  /** Other correct ways to write it; each must pass every check (tested). */
  alternatives: string[];
  /** Typical mistakes; each must fail some check (tested), and `why` explains it. */
  mistakes: { sql: string; why: string }[];
  /** F.1b: run after the learner's SQL; visible ones are listed with the exercise, hidden ones only on hidden checks. */
  probes?: SqlProbe[];
  /** F.1c: the learner's last statement must also have a query plan meeting this (query exercises). */
  plan?: PlanRequirement;
  /** F.1d: run once per parameter set (a parameterized query called with different, also hostile, inputs). */
  paramSets?: { label: string; values: SqlValue[]; hidden?: boolean }[];
  /** F.1d: crash consistency (probe exercises): every state a crash can leave must be one the reference can leave. */
  atomic?: { probe: string };
}

/** How an exercise is checked: its dataset, then each hidden dataset (src/lib/sql/engine.ts checkSql). */
export const sqlCheckSpec = (e: SqlExercise): SqlCheckSpec => ({ solution: e.solution, ordered: e.ordered, columnNames: e.columnNames,
  checks: [{ dataset: e.dataset }, ...e.hidden.map(dataset => ({ dataset, hidden: true }))], ...(e.probes ? { probes: e.probes } : {}), ...(e.plan ? { plan: e.plan } : {}),
  ...(e.paramSets ? { paramSets: e.paramSets } : {}), ...(e.atomic ? { atomic: e.atomic } : {}) });

/** A SQL lesson's runnable part: the playground's dataset and preset queries, examples and exercises. */
export interface SqlLessonContent {
  dataset: DatasetId; presets: { label: string; sql: string }[]; examples: SqlExample[]; exercises: SqlExercise[];
  /** F.1d: the playground takes parameter values for `?` placeholders (DB16, DB17). */
  params?: boolean;
}

/** Phase F.1b: an ER diagram shown in a section (crow's foot notation), with optional grid cells [column, row] per entity. */
export interface ErDiagramExample { id: string; title: string; description: string; model: ErModel; at?: Record<string, [number, number]> }
/**
 * An ER modeling exercise (the erd-builder activity): the learner gives each term of the scenario a role, the diagram
 * is drawn from those roles, and the roles are compared with `answer` by meaning (src/lib/er/model.ts checkRoles).
 */
export interface ErExercise {
  id: string;
  title: string;
  /** The scenario: the requirements the terms come from. */
  statement: string;
  terms: ErTerm[];
  answer: Record<string, ErRole>;
  /** Other roles a term may reasonably have (each passes). */
  accept?: Record<string, ErRole[]>;
  /** Per term, shown when it is wrong: guidance without the answer. */
  termHints: Record<string, string>;
  hints: string[];
  /** Shown with the reference diagram: why it is modeled this way. */
  explanation: string;
  at?: Record<string, [number, number]>;
  /** Typical wrong role choices (each must fail, tested), and why. */
  mistakes: { roles: Record<string, ErRole>; why: string }[];
}
export interface ErLessonContent { diagrams: ErDiagramExample[]; exercises: ErExercise[] }

/** Phase F.1b: a relation with its functional dependencies; `labels` say what each attribute means. */
export interface NfRelation { name: string; attributes: string[]; fds: FD[]; labels?: Record<string, string>; sample?: (string | number | null)[][] }
export interface NfPart { name: string; attributes: string[] }
/** Normalization worked step by step; keys, normal forms and losslessness on the page are computed, not written. */
export interface NfStepsExample { id: string; title: string; description: string; relation: NfRelation; steps: { title: string; note: string; parts: NfPart[] }[] }
/**
 * A normalization exercise (the normalization-steps activity), checked by meaning (src/lib/normalization/check.ts):
 * find the candidate keys, or decompose to a target normal form.
 */
export type NfExercise = {
  id: string; title: string; statement: string; relation: NfRelation; hints: string[]; explanation: string;
} & (
  | { task: 'keys'; all: boolean; solution: string[][]; mistakes: { keys: string[][]; why: string }[] }
  | { task: 'decompose'; target: NormalForm; preserve: boolean; solution: NfPart[]; alternatives: NfPart[][]; mistakes: { parts: NfPart[]; why: string }[] }
);
export interface NormalizationLessonContent { explorer: NfRelation & { title: string }; examples: NfStepsExample[]; exercises: NfExercise[] }

/** Phase F.1c: a B+ tree built from `keys` inserted in order (src/lib/bplus), searched or range-scanned; the learner can try others. */
export interface BPlusExample { id: string; title: string; description: string; order: number; keys: number[]; search?: number; range?: [number, number] }
/** The query-plan capability's own part (plans themselves come from the SQL playground and plan requirements). */
export interface QueryPlanLessonContent { trees: BPlusExample[] }

/** Phase F.1c: one session's transactions with a write-ahead log; the learner steps through and crashes it anywhere. */
export interface TimelineExample { id: string; title: string; description: string; script: TimelineScript }
/** Two interleaved transactions under a concurrency model and isolation level; the learner can switch both. */
export interface ScheduleExample { id: string; title: string; description: string; schedule: Schedule; model: Model; level: Level }
/** A transaction exercise; its answer is computed by the engines (src/lib/txn/check.ts), never written here. */
export type TxExercise = TxTask & { id: string; title: string; statement: string; hints: string[]; explanation: string; mistakes: { answer: TxAnswer; why: string }[] };
export interface TransactionLessonContent { timelines: TimelineExample[]; schedules: ScheduleExample[]; exercises: TxExercise[] }

/** Phase F.1d: driver languages. Python and JavaScript (node:sqlite) examples run in the tests; Java (JDBC) is compiled only. */
export const DRIVER_LANGUAGES = ['Python', 'JavaScript', 'Java'] as const;
export type DriverLanguage = typeof DRIVER_LANGUAGES[number];
/** Application code using a SQLite driver; `output` is what the Python and JavaScript versions print (tested). */
export interface DriverExample { id: string; title: string; description: string; code: Partial<Record<DriverLanguage, string>>; output: string }
/** The round trips of one task under several strategies, run on `dataset` (src/lib/sql/sequence.ts). */
export interface SequenceExample { id: string; title: string; description: string; dataset: DatasetId; strategies: SequenceStrategy[] }
export interface ReplicationExample { id: string; title: string; description: string; scenario: ReplicationScenario }
export interface BackupExample { id: string; title: string; description: string; plan: BackupPlan; failureAt: number }
/** A backup or replication exercise; its answer is computed by src/lib/ops/check.ts, never written here. */
export type OpsExercise = OpsTask & { id: string; title: string; statement: string; hints: string[]; explanation: string; mistakes: { answer: Record<string, number>; why: string }[] };
export interface OpsLessonContent { replication: ReplicationExample[]; backups: BackupExample[]; exercises: OpsExercise[] }
export type { Anomaly };

export interface LessonContent {
  lessonId: LessonId;
  /** Why the topic is worth learning: what it lets the learner do. */
  motivation: string;
  sections: Section[];
  examples: CodeExample[];
  quiz: QuizQuestion[];
  exercises: Exercise[];
  visualization?: VisualizationConfig;
  /** SQL lessons only; then `examples` and `exercises` (programs) are empty. */
  sql?: SqlLessonContent;
  /** F.1b database lessons: ER diagrams and modeling exercises; normalization steps and exercises. */
  er?: ErLessonContent;
  normalization?: NormalizationLessonContent;
  /** F.1c: B+ tree examples (query-plan) and transaction timelines and exercises (transaction-timeline). */
  queryPlan?: QueryPlanLessonContent;
  transactions?: TransactionLessonContent;
  /** F.1d: driver code, round-trip sequences, backup and replication simulations. */
  driverCode?: { examples: DriverExample[] };
  sequences?: SequenceExample[];
  ops?: OpsLessonContent;
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

export const MIN_OBJECTIVES = 3;
export const MIN_QUIZ = 4;
export const MIN_EXAMPLES = 3;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Every rule the curriculum must keep, as a list of problems (empty when valid): schema, unique IDs and slugs, each
 * island's lessons numbered 01..n in ID order, prerequisites that exist and come earlier (so there is no cycle and every
 * lesson can be reached), the three base languages in every program lesson (SQL lessons: none, SQL content instead),
 * references to visualizations, labs and examples, and content that is complete exactly when the lesson says so.
 */
export function validateCurriculum({ islands, lessons, contents, visualizations, labs }: Curriculum): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const order = new Map(lessons.map((lesson, index) => [lesson.lessonId, index]));
  const seen = { ids: new Set<string>(), slugs: new Set<string>() };

  if (islands.map(i => i.id).join() !== ISLAND_IDS.join()) fail('islands', `expected ${ISLAND_IDS.join(', ')}`);
  // Phase F.1a: an island's lessons are its first n in ID order (01..n): F, D, A have all 20; the database island has
  // the lessons written so far, the rest are planned in src/content/world and have no page (validateWorld checks the
  // island's lesson count).
  for (const island of ISLAND_IDS) {
    const ids = lessons.filter(l => l.islandId === island).map(l => l.lessonId);
    const expected = Array.from({ length: Math.max(1, ids.length) }, (_, i) => `${ISLAND_PREFIX[island]}${String(i + 1).padStart(2, '0')}`);
    if (ids.join() !== expected.join()) fail(island, `lessons must be ${expected[0]}..${expected.at(-1)} in order`);
  }

  for (const lesson of lessons) {
    const at = lesson.lessonId;
    if (seen.ids.has(at)) fail(at, 'duplicate lessonId');
    seen.ids.add(at);
    if (seen.slugs.has(lesson.slug)) fail(at, `duplicate slug ${lesson.slug}`);
    seen.slugs.add(lesson.slug);
    if (!SLUG.test(lesson.slug)) fail(at, `slug ${lesson.slug} is not kebab-case`);
    if (parseLessonId(at)?.prefix !== ISLAND_PREFIX[lesson.islandId]) fail(at, `does not belong to ${lesson.islandId}`);
    for (const [field, value] of [['title', lesson.title], ['summary', lesson.summary]] as const) if (!value.trim()) fail(at, `empty ${field}`);
    if (lesson.learningObjectives.length < MIN_OBJECTIVES) fail(at, `needs at least ${MIN_OBJECTIVES} learning objectives`);
    if (!lesson.concepts.length) fail(at, 'needs concepts');
    if (!DIFFICULTIES.includes(lesson.difficulty)) fail(at, `unknown difficulty ${lesson.difficulty}`);
    if (!Number.isInteger(lesson.estimatedMinutes) || lesson.estimatedMinutes < 10 || lesson.estimatedMinutes > 120) fail(at, 'estimatedMinutes must be 10..120');
    if (!lesson.apcsRelevance.length || lesson.apcsRelevance.some(r => !APCS_RELEVANCE.includes(r))) fail(at, 'invalid apcsRelevance');
    if (lesson.apcsRelevance.includes('none') && lesson.apcsRelevance.length > 1) fail(at, "apcsRelevance 'none' must stand alone");
    // Phase F.1b: the declared capabilities decide the languages, the query language and the activity.
    const capabilities = lesson.capabilities ?? [];
    if (!capabilities.length || capabilities.some(c => !LESSON_CAPABILITIES.includes(c)) || new Set(capabilities).size !== capabilities.length)
      fail(at, `capabilities must be distinct values of ${LESSON_CAPABILITIES.join(', ')}`);
    const program = capabilities.includes('program-code');
    if (program && capabilities.length > 1) fail(at, 'program-code stands alone');
    if (program && LANGUAGES.some(l => !lesson.supportedLanguages.includes(l))) fail(at, `supportedLanguages must include ${LANGUAGES.join(', ')}`);
    if (!program && lesson.supportedLanguages.length) fail(at, 'only a program-code lesson has program languages');
    if (capabilities.includes('sql') !== (lesson.queryLanguage === 'SQL')) fail(at, 'a lesson is taught in SQL exactly when it has the sql capability');
    if (lesson.queryLanguage && !QUERY_LANGUAGES.includes(lesson.queryLanguage)) fail(at, `unknown query language ${lesson.queryLanguage}`);
    if (lesson.activity && !LESSON_ACTIVITIES.includes(lesson.activity)) fail(at, `unknown activity ${lesson.activity}`);
    else if (lesson.activity && !capabilities.includes(CAPABILITY_ACTIVITY[lesson.activity])) fail(at, `activity ${lesson.activity} needs the ${CAPABILITY_ACTIVITY[lesson.activity]} capability`);
    if (!program && !lesson.activity) fail(at, 'a lesson without program code names its activity');
    for (const id of lesson.recommended ?? []) {
      // A lesson of an island the curriculum has must exist here; one of a planned island (PL, CN…) is the catalog's to check.
      const ours = (Object.values(ISLAND_PREFIX) as string[]).includes(parseLessonId(id)?.prefix ?? '');
      if (!parseLessonId(id) || (ours && !order.has(id as LessonId))) fail(at, `unknown recommended lesson ${id}`);
      if (id === at || lesson.prerequisites.includes(id as LessonId)) fail(at, `${id} is recommended and also the lesson itself or a prerequisite`);
    }
    const extra = lesson.supportedLanguages.filter(l => !(LANGUAGES as readonly string[]).includes(l));
    if (extra.some(l => !(OPTIONAL_LANGUAGES as readonly string[]).includes(l)) || new Set(lesson.supportedLanguages).size !== lesson.supportedLanguages.length)
      fail(at, `supportedLanguages may add only ${OPTIONAL_LANGUAGES.join(', ')}, once`);
    if (!(lesson.visualizationType in visualizations)) fail(at, `unknown visualization ${lesson.visualizationType}`);
    if (!LESSON_STATUSES.includes(lesson.lessonStatus)) fail(at, `unknown status ${lesson.lessonStatus}`);
    if (!SEMVER.test(lesson.version)) fail(at, `version ${lesson.version} is not semver`);
    for (const lab of lesson.labs ?? []) if (!labs.includes(lab)) fail(at, `unknown lab ${lab}`);
    for (const prerequisite of lesson.prerequisites) {
      // F.1d: a prerequisite on an island the curriculum does not have yet (DB16 → PL02) is the catalog's to check.
      const ours = (Object.values(ISLAND_PREFIX) as string[]).includes(parseLessonId(prerequisite)?.prefix ?? '');
      if (!parseLessonId(prerequisite) || (ours && !order.has(prerequisite))) fail(at, `unknown prerequisite ${prerequisite}`);
      else if (ours && order.get(prerequisite)! >= order.get(at)!) fail(at, `prerequisite ${prerequisite} does not come earlier`);
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

/**
 * Phase F.1a/F.1b: the checks on a database lesson's content: sections and quiz as for every lesson, at least
 * MIN_EXAMPLES examples in all (SQL examples, ER diagrams, normalization steps; each shown in a section by id), at least
 * one exercise, SQL exercises with hints and hidden checks on known datasets, ER and normalization exercises whose
 * reference answers are well formed, and no program code. Whether the SQL runs and the answers pass their own checks is
 * tests/curriculum-sql.test.ts and tests/curriculum-db.test.ts.
 */
export function validateDatabaseContent(lesson: LessonMeta, content: LessonContent): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`${lesson.lessonId}: ${what}`);
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) fail(`duplicate id ${id}`); ids.add(id); };
  const dataset = (id: string, where: string) => { if (!(DATASET_IDS as readonly string[]).includes(id)) fail(`${where} uses unknown dataset ${id}`); };
  const { sql, er, normalization, queryPlan, transactions } = content;
  if (content.examples.length || content.exercises.length) fail('a database lesson has no program examples or exercises');
  // F.1c: query plans are read in the SQL playground and checked on SQL exercises, so the capability comes with sql and
  // at least one exercise judged by its plan.
  if (hasCapability(lesson, 'query-plan')) {
    if (!hasCapability(lesson, 'sql')) fail('the query-plan capability needs the sql capability');
    if (!sql?.exercises.some(e => e.plan || e.probes?.some(p => p.plan))) fail('a query-plan lesson checks at least one exercise by its query plan');
  }
  if (content.visualization && !(DATABASE_VISUALIZATIONS as readonly string[]).includes(content.visualization.kind)) fail(`a database lesson shows only ${DATABASE_VISUALIZATIONS.join(' or ')}`);
  if (content.visualization && content.visualization.kind !== lesson.visualizationType) fail(`visualization ${content.visualization.kind} does not match ${lesson.visualizationType}`);
  if (content.visualization) for (const p of sharedVisualizationProblems(content.visualization)) fail(p);
  if (sql) {
    dataset(sql.dataset, 'the playground');
    if (!sql.presets.length) fail('the playground needs preset queries');
    for (const p of sql.presets) if (!p.label.trim() || !p.sql.trim()) fail('a preset needs a label and SQL');
  }
  const { driverCode, sequences, ops } = content;
  const examples = [...sql?.examples ?? [], ...er?.diagrams ?? [], ...normalization?.examples ?? [],
    ...queryPlan?.trees ?? [], ...transactions?.timelines ?? [], ...transactions?.schedules ?? [],
    ...driverCode?.examples ?? [], ...sequences ?? [], ...ops?.replication ?? [], ...ops?.backups ?? []];
  for (const e of driverCode?.examples ?? []) {
    const langs = Object.keys(e.code);
    if (!langs.length || langs.some(l => !(DRIVER_LANGUAGES as readonly string[]).includes(l))) fail(`driver example ${e.id} uses ${DRIVER_LANGUAGES.join(', ')} only`);
    if ((e.code.Python || e.code.JavaScript) && !e.output.trim()) fail(`driver example ${e.id} needs its expected output`);
  }
  for (const q of sequences ?? []) {
    dataset(q.dataset, `sequence ${q.id}`);
    if (q.strategies.length < 2) fail(`sequence ${q.id} compares at least two strategies`);
  }
  const shown = new Set(content.sections.flatMap(s => s.blocks.flatMap(b => b.type === 'example' ? [b.id] : [])));
  for (const section of content.sections) {
    unique(section.id);
    if (!section.blocks.length) fail(`section ${section.id} is empty`);
    for (const block of section.blocks) {
      if (block.type === 'example' && !examples.some(e => e.id === block.id)) fail(`section ${section.id} shows unknown example ${block.id}`);
      if (block.type === 'table' && block.rows.some(row => row.length !== block.head.length)) fail(`section ${section.id} has a ragged table`);
    }
  }
  if (!content.motivation?.trim()) fail('needs a motivation');
  if (examples.length < MIN_EXAMPLES) fail(`needs at least ${MIN_EXAMPLES} examples`);
  for (const example of examples) {
    unique(example.id);
    if (!example.title.trim()) fail(`example ${example.id} needs a title`);
    if (!shown.has(example.id)) fail(`example ${example.id} is never shown`);
  }
  for (const example of sql?.examples ?? []) {
    dataset(example.dataset, `example ${example.id}`);
    if (!example.sql.trim()) fail(`example ${example.id} needs SQL`);
  }
  if (content.quiz.length < MIN_QUIZ) fail(`needs at least ${MIN_QUIZ} quiz questions`);
  for (const question of content.quiz) {
    unique(question.id);
    if (question.code && question.code.language !== 'SQL') fail(`quiz ${question.id}: a database lesson shows SQL snippets only`);
    if (question.options.length < 2 || new Set(question.options).size !== question.options.length) fail(`quiz ${question.id} needs distinct options`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) fail(`quiz ${question.id} answer out of range`);
    if (!question.explanation.trim()) fail(`quiz ${question.id} has no explanation`);
  }
  const exercises = [...sql?.exercises ?? [], ...er?.exercises ?? [], ...normalization?.exercises ?? [], ...transactions?.exercises ?? [], ...ops?.exercises ?? []];
  if (!exercises.length) fail('needs at least one exercise');
  for (const exercise of exercises) {
    unique(exercise.id);
    if (!exercise.statement.trim() || !exercise.hints.length) fail(`exercise ${exercise.id} needs a statement and hints`);
  }
  for (const exercise of sql?.exercises ?? []) {
    dataset(exercise.dataset, `exercise ${exercise.id}`);
    for (const d of exercise.hidden) dataset(d, `exercise ${exercise.id}`);
    if (!exercise.hidden.length) fail(`exercise ${exercise.id} needs a hidden check`);
    if (!exercise.solution.trim()) fail(`exercise ${exercise.id} needs a solution`);
    if (!exercise.mistakes.length) fail(`exercise ${exercise.id} needs at least one typical mistake (it shows the check rejects it)`);
    for (const probe of exercise.probes ?? []) if (!probe.label.trim() || !probe.sql.trim()) fail(`exercise ${exercise.id} has a probe without a label or SQL`);
    if (exercise.probes && !exercise.probes.some(p => !p.hidden)) fail(`exercise ${exercise.id} needs a visible probe (the learner sees what is checked)`);
  }
  for (const exercise of er?.exercises ?? []) {
    for (const t of exercise.terms) if (!exercise.termHints[t.id]?.trim()) fail(`exercise ${exercise.id}: term ${t.id} needs a hint`);
    if (!exercise.mistakes.length) fail(`exercise ${exercise.id} needs at least one typical mistake`);
  }
  for (const exercise of [...transactions?.exercises ?? [], ...ops?.exercises ?? []]) if (!exercise.mistakes.length) fail(`exercise ${exercise.id} needs at least one typical mistake`);
  for (const exercise of sql?.exercises ?? []) if (exercise.paramSets && !exercise.paramSets.some(p => !p.hidden)) fail(`exercise ${exercise.id} needs a visible parameter set`);
  for (const x of [...transactions?.schedules ?? [], ...(transactions?.exercises ?? []).filter(e => e.task === 'final' || e.task === 'anomalies')] as { id: string; model: Model; level: Level }[])
    if (!MODEL_LEVELS[x.model]?.includes(x.level)) fail(`${x.id}: the ${x.model} model has no ${x.level}`);
  for (const exercise of normalization?.exercises ?? []) {
    const attrs = exercise.relation.attributes;
    for (const fd of exercise.relation.fds) if (![...fd.lhs, ...fd.rhs].every(a => attrs.includes(a))) fail(`exercise ${exercise.id}: a dependency uses an unknown attribute`);
    if (!exercise.mistakes.length) fail(`exercise ${exercise.id} needs at least one typical mistake`);
  }
  return problems;
}

/** The checks on one complete lesson's content. */
export function validateContent(lesson: LessonMeta, content: LessonContent, visualizations: Curriculum['visualizations']): string[] {
  const problems: string[] = [];
  const at = lesson.lessonId;
  const fail = (what: string) => problems.push(`${at}: ${what}`);
  const full = (code: Partial<Record<LessonLanguage, string>> | undefined) => lesson.supportedLanguages.every(l => code?.[l]?.trim());
  // Code in a language the lesson does not offer would never be shown or run.
  const offered = (code: Partial<Record<LessonLanguage, string>> | undefined) => Object.keys(code ?? {}).every(l => (lesson.supportedLanguages as string[]).includes(l));
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) fail(`duplicate id ${id}`); ids.add(id); };

  if (content.lessonId !== at) fail(`content is for ${content.lessonId}`);
  if (content.sections.length < 3) fail('needs at least 3 sections');
  // Phase F.1b: each declared capability has its content, and no content appears without its capability.
  const parts: [LessonCapability, boolean][] = [['sql', !!content.sql], ['er-diagram', !!content.er], ['normalization', !!content.normalization],
    ['query-plan', !!content.queryPlan], ['transaction-timeline', !!content.transactions], ['driver-code', !!content.driverCode],
    ['protocol-sequence', !!content.sequences], ['architecture-diagram', !!content.ops]];
  // A database lesson shows a shared visualization only with the visualization capability (program lessons always may).
  if (!hasCapability(lesson, 'program-code') && hasCapability(lesson, 'visualization') !== !!content.visualization)
    fail(content.visualization ? 'has a visualization without the visualization capability' : 'the visualization capability needs a visualization');
  for (const [capability, present] of parts) if (hasCapability(lesson, capability) !== present)
    fail(present ? `has ${capability} content without the ${capability} capability` : `the ${capability} capability needs its content`);
  if (!hasCapability(lesson, 'program-code')) return [...problems, ...validateDatabaseContent(lesson, content)];
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
    if (!offered(example.code)) fail(`example ${example.id} has code in a language the lesson does not offer`);
    if (!example.output.trim()) fail(`example ${example.id} has no expected output`);
    if (!content.sections.some(s => s.blocks.some(b => b.type === 'example' && b.id === example.id))) fail(`example ${example.id} is never shown`);
  }
  if (content.quiz.length < MIN_QUIZ) fail(`needs at least ${MIN_QUIZ} quiz questions`);
  for (const question of content.quiz) {
    unique(question.id);
    if (question.code && !(LESSON_LANGUAGES as readonly string[]).includes(question.code.language)) fail(`quiz ${question.id} shows ${question.code.language}, which this lesson does not teach`);
    if (question.options.length < 2 || new Set(question.options).size !== question.options.length) fail(`quiz ${question.id} needs distinct options`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) fail(`quiz ${question.id} answer out of range`);
    if (!question.explanation.trim()) fail(`quiz ${question.id} has no explanation`);
  }
  if (!content.exercises.length) fail('needs at least one exercise');
  for (const exercise of content.exercises) {
    unique(exercise.id);
    if (!full(exercise.solution)) fail(`exercise ${exercise.id} is missing a reference solution`);
    if (!offered(exercise.solution) || !offered(exercise.starter)) fail(`exercise ${exercise.id} has code in a language the lesson does not offer`);
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
  if (viz && 'tryIt' in viz && viz.tryIt) {
    const t = viz.tryIt;
    if ('initial' in t && (!t.initial.length || t.initial.length > TRY_IT_LIMIT || t.initial.some(v => !Number.isInteger(v) || v < -99 || v > 99))) fail(`try-it input needs 1–${TRY_IT_LIMIT} integers in −99..99`);
    if ('initial' in t && ['binary-search', 'lower-bound', 'two-sum'].includes(t.algorithm) && t.initial.some((v, i) => i > 0 && v < t.initial[i - 1])) fail(`try-it ${t.algorithm} needs sorted input`);
    if ('nodes' in t && (!t.nodes.includes(t.start) || t.edges.some(e => !t.nodes.includes(e.from) || !t.nodes.includes(e.to) || (t.algorithm === 'dijkstra' && !(e.weight! >= 0))))) fail('try-it graph needs a start node, known edge ends and (Dijkstra) non-negative weights');
    if ('items' in t && (!t.items.length || t.capacity < 0 || t.items.some(i => i.weight < 1 || i.value < 0))) fail('try-it knapsack needs items with positive weights');
  }
  if (viz?.kind === 'conditional-branch' && (!viz.branches.length || viz.initial < viz.min || viz.initial > viz.max)) fail('conditional-branch needs branches and an initial value in range');
  if (viz?.kind === 'complexity' && (viz.models.length < 2 || viz.min < 1 || viz.initial < viz.min || viz.initial > viz.max)) fail('complexity needs two models and an input size in range');
  if (viz) for (const p of sharedVisualizationProblems(viz)) fail(p);
  return problems;
}

/** F.1d: the checks of ds-comparison and challenge-stages, shared by program and database lessons. */
function sharedVisualizationProblems(viz: VisualizationConfig): string[] {
  const problems: string[] = [];
  if (viz.kind === 'ds-comparison') {
    if (viz.operations.length < 2 || viz.structures.length < 2) problems.push('ds-comparison needs at least two operations and two structures');
    for (const st of viz.structures) for (const op of viz.operations) if (!st.costs[op.id]) problems.push(`ds-comparison: ${st.name} has no cost for ${op.id}`);
  }
  if (viz.kind === 'challenge-stages') {
    if (viz.stages.length < 2) problems.push('challenge-stages needs at least two stages');
    for (const stage of viz.stages) for (const id of stage.concepts) if (!(Object.values(ISLAND_PREFIX) as string[]).includes(parseLessonId(id)?.prefix ?? '')) problems.push(`challenge stage ${stage.title} names unknown lesson ${id}`);
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
    'disjoint-set': (s: TraceStep) => !!s.dsu, 'sorting-steps': (s: TraceStep) => !!s.arrays?.length, 'recursion-tree': (s: TraceStep) => !!s.tree,
    'dp-table': (s: TraceStep) => !!s.arrays?.length, 'greedy-choice': (s: TraceStep) => !!s.table }[kind];
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
    if (step.table) {
      const { head, rows, marks } = step.table;
      if (rows.some(r => r.length !== head.length)) problems.push(`${at_} table ${step.table.name} has rows that do not match its header`);
      for (const m of marks ?? []) if (m.row < 0 || m.row >= rows.length || (m.col !== undefined && (m.col < 0 || m.col >= head.length))) problems.push(`${at_} marks outside table ${step.table.name}`);
    }
    for (const array of step.arrays ?? []) {
      const grid = Array.isArray(array.cells[0]), n = array.cells.length;
      if (!grid) {
        for (const [name, p] of Object.entries(array.pointers ?? {})) if (p !== null && (p < -1 || p > n)) problems.push(`${at_} pointer ${name} is outside ${array.name}`);
        if (array.range && (array.range.from < 0 || array.range.to >= n || array.range.from > array.range.to + 1)) problems.push(`${at_} range of ${array.name} is outside it`);
      }
      if (array.rowLabels && array.rowLabels.length !== (grid ? n : 1)) problems.push(`${at_} ${array.name} needs one row label per row`);
      if (array.colLabels && array.colLabels.length !== (grid ? (array.cells[0] as string[]).length : n)) problems.push(`${at_} ${array.name} needs one column label per column`);
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
