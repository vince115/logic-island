import { describe, expect, it } from 'vitest';
import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum/lessons';
import { LAB_ISLAND_ID, getIsland, subjectIslands } from '@/content/world';
import { REGION_IDS } from '@/content/world/types';
import { HUB, HUB_LOCATION, knownLocation, resolvePlace } from '@/lib/presence/locations';
import { parsePlace, placeOf, type PlaceClaim } from '@/lib/presence/place';

/*
 * Dynamic Island Population: how a page becomes a place. The browser states one reference (place.ts), the server
 * resolves it against the world registry (locations.ts). These tests hold the mapping of every kind of page and the
 * rule that no reference can put a visitor on an island it does not belong to.
 */

const slugOf = (lessonId: string) => lessons.find(l => l.lessonId === lessonId)!.slug;

describe('placeOf: the claim a page address makes', () => {
  it('reads the home map, the syllabus, lessons, labs and region pages', () => {
    expect(placeOf('/')).toEqual({ t: 'hub' });
    expect(placeOf('/', '?island=foundations')).toEqual({ t: 'island', id: 'foundations' });
    expect(placeOf('/curriculum')).toEqual({ t: 'hub' });
    expect(placeOf('/curriculum', '', '#island-databases')).toEqual({ t: 'island', id: 'databases' });
    expect(placeOf(`/curriculum/${slugOf('F01')}`)).toEqual({ t: 'lesson', id: slugOf('F01') });
    expect(placeOf('/learn')).toEqual({ t: 'lab' });
    expect(placeOf('/learn/bubble-sort/')).toEqual({ t: 'lab', id: 'bubble-sort' });
    expect(placeOf('/regions/ai')).toEqual({ t: 'region', id: 'ai' });
    expect(placeOf('/world/cs')).toEqual({ t: 'region', id: 'cs' });
    expect(placeOf('/world/ai', 'island=machine-learning')).toEqual({ t: 'island', id: 'machine-learning', r: 'ai' });
    expect(placeOf('/sys', '?island=linux-systems')).toEqual({ t: 'island', id: 'linux-systems', r: 'sys' });
  });

  it('leaves pages that name no island at the hub', () => {
    // The trial pages, the world overview, the legacy map pages and anything unknown belong to no archipelago.
    for (const path of ['/trials', '/trials/ccarf/mock-1', '/world', '/islands', '/islands/candidate', '/nowhere', '/regions/nope', '/regions'])
      expect(placeOf(path), path).toEqual({ t: 'hub' });
    // An island parameter means nothing on a page that has no map, and a malformed id is no id.
    expect(placeOf('/regions/cs', '?island=foundations')).toEqual({ t: 'region', id: 'cs' });
    expect(placeOf('/', '?island=<script>')).toEqual({ t: 'hub' });
    expect(placeOf('/curriculum/UPPER_case')).toEqual({ t: 'hub' });
  });
});

describe('parsePlace: claims from untrusted JSON', () => {
  it('accepts exactly the claims placeOf makes', () => {
    const claims: PlaceClaim[] = [{ t: 'hub' }, { t: 'region', id: 'cs' }, { t: 'island', id: 'foundations' },
      { t: 'island', id: 'machine-learning', r: 'ai' }, { t: 'lesson', id: slugOf('F01') }, { t: 'lab' }, { t: 'lab', id: 'bfs' }];
    for (const claim of claims) expect(parsePlace(JSON.parse(JSON.stringify(claim)))).toEqual(claim);
  });

  it('rejects other shapes, extra fields and ids that are not ids', () => {
    const bad: unknown[] = [null, 'hub', [], {}, { t: 'course', id: 'F01' }, { t: 'hub', id: 'x' }, { t: 'region' }, { t: 'region', id: 7 },
      { t: 'island', id: 'a', r: 5 }, { t: 'island', id: '../etc' }, { t: 'lesson', id: 'x'.repeat(65) }, { t: 'lesson', id: 'ok', region: 'ai' },
      { t: 'island', id: 'foundations', island: 'databases' }, { t: 'lab', id: '' }, { t: 'lab', r: 'cs' }];
    for (const value of bad) expect(parsePlace(value), JSON.stringify(value)).toBeUndefined();
  });
});

describe('resolvePlace: the registry decides Region → Island → Course', () => {
  it('puts every lesson page on its own island and region', () => {
    for (const lesson of lessons) {
      const island = getIsland(lesson.islandId)!;
      expect(resolvePlace({ t: 'lesson', id: lesson.slug }), lesson.lessonId)
        .toEqual({ region: island.regionId, island: island.id, course: lesson.lessonId });
    }
  });

  it('reads a lesson id with its whole prefix: DB01 is the database island, never the structures island', () => {
    expect(resolvePlace({ t: 'lesson', id: slugOf('DB01') })).toEqual({ region: 'cs', island: 'databases', course: 'DB01' });
    expect(resolvePlace({ t: 'lesson', id: slugOf('D01') })).toEqual({ region: 'cs', island: 'structures', course: 'D01' });
  });

  it('puts every subject island in its region, and all five regions are reachable', () => {
    for (const island of subjectIslands) expect(resolvePlace({ t: 'island', id: island.id })).toEqual({ region: island.regionId, island: island.id, course: null });
    for (const region of REGION_IDS) expect(resolvePlace({ t: 'region', id: region })).toEqual({ region, island: null, course: null });
  });

  it('keeps the labs at the central hub: the tool island has no region', () => {
    expect(resolvePlace({ t: 'lab' })).toEqual({ region: HUB, island: LAB_ISLAND_ID, course: null });
    for (const course of courses) expect(resolvePlace({ t: 'lab', id: course.slug })).toEqual({ region: HUB, island: LAB_ISLAND_ID, course: `lab:${course.slug}` });
    expect(resolvePlace({ t: 'lab', id: 'no-such-lab' })).toEqual({ region: HUB, island: LAB_ISLAND_ID, course: null });
    expect(resolvePlace({ t: 'island', id: LAB_ISLAND_ID })).toEqual({ region: HUB, island: LAB_ISLAND_ID, course: null });
  });

  it('never trusts the page a claim came from over the registry', () => {
    // An island focused "on the AI map" that is a CS island counts in CS.
    expect(resolvePlace({ t: 'island', id: 'foundations', r: 'ai' })).toEqual({ region: 'cs', island: 'foundations', course: null });
    // An unknown island leaves the visitor on that region's page; with no known region either, at the hub.
    expect(resolvePlace({ t: 'island', id: 'atlantis', r: 'ai' })).toEqual({ region: 'ai', island: null, course: null });
    expect(resolvePlace({ t: 'island', id: 'atlantis', r: 'mars' })).toEqual(HUB_LOCATION);
    expect(resolvePlace({ t: 'island', id: 'atlantis' })).toEqual(HUB_LOCATION);
    expect(resolvePlace({ t: 'region', id: 'mars' })).toEqual(HUB_LOCATION);
    expect(resolvePlace({ t: 'lesson', id: 'no-such-lesson' })).toEqual(HUB_LOCATION);
    expect(resolvePlace({ t: 'hub' })).toEqual(HUB_LOCATION);
  });

  it('resolves only to locations the registry knows', () => {
    const claims: PlaceClaim[] = [{ t: 'hub' }, { t: 'lab' }, { t: 'region', id: 'web' }, { t: 'island', id: 'frontend', r: 'cs' },
      { t: 'island', id: 'x', r: 'design' }, { t: 'lesson', id: slugOf('A07') }, { t: 'lesson', id: 'nope' }];
    for (const claim of claims) expect(knownLocation(resolvePlace(claim)), JSON.stringify(claim)).toBe(true);
    expect(knownLocation({ region: 'ai', island: 'foundations', course: null })).toBe(false);
    expect(knownLocation({ region: 'cs', island: null, course: 'F01' })).toBe(false);
  });
});
