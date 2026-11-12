import { describe, expect, it } from 'vitest';
import { courses } from '@/content/courses';
import { activities } from '@/content/world/activities';
import { getLab, implementedToolLabs, LAB_DOMAINS, labRegistry, lessonsUsingLab, validateLabs } from '@/content/world/labs';

// Multi-archipelago v2 (P4): the Interactive Lab Island's registry, shared by every region.
describe('lab registry', () => {
  it('passes its rules', () => {
    expect(validateLabs(labRegistry, new Set(activities.map(a => a.id)))).toEqual([]);
  });

  it('keeps the six algorithm labs as they are and files them by domain', () => {
    const algorithm = labRegistry.filter(l => l.kind === 'algorithm');
    expect(algorithm.map(l => l.id)).toEqual(courses.map(c => c.slug));
    expect(algorithm.every(l => l.status === 'implemented' && l.approach === 'code')).toBe(true);
    expect(algorithm.filter(l => l.domain === 'data-structures').map(l => l.id)).toEqual(['array', 'stack', 'queue']);
    expect(algorithm.filter(l => l.domain === 'algorithms').map(l => l.id)).toEqual(['binary-search', 'bubble-sort', 'bfs']);
  });

  it('has the color contrast lab implemented (design approach) and the others planned', () => {
    expect(implementedToolLabs().map(l => l.id)).toEqual(['color-contrast']);
    expect(getLab('color-contrast')).toMatchObject({ domain: 'ui-ux', approach: 'design', activities: ['color-contrast'] });
    expect(labRegistry.filter(l => l.status === 'planned').map(l => l.domain)).toEqual(['web-design', 'mobile', 'ui-ux', 'ai', 'ai', 'ai']);
    for (const d of LAB_DOMAINS) expect(labRegistry.some(l => l.domain === d), d).toBe(true);
  });

  it('derives the lessons that use a lab, many to many, and links none that is not published', () => {
    expect(lessonsUsingLab(getLab('color-contrast')!).map(l => l.lessonId)).toEqual(['UI08', 'UI09', 'UI10', 'UI13']);
    expect(lessonsUsingLab(getLab('color-contrast')!).every(l => l.status === 'planned')).toBe(true);
    expect(lessonsUsingLab(getLab('array')!).map(l => l.lessonId)).toEqual(['F11', 'D02']);
    // One lab, several islands: the responsive playground serves UI, RWD and MOB lessons.
    const islands = new Set(lessonsUsingLab(getLab('responsive-layout')!).map(l => l.lessonId.replace(/\d+$/, '')));
    expect([...islands].sort()).toEqual(['MOB', 'RWD', 'UI']);
  });

  it('catches a bad entry', () => {
    const bad = [...labRegistry, { ...getLab('color-contrast')!, activities: ['nope'] }, { ...getLab('array')!, id: 'Array X', kind: 'algorithm' as const }];
    const problems = validateLabs(bad, new Set(activities.map(a => a.id))).join('\n');
    expect(problems).toMatch(/color-contrast: duplicate lab id/);
    expect(problems).toMatch(/unknown activity nope/);
    expect(problems).toMatch(/Array X: id is not kebab-case/);
    expect(problems).toMatch(/an algorithm lab is one of the six courses/);
  });
});
