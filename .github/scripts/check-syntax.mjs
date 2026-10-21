// Compile every inline classic script in index.html the way a browser does.
// `node --check` is not equivalent -- it parses a .js file inside the CommonJS wrapper
// (top-level `return` passes) and, when that fails, retries it as an ES module (top-level
// `await`, `import` and `export` pass), so it accepts three things the browser rejects.
//
// The document is walked once, the way a parser reads it. Regex passes over the whole file
// get this wrong in ways that hide real syntax errors or invent fake ones: a comment stripper
// also eats `"<!--"` written inside a script, `<script>` inside <textarea> is text and not
// code, and `[^>]*` ends an opening tag at a `>` that sits inside a quoted attribute value.
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

// Elements whose content is not markup: script/style are raw text, textarea/title are RCDATA.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

// Only a type that is a JavaScript MIME type *essence* match runs as a classic script. Note
// that parameters disable execution: `type="text/javascript;charset=utf-8"` is a data block.
// https://html.spec.whatwg.org/multipage/scripting.html#scriptingLanguages
const JS_MIME = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0',
  'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4',
  'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript',
]);

// Attribute values are character-decoded before the parser compares them, so `text&#47;javascript`
// is the JavaScript MIME type and the script does run.
const BASIC_REFS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeRefs = (value) =>
  value.replace(/&(?:([A-Za-z][A-Za-z0-9]*)|#(\d+)|#[xX]([0-9A-Fa-f]+));/g, (ref, name, dec, hex) => {
    if (name !== undefined) return Object.hasOwn(BASIC_REFS, name) ? BASIC_REFS[name] : ref;
    const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : ref;
  });

// Read an attribute list positionally, from `from` up to the tag's `>`. Searching for a name with
// a global regex instead would match inside another name (`0src="x"` looks like `src="x"`), skip
// valueless attributes (so duplicates stop being first-wins) and cut an unquoted value at a quote.
const ATTR_TOKEN = /[\s/]*([^\s/>=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/y;
function readAttrs(html, from) {
  const attrs = new Map();
  const close = html.indexOf('>', from);
  const body = html.slice(from, close === -1 ? html.length : close);
  ATTR_TOKEN.lastIndex = 0;
  let m;
  while (ATTR_TOKEN.lastIndex < body.length && (m = ATTR_TOKEN.exec(body)) !== null) {
    if (!m[0]) break;
    const key = m[1].toLowerCase();
    let value = m[2] ?? '';
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    if (!attrs.has(key)) attrs.set(key, decodeRefs(value));   // HTML keeps the first of duplicates
  }
  return { attrs, end: close === -1 ? html.length : close + 1 };
}

// Walk the document and collect every <script> with its body and where the body starts.
function scanScripts(html) {
  const found = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {        // a comment ends at `-->` or `--!>`
      const plain = html.indexOf('-->', lt + 4);
      const bang = html.indexOf('--!>', lt + 4);
      const end = plain === -1 ? bang : bang === -1 ? plain : Math.min(plain, bang);
      i = end === -1 ? html.length : end + (end === bang ? 4 : 3);
      continue;
    }
    const open = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(lt, lt + 64));
    if (!open) { i = lt + 1; continue; }
    const name = open[1].toLowerCase();
    const { attrs, end } = readAttrs(html, lt + open[0].length);
    if (!RAW_TEXT.has(name)) { i = end; continue; }
    const closeTag = new RegExp(`</${name}(?=[\\s/>])`, 'i').exec(html.slice(end));
    const body = closeTag ? html.slice(end, end + closeTag.index) : html.slice(end);
    if (name === 'script') found.push({ attrs, body, bodyStart: end });
    if (!closeTag) break;
    const gt = html.indexOf('>', end + closeTag.index);
    i = gt === -1 ? html.length : gt + 1;
  }
  return found;
}

const html = readFileSync('index.html', 'utf8');

let checked = 0;
let failed = 0;
let modules = 0;
for (const script of scanScripts(html)) {
  if (script.attrs.has('src')) continue;                // external: nothing inline to compile
  const type = (script.attrs.get('type') ?? '').trim().toLowerCase();
  if (type === 'module') { modules += 1; continue; }    // an ES module is not a classic script
  if (type && !JS_MIME.has(type)) continue;             // data block, not code

  // Report the line as it is numbered in index.html, not within the extracted body.
  const lineOffset = html.slice(0, script.bodyStart).split('\n').length - 1;
  checked += 1;
  try {
    new Script(script.body, { filename: 'index.html', lineOffset });
  } catch (err) {
    console.error('FAIL: ' + String(err.stack).split('\n').slice(0, 3).join('\n'));
    console.error(`${err.name}: ${err.message}`);
    failed += 1;
  }
}

if (modules) {
  // Not a silent gap: say so, because this file is the only syntax gate the engine has.
  console.warn(`WARN: ${modules} inline module script(s) skipped -- vm.Script compiles classic scripts only`);
}
if (checked === 0) {
  console.error('FAIL: inline engine script not found in index.html');
  process.exit(1);
}
if (failed) process.exit(1);
console.log(`engine syntax OK (${checked} inline script${checked === 1 ? '' : 's'})`);
