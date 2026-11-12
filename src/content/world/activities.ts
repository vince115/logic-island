import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum/lessons';
import { curriculum } from '@/content/curriculum';
import { visualizations } from '@/content/curriculum/registry';
import { TRACE_KINDS, type VisualizationType } from '@/content/curriculum/schema';
import { algorithmIds } from '@/lib/engine';
import { catalogLessons } from './catalog';
import { LAB_ISLAND_ID } from './islands';
import { labRegistry } from './labs';

/*
 * Phase F.0 activity registry: one metadata contract for the 20 lesson visualizations, the 6 labs and the 61 activities
 * the plan adds (docs/planning/INTERACTIVE_ACTIVITY_ARCHITECTURE.md). Metadata only: nothing new runs. The existing
 * visualizations and labs keep their own code and data; their entries here are read from it.
 */

/**
 * T0 reuses an existing visualization; T1 a deterministic simulation in the browser; T2 runs the learner's input in a
 * browser sandbox (Web Worker, WASM); T3 plays results computed ahead of time; T4 needs a backend (not in Phase F).
 */
export const ACTIVITY_TIERS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
export type ActivityTier = typeof ACTIVITY_TIERS[number];
/** What a tier needs at runtime; a tier and its runtime always go together. */
export const TIER_RUNTIME = { T0: 'shared-player', T1: 'browser', T2: 'browser-sandbox', T3: 'precomputed-assets', T4: 'server' } as const;
export type ActivityRuntime = typeof TIER_RUNTIME[ActivityTier];

/**
 * preset: steps written in the lesson. custom-values: the learner's own numbers. parameters: sliders, choices or
 * settings. text, sql, code: typed by the learner. diagram: a diagram the learner builds (F.1b's ER builder composes it
 * from choices per term; free drawing is not implemented).
 */
export const ACTIVITY_INPUTS = ['preset', 'custom-values', 'parameters', 'text', 'sql', 'code', 'diagram'] as const;
export type ActivityInput = typeof ACTIVITY_INPUTS[number];

export interface ActivityMeta {
  id: string;
  /** visualization: in a lesson page. lab: on the Interactive Lab Island. activity: planned by Phase F. */
  type: 'visualization' | 'lab' | 'activity';
  label?: string;
  /** Islands whose lessons use it (derived from the lessons); the lab island for labs. */
  subjects: string[];
  tier: ActivityTier;
  runtime: ActivityRuntime;
  availability: 'implemented' | 'planned';
  inputs: ActivityInput[];
  /**
   * Every activity can be used by keyboard and has a text equivalent of what it draws. Implemented ones say what that
   * text is; planned ones carry the requirement.
   */
  accessibility: { keyboard: true; textAlternative: string };
  version: string;
  /** Multi-archipelago v2 (P4): the Interactive Lab Island entry (/learn/<lab>) of this activity, when it has one. */
  lab?: string;
}

const subjectsOf = (activity: string) => [...new Set(catalogLessons.filter(l => l.activity === activity).map(l => l.islandId))];

// ---- implemented: the 20 visualizations and the 6 labs ---------------------------------------------------------
const TRACE_TEXT = '每一步的說明，以及以文字寫出的每個標記';
const OTHER_TEXT: Partial<Record<VisualizationType, string>> = {
  'conditional-branch': '每個條件的結果與 aria-live 文字摘要',
  complexity: '各模型的次數文字與 aria-live 摘要',
  'challenge-stages': '各階段的目標與說明文字（aria-live）',
  'ds-comparison': '比較表格與 aria-live 結論',
};
/** Trace kinds take the learner's own values when some lesson gives them a playground or "try it yourself". */
const takesValues = (type: VisualizationType) => lessons.some(l => {
  const viz = l.visualizationType === type ? curriculum.contents[l.lessonId]?.visualization : undefined;
  return !!viz && (('playground' in viz && !!viz.playground) || ('tryIt' in viz && !!viz.tryIt));
});
const visualizationEntries: ActivityMeta[] = (Object.keys(visualizations) as VisualizationType[])
  .filter(type => visualizations[type].status === 'implemented')
  .map(type => {
    const trace = (TRACE_KINDS as readonly string[]).includes(type);
    return {
      id: type, type: 'visualization', label: visualizations[type].label, subjects: subjectsOf(type), tier: 'T0', runtime: TIER_RUNTIME.T0,
      availability: 'implemented', version: '1.0.0',
      inputs: trace ? (takesValues(type) ? ['preset', 'custom-values'] : ['preset']) : type === 'challenge-stages' ? ['preset'] : ['parameters'],
      accessibility: { keyboard: true, textAlternative: trace ? TRACE_TEXT : OTHER_TEXT[type]! },
    };
  });
const labEntries: ActivityMeta[] = algorithmIds.map(id => ({
  id: `lab:${id}`, type: 'lab', label: courses.find(c => c.slug === id)?.title, subjects: [LAB_ISLAND_ID, ...new Set(lessons.filter(l => l.labs?.includes(id)).map(l => l.islandId))],
  tier: 'T1', runtime: TIER_RUNTIME.T1, availability: 'implemented', inputs: ['custom-values'], version: '1.0.0',
  accessibility: { keyboard: true, textAlternative: '每一步的說明文字（aria-live）' },
}));

// ---- planned: the activities of the blueprint (tiers from INTERACTIVE_ACTIVITY_ARCHITECTURE §3) -------------------
const PLANNED: Record<string, [ActivityTier, ActivityInput[]]> = {
  // T2: the learner's SQL, run in a sandbox (needs a new dependency, approved separately).
  'sql-playground': ['T2', ['sql']],
  // F.1c: query plans come from the SQL sandbox (the learner's own SQL); the B+ tree takes the learner's keys.
  'query-plan': ['T2', ['sql', 'custom-values']],
  // F.1c: deterministic simulations of the write-ahead log and of locking / MVCC schedules.
  'transaction-timeline': ['T1', ['preset', 'parameters']],
  // F.1d: the round trips are the lesson's SQL run in the same sandbox; the system simulations are deterministic.
  'protocol-sequence': ['T2', ['preset', 'parameters']],
  // T3: results made ahead of time (model outputs, recorded responses, projections).
  'diffusion-steps': ['T3', ['preset', 'parameters']], 'latent-space': ['T3', ['preset', 'parameters']],
  'multimodal-pipeline': ['T3', ['preset']], 'training-curves': ['T3', ['preset', 'parameters']],
  'embedding-space': ['T3', ['preset', 'text']], 'prompt-lab': ['T3', ['preset', 'parameters']],
  'rag-explorer': ['T3', ['preset', 'parameters']], 'eval-dashboard': ['T3', ['preset', 'parameters']],
  // T1: deterministic simulations in the browser.
  'token-explorer': ['T1', ['text']], 'attention-explorer': ['T1', ['preset', 'parameters']], 'sampling-explorer': ['T1', ['parameters']],
  'erd-builder': ['T1', ['diagram']], 'uml-designer': ['T1', ['diagram']], 'architecture-diagram': ['T1', ['parameters']] /* F.1d: DB19's system simulations; drawing an architecture is not implemented */,
  'process-model': ['T1', ['diagram']], 'requirements-board': ['T1', ['diagram', 'text']], 'case-study-board': ['T1', ['text']],
  'ast-explorer': ['T1', ['preset', 'text']], 'type-checker': ['T1', ['preset', 'text']], 'compiler-pipeline': ['T1', ['preset', 'text']],
  'subnet-calculator': ['T1', ['custom-values']], 'routing-table': ['T1', ['preset', 'parameters']],
  // Multi-archipelago v2 (P1b): design and web activities, all deterministic in the browser. The contrast lab computes
  // WCAG ratios from the learner's colors; the layout playgrounds set style values on prepared boxes, never run the
  // learner's CSS; the accessibility checker reads prepared snippets only.
  'color-contrast': ['T1', ['custom-values']], 'visual-hierarchy': ['T1', ['parameters']], 'a11y-checker': ['T1', ['preset', 'parameters']],
  'design-token-board': ['T1', ['parameters']], 'flexbox-playground': ['T1', ['parameters']], 'grid-playground': ['T1', ['parameters']],
  'responsive-sim': ['T1', ['parameters']], 'mobile-nav-sim': ['T1', ['parameters']], 'dom-explorer': ['T1', ['preset']],
  'react-state-flow': ['T1', ['preset', 'parameters']],
  // P6/P7: systems and cloud activities, all simulated in the browser. The terminal runs a virtual file system with a
  // fixed set of commands, never a real shell; containers, requests, pipelines and clusters are state machines.
  'terminal-sim': ['T1', ['text']], 'container-playground': ['T1', ['preset', 'parameters']],
  'request-path': ['T1', ['preset', 'parameters']], 'pipeline-sim': ['T1', ['preset', 'parameters']],
  'cluster-sim': ['T1', ['preset', 'parameters']],
  'agent-workflow': ['T1', ['preset', 'parameters']], 'tool-call-trace': ['T1', ['preset', 'parameters']],
  'memory-inspector': ['T1', ['preset', 'parameters']], 'multi-agent-board': ['T1', ['preset', 'parameters']], 'guardrail-sim': ['T1', ['preset', 'parameters']],
};
const PLANNED_DEFAULT: [ActivityTier, ActivityInput[]] = ['T1', ['preset', 'parameters']];
/** What stands in for the picture in implemented activities. */
const IMPLEMENTED_TEXT: Record<string, string> = {
  'sql-playground': '結果是真正的表格（欄名與 NULL 以文字寫出），錯誤與執行摘要以 aria-live 宣告',
  // Phase F.1b (DB08–DB10).
  'erd-builder': 'ER 圖下方的文字版（每個實體的屬性與鍵、每個關係兩端的數量），檢查結果逐詞列出並以 aria-live 宣告',
  'normalization-steps': '函數相依、候選鍵、每張表的正規形式與是否無損都以文字寫出，檢查結果以 aria-live 宣告',
  // Phase F.1c (DB11–DB15).
  'query-plan': '查詢計畫的每一步以文字命名（全表掃描、索引搜尋、額外排序）；B+ 樹的每個節點與查詢經過的路徑以文字寫出（aria-live）',
  'transaction-timeline': '時間軸是表格（每一步的敘述與結果），已提交的值、交易內的值、日誌、等待與中止、發生的異常都以文字寫出（aria-live）',
  // Phase F.1d (DB16, DB19).
  'protocol-sequence': '每一次往返以文字列出（送出的 SQL、參數、傳回的列數），往返次數與總列數以 aria-live 宣告',
  // Multi-archipelago v2 (P4): the first tool lab of the Interactive Lab Island, /learn/color-contrast.
  'color-contrast': '對比率、每個 WCAG 等級（一般與大型文字、非文字元件）是否通過、建議的合格顏色都以文字寫出，並以 aria-live 宣告',
  'architecture-diagram': '架構圖有文字說明；複本讀到的值、是否過時、切換時遺失的寫入、還原步驟與資料損失都以表格與文字寫出（aria-live）',
};
const existing = new Set(visualizationEntries.map(v => v.id));
const plannedEntries: ActivityMeta[] = [...new Set(catalogLessons.map(l => l.activity))]
  .filter(id => !existing.has(id) && id !== 'none').sort()
  .map(id => {
    const [tier, inputs] = PLANNED[id] ?? PLANNED_DEFAULT;
    // Phase F.1a: an activity a complete lesson uses is implemented (the SQL playground, src/components/curriculum/sql-playground.tsx;
    // F.1b: the ER builder and the normalization steps, er-builder.tsx and normalization-workbench.tsx).
    // P4: an activity is also implemented when its standalone lab on the Interactive Lab Island is (one activity per lab).
    const lab = labRegistry.find(l => l.kind === 'tool' && l.activities.includes(id));
    const standalone = lab?.status === 'implemented' && lab.activities.length === 1;
    const implemented = standalone || catalogLessons.some(l => l.activity === id && l.lessonStatus === 'complete');
    return { id, type: 'activity', subjects: standalone ? [LAB_ISLAND_ID, ...subjectsOf(id)] : subjectsOf(id), tier, runtime: TIER_RUNTIME[tier],
      availability: implemented ? 'implemented' : 'planned', inputs, version: implemented ? '1.0.0' : '0.1.0',
      accessibility: { keyboard: true, textAlternative: IMPLEMENTED_TEXT[id] ?? '必要：實作時提供與畫面等效的文字說明' }, ...lab ? { lab: lab.id } : {} };
  });

export const activities: ActivityMeta[] = [...visualizationEntries, ...labEntries, ...plannedEntries];
export const getActivity = (id: string) => activities.find(a => a.id === id);
export const activitiesOfIsland = (islandId: string) => activities.filter(a => a.subjects.includes(islandId));

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Unique IDs, a known tier with its own runtime, valid inputs, existing subjects, and every lesson's activity known. */
export function validateActivities(list: readonly ActivityMeta[], islandIds: readonly string[]): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  const ids = new Set<string>();
  for (const a of list) {
    if (ids.has(a.id)) fail(a.id, 'duplicate activity');
    ids.add(a.id);
    if (!ACTIVITY_TIERS.includes(a.tier)) fail(a.id, `unknown tier ${a.tier}`);
    else if (a.runtime !== TIER_RUNTIME[a.tier]) fail(a.id, `tier ${a.tier} runs on ${TIER_RUNTIME[a.tier]}, not ${a.runtime}`);
    if (a.tier === 'T4') fail(a.id, 'T4 needs a backend, which is outside Phase F');
    if (a.type === 'visualization' && a.tier !== 'T0') fail(a.id, 'an existing visualization is T0');
    if (a.availability === 'planned' && a.type !== 'activity') fail(a.id, 'existing visualizations and labs are implemented');
    if (!a.inputs.length || a.inputs.some(i => !ACTIVITY_INPUTS.includes(i))) fail(a.id, 'invalid inputs');
    if (!a.accessibility.textAlternative.trim()) fail(a.id, 'needs a text alternative');
    if (!SEMVER.test(a.version)) fail(a.id, `version ${a.version} is not semver`);
    if (a.availability === 'implemented' === a.version.startsWith('0.')) fail(a.id, 'implemented is 1.0.0 or later, planned 0.x');
    for (const s of a.subjects) if (!islandIds.includes(s)) fail(a.id, `unknown island ${s}`);
  }
  for (const lesson of catalogLessons) if (lesson.activity !== 'none' && !ids.has(lesson.activity)) fail(lesson.lessonId, `unknown activity ${lesson.activity}`);
  return problems;
}
