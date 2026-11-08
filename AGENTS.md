# Working on this repo

This repo holds Kyle's development principles and the tooling that copies them into his other projects. See README.md for how it fits together.

- `principles.md` is the source text. It's inserted into other projects' AGENTS.md files, so it starts at `##` headings and refers to "the project's section" rather than to this repo. Keep it short: roughly a page, and only rules an agent can act on.
- Every change here reaches every project within a day. Before pushing a change to `scripts/sync.mjs` or `checks/`, run them against a real project (for example a local clone of kylepace.net) and confirm the output.
- The scripts have no dependencies and run on plain Node 18+. Keep it that way.
- Don't add hosts to `checks/allowed-hosts.txt` without Kyle asking for it.
