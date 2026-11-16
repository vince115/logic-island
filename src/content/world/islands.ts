import { algorithmIds } from '@/lib/engine';
import { lessons } from '@/content/curriculum/lessons';
import type { LessonPrefix } from './lesson-id';
import planning from './planning-data.json';
import type { IslandConfig, IslandLink, Region, RegionId } from './types';

/*
 * Phase F.0: the regions and islands of the plan, and the shared Interactive Lab Island. Multi-archipelago v2 (P1b):
 * five regions (P6 adds sys), 29 subject islands; counts and codes follow docs/planning/ISLAND_TAXONOMY.md, and the totals are
 * pinned only by the taxonomy contract in tests/world.test.ts. Planned islands take their names and
 * description from the planning data (scripts/planning-data.mjs); the existing three keep the curriculum's text, and
 * src/content/curriculum/registry.ts now reads them from here.
 */

export const regions: Region[] = [
  // Multi-archipelago v2: display names as approved on 2026-11-12; IDs, lesson IDs and routes unchanged.
  { id: 'cs', name: '程式與資訊群島', nameEn: planning.regions.cs, order: 1 },
  { id: 'ai', name: 'AI 人工智慧群島', nameEn: planning.regions.ai, order: 2, groups: [
    // Whole islands by what their lessons teach (docs/planning/MULTI_ARCHIPELAGO_IA_V2.md §2.2). 「AI 架構」 is path J,
    // not a group: its lessons sit on three islands.
    { id: 'ai-core', label: 'AI 原理與模型', islandIds: ['ai-foundations', 'machine-learning', 'deep-learning'] },
    { id: 'ai-genai', label: '生成式 AI 與大型語言模型', islandIds: ['large-language-models', 'generative-ai'] },
    { id: 'ai-systems', label: 'AI 應用與系統工程', islandIds: ['ai-agents', 'ai-engineering'] },
  ] },
  { id: 'design', name: '數位設計群島', nameEn: planning.regions.design, order: 3 },
  { id: 'web', name: '網頁與應用開發群島', nameEn: planning.regions.web, order: 4 },
  // P6 (2026-11-12): the fifth region; six planned islands, no lesson written, no 3D map.
  { id: 'sys', name: '系統與雲端工程群島', nameEn: planning.regions.sys, order: 5,
    summary: '把程式放上真實的伺服器與雲端：Linux、Docker 容器、網路與伺服器、雲端基礎設施、DevOps 與 CI/CD、Kubernetes 與可靠性工程。協定原理沿用計算機網路島，AI 服務的部署細節沿用 AI 工程島。' },
];

const curriculumAnchor = (id: string) => ({ id: 'curriculum', label: '完整課綱', target: `/curriculum#island-${id}` });
/** The first lesson of a complete island, from the curriculum (the slug is not repeated here). */
function firstLesson(islandId: string) {
  const lesson = lessons.find(l => l.islandId === islandId);
  return lesson ? [{ id: 'first-lesson', label: '從第一堂開始', target: `/curriculum/${lesson.slug}` }] : [];
}

/** An existing island: its text is the curriculum's, its accent and landmark the 3D map's (src/lib/islands/data.ts). */
function existing(id: string, code: string, lessonPrefix: LessonPrefix, order: number, name: string, nameEn: string,
  description: string, theme: IslandConfig['theme'], links: IslandLink[]): IslandConfig {
  return { id, kind: 'subject', regionId: 'cs', code, order, name, nameEn, description, lessonPrefix, lessonCount: 20,
    status: 'complete', theme, entryPoints: [curriculumAnchor(id), ...firstLesson(id)], links, version: '1.0.0' };
}

/**
 * A new island from the plan. Its status follows from the curriculum (Phase F.1a): no written lesson → planned, with no
 * entry point (nothing to open) and no place on the map; some → available, entered through the catalog and its first
 * lesson; all → complete. Writing a lesson never needs an edit here. Phase F.2: an island on the home map also takes
 * the map's landmark text and the bridges the map draws (`map`).
 */
function fromPlan(id: keyof typeof planning.islands, lessonPrefix: LessonPrefix, order: number, lessonCount: number, accent: string,
  map?: { landmark: string; links: IslandLink[] }): IslandConfig {
  const { code, regionId, name, nameEn, description } = planning.islands[id];
  const written = lessons.filter(l => l.islandId === id && l.lessonStatus === 'complete').length;
  const status = written === 0 ? 'planned' : written < lessonCount ? 'available' : 'complete';
  return { id, kind: 'subject', regionId: regionId as RegionId, code, order, name, nameEn, description, lessonPrefix, lessonCount,
    status, theme: map ? { accent, landmark: map.landmark } : { accent }, entryPoints: written ? [curriculumAnchor(id), ...firstLesson(id)] : [], links: map?.links ?? [],
    version: status === 'planned' ? '0.1.0' : '0.2.0' };
}

export const LAB_ISLAND_ID = 'labs';

export const worldIslands: IslandConfig[] = [
  existing('foundations', 'F', 'F', 1, '基礎程式島', 'Programming Fundamentals',
    '從第一支程式到遞迴與複雜度：變數、輸入輸出、條件、迴圈、陣列、字串與函式。',
    { accent: '#4285f4', landmark: '燈塔工作坊 · 從理解開始' }, [{ to: 'structures', kind: 'bridge' }]),
  existing('structures', 'DS', 'D', 2, '資料結構島', 'Data Structures',
    '資料怎麼放，決定程式能多快：陣列、鏈結串列、堆疊、佇列、雜湊、樹、堆積與圖。',
    { accent: '#188038', landmark: '資料港 · 儲存、堆疊、流動' }, [{ to: 'algorithms', kind: 'bridge' }, { to: 'databases', kind: 'bridge' }]),
  existing('algorithms', 'AL', 'A', 3, '演算法島', 'Algorithms',
    '從分析到設計：搜尋、排序、雙指標、遞迴、貪心、圖論與動態規劃，最後對應 APCS 實作題型。',
    { accent: '#db4437', landmark: '探索山脊 · 比較與選擇' }, [{ to: LAB_ISLAND_ID, kind: 'bridge' }]),
  fromPlan('programming-languages', 'PL', 4, 20, '#5b6ee1'),
  // Phase F.2: on the home map, north-west of the structures island and joined to it by a bridge.
  fromPlan('databases', 'DB', 5, 20, '#2f7d6d', { landmark: '資料庫主塔 · 查詢、設計與交易', links: [] }),
  fromPlan('networks', 'CN', 6, 20, '#1a8fb0'),
  fromPlan('systems-analysis', 'SA', 7, 20, '#b07a1a'),
  fromPlan('information-systems', 'MIS', 8, 20, '#7a6a58'),
  fromPlan('ai-foundations', 'AIF', 1, 20, '#00897b'),
  fromPlan('machine-learning', 'ML', 2, 25, '#f29900'),
  fromPlan('deep-learning', 'DL', 3, 25, '#c2185b'),
  fromPlan('large-language-models', 'LLM', 4, 25, '#6a1b9a'),
  fromPlan('generative-ai', 'GEN', 5, 20, '#e8710a'),
  fromPlan('ai-agents', 'AG', 6, 25, '#3949ab'),
  fromPlan('ai-engineering', 'OPS', 7, 20, '#546e7a'),
  // Multi-archipelago v2 (P1b): planned islands of the design and web regions; no lesson is written, so no entry point.
  fromPlan('ui-design', 'UI', 1, 15, '#d81b60'),
  fromPlan('ux-research', 'UX', 2, 15, '#8e24aa'),
  fromPlan('interaction-design', 'IXD', 3, 14, '#00acc1'),
  fromPlan('design-systems', 'DSY', 4, 12, '#6d4c41'),
  fromPlan('web-foundations', 'WEB', 1, 15, '#e65100'),
  fromPlan('frontend', 'FE', 2, 15, '#0277bd'),
  fromPlan('responsive-design', 'RWD', 3, 12, '#558b2f'),
  fromPlan('mobile-apps', 'MOB', 4, 13, '#ad1457'),
  // P6: planned islands of the systems and cloud engineering region (docs/planning/P6_SYSTEMS_CLOUD_REGION.md).
  fromPlan('linux-systems', 'LNX', 1, 15, '#2e7d32'),
  fromPlan('docker-containers', 'DKR', 2, 15, '#1565c0'),
  fromPlan('network-servers', 'SRV', 3, 14, '#00838f'),
  fromPlan('cloud-infrastructure', 'CLD', 4, 15, '#5e35b1'),
  fromPlan('devops-cicd', 'CICD', 5, 15, '#ef6c00'),
  fromPlan('kubernetes-reliability', 'KUB', 6, 15, '#283593'),
  {
    id: LAB_ISLAND_ID, kind: 'tool', code: 'LAB', name: '互動實驗島', nameEn: 'Interactive Lab Island',
    description: '跨學科共用的工具島：自己輸入資料，逐步播放陣列、堆疊、佇列、搜尋、排序與圖的走訪；不是學科、沒有課程編號。',
    lessonCount: 0, status: 'available', theme: { accent: '#8a4fd1', landmark: '實驗穹頂 · 看見每一步' },
    entryPoints: [{ id: 'labs', label: '互動實驗島', target: '/learn' }], links: [], labs: algorithmIds, version: '1.0.0',
  },
];
