import { register } from 'node:module';

// Loaded with --import before scripts/trials/import.ts: see hooks.mjs.
register('./hooks.mjs', import.meta.url);
