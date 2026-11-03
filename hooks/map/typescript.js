// TypeScript signatures from the declarations `greybeard check` emits into the repo's git dir
// (`<git-path greybeard>/dts/<tsconfig id>/`), with a manifest of the source hashes they came from.
// A declaration file counts only while its source still has that hash.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const DECL = /^export (?:declare )?(?:default )?(?:abstract )?(?:function|const|let|var|class|interface|type|enum|namespace)\b/;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

// Write after tsc: which source each .d.ts came from, and that source's hash.
// shortcut: a source edited while tsc runs is hashed after the edit and reads as fresh; the next check fixes it.
function writeManifest(declDir) {
  const manifest = {};
  for (const map of listFiles(declDir).filter((f) => f.endsWith('.d.ts.map'))) {
    try {
      const { sources = [], sourceRoot = '' } = JSON.parse(fs.readFileSync(map, 'utf8'));
      const source = fs.realpathSync(path.resolve(path.dirname(map), sourceRoot, sources[0]));
      manifest[path.relative(declDir, map.slice(0, -4))] = { source, sha1: sha1(fs.readFileSync(source)) };
    } catch (e) { /* source gone or map unreadable: no entry */ }
  }
  fs.writeFileSync(path.join(declDir, 'manifest.json'), JSON.stringify(manifest));
}

// tsc output is canonical: each top-level statement starts at column 0, nested lines are indented
// and a block's closing brace is back at column 0.
function declarations(text) {
  return text.split(/\n(?=[^\s}])/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => DECL.test(s))
    .map((s) => s.replace(/^export (declare )?/, '').replace(/;$/, ''));
}

// What `git rev-parse --git-path greybeard` prints, without a git spawn (half a second on a slow
// machine, inside the 3 s session-start budget): the common git dir, also from a linked worktree.
function stateDir(root) {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const dotgit = path.join(dir, '.git');
    if (fs.existsSync(dotgit)) {
      if (fs.statSync(dotgit).isDirectory()) return path.join(dotgit, 'greybeard');
      const gitdir = path.resolve(dir, fs.readFileSync(dotgit, 'utf8').match(/^gitdir: (.*)$/m)[1].trim());
      const common = path.join(gitdir, 'commondir');
      return path.join(fs.existsSync(common) ? path.resolve(gitdir, fs.readFileSync(common, 'utf8').trim()) : gitdir, 'greybeard');
    }
    if (dir === path.dirname(dir)) return null;
  }
}

// source path (absolute) -> { sha1, dts } across every tsconfig check has emitted for.
function loadIndex(root) {
  const index = new Map();
  let ids = [];
  let state;
  try { state = stateDir(root); ids = fs.readdirSync(path.join(state, 'dts')); } catch (e) { /* no git dir or nothing emitted yet */ }
  for (const id of ids) try {
    const declDir = path.join(state, 'dts', id);
    const manifest = JSON.parse(fs.readFileSync(path.join(declDir, 'manifest.json'), 'utf8'));
    for (const [dts, { source, sha1: hash }] of Object.entries(manifest)) index.set(source, { sha1: hash, dts: path.join(declDir, dts) });
  } catch (e) { /* one tsconfig never finished emitting: the others still count */ }
  return index;
}

// Signatures for one tracked .ts file, or null when no declaration matches its current content.
function signatures(index, root, file, source) {
  try {
    const hit = index.get(fs.realpathSync(path.resolve(root, file)));
    return hit && hit.sha1 === sha1(source) ? declarations(fs.readFileSync(hit.dts, 'utf8')) : null;
  } catch (e) { return null; }
}

module.exports = { writeManifest, declarations, loadIndex, signatures, stateDir };
