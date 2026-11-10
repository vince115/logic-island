import { describe, expect, it } from 'vitest';
import { curriculum, lessons } from '../src/content/curriculum';
import { hasCapability } from '../src/content/curriculum/schema';
import { buildModel, checkRoles, validateModel, validateRoles } from '../src/lib/er/model';
import { candidateKeys, MAX_ATTRIBUTES } from '../src/lib/normalization/fd';
import { checkDecomposition, checkKeys } from '../src/lib/normalization/check';
import { buildTree, checkTree, validateInput } from '../src/lib/bplus/tree';
import { checkTxAnswer, expectedAnswer } from '../src/lib/txn/check';
import { runTimeline } from '../src/lib/txn/recovery';
import { MODEL_LEVELS, runSchedule } from '../src/lib/txn/schedule';
import { checkOpsAnswer, expectedOpsAnswer } from '../src/lib/ops/check';
import { planRestore, simulateReplication } from '../src/lib/ops/sim';
import initSqlJs from 'sql.js';
import { openDataset } from '../src/lib/sql/engine';
import { runStrategy } from '../src/lib/sql/sequence';

// Phase F.1b: the database lessons' ER and normalization content, checked with the same engines the page uses; and the
// content size every lesson from DB06 on keeps (6–8 sections, at least 5 examples, 7 quiz questions, 3 exercises).
const content = (id: string) => curriculum.contents[id as keyof typeof curriculum.contents]!;
const dbLessons = lessons.filter(l => l.islandId === 'databases' && l.lessonStatus === 'complete');
const f1b = dbLessons.filter(l => Number(l.lessonId.slice(2)) >= 6);

describe('database lessons: ER and normalization content (F.1b)', () => {
  it('every database lesson has an activity and no program languages', () => {
    expect(dbLessons.length).toBeGreaterThanOrEqual(5);
    for (const l of dbLessons) expect([l.lessonId, l.activity, l.supportedLanguages, hasCapability(l, 'program-code')]).toEqual([l.lessonId, expect.any(String), [], false]);
  });

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'er-diagram'))) {
    it(`${lesson.lessonId}: diagrams are well formed; each exercise's reference passes, every mistake fails`, () => {
      const er = content(lesson.lessonId).er!;
      for (const d of er.diagrams) expect(validateModel(d.model), d.id).toEqual([]);
      for (const e of er.exercises) {
        expect(validateRoles(e.terms, e.answer), e.id).toEqual([]);
        expect(checkRoles(e.terms, e.answer, e.answer, e.termHints, e.accept).filter(r => !r.ok), e.id).toEqual([]);
        for (const [term, roles] of Object.entries(e.accept ?? {})) for (const role of roles)
          expect(checkRoles(e.terms, e.answer, { ...e.answer, [term]: role }, e.termHints, e.accept).every(r => r.ok), `${e.id} accepts ${term}`).toBe(true);
        for (const m of e.mistakes) expect(checkRoles(e.terms, e.answer, { ...e.answer, ...m.roles }, e.termHints, e.accept).some(r => !r.ok), `${e.id} mistake: ${m.why}`).toBe(true);
        expect(validateModel(buildModel(e.terms, e.answer)), e.id).toEqual([]);
      }
    });
  }

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'normalization'))) {
    it(`${lesson.lessonId}: normalization answers pass their checks, alternatives pass, mistakes fail`, () => {
      const nf = content(lesson.lessonId).normalization!;
      const relations = [nf.explorer, ...nf.examples.map(e => e.relation), ...nf.exercises.map(e => e.relation)];
      for (const r of relations) {
        expect(r.attributes.length, r.name).toBeLessThanOrEqual(MAX_ATTRIBUTES);
        expect(new Set(r.attributes).size, r.name).toBe(r.attributes.length);
        for (const fd of r.fds) expect([...fd.lhs, ...fd.rhs].every(a => r.attributes.includes(a)), `${r.name}: ${fd.lhs}→${fd.rhs}`).toBe(true);
        for (const row of r.sample ?? []) expect(row, r.name).toHaveLength(r.attributes.length);
      }
      for (const e of nf.examples) for (const step of e.steps) for (const p of step.parts)
        expect(p.attributes.every(a => e.relation.attributes.includes(a)), `${e.id} ${step.title} ${p.name}`).toBe(true);
      for (const e of nf.exercises) {
        const { attributes, fds } = e.relation;
        if (e.task === 'keys') {
          expect(e.solution, e.id).toEqual(candidateKeys(attributes, fds));
          expect(checkKeys(attributes, fds, e.solution, e.all), e.id).toEqual({ ok: true, messages: [] });
          for (const m of e.mistakes) expect(checkKeys(attributes, fds, m.keys, e.all).ok, `${e.id} mistake: ${m.why}`).toBe(false);
        } else {
          for (const parts of [e.solution, ...e.alternatives])
            expect(checkDecomposition(attributes, fds, parts.map(p => p.attributes), e.target, e.preserve), `${e.id}: ${JSON.stringify(parts)}`).toEqual({ ok: true, messages: [] });
          for (const m of e.mistakes) expect(checkDecomposition(attributes, fds, m.parts.map(p => p.attributes), e.target, e.preserve).ok, `${e.id} mistake: ${m.why}`).toBe(false);
        }
      }
    });
  }

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'query-plan'))) {
    it(`${lesson.lessonId}: B+ tree examples are valid trees built from valid input`, () => {
      for (const t of content(lesson.lessonId).queryPlan!.trees) {
        expect(validateInput(t.order, t.keys), t.id).toBeUndefined();
        expect(checkTree(buildTree(t.order, t.keys)), t.id).toEqual([]);
      }
    });
  }

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'transaction-timeline'))) {
    it(`${lesson.lessonId}: timelines and schedules run; each exercise's answer comes from the engines and every mistake fails`, () => {
      const tx = content(lesson.lessonId).transactions!;
      for (const t of tx.timelines) expect(runTimeline(t.script).length, t.id).toBe(t.script.steps.length + 1);
      for (const s of tx.schedules) {
        expect(MODEL_LEVELS[s.model], s.id).toContain(s.level);
        expect(runSchedule(s.schedule, s.model, s.level).events.length, s.id).toBeGreaterThan(0);
      }
      for (const e of tx.exercises) {
        expect(checkTxAnswer(e, expectedAnswer(e)), e.id).toEqual({ ok: true, messages: [] });
        for (const m of e.mistakes) expect(checkTxAnswer(e, m.answer).ok, `${e.id} mistake: ${m.why}`).toBe(false);
      }
    });
  }

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'protocol-sequence'))) {
    it(`${lesson.lessonId}: every strategy of every sequence runs without an error`, async () => {
      const SQL = await initSqlJs();
      for (const seq of content(lesson.lessonId).sequences!) for (const s of seq.strategies) {
        const db = openDataset(SQL, seq.dataset);
        try { expect(runStrategy(db, s).trips.filter(t => 'error' in t.result), `${seq.id} ${s.label}`).toEqual([]); } finally { db.close(); }
      }
    });
  }

  for (const lesson of dbLessons.filter(l => hasCapability(l, 'architecture-diagram'))) {
    it(`${lesson.lessonId}: backup and replication examples run; each exercise's answer comes from the simulator and every mistake fails`, () => {
      const ops = content(lesson.lessonId).ops!;
      for (const b of ops.backups) expect(planRestore(b.plan, b.failureAt), b.id).toBeDefined();
      for (const r of ops.replication) expect(simulateReplication(r.scenario).reads.length, r.id).toBeGreaterThan(0);
      for (const e of ops.exercises) {
        expect(checkOpsAnswer(e, expectedOpsAnswer(e)), e.id).toEqual({ ok: true, messages: [] });
        for (const m of e.mistakes) expect(checkOpsAnswer(e, m.answer).ok, `${e.id} mistake: ${m.why}`).toBe(false);
      }
    });
  }

  for (const lesson of f1b) {
    it(`${lesson.lessonId}: 6–8 sections, at least 5 examples, 7 quiz questions, 3 exercises`, () => {
      const c = content(lesson.lessonId);
      expect(c.sections.length).toBeGreaterThanOrEqual(6);
      expect(c.sections.length).toBeLessThanOrEqual(8);
      expect((c.sql?.examples.length ?? 0) + (c.er?.diagrams.length ?? 0) + (c.normalization?.examples.length ?? 0) + (c.queryPlan?.trees.length ?? 0)
        + (c.transactions?.timelines.length ?? 0) + (c.transactions?.schedules.length ?? 0) + (c.driverCode?.examples.length ?? 0)
        + (c.sequences?.length ?? 0) + (c.ops?.replication.length ?? 0) + (c.ops?.backups.length ?? 0)).toBeGreaterThanOrEqual(5);
      expect(c.quiz).toHaveLength(7);
      expect((c.sql?.exercises.length ?? 0) + (c.er?.exercises.length ?? 0) + (c.normalization?.exercises.length ?? 0) + (c.transactions?.exercises.length ?? 0)
        + (c.ops?.exercises.length ?? 0)).toBe(3);
    });
  }
});
