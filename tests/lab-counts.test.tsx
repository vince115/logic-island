// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Catalog } from '@/components/catalog';
import { courses } from '@/content/courses';
import { labIslandConfig } from '@/content/world';
import { labRegistry, openLabCounts, openLabText } from '@/content/world/labs';
import { hubSummary } from '@/lib/world/learning-islands';
import { metadata } from '../src/app/learn/page';

/*
 * P1-38: the world's central hub stands for all of /learn. The number of labs it states, the number /learn states and
 * the number of labs /learn really links to come from one function over the lab registry; a planned lab (no route) is
 * never counted. No number is written here either: every expectation is worked out from the registry.
 */
afterEach(cleanup);
const open = labRegistry.filter(l => l.status === 'implemented'), planned = labRegistry.filter(l => l.status === 'planned');

describe('P1-38 one count of the open labs', () => {
  it('counts the implemented labs by kind and leaves the planned ones out', () => {
    const counts = openLabCounts();
    expect(counts).toEqual({ total: open.length, algorithm: open.filter(l => l.kind === 'algorithm').length, tool: open.filter(l => l.kind === 'tool').length });
    expect(counts.algorithm + counts.tool).toBe(counts.total);
    expect(counts.algorithm).toBe(courses.length);
    // The registry does hold planned labs today, so "not counted" is a real statement.
    expect(planned.length).toBeGreaterThan(0);
    expect(counts.total).toBe(labRegistry.length - planned.length);
  });

  it('says it in one wording: the total, and the two kinds when detail is wanted', () => {
    const { total, algorithm, tool } = openLabCounts();
    expect(openLabText()).toEqual({ short: `${total} 個互動實驗`, detail: `${algorithm} 個演算法實驗與 ${tool} 個工具實驗` });
  });

  it('the central hub states every open lab of /learn, not only the algorithm labs of the island record', () => {
    expect(hubSummary().lab.labs).toBe(openLabCounts().total);
    expect(hubSummary().lab.href).toBe('/learn');
    // The island record lists the algorithm labs the home map shows under 互動實驗島; the hub is wider than that.
    expect(labIslandConfig.labs!.length).toBe(openLabCounts().algorithm);
    expect(hubSummary().lab.labs).toBeGreaterThan(labIslandConfig.labs!.length);
  });

  it('/learn states the same number as it has open lab links, and its description the same words', () => {
    const { container } = render(<Catalog/>);
    const links = container.querySelectorAll('a.course-card').length, total = openLabCounts().total;
    expect(links).toBe(total);
    expect(container.querySelector('.catalog-summary')!.textContent).toContain(`${String(total).padStart(2, '0')} 個互動實驗開放中`);
    expect(container.querySelectorAll('.course-card[data-status="planned"]').length).toBe(planned.length);
    const text = openLabText();
    expect(metadata.description).toContain(`${text.short}（${text.detail}）`);
    for (const course of courses) expect(metadata.description, course.title).toContain(course.title);
    // No count of labs is left in the description as a written-out number.
    expect(metadata.description).not.toMatch(/[一二三四五六七八九十]+個/);
  });
});
