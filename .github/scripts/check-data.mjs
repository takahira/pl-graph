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

console.log('data OK: ' + G.nodes.length + ' nodes / ' + G.edges.length + ' edges / ' + G.buckets.length + ' buckets');
