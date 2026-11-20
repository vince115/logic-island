import { MVP_TYPES, currentRevisionOf, selectCountOf, syllabusOf, type Block, type Question, type Source, type Tag } from '@/content/trials/schema';

/*
 * Docs 35: the structural check. A question that passes it may be released for practice (scripts/trials/auto-release.ts)
 * without a human review. It checks that the question is complete and consistent: it does NOT check that the content is
 * right. "Passes the structural check" never means "professionally verified"; the site says so on every such question.
 *
 * Checked, per question (original questions only; an official question always needs its source checked by a person):
 *   - it is waiting for review, original, of an MVP type, with a known and licensed source;
 *   - stem, every option and the explanation hold text (not blank);
 *   - option ids are unique; a single-choice question has 2+ options and exactly one right answer; a multiple-response
 *     question has 2+ right answers, fewer than all options, and a selection count equal to them;
 *   - every right answer is an option; the display flags show text, options, answer and explanation;
 *   - the explanation says why (an entry for each option of a multiple-response question, and none for an unknown one);
 *   - when the explanation names its answer ("正解（B）"), that is the answer key (catches a key and an explanation that
 *     disagree);
 *   - the question has exactly one syllabus item, so that a paper can place it.
 * Bank-level problems (duplicate ids, unknown subjects) are validateTrials' and the importer's; they stop the release.
 */
const blockEmpty = (b: Block): boolean => {
  switch (b.type) {
    case 'p': case 'code': return !b.text.trim();
    case 'list': return !b.items.length || b.items.some(i => !i.trim());
    case 'table': return !b.head.length || !b.rows.length;
    case 'math': return !b.fallback.trim();
    default: return false; // an image is rejected by validateTrials for a published question
  }
};
const blank = (blocks: Block[] | undefined) => !blocks?.length || blocks.every(blockEmpty);
const textOf = (blocks: Block[]) => blocks.map(b => b.type === 'p' || b.type === 'code' ? b.text : b.type === 'list' ? b.items.join(' ') : '').join('\n');

/** Why a question fails the structural check; empty when it passes. */
export function structuralProblems(q: Question, sources: ReadonlyMap<string, Source>, tags: ReadonlyMap<string, Tag>): string[] {
  const problems: string[] = [], rev = currentRevisionOf(q);
  if (!rev) return ['no current revision'];
  if (q.review.status !== 'in-review') problems.push(`status is ${q.review.status}, not in-review`);
  if (q.provenance.origin !== 'original') problems.push('not an original question (an official question needs a human source check)');
  if (!(MVP_TYPES as readonly string[]).includes(q.type)) problems.push(`type ${q.type} is not playable`);
  const source = sources.get(q.provenance.sourceId);
  if (!source) problems.push(`unknown source ${q.provenance.sourceId}`);
  else if (source.license === 'unconfirmed') problems.push('the source licence is unconfirmed');
  if (blank(rev.stem)) problems.push('the stem is blank');
  const options = rev.options ?? [], ids = options.map(o => o.id);
  if (options.length < 2) problems.push(`${options.length} option(s), at least 2`);
  if (new Set(ids).size !== ids.length) problems.push('duplicate option ids');
  options.forEach(o => { if (blank(o.body)) problems.push(`option ${o.id} is blank`); });
  const answer = rev.answer;
  if (answer?.kind !== 'choice') problems.push('no choice answer');
  else {
    const right = answer.correct;
    if (!right.length) problems.push('no right answer');
    if (new Set(right).size !== right.length) problems.push('a right answer is listed twice');
    for (const r of right) if (!ids.includes(r)) problems.push(`the right answer ${r} is not an option`);
    if (q.type === 'multiple-response') {
      if (right.length < 2) problems.push('a multiple-response question has at least 2 right answers');
      if (right.length >= options.length) problems.push('every option is right');
      if (answer.select !== undefined && answer.select !== right.length) problems.push(`select is ${answer.select}, ${right.length} right answers`);
    } else if (right.length !== 1) problems.push(`${right.length} right answers on a ${q.type} question, exactly 1`);
  }
  const d = rev.display;
  if (!d.text || !d.options || !d.answer || !d.explanation) problems.push('display hides the text, options, answer or explanation');
  if (!rev.explanation || blank(rev.explanation.body)) problems.push('the explanation is blank');
  else {
    const notes = rev.explanation.options ?? [];
    for (const n of notes) {
      if (!ids.includes(n.optionId)) problems.push(`an explanation for unknown option ${n.optionId}`);
      if (blank(n.body)) problems.push(`the explanation of option ${n.optionId} is blank`);
    }
    if (q.type === 'multiple-response' && notes.length !== options.length) problems.push('a multiple-response explanation covers every option');
    const named = /正解((?:\s*[（(][A-Z](?:[、,，及和\s]*[A-Z])*[）)])+)/.exec(textOf(rev.explanation.body));
    if (named && answer?.kind === 'choice') {
      const letters = [...new Set([...named[1].matchAll(/[A-Z]/g)].map(m => ids[m[0].charCodeAt(0) - 65]))].sort().join();
      if (letters !== [...answer.correct].sort().join()) problems.push(`the explanation names ${named[1].trim()}, the answer key is ${answer.correct.join('、')}`);
    }
  }
  if (rev.options && answer?.kind === 'choice' && selectCountOf(q, rev) > ids.length) problems.push('selects more options than there are');
  const { item, problem } = syllabusOf(q, tags);
  if (!item) problems.push(`syllabus: ${problem}`);
  return problems;
}
