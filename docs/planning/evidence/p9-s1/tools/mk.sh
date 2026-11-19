#!/bin/zsh
# usage: mk.sh <name> <git ref>  — a clean copy of a commit with cloned node_modules and the scratch Playwright config
A=$(cd "$(dirname "$0")" && pwd); W=${S1_WORKTREE:?set S1_WORKTREE to the checkout to copy from}; N=$1; R=$2
rm -rf $A/$N; mkdir -p $A/$N && git -C $W archive $R | tar -x -C $A/$N && cp -cR $A/../base/node_modules $A/$N/node_modules
git -C $W rev-parse $R > $A/$N/COMMIT
cat > $A/$N/playwright.iso.config.ts <<'C'
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const port = process.env.ISO_PORT ?? '3141';
export default defineConfig({ ...base, workers: 4, use: { ...base.use, baseURL: `http://127.0.0.1:${port}`, trace: 'off' },
  webServer: { command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000 } });
C
echo "$N = $(cat $A/$N/COMMIT)"
