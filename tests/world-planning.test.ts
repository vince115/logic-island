import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLUEPRINT, OUTPUT, PATHS, buildPlanningData, readJson, serialize } from '../scripts/planning-data.mjs';

// Phase F.0: src/content/world/planning-data.json is generated from docs/planning/data and must not drift from it.
describe('planning data (F.0)', () => {
  it('is what scripts/planning-data.mjs makes from the planning files (run it after editing them)', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(serialize(buildPlanningData(readJson(BLUEPRINT), readJson(PATHS))));
  });

  it('copies only planned lessons, as metadata', () => {
    const data = buildPlanningData(readJson(BLUEPRINT), readJson(PATHS));
    expect(data.plannedLessons).toHaveLength(260);
    for (const lesson of data.plannedLessons) {
      expect(lesson, lesson.lessonId).not.toHaveProperty('status');
      for (const field of ['sections', 'examples', 'quiz', 'exercises', 'content']) expect(lesson, lesson.lessonId).not.toHaveProperty(field);
    }
    expect(data.paths.map((p: { id: string }) => p.id)).toEqual([
      'A-apcs-cs-foundations', 'B-software-engineering', 'C-network-and-systems', 'D-enterprise-information-systems', 'E-ai-research', 'F-ai-application-engineering']);
  });
});
