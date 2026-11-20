import { visualizations } from '@/content/curriculum/registry';
import { LESSON_ACTIVITIES, MIN_EXAMPLES, MIN_OBJECTIVES, MIN_QUIZ, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';

/*
 * 2026-11-20 (course production): the publish gate. A lesson may be marked complete (published) only if this returns no
 * problem. It adds to validateCurriculum (shape, order, references, minimum counts) what makes a lesson *teachable*:
 * no placeholder text, objectives a learner can check, a quiz whose every answer is explained, sections with substance,
 * a visualization or activity that exists, and content that is about the lesson's own concepts. It never lowers a
 * rule for a lesson: the 80 lessons published before it pass it unchanged (tests/course-publish-gate.test.ts).
 */

/**
 * Marks of unfinished text: the upper-case markers as whole words (a lesson's to-do list example has `todo`, and a SQL
 * lesson rightly says "placeholder" for a bound parameter), lorem ipsum, and the Chinese ones.
 */
const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|XXX)\b|[Ll]orem ipsum|待補|待撰寫|待完成|（略）|此處填寫/;
/** A quiz explanation that only repeats the answer is not an explanation. */
export const MIN_EXPLANATION = 25;
/** A section shorter than this (all its text) teaches nothing. */
export const MIN_SECTION = 80;
/** How many of the lesson's own concepts its text must name (the share, rounded up). */
export const CONCEPT_SHARE = .5;

/** Every string in a value (prose, code, options), for the text checks. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}
/**
 * A concept's parts to look for: before any parenthesis (「封裝（encapsulation）」→「封裝」), split where the outline joins
 * terms (「輸入／處理／輸出」, 「token 與整行讀取」), without spaces, lower case, two characters or more. The concept is named
 * when any of its parts is.
 */
/**
 * A part is named when the text has it, or, for Chinese, at least a third of its two-character pieces (so 「函式定義」 is named
 * by a text about 「定義函式」, and 「綜合應用」 by one about 「綜合挑戰」 that 「應用」 the skills); a Latin term must appear as it is.
 */
function partNamed(part: string, text: string) {
  if (text.includes(part)) return true;
  if (/^[\x00-\x7f]+$/.test(part)) return false;
  const pieces = Array.from({ length: part.length - 1 }, (_, i) => part.slice(i, i + 2));
  return pieces.filter(p => text.includes(p)).length >= Math.ceil(pieces.length / 3);
}
const conceptParts = (concept: string) => concept.split(/[（(]/)[0].split(/[／/、，,與和及]|\s+/).map(p => p.trim().toLowerCase()).filter(p => p.length >= 2);

export function publishProblems(meta: LessonMeta, content: LessonContent | undefined): string[] {
  const at = meta.lessonId, problems: string[] = [];
  const fail = (what: string) => problems.push(`${at}: ${what}`);
  if (meta.lessonStatus !== 'complete') return problems;
  if (!content) { fail('no content'); return problems; }
  // Objectives: enough, and each one something a learner can check (not a bare noun).
  if (meta.learningObjectives.length < MIN_OBJECTIVES) fail(`only ${meta.learningObjectives.length} objectives`);
  for (const o of meta.learningObjectives) if (o.trim().length < 6) fail(`objective "${o}" is too short to check`);
  if (content.motivation.trim().length < 20) fail('no motivation');
  // Placeholder text anywhere in the lesson.
  for (const text of strings(content)) { const hit = PLACEHOLDER.exec(text); if (hit) { fail(`placeholder text "${hit[0]}"`); break; } }
  // Sections: each has substance.
  for (const s of content.sections) { const length = strings(s).join('').length; if (length < MIN_SECTION) fail(`section "${s.title}" has ${length} characters`); }
  // Examples, quiz and exercises: as many as the curriculum asks (program and SQL lessons count theirs differently).
  const program = meta.capabilities.includes('program-code');
  if (program && content.examples.length < MIN_EXAMPLES) fail(`${content.examples.length} examples`);
  if (content.quiz.length < MIN_QUIZ) fail(`${content.quiz.length} quiz questions`);
  for (const q of content.quiz) {
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) fail(`${q.id}: the answer is not one of the options`);
    if (new Set(q.options.map(o => o.trim())).size !== q.options.length) fail(`${q.id}: two options are the same`);
    if (q.options.length < 3) fail(`${q.id}: fewer than three options`);
    if (q.explanation.trim().length < MIN_EXPLANATION) fail(`${q.id}: the explanation does not explain`);
  }
  if (program && !content.exercises.length) fail('no exercise');
  for (const e of content.exercises) if (!e.tests?.length) fail(`${e.id}: no test case`);
  // What the lesson shows must exist.
  const viz = visualizations[meta.visualizationType];
  if (!viz || (viz.status !== 'implemented' && meta.visualizationType !== 'none')) fail(`visualization ${meta.visualizationType} is not implemented`);
  if (meta.activity && !(LESSON_ACTIVITIES as readonly string[]).includes(meta.activity)) fail(`activity ${meta.activity} does not exist`);
  // On topic: the text names at least half of the lesson's own concepts.
  const text = strings(content).join('\n').replace(/\s+/g, '').toLowerCase();
  const named = meta.concepts.filter(c => conceptParts(c).some(part => partNamed(part, text)));
  if (named.length < Math.ceil(meta.concepts.length * CONCEPT_SHARE)) fail(`names ${named.length} of its ${meta.concepts.length} concepts (${meta.concepts.filter(c => !named.includes(c)).join('、')} missing)`);
  return problems;
}
