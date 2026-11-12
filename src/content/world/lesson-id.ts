/*
 * Phase F.0: lesson IDs of every island, existing and planned. An ID is an island prefix and a two-digit number
 * (F01, DB01, AIF20, ML25). Prefixes share first letters (D/DB/DL, A/AIF/AG), so an ID is always read with its whole
 * prefix, never by its first character. No imports: schema.ts and the planning-data script both use this module.
 */

/** Every lesson prefix, one per subject island; the first three are the existing islands' (unchanged). */
export const LESSON_PREFIXES = ['F', 'D', 'A', 'PL', 'DB', 'CN', 'SA', 'MIS', 'AIF', 'ML', 'DL', 'LLM', 'GEN', 'AG', 'OPS',
  // Multi-archipelago v2 (P1b): the design and web regions.
  'UI', 'UX', 'IXD', 'DSY', 'WEB', 'FE', 'RWD', 'MOB'] as const;
export type LessonPrefix = typeof LESSON_PREFIXES[number];

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** 01..29 as a type (no island has more than 25 lessons); the parser also rejects 00. */
export type LessonNumber = `${0 | 1 | 2}${Digit}`;
/** A lesson ID of any island, complete or planned. */
export type AnyLessonId = `${LessonPrefix}${LessonNumber}`;

/** The whole ID must match: an anchored alternation backtracks, so DB01 is DB + 01, never D + B01. */
const LESSON_ID = new RegExp(`^(${LESSON_PREFIXES.join('|')})(\\d{2})$`);

export interface ParsedLessonId { prefix: LessonPrefix; number: number }

/** The prefix and number of a lesson ID, or undefined when it is not one (unknown prefix, wrong digits, 00). */
export function parseLessonId(id: string): ParsedLessonId | undefined {
  const match = LESSON_ID.exec(id);
  if (!match || match[2] === '00') return undefined;
  return { prefix: match[1] as LessonPrefix, number: Number(match[2]) };
}

export const isLessonId = (id: string): id is AnyLessonId => parseLessonId(id) !== undefined;

/** formatLessonId('DB', 1) === 'DB01'. */
export const formatLessonId = (prefix: LessonPrefix, number: number) => `${prefix}${String(number).padStart(2, '0')}` as AnyLessonId;
