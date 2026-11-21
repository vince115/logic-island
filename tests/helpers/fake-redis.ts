import { SWEEP_SCRIPT, WRITE_SCRIPT, type RedisLike } from '@/lib/presence/redis-store';

/*
 * A stand-in for Redis that knows the presence store's two scripts and its three plain commands, and does, in
 * JavaScript, exactly what they do to one hash. Each call runs whole (as a command or a script does in Redis), but
 * between a call and its effect the caller is made to wait a varying number of turns, so calls made at the same moment
 * land in a shuffled order: what several server instances would do to one database.
 *
 * It also keeps the bill the way Upstash does (P6-C): one for a plain command, and for a script one plus one for every
 * command the script runs (`billed`, and each call's own `cost`).
 *
 * It proves the store's own logic (the compare-and-set loop, the hints, the counting). That the Lua itself does the
 * same, and runs the same number of commands, is checked against a real Redis in tests/presence-redis-store.test.ts
 * when one is given.
 */
export interface FakeCall { script?: string; command?: string; keys: string[]; args: string[]; cost: number }

export class FakeRedis implements RedisLike {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly ttl = new Map<string, number>();
  readonly calls: FakeCall[] = [];
  billed = 0;
  /** How often a write renewed the key's lifetime (PEXPIRE). */
  renewals = 0;
  private turn = 0;

  constructor(private readonly shuffle = true) {}

  private hash(key: string) { return this.hashes.get(key) ?? this.hashes.set(key, new Map()).get(key)!; }
  private async wait() { if (this.shuffle) for (let wait = (this.turn++ * 7) % 4; wait > 0; wait--) await Promise.resolve(); }
  private record(call: Omit<FakeCall, 'cost'>, cost: number) { this.calls.push({ ...call, cost }); this.billed += cost; }
  /** The scripts' sweep: HGETALL, then HDEL when anything is over. Returns what it removed and what it cost. */
  private sweep(records: Map<string, string>, cutoff: number) {
    const over = [...records].filter(([field, value]) => { const seen = /^(-?\d+):/.exec(value); return !field.startsWith('~') && (!seen || Number(seen[1]) < cutoff); }).slice(0, 1000).map(([sid]) => sid);
    for (const sid of over) records.delete(sid);
    return { removed: over.length, cost: over.length ? 2 : 1 };
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    await this.wait();
    const records = this.hash(keys[0]);
    if (script === WRITE_SCRIPT) {
      const [sid, expected, next, max, cutoff, keyTtl, nowText, sweepEvery] = args, current = records.get(sid), now = Number(nowText);
      let cost = 2; // EVAL + HMGET
      const done = (reply: unknown) => { this.record({ script, keys, args }, cost); return reply; };
      if ((current ?? '') !== expected) return done(['conflict', current ?? '']);
      const time = (field: string) => { const value = records.get(field); return value === undefined ? undefined : Number(value); };
      const swept = time('~swept'), renewed = time('~renewed');
      let sweep = swept === undefined || now < swept || now - swept >= Number(sweepEvery);
      const renew = renewed === undefined || now < renewed || now - renewed >= Number(keyTtl) / 4;
      let held: number | undefined;
      if (current === undefined) { held = records.size - 2; cost += 1; } // HLEN
      if (sweep || (held !== undefined && held >= Number(max))) {
        const { removed, cost: sweepCost } = this.sweep(records, Number(cutoff));
        cost += sweepCost;
        if (held !== undefined) held -= removed;
        sweep = true;
      }
      if (held !== undefined && held >= Number(max)) return done(['full']);
      records.set(sid, next); cost += 1; // HSET, the hash's own fields with it
      if (sweep) records.set('~swept', nowText);
      if (renew) { records.set('~renewed', nowText); this.ttl.set(keys[0], Number(keyTtl)); this.renewals += 1; cost += 1; } // PEXPIRE
      return done(['ok']);
    }
    if (script === SWEEP_SCRIPT) {
      const { removed, cost } = this.sweep(records, Number(args[0]));
      this.record({ script, keys, args }, 1 + cost);
      return removed;
    }
    throw new Error('FakeRedis: unknown script');
  }

  async command(...parts: string[]): Promise<unknown> {
    await this.wait();
    const [command, key, ...args] = parts, records = this.hash(key);
    this.record({ command, keys: [key], args }, 1);
    if (command === 'HGET') return records.get(args[0]) ?? null;
    if (command === 'HGETALL') return [...records].flat();
    if (command === 'HLEN') return records.size;
    throw new Error(`FakeRedis: unknown command ${command}`);
  }
}
