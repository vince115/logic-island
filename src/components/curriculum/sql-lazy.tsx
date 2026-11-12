'use client';

import dynamic from 'next/dynamic';

/*
 * Phase F.1a: every lesson page is the same route, so the SQL playground and checker are loaded only by the lessons
 * that show them (a server component importing them directly would put them in every lesson's bundle). They still
 * render on the server; the SQLite worker and WebAssembly load on the first run.
 */
export const SqlPlayground = dynamic(() => import('./sql-playground').then(m => m.SqlPlayground));
export const SqlChecker = dynamic(() => import('./sql-playground').then(m => m.SqlChecker));
