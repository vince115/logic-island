/*
 * LLM-0 (docs/curriculum/LLM0_LANGUAGE_MODEL_CAPABILITY.md §3.3): the one source of randomness of the language-model
 * explorers. Every random number a lesson page shows comes from this generator and a seed the lesson (or the learner)
 * gives, so the server render, the browser and the tests draw the same numbers: nothing calls Math.random.
 *
 * Algorithm: Mulberry32 (Tommy Ettinger, public domain), a 32-bit generator with one 32-bit state word. With `a` the
 * state (initially the seed as an unsigned 32-bit integer), each draw is
 *
 *   a = (a + 0x6D2B79F5) mod 2^32
 *   t = imul(a ^ (a >>> 15), a | 1)
 *   t = t ^ (t + imul(t ^ (t >>> 7), t | 61))
 *   u = ((t ^ (t >>> 14)) >>> 0) / 2^32          (a number in [0, 1))
 *
 * where imul is 32-bit integer multiplication (Math.imul) and every operation is on 32-bit integers. The same seed gives
 * the same sequence in every JavaScript engine (only integer operations and one exact division), and a lesson can
 * reproduce it in Python with `& 0xFFFFFFFF` after each step.
 */

/** Seeds are unsigned 32-bit integers (0 … 4294967295). */
export const MAX_SEED = 0xFFFFFFFF;
export const isSeed = (seed: number) => Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;

/** A Mulberry32 generator: each call returns the next number in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first `count` numbers of the sequence for `seed`. */
export function draws(seed: number, count: number): number[] {
  const next = mulberry32(seed);
  return Array.from({ length: count }, () => next());
}
