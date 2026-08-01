// Sanity-check the prebuilt data.js artifact: shape, counts, edge indices, and
// that no raw wikitext markup leaked into display strings.
import { readFileSync } from 'node:fs';

const src = readFileSync('data.js', 'utf8');
const sandbox = {};
new Function('window', src)(sandbox);
const G = sandbox.GRAPH;

const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };
if (!G || !Array.isArray(G.nodes) || !Array.isArray(G.edges) || !Array.isArray(G.buckets)) fail('GRAPH shape');
if (G.nodes.length < 300) fail('unexpected node count: ' + G.nodes.length);
if (G.edges.length < 900) fail('unexpected edge count: ' + G.edges.length);
if (!G.edges.every(([s, t]) => Number.isInteger(s) && Number.isInteger(t) && s >= 0 && s < G.nodes.length && t >= 0 && t < G.nodes.length)) fail('edge index out of range');
if (!G.nodes.every((n) => typeof n.t === 'string' && typeof n.w === 'string')) fail('node missing t/w');

const residue = G.nodes.filter((n) => n.d && (/\[\[|\[http|\{\{|''/.test(n.d) || n.d.trim().startsWith('*')));
if (residue.length) fail('wikitext residue in d: ' + residue.map((n) => n.t).join(', '));

// The card renders `d` as "By <d>", so a designer value that begins mid-sentence
// reads as "By with indirect influence from" (COBOL did). A full scan of all
// nodes found exactly one such record, so this is a bounded, precise check --
// not a heuristic that will start eating real designer names.
const midSentence = G.nodes.filter((n) => n.d && /^(?:with|and|also|from)\b/i.test(n.d.trim()));
if (midSentence.length) fail('infobox label residue in d: ' + midSentence.map((n) => n.t).join(', '));

// KNOWN-RECORD ASSERTIONS.
//
// Every check above accepted four "first appeared" years that actually held a
// STABLE RELEASE date, placing 1990s languages among the modern ones and
// inverting the single ordering this site exists to show. Shape checks cannot
// catch a well-formed wrong number, so hand-verified records are pinned here.
//
// `a` is the year of first appearance. `null` means unknown, which the viewer
// places at the dataset median -- deliberately preferred over a wrong year.
const EXPECTED = [
  // Regression pins: these carried a stable-release year.
  ['JADE (programming language)', { a: null }],
  ['OpenCL', { a: null }],
  ['Visual Prolog', { a: null }],
  ['XSB', { a: null }],
  // Found by enumerating ALL records that depended on the stable-release
  // fallback rather than filtering on `a >= 2018`; wrong the same way, but too
  // old-looking to stand out.
  ['Mirah (programming language)', { a: null }],
  ['Script.NET', { a: null }],
  // The language, not the engine it ships in.
  ['Godot (game engine)', { t: 'GDScript' }],
  ['COBOL', { a: 1960, d: null }],
  // Anchors: if the year pipeline breaks wholesale, these move too. Rust is
  // 2012 (the 0.1 release), not 2015 (1.0) -- the very distinction being pinned.
  ['Fortran', { a: 1957 }],
  ['Lisp (programming language)', { a: 1960 }],
  ['C (programming language)', { a: 1972 }],
  ['Python (programming language)', { a: 1991 }],
  ['Rust (programming language)', { a: 2012 }],
];
const byArticle = new Map(G.nodes.map((n) => [n.w, n]));
for (const [article, want] of EXPECTED) {
  const node = byArticle.get(article);
  if (!node) fail('expected record missing: ' + article);
  for (const [k, v] of Object.entries(want)) {
    if (JSON.stringify(node[k]) !== JSON.stringify(v)) {
      fail(article + ': ' + k + ' is ' + JSON.stringify(node[k]) + ', expected ' + JSON.stringify(v));
    }
  }
}

console.log('data OK: ' + G.nodes.length + ' nodes / ' + G.edges.length + ' edges / ' + G.buckets.length + ' buckets');
