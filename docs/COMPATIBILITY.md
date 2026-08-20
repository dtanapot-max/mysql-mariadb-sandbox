# Compatibility policy

The project uses four compatibility states:

- `PASS` — behavior is implemented and covered by current tests.
- `PARTIAL` — only a documented subset is implemented.
- `NOT_SUPPORTED` — the sandbox rejects/does not implement the feature.
- `NOT_TESTED` — implementation or environment verification is incomplete.

The machine-readable source of truth is `evidence/capability-manifest.json` plus `evidence/sandbox-compatibility.json`.

A SQL statement failing with an expected validation error can still mean the corresponding compatibility behavior is `PASS`; expected database failures and unexpected engine failures are tracked separately.

## Transaction subset

Verified by production-engine tests: `BEGIN` / `START TRANSACTION`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `ROLLBACK TO SAVEPOINT`, and `RELEASE SAVEPOINT`. Full isolation levels, locking/deadlocks, XA, and server/network transaction behavior are outside scope unless separately listed in the generated capability manifest.
