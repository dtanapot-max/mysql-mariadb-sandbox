# AI Usage

This repository is designed so an AI agent can inspect capabilities, execute deterministic database scenarios, assert outcomes, and export evidence without depending on the UI DOM.

## AI reading order

Read these before generating SQL or test assertions:

1. `AGENTS.md`
2. `ai-manifest.json`
3. `evidence/capability-manifest.json`
4. `evidence/FINAL-STATUS.json`
5. this document

Treat the engine as a MySQL/MariaDB **behavioral subset**, not a full server. A capability marked `PARTIAL`, `NOT_SUPPORTED`, or `NOT_TESTED` must not be treated as fully verified.

## Preferred control surface

Use `sandbox/ai-sandbox-api.js` for agent/headless work. Browser/global usage exposes:

```js
VirtualDBAI.createAISandbox(db)
```

The AI control surface supports execution, batches, scenarios/assertions, state inspection, health, capabilities, snapshots, restore/reset, safe persistence, and evidence export.

Do not automate UI clicks when the same operation is available through the AI API. UI automation is reserved for browser/UI regression tests.


## Verified AI Control API surface

The current public AI wrapper exposes these methods. Use these exact names; do not infer aliases from prose or third-party reviews.

| Method | Purpose |
|---|---|
| `execute(sql, opts)` | Execute one SQL statement and return structured success/error evidence. |
| `executeBatch(statements, opts)` | Execute a bounded array of SQL statements. |
| `runScenario(name, steps, opts)` | Execute deterministic multi-step scenarios with assertions. |
| `inspect()` | Return database/table/column/row-count state summary. |
| `health()` | Return engine/evidence health summary. |
| `capabilities()` | Return tested capabilities, limits, and compatibility state. |
| `assertResult(actual, expect)` | Validate structured AI API results. |
| `exportReport()` | Export AI-readable state + evidence report. |
| `begin()` / `commit()` / `rollback()` | Transaction subset controls. |
| `savepoint(name)` / `releaseSavepoint(name)` | Savepoint subset controls. |
| `transactionStatus()` | Inspect current transaction state. |
| `snapshot()` / `restore()` / `reset()` | Sandbox state controls. |
| `save()` / `saveSafe()` / `load()` | Persistence controls through Core storage. |

The engine underneath also exposes `query()`, evidence/capability accessors, snapshots, persistence, and transaction primitives. The AI wrapper is preferred for agent workflows because it normalizes errors into structured results.

## Minimal agent workflow

```js
const ai = VirtualDBAI.createAISandbox(db);

const health = ai.health();
const capabilities = ai.capabilities();

const result = await ai.execute(`
  CREATE DATABASE demo;
`);

const report = await ai.runScenario('basic-crud', [
  { sql: 'USE demo' },
  {
    sql: 'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(100) UNIQUE NOT NULL)'
  },
  {
    sql: "INSERT INTO users (email) VALUES ('a@example.test')",
    expect: { affectedRows: 1 }
  },
  {
    sql: 'SELECT id,email FROM users WHERE id = 1',
    expect: { rowCount: 1 }
  }
]);

console.log(report);
console.log(ai.exportReport());
```

## Expected failures are valid test outcomes

A failed SQL statement can be an expected successful test outcome. Scenario assertions distinguish expected database failures from unexpected engine failures.

Example:

```js
await ai.runScenario('duplicate-check', [
  {
    sql: "INSERT INTO users (email) VALUES ('a@example.test')",
    expect: {
      ok: false,
      errorCode: 'ER_DUP_ENTRY'
    }
  }
]);
```

If the engine returns the expected `ER_DUP_ENTRY`, that scenario step should PASS.

## Capability discipline

Before generating SQL, read:

```text
evidence/capability-manifest.json
```

Status meanings are strict:

- `PASS`: verified in the documented subset.
- `PARTIAL`: only the documented subset is verified.
- `NOT_SUPPORTED`: do not execute silently or invent behavior.
- `NOT_TESTED`: do not claim it works until new evidence exists.

## Evidence for AI decisions

Prefer machine-readable evidence over prose assumptions:

```text
evidence/FINAL-STATUS.json
evidence/capability-manifest.json
evidence/sandbox-summary.json
evidence/sandbox-compatibility.json
evidence/evidence-audit.json
evidence/browser-test-status.json
evidence/benchmark.json
evidence/long-run.json
```

For a behavior-changing code modification, regenerate evidence when appropriate:

```bash
npm test
npm run evidence
npm run evidence:audit
```

For full Node verification:

```bash
npm run verify:node
```

For the real browser/IndexedDB gate:

```bash
npm install
npx playwright install chromium
npm run test:browser
```

For final verification:

```bash
npm run verify:final
```

## AI safety boundaries

- Do not add real database credentials as a default behavior.
- Do not connect to a remote MySQL/MariaDB server implicitly.
- Do not bypass the engine by mutating UI or internal state directly.
- Preserve resource limits, abort behavior, rollback behavior, and bounded evidence retention.
- Do not update Golden Scenarios merely to make a regression pass.
- Never describe the project as 100% MySQL/MariaDB compatible.

Use the project description:

> MySQL/MariaDB behavioral subset for sandbox testing

## Transaction controls

The AI API exposes the verified transaction subset directly:

```js
await ai.begin();
await ai.execute("INSERT INTO users (id) VALUES (1)");
await ai.savepoint("before_change");
await ai.execute("UPDATE users SET id=2 WHERE id=1");
await ai.rollback("before_change");
await ai.commit();

console.log(ai.transactionStatus());
```

These controls simulate tested transaction behavior only. They do not model full MySQL/MariaDB isolation, locking, or deadlock semantics.
