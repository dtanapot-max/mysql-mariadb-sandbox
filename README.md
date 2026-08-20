# AI Database Sandbox

[![Node Regression](https://github.com/dtanapot-max/ai-database-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/dtanapot-max/ai-database-sandbox/actions/workflows/ci.yml)
[![Final Verification](https://github.com/dtanapot-max/ai-database-sandbox/actions/workflows/final-verify.yml/badge.svg)](https://github.com/dtanapot-max/ai-database-sandbox/actions/workflows/final-verify.yml)

**In-browser virtual MySQL/MariaDB behavioral sandbox for AI agents, testing, simulation, and automated verification. Powered by Core 1.2.**

This project does **not** run or connect to a real MySQL/MariaDB server. It implements a tested behavioral subset for development, automated tests, demos and AI-assisted workflows.

## Current status

- Core baseline: `CoreEngine 1.2.0-r8-p1` (kept unchanged)
- Merged Candidate baseline: **56/56 Node tests PASS**
- Long-run baseline: **21,004 operations / 0 unexpected failures**
- Evidence audit: **PASS**
- Browser IndexedDB reload: baseline evidence is still `NOT_TESTED` until GitHub Actions or a real local browser run passes
- Project state: **Merged AI-First RC3 — browser gate pending**

Do not interpret this project as 100% MySQL/MariaDB compatible. Read `evidence/capability-manifest.json` for the exact tested feature set.


## AI / coding-agent quick path

AI agents should not crawl the repository blindly. Start with:

```text
AGENTS.md
→ ai-manifest.json
→ evidence/capability-manifest.json
→ docs/AI-USAGE.md
→ evidence/FINAL-STATUS.json
```

For agent/headless database operations, prefer `sandbox/ai-sandbox-api.js` over DOM automation. The root `llms.txt` provides a compact LLM-oriented repository index, and `.github/copilot-instructions.md` carries the same core rules into GitHub Copilot.

The core rule for AI consumers is **Evidence > Assumption**: never infer support for a capability marked `PARTIAL`, `NOT_SUPPORTED`, or `NOT_TESTED`.

## What it provides

- Database/Table/Field/Row browser UI
- CREATE/DROP DATABASE, USE, CREATE/ALTER/DROP TABLE
- INSERT, SELECT, UPDATE, DELETE
- WHERE, AND/OR, ORDER BY, LIMIT/OFFSET
- PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT, AUTO_INCREMENT
- INNER JOIN and LEFT JOIN behavioral subset
- BEGIN / COMMIT / ROLLBACK / SAVEPOINT transaction subset
- Runtime PRIMARY/UNIQUE indexes with indexed point lookup
- Memory and IndexedDB storage adapters
- Snapshot / restore / reset
- SQL import/export
- Structured AI-readable evidence
- AI Control API for headless tests and scenarios
- Golden scenarios, adversarial tests, transaction/security tests, long-run tests and best/worst benchmarks
- GitHub Actions verification and Playwright browser persistence gate


## Verified SQL/schema subset

Verified data types in the current subset:

```text
INT / INTEGER / BIGINT / TINYINT
VARCHAR / TEXT / DECIMAL
BOOLEAN / BOOL
DATE / DATETIME
```

Verified constraints include `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `DEFAULT`, and `AUTO_INCREMENT`. Runtime hash indexes are derived for verified PRIMARY/UNIQUE equality lookups; this is **not** a claim that every query is O(1). Transaction support is a journal-based rollback/savepoint subset, not full MySQL ACID/isolation semantics.

## Engine hardening merged

This candidate selectively incorporates verified hardening ideas from an external review without replacing the Core 1.2 integration, Database Manager UI, AI Control API, evidence model, or browser verification architecture. New transaction/security tests import `sandbox/virtual-db.js` directly; no duplicate engine implementation is embedded in the test suite.

Transaction support is a tested sandbox subset, not a claim of full MySQL transactional/isolation semantics. Statement-level atomic rollback remains part of the engine safety model.

## Quick start

### Browser UI

On Windows, double-click:

```text
run.bat
```

Or with Node:

```bash
node tools/static-server.js 4173
```

Then open `http://127.0.0.1:4173`.

### Node regression

No runtime dependency is required for the engine tests:

```bash
npm test
```

### Full Node verification

```bash
npm run verify:node
```

### Real browser / IndexedDB verification

Install the browser-test dependency and Chromium once:

```bash
npm install
npx playwright install chromium
npm run test:browser
```

The browser gate verifies:

```text
Core boot
→ create database/table/row
→ IndexedDB save
→ destroy Core
→ real page reload
→ create a new Core instance
→ IndexedDB load
→ verify persisted row
```

### Full final verification

```bash
npm run verify:final
```

On Windows you can also run `RUN-FINAL-VERIFY.bat`.

## AI Control API

The browser/global API exposes `VirtualDBAI.createAISandbox(db)` and does not depend on DOM operations.

```js
const ai = VirtualDBAI.createAISandbox(db);

const result = await ai.execute(
  "SELECT * FROM users WHERE id = 1"
);

const report = await ai.runScenario('crud', [
  {
    sql: "INSERT INTO users (email) VALUES ('a@test')",
    expect: { affectedRows: 1 }
  },
  {
    sql: "SELECT id,email FROM users WHERE id = 1",
    expect: { rowCount: 1 }
  }
]);

console.log(ai.health());
console.log(ai.exportReport());
```

Before an AI agent generates SQL or assertions, it should read:

```text
evidence/capability-manifest.json
```

Unsupported features are explicit rather than guessed.

## Repository layout

```text
core/                 Frozen Core 1.2 baseline used by this candidate
sandbox/              Virtual DB engine + AI Control API
ui/                   Database Manager UI
scenarios/            Golden deterministic scenarios
tests/                Unit/adversarial/automation/browser/benchmark tests
evidence/             Current baseline machine-readable evidence
docs/                 Architecture, AI usage and testing notes
tools/                Local static server
.github/workflows/     CI, final browser verification and GitHub Pages
```

## Evidence

Important baseline artifacts include:

- `evidence/FINAL-STATUS.json`
- `evidence/progress.json`
- `evidence/capability-manifest.json`
- `evidence/sandbox-summary.json`
- `evidence/sandbox-compatibility.json`
- `evidence/benchmark.json`
- `evidence/long-run.json`
- `evidence/evidence-audit.json`
- `evidence/browser-test-status.json`

CI regenerates evidence; GitHub Actions uploads the resulting evidence as workflow artifacts.

## GitHub Pages

The included Pages workflow can publish the browser UI from this repository. In repository **Settings → Pages**, select **GitHub Actions** as the source if GitHub does not enable it automatically.

Expected Pages URL:

```text
https://dtanapot-max.github.io/ai-database-sandbox/
```

## Scope and limitations

This is a **MySQL/MariaDB behavioral subset for sandbox testing**, not a SQL server and not a network/database security boundary. Features marked `NOT_SUPPORTED`, `PARTIAL` or `NOT_TESTED` in the capability/compatibility evidence must not be treated as verified MySQL behavior.

Performance numbers are regression baselines for this JavaScript sandbox. They are not intended as comparisons against real MySQL/MariaDB engines.

## Core baseline

The bundled Core file identifies itself as `CoreEngine v1.2.0` and runtime version `1.2.0-r8-p1`. The Virtual DB engine, AI API and UI are external to Core.

## License

Licensed under the **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. See `LICENSE` and `LICENSE-NOTICE.md`.
