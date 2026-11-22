import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';

/*
 * P7: a rehearsal of the Vercel Preview on this machine, for everything that needs several server instances and one
 * shared store but not the real ones. It starts, and stops again when it is told to (SIGINT/SIGTERM):
 *
 *   a `redis-server` of its own                                   (REDIS_PORT, default 6393; nothing is saved to disk)
 *   a stand-in for the Upstash REST API in front of it, on https  (STORE_PORT, default 3160)
 *   INSTANCES `next start` processes of the build in ROOT         (INSTANCE_PORT.., default 3161..; default 3)
 *   one address that hands each request to the next instance      (PORT, default 3156)
 *   a control address                                             (CONTROL_PORT, default 3159)
 *
 *   ROOT=<a copy of the repo with node_modules and a presence build in .next> WORK=<an empty scratch directory> \
 *     node local-preview-stack.mjs
 *
 * The build must have been made with LOGIC_ISLAND_PRESENCE=1 (and LOGIC_ISLAND_POPULATION_NPC=live for the figures).
 * Every instance gets the store's address and a token as the Marketplace integration would set them
 * (KV_REST_API_URL / KV_REST_API_TOKEN), VERCEL_ENV=preview and a session secret. The token and the secret are made
 * up at start, live in this process's memory only and are never printed. The store's address must be https (the
 * application refuses anything else), so a certificate for 127.0.0.1 is made in WORK with `openssl` and given to the
 * instances as an extra authority (NODE_EXTRA_CA_CERTS); nothing in the system's trust store changes.
 *
 * Control (GET, on CONTROL_PORT):
 *   /mode/up      the store answers
 *   /mode/down    the store drops every connection
 *   /mode/slow    the store answers after SLOW_MS (default 6000: longer than the application waits)
 *   /mode/refuse  the store answers 500
 *   /mode/quota   the store answers as Upstash does when a plan's commands are used up
 *   /stats        what was asked of the store, per command, what Redis executed, and each instance's share of requests
 *   /reset        forgets the counters (not the data)
 *
 * What it is not: Vercel's CDN, its Firewall, its regions or Upstash itself. It answers the Upstash REST protocol for
 * the commands this application sends, by passing them to a real Redis.
 */
const ROOT = process.env.ROOT, WORK = process.env.WORK;
if (!ROOT || !WORK || !existsSync(join(ROOT, '.next'))) { console.error('usage: ROOT=<repo copy with a build> WORK=<scratch dir> node local-preview-stack.mjs'); process.exit(2); }
const number = (name, fallback) => Number(process.env[name] ?? fallback);
const PORT = number('PORT', 3156), CONTROL_PORT = number('CONTROL_PORT', 3159), STORE_PORT = number('STORE_PORT', 3160);
const REDIS_PORT = number('REDIS_PORT', 6393), INSTANCES = number('INSTANCES', 3), INSTANCE_PORT = number('INSTANCE_PORT', 3161);
const SLOW_MS = number('SLOW_MS', 6000), LATENCY_MS = number('LATENCY_MS', 0);
const HOST = '127.0.0.1';
const token = randomBytes(24).toString('hex'), secret = randomBytes(48).toString('base64');
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---- the certificate ------------------------------------------------------------------------------------------
mkdirSync(WORK, { recursive: true });
const keyFile = join(WORK, 'store-key.pem'), certFile = join(WORK, 'store-cert.pem');
if (!existsSync(keyFile) || !existsSync(certFile)) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' });
}

// ---- Redis, and a client that speaks its protocol -------------------------------------------------------------
children.push(spawn('redis-server', ['--port', String(REDIS_PORT), '--bind', HOST, '--save', '', '--appendonly', 'no', '--dir', WORK], { stdio: 'ignore' }));
function redisClient() {
  const socket = net.connect(REDIS_PORT, HOST), waiting = [];
  let buffer = Buffer.alloc(0);
  /** One reply at `at`, or undefined when the buffer does not hold all of it yet. */
  const parse = at => {
    const end = buffer.indexOf('\r\n', at);
    if (end < 0) return undefined;
    const kind = String.fromCharCode(buffer[at]), line = buffer.toString('utf8', at + 1, end), next = end + 2;
    if (kind === '+') return { value: line, next };
    if (kind === '-') return { value: new Error(line), next };
    if (kind === ':') return { value: Number(line), next };
    if (kind === '$') {
      const length = Number(line);
      if (length < 0) return { value: null, next };
      if (buffer.length < next + length + 2) return undefined;
      return { value: buffer.toString('utf8', next, next + length), next: next + length + 2 };
    }
    if (kind === '*') {
      const count = Number(line), items = [];
      if (count < 0) return { value: null, next };
      let cursor = next;
      for (let i = 0; i < count; i += 1) { const item = parse(cursor); if (!item) return undefined; items.push(item.value); cursor = item.next; }
      return { value: items, next: cursor };
    }
    throw new Error(`unexpected reply type ${kind}`);
  };
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const reply = parse(0);
      if (!reply) return;
      buffer = buffer.subarray(reply.next);
      waiting.shift()?.(reply.value);
    }
  });
  socket.on('error', () => {});
  return parts => new Promise(resolve => {
    waiting.push(resolve);
    socket.write(`*${parts.length}\r\n${parts.map(part => { const text = String(part); return `$${Buffer.byteLength(text)}\r\n${text}\r\n`; }).join('')}`);
  });
}
for (let i = 0; i < 50; i += 1) {
  const up = await new Promise(resolve => { const probe = net.connect(REDIS_PORT, HOST, () => { probe.destroy(); resolve(true); }); probe.on('error', () => resolve(false)); });
  if (up) break;
  await sleep(100);
}
const redis = redisClient();
await redis(['FLUSHALL']);
await redis(['CONFIG', 'RESETSTAT']);

// ---- the stand-in for the Upstash REST API --------------------------------------------------------------------
let mode = 'up';
const counters = { requests: 0, refusedToken: 0, commands: {}, byMode: {} };
const send = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (request, response) => {
  counters.requests += 1;
  counters.byMode[mode] = (counters.byMode[mode] ?? 0) + 1;
  if (mode === 'down') { request.socket.destroy(); return; }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', async () => {
    if (request.headers.authorization !== `Bearer ${token}`) { counters.refusedToken += 1; return send(response, 401, { error: 'Unauthorized' }); }
    if (mode === 'refuse') return send(response, 500, { error: 'Internal Server Error' });
    if (mode === 'quota') return send(response, 400, { error: 'ERR max requests limit exceeded. Limit: 500000, Usage: 500000.' });
    let command;
    try { command = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(response, 400, { error: 'ERR failed to parse command' }); }
    if (!Array.isArray(command) || !command.length) return send(response, 400, { error: 'ERR empty command' });
    const name = String(command[0]).toUpperCase();
    counters.commands[name] = (counters.commands[name] ?? 0) + 1;
    if (mode === 'slow') await sleep(SLOW_MS);
    else if (LATENCY_MS) await sleep(LATENCY_MS);
    const reply = await redis(command);
    if (reply instanceof Error) return send(response, 400, { error: reply.message });
    return send(response, 200, { result: reply });
  });
}).listen(STORE_PORT, HOST);

// ---- the instances --------------------------------------------------------------------------------------------
const instanceEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(LOGIC_ISLAND_|KV_|UPSTASH_|VERCEL)/.test(name))),
  LOGIC_ISLAND_PRESENCE: '1', LOGIC_ISLAND_POPULATION_NPC: process.env.NPC ?? 'live', LOGIC_ISLAND_PRESENCE_SECRET: secret,
  ...(process.env.REGIONAL_WORLD === '1' ? { LOGIC_ISLAND_REGIONAL_WORLD: '1' } : {}),
  KV_REST_API_URL: `https://${HOST}:${STORE_PORT}`, KV_REST_API_TOKEN: token, VERCEL_ENV: 'preview', NODE_EXTRA_CA_CERTS: certFile };
const ports = Array.from({ length: INSTANCES }, (_, index) => INSTANCE_PORT + index);
for (const port of ports) {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '--hostname', HOST, '--port', String(port)], { cwd: ROOT, env: instanceEnv, stdio: 'ignore' });
  child.on('exit', () => { if (!closing) { console.error(`instance on ${port} stopped`); stop(1); } });
  children.push(child);
}
const answers = port => new Promise(resolve => { const request = http.get({ host: HOST, port, path: '/api/presence' }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', () => resolve(0)); });
for (const port of ports) {
  let status = 0;
  for (let i = 0; i < 60 && !status; i += 1) { status = await answers(port); if (!status) await sleep(500); }
  if (status !== 200) { console.error(`instance on ${port} answers ${status} at /api/presence`); stop(1); await sleep(1000); }
}

// ---- one address in front of them -----------------------------------------------------------------------------
let turn = 0;
const shares = ports.map(() => 0);
http.createServer((request, response) => {
  const index = turn++ % ports.length;
  shares[index] += 1;
  const upstream = http.request({ host: HOST, port: ports[index], method: request.method, path: request.url, headers: request.headers }, answer => {
    response.writeHead(answer.statusCode ?? 502, { ...answer.headers, 'x-rehearsal-instance': String(index) });
    answer.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.pipe(upstream);
}).listen(PORT, HOST);

// ---- control --------------------------------------------------------------------------------------------------
http.createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://x').pathname;
  const picked = /^\/mode\/(up|down|slow|refuse|quota)$/.exec(path)?.[1];
  if (picked) { mode = picked; return send(response, 200, { mode }); }
  if (path === '/reset') { counters.requests = 0; counters.refusedToken = 0; counters.commands = {}; counters.byMode = {}; shares.fill(0); await redis(['CONFIG', 'RESETSTAT']); return send(response, 200, { reset: true }); }
  if (path === '/stats') {
    const info = String(await redis(['INFO', 'commandstats'])), executed = {};
    for (const [, name, calls] of info.matchAll(/cmdstat_([a-z|]+):calls=(\d+)/g)) if (!['info', 'config|resetstat', 'flushall'].includes(name)) executed[name] = Number(calls);
    // What Upstash would bill: every command Redis executed, the script's own calls included.
    const billed = Object.values(executed).reduce((sum, calls) => sum + calls, 0);
    const keys = await redis(['KEYS', '*']);
    return send(response, 200, { mode, store: counters, executed, billed, keys, instanceShares: shares });
  }
  return send(response, 404, { error: 'not-found' });
}).listen(CONTROL_PORT, HOST);

console.log(`READY base http://${HOST}:${PORT} control http://${HOST}:${CONTROL_PORT} instances ${ports.join(',')} store https://${HOST}:${STORE_PORT} redis ${REDIS_PORT}`);
