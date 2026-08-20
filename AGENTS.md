# AGENTS.md

## Purpose

This repository is an **AI Database Sandbox**: an in-browser JavaScript virtual database that implements a tested MySQL/MariaDB behavioral subset for development, automated verification, and AI-agent workflows.

It does **not** run or connect to a real MySQL/MariaDB server.

## Source of truth

Before changing or testing the project, read these files in order:

1. `ai-manifest.json` — machine-readable project entrypoint and commands.
2. `evidence/capability-manifest.json` — exact supported/partial/unsupported/not-tested capabilities.
3. `docs/AI-USAGE.md` — AI Control API and scenario examples.
4. `docs/ARCHITECTURE.md` — engine boundaries and Core 1.2 integration.
5. `evidence/FINAL-STATUS.json` — latest verified status.

Source code is authoritative when documentation conflicts with implementation. Do not invent Core 1.2 APIs or SQL behavior.

## Core baseline

- Core runtime: `1.2.0-r8-p1`
- Core file: `core/core-1.2.0-r8-p1.js`
- Treat Core as a baseline dependency. Do not modify it unless the task explicitly requires a Core change.
- Virtual DB, AI API, persistence, UI, and tests live outside Core.

## AI entrypoints

For headless/agent use, prefer the AI Control API in:

- `sandbox/ai-sandbox-api.js`
- global/browser API: `VirtualDBAI.createAISandbox(db)`

Do **not** automate the DOM when the AI Control API can perform the same operation.

Use the UI only when the task is specifically about UI behavior or browser integration.

## Required behavior

Before generating SQL or assertions, inspect `evidence/capability-manifest.json`.

Capability states have strict meanings:

- `PASS` — implemented and verified in the documented scope.
- `PARTIAL` — only the documented subset is verified.
- `NOT_SUPPORTED` — do not attempt or emulate it silently.
- `NOT_TESTED` — never report it as working without new evidence.

Never describe this project as "100% MySQL compatible". Use:

> MySQL/MariaDB behavioral subset for sandbox testing

## Test discipline

When modifying engine behavior:

1. Reproduce the issue.
2. Add or update a deterministic test.
3. Fix the implementation.
4. Run targeted tests.
5. Run full regression.
6. Regenerate/audit evidence when behavior or compatibility changed.

Useful commands:

```bash
npm test
npm run test:coverage
npm run test:ai
npm run benchmark
npm run test:long
npm run evidence
npm run evidence:audit
npm run verify:node
npm run verify:final
```

`verify:final` includes the real-browser IndexedDB gate and requires Playwright/Chromium.

## Evidence rules

**Evidence > Assumption.**

Expected database errors can represent a successful test. For example, an expected `ER_DUP_ENTRY` should pass a scenario when the assertion expects that error.

Do not convert:

- `NOT_TESTED` → `PASS`
- `PARTIAL` → `PASS`
- expected SQL error → engine defect

without evidence.

Important evidence files:

- `evidence/FINAL-STATUS.json`
- `evidence/capability-manifest.json`
- `evidence/sandbox-summary.json`
- `evidence/sandbox-compatibility.json`
- `evidence/evidence-audit.json`
- `evidence/browser-test-status.json`
- `evidence/long-run.json`
- `evidence/benchmark.json`

## Safety and resource limits

This is a test sandbox, not a security boundary. Keep resource limits enabled and preserve abort/cleanup behavior. Tests must not intentionally exhaust the host machine.

Do not add network access, real database credentials, or remote SQL execution as an implicit behavior.

## Pull request / change expectations

A behavior-changing PR should explain:

- capability changed,
- test added/changed,
- regression result,
- evidence impact,
- compatibility impact,
- benchmark impact when relevant.

Do not update Golden Scenarios merely to hide a regression.

## Transaction subset

`BEGIN`, `START TRANSACTION`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `ROLLBACK TO SAVEPOINT`, and `RELEASE SAVEPOINT` are supported only to the level declared PASS by the generated capability manifest and tests. Do not infer MySQL isolation levels, locking, deadlocks, or network/server behavior.
