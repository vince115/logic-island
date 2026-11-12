import { getCatalogLesson } from './catalog';
import { parseLessonId, type AnyLessonId } from './lesson-id';
import planning from './planning-data.json';

/*
 * Phase F.0 learning paths (docs/planning/LEARNING_PATHS.md): six cross-island routes, read from the planning data.
 * A path is its target lessons plus every required prerequisite of them (transitively), in dependency order; recommended
 * lessons are listed beside it, never added to it. Completion is computed from the learner's progress at runtime and
 * never stored here.
 */

export interface LearningPath {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  /** The lessons the path is for. */
  targets: AnyLessonId[];
  /** Everything to learn, in order: the targets and their required prerequisites. */
  lessons: AnyLessonId[];
  /** Lessons on the path only because a target requires them. */
  requiredPrerequisites: AnyLessonId[];
  /** Lessons outside the path that its lessons recommend: optional, shown as hints. */
  recommendedPrerequisites: AnyLessonId[];
  /** Background the path needs that no island teaches, in order of first use. */
  gaps: string[];
  /** Content readiness, not progress: how many of its lessons are built. */
  completion: { lessonCount: number; completeLessons: number; plannedLessons: number; learnable: boolean; rule: 'all-lessons' };
}

/** What each path leads to (LEARNING_PATHS §3, 成果). */
const DESCRIPTIONS: Record<string, string> = {
  'A-apcs-cs-foundations': '基礎程式、資料結構與演算法的 60 堂：能用四種語言寫出並分析 APCS 程度的程式與演算法。',
  'B-software-engineering': '程式語言、資料庫與系統分析：能從需求、建模、資料庫設計到架構與測試，完成小型系統的設計文件與原型。',
  'C-network-and-systems': '計算機網路與資料庫整合：能追蹤一個 HTTP 請求從 DNS、TCP、TLS 到資料庫的完整路徑，並建立有 API 與資料庫的網路服務。',
  'D-enterprise-information-systems': '資料庫、系統分析與管理資訊系統：能分析企業流程、設計資訊系統，並評估 ERP／BI 等方案的商業價值與風險。',
  'E-ai-research': 'AI 基礎、機器學習、深度學習、LLM 模型軌與生成式 AI：能從原理推導並實作與訓練神經網路，理解 Transformer、LLM 與擴散模型。',
  'F-ai-application-engineering': 'LLM 應用軌、AI 代理與 AI 工程：能設計、實作、評估並上線以 LLM 與工具呼叫為核心的 AI 應用；不需要機器學習或深度學習。',
  // R7 (2026-11-12): the two paths of the design and web regions (IA v2 §2.7, candidates G and H, approved with R7).
  'G-frontend-engineering': '網頁基礎、響應式設計、前端開發與行動應用：能用 HTML、CSS、JavaScript 與 React／Next.js 做出可存取、響應式的網站並上線；只需要基礎程式島的變數、條件、迴圈與函式。',
  'H-product-design': '介面設計、使用者研究、互動設計與設計系統：能從研究、資訊架構、原型到可用性測試，交付一個小型設計系統；不需要寫程式。',
  // Multi-archipelago v2 (P1b): the 「AI 架構」 theme is a path, not a navigation group, because its lessons sit on three islands.
  'J-ai-architecture': '模型與供應商選擇、MCP、Agent 護欄與安全、評估、可觀測性與上線維運：能做出 AI 系統的架構決策，並說明安全、成本與評估的取捨；不需要機器學習或深度學習。',
  // P6: three paths into the systems and cloud engineering region (docs/planning/P6_SYSTEMS_CLOUD_REGION.md §5).
  'K-fullstack-deployment': 'Next.js 前端與資料庫串接，到 Docker、Linux 主機、TLS 與反向代理、部署管線與雲端虛擬機：能把自己寫的網頁應用部署上線。後端框架目前沒有對應的島，以資料庫串接（DB16）代替。',
  'L-ai-infrastructure': 'LLM API 與 AI 服務、GPU 推論，到容器、雲端主機、部署管線與 Kubernetes 可觀測性：能把 AI 服務部署到可擴展、可監控的基礎設施上。CUDA 與 GPU 叢集管理列為未來進階方向。',
  'M-cloud-devops-foundations': 'IP、TCP 與 HTTP 的協定基礎，到 Linux、網路診斷、容器、VPC 與 Terraform、CI/CD 與 Kubernetes 滾動更新：雲端與 DevOps 工程的入門路線。作業系統原理目前沒有對應的島，列為課程缺口。',
};

function build(path: (typeof planning.paths)[number]): LearningPath {
  const lessons = path.lessons as AnyLessonId[], on = new Set<string>(lessons), targets = new Set<string>(path.targets);
  const recommended: AnyLessonId[] = [], gaps: string[] = [];
  for (const id of lessons) {
    const lesson = getCatalogLesson(id);
    for (const r of lesson?.recommended ?? []) if (!on.has(r) && !recommended.includes(r)) recommended.push(r);
    for (const g of lesson?.gaps ?? []) if (!gaps.includes(g)) gaps.push(g);
  }
  const complete = lessons.filter(id => getCatalogLesson(id)?.lessonStatus === 'complete').length;
  return {
    id: path.id, title: path.title, titleEn: path.titleEn, description: DESCRIPTIONS[path.id] ?? '', targets: path.targets as AnyLessonId[], lessons,
    requiredPrerequisites: lessons.filter(id => !targets.has(id)), recommendedPrerequisites: recommended.sort(byId), gaps,
    completion: { lessonCount: lessons.length, completeLessons: complete, plannedLessons: lessons.length - complete, learnable: complete === lessons.length, rule: 'all-lessons' },
  };
}
function byId(a: string, b: string) { return a.localeCompare(b, 'en', { numeric: true }); }

export const learningPaths: LearningPath[] = planning.paths.map(build);
export const getLearningPath = (id: string) => learningPaths.find(p => p.id === id);
/** Paths that include a lesson. */
export const pathsWithLesson = (lessonId: string) => learningPaths.filter(p => p.lessons.includes(lessonId as AnyLessonId));
/** A learner's progress along a path, from whatever says a lesson is completed (src/lib/progress.ts at runtime). */
export function pathProgress(path: LearningPath, isCompleted: (lessonId: string) => boolean) {
  const completed = path.lessons.filter(isCompleted).length;
  return { completed, total: path.lessons.length, done: completed === path.lessons.length };
}

const ML_DL = new Set(['ML', 'DL']);

/**
 * The path rules: every lesson exists once, the targets are on the path, each lesson's required prerequisites come
 * before it, the path holds exactly the targets and their required prerequisites (so nothing recommended was made
 * required), and AI Application Engineering (path F) has no Machine Learning or Deep Learning lesson.
 */
export function validatePaths(paths: readonly LearningPath[]): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  if (new Set(paths.map(p => p.id)).size !== paths.length) fail('paths', 'duplicate path id');
  for (const path of paths) {
    const at = path.id, position = new Map(path.lessons.map((id, i) => [id as string, i]));
    if (!path.title.trim() || !path.description.trim()) fail(at, 'needs a title and a description');
    if (position.size !== path.lessons.length) fail(at, 'a lesson appears twice');
    for (const id of path.targets) if (!position.has(id)) fail(at, `target ${id} is not on the path`);
    for (const id of path.lessons) {
      const lesson = getCatalogLesson(id);
      if (!lesson) { fail(at, `unknown lesson ${id}`); continue; }
      for (const p of lesson.prerequisites) {
        if (!position.has(p)) fail(at, `${id} requires ${p}, which is not on the path`);
        else if (position.get(p)! > position.get(id)!) fail(at, `${id} comes before its prerequisite ${p}`);
      }
    }
    const closure = new Set<string>(), stack: string[] = [...path.targets];
    while (stack.length) {
      const id = stack.pop()!;
      if (closure.has(id)) continue;
      closure.add(id);
      stack.push(...(getCatalogLesson(id)?.prerequisites ?? []));
    }
    for (const id of path.lessons) if (!closure.has(id)) fail(at, `${id} is neither a target nor required by one (recommended lessons stay off the path)`);
    if (at.startsWith('F-')) for (const id of path.lessons) if (ML_DL.has(parseLessonId(id)?.prefix ?? '')) fail(at, `${id}: the AI application path must not require Machine Learning or Deep Learning`);
  }
  return problems;
}
