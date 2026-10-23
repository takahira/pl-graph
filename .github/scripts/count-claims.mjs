// The node/edge counts quoted in README.md and index.html <meta> tags.
//
// data.js is the single source of truth for the counts. This module is the single
// definition of *where* the prose quotes them:
//   - check-data.mjs (CI) fails if any quoted count disagrees with data.js;
//   - the data generator's publish step (private pl-graph-data repo, scripts/publish.mjs)
//     imports this file and rewrites the same claims in the same step that replaces
//     data.js, so a data refresh never leaves the prose -- or CI -- behind.
// Hard-coding the counts anywhere else re-creates the skew this replaces.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `kind` is which count the number states. Each `re` has exactly three groups --
// (text before)(the number)(text after) -- and must match exactly once in its file.
export const CLAIMS = [
  { file: 'README.md', kind: 'nodes', re: /(^- )(\d[\d,]*)( languages, )/m },
  { file: 'README.md', kind: 'edges', re: /( languages, )(\d[\d,]*)( influence edges)/ },
  { file: 'index.html', kind: 'nodes', re: /(<meta name="description" content="[^"]*?\bhow )(\d[\d,]*)( programming languages)/ },
  { file: 'index.html', kind: 'nodes', re: /(<meta property="og:description" content=")(\d[\d,]*)( languages spiral)/ },
];

const toInt = (s) => Number(s.replace(/,/g, ''));
const format = (n) => n.toLocaleString('en-US');   // 1058 -> "1,058", as the README writes it

const matchOnce = (text, { file, re }) => {
  const all = [...text.matchAll(new RegExp(re.source, re.flags + 'g'))];
  if (all.length !== 1) throw new Error(`${file}: expected exactly 1 match for ${re}, found ${all.length}`);
  return all[0];
};

const reader = (root) => {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(join(root, file), 'utf8'));
    return cache.get(file);
  };
};

/** Read every claim under `root`: [{ file, kind, value }]. Throws if a pattern is missing. */
export function readClaims(root) {
  const text = reader(root);
  return CLAIMS.map((claim) => ({ file: claim.file, kind: claim.kind, value: toInt(matchOnce(text(claim.file), claim)[2]) }));
}

/** Claims that disagree with `counts` ({ nodes, edges }), as human-readable strings. */
export function mismatches(root, counts) {
  return readClaims(root)
    .filter((c) => c.value !== counts[c.kind])
    .map((c) => `${c.file}: says ${c.value} ${c.kind}, data.js has ${counts[c.kind]}`);
}

/**
 * New contents of each claim file with the counts rewritten: Map(file -> text).
 * Pure: reads from `root`, writes nothing. Files that would not change are omitted.
 */
export function rewriteClaims(root, counts) {
  const original = reader(root);
  const next = new Map();
  for (const claim of CLAIMS) {
    const before = next.get(claim.file) ?? original(claim.file);
    const m = matchOnce(before, claim);
    const replaced = m[1] + format(counts[claim.kind]) + m[3];
    next.set(claim.file, before.slice(0, m.index) + replaced + before.slice(m.index + m[0].length));
  }
  return new Map([...next].filter(([file, text]) => text !== original(file)));
}
