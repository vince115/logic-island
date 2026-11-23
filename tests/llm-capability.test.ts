import { describe, expect, it } from 'vitest';
import { curriculum, getLessonBySlug, lessons } from '@/content/curriculum';
import { llmFromBlueprint } from '@/content/curriculum/lessons';
import { ISLAND_IDS, ISLAND_PREFIX, LESSON_ACTIVITIES, LESSON_CAPABILITIES, PREPARED_ISLAND_IDS, validateContent, validateCurriculum, type LessonContent, type LessonMeta } from '@/content/curriculum/schema';
import { UNITS } from '@/content/curriculum/units';
import { getIsland } from '@/content/world';
import { lessonsOfIsland } from '@/content/world/catalog';
import planning from '@/content/world/planning-data.json';
import { publishProblems } from '@/lib/curriculum/publish-gate';
import { bpeTableProblems, bytesToText, countTokens, crossEntropy, decode, encode, logLoss, perplexity, pretokenize, spellingBytes, tokenCost, trainBpe, utf8, vocabulary, type BpeTable } from '@/lib/llm/bpe';
import { cosine, dot, embeddingSpaceProblems, nearest, norm, project, projectionProblems, type EmbeddingSpace } from '@/lib/llm/embedding';
import { checkLlmAnswer, llmContentProblems, type LlmExercise, type LlmLessonContent, llmQueryValue, matchesValue, parseNumber } from '@/lib/llm/lesson';
import { draws, mulberry32 } from '@/lib/llm/prng';
import { contextFor, distribution, generate, pick, softmax, toyModelProblems, type ToyModel } from '@/lib/llm/sampling';
import { exercises, llmContent, llmLesson, sampler, TRAINING_CORPUS, tokenizer, tokenSpace } from './support/llm-fixture';
import { validateTerminalLessonsFirst } from './support/terminal-replays';

/*
 * LLM-0 (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md): the llm-explorer capability. The engines (byte-level BPE,
 * temperature / top-k / top-p sampling with a seeded generator, embeddings with a deterministic PCA) are checked against
 * hand-computed values; llmContentProblems catches each kind of inconsistent data and unsound exercise; a complete
 * fixture lesson validates and passes the publish gate; the two islands are prepared for authoring. LLM-1 publishes the
 * large-language-models island (LLM01–LLM03); GEN-1 publishes the generative-ai island (GEN01–GEN02).
 */
const close = (got: number[], want: number[], digits = 6) => { expect(got).toHaveLength(want.length); got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits)); };
const metaOf = (lessonId: string, island: LessonMeta['islandId'], outline: ReturnType<typeof llmFromBlueprint>): LessonMeta => ({
  lessonId: lessonId as LessonMeta['lessonId'], islandId: island, slug: outline.slug, title: outline.title, summary: outline.summary,
  learningObjectives: outline.objectives, difficulty: outline.difficulty, estimatedMinutes: outline.minutes, prerequisites: outline.prerequisites,
  concepts: outline.concepts, apcsRelevance: outline.apcs, supportedLanguages: outline.capabilities.includes('python-code') ? ['Python'] : [],
  visualizationType: outline.visualization, lessonStatus: 'complete', version: '1.0.0', capabilities: outline.capabilities, activity: outline.activity,
});
const meta = metaOf('LLM02', 'large-language-models', llmFromBlueprint('LLM02', '用 BPE 合併規則把中文與英文切成 token，並估算費用（測試用大綱）。', 50));

// ---- token-explorer -------------------------------------------------------------------------------------------------
validateTerminalLessonsFirst();

describe('byte-level BPE', () => {
  const table = tokenizer().table;
  it('reads text as UTF-8 bytes: one CJK character is three bytes', () => {
    expect(utf8('學')).toEqual([0xE5, 0xAD, 0xB8]);
    expect(utf8('a學')).toHaveLength(4);
    expect(bytesToText([0xE5, 0xAD])).toBe('<0xE5><0xAD>');
    expect(bytesToText([0xE5, 0xAD, 0xB8, 0x21])).toBe('學!');
    expect(spellingBytes(' 學<0xE7>')).toEqual([0x20, 0xE5, 0xAD, 0xB8, 0xE7]);
    expect(pretokenize('lower 學生, ok')).toEqual(['lower', ' 學生', ',', ' ok']);
  });
  it('fixes the vocabulary: 256 bytes, then the merges in rank order, then the special tokens', () => {
    const v = vocabulary(table);
    expect(v.tokens).toHaveLength(256 + 8 + 1);
    expect(v.tokens[97].spelling).toBe('a');
    expect(v.tokens.slice(256).map(t => t.spelling)).toEqual(['lo', 'low', ' low', ' <0xE5>', ' <0xE5><0xAD>', ' 學', ' 學<0xE7>', ' lowe', '<|endoftext|>']);
    expect(v.tokens[264]).toMatchObject({ special: true, spelling: '<|endoftext|>' });
  });
  it('encodes with every merge step, applying the lowest rank first, and decodes back to the text', () => {
    const e = encode(table, 'lower 學生<|endoftext|>');
    expect(e.ids).toEqual([257, 101, 114, 262, 0x94, 0x9F, 264]);
    expect(e.bytes).toBe(25);
    expect(e.start).toEqual([...utf8('lower 學生'), 264]);
    expect(e.steps.map(s => s.rank)).toEqual([0, 1, 3, 4, 5, 6]);
    expect(e.steps[0]).toMatchObject({ left: 108, right: 111, merged: 256, count: 1 });
    expect(e.steps.at(-1)!.ids).toEqual(e.ids);
    expect(decode(table, e.ids)).toBe('lower 學生<|endoftext|>');
    expect(decode(table, [229, 173])).toBe('<0xE5><0xAD>');
    expect(() => decode(table, [999])).toThrow(/unknown token id 999/);
  });
  it('splits a CJK character into byte tokens unless a merge covers it (merges never cross pre-tokens)', () => {
    expect(encode(table, '學校').ids).toEqual(utf8('學校'));
    expect(encode(table, ' 學').ids).toEqual([261]);
    expect(encode(table, 'low low').ids).toEqual([257, 258]);
    expect(encode(table, '<|endoftext|><|endoftext|>').ids).toEqual([264, 264]);
  });
  it('merges every occurrence of the best pair in one step, and a lower rank wins over an earlier position', () => {
    const t: BpeTable = { merges: [['a', 'b'], ['ab', 'c']], pretokenize: 'none' };
    const e = encode(t, 'abcab');
    expect(e.steps.map(s => [s.rank, s.count])).toEqual([[0, 2], [1, 1]]);
    expect(e.ids).toEqual([257, 256]);
    const order: BpeTable = { merges: [['b', 'c'], ['a', 'b']], pretokenize: 'none' };
    expect(encode(order, 'abc').ids).toEqual([97, 256]);
  });
  it('reports a table whose merges use tokens that do not exist yet, repeat a token or a special token', () => {
    expect(bpeTableProblems({ merges: [['ab', 'c']] })[0]).toMatch(/ab is not a token before it/);
    expect(bpeTableProblems({ merges: [['a', 'b'], ['a', 'b']] })[0]).toMatch(/makes a token that already exists/);
    expect(bpeTableProblems({ merges: [], special: ['<|x|>', '<|x|>'] })).toContain('a special token is listed twice');
    expect(() => vocabulary({ merges: [['ab', 'c']] })).toThrow(/invalid BPE table/);
  });
  it('trains merges deterministically: the most frequent pair, ties to the first seen, stopping under minCount', () => {
    const a = trainBpe(TRAINING_CORPUS, 8), b = trainBpe(TRAINING_CORPUS, 8);
    expect(a).toEqual(b);
    expect(a.merges).toEqual(table.merges);
    expect(a.steps.slice(0, 3).map(s => [s.merged, s.count])).toEqual([['lo', 5], ['low', 5], [' low', 4]]);
    expect(trainBpe('ab cd', 1, { minCount: 1 }).merges).toEqual([['a', 'b']]);
    expect(trainBpe('cd ab', 1, { minCount: 1 }).merges).toEqual([['c', 'd']]);
    expect(trainBpe('abc', 5).merges).toEqual([]);
  });
  it('counts tokens and estimates their cost from a price per 1,000 tokens', () => {
    expect(countTokens(table, 'lower 學生<|endoftext|>')).toBe(7);
    expect(tokenCost(7, 0.5)).toBeCloseTo(0.0035, 12);
    expect(tokenCost(2000, 0.15)).toBeCloseTo(0.3, 12);
  });
  it('computes log-loss, cross-entropy and perplexity from recorded probabilities', () => {
    expect(logLoss(1)).toBe(0);
    expect(logLoss(0.25)).toBe(2);
    expect(crossEntropy([0.5, 0.25])).toBe(1.5);
    expect(crossEntropy([0.5, 0.25], 'e')).toBeCloseTo(1.5 * Math.LN2, 12);
    expect(perplexity([0.5, 0.25])).toBeCloseTo(2 * Math.SQRT2, 12);
    expect(perplexity([0.25, 0.25, 0.25])).toBeCloseTo(4, 12);
    expect(() => logLoss(0)).toThrow();
  });
});

// ---- sampling-explorer ----------------------------------------------------------------------------------------------
describe('temperature, top-k, top-p and seeded sampling', () => {
  const logits = [2, 1, 0].map((logit, i) => ({ token: 'abc'[i], logit }));
  const final = (rows: ReturnType<typeof distribution>) => [...rows].sort((x, y) => x.index - y.index).map(r => r.probability);
  it('softmax with temperature matches hand-computed values', () => {
    close(softmax([2, 1, 0]), [0.665241, 0.244728, 0.090031]);
    close(softmax([2, 1, 0], 0.5), [0.866813, 0.117310, 0.015876]);
    close(softmax([2, 1, 0], 2), [0.506480, 0.307196, 0.186324]);
    close(softmax([1000, 999]), [0.731059, 0.268941]);
    expect(() => softmax([1, 2], 0)).toThrow(/greedy/);
  });
  it('top-k keeps the k most likely and renormalises; top-p keeps the smallest prefix reaching p', () => {
    close(final(distribution(logits, { temperature: 1, topK: 2 })), [0.731059, 0.268941, 0]);
    close(final(distribution(logits, { temperature: 1, topP: 0.9 })), [0.731059, 0.268941, 0]);
    close(final(distribution(logits, { temperature: 1, topP: 0.6 })), [1, 0, 0]);
    const probs = [0.5, 0.3, 0.2].map((probability, i) => ({ token: 'xyz'[i], probability }));
    close(final(distribution(probs, { temperature: 1 })), [0.5, 0.3, 0.2]);
    close(final(distribution(probs, { temperature: 1, topP: 0.8 })), [0.625, 0.375, 0]);
    expect(distribution(probs, { temperature: 1, topK: 1 }).map(r => r.cut)).toEqual([undefined, 'top-k', 'top-k']);
  });
  it('applies top-k before top-p (top-p runs on the renormalised top-k distribution)', () => {
    const four = [0.4, 0.3, 0.2, 0.1].map((probability, i) => ({ token: 'abcd'[i], probability }));
    // After top-k = 3: 4/9, 3/9, 2/9; the running total reaches 0.75 at the second (7/9), so two stay: 4/7, 3/7.
    close(final(distribution(four, { temperature: 1, topK: 3, topP: 0.75 })), [4 / 7, 3 / 7, 0, 0]);
    // On the original distribution top-p = 0.75 alone would keep three (0.4 + 0.3 < 0.75).
    close(final(distribution(four, { temperature: 1, topP: 0.75 })), [4 / 9, 3 / 9, 2 / 9, 0]);
  });
  it('greedy decoding (T = 0) takes the argmax, the first listed on a tie', () => {
    close(final(distribution(logits, { temperature: 0 })), [1, 0, 0]);
    const tie = [{ token: 'p', logit: 1 }, { token: 'q', logit: 1 }];
    expect(distribution(tie, { temperature: 0 }).find(r => r.kept)!.token).toBe('p');
    expect(distribution(tie, { temperature: 1 }).map(r => r.token)).toEqual(['p', 'q']);
  });
  it('picks by walking the sorted kept candidates until the running total exceeds u', () => {
    const rows = distribution([0.5, 0.3, 0.2].map((probability, i) => ({ token: 'xyz'[i], probability })), { temperature: 1 });
    expect([0, 0.49, 0.5, 0.79, 0.8, 0.9999].map(u => pick(rows, u).token)).toEqual(['x', 'x', 'y', 'y', 'z', 'z']);
  });
  it('Mulberry32 gives the documented sequence for a seed (checked against an independent implementation)', () => {
    close(draws(42, 3), [0.6011037519201636, 0.44829055899754167, 0.8524657934904099], 15);
    close(draws(0, 2), [0.26642920868471265, 0.0003297457005828619], 15);
    close(draws(4294967295, 1), [0.8964226141106337], 15);
    const g = mulberry32(42);
    expect([g(), g()]).toEqual(draws(42, 2));
  });
  it('generates token by token: the same seed and settings give the same tokens, greedy draws nothing', () => {
    const s = sampler();
    const a = generate(s.model, s.prompt, s.settings, 42, 6), b = generate(s.model, s.prompt, s.settings, 42, 6);
    expect(a).toEqual(b);
    expect(a.steps.map(x => x.token)).toEqual(['很好', '。', '<|endoftext|>']);
    expect(a.stop).toBe('end');
    expect(a.steps.map(x => x.u)).toEqual(draws(42, 3));
    expect(a.steps[2].context).toEqual([]);
    const greedy = generate(s.model, s.prompt, { temperature: 0 }, 7, 6);
    expect(greedy.steps.every(x => x.u === undefined)).toBe(true);
    expect(greedy.steps.map(x => x.token)).toEqual(['很好', '。', '<|endoftext|>']);
    expect(generate(s.model, s.prompt, s.settings, 42, 1)).toMatchObject({ stop: 'max-steps', tokens: ['今天', '天氣', '很好'] });
    expect(generate({ contexts: [{ context: ['a'], candidates: [{ token: 'b', logit: 0 }, { token: 'c', logit: 0 }] }] }, ['a'], { temperature: 1 }, 1, 5).stop).toBe('no-context');
    expect(() => generate(s.model, s.prompt, s.settings, -1, 3)).toThrow(/seed/);
  });
  it('finds the longest recorded context the tokens end with', () => {
    const model: ToyModel = { contexts: [{ context: [], candidates: [] }, { context: ['b'], candidates: [] }, { context: ['a', 'b'], candidates: [] }] };
    expect(contextFor(model, ['a', 'b'])!.context).toEqual(['a', 'b']);
    expect(contextFor(model, ['c', 'b'])!.context).toEqual(['b']);
    expect(contextFor(model, ['c'])!.context).toEqual([]);
  });
  it('reports recorded distributions that are not distributions', () => {
    const bad = (candidates: ToyModel['contexts'][number]['candidates']) => toyModelProblems({ contexts: [{ context: ['x'], candidates }] }).join('\n');
    expect(bad([{ token: 'a', probability: 0.5 }, { token: 'b', probability: 0.4 }])).toMatch(/sum to 0\.9, not 1/);
    expect(bad([{ token: 'a', probability: 0.5 }, { token: 'b', logit: 1 }])).toMatch(/every candidate a logit, or every candidate a probability/);
    expect(bad([{ token: 'a', logit: 1 }, { token: 'a', logit: 2 }])).toMatch(/repeats a candidate/);
    expect(bad([{ token: 'a', logit: 1 }])).toMatch(/at least two candidates/);
    expect(bad([{ token: 'a', logit: NaN }, { token: 'b', logit: 2 }])).toMatch(/not a finite number/);
  });
});

// ---- embedding-space ------------------------------------------------------------------------------------------------
describe('embeddings: similarity, nearest neighbours and a deterministic PCA', () => {
  it('computes dot products, norms and cosine similarity', () => {
    expect(dot([1, 2, 2], [2, 0, 1])).toBe(4);
    expect(norm([1, 2, 2])).toBe(3);
    expect(cosine([1, 2, 2], [2, 0, 1])).toBeCloseTo(4 / (3 * Math.sqrt(5)), 12);
    expect(cosine([1, 0], [2, 0])).toBe(1);
    expect(() => cosine([0, 0], [1, 0])).toThrow(/zero vector/);
  });
  it('ranks nearest neighbours by cosine (or dot product), leaving the item itself out', () => {
    const space = tokenSpace().space;
    expect(nearest(space, 'cat', 2).map(n => n.label)).toEqual(['狗', '蘋果']);
    expect(nearest(space, 'car', 1)[0].label).toBe('火車');
    expect(nearest(space, 'cat').map(n => n.id)).not.toContain('cat');
    const ranked = nearest(space, 'cake', 5, 'dot');
    expect(ranked.map(n => n.score)).toEqual([...ranked.map(n => n.score)].sort((a, b) => b - a));
  });
  it('projects with PCA: hand-computed axes, unit and orthogonal, sign-normalised, the same every time', () => {
    const space: EmbeddingSpace = { kind: 'token', items: [[2, 0], [-2, 0], [0, 1], [0, -1]].map((vector, i) => ({ id: `t${i}`, token: `t${i}`, vector })) };
    const p = project(space);
    close(p.axes[0], [1, 0], 9); close(p.axes[1], [0, 1], 9);
    close(p.eigenvalues.slice(0, 2), [2, 0.5], 9);
    close(p.explained, [0.8, 0.2], 9);
    close(p.points.t0, [2, 0], 9); close(p.points.t3, [0, -1], 9);
    const fixture = tokenSpace().space, q = project(fixture);
    expect(project(tokenSpace().space)).toEqual(q);
    expect(dot(q.axes[0], q.axes[0])).toBeCloseTo(1, 9);
    expect(dot(q.axes[0], q.axes[1])).toBeCloseTo(0, 9);
    for (const axis of q.axes) { const big = axis.reduce((b, x, i) => Math.abs(x) > Math.abs(axis[b]) ? i : b, 0); expect(axis[big]).toBeGreaterThan(0); }
    expect(q.converged).toBe(true);
  });
  it('refuses a projection that is not well defined, and vectors that cannot be compared', () => {
    const items = (vectors: number[][]) => vectors.map((vector, i) => ({ id: `t${i}`, token: `t${i}`, vector }));
    expect(projectionProblems({ kind: 'token', items: items([[1, 1], [2, 2], [3, 3]]) }).join()).toMatch(/on a line/);
    expect(projectionProblems({ kind: 'token', items: items([[1, 0], [-1, 0], [0, 1], [0, -1]]) }).join()).toMatch(/not unique/);
    expect(embeddingSpaceProblems({ kind: 'token', items: items([[1, 0], [0, 0], [0, 1]]) }).join()).toMatch(/zero vector/);
    expect(embeddingSpaceProblems({ kind: 'token', items: items([[1, 0], [0, 1, 2], [0, 1]]) }).join()).toMatch(/has 3 dimensions, not 2/);
    expect(embeddingSpaceProblems({ kind: 'token', dimensions: ['a'], items: items([[1, 0], [0, 1], [1, 1]]) }).join()).toMatch(/names 1 dimensions/);
    const twice = items([[1, 0], [0, 1], [1, 1]]); twice[2].token = 't0';
    expect(embeddingSpaceProblems({ kind: 'token', items: twice }).join()).toMatch(/two items are both "t0"/);
    expect(embeddingSpaceProblems({ kind: 'token', items: items([[1, 0], [0, 1], [2, 1]]), queries: [] } as unknown as EmbeddingSpace).join()).toMatch(/only a document space has queries/);
    expect(embeddingSpaceProblems(tokenSpace().space)).toEqual([]);
  });
});

// ---- content validation -------------------------------------------------------------------------------------------
describe('llmContentProblems', () => {
  const problems = (change: (c: LlmLessonContent) => void) => { const c = llmContent(); change(c); return llmContentProblems(c).join('\n'); };
  const exercise = (c: LlmLessonContent, id: string) => c.exercises.find(e => e.id === id)! as LlmExercise & Record<string, never>;
  it('accepts the fixture: every answer follows from the data and every typical mistake is rejected', () => {
    expect(llmContentProblems(llmContent())).toEqual([]);
    for (const e of exercises()) for (const m of e.mistakes) expect(checkLlmAnswer(e, m.answer).ok, `${e.id}: ${m.why}`).toBe(false);
  });
  it('catches recorded data that is not self-consistent', () => {
    expect(problems(c => { c.tokenizers![0].table.merges[7] = [' 學<0xE7>', '<0x94>']; })).toMatch(/training on the corpus gives " low \+ e" at rank 7/);
    expect(problems(c => { c.tokenizers![0].scoring![0].probabilities = [0.5]; })).toMatch(/scoring model-a has 1 probabilities for 2 tokens/);
    expect(problems(c => { c.tokenizers![0].scoring![0].probabilities = [0.5, 1.5]; })).toMatch(/probability outside \(0, 1\]/);
    expect(problems(c => { c.tokenizers![0].table.merges.push(['zz', 'q']); })).toMatch(/zz is not a token before it/);
    expect(problems(c => { c.tokenizers![0].pricePer1k = -1; })).toMatch(/price per 1,000 tokens/);
    expect(problems(c => { c.samplers![0].model.contexts[1].candidates[0].probability = 0.6; })).toMatch(/sum to 1\.1/);
    expect(problems(c => { c.samplers![0].settings.seed = 1.5; })).toMatch(/seed 1\.5/);
    expect(problems(c => { c.samplers![0].settings.topP = 0; })).toMatch(/top-p 0 must be in/);
    expect(problems(c => { c.samplers![0].prompt = ['無關']; c.samplers![0].model.contexts.pop(); })).toMatch(/no context matches the prompt/);
    expect(problems(c => { c.embeddings![0].space.items[0].vector = [0, 0, 0, 0, 0, 0]; })).toMatch(/cat is the zero vector/);
    expect(problems(c => { c.embeddings = []; c.samplers = []; c.tokenizers = []; })).toMatch(/needs at least one explorer/);
  });
  it('catches an answer that does not follow from the data', () => {
    expect(problems(c => { exercise(c, 'x-count').blank.answer = 8; })).toMatch(/x-count: blank count: the answer 8 does not follow from the data \(7/);
    expect(problems(c => { exercise(c, 'x-tokens').blank.answer = 'lo|w|e|r'; })).toMatch(/x-tokens: blank tokens: the answer "lo\|w\|e\|r" does not follow/);
    expect(problems(c => { exercise(c, 'x-temperature').blank.answer = 0.8662; })).toMatch(/the answer 0\.8662 does not follow from the data \(0\.8668.*within half the tolerance 0\.001/);
    expect(problems(c => { exercise(c, 'x-cosine').blank.tolerance = 0; })).toMatch(/non-integer answer needs a tolerance > 0/);
    expect(problems(c => { exercise(c, 'x-nearest').answer = 0; })).toMatch(/x-nearest: the data makes "早上的火車誤點了" right/);
    expect(problems(c => { exercise(c, 'x-nearest').options[0] = '早上的火車誤點了 '; })).toMatch(/distinct options|the data makes/);
    expect(problems(c => { exercise(c, 'x-tokens').blank.query = { of: 'token-count', explorer: 'toy-bpe', text: 'lower' }; })).toMatch(/gives a number, so the answer is a number/);
    expect(problems(c => { exercise(c, 'x-count').blank.query = { of: 'token-count', explorer: 'nowhere', text: 'x' }; })).toMatch(/no tokenizer nowhere/);
    expect(problems(c => { exercise(c, 'x-generate').blank.query = { of: 'generate', explorer: 'toy-weather', settings: { temperature: 1 }, seed: 42, steps: 99 }; })).toMatch(/steps must be 1…6/);
  });
  it('catches a typical mistake that passes, answers a blank that does not exist, or is missing', () => {
    expect(problems(c => { exercise(c, 'x-count').mistakes.push({ answer: { value: '7' }, why: '其實是對的' }); })).toMatch(/the typical mistake "其實是對的" passes the check/);
    expect(problems(c => { exercise(c, 'x-ids').mistakes.push({ answer: { idz: '1' }, why: '打錯欄位' }); })).toMatch(/answers idz, which the exercise does not ask/);
    expect(problems(c => { exercise(c, 'x-cost').mistakes = []; })).toMatch(/x-cost: needs at least one typical mistake/);
    expect(problems(c => { exercise(c, 'x-cost').hints = []; })).toMatch(/x-cost: needs hints/);
  });
  it('catches duplicate ids among explorers and exercises', () => {
    expect(problems(c => { c.exercises[1].id = c.exercises[0].id; })).toMatch(/duplicate id x-tokens/);
    expect(problems(c => { c.embeddings![1].id = 'toy-bpe'; })).toMatch(/duplicate id toy-bpe/);
  });
  it('checks a learner\'s answer by value: numbers within the tolerance, percentages, lists, sets and spaces', () => {
    const [tokens, count, cost, ids, temperature, topP] = exercises();
    expect(checkLlmAnswer(tokens, { value: ' low | e | r ' }).ok).toBe(true);
    expect(checkLlmAnswer(tokens, { value: 'low、e、r' }).ok).toBe(true);
    expect(checkLlmAnswer(tokens, { value: 'low|r|e' }).ok).toBe(false);
    expect(checkLlmAnswer(count, { value: '７' }).ok).toBe(true);
    expect(checkLlmAnswer(count, { value: '' }).messages).toEqual(['還沒有填「token 數」。']);
    expect(checkLlmAnswer(count, { value: 'seven' }).messages[0]).toMatch(/要填一個數字/);
    expect(checkLlmAnswer(cost, { value: '0.00352' }).ok).toBe(true);
    expect(checkLlmAnswer(ids, { ids: '257,258', bytes: '6' }).ok).toBe(true);
    expect(checkLlmAnswer(temperature, { value: '86.7%' }).ok).toBe(true);
    expect(checkLlmAnswer(temperature, { value: '0.8668' }).ok).toBe(true);
    expect(checkLlmAnswer(topP, { kept: '，|。', p: '0.625' }).ok).toBe(true);
    expect(parseNumber(' 1e-3 ')).toBe(0.001);
    expect(parseNumber('1/2')).toBeUndefined();
    expect(llmQueryValue({ of: 'nearest', explorer: 'word-vectors', item: 'cat', k: 2 }, llmContent())).toMatchObject({ type: 'list', items: ['狗', '蘋果'] });
  });
});

// ---- schema, builder and islands ------------------------------------------------------------------------------------
describe('the llm-explorer capability in the curriculum schema', () => {
  it('registers the capability and its three activities', () => {
    expect(LESSON_CAPABILITIES).toContain('llm-explorer');
    for (const a of ['token-explorer', 'sampling-explorer', 'embedding-space']) expect(LESSON_ACTIVITIES).toContain(a);
  });
  it('builds outlines from the blueprint: the explorer is the activity, code-python lessons add python-code', () => {
    expect(llmFromBlueprint('LLM01', 's', 40)).toMatchObject({ activity: 'sampling-explorer', capabilities: ['llm-explorer'], visualization: 'none', blueprintId: 'LLM01' });
    expect(llmFromBlueprint('LLM02', 's', 50)).toMatchObject({ activity: 'token-explorer', capabilities: ['llm-explorer'] });
    expect(llmFromBlueprint('LLM03', 's', 50)).toMatchObject({ activity: 'embedding-space', capabilities: ['llm-explorer'] });
    expect(llmFromBlueprint('LLM05', 's', 55)).toMatchObject({ activity: 'token-explorer', capabilities: ['llm-explorer'] });
    expect(llmFromBlueprint('GEN01', 's', 40)).toMatchObject({ activity: 'sampling-explorer', capabilities: ['llm-explorer'] });
    for (const id of ['LLM11', 'LLM15', 'GEN02', 'GEN08']) expect(llmFromBlueprint(id, 's', 50).capabilities, id).toEqual(['python-code', 'llm-explorer']);
    expect(llmFromBlueprint('LLM02', 's', 50, true).capabilities).toEqual(['python-code', 'llm-explorer']);
    expect(llmFromBlueprint('LLM11', 's', 50, false).capabilities).toEqual(['llm-explorer']);
    const b = planning.plannedLessons.find(l => l.lessonId === 'LLM03')!;
    expect(llmFromBlueprint('LLM03', 's', 50)).toMatchObject({ slug: b.slug, title: b.title, objectives: b.learningObjectives, concepts: b.concepts, prerequisites: b.prerequisites });
    expect(() => llmFromBlueprint('LLM04', 's', 50)).toThrow(/no llm-explorer lesson shape for the blueprint activity attention-explorer/);
    expect(() => llmFromBlueprint('CN01', 's', 50)).toThrow(/not a large-language-models or generative-ai lesson/);
  });
  it('validates the complete fixture lesson and passes the publish gate', () => {
    expect(meta).toMatchObject({ activity: 'token-explorer', capabilities: ['llm-explorer'], supportedLanguages: [] });
    expect(validateContent(meta, llmLesson(), curriculum.visualizations)).toEqual([]);
    expect(publishProblems(meta, llmLesson())).toEqual([]);
  });
  it('ties content to the capability and the activity to an explorer of its kind', () => {
    const { llm: _l, ...without } = llmLesson();
    void _l;
    expect(validateContent(meta, without, curriculum.visualizations)).toContain('LLM02: the llm-explorer capability needs its content');
    const tokensless = llmLesson(); tokensless.llm!.tokenizers = []; tokensless.llm!.exercises = tokensless.llm!.exercises.filter(e => !JSON.stringify(e).includes('toy-bpe'));
    tokensless.sections[0].blocks = tokensless.sections[0].blocks.filter(b => b.type !== 'example');
    expect(validateContent(meta, tokensless, curriculum.visualizations)).toContain('LLM02: the token-explorer activity needs at least one of content.llm.tokenizers');
    const hidden = llmLesson(); hidden.sections[2].blocks.pop();
    expect(validateContent(meta, hidden, curriculum.visualizations)).toContain('LLM02: example sentence-vectors is never shown');
    const wrong = llmLesson(); (wrong.llm!.exercises[1] as Extract<LlmExercise, { kind: 'number' }>).blank.answer = 9;
    expect(validateContent(meta, wrong, curriculum.visualizations).join('\n')).toMatch(/LLM02: exercise x-count: blank count: the answer 9 does not follow/);
    // A network lesson cannot carry llm content.
    const cn = lessons.find(l => l.lessonId === 'CN01')!;
    expect(validateContent(cn, { ...curriculum.contents.CN01!, llm: llmContent() }, curriculum.visualizations)).toContain('CN01: has llm-explorer content without the llm-explorer capability');
  });
  it('lets python-code pair with llm-explorer only: an LLM lesson may carry Python examples and exercises too', () => {
    const python = metaOf('LLM11', 'large-language-models', llmFromBlueprint('LLM11', '以 token 預算管理多輪對話（測試用大綱）。', 55));
    expect(python).toMatchObject({ capabilities: ['python-code', 'llm-explorer'], supportedLanguages: ['Python'], activity: 'token-explorer' });
    const code = { Python: 'print(len("學".encode("utf-8")))' };
    const content: LessonContent = { ...llmLesson(), lessonId: 'LLM11' as LessonContent['lessonId'],
      sections: llmLesson().sections.map((s, i) => ({ ...s, blocks: [...s.blocks, { type: 'example' as const, id: `py${i}` }] })),
      examples: [0, 1, 2].map(i => ({ id: `py${i}`, title: `位元組 ${i}`, description: '用 UTF-8 編碼數位元組。', code, output: '3' })),
      exercises: [{ id: 'py-x', title: '數位元組', statement: '讀入一行文字，印出它的 UTF-8 位元組數。', inputFormat: '一行文字', outputFormat: '一個整數', constraints: ['長度 ≤ 100'],
        samples: [{ kind: 'normal', input: '學\n', output: '3\n', note: '一個中文字' }], tests: [{ kind: 'normal', input: 'ab\n', output: '2\n', note: '英文' }, { kind: 'edge', input: '\n', output: '0\n', note: '空行' }],
        errorPolicy: '輸入保證是一行文字。', hints: ['用 `encode("utf-8")`。'], solution: { Python: 'print(len(input().encode("utf-8")))' }, judge: 'none' }] };
    expect(validateContent(python, content, curriculum.visualizations)).toEqual([]);
    expect(validateContent(python, { ...content, examples: [] }, curriculum.visualizations).join('\n')).toMatch(/LLM11: needs at least 3 code examples/);
    expect(validateContent(python, { ...content, llm: { ...llmContent(), exercises: [{ ...exercises()[0], id: 'py-x' }] } }, curriculum.visualizations)).toContain('LLM11: duplicate id py-x');
    // The pairing rules, on a published lesson's place (A14): llm-explorer is python-code's only companion.
    const swap = (patch: Partial<LessonMeta>) => validateCurriculum({ ...curriculum, lessons: lessons.map(l => l.lessonId === 'A14' ? { ...l, ...patch } : l) }).join('\n');
    expect(swap({ capabilities: ['python-code', 'llm-explorer'], supportedLanguages: ['Python'], activity: 'token-explorer' })).not.toMatch(/A14: python-code stands alone|A14: an llm-explorer lesson|A14: a python-code lesson offers/);
    expect(swap({ capabilities: ['python-code', 'visualization'], supportedLanguages: ['Python'] })).toMatch(/A14: python-code stands alone/);
    expect(swap({ capabilities: ['python-code', 'llm-explorer', 'visualization'], supportedLanguages: ['Python'], activity: 'token-explorer' })).toMatch(/A14: python-code stands alone/);
    expect(swap({ capabilities: ['python-code', 'llm-explorer'], supportedLanguages: ['Python'] })).toMatch(/A14: an llm-explorer lesson names one of token-explorer, sampling-explorer, embedding-space as its activity/);
    expect(swap({ capabilities: ['program-code', 'llm-explorer'], activity: 'token-explorer' })).toMatch(/A14: program-code stands alone/);
    expect(swap({ capabilities: ['python-code', 'llm-explorer'], supportedLanguages: ['C++', 'Java', 'Python'], activity: 'token-explorer' })).toMatch(/A14: a python-code lesson offers Python only/);
    expect(swap({ capabilities: ['terminal'], activity: 'token-explorer', supportedLanguages: [] })).toMatch(/A14: activity token-explorer needs the llm-explorer capability/);
  });
});

describe('the large-language-models island: prepared in LLM-0, written in batches from LLM-1', () => {
  it('is a curriculum island with its first lessons written in id order and in its units; the rest stay planned outlines without a page', () => {
    expect(PREPARED_ISLAND_IDS).not.toContain('large-language-models');
    expect(ISLAND_IDS).toContain('large-language-models');
    expect(ISLAND_PREFIX['large-language-models']).toBe('LLM');
    const written = lessons.filter(l => l.islandId === 'large-language-models');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `LLM${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(3);
    // LLM-1: one unit, LLM01–LLM03.
    expect(UNITS['large-language-models'][0]).toMatchObject({ title: '語言模型如何讀寫文字', lessonIds: ['LLM01', 'LLM02', 'LLM03'] });
    expect(UNITS['large-language-models'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    // Every written lesson has its content and its page; only LLM and (from GEN-1) GEN lessons declare llm-explorer.
    for (const l of written) {
      expect(curriculum.contents[l.lessonId]?.llm, l.lessonId).toBeDefined();
      expect(getLessonBySlug(l.slug)?.lessonId, l.slug).toBe(l.lessonId);
    }
    const generative = lessons.filter(l => l.islandId === 'generative-ai');
    expect(lessons.filter(l => l.capabilities.includes('llm-explorer')).map(l => l.lessonId)).toEqual([...written, ...generative].map(l => l.lessonId));
    const outline = lessonsOfIsland('large-language-models');
    expect(outline.map(l => l.lessonId)).toEqual(Array.from({ length: 25 }, (_, i) => `LLM${String(i + 1).padStart(2, '0')}`));
    expect(outline.slice(0, written.length).every(l => l.lessonStatus === 'complete' && l.href === `/curriculum/${l.slug}`)).toBe(true);
    for (const l of outline.slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('large-language-models')).toMatchObject({ status: written.length < 25 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});

describe('the generative-ai island: prepared in LLM-0, published from GEN-1', () => {
  it('is a curriculum island after large-language-models with its first lessons written in id order and in its units; the rest stay planned outlines without a page', () => {
    // GEN-1 moved generative-ai (prepared in LLM-0) to ISLAND_IDS; DKR-0 then prepared docker-containers and DKR-1 published it;
    // CICD-0 prepared devops-cicd and CICD-1 published it; KUB-0 prepared kubernetes-reliability, now the only prepared island.
    expect(PREPARED_ISLAND_IDS).toEqual(['kubernetes-reliability']);
    expect(ISLAND_IDS).toContain('generative-ai');
    expect(ISLAND_IDS.indexOf('generative-ai')).toBe(ISLAND_IDS.indexOf('large-language-models') + 1);
    expect(ISLAND_PREFIX['generative-ai']).toBe('GEN');
    const written = lessons.filter(l => l.islandId === 'generative-ai');
    expect(written.map(l => l.lessonId)).toEqual(written.map((_, i) => `GEN${String(i + 1).padStart(2, '0')}`));
    expect(written.length).toBeGreaterThanOrEqual(2);
    // GEN-1: one unit, GEN01–GEN02.
    expect(UNITS['generative-ai'][0]).toMatchObject({ title: '生成模型與自回歸生成', lessonIds: ['GEN01', 'GEN02'] });
    expect(UNITS['generative-ai'].flatMap(u => u.lessonIds)).toEqual(written.map(l => l.lessonId));
    // Every written lesson has its content and its page; GEN02's blueprint exercise is code-python, so it pairs Python with its explorer.
    for (const l of written) {
      expect(curriculum.contents[l.lessonId]?.llm, l.lessonId).toBeDefined();
      expect(getLessonBySlug(l.slug)?.lessonId, l.slug).toBe(l.lessonId);
    }
    expect(written.slice(0, 2).map(l => [l.lessonId, l.capabilities, l.activity, l.supportedLanguages])).toEqual([
      ['GEN01', ['llm-explorer'], 'sampling-explorer', []],
      ['GEN02', ['python-code', 'llm-explorer'], 'sampling-explorer', ['Python']],
    ]);
    const outline = lessonsOfIsland('generative-ai');
    expect(outline.map(l => l.lessonId)).toEqual(Array.from({ length: 20 }, (_, i) => `GEN${String(i + 1).padStart(2, '0')}`));
    expect(outline.slice(0, written.length).every(l => l.lessonStatus === 'complete' && l.href === `/curriculum/${l.slug}`)).toBe(true);
    for (const l of outline.slice(written.length)) {
      expect(l.lessonStatus, l.lessonId).toBe('planned');
      expect(l.href, l.lessonId).toBeUndefined();
      expect(getLessonBySlug(l.slug), l.slug).toBeUndefined();
    }
    // Its lessons open on their own; its 3D landscape stays the planned one (IslandConfig.mapState, set by hand).
    expect(getIsland('generative-ai')).toMatchObject({ status: written.length < 20 ? 'available' : 'complete', mapState: 'planned' });
  });
  it('leaves the curriculum valid', () => {
    expect(validateCurriculum(curriculum)).toEqual([]);
  });
});

describe('token answers keep their spaces', () => {
  it('reads ␣ as a space inside a token, so ` low` and `low` differ, and spaces around a token are only separators', () => {
    const m = matchesValue;
    const value = { type: 'list' as const, ordered: true, separator: 'bar' as const, items: ['lo', 'w', ' low'] };
    expect(m(value, 'lo | w | ␣low')).toBe(true);
    expect(m(value, ' lo|w|␣low ')).toBe(true);
    expect(m(value, 'lo | w | low')).toBe(false);
    expect(m({ type: 'list', ordered: true, separator: 'bar', items: ['a', ' ', 'b'] }, 'a|␣|b')).toBe(true);
    expect(m({ type: 'list', ordered: true, separator: 'space', items: ['108', '111'] }, '108, 111')).toBe(true);
  });
});

describe('a token answer with a leading space, in the validator too', () => {
  const content = (ex: LlmExercise): LlmLessonContent => ({ tokenizers: [tokenizer()], exercises: [ex] });
  const field = (answer: string, why: string): LlmExercise => ({ id: 'x-space', kind: 'field', title: '切 low low', statement: '把 `low low` 切成 token。',
    blank: { id: 'tokens', label: 'token', query: { of: 'tokens', explorer: 'toy-bpe', text: 'low low' }, answer },
    hints: ['第二個 low 前面的空白和它合成一個 token。'], explanation: '`low` 與 `␣low`：空白是第二個 token 的一部分。',
    mistakes: [{ answer: { value: why === 'right' ? 'low|low' : 'low|␣low' }, why: '忘了 token 開頭的空白' }] });
  it('accepts ␣low as the second token and rejects low (the space belongs to the token)', () => {
    expect(llmContentProblems(content(field('low|␣low', 'right')))).toEqual([]);
    expect(llmContentProblems(content(field('low|low', 'wrong'))).join('\n')).toMatch(/does not follow from the data/);
  });
  it('compares a trained merge as a token: ␣low, not low', () => {
    const merge = (answer: string, mistake: string): LlmExercise => ({ id: 'x-merge', kind: 'field', title: '第三條規則', statement: '訓練學到的第三條合併規則產生哪個 token？',
      blank: { id: 'merge', label: 'token', query: { of: 'trained-merge', explorer: 'toy-bpe', rank: 2 }, answer },
      hints: ['數一數語料裡相鄰的配對。'], explanation: '空白和 low 相鄰最多次，合成 `␣low`。', mistakes: [{ answer: { value: mistake }, why: '漏了空白' }] });
    expect(llmContentProblems(content(merge('␣low', 'low')))).toEqual([]);
    expect(llmContentProblems(content(merge('low', '␣low'))).join('\n')).toMatch(/does not follow from the data/);
  });
});
