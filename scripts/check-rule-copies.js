#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n').trim();
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

const agents = read('AGENTS.md');
const canonical = agents.replace(/\n\n\(Yes, this file also applies[\s\S]*?\)$/, '').trim();

// Compact copies: same body as AGENTS.md, host-specific frontmatter stripped.
const copies = [
  ['.cursor/rules/greybeard.mdc', stripFrontmatter],
  ['.windsurf/rules/greybeard.md', text => text.trim()],
  ['.clinerules/greybeard.md', text => text.trim()],
  ['.agents/rules/greybeard.md', text => text.trim()],
  ['.qoder/rules/greybeard.md', text => text.trim()],
  ['.github/copilot-instructions.md', text => text.trim()],
  ['.kiro/steering/greybeard.md', stripFrontmatter],
];

let failed = false;

for (const [relPath, normalize] of copies) {
  const actual = normalize(read(relPath));
  if (actual !== canonical) {
    console.error(`${relPath} drifted from AGENTS.md`);
    failed = true;
  }
}

// SKILL.md is the runtime source of truth and is longer than the compact body,
// so it cannot be byte-compared. greybeard: canary, not full equality. Assert the
// load-bearing rules survive verbatim in both the source and AGENTS.md. Changing
// a rule's wording trips this, which is the reminder to propagate it everywhere.
// Upgrade path: generate the copies from SKILL.md if this ever misses a real drift.
const INVARIANTS = [
  'in this codebase',                      // ladder rung: reuse what already exists (#217)
  'grep every caller',                     // root-cause bug fix (#245)
  'never about the change itself',         // scope: callers, tests and fixtures the change breaks
  'shortcut: <the limit>, <when to upgrade>',   // shortcut marker comment
  'correct on edge cases',                 // robust-variant rule
  'Lazy code without its check is unfinished', // test reflex
  'lawful instance or combinator',         // FP ladder rung between stdlib and new code
  "parse, don't validate",                 // domain types count as the minimal solution
  'Errors are values',                     // no throw/null/mutation in domain code
  'cheapest place nobody can skip',        // law-enforcement ladder
  '.algebra/<module>.algebra.md',          // the IR is required for model changes
  "add it only on the user's yes",          // project lint rules need consent
  'Project instructions and project skills', // project skills win over profiles
  // the "never cut" carve-outs: pin each so a reword in either file can't silently drop one.
  'validation at trust boundaries',
  'prevents data loss',
  'security',
  'accessibility',
];

const skill = read('skills/greybeard/SKILL.md');
const sources = [['skills/greybeard/SKILL.md', skill], ['AGENTS.md', agents]];
for (const phrase of INVARIANTS) {
  for (const [label, text] of sources) {
    if (!text.includes(phrase)) {
      console.error(`${label} is missing rule invariant: "${phrase}"`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('Update the copied rule text, AGENTS.md, or SKILL.md so the shared rules match.');
  process.exit(1);
}

console.log(`Rule copies match AGENTS.md; ${INVARIANTS.length} rule invariants present in SKILL.md and AGENTS.md.`);
