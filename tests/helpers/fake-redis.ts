import { HELD_SCRIPT, LIVE_SCRIPT, WRITE_SCRIPT, type RedisLike } from '@/lib/presence/redis-store';

/*
 * A stand-in for Redis that knows the presence store's three scripts and does, in JavaScript, exactly what their Lua
 * does to one hash and one sorted set. Each script runs whole (as a script does in Redis), but between a call and its
 * script the caller is made to wait a varying number of turns, so calls made at the same moment land in a shuffled
 * order: what several server instances would do to one database.
 *
 * It proves the store's own logic (the compare-and-set loop, the hints, the counting). That the Lua itself does the
 * same is checked against a real Redis in tests/presence-redis-store.test.ts when one is given.
 */
export class FakeRedis implements RedisLike {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly sets = new Map<string, Map<string, number>>();
  readonly ttl = new Map<string, number>();
  readonly calls: { script: string; keys: string[]; args: string[] }[] = [];
  private turn = 0;

  constructor(private readonly shuffle = true) {}

  private hash(key: string) { return this.hashes.get(key) ?? this.hashes.set(key, new Map()).get(key)!; }
  private set(key: string) { return this.sets.get(key) ?? this.sets.set(key, new Map()).get(key)!; }
  private clean(records: Map<string, string>, seen: Map<string, number>, cutoff: number) {
    const over = [...seen].filter(([, score]) => score < cutoff).sort((a, b) => a[1] - b[1]).slice(0, 1000).map(([sid]) => sid);
    for (const sid of over) { records.delete(sid); seen.delete(sid); }
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    this.calls.push({ script, keys, args });
    if (this.shuffle) for (let wait = (this.turn++ * 7) % 4; wait > 0; wait--) await Promise.resolve();
    const records = this.hash(keys[0]);
    if (script === HELD_SCRIPT) return records.size;
    const seen = this.set(keys[1]);
    if (script === WRITE_SCRIPT) {
      const [sid, expected, next, score, max, cutoff, keyTtl] = args, current = records.get(sid);
      if ((current ?? '') !== expected) return ['conflict', current ?? ''];
      if (current === undefined && seen.size >= Number(max)) {
        this.clean(records, seen, Number(cutoff));
        if (seen.size >= Number(max)) return ['full'];
      }
      records.set(sid, next); seen.set(sid, Number(score));
      this.ttl.set(keys[0], Number(keyTtl)); this.ttl.set(keys[1], Number(keyTtl));
      return ['ok'];
    }
    if (script === LIVE_SCRIPT) {
      const cutoff = Number(args[0]);
      this.clean(records, seen, cutoff);
      return [...seen].filter(([, score]) => score >= cutoff).sort((a, b) => a[1] - b[1]).flatMap(([sid]) => { const record = records.get(sid); return record === undefined ? [] : [record]; });
    }
    throw new Error('FakeRedis: unknown script');
  }
}
