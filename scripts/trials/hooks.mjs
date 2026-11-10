import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
 * Resolve hooks for running the site's TypeScript under plain Node (scripts/trials/import.ts): the `@/` alias of
 * tsconfig.json, extensionless relative imports (`./schema` → schema.ts) and JSON modules. Type stripping itself is
 * Node's own (--experimental-transform-types); nothing is bundled or compiled to disk.
 */
const SRC = path.resolve(fileURLToPath(new URL('../../src', import.meta.url)));
const candidates = base => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:'))
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  if (base) for (const file of candidates(base)) if (existsSync(file) && statSync(file).isFile()) {
    const resolved = await next(pathToFileURL(file).href, context);
    return file.endsWith('.json') ? { ...resolved, importAttributes: { type: 'json' } } : resolved;
  }
  return next(specifier, context);
}
