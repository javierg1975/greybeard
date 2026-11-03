#!/usr/bin/env node
// Generate the OpenClaw / ClawHub skill package (.openclaw/skills/) from the
// canonical skills/. OpenClaw skills are SKILL.md (frontmatter + body), the same
// format greybeard already uses, with one difference: `description` must be a
// single line under 160 chars. The canonical descriptions are long (tuned for
// Claude's skill picker), so each ships a short one here. The body is copied
// verbatim from skills/<name>/SKILL.md so the ruleset never drifts; only the
// frontmatter is rewritten.
//
// Run:  node scripts/build-openclaw-skills.js
// tests/openclaw-skills.test.js fails if the committed copies are stale.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOMEPAGE = 'https://github.com/javierg1975/greybeard';

const DESCRIPTIONS = {
  'greybeard': 'Lazy senior dev mode for any coding task: the smallest change that fully solves it, and a reply a busy human understands in one read.',
  'greybeard-review': 'Quality review of a diff: bugs, security, real load, missing tests, speed, and what to delete. Each finding says what goes wrong and how to fix it.',
  'greybeard-audit': 'Quality audit of the whole repo: bugs, security, real load, missing tests, speed, and what to delete. Most important first.',
  'greybeard-debt': 'Harvest every shortcut: comment into one debt ledger, so deferrals get tracked instead of forgotten. One-shot report.',
  'greybeard-help': "Quick reference for greybeard's modes, skills, and commands. One-shot display.",
};

const NAMES = Object.keys(DESCRIPTIONS);

function sourceBody(name) {
  const src = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const fm = src.match(/^---\n[\s\S]*?\n---\n?/);
  if (!fm) throw new Error(`skills/${name}/SKILL.md has no frontmatter`);
  return src.slice(fm[0].length);
}

function render(name) {
  const desc = DESCRIPTIONS[name];
  if (desc.length > 160 || desc.includes('\n') || desc.includes('"')) {
    throw new Error(`description for ${name} must be one line, no quotes, under 160 chars`);
  }
  const frontmatter =
    `---\nname: ${name}\ndescription: "${desc}"\nhomepage: ${HOMEPAGE}\nlicense: MIT\n---\n`;
  return frontmatter + sourceBody(name);
}

function outPath(name) {
  return path.join(ROOT, '.openclaw', 'skills', name, 'SKILL.md');
}

module.exports = { DESCRIPTIONS, NAMES, render, outPath, sourceBody };

if (require.main === module) {
  for (const name of NAMES) {
    const p = outPath(name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, render(name));
    console.log('wrote', path.relative(ROOT, p).replace(/\\/g, '/'));
    // Profiles and scripts the skill body points at ship next to it.
    for (const dir of ['references', 'scripts']) {
      const src = path.join(ROOT, 'skills', name, dir);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(path.dirname(p), dir), { recursive: true });
    }
  }
}
