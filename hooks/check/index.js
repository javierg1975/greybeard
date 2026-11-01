#!/usr/bin/env node
// greybeard check: detect the language from build files, run that profile on
// changed files only, print one `file:line rule message` per finding.
//
//   greybeard check                 working-tree changes vs HEAD, plus untracked files
//   greybeard check --staged        staged files (the pre-commit hook)
//   greybeard check <file>...       just these files (the PostToolUse hook)
//   greybeard check --install-hook  install the git pre-commit hook
//
// Exit 0: clean or nothing to check. Exit 1: findings. Missing tools skip their
// profile with a note on stderr; they never fail the check.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROFILES = [require('./scala'), require('./typescript')];

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function repoRoot(dir) {
  try { return git(dir, ['rev-parse', '--show-toplevel']).trim(); } catch { return null; }
}

// Per-repo scratch space outside the working tree (generated configs, markers).
function stateDir(root) {
  const dir = path.resolve(root, git(root, ['rev-parse', '--git-path', 'greybeard']).trim());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function changedFiles(root, staged) {
  const lines = staged
    ? git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    : git(root, ['diff', 'HEAD', '--name-only', '--diff-filter=ACMR']) +
      git(root, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set(lines.split('\n').filter(Boolean))].map(f => path.join(root, f));
}

function check(root, files) {
  const existing = files.map(f => path.resolve(root, f)).filter(f => fs.existsSync(f));
  const findings = [];
  for (const profile of PROFILES) {
    const mine = existing.filter(f => profile.exts.includes(path.extname(f)));
    if (!mine.length || !profile.detect(root)) continue;
    try {
      findings.push(...profile.run({ root, files: mine, stateDir: stateDir(root) }));
    } catch (e) {
      process.stderr.write(`greybeard check: skipped ${profile.name}: ${e.message}\n`);
    }
  }
  return findings.map(f => `${path.relative(root, f.file)}:${f.line} ${f.rule} ${f.message}`);
}

function installHook(root) {
  const hook = path.resolve(root, git(root, ['rev-parse', '--git-path', 'hooks/pre-commit']).trim());
  const marker = '# greybeard check';
  if (fs.existsSync(hook) && !fs.readFileSync(hook, 'utf8').includes(marker)) {
    throw new Error(`${hook} exists and is not greybeard's; add this line to it instead:\n  node "${__filename}" --staged`);
  }
  // shortcut: the absolute path breaks when the plugin moves (an update); rerun --install-hook then.
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, `#!/bin/sh\n${marker}\nCHECK="${__filename}"\n` +
    'if [ -f "$CHECK" ]; then exec node "$CHECK" --staged; fi\n' +
    'echo "greybeard check not found at $CHECK; rerun greybeard check --install-hook" >&2\n', { mode: 0o755 });
  return hook;
}

module.exports = { check, changedFiles, repoRoot, PROFILES };

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => a !== 'check');
  const root = repoRoot(process.cwd());
  if (!root) { process.stderr.write('greybeard check: not inside a git repository\n'); process.exit(0); }
  if (args.includes('--install-hook')) {
    try { console.log(`installed ${installHook(root)}`); } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  const files = args.filter(a => !a.startsWith('--'));
  const out = check(root, files.length ? files : changedFiles(root, args.includes('--staged')));
  if (out.length) console.log(out.join('\n'));
  process.exit(out.length ? 1 : 0);
}
