// Extract the inline engine script from index.html and syntax-check it with node --check.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync('index.html', 'utf8');
const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
if (!m) {
  console.error('FAIL: inline engine script not found in index.html');
  process.exit(1);
}
const tmp = join(tmpdir(), 'plgraph-engine.js');
writeFileSync(tmp, m[1]);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
console.log('engine syntax OK');
