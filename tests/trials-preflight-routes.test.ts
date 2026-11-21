import { describe, expect, it } from 'vitest';
import { ALLOWED_HANDLERS, PRESENCE_HANDLER, PRESENCE_SNAPSHOT_KEYS, presenceAnswerProblems, routeCheck, type HandlerPolicy } from '@/lib/trials/preflight';
import { publicSnapshot, aggregate } from '@/lib/presence/engine';
import { PRESENCE } from '@/lib/presence/config';

/*
 * The release preflight's route rule and its one exception (src/lib/trials/preflight.ts, docs/exam-system/22 §2):
 * a build holds no route handler (API) at all, except the presence API in a build declared a presence build, whose
 * files hold no unpublished content. These tests are the regression net for the rule itself: every other handler,
 * and the presence handler under any other condition, must keep failing.
 */

const ROUTES = ['/', '/trials', '/trials/review', '/trials/demo-exam', '/trials/demo-exam/paper-1', '/curriculum/intro'];
const ALLOWED = new Set(['/trials', '/trials/review', '/trials/demo-exam', '/trials/demo-exam/paper-1']);
const NEEDLES = ['Q-SECRET-0001', 'trials-ledger', 'unpublished-stem-text'];
const CLEAN = [{ path: 'server/app/api/presence/route.js', text: 'module.exports = handler' }, { path: 'server/chunks/presence.js', text: 'function aggregate(records) { return counts }' }];
const presenceBuild = (sources: HandlerPolicy['sources'] = { [PRESENCE_HANDLER]: CLEAN }): HandlerPolicy => ({ presence: true, sources });
const run = (handlers: string[] | undefined, policy?: HandlerPolicy) => routeCheck(ROUTES, handlers, ALLOWED, NEEDLES, policy);

describe('the rule: a build holds no route handler', () => {
  it('passes a build with none, with or without the presence declaration', () => {
    expect(run([]).status).toBe('pass');
    expect(run(undefined).status).toBe('pass');
    expect(run([], presenceBuild()).status).toBe('pass');
    expect(run([], { presence: true }).status).toBe('pass');
  });

  it('fails every handler in a default build, the presence handler included', () => {
    for (const handler of [PRESENCE_HANDLER, '/api/trials/route', '/api/route', '/trials/api/route', '/api/health/route']) {
      const result = run([handler]);
      expect(result.status, handler).toBe('fail');
      expect(result.details.some(d => d.startsWith(`${handler}: a route handler (API) is built`)), handler).toBe(true);
    }
    // The handler's files being clean does not allow it: the build has to be a presence build.
    expect(run([PRESENCE_HANDLER], { sources: { [PRESENCE_HANDLER]: CLEAN } }).status).toBe('fail');
    expect(run([PRESENCE_HANDLER], { presence: false, sources: { [PRESENCE_HANDLER]: CLEAN } }).status).toBe('fail');
    // Nothing but `true` declares one.
    for (const presence of [1, 'true', '1', {}, []] as unknown[]) expect(run([PRESENCE_HANDLER], { presence: presence as boolean, sources: { [PRESENCE_HANDLER]: CLEAN } }).status).toBe('fail');
  });

  it('keeps the trial route rules as they were', () => {
    expect(routeCheck(undefined, [], ALLOWED, NEEDLES).status).toBe('skip');
    expect(routeCheck([...ROUTES, '/trials/hidden-exam'], [], ALLOWED, NEEDLES, presenceBuild()).status).toBe('fail');
    expect(routeCheck([...ROUTES, '/curriculum/Q-SECRET-0001'], [], ALLOWED, NEEDLES, presenceBuild()).status).toBe('fail');
    // The presence exception never excuses a trial route problem.
    const both = routeCheck([...ROUTES, '/trials/hidden-exam'], [PRESENCE_HANDLER], ALLOWED, NEEDLES, presenceBuild());
    expect(both.status).toBe('fail');
    expect(both.details.some(d => d.startsWith('/trials/hidden-exam'))).toBe(true);
  });
});

describe('the exception: the presence API, in a presence build, with clean files', () => {
  it('is one exact handler', () => {
    expect(ALLOWED_HANDLERS).toEqual(['/api/presence/route']);
    expect(PRESENCE_HANDLER).toBe(`${PRESENCE.endpoint}/route`);
  });

  it('passes exactly that handler and says so', () => {
    const result = run([PRESENCE_HANDLER], presenceBuild());
    expect(result.status).toBe('pass');
    expect(result.details.some(d => d.includes('the presence API, the one handler a presence build may have'))).toBe(true);
  });

  it('still fails every other handler in a presence build', () => {
    const others = [
      '/api/trials/route', '/api/trials/[exam]/route', '/api/route', '/api/health/route', '/trials/api/route', '/api/admin/route',
      // Beside, under and around the presence API: an exact match is the only match.
      '/api/presence/sessions/route', '/api/presence/[id]/route', '/api/presence/[...all]/route', '/api/presence/route/route', '/api/presence-admin/route',
      '/api/presence2/route', '/API/presence/route', '/api/Presence/route', '/api/presence/route/', ' /api/presence/route', '/api/presence/route ', '/api//presence/route',
      '/v2/api/presence/route', '/api/presence/../trials/route', '/api/presence/route?x=1', '/(group)/api/presence/route',
    ];
    for (const handler of others) {
      const alone = run([handler], presenceBuild({ [PRESENCE_HANDLER]: CLEAN, [handler]: CLEAN }));
      expect(alone.status, handler).toBe('fail');
      expect(alone.details, handler).toContain(`${handler}: a route handler (API) is built`);
      // Next to the presence handler it fails all the same, and the failure names it.
      const beside = run([PRESENCE_HANDLER, handler], presenceBuild({ [PRESENCE_HANDLER]: CLEAN, [handler]: CLEAN }));
      expect(beside.status, handler).toBe('fail');
      expect(beside.details.filter(d => d.includes('a route handler (API) is built')), handler).toEqual([`${handler}: a route handler (API) is built`]);
    }
  });

  it('fails the presence handler when its files hold unpublished content', () => {
    for (const needle of NEEDLES) {
      const leaking = [...CLEAN, { path: 'server/chunks/bank.js', text: `const stem = "${needle} and more"` }];
      const result = run([PRESENCE_HANDLER], presenceBuild({ [PRESENCE_HANDLER]: leaking }));
      expect(result.status, needle).toBe('fail');
      expect(result.details, needle).toContain(`${PRESENCE_HANDLER}: server/chunks/bank.js holds "${needle}"`);
      expect(result.details.some(d => d.includes('the one handler a presence build may have'))).toBe(false);
    }
  });

  it('fails closed when the presence handler\'s files were not given', () => {
    for (const sources of [undefined, {}, { [PRESENCE_HANDLER]: [] }, { '/api/other/route': CLEAN }] as HandlerPolicy['sources'][]) {
      const result = run([PRESENCE_HANDLER], { presence: true, sources });
      expect(result.status).toBe('fail');
      expect(result.details).toContain(`${PRESENCE_HANDLER}: its files were not given, so what it can serve is not shown`);
    }
  });
});

describe('the probe: what a presence API may answer', () => {
  it('accepts the public snapshot the engine publishes', () => {
    const snapshot = publicSnapshot(aggregate([], 1), 1);
    expect(Object.keys(snapshot).sort()).toEqual([...PRESENCE_SNAPSHOT_KEYS].sort());
    expect(presenceAnswerProblems(JSON.stringify(snapshot), NEEDLES)).toEqual([]);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, islands: { foundations: 3 }, total: 3 }), NEEDLES)).toEqual([]);
  });

  it('refuses anything else: other keys, text, lists, content of the bank', () => {
    const snapshot = publicSnapshot(aggregate([], 1), 1);
    expect(presenceAnswerProblems('<html>', NEEDLES)).toEqual(['answer is not JSON']);
    expect(presenceAnswerProblems('[1,2]', NEEDLES)).toEqual(['answer is not an object']);
    expect(presenceAnswerProblems('null', NEEDLES)).toEqual(['answer is not an object']);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, sessions: [] }), NEEDLES)).toEqual(['answer has an unknown key "sessions"']);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, courses: { F01: 1 } }), NEEDLES)).toEqual(['answer has an unknown key "courses"']);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, islands: { foundations: 'Q-SECRET-0001' } }), NEEDLES)).toEqual(['response holds "Q-SECRET-0001"', '"islands" is not a number or a record of numbers']);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, regions: [1, 2] }), NEEDLES)).toEqual(['"regions" is not a number or a record of numbers']);
    expect(presenceAnswerProblems(JSON.stringify({ ...snapshot, total: 'many' }), NEEDLES)).toEqual(['"total" is not a number or a record of numbers']);
  });
});
