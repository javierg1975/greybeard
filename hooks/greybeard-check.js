#!/usr/bin/env node
// Claude Code PostToolUse hook (Edit|Write): run `greybeard check` on the edited
// file and hand findings back to the agent (exit 2 + stderr). Files no profile
// covers return at once, so editing docs costs nothing.

const path = require('path');
const { check, repoRoot, PROFILES } = require('./check');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  let file;
  try { file = JSON.parse(input).tool_input?.file_path; } catch { return; }
  if (!file || !PROFILES.some(p => p.exts.includes(path.extname(file)))) return;
  const root = repoRoot(path.dirname(file));
  if (!root) return;
  const findings = check(root, [file]);
  if (!findings.length) return;
  process.stderr.write(`greybeard check found ${findings.length} issue(s) in ${path.relative(root, file)}; fix them:\n${findings.join('\n')}\n`);
  process.exit(2);
}

process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => { finish(); process.exit(0); });
process.stdin.on('error', () => { finish(); process.exit(0); });
// Some hosts never close stdin; don't let that freeze the session.
setTimeout(() => { finish(); process.exit(0); }, 1000);
