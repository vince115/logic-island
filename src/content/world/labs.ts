import { courses, type Course } from '@/content/courses';
import { lessons } from '@/content/curriculum/lessons';
import { catalogLessons, contentStatusOf, type ContentStatus } from './catalog';

/*
 * Multi-archipelago v2 (P4): the Interactive Lab Island's registry. The island is a tool shared by every region, so a
 * lab belongs to a learning domain, not to a region, and any number of lessons may use it. Two kinds share /learn:
 *
 * - algorithm: the six labs of src/content/courses.ts, played by src/components/lab.tsx on src/lib/engine.ts. Their
 *   data and engine are untouched; this registry only reads them.
 * - tool: a lab with its own component (the first is 色彩與無障礙實驗室). It is the standalone entry of an activity the
 *   lesson blueprint already names (`activity`), so lessons reach it through that id; nothing else lists its lessons.
 *
 * A planned lab is shown as 規劃中 and gets no route. Lesson links are derived: an algorithm lab is used by lessons
 * whose `labs` name it, a tool lab by lessons whose `activity` is one of its activities.
 */

// P7: systems-cloud joins for the fifth region; still one shared island and one registry, no second lab engine.
export const LAB_DOMAINS = ['data-structures', 'algorithms', 'ui-ux', 'web-design', 'mobile', 'ai', 'systems-cloud'] as const;
export type LabDomain = typeof LAB_DOMAINS[number];
export const LAB_DOMAIN_LABELS: Record<LabDomain, string> = {
  'data-structures': '資料結構', algorithms: '演算法', 'ui-ux': 'UI／UX', 'web-design': '網頁設計', mobile: '行動裝置設計', ai: 'AI',
  'systems-cloud': '系統與雲端',
};

/** Code labs: Think → Visualize → Code. Design labs: Understand → Experiment → Build. */
export type LabApproach = 'code' | 'design';
export const APPROACH_STEPS: Record<LabApproach, readonly [string, string, string]> = {
  code: ['Think', 'Visualize', 'Code'], design: ['Understand', 'Experiment', 'Build'],
};

export interface LabEntry {
  /** Stable id; also the route /learn/<id> once implemented. Algorithm labs keep their course slug. */
  id: string;
  kind: 'algorithm' | 'tool';
  domain: LabDomain;
  title: string;
  summary: string;
  approach: LabApproach;
  status: 'implemented' | 'planned';
  /** The blueprint activities this lab is the standalone entry of (tool labs). */
  activities: string[];
  objectives?: string[];
}

const ALGORITHM_DOMAIN: Record<Course['category'], LabDomain> = { 資料結構: 'data-structures', 搜尋與排序: 'algorithms', 圖論: 'algorithms' };
const algorithmLabs: LabEntry[] = courses.map(c => ({
  id: c.slug, kind: 'algorithm', domain: ALGORITHM_DOMAIN[c.category], title: `${c.title} · ${c.subtitle}`, summary: c.description,
  approach: 'code', status: 'implemented', activities: [], objectives: c.learningObjectives,
}));

const toolLabs: LabEntry[] = [
  { id: 'color-contrast', kind: 'tool', domain: 'ui-ux', title: '色彩與無障礙實驗室', approach: 'design', status: 'implemented', activities: ['color-contrast'],
    summary: '調整文字與背景色，即時計算 WCAG 對比率，判斷一般文字與大型文字是否通過 AA／AAA，並找出最接近的合格顏色。',
    objectives: ['依 WCAG 公式計算兩個顏色的對比率', '區分一般文字與大型文字的門檻', '把不合格的配色調整到 AA 或 AAA'] },
  { id: 'responsive-layout', kind: 'tool', domain: 'web-design', title: 'Responsive Layout Playground', approach: 'design', status: 'planned',
    activities: ['flexbox-playground', 'grid-playground', 'responsive-sim'], summary: '調整 Flexbox 與 CSS Grid 參數、容器寬度與斷點，即時預覽版面並顯示對應的 CSS。' },
  { id: 'mobile-ux', kind: 'tool', domain: 'mobile', title: 'Mobile UX Simulator', approach: 'design', status: 'planned',
    activities: ['mobile-nav-sim'], summary: '在不同裝置尺寸比較 Tab bar、Drawer、Bottom sheet，檢查觸控目標與安全區域。' },
  { id: 'accessibility-checker', kind: 'tool', domain: 'ui-ux', title: 'Accessibility Checker', approach: 'design', status: 'planned',
    activities: ['a11y-checker'], summary: '用預備的介面片段練習找出缺少名稱、焦點順序錯誤與只靠顏色傳達的問題。' },
  { id: 'embedding-similarity', kind: 'tool', domain: 'ai', title: 'Embedding Similarity Explorer', approach: 'design', status: 'planned',
    activities: ['embedding-space'], summary: '以預先計算的向量與 2D 投影，比較句子之間的相似度。' },
  { id: 'prompt-playground', kind: 'tool', domain: 'ai', title: 'Prompt Playground', approach: 'design', status: 'planned',
    activities: ['prompt-lab'], summary: '比較不同提示版本的預錄回應；不呼叫真實的語言模型。' },
  { id: 'rag-pipeline', kind: 'tool', domain: 'ai', title: 'RAG Pipeline Visualization', approach: 'design', status: 'planned',
    activities: ['rag-explorer'], summary: '逐步看見切塊、檢索、重排序與組合提示，資料與分數皆為預先計算。' },
  // P7 (docs/planning/P7_SYSTEMS_LABS.md): simulations only; nothing runs a real shell, Docker daemon or network request.
  { id: 'linux-terminal', kind: 'tool', domain: 'systems-cloud', title: 'Linux Terminal Simulator', approach: 'code', status: 'planned',
    activities: ['terminal-sim'], summary: '在瀏覽器內的虛擬檔案系統練習 pwd、ls、cd、mkdir、touch、cat、cp、mv、rm 與 chmod；不執行真實的 Shell，也不存取主機檔案。',
    objectives: ['在目錄樹中用相對與絕對路徑移動', '建立、複製、移動與刪除檔案', '讀懂並設定 rwx 權限'] },
  { id: 'docker-playground', kind: 'tool', domain: 'systems-cloud', title: 'Docker Container Playground', approach: 'code', status: 'planned',
    activities: ['container-playground'], summary: '以狀態機模擬 Image → Container → Volume → Network：建置、執行、停止、刪除、掛載與連線；不啟動真實的 Docker Daemon。' },
  { id: 'network-request', kind: 'tool', domain: 'systems-cloud', title: 'Network Request Visualizer', approach: 'code', status: 'planned',
    activities: ['request-path'], summary: '逐步觀察 Browser → DNS → TLS → Reverse Proxy → Application → Database 的一次請求；資料為預先定義的情境。' },
  { id: 'cicd-pipeline', kind: 'tool', domain: 'systems-cloud', title: 'CI/CD Pipeline Simulator', approach: 'code', status: 'planned',
    activities: ['pipeline-sim'], summary: '模擬 Commit → Build → Test → Deploy → Monitor，切換成功、失敗與回滾情境。' },
];

export const labRegistry: LabEntry[] = [...algorithmLabs, ...toolLabs];
export const getLab = (id: string) => labRegistry.find(l => l.id === id);
export const implementedToolLabs = () => toolLabs.filter(l => l.status === 'implemented');
export const labsOfDomain = (domain: LabDomain) => labRegistry.filter(l => l.domain === domain);

/** A lesson that uses a lab, with its content status: only published ones are links. */
export interface LabLesson { lessonId: string; title: string; slug: string; status: ContentStatus }
/** The lessons that use a lab, in catalog order (derived, never stored). */
export function lessonsUsingLab(lab: LabEntry): LabLesson[] {
  const uses = lab.kind === 'algorithm'
    ? new Set(lessons.filter(l => l.labs?.includes(lab.id as never)).map(l => l.lessonId as string))
    : new Set(catalogLessons.filter(l => lab.activities.includes(l.activity)).map(l => l.lessonId as string));
  return catalogLessons.filter(l => uses.has(l.lessonId)).map(l => ({ lessonId: l.lessonId, title: l.title, slug: l.slug, status: contentStatusOf(l) }));
}

/** Registry rules: unique ids, known domains, algorithm labs match the courses, tool labs name activities of the plan. */
export function validateLabs(list: readonly LabEntry[], activityIds: ReadonlySet<string>): string[] {
  const problems: string[] = [], fail = (at: string, what: string) => problems.push(`${at}: ${what}`);
  const ids = new Set<string>();
  for (const lab of list) {
    if (ids.has(lab.id)) fail(lab.id, 'duplicate lab id');
    ids.add(lab.id);
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(lab.id)) fail(lab.id, 'id is not kebab-case');
    if (!LAB_DOMAINS.includes(lab.domain)) fail(lab.id, `unknown domain ${lab.domain}`);
    if (!lab.title.trim() || !lab.summary.trim()) fail(lab.id, 'needs a title and a summary');
    if (lab.kind === 'algorithm') {
      if (!courses.some(c => c.slug === lab.id)) fail(lab.id, 'an algorithm lab is one of the six courses');
      if (lab.status !== 'implemented') fail(lab.id, 'the algorithm labs are implemented');
    } else {
      if (!lab.activities.length) fail(lab.id, 'a tool lab is the entry of at least one activity');
      for (const a of lab.activities) if (!activityIds.has(a)) fail(lab.id, `unknown activity ${a}`);
    }
  }
  return problems;
}
