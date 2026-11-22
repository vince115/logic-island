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

  it('has the color contrast, Flexbox and Linux terminal labs implemented and the others planned', () => {
    // R7: Flexbox Playground is the second tool lab; the web layout labs are one per activity. P7: Linux Terminal Simulator.
    expect(implementedToolLabs().map(l => l.id)).toEqual(['color-contrast', 'flexbox-playground', 'css-grid-playground', 'responsive-layout', 'mobile-ux', 'linux-terminal']);
    expect(getLab('mobile-ux')).toMatchObject({ domain: 'mobile', title: 'Mobile Navigation Simulator', status: 'implemented', activities: ['mobile-nav-sim'] });
    expect(getLab('responsive-layout')).toMatchObject({ domain: 'web-design', status: 'implemented', activities: ['responsive-sim'] });
    // R8.1: CSS Grid Playground, routed as /learn/css-grid-playground; its activity id stays grid-playground.
    expect(getLab('css-grid-playground')).toMatchObject({ domain: 'web-design', approach: 'design', status: 'implemented', activities: ['grid-playground'] });
    expect(getLab('grid-playground')).toBeUndefined();
    expect(getLab('flexbox-playground')).toMatchObject({ domain: 'web-design', approach: 'design', activities: ['flexbox-playground'] });
    expect(getLab('linux-terminal')).toMatchObject({ domain: 'systems-cloud', approach: 'code', activities: ['terminal-sim'] });
    expect(getLab('color-contrast')).toMatchObject({ domain: 'ui-ux', approach: 'design', activities: ['color-contrast'] });
    expect(labRegistry.filter(l => l.status === 'planned').map(l => l.domain)).toEqual(['ui-ux', 'ai', 'ai', 'ai',
      'systems-cloud', 'systems-cloud', 'systems-cloud']);
    for (const d of LAB_DOMAINS) expect(labRegistry.some(l => l.domain === d), d).toBe(true);
  });

  it('derives the lessons that use a lab, many to many, and links none that is not published', () => {
    expect(lessonsUsingLab(getLab('color-contrast')!).map(l => l.lessonId)).toEqual(['UI08', 'UI09', 'UI10', 'UI13']);
    expect(lessonsUsingLab(getLab('color-contrast')!).every(l => l.status === 'planned')).toBe(true);
    expect(lessonsUsingLab(getLab('array')!).map(l => l.lessonId)).toEqual(['F11', 'D02']);
    // One lab, several islands: the grid playground serves UI and RWD lessons, the responsive simulator RWD and MOB.
    const islandsOf = (id: string) => [...new Set(lessonsUsingLab(getLab(id)!).map(l => l.lessonId.replace(/\d+$/, '')))].sort();
    expect(islandsOf('css-grid-playground')).toEqual(['RWD', 'UI']);
    expect(islandsOf('responsive-layout')).toEqual(['MOB', 'RWD']);
    // RWD-1: RWD03 and RWD04 are written as web-code lessons (their activity is dom-explorer, not the playground's);
    // the lab still lists the lessons the blueprint outlined with it, now as published links. So does the responsive
    // simulator for RWD01 and RWD02.
    expect(lessonsUsingLab(getLab('flexbox-playground')!).map(l => [l.lessonId, l.status])).toEqual([['RWD03', 'published'], ['RWD04', 'published']]);
    expect(lessonsUsingLab(getLab('responsive-layout')!).slice(0, 3).map(l => [l.lessonId, l.status])).toEqual([['RWD01', 'published'], ['RWD02', 'published'], ['RWD07', 'published']]);
    // RWD-3: every RWD lesson is published: the responsive simulator links six of them (its MOB lesson is planned), the
    // mobile navigation simulator links RWD11.
    expect(lessonsUsingLab(getLab('responsive-layout')!).map(l => [l.lessonId, l.status])).toEqual([...['RWD01', 'RWD02', 'RWD07', 'RWD08', 'RWD09', 'RWD10'].map(id => [id, 'published']), ['MOB06', 'published']]); // MOB-2: MOB06 too
    expect(lessonsUsingLab(getLab('mobile-ux')!).filter(l => l.status === 'published').map(l => l.lessonId)).toEqual(['RWD11', 'MOB02', 'MOB03']); // MOB-1
    // RWD-2: the grid playground's two RWD lessons are published; its UI lesson is still planned.
    expect(lessonsUsingLab(getLab('css-grid-playground')!).filter(l => l.status === 'published').map(l => l.lessonId)).toEqual(['RWD05', 'RWD06']);
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
