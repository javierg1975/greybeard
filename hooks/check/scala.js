// Scala profile: compile through the warm sbt server (`sbt --client`) with
// greybeard's flags and WartRemover layered into the server session, then
// scalafix DisableSyntax with greybeard's own config. Nothing is written to the build.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WARTREMOVER = '3.6.3';
const FLAGS = ['-Werror', '-Wunused:all', '-Wvalue-discard'];
const WARTS = ['Var', 'Null', 'Throw', 'AsInstanceOf', 'IsInstanceOf', 'OptionPartial', 'TryPartial', 'IterableOps', 'Return'];
const SCALAFIX_CONF = path.join(__dirname, 'scala', 'greybeard.scalafix.conf');

const quote = s => JSON.stringify(s);
const OPTIONS = [...FLAGS, ...WARTS.map(w => `-P:wartremover:traverser:org.wartremover.warts.${w}`)];

// `~=` with distinct keeps the result stable however often it is applied. ThisBuild, not
// `set every`: sbt 1.12 fails to reapply `every` with `~=`. Builds that redefine these keys
// per project with `:=` drop the layer.
const SESSION = [
  `set ThisBuild / libraryDependencies ~= (d => (d :+ compilerPlugin("org.wartremover" %% "wartremover" % ${quote(WARTREMOVER)} cross CrossVersion.full)).distinct)`,
  `set ThisBuild / scalacOptions ~= (o => (o ++ Seq(${OPTIONS.map(quote).join(', ')})).distinct)`,
];

function sbt(root, command) {
  const r = spawnSync('sbt', ['--client', command], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? 'sbt not found on PATH' : r.error.message);
  return (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

// Apply the session settings once per server: the server rewrites active.json when it starts.
function ensureSession(root, stateDir) {
  const active = path.join(root, 'project', 'target', 'active.json');
  const marker = path.join(stateDir, 'sbt-session');
  const current = () => (fs.existsSync(active) ? fs.readFileSync(active, 'utf8') : '');
  if (current() && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === current()) return;
  const out = sbt(root, SESSION.join('; '));
  if (/\[error\]/.test(out)) throw new Error(`could not layer settings into the sbt session:\n${out.slice(-2000)}`);
  fs.writeFileSync(marker, current());
}

// Scala 3:  [error] -- [E198] Unused Symbol Error: /abs/A.scala:5:8 ----
//           [error]   |      unused local definition
// Scala 2 and scalafix:  [error] /abs/A.scala:5:8: error: [DisableSyntax.var] mutable state ...
function parse(out) {
  const findings = [];
  let open = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/^\[(error|warn)\]\s?/, '');
    let m = line.match(/^-- (?:\[(E\d+)\] )?([\w ]+?): (\S+\.scala):(\d+):\d+/);
    if (m) {
      open = { file: m[3], line: Number(m[4]), rule: m[1] || m[2].trim().toLowerCase().replace(/ /g, '-'), message: '' };
      findings.push(open);
      continue;
    }
    m = line.match(/^(\S+\.scala):(\d+):\d+: (?:error|warning): (.*)$/);
    if (m) {
      open = { file: m[1], line: Number(m[2]), rule: 'scalac', message: m[3] };
      findings.push(open);
      continue;
    }
    m = line.match(/^\s*\|\s*(.*\w.*)$/);
    if (open && !open.message && m) open.message = m[1].trim();
  }
  for (const f of findings) {
    const tagged = f.message.match(/^\[([\w.:]+)\]\s*(.*)$/); // [wartremover:Var] ... / [DisableSyntax.var] ...
    if (tagged) [f.rule, f.message] = [tagged[1], tagged[2]];
  }
  return findings;
}

module.exports = {
  name: 'scala',
  exts: ['.scala'],
  detect: root => fs.existsSync(path.join(root, 'build.sbt')),
  run({ root, files, stateDir }) {
    ensureSession(root, stateDir);
    let out = sbt(root, 'Test/compile');
    const project = path.join(root, 'project');
    const sbtFiles = fs.existsSync(project) ? fs.readdirSync(project).filter(f => f.endsWith('.sbt')) : [];
    if (!sbtFiles.some(f => fs.readFileSync(path.join(project, f), 'utf8').includes('sbt-scalafix'))) {
      process.stderr.write('greybeard check: scala: no sbt-scalafix in this build, DisableSyntax skipped\n');
    } else {
      const args = `--check --config=${SCALAFIX_CONF} ${files.map(f => `--files=${f}`).join(' ')}`;
      out += sbt(root, `scalafix ${args}; Test/scalafix ${args}`);
    }
    const wanted = new Set(files.map(f => fs.realpathSync(f)));
    const seen = new Set();
    return parse(out)
      .map(f => ({ ...f, file: fs.existsSync(f.file) ? fs.realpathSync(f.file) : f.file }))
      .filter(f => wanted.has(f.file))
      .filter(f => { const k = `${f.file}:${f.line}:${f.rule}`; return !seen.has(k) && seen.add(k); });
  },
  parse,
};
