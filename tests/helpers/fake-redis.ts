import { SWEEP_SCRIPT, WRITE_SCRIPT, type RedisLike } from '@/lib/presence/redis-store';

/*
 * A stand-in for Redis that knows the presence store's two scripts and its plain commands, and does, in JavaScript,
 * exactly what they do to one hash. Each call runs whole (as a command or a script does in Redis), but between a call
 * and its effect the caller is made to wait a varying number of turns, so calls made at the same moment land in a
 * shuffled order: what several server instances would do to one database.
 *
 * It also keeps the bill the way Upstash does (P6-C): one for a plain command, and for a script one plus one for every
 * command the script runs (`billed`, and each call's own `cost`).
 *
 * It proves the store's own logic (the compare-and-set loop, the pulses, the hints, the counting). That the Lua itself
 * does the same, and runs the same number of commands, is checked against a real Redis in
 * tests/presence-redis-store.test.ts when one is given.
 */
export interface FakeCall { script?: string; command?: string; keys: string[]; args: string[]; cost: number }

const time = (value: string | undefined) => { const match = value === undefined ? null : /^(-?\d+):/.exec(value); return match ? Number(match[1]) : undefined; };

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
  /**
   * The scripts' sweep: HGETALL, then HDEL when anything is over. A session is over when neither its record nor its
   * pulse (`+<id>`) is as late as the cutoff; a value with no time is no record; a pulse with no record goes when it
   * is old or empty. Returns the fields it removed, the records it left, and what it cost.
   */
  private sweep(fields: Map<string, string>, cutoff: number) {
    const over: string[] = [];
    let sessions = 0, gone = 0;
    for (const [field, value] of fields) {
      if (field.startsWith('~') || field.startsWith('+')) continue;
      const pulse = fields.get(`+${field}`), pulsed = time(pulse);
      let seen = time(value);
      if (seen !== undefined && pulsed !== undefined && pulsed > seen) seen = pulsed;
      if ((seen === undefined || seen < cutoff) && gone < 1000) { gone += 1; over.push(field); if (pulse !== undefined) over.push(`+${field}`); } else sessions += 1;
    }
    for (const [field, value] of fields) {
      if (!field.startsWith('+') || fields.has(field.slice(1))) continue;
      const pulsed = time(value);
      if ((pulsed === undefined || pulsed < cutoff) && over.length < 2000) over.push(field);
    }
    for (const field of over) fields.delete(field);
    return { removed: over.length, sessions, cost: over.length ? 2 : 1 };
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    await this.wait();
    const fields = this.hash(keys[0]);
    if (script === WRITE_SCRIPT) {
      const [sid, expected, next, max, cutoff, keyTtl, nowText, sweepEvery, expectedPulse] = args, current = fields.get(sid), pulse = fields.get(`+${sid}`), now = Number(nowText);
      let cost = 2; // EVAL + HMGET
      const done = (reply: unknown) => { this.record({ script, keys, args }, cost); return reply; };
      if ((current ?? '') !== expected || (pulse ?? '') !== expectedPulse) return done(['conflict', current ?? '', pulse ?? '']);
      const at = (field: string) => { const value = fields.get(field); return value === undefined ? undefined : Number(value); };
      const swept = at('~swept'), renewed = at('~renewed');
      let sweep = swept === undefined || now < swept || now - swept >= Number(sweepEvery);
      const renew = renewed === undefined || now < renewed || now - renewed >= Number(keyTtl) / 4;
      let room = true;
      if (current === undefined) { room = fields.size - 2 < Number(max); cost += 1; } // HLEN
      if (sweep || !room) {
        const { sessions, cost: sweepCost } = this.sweep(fields, Number(cutoff));
        cost += sweepCost;
        if (current === undefined && sessions >= Number(max)) return done(['full']);
        sweep = true;
      }
      fields.set(sid, next); cost += 1; // HSET, the pulse it took in and the hash's own fields with it
      if (pulse) fields.set(`+${sid}`, '');
      if (sweep) fields.set('~swept', nowText);
      if (renew) { fields.set('~renewed', nowText); this.ttl.set(keys[0], Number(keyTtl)); this.renewals += 1; cost += 1; } // PEXPIRE
      return done(['ok']);
    }
    if (script === SWEEP_SCRIPT) {
      const { removed, cost } = this.sweep(fields, Number(args[0]));
      this.record({ script, keys, args }, 1 + cost);
      return removed;
    }
    throw new Error('FakeRedis: unknown script');
  }

  async command(...parts: string[]): Promise<unknown> {
    await this.wait();
    const [command, key, ...args] = parts, fields = this.hash(key);
    this.record({ command, keys: [key], args }, 1);
    if (command === 'HMGET') return args.map(field => fields.get(field) ?? null);
    if (command === 'HSET') { let added = 0; for (let i = 0; i < args.length; i += 2) { if (!fields.has(args[i])) added += 1; fields.set(args[i], args[i + 1]); } return added; }
    if (command === 'HGETALL') return [...fields].flat();
    if (command === 'HLEN') return fields.size;
    throw new Error(`FakeRedis: unknown command ${command}`);
  }
}
