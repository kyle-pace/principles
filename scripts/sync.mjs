#!/usr/bin/env node
// Copies the principles into a project.
//
// Usage: node scripts/sync.mjs <project-dir>
//
// - Writes principles.md into the project's AGENTS.md, between the BEGIN/END
//   markers. Everything outside the markers is the project's own and is left
//   alone. If AGENTS.md has no markers, the block goes at the top; if there's
//   no AGENTS.md, one is created.
// - Copies each skill in skills/ to the project's .agents/skills/, replacing
//   those skill folders only (the project's own skills are left alone).
// - Warns if the project has a CLAUDE.md that doesn't import AGENTS.md, since
//   Claude Code reads CLAUDE.md instead of AGENTS.md when both exist.
//
// No dependencies; Node 18+.

import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.argv[2];
if (!project || !existsSync(project)) {
  console.error('Usage: node scripts/sync.mjs <project-dir>');
  process.exit(2);
}

const BEGIN =
  '<!-- BEGIN principles: synced from github.com/kyle-pace/principles. Edit them there; changes made here are overwritten. -->';
const END = '<!-- END principles -->';

const principles = readFileSync(join(root, 'principles.md'), 'utf8').trim();
const block = `${BEGIN}\n\n${principles}\n\n${END}`;

const agentsPath = join(project, 'AGENTS.md');
const before = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : null;
let after;
if (before === null) {
  after = `${block}\n\n## This project\n\nAdd what's specific to this project here: what it is, how to build and test it, and anything that overrides a default above.\n`;
} else {
  const start = before.indexOf('<!-- BEGIN principles');
  const end = before.indexOf(END);
  if (start !== -1 && end > start) {
    after = before.slice(0, start) + block + before.slice(end + END.length);
  } else {
    after = `${block}\n\n${before.trimStart()}`;
  }
}

let changed = false;
if (after !== before) {
  writeFileSync(agentsPath, after);
  changed = true;
  console.log(before === null ? 'Created AGENTS.md' : 'Updated the principles in AGENTS.md');
}

const skillsDir = join(root, 'skills');
for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!skill.isDirectory()) continue;
  const from = join(skillsDir, skill.name);
  const to = join(project, '.agents', 'skills', skill.name);
  const old = existsSync(join(to, 'SKILL.md')) ? readFileSync(join(to, 'SKILL.md'), 'utf8') : null;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  if (old !== readFileSync(join(to, 'SKILL.md'), 'utf8')) {
    changed = true;
    console.log(`Updated skill: ${skill.name}`);
  }
}

const claudePath = join(project, 'CLAUDE.md');
if (existsSync(claudePath) && !readFileSync(claudePath, 'utf8').includes('@AGENTS.md')) {
  console.warn(
    'Warning: CLAUDE.md exists but doesn\'t import AGENTS.md, so Claude Code won\'t see the principles. Add a line "@AGENTS.md" to CLAUDE.md.',
  );
}

console.log(changed ? 'Done.' : 'Already up to date.');
