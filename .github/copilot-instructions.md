# GitHub Copilot instructions

This repository implements a JavaScript **MySQL/MariaDB behavioral subset for sandbox testing**, not a real database server.

Before editing code:

1. Read `AGENTS.md`.
2. Read `ai-manifest.json`.
3. Read `evidence/capability-manifest.json`.

Prefer `sandbox/ai-sandbox-api.js` for agent/headless operations. Do not manipulate UI DOM state to bypass the database engine.

Keep `core/core-1.2.0-r8-p1.js` unchanged unless a task explicitly requires a Core change.

Never infer support for SQL that is marked `PARTIAL`, `NOT_SUPPORTED`, or `NOT_TESTED`.

For behavior changes, add a deterministic test and run `npm test`. When capability/evidence changes, also run `npm run evidence && npm run evidence:audit`.

Expected SQL failures can be valid passing scenarios. Do not treat an expected database error as an engine failure when assertions expect it.

Do not claim production MySQL compatibility. Use the project wording: "MySQL/MariaDB behavioral subset for sandbox testing."
