import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { curriculum } from '@/content/curriculum';
import { visualizations } from '@/content/curriculum/registry';
import { catalogLessons, contentStatusOf } from '@/content/world/catalog';
import { islandsInRegion, orderedRegions } from '@/content/world';
import { learningPaths } from '@/content/world/paths';
import { publishProblems } from '@/lib/curriculum/publish-gate';

/*
 * 2026-11-20 (course production, Phase 6): writes docs/curriculum/COURSE_PRODUCTION_PROGRESS.md from the catalog (what
 * is published or planned, by region and island), the curriculum (each written lesson's visualization or activity and
 * its publish-gate result) and docs/curriculum/data/course-production.json (the batches: lessons, commit, tests). Run
 * after each batch:
 *   node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/course-progress.ts
 *   ... scripts/course-progress.ts --check   (exit 1 if the report is out of date)
 */
interface Batch { id: number; date: string; lessons: string[]; commit: string; pr?: string; merged?: string; tests: string; notes?: string }
const ROOT = process.cwd(), DATA = path.join(ROOT, 'docs/curriculum/data/course-production.json'), OUT = path.join(ROOT, 'docs/curriculum/COURSE_PRODUCTION_PROGRESS.md');
const batches = (JSON.parse(readFileSync(DATA, 'utf8')) as { batches: Batch[] }).batches;
const batchOf = new Map(batches.flatMap(b => b.lessons.map(id => [id, b] as const)));
const meta = new Map(curriculum.lessons.map(l => [l.lessonId as string, l]));

const total = catalogLessons.length, published = catalogLessons.filter(l => contentStatusOf(l) === 'published').length;
const pct = (n: number, d: number) => `${(n / d * 100).toFixed(1)}%`;
const last = batches.at(-1);
const learnable = learningPaths.filter(p => p.completion.learnable);

const lines: string[] = [
  '# 課程生產進度（Course Production Progress）', '',
  '> 由 `scripts/course-progress.ts` 依目錄（catalog）、課綱內容與 `docs/curriculum/data/course-production.json` 產生，請勿手改。規格見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)。', '',
  '## 統計', '',
  '| 項目 | 數量 |', '|---|---|',
  `| 已發布課程 | ${published} |`, `| 規劃中課程 | ${total - published} |`, `| 課程總數 | ${total} |`,
  `| 整體覆蓋率 | ${pct(published, total)} |`,
  `| 最近一批（第 ${last?.id ?? '—'} 批）完成 | ${last?.lessons.length ?? 0} 堂（${last?.lessons.join('、') ?? '—'}） |`,
  `| 可完整學完的學習路線 | ${learnable.length} 條（${learnable.map(p => p.title).join('、') || '—'}）／${learningPaths.length} 條 |`, '',
  '## 批次', '',
  '| 批次 | 日期 | 課程 | Commit | PR | 合併 | 驗證 |', '|---|---|---|---|---|---|---|',
  ...batches.map(b => `| ${b.id} | ${b.date} | ${b.lessons.join('、')} | \`${b.commit}\` | ${b.pr ?? '—'} | ${b.merged ? `\`${b.merged}\`` : '未合併'} | ${b.tests} |`), '',
  '## 各區域與島嶼', '',
  '| 區域 | 島嶼 | 代碼 | 已發布 | 規劃中 | 覆蓋率 |', '|---|---|---|---|---|---|',
];
for (const region of orderedRegions) for (const island of islandsInRegion(region.id)) {
  const own = catalogLessons.filter(l => l.islandId === island.id), open = own.filter(l => contentStatusOf(l) === 'published').length;
  lines.push(`| ${region.name} | ${island.name} | ${island.code} | ${open} | ${own.length - open} | ${pct(open, own.length)} |`);
}
lines.push('', '## 各課程', '', '已發布或製作中的島嶼逐課列出；其餘島嶼的課程全部為規劃中，只列數量（見上表）。', '');
for (const region of orderedRegions) for (const island of islandsInRegion(region.id)) {
  const own = catalogLessons.filter(l => l.islandId === island.id);
  if (!own.some(l => contentStatusOf(l) === 'published')) continue;
  lines.push(`### ${region.name} · ${island.name}（${island.code}）`, '',
    '| 課程 | 名稱 | 製作狀態 | 教材完成度 | 互動 | 測試（發布閘門） | Commit | 發布狀態 |', '|---|---|---|---|---|---|---|---|');
  for (const l of own) {
    const m = meta.get(l.lessonId), content = m && curriculum.contents[m.lessonId], b = batchOf.get(l.lessonId);
    const done = Boolean(m?.lessonStatus === 'complete' && content);
    const interaction = !m ? '—' : m.activity ? `活動 ${m.activity}` : m.visualizationType === 'none' ? '無（表格與逐步說明）' : `${m.visualizationType}（${visualizations[m.visualizationType].status === 'implemented' ? '已實作' : '未實作'}）`;
    const gate = done ? (publishProblems(m!, content).length ? '未通過' : '通過') : '—';
    const state = contentStatusOf(l) === 'published' ? (b && !b.merged ? '已完成（待合併）' : '已發布') : '規劃中';
    lines.push(`| ${l.lessonId} | ${l.title} | ${done ? '完成' : '規劃中'} | ${done ? '100%' : '大綱'} | ${interaction} | ${gate} | ${b ? `\`${b.commit}\`` : done ? '先前階段' : '—'} | ${state} |`);
  }
  lines.push('');
}
const text = lines.join('\n');
if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== text) { console.error('COURSE_PRODUCTION_PROGRESS.md is out of date: run scripts/course-progress.ts'); process.exit(1); }
  console.log('COURSE_PRODUCTION_PROGRESS.md is up to date');
} else { writeFileSync(OUT, text); console.log(`wrote ${path.relative(ROOT, OUT)}: ${published}/${total} published`); }
