#!/usr/bin/env node
// Copies the principles into a project.
//
// Usage: node scripts/sync.mjs <project-dir> [--platforms web|apple|web,apple]
//
// - principles.md marks some lines and sections as web-only or Apple-only. A
//   project that says which platforms it has gets only what applies to it.
//   Pass --platforms once; the choice is saved in the BEGIN marker of the
//   project's AGENTS.md, so later runs (and the daily workflow) keep it.
//   A project that never chose gets everything.
// - Writes principles.md into the project's AGENTS.md, between the BEGIN/END
//   markers. Everything outside the markers is the project's own and is left
//   alone. If AGENTS.md has no markers, the block goes at the top; if there's
//   no AGENTS.md, one is created.
// - Copies each skill in skills/ to the project's .agents/skills/, replacing
//   those skill folders only (the project's own skills are left alone). Skills
//   listed in skills/platforms.json only go to projects with that platform.
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

const KNOWN = ['web', 'apple'];
const END = '<!-- END principles -->';

const agentsPath = join(project, 'AGENTS.md');
const before = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : null;

// Which platforms this project has: the --platforms flag, else what an earlier
// run saved in the marker ("BEGIN principles (web): ..."), else all of them.
function choosePlatforms() {
  const flag = process.argv.indexOf('--platforms');
  const saved = before?.match(/<!-- BEGIN principles \(([a-z, ]+)\):/)?.[1];
  const raw = flag !== -1 ? process.argv[flag + 1] : saved;
  if (!raw || raw.trim() === 'all') return null;
  const list = raw.split(',').map((name) => name.trim()).filter(Boolean);
  const unknown = list.filter((name) => !KNOWN.includes(name));
  if (unknown.length || !list.length) {
    console.error(`Unknown platform: ${unknown.join(', ') || '(none)'}. Use ${KNOWN.join(', ')} or all.`);
    process.exit(2);
  }
  return KNOWN.filter((name) => list.includes(name));
}
const platforms = choosePlatforms(); // null means everything
const has = (name) => platforms === null || platforms.includes(name);

// Keeps the lines that apply. Two kinds of mark in principles.md:
//   a line ending in <!-- web --> or <!-- apple -->      that one line
//   <!-- web --> ... <!-- /web --> on lines of their own  everything between
// The marks themselves are removed either way.
function forPlatforms(text) {
  const out = [];
  let inside = null;
  for (const line of text.split('\n')) {
    const open = line.match(/^<!-- (web|apple) -->$/);
    const close = line.match(/^<!-- \/(web|apple) -->$/);
    if (open) {
      inside = open[1];
      continue;
    }
    if (close) {
      inside = null;
      continue;
    }
    if (inside && !has(inside)) continue;
    const tag = line.match(/\s*<!-- (web|apple) -->$/);
    if (tag && !has(tag[1])) continue;
    out.push(tag ? line.slice(0, tag.index) : line);
  }
  if (inside) {
    console.error(`principles.md: <!-- ${inside} --> is never closed.`);
    process.exit(1);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const BEGIN = `<!-- BEGIN principles${
  platforms ? ` (${platforms.join(', ')})` : ''
}: synced from github.com/kyle-pace/principles. Edit them there; changes made here are overwritten. -->`;
const principles = forPlatforms(readFileSync(join(root, 'principles.md'), 'utf8'));
const block = `${BEGIN}\n\n${principles}\n\n${END}`;
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
// skills/platforms.json: { "skill-name": ["web"] }. Skills not listed go everywhere.
const skillPlatforms = JSON.parse(readFileSync(join(skillsDir, 'platforms.json'), 'utf8'));
for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!skill.isDirectory()) continue;
  const from = join(skillsDir, skill.name);
  const to = join(project, '.agents', 'skills', skill.name);
  const only = skillPlatforms[skill.name];
  if (only && !only.some(has)) {
    if (existsSync(to)) {
      rmSync(to, { recursive: true, force: true });
      changed = true;
      console.log(`Removed skill (not for this project's platforms): ${skill.name}`);
    }
    continue;
  }
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
