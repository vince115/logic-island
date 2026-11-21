import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { curriculum } from '@/content/curriculum';
import { catalogLessons, contentStatusOf, type CatalogLesson } from '@/content/world/catalog';
import { islandsInRegion, orderedRegions } from '@/content/world';
import { learningPaths } from '@/content/world/paths';
import { publishProblems } from '@/lib/curriculum/publish-gate';

/*
 * 2026-11-21 (autonomous curriculum production): writes docs/planning/AUTONOMOUS_CURRICULUM_PROGRESS.md, the queue a
 * session resumes from. Everything is computed from the catalog (what is published), the blueprint's prerequisites and
 * the curriculum (publish-gate results); the only declared input is each island's lesson capability and whether it
 * exists (docs/curriculum/data/island-capabilities.json). Run after each batch:
 *   node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/curriculum-queue.ts
 *   ... scripts/curriculum-queue.ts --check   (exit 1 if the file is out of date)
 */
type CapabilityStatus = 'ready' | 'prepared' | 'missing';
interface IslandCapability { capability: string; status: CapabilityStatus; note?: string }
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/planning/AUTONOMOUS_CURRICULUM_PROGRESS.md');
const CAPS = (JSON.parse(readFileSync(path.join(ROOT, 'docs/curriculum/data/island-capabilities.json'), 'utf8')) as { islands: Record<string, IslandCapability> }).islands;
const STATUS_LABEL: Record<CapabilityStatus, string> = { ready: '可用', prepared: '已備妥（可開始撰寫）', missing: '缺少' };
const BATCH = 5;

const byId = new Map(catalogLessons.map(l => [l.lessonId as string, l]));
const isPublished = (id: string) => { const l = byId.get(id); return !!l && contentStatusOf(l) === 'published'; };
const meta = new Map(curriculum.lessons.map(l => [l.lessonId as string, l]));
const gateOk = (id: string) => { const m = meta.get(id), c = m && curriculum.contents[m.lessonId]; return !!(m && c && !publishProblems(m, c).length); };

// ---- graph checks ----------------------------------------------------------------------------------------------
const problems: string[] = [];
for (const l of catalogLessons) for (const p of l.prerequisites) {
  const pre = byId.get(p);
  if (!pre) problems.push(`${l.lessonId} 的先修 ${p} 不存在`);
  else if (pre.islandId === l.islandId && catalogLessons.indexOf(pre) > catalogLessons.indexOf(l)) problems.push(`${l.lessonId} 的先修 ${p} 排在它之後（編號即位置，無法依序發布）`);
}
// Kahn's algorithm over every lesson, stable in catalog order: a cycle leaves lessons unsorted.
const indegree = new Map(catalogLessons.map(l => [l.lessonId as string, l.prerequisites.filter(p => byId.has(p)).length]));
const dependents = new Map<string, string[]>();
for (const l of catalogLessons) for (const p of l.prerequisites) dependents.set(p, [...dependents.get(p) ?? [], l.lessonId]);
const order: string[] = [], queue = catalogLessons.filter(l => indegree.get(l.lessonId) === 0).map(l => l.lessonId as string);
while (queue.length) {
  const id = queue.shift()!;
  order.push(id);
  for (const d of dependents.get(id) ?? []) { indegree.set(d, indegree.get(d)! - 1); if (indegree.get(d) === 0) queue.push(d); }
}
if (order.length !== catalogLessons.length) problems.push(`先修關係有循環：${catalogLessons.length - order.length} 堂無法排序`);
/** Every lesson that needs this one, directly or not. */
const reach = (id: string, seen = new Set<string>()): Set<string> => { for (const d of dependents.get(id) ?? []) if (!seen.has(d)) { seen.add(d); reach(d, seen); } return seen; };

// ---- islands: frontier and the next runnable run ------------------------------------------------------------------
interface IslandRow { regionName: string; island: { id: string; name: string; code: string }; own: CatalogLesson[]; open: number; cap: IslandCapability;
  run: CatalogLesson[]; blocked?: { lesson: CatalogLesson; missing: string[] }; unlocks: number }
const rows: IslandRow[] = [];
for (const region of orderedRegions) for (const island of islandsInRegion(region.id)) {
  const own = catalogLessons.filter(l => l.islandId === island.id);
  if (!own.length) continue;
  const open = own.filter(l => isPublished(l.lessonId)).length;
  const cap = CAPS[island.id] ?? { capability: '未定義', status: 'missing' as const };
  // Lesson ids are positions: an island publishes 01..n in order, so the next run starts at the first unpublished one
  // and continues while each lesson's prerequisites are published or earlier in the run.
  const run: CatalogLesson[] = [];
  let blocked: IslandRow['blocked'];
  for (const l of own.slice(open)) {
    const missing = l.prerequisites.filter(p => !isPublished(p) && !run.some(r => r.lessonId === p));
    if (missing.length) { blocked = { lesson: l, missing }; break; }
    run.push(l);
  }
  const unlocks = new Set(run.slice(0, BATCH).flatMap(l => [...reach(l.lessonId)].filter(d => byId.get(d)!.islandId !== island.id))).size;
  rows.push({ regionName: region.name, island: { id: island.id, name: island.name, code: island.code }, own, open, cap, run, blocked, unlocks });
}
const rank: Record<CapabilityStatus, number> = { ready: 0, prepared: 1, missing: 2 };
const candidates = rows.filter(r => r.open < r.own.length && r.run.length)
  .sort((a, b) => rank[a.cap.status] - rank[b.cap.status] || b.unlocks - a.unlocks || rows.indexOf(a) - rows.indexOf(b));
const next = candidates.find(r => r.cap.status !== 'missing');
const capabilityFirst = candidates.find(r => r.cap.status === 'missing');

// ---- report ------------------------------------------------------------------------------------------------------
const total = catalogLessons.length, published = catalogLessons.filter(l => isPublished(l.lessonId)).length;
const pct = (n: number, d: number) => `${(n / d * 100).toFixed(1)}%`;
const list = (ids: string[]) => ids.length ? ids.join('、') : '—';
const lines: string[] = [
  '# 自主課程生產進度與佇列（Autonomous Curriculum Production）', '',
  '> 由 `scripts/curriculum-queue.ts` 依目錄（catalog）、藍圖先修與課綱內容（發布閘門）計算產生，請勿手改；唯一宣告的輸入是各島需要的課程能力與其狀態（`docs/curriculum/data/island-capabilities.json`）。批次紀錄見 [COURSE_PRODUCTION_PROGRESS](../curriculum/COURSE_PRODUCTION_PROGRESS.md)。', '',
  '## 恢復工作', '',
  '新的 Session 從這裡接續：', '',
  '1. `git fetch origin`，確認 `origin/main`、`git worktree list` 與未合併的課程 PR；不碰其他 Session 的 worktree。',
  '2. 重新產生本檔（上方指令），讀「下一批」與「能力缺口」。',
  '3. 依 [COURSE_CONTENT_SPECIFICATION](../curriculum/COURSE_CONTENT_SPECIFICATION.md) 的流程製作、驗證、發布，並更新 `docs/curriculum/data/course-production.json`、本檔與課程進度報告。',
  '4. 只有在需要產品負責人決策（破壞性操作、敏感資料、不可逆的產品架構）或沒有其他可安全進行的工作時才停止。', '',
  '## 總覽', '',
  `已發布 **${published}／${total}**（${pct(published, total)}）；規劃中 ${total - published}。`, '',
  '| 區域 | 已發布 | 規劃中 | 覆蓋率 |', '|---|---|---|---|',
  ...orderedRegions.map(region => {
    const own = catalogLessons.filter(l => rows.some(r => r.regionName === region.name && r.island.id === l.islandId));
    const open = own.filter(l => isPublished(l.lessonId)).length;
    return `| ${region.name} | ${open} | ${own.length - open} | ${own.length ? pct(open, own.length) : '—'} |`;
  }), '',
  '## 下一批（自動選擇）', '',
  next ? `**${next.island.name}（${next.island.code}）**：${next.run.slice(0, BATCH).map(l => `${l.lessonId} ${l.title}`).join('、')}。島嶼能力：${STATUS_LABEL[next.cap.status]}；這幾堂解鎖其他島的 ${next.unlocks} 堂。` : '目前沒有能力已備妥、先修已滿足的島嶼；先處理「能力缺口」的第一項。', '',
  capabilityFirst ? `能力缺口中最優先的是 **${capabilityFirst.island.name}（${capabilityFirst.island.code}）**：需要 ${capabilityFirst.cap.capability}；先修已滿足、可依序撰寫的有 ${capabilityFirst.run.length} 堂，前 ${Math.min(BATCH, capabilityFirst.run.length)} 堂解鎖其他島的 ${capabilityFirst.unlocks} 堂。` : '', '',
  '選擇規則：島嶼的課程能力已可用或已備妥 → 先修已滿足（編號即位置，只能從下一個未發布的編號連續往後）→ 解鎖其他島的課程較多 → 區域與島嶼順序。', '',
  '## 島嶼狀態', '',
  '| 區域 | 島嶼 | 已發布 | 課程能力 | 能力狀態 | 下一段可依序撰寫 | 阻礙 |', '|---|---|---|---|---|---|---|',
  ...rows.map(r => {
    const done = r.open === r.own.length;
    const runText = done ? '全島完成' : r.run.length ? `${r.run[0].lessonId}–${r.run.at(-1)!.lessonId}（${r.run.length} 堂）` : '—';
    const block = [r.cap.status === 'missing' && !done ? '缺少課程能力' : '', r.blocked ? `${r.blocked.lesson.lessonId} 需要尚未發布的 ${list(r.blocked.missing)}` : ''].filter(Boolean).join('；') || '—';
    return `| ${r.regionName} | ${r.island.name}（${r.island.code}） | ${r.open}／${r.own.length} | ${r.cap.capability} | ${STATUS_LABEL[r.cap.status]} | ${runText} | ${block} |`;
  }), '',
  '## 能力缺口', '',
  '依「先修已滿足、可依序撰寫的課程數」與「解鎖其他島的課程數」排序；建立能力時只做最小可用、可被多堂課重用的版本。', '',
  '| 島嶼 | 需要的能力 | 可依序撰寫 | 解鎖其他島 | 備註 |', '|---|---|---|---|---|',
  ...candidates.filter(r => r.cap.status === 'missing').map(r => `| ${r.island.name}（${r.island.code}） | ${r.cap.capability} | ${r.run.length} | ${r.unlocks} | ${r.cap.note ?? '—'} |`), '',
  '## 學習路線', '',
  '| 路線 | 已發布 | 可完整學完 |', '|---|---|---|',
  ...learningPaths.map(p => `| ${p.title} | ${p.completion.completeLessons}／${p.completion.lessonCount} | ${p.completion.learnable ? '是' : '否'} |`), '',
  '## 先修依賴檢查', '',
  problems.length ? problems.map(p => `- ${p}`).join('\n') : `- ${total} 堂課的先修都存在、沒有循環；同島的先修都排在前面，依編號發布即符合拓樸順序。`, '',
  '## 各課程', '',
  '狀態：已發布（閘門通過）、已撰寫未通過閘門、大綱（能力與先修就緒）、待能力（島嶼缺少課程能力）、待先修（先修尚未發布）。', '',
];
for (const r of rows) {
  lines.push(`### ${r.regionName} · ${r.island.name}（${r.island.code}）`, '', '| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |', '|---|---|---|---|---|---|');
  for (const l of r.own) {
    const unmet = l.prerequisites.filter(p => !isPublished(p));
    const state = isPublished(l.lessonId) ? (gateOk(l.lessonId) ? '已發布（閘門通過）' : '已撰寫未通過閘門')
      : r.cap.status === 'missing' ? '待能力' : unmet.length ? '待先修' : '大綱';
    const block = isPublished(l.lessonId) ? '—' : [r.cap.status === 'missing' ? '課程能力' : '', unmet.length ? `先修 ${list(unmet)}` : ''].filter(Boolean).join('、') || '—';
    lines.push(`| ${l.lessonId} | ${l.title} | ${state} | ${list(l.prerequisites)} | ${l.activity} | ${block} |`);
  }
  lines.push('');
}
const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as out of date */ }
  if (current !== text) { console.error(`${path.relative(ROOT, OUT)} is out of date: run scripts/curriculum-queue.ts`); process.exit(1); }
  console.log(`${path.relative(ROOT, OUT)} is up to date`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${published}/${total} published; next: ${next ? `${next.island.code} ${next.run.slice(0, BATCH).map(l => l.lessonId).join(' ')}` : 'none'}`);
}
