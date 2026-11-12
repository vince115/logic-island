import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Shared Trial System T.3I (docs/exam-system/33 §4, §12): the CI workflow's supply chain and permissions, read as text.
// This checks the file in the repository; it says nothing about a run on GitHub.
const ROOT = path.join(__dirname, '..');
const workflow = readFileSync(path.join(ROOT, '.github/workflows/trials-ci.yml'), 'utf8');
const pins = readFileSync(path.join(ROOT, 'docs/exam-system/governance/ACTION_PINS.md'), 'utf8');
const lines = workflow.split('\n');
const uses = lines.flatMap(l => { const m = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(l); return m ? [{ ref: m[1], comment: m[2].trim() }] : []; });
const table = new Map(pins.split('\n').flatMap(l => { const m = /^\| `([^`]+)` \| `@v\d+` \| `(v[\d.]+)` \| `([0-9a-f]{40})` \|$/.exec(l); return m ? [[m[1], { tag: m[2], sha: m[3] }] as const] : []; }));

describe('every action is pinned to a full commit SHA', () => {
  it('no floating tag or branch: owner/repo@<40 hex> with the version tag in a comment', () => {
    expect(uses.length).toBeGreaterThanOrEqual(5);
    for (const u of uses) {
      expect(u.ref, u.ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(u.comment, u.ref).toMatch(/^# v\d+\.\d+\.\d+/);
    }
  });
  it('each pin is the one ACTION_PINS.md records, with the same tag', () => {
    expect(table.size).toBe(new Set(uses.map(u => u.ref.split('@')[0])).size);
    for (const u of uses) {
      const [repo, sha] = u.ref.split('@'), row = table.get(repo);
      expect(row, repo).toBeDefined();
      expect([sha, u.comment.slice(2).split(/[;\s]/)[0]], repo).toEqual([row!.sha, row!.tag]);
    }
  });
  it('the check rejects what it should (floating tags, short SHAs, branches)', () => {
    const pinned = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;
    for (const bad of ['actions/checkout@v4', 'actions/checkout@main', 'actions/checkout@11d5960', 'actions/checkout@v4.4.0', 'docker://alpine:3']) expect(pinned.test(bad), bad).toBe(false);
  });
});

describe('least privilege', () => {
  it('read-only contents for the whole workflow, no job asks for more, no write scope anywhere', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    expect(workflow.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).not.toMatch(/write-all|read-all/);
  });
  it('no pull_request_target or workflow_run trigger; checkout keeps no credentials', () => {
    const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
    expect(on).not.toMatch(/pull_request_target|workflow_run|issue_comment/);
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n(?: {10}.*\n)*? {10}persist-credentials: false/);
  });
  it('no secret and no token is handed to a step; event data reaches the shell only through env', () => {
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/GITHUB_TOKEN|github\.token/);
    // Every ${{ github.event… }} sits in an env: block, never inside a run: script.
    for (const [i, l] of lines.entries()) if (/\$\{\{\s*github\.event\.(?!name)/.test(l)) expect(lines[i - 1].trim() === 'env:' || /^ {10}[A-Z_]+: /.test(l), l).toBe(true);
    for (const r of lines.filter(l => /^\s+run:/.test(l))) expect(r, r).not.toMatch(/\$\{\{\s*github\.event/);
  });
  it('the base step gates the comparisons: no base copy is optional outside the declared bootstrap', () => {
    expect(workflow).toContain('if: steps.base.outputs.mode == \'bootstrap\'');
    expect(workflow).toContain('if [ "$MODE" != compare ] || [ -z "$BASE_MANIFEST" ] || [ -z "$BASE_PAPERS" ]; then echo "no base copies (mode $MODE)"; exit 1; fi');
    expect(workflow).toContain('if [ "$MODE" != compare ] || [ -z "$BASE_LEDGER" ]; then echo "no base ledger (mode $MODE)"; exit 1; fi');
    expect(workflow).not.toContain('compared without one');
  });
  it('artifacts are the JSON reports only, kept 14 days, and nothing in the workflow publishes, approves or pushes', () => {
    expect(workflow.match(/retention-days: 14/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/trials:(review|publish|revoke|import)|git push|git commit|--confirm/);
    const paths = [...workflow.matchAll(/path: \|\n((?: {12}.+\n)+)/g)].flatMap(m => m[1].trim().split('\n').map(s => s.trim()));
    expect(paths.every(p => /^[\w*.-]+\.json$/.test(p)), paths.join(',')).toBe(true);
  });
});
