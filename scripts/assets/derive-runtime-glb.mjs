#!/usr/bin/env node
// Derives the runtime GLB from a preserved source GLB.
// Only tool flags (extras keys starting with "blendermcp") are removed; nodes, meshes,
// materials, accessors and the BIN chunk are kept byte-for-byte.
// Node built-ins only, so it adds no project dependency.
//
//   node scripts/assets/derive-runtime-glb.mjs            # write output + provenance
//   node scripts/assets/derive-runtime-glb.mjs --check    # verify committed files match
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLAG_PREFIX = 'blendermcp';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Splits a GLB into its parsed JSON chunk and the raw BIN chunk (header included). */
export function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file');
  if (view.getUint32(4, true) !== 2) throw new Error('unsupported GLB version');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB length mismatch');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const rest = bytes.subarray(20 + jsonLength);
  if (rest.byteLength && new DataView(rest.buffer, rest.byteOffset).getUint32(4, true) !== CHUNK_BIN) {
    throw new Error('second chunk is not BIN');
  }
  return { json, binChunk: rest, bin: rest.subarray(8) };
}

/** Removes tool flags from every `extras` object; returns the JSON pointers removed. */
export function stripToolFlags(json) {
  const removed = [];
  const visit = (value, pointer) => {
    if (Array.isArray(value)) { value.forEach((item, i) => visit(item, `${pointer}/${i}`)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'extras' && child && typeof child === 'object' && !Array.isArray(child)) {
        for (const flag of Object.keys(child).filter(k => k.startsWith(FLAG_PREFIX))) {
          delete child[flag];
          removed.push(`${pointer}/extras/${flag}`);
        }
        if (!Object.keys(child).length) delete value.extras;
      } else {
        visit(child, `${pointer}/${key}`);
      }
    }
  };
  visit(json, '');
  return removed;
}

/** Rebuilds a GLB from JSON plus the untouched BIN chunk. */
export function buildGlb(json, binChunk) {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(raw.byteLength / 4) * 4).fill(0x20);
  padded.set(raw);
  const out = new Uint8Array(12 + 8 + padded.byteLength + binChunk.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, padded.byteLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(padded, 20);
  out.set(binChunk, 20 + padded.byteLength);
  return out;
}

export function deriveRuntimeGlb(sourceBytes) {
  const { json, binChunk } = parseGlb(sourceBytes);
  const removed = stripToolFlags(json);
  return { bytes: buildGlb(json, binChunk), removed, binSha256: sha256(binChunk) };
}

// The one asset D.0 derives. The source lives in the asset vault, outside Git.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const basicsIslandV21 = {
  version: '2.1',
  source: {
    vault: '/Users/vincelo/dev-hub/assets/logic-island',
    path: 'codex-visualizations-20261028-01a181a6/basics-v2.1/logiclab-basics-island-v2.1.glb',
    sha256: '7cb4272734b5d1c7bcd68d2ba340206fdef55623bf0f011f6152a1b7bd468957',
    bytes: 879748,
  },
  output: 'public/models/islands/basics-island.v2.1.glb',
  provenance: 'docs/assets/basics-island-v2.1.provenance.json',
};

function run({ check }) {
  const spec = basicsIslandV21;
  const sourcePath = process.env.LOGIC_ISLAND_ASSET_VAULT
    ? resolve(process.env.LOGIC_ISLAND_ASSET_VAULT, spec.source.path)
    : resolve(spec.source.vault, spec.source.path);
  const source = new Uint8Array(readFileSync(sourcePath));
  if (sha256(source) !== spec.source.sha256 || source.byteLength !== spec.source.bytes) {
    throw new Error(`source GLB does not match the recorded SHA-256: ${sourcePath}`);
  }
  const { bytes, removed, binSha256 } = deriveRuntimeGlb(source);
  const provenance = {
    asset: 'basics-island',
    version: spec.version,
    note: 'Root extras asset_id is still "logiclab-basics-island-v2" in the source; track the version here, not by asset_id.',
    source: { vault_relative_path: spec.source.path, sha256: spec.source.sha256, bytes: spec.source.bytes },
    output: { path: spec.output, sha256: sha256(bytes), bytes: bytes.byteLength },
    bin_chunk_sha256: binSha256,
    removed_json_pointers: removed,
    method: 'scripts/assets/derive-runtime-glb.mjs: strip extras keys prefixed "blendermcp", re-serialize JSON chunk, copy BIN chunk unchanged',
  };
  const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
  const outPath = resolve(root, spec.output);
  const provenancePath = resolve(root, spec.provenance);
  if (check) {
    const sameGlb = sha256(readFileSync(outPath)) === provenance.output.sha256;
    const sameProvenance = readFileSync(provenancePath, 'utf8') === provenanceText;
    if (!sameGlb || !sameProvenance) throw new Error('committed runtime GLB or provenance is out of date');
    console.log(`ok ${spec.output} ${provenance.output.sha256}`);
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(provenancePath), { recursive: true });
  writeFileSync(outPath, bytes);
  writeFileSync(provenancePath, provenanceText);
  console.log(`wrote ${spec.output} ${provenance.output.sha256} (removed ${removed.join(', ') || 'nothing'})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ check: process.argv.includes('--check') });
}
