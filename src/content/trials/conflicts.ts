/*
 * T.2E similarity conflict graph (docs/exam-system/21 §5): pairs of iPAS questions that test nearly the same point,
 * reuse a similar case or would hint at each other's answer, so a drawn paper should not hold both. A soft rule of the
 * draw (src/lib/trials/draw.ts): kept apart whenever the syllabus quotas allow, reported when they do not.
 *
 * Q01–Q100: the avoid-same-paper pairs of docs 15–18 (also in the private bank's ipas review queue).
 * Q101–Q200: pairs found by the batch writers, the blind reviewers and the cross-batch scan of T.2E.
 * Edges only join questions of the same subject; a pair across subjects can never share a paper.
 */
import { generatedBatches } from './generated';
import { hasPrivateBank } from './private-bank';

export type ConflictKind = 'same-point' | 'similar-case' | 'answer-hint';
export interface ConflictEdge { a: string; b: string; kind: ConflictKind }

const LETTERS = 'abcdefgh';
/** Q-number → question id (25 per batch: a = Q01–Q25 … h = Q176–Q200). */
export const ipasId = (n: number) => `ipas-aiap-basic-${LETTERS[Math.floor((n - 1) / 25)]}-${String(n).padStart(2, '0')}`;
const edges = (kind: ConflictKind, list: string): ConflictEdge[] => list.trim().split(/\s+/).map(p => {
  const [a, b] = p.split('/').map(Number);
  return { a: ipasId(a), b: ipasId(b), kind };
});

export const conflictEdges: ConflictEdge[] = [
  // docs 15–18
  ...edges('same-point', '02/03 04/07 08/10 12/13 15/20 15/24 17/18 20/22 20/24 21/23 21/26 22/25 24/25 24/27 24/50 28/35 29/38 31/32 33/34 40/41 41/42 45/47 49/50'),
  ...edges('same-point', '53/69 58/60 60/68 62/94 65/72 66/70 71/97 72/95 73/74 75/79 76/81 77/82 80/89 83/85 89/90 92/98'),
  // T.2E subject 1 (batches E, F; docs/exam-system/21 §2)
  ...edges('answer-hint', '03/103 04/104 21/122 28/129 34/139 45/147 32/137 39/144'),
  ...edges('same-point', '22/123 23/124 27/114 18/119 22/126 123/126 33/134'),
  ...edges('similar-case', '25/135 25/141 43/143 47/147 36/136'),
  ...edges('answer-hint', '40/139'),
  // T.2E subject 2 (batches G, H)
  ...edges('answer-hint', '77/175 77/180 76/182 60/162 97/165'),
  ...edges('same-point', '81/173 53/170 66/166 86/175 75/178 80/179 90/187 173/177 174/181'),
  ...edges('similar-case', '195/199'),
];

/** CCAR-F question id by number: batches A–D hold 25 each (Q01–Q100), E Q101–Q108, F Q109–Q129, G Q130–Q150 (docs/exam-system/26 §7, 28 §4, 29 §4). */
const ccarfId = (n: number) => `ccarf-${n > 129 ? 'g' : n > 108 ? 'f' : n > 100 ? 'e' : 'abcd'[Math.floor((n - 1) / 25)]}-${String(n).padStart(2, '0')}`;
export const ccarfConflictEdges: ConflictEdge[] = ([
  // The programmatic gate of Q04 hints at the hook of Q05; Q19 and Q20 both validate extraction; Q03 and Q24 both turn on a subagent's own context.
  [4, 5, 'answer-hint'], [19, 20, 'same-point'], [3, 24, 'similar-case'],
  // T.3C (docs/exam-system/27 §6): isError for failures and validation; failed vs. empty lookups; escalation; review
  // loops; Glob; MCP scopes; schema extraction; path rules; retries; few-shot variety.
  [9, 34, 'same-point'], [34, 83, 'same-point'], [9, 83, 'answer-hint'], [49, 98, 'similar-case'],
  [48, 97, 'answer-hint'], [22, 71, 'similar-case'], [12, 85, 'similar-case'],
  [11, 36, 'similar-case'], [19, 45, 'similar-case'], [15, 40, 'answer-hint'], [20, 70, 'same-point'],
  [68, 92, 'same-point'], [50, 100, 'same-point'], [25, 75, 'similar-case'],
  // T.3D (docs/exam-system/28 §4): both say a clear change needs no plan mode; both clarify instead of guessing; the stated
  // vs. computed total of Q108 is the answer of Q19.
  [65, 88, 'same-point'], [73, 105, 'similar-case'], [19, 108, 'answer-hint'],
  // T.3E (docs/exam-system/29 §6): pairs found by the writers and the blind reviews of batches F and G.
  [109, 110, 'answer-hint'], [111, 112, 'similar-case'], [117, 128, 'same-point'], [59, 121, 'same-point'],
  [22, 150, 'similar-case'], [139, 140, 'answer-hint'], [148, 150, 'answer-hint'], [113, 139, 'similar-case'],
] as const).map(([a, b, kind]) => ({ a: ccarfId(a), b: ccarfId(b), kind }));

const allPairs = (): [string, string][] => [...conflictEdges, ...ccarfConflictEdges].map(e => [e.a, e.b]);
/** T.3J: without the private bank only the pairs between questions the bank holds (its unpublished ones are not there). */
export const conflictPairs = (): [string, string][] => {
  if (hasPrivateBank) return allPairs();
  const known = new Set(generatedBatches.flatMap(b => b.questions.map(q => q.id)));
  return allPairs().filter(([a, b]) => known.has(a) && known.has(b));
};
