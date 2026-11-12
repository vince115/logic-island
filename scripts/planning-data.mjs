/*
 * Phase F.0: turns the planning data (docs/planning/data) into the metadata the site reads
 * (src/content/world/planning-data.json). The planning files stay the source; the output is generated, never edited by
 * hand, and tests/world-planning.test.ts fails when it is out of date.
 *
 *   node scripts/planning-data.mjs          write the output
 *   node scripts/planning-data.mjs --check  exit 1 if the output is out of date
 *
 * Only planned lessons are copied: the 60 complete lessons come from src/content/curriculum (their blueprint entries are
 * references, compared by the tests). Planned lessons get metadata only: no content, quiz, exercise or page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BLUEPRINT = 'docs/planning/data/curriculum-blueprint.json';
export const PATHS = 'docs/planning/data/learning-paths.json';
export const OUTPUT = 'src/content/world/planning-data.json';

/** Blueprint lesson fields → site field names (ISLAND_CONFIG_DESIGN §7); optional ones are kept only when present. */
function plannedLesson(lesson, islands) {
  const island = islands[lesson.island];
  if (!island) throw new Error(`${lesson.id}: unknown island ${lesson.island}`);
  return {
    lessonId: lesson.id, islandId: island.islandId, slug: lesson.slug, title: lesson.titleZh, titleEn: lesson.titleEn,
    difficulty: lesson.difficulty, learningObjectives: lesson.objectives, concepts: lesson.concepts,
    prerequisites: lesson.prerequisites, recommended: lesson.recommended ?? [], activity: lesson.activity,
    exerciseType: lesson.exerciseType, outcome: lesson.outcome,
    ...(lesson.gaps?.length ? { gaps: lesson.gaps } : {}), ...(lesson.track ? { track: lesson.track } : {}),
  };
}

/** The whole transformation, pure: same input, same output. */
export function buildPlanningData(blueprint, paths) {
  const islands = Object.fromEntries(Object.values(blueprint.islands).map(i =>
    [i.islandId, { code: i.island, regionId: i.region, name: i.titleZh, nameEn: i.titleEn, description: i.summaryZh }]));
  return {
    source: { blueprint: BLUEPRINT, blueprintVersion: blueprint.version, paths: PATHS, pathsVersion: paths.version },
    regions: blueprint.regions,
    islands,
    plannedLessons: blueprint.lessons.filter(l => l.status === 'planned').map(l => plannedLesson(l, blueprint.islands)),
    paths: paths.paths.map(p => ({ id: p.id, title: p.nameZh, titleEn: p.nameEn, targets: p.targets, lessons: p.lessons })),
  };
}

export const serialize = data => JSON.stringify(data, null, 2) + '\n';
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = serialize(buildPlanningData(readJson(BLUEPRINT), readJson(PATHS)));
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== text) { console.error(`${OUTPUT} is out of date: run node scripts/planning-data.mjs`); process.exit(1); }
    console.log(`${OUTPUT} is up to date`);
  } else {
    writeFileSync(OUTPUT, text);
    console.log(`wrote ${OUTPUT}`);
  }
}
