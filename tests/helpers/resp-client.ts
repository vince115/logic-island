import { connect, type Socket } from 'node:net';
import type { RedisLike } from '@/lib/presence/redis-store';

/*
 * The smallest Redis client that can run the presence store's scripts against a real server: RESP2 over one socket,
 * commands answered in order. For tests only (a local redis-server); the site itself talks to its store over HTTPS.
 */
type Reply = string | number | null | Reply[];
const CRLF = '\r\n';

export class RespClient implements RedisLike {
  private buffer = Buffer.alloc(0);
  private readonly waiting: { resolve: (reply: Reply) => void; reject: (error: Error) => void }[] = [];
  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    socket.on('error', error => { for (const w of this.waiting.splice(0)) w.reject(error); });
  }

  static open(url: string): Promise<RespClient> {
    const { hostname, port } = new URL(url);
    return new Promise((resolve, reject) => {
      const socket = connect({ host: hostname, port: Number(port || 6379) });
      socket.once('connect', () => resolve(new RespClient(socket)));
      socket.once('error', reject);
    });
  }

  /** One reply from `at`, or undefined when the buffer does not hold all of it yet. */
  private read(at: number): { reply: Reply | Error; next: number } | undefined {
    const end = this.buffer.indexOf(CRLF, at);
    if (end < 0) return undefined;
    const kind = String.fromCharCode(this.buffer[at]), line = this.buffer.toString('utf8', at + 1, end), next = end + 2;
    if (kind === '+') return { reply: line, next };
    if (kind === '-') return { reply: new Error(line), next };
    if (kind === ':') return { reply: Number(line), next };
    if (kind === '$') {
      const length = Number(line);
      if (length < 0) return { reply: null, next };
      if (this.buffer.length < next + length + 2) return undefined;
      return { reply: this.buffer.toString('utf8', next, next + length), next: next + length + 2 };
    }
    if (kind === '*') {
      const count = Number(line), list: Reply[] = [];
      let cursor = next;
      for (let i = 0; i < count; i++) {
        const item = this.read(cursor);
        if (!item) return undefined;
        if (item.reply instanceof Error) return { reply: item.reply, next: item.next };
        list.push(item.reply); cursor = item.next;
      }
      return { reply: count < 0 ? null : list, next: cursor };
    }
    return { reply: new Error(`unexpected reply type ${kind}`), next };
  }

  private drain() {
    for (let item = this.read(0); item && this.waiting.length; item = this.read(0)) {
      this.buffer = this.buffer.subarray(item.next);
      const waiter = this.waiting.shift()!;
      if (item.reply instanceof Error) waiter.reject(item.reply); else waiter.resolve(item.reply);
    }
  }

  command(...parts: (string | number)[]): Promise<Reply> {
    const frames = parts.map(part => { const text = String(part); return ['$' + Buffer.byteLength(text), text, ''].join(CRLF); }).join('');
    return new Promise((resolve, reject) => { this.waiting.push({ resolve, reject }); this.socket.write(['*' + parts.length, ''].join(CRLF) + frames); });
  }

  eval(script: string, keys: string[], args: string[]): Promise<unknown> { return this.command('EVAL', script, keys.length, ...keys, ...args); }
  close() { this.socket.destroy(); }
}
