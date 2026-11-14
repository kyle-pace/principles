# Working on this repo

This repo holds Kyle's development principles and the tooling that copies them into his other projects. See README.md for how it fits together.

- `principles.md` is the source text. It's inserted into other projects' AGENTS.md files, so it starts at `##` headings and refers to "the project's section" rather than to this repo. Keep it short, and only rules an agent can act on. Mark anything that only applies to websites or to Apple apps (`<!-- web -->`, `<!-- apple -->`; README: "Web-only and Apple-only rules") so each project gets only what it needs, and don't put a mark between two items of the same list on a line of its own.
- Every change here reaches every project within a day. Before pushing a change to `scripts/sync.mjs` or `checks/`, run them against a real project (for example a local clone of kylepace.net) and confirm the output.
- The scripts have no dependencies and run on plain Node 18+. Keep it that way. The one exception is `skills/page-check/check.mjs`, which runs inside a project and uses that project's `playwright` and `axe-core`.
- A procedure with steps (how to add something, how to roll something out) is a skill in `skills/`, not a paragraph in `principles.md`. If it's only for one platform, list it in `skills/platforms.json`.
- Don't add hosts to `checks/allowed-hosts.txt` without Kyle asking for it.
