# Principles

How Kyle builds things, written for whichever coding agent is doing the work: Claude Code, Codex, Cursor, Copilot or anything else that reads [AGENTS.md](https://agents.md).

The short version: accessibility first, privacy right behind it, every screen size from day one, Atkinson Hyperlegible everywhere, a small default stack (Amplitude, Firebase, Cloudflare), and nothing third-party without asking. The full text is [`principles.md`](principles.md).

## What's here

| Path | What it is |
| --- | --- |
| `principles.md` | The principles. This is the one file to edit. |
| `skills/` | Shared skills, copied into each project's `.agents/skills/`. Right now: `share-card` (the dark-mode Open Graph image every new page gets). |
| `checks/third-party.mjs` | Fails if a built page loads scripts, styles, fonts or images from a host that isn't allowed. Lists live in `checks/allowed-hosts.txt` and `checks/blocked-hosts.txt`. |
| `scripts/sync.mjs` | Copies the principles into a project's `AGENTS.md` and the skills into `.agents/skills/`. |
| `.github/workflows/` | Reusable workflows projects call: `sync.yml` and `check.yml`. |
| `template/` | The one file a project needs to opt in. |

## How it works

Agents only read files inside the repo they're working in, so each project keeps its own copy of the principles. This repo is where they're edited.

1. Edit `principles.md` here and push.
2. Each project's `Principles` workflow runs daily (or on demand from its Actions tab), pulls this repo, and rewrites the block between the `BEGIN principles` and `END principles` markers in its `AGENTS.md`. Everything outside the markers belongs to the project and is never touched.
3. On every push and pull request, the same workflow builds the project and runs the third-party check.

No tokens or secrets are needed: this repo is public, and each project commits to itself with its own built-in token.

## Adding a project

1. Copy `template/.github/workflows/principles.yml` into the project and set `output-dir` to wherever its build writes the site. For an app with no web build, delete the `checks` job.
2. Run the sync once, either from the project's Actions tab or locally:
   ```sh
   git clone https://github.com/kyle-pace/principles /tmp/principles
   node /tmp/principles/scripts/sync.mjs .
   ```
3. Fill in the `## This project` section of `AGENTS.md`: what it is, how to build and test it, and anything that overrides a default.
4. If the project has a `CLAUDE.md`, make it a single line, `@AGENTS.md`, and move anything else in it into `AGENTS.md`. When both files exist, Claude Code reads only `CLAUDE.md`, so the import is what makes it see the principles.

## When the check fails

It names each host and the files that load from it. The fix is almost always to self-host the file: fonts through `@fontsource`, libraries through npm or a pinned copy in `vendor/` (see `scripts/update-vendor.sh` in cuisine-explorer for an example).

If a host really is needed, Kyle approves it for that one project, and it goes in the project's `.agents/allowed-hosts.txt`, one host per line with a note. Image hosts for the content being shown (a recipe site's own photos, say) can be added without asking, loaded with no referrer, as long as the note says why and Kyle hears about it (see "Self-host everything" in `principles.md`):

```
# Cookbook cover images on cuisine pages. Approved by Kyle, 2026-11-08.
covers.openlibrary.org
```

The check picks that file up automatically. Only add a host to `checks/allowed-hosts.txt` here if every project should be able to use it.

The check reads HTML and CSS. Hosts that JavaScript calls at runtime (images, APIs) aren't covered automatically, but they still need Kyle's approval and still go in the same file, so it stays the full list of what a project talks to.
