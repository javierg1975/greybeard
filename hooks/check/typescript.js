// TypeScript profile: tsc through a generated tsconfig that extends the project's
// and turns on greybeard's strict flags, then ESLint with greybeard's config layered
// over the project's. tsc emits declarations into the repo's git dir for the codebase
// map (hooks/map/typescript.js); nothing is written to the project.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { writeManifest } = require('../map/typescript');

const COMPILER_OPTIONS = { strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true };
// The type check doubles as the map's index: declarations only, outside the project, no build info.
const EMIT_OPTIONS = { noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: true,
  removeComments: true, noEmitOnError: false, incremental: false, composite: false };
// Errors only declaration emit raises (unexportable inferred types); the project never asked for .d.ts.
const DECLARATION_ONLY = /^TS(2527|2742|2883|40\d\d|410[0-36-8]|4118|900[56])$/;
const ESLINT_CONFIG = path.join(__dirname, 'typescript', 'eslint.config.mjs');

function nearest(file, name, stop) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, name))) return path.join(dir, name);
    if (dir === stop || dir === path.dirname(dir)) return null;
  }
}

// The project's own copy first, then greybeard's, then PATH.
function resolveBin(root, pkg, bin) {
  for (const base of [root, path.join(__dirname, '..', '..')]) {
    try {
      const pj = createRequire(path.join(base, 'noop.js')).resolve(`${pkg}/package.json`);
      const rel = JSON.parse(fs.readFileSync(pj, 'utf8')).bin;
      return path.join(path.dirname(pj), typeof rel === 'string' ? rel : rel[bin]);
    } catch { /* not installed here */ }
  }
  return null;
}

function tsc(root, tsconfig, stateDir) {
  const bin = resolveBin(root, 'typescript', 'tsc');
  const id = crypto.createHash('sha1').update(tsconfig).digest('hex').slice(0, 12);
  const layered = path.join(stateDir, `tsconfig.${id}.json`);
  const declDir = path.join(stateDir, 'dts', id);
  fs.writeFileSync(layered, JSON.stringify({ extends: tsconfig,
    compilerOptions: { ...COMPILER_OPTIONS, ...EMIT_OPTIONS, declarationDir: declDir } }, null, 2));
  // shortcut: a solution-style tsconfig (files: [] + references) checks nothing here; point at a leaf tsconfig then.
  const [cmd, args] = bin ? [process.execPath, [bin]] : ['tsc', []];
  const r = spawnSync(cmd, [...args, '-p', layered, '--pretty', 'false'], { cwd: path.dirname(tsconfig), encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error) throw new Error('typescript not found (project, greybeard or PATH)');
  if (fs.existsSync(declDir)) writeManifest(declDir);
  const findings = [];
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    if (m && !DECLARATION_ONLY.test(m[3])) findings.push({ file: path.resolve(path.dirname(tsconfig), m[1]), line: Number(m[2]), rule: m[3], message: m[4] });
  }
  return findings;
}

function eslint(root, files) {
  const bin = resolveBin(root, 'eslint', 'eslint');
  if (!bin) {
    process.stderr.write('greybeard check: typescript: eslint not installed, functional rules skipped\n');
    return [];
  }
  const r = spawnSync(process.execPath, [bin, '--config', ESLINT_CONFIG, '--format', 'json', '--no-warn-ignored', ...files],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, GREYBEARD_ROOT: root } });
  let results;
  try { results = JSON.parse(r.stdout); } catch { throw new Error(`eslint failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`); }
  return results.flatMap(res => res.messages.map(m => ({
    file: res.filePath, line: m.line || 0, rule: m.ruleId || 'eslint', message: m.message,
  })));
}

module.exports = {
  name: 'typescript',
  exts: ['.ts', '.tsx', '.mts', '.cts'],
  detect: root => fs.existsSync(path.join(root, 'tsconfig.json')) || fs.existsSync(path.join(root, 'package.json')),
  run({ root, files, stateDir }) {
    const byConfig = new Map();
    for (const f of files) {
      const cfg = nearest(f, 'tsconfig.json', root);
      if (cfg) byConfig.set(cfg, [...(byConfig.get(cfg) || []), f]);
    }
    const wanted = new Set(files.map(f => fs.realpathSync(f)));
    const typeFindings = [...byConfig.keys()].flatMap(cfg => tsc(root, cfg, stateDir));
    return [...typeFindings, ...eslint(root, files)]
      .map(f => ({ ...f, file: fs.existsSync(f.file) ? fs.realpathSync(f.file) : f.file }))
      .filter(f => wanted.has(f.file));
  },
};
