import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLUEPRINT, OUTPUT, PATHS, buildPlanningData, readJson, serialize } from '../scripts/planning-data.mjs';

// Phase F.0: src/content/world/planning-data.json is generated from docs/planning/data and must not drift from it.
describe('planning data (F.0)', () => {
  it('is what scripts/planning-data.mjs makes from the planning files (run it after editing them)', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(serialize(buildPlanningData(readJson(BLUEPRINT), readJson(PATHS))));
  });

  it('copies only planned lessons, as metadata', () => {
    const blueprint = readJson(BLUEPRINT), data = buildPlanningData(blueprint, readJson(PATHS));
    // Every blueprint lesson except the references to the 60 lessons of F, D and A, which come from the curriculum.
    const references = blueprint.lessons.filter((l: { status: string }) => l.status !== 'planned');
    expect(references).toHaveLength(60);
    expect(data.plannedLessons).toHaveLength(blueprint.lessons.length - references.length);
    for (const lesson of data.plannedLessons) {
      expect(lesson, lesson.lessonId).not.toHaveProperty('status');
      for (const field of ['sections', 'examples', 'quiz', 'exercises', 'content']) expect(lesson, lesson.lessonId).not.toHaveProperty(field);
    }
    expect(data.paths.map((p: { id: string }) => p.id)).toEqual([
      'A-apcs-cs-foundations', 'B-software-engineering', 'C-network-and-systems', 'D-enterprise-information-systems', 'E-ai-research', 'F-ai-application-engineering', 'J-ai-architecture']);
  });
});
