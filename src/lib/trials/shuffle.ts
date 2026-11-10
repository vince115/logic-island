/*
 * T.0: reproducible option order. A session keeps its seed, so the same session always shows the same order; options
 * marked fixed (e.g. 以上皆是) keep their written place.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `ids` in a seeded order; ids listed in `fixed` stay where they are. */
export function shuffleIds(ids: readonly string[], fixed: readonly string[], random: () => number): string[] {
  const free = ids.filter(id => !fixed.includes(id));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  let next = 0;
  return ids.map(id => fixed.includes(id) ? id : free[next++]);
}
