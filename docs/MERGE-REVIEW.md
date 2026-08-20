# Selective Merge Review

This candidate keeps the AI-first Core 1.2 architecture and selectively merges verified hardening ideas from the external Gemini review.

## Merged

- Transaction journal subset: BEGIN / START TRANSACTION / COMMIT / ROLLBACK.
- SAVEPOINT / ROLLBACK TO SAVEPOINT / RELEASE SAVEPOINT.
- Identifier hardening for `__proto__`, `constructor`, `prototype`, and malformed identifiers.
- Existing runtime PRIMARY/UNIQUE indexes retained and benchmarked as the production implementation.
- Best/worst lookup benchmark matrix and transaction rollback benchmarks.
- Additional adversarial, transaction, security, repository-integrity, and golden-scenario tests.

## Deliberately not copied

- No duplicate `VirtualDBEngine` implementation inside tests.
- No environment-specific absolute working-directory evidence paths.
- No replacement of the Core 1.2 service integration, Database Manager UI, AI Control API, evidence model, GitHub Actions, or Playwright browser gate.
- Gemini placeholder scenarios were not imported as PASS evidence; scenarios in this repository contain executable deterministic steps.

## Verification

Run `npm test`. All transaction/security tests import `sandbox/virtual-db.js` directly. Run `npm run verify:node` for coverage, benchmark, long-run, evidence generation and audit. Browser IndexedDB reload remains a mandatory independent gate and is not converted to PASS without a real browser run.
