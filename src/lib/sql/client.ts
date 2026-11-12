import type { DatasetId } from './datasets';
import { SQL_LIMITS, type CheckOutcome, type RunResult, type SqlCheckSpec, type SqlValue } from './engine';
import type { SqlRequest } from './worker';
import type { SequenceRun, SequenceStrategy } from './sequence';

/*
 * Phase F.1a: the page side of the SQL playground. One worker per playground (no state shared between playgrounds or
 * lessons), created on the first run. A run that takes longer than SQL_LIMITS.timeoutMs terminates the worker: the
 * query stops for sure, and the next run starts again from the dataset (the caller says so to the learner).
 */
export class TimeoutError extends Error {}
type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

export class SqlSession {
  private worker?: Worker;
  private next = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; timeoutMs: number }>();

  private start() {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; started?: true }>) => {
      const job = this.pending.get(event.data.id);
      if (!job) return;
      clearTimeout(job.timer);
      // F.1d: the worker has loaded SQLite and the dataset; the job now has exactly its own time limit.
      if (event.data.started) { job.timer = this.expire(job.timeoutMs); return; }
      this.pending.delete(event.data.id);
      job.resolve(event.data.result);
    };
    return worker;
  }

  private send<T>(body: Body<SqlRequest>, timeoutMs: number = SQL_LIMITS.timeoutMs): Promise<T> {
    // A new worker first loads and compiles SQLite; that time does not count against the query.
    const startup = this.worker ? 0 : SQL_LIMITS.startupMs;
    this.worker ??= this.start();
    const id = ++this.next, worker = this.worker;
    return new Promise<T>((resolve, reject) => {
      // Until the worker says the job has started, the timer also allows for loading SQLite (a new worker).
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer: this.expire(timeoutMs + startup), timeoutMs });
      worker.postMessage({ ...body, id });
    });
  }

  /** F.1d: `params` are bound to the statement's `?` placeholders (a parameterized query). */
  run(dataset: DatasetId, sql: string, params?: SqlValue[]) { return this.send<RunResult & { elapsedMs?: number }>({ type: 'run', dataset, sql, ...(params ? { params } : {}) }); }
  reset(dataset: DatasetId) { return this.send<{ ok: boolean }>({ type: 'reset', dataset }); }
  /** F.1d: one strategy's round trips (src/lib/sql/sequence.ts) on a fresh copy of the dataset. */
  sequence(dataset: DatasetId, strategy: SequenceStrategy) { return this.send<SequenceRun & { elapsedMs: number }>({ type: 'sequence', dataset, strategy }); }
  /** Each check runs the reference and the learner's SQL; allow the limit per check. */
  check(spec: SqlCheckSpec, sql: string) {
    // F.1d: parameter sets and the crash check run the SQL several times per check; allow for that.
    const runs = Math.max(1, spec.paramSets?.length ?? 0) + (spec.atomic ? 2 : 0);
    return this.send<CheckOutcome[]>({ type: 'check', spec, sql }, SQL_LIMITS.timeoutMs * spec.checks.length * runs);
  }

  /** The only reliable way to stop a running query: drop the worker and its database. */
  private expire(ms: number) { return setTimeout(() => this.dispose(new TimeoutError(`timeout after ${ms} ms`)), ms); }

  /** Stops the worker; anything still waiting fails with `reason`. */
  dispose(reason: Error = new Error('stopped')) {
    for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(reason); }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
