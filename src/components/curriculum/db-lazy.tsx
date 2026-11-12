'use client';

import dynamic from 'next/dynamic';

/*
 * Phase F.1b: like sql-lazy.tsx, the ER builder and the normalization workbench are loaded only by the lessons that
 * show them, so the shared lesson route does not carry them; F.1c adds its two activities the same way.
 */
export const ErBuilder = dynamic(() => import('./er-builder').then(m => m.ErBuilder));
export const NfExplorer = dynamic(() => import('./normalization-workbench').then(m => m.NfExplorer));
export const NfExerciseBox = dynamic(() => import('./normalization-workbench').then(m => m.NfExerciseBox));
// Phase F.1c: the B+ tree explorer (query-plan) and the transaction timelines (transaction-timeline).
export const BPlusExplorer = dynamic(() => import('./bplus-explorer').then(m => m.BPlusExplorer));
export const TimelineExplorer = dynamic(() => import('./txn-explorer').then(m => m.TimelineExplorer));
export const ScheduleExplorer = dynamic(() => import('./txn-explorer').then(m => m.ScheduleExplorer));
export const TxExerciseBox = dynamic(() => import('./txn-explorer').then(m => m.TxExerciseBox));
// Phase F.1d: round-trip sequences (protocol-sequence) and the backup / replication simulations (architecture-diagram).
export const SequenceExplorer = dynamic(() => import('./sequence-explorer').then(m => m.SequenceExplorer));
export const ReplicationExplorer = dynamic(() => import('./ops-explorer').then(m => m.ReplicationExplorer));
export const BackupPlanner = dynamic(() => import('./ops-explorer').then(m => m.BackupPlanner));
export const OpsExerciseBox = dynamic(() => import('./ops-explorer').then(m => m.OpsExerciseBox));
