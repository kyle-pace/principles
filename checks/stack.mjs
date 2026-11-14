#!/usr/bin/env node
// Stack check: is the project using Amplitude and Firebase the way the principles say?
//
// Usage:
//   node stack.mjs <project-dir> [--output-dir <built site>] [--platforms web,apple]
//
// What it fails on:
//   Websites (needs --output-dir, the built site)
//     - no Amplitude anywhere in the built site
//     - Google Analytics or Tag Manager in the built site
//   Apple apps (reads the Xcode project, project.yml or Package.swift)
//     - no Amplitude package
//   Anything that uses Firebase, on either platform
//     - Firebase Analytics is included (Amplitude covers analytics)
//     - a GoogleService-Info plist is for a bundle ID the app doesn't have
//     - Firestore is used with no firestore.rules, or with rules open to everyone
//
// What it only notes: things worth a look that aren't wrong on their own, like a
// production config file that points at a project named "dev".
//
// Firebase is "as needed": a project that doesn't use it passes. A project with a
// real reason to have no analytics says so in .agents/stack.json:
//   { "amplitude": false, "reason": "A design system, not a site." }
//
// Platforms come from --platforms, else from the first line of the principles
// block in AGENTS.md, else from what's in the folder.
//
// It can't see inside Amplitude or Firebase: that IP tracking is off, that the APNs
// key is uploaded, that API keys are restricted. Those still need a person.
//
// No dependencies; Node 18+.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const project = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!project || !existsSync(project)) {
  console.error('Usage: node stack.mjs <project-dir> [--output-dir <built site>] [--platforms web,apple]');
  process.exit(2);
}
const outputDir = option('--output-dir') ? join(project, option('--output-dir')) : null;

const SKIP = new Set(['node_modules', '.git', '.principles-src', '.check', '.astro', '.wrangler', 'DerivedData', 'build', 'Pods', '.build']);
function walk(dir, keep, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(path, keep, found);
    } else if (keep(entry.name, path)) {
      found.push(path);
    }
  }
  return found;
}
const read = (path) => readFileSync(path, 'utf8');
const rel = (path) => relative(project, path) || '.';

const problems = [];
const notes = [];
const passed = [];

const settingsPath = join(project, '.agents', 'stack.json');
const settings = existsSync(settingsPath) ? JSON.parse(read(settingsPath)) : {};
const noAmplitude = settings.amplitude === false;
if (noAmplitude && !settings.reason) problems.push('.agents/stack.json turns Amplitude off without a "reason".');

// Source files, minus the built site (it's checked on its own) and vendored copies.
const outputRel = outputDir ? rel(outputDir) : null;
const sourceFiles = walk(project, (name, path) => {
  if (outputRel && outputRel !== '.' && rel(path).startsWith(outputRel + '/')) return false;
  return /\.(js|mjs|cjs|ts|tsx|jsx|astro|vue|svelte|html|swift|yml|yaml|json|plist|pbxproj|resolved|rules)$/.test(name);
});

const xcodeFiles = sourceFiles.filter((path) => /(^|\/)(project\.yml|Package\.swift|project\.pbxproj)$/.test(path));
const isApple = xcodeFiles.length > 0;

const agentsPath = join(project, 'AGENTS.md');
const marker = existsSync(agentsPath) ? read(agentsPath).match(/<!-- BEGIN principles \(([a-z, ]+)\):/)?.[1] : null;
const chosen = (option('--platforms') ?? marker)?.split(',').map((name) => name.trim());
const web = chosen ? chosen.includes('web') : Boolean(outputDir);
const apple = chosen ? chosen.includes('apple') : isApple;

// Drop comments so a note like "# FirebaseAnalytics: we don't use it" doesn't count as using it.
function code(path) {
  const text = read(path);
  if (/\.ya?ml$/.test(path)) return text.replace(/(^|\s)#.*$/gm, '');
  if (/\.(swift|js|mjs|cjs|ts|tsx|jsx)$/.test(path)) return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return text;
}

// ---- Websites: what the built site ships ----
if (web && outputDir) {
  if (!existsSync(outputDir)) {
    problems.push(`The built site isn't at ${rel(outputDir)}. Build first.`);
  } else {
    const built = walk(outputDir, (name) => /\.(html|js|mjs)$/.test(name));
    const using = (pattern) => built.filter((path) => pattern.test(read(path)));

    const amplitude = using(/\bapi2?\.amplitude\.com|\bapi\.eu\.amplitude\.com|cdn\.amplitude\.com/);
    if (noAmplitude) {
      notes.push(`Amplitude is turned off for this project: ${settings.reason ?? '(no reason given)'}`);
    } else if (amplitude.length) {
      passed.push('The site ships Amplitude.');
    } else {
      problems.push(
        'No Amplitude in the built site. Product analytics is Amplitude, set up the private way (kp-design\'s startAnalytics does it). If this project really has no analytics, say why in .agents/stack.json.',
      );
    }

    const google = using(/google-analytics\.com|googletagmanager\.com|\bgtag\(/);
    if (google.length) {
      problems.push(`Google Analytics or Tag Manager is in the built site (${google.slice(0, 3).map(rel).join(', ')}). Amplitude is the only analytics tool.`);
    } else {
      passed.push('No Google Analytics or Tag Manager.');
    }
  }
} else if (web) {
  notes.push('No --output-dir, so the built site was not checked for Amplitude.');
}

// ---- Apple apps: what the project links ----
if (apple) {
  if (!isApple) {
    notes.push('Marked as an Apple project, but no Xcode project, project.yml or Package.swift was found.');
  } else if (noAmplitude) {
    notes.push(`Amplitude is turned off for this project: ${settings.reason ?? '(no reason given)'}`);
  } else if (xcodeFiles.some((path) => /amplitude/i.test(code(path)))) {
    passed.push('The app links Amplitude.');
  } else {
    problems.push('No Amplitude package in the app. Product analytics is Amplitude (Amplitude-Swift), asked for before anything is sent.');
  }
}

// ---- Firebase, wherever it's used ----
const packages = sourceFiles.filter((path) => basename(path) === 'package.json');
const webFirebase = packages.some((path) => {
  const pkg = JSON.parse(read(path));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((name) => /^(firebase|firebase-admin|@firebase\/.+|@react-native-firebase\/.+)$/.test(name));
});
const appleFirebase = xcodeFiles.some((path) => /firebase-ios-sdk|Firebase[A-Z]\w+/.test(code(path)));
const plists = sourceFiles.filter((path) => /GoogleService-Info.*\.plist$/.test(path));

if (!webFirebase && !appleFirebase && !plists.length) {
  passed.push('Firebase isn\'t used here (fine: it\'s only for projects that need it).');
} else {
  // Firebase Analytics stays off.
  const analyticsIn = [
    ...xcodeFiles.filter((path) => /\bFirebaseAnalytics\w*\b/.test(code(path))),
    ...sourceFiles.filter(
      (path) => /\.(js|mjs|cjs|ts|tsx|jsx|astro|vue|svelte|html)$/.test(path) && /firebase\/analytics|@react-native-firebase\/analytics|\bgetAnalytics\(/.test(code(path)),
    ),
    ...packages.filter((path) => /"@react-native-firebase\/analytics"/.test(read(path))),
  ];
  if (analyticsIn.length) {
    problems.push(`Firebase Analytics is included (${[...new Set(analyticsIn)].slice(0, 3).map(rel).join(', ')}). It stays off; Amplitude covers analytics.`);
  } else {
    passed.push('Firebase is used, and Firebase Analytics is not included.');
  }

  // Each config file is for a bundle ID the app really has.
  if (plists.length) {
    const ids = new Set();
    for (const path of xcodeFiles) {
      for (const [, id] of code(path).matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*[:=]\s*"?([^\s";]+)"?/g)) ids.add(id);
    }
    // "app.henwood$(BUNDLE_ID_SUFFIX)" matches app.henwood and app.henwood.dev.
    const matchers = [...ids].map((id) => {
      const pattern = id
        .split(/\$\([^)]*\)|\$\{[^}]*\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[A-Za-z0-9.-]*');
      return new RegExp(`^${pattern}$`);
    });
    const value = (text, key) => text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1];
    for (const path of plists) {
      const text = read(path);
      const bundle = value(text, 'BUNDLE_ID');
      const firebaseProject = value(text, 'PROJECT_ID');
      if (!bundle) {
        problems.push(`${rel(path)} has no BUNDLE_ID.`);
      } else if (matchers.length && !matchers.some((matcher) => matcher.test(bundle))) {
        problems.push(`${rel(path)} is for ${bundle}, which isn't one of the app's bundle IDs (${[...ids].join(', ')}). Firebase will refuse the app.`);
      } else {
        passed.push(`${rel(path)} matches a bundle ID (${bundle}).`);
      }
      if (/prod|release/i.test(basename(path)) && /(^|[-_])(dev|test|staging)($|[-_])/i.test(firebaseProject ?? '')) {
        notes.push(`${rel(path)} is the production config but points at the Firebase project "${firebaseProject}". Fine while there is one project; worth a real production project before release.`);
      }
      if (/<key>IS_ANALYTICS_ENABLED<\/key>\s*<true\/>/.test(text)) {
        notes.push(`${rel(path)} has IS_ANALYTICS_ENABLED on. Harmless while Firebase Analytics isn't linked, but turn it off in the Firebase console.`);
      }
    }
  } else if (appleFirebase) {
    notes.push('The app links Firebase but has no GoogleService-Info plist in the repo, so Firebase won\'t start.');
  }

  // Firestore rules deny by default.
  const usesFirestore = sourceFiles.some(
    (path) => /\.(js|mjs|cjs|ts|tsx|jsx|astro|vue|svelte|swift|yml|pbxproj)$/.test(path) && /firebase\/firestore|\bFirebaseFirestore\b|@react-native-firebase\/firestore/.test(code(path)),
  );
  if (usesFirestore) {
    const rules = sourceFiles.filter((path) => basename(path) === 'firestore.rules');
    if (!rules.length) {
      problems.push('Firestore is used but there is no firestore.rules in the repo. Rules deny by default and live in Git.');
    } else if (rules.some((path) => /allow\s+read\s*,\s*write\s*:\s*if\s+true|allow\s+read\s*,\s*write\s*;/.test(read(path)))) {
      problems.push('firestore.rules lets anyone read and write. Lock it down before anything ships.');
    } else {
      passed.push('Firestore rules are in the repo and not open to everyone.');
    }
  }
}

for (const line of passed) console.log(`ok    ${line}`);
for (const line of notes) console.log(`note  ${line}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((line) => `  - ${line}`).join('\n'));
  process.exit(1);
}
console.log('\nStack check passed.');
