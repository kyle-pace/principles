#!/usr/bin/env node
// Third-party check: fails if any built page loads a script, stylesheet, font,
// image, frame or media file from a host that isn't allowed.
//
// Usage:
//   node third-party.mjs <build-dir> [--allow host,host] [--allow-file path]
//
// Allowed hosts come from allowed-hosts.txt next to this file, plus any given
// with --allow or --allow-file. Entries can be exact ("cdn.amplitude.com") or
// wildcards ("*.amplitude.com"). Hosts in blocked-hosts.txt always fail, even
// if a wildcard would allow them (Google Fonts, ad and tracking scripts).
//
// It reads .html and .css files only (tags that load something, inline
// styles, url() and @import). Requests made from JavaScript at runtime, like
// analytics or API calls, aren't covered: those go through each project's one
// module per outside service.
//
// No dependencies, so it runs anywhere Node 18+ does.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readList(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean);
}

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--allow'));
if (!dir || !existsSync(dir)) {
  console.error('Usage: node third-party.mjs <build-dir> [--allow host,host] [--allow-file path]');
  process.exit(2);
}

const allowed = readList(join(here, 'allowed-hosts.txt'));
const blocked = readList(join(here, 'blocked-hosts.txt'));
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow' && args[i + 1]) {
    allowed.push(...args[i + 1].split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
  }
  if (args[i] === '--allow-file' && args[i + 1]) allowed.push(...readList(args[i + 1]));
}

function matches(host, pattern) {
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1)) || host === pattern.slice(2);
  return host === pattern;
}

function verdict(host) {
  if (blocked.some((p) => matches(host, p))) return 'blocked';
  if (allowed.some((p) => matches(host, p))) return 'ok';
  return 'not allowed';
}

function hostOf(url) {
  const u = url.trim();
  if (!/^(https?:)?\/\//i.test(u)) return null; // relative, data:, blob: and so on
  try {
    return new URL(u.startsWith('//') ? `https:${u}` : u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Link rel values that make the browser fetch something.
const LOADING_RELS = /\b(stylesheet|preload|modulepreload|prefetch|icon|apple-touch-icon|manifest|mask-icon)\b/i;

function urlsInCss(css) {
  const found = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) found.push(m[2]);
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) found.push(m[2]);
  return found;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

function urlsInHtml(html) {
  const found = [];
  for (const m of html.matchAll(/<(script|img|iframe|source|video|audio|track|embed|input|link)\b[^>]*>/gi)) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    if (name === 'link') {
      const rel = attr(tag, 'rel') || '';
      if (LOADING_RELS.test(rel)) found.push(attr(tag, 'href'));
      continue;
    }
    found.push(attr(tag, 'src'), attr(tag, 'poster'));
    const srcset = attr(tag, 'srcset');
    if (srcset) found.push(...srcset.split(',').map((s) => s.trim().split(/\s+/)[0]));
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) found.push(...urlsInCss(m[1]));
  for (const m of html.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)) found.push(...urlsInCss(m[2] ?? m[3]));
  return found.filter(Boolean);
}

function* walk(path) {
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(path, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(html?|css)$/i.test(entry)) yield full;
  }
}

const problems = new Map(); // host -> { verdict, files: Set }
let fileCount = 0;
for (const file of walk(dir)) {
  fileCount++;
  const text = readFileSync(file, 'utf8');
  const urls = file.endsWith('.css') ? urlsInCss(text) : urlsInHtml(text);
  for (const url of urls) {
    const host = hostOf(url);
    if (!host) continue;
    const v = verdict(host);
    if (v === 'ok') continue;
    if (!problems.has(host)) problems.set(host, { verdict: v, files: new Set() });
    problems.get(host).files.add(relative(dir, file));
  }
}

if (problems.size === 0) {
  console.log(`Third-party check passed: ${fileCount} files, every outside host is allowed.`);
  process.exit(0);
}

console.error(`Third-party check failed: ${problems.size} host(s) loaded from ${dir}\n`);
for (const [host, { verdict: v, files }] of problems) {
  const list = [...files];
  console.error(`  ${host} (${v})`);
  for (const f of list.slice(0, 5)) console.error(`    ${f}`);
  if (list.length > 5) console.error(`    ...and ${list.length - 5} more`);
}
console.error(
  '\nSelf-host the file instead, or, if Kyle agrees the host is needed, add it to this project\'s allowlist.',
);
process.exit(1);
