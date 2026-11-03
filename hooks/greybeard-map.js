#!/usr/bin/env node
// greybeard — codebase map: what already exists, so "reuse first" costs no search.
//
// Lists the top-level functions, classes and exports of the project's source files, one line
// per folder, inside a character budget. Scala 3 and TypeScript files list compiler signatures
// when a fresh compiler index exists (hooks/map/, model in .algebra/map.algebra.md); everything
// else, and any stale index, falls back to a regex per language. Tests, generated and vendored
// files are skipped; shared code (utils, lib, services, components, hooks) is listed first when
// the budget is tight. `--all` prints every entry with no budget.
//
// greybeard: the regex fallback misses nested or dynamic definitions.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const scala = require('./map/scala');
const typescript = require('./map/typescript');

const BUDGET = Number(process.env.GREYBEARD_MAP_CHARS || 2000);
const MAX_FILES = 4000;
const SRC = /\.(py|js|jsx|mjs|cjs|ts|tsx|mts|cts|go|rs|rb|java|kt|php|swift|cs|scala)$/;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|venv|\.venv|__pycache__|coverage|\.next|target|migrations|versions|fixtures|tests?|__tests__|spec)(\/|$)/;
const SKIP_FILE = /(^|\/)(test_[^/]*|[^/]*(_test|\.test|\.spec|\.gen|\.min|\.d)\.[a-z]+)$/;
const NAME = /^(?:type\s+)?(?:[\w$]+\s+as\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)$/;
const SAFE_PATH = /^[\w.@+$()[\]\/-]+$/;
const SHARED = /(util|helper|lib|common|shared|service|component|hook|core|model|schema|api)/i;
// Signatures come from compiled repo code and go into the model's context: identifiers and type
// syntax only, and string literals longer than a short token are blanked.
const SAFE_ENTRY = /^[\w$.,:;()[\]{}<>|&=?!*+\-~'"`\/@ …]+$/;
const ENTRY_CHARS = 120;
const sanitize = (e) => e.replace(/(["'`])(?:(?!\1).)*\1/g, (q) => (/^.[\w.\-\/@:]{0,24}.$/.test(q) ? q : `${q[0]}…${q[0]}`));

const PATTERNS = {
  py: [/^(?:async\s+)?def\s+([A-Za-z]\w*)/gm, /^class\s+([A-Za-z]\w*)/gm],
  js: [/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
       /^export\s*\{([^}]*)\}/gm],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm, /^type\s+([A-Z]\w*)/gm],
  rs: [/^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type)\s+(\w+)/gm],
  rb: [/^\s*(?:def|class|module)\s+([A-Za-z][\w.]*)/gm],
  jvm: [/^\s*(?:public\s+)?(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm],
  scala: [/^ {0,2}(?:(?:final|sealed|abstract|case|implicit|opaque|inline|transparent|open)\s+)*(?:class|trait|object|enum|type|def|given)\s+([A-Za-z_]\w*)/gm],
};
const LANG = { py: 'py', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', go: 'go', rs: 'rs',
               rb: 'rb', java: 'jvm', kt: 'jvm', swift: 'jvm', cs: 'jvm', php: 'jvm', scala: 'scala' };

function listFiles(root) {
  try {
    // 64 MiB: in repos with many tracked files `git ls-files` overflows Node's 1 MiB
    // default, and the catch below reads that as "not a git repo" and falls back to a
    // walk that ignores .gitignore. The list is capped at MAX_FILES * 5 lines anyway.
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 64 * 1024 * 1024 })
      .split('\n').filter(Boolean).slice(0, MAX_FILES * 5);
    if (tracked.length) return tracked;
  } catch (e) { /* not a git repo: walk below */ }
  {
    // No git, or an untracked folder inside a parent repo (git ls-files is then empty, not an error).
    const out = [];
    (function walk(dir, depth) {
      if (depth > 6 || out.length > MAX_FILES * 5) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        const rel = path.relative(root, path.join(dir, ent.name)).replace(/\\/g, '/');
        if (ent.isDirectory()) { if (!SKIP_DIR.test(rel + '/')) walk(path.join(dir, ent.name), depth + 1); }
        else out.push(rel);
      }
    })(root, 0);
    return out;
  }
}

function namesIn(file, text) {
  const lang = LANG[path.extname(file).slice(1)];
  const names = [];
  for (const re of PATTERNS[lang] || []) {
    for (const m of text.matchAll(re)) {
      for (const n of m[1].split(',').map((s) => (s.trim().match(NAME) || [])[1]).filter(Boolean)) {
        if (!n.startsWith('_') && !names.includes(n)) names.push(n);
      }
    }
  }
  return names;
}

// Fresh compiler signatures for a Scala 3 or TypeScript file, sanitized; null means use the regex.
function precise(root, file, buf, tsIndex) { // tsIndex: () => index, loaded on the first .ts file
  const ext = path.extname(file);
  const entries = ext === '.scala' ? scala.signatures(root, file, buf)
    : /^\.[mc]?tsx?$/.test(ext) ? typescript.signatures(tsIndex(), root, file, buf) : null;
  // No comment syntax either: tsc's removeComments is the first guard, this is the one nothing skips.
  return entries && entries.map(sanitize).filter((e) => SAFE_ENTRY.test(e) && !/\/[*/]/.test(e));
}

function buildMap(root = process.cwd(), { all = false } = {}) {
  const budget = all ? Infinity : BUDGET;
  // Lazy: only repos with TypeScript files read the declaration index.
  let loaded;
  const tsIndex = () => (loaded = loaded || typescript.loadIndex(root));
  let signed = false;
  const files = listFiles(root)
    .filter((f) => SAFE_PATH.test(f) && SRC.test(f) && !SKIP_DIR.test(f) && !SKIP_FILE.test(f))
    .slice(0, MAX_FILES)
    .sort((a, b) => (SHARED.test(b) - SHARED.test(a)) || a.localeCompare(b));
  // One line per directory: names are enough to know something exists; grep finds the file.
  const dirs = new Map();
  for (const f of files) {
    let buf;
    try {
      if (!fs.lstatSync(path.join(root, f)).isFile()) continue;
      buf = fs.readFileSync(path.join(root, f));
    } catch (e) { continue; }
    const sigs = precise(root, f, buf, tsIndex);
    if (sigs && sigs.length) signed = true;
    const names = sigs || namesIn(f, buf.toString('utf8', 0, 65536));
    if (!names.length) continue;
    const dir = path.dirname(f) === '.' ? '.' : path.dirname(f);
    dirs.set(dir, [...(dirs.get(dir) || []), names]);
  }
  const lines = [];
  let used = 0;
  let skipped = 0;
  for (const [dir, perFile] of dirs) {
    if (all) { lines.push(...perFile.flat().map((n) => `${dir}/: ${n}`)); continue; }
    // The first exports say what a file is; in a folder of many files (a UI kit) one name each.
    const names = [...new Set(perFile.flatMap((n) => n.slice(0, perFile.length > 8 ? 1 : 3)))]
      .map((n) => (n.length > ENTRY_CHARS ? `${n.slice(0, ENTRY_CHARS)}…` : n));
    const line = `${dir}/: ${names.slice(0, 30).join(', ')}${names.length > 30 ? ', ...' : ''}`;
    if (used + line.length > budget) { skipped++; continue; }
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return '';
  if (all) return lines.join('\n');
  return 'Codebase map (what already exists; reuse it, read a file only when you need its details):\n' +
    lines.join('\n') + (skipped ? `\n(${skipped} more folders not listed)` : '') +
    (signed ? `\n(every signature, one per line, to grep: node ${JSON.stringify(__filename)} --all)` : '');
}

module.exports = { buildMap };

if (require.main === module) {
  const args = process.argv.slice(2);
  process.stdout.write(buildMap(args.find((a) => !a.startsWith('--')) || process.cwd(), { all: args.includes('--all') }) + '\n');
}
