import { describe, expect, it } from 'vitest';
import { analyzeDecomposition, analyzeRelation, candidateKeys, closure, isLossless, lostDependencies, projectFds, type FD } from '../src/lib/normalization/fd';

// Phase F.1b: the normalization engine behind DB10, on textbook cases with known answers.
const fd = (lhs: string, rhs: string): FD => ({ lhs: lhs.split(','), rhs: rhs.split(',') });
const records = ['student_id', 'student_name', 'major', 'major_office', 'course_id', 'course_title', 'score'];
const recordFds = [fd('student_id', 'student_name,major'), fd('major', 'major_office'), fd('course_id', 'course_title'), fd('student_id,course_id', 'score')];

describe('normalization engine (F.1b)', () => {
  it('computes closures and candidate keys', () => {
    expect([...closure(['student_id'], recordFds)].sort()).toEqual(['major', 'major_office', 'student_id', 'student_name']);
    expect(candidateKeys(records, recordFds)).toEqual([['student_id', 'course_id']]);
    // Two keys: {student, course} and {student, instructor}.
    const sci = [fd('student,course', 'instructor'), fd('instructor', 'course')];
    expect(candidateKeys(['student', 'course', 'instructor'], sci)).toEqual([['student', 'course'], ['student', 'instructor']]);
    expect(candidateKeys(['a', 'b'], [])).toEqual([['a', 'b']]);
  });

  it('projects dependencies onto part of a relation, through attributes left out', () => {
    // A → B → C: on {A, C} only A → C remains, found through B.
    expect(projectFds(['A', 'C'], [fd('A', 'B'), fd('B', 'C')])).toEqual([{ lhs: ['A'], rhs: ['C'] }]);
    expect(projectFds(['student_id', 'major_office'], recordFds)).toEqual([{ lhs: ['student_id'], rhs: ['major_office'] }]);
  });

  it('finds the highest normal form and the dependency that blocks the next one', () => {
    expect(analyzeRelation(records, recordFds)).toMatchObject({ form: '1NF', violation: { form: '2NF' } });
    expect(analyzeRelation(['A', 'B', 'C'], [fd('A', 'B'), fd('B', 'C')])).toMatchObject({ form: '2NF', violation: { form: '3NF', fd: { lhs: ['B'], rhs: ['C'] } } });
    const sci = analyzeRelation(['student', 'course', 'instructor'], [fd('student,course', 'instructor'), fd('instructor', 'course')]);
    expect(sci).toMatchObject({ form: '3NF', prime: ['student', 'course', 'instructor'], violation: { form: 'BCNF', fd: { lhs: ['instructor'], rhs: ['course'] } } });
    expect(analyzeRelation(['major', 'major_office'], recordFds)).toMatchObject({ form: 'BCNF', keys: [['major']] });
    expect(analyzeRelation(['student_id', 'major', 'major_office'], recordFds).form).toBe('2NF');
  });

  it('tells lossless decompositions from lossy ones (the chase)', () => {
    expect(isLossless(['A', 'B', 'C'], [['A', 'B'], ['A', 'C']], [fd('A', 'B')])).toBe(true);
    expect(isLossless(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']], [fd('A', 'B')])).toBe(false);
    expect(isLossless(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']], [fd('A', 'B'), fd('B', 'C'), fd('C', 'D')])).toBe(true);
    expect(isLossless(records, [['student_id', 'student_name', 'major'], ['major', 'major_office'], ['course_id', 'course_title'], ['student_id', 'course_id', 'score']], recordFds)).toBe(true);
    expect(isLossless(records, [['student_id', 'student_name', 'major', 'major_office'], ['course_id', 'course_title', 'score']], recordFds)).toBe(false);
  });

  it('finds dependencies a decomposition cannot check without a join', () => {
    const sci = [fd('student,course', 'instructor'), fd('instructor', 'course')];
    expect(lostDependencies([['instructor', 'course'], ['student', 'instructor']], sci)).toEqual([sci[0]]);
    expect(lostDependencies([['A', 'B'], ['B', 'C']], [fd('A', 'B'), fd('B', 'C'), fd('A', 'C')])).toEqual([]);
  });

  it('analyzes a whole decomposition: weakest form, missing attributes, redundant parts', () => {
    const good = analyzeDecomposition(records, [['student_id', 'student_name', 'major'], ['major', 'major_office'], ['course_id', 'course_title'], ['student_id', 'course_id', 'score']], recordFds);
    expect(good).toMatchObject({ form: 'BCNF', missing: [], lossless: true, lost: [], redundant: [] });
    const partial = analyzeDecomposition(records, [['student_id', 'student_name', 'major', 'major_office'], ['course_id', 'course_title'], ['student_id', 'course_id', 'score'], ['major', 'major_office']], recordFds);
    // {major, major_office} sits inside the first part: it adds nothing.
    expect(partial).toMatchObject({ form: '2NF', lossless: true, redundant: [3] });
    const gaps = analyzeDecomposition(records, [['student_id', 'student_name'], ['student_id', 'student_name'], ['course_id', 'score']], recordFds);
    expect(gaps).toMatchObject({ missing: ['major', 'major_office', 'course_title'], lossless: false, redundant: [1] });
  });
});
