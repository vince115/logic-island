import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { playableQuestions, sourceById, trialBank } from '@/content/trials';
import { conflictPairs } from '@/content/trials/conflicts';
import { mockBlueprints } from '@/content/trials/mock-exams';
import { privateFile } from '@/content/trials/private-bank';
import type { PreflightInput } from '@/lib/trials/preflight';
import { VOLATILITY_REGISTERS } from '@/lib/trials/volatility';
import { ROOT, readHashes, readLedger, readManifest } from './ledger-io';

/*
 * The release files as the preflight checks read them (preflight.ts; T.3I: ci-bootstrap.ts runs the same checks).
 * Reads only. A missing manifest or paper registry is passed on as missing, and its check fails (fail closed).
 */
export function preflightInput(o: { today: string; baselineFile: string; requireReady?: string[]; seeds?: number }): PreflightInput {
  const json = (file: string) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  return {
    bank: trialBank, sources: sourceById, ledger: readLedger(), recorded: readHashes(), baseline: JSON.parse(readFileSync(o.baselineFile, 'utf8')) as Record<string, string>,
    playable: playableQuestions, blueprints: mockBlueprints, conflicts: conflictPairs(), today: o.today, requireReady: o.requireReady ?? [], seeds: o.seeds ?? 50,
    // T.3F: fail closed without the assessment manifest (the integrity check reports it missing).
    manifest: readManifest(),
    // T.3G: fail closed without the paper version registry.
    paperVersions: json(path.join(ROOT, 'src/content/trials/paper-versions.json')),
    volatility: Object.fromEntries(Object.entries(VOLATILITY_REGISTERS).filter(([, f]) => existsSync(privateFile(f))).map(([exam, f]) => [exam, JSON.parse(readFileSync(privateFile(f), 'utf8'))])),
  };
}
