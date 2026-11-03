#!/usr/bin/env node
// greybeard check: output parsing and the hook's fast path. The profiles
// themselves need sbt / tsc / eslint, so they are exercised by hand, not here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const scala = require('../hooks/check/scala');
const { check } = require('../hooks/check');

const HOOK = path.join(__dirname, '..', 'hooks', 'greybeard-check.js');

test('scala parser reads Scala 3 reports, wart tags and scalafix lines', () => {
  const out = [
    '[error] -- [E198] Unused Symbol Error: /p/src/A.scala:2:28 ',
    '[error] 2 |  def unused(): Int = { val z = 3; 1 }',
    '[error]   |                            ^',
    '[error]   |                            unused local definition',
    '[error] -- Error: /p/src/A.scala:3:4 ----',
    '[error] 3 |    var t = 0',
    '[error]   |    ^^^^^^^^^',
    '[error]   |    [wartremover:Var] var is disabled',
    '[error] /p/src/A.scala:5:5: error: [DisableSyntax.throw] exceptions should be avoided',
  ].join('\n');
  assert.deepEqual(scala.parse(out), [
    { file: '/p/src/A.scala', line: 2, rule: 'E198', message: 'unused local definition' },
    { file: '/p/src/A.scala', line: 3, rule: 'wartremover:Var', message: 'var is disabled' },
    { file: '/p/src/A.scala', line: 5, rule: 'DisableSyntax.throw', message: 'exceptions should be avoided' },
  ]);
});

test('check skips files no profile covers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-check-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'build.sbt'), '');
  fs.writeFileSync(path.join(dir, 'notes.py'), 'x = 1\n');
  assert.deepEqual(check(dir, ['notes.py']), []);
});

test('hook returns at once for a docs edit and for empty stdin', () => {
  for (const input of [JSON.stringify({ tool_input: { file_path: '/tmp/README.md' } }), '']) {
    const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  }
});

test('check records its findings per file for the band, and a skipped profile leaves them alone', () => {
  const { PROFILES } = require('../hooks/check');
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gb-record-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const a = path.join(dir, 'a.fake');
  fs.writeFileSync(a, 'x\n');
  let found = [{ file: a, line: 3, rule: 'no-let', message: 'use const' }];
  let fail = false;
  PROFILES.push({ name: 'fake', exts: ['.fake'], detect: () => true, run: () => { if (fail) throw new Error('tool missing'); return found; } });
  const recorded = () => JSON.parse(fs.readFileSync(path.join(dir, '.git', 'greybeard', 'findings.json'), 'utf8'));
  try {
    assert.deepEqual(check(dir, ['a.fake']), ['a.fake:3 no-let use const']);
    assert.deepEqual(recorded(), { [a]: ['a.fake:3 no-let use const'] });
    fail = true;
    check(dir, ['a.fake']);
    assert.deepEqual(recorded(), { [a]: ['a.fake:3 no-let use const'] }, 'a skipped profile proves nothing about the file');
    fail = false;
    found = [];
    check(dir, ['a.fake']);
    assert.deepEqual(recorded(), {}, 'a file with nothing left drops out');
  } finally {
    PROFILES.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
