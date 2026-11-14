# Principles

How Kyle builds things, written for whichever coding agent is doing the work: Claude Code, Codex, Cursor, Copilot or anything else that reads [AGENTS.md](https://agents.md).

The short version: accessibility first, privacy right behind it, every screen size from day one, Atkinson Hyperlegible everywhere, a small default stack (Amplitude, Firebase, Cloudflare), and nothing third-party without asking. The full text is [`principles.md`](principles.md).

## What's here

| Path | What it is |
| --- | --- |
| `principles.md` | The principles. This is the one file to edit. Lines and sections can be marked web-only or Apple-only (see below). |
| `skills/` | Shared skills, copied into each project's `.agents/skills/`: `share-card` (the dark-mode Open Graph image every new page gets), `page-check` (the `npm run check` command: axe, sideways scrolling, JavaScript weight, screenshots) and `bump-kp-design` (rolling a design system change out to every site). `skills/platforms.json` says which platforms each one is for. |
| `checks/third-party.mjs` | Fails if a built page loads scripts, styles, fonts or images from a host that isn't allowed. Lists live in `checks/allowed-hosts.txt` and `checks/blocked-hosts.txt`. |
| `checks/stack.mjs` | Fails if a site or app has no Amplitude, if Firebase Analytics is included, if a Firebase config file is for a bundle ID the app doesn't have, or if Firestore rules are open. A project with a real reason to have no analytics says so in `.agents/stack.json`. |
| `scripts/sync.mjs` | Copies the principles into a project's `AGENTS.md` and the skills into `.agents/skills/`, keeping only what applies to the project's platforms. |
| `.github/workflows/` | Reusable workflows projects call: `sync.yml` and `check.yml`. |
| `template/` | The one file a project needs to opt in. |

## How it works

Agents only read files inside the repo they're working in, so each project keeps its own copy of the principles. This repo is where they're edited.

1. Edit `principles.md` here and push.
2. Each project's `Principles` workflow runs daily (or on demand from its Actions tab), pulls this repo, and rewrites the block between the `BEGIN principles` and `END principles` markers in its `AGENTS.md`. Everything outside the markers belongs to the project and is never touched.
3. On every push and pull request, the same workflow builds the project, runs the third-party check and the stack check, and runs the project's own `npm run check` if it has one.

No tokens or secrets are needed: this repo is public, and each project commits to itself with its own built-in token.

## Adding a project

1. Copy `template/.github/workflows/principles.yml` into the project and set `output-dir` to wherever its build writes the site. For an app with no website, leave `output-dir` out and set `install-command` and `build-command` to `''`: it gets the stack check alone.
2. Run the sync once, either from the project's Actions tab or locally:
   ```sh
   git clone https://github.com/kyle-pace/principles /tmp/principles
   node /tmp/principles/scripts/sync.mjs . --platforms web
   ```
   Use `web`, `apple` or `web,apple`. The choice is saved in the first line of the principles block in `AGENTS.md`, so the daily sync keeps it. Leave the flag off and the project gets everything.
3. For a website, set up the check command: follow `.agents/skills/page-check/SKILL.md`.
4. Fill in the `## This project` section of `AGENTS.md`: what it is, how to build and test it, and anything that overrides a default.
5. If the project has a `CLAUDE.md`, make it a single line, `@AGENTS.md`, and move anything else in it into `AGENTS.md`. When both files exist, Claude Code reads only `CLAUDE.md`, so the import is what makes it see the principles.

## Web-only and Apple-only rules

A website doesn't need the SwiftUI rules and an app doesn't need the CSS ones, so `principles.md` marks what's specific to a platform, and the sync leaves out what a project doesn't need:

```md
- A rule for everyone.
- A rule only websites get. <!-- web -->
- A rule only Apple apps get. <!-- apple -->

<!-- apple -->

### A whole section only Apple apps get

<!-- /apple -->
```

A mark at the end of a line covers that line. A mark on a line of its own covers everything up to its closing mark. The marks are HTML comments, so they don't show when the file is read on GitHub or on kylepace.dev's How I build page, which shows the whole thing.

## When the third-party check fails

It names each host and the files that load from it. The fix is almost always to self-host the file: fonts through `@fontsource`, libraries through npm or a pinned copy in `vendor/` (see `scripts/update-vendor.sh` in cuisine-explorer for an example).

If a host really is needed, Kyle approves it for that one project, and it goes in the project's `.agents/allowed-hosts.txt`, one host per line with a note. Image hosts for the content being shown (a recipe site's own photos, say) can be added without asking, loaded with no referrer, as long as the note says why and Kyle hears about it (see "Self-host everything" in `principles.md`):

```
# Cookbook cover images on cuisine pages. Approved by Kyle, 2026-11-08.
covers.openlibrary.org
```

The check picks that file up automatically. Only add a host to `checks/allowed-hosts.txt` here if every project should be able to use it.

The check reads HTML and CSS. Hosts that JavaScript calls at runtime (images, APIs) aren't covered automatically, but they still need Kyle's approval and still go in the same file, so it stays the full list of what a project talks to.
